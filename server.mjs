import http from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync, createReadStream } from "node:fs";
import { extname, join, normalize } from "node:path";
import { randomBytes } from "node:crypto";

const PORT = Number(process.env.PORT || 4173);
const ROOT = new URL(".", import.meta.url).pathname.replace(/^\/(.:)/, "$1");
const PUBLIC = join(ROOT, "public");
const DATA = join(ROOT, "data", "state.json");

const seed = {
  user: { name: "Will Austin", email: "will.austin9.1939@gmail.com", role: "Admin" },
  activeCampaignId: "hewes",
  campaigns: [
    { id: "hewes", name: "Hewes for State Senate", short: "HS", assignment: { site: "Harbor School", town: "Camden", ward: "Ward 2", shift: "2:00–8:00 PM" }, settings: { actionId: "", recipients: "family-and-voter", familyDelay: 0, voterDelay: 15, familyMessage: "Election Day logistics update from your campaign team.", voterMessage: "Election Day logistics update from your campaign team." } },
    { id: "question2", name: "Yes on Question 2", short: "Q2", assignment: { site: "Town Office", town: "Rockport", ward: "Ward 1", shift: "8:00 AM–2:00 PM" }, settings: { actionId: "", recipients: "family-only", familyDelay: 5, voterDelay: 20, familyMessage: "A neutral Election Day reminder from the Yes on 2 team.", voterMessage: "Thanks for participating today." } },
    { id: "pine", name: "Pine County Democrats", short: "PC", assignment: { site: "Lincolnville Central", town: "Lincolnville", ward: "Ward 1", shift: "10:00 AM–4:00 PM" }, settings: { actionId: "", recipients: "family-and-voter", familyDelay: 0, voterDelay: 30, familyMessage: "Election Day information from your local campaign team.", voterMessage: "Election Day information from your local campaign team." } }
  ],
  voters: [
    { id: 1, campaignId: "hewes", firstName: "Maya", lastName: "Chen", town: "Camden", phone: "207-555-0148", familyId: "HH-1008", address: "18 Harbor View Rd", ward: "Ward 2", pollingPlace: "Harbor School", age: 44, consent: true, votedAt: "2026-11-03T15:42:00.000Z", contacts: [{ id: "1a", name: "Eli Chen", relation: "Spouse", phone: "207-555-0182", contactedAt: null }, { id: "1b", name: "Nora Chen", relation: "Household", phone: "207-555-0171", contactedAt: "2026-11-03T14:25:00.000Z" }] },
    { id: 2, campaignId: "hewes", firstName: "Maya", lastName: "Connelly", town: "Camden", phone: "207-555-0168", familyId: "HH-1041", address: "41 Union Street", ward: "Ward 1", pollingPlace: "Town Office", age: 29, consent: true, votedAt: null, contacts: [{ id: "2a", name: "Peter Connelly", relation: "Household", phone: "207-555-0119", contactedAt: null }] },
    { id: 3, campaignId: "hewes", firstName: "Will", lastName: "Austin", town: "Camden", phone: "207-555-0102", familyId: "HH-1012", address: "72 Elm Street", ward: "Ward 2", pollingPlace: "Harbor School", age: 38, consent: true, votedAt: null, contacts: [{ id: "3a", name: "Jamie Austin", relation: "Spouse", phone: "207-555-0103", contactedAt: null }] },
    { id: 4, campaignId: "hewes", firstName: "William", lastName: "Auburn", town: "Rockport", phone: "207-555-0140", familyId: "HH-1033", address: "7 Mechanic Street", ward: "Ward 1", pollingPlace: "Town Office", age: 62, consent: false, votedAt: null, contacts: [] },
    { id: 5, campaignId: "hewes", firstName: "Avery", lastName: "Brooks", town: "Lincolnville", phone: "207-555-0155", familyId: "HH-1077", address: "10 Hope Road", ward: "Ward 1", pollingPlace: "Lincolnville Central", age: 47, consent: true, votedAt: null, contacts: [{ id: "5a", name: "Sam Brooks", relation: "Household", phone: "207-555-0156", contactedAt: null }] },
    { id: 6, campaignId: "question2", firstName: "Morgan", lastName: "Lee", town: "Rockport", phone: "207-555-0191", familyId: "HH-3001", address: "8 Sea Street", ward: "Ward 1", pollingPlace: "Town Office", age: 32, consent: true, votedAt: null, contacts: [] },
    { id: 7, campaignId: "pine", firstName: "Alex", lastName: "Rivera", town: "Lincolnville", phone: "207-555-0198", familyId: "HH-4001", address: "15 Center Road", ward: "Ward 1", pollingPlace: "Lincolnville Central", age: 53, consent: true, votedAt: null, contacts: [] }
  ],
  team: [
    { id: 1, initials: "WH", name: "Will Austin", label: "Campaign administrator", scope: "Campaigns, settings, imports, exports, and team access", role: "Admin" },
    { id: 2, initials: "ST", name: "Campaign staff", label: "Campaign staff", scope: "Hewes for State Senate only", role: "Staff" },
    { id: 3, initials: "VO", name: "Poll volunteers", label: "Poll volunteers", scope: "Assigned voter names, check-in, and the campaign Text button", role: "Volunteer" }
  ],
  invites: [],
  messages: [],
  audit: []
};

await mkdir(join(ROOT, "data"), { recursive: true });
if (!existsSync(DATA)) await writeFile(DATA, JSON.stringify(seed, null, 2));

async function load() { return JSON.parse(await readFile(DATA, "utf8")); }
async function save(state) { await writeFile(DATA, JSON.stringify(state, null, 2)); }
function json(res, status, body) { res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }); res.end(JSON.stringify(body)); }
function bad(res, message, status = 400) { json(res, status, { error: message }); }
async function body(req) { const chunks = []; for await (const c of req) chunks.push(c); return chunks.length ? JSON.parse(Buffer.concat(chunks)) : {}; }

function csv(value) { const text = String(value ?? ""); return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text; }

async function api(req, res, path) {
  const state = await load();
  if (req.method === "GET" && path === "/api/state") return json(res, 200, state);
  if (req.method === "POST" && path === "/api/campaign") {
    const input = await body(req);
    if (!state.campaigns.some(c => c.id === input.campaignId)) return bad(res, "Unknown campaign");
    state.activeCampaignId = input.campaignId; await save(state); return json(res, 200, state);
  }
  if (req.method === "POST" && path === "/api/checkin") {
    const input = await body(req); const voter = state.voters.find(v => v.id === Number(input.voterId));
    if (!voter) return bad(res, "Voter not found", 404);
    if (!voter.votedAt) { voter.votedAt = new Date().toISOString(); state.audit.unshift({ id: Date.now(), action: "Voter check-in", voterId: voter.id, actor: state.user.email, at: voter.votedAt }); await save(state); }
    return json(res, 200, voter);
  }
  if (req.method === "POST" && path === "/api/messages") {
    const input = await body(req); const voter = state.voters.find(v => v.id === Number(input.voterId)); const campaign = state.campaigns.find(c => c.id === voter?.campaignId);
    if (!voter || !campaign) return bad(res, "Voter not found", 404);
    if (!voter.consent) return bad(res, "Messaging consent is not on file");
    const recipients = [];
    if (input.target === "plan") {
      for (const contact of voter.contacts.filter(c => !c.contactedAt)) recipients.push({ kind: "family", ref: contact, delay: campaign.settings.familyDelay, message: campaign.settings.familyMessage });
      if (campaign.settings.recipients === "family-and-voter") recipients.push({ kind: "voter", ref: voter, delay: campaign.settings.voterDelay, message: campaign.settings.voterMessage });
    } else if (input.target === "voter") recipients.push({ kind: "voter", ref: voter, delay: Number(input.delay ?? 0), message: campaign.settings.voterMessage });
    else {
      const contact = voter.contacts.find(c => c.id === input.target);
      if (!contact || contact.contactedAt) return bad(res, "Contact is unavailable or already contacted");
      recipients.push({ kind: "family", ref: contact, delay: Number(input.delay ?? 0), message: campaign.settings.familyMessage });
    }
    const now = Date.now();
    for (const r of recipients) {
      state.messages.unshift({ id: `${now}-${randomBytes(3).toString("hex")}`, campaignId: campaign.id, voterId: voter.id, recipient: r.ref.name || `${voter.firstName} ${voter.lastName}`, phone: r.ref.phone, kind: r.kind, message: r.message, status: "queued", scheduledFor: new Date(now + r.delay * 60000).toISOString(), createdAt: new Date(now).toISOString() });
      if (r.kind === "family") r.ref.contactedAt = new Date(now).toISOString();
    }
    state.audit.unshift({ id: now, action: `Queued ${recipients.length} message${recipients.length === 1 ? "" : "s"}`, voterId: voter.id, actor: state.user.email, at: new Date(now).toISOString() });
    await save(state); return json(res, 200, { queued: recipients.length, state });
  }
  if (req.method === "POST" && path === "/api/settings") {
    const input = await body(req); const campaign = state.campaigns.find(c => c.id === state.activeCampaignId);
    campaign.settings = { ...campaign.settings, ...input }; await save(state); return json(res, 200, campaign.settings);
  }
  if (req.method === "POST" && path === "/api/invites") {
    const input = await body(req); if (!input.phone?.trim()) return bad(res, "Mobile number is required");
    const hours = input.expires === "never" ? null : Number(input.expires);
    const invite = { id: randomBytes(5).toString("hex"), token: randomBytes(18).toString("base64url"), campaignId: state.activeCampaignId, phone: input.phone.trim(), email: input.email?.trim() || "", role: input.role || "Volunteer", createdAt: new Date().toISOString(), expiresAt: hours ? new Date(Date.now() + hours * 3600000).toISOString() : null, usedAt: null };
    state.invites.unshift(invite); await save(state); return json(res, 201, { ...invite, url: `http://localhost:${PORT}/join/${invite.token}` });
  }
  if (req.method === "POST" && path === "/api/import") {
    const input = await body(req); const rows = Array.isArray(input.rows) ? input.rows : []; let added = 0, replaced = 0;
    for (const row of rows) {
      const same = state.voters.find(v => v.campaignId === state.activeCampaignId && v.firstName.toLowerCase() === String(row.firstName).toLowerCase() && v.lastName.toLowerCase() === String(row.lastName).toLowerCase() && v.town.toLowerCase() === String(row.town).toLowerCase());
      const record = { id: same?.id || Math.max(0, ...state.voters.map(v => v.id)) + 1, campaignId: state.activeCampaignId, firstName: row.firstName, lastName: row.lastName, town: row.town, phone: row.phone || "", familyId: row.familyId || "", address: row.address || "", ward: row.ward || "", pollingPlace: row.pollingPlace || "", age: Number(row.age || 0), consent: String(row.consent).toLowerCase() === "true", votedAt: same?.votedAt || null, contacts: same?.contacts || [] };
      if (same && input.replace) { Object.assign(same, record); replaced++; } else if (!same) { state.voters.push(record); added++; }
    }
    state.audit.unshift({ id: Date.now(), action: `Imported ${added} voters${replaced ? `, replaced ${replaced}` : ""}`, actor: state.user.email, at: new Date().toISOString() }); await save(state); return json(res, 200, { added, replaced, state });
  }
  if (req.method === "GET" && path === "/api/export") {
    const rows = state.voters.filter(v => v.campaignId === state.activeCampaignId);
    const header = ["first_name","last_name","town","phone","family_id","address","ward","polling_place","age","consent","voted_at"];
    const out = [header.join(","), ...rows.map(v => [v.firstName,v.lastName,v.town,v.phone,v.familyId,v.address,v.ward,v.pollingPlace,v.age,v.consent,v.votedAt || ""].map(csv).join(","))].join("\n");
    res.writeHead(200, { "content-type": "text/csv", "content-disposition": "attachment; filename=campaign-voters.csv" }); return res.end(out);
  }
  return bad(res, "Not found", 404);
}

const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml" };
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`); const path = decodeURIComponent(url.pathname);
    if (path.startsWith("/api/")) return await api(req, res, path);
    const requested = path === "/" || path.startsWith("/join/") ? "index.html" : path.slice(1);
    const file = normalize(join(PUBLIC, requested));
    if (!file.startsWith(PUBLIC) || !existsSync(file)) { res.writeHead(404); return res.end("Not found"); }
    res.writeHead(200, { "content-type": types[extname(file)] || "application/octet-stream" }); createReadStream(file).pipe(res);
  } catch (error) { console.error(error); json(res, 500, { error: "Server error" }); }
});

setInterval(async () => {
  const state = await load(); let changed = false; const now = Date.now();
  for (const message of state.messages) if (message.status === "queued" && Date.parse(message.scheduledFor) <= now) { message.status = "simulated-delivered"; message.deliveredAt = new Date().toISOString(); changed = true; }
  if (changed) await save(state);
}, 5000).unref();

server.listen(PORT, () => console.log(`Election Day Hub running at http://localhost:${PORT}`));
