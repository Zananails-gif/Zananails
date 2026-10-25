import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, doc, collection, onSnapshot, setDoc, updateDoc, deleteDoc, getDocFromServer,
  writeBatch, query, where, orderBy, limit, getDocs, getDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, sendPasswordResetEmail,
  createUserWithEmailAndPassword, sendEmailVerification, reload
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { firebaseConfig } from "./config.js";

/* ================= constants & helpers ================= */
const STEP = 30;
const DAYS_AHEAD = 21;
const DOW = ["Вс","Пн","Вт","Ср","Чт","Пт","Сб"];
const DOWL = ["Воскресенье","Понедельник","Вторник","Среда","Четверг","Пятница","Суббота"];
const MONG = ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];
const MONS = ["янв","фев","мар","апр","мая","июн","июл","авг","сен","окт","ноя","дек"];
const MONN = ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];
const CATS = [
  { id: "Маникюр", sub: "Классический, гель-лак, укрепление" },
  { id: "Педикюр", sub: "SPA, гель-лак" },
  { id: "Наращивание", sub: "Акрил, гель, коррекция" },
  { id: "Дизайн", sub: "Рисунки, втирка" }
];

const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad = n => String(n).padStart(2, "0");
const keyOf = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const dateOf = k => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (k, n) => { const d = dateOf(k); d.setDate(d.getDate() + n); return keyOf(d); };
const todayKey = () => keyOf(new Date());
const hm = m => pad(Math.floor(m / 60)) + ":" + pad(m % 60);
const parseHM = s => { const m = /^(\d{1,2}):(\d{2})/.exec(s || ""); return m ? (+m[1]) * 60 + (+m[2]) : null; };
const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
const longDate = k => { const d = dateOf(k); return DOWL[d.getDay()] + ", " + d.getDate() + " " + MONG[d.getMonth()]; };
const shortDate = k => { const d = dateOf(k); return DOW[d.getDay()] + ", " + d.getDate() + " " + MONS[d.getMonth()]; };
const rub = n => (n == null || n === "") ? "— ₽" : Math.round(Number(n)).toLocaleString("ru-RU") + " ₽";
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const durTxt = m => m >= 60 ? (Math.floor(m / 60) + " ч" + (m % 60 ? " " + (m % 60) + " мин" : "")) : m + " мин";
const plural = (n, f) => { const a = Math.abs(n) % 100, b = a % 10; return a > 10 && a < 20 ? f[2] : b > 1 && b < 5 ? f[1] : b === 1 ? f[0] : f[2]; };
const clone = o => JSON.parse(JSON.stringify(o));
// first name + optional surname, stored together as the client's name
const fullName = (n, sn) => (String(n || "").trim() + " " + String(sn || "").trim()).trim().replace(/\s+/g, " ").slice(0, 60);
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

/* ================= which salon is open ================= */
// The main salon («Архитектура ногтей») lives at the top of the database; every other salon lives under salons/<id>.
// A link like  ?s=lana  opens that salon. The installed phone app remembers the last salon it was opened for.
const SID = (() => {
  const q = new URLSearchParams(location.search).get("s");
  const clean = v => String(v || "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 40);
  if (q !== null) { const v = q === "main" ? "" : clean(q); lsSet("nb-salon", v); return v || null; }
  let standalone = false; try { standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true; } catch (e) {}
  return standalone ? (clean(lsGet("nb-salon", "")) || null) : null;
})();
const lsk = k => SID ? k + "@" + SID : k;   // per-salon phone storage (my bookings, seen alerts)
const salonUrl = (sid, owner) => location.origin + location.pathname + "?s=" + (sid || "main") + (owner ? "#owner" : "");

const ICON = {
  users: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.5"/><path d="M3 20c.8-3.5 3.2-5.5 6-5.5s5.2 2 6 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M21 20c-.5-2.6-1.9-4.4-3.8-5.1"/></svg>',
  sms: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z"/><path d="M8 10h8M8 13h5"/></svg>',
  back: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>',
  next: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
  check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>',
  clock: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  pin: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>',
  phone: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/></svg>',
  home: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/></svg>',
  cal: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  bell: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10 21a2 2 0 0 0 4 0"/></svg>',
  gear: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></svg>',
  plus: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  trash: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
  polish: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="7" y="11" width="10" height="10" rx="2"/><path d="M9 11V8h6v3M10.5 8V3h3v5"/></svg>',
  eye: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  eyeOff: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.8 10.8 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.2M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7c1.9 0 3.5-.6 4.9-1.4"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>',
  wa: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 20.5l1.3-4A8.5 8.5 0 1 1 8 19.3z"/><path d="M9 8.5c0 3.5 2.5 6.5 6.5 6.5l1-1.5-2-1-1 1c-1.2-.4-2.6-1.8-3-3l1-1-1-2z"/></svg>',
  tg: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 4L3 11l6 2 2 6 3-4 5 4z"/><path d="M9 13l9-7"/></svg>',
  grid: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
  chart: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  camera: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  info: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true" style="flex-shrink:0;margin-top:1px"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>'
};

/* ================= default salon settings ================= */
function defaultSettings() {
  return {
    name: "Название салона", area: "Город, адрес", phone: "", telegram: "", logo: "",
    open: 9 * 60, close: 19 * 60, closedDays: [0], pediChairs: 1, autoConfirm: true, leadMin: 120,
    artists: [{ id: "a1", name: "Мастер 1" }, { id: "a2", name: "Мастер 2" }],
    services: [
      { id: "s1", cat: "Маникюр", name: "Классический маникюр", dur: 45, price: 1500 },
      { id: "s2", cat: "Маникюр", name: "Маникюр с покрытием гель-лак", dur: 60, price: 2200 },
      { id: "s3", cat: "Маникюр", name: "Укрепление BIAB", dur: 75, price: 2800 },
      { id: "s4", cat: "Маникюр", name: "Снятие гель-лака", dur: 15, price: 500 },
      { id: "s5", cat: "Педикюр", name: "SPA-педикюр", dur: 60, price: 2500 },
      { id: "s6", cat: "Педикюр", name: "Педикюр с покрытием гель-лак", dur: 60, price: 2700 },
      { id: "s7", cat: "Наращивание", name: "Наращивание акрилом", dur: 120, price: 3500 },
      { id: "s8", cat: "Наращивание", name: "Наращивание гелем", dur: 105, price: 3500 },
      { id: "s9", cat: "Наращивание", name: "Коррекция", dur: 75, price: 2500 },
      { id: "s10", cat: "Дизайн", name: "Дизайн (2 ногтя)", dur: 15, price: 300 },
      { id: "s11", cat: "Дизайн", name: "Втирка / «кошачий глаз»", dur: 15, price: 400 }
    ]
  };
}
function normalize(d) {
  const def = defaultSettings();
  const out = Object.assign({}, def, d || {});
  if (!Array.isArray(out.artists) || !out.artists.length) out.artists = def.artists;
  if (!Array.isArray(out.services)) out.services = def.services;
  if (!Array.isArray(out.closedDays)) out.closedDays = def.closedDays;
  if (typeof out.open !== "number") out.open = def.open;
  if (typeof out.close !== "number") out.close = def.close;
  if (!(out.pediChairs >= 1)) out.pediChairs = 1;
  if (!(out.leadMin >= 0)) out.leadMin = 120;
  if (out.autoConfirm !== false) out.autoConfirm = true;
  return out;
}

/* ================= app state ================= */
let SET = null, setLoaded = false, setError = false;
let BUSY = [];
let USER = null, authReady = false, ownerDenied = false;
// salons & subscription
let META = null, metaLoaded = !SID, BILL = null, SALONS = [], OWNERS = {}, MAIN_NAME = "Мой салон";
let hiddenAdmin = false;   // support admin, recognised by a fingerprint of the email (the address itself is not in the app)
const HIDDEN_ADMINS = ["b7cd0ed6a431535d7e906777f074c3d786b6abe337ea3d00cab03bcd89636576"];
async function emailPrint(email) {
  const bytes = new TextEncoder().encode(String(email || "").trim().toLowerCase());
  try { if (crypto && crypto.subtle) { const h = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, "0")).join(""); } } catch (e) {}
  return sha256(bytes);
}
// plain SHA-256 for browsers without crypto.subtle
function sha256(m) {
  const K = [], H = [1779033703, -1150833019, 1013904242, -1521486534, 1359893119, -1694144372, 528734635, 1541459225];
  let n = 2; for (let c = 0; c < 64; n++) { let p = true; for (let d = 2; d * d <= n; d++) if (n % d === 0) { p = false; break; } if (p) K[c++] = (Math.pow(n, 1 / 3) % 1) * 4294967296 | 0; }
  const l = m.length, w = new Uint8Array(((l + 9 + 63) >> 6) << 6); w.set(m); w[l] = 128;
  const dv = new DataView(w.buffer); dv.setUint32(w.length - 4, l * 8);
  const W = new Int32Array(64), r = (x, y) => (x >>> y) | (x << (32 - y));
  for (let i = 0; i < w.length; i += 64) {
    for (let t = 0; t < 16; t++) W[t] = dv.getInt32(i + t * 4);
    for (let t = 16; t < 64; t++) { const a = W[t - 15], b = W[t - 2];
      W[t] = (W[t - 16] + (r(a, 7) ^ r(a, 18) ^ (a >>> 3)) + W[t - 7] + (r(b, 17) ^ r(b, 19) ^ (b >>> 10))) | 0; }
    let [a, b, c, d, e, f, g, h] = H;
    for (let t = 0; t < 64; t++) {
      const t1 = (h + (r(e, 6) ^ r(e, 11) ^ r(e, 25)) + ((e & f) ^ (~e & g)) + K[t] + W[t]) | 0;
      const t2 = ((r(a, 2) ^ r(a, 13) ^ r(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0; H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
  }
  return H.map(x => (x >>> 0).toString(16).padStart(8, "0")).join("");
}
// owner's switches: masters see every master's bookings / may change them
const shareView = () => !!(SET && SET.shareView);
const shareEdit = () => !!(SET && SET.shareView && SET.shareEdit);
const canEditBooking = b => ROLE === "owner" || (ROLE === "master" && !!b && (b.artist === MY_ARTIST || shareEdit()));
// realOwner: the main owner (by UID) or support; adminAll: administrators she gave «все салоны и оплаты»
let adminAllFlag = false, ADMINS = [];
const isRealOwner = () => !!USER && ((!!OWNER_UID && USER.uid === OWNER_UID) || hiddenAdmin);
const isAdmin = () => isRealOwner() || (!!USER && adminAllFlag);
let JDAY = [], PENDING = [], RECENT = [];
let ROLE = null, MY_ARTIST = null, needVerify = false, noStaff = false, roleChecking = false;
let STAFF = {}, MASTER_ALL = [];
let PUB_WORKS = [], ALL_WORKS = [], FULL = {}, REPORT = null, NEWB = [], AVATARS = {}, REVIEWS = [];
const NEW_WINDOW = 2 * 24 * 3600 * 1000;
let inboxSeen = lsGet(lsk("nb-inbox-seen"), 0);
const OWNER_UID = firebaseConfig.ownerUid || "";
let pendingLoaded = false;
const MY = {};
const unsubMy = {};
let unsubOwner = [], unsubJday = null, creatingDefaults = false;

const S = {
  mode: location.hash === "#owner" ? "owner" : "client",
  view: location.hash === "#owner" ? "journal" : "home",
  cat: "Маникюр", sel: [], artist: "any", date: null, time: null,
  gMaster: "all", gCat: "all", photo: null, workDraft: null, wBusy: false, repPeriod: "week", repMaster: null,
  form: lsGet("nb-form", { name: "", phone: "", note: "" }), tried: false, saving: false,
  bookTab: "upcoming", jDate: todayKey(), sheet: null, armed: null, lastBooked: false,
  draft: null, dirty: false, draftErr: "",
  login: { email: "", pw: "", err: "", busy: false, info: "", mode: "login" }, pwShow: {},
  installEvt: null, hideInstall: lsGet("nb-install-hide", false)
};

const svcById = id => (SET ? SET.services.find(s => s.id === id) : null);
// master's name without a leading «Мастер» (names like «Мастер Алена»), so texts never say «мастер Мастер Алена»
const bareName = n => String(n || "").replace(/^\s*мастер\s+/i, "").trim();
const artistName = id => bareName((SET && SET.artists.find(a => a.id === id) || {}).name) || "Мастер";
// master's round photo, or the first letter of the name when there is no photo yet
const avatar = (id, name, px) => { const st = px ? `width:${px}px;height:${px}px;font-size:${Math.round(px * 0.41)}px` : "";
  return AVATARS[id] ? `<div class="thumb avatar av-img" style="${st}"><img src="${esc(AVATARS[id])}" alt=""></div>` : `<div class="thumb avatar" style="${st}">${esc((name || "?").charAt(0))}</div>`; };
const isClosed = k => !SET || SET.closedDays.includes(dateOf(k).getDay());

function artistFree(aid, date, start, dur, ignoreId) {
  return !BUSY.some(b => b.id !== ignoreId && b.artist === aid && b.date === date && start < b.start + b.dur && b.start < start + dur);
}
function freeArtists(date, start, dur) {
  return SET.artists.filter(a => artistFree(a.id, date, start, dur)).map(a => a.id);
}
// Pedicure uses the salon's shared pedicure chair(s): it is free only if fewer
// pedicure bookings overlap that time than there are chairs, whichever master does them.
const PEDI_CAT = "Педикюр";
const selNeedsChair = () => S.sel.some(id => (svcById(id) || {}).cat === PEDI_CAT);
function chairFree(date, start, dur, ignoreId) {
  const n = BUSY.filter(b => b.chair && b.id !== ignoreId && b.date === date && start < b.start + b.dur && b.start < start + dur).length;
  return n < ((SET && SET.pediChairs) || 1);
}
function slotsFor(date, artist, dur, needChair = selNeedsChair(), staff = false, ignoreId) {
  if (!SET || isClosed(date) || !dur) return [];
  const out = [];
  // clients can book from 30 min ahead; staff can also add a client who is already in the chair today
  // clients: no later than SET.leadMin before the visit (owner setting, default 2 hours); staff can add any time today
  let minStart;
  if (staff) minStart = date < todayKey() ? 1e9 : 0;
  else { const e = new Date(Date.now() + ((SET && SET.leadMin) ?? 120) * 60e3), ek = keyOf(e);
    minStart = date < ek ? 1e9 : date === ek ? e.getHours() * 60 + e.getMinutes() : 0; }
  for (let t = SET.open; t + dur <= SET.close; t += STEP) {
    if (t < minStart) continue;
    if (needChair && !chairFree(date, t, dur, ignoreId)) continue;
    const ok = artist === "any" ? freeArtists(date, t, dur).length > 0 : artistFree(artist, date, t, dur, ignoreId);
    if (ok) out.push(t);
  }
  return out;
}
const selDur = () => S.sel.reduce((n, id) => n + (svcById(id)?.dur || 0), 0);
// a service's price for a master: her own price if the owner set one, else the usual price
function priceFor(svc, aid) {
  if (!svc) return 0;
  const mp = svc.mp || {}, v = aid && aid !== "any" ? Number(mp[aid]) : 0;
  return v > 0 ? v : Number(svc.price || 0);
}
// lowest price among masters (for «от …»)
const minPrice = svc => Math.min(Number(svc.price || 0), ...Object.values(svc.mp || {}).map(Number).filter(x => x > 0));
const hasMasterPrices = svc => Object.values(svc.mp || {}).some(x => Number(x) > 0 && Number(x) !== Number(svc.price));
const sumFor = (ids, aid) => ids.reduce((n, id) => n + priceFor(svcById(id), aid), 0);
const selTotal = (aid = S.artist) => aid && aid !== "any" ? sumFor(S.sel, aid) : S.sel.reduce((n, id) => n + (svcById(id) ? minPrice(svcById(id)) : 0), 0);
const selFrom = () => (!S.artist || S.artist === "any") && S.sel.some(id => hasMasterPrices(svcById(id) || {}));
function firstOpenDay() {
  let k = todayKey();
  for (let i = 0; i < DAYS_AHEAD; i++) { if (slotsFor(k, S.artist, selDur() || 15).length) return k; k = addDays(k, 1); }
  return todayKey();
}
function hoursText() {
  if (!SET) return "";
  const order = [1, 2, 3, 4, 5, 6, 0];
  const open = order.filter(d => !SET.closedDays.includes(d));
  if (!open.length) return "Временно закрыто";
  const runs = []; let run = [open[0]];
  for (let i = 1; i < open.length; i++) {
    if (order.indexOf(open[i]) === order.indexOf(run[run.length - 1]) + 1) run.push(open[i]);
    else { runs.push(run); run = [open[i]]; }
  }
  runs.push(run);
  const days = runs.map(r => r.length > 2 ? DOW[r[0]] + "–" + DOW[r[r.length - 1]] : r.map(d => DOW[d]).join(", ")).join(", ");
  return days + ", " + hm(SET.open) + "–" + hm(SET.close);
}

/* ================= WhatsApp / Telegram messages ================= */
// Phone number for wa.me: digits only, with country code (Russian 8XXXXXXXXXX → 7XXXXXXXXXX).
function waNumber(phone) {
  let d = String(phone || "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("8")) d = "7" + d.slice(1);
  return d.length >= 8 ? d : "";
}
const tgUser = t => String(t || "").trim().replace(/^https?:\/\/t\.me\//i, "").replace(/^@/, "").replace(/[^A-Za-z0-9_]/g, "");
const appLink = () => SID ? salonUrl(SID) : location.origin + location.pathname;
function waLink(phone, text) { const n = waNumber(phone); return n ? "https://wa.me/" + n + "?text=" + encodeURIComponent(text) : ""; }
// SMS: opens the phone's own Messages app with the text filled in (free; sent from the phone's normal SIM)
function smsLink(phone, text) { const n = waNumber(phone); return n ? "sms:+" + n + "?&body=" + encodeURIComponent(text) : ""; }
function tgLink(user, text) {
  const u = tgUser(user);
  return u ? "https://t.me/" + u + "?text=" + encodeURIComponent(text)
    : "https://t.me/share/url?url=" + encodeURIComponent(appLink()) + "&text=" + encodeURIComponent(text);
}
function bookingLine(b) {
  return longDate(b.date).toLowerCase() + " в " + hm(b.start) + ", " + ((b.serviceNames || []).join(", ") || "услуга") + ", мастер " + artistName(b.artist);
}
// Message texts the owner can edit (Настройки → «Тексты сообщений»); {words} are filled in for each booking.
const TPL_DEFAULT = {
  ok: "Здравствуйте, {имя}! Ваша запись в «{салон}» подтверждена: {дата} в {время}, {услуги}, мастер {мастер}. Адрес: {адрес}. Ждём вас!",
  cancel: "Здравствуйте, {имя}! К сожалению, ваша запись в «{салон}» на {дата} в {время} отменена. Выберите другое время: {ссылка}",
  salon: "Здравствуйте! Я записался(-ась) онлайн: {дата} в {время}, {услуги}, мастер {мастер}. Имя: {имя}, телефон: {телефон}."
};
const TPL_KEYS = ["{имя}", "{дата}", "{время}", "{услуги}", "{мастер}", "{салон}", "{адрес}", "{ссылка}", "{телефон}"];
const tplText = k => { const t = SET && SET.msgTpl && SET.msgTpl[k]; return t && t.trim() ? t : TPL_DEFAULT[k]; };
function fillTpl(t, b) {
  const v = { "{имя}": String(b.name || "").trim().split(/\s+/)[0] || "", "{дата}": longDate(b.date).toLowerCase(), "{время}": hm(b.start), "{услуги}": (b.serviceNames || []).join(", ") || "услуга",
    "{мастер}": artistName(b.artist), "{салон}": (SET && SET.name) || "салон", "{адрес}": (SET && SET.area) || "", "{ссылка}": appLink(), "{телефон}": b.phone || "" };
  return TPL_KEYS.reduce((x, k) => x.split(k).join(v[k]), t).replace(/ Адрес: \.| Адрес: (?=\s|$)/g, "");
}
const msgToSalon = b => fillTpl(tplText("salon"), b);
const msgToClient = b => fillTpl(tplText(b.status === "cancelled" ? "cancel" : "ok"), b);
function vTpl() {
  const k = S.tplTab || "ok", d = S.tplDraft || (S.tplDraft = { ok: tplText("ok"), cancel: tplText("cancel"), salon: tplText("salon") });
  const tabs = [["ok", "Подтверждение"], ["cancel", "Отмена"], ["salon", "Клиент → салон"]].map(([id, l]) => `<button data-act="tpl-tab" data-v="${id}" aria-pressed="${k === id}">${l}</button>`).join("");
  const sample = { name: "Мария", date: addDays(todayKey(), 2), start: 780, serviceNames: [(SET.services[0] || {}).name || "Маникюр"], artist: (SET.artists[0] || {}).id, phone: "+7 900 555-66-77", status: k === "cancel" ? "cancelled" : "confirmed" };
  const title = { ok: "Запись подтверждена", cancel: "Запись отменена", salon: "Клиент пишет салону" }[k];
  return `${header("", "Тексты сообщений", "settings")}
  <p class="small muted" style="margin-top:-8px">Эти тексты открываются в WhatsApp, Telegram или SMS по кнопкам «Сообщить клиенту». Перед отправкой текст можно поправить.</p>
  <div class="seg" role="group" aria-label="Какое сообщение">${tabs}</div>
  <div class="card stack"><b>${title}</b>
    <textarea id="tplText" rows="6" maxlength="600" aria-label="Текст сообщения">${esc(d[k])}</textarea>
    <span class="tiny muted" style="font-weight:600">Нажмите, чтобы вставить:</span>
    <div class="chips chips-wrap">${TPL_KEYS.filter(x => k === "salon" || x !== "{телефон}").map(x => `<button class="chip" data-act="tpl-ins" data-v="${esc(x)}">${esc(x)}</button>`).join("")}</div>
    <button class="linkbtn" style="align-self:flex-start;padding-left:0" data-act="tpl-reset">Вернуть текст по умолчанию</button></div>
  <div class="stack" style="gap:6px"><span class="tiny muted" style="font-weight:700">КАК УВИДИТ ${k === "salon" ? "САЛОН" : "КЛИЕНТ"}</span>
    <div class="bubble" id="tplPreview">${esc(fillTpl(d[k], sample))}</div></div>
  <button class="btn" data-act="tpl-save" ${S.saving ? "disabled" : ""}>Сохранить</button>`;
}
async function saveTpl() {
  const d = S.tplDraft; if (!d) return;
  const out = {}; ["ok", "cancel", "salon"].forEach(k => { out[k] = (d[k] || "").trim() === TPL_DEFAULT[k] ? "" : (d[k] || "").trim().slice(0, 600); });
  S.saving = true; render(true);
  try { await updateDoc(settingsRef, { msgTpl: out }); S.draft = null; S.dirty = false; toast("Тексты сохранены"); S.tplDraft = null; S.saving = false; go("settings"); return; }
  catch (err) { toast(errText(err)); }
  S.saving = false; render(true);
}
function msgButtons(label, wa, tg, sms) {
  if (!wa && !tg && !sms) return "";
  return `<div class="stack" style="gap:6px"><span class="tiny muted" style="font-weight:600">${label}</span><div class="msgbtns">
    ${wa ? `<a class="btn sm ghost msg-wa" href="${esc(wa)}" target="_blank" rel="noopener">${ICON.wa}WhatsApp</a>` : ""}
    ${tg ? `<a class="btn sm ghost msg-tg" href="${esc(tg)}" target="_blank" rel="noopener">${ICON.tg}Telegram</a>` : ""}
    ${sms ? `<a class="btn sm ghost msg-sms" href="${esc(sms)}">${ICON.sms}SMS</a>` : ""}</div></div>`;
}
const salonMsgButtons = b => msgButtons("Написать салону", waLink(SET.phone, msgToSalon(b)), tgLink(SET.telegram, msgToSalon(b)), smsLink(SET.phone, msgToSalon(b)));
const clientMsgButtons = b => b.phone ? msgButtons(b.status === "cancelled" ? "Сообщить клиенту об отмене" : "Сообщить клиенту о записи", waLink(b.phone, msgToClient(b)), tgLink("", msgToClient(b)), smsLink(b.phone, msgToClient(b))) : "";

/* ================= toast ================= */
let toastTimer;
function toast(msg) {
  clearTimeout(toastTimer);
  let t = document.getElementById("toast");
  if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
  t.textContent = msg; t.hidden = false;
  toastTimer = setTimeout(() => { t.hidden = true; }, 2800);
}

/* ================= setup check ================= */
const main = document.getElementById("main"), bar = document.getElementById("bar"),
  overlay = document.getElementById("overlay"), top = document.getElementById("top");

if (!firebaseConfig.apiKey || firebaseConfig.apiKey.startsWith("PASTE")) {
  top.innerHTML = `<div class="logo">!</div><div class="name"><b>Нужна настройка</b><span>Firebase ещё не подключён</span></div>`;
  main.innerHTML = `<div class="note">${ICON.info}<span>Откройте файл <b>config.js</b> и вставьте настройки вашего проекта Firebase. Подробные шаги — в файле <b>SETUP-GUIDE.md</b>.</span></div>`;
  throw new Error("Firebase config missing");
}

const fbApp = initializeApp(firebaseConfig);
const db = getFirestore(fbApp, firebaseConfig.databaseId || "(default)");
const auth = getAuth(fbApp);
const PFX = SID ? ["salons", SID] : [];
const SD = (...segs) => doc(db, ...PFX, ...segs);         // a document of the open salon
const SC = name => collection(db, ...PFX, name);          // a collection of the open salon
const settingsRef = SD("settings", "salon");
const staffRef = SD("private", "staff");   // master emails → master id (owner + masters only)

/* ================= realtime data ================= */
if (SID) onSnapshot(doc(db, "salons", SID), snap => { META = snap.exists() ? snap.data() : null; metaLoaded = true; renderSoon(true); },
  () => { metaLoaded = true; renderSoon(true); });
onSnapshot(doc(db, "billing", "config"), snap => { BILL = snap.exists() ? snap.data() : null; renderSoon(true); }, () => {});
onSnapshot(settingsRef, { includeMetadataChanges: true }, snap => {
  // A "not found" answer from the offline cache (weak connection) is not trusted:
  // keep what we have and wait for the server.
  if (!snap.exists() && snap.metadata.fromCache) return;
  const wasShared = shareView();
  SET = snap.exists() ? normalize(snap.data()) : null;
  if (ROLE === "master" && wasShared !== shareView()) watchJday();
  setLoaded = true; setError = false;
  maybeCreateDefaults();
  renderSoon(true);
}, () => { setLoaded = true; setError = true; renderSoon(true); });

onSnapshot(query(SC("busy"), where("date", ">=", addDays(todayKey(), -1))), snap => {
  BUSY = snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
  renderSoon(true);
}, () => {});

// Photo gallery: customers only get photos that are not hidden.
onSnapshot(SC("reviews"), snap => {
  REVIEWS = snap.docs.map(d => Object.assign({ id: d.id }, d.data())).sort((a, b) => (b.created || 0) - (a.created || 0)); render(true);
}, () => { REVIEWS = []; });
onSnapshot(SC("avatars"), snap => {
  const m = {}; snap.docs.forEach(d => { const x = d.data(); if (x && x.img) m[d.id] = x.img; }); AVATARS = m; render(true);
}, () => {});
onSnapshot(query(SC("works"), where("hidden", "==", false)), snap => {
  PUB_WORKS = snap.docs.map(d => Object.assign({ id: d.id }, d.data())).sort((a, b) => (b.created || 0) - (a.created || 0));
  renderSoon(true);
}, () => { PUB_WORKS = []; });
function watchAllWorks() {
  unsubOwner.push(onSnapshot(SC("works"), snap => {
    ALL_WORKS = snap.docs.map(d => Object.assign({ id: d.id }, d.data())).sort((a, b) => (b.created || 0) - (a.created || 0));
    renderSoon(true);
  }, () => { ALL_WORKS = []; }));
}

function watchMine() {
  const ids = lsGet(lsk("nb-my"), []);
  ids.forEach(id => {
    if (unsubMy[id]) return;
    unsubMy[id] = onSnapshot(SD("bookings", id), snap => {
      const before = MY[id];
      MY[id] = snap.exists() ? Object.assign({ id }, snap.data()) : null;
      if (before && MY[id] && (before.status !== MY[id].status || before.artist !== MY[id].artist) && S.mode !== "owner") chime();
      renderSoon(true);
    }, () => { MY[id] = null; });
  });
}
watchMine();

onAuthStateChanged(auth, user => {
  USER = user; authReady = true;
  resolveRole(user);
});

function stopWatches() {
  unsubOwner.forEach(u => u()); unsubOwner = [];
  if (unsubJday) { unsubJday(); unsubJday = null; }
  PENDING = []; RECENT = []; JDAY = []; MASTER_ALL = []; STAFF = {}; ALL_WORKS = []; REPORT = null; NEWB = []; pendingLoaded = false;
}
function notifyNew(before) {
  if (pendingLoaded) {
    const fresh = NEWB.filter(b => !before.has(b.id) && b.status !== "cancelled");
    if (fresh.length) { toast("Новая запись: " + fresh[0].name); chime(); }
  }
  pendingLoaded = true;
}
// Who is logged in: the owner (by UID), a master (email added by the owner), or nobody allowed.
async function resolveRole(user) {
  stopWatches();
  ROLE = null; MY_ARTIST = null; needVerify = false; noStaff = false; ownerDenied = false; roleChecking = false; hiddenAdmin = false; adminAllFlag = false;
  if (!user) { renderSoon(true); return; }
  if (!OWNER_UID || user.uid === OWNER_UID) {
    ROLE = "owner"; startOwnerWatch(); maybeCreateDefaults(); renderSoon(true); return;
  }
  if (!user.emailVerified) { needVerify = true; renderSoon(true); return; }
  roleChecking = true; renderSoon(true);
  hiddenAdmin = HIDDEN_ADMINS.includes(await emailPrint(user.email));
  if (hiddenAdmin) { ROLE = "owner"; roleChecking = false; startOwnerWatch(); maybeCreateDefaults(); renderSoon(true); return; }
  // administrators added by the owner
  const em = (user.email || "").toLowerCase();
  for (const [id, all] of [[em + "|*", true], [em + "|" + SALON_KEY, false]]) {
    try { const a = await getDocFromServer(doc(db, "admins", id));
      if (a.exists()) { adminAllFlag = all; ROLE = "owner"; roleChecking = false; startOwnerWatch(); maybeCreateDefaults(); renderSoon(true); return; } } catch (e) {}
  }
  if (SID) {
    try {
      const ps = await getDocFromServer(doc(db, "salonsPrivate", SID));
      if (ps.exists() && String(ps.data().ownerEmail || "").toLowerCase() === (user.email || "").toLowerCase()) {
        ROLE = "owner"; roleChecking = false; startOwnerWatch(); maybeCreateDefaults(); renderSoon(true); return;
      }
    } catch (e) { /* not this salon's owner */ }
  }
  try {
    const snap = await getDocFromServer(staffRef);
    const map = snap.exists() ? (snap.data().map || {}) : {};
    const id = map[(user.email || "").toLowerCase()];
    if (id) { ROLE = "master"; MY_ARTIST = id; startMasterWatch(); } else noStaff = true;
  } catch (e) { noStaff = true; }
  roleChecking = false;
  renderSoon(true);
}
function watchClientDocs() {
  CL_BOOK = null;
  unsubOwner.push(onSnapshot(SC("clients"), snap => { const m = {}; snap.docs.forEach(d => { m[d.id] = d.data(); }); CLIENT_DOCS = m; renderSoon(true); }, () => {}));
}
function startOwnerWatch() {
  const denied = () => { ownerDenied = true; renderSoon(true); };
  watchClientDocs();
  staffPushRefresh();
  if (isRealOwner()) unsubOwner.push(onSnapshot(collection(db, "admins"), snap => { ADMINS = snap.docs.map(d => Object.assign({ id: d.id }, d.data())).sort((a, b) => (a.added || 0) - (b.added || 0)); renderSoon(true); }, () => {}));
  if (isAdmin()) {
    unsubOwner.push(onSnapshot(collection(db, "salons"), snap => { SALONS = snap.docs.map(d => Object.assign({ id: d.id }, d.data())).sort((a, b) => (a.created || 0) - (b.created || 0)); renderSoon(true); }, () => {}));
    unsubOwner.push(onSnapshot(collection(db, "salonsPrivate"), snap => { const m = {}; snap.docs.forEach(d => { m[d.id] = d.data().ownerEmail || ""; }); OWNERS = m; renderSoon(true); }, () => {}));
    getDoc(doc(db, "settings", "salon")).then(x => { if (x.exists() && x.data().name) { MAIN_NAME = x.data().name; renderSoon(true); } }).catch(() => {});
  }
  unsubOwner.push(onSnapshot(query(SC("bookings"), where("status", "==", "pending")), snap => {
    PENDING = snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
    renderSoon(true);
  }, denied));
  // every booking made in the last 2 days (also the automatically confirmed ones)
  unsubOwner.push(onSnapshot(query(SC("bookings"), where("created", ">=", Date.now() - NEW_WINDOW)), snap => {
    const before = new Set(NEWB.map(b => b.id));
    NEWB = snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
    notifyNew(before);
    renderSoon(true);
  }, denied));
  unsubOwner.push(onSnapshot(query(SC("bookings"), orderBy("updated", "desc"), limit(15)), snap => {
    RECENT = snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
    renderSoon(true);
  }, denied));
  unsubOwner.push(onSnapshot(staffRef, snap => {
    STAFF = snap.exists() ? (snap.data().map || {}) : {};
    renderSoon(true);
  }, () => {}));
  watchAllWorks();
  watchJday();
}
// A master only ever loads their own bookings.
function startMasterWatch() {
  staffPushRefresh();
  watchClientDocs();
  unsubOwner.push(onSnapshot(query(SC("bookings"), where("artist", "==", MY_ARTIST)), snap => {
    const before = new Set(NEWB.map(b => b.id));
    MASTER_ALL = snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
    deriveMaster();
    if (S.view === "report") loadReport();
    if (shareView() && !unsubJday) watchJday();
    notifyNew(before);
    renderSoon(true);
  }, () => { noStaff = true; ROLE = null; renderSoon(true); }));
  watchAllWorks();
}
function deriveMaster() {
  const yday = addDays(todayKey(), -1);
  PENDING = MASTER_ALL.filter(b => b.status === "pending" && b.date >= yday);
  NEWB = MASTER_ALL.filter(b => (b.created || 0) >= Date.now() - NEW_WINDOW);
  RECENT = MASTER_ALL.filter(b => b.status !== "pending").sort((a, b) => (b.updated || 0) - (a.updated || 0)).slice(0, 15);
  if (!shareView()) JDAY = MASTER_ALL.filter(b => b.date === S.jDate);
}
let jdayShared = false;
function watchJday() {
  if (ROLE === "master" && !shareView()) { if (unsubJday) { unsubJday(); unsubJday = null; } jdayShared = false; deriveMaster(); return; }
  if (unsubJday) { unsubJday(); unsubJday = null; }
  if (ROLE !== "owner" && ROLE !== "master") return;
  jdayShared = ROLE === "master";
  JDAY = [];
  unsubJday = onSnapshot(query(SC("bookings"), where("date", "==", S.jDate)), snap => {
    JDAY = snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
    renderSoon(true);
  }, () => { if (ROLE === "master") { JDAY = MASTER_ALL.filter(b => b.date === S.jDate); renderSoon(true); return; } ownerDenied = true; renderSoon(true); });
}

async function maybeCreateDefaults() {
  if (ROLE !== "owner" || !setLoaded || SET || setError || creatingDefaults || ownerDenied) return;
  creatingDefaults = true;
  try {
    // Only create the salon if the server confirms it really doesn't exist yet,
    // so saved settings (name, logo, prices) are never overwritten.
    const check = await getDocFromServer(settingsRef);
    if (check.exists()) { SET = normalize(check.data()); creatingDefaults = false; renderSoon(true); return; }
    await setDoc(settingsRef, defaultSettings()); toast("Салон создан. Заполните настройки."); S.view = "settings"; S.draft = null; }
  catch (e) { if (e && e.code === "permission-denied") ownerDenied = true; }
  creatingDefaults = false;
  renderSoon(true);
}

/* ================= client base (staff) ================= */
// Built from the salon's bookings (visits, money, last visit) plus saved client cards (notes, clients added by hand).
let CLIENT_DOCS = {}, CL_BOOK = null, clLoading = false;
const phoneKey = p => { const d = String(p || "").replace(/\D/g, ""); return d.length >= 10 ? d.slice(-10) : d; };
const clientKey = (name, phone) => phoneKey(phone) ? "p" + phoneKey(phone) : "n" + String(name || "").trim().toLowerCase().replace(/[^a-zа-яё0-9]+/g, "-").slice(0, 40);
async function loadClientBookings(force) {
  if (clLoading || (CL_BOOK && !force)) return;
  clLoading = true;
  try {
    if (ROLE === "master" && !shareView()) CL_BOOK = MASTER_ALL.slice();
    else { const q = await getDocs(SC("bookings")); CL_BOOK = q.docs.map(d => Object.assign({ id: d.id }, d.data())); }
  } catch (e) { CL_BOOK = ROLE === "master" ? MASTER_ALL.slice() : []; }
  clLoading = false; renderSoon(true);
}
function clientList() {
  const m = {}, now = todayKey();
  const add = (key, name, phone) => (m[key] = m[key] || { key, name: name || "Клиент", phone: phone || "", note: "", visits: 0, spent: 0, cancels: 0, last: "", next: "", artists: {}, list: [] });
  (CL_BOOK || []).forEach(b => {
    const c = add(clientKey(b.name, b.phone), b.name, b.phone);
    if ((b.created || 0) >= (c._t || 0)) { c.name = b.name || c.name; if (b.phone) c.phone = b.phone; c._t = b.created || 0; }
    c.list.push(b);
    if (b.status === "cancelled") c.cancels++;
    else if (b.date < now || (b.date === now && b.start + b.dur <= nowMin())) { c.visits++; c.spent += Number(b.total || 0);
      if (b.date > c.last) { c.last = b.date; c.lastSvc = (b.serviceNames || []).join(", "); c.lastArtist = b.artist; } c.artists[b.artist] = (c.artists[b.artist] || 0) + 1; }
    else if (!c.next || b.date < c.next) c.next = b.date;
  });
  Object.keys(CLIENT_DOCS).forEach(k => { const d = CLIENT_DOCS[k], c = add(k, d.name, d.phone); if (d.name) c.name = d.name; if (d.phone) c.phone = d.phone; c.note = d.note || ""; c.saved = true; if (d.dk) c.dk = d.dk; });
  return Object.values(m).sort((a, b) => ((b.next || b.last) || "").localeCompare((a.next || a.last) || "") || a.name.localeCompare(b.name));
}
function matchClients(q, limit) {
  q = String(q || "").trim().toLowerCase(); const d = q.replace(/\D/g, "");
  if (q.length < 2) return [];
  return clientList().filter(c => c.name.toLowerCase().includes(q) || (d.length >= 3 && phoneKey(c.phone).includes(d))).slice(0, limit || 50);
}
const visitsTxt = n => n + " " + plural(n, ["визит", "визита", "визитов"]);
function vClients() {
  if (!CL_BOOK) loadClientBookings();
  const q = S.clQ || "", all = clientList(), list = q.trim().length >= 2 ? matchClients(q) : all;
  return `<div style="display:flex;justify-content:space-between;align-items:baseline"><h1 class="h1" style="font-size:26px">Клиенты</h1><span class="small muted">${all.length} в базе</span></div>
  <label class="search"><span aria-hidden="true">⌕</span><input id="clQ" type="search" inputmode="search" autocomplete="off" placeholder="Имя или телефон" value="${esc(q)}" aria-label="Поиск клиента"></label>
  <div class="btns"><button class="btn ghost" style="flex:2" data-act="cl-new">${ICON.plus}Новый клиент</button>${ROLE === "owner" ? `<button class="btn ghost" style="flex:1" data-act="imp-open">Импорт из DIKIDI</button>` : ""}</div>
  <div id="clList">${clientRows(list)}</div>
  <p class="tiny muted">Клиент попадает в базу автоматически после записи — онлайн или вручную. ${ROLE === "master" && !shareView() ? "Вы видите своих клиентов." : ""}</p>`;
}
function clientRows(list) {
  if (!CL_BOOK) return loading();
  if (!list.length) return `<div class="empty">Никого не нашли.</div>`;
  return `<div class="card" style="padding:0">${list.slice(0, 200).map((c, i) => `<button class="cl-row" data-act="cl-open" data-v="${esc(c.key)}" style="${i ? "" : "border-top:0"}">
      <span class="biglogo" style="width:40px;height:40px;border-radius:20px;font-size:16px">${esc(c.name.charAt(0).toUpperCase())}</span>
      <span class="stack" style="gap:1px;flex:1;min-width:0;text-align:left"><b>${esc(c.name)}</b><span class="tiny muted">${esc(c.phone || "без телефона")}</span>
        ${c.last ? `<span class="tiny muted" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">посл.: ${esc(shortDate(c.last))} · ${esc(c.lastSvc || "")}</span>` : c.dk && c.dk.last ? `<span class="tiny muted">DIKIDI: ${c.dk.visits} зап. · посл. ${esc(keyRu(c.dk.last))}</span>` : ""}</span>
      <span class="stack" style="gap:1px;align-items:flex-end"><b class="small">${visitsTxt(c.visits)}</b><span class="tiny muted">${rub(c.spent)}</span>${c.next ? `<span class="tiny" style="color:var(--accent)">запись ${esc(shortDate(c.next))}</span>` : ""}</span></button>`).join("")}</div>`;
}
function vClient() {
  if (!CL_BOOK) loadClientBookings();
  const c = clientList().find(x => x.key === S.clKey);
  if (!c) return `${header("", "Клиент", "clients")}${CL_BOOK ? `<div class="empty">Клиент не найден.</div>` : loading()}`;
  const fav = Object.keys(c.artists).sort((a, b) => c.artists[b] - c.artists[a])[0];
  const hist = c.list.slice().sort((a, b) => (b.date + hm(b.start)).localeCompare(a.date + hm(a.start)));
  const msgB = { name: c.name, phone: c.phone };
  return `${header("", c.name, "clients")}
  <div class="stat3"><div class="card"><span class="tiny muted">Визитов</span><b>${c.visits}</b></div><div class="card"><span class="tiny muted">Потрачено</span><b>${rub(c.spent)}</b></div><div class="card"><span class="tiny muted">Отмены</span><b>${c.cancels}</b></div></div>
  ${c.dk ? `<div class="card stack" style="gap:2px"><span class="tiny muted" style="font-weight:700">ИСТОРИЯ ИЗ DIKIDI</span><b>${c.dk.visits} ${plural(c.dk.visits, ["запись", "записи", "записей"])} · потрачено ${rub(c.dk.spent)}</b><span class="small muted">${c.dk.last ? "последняя запись " + esc(keyRu(c.dk.last)) : ""}${c.dk.bday ? (c.dk.last ? " · " : "") + "день рождения " + esc(c.dk.bday) : ""}</span></div>` : ""}
  ${c.last ? `<div class="card stack" style="gap:2px"><span class="tiny muted" style="font-weight:700">ПОСЛЕДНИЙ ВИЗИТ</span><b>${esc(shortDate(c.last))} · ${esc(c.lastSvc || "")}</b><span class="small muted">мастер ${esc(artistName(c.lastArtist))}${c.next ? " · следующая запись " + esc(shortDate(c.next)) : ""}</span></div>` : ""}
  <div class="card stack">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><b style="font-size:16px;user-select:all">${esc(c.phone || "Телефон не указан")}</b>${fav ? `<span class="tiny muted">обычно к мастеру ${esc(artistName(fav))}</span>` : ""}</div>
    ${c.phone ? `<div class="msgbtns"><a class="btn sm ghost" href="tel:${esc(c.phone.replace(/[^\d+]/g, ""))}">${ICON.phone}Звонок</a>
      <a class="btn sm ghost msg-wa" href="${esc(waLink(c.phone, ""))}" target="_blank" rel="noopener">${ICON.wa}WhatsApp</a>
      <a class="btn sm ghost msg-sms" href="${esc(smsLink(c.phone, ""))}">${ICON.sms}SMS</a></div>` : ""}
  </div>
  <div class="card stack"><b>Заметка <span class="tiny muted" style="font-weight:600">(видят только мастера и владелец)</span></b>
    <textarea id="clNote" rows="3" maxlength="1000" placeholder="Например: любимые оттенки, длина, аллергии">${esc(S.clNote != null ? S.clNote : c.note)}</textarea>
    ${(() => { const parts = c.name.trim().split(/\s+/), fn = parts.shift() || "", sn = parts.join(" ");
      return `<div class="grid2">${fld("clName", "Имя", S.clName != null ? S.clName : fn, 'maxlength="30" autocomplete="off"')}${fld("clSurname", "Фамилия", S.clSurname != null ? S.clSurname : sn, 'maxlength="30" autocomplete="off"')}</div>`; })()}
    ${fld("clPhone", "Телефон", S.clPhone != null ? S.clPhone : c.phone, 'type="tel" inputmode="tel" maxlength="25" autocomplete="off"')}
    <button class="btn sm ghost" data-act="cl-save">Сохранить</button></div>
  <h2 class="h2">История визитов</h2>
  ${hist.length ? `<div class="card" style="padding:0">${hist.map((b, i) => { const fut = b.status !== "cancelled" && (b.date > todayKey() || (b.date === todayKey() && b.start + b.dur > nowMin()));
    return `<div class="cl-hist" style="${i ? "" : "border-top:0"}"><span class="stack" style="align-items:center;width:46px"><b>${new Date(b.date + "T12:00").getDate()}</b><span class="tiny muted">${MONG[new Date(b.date + "T12:00").getMonth()].slice(0, 3)}</span></span>
      <span class="stack" style="gap:1px;flex:1;min-width:0"><b class="small">${esc((b.serviceNames || []).join(", "))}</b><span class="tiny" style="color:${b.status === "cancelled" ? "var(--bad)" : fut ? "var(--accent)" : "var(--muted)"}">${b.status === "cancelled" ? "Отменена" : (fut ? "Запланирован · " : "") + hm(b.start) + " · " + esc(artistName(b.artist))}</span></span>
      <b class="small">${rub(b.total)}</b></div>`; }).join("")}</div>` : `<div class="empty">Визитов пока нет.</div>`}
  <button class="btn" data-act="cl-book" data-v="${esc(c.key)}">Записать ${c.visits ? "снова" : "клиента"}</button>`;
}
function vClientNew() {
  const N = S.cn || (S.cn = { name: "", surname: "", phone: "", note: "" });
  return `${header("", "Новый клиент", "clients")}
  <div class="card stack">
    ${fld("cnName", "Имя *", N.name, 'maxlength="30" autocomplete="off"')}
    ${fld("cnSurname", "Фамилия (необязательно)", N.surname, 'maxlength="30" autocomplete="off"')}
    ${fld("cnPhone", "Телефон", N.phone, 'type="tel" inputmode="tel" maxlength="25" autocomplete="off" placeholder="+7 900 000-00-00"')}
    <label class="field" for="cnNote">Заметка (необязательно)<textarea id="cnNote" rows="3" maxlength="1000">${esc(N.note)}</textarea></label>
  </div>
  ${S.cnErr ? `<div class="err-box" role="alert">${esc(S.cnErr)}</div>` : ""}
  <button class="btn" data-act="cn-save" ${S.saving ? "disabled" : ""}>Сохранить клиента</button>`;
}
async function saveClientCard(key, data) {
  const id = key.slice(0, 60);
  await setDoc(SD("clients", id), Object.assign({ name: "", phone: "", note: "", updated: Date.now() }, CLIENT_DOCS[id] || {}, data, { updated: Date.now() }));
}
/* ================= import of clients from DIKIDI («Клиенты → Список клиентов → Excel / CSV») ================= */
function loadXlsx() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  return new Promise((ok, bad) => { const s = document.createElement("script"); s.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
    s.onload = () => window.XLSX ? ok(window.XLSX) : bad(new Error("x")); s.onerror = () => bad(new Error("Не удалось открыть Excel. Проверьте интернет и попробуйте снова.")); document.head.appendChild(s); });
}
const ruDateKey = v => { const m = String(v || "").match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/); return m ? m[3] + "-" + m[2].padStart(2, "0") + "-" + m[1].padStart(2, "0") : ""; };
const keyRu = k => k ? k.slice(8, 10) + "." + k.slice(5, 7) + "." + k.slice(0, 4) : "";
function normPhone(p) { let d = String(p || "").replace(/\D/g, ""); if (d.length === 11 && d[0] === "8") d = "7" + d.slice(1); if (d.length === 10) d = "7" + d; return d.length >= 7 ? ("+" + d).slice(0, 25) : ""; }
async function readDikidi(file) {
  const X = await loadXlsx();
  const wb = X.read(await file.arrayBuffer(), { type: "array", raw: false });
  const rows = X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: "" });
  const hi = rows.findIndex(r => r.some(c => /^имя/i.test(String(c).trim())) && r.some(c => /телефон|мобильн/i.test(String(c))));
  if (hi < 0) throw new Error("В файле нет колонок «Имя» и «Мобильный номер». Нужен файл из DIKIDI: Клиенты → Список клиентов → Excel.");
  const H = rows[hi].map(c => String(c).trim().toLowerCase()), col = re => H.findIndex(h => re.test(h));
  const cN = col(/^имя/), cS = col(/^фамилия/), cP = col(/мобильн|телефон/), cC = col(/коммент/), cSp = col(/^потрачено/),
    cV = col(/количество (записей|визитов)/), cL = col(/последний визит/), cB = col(/день рождения/), cBl = col(/(черном|чёрном) списке/);
  const g = (r, i) => i < 0 ? "" : String(r[i] == null ? "" : r[i]).trim(), num = v => { const n = Number(String(v).replace(/\s/g, "").replace(",", ".")); return isFinite(n) ? n : 0; };
  const out = {};
  rows.slice(hi + 1).forEach(r => {
    const name = fullName(g(r, cN), g(r, cS)), phone = normPhone(g(r, cP));
    if (!name && !phone) return;
    const black = /^да$/i.test(g(r, cBl)), com = g(r, cC);
    const note = ((black ? "⚠ В чёрном списке (DIKIDI). " : "") + com).slice(0, 1000);
    const key = clientKey(name || phone, phone);
    const dk = { visits: Math.round(num(g(r, cV))), spent: Math.round(num(g(r, cSp))), last: ruDateKey(g(r, cL)), bday: g(r, cB).slice(0, 20) };
    if (!out[key]) out[key] = { key, name: name || "Клиент", phone, note, dk };
  });
  return Object.values(out);
}
function vClientImport() {
  const I = S.imp || {};
  const top = `${header("", "Импорт из DIKIDI", "clients")}`;
  if (I.busy) return top + `<div class="card stack"><b>${esc(I.busy)}</b>${loading()}</div>`;
  if (I.done) return top + `<div class="card stack" role="status"><b style="font-size:17px">Готово ✓</b><span>Добавлено новых клиентов: <b>${I.done.fresh}</b></span><span>Обновлено (уже были в базе): <b>${I.done.exist}</b></span></div>
    <button class="btn" data-act="go" data-v="clients">К списку клиентов</button>`;
  if (!I.list) return top + `<div class="card stack"><b>Перенесите клиентов из DIKIDI</b>
    <ol class="small" style="margin:0;padding-left:20px;line-height:1.6"><li>В DIKIDI: <b>Клиенты → Список клиентов → ⋮ → Excel</b> (может только «Создатель» салона).</li><li>Нажмите кнопку ниже и выберите этот файл.</li><li>Проверьте и нажмите «Загрузить».</li></ol>
    <span class="tiny muted">Переносятся имя, фамилия, телефон, комментарий, число записей, потраченная сумма, последний визит и день рождения. Повторы по номеру телефона не дублируются.</span></div>
    ${I.err ? `<div class="err-box" role="alert">${esc(I.err)}</div>` : ""}
    <button class="btn" data-act="imp-pick">Выбрать файл (Excel или CSV)</button>`;
  const fresh = I.list.filter(r => !CLIENT_DOCS[r.key]).length, exist = I.list.length - fresh;
  return top + `<div class="stat3"><div class="card"><span class="tiny muted">В файле</span><b>${I.list.length}</b></div><div class="card"><span class="tiny muted">Новые</span><b>${fresh}</b></div><div class="card"><span class="tiny muted">Уже в базе</span><b>${exist}</b></div></div>
  <div class="card" style="padding:0">${I.list.slice(0, 8).map((r, i) => `<div class="cl-hist" style="${i ? "" : "border-top:0"}"><span class="stack" style="gap:1px;flex:1;min-width:0"><b class="small">${esc(r.name)}</b><span class="tiny muted">${esc(r.phone || "без телефона")}${r.dk.last ? " · посл. " + esc(keyRu(r.dk.last)) : ""}</span></span><span class="tiny muted">${r.dk.visits} зап.</span></div>`).join("")}
  ${I.list.length > 8 ? `<div class="cl-hist tiny muted">…и ещё ${I.list.length - 8}</div>` : ""}</div>
  <p class="tiny muted">У клиентов, которые уже есть в базе, сохранятся ваши имя, телефон и заметка — добавится только история из DIKIDI.</p>
  <button class="btn" data-act="imp-save">Загрузить ${I.list.length} ${plural(I.list.length, ["клиента", "клиента", "клиентов"])}</button>
  <button class="btn ghost" data-act="imp-pick">Выбрать другой файл</button>`;
}
async function saveImport() {
  const list = S.imp.list; let fresh = 0, exist = 0;
  for (let i = 0; i < list.length; i += 400) {
    S.imp.busy = `Загружаем… ${Math.min(i + 400, list.length)} из ${list.length}`; render(true);
    const batch = writeBatch(db);
    list.slice(i, i + 400).forEach(r => { const id = r.key.slice(0, 60), old = CLIENT_DOCS[id];
      if (old) exist++; else fresh++;
      batch.set(SD("clients", id), Object.assign({ created: Date.now() }, old || {}, { name: (old && old.name) || r.name, phone: (old && old.phone) || r.phone, note: (old && old.note) || r.note, dk: r.dk, updated: Date.now() })); });
    await batch.commit();
  }
  S.imp = { done: { fresh, exist } };
}
let filePicker = null, fileTarget = null;
function pickFile(accept, onFile) {
  fileTarget = onFile;
  if (!filePicker) {
    filePicker = document.createElement("input"); filePicker.type = "file"; filePicker.id = "impFile";
    filePicker.style.cssText = "position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0"; document.body.appendChild(filePicker);
    filePicker.addEventListener("change", () => { const f = filePicker.files && filePicker.files[0]; if (f && fileTarget) fileTarget(f); filePicker.value = ""; });
  }
  filePicker.accept = accept; filePicker.click();
}
// suggestions under the name / phone fields of «Записать клиента»
function mbSuggest() {
  const M = S.mb; if (!M || M.clientKey) return "";
  const q = (M.phone || "").replace(/\D/g, "").length >= 3 ? M.phone : M.name;
  const list = matchClients(q, 5);
  if (!list.length) return "";
  return `<div class="sugg"><span class="tiny muted" style="padding:8px 12px 0;display:block;font-weight:600">Из базы клиентов:</span>${list.map(c => `<button class="sugg-row" data-act="mb-pick" data-v="${esc(c.key)}"><span class="stack" style="gap:1px;text-align:left"><b class="small">${esc(c.name)}</b><span class="tiny muted">${esc(c.phone || "без телефона")} · ${visitsTxt(c.visits)}</span></span><b class="small" style="color:var(--accent)">Выбрать</b></button>`).join("")}</div>`;
}
function refreshMbSuggest() { const e = document.getElementById("mbSugg"); if (e) e.innerHTML = mbSuggest(); }

/* ================= administrators (only the main owner manages them) ================= */
function vAdmins() {
  const A = S.adm || (S.adm = { email: "", scope: "salon" });
  const here = SALON_KEY, hereName = SET ? SET.name : "этот салон";
  const scopeTxt = a => a.scope === "all" ? "все салоны и оплаты" : "салон «" + (a.salonName || a.salon) + "»";
  const rows = ADMINS.map(a => `<div class="cl-row" style="cursor:default"><span class="biglogo" style="width:40px;height:40px;border-radius:20px;font-size:16px;background:#E9E3F1;color:#4B2F66">${esc((a.email || "?").charAt(0).toUpperCase())}</span>
      <span class="stack" style="gap:1px;flex:1;min-width:0"><b class="small" style="word-break:break-all">${esc(a.email)}</b><span class="tiny muted">Администратор · ${esc(scopeTxt(a))}</span></span>
      ${S.armed === "adm:" + a.id ? `<button class="btn sm solid-danger" data-act="adm-del" data-v="${esc(a.id)}">Убрать</button>` : `<button class="icon-btn" data-act="adm-arm" data-v="${esc(a.id)}" aria-label="Убрать администратора ${esc(a.email)}" style="color:var(--bad)">${ICON.trash}</button>`}</div>`).join("");
  return `${header("", "Администраторы", "settings")}
  <p class="small muted" style="margin-top:-8px">Администратор может то же, что и владелец: все записи, клиенты, отчёт, настройки, мастера.</p>
  <div class="card" style="padding:0">
    <div class="cl-row" style="cursor:default;border-top:0"><span class="biglogo" style="width:40px;height:40px;border-radius:20px;font-size:16px">${esc((USER.email || "?").charAt(0).toUpperCase())}</span>
      <span class="stack" style="gap:1px;flex:1;min-width:0"><b class="small" style="word-break:break-all">${esc(USER.email || "")}</b><span class="tiny muted">Вы</span></span><span class="pill p-free">Владелец</span></div>
    ${rows}</div>
  <div class="card stack"><b>Добавить администратора</b>
    ${fld("admEmail", "Email", A.email, 'type="email" inputmode="email" maxlength="80" autocomplete="off" placeholder="email@mail.ru"')}
    <div class="seg" role="group" aria-label="Права"><button data-act="adm-scope" data-v="salon" aria-pressed="${A.scope === "salon"}">Этот салон</button><button data-act="adm-scope" data-v="all" aria-pressed="${A.scope === "all"}">Все салоны и оплаты</button></div>
    <span class="tiny muted">${A.scope === "salon" ? "Записи, клиенты, отчёт и настройки «" + esc(hereName) + "»." : "Как у вас: ещё «Мои салоны», добавление салонов, подтверждение оплат, цена подписки."}</span>
    ${S.admErr ? `<div class="err-box" role="alert">${esc(S.admErr)}</div>` : ""}
    <button class="btn" data-act="adm-add" ${S.saving ? "disabled" : ""}>Дать права администратора</button></div>
  <p class="tiny muted">Администратор открывает ссылку кабинета${here !== "main" ? " этого салона" : ""}: <b style="user-select:all;word-break:break-all">${esc(SID ? salonUrl(SID, true) : location.origin + location.pathname + "#owner")}</b> → «Регистрация» с этим email и подтверждает почту. Добавлять и убирать администраторов можете только вы.</p>`;
}
async function addAdmin() {
  const A = S.adm, em = (A.email || "").trim().toLowerCase(); S.admErr = "";
  if (!/^[^@\s|]+@[^@\s|]+\.[^@\s|]+$/.test(em)) { S.admErr = "Проверьте email"; render(true); return; }
  const id = em + "|" + (A.scope === "all" ? "*" : SALON_KEY);
  S.saving = true; render(true);
  try { await setDoc(doc(db, "admins", id), { email: em, scope: A.scope, salon: A.scope === "all" ? "*" : SALON_KEY, salonName: A.scope === "all" ? "" : (SET ? SET.name : ""), added: Date.now() });
    toast("Права выданы: " + em); S.adm = null; }
  catch (err) { S.admErr = errText(err); }
  S.saving = false; render(true);
}

/* ================= notifications: push (app closed) + chime (app open) ================= */
const PUSH_URL = "https://nailbook-push.gienkidzas.workers.dev";
const VAPID_PUBLIC = "BLWFGbpnQc4v8oqU6RKmRtGnij9GSw62RHgJKYH6yMMHJECykAyPYM7IWxydXAMAnvnasGh7tU-eGFNAsdsQvoc";
const SALON_KEY = SID || "main";
const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const notifPrefs = () => Object.assign({ nb: true, cn: true, am: true, snd: true }, lsGet("nb-notif-prefs", {}));
let pushSub = null, pushReady = false;
function pushPost(path, body) {
  return fetch(PUSH_URL + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.assign({ salon: SALON_KEY }, body)), keepalive: true })
    .then(r => r.json().catch(() => ({}))).catch(() => ({}));
}
function b64uToBytes(s) { s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; return Uint8Array.from(atob(s), c => c.charCodeAt(0)); }
async function getPushSub(create) {
  if (!pushSupported()) return null;
  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub && create) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uToBytes(VAPID_PUBLIC) });
    return sub ? JSON.parse(JSON.stringify(sub)) : null;
  } catch (e) { return null; }
}
// staff: register this phone (with the sign-in token, so only real staff get booking details)
async function staffPushOn(ask) {
  if (!pushSupported() || !USER) return false;
  if (ask && Notification.permission !== "granted") { const p = await Notification.requestPermission(); if (p !== "granted") { toast("Уведомления запрещены в настройках телефона"); render(true); return false; } }
  if (Notification.permission !== "granted") return false;
  const sub = await getPushSub(true); if (!sub) { toast("Не удалось включить уведомления на этом телефоне"); return false; }
  const token = await USER.getIdToken().catch(() => "");
  const r = await pushPost("/sub/staff", { token, sub, prefs: notifPrefs() });
  pushSub = sub; pushReady = !!r.ok; lsSet(lsk("nb-push-on"), pushReady); render(true);
  return pushReady;
}
async function staffPushOff() {
  const sub = pushSub || await getPushSub(false);
  if (sub) await pushPost("/sub/staff/off", { endpoint: sub.endpoint });
  pushReady = false; lsSet(lsk("nb-push-on"), false); render(true);
}
// staff: quietly refresh on each start (the phone may renew its subscription)
async function staffPushRefresh() {
  if (!pushSupported() || Notification.permission !== "granted" || !lsGet(lsk("nb-push-on"), false)) return;
  await staffPushOn(false);
}
// client: remind me about this booking
async function clientRemind(id, ask) {
  if (!pushSupported()) return false;
  if (ask && Notification.permission !== "granted") { const p = await Notification.requestPermission(); if (p !== "granted") { lsSet(lsk("nb-remind-no"), true); render(true); return false; } }
  if (Notification.permission !== "granted") return false;
  const sub = await getPushSub(true); if (!sub) return false;
  const r = await pushPost("/sub/client", { id, sub });
  if (r.ok) { const ids = lsGet(lsk("nb-remind"), []); if (!ids.includes(id)) ids.push(id); lsSet(lsk("nb-remind"), ids.slice(-30)); }
  render(true); return !!r.ok;
}
const pushEvent = (id, type, by) => pushPost("/event", { id, type, by });
// short chime for the open app (phones allow sound only after the first tap)
let audioCtx = null;
document.addEventListener("pointerdown", () => { try { if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)(); if (audioCtx.state === "suspended") audioCtx.resume(); } catch (e) {} }, { passive: true });
function chime() {
  if (!notifPrefs().snd || !audioCtx) return;
  try {
    const t = audioCtx.currentTime;
    [[880, 0], [1320, 0.16]].forEach(([f, d]) => { const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = "sine"; o.frequency.value = f; g.gain.setValueAtTime(0.0001, t + d); g.gain.exponentialRampToValueAtTime(0.25, t + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.35);
      o.connect(g); g.connect(audioCtx.destination); o.start(t + d); o.stop(t + d + 0.4); });
  } catch (e) {}
  try { navigator.vibrate && navigator.vibrate([120, 60, 120]); } catch (e) {}
}
function notifCard() {
  if (!pushSupported() || pushReady || lsGet(lsk("nb-push-on"), false) || Notification.permission === "denied") return "";
  if (lsGet("nb-push-later", 0) > Date.now()) return "";
  return `<div class="card stack notif-card"><div class="row" style="gap:12px">${'<div class="notif-ico">' + ICON.bell + '</div>'}
      <div class="stack" style="gap:2px"><b>Не пропускайте записи</b><span class="small muted">Уведомление со звуком, даже когда приложение закрыто</span></div></div>
    <div class="btns"><button class="btn sm ghost" data-act="push-later">Позже</button><button class="btn sm" data-act="push-on">Включить</button></div></div>`;
}
function vNotif() {
  const P = notifPrefs(), sup = pushSupported(), denied = sup && Notification.permission === "denied", on = pushReady || lsGet(lsk("nb-push-on"), false);
  const row = (k, t, sub) => `<button class="sw-row" role="switch" aria-checked="${!!P[k]}" data-act="np" data-v="${k}"><span class="stack" style="gap:2px;text-align:left"><b>${t}</b><span class="tiny muted">${sub}</span></span><span class="sw"><i></i></span></button>`;
  return `${header("", "Уведомления", "settings")}
  ${!sup ? `<div class="note">${ICON.info}<span>${isIOS() ? "На iPhone уведомления работают, когда приложение добавлено на экран «Домой»: Safari → «Поделиться» → «На экран Домой». Затем откройте приложение с экрана и включите здесь." : "Этот браузер не поддерживает уведомления. Откройте приложение в Chrome."}</span></div>`
    : denied ? `<div class="note">${ICON.info}<span>Уведомления запрещены в настройках телефона. Откройте настройки телефона → Приложения → Chrome (или это приложение) → Уведомления → Разрешить.</span></div>`
    : on ? `<div class="card row notif-on">${ICON.check}<b>Включены на этом телефоне</b></div>`
    : `<button class="btn" data-act="push-on">${ICON.bell}Включить уведомления на этом телефоне</button>`}
  <div class="card stack" style="padding:0;gap:0">
    ${row("nb", "Новые записи", ROLE === "master" ? "Клиент записался к вам онлайн" : "Клиент записался онлайн")}
    ${row("cn", "Отмены", "Клиент отменил запись")}
    ${row("am", "Утро: записи на сегодня", "В 8:00 — сколько клиентов сегодня")}
    ${row("snd", "Звук в открытом приложении", "Сигнал и вибрация, когда приложение на экране")}
  </div>
  ${on && sup ? `<button class="btn ghost" data-act="push-test">Проверить — отправить тестовое уведомление</button>
    <button class="linkbtn" style="align-self:center;color:var(--bad)" data-act="push-off">Выключить уведомления на этом телефоне</button>` : ""}
  <p class="tiny muted">Уведомления приходят на каждый телефон, где вы вошли и нажали «Включить». ${ROLE === "master" ? "Вы получаете уведомления только о своих записях." : "Владелец получает уведомления обо всех записях."}</p>`;
}
function remindCard() {
  if (!pushSupported() || lsGet(lsk("nb-remind-no"), false) || Notification.permission === "denied") return "";
  const ids = lsGet(lsk("nb-remind"), []);
  const next = Object.values(MY).filter(b => b && b.status !== "cancelled" && b.date >= todayKey() && !ids.includes(b.id)).sort((a, b) => (a.date + hm(a.start)).localeCompare(b.date + hm(b.start)))[0];
  if (!next) return "";
  if (Notification.permission === "granted") { clientRemind(next.id, false); return ""; }   // already allowed: remind automatically
  return `<div class="card stack notif-card"><div class="row" style="gap:12px"><div class="notif-ico">${ICON.bell}</div>
      <div class="stack" style="gap:2px"><b>Напомнить о записи?</b><span class="small muted">Уведомление накануне визита и если салон изменит запись</span></div></div>
    <div class="btns"><button class="btn sm ghost" data-act="remind-no">Не нужно</button><button class="btn sm" data-act="remind-yes" data-v="${esc(next.id)}">Да, напомнить</button></div></div>`;
}

/* ================= salons & subscription ================= */
const DAY = 864e5, GRACE = 3 * DAY;
const billing = () => Object.assign({ price: 990, trialDays: 7, phone: "", bank: "", recipient: "", qr: "" }, BILL || {});
function addMonths(t, n) { const d = new Date(t); d.setMonth(d.getMonth() + n); return d.getTime(); }
const dmy = t => { const d = new Date(t); return d.getDate() + " " + MONG[d.getMonth()]; };
function subState(m) {
  if (!m) return { active: true, free: true };
  if (m.free) return { active: true, free: true };
  const now = Date.now(), until = m.until || 0;
  return { active: !m.paused && now < until + GRACE, paused: !!m.paused, until, days: Math.ceil((until - now) / DAY), trial: !m.paidOnce,
    grace: now >= until && now < until + GRACE, claim: m.payClaim || null, rejected: !!m.rejected, price: Number(m.price) || Number(billing().price) || 0 };
}
const SUB = () => SID ? subState(META) : { active: true, free: true };
function subPill(m) {
  const x = subState(m);
  if (x.free) return ["Бесплатно", "p-free"];
  if (x.paused) return ["Приостановлен", "p-bad"];
  if (x.claim) return ["Проверить оплату", "p-check"];
  if (!x.active) return ["Закрыт", "p-bad"];
  if (x.grace) return ["Просрочен", "p-bad"];
  if (x.trial) return ["Пробный · " + Math.max(0, x.days) + " дн.", "p-trial"];
  return ["Оплачено до " + dmy(x.until), "p-ok"];
}
const translit = t => String(t || "").toLowerCase().replace(/[а-яё]/g, ch => ({ а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya" })[ch] ?? "")
  .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30);
const fld = (id, label, val, extra) => `<label class="field" for="${id}">${label}<input id="${id}" value="${esc(val == null ? "" : val)}" ${extra || ""}></label>`;

/* clients: salon link that doesn't exist, or a salon whose subscription is closed */
function vSalonMissing() {
  return `<div class="note">${ICON.info}<span>Салон по этой ссылке не найден. Проверьте ссылку у салона.</span></div>`;
}
function vClientPaused() {
  return `<h1 class="h1">${esc(SET ? SET.name : "Салон")}</h1>
  <div class="note">${ICON.info}<span>Онлайн-запись временно недоступна. Пожалуйста, свяжитесь с салоном напрямую.</span></div>
  ${SET && SET.phone ? `<a class="btn" href="tel:${esc(SET.phone.replace(/[^+\d]/g, ""))}">${ICON.phone || ""}Позвонить в салон</a>` : ""}
  <button class="btn ghost" data-act="go" data-v="bookings">Мои записи</button>`;
}

/* salon owner: subscription page (P1) and closed cabinet (P2) */
function subStatusCard() {
  const x = SUB(), b = billing();
  if (x.free) return `<div class="card stack"><b>Подписка</b><span class="small muted">Для этого салона приложение бесплатно.</span></div>`;
  const title = x.claim ? "Оплата отправлена" : x.paused ? "Салон приостановлен" : !x.active ? "Срок подписки закончился" : x.trial ? "Пробный период" : "Подписка оплачена";
  const pill = x.claim ? "Ждёт проверки" : x.paused || !x.active ? "Закрыт" : x.grace ? "Просрочен" : (x.days <= 0 ? "сегодня" : "осталось " + x.days + " " + plural(x.days, ["день", "дня", "дней"]));
  const text = x.claim ? "Как только администратор увидит перевод, подписка продлится. Обычно в течение дня."
    : x.rejected ? "Перевод не найден. Проверьте перевод или свяжитесь с администратором."
    : x.paused ? "Свяжитесь с администратором приложения."
    : !x.active ? "Кабинет закрыт, пока подписка не будет продлена. Записи и данные сохранены."
    : x.grace ? "Срок закончился " + dmy(x.until) + ". Осталось несколько дней, чтобы оплатить."
    : (x.trial ? "Бесплатный период до " : "Оплачено до ") + dmy(x.until) + ".";
  const total = x.trial ? (b.trialDays || 7) * DAY : 30 * DAY;
  const pct = x.claim ? 100 : Math.max(4, Math.min(100, Math.round((x.until - Date.now()) / total * 100)));
  return `<div class="card stack sub-card ${x.active && !x.grace && !x.rejected ? "" : "sub-warn"}" style="gap:6px">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><b>${title}</b><span class="pill p-trial">${esc(pill)}</span></div>
    <span class="small">${esc(text)}</span>
    <div class="bar8"><i style="width:${pct}%;background:#C98A2B"></i></div></div>`;
}
function vSub() {
  const x = SUB(), b = billing(), n = S.subN || 1, total = x.price * n;
  const seg = [1, 3, 6].map(v => `<button data-act="sub-n" data-v="${v}" aria-pressed="${n === v}">${v} ${plural(v, ["месяц", "месяца", "месяцев"])}</button>`).join("");
  return `${header("", "Подписка", "settings")}
  ${subStatusCard()}
  ${x.free ? "" : `
  <div class="card stack">
    <div style="display:flex;justify-content:space-between;align-items:baseline"><b>Оплата за</b><span class="small muted">${rub(x.price)} в месяц</span></div>
    <div class="seg" role="group" aria-label="Срок">${seg}</div>
    <div style="display:flex;justify-content:space-between;align-items:center"><span>К оплате</span><b style="font-size:22px">${rub(total)}</b></div>
  </div>
  <div class="card row" style="gap:14px;align-items:center">
    ${b.qr ? `<img src="${esc(b.qr)}" alt="QR-код для оплаты по СБП" style="width:110px;height:110px;border-radius:10px;object-fit:contain;background:#fff;flex-shrink:0">` : ""}
    <div class="stack" style="gap:3px;min-width:0"><b>Перевод по СБП</b>
      ${b.bank ? `<span class="small">${esc(b.bank)}</span>` : ""}
      ${b.phone ? `<b style="font-size:16px;user-select:all">${esc(b.phone)}</b>` : `<span class="small muted">Реквизиты ещё не указаны администратором.</span>`}
      ${b.recipient ? `<span class="tiny muted">Получатель: ${esc(b.recipient)}</span>` : ""}
      <span class="tiny muted">Комментарий: «${esc(SET ? SET.name : SID)}»</span></div>
  </div>
  ${x.claim ? `<button class="btn" disabled>Отправлено — ждём проверки</button>`
    : `<button class="btn" data-act="sub-claim" ${S.saving ? "disabled" : ""}>Я оплатил(а) ${rub(total)}</button>
       <p class="tiny muted" style="text-align:center">Сначала переведите деньги в приложении своего банка, потом нажмите кнопку.</p>`}`}`;
}
function vLocked() {
  const x = SUB();
  if (ROLE !== "owner") return `<h1 class="h1">Кабинет закрыт</h1><div class="note">${ICON.info}<span>Подписка салона закончилась. Владелец салона может продлить её в своём кабинете. Записи и данные сохранены.</span></div><button class="btn ghost" data-act="logout">Выйти</button>`;
  return `<h1 class="h1" style="font-size:26px">${x.paused ? "Салон приостановлен" : "Срок подписки закончился"}</h1>
  <p class="small muted" style="margin-top:-8px">${x.paused ? "Свяжитесь с администратором приложения." : "Кабинет салона закрыт, пока подписка не будет продлена."}</p>
  <div class="card stack"><b>Что сохранено</b>
    <div class="small">✓ Все записи клиентов и журнал</div><div class="small">✓ Мастера, услуги, фото и отзывы</div>
    <div class="small" style="color:var(--bad)">✕ Новые онлайн-записи временно отключены</div></div>
  ${x.paused ? "" : `<button class="btn" data-act="go" data-v="sub">${x.claim ? "Оплата на проверке — открыть" : "Продлить подписку · " + rub(x.price)}</button>`}
  <p class="tiny muted" style="text-align:center">Напоминание появляется за 3 дня до конца срока, после окончания есть ещё 3 дня на оплату.</p>
  <button class="btn ghost" data-act="logout">Выйти</button>`;
}
// small reminder in the journal for salon owners (trial, last 3 days, waiting check, not found)
function subBanner() {
  if (!SID || ROLE !== "owner" || isAdmin()) return "";
  const x = SUB(); if (x.free) return "";
  if (!(x.trial || x.days <= 3 || x.claim || x.rejected || x.grace)) return "";
  const t = x.claim ? "Оплата на проверке" : x.rejected ? "Перевод не найден — проверьте оплату" : x.grace ? "Подписка просрочена — оплатите" : x.trial ? "Пробный период: осталось " + Math.max(0, x.days) + " " + plural(Math.max(0, x.days), ["день", "дня", "дней"]) : "Подписка заканчивается через " + x.days + " " + plural(x.days, ["день", "дня", "дней"]);
  return `<button class="card sub-banner" data-act="go" data-v="sub"><span>${esc(t)}</span><b>Подписка ›</b></button>`;
}

/* administrator (zakorchemnaiazanna@mail.ru): all salons, payments, access, price */
function vSalons() {
  const now = new Date(), monthKey = now.getFullYear() + "-" + now.getMonth();
  let month = 0; SALONS.forEach(m => (m.paidLog || []).forEach(p => { const d = new Date(p.at); if (d.getFullYear() + "-" + d.getMonth() === monthKey) month += Number(p.amount || 0); }));
  const checks = SALONS.filter(m => m.payClaim).length, paid = SALONS.filter(m => !m.free && m.paidOnce && subState(m).active).length;
  const card = (sid, name, line, pill, cls, extra, hl) => `<div class="card stack salon-card ${hl ? "hl" : ""}">
      <div style="display:flex;gap:10px;align-items:center"><div style="flex:1;min-width:0"><b style="font-size:15px">${esc(name)}</b><div class="tiny muted">${esc(line)}</div></div><span class="pill ${cls}">${esc(pill)}</span></div>
      ${extra || ""}
      <div class="btns">${(SID || "") === (sid || "") ? `<span class="small muted" style="flex:1;align-self:center">Сейчас открыт</span>` : `<button class="btn sm" data-act="sal-open" data-v="${esc(sid || "main")}">Открыть</button>`}
        ${sid ? `<button class="btn sm ghost" data-act="sal-acc" data-v="${esc(sid)}">Доступ и оплата</button>` : ""}</div></div>`;
  return `<div style="display:flex;justify-content:space-between;align-items:center"><h1 class="h1" style="font-size:26px">Мои салоны</h1>
    <button class="linkbtn" data-act="go" data-v="billing">Цена и реквизиты ›</button></div>
  <div class="stat3"><div class="card"><span class="tiny muted">За месяц</span><b>${rub(month)}</b></div><div class="card"><span class="tiny muted">Оплачено</span><b>${paid}</b></div><div class="card"><span class="tiny muted">Проверить</span><b style="color:var(--accent)">${checks}</b></div></div>
  ${card("", MAIN_NAME, "Ваш салон", "Бесплатно навсегда", "p-free")}
  ${SALONS.map(m => { const [pl, cls] = subPill(m), c = m.payClaim;
    const line = c ? "Сообщил(а) об оплате " + dmy(c.at) + " · " + rub(c.amount) + " за " + c.months + " " + plural(c.months, ["месяц", "месяца", "месяцев"]) : (m.city || "") + (OWNERS[m.id] ? " · " + OWNERS[m.id] : "");
    const extra = c ? `<div class="btns"><button class="btn sm" data-act="sal-ok" data-v="${esc(m.id)}">Деньги пришли</button><button class="btn sm ghost" style="color:var(--bad)" data-act="sal-no" data-v="${esc(m.id)}">Не пришли</button></div>` : "";
    return card(m.id, m.name || m.id, line, pl, cls, extra, !!c); }).join("")}
  <button class="btn" data-act="go" data-v="salonNew">${ICON.plus}Добавить салон</button>
  <p class="tiny muted">У каждого салона своя ссылка, свои мастера, услуги и записи. Клиенты одного салона не видят другие салоны. Проверьте перевод в своём банке, затем нажмите «Деньги пришли» — салон продлится на оплаченный срок.</p>`;
}
function vSalonNew() {
  const N = S.ns || (S.ns = { name: "", city: "", phone: "", email: "", slug: "", slugTouched: false, copy: true });
  return `${header("", "Новый салон", "salons")}
  <div class="card stack">
    ${fld("nsName", "Название салона *", N.name, 'maxlength="60" autocomplete="off"')}
    ${fld("nsCity", "Город, адрес", N.city, 'maxlength="80" autocomplete="off"')}
    ${fld("nsPhone", "Телефон салона", N.phone, 'type="tel" inputmode="tel" maxlength="25" autocomplete="off"')}
    ${fld("nsSlug", "Адрес ссылки (латиницей) *", N.slug, 'maxlength="30" autocomplete="off" autocapitalize="off" placeholder="например: lana"')}
    <span class="tiny muted" style="margin-top:-6px;word-break:break-all">Ссылка для клиентов: ${esc(salonUrl(N.slug || "…"))}</span>
  </div>
  <div class="card stack"><b>Кто будет управлять</b>
    ${fld("nsEmail", "Email владельца этого салона *", N.email, 'type="email" inputmode="email" maxlength="80" autocomplete="off"')}
    <span class="tiny muted">Он зарегистрируется с этим email и сам придумает пароль. Своих мастеров, цены и записи он настроит сам.</span></div>
  <button class="card row check-row" data-act="ns-copy" aria-pressed="${N.copy}"><span class="cbox">${N.copy ? ICON.check : ""}</span>
    <span class="stack" style="gap:2px;text-align:left"><b>Скопировать услуги и цены</b><span class="tiny muted">из «${esc(SET ? SET.name : MAIN_NAME)}» — потом можно изменить</span></span></button>
  ${S.nsErr ? `<div class="err-box" role="alert">${esc(S.nsErr)}</div>` : ""}
  <button class="btn" data-act="ns-save" ${S.saving ? "disabled" : ""}>${S.saving ? "Создаём…" : "Создать салон · " + (billing().trialDays || 7) + " дней бесплатно"}</button>`;
}
function vSalonAccess() {
  const m = SALONS.find(x => x.id === S.accSid);
  if (!m) return `${header("", "Салон", "salons")}${loading()}`;
  const A = S.acc && S.acc.id === m.id ? S.acc : (S.acc = { id: m.id, email: OWNERS[m.id] || "", price: m.price || "" });
  const [pl, cls] = subPill(m), cl = salonUrl(m.id), ol = salonUrl(m.id, true);
  const share = (label, url) => `<div class="stack" style="gap:6px"><b>${label}</b><div class="linkbox">${esc(url)}</div>
    <div class="msgbtns"><button class="btn sm ghost" data-act="copy" data-v="${esc(url)}">Копировать</button><a class="btn sm ghost" href="${esc("https://wa.me/?text=" + encodeURIComponent(url))}" target="_blank" rel="noopener">${ICON.wa}WhatsApp</a></div></div>`;
  return `${header("", m.name || m.id, "salons")}
  <div style="display:flex;gap:8px;align-items:center;margin-top:-10px"><span class="pill ${cls}">${esc(pl)}</span><span class="tiny muted">${esc(m.city || "")}</span></div>
  <div class="card stack">${share("Ссылка для клиентов", cl)}${share("Ссылка для входа владельца и мастеров", ol)}</div>
  <div class="card stack"><b>Владелец салона</b>
    ${fld("acEmail", "Email владельца", A.email, 'type="email" inputmode="email" maxlength="80" autocomplete="off"')}
    <span class="tiny muted" style="margin-top:-4px">Владелец сам добавляет своих мастеров: «Настройки → Мастера».</span>
    <button class="btn sm ghost" data-act="ac-email">Сохранить email</button></div>
  <div class="card stack"><b>Оплата</b>
    <div class="small">${m.free ? "Бесплатно, без ограничений" : (m.paidOnce ? "Оплачено до " : "Пробный период до ") + dmy(m.until || 0)}</div>
    ${fld("acPrice", "Своя цена в месяц, ₽ (пусто = обычная " + rub(billing().price) + ")", A.price, 'inputmode="numeric" maxlength="7" autocomplete="off"')}
    <div class="btns"><button class="btn sm ghost" data-act="ac-price">Сохранить цену</button><button class="btn sm ghost" data-act="ac-month">+1 месяц бесплатно</button></div>
    <button class="btn sm ghost" data-act="ac-free">${m.free ? "Сделать платным" : "Сделать бесплатным навсегда"}</button>
    ${(m.paidLog || []).length ? `<div class="tiny muted">Оплаты: ${(m.paidLog || []).slice(-5).reverse().map(p => dmy(p.at) + " — " + rub(p.amount)).join(" · ")}</div>` : ""}
  </div>
  <button class="btn ${m.paused ? "" : "danger"}" data-act="ac-pause">${m.paused ? "Возобновить салон" : "Приостановить салон"}</button>`;
}
function vBilling() {
  const B = S.bill || (S.bill = Object.assign({}, billing()));
  return `${header("", "Цена и реквизиты", "salons")}
  <div class="card stack"><b>Подписка для салонов</b>
    <div class="grid2">${fld("biPrice", "Цена в месяц, ₽", B.price, 'inputmode="numeric" maxlength="7"')}${fld("biTrial", "Бесплатно, дней", B.trialDays, 'inputmode="numeric" maxlength="3"')}</div>
    <span class="tiny muted">Салоны увидят: ${rub(B.price)} за месяц, ${rub(B.price * 3)} за 3 месяца, ${rub(B.price * 6)} за 6 месяцев. Новая цена — со следующей оплаты. Ваш салон всегда бесплатный.</span></div>
  <div class="card stack"><b>Куда переводить (СБП)</b>
    ${fld("biPhone", "Номер телефона", B.phone, 'type="tel" inputmode="tel" maxlength="25"')}
    <div class="grid2">${fld("biBank", "Банк", B.bank, 'maxlength="40"')}${fld("biRecip", "Получатель", B.recipient, 'maxlength="40" placeholder="Имя Ф."')}</div>
    ${B.qr ? `<img src="${esc(B.qr)}" alt="QR-код" style="width:140px;height:140px;object-fit:contain;background:#fff;border-radius:10px;align-self:center">` : ""}
    <button class="btn sm ghost" data-act="bi-qr">${B.qr ? "Заменить QR-код" : "Загрузить QR-код из банка"}</button>
    <span class="tiny muted">QR-код для перевода можно сделать в приложении вашего банка (СБП → «QR-код для получения») и сохранить картинку.</span></div>
  <button class="btn" data-act="bi-save" ${S.saving ? "disabled" : ""}>Сохранить</button>`;
}

/* ================= install prompt ================= */
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); S.installEvt = e; renderSoon(true); });
const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
function installBlock() {
  if (S.hideInstall || isStandalone()) return "";
  if (S.installEvt) return `<div class="note info">${ICON.info}<div class="stack" style="gap:8px;flex:1"><span>Установите приложение на телефон, чтобы записываться в одно касание.</span>
    <div class="btns"><button class="btn sm" data-act="install">Установить</button><button class="btn sm ghost" data-act="hide-install">Не сейчас</button></div></div></div>`;
  if (isIOS()) return `<div class="note info">${ICON.info}<div class="stack" style="gap:6px;flex:1"><span>Чтобы установить приложение на iPhone: нажмите <b>«Поделиться»</b> внизу Safari, затем <b>«На экран Домой»</b>.</span>
    <button class="linkbtn" style="align-self:flex-start;padding:0;min-height:32px" data-act="hide-install">Понятно</button></div></div>`;
  return "";
}

/* ================= shared view bits ================= */
function logoHTML(cls) {
  if (SET && SET.logo) return `<img class="${cls}" src="${esc(SET.logo)}" alt="">`;
  const n = SET ? SET.name : "";
  return `<div class="${cls}" aria-hidden="true">${esc((n || "N").trim().charAt(0).toUpperCase())}</div>`;
}
function topBar() {
  const sub = S.mode === "owner" ? (ROLE === "master" ? "Кабинет мастера" : "Кабинет салона") : "Онлайн-запись";
  const sw = S.mode === "owner" && isAdmin() && ROLE === "owner";
  const checks = sw ? SALONS.filter(m => m.payClaim).length : 0;
  top.innerHTML = `${logoHTML("logo")}${sw ? `<button class="name name-btn" data-act="go" data-v="salons" aria-label="Мои салоны"><b>${esc(SET ? SET.name : "Онлайн-запись")} ▾</b><span>${sub}${checks ? " · оплат к проверке: " + checks : ""}</span></button>` : `<div class="name"><b>${esc(SET ? SET.name : "Онлайн-запись")}</b><span>${sub}</span></div>`}`;
}
function header(step, title, backTo) {
  return `<div class="head"><button class="back" data-act="go" data-v="${backTo}" aria-label="Назад">${ICON.back}</button>
    <div>${step ? `<div class="step">${step}</div>` : ""}<h1 class="h1">${esc(title)}</h1></div></div>`;
}
const loading = () => `<div class="loading" role="status"><span class="spinner" aria-hidden="true"></span>Загрузка…</div>`;

/* ================= client views ================= */
// Line under each category: the salon's own services in it (first 3), so it always matches what they offer.
function catSub(cat) {
  const names = SET.services.filter(s => s.cat === cat).map(s => s.name);
  return names.slice(0, 3).join(", ") + (names.length > 3 ? " и ещё " + (names.length - 3) : "");
}
function vHome() {
  const phoneDigits = (SET.phone || "").replace(/[^\d+]/g, "");
  return `
  <div class="card salon">
    <div class="row">${logoHTML("biglogo")}
      <div style="min-width:0"><h1 class="h1" style="font-size:22px">${esc(SET.name)}</h1><div class="small muted">Ногтевая студия</div></div></div>
    <div class="meta"><span>${ICON.clock}${esc(hoursText())}</span>${SET.area ? `<span>${ICON.pin}${esc(SET.area)}</span>` : ""}</div>
    ${SET.phone ? `<div class="stack" style="gap:6px"><a class="call" href="tel:${esc(phoneDigits)}">${ICON.phone}Позвонить</a><span class="tiny muted" style="text-align:center;user-select:all">${esc(SET.phone)}</span></div>` : ""}
  </div>
  ${worksStrip()}
  ${installBlock()}
  <section class="stack">
    <h2 class="h2">Выберите услугу</h2>
    <div class="grid2">${CATS.filter(c => SET.services.some(s => s.cat === c.id)).map(c => `<button class="cat" data-act="cat" data-v="${esc(c.id)}"><b>${esc(c.id)}</b><span>${esc(catSub(c.id))}</span></button>`).join("")}</div>
  </section>
  <section class="stack">
    <h2 class="h2">Наши мастера</h2>
    <div class="list">${SET.artists.map(a => `<div class="row">${avatar(a.id, a.name, 44)}<div style="flex:1;min-width:0"><b>${esc(a.name)}</b>${revOf(a.id).length ? `<button class="linkbtn revlink" data-act="reviews" data-v="${esc(a.id)}">${revLine(a.id)} ›</button>` : ""}<div class="tiny muted">${worksOf(a.id) ? worksOf(a.id) + " " + plural(worksOf(a.id), ["работа", "работы", "работ"]) + " в галерее" : "Мастер ногтевого сервиса"}</div></div>${worksOf(a.id) ? `<button class="linkbtn" data-act="gallery-master" data-v="${esc(a.id)}">Работы ›</button>` : ""}</div>`).join("")}</div>
  </section>
  <a class="linkbtn" href="#owner" style="align-self:center;text-decoration:none">Вход для владельца салона</a>`;
}
function barHome() {
  const first = (CATS.find(c => SET.services.some(s => s.cat === c.id)) || CATS[0]).id;
  return `<div class="wrap" style="padding-block:10px;background:var(--bg)"><button class="btn" data-act="cat" data-v="${esc(first)}">Записаться онлайн</button></div>`;
}

function vServices() {
  const cats = CATS.filter(c => SET.services.some(s => s.cat === c.id));
  const items = SET.services.filter(s => s.cat === S.cat);
  return `${header("Шаг 1 из 4", "Выберите услуги", "home")}
  <div class="chips" role="group" aria-label="Категория">${cats.map(c => `<button class="chip" data-act="tab-cat" data-v="${esc(c.id)}" aria-pressed="${c.id === S.cat}">${esc(c.id)}</button>`).join("")}</div>
  <div class="list">${items.map(s => {
    const on = S.sel.includes(s.id);
    return `<button class="opt" data-act="svc" data-v="${esc(s.id)}" aria-pressed="${on}">
    <div class="thumb">${ICON.polish}</div>
    <div class="optbody"><b>${esc(s.name)}</b><span class="tiny muted">${durTxt(s.dur)}</span><span class="price">${hasMasterPrices(s) ? "от " + rub(minPrice(s)) : rub(s.price)}</span></div>
    <div class="check">${on ? ICON.check : ""}</div></button>`;
  }).join("") || `<div class="empty">В этой категории пока нет услуг.</div>`}</div>
  <p class="small muted">Можно выбрать услуги из разных категорий.</p>`;
}
function barServices() {
  const n = S.sel.length;
  return `<div class="cta wrap"><div class="total"><span class="tiny muted">${n} ${plural(n, ["услуга", "услуги", "услуг"])} · ${durTxt(selDur() || 0)}</span><b>${selFrom() ? "от " : ""}${rub(selTotal())}</b></div>
  <button class="btn" data-act="go" data-v="artist" ${n ? "" : "disabled"}>Далее</button></div>`;
}

function vArtist() {
  const dur = selDur();
  const opts = [{ id: "any", name: "Любой свободный мастер", role: "Самый быстрый способ записаться" }]
    .concat(SET.artists.map(a => ({ id: a.id, name: a.name, role: revLine(a.id) || "Мастер ногтевого сервиса" })));
  return `${header("Шаг 2 из 4", "Выберите мастера", "services")}
  <div class="list">${opts.map(o => {
    let next = "Нет свободных окон на 3 недели"; let k = todayKey();
    for (let i = 0; i < DAYS_AHEAD; i++) { if (slotsFor(k, o.id, dur).length) { next = "Ближайшее окно: " + (i === 0 ? "сегодня" : i === 1 ? "завтра" : shortDate(k)); break; } k = addDays(k, 1); }
    const on = S.artist === o.id;
    return `<button class="opt" data-act="artist" data-v="${esc(o.id)}" aria-pressed="${on}">
      ${o.id === "any" ? `<div class="thumb avatar">✱</div>` : avatar(o.id, o.name)}
      <div class="optbody"><b>${esc(o.name)}</b><span class="tiny muted">${o.role}</span><span class="tiny green">${next}</span></div>
      ${S.sel.length ? `<b class="price" style="white-space:nowrap">${o.id === "any" ? (S.sel.some(id => hasMasterPrices(svcById(id) || {})) ? "от " : "") + rub(selTotal("any")) : rub(sumFor(S.sel, o.id))}</b>` : ""}
      <div class="check">${on ? ICON.check : ""}</div></button>`;
  }).join("")}</div>`;
}
const barArtist = () => `<div class="cta wrap"><button class="btn" data-act="go" data-v="time">Выбрать время</button></div>`;

function vTime() {
  const dur = selDur();
  if (!S.date) S.date = firstOpenDay();
  let days = "", k = todayKey();
  for (let i = 0; i < DAYS_AHEAD; i++) {
    const d = dateOf(k), closed = isClosed(k);
    days += `<button class="day" data-act="date" data-v="${k}" aria-pressed="${k === S.date}" ${closed ? "disabled" : ""} aria-label="${longDate(k)}${closed ? ", выходной" : ""}"><small>${i === 0 ? "Сегодня" : DOW[d.getDay()]}</small><b>${d.getDate()}</b></button>`;
    k = addDays(k, 1);
  }
  const slots = slotsFor(S.date, S.artist, dur);
  if (S.time != null && !slots.includes(S.time)) S.time = null;
  const groups = [["Утро", 0, 720], ["День", 720, 1020], ["Вечер", 1020, 1440]].map(([lab, a, b]) => {
    const ts = slots.filter(t => t >= a && t < b);
    if (!ts.length) return "";
    return `<div class="stack" style="gap:8px"><span class="small muted" style="font-weight:700">${lab}</span>
      <div class="slots">${ts.map(t => `<button class="slot" data-act="time" data-v="${t}" aria-pressed="${S.time === t}">${hm(t)}</button>`).join("")}</div></div>`;
  }).join("");
  const d0 = dateOf(S.date);
  return `${header("Шаг 3 из 4", "Выберите дату и время", "artist")}
  <div class="small" style="font-weight:700">${MONN[d0.getMonth()]} ${d0.getFullYear()} · ${esc(S.artist === "any" ? "Любой мастер" : artistName(S.artist))} · ${durTxt(dur)}</div>
  <div class="days" role="group" aria-label="Дата">${days}</div>
  ${groups || `<div class="empty">На ${esc(longDate(S.date).toLowerCase())} свободного времени нет. Выберите другой день${S.artist !== "any" ? " или «Любой свободный мастер»" : ""}.</div>`}`;
}
function barTime() {
  const t = S.time;
  return `<div class="cta wrap"><div class="total"><span class="tiny muted">${t != null ? esc(shortDate(S.date)) : "Время не выбрано"}</span><b>${t != null ? hm(t) + "–" + hm(t + selDur()) : "—"}</b></div>
  <button class="btn" data-act="go" data-v="details" ${t != null ? "" : "disabled"}>Далее</button></div>`;
}

function vDetails() {
  const f = S.form, nameErr = S.tried && !f.name.trim(), phoneErr = S.tried && f.phone.replace(/\D/g, "").length < 7;
  const d = dateOf(S.date);
  return `${header("Шаг 4 из 4", "Подтвердите запись", "time")}
  <div class="card sum">
    <div class="row"><div class="thumb" style="flex-direction:column;width:48px;height:48px"><span class="tiny" style="font-weight:700">${DOW[d.getDay()].toUpperCase()}</span><b style="font-size:17px;line-height:1">${d.getDate()}</b></div>
      <div><b>${esc(longDate(S.date))}, ${hm(S.time)}</b><div class="small muted">${durTxt(selDur())} · ${esc(SET.name)}</div></div></div>
    <div class="hr"></div>
    ${S.sel.map(id => { const s = svcById(id); return s ? `<div class="sumrow"><span>${esc(s.name)}</span><span class="price">${selFrom() ? "от " + rub(minPrice(s)) : rub(priceFor(s, S.artist))}</span></div>` : ""; }).join("")}
    <div class="sumrow"><span class="muted">Мастер</span><span style="font-weight:600">${esc(S.artist === "any" ? "Любой свободный" : artistName(S.artist))}</span></div>
    <div class="hr"></div>
    <div class="sumrow" style="font-size:16px;font-weight:700"><span>Итого</span><span class="price">${selFrom() ? "от " : ""}${rub(selTotal())}</span></div>
  </div>
  <form id="detailsForm" class="stack" novalidate>
    <h2 class="h2">Ваши данные</h2>
    <label class="field" for="fName">Имя ${nameErr ? '<span class="err">Введите ваше имя</span>' : ""}
      <input id="fName" name="given-name" autocomplete="given-name" maxlength="30" value="${esc(f.name)}" placeholder="Имя"></label>
    <label class="field" for="fSurname">Фамилия (необязательно)
      <input id="fSurname" name="family-name" autocomplete="family-name" maxlength="30" value="${esc(f.surname || "")}" placeholder="Фамилия"></label>
    <label class="field" for="fPhone">Телефон ${phoneErr ? '<span class="err">Введите корректный номер телефона</span>' : ""}
      <input id="fPhone" name="phone" type="tel" autocomplete="tel" maxlength="25" value="${esc(f.phone)}" placeholder="+7 900 000-00-00"></label>
    <p class="tiny muted" style="margin-top:-6px">С кодом страны — на этот номер салон пришлёт подтверждение в WhatsApp.</p>
    <label class="field" for="fNote">Комментарий для мастера (необязательно)
      <input id="fNote" name="note" maxlength="250" value="${esc(f.note)}" placeholder="Идея дизайна, аллергии…"></label>
  </form>`;
}
const barDetails = () => `<div class="cta wrap" style="flex-direction:column;align-items:stretch;gap:6px"><button class="btn" data-act="book" ${S.saving ? "disabled" : ""}>${S.saving ? "Сохраняем…" : "Записаться"}</button><span class="tiny muted" style="text-align:center">Бесплатная отмена не позднее чем за 24 часа</span></div>`;

function statusPill(b) {
  return b.status === "cancelled" ? '<span class="pill p-off">Отменена</span>'
    : b.status === "pending" ? '<span class="pill p-wait">Ждёт подтверждения</span>'
    : '<span class="pill p-ok">Подтверждена</span>';
}
function bookingCard(b) {
  const svcs = (b.serviceNames || []).join(", ") || "Услуга";
  const canCancel = b.status !== "cancelled" && b.date >= todayKey();
  return `<div class="card stack">
    <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">
      <div class="stack" style="gap:4px;min-width:0"><span class="when">${esc(shortDate(b.date))} · ${hm(b.start)}</span>
        <b style="font-size:16px">${esc(svcs)}</b><span class="small muted">${esc(SET.name)} · ${esc(artistName(b.artist))}</span></div>
      ${statusPill(b)}</div>
    ${canCancel ? salonMsgButtons(b) : ""}
    ${isDone(b) ? (REVIEWS.some(r => r.id === b.id)
      ? `<div class="small muted">Ваш отзыв: ${starsHtml((REVIEWS.find(r => r.id === b.id) || {}).rating || 0)}</div>`
      : `<button class="btn sm ghost" data-act="rev-new" data-v="${esc(b.id)}">★ Оставить отзыв</button>`) : ""}
    ${canCancel ? (S.armed === b.id
      ? `<div class="btns"><button class="btn sm solid-danger" data-act="cancel" data-v="${esc(b.id)}">Да, отменить</button><button class="btn sm ghost" data-act="disarm">Оставить запись</button></div>`
      : `<button class="btn danger" data-act="arm" data-v="${esc(b.id)}">Отменить запись</button>`) : ""}
  </div>`;
}
function vBookings() {
  const mine = Object.values(MY).filter(Boolean);
  const tk = todayKey();
  const sortKey = b => b.date + hm(b.start);
  const up = mine.filter(b => b.date >= tk && b.status !== "cancelled").sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  const past = mine.filter(b => b.date < tk || b.status === "cancelled").sort((a, b) => sortKey(b).localeCompare(sortKey(a)));
  const list = S.bookTab === "upcoming" ? up : past;
  const first = (CATS.find(c => SET.services.some(s => s.cat === c.id)) || CATS[0]).id;
  return `<h1 class="h1" style="font-size:26px">Мои записи</h1>
  ${S.lastBooked ? `<div class="notice" role="status"><div class="dot">${ICON.check}</div><div><b>Вы записаны!</b><div class="small">${S.lastBooked === "pending" ? "Салон скоро подтвердит запись. Статус обновится здесь." : "Запись подтверждена. Ждём вас!"} Можно также отправить запись салону в WhatsApp, Telegram или по SMS — кнопки ниже.</div></div></div>` : ""}
  ${remindCard()}
  <div class="seg" role="group" aria-label="Показать"><button data-act="btab" data-v="upcoming" aria-pressed="${S.bookTab === "upcoming"}">Предстоящие</button><button data-act="btab" data-v="past" aria-pressed="${S.bookTab === "past"}">Прошедшие и отменённые</button></div>
  <div class="list">${list.length ? list.map(bookingCard).join("") : `<div class="empty">${S.bookTab === "upcoming" ? "Предстоящих записей пока нет." : "Здесь пока ничего нет."}</div>`}</div>
  <p class="tiny muted">Записи сохраняются на этом телефоне. Если вы записывались с другого телефона, они будут видны там.</p>
  <button class="btn ghost" data-act="cat" data-v="${esc(first)}">${ICON.plus}Новая запись</button>`;
}
/* ---------- reviews ---------- */
const revOf = id => REVIEWS.filter(r => r.artist === id);
const revAvg = l => l.length ? Math.round(l.reduce((n, r) => n + Number(r.rating || 0), 0) / l.length * 10) / 10 : 0;
const starsHtml = (n, px) => `<span class="stars" aria-label="Оценка ${n} из 5" style="${px ? "font-size:" + px + "px" : ""}">${[1, 2, 3, 4, 5].map(i => `<i class="${i <= Math.round(n) ? "on" : ""}">★</i>`).join("")}</span>`;
const revLine = id => { const l = revOf(id); return l.length ? `★ ${revAvg(l).toLocaleString("ru-RU")} · ${l.length} ${plural(l.length, ["отзыв", "отзыва", "отзывов"])}` : ""; };
// public name: "Мария" or "Мария К." — never the full surname or phone
const shortName = n => { const p = String(n || "Клиент").trim().split(/\s+/); return p[0] + (p[1] ? " " + p[1].charAt(0).toUpperCase() + "." : ""); };
const revDate = r => { const d = new Date(r.created || Date.now()); return d.getDate() + " " + MONG[d.getMonth()] + " " + d.getFullYear(); };
function reviewCard(r, ctl) {
  return `<div class="card stack" style="gap:6px">
    <div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><b>${esc(shortName(r.name))}</b>${starsHtml(r.rating)}</div>
    <div class="tiny muted">${esc(revDate(r))}${ctl ? " · мастер " + esc(artistName(r.artist)) : ""}${r.edited ? " · изменён салоном" : ""}</div>
    ${r.text ? `<p class="small" style="margin:0;white-space:pre-wrap">${esc(r.text)}</p>` : ""}
    ${ctl || ""}
  </div>`;
}
function vReviews() {
  const id = S.revMaster, l = revOf(id), name = artistName(id);
  return `${header("", "Отзывы", "home")}
  <div class="card row">${avatar(id, name, 56)}<div style="min-width:0"><b style="font-size:17px">Мастер ${esc(name)}</b>
    <div class="small muted">${l.length ? starsHtml(revAvg(l), 15) + " " + revAvg(l).toLocaleString("ru-RU") + " · " + l.length + " " + plural(l.length, ["отзыв", "отзыва", "отзывов"]) : "Отзывов пока нет"}</div></div></div>
  <div class="list">${l.map(r => reviewCard(r)).join("") || `<div class="empty">Отзывов пока нет. Оставить отзыв можно после визита — в «Мои записи».</div>`}</div>`;
}
const barReviews = () => `<div class="cta wrap"><button class="btn" style="flex:1" data-act="book-master" data-v="${esc(S.revMaster)}">Записаться к мастеру ${esc(artistName(S.revMaster))}</button></div>`;
function vReviewForm() {
  const b = MY[S.revBooking]; if (!b) return vBookings();
  const R = S.revDraft;
  return `${header("", "Ваш отзыв", "bookings")}
  <div class="card row">${avatar(b.artist, artistName(b.artist), 48)}<div style="min-width:0"><b>Мастер ${esc(artistName(b.artist))}</b><div class="small muted">${esc(shortDate(b.date))} · ${esc((b.serviceNames || []).join(", "))}</div></div></div>
  <div class="card stack">
    <b>Как вам визит?</b>
    <div class="starpick" role="group" aria-label="Оценка">${[1, 2, 3, 4, 5].map(i => `<button data-act="rev-star" data-v="${i}" aria-label="${i} из 5" aria-pressed="${i <= R.rating}">★</button>`).join("")}</div>
    <label class="field" for="revText">Отзыв (необязательно)<textarea id="revText" maxlength="500" rows="4" placeholder="Что понравилось? Будем рады вашим словам">${esc(R.text)}</textarea></label>
    ${S.tried && !R.rating ? `<div class="err">Поставьте оценку — нажмите на звёзды</div>` : ""}
    <p class="tiny muted">Отзыв увидят другие клиенты. Будет показано только ваше имя: «${esc(shortName(b.name))}».</p>
  </div>`;
}
const barReviewForm = () => `<div class="cta wrap"><button class="btn" style="flex:1" data-act="rev-send" ${S.saving ? "disabled" : ""}>${S.saving ? "Отправляем…" : "Отправить отзыв"}</button></div>`;
async function sendReview() {
  const b = MY[S.revBooking], R = S.revDraft;
  S.tried = true;
  if (!b || !R.rating) { render(true); return; }
  S.saving = true; render(true);
  try {
    await setDoc(SD("reviews", b.id), { artist: b.artist, name: b.name, rating: R.rating, text: (R.text || "").trim().slice(0, 500), created: Date.now(), edited: false });
    toast("Спасибо за отзыв!"); S.saving = false; S.tried = false; S.revDraft = null; go("bookings"); return;
  } catch (err) { toast(errText(err)); }
  S.saving = false; render(true);
}
/* owner / master: reviews list inside the «Работы» tab */
function vReviewsAdmin() {
  const own = ROLE === "master", isOwn = ROLE === "owner";
  let l = own ? revOf(MY_ARTIST) : REVIEWS;
  if (!own && S.gMaster !== "all") l = l.filter(r => r.artist === S.gMaster);
  const E = S.revEdit;
  const card = r => {
    if (!isOwn) return reviewCard(r);
    if (E && E.id === r.id) return `<div class="card stack" style="gap:8px"><b>${esc(shortName(r.name))} · мастер ${esc(artistName(r.artist))}</b>
      <div class="starpick" role="group" aria-label="Оценка">${[1, 2, 3, 4, 5].map(i => `<button data-act="rev-estar" data-v="${i}" aria-label="${i} из 5" aria-pressed="${i <= E.rating}">★</button>`).join("")}</div>
      <label class="field" for="revEditText">Текст отзыва<textarea id="revEditText" maxlength="500" rows="4">${esc(E.text)}</textarea></label>
      <p class="tiny muted">После изменения у отзыва будет пометка «изменён салоном».</p>
      <div class="btns"><button class="btn sm ghost" data-act="rev-ecancel">Отмена</button><button class="btn sm" data-act="rev-esave">Сохранить</button></div></div>`;
    const armed = S.armed === "r:" + r.id;
    return reviewCard(r, `<div class="btns">${armed
      ? `<button class="btn sm solid-danger" data-act="rev-del" data-v="${esc(r.id)}">Да, удалить</button><button class="btn sm ghost" data-act="disarm">Оставить</button>`
      : `<button class="btn sm ghost" data-act="rev-edit" data-v="${esc(r.id)}">Изменить</button><button class="btn sm danger" data-act="rev-arm" data-v="${esc(r.id)}">Удалить</button>`}</div>`);
  };
  const avgTxt = l.length ? `${revAvg(l).toLocaleString("ru-RU")} ★ · ${l.length} ${plural(l.length, ["отзыв", "отзыва", "отзывов"])}` : "Отзывов пока нет";
  return `<p class="small muted" style="margin-top:-6px">${avgTxt}</p>
  ${!own && SET.artists.length > 1 ? chips("g-master", [["all", "Все мастера"]].concat(SET.artists.map(a => [a.id, a.name])), S.gMaster, "Мастер") : ""}
  <div class="list">${l.map(card).join("") || `<div class="empty">Клиенты могут оставить отзыв после визита в разделе «Мои записи».</div>`}</div>
  ${isOwn ? `<p class="tiny muted">Удалять и изменять отзывы может только владелец салона.</p>` : ""}`;
}
async function saveReviewEdit() {
  const E = S.revEdit; if (!E) return;
  if (!E.rating) { toast("Поставьте оценку"); return; }
  try { await updateDoc(SD("reviews", E.id), { rating: E.rating, text: (E.text || "").trim().slice(0, 500), edited: true, updated: Date.now() }); S.revEdit = null; toast("Отзыв изменён"); }
  catch (err) { toast(errText(err)); }
  render(true);
}
async function deleteReview(id) {
  try { await deleteDoc(SD("reviews", id)); toast("Отзыв удалён"); } catch (err) { toast(errText(err)); }
  S.armed = null; render(true);
}
/* ---------- photo gallery (customers) ---------- */
const worksOf = id => PUB_WORKS.filter(w => w.artist === id).length;
const chips = (act, items, cur, label) => `<div class="chips" role="group" aria-label="${label}">${items.map(([id, l]) => `<button class="chip" data-act="${act}" data-v="${esc(id)}" aria-pressed="${cur === id}">${esc(l)}</button>`).join("")}</div>`;
function galleryList(src) {
  return src.filter(w => (S.gMaster === "all" || w.artist === S.gMaster) && (S.gCat === "all" || w.cat === S.gCat));
}
const workDate = w => { const d = new Date(w.created || Date.now()); return d.getDate() + " " + MONG[d.getMonth()]; };
function worksStrip() {
  if (!PUB_WORKS.length) return "";
  return `<section class="stack" style="gap:10px">
    <div style="display:flex;justify-content:space-between;align-items:baseline"><h2 class="h2">Наши работы</h2>
      <button class="linkbtn" data-act="gallery-master" data-v="all" style="padding:0;min-height:32px">Смотреть все · ${PUB_WORKS.length}</button></div>
    <div class="wstrip">${PUB_WORKS.slice(0, 10).map(w => `<button class="wcard" data-act="photo" data-v="${esc(w.id)}" aria-label="${esc((w.title || "Работа") + ", мастер " + artistName(w.artist))}">
      <span class="ph"><img src="${esc(w.thumb)}" alt="" loading="lazy"></span>
      <b class="tiny">${esc(w.title || w.cat)}</b><span class="tiny muted" style="margin-top:-3px">${esc(artistName(w.artist))}</span></button>`).join("")}</div>
  </section>`;
}
function vGallery() {
  const ws = PUB_WORKS;
  const mids = SET.artists.filter(a => ws.some(w => w.artist === a.id));
  const cats = CATS.filter(c => ws.some(w => w.cat === c.id));
  const list = galleryList(ws);
  const who = S.gMaster !== "all" ? artistName(S.gMaster) : "";
  return `${header("", "Наши работы", "home")}
  <div class="small muted" style="margin-top:-10px">${list.length} фото${who ? " · мастер " + esc(who) : ""}</div>
  ${mids.length > 1 ? chips("g-master", [["all", "Все мастера"]].concat(mids.map(a => [a.id, a.name])), S.gMaster, "Мастер") : ""}
  ${cats.length > 1 ? chips("g-cat", [["all", "Все"]].concat(cats.map(c => [c.id, c.id])), S.gCat, "Услуга") : ""}
  ${list.length ? `<div class="wgrid">${list.map(w => `<button class="wtile" data-act="photo" data-v="${esc(w.id)}" aria-label="${esc((w.title || "Работа") + ", мастер " + artistName(w.artist))}"><img src="${esc(w.thumb)}" alt="" loading="lazy"><span class="wtag">${esc(artistName(w.artist))}</span></button>`).join("")}</div>`
    : `<div class="empty">${ws.length ? "Нет фото с такими фильтрами." : "Фото работ скоро появятся."}</div>`}`;
}
function barGallery() {
  const who = S.gMaster !== "all" && SET.artists.some(a => a.id === S.gMaster);
  return `<div class="cta wrap"><button class="btn" style="flex:1" data-act="${who ? "book-master" : "cat"}" data-v="${esc(who ? S.gMaster : firstCatId())}">${who ? "Записаться к мастеру " + esc(artistName(S.gMaster)) : "Записаться онлайн"}</button></div>` + clientTabs();
}
function vPhoto() {
  const w = PUB_WORKS.find(x => x.id === S.photo);
  if (!w) return `${header("", "Фото", "gallery")}<div class="empty">Фото не найдено.</div>`;
  const list = galleryList(PUB_WORKS), i = list.findIndex(x => x.id === w.id);
  const name = artistName(w.artist);
  return `${header(i >= 0 ? (i + 1) + " из " + list.length : "", w.title || "Работа мастера", "gallery")}
  <div class="photo-full"><img src="${esc(FULL[w.id] || w.thumb)}" alt="${esc(w.title || "Работа мастера " + name)}"></div>
  ${list.length > 1 ? `<div class="btns"><button class="btn sm ghost" data-act="photo-nav" data-v="-1">${ICON.back}Предыдущее</button><button class="btn sm ghost" data-act="photo-nav" data-v="1">Следующее${ICON.next}</button></div>` : ""}
  <div class="card row">${avatar(w.artist, name, 48)}
    <div style="min-width:0"><b>Мастер ${esc(name)}</b><div class="small muted">${esc(w.cat || "")} · ${esc(workDate(w))}</div></div></div>`;
}
const barPhoto = () => { const w = PUB_WORKS.find(x => x.id === S.photo); return w && SET.artists.some(a => a.id === w.artist) ? `<div class="cta wrap"><button class="btn" style="flex:1" data-act="book-master" data-v="${esc(w.artist)}">Записаться к мастеру ${esc(artistName(w.artist))}</button></div>` : clientTabs(); };
async function loadFull(id) {
  if (FULL[id]) return;
  try { const s = await getDoc(SD("workImages", id)); if (s.exists() && s.data().img) { FULL[id] = s.data().img; renderSoon(true); } } catch (e) {}
}
const firstCatId = () => (CATS.find(c => SET.services.some(s => s.cat === c.id)) || CATS[0]).id;

function clientTabs() {
  const cur = S.view === "bookings" ? "bookings" : (S.view === "gallery" || S.view === "photo") ? "gallery" : "home";
  return `<nav class="tabs" aria-label="Меню">
    <button class="tab" data-act="go" data-v="home" ${cur === "home" ? 'aria-current="page"' : ""}>${ICON.home}Главная</button>
    ${PUB_WORKS.length ? `<button class="tab" data-act="gallery-master" data-v="all" ${cur === "gallery" ? 'aria-current="page"' : ""}>${ICON.grid}Работы</button>` : ""}
    <button class="tab" data-act="go" data-v="bookings" ${cur === "bookings" ? 'aria-current="page"' : ""}>${ICON.cal}Мои записи</button></nav>`;
}

/* ================= owner views ================= */
function pwField(id, label, val, auto) {
  const show = !!S.pwShow[id];
  return `<label class="field" for="${id}">${label}<span class="pw-wrap"><input id="${id}" type="${show ? "text" : "password"}" autocomplete="${auto}" value="${esc(val)}"><button type="button" class="pw-eye" data-act="pw-eye" data-v="${id}" aria-label="${show ? "Скрыть пароль" : "Показать пароль"}" aria-pressed="${show}">${show ? ICON.eyeOff : ICON.eye}</button></span></label>`;
}
function vLogin() {
  const L = S.login, reg = L.mode === "register";
  return `<h1 class="h1" style="font-size:26px">${reg ? "Регистрация" : "Вход для салона"}</h1>
  <p class="small muted">${reg ? "Укажите email, который вам дал владелец салона или администратор, и придумайте пароль (не меньше 6 символов)." : "Войдите с email и паролем владельца или мастера."}</p>
  <form id="loginForm" class="stack" novalidate>
    <label class="field" for="lEmail">Email<input id="lEmail" type="email" inputmode="email" autocomplete="username" value="${esc(L.email)}"></label>
    ${pwField("lPw", reg ? "Придумайте пароль" : "Пароль", L.pw, reg ? "new-password" : "current-password")}
    ${L.err ? `<div class="err-box" role="alert">${esc(L.err)}</div>` : ""}
    ${L.info ? `<div class="small" role="status" style="color:var(--ok)">${esc(L.info)}</div>` : ""}
    <button class="btn" type="submit" ${L.busy ? "disabled" : ""}>${L.busy ? (reg ? "Создаём…" : "Входим…") : (reg ? "Зарегистрироваться" : "Войти")}</button>
    ${reg ? "" : `<button class="linkbtn" type="button" data-act="forgot" style="align-self:center">Забыли пароль?</button>`}
  </form>
  <button class="btn ghost" data-act="login-mode">${reg ? "У меня уже есть аккаунт — войти" : "Я мастер или новый владелец — регистрация"}</button>
  <a class="linkbtn" href="#" style="align-self:center;text-decoration:none">Открыть приложение для клиентов</a>`;
}
function vVerify() {
  const L = S.login;
  return `<h1 class="h1" style="font-size:26px">Подтвердите email</h1>
  <div class="note info">${ICON.info}<span>Мы отправили письмо на <b>${esc(USER.email || "")}</b>. Откройте его и нажмите на ссылку. Если письма нет, проверьте папку «Спам».</span></div>
  ${L.err ? `<div class="err-box" role="alert">${esc(L.err)}</div>` : ""}
  ${L.info ? `<div class="small" role="status" style="color:var(--ok)">${esc(L.info)}</div>` : ""}
  <button class="btn" data-act="verified">Я подтвердил email</button>
  <button class="btn ghost" data-act="resend">Отправить письмо ещё раз</button>
  <button class="btn danger" data-act="logout">Выйти</button>`;
}
function vNoStaff() {
  return `<h1 class="h1">Нет доступа</h1>
  <div class="note">${ICON.info}<span>Email <b>${esc(USER.email || "")}</b> ещё не добавлен владельцем салона. Попросите владельца открыть «Настройки → Мастера», вписать этот email у вашего имени и нажать «Сохранить». Затем нажмите «Проверить снова».</span></div>
  <button class="btn" data-act="recheck">Проверить снова</button>
  <button class="btn ghost" data-act="logout">Выйти</button>`;
}
function vMasterAccount() {
  return `<h1 class="h1" style="font-size:26px">Аккаунт</h1>
  <button class="card row sub-banner neutral" data-act="go" data-v="notif"><span><b>Уведомления</b><br><span class="tiny muted">${lsGet(lsk("nb-push-on"), false) ? "Включены на этом телефоне" : "Новые записи со звуком"}</span></span><b>›</b></button>
  <div class="card stack">
    <div class="row" style="gap:14px">${avatar(MY_ARTIST, artistName(MY_ARTIST), 72)}
      <div style="min-width:0"><p class="small" style="margin:0">Вы вошли как мастер <b>${esc(artistName(MY_ARTIST))}</b></p>
      <button class="linkbtn" style="padding-left:0" data-act="av-pick" data-v="${esc(MY_ARTIST)}" ${S.avBusy ? "disabled" : ""}>${S.avBusy ? "Загружаем фото…" : AVATARS[MY_ARTIST] ? "Сменить фото профиля" : "Добавить фото профиля"}</button></div></div>
    <p class="tiny muted" style="margin-top:-4px">Клиенты видят это фото, когда выбирают мастера.</p>
    <p class="small muted">${esc(USER.email || "")}</p>
    <p class="tiny muted">Вы видите только свои записи. Название салона, цены и список мастеров меняет владелец.</p>
    <a class="btn sm ghost" href="#">Открыть приложение для клиентов</a>
    <button class="btn danger" data-act="logout">Выйти</button>
  </div>
  ${installBlock()}`;
}
function vDenied() {
  return `<h1 class="h1">Нет доступа</h1>
  <div class="note">${ICON.info}<span>Аккаунт <b>${esc(USER.email || "")}</b> не имеет доступа к кабинету салона. Проверьте, что UID этого аккаунта указан в правилах Firestore (см. SETUP-GUIDE.md, step 5).<br><br>UID: <b style="user-select:all;word-break:break-all">${esc(USER.uid)}</b></span></div>
  <button class="btn ghost" data-act="logout">Выйти</button>`;
}
function vJournal() {
  const k = S.jDate, H = 56, OPEN = SET.open, CLOSE = SET.close;
  const day = JDAY.filter(b => b.status !== "cancelled");
  const revenue = day.reduce((n, b) => n + Number(b.total || 0), 0);
  const ARTS = ROLE === "master" && !shareView() ? SET.artists.filter(x => x.id === MY_ARTIST) : SET.artists;
  const cols = Math.max(1, ARTS.length);
  const colW = `((100% - 44px) / ${cols})`;
  let hours = "";
  for (let h = Math.floor(OPEN / 60); h <= Math.ceil(CLOSE / 60); h++) hours += `<div class="hour" style="top:${(h * 60 - OPEN) / 60 * H}px"><span>${h}:00</span></div>`;
  const vlines = ARTS.map((a, i) => `<div class="vline" style="left:calc(44px + ${i} * ${colW})"></div>`).join("");
  const blocks = day.map(b => {
    const i = Math.max(0, ARTS.findIndex(a => a.id === b.artist));
    const cls = b.status === "pending" ? "a-pending" : "a-confirmed";
    const svcs = (b.serviceNames || []).join(", ");
    return `<button class="appt ${cls}" data-act="open" data-v="${esc(b.id)}" style="top:${(b.start - OPEN) / 60 * H + 2}px;height:${Math.max(22, b.dur / 60 * H - 4)}px;left:calc(44px + ${i} * ${colW} + 3px);width:calc(${colW} - 6px)" aria-label="${esc(b.name)}, ${hm(b.start)}, ${esc(svcs)}">
      <span style="font-weight:700;opacity:.85">${hm(b.start)}–${hm(b.start + b.dur)}</span><b>${esc(b.name)}</b><span>${esc(svcs)}</span></button>`;
  }).join("");
  // master breaks / time off (grey blocks); tap to remove
  const brks = BUSY.filter(x => x.brk && x.date === k && ARTS.some(a => a.id === x.artist)).map(x => {
    const i = ARTS.findIndex(a => a.id === x.artist), mine = ROLE === "owner" || x.artist === MY_ARTIST, armed = S.armed === "brk:" + x.id;
    return `<button class="appt a-break" ${mine ? `data-act="${armed ? "brk-del" : "brk-arm"}" data-v="${esc(x.id)}"` : "disabled"} style="top:${(x.start - OPEN) / 60 * H + 2}px;height:${Math.max(22, x.dur / 60 * H - 4)}px;left:calc(44px + ${i} * ${colW} + 3px);width:calc(${colW} - 6px)" aria-label="Перерыв ${hm(x.start)}–${hm(x.start + x.dur)}">
      <span style="font-weight:700;opacity:.85">${hm(x.start)}–${hm(x.start + x.dur)}</span><b>${esc(x.label || "Перерыв")}</b>${armed ? `<span style="color:var(--bad);font-weight:700">Нажмите ещё раз — удалить</span>` : ""}</button>`; }).join("");
  const nm = nowMin();
  const nowLine = (k === todayKey() && nm >= OPEN && nm <= CLOSE) ? `<div class="now" style="top:${(nm - OPEN) / 60 * H}px"></div>` : "";
  return `<div class="jhead"><div><div class="step">Журнал записей</div><h1 class="h1">${esc(k === todayKey() ? "Сегодня, " + shortDate(k) : longDate(k))}</h1></div>
    <div class="btns"><button class="back" data-act="jday" data-v="-1" aria-label="Предыдущий день">${ICON.back}</button><button class="back" data-act="jday" data-v="1" aria-label="Следующий день">${ICON.next}</button></div></div>
  ${subBanner()}
  ${notifCard()}
  <div class="btns"><button class="btn" style="flex:2" data-act="mb-new">${ICON.plus}Записать клиента</button><button class="btn ghost" style="flex:1" data-act="brk-new">Перерыв</button></div>
  <div class="stats"><span class="stat"><b>${day.length}</b> ${plural(day.length, ["запись", "записи", "записей"])}</span><span class="stat">Выручка: <b>${rub(revenue)}</b></span>${k !== todayKey() ? `<button class="stat" data-act="jtoday" style="font-weight:700;color:var(--accent)">К сегодняшнему дню</button>` : ""}</div>
  ${isClosed(k) ? `<div class="empty">Выходной день.</div>` : `
  <div class="jgrid">
    <div class="jcols" style="grid-template-columns:repeat(${cols},minmax(0,1fr))">${ARTS.map(a => `<span>${esc(a.name)}</span>`).join("")}</div>
    <div class="jbody" style="height:${(CLOSE - OPEN) / 60 * H + 8}px;margin-top:8px">${hours}${vlines}${k >= todayKey() ? jSlots(ARTS, OPEN, CLOSE, H, colW, k) : ""}${blocks}${brks}${nowLine}</div>
  </div>`}
  <div class="legend"><span><i style="background:var(--accent-soft);outline:1.5px dashed var(--accent)"></i>Новая, ждёт подтверждения</span><span><i style="background:var(--accent-soft)"></i>Подтверждена</span></div>`;
}
/* ---------- staff: add a booking by hand (phone call / walk-in) ---------- */
function vManual() {
  const M = S.mb, own = ROLE === "master";
  const sel = M.sel.filter(svcById), dur = sel.reduce((n, id) => n + svcById(id).dur, 0), total = sumFor(sel, M.artist);
  const chair = sel.some(id => svcById(id).cat === PEDI_CAT);
  const slots = M.artist && dur ? slotsFor(M.date, M.artist, dur, chair, true) : [];
  const cats = CATS.filter(c => SET.services.some(x => x.cat === c.id));
  const picked = M.picked && M.time != null;
  const pickedNote = !picked ? "" : !dur ? `<div class="note" style="margin:0">${ICON.info}<span>Время <b>${hm(M.time)}</b>${own ? "" : ", мастер <b>" + esc(artistName(M.artist)) + "</b>"} — выбрано в журнале. Выберите услуги.</span></div>`
    : slots.includes(M.time) ? "" : `<div class="err-box" role="alert">На ${hm(M.time)} эти услуги не помещаются — у мастера занято${chair ? " или занято педикюрное кресло" : ""}. Выберите другое время ниже.</div>`;
  return `${header("", "Запись клиента", "journal")}
  ${pickedNote}
  ${own ? "" : `<div class="card stack"><b>Мастер</b>${chips("mb-artist", SET.artists.map(a => [a.id, a.name]), M.artist, "Мастер")}</div>`}
  <div class="card stack"><b>Услуги</b>
    ${cats.map(c => `<div class="tiny muted" style="font-weight:700;margin-bottom:-4px">${esc(c.id)}</div>
      <div class="list">${SET.services.filter(x => x.cat === c.id).map(x => `<button class="opt" data-act="mb-svc" data-v="${esc(x.id)}" aria-pressed="${M.sel.includes(x.id)}" style="padding:10px 12px">
        <div class="optbody"><b>${esc(x.name)}</b><span class="tiny muted">${esc(durTxt(x.dur))} · ${rub(priceFor(x, M.artist))}</span></div><div class="check">${M.sel.includes(x.id) ? ICON.check : ""}</div></button>`).join("")}</div>`).join("")}
    ${sel.length ? `<div class="small" style="font-weight:600">Итого: ${esc(durTxt(dur))} · ${rub(total)}</div>` : ""}
  </div>
  <div class="card stack"><b>Дата и время</b>
    <label class="field" for="mbDate">Дата<input id="mbDate" type="date" value="${esc(M.date)}" min="${todayKey()}"></label>
    ${!M.artist ? `<div class="small muted">Выберите мастера.</div>` : !dur ? `<div class="small muted">Выберите услуги — покажем свободное время.</div>`
      : isClosed(M.date) ? `<div class="small muted">Выходной день.</div>`
      : slots.length ? `<div class="slots">${slots.map(t => `<button class="slot" data-act="mb-time" data-v="${t}" aria-pressed="${M.time === t}">${hm(t)}</button>`).join("")}</div>`
      : `<div class="small muted">На этот день нет свободного времени${chair ? " (или занято педикюрное кресло)" : ""}.</div>`}
  </div>
  <div class="card stack"><b>Клиент</b>
    ${M.clientKey ? `<div class="picked"><span class="stack" style="gap:2px"><b>${esc(M.name)}${M.phone ? " · " + esc(M.phone) : ""}</b>${(() => { const c = clientList().find(x => x.key === M.clientKey); return c ? `<span class="tiny">${visitsTxt(c.visits)}${c.note ? " · " + esc(c.note) : ""}</span>` : ""; })()}</span><button class="linkbtn" data-act="mb-unpick">Другой</button></div>` : `
    <label class="field" for="mbName">Имя * <span class="tiny muted" style="font-weight:500">— или начните вводить, найдём в базе</span><input id="mbName" maxlength="60" autocomplete="off" value="${esc(M.name)}" placeholder="Имя клиента"></label>
    <div id="mbSugg">${mbSuggest()}</div>`}
    ${S.tried && !M.name.trim() ? `<div class="err">Укажите имя клиента</div>` : ""}
    ${M.clientKey ? "" : `<label class="field" for="mbSurname">Фамилия (необязательно)<input id="mbSurname" maxlength="30" autocomplete="off" value="${esc(M.surname || "")}" placeholder="Фамилия"></label>`}
    ${M.clientKey ? "" : `<label class="field" for="mbPhone">Телефон (необязательно)<input id="mbPhone" type="tel" inputmode="tel" maxlength="25" autocomplete="off" value="${esc(M.phone)}" placeholder="+7 900 000 00 00"></label>`}
    <label class="field" for="mbNote">Комментарий (необязательно)<input id="mbNote" maxlength="250" autocomplete="off" value="${esc(M.note)}" placeholder="Например: записалась по телефону"></label>
  </div>`;
}
const mbSlotOk = M => { const sel = M.sel.filter(svcById), dur = sel.reduce((n, id) => n + svcById(id).dur, 0);
  return dur > 0 && slotsFor(M.date, M.artist, dur, sel.some(id => svcById(id).cat === PEDI_CAT), true).includes(M.time); };
const barManual = () => { const M = S.mb, ok = M && M.artist && M.sel.length && M.time != null && mbSlotOk(M);
  return `<div class="cta wrap"><button class="btn" style="flex:1" data-act="mb-save" ${!ok || S.saving ? "disabled" : ""}>${S.saving ? "Сохраняем…" : ok ? "Записать на " + hm(M.time) : "Выберите услуги и время"}</button></div>`; };
async function saveManual() {
  const M = S.mb; S.tried = true;
  if (!M.name.trim()) { render(true); const e = document.getElementById("mbName"); if (e) e.focus(); return; }
  const sel = M.sel.filter(svcById), dur = sel.reduce((n, id) => n + svcById(id).dur, 0);
  const chair = sel.some(id => svcById(id).cat === PEDI_CAT);
  const artist = ROLE === "master" ? MY_ARTIST : M.artist;
  if (!artist || !artistFree(artist, M.date, M.time, dur) || (chair && !chairFree(M.date, M.time, dur))) { toast("Это время уже занято. Выберите другое."); M.time = null; render(true); return; }
  const id = doc(SC("bookings")).id, now = Date.now();
  const data = { date: M.date, start: M.time, dur, artist, anyArtist: false, services: sel, serviceNames: sel.map(x => svcById(x).name),
    total: Math.round(sumFor(sel, artist)), name: fullName(M.name, M.surname), phone: M.phone.trim().slice(0, 25),
    note: M.note.trim().slice(0, 250), status: "confirmed", created: now, updated: now, ...(chair ? { chair: true } : {}) };
  S.saving = true; render(true);
  try {
    const batch = writeBatch(db);
    batch.set(SD("bookings", id), data);
    batch.set(SD("busy", id), { date: data.date, start: data.start, dur, artist, ...(chair ? { chair: true } : {}) });
    await batch.commit();
    toast("Клиент записан: " + data.name + ", " + hm(data.start));
    S.saving = false; S.tried = false; S.mb = null; S.jDate = data.date; watchJday(); go("journal"); return;
  } catch (err) { toast(errText(err)); }
  S.saving = false; render(true);
}
// empty half-hour cells in the journal: tap one to book a client for that master at that time
function jSlots(ARTS, OPEN, CLOSE, H, colW, k) {
  let out = "";
  ARTS.forEach((a, i) => {
    for (let t = OPEN; t < CLOSE; t += STEP) {
      out += `<button class="jslot" data-act="mb-at" data-v="${esc(a.id)}|${t}" style="top:${(t - OPEN) / 60 * H}px;height:${STEP / 60 * H}px;left:calc(44px + ${i} * ${colW});width:${colW}" aria-label="Записать клиента: ${esc(a.name)}, ${hm(t)}"><span>+ ${hm(t)}</span></button>`;
    }
  });
  return out;
}
/* ---------- master breaks / time off ---------- */
function vBreak() {
  const K = S.brk, own = ROLE === "master";
  const times = []; for (let t = SET.open; t < SET.close; t += STEP) times.push(t);
  const durs = []; for (let m = 15; m <= SET.close - SET.open; m += 15) durs.push(m);
  return `${header("", "Перерыв", "journal")}
  <p class="small muted" style="margin-top:-8px">Обед, личные дела, выходной — в это время клиенты не смогут записаться.</p>
  ${own ? "" : `<div class="card stack"><b>Мастер</b>${chips("brk-artist", SET.artists.map(a => [a.id, a.name]), K.artist, "Мастер")}</div>`}
  <div class="card stack">
    <label class="field" for="brkDate">Дата<input id="brkDate" type="date" value="${esc(K.date)}" min="${todayKey()}"></label>
    <div class="chips chips-wrap"><button class="chip" data-act="brk-all" aria-pressed="${K.allDay}">Весь день</button></div>
    ${K.allDay ? "" : `<div class="grid2">
      <label class="field" for="brkStart">С<select id="brkStart">${times.map(t => `<option value="${t}" ${t === K.start ? "selected" : ""}>${hm(t)}</option>`).join("")}</select></label>
      <label class="field" for="brkDur">Сколько<select id="brkDur">${durs.map(m => `<option value="${m}" ${m === K.dur ? "selected" : ""}>${durTxt(m)}</option>`).join("")}</select></label></div>
      <span class="tiny muted" style="margin-top:-4px">До ${hm(Math.min(SET.close, K.start + K.dur))}</span>`}
    <label class="field" for="brkLabel">Название (необязательно)<input id="brkLabel" maxlength="40" autocomplete="off" value="${esc(K.label)}" placeholder="Обед, личное, выходной…"></label>
    <label class="field" for="brkRep">Повторять<select id="brkRep">${[[1, "Только этот день"], [7, "Каждый рабочий день — 1 неделя"], [14, "Каждый рабочий день — 2 недели"], [30, "Каждый рабочий день — месяц"]].map(([n, l]) => `<option value="${n}" ${K.rep === n ? "selected" : ""}>${l}</option>`).join("")}</select></label>
  </div>
  ${S.brkErr ? `<div class="err-box" role="alert">${esc(S.brkErr)}</div>` : ""}
  <button class="btn" data-act="brk-save" ${S.saving ? "disabled" : ""}>${S.saving ? "Сохраняем…" : "Добавить перерыв"}</button>
  <p class="tiny muted">Убрать перерыв: нажмите на серый блок в журнале и ещё раз — для подтверждения.</p>`;
}
async function saveBreak() {
  const K = S.brk, artist = ROLE === "master" ? MY_ARTIST : K.artist; S.brkErr = "";
  if (!artist) { S.brkErr = "Выберите мастера"; render(true); return; }
  const start = K.allDay ? SET.open : K.start, dur = K.allDay ? SET.close - SET.open : Math.min(K.dur, SET.close - K.start);
  if (dur <= 0) { S.brkErr = "Проверьте время"; render(true); return; }
  const days = []; let d = K.date;
  for (let i = 0; days.length < (K.rep === 1 ? 1 : 400) && i < K.rep; i++, d = addDays(d, 1)) { if (K.rep === 1 || !isClosed(d)) days.push(d); }
  const clash = days.filter(day => !artistFree(artist, day, start, dur));
  if (K.rep === 1 && clash.length) { S.brkErr = "На это время уже есть запись или перерыв. Перенесите запись или выберите другое время."; render(true); return; }
  const ok = days.filter(day => !clash.includes(day));
  S.saving = true; render(true);
  try {
    const batch = writeBatch(db);
    ok.forEach(day => batch.set(doc(SC("busy")), { date: day, start, dur, artist, brk: true, label: (K.label || "").trim().slice(0, 40) }));
    await batch.commit();
    toast(ok.length === 1 ? "Перерыв добавлен" : "Добавлено перерывов: " + ok.length + (clash.length ? " (пропущено дней с записями: " + clash.length + ")" : ""));
    S.saving = false; S.brk = null; S.jDate = K.date; watchJday(); go("journal"); return;
  } catch (err) { S.brkErr = errText(err); }
  S.saving = false; render(true);
}
/* ---------- reschedule a booking (new date / time) ---------- */
function vResched() {
  const R = S.rs, b = R && findBooking(R.id);
  if (!b) return vJournal();
  const sel = R.sel.filter(svcById), chair = sel.some(id => svcById(id).cat === PEDI_CAT);
  const dur = R.dur || b.dur, total = sumFor(sel, b.artist);
  const slots = slotsFor(R.date, b.artist, dur, chair, true, b.id);
  const cats = CATS.filter(c => SET.services.some(x => x.cat === c.id));
  return `${header("", "Изменить запись", "journal")}
  <div class="card stack" style="gap:4px"><b>${esc(b.name)}</b><span class="small muted">Сейчас: ${esc(shortDate(b.date))} в ${hm(b.start)}–${hm(b.start + b.dur)} · ${esc((b.serviceNames || []).join(", "))} · ${rub(b.total)} · мастер ${esc(artistName(b.artist))}</span></div>
  <div class="card stack"><b>Услуги</b>
    ${cats.map(c => `<div class="tiny muted" style="font-weight:700;margin-bottom:-4px">${esc(c.id)}</div>
      <div class="list">${SET.services.filter(x => x.cat === c.id).map(x => `<button class="opt" data-act="rs-svc" data-v="${esc(x.id)}" aria-pressed="${R.sel.includes(x.id)}" style="padding:10px 12px">
        <div class="optbody"><b>${esc(x.name)}</b><span class="tiny muted">${esc(durTxt(x.dur))} · ${rub(priceFor(x, b.artist))}</span></div><div class="check">${R.sel.includes(x.id) ? ICON.check : ""}</div></button>`).join("")}</div>`).join("")}
    ${sel.length ? `<div class="small" style="font-weight:600">Итого: ${rub(total)}</div>` : `<div class="err">Выберите хотя бы одну услугу</div>`}
  </div>
  <div class="card stack"><b>Сколько займёт визит</b>
    <label class="field" for="rsDur">Длительность<select id="rsDur">${durOptions(dur)}</select></label>
    <span class="tiny muted" style="margin-top:-4px">Мастер знает клиента лучше: можно сделать визит короче или длиннее.</span></div>
  <div class="card stack"><b>Дата и время</b>
    <label class="field" for="rsDate">Дата<input id="rsDate" type="date" value="${esc(R.date)}" min="${todayKey()}"></label>
    ${isClosed(R.date) ? `<div class="small muted">Выходной день.</div>`
      : slots.length ? `<div class="slots">${slots.map(t => `<button class="slot" data-act="rs-time" data-v="${t}" aria-pressed="${R.time === t}">${hm(t)}</button>`).join("")}</div>`
      : `<div class="small muted">На этот день нет свободного времени у мастера${chair ? " (или занято педикюрное кресло)" : ""}.</div>`}
  </div>
  <p class="tiny muted">Клиент получит уведомление, если включил напоминания. Можно также написать ему в WhatsApp, Telegram или SMS — кнопки появятся после переноса.</p>`;
}
const barResched = () => { const R = S.rs, ok = R && R.time != null && R.sel.filter(svcById).length && !(R.date === R.oldDate && R.time === R.oldTime && R.dur === R.oldDur && R.sel.join() === R.oldSel);
  return `<div class="cta wrap"><button class="btn" style="flex:1" data-act="rs-save" ${!ok || S.saving ? "disabled" : ""}>${S.saving ? "Сохраняем…" : ok ? "Сохранить: " + esc(shortDate(R.date)) + ", " + hm(R.time) + "–" + hm(R.time + R.dur) : "Выберите время"}</button></div>`; };
async function saveResched() {
  const R = S.rs, b = findBooking(R.id); if (!b || R.time == null) return;
  const sel = R.sel.filter(svcById); if (!sel.length) return;
  const chair = sel.some(id => svcById(id).cat === PEDI_CAT);
  if (!artistFree(b.artist, R.date, R.time, R.dur, b.id) || (chair && !chairFree(R.date, R.time, R.dur, b.id))) { toast("Это время уже занято. Выберите другое."); R.time = null; render(true); return; }
  S.saving = true; render(true);
  try {
    const batch = writeBatch(db);
    const svcChanged = sel.join() !== R.oldSel;
    batch.update(SD("bookings", b.id), Object.assign({ date: R.date, start: R.time, dur: R.dur, updated: Date.now() },
      svcChanged ? { services: sel, serviceNames: sel.map(x => svcById(x).name), total: Math.round(sumFor(sel, b.artist)), chair } : {}));
    batch.update(SD("busy", b.id), Object.assign({ date: R.date, start: R.time, dur: R.dur }, svcChanged ? { chair } : {}));
    await batch.commit();
    pushEvent(b.id, "move", "staff");
    toast("Запись изменена: " + shortDate(R.date) + ", " + hm(R.time) + "–" + hm(R.time + R.dur));
    S.saving = false; S.rs = null; S.jDate = R.date; watchJday(); S.view = "journal"; S.sheet = b.id; render(false); return;
  } catch (err) { toast(errText(err)); }
  S.saving = false; render(true);
}
function vInbox() {
  const pending = PENDING.slice().sort((a, b) => (b.created || 0) - (a.created || 0));
  const recent = RECENT.filter(b => b.status !== "pending").slice(0, 10);
  const fresh = NEWB.filter(b => b.status === "confirmed").sort((a, b) => (b.created || 0) - (a.created || 0));
  if (S.view === "inbox") { const mx = Math.max(inboxSeen, ...NEWB.map(b => b.created || 0)); if (mx > inboxSeen) { inboxSeen = mx; lsSet(lsk("nb-inbox-seen"), mx); } }
  const ago = t => { const m = Math.round((Date.now() - t) / 60000); if (m < 1) return "только что"; if (m < 60) return m + " мин назад"; if (m < 1440) return Math.round(m / 60) + " ч назад"; const d = Math.round(m / 1440); return d + " " + plural(d, ["день", "дня", "дней"]) + " назад"; };
  return `<h1 class="h1" style="font-size:26px">Новые записи</h1>
  ${pending.length ? pending.map(b => `<div class="card stack" style="border:2px solid var(--accent)">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><span class="pill p-new">НОВАЯ</span><span class="tiny muted">${ago(b.created || Date.now())}</span></div>
    <div class="row"><div class="biglogo" style="width:44px;height:44px;border-radius:22px;font-size:18px">${esc((b.name || "?").charAt(0).toUpperCase())}</div>
      <div style="min-width:0"><b style="font-size:16px">${esc(b.name)}</b><div class="small muted" style="user-select:all">${esc(b.phone)}</div></div></div>
    <div class="sum" style="background:var(--bg);border-radius:12px;padding:12px">
      <div class="sumrow"><span class="muted">Когда</span><span style="font-weight:700">${esc(shortDate(b.date))}, ${hm(b.start)}</span></div>
      <div class="sumrow"><span class="muted">Услуги</span><span>${esc((b.serviceNames || []).join(", "))}</span></div>
      <div class="sumrow"><span class="muted">Мастер</span><span>${esc(artistName(b.artist))}${b.anyArtist ? " (назначен автоматически)" : ""}</span></div>
      <div class="sumrow"><span class="muted">Итого</span><span class="price">${rub(b.total)}</span></div>
      ${b.note ? `<div class="sumrow"><span class="muted">Комментарий</span><span>«${esc(b.note)}»</span></div>` : ""}
    </div>
    <div class="btns"><button class="btn sm" data-act="accept" data-v="${esc(b.id)}">Подтвердить</button><button class="btn sm ghost" data-act="open" data-v="${esc(b.id)}">Подробнее</button></div>
    <p class="tiny muted">После подтверждения откроется окно с кнопками WhatsApp и Telegram, чтобы сообщить клиенту.</p>
  </div>`).join("") : ""}
  ${fresh.length ? `${pending.length ? `<h2 class="h2">Подтверждены автоматически</h2>` : ""}${fresh.map(b => `<div class="card stack">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><span class="pill p-ok">НОВАЯ · подтверждена</span><span class="tiny muted">${ago(b.created || Date.now())}</span></div>
    <div class="row"><div class="biglogo" style="width:44px;height:44px;border-radius:22px;font-size:18px">${esc((b.name || "?").charAt(0).toUpperCase())}</div>
      <div style="min-width:0"><b style="font-size:16px">${esc(b.name)}</b><div class="small muted" style="user-select:all">${esc(b.phone)}</div></div></div>
    <div class="sum" style="background:var(--bg);border-radius:12px;padding:12px">
      <div class="sumrow"><span class="muted">Когда</span><span style="font-weight:700">${esc(shortDate(b.date))}, ${hm(b.start)}</span></div>
      <div class="sumrow"><span class="muted">Услуги</span><span>${esc((b.serviceNames || []).join(", "))}</span></div>
      <div class="sumrow"><span class="muted">Мастер</span><span>${esc(artistName(b.artist))}</span></div>
      <div class="sumrow"><span class="muted">Итого</span><span class="price">${rub(b.total)}</span></div>
      ${b.note ? `<div class="sumrow"><span class="muted">Комментарий</span><span>«${esc(b.note)}»</span></div>` : ""}
    </div>
    ${clientMsgButtons(b)}
    <button class="btn sm ghost" data-act="open" data-v="${esc(b.id)}">Подробнее</button>
  </div>`).join("")}` : ""}
  ${!pending.length && !fresh.length ? `<div class="empty">Новых записей за 2 дня нет. Когда клиент запишется, запись появится здесь.</div>` : ""}
  ${recent.length ? `<h2 class="h2">Последние действия</h2><div class="card" style="padding:0">${recent.map((b, i) => `<button data-act="open" data-v="${esc(b.id)}" style="display:flex;gap:12px;align-items:center;padding:14px;width:100%;text-align:left;background:transparent;border:0;${i ? "border-top:1px solid var(--line)" : ""}">
    <span style="width:10px;height:10px;border-radius:5px;flex-shrink:0;background:${b.status === "cancelled" ? "var(--bad)" : "var(--ok)"}"></span>
    <span style="flex:1;min-width:0;display:flex;flex-direction:column;gap:2px"><b style="font-size:14px">${esc(b.name)}: ${b.status === "cancelled" ? "запись отменена" : "запись подтверждена"}</b><span class="tiny muted">${esc(shortDate(b.date))}, ${hm(b.start)} · ${esc(artistName(b.artist))}</span></span></button>`).join("")}</div>` : ""}`;
}
// Service length picker: 15-minute steps up to 8 hours, shown as hours and minutes.
function durOptions(cur) {
  const vals = []; for (let m = 15; m <= 480; m += 15) vals.push(m);
  if (cur && !vals.includes(cur)) { vals.push(cur); vals.sort((a, b) => a - b); }
  return vals.map(m => `<option value="${m}" ${m === cur ? "selected" : ""}>${durTxt(m)}</option>`).join("");
}
function vSettings() {
  if (!S.draft || !S.dirty) {
    S.draft = clone(SET); S.dirty = false;
    const byId = {}; Object.keys(STAFF).forEach(em => { if (!byId[STAFF[em]]) byId[STAFF[em]] = em; });
    S.draft.artists.forEach(a => { a.email = byId[a.id] || ""; });
  }
  const D = S.draft;
  const order = [1, 2, 3, 4, 5, 6, 0];
  return `<h1 class="h1" style="font-size:26px">Настройки салона</h1>
  ${isAdmin() ? `<button class="card row sub-banner" data-act="go" data-v="salons"><span><b>Мои салоны и оплаты</b><br><span class="tiny muted">${SALONS.length + 1} ${plural(SALONS.length + 1, ["салон", "салона", "салонов"])}${SALONS.filter(m => m.payClaim).length ? " · проверить оплат: " + SALONS.filter(m => m.payClaim).length : ""}</span></span><b>›</b></button>` : ""}
  <button class="card row sub-banner neutral" data-act="go" data-v="notif"><span><b>Уведомления</b><br><span class="tiny muted">${lsGet(lsk("nb-push-on"), false) ? "Включены на этом телефоне" : "Новые записи со звуком"}</span></span><b>›</b></button>
  ${isRealOwner() ? `<button class="card row sub-banner neutral" data-act="go" data-v="admins"><span><b>Администраторы</b><br><span class="tiny muted">${ADMINS.length ? ADMINS.length + " " + plural(ADMINS.length, ["администратор", "администратора", "администраторов"]) : "Дать права владельца другим"}</span></span><b>›</b></button>` : ""}
  <button class="card row sub-banner neutral" data-act="go" data-v="tpl"><span><b>Тексты сообщений</b><br><span class="tiny muted">Подтверждение, отмена — для WhatsApp, Telegram и SMS</span></span><b>›</b></button>
  ${SID && !isAdmin() ? `<button class="card row sub-banner" data-act="go" data-v="sub"><span><b>Подписка</b><br><span class="tiny muted">${esc(subPill(META)[0])}</span></span><b>›</b></button>` : ""}
  <p class="small muted">Изменения увидят все клиенты после нажатия «Сохранить».</p>
  <div class="card stack">
    <h2 class="h2">Логотип</h2>
    <div class="logo-edit">
      ${D.logo ? `<img class="biglogo" src="${esc(D.logo)}" alt="Текущий логотип">` : `<div class="biglogo" aria-hidden="true">${esc((D.name || "N").charAt(0).toUpperCase())}</div>`}
      <div class="stack" style="gap:6px;flex:1">
        <label class="btn sm ghost" for="logoFile" style="cursor:pointer">Загрузить логотип</label>
        <input id="logoFile" type="file" accept="image/*" hidden>
        ${D.logo ? `<button class="linkbtn" data-act="logo-remove" style="align-self:flex-start;padding:0;min-height:32px">Убрать логотип</button>` : ""}
      </div>
    </div>
    <p class="tiny muted">Квадратная картинка, лучше PNG или JPG. Она уменьшится автоматически.</p>
  </div>
  <div class="card stack">
    <h2 class="h2">Салон</h2>
    <label class="field" for="dName">Название салона<input id="dName" data-d="name" maxlength="60" value="${esc(D.name)}"></label>
    <label class="field" for="dArea">Город и адрес<input id="dArea" data-d="area" maxlength="120" value="${esc(D.area)}"></label>
    <label class="field" for="dPhone">Телефон салона (с кодом страны, для звонков и WhatsApp)<input id="dPhone" data-d="phone" type="tel" maxlength="25" value="${esc(D.phone)}" placeholder="+7 900 000-00-00"></label>
    <label class="field" for="dTg">Telegram салона (необязательно)<input id="dTg" data-d="telegram" maxlength="40" autocomplete="off" value="${esc(D.telegram || "")}" placeholder="@zananails"></label>
    <p class="tiny muted">Клиенты смогут одним нажатием отправить вам свою запись в WhatsApp (на телефон салона) или в Telegram (на этот ник).</p>
  </div>
  <div class="card stack">
    <h2 class="h2">Часы работы</h2>
    <div class="grid2">
      <label class="field" for="dOpen">Открытие<input id="dOpen" data-d="open" type="time" step="1800" value="${hm(D.open)}"></label>
      <label class="field" for="dClose">Закрытие<input id="dClose" data-d="close" type="time" step="1800" value="${hm(D.close)}"></label>
    </div>
    <label class="field" for="dLead">Онлайн-запись — не позже чем за
      <select id="dLead" data-d="leadMin">${[[30, "30 минут"], [60, "1 час"], [120, "2 часа"], [180, "3 часа"], [240, "4 часа"], [360, "6 часов"], [720, "12 часов"], [1440, "1 день"]].map(([m, l]) => `<option value="${m}" ${Number(D.leadMin ?? 120) === m ? "selected" : ""}>${l} до визита</option>`).join("")}</select></label>
    <span class="tiny muted" style="margin-top:-6px">Клиенты не видят время, до которого осталось меньше. Мастер и владелец могут записать клиента вручную на любое свободное время.</span>
    <div class="field">Выходные дни (нажмите, чтобы выбрать)
      <div class="daypick" role="group" aria-label="Выходные дни">${order.map(d => `<button data-act="dayoff" data-v="${d}" aria-pressed="${D.closedDays.includes(d)}">${DOW[d]}</button>`).join("")}</div></div>
  </div>
  <div class="card stack">
    <h2 class="h2">Подтверждение записей</h2>
    <label class="tick" for="dAuto"><input id="dAuto" type="checkbox" ${D.autoConfirm !== false ? "checked" : ""}> Подтверждать записи автоматически</label>
    <p class="tiny muted">${D.autoConfirm !== false ? "Клиент сразу видит «Запись подтверждена». Новые записи всё равно появляются во вкладке «Новые»." : "Каждую запись нужно подтвердить вручную во вкладке «Новые»."}</p>
  </div>
  <div class="card stack">
    <h2 class="h2">Педикюрное кресло</h2>
    <label class="field" for="dChairs">Сколько педикюрных кресел в салоне<input id="dChairs" data-d="pediChairs" type="number" inputmode="numeric" min="1" max="10" value="${esc(D.pediChairs || 1)}"></label>
    <p class="tiny muted">Кресло общее для всех мастеров: если оно занято, на это время педикюр записать нельзя, даже к другому мастеру. Это касается услуг из категории «Педикюр».</p>
  </div>
  <div class="card stack">
    <h2 class="h2">Мастера</h2>
    <div class="stack" style="gap:0;border:1px solid var(--line);border-radius:14px;overflow:hidden">
      <div style="padding:12px 14px 2px"><b>Доступ мастеров к записям</b></div>
      <button class="sw-row" role="switch" aria-checked="${!!D.shareView}" data-act="d-toggle" data-v="shareView"><span class="stack" style="gap:2px;text-align:left"><b>Видят записи всех мастеров</b><span class="tiny muted">Журнал со всеми колонками, имена и время клиентов</span></span><span class="sw"><i></i></span></button>
      <button class="sw-row" role="switch" aria-checked="${!!(D.shareView && D.shareEdit)}" data-act="d-toggle" data-v="shareEdit" ${D.shareView ? "" : 'disabled style="opacity:.45"'}><span class="stack" style="gap:2px;text-align:left"><b>Могут изменять чужие записи</b><span class="tiny muted">Подтвердить, перенести, передать, отменить</span></span><span class="sw"><i></i></span></button>
    </div>
    <p class="tiny muted">Свои записи мастер может переносить всегда. Отчёт, выручка, настройки и подписка — только у владельца.</p>
    <p class="small muted">Чтобы мастер мог входить и видеть свои записи, впишите его email. Мастер открывает ссылку кабинета, нажимает «Я мастер или новый владелец — регистрация» и сам придумывает пароль.</p>
    ${D.artists.map((a, i) => `<div class="ed">
      <div style="display:flex;gap:8px;align-items:center">
        <button class="av-btn" data-act="av-pick" data-v="${esc(a.id)}" aria-label="Фото профиля: ${esc(a.name || "мастер")}">${avatar(a.id, a.name, 44)}<span class="av-cam">${ICON.camera}</span></button>
        <input class="inp" id="art${i}" aria-label="Имя мастера ${i + 1}" data-d="artist:${i}" maxlength="40" value="${esc(a.name)}" placeholder="Имя мастера">
        ${D.artists.length > 1 ? `<button class="icon-btn" data-act="del-artist" data-v="${i}" aria-label="Удалить мастера ${esc(a.name)}">${ICON.trash}</button>` : ""}</div>
      <input class="inp" id="artEmail${i}" type="email" inputmode="email" autocomplete="off" aria-label="Email мастера ${esc(a.name)} для входа" data-d="artistEmail:${i}" maxlength="80" value="${esc(a.email || "")}" placeholder="Email для входа (необязательно)">
    </div>`).join("")}
    <p class="tiny muted">Нажмите на кружок, чтобы поставить фото мастера. Мастер может сменить своё фото сам во вкладке «Аккаунт».</p>
    <p class="tiny muted">Ссылка для входа мастеров: <b style="user-select:all;word-break:break-all">${esc(SID ? salonUrl(SID, true) : location.origin + location.pathname + "#owner")}</b></p>
    <button class="btn sm ghost" data-act="add-artist">${ICON.plus}Добавить мастера</button>
  </div>
  <div class="card stack">
    <h2 class="h2">Услуги и цены</h2>
    ${D.services.map((s, i) => `<div class="ed">
      <input class="inp" id="svn${i}" aria-label="Название услуги" data-d="svc:${i}:name" maxlength="60" value="${esc(s.name)}" placeholder="Название услуги">
      <div class="ed-row">
        <label class="mini span-all" for="svc${i}">Категория<select class="inp" id="svc${i}" data-d="svc:${i}:cat">${CATS.map(c => `<option ${c.id === s.cat ? "selected" : ""}>${esc(c.id)}</option>`).join("")}</select></label>
        <label class="mini" for="svp${i}">Цена, ₽<input class="inp" id="svp${i}" data-d="svc:${i}:price" inputmode="numeric" value="${esc(s.price)}"></label>
        <label class="mini" for="svd${i}">Время<select class="inp" id="svd${i}" data-d="svc:${i}:dur">${durOptions(s.dur)}</select></label>
        <button class="icon-btn" data-act="del-svc" data-v="${i}" aria-label="Удалить услугу ${esc(s.name)}">${ICON.trash}</button>
      </div>
      ${D.artists.length > 1 ? (S.mpOpen && S.mpOpen[s.id]) || hasMasterPrices(s) && S.mpOpen?.[s.id] !== false
        ? `<div class="mp-box">${D.artists.map(a => `<label class="mp-row" for="mp${i}_${esc(a.id)}"><span>${esc(a.name || "Мастер")}</span>
            <input class="inp" id="mp${i}_${esc(a.id)}" data-d="svcmp:${i}:${esc(a.id)}" inputmode="numeric" placeholder="как обычно" value="${esc((s.mp || {})[a.id] || "")}"></label>`).join("")}
            <span class="tiny muted">Пусто — мастер работает по обычной цене.</span>
            <button class="linkbtn" style="align-self:flex-start;padding-left:0" data-act="mp-toggle" data-v="${esc(s.id)}">Скрыть цены мастеров</button></div>`
        : `<button class="linkbtn" style="align-self:flex-start;padding-left:0" data-act="mp-toggle" data-v="${esc(s.id)}">Своя цена у мастера ›</button>` : ""}
      </div>`).join("")}
    <button class="btn sm ghost" data-act="add-svc">${ICON.plus}Добавить услугу</button>
  </div>
  ${installBlock()}
  <div class="card stack">
    <h2 class="h2">Аккаунт</h2>
    <p class="small muted">Вы вошли как ${esc(USER.email || "")}</p>
    <a class="btn sm ghost" href="#">Открыть приложение для клиентов</a>
    <button class="btn danger" data-act="logout">Выйти из кабинета</button>
  </div>`;
}
/* ---------- cabinet: masters' photos ---------- */
function vWorks() {
  const own = ROLE === "master";
  let ws = own ? ALL_WORKS.filter(w => w.artist === MY_ARTIST) : ALL_WORKS;
  if (!own && S.gMaster !== "all") ws = ws.filter(w => w.artist === S.gMaster);
  const D = S.workDraft;
  const catsWithSvc = CATS.filter(c => SET.services.some(s => s.cat === c.id));
  const form = D ? `<div class="card stack">
      <h2 class="h2">Новое фото работы</h2>
      <div class="photo-full" style="aspect-ratio:auto;max-height:260px"><img src="${esc(D.thumb)}" alt="Выбранное фото" style="max-height:260px;object-fit:contain;background:var(--soft)"></div>
      <label class="field" for="wTitle">Подпись (необязательно)<input id="wTitle" maxlength="60" value="${esc(D.title)}" placeholder="Например: френч с дизайном"></label>
      <label class="field" for="wCat">Услуга<select id="wCat">${(catsWithSvc.length ? catsWithSvc : CATS).map(c => `<option ${c.id === D.cat ? "selected" : ""}>${esc(c.id)}</option>`).join("")}</select></label>
      ${own ? "" : `<label class="field" for="wArtist">Мастер<select id="wArtist">${SET.artists.map(a => `<option value="${esc(a.id)}" ${a.id === D.artist ? "selected" : ""}>${esc(a.name)}</option>`).join("")}</select></label>`}
      <div class="btns"><button class="btn sm ghost" data-act="w-cancel">Отмена</button><button class="btn sm" data-act="w-publish" ${S.wBusy ? "disabled" : ""}>${S.wBusy ? "Загружаем…" : "Опубликовать"}</button></div>
    </div>`
    : `<button class="btn" data-act="w-pick" ${S.wBusy ? "disabled" : ""}>${ICON.camera}${S.wBusy ? "Обрабатываем фото…" : "Добавить фото работы"}</button>`;
  const tile = w => {
    const armed = S.armed === "w:" + w.id;
    return `<div class="wtile ${w.hidden ? "whidden" : ""}"><img src="${esc(w.thumb)}" alt="${esc(w.title || "Работа")}" loading="lazy">
      <span class="wtag">${esc(own ? (w.cat || "") : artistName(w.artist))}${w.hidden ? " · скрыто" : ""}</span>
      ${own ? "" : `<button class="wbtn" style="left:4px" data-act="w-hide" data-v="${esc(w.id)}" aria-label="${w.hidden ? "Показать клиентам" : "Скрыть от клиентов"}">${w.hidden ? ICON.eyeOff : ICON.eye}</button>`}
      ${armed ? `<button class="wdel" data-act="w-del" data-v="${esc(w.id)}">Удалить?</button>`
        : `<button class="wbtn" style="right:4px;color:var(--bad)" data-act="w-arm" data-v="${esc(w.id)}" aria-label="Удалить фото">${ICON.trash}</button>`}</div>`;
  };
  const seg = `<div class="seg" role="group" aria-label="Раздел"><button data-act="wtab" data-v="photos" aria-pressed="${S.wTab !== "reviews"}">Фото</button><button data-act="wtab" data-v="reviews" aria-pressed="${S.wTab === "reviews"}">Отзывы${(own ? revOf(MY_ARTIST) : REVIEWS).length ? " · " + (own ? revOf(MY_ARTIST) : REVIEWS).length : ""}</button></div>`;
  if (S.wTab === "reviews") return `<h1 class="h1" style="font-size:26px">${own ? "Мои отзывы" : "Отзывы"}</h1>${seg}${vReviewsAdmin()}`;
  return `<h1 class="h1" style="font-size:26px">${own ? "Мои работы" : "Работы мастеров"}</h1>${seg}
  <p class="small muted" style="margin-top:-10px">${ws.filter(w => !w.hidden).length} фото видят клиенты</p>
  ${form}
  ${!own && SET.artists.length > 1 ? chips("g-master", [["all", "Все мастера"]].concat(SET.artists.map(a => [a.id, a.name])), S.gMaster, "Мастер") : ""}
  ${ws.length ? `<div class="wgrid">${ws.map(tile).join("")}</div>` : `<div class="empty">Фото пока нет. Нажмите «Добавить фото работы».</div>`}
  <p class="tiny muted">${own ? "Фото сразу появятся в «Наших работах» у клиентов. Владелец салона может скрыть любое фото." : "Фото мастеров сразу видны клиентам. Значок глаза скрывает или показывает фото."}</p>`;
}

/* ---------- cabinet: owner's report ---------- */
function periodRange(p) {
  const t = todayKey(), d = dateOf(t);
  if (p === "day") return [t, t, "Сегодня, " + shortDate(t)];
  if (p === "week") { const from = addDays(t, -((d.getDay() + 6) % 7)), to = addDays(from, 6); const a = dateOf(from), b = dateOf(to);
    return [from, to, a.getDate() + (a.getMonth() === b.getMonth() ? "" : " " + MONG[a.getMonth()]) + "–" + b.getDate() + " " + MONG[b.getMonth()]]; }
  const from = t.slice(0, 8) + "01", to = keyOf(new Date(d.getFullYear(), d.getMonth() + 1, 0));
  return [from, to, MONN[d.getMonth()] + " " + d.getFullYear()];
}
async function loadReport() {
  const [from, to] = periodRange(S.repPeriod), key = S.repPeriod + from;
  // a master's own report comes from her own bookings (already loaded) — only her money
  if (ROLE === "master") { REPORT = { key, loading: false, list: MASTER_ALL.filter(b => b.artist === MY_ARTIST && b.date >= from && b.date <= to) }; renderSoon(true); return; }
  if (ROLE !== "owner") return;
  REPORT = { key, loading: true, list: REPORT && REPORT.key === key ? REPORT.list : [] };
  renderSoon(true);
  try {
    const q = await getDocs(query(SC("bookings"), where("date", ">=", from), where("date", "<=", to)));
    REPORT = { key, loading: false, list: q.docs.map(d => Object.assign({ id: d.id }, d.data())) };
  } catch (e) { REPORT = { key, loading: false, list: [], err: true }; }
  renderSoon(true);
}
const isDone = b => b.status === "confirmed" && (b.date < todayKey() || (b.date === todayKey() && b.start + b.dur <= nowMin()));
const sumTotal = l => l.reduce((n, b) => n + Number(b.total || 0), 0);
const hoursTxt = m => (Math.round(m / 6) / 10).toLocaleString("ru-RU");
function vReport() {
  const [, , label] = periodRange(S.repPeriod);
  const L = (REPORT && REPORT.list) || [];
  const done = L.filter(isDone), canc = L.filter(b => b.status === "cancelled");
  const planned = L.filter(b => (b.status === "confirmed" || b.status === "pending") && !isDone(b));
  const total = sumTotal(done);
  const seg = [["day", "Сегодня"], ["week", "Неделя"], ["month", "Месяц"]].map(([id, l]) => `<button data-act="rep-period" data-v="${id}" aria-pressed="${S.repPeriod === id}">${l}</button>`).join("");
  const cards = SET.artists.map(a => {
    const mine = done.filter(b => b.artist === a.id), r = sumTotal(mine), n = mine.length;
    const cnt = {}; mine.forEach(b => (b.serviceNames || []).forEach(x => { cnt[x] = (cnt[x] || 0) + 1; }));
    const top = Object.keys(cnt).sort((x, y) => cnt[y] - cnt[x])[0];
    const pct = total ? Math.round(r / total * 100) : 0;
    return `<button class="card stack repcard" data-act="rep-master" data-v="${esc(a.id)}">
      <div class="row">${avatar(a.id, a.name, 44)}
        <div style="flex:1;min-width:0;text-align:left"><b>${esc(a.name)}</b><div class="tiny muted">${n} ${plural(n, ["клиент", "клиента", "клиентов"])} · ${pct}% выручки</div></div>
        <b class="price">${rub(r)}</b></div>
      <div class="bar8"><i style="width:${pct}%"></i></div>
      <div class="tiny muted" style="display:flex;justify-content:space-between;gap:8px"><span>${top ? esc(top) + " ×" + cnt[top] : "Нет выполненных записей"}</span><span style="color:var(--accent);font-weight:700">Подробнее ›</span></div>
    </button>`;
  }).join("");
  return `<h1 class="h1" style="font-size:26px">Отчёт</h1>
  <div class="seg" role="group" aria-label="Период">${seg}</div>
  <div class="small muted" style="font-weight:600;margin-top:-8px">${esc(label)}${REPORT && REPORT.loading ? " · обновляем…" : ""}</div>
  ${REPORT && REPORT.err ? `<div class="note">${ICON.info}<span>Не удалось загрузить отчёт. Проверьте интернет.</span></div>` : ""}
  <div class="stat3">
    <div class="card"><span class="tiny muted">Клиентов</span><b>${done.length}</b></div>
    <div class="card"><span class="tiny muted">Выручка</span><b>${rub(total)}</b></div>
    <div class="card"><span class="tiny muted">Отмены</span><b style="color:var(--bad)">${canc.length}</b></div>
  </div>
  ${planned.length ? `<p class="small muted">Ещё запланировано: ${planned.length} ${plural(planned.length, ["запись", "записи", "записей"])} на ${rub(sumTotal(planned))}</p>` : ""}
  <h2 class="h2">По мастерам</h2>
  ${cards}
  <p class="tiny muted">Считаются подтверждённые записи, время которых уже прошло.</p>`;
}
function vReportMaster(mine) {
  const id = mine ? MY_ARTIST : S.repMaster;
  const a = SET.artists.find(x => x.id === id);
  const [, , label] = periodRange(S.repPeriod);
  const L = ((REPORT && REPORT.list) || []).filter(b => b.artist === id);
  const done = L.filter(isDone), canc = L.filter(b => b.status === "cancelled");
  const svc = {};
  done.forEach(b => (b.services || []).forEach((id, i) => {
    const s = SET.services.find(x => x.id === id), nm = (b.serviceNames || [])[i] || (s && s.name) || "Услуга";
    svc[nm] = svc[nm] || { n: 0, r: 0 }; svc[nm].n++; svc[nm].r += s ? priceFor(s, b.artist) : Number(b.total || 0) / Math.max(1, (b.services || []).length);
  }));
  const rows = done.concat(canc).sort((x, y) => (y.date + hm(y.start)).localeCompare(x.date + hm(x.start)));
  const mins = done.reduce((n, b) => n + Number(b.dur || 0), 0);
  const seg = [["day", "Сегодня"], ["week", "Неделя"], ["month", "Месяц"]].map(([v, l]) => `<button data-act="rep-period" data-v="${v}" aria-pressed="${S.repPeriod === v}">${l}</button>`).join("");
  const planned = L.filter(b => (b.status === "confirmed" || b.status === "pending") && !isDone(b));
  return `${mine ? `<h1 class="h1" style="font-size:26px">Мой заработок</h1>
  <div class="seg" role="group" aria-label="Период">${seg}</div>
  <div class="small muted" style="font-weight:600;margin-top:-8px">${esc(label)}${planned.length ? " · ещё запланировано: " + planned.length + " на " + rub(sumTotal(planned)) : ""}</div>` : header("Отчёт · " + label, a ? a.name : "Мастер", "report")}
  <div class="stat3">
    <div class="card"><span class="tiny muted">Клиентов</span><b>${done.length}</b></div>
    <div class="card"><span class="tiny muted">${mine ? "Заработано" : "Выручка"}</span><b>${rub(sumTotal(done))}</b></div>
    <div class="card"><span class="tiny muted">Часов</span><b>${hoursTxt(mins)}</b></div>
  </div>
  ${Object.keys(svc).length ? `<div class="card sum"><h2 class="h2">Услуги</h2>${Object.keys(svc).sort((x, y) => svc[y].n - svc[x].n).map(k => `<div class="sumrow"><span>${esc(k)}</span><span class="price"><b>${svc[k].n}</b> · ${rub(svc[k].r)}</span></div>`).join("")}</div>` : ""}
  <h2 class="h2">Выполненные записи</h2>
  ${rows.length ? `<div class="card" style="padding:0">${rows.map((b, i) => `<div class="row" style="padding:12px 14px;${i ? "border-top:1px solid var(--line)" : ""}">
      <div style="width:44px;text-align:center;flex-shrink:0"><b class="price">${dateOf(b.date).getDate()}</b><div class="tiny muted">${MONS[dateOf(b.date).getMonth()]}</div></div>
      <div style="flex:1;min-width:0"><b class="small">${esc(b.name)}</b><div class="tiny ${b.status === "cancelled" ? "" : "muted"}" ${b.status === "cancelled" ? 'style="color:var(--bad)"' : ""}>${hm(b.start)} · ${b.status === "cancelled" ? "Отменена" : esc((b.serviceNames || []).join(", "))}</div></div>
      <b class="price small" ${b.status === "cancelled" ? 'style="color:var(--faint);text-decoration:line-through"' : ""}>${rub(b.total)}</b></div>`).join("")}</div>`
    : `<div class="empty">За этот период выполненных записей нет.</div>`}`;
}

function ownerTabs() {
  const n = PENDING.length + NEWB.filter(b => b.status === "confirmed" && (b.created || 0) > inboxSeen).length;
  const t = (v, ic, lab) => `<button class="tab" data-act="go" data-v="${v}" ${S.view === v || (v === "report" && S.view === "reportMaster") || (v === "clients" && (S.view === "client" || S.view === "clientNew" || S.view === "clientImport")) ? 'aria-current="page"' : ""}>${ic}${lab}${v === "inbox" && n ? `<span class="badge">${n}</span>` : ""}</button>`;
  return `<nav class="tabs" aria-label="Меню салона">${t("journal", ICON.cal, "Журнал")}${t("inbox", ICON.bell, "Новые")}${t("clients", ICON.users, "Клиенты")}${t("report", ICON.chart, ROLE === "master" ? "Заработок" : "Отчёт")}${t("works", ICON.grid, "Работы")}${t("settings", ICON.gear, ROLE === "master" ? "Аккаунт" : "Настройки")}</nav>`;
}
function saveBar() {
  if (!S.dirty) return "";
  return `<div class="savebar wrap"><span>${S.draftErr ? `<span style="color:var(--bad)">${esc(S.draftErr)}</span>` : "Есть несохранённые изменения"}</span>
    <button class="btn sm ghost" data-act="discard">Отменить</button><button class="btn sm" data-act="save-settings" ${S.saving ? "disabled" : ""}>${S.saving ? "Сохраняем…" : "Сохранить"}</button></div>`;
}

/* ================= booking sheet (owner) ================= */
function findBooking(id) {
  return JDAY.find(b => b.id === id) || PENDING.find(b => b.id === id) || RECENT.find(b => b.id === id) || MASTER_ALL.find(b => b.id === id);
}
function sheet() {
  const b = findBooking(S.sheet);
  if (!b) return "";
  const edit = canEditBooking(b);
  const others = (ROLE === "owner" || (edit && shareEdit())) ? SET.artists.filter(a => a.id !== b.artist && artistFree(a.id, b.date, b.start, b.dur, b.id)) : [];
  return `<div class="scrim"><div class="sheet wrap" role="dialog" aria-modal="true" aria-label="Детали записи">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
      <div><span class="when">${esc(shortDate(b.date))} · ${hm(b.start)}–${hm(b.start + b.dur)}</span><h2 class="h1" style="font-size:22px;margin-top:4px">${esc(b.name)}</h2>
      ${b.phone ? `<div class="small muted" style="user-select:all">${esc(b.phone)}</div>` : ""}</div>
      ${b.status === "pending" ? '<span class="pill p-wait">Новая</span>' : b.status === "cancelled" ? '<span class="pill p-off">Отменена</span>' : '<span class="pill p-ok">Подтверждена</span>'}
    </div>
    ${b.phone ? `<a class="call" href="tel:${esc(b.phone.replace(/[^\d+]/g, ""))}">${ICON.phone}Позвонить клиенту</a>` : ""}
    <div class="card sum">
      <div class="sumrow"><span class="muted">Услуги</span><span>${esc((b.serviceNames || []).join(", "))}</span></div>
      <div class="sumrow"><span class="muted">Мастер</span><span>${esc(artistName(b.artist))}</span></div>
      <div class="sumrow"><span class="muted">Итого</span><span class="price">${rub(b.total)}</span></div>
      ${b.note ? `<div class="sumrow"><span class="muted">Комментарий</span><span>«${esc(b.note)}»</span></div>` : ""}
    </div>
    ${b.status !== "cancelled" && others.length ? `<label class="field" for="moveArtist">Передать другому мастеру
      <select id="moveArtist" data-move="${esc(b.id)}"><option value="">Оставить: ${esc(artistName(b.artist))}</option>${others.map(a => `<option value="${esc(a.id)}">${esc(a.name)}</option>`).join("")}</select></label>` : ""}
    ${!edit ? `<p class="small muted">Только просмотр — изменить запись может мастер ${esc(artistName(b.artist))} или владелец.</p>` : ""}
    ${edit && b.status !== "cancelled" ? `<button class="btn ghost" data-act="rs-open" data-v="${esc(b.id)}">${ICON.cal || ""}Изменить запись: время, услуги, длительность</button>` : ""}
    ${!edit ? "" : b.status === "pending" ? `<button class="btn" data-act="accept" data-v="${esc(b.id)}">Подтвердить запись</button>` : clientMsgButtons(b)}
    ${edit && b.status !== "cancelled" ? (S.armed === b.id
      ? `<div class="btns"><button class="btn sm solid-danger" data-act="cancel" data-v="${esc(b.id)}">Да, отменить</button><button class="btn sm ghost" data-act="disarm">Не отменять</button></div>`
      : `<button class="btn danger" data-act="arm" data-v="${esc(b.id)}">Отменить запись</button>`) : ""}
    <button class="btn ghost" data-act="close">Закрыть</button>
  </div></div>`;
}

/* ================= render ================= */
let raf = 0, deferred = false;
function renderSoon(background) {
  if (background) {
    const a = document.activeElement;
    const typing = a && (a.tagName === "INPUT" || a.tagName === "SELECT" || a.tagName === "TEXTAREA") && (main.contains(a) || overlay.contains(a));
    if (typing || (S.mode === "owner" && S.view === "settings" && S.dirty)) { deferred = true; refreshChrome(); return; }
  }
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(() => render(true));
}
document.addEventListener("focusout", () => { if (deferred) { deferred = false; setTimeout(() => { if (!document.activeElement || document.activeElement === document.body) render(true); else deferred = true; }, 0); } });

function refreshChrome() {
  if (SET) topBar();
  if (S.mode === "owner" && USER && ROLE && !ownerDenied && SET) bar.innerHTML = S.view === "resched" && S.rs ? barResched() : S.view === "manual" && S.mb ? barManual() : (S.view === "settings" && ROLE === "owner" ? saveBar() : "") + ownerTabs();
}

function render(keepScroll) {
  topBar();
  let html = "", b = "";
  if (S.mode === "client") {
    if (!setLoaded) html = loading();
    else if (SID && metaLoaded && !META) html = vSalonMissing();
    else if (SID && META && !SUB().active && ["home", "services", "artist", "time", "details", "gallery", "photo", "reviews"].includes(S.view || "home")) { html = vClientPaused(); b = clientTabs(); }
    else if (!SET) html = `<div class="note">${ICON.info}<span>${setError ? "Не удалось загрузить данные салона. Проверьте подключение к интернету." : "Салон ещё не настроен. Владельцу нужно войти в кабинет салона."}</span></div><a class="linkbtn" href="#owner" style="align-self:center;text-decoration:none">Вход для владельца салона</a>`;
    else switch (S.view) {
      case "services": html = vServices(); b = barServices(); break;
      case "artist": html = vArtist(); b = barArtist(); break;
      case "time": html = vTime(); b = barTime(); break;
      case "details": html = vDetails(); b = barDetails(); break;
      case "bookings": html = vBookings(); b = clientTabs(); break;
      case "gallery": html = vGallery(); b = barGallery(); break;
      case "photo": html = vPhoto(); b = barPhoto(); break;
      case "reviews": html = vReviews(); b = barReviews(); break;
      case "review": html = vReviewForm(); b = MY[S.revBooking] ? barReviewForm() : clientTabs(); break;
      default: html = vHome(); b = barHome() + clientTabs();
    }
  } else {
    if (!authReady) html = loading();
    else if (!USER) html = vLogin();
    else if (needVerify) html = vVerify();
    else if (roleChecking) html = loading();
    else if (noStaff) html = vNoStaff();
    else if (ownerDenied || !ROLE) html = vDenied();
    else if (!setLoaded || !SET || (SID && !metaLoaded)) html = loading();
    else if (SID && !isAdmin() && !SUB().active && S.view !== "sub") html = vLocked();
    else if (SID && !isAdmin() && !SUB().active) html = vSub();
    else {
      switch (S.view) {
        case "salons": html = isAdmin() ? vSalons() : vJournal(); break;
        case "salonNew": html = isAdmin() ? vSalonNew() : vJournal(); break;
        case "salonAccess": html = isAdmin() ? vSalonAccess() : vJournal(); break;
        case "billing": html = isAdmin() ? vBilling() : vJournal(); break;
        case "sub": html = ROLE === "owner" ? vSub() : vJournal(); break;
        case "notif": html = vNotif(); break;
        case "clients": html = vClients(); break;
        case "admins": html = isRealOwner() ? vAdmins() : vJournal(); break;
        case "client": html = vClient(); break;
        case "clientNew": html = vClientNew(); break;
        case "clientImport": html = ROLE === "owner" ? vClientImport() : vClients(); break;
        case "tpl": html = ROLE === "owner" ? vTpl() : vJournal(); break;
        case "resched": html = S.rs ? vResched() : vJournal(); break;
        case "break": html = S.brk ? vBreak() : vJournal(); break;
        case "inbox": html = vInbox(); break;
        case "works": html = vWorks(); break;
        case "manual": html = S.mb ? vManual() : vJournal(); break;
        case "report": html = ROLE === "owner" ? vReport() : vReportMaster(true); break;
        case "reportMaster": html = ROLE === "owner" ? vReportMaster() : vJournal(); break;
        case "settings": html = ROLE === "master" ? vMasterAccount() : vSettings(); break;
        default: html = vJournal();
      }
      b = S.view === "resched" && S.rs ? barResched() : S.view === "manual" && S.mb ? barManual() : (S.view === "settings" && ROLE === "owner" ? saveBar() : "") + ownerTabs();
    }
  }
  const y = window.scrollY;
  main.innerHTML = html; bar.innerHTML = b;
  overlay.innerHTML = (S.mode === "owner" && S.sheet && SET && USER) ? sheet() : "";
  main.style.paddingBottom = (bar.offsetHeight + 24) + "px";
  window.scrollTo(0, keepScroll ? y : 0);
}
function go(view) { if (view !== "tpl") S.tplDraft = null; S.view = view; S.armed = null; S.sheet = null; if (view !== "bookings") S.lastBooked = false; if (view === "report") loadReport(); render(false); }

window.addEventListener("hashchange", () => {
  const owner = location.hash === "#owner";
  S.mode = owner ? "owner" : "client";
  S.view = owner ? (PENDING.length ? "inbox" : "journal") : "home";
  S.sheet = null; S.armed = null;
  render(false);
});

/* ================= actions ================= */
const errText = e => (e && e.code === "permission-denied") ? "Нет прав на это действие." : "Не удалось сохранить. Проверьте интернет и попробуйте ещё раз.";

document.addEventListener("click", async e => {
  const el = e.target.closest("[data-act]");
  if (!el) return;
  const v = el.dataset.v;
  switch (el.dataset.act) {
    case "go":
      if (v === "artist" && !S.sel.length) return;
      if (v === "details" && S.time == null) return;
      if (v === "settings" || S.view === "settings") { if (S.dirty && v !== "settings") { toast("Сначала сохраните или отмените изменения"); return; } S.draft = null; S.dirty = false; S.draftErr = ""; }
      go(v); break;
    case "cat": S.cat = v; if (S.view !== "services") { S.sel = []; S.artist = "any"; S.date = null; S.time = null; S.tried = false; } go("services"); break;
    case "tab-cat": S.cat = v; render(true); break;
    case "w-pick": pickWorkPhoto(); break;
    case "reviews": S.revMaster = v; go("reviews"); break;
    case "rev-new": S.revBooking = v; S.revDraft = { rating: 0, text: "" }; S.tried = false; go("review"); break;
    case "rev-star": if (S.revDraft) { S.revDraft.rating = +v; render(true); } break;
    case "rev-send": sendReview(); break;
    case "wtab": S.wTab = v; S.revEdit = null; S.armed = null; render(true); break;
    case "rev-edit": { const r = REVIEWS.find(x => x.id === v); if (r && ROLE === "owner") { S.revEdit = { id: r.id, rating: r.rating, text: r.text || "" }; S.armed = null; render(true); } break; }
    case "rev-estar": if (S.revEdit) { S.revEdit.rating = +v; render(true); } break;
    case "rev-ecancel": S.revEdit = null; render(true); break;
    case "rev-esave": saveReviewEdit(); break;
    case "rev-arm": S.armed = "r:" + v; S.revEdit = null; render(true); break;
    case "rev-del": deleteReview(v); break;
    case "av-pick": if (!S.avBusy && (ROLE === "owner" || v === MY_ARTIST)) pickImage(f => saveAvatar(v, f)); break;
    case "svc": S.sel = S.sel.includes(v) ? S.sel.filter(x => x !== v) : S.sel.concat(v); S.time = null; S.date = null; render(true); break;
    case "artist": S.artist = v; S.time = null; S.date = null; render(true); break;
    case "date": S.date = v; S.time = null; render(true); break;
    case "time": S.time = Number(v); render(true); break;
    case "book": book(); break;
    case "btab": S.bookTab = v; render(true); break;
    case "arm": S.armed = v; render(true); break;
    case "disarm": S.armed = null; render(true); break;
    case "cancel": cancelBooking(v); break;
    case "accept":
      try { await updateDoc(SD("bookings", v), { status: "confirmed", updated: Date.now() }); pushEvent(v, "confirm", "staff"); S.sheet = v; toast("Запись подтверждена. Сообщите клиенту."); }
      catch (err) { toast(errText(err)); }
      render(true); break;
    case "open": S.sheet = v; S.armed = null; render(true); break;
    case "close": S.sheet = null; S.armed = null; render(true); break;
    case "adm-scope": if (S.adm) { S.adm.scope = v; render(true); } break;
    case "adm-add": addAdmin(); break;
    case "adm-arm": S.armed = "adm:" + v; render(true); break;
    case "adm-del": try { await deleteDoc(doc(db, "admins", v)); toast("Права администратора убраны"); } catch (err) { toast(errText(err)); } S.armed = null; render(true); break;
    case "cl-open": S.clKey = v; S.clNote = S.clName = S.clSurname = S.clPhone = null; go("client"); break;
    case "cl-new": S.cn = null; S.cnErr = ""; go("clientNew"); break;
    case "imp-open": if (ROLE === "owner") { S.imp = {}; go("clientImport"); } break;
    case "imp-pick": pickFile(".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv", async f => {
      S.imp = { busy: "Читаем файл…" }; render(true);
      try { const list = await readDikidi(f); S.imp = list.length ? { list } : { err: "В файле не найдено ни одного клиента." }; }
      catch (err) { S.imp = { err: err.message || "Не удалось прочитать файл." }; }
      render(true); }); break;
    case "imp-save": if (S.imp && S.imp.list && !S.imp.busy) { try { await saveImport(); toast("Клиенты загружены"); } catch (err) { S.imp = { list: S.imp.list, err: errText(err) }; toast(errText(err)); } render(true); } break;
    case "cl-save": { const c = clientList().find(x => x.key === S.clKey); if (!c) break;
      const parts = c.name.trim().split(/\s+/), fn0 = parts.shift() || "", sn0 = parts.join(" ");
      const nm = fullName(S.clName != null ? S.clName : fn0, S.clSurname != null ? S.clSurname : sn0);
      try { await saveClientCard(c.key, { name: nm || c.name, phone: (S.clPhone != null ? S.clPhone : c.phone).trim().slice(0, 25), note: (S.clNote != null ? S.clNote : c.note).trim().slice(0, 1000) });
        S.clNote = S.clName = S.clSurname = S.clPhone = null; toast("Сохранено"); } catch (err) { toast(errText(err)); } render(true); break; }
    case "cn-save": { const N = S.cn; const nm = fullName(N.name, N.surname); S.cnErr = "";
      if (!N.name.trim()) { S.cnErr = "Укажите имя"; render(true); break; }
      const key = clientKey(nm, N.phone); S.saving = true; render(true);
      try { await saveClientCard(key, { name: nm, phone: N.phone.trim().slice(0, 25), note: N.note.trim().slice(0, 1000), created: Date.now() }); toast("Клиент сохранён"); S.saving = false; S.cn = null; S.clKey = key; go("client"); }
      catch (err) { S.saving = false; S.cnErr = errText(err); render(true); } break; }
    case "cl-book": { const c = clientList().find(x => x.key === v); if (!c) break;
      const fav = Object.keys(c.artists).sort((a, b) => c.artists[b] - c.artists[a])[0];
      S.mb = { artist: ROLE === "master" ? MY_ARTIST : (fav && SET.artists.some(a => a.id === fav) ? fav : SET.artists.length === 1 ? SET.artists[0].id : null), sel: [], date: todayKey(), time: null, name: c.name, surname: "", phone: c.phone, note: "", clientKey: c.key }; S.tried = false; go("manual"); break; }
    case "mb-pick": { const c = clientList().find(x => x.key === v); if (!c || !S.mb) break; Object.assign(S.mb, { name: c.name, surname: "", phone: c.phone, clientKey: c.key }); render(true); break; }
    case "mb-unpick": if (S.mb) { Object.assign(S.mb, { name: "", surname: "", phone: "", clientKey: null }); render(true); } break;
    case "mp-toggle": { S.mpOpen = Object.assign({}, S.mpOpen || {}); const sv = (S.draft || SET).services.find(x => x.id === v); const open = (S.mpOpen[v]) || (hasMasterPrices(sv || {}) && S.mpOpen[v] !== false); S.mpOpen[v] = !open; render(true); break; }
    case "d-toggle": if (S.draft) { S.draft[v] = !S.draft[v]; if (v === "shareView" && !S.draft.shareView) S.draft.shareEdit = false; S.dirty = true; S.draftErr = ""; render(true); } break;
    case "tpl-tab": { const e = document.getElementById("tplText"); if (e && S.tplDraft) S.tplDraft[S.tplTab || "ok"] = e.value; S.tplTab = v; render(true); break; }
    case "tpl-ins": { const e = document.getElementById("tplText"); if (!e || !S.tplDraft) break; const a = e.selectionStart ?? e.value.length, z = e.selectionEnd ?? a;
      e.value = e.value.slice(0, a) + v + e.value.slice(z); S.tplDraft[S.tplTab || "ok"] = e.value; render(true);
      const e2 = document.getElementById("tplText"); if (e2) { e2.focus(); e2.setSelectionRange(a + v.length, a + v.length); } break; }
    case "tpl-reset": if (S.tplDraft) { S.tplDraft[S.tplTab || "ok"] = TPL_DEFAULT[S.tplTab || "ok"]; render(true); } break;
    case "tpl-save": { const e = document.getElementById("tplText"); if (e && S.tplDraft) S.tplDraft[S.tplTab || "ok"] = e.value; saveTpl(); break; }
    case "rs-open": { const b = findBooking(v); if (!b || !canEditBooking(b)) break; const sel0 = (b.services || []).filter(svcById);
      S.rs = { id: b.id, date: b.date < todayKey() ? todayKey() : b.date, time: b.date < todayKey() ? null : b.start, dur: b.dur, oldDate: b.date, oldTime: b.start, oldDur: b.dur, sel: sel0.slice(), oldSel: sel0.join() }; S.sheet = null; go("resched"); break; }
    case "brk-new": S.brk = { artist: ROLE === "master" ? MY_ARTIST : (SET.artists.length === 1 ? SET.artists[0].id : null), date: S.jDate < todayKey() ? todayKey() : S.jDate,
      start: Math.min(Math.max(SET.open, 13 * 60), SET.close - 60), dur: 60, allDay: false, label: "", rep: 1 }; S.brkErr = ""; go("break"); break;
    case "brk-artist": if (S.brk) { S.brk.artist = v; render(true); } break;
    case "brk-all": if (S.brk) { S.brk.allDay = !S.brk.allDay; render(true); } break;
    case "brk-save": saveBreak(); break;
    case "brk-arm": S.armed = "brk:" + v; render(true); setTimeout(() => { if (S.armed === "brk:" + v) { S.armed = null; render(true); } }, 4000); break;
    case "brk-del": try { await deleteDoc(SD("busy", v)); toast("Перерыв удалён"); } catch (err) { toast(errText(err)); } S.armed = null; render(true); break;
    case "rs-time": if (S.rs) { S.rs.time = +v; render(true); } break;
    case "rs-svc": if (S.rs) { const R = S.rs; R.sel = R.sel.includes(v) ? R.sel.filter(x => x !== v) : R.sel.concat(v);
      const d = R.sel.filter(svcById).reduce((n, id) => n + svcById(id).dur, 0); if (d) R.dur = d; render(true); } break;
    case "rs-save": saveResched(); break;
    case "push-on": staffPushOn(true).then(ok => { if (ok) toast("Уведомления включены"); }); break;
    case "push-off": staffPushOff().then(() => toast("Уведомления выключены на этом телефоне")); break;
    case "push-later": lsSet("nb-push-later", Date.now() + 7 * 864e5); render(true); break;
    case "push-test": { const sub = pushSub || await getPushSub(false); if (!sub) { toast("Сначала включите уведомления"); break; }
      const r = await pushPost("/test", { endpoint: sub.endpoint }); toast(r.ok ? "Отправлено — сейчас придёт уведомление" : "Не удалось отправить. Нажмите «Включить» ещё раз."); break; }
    case "np": { const P = notifPrefs(); P[v] = !P[v]; lsSet("nb-notif-prefs", P); render(true); if (v !== "snd" && (pushReady || lsGet(lsk("nb-push-on"), false))) staffPushOn(false); break; }
    case "remind-yes": clientRemind(v, true).then(ok => { if (ok) toast("Напомним накануне визита"); }); break;
    case "remind-no": lsSet(lsk("nb-remind-no"), true); render(true); break;
    case "sal-open": { const sid = v === "main" ? "" : v; location.href = salonUrl(sid, true); break; }
    case "sal-acc": S.accSid = v; S.acc = null; go("salonAccess"); break;
    case "sal-ok": confirmPayment(v, true); break;
    case "sal-no": confirmPayment(v, false); break;
    case "ns-copy": if (S.ns) { S.ns.copy = !S.ns.copy; render(true); } break;
    case "ns-save": createSalon(); break;
    case "ac-email": salonAdminUpdate("email"); break;
    case "ac-price": salonAdminUpdate("price"); break;
    case "ac-month": salonAdminUpdate("month"); break;
    case "ac-free": salonAdminUpdate("free"); break;
    case "ac-pause": salonAdminUpdate("pause"); break;
    case "copy": try { await navigator.clipboard.writeText(v); toast("Ссылка скопирована"); } catch (err) { toast("Не удалось скопировать — выделите ссылку и скопируйте"); } break;
    case "bi-qr": pickImage(async f => { try { const img = await loadImg(f); S.bill.qr = toQr(img); render(true); } catch (err) { toast("Не удалось открыть картинку"); } }); break;
    case "bi-save": saveBilling(); break;
    case "sub-n": S.subN = +v; render(true); break;
    case "sub-claim": claimPayment(); break;
    case "mb-new": loadClientBookings(); S.mb = { artist: ROLE === "master" ? MY_ARTIST : (SET.artists.length === 1 ? SET.artists[0].id : null), sel: [], date: S.jDate < todayKey() ? todayKey() : S.jDate, time: null, name: "", phone: "", note: "" }; S.tried = false; go("manual"); break;
    case "mb-artist": if (S.mb) { S.mb.artist = v; if (!S.mb.picked) S.mb.time = null; render(true); } break;
    case "mb-svc": if (S.mb) { S.mb.sel = S.mb.sel.includes(v) ? S.mb.sel.filter(x => x !== v) : S.mb.sel.concat(v); if (!S.mb.picked) S.mb.time = null; render(true); } break;
    case "mb-at": { const [aid, t] = v.split("|");
      if (ROLE === "master" && aid !== MY_ARTIST) break;
      loadClientBookings(); S.mb = { artist: aid, sel: [], date: S.jDate, time: +t, picked: true, name: "", phone: "", note: "" }; S.tried = false; go("manual"); break; }
    case "mb-time": if (S.mb) { S.mb.time = +v; S.mb.picked = false; render(true); } break;
    case "mb-save": saveManual(); break;
    case "jday": S.jDate = addDays(S.jDate, Number(v)); watchJday(); render(true); break;
    case "jtoday": S.jDate = todayKey(); watchJday(); render(true); break;
    case "forgot": forgot(); break;
    case "gallery-master": S.gMaster = v || "all"; S.gCat = "all"; go("gallery"); break;
    case "g-master": S.gMaster = v; render(true); break;
    case "g-cat": S.gCat = v; render(true); break;
    case "photo": S.photo = v; loadFull(v); go("photo"); break;
    case "photo-nav": { const l = galleryList(PUB_WORKS), i = l.findIndex(x => x.id === S.photo); if (l.length) { S.photo = l[(i + Number(v) + l.length) % l.length].id; loadFull(S.photo); render(true); } break; }
    case "book-master": Object.assign(S, { sel: [], artist: v, date: null, time: null, tried: false, cat: firstCatId() }); go("services"); break;
    case "w-cancel": S.workDraft = null; render(true); break;
    case "w-publish": publishWork(); break;
    case "w-arm": S.armed = "w:" + v; render(true); break;
    case "w-del": deleteWork(v); break;
    case "w-hide": { const w = ALL_WORKS.find(x => x.id === v); if (w) { try { await updateDoc(SD("works", v), { hidden: !w.hidden }); toast(w.hidden ? "Фото снова видно клиентам" : "Фото скрыто от клиентов"); } catch (err) { toast(errText(err)); } } break; }
    case "rep-period": S.repPeriod = v; loadReport(); render(true); break;
    case "rep-master": S.repMaster = v; go("reportMaster"); break;
    case "login-mode": S.login.mode = S.login.mode === "register" ? "login" : "register"; S.login.err = ""; S.login.info = ""; render(true); break;
    case "pw-eye": S.pwShow[v] = !S.pwShow[v]; render(true); { const i = document.getElementById(v); if (i) { i.focus(); const n = i.value.length; try { i.setSelectionRange(n, n); } catch (er) {} } } break;
    case "verified": verified(); break;
    case "resend": resend(); break;
    case "recheck": resolveRole(auth.currentUser); break;
    case "logout": S.draft = null; S.dirty = false; S.login = { email: "", pw: "", err: "", busy: false, info: "", mode: "login" }; S.pwShow = {}; await signOut(auth); location.hash = "#owner"; break;
    case "install": if (S.installEvt) { S.installEvt.prompt(); try { await S.installEvt.userChoice; } catch (er) {} S.installEvt = null; render(true); } break;
    case "hide-install": S.hideInstall = true; lsSet("nb-install-hide", true); render(true); break;
    /* settings editing */
    case "dayoff": {
      const d = Number(v), D = S.draft;
      D.closedDays = D.closedDays.includes(d) ? D.closedDays.filter(x => x !== d) : D.closedDays.concat(d);
      S.dirty = true; render(true); break; }
    case "add-artist": S.draft.artists.push({ id: "a" + uid(), name: "Мастер " + (S.draft.artists.length + 1) }); S.dirty = true; render(true); break;
    case "del-artist": S.draft.artists.splice(Number(v), 1); S.dirty = true; render(true); break;
    case "add-svc": S.draft.services.push({ id: "s" + uid(), cat: S.draft.services.length ? S.draft.services[S.draft.services.length - 1].cat : CATS[0].id, name: "", dur: 60, price: 0 }); S.dirty = true; render(true); break;
    case "del-svc": S.draft.services.splice(Number(v), 1); S.dirty = true; render(true); break;
    case "logo-remove": S.draft.logo = ""; S.dirty = true; render(true); break;
    case "discard": S.draft = null; S.dirty = false; S.draftErr = ""; render(true); break;
    case "save-settings": saveSettings(); break;
  }
});
overlay.addEventListener("click", e => { if (e.target.classList.contains("scrim")) { S.sheet = null; S.armed = null; render(true); } });

document.addEventListener("input", e => {
  const t = e.target;
  if (t.id === "fName") { S.form.name = t.value; lsSet("nb-form", S.form); }
  else if (t.id === "fSurname") { S.form.surname = t.value; lsSet("nb-form", S.form); }
  else if (S.mb && t.id === "mbSurname") S.mb.surname = t.value;
  else if (S.adm && t.id === "admEmail") S.adm.email = t.value;
  else if (S.brk && t.id === "brkLabel") S.brk.label = t.value;
  else if (t.id === "clQ") { S.clQ = t.value; const box = document.getElementById("clList"); if (box) box.innerHTML = clientRows(S.clQ.trim().length >= 2 ? matchClients(S.clQ) : clientList()); }
  else if (t.id === "clNote") S.clNote = t.value;
  else if (t.id === "clName") S.clName = t.value;
  else if (t.id === "clSurname") S.clSurname = t.value;
  else if (t.id === "clPhone") S.clPhone = t.value;
  else if (S.cn && ["cnName", "cnSurname", "cnPhone", "cnNote"].includes(t.id)) S.cn[{ cnName: "name", cnSurname: "surname", cnPhone: "phone", cnNote: "note" }[t.id]] = t.value;
  else if (t.id === "fPhone") { S.form.phone = t.value; lsSet("nb-form", S.form); }
  else if (t.id === "fNote") S.form.note = t.value;
  else if (t.id === "revText" && S.revDraft) S.revDraft.text = t.value;
  else if (t.id === "tplText" && S.tplDraft) { S.tplDraft[S.tplTab || "ok"] = t.value; const pv = document.getElementById("tplPreview");
    if (pv) pv.textContent = fillTpl(t.value, { name: "Мария", date: addDays(todayKey(), 2), start: 780, serviceNames: [(SET.services[0] || {}).name || "Маникюр"], artist: (SET.artists[0] || {}).id, phone: "+7 900 555-66-77" }); }
  else if (S.ns && t.id === "nsName") { S.ns.name = t.value; if (!S.ns.slugTouched) { S.ns.slug = translit(t.value); const e = document.getElementById("nsSlug"); if (e) e.value = S.ns.slug; } }
  else if (S.ns && t.id === "nsCity") S.ns.city = t.value;
  else if (S.ns && t.id === "nsPhone") S.ns.phone = t.value;
  else if (S.ns && t.id === "nsEmail") S.ns.email = t.value;
  else if (S.ns && t.id === "nsSlug") { S.ns.slug = t.value.toLowerCase().replace(/[^a-z0-9-]/g, ""); S.ns.slugTouched = true; }
  else if (S.acc && t.id === "acEmail") S.acc.email = t.value;
  else if (S.acc && t.id === "acPrice") S.acc.price = t.value.replace(/\D/g, "");
  else if (S.bill && t.id === "biPrice") S.bill.price = Number(t.value.replace(/\D/g, "")) || 0;
  else if (S.bill && t.id === "biTrial") S.bill.trialDays = Math.min(365, Number(t.value.replace(/\D/g, "")) || 0);
  else if (S.bill && t.id === "biPhone") S.bill.phone = t.value;
  else if (S.bill && t.id === "biBank") S.bill.bank = t.value;
  else if (S.bill && t.id === "biRecip") S.bill.recipient = t.value;
  else if (S.mb && t.id === "mbName") { S.mb.name = t.value; refreshMbSuggest(); }
  else if (S.mb && t.id === "mbPhone") { S.mb.phone = t.value; refreshMbSuggest(); }
  else if (S.mb && t.id === "mbNote") S.mb.note = t.value;
  else if (t.id === "revEditText" && S.revEdit) S.revEdit.text = t.value;
  else if (t.id === "lEmail") S.login.email = t.value;
  else if (t.id === "lPw") S.login.pw = t.value;
  else if (t.id === "wTitle" && S.workDraft) S.workDraft.title = t.value;
  else if (t.dataset.d && S.draft) {
    const D = S.draft, p = t.dataset.d.split(":");
    if (p[0] === "name" || p[0] === "area" || p[0] === "phone" || p[0] === "telegram") D[p[0]] = t.value;
    else if (p[0] === "open" || p[0] === "close") { const m = parseHM(t.value); if (m != null) D[p[0]] = m; }
    else if (p[0] === "leadMin") D.leadMin = parseInt(t.value, 10) || 0;
    else if (p[0] === "pediChairs") { const n = parseInt(t.value, 10); D.pediChairs = isNaN(n) ? 0 : n; }
    else if (p[0] === "artist") D.artists[+p[1]].name = t.value;
    else if (p[0] === "artistEmail") D.artists[+p[1]].email = t.value;
    else if (p[0] === "svc") {
      const s = D.services[+p[1]];
      if (p[2] === "name") s.name = t.value;
      else if (p[2] === "cat") s.cat = t.value;
      else if (p[2] === "price") { const n = parseInt(t.value.replace(/\D/g, ""), 10); s.price = isNaN(n) ? 0 : n; }
      else if (p[2] === "dur") { const n = parseInt(t.value, 10); s.dur = isNaN(n) ? 0 : n; }
    }
    else if (p[0] === "svcmp") { const s = D.services[+p[1]], n = parseInt(t.value.replace(/\D/g, ""), 10); s.mp = Object.assign({}, s.mp || {}); if (n > 0) s.mp[p[2]] = n; else delete s.mp[p[2]]; }
    if (!S.dirty) { S.dirty = true; S.draftErr = ""; refreshChrome(); }
  }
});
document.addEventListener("change", async e => {
  if (S.brk && ["brkDate", "brkStart", "brkDur", "brkRep"].includes(e.target.id)) { const K = S.brk, v = e.target.value;
    if (e.target.id === "brkDate" && v) K.date = v < todayKey() ? todayKey() : v; else if (e.target.id === "brkStart") K.start = +v; else if (e.target.id === "brkDur") K.dur = +v; else if (e.target.id === "brkRep") K.rep = +v;
    render(true); return; }
  if (e.target.id === "rsDur" && S.rs) { S.rs.dur = +e.target.value; render(true); return; }
  if (e.target.id === "rsDate" && S.rs && e.target.value) { S.rs.date = e.target.value < todayKey() ? todayKey() : e.target.value; S.rs.time = null; render(true); return; }
  if (e.target.id === "mbDate" && S.mb && e.target.value) { S.mb.date = e.target.value < todayKey() ? todayKey() : e.target.value; S.mb.time = null; S.mb.picked = false; render(true); return; }
  const t = e.target;
  if (t.dataset.d && t.tagName === "SELECT") t.dispatchEvent(new Event("input", { bubbles: true }));
  if (t.id === "logoFile" && t.files && t.files[0]) {
    S.dirty = true; S.draftErr = "";
    const draft = S.draft;
    try { const logo = await resizeImage(t.files[0]); draft.logo = logo; S.draft = draft; S.dirty = true; render(true); }
    catch (err) { toast("Не удалось открыть картинку. Попробуйте другой файл."); }
  }
  if (t.dataset.move && t.value) moveBooking(t.dataset.move, t.value);
  if (t.id === "dAuto" && S.draft) { S.draft.autoConfirm = t.checked; S.dirty = true; S.draftErr = ""; render(true); }
  if (t.id === "wCat" && S.workDraft) S.workDraft.cat = t.value;
  if (t.id === "wArtist" && S.workDraft) S.workDraft.artist = t.value;
});
document.addEventListener("submit", e => {
  e.preventDefault();
  if (e.target.id === "loginForm") { if (S.login.mode === "register") register(); else login(); }
});

/* photo picker lives outside the app screen, so live updates can't remove it while the gallery is open */
let workPicker = null, pickTarget = null;
function pickImage(onFile) {
  pickTarget = onFile;
  if (!workPicker) {
    workPicker = document.createElement("input");
    workPicker.type = "file"; workPicker.accept = "image/*"; workPicker.id = "workFile";
    workPicker.style.cssText = "position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0";
    document.body.appendChild(workPicker);
    workPicker.addEventListener("change", () => { const f = workPicker.files && workPicker.files[0]; if (f && pickTarget) pickTarget(f); workPicker.value = ""; });
  }
  workPicker.click();
}
const pickWorkPhoto = () => pickImage(usePickedPhoto);
// square-crop the photo to a small round-avatar picture and save it straight away
async function saveAvatar(id, file) {
  S.avBusy = true; render(true);
  try {
    const img = await loadImg(file), side = Math.min(img.width, img.height);
    const c = document.createElement("canvas"); c.width = c.height = 240;
    const ctx = c.getContext("2d"); ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, 240, 240);
    ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, 240, 240);
    let q = 0.85, out = c.toDataURL("image/jpeg", q);
    while (out.length > 45000 && q > 0.4) { q -= 0.1; out = c.toDataURL("image/jpeg", q); }
    await setDoc(SD("avatars", id), { img: out, updated: Date.now() });
    AVATARS[id] = out; toast("Фото профиля сохранено");
  } catch (err) { toast(err && err.message === "bad image" ? "Не удалось открыть фото. Попробуйте другое." : errText(err)); }
  S.avBusy = false; render(true);
}
async function usePickedPhoto(file) {
    S.wBusy = true; render(true);
    try {
      const img = await loadImg(file);
      const firstCat = (CATS.find(c => SET.services.some(s => s.cat === c.id)) || CATS[0]).id;
      S.workDraft = { thumb: toJpeg(img, 420, 60000), img: toJpeg(img, 1280, 700000), title: "", cat: firstCat, artist: ROLE === "master" ? MY_ARTIST : (S.gMaster !== "all" ? S.gMaster : (SET.artists[0] || {}).id) };
    } catch (err) { toast("Не удалось открыть фото. Попробуйте другое."); }
    S.wBusy = false; render(true);
}

/* ================= writes: salons & subscription ================= */
function toQr(img) {
  const side = Math.min(img.width, img.height), c = document.createElement("canvas"); c.width = c.height = 360;
  const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, 360, 360);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, 360, 360);
  return c.toDataURL("image/png");
}
async function createSalon() {
  const N = S.ns; S.nsErr = "";
  const slug = (N.slug || "").replace(/^-+|-+$/g, ""), email = (N.email || "").trim().toLowerCase();
  if (!N.name.trim()) S.nsErr = "Укажите название салона";
  else if (!/^[a-z0-9][a-z0-9-]{2,29}$/.test(slug) || slug === "main") S.nsErr = "Адрес ссылки: от 3 латинских букв или цифр (можно дефис)";
  else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) S.nsErr = "Укажите email владельца";
  if (S.nsErr) { render(true); return; }
  S.saving = true; render(true);
  try {
    const ex = await getDocFromServer(doc(db, "salons", slug));
    if (ex.exists()) { S.nsErr = "Такой адрес ссылки уже занят — придумайте другой"; S.saving = false; render(true); return; }
    const now = Date.now(), base = defaultSettings();
    const st = Object.assign(base, { name: N.name.trim().slice(0, 60), area: N.city.trim().slice(0, 80), phone: N.phone.trim().slice(0, 25), logo: "",
      artists: [{ id: "a1", name: "Мастер 1" }], services: N.copy && SET ? clone(SET.services) : base.services });
    const batch = writeBatch(db);
    batch.set(doc(db, "salons", slug), { name: st.name, city: st.area, created: now, until: now + (Number(billing().trialDays) || 7) * DAY,
      free: false, paused: false, paidOnce: false, payClaim: null, rejected: false, price: null, paidLog: [] });
    batch.set(doc(db, "salonsPrivate", slug), { ownerEmail: email });
    batch.set(doc(db, "salons", slug, "settings", "salon"), st);
    await batch.commit();
    toast("Салон создан. Отправьте владельцу ссылку для входа.");
    S.ns = null; S.saving = false; S.accSid = slug; S.acc = null; go("salonAccess"); return;
  } catch (err) { S.nsErr = errText(err); }
  S.saving = false; render(true);
}
async function salonAdminUpdate(what) {
  const m = SALONS.find(x => x.id === S.accSid); if (!m) return;
  try {
    if (what === "email") {
      const em = (S.acc.email || "").trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) { toast("Проверьте email"); return; }
      await setDoc(doc(db, "salonsPrivate", m.id), { ownerEmail: em }); toast("Email владельца сохранён");
    } else if (what === "price") {
      const pr = Number(S.acc.price) || null; await updateDoc(doc(db, "salons", m.id), { price: pr }); toast(pr ? "Своя цена: " + rub(pr) : "Обычная цена");
    } else if (what === "month") {
      await updateDoc(doc(db, "salons", m.id), { until: addMonths(Math.max(m.until || 0, Date.now()), 1) }); toast("Добавлен бесплатный месяц");
    } else if (what === "free") {
      await updateDoc(doc(db, "salons", m.id), { free: !m.free }); toast(m.free ? "Салон снова платный" : "Салон бесплатный навсегда");
    } else if (what === "pause") {
      await updateDoc(doc(db, "salons", m.id), { paused: !m.paused }); toast(m.paused ? "Салон снова работает" : "Салон приостановлен");
    }
  } catch (err) { toast(errText(err)); }
  render(true);
}
async function confirmPayment(sid, ok) {
  const m = SALONS.find(x => x.id === sid); if (!m || !m.payClaim) return;
  const c = m.payClaim, now = Date.now();
  try {
    if (ok) await updateDoc(doc(db, "salons", sid), { until: addMonths(Math.max(m.until || 0, now), Number(c.months) || 1), paidOnce: true, payClaim: null, rejected: false,
      paidLog: (m.paidLog || []).concat({ amount: Number(c.amount) || 0, months: Number(c.months) || 1, at: now }).slice(-60) });
    else await updateDoc(doc(db, "salons", sid), { payClaim: null, rejected: true });
    toast(ok ? "Подписка продлена: " + (m.name || sid) : "Салону показано: перевод не найден");
  } catch (err) { toast(errText(err)); }
}
async function claimPayment() {
  const x = SUB(), n = S.subN || 1;
  S.saving = true; render(true);
  try { await updateDoc(doc(db, "salons", SID), { payClaim: { months: n, amount: x.price * n, at: Date.now() }, rejected: false }); toast("Спасибо! Ждём подтверждения оплаты."); }
  catch (err) { toast(errText(err)); }
  S.saving = false; render(true);
}
async function saveBilling() {
  const B = S.bill;
  if (!(B.price > 0)) { toast("Укажите цену"); return; }
  S.saving = true; render(true);
  try { await setDoc(doc(db, "billing", "config"), { price: B.price, trialDays: B.trialDays || 7, phone: (B.phone || "").trim(), bank: (B.bank || "").trim(), recipient: (B.recipient || "").trim(), qr: B.qr || "" }); toast("Сохранено"); S.bill = null; S.saving = false; go("salons"); return; }
  catch (err) { toast(errText(err)); }
  S.saving = false; render(true);
}

/* ================= writes ================= */
async function book() {
  const f = S.form;
  S.tried = true;
  if (!f.name.trim() || f.phone.replace(/\D/g, "").length < 7) {
    render(true);
    const bad = document.querySelector(".err"); if (bad) bad.scrollIntoView({ block: "center", behavior: "smooth" });
    return;
  }
  const dur = selDur();
  let artist = S.artist;
  if (artist === "any") artist = freeArtists(S.date, S.time, dur)[0];
  const chair = selNeedsChair();
  if (!artist || !artistFree(artist, S.date, S.time, dur) || (chair && !chairFree(S.date, S.time, dur))) { toast("Это время только что заняли. Выберите другое."); S.time = null; go("time"); return; }
  const id = doc(SC("bookings")).id;
  const now = Date.now();
  const services = S.sel.filter(svcById);
  const data = {
    date: S.date, start: S.time, dur, artist, anyArtist: S.artist === "any",
    services, serviceNames: services.map(x => svcById(x).name), total: Math.round(sumFor(services, artist)),
    name: fullName(f.name, f.surname), phone: f.phone.trim().slice(0, 25), note: f.note.trim().slice(0, 250),
    status: SET.autoConfirm === false ? "pending" : "confirmed", created: now, updated: now, ...(chair ? { chair: true } : {})
  };
  S.saving = true; render(true);
  const save = async () => {
    const batch = writeBatch(db);
    batch.set(SD("bookings", id), data);
    batch.set(SD("busy", id), { date: data.date, start: data.start, dur: data.dur, artist: data.artist, ...(chair ? { chair: true } : {}) });
    await batch.commit();
  };
  try {
    try { await save(); }
    catch (err) {
      // older database rules only accept "pending" — fall back so the booking is never lost
      if (data.status !== "confirmed" || !/permission/i.test(String(err && (err.code || err.message)))) throw err;
      data.status = "pending"; await save();
    }
  } catch (err) { S.saving = false; toast(errText(err)); render(true); return; }
  S.saving = false;
  const ids = lsGet(lsk("nb-my"), []); ids.unshift(id); lsSet(lsk("nb-my"), ids.slice(0, 30));
  MY[id] = Object.assign({ id }, data); watchMine();
  pushEvent(id, "new", "client");
  if (pushSupported() && Notification.permission === "granted") clientRemind(id, false);
  S.lastBooked = data.status; S.bookTab = "upcoming";
  Object.assign(S, { sel: [], artist: "any", date: null, time: null, tried: false, form: { name: f.name, surname: f.surname || "", phone: f.phone, note: "" } });
  S.view = "bookings"; S.armed = null; render(false);
}
async function cancelBooking(id) {
  try {
    const batch = writeBatch(db);
    batch.update(SD("bookings", id), { status: "cancelled", updated: Date.now() });
    batch.delete(SD("busy", id));
    await batch.commit();
    pushEvent(id, "cancel", S.mode === "owner" ? "staff" : "client");
    toast("Запись отменена");
  } catch (err) { toast(errText(err)); }
  S.armed = null; render(true);
}
async function moveBooking(id, artist) {
  const b = findBooking(id);
  if (!b || !artistFree(artist, b.date, b.start, b.dur, b.id)) { toast("У этого мастера уже занято"); render(true); return; }
  try {
    const batch = writeBatch(db);
    const svcs = (b.services || []).filter(svcById);
    batch.update(SD("bookings", id), Object.assign({ artist, anyArtist: false, updated: Date.now() }, svcs.length ? { total: Math.round(sumFor(svcs, artist)) } : {}));
    batch.update(SD("busy", id), { artist });
    await batch.commit();
    pushEvent(id, "move", "staff");
    toast("Запись передана: " + artistName(artist));
  } catch (err) { toast(errText(err)); }
  render(true);
}
async function saveSettings() {
  const D = S.draft;
  const fail = msg => { S.draftErr = msg; refreshChrome(); };
  D.name = (D.name || "").trim(); D.area = (D.area || "").trim(); D.phone = (D.phone || "").trim(); D.telegram = tgUser(D.telegram);
  D.artists = D.artists.map(a => ({ id: a.id, name: (a.name || "").trim(), email: (a.email || "").trim().toLowerCase() }));
  D.services = D.services.map(s => { const mp = {}; Object.keys(s.mp || {}).forEach(a => { const v = Math.round(Number(s.mp[a]) || 0); if (v > 0 && D.artists.some(x => x.id === a)) mp[a] = v; });
    return Object.assign({ id: s.id, cat: s.cat, name: (s.name || "").trim(), dur: Math.round((Number(s.dur) || 0) / 5) * 5, price: Math.round(Number(s.price) || 0) }, Object.keys(mp).length ? { mp } : {}); });
  if (!D.name) return fail("Укажите название салона");
  if (D.close <= D.open) return fail("Время закрытия должно быть позже открытия");
  if (!(D.pediChairs >= 1 && D.pediChairs <= 10)) return fail("Педикюрных кресел: от 1 до 10");
  if (!D.artists.length || D.artists.some(a => !a.name)) return fail("Укажите имена всех мастеров");
  if (D.services.some(s => !s.name)) return fail("У каждой услуги должно быть название");
  if (D.services.some(s => s.dur < 5 || s.dur > 480)) return fail("Длительность услуги: от 5 до 480 минут");
  const staff = {};
  for (const a of D.artists) {
    if (!a.email) continue;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.email)) return fail("Проверьте email мастера " + a.name);
    if (staff[a.email]) return fail("Один и тот же email указан у двух мастеров");
    staff[a.email] = a.id;
  }
  const pub = Object.assign({}, D, { artists: D.artists.map(a => ({ id: a.id, name: a.name })), updated: Date.now() });
  S.saving = true; S.draftErr = ""; refreshChrome();
  try {
    const batch = writeBatch(db);
    batch.set(settingsRef, pub);
    // Only touch the masters' email list when there is something to save, so saving the salon
    // still works before the new security rules are published.
    if (Object.keys(staff).length || Object.keys(STAFF).length) batch.set(staffRef, { map: staff, updated: Date.now() });
    await batch.commit();
    S.draft = null; S.dirty = false; toast("Сохранено. Клиенты уже видят изменения.");
  } catch (err) { S.draftErr = errText(err); }
  S.saving = false; render(true);
}
function loadImg(file) {
  return new Promise((res, rej) => { const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(url); res(img); }; img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("bad image")); }; img.src = url; });
}
// Shrink a photo to JPEG under `limit` characters (stored in the free database instead of paid file storage).
function toJpeg(img, max, limit) {
  let size = max, q = 0.82, out = "";
  for (let i = 0; i < 10; i++) {
    const s = Math.min(1, size / Math.max(img.width, img.height)), c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.width * s)); c.height = Math.max(1, Math.round(img.height * s));
    const ctx = c.getContext("2d"); ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
    out = c.toDataURL("image/jpeg", q);
    if (out.length <= limit) return out;
    if (q > 0.62) q -= 0.1; else size = Math.round(size * 0.8);
  }
  return out;
}
async function publishWork() {
  const D = S.workDraft;
  if (!D || !D.thumb) return;
  const artist = ROLE === "master" ? MY_ARTIST : D.artist;
  if (!artist) { toast("Выберите мастера"); return; }
  S.wBusy = true; render(true);
  try {
    const id = doc(SC("works")).id, batch = writeBatch(db);
    batch.set(SD("works", id), { artist, cat: D.cat, title: (D.title || "").trim().slice(0, 60), thumb: D.thumb, created: Date.now(), hidden: false });
    batch.set(SD("workImages", id), { img: D.img });
    await batch.commit();
    FULL[id] = D.img; S.workDraft = null; toast("Фото опубликовано. Клиенты уже видят его.");
  } catch (err) { toast(errText(err)); }
  S.wBusy = false; render(true);
}
async function deleteWork(id) {
  try { const batch = writeBatch(db); batch.delete(SD("works", id)); batch.delete(SD("workImages", id)); await batch.commit(); toast("Фото удалено"); }
  catch (err) { toast(errText(err)); }
  S.armed = null; render(true);
}
function resizeImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const max = 256, s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.width * s)); c.height = Math.max(1, Math.round(img.height * s));
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      let out = c.toDataURL("image/png");
      if (out.length > 150000) out = c.toDataURL("image/jpeg", 0.85);
      resolve(out);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("bad image")); };
    img.src = url;
  });
}

/* ================= auth ================= */
const authErr = e => {
  const c = e && e.code || "";
  if (/invalid-credential|wrong-password|user-not-found|invalid-email/.test(c)) return "Неверный email или пароль.";
  if (/too-many-requests/.test(c)) return "Слишком много попыток. Подождите несколько минут.";
  if (/network/.test(c)) return "Нет соединения с интернетом.";
  return "Не удалось войти. Попробуйте ещё раз.";
};
async function login() {
  const L = S.login;
  L.err = ""; L.info = "";
  if (!L.email.trim() || !L.pw) { L.err = "Введите email и пароль."; render(true); return; }
  L.busy = true; render(true);
  try { await signInWithEmailAndPassword(auth, L.email.trim(), L.pw); L.pw = ""; S.view = PENDING.length ? "inbox" : "journal"; }
  catch (e) { L.err = authErr(e); }
  L.busy = false; render(true);
}
const regErr = e => {
  const c = e && e.code || "";
  if (/email-already-in-use/.test(c)) return "Этот email уже зарегистрирован. Войдите или нажмите «Забыли пароль?».";
  if (/weak-password/.test(c)) return "Пароль должен быть не короче 6 символов.";
  if (/invalid-email/.test(c)) return "Проверьте email.";
  if (/network/.test(c)) return "Нет соединения с интернетом.";
  if (/operation-not-allowed/.test(c)) return "Регистрация отключена в Firebase (Authentication → Sign-in method → Email/Password).";
  return "Не удалось зарегистрироваться. Попробуйте ещё раз.";
};
async function register() {
  const L = S.login;
  L.err = ""; L.info = "";
  const email = L.email.trim();
  if (!email || !L.pw) { L.err = "Введите email и пароль."; render(true); return; }
  if (L.pw.length < 6) { L.err = "Пароль должен быть не короче 6 символов."; render(true); return; }
  L.busy = true; render(true);
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, L.pw);
    await sendEmailVerification(cred.user);
    L.pw = ""; L.mode = "login"; S.view = "journal";
  } catch (e) { L.err = regErr(e); }
  L.busy = false; render(true);
}
async function verified() {
  const L = S.login, u = auth.currentUser;
  L.err = ""; L.info = "";
  if (!u) return;
  try {
    await reload(u);
    if (auth.currentUser.emailVerified) { await auth.currentUser.getIdToken(true); USER = auth.currentUser; resolveRole(auth.currentUser); return; }
    L.err = "Email ещё не подтверждён. Нажмите ссылку в письме и попробуйте снова.";
  } catch (e) { L.err = "Нет соединения. Попробуйте ещё раз."; }
  render(true);
}
async function resend() {
  const L = S.login;
  L.err = ""; L.info = "";
  try { await sendEmailVerification(auth.currentUser); L.info = "Письмо отправлено ещё раз."; }
  catch (e) { L.err = /too-many-requests/.test(e && e.code || "") ? "Письмо уже отправлено. Подождите пару минут." : "Не удалось отправить письмо. Попробуйте позже."; }
  render(true);
}
async function forgot() {
  const L = S.login;
  L.err = ""; L.info = "";
  if (!L.email.trim()) { L.err = "Сначала введите email."; render(true); return; }
  try { await sendPasswordResetEmail(auth, L.email.trim()); L.info = "Письмо для смены пароля отправлено на " + L.email.trim() + "."; }
  catch (e) { L.err = authErr(e); }
  render(true);
}

render(false);
