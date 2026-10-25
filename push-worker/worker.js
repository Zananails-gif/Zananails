// Nail booking app — push notification sender (Cloudflare Worker, free plan).
// Stores which phones want notifications (KV "PUSH"), checks every event against the real booking
// in Firestore before sending, and sends standard Web Push (works on Android Chrome and iPhone home-screen apps).
//
// Secrets / settings (Cloudflare): VAPID_JWK (private key, secret), VAPID_PUBLIC, SUPPORT_EMAIL (secret, optional).

const PROJECT = "zananails-ecac6", DBID = "default";
const OWNER_UID = "q1zJeejwznf4FkUuVuOFxK0CUU23";
const ORIGINS = ["https://zananails-gif.github.io"];
const APP_URL = "https://zananails-gif.github.io/Zananails/";
const TZ_HOURS = 2;                 // salon time (Kaliningrad, UTC+2, no summer time)
const FS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/${DBID}/documents/`;
const MON = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
const WD = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

/* ---------------- small helpers ---------------- */
const te = new TextEncoder();
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = s => { s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; return Uint8Array.from(atob(s), c => c.charCodeAt(0)); };
const concat = (...a) => { const n = a.reduce((x, y) => x + y.length, 0), o = new Uint8Array(n); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };
const cleanSalon = s => { s = String(s || "main").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 40); return s || "main"; };
const pfx = salon => salon === "main" ? "" : `salons/${salon}/`;
const hm = m => String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
const localNow = () => new Date(Date.now() + TZ_HOURS * 3600e3);
const dayKey = d => d.toISOString().slice(0, 10);
const niceDate = k => { const d = new Date(k + "T12:00:00Z"); return WD[d.getUTCDay()] + ", " + d.getUTCDate() + " " + MON[d.getUTCMonth()]; };
async function sha(s) { return b64u(await crypto.subtle.digest("SHA-256", te.encode(s))).slice(0, 32); }
const salonLink = (salon, owner) => APP_URL + "?s=" + salon + (owner ? "#owner" : "");

/* ---------------- Firestore (REST) ---------------- */
function val(v) {
  if (!v) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("nullValue" in v) return null;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(val);
  if ("mapValue" in v) return obj(v.mapValue.fields || {});
  return null;
}
const obj = f => { const o = {}; for (const k in f) o[k] = val(f[k]); return o; };
async function fsGet(path, token) {
  const r = await fetch(FS + path, token ? { headers: { Authorization: "Bearer " + token } } : {});
  if (r.status === 404) return { status: 404, data: null };
  if (!r.ok) return { status: r.status, data: null };
  const j = await r.json(); return { status: 200, data: obj(j.fields || {}) };
}
async function busyOn(salon, date) {
  const parent = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/${DBID}/documents` + (salon === "main" ? "" : `/salons/${salon}`);
  const r = await fetch(parent + ":runQuery", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: "busy" }], where: { fieldFilter: { field: { fieldPath: "date" }, op: "EQUAL", value: { stringValue: date } } } } }) });
  if (!r.ok) return [];
  return (await r.json()).filter(x => x.document).map(x => obj(x.document.fields || {}));
}
async function artistName(salon, id) {
  const s = await fsGet(pfx(salon) + "settings/salon");
  const a = s.data && (s.data.artists || []).find(x => x.id === id);
  return { artist: a ? a.name : "", salonName: (s.data && s.data.name) || "Салон" };
}

/* ---------------- who is this staff member? ---------------- */
// The Firebase sign-in token is checked by Firestore itself: reading the salon's staff list only works
// for the real owner or a real master of that salon.
async function staffRole(salon, token, env) {
  if (!token) return null;
  let claims; try { claims = JSON.parse(new TextDecoder().decode(unb64u(token.split(".")[1]))); } catch (e) { return null; }
  const email = String(claims.email || "").toLowerCase(), verified = claims.email_verified === true, uid = claims.user_id || claims.sub;
  const staff = await fsGet(pfx(salon) + "private/staff", token);
  if (staff.status !== 200 && staff.status !== 404) return null;      // token invalid or not staff of this salon
  if (uid === OWNER_UID || (verified && env.SUPPORT_EMAIL && email === String(env.SUPPORT_EMAIL).toLowerCase())) return { role: "owner", uid };
  if (verified) {   // administrators added by the owner
    for (const id of [email + "|*", email + "|" + salon]) { const a = await fsGet("admins/" + encodeURIComponent(id), token); if (a.status === 200) return { role: "owner", uid }; }
  }
  if (salon !== "main" && verified) {
    const p = await fsGet("salonsPrivate/" + salon, token);
    if (p.status === 200 && String(p.data.ownerEmail || "").toLowerCase() === email) return { role: "owner", uid };
  }
  const artist = verified && staff.data && (staff.data.map || {})[email];
  return artist ? { role: "master", artist, uid } : null;
}

/* ---------------- Web Push (RFC 8291 + VAPID RFC 8292) ---------------- */
async function hkdf(salt, ikm, info, len) {
  const k = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, k, len * 8));
}
export async function encryptPayload(sub, text) {
  const uaPub = unb64u(sub.keys.p256dh), auth = unb64u(sub.keys.auth);
  const as = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPub = new Uint8Array(await crypto.subtle.exportKey("raw", as.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPub, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const secret = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, as.privateKey, 256));
  const ikm = await hkdf(auth, secret, concat(te.encode("WebPush: info\0"), uaPub, asPub), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, te.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, te.encode("Content-Encoding: nonce\0"), 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, concat(te.encode(text), new Uint8Array([2]))));
  const head = new Uint8Array(21); head.set(salt, 0); new DataView(head.buffer).setUint32(16, 4096); head[20] = 65;
  return concat(head, asPub, ct);
}
export async function vapidAuth(endpoint, env) {
  const jwk = JSON.parse(env.VAPID_JWK);
  const key = await crypto.subtle.importKey("jwk", { kty: "EC", crv: "P-256", d: jwk.d, x: jwk.x, y: jwk.y }, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const head = b64u(te.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const body = b64u(te.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: "mailto:viptechviptech@gmail.com" })));
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, te.encode(head + "." + body));
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${env.VAPID_PUBLIC}`;
}
async function push(sub, msg, env) {
  try {
    const body = await encryptPayload(sub, JSON.stringify(msg));
    const r = await fetch(sub.endpoint, { method: "POST", body, headers: {
      Authorization: await vapidAuth(sub.endpoint, env), "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", TTL: "86400", Urgency: "high" } });
    return r.status;
  } catch (e) { return 0; }
}
// send to many; forget phones whose subscription has expired
async function sendAll(list, msg, env) {
  let sent = 0;
  for (const it of list) {
    const st = await push(it.sub, msg, env);
    if (st >= 200 && st < 300) sent++;
    else if ((st === 404 || st === 410) && it.key) await env.PUSH.delete(it.key);
  }
  return sent;
}
async function staffSubs(salon, env) {
  const out = []; let cursor;
  do { const l = await env.PUSH.list({ prefix: `st:${salon}:`, cursor }); cursor = l.list_complete ? null : l.cursor;
    for (const k of l.keys) { const v = await env.PUSH.get(k.name, "json"); if (v) out.push(Object.assign({ key: k.name }, v)); } } while (cursor);
  return out;
}

/* ---------------- HTTP API ---------------- */
const okSub = s => s && typeof s.endpoint === "string" && /^https:\/\//.test(s.endpoint) && s.keys && s.keys.p256dh && s.keys.auth;
function cors(req) {
  const o = req.headers.get("Origin") || "";
  return { "Access-Control-Allow-Origin": ORIGINS.includes(o) ? o : ORIGINS[0], "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Vary": "Origin" };
}
const json = (req, data, status = 200) => new Response(JSON.stringify(data), { status, headers: Object.assign({ "Content-Type": "application/json" }, cors(req)) });

async function handle(req, env) {
  const url = new URL(req.url);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });
  if (req.method !== "POST") return new Response("ok");
  let b; try { b = await req.json(); } catch (e) { return json(req, { error: "bad json" }, 400); }
  const salon = cleanSalon(b.salon);

  // staff: turn on / update preferences
  if (url.pathname === "/sub/staff") {
    if (!okSub(b.sub)) return json(req, { error: "bad subscription" }, 400);
    const who = await staffRole(salon, b.token, env);
    if (!who) return json(req, { error: "not staff" }, 403);
    const prefs = Object.assign({ nb: true, cn: true, am: true }, b.prefs || {});
    await env.PUSH.put(`st:${salon}:${await sha(b.sub.endpoint)}`, JSON.stringify({ sub: b.sub, role: who.role, artist: who.artist || "", uid: who.uid, prefs: { nb: !!prefs.nb, cn: !!prefs.cn, am: !!prefs.am } }));
    return json(req, { ok: true, role: who.role });
  }
  if (url.pathname === "/sub/staff/off") {
    if (!b.endpoint) return json(req, { error: "bad" }, 400);
    await env.PUSH.delete(`st:${salon}:${await sha(b.endpoint)}`); return json(req, { ok: true });
  }
  if (url.pathname === "/test") {
    if (!b.endpoint) return json(req, { error: "bad" }, 400);
    const key = `st:${salon}:${await sha(b.endpoint)}`, v = await env.PUSH.get(key, "json");
    if (!v) return json(req, { error: "not subscribed" }, 404);
    const n = await sendAll([Object.assign({ key }, v)], { title: "Проверка уведомлений", body: "Всё работает — новые записи придут сюда со звуком.", url: salonLink(salon, true), tag: "test" }, env);
    return json(req, { ok: n > 0 });
  }
  // client: remind me about this booking
  if (url.pathname === "/sub/client") {
    if (!okSub(b.sub) || !/^[A-Za-z0-9]{10,40}$/.test(b.id || "")) return json(req, { error: "bad" }, 400);
    const bk = await fsGet(pfx(salon) + "bookings/" + b.id);
    if (!bk.data || bk.data.status === "cancelled") return json(req, { error: "no booking" }, 404);
    const key = `cl:${salon}:${b.id}`, list = (await env.PUSH.get(key, "json")) || [];
    if (!list.some(x => x.endpoint === b.sub.endpoint)) list.push(b.sub);
    const until = Math.floor(new Date(bk.data.date + "T23:59:59Z").getTime() / 1000) + 2 * 86400;
    await env.PUSH.put(key, JSON.stringify(list.slice(-5)), { expiration: until });
    await env.PUSH.put(`rm:${bk.data.date}:${salon}:${b.id}`, "1", { expiration: until });
    return json(req, { ok: true, remind: bk.data.date });
  }
  // something happened to a booking: check it for real, then notify
  if (url.pathname === "/event") {
    if (!/^[A-Za-z0-9]{10,40}$/.test(b.id || "")) return json(req, { error: "bad" }, 400);
    const type = String(b.type || ""), by = b.by === "staff" ? "staff" : "client";
    const bk = (await fsGet(pfx(salon) + "bookings/" + b.id)).data;
    if (!bk) return json(req, { error: "no booking" }, 404);
    const dk = `ev:${salon}:${b.id}:${type}:${bk.status}:${bk.artist}`;
    if (await env.PUSH.get(dk)) return json(req, { ok: true, dup: true });
    await env.PUSH.put(dk, "1", { expirationTtl: 3 * 86400 });
    const { artist, salonName } = await artistName(salon, bk.artist);
    const when = niceDate(bk.date) + " в " + hm(bk.start), svc = (bk.serviceNames || []).join(", ");
    const toStaff = async (pref, msg) => sendAll((await staffSubs(salon, env)).filter(s => s.prefs[pref] && (s.role === "owner" || s.artist === bk.artist)), msg, env);
    const toClient = async msg => { const list = (await env.PUSH.get(`cl:${salon}:${b.id}`, "json")) || []; return sendAll(list.map(sub => ({ sub })), msg, env); };
    let sent = 0;
    if (type === "new" && bk.status !== "cancelled" && Date.now() - (bk.created || 0) < 15 * 60e3 && by === "client")
      sent = await toStaff("nb", { title: "Новая запись: " + bk.name, body: when + " · " + svc + (artist ? " · мастер " + artist : ""), url: salonLink(salon, true), tag: "b-" + b.id });
    else if (type === "cancel" && bk.status === "cancelled") {
      if (by === "client") sent = await toStaff("cn", { title: "Отмена записи: " + bk.name, body: when + " · " + svc + (artist ? " · мастер " + artist : ""), url: salonLink(salon, true), tag: "b-" + b.id });
      else sent = await toClient({ title: "Запись отменена", body: salonName + ": " + when + " отменена. Выберите другое время в приложении.", url: salonLink(salon), tag: "b-" + b.id });
    } else if (type === "confirm" && bk.status === "confirmed")
      sent = await toClient({ title: "Запись подтверждена", body: salonName + ": " + when + (artist ? ", мастер " + artist : "") + ". Ждём вас!", url: salonLink(salon), tag: "b-" + b.id });
    else if (type === "move" && bk.status !== "cancelled")
      sent = await toClient({ title: "Изменение в записи", body: salonName + ": " + when + ", теперь мастер " + (artist || "салона") + ".", url: salonLink(salon), tag: "b-" + b.id });
    return json(req, { ok: true, sent });
  }
  return json(req, { error: "unknown" }, 404);
}

/* ---------------- daily: evening reminders (18:00) and morning summary (8:00) ---------------- */
async function evening(env) {
  const tomorrow = dayKey(new Date(localNow().getTime() + 86400e3));
  let cursor;
  do {
    const l = await env.PUSH.list({ prefix: `rm:${tomorrow}:`, cursor }); cursor = l.list_complete ? null : l.cursor;
    for (const k of l.keys) {
      const [, , salon, id] = k.name.split(":");
      const bk = (await fsGet(pfx(salon) + "bookings/" + id)).data;
      if (bk && bk.status !== "cancelled" && bk.date === tomorrow) {
        const { artist, salonName } = await artistName(salon, bk.artist);
        const list = (await env.PUSH.get(`cl:${salon}:${id}`, "json")) || [];
        await sendAll(list.map(sub => ({ sub })), { title: "Напоминание о записи", body: "Завтра в " + hm(bk.start) + " — " + (bk.serviceNames || []).join(", ") + (artist ? ", мастер " + artist : "") + ". " + salonName + ".", url: salonLink(salon), tag: "r-" + id }, env);
      }
      await env.PUSH.delete(k.name);
    }
  } while (cursor);
}
async function morning(env) {
  const today = dayKey(localNow()), bySalon = {};
  let cursor;
  do { const l = await env.PUSH.list({ prefix: "st:", cursor }); cursor = l.list_complete ? null : l.cursor;
    for (const k of l.keys) { const salon = k.name.split(":")[1]; (bySalon[salon] = bySalon[salon] || []).push(k.name); } } while (cursor);
  for (const salon in bySalon) {
    const busy = await busyOn(salon, today);
    for (const key of bySalon[salon]) {
      const s = await env.PUSH.get(key, "json"); if (!s || !s.prefs.am) continue;
      const mine = s.role === "owner" ? busy : busy.filter(x => x.artist === s.artist);
      if (!mine.length) continue;
      const first = Math.min(...mine.map(x => x.start));
      const n = mine.length, w = n % 10 === 1 && n % 100 !== 11 ? "запись" : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? "записи" : "записей";
      await sendAll([Object.assign({ key }, s)], { title: "Сегодня " + n + " " + w, body: "Первая в " + hm(first) + ". Хорошего дня!", url: salonLink(salon, true), tag: "am-" + today }, env);
    }
  }
}

export default {
  async fetch(req, env) { try { return await handle(req, env); } catch (e) { return json(req, { error: "server" }, 500); } },
  async scheduled(ev, env, ctx) { ctx.waitUntil(ev.cron === "0 16 * * *" ? evening(env) : morning(env)); }
};
