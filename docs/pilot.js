import { applyMark, csvCell, filterVoters, normalizeVoterCsv } from './pilot-core.js?v=20260917';

const app = document.querySelector('#app');
const config = window.ELECTION_HUB_SUPABASE || {};
const esc = value => String(value ?? '').replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const voterFields = 'id,external_id,first_name,last_name,town,ward,polling_place,voted_at';
let client = null, session = null, memberships = [], campaigns = [], campaignId = null;
let voters = [], volunteers = [], importRows = [], pendingId = null;
let loadVersion = 0, refreshing = false, marking = false;

function check(result) { if (result.error) throw result.error; return result.data; }
function role(id = campaignId) { return memberships.find(item => item.campaign_id === id)?.role || ''; }
function status(message, bad = false) {
  const target = document.querySelector('#status');
  if (target) { target.textContent = message; target.className = bad ? 'error' : 'success'; }
}
function trainingBanner() {
  return '<div class="banner"><strong>TRAINING MODE</strong> · Fictional records only · Not an official election check-in system</div>';
}
function login() {
  app.innerHTML = `${trainingBanner()}<section class="card login"><div class="logo">ED</div><p class="eyebrow">VOLUNTEER ACCESS</p><h1>Election Day Hub</h1><p>Open the private one-time link your training administrator sent you. It signs you in without a password.</p><div class="divider">or use your password</div><form id="login"><label>Email address<input name="email" type="email" autocomplete="username" required></label><label>Password<input name="password" type="password" autocomplete="current-password" required></label><button>Sign in with password</button></form><p id="status" role="status"></p></section>`;
}
function choosePassword() {
  app.innerHTML = `${trainingBanner()}<section class="card login"><p class="eyebrow">ONE-TIME INVITATION</p><h1>Welcome to the team</h1><p>Your link signed you in. Set a password of at least 14 characters as a backup way to enter.</p><form id="choose-password"><label>New password<input name="password" type="password" autocomplete="new-password" minlength="14" required></label><label>Confirm password<input name="confirm" type="password" autocomplete="new-password" minlength="14" required></label><button>Open training workspace</button></form><p id="status" role="status"></p></section>`;
}
function noAccess() {
  app.innerHTML = `${trainingBanner()}<section class="card login"><h1>No campaign access</h1><p>Ask your training administrator to assign you to a campaign.</p><button id="logout">Sign out</button></section>`;
}
function dashboardHtml() {
  const admin = role() === 'admin';
  const campaignOptions = campaigns.map(item => `<option value="${esc(item.id)}" ${item.id === campaignId ? 'selected' : ''}>${esc(item.name)}</option>`).join('');
  return `${trainingBanner()}<header><div class="brand"><div class="logo">ED</div><div><strong>Election Day Hub</strong><small>${esc(session.user.email)} · ${esc(role())}</small></div></div><button class="secondary" id="logout">Sign out</button></header><div class="hero"><p class="eyebrow">PRACTICE WORKSPACE</p><h1>Volunteer check-in desk</h1><p>Search a fictional voter, verify the record, then record a practice mark.</p></div><div class="metrics"><div><strong id="count-total">—</strong><span>Practice voters</span></div><div><strong id="count-open">—</strong><span>Ready to practice</span></div><div><strong id="count-marked">—</strong><span>Already marked</span></div></div><div class="row"><label>Campaign<select id="campaign" ${campaigns.length === 1 ? 'disabled' : ''}>${campaignOptions}</select></label><span class="pill">${esc(role())}</span></div><p id="status" role="status"></p><section class="card"><div class="section-heading"><div><p class="eyebrow">VOTER LOOKUP</p><h2>Find a practice voter</h2></div><button class="secondary" id="refresh">Refresh list</button></div><label>Name or demo ID<input id="search" type="search" placeholder="Try a name or DEMO-001" autocomplete="off"></label><small id="last-sync" class="muted">Loading practice list…</small><div id="results" class="voter-list"></div></section>${admin ? `<section class="card admin-card"><p class="eyebrow">ADMIN TOOLS</p><h2>Volunteer access</h2><p>Create a one-time link for a new or returning volunteer. Copy and share it privately; this page shows it only once.</p><form id="invite-form" class="invite-form"><label>Volunteer email<input name="email" type="email" placeholder="volunteer@example.com" required></label><button>Create one-time link</button></form><div id="invite-result"></div><p class="muted">Generate links shortly before training. Supabase Auth controls their expiry.</p><h3>Volunteers in this campaign</h3><div id="volunteer-roster" class="roster"><p class="muted">Loading volunteers…</p></div></section><section class="card admin-card"><p class="eyebrow">ADMIN TOOLS</p><h2>Practice data</h2><p>Only fictional records belong in this pilot.</p><div class="actions"><a href="training-voters.csv" download>Download 24 fictional practice records</a><button class="secondary" id="export">Download campaign CSV</button></div><label>Import CSV<input id="csv" type="file" accept=".csv,text/csv"></label><p id="preview"></p><label><span><input id="replace" type="checkbox" style="width:auto"> Update matching external IDs</span></label><button id="import" disabled>Import reviewed rows</button></section><section class="card admin-card"><h2>Recent activity</h2><div id="audit" class="scroll"></div></section>` : ''}<dialog id="confirm"><form method="dialog"><h2>Mark this practice voter?</h2><p id="confirm-name"></p><p>This saves a poll-watch practice mark, not an official vote or check-in.</p><div class="actions"><button class="secondary" value="cancel">Cancel</button><button id="confirm-mark" value="confirm">Record practice mark</button></div></form></dialog>`;
}
function addCampaignTool() {
  if (role() !== 'admin') return;
  document.querySelector('.admin-card')?.insertAdjacentHTML('afterend', `<section class="card admin-card"><p class="eyebrow">ADMIN TOOLS</p><h2>Create a training campaign</h2><p>Give a new fictional campaign a name. You will become its admin, and can then reassign volunteers you manage between campaigns.</p><form id="create-campaign" class="invite-form"><label>Campaign name<input name="name" maxlength="120" required placeholder="Fictional Training Campaign B"></label><button>Create campaign</button></form></section>`);
}
async function loadCampaigns() {
  memberships = check(await client.from('memberships').select('campaign_id,role,active')
    .eq('user_id', session.user.id).eq('active', true));
  const ids = memberships.map(item => item.campaign_id);
  campaigns = ids.length ? check(await client.from('campaigns').select('id,name').in('id', ids).order('name')) : [];
  if (!campaigns.some(item => item.id === campaignId)) campaignId = campaigns[0]?.id || null;
}
async function dashboard() {
  await loadCampaigns();
  if (!campaignId) { noAccess(); return; }
  app.innerHTML = dashboardHtml();
  addCampaignTool();
  await loadVoters();
  if (role() === 'admin') await loadAdminPanels();
}
async function loadVoters() {
  const version = ++loadVersion, selectedCampaign = campaignId;
  const all = [];
  for (let offset = 0; offset < 5000; offset += 500) {
    const batch = check(await client.from('voters').select(voterFields)
      .eq('campaign_id', selectedCampaign).order('last_name').order('first_name')
      .range(offset, offset + 499));
    all.push(...batch);
    if (batch.length < 500) break;
  }
  if (version !== loadVersion || selectedCampaign !== campaignId) return;
  voters = all;
  updateVoterDisplay();
  const synced = document.querySelector('#last-sync');
  if (synced) synced.textContent = `${all.length === 5000 ? 'Showing first 5,000 records · ' : ''}Updated ${new Date().toLocaleTimeString()}`;
}
function updateVoterDisplay() {
  const total = document.querySelector('#count-total');
  if (!total) return;
  total.textContent = voters.length;
  document.querySelector('#count-open').textContent = voters.filter(item => !item.voted_at).length;
  document.querySelector('#count-marked').textContent = voters.filter(item => item.voted_at).length;
  renderVoters();
}
function renderVoters() {
  const target = document.querySelector('#results');
  if (!target) return;
  const matches = filterVoters(voters, document.querySelector('#search')?.value);
  target.innerHTML = matches.length ? matches.map(item => `<article class="voter-card"><div class="avatar">${esc(item.first_name.slice(0, 1))}${esc(item.last_name.slice(0, 1))}</div><div class="voter-info"><h3>${esc(item.first_name)} ${esc(item.last_name)}</h3><p>${esc(item.external_id)} · ${esc(item.town)}${item.ward ? ` · Ward ${esc(item.ward)}` : ''}</p><small>${esc(item.polling_place || 'Training station')}</small></div><div class="voter-action">${item.voted_at ? `<span class="marked">✓ Practice marked</span><small>${esc(new Date(item.voted_at).toLocaleString())}</small>` : `<span class="ready">Ready</span><button data-checkin="${esc(item.id)}">Mark practice check-in</button>`}</div></article>`).join('') : '<p class="empty">No matching practice voters. Try another name or demo ID.</p>';
}
async function loadVolunteers() {
  if (role() !== 'admin') return;
  volunteers = check(await client.rpc('list_volunteers', { p_campaign_id: campaignId }));
  const target = document.querySelector('#volunteer-roster');
  if (!target) return;
  const destinations = campaigns.filter(item => item.id !== campaignId && role(item.id) === 'admin');
  target.innerHTML = volunteers.length ? volunteers.map(item => `<div class="roster-row"><strong>${esc(item.email)}</strong>${destinations.length ? `<div class="roster-actions"><select aria-label="New campaign for ${esc(item.email)}" id="target-${esc(item.user_id)}">${destinations.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select><button class="secondary" data-reassign="${esc(item.user_id)}">Reassign</button></div>` : '<small>One active campaign</small>'}</div>`).join('') : '<p class="muted">No active volunteers in this campaign yet.</p>';
  if (!destinations.length && volunteers.length) target.insertAdjacentHTML('beforeend', '<p class="muted">To reassign, an administrator must also have access to the destination campaign.</p>');
}
async function loadAudit() {
  const data = check(await client.rpc('recent_audit', { p_campaign_id: campaignId }));
  const target = document.querySelector('#audit');
  if (target) target.innerHTML = data.length ? `<table><tr><th>When</th><th>Action</th><th>Target</th></tr>${data.map(item => `<tr><td>${esc(new Date(item.at).toLocaleString())}</td><td>${esc(item.action)}</td><td>${esc(item.target)}</td></tr>`).join('')}</table>` : '<p class="muted">No activity yet.</p>';
}
async function loadAdminPanels() {
  const results = await Promise.allSettled([loadVolunteers(), loadAudit()]);
  if (results.some(result => result.status === 'rejected')) {
    status('Some admin tools could not refresh. Try Refresh list.', true);
  }
}
async function refreshData(quiet = false) {
  if (!session || refreshing || !campaignId) return;
  refreshing = true;
  try {
    const oldCampaign = campaignId, oldRole = role();
    await loadCampaigns();
    if (!campaignId) { noAccess(); return; }
    if (campaignId !== oldCampaign || role() !== oldRole) await dashboard();
    else { await loadVoters(); if (role() === 'admin') await loadAdminPanels(); }
    if (!quiet) status('Practice list refreshed.');
  } catch (error) { status(`Could not refresh: ${error.message}`, true); }
  finally { refreshing = false; }
}
function downloadCsv(data) {
  const keys = ['external_id', 'first_name', 'last_name', 'town', 'ward', 'polling_place', 'address', 'phone', 'family_id', 'consent', 'voted_at'];
  const content = [keys.join(','), ...data.map(item => keys.map(key => csvCell(item[key])).join(','))].join('\r\n');
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = 'campaign-voters.csv'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function errorMessage(error) {
  try { const body = await error.context?.json(); if (body?.error) return body.error; } catch { /* no JSON response */ }
  return error.message || 'Something went wrong. Try again.';
}

app.addEventListener('submit', async event => {
  if (event.target.getAttribute('method') === 'dialog') return;
  event.preventDefault();
  const form = event.target, values = new FormData(form);
  const submitButton = form.querySelector('button[type="submit"], button:not([type])');
  if (submitButton) submitButton.disabled = true;
  try {
    if (form.id === 'login') {
      const data = check(await client.auth.signInWithPassword({ email: String(values.get('email')).trim(), password: String(values.get('password')) }));
      session = data.session; await dashboard();
    } else if (form.id === 'choose-password') {
      const password = String(values.get('password'));
      if (password.length < 14 || password !== String(values.get('confirm'))) throw Error('Passwords must match and be at least 14 characters.');
      check(await client.auth.updateUser({ password }));
      history.replaceState(null, '', location.pathname); await dashboard();
    } else if (form.id === 'invite-form') {
      if (role() !== 'admin') throw Error('Admin access required');
      const email = String(values.get('email')).trim().toLowerCase();
      const data = check(await client.functions.invoke('volunteer-invite', { body: { email, campaignId } }));
      const target = document.querySelector('#invite-result');
      target.innerHTML = `<div class="invite-result"><strong>One-time link for ${esc(email)}</strong><input id="link-to-copy" readonly aria-label="One-time invitation link"><button class="secondary" id="copy-link" type="button">Copy link</button><small>Share privately. Anyone holding this link can enter as this volunteer until it is used or expires.</small></div>`;
      document.querySelector('#link-to-copy').value = data.actionLink;
      form.reset(); status('One-time volunteer link created. Copy and send it privately.');
      await loadVolunteers();
    } else if (form.id === 'create-campaign') {
      if (role() !== 'admin') throw Error('Admin access required');
      const name = String(values.get('name')).trim();
      const newId = check(await client.rpc('create_campaign', { p_name: name }));
      campaignId = newId; await dashboard();
      status(`${name} created. You can now assign volunteers to it.`);
    }
  } catch (error) { status(await errorMessage(error), true); }
  finally { if (submitButton?.isConnected) submitButton.disabled = false; }
});

app.addEventListener('click', async event => {
  const button = event.target.closest('button');
  if (!button) return;
  try {
    if (button.id === 'logout') { check(await client.auth.signOut()); session = null; login(); return; }
    if (button.id === 'refresh') { await refreshData(); return; }
    if (button.id === 'copy-link') { await navigator.clipboard.writeText(document.querySelector('#link-to-copy').value); status('One-time link copied. Send it privately.'); return; }
    if (button.dataset.checkin) {
      const voter = voters.find(item => item.id === button.dataset.checkin);
      if (!voter || voter.voted_at || marking) return;
      pendingId = voter.id;
      document.querySelector('#confirm-name').textContent = `${voter.first_name} ${voter.last_name} · ${voter.external_id}`;
      document.querySelector('#confirm').showModal(); return;
    }
    if (button.id === 'confirm-mark') {
      if (marking || !pendingId) return;
      marking = true; button.disabled = true;
      const id = pendingId; pendingId = null;
      try {
        const timestamp = check(await client.rpc('mark_voted', { p_voter_id: id }));
        ++loadVersion; voters = applyMark(voters, id, timestamp); updateVoterDisplay();
        status('Practice mark saved. This is not an official election check-in.');
        try { await loadVoters(); if (role() === 'admin') await loadAudit(); }
        catch { status('Practice mark saved, but the latest list could not refresh. Use Refresh list to retry.', true); }
      } catch (error) {
        status(await errorMessage(error), true);
        await loadVoters().catch(() => {});
      } finally { marking = false; }
      return;
    }
    if (button.dataset.reassign) {
      if (role() !== 'admin') throw Error('Admin access required');
      const volunteer = volunteers.find(item => item.user_id === button.dataset.reassign);
      const targetId = document.getElementById(`target-${button.dataset.reassign}`)?.value;
      const targetName = campaigns.find(item => item.id === targetId)?.name;
      if (!volunteer || !targetName || role(targetId) !== 'admin') throw Error('Choose a campaign you administer');
      if (!window.confirm(`Move ${volunteer.email} to ${targetName}? Their access to this campaign will end immediately.`)) return;
      button.disabled = true;
      check(await client.rpc('reassign_volunteer', { p_user_id: volunteer.user_id, p_from_campaign_id: campaignId, p_to_campaign_id: targetId }));
      await loadVolunteers(); await loadAudit();
      status(`${volunteer.email} was reassigned to ${targetName}.`); return;
    }
    if (button.id === 'import') {
      if (role() !== 'admin' || !importRows.length) throw Error('Admin access required and a CSV must be reviewed');
      button.disabled = true;
      const result = check(await client.rpc('import_voters', { p_campaign_id: campaignId, p_rows: importRows, p_replace: document.querySelector('#replace').checked }));
      importRows = []; document.querySelector('#csv').value = ''; document.querySelector('#preview').textContent = '';
      await loadVoters(); await loadAudit(); status(`${result.added} added, ${result.updated} updated.`); return;
    }
    if (button.id === 'export') {
      if (role() !== 'admin') throw Error('Admin access required');
      button.disabled = true;
      downloadCsv(check(await client.rpc('export_voters', { p_campaign_id: campaignId })));
      await loadAudit(); status('Campaign CSV downloaded.');
    }
  } catch (error) { status(await errorMessage(error), true); }
  finally { if (button.isConnected) button.disabled = button.id === 'import' ? importRows.length === 0 : false; }
});

app.addEventListener('change', async event => {
  try {
    if (event.target.id === 'campaign') {
      campaignId = event.target.value; ++loadVersion;
      app.innerHTML = dashboardHtml(); addCampaignTool(); await loadVoters();
      if (role() === 'admin') await loadAdminPanels();
    } else if (event.target.id === 'csv') {
      const file = event.target.files[0]; if (!file) return;
      if (file.size > 1_200_000) throw Error('File is too large');
      importRows = normalizeVoterCsv(await file.text());
      document.querySelector('#preview').textContent = `${importRows.length} records parsed. First: ${importRows[0].firstName} ${importRows[0].lastName}. Review the file before importing.`;
      document.querySelector('#import').disabled = false;
    }
  } catch (error) {
    importRows = []; const importButton = document.querySelector('#import'); if (importButton) importButton.disabled = true;
    status(await errorMessage(error), true);
  }
});
app.addEventListener('input', event => { if (event.target.id === 'search') renderVoters(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void refreshData(true); });
window.addEventListener('focus', () => { void refreshData(true); });
setInterval(() => { if (document.visibilityState === 'visible') void refreshData(true); }, 12_000);

if (!config.url || !config.publishableKey) app.innerHTML = '<section class="card login"><h1>Pilot not connected</h1><p>Supabase configuration is missing.</p></section>';
else if (!window.supabase?.createClient) app.innerHTML = '<section class="card login"><h1>Sign-in unavailable</h1><p>Refresh the page and try again.</p></section>';
else {
  const authFlow = new URLSearchParams(location.hash.slice(1)).get('type');
  client = window.supabase.createClient(config.url, config.publishableKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  const { data, error } = await client.auth.getSession(); session = data.session;
  if (session) {
    if (authFlow === 'invite' || authFlow === 'recovery') choosePassword();
    else { history.replaceState(null, '', location.pathname); try { await dashboard(); } catch (failure) { login(); status(failure.message, true); } }
  } else { login(); if (error || authFlow === 'invite' || authFlow === 'recovery') status('This one-time link is invalid or expired. Ask the administrator for another link.', true); }
  client.auth.onAuthStateChange((event, next) => {
    if (event === 'SIGNED_OUT') { session = null; login(); }
    else if (event === 'TOKEN_REFRESHED') session = next;
  });
}
