const assert = require('node:assert/strict');
const test = require('node:test');
const axios = require('axios');
const {ApiApplication} = require('../dist/application');
const {
  isPageBundle,
  NarrativesService,
} = require('../dist/services/narratives.service');
const bundle = require('./fixtures/page-bundle-resource-mobilization.json');
const valid = value =>
  isPageBundle(value, 'resource-mobilization', 'global', 'en', 'default');

test('accepts actual NE v2 serialization and profile-scoped headings and optional summary', () => {
  assert.equal(valid(bundle), true);
  const headed = structuredClone(bundle);
  headed.presentation.sections[0].allowed_headings = ['Funding outlook'];
  headed.sections[0].claims[0].heading = 'Funding outlook';
  assert.equal(valid(headed), true);
  headed.sections[0].claims[0].heading = 'Progress';
  assert.equal(valid(headed), false);
  headed.sections[0].claims[0].heading = null;
  headed.presentation.summary = {
    id: 'summary',
    title: 'Summary',
    allowed_headings: ['Outlook'],
  };
  headed.summary = {
    id: 'summary',
    title: 'Summary',
    status: 'ready',
    claims: [{...headed.sections[0].claims[0], heading: 'Outlook'}],
    contributing_section_ids: [headed.sections[0].id],
  };
  assert.equal(valid(headed), true);
  headed.summary.claims[0].heading = 'Progress';
  assert.equal(valid(headed), false);
});

for (const [label, heading] of [
  ['numeric', 123],
  ['array', ['123']],
]) {
  test(`rejects a ${label} v2 heading that stringifies to a configured heading`, () => {
    const data = structuredClone(bundle);
    data.presentation.sections[0].allowed_headings = ['123'];
    data.sections[0].claims[0].heading = heading;
    assert.equal(valid(data), false);
  });
}

test('accepts configured string, null and omitted v2 claim headings', () => {
  const data = structuredClone(bundle);
  data.presentation.sections[0].allowed_headings = ['123'];
  const claim = data.sections[0].claims[0];
  claim.heading = '123';
  assert.equal(valid(data), true);
  claim.heading = null;
  assert.equal(valid(data), true);
  delete claim.heading;
  assert.equal(valid(data), true);
});

for (const status of ['ready', 'insufficient_evidence', 'not_applicable']) {
  test(`rejects array v2 status ${status} with empty claims`, () => {
    const data = structuredClone(bundle);
    data.sections[0].status = [status];
    data.sections[0].claims = [];
    assert.equal(valid(data), false);
  });
}

test('requires claims for genuine ready v2 status and permits empty unavailable sections', () => {
  const data = structuredClone(bundle);
  assert.equal(valid(data), true);
  data.sections[0].claims = [];
  assert.equal(valid(data), false);
  for (const status of ['insufficient_evidence', 'not_applicable']) {
    data.sections[0].status = status;
    assert.equal(valid(data), true);
  }
});

for (const field of ['kind', 'content_hash']) {
  test(`rejects an array v2 source ${field} that stringifies to a valid value`, () => {
    const data = structuredClone(bundle);
    data.sources[0][field] = [data.sources[0][field]];
    assert.equal(valid(data), false);
  });
}

test('accepts genuine string v2 source kinds and valid hash', () => {
  const data = structuredClone(bundle);
  for (const kind of [
    'structured_data',
    'document',
    'model_prediction',
    'external_context',
  ]) {
    data.sources[0].kind = kind;
    assert.equal(valid(data), true);
  }
});

test('rejects other malformed scalar types in v2 status, heading, kind and hash', () => {
  for (const field of ['status', 'heading', 'kind', 'content_hash']) {
    for (const value of [true, 123, {}, [], null, undefined]) {
      if (field === 'heading' && value == null) continue;
      const data = structuredClone(bundle);
      const target =
        field === 'heading'
          ? data.sections[0].claims[0]
          : field === 'status'
            ? data.sections[0]
            : data.sources[0];
      target[field] = value;
      if (field === 'status') data.sections[0].claims = [];
      assert.equal(valid(data), false, `${field}: ${JSON.stringify(value)}`);
    }
  }
});

const mutations = [
  value => {
    value.schema_version = 1;
  },
  value => {
    value.page.page_id = 'other';
  },
  value => {
    value.page.scope_key = 'other';
  },
  value => {
    value.page.locale = 'fr';
  },
  value => {
    value.page.extra = true;
  },
  value => {
    value.metadata.profile_fingerprint = '';
  },
  value => {
    value.presentation.page_type = 'other';
  },
  value => {
    value.presentation.groups.push(value.presentation.groups[0]);
  },
  value => {
    value.presentation.groups.push({id: 'unused', title: 'Unused'});
  },
  value => {
    value.presentation.sections[0].group = 'missing';
  },
  value => {
    value.presentation.sections[0].allowed_headings = ['A', 'A'];
  },
  value => {
    value.sections.reverse();
  },
  value => {
    value.sections[0].title = 'Different';
  },
  value => {
    value.sections[0].group = 'missing';
  },
  value => {
    value.sections[0].status = 'not_applicable';
  },
  value => {
    value.sections[0].claims[0].evidence_ids = ['missing'];
  },
  value => {
    value.sections[0].claims[0].heading = 'Progress';
  },
  value => {
    value.sources.push(value.sources[0]);
  },
  value => {
    value.sources[0].scope.page_id = 'other';
  },
  value => {
    value.sources[0].scope.scope_key = 'other';
  },
  value => {
    value.sources[0].scope.dimensions = [
      {name: 'donor', value: 'A'},
      {name: 'donor', value: 'B'},
    ];
  },
  value => {
    value.sources[0].scope.periods = [null];
  },
  value => {
    value.sources[0].scope.source_dates = ['bad'];
  },
  value => {
    value.sources[0].source_url = 'javascript:alert(1)';
  },
  value => {
    value.sources[0].source_url = 'https://user:password@example.org/a';
  },
  value => {
    value.sources[0].source_url = 'https://example.org\\@evil.org/a';
  },
  value => {
    value.sources[0].source_url = 'https://example.org/\nunsafe';
  },
  value => {
    value.calculations[0].source_ids = ['missing'];
  },
  value => {
    value.calculations[0].scope.page_type = 'other';
  },
  value => {
    value.calculations[0].scope.unit = 'other';
  },
  value => {
    value.calculations[0].scope.periods = [{label: 'other'}];
  },
  value => {
    value.calculations[0].id = value.sources[0].id;
  },
  value => {
    value.calculations[0].result = 'Infinity';
  },
];
for (const [index, mutate] of mutations.entries()) {
  test(`rejects invalid v2 contract mutation ${index}`, () => {
    const invalid = structuredClone(bundle);
    mutate(invalid);
    assert.equal(valid(invalid), false);
  });
}

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
const route = '/narratives/pages/resource-mobilization/global';
test('proxies saved pages with bounded transport and server-held auth', async () => {
  let request;
  axios.get = async (url, options) => {
    request = {url, options};
    return {status: 200, data: bundle};
  };
  const response = await fetch(baseUrl + route);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), bundle);
  assert.equal(
    request.url,
    'http://narrative.internal/narrative-engine/pages/resource-mobilization/global/narratives',
  );
  assert.deepEqual(request.options.params, {
    locale: 'en',
    scope_key: 'default',
  });
  assert.equal(request.options.headers.Authorization, 'server-secret');
  assert.equal(request.options.timeout, 5000);
  assert.equal(request.options.maxRedirects, 0);
  assert.equal(request.options.maxContentLength, 2000000);
  assert.equal(request.options.maxBodyLength, 2000000);
});
test('forwards a validated scope and requires the returned scope to match', async () => {
  const data = structuredClone(bundle);
  data.page.scope_key = 'replenishment-8';
  for (const item of [...data.sources, ...data.calculations])
    item.scope.scope_key = 'replenishment-8';
  axios.get = async (_url, options) => {
    assert.equal(options.params.scope_key, 'replenishment-8');
    return {status: 200, data};
  };
  assert.equal(
    (await fetch(baseUrl + route + '?scope_key=replenishment-8')).status,
    200,
  );
  axios.get = async () => ({status: 200, data: bundle});
  assert.equal(
    (await fetch(baseUrl + route + '?scope_key=replenishment-8')).status,
    502,
  );
});
test('rejects malformed identities before contacting upstream', async () => {
  let calls = 0;
  axios.get = async () => {
    calls++;
    return {status: 200, data: bundle};
  };
  for (const suffix of [
    'global?locale=fr',
    'global?scope_key=../x',
    'global?scope_key=',
    'bad%2Fid',
    'bad%5Cid',
    'bad%252Fid',
    'a..b',
    '%2E%2E%2Fother',
  ]) {
    assert.equal(
      (
        await fetch(
          baseUrl + '/narratives/pages/resource-mobilization/' + suffix,
        )
      ).status,
      400,
      suffix,
    );
  }
  for (const id of ['../x', 'a/b', 'a\\b', 'a%2fb', 'x'.repeat(129)]) {
    await assert.rejects(
      new NarrativesService().getPage(
        'resource-mobilization',
        id,
        'en',
        'default',
      ),
      error => error.code === 'invalidRequest',
    );
  }
  assert.equal(calls, 0);
});
test('maps upstream errors and malformed responses without exposing details', async () => {
  for (const [status, expected] of [
    [404, 404],
    [401, 502],
    [403, 502],
    [302, 502],
    [500, 502],
  ]) {
    axios.get = async () => ({status, data: {secret: 'server-secret'}});
    const response = await fetch(baseUrl + route);
    assert.equal(response.status, expected);
    assert.doesNotMatch(
      await response.text(),
      /server-secret|narrative\.internal/,
    );
  }
  for (const data of [
    {},
    '{broken',
    {error: 'server-secret'},
    {...bundle, sections: null},
  ]) {
    axios.get = async () => ({status: 200, data});
    assert.equal((await fetch(baseUrl + route)).status, 502);
  }
  for (const [code, expected] of [
    ['ETIMEDOUT', 504],
    ['ECONNABORTED', 504],
    ['ERR_BAD_RESPONSE', 502],
  ]) {
    axios.get = async () => {
      const error = new Error('server-secret');
      error.code = code;
      throw error;
    };
    const response = await fetch(baseUrl + route);
    assert.equal(response.status, expected);
    assert.doesNotMatch(await response.text(), /server-secret/);
  }
});
test('rejects oversized bodies through the real axios transport', async () => {
  const http = require('node:http');
  const upstream = http.createServer((_request, response) =>
    response.end('x'.repeat(2000001)),
  );
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  axios.get = originalGet;
  process.env.NARRATIVE_API_URL = `http://127.0.0.1:${upstream.address().port}`;
  try {
    assert.equal((await fetch(baseUrl + route)).status, 502);
  } finally {
    await new Promise(resolve => upstream.close(resolve));
    process.env.NARRATIVE_API_URL = 'http://narrative.internal';
  }
});
test('saved pages are disabled when service URL is absent', async () => {
  delete process.env.NARRATIVE_API_URL;
  assert.equal((await fetch(baseUrl + route)).status, 503);
});

test('summary references stay within ready contributing sections', () => {
  const data = structuredClone(bundle);
  data.presentation.summary = {
    id: 'summary',
    title: 'Summary',
    allowed_headings: [],
  };
  data.summary = {
    id: 'summary',
    title: 'Summary',
    status: 'ready',
    claims: [structuredClone(data.sections[0].claims[0])],
    contributing_section_ids: [data.sections[0].id],
  };
  assert.equal(valid(data), true);
  const changes = [
    value => {
      value.presentation.summary = null;
    },
    value => {
      value.summary.id = value.sections[0].id;
    },
    value => {
      value.summary.title = 'Other';
    },
    value => {
      value.summary.status = 'not_applicable';
    },
    value => {
      value.summary.contributing_section_ids = ['missing'];
    },
    value => {
      value.summary.contributing_section_ids.push(value.sections[0].id);
    },
    value => {
      value.sections[0].status = 'insufficient_evidence';
      value.sections[0].claims = [];
    },
    value => {
      value.summary.claims[0].evidence_ids = ['missing'];
    },
    value => {
      value.summary.claims[0] = value.sections[1].claims[0];
    },
  ];
  for (const change of changes) {
    const invalid = structuredClone(data);
    change(invalid);
    assert.equal(valid(invalid), false);
  }
});

test('calculation claims cite calculations while operands resolve only raw sources', () => {
  const data = structuredClone(bundle);
  data.sections[0].claims[0].evidence_ids = [data.calculations[0].id];
  assert.equal(valid(data), true);
  data.calculations[0].source_ids = [data.calculations[1].id];
  assert.equal(valid(data), false);
});

test('v2 validates calendar dates and semantic period uniqueness', () => {
  const data = structuredClone(bundle);
  data.sources[0].scope.source_dates = ['2026-02-31'];
  assert.equal(valid(data), false);
  const duplicate = structuredClone(bundle);
  const period = duplicate.sources[0].scope.periods[0];
  duplicate.sources[0].scope.periods.push({
    end: period.end,
    start: period.start,
    label: period.label,
  });
  assert.equal(valid(duplicate), false);
  const reordered = structuredClone(bundle);
  const calculated = reordered.calculations[0].scope.periods[0];
  reordered.calculations[0].scope.periods[0] = {
    end: calculated.end,
    start: calculated.start,
    label: calculated.label,
  };
  assert.equal(valid(reordered), true);
});
