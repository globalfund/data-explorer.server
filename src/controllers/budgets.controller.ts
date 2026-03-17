import {inject} from '@loopback/core';
import {get, param, Request, response, RestBindings} from '@loopback/rest';
import axios, {AxiosResponse} from 'axios';
import _ from 'lodash';
import BudgetsBreakdownFieldsMapping from '../config/mapping/budgets/breakdown.json';
import BudgetsCyclesMapping from '../config/mapping/budgets/cycles.json';
import BudgetsMetricsFieldsMapping from '../config/mapping/budgets/metrics.json';
import BudgetsRadialFieldsMapping from '../config/mapping/budgets/radial.json';
import BudgetsSankeyFieldsMapping from '../config/mapping/budgets/sankey.json';
import BudgetsTableFieldsMapping from '../config/mapping/budgets/table.json';
import BudgetsTreemapFieldsMapping from '../config/mapping/budgets/treemap.json';
import urls from '../config/urls/index.json';
import {BudgetSankeyChartData} from '../interfaces/budgetSankey';
import {handleDataApiError} from '../utils/dataApiError';
import {filterFinancialIndicators} from '../utils/filtering/financialIndicators';

export class BudgetsController {
  constructor(@inject(RestBindings.Http.REQUEST) private req: Request) {}

  @get('/budgets/radial')
  @response(200)
  async radial() {
    let geographyMappings = 'implementationPeriod/grant/geography/code';
    if (this.req.query.geographyGrouping === 'Portfolio View') {
      geographyMappings =
        'implementationPeriod/grant/geography_PortfolioView/code';
    } else if (this.req.query.geographyGrouping === 'Board Constituency View') {
      geographyMappings =
        'implementationPeriod/grant/geography_BoardConstituencyView/code';
    }
    const filterString = await filterFinancialIndicators(
      this.req.query,
      BudgetsRadialFieldsMapping.urlParams,
      geographyMappings,
      'implementationPeriod/grant/activityArea/name',
      'budget',
    );
    const url = `${urls.FINANCIAL_INDICATORS}/${filterString}`;

    return axios
      .get(url)
      .then((resp: AxiosResponse) => {
        return _.get(resp.data, BudgetsRadialFieldsMapping.dataPath, []).map(
          (item: any, index: number) => ({
            name: _.get(item, BudgetsRadialFieldsMapping.name, ''),
            value: _.get(item, BudgetsRadialFieldsMapping.value, 0),
            itemStyle: {
              color: _.get(BudgetsRadialFieldsMapping.colors, index, ''),
            },
          }),
        );
      })
      .catch(handleDataApiError);
  }

  @get('/budgets/sankey/{componentField}/{geographyGrouping}')
  @response(200)
  async sankey(
    @param.path.string('componentField') componentField: string,
    @param.path.string('geographyGrouping') geographyGrouping: string,
  ) {
    let geographyMappings = 'implementationPeriod/grant/geography/code';
    if (geographyGrouping === 'Portfolio View') {
      geographyMappings =
        'implementationPeriod/grant/geography_PortfolioView/code';
    } else if (geographyGrouping === 'Board Constituency View') {
      geographyMappings =
        'implementationPeriod/grant/geography_BoardConstituencyView/code';
    }
    const filterString = await filterFinancialIndicators(
      this.req.query,
      BudgetsSankeyFieldsMapping.urlParams,
      geographyMappings,
      `implementationPeriod/grant/${componentField}/name`,
      'budget',
    );
    const url = `${urls.FINANCIAL_INDICATORS}/${filterString}`;

    return axios
      .get(url)
      .then((resp: AxiosResponse) => {
        const rawData = _.get(
          resp.data,
          BudgetsSankeyFieldsMapping.dataPath,
          [],
        );
        const data: BudgetSankeyChartData = {
          nodes: [
            {
              name: 'Total budget',
              level: 0,
              itemStyle: {
                color: BudgetsSankeyFieldsMapping.nodeColors[0],
              },
            },
          ],
          links: [],
        };
        const groupedDataLevel1 = _.groupBy(
          rawData,
          BudgetsSankeyFieldsMapping.level1Field,
        );
        _.forEach(groupedDataLevel1, (level1Data, level1) => {
          data.nodes.push({
            name: level1,
            level: 1,
            itemStyle: {
              color: BudgetsSankeyFieldsMapping.nodeColors[1],
            },
          });
          data.links.push({
            source: data.nodes[0].name,
            target: level1,
            value: _.sumBy(level1Data, BudgetsSankeyFieldsMapping.valueField),
          });

          const groupedDataLevel2 = _.groupBy(
            level1Data,
            BudgetsSankeyFieldsMapping.level2Field,
          );
          _.forEach(groupedDataLevel2, (level2Data, level2) => {
            const level2inLevel1 = _.find(data.nodes, {
              name: level2,
              level: 1,
            });
            data.nodes.push({
              name: level2inLevel1 ? `${level2}1` : level2,
              level: 2,
              itemStyle: {
                color: BudgetsSankeyFieldsMapping.nodeColors[2],
              },
            });
            data.links.push({
              source: level1,
              target: level2inLevel1 ? `${level2}1` : level2,
              value: _.sumBy(level2Data, BudgetsSankeyFieldsMapping.valueField),
            });

            const groupedDataLevel3 = _.groupBy(
              level2Data,
              BudgetsSankeyFieldsMapping.level3Field,
            );
            _.forEach(groupedDataLevel3, (level3Data, level3) => {
              const level3inLevel2 = _.find(data.nodes, {
                name: level3,
                level: 2,
              });
              data.nodes.push({
                name: level3inLevel2 ? `${level3}1` : level3,
                level: 3,
                itemStyle: {
                  color: BudgetsSankeyFieldsMapping.nodeColors[2],
                },
              });
              data.links.push({
                source: level2,
                target: level3inLevel2 ? `${level3}1` : level3,
                value: _.sumBy(
                  level3Data,
                  BudgetsSankeyFieldsMapping.valueField,
                ),
              });
            });
          });
        });
        data.nodes = _.uniqBy(data.nodes, 'name');
        data.nodes = _.orderBy(
          data.nodes,
          node => {
            const links = _.filter(data.links, {target: node.name});
            return _.sumBy(links, 'value');
          },
          'desc',
        );
        data.links = _.filter(data.links, link => link.source !== link.target);
        data.links = _.orderBy(data.links, 'value', 'desc');
        return {data};
      })
      .catch(handleDataApiError);
  }

  @get('/budgets/treemap/{componentField}/{geographyGrouping}')
  @response(200)
  async treemap(
    @param.path.string('componentField') componentField: string,
    @param.path.string('geographyGrouping') geographyGrouping: string,
  ) {
    let geographyMappings = 'implementationPeriod/grant/geography/code';
    if (geographyGrouping === 'Portfolio View') {
      geographyMappings =
        'implementationPeriod/grant/geography_PortfolioView/code';
    } else if (geographyGrouping === 'Board Constituency View') {
      geographyMappings =
        'implementationPeriod/grant/geography_BoardConstituencyView/code';
    }
    const filterString1 = await filterFinancialIndicators(
      this.req.query,
      BudgetsTreemapFieldsMapping.urlParams1.replace(
        '<componentField>',
        componentField,
      ),
      geographyMappings,
      `implementationPeriod/grant/${componentField}/name`,
      'budget',
    );
    const url1 = `${urls.FINANCIAL_INDICATORS}/${filterString1}`;
    const nameField1 = BudgetsTreemapFieldsMapping.name.replace(
      '<componentField>',
      componentField,
    );

    let filterString2 = '';
    let url2 = '';
    const nameField2 = BudgetsTreemapFieldsMapping.name.replace(
      '<componentField>',
      `${componentField}.parent`,
    );

    if (componentField === 'activityAreaGroup') {
      filterString2 = await filterFinancialIndicators(
        this.req.query,
        BudgetsTreemapFieldsMapping.urlParams2.replace(
          '<componentField>',
          componentField,
        ),
        geographyMappings,
        `implementationPeriod/grant/${componentField}/parent/name`,
        'budget',
      );
      url2 = `${urls.FINANCIAL_INDICATORS}/${filterString2}`;
    }

    return axios
      .all(
        _.filter([url1, url2], url => url !== '').map((url: string) =>
          axios.get(url),
        ),
      )
      .then(
        axios.spread((...responses) => {
          const rawData1 = _.get(
            responses[0],
            `data.${BudgetsTreemapFieldsMapping.dataPath}`,
            [],
          );
          const rawData2 = _.get(
            responses[1],
            `data.${BudgetsTreemapFieldsMapping.dataPath}`,
            [],
          );

          const data: {
            name: string;
            value: number;
            itemStyle: {
              color: string;
            };
            label: {
              normal: {
                color: string;
              };
            };
          }[] = [];

          (componentField === 'activityAreaGroup'
            ? _.filter(
                rawData1,
                item =>
                  BudgetsTreemapFieldsMapping.url1Items.indexOf(
                    _.get(item, nameField1, ''),
                  ) !== -1,
              )
            : rawData1
          ).forEach((item: any) => {
            data.push({
              name: _.get(item, nameField1, ''),
              value: _.get(item, BudgetsTreemapFieldsMapping.value, 0),
              itemStyle: {
                color: '',
              },
              label: {
                normal: {
                  color: '',
                },
              },
            });
          });

          _.filter(
            rawData2,
            item =>
              BudgetsTreemapFieldsMapping.url2Items.indexOf(
                _.get(item, nameField2, ''),
              ) !== -1,
          ).forEach(item => {
            data.push({
              name: _.get(item, nameField2, ''),
              value: _.get(item, BudgetsTreemapFieldsMapping.value, 0),
              itemStyle: {
                color: '',
              },
              label: {
                normal: {
                  color: '',
                },
              },
            });
          });

          _.orderBy(data, 'value', 'desc').forEach((item, index) => {
            item.itemStyle.color = _.get(
              BudgetsTreemapFieldsMapping.textbgcolors,
              `[${index}].color`,
              '',
            );
            item.label.normal.color = _.get(
              BudgetsTreemapFieldsMapping.textbgcolors,
              `[${index}].textcolor`,
              '',
            );
          });

          return {data};
        }),
      )
      .catch(handleDataApiError);
  }

  @get('/budgets/table/{componentField}/{geographyGrouping}')
  @response(200)
  async table(
    @param.path.string('componentField') _componentField: string,
    @param.path.string('geographyGrouping') geographyGrouping: string,
  ) {
    let geographyMappings = 'implementationPeriod/grant/geography/code';
    if (geographyGrouping === 'Portfolio View') {
      geographyMappings =
        'implementationPeriod/grant/geography_PortfolioView/code';
    } else if (geographyGrouping === 'Board Constituency View') {
      geographyMappings =
        'implementationPeriod/grant/geography_BoardConstituencyView/code';
    }
    let urlParams = BudgetsTableFieldsMapping.urlParams;
    let level1Field = BudgetsTableFieldsMapping.level1Field;
    let level2Field = BudgetsTableFieldsMapping.level2Field;
    let level3Field: string | null = BudgetsTableFieldsMapping.level3Field;
    if (this.req.query.var2) {
      const var2 = this.req.query.var2.toString();
      urlParams = BudgetsTableFieldsMapping.urlParamsVar2.replace(
        /<componentField>/g,
        var2,
      );
      level1Field = BudgetsTableFieldsMapping.level1FieldVar2.replace(
        '<componentField>',
        var2,
      );
      level2Field = BudgetsTableFieldsMapping.level2FieldVar2.replace(
        '<componentField>',
        var2,
      );
      level3Field = null;
    }
    const filterString = await filterFinancialIndicators(
      this.req.query,
      urlParams,
      geographyMappings,
      'implementationPeriod/grant/activityArea/name',
      'budget',
    );
    const url = `${urls.FINANCIAL_INDICATORS}/${filterString}`;

    return axios
      .get(url)
      .then((resp: AxiosResponse) => {
        const rawData = _.get(
          resp.data,
          BudgetsTableFieldsMapping.dataPath,
          [],
        );
        const groupedByLevel1 = _.groupBy(rawData, level1Field);

        const data: {
          name: string;
          amount: number;
          _children: {
            name: string;
            amount: number;
            _children?: {
              name: string;
              amount: number;
            }[];
          }[];
        }[] = [];

        _.forEach(groupedByLevel1, (level1Data, level1) => {
          const grouepdByLevel2 = _.groupBy(level1Data, level2Field);
          const level1Amount = _.sumBy(
            level1Data,
            BudgetsTableFieldsMapping.valueField,
          );
          const level1Children = _.map(
            grouepdByLevel2,
            (level2Data, level2) => {
              const groupedByLevel3 = level3Field
                ? _.groupBy(level2Data, level3Field)
                : {};
              const level2Amount = _.sumBy(
                level2Data,
                BudgetsTableFieldsMapping.valueField,
              );
              return {
                name: level2,
                amount: level2Amount,
                _children: level3Field
                  ? _.map(groupedByLevel3, (level3Data, level3) => {
                      const level3Amount = _.sumBy(
                        level3Data,
                        BudgetsTableFieldsMapping.valueField,
                      );
                      return {
                        name: level3,
                        amount: level3Amount,
                      };
                    })
                  : undefined,
              };
            },
          );
          data.push({
            name: level1,
            amount: level1Amount,
            _children: level1Children,
          });
        });

        return {data};
      })
      .catch(handleDataApiError);
  }

  @get('/budgets/cycles')
  @response(200)
  async cycles() {
    const filterString = await filterFinancialIndicators(
      this.req.query,
      BudgetsCyclesMapping.urlParams,
      'implementationPeriod/grant/geography/code',
      'implementationPeriod/grant/activityArea/name',
      'budget',
    );
    const url = `${urls.FINANCIAL_INDICATORS}/${filterString}`;

    return axios
      .get(url)
      .then(async (resp: AxiosResponse) => {
        const rawData = _.get(resp.data, BudgetsCyclesMapping.dataPath, []);

        const cmsResponse = await axios.get(
          `${process.env.CMS_API}/pages-home?locale=en`,
          {
            headers: {
              Authorization: `Bearer ${process.env.CMS_TOKEN}`,
            },
          },
        );

        const chartCycles = _.get(cmsResponse, 'data.data.chartCycles', []);

        const data = _.orderBy(
          _.map(
            _.filter(
              rawData,
              item =>
                _.get(item, BudgetsCyclesMapping.cycleFrom, null) !== null,
            ),
            item => {
              const from = _.get(item, BudgetsCyclesMapping.cycleFrom, '');
              const to = _.get(item, BudgetsCyclesMapping.cycleTo, '');

              let value = from;

              if (from && to) {
                value = `${from} - ${to}`;
              }

              const name = _.find(chartCycles, {value})?.name ?? value;

              return {
                name,
                value: name,
              };
            },
          ),
          item => parseInt(item.value.toString().split(' - ')[0], 10),
          'asc',
        );

        return {data};
      })
      .catch(handleDataApiError);
  }

  @get('/budgets/breakdown/{cycle}/{componentField}/{geographyGrouping}')
  @response(200)
  async breakdown(
    @param.path.string('cycle') cycle: string,
    @param.path.string('componentField') componentField: string,
    @param.path.string('geographyGrouping') geographyGrouping: string,
  ) {
    let geographyMappings = 'implementationPeriod/grant/geography/code';
    if (geographyGrouping === 'Portfolio View') {
      geographyMappings =
        'implementationPeriod/grant/geography_PortfolioView/code';
    } else if (geographyGrouping === 'Board Constituency View') {
      geographyMappings =
        'implementationPeriod/grant/geography_BoardConstituencyView/code';
    }
    // const years = cycle.split('-');

    const filterString1 = await filterFinancialIndicators(
      {
        ...this.req.query,
        cycleNames: cycle,
        // years: years[0],
        // yearsTo: years[1],
      },
      BudgetsBreakdownFieldsMapping.urlParams1.replace(
        '<componentField>',
        componentField,
      ),
      geographyMappings,
      `implementationPeriod/grant/${componentField}/name`,
      'budget',
    );
    const url1 = `${urls.FINANCIAL_INDICATORS}/${filterString1}`;
    const nameField1 = BudgetsBreakdownFieldsMapping.name.replace(
      '<componentField>',
      componentField,
    );

    let filterString2 = '';
    let url2 = '';
    const nameField2 = BudgetsBreakdownFieldsMapping.name.replace(
      '<componentField>',
      `${componentField}.parent`,
    );

    if (componentField === 'activityAreaGroup') {
      filterString2 = await filterFinancialIndicators(
        {
          ...this.req.query,
          cycleNames: cycle,
          // years: years[0],
          // yearsTo: years[1],
        },
        BudgetsBreakdownFieldsMapping.urlParams2.replace(
          '<componentField>',
          componentField,
        ),
        geographyMappings,
        `implementationPeriod/grant/${componentField}/parent/name`,
        'budget',
      );
      url2 = `${urls.FINANCIAL_INDICATORS}/${filterString2}`;
    }

    return axios
      .all(
        _.filter([url1, url2], url => url !== '').map((url: string) =>
          axios.get(url),
        ),
      )
      .then(
        axios.spread((...responses) => {
          const rawData1 = _.get(
            responses[0],
            `data.${BudgetsTreemapFieldsMapping.dataPath}`,
            [],
          );
          const rawData2 = _.get(
            responses[1],
            `data.${BudgetsTreemapFieldsMapping.dataPath}`,
            [],
          );

          const data: {
            name: string;
            value: number;
            color: string;
          }[] = [];

          (componentField === 'activityAreaGroup'
            ? _.filter(
                rawData1,
                item =>
                  BudgetsTreemapFieldsMapping.url1Items.indexOf(
                    _.get(item, nameField1, ''),
                  ) !== -1,
              )
            : rawData1
          ).forEach((item: any) => {
            data.push({
              name: _.get(item, nameField1, ''),
              value: _.get(item, BudgetsTreemapFieldsMapping.value, 0),
              color: '',
            });
          });

          _.filter(
            rawData2,
            item =>
              BudgetsTreemapFieldsMapping.url2Items.indexOf(
                _.get(item, nameField2, ''),
              ) !== -1,
          ).forEach(item => {
            data.push({
              name: _.get(item, nameField2, ''),
              value: _.get(item, BudgetsTreemapFieldsMapping.value, 0),
              color: '',
            });
          });

          const total = _.sumBy(data, 'value');

          data.forEach(item => {
            item.value = (item.value / total) * 100;
          });

          return {
            data: _.orderBy(data, 'value', 'desc').map((item, index) => {
              item.color = _.get(
                BudgetsBreakdownFieldsMapping.colors,
                index,
                '',
              );
              return item;
            }),
          };
        }),
      )
      .catch(handleDataApiError);
  }

  @get('/budgets/utilization/{componentField}/{geographyGrouping}')
  @response(200)
  async utilization(
    @param.path.string('componentField') componentField: string,
    @param.path.string('geographyGrouping') geographyGrouping: string,
  ) {
    // (disbursement + cash balance) / budget
    let geographyMappings = 'implementationPeriod/grant/geography/code';

    if (geographyGrouping === 'Portfolio View') {
      geographyMappings =
        'implementationPeriod/grant/geography_PortfolioView/code';
    } else if (geographyGrouping === 'Board Constituency View') {
      geographyMappings =
        'implementationPeriod/grant/geography_BoardConstituencyView/code';
    }
    const filterString1 = await filterFinancialIndicators(
      this.req.query,
      BudgetsMetricsFieldsMapping.urlParams,
      geographyMappings,
      `implementationPeriod/grant/${componentField}/name`,
      'budget',
    );
    const filterString2 = await filterFinancialIndicators(
      this.req.query,
      BudgetsMetricsFieldsMapping.urlParamsOrganisations,
      geographyMappings,
      `implementationPeriod/grant/${componentField}/name`,
      'budget',
    );
    const url1 = `${urls.FINANCIAL_INDICATORS}/${filterString1}`;
    const url2 = `${urls.FINANCIAL_INDICATORS}/${filterString2}`;

    return axios
      .all([axios.get(url1), axios.get(url2)])
      .then(
        axios.spread((...responses) => {
          const raw1 = _.get(
            responses[0].data,
            BudgetsMetricsFieldsMapping.dataPath,
            [],
          );
          const raw2 = _.get(
            responses[1].data,
            BudgetsMetricsFieldsMapping.dataPath,
            [],
          );
          const disbursement = _.find(raw1, {
            [BudgetsMetricsFieldsMapping.indicatorNameField]:
              BudgetsMetricsFieldsMapping.disbursementIndicatorName,
          });
          const cashBalance = _.find(raw1, {
            [BudgetsMetricsFieldsMapping.indicatorNameField]:
              BudgetsMetricsFieldsMapping.cashBalanceIndicatorName,
          });
          const budget = _.find(raw1, {
            [BudgetsMetricsFieldsMapping.indicatorNameField]:
              BudgetsMetricsFieldsMapping.budgetIndicatorName,
          });
          const disbursementValue = _.get(
            disbursement,
            BudgetsMetricsFieldsMapping.disbursementValue,
            0,
          );
          const cashBalanceValue = _.get(
            cashBalance,
            BudgetsMetricsFieldsMapping.cashBalanceValue,
            0,
          );
          const budgetValue = _.get(
            budget,
            BudgetsMetricsFieldsMapping.budgetValue,
            0,
          );
          const totalValue = disbursementValue + cashBalanceValue;
          const utilization = (totalValue / budgetValue) * 100;

          const groupedByOrganisationType = _.groupBy(
            raw2,
            BudgetsMetricsFieldsMapping.organisationType,
          );
          const items = _.map(groupedByOrganisationType, (value, key) => {
            const disbursement1 = _.filter(
              value,
              (item: any) =>
                item[BudgetsMetricsFieldsMapping.indicatorNameField] ===
                BudgetsMetricsFieldsMapping.disbursementIndicatorName,
            );
            const cashBalance1 = _.filter(
              value,
              (item: any) =>
                item[BudgetsMetricsFieldsMapping.indicatorNameField] ===
                BudgetsMetricsFieldsMapping.cashBalanceIndicatorName,
            );
            const budget1 = _.filter(
              value,
              (item: any) =>
                item[BudgetsMetricsFieldsMapping.indicatorNameField] ===
                BudgetsMetricsFieldsMapping.budgetIndicatorName,
            );
            const disbursementValue1 = _.sumBy(
              disbursement1,
              BudgetsMetricsFieldsMapping.disbursementValue,
            );
            const cashBalanceValue1 = _.sumBy(
              cashBalance1,
              BudgetsMetricsFieldsMapping.cashBalanceValue,
            );
            const budgetValue1 = _.sumBy(
              budget1,
              BudgetsMetricsFieldsMapping.budgetValue,
            );
            const totalValue1 = disbursementValue1 + cashBalanceValue1;
            const utilization1 = (totalValue1 / budgetValue1) * 100;
            const groupedBySubOrganisations = _.groupBy(
              value,
              BudgetsMetricsFieldsMapping.organisationSubType,
            );
            return {
              level: 0,
              name: key,
              value: utilization1,
              color: '#013E77',
              items: _.orderBy(
                _.map(groupedBySubOrganisations, (value2, key2) => {
                  const disbursement2 = _.filter(
                    value2,
                    (item: any) =>
                      item[BudgetsMetricsFieldsMapping.indicatorNameField] ===
                      BudgetsMetricsFieldsMapping.disbursementIndicatorName,
                  );
                  const cashBalance2 = _.filter(
                    value2,
                    (item: any) =>
                      item[BudgetsMetricsFieldsMapping.indicatorNameField] ===
                      BudgetsMetricsFieldsMapping.cashBalanceIndicatorName,
                  );
                  const budget2 = _.filter(
                    value2,
                    (item: any) =>
                      item[BudgetsMetricsFieldsMapping.indicatorNameField] ===
                      BudgetsMetricsFieldsMapping.budgetIndicatorName,
                  );
                  const disbursementValue2 = _.sumBy(
                    disbursement2,
                    BudgetsMetricsFieldsMapping.disbursementValue,
                  );
                  const cashBalanceValue2 = _.sumBy(
                    cashBalance2,
                    BudgetsMetricsFieldsMapping.cashBalanceValue,
                  );
                  const budgetValue2 = _.sumBy(
                    budget2,
                    BudgetsMetricsFieldsMapping.budgetValue,
                  );
                  const totalValue2 = disbursementValue2 + cashBalanceValue2;
                  const utilization2 = (totalValue2 / budgetValue2) * 100;
                  const groupedByOrganisations = _.groupBy(
                    value2,
                    BudgetsMetricsFieldsMapping.organisationName,
                  );
                  return {
                    level: 1,
                    name: key2,
                    value: utilization2,
                    color: '#013E77',
                    items: _.orderBy(
                      _.map(groupedByOrganisations, (value3, key3) => {
                        const disbursement3 = _.filter(
                          value3,
                          (item: any) =>
                            item[
                              BudgetsMetricsFieldsMapping.indicatorNameField
                            ] ===
                            BudgetsMetricsFieldsMapping.disbursementIndicatorName,
                        );
                        const cashBalance3 = _.filter(
                          value3,
                          (item: any) =>
                            item[
                              BudgetsMetricsFieldsMapping.indicatorNameField
                            ] ===
                            BudgetsMetricsFieldsMapping.cashBalanceIndicatorName,
                        );
                        const budget3 = _.filter(
                          value3,
                          (item: any) =>
                            item[
                              BudgetsMetricsFieldsMapping.indicatorNameField
                            ] ===
                            BudgetsMetricsFieldsMapping.budgetIndicatorName,
                        );
                        const disbursementValue3 = _.sumBy(
                          disbursement3,
                          BudgetsMetricsFieldsMapping.disbursementValue,
                        );
                        const cashBalanceValue3 = _.sumBy(
                          cashBalance3,
                          BudgetsMetricsFieldsMapping.cashBalanceValue,
                        );
                        const budgetValue3 = _.sumBy(
                          budget3,
                          BudgetsMetricsFieldsMapping.budgetValue,
                        );
                        const totalValue3 =
                          disbursementValue3 + cashBalanceValue3;
                        const utilization3 = (totalValue3 / budgetValue3) * 100;
                        return {
                          level: 2,
                          name: key3,
                          value: utilization3,
                          color: '#013E77',
                          items: [],
                        };
                      }),
                      'name',
                      'asc',
                    ),
                  };
                }),
                'name',
                'asc',
              ),
            };
          });

          return {
            data: [
              {
                value: utilization,
                items: _.orderBy(items, 'name', 'asc'),
              },
            ],
          };
        }),
      )
      .catch(handleDataApiError);
  }

  @get('/budgets/absorption/{componentField}/{geographyGrouping}')
  @response(200)
  async absorption(
    @param.path.string('componentField') componentField: string,
    @param.path.string('geographyGrouping') geographyGrouping: string,
  ) {
    // expenditure / budget
    let geographyMappings = 'implementationPeriod/grant/geography/code';
    if (geographyGrouping === 'Portfolio View') {
      geographyMappings =
        'implementationPeriod/grant/geography_PortfolioView/code';
    } else if (geographyGrouping === 'Board Constituency View') {
      geographyMappings =
        'implementationPeriod/grant/geography_BoardConstituencyView/code';
    }
    const filterString1 = await filterFinancialIndicators(
      this.req.query,
      BudgetsMetricsFieldsMapping.urlParams,
      geographyMappings,
      `implementationPeriod/grant/${componentField}/name`,
      'budget',
    );
    const filterString2 = await filterFinancialIndicators(
      this.req.query,
      BudgetsMetricsFieldsMapping.urlParamsOrganisations,
      geographyMappings,
      `implementationPeriod/grant/${componentField}/name`,
      'budget',
    );
    const url1 = `${urls.FINANCIAL_INDICATORS}/${filterString1}`;
    const url2 = `${urls.FINANCIAL_INDICATORS}/${filterString2}`;

    return axios
      .all([axios.get(url1), axios.get(url2)])
      .then(
        axios.spread((...responses) => {
          const raw1 = _.get(
            responses[0].data,
            BudgetsMetricsFieldsMapping.dataPath,
            [],
          );
          const raw2 = _.get(
            responses[1].data,
            BudgetsMetricsFieldsMapping.dataPath,
            [],
          );
          const expenditure = _.find(raw1, {
            [BudgetsMetricsFieldsMapping.indicatorNameField]:
              BudgetsMetricsFieldsMapping.expenditureIndicatorName,
          });
          const budget = _.find(raw1, {
            [BudgetsMetricsFieldsMapping.indicatorNameField]:
              BudgetsMetricsFieldsMapping.budgetIndicatorName,
          });
          const expenditureValue = _.get(
            expenditure,
            BudgetsMetricsFieldsMapping.expenditureValue,
            0,
          );
          const budgetValue = _.get(
            budget,
            BudgetsMetricsFieldsMapping.budgetValue,
            0,
          );
          const absorption = (expenditureValue / budgetValue) * 100;

          const groupedByOrganisationType = _.groupBy(
            raw2,
            BudgetsMetricsFieldsMapping.organisationType,
          );
          const items = _.map(groupedByOrganisationType, (value, key) => {
            const expenditure1 = _.filter(
              value,
              (item: any) =>
                item[BudgetsMetricsFieldsMapping.indicatorNameField] ===
                BudgetsMetricsFieldsMapping.expenditureIndicatorName,
            );
            const budget1 = _.filter(
              value,
              (item: any) =>
                item[BudgetsMetricsFieldsMapping.indicatorNameField] ===
                BudgetsMetricsFieldsMapping.budgetIndicatorName,
            );
            const expenditureValue1 = _.sumBy(
              expenditure1,
              BudgetsMetricsFieldsMapping.expenditureValue,
            );
            const budgetValue1 = _.sumBy(
              budget1,
              BudgetsMetricsFieldsMapping.budgetValue,
            );
            const absorption1 = (expenditureValue1 / budgetValue1) * 100;
            const groupedBySubOrganisations = _.groupBy(
              value,
              BudgetsMetricsFieldsMapping.organisationSubType,
            );
            return {
              level: 0,
              name: key,
              value: absorption1,
              color: '#00B5AE',
              items: _.orderBy(
                _.map(groupedBySubOrganisations, (value2, key2) => {
                  const expenditure2 = _.filter(
                    value2,
                    (item: any) =>
                      item[BudgetsMetricsFieldsMapping.indicatorNameField] ===
                      BudgetsMetricsFieldsMapping.expenditureIndicatorName,
                  );
                  const budget2 = _.filter(
                    value2,
                    (item: any) =>
                      item[BudgetsMetricsFieldsMapping.indicatorNameField] ===
                      BudgetsMetricsFieldsMapping.budgetIndicatorName,
                  );
                  const expenditureValue2 = _.sumBy(
                    expenditure2,
                    BudgetsMetricsFieldsMapping.expenditureValue,
                  );
                  const budgetValue2 = _.sumBy(
                    budget2,
                    BudgetsMetricsFieldsMapping.budgetValue,
                  );
                  const absorption2 = (expenditureValue2 / budgetValue2) * 100;
                  const groupedByOrganisations = _.groupBy(
                    value2,
                    BudgetsMetricsFieldsMapping.organisationName,
                  );
                  return {
                    level: 1,
                    name: key2,
                    value: absorption2,
                    color: '#00B5AE',
                    items: _.orderBy(
                      _.map(groupedByOrganisations, (value3, key3) => {
                        const expenditure3 = _.filter(
                          value3,
                          (item: any) =>
                            item[
                              BudgetsMetricsFieldsMapping.indicatorNameField
                            ] ===
                            BudgetsMetricsFieldsMapping.expenditureIndicatorName,
                        );
                        const budget3 = _.filter(
                          value3,
                          (item: any) =>
                            item[
                              BudgetsMetricsFieldsMapping.indicatorNameField
                            ] ===
                            BudgetsMetricsFieldsMapping.budgetIndicatorName,
                        );
                        const expenditureValue3 = _.sumBy(
                          expenditure3,
                          BudgetsMetricsFieldsMapping.expenditureValue,
                        );
                        const budgetValue3 = _.sumBy(
                          budget3,
                          BudgetsMetricsFieldsMapping.budgetValue,
                        );
                        const absorption3 =
                          (expenditureValue3 / budgetValue3) * 100;
                        return {
                          level: 2,
                          name: key3,
                          value: absorption3,
                          color: '#00B5AE',
                          items: [],
                        };
                      }),
                      'name',
                      'asc',
                    ),
                  };
                }),
                'name',
                'asc',
              ),
            };
          });

          return {
            data: [
              {
                value: absorption,
                items: _.orderBy(items, 'name', 'asc'),
              },
            ],
          };
        }),
      )
      .catch(handleDataApiError);
  }

  @get('/disbursements/utilization/{componentField}/{geographyGrouping}')
  @response(200)
  async disbursementsUtilization(
    @param.path.string('componentField') componentField: string,
    @param.path.string('geographyGrouping') geographyGrouping: string,
  ) {
    // expenditure / disbursement
    let geographyMappings = 'implementationPeriod/grant/geography/code';
    if (geographyGrouping === 'Portfolio View') {
      geographyMappings =
        'implementationPeriod/grant/geography_PortfolioView/code';
    } else if (geographyGrouping === 'Board Constituency View') {
      geographyMappings =
        'implementationPeriod/grant/geography_BoardConstituencyView/code';
    }
    const filterString1 = await filterFinancialIndicators(
      this.req.query,
      BudgetsMetricsFieldsMapping.urlParams,
      geographyMappings,
      `implementationPeriod/grant/${componentField}/name`,
      'budget',
    );
    const filterString2 = await filterFinancialIndicators(
      this.req.query,
      BudgetsMetricsFieldsMapping.urlParamsOrganisations,
      geographyMappings,
      `implementationPeriod/grant/${componentField}/name`,
      'budget',
    );
    const url1 = `${urls.FINANCIAL_INDICATORS}/${filterString1}`;
    const url2 = `${urls.FINANCIAL_INDICATORS}/${filterString2}`;

    return axios
      .all([axios.get(url1), axios.get(url2)])
      .then(
        axios.spread((...responses) => {
          const raw1 = _.get(
            responses[0].data,
            BudgetsMetricsFieldsMapping.dataPath,
            [],
          );
          const raw2 = _.get(
            responses[1].data,
            BudgetsMetricsFieldsMapping.dataPath,
            [],
          );
          const expenditure = _.find(raw1, {
            [BudgetsMetricsFieldsMapping.indicatorNameField]:
              BudgetsMetricsFieldsMapping.expenditureIndicatorName,
          });
          const disbursement = _.find(raw1, {
            [BudgetsMetricsFieldsMapping.indicatorNameField]:
              BudgetsMetricsFieldsMapping.disbursementIndicatorName,
          });
          const expenditureValue = _.get(
            expenditure,
            BudgetsMetricsFieldsMapping.expenditureValue,
            0,
          );
          const disbursementValue = _.get(
            disbursement,
            BudgetsMetricsFieldsMapping.disbursementValue,
            0,
          );
          const utilization = (expenditureValue / disbursementValue) * 100;

          const groupedByOrganisationType = _.groupBy(
            raw2,
            BudgetsMetricsFieldsMapping.organisationType,
          );
          const items = _.map(groupedByOrganisationType, (value, key) => {
            const expenditure1 = _.filter(
              value,
              (item: any) =>
                item[BudgetsMetricsFieldsMapping.indicatorNameField] ===
                BudgetsMetricsFieldsMapping.expenditureIndicatorName,
            );
            const disbursement1 = _.filter(
              value,
              (item: any) =>
                item[BudgetsMetricsFieldsMapping.indicatorNameField] ===
                BudgetsMetricsFieldsMapping.disbursementIndicatorName,
            );
            const expenditureValue1 = _.sumBy(
              expenditure1,
              BudgetsMetricsFieldsMapping.expenditureValue,
            );
            const disbursementValue1 = _.sumBy(
              disbursement1,
              BudgetsMetricsFieldsMapping.disbursementValue,
            );
            const utilization1 = (expenditureValue1 / disbursementValue1) * 100;
            const groupedBySubOrganisations = _.groupBy(
              value,
              BudgetsMetricsFieldsMapping.organisationSubType,
            );
            return {
              level: 0,
              name: key,
              value: utilization1,
              color: '#0A2840',
              items: _.orderBy(
                _.map(groupedBySubOrganisations, (value2, key2) => {
                  const expenditure2 = _.filter(
                    value2,
                    (item: any) =>
                      item[BudgetsMetricsFieldsMapping.indicatorNameField] ===
                      BudgetsMetricsFieldsMapping.expenditureIndicatorName,
                  );
                  const disbursement2 = _.filter(
                    value2,
                    (item: any) =>
                      item[BudgetsMetricsFieldsMapping.indicatorNameField] ===
                      BudgetsMetricsFieldsMapping.disbursementIndicatorName,
                  );
                  const expenditureValue2 = _.sumBy(
                    expenditure2,
                    BudgetsMetricsFieldsMapping.expenditureValue,
                  );
                  const disbursementValue2 = _.sumBy(
                    disbursement2,
                    BudgetsMetricsFieldsMapping.disbursementValue,
                  );
                  const utilization2 =
                    (expenditureValue2 / disbursementValue2) * 100;
                  const groupedByOrganisations = _.groupBy(
                    value2,
                    BudgetsMetricsFieldsMapping.organisationName,
                  );
                  return {
                    level: 1,
                    name: key2,
                    value: utilization2,
                    color: '#0A2840',
                    items: _.orderBy(
                      _.map(groupedByOrganisations, (value3, key3) => {
                        const expenditure3 = _.filter(
                          value3,
                          (item: any) =>
                            item[
                              BudgetsMetricsFieldsMapping.indicatorNameField
                            ] ===
                            BudgetsMetricsFieldsMapping.expenditureIndicatorName,
                        );
                        const disbursement3 = _.filter(
                          value3,
                          (item: any) =>
                            item[
                              BudgetsMetricsFieldsMapping.indicatorNameField
                            ] ===
                            BudgetsMetricsFieldsMapping.disbursementIndicatorName,
                        );
                        const expenditureValue3 = _.sumBy(
                          expenditure3,
                          BudgetsMetricsFieldsMapping.expenditureValue,
                        );
                        const disbursementValue3 = _.sumBy(
                          disbursement3,
                          BudgetsMetricsFieldsMapping.disbursementValue,
                        );
                        const utilization3 =
                          (expenditureValue3 / disbursementValue3) * 100;
                        return {
                          level: 2,
                          name: key3,
                          value: utilization3,
                          color: '#0A2840',
                          items: [],
                        };
                      }),
                      'name',
                      'asc',
                    ),
                  };
                }),
                'name',
                'asc',
              ),
            };
          });

          return {
            data: [
              {
                value: utilization,
                items: _.orderBy(items, 'name', 'asc'),
              },
            ],
          };
        }),
      )
      .catch(handleDataApiError);
  }

  @get('/financial-metrics/cycles')
  @response(200)
  async metricsCycles() {
    const filterString = await filterFinancialIndicators(
      this.req.query,
      BudgetsCyclesMapping.urlParamsMetrics,
      'implementationPeriod/grant/geography/code',
      'implementationPeriod/grant/activityArea/name',
      'budget',
    );
    const url = `${urls.FINANCIAL_INDICATORS}/${filterString}`;

    return axios
      .get(url)
      .then(async (resp: AxiosResponse) => {
        const rawData = _.get(resp.data, BudgetsCyclesMapping.dataPath, []);

        const cmsResponse = await axios.get(
          `${process.env.CMS_API}/pages-home?locale=en`,
          {
            headers: {
              Authorization: `Bearer ${process.env.CMS_TOKEN}`,
            },
          },
        );

        const chartCycles = _.get(cmsResponse, 'data.data.chartCycles', []);

        const data = _.orderBy(
          _.map(
            _.filter(
              rawData,
              item =>
                _.get(item, BudgetsCyclesMapping.cycleFrom, null) !== null,
            ),
            item => {
              const from = _.get(item, BudgetsCyclesMapping.cycleFrom, '');
              const to = _.get(item, BudgetsCyclesMapping.cycleTo, '');

              let value = from;

              if (from && to) {
                value = `${from} - ${to}`;
              }

              const name = _.find(chartCycles, {value})?.name ?? value;

              return {
                name,
                value: name,
              };
            },
          ),
          item => parseInt(item.value.toString().split(' - ')[0], 10),
          'asc',
        );

        return {data};
      })
      .catch(handleDataApiError);
  }
}
