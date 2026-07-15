import type { Bed, BedStatus } from "../types";

const WARNING_MINUTES = 15;
const CRITICAL_MINUTES = 30;
const DEFAULT_DURATION_MINUTES = 45;

export function elapsedMinutes(startedAt: string | null, now: number): number | null {
  if (!startedAt) return null;

  const started = new Date(startedAt).getTime();
  if (Number.isNaN(started)) return null;

  return Math.max(0, Math.floor((now - started) / 60_000));
}

export function warningLevel(minutes: number | null): 0 | 1 | 2 {
  if (minutes === null || minutes < WARNING_MINUTES) return 0;
  if (minutes < CRITICAL_MINUTES) return 1;
  return 2;
}

export function formatElapsed(minutes: number | null) {
  if (minutes === null) return "-";
  if (minutes < 60) return `${minutes}분`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours}시간 ${rest}분`;
}

export function remainingMinutes(minutes: number | null, status: BedStatus): number | null {
  if (status === "empty" || minutes === null) return null;
  return Math.max(0, DEFAULT_DURATION_MINUTES - minutes);
}

export function formatRemaining(minutes: number | null, status: BedStatus) {
  if (status === "empty") return "";
  if (minutes === null) return "-";
  if (minutes === 0) return "종료 예정";
  return `${minutes}분 남음`;
}

function formatClock(startedAt: string | null) {
  if (!startedAt) return "";

  const started = new Date(startedAt);
  if (Number.isNaN(started.getTime())) return "";

  return new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false }).format(started);
}

export function minutesBetween(startedAt: string | null, endedAt: string | null) {
  if (!startedAt || !endedAt) return null;

  const started = new Date(startedAt).getTime();
  const ended = new Date(endedAt).getTime();
  if (Number.isNaN(started) || Number.isNaN(ended)) return null;

  return Math.max(0, Math.floor((ended - started) / 60_000));
}

export function formatStatusTimeline(bed: Bed, now: number) {
  if (bed.status === "empty") return [];

  if (bed.status === "waiting") {
    const waitingStartedAt = bed.waiting_started_at ?? bed.status_started_at;
    const waitingStarted = formatClock(waitingStartedAt);
    const waitingMinutes = elapsedMinutes(waitingStartedAt, now);
    if (!waitingStarted) return [];

    return [`${waitingStarted}~`, `(${formatElapsed(waitingMinutes)} 대기 중)`];
  }

  const treatmentStarted = formatClock(bed.status_started_at);
  const treatmentMinutes = elapsedMinutes(bed.status_started_at, now);
  const rows: string[] = [];

  if (bed.waiting_started_at && bed.status_started_at) {
    const waitingStarted = formatClock(bed.waiting_started_at);
    const waitingEnded = formatClock(bed.status_started_at);
    const waitingMinutes = minutesBetween(bed.waiting_started_at, bed.status_started_at);
    if (waitingStarted && waitingEnded) {
      rows.push(`대기 ${waitingStarted}~${waitingEnded} (${formatElapsed(waitingMinutes)})`);
    }
  }

  if (treatmentStarted) {
    rows.push(`시술중 ${treatmentStarted}~ (${formatElapsed(treatmentMinutes)} 경과)`);
  }

  return rows;
}

export function progressPercent(minutes: number | null, status: BedStatus) {
  if (status === "empty" || minutes === null) return 0;
  return Math.min(100, Math.max(6, Math.round((minutes / DEFAULT_DURATION_MINUTES) * 100)));
}

export function statusLabel(status: BedStatus) {
  if (status === "in_treatment") return "시술 중";
  if (status === "waiting") return "대기";
  return "빈 룸";
}


export function nextBedStatus(status: BedStatus): BedStatus {
  if (status === "empty") return "waiting";
  if (status === "waiting") return "in_treatment";
  return "empty";
}

// --- 달력 날짜 헬퍼 (KST 기준) ---
// 시각·UTC 차이 없이 연·월·일만 비교하기 위해, 모든 날짜를 로컬 자정 Date로 정규화해 사용한다.

const KST_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** KST 기준 "오늘"을 로컬 자정 Date로 반환한다. */
export function kstToday(): Date {
  const parts = KST_PARTS.formatToParts(new Date());
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
  return new Date(get("year"), get("month") - 1, get("day"));
}

/** 시각 정보를 제거한 로컬 자정 Date로 정규화한다. */
export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** 같은 달력 날짜(연·월·일)인지 비교한다. */
export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** 달력 날짜에 일수를 더한 새 Date를 반환한다(자정 기준). */
export function addDays(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount);
}

/** Returns a local-midnight calendar date shifted by month count. */
export function addMonths(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

/** a < b(날짜 단위)이면 true. */
export function isBeforeDay(a: Date, b: Date): boolean {
  return startOfDay(a).getTime() < startOfDay(b).getTime();
}

/** 두 날짜 사이의 일수 차(b - a). 음수 가능. */
export function dayDiff(a: Date, b: Date): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86_400_000);
}

export function applyLocalStatus(bed: Bed, status: BedStatus): Bed {
  const now = new Date().toISOString();

  if (status === "empty") {
    return {
      ...bed,
      status,
      status_started_at: now,
      waiting_started_at: null,
      customer_name: null,
      treatment_name: null,
      is_follow_up: false,
      updated_at: now,
    };
  }

  if (status === "waiting") {
    return {
      ...bed,
      status,
      status_started_at: now,
      waiting_started_at: now,
      updated_at: now,
    };
  }

  return {
    ...bed,
    status,
    status_started_at: now,
    waiting_started_at: bed.status === "waiting" ? bed.waiting_started_at ?? bed.status_started_at : bed.waiting_started_at ?? null,
    updated_at: now,
  };
}
