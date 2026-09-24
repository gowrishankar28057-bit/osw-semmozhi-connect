"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import QRCode from "qrcode";
import {
  CalendarDays,
  Users,
  Video,
  ArrowLeft,
  Clock,
  Download,
} from "lucide-react";
import {
  api,
  usePoll,
  Loading,
  ErrorBox,
  Empty,
  Action,
  Status,
  Badge,
  date,
  time,
  duration,
} from "./common";
import { Meeting } from "./meeting";
import type { User, Workshop, Attendance, WindowState } from "@/lib/types";
export function AttendanceTable({ attendance: a }: { attendance: Attendance }) {
  return a.rows.length ? (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Participant</th>
            <th>Registration</th>
            <th>Meeting joined</th>
            <th>Duration</th>
            <th>QR verified</th>
            <th>Attendance</th>
            <th>Certificate</th>
          </tr>
        </thead>
        <tbody>
          {a.rows.map((r) => (
            <tr key={r.participantId}>
              <td>{r.participant}</td>
              <td>{r.status === "CONFIRMED" ? "Confirmed" : "Cancelled"}</td>
              <td>{r.meetingJoined ? "Yes" : "No"}</td>
              <td>{duration(r.presenceSeconds)}</td>
              <td>
                <Badge tone={r.qrVerified ? "green" : "muted"}>
                  {r.qrVerified ? "Verified" : "Pending"}
                </Badge>
              </td>
              <td>{r.attendancePercentage.toFixed(2)}%</td>
              <td>
                {r.eligible ? (
                  <Badge tone="green">Eligible</Badge>
                ) : a.completed ? (
                  "Not eligible"
                ) : (
                  "Pending completion"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <Empty title="No attendance records yet" />
  );
}
export function WorkshopDetail({
  id,
  user,
  demoMode,
}: {
  id: string;
  user: User;
  demoMode: boolean;
}) {
  const { data: w, error, refresh } = usePoll<Workshop>(`workshops/${id}`);
  const { data: attendance, refresh: refreshAttendance } = usePoll<Attendance>(
    `workshops/${id}/attendance`,
  );
  const [meeting, setMeeting] = useState(false),
    [tab, setTab] = useState("overview");
  if (!w) return error ? <ErrorBox message={error} /> : <Loading />;
  const owner = user.role === "ORGANIZER" && w.organizerId === user.id,
    registered = w.registrations?.[0]?.status === "CONFIRMED",
    access = owner || registered || user.role === "ADMIN";
  const state = async (action: string) => {
    await api(`workshops/${id}/${action}`, {});
    await refresh();
    await refreshAttendance();
    if (action === "end") setMeeting(false);
  };
  return (
    <>
      <Link className="back-link" href="/workshops">
        <ArrowLeft size={16} />
        All workshops
      </Link>
      <section className="detail-hero">
        <p className="eyebrow">SEMMOZHI CONNECT WORKSHOP</p>
        <Status status={w.status} />
        <h1>{w.title}</h1>
        <p>{w.description}</p>
        <div className="hero-meta">
          <span>
            <CalendarDays size={18} />
            {date(w.scheduledStart)}
          </span>
          <span>
            <Clock size={18} />
            {time(w.scheduledStart)}–{time(w.scheduledEnd)} IST
          </span>
          <span>
            <Video size={18} />
            Online
          </span>
          <span>
            <Users size={18} />
            {w._count.registrations} / {w.capacity} registered
          </span>
        </div>
      </section>
      <ErrorBox message={error} />
      <div className="detail-actions">
        <div>
          <b>{w.speaker}</b>
          <small>Speaker · Organized by {w.organizer.name}</small>
        </div>
        <div className="actions">
          {owner && ["DRAFT", "PUBLISHED"].includes(w.status) && (
            <Link className="button secondary" href={`/workshops/${id}/edit`}>
              Edit details
            </Link>
          )}
          {owner && w.status === "DRAFT" && (
            <Action className="gold" onClick={() => state("publish")}>
              Publish workshop
            </Action>
          )}
          {owner && w.status === "PUBLISHED" && (
            <Action className="gold" onClick={() => state("start")}>
              Start workshop
            </Action>
          )}
          {owner && w.status === "ONGOING" && (
            <Action
              className="danger"
              confirm="End this workshop now? Attendance will be finalized and eligible certificates issued."
              onClick={() => state("end")}
            >
              End workshop
            </Action>
          )}
          {user.role === "PARTICIPANT" &&
            w.status === "PUBLISHED" &&
            (registered ? (
              <>
                <Badge tone="green">Registration confirmed</Badge>
                <Action
                  className="secondary"
                  confirm="Cancel your registration?"
                  onClick={() => state("cancel")}
                >
                  Cancel registration
                </Action>
              </>
            ) : (
              <Action className="gold" onClick={() => state("register")}>
                Register
              </Action>
            ))}
          {(owner || registered) && w.status === "ONGOING" && !meeting && (
            <button className="button" onClick={() => setMeeting(true)}>
              <Video size={18} />
              {owner ? "Open online meeting" : "Join workshop"}
            </button>
          )}
        </div>
      </div>
      {meeting && w.status === "ONGOING" && (
        <Meeting
          workshopId={id}
          participant={user.role === "PARTICIPANT"}
          onClose={() => setMeeting(false)}
        />
      )}
      <div className="tabs">
        {[
          "overview",
          ...(access
            ? ["attendance", "announcements", "materials", "community"]
            : []),
        ].map((t) => (
          <button
            className={tab === t ? "active" : ""}
            key={t}
            onClick={() => setTab(t)}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      {tab === "overview" && (
        <div className="dashboard-columns wide-left">
          <section className="panel">
            <h2>About this workshop</h2>
            <p className="description">{w.description}</p>
            <div className="overview-row">
              <span>Registration closes</span>
              <b>
                {date(w.registrationDeadline)} · {time(w.registrationDeadline)}{" "}
                IST
              </b>
            </div>
            <div className="overview-row">
              <span>Speaker</span>
              <b>{w.speaker}</b>
            </div>
            <div className="overview-row">
              <span>Workshop mode</span>
              <b>Online, inside OSW</b>
            </div>
            {w.status === "COMPLETED" && (
              <Link className="button gold" href="/certificates">
                View certificates
              </Link>
            )}
          </section>
          <section className="panel">
            <h2>Your certificate</h2>
            <div className="eligibility-rule">
              <strong>90% or more</strong>
              <p>
                Attend the live meeting and complete the rotating QR
                verification.
              </p>
            </div>
            <p className="fine">
              The certificate uses the session’s actual start and end times,
              even when the workshop ends early.
            </p>
            {registered && attendance && (
              <div className="overview-row">
                <span>
                  {w.status === "COMPLETED"
                    ? "Final attendance"
                    : "Attendance so far"}
                </span>
                <b>
                  {attendance.rows[0]?.attendancePercentage.toFixed(2) ??
                    "0.00"}
                  %
                </b>
              </div>
            )}
          </section>
        </div>
      )}
      {access &&
        (tab === "attendance" ||
          (w.status === "ONGOING" && tab === "overview")) && (
          <>
            <AttendanceWindow
              id={id}
              owner={owner}
              demoMode={demoMode}
              active={w.status === "ONGOING"}
            />
            <section className="panel">
              <div className="panel-heading">
                <h2>
                  {owner ? "Participant attendance" : "Attendance record"}
                </h2>
                {owner && attendance && (
                  <button
                    className="button secondary small"
                    onClick={() => downloadAttendance(w.title, attendance)}
                  >
                    <Download size={16} />
                    Export CSV
                  </button>
                )}
              </div>
              <p className="fine">
                Updates every 3 seconds.{" "}
                {attendance?.completed
                  ? "Final attendance uses the recorded session runtime."
                  : "Percentages are provisional until the workshop ends."}
              </p>
              {attendance ? (
                <AttendanceTable attendance={attendance} />
              ) : (
                <Loading />
              )}
            </section>
          </>
        )}
      {access && ["announcements", "materials", "community"].includes(tab) && (
        <WorkshopDiscussion
          key={tab}
          id={id}
          type={tab}
          owner={owner}
          admin={user.role === "ADMIN"}
        />
      )}
    </>
  );
}
export function downloadAttendance(title: string, a: Attendance) {
  const quote = (s: unknown) =>
    `"${String(s)
      .replace(/^[=+@-]/, "'")
      .replaceAll('"', '""')}"`;
  const rows = [
    [
      "Participant",
      "Registration",
      "Meeting joined",
      "Presence seconds",
      "QR verified",
      "Attendance %",
      "Eligible",
    ],
    ...a.rows.map((r) => [
      r.participant,
      r.status,
      r.meetingJoined,
      r.presenceSeconds,
      r.qrVerified,
      r.attendancePercentage,
      r.eligible,
    ]),
  ];
  const blob = new Blob(
    ["\uFEFF" + rows.map((row) => row.map(quote).join(",")).join("\r\n")],
    { type: "text/csv;charset=utf-8" },
  );
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${title.replace(/[^\p{L}\p{N} -]/gu, "").slice(0, 80)}-attendance.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
function AttendanceWindow({
  id,
  owner,
  demoMode,
  active,
}: {
  id: string;
  owner: boolean;
  demoMode: boolean;
  active: boolean;
}) {
  const {
    data: w,
    error,
    refresh,
  } = usePoll<WindowState>(`workshops/${id}/window`);
  const [image, setImage] = useState(""),
    [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (w?.url)
      void QRCode.toDataURL(w.url, {
        width: 360,
        margin: 2,
        errorCorrectionLevel: "M",
      }).then(setImage);
    else setImage("");
  }, [w?.url]);
  useEffect(() => {
    if (!w?.expiresAt) return;
    const offset = new Date(w.serverNow).getTime() - Date.now();
    const update = () =>
      setSeconds(
        Math.max(
          0,
          Math.ceil(
            (new Date(w.expiresAt!).getTime() - Date.now() - offset) / 1000,
          ),
        ),
      );
    update();
    const t = setInterval(update, 250);
    return () => clearInterval(t);
  }, [w]);
  return (
    <section className="panel qr-panel">
      <div>
        <p className="eyebrow">LIVE ATTENDANCE</p>
        <h2>Attendance verification</h2>
        <p>
          {!active
            ? "Attendance verification is available only while the workshop is ongoing."
            : w?.open
              ? "Scan the current QR code with your phone. Sign in with the same participant account you used to join."
              : "Verification opens automatically near the middle of the planned session."}
        </p>
        <ErrorBox message={error} />
        {owner && active && (
          <div className="actions">
            <Action
              className={w?.open ? "secondary" : "gold"}
              onClick={async () => {
                await api(`workshops/${id}/window`, {
                  action: w?.open ? "close" : "open",
                });
                await refresh();
              }}
            >
              {w?.open ? "Close verification" : "Open attendance verification"}
            </Action>
            {demoMode && !w?.open && (
              <Action
                className="secondary"
                onClick={async () => {
                  await api(`workshops/${id}/window`, { action: "demo" });
                  await refresh();
                }}
              >
                Trigger demo attendance check
              </Action>
            )}
          </div>
        )}
        {w?.open && !owner && (
          <div className="info-note">
            Scan the QR displayed by your organizer. Verification alone does not
            replace meeting attendance.
          </div>
        )}
      </div>
      {owner && w?.open && (
        <div className="qr-code">
          {image && seconds > 0 ? (
            <Image
              src={image}
              alt="Current attendance verification QR"
              width={260}
              height={260}
              unoptimized
            />
          ) : (
            <div className="qr-refresh">Rotating attendance code…</div>
          )}
          <span>Expires in</span>
          <strong className="countdown">
            {String(Math.floor(seconds / 60)).padStart(2, "0")}:
            {String(seconds % 60).padStart(2, "0")}
          </strong>
          <small>A new secure code appears every 120 seconds.</small>
        </div>
      )}
    </section>
  );
}
type Entry = {
  id: string;
  message?: string;
  title?: string;
  url?: string;
  createdAt: string;
  user?: { name: string };
};
function WorkshopDiscussion({
  id,
  type,
  owner,
  admin,
}: {
  id: string;
  type: string;
  owner: boolean;
  admin: boolean;
}) {
  const { data, error, refresh } = usePoll<Entry[]>(`workshops/${id}/${type}`);
  const [busy, setBusy] = useState(false),
    [formError, setFormError] = useState("");
  const canPost = type === "community" ? !admin : owner;
  return (
    <section className="panel">
      <h2>
        {type === "materials"
          ? "Learning materials"
          : type === "community"
            ? "Workshop community"
            : "Announcements"}
      </h2>
      <ErrorBox message={error} />
      {canPost && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const fd = new FormData(form);
            setBusy(true);
            setFormError("");
            try {
              await api(
                `workshops/${id}/${type}`,
                type === "materials"
                  ? { title: fd.get("title"), url: fd.get("url") }
                  : { message: fd.get("message") },
              );
              form.reset();
              await refresh();
            } catch (err) {
              setFormError(
                err instanceof Error ? err.message : "Unable to post.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          {type === "materials" ? (
            <div className="form-grid">
              <label>
                Resource title
                <input name="title" required minLength={2} maxLength={150} />
              </label>
              <label>
                Secure resource URL
                <input name="url" type="url" required placeholder="https://…" />
              </label>
            </div>
          ) : (
            <label>
              {type === "community"
                ? "Share a message"
                : "Send an announcement"}
              <textarea
                name="message"
                rows={3}
                maxLength={2000}
                required
                placeholder={
                  type === "community"
                    ? "Join the discussion…"
                    : "What should participants know?"
                }
              />
            </label>
          )}
          <ErrorBox message={formError} />
          <button className="button" disabled={busy}>
            {busy
              ? "Saving…"
              : type === "materials"
                ? "Add learning material"
                : type === "community"
                  ? "Post message"
                  : "Send announcement"}
          </button>
        </form>
      )}
      {!data ? (
        <Loading />
      ) : data.length ? (
        <div className="discussion-list">
          {data.map((e) => (
            <article className="discussion-entry" key={e.id}>
              {type === "materials" ? (
                <a
                  href={e.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-link"
                >
                  {e.title} ↗
                </a>
              ) : (
                <>
                  <b>{e.user?.name || "Organizer announcement"}</b>
                  <p>{e.message}</p>
                </>
              )}
              <small>
                {date(e.createdAt)} · {time(e.createdAt)}
              </small>
            </article>
          ))}
        </div>
      ) : (
        <Empty title={`No ${type === "community" ? "messages" : type} yet`} />
      )}
    </section>
  );
}
