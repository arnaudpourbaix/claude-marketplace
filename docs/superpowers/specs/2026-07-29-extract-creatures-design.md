# extractCreatures Skill — Design

## Context

The `weidu` plugin's `extract` component (`extract/extract.tp2` in a BG2EE install) dumps every `.cre` file under `override/` into a semicolon-delimited CSV: `file;name;general;race;class;anim;deathvar;dialog`. Only `name` is quoted.

Today the user maintains this by hand:
- `extract/csv/base.csv` — a full extraction from a clean/base install (4767 rows).
- `extract/csv/creatures.csv` — the accumulating master list (currently just a header).

Workflow going forward: install one mod, re-run the WeiDU `extract` component (full override dump, same CSV format), save the raw output under a name that identifies the mod (e.g. `cdtweaks.csv`), then run this skill to merge it into `creatures.csv`. Repeating this after each mod install lets the user attribute every creature to the mod that introduced it, and flags any creature a mod *changes* from what's already recorded, without silently overwriting history.

## Goals

- Given a freshly re-extracted CSV (`input`) and the master CSV (`destination`, default `extract/csv/creatures.csv`), detect:
  - **New creatures**: `file` present in input, absent from destination.
  - **Changed creatures**: `file` present in both, but one or more of `name/general/race/class/anim/deathvar/dialog` differs.
- Record provenance: destination gains an `origin` column. New rows are appended with `origin` = input file's basename without extension (e.g. `cdtweaks.csv` → `cdtweaks`).
- Never silently mutate an existing destination row. Changed rows are reported, not applied — the user resolves them manually.
- Because `creatures.csv` starts empty, running the skill with `base.csv` as input is the bootstrap case (populates the master list with `origin=base`) — no special-case code needed, it falls out of the general algorithm.

## Non-goals

- Detecting creatures *removed* from the input (a `file` present in destination but missing from input) is out of scope — override folders are additive across mod installs, this scenario isn't expected.
- No automatic resolution of changed rows — that requires human judgment about which mod's values should win.

## Interface

Bundled script: `plugins/weidu/skills/extractCreatures/scripts/extract-creatures.js`, run with Node.js (already available on this machine; v22.14.0 confirmed).

```
node extract-creatures.js --input <path-to-fresh-extraction.csv> [--destination <path-to-creatures.csv>]
```

- `--input` (required): path to the CSV just produced by the WeiDU `extract` component for the mod being processed.
- `--destination` (optional): defaults to `extract/csv/creatures.csv` relative to the current working directory.

`SKILL.md` tells Claude: after the user installs a mod and re-runs the WeiDU extraction, copy/rename the raw output to something identifying the mod, then invoke this script with `--input` pointing at that file.

## Algorithm

1. Read `destination` CSV (semicolon-delimited, header `file;name;general;race;class;anim;deathvar;dialog;origin`). If the file has only a header or is empty, start with zero rows. If it doesn't exist yet, treat as zero rows with that header.
2. Read `input` CSV (header `file;name;general;race;class;anim;deathvar;dialog`, no `origin` column).
3. Derive `origin` = basename of `--input`, extension stripped (e.g. `cdtweaks.csv` → `cdtweaks`).
4. Build a map of destination rows keyed by `file`.
5. For each input row:
   - If `file` not in destination map → queue for append, with `origin` set to the derived label.
   - If `file` in destination map → compare `name, general, race, class, anim, deathvar, dialog` field-by-field (exact string match) against the destination row. If any differ, queue a change-log entry with old and new values for every differing field (fields that match are omitted from the log entry to keep it readable).
6. If there are any new rows, append them to `destination` (preserving existing rows and header; write the file only if there's something to add).
7. If there are any changed rows, write `<origin>_changes.log` in the same directory as `destination` (overwriting any prior log from a previous run with the same origin). Format: one block per changed creature, e.g.:
   ```
   AATAQAH
     class: GENIE_DJINNI -> GENIE_EFREET
   ```
8. Print a one-line summary to stdout: `N new creature(s) added (origin=<label>), M changed creature(s) logged to <logfile>`.

## CSV formatting rules

- Delimiter: `;`.
- Quoting: only the `name` field is wrapped in double quotes, matching the existing files exactly. All other fields are written unquoted.
- This is why the script is hand-rolled in Node rather than using a CSV library or PowerShell's `Export-Csv` — both default to quoting every field, which would silently reformat every existing row in `creatures.csv`.

## Error handling

- Missing `--input` file, or a destination path whose parent directory doesn't exist: fail with a clear message, no partial writes.
- Malformed row (wrong column count): skip with a warning that names the file and line number, rather than aborting the whole run.

## Testing

- A small fixture pair (a few rows) exercising: pure-new row, pure-changed row, unchanged row (no log entry, no append), and the bootstrap case (empty destination).
