// Malformed context_spans shared by the v1 and v2 contract tests.
const contextSpanMutations = [
  ['missing text', span => delete span.text],
  ['empty text', span => (span.text = '')],
  ['blank text', span => (span.text = '   ')],
  ['non-string text', span => (span.text = 123)],
  ['text not in claim', span => (span.text = 'Text absent from the claim')],
  ['extra keys', span => (span.extra = true)],
  ['missing evidence ids', span => delete span.evidence_ids],
  ['empty evidence ids', span => (span.evidence_ids = [])],
  ['string evidence ids', span => (span.evidence_ids = span.evidence_ids[0])],
  ['non-string id', span => (span.evidence_ids = [123])],
  [
    'duplicate ids',
    span => (span.evidence_ids = [span.evidence_ids[0], span.evidence_ids[0]]),
  ],
  [
    'id not cited by the claim',
    (span, claim, data) =>
      (span.evidence_ids = [
        data.sources.find(
          source =>
            source.kind === 'external_context' &&
            !claim.evidence_ids.includes(source.id),
        ).id,
      ]),
  ],
  [
    'id of a non-context source',
    (span, claim, data) =>
      (span.evidence_ids = [
        claim.evidence_ids.find(
          id =>
            data.sources.find(source => source.id === id).kind !==
            'external_context',
        ),
      ]),
  ],
  ['unknown id', span => (span.evidence_ids = ['context.moz.unknown'])],
  ['non-object span', (_span, claim) => (claim.context_spans = ['text'])],
  [
    'non-array value',
    (_span, claim) => (claim.context_spans = claim.context_spans[0]),
  ],
  ['null value', (_span, claim) => (claim.context_spans = null)],
  ['empty array', (_span, claim) => (claim.context_spans = [])],
];

const contextClaim = data =>
  data.sections
    .flatMap(section => section.claims)
    .find(claim => claim.context_spans);

module.exports = {contextClaim, contextSpanMutations};
