const test = require('node:test');
const assert = require('node:assert/strict');
const {
  splitCsvLine,
  joinCsvLine,
  parseDestination,
  parseInput,
  diffCreatures,
  formatDestinationCsv,
  formatChangeLog,
} = require('./lib');

test('splitCsvLine splits a line with exactly the expected field count', () => {
  const result = splitCsvLine('AATAQAH;GIANTHUMANOID;GENIE', 3);
  assert.deepEqual(result, ['AATAQAH', 'GIANTHUMANOID', 'GENIE']);
});

test('splitCsvLine merges an extra semicolon-separated piece (e.g. an embedded quote) into the last field', () => {
  const result = splitCsvLine('AATAQAH;GENIE;Bertrand the "Companion"', 3);
  assert.deepEqual(result, ['AATAQAH', 'GENIE', 'Bertrand the "Companion"']);
});

test('splitCsvLine merges pieces split on an embedded semicolon in the last field', () => {
  const result = splitCsvLine('AATAQAH;GENIE;Name; With; Semicolons', 3);
  assert.deepEqual(result, ['AATAQAH', 'GENIE', 'Name; With; Semicolons']);
});

test('splitCsvLine returns fewer fields than expected unchanged, for malformed-row detection', () => {
  const result = splitCsvLine('AATAQAH;GENIE', 3);
  assert.deepEqual(result, ['AATAQAH', 'GENIE']);
});

test('splitCsvLine without a fieldCount just splits on semicolon', () => {
  const result = splitCsvLine('AATAQAH;GENIE;Aataqah');
  assert.deepEqual(result, ['AATAQAH', 'GENIE', 'Aataqah']);
});

test('joinCsvLine joins fields with semicolons, unquoted', () => {
  const result = joinCsvLine(['AATAQAH', 'GENIE', 'Bertrand the "Companion"']);
  assert.equal(result, 'AATAQAH;GENIE;Bertrand the "Companion"');
});

test('parseDestination returns no rows for an empty string', () => {
  const { rows, byFile } = parseDestination('');
  assert.deepEqual(rows, []);
  assert.equal(byFile.size, 0);
});

test('parseDestination returns no rows for header-only text', () => {
  const { rows } = parseDestination('file;general;race;class;anim;deathvar;dialog;origin;name\r\n');
  assert.deepEqual(rows, []);
});

test('parseDestination parses a data row with an embedded quote in name, indexed by file', () => {
  const text = 'file;general;race;class;anim;deathvar;dialog;origin;name\r\n' +
    'BERTRAND;HUMANOID;HUMAN;FIGHTER;MHM1;bertrand;bertrand;base;Bertrand the "Companion"\r\n';
  const { rows, byFile } = parseDestination(text);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, 'Bertrand the "Companion"');
  assert.equal(byFile.get('BERTRAND').origin, 'base');
});

test('parseDestination skips a malformed row without throwing, even after a blank line', () => {
  const text = 'file;general;race;class;anim;deathvar;dialog;origin;name\r\n' +
    'AAA;G;R;C;ANIM;DV;DLG;base;A\r\n' +
    '\r\n' +
    'BADROW;ONLYTHREE\r\n';
  const { rows } = parseDestination(text);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].file, 'AAA');
});

test('parseInput parses a data row without an origin column, name last', () => {
  const text = 'file;general;race;class;anim;deathvar;dialog;name\r\n' +
    'AATAQAH;GIANTHUMANOID;GENIE;GENIE_DJINNI;DJINNI;aataqah;aataqah;Aataqah\r\n';
  const { rows, warnings } = parseInput(text, 'test.csv');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].file, 'AATAQAH');
  assert.equal(rows[0].name, 'Aataqah');
  assert.deepEqual(warnings, []);
});

test('parseInput preserves a name containing an unescaped embedded quote', () => {
  const text = 'file;general;race;class;anim;deathvar;dialog;name\r\n' +
    'BERTRAND;HUMANOID;HUMAN;FIGHTER;MHM1;bertrand;bertrand;Bertrand the "Companion"\r\n';
  const { rows, warnings } = parseInput(text, 'test.csv');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, 'Bertrand the "Companion"');
  assert.deepEqual(warnings, []);
});

test('parseInput warns and skips a repeated header line appearing mid-file', () => {
  const text = 'file;general;race;class;anim;deathvar;dialog;name\r\n' +
    'AATAQAH;GIANTHUMANOID;GENIE;GENIE_DJINNI;DJINNI;aataqah;aataqah;Aataqah\r\n' +
    'file;general;race;class;anim;deathvar;dialog;name\r\n' +
    'BERTRAND;HUMANOID;HUMAN;FIGHTER;MHM1;bertrand;bertrand;Bertrand\r\n';
  const { rows, warnings } = parseInput(text, 'test.csv');
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.file), ['AATAQAH', 'BERTRAND']);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /test\.csv:3: repeated header line/);
});

test('parseInput warns and skips a row with too few columns', () => {
  const text = 'file;general;race;class;anim;deathvar;dialog;name\r\n' +
    'BADROW;ONLYTWO\r\n';
  const { rows, warnings } = parseInput(text, 'test.csv');
  assert.equal(rows.length, 0);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /test\.csv:2/);
});

test('parseInput reports the correct line number even when a blank line precedes a malformed row', () => {
  const text = 'file;general;race;class;anim;deathvar;dialog;name\r\n' +
    'AAA;G;R;C;ANIM;DV;DLG;A\r\n' +
    '\r\n' +
    'BADROW;ONLYTWO\r\n';
  const { rows, warnings } = parseInput(text, 'test.csv');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].file, 'AAA');
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /test\.csv:4/);
});

test('diffCreatures treats a file missing from destination as new, tagged with origin', () => {
  const destination = parseDestination('');
  const { rows: inputRows } = parseInput(
    'file;general;race;class;anim;deathvar;dialog;name\r\n' +
    'AATAQAH;GIANTHUMANOID;GENIE;GENIE_DJINNI;DJINNI;aataqah;aataqah;Aataqah\r\n',
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
    'file;general;race;class;anim;deathvar;dialog;origin;name\r\n' +
    'AATAQAH;GIANTHUMANOID;GENIE;GENIE_DJINNI;DJINNI;aataqah;aataqah;base;Aataqah\r\n'
  );
  const { rows: inputRows } = parseInput(
    'file;general;race;class;anim;deathvar;dialog;name\r\n' +
    'AATAQAH;GIANTHUMANOID;GENIE;GENIE_EFREET;DJINNI;aataqah;aataqah;Aataqah\r\n',
    'cdtweaks.csv'
  );
  const { newRows, changedRows } = diffCreatures(inputRows, destination, 'cdtweaks');
  assert.deepEqual(newRows, []);
  assert.equal(changedRows.length, 1);
  assert.deepEqual(changedRows[0].changes, [
    { field: 'class', oldValue: 'GENIE_DJINNI', newValue: 'GENIE_EFREET' },
  ]);
  assert.equal(destination.byFile.get('AATAQAH').class, 'GENIE_DJINNI');
  assert.equal(changedRows[0].updatedRow.class, 'GENIE_EFREET');
  assert.equal(changedRows[0].updatedRow.origin, 'cdtweaks');
});

test('diffCreatures ignores a name-only difference — name is not a compared field', () => {
  const destination = parseDestination(
    'file;general;race;class;anim;deathvar;dialog;origin;name\r\n' +
    'AATAQAH;GIANTHUMANOID;GENIE;GENIE_DJINNI;DJINNI;aataqah;aataqah;base;Aataqah\r\n'
  );
  const { rows: inputRows } = parseInput(
    'file;general;race;class;anim;deathvar;dialog;name\r\n' +
    'AATAQAH;GIANTHUMANOID;GENIE;GENIE_DJINNI;DJINNI;aataqah;aataqah;Renamed Aataqah\r\n',
    'cdtweaks.csv'
  );
  const { newRows, changedRows } = diffCreatures(inputRows, destination, 'cdtweaks');
  assert.deepEqual(newRows, []);
  assert.deepEqual(changedRows, []);
});

test('diffCreatures ignores a row that matches destination exactly', () => {
  const csv = 'file;general;race;class;anim;deathvar;dialog;origin;name\r\n' +
    'AATAQAH;GIANTHUMANOID;GENIE;GENIE_DJINNI;DJINNI;aataqah;aataqah;base;Aataqah\r\n';
  const destination = parseDestination(csv);
  const { rows: inputRows } = parseInput(
    'file;general;race;class;anim;deathvar;dialog;name\r\n' +
    'AATAQAH;GIANTHUMANOID;GENIE;GENIE_DJINNI;DJINNI;aataqah;aataqah;Aataqah\r\n',
    'cdtweaks.csv'
  );
  const { newRows, changedRows } = diffCreatures(inputRows, destination, 'cdtweaks');
  assert.deepEqual(newRows, []);
  assert.deepEqual(changedRows, []);
});

test('formatDestinationCsv writes the header, existing rows, then new rows, CRLF-joined, name last unquoted', () => {
  const existingRows = [{
    file: 'AATAQAH', general: 'GIANTHUMANOID', race: 'GENIE',
    class: 'GENIE_DJINNI', anim: 'DJINNI', deathvar: 'aataqah', dialog: 'aataqah', origin: 'base', name: 'Aataqah',
  }];
  const newRows = [{
    file: 'BERTRAND', general: 'HUMANOID', race: 'HUMAN',
    class: 'FIGHTER', anim: 'MHM1', deathvar: 'bertrand', dialog: 'bertrand', origin: 'cdtweaks', name: 'Bertrand the "Companion"',
  }];
  const text = formatDestinationCsv(existingRows, newRows);
  const lines = text.split('\r\n');
  assert.equal(lines[0], 'file;general;race;class;anim;deathvar;dialog;origin;name');
  assert.equal(lines[1], 'AATAQAH;GIANTHUMANOID;GENIE;GENIE_DJINNI;DJINNI;aataqah;aataqah;base;Aataqah');
  assert.equal(lines[2], 'BERTRAND;HUMANOID;HUMAN;FIGHTER;MHM1;bertrand;bertrand;cdtweaks;Bertrand the "Companion"');
  assert.equal(lines[3], '');
});

test('formatChangeLog renders one block per changed creature with old -> new values, CRLF-joined', () => {
  const changedRows = [{
    file: 'AATAQAH',
    changes: [{ field: 'class', oldValue: 'GENIE_DJINNI', newValue: 'GENIE_EFREET' }],
  }];
  const text = formatChangeLog('cdtweaks', changedRows);
  assert.equal(text, 'AATAQAH\r\n  class: GENIE_DJINNI -> GENIE_EFREET\r\n');
});

test('formatChangeLog separates multiple changed creatures with a blank line', () => {
  const changedRows = [
    { file: 'AATAQAH', changes: [{ field: 'class', oldValue: 'A', newValue: 'B' }] },
    { file: 'ABAZIGAL', changes: [{ field: 'anim', oldValue: 'X', newValue: 'Y' }] },
  ];
  const text = formatChangeLog('cdtweaks', changedRows);
  assert.equal(text, 'AATAQAH\r\n  class: A -> B\r\n\r\nABAZIGAL\r\n  anim: X -> Y\r\n');
});
