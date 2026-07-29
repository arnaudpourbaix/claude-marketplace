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
