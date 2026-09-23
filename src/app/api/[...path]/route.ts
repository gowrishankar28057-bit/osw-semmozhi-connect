import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import {
  requireUser,
  currentUser,
  checkOrigin,
  signIn,
  signOut,
  hashPassword,
  publicUser,
  throttle,
  type Actor,
} from "@/lib/auth";
import { AppError, assert } from "@/lib/errors";
import {
  account,
  credentials,
  workshopInput,
  messageInput,
  materialInput,
} from "@/lib/schemas";
import {
  isDemo,
  transaction,
  owner,
  member,
  audit,
  roomName,
  changeState,
  register,
  publicOrganizer,
  attendanceRows,
  notifyRegistered,
} from "@/lib/workshops";
import { attendanceWindow, verifyAttendance } from "@/lib/qr";
import { meetingConfig, recordPresence } from "@/lib/presence";
import { certificatePdf } from "@/lib/certificate";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path: string[] }> };
const ok = (value: unknown, status = 200) =>
  NextResponse.json(value, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
async function body(req: Request) {
  const raw = await req.text();
  assert(raw.length <= 20_000, 413, "Request too large.");
  try {
    return JSON.parse(raw);
  } catch {
    throw new AppError(400, "Invalid request.");
  }
}
async function dispatch(req: Request, ctx: Context) {
  const { path: p } = await ctx.params;
  const [root, id, action] = p;
  const post = req.method === "POST";
  const url = new URL(req.url);
  if (post && root !== "jitsi-webhook") checkOrigin(req);
  if (root === "auth") {
    if (!post && id === "me")
      return ok({ user: await currentUser(), demoMode: isDemo() });
    if (post && id === "login") {
      const data = credentials.parse(await body(req));
      return ok(await signIn(data.email, data.password, data.role));
    }
    if (post && id === "register") {
      const data = account.parse(await body(req));
      await throttle(`signup:${data.email}`);
      await db.user.create({
        data: {
          name: data.name,
          email: data.email,
          passwordHash: await hashPassword(data.password),
          department: data.department,
          role: "PARTICIPANT",
        },
      });
      return ok(await signIn(data.email, data.password, "PARTICIPANT"), 201);
    }
    if (post && id === "logout") {
      await signOut();
      return ok({ success: true });
    }
  }
  if (root === "certificate" && id && !post) {
    const c = await db.certificate.findUnique({ where: { id } });
    assert(c, 404, "Certificate not found.", "CERTIFICATE_NOT_FOUND");
    if (action === "pdf") {
      const user = await requireUser();
      const w = await db.workshop.findUniqueOrThrow({
        where: { id: c.workshopId },
      });
      assert(
        user.id === c.participantId ||
          user.id === w.organizerId ||
          user.role === "ADMIN",
        403,
        "Access denied.",
      );
      const bytes = await certificatePdf(c);
      return new NextResponse(Buffer.from(bytes), {
        headers: {
          "Content-Type": "application/pdf",
          "Cache-Control": "private, no-store",
          "Content-Disposition": `${url.searchParams.get("download") === "1" ? "attachment" : "inline"}; filename="${c.certificateNumber}.pdf"`,
        },
      });
    }
    return ok({
      id: c.id,
      certificateNumber: c.certificateNumber,
      participantName: c.participantName,
      workshopTitle: c.workshopTitle,
      workshopDate: c.workshopDate,
      attendancePercentage: c.attendancePercentage,
      issuedAt: c.issuedAt,
      speaker: c.speaker,
    });
  }
  if (root === "jitsi-webhook" && post) {
    const secret = process.env.JITSI_WEBHOOK_SECRET;
    assert(
      secret && secret.length >= 32,
      503,
      "Server presence callback is not configured.",
    );
    const raw = await req.text();
    assert(raw.length < 10_000, 413, "Request too large.");
    const stamp = req.headers.get("x-osw-timestamp") || "";
    const signature = req.headers.get("x-osw-signature") || "";
    assert(
      /^\d+$/.test(stamp) &&
        Math.abs(Date.now() - Number(stamp) * 1000) < 30_000,
      403,
      "Invalid callback timestamp.",
    );
    const expected = createHmac("sha256", secret)
      .update(`${stamp}.${raw}`)
      .digest("hex");
    assert(
      signature.length === expected.length &&
        timingSafeEqual(Buffer.from(signature), Buffer.from(expected)),
      403,
      "Invalid callback signature.",
    );
    const d = z
      .object({
        workshopId: z.string(),
        participantId: z.string(),
        connectionId: z.string().min(8).max(150),
        action: z.enum(["join", "leave"]),
        eventId: z.string().min(8).max(150),
      })
      .parse(JSON.parse(raw));
    const actor = await db.user.findUnique({
      where: { id: d.participantId },
      select: publicUser,
    });
    assert(actor?.enabled, 403, "Account unavailable.");
    // A repeated join/leave is idempotent per connection. The bridge must use a fresh connectionId for every reconnect.
    const receipt = await db.authThrottle.upsert({
      where: { key: `webhook:${d.eventId}` },
      create: { key: `webhook:${d.eventId}`, attempts: 1 },
      update: { attempts: { increment: 1 } },
    });
    if (receipt.attempts > 1) return ok({ success: true, duplicate: true });
    try {
      return ok(
        await recordPresence(
          d.workshopId,
          actor,
          d.action,
          d.connectionId,
          "webhook",
        ),
      );
    } catch (e) {
      await db.authThrottle.delete({ where: { key: `webhook:${d.eventId}` } });
      throw e;
    }
  }
  const actor = await requireUser();
  if (root === "dashboard" && !post) return ok(await dashboard(actor));
  if (root === "notifications") {
    if (!post)
      return ok(
        await db.notification.findMany({
          where: { userId: actor.id },
          orderBy: { createdAt: "desc" },
          take: 100,
        }),
      );
    await db.notification.updateMany({
      where: { userId: actor.id, ...(id === "all" ? {} : { id }) },
      data: { readAt: new Date() },
    });
    return ok({ success: true });
  }
  if (root === "organizers") {
    assert(actor.role === "ADMIN", 403, "Admin access required.");
    if (!post)
      return ok(
        await db.user.findMany({
          where: { role: "ORGANIZER" },
          select: {
            ...publicUser,
            createdAt: true,
            _count: { select: { workshops: true } },
          },
          orderBy: { createdAt: "desc" },
        }),
      );
    if (!id) {
      const d = account.parse(await body(req));
      const user = await db.$transaction(async (tx) => {
        const u = await tx.user.create({
          data: {
            name: d.name,
            email: d.email,
            passwordHash: await hashPassword(d.password),
            department: d.department,
            role: "ORGANIZER",
            demo: isDemo(),
          },
          select: publicUser,
        });
        await audit(
          tx,
          actor.id,
          "Organizer created",
          `${u.name} (${u.email})`,
          isDemo(),
        );
        return u;
      });
      return ok(user, 201);
    }
    const d = z
      .object({
        name: z.string().trim().min(2).max(100).optional(),
        department: z.string().max(120).optional(),
        enabled: z.boolean().optional(),
      })
      .parse(await body(req));
    const target = await db.user.findUnique({ where: { id } });
    assert(target?.role === "ORGANIZER", 404, "Organizer not found.");
    return ok(
      await db.$transaction(async (tx) => {
        const u = await tx.user.update({
          where: { id },
          data: d,
          select: publicUser,
        });
        if (d.enabled === false)
          await tx.authSession.deleteMany({ where: { userId: id } });
        await audit(tx, actor.id, "Organizer updated", u.name, target.demo);
        return u;
      }),
    );
  }
  if (root === "workshops") {
    if (!id && !post) {
      const search = url.searchParams.get("q") || "";
      const status = url.searchParams.get("status");
      const allowed = ["PUBLISHED", "ONGOING", "COMPLETED"];
      const where: Prisma.WorkshopWhereInput = {
        ...(actor.role === "ORGANIZER"
          ? { organizerId: actor.id }
          : actor.role === "PARTICIPANT"
            ? { status: { in: ["PUBLISHED", "ONGOING", "COMPLETED"] } }
            : {}),
        title: { contains: search, mode: "insensitive" },
      };
      if (status && allowed.includes(status))
        where.status = status as "PUBLISHED" | "ONGOING" | "COMPLETED";
      const workshops = await db.workshop.findMany({
        where,
        include: {
          organizer: { select: publicOrganizer },
          registrations: {
            where: { participantId: actor.id },
            select: { status: true },
          },
          _count: {
            select: { registrations: { where: { status: "CONFIRMED" } } },
          },
        },
        orderBy: { scheduledStart: "desc" },
        take: 200,
      });
      return ok(
        workshops.map(({ meetingRoom, ...workshop }) => {
          void meetingRoom;
          return workshop;
        }),
      );
    }
    if (!id && post) {
      assert(actor.role === "ORGANIZER", 403, "Organizer access required.");
      const d = workshopInput.parse(await body(req));
      return ok(
        await db.$transaction(async (tx) => {
          const w = await tx.workshop.create({
            data: {
              ...d,
              organizerId: actor.id,
              meetingRoom: roomName(),
              demo: isDemo(),
            },
          });
          await audit(tx, actor.id, "Workshop created", w.title, w.demo);
          return w;
        }),
        201,
      );
    }
    if (id && !post && !action) {
      const w = await db.workshop.findUnique({
        where: { id },
        include: {
          organizer: { select: publicOrganizer },
          session: true,
          registrations: {
            where: { participantId: actor.id },
            select: { status: true },
          },
          _count: {
            select: { registrations: { where: { status: "CONFIRMED" } } },
          },
        },
      });
      assert(w, 404, "Workshop not found.");
      assert(
        w.status !== "DRAFT" ||
          w.organizerId === actor.id ||
          actor.role === "ADMIN",
        403,
        "This workshop is not published.",
      );
      const { meetingRoom: _room, ...safe } = w;
      void _room;
      return ok(safe);
    }
    if (id && post && !action) {
      const d = workshopInput.parse(await body(req));
      return ok(
        await transaction(id, async (tx, w) => {
          owner(w, actor);
          assert(
            ["DRAFT", "PUBLISHED"].includes(w.status),
            409,
            "An active or completed workshop cannot be edited.",
          );
          const count = await tx.registration.count({
            where: { workshopId: id, status: "CONFIRMED" },
          });
          assert(
            d.capacity >= count,
            400,
            "Capacity cannot be smaller than confirmed registrations.",
          );
          return tx.workshop.update({ where: { id }, data: d });
        }),
      );
    }
    if (post && ["publish", "start", "end"].includes(action))
      return ok(
        await changeState(id, actor, action as "publish" | "start" | "end"),
      );
    if (post && action === "register") return ok(await register(id, actor));
    if (post && action === "cancel") return ok(await register(id, actor, true));
    if (action === "attendance" && !post)
      return ok(await attendanceRows(id, actor));
    if (action === "window")
      return ok(
        await attendanceWindow(
          id,
          actor,
          post
            ? z
                .object({ action: z.enum(["open", "close", "demo"]) })
                .parse(await body(req)).action
            : "read",
        ),
      );
    if (action === "meeting" && !post)
      return ok(await meetingConfig(id, actor));
    if (action === "presence" && post) {
      const d = z
        .object({
          action: z.enum(["join", "heartbeat", "leave"]),
          connectionId: z.string().min(8).max(150),
        })
        .parse(await body(req));
      return ok(await recordPresence(id, actor, d.action, d.connectionId));
    }
    if (["community", "announcements", "materials"].includes(action))
      return ok(
        await transaction(id, async (tx, w) => {
          await member(tx, w, actor);
          if (action === "community") {
            if (!post)
              return tx.communityMessage.findMany({
                where: { workshopId: id },
                include: { user: { select: publicOrganizer } },
                orderBy: { createdAt: "desc" },
                take: 100,
              });
            assert(
              actor.role !== "ADMIN",
              403,
              "Only workshop members can post.",
            );
            const d = messageInput.parse(await body(req));
            return tx.communityMessage.create({
              data: { workshopId: id, userId: actor.id, ...d },
            });
          }
          if (action === "materials") {
            if (!post)
              return tx.learningMaterial.findMany({
                where: { workshopId: id },
                orderBy: { createdAt: "desc" },
              });
            owner(w, actor);
            const d = materialInput.parse(await body(req));
            return tx.learningMaterial.create({
              data: { workshopId: id, ...d },
            });
          }
          if (!post)
            return tx.announcement.findMany({
              where: { workshopId: id },
              orderBy: { createdAt: "desc" },
            });
          owner(w, actor);
          const d = messageInput.parse(await body(req));
          const a = await tx.announcement.create({
            data: { workshopId: id, ...d },
          });
          await notifyRegistered(tx, w, d.message);
          return a;
        }),
      );
  }
  if (root === "attendance" && id === "verify" && post) {
    const d = z.object({ token: z.string().max(3000) }).parse(await body(req));
    return ok(await verifyAttendance(d.token, actor));
  }
  if (root === "certificates" && !post)
    return ok(
      await db.certificate.findMany({
        where:
          actor.role === "PARTICIPANT"
            ? { participantId: actor.id }
            : actor.role === "ORGANIZER"
              ? { workshop: { organizerId: actor.id } }
              : {},
        orderBy: { issuedAt: "desc" },
      }),
    );
  if (root === "profile" && post) {
    const d = z
      .object({
        name: z.string().trim().min(2).max(100),
        department: z.string().trim().max(120),
      })
      .parse(await body(req));
    return ok(
      await db.user.update({
        where: { id: actor.id },
        data: d,
        select: publicUser,
      }),
    );
  }
  if (root === "reset" && post) {
    assert(isDemo(), 404, "Not found.");
    assert(actor.role === "ADMIN", 403, "Admin access required.");
    const d = z
      .object({ confirmation: z.literal("RESET") })
      .parse(await body(req));
    void d;
    await db.$transaction(async (tx) => {
      await tx.workshop.deleteMany({ where: { demo: true } });
      await tx.notification.deleteMany({ where: { demo: true } });
      await tx.auditLog.deleteMany({ where: { demo: true } });
      await tx.user.deleteMany({
        where: {
          demo: true,
          seeded: false,
          role: "ORGANIZER",
          workshops: { none: {} },
        },
      });
      await audit(
        tx,
        actor.id,
        "Demo reset",
        "Demo-marked workshops, organizers and related data removed.",
      );
    });
    return ok({ success: true });
  }
  throw new AppError(404, "Endpoint not found.");
}
async function dashboard(actor: Actor) {
  const scope: Prisma.WorkshopWhereInput =
    actor.role === "ORGANIZER"
      ? { organizerId: actor.id }
      : actor.role === "PARTICIPANT"
        ? {
            registrations: {
              some: { participantId: actor.id, status: "CONFIRMED" },
            },
          }
        : {};
  const certificateScope =
    actor.role === "PARTICIPANT"
      ? { participantId: actor.id }
      : actor.role === "ORGANIZER"
        ? { workshop: { organizerId: actor.id } }
        : {};
  const [
    total,
    upcoming,
    completed,
    participants,
    certificates,
    notifications,
    organizers,
    activeOrganizers,
    attendance,
    workshops,
    activity,
  ] = await Promise.all([
    db.workshop.count({ where: scope }),
    db.workshop.count({
      where: { ...scope, status: { in: ["PUBLISHED", "ONGOING"] } },
    }),
    db.workshop.count({ where: { ...scope, status: "COMPLETED" } }),
    actor.role === "ADMIN"
      ? db.user.count({ where: { role: "PARTICIPANT" } })
      : db.registration.count({
          where: { status: "CONFIRMED", workshop: scope },
        }),
    db.certificate.count({ where: certificateScope }),
    db.notification.findMany({
      where: { userId: actor.id },
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
    db.user.count({ where: { role: "ORGANIZER" } }),
    db.user.count({ where: { role: "ORGANIZER", enabled: true } }),
    db.attendanceRecord.aggregate({
      where: {
        ...(actor.role === "PARTICIPANT" ? { participantId: actor.id } : {}),
        session: { workshop: { ...scope, status: "COMPLETED" } },
      },
      _avg: { attendancePercentage: true },
    }),
    db.workshop.findMany({
      where: scope,
      include: {
        organizer: { select: publicOrganizer },
        _count: {
          select: {
            registrations: { where: { status: "CONFIRMED" } },
            certificates: true,
          },
        },
      },
      orderBy: { scheduledStart: "desc" },
      take: 8,
    }),
    actor.role === "ADMIN"
      ? db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 30 })
      : Promise.resolve([]),
  ]);
  const unread = await db.notification.count({
    where: { userId: actor.id, readAt: null },
  });
  // Meeting room secrets are supplied only by the membership-gated /meeting endpoint.
  return {
    user: actor,
    demoMode: isDemo(),
    presenceMode: process.env.PRESENCE_MODE || "webhook",
    stats: {
      total,
      upcoming,
      completed,
      participants,
      certificates,
      organizers,
      activeOrganizers,
      attendance: attendance._avg.attendancePercentage,
    },
    workshops: workshops.map(({ meetingRoom, ...w }) => {
      void meetingRoom;
      return w;
    }),
    notifications,
    unread,
    activity,
  };
}
async function handle(req: Request, ctx: Context) {
  try {
    return await dispatch(req, ctx);
  } catch (e) {
    if (e instanceof AppError)
      return ok({ error: e.message, code: e.code }, e.status);
    if (e instanceof ZodError)
      return ok({ error: e.issues.map((x) => x.message).join(" ") }, 400);
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      return ok(
        {
          error:
            "This record already exists. Use a different email or check your registration.",
        },
        409,
      );
    console.error(
      "OSW request failed:",
      e instanceof Error ? e.name : "UnknownError",
    );
    return ok(
      { error: "Unable to complete this request. Please try again." },
      500,
    );
  }
}
export const GET = handle;
export const POST = handle;
