"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Home,
  Users,
  CalendarDays,
  Award,
  Bell,
  LogOut,
  Menu,
  BookOpen,
  ChartNoAxesCombined,
  UserRound,
  X,
} from "lucide-react";
import { api, usePoll } from "./common";
import type { User, Notice } from "@/lib/types";
export function Shell({
  user,
  children,
}: {
  user: User;
  children: React.ReactNode;
}) {
  const pathname = usePathname(),
    router = useRouter(),
    [open, setOpen] = useState(false),
    [error, setError] = useState("");
  const { data: notices, refresh: refreshNotices } =
    usePoll<Notice[]>("notifications");
  const seen = useRef<Set<string> | null>(null),
    [toasts, setToasts] = useState<Notice[]>([]);
  useEffect(() => {
    if (!notices) return;
    // Everything present at page load is "seen"; only newer arrivals pop up.
    if (!seen.current) {
      seen.current = new Set(notices.map((n) => n.id));
      return;
    }
    const fresh = notices.filter((n) => !n.readAt && !seen.current!.has(n.id));
    fresh.forEach((n) => seen.current!.add(n.id));
    if (fresh.length) setToasts((t) => [...fresh, ...t].slice(0, 3));
  }, [notices]);
  useEffect(() => {
    if (!toasts.length) return;
    const timer = setTimeout(() => setToasts((t) => t.slice(0, -1)), 12_000);
    return () => clearTimeout(timer);
  }, [toasts]);
  const openNotice = async (n: Notice) => {
    setToasts((t) => t.filter((x) => x.id !== n.id));
    router.push(n.href);
    await api(`notifications/${n.id}`, {}).catch(() => undefined);
    await refreshNotices();
  };
  const base = `/${user.role.toLowerCase()}`;
  const links =
    user.role === "ADMIN"
      ? [
          [Home, "Dashboard", base],
          [Users, "Organizers", "/admin/organizers"],
          [CalendarDays, "Workshops", "/workshops"],
          [Award, "Certificates", "/certificates"],
          [ChartNoAxesCombined, "Reports & activity", "/reports"],
        ]
      : [
          [Home, "Dashboard", base],
          [
            CalendarDays,
            user.role === "ORGANIZER" ? "My workshops" : "Explore workshops",
            "/workshops",
          ],
          [ChartNoAxesCombined, "Attendance", "/attendance"],
          [BookOpen, "Learning materials", "/materials"],
          [Award, "Certificates", "/certificates"],
          [Bell, "Notifications", "/notifications"],
          [UserRound, "Profile", "/profile"],
        ];
  return (
    <div className={`app-shell ${user.role === "ADMIN" ? "admin-theme" : ""}`}>
      <aside
        id="osw-sidebar"
        className={`sidebar ${open ? "open" : ""}`}
        aria-label="Primary navigation"
      >
        <Link href={base} className="brand">
          <strong>
            OSW<span>❧</span>
          </strong>
          <b>SEMMOZHI CONNECT</b>
          <small>Learn · Participate · Preserve</small>
        </Link>
        <button
          className="mobile-close icon-button"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
        >
          <X />
        </button>
        <nav>
          {links.map(([Icon, label, href]) => {
            const I = Icon as typeof Home;
            return (
              <Link
                key={href as string}
                href={href as string}
                onClick={() => setOpen(false)}
                className={pathname === href ? "active" : ""}
              >
                <I size={19} />
                {label as string}
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <p lang="ta">
            தமிழ் அறிவு
            <br />
            உலகை இணைக்கும்
          </p>
          <small>
            Knowledge in Tamil
            <br />
            connects the world
          </small>
          <button
            onClick={async () => {
              try {
                await api("auth/logout", {});
                router.push("/login");
                router.refresh();
              } catch {
                setError("Sign out failed. Please try again.");
              }
            }}
          >
            <LogOut size={18} />
            Logout
          </button>
          {error && <small role="alert">{error}</small>}
        </div>
      </aside>
      {open && (
        <button
          className="sidebar-overlay"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
        />
      )}
      <div className="app-content">
        <header className="topbar">
          <button
            className="mobile-menu icon-button"
            aria-label="Open navigation"
            aria-controls="osw-sidebar"
            aria-expanded={open}
            onClick={() => setOpen(true)}
          >
            <Menu />
          </button>
          <div className="topbar-identity">
            <b>CENTRAL INSTITUTE OF CLASSICAL TAMIL</b>
            <span>Heritage · Knowledge · Global Connect</span>
          </div>
          <div className="topbar-right">
            <Link
              href="/notifications"
              className="notification-bell"
              aria-label={`${notices?.filter((n) => !n.readAt).length ?? 0} unread notifications`}
            >
              <Bell size={22} />
              {notices?.some((n) => !n.readAt) && (
                <i>{notices.filter((n) => !n.readAt).length}</i>
              )}
            </Link>
            <span className="avatar">{user.name.slice(0, 1)}</span>
            <div className="user-label">
              <b>{user.name}</b>
              <small>
                {user.role.charAt(0) + user.role.slice(1).toLowerCase()}
              </small>
            </div>
          </div>
        </header>
        <main className="main-content">
          <div className="page-motion" key={pathname}>
            {children}
          </div>
        </main>
        {toasts.length > 0 && (
          <div className="toast-stack" aria-live="polite">
            {toasts.map((n) => (
              <div className="toast" key={n.id} role="status">
                <button
                  className="toast-body"
                  onClick={() => void openNotice(n)}
                >
                  <strong>{noticeTitle(n.kind)}</strong>
                  <span>{n.message}</span>
                </button>
                <button
                  className="toast-close"
                  aria-label="Dismiss notification"
                  onClick={() =>
                    setToasts((t) => t.filter((x) => x.id !== n.id))
                  }
                >
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
        <footer className="app-footer">
          <span>
            <b>OSW</b> · Semmozhi Connect
          </span>
          <span>A knowledge society for a brighter tomorrow</span>
        </footer>
      </div>
    </div>
  );
}
const titles: Record<string, string> = {
  WORKSHOP_PUBLISHED: "NEW WORKSHOP",
  REGISTRATION: "REGISTRATION CONFIRMED",
  WORKSHOP_STARTED: "WORKSHOP STARTED",
  ATTENDANCE_OPEN: "ATTENDANCE VERIFICATION",
  ANNOUNCEMENT: "ANNOUNCEMENT",
  CERTIFICATE: "CERTIFICATE READY",
};
export const noticeTitle = (kind?: string) =>
  titles[kind ?? ""] ?? "NOTIFICATION";
