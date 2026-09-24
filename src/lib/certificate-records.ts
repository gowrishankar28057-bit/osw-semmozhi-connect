import type { Certificate } from "@prisma/client";
import { db } from "./db";

/** Finds a certificate by its public UUID or its printed certificate number. */
export async function findCertificate(idOrNumber: string) {
  const value = idOrNumber.trim();
  if (!value || value.length > 100) return null;
  return db.certificate.findFirst({
    where: {
      OR: [{ id: value }, { certificateNumber: value.toUpperCase() }],
    },
  });
}

/** The only certificate fields ever shown publicly: no email or account ids. */
export const publicCertificate = (c: Certificate) => ({
  id: c.id,
  certificateNumber: c.certificateNumber,
  participantName: c.participantName,
  workshopTitle: c.workshopTitle,
  speaker: c.speaker,
  workshopDate: c.workshopDate,
  attendancePercentage: c.attendancePercentage,
  issuedAt: c.issuedAt,
});
