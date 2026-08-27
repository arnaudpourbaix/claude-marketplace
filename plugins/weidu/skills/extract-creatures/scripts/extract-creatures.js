#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const {
  deriveDestinationColumns,
  computeCompareFields,
  parseDestination,
  parseInput,
  migrateDestination,
  diffCreatures,
  formatDestinationCsv,
  formatChangeLog,
} = require('./lib');

function parseArgs(argv) {
  let origin = null;
  let destination = null;
  let source = null;
  let history = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--origin') {
      origin = argv[++i];
    } else if (argv[i] === '--destination') {
      destination = argv[++i];
    } else if (argv[i] === '--source') {
      source = argv[++i];
    } else if (argv[i] === '--history') {
      history = argv[++i];
    }
  }
  if (!origin) {
    throw new Error('--origin <name> is required');
  }
  return {
    origin,
    destination: destination || path.join('extract', 'csv', 'creatures.csv'),
    source,
    history,
  };
}

// Next global install number for the history folder: max leading integer across
// existing <n>_<mod>.csv snapshots, plus one. Zero-padded to 3 for sane sorting.
function nextHistorySequence(historyDir) {
  let max = 0;
  for (const name of fs.readdirSync(historyDir)) {
    const m = /^(\d+)_.*\.csv$/.exec(name);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  return max + 1;
}

function run({ origin, destinationPath, sourcePath, historyDir }) {
  const destinationDir = path.dirname(destinationPath);
  if (!fs.existsSync(destinationDir)) {
    throw new Error(`destination directory not found: ${destinationDir}`);
  }
  const inputPath = sourcePath || path.join(destinationDir, 'source.csv');
  if (!fs.existsSync(inputPath)) {
    throw new Error(`input file not found: ${inputPath}`);
  }

  const inputText = fs.readFileSync(inputPath, 'utf8');
  const destinationText = fs.existsSync(destinationPath)
    ? fs.readFileSync(destinationPath, 'utf8')
    : '';

  const { rows: inputRows, warnings, columns: inputColumns } = parseInput(inputText, inputPath);
  if (inputColumns.length < 2) {
    throw new Error(`input file has no usable header: ${inputPath}`);
  }

  const destination = parseDestination(destinationText);
  const originalDestColumns = destination.columns;
  const wantedColumns = deriveDestinationColumns(inputColumns);
  const keyField = inputColumns[0];

  const migrated = migrateDestination(destination, wantedColumns, inputRows, keyField);
  const compareFields = computeCompareFields(inputColumns, originalDestColumns);
  const { newRows, changedRows } = diffCreatures(inputRows, destination, origin, {
    keyField,
    compareFields,
  });

  if (migrated || newRows.length > 0 || changedRows.length > 0) {
    const updatedByFile = new Map(changedRows.map((c) => [c.file, c.updatedRow]));
    const updatedExistingRows = destination.rows.map((row) => updatedByFile.get(row[keyField]) || row);
    fs.writeFileSync(destinationPath, formatDestinationCsv(updatedExistingRows, newRows, wantedColumns));
  }

  const resolvedHistoryDir = historyDir || path.join(destinationDir, 'history');
  fs.mkdirSync(resolvedHistoryDir, { recursive: true });
  const seq = String(nextHistorySequence(resolvedHistoryDir)).padStart(3, '0');
  const historyCsvPath = path.join(resolvedHistoryDir, `${seq}_${origin}.csv`);
  fs.copyFileSync(inputPath, historyCsvPath);

  let historyLogPath = null;
  if (changedRows.length > 0) {
    historyLogPath = path.join(resolvedHistoryDir, `${seq}_${origin}_changes.log`);
    fs.writeFileSync(historyLogPath, formatChangeLog(origin, changedRows));
  }

  const summary = `${newRows.length} new creature(s) added (origin=${origin}), ` +
    `${changedRows.length} changed creature(s) applied` +
    (migrated ? `, destination migrated to ${wantedColumns.length} columns` : '') +
    `; history snapshot ${historyCsvPath}` +
    (historyLogPath ? `, change log ${historyLogPath}` : '');

  return { summary, warnings };
}

function main() {
  try {
    const { origin, destination, source, history } = parseArgs(process.argv.slice(2));
    const { summary, warnings } = run({
      origin,
      destinationPath: destination,
      sourcePath: source,
      historyDir: history,
    });
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
