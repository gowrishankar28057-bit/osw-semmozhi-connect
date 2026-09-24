"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ErrorBox } from "./common";
import type { Workshop } from "@/lib/types";
function localTime(value: string) {
  const d = new Date(value);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}
export function WorkshopForm({
  workshop: w,
  speaker,
}: {
  workshop?: Workshop;
  speaker: string;
}) {
  const router = useRouter(),
    form = useRef<HTMLFormElement>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (w || !form.current) return;
    // Defaults for a live demo: starts in ~15 minutes, runs one hour, and
    // registration stays open until the planned end. All remain editable.
    const start = new Date(
      Math.ceil((Date.now() + 15 * 60_000) / 300_000) * 300_000,
    );
    const end = new Date(start.getTime() + 60 * 60_000);
    const values: Record<string, Date> = {
      scheduledStart: start,
      scheduledEnd: end,
      registrationDeadline: end,
    };
    for (const [name, value] of Object.entries(values)) {
      const input = form.current.elements.namedItem(name);
      if (input instanceof HTMLInputElement && !input.value)
        input.value = localTime(value.toISOString());
    }
  }, [w]);
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">ORGANIZER WORKSPACE</p>
        <h1>{w ? "Edit workshop" : "Create a workshop"}</h1>
        <p>Bring your knowledge to the Semmozhi Connect community.</p>
      </div>
      <section className="panel form-panel">
        <form
          ref={form}
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            setBusy(true);
            setError("");
            try {
              const result = await api<{ id: string }>(
                `workshops${w ? `/${w.id}` : ""}`,
                {
                  title: fd.get("title"),
                  description: fd.get("description"),
                  speaker: fd.get("speaker"),
                  mode: "ONLINE",
                  location: "Online · OSW meeting",
                  capacity: Number(fd.get("capacity")),
                  scheduledStart: new Date(
                    String(fd.get("scheduledStart")),
                  ).toISOString(),
                  scheduledEnd: new Date(
                    String(fd.get("scheduledEnd")),
                  ).toISOString(),
                  registrationDeadline: new Date(
                    String(fd.get("registrationDeadline")),
                  ).toISOString(),
                },
              );
              router.push(`/workshops/${result.id}`);
            } catch (err) {
              setError(
                err instanceof Error ? err.message : "Unable to save workshop.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Workshop title
            <input
              name="title"
              required
              minLength={4}
              maxLength={160}
              defaultValue={w?.title}
              placeholder="e.g. Tamil AI – One Day Workshop"
            />
          </label>
          <label>
            Description
            <textarea
              name="description"
              required
              minLength={10}
              maxLength={5000}
              rows={5}
              defaultValue={w?.description}
              placeholder="What will participants learn?"
            />
          </label>
          <div className="form-grid">
            <label>
              Speaker / organizer
              <input
                name="speaker"
                required
                defaultValue={w?.speaker || speaker}
                minLength={2}
                maxLength={100}
              />
            </label>
            <label>
              Mode
              <input value="Online · embedded Jitsi meeting" readOnly />
            </label>
            <label>
              Start date & time
              <input
                name="scheduledStart"
                type="datetime-local"
                required
                defaultValue={w ? localTime(w.scheduledStart) : undefined}
              />
            </label>
            <label>
              End date & time
              <input
                name="scheduledEnd"
                type="datetime-local"
                required
                defaultValue={w ? localTime(w.scheduledEnd) : undefined}
              />
            </label>
            <label>
              Registration deadline
              <input
                name="registrationDeadline"
                type="datetime-local"
                required
                defaultValue={w ? localTime(w.registrationDeadline) : undefined}
              />
            </label>
            <label>
              Participant capacity
              <input
                name="capacity"
                type="number"
                min={1}
                max={10000}
                required
                defaultValue={w?.capacity || 100}
              />
            </label>
          </div>
          <p className="fine">
            Enter times in your device’s local time zone. Workshop listings
            display India Standard Time.
          </p>
          <ErrorBox message={error} />
          <div className="actions">
            <button className="button gold" disabled={busy}>
              {busy ? "Saving workshop…" : w ? "Save changes" : "Save draft"}
            </button>
            <Link
              className="button secondary"
              href={w ? `/workshops/${w.id}` : "/workshops"}
            >
              Cancel
            </Link>
          </div>
        </form>
      </section>
    </>
  );
}
