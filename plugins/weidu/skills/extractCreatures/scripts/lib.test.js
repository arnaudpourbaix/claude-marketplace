const test = require('node:test');
const assert = require('node:assert/strict');
const { splitCsvLine, joinCsvLine, parseDestination, parseInput, deriveOrigin } = require('./lib');

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

test('parseInput reports correct line number even when blank lines precede a malformed row', () => {
  const text = 'file;name;general;race;class;anim;deathvar;dialog\nAAA;"A";G;R;C;ANIM;DV;DLG\n\nBADROW;"Oops";ONLYTHREE\n';
  const { rows, warnings } = parseInput(text, 'test.csv');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].file, 'AAA');
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /test\.csv:4/);
});

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
