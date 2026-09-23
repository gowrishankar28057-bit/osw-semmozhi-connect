import { cookies } from 'next/headers';
import { createHmac, randomBytes } from 'node:crypto';
import { compare, hash } from 'bcryptjs';
import type { Role } from '@prisma/client';
import { db } from './db';
import { assert } from './errors';

export function secret(name: string) {
  const value = process.env[name];
  assert(value && value.length >= 32, 503, `${name} must be configured with at least 32 characters.`);
  return value;
}
const tokenHash = (token: string) => createHmac('sha256', secret('AUTH_SECRET')).update(token).digest('hex');
export const publicUser = { id: true, name: true, email: true, role: true, department: true, enabled: true } as const;
export async function currentUser() {
  const token = (await cookies()).get('osw-session')?.value;
  if (!token) return null;
  const session = await db.authSession.findUnique({ where: { tokenHash: tokenHash(token) }, include: { user: { select: publicUser } } });
  if (!session || session.expiresAt <= new Date() || !session.user.enabled) return null;
  return session.user;
}
export type Actor = NonNullable<Awaited<ReturnType<typeof currentUser>>>;
export async function requireUser(role?: Role) {
  const user = await currentUser();
  assert(user, 401, 'Please sign in to continue.', 'AUTH_REQUIRED');
  assert(!role || user.role === role, 403, 'You do not have permission to perform this action.');
  return user;
}
export function checkOrigin(req: Request) {
  const origin = req.headers.get('origin');
  const expected = process.env.NEXT_PUBLIC_APP_URL;
  assert(expected, 503, 'Application URL is not configured.');
  assert(origin === new URL(expected).origin, 403, 'Request origin is not allowed.');
}
export async function throttle(key: string) {
  const now = new Date();
  const record = await db.authThrottle.upsert({ where: { key }, create: { key, attempts: 1, windowStart: now }, update: { attempts: { increment: 1 } } });
  if (now.getTime() - record.windowStart.getTime() > 15 * 60_000) await db.authThrottle.update({ where: { key }, data: { attempts: 1, windowStart: now } });
  else assert(record.attempts <= 20, 429, 'Too many attempts. Please try again in 15 minutes.');
}
export async function signIn(email: string, password: string, role?: Role) {
  await throttle(`login:${email}`);
  const user = await db.user.findUnique({ where: { email } });
  const valid = await compare(password, user?.passwordHash ?? '$2b$12$5MK/.J/uaZmaNTIBFtIUduOtMRulEzAKS6x6PYpaXmhEYS08WZkPW');
  assert(user && valid && user.enabled && (!role || user.role === role), 401, 'Email, password or selected role is incorrect, or this account is disabled.');
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + 12 * 60 * 60_000);
  await db.authSession.create({ data: { userId: user.id, tokenHash: tokenHash(token), expiresAt } });
  const secure = new URL(process.env.NEXT_PUBLIC_APP_URL!).protocol === 'https:';
  (await cookies()).set('osw-session', token, { httpOnly: true, secure, sameSite: 'lax', path: '/', expires: expiresAt });
  return { id: user.id, role: user.role, name: user.name };
}
export async function signOut() {
  const jar = await cookies(); const token = jar.get('osw-session')?.value;
  if (token) await db.authSession.deleteMany({ where: { tokenHash: tokenHash(token) } });
  jar.delete('osw-session');
}
export const hashPassword = (password: string) => hash(password, 12);
