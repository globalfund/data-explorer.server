import {inject} from '@loopback/core';
import {get, param, Request, response, RestBindings} from '@loopback/rest';
import axios, {AxiosResponse} from 'axios';
import _ from 'lodash';
import ResultsCyclesMappingFields from '../config/mapping/results/cycles.json';
import ResultsGroupedByComponentMappingFields from '../config/mapping/results/groupedByComponent.json';
import ResultsTableLocationMappingFields from '../config/mapping/results/location-table.json';
import ResultsPolylineMappingFields from '../config/mapping/results/polyline.json';
import ResultsStatsMappingFields from '../config/mapping/results/stats-home.json';
import ResultsTableMappingFields from '../config/mapping/results/table.json';
import urls from '../config/urls/index.json';
import {handleDataApiError} from '../utils/dataApiError';
import {filterProgrammaticIndicators} from '../utils/filtering/programmaticIndicators';

export class ResultsController {
  constructor(@inject(RestBindings.Http.REQUEST) private req: Request) {}

  @get('/results/polyline/{cycle}')
  @response(200)
  async polyline(@param.path.string('cycle') cycle: string) {
    const filterString = await filterProgrammaticIndicators(
      {
        ...this.req.query,
        years: this.req.query.years
          ? `${this.req.query.years},${cycle}`
          : cycle,
      },
      ResultsPolylineMappingFields.urlParams,
    );
    const url = `${urls.PROGRAMMATIC_INDICATORS}/${filterString}`;

    return axios
      .get(url)
      .then((resp: AxiosResponse) => {
        const raw = _.get(resp.data, ResultsPolylineMappingFields.dataPath, []);
        const groupedByComponent = _.groupBy(
          raw,
          ResultsPolylineMappingFields.component,
        );

        const data = {
          name: cycle,
          children: _.orderBy(
            _.map(groupedByComponent, (componentData, component) => ({
              name: component,
              children: componentData.map((item: any) => ({
                name: _.get(item, ResultsPolylineMappingFields.name, ''),
                value: _.get(item, ResultsPolylineMappingFields.value, 0),
                itemStyle: {
                  color: _.get(
                    ResultsPolylineMappingFields.componentColors,
                    component,
                    '',
                  ),
                },
              })),
              itemStyle: {
                color: _.get(
                  ResultsPolylineMappingFields.componentColors,
                  component,
                  '',
                ),
              },
            })),
            (item: any) => item.children.length,
            'desc',
          ),
        };

        return {data};
      })
      .catch(handleDataApiError);
  }

  @get('/results/table')
  @response(200)
  async table() {
    const filterString = await filterProgrammaticIndicators(
      this.req.query,
      ResultsTableMappingFields.urlParams,
    );
    const url = `${urls.PROGRAMMATIC_INDICATORS}/${filterString}`;

    return axios
      .get(url)
      .then((resp: AxiosResponse) => {
        const raw = ResultsTableMappingFields.dataPath
          ? _.get(resp.data, ResultsTableMappingFields.dataPath, [])
          : resp.data;

        const groupedByYear = _.groupBy(raw, ResultsTableMappingFields.year);

        return {
          data: _.map(groupedByYear, (yearData, year) => {
            const groupedByComponent = _.groupBy(
              yearData,
              ResultsTableMappingFields.component,
            );

            return {
              name: year,
              _children: _.map(
                groupedByComponent,
                (componentData, component) => ({
                  name: component,
                  _children: componentData
                    .map((item: any) => ({
                      name: _.get(item, ResultsTableMappingFields.name, ''),
                      value: _.get(item, ResultsTableMappingFields.value, 0),
                    }))
                    .sort((a, b) => a.name.localeCompare(b.name)),
                }),
              ).sort((a, b) => a.name.localeCompare(b.name)),
            };
          }).reverse(),
        };
      })
      .catch(handleDataApiError);
  }

  @get('/results/grouped-by-component/{cycle}')
  @response(200)
  async groupedByComponent(@param.path.string('cycle') cycle: string) {
    const filterString = await filterProgrammaticIndicators(
      {
        ...this.req.query,
        years: this.req.query.years
          ? `${this.req.query.years},${cycle}`
          : cycle,
      },
      ResultsGroupedByComponentMappingFields.urlParams,
    );
    const url = `${urls.PROGRAMMATIC_INDICATORS}/${filterString}`;

    return axios
      .get(url)
      .then((resp: AxiosResponse) => {
        const raw = ResultsGroupedByComponentMappingFields.dataPath
          ? _.get(
              resp.data,
              ResultsGroupedByComponentMappingFields.dataPath,
              [],
            )
          : resp.data;

        const groupedByComponent = _.groupBy(
          raw,
          ResultsGroupedByComponentMappingFields.component,
        );

        return {
          data: _.map(groupedByComponent, (componentData, component) => ({
            name: component,
            indicators: Object.keys(
              _.groupBy(
                componentData,
                ResultsGroupedByComponentMappingFields.name,
              ),
            )
              .map(name => {
                const items = _.filter(
                  componentData,
                  item =>
                    _.get(
                      item,
                      ResultsGroupedByComponentMappingFields.name,
                      '',
                    ) === name,
                );
                const value = _.sumBy(
                  items,
                  ResultsGroupedByComponentMappingFields.value,
                );
                const numOfCountries = Object.keys(
                  _.groupBy(
                    items,
                    ResultsGroupedByComponentMappingFields.geography,
                  ),
                ).length;
                return {name, value, numOfCountries};
              })
              .sort((a, b) => a.name.localeCompare(b.name)),
            numOfCountries: Object.keys(
              _.groupBy(
                componentData,
                ResultsGroupedByComponentMappingFields.geography,
              ),
            ).length,
          })).sort((a, b) => a.name.localeCompare(b.name)),
        };
      })
      .catch(handleDataApiError);
  }

  @get('/results/stats')
  @response(200)
  async resultsStats() {
    const cycle = this.req.query.cycle ?? new Date().getFullYear() - 1;
    const filterString = await filterProgrammaticIndicators(
      {...this.req.query, years: cycle.toString()},
      ResultsStatsMappingFields.urlParams,
    );
    const url = `${urls.PROGRAMMATIC_INDICATORS}/${filterString}`;

    return axios
      .get(url)
      .then((resp: AxiosResponse) => {
        const raw = ResultsStatsMappingFields.dataPath
          ? _.get(resp.data, ResultsStatsMappingFields.dataPath, [])
          : resp.data;

        const groupedByIndicator = _.groupBy(
          raw,
          ResultsStatsMappingFields.name,
        );

        const data = _.map(groupedByIndicator, (indicatorData, indicator) => {
          const totalValue = _.sumBy(
            indicatorData,
            ResultsStatsMappingFields.value,
          );
          return {
            name: indicator,
            value: totalValue,
            geographies: Object.keys(
              _.groupBy(indicatorData, ResultsStatsMappingFields.geography),
            ).length,
          };
        });

        return {
          stats: data.map((item: any) => ({
            label: item.name,
            value: item.value,
            geographies: item.geographies,
          })),
        };
      })
      .catch(handleDataApiError);
  }

  @get('/results/table/{countryCode}/{cycle}')
  @response(200)
  async resultsTable(
    @param.path.string('cycle') cycle: string,
    @param.path.string('countryCode') countryCode: string,
  ) {
    let filterString = ResultsTableLocationMappingFields.urlParams
      .replace('<countryCode>', countryCode)
      .replace('<cycle>', cycle)
      .replace(
        '<search>',
        this.req.query.q
          ? ` AND (contains(geography/code,'${this.req.query.q}') OR contains(activityArea/name,'${this.req.query.q}') OR contains(indicatorName,'${this.req.query.q}'))`
          : '',
      );
    const url = `${urls.PROGRAMMATIC_INDICATORS}/${filterString}`;

    return axios
      .get(url)
      .then((resp: AxiosResponse) => {
        const raw = ResultsTableLocationMappingFields.dataPath
          ? _.get(resp.data, ResultsTableLocationMappingFields.dataPath, [])
          : resp.data;
        return {
          data: raw.map((item: any) => ({
            description: _.get(
              item,
              ResultsTableLocationMappingFields.name,
              '',
            ),
            result: _.get(item, ResultsTableLocationMappingFields.value, 0),
            component: _.get(
              item,
              ResultsTableLocationMappingFields.component,
              '',
            ),
          })),
        };
      })
      .catch(handleDataApiError);
  }

  @get('/results/cycles')
  @response(200)
  async cycles() {
    const filterString = await filterProgrammaticIndicators(
      this.req.query,
      ResultsCyclesMappingFields.urlParams,
    );
    const url = `${urls.PROGRAMMATIC_INDICATORS}/${filterString}`;

    return axios
      .get(url)
      .then((resp: AxiosResponse) => {
        const rawData = _.get(
          resp.data,
          ResultsCyclesMappingFields.dataPath,
          [],
        );

        const data = _.map(rawData, item => {
          const from = _.get(item, ResultsCyclesMappingFields.cycleFrom, '');
          const to = _.get(item, ResultsCyclesMappingFields.cycleTo, '');

          let value = from;

          if (from && to) {
            value = `${from} - ${to}`;
          }

          return {
            name: value,
            value,
          };
        });

        return {data: _.orderBy(data, 'value', 'desc')};
      })
      .catch(handleDataApiError);
  }
}
