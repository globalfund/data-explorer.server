import {inject} from '@loopback/core';
import {get, param, Request, response, RestBindings} from '@loopback/rest';
import axios, {AxiosResponse} from 'axios';
import _ from 'lodash';
import ExpendituresAvailabilityMapping from '../config/mapping/expenditures/availability.json';
import ExpendituresBarChartMapping from '../config/mapping/expenditures/bar.json';
import ExpendituresCyclesMapping from '../config/mapping/expenditures/cycles.json';
import ExpendituresHeatmapMapping from '../config/mapping/expenditures/heatmap.json';
import ExpendituresTableMapping from '../config/mapping/expenditures/table.json';
import urls from '../config/urls/index.json';
import {handleDataApiError} from '../utils/dataApiError';
import {filterFinancialIndicators} from '../utils/filtering/financialIndicators';

export class ExpendituresController {
  constructor(@inject(RestBindings.Http.REQUEST) private req: Request) {}

  @get(
    '/expenditures/heatmap/{row}/{column}/{componentField}/{geographyGrouping}',
  )
  @response(200)
  async heatmap(
    @param.path.string('row') row: string,
    @param.path.string('column') column: string,
    @param.path.string('componentField') componentField: string,
    @param.path.string('geographyGrouping') geographyGrouping: string,
  ) {
    const ungrouped = await this.heatmaplocal(
      row,
      column,
      'activityArea',
      geographyGrouping,
    );
    if (componentField === 'activityAreaGroup') {
      const grouped = await this.heatmaplocal(
        row,
        column,
        'activityAreaGroup/parent',
        geographyGrouping,
      );
      return {
        data: [
          ..._.filter(
            ungrouped.data,
            item =>
              ExpendituresHeatmapMapping.url1Items.indexOf(item.column) > -1,
          ),
          ..._.filter(
            grouped.data,
            item =>
              ExpendituresHeatmapMapping.url2Items.indexOf(item.column) > -1,
          ),
        ],
      };
    } else {
      return ungrouped;
    }
  }

  @get(
    '/expenditures/heatmap/{row}/{column}/{componentField}/{geographyGrouping}/local',
  )
  @response(200)
  async heatmaplocal(
    @param.path.string('row') row: string,
    @param.path.string('column') column: string,
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
    let filterString = ExpendituresHeatmapMapping.urlParams;
    if (row.indexOf('investmentLandscape1') > -1) {
      filterString = filterString.replace(
        'Expenditure_Intervention_ReferenceRate',
        'Expenditure_InvestmentLandscape_ReferenceRate',
      );
    }
    let rowField = '';
    let subRowField = '';
    let subSubRowField = '';
    let columnField = '';
    let subColumnField = '';
    if (row.split(',').length > 1) {
      rowField = _.get(
        ExpendituresHeatmapMapping,
        `fields["${row.split(',')[0]}"]`,
        ExpendituresHeatmapMapping.fields.principalRecipientType,
      );
      subRowField = _.get(
        ExpendituresHeatmapMapping,
        `fields["${row.split(',')[1]}"]`,
        ExpendituresHeatmapMapping.fields.principalRecipient,
      );
      if (row.split(',').length > 2) {
        subSubRowField = _.get(
          ExpendituresHeatmapMapping,
          `fields["${row.split(',')[2]}"]`,
          ExpendituresHeatmapMapping.fields.principalRecipient,
        );
      }
    } else {
      rowField = _.get(
        ExpendituresHeatmapMapping,
        `fields["${row}"]`,
        ExpendituresHeatmapMapping.fields.principalRecipientType,
      );
    }
    if (column.split(',').length > 1) {
      columnField = _.get(
        ExpendituresHeatmapMapping,
        `fields["${column.split(',')[0]}"]`,
        ExpendituresHeatmapMapping.fields.principalRecipientType,
      );
      subColumnField = _.get(
        ExpendituresHeatmapMapping,
        `fields["${column.split(',')[1]}"]`,
        ExpendituresHeatmapMapping.fields.principalRecipient,
      );
    } else {
      columnField = _.get(
        ExpendituresHeatmapMapping,
        `fields["${column}"]`,
        ExpendituresHeatmapMapping.fields.component,
      ).replace(/<componentField>/g, componentField);
    }
    rowField = rowField.replace(/<componentField>/g, componentField);
    subRowField = subRowField.replace(/<componentField>/g, componentField);
    subSubRowField = subSubRowField.replace(
      /<componentField>/g,
      componentField,
    );
    columnField = columnField.replace(/<componentField>/g, componentField);
    subColumnField = subColumnField.replace(
      /<componentField>/g,
      componentField,
    );
    const rowFieldArray = [rowField, subRowField, subSubRowField].filter(
      item => item.length > 0,
    );
    filterString = filterString.replace(
      '<rowField>',
      rowFieldArray.join(',').replace(/(^,)|(,$)/g, ''),
    );
    filterString = filterString.replace(
      '<columnField>',
      [columnField, subColumnField].join(',').replace(/(^,)|(,$)/g, ''),
    );
    filterString = await filterFinancialIndicators(
      this.req.query,
      filterString,
      geographyMappings,
      `implementationPeriod/grant/${componentField}/name`,
      'expenditure',
    );

    const url = `${urls.FINANCIAL_INDICATORS}/${filterString}`;

    rowField = rowField.replace(/\//g, '.');
    subRowField = subRowField.replace(/\//g, '.');
    subSubRowField = subSubRowField.replace(/\//g, '.');
    columnField = columnField.replace(/\//g, '.');
    subColumnField = subColumnField.replace(/\//g, '.');

    return axios
      .get(url)
      .then((resp: AxiosResponse) => {
        const raw = _.get(resp.data, ExpendituresHeatmapMapping.dataPath, []);

        let data: {
          row: string;
          column: string;
          budget: number;
          value: number;
          percentage: number;
          parentRow?: string;
          parentColumn?: string;
        }[] = [];

        const columnDimensionArray = [columnField, subColumnField].filter(
          item => item.length > 0,
        );
        const rowDimensionArray = [
          rowField,
          subRowField,
          subSubRowField,
        ].filter(item => item.length > 0);

        rowDimensionArray.forEach((rowDimensionValue, rowIndex) => {
          columnDimensionArray.forEach((columnDimensionValue, columnIndex) => {
            raw.forEach((item: any) => {
              const row1 = _.get(item, rowDimensionValue, '');
              const column1 = _.get(item, columnDimensionValue, '');
              const expenditureAmount = _.get(
                item,
                ExpendituresHeatmapMapping.expenditure,
                0,
              );
              const budgetAmount = _.get(
                item,
                ExpendituresHeatmapMapping.budget,
                0,
              );

              const fItemIndex = _.findIndex(
                data,
                dataItem =>
                  dataItem.row === row1 && dataItem.column === column1,
              );

              if (fItemIndex > -1) {
                data[fItemIndex].budget += budgetAmount;
                data[fItemIndex].value += expenditureAmount;
                data[fItemIndex].percentage =
                  data[fItemIndex].budget > 0
                    ? (data[fItemIndex].value / data[fItemIndex].budget) * 100
                    : 120;
                data[fItemIndex].percentage = Math.round(
                  data[fItemIndex].percentage,
                );
                if (data[fItemIndex].percentage > 120) {
                  data[fItemIndex].percentage = 120;
                }
              } else if (row1 && column1) {
                let parentRow =
                  rowIndex > 0
                    ? _.get(item, rowDimensionArray[rowIndex - 1])
                    : undefined;
                if (
                  (parentRow === 'null' || parentRow === null) &&
                  rowIndex > 0
                ) {
                  parentRow = _.get(item, rowDimensionArray[rowIndex - 2]);
                }
                if (parentRow === 'null' || parentRow === null) {
                  parentRow = undefined;
                }
                let parentColumn =
                  columnIndex > 0
                    ? _.get(item, columnDimensionArray[columnIndex - 1])
                    : undefined;
                if (parentColumn === 'null' || parentColumn === null) {
                  parentColumn = undefined;
                }
                data.push({
                  row: row1,
                  parentRow,
                  column: column1,
                  parentColumn,
                  budget: budgetAmount,
                  value: expenditureAmount,
                  percentage:
                    budgetAmount && budgetAmount > 0
                      ? Math.round((expenditureAmount / budgetAmount) * 100)
                      : 120,
                });
                if (data[data.length - 1].percentage > 120) {
                  data[data.length - 1].percentage = 120;
                }
              }
            });
          });
        });

        return {data};
      })
      .catch(handleDataApiError);
  }

  @get('/expenditures/expandable-bar/{componentField}/{geographyGrouping}')
  @response(200)
  async expandableBar(
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
      ExpendituresBarChartMapping.urlParams.replace(
        /<componentField>/g,
        componentField,
      ),
      geographyMappings,
      `${componentField}/parent/parent/name`,
      'expenditure',
    );
    const url = `${urls.FINANCIAL_INDICATORS}/${filterString}`;

    return axios
      .get(url)
      .then((resp: AxiosResponse) => {
        const raw = _.get(resp.data, ExpendituresBarChartMapping.dataPath, []);

        const groupedByName = _.groupBy(
          raw,
          ExpendituresBarChartMapping.name.replace(
            /<componentField>/g,
            componentField,
          ),
        );

        const data = _.map(groupedByName, (value, key) => {
          const groupedByItem = _.groupBy(
            value,
            ExpendituresBarChartMapping.itemName.replace(
              /<componentField>/g,
              componentField,
            ),
          );
          return {
            name: key,
            value: _.sumBy(value, ExpendituresBarChartMapping.value),
            items: _.map(groupedByItem, (subValue, subKey) => ({
              name: subKey,
              value: _.sumBy(subValue, ExpendituresBarChartMapping.value),
            })),
          };
        });

        return {data: _.filter(data, item => item.name !== 'null')};
      })
      .catch(handleDataApiError);
  }

  @get('/expenditures/table/{componentField}/{geographyGrouping}')
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
    const filterString = await filterFinancialIndicators(
      this.req.query,
      ExpendituresTableMapping.urlParams.replace(
        /<componentField>/g,
        componentField,
      ),
      geographyMappings,
      `${componentField}/parent/parent/name`,
      'expenditure',
    );
    const url = `${urls.FINANCIAL_INDICATORS}/${filterString}`;

    return axios
      .get(url)
      .then((resp: AxiosResponse) => {
        const raw = _.get(resp.data, ExpendituresTableMapping.dataPath, []);

        const groupedByName = _.groupBy(
          raw,
          ExpendituresTableMapping.name.replace(
            /<componentField>/g,
            componentField,
          ),
        );

        const data = _.map(groupedByName, (value, key) => {
          const groupedByItem = _.groupBy(
            value,
            ExpendituresTableMapping.itemName.replace(
              /<componentField>/g,
              componentField,
            ),
          );
          return {
            name: key,
            cumulativeExpenditure: _.sumBy(
              value,
              ExpendituresTableMapping.cumulativeExpenditureValue,
            ),
            periodExpenditure: _.sumBy(
              value,
              ExpendituresTableMapping.periodExpenditureValue,
            ),
            _children: _.map(groupedByItem, (subValue, subKey) => ({
              name: subKey,
              cumulativeExpenditure: _.sumBy(
                subValue,
                ExpendituresTableMapping.cumulativeExpenditureValue,
              ),
              periodExpenditure: _.sumBy(
                subValue,
                ExpendituresTableMapping.periodExpenditureValue,
              ),
            })),
          };
        });

        return {data};
      })
      .catch(handleDataApiError);
  }

  @get('/expenditures/cycles')
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
      ExpendituresCyclesMapping.urlParams,
      geographyMappings,
      'implementationPeriod/grant/activityArea/name',
      'expenditure',
    );
    const url = `${urls.FINANCIAL_INDICATORS}/${filterString}`;

    return axios
      .get(url)
      .then(async (resp: AxiosResponse) => {
        const rawData = _.get(
          resp.data,
          ExpendituresCyclesMapping.dataPath,
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

        const data = _.map(rawData, item => {
          const from = _.get(item, ExpendituresCyclesMapping.cycleFrom, '');
          const to = _.get(item, ExpendituresCyclesMapping.cycleTo, '');

          let value = from;

          if (from && to) {
            value = `${from} - ${to}`;
          }

          const name = _.find(chartCycles, {value})?.name ?? value;

          return {
            name,
            value: name,
          };
        });

        return {data};
      })
      .catch(handleDataApiError);
  }

  @get('/has/expenditures')
  @response(200)
  async hasExpenditures() {
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
      ExpendituresAvailabilityMapping.urlParams,
      geographyMappings,
      'implementationPeriod/grant/activityArea/name',
      'expenditure',
    );
    const url = `${urls.FINANCIAL_INDICATORS}/${filterString}`;

    return axios
      .get(url)
      .then((resp: AxiosResponse) => {
        return {
          data: {
            hasExpenditures:
              _.get(resp.data, ExpendituresAvailabilityMapping.dataPath, 0) > 0,
          },
        };
      })
      .catch(handleDataApiError);
  }
}
