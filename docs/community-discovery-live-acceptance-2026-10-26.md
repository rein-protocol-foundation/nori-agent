# Discord production catalog acceptance — 2026-10-26

Nori was tested through real Discord messages from two QA bots in the existing QA channel,
using the configured language model and the deployed Foundation production API. Evidence was
checked against the native OpenClaw tool transcript and the actual Discord replies.

## Issues repaired locally

- The running operations plugin had failed registration because its backend environment was
  missing. The launcher now loads the configured backend settings.
- The native Discord tool allowlist exposed web tools but omitted the four catalog tools and
  identity binding tools. The approved Discord configuration now includes those tools.
- The separate production Discord profile initially lacked the existing model API key because
  it used a different state directory. Its launcher now loads that specific model key from the
  existing local credential file. The first Bot request exposed this failure; the rerun succeeded.
- Discovery instructions now treat missing tools as a failed lookup, prohibit web/history
  fallback, distinguish permission failure from an empty catalog, and avoid inferring availability
  in an unqueried event format. Catalog calls run sequentially; the initial parallel event lookups
  produced one unavailable result, while the sequential rerun completed without that failure.
- Binding guidance distinguishes website email verification from the final platform binding code.

The production Discord profile uses a dedicated caller with catalog-read and identity scopes.
Slack retains its existing development profile. No production governance scope was granted.

The backend environment loader is delivered separately in
[Agent PR #13](https://github.com/rein-protocol-foundation/nori-agent/pull/13). This follow-up records the
acceptance and updates discovery guidance only. Channel allowlists, the dedicated caller and
the separate profile's model-key loading remain local deployment configuration; merging these
documents does not install or activate that configuration.

## Final live cases

| Case | Actual tool/result | Discord response |
| --- | --- | --- |
| Linked QA member asks for two English beginner Agent courses | `rein_resources_search`: `found`, `source=foundation_catalog`, `environment=prod` | Recommends records and canonical links returned by the production catalog |
| Follow-up asks for the Microsoft course's details | `rein_resource_get`: `found`, production source | Returns the recorded URL, access notes and requirements |
| Requests upcoming in-person and hybrid events | Two sequential `rein_events_search` calls: `empty` | Reports the queried scope is empty without asserting online events exist |
| Requests a nonexistent event ID | `rein_event_get`: `not_found` | Reports no accessible detail and invents no event |
| Unlinked QA bot requests the same courses | `rein_resources_search`: failed, `community_member_required`; binding/status tools also exercised | Explicitly reports failure and provides the real verification flow; no prior course results reused |
| Catalog tools temporarily removed from the QA channel allowlist | Invocation/discovery cannot find the catalog tools | Explicitly reports the unavailable connection; no web search or old recommendations substituted |
| Previously successful QA member's link is revoked, then queried again in the same conversation | Fresh `rein_resources_search`: failed, `community_member_required` | Refuses the lookup and does not reuse its earlier successful results |

All seven final cases passed. None invoked `web_search` or `web_fetch`. All four catalog tools were
exercised through the real model and Discord transport. Empty event results are not evidence of a
real upcoming event; no event records were fabricated for this run.

## Scope and cleanup

The successful account used one temporary QA contact and a time-limited verified QA platform link.
It had no Contributor or Board role. This tests the membership gate, not end-to-end email ownership
verification. During these QA cases, no human account was granted membership or altered, and published catalog data was
read only. The production catalog already contained the Microsoft and Hugging Face courses.

The temporary QA contact, link, binding sessions and ingress assertions were removed, with zero
remaining fixture rows verified. Twenty exact test messages were deleted. Normal channel settings
were restored, Bot-to-Bot admission disabled again, and the production Discord gateway restarted.
The dedicated production caller remains configured for the requested ongoing testing. Private
credentials, native transcripts, session links and detailed evidence remain in ignored local storage.

An ordinary Discord user still needs their own valid production Community Member link. These QA
tests do not substitute for that verification or establish native channel session privacy.
