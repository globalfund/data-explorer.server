import axios, {AxiosError} from 'axios';

export type NarrativeServiceErrorCode =
  | 'invalidRequest'
  | 'notFound'
  | 'unavailable'
  | 'timeout'
  | 'upstreamAuth'
  | 'upstreamError'
  | 'invalidUpstream';

export class NarrativeServiceError extends Error {
  constructor(
    public readonly code: NarrativeServiceErrorCode,
    public readonly statusCode: number,
  ) {
    super(code);
    this.name = 'NarrativeServiceError';
  }
}

const COUNTRY_CODE = /^[A-Z]{3}$/;
const LOCALE = 'en';
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATETIME =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/;
const IDENTIFIER = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const VERSION = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;
const HASH = /^[0-9a-f]{64}$/;
const HTTP_URL = /^https?:\/\/[^\s]+$/;
const PARAGRAPH_HEADINGS = [
  'Introduction',
  'Progress',
  'Challenges',
  'Global Fund investments',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnly(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  return Object.keys(value).every(key => keys.includes(key));
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isDate(value: unknown): value is string {
  return typeof value === 'string' && ISO_DATE.test(value);
}

function periodKey(value: unknown): string {
  return JSON.stringify(value);
}

function isPeriod(value: unknown): boolean {
  if (!isRecord(value) || !hasOnly(value, ['label', 'start', 'end']))
    return false;
  const hasRange = value.start !== null && value.start !== undefined;
  if (hasRange !== (value.end !== null && value.end !== undefined))
    return false;
  if (value.label == null && !hasRange) return false;
  if (value.label != null && !isText(value.label)) return false;
  if (
    hasRange &&
    (!isDate(value.start) || !isDate(value.end) || value.start > value.end)
  )
    return false;
  return true;
}

function isScope(value: unknown, country: string): boolean {
  if (
    !isRecord(value) ||
    !hasOnly(value, ['country', 'periods', 'unit', 'currency', 'source_dates'])
  )
    return false;
  return (
    value.country === country &&
    Array.isArray(value.periods) &&
    value.periods.length > 0 &&
    value.periods.every(isPeriod) &&
    new Set(value.periods.map(item => JSON.stringify(item))).size ===
      value.periods.length &&
    Array.isArray(value.source_dates) &&
    value.source_dates.every(isDate) &&
    new Set(value.source_dates).size === value.source_dates.length &&
    (value.unit == null || isText(value.unit)) &&
    (value.currency == null ||
      (typeof value.currency === 'string' && /^[A-Z]{3}$/.test(value.currency)))
  );
}

function isEvidence(value: unknown, country: string): boolean {
  if (
    !isRecord(value) ||
    !hasOnly(value, [
      'id',
      'kind',
      'source_url',
      'document_locator',
      'content_hash',
      'retrieved_at',
      'value',
      'excerpt',
      'scope',
    ])
  )
    return false;
  const hasSource = value.source_url != null || value.document_locator != null;
  const hasContent = value.value != null || value.excerpt != null;
  const scalar =
    value.value == null ||
    typeof value.value === 'boolean' ||
    (typeof value.value === 'string' && isText(value.value)) ||
    (typeof value.value === 'number' && Number.isFinite(value.value)) ||
    (typeof value.value === 'string' &&
      /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.value));
  return (
    typeof value.id === 'string' &&
    IDENTIFIER.test(value.id) &&
    [
      'structured_data',
      'document',
      'model_prediction',
      'external_context',
    ].includes(String(value.kind)) &&
    (value.source_url == null ||
      (typeof value.source_url === 'string' &&
        HTTP_URL.test(value.source_url))) &&
    (value.document_locator == null ||
      (isRecord(value.document_locator) &&
        hasOnly(value.document_locator, ['title', 'location']) &&
        isText(value.document_locator.title) &&
        isText(value.document_locator.location))) &&
    HASH.test(String(value.content_hash)) &&
    typeof value.retrieved_at === 'string' &&
    ISO_DATETIME.test(value.retrieved_at) &&
    hasSource &&
    hasContent &&
    scalar &&
    (value.excerpt == null || isText(value.excerpt)) &&
    isScope(value.scope, country)
  );
}

function isClaim(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasOnly(value, ['text', 'evidence_ids', 'heading']) &&
    isText(value.text) &&
    (value.heading == null ||
      PARAGRAPH_HEADINGS.includes(
        value.heading as (typeof PARAGRAPH_HEADINGS)[number],
      )) &&
    Array.isArray(value.evidence_ids) &&
    value.evidence_ids.length > 0 &&
    value.evidence_ids.every(
      id => typeof id === 'string' && IDENTIFIER.test(id),
    ) &&
    new Set(value.evidence_ids).size === value.evidence_ids.length
  );
}

function isSection(value: unknown, overview = false): boolean {
  if (!isRecord(value)) return false;
  const common = hasOnly(
    value,
    overview
      ? ['id', 'tab', 'title', 'status', 'claims', 'contributing_section_ids']
      : ['id', 'tab', 'title', 'status', 'claims'],
  );
  if (
    !common ||
    typeof value.id !== 'string' ||
    !IDENTIFIER.test(value.id) ||
    !isText(value.title) ||
    !Array.isArray(value.claims)
  )
    return false;
  if (overview)
    return (
      value.tab === 'overview' &&
      value.status === 'ready' &&
      value.claims.length > 0 &&
      value.claims.every(isClaim) &&
      Array.isArray(value.contributing_section_ids) &&
      value.contributing_section_ids.length > 0 &&
      value.contributing_section_ids.every(
        id => typeof id === 'string' && IDENTIFIER.test(id),
      ) &&
      new Set(value.contributing_section_ids).size ===
        value.contributing_section_ids.length
    );
  return (
    [
      'resource-mobilization',
      'access-to-funding',
      'financial-insights',
      'results',
    ].includes(String(value.tab)) &&
    ['ready', 'insufficient_evidence', 'not_applicable'].includes(
      String(value.status),
    ) &&
    (value.status === 'ready'
      ? value.claims.length > 0
      : value.claims.length === 0) &&
    value.claims.every(isClaim)
  );
}

export function isCountryBundle(
  value: unknown,
  expectedCountry: string,
  expectedLocale = LOCALE,
): boolean {
  if (
    !isRecord(value) ||
    !hasOnly(value, [
      'country',
      'locale',
      'metadata',
      'sources',
      'calculations',
      'sections',
      'overview',
    ]) ||
    value.country !== expectedCountry ||
    value.locale !== expectedLocale ||
    !isRecord(value.metadata)
  )
    return false;
  const metadata = value.metadata;
  if (
    !hasOnly(metadata, [
      'snapshot_id',
      'revision_id',
      'model',
      'prompt_version',
      'style_version',
      'generated_at',
    ]) ||
    ![
      metadata.snapshot_id,
      metadata.revision_id,
      metadata.model,
      metadata.prompt_version,
      metadata.style_version,
    ].every(item => typeof item === 'string' && VERSION.test(item)) ||
    typeof metadata.generated_at !== 'string' ||
    !ISO_DATETIME.test(metadata.generated_at)
  )
    return false;
  if (
    !Array.isArray(value.sources) ||
    !Array.isArray(value.calculations) ||
    !Array.isArray(value.sections)
  )
    return false;
  const sources = value.sources;
  const calculations = value.calculations;
  const sections = value.sections;
  if (
    !sources.every(item => isEvidence(item, expectedCountry)) ||
    !calculations.every(item =>
      isCalculation(item, expectedCountry, sources),
    ) ||
    !sections.every(item => isSection(item)) ||
    (value.overview != null && !isSection(value.overview, true))
  )
    return false;
  const sourceIds = new Set(
    sources.map(item => (item as Record<string, unknown>).id),
  );
  const calculationIds = new Set(
    calculations.map(item => (item as Record<string, unknown>).id),
  );
  const sectionIds = new Set(
    sections.map(item => (item as Record<string, unknown>).id),
  );
  if (
    sourceIds.size !== sources.length ||
    calculationIds.size !== calculations.length ||
    sectionIds.size !== sections.length ||
    [...sourceIds].some(id => calculationIds.has(id))
  )
    return false;
  const references = new Set([...sourceIds, ...calculationIds]);
  if (
    !sections.every(
      section =>
        (section as Record<string, unknown>).claims instanceof Array &&
        ((section as Record<string, unknown>).claims as unknown[]).every(
          claim =>
            (
              (claim as Record<string, unknown>).evidence_ids as unknown[]
            ).every(id => references.has(id)),
        ),
    )
  )
    return false;
  if (value.overview != null) {
    const overview = value.overview as Record<string, unknown>;
    if (
      sectionIds.has(overview.id) ||
      !(overview.contributing_section_ids as unknown[]).every(id =>
        sectionIds.has(id),
      )
    )
      return false;
    const readySections = sections.filter(
      section => (section as Record<string, unknown>).status === 'ready',
    );
    if (
      !(overview.contributing_section_ids as unknown[]).every(id =>
        readySections.some(
          section => (section as Record<string, unknown>).id === id,
        ),
      )
    )
      return false;
    const contributing = new Set(
      readySections
        .filter(section =>
          (overview.contributing_section_ids as unknown[]).includes(
            (section as Record<string, unknown>).id,
          ),
        )
        .flatMap(section =>
          ((section as Record<string, unknown>).claims as unknown[]).flatMap(
            claim =>
              (claim as Record<string, unknown>).evidence_ids as unknown[],
          ),
        ),
    );
    if (
      !(overview.claims as unknown[]).every(claim =>
        ((claim as Record<string, unknown>).evidence_ids as unknown[]).every(
          id => contributing.has(id),
        ),
      )
    )
      return false;
  }
  return true;
}

function isCalculation(
  value: unknown,
  country: string,
  sources: unknown[],
): boolean {
  if (
    !isRecord(value) ||
    !hasOnly(value, [
      'id',
      'source_ids',
      'formula',
      'result',
      'unit',
      'scope',
    ]) ||
    typeof value.id !== 'string' ||
    !IDENTIFIER.test(value.id) ||
    !Array.isArray(value.source_ids) ||
    value.source_ids.length === 0 ||
    !value.source_ids.every(
      id => typeof id === 'string' && IDENTIFIER.test(id),
    ) ||
    new Set(value.source_ids).size !== value.source_ids.length ||
    !isText(value.formula) ||
    !(typeof value.result === 'number'
      ? Number.isFinite(value.result)
      : typeof value.result === 'string' &&
        /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.result)) ||
    !isText(value.unit) ||
    !isScope(value.scope, country)
  )
    return false;
  const operands = value.source_ids.map(id =>
    sources.find(source => (source as Record<string, unknown>).id === id),
  );
  if (operands.some(item => !item)) return false;
  return (
    operands.every(
      item =>
        typeof (item as Record<string, unknown>).value === 'number' ||
        (typeof (item as Record<string, unknown>).value === 'string' &&
          /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(
            (item as Record<string, unknown>).value as string,
          )),
    ) &&
    operands.every(
      item =>
        (item as Record<string, unknown>).scope &&
        ((item as Record<string, unknown>).scope as Record<string, unknown>)
          .unit ===
          (
            (operands[0] as Record<string, unknown>).scope as Record<
              string,
              unknown
            >
          ).unit &&
        ((item as Record<string, unknown>).scope as Record<string, unknown>)
          .currency === (value.scope as Record<string, unknown>).currency,
    ) &&
    (value.scope as Record<string, unknown>).unit === value.unit &&
    new Set(
      operands
        .flatMap(
          item =>
            ((item as Record<string, unknown>).scope as Record<string, unknown>)
              .periods as unknown[],
        )
        .map(periodKey),
    ).size ===
      new Set(
        ((value.scope as Record<string, unknown>).periods as unknown[]).map(
          periodKey,
        ),
      ).size &&
    [
      ...new Set(
        operands
          .flatMap(
            item =>
              (
                (item as Record<string, unknown>).scope as Record<
                  string,
                  unknown
                >
              ).periods as unknown[],
          )
          .map(periodKey),
      ),
    ].every(key =>
      ((value.scope as Record<string, unknown>).periods as unknown[])
        .map(periodKey)
        .includes(key),
    )
  );
}

export class NarrativesService {
  async get(country: string, locale: string): Promise<unknown> {
    if (!COUNTRY_CODE.test(country) || locale !== LOCALE)
      throw new NarrativeServiceError('invalidRequest', 400);
    const baseUrl = process.env.NARRATIVE_API_URL;
    if (!baseUrl || !/^https?:\/\/[^\s/]+(?:\/[^\s?]*)?$/.test(baseUrl))
      throw new NarrativeServiceError('unavailable', 503);
    const url = `${baseUrl.replace(
      /\/$/,
      '',
    )}/narrative-engine/countries/${country}/narratives`;
    try {
      const response = await axios.get(url, {
        params: {locale},
        headers: process.env.NARRATIVE_API_KEY
          ? {Authorization: process.env.NARRATIVE_API_KEY}
          : undefined,
        timeout: 5000,
        maxRedirects: 0,
        maxContentLength: 2_000_000,
        maxBodyLength: 2_000_000,
        validateStatus: () => true,
      });
      if (response.status === 404)
        throw new NarrativeServiceError('notFound', 404);
      if (response.status === 401 || response.status === 403)
        throw new NarrativeServiceError('upstreamAuth', 502);
      if (response.status < 200 || response.status >= 300)
        throw new NarrativeServiceError('upstreamError', 502);
      if (!isCountryBundle(response.data, country, locale))
        throw new NarrativeServiceError('invalidUpstream', 502);
      return response.data;
    } catch (error) {
      if (error instanceof NarrativeServiceError) throw error;
      const axiosError = error as AxiosError;
      if (axiosError.code === 'ECONNABORTED' || axiosError.code === 'ETIMEDOUT')
        throw new NarrativeServiceError('timeout', 504);
      throw new NarrativeServiceError('upstreamError', 502);
    }
  }
}
