const assert = require('node:assert/strict');
const test = require('node:test');
const axios = require('axios');
const {ApiApplication} = require('../dist/application');
const {isCountryBundle} = require('../dist/services/narratives.service');
const realContract = require('./fixtures/country-bundle-moz.json');

test('accepts Python serialized contracts including exponent decimals', () => {
  assert.equal(isCountryBundle(realContract, 'MOZ'), true);
  const scientific = structuredClone(realContract);
  scientific.calculations[0].result = '1E+2';
  const operandId = scientific.calculations[0].source_ids[0];
  scientific.sources.find(source => source.id === operandId).value = '1E-7';
  assert.equal(isCountryBundle(scientific, 'MOZ'), true);
  scientific.calculations[0].result = 'Infinity';
  assert.equal(isCountryBundle(scientific, 'MOZ'), false);
});

test('rejects malformed nested evidence and unresolved references', () => {
  const mutations = [
    value => {
      value.sources[0].scope.periods = [null];
    },
    value => {
      value.sources[0].document_locator = {title: {}, location: 'page 1'};
    },
    value => {
      value.sources[0].source_url = 'javascript:alert(1)';
    },
    value => {
      value.calculations[0].source_ids = ['missing'];
    },
    value => {
      value.sections.find(
        section => section.status === 'ready',
      ).claims[0].evidence_ids = ['missing'];
    },
    value => {
      value.overview.contributing_section_ids = ['missing'];
    },
    value => {
      value.sources.push(value.sources[0]);
    },
  ];
  for (const mutate of mutations) {
    const invalid = structuredClone(realContract);
    mutate(invalid);
    assert.equal(isCountryBundle(invalid, 'MOZ'), false);
  }
});

const bundle = {
  country: 'MOZ',
  locale: 'en',
  metadata: {
    snapshot_id: 'snapshot-1',
    revision_id: 'revision-1',
    model: 'gpt-1',
    prompt_version: 'prompt-1',
    style_version: 'style-1',
    generated_at: '2026-09-22T10:00:00Z',
  },
  sources: [],
  calculations: [],
  sections: [],
  overview: null,
};

let app;
let baseUrl;
const originalGet = axios.get;
const originalUrl = process.env.NARRATIVE_API_URL;
const originalKey = process.env.NARRATIVE_API_KEY;

test.before(async () => {
  process.env.NARRATIVE_API_URL = 'http://narrative.internal';
  process.env.NARRATIVE_API_KEY = 'server-secret';
  app = new ApiApplication({rest: {port: 0}});
  await app.boot();
  await app.start();
  baseUrl = app.restServer.url;
});

test.after(async () => {
  axios.get = originalGet;
  if (originalUrl === undefined) delete process.env.NARRATIVE_API_URL;
  else process.env.NARRATIVE_API_URL = originalUrl;
  if (originalKey === undefined) delete process.env.NARRATIVE_API_KEY;
  else process.env.NARRATIVE_API_KEY = originalKey;
  await app.stop();
});

test('proxies and returns a validated CountryBundle through the actual route', async () => {
  let request;
  axios.get = async (url, options) => {
    request = {url, options};
    return {status: 200, data: realContract};
  };
  const response = await fetch(`${baseUrl}/location/MOZ/narratives?locale=en`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), realContract);
  assert.equal(
    request.url,
    'http://narrative.internal/narrative-engine/countries/MOZ/narratives',
  );
  assert.equal(request.options.params.locale, 'en');
  assert.equal(request.options.maxRedirects, 0);
  assert.equal(request.options.maxContentLength, 2000000);
  assert.equal(request.options.maxBodyLength, 2000000);
  assert.equal(request.options.headers.Authorization, 'server-secret');
});

test('maps missing content and malformed bundles without exposing credentials', async () => {
  axios.get = async () => ({status: 404, data: {secret: 'do-not-return'}});
  let response = await fetch(`${baseUrl}/location/MOZ/narratives?locale=en`);
  assert.equal(response.status, 404);
  assert.doesNotMatch(await response.text(), /secret|server-secret/);

  axios.get = async () => ({status: 200, data: {country: 'MOZ'}});
  response = await fetch(`${baseUrl}/location/MOZ/narratives?locale=en`);
  assert.equal(response.status, 502);
  assert.doesNotMatch(
    await response.text(),
    /server-secret|narrative\.internal/,
  );

  axios.get = async () => ({status: 200, data: {...bundle, sources: {}}});
  response = await fetch(`${baseUrl}/location/MOZ/narratives?locale=en`);
  assert.equal(response.status, 502);

  axios.get = async () => ({status: 200, data: {...bundle, country: 'ZAF'}});
  response = await fetch(`${baseUrl}/location/MOZ/narratives?locale=en`);
  assert.equal(response.status, 502);
});

test('maps timeouts and rejects invalid client parameters', async () => {
  axios.get = async () => {
    const error = new Error('timeout with server-secret');
    error.code = 'ETIMEDOUT';
    throw error;
  };
  let response = await fetch(`${baseUrl}/location/MOZ/narratives?locale=en`);
  assert.equal(response.status, 504);
  response = await fetch(`${baseUrl}/location/moZ/narratives?locale=en`);
  assert.equal(response.status, 400);
  response = await fetch(`${baseUrl}/location/MOZ/narratives?locale=fr`);
  assert.equal(response.status, 400);
});

test('maps upstream authentication failures and redirects without forwarding details', async () => {
  axios.get = async () => ({status: 401, data: {secret: 'upstream'}});
  let response = await fetch(`${baseUrl}/location/MOZ/narratives?locale=en`);
  assert.equal(response.status, 502);
  assert.doesNotMatch(await response.text(), /upstream|server-secret/);

  axios.get = async () => ({status: 302, headers: {location: 'http://other'}});
  response = await fetch(`${baseUrl}/location/MOZ/narratives?locale=en`);
  assert.equal(response.status, 502);
  assert.doesNotMatch(await response.text(), /http:\/\/other/);
});

test('is disabled cleanly when the service URL is not configured', async () => {
  delete process.env.NARRATIVE_API_URL;
  const response = await fetch(`${baseUrl}/location/MOZ/narratives?locale=en`);
  assert.equal(response.status, 503);
});
