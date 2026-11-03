import _ from 'lodash';
import filtering from '../../config/filtering/index.json';

const MAPPING = {
  geography: 'donor/geography/code',
  donor: 'name',
  donorType: 'type/name',
  search: `(contains(type/name,<value>) OR contains(name,<value>))`,
};

export function filterDonors(
  params: Record<string, any>,
  urlParams: string,
): string {
  let str = '';

  const geographies = _.filter(
    _.get(params, 'geographies', '').split(','),
    (o: string) => o.length > 0,
  ).map((geography: string) => `'${geography}'`);
  if (geographies.length > 0) {
    str += `${str.length > 0 ? ' AND ' : ''}${MAPPING.geography}${
      filtering.in
    }(${geographies.join(filtering.multi_param_separator)})`;
  }

  const donors = _.filter(
    _.get(params, 'donors', '').split(','),
    (o: string) => o.length > 0,
  ).map((donor: string) => `'${donor}'`);
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
    }(${donors.join(filtering.multi_param_separator)})`;
  }

  const search = _.get(params, 'q', '');
  if (search.length > 0) {
    str += `${str.length > 0 ? ' AND ' : ''}${MAPPING.search.replace(
      /<value>/g,
      `'${_.toString(search).replace(/'/g, "''")}'`,
    )}`;
  }

  let res = urlParams;

  if (str.length > 0) {
    str = str.replace(/&/g, '%26');
    if (urlParams) {
      str = urlParams.replace('<filterString>', ` AND ${str}`);
    }
  } else if (urlParams) {
    res = res.replace('$filter=<filterString>&', '');
    res = res.replace('filter(<filterString>)/', '');
    res = res.replace('<filterString>/', '');
    res = res.replace('<filterString>', '');
  }

  return res;
}
