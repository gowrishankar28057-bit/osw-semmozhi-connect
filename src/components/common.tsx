"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  MapPin,
  Users,
  LoaderCircle,
} from "lucide-react";
import type { Workshop } from "@/lib/types";
export async function api<T>(
  path: string,
  data?: unknown,
  options?: { keepalive?: boolean },
): Promise<T> {
  const res = await fetch(`/api/${path}`, {
    method: data === undefined ? "GET" : "POST",
    headers: data === undefined ? {} : { "Content-Type": "application/json" },
    body: data === undefined ? undefined : JSON.stringify(data),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
    keepalive: options?.keepalive,
  });
  let result;
  try {
    result = await res.json();
  } catch {
    // e.g. a hosting error page instead of the API's JSON.
    throw Object.assign(
      new Error(`The server is unavailable (HTTP ${res.status}). Please retry.`),
      { status: res.status },
    );
  }
  if (!res.ok)
    throw Object.assign(new Error(result.error || "Request failed."), {
      code: result.code,
      status: res.status,
    });
  return result;
}
export function usePoll<T>(path: string, interval = 3000) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState("");
  const refresh = useCallback(async () => {
    try {
      const r = await api<T>(path);
      setData(r);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load data.");
    }
  }, [path]);
  useEffect(() => {
    let alive = true;
    let busy = false;
    const poll = async () => {
      if (busy) return;
      busy = true;
      try {
        const r = await api<T>(path);
        if (alive) {
          setData(r);
          setError("");
        }
      } catch (e) {
        if (alive)
          setError(e instanceof Error ? e.message : "Unable to load data.");
      } finally {
        busy = false;
      }
    };
    setData(null);
    void poll();
    const timer = setInterval(() => void poll(), interval);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [path, interval]);
  return { data, error, refresh };
}
export const date = (value: string) =>
  new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
export const time = (value: string) =>
  new Date(value).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
export const duration = (seconds: number) =>
  `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`;
export function Loading() {
  return (
    <div className="loading" role="status" aria-live="polite" aria-busy="true">
      <LoaderCircle className="spin" size={24} /> Loading…
    </div>
  );
}
export function ErrorBox({ message }: { message: string }) {
  return message ? (
    <div className="error" role="alert">
      {message}
    </div>
  ) : null;
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children && <p>{children}</p>}
    </div>
  );
}
export function Badge({
  children,
  tone = "",
}: {
  children: React.ReactNode;
  tone?: string;
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function Status({ status }: { status: string }) {
  return (
    <Badge
      tone={
        status === "ONGOING"
          ? "green"
          : status === "COMPLETED"
            ? "purple"
            : status === "DRAFT"
              ? "muted"
              : "blue"
      }
    >
      {status === "PUBLISHED"
        ? "Upcoming"
        : status.charAt(0) + status.slice(1).toLowerCase()}
    </Badge>
  );
}
export function Action({
  onClick,
  children,
  className = "",
  confirm,
}: {
  onClick: () => Promise<unknown>;
  children: React.ReactNode;
  className?: string;
  confirm?: string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <span className="action-wrap">
      <button
        type="button"
        className={`button ${className}`}
        disabled={busy}
        onClick={async () => {
          if (confirm && !window.confirm(confirm)) return;
          setBusy(true);
          setError("");
          try {
            await onClick();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Request failed.");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? (
          <>
            <LoaderCircle size={16} className="spin" /> Working…
          </>
        ) : (
          children
        )}
      </button>
      <ErrorBox message={error} />
    </span>
  );
}
export function WorkshopCard({ workshop: w }: { workshop: Workshop }) {
  return (
    <article className="workshop-card">
      <div className="workshop-art">
        <span>தமிழ் மரபு</span>
        <Status status={w.status} />
      </div>
      <div className="workshop-card-body">
        <p className="eyebrow">{w.mode} WORKSHOP</p>
        <h3>
          <Link href={`/workshops/${w.id}`}>{w.title}</Link>
        </h3>
        <p className="subtle">
          {w.organizer.name} · {w.speaker}
        </p>
        <div className="meta">
          <span>
            <CalendarDays size={16} />
            {date(w.scheduledStart)} · {time(w.scheduledStart)} IST
          </span>
          <span>
            <MapPin size={16} />
            {w.location || "Online"}
          </span>
          <span>
            <Users size={16} />
            {w._count.registrations} / {w.capacity} registered
          </span>
        </div>
        <div className="card-bottom">
          {w.registrations?.[0]?.status === "CONFIRMED" ? (
            <Badge tone="green">Registered</Badge>
          ) : (
            <span />
          )}
          <Link className="text-link" href={`/workshops/${w.id}`}>
            View details <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </article>
  );
}
