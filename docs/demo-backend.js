// Public demo only: fictional seed records and browser-local state.
(() => {
  const key = "election-day-hub-public-demo-v1";
  const settings = () => ({ actionId: "", recipients: "family-and-voter", familyDelay: 0, voterDelay: 15, familyMessage: "Election Day logistics update from your campaign team.", voterMessage: "Election Day logistics update from your campaign team." });
  const seed = {
    user: { name: "Demo Admin", email: "demo@example.invalid", role: "Admin" },
    activeCampaignId: "hewes",
    campaigns: [
      { id: "hewes", name: "Hewes for State Senate", short: "HS", assignment: { site: "Harbor School", town: "Camden", ward: "Ward 2", shift: "2:00–8:00 PM" }, settings: settings() },
      { id: "question2", name: "Yes on Question 2", short: "Q2", assignment: { site: "Town Office", town: "Rockport", ward: "Ward 1", shift: "8:00 AM–2:00 PM" }, settings: settings() },
      { id: "pine", name: "Pine County Democrats", short: "PC", assignment: { site: "Lincolnville Central", town: "Lincolnville", ward: "Ward 1", shift: "10:00 AM–4:00 PM" }, settings: settings() }
    ],
    voters: [
      { id: 1, campaignId: "hewes", firstName: "Maya", lastName: "Chen", town: "Camden", phone: "207-555-0148", familyId: "HH-1008", address: "18 Harbor View Rd", ward: "Ward 2", pollingPlace: "Harbor School", age: 44, consent: true, votedAt: "2026-11-03T15:42:00.000Z", contacts: [{ id: "1a", name: "Eli Chen", relation: "Spouse", phone: "207-555-0182", contactedAt: null }, { id: "1b", name: "Nora Chen", relation: "Household", phone: "207-555-0171", contactedAt: "2026-11-03T14:25:00.000Z" }] },
      { id: 2, campaignId: "hewes", firstName: "Maya", lastName: "Connelly", town: "Camden", phone: "207-555-0168", familyId: "HH-1041", address: "41 Union Street", ward: "Ward 1", pollingPlace: "Town Office", age: 29, consent: true, votedAt: null, contacts: [] },
      { id: 3, campaignId: "hewes", firstName: "Will", lastName: "Austin", town: "Camden", phone: "207-555-0102", familyId: "HH-1012", address: "72 Elm Street", ward: "Ward 2", pollingPlace: "Harbor School", age: 38, consent: true, votedAt: null, contacts: [{ id: "3a", name: "Jamie Austin", relation: "Spouse", phone: "207-555-0103", contactedAt: null }] },
      { id: 4, campaignId: "hewes", firstName: "William", lastName: "Auburn", town: "Rockport", phone: "207-555-0140", familyId: "HH-1033", address: "7 Mechanic Street", ward: "Ward 1", pollingPlace: "Town Office", age: 62, consent: false, votedAt: null, contacts: [] },
      { id: 5, campaignId: "hewes", firstName: "Avery", lastName: "Brooks", town: "Lincolnville", phone: "207-555-0155", familyId: "HH-1077", address: "10 Hope Road", ward: "Ward 1", pollingPlace: "Lincolnville Central", age: 47, consent: true, votedAt: null, contacts: [] },
      { id: 6, campaignId: "question2", firstName: "Morgan", lastName: "Lee", town: "Rockport", phone: "207-555-0191", familyId: "HH-3001", address: "8 Sea Street", ward: "Ward 1", pollingPlace: "Town Office", age: 32, consent: true, votedAt: null, contacts: [] },
      { id: 7, campaignId: "pine", firstName: "Alex", lastName: "Rivera", town: "Lincolnville", phone: "207-555-0198", familyId: "HH-4001", address: "15 Center Road", ward: "Ward 1", pollingPlace: "Lincolnville Central", age: 53, consent: true, votedAt: null, contacts: [] }
    ],
    team: [
      { id: 1, initials: "DA", name: "Demo Admin", label: "Campaign administrator", scope: "Campaigns, settings, imports, exports, and team access", role: "Admin" },
      { id: 2, initials: "ST", name: "Campaign staff", label: "Campaign staff", scope: "One assigned campaign", role: "Staff" },
      { id: 3, initials: "VO", name: "Poll volunteers", label: "Poll volunteers", scope: "Assigned voter names, check-in, and the campaign Text button", role: "Volunteer" }
    ],
    invites: [], messages: [], audit: []
  };
  const clone = value => JSON.parse(JSON.stringify(value));
  let state;
  try { state = JSON.parse(localStorage.getItem(key)) || clone(seed); } catch { state = clone(seed); }
  const save = () => localStorage.setItem(key, JSON.stringify(state));
  const respond = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
  const fail = (message, status = 400) => respond({ error: message }, status);
  const csv = v => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s; };
  window.demoExport = () => {
    const header = ["first_name","last_name","town","phone","family_id","address","ward","polling_place","age","consent","voted_at"];
    const rows = state.voters.filter(v => v.campaignId === state.activeCampaignId).map(v => [v.firstName,v.lastName,v.town,v.phone,v.familyId,v.address,v.ward,v.pollingPlace,v.age,v.consent,v.votedAt || ""].map(csv).join(","));
    const blob = new Blob([[header.join(","), ...rows].join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "demo-campaign-voters.csv"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (resource, options = {}) => {
    const path = new URL(resource, location.href).pathname;
    const route = path.match(/\/api\/(\w+)$/)?.[1];
    if (!route) return originalFetch(resource, options);
    const input = options.body ? JSON.parse(options.body) : {};
    if (route === "state") return respond(state);
    if (route === "campaign") { if (!state.campaigns.some(c => c.id === input.campaignId)) return fail("Unknown campaign"); state.activeCampaignId = input.campaignId; save(); return respond(state); }
    if (route === "checkin") { const voter = state.voters.find(v => v.id === Number(input.voterId)); if (!voter) return fail("Voter not found", 404); if (!voter.votedAt) { voter.votedAt = new Date().toISOString(); state.audit.unshift({ action: "Voter check-in", voterId: voter.id, at: voter.votedAt }); save(); } return respond(voter); }
    if (route === "settings") { const c = state.campaigns.find(c => c.id === state.activeCampaignId); c.settings = { ...c.settings, ...input }; save(); return respond(c.settings); }
    if (route === "messages") {
      const voter = state.voters.find(v => v.id === Number(input.voterId)); if (!voter) return fail("Voter not found", 404); if (!voter.consent) return fail("Messaging consent is not on file");
      const c = state.campaigns.find(c => c.id === voter.campaignId); const recipients = [];
      if (input.target === "plan") { for (const contact of voter.contacts.filter(x => !x.contactedAt)) recipients.push({ kind: "family", ref: contact, delay: c.settings.familyDelay }); if (c.settings.recipients === "family-and-voter") recipients.push({ kind: "voter", ref: voter, delay: c.settings.voterDelay }); }
      else if (input.target === "voter") recipients.push({ kind: "voter", ref: voter, delay: Number(input.delay || 0) });
      else { const contact = voter.contacts.find(x => x.id === input.target && !x.contactedAt); if (!contact) return fail("Contact unavailable or already contacted"); recipients.push({ kind: "family", ref: contact, delay: Number(input.delay || 0) }); }
      const now = Date.now(); for (const r of recipients) { state.messages.unshift({ id: crypto.randomUUID(), campaignId: c.id, voterId: voter.id, recipient: r.ref.name || `${voter.firstName} ${voter.lastName}`, kind: r.kind, status: "demo-only", scheduledFor: new Date(now + r.delay * 60000).toISOString() }); if (r.kind === "family") r.ref.contactedAt = new Date().toISOString(); }
      save(); return respond({ queued: recipients.length, state });
    }
    if (route === "invites") { if (!input.phone?.trim()) return fail("Mobile number is required"); const invite = { id: crypto.randomUUID(), phone: input.phone, role: input.role, expires: input.expires, demo: true }; state.invites.unshift(invite); save(); return respond({ ...invite, url: `${location.origin}${location.pathname}?demo-invite=${invite.id}` }, 201); }
    if (route === "import") { let added = 0, replaced = 0; for (const row of input.rows || []) { const same = state.voters.find(v => v.campaignId === state.activeCampaignId && v.firstName.toLowerCase() === String(row.firstName).toLowerCase() && v.lastName.toLowerCase() === String(row.lastName).toLowerCase() && v.town.toLowerCase() === String(row.town).toLowerCase()); const record = { id: same?.id || Math.max(0, ...state.voters.map(v => v.id)) + 1, campaignId: state.activeCampaignId, firstName: row.firstName, lastName: row.lastName, town: row.town, phone: row.phone || "", familyId: row.familyId || "", address: row.address || "", ward: row.ward || "", pollingPlace: row.pollingPlace || "", age: Number(row.age || 0), consent: String(row.consent).toLowerCase() === "true", votedAt: same?.votedAt || null, contacts: same?.contacts || [] }; if (same && input.replace) { Object.assign(same, record); replaced++; } else if (!same) { state.voters.push(record); added++; } } save(); return respond({ added, replaced, state }); }
    return fail("Not found", 404);
  };
})();
