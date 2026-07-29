# extractCreatures Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an `extractCreatures` skill to the `weidu` plugin that merges a freshly re-extracted WeiDU creature CSV into the master `creatures.csv`, tagging new creatures with the mod that introduced them and flagging (never auto-applying) any creature a mod changed.

**Architecture:** A Node.js CLI script (`extract-creatures.js`) built on a small pure-function library (`lib.js`) for CSV parsing, diffing, and formatting. The library is unit-tested in isolation; the CLI is tested end-to-end against temp-directory fixtures. A `SKILL.md` documents the workflow for Claude to follow.

**Tech Stack:** Node.js (v22.14.0 confirmed installed), built-in `node:test` + `node:assert/strict` for tests — no external dependencies, no `package.json` needed.

All paths below are relative to the repository root: `C:\Users\pourb\.claude\plugins\marketplaces\arnaud-pourbaix-marketplace`. Run all commands from that directory.

## Global Constraints

- No external npm dependencies — use only Node built-ins (`fs`, `path`, `node:test`, `node:assert/strict`).
- CSV delimiter is `;`. Only the `name` field is quoted, in both the 8-column input format (`file;name;general;race;class;anim;deathvar;dialog`) and the 9-column destination format (same plus trailing `origin`).
- Fields compared for "changed" detection: `name, general, race, class, anim, deathvar, dialog` (exact string match). `file` is the match key, never compared as a "changed" field itself.
- An existing destination row is never mutated by a detected change — changes are only written to a per-origin log file (`<origin>_changes.log`), overwriting any prior log with that same origin.
- New rows ARE appended to the destination file, tagged with `origin` = the `--input` file's basename with its extension stripped.
- A missing `--input` file, or a `--destination` path whose parent directory doesn't exist, is a fatal error (no partial writes). A malformed input row (wrong column count) is a skip-with-warning, not fatal.

---

## File Structure

- Create: `plugins/weidu/skills/extractCreatures/scripts/lib.js` — pure functions: CSV line parsing/formatting, destination/input parsing, diffing, output formatting. No filesystem or process access.
- Create: `plugins/weidu/skills/extractCreatures/scripts/lib.test.js` — unit tests for everything in `lib.js`.
- Create: `plugins/weidu/skills/extractCreatures/scripts/extract-creatures.js` — CLI entry point: argument parsing, file I/O, wires `lib.js` functions together, prints a summary.
- Create: `plugins/weidu/skills/extractCreatures/scripts/extract-creatures.test.js` — end-to-end tests for the CLI's `run()`/`parseArgs()` against temp-directory fixtures.
- Create: `plugins/weidu/skills/extractCreatures/SKILL.md` — skill instructions for Claude, following the style of the existing `check-mod-versions/SKILL.md`.

---

### Task 1: CSV line helpers

**Files:**
- Create: `plugins/weidu/skills/extractCreatures/scripts/lib.js`
- Create: `plugins/weidu/skills/extractCreatures/scripts/lib.test.js`

**Interfaces:**
- Produces: `splitCsvLine(line: string): string[]` — splits a `;`-delimited line into raw field values, stripping quotes from quoted fields and unescaping `""` to `"` inside them. Consumed by Task 2 (`parseDestination`, `parseInput`).
- Produces: `joinCsvLine(fields: string[], quotedIndices?: number[]): string` — joins fields with `;`, wrapping only the fields at `quotedIndices` in double quotes (escaping internal `"` as `""`). Consumed by Task 4 (`formatDestinationCsv`).

- [ ] **Step 1: Write the failing tests**

Create `plugins/weidu/skills/extractCreatures/scripts/lib.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { splitCsvLine, joinCsvLine } = require('./lib');

test('splitCsvLine splits unquoted fields on semicolon', () => {
  const result = splitCsvLine('AATAQAH;GIANTHUMANOID;GENIE');
  assert.deepEqual(result, ['AATAQAH', 'GIANTHUMANOID', 'GENIE']);
});

test('splitCsvLine strips quotes from a quoted field', () => {
  const result = splitCsvLine('AATAQAH;"Aataqah";GENIE');
  assert.deepEqual(result, ['AATAQAH', 'Aataqah', 'GENIE']);
});

test('splitCsvLine unescapes doubled quotes inside a quoted field', () => {
  const result = splitCsvLine('AATAQAH;"Aa""taqah";GENIE');
  assert.deepEqual(result, ['AATAQAH', 'Aa"taqah', 'GENIE']);
});

test('joinCsvLine quotes only the requested indices', () => {
  const result = joinCsvLine(['AATAQAH', 'Aataqah', 'GENIE'], [1]);
  assert.equal(result, 'AATAQAH;"Aataqah";GENIE');
});

test('joinCsvLine escapes internal quotes in a quoted field', () => {
  const result = joinCsvLine(['AATAQAH', 'Aa"taqah'], [1]);
  assert.equal(result, 'AATAQAH;"Aa""taqah"');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test plugins/weidu/skills/extractCreatures/scripts/lib.test.js`
Expected: FAIL — `Cannot find module './lib'` (file doesn't exist yet).

- [ ] **Step 3: Implement the minimal code to make the tests pass**

Create `plugins/weidu/skills/extractCreatures/scripts/lib.js`:

```js
function splitCsvLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ';') {
      fields.push(current);
      current = '';
    } else {
      current += c;
    }
  }
  fields.push(current);
  return fields;
}

function joinCsvLine(fields, quotedIndices = []) {
  return fields
    .map((f, i) => (quotedIndices.includes(i) ? `"${String(f).replace(/"/g, '""')}"` : f))
    .join(';');
}

module.exports = {
  splitCsvLine,
  joinCsvLine,
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test plugins/weidu/skills/extractCreatures/scripts/lib.test.js`
Expected: PASS — 5 tests passing.

- [ ] **Step 5: Commit**

```bash
git add plugins/weidu/skills/extractCreatures/scripts/lib.js plugins/weidu/skills/extractCreatures/scripts/lib.test.js
git commit -m "feat(extractCreatures): add CSV line split/join helpers"
```

---

### Task 2: Destination/input parsing and origin derivation

**Files:**
- Modify: `plugins/weidu/skills/extractCreatures/scripts/lib.js` (append)
- Modify: `plugins/weidu/skills/extractCreatures/scripts/lib.test.js` (append)

**Interfaces:**
- Consumes: `splitCsvLine` from Task 1.
- Produces: `DESTINATION_HEADER: string`, `DESTINATION_COLUMNS: string[]` (`['file','name','general','race','class','anim','deathvar','dialog','origin']`), `INPUT_COLUMNS: string[]` (`['file','name','general','race','class','anim','deathvar','dialog']`).
- Produces: `parseDestination(text: string): { rows: object[], byFile: Map<string, object> }` — each row object has keys matching `DESTINATION_COLUMNS`. Empty/header-only/undefined text yields `{ rows: [], byFile: new Map() }`.
- Produces: `parseInput(text: string, sourceLabel: string): { rows: object[], warnings: string[] }` — each row object has keys matching `INPUT_COLUMNS`. A line with the wrong column count is skipped and produces a warning string containing `sourceLabel` and the 1-indexed line number.
- Produces: `deriveOrigin(inputPath: string): string` — basename of the path with its extension stripped.
- All four are consumed by Task 3 (`diffCreatures`) and Task 5 (the CLI).

- [ ] **Step 1: Write the failing tests**

Append to `plugins/weidu/skills/extractCreatures/scripts/lib.test.js` (add to the existing `require` line and add these tests):

```js
const { parseDestination, parseInput, deriveOrigin } = require('./lib');

test('parseDestination returns no rows for an empty string', () => {
  const { rows, byFile } = parseDestination('');
  assert.deepEqual(rows, []);
  assert.equal(byFile.size, 0);
});

test('parseDestination returns no rows for header-only text', () => {
  const { rows } = parseDestination('file;name;general;race;class;anim;deathvar;dialog;origin\n');
  assert.deepEqual(rows, []);
});

test('parseDestination parses a data row and indexes it by file', () => {
  const text = 'file;name;general;race;class;anim;deathvar;dialog;origin\n' +
    'AATAQAH;"Aataqah";GIANTHUMANOID;GENIE;GENIE_DJINNI;DJINNI;aataqah;aataqah;base\n';
  const { rows, byFile } = parseDestination(text);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, 'Aataqah');
  assert.equal(byFile.get('AATAQAH').origin, 'base');
});

test('parseInput parses a data row without an origin column', () => {
  const text = 'file;name;general;race;class;anim;deathvar;dialog\n' +
    'AATAQAH;"Aataqah";GIANTHUMANOID;GENIE;GENIE_DJINNI;DJINNI;aataqah;aataqah\n';
  const { rows, warnings } = parseInput(text, 'test.csv');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].file, 'AATAQAH');
  assert.deepEqual(warnings, []);
});

test('parseInput warns and skips a row with the wrong column count', () => {
  const text = 'file;name;general;race;class;anim;deathvar;dialog\n' +
    'BADROW;"Oops";ONLYTHREE\n';
  const { rows, warnings } = parseInput(text, 'test.csv');
  assert.equal(rows.length, 0);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /test\.csv:2/);
});

test('deriveOrigin strips the directory and extension', () => {
  assert.equal(deriveOrigin('/some/path/cdtweaks.csv'), 'cdtweaks');
  assert.equal(deriveOrigin('base.csv'), 'base');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test plugins/weidu/skills/extractCreatures/scripts/lib.test.js`
Expected: FAIL — `parseDestination`/`parseInput`/`deriveOrigin` are not exported yet.

- [ ] **Step 3: Implement the minimal code to make the tests pass**

Append to `plugins/weidu/skills/extractCreatures/scripts/lib.js` (add `const path = require('path');` at the top, and add before the `module.exports` block):

```js
const DESTINATION_COLUMNS = ['file', 'name', 'general', 'race', 'class', 'anim', 'deathvar', 'dialog', 'origin'];
const DESTINATION_HEADER = DESTINATION_COLUMNS.join(';');
const INPUT_COLUMNS = ['file', 'name', 'general', 'race', 'class', 'anim', 'deathvar', 'dialog'];

function parseDestination(text) {
  const rows = [];
  const byFile = new Map();
  if (!text) return { rows, byFile };
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  for (let i = 1; i < lines.length; i++) {
    const fields = splitCsvLine(lines[i]);
    if (fields.length !== DESTINATION_COLUMNS.length) continue;
    const row = {};
    DESTINATION_COLUMNS.forEach((col, idx) => { row[col] = fields[idx]; });
    rows.push(row);
    byFile.set(row.file, row);
  }
  return { rows, byFile };
}

function parseInput(text, sourceLabel) {
  const rows = [];
  const warnings = [];
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  for (let i = 1; i < lines.length; i++) {
    const fields = splitCsvLine(lines[i]);
    if (fields.length !== INPUT_COLUMNS.length) {
      warnings.push(`${sourceLabel}:${i + 1}: expected ${INPUT_COLUMNS.length} columns, got ${fields.length} — skipped`);
      continue;
    }
    const row = {};
    INPUT_COLUMNS.forEach((col, idx) => { row[col] = fields[idx]; });
    rows.push(row);
  }
  return { rows, warnings };
}

function deriveOrigin(inputPath) {
  return path.basename(inputPath, path.extname(inputPath));
}
```

Update the `module.exports` block at the bottom of `lib.js` to include the new names:

```js
module.exports = {
  DESTINATION_HEADER,
  DESTINATION_COLUMNS,
  INPUT_COLUMNS,
  splitCsvLine,
  joinCsvLine,
  parseDestination,
  parseInput,
  deriveOrigin,
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test plugins/weidu/skills/extractCreatures/scripts/lib.test.js`
Expected: PASS — 11 tests passing.

- [ ] **Step 5: Commit**

```bash
git add plugins/weidu/skills/extractCreatures/scripts/lib.js plugins/weidu/skills/extractCreatures/scripts/lib.test.js
git commit -m "feat(extractCreatures): parse destination/input CSVs and derive origin"
```

---

### Task 3: Diffing new vs. changed creatures

**Files:**
- Modify: `plugins/weidu/skills/extractCreatures/scripts/lib.js` (append)
- Modify: `plugins/weidu/skills/extractCreatures/scripts/lib.test.js` (append)

**Interfaces:**
- Consumes: the `{ rows, byFile }` shape from `parseDestination`, the `{ rows }` shape from `parseInput` (Task 2).
- Produces: `COMPARE_FIELDS: string[]` (`['name','general','race','class','anim','deathvar','dialog']`).
- Produces: `diffCreatures(inputRows: object[], destination: {rows, byFile}, origin: string): { newRows: object[], changedRows: {file: string, changes: {field: string, oldValue: string, newValue: string}[]}[] }`. `newRows` are input rows not found in `destination.byFile`, each with `origin` set. `changedRows` are input rows whose `file` IS in `destination.byFile` but at least one `COMPARE_FIELDS` value differs — `changes` lists only the differing fields. A row present in both with identical values produces neither. Consumed by Task 5 (the CLI).

- [ ] **Step 1: Write the failing tests**

Append to `plugins/weidu/skills/extractCreatures/scripts/lib.test.js`:

```js
const { diffCreatures } = require('./lib');

test('diffCreatures treats a file missing from destination as new, tagged with origin', () => {
  const destination = parseDestination('');
  const { rows: inputRows } = parseInput(
    'file;name;general;race;class;anim;deathvar;dialog\n' +
    'AATAQAH;"Aataqah";GIANTHUMANOID;GENIE;GENIE_DJINNI;DJINNI;aataqah;aataqah\n',
    'cdtweaks.csv'
  );
  const { newRows, changedRows } = diffCreatures(inputRows, destination, 'cdtweaks');
  assert.equal(newRows.length, 1);
  assert.equal(newRows[0].origin, 'cdtweaks');
  assert.equal(newRows[0].file, 'AATAQAH');
  assert.deepEqual(changedRows, []);
});

test('diffCreatures flags a field mismatch as changed without altering destination rows', () => {
  const destination = parseDestination(
    'file;name;general;race;class;anim;deathvar;dialog;origin\n' +
    'AATAQAH;"Aataqah";GIANTHUMANOID;GENIE;GENIE_DJINNI;DJINNI;aataqah;aataqah;base\n'
  );
  const { rows: inputRows } = parseInput(
    'file;name;general;race;class;anim;deathvar;dialog\n' +
    'AATAQAH;"Aataqah";GIANTHUMANOID;GENIE;GENIE_EFREET;DJINNI;aataqah;aataqah\n',
    'cdtweaks.csv'
  );
  const { newRows, changedRows } = diffCreatures(inputRows, destination, 'cdtweaks');
  assert.deepEqual(newRows, []);
  assert.equal(changedRows.length, 1);
  assert.deepEqual(changedRows[0].changes, [
    { field: 'class', oldValue: 'GENIE_DJINNI', newValue: 'GENIE_EFREET' },
  ]);
  assert.equal(destination.byFile.get('AATAQAH').class, 'GENIE_DJINNI');
});

test('diffCreatures ignores a row that matches destination exactly', () => {
  const csv = 'file;name;general;race;class;anim;deathvar;dialog;origin\n' +
    'AATAQAH;"Aataqah";GIANTHUMANOID;GENIE;GENIE_DJINNI;DJINNI;aataqah;aataqah;base\n';
  const destination = parseDestination(csv);
  const { rows: inputRows } = parseInput(
    'file;name;general;race;class;anim;deathvar;dialog\n' +
    'AATAQAH;"Aataqah";GIANTHUMANOID;GENIE;GENIE_DJINNI;DJINNI;aataqah;aataqah\n',
    'cdtweaks.csv'
  );
  const { newRows, changedRows } = diffCreatures(inputRows, destination, 'cdtweaks');
  assert.deepEqual(newRows, []);
  assert.deepEqual(changedRows, []);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test plugins/weidu/skills/extractCreatures/scripts/lib.test.js`
Expected: FAIL — `diffCreatures` is not exported yet.

- [ ] **Step 3: Implement the minimal code to make the tests pass**

Append to `plugins/weidu/skills/extractCreatures/scripts/lib.js` (before `module.exports`):

```js
const COMPARE_FIELDS = ['name', 'general', 'race', 'class', 'anim', 'deathvar', 'dialog'];

function diffCreatures(inputRows, destination, origin) {
  const newRows = [];
  const changedRows = [];
  for (const inputRow of inputRows) {
    const existing = destination.byFile.get(inputRow.file);
    if (!existing) {
      newRows.push({ ...inputRow, origin });
      continue;
    }
    const changes = [];
    for (const field of COMPARE_FIELDS) {
      if (existing[field] !== inputRow[field]) {
        changes.push({ field, oldValue: existing[field], newValue: inputRow[field] });
      }
    }
    if (changes.length > 0) {
      changedRows.push({ file: inputRow.file, changes });
    }
  }
  return { newRows, changedRows };
}
```

Add `COMPARE_FIELDS` and `diffCreatures` to the `module.exports` block.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test plugins/weidu/skills/extractCreatures/scripts/lib.test.js`
Expected: PASS — 14 tests passing.

- [ ] **Step 5: Commit**

```bash
git add plugins/weidu/skills/extractCreatures/scripts/lib.js plugins/weidu/skills/extractCreatures/scripts/lib.test.js
git commit -m "feat(extractCreatures): diff input rows against destination by file"
```

---

### Task 4: Formatting the updated destination CSV and change log

**Files:**
- Modify: `plugins/weidu/skills/extractCreatures/scripts/lib.js` (append)
- Modify: `plugins/weidu/skills/extractCreatures/scripts/lib.test.js` (append)

**Interfaces:**
- Consumes: `joinCsvLine` (Task 1), `DESTINATION_HEADER`, `DESTINATION_COLUMNS` (Task 2), the `newRows`/`changedRows` shapes from `diffCreatures` (Task 3).
- Produces: `formatDestinationCsv(existingRows: object[], newRows: object[]): string` — header line, then one line per existing row (in order), then one line per new row, `\n`-joined, trailing newline. Only the `name` field (index 1) is quoted.
- Produces: `formatChangeLog(origin: string, changedRows: {file, changes}[]): string` — one block per changed row: the `file` on its own line, then one `  field: oldValue -> newValue` line per change, blocks separated by a blank line, trailing newline.
- Both consumed by Task 5 (the CLI).

- [ ] **Step 1: Write the failing tests**

Append to `plugins/weidu/skills/extractCreatures/scripts/lib.test.js`:

```js
const { formatDestinationCsv, formatChangeLog } = require('./lib');

test('formatDestinationCsv writes the header, existing rows, then new rows', () => {
  const existingRows = [{
    file: 'AATAQAH', name: 'Aataqah', general: 'GIANTHUMANOID', race: 'GENIE',
    class: 'GENIE_DJINNI', anim: 'DJINNI', deathvar: 'aataqah', dialog: 'aataqah', origin: 'base',
  }];
  const newRows = [{
    file: 'NEWCRE01', name: 'New Guy', general: 'HUMANOID', race: 'HUMAN',
    class: 'FIGHTER', anim: 'MHM1', deathvar: 'newcre01', dialog: 'newcre01', origin: 'cdtweaks',
  }];
  const text = formatDestinationCsv(existingRows, newRows);
  const lines = text.trim().split('\n');
  assert.equal(lines[0], 'file;name;general;race;class;anim;deathvar;dialog;origin');
  assert.equal(lines[1], 'AATAQAH;"Aataqah";GIANTHUMANOID;GENIE;GENIE_DJINNI;DJINNI;aataqah;aataqah;base');
  assert.equal(lines[2], 'NEWCRE01;"New Guy";HUMANOID;HUMAN;FIGHTER;MHM1;newcre01;newcre01;cdtweaks');
});

test('formatChangeLog renders one block per changed creature with old -> new values', () => {
  const changedRows = [{
    file: 'AATAQAH',
    changes: [{ field: 'class', oldValue: 'GENIE_DJINNI', newValue: 'GENIE_EFREET' }],
  }];
  const text = formatChangeLog('cdtweaks', changedRows);
  assert.equal(text, 'AATAQAH\n  class: GENIE_DJINNI -> GENIE_EFREET\n');
});

test('formatChangeLog separates multiple changed creatures with a blank line', () => {
  const changedRows = [
    { file: 'AATAQAH', changes: [{ field: 'class', oldValue: 'A', newValue: 'B' }] },
    { file: 'ABAZIGAL', changes: [{ field: 'anim', oldValue: 'X', newValue: 'Y' }] },
  ];
  const text = formatChangeLog('cdtweaks', changedRows);
  assert.equal(text, 'AATAQAH\n  class: A -> B\n\nABAZIGAL\n  anim: X -> Y\n');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test plugins/weidu/skills/extractCreatures/scripts/lib.test.js`
Expected: FAIL — `formatDestinationCsv`/`formatChangeLog` are not exported yet.

- [ ] **Step 3: Implement the minimal code to make the tests pass**

Append to `plugins/weidu/skills/extractCreatures/scripts/lib.js` (before `module.exports`):

```js
function formatDestinationCsv(existingRows, newRows) {
  const allRows = [...existingRows, ...newRows];
  const lines = [DESTINATION_HEADER];
  for (const row of allRows) {
    const fields = DESTINATION_COLUMNS.map((col) => row[col]);
    lines.push(joinCsvLine(fields, [1]));
  }
  return lines.join('\n') + '\n';
}

function formatChangeLog(origin, changedRows) {
  const blocks = changedRows.map((entry) => {
    const changeLines = entry.changes.map((c) => `  ${c.field}: ${c.oldValue} -> ${c.newValue}`);
    return [entry.file, ...changeLines].join('\n');
  });
  return blocks.join('\n\n') + '\n';
}
```

Add `formatDestinationCsv` and `formatChangeLog` to the `module.exports` block.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test plugins/weidu/skills/extractCreatures/scripts/lib.test.js`
Expected: PASS — 17 tests passing.

- [ ] **Step 5: Commit**

```bash
git add plugins/weidu/skills/extractCreatures/scripts/lib.js plugins/weidu/skills/extractCreatures/scripts/lib.test.js
git commit -m "feat(extractCreatures): format merged destination CSV and change log"
```

---

### Task 5: CLI wiring

**Files:**
- Create: `plugins/weidu/skills/extractCreatures/scripts/extract-creatures.js`
- Create: `plugins/weidu/skills/extractCreatures/scripts/extract-creatures.test.js`

**Interfaces:**
- Consumes: `parseDestination`, `parseInput`, `deriveOrigin`, `diffCreatures`, `formatDestinationCsv`, `formatChangeLog` from `lib.js` (Tasks 2-4).
- Produces: `parseArgs(argv: string[]): { input: string, destination: string }` — reads `--input <path>` (required, throws `--input <path> is required` if absent) and `--destination <path>` (optional, defaults to `path.join('extract', 'csv', 'creatures.csv')`).
- Produces: `run({ inputPath: string, destinationPath: string }): { summary: string, warnings: string[] }` — does the file I/O and returns a result; throws `input file not found: <path>` or `destination directory not found: <dir>` for the two fatal cases. This is the function the `SKILL.md` (Task 6) describes indirectly via the CLI's `--input`/`--destination` flags.
- Produces: `main(): void` — reads `process.argv`, calls `parseArgs` + `run`, prints warnings to stderr and the summary to stdout, sets `process.exitCode = 1` and prints `Error: <message>` to stderr on a thrown error. Runs automatically when the file is executed directly (`require.main === module`).

- [ ] **Step 1: Write the failing tests**

Create `plugins/weidu/skills/extractCreatures/scripts/extract-creatures.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseArgs, run } = require('./extract-creatures');

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'extract-creatures-'));
}

test('parseArgs requires --input', () => {
  assert.throws(() => parseArgs([]), /--input/);
});

test('parseArgs defaults destination to extract/csv/creatures.csv', () => {
  const { destination } = parseArgs(['--input', 'foo.csv']);
  assert.equal(destination, path.join('extract', 'csv', 'creatures.csv'));
});

test('parseArgs honors an explicit --destination', () => {
  const { input, destination } = parseArgs(['--input', 'foo.csv', '--destination', 'bar.csv']);
  assert.equal(input, 'foo.csv');
  assert.equal(destination, 'bar.csv');
});

test('run bootstraps an empty destination from a base extraction', () => {
  const dir = makeTmpDir();
  const inputPath = path.join(dir, 'base.csv');
  const destinationPath = path.join(dir, 'creatures.csv');
  fs.writeFileSync(inputPath,
    'file;name;general;race;class;anim;deathvar;dialog\n' +
    'AATAQAH;"Aataqah";GIANTHUMANOID;GENIE;GENIE_DJINNI;DJINNI;aataqah;aataqah\n');

  const { summary, warnings } = run({ inputPath, destinationPath });

  assert.deepEqual(warnings, []);
  assert.match(summary, /1 new creature\(s\) added \(origin=base\)/);
  const destText = fs.readFileSync(destinationPath, 'utf8');
  assert.match(destText, /AATAQAH;"Aataqah";GIANTHUMANOID;GENIE;GENIE_DJINNI;DJINNI;aataqah;aataqah;base/);
});

test('run appends a new creature with origin from the input filename', () => {
  const dir = makeTmpDir();
  const destinationPath = path.join(dir, 'creatures.csv');
  fs.writeFileSync(destinationPath,
    'file;name;general;race;class;anim;deathvar;dialog;origin\n' +
    'AATAQAH;"Aataqah";GIANTHUMANOID;GENIE;GENIE_DJINNI;DJINNI;aataqah;aataqah;base\n');
  const inputPath = path.join(dir, 'cdtweaks.csv');
  fs.writeFileSync(inputPath,
    'file;name;general;race;class;anim;deathvar;dialog\n' +
    'AATAQAH;"Aataqah";GIANTHUMANOID;GENIE;GENIE_DJINNI;DJINNI;aataqah;aataqah\n' +
    'NEWCRE01;"New Guy";HUMANOID;HUMAN;FIGHTER;MHM1;newcre01;newcre01\n');

  const { summary } = run({ inputPath, destinationPath });

  assert.match(summary, /1 new creature\(s\) added \(origin=cdtweaks\)/);
  assert.match(summary, /0 changed creature\(s\) logged$/);
  const destText = fs.readFileSync(destinationPath, 'utf8');
  assert.match(destText, /NEWCRE01;"New Guy";HUMANOID;HUMAN;FIGHTER;MHM1;newcre01;newcre01;cdtweaks/);
  assert.equal(fs.existsSync(path.join(dir, 'cdtweaks_changes.log')), false);
});

test('run logs a changed creature without touching the destination row', () => {
  const dir = makeTmpDir();
  const destinationPath = path.join(dir, 'creatures.csv');
  const originalLine = 'AATAQAH;"Aataqah";GIANTHUMANOID;GENIE;GENIE_DJINNI;DJINNI;aataqah;aataqah;base';
  fs.writeFileSync(destinationPath,
    `file;name;general;race;class;anim;deathvar;dialog;origin\n${originalLine}\n`);
  const inputPath = path.join(dir, 'cdtweaks.csv');
  fs.writeFileSync(inputPath,
    'file;name;general;race;class;anim;deathvar;dialog\n' +
    'AATAQAH;"Aataqah";GIANTHUMANOID;GENIE;GENIE_EFREET;DJINNI;aataqah;aataqah\n');

  const { summary } = run({ inputPath, destinationPath });

  assert.match(summary, /0 new creature\(s\) added \(origin=cdtweaks\)/);
  assert.match(summary, /1 changed creature\(s\) logged to .*cdtweaks_changes\.log/);
  const destText = fs.readFileSync(destinationPath, 'utf8');
  assert.ok(destText.includes(originalLine));
  const logText = fs.readFileSync(path.join(dir, 'cdtweaks_changes.log'), 'utf8');
  assert.equal(logText, 'AATAQAH\n  class: GENIE_DJINNI -> GENIE_EFREET\n');
});

test('run skips a malformed row with a warning and still processes the rest', () => {
  const dir = makeTmpDir();
  const destinationPath = path.join(dir, 'creatures.csv');
  fs.writeFileSync(destinationPath, 'file;name;general;race;class;anim;deathvar;dialog;origin\n');
  const inputPath = path.join(dir, 'cdtweaks.csv');
  fs.writeFileSync(inputPath,
    'file;name;general;race;class;anim;deathvar;dialog\n' +
    'BADROW;"Oops";ONLYTHREE\n' +
    'NEWCRE01;"New Guy";HUMANOID;HUMAN;FIGHTER;MHM1;newcre01;newcre01\n');

  const { summary, warnings } = run({ inputPath, destinationPath });

  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /:2:/);
  assert.match(summary, /1 new creature\(s\) added/);
});

test('run throws when the input file does not exist', () => {
  const dir = makeTmpDir();
  assert.throws(
    () => run({ inputPath: path.join(dir, 'missing.csv'), destinationPath: path.join(dir, 'creatures.csv') }),
    /input file not found/
  );
});

test('run throws when the destination directory does not exist', () => {
  const dir = makeTmpDir();
  const inputPath = path.join(dir, 'base.csv');
  fs.writeFileSync(inputPath, 'file;name;general;race;class;anim;deathvar;dialog\n');
  assert.throws(
    () => run({ inputPath, destinationPath: path.join(dir, 'nope', 'creatures.csv') }),
    /destination directory not found/
  );
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test plugins/weidu/skills/extractCreatures/scripts/extract-creatures.test.js`
Expected: FAIL — `Cannot find module './extract-creatures'` (file doesn't exist yet).

- [ ] **Step 3: Implement the minimal code to make the tests pass**

Create `plugins/weidu/skills/extractCreatures/scripts/extract-creatures.js`:

```js
#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const {
  parseDestination,
  parseInput,
  deriveOrigin,
  diffCreatures,
  formatDestinationCsv,
  formatChangeLog,
} = require('./lib');

function parseArgs(argv) {
  let input = null;
  let destination = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--input') {
      input = argv[++i];
    } else if (argv[i] === '--destination') {
      destination = argv[++i];
    }
  }
  if (!input) {
    throw new Error('--input <path> is required');
  }
  return {
    input,
    destination: destination || path.join('extract', 'csv', 'creatures.csv'),
  };
}

function run({ inputPath, destinationPath }) {
  if (!fs.existsSync(inputPath)) {
    throw new Error(`input file not found: ${inputPath}`);
  }
  const destinationDir = path.dirname(destinationPath);
  if (!fs.existsSync(destinationDir)) {
    throw new Error(`destination directory not found: ${destinationDir}`);
  }

  const origin = deriveOrigin(inputPath);
  const inputText = fs.readFileSync(inputPath, 'utf8');
  const destinationText = fs.existsSync(destinationPath)
    ? fs.readFileSync(destinationPath, 'utf8')
    : '';

  const destination = parseDestination(destinationText);
  const { rows: inputRows, warnings } = parseInput(inputText, inputPath);
  const { newRows, changedRows } = diffCreatures(inputRows, destination, origin);

  if (newRows.length > 0) {
    fs.writeFileSync(destinationPath, formatDestinationCsv(destination.rows, newRows));
  }

  let logPath = null;
  if (changedRows.length > 0) {
    logPath = path.join(destinationDir, `${origin}_changes.log`);
    fs.writeFileSync(logPath, formatChangeLog(origin, changedRows));
  }

  const summary = `${newRows.length} new creature(s) added (origin=${origin}), ` +
    `${changedRows.length} changed creature(s) logged` +
    (logPath ? ` to ${logPath}` : '');

  return { summary, warnings };
}

function main() {
  try {
    const { input, destination } = parseArgs(process.argv.slice(2));
    const { summary, warnings } = run({ inputPath: input, destinationPath: destination });
    for (const w of warnings) console.warn(w);
    console.log(summary);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = { parseArgs, run, main };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test plugins/weidu/skills/extractCreatures/scripts/extract-creatures.test.js`
Expected: PASS — 9 tests passing.

Then run the full suite to confirm nothing regressed: `node --test plugins/weidu/skills/extractCreatures/scripts/`
Expected: PASS — 26 tests passing (17 from `lib.test.js` + 9 from `extract-creatures.test.js`).

- [ ] **Step 5: Commit**

```bash
git add plugins/weidu/skills/extractCreatures/scripts/extract-creatures.js plugins/weidu/skills/extractCreatures/scripts/extract-creatures.test.js
git commit -m "feat(extractCreatures): add CLI entry point"
```

---

### Task 6: SKILL.md

**Files:**
- Create: `plugins/weidu/skills/extractCreatures/SKILL.md`

**Interfaces:**
- Consumes: the CLI documented in Task 5 — invocation `node <path>/scripts/extract-creatures.js --input <path> [--destination <path>]`, its summary output, and the `<origin>_changes.log` side effect.

- [ ] **Step 1: Write the skill file**

Create `plugins/weidu/skills/extractCreatures/SKILL.md`:

```markdown
---
name: extractCreatures
description: Use after installing a WeiDU/Infinity Engine mod, once its creature files have been re-extracted with the extract component, to merge new creatures into the master creatures.csv (tagged with the mod that added them) and flag any creature the mod changed without silently overwriting prior data.
---

# Merging Creature Extractions

## Overview

The `extract` WeiDU component dumps every `.cre` in `override/` to a semicolon-delimited CSV (`file;name;general;race;class;anim;deathvar;dialog`, only `name` quoted). Re-running it after each mod install produces a full snapshot of the current override folder — not just that mod's additions.

`scripts/extract-creatures.js` compares that fresh snapshot against the accumulating master list (`extract/csv/creatures.csv`, with an added `origin` column) so you know which mod introduced each creature, and flags anything a mod changed on a creature you already have without touching the master file.

## Procedure

1. Install the mod, then re-run the `extract` WeiDU component so its CSV output reflects the current `override/` folder.
2. Save/copy that output to a file named after the mod, e.g. `cdtweaks.csv` — the script derives the `origin` value from this filename (extension stripped), so the name matters.
3. Run: `node <plugin-path>/skills/extractCreatures/scripts/extract-creatures.js --input cdtweaks.csv --destination extract/csv/creatures.csv`
   (destination defaults to `extract/csv/creatures.csv` relative to the current directory if omitted).
4. Read the summary line:
   - New creatures are already appended to `creatures.csv` with `origin=cdtweaks`.
   - If any existing creature's fields changed, a `cdtweaks_changes.log` is written next to `creatures.csv` listing old vs. new values — `creatures.csv` itself is left untouched for those rows. Review the log and decide by hand how to reconcile it; the script never guesses.
5. To bootstrap `creatures.csv` from scratch, run the script once with your base/vanilla extraction as `--input` against an empty (or nonexistent) destination — every row is "new" and gets `origin=base`.

## Common Mistakes

- Reusing the same input filename across two different mods — the `origin` label and the change log name both come from that filename, so each mod's extraction needs its own distinct name.
- Expecting the script to resolve conflicting field values automatically — it never overwrites an existing destination row; that decision is manual.
```

- [ ] **Step 2: Verify the skill is discoverable**

Run: `node -e "console.log(require('fs').existsSync('plugins/weidu/skills/extractCreatures/SKILL.md'))"`
Expected: `true`

- [ ] **Step 3: Commit**

```bash
git add plugins/weidu/skills/extractCreatures/SKILL.md
git commit -m "docs(extractCreatures): add skill instructions"
```

---

## Final Verification

After Task 6, run the full test suite once more from the repo root:

Run: `node --test plugins/weidu/skills/extract-creatures/scripts/lib.test.js plugins/weidu/skills/extract-creatures/scripts/extract-creatures.test.js`
Expected: PASS, 0 failing. (`node --test` does not glob a directory reliably — pass explicit file paths.)

## Post-Review Amendment (2026-07-29)

The final whole-branch review (run against the user's real `base.csv`) found that the WeiDU `extract` component emits creature names with raw, unescaped embedded quotes (e.g. `Bertrand the "Companion"`), which this plan's original `splitCsvLine`/`joinCsvLine` design (RFC-4180-style `""` escaping) could not parse without corruption. The fix, applied after Task 6:

- `extract.tp2` (outside this repo, in the game install) was changed to print `name` as the **last**, unquoted column: `file;general;race;class;anim;deathvar;dialog;name`.
- The destination format became `file;general;race;class;anim;deathvar;dialog;origin;name` (origin before name, name still last).
- `splitCsvLine`/`joinCsvLine` were redesigned around positional reconstruction (any extra `;`-split pieces merge back into the last field) instead of quote-state parsing.
- Destination/change-log output now writes CRLF (`\r\n`) to match WeiDU's own line endings.
- The CLI deletes a stale `<origin>_changes.log` when a previously-flagged change no longer applies.
- The skill was renamed from `extractCreatures` to `extract-creatures` (kebab-case, matching the sibling `check-mod-versions` skill).

See the final-review fix commits on top of Task 6 for the actual diff. This amendment is documentation only — task numbering above reflects the original plan as executed, not this later revision.
