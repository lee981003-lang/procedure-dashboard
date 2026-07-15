import { FormEvent, PointerEvent as ReactPointerEvent, useRef, useState } from "react";
import { GripVertical, Plus, RefreshCw, Save, Store, Trash2 } from "lucide-react";
import { supabase } from "../lib/supabase";
import type { Bed, Room } from "../types";
import {
  DEFAULT_TAG_BG,
  DEFAULT_TAG_FG,
  TAG_BG_PALETTE,
  TAG_TEXT_PALETTE,
  resolveTagColors,
} from "../roomTagPalette";
import { ColorSelect } from "./ColorSelect";
import { Toast } from "./Toast";

type RoomBedSettingsProps = {
  rooms: Room[];
  beds: Bed[];
  loading: boolean;
  refresh: () => Promise<void>;
};

type ToastTone = "success" | "error";

const UNSET_COLOR = "__unset__";

export function RoomBedSettings({ rooms, beds, loading, refresh }: RoomBedSettingsProps) {
  const [pending, setPending] = useState<string | null>(null);
  const [roomName, setRoomName] = useState("");
  const [bedLabels, setBedLabels] = useState<Record<string, string>>({});
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<ToastTone>("success");

  const dragRef = useRef<{
    roomId: string;
    beds: Bed[];
    dragIndex: number;
    slot: number;
    containerTop: number;
    startY: number;
    pointerId: number;
  } | null>(null);
  const [dragView, setDragView] = useState<{
    roomId: string;
    dragIndex: number;
    slot: number;
    offsetY: number;
    overIndex: number;
  } | null>(null);

  const roomDragRef = useRef<{
    dragIndex: number;
    startX: number;
    startY: number;
    pointerId: number;
    centers: { x: number; y: number }[];
  } | null>(null);
  const [roomDragView, setRoomDragView] = useState<{
    dragIndex: number;
    offsetX: number;
    offsetY: number;
    overIndex: number;
  } | null>(null);

  const showMessage = (nextMessage: string, tone: ToastTone) => {
    setMessage(nextMessage);
    setMessageTone(tone);
  };

  const hasActive = (bedList: Bed[]) => bedList.some((bed) => bed.status !== "empty");
  const confirmActive = () => window.confirm("현재 시술중/시술대기 데이터가 있습니다. 수정하시겠습니까?");

  const run = async (action: string, rpc: string, args: Record<string, unknown>, successMessage: string) => {
    if (!supabase) {
      showMessage("Supabase 연결 설정을 확인해 주세요.", "error");
      return false;
    }

    setPending(action);
    try {
      const { error } = await supabase.rpc(rpc, args);
      if (error) {
        showMessage(error.message || "저장 중 오류가 발생했습니다.", "error");
        return false;
      }

      await refresh();
      showMessage(successMessage, "success");
      return true;
    } finally {
      setPending(null);
    }
  };

  const createRoom = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (await run("create-room", "create_room", { p_name: roomName }, "룸을 추가했습니다.")) setRoomName("");
  };

  const renameRoom = async (event: FormEvent<HTMLFormElement>, room: Room) => {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get("name") ?? "");
    if (hasActive(beds.filter((bed) => bed.room_id === room.id)) && !confirmActive()) return;
    if (await run(`rename-room-${room.id}`, "rename_room", { p_room_id: room.id, p_name: name }, "룸 이름을 변경했습니다.")) {
      setEditingRoomId(null);
    }
  };

  const moveRoom = async (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || toIndex >= rooms.length) return;
    if (hasActive(beds.filter((bed) => bed.room_id === rooms[fromIndex].id)) && !confirmActive()) return;
    const nextRooms = [...rooms];
    const [moved] = nextRooms.splice(fromIndex, 1);
    nextRooms.splice(toIndex, 0, moved);
    await run("reorder-rooms", "reorder_rooms", { p_room_ids: nextRooms.map((room) => room.id) }, "룸 순서를 변경했습니다.");
  };

  const closestRoomIndex = (centers: { x: number; y: number }[], clientX: number, clientY: number) => {
    let closest = 0;
    let closestDistance = Number.POSITIVE_INFINITY;
    centers.forEach((center, index) => {
      const distance = (center.x - clientX) ** 2 + (center.y - clientY) ** 2;
      if (distance < closestDistance) {
        closest = index;
        closestDistance = distance;
      }
    });
    return closest;
  };

  const onRoomPointerDown = (event: ReactPointerEvent<HTMLButtonElement>, roomIndex: number) => {
    if (pending !== null) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const handle = event.currentTarget;
    const gridEl = handle.closest(".rbs-grid") as HTMLElement | null;
    if (!gridEl) return;

    const cards = Array.from(gridEl.querySelectorAll<HTMLElement>(".rbs-room-card:not(.rbs-room-card--new)"));
    const centers = cards.map((card) => {
      const rect = card.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    });
    if (centers.length === 0) return;

    handle.setPointerCapture(event.pointerId);
    roomDragRef.current = {
      dragIndex: roomIndex,
      startX: event.clientX,
      startY: event.clientY,
      pointerId: event.pointerId,
      centers,
    };
    setRoomDragView({ dragIndex: roomIndex, offsetX: 0, offsetY: 0, overIndex: roomIndex });
    event.preventDefault();
  };

  const onRoomPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const state = roomDragRef.current;
    if (!state) return;
    const offsetX = event.clientX - state.startX;
    const offsetY = event.clientY - state.startY;
    const overIndex = closestRoomIndex(state.centers, event.clientX, event.clientY);
    setRoomDragView((prev) => (prev ? { ...prev, offsetX, offsetY, overIndex } : prev));
  };

  const finishRoomDrag = (event: ReactPointerEvent<HTMLButtonElement>, commit: boolean) => {
    const state = roomDragRef.current;
    roomDragRef.current = null;
    setRoomDragView(null);
    if (!state) return;
    try {
      event.currentTarget.releasePointerCapture(state.pointerId);
    } catch {
      // capture already released
    }
    if (!commit) return;
    const overIndex = closestRoomIndex(state.centers, event.clientX, event.clientY);
    if (overIndex !== state.dragIndex) {
      void moveRoom(state.dragIndex, overIndex);
    }
  };

  const setRoomColors = async (
    room: Room,
    nextBg: string | null | typeof UNSET_COLOR,
    nextFg: string | null | typeof UNSET_COLOR,
  ) => {
    const p_bg = nextBg === UNSET_COLOR ? room.name_tag_color : nextBg;
    const p_fg = nextFg === UNSET_COLOR ? room.name_tag_text_color : nextFg;
    if (room.name_tag_color === p_bg && room.name_tag_text_color === p_fg) return;

    await run(
      `set-room-colors-${room.id}`,
      "set_room_colors",
      { p_room_id: room.id, p_bg, p_fg },
      "룸 색상을 변경했습니다.",
    );
  };

  const deleteRoom = async (room: Room) => {
    if (!window.confirm(`'${room.name}' 룸과 비어 있는 베드를 삭제할까요?`)) return;
    await run(`delete-room-${room.id}`, "delete_room", { p_room_id: room.id }, "룸을 삭제했습니다.");
  };

  const createBed = async (event: FormEvent<HTMLFormElement>, room: Room) => {
    event.preventDefault();
    const label = bedLabels[room.id] ?? "";
    if (await run(`create-bed-${room.id}`, "create_bed", { p_room_id: room.id, p_label: label }, "베드를 추가했습니다.")) {
      setBedLabels((current) => ({ ...current, [room.id]: "" }));
    }
  };

  const renameBed = async (event: FormEvent<HTMLFormElement>, bed: Bed) => {
    event.preventDefault();
    const label = String(new FormData(event.currentTarget).get("label") ?? "");
    if (bed.status !== "empty" && !confirmActive()) return;
    await run(`rename-bed-${bed.id}`, "rename_bed", { p_bed_id: bed.id, p_label: label }, "베드 라벨을 변경했습니다.");
  };

  const moveBed = async (room: Room, roomBeds: Bed[], fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || toIndex >= roomBeds.length) return;
    if (roomBeds[fromIndex].status !== "empty" && !confirmActive()) return;
    const nextBeds = [...roomBeds];
    const [moved] = nextBeds.splice(fromIndex, 1);
    nextBeds.splice(toIndex, 0, moved);
    await run(`reorder-beds-${room.id}`, "reorder_beds", { p_room_id: room.id, p_bed_ids: nextBeds.map((bed) => bed.id) }, "베드 순서를 변경했습니다.");
  };

  const onBedPointerDown = (event: ReactPointerEvent<HTMLButtonElement>, room: Room, roomBeds: Bed[], bed: Bed) => {
    if (pending !== null) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const handle = event.currentTarget;
    const cardEl = handle.closest(".rbs-bed-card") as HTMLElement | null;
    const container = handle.closest(".rbs-bed-list") as HTMLElement | null;
    if (!cardEl || !container) return;
    const dragIndex = roomBeds.findIndex((item) => item.id === bed.id);
    if (dragIndex === -1) return;

    const cardRect = cardEl.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const styles = window.getComputedStyle(container);
    const gap = parseFloat(styles.rowGap || styles.gap || "8") || 8;
    const slot = cardRect.height + gap;

    handle.setPointerCapture(event.pointerId);
    dragRef.current = {
      roomId: room.id,
      beds: roomBeds,
      dragIndex,
      slot,
      containerTop: containerRect.top,
      startY: event.clientY,
      pointerId: event.pointerId,
    };
    setDragView({ roomId: room.id, dragIndex, slot, offsetY: 0, overIndex: dragIndex });
    event.preventDefault();
  };

  const computeOverIndex = (clientY: number) => {
    const state = dragRef.current;
    if (!state) return 0;
    return computeOverIndexFrom(state, clientY);
  };

  const onBedPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const state = dragRef.current;
    if (!state) return;
    const offsetY = event.clientY - state.startY;
    const overIndex = computeOverIndex(event.clientY);
    setDragView((prev) => (prev ? { ...prev, offsetY, overIndex } : prev));
  };

  const finishBedDrag = (event: ReactPointerEvent<HTMLButtonElement>, room: Room, commit: boolean) => {
    const state = dragRef.current;
    dragRef.current = null;
    setDragView(null);
    if (!state) return;
    try {
      event.currentTarget.releasePointerCapture(state.pointerId);
    } catch {
      // capture already released
    }
    if (!commit) return;
    const overIndex = computeOverIndexFrom(state, event.clientY);
    if (overIndex !== state.dragIndex) {
      void moveBed(room, state.beds, state.dragIndex, overIndex);
    }
  };

  const computeOverIndexFrom = (
    state: { containerTop: number; slot: number; beds: Bed[] },
    clientY: number,
  ) => {
    const raw = Math.floor((clientY - state.containerTop) / state.slot);
    return Math.max(0, Math.min(state.beds.length - 1, raw));
  };

  const deleteBed = async (bed: Bed) => {
    if (bed.status !== "empty") {
      showMessage("현재 시술중/시술대기 데이터가 있어 삭제할 수 없습니다.", "error");
      return;
    }
    if (!window.confirm(`'${bed.label}' 베드를 삭제할까요?`)) return;
    await run(`delete-bed-${bed.id}`, "delete_bed", { p_bed_id: bed.id }, "베드를 삭제했습니다.");
  };

  return (
    <section className="room-bed-settings" role="tabpanel" aria-label="룸/베드 설정">
      <div className="room-bed-settings__heading">
        <div>
          <h1>룸/베드 설정</h1>
        </div>
        <div className="room-bed-settings__toolbar">
          <form className="rbs-add-room" onSubmit={(event) => void createRoom(event)}>
            <input
              value={roomName}
              onChange={(event) => setRoomName(event.target.value)}
              placeholder="새 룸 이름"
              aria-label="새 룸 이름"
              required
            />
            <button className="rbs-add-btn rbs-add-btn--primary" type="submit" disabled={pending === "create-room"}>
              <Plus size={16} aria-hidden="true" />
              룸 추가
            </button>
          </form>
          <button className="admin-card__button" type="button" onClick={() => void refresh()} disabled={loading || pending !== null}>
            <RefreshCw size={16} aria-hidden="true" />
            새로고침
          </button>
        </div>
      </div>

      <div className="rbs-grid">
        {rooms.map((room, roomIndex) => {
          const roomBeds = beds.filter((bed) => bed.room_id === room.id);
          const tag = resolveTagColors(room.name_tag_color, room.name_tag_text_color);
          const roomDragging = roomDragView !== null && roomIndex === roomDragView.dragIndex;
          const roomDropTarget = roomDragView !== null && roomIndex === roomDragView.overIndex && !roomDragging;
          const roomTransform = roomDragging
            ? { transform: `translate(${roomDragView.offsetX}px, ${roomDragView.offsetY}px) scale(1.02)`, transition: "none" }
            : undefined;

          return (
            <section
              className={`rbs-room-card${roomDragging ? " rbs-room-card--dragging" : ""}${roomDropTarget ? " rbs-room-card--drop-target" : ""}`}
              key={room.id}
              style={roomTransform}
            >
              <header className="rbs-room-card__header">
                <button
                  className="rbs-drag-btn"
                  type="button"
                  onPointerDown={(event) => onRoomPointerDown(event, roomIndex)}
                  onPointerMove={onRoomPointerMove}
                  onPointerUp={(event) => finishRoomDrag(event, true)}
                  onPointerCancel={(event) => finishRoomDrag(event, false)}
                  disabled={pending !== null}
                  aria-label="룸 순서 변경"
                  title="룸 순서 변경"
                >
                  <GripVertical size={18} aria-hidden="true" />
                </button>

                {editingRoomId === room.id ? (
                  <form className="rbs-room-name-form" onSubmit={(event) => void renameRoom(event, room)}>
                    <input name="name" defaultValue={room.name} aria-label="룸 이름" required autoFocus />
                    <button className="rbs-icon-btn" type="submit" disabled={pending !== null} title="룸 이름 저장" aria-label="룸 이름 저장">
                      <Save size={15} aria-hidden="true" />
                    </button>
                  </form>
                ) : (
                  <button
                    type="button"
                    className="rbs-room-name-tag"
                    style={{ background: tag.bg, color: tag.fg }}
                    onClick={() => setEditingRoomId(room.id)}
                  >
                    {room.name}
                  </button>
                )}

                <button
                  className="rbs-icon-btn rbs-icon-btn--danger"
                  type="button"
                  onClick={() => void deleteRoom(room)}
                  disabled={pending !== null}
                  title="룸 삭제"
                  aria-label="룸 삭제"
                >
                  <Trash2 size={15} aria-hidden="true" />
                </button>
              </header>

              <div className="rbs-color-panel">
                <div className="rbs-color-panel__controls">
                  <ColorSelect
                    label="배경색"
                    value={room.name_tag_color}
                    options={TAG_BG_PALETTE}
                    defaultColor={DEFAULT_TAG_BG}
                    previewTextColor={tag.fg}
                    disabled={pending !== null}
                    onChange={(value) => void setRoomColors(room, value, UNSET_COLOR)}
                  />
                  <ColorSelect
                    label="글자색"
                    value={room.name_tag_text_color}
                    options={TAG_TEXT_PALETTE}
                    defaultColor={DEFAULT_TAG_FG}
                    previewTextColor="#ffffff"
                    disabled={pending !== null}
                    onChange={(value) => void setRoomColors(room, UNSET_COLOR, value)}
                  />
                </div>
                <span className="rbs-color-preview" style={{ background: tag.bg, color: tag.fg }}>
                  미리보기
                </span>
              </div>

              <div className="rbs-bed-list">
                {roomBeds.length === 0 ? (
                  <div className="rbs-empty-state">
                    <Store size={22} aria-hidden="true" />
                    <span>베드 없음</span>
                  </div>
                ) : (
                  roomBeds.map((bed, bedIndex) => {
                    const inDragColumn = dragView !== null && dragView.roomId === room.id;
                    const isDragging = inDragColumn && bedIndex === dragView!.dragIndex;
                    let transform: string | undefined;
                    if (inDragColumn) {
                      const { dragIndex, overIndex, slot, offsetY } = dragView!;
                      if (isDragging) {
                        transform = `translateY(${offsetY}px) scale(1.03)`;
                      } else if (dragIndex < overIndex && bedIndex > dragIndex && bedIndex <= overIndex) {
                        transform = `translateY(${-slot}px)`;
                      } else if (dragIndex > overIndex && bedIndex >= overIndex && bedIndex < dragIndex) {
                        transform = `translateY(${slot}px)`;
                      }
                    }
                    return (
                      <div
                        className={`rbs-bed-card${isDragging ? " rbs-bed-card--dragging" : ""}`}
                        key={bed.id}
                        style={transform ? { transform, transition: isDragging ? "none" : undefined } : undefined}
                      >
                        <button
                          className="rbs-drag-btn rbs-drag-btn--muted"
                          type="button"
                          onPointerDown={(event) => onBedPointerDown(event, room, roomBeds, bed)}
                          onPointerMove={onBedPointerMove}
                          onPointerUp={(event) => finishBedDrag(event, room, true)}
                          onPointerCancel={(event) => finishBedDrag(event, room, false)}
                          disabled={pending !== null}
                          aria-label="베드 순서 변경"
                          title="베드 순서 변경"
                        >
                          <GripVertical size={17} aria-hidden="true" />
                        </button>
                        <form className="rbs-bed-card__label" onSubmit={(event) => void renameBed(event, bed)}>
                          <input name="label" defaultValue={bed.label} aria-label="베드 라벨" required />
                          <button className="rbs-icon-btn" type="submit" disabled={pending !== null} title="라벨 저장" aria-label="라벨 저장">
                            <Save size={14} aria-hidden="true" />
                          </button>
                        </form>
                        <button
                          className="rbs-icon-btn rbs-icon-btn--danger"
                          type="button"
                          onClick={() => void deleteBed(bed)}
                          disabled={pending !== null}
                          title="베드 삭제"
                          aria-label="베드 삭제"
                        >
                          <Trash2 size={14} aria-hidden="true" />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>

              <form className="rbs-add-bed" onSubmit={(event) => void createBed(event, room)}>
                <input
                  value={bedLabels[room.id] ?? ""}
                  onChange={(event) => setBedLabels((current) => ({ ...current, [room.id]: event.target.value }))}
                  placeholder="새 베드 라벨"
                  aria-label="새 베드 라벨"
                  required
                />
                <button className="rbs-add-btn" type="submit" disabled={pending !== null}>
                  <Plus size={16} aria-hidden="true" />
                  베드 추가
                </button>
              </form>
            </section>
          );
        })}
      </div>

      {message ? <Toast message={message} tone={messageTone} onClose={() => setMessage(null)} /> : null}
    </section>
  );
}
