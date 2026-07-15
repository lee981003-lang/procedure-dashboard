begin;

create table public.procedure_records (
  id bigint generated always as identity primary key,
  bed_id uuid not null,
  bed_label text not null,
  room_name text not null,
  customer_name text,
  treatment_name text,
  is_follow_up boolean not null default false,
  waiting_started_at timestamptz,
  treatment_started_at timestamptz,
  completed_at timestamptz not null,
  actor_uid uuid not null,
  created_at timestamptz not null default now()
);

create index procedure_records_completed_at_idx on public.procedure_records (completed_at desc, id desc);

alter table public.procedure_records enable row level security;

revoke all on table public.procedure_records from public, anon, authenticated;
revoke all on sequence public.procedure_records_id_seq from public, anon, authenticated;

create or replace function private.set_bed_status(p_bed_id uuid, p_next_status text)
returns public.beds
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_uid uuid;
  v_before public.beds;
  v_bed public.beds;
  v_room_name text;
begin
  v_actor_uid := private.require_authenticated();

  if p_next_status not in ('empty', 'in_treatment', 'waiting') then
    raise exception 'invalid bed status: %', p_next_status using errcode = '22023';
  end if;

  select * into v_before from public.beds where id = p_bed_id for update;

  if v_before.id is null then
    raise exception 'bed not found' using errcode = '02000';
  end if;

  if p_next_status = 'empty' then
    if v_before.status <> 'empty' then
      select rooms.name into v_room_name
      from public.rooms
      where rooms.id = v_before.room_id;

      insert into public.procedure_records (
        bed_id,
        bed_label,
        room_name,
        customer_name,
        treatment_name,
        is_follow_up,
        waiting_started_at,
        treatment_started_at,
        completed_at,
        actor_uid
      )
      values (
        p_bed_id,
        v_before.label,
        v_room_name,
        v_before.customer_name,
        v_before.treatment_name,
        v_before.is_follow_up,
        v_before.waiting_started_at,
        case when v_before.status = 'in_treatment' then v_before.status_started_at else null end,
        now(),
        v_actor_uid
      );
    end if;

    update public.beds
    set status = p_next_status,
        status_started_at = now(),
        waiting_started_at = null,
        customer_name = null,
        treatment_name = null,
        is_follow_up = false
    where id = p_bed_id
    returning * into v_bed;

    perform private.log_bed_activity(
      'bed_status_change',
      p_bed_id,
      jsonb_build_object(
        'status', v_before.status,
        'customer_name', v_before.customer_name,
        'treatment_name', v_before.treatment_name,
        'is_follow_up', v_before.is_follow_up
      ),
      jsonb_build_object(
        'status', v_bed.status,
        'customer_name', v_bed.customer_name,
        'treatment_name', v_bed.treatment_name,
        'is_follow_up', v_bed.is_follow_up
      )
    );
  else
    update public.beds
    set status = p_next_status,
        status_started_at = now(),
        waiting_started_at = case when p_next_status = 'waiting' then now() else waiting_started_at end
    where id = p_bed_id
    returning * into v_bed;

    perform private.log_bed_activity(
      'bed_status_change',
      p_bed_id,
      jsonb_build_object('status', v_before.status),
      jsonb_build_object('status', v_bed.status)
    );
  end if;

  return v_bed;
end;
$$;

create function private.get_procedure_records(
  p_year integer,
  p_month integer,
  p_limit integer,
  p_offset integer
)
returns table (
  id bigint,
  bed_id uuid,
  bed_label text,
  room_name text,
  customer_name text,
  treatment_name text,
  is_follow_up boolean,
  waiting_started_at timestamptz,
  treatment_started_at timestamptz,
  completed_at timestamptz,
  actor_uid uuid,
  actor_username text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_start date := make_date(p_year, p_month, 1);
begin
  perform private.require_admin();

  return query
  select
    records.id,
    records.bed_id,
    records.bed_label,
    records.room_name,
    records.customer_name,
    records.treatment_name,
    records.is_follow_up,
    records.waiting_started_at,
    records.treatment_started_at,
    records.completed_at,
    records.actor_uid,
    split_part(users.email, '@', 1),
    records.created_at
  from public.procedure_records as records
  left join auth.users as users on users.id = records.actor_uid
  where records.completed_at >= (v_start::timestamp at time zone 'Asia/Seoul')
    and records.completed_at < ((v_start + interval '1 month')::timestamp at time zone 'Asia/Seoul')
  order by records.completed_at desc, records.id desc
  limit v_limit
  offset v_offset;
end;
$$;

create function public.get_procedure_records(
  p_year integer,
  p_month integer,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id bigint,
  bed_id uuid,
  bed_label text,
  room_name text,
  customer_name text,
  treatment_name text,
  is_follow_up boolean,
  waiting_started_at timestamptz,
  treatment_started_at timestamptz,
  completed_at timestamptz,
  actor_uid uuid,
  actor_username text,
  created_at timestamptz
)
language sql
security invoker
set search_path = ''
as $$
  select * from private.get_procedure_records(p_year, p_month, p_limit, p_offset);
$$;

create function private.get_procedure_summary(p_year integer, p_month integer)
returns table (
  total_count integer,
  walk_in_count integer,
  no_treatment_count integer,
  avg_waiting_minutes numeric,
  median_waiting_minutes numeric,
  avg_treatment_minutes numeric,
  median_treatment_minutes numeric
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_start date := make_date(p_year, p_month, 1);
begin
  perform private.require_admin();

  return query
  with scoped as (
    select *
    from public.procedure_records
    where completed_at >= (v_start::timestamp at time zone 'Asia/Seoul')
      and completed_at < ((v_start + interval '1 month')::timestamp at time zone 'Asia/Seoul')
  ),
  durations as (
    select
      waiting_started_at,
      treatment_started_at,
      case
        when waiting_started_at is null then null
        else greatest(0, extract(epoch from (coalesce(treatment_started_at, completed_at) - waiting_started_at)) / 60)::numeric
      end as waiting_minutes,
      case
        when treatment_started_at is null then null
        else greatest(0, extract(epoch from (completed_at - treatment_started_at)) / 60)::numeric
      end as treatment_minutes
    from scoped
  )
  select
    count(*)::integer,
    count(*) filter (where waiting_started_at is null)::integer,
    count(*) filter (where treatment_started_at is null)::integer,
    round(avg(waiting_minutes), 1),
    round((percentile_cont(0.5) within group (order by waiting_minutes) filter (where waiting_minutes is not null))::numeric, 1),
    round(avg(treatment_minutes), 1),
    round((percentile_cont(0.5) within group (order by treatment_minutes) filter (where treatment_minutes is not null))::numeric, 1)
  from durations;
end;
$$;

create function public.get_procedure_summary(p_year integer, p_month integer)
returns table (
  total_count integer,
  walk_in_count integer,
  no_treatment_count integer,
  avg_waiting_minutes numeric,
  median_waiting_minutes numeric,
  avg_treatment_minutes numeric,
  median_treatment_minutes numeric
)
language sql
security invoker
set search_path = ''
as $$
  select * from private.get_procedure_summary(p_year, p_month);
$$;

revoke all on function private.get_procedure_records(integer, integer, integer, integer) from public, anon, authenticated;
grant execute on function private.get_procedure_records(integer, integer, integer, integer) to authenticated;
revoke all on function public.get_procedure_records(integer, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.get_procedure_records(integer, integer, integer, integer) to authenticated;

revoke all on function private.get_procedure_summary(integer, integer) from public, anon, authenticated;
grant execute on function private.get_procedure_summary(integer, integer) to authenticated;
revoke all on function public.get_procedure_summary(integer, integer) from public, anon, authenticated;
grant execute on function public.get_procedure_summary(integer, integer) to authenticated;

commit;
