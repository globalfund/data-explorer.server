import {inject} from '@loopback/core';
import {get, param, Request, response, RestBindings} from '@loopback/rest';
import axios, {AxiosResponse} from 'axios';
import _ from 'lodash';
import OPEXCostCompositionFieldsMapping from '../config/mapping/opex/cost-composition.json';
import OPEXEfficiencyFieldsMapping from '../config/mapping/opex/efficiency.json';
import OPEXIndexedTrendsFieldsMapping from '../config/mapping/opex/indexed-trends.json';
import OPEXKeyCostsFieldsMapping from '../config/mapping/opex/key-costs.json';
import OPEXOperatingCostsFieldsMapping from '../config/mapping/opex/operating-costs.json';
import OPEXStatsFieldsMapping from '../config/mapping/opex/stats.json';
import OPEXTableFieldsMapping from '../config/mapping/opex/table.json';
import OPEXYearStatsFieldsMapping from '../config/mapping/opex/year-stats.json';
import urls from '../config/urls/index.json';
import {handleDataApiError} from '../utils/dataApiError';
import {filterFinancialIndicators} from '../utils/filtering/financialIndicators';

type HierarchyNode = {
  name: string;
  children?: HierarchyNode[];
};

type OpexTableItem = {
  name: string;
  [year: number]: {
    actual: number;
    budget: number;
    variance: number;
  };
  _children?: OpexTableItem[];
};

async function getHierarchy(url: string): Promise<HierarchyNode[]> {
  try {
    const response = await axios.get(url);
    const data = response.data.value;
    const hierarchy: Record<string, {children: Record<string, any>}> = {};

    // Walk up through as many parent levels as the API returned
    // (e.g. category.parent, category.parent.parent, ...).
    const getAncestorNames = (category: any): string[] => {
      const names: string[] = [];
      let current = category.parent;
      while (current) {
        names.unshift(current.name);
        current = current.parent;
      }
      return names;
    };

    // Walk down through as many children levels as the API returned
    // (e.g. category.children, category.children[].children, ...).
    const addDescendants = (
      node: {children: Record<string, any>},
      children: any[] | undefined,
    ) => {
      if (!children) return;
      children.forEach((child: any) => {
        if (!node.children[child.name]) {
          node.children[child.name] = {children: {}};
        }
        addDescendants(node.children[child.name], child.children);
      });
    };

    data.forEach((item: any) => {
      const category = item.financialCategory;
      if (!category) return;

      const path = [...getAncestorNames(category), category.name];

      let currentLevel = hierarchy;
      let node: {children: Record<string, any>} | undefined;
      path.forEach(name => {
        if (!currentLevel[name]) {
          currentLevel[name] = {children: {}};
        }
        node = currentLevel[name];
        currentLevel = currentLevel[name].children;
      });

      if (node) {
        addDescendants(node, category.children);
      }
    });
    type HierarchyNode = {
      name: string;
      children?: HierarchyNode[];
    };

    const formatHierarchy = (
      hierarchy: Record<string, {children: Record<string, any>}>,
    ): HierarchyNode[] => {
      return Object.entries(hierarchy).map(
        ([name, value]): HierarchyNode => ({
          name,
          children: formatHierarchy(value.children),
        }),
      );
    };
    const formattedHierarchy = formatHierarchy(hierarchy);
    const removeEmptyChildren = (nodes: HierarchyNode[]): HierarchyNode[] => {
      return nodes.map(node => {
        const newNode = {...node};
        if (newNode.children && newNode.children.length > 0) {
          newNode.children = removeEmptyChildren(newNode.children);
        }
        if (newNode.children?.length === 0) {
          delete newNode.children;
        }
        return newNode;
      });
    };

    return removeEmptyChildren(formattedHierarchy);
  } catch (error) {
    console.error('Error fetching hierarchy:', error);
    return [];
  }
}

const isYearKey = (key: string): boolean =>
  key !== 'name' && key !== '_children';

function sumYearValues(
  items: OpexTableItem[],
): Record<string, {actual: number; budget: number; variance: number}> {
  const totals: Record<
    string,
    {actual: number; budget: number; variance: number}
  > = {};

  items.forEach(item => {
    Object.keys(item).forEach(key => {
      if (!isYearKey(key)) return;
      const value = (item as any)[key];
      if (!value) return;
      if (!totals[key]) {
        totals[key] = {actual: 0, budget: 0, variance: 0};
      }
      totals[key].actual += value.actual || 0;
      totals[key].budget += value.budget || 0;
      totals[key].variance += value.variance || 0;
    });
  });

  return totals;
}

function applyHierarchy(
  result: OpexTableItem[],
  hierarchy: HierarchyNode[],
): OpexTableItem[] {
  const resultByName = new Map(result.map(entry => [entry.name, entry]));
  const consumed = new Set<string>();

  const buildNode = (node: HierarchyNode): OpexTableItem => {
    const source = resultByName.get(node.name);
    if (source) consumed.add(node.name);

    const entry: OpexTableItem = source ? {...source} : {name: node.name};

    if (node.children?.length) {
      // Hierarchy children replace the flat year rows for category nodes.
      entry._children = node.children.map(buildNode);

      // Remove any pre-existing flat year values before recomputing them
      // from the (now built) children, so parents always reflect the sum
      // of their children.
      Object.keys(entry).forEach(key => {
        if (isYearKey(key)) delete (entry as any)[key];
      });

      const totals = sumYearValues(entry._children);
      Object.keys(totals).forEach(year => {
        (entry as any)[year] = totals[year];
      });
    } else if (source?._children) {
      // Leaf categories retain the year/value rows created by the API data.
      entry._children = source._children.map(child => ({...child}));
    }

    return entry;
  };

  // Preserve categories that have data but are not present in the hierarchy.
  const finalResult = hierarchy.map(buildNode).concat(
    result
      .filter(entry => !consumed.has(entry.name))
      .map(entry => ({
        ...entry,
        _children: entry._children?.map(child => ({...child})),
      })),
  );

  const TOTAL_OPERATING_COSTS_NAME = 'Total operating costs';

  const extractByName = (
    items: OpexTableItem[],
    name: string,
  ): {items: OpexTableItem[]; extracted?: OpexTableItem} => {
    let extracted: OpexTableItem | undefined;
    const remaining: OpexTableItem[] = [];

    for (const item of items) {
      if (!extracted && item.name === name) {
        extracted = item;
        continue;
      }
      if (item._children?.length) {
        const nested = extractByName(item._children, name);
        if (nested.extracted && !extracted) {
          extracted = nested.extracted;
          remaining.push({...item, _children: nested.items});
          continue;
        }
      }
      remaining.push(item);
    }

    return {items: remaining, extracted};
  };

  const {items: resultWithoutTotal, extracted: totalOperatingCosts} =
    extractByName(finalResult, TOTAL_OPERATING_COSTS_NAME);

  if (totalOperatingCosts) {
    resultWithoutTotal.push(totalOperatingCosts);
    return resultWithoutTotal;
  }

  return finalResult;
}

export class OPEXController {
  constructor(@inject(RestBindings.Http.REQUEST) private req: Request) {}

  @get('/opex/years')
  @response(200)
  async opexYears(): Promise<{startYear: number; endYear: number}> {
    let geographyMappings = 'implementationPeriod/grant/geography/code';
    if (this.req.query.geographyGrouping === 'Portfolio View') {
      geographyMappings =
        'implementationPeriod/grant/geography_PortfolioView/code';
    } else if (this.req.query.geographyGrouping === 'Board Constituency View') {
      geographyMappings =
        'implementationPeriod/grant/geography_BoardConstituencyView/code';
    }

    const latestYearFilterString = await filterFinancialIndicators(
      this.req.query,
      OPEXStatsFieldsMapping.latestYearUrlParams,
      geographyMappings,
      'implementationPeriod/grant/activityArea/name',
      'budget',
    );

    const url = `${urls.FINANCIAL_INDICATORS}/${latestYearFilterString}`;

    return axios
      .get(url)
      .then(response => {
        const endYear = parseInt(
          _.get(
            response.data,
            `[${OPEXStatsFieldsMapping.dataPath}][${OPEXStatsFieldsMapping.year}]`,
            new Date().getFullYear(),
          ),
          10,
        );
        return {
          endYear,
          startYear: endYear - 9,
        };
      })
      .catch(() => {
        const endYear = new Date().getFullYear();
        return {
          endYear,
          startYear: endYear - 9,
        };
      });
  }

  @get('/opex/stats')
  @response(200)
  async opexStats() {
    let geographyMappings = 'implementationPeriod/grant/geography/code';
    if (this.req.query.geographyGrouping === 'Portfolio View') {
      geographyMappings =
        'implementationPeriod/grant/geography_PortfolioView/code';
    } else if (this.req.query.geographyGrouping === 'Board Constituency View') {
      geographyMappings =
        'implementationPeriod/grant/geography_BoardConstituencyView/code';
    }

    const {startYear, endYear} = await this.opexYears();

    const cumulativeTotalBudgetAbsorptionYears = Array.from(
      {length: endYear - startYear + 1},
      (_, i) => (startYear + i).toString(),
    );

    const fullYearBudgetFilterString = await filterFinancialIndicators(
      {
        ...this.req.query,
        periodsFrom: endYear.toString(),
        periodsTo: endYear.toString(),
      },
      OPEXStatsFieldsMapping.fullYearBudgetUrlParams,
      geographyMappings,
      'implementationPeriod/grant/activityArea/name',
      'budget',
    );
    const growthFilterString = await filterFinancialIndicators(
      {
        ...this.req.query,
        periodsFrom: startYear.toString(),
        periodsTo: startYear.toString(),
      },
      OPEXStatsFieldsMapping.fullYearBudgetUrlParams,
      geographyMappings,
      'implementationPeriod/grant/activityArea/name',
      'budget',
    );
    const totalActualFilterString = await filterFinancialIndicators(
      {
        ...this.req.query,
        periodsFrom: endYear.toString(),
        periodsTo: endYear.toString(),
      },
      OPEXStatsFieldsMapping.totalActualUrlParams,
      geographyMappings,
      'implementationPeriod/grant/activityArea/name',
      'budget',
    );
    const workforceFilterString = await filterFinancialIndicators(
      {
        ...this.req.query,
        periodsFrom: endYear.toString(),
        periodsTo: endYear.toString(),
      },
      OPEXStatsFieldsMapping.workforceUrlParams,
      geographyMappings,
      'implementationPeriod/grant/activityArea/name',
      'budget',
    );
    const nonWorkforceFilterString = await filterFinancialIndicators(
      {
        ...this.req.query,
        periodsFrom: endYear.toString(),
        periodsTo: endYear.toString(),
      },
      OPEXStatsFieldsMapping.nonWorkforceUrlParams,
      geographyMappings,
      'implementationPeriod/grant/activityArea/name',
      'budget',
    );
    const cumulativeTotalBudgetAbsorptionFilterString =
      await filterFinancialIndicators(
        {
          ...this.req.query,
          periodsFrom: cumulativeTotalBudgetAbsorptionYears.join(','),
          periodsTo: cumulativeTotalBudgetAbsorptionYears.join(','),
        },
        OPEXStatsFieldsMapping.cumulativeTotalBudgetAbsorptionUrlParams,
        geographyMappings,
        'implementationPeriod/grant/activityArea/name',
        'budget',
      );
    const cumulativeTotalBudgetWorkforceAbsorptionFilterString =
      await filterFinancialIndicators(
        {
          ...this.req.query,
          periodsFrom: cumulativeTotalBudgetAbsorptionYears.join(','),
          periodsTo: cumulativeTotalBudgetAbsorptionYears.join(','),
        },
        OPEXStatsFieldsMapping.cumulativeTotalBudgetWorkforceAbsorptionUrlParams,
        geographyMappings,
        'implementationPeriod/grant/activityArea/name',
        'budget',
      );
    const cumulativeTotalBudgetNonWorkforceAbsorptionFilterString =
      await filterFinancialIndicators(
        {
          ...this.req.query,
          periodsFrom: cumulativeTotalBudgetAbsorptionYears.join(','),
          periodsTo: cumulativeTotalBudgetAbsorptionYears.join(','),
        },
        OPEXStatsFieldsMapping.cumulativeTotalBudgetNonWorkforceAbsorptionUrlParams,
        geographyMappings,
        'implementationPeriod/grant/activityArea/name',
        'budget',
      );

    const fullYearBudgetUrl = `${urls.FINANCIAL_INDICATORS}/${fullYearBudgetFilterString}`;
    const growthUrl = `${urls.FINANCIAL_INDICATORS}/${growthFilterString}`;
    const totalActualUrl = `${urls.FINANCIAL_INDICATORS}/${totalActualFilterString}`;
    const workforceUrl = `${urls.FINANCIAL_INDICATORS}/${workforceFilterString}`;
    const nonWorkforceUrl = `${urls.FINANCIAL_INDICATORS}/${nonWorkforceFilterString}`;
    const cumulativeTotalBudgetAbsorptionUrl = `${urls.FINANCIAL_INDICATORS}/${cumulativeTotalBudgetAbsorptionFilterString}`;
    const cumulativeTotalBudgetWorkforceAbsorptionUrl = `${urls.FINANCIAL_INDICATORS}/${cumulativeTotalBudgetWorkforceAbsorptionFilterString}`;
    const cumulativeTotalBudgetNonWorkforceAbsorptionUrl = `${urls.FINANCIAL_INDICATORS}/${cumulativeTotalBudgetNonWorkforceAbsorptionFilterString}`;

    return axios
      .all([
        axios.get(fullYearBudgetUrl),
        axios.get(growthUrl),
        axios.get(totalActualUrl),
        axios.get(workforceUrl),
        axios.get(nonWorkforceUrl),
        axios.get(cumulativeTotalBudgetAbsorptionUrl),
        axios.get(cumulativeTotalBudgetWorkforceAbsorptionUrl),
        axios.get(cumulativeTotalBudgetNonWorkforceAbsorptionUrl),
      ])
      .then(
        axios.spread(
          (
            resp1: AxiosResponse,
            resp2: AxiosResponse,
            resp3: AxiosResponse,
            resp4: AxiosResponse,
            resp5: AxiosResponse,
            resp6: AxiosResponse,
            resp7: AxiosResponse,
            resp8: AxiosResponse,
          ) => {
            const fullYearBudget = _.get(
              resp1.data,
              `[${OPEXStatsFieldsMapping.dataPath}][${OPEXStatsFieldsMapping.plannedAmount}]`,
              0,
            );
            const fullYearForecast = _.get(
              resp1.data,
              `[${OPEXStatsFieldsMapping.dataPath}][${OPEXStatsFieldsMapping.actualAmount}]`,
              0,
            );
            const growthStartYearBudget = _.get(
              resp2.data,
              `[${OPEXStatsFieldsMapping.dataPath}][${OPEXStatsFieldsMapping.plannedAmount}]`,
              0,
            );
            const totalActual = _.get(
              resp3.data,
              `[${OPEXStatsFieldsMapping.dataPath}][${OPEXStatsFieldsMapping.actualAmount}]`,
              0,
            );
            const workforceActual = _.get(
              resp4.data,
              `[${OPEXStatsFieldsMapping.dataPath}][${OPEXStatsFieldsMapping.actualAmount}]`,
              0,
            );
            const workforceBudget = _.get(
              resp4.data,
              `[${OPEXStatsFieldsMapping.dataPath}][${OPEXStatsFieldsMapping.plannedAmount}]`,
              0,
            );
            const workforcePercentage =
              workforceBudget && workforceActual
                ? (workforceActual / workforceBudget) * 100
                : 0;
            const nonWorkforceActual = _.get(
              resp5.data,
              `[${OPEXStatsFieldsMapping.dataPath}][${OPEXStatsFieldsMapping.actualAmount}]`,
              0,
            );
            const nonWorkforceBudget = _.get(
              resp5.data,
              `[${OPEXStatsFieldsMapping.dataPath}][${OPEXStatsFieldsMapping.plannedAmount}]`,
              0,
            );
            const nonWorkforcePercentage =
              nonWorkforceBudget && nonWorkforceActual
                ? (nonWorkforceActual / nonWorkforceBudget) * 100
                : 0;
            const cumulativeTotalBudget = _.get(
              resp6.data,
              `[${OPEXStatsFieldsMapping.dataPath}][${OPEXStatsFieldsMapping.actualAmount}]`,
              0,
            );
            const cumulativeTotalValue = _.get(
              resp6.data,
              `[${OPEXStatsFieldsMapping.dataPath}][${OPEXStatsFieldsMapping.plannedAmount}]`,
              0,
            );
            const cumulativeTotalBudgetWorkforceAbsorption = _.get(
              resp7.data,
              `[${OPEXStatsFieldsMapping.dataPath}][${OPEXStatsFieldsMapping.plannedAmount}]`,
              0,
            );
            const cumulativeTotalValueWorkforceAbsorption = _.get(
              resp7.data,
              `[${OPEXStatsFieldsMapping.dataPath}][${OPEXStatsFieldsMapping.actualAmount}]`,
              0,
            );
            const cumulativeTotalBudgetNonWorkforceAbsorption = _.get(
              resp8.data,
              `[${OPEXStatsFieldsMapping.dataPath}][${OPEXStatsFieldsMapping.plannedAmount}]`,
              0,
            );
            const cumulativeTotalValueNonWorkforceAbsorption = _.get(
              resp8.data,
              `[${OPEXStatsFieldsMapping.dataPath}][${OPEXStatsFieldsMapping.actualAmount}]`,
              0,
            );
            const cumulativeTotalBudgetWorkforceAbsorptionPercentage =
              cumulativeTotalBudgetWorkforceAbsorption &&
              cumulativeTotalValueWorkforceAbsorption
                ? (cumulativeTotalValueWorkforceAbsorption /
                    cumulativeTotalBudgetWorkforceAbsorption) *
                  100
                : 0;
            const cumulativeTotalBudgetNonWorkforceAbsorptionPercentage =
              cumulativeTotalBudgetNonWorkforceAbsorption &&
              cumulativeTotalValueNonWorkforceAbsorption
                ? (cumulativeTotalValueNonWorkforceAbsorption /
                    cumulativeTotalBudgetNonWorkforceAbsorption) *
                  100
                : 0;

            return {
              budget: fullYearBudget,
              forecast: fullYearForecast,
              growthStartYearValue: growthStartYearBudget,
              totalActual: totalActual,
              workforceActual: workforceActual,
              workforceBudget: workforceBudget,
              workforcePercentage: workforcePercentage,
              nonWorkforceActual: nonWorkforceActual,
              nonWorkforceBudget: nonWorkforceBudget,
              nonWorkforcePercentage: nonWorkforcePercentage,
              totalActualPercentage:
                fullYearBudget && totalActual
                  ? (totalActual / fullYearBudget) * 100
                  : 0,
              growthPercentage:
                fullYearBudget && growthStartYearBudget
                  ? ((fullYearBudget - growthStartYearBudget) /
                      growthStartYearBudget) *
                    100
                  : 0,
              cumulativeTotalBudget: cumulativeTotalBudget,
              cumulativeTotalValue: cumulativeTotalValue,
              cumulativeTotalBudgetAbsorptionPercentage:
                cumulativeTotalBudget && cumulativeTotalValue
                  ? (cumulativeTotalValue / cumulativeTotalBudget) * 100
                  : 0,
              cumulativeTotalBudgetWorkforceAbsorption:
                cumulativeTotalBudgetWorkforceAbsorption,
              cumulativeTotalValueWorkforceAbsorption:
                cumulativeTotalValueWorkforceAbsorption,
              cumulativeTotalBudgetWorkforceAbsorptionPercentage:
                cumulativeTotalBudgetWorkforceAbsorptionPercentage,
              cumulativeTotalBudgetNonWorkforceAbsorption:
                cumulativeTotalBudgetNonWorkforceAbsorption,
              cumulativeTotalValueNonWorkforceAbsorption:
                cumulativeTotalValueNonWorkforceAbsorption,
              cumulativeTotalBudgetNonWorkforceAbsorptionPercentage:
                cumulativeTotalBudgetNonWorkforceAbsorptionPercentage,
            };
          },
        ),
      )
      .catch(handleDataApiError);
  }

  @get('/opex/operating-costs/{category}')
  @response(200)
  async getOperatingCosts(
    @param.path.string('category')
    category: 'Workforce' | 'NonWorkforce' | 'Total',
  ) {
    let geographyMappings = 'implementationPeriod/grant/geography/code';
    if (this.req.query.geographyGrouping === 'Portfolio View') {
      geographyMappings =
        'implementationPeriod/grant/geography_PortfolioView/code';
    } else if (this.req.query.geographyGrouping === 'Board Constituency View') {
      geographyMappings =
        'implementationPeriod/grant/geography_BoardConstituencyView/code';
    }

    const {startYear, endYear} = await this.opexYears();

    const years = Array.from({length: endYear - startYear + 1}, (_, i) =>
      (startYear + i).toString(),
    );

    const actualsLineFilterString = await filterFinancialIndicators(
      {
        ...this.req.query,
        periodsFrom: years.join(','),
        periodsTo: years.join(','),
      },
      OPEXOperatingCostsFieldsMapping[`actualsLine${category}UrlParams`],
      geographyMappings,
      'implementationPeriod/grant/activityArea/name',
      'budget',
    );
    const budgetsLineFilterString = await filterFinancialIndicators(
      {
        ...this.req.query,
        periodsFrom: years.join(','),
        periodsTo: years.join(','),
      },
      OPEXOperatingCostsFieldsMapping[`budgetsLine${category}UrlParams`],
      geographyMappings,
      'implementationPeriod/grant/activityArea/name',
      'budget',
    );

    const actualsLineUrl = `${urls.FINANCIAL_INDICATORS}/${actualsLineFilterString}`;
    const budgetsLineUrl = `${urls.FINANCIAL_INDICATORS}/${budgetsLineFilterString}`;

    return axios
      .all([axios.get(actualsLineUrl), axios.get(budgetsLineUrl)])
      .then(
        axios.spread((actualsLineResponse, budgetsLineResponse) => {
          const actualsLineData = _.get(
            actualsLineResponse.data,
            OPEXOperatingCostsFieldsMapping.dataPath,
            [],
          ).map((item: any) =>
            _.get(item, OPEXOperatingCostsFieldsMapping.actualAmount),
          );
          const budgetsLineData = _.get(
            budgetsLineResponse.data,
            OPEXOperatingCostsFieldsMapping.dataPath,
            [],
          ).map((item: any) =>
            _.get(item, OPEXOperatingCostsFieldsMapping.plannedAmount),
          );
          return {
            actualsLineYValues: actualsLineData,
            budgetsLineYValues: budgetsLineData,
            xAxisValues: years,
          };
        }),
      )
      .catch(handleDataApiError);
  }

  @get('/opex/efficiency/{type}')
  @response(200)
  async getOpexEfficiency(
    @param.path.string('type') type: 'pledge' | 'disbursement',
  ) {
    let geographyMappings = 'implementationPeriod/grant/geography/code';
    if (this.req.query.geographyGrouping === 'Portfolio View') {
      geographyMappings =
        'implementationPeriod/grant/geography_PortfolioView/code';
    } else if (this.req.query.geographyGrouping === 'Board Constituency View') {
      geographyMappings =
        'implementationPeriod/grant/geography_BoardConstituencyView/code';
    }

    const {startYear, endYear} = await this.opexYears();

    const years = Array.from({length: endYear - startYear + 1}, (_, i) =>
      (startYear + i).toString(),
    );

    const pledgesUrl = `http://127.0.0.1:${process.env.PORT ?? 4200}/pledges-contributions/bar`;

    const pledgesByCycle: {
      name: string; // Cycle name like "2001-2005"
      value: number; // Pledge amount
      value1: number; // Contribution amount
      cycle: string; // Cycle name like "2001-2005"
    }[] =
      type === 'pledge' ? ((await axios.get(pledgesUrl)).data?.data ?? []) : [];

    pledgesByCycle.forEach((pledge, i) => {
      pledge.cycle = pledge.name;
      pledge.name = `GC${i}·${pledge.name}`;
    });

    const disbursementsFilterString = await filterFinancialIndicators(
      {
        ...this.req.query,
        periodsFrom: years.join(','),
        periodsTo: years.join(','),
      },
      OPEXEfficiencyFieldsMapping.disbursementsUrlParams,
      geographyMappings,
      'implementationPeriod/grant/activityArea/name',
      'disbursement',
    );

    const disbursementsUrl = `${urls.FINANCIAL_INDICATORS}/${disbursementsFilterString}`;
    const disbursementsData =
      type === 'disbursement'
        ? await axios.get(disbursementsUrl).then(response => {
            return _.get(
              response.data,
              OPEXEfficiencyFieldsMapping.dataPath,
              [],
            ).map((item: any) => {
              const period = _.get(
                item,
                OPEXEfficiencyFieldsMapping.disbursementPeriod,
              );
              const actual = _.get(
                item,
                OPEXEfficiencyFieldsMapping.actualAmount,
              );
              return {period, actual};
            });
          })
        : [];

    const filterString = await filterFinancialIndicators(
      {
        ...this.req.query,
        periodsFrom: years.join(','),
        periodsTo: years.join(','),
      },
      OPEXEfficiencyFieldsMapping.urlParams.replace(
        '<periodField>',
        OPEXEfficiencyFieldsMapping[`${type}Period`],
      ),
      geographyMappings,
      'implementationPeriod/grant/activityArea/name',
      'budget',
    );

    const url = `${urls.FINANCIAL_INDICATORS}/${filterString}`;

    return axios
      .get(url)
      .then(response => {
        if (type === 'pledge') {
          const data = _.orderBy(
            _.get(response.data, OPEXEfficiencyFieldsMapping.dataPath, []).map(
              (item: any) => {
                const period = _.get(
                  item,
                  OPEXEfficiencyFieldsMapping.pledgePeriod,
                );
                const actual = _.get(
                  item,
                  OPEXEfficiencyFieldsMapping.actualAmount,
                );
                const pledge = _.find(pledgesByCycle, {cycle: period});
                const gcNumber = (pledge?.name ?? '')
                  .split('·')[0]
                  .replace('GC', '');
                return {
                  name: period,
                  gcNumber,
                  pledge: pledge?.value ?? 0,
                  actual,
                  efficiency: (actual / (pledge?.value ?? 1)) * 100,
                };
              },
            ),
            item => item.name.split('-')[0],
            ['asc'],
          );
          const cumulativeEfficiency = data.reduce(
            (acc, item) => {
              acc.actual += item.actual;
              acc.pledge += item.pledge;
              return acc;
            },
            {actual: 0, pledge: 0},
          );
          return {
            items: data,
            cumulativeEfficiency:
              (cumulativeEfficiency.actual /
                (cumulativeEfficiency.pledge || 1)) *
              100,
            cumulativeActual: cumulativeEfficiency.actual,
            cumulativePledge: cumulativeEfficiency.pledge,
          };
        }
        if (type === 'disbursement') {
          const data = _.orderBy(
            _.get(response.data, OPEXEfficiencyFieldsMapping.dataPath, []).map(
              (item: any) => {
                const period = _.get(
                  item,
                  OPEXEfficiencyFieldsMapping.disbursementPeriod,
                );
                const actual = _.get(
                  item,
                  OPEXEfficiencyFieldsMapping.actualAmount,
                );
                const disbursement = _.find(disbursementsData, {period});
                return {
                  name: period,
                  disbursement: disbursement?.actual ?? 0,
                  actual,
                  efficiency: (actual / (disbursement?.actual ?? 1)) * 100,
                };
              },
            ),
            item => item.name.split('-')[0],
            ['asc'],
          );
          const cumulativeEfficiency = data.reduce(
            (acc, item) => {
              acc.actual += item.actual;
              acc.disbursement += item.disbursement;
              return acc;
            },
            {actual: 0, disbursement: 0},
          );
          return {
            items: data,
            cumulativeEfficiency:
              (cumulativeEfficiency.actual /
                (cumulativeEfficiency.disbursement || 1)) *
              100,
            cumulativeActual: cumulativeEfficiency.actual,
            cumulativeDisbursement: cumulativeEfficiency.disbursement,
          };
        }
        return [];
      })
      .catch(handleDataApiError);
  }

  @get('/opex/year-stats')
  @response(200)
  async getOpexYearStats() {
    let geographyMappings = 'implementationPeriod/grant/geography/code';
    if (this.req.query.geographyGrouping === 'Portfolio View') {
      geographyMappings =
        'implementationPeriod/grant/geography_PortfolioView/code';
    } else if (this.req.query.geographyGrouping === 'Board Constituency View') {
      geographyMappings =
        'implementationPeriod/grant/geography_BoardConstituencyView/code';
    }

    const {endYear} = await this.opexYears();

    const filterString = await filterFinancialIndicators(
      {
        ...this.req.query,
        periodsFrom: endYear.toString(),
        periodsTo: endYear.toString(),
      },
      OPEXYearStatsFieldsMapping.urlParams,
      geographyMappings,
      'implementationPeriod/grant/activityArea/name',
      'budget',
    );

    const url = `${urls.FINANCIAL_INDICATORS}/${filterString}`;

    return axios
      .all([axios.get(url)])
      .then(
        axios.spread(data => {
          const budget = _.get(
            data.data,
            `[${OPEXYearStatsFieldsMapping.dataPath}][${OPEXYearStatsFieldsMapping.plannedAmount}]`,
            0,
          );
          const actual = _.get(
            data.data,
            `[${OPEXYearStatsFieldsMapping.dataPath}][${OPEXYearStatsFieldsMapping.actualAmount}]`,
            0,
          );
          return {budget, actual, forecast: 0};
        }),
      )
      .catch(handleDataApiError);
  }

  @get('/opex/cost-composition')
  @response(200)
  async getOpexCostComposition() {
    let geographyMappings = 'implementationPeriod/grant/geography/code';
    if (this.req.query.geographyGrouping === 'Portfolio View') {
      geographyMappings =
        'implementationPeriod/grant/geography_PortfolioView/code';
    } else if (this.req.query.geographyGrouping === 'Board Constituency View') {
      geographyMappings =
        'implementationPeriod/grant/geography_BoardConstituencyView/code';
    }

    const {startYear, endYear} = await this.opexYears();

    const years = Array.from({length: endYear - startYear + 1}, (_, i) =>
      (startYear + i).toString(),
    );

    const filterString = await filterFinancialIndicators(
      {
        ...this.req.query,
        periodsFrom: years.join(','),
        periodsTo: years.join(','),
      },
      OPEXCostCompositionFieldsMapping.urlParams,
      geographyMappings,
      'implementationPeriod/grant/activityArea/name',
      'budget',
    );

    const url = `${urls.FINANCIAL_INDICATORS}/${filterString}`;

    return axios
      .all([axios.get(url)])
      .then(
        axios.spread(data => {
          let costComposition = _.orderBy(
            _.get(
              data.data,
              `[${OPEXCostCompositionFieldsMapping.dataPath}]`,
              [],
            ).map((item: any) => ({
              year: _.get(item, OPEXCostCompositionFieldsMapping.year, ''),
              category: _.get(
                item,
                OPEXCostCompositionFieldsMapping.category,
                '',
              ),
              actual: _.get(
                item,
                OPEXCostCompositionFieldsMapping.actualAmount,
                0,
              ),
            })),
            ['year', 'category'],
            ['asc', 'asc'],
          );
          const groupedByYear = _.groupBy(costComposition, 'year');
          const years = Object.keys(groupedByYear).sort();
          if (
            costComposition.some(
              item => item.category === 'Individual / Temp Consultants',
            ) &&
            costComposition.some(item => item.category === 'Staff')
          ) {
            const items = _.filter(
              costComposition,
              item =>
                item.category === 'Individual / Temp Consultants' ||
                item.category === 'Staff',
            );
            years.forEach(year => {
              const yearItems = _.filter(items, item => item.year === year);
              if (yearItems.length > 0) {
                const mergedYearItem = _.merge({}, ...yearItems);
                mergedYearItem.category = 'Workforce';
                costComposition = costComposition.filter(
                  item =>
                    !(
                      item.category === 'Individual / Temp Consultants' &&
                      item.year === year
                    ) && !(item.category === 'Staff' && item.year === year),
                );
                costComposition.push(mergedYearItem);
              }
            });
          }
          const values: number[][] = years.map(year =>
            groupedByYear[year].map(item => item.actual),
          );
          const categories = Array.from(
            new Set(costComposition.map(item => item.category)),
          );
          return {years, values, categories};
        }),
      )
      .catch(handleDataApiError);
  }

  @get('/opex/key-costs')
  @response(200)
  async getOpexKeyCosts() {
    let geographyMappings = 'implementationPeriod/grant/geography/code';
    if (this.req.query.geographyGrouping === 'Portfolio View') {
      geographyMappings =
        'implementationPeriod/grant/geography_PortfolioView/code';
    } else if (this.req.query.geographyGrouping === 'Board Constituency View') {
      geographyMappings =
        'implementationPeriod/grant/geography_BoardConstituencyView/code';
    }

    const {startYear, endYear} = await this.opexYears();

    const years = Array.from({length: endYear - startYear + 1}, (_, i) =>
      (startYear + i).toString(),
    );

    const filterString = await filterFinancialIndicators(
      {
        ...this.req.query,
        periodsFrom: years.join(','),
        periodsTo: years.join(','),
      },
      OPEXKeyCostsFieldsMapping.urlParams,
      geographyMappings,
      'implementationPeriod/grant/activityArea/name',
      'budget',
    );
    const annualTotalsFilterString = await filterFinancialIndicators(
      {
        ...this.req.query,
        periodsFrom: years.join(','),
        periodsTo: years.join(','),
      },
      OPEXKeyCostsFieldsMapping.annualTotalsUrlParams,
      geographyMappings,
      'implementationPeriod/grant/activityArea/name',
      'budget',
    );

    const url = `${urls.FINANCIAL_INDICATORS}/${filterString}`;
    const annualTotalsUrl = `${urls.FINANCIAL_INDICATORS}/${annualTotalsFilterString}`;

    return axios
      .all([axios.get(url), axios.get(annualTotalsUrl)])
      .then(
        axios.spread((data, annualTotalsData) => {
          const keyCosts = _.orderBy(
            _.get(data.data, `[${OPEXKeyCostsFieldsMapping.dataPath}]`, []).map(
              (item: any) => ({
                year: _.get(item, OPEXKeyCostsFieldsMapping.year, ''),
                category: _.get(item, OPEXKeyCostsFieldsMapping.category, ''),
                actual: _.get(item, OPEXKeyCostsFieldsMapping.actualAmount, 0),
                planned: _.get(
                  item,
                  OPEXKeyCostsFieldsMapping.plannedAmount,
                  0,
                ),
              }),
            ),
            ['year', 'category'],
            ['asc', 'asc'],
          );
          const annualTotals = _.orderBy(
            _.get(
              annualTotalsData.data,
              `[${OPEXKeyCostsFieldsMapping.dataPath}]`,
              [],
            ).map((item: any) => ({
              year: _.get(item, OPEXKeyCostsFieldsMapping.year, ''),
              value: _.get(item, OPEXKeyCostsFieldsMapping.actualAmount, 0),
            })),
            ['year', 'category'],
            ['asc', 'asc'],
          );
          const groupedByCategory = _.groupBy(keyCosts, 'category');
          if (
            groupedByCategory['Individual / Temp Consultants'] &&
            groupedByCategory['Staff']
          ) {
            groupedByCategory['Workforce'] = _.merge(
              groupedByCategory['Individual / Temp Consultants'],
              groupedByCategory['Staff'],
            );
            delete groupedByCategory['Individual / Temp Consultants'];
            delete groupedByCategory['Staff'];
          }
          const items: {
            name: string;
            values: number[];
            endYearBudget: number;
            growthPercentage: number;
          }[] = Object.keys(groupedByCategory).map(category => {
            const values = groupedByCategory[category].map(item => item.actual);
            const actualPercentageValues = groupedByCategory[category].map(
              item => {
                const annualTotal =
                  annualTotals.find(at => at.year === item.year)?.value ?? 0;
                return annualTotal ? (item.actual / annualTotal) * 100 : 0;
              },
            );
            const startYearBudget = groupedByCategory[category].sort((a, b) =>
              a.year.localeCompare(b.year),
            )[0].planned;
            const endYearBudget = groupedByCategory[category].sort((a, b) =>
              b.year.localeCompare(a.year),
            )[0].planned;
            const growthPercentage = startYearBudget
              ? ((endYearBudget - startYearBudget) / startYearBudget) * 100
              : 0;
            const startYearBudgetPercentage =
              startYearBudget &&
              annualTotals.find(
                at =>
                  at.year ===
                  groupedByCategory[category].sort((a, b) =>
                    a.year.localeCompare(b.year),
                  )[0].year,
              )?.value
                ? (startYearBudget /
                    annualTotals.find(
                      at =>
                        at.year ===
                        groupedByCategory[category].sort((a, b) =>
                          a.year.localeCompare(b.year),
                        )[0].year,
                    )?.value) *
                  100
                : 0;
            const endYearBudgetPercentage =
              endYearBudget &&
              annualTotals.find(
                at =>
                  at.year ===
                  groupedByCategory[category].sort((a, b) =>
                    b.year.localeCompare(a.year),
                  )[0].year,
              )?.value
                ? (endYearBudget /
                    annualTotals.find(
                      at =>
                        at.year ===
                        groupedByCategory[category].sort((a, b) =>
                          b.year.localeCompare(a.year),
                        )[0].year,
                    )?.value) *
                  100
                : 0;

            return {
              name: category,
              values,
              actualPercentageValues,
              endYearBudget,
              growthPercentage,
              startYearBudgetPercentage,
              endYearBudgetPercentage,
            };
          });
          return {items, years};
        }),
      )
      .catch(handleDataApiError);
  }

  @get('/opex/indexed-trends')
  @response(200)
  async getOpexIndexedTrends() {
    let geographyMappings = 'implementationPeriod/grant/geography/code';
    if (this.req.query.geographyGrouping === 'Portfolio View') {
      geographyMappings =
        'implementationPeriod/grant/geography_PortfolioView/code';
    } else if (this.req.query.geographyGrouping === 'Board Constituency View') {
      geographyMappings =
        'implementationPeriod/grant/geography_BoardConstituencyView/code';
    }

    const {startYear, endYear} = await this.opexYears();

    const years = Array.from({length: endYear - startYear + 1}, (_, i) =>
      (startYear + i).toString(),
    );

    const filterString = await filterFinancialIndicators(
      {
        ...this.req.query,
        periodsFrom: years.join(','),
        periodsTo: years.join(','),
      },
      OPEXIndexedTrendsFieldsMapping.urlParams,
      geographyMappings,
      'implementationPeriod/grant/activityArea/name',
      'budget',
    );

    const url = `${urls.FINANCIAL_INDICATORS}/${filterString}`;

    return axios
      .get(url)
      .then(response => {
        let data = _.orderBy(
          _.get(response.data, OPEXIndexedTrendsFieldsMapping.dataPath, []).map(
            (item: any) => ({
              year: _.get(item, OPEXIndexedTrendsFieldsMapping.year),
              category: _.get(item, OPEXIndexedTrendsFieldsMapping.category),
              actual: _.get(item, OPEXIndexedTrendsFieldsMapping.actualAmount),
            }),
          ),
          ['year', 'category'],
          ['asc', 'asc'],
        );

        if (
          _.some(
            data,
            item =>
              item.category === 'Individual / Temp Consultants' ||
              item.category === 'Staff',
          )
        ) {
          const items = _.filter(
            data,
            item =>
              item.category === 'Individual / Temp Consultants' ||
              item.category === 'Staff',
          );
          const groupedByYear = _.groupBy(items, 'year');
          for (const year in groupedByYear) {
            const yearItems = _.filter(items, item => item.year === year);
            if (yearItems.length > 0) {
              const mergedYearItem = _.merge({}, ...yearItems);
              mergedYearItem.category = 'Workforce';
              data = data.filter(
                item =>
                  !(
                    (item.category === 'Individual / Temp Consultants' ||
                      item.category === 'Staff') &&
                    item.year === year
                  ),
              );
              data.push(mergedYearItem);
            }
          }
        }

        data = _.orderBy(data, ['year', 'category'], ['asc', 'asc']);

        const groupedByCategory = _.groupBy(data, 'category');

        const result: {name: string; data: number[]}[] = [];

        for (const category in groupedByCategory) {
          const categoryData = groupedByCategory[category];
          const indexedData = categoryData.map(item => {
            const baseValue = categoryData[0].actual;
            return baseValue ? (item.actual / baseValue) * 100 : 0;
          });
          result.push({name: category, data: indexedData});
        }

        return {years, data: result};
      })
      .catch(handleDataApiError);
  }

  @get('/opex/table')
  @response(200)
  async getOpexTable() {
    let geographyMappings = 'implementationPeriod/grant/geography/code';
    if (this.req.query.geographyGrouping === 'Portfolio View') {
      geographyMappings =
        'implementationPeriod/grant/geography_PortfolioView/code';
    } else if (this.req.query.geographyGrouping === 'Board Constituency View') {
      geographyMappings =
        'implementationPeriod/grant/geography_BoardConstituencyView/code';
    }

    const {startYear, endYear} = await this.opexYears();

    const years = Array.from({length: endYear - startYear + 1}, (_, i) =>
      (startYear + i).toString(),
    );

    const filterString = await filterFinancialIndicators(
      {
        ...this.req.query,
        periodsFrom: years.join(','),
        periodsTo: years.join(','),
      },
      OPEXTableFieldsMapping.urlParams,
      geographyMappings,
      'implementationPeriod/grant/activityArea/name',
      'budget',
    );
    const hierarchyFilterString = await filterFinancialIndicators(
      {
        ...this.req.query,
        periodsFrom: years.join(','),
        periodsTo: years.join(','),
      },
      OPEXTableFieldsMapping.hierarchyUrlParams,
      geographyMappings,
      'implementationPeriod/grant/activityArea/name',
      'budget',
    );

    const url = `${urls.FINANCIAL_INDICATORS}/${filterString}`;
    const hierarchyUrl = `${urls.FINANCIAL_INDICATORS}/${hierarchyFilterString}`;

    const hierarchy = await getHierarchy(hierarchyUrl);

    return axios
      .get(url)
      .then(response => {
        const data = _.orderBy(
          _.get(response.data, OPEXTableFieldsMapping.dataPath, []).map(
            (item: any) => ({
              year: _.get(item, OPEXTableFieldsMapping.year),
              category: _.get(item, OPEXTableFieldsMapping.category),
              actual: _.get(item, OPEXTableFieldsMapping.actualAmount),
              budget: _.get(item, OPEXTableFieldsMapping.plannedAmount),
            }),
          ),
          ['year', 'category'],
          ['asc', 'asc'],
        );

        const groupedByCategory = _.groupBy(data, 'category');

        let result: OpexTableItem[] = [];

        for (const category in groupedByCategory) {
          const categoryData = groupedByCategory[category];
          const categoryEntry: OpexTableItem = {
            name: category,
          };

          categoryEntry._children = categoryData.map((item: any) => {
            const child: OpexTableItem = {
              name: item.name,
            };
            child[item.year] = {
              actual: item.actual,
              budget: item.budget,
              variance: item.budget - item.actual,
            };
            if (categoryEntry[item.year]) {
              categoryEntry[item.year].actual += item.actual;
              categoryEntry[item.year].budget += item.budget;
              categoryEntry[item.year].variance += item.budget - item.actual;
            } else {
              categoryEntry[item.year] = {
                actual: item.actual,
                budget: item.budget,
                variance: item.budget - item.actual,
              };
            }
            return child;
          });

          result.push(categoryEntry);
        }

        // now we can use the hierarchy to further structure the result if needed
        result = applyHierarchy(result, hierarchy);

        // check all result items and sub-children if they have children field without name field in the children object, remove the children object
        const cleanResult = (items: OpexTableItem[]): OpexTableItem[] => {
          return items.map(item => {
            if (item._children) {
              item._children = cleanResult(item._children);
              if (item._children.every(child => !child.name)) {
                delete item._children;
              }
            }
            return item;
          });
        };
        result = cleanResult(result);

        const TOTAL_OPERATING_COSTS_NAME = 'Total operating costs';
        const TOTAL_NON_RECURRING_COSTS_NAME = 'Total Non-recurring costs';
        const OPEX_BEFORE_NON_RECURRING_COSTS_NAME =
          'Opex before non-recurring costs';
        const SUMMARY_ROW_NAMES = [
          TOTAL_OPERATING_COSTS_NAME,
          TOTAL_NON_RECURRING_COSTS_NAME,
          OPEX_BEFORE_NON_RECURRING_COSTS_NAME,
        ];
        const NON_RECURRING_COST_CATEGORIES = [
          'Professional fees',
          'Travel',
          'Meetings',
          'Communications',
          'Office Infrastructure',
          'Board Constituency',
          'Depreciation',
          'External Co-Funding',
        ];
        const OPEX_BEFORE_NON_RECURRING_CATEGORIES = [
          'Individual / Temp Consultants',
          'Staff',
        ];

        // applyHierarchy may have already surfaced a summary row (e.g.
        // extracted from the source hierarchy) at the end of the top-level
        // result; exclude any of them so they aren't summed into themselves.
        const resultWithoutExistingSummaryRows = result.filter(
          item => !SUMMARY_ROW_NAMES.includes(item.name),
        );

        // Categories can live at any depth of the hierarchy, so search the
        // whole tree (not just the top level) to find them by name.
        const findItemsByNames = (
          items: OpexTableItem[],
          names: string[],
        ): OpexTableItem[] => {
          const remaining = new Set(names);
          const found: OpexTableItem[] = [];

          const search = (nodes: OpexTableItem[]) => {
            nodes.forEach(node => {
              if (remaining.has(node.name)) {
                found.push(node);
                remaining.delete(node.name);
              }
              if (node._children?.length) {
                search(node._children);
              }
            });
          };

          search(items);
          return found;
        };

        const nonRecurringCostItems = findItemsByNames(
          resultWithoutExistingSummaryRows,
          NON_RECURRING_COST_CATEGORIES,
        );
        const totalNonRecurringCosts: OpexTableItem = {
          name: TOTAL_NON_RECURRING_COSTS_NAME,
          ...sumYearValues(nonRecurringCostItems),
        };

        const opexBeforeNonRecurringItems = findItemsByNames(
          resultWithoutExistingSummaryRows,
          OPEX_BEFORE_NON_RECURRING_CATEGORIES,
        );
        const opexBeforeNonRecurringCosts: OpexTableItem = {
          name: OPEX_BEFORE_NON_RECURRING_COSTS_NAME,
          ...sumYearValues(opexBeforeNonRecurringItems),
        };

        const totalOperatingCosts: OpexTableItem = {
          name: TOTAL_OPERATING_COSTS_NAME,
          ...sumYearValues(resultWithoutExistingSummaryRows),
        };

        result = [
          ...resultWithoutExistingSummaryRows,
          totalNonRecurringCosts,
          opexBeforeNonRecurringCosts,
          totalOperatingCosts,
        ];

        return {years, data: result};
      })
      .catch(handleDataApiError);
  }
}
