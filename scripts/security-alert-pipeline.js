export default {
  async fetch(request, env, ctx) {
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    // ------------------------
    // Normalize
    // ------------------------
    const normalized = {
      source: detectSource(body),
      type: detectType(body),
      severity: detectSeverity(body),
      timestamp: new Date().toISOString(),
      raw: body
    };

    // ------------------------
    // Hash (dedup key)
    // ------------------------
    const hash = await generateHash(normalized);

    const existingRaw = await env.ALERT_KV.get(hash);
    let existing = existingRaw ? JSON.parse(existingRaw) : null;

    // ------------------------
    // EXISTING INCIDENT → UPDATE
    // ------------------------
    if (existing) {
      console.log("UPDATING EXISTING INCIDENT:", existing);

      await updateKanboardTask(env, existing.task_id);

      return new Response(JSON.stringify({
        status: "updated",
        incident_id: existing.incident_id
      }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    // ------------------------
    // NEW INCIDENT FLOW
    // ------------------------

    const sanitized = {
      title: buildTitle(normalized),
      severity: normalized.severity,
      source: normalized.source,
      summary: buildSummary(normalized)
    };

    const incidentId = generateIncidentId(hash);

    const taskId = await createKanboardTask(env, sanitized, incidentId);

    // Store mapping in KV (24h TTL)
    await env.ALERT_KV.put(hash, JSON.stringify({
      incident_id: incidentId,
      task_id: taskId
    }), { expirationTtl: 86400 });

    console.log("NEW INCIDENT CREATED:", {
      incidentId,
      taskId
    });

    return new Response(JSON.stringify({
      status: "new",
      incident_id: incidentId
    }), {
      headers: { "Content-Type": "application/json" }
    });
  }
};

// ------------------------
// Hashing
// ------------------------
async function generateHash(event) {
  const input = JSON.stringify({
    source: event.source,
    type: event.type,
    severity: event.severity
  });

  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);

  return [...new Uint8Array(hashBuffer)]
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

// ------------------------
// Incident ID
// ------------------------
function generateIncidentId(hash) {
  return "INC-" + hash.substring(0, 6).toUpperCase();
}

// ------------------------
// Kanboard - Create Task
// ------------------------
async function createKanboardTask(env, event, incidentId) {
  const columnId =
    event.severity === "high"
      ? env.KANBOARD_COLUMN_CRITICAL
      : env.KANBOARD_COLUMN_INVESTIGATING;

  const payload = {
    jsonrpc: "2.0",
    method: "createTask",
    id: 1,
    params: {
      title: `[${incidentId}] ${event.title}`,
      project_id: Number(env.KANBOARD_PROJECT_ID),
      column_id: Number(columnId),
      description: `
Incident ID: ${incidentId}
Severity: ${event.severity}
Source: ${event.source}
Summary: ${event.summary}
      `
    }
  };

  const res = await fetch(env.KANBOARD_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Basic " + btoa("jsonrpc:" + env.KANBOARD_TOKEN)
    },
    body: JSON.stringify(payload)
  });

  const data = await res.json();

  console.log("KANBOARD CREATE RESPONSE:", data);

  return data.result; // task_id
}

// ------------------------
// Kanboard - Update Task
// ------------------------
async function updateKanboardTask(env, taskId) {
  const payload = {
    jsonrpc: "2.0",
    method: "updateTask",
    id: 1,
    params: {
      id: Number(taskId)
    }
  };

  const res = await fetch(env.KANBOARD_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Basic " + btoa("jsonrpc:" + env.KANBOARD_TOKEN)
    },
    body: JSON.stringify(payload)
  });

  const data = await res.json();

  console.log("KANBOARD UPDATE RESPONSE:", data);
}

// ------------------------
// Helpers
// ------------------------
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
