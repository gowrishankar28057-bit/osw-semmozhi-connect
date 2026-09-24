"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Award,
  CircleAlert,
  Download,
  QrCode,
  Radio,
  Users,
} from "lucide-react";
import {
  api,
  usePoll,
  Loading,
  ErrorBox,
  Action,
  Status,
  Badge,
} from "./common";
import { JitsiMeeting, type MeetingPhase } from "./meeting";
import {
  AttendanceTable,
  QrDisplay,
  downloadAttendance,
} from "./workshop-detail";
import { clock, percent } from "@/lib/format";
import type { Attendance, LiveState, User, WindowState } from "@/lib/types";

/** Local 1 s clock used only to animate server-provided durations. */
function useTicker(live: LiveState | null) {
  const [t, setT] = useState({ now: 0, fetchedAt: 0 });
  useEffect(() => {
    const now = Date.now();
    setT({ now, fetchedAt: now });
  }, [live]);
  useEffect(() => {
    const timer = setInterval(
      () => setT((x) => ({ ...x, now: Date.now() })),
      1000,
    );
    return () => clearInterval(timer);
  }, []);
  return Math.max(0, (t.now - t.fetchedAt) / 1000);
}

export function MeetingRoom({
  id,
  user,
  demoMode,
}: {
  id: string;
  user: User;
  demoMode: boolean;
}) {
  const {
    data: live,
    error,
    refresh,
  } = usePoll<LiveState>(`workshops/${id}/live`);
  const [phase, setPhase] = useState<MeetingPhase>("loading");
  const drift = useTicker(live);
  const onPhase = useCallback((p: MeetingPhase) => setPhase(p), []);
  if (!live)
    return error ? (
      <>
        <ErrorBox message={error} />
        <Link className="button" href={`/workshops/${id}`}>
          Back to workshop
        </Link>
      </>
    ) : (
      <Loading />
    );
  const owner = live.isOwner,
    participant = user.role === "PARTICIPANT" && live.registered,
    ongoing = live.status === "ONGOING";
  const sessionSeconds = live.session
    ? (new Date(live.session.endedAt ?? live.serverNow).getTime() -
        new Date(live.session.startedAt).getTime()) /
        1000 +
      (live.session.endedAt ? 0 : drift)
    : 0;
  return (
    <div className="meeting-page">
      <Link className="back-link" href={`/workshops/${id}`}>
        <ArrowLeft size={16} />
        Workshop details
      </Link>
      <section className="meeting-hero">
        <div>
          <p className="eyebrow">OSW LIVE WORKSHOP</p>
          <h1>{live.title}</h1>
          <p>
            {live.speaker} · Organized by {live.organizer}
          </p>
        </div>
        <div className="meeting-hero-status">
          {ongoing && (
            <span className="live-pill">
              <Radio size={14} /> LIVE
            </span>
          )}
          <Status status={live.status} />
        </div>
      </section>
      <ErrorBox message={error} />
      {live.warnings.length > 0 && (
        <div className="config-warnings" role="note">
          {live.warnings.map((w) => (
            <p key={w}>
              <CircleAlert size={16} />
              {w}
            </p>
          ))}
        </div>
      )}
      {owner && (
        <ControlPanel
          id={id}
          live={live}
          demoMode={demoMode}
          sessionSeconds={sessionSeconds}
          refresh={refresh}
        />
      )}
      <div className={`meeting-layout ${owner && ongoing ? "with-side" : ""}`}>
        <section className="meeting-stage" aria-label="Embedded video meeting">
          {ongoing && (owner || participant) ? (
            <JitsiMeeting
              workshopId={id}
              participant={!owner}
              onPhase={onPhase}
            />
          ) : (
            <StagePlaceholder live={live} owner={owner} />
          )}
        </section>
        {owner && ongoing && <OrganizerQr id={id} title={live.title} />}
      </div>
      {!owner && participant && (
        <AttendanceBar
          live={live}
          phase={phase}
          drift={drift}
          sessionSeconds={sessionSeconds}
        />
      )}
      {owner && live.session && <LiveAttendance id={id} title={live.title} />}
    </div>
  );
}

function StagePlaceholder({
  live,
  owner,
}: {
  live: LiveState;
  owner: boolean;
}) {
  if (live.status === "COMPLETED")
    return (
      <div className="stage-overlay static">
        <Award size={34} />
        <h2>This workshop has ended</h2>
        {live.me ? (
          live.me.certificateId ? (
            <>
              <p>
                Final attendance {percent(live.me.attendancePercentage)} with QR
                verification. Your certificate is ready.
              </p>
              <Link
                className="button gold"
                href={`/certificates/${live.me.certificateId}`}
              >
                View certificate
              </Link>
            </>
          ) : (
            <p>
              Final attendance {percent(live.me.attendancePercentage)}
              {live.me.qrVerified ? "" : " without QR verification"}. A
              certificate needs at least 90.00% meeting presence and a verified
              QR scan.
            </p>
          )
        ) : (
          <p>Attendance has been finalized from the recorded session.</p>
        )}
      </div>
    );
  return (
    <div className="stage-overlay static">
      <Radio size={34} />
      <h2>
        {owner
          ? "Start the meeting when you are ready"
          : "Waiting for the organizer to start"}
      </h2>
      <p>
        {owner
          ? "Starting creates the live session. Attendance is measured from that moment."
          : "Stay on this page. The meeting opens automatically when the workshop starts."}
      </p>
    </div>
  );
}

function AttendanceBar({
  live,
  phase,
  drift,
  sessionSeconds,
}: {
  live: LiveState;
  phase: MeetingPhase;
  drift: number;
  sessionSeconds: number;
}) {
  const me = live.me;
  const completed = live.status === "COMPLETED";
  const recording = Boolean(me?.recording);
  const presence = (me?.presenceSeconds ?? 0) + (recording ? drift : 0);
  const state = completed
    ? "Finalized"
    : recording
      ? "Recording"
      : live.status !== "ONGOING"
        ? "Not started"
        : phase === "joined"
          ? live.presenceTracked
            ? "Confirming with server…"
            : "Not configured"
          : "Not recording";
  return (
    <>
      <section className="attendance-bar" aria-live="polite">
        <div className={`status-cell ${recording ? "recording" : ""}`}>
          <span className="rec-dot" />
          <div>
            <small>Attendance status</small>
            <b>{state}</b>
          </div>
        </div>
        <div className="status-cell">
          <div>
            <small>Your meeting time</small>
            <b>{clock(presence)}</b>
          </div>
        </div>
        <div className="status-cell">
          <div>
            <small>Session time</small>
            <b>{clock(sessionSeconds)}</b>
          </div>
        </div>
        <div className="status-cell">
          <div>
            <small>
              {completed ? "Final attendance" : "Attendance so far"}
            </small>
            <b>{percent(me?.attendancePercentage ?? 0)}</b>
            <small>90.00% required</small>
          </div>
        </div>
        <div className={`status-cell ${me?.qrVerified ? "verified" : ""}`}>
          <div>
            <small>QR verification</small>
            <b>
              {me?.qrVerified
                ? "Verified"
                : live.verificationOpen
                  ? "Open — scan now"
                  : "Pending"}
            </b>
          </div>
        </div>
      </section>
      {live.verificationOpen && !me?.qrVerified && (
        <div className="verify-callout" role="alert">
          <QrCode size={22} />
          <p>
            <b>Attendance verification is open.</b> Keep this meeting open and
            scan the QR code shown by the organizer with your phone. Sign in on
            the phone with this same participant account.
          </p>
        </div>
      )}
    </>
  );
}

function ControlPanel({
  id,
  live,
  demoMode,
  sessionSeconds,
  refresh,
}: {
  id: string;
  live: LiveState;
  demoMode: boolean;
  sessionSeconds: number;
  refresh: () => Promise<void>;
}) {
  const [result, setResult] = useState("");
  const act = async (path: string, data: unknown = {}) => {
    await api(`workshops/${id}/${path}`, data);
    await refresh();
  };
  const s = live.summary;
  return (
    <section className="panel control-panel">
      <div className="control-head">
        <div>
          <p className="eyebrow">WORKSHOP CONTROL PANEL</p>
          <h2>Session controls</h2>
        </div>
        <div className="control-stats">
          <span>
            <Users size={16} />
            <b>{s?.registered ?? 0}</b> registered
          </span>
          <span>
            <Radio size={16} />
            <b>{s?.inMeeting ?? 0}</b> in meeting
          </span>
          <span>
            <QrCode size={16} />
            <b>{s?.verified ?? 0}</b> QR verified
          </span>
          {live.session && (
            <span>
              Session <b>{clock(sessionSeconds)}</b>
            </span>
          )}
        </div>
      </div>
      <div className="actions">
        {live.status === "PUBLISHED" && (
          <Action className="gold" onClick={() => act("start")}>
            Start meeting
          </Action>
        )}
        {live.status === "ONGOING" && (
          <>
            <Action
              className={live.verificationOpen ? "secondary" : "gold"}
              onClick={() =>
                act("window", {
                  action: live.verificationOpen ? "close" : "open",
                })
              }
            >
              {live.verificationOpen
                ? "Close attendance verification"
                : "Open attendance verification"}
            </Action>
            {demoMode && !live.verificationOpen && (
              <Action
                className="secondary"
                onClick={() => act("window", { action: "demo" })}
              >
                Trigger demo attendance check
              </Action>
            )}
            <Action
              className="danger"
              confirm="End the meeting now? Attendance will be finalized from the recorded session and eligible certificates issued."
              onClick={async () => {
                await act("end");
                setResult(
                  "Meeting ended. Attendance is final and certificates were issued to eligible participants.",
                );
              }}
            >
              End meeting
            </Action>
          </>
        )}
        {live.session && (
          <a className="button secondary" href="#live-attendance">
            View live attendance
          </a>
        )}
      </div>
      {result && (
        <p className="success" role="status">
          {result}
        </p>
      )}
    </section>
  );
}

function OrganizerQr({ id, title }: { id: string; title: string }) {
  const { data: w, error } = usePoll<WindowState>(`workshops/${id}/window`);
  return (
    <aside className="panel meeting-side" aria-label="Attendance verification">
      <p className="eyebrow">ATTENDANCE VERIFICATION</p>
      <ErrorBox message={error} />
      {w?.open ? (
        <QrDisplay state={w} title={title} />
      ) : (
        <p className="subtle">
          Verification is closed. Open it from the control panel; a signed QR
          code rotating every 120 seconds will appear here.
        </p>
      )}
    </aside>
  );
}

function LiveAttendance({ id, title }: { id: string; title: string }) {
  const { data, error } = usePoll<Attendance>(`workshops/${id}/attendance`);
  return (
    <section className="panel" id="live-attendance">
      <div className="panel-heading">
        <h2>Live attendance</h2>
        {data && (
          <button
            className="button secondary small"
            onClick={() => downloadAttendance(title, data)}
          >
            <Download size={16} />
            Export CSV
          </button>
        )}
      </div>
      <p className="fine">
        Updates every 3 seconds from server-recorded meeting presence.{" "}
        {data?.completed ? (
          <Badge tone="purple">Final</Badge>
        ) : (
          "Percentages are provisional until the meeting ends."
        )}
      </p>
      <ErrorBox message={error} />
      {data ? <AttendanceTable attendance={data} /> : <Loading />}
    </section>
  );
}
