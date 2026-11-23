export default {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          // The code runner intentionally uses an opaque srcdoc/Blob worker.
          // A full script policy needs a separate nonce/runner design review.
          {
            key: "Content-Security-Policy",
            value: "object-src 'none'; base-uri 'self'",
          },
        ],
      },
    ];
  },
};
