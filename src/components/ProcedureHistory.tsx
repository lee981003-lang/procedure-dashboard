import { useCallback, useEffect, useMemo, useState } from "react";
import { MonthSelect } from "./MonthSelect";
import { formatElapsed, kstToday, minutesBetween } from "../lib/time";
import { supabase } from "../lib/supabase";

type ProcedureRecord = {
  id: number;
  bed_label: string;
  room_name: string;
  customer_name: string | null;
  treatment_name: string | null;
  is_follow_up: boolean;
  waiting_started_at: string | null;
  treatment_started_at: string | null;
  completed_at: string;
  actor_username: string | null;
};

type ProcedureSummary = {
  total_count: number;
  walk_in_count: number;
  no_treatment_count: number;
  avg_waiting_minutes: number | string | null;
  median_waiting_minutes: number | string | null;
  avg_treatment_minutes: number | string | null;
  median_treatment_minutes: number | string | null;
};

const dateTime = new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "short" });

function currentMonth() {
  const today = kstToday();
  return new Date(today.getFullYear(), today.getMonth(), 1);
}

function minutesLabel(minutes: number | string | null | undefined) {
  if (minutes === null || minutes === undefined) return "-";
  const value = typeof minutes === "string" ? Number(minutes) : minutes;
  return Number.isFinite(value) ? `${value.toFixed(1)}분` : "-";
}

function elapsedLabel(startedAt: string | null, endedAt: string | null) {
  return formatElapsed(minutesBetween(startedAt, endedAt));
}

function customerLabel(record: ProcedureRecord) {
  const customer = record.customer_name?.trim() || "이름 없음";
  const treatment = record.treatment_name?.trim();
  return treatment ? `${customer} · ${treatment}` : customer;
}

export function ProcedureHistory() {
  const [month, setMonth] = useState(() => currentMonth());
  const [records, setRecords] = useState<ProcedureRecord[]>([]);
  const [summary, setSummary] = useState<ProcedureSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const params = useMemo(
    () => ({ p_year: month.getFullYear(), p_month: month.getMonth() + 1 }),
    [month],
  );

  const load = useCallback(async () => {
    if (!supabase) {
      setError("Supabase 연결 설정을 확인해 주세요.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const [recordsResult, summaryResult] = await Promise.all([
      supabase.rpc("get_procedure_records", { ...params, p_limit: 50, p_offset: 0 }),
      supabase.rpc("get_procedure_summary", params),
    ]);

    if (recordsResult.error || summaryResult.error) {
      setError("시술 기록을 불러오지 못했습니다.");
      setRecords([]);
      setSummary(null);
    } else {
      setRecords((recordsResult.data ?? []) as ProcedureRecord[]);
      setSummary(((summaryResult.data ?? [])[0] ?? null) as ProcedureSummary | null);
    }

    setLoading(false);
  }, [params]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="procedure-history" role="tabpanel" aria-label="시술 기록">
      <div className="activity-log__heading">
        <div>
          <h1>시술 기록</h1>
          <p>완료된 시술 기록과 월별 대기·시술 시간을 조회합니다.</p>
        </div>
        <div className="activity-log__actions">
          <MonthSelect value={month} onChange={setMonth} />
          <button className="admin-card__button" type="button" onClick={() => void load()} disabled={loading}>
            새로고침
          </button>
        </div>
      </div>

      <div className="procedure-history__summary" aria-label="월별 요약">
        <article>
          <span>완료</span>
          <strong>{summary?.total_count ?? 0}건</strong>
        </article>
        <article>
          <span>워크인</span>
          <strong>{summary?.walk_in_count ?? 0}건</strong>
        </article>
        <article>
          <span>미시술 종료</span>
          <strong>{summary?.no_treatment_count ?? 0}건</strong>
        </article>
        <article>
          <span>평균 대기</span>
          <strong>{minutesLabel(summary?.avg_waiting_minutes)}</strong>
        </article>
        <article>
          <span>중앙 대기</span>
          <strong>{minutesLabel(summary?.median_waiting_minutes)}</strong>
        </article>
        <article>
          <span>평균 시술</span>
          <strong>{minutesLabel(summary?.avg_treatment_minutes)}</strong>
        </article>
        <article>
          <span>중앙 시술</span>
          <strong>{minutesLabel(summary?.median_treatment_minutes)}</strong>
        </article>
      </div>

      {loading ? <p className="activity-log__empty">시술 기록을 불러오는 중입니다.</p> : null}
      {error ? <p className="activity-log__empty">{error}</p> : null}
      {!loading && !error && records.length === 0 ? (
        <p className="activity-log__empty">선택한 달에 완료된 시술 기록이 없습니다.</p>
      ) : null}

      {!loading && !error && records.length > 0 ? (
        <div className="activity-log__table-wrap">
          <table>
            <thead>
              <tr>
                <th>완료 시각</th>
                <th>룸·베드</th>
                <th>고객·시술</th>
                <th>대기</th>
                <th>시술</th>
                <th>작업자</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => {
                const waitingEnd = record.treatment_started_at ?? record.completed_at;
                return (
                  <tr key={record.id}>
                    <td>{dateTime.format(new Date(record.completed_at))}</td>
                    <td>
                      {record.room_name} · {record.bed_label}
                    </td>
                    <td>
                      {customerLabel(record)}
                      {record.is_follow_up ? <span className="procedure-history__tag">후속</span> : null}
                    </td>
                    <td>{elapsedLabel(record.waiting_started_at, waitingEnd)}</td>
                    <td>{elapsedLabel(record.treatment_started_at, record.completed_at)}</td>
                    <td>{record.actor_username || "알 수 없음"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
