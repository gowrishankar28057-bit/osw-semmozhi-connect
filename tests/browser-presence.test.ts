import test from "node:test";
import assert from "node:assert/strict";
import { BrowserPresence } from "../src/lib/browser-presence";

test("duplicate Jitsi joined events create only one connection", async () => {
  const calls: string[] = [];
  const tracker = new BrowserPresence(
    async (action, id) => {
      calls.push(`${action}:${id}`);
    },
    () => {},
    () => "first",
  );
  tracker.join();
  tracker.join();
  tracker.heartbeat();
  await tracker.settled();
  assert.deepEqual(calls, ["join:first"]);
  tracker.heartbeat();
  await tracker.settled();
  assert.deepEqual(calls, ["join:first", "heartbeat:first"]);
});

test("leave waits for initial join and reconnect uses a new ID", async () => {
  let resolveJoin!: () => void;
  let index = 0;
  const calls: string[] = [];
  const tracker = new BrowserPresence(
    async (action, id) => {
      calls.push(`${action}:${id}`);
      if (action === "join" && id === "1")
        await new Promise<void>((r) => {
          resolveJoin = r;
        });
    },
    () => {},
    () => String(++index),
  );
  tracker.join();
  await Promise.resolve();
  tracker.leave();
  tracker.join();
  await Promise.resolve();
  assert.deepEqual(calls, ["join:1", "join:2"]);
  resolveJoin();
  await tracker.settled();
  assert.deepEqual(calls, ["join:1", "join:2", "leave:1"]);
  tracker.heartbeat();
  await tracker.settled();
  assert.equal(calls.at(-1), "heartbeat:2");
});

test("failed initial join is retried before heartbeat", async () => {
  const calls: string[] = [],
    errors: string[] = [];
  const tracker = new BrowserPresence(
    async (action) => {
      calls.push(action);
      if (calls.length === 1) throw new Error("Offline");
    },
    (error) => errors.push(error),
  );
  tracker.join();
  await tracker.settled();
  tracker.heartbeat();
  await tracker.settled();
  tracker.heartbeat();
  await tracker.settled();
  assert.deepEqual(calls, ["join", "join", "heartbeat"]);
  assert.deepEqual(errors, ["Offline", "", ""]);
});

test("expired attendance starts a fresh segment without backdating", async () => {
  const calls: string[] = [];
  let index = 0;
  const tracker = new BrowserPresence(
    async (action, id) => {
      calls.push(`${action}:${id}`);
      if (action === "heartbeat" && id === "1")
        throw Object.assign(new Error("Expired"), { code: "PRESENCE_EXPIRED" });
    },
    () => {},
    () => String(++index),
  );
  tracker.join();
  await tracker.settled();
  tracker.heartbeat();
  await tracker.settled();
  assert.deepEqual(calls, ["join:1", "heartbeat:1", "join:2"]);
});

test("late failure after leaving cannot reopen attendance", async () => {
  let failJoin!: (error: Error) => void;
  const calls: string[] = [];
  const tracker = new BrowserPresence(
    async (action) => {
      calls.push(action);
      if (action === "join")
        await new Promise<void>((_, reject) => {
          failJoin = reject;
        });
    },
    () => {},
  );
  tracker.join();
  await Promise.resolve();
  tracker.leave();
  failJoin(Object.assign(new Error("Expired"), { code: "PRESENCE_EXPIRED" }));
  await tracker.settled();
  tracker.heartbeat();
  assert.deepEqual(calls, ["join", "leave"]);
});
