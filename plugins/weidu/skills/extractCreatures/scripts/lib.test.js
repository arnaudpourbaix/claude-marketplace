const test = require('node:test');
const assert = require('node:assert/strict');
const { splitCsvLine, joinCsvLine } = require('./lib');

test('splitCsvLine splits unquoted fields on semicolon', () => {
  const result = splitCsvLine('AATAQAH;GIANTHUMANOID;GENIE');
  assert.deepEqual(result, ['AATAQAH', 'GIANTHUMANOID', 'GENIE']);
});

test('splitCsvLine strips quotes from a quoted field', () => {
  const result = splitCsvLine('AATAQAH;"Aataqah";GENIE');
  assert.deepEqual(result, ['AATAQAH', 'Aataqah', 'GENIE']);
});

test('splitCsvLine unescapes doubled quotes inside a quoted field', () => {
  const result = splitCsvLine('AATAQAH;"Aa""taqah";GENIE');
  assert.deepEqual(result, ['AATAQAH', 'Aa"taqah', 'GENIE']);
});

test('joinCsvLine quotes only the requested indices', () => {
  const result = joinCsvLine(['AATAQAH', 'Aataqah', 'GENIE'], [1]);
  assert.equal(result, 'AATAQAH;"Aataqah";GENIE');
});

test('joinCsvLine escapes internal quotes in a quoted field', () => {
  const result = joinCsvLine(['AATAQAH', 'Aa"taqah'], [1]);
  assert.equal(result, 'AATAQAH;"Aa""taqah"');
});
