"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ShieldCheck, XCircle } from "lucide-react";
import { api, Loading, date, usePoll } from "./common";
import type { Certificate } from "@/lib/types";
export function AttendanceVerification({ token }: { token: string }) {
  const started = useRef(false),
    [result, setResult] = useState<{
      participant: string;
      workshop: string;
      verifiedAt: string;
    } | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!token) {
      setError(
        "No attendance code was supplied. Please scan the organizer’s current QR.",
      );
      return;
    }
    void api<{ participant: string; workshop: string; verifiedAt: string }>(
      "attendance/verify",
      { token },
    )
      .then(setResult)
      .catch((e) => setError(e.message));
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
            <p className="eyebrow">ATTENDANCE VERIFIED</p>
            <h1>Thank you, {result.participant}</h1>
            <p>{result.workshop}</p>
            <div className="info-note">
              Verified at {new Date(result.verifiedAt).toLocaleString()}
            </div>
            <p className="subtle">
              Keep attending the meeting. Certificates require at least 90%
              meeting presence.
            </p>
          </>
        ) : error ? (
          <>
            <XCircle size={58} className="error-icon" />
            <h1>
              {error.toLowerCase().includes("already")
                ? "Attendance already verified"
                : error.toLowerCase().includes("expired")
                  ? "Attendance code expired"
                  : "Unable to verify attendance"}
            </h1>
            <p role="alert">{error}</p>
          </>
        ) : (
          <>
            <h1>Verifying attendance</h1>
            <Loading />
          </>
        )}
        <Link className="button" href="/participant">
          Return to dashboard
        </Link>
      </section>
    </main>
  );
}
export function PublicCertificate({ id }: { id: string }) {
  const { data: c, error } = usePoll<Certificate>(`certificate/${id}`, 60_000);
  return (
    <main className="public-page">
      <div className="public-brand">
        OSW <span>Semmozhi Connect</span>
      </div>
      <section className="verification-card">
        {error ? (
          <>
            <XCircle size={58} className="error-icon" />
            <h1>
              {error.toLowerCase().includes("not found")
                ? "Certificate not found"
                : "Unable to verify certificate"}
            </h1>
            <p>{error}</p>
          </>
        ) : !c ? (
          <Loading />
        ) : (
          <>
            <ShieldCheck size={64} className="verified-icon" />
            <p className="eyebrow">CERTIFICATE VERIFIED</p>
            <h1>{c.participantName}</h1>
            <p className="verification-workshop">{c.workshopTitle}</p>
            <dl>
              <div>
                <dt>Workshop date</dt>
                <dd>{date(c.workshopDate)}</dd>
              </div>
              <div>
                <dt>Organizer / speaker</dt>
                <dd>{c.speaker}</dd>
              </div>
              <div>
                <dt>Verified attendance</dt>
                <dd>{c.attendancePercentage.toFixed(2)}%</dd>
              </div>
              <div>
                <dt>Issued on</dt>
                <dd>{date(c.issuedAt)}</dd>
              </div>
              <div>
                <dt>Certificate ID</dt>
                <dd className="certificate-id">{c.certificateNumber}</dd>
              </div>
            </dl>
            <p className="fine">
              This record confirms the certificate issued by OSW. It does not
              expose private account details.
            </p>
          </>
        )}
        <Link className="text-link" href="/">
          Visit Semmozhi Connect
        </Link>
      </section>
    </main>
  );
}
