import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Finance data is per-user and must always be fresh, so pages render per request.
  // Cache Components is left off deliberately (see TDD §4).
  poweredByHeader: false,
  // postgres.js must not be bundled (its JSON parameter serialisers break when bundled).
  serverExternalPackages: ["postgres"],
  // Fonts with the ₹ glyph are read at runtime by the PDF evidence export.
  outputFileTracingIncludes: { "/api/claims/export": ["./src/assets/fonts/**"] },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
