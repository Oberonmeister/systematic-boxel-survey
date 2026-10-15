# Systematic Boxel Survey for JACoB

Import **Systematic-Boxel-Survey.html** (version **1.0.7**) as a separate saved JACoB tab. It does not replace BOXEL Explorer or change JACoB’s core. Spansh checks use a known exact address where available; otherwise they inspect the top 10 name-search results. A search miss is labelled **No exact match in top 10**, remains a visit candidate, and does not prove catalogue absence. A known system in that same boxel can supply an address reference. No reference is required to continue surveying. See **FIXES.md** for catalogue timeout handling, the developer's journal fix, Spansh compatibility, reset recovery, personal history, clipboard helper and the green HUD2 overlay.

**Check entire boxel** now makes one EDSM prefix request and one Spansh search for the number of systems plus ten (or only the enabled provider). Results are filtered by exact boxel and suffix. Spansh search misses are labelled **Not found in boxel search**, remain visit candidates, and are not proof of absence. Body details are requested only for matches in every enabled catalogue, excluding systems already handled by personal evidence, the ignore-visited policy, or the visit-every-system policy. Provider errors remain unresolved. **Check target** and **Check next 25** retain individual checks.

Catalogue batches check EDSM first. A Spansh timeout or server error pauses the batch and preserves completed results. Retry **Check target** before running another batch. Once a boxel address is known, sequence addresses can be calculated exactly without repeated name searches, including on older hosts with the broken string-ID validator. This improves failure handling; it cannot repair an unavailable remote service.

**Confirmed limitation: named-sector overlaps are not handled correctly.** For `Pyurks FS-H d11`, the eight physical C children contain systems named under `NGC 2244 Sector`; the tab generates unresolved Pyurks labels. Copying, catalogue matching and journal attribution can therefore be wrong in overlap areas. See **HIERARCHY-ISSUE.md** for eight independently verified examples and the required correction. This investigation has not yet changed the production HTML.

## Install

1. Use JACoB with **SDK 11 or later** (the SDK 11 utilities are documented for the 0.2.14 generation and later).
2. Open **Tab Manager**, upload the HTML, preview it, and **save it** as “Systematic Boxel Survey”. A preview does not have persistent tab storage.
3. Allow JACoB’s Network permission when you want EDSM/Spansh checks. Overlay and game-control permissions are only relevant to the optional features.
4. Ensure JACoB detects your actual Elite journal directory. This matters for a non-default journal location: the extension uses JACoB’s journal service and cannot independently browse for journals.

Open the HTML directly in a browser for an offline UI preview. That preview has no game, catalogue or JACoB persistence connection.

## Normal workflow

- Enter one procedural system, paste a list/string, or use the current GalMap route. Choose the anchor mass (D by default).
- The anchor list preserves first occurrence. Choose the boxel you want to survey. A single higher-mass source is rejected with an explanation; higher-mass entries in a list or route are omitted and reported. Authored/unsupported source names are also reported, never guessed into a boxel.
- Select layers. D + C includes exactly one D sequence and its eight nested C sequences. Copy starting names beside the selection. Optional parents add only their own sequence.
- Copy each prefix into GalMap and enter the final suffix, or leave it unknown. Suffix 47 means 48 systems, numbered 0–47. A full final name is also accepted if it matches the boxel.
- Targets advance sequentially. Every enabled catalogue is checked when a target is prepared; sufficiently complete entries are passed over. The next required target is copied automatically when enabled. **Copy Target** repeats the copy on demand. Install the included local helper for copying while Elite has focus.
- **Previous/Next** leave passed-over unfinished systems outstanding. **Iterate Boxel** moves to the next included boxel, including when the current endpoint remains unknown. It does not establish completion or discover an endpoint.
- **Move to the next boxel on arrival at the final system** is optional and off by default. It requires a defined final suffix; the control is disabled for an open-ended active boxel. A live ship or carrier jump to that endpoint moves to the next included boxel, resuming its saved cursor and using the normal target preparation and clipboard flow. Earlier unfinished systems remain outstanding. Historical replay and login location events never trigger it, and the last included boxel does not wrap.
- Arrival prepares the next target. Journal scans continue updating the system you are actually in. Completing FSS is separate from changing targets.
- Use **Check next 25** or **Check entire boxel** for an overview ahead of time. The latter requires a supplied final suffix. Missing records and request failures never establish an endpoint.
- Add final bounds later through **Edit final bounds**. Overall percentages appear only when every included boxel has a bound; a bounded active boxel can have its own percentage in a mixed survey.

## Completion and belts

“Handled” means a complete personal scan (including belts), an explicit manual full-scan confirmation, a visit excluded by the optional **Ignore personally visited systems** policy, or sufficiently complete data in **all** enabled catalogues. Personal completion now includes older journals and survives revisits. The ignore-visited policy is off by default; its rows are labelled **Ignored by policy · personally visited**, not falsely described as fully scanned. The separate **Personal record** column distinguishes previous visits, honks, partial scans and full scans. “No visit recorded” means no evidence was found in the available journals; missing or deleted journals cannot be recovered by the tab.

Local belt tracking compares belt names in stellar scan metadata with belt-cluster scan records. Barycentres do not count as stars or planets. An FSS completion event without enough inventory data does not silently certify the belts. Use **Confirm full scan (including belts)** in the current-system panel after checking all bodies and any belts in-game. It works even when the only new event is a honk. Previously visited rows also have **Confirm full scan**. Every manual confirmation is timestamped, explicitly labelled and undoable; it does not manufacture journal Scan or FSS events. The current-system action applies to the system you are in, independently of the next target.

Public catalogue body inventories can include belt metadata without evidence that those belts have been resolved. Such systems remain **“Major bodies complete; belts unverified”**. This is intentional under the requested belt-inclusive policy; it can produce more revisit targets than a major-bodies-only survey tool.

Age-based revisits are off by default. If enabled, the adapter uses the oldest dated major-body record; missing dates remain uncertain. Catalogue refreshes can still be affected by provider/core caches.

## Persistence and optional features

- Source routes are snapshotted. Replotting GalMap never changes an existing survey’s scope.
- Multiple surveys, bounds, cursors, provider evidence, journal checkpoints and outstanding systems are stored in the saved tab’s `Elite.store` namespace.
- Writes use atomic batches, with a revision check to protect against another open window overwriting newer state. A failed save is visible and does not discard the previous snapshot. Export your unsaved work before reloading after a conflict.
- Storage requests respect JACoB’s mutation rate limit. Successful saves release their write lock in the same atomic batch; repeated option changes cannot leave a lock behind. A successful retry clears its previous save warning.
- JACoB currently limits a tab’s state to 2 MiB. Sequences and descendant boxels are generated lazily; saved evidence is losslessly gzip-compressed using the browser’s built-in compression support. Capacity errors stop catalogue work and ask you to export/archive a finished survey; no old records are silently removed.
- **Export backup** regularly. To update this extension, edit the same saved tab so its storage namespace survives. Deleting the tab deletes its host-managed state.
- **Reset tab to defaults** starts a recovery-backup download, then atomically clears this tab's surveys, bounds, progress, journal checkpoints and options after confirmation. It leaves JACoB settings, original journal files and other tabs alone. Use **Import backup** to undo a reset. If storage is damaged, the backup retains its raw contents for recovery; reset remains available on the load-error screen. Failed backup creation or storage replacement keeps the previous saved survey intact.
- The first load of an existing survey in 1.0.4, and each newly created survey, recovers all available journals automatically. Later reopening resumes from checkpoints. **Recover all journal history** can repeat the backfill. Recovery merges older scans without erasing newer evidence or moving the live location backwards.
- A journal location outside the selected survey is displayed normally and does not stop catalogue checks. It adds no progress to the survey.
- On JACoB builds with a broken string-ID validator, Spansh checks fall back to the same public API through `Elite.net.fetchQueued`. IDs remain exact decimal strings; other errors remain unresolved. Use **Check entire boxel** to refresh errors saved by an earlier version.
- The optional overlay is a single **green** (`#65FF9A`) line centered at the top. It has no background or border. Sections use ` | ` and retain **Total survey** and **Current boxel survey**. On HUD2 (SDK13), it uses smooth Segoe UI text, weight 600, a 1.5 px dark outline, a small shadow and restrained glow. Full text opacity plus the dark edge improves contrast against bright stars. Older hosts receive a centered green line without unsupported effects. Size defaults to 18 px and shrinks to fit; the controls show which rendering path is active.
- Optional automatic GalMap plotting is adapted from JACoB’s route-queue example. It is off by default and disarmed on reload/import. It depends on the game’s map layout and bindings; success requires a new route ending at the requested target. A failure disarms it. **This routine has not been tested against the user’s running game.** Clipboard navigation is the tested default.

## Clipboard helper

The optional Windows helper is included in `clipboard-helper/`. It uses Python 3 with no extra packages and runs quietly, without switching focus or sending game inputs. See that folder’s **README.md** for installation and removal.

JACoB blocks direct network access from saved tabs, so the helper uses the supported `Elite.store` and `Elite.data` interfaces: requests are saved in this tab’s namespace, and a small `SurveyClipboardStatus.json` acknowledgment file lives beside the journals. The helper reads JACoB’s state file but never writes it; it never edits game journals, contacts the internet or opens a listening port. It writes only its own companion/status files and the clipboard. The tab displays **Copied** only after receiving the matching successful acknowledgment. Connection settings are separate from survey backups.

## Validation

Version 1.0.7 passes six isolated browser workflows, including the whole-boxel button, automatic bounded iteration, clipboard preparation, late FSS attribution, open-ended behavior, history replay, reset and persistence. The implemented bulk adapter was also tested against live services for `Phroea Phio UK-W c18` (0–17): four requests found EDSM suffix 13, Spansh suffixes 3/13/14, and classified 13 complete in both, matching the prior results. The 133-system `Col 107 Sector HI-I d10` live discovery response is retained as a compact public-data regression fixture. Automatic iteration was verified with simulated journal events; no game inputs were sent.

- 85 model/adapter/hierarchy/bulk tests cover hierarchy, order, bounds, absence/error handling, belt-inclusive completion, historical evidence, journal checkpoints, compressed atomic persistence, save failure, JACoB’s save rate limit, abandoned locks and conflicting browser views, outside-scope locations, Spansh fallback under the faulty SDK validator without ID rounding, and atomic reset/backup/error recovery.
- Headless browser checks exercise the wizard, D+8C rows, mixed bounds, clipboard-first controls, catalogue calls, arrival advancement, persistence and narrow layouts, including outside-scope journal history, live events and reload. The simulated host sends no real game input.
- A browser regression check repeats source/layer option changes against a host simulator that enforces JACoB’s 50 ms mutation gap, verifies persisted choices, and checks recovery after a failed save.
- A fourth browser check verifies reset cancellation, failed-backup protection, restored defaults, the recovery download, and importing that backup to recover bounds, the selected target and progress.
- Two independent numeric-address fixture tests verify the actual Pyurks anchor and all eight C grids while explicitly documenting their different NGC 2244 names. These tests expose the unsupported naming case; they do not claim it is fixed.
- Live read-only checks against EDSM and Spansh validated response shapes using Sol/Achenar and ran the adapters on `Synuefe EN-H d11-96`. Both catalogues returned 34 major bodies and two belt groups; the extension retained the belt uncertainty correctly.
- Version 1.0.2 was installed in the existing saved tab and verified in the user's Chrome/JACoB session on 2026-10-12. Refreshing all 40 systems of `Pyurks LY-F d12` returned Spansh presence for every system, with no remaining check errors. The dashboard showed 12/40 handled and 28 requiring attention under the existing policy; suffixes 10 and 24 remained absent from EDSM. The current target stayed at suffix 3 because both providers reported unresolved belts.
- Version 1.0.4 adds a fifth isolated browser workflow covering full historical recovery, current-system confirmation and undo, ignore-visited classification, automatic copying after arrival, visible clipboard failures, checkpoint reload and HUD2 styling. Seven helper tests cover authentication, the selected tab, expired requests, duplicate requests/restarts, invalid text, native failures and partial state files. Actual in-game HUD appearance and optional plotting still require the user’s acceptance run.
- Final 1.0.4 validation: 65 model/adapter/hierarchy tests, all five browser workflows and seven helper tests passed. The installed tab retained all three surveys and recovered personal scan history. The original Pyurks survey displays complete personal scans independently of incomplete Spansh records. The live host reports HUD2, and the paired helper returned a matching success acknowledgment after writing and reading back the requested target in the native Windows clipboard. Automatic arrival copying was exercised with simulated journal events; no live game input was sent.

## Source and tests

The `source/` directory contains the readable modules, HTML template, build script and tests. There are no external script dependencies in the importable HTML.

```text
node source/build.cjs
node --test source/model.test.cjs source/bridge.test.cjs
node --test source/hierarchy.test.cjs source/bulk.test.cjs
```

For the optional browser tests, install Playwright in your development environment, make it resolvable by Node, and run `npm run test:browser` (all six workflows). `CHROME_PATH` can select an installed browser; `SURVEY_SCREENSHOT_DIR` controls optional screenshots.

See **DESIGN.md** for the reuse audit and state/data flow. Upstream source inspected: [pseudo6626/JACoB, commit 284f9cc](https://github.com/pseudo6626/JACoB/tree/284f9cc3291a5b4c53cf14628c91b0940573ee25).
