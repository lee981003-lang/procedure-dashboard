-- D-026 룸 이름칸 색상 설정.
-- rooms.name_tag_color 컬럼 추가 + set_room_color RPC(팔레트 화이트리스트, admin 전용).
-- 화이트리스트 hex 집합은 프런트 기준 팔레트(src/roomTagPalette.ts)의 bg 목록과
-- 정확히 일치하도록 수기로 동기화한다(소문자 hex). 둘 중 하나를 바꾸면 함께 고친다.

alter table public.rooms
  add column if not exists name_tag_color text;

-- 자동 테마 제거 후에도 현 외형 유지: 기존 룸 색을 팔레트 근사값으로 백필.
update public.rooms set name_tag_color = '#f3e8ff' where name_tag_color is null and name like '%VIP%';
update public.rooms set name_tag_color = '#e8f1ff' where name_tag_color is null and name like '%제모%';
update public.rooms set name_tag_color = '#fff0e8' where name_tag_color is null and (name like '%진료%' or name like '%처치%');
update public.rooms set name_tag_color = '#e9f9ed' where name_tag_color is null and name like '%레이저%';
update public.rooms set name_tag_color = '#fff1e6' where name_tag_color is null and name like '%관리%';

create or replace function private.set_room_color(p_room_id uuid, p_color text)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_color text;
  v_room public.rooms;
begin
  perform private.require_admin();

  -- null = 기본색 초기화. 그 외에는 허용 팔레트 hex(소문자)만 통과.
  if p_color is null then
    v_color := null;
  else
    v_color := lower(btrim(p_color));
    if v_color not in (
      '#f3e8ff', '#e8f1ff', '#fff0e8', '#e9f9ed',
      '#fff1e6', '#ffe8f1', '#e6f7f5', '#eef0f4'
    ) then
      raise exception '허용되지 않은 색상입니다.' using errcode = '22023';
    end if;
  end if;

  update public.rooms
  set name_tag_color = v_color
  where id = p_room_id
  returning * into v_room;

  if v_room.id is null then
    raise exception '룸을 찾을 수 없습니다.' using errcode = '02000';
  end if;

  return v_room;
end;
$$;

create or replace function public.set_room_color(p_room_id uuid, p_color text)
returns public.rooms
language sql
security invoker
set search_path = ''
as $$
  select private.set_room_color(p_room_id, p_color);
$$;

revoke all on function private.set_room_color(uuid, text) from public, anon, authenticated;
revoke all on function public.set_room_color(uuid, text) from public, anon, authenticated;

grant execute on function private.set_room_color(uuid, text) to authenticated;
grant execute on function public.set_room_color(uuid, text) to authenticated;
