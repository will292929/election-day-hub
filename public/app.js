const app = document.querySelector("#app");
const toast = document.querySelector("#toast");
const csvInput = document.querySelector("#csv-file");

let state;
let view = "poll";
let selectedVoterId = null;
let town = "Camden";
let query = "Maya";
let rolePreview = "Admin";
let modal = null;
let importRows = [];

const icons = { poll: "⌕", team: "♙", campaigns: "⚙", exports: "⇩" };
const viewNames = { poll: "Poll watch", team: "Team", campaigns: "Campaigns", exports: "Exports" };
const esc = value => String(value ?? "").replace(/[&<>'"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" }[c]));
const initials = voter => `${voter.firstName[0] || ""}${voter.lastName[0] || ""}`.toUpperCase();

async function request(url, options = {}) {
  const response = await fetch(url, { headers: { "content-type": "application/json", ...(options.headers || {}) }, ...options });
  const type = response.headers.get("content-type") || "";
  const data = type.includes("application/json") ? await response.json() : await response.text();
  if (!response.ok) throw new Error(data.error || "Something went wrong");
  return data;
}

function flash(message) {
  toast.textContent = message; toast.classList.add("show");
  clearTimeout(flash.timer); flash.timer = setTimeout(() => toast.classList.remove("show"), 2800);
}

function campaign() { return state.campaigns.find(c => c.id === state.activeCampaignId); }
function campaignVoters() { return state.voters.filter(v => v.campaignId === state.activeCampaignId); }

function nav() {
  return Object.entries(viewNames).map(([id, name]) => `<button data-view="${id}" class="${view === id ? "active" : ""}"><span class="nav-icon">${icons[id]}</span>${name}</button>`).join("");
}

function frame(content) {
  const c = campaign(); const a = c.assignment;
  return `
    <header class="topbar">
      <div class="brand"><div class="logo">▣</div><div><h1>Election Day Hub</h1><p>Tuesday, November 3</p></div></div>
      <div class="top-actions">
        <select class="campaign-select" id="campaign-select" aria-label="Campaign">${state.campaigns.map(x => `<option value="${x.id}" ${x.id === c.id ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select>
        <button class="icon-button" title="Notifications">♢</button>
        <div class="identity"><div class="avatar">${state.user.name[0]}</div><div><strong>${esc(state.user.email)}</strong><small>${esc(rolePreview)}</small></div></div>
      </div>
    </header>
    <div class="shell">
      <aside class="sidebar">
        <nav class="nav" aria-label="Main navigation">${nav()}</nav>
        <div class="assignment"><span class="eyebrow">Today's assignment</span><strong>${esc(a.site)}</strong><p>${esc(a.town)} · ${esc(a.ward)}</p><div class="shift"><p>Shift</p><strong>${esc(a.shift)}</strong></div></div>
        <div class="private"><strong>▣ &nbsp; Private workspace</strong>Access is limited by campaign and role.</div>
      </aside>
      <main class="main"><div class="page">${content}</div></main>
    </div>
    <nav class="mobile-nav">${Object.entries(viewNames).map(([id, name]) => `<button data-view="${id}" class="${view === id ? "active" : ""}">${icons[id]}<br>${name}</button>`).join("")}</nav>
    ${modalMarkup()}`;
}

function filteredVoters() {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return campaignVoters().filter(v => (town === "all" || v.town === town) && (!tokens.length || (tokens.length === 1
    ? `${v.firstName} ${v.lastName} ${v.address}`.toLowerCase().includes(tokens[0])
    : v.firstName.toLowerCase().startsWith(tokens[0]) && v.lastName.toLowerCase().startsWith(tokens[1]))));
}

function pollView() {
  const voters = campaignVoters(); const results = filteredVoters();
  if (!results.some(v => v.id === selectedVoterId)) selectedVoterId = results[0]?.id || null;
  const selected = voters.find(v => v.id === selectedVoterId);
  const checked = voters.filter(v => v.votedAt).length;
  const turnout = voters.length ? ((checked / voters.length) * 100).toFixed(1) : "0.0";
  const admin = rolePreview !== "Volunteer";
  return frame(`
    <section class="hero">
      <div class="hero-intro"><span class="eyebrow" style="color:#bfe7d7">Live poll watch</span><h2>Voter check-in</h2><p>Find a voter, confirm the record, and log their check-in.</p></div>
      ${admin ? `<div class="metric"><span>Checked in today</span><strong>${428 + checked}</strong></div><div class="metric"><span>Assigned voters</span><strong>${(1200 + voters.length).toLocaleString()}</strong></div><div class="metric"><span>Turnout logged</span><strong>${turnout}%</strong></div><div class="metric"><span>Last sync</span><strong>Live</strong></div>` : `<div class="metric"><span>Your assignment</span><strong>${esc(campaign().assignment.town)}</strong></div><div class="metric"><span>Shift</span><strong style="font-size:16px">${esc(campaign().assignment.shift)}</strong></div>`}
    </section>
    <div class="page-title">
      <div><span class="eyebrow">${admin ? "Campaign operations" : "Volunteer workspace"}</span><h2>Poll watch</h2><p>${admin ? "Search records, record check-ins, and manage election logistics." : "Select a town and search voter names."}</p></div>
      ${admin ? `<div class="button-row"><a class="btn" href="/api/export">⇩ Export campaign</a><button class="btn" data-modal="import">↑ Import voters</button><button class="btn primary" data-view="team">＋ Invite team member</button></div>` : ""}
    </div>
    <section class="filters">
      <div class="field"><label for="town">Town</label><select id="town"><option value="all">All assigned towns</option>${[...new Set(voters.map(v => v.town))].map(x => `<option ${town === x ? "selected" : ""}>${esc(x)}</option>`).join("")}</select></div>
      <div class="field"><label for="search">Search voter</label><input id="search" value="${esc(query)}" placeholder="Try Wi Au or Will A" autocomplete="off" /></div>
    </section>
    <section class="workspace">
      <article class="card voter-list">
        <div class="card-header"><div><h3>Search results</h3><p>${results.length} matching record${results.length === 1 ? "" : "s"}</p></div><span class="live">● Live</span></div>
        ${results.length ? results.map(v => `<button class="voter-row ${v.id === selectedVoterId ? "active" : ""}" data-voter="${v.id}"><span class="initials">${initials(v)}</span><span><strong>${esc(v.firstName)} ${esc(v.lastName)}</strong><small>${admin ? `${esc(v.address)} · Age ${v.age}` : `${esc(v.ward)} · ${esc(v.pollingPlace)}`}</small><small>${esc(v.ward)} · ${esc(v.pollingPlace)}</small></span><span class="status ${v.votedAt ? "yes" : ""}">${v.votedAt ? "✓ Voted" : "Not marked"}</span></button>`).join("") : `<div class="empty">No matching voters. Try another town or name.</div>`}
      </article>
      ${selected ? voterDetail(selected, admin) : `<article class="card"><div class="empty">Select a voter to continue.</div></article>`}
    </section>`);
}

function voterDetail(v, admin) {
  return `<article class="card detail">
    <div class="person"><span class="initials">${initials(v)}</span><div><h3>${esc(v.firstName)} ${esc(v.lastName)}</h3><p>${admin ? esc(v.address) : `${esc(v.town)}, Maine`}</p></div></div>
    <div class="detail-grid"><div><span>Polling place</span><strong>${esc(v.pollingPlace)}</strong></div><div><span>Precinct</span><strong>${esc(v.ward)}</strong></div>${admin ? `<div class="wide"><span>Family ID</span><strong>${esc(v.familyId)}</strong></div>` : ""}</div>
    <button class="checkin ${v.votedAt ? "done" : ""}" data-checkin="${v.id}" ${v.votedAt ? "disabled" : ""}>${v.votedAt ? "✓ Vote already logged" : "✓ Mark as voted"}</button>
    <div class="message-block">
      <div class="message-head"><div><strong>▤ &nbsp; Consent-based messaging</strong><small>Neutral election logistics only</small></div><span class="consent">${v.consent ? "CONSENT ON FILE" : "NO CONSENT"}</span></div>
      <button class="btn" style="width:100%" data-message="plan" data-voter-id="${v.id}" ${!v.consent ? "disabled" : ""}>▤ Apply campaign texting plan</button>
      ${admin ? `<div class="field" style="margin-top:14px"><label>Send delay</label><select id="delay"><option value="0">Immediately</option><option value="5" selected>5 minutes</option><option value="15">15 minutes</option><option value="30">30 minutes</option></select></div>
      <div class="contact"><div><strong>${esc(v.firstName)} ${esc(v.lastName)}</strong><small>${esc(v.phone)}</small></div><button class="btn" data-message="voter" data-voter-id="${v.id}" ${!v.consent ? "disabled" : ""}>⌁ Queue text</button></div>
      ${v.contacts.length ? `<span class="eyebrow">Household contacts</span>${v.contacts.map(c => `<div class="contact"><div><strong>${esc(c.name)}</strong><small>${esc(c.relation)} · ${esc(c.phone)}</small></div><button class="btn" data-message="${c.id}" data-voter-id="${v.id}" ${c.contactedAt || !v.consent ? "disabled" : ""}>${c.contactedAt ? "✓ Already contacted" : "⌁ Queue text"}</button></div>`).join("")}` : ""}` : `<p style="color:var(--muted);font-size:12px;line-height:1.5">Press Text to apply this campaign's approved family and voter message plan. Contact details and message contents remain hidden.</p>`}
    </div>
  </article>`;
}

function teamView() {
  return frame(`<div class="page-title"><div><span class="eyebrow">Campaign access</span><h2>Team</h2><p>Invite people and manage how they enter ${esc(campaign().name)}.</p></div></div>
    <section class="card section-card"><div class="team-list">${state.team.map(m => `<div class="team-row"><span class="initials">${esc(m.initials)}</span><div><h4>${esc(m.label)}</h4><p>${esc(m.scope)}</p></div><span class="role">${esc(m.role)}</span></div>`).join("")}</div></section>
    <section class="card section-card"><h3>Create a quicklink</h3><p style="color:var(--muted);font-size:13px">Each link works once. Choose when it expires, or leave it valid until someone accepts it.</p>
      <form id="invite-form" class="form-grid" style="margin-top:18px"><div class="field"><label>Mobile number</label><input name="phone" required placeholder="207-555-0123" /></div><div class="field"><label>Email (optional)</label><input name="email" type="email" placeholder="volunteer@example.com" /></div><div class="field"><label>Access level</label><select name="role"><option>Volunteer</option><option>Staff</option><option>Admin</option></select></div><div class="field"><label>Expires</label><select name="expires"><option value="1">1 hour</option><option value="8">8 hours</option><option value="24">24 hours</option><option value="48" selected>48 hours</option><option value="168">7 days</option><option value="never">Never, until used</option></select></div><div class="span-2"><button class="btn primary" type="submit">Generate quicklink</button></div></form><div id="invite-result"></div>
    </section>`);
}

function campaignsView() {
  const s = campaign().settings;
  return frame(`<div class="page-title"><div><span class="eyebrow">Admin settings</span><h2>Campaign texting</h2><p>These rules control what the volunteer Text button schedules.</p></div></div>
    <form id="settings-form" class="card section-card"><div class="notice"><strong>RumbleUp credentials needed.</strong> Messages remain in the local simulated queue until a verified server-side provider is configured.</div>
      <div class="form-grid" style="margin-top:20px"><div class="field span-2"><label>RumbleUp Action ID</label><input name="actionId" value="${esc(s.actionId)}" placeholder="Fast Mode Action ID" /></div><div class="field"><label>Recipients</label><select name="recipients"><option value="family-only" ${s.recipients === "family-only" ? "selected" : ""}>Family members only</option><option value="family-and-voter" ${s.recipients === "family-and-voter" ? "selected" : ""}>Family members and voter</option></select></div><div></div><div class="field"><label>Family delay (minutes)</label><input name="familyDelay" type="number" min="0" value="${s.familyDelay}" /></div><div class="field"><label>Voter delay (minutes)</label><input name="voterDelay" type="number" min="0" value="${s.voterDelay}" /></div><div class="field"><label>Family message</label><textarea name="familyMessage">${esc(s.familyMessage)}</textarea></div><div class="field"><label>Separate voter message</label><textarea name="voterMessage">${esc(s.voterMessage)}</textarea></div><div class="span-2"><button class="btn primary" type="submit">Save settings</button></div></div>
      <p style="color:var(--muted);font-size:12px;margin-top:18px">Volunteers never see phone numbers, household records, message text, or delays. The server applies these settings after they press Text.</p>
    </form>`);
}

function exportsView() {
  const messages = state.messages.filter(m => m.campaignId === state.activeCampaignId).slice(0, 10);
  return frame(`<div class="page-title"><div><span class="eyebrow">Admin reporting</span><h2>Exports</h2><p>Download the current campaign's election-day records.</p></div></div>
    <section class="card section-card"><div class="export-box"><div><h3>Campaign voter export</h3><p>Includes town, precinct, voted status, and recorded consent.</p></div><a class="btn primary" href="/api/export">⇩ Download CSV</a></div>
      <div class="export-box"><div><h3>Import voter records</h3><p>Preview a CSV, preserve or replace duplicates, and create household relationships.</p></div><button class="btn" data-modal="import">↑ Import CSV</button></div>
    </section>
    <section class="card section-card queue"><h3>Message queue</h3><p style="color:var(--muted);font-size:12px">Local simulation of scheduled server delivery.</p>${messages.length ? messages.map(m => `<div class="queue-row"><div><strong>${esc(m.recipient)}</strong><small>${esc(m.kind)} · ${new Date(m.scheduledFor).toLocaleString()}</small></div><span class="${m.status === "queued" ? "queued" : "delivered"}">${m.status === "queued" ? "Queued" : "Simulated delivered"}</span></div>`).join("") : `<div class="empty">No messages have been queued.</div>`}</section>`);
}

function modalMarkup() {
  if (modal !== "import") return "";
  return `<div class="modal-backdrop" data-close-modal><div class="modal" onclick="event.stopPropagation()"><div class="modal-head"><div><h3>Import voter records</h3><p style="color:var(--muted);font-size:12px">Use the included CSV template or upload your own compatible file.</p></div><button class="close" data-close-modal>×</button></div>
    <div class="button-row"><button class="btn primary" id="choose-csv">Choose CSV</button><a class="btn" href="/sample-voter-import.csv" download>Download template</a></div>
    ${importRows.length ? `<div class="preview"><table><thead><tr><th>Name</th><th>Town</th><th>Phone</th><th>Family</th><th>Consent</th></tr></thead><tbody>${importRows.slice(0,30).map(r => `<tr><td>${esc(r.firstName)} ${esc(r.lastName)}</td><td>${esc(r.town)}</td><td>${esc(r.phone)}</td><td>${esc(r.familyId)}</td><td>${esc(r.consent)}</td></tr>`).join("")}</tbody></table></div><label style="font-size:12px"><input type="checkbox" id="replace-duplicates" /> Replace matching records</label><div class="button-row" style="margin-top:16px"><button class="btn primary" id="confirm-import">Import ${importRows.length} records</button></div>` : `<div class="empty">Select a CSV to preview its records.</div>`}
  </div></div>`;
}

function render() {
  if (!state) return;
  app.innerHTML = view === "poll" ? pollView() : view === "team" ? teamView() : view === "campaigns" ? campaignsView() : exportsView();
}

async function refresh() { state = await request("/api/state"); render(); }

app.addEventListener("click", async event => {
  const viewButton = event.target.closest("[data-view]");
  if (viewButton) { view = viewButton.dataset.view; render(); return; }
  const voterButton = event.target.closest("[data-voter]");
  if (voterButton) { selectedVoterId = Number(voterButton.dataset.voter); render(); return; }
  const checkin = event.target.closest("[data-checkin]");
  if (checkin) { try { await request("/api/checkin", { method: "POST", body: JSON.stringify({ voterId: checkin.dataset.checkin }) }); flash("Vote check-in recorded with an audit timestamp."); await refresh(); } catch (e) { flash(e.message); } return; }
  const message = event.target.closest("[data-message]");
  if (message) { try { const delay = document.querySelector("#delay")?.value || 0; const result = await request("/api/messages", { method: "POST", body: JSON.stringify({ voterId: message.dataset.voterId, target: message.dataset.message, delay }) }); state = result.state; flash(`${result.queued} message${result.queued === 1 ? "" : "s"} queued.`); render(); } catch (e) { flash(e.message); } return; }
  const openModal = event.target.closest("[data-modal]");
  if (openModal) { modal = openModal.dataset.modal; render(); return; }
  if (event.target.closest("[data-close-modal]")) { modal = null; importRows = []; render(); return; }
  if (event.target.closest("#choose-csv")) { csvInput.click(); return; }
  if (event.target.closest("#confirm-import")) { try { const result = await request("/api/import", { method: "POST", body: JSON.stringify({ rows: importRows, replace: document.querySelector("#replace-duplicates").checked }) }); state = result.state; modal = null; importRows = []; flash(`Import complete: ${result.added} added${result.replaced ? `, ${result.replaced} replaced` : ""}.`); render(); } catch (e) { flash(e.message); } }
});

app.addEventListener("change", async event => {
  if (event.target.id === "campaign-select") { state = await request("/api/campaign", { method: "POST", body: JSON.stringify({ campaignId: event.target.value }) }); town = campaign().assignment.town; query = ""; selectedVoterId = null; render(); }
  if (event.target.id === "town") { town = event.target.value; selectedVoterId = null; render(); }
});

app.addEventListener("input", event => {
  if (event.target.id === "search") { query = event.target.value; selectedVoterId = null; render(); const input = document.querySelector("#search"); input.focus(); input.setSelectionRange(query.length, query.length); }
});

app.addEventListener("submit", async event => {
  event.preventDefault();
  if (event.target.id === "invite-form") {
    const data = Object.fromEntries(new FormData(event.target));
    try { const invite = await request("/api/invites", { method: "POST", body: JSON.stringify(data) }); const result = document.querySelector("#invite-result"); result.className = "invite-result"; result.innerHTML = `<strong>Quicklink ready</strong><code>${esc(invite.url)}</code><button class="btn" id="copy-link" type="button" style="margin-top:10px">Copy link</button>`; document.querySelector("#copy-link").onclick = async () => { await navigator.clipboard.writeText(invite.url); flash("Quicklink copied."); }; } catch (e) { flash(e.message); }
  }
  if (event.target.id === "settings-form") {
    const data = Object.fromEntries(new FormData(event.target)); data.familyDelay = Number(data.familyDelay); data.voterDelay = Number(data.voterDelay);
    try { await request("/api/settings", { method: "POST", body: JSON.stringify(data) }); flash("Campaign settings saved."); await refresh(); } catch (e) { flash(e.message); }
  }
});

csvInput.addEventListener("change", async () => {
  const file = csvInput.files[0]; if (!file) return;
  const text = await file.text();
  const rows = parseCsv(text); const headers = rows.shift().map(h => h.trim().toLowerCase());
  const keyMap = { first_name: "firstName", last_name: "lastName", town: "town", phone: "phone", family_id: "familyId", address: "address", ward: "ward", polling_place: "pollingPlace", age: "age", consent: "consent" };
  importRows = rows.filter(r => r.some(Boolean)).map(r => Object.fromEntries(headers.map((h, i) => [keyMap[h] || h, r[i] ?? ""]))).filter(r => r.firstName && r.lastName && r.town);
  csvInput.value = ""; render();
});

function parseCsv(text) {
  const rows = []; let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) { const c = text[i], n = text[i + 1]; if (quoted && c === '"' && n === '"') { field += '"'; i++; } else if (c === '"') quoted = !quoted; else if (c === "," && !quoted) { row.push(field); field = ""; } else if ((c === "\n" || c === "\r") && !quoted) { if (c === "\r" && n === "\n") i++; row.push(field); rows.push(row); row = []; field = ""; } else field += c; }
  if (field || row.length) { row.push(field); rows.push(row); } return rows;
}

await refresh();
setInterval(async () => { if (view === "exports") { state = await request("/api/state"); render(); } }, 6000);
