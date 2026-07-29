const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseArgs, run } = require('./extract-creatures');

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'extract-creatures-'));
}

test('parseArgs requires --origin', () => {
  assert.throws(() => parseArgs([]), /--origin/);
});

test('parseArgs defaults destination to extract/csv/creatures.csv', () => {
  const { destination } = parseArgs(['--origin', 'cdtweaks']);
  assert.equal(destination, path.join('extract', 'csv', 'creatures.csv'));
});

test('parseArgs honors an explicit --destination', () => {
  const { origin, destination } = parseArgs(['--origin', 'cdtweaks', '--destination', 'bar.csv']);
  assert.equal(origin, 'cdtweaks');
  assert.equal(destination, 'bar.csv');
});

test('run bootstraps an empty destination from a base extraction, writing CRLF', () => {
  const dir = makeTmpDir();
  const destinationPath = path.join(dir, 'creatures.csv');
  fs.writeFileSync(path.join(dir, 'source.csv'),
    'file;general;race;class;anim;deathvar;dialog;name\r\n' +
    'AATAQAH;GIANTHUMANOID;GENIE;GENIE_DJINNI;DJINNI;aataqah;aataqah;Aataqah\r\n');

  const { summary, warnings } = run({ origin: 'base', destinationPath });

  assert.deepEqual(warnings, []);
  assert.match(summary, /1 new creature\(s\) added \(origin=base\)/);
  const destText = fs.readFileSync(destinationPath, 'utf8');
  assert.match(destText, /AATAQAH;GIANTHUMANOID;GENIE;GENIE_DJINNI;DJINNI;aataqah;aataqah;base;Aataqah\r\n/);
});

test('run appends a new creature with the given origin, preserving an embedded quote in the name', () => {
  const dir = makeTmpDir();
  const destinationPath = path.join(dir, 'creatures.csv');
  fs.writeFileSync(destinationPath,
    'file;general;race;class;anim;deathvar;dialog;origin;name\r\n' +
    'AATAQAH;GIANTHUMANOID;GENIE;GENIE_DJINNI;DJINNI;aataqah;aataqah;base;Aataqah\r\n');
  fs.writeFileSync(path.join(dir, 'source.csv'),
    'file;general;race;class;anim;deathvar;dialog;name\r\n' +
    'AATAQAH;GIANTHUMANOID;GENIE;GENIE_DJINNI;DJINNI;aataqah;aataqah;Aataqah\r\n' +
    'BERTRAND;HUMANOID;HUMAN;FIGHTER;MHM1;bertrand;bertrand;Bertrand the "Companion"\r\n');

  const { summary } = run({ origin: 'cdtweaks', destinationPath });

  assert.match(summary, /1 new creature\(s\) added \(origin=cdtweaks\)/);
  assert.match(summary, /0 changed creature\(s\) applied and logged$/);
  const destText = fs.readFileSync(destinationPath, 'utf8');
  assert.match(destText, /BERTRAND;HUMANOID;HUMAN;FIGHTER;MHM1;bertrand;bertrand;cdtweaks;Bertrand the "Companion"\r\n/);
  assert.equal(fs.existsSync(path.join(dir, 'cdtweaks_changes.log')), false);
});

test('run applies a changed creature to the destination row (new origin, new value) and logs the change', () => {
  const dir = makeTmpDir();
  const destinationPath = path.join(dir, 'creatures.csv');
  fs.writeFileSync(destinationPath,
    'file;general;race;class;anim;deathvar;dialog;origin;name\r\n' +
    'AATAQAH;GIANTHUMANOID;GENIE;GENIE_DJINNI;DJINNI;aataqah;aataqah;base;Aataqah\r\n');
  fs.writeFileSync(path.join(dir, 'source.csv'),
    'file;general;race;class;anim;deathvar;dialog;name\r\n' +
    'AATAQAH;GIANTHUMANOID;GENIE;GENIE_EFREET;DJINNI;aataqah;aataqah;Aataqah\r\n');

  const { summary } = run({ origin: 'cdtweaks', destinationPath });

  assert.match(summary, /0 new creature\(s\) added \(origin=cdtweaks\)/);
  assert.match(summary, /1 changed creature\(s\) applied and logged to .*cdtweaks_changes\.log/);
  const destText = fs.readFileSync(destinationPath, 'utf8');
  assert.match(destText, /AATAQAH;GIANTHUMANOID;GENIE;GENIE_EFREET;DJINNI;aataqah;aataqah;cdtweaks;Aataqah\r\n/);
  assert.ok(!destText.includes(';base;'));
  const logText = fs.readFileSync(path.join(dir, 'cdtweaks_changes.log'), 'utf8');
  assert.equal(logText, 'AATAQAH\r\n  class: GENIE_DJINNI -> GENIE_EFREET\r\n');
});

test('run removes a stale change log from a prior run once the change no longer applies', () => {
  const dir = makeTmpDir();
  const destinationPath = path.join(dir, 'creatures.csv');
  fs.writeFileSync(destinationPath,
    'file;general;race;class;anim;deathvar;dialog;origin;name\r\n' +
    'AATAQAH;GIANTHUMANOID;GENIE;GENIE_EFREET;DJINNI;aataqah;aataqah;base;Aataqah\r\n');
  const staleLogPath = path.join(dir, 'cdtweaks_changes.log');
  fs.writeFileSync(staleLogPath, 'AATAQAH\r\n  class: GENIE_DJINNI -> GENIE_EFREET\r\n');
  fs.writeFileSync(path.join(dir, 'source.csv'),
    'file;general;race;class;anim;deathvar;dialog;name\r\n' +
    'AATAQAH;GIANTHUMANOID;GENIE;GENIE_EFREET;DJINNI;aataqah;aataqah;Aataqah\r\n');

  const { summary } = run({ origin: 'cdtweaks', destinationPath });

  assert.match(summary, /0 changed creature\(s\) applied and logged$/);
  assert.equal(fs.existsSync(staleLogPath), false);
});

test('run skips a malformed row with a warning and still processes the rest', () => {
  const dir = makeTmpDir();
  const destinationPath = path.join(dir, 'creatures.csv');
  fs.writeFileSync(destinationPath, 'file;general;race;class;anim;deathvar;dialog;origin;name\r\n');
  fs.writeFileSync(path.join(dir, 'source.csv'),
    'file;general;race;class;anim;deathvar;dialog;name\r\n' +
    'BADROW;ONLYTWO\r\n' +
    'NEWCRE01;HUMANOID;HUMAN;FIGHTER;MHM1;newcre01;newcre01;New Guy\r\n');

  const { summary, warnings } = run({ origin: 'cdtweaks', destinationPath });

  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /:2:/);
  assert.match(summary, /1 new creature\(s\) added/);
});

test('run throws when source.csv does not exist next to the destination', () => {
  const dir = makeTmpDir();
  assert.throws(
    () => run({ origin: 'cdtweaks', destinationPath: path.join(dir, 'creatures.csv') }),
    /input file not found/
  );
});

test('run throws when the destination directory does not exist', () => {
  const dir = makeTmpDir();
  assert.throws(
    () => run({ origin: 'base', destinationPath: path.join(dir, 'nope', 'creatures.csv') }),
    /destination directory not found/
  );
});
