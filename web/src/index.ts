interface Env {
  STATS_KV: KVNamespace;
  GITHUB_REPO: string;
  DOCKER_REPO: string;
  PRIVATE_KEY?: string;
  WEB_ANALYTICS_TOKEN?: string;
  SEED_KEY?: string;
}

interface DockerHubRepo {
  pull_count: number;
  star_count: number;
  last_updated: string;
}

interface TelemetryDay {
  count: number;
  byBun: Record<string, number>;
  byNode: Record<string, number>;
  byArch: Record<string, number>;
}

const CACHE_TTL = 120;

const fmt = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

function cacheHeaders(): HeadersInit {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": `public, max-age=${CACHE_TTL}`,
    "Access-Control-Allow-Origin": "*",
  };
}

async function fetchWithRetry(url: string, attempts = 3): Promise<Response | null> {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "bun-node-stats-worker/1.0 (imbios/bun-node stats page)",
          Accept: "application/json",
        },
      });
      if (res.ok || ![429, 500, 502, 503].includes(res.status)) return res;
    } catch {
      // fall through to retry
    }
    await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, i)));
  }
  return null;
}

async function jsonOrNull<T>(url: string, attempts = 3): Promise<T | null> {
  const res = await fetchWithRetry(url, attempts);
  if (!res) return null;
  try {
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function withCache<T extends object>(env: Env, key: string, ttl: number, fn: () => Promise<T | null>): Promise<T | null> {
  const cached = await env.STATS_KV.get(key, "json").catch(() => null);
  if (cached && typeof cached === "object") return cached as T;
  const fresh = await fn();
  if (fresh) await env.STATS_KV.put(key, JSON.stringify(fresh), { expirationTtl: ttl }).catch(() => {});
  return fresh;
}

async function collectStats(env: Env) {
  const [hub, tags, gh] = await Promise.all([
    withCache<DockerHubRepo>(env, "cache:docker", 6 * 3600, () =>
      jsonOrNull<DockerHubRepo>(`https://hub.docker.com/v2/repositories/${env.DOCKER_REPO}/`)
    ),
    withCache<{ count: number }>(env, "cache:docker-tags", 6 * 3600, () =>
      jsonOrNull<{ count: number }>(`https://hub.docker.com/v2/repositories/${env.DOCKER_REPO}/tags/?page_size=1`)
    ),
    withCache<{ stargazers_count: number; forks_count: number; open_issues_count: number; pushed_at: string }>(
      env,
      "cache:github",
      3600,
      () => jsonOrNull<{ stargazers_count: number; forks_count: number; open_issues_count: number; pushed_at: string }>(`https://api.github.com/repos/${env.GITHUB_REPO}`)
    ),
  ]);

  return {
    docker: {
      pulls: hub?.pull_count ?? null,
      stars: hub?.star_count ?? null,
      tags: tags?.count ?? null,
      lastUpdated: hub?.last_updated ?? null,
    },
    github: {
      stars: gh?.stargazers_count ?? null,
      forks: gh?.forks_count ?? null,
      openIssues: gh?.open_issues_count ?? null,
      pushedAt: gh?.pushed_at ?? null,
    },
  };
}

async function seedStats(request: Request, env: Env): Promise<Response> {
  const auth = request.headers.get("Authorization") || "";
  if (!env.SEED_KEY || auth !== `Bearer ${env.SEED_KEY}`) {
    return new Response("forbidden", { status: 403, headers: { "Content-Type": "text/plain" } });
  }
  let body: { docker?: Partial<DockerHubRepo> & { count?: number }; github?: Partial<{ stargazers_count: number; forks_count: number; open_issues_count: number; pushed_at: string }> };
  try {
    body = await request.json();
  } catch {
    return new Response("invalid json", { status: 400, headers: { "Content-Type": "text/plain" } });
  }
  const writes: Array<Promise<void>> = [];

  if (body.docker && (body.docker.pull_count != null || body.docker.star_count != null || body.docker.last_updated != null)) {
    const existing = (await env.STATS_KV.get("cache:docker", "json").catch(() => null)) as Partial<DockerHubRepo> | null;
    const docker = {
      pull_count: body.docker.pull_count ?? existing?.pull_count ?? 0,
      star_count: body.docker.star_count ?? existing?.star_count ?? 0,
      last_updated: body.docker.last_updated ?? existing?.last_updated ?? "",
    };
    writes.push(env.STATS_KV.put("cache:docker", JSON.stringify(docker), { expirationTtl: 12 * 3600 }));
  }
  if (body.docker?.count != null) {
    writes.push(env.STATS_KV.put("cache:docker-tags", JSON.stringify({ count: body.docker.count }), { expirationTtl: 12 * 3600 }));
  }
  if (body.github && (body.github.stargazers_count != null || body.github.forks_count != null || body.github.open_issues_count != null || body.github.pushed_at != null)) {
    const existing = (await env.STATS_KV.get("cache:github", "json").catch(() => null)) as Partial<{ stargazers_count: number; forks_count: number; open_issues_count: number; pushed_at: string }> | null;
    const gh = {
      stargazers_count: body.github.stargazers_count ?? existing?.stargazers_count ?? 0,
      forks_count: body.github.forks_count ?? existing?.forks_count ?? 0,
      open_issues_count: body.github.open_issues_count ?? existing?.open_issues_count ?? 0,
      pushed_at: body.github.pushed_at ?? existing?.pushed_at ?? "",
    };
    writes.push(env.STATS_KV.put("cache:github", JSON.stringify(gh), { expirationTtl: 12 * 3600 }));
  }
  await Promise.all(writes);
  return new Response("ok", { status: 200, headers: { "Content-Type": "text/plain" } });
}

async function handleTelemetryPing(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("method not allowed", { status: 405, headers: { "Content-Type": "text/plain" } });
  }
  const body = await parseTelemetryBody(request);
  if (!body) {
    return new Response("bad request", { status: 400, headers: { "Content-Type": "text/plain" } });
  }
  if (!(await dedupeTelemetryId(env, body.id))) {
    return new Response("ok", { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  await aggregateTelemetryDay(env, body);
  return new Response("ok", { status: 200, headers: { "Content-Type": "text/plain" } });
}

interface TelemetryBody {
  id: string;
  bun: string;
  node: string;
  arch: string;
}

async function parseTelemetryBody(request: Request): Promise<TelemetryBody | null> {
  let raw: { id?: string; bun?: string; node?: string; arch?: string };
  try {
    raw = await request.json();
  } catch {
    return null;
  }
  return {
    id: typeof raw.id === "string" && raw.id.length > 0 && raw.id.length <= 64 ? raw.id : "",
    bun: typeof raw.bun === "string" ? raw.bun.slice(0, 40) : "",
    node: typeof raw.node === "string" ? raw.node.slice(0, 40) : "",
    arch: typeof raw.arch === "string" ? raw.arch.slice(0, 20) : "",
  };
}

async function dedupeTelemetryId(env: Env, id: string): Promise<boolean> {
  if (!id) return true;
  const seen = await env.STATS_KV.get(`telemetry:seen:${id}`).catch(() => null);
  if (seen) return false;
  await env.STATS_KV.put(`telemetry:seen:${id}`, "1", { expirationTtl: 3600 }).catch(() => {});
  return true;
}

async function aggregateTelemetryDay(env: Env, body: TelemetryBody): Promise<void> {
  const day = new Date().toISOString().slice(0, 10);
  const key = `telemetry:${day}`;
  const current = (await env.STATS_KV.get(key, "json").catch(() => null)) as TelemetryDay | null;
  if (current && current.count >= 200_000) return;
  const next: TelemetryDay = {
    count: (current?.count || 0) + 1,
    byBun: current?.byBun || {},
    byNode: current?.byNode || {},
    byArch: current?.byArch || {},
  };
  if (body.bun) next.byBun[body.bun] = (next.byBun[body.bun] || 0) + 1;
  if (body.node) next.byNode[body.node] = (next.byNode[body.node] || 0) + 1;
  if (body.arch) next.byArch[body.arch] = (next.byArch[body.arch] || 0) + 1;
  await env.STATS_KV.put(key, JSON.stringify(next)).catch(() => {});
}

async function telemetryTotals(env: Env, days: number): Promise<{ count: number; byNode: Record<string, number>; byBun: Record<string, number>; byArch: Record<string, number>; days: Array<{ date: string; count: number }> }> {
  const keys = await env.STATS_KV.list({ prefix: "telemetry:", limit: 1000 }).catch(() => null);
  if (!keys) {
    return { count: 0, byNode: {}, byBun: {}, byArch: {}, days: [] };
  }
  const cutoff = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
  const totals = { count: 0, byNode: {} as Record<string, number>, byBun: {} as Record<string, number>, byArch: {} as Record<string, number> };
  const perDay: Array<{ date: string; count: number }> = [];
  for (const key of keys.keys) {
    const date = key.name.replace("telemetry:", "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < cutoff) continue;
    const value = (await env.STATS_KV.get(key.name, "json").catch(() => null)) as TelemetryDay | null;
    if (!value) continue;
    totals.count += value.count;
    for (const [k, v] of Object.entries(value.byNode)) totals.byNode[k] = (totals.byNode[k] || 0) + v;
    for (const [k, v] of Object.entries(value.byBun)) totals.byBun[k] = (totals.byBun[k] || 0) + v;
    for (const [k, v] of Object.entries(value.byArch)) totals.byArch[k] = (totals.byArch[k] || 0) + v;
    perDay.push({ date, count: value.count });
  }
  perDay.sort((a, b) => a.date.localeCompare(b.date));
  return { ...totals, days: perDay };
}

function topEntries(record: Record<string, number>, limit = 6): Array<[string, number]> {
  return Object.entries(record)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}

async function pullHistory(env: Env): Promise<Array<{ date: string; pulls: number }>> {
  const keys = await env.STATS_KV.list({ prefix: "pulls:", limit: 400 });
  const out: Array<{ date: string; pulls: number }> = [];
  for (const key of keys.keys) {
    const value = await env.STATS_KV.get(key.name);
    const pulls = Number(value);
    if (Number.isFinite(pulls)) out.push({ date: key.name.replace("pulls:", ""), pulls });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

async function pageViews(env: Env): Promise<Record<string, number>> {
  const keys = await env.STATS_KV.list({ prefix: "views:", limit: 400 }).catch(() => null);
  if (!keys) return {};
  const out: Record<string, number> = {};
  for (const key of keys.keys) {
    const value = await env.STATS_KV.get(key.name).catch(() => null);
    out[key.name.replace("views:", "")] = Number(value) || 0;
  }
  return out;
}

function escapeHtml(input: string): string {
  return input.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function badge(label: string, value: string, color: string): string {
  const labelWidth = Math.max(70, Math.ceil(label.length * 6.4 + 14));
  const valueWidth = 110;
  const total = labelWidth + valueWidth;
  const labelCenter = labelWidth * 10 / 2;
  const valueCenter = (labelWidth + valueWidth / 2) * 10;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${total}" height="20" role="img" aria-label="${escapeHtml(label)}: ${escapeHtml(value)}">
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r"><rect width="${total}" height="20" rx="3" fill="#fff"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelWidth}" height="20" fill="#555"/>
    <rect x="${labelWidth}" width="${valueWidth}" height="20" fill="${color}"/>
    <rect width="${total}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="110">
    <text x="${labelCenter}" y="150" transform="scale(.1)" fill="#010101" fill-opacity=".3">${escapeHtml(label)}</text>
    <text x="${labelCenter}" y="140" transform="scale(.1)">${escapeHtml(label)}</text>
    <text x="${valueCenter}" y="150" transform="scale(.1)" fill="#010101" fill-opacity=".3">${escapeHtml(value)}</text>
    <text x="${valueCenter}" y="140" transform="scale(.1)">${escapeHtml(value)}</text>
  </g>
</svg>`;
}

function dashboard(
  stats: Awaited<ReturnType<typeof collectStats>>,
  views: Record<string, number>,
  telemetry: Awaited<ReturnType<typeof telemetryTotals>>,
  analyticsToken: string
): string {
  const pulls = stats.docker.pulls ?? 0;
  const today = new Date().toISOString().slice(0, 10);
  const viewsToday = views[today] || 0;
  const beacon = analyticsToken
    ? `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "${analyticsToken}"}'></script>`
    : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="description" content="Live public stats for the imbios/bun-node Docker images"/>
<title>bun-node stats</title>
${beacon}
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; margin: 0; }
  body { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; background: #0b0d10; color: #e6e9ef; padding: 48px 24px; display: flex; flex-direction: column; align-items: center; }
  main { width: 100%; max-width: 860px; }
  h1 { font-size: 22px; letter-spacing: -0.02em; }
  .sub { color: #8b93a3; font-size: 13px; margin-top: 8px; line-height: 1.6; }
  .sub a { color: #7aa2f7; text-decoration: none; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-top: 32px; }
  .card { background: #13161c; border: 1px solid #1f2530; border-radius: 10px; padding: 16px; }
  .card .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #8b93a3; }
  .card .value { font-size: 26px; font-weight: 700; margin-top: 6px; }
  .card .hint { font-size: 11px; color: #5f6673; margin-top: 6px; }
  .hl { color: #9ece6a; }
  .foot { margin-top: 40px; color: #5f6673; font-size: 11px; line-height: 1.8; }
</style>
</head>
<body>
<main>
  <h1>🐇 imbios/bun-node <span class="hl">live stats</span></h1>
  <p class="sub">Pre-configured Bun + Node.js Docker images — rebuilt daily. Source: <a href="https://github.com/ImBIOS/bun-node">github.com/ImBIOS/bun-node</a> · Registry: <a href="https://hub.docker.com/r/imbios/bun-node">hub.docker.com/r/imbios/bun-node</a></p>
  <div class="grid">
    <div class="card"><div class="label">Docker pulls</div><div class="value hl">${fmt.format(pulls)}</div><div class="hint">all-time, all tags</div></div>
    <div class="card"><div class="label">Container starts</div><div class="value">${fmt.format(telemetry.count)}</div><div class="hint">anonymous, last 30 days</div></div>
    <div class="card"><div class="label">Docker tags</div><div class="value">${fmt.format(stats.docker.tags ?? 0)}</div><div class="hint">published image tags</div></div>
    <div class="card"><div class="label">Docker stars</div><div class="value">${stats.docker.stars ?? 0}</div><div class="hint">on Docker Hub</div></div>
    <div class="card"><div class="label">GitHub stars</div><div class="value">${stats.github.stars ?? 0}</div><div class="hint">⭐ the repo on GitHub</div></div>
    <div class="card"><div class="label">GitHub forks</div><div class="value">${stats.github.forks ?? 0}</div><div class="hint">forks of the repo</div></div>
    <div class="card"><div class="label">Last build</div><div class="value" style="font-size:15px">${escapeHtml((stats.docker.lastUpdated ?? "unknown").slice(0, 10))}</div><div class="hint">newest tag pushed</div></div>
    <div class="card"><div class="label">Views today</div><div class="value">${viewsToday || "–"}</div><div class="hint">on this page</div></div>
  </div>
  <p class="sub" style="margin-top:24px">Embeddable badges:</p>
  <div style="margin-top:8px; display:flex; flex-wrap:wrap; gap:8px">
    <img src="/badge/pulls.svg" alt="docker pulls"/>
    <img src="/badge/tags.svg" alt="docker tags"/>
    <img src="/badge/stars.svg" alt="docker stars"/>
    <img src="/badge/starts.svg" alt="container starts"/>
    <img src="/badge/last-updated.svg" alt="last updated"/>
  </div>
  <h2 style="font-size:16px; margin-top:40px">API</h2>
  <p class="sub"><code>/api/stats</code> — JSON snapshot · <code>/badge/&lt;metric&gt;.svg</code> — badges (pulls, tags, stars, starts, last-updated)</p>
  <div class="foot">
    The image sends one anonymous ping per container start (bun/node versions, architecture, random id — no IPs or user data).
    Opt out by setting <code>BUN_NODE_TELEMETRY=0</code> or <code>DO_NOT_TRACK=1</code>. See the repo readme.
  </div>
</main>
</body>
</html>`;
}

function privatePage(
  stats: Awaited<ReturnType<typeof collectStats>>,
  history: Array<{ date: string; pulls: number }>,
  views: Record<string, number>,
  telemetry: Awaited<ReturnType<typeof telemetryTotals>>
): string {
  const points = history.map((h) => `${h.date}:${h.pulls}`).join("|");
  const viewPoints = Object.entries(views).sort(([a], [b]) => a.localeCompare(b)).map(([d, v]) => `${d}:${v}`).join("|");
  const telemetryPoints = telemetry.days.map((d) => `${d.date}:${d.count}`).join("|");
  const nodeRows = topEntries(telemetry.byNode).map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td>${fmt.format(v)}</td></tr>`).join("");
  const bunRows = topEntries(telemetry.byBun).map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td>${fmt.format(v)}</td></tr>`).join("");
  const archRows = topEntries(telemetry.byArch).map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td>${fmt.format(v)}</td></tr>`).join("");
  const today = new Date().toISOString().slice(0, 10);
  const startsToday = telemetry.days.filter((d) => d.date === today).reduce((a, d) => a + d.count, 0);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="robots" content="noindex"/>
<title>bun-node private stats</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; margin: 0; }
  body { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; background: #0b0d10; color: #e6e9ef; padding: 48px 24px; display: flex; flex-direction: column; align-items: center; }
  main { width: 100%; max-width: 860px; }
  h1 { font-size: 22px; }
  .tag { display: inline-block; background: #9ece6a20; color: #9ece6a; border: 1px solid #9ece6a55; font-size: 11px; padding: 2px 8px; border-radius: 99px; vertical-align: middle; }
  .sub { color: #8b93a3; font-size: 13px; margin-top: 8px; }
  svg { width: 100%; height: auto; margin-top: 20px; background: #13161c; border: 1px solid #1f2530; border-radius: 10px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-top: 24px; }
  .card { background: #13161c; border: 1px solid #1f2530; border-radius: 10px; padding: 16px; }
  .card .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #8b93a3; }
  .card .value { font-size: 24px; font-weight: 700; margin-top: 6px; }
  .table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 13px; }
  .table th, .table td { text-align: left; padding: 6px 10px; border-bottom: 1px solid #1f2530; }
  .table th { color: #8b93a3; font-weight: 500; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; }
  .cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 24px; }
  .foot { margin-top: 32px; color: #5f6673; font-size: 11px; line-height: 1.8; }
</style>
</head>
<body>
<main>
  <h1>🔒 bun-node private stats <span class="tag">owner only</span></h1>
  <p class="sub">Daily Docker Hub pull snapshots and anonymous container telemetry, stored in worker KV. Visible only with the private key.</p>
  <div class="grid">
    <div class="card"><div class="label">Pulls today</div><div class="value">${history.length ? fmt.format(history[history.length - 1]!.pulls) : "–"}</div></div>
    <div class="card"><div class="label">Pulls ~30d ago</div><div class="value">${history.length > 30 ? fmt.format(history[history.length - 31]!.pulls) : "–"}</div></div>
    <div class="card"><div class="label">30d delta</div><div class="value">${history.length > 30 ? "+" + fmt.format(history[history.length - 1]!.pulls - history[history.length - 31]!.pulls) : "–"}</div></div>
    <div class="card"><div class="label">GitHub stars today</div><div class="value">${stats.github.stars ?? "–"}</div></div>
    <div class="card"><div class="label">Container starts today</div><div class="value">${startsToday || "–"}</div></div>
    <div class="card"><div class="label">Container starts (30d)</div><div class="value">${fmt.format(telemetry.count)}</div></div>
  </div>
  <svg viewBox="0 0 800 200" xmlns="http://www.w3.org/2000/svg">
    <g data-chart="pulls" data-points="${escapeHtml(points)}" data-max-label="pulls" />
  </svg>
  <svg viewBox="0 0 800 120" xmlns="http://www.w3.org/2000/svg">
    <g data-chart="views" data-points="${escapeHtml(viewPoints)}" data-max-label="views" />
  </svg>
  <svg viewBox="0 0 800 120" xmlns="http://www.w3.org/2000/svg">
    <g data-chart="starts" data-points="${escapeHtml(telemetryPoints)}" data-max-label="starts" />
  </svg>
  <p class="sub">Charts: total pulls per day · page views per day · container starts per day.</p>
  <div class="cols" style="margin-top:24px">
    <div><h2 style="font-size:14px">Node versions (30d)</h2><table class="table"><tr><th>version</th><th>starts</th></tr>${nodeRows || "<tr><td colspan='2'>no data yet</td></tr>"}</table></div>
    <div><h2 style="font-size:14px">Bun versions (30d)</h2><table class="table"><tr><th>version</th><th>starts</th></tr>${bunRows || "<tr><td colspan='2'>no data yet</td></tr>"}</table></div>
    <div><h2 style="font-size:14px">Architecture (30d)</h2><table class="table"><tr><th>arch</th><th>starts</th></tr>${archRows || "<tr><td colspan='2'>no data yet</td></tr>"}</table></div>
  </div>
  <div class="foot">If Cloudflare Web Analytics is enabled, visit the dashboard in the Cloudflare account for full traffic telemetry.</div>
</main>
<script>
const draw = (el) => {
  const data = el.dataset.points.split("|").filter(Boolean).map(p => { const [d, v] = p.split(":"); return [d, Number(v)]; });
  if (data.length === 0) return;
  const svg = el.parentElement;
  const w = 800, h = Number(svg.getAttribute("viewBox").split(" ")[3]);
  const pad = 10;
  const ns = "http://www.w3.org/2000/svg";
  const g = document.createElementNS(ns, "g");
  if (data.length === 1) {
    const cx = pad + (w - 2 * pad) / 2;
    const cy = h / 2;
    g.innerHTML = \`<circle cx="\${cx}" cy="\${cy}" r="4" fill="#9ece6a"/><text x="\${cx}" y="\${cy - 10}" fill="#8b93a3" font-size="11" text-anchor="middle">\${Intl.NumberFormat("en", {notation:"compact"}).format(data[0][1])}</text>\`;
    svg.appendChild(g);
    return;
  }
  const vals = data.map(([, v]) => v);
  const min = Math.min(...vals), max = Math.max(...vals);
  const x = i => pad + (i / (data.length - 1)) * (w - 2 * pad);
  const y = v => h - pad - ((v - min) / (max - min || 1)) * (h - 2 * pad);
  const path = data.map(([, v], i) => \`\${i ? "L" : "M"}\${x(i).toFixed(1)},\${y(v).toFixed(1)}\`).join(" ");
  const area = \`\${path} L\${x(data.length - 1).toFixed(1)},\${h - pad} L\${x(0).toFixed(1)},\${h - pad} Z\`;
  g.innerHTML = \`<path d="\${area}" fill="#9ece6a22" stroke="none"/><path d="\${path}" fill="none" stroke="#9ece6a" stroke-width="2"/>\
<text x="\${w - pad}" y="\${pad + 10}" fill="#8b93a3" font-size="11" text-anchor="end">\${Intl.NumberFormat("en", {notation:"compact"}).format(max)}</text>\`;
  svg.appendChild(g);
};
document.querySelectorAll("[data-chart]").forEach(draw);
</script>
</body>
</html>`;
}

function htmlResponse(body: string): Response {
  return new Response(body, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

async function handleStats(env: Env): Promise<Response> {
  const stats = await collectStats(env);
  return new Response(JSON.stringify(stats, null, 2), {
    headers: cacheHeaders(),
  });
}

async function handleBadge(metric: string, env: Env): Promise<Response> {
  const [stats, telemetry] = await Promise.all([collectStats(env), telemetryTotals(env, 30)]);
  const map: Record<string, [string, string, string]> = {
    pulls: ["docker pulls", fmt.format(stats.docker.pulls ?? 0), "#1f6feb"],
    tags: ["docker tags", fmt.format(stats.docker.tags ?? 0), "#8957e5"],
    stars: ["docker stars", fmt.format(stats.docker.stars ?? 0), "#e3b341"],
    starts: ["container starts", `${fmt.format(telemetry.count)} / 30d`, "#9ece6a"],
    "last-updated": ["last updated", (stats.docker.lastUpdated ?? "unknown").slice(0, 10), "#3fb950"],
  };
  const entry = map[metric] || map["pulls"]!;
  return new Response(badge(entry[0], entry[1], entry[2]), {
    headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": `public, max-age=${CACHE_TTL}` },
  });
}

async function handlePrivate(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const headerKey = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const key = headerKey || url.searchParams.get("key") || "";
  if (!env.PRIVATE_KEY || key !== env.PRIVATE_KEY) {
    return new Response("forbidden", { status: 403, headers: { "Content-Type": "text/plain" } });
  }
  const [stats, history, views, telemetry] = await Promise.all([collectStats(env), pullHistory(env), pageViews(env), telemetryTotals(env, 30)]);
  return htmlResponse(privatePage(stats, history, views, telemetry));
}

async function countView(env: Env): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const key = `views:${today}`;
  const current = Number(await env.STATS_KV.get(key).catch(() => null)) || 0;
  await env.STATS_KV.put(key, String(current + 1), { expirationTtl: 60 * 60 * 24 * 400 }).catch(() => {});
}

export default {
  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);
    const stats = await collectStats(env);
    if (stats.docker.pulls != null) await env.STATS_KV.put(`pulls:${today}`, String(stats.docker.pulls));
    if (stats.github.stars != null) await env.STATS_KV.put(`stars:${today}`, String(stats.github.stars));
    const keys = await env.STATS_KV.list({ prefix: "pulls:", limit: 1000 });
    const sorted = keys.keys.map((k) => k.name).sort();
    const cutoff = sorted.slice(0, Math.max(0, sorted.length - 180));
    for (const name of cutoff) await env.STATS_KV.delete(name);
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === "GET" && path === "/") {
      await countView(env);
      const [stats, views, telemetry] = await Promise.all([collectStats(env), pageViews(env), telemetryTotals(env, 30)]);
      return htmlResponse(dashboard(stats, views, telemetry, env.WEB_ANALYTICS_TOKEN || ""));
    }

    if (request.method === "GET" && path === "/api/stats") {
      return handleStats(env);
    }

    if (request.method === "GET" && path.startsWith("/badge/") && path.endsWith(".svg")) {
      return handleBadge(path.slice("/badge/".length, -4), env);
    }

    if (request.method === "POST" && path === "/internal/seed") {
      return seedStats(request, env);
    }

    if (request.method === "POST" && path === "/telemetry/ping") {
      return handleTelemetryPing(request, env);
    }

    if (request.method === "GET" && path === "/private") {
      return handlePrivate(request, env);
    }

    return new Response("not found", { status: 404 });
  },
};
