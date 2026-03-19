export default {
  async fetch(request, env, ctx) {
    // Only allow POST
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return new Response("Invalid JSON", { status: 400 });
    }

    // --- Normalize Input ---
    const normalized = {
      source: detectSource(body),
      type: detectType(body),
      severity: detectSeverity(body),
      timestamp: new Date().toISOString(),
      raw: body // stays internal only (not returned)
    };

    // --- Sanitize ---
    const sanitized = {
      title: buildTitle(normalized),
      severity: normalized.severity,
      source: normalized.source,
      summary: buildSummary(normalized)
    };

    // --- Log sanitized output only ---
    console.log("SANITIZED EVENT:", sanitized);

    return new Response(JSON.stringify({
      status: "ok",
      sanitized
    }), {
      headers: { "Content-Type": "application/json" }
    });
  }
};

// --- Helpers ---

function detectSource(body) {
  if (body?.source) return body.source;
  if (body?.ray_id) return "cloudflare";
  if (body?.device) return "firewalla";
  return "unknown";
}

function detectType(body) {
  if (body?.action === "block") return "waf";
  return "generic";
}

function detectSeverity(body) {
  if (body?.severity) return body.severity.toLowerCase();

  if (body?.action === "block") return "high";

  return "low";
}

function buildTitle(event) {
  if (event.type === "waf") {
    return "WAF Alert: Suspicious Traffic Pattern";
  }
  return "Security Alert: Event Detected";
}

function buildSummary(event) {
  return `Event detected from ${event.source} classified as ${event.type}`;
}
