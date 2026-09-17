export function filterVoters(voters, query) {
  const needle = String(query ?? '').trim().toLocaleLowerCase();
  if (!needle) return voters;
  return voters.filter(voter =>
    `${voter.first_name} ${voter.last_name} ${voter.external_id}`
      .toLocaleLowerCase().includes(needle));
}

export function applyMark(voters, id, timestamp) {
  return voters.map(voter => voter.id === id ? { ...voter, voted_at: timestamp } : voter);
}

export function parseCsv(text) {
  const output = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i], next = text[i + 1];
    if (quoted && char === '"' && next === '"') { field += '"'; i++; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { row.push(field); field = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') i++;
      row.push(field); output.push(row); row = []; field = '';
    } else field += char;
  }
  if (quoted) throw Error('Unclosed CSV quote');
  if (field || row.length) { row.push(field); output.push(row); }
  return output;
}

export function normalizeVoterCsv(text) {
  const parsed = parseCsv(text);
  const headers = (parsed.shift() || []).map(value => value.trim().toLowerCase());
  const required = ['external_id', 'first_name', 'last_name', 'town', 'consent'];
  if (required.some(key => !headers.includes(key))) throw Error('Missing required columns: ' + required.join(', '));
  if (new Set(headers).size !== headers.length) throw Error('Duplicate CSV columns');
  const map = {
    external_id: 'externalId', first_name: 'firstName', last_name: 'lastName',
    town: 'town', ward: 'ward', polling_place: 'pollingPlace', address: 'address',
    phone: 'phone', family_id: 'familyId', consent: 'consent',
  };
  const rows = parsed.filter(row => row.some(value => value.trim())).map(row => {
    if (row.length !== headers.length) throw Error('A CSV row has the wrong number of columns');
    const output = {};
    for (let i = 0; i < headers.length; i++) {
      const heading = headers[i], value = row[i].trim();
      if (!(heading in map)) continue;
      if (heading === 'consent') {
        if (!['true', 'false'].includes(value.toLowerCase())) throw Error('Consent must be true or false');
        output.consent = value.toLowerCase() === 'true';
      } else output[map[heading]] = value;
    }
    for (const key of ['externalId', 'firstName', 'lastName', 'town']) {
      if (!output[key]) throw Error('A row is missing ' + key);
    }
    return output;
  });
  if (rows.length < 1 || rows.length > 500) throw Error('Use 1–500 rows per import');
  if (new Set(rows.map(row => row.externalId)).size !== rows.length) throw Error('Duplicate external IDs');
  return rows;
}

export function csvCell(value) {
  let cell = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(cell)) cell = "'" + cell;
  return /[",\r\n]/.test(cell) ? '"' + cell.replaceAll('"', '""') + '"' : cell;
}
