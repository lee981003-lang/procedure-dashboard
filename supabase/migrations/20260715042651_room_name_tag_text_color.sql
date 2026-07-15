-- D-027 룸 이름칸 배경/글자색 독립 설정.
-- 팔레트 hex 집합은 src/roomTagPalette.ts의 TAG_BG_PALETTE/TAG_TEXT_PALETTE와 수기로 동기화한다.

alter table public.rooms
  add column if not exists name_tag_text_color text;

-- D-026 백필 외형을 유지하되 글자색은 독립 컬럼으로 분리한다.
update public.rooms set name_tag_text_color = '#7c3aed' where name_tag_text_color is null and name like '%VIP%';
update public.rooms set name_tag_text_color = '#006cff' where name_tag_text_color is null and name like '%제모%';
update public.rooms set name_tag_text_color = '#f15a24' where name_tag_text_color is null and (name like '%진료%' or name like '%처치%');
update public.rooms set name_tag_text_color = '#10a23c' where name_tag_text_color is null and name like '%레이저%';
update public.rooms set name_tag_text_color = '#f97316' where name_tag_text_color is null and name like '%관리%';

drop function if exists public.set_room_color(uuid, text);
drop function if exists private.set_room_color(uuid, text);

create or replace function private.set_room_colors(p_room_id uuid, p_bg text, p_fg text)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bg text;
  v_fg text;
  v_room public.rooms;
begin
  perform private.require_admin();

  if p_bg is null then
    v_bg := null;
  else
    v_bg := lower(btrim(p_bg));
    if v_bg not in (
      '#f3e8ff', '#e8f1ff', '#fff0e8', '#e9f9ed',
      '#fff1e6', '#ffe8f1', '#e6f7f5', '#eef0f4'
    ) then
      raise exception '허용되지 않은 배경색입니다.' using errcode = '22023';
    end if;
  end if;

  if p_fg is null then
    v_fg := null;
  else
    v_fg := lower(btrim(p_fg));
    if v_fg not in (
      '#1f2937', '#7c3aed', '#006cff', '#f15a24',
      '#10a23c', '#f97316', '#db2777', '#0d9488'
    ) then
      raise exception '허용되지 않은 글자색입니다.' using errcode = '22023';
    end if;
  end if;

  update public.rooms
  set name_tag_color = v_bg,
      name_tag_text_color = v_fg
  where id = p_room_id
  returning * into v_room;

  if v_room.id is null then
    raise exception '룸을 찾을 수 없습니다.' using errcode = '02000';
  end if;

  return v_room;
end;
$$;

create or replace function public.set_room_colors(p_room_id uuid, p_bg text, p_fg text)
returns public.rooms
language sql
security invoker
set search_path = ''
as $$
  select private.set_room_colors(p_room_id, p_bg, p_fg);
$$;

revoke all on function private.set_room_colors(uuid, text, text) from public, anon, authenticated;
revoke all on function public.set_room_colors(uuid, text, text) from public, anon, authenticated;

grant execute on function private.set_room_colors(uuid, text, text) to authenticated;
grant execute on function public.set_room_colors(uuid, text, text) to authenticated;
