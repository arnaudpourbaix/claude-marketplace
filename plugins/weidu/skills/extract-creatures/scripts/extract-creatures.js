#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const {
  parseDestination,
  parseInput,
  diffCreatures,
  formatDestinationCsv,
  formatChangeLog,
} = require('./lib');

function parseArgs(argv) {
  let origin = null;
  let destination = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--origin') {
      origin = argv[++i];
    } else if (argv[i] === '--destination') {
      destination = argv[++i];
    }
  }
  if (!origin) {
    throw new Error('--origin <name> is required');
  }
  return {
    origin,
    destination: destination || path.join('extract', 'csv', 'creatures.csv'),
  };
}

function run({ origin, destinationPath }) {
  const destinationDir = path.dirname(destinationPath);
  if (!fs.existsSync(destinationDir)) {
    throw new Error(`destination directory not found: ${destinationDir}`);
  }
  const inputPath = path.join(destinationDir, 'source.csv');
  if (!fs.existsSync(inputPath)) {
    throw new Error(`input file not found: ${inputPath}`);
  }

  const inputText = fs.readFileSync(inputPath, 'utf8');
  const destinationText = fs.existsSync(destinationPath)
    ? fs.readFileSync(destinationPath, 'utf8')
    : '';

  const destination = parseDestination(destinationText);
  const { rows: inputRows, warnings } = parseInput(inputText, inputPath);
  const { newRows, changedRows } = diffCreatures(inputRows, destination, origin);

  if (newRows.length > 0 || changedRows.length > 0) {
    const updatedByFile = new Map(changedRows.map((c) => [c.file, c.updatedRow]));
    const updatedExistingRows = destination.rows.map((row) => updatedByFile.get(row.file) || row);
    fs.writeFileSync(destinationPath, formatDestinationCsv(updatedExistingRows, newRows));
  }

  let logPath = null;
  const potentialLogPath = path.join(destinationDir, `${origin}_changes.log`);
  if (changedRows.length > 0) {
    logPath = potentialLogPath;
    fs.writeFileSync(logPath, formatChangeLog(origin, changedRows));
  } else if (fs.existsSync(potentialLogPath)) {
    fs.unlinkSync(potentialLogPath);
  }

  const summary = `${newRows.length} new creature(s) added (origin=${origin}), ` +
    `${changedRows.length} changed creature(s) applied and logged` +
    (logPath ? ` to ${logPath}` : '');

  return { summary, warnings };
}

function main() {
  try {
    const { origin, destination } = parseArgs(process.argv.slice(2));
    const { summary, warnings } = run({ origin, destinationPath: destination });
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
