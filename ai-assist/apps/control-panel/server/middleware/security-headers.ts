export default defineEventHandler((event) => {
  setResponseHeaders(event, {
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    "x-frame-options": "DENY",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
  });

  if (process.env.NODE_ENV === "production") {
    setResponseHeaders(event, {
      "content-security-policy":
        "default-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; object-src 'none'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'",
      "strict-transport-security": "max-age=31536000; includeSubDomains",
    });
  }

  const pathname = getRequestURL(event).pathname;
  if (pathname.startsWith("/api/v1/auth") || pathname.startsWith("/api/v1/widget")) {
    setResponseHeader(event, "cache-control", "no-store");
  }
});
