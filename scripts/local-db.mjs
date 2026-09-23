import EmbeddedPostgres from "embedded-postgres";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";

const localDir = path.resolve("work/local-postgres");
mkdirSync(localDir, { recursive: true });
const settingsFile = path.join(localDir, "settings.json");
const settings = existsSync(settingsFile)
  ? JSON.parse(readFileSync(settingsFile, "utf8"))
  : { password: randomBytes(24).toString("hex"), port: 55432 };
writeFileSync(settingsFile, JSON.stringify(settings));
const pg = new EmbeddedPostgres({
  databaseDir: path.join(localDir, "data"),
  user: "osw",
  password: settings.password,
  port: settings.port,
  persistent: true,
  postgresFlags: ["-h", "127.0.0.1"],
  onLog: () => {},
  onError: (e) => console.error(String(e)),
});
if (!existsSync(path.join(localDir, "data/PG_VERSION"))) await pg.initialise();
await pg.start();
const client = pg.getPgClient();
await client.connect();
const result = await client.query(
  "SELECT 1 FROM pg_database WHERE datname='osw'",
);
if (!result.rowCount) await pg.createDatabase("osw");
await client.end();
if (!existsSync(".env")) {
  const url = `postgresql://osw:${settings.password}@127.0.0.1:${settings.port}/osw`;
  writeFileSync(
    ".env",
    `DATABASE_URL=${url}\nDIRECT_URL=${url}\nAUTH_SECRET=${randomBytes(32).toString("hex")}\nQR_SIGNING_SECRET=${randomBytes(32).toString("hex")}\nNEXT_PUBLIC_APP_URL=http://localhost:3000\nDEMO_MODE=true\nJITSI_DOMAIN=meet.jit.si\nPRESENCE_MODE=browser\n`,
  );
}
console.log(
  `Local PostgreSQL is ready on 127.0.0.1:${settings.port}. Local-only secrets are in ignored .env. Keep this process running.`,
);
async function stop() {
  await pg.stop();
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
setInterval(() => {}, 60_000);
