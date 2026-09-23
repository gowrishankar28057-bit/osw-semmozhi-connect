"use client";
import Link from "next/link";
import {
  CalendarDays,
  Users,
  Award,
  ChartNoAxesCombined,
  Plus,
  ArrowRight,
  ShieldCheck,
} from "lucide-react";
import { usePoll, Loading, ErrorBox, Empty, date, Status } from "./common";
import type { Dashboard as Data } from "@/lib/types";
import { OrganizerManager } from "./organizers";
export function Dashboard() {
  const { data: d, error } = usePoll<Data>("dashboard");
  if (!d) return error ? <ErrorBox message={error} /> : <Loading />;
  const admin = d.user.role === "ADMIN",
    org = d.user.role === "ORGANIZER",
    s = d.stats;
  const cards = admin
    ? [
        [Users, s.organizers, "Total organizers", "rose"],
        [ShieldCheck, s.activeOrganizers, "Active organizers", "green"],
        [CalendarDays, s.total, "Workshops managed", "blue"],
        [Award, s.certificates, "Certificates issued", "gold"],
      ]
    : org
      ? [
          [CalendarDays, s.total, "Total workshops", "blue"],
          [Users, s.participants, "Confirmed registrations", "green"],
          [
            ChartNoAxesCombined,
            s.attendance === null ? "—" : `${s.attendance.toFixed(1)}%`,
            "Average attendance",
            "gold",
          ],
          [Award, s.certificates, "Certificates issued", "purple"],
        ]
      : [
          [CalendarDays, s.upcoming, "Upcoming & live workshops", "blue"],
          [ShieldCheck, s.completed, "Completed workshops", "green"],
          [
            ChartNoAxesCombined,
            s.attendance === null ? "—" : `${s.attendance.toFixed(1)}%`,
            "Completed-session attendance",
            "purple",
          ],
          [Award, s.certificates, "Certificates earned", "gold"],
        ];
  const next =
    d.workshops.find((w) => w.status === "ONGOING") ||
    [...d.workshops]
      .filter((w) => w.status === "PUBLISHED")
      .sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart))[0];
  return (
    <>
      <section
        className={`welcome ${admin ? "heritage-admin" : org ? "" : "heritage-participant"}`}
      >
        <p className="eyebrow">
          {admin
            ? "ADMINISTRATION"
            : org
              ? "ORGANIZER WORKSPACE"
              : "YOUR LEARNING JOURNEY"}
        </p>
        <h1>
          {admin ? "Welcome, Administrator!" : `Welcome back, ${d.user.name}!`}
        </h1>
        <p>
          {admin
            ? "Create organizers and monitor workshop operations."
            : org
              ? "Share knowledge. Bring your community together."
              : "Explore. Learn. Attend. Grow."}
        </p>
      </section>
      <ErrorBox message={error} />
      <div className="stats-grid">
        {cards.map(([Icon, value, label, color]) => {
          const I = Icon as typeof Users;
          return (
            <article className="stat-card" key={String(label)}>
              <span className={`stat-icon ${color}`}>
                <I size={27} />
              </span>
              <div>
                <strong>{String(value)}</strong>
                <span>{String(label)}</span>
              </div>
            </article>
          );
        })}
      </div>
      {admin ? (
        <>
          <OrganizerManager compact />
          <div className="dashboard-columns">
            <section className="panel">
              <div className="panel-heading">
                <h2>Recent activities</h2>
                <Link href="/reports">
                  View all <ArrowRight size={15} />
                </Link>
              </div>
              {d.activity.length ? (
                d.activity.slice(0, 6).map((a) => (
                  <div className="activity-row" key={a.id}>
                    <span className="activity-dot" />
                    <div>
                      <b>{a.action}</b>
                      <p>{a.detail}</p>
                    </div>
                    <small>{date(a.createdAt)}</small>
                  </div>
                ))
              ) : (
                <Empty title="No activity yet">
                  Create your first organizer to get started.
                </Empty>
              )}
            </section>
            <section className="panel">
              <h2>Platform overview</h2>
              <div className="overview-row">
                <span>Participant accounts</span>
                <strong>{s.participants}</strong>
              </div>
              <div className="overview-row">
                <span>Completed workshops</span>
                <strong>{s.completed}</strong>
              </div>
              <div className="overview-row">
                <span>Published or live workshops</span>
                <strong>{s.upcoming}</strong>
              </div>
              <div className="info-note">
                Every count reflects saved platform records.
              </div>
            </section>
          </div>
        </>
      ) : (
        <>
          <div className="dashboard-columns wide-left">
            <section className="panel">
              <div className="panel-heading">
                <h2>{org ? "Current workshop" : "Next workshop"}</h2>
                <Link href="/workshops">
                  View all <ArrowRight size={15} />
                </Link>
              </div>
              {next ? (
                <div className="featured-workshop">
                  <div className="featured-art">
                    <span>
                      Tamil heritage,
                      <br />
                      shared knowledge
                    </span>
                  </div>
                  <div>
                    <Status status={next.status} />
                    <h3>{next.title}</h3>
                    <p className="subtle">{next.description.slice(0, 150)}</p>
                    <p className="meta-line">
                      <CalendarDays size={16} />
                      {date(next.scheduledStart)}
                    </p>
                    <p className="meta-line">
                      <Users size={16} />
                      {next._count.registrations} / {next.capacity}{" "}
                      registrations
                    </p>
                    <Link
                      className="button gold"
                      href={`/workshops/${next.id}`}
                    >
                      {org ? "Manage workshop" : "View details"}
                      <ArrowRight size={16} />
                    </Link>
                  </div>
                </div>
              ) : (
                <Empty
                  title={
                    org
                      ? "Your next workshop starts here"
                      : "Your learning journey is ready"
                  }
                >
                  {org
                    ? "Create and publish a workshop to invite participants."
                    : "Explore published workshops and register to see them here."}
                  <Link
                    className="button"
                    href={org ? "/workshops/new" : "/workshops"}
                  >
                    {org ? "Create workshop" : "Explore workshops"}
                  </Link>
                </Empty>
              )}
            </section>
            <section className="panel">
              <h2>Certificate eligibility</h2>
              <div className="eligibility-rule">
                <ShieldCheck size={32} />
                <strong>90% or more</strong>
                <p>Meeting attendance and QR verification are both required.</p>
              </div>
              <p className="fine">
                Attendance uses the actual session runtime. Certificates are
                issued after the organizer ends the workshop.
              </p>
              {org && (
                <Link className="button full" href="/workshops/new">
                  <Plus size={17} />
                  Create new workshop
                </Link>
              )}
            </section>
          </div>
          <div className="dashboard-columns">
            <section className="panel">
              <div className="panel-heading">
                <h2>My workshops</h2>
                <Link href="/workshops">View all</Link>
              </div>
              {d.workshops.length ? (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Workshop</th>
                        <th>Date</th>
                        <th>Status</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {d.workshops.map((w) => (
                        <tr key={w.id}>
                          <td>{w.title}</td>
                          <td>{date(w.scheduledStart)}</td>
                          <td>
                            <Status status={w.status} />
                          </td>
                          <td>
                            <Link
                              className="text-link"
                              href={`/workshops/${w.id}`}
                            >
                              Open
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty title="No registered workshops yet" />
              )}
            </section>
            <section className="panel">
              <div className="panel-heading">
                <h2>Notifications</h2>
                <Link href="/notifications">View all</Link>
              </div>
              {d.notifications.length ? (
                d.notifications.slice(0, 4).map((n) => (
                  <Link className="notice-row" key={n.id} href={n.href}>
                    <span
                      className={`activity-dot ${n.readAt ? "read" : ""}`}
                    />
                    <div>
                      {n.message}
                      <small>{date(n.createdAt)}</small>
                    </div>
                  </Link>
                ))
              ) : (
                <Empty title="You’re all caught up">
                  New workshop announcements will appear here automatically.
                </Empty>
              )}
            </section>
          </div>
        </>
      )}
    </>
  );
}
