import _ from 'lodash';
import filtering from '../../config/filtering/index.json';
import {GeographyFiltering} from './geographies';

const MAPPING = {
  geography: 'geography/code',
  component: 'activityAreas/any(tag:tag/name in (<value>))',
  period: 'periodFrom',
  trpWindow: 'window',
  portfolioCategory: 'differentiationCategory',
  search:
    '(contains(geography/name, <value>) OR contains(name, <value>)) OR contains(reviewApproach, <value>) OR contains(window, <value>) OR contains(reviewOutcome, <value>) OR contains(differentiationCategory, <value>)',
};

export async function filterFundingRequests(
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
    str += `${str.length > 0 ? ' AND ' : ''}${MAPPING.component.replace(
      /<value>/g,
      components.join(filtering.multi_param_separator),
    )}`;
  }

  const periods = _.filter(
    _.get(params, 'periods', '').split(','),
    (o: string) => o.length > 0,
  ).map((period: string) => `'${period}'`);
  if (periods.length > 0) {
    str += `${str.length > 0 ? ' AND ' : ''}${MAPPING.period}${
      filtering.in
    }(${periods.join(filtering.multi_param_separator)})`;
  }

  const trpWindows = _.filter(
    _.get(params, 'trpWindows', '').split(','),
    (o: string) => o.length > 0,
  ).map((trpWindow: string) => `'${trpWindow}'`);
  if (trpWindows.length > 0) {
    str += `${str.length > 0 ? ' AND ' : ''}${MAPPING.trpWindow}${
      filtering.in
    }(${trpWindows.join(filtering.multi_param_separator)})`;
  }

  const portfolioCategories = _.filter(
    _.get(params, 'portfolioCategories', '').split(','),
    (o: string) => o.length > 0,
  ).map((portfolioCategory: string) => `'${portfolioCategory}'`);
  if (portfolioCategories.length > 0) {
    str += `${str.length > 0 ? ' AND ' : ''}${MAPPING.portfolioCategory}${
      filtering.in
    }(${portfolioCategories.join(filtering.multi_param_separator)})`;
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
