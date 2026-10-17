# Systematic Boxel Survey changes — 1.0.8

## 1.0.8 — saved anchor lists, EDSM attribution and scan dates

Calculated route and string sources now persist as named anchor lists. Reopen one to select another anchor or resume an existing survey without rebuilding the source. Captured routes work even when the live route is gone. Existing multi-anchor snapshots migrate once; list removal preserves surveys. Backups include lists, including workspaces with no surveys yet.

The EDSM system-discovery commander appears in brackets on the target card, sequence row and overlay. A background traffic lookup after target copying verifies system identity and caches attribution separately from catalogue status. Bulk presence checks remain unchanged; unavailable attribution never blocks copying or alters scan/visit evidence.

Catalogue cards, sequence rows and the HUD show the latest available body-update date, separate from discovery date and query time. UTC dates before 19 May 2021 gain **(pre-Odyssey)** as a clue for further exobiology investigation, without asserting that biology is untouched. The oldest major-body date still governs age-based revisits. No overlay settings are introduced in this release.

Validation: 100 logic tests and eight isolated browser workflows, covering source migration/reuse/removal, persistence, escaped commander names, delayed attribution without clipboard blocking, identity checks, error isolation, UTC dates and the Odyssey cutoff. Attribution uses the user's live EDSM traffic response as a regression fixture. The user also tested version 1.0.8 in-game and confirmed it works on 18 October 2026.

## 1.0.7 — bulk presence and optional boxel iteration

Whole-boxel checking previously repeated Spansh lookups for each suffix and fetched EDSM body data even when another catalogue already made the system a visit candidate. It now discovers presence first with one EDSM prefix query and one relevance-ranked Spansh query for N + 10 results. It filters the full parsed boxel identity and the selected suffix range, preserving exact decimal IDs. Only systems present in every enabled catalogue proceed to body details. Personal completion, ignored visits and the visit-all policy avoid unnecessary details. Completion reuses the Spansh search metadata and its dump endpoint, without a redundant system lookup.

Spansh misses remain explicitly **Not found in boxel search**; successful EDSM misses are **absent**. Neither sets the endpoint. Malformed responses and request failures remain unresolved, successful provider results survive a failure, and stopping finishes the current request without launching the next. A detail failure retains positive presence while withholding completion. Fresh bulk results are reused during automatic target preparation; a policy change can make previously deferred details necessary. Individual explicit checks remain available. Very large Spansh request sizes beyond the tested 143 results are unverified; a server rejection remains an error rather than silently falling back to a long search loop.

The new **Move to the next boxel on arrival at the final system** checkbox is off by default and disabled for an open-ended active boxel. On a live FSDJump or CarrierJump at a defined endpoint, it selects the next included boxel and prepares/copies its target using existing settings. It does not wait for FSS, mark the old boxel complete, discard unfinished systems, infer an endpoint, or wrap at the end of the survey. The visited system keeps receiving scan evidence after the target moves. Historical replay and Location events cannot trigger automatic iteration. The preference persists through reload/backup and resets to off with defaults.

Validation: 85 logic tests and six isolated browser workflows pass. Compact fixtures from both live test boxels cover exact matching, unrelated results, enabled-provider combinations, failed requests, cancellation, deferred details and policy changes. The production bulk adapter also reproduced the 18-system live result in four requests (two presence and two completion). Automatic iteration and background copying were tested with simulated journals and the helper acknowledgment protocol, without sending game input. Existing saved survey schema and data remain compatible.


## 1.0.6 — bounded Spansh discovery

The old fallback mistook a fuzzy name search for an exact prefix search, sorted results alphabetically and scanned up to 50 pages. Unrelated names could fill all pages, producing “Spansh search is too broad to establish absence.” A short result page was also wrongly treated as proof of absence.

The fallback now makes one relevance-ranked search request for 10 results. An exact full-name match supplies the target address. Otherwise a returned system in the exact same boxel can supply a reference, after checking its mass and sequence bits against its name. Subsequent targets reuse that reference. Other sectors and inconsistent name/address pairs are rejected. This does not calculate child addresses from a parent boxel.

If no usable reference or exact match is available, the result is **No exact match in top 10**: a visit candidate, never a confirmed absence or completed system. This also covers entirely unknown boxels. Surveying remains available; an arrival supplies a journal address for later exact checks. Direct address lookups can establish catalogue absence. HTTP failures stay errors, and name search never establishes the final suffix.

Survey storage and bounds are unchanged. Reload the existing tab and retry the target; no reset is needed. Tests cover the request limit, exact tenth versus eleventh results, real same-boxel reference addresses, definitive address misses, invalid references and normal SDK compatibility. Validation: 71 model/adapter/hierarchy tests and two isolated browser workflows passed, including the visible search-miss label and enabled controls. Live service behavior still needs the user's retry.


## 1.0.5 — catalogue failures and request ordering

The user's saved results and JACoB log show Spansh response-header timeouts, HTTP 502 responses, and SDK request timeouts. The previous batch checked every Spansh target before starting EDSM, leaving the latter unchecked during prolonged failures. EDSM now runs first. An interrupted batch saves completed results and visibly pauses on a Spansh timeout or server error instead of repeating the outage for every remaining target. Explicit queued requests no longer ask the host to retry automatically, which could exceed its 30-second SDK deadline.

When a boxel already has a reference address, the adapter can substitute the sequence field locally using exact BigInt arithmetic and JACoB's documented AddressForSequence layout. This avoids expensive name searches when an older injected SDK rejects valid string addresses. Normal working SDK helpers remain preferred. Missing records and failures remain distinct; no errors are converted into absence or completion.

Validation: 66 model/adapter/hierarchy tests passed, including EDSM-before-Spansh ordering, pause after a timeout, retained results and known-address lookup without repeat name searches. The patch does not establish that the live remote services have recovered; retry a single target after reloading before requesting a whole batch.

## 1.0.4 — personal history, native clipboard helper and HUD2

The previous recovery path normally read only the latest journal. It also discarded historical body evidence when any new event started the current survey, and rejected older evidence replayed after newer events. Revisits do not necessarily regenerate a complete FSS inventory, so a fully explored system could remain only **Honked**. Recovery now backfills all available files once for each survey and merges evidence monotonically. Older arrivals cannot overwrite a newer live location.

The old belt confirmation required major-body completion and used a modal confirmation inside JACoB’s sandbox. The replacement is an explicit, undoable **Confirm full scan (including belts)** action, independent of new FSS events. The current-system button targets the live system; row buttons target their named visited system. Manual confirmation is stored separately from journal evidence. **Ignore personally visited systems** is opt-in and labelled separately in the sequence table. Personal scan evidence can now handle an old scan even when public upload data is incomplete.

Browser clipboard calls lack dependable background access. The optional native helper receives authenticated, expiring requests from the saved tab’s store and responds through its own journal-directory companion JSON file. This respects JACoB’s existing CSP and network restrictions. Requests are serialized; IDs match acknowledgments; stale requests never copy after restart; Windows failures remain visible. The helper never sends Elite input or changes foreground focus. Direct HTTP is deliberately absent from the delivered helper.

Removed a blanket focusout redraw which could replace a pressed button before its click event and erase connection details. Sensitive pairing input also suppresses incidental redraws while focused.

The transparent top line is now centered and bright green. [HUD2](https://github.com/pseudo6626/JACoB/blob/7929fe6ce3835d0edbb474bf15f563d0778eef58/docs/HUD2-SDK13.md) is detected through `overlay.info().hudVersion`; compatible hosts receive weight-600 Segoe UI, dark outline/shadow, full opacity and subtle green glow. Older hosts retain a simple green text scene. No filled panel is added. The overlay still fits its line to the available width and uses the requested labels and separators.

Validation: 65 model/adapter/hierarchy tests, five isolated browser workflows and seven helper tests passed. The final HTML was installed over the existing saved tab, preserving all three surveys. Live verification confirmed recovered personal scans, HUD2 capability and a matching helper acknowledgment after a verified native clipboard write. Arrival automation was tested using simulated journal events, without sending input to the running game. The helper is paired separately from survey backups and can be disconnected in the tab.

## 1.0.3 — transparent top-strip overlay

Replaced the upper-left panel with one yellow (`#FFD54F`) text item. There is no rectangle, background fill or border. It starts at normalized `(0.045, 0.003)`, inside the top strip marked by the user, and joins sections with ` | `. Progress labels are **Total survey** and **Current boxel survey**; both show handled/total and percentage when the denominator is known. Unknown bounds remain explicit. The next target, catalogue states and current-system status remain available.

The text defaults to a consistent 18 px. When overlay dimensions are available, the bridge measures the line and reduces its size only as needed to reserve the screen corners and keep it on one line. The [JACoB Windows renderer](https://github.com/pseudo6626/JACoB/blob/284f9cc3291a5b4c53cf14628c91b0940573ee25/internal/platform/overlay_windows.go) fixes Segoe UI and explicitly selects `nonAntialiasedQ`. Font family and smoothing are not exposed by the scene API, so smoothing would require a host change. No JACoB core files are changed.

The existing adapter suite passes, including the updated outside-scope overlay check. This visual change does not change survey policy, progress or storage format.

## Comparison with the developer's supplied file

Compared the original generated HTML (SHA-256 `E3F3AFC45EB14508F267844FBFAE7ACBD70E3CFD4A01EA943265195F32F544C8`) with `Systematic-Boxel-Survey-fixed.html` supplied by the user (SHA-256 `CCA1A50C83268E46A7F9B897ACD6B834746318FBC3C0B92B8AE841676F55BEC0`). All supplied changes are preserved in the readable source and rebuilt HTML.

The developer changed five related places:

- `recordAt` rejects null/invalid indices as a normal lookup miss before calling `boxAt`.
- The overlay checks the location pointer and can display an outside-scope location.
- The dashboard separates in-scope and outside-scope locations.
- The dashboard renders “Outside selected survey scope” for the latter.
- Belt confirmation requires a valid, in-scope record.

The original extension already represented an outside-scope journal location with `{i:null, seq:null, outside:true}`. Its dashboard nevertheless passed those null indices into `recordAt`, which called the strict `boxAt` function and threw “Invalid boxel index.” Recovering a journal outside the survey could therefore abort rendering and prevent target preparation/catalogue checks. This was a bug in the extension, unrelated to the earlier named-sector issue. The developer's patch did not change the catalogue adapters or hierarchy calculations.

## Observed cause of the Spansh failure

The live browser's injected SDK contained this validator:

```js
if (!/^d+$/.test(s))
  throw Object.assign(new Error('id64 must be an unsigned decimal integer string'),
                      {code:'BAD_PARAMS'});
```

It tests for the letter `d`, not digits. The corresponding `internal/webui/assets/app.js` constructs the SDK inside a JavaScript template literal. A single backslash in the source regex is consumed when that template is evaluated. Both `Elite.catalog.system.get` and `Elite.galaxy.addressForSequence` call this shared validator. Correct decimal-string addresses are rejected before a network request reaches Spansh. EDSM uses `Elite.net.fetchQueued` directly and does not pass through this validator, explaining why EDSM continued working.

The host footer reported Alpha 0.2.13 / SDK 10, but the injected SDK did expose these newer helpers. The actual injected function, rather than that footer label, established this diagnosis.

Suggested upstream correction: use `/^[0-9]+$/` in the template, or double-escape the backslash so the injected result contains the intended digit regex. Test the generated SDK, not only the template's source text. This package does not modify JACoB's host files.

## Extension compatibility fix

- Retain the normal SDK paths on working hosts.
- Detect only the exact `BAD_PARAMS` validator rejection of a valid decimal uint64.
- After detecting it, retrieve Spansh records through the existing `Elite.net.fetchQueued` fallback. If a subsequent target has no known address, resolve its exact name through Spansh instead of the broken sequence helper.
- Keep IDs as exact decimal strings, including values above JavaScript's safe-integer limit. Converting to `Number` to dodge validation could silently change the system address.
- Preserve permission, HTTP and other errors as unresolved checks. A failure never becomes a false absence or a completed system.
- Retry old error records through the normal check controls; no survey schema change or progress reset is needed.

## Regression verification

Five new tests failed against the original code, reproducing the journal-index exception and the broken Spansh paths. With the fixes and reset feature, all 58 model/adapter tests and two hierarchy fixture tests pass. Additional tests cover working helpers, permission failures and retry after HTTP failure. Four browser workflows pass, including outside-scope journal recovery/entry/exit/reload, existing policy and persistence checks, and reset/restore.

Live verification on 2026-10-12: updated the existing saved tab in place and reloaded Chrome/JACoB. Automatic target preparation successfully checked suffixes 0–3 of `Pyurks LY-F d12`, passing over the first three complete entries. “Check entire boxel” then refreshed suffixes 0–39. Both sequence pages showed Spansh **present** for every system and no provider error entries. EDSM remained absent at suffixes 10 and 24. The final dashboard showed **12/40 handled**, **28 requiring attention**, and current target **Pyurks LY-F d12-3**, whose belts remain unverified in both catalogues. Existing scope/bounds were retained. The reset button was verified in isolated tests; the user's real survey was not reset.

## Reset tab to defaults

The new header button confirms that all surveys, bounds, progress, journal checkpoints and options in this tab will be cleared. Before replacement it initiates a uniquely named JSON download containing both the visible workspace and the exact saved manifest/chunks. A backup-creation error cancels the reset. Storage replacement is atomic, keeps the revision increasing to protect against stale browser views, and touches only the extension's survey keys. A write failure preserves the previous saved survey. No host settings, journal files or other tabs are reset.

The regular Import backup control understands these recovery files. Reset is also available after a corrupt-storage load failure; original raw chunks are included for diagnosis/recovery and the view reloads to reconnect host subscriptions. Tests cover cancellation, failed export, failed write, corrupted storage, scope isolation and restoration of bounds, cursor and journal evidence.

The named-sector overlap limitation remains separate and unchanged; see `HIERARCHY-ISSUE.md`.
