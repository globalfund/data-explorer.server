import {expect, sinon} from '@loopback/testlab';
import fs from 'fs';
import fsPromises from 'fs/promises';
import os from 'os';
import path from 'path';
import {filterDataset, getFilterOptions} from '../../utils/filterDataset';
import {
  clearParsedDatasetCache,
  readParsedDataset,
} from '../../utils/parsedDataset';
import {renderChartData} from '../../utils/renderChart';

const dataset = {
  dataTypes: {country: 'string', component: 'string', amount: 'number'},
  dataset: [
    {country: 'Kenya', component: 'HIV', amount: '10'},
    {country: 'Kenya', component: 'Malaria', amount: '5'},
    {country: 'Ghana', component: 'HIV', amount: '7'},
    {country: 'Peru', component: 'TB', amount: '1'},
  ],
};

const expectStatus = async (promise: Promise<unknown>, status: number) => {
  try {
    await promise;
  } catch (e) {
    expect(e.statusCode).to.equal(status);
    return;
  }
  throw new Error(`expected a ${status} error`);
};

describe('parsed datasets (unit)', () => {
  let dir: string;
  let previousPath: string | undefined;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'parsed-datasets-'));
    fs.writeFileSync(path.join(dir, 'gf_test.json'), JSON.stringify(dataset));
    previousPath = process.env.PARSED_DATA_FILES_PATH;
    process.env.PARSED_DATA_FILES_PATH = `${dir}/`;
    clearParsedDatasetCache();
  });

  afterEach(() => {
    sinon.restore();
    process.env.PARSED_DATA_FILES_PATH = previousPath;
    fs.rmSync(dir, {recursive: true, force: true});
  });

  it('parses a file once and reuses it until it changes', async () => {
    const readFile = sinon.spy(fsPromises, 'readFile');
    await readParsedDataset('gf_test');
    await readParsedDataset('gf_test');
    expect(readFile.callCount).to.equal(1);

    const later = new Date(Date.now() + 5000);
    fs.utimesSync(path.join(dir, 'gf_test.json'), later, later);
    await readParsedDataset('gf_test');
    expect(readFile.callCount).to.equal(2);
  });

  it('shares one parse between concurrent requests', async () => {
    const readFile = sinon.spy(fsPromises, 'readFile');
    const results = await Promise.all([
      readParsedDataset('gf_test'),
      readParsedDataset('gf_test'),
      readParsedDataset('gf_test'),
    ]);
    expect(readFile.callCount).to.equal(1);
    expect(results[0]).to.equal(results[2]);
  });

  it('rejects unknown and unsafe dataset ids', async () => {
    await expectStatus(readParsedDataset('gf_missing'), 404);
    await expectStatus(readParsedDataset('../gf_test'), 400);
  });

  it('filters, sorts and pages without changing the cached rows', async () => {
    const page = await filterDataset({
      datasetId: 'gf_test',
      appliedFilters: {component: ['HIV']},
      sortOptions: [{column: 'country', order: 'asc'}],
      page: '1',
      pageSize: '1',
    });
    expect(page).to.eql({
      result: [{country: 'Ghana', component: 'HIV', amount: '7'}],
      count: 2,
    });
    expect((await readParsedDataset('gf_test')).dataset).to.eql(
      dataset.dataset,
    );
  });

  it('sums numeric strings into the Other row', async () => {
    const result = await filterDataset({
      datasetId: 'gf_test',
      appliedFilters: {},
      sortOptions: [],
      limitToTop: true,
      limitToTopValue: '1',
      groupRemainderAsOther: true,
    });
    expect(result.result[1]).to.eql({
      country: 'Other',
      component: 'Other',
      amount: 13,
    });
  });

  it('reports bad input and missing data as errors, not empty results', async () => {
    await expectStatus(
      filterDataset({
        datasetId: 'gf_test',
        appliedFilters: {component: 'HIV' as never},
        sortOptions: [],
      }),
      400,
    );
    await expectStatus(
      getFilterOptions({datasetId: 'gf_missing', appliedFilters: {}}),
      404,
    );
    await expectStatus(
      renderChartData({
        datasetId: 'gf_test',
        chartType: 'not-a-chart',
        mapping: {},
        vizOptions: {},
        appliedFilters: {},
      }),
      400,
    );
  });

  it('counts filter options relative to the other applied filters', async () => {
    const groups = await getFilterOptions({
      datasetId: 'gf_test',
      appliedFilters: {country: ['Kenya']},
    });
    const component = groups.find(
      (group: {name: string}) => group.name === 'component',
    );
    expect(component.options.map((o: {value: string}) => o.value)).to.eql([
      'HIV',
      'Malaria',
    ]);
  });
});
