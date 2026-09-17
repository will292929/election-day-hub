-- A volunteer may have only one active volunteer campaign at a time.
-- Inactive rows remain as an assignment history. Admins/staff may manage
-- multiple campaigns, but a volunteer cannot be concurrently assigned twice.
create unique index memberships_one_active_volunteer
  on public.memberships (user_id)
  where active and role = 'volunteer';

create function private.list_volunteers(p_campaign_id uuid)
returns table(user_id uuid, email text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or private.member_role(p_campaign_id) is distinct from 'admin' then
    raise exception 'Admin access required';
  end if;
  return query
    select m.user_id, u.email::text
    from public.memberships m
    join auth.users u on u.id = m.user_id
    where m.campaign_id = p_campaign_id and m.active and m.role = 'volunteer'
    order by u.email;
end $$;

create function public.list_volunteers(p_campaign_id uuid)
returns table(user_id uuid, email text)
language sql stable security invoker set search_path = '' as $$
  select * from private.list_volunteers(p_campaign_id)
$$;

create function private.reassign_volunteer(
  p_user_id uuid, p_from_campaign_id uuid, p_to_campaign_id uuid
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_source_role text; v_target_role text;
begin
  if (select auth.uid()) is null or p_user_id is null
     or p_from_campaign_id is null or p_to_campaign_id is null
     or p_from_campaign_id = p_to_campaign_id then
    raise exception 'Invalid reassignment';
  end if;
  if private.member_role(p_from_campaign_id) is distinct from 'admin'
     or private.member_role(p_to_campaign_id) is distinct from 'admin' then
    raise exception 'Admin access required in both campaigns';
  end if;

  -- Serialize competing transfers for this user, then keep the membership
  -- change in the same short database transaction.
  perform 1 from auth.users u where u.id = p_user_id for update;
  if not found then raise exception 'Volunteer not found'; end if;

  select m.role into v_source_role from public.memberships m
    where m.user_id = p_user_id and m.campaign_id = p_from_campaign_id and m.active
    for update;
  if v_source_role is distinct from 'volunteer' then
    raise exception 'Active volunteer assignment not found';
  end if;
  select m.role into v_target_role from public.memberships m
    where m.user_id = p_user_id and m.campaign_id = p_to_campaign_id
    for update;
  if v_target_role is not null and v_target_role <> 'volunteer' then
    raise exception 'Target membership has a different role';
  end if;

  update public.memberships set active = false
    where user_id = p_user_id and campaign_id = p_from_campaign_id;
  insert into public.memberships (user_id, campaign_id, role, active)
    values (p_user_id, p_to_campaign_id, 'volunteer', true)
    on conflict (user_id, campaign_id) do update set active = true;

  insert into private.audit_events (actor_id, campaign_id, action, target)
    values ((select auth.uid()), p_from_campaign_id, 'volunteer-reassigned-out',
            p_user_id::text || ' -> ' || p_to_campaign_id::text),
           ((select auth.uid()), p_to_campaign_id, 'volunteer-reassigned-in',
            p_user_id::text || ' <- ' || p_from_campaign_id::text);
  return p_to_campaign_id;
end $$;

create function public.reassign_volunteer(
  p_user_id uuid, p_from_campaign_id uuid, p_to_campaign_id uuid
) returns uuid
language sql security invoker set search_path = '' as $$
  select private.reassign_volunteer(p_user_id, p_from_campaign_id, p_to_campaign_id)
$$;

revoke all on function private.list_volunteers(uuid),
  private.reassign_volunteer(uuid, uuid, uuid) from public, anon;
grant execute on function private.list_volunteers(uuid),
  private.reassign_volunteer(uuid, uuid, uuid) to authenticated;
revoke all on function public.list_volunteers(uuid),
  public.reassign_volunteer(uuid, uuid, uuid) from public, anon;
grant execute on function public.list_volunteers(uuid),
  public.reassign_volunteer(uuid, uuid, uuid) to authenticated;
