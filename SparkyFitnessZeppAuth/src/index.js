// Zepp Open Platform callback endpoints for SparkyFitness.
//
// Registration stage only. Zepp checks that both callback URLs are reachable
// when the app is registered, so a bare GET or HEAD answers 200. Any real
// traffic (an authorization code, a state, or a data push) is refused with 503
// until the OAuth relay is built: no code is exchanged, no request body is
// read, and nothing from the request is echoed back.

const OAUTH_CALLBACK = "/api/zepp/oauth/callback";
const DATA_CALLBACK = "/api/zepp/data/callback";

const SECURITY_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "Content-Security-Policy":
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
};

function respond(request, payload, status, extraHeaders = {}) {
  const headers = { ...SECURITY_HEADERS, ...extraHeaders };
  const body = request.method === "HEAD" ? null : JSON.stringify(payload);
  return new Response(body, { status, headers });
}

function notEnabled(request, error) {
  return respond(
    request,
    { error, message: "SparkyFitness Zepp integration is not enabled yet." },
    503,
    { "Retry-After": "3600" },
  );
}

function handleOAuthCallback(request, url) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return respond(request, { error: "method_not_allowed" }, 405, {
      Allow: "GET, HEAD",
    });
  }
  if (url.search) return notEnabled(request, "oauth_not_enabled");
  return respond(
    request,
    {
      service: "SparkyFitness",
      endpoint: "authorization_callback",
      status: "registration_only",
    },
    200,
  );
}

function handleDataCallback(request, url) {
  if (request.method === "POST") {
    // Deliberately leave the body unread: acknowledging a push we do not
    // store would tell Zepp it was delivered.
    return notEnabled(request, "data_ingestion_not_enabled");
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    return respond(request, { error: "method_not_allowed" }, 405, {
      Allow: "GET, HEAD, POST",
    });
  }
  if (url.search) return notEnabled(request, "data_ingestion_not_enabled");
  return respond(
    request,
    {
      service: "SparkyFitness",
      endpoint: "data_callback",
      status: "registration_only",
    },
    200,
  );
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "");
    if (path === OAUTH_CALLBACK) return handleOAuthCallback(request, url);
    if (path === DATA_CALLBACK) return handleDataCallback(request, url);
    return respond(request, { error: "not_found" }, 404);
  },
};
