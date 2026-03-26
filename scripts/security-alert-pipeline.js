export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "POST") {
      if (url.pathname === "/github") {
        return handleGitHubEvent(request, env);
      }

      if (url.pathname === "/kanboard") {
        return handleKanboardWebhook(request, env);
      }

      return handleAlert(request, env);
    }

    return new Response("Not Found", { status: 404 });
  }
};

// ========================
// ALERT INTAKE
// ========================
async function handleAlert(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const normalized = {
    source: detectSource(body),
    type: detectType(body),
    severity: detectSeverity(body),
    timestamp: new Date().toISOString(),
    raw: body
  };

  const hash = await generateHash(normalized);

  const existingRaw = await env.ALERT_KV.get(hash);
  let existing = existingRaw ? JSON.parse(existingRaw) : null;

  if (existing) {
    await updateKanboardTask(env, existing.task_id);

    return new Response(JSON.stringify({
      status: "updated",
      incident_id: existing.incident_id
    }), {
      headers: { "Content-Type": "application/json" }
    });
  }

  const sanitized = {
    title: buildTitle(normalized),
    severity: normalized.severity,
    source: normalized.source,
    summary: buildSummary(normalized)
  };

  const incidentId = generateIncidentId(hash);

  const taskId = await createKanboardTask(env, sanitized, incidentId);

  await env.ALERT_KV.put(hash, JSON.stringify({
    incident_id: incidentId,
    task_id: taskId
  }), { expirationTtl: 86400 });

  return new Response(JSON.stringify({
    status: "new",
    incident_id: incidentId
  }), {
    headers: { "Content-Type": "application/json" }
  });
}

// ========================
// GITHUB → RESOLVE
// ========================
async function handleGitHubEvent(request, env) {
  const body = await request.json();

  const isPRMerged =
    body.pull_request && body.pull_request.merged === true;

  const isIssueClosed =
    body.issue && body.action === "closed";

  if (!isPRMerged && !isIssueClosed) {
    return new Response("Ignored", { status: 200 });
  }

  const title =
    body.pull_request?.title || body.issue?.title || "";

  const match = title.match(/INC-[A-Z0-9]+/);

  if (!match) {
    return new Response("No Incident ID", { status: 200 });
  }

  const incidentId = match[0];

  const taskId = await findTaskByIncident(env, incidentId);

  if (!taskId) {
    return new Response("Task not found", { status: 404 });
  }

  await moveTaskToResolved(env, taskId);

  return new Response("Kanboard updated", { status: 200 });
}

// ========================
// KANBOARD → DISCORD (FIXED)
// ========================
async function handleKanboardWebhook(request, env) {
  const url = new URL(request.url);
  const key = url.searchParams.get("key");

  if (key !== env.KANBOARD_WEBHOOK_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = await request.json();

  // 🔥 FIXED LINE
  const task = body.event_data?.task;

  console.log("KANBOARD EVENT:", body);

  if (!task) {
    return new Response("No task", { status: 400 });
  }

  // only trigger on Critical column
  if (String(task.column_id) !== String(env.KANBOARD_COLUMN_CRITICAL)) {
    return new Response("Ignored", { status: 200 });
  }

  await sendDiscordAlert(env, task);

  return new Response("Alert sent", { status: 200 });
}

// ========================
// HASHING
// ========================
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

// ========================
// INCIDENT ID
// ========================
function generateIncidentId(hash) {
  return "INC-" + hash.substring(0, 6).toUpperCase();
}

// ========================
// CREATE TASK
// ========================
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
  return data.result;
}

// ========================
// UPDATE TASK
// ========================
async function updateKanboardTask(env, taskId) {
  const payload = {
    jsonrpc: "2.0",
    method: "updateTask",
    id: 1,
    params: {
      id: Number(taskId)
    }
  };

  await fetch(env.KANBOARD_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Basic " + btoa("jsonrpc:" + env.KANBOARD_TOKEN)
    },
    body: JSON.stringify(payload)
  });
}

// ========================
// MOVE TO RESOLVED
// ========================
async function moveTaskToResolved(env, taskId) {
  const payload = {
    jsonrpc: "2.0",
    method: "moveTaskPosition",
    id: 1,
    params: {
      project_id: Number(env.KANBOARD_PROJECT_ID),
      task_id: Number(taskId),
      column_id: Number(env.KANBOARD_COLUMN_RESOLVED),
      position: 1
    }
  };

  await fetch(env.KANBOARD_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Basic " + btoa("jsonrpc:" + env.KANBOARD_TOKEN)
    },
    body: JSON.stringify(payload)
  });
}

// ========================
// KV LOOKUP
// ========================
async function findTaskByIncident(env, incidentId) {
  const list = await env.ALERT_KV.list();

  for (const key of list.keys) {
    const val = await env.ALERT_KV.get(key.name);
    if (!val) continue;

    const data = JSON.parse(val);

    if (data.incident_id === incidentId) {
      return data.task_id;
    }
  }

  return null;
}

// ========================
// DISCORD
// ========================
async function sendDiscordAlert(env, task) {
  const message = {
    content: `🚨 **Critical Incident**
${task.title}

${task.description}`
  };

  await fetch(env.DISCORD_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(message)
  });
}

// ========================
// DETECTION
// ========================
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
