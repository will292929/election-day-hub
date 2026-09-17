import test from 'node:test';
import assert from 'node:assert/strict';
import { applyMark, csvCell, filterVoters, importPreview, normalizeVoterCsv, parseCsv } from '../docs/pilot-core.js';

test('search finds names and IDs without a page reload', () => {
  const voters = [
    { id: '1', first_name: 'Ada', last_name: 'Sample', external_id: 'DEMO-001', town: 'Camden' },
    { id: '2', first_name: 'Ben', last_name: 'Practice', external_id: 'DEMO-002', town: 'Rockport' },
  ];
  assert.deepEqual(filterVoters(voters, 'ada sample').map(v => v.id), ['1']);
  assert.deepEqual(filterVoters(voters, 'demo-002').map(v => v.id), ['2']);
  assert.equal(filterVoters(voters, '').length, 2);
  assert.deepEqual(filterVoters(voters, 'Ad Sa').map(v => v.id), ['1']);
  assert.deepEqual(filterVoters(voters, 'Sa Ad').map(v => v.id), ['1']);
  assert.deepEqual(filterVoters(voters, '', 'Rockport').map(v => v.id), ['2']);
  assert.deepEqual(filterVoters(voters, 'Ad Sa', 'Rockport'), []);
});

test('CSV preview distinguishes new and matching demo IDs', () => {
  const rows = [{ externalId: 'DEMO-001' }, { externalId: 'DEMO-003' }];
  const preview = importPreview(rows, [{ external_id: 'DEMO-001' }]);
  assert.equal(preview.added, 1);
  assert.equal(preview.matching, 1);
  assert.equal(preview.sample.length, 2);
});

test('a successful mark immediately updates the in-memory list', () => {
  const voters = [{ id: '1', voted_at: null }, { id: '2', voted_at: null }];
  const updated = applyMark(voters, '1', '2026-09-17T12:00:00Z');
  assert.equal(updated[0].voted_at, '2026-09-17T12:00:00Z');
  assert.equal(updated[1].voted_at, null);
  assert.equal(voters[0].voted_at, null);
});

test('CSV import parses quotes, validates consent and duplicate IDs', () => {
  const header = 'external_id,first_name,last_name,town,consent\n';
  assert.equal(normalizeVoterCsv(header + 'DEMO-1,"Ada, Jr",Sample,Sampletown,true\n')[0].firstName, 'Ada, Jr');
  assert.throws(() => normalizeVoterCsv(header + 'DEMO-1,Ada,Sample,Sampletown,yes\n'), /Consent/);
  assert.throws(() => normalizeVoterCsv(header + 'DEMO-1,Ada,Sample,Sampletown,true\nDEMO-1,Ben,Sample,Sampletown,true\n'), /Duplicate external IDs/);
  assert.throws(() => parseCsv('"unclosed'), /Unclosed CSV quote/);
});

test('CSV export neutralizes spreadsheet formulas', () => {
  assert.equal(csvCell('=1+1'), "'=1+1");
  assert.equal(csvCell('a,b'), '"a,b"');
});
