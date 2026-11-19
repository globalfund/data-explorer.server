import {inject} from '@loopback/core';
import {get, param, Request, response, RestBindings} from '@loopback/rest';
import axios, {AxiosResponse} from 'axios';
import _ from 'lodash';
import EligibilityHeatmap from '../config/mapping/eligibility/heatmap.json';
import EligibilityStatsMapping from '../config/mapping/eligibility/stats.json';
import EligibilityTableMapping from '../config/mapping/eligibility/table.json';
import EligibilityYearsFieldsMapping from '../config/mapping/eligibility/years.json';
import urls from '../config/urls/index.json';
import {TableDataItem} from '../interfaces/table';
import {handleDataApiError} from '../utils/dataApiError';
import {filterEligibility} from '../utils/filtering/eligibility';

export class EligibilityController {
  constructor(@inject(RestBindings.Http.REQUEST) private req: Request) {}

  @get('/eligibility/years')
  @response(200)
  eligibilityYears(): object {
    const url = `${urls.ELIGIBILITY}/?${EligibilityYearsFieldsMapping.aggregation}`;

    return axios
      .get(url)
      .then((resp: AxiosResponse) => {
        return {
          data: _.get(
            resp.data,
            EligibilityYearsFieldsMapping.dataPath,
            [],
          ).map((item: any) =>
            _.get(item, EligibilityYearsFieldsMapping.year, ''),
          ),
        };
      })
      .catch(handleDataApiError);
  }

  @get('/eligibility/stats/{year}')
  @response(200)
  async eligibilityStats(@param.path.string('year') year: string) {
    const filterString = await filterEligibility(
      {...this.req.query, years: year},
      EligibilityStatsMapping.urlParams,
    );
    const url = `${urls.ELIGIBILITY}/${filterString}`;

    return axios
      .get(url)
      .then((resp: AxiosResponse) => {
        const raw = _.get(resp.data, EligibilityStatsMapping.dataPath, []);
        const groupedByComponent = _.groupBy(
          raw,
          EligibilityStatsMapping.component,
        );
        return {
          data: _.map(groupedByComponent, (value, key) => {
            const itemGroupedByIncomeLevel = _.groupBy(
              value,
              EligibilityStatsMapping.incomeLevel,
            );
            return {
              name: key,
              value: value.length,
              incomeLevelCounts: _.map(itemGroupedByIncomeLevel, (v, k) => ({
                incomeLevel: k,
                count: v.length,
              })),
            };
          }),
        };
      })
      .catch(handleDataApiError);
  }

  @get('/eligibility/table')
  @response(200)
  async eligibilityTable() {
    const filterString = await filterEligibility(
      this.req.query,
      EligibilityTableMapping.urlParams,
    );
    const url = `${urls.ELIGIBILITY}/${filterString}`;

    return axios
      .get(url)
      .then((resp: AxiosResponse) => {
        const raw = _.get(resp.data, EligibilityTableMapping.dataPath, []);

        const groupedByGeography = _.groupBy(
          raw,
          EligibilityTableMapping.geography,
        );

        const years: string[] = [];

        const data: {
          [key: string]: TableDataItem;
        }[] = _.map(groupedByGeography, (value, key) => {
          const item: {
            [key: string]: TableDataItem;
          } = {
            name: key,
            _children: [
              {
                name: 'Income Level',
              },
            ],
          };

          const geoGroupedByYear = _.groupBy(
            value,
            EligibilityTableMapping.year,
          );

          _.forEach(geoGroupedByYear, (value1, key1) => {
            (item._children as object[])[0] = {
              ...(item._children as object[])[0],
              [key1]: _.get(value1, '[0].incomeLevel', ''),
            };
          });

          const groupedByComponent = _.groupBy(
            value,
            EligibilityTableMapping.component,
          );

          item._children = _.map(groupedByComponent, (value2, key2) => {
            const componentItem: {
              [key: string]: TableDataItem;
            } = {
              name: key2,
              _children: [
                {
                  name: 'Disease Burden',
                },
                {
                  name: 'Eligibility',
                },
              ],
            };

            const componentGroupedByYear = _.groupBy(
              value2,
              EligibilityTableMapping.year,
            );

            _.forEach(componentGroupedByYear, (value3, key3) => {
              years.push(key3);
              let isEligible = _.get(
                value3,
                `[0]["${EligibilityTableMapping.isEligible}"]`,
                '',
              );
              if (isEligible) {
                isEligible = EligibilityTableMapping.eligibilityValues.eligible;
              } else if (
                !isEligible &&
                isEligible !== null &&
                isEligible !== ''
              ) {
                isEligible =
                  EligibilityTableMapping.eligibilityValues.notEligible;
              } else {
                isEligible =
                  EligibilityTableMapping.eligibilityValues.transitionFunding;
              }
              (componentItem._children as object[])[0] = {
                ...(componentItem._children as object[])[0],
                [key3]: _.get(
                  value3,
                  `[0]["${EligibilityTableMapping.diseaseBurden}"]`,
                  '',
                ),
              };
              (componentItem._children as object[])[1] = {
                ...(componentItem._children as object[])[1],
                [key3]: isEligible,
              };
            });

            return componentItem;
          });

          return item;
        });

        return {data, years: _.orderBy(_.uniq(years), [], ['desc'])};
      })
      .catch(handleDataApiError);
  }

  @get('/eligibility/heatmap/{countryCode}')
  @response(200)
  async eligibilityHeatmap(
    @param.path.string('countryCode') countryCode: string,
  ) {
    let filterString = EligibilityHeatmap.urlParams.replace(
      '<countryCode>',
      countryCode,
    );
    const url = `${urls.ELIGIBILITY}/${filterString}`;

    return axios
      .get(url)
      .then((resp: AxiosResponse) => {
        const raw = _.get(resp.data, EligibilityHeatmap.dataPath, []);
        const data = raw.map((item: any) => ({
          column: _.get(item, EligibilityHeatmap.eligibilityYear, ''),
          row: _.get(item, EligibilityHeatmap.component, ''),
          value: _.get(
            EligibilityHeatmap.isEligibleValueMapping,
            _.get(item, EligibilityHeatmap.isEligible, '').toString(),
            '',
          ),
          diseaseBurden: _.get(
            EligibilityHeatmap.diseaseBurdenValueMapping,
            _.get(item, EligibilityHeatmap.diseaseBurden, ''),
            '',
          ),
        }));

        const groupedByYears = _.groupBy(
          raw,
          EligibilityHeatmap.eligibilityYear,
        );
        Object.keys(groupedByYears).forEach(year => {
          data.push({
            column: year,
            row: '_Income Level',
            value: '',
            diseaseBurden: _.get(
              EligibilityHeatmap.incomeLevelValueMapping,
              _.get(
                groupedByYears[year][0],
                EligibilityHeatmap.incomeLevel,
                '',
              ),
              '',
            ),
          });
        });

        return {
          data: _.orderBy(data, ['column', 'row'], ['desc', 'asc']).map(
            (item: any) => ({
              ...item,
              column: item.column.toString(),
              row: item.row === '_Income Level' ? 'Income Level' : item.row,
            }),
          ),
        };
      })
      .catch(handleDataApiError);
  }
}
