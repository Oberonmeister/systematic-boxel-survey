# Systematic Boxel Survey

A [JACoB](https://github.com/pseudo6626/JACoB) extension for systematic exploration in **Elite Dangerous**. Choose a survey volume and its mass classes, check public catalogues, and work through procedural system sequences with persistent progress.

**Current version: 1.0.8.** Import the ready-made HTML tab; no build is required to use it.

## What it does

- Plans a D-mass sequence and its eight nested C boxels, or other selected mass layers, from one system, a list, or a current route.
- Saves named anchor lists from routes or pasted system strings, so each anchor can become a separate survey without rebuilding the source.
- Shows EDSM system-discovery commanders in brackets, reported body-update dates and a pre-Odyssey date marker.
- Checks EDSM and Spansh. Whole-boxel checks discover presence in bulk, then request scan details only where they can affect the visit decision.
- Tracks personal visits and scans from journals, supports explicit full-scan confirmation, and can exclude previously visited systems by policy.
- Prepares sequential targets and copies them automatically with the optional Windows clipboard helper, including while the game has focus.
- Keeps next-target navigation separate from scanning the system you are currently visiting.
- Provides a transparent green progress overlay, persistent surveys, and export/import backups.
- Can move to the next included boxel on arrival at a user-defined final system. Unfinished systems remain outstanding.

## Download and install

1. Download this repository with **Code → Download ZIP**, then extract it.
2. Use JACoB with SDK 11 or later. HUD2 styling uses the newer SDK 13 overlay support when available.
3. In JACoB's **Tab Manager**, choose **Upload HTML** and select [Systematic-Boxel-Survey.html](Systematic-Boxel-Survey.html). Preview, then **Save tab**.
4. Check that JACoB is reading your actual Elite journal directory and enable its Network permission for catalogue checks.
5. For background automatic copying, follow the [clipboard helper instructions](clipboard-helper/README.md). The helper requires Windows and Python 3; it sends no game inputs.

When updating, replace the HTML in the **same saved tab** to retain its stored surveys. Export a backup first. A standalone browser preview has no live game connection or JACoB persistence.

## First survey

Enter a procedural system name, choose the anchor mass, and select the populations to include. D + C selects one D sequence and eight C sequences. Supply each final suffix if known: **39 means 40 systems, numbered 0–39**. Leave unknown bounds empty.

Use **Check entire boxel** for a bounded sequence, copy the target, and plot the route in-game. Arrival prepares the next target while scans continue updating the visited system. Continue FSS and any required belt scans. Use **Iterate Boxel** to move manually, or enable automatic iteration for defined endpoints.

**Saved anchor lists** keeps calculated routes and system strings automatically. Use **Return to anchor list** to choose the next anchor, or reopen an existing survey from its row. Lists can be named and are included in backups.

The extension reads catalogue and journal evidence. Continue using your usual uploader, such as EDMC, to submit exploration data.

## Understand the results

**Handled** is a result of your survey policy; it is not always a new personal full scan. The separate personal-record column preserves that distinction. Missing history means no visit was found in the available journals. Manual navigation never marks a system complete.

Spansh name searches are relevance-limited: a search miss remains a visit candidate, not proof that a system is absent. Catalogue errors remain unresolved, and missing entries never determine a boxel endpoint.

EDSM names identify its system-discovery attribution, not your personal visit record. The date is the latest reported body update in the returned data, not the latest commander visit or query time. **(pre-Odyssey)** marks dates before [19 May 2021](https://store.steampowered.com/app/1336350/Elite_Dangerous_Odyssey/); later unreported exploration may still have occurred. Commander names are fetched for the selected target and cached; this adds no per-system requests to bulk discovery.

**Known limitation:** child names can be wrong where named sectors overlap procedural naming regions. Read the [sector-overlap explanation and examples](HIERARCHY-ISSUE.md) if generated names do not resolve. A sequence endpoint also does not certify that every earlier system has been handled.

Optional automatic GalMap plotting is experimental and off by default. Clipboard navigation is the normal workflow.

## Documentation

- [Detailed usage and installation guide](USAGE.md)
- [Clipboard helper setup and removal](clipboard-helper/README.md)
- [Version history](FIXES.md)
- [Architecture and data flow](DESIGN.md)
- [Known naming limitation](HIERARCHY-ISSUE.md)
- [Credits and source provenance](CREDITS.md)

The illustrated PDF manual is being prepared and is not included yet.

## Development

Readable modules and tests are in `source/`. The generated HTML bundles the model, host adapter and interface without external script dependencies.

```text
node source/build.cjs
npm test
python -m unittest discover -s clipboard-helper
```

Optional browser workflows require Playwright and a Chromium browser. Make `playwright` resolvable by Node, set `CHROME_PATH` if using an installed Chrome, then run `npm run test:browser`. The workflows simulate JACoB and do not control the running game. Build first when changing source files.

## Feedback

Report problems through this repository's Issues. Include the extension and JACoB versions, relevant system name, steps, and visible error. Keep personal journal files, survey backups, JACoB state and clipboard connection credentials out of public reports.

Project concept and survey workflow by **Oberonmeister**. Built as a separate extension on **Pseudo6626's JACoB** platform, with AI-assisted implementation. See [credits](CREDITS.md) for adapted upstream components.
