-- Cover frequently used campaign membership and audit lookups as the pilot grows.
create index memberships_campaign_lookup on public.memberships(campaign_id,user_id);
create index audit_events_campaign_recent on private.audit_events(campaign_id,id desc);
create index audit_events_actor_lookup on private.audit_events(actor_id);
