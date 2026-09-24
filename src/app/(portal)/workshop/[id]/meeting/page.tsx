import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isDemo } from "@/lib/workshops";
import { MeetingRoom } from "@/components/meeting-room";
export const metadata = { title: "Live workshop · OSW Semmozhi Connect" };
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await currentUser();
  if (!user)
    redirect(`/login?next=${encodeURIComponent(`/workshop/${id}/meeting`)}`);
  const w = await db.workshop.findUnique({
    where: { id },
    select: { organizerId: true, status: true },
  });
  if (!w || w.status === "DRAFT") notFound();
  // Only the owning organizer and confirmed registrants enter the room;
  // everyone else is sent to the workshop page (register there first).
  const owner = user.role === "ORGANIZER" && w.organizerId === user.id;
  if (!owner) {
    const registration =
      user.role === "PARTICIPANT"
        ? await db.registration.findUnique({
            where: {
              workshopId_participantId: {
                workshopId: id,
                participantId: user.id,
              },
            },
          })
        : null;
    if (registration?.status !== "CONFIRMED") redirect(`/workshops/${id}`);
  }
  return <MeetingRoom id={id} user={user} demoMode={isDemo()} />;
}
