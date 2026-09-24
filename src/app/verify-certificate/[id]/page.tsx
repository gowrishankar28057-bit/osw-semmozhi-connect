import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck, XCircle } from "lucide-react";
import {
  findCertificate,
  publicCertificate,
} from "@/lib/certificate-records";
import { percent } from "@/lib/format";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Certificate verification · OSW Semmozhi Connect",
  robots: { index: false, follow: false },
};
const day = (d: Date) =>
  d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
/** Public, login-free verification page opened from the certificate QR. */
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const found = await findCertificate((await params).id);
  const c = found && publicCertificate(found);
  return (
    <main className="public-page">
      <div className="public-brand">
        OSW <span>Semmozhi Connect</span>
      </div>
      <section className="verification-card">
        {c ? (
          <>
            <ShieldCheck size={64} className="verified-icon" />
            <p className="eyebrow">CERTIFICATE VERIFIED</p>
            <p className="verification-status">
              This certificate is valid and was issued by OSW.
            </p>
            <h1>{c.participantName}</h1>
            <p className="verification-workshop">{c.workshopTitle}</p>
            <dl>
              <div>
                <dt>Participant</dt>
                <dd>{c.participantName}</dd>
              </div>
              <div>
                <dt>Workshop</dt>
                <dd>{c.workshopTitle}</dd>
              </div>
              <div>
                <dt>Organizer / speaker</dt>
                <dd>{c.speaker}</dd>
              </div>
              <div>
                <dt>Workshop date</dt>
                <dd>{day(c.workshopDate)}</dd>
              </div>
              <div>
                <dt>Verified attendance</dt>
                <dd>{percent(c.attendancePercentage)}</dd>
              </div>
              <div>
                <dt>Issued on</dt>
                <dd>{day(c.issuedAt)}</dd>
              </div>
              <div>
                <dt>Certificate ID</dt>
                <dd className="certificate-id">{c.certificateNumber}</dd>
              </div>
            </dl>
            <p className="fine">
              Issued only after the workshop ended, with at least 90.00%
              server-recorded meeting presence and a verified attendance QR. No
              private account details are shown.
            </p>
          </>
        ) : (
          <>
            <XCircle size={58} className="error-icon" />
            <p className="eyebrow">VERIFICATION FAILED</p>
            <h1>CERTIFICATE NOT FOUND</h1>
            <p>
              No OSW certificate matches this link or ID. The certificate may
              be forged, mistyped or revoked.
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
