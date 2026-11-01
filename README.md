# KingShotMinisterScheduler

A stand-alone HTML/JavaScript tool for scheduling KingShot minister/advisor appointments from player CSV data. No build step — just open `index.html` (e.g. via `run_test_webserver.sh`) and load a CSV.

## CSV format

Required-ish columns: `Alliance`, `Player`, `General Speedups`, `General Used For`, `Soldier Training`, `Construction`, `Research`, `TrueGold Pieces`, `Time Slot Start UTC`, `Time Slot End UTC`, `All Times`.

Optional resource columns: `Tempered TrueGold` (construction, 30,000 pts each), `TrueGold Dust` (research, 1,000 pts each). Speedup columns are entered in **days**.

## Scheduling

- **Chief Minister** days (Construction King Day, Research King Day, plus a spillover day) and **Noble Advisor** day (Day 4) are scheduled with a two-round process: greedy slot assignment (narrowest availability first), then displacement by buff points.
- Ministers are ranked by the exact buff points the day's resources produce:
  - Construction day: `construction days × 43,200 + TrueGold Pieces × 2,000 + Tempered TrueGold × 30,000`
  - Research day: `research days × 43,200 + TrueGold Dust × 1,000`
  - Noble Advisor ranking uses Soldier Training days.
- Players are filtered out unless Construction + Research days (or Soldier Training days) meet the `Min Days` threshold.
- "Generate Day 4 Chief Ministers" controls whether leftover Noble Advisor candidates spill over to Day 4 Chief Minister slots (default on). When off, those players go to the Day 4 waiting list instead of being auto-assigned as Day 4 Chief Ministers; Day 4 Noble Advisor scheduling always runs.

## Features

- Import player CSV; add/edit/remove players; recalculate for the current event stage only.
- Copy the CSV column header (tab-separated, for multi-cell spreadsheet paste) straight from the header row, or download a blank CSV.
- Export the schedule and waiting lists to JSON, Excel (2003 XML), or a standalone HTML file.
- The exported HTML page includes a sticky day-navigation header (CSS smooth-scroll to each day's anchor) and an Alliance dropdown (default "All") that filters tables, waiting lists, and the copiable message text down to a single alliance, re-compacting the copy segments to ≤10 lines each.
- Schedules persist in the browser's Origin Private File System (OPFS) and reload automatically if recent.

## Files

- `index.html` — UI structure (Bootstrap 5 via CDN).
- `parse.js` — CSV parsing, time parsing, and validation.
- `utils.js` — display helpers.
- `calculator.js` — scheduling logic, UI rendering, modal handlers, player management.
- `storage.js` — OPFS persistence.
- `export.js` — Excel/HTML export.
- `generate_sample.py` — regenerates `sample.csv` / `sample-big.csv`.