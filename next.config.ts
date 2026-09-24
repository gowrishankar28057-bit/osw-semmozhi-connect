import type { NextConfig } from "next";
// The embedded meeting iframe needs camera/microphone/screen-share delegation.
// JaaS (8x8.vc), public meet.jit.si and any configured JITSI_DOMAIN are allowed.
const meetingOrigins = [
  ...new Set(
    ["8x8.vc", "meet.jit.si", process.env.JITSI_DOMAIN?.trim()]
      .filter(Boolean)
      .map((host) => `"https://${host}"`),
  ),
].join(" ");
const delegated = ["camera", "microphone", "display-capture", "fullscreen"]
  .map((feature) => `${feature}=(self ${meetingOrigins})`)
  .join(", ");
const config: NextConfig = {
  turbopack: { root: process.cwd() },
  agentRules: false,
  serverExternalPackages: ["@prisma/client", "bcryptjs"],
  // The certificate PDF is drawn at request time from these files; make sure
  // serverless bundles (Vercel) contain them.
  outputFileTracingIncludes: {
    "/api/*": [
      "./public/assets/certificate-template.png",
      "./public/assets/NotoSans-Regular.ttf",
      "./public/assets/NotoSansTamil-Regular.ttf",
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Permissions-Policy", value: delegated },
        ],
      },
      {
        source: "/api/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex" }],
      },
    ];
  },
};
export default config;
