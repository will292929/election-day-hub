import { createClient } from 'npm:@supabase/supabase-js@2.116.0';

const url = Deno.env.get('SUPABASE_URL')!;
const publishableKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const redirectTo = 'https://will292929.github.io/election-day-hub/pilot.html';
const allowedOrigin = 'https://will292929.github.io';
const cors = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};
const reply = (status: number, body: object) => new Response(JSON.stringify(body), { status, headers: cors });

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return reply(405, { error: 'Method not allowed' });
  if (request.headers.get('origin') !== allowedOrigin) return reply(403, { error: 'Origin not allowed' });

  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return reply(401, { error: 'Sign in required' });

  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const userClient = createClient(url, publishableKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: identity, error: identityError } = await userClient.auth.getUser(token);
  if (identityError || !identity.user) return reply(401, { error: 'Sign in required' });

  let payload: { email?: unknown; campaignId?: unknown };
  try { payload = await request.json(); } catch { return reply(400, { error: 'Invalid request' }); }
  const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
  const campaignId = typeof payload.campaignId === 'string' ? payload.campaignId : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !/^[0-9a-f-]{36}$/i.test(campaignId)) {
    return reply(400, { error: 'Valid email and campaign are required' });
  }

  const { data: membership, error: memberError } = await admin.from('memberships')
    .select('role,active').eq('user_id', identity.user.id).eq('campaign_id', campaignId).maybeSingle();
  if (memberError || membership?.role !== 'admin' || !membership.active) return reply(403, { error: 'Admin access required' });

  if (email === identity.user.email?.toLowerCase()) return reply(400, { error: 'Use a different email for the volunteer' });

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: 'invite', email, options: { redirectTo },
  });
  if (linkError || !link?.properties?.action_link || !link.user?.id) {
    return reply(400, { error: linkError?.message || 'Could not create an invitation' });
  }

  const { data: existing } = await admin.from('memberships').select('role')
    .eq('user_id', link.user.id).eq('campaign_id', campaignId).maybeSingle();
  if (existing) return reply(409, { error: 'This person already has campaign access. Ask them to request a one-time sign-in link.' });
  const { error: assignError } = await admin.from('memberships').insert({
    user_id: link.user.id, campaign_id: campaignId, role: 'volunteer', active: true,
  });
  if (assignError) return reply(500, { error: 'Invitation created but access could not be assigned. Contact the administrator.' });
  return reply(200, { actionLink: link.properties.action_link, email });
});
