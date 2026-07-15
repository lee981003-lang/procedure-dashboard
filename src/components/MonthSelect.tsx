import { useMemo } from "react";
import { addMonths, kstToday } from "../lib/time";

const monthLabel = new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long" });

function monthKey(month: Date) {
  return `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`;
}

function monthFromKey(key: string) {
  const [year, month] = key.split("-").map(Number);
  return new Date(year, month - 1, 1);
}

function currentKstMonth() {
  const today = kstToday();
  return new Date(today.getFullYear(), today.getMonth(), 1);
}

interface MonthSelectProps {
  value: Date;
  onChange: (month: Date) => void;
}

export function MonthSelect({ value, onChange }: MonthSelectProps) {
  const months = useMemo(() => {
    const current = currentKstMonth();
    return Array.from({ length: 12 }, (_, index) => addMonths(current, -index));
  }, []);

  return (
    <label className="month-select">
      <span>조회 월</span>
      <select value={monthKey(value)} onChange={(event) => onChange(monthFromKey(event.target.value))}>
        {months.map((month) => (
          <option key={monthKey(month)} value={monthKey(month)}>
            {monthLabel.format(month)}
          </option>
        ))}
      </select>
    </label>
  );
}
