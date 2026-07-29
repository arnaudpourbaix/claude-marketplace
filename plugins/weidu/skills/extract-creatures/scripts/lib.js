const path = require('path');

function splitCsvLine(line, fieldCount) {
  const parts = line.split(';');
  if (fieldCount && parts.length > fieldCount) {
    const head = parts.slice(0, fieldCount - 1);
    const tail = parts.slice(fieldCount - 1).join(';');
    return [...head, tail];
  }
  return parts;
}

function joinCsvLine(fields) {
  return fields.join(';');
}

const DESTINATION_COLUMNS = ['file', 'general', 'race', 'class', 'anim', 'deathvar', 'dialog', 'origin', 'name'];
const DESTINATION_HEADER = DESTINATION_COLUMNS.join(';');
const INPUT_COLUMNS = ['file', 'general', 'race', 'class', 'anim', 'deathvar', 'dialog', 'name'];

function parseDestination(text) {
  const rows = [];
  const byFile = new Map();
  if (!text) return { rows, byFile };
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  for (let i = 1; i < lines.length; i++) {
    const fields = splitCsvLine(lines[i], DESTINATION_COLUMNS.length);
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
  const lines = text.split(/\r?\n/);
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.length === 0) continue;
    const fields = splitCsvLine(line, INPUT_COLUMNS.length);
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

const EOL = '\r\n';

function formatDestinationCsv(existingRows, newRows) {
  const allRows = [...existingRows, ...newRows];
  const lines = [DESTINATION_HEADER];
  for (const row of allRows) {
    const fields = DESTINATION_COLUMNS.map((col) => row[col]);
    lines.push(joinCsvLine(fields));
  }
  return lines.join(EOL) + EOL;
}

function formatChangeLog(origin, changedRows) {
  const blocks = changedRows.map((entry) => {
    const changeLines = entry.changes.map((c) => `  ${c.field}: ${c.oldValue} -> ${c.newValue}`);
    return [entry.file, ...changeLines].join(EOL);
  });
  return blocks.join(EOL + EOL) + EOL;
}

module.exports = {
  DESTINATION_HEADER,
  DESTINATION_COLUMNS,
  INPUT_COLUMNS,
  COMPARE_FIELDS,
  splitCsvLine,
  joinCsvLine,
  parseDestination,
  parseInput,
  deriveOrigin,
  diffCreatures,
  formatDestinationCsv,
  formatChangeLog,
};
