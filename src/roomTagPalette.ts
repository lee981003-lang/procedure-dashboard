// D-027 룸 이름칸 색상 팔레트 — 프런트 기준값.
// 마이그레이션 SQL의 set_room_colors 화이트리스트와 수기로 동기화한다(소문자 hex).

export type RoomTagSwatch = {
  /** 이름칸 색상 hex (소문자). */
  value: string;
  /** 설정 UI 스와치 접근성 라벨. */
  label: string;
};

// 미설정(null) 룸의 중립 기본색.
export const DEFAULT_TAG_BG = "#ffffff";
export const DEFAULT_TAG_FG = "#1f2937";

export const TAG_BG_PALETTE: RoomTagSwatch[] = [
  { value: "#f3e8ff", label: "라벤더" },
  { value: "#e8f1ff", label: "블루" },
  { value: "#fff0e8", label: "오렌지" },
  { value: "#e9f9ed", label: "그린" },
  { value: "#fff1e6", label: "앰버" },
  { value: "#ffe8f1", label: "핑크" },
  { value: "#e6f7f5", label: "틸" },
  { value: "#eef0f4", label: "그레이" },
];

export const TAG_TEXT_PALETTE: RoomTagSwatch[] = [
  { value: "#1f2937", label: "차콜" },
  { value: "#7c3aed", label: "라벤더" },
  { value: "#006cff", label: "블루" },
  { value: "#f15a24", label: "오렌지" },
  { value: "#10a23c", label: "그린" },
  { value: "#f97316", label: "앰버" },
  { value: "#db2777", label: "핑크" },
  { value: "#0d9488", label: "틸" },
];

const BG_VALUES = new Set(TAG_BG_PALETTE.map((swatch) => swatch.value));
const FG_VALUES = new Set(TAG_TEXT_PALETTE.map((swatch) => swatch.value));

/**
 * 저장된 배경/글자 hex를 각각 검증한다.
 * 미설정(null·빈값)이거나 팔레트 밖 알 수 없는 값이면 해당 색만 중립 기본색으로 처리한다.
 */
export function resolveTagColors(
  bg: string | null | undefined,
  fg: string | null | undefined,
): { bg: string; fg: string } {
  const normalizedBg = bg?.toLowerCase();
  const normalizedFg = fg?.toLowerCase();

  return {
    bg: normalizedBg && BG_VALUES.has(normalizedBg) ? normalizedBg : DEFAULT_TAG_BG,
    fg: normalizedFg && FG_VALUES.has(normalizedFg) ? normalizedFg : DEFAULT_TAG_FG,
  };
}
