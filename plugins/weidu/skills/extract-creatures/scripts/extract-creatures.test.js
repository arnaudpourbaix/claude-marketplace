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

test('run bootstraps an empty destination from a base extraction, writing CRLF', () => {
  const dir = makeTmpDir();
  const inputPath = path.join(dir, 'base.csv');
  const destinationPath = path.join(dir, 'creatures.csv');
  fs.writeFileSync(inputPath,
    'file;general;race;class;anim;deathvar;dialog;name\r\n' +
    'AATAQAH;GIANTHUMANOID;GENIE;GENIE_DJINNI;DJINNI;aataqah;aataqah;Aataqah\r\n');

  const { summary, warnings } = run({ inputPath, destinationPath });

  assert.deepEqual(warnings, []);
  assert.match(summary, /1 new creature\(s\) added \(origin=base\)/);
  const destText = fs.readFileSync(destinationPath, 'utf8');
  assert.match(destText, /AATAQAH;GIANTHUMANOID;GENIE;GENIE_DJINNI;DJINNI;aataqah;aataqah;base;Aataqah\r\n/);
});

test('run appends a new creature with origin from the input filename, preserving an embedded quote in the name', () => {
  const dir = makeTmpDir();
  const destinationPath = path.join(dir, 'creatures.csv');
  fs.writeFileSync(destinationPath,
    'file;general;race;class;anim;deathvar;dialog;origin;name\r\n' +
    'AATAQAH;GIANTHUMANOID;GENIE;GENIE_DJINNI;DJINNI;aataqah;aataqah;base;Aataqah\r\n');
  const inputPath = path.join(dir, 'cdtweaks.csv');
  fs.writeFileSync(inputPath,
    'file;general;race;class;anim;deathvar;dialog;name\r\n' +
    'AATAQAH;GIANTHUMANOID;GENIE;GENIE_DJINNI;DJINNI;aataqah;aataqah;Aataqah\r\n' +
    'BERTRAND;HUMANOID;HUMAN;FIGHTER;MHM1;bertrand;bertrand;Bertrand the "Companion"\r\n');

  const { summary } = run({ inputPath, destinationPath });

  assert.match(summary, /1 new creature\(s\) added \(origin=cdtweaks\)/);
  assert.match(summary, /0 changed creature\(s\) logged$/);
  const destText = fs.readFileSync(destinationPath, 'utf8');
  assert.match(destText, /BERTRAND;HUMANOID;HUMAN;FIGHTER;MHM1;bertrand;bertrand;cdtweaks;Bertrand the "Companion"\r\n/);
  assert.equal(fs.existsSync(path.join(dir, 'cdtweaks_changes.log')), false);
});

test('run logs a changed creature without touching the destination row', () => {
  const dir = makeTmpDir();
  const destinationPath = path.join(dir, 'creatures.csv');
  const originalLine = 'AATAQAH;GIANTHUMANOID;GENIE;GENIE_DJINNI;DJINNI;aataqah;aataqah;base;Aataqah';
  fs.writeFileSync(destinationPath,
    `file;general;race;class;anim;deathvar;dialog;origin;name\r\n${originalLine}\r\n`);
  const inputPath = path.join(dir, 'cdtweaks.csv');
  fs.writeFileSync(inputPath,
    'file;general;race;class;anim;deathvar;dialog;name\r\n' +
    'AATAQAH;GIANTHUMANOID;GENIE;GENIE_EFREET;DJINNI;aataqah;aataqah;Aataqah\r\n');

  const { summary } = run({ inputPath, destinationPath });

  assert.match(summary, /0 new creature\(s\) added \(origin=cdtweaks\)/);
  assert.match(summary, /1 changed creature\(s\) logged to .*cdtweaks_changes\.log/);
  const destText = fs.readFileSync(destinationPath, 'utf8');
  assert.ok(destText.includes(originalLine));
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
  const inputPath = path.join(dir, 'cdtweaks.csv');
  fs.writeFileSync(inputPath,
    'file;general;race;class;anim;deathvar;dialog;name\r\n' +
    'AATAQAH;GIANTHUMANOID;GENIE;GENIE_EFREET;DJINNI;aataqah;aataqah;Aataqah\r\n');

  const { summary } = run({ inputPath, destinationPath });

  assert.match(summary, /0 changed creature\(s\) logged$/);
  assert.equal(fs.existsSync(staleLogPath), false);
});

test('run skips a malformed row with a warning and still processes the rest', () => {
  const dir = makeTmpDir();
  const destinationPath = path.join(dir, 'creatures.csv');
  fs.writeFileSync(destinationPath, 'file;general;race;class;anim;deathvar;dialog;origin;name\r\n');
  const inputPath = path.join(dir, 'cdtweaks.csv');
  fs.writeFileSync(inputPath,
    'file;general;race;class;anim;deathvar;dialog;name\r\n' +
    'BADROW;ONLYTWO\r\n' +
    'NEWCRE01;HUMANOID;HUMAN;FIGHTER;MHM1;newcre01;newcre01;New Guy\r\n');

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
  fs.writeFileSync(inputPath, 'file;general;race;class;anim;deathvar;dialog;name\r\n');
  assert.throws(
    () => run({ inputPath, destinationPath: path.join(dir, 'nope', 'creatures.csv') }),
    /destination directory not found/
  );
});
