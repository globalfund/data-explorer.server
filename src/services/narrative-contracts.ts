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
  return value.country === country && isMeasuredScope(value);
}

function isMeasuredScope(
  value: Record<string, unknown>,
  key = periodKey,
): boolean {
  return (
    Array.isArray(value.periods) &&
    value.periods.length > 0 &&
    value.periods.every(isPeriod) &&
    new Set(value.periods.map(key)).size === value.periods.length &&
    Array.isArray(value.source_dates) &&
    value.source_dates.every(isDate) &&
    new Set(value.source_dates).size === value.source_dates.length &&
    (value.unit == null || isText(value.unit)) &&
    (value.currency == null ||
      (typeof value.currency === 'string' && /^[A-Z]{3}$/.test(value.currency)))
  );
}

type ScopeValidator = (value: unknown) => boolean;

function isEvidence(
  value: unknown,
  validateScope: ScopeValidator,
  strictV2 = false,
): boolean {
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
    ]) ||
    (strictV2 &&
      (typeof value.kind !== 'string' ||
        typeof value.content_hash !== 'string'))
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
        (strictV2
          ? isSafeSourceUrl(value.source_url)
          : HTTP_URL.test(value.source_url)))) &&
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
    validateScope(value.scope)
  );
}

function isClaim(
  value: unknown,
  headings: readonly string[] = PARAGRAPH_HEADINGS,
): boolean {
  return (
    isRecord(value) &&
    hasOnly(value, ['text', 'evidence_ids', 'heading']) &&
    isText(value.text) &&
    (value.heading == null ||
      (typeof value.heading === 'string' &&
        headings.includes(value.heading))) &&
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
      value.claims.every(claim => isClaim(claim)) &&
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
    value.claims.every(claim => isClaim(claim))
  );
}

export function isCountryBundle(
  value: unknown,
  expectedCountry: string,
  expectedLocale = 'en',
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
  if (!isMetadata(value.metadata)) return false;
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
    !sources.every(item =>
      isEvidence(item, scope => isScope(scope, expectedCountry)),
    ) ||
    !calculations.every(item =>
      isCalculation(item, scope => isScope(scope, expectedCountry), sources),
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
  validateScope: ScopeValidator,
  sources: unknown[],
  periodIdentity = periodKey,
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
    !validateScope(value.scope)
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
        .map(periodIdentity),
    ).size ===
      new Set(
        ((value.scope as Record<string, unknown>).periods as unknown[]).map(
          periodIdentity,
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
          .map(periodIdentity),
      ),
    ].every(key =>
      ((value.scope as Record<string, unknown>).periods as unknown[])
        .map(periodIdentity)
        .includes(key),
    )
  );
}

function isIdentifier(value: unknown): value is string {
  return typeof value === 'string' && IDENTIFIER.test(value);
}

export function isPageIdentity(
  pageType: unknown,
  pageId: unknown,
  locale: unknown,
  scopeKey: unknown,
): boolean {
  return (
    isIdentifier(pageType) &&
    typeof pageId === 'string' &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(pageId) &&
    !pageId.includes('..') &&
    locale === 'en' &&
    isIdentifier(scopeKey)
  );
}

function isSafeSourceUrl(value: string): boolean {
  if (
    !HTTP_URL.test(value) ||
    [...value].some(
      character =>
        character === '\\' ||
        character.charCodeAt(0) <= 32 ||
        character.charCodeAt(0) === 127,
    )
  )
    return false;
  try {
    const url = new URL(value);
    return (
      ['http:', 'https:'].includes(url.protocol) &&
      !!url.hostname &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

function isPageScope(value: unknown, page: Record<string, unknown>): boolean {
  if (
    !isRecord(value) ||
    !hasOnly(value, [
      'page_type',
      'page_id',
      'scope_key',
      'periods',
      'unit',
      'currency',
      'source_dates',
      'dimensions',
    ]) ||
    value.page_type !== page.page_type ||
    value.page_id !== page.page_id ||
    value.scope_key !== page.scope_key
  )
    return false;
  const dimensions = value.dimensions === undefined ? [] : value.dimensions;
  if (
    !Array.isArray(dimensions) ||
    !dimensions.every(
      item =>
        isRecord(item) &&
        hasOnly(item, ['name', 'value']) &&
        isIdentifier(item.name) &&
        isText(item.value),
    ) ||
    new Set(dimensions.map(item => item.name)).size !== dimensions.length
  )
    return false;
  if (
    !Array.isArray(value.source_dates) ||
    !value.source_dates.every(isCalendarDate) ||
    !Array.isArray(value.periods) ||
    !value.periods.every(
      period =>
        isRecord(period) &&
        (period.start == null || isCalendarDate(period.start)) &&
        (period.end == null || isCalendarDate(period.end)),
    )
  )
    return false;
  return isMeasuredScope(value, pagePeriodKey);
}

function isPresentationEntry(
  value: unknown,
  keys: string[],
): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    hasOnly(value, keys) &&
    isIdentifier(value.id) &&
    isText(value.title)
  );
}

function isHeadings(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every(isText) &&
    new Set(value).size === value.length
  );
}

function isPageSection(
  value: unknown,
  configured: Record<string, unknown>,
  summary = false,
): value is Record<string, unknown> {
  if (
    !isRecord(value) ||
    !hasOnly(
      value,
      summary
        ? ['id', 'title', 'status', 'claims', 'contributing_section_ids']
        : ['id', 'group', 'title', 'status', 'claims'],
    ) ||
    value.id !== configured.id ||
    value.title !== configured.title ||
    (!summary && value.group !== configured.group) ||
    !Array.isArray(value.claims)
  )
    return false;
  if (
    typeof value.status !== 'string' ||
    !['ready', 'insufficient_evidence', 'not_applicable'].includes(
      value.status,
    ) ||
    (summary && value.status !== 'ready')
  )
    return false;
  return (
    (value.status === 'ready'
      ? value.claims.length > 0
      : value.claims.length === 0) &&
    value.claims.every(claim =>
      isClaim(claim, (configured.allowed_headings ?? []) as string[]),
    )
  );
}

function claimReferences(section: Record<string, unknown>): unknown[] {
  return (section.claims as Record<string, unknown>[]).flatMap(
    claim => claim.evidence_ids as unknown[],
  );
}

export function isPageBundle(
  value: unknown,
  expectedType: string,
  expectedId: string,
  expectedLocale = 'en',
  expectedScope = 'default',
): boolean {
  if (
    !isRecord(value) ||
    !hasOnly(value, [
      'schema_version',
      'page',
      'metadata',
      'presentation',
      'sources',
      'calculations',
      'sections',
      'summary',
    ]) ||
    value.schema_version !== 2 ||
    !isRecord(value.page) ||
    !hasOnly(value.page, ['page_type', 'page_id', 'locale', 'scope_key'])
  )
    return false;
  const page = value.page;
  if (
    !isPageIdentity(
      page.page_type,
      page.page_id,
      page.locale,
      page.scope_key,
    ) ||
    page.page_type !== expectedType ||
    page.page_id !== expectedId ||
    page.locale !== expectedLocale ||
    page.scope_key !== expectedScope
  )
    return false;
  if (
    !isRecord(value.metadata) ||
    !hasOnly(value.metadata, [
      'snapshot_id',
      'revision_id',
      'model',
      'prompt_version',
      'style_version',
      'generated_at',
      'profile_fingerprint',
    ]) ||
    typeof value.metadata.profile_fingerprint !== 'string' ||
    !VERSION.test(value.metadata.profile_fingerprint)
  )
    return false;
  const {profile_fingerprint: fingerprint, ...metadata} = value.metadata;
  // Reuse the unchanged v1 metadata contract without inventing a country-shaped v2 payload.
  if (!isMetadata(metadata) || !fingerprint) return false;
  const presentation = value.presentation;
  if (
    !isRecord(presentation) ||
    !hasOnly(presentation, ['page_type', 'groups', 'sections', 'summary']) ||
    presentation.page_type !== page.page_type ||
    !Array.isArray(presentation.groups) ||
    !presentation.groups.length ||
    !Array.isArray(presentation.sections) ||
    !presentation.sections.length
  )
    return false;
  const groups = presentation.groups;
  const configured = presentation.sections;
  if (
    !groups.every(item => isPresentationEntry(item, ['id', 'title'])) ||
    !configured.every(
      item =>
        isPresentationEntry(item, [
          'id',
          'group',
          'title',
          'allowed_headings',
        ]) &&
        isIdentifier(item.group) &&
        isHeadings(
          item.allowed_headings === undefined ? [] : item.allowed_headings,
        ),
    )
  )
    return false;
  const groupIds = new Set(groups.map(item => item.id));
  const sectionIds = new Set(configured.map(item => item.id));
  const usedGroups = new Set(configured.map(item => item.group));
  if (
    groupIds.size !== groups.length ||
    sectionIds.size !== configured.length ||
    usedGroups.size !== groupIds.size ||
    [...usedGroups].some(id => !groupIds.has(id))
  )
    return false;
  const summaryConfig = presentation.summary;
  if (
    summaryConfig != null &&
    (!isPresentationEntry(summaryConfig, ['id', 'title', 'allowed_headings']) ||
      !isHeadings(
        summaryConfig.allowed_headings === undefined
          ? []
          : summaryConfig.allowed_headings,
      ) ||
      sectionIds.has(summaryConfig.id))
  )
    return false;
  if (
    !Array.isArray(value.sources) ||
    !Array.isArray(value.calculations) ||
    !Array.isArray(value.sections)
  )
    return false;
  const validateScope = (scope: unknown) => isPageScope(scope, page);
  if (
    !value.sources.every(item => isEvidence(item, validateScope, true)) ||
    !value.calculations.every(item =>
      isCalculation(
        item,
        validateScope,
        value.sources as unknown[],
        pagePeriodKey,
      ),
    )
  )
    return false;
  const sources = value.sources as Record<string, unknown>[];
  const calculations = value.calculations as Record<string, unknown>[];
  const sourceIds = new Set(sources.map(item => item.id));
  const calculationIds = new Set(calculations.map(item => item.id));
  if (
    sourceIds.size !== sources.length ||
    calculationIds.size !== calculations.length ||
    [...sourceIds].some(id => calculationIds.has(id))
  )
    return false;
  const references = new Set([...sourceIds, ...calculationIds]);
  if (
    value.sections.length !== configured.length ||
    !value.sections.every(
      (item, index) =>
        isPageSection(item, configured[index]) &&
        claimReferences(item).every(id => references.has(id)),
    )
  )
    return false;
  if (value.summary != null) {
    const summary = value.summary;
    if (
      !isRecord(summaryConfig) ||
      !isPageSection(summary, summaryConfig, true) ||
      !Array.isArray(summary.contributing_section_ids) ||
      !summary.contributing_section_ids.length ||
      !summary.contributing_section_ids.every(isIdentifier) ||
      new Set(summary.contributing_section_ids).size !==
        summary.contributing_section_ids.length
    )
      return false;
    const sections = value.sections as Record<string, unknown>[];
    const contributors = summary.contributing_section_ids.map(id =>
      sections.find(section => section.id === id),
    );
    if (!contributors.every(item => item && item.status === 'ready'))
      return false;
    const contributingEvidence = new Set(
      contributors.flatMap(item =>
        claimReferences(item as Record<string, unknown>),
      ),
    );
    if (
      !claimReferences(summary).every(
        id => references.has(id) && contributingEvidence.has(id),
      )
    )
      return false;
  }
  return true;
}

function isMetadata(metadata: Record<string, unknown>): boolean {
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
  return true;
}

function pagePeriodKey(value: unknown): string {
  const period = value as Record<string, unknown>;
  return JSON.stringify([
    period.label ?? null,
    period.start ?? null,
    period.end ?? null,
  ]);
}

function isCalendarDate(value: unknown): boolean {
  if (!isDate(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}
