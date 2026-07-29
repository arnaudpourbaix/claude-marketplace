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

module.exports = {
  splitCsvLine,
  joinCsvLine,
};
