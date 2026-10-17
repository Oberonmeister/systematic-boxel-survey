# Implementation and reuse audit

This plan was established before implementation, then updated here to describe the delivered code. It applies the user’s final clarifications: numerical order, clipboard-first navigation, optional plotting, Iterate Boxel = next boxel, belt-inclusive completion, no Skip button, and omission of higher-mass source entries from lists.

**Known design gap discovered during user testing:** physical boxel identity is conflated with the naming region. The current child generator carries the anchor’s sector label into descendants, which fails at named-sector overlaps. All eight C grids of `Pyurks FS-H d11` have independently verified NGC 2244 catalogue examples. See **HIERARCHY-ISSUE.md** and `source/hierarchy.catalogue-fixture.json`. The production extension has not yet been corrected for this case.

## Reuse unchanged through JACoB’s SDK

| Existing service | Extension use |
| --- | --- |
| `Elite.data.get/subscribe('navRoute')` | Source route availability and a copied snapshot; no live scope mutation |
| `Elite.journal.files/read/subscribe` | Historical recovery and live events; no new journal watcher or path selector |
| `Elite.store.get/batch/update` | Segmented JSON persistence, atomic commit, short write lease and revision conflict detection |
| `Elite.net.fetchQueued` | Public HTTP requests through JACoB’s existing network restrictions and pacing |
| `Elite.catalog.system.get` | Spansh record lookup when a verified/predicted sequence ID64 is available |
| `Elite.galaxy.addressForSequence` | Preserve boxel address bits and substitute the sequence using decimal-string IDs |
| `Elite.overlay.info/set/clear` | Centered transparent green top-strip scene; HUD2 text effects when available |
| `Elite.bindings.press`, `Elite.input.text`, `Elite.system.health` | Optional plotting only; no game input in ordinary clipboard mode |
| `Elite.files.json` | User-triggered backup exports |

Inspected implementations: `internal/galaxy/galaxy.go`, `internal/catalog/catalog.go`, `internal/journal/watcher.go`, `internal/tabstate/store.go`, the injected SDK in `internal/webui/assets/app.js`, the custom-tab reference and SDK 11 additions.

Version 1.0.2 detects the installed SDK's exact `BAD_PARAMS` rejection of a valid decimal uint64. That build loses the digit-regex backslash while constructing the injected SDK. For the remainder of the bridge session, sequence discovery falls back to exact name lookup and record retrieval uses the existing queued HTTP fallback. Working SDK helpers retain their normal path. No float conversion, host modification, permission bypass or fallback on unrelated errors is used. See **FIXES.md**.

The SDK exposes address geometry but does not expose an API for enumerating all *named* descendant boxels from a procedural name. It therefore cannot replace the name-only hierarchy adapter below.

## Adapted existing code

- `examples/BOXEL-surveyer.html`: procedural-name parsing, sequence-name formatting, base-26 boxel lettering, and the child order `x + 2*y + 4*z`. The new pure model applies the same numbering within the source sector; it derives parent addresses and descendant names without inventing stellar coordinates.
- Its textarea clipboard fallback remains available for explicit copying. The optional local helper uses a tab-scoped store request and companion-file acknowledgment for background operation; direct browser networking remains blocked.
- `examples/system-route-queue-tab.html` and BOXEL’s plot routine: the optional GalMap binding sequence. The adapter adds cancellation and requires a fresh NavRoute final-destination match before reporting success.
- Provider normalization and lookup patterns from BOXEL are adapted, while candidate ranking, speculative profitability, session rejection lists and nearby-system suggestions are omitted.
- EDSM batch presence lookup and body-detail normalization are new. Spansh name discovery inspects one relevance-ranked page of 10 results. Exact names confirm identity; a valid same-boxel sibling supplies address bits for a direct target lookup. Search misses remain uncertain visit candidates. There is no paginated search for absence.

## New components

`model.js` contains deterministic hierarchy/scope calculations, lazy sequence generation, bounds, classification, journal reduction and survey statistics. `bridge.js` contains SDK, persistence, catalogue, clipboard and optional plotting adapters. `ui.js` contains the four-stage wizard and dashboard. `build.cjs` embeds all three into one standalone custom-tab HTML.

### Data flow

1. Single name, pasted list or current route → ordered normalized source snapshot.
2. Reject a higher-mass single source; omit and report higher-mass list entries and unsupported names.
3. Derive each source’s enclosing anchor → deduplicate by boxel identity while retaining first-occurrence order and route metadata.
4. Select one anchor → independently select descendant classes and optional parent sequences.
5. Review the actual boxel rows in pages → exclusions and optional final suffixes.
6. Activate the survey → resolve the current sequential target against every enabled catalogue → pass over sufficiently complete records → copy the next required target.
7. Journal arrival advances the target; scans update their own system record regardless of the selected target.
8. Dashboard and overlay derive statistics from the same model; persistence saves model and evidence together.

### State

The workspace contains multiple surveys and one active ID. Each survey retains the original source snapshot, all ordered anchors, selected anchor, descendant classes, explicit parent sequences, excluded boxel indices, policy and live-system pointer. A sparse `boxes` map holds optional inclusive final bounds, per-boxel cursor, a reference system ID64 and sparse per-suffix records.

A record separates provider evidence from journal evidence. Provider evidence contains presence/error state, expected count when supplied, returned major-body count, belt information, record/check timestamps and completeness classification. Journal evidence contains visited/honk/FSS state, deduplicated body identities, expected/resolved belts, visit timestamps and whether the evidence was obtained during this survey. Explicit manual completion is a separate record-level field.

An outside-scope journal location has null boxel/sequence indices. Record lookups treat these as a normal miss; the dashboard and overlay display the outside location without indexing it or offering belt confirmation. This incorporates the JACoB developer's supplied fix.

Boxel and system names are generated deterministically from the selected scope and numeric indices. A bounded range represents the entire sequence without storing millions of repeated name strings. An open-ended range has no invented endpoint.

### Completion rules

- Local major-body completion plus resolved belts from any available personal journal is handled immediately, independent of catalogue upload delay. Replaying older journals merges evidence; revisits do not reset scans.
- Manual full-scan confirmation is a separate timestamped record with undo. It never creates synthetic Scan/FSS events.
- The optional ignore-visited policy handles recorded personal visits without claiming a full scan. Personal history is visible independently of catalogue quality.
- Otherwise, any enabled provider reporting absence requires attention. Errors and uncertain completeness remain unresolved.
- Catalogue-only completion requires sufficient body information, belt evidence where belts exist, compatible expected body counts, and the optional age policy.
- Barycentres, duplicate rows and basic/identity-only data do not inflate the scan count. Returned array length is never used as an invented expected denominator.
- Manual navigation does not complete a target. Moving to another boxel does not complete the previous one.
- Per-boxel percentages require that boxel’s final suffix. Overall percentages require every included boxel’s final suffix.

### Persistence

The serialized workspace is losslessly gzip-compressed with the browser’s native CompressionStream, base64-encoded and divided into bounded chunks. A single `Elite.store.batch` writes the chunks and manifest and removes surplus chunks. A short `Elite.store.update` lease protects concurrent writers; the manifest revision rejects stale views. Storage mutations are serialized and spaced by at least 75 ms to respect the host’s 50 ms per-method limiter, with bounded retries only for explicit `RATE_LIMITED` rejections. Successful commits clear the lease in the same atomic batch. Failed commits attempt owner-checked cleanup without masking the original failure, and the same view can reclaim its own lease on retry. This fixes the initial release’s rejected immediate cleanup request, which left a lease that subsequent clicks mistook for another writer. The host’s 2 MiB tab quota is respected through visible capacity failures, not silent pruning. Journal checkpoints and reduced records are persisted together. Older plain-JSON snapshots are also accepted by the loader.

## Scope and remaining operational validation

Reset uses the same paced storage queue and ownership lease. It snapshots raw manifest/chunks, initiates a recovery download including the current workspace, then replaces only survey keys in a single batch with empty defaults and an increased revision. Storage corruption does not prevent the reset path. The UI prevents reset during catalogue work, history replay or plotting and disarms plotting on reset/import. It never clears the host's general settings or journal files.

This is a separate HTML extension. It changes no JACoB core files, journal-directory configuration, EDMC setup or existing saved tabs. It does not transmit exploration uploads; EDMC remains responsible for feeding the services you use.

Named-source systems without a usable procedural name are listed as unsupported rather than geometrically guessed. Renamed target systems can be followed by a verified address/alias. Public data does not prove in-game first-discovery attribution or complete belt resolution.

Automated and live-catalogue checks are documented in README. Native overlay appearance, real journal streaming through the installed JACoB instance and optional GalMap input have not been exercised against the running game.

## Whole-boxel discovery and arrival iteration (1.0.7)

`checkBoxel` requires a user-defined final suffix and performs presence discovery before details. EDSM uses its documented prefix query; Spansh requests N + 10 relevance-ranked results. Exact parsed names and range checks discard unrelated rows. Only positive matches in all enabled catalogues can need completion details; local policy may eliminate those too. Search misses retain their uncertainty. Failures never fabricate absence; stop and policy changes prevent subsequent requests. Individual checks retain the prior exact-address/name behavior.

`advanceOnArrival` keeps navigation separate from survey completion. The optional transition requires a live arrival at the defined final suffix of the active boxel, skips excluded boxels and never wraps. The UI excludes historical replay and Location events, keeps copying through the existing helper, and lets journal evidence continue updating the visited system.


## Saved sources and catalogue context (1.0.8)

`anchorLists` stores named immutable copies of source names, derived anchors and ignored entries. Order follows the first occurrence; equality uses source type, normalized names, anchor mass and ordered keys, ignoring route capture timestamps and coordinates. Surveys link by `anchorListId` while retaining their own scope snapshots. A one-time `anchorListsVersion` migration recovers existing source snapshots; deleting a list never deletes surveys or recreates the list on the next reload. Schema 1 backups remain compatible, with validation of optional saved-list entries.

EDSM `api-system-v1/traffic` supplies system discovery attribution. It is fetched only for the selected known EDSM target, asynchronously after clipboard preparation, through the existing queued network adapter. `edsmDiscovery` is persisted independently of catalogue status so refreshes retain it. Identity is verified against name and known ID64, concurrent calls share a request, abandoned targets discard late responses, and missing attribution and errors are cached for a day and a minute respectively. Successful named attribution is retained. Failures do not alter catalogue state or journal evidence.

`latestBodyUpdate` is the maximum available returned body timestamp for display. `updated` remains the oldest major-body timestamp used by stale-data policy and requires all major-body dates. Naive EDSM timestamps are interpreted as UTC. Only the body-update display date is marked pre-Odyssey before 2021-05-19; discovery dates and request times cannot create this marker. Neither this date nor the marker certifies the last visit or untouched biology.
