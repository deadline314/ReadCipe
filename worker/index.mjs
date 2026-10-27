// ReadCipe Worker: serves the static site (dist/site) and the Read & Check API.
// Static files never reach this code (wrangler.jsonc run_worker_first: /api/* only).

// Keep in sync with CARD_IDS in src/read-core.js.
export const CARD_IDS = ['1', '2', '3', '4-1', '4-2', '5', '6'];

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

/** Calendar day in Taipei (UTC+8, no DST), used to group a lesson's scores. */
export function taipeiDay(now = Date.now()) {
  return new Date(now + 8 * 3600e3).toISOString().slice(0, 10);
}

const int = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? Math.round(v) : undefined);

/** Validate a score upload from the student page. Returns { value } or { error: fieldName }. */
export function parseScore(b) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return { error: 'body' };
  const v = {
    grp: int(b.grp, 1, 6), seat: int(b.seat, 1, 40), card: CARD_IDS.includes(b.card) ? b.card : undefined,
    stars: int(b.stars, 0, 3), overall: int(b.overall, 0, 100), attempts: int(b.attempts, 1, 3),
  };
  for (const k of Object.keys(v)) if (v[k] === undefined) return { error: k };
  for (const k of ['accuracy', 'fluency', 'completeness', 'prosody']) {
    if (b[k] == null) { v[k] = null; continue; }
    v[k] = int(b[k], 0, 100);
    if (v[k] === undefined) return { error: k };
  }
  const weak = b.weak == null ? [] : b.weak;
  if (!Array.isArray(weak) || weak.length > 10 || weak.some(w => typeof w !== 'string' || !w || w.length > 30)) return { error: 'weak' };
  v.weak = weak;
  return { value: v };
}

// One row per day + seat + card. Score columns are replaced only by a better overall score;
// attempts always add up; grp follows the latest upload.
const UPSERT = `
INSERT INTO scores (day, seat, card, grp, stars, overall, accuracy, fluency, completeness, prosody, weak, attempts, updated_at)
VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
ON CONFLICT (day, seat, card) DO UPDATE SET
  grp          = excluded.grp,
  stars        = CASE WHEN excluded.overall > scores.overall THEN excluded.stars        ELSE scores.stars        END,
  accuracy     = CASE WHEN excluded.overall > scores.overall THEN excluded.accuracy     ELSE scores.accuracy     END,
  fluency      = CASE WHEN excluded.overall > scores.overall THEN excluded.fluency      ELSE scores.fluency      END,
  completeness = CASE WHEN excluded.overall > scores.overall THEN excluded.completeness ELSE scores.completeness END,
  prosody      = CASE WHEN excluded.overall > scores.overall THEN excluded.prosody      ELSE scores.prosody      END,
  weak         = CASE WHEN excluded.overall > scores.overall THEN excluded.weak         ELSE scores.weak         END,
  overall      = MAX(excluded.overall, scores.overall),
  attempts     = scores.attempts + excluded.attempts,
  updated_at   = excluded.updated_at`;

const SELECT = `SELECT seat, card, grp, stars, overall, accuracy, fluency, completeness, prosody, weak, attempts, updated_at
FROM scores WHERE day = ?1 ORDER BY grp, seat`;

/** true when this key is over its limit. A missing or failing limiter never blocks a class. */
async function limited(limiter, key) {
  if (!limiter) return false;
  try { return !(await limiter.limit({ key })).success; } catch (e) { console.error('ratelimit', e); return false; }
}

function parseJson(text, fallback) {
  try { return JSON.parse(text); } catch { return fallback; }
}

async function api(request, env, url) {
  const origin = request.headers.get('Origin');
  if (origin) {
    let same = false;
    try { same = new URL(origin).host === url.host; } catch { /* malformed Origin */ }
    if (!same) return json({ error: 'origin' }, 403);
  }
  // A whole school may share one IP; limits are sized for that (6 iPads + teacher).
  const ip = request.headers.get('CF-Connecting-IP') || 'local';

  if (url.pathname === '/api/token' && request.method === 'GET') {
    if (await limited(env.TOKEN_LIMIT, ip)) return json({ error: 'rate' }, 429);
    if (!env.AZURE_SPEECH_KEY || !env.AZURE_SPEECH_REGION) { console.error('Azure secrets are not set'); return json({ error: 'config' }, 500); }
    const r = await fetch(`https://${env.AZURE_SPEECH_REGION}.api.cognitive.microsoft.com/sts/v1.0/issueToken`, {
      method: 'POST',
      headers: { 'Ocp-Apim-Subscription-Key': env.AZURE_SPEECH_KEY, 'Content-Length': '0' },
    });
    if (!r.ok) { console.error('issueToken failed', r.status, await r.text().catch(() => '')); return json({ error: 'token' }, 502); }
    return json({ token: await r.text(), region: env.AZURE_SPEECH_REGION });
  }

  if (url.pathname === '/api/score' && request.method === 'POST') {
    if (await limited(env.SCORE_LIMIT, ip)) return json({ error: 'rate' }, 429);
    if (Number(request.headers.get('Content-Length') || 0) > 4096) return json({ error: 'size' }, 413);
    const text = await request.text();
    if (text.length > 4096) return json({ error: 'size' }, 413);
    const { value: v, error } = parseScore(parseJson(text, null));
    if (error) return json({ error }, 400);
    await env.DB.prepare(UPSERT).bind(
      taipeiDay(), v.seat, v.card, v.grp, v.stars, v.overall,
      v.accuracy, v.fluency, v.completeness, v.prosody, JSON.stringify(v.weak), v.attempts, Date.now(),
    ).run();
    return json({ ok: true });
  }

  if (url.pathname === '/api/scores' && request.method === 'GET') {
    const day = url.searchParams.get('day') || taipeiDay();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return json({ error: 'day' }, 400);
    const { results } = await env.DB.prepare(SELECT).bind(day).all();
    return json({ day, rows: results.map(r => ({ ...r, weak: parseJson(r.weak, []) })) });
  }

  return json({ error: 'not_found' }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      return await api(request, env, url);
    } catch (e) {
      console.error('api error', url.pathname, e);
      return json({ error: 'server' }, 500);
    }
  },
};
