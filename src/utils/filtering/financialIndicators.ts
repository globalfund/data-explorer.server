import axios from 'axios';
import _ from 'lodash';
import filtering from '../../config/filtering/index.json';
import {GeographyFiltering} from './geographies';

const MAPPING = {
  geography: ['geography/code', 'implementationPeriod/grant/geography/code'],
  component: [
    'activityArea/name',
    'activityAreaGroup/name',
    'activityArea/parent/parent/name',
    'activityAreaGroup/parent/parent/name',
  ],
  donor: 'donor/name',
  donorType: 'donor/type/name',
  principalRecipient: 'implementationPeriod/grant/principalRecipient/name',
  principalRecipientSubType:
    'implementationPeriod/grant/principalRecipient/type/name',
  principalRecipientType:
    'implementationPeriod/grant/principalRecipient/type/parent/name',
  period: 'periodCovered',
  cycle: 'periodCovered',
  year: 'implementationPeriod/periodFrom',
  yearTo: 'implementationPeriod/periodTo',
  grantIP: 'implementationPeriod/code',
  status: 'implementationPeriod/status/statusName',
  search: {
    allocation:
      '(contains(geography/code,<value>) OR contains(geography/name,<value>) OR contains(activityArea/name,<value>))',
    budget:
      '(<geography> OR <component> OR contains(financialCategory/name,<value>) OR contains(financialCategory/parent/name,<value>) OR contains(financialCategory/parent/parent/name,<value>))',
    generic: '(<geography> OR <component>)',
    expenditure:
      '(<geography> OR contains(<componentField>/name,<value>) OR contains(<componentField>/parent/name,<value>))',
    'pledge-contribution':
      '(contains(donor/type/name,<value>) OR contains(donor/name,<value>) OR contains(periodCovered,<value>))',
  },
};

export async function filterFinancialIndicators(
  params: Record<string, any>,
  urlParams: string,
  geographyMapping: string | string[],
  componentMapping: string,
  datasetType:
    | 'allocation'
    | 'budget'
    | 'commitment'
    | 'disbursement'
    | 'expenditure'
    | 'pledge-contribution',
): Promise<string> {
  let str = '';

  if (_.get(params, 'cycleNames', '')) {
    const cmsResponse = await axios.get(
      `${process.env.CMS_API}/pages-home?locale=en`,
      {
        headers: {
          Authorization: `Bearer ${process.env.CMS_TOKEN}`,
        },
      },
    );
    const chartCycles = _.get(cmsResponse, 'data.data.chartCycles', []);

    const cycles = _.get(params, 'cycleNames', '').split(',');
    const cycleValues = _.filter(
      cycles.map(
        (cycle: string) => _.find(chartCycles, {name: cycle})?.value ?? '',
      ),
      (c: string) => c.length > 0,
    );
    cycleValues.forEach((cycle: string) => {
      const splits = cycle.split(' - ');
      params = {
        ...params,
        years: `${_.get(params, 'years', '')}${
          _.get(params, 'years', '') ? ',' : ''
        }${splits[0]}`,
        yearsTo: `${_.get(params, 'yearsTo', '')}${
          _.get(params, 'yearsTo', '') ? ',' : ''
        }${splits[1]}`,
      };
    });
  }

  str = await GeographyFiltering(
    str,
    _.get(params, 'geographies', '').split(','),
    geographyMapping,
  );

  const components = _.filter(
    _.get(params, 'components', '').split(','),
    (o: string) => o.length > 0,
  ).map((component: string) => `'${component}'`);
  if (components.length > 0) {
    str += `${str.length > 0 ? ' AND ' : ''}${componentMapping}${
      filtering.in
    }(${components.join(filtering.multi_param_separator)})`;
  }

  const donors = _.filter(
    _.get(params, 'donors', '').split(','),
    (o: string) => o.length > 0,
  ).map((donor: string) => `'${donor.replace(/'/g, "''")}'`);
  if (donors.length > 0) {
    str += `${str.length > 0 ? ' AND ' : ''}${MAPPING.donor}${
      filtering.in
    }(${donors.join(filtering.multi_param_separator)})`;
  }

  const donorTypes = _.filter(
    _.get(params, 'donorTypes', '').split(','),
    (o: string) => o.length > 0,
  ).map((donorType: string) => `'${donorType}'`);
  if (donorTypes.length > 0) {
    str += `${str.length > 0 ? ' AND ' : ''}${MAPPING.donorType}${
      filtering.in
    }(${donorTypes.join(filtering.multi_param_separator)})`;
  }

  const principalRecipients = _.filter(
    _.get(params, 'principalRecipients', '').split(','),
    (o: string) => o.length > 0,
  ).map((principalRecipient: string) => `'${principalRecipient}'`);
  if (principalRecipients.length > 0) {
    str += `${str.length > 0 ? ' AND ' : ''}${MAPPING.principalRecipient}${
      filtering.in
    }(${principalRecipients.join(filtering.multi_param_separator)})`;
  }

  const principalRecipientSubTypes = _.filter(
    _.get(params, 'principalRecipientSubTypes', '').split(','),
    (o: string) => o.length > 0,
  ).map(
    (principalRecipientSubType: string) => `'${principalRecipientSubType}'`,
  );
  if (principalRecipientSubTypes.length > 0) {
    str += `${str.length > 0 ? ' AND ' : ''}${
      MAPPING.principalRecipientSubType
    }${filtering.in}(${principalRecipientSubTypes.join(
      filtering.multi_param_separator,
    )})`;
  }

  const principalRecipientTypes = _.filter(
    _.get(params, 'principalRecipientTypes', '').split(','),
    (o: string) => o.length > 0,
  ).map((principalRecipientType: string) => `'${principalRecipientType}'`);
  if (principalRecipientTypes.length > 0) {
    str += `${str.length > 0 ? ' AND ' : ''}${MAPPING.principalRecipientType}${
      filtering.in
    }(${principalRecipientTypes.join(filtering.multi_param_separator)})`;
  }

  const periods = _.filter(
    [
      ..._.get(params, 'periods', '').split(','),
      ..._.get(params, 'cycles', '').split(','),
    ],
    (o: string) => o.length > 0,
  ).map((period: string) => `'${period.replace(/ /g, '').replace(' - ', '')}'`);
  if (periods.length > 0) {
    str += `${str.length > 0 ? ' AND ' : ''}${MAPPING.period}${
      filtering.in
    }(${periods.join(filtering.multi_param_separator)})`;
  }

  const years = _.filter(
    [
      ..._.get(params, 'years', '').split(','),
      ..._.get(params, 'cycle', '').split(','),
    ],
    (o: string) => o.length > 0,
  ).map((year: string) => `'${year}'`);
  if (years.length > 0) {
    str += `${str.length > 0 ? ' AND ' : ''}${MAPPING.year}${
      filtering.in
    }(${years.join(filtering.multi_param_separator)})`;
  }

  const yearsTo = _.filter(
    _.get(params, 'yearsTo', '').split(','),
    (o: string) => o.length > 0,
  ).map((yearTo: string) => `'${yearTo}'`);
  if (yearsTo.length > 0) {
    str += `${str.length > 0 ? ' AND ' : ''}${MAPPING.yearTo}${
      filtering.in
    }(${yearsTo.join(filtering.multi_param_separator)})`;
  }

  const grantIPs = _.filter(
    _.get(params, 'grantIP', '').split(','),
    (o: string) => o.length > 0,
  ).map((grantIP: string) => `'${grantIP}'`);
  if (grantIPs.length > 0) {
    str += `${str.length > 0 ? ' AND ' : ''}${MAPPING.grantIP}${
      filtering.in
    }(${grantIPs.join(filtering.multi_param_separator)})`;
  }

  const statuses = _.filter(
    _.get(params, 'status', '').split(','),
    (o: string) => o.length > 0,
  ).map((status: string) => `'${status}'`);
  if (statuses.length > 0) {
    str += `${str.length > 0 ? ' AND ' : ''}${MAPPING.status}${
      filtering.in
    }(${statuses.join(filtering.multi_param_separator)})`;
  }

  let mappingSearch = _.get(
    MAPPING,
    `search.${datasetType}`,
    MAPPING.search.generic,
  );
  mappingSearch = mappingSearch.replace(
    '<geography>',
    (Array.isArray(geographyMapping) ? geographyMapping : [geographyMapping])
      .map((g: string) => `contains(${g},<value>)`)
      .join(' OR '),
  );
  mappingSearch = mappingSearch.replace(
    '<component>',
    `contains(${componentMapping},<value>)`,
  );
  mappingSearch = mappingSearch.replace(
    /<componentField>/g,
    componentMapping.split('/')[0],
  );

  const search = _.get(params, 'q', '');
  if (search.length > 0) {
    str += `${str.length > 0 ? ' AND ' : ''}${mappingSearch.replace(
      /<value>/g,
      `'${search}'`,
    )}`;
  }

  let res = urlParams;

  if (str.length > 0) {
    str = str.replace(/&/g, '%26');
    if (urlParams) {
      res = res.replace('filter(<filterString>)', `filter(${str})`);
      res = res.replace('<filterString>', ` AND ${str}`);
      res = res.replace('= AND ', '=');
    }
  } else if (urlParams) {
    res = res.replace('$filter=<filterString>&', '');
    res = res.replace('filter(<filterString>)/', '');
    res = res.replace('<filterString>/', '');
    res = res.replace('<filterString>', '');
  }

  return res;
}
