import { BedCard } from "./BedCard";
import type { CSSProperties } from "react";

// Keep this in sync with the six floor-plan tracks in styles.css.
const MAX_COLS = 6;
import type { Bed, BedStatus, RoomWithBeds } from "../types";
import { resolveTagColors } from "../roomTagPalette";

interface RoomSectionProps {
  room: RoomWithBeds;
  now: number;
  onSetStatus: (bed: Bed, status: BedStatus) => Promise<void>;
  onSetFollowUp: (bed: Bed, isFollowUp: boolean) => Promise<void>;
}

export function RoomSection({ room, now, onSetStatus, onSetFollowUp }: RoomSectionProps) {
  const span = Math.min(room.beds.length || 1, MAX_COLS);
  const tag = resolveTagColors(room.name_tag_color, room.name_tag_text_color);
  const layoutStyle = {
    "--room-span": String(span),
    "--bed-cols": String(span),
    "--tag-bg": tag.bg,
    "--tag-fg": tag.fg,
  } as CSSProperties;

  return (
    <section className="room-section" style={layoutStyle}>
      <div className="room-heading">
        <h2>{room.name}</h2>
      </div>
      <div className="bed-grid">
        {room.beds.map((bed) => (
          <BedCard
            key={bed.id}
            bed={bed}
            now={now}
            onSetStatus={onSetStatus}
            onSetFollowUp={onSetFollowUp}
          />
        ))}
      </div>
    </section>
  );
}
