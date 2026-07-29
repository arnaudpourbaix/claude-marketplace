---
name: extract-creatures
description: Use after installing a WeiDU/Infinity Engine mod, once its creature files have been re-extracted with the extract component, to merge new creatures into the master creatures.csv (tagged with the mod that added them), applying and logging any field changes so later mods diff against the current state instead of a stale backlog.
---

# Merging Creature Extractions

## Overview

The `extract` WeiDU component dumps every `.cre` in `override/` to a semicolon-delimited CSV (`file;general;race;class;anim;deathvar;dialog;name` — `name` is always the last field, unquoted, so it can safely contain any character, including a literal `;` or `"`). Re-running it after each mod install produces a full snapshot of the current override folder — not just that mod's additions.

`scripts/extract-creatures.js` compares that fresh snapshot against the accumulating master list (`extract/csv/creatures.csv`, with an added `origin` column placed just before `name`) so you know which mod introduced each creature. When a mod changes an existing creature's `general`/`race`/`class`/`anim`/`deathvar`/`dialog` fields, the script applies the new values to `creatures.csv` (last mod processed wins) and logs the old-vs-new diff for visibility — it does NOT ask you to reconcile by hand. This keeps `creatures.csv` always reflecting your current install, and means later mods' logs report only what THEY changed, not a growing backlog of everything every prior mod already changed.

## Procedure

1. Install the mod, then re-run the `extract` WeiDU component so its CSV output reflects the current `override/` folder. WeiDU interleaves its own progress/log lines into the raw output (BIFF loading messages, etc.) — the script skips these with a warning; seeing a few dozen warnings on a full extraction is normal, not a failure.
2. Save/copy that output to a file named after the mod, e.g. `cdtweaks.csv` — the script derives the `origin` value from this filename (extension stripped), so the name matters.
3. Run: `node <plugin-path>/skills/extract-creatures/scripts/extract-creatures.js --input cdtweaks.csv --destination extract/csv/creatures.csv`
   (destination defaults to `extract/csv/creatures.csv` relative to the current directory if omitted).
4. Read the summary line:
   - New creatures are already appended to `creatures.csv` with `origin=cdtweaks`.
   - Any existing creature whose `general`/`race`/`class`/`anim`/`deathvar`/`dialog` fields changed is updated in `creatures.csv` (its `origin` becomes `cdtweaks`) and the old-vs-new diff is written to `cdtweaks_changes.log` next to it, purely for visibility — nothing to reconcile by hand. If a creature two mods both touch looks wrong afterward, the log tells you what changed and when. Once a later run finds nothing left to flag for that origin, its log file is removed automatically.
   - A `name`-only difference is never flagged or applied — display-name changes are ignored, since they don't affect gameplay.
5. To bootstrap `creatures.csv` from scratch, run the script once with your base/vanilla extraction as `--input` against an empty (or nonexistent) destination — every row is "new" and gets `origin=base`. The destination's parent directory (e.g., `extract/csv/`) must already exist; only the destination file itself may be missing.

## Common Mistakes

- Reusing the same input filename across two different mods — the `origin` label and the change log name both come from that filename, so each mod's extraction needs its own distinct name.
- Assuming a `_changes.log` means action is needed — it's an applied-change record, not a pending decision. Only check it if a creature looks wrong and you want to know which mod last touched it.
