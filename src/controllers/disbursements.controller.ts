import {inject} from '@loopback/core';
import {get, param, Request, response, RestBindings} from '@loopback/rest';
import axios, {AxiosResponse} from 'axios';
import _ from 'lodash';
import BarChartFieldsMapping from '../config/mapping/disbursements/barChart.json';
import DisbursementsCyclesMapping from '../config/mapping/disbursements/cycles.json';
import HolisticGrantInvestmentsMapping from '../config/mapping/disbursements/holisticGrantInvestments.json';
import LineChartFieldsMapping from '../config/mapping/disbursements/lineChart.json';
import TableFieldsMapping from '../config/mapping/disbursements/table.json';
import FinancialInsightsStatsMapping from '../config/mapping/financialInsightsStats.json';
import urls from '../config/urls/index.json';
import {BudgetSankeyChartData} from '../interfaces/budgetSankey';
import {handleDataApiError} from '../utils/dataApiError';
import {filterFinancialIndicators} from '../utils/filtering/financialIndicators';

export class DisbursementsController {
  constructor(@inject(RestBindings.Http.REQUEST) private req: Request) {}

  @get('/financial-insights/stats/{componentField}/{geographyGrouping}')
  @response(200)
  async financialInsightsStats(
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
      FinancialInsightsStatsMapping.urlParams,
      geographyMappings,
      `${componentField}/name`,
      'disbursement',
    );
    const url = `${urls.FINANCIAL_INDICATORS}/${filterString}`;

    return axios
      .get(url)
      .then((resp: AxiosResponse) => {
        const raw = _.get(
          resp.data,
          FinancialInsightsStatsMapping.dataPath,
          [],
        );
        return {
          data: [
            {
              signed: _.get(
                _.find(raw, {
                  [FinancialInsightsStatsMapping.indicatorField]:
                    FinancialInsightsStatsMapping.signed,
                }),
                FinancialInsightsStatsMapping.valueField,
                0,
              ),
              committed: _.get(
                _.find(raw, {
                  [FinancialInsightsStatsMapping.indicatorField]:
                    FinancialInsightsStatsMapping.commitment,
                }),
                FinancialInsightsStatsMapping.valueField,
                0,
              ),
              disbursed: _.get(
                _.find(raw, {
                  [FinancialInsightsStatsMapping.indicatorField]:
                    FinancialInsightsStatsMapping.disbursement,
                }),
                FinancialInsightsStatsMapping.valueField,
                0,
              ),
            },
          ],
        };
      })
      .catch(handleDataApiError);
  }

  @get('/disbursements/bar-chart/{componentField}/{geographyGrouping}')
  @response(200)
  async barChart(
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
      BarChartFieldsMapping.urlParams1.replace(
        '<componentField>',
        componentField,
      ),
      geographyMappings,
      `implementationPeriod/grant/${componentField}/name`,
      'disbursement',
    );
    const url1 = `${urls.FINANCIAL_INDICATORS}/${filterString1}`;
    const nameField1 = BarChartFieldsMapping.name.replace(
      '<componentField>',
      componentField,
    );

    let filterString2 = '';
    let url2 = '';
    const nameField2 = BarChartFieldsMapping.name.replace(
      '<componentField>',
      `${componentField}.parent`,
    );

    if (componentField === 'activityAreaGroup') {
      filterString2 = await filterFinancialIndicators(
        this.req.query,
        BarChartFieldsMapping.urlParams2.replace(
          '<componentField>',
          componentField,
        ),
        geographyMappings,
        `implementationPeriod/grant/${componentField}/parent/name`,
        'disbursement',
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
            `data.${BarChartFieldsMapping.dataPath}`,
            [],
          );
          const rawData2 = _.get(
            responses[1],
            `data.${BarChartFieldsMapping.dataPath}`,
            [],
          );

          const data: {
            name: string;
            value: number;
            itemStyle: {color: string};
          }[] = [];

          (componentField === 'activityAreaGroup'
            ? _.filter(
                rawData1,
                item =>
                  BarChartFieldsMapping.url1Items.indexOf(
                    _.get(item, nameField1, ''),
                  ) !== -1,
              )
            : rawData1
          ).forEach((item: any) => {
            data.push({
              name: _.get(item, nameField1, ''),
              value: _.get(item, BarChartFieldsMapping.value, 0),
              itemStyle: {
                color: BarChartFieldsMapping.barColor,
              },
            });
          });

          _.filter(
            rawData2,
            item =>
              BarChartFieldsMapping.url2Items.indexOf(
                _.get(item, nameField2, ''),
              ) !== -1,
          ).forEach((item: any) => {
            data.push({
              name: _.get(item, nameField2, ''),
              value: _.get(item, BarChartFieldsMapping.value, 0),
              itemStyle: {
                color: BarChartFieldsMapping.barColor,
              },
            });
          });

          return {data: _.orderBy(data, 'value', 'desc')};
        }),
      )
      .catch(handleDataApiError);
  }

  @get('/disbursements/line-chart/{componentField}/{geographyGrouping}')
  @response(200)
  async lineChart(
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
      LineChartFieldsMapping.urlParams1.replace(
        '<componentField>',
        componentField,
      ),
      geographyMappings,
      `implementationPeriod/grant/${componentField}/name`,
      'disbursement',
    );
    const url1 = `${urls.FINANCIAL_INDICATORS}/${filterString1}`;
    const nameField1 = LineChartFieldsMapping.line.replace(
      '<componentField>',
      componentField,
    );

    let filterString2 = '';
    let url2 = '';
    const nameField2 = LineChartFieldsMapping.line.replace(
      '<componentField>',
      `${componentField}.parent`,
    );

    if (componentField === 'activityAreaGroup') {
      filterString2 = await filterFinancialIndicators(
        this.req.query,
        LineChartFieldsMapping.urlParams2.replace(
          '<componentField>',
          componentField,
        ),
        geographyMappings,
        `implementationPeriod/grant/${componentField}/parent/name`,
        'disbursement',
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
            `data.${LineChartFieldsMapping.dataPath}`,
            [],
          );
          const rawData2 = _.get(
            responses[1],
            `data.${LineChartFieldsMapping.dataPath}`,
            [],
          );

          const data: {
            name: string;
            data: number[];
            itemStyle: {color: string};
          }[] = [];

          const groupedByLine1 = _.groupBy(rawData1, nameField1);
          const lines1 = Object.keys(groupedByLine1);
          const years1 = Object.keys(
            _.groupBy(rawData1, LineChartFieldsMapping.cycle),
          );

          const groupedByLine2 = _.groupBy(rawData2, nameField2);
          const lines2 = Object.keys(groupedByLine2);
          const years2 = Object.keys(
            _.groupBy(rawData2, LineChartFieldsMapping.cycle),
          );

          const years = _.uniq([...years1, ...years2]);

          (componentField === 'activityAreaGroup'
            ? _.filter(
                lines1,
                item => LineChartFieldsMapping.url1Items.indexOf(item) !== -1,
              )
            : lines1
          ).forEach(line => {
            const items = groupedByLine1[line];
            data.push({
              name: line,
              data: years.map(year => {
                return _.get(
                  _.find(items, {
                    [LineChartFieldsMapping.cycle]: year,
                  }),
                  LineChartFieldsMapping.value,
                  null,
                );
              }),
              itemStyle: {
                color: '',
              },
            });
          });

          _.filter(
            lines2,
            item => LineChartFieldsMapping.url2Items.indexOf(item) !== -1,
          ).forEach(line => {
            const items = groupedByLine2[line];
            data.push({
              name: line,
              data: years.map(year => {
                return _.get(
                  _.find(items, {
                    [LineChartFieldsMapping.cycle]: year,
                  }),
                  LineChartFieldsMapping.value,
                  null,
                );
              }),
              itemStyle: {
                color: '',
              },
            });
          });

          _.orderBy(data, 'name', 'asc').forEach((item, index) => {
            item.itemStyle.color = _.get(
              LineChartFieldsMapping.colors,
              `[${index}]`,
              '',
            );
          });

          return {
            data,
            xAxisKeys: years,
          };
        }),
      )
      .catch(handleDataApiError);
  }

  @get('/disbursements/table/{componentField}/{geographyGrouping}')
  @response(200)
  async table(
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
      TableFieldsMapping.urlParams1.replace('<componentField>', componentField),
      geographyMappings,
      `implementationPeriod/grant/${componentField}/name`,
      'disbursement',
    );
    const url1 = `${urls.FINANCIAL_INDICATORS}/${filterString1}`;
    const nameField1 = TableFieldsMapping.component.replace(
      '<componentField>',
      componentField,
    );

    let filterString2 = '';
    let url2 = '';
    const nameField2 = TableFieldsMapping.component.replace(
      '<componentField>',
      `${componentField}.parent`,
    );

    if (componentField === 'activityAreaGroup') {
      filterString2 = await filterFinancialIndicators(
        this.req.query,
        TableFieldsMapping.urlParams2.replace(
          '<componentField>',
          componentField,
        ),
        geographyMappings,
        `implementationPeriod/grant/${componentField}/parent/name`,
        'disbursement',
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
            `data.${TableFieldsMapping.dataPath}`,
            [],
          );
          const rawData2 = _.get(
            responses[1],
            `data.${TableFieldsMapping.dataPath}`,
            [],
          );

          const groupedByComponent1 = _.groupBy(rawData1, nameField1);
          const groupedByComponent2 = _.groupBy(rawData2, nameField2);

          return {
            data: _.orderBy(
              [
                ...(componentField === 'activityAreaGroup'
                  ? _.filter(groupedByComponent1, (_var, component) => {
                      return (
                        TableFieldsMapping.url1Items.indexOf(component) !== -1
                      );
                    })
                  : _.map(groupedByComponent1)
                ).map(items => {
                  return {
                    component: _.get(items[0], nameField1, ''),
                    grants: _.get(items[0], TableFieldsMapping.grants, 0),
                    signed: _.get(
                      _.find(items, {
                        [TableFieldsMapping.indicatorField]:
                          TableFieldsMapping.signedIndicator,
                      }),
                      TableFieldsMapping.valueField,
                      0,
                    ),
                    committed: _.get(
                      _.find(items, {
                        [TableFieldsMapping.indicatorField]:
                          TableFieldsMapping.commitmentIndicator,
                      }),
                      TableFieldsMapping.valueField,
                      0,
                    ),
                    disbursed: _.get(
                      _.find(items, {
                        [TableFieldsMapping.indicatorField]:
                          TableFieldsMapping.disbursementIndicator,
                      }),
                      TableFieldsMapping.valueField,
                      0,
                    ),
                  };
                }),
                ..._.filter(groupedByComponent2, (_var, component) => {
                  return TableFieldsMapping.url2Items.indexOf(component) !== -1;
                }).map(items => {
                  return {
                    component: _.get(items[0], nameField2, ''),
                    grants: _.get(items[0], TableFieldsMapping.grants, 0),
                    signed: _.get(
                      _.find(items, {
                        [TableFieldsMapping.indicatorField]:
                          TableFieldsMapping.signedIndicator,
                      }),
                      TableFieldsMapping.valueField,
                      0,
                    ),
                    committed: _.get(
                      _.find(items, {
                        [TableFieldsMapping.indicatorField]:
                          TableFieldsMapping.commitmentIndicator,
                      }),
                      TableFieldsMapping.valueField,
                      0,
                    ),
                    disbursed: _.get(
                      _.find(items, {
                        [TableFieldsMapping.indicatorField]:
                          TableFieldsMapping.disbursementIndicator,
                      }),
                      TableFieldsMapping.valueField,
                      0,
                    ),
                  };
                }),
              ],
              'disbursed',
              'desc',
            ),
          };
        }),
      )
      .catch(handleDataApiError);
  }

  @get('/disbursements/hgi/sankey')
  @response(200)
  async holisticGrantInvestmentsSankey() {
    const filterString = await filterFinancialIndicators(
      this.req.query,
      HolisticGrantInvestmentsMapping.urlParams,
      'implementationPeriod/grant/geography/code',
      'implementationPeriod/grant/activityArea/name',
      'disbursement',
    );
    const url = `${urls.FINANCIAL_INDICATORS}/${filterString}&t=t`;

    return axios
      .get(url)
      .then((resp: AxiosResponse) => {
        const rawData = _.get(
          resp.data,
          HolisticGrantInvestmentsMapping.dataPath,
          [],
        );

        const data: BudgetSankeyChartData = {
          nodes: [
            {
              name: 'Total Disbursed',
              level: 0,
              itemStyle: {
                color: HolisticGrantInvestmentsMapping.nodeColors[0],
              },
            },
          ],
          links: [],
        };

        const groupedDataLevel1 = _.groupBy(
          rawData,
          HolisticGrantInvestmentsMapping.level1Field,
        );
        _.forEach(groupedDataLevel1, (level1Data, level1) => {
          data.nodes.push({
            name: level1,
            level: 1,
            itemStyle: {
              color: HolisticGrantInvestmentsMapping.nodeColors[1],
            },
          });
          data.links.push({
            source: data.nodes[0].name,
            target: level1,
            value: _.sumBy(
              level1Data,
              HolisticGrantInvestmentsMapping.valueField,
            ),
          });

          const groupedDataLevel2 = _.groupBy(
            level1Data,
            HolisticGrantInvestmentsMapping.level2Field,
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
                color: HolisticGrantInvestmentsMapping.nodeColors[2],
              },
            });
            data.links.push({
              source: level1,
              target: level2inLevel1 ? `${level2}1` : level2,
              value: _.sumBy(
                level2Data,
                HolisticGrantInvestmentsMapping.valueField,
              ),
            });
          });
        });
        data.nodes = _.uniqBy(data.nodes, 'name');
        data.nodes = _.orderBy(
          _.map(data.nodes, node => {
            return {
              ...node,
              value: _.sumBy(
                _.filter(data.links, {target: node.name}),
                'value',
              ),
            };
          }),
          'value',
          'asc',
        );
        const rootNodeIndex = _.findIndex(data.nodes, {level: 0});
        data.nodes[rootNodeIndex].value = _.sumBy(data.nodes, node =>
          node.level === 1 && node.value ? node.value : 0,
        );
        data.nodes = _.uniqBy(data.nodes, 'name');
        data.nodes = _.orderBy(
          data.nodes,
          node => {
            if (node.level === 0) {
              return [node.value, node.value];
            }
            if (node.level === 1) {
              const nodeLinks = _.filter(data.links, {source: node.name});
              return [_.sumBy(nodeLinks, 'value'), node.value];
            }
            const source = _.find(data.links, {target: node.name})?.source;
            return [_.find(data.nodes, {name: source})?.value, node.value];
          },
          ['desc', 'desc'],
        );
        data.nodes = _.orderBy(data.nodes, 'level', 'asc');
        data.links = _.filter(data.links, link => link.source !== link.target);
        data.links = _.orderBy(data.links, 'value', 'desc');
        return {data};
      })
      .catch(handleDataApiError);
  }

  @get('/disbursements/hgi/table')
  @response(200)
  async holisticGrantInvestmentsTable() {
    const filterString = await filterFinancialIndicators(
      this.req.query,
      HolisticGrantInvestmentsMapping.urlParams,
      'implementationPeriod/grant/geography/code',
      'implementationPeriod/grant/activityArea/name',
      'disbursement',
    );
    const url = `${urls.FINANCIAL_INDICATORS}/${filterString}`;

    return axios
      .get(url)
      .then((resp: AxiosResponse) => {
        const rawData = _.get(
          resp.data,
          HolisticGrantInvestmentsMapping.dataPath,
          [],
        );
        const groupedByLevel1 = _.groupBy(
          rawData,
          HolisticGrantInvestmentsMapping.level1Field,
        );

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
          const grouepdByLevel2 = _.groupBy(
            level1Data,
            HolisticGrantInvestmentsMapping.level2Field,
          );
          const level1Amount = _.sumBy(
            level1Data,
            HolisticGrantInvestmentsMapping.valueField,
          );
          const level1Children = _.map(
            grouepdByLevel2,
            (level2Data, level2) => {
              const level2Amount = _.sumBy(
                level2Data,
                HolisticGrantInvestmentsMapping.valueField,
              );
              return {
                name: level2,
                amount: level2Amount,
              };
            },
          );
          data.push({
            name: level1,
            amount: level1Amount,
            _children: level1Children,
          });
        });

        return {
          data: [
            {
              name: 'Total Disbursed',
              amount: _.sumBy(data, 'amount'),
              _children: data,
            },
          ],
        };
      })
      .catch(handleDataApiError);
  }

  @get('/disbursements/cycles')
  @response(200)
  async cycles() {
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
      DisbursementsCyclesMapping.urlParams,
      geographyMappings,
      'activityArea/name',
      'disbursement',
    );
    const url = `${urls.FINANCIAL_INDICATORS}/${filterString}`;

    return axios
      .get(url)
      .then(async (resp: AxiosResponse) => {
        const rawData = _.get(
          resp.data,
          DisbursementsCyclesMapping.dataPath,
          [],
        );

        const cmsResponse = await axios.get(
          `${process.env.CMS_API}/pages-home?locale=en`,
          {
            headers: {
              Authorization: `Bearer ${process.env.CMS_TOKEN}`,
            },
          },
        );

        const chartCycles = _.get(cmsResponse, 'data.data.chartCycles', []);

        const data = _.map(
          _.filter(
            rawData,
            item =>
              _.get(item, DisbursementsCyclesMapping.cycleFrom, null) !== null,
          ),
          item => {
            const from = _.get(item, DisbursementsCyclesMapping.cycleFrom, '');
            const to = _.get(item, DisbursementsCyclesMapping.cycleTo, '');

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
        );

        return {data};
      })
      .catch(handleDataApiError);
  }
}
