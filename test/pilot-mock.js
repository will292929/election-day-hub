if (typeof window !== 'undefined') {
const campaignA = '11111111-1111-4111-8111-111111111111';
const campaignB = '22222222-2222-4222-8222-222222222222';
const adminId = '33333333-3333-4333-8333-333333333333';
const volunteerId = '44444444-4444-4444-8444-444444444444';
const volunteerView = new URLSearchParams(location.search).get('role') === 'volunteer';
const state = {
  user: volunteerView ? { id: volunteerId, email: 'volunteer@example.invalid' } : { id: adminId, email: 'admin@example.invalid' },
  campaigns: [{ id: campaignA, name: 'Fictional Campaign A' }, { id: campaignB, name: 'Fictional Campaign B' }],
  memberships: [{ user_id: adminId, campaign_id: campaignA, role: 'admin', active: true }, { user_id: adminId, campaign_id: campaignB, role: 'admin', active: true }, { user_id: volunteerId, campaign_id: campaignA, role: 'volunteer', active: true }],
  voters: [{ id: '55555555-5555-4555-8555-555555555555', campaign_id: campaignA, external_id: 'DEMO-001', first_name: 'Ada', last_name: 'Sample', town: 'Sampletown', ward: '1', polling_place: 'Training Station A', voted_at: null }],
  volunteers: [{ user_id: volunteerId, email: 'volunteer@example.invalid' }],
  marks: 0,
};
window.PILOT_MOCK = state;
window.ELECTION_HUB_SUPABASE = { url: 'https://example.invalid', publishableKey: 'mock' };
function query(table) {
  let predicates = [], start = 0, end = Infinity;
  const source = table === 'campaigns' ? state.campaigns : table === 'memberships' ? state.memberships : state.voters;
  const builder = {
    select() { return this; },
    eq(key, value) { predicates.push(row => row[key] === value); return this; },
    in(key, values) { predicates.push(row => values.includes(row[key])); return this; },
    order() { return this; },
    range(from, to) { start = from; end = to; return this; },
    then(resolve) { resolve({ data: source.filter(row => predicates.every(fn => fn(row))).slice(start, end + 1), error: null }); },
  };
  return builder;
}
window.supabase = { createClient: () => ({
  auth: {
    getSession: async () => ({ data: { session: { user: state.user } }, error: null }),
    onAuthStateChange: () => {},
    signOut: async () => ({ data: {}, error: null }),
    updateUser: async () => ({ data: {}, error: null }),
    signInWithPassword: async () => ({ data: { session: { user: state.user } }, error: null }),
  },
  from: query,
  rpc: async (name, args) => {
    if (name === 'mark_voted') {
      state.marks++;
      const voter = state.voters.find(item => item.id === args.p_voter_id);
      if (voter.voted_at) return { data: null, error: { message: 'Already marked or unavailable' } };
      voter.voted_at = new Date().toISOString();
      return { data: voter.voted_at, error: null };
    }
    if (name === 'list_volunteers') return { data: state.volunteers, error: null };
    if (name === 'recent_audit') return { data: [], error: null };
    if (name === 'create_campaign') {
      const id = crypto.randomUUID(); state.campaigns.push({ id, name: args.p_name });
      state.memberships.push({ user_id: adminId, campaign_id: id, role: 'admin', active: true });
      return { data: id, error: null };
    }
    if (name === 'reassign_volunteer') {
      state.volunteers = [];
      return { data: args.p_to_campaign_id, error: null };
    }
    return { data: { added: 0, updated: 0 }, error: null };
  },
  functions: { invoke: async () => ({ data: { actionLink: 'https://example.invalid/invite' }, error: null }) },
}) };
}
