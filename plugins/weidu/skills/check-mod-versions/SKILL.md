---
name: check-mod-versions
description: Use when checking whether installed WeiDU/Infinity Engine mods (Baldur's Gate, BG2, IWD, Planescape, EET, etc.) are up to date against their GitHub sources, especially when a mod's GitHub Releases page is missing, stale, or unreliable and a plain version-string comparison won't give the real answer.
---

# Checking WeiDU Mod Versions

## Overview

WeiDU mod authors rarely tag GitHub Releases consistently. The Releases tab is **not** ground truth — the `VERSION` line actually committed in the mod's `.tp2` on the default branch is. When even that's missing or stale, compare the file's last-commit date against the nearest known release's publish date to catch undocumented drift.

## Procedure

0. **Identify which folders are actually mods.** An Infinity Engine EE install root mixes WeiDU mod folders with core game/engine folders — don't treat every subfolder as a mod. The reliable test: **a WeiDU mod folder contains a `.tp2`/`.TP2` file at its top level; core folders never do.** Skip folders with no tp2 (verify with a quick `find <dir> -maxdepth 1 -iname "*.tp2"` per folder, or just glob for tp2s across the whole root at once). Common non-mod folder names to expect and skip on a BG:EE-family install (BG:EE, SoD, BG2:EE, EET): `characters`, `data`, `dlc`, `DlcMerger`, `lang`, `Manuals`, `movies`, `music`, `override`, `scripts`, `sod-dlc`, `TobEx_ini`, `weidu_external`, `Worldmap`. Also confirm scope with the user before starting — they may want specific mods excluded too (e.g. one they manage manually).

1. **Extract the local version per mod.** `grep -i VERSION` the mod's `.tp2` (filename case varies: `.tp2`/`.TP2`, `setup-X.tp2`/`X.tp2`). Some tp2s reference a `.tra` string (`VERSION @0`) — resolve it there. Auto-versioned mods (no fixed string in the tp2) need `WeiDU.log` instead — component comment lines often end in the installed version (`// Mod Name: 29`).

2. **Find the canonical GitHub repo**, not just any repo with a matching name. Prefer the org/account linked from the mod's official forum thread (Gibberlings3, Spellhold Studios, Pocket Plane Group, BGforge) over a random fork. If several candidates exist, open each — a real fork says "forked from X"; a maintained continuation's README often disclaims the old repo. **When a repo has moved, renamed, or a competing fork exists, record BOTH URLs explicitly** (`Old: ... — New: ...`), don't just describe it in prose. Watch for two repos that are the _same mod at different lifecycle stages_ vs. two _different mods by the same author_ (e.g. a standalone edition vs. a later merged one) — fetch both tp2s directly to tell which before concluding one supersedes the other.

3. **Read the real upstream version**, don't trust Releases. Fetch `https://raw.githubusercontent.com/OWNER/REPO/BRANCH/path/to/mod.tp2` (or view the blob on github.com) for the live `VERSION ~...~` line, and get that file's last-commit date (github.com/OWNER/REPO/commits/BRANCH/path).

4. **Classify:**

   | Situation                                                                                                    | Status                                                                               |
   | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
   | Local version string == upstream tp2 VERSION string                                                          | **Current**                                                                          |
   | Local version string < upstream tp2 VERSION string                                                           | **Behind**                                                                           |
   | No usable VERSION match, but a release tag exists whose publish date is _before_ the file's last-commit date | **Behind** — content moved on after that release even without a version bump         |
   | No VERSION line anywhere, and no release tags exist to anchor a date comparison                              | **Unclear** — say so explicitly, don't guess                                         |
   | Local version is numerically _higher_ than upstream                                                          | **Current/Ahead** — flag as unusual, local likely came from a different distribution |

5. **At scale (30+ mods),** dispatch parallel subagents in batches of ~10 (see `superpowers:dispatching-parallel-agents`): one pass to discover repos, a second pass to verify tp2 VERSION + commit dates against the discovered URLs. Re-verify surprising claims (e.g. "no releases exist") with a direct fetch before reporting them — earlier passes can be wrong.

## Common Mistakes

- Trusting the Releases tab as the last word — many WeiDU mods are actively developed with zero formal releases, or have stale tags that don't reflect the current tp2.
- Assuming the local folder name matches the GitHub file path exactly — check case and subfolder nesting (mods are often nested `RepoName/RepoName.tp2`).
- Reporting a rename/fork situation in prose without giving both URLs.
- Treating "no separate old repo found (404)" as inconclusive — it's a real, reportable finding (mod was always single-repo).
- Forgetting to check `WeiDU.log` for mods with auto-detected versions and no fixed tp2 string.

## Related

- `superpowers:dispatching-parallel-agents` for fanning out research across many mods.
