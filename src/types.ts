export const STATUS_OPTIONS = [
  { value: "empty", label: "빈 룸" },
  { value: "in_treatment", label: "시술중" },
  { value: "waiting", label: "시술대기" },
] as const;

export type BedStatus = (typeof STATUS_OPTIONS)[number]["value"];
export type ConnectionState = "local" | "connecting" | "live" | "error";

export interface Room {
  id: string;
  name: string;
  sort_order: number;
  name_tag_color: string | null;
  name_tag_text_color: string | null;
}

export interface Bed {
  id: string;
  room_id: string;
  label: string;
  sort_order: number;
  status: BedStatus;
  status_started_at: string | null;
  waiting_started_at: string | null;
  customer_name: string | null;
  treatment_name: string | null;
  is_follow_up: boolean;
  updated_at: string;
}

export interface RoomWithBeds extends Room {
  beds: Bed[];
}
