import {inject} from '@loopback/core';
import {
  get,
  HttpErrors,
  param,
  Request,
  response,
  RestBindings,
} from '@loopback/rest';
import axios from 'axios';
import _ from 'lodash';
import CoordinatingMehanismContactsMapping from '../config/mapping/location/coordinating-mechanism-contacts.json';
import GeographiesMapping from '../config/mapping/location/geographies.json';
import LocationInfoMapping from '../config/mapping/location/info.json';
import PieChartsMapping from '../config/mapping/location/pieCharts.json';
import urls from '../config/urls/index.json';
import {GeographyModel} from '../interfaces/geographies';
import CountryDescriptions from '../static-assets/country-descriptions.json';
import {handleDataApiError} from '../utils/dataApiError';

export class LocationController {
  constructor(@inject(RestBindings.Http.REQUEST) private req: Request) {}

  @get('/location/{code}/grants/pie-charts')
  @response(200)
  async locationGrantsPieCharts(@param.path.string('code') code: string) {
    const decodedCode = code.replace(/\|/g, '%2F');
    let filterString1 = PieChartsMapping.pie1UrlParams.replace(
      '<code>',
      decodedCode,
    );
    let filterString2 = PieChartsMapping.pie2UrlParams.replace(
      '<code>',
      decodedCode,
    );
    let filterString3 = PieChartsMapping.pie3UrlParams.replace(
      '<code>',
      decodedCode,
    );
    filterString1 = filterString1.replace('<filterString>', '');
    filterString2 = filterString2.replace('<filterString>', '');
    filterString3 = filterString3.replace('<filterString>', '');
    const url1 = `${urls.FINANCIAL_INDICATORS}/${filterString1}`;
    const url2 = `${urls.FINANCIAL_INDICATORS}/${filterString2}`;
    const url3 = `${urls.FINANCIAL_INDICATORS}/${filterString3}`;

    return axios
      .all([axios.get(url1), axios.get(url2), axios.get(url3)])
      .then(
        axios.spread((...responses) => {
          const rawPie1 = _.get(
            responses[0].data,
            PieChartsMapping.dataPath,
            [],
          );
          const rawPie2 = _.get(
            responses[1].data,
            PieChartsMapping.dataPath,
            [],
          );
          const rawPie3 = _.get(
            responses[2].data,
            PieChartsMapping.dataPath,
            [],
          );

          const totalPie1 = _.sumBy(rawPie1, PieChartsMapping.count);
          const dataPie1 = rawPie1.map((item: any, index: number) => ({
            name: _.get(item, PieChartsMapping.pie1Field, ''),
            value: (_.get(item, PieChartsMapping.count, 0) * 100) / totalPie1,
            amount: _.get(item, PieChartsMapping.count, 0),
            itemStyle: {
              color:
                PieChartsMapping.colors[index % PieChartsMapping.colors.length],
            },
          }));

          const totalPie2 = _.sumBy(rawPie2, PieChartsMapping.count);
          const dataPie2 = rawPie2.map((item: any, index: number) => ({
            name: _.get(item, PieChartsMapping.pie2Field, ''),
            value: (_.get(item, PieChartsMapping.count, 0) * 100) / totalPie2,
            amount: _.get(item, PieChartsMapping.count, 0),
            itemStyle: {
              color:
                PieChartsMapping.colors[index % PieChartsMapping.colors.length],
            },
          }));

          const totalPie3 = _.sumBy(rawPie3, PieChartsMapping.count);
          const dataPie3 = rawPie3.map((item: any, index: number) => ({
            name: _.get(item, PieChartsMapping.pie3Field, '').replace(
              '_ReferenceRate',
              '',
            ),
            value: (_.get(item, PieChartsMapping.count, 0) * 100) / totalPie3,
            amount: _.get(item, PieChartsMapping.count, 0),
            itemStyle: {
              color:
                PieChartsMapping.colors[index % PieChartsMapping.colors.length],
            },
          }));

          return {
            data: {
              pie1: dataPie1,
              pie2: dataPie2,
              pie3: dataPie3,
            },
          };
        }),
      )
      .catch(handleDataApiError);
  }

  @get('/geographies')
  @response(200)
  async geographies() {
    const url = urls.HIERARCHICAL_GEOGRAPHIES;

    return axios
      .get(url)
      .then(resp => {
        const raw = _.get(resp.data, GeographiesMapping.dataPath, []);
        let data: GeographyModel[] = [];

        const world: GeographyModel = {
          name: 'World',
          value: 'QMZ',
          items: [
            {
              name: 'Multicountries',
              value: 'Multicountries',
              items: [],
            },
          ],
        };

        raw.forEach((item1: any) => {
          if (
            _.get(item1, GeographiesMapping.category, '') === 'Multicountry'
          ) {
            // @ts-ignore
            world.items[0].items.push({
              name: _.get(item1, GeographiesMapping.name, ''),
              value: _.get(item1, GeographiesMapping.value, ''),
            });
          } else {
            const subOptions = _.get(item1, GeographiesMapping.items, []);
            const mcSubOptions = _.remove(subOptions, (i: any) => {
              return (
                _.get(i, GeographiesMapping.category, '') === 'Multicountry'
              );
            });
            if (subOptions.length > 0 || mcSubOptions.length > 0) {
              data.push({
                name: _.get(item1, GeographiesMapping.name, ''),
                value: _.get(item1, GeographiesMapping.value, ''),
                items:
                  subOptions && subOptions.length > 0
                    ? _.filter(
                        _.orderBy(
                          subOptions.map((item2: any) => {
                            const item2SubOptions = _.filter(
                              _.get(item2, GeographiesMapping.items, []),
                              (i: any) => {
                                if (
                                  _.get(i, GeographiesMapping.category, '') ===
                                    'Country' ||
                                  _.get(i, GeographiesMapping.category, '') ===
                                    'Multicountry'
                                ) {
                                  return _.get(
                                    i,
                                    GeographiesMapping.isRecipient,
                                    false,
                                  );
                                }
                                return true;
                              },
                            );
                            const mcSubSubOptions = _.remove(
                              item2SubOptions,
                              (i: any) => {
                                return (
                                  _.get(i, GeographiesMapping.category, '') ===
                                  'Multicountry'
                                );
                              },
                            );
                            let items: GeographyModel[] = [];
                            if (item2SubOptions && item2SubOptions.length > 0) {
                              items = _.orderBy(
                                item2SubOptions.map((item3: any) => {
                                  const item3SubOptions = _.filter(
                                    _.get(item3, GeographiesMapping.items, []),
                                    (i: any) => {
                                      if (
                                        _.get(
                                          i,
                                          GeographiesMapping.category,
                                          '',
                                        ) === 'Country' ||
                                        _.get(
                                          i,
                                          GeographiesMapping.category,
                                          '',
                                        ) === 'Multicountry'
                                      ) {
                                        return _.get(
                                          i,
                                          GeographiesMapping.isRecipient,
                                          false,
                                        );
                                      }
                                      return true;
                                    },
                                  );
                                  return {
                                    name: _.get(
                                      item3,
                                      GeographiesMapping.name,
                                      '',
                                    ),
                                    value: _.get(
                                      item3,
                                      GeographiesMapping.value,
                                      '',
                                    ),
                                    subOptions:
                                      item3SubOptions &&
                                      item3SubOptions.length > 0
                                        ? _.orderBy(
                                            item3SubOptions.map(
                                              (item4: any) => {
                                                return {
                                                  name: _.get(
                                                    item4,
                                                    GeographiesMapping.name,
                                                    '',
                                                  ),
                                                  value: _.get(
                                                    item4,
                                                    GeographiesMapping.value,
                                                    '',
                                                  ),
                                                };
                                              },
                                            ),
                                            'name',
                                            'asc',
                                          )
                                        : undefined,
                                  };
                                }),
                                'name',
                                'asc',
                              );
                            }
                            if (mcSubSubOptions && mcSubSubOptions.length > 0) {
                              items = items.concat(
                                _.orderBy(
                                  mcSubSubOptions.map((mc: any) => ({
                                    name: _.get(
                                      mc,
                                      GeographiesMapping.name,
                                      '',
                                    ),
                                    value: _.get(
                                      mc,
                                      GeographiesMapping.value,
                                      '',
                                    ),
                                  })),
                                  'name',
                                  'asc',
                                ),
                              );
                            }
                            return {
                              name: _.get(item2, GeographiesMapping.name, ''),
                              value: _.get(item2, GeographiesMapping.value, ''),
                              items: items.length > 0 ? items : [],
                            };
                          }),
                          'name',
                          'asc',
                        ),
                        i => i.items.length > 0,
                      )
                    : undefined,
              });
              if (mcSubOptions.length > 0) {
                data[data.length - 1].items?.push({
                  name: 'Multicountries',
                  value: 'Multicountries',
                  items: _.orderBy(
                    mcSubOptions.map((mc: any) => ({
                      name: _.get(mc, GeographiesMapping.name, ''),
                      value: _.get(mc, GeographiesMapping.value, ''),
                    })),
                    'name',
                    'asc',
                  ),
                });
              }
            }
          }
        });

        data = _.orderBy(data, ['name'], ['asc']);

        data = [...data, world];

        return {data};
      })
      .catch(handleDataApiError);
  }

  @get('/location/{code}/info')
  @response(200)
  async locationInfo(@param.path.string('code') code: string) {
    const decodedCode = code.replace(/\|/g, '%2F');
    const url = `${urls.GEOGRAPHIES}/${LocationInfoMapping.urlParams.replace(
      '<code>',
      decodedCode,
    )}`;
    const FPMurl = `${urls.GRANTS}/${LocationInfoMapping.FPMurlParams.replace(
      '<code>',
      decodedCode,
    )}`;
    const currPrincipalRecipientsUrl = `${
      urls.GRANTS
    }/${LocationInfoMapping.currentPrincipalRecipientsUrlParams.replace(
      '<code>',
      decodedCode,
    )}`;
    const formerPrincipalRecipientsUrl = `${
      urls.GRANTS
    }/${LocationInfoMapping.formerPrincipalRecipientsUrlParams.replace(
      '<code>',
      decodedCode,
    )}`;

    return axios
      .all([
        axios.get(url),
        axios.get(FPMurl),
        axios.get(currPrincipalRecipientsUrl),
        axios.get(formerPrincipalRecipientsUrl),
      ])
      .then(
        axios.spread((...responses) => {
          const raw = _.get(
            responses[0].data,
            LocationInfoMapping.dataPath,
            [],
          );
          const rawFPM = _.get(
            responses[1].data,
            LocationInfoMapping.dataPath,
            [],
          );
          const rawCurrPrincipalRecipients = _.get(
            responses[2].data,
            LocationInfoMapping.dataPath,
            [],
          );
          const rawFormerPrincipalRecipients = _.get(
            responses[3].data,
            LocationInfoMapping.dataPath,
            [],
          );

          const currentPrincipalRecipients = rawCurrPrincipalRecipients.map(
            (pr: any) => ({
              code: _.get(pr, LocationInfoMapping.principalRecipientCode, ''),
              name: _.get(pr, LocationInfoMapping.principalRecipientName, ''),
            }),
          );

          const description = _.find(CountryDescriptions, {iso3: code});

          return {
            data: [
              {
                name: _.get(raw, LocationInfoMapping.name, ''),
                region: _.get(raw, LocationInfoMapping.regionName, ''),
                description: _.get(description, 'summary', ''),
                isDonor: _.get(raw, LocationInfoMapping.isDonor, false),
                FPMName: [
                  _.get(rawFPM, LocationInfoMapping.FPMSalutation, ''),
                  _.get(rawFPM, LocationInfoMapping.FPMFirstName, ''),
                  _.get(rawFPM, LocationInfoMapping.FPMMiddleName, ''),
                  _.get(rawFPM, LocationInfoMapping.FPMLastName, ''),
                ]
                  .join(' ')
                  .trim()
                  .replace(/ {2}/g, ' '),
                FPMEmail: _.get(rawFPM, LocationInfoMapping.FPMEmail, ''),
                currentPrincipalRecipients,
                formerPrincipalRecipients: _.filter(
                  rawFormerPrincipalRecipients.map((pr: any) => ({
                    code: _.get(
                      pr,
                      LocationInfoMapping.principalRecipientCode,
                      '',
                    ),
                    name: _.get(
                      pr,
                      LocationInfoMapping.principalRecipientName,
                      '',
                    ),
                  })),
                  (fpr: any) =>
                    !_.find(currentPrincipalRecipients, {
                      name: fpr.name,
                    }),
                ),
                countries: [],
                multicountries: [],
              },
            ],
          };
        }),
      )
      .catch(handleDataApiError);
  }

  @get('/location/coordinating-mechanism/{code}/contacts')
  @response(200)
  async locationCoordinatingMechanismContacts(
    @param.path.string('code') code: string,
  ) {
    const decodedCode = code.replace(/\|/g, '%2F');
    const filterString = CoordinatingMehanismContactsMapping.urlParams.replace(
      '<code>',
      decodedCode,
    );
    const url = `${urls.COORDINATING_MECHANISMS}/${filterString}`;

    return axios
      .get(url)
      .then(resp => {
        const raw = _.get(
          resp.data,
          CoordinatingMehanismContactsMapping.dataPath,
          [],
        );
        return {
          data: raw.map((org: any) => ({
            name: _.get(org, CoordinatingMehanismContactsMapping.orgName, ''),
            items: _.get(org, CoordinatingMehanismContactsMapping.items, [])
              .map((item: any) => ({
                role: _.get(
                  item,
                  CoordinatingMehanismContactsMapping.itemRole,
                  '',
                ),
                fullname: [
                  _.get(
                    item,
                    CoordinatingMehanismContactsMapping.itemSalutation,
                    '',
                  ),
                  _.get(
                    item,
                    CoordinatingMehanismContactsMapping.itemFirstName,
                    '',
                  ),
                  _.get(
                    item,
                    CoordinatingMehanismContactsMapping.itemMiddleName,
                    '',
                  ),
                  _.get(
                    item,
                    CoordinatingMehanismContactsMapping.itemLastName,
                    '',
                  ),
                ].join(' '),
                title: _.get(
                  item,
                  CoordinatingMehanismContactsMapping.itemTitle,
                  '',
                ),
                email: _.get(
                  item,
                  CoordinatingMehanismContactsMapping.itemEmail,
                  '',
                ),
              }))
              .sort(
                (a: any, b: any) =>
                  _.get(
                    CoordinatingMehanismContactsMapping.itemRoleOrder,
                    `[${a.role}]`,
                    0,
                  ) -
                  _.get(
                    CoordinatingMehanismContactsMapping.itemRoleOrder,
                    `[${b.role}]`,
                    0,
                  ),
              ),
          })),
        };
      })
      .catch(handleDataApiError);
  }

  @get('/location/{code}/valid')
  @response(200)
  async locationValid(@param.path.string('code') code: string) {
    const decodedCode = code.replace(/\|/g, '%2F');
    const url = `${urls.GEOGRAPHIES}/${LocationInfoMapping.urlParams.replace(
      '<code>',
      decodedCode,
    )}`;

    return axios
      .get(url)
      .then(resp => {
        const valid = _.get(
          resp.data,
          `${LocationInfoMapping.dataPath}[0].id`,
          null,
        );
        if (valid) {
          return {data: {valid: true}};
        } else {
          throw new HttpErrors[403](`Location with code ${code} not found`);
        }
      })
      .catch(() => {
        throw new HttpErrors[403](`Location with code ${code} not found`);
      });
  }
}
