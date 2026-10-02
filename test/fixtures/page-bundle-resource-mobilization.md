# Resource Mobilization v2 contract fixture

`page-bundle-resource-mobilization.json` is the exact NE `PageBundle.model_dump(mode="json")` artifact from Phase 7 B28, copied from `data/evaluation/phase7/milestone-b/B28-offline-bundle.json` on 2026-10-01. It contains synthetic offline prose over verified raw Global Fund source data, not live model editorial output. The source capture, adapter calculation checks and provenance are documented by B28 in the Narrative Engine repository.

The bundle includes both profile sections, all five calculation records and their raw operands, actual page scopes and public presentation. Keeping the complete small serialized contract prevents middleware tests from substituting a country-shaped payload or silently changing calculation references. No provider or source network access is needed by these tests.
