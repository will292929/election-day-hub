-- Lets an existing pilot administrator create a destination campaign in the
-- application; the creator becomes its admin. No public campaign creation.
create function private.create_campaign(p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_name text := trim(coalesce(p_name, ''));
begin
  if (select auth.uid()) is null or not exists (
    select 1 from public.memberships m
    where m.user_id = (select auth.uid()) and m.role = 'admin' and m.active
  ) then
    raise exception 'Admin access required';
  end if;
  if length(v_name) not between 1 and 120 then
    raise exception 'Campaign name must be 1 to 120 characters';
  end if;
  insert into public.campaigns(name) values(v_name) returning id into v_id;
  insert into public.memberships(user_id,campaign_id,role,active)
    values((select auth.uid()),v_id,'admin',true);
  insert into private.audit_events(actor_id,campaign_id,action,target)
    values((select auth.uid()),v_id,'campaign-created',v_name);
  return v_id;
end $$;

create function public.create_campaign(p_name text) returns uuid
language sql security invoker set search_path = '' as $$
  select private.create_campaign(p_name)
$$;

revoke all on function private.create_campaign(text),public.create_campaign(text)
  from public,anon;
grant execute on function private.create_campaign(text),public.create_campaign(text)
  to authenticated;
