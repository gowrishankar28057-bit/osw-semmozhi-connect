"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, XCircle } from "lucide-react";
import { api, Loading } from "./common";
type Verified = {
  participant: string;
  workshop: string;
  workshopId: string;
  verifiedAt: string;
};
const headings: Record<string, string> = {
  QR_EXPIRED: "ATTENDANCE CODE EXPIRED",
  QR_ALREADY_VERIFIED: "ATTENDANCE ALREADY VERIFIED",
  PRESENCE_REQUIRED: "JOIN THE LIVE MEETING FIRST",
  VERIFICATION_CLOSED: "VERIFICATION IS CLOSED",
  QR_INVALID: "INVALID ATTENDANCE CODE",
};
export function AttendanceVerification({ token }: { token: string }) {
  const started = useRef(false),
    [result, setResult] = useState<Verified | null>(null),
    [error, setError] = useState<{ message: string; code?: string } | null>(
      null,
    );
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!token) {
      setError({
        message:
          "No attendance code was supplied. Please scan the organizer’s current QR.",
      });
      return;
    }
    void api<Verified>("attendance/verify", { token })
      .then(setResult)
      .catch((e: Error & { code?: string }) =>
        setError({ message: e.message, code: e.code }),
      );
  }, [token]);
  return (
    <main className="public-page">
      <div className="public-brand">
        OSW <span>Semmozhi Connect</span>
      </div>
      <section className="verification-card">
        {result ? (
          <>
            <CheckCircle2 className="verified-icon" size={64} />
            <p className="eyebrow">✓ ATTENDANCE VERIFIED</p>
            <dl>
              <div>
                <dt>Workshop</dt>
                <dd>{result.workshop}</dd>
              </div>
              <div>
                <dt>Participant</dt>
                <dd>{result.participant}</dd>
              </div>
              <div>
                <dt>Verification time</dt>
                <dd>{new Date(result.verifiedAt).toLocaleString("en-IN")}</dd>
              </div>
            </dl>
            <p className="subtle">
              Keep attending the meeting. Certificates require at least 90%
              meeting presence as well as this verification.
            </p>
            <Link className="button" href={`/workshop/${result.workshopId}/meeting`}>
              Back to the meeting
            </Link>
          </>
        ) : error ? (
          <>
            <XCircle size={58} className="error-icon" />
            <h1>
              {headings[error.code ?? ""] ?? "UNABLE TO VERIFY ATTENDANCE"}
            </h1>
            <p role="alert">{error.message}</p>
            {error.code === "QR_EXPIRED" && (
              <p className="subtle">
                Please scan the latest QR displayed by the Organizer.
              </p>
            )}
            <Link className="button" href="/participant">
              Return to dashboard
            </Link>
          </>
        ) : (
          <>
            <h1>Verifying attendance…</h1>
            <Loading />
          </>
        )}
      </section>
    </main>
  );
}
