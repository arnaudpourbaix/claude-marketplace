---
name: extract-creatures
description: Use after installing a WeiDU/Infinity Engine mod, once its creature files have been re-extracted with the extract component into source.csv, to merge new creatures into the master creatures.csv (tagged with the mod that added them), applying and logging any field changes so later mods diff against the current state instead of a stale backlog.
---

# Merging Creature Extractions

## Overview

The `extract` WeiDU component (`extract/extract.tp2`) writes every `.cre` in `override/` directly to `extract/csv/source.csv` (semicolon-delimited: `file;general;race;class;anim;deathvar;dialog;name` — `name` is always the last field, unquoted, so it can safely contain any character, including a literal `;` or `"`). It truncates `source.csv` and rewrites it from scratch on every run, so running it after each mod install produces a full, clean snapshot of the current override folder — not just that mod's additions, with no manual copy/paste step and no interleaved WeiDU log noise to filter. `BUT_ONLY` means it never actually writes back any `.cre` file (nothing is patched, only read), so installing and uninstalling this component is a no-op on the game itself.

`scripts/extract-creatures.js` then compares `source.csv` against the accumulating master list (`extract/csv/creatures.csv`, with an added `origin` column placed just before `name`) so you know which mod introduced each creature. The mod name is passed explicitly as `--origin` rather than derived from a filename. When a mod changes an existing creature's `general`/`race`/`class`/`anim`/`deathvar`/`dialog` fields, the script applies the new values to `creatures.csv` (last mod processed wins) and logs the old-vs-new diff for visibility — it does NOT ask you to reconcile by hand. This keeps `creatures.csv` always reflecting your current install, and means later mods' logs report only what THEY changed, not a growing backlog of everything every prior mod already changed.

Because installing `extract` is otherwise pointless clutter in `WeiDU.log`, the full procedure installs it, runs the merge, then immediately uninstalls it again — leaving no trace except the updated `creatures.csv`/log. Order matters: uninstalling deletes `source.csv` along with everything else the component created, so the merge step must run strictly between install and uninstall.

## Procedure

1. Install the `extract` component: `weidu.exe extract/extract.tp2 --yes --force-install 0` (run from the game root, where `weidu.exe` lives). This (re)writes `extract/csv/source.csv` from scratch to reflect the current `override/` folder.
2. Run: `node <plugin-path>/skills/extract-creatures/scripts/extract-creatures.js --origin cdtweaks --destination extract/csv/creatures.csv`
   (destination defaults to `extract/csv/creatures.csv` relative to the current directory if omitted; the script always reads its input from `source.csv` next to the destination). Any warnings here indicate a genuine problem in `source.csv`, not routine WeiDU noise — the component's output is already clean.
3. Uninstall the `extract` component: `weidu.exe extract/extract.tp2 --uninstall` (the global `--uninstall` flag, not `--force-uninstall` — the latter was found unreliable and can silently reinstall instead). This removes `source.csv`, the `extract/backup` folder, and the `WeiDU.log` entry — `creatures.csv` and the change log are untouched since the merge script wrote them in step 2, before the uninstall ran.
4. Read the summary line from step 2:
   - New creatures are already appended to `creatures.csv` with `origin=cdtweaks`.
   - Any existing creature whose `general`/`race`/`class`/`anim`/`deathvar`/`dialog` fields changed is updated in `creatures.csv` (its `origin` becomes `cdtweaks`) and the old-vs-new diff is written to `cdtweaks_changes.log` next to it, purely for visibility — nothing to reconcile by hand. If a creature two mods both touch looks wrong afterward, the log tells you what changed and when. Once a later run finds nothing left to flag for that origin, its log file is removed automatically.
   - A `name`-only difference is never flagged or applied — display-name changes are ignored, since they don't affect gameplay.
5. To bootstrap `creatures.csv` from scratch, run this same three-step procedure against a vanilla/base install with `--origin base` against an empty (or nonexistent) destination — every row is "new" and gets `origin=base`. The destination's parent directory (e.g., `extract/csv/`) must already exist; only the destination file itself may be missing.

## Common Mistakes

- Running the uninstall (step 3) before the merge script (step 2) — this deletes `source.csv` before it's been read, losing the extraction.
- Using `--force-uninstall` instead of `--uninstall` for step 3 — in testing, `--force-uninstall N` silently reinstalled the component instead of removing it; the global `--uninstall` flag is the one that actually works.
- Reusing the same `--origin` name across two different mods — the origin label and the change log name both come from that argument, so each mod needs its own distinct name.
- Assuming a `_changes.log` means action is needed — it's an applied-change record, not a pending decision. Only check it if a creature looks wrong and you want to know which mod last touched it.
