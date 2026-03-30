# Buzzpoints

This forked version provides a client-side Buzzpoints viewer that runs entirely in-browser from a single mega JSON file.

## What This Version Does

- Loads one mega JSON file locally in the browser.
- Parses packet and QBJ game data client-side.
- Computes tossup, bonus, team, player, and category statistics in-memory.
- Renders a multi-route stats interface using hash-based routing.
- Requires no server/database to view tournament data.

## Repository Layout

- `docs/index.html`: static app entry point for GitHub Pages.
- `docs/app.js`: parser, stat engine, routing, table rendering, interactions.
- `docs/styles.css`: static app styling.
- `src/`, `data/`: retained from upstream repository structure.

## Quick Start (Viewer)

1. Clone this repository.
2. Serve the repository root with any static server.
3. Open `/docs/` in a browser.
4. Click the loader toggle and upload one mega JSON file.

Example local server command:

```bash
python -m http.server 4173
```

Then open:

`http://localhost:4173/docs/`

## Deployment (GitHub Pages)

1. Push repository to GitHub.
2. In repository settings, enable Pages.
3. Set source to branch + `/docs` folder.
4. Save.

The app will run as a static site with browser-only data processing.

## Input Data Requirements

The viewer consumes one mega JSON file with this top-level structure:

```json
{
   "schemaVersion": 1,
   "createdAt": "2026-03-30T00:00:00.000Z",
   "tournamentName": "Tournament Name",
   "questionSetName": "Question Set Name",
   "roundPacketMap": {
      "1": "Packet-01",
      "2": "Packet-02"
   },
   "location": "Optional",
   "level": "Optional",
   "startDate": "Optional",
   "endDate": "Optional",
   "difficulty": "Optional",
   "format": "powers",
   "packets": [
      {
         "fileName": "Packet-01.json",
         "data": {
            "tossups": [],
            "bonuses": []
         }
      }
   ],
   "qbjs": [
      {
         "fileName": "Round_1_A_B.qbj",
         "data": {
            "packets": "Packet-01",
            "match_teams": [],
            "match_questions": []
         }
      }
   ]
}
```

Minimum required fields to load successfully:

- `packets` (non-empty array)
- `qbjs` (non-empty array)

## Packet and QBJ Handling Rules

### Packet parsing

- Packet entries may be `{ fileName, data }`, `{ name, content }`, or raw packet objects.
- Tossups read from `data.tossups[]`.
- Bonuses read from `data.bonuses[]`.
- Category/subcategory inferred from metadata text.

### QBJ parsing

- QBJ entries may be `{ fileName, data }`, `{ name, content }`, or raw game objects.
- Games read from:
  - `packets`
  - `tossups_read`
  - `match_teams[]`
  - `match_questions[]`

### Round resolution

- Primary: parse from file name pattern `round[_\s-]*(\d+)`.
- Fallback: upload order index + 1.

### Packet matching precedence

1. `roundPacketMap[round]` override, if present.
2. QBJ `packets` field.
3. Fuzzy matching against packet file name/descriptor/number.
4. Fallback by packet upload order index.

If a packet cannot be matched, that QBJ game is skipped and counted as unmatched.

## Functional Features

- Hash routes for home, set, tournament, tossup, bonus, teams, players, and category views.
- Dedicated set and tournament pages for:
  - tossups list/detail
  - bonuses list/detail
  - category tossup list/detail
  - category bonus list/detail
  - team list/detail
  - player list/detail + player buzz page
- Sortable tables across all views.
- Tossup detail interaction: hovering a buzz row highlights the corresponding buzzed word position in question text.

## Security Notes

- This viewer does not upload data to an application backend.
- Data is still processed as untrusted input and should be treated carefully.
- Use only trusted tournament files where possible.
- Keep browser, OS, and hosting environment updated.

## Liability and Warranty Disclaimer

By using, copying, modifying, or deploying this fork, and by loading/updating any JSON/QBJ content through it, you acknowledge and agree to all of the following:

1. This software is provided "as is" and "as available," without warranties of any kind, express or implied.
2. The creator of this fork disclaims liability for any direct, indirect, incidental, consequential, special, exemplary, or punitive damages.
3. This includes, without limitation, damages arising from data corruption, service interruption, information disclosure, dependency flaws, parser defects, or security vulnerabilities present in uploaded JSON/QBJ content or in related tooling.
4. You are solely responsible for validating, sanitizing, reviewing, and safely handling all tournament files and output derived from them.
5. You assume all risk for deployment, hosting, sharing, and downstream usage of generated or uploaded data.

## Issues

To request bug fixes and/or new features, [file an Issue](https://github.com/JemCasey/buzzpoints/issues/new/choose).

## Contributing

To contribute to or develop this toolset, please [fork the repository](https://github.com/JemCasey/buzzpoints/fork) and [submit a Pull Request](https://github.com/JemCasey/buzzpoints/compare).

## Credits

This tool was created by [Jordan Brownstein](https://github.com/JemCasey/). [Ani Perumalla](https://github.com/ani-per/) contributed some features after its initial development.

[Ryan Rosenberg](https://github.com/ryanrosenberg), [Geoffrey Wu](https://github.com/geoffrey-wu), and [Ophir Lifshitz](https://github.com/hftf) have helped debug and develop new features.

[William Horton](https://github.com/wdhorton) added the password protection functionality.
