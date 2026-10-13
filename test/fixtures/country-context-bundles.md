# Country context contract fixtures

`country-bundle-moz-context.json` (v1 country bundle) and `page-bundle-country-moz-context.json` (v2 page bundle) are exact copies of `tests/fixtures/country_context/bundles/MOZ-country-bundle.json` and `MOZ-page-bundle.json` from the Narrative Engine repository at commit `fbca520`, copied on 2026-10-13. The engine serialized them offline from its reference Mozambique snapshot, its packaged Mozambique context manifest and a mock provider. No network request or model call was made, and the prose is test output, not editorial content.

Both bundles include five `external_context` sources and one Results claim and one Overview Challenges claim with optional `context_spans`: an exact phrase of the claim text that cites one `external_context` source the claim also cites. Every other claim omits the key, as in every bundle without country context.
