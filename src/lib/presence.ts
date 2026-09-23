import { SignJWT } from 'jose';
import { transaction, member } from './workshops';
import { assert } from './errors';
import { type Actor } from './auth';
import { db } from './db';
export async function meetingConfig(id: string,actor: Actor) {
  const w = await db.workshop.findUnique({ where: { id }, include: { session: true } });
  assert(w,404,'Workshop not found.');
  await member(db,w,actor);
  assert(actor.role !== 'ADMIN',403,'Only the organizer and registered participants may join.');
  assert(w.status === 'ONGOING' && w.session,409,'The meeting is not active.');
  let jwt: string | undefined;
  if (process.env.JITSI_APP_SECRET && process.env.JITSI_APP_ID) jwt = await new SignJWT({ context: { user: { id: actor.id,name: actor.name,moderator: w.organizerId === actor.id } }, room: w.meetingRoom, sub: process.env.JITSI_DOMAIN }).setProtectedHeader({ alg: 'HS256' }).setIssuer(process.env.JITSI_APP_ID).setAudience('jitsi').setIssuedAt().setExpirationTime('2h').sign(new TextEncoder().encode(process.env.JITSI_APP_SECRET));
  return { room: w.meetingRoom,domain: process.env.JITSI_DOMAIN || 'meet.jit.si',jwt,displayName: actor.name,sessionId: w.session.id,presenceMode: process.env.PRESENCE_MODE || 'webhook' };
}
export async function recordPresence(id: string,actor: Actor,action: 'join'|'heartbeat'|'leave',connectionId: string,source: 'browser'|'webhook' = 'browser') {
  assert(actor.role === 'PARTICIPANT',403,'Participant attendance only.');
  if (source === 'browser' && process.env.PRESENCE_MODE !== 'browser') return { success: true,trackedBy: 'server' };
  return transaction(id,async(tx,w)=>{
    await member(tx,w,actor);
    assert(w.status === 'ONGOING',409,'The workshop is not ongoing.');
    const s = await tx.workshopSession.findUniqueOrThrow({ where: { workshopId: id } });
    const now = new Date();
    const open = await tx.meetingPresence.findMany({ where: { sessionId: s.id,participantId: actor.id,connectionId,leftAt: null,source } });
    const current = open.at(-1);
    if (action === 'join') {
      if (current && (source === 'webhook' || now.getTime()-current.lastSeenAt.getTime()<30_000)) return { success: true };
      if (current) await tx.meetingPresence.update({ where: { id: current.id },data: { leftAt: new Date(current.lastSeenAt.getTime()+15_000) } });
      await tx.meetingPresence.create({ data: { sessionId: s.id,participantId: actor.id,connectionId,joinedAt: now,lastSeenAt: now,source } });
    } else if (current) {
      if (source === 'browser' && now.getTime()-current.lastSeenAt.getTime()>30_000) {
        await tx.meetingPresence.update({ where: { id: current.id },data: { leftAt: new Date(current.lastSeenAt.getTime()+15_000) } });
        assert(action !== 'heartbeat',409,'Attendance connection expired. Leave and rejoin the meeting.');
      } else await tx.meetingPresence.update({ where: { id: current.id },data: action === 'leave' ? { leftAt: now,lastSeenAt: now } : { lastSeenAt: now } });
    } else assert(action !== 'heartbeat',409,'Join the meeting before reporting presence.');
    return { success: true };
  });
}
