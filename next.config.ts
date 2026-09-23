import type { NextConfig } from "next";
const config: NextConfig = {
  turbopack: { root: process.cwd() },
  agentRules: false,
  serverExternalPackages: ["@prisma/client", "bcryptjs"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          {
            key: "Permissions-Policy",
            value:
              'camera=(self "https://meet.jit.si"), microphone=(self "https://meet.jit.si")',
          },
        ],
      },
    ];
  },
};
export default config;
