import { z } from "zod";
const name = z.string().trim().min(2).max(100);
export const credentials = z.object({
  email: z.email().toLowerCase().max(254),
  password: z.string().min(8).max(72),
  role: z.enum(["ADMIN", "ORGANIZER", "PARTICIPANT"]).optional(),
});
export const account = credentials.extend({
  name,
  department: z.string().trim().max(120).default(""),
});
export const workshopInput = z
  .object({
    title: z.string().trim().min(4).max(160),
    description: z.string().trim().min(10).max(5000),
    speaker: name,
    mode: z.literal("ONLINE").default("ONLINE"),
    location: z.string().max(200).default("Online"),
    scheduledStart: z.iso.datetime(),
    scheduledEnd: z.iso.datetime(),
    registrationDeadline: z.iso.datetime(),
    capacity: z.coerce.number().int().min(1).max(10000),
  })
  .refine((x) => new Date(x.scheduledEnd) > new Date(x.scheduledStart), {
    message: "End time must be after start time.",
  })
  .refine((x) => new Date(x.registrationDeadline) <= new Date(x.scheduledEnd), {
    message: "Registration deadline must be no later than the workshop end.",
  });
export const messageInput = z.object({
  message: z.string().trim().min(1).max(2000),
});
export const materialInput = z.object({
  title: z.string().trim().min(2).max(150),
  url: z
    .url()
    .refine((x) => new URL(x).protocol === "https:", {
      message: "Use a secure https:// resource URL.",
    }),
});
