# Confirmed named-sector overlap: Pyurks FS-H d11

Checked 2026-10-11T22:45:02.298Z. **This is a confirmed limitation in the current extension; it is not fixed by the save-lock patch.**

The name-derived D boxel agrees with the anchor's independently retrieved numeric address. All eight generated C grids match addresses of actual catalogue systems. However, those systems use NGC 2244 Sector names. The extension incorrectly carries the parent's sector name into every child name. A mathematically valid procedural label is not necessarily a resolvable in-game name.

## Verified examples

These are known systems in each child, **not claims about the first or last existing suffix**. Search their full names in GalMap.

| Child | Generated name | Verified catalogue example | Address |
| --- | --- | --- | --- |
| 1 | Pyurks KK-P c22-0 | NGC 2244 Sector LO-W c16-0 | [87677669314](https://spansh.co.uk/system/87677669314) |
| 2 | Pyurks LK-P c22-0 | NGC 2244 Sector MO-W c16-2 | [637500592066](https://spansh.co.uk/system/637500592066) |
| 3 | Pyurks IP-P c22-0 | NGC 2244 Sector JT-W c16-7 | [2011823050690](https://spansh.co.uk/system/2011823050690) |
| 4 | Pyurks JP-P c22-0 | NGC 2244 Sector KT-W c16-7 | [2011890159554](https://spansh.co.uk/system/2011890159554) |
| 5 | Pyurks OQ-N c23-0 | NGC 2244 Sector PU-U c17-2 | [637433483210](https://spansh.co.uk/system/637433483210) |
| 6 | Pyurks PQ-N c23-0 | NGC 2244 Sector QU-U c17-0 | [87744778186](https://spansh.co.uk/system/87744778186) |
| 7 | Pyurks MV-N c23-0 | NGC 2244 Sector NZ-U c17-2 | [637433515978](https://spansh.co.uk/system/637433515978) |
| 8 | Pyurks NV-N c23-0 | NGC 2244 Sector OZ-U c17-0 | [87744810954](https://spansh.co.uk/system/87744810954) |

## Evidence and scope

The fixture stores 32 catalogue samples across the eight children, including names, decimal ID64 addresses, positions and decoded grids. Independent address decoding places each one in its expected child of the anchor. Public catalogue absence was not treated as nonexistence.

The child-zero address 87677669314 directly resolves to NGC 2244 Sector LO-W c16-0 at https://spansh.co.uk/api/system/87677669314 .

The published [PGRegion/PGSystem reference](https://gist.github.com/klightspeed/772c654f07292b71dfe7aa55c91397e8) also lists a separate NGC 2244 naming origin. Alternative prefixes were checked against live catalogue names and addresses; they were not accepted solely because a formula produced them.

## Required correction

Physical boxel identity must be separated from naming-region labels. Actual names from verified addresses must be used for copying and catalogue queries; journal events under named-sector aliases must map back to the same survey cell. Unresolved systems need explicit naming uncertainty. A whole boxel must not be blindly renamed from one sample: regional boundaries can affect individual stars differently. This affects duplicate detection and progress attribution as well as the displayed names.

The original naming test used formula-generated expectations and was not independent validation against the game. The new fixture tests establish physical containment and document the naming disagreement. They do not assert that named-sector support is implemented. The production HTML remains unchanged by this investigation.
