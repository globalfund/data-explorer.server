import _ from 'lodash';
import filtering from '../../config/filtering/index.json';
import {GeographyFiltering} from './geographies';

const MAPPING = {
  geography: 'geography/code',
  component: 'activityArea/name',
  year: 'resultValueYear',
  search:
    '(contains(geography/code,<value>) OR contains(activityArea/name,<value>) OR contains(indicatorName,<value>))',
};

export async function filterProgrammaticIndicators(
  params: Record<string, any>,
  urlParams: string,
): Promise<string> {
  let str = '';

  str = await GeographyFiltering(
    str,
    _.get(params, 'geographies', '').split(','),
    MAPPING.geography,
  );

  const components = _.filter(
    _.get(params, 'components', '').split(','),
    (o: string) => o.length > 0,
  ).map((component: string) => `'${component}'`);
  if (components.length > 0) {
    str += `${str.length > 0 ? ' AND ' : ''}${MAPPING.component}${
      filtering.in
    }(${components.join(filtering.multi_param_separator)})`;
  }

  const years = _.filter(
    _.get(params, 'years', '').split(','),
    (o: string) => o.length > 0,
  ).map((year: string) => year);
  if (years.length > 0) {
    str += `${str.length > 0 ? ' AND ' : ''}${MAPPING.year}${
      filtering.in
    }(${years.join(filtering.multi_param_separator)})`;
  }

  const search = _.get(params, 'q', '');
  if (search.length > 0) {
    str += `${str.length > 0 ? ' AND ' : ''}${MAPPING.search.replace(
      /<value>/g,
      `'${_.toString(search).replace(/'/g, "''")}'`,
    )}`;
  }

  if (str.length > 0) {
    str = str.replace(/&/g, '%26');
    if (urlParams) {
      str = urlParams.replace('<filterString>', ` AND ${str}`);
    }
  } else if (urlParams) {
    str = urlParams.replace('<filterString>', '');
  }

  return str;
}
