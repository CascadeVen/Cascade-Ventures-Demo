// Vercel serverless function: receives form submissions and emails them via Resend.
// Required environment variables: RESEND_API_KEY, CONTACT_TO_EMAIL, CONTACT_FROM_EMAIL
const MAX_BYTES = 20000, MAX_FIELDS = 20, MAX_FIELD = 5000;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const KINDS = ["Quote request", "Free visibility audit"];
// Best-effort limiter: memory is per serverless instance, so it slows bursts but is not a hard guarantee.
// For strict limits, also add a rate-limit rule in the Vercel Firewall (see README).
const hits = new Map(), WINDOW = 15 * 60 * 1000, LIMIT = 5;
function limited(ip) {
  const now = Date.now(), a = (hits.get(ip) || []).filter((t) => now - t < WINDOW);
  if (a.length >= LIMIT) { hits.set(ip, a); return true; }
  a.push(now); hits.set(ip, a); if (hits.size > 5000) hits.clear();
  return false;
}
const fail = (res, code, error) => res.status(code).json({ ok: false, error });

export default async function handler(req, res) {
  if (req.method !== "POST") return fail(res, 405, "Method not allowed");
  const h = req.headers || {};
  try { if (!h.origin || new URL(h.origin).host !== h.host) return fail(res, 403, "Forbidden"); } catch { return fail(res, 403, "Forbidden"); }
  if (!String(h["content-type"] || "").includes("application/json")) return fail(res, 415, "Unsupported media type");
  if (Number(h["content-length"] || 0) > MAX_BYTES) return fail(res, 413, "Request too large");
  const ip = String(h["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  if (limited(ip)) return fail(res, 429, "Too many requests");
  const { RESEND_API_KEY, CONTACT_TO_EMAIL, CONTACT_FROM_EMAIL } = process.env;
  if (!RESEND_API_KEY || !CONTACT_TO_EMAIL || !CONTACT_FROM_EMAIL) return fail(res, 500, "Form is not configured");
  let body = req.body;
  if (typeof body === "string") { if (body.length > MAX_BYTES) return fail(res, 413, "Request too large"); try { body = JSON.parse(body); } catch { body = null; } }
  if (!body || typeof body.fields !== "object" || body.fields === null || Array.isArray(body.fields) || !KINDS.includes(body.form)) return fail(res, 400, "Invalid request");
  if (typeof body.elapsed === "number" && body.elapsed < 2500) return fail(res, 400, "Invalid request"); // too fast to be human
  const entries = Object.entries(body.fields);
  if (entries.length > MAX_FIELDS) return fail(res, 400, "Invalid request");
  const fields = {};
  for (const [k, v] of entries) {
    if (typeof v !== "string" || k.length > 60 || v.length > MAX_FIELD) return fail(res, 400, "Invalid field");
    fields[k.replace(/[\r\n]/g, " ")] = v;
  }
  if (!EMAIL_RE.test(fields.Email || "")) return fail(res, 400, "Invalid email");
  const text = Object.entries(fields).map(([k, v]) => `${k}: ${v}`).join("\n");
  const subject = `Cascade Ventures: ${body.form} from ${(fields.Business || "website").slice(0, 80).replace(/[\r\n]/g, " ")}`;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: CONTACT_FROM_EMAIL, to: [CONTACT_TO_EMAIL], reply_to: fields.Email, subject, text }),
    });
  if (!r.ok) {
  const details = await r.text();
  console.error("Resend error:", r.status, details);
  return fail(res, 502, "Email provider error");
}
