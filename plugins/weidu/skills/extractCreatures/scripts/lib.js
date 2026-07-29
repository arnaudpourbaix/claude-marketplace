const path = require('path');

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
