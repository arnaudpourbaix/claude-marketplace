---
name: extract-creatures
description: Use after installing a WeiDU/Infinity Engine mod, once its creature files have been re-extracted with the extract component, to merge new creatures into the master creatures.csv (tagged with the mod that added them) and flag any creature the mod changed without silently overwriting prior data.
---

# Merging Creature Extractions

## Overview

The `extract` WeiDU component dumps every `.cre` in `override/` to a semicolon-delimited CSV (`file;general;race;class;anim;deathvar;dialog;name` — `name` is always the last field, unquoted, so it can safely contain any character, including a literal `;` or `"`). Re-running it after each mod install produces a full snapshot of the current override folder — not just that mod's additions.

`scripts/extract-creatures.js` compares that fresh snapshot against the accumulating master list (`extract/csv/creatures.csv`, with an added `origin` column placed just before `name`) so you know which mod introduced each creature, and flags anything a mod changed on a creature you already have without touching the master file.

## Procedure

1. Install the mod, then re-run the `extract` WeiDU component so its CSV output reflects the current `override/` folder. WeiDU interleaves its own progress/log lines into the raw output (BIFF loading messages, etc.) — the script skips these with a warning; seeing a few dozen warnings on a full extraction is normal, not a failure.
2. Save/copy that output to a file named after the mod, e.g. `cdtweaks.csv` — the script derives the `origin` value from this filename (extension stripped), so the name matters.
3. Run: `node <plugin-path>/skills/extract-creatures/scripts/extract-creatures.js --input cdtweaks.csv --destination extract/csv/creatures.csv`
   (destination defaults to `extract/csv/creatures.csv` relative to the current directory if omitted).
4. Read the summary line:
   - New creatures are already appended to `creatures.csv` with `origin=cdtweaks`.
   - If any existing creature's fields changed, a `cdtweaks_changes.log` is written next to `creatures.csv` listing old vs. new values — `creatures.csv` itself is left untouched for those rows. Review the log and decide how to reconcile it; the script never guesses. Once nothing about that mod's extraction differs anymore, its log file is removed automatically on the next run.
5. To bootstrap `creatures.csv` from scratch, run the script once with your base/vanilla extraction as `--input` against an empty (or nonexistent) destination — every row is "new" and gets `origin=base`. The destination's parent directory (e.g., `extract/csv/`) must already exist; only the destination file itself may be missing.

## Common Mistakes

- Reusing the same input filename across two different mods — the `origin` label and the change log name both come from that filename, so each mod's extraction needs its own distinct name.
- Expecting the script to resolve conflicting field values automatically — it never overwrites an existing destination row; that decision is manual.
