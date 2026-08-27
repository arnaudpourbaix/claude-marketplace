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

test('parseArgs defaults --source and --history to null and honors them when given', () => {
  const bare = parseArgs(['--origin', 'cdtweaks']);
  assert.equal(bare.source, null);
  assert.equal(bare.history, null);
  const full = parseArgs(['--origin', 'cdtweaks', '--source', 'snap.csv', '--history', 'hist']);
  assert.equal(full.source, 'snap.csv');
  assert.equal(full.history, 'hist');
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
  const snapshot = path.join(dir, 'history', '001_base.csv');
  assert.equal(fs.existsSync(snapshot), true);
  assert.equal(fs.readFileSync(snapshot, 'utf8'), fs.readFileSync(path.join(dir, 'source.csv'), 'utf8'));
  assert.equal(fs.existsSync(path.join(dir, 'history', '001_base_changes.log')), false);
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
  assert.match(summary, /0 changed creature\(s\) applied;/);
  const destText = fs.readFileSync(destinationPath, 'utf8');
  assert.match(destText, /BERTRAND;HUMANOID;HUMAN;FIGHTER;MHM1;bertrand;bertrand;cdtweaks;Bertrand the "Companion"\r\n/);
  const logText = fs.readFileSync(path.join(dir, 'history', '001_cdtweaks_changes.log'), 'utf8');
  assert.equal(logText, 'cdtweaks: 1 new, 0 changed\r\n\r\nNEW (1):\r\n  BERTRAND\r\n');
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
  assert.match(summary, /1 changed creature\(s\) applied;.*change log .*001_cdtweaks_changes\.log/);
  const destText = fs.readFileSync(destinationPath, 'utf8');
  assert.match(destText, /AATAQAH;GIANTHUMANOID;GENIE;GENIE_EFREET;DJINNI;aataqah;aataqah;cdtweaks;Aataqah\r\n/);
  assert.ok(!destText.includes(';base;'));
  const logText = fs.readFileSync(path.join(dir, 'history', '001_cdtweaks_changes.log'), 'utf8');
  assert.equal(logText,
    'cdtweaks: 0 new, 1 changed\r\n\r\nCHANGED (1):\r\n  AATAQAH\r\n    class: GENIE_DJINNI -> GENIE_EFREET\r\n');
});

test('run writes a history log listing added resrefs for a mod that only adds creatures', () => {
  const dir = makeTmpDir();
  const destinationPath = path.join(dir, 'creatures.csv');
  fs.writeFileSync(destinationPath,
    'file;general;race;class;anim;deathvar;dialog;origin;name\r\n' +
    'AATAQAH;GIANTHUMANOID;GENIE;GENIE_DJINNI;DJINNI;aataqah;aataqah;bg1;Aataqah\r\n');
  fs.writeFileSync(path.join(dir, 'source.csv'),
    'file;general;race;class;anim;deathvar;dialog;name\r\n' +
    'AATAQAH;GIANTHUMANOID;GENIE;GENIE_DJINNI;DJINNI;aataqah;aataqah;Aataqah\r\n' +
    'ACGNOLL1;HUMANOID;GNOLL;FIGHTER;GNOLL;acgnoll1;acgnoll1;Gnoll Chieftain\r\n' +
    'ACGNOLL2;HUMANOID;GNOLL;FIGHTER;GNOLL;acgnoll2;acgnoll2;Gnoll Bodyguard\r\n');

  const { summary } = run({ origin: 'ac_quest', destinationPath });

  assert.match(summary, /2 new creature\(s\) added \(origin=ac_quest\)/);
  const logText = fs.readFileSync(path.join(dir, 'history', '001_ac_quest_changes.log'), 'utf8');
  assert.equal(logText, 'ac_quest: 2 new, 0 changed\r\n\r\nNEW (2):\r\n  ACGNOLL1\r\n  ACGNOLL2\r\n');
});

test('run keeps a prior history change log untouched on a later clean re-run', () => {
  const dir = makeTmpDir();
  const destinationPath = path.join(dir, 'creatures.csv');
  fs.writeFileSync(destinationPath,
    'file;general;race;class;anim;deathvar;dialog;origin;name\r\n' +
    'AATAQAH;GIANTHUMANOID;GENIE;GENIE_EFREET;DJINNI;aataqah;aataqah;base;Aataqah\r\n');
  const priorLog = path.join(dir, 'history', '001_cdtweaks_changes.log');
  fs.mkdirSync(path.dirname(priorLog), { recursive: true });
  fs.writeFileSync(priorLog, 'AATAQAH\r\n  class: GENIE_DJINNI -> GENIE_EFREET\r\n');
  fs.writeFileSync(path.join(dir, 'history', '001_cdtweaks.csv'), 'old snapshot\r\n');
  fs.writeFileSync(path.join(dir, 'source.csv'),
    'file;general;race;class;anim;deathvar;dialog;name\r\n' +
    'AATAQAH;GIANTHUMANOID;GENIE;GENIE_EFREET;DJINNI;aataqah;aataqah;Aataqah\r\n');

  const { summary } = run({ origin: 'cdtweaks', destinationPath });

  assert.match(summary, /0 changed creature\(s\) applied;/);
  assert.equal(fs.existsSync(priorLog), true);
  // the clean re-run still writes its own snapshot under the next number
  assert.equal(fs.existsSync(path.join(dir, 'history', '002_cdtweaks.csv')), true);
  assert.equal(fs.existsSync(path.join(dir, 'history', '002_cdtweaks_changes.log')), false);
});

test('run reads the extraction from an explicit --source snapshot', () => {
  const dir = makeTmpDir();
  const destinationPath = path.join(dir, 'creatures.csv');
  const snapDir = makeTmpDir();
  const sourcePath = path.join(snapDir, 'source.csv.snapshot');
  fs.writeFileSync(sourcePath,
    '\r\nfile;general;race;class;anim;deathvar;dialog;name\r\n' +
    'AATAQAH;GIANTHUMANOID;GENIE;GENIE_DJINNI;DJINNI;aataqah;aataqah;Aataqah\r\n');

  const { summary, warnings } = run({ origin: 'base', destinationPath, sourcePath });

  assert.deepEqual(warnings, []);
  assert.match(summary, /1 new creature\(s\) added \(origin=base\)/);
  assert.equal(fs.existsSync(path.join(dir, 'history', '001_base.csv')), true);
});

test('run migrates a narrower existing destination to the current column set', () => {
  const dir = makeTmpDir();
  const destinationPath = path.join(dir, 'creatures.csv');
  fs.writeFileSync(destinationPath,
    'file;general;race;class;anim;deathvar;dialog;origin;name\r\n' +
    'AATAQAH;GIANTHUMANOID;GENIE;GENIE_DJINNI;DJINNI;aataqah;aataqah;base;Aataqah\r\n');
  fs.writeFileSync(path.join(dir, 'source.csv'),
    'file;general;race;class;anim;deathvar;dialog;xpv;name\r\n' +
    'AATAQAH;GIANTHUMANOID;GENIE;GENIE_DJINNI;DJINNI;aataqah;aataqah;1400;Aataqah\r\n');

  const { summary } = run({ origin: 'stratagems', destinationPath });

  assert.match(summary, /destination migrated to 10 columns/);
  const destText = fs.readFileSync(destinationPath, 'utf8');
  assert.equal(destText.split('\r\n')[0], 'file;general;race;class;anim;deathvar;dialog;xpv;origin;name');
  assert.match(destText, /AATAQAH;GIANTHUMANOID;GENIE;GENIE_DJINNI;DJINNI;aataqah;aataqah;1400;base;Aataqah\r\n/);
});

test('run numbers history snapshots incrementally across mods', () => {
  const dir = makeTmpDir();
  const destinationPath = path.join(dir, 'creatures.csv');
  fs.writeFileSync(path.join(dir, 'source.csv'),
    'file;general;race;class;anim;deathvar;dialog;name\r\n' +
    'AATAQAH;GIANTHUMANOID;GENIE;GENIE_DJINNI;DJINNI;aataqah;aataqah;Aataqah\r\n');
  run({ origin: 'base', destinationPath });
  run({ origin: 'cdtweaks', destinationPath });
  run({ origin: 'stratagems', destinationPath });
  run({ origin: 'stratagems', destinationPath });

  const names = fs.readdirSync(path.join(dir, 'history')).sort();
  assert.deepEqual(names, ['001_base.csv', '002_cdtweaks.csv', '003_stratagems.csv', '004_stratagems.csv']);
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
