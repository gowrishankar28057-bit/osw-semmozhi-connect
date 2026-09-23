import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
const files = execFileSync("git", ["ls-files", "--cached", "-z"], {
  encoding: "utf8",
})
  .split("\0")
  .filter(Boolean);
const failures = [];
const values = existsSync(".env")
  ? readFileSync(".env", "utf8")
      .split(/\r?\n/)
      .filter((x) =>
        /^(DATABASE_URL|DIRECT_URL|AUTH_SECRET|QR_SIGNING_SECRET|.*API_KEY|.*TOKEN|.*PASSWORD|JITSI_APP_SECRET|JITSI_WEBHOOK_SECRET)=/.test(
          x,
        ),
      )
      .map((x) => x.slice(x.indexOf("=") + 1).replace(/^['"]|['"]$/g, ""))
      .filter((x) => x.length >= 12)
  : [];
for (const file of files) {
  if (
    (/(^|\/)\.env(?:\.|$)/.test(file) && file !== ".env.example") ||
    /(^|\/)(node_modules|\.next|work|\.vercel)\//.test(file) ||
    /\.(pem|key)$/.test(file)
  )
    failures.push(`${file}: prohibited path`);
  const bytes = execFileSync("git", ["show", `:${file}`], {
    maxBuffer: 25 * 1024 * 1024,
  });
  if (values.some((v) => bytes.includes(Buffer.from(v))))
    failures.push(`${file}: contains a configured local secret`);
  if (/\.(ts|tsx|js|mjs|json|md|yml|yaml|toml)$/.test(file)) {
    const text = bytes.toString("utf8");
    if (
      /(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|AKIA[0-9A-Z]{16})/.test(
        text,
      )
    )
      failures.push(`${file}: possible credential pattern`);
  }
}
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(
  `Secret scan passed for ${files.length} staged/tracked files. No local configured secrets, forbidden env files, private keys or known token patterns found.`,
);
