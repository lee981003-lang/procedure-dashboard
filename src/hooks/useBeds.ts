import { useCallback, useEffect, useMemo, useState } from "react";
import { fallbackBeds, fallbackRooms } from "../data/fallbackBeds";
import { hasSupabaseConfig, supabase } from "../lib/supabase";
import { applyLocalStatus } from "../lib/time";
import type { Bed, BedStatus, ConnectionState, Room } from "../types";

type MessageTone = "info" | "success" | "error";

function sortBeds(beds: Bed[]) {
  return [...beds].sort((a, b) => a.room_id.localeCompare(b.room_id) || a.sort_order - b.sort_order);
}

function sortRooms(rooms: Room[]) {
  return [...rooms].sort((a, b) => a.sort_order - b.sort_order);
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "저장 중 오류가 발생했습니다.";
}

export function useBeds() {
  const [rooms, setRooms] = useState<Room[]>(fallbackRooms);
  const [beds, setBeds] = useState<Bed[]>(fallbackBeds);
  const [loading, setLoading] = useState(hasSupabaseConfig);
  const [connection, setConnection] = useState<ConnectionState>(hasSupabaseConfig ? "connecting" : "local");
  const [message, setMessage] = useState<string | null>(
    hasSupabaseConfig ? null : "Supabase 설정이 없어 로컬 목업 데이터로 표시 중입니다.",
  );
  const [messageTone, setMessageTone] = useState<MessageTone>("info");

  const clearMessage = useCallback(() => setMessage(null), []);

  const showMessage = useCallback((nextMessage: string, tone: MessageTone = "info") => {
    setMessage(nextMessage);
    setMessageTone(tone);
  }, []);

  const refresh = useCallback(async () => {
    if (!supabase) {
      showMessage("Supabase 설정이 없어 로컬 데이터로 새로고침했습니다.", "info");
      return;
    }

    setLoading(true);
    try {
      const [roomsResult, bedsResult] = await Promise.all([
        supabase
          .from("rooms")
          .select("id,name,sort_order,name_tag_color,name_tag_text_color")
          .order("sort_order", { ascending: true }),
        supabase.from("beds").select("*").order("sort_order", { ascending: true }),
      ]);

      if (roomsResult.error) throw roomsResult.error;
      if (bedsResult.error) throw bedsResult.error;

      setRooms(sortRooms((roomsResult.data ?? []) as Room[]));
      setBeds(sortBeds((bedsResult.data ?? []) as Bed[]));
      setConnection("live");
    } catch (error) {
      setConnection("error");
      showMessage(getErrorMessage(error), "error");
    } finally {
      setLoading(false);
    }
  }, [showMessage]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const client = supabase;
    if (!client) return undefined;

    const channel = client
      .channel("beds-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "beds" }, () => {
        void refresh();
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setConnection("live");
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") setConnection("error");
      });

    return () => {
      void client.removeChannel(channel);
    };
  }, [refresh]);

  const updateBed = useCallback((bedId: string, updater: (bed: Bed) => Bed) => {
    setBeds((current) => current.map((bed) => (bed.id === bedId ? updater(bed) : bed)));
  }, []);

  const setStatus = useCallback(
    async (bed: Bed, status: BedStatus) => {
      const previous = beds;
      updateBed(bed.id, (current) => applyLocalStatus(current, status));

      if (!supabase) return;

      const { error } = await supabase.rpc("set_bed_status", {
        p_bed_id: bed.id,
        p_next_status: status,
      });

      if (error) {
        setBeds(previous);
        showMessage(getErrorMessage(error), "error");
      }
    },
    [beds, showMessage, updateBed],
  );

  const setFollowUp = useCallback(
    async (bed: Bed, isFollowUp: boolean) => {
      const now = new Date().toISOString();
      const previous = beds;
      updateBed(bed.id, (current) => ({
        ...current,
        is_follow_up: isFollowUp,
        updated_at: now,
      }));

      if (!supabase) return;

      const { error } = await supabase.rpc("set_bed_follow_up", {
        p_bed_id: bed.id,
        p_is_follow_up: isFollowUp,
      });

      if (error) {
        setBeds(previous);
        showMessage(getErrorMessage(error), "error");
      }
    },
    [beds, showMessage, updateBed],
  );

  return useMemo(
    () => ({
      rooms,
      beds,
      loading,
      connection,
      message,
      messageTone,
      refresh,
      clearMessage,
      setStatus,
      setFollowUp,
    }),
    [
      rooms,
      beds,
      loading,
      connection,
      message,
      messageTone,
      refresh,
      clearMessage,
      setStatus,
      setFollowUp,
    ],
  );
}
