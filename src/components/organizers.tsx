"use client";
import { useState } from "react";
import { UserPlus, Pencil, Search } from "lucide-react";
import {
  api,
  usePoll,
  Loading,
  ErrorBox,
  Badge,
  Action,
  Empty,
} from "./common";
import type { User } from "@/lib/types";
type Organizer = User & { _count: { workshops: number } };
export function OrganizerManager({ compact = false }: { compact?: boolean }) {
  const { data, refresh, error } = usePoll<Organizer[]>("organizers");
  const [search, setSearch] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [formError, setFormError] = useState(""),
    [editing, setEditing] = useState<Organizer | null>(null);
  return (
    <>
      {!compact && (
        <div className="page-heading">
          <p className="eyebrow">ADMINISTRATION</p>
          <h1>Organizer management</h1>
          <p>Create accounts for the people who lead your workshops.</p>
        </div>
      )}
      <div className="organizer-grid">
        <section className="panel">
          <div className="panel-heading">
            <h2>
              <UserPlus size={23} />
              {editing ? "Edit organizer" : "Create organizer"}
            </h2>
          </div>
          <p className="subtle">
            {editing
              ? "Update the organizer’s profile."
              : "Add a new organizer to the system."}
          </p>
          <form
            key={editing?.id || "new"}
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const fd = new FormData(form);
              setBusy(true);
              setFormError("");
              setMessage("");
              try {
                await api(`organizers${editing ? `/${editing.id}` : ""}`, {
                  name: fd.get("name"),
                  department: fd.get("department"),
                  ...(editing
                    ? {}
                    : { email: fd.get("email"), password: fd.get("password") }),
                });
                setMessage(
                  editing
                    ? "Organizer updated."
                    : "Organizer created. They can sign in immediately.",
                );
                setEditing(null);
                form.reset();
                await refresh();
              } catch (err) {
                setFormError(
                  err instanceof Error ? err.message : "Unable to save.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="form-grid">
              <label>
                Organizer name
                <input
                  name="name"
                  required
                  minLength={2}
                  maxLength={100}
                  defaultValue={editing?.name}
                  placeholder="Enter full name"
                />
              </label>
              {!editing && (
                <label>
                  Email address
                  <input
                    name="email"
                    type="email"
                    required
                    placeholder="name@institution.edu"
                  />
                </label>
              )}
              <label>
                Department
                <input
                  name="department"
                  maxLength={120}
                  defaultValue={editing?.department}
                  placeholder="Tamil / AI"
                />
              </label>
              {!editing && (
                <label>
                  Temporary password
                  <input
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    maxLength={72}
                    required
                    placeholder="At least 8 characters"
                  />
                </label>
              )}
            </div>
            <ErrorBox message={formError} />
            {message && (
              <p className="success" role="status">
                {message}
              </p>
            )}
            <div className="actions">
              <button className="button gold" disabled={busy}>
                {busy
                  ? "Saving…"
                  : editing
                    ? "Save changes"
                    : "Create organizer"}
              </button>
              {editing && (
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setEditing(null)}
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h2>Organizer directory</h2>
          </div>
          <label className="search-field">
            <Search size={18} />
            <input
              aria-label="Search organizers"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search organizers…"
            />
          </label>
          <ErrorBox message={error} />
          {!data ? (
            <Loading />
          ) : data.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Organizer</th>
                    <th>Department</th>
                    <th>Workshops</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data
                    .filter((o) =>
                      `${o.name} ${o.email} ${o.department}`
                        .toLowerCase()
                        .includes(search.toLowerCase()),
                    )
                    .map((o) => (
                      <tr key={o.id}>
                        <td>
                          <b>{o.name}</b>
                          <small>{o.email}</small>
                        </td>
                        <td>{o.department || "—"}</td>
                        <td>{o._count.workshops}</td>
                        <td>
                          <Badge tone={o.enabled ? "green" : "rose"}>
                            {o.enabled ? "Active" : "Disabled"}
                          </Badge>
                        </td>
                        <td>
                          <div className="actions">
                            <button
                              className="icon-button"
                              aria-label={`Edit ${o.name}`}
                              onClick={() => setEditing(o)}
                            >
                              <Pencil size={16} />
                            </button>
                            <Action
                              className="small secondary"
                              onClick={async () => {
                                await api(`organizers/${o.id}`, {
                                  enabled: !o.enabled,
                                });
                                await refresh();
                              }}
                            >
                              {o.enabled ? "Disable" : "Enable"}
                            </Action>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty title="No organizers yet">
              Create your first organizer using the form.
            </Empty>
          )}
        </section>
      </div>
    </>
  );
}
