-- Election Day Hub Supabase pilot. Apply only to a new, empty Supabase project.
-- No voter records or credentials are included in this migration.
create schema if not exists private;

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(name) between 1 and 120),
  created_at timestamptz not null default now()
);
create table public.memberships (
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  role text not null check (role in ('admin','staff','volunteer')),
  active boolean not null default true,
  primary key (user_id,campaign_id)
);
create table public.voters (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  external_id text not null check (length(external_id) between 1 and 100),
  first_name text not null check (length(first_name) between 1 and 100),
  last_name text not null check (length(last_name) between 1 and 100),
  town text not null check (length(town) between 1 and 100),
  ward text not null default '',
  polling_place text not null default '',
  voted_at timestamptz,
  unique (campaign_id,external_id)
);
create index voters_lookup on public.voters(campaign_id,last_name,first_name);
create table private.voter_details (
  voter_id uuid primary key references public.voters(id) on delete cascade,
  address text not null default '', phone text not null default '',
  family_id text not null default '', consent boolean not null default false
);
create table private.audit_events (
  id bigint generated always as identity primary key,
  actor_id uuid not null references auth.users(id),
  campaign_id uuid not null references public.campaigns(id),
  action text not null, target text not null default '',
  at timestamptz not null default now()
);

-- Revoke default public-schema grants before adding narrow read-only access.
revoke all on public.campaigns,public.memberships,public.voters from anon,authenticated;
grant select on public.campaigns,public.memberships,public.voters to authenticated;
revoke all on schema private from public,anon,authenticated;
grant usage on schema private to authenticated;

alter table public.campaigns enable row level security;
alter table public.memberships enable row level security;
alter table public.voters enable row level security;
alter table private.voter_details enable row level security;
alter table private.audit_events enable row level security;

create function private.member_role(p_campaign_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select m.role from public.memberships m
  where m.user_id = (select auth.uid()) and m.campaign_id = p_campaign_id and m.active
  limit 1
$$;
revoke all on function private.member_role(uuid) from public,anon;
grant execute on function private.member_role(uuid) to authenticated;

create policy campaigns_member_read on public.campaigns for select to authenticated
  using (private.member_role(id) is not null);
create policy memberships_self_read on public.memberships for select to authenticated
  using (user_id = (select auth.uid()));
create policy voters_member_read on public.voters for select to authenticated
  using (private.member_role(campaign_id) is not null);

-- Privileged writes are behind private functions with explicit membership checks.
create function private.mark_voted(p_voter_id uuid) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare v_campaign uuid; v_at timestamptz;
begin
  select v.campaign_id into v_campaign from public.voters v where v.id=p_voter_id;
  if v_campaign is null or private.member_role(v_campaign) is null then
    raise exception 'Record unavailable';
  end if;
  update public.voters set voted_at=clock_timestamp()
    where id=p_voter_id and voted_at is null returning voted_at into v_at;
  if v_at is null then raise exception 'Already marked or unavailable'; end if;
  insert into private.audit_events(actor_id,campaign_id,action,target)
    values(auth.uid(),v_campaign,'poll-watch-marked',p_voter_id::text);
  return v_at;
end $$;
create function public.mark_voted(p_voter_id uuid) returns timestamptz
language sql security invoker set search_path = '' as $$
  select private.mark_voted(p_voter_id)
$$;

create function private.import_voters(p_campaign_id uuid,p_rows jsonb,p_replace boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r jsonb; v_id uuid; n_added integer:=0; n_updated integer:=0; n_seen integer;
begin
  if private.member_role(p_campaign_id) <> 'admin' or private.member_role(p_campaign_id) is null then
    raise exception 'Admin access required';
  end if;
  if coalesce(jsonb_typeof(p_rows),'') <> 'array' then
    raise exception 'Use a batch of 1 to 500 records';
  end if;
  if jsonb_array_length(p_rows) not between 1 and 500 then
    raise exception 'Use a batch of 1 to 500 records';
  end if;
  select count(*)-count(distinct x->>'externalId') into n_seen
    from jsonb_array_elements(p_rows) x;
  if n_seen <> 0 then raise exception 'Duplicate external IDs in batch'; end if;
  for r in select value from jsonb_array_elements(p_rows) loop
    if jsonb_typeof(r) <> 'object'
       or nullif(trim(r->>'externalId'),'') is null
       or nullif(trim(r->>'firstName'),'') is null
       or nullif(trim(r->>'lastName'),'') is null
       or nullif(trim(r->>'town'),'') is null
       or coalesce(jsonb_typeof(r->'consent'),'') <> 'boolean'
       or length(r->>'externalId') > 100 or length(r->>'firstName') > 100
       or length(r->>'lastName') > 100 or length(r->>'town') > 100
       or length(coalesce(r->>'address','')) > 250
       or length(coalesce(r->>'phone','')) > 50
       or length(coalesce(r->>'familyId','')) > 100 then
      raise exception 'Invalid voter row';
    end if;
    select id into v_id from public.voters
      where campaign_id=p_campaign_id and external_id=trim(r->>'externalId');
    if v_id is null then
      insert into public.voters(campaign_id,external_id,first_name,last_name,town,ward,polling_place)
      values(p_campaign_id,trim(r->>'externalId'),trim(r->>'firstName'),trim(r->>'lastName'),
        trim(r->>'town'),coalesce(r->>'ward',''),coalesce(r->>'pollingPlace','')) returning id into v_id;
      insert into private.voter_details(voter_id,address,phone,family_id,consent)
      values(v_id,coalesce(r->>'address',''),coalesce(r->>'phone',''),
        coalesce(r->>'familyId',''),(r->>'consent')::boolean);
      n_added:=n_added+1;
    elsif p_replace then
      update public.voters set first_name=trim(r->>'firstName'),last_name=trim(r->>'lastName'),
        town=trim(r->>'town'),ward=coalesce(r->>'ward',''),polling_place=coalesce(r->>'pollingPlace','')
        where id=v_id;
      update private.voter_details set address=coalesce(r->>'address',''),phone=coalesce(r->>'phone',''),
        family_id=coalesce(r->>'familyId',''),consent=(r->>'consent')::boolean where voter_id=v_id;
      n_updated:=n_updated+1;
    end if;
  end loop;
  insert into private.audit_events(actor_id,campaign_id,action,target)
    values(auth.uid(),p_campaign_id,'voter-import',n_added||' added, '||n_updated||' updated');
  return jsonb_build_object('added',n_added,'updated',n_updated);
end $$;
create function public.import_voters(p_campaign_id uuid,p_rows jsonb,p_replace boolean default false)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.import_voters(p_campaign_id,p_rows,p_replace)
$$;

create function private.export_voters(p_campaign_id uuid)
returns table(external_id text,first_name text,last_name text,town text,ward text,polling_place text,
              address text,phone text,family_id text,consent boolean,voted_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  if private.member_role(p_campaign_id) <> 'admin' or private.member_role(p_campaign_id) is null then
    raise exception 'Admin access required';
  end if;
  insert into private.audit_events(actor_id,campaign_id,action)
    values(auth.uid(),p_campaign_id,'voter-export');
  return query select v.external_id,v.first_name,v.last_name,v.town,v.ward,v.polling_place,
    d.address,d.phone,d.family_id,d.consent,v.voted_at
    from public.voters v join private.voter_details d on d.voter_id=v.id
    where v.campaign_id=p_campaign_id order by v.last_name,v.first_name;
end $$;
create function public.export_voters(p_campaign_id uuid)
returns table(external_id text,first_name text,last_name text,town text,ward text,polling_place text,
              address text,phone text,family_id text,consent boolean,voted_at timestamptz)
language sql security invoker set search_path = '' as $$
  select * from private.export_voters(p_campaign_id)
$$;

create function private.recent_audit(p_campaign_id uuid)
returns table(action text,target text,at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  if private.member_role(p_campaign_id) <> 'admin' or private.member_role(p_campaign_id) is null then
    raise exception 'Admin access required';
  end if;
  return query select a.action,a.target,a.at from private.audit_events a
    where a.campaign_id=p_campaign_id order by a.id desc limit 100;
end $$;
create function public.recent_audit(p_campaign_id uuid)
returns table(action text,target text,at timestamptz)
language sql security invoker set search_path = '' as $$
  select * from private.recent_audit(p_campaign_id)
$$;

revoke all on function private.mark_voted(uuid),private.import_voters(uuid,jsonb,boolean),
  private.export_voters(uuid),private.recent_audit(uuid) from public,anon;
grant execute on function private.mark_voted(uuid),private.import_voters(uuid,jsonb,boolean),
  private.export_voters(uuid),private.recent_audit(uuid) to authenticated;
revoke all on function public.mark_voted(uuid),public.import_voters(uuid,jsonb,boolean),
  public.export_voters(uuid),public.recent_audit(uuid) from public,anon;
grant execute on function public.mark_voted(uuid),public.import_voters(uuid,jsonb,boolean),
  public.export_voters(uuid),public.recent_audit(uuid) to authenticated;

