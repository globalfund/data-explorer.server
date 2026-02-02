import fs from 'fs';
import _ from 'lodash';
// @ts-expect-error untyped module
import {chart as rawChart} from '@rawgraphs/rawgraphs-core';

import {
  echartsBarchart,
  echartsGeomap,
  echartsHeatmap,
  echartsLinechart,
  echartsPiechart,
  echartsRadarchart,
  echartsSankey,
  echartsBubblechart,
  echartsTreemap,
  // @ts-expect-error untyped module
} from 'rb-core.charts';

const charts: {[key: string]: any} = {
  bar: echartsBarchart,
  geomap: echartsGeomap,
  heatmap: echartsHeatmap,
  line: echartsLinechart,
  pie: echartsPiechart,
  radar: echartsRadarchart,
  scatter: echartsBubblechart,
  sankey: echartsSankey,
  treemap: echartsTreemap,
  // other chart types can be added here
};

function filterData(parsedDataset: any[], appliedFilters: any) {
  // Get the filter keys
  const filterKeys = Object.keys(appliedFilters || {});
  if (filterKeys.length === 0) return parsedDataset; // can't be 0, but safety return

  // Filter 'data' based on 'appliedFilters' using the specified 'filterKeys'
  const filteredData = _.filter(parsedDataset, item => {
    // Check if all conditions hold for each 'filterKey'
    return filterKeys.every(filterKey =>
      appliedFilters[filterKey]?.includes(item[filterKey]),
    );
  });

  return filteredData;
}

function getDatasetFilterOptions(
  dataset: any[],
  dataTypes: any,
  onlyKeys: boolean,
  appliedFilters: any,
) {
  const filterOptions: any[] = [];
  if (!dataset || dataset.length === 0) return filterOptions;

  // Extract the keys from dataset, excluding certain ones
  const itemKeys = Object.keys(dataset[0]).filter(
    key =>
      key !== 'id' &&
      !key.toLowerCase().includes('amount') &&
      !key.toLowerCase().includes('date') &&
      !key.toLowerCase().includes('number') &&
      !key.toLowerCase().includes('title'),
  );

  if (onlyKeys) return itemKeys;

  // First, filter the dataset based on the applied filters **once**

  // Now, calculate filter options for each key based on the filtered dataset
  itemKeys.forEach(key => {
    // Get potential options: if this key wasn't selected, how many are available?
    const potentialGroupedMap = new Map();
    const relaxedFilters = {...appliedFilters};
    delete relaxedFilters[key]; // Temporarily remove the current key from filters

    const relaxedDataset = filterData(dataset, relaxedFilters);
    relaxedDataset.forEach(item => {
      const value = item[key];
      if (value !== undefined && value !== null && value !== '') {
        if (!potentialGroupedMap.has(value)) {
          potentialGroupedMap.set(value, 0);
        }
        potentialGroupedMap.set(value, potentialGroupedMap.get(value) + 1);
      }
    });

    const potentialOptionsWithContent = [];
    for (const [optionKey, count] of potentialGroupedMap.entries()) {
      const option =
        dataTypes[key] === 'number' ? Number(optionKey) : optionKey;
      if (count > 0) {
        potentialOptionsWithContent.push({name: option, count: count});
      }
    }

    if (potentialOptionsWithContent.length > 0) {
      filterOptions.push({
        name: key,
        enabled: true,
        options: _.orderBy(
          _.uniqBy(potentialOptionsWithContent, 'name').map(o => ({
            label: o.name,
            value: o.name,
            count: o.count,
          })),
          'label',
          dataTypes[key] === 'number' ? 'desc' : 'asc',
        ),
      });
    }
  });

  return filterOptions;
}

export function renderChart(
  item: {
    chartType: string;
    mapping: any;
    vizOptions: any;
    appliedFilters: any;
  },
  parsed: any,
) {
  const initialParsedDataset = parsed.dataset;
  let filteredDataset = initialParsedDataset;

  if (!_.isEmpty(item.appliedFilters)) {
    filteredDataset = filterData(initialParsedDataset, item.appliedFilters);
  }

  const chart = charts[item.chartType];

  try {
    const viz = rawChart(chart, {
      data: filteredDataset,
      mapping: item.mapping,
      visualOptions: item.vizOptions,
      dataTypes: parsed.dataTypes,
    });

    const vizData = viz._getVizData();

    const tabItem = {
      renderedContent: '',
      appliedFilters: item.appliedFilters,
      filterOptionGroups: getDatasetFilterOptions(
        initialParsedDataset,
        parsed.dataTypes,
        false,
        item.appliedFilters,
      ),
      dataTypes: parsed.dataTypes,
      mappedData: vizData,
      dimensions: chart.dimensions,
      ssr: false,
    };
    return tabItem;
  } catch (e) {
    console.log(e);
  }
}

export async function renderChartData(chartData: {
  chartType: string;
  mapping: any;
  vizOptions: any;
  appliedFilters: any;
  datasetId: string;
}) {
  let parsed = null;
  try {
    const filePath =
      process.env.PARSED_DATA_FILES_PATH ||
      `../data-explorer.backend/parsed-data-files/`;
    const parsedData = fs.readFileSync(
      `${filePath}${chartData?.datasetId}.json`,
    );

    parsed = JSON.parse(parsedData.toString());
  } catch (error) {
    console.log('Error reading parsed data file', error);
  }

  let renderedChart;
  try {
    // render the chart
    renderedChart = renderChart(chartData, parsed);
    // Return the rendered chart item
    // json stringify and save to ./rendered.json
    console.log('Success...');
    return renderedChart;
  } catch (e) {
    console.log(e);
  }
}
