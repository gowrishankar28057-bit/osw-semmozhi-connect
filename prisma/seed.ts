import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';
const db = new PrismaClient();
if (process.env.DEMO_MODE !== 'true') throw new Error('Demo seed requires DEMO_MODE=true.');
for (const [name, email, password, role] of [
  ['Administrator', 'admin@osw.demo', 'Admin@123', 'ADMIN'],
  ['Participant', 'participant@osw.demo', 'Participant@123', 'PARTICIPANT']
] as const) {
  await db.user.upsert({ where: { email }, update: {}, create: { name, email, passwordHash: await hash(password, 12), role, seeded: true } });
}
console.log('Seeded Admin and Participant. No organizer or workshop was seeded.');
await db.$disconnect();
