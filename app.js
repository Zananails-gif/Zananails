import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, doc, collection, onSnapshot, setDoc, updateDoc, getDocFromServer,
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
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

const ICON = {
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
    open: 9 * 60, close: 19 * 60, closedDays: [0], pediChairs: 1, autoConfirm: true,
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
  if (out.autoConfirm !== false) out.autoConfirm = true;
  return out;
}

/* ================= app state ================= */
let SET = null, setLoaded = false, setError = false;
let BUSY = [];
let USER = null, authReady = false, ownerDenied = false;
let JDAY = [], PENDING = [], RECENT = [];
let ROLE = null, MY_ARTIST = null, needVerify = false, noStaff = false, roleChecking = false;
let STAFF = {}, MASTER_ALL = [];
let PUB_WORKS = [], ALL_WORKS = [], FULL = {}, REPORT = null, NEWB = [], AVATARS = {};
const NEW_WINDOW = 2 * 24 * 3600 * 1000;
let inboxSeen = lsGet("nb-inbox-seen", 0);
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
const artistName = id => (SET && SET.artists.find(a => a.id === id) || {}).name || "Мастер";
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
function slotsFor(date, artist, dur) {
  if (!SET || isClosed(date) || !dur) return [];
  const out = [];
  const minStart = date === todayKey() ? nowMin() + 30 : 0;
  const needChair = selNeedsChair();
  for (let t = SET.open; t + dur <= SET.close; t += STEP) {
    if (t < minStart) continue;
    if (needChair && !chairFree(date, t, dur)) continue;
    const ok = artist === "any" ? freeArtists(date, t, dur).length > 0 : artistFree(artist, date, t, dur);
    if (ok) out.push(t);
  }
  return out;
}
const selDur = () => S.sel.reduce((n, id) => n + (svcById(id)?.dur || 0), 0);
const selTotal = () => S.sel.reduce((n, id) => n + Number(svcById(id)?.price || 0), 0);
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
const appLink = () => location.origin + location.pathname;
function waLink(phone, text) { const n = waNumber(phone); return n ? "https://wa.me/" + n + "?text=" + encodeURIComponent(text) : ""; }
function tgLink(user, text) {
  const u = tgUser(user);
  return u ? "https://t.me/" + u + "?text=" + encodeURIComponent(text)
    : "https://t.me/share/url?url=" + encodeURIComponent(appLink()) + "&text=" + encodeURIComponent(text);
}
function bookingLine(b) {
  return longDate(b.date).toLowerCase() + " в " + hm(b.start) + ", " + ((b.serviceNames || []).join(", ") || "услуга") + ", мастер " + artistName(b.artist);
}
function msgToSalon(b) {
  return "Здравствуйте! Я записался(-ась) онлайн: " + bookingLine(b) + ". Имя: " + (b.name || "") + ", телефон: " + (b.phone || "") + ".";
}
function msgToClient(b) {
  const salon = (SET && SET.name) || "салон";
  if (b.status === "cancelled") return "Здравствуйте, " + (b.name || "") + "! К сожалению, ваша запись в «" + salon + "» на " + longDate(b.date).toLowerCase() + " в " + hm(b.start) + " отменена. Выберите другое время: " + appLink();
  return "Здравствуйте, " + (b.name || "") + "! Ваша запись в «" + salon + "» подтверждена: " + bookingLine(b) + "." + (SET && SET.area ? " Адрес: " + SET.area + "." : "") + " Ждём вас!";
}
function msgButtons(label, wa, tg) {
  if (!wa && !tg) return "";
  return `<div class="stack" style="gap:6px"><span class="tiny muted" style="font-weight:600">${label}</span><div class="btns">
    ${wa ? `<a class="btn sm ghost msg-wa" href="${esc(wa)}" target="_blank" rel="noopener">${ICON.wa}WhatsApp</a>` : ""}
    ${tg ? `<a class="btn sm ghost msg-tg" href="${esc(tg)}" target="_blank" rel="noopener">${ICON.tg}Telegram</a>` : ""}</div></div>`;
}
const salonMsgButtons = b => msgButtons("Написать салону", waLink(SET.phone, msgToSalon(b)), tgLink(SET.telegram, msgToSalon(b)));
const clientMsgButtons = b => b.phone ? msgButtons(b.status === "cancelled" ? "Сообщить клиенту об отмене" : "Сообщить клиенту о записи", waLink(b.phone, msgToClient(b)), tgLink("", msgToClient(b))) : "";

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
const settingsRef = doc(db, "settings", "salon");
const staffRef = doc(db, "private", "staff");   // master emails → master id (owner + masters only)

/* ================= realtime data ================= */
onSnapshot(settingsRef, { includeMetadataChanges: true }, snap => {
  // A "not found" answer from the offline cache (weak connection) is not trusted:
  // keep what we have and wait for the server.
  if (!snap.exists() && snap.metadata.fromCache) return;
  SET = snap.exists() ? normalize(snap.data()) : null;
  setLoaded = true; setError = false;
  maybeCreateDefaults();
  renderSoon(true);
}, () => { setLoaded = true; setError = true; renderSoon(true); });

onSnapshot(query(collection(db, "busy"), where("date", ">=", addDays(todayKey(), -1))), snap => {
  BUSY = snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
  renderSoon(true);
}, () => {});

// Photo gallery: customers only get photos that are not hidden.
onSnapshot(collection(db, "avatars"), snap => {
  const m = {}; snap.docs.forEach(d => { const x = d.data(); if (x && x.img) m[d.id] = x.img; }); AVATARS = m; render(true);
}, () => {});
onSnapshot(query(collection(db, "works"), where("hidden", "==", false)), snap => {
  PUB_WORKS = snap.docs.map(d => Object.assign({ id: d.id }, d.data())).sort((a, b) => (b.created || 0) - (a.created || 0));
  renderSoon(true);
}, () => { PUB_WORKS = []; });
function watchAllWorks() {
  unsubOwner.push(onSnapshot(collection(db, "works"), snap => {
    ALL_WORKS = snap.docs.map(d => Object.assign({ id: d.id }, d.data())).sort((a, b) => (b.created || 0) - (a.created || 0));
    renderSoon(true);
  }, () => { ALL_WORKS = []; }));
}

function watchMine() {
  const ids = lsGet("nb-my", []);
  ids.forEach(id => {
    if (unsubMy[id]) return;
    unsubMy[id] = onSnapshot(doc(db, "bookings", id), snap => {
      MY[id] = snap.exists() ? Object.assign({ id }, snap.data()) : null;
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
    if (fresh.length) { toast("Новая запись: " + fresh[0].name); try { navigator.vibrate && navigator.vibrate(200); } catch (e) {} }
  }
  pendingLoaded = true;
}
// Who is logged in: the owner (by UID), a master (email added by the owner), or nobody allowed.
async function resolveRole(user) {
  stopWatches();
  ROLE = null; MY_ARTIST = null; needVerify = false; noStaff = false; ownerDenied = false; roleChecking = false;
  if (!user) { renderSoon(true); return; }
  if (!OWNER_UID || user.uid === OWNER_UID) {
    ROLE = "owner"; startOwnerWatch(); maybeCreateDefaults(); renderSoon(true); return;
  }
  if (!user.emailVerified) { needVerify = true; renderSoon(true); return; }
  roleChecking = true; renderSoon(true);
  try {
    const snap = await getDocFromServer(staffRef);
    const map = snap.exists() ? (snap.data().map || {}) : {};
    const id = map[(user.email || "").toLowerCase()];
    if (id) { ROLE = "master"; MY_ARTIST = id; startMasterWatch(); } else noStaff = true;
  } catch (e) { noStaff = true; }
  roleChecking = false;
  renderSoon(true);
}
function startOwnerWatch() {
  const denied = () => { ownerDenied = true; renderSoon(true); };
  unsubOwner.push(onSnapshot(query(collection(db, "bookings"), where("status", "==", "pending")), snap => {
    PENDING = snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
    renderSoon(true);
  }, denied));
  // every booking made in the last 2 days (also the automatically confirmed ones)
  unsubOwner.push(onSnapshot(query(collection(db, "bookings"), where("created", ">=", Date.now() - NEW_WINDOW)), snap => {
    const before = new Set(NEWB.map(b => b.id));
    NEWB = snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
    notifyNew(before);
    renderSoon(true);
  }, denied));
  unsubOwner.push(onSnapshot(query(collection(db, "bookings"), orderBy("updated", "desc"), limit(15)), snap => {
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
  unsubOwner.push(onSnapshot(query(collection(db, "bookings"), where("artist", "==", MY_ARTIST)), snap => {
    const before = new Set(NEWB.map(b => b.id));
    MASTER_ALL = snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
    deriveMaster();
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
  JDAY = MASTER_ALL.filter(b => b.date === S.jDate);
}

function watchJday() {
  if (ROLE === "master") { deriveMaster(); return; }
  if (unsubJday) { unsubJday(); unsubJday = null; }
  if (ROLE !== "owner") return;
  JDAY = [];
  unsubJday = onSnapshot(query(collection(db, "bookings"), where("date", "==", S.jDate)), snap => {
    JDAY = snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
    renderSoon(true);
  }, () => { ownerDenied = true; renderSoon(true); });
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
  top.innerHTML = `${logoHTML("logo")}<div class="name"><b>${esc(SET ? SET.name : "Онлайн-запись")}</b><span>${sub}</span></div>`;
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
    <div class="list">${SET.artists.map(a => `<div class="row">${avatar(a.id, a.name, 44)}<div style="flex:1;min-width:0"><b>${esc(a.name)}</b><div class="tiny muted">${worksOf(a.id) ? worksOf(a.id) + " " + plural(worksOf(a.id), ["работа", "работы", "работ"]) + " в галерее" : "Мастер ногтевого сервиса"}</div></div>${worksOf(a.id) ? `<button class="linkbtn" data-act="gallery-master" data-v="${esc(a.id)}">Работы ›</button>` : ""}</div>`).join("")}</div>
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
    <div class="optbody"><b>${esc(s.name)}</b><span class="tiny muted">${durTxt(s.dur)}</span><span class="price">${rub(s.price)}</span></div>
    <div class="check">${on ? ICON.check : ""}</div></button>`;
  }).join("") || `<div class="empty">В этой категории пока нет услуг.</div>`}</div>
  <p class="small muted">Можно выбрать услуги из разных категорий.</p>`;
}
function barServices() {
  const n = S.sel.length;
  return `<div class="cta wrap"><div class="total"><span class="tiny muted">${n} ${plural(n, ["услуга", "услуги", "услуг"])} · ${durTxt(selDur() || 0)}</span><b>${rub(selTotal())}</b></div>
  <button class="btn" data-act="go" data-v="artist" ${n ? "" : "disabled"}>Далее</button></div>`;
}

function vArtist() {
  const dur = selDur();
  const opts = [{ id: "any", name: "Любой свободный мастер", role: "Самый быстрый способ записаться" }]
    .concat(SET.artists.map(a => ({ id: a.id, name: a.name, role: "Мастер ногтевого сервиса" })));
  return `${header("Шаг 2 из 4", "Выберите мастера", "services")}
  <div class="list">${opts.map(o => {
    let next = "Нет свободных окон на 3 недели"; let k = todayKey();
    for (let i = 0; i < DAYS_AHEAD; i++) { if (slotsFor(k, o.id, dur).length) { next = "Ближайшее окно: " + (i === 0 ? "сегодня" : i === 1 ? "завтра" : shortDate(k)); break; } k = addDays(k, 1); }
    const on = S.artist === o.id;
    return `<button class="opt" data-act="artist" data-v="${esc(o.id)}" aria-pressed="${on}">
      ${o.id === "any" ? `<div class="thumb avatar">✱</div>` : avatar(o.id, o.name)}
      <div class="optbody"><b>${esc(o.name)}</b><span class="tiny muted">${o.role}</span><span class="tiny green">${next}</span></div>
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
    ${S.sel.map(id => { const s = svcById(id); return s ? `<div class="sumrow"><span>${esc(s.name)}</span><span class="price">${rub(s.price)}</span></div>` : ""; }).join("")}
    <div class="sumrow"><span class="muted">Мастер</span><span style="font-weight:600">${esc(S.artist === "any" ? "Любой свободный" : artistName(S.artist))}</span></div>
    <div class="hr"></div>
    <div class="sumrow" style="font-size:16px;font-weight:700"><span>Итого</span><span class="price">${rub(selTotal())}</span></div>
  </div>
  <form id="detailsForm" class="stack" novalidate>
    <h2 class="h2">Ваши данные</h2>
    <label class="field" for="fName">Имя ${nameErr ? '<span class="err">Введите ваше имя</span>' : ""}
      <input id="fName" name="name" autocomplete="name" maxlength="60" value="${esc(f.name)}" placeholder="Имя и фамилия"></label>
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
  ${S.lastBooked ? `<div class="notice" role="status"><div class="dot">${ICON.check}</div><div><b>Вы записаны!</b><div class="small">${S.lastBooked === "pending" ? "Салон скоро подтвердит запись. Статус обновится здесь." : "Запись подтверждена. Ждём вас!"} Можно также отправить запись салону в WhatsApp или Telegram — кнопки ниже.</div></div></div>` : ""}
  <div class="seg" role="group" aria-label="Показать"><button data-act="btab" data-v="upcoming" aria-pressed="${S.bookTab === "upcoming"}">Предстоящие</button><button data-act="btab" data-v="past" aria-pressed="${S.bookTab === "past"}">Прошедшие и отменённые</button></div>
  <div class="list">${list.length ? list.map(bookingCard).join("") : `<div class="empty">${S.bookTab === "upcoming" ? "Предстоящих записей пока нет." : "Здесь пока ничего нет."}</div>`}</div>
  <p class="tiny muted">Записи сохраняются на этом телефоне. Если вы записывались с другого телефона, они будут видны там.</p>
  <button class="btn ghost" data-act="cat" data-v="${esc(first)}">${ICON.plus}Новая запись</button>`;
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
  try { const s = await getDoc(doc(db, "workImages", id)); if (s.exists() && s.data().img) { FULL[id] = s.data().img; renderSoon(true); } } catch (e) {}
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
  return `<h1 class="h1" style="font-size:26px">${reg ? "Регистрация мастера" : "Вход для салона"}</h1>
  <p class="small muted">${reg ? "Укажите email, который владелец вписал в «Настройки → Мастера», и придумайте пароль (не меньше 6 символов)." : "Войдите с email и паролем владельца или мастера."}</p>
  <form id="loginForm" class="stack" novalidate>
    <label class="field" for="lEmail">Email<input id="lEmail" type="email" inputmode="email" autocomplete="username" value="${esc(L.email)}"></label>
    ${pwField("lPw", reg ? "Придумайте пароль" : "Пароль", L.pw, reg ? "new-password" : "current-password")}
    ${L.err ? `<div class="err-box" role="alert">${esc(L.err)}</div>` : ""}
    ${L.info ? `<div class="small" role="status" style="color:var(--ok)">${esc(L.info)}</div>` : ""}
    <button class="btn" type="submit" ${L.busy ? "disabled" : ""}>${L.busy ? (reg ? "Создаём…" : "Входим…") : (reg ? "Зарегистрироваться" : "Войти")}</button>
    ${reg ? "" : `<button class="linkbtn" type="button" data-act="forgot" style="align-self:center">Забыли пароль?</button>`}
  </form>
  <button class="btn ghost" data-act="login-mode">${reg ? "У меня уже есть аккаунт — войти" : "Я мастер — регистрация"}</button>
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
  const ARTS = ROLE === "master" ? SET.artists.filter(x => x.id === MY_ARTIST) : SET.artists;
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
  const nm = nowMin();
  const nowLine = (k === todayKey() && nm >= OPEN && nm <= CLOSE) ? `<div class="now" style="top:${(nm - OPEN) / 60 * H}px"></div>` : "";
  return `<div class="jhead"><div><div class="step">Журнал записей</div><h1 class="h1">${esc(k === todayKey() ? "Сегодня, " + shortDate(k) : longDate(k))}</h1></div>
    <div class="btns"><button class="back" data-act="jday" data-v="-1" aria-label="Предыдущий день">${ICON.back}</button><button class="back" data-act="jday" data-v="1" aria-label="Следующий день">${ICON.next}</button></div></div>
  <div class="stats"><span class="stat"><b>${day.length}</b> ${plural(day.length, ["запись", "записи", "записей"])}</span><span class="stat">Выручка: <b>${rub(revenue)}</b></span>${k !== todayKey() ? `<button class="stat" data-act="jtoday" style="font-weight:700;color:var(--accent)">К сегодняшнему дню</button>` : ""}</div>
  ${isClosed(k) ? `<div class="empty">Выходной день.</div>` : `
  <div class="jgrid">
    <div class="jcols" style="grid-template-columns:repeat(${cols},minmax(0,1fr))">${ARTS.map(a => `<span>${esc(a.name)}</span>`).join("")}</div>
    <div class="jbody" style="height:${(CLOSE - OPEN) / 60 * H + 8}px;margin-top:8px">${hours}${vlines}${blocks}${nowLine}</div>
  </div>`}
  <div class="legend"><span><i style="background:var(--accent-soft);outline:1.5px dashed var(--accent)"></i>Новая, ждёт подтверждения</span><span><i style="background:var(--accent-soft)"></i>Подтверждена</span></div>`;
}
function vInbox() {
  const pending = PENDING.slice().sort((a, b) => (b.created || 0) - (a.created || 0));
  const recent = RECENT.filter(b => b.status !== "pending").slice(0, 10);
  const fresh = NEWB.filter(b => b.status === "confirmed").sort((a, b) => (b.created || 0) - (a.created || 0));
  if (S.view === "inbox") { const mx = Math.max(inboxSeen, ...NEWB.map(b => b.created || 0)); if (mx > inboxSeen) { inboxSeen = mx; lsSet("nb-inbox-seen", mx); } }
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
    <p class="small muted">Чтобы мастер мог входить и видеть свои записи, впишите его email. Мастер открывает ссылку кабинета, нажимает «Я мастер — регистрация» и сам придумывает пароль.</p>
    ${D.artists.map((a, i) => `<div class="ed">
      <div style="display:flex;gap:8px;align-items:center">
        <button class="av-btn" data-act="av-pick" data-v="${esc(a.id)}" aria-label="Фото профиля: ${esc(a.name || "мастер")}">${avatar(a.id, a.name, 44)}<span class="av-cam">${ICON.camera}</span></button>
        <input class="inp" id="art${i}" aria-label="Имя мастера ${i + 1}" data-d="artist:${i}" maxlength="40" value="${esc(a.name)}" placeholder="Имя мастера">
        ${D.artists.length > 1 ? `<button class="icon-btn" data-act="del-artist" data-v="${i}" aria-label="Удалить мастера ${esc(a.name)}">${ICON.trash}</button>` : ""}</div>
      <input class="inp" id="artEmail${i}" type="email" inputmode="email" autocomplete="off" aria-label="Email мастера ${esc(a.name)} для входа" data-d="artistEmail:${i}" maxlength="80" value="${esc(a.email || "")}" placeholder="Email для входа (необязательно)">
    </div>`).join("")}
    <p class="tiny muted">Нажмите на кружок, чтобы поставить фото мастера. Мастер может сменить своё фото сам во вкладке «Аккаунт».</p>
    <p class="tiny muted">Ссылка для входа мастеров: <b style="user-select:all;word-break:break-all">${esc(location.origin + location.pathname)}#owner</b></p>
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
      </div></div>`).join("")}
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
  return `<h1 class="h1" style="font-size:26px">${own ? "Мои работы" : "Работы мастеров"}</h1>
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
  if (ROLE !== "owner") return;
  const [from, to] = periodRange(S.repPeriod), key = S.repPeriod + from;
  REPORT = { key, loading: true, list: REPORT && REPORT.key === key ? REPORT.list : [] };
  renderSoon(true);
  try {
    const q = await getDocs(query(collection(db, "bookings"), where("date", ">=", from), where("date", "<=", to)));
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
function vReportMaster() {
  const a = SET.artists.find(x => x.id === S.repMaster);
  const [, , label] = periodRange(S.repPeriod);
  const L = ((REPORT && REPORT.list) || []).filter(b => b.artist === S.repMaster);
  const done = L.filter(isDone), canc = L.filter(b => b.status === "cancelled");
  const svc = {};
  done.forEach(b => (b.services || []).forEach((id, i) => {
    const s = SET.services.find(x => x.id === id), nm = (b.serviceNames || [])[i] || (s && s.name) || "Услуга";
    svc[nm] = svc[nm] || { n: 0, r: 0 }; svc[nm].n++; svc[nm].r += s ? Number(s.price || 0) : Number(b.total || 0) / Math.max(1, (b.services || []).length);
  }));
  const rows = done.concat(canc).sort((x, y) => (y.date + hm(y.start)).localeCompare(x.date + hm(x.start)));
  const mins = done.reduce((n, b) => n + Number(b.dur || 0), 0);
  return `${header("Отчёт · " + label, a ? a.name : "Мастер", "report")}
  <div class="stat3">
    <div class="card"><span class="tiny muted">Клиентов</span><b>${done.length}</b></div>
    <div class="card"><span class="tiny muted">Выручка</span><b>${rub(sumTotal(done))}</b></div>
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
  const t = (v, ic, lab) => `<button class="tab" data-act="go" data-v="${v}" ${S.view === v || (v === "report" && S.view === "reportMaster") ? 'aria-current="page"' : ""}>${ic}${lab}${v === "inbox" && n ? `<span class="badge">${n}</span>` : ""}</button>`;
  return `<nav class="tabs" aria-label="Меню салона">${t("journal", ICON.cal, "Журнал")}${t("inbox", ICON.bell, "Новые")}${ROLE === "owner" ? t("report", ICON.chart, "Отчёт") : ""}${t("works", ICON.grid, "Работы")}${t("settings", ICON.gear, ROLE === "master" ? "Аккаунт" : "Настройки")}</nav>`;
}
function saveBar() {
  if (!S.dirty) return "";
  return `<div class="savebar wrap"><span>${S.draftErr ? `<span style="color:var(--bad)">${esc(S.draftErr)}</span>` : "Есть несохранённые изменения"}</span>
    <button class="btn sm ghost" data-act="discard">Отменить</button><button class="btn sm" data-act="save-settings" ${S.saving ? "disabled" : ""}>${S.saving ? "Сохраняем…" : "Сохранить"}</button></div>`;
}

/* ================= booking sheet (owner) ================= */
function findBooking(id) {
  return JDAY.find(b => b.id === id) || PENDING.find(b => b.id === id) || RECENT.find(b => b.id === id);
}
function sheet() {
  const b = findBooking(S.sheet);
  if (!b) return "";
  const others = ROLE === "owner" ? SET.artists.filter(a => a.id !== b.artist && artistFree(a.id, b.date, b.start, b.dur, b.id)) : [];
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
    ${b.status === "pending" ? `<button class="btn" data-act="accept" data-v="${esc(b.id)}">Подтвердить запись</button>` : clientMsgButtons(b)}
    ${b.status !== "cancelled" ? (S.armed === b.id
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
  if (S.mode === "owner" && USER && ROLE && !ownerDenied && SET) bar.innerHTML = (S.view === "settings" && ROLE === "owner" ? saveBar() : "") + ownerTabs();
}

function render(keepScroll) {
  topBar();
  let html = "", b = "";
  if (S.mode === "client") {
    if (!setLoaded) html = loading();
    else if (!SET) html = `<div class="note">${ICON.info}<span>${setError ? "Не удалось загрузить данные салона. Проверьте подключение к интернету." : "Салон ещё не настроен. Владельцу нужно войти в кабинет салона."}</span></div><a class="linkbtn" href="#owner" style="align-self:center;text-decoration:none">Вход для владельца салона</a>`;
    else switch (S.view) {
      case "services": html = vServices(); b = barServices(); break;
      case "artist": html = vArtist(); b = barArtist(); break;
      case "time": html = vTime(); b = barTime(); break;
      case "details": html = vDetails(); b = barDetails(); break;
      case "bookings": html = vBookings(); b = clientTabs(); break;
      case "gallery": html = vGallery(); b = barGallery(); break;
      case "photo": html = vPhoto(); b = barPhoto(); break;
      default: html = vHome(); b = barHome() + clientTabs();
    }
  } else {
    if (!authReady) html = loading();
    else if (!USER) html = vLogin();
    else if (needVerify) html = vVerify();
    else if (roleChecking) html = loading();
    else if (noStaff) html = vNoStaff();
    else if (ownerDenied || !ROLE) html = vDenied();
    else if (!setLoaded || !SET) html = loading();
    else {
      switch (S.view) {
        case "inbox": html = vInbox(); break;
        case "works": html = vWorks(); break;
        case "report": html = ROLE === "owner" ? vReport() : vJournal(); break;
        case "reportMaster": html = ROLE === "owner" ? vReportMaster() : vJournal(); break;
        case "settings": html = ROLE === "master" ? vMasterAccount() : vSettings(); break;
        default: html = vJournal();
      }
      b = (S.view === "settings" && ROLE === "owner" ? saveBar() : "") + ownerTabs();
    }
  }
  const y = window.scrollY;
  main.innerHTML = html; bar.innerHTML = b;
  overlay.innerHTML = (S.mode === "owner" && S.sheet && SET && USER) ? sheet() : "";
  main.style.paddingBottom = (bar.offsetHeight + 24) + "px";
  window.scrollTo(0, keepScroll ? y : 0);
}
function go(view) { S.view = view; S.armed = null; S.sheet = null; if (view !== "bookings") S.lastBooked = false; if (view === "report") loadReport(); render(false); }

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
      try { await updateDoc(doc(db, "bookings", v), { status: "confirmed", updated: Date.now() }); S.sheet = v; toast("Запись подтверждена. Сообщите клиенту."); }
      catch (err) { toast(errText(err)); }
      render(true); break;
    case "open": S.sheet = v; S.armed = null; render(true); break;
    case "close": S.sheet = null; S.armed = null; render(true); break;
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
    case "w-hide": { const w = ALL_WORKS.find(x => x.id === v); if (w) { try { await updateDoc(doc(db, "works", v), { hidden: !w.hidden }); toast(w.hidden ? "Фото снова видно клиентам" : "Фото скрыто от клиентов"); } catch (err) { toast(errText(err)); } } break; }
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
  else if (t.id === "fPhone") { S.form.phone = t.value; lsSet("nb-form", S.form); }
  else if (t.id === "fNote") S.form.note = t.value;
  else if (t.id === "lEmail") S.login.email = t.value;
  else if (t.id === "lPw") S.login.pw = t.value;
  else if (t.id === "wTitle" && S.workDraft) S.workDraft.title = t.value;
  else if (t.dataset.d && S.draft) {
    const D = S.draft, p = t.dataset.d.split(":");
    if (p[0] === "name" || p[0] === "area" || p[0] === "phone" || p[0] === "telegram") D[p[0]] = t.value;
    else if (p[0] === "open" || p[0] === "close") { const m = parseHM(t.value); if (m != null) D[p[0]] = m; }
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
    if (!S.dirty) { S.dirty = true; S.draftErr = ""; refreshChrome(); }
  }
});
document.addEventListener("change", async e => {
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
    await setDoc(doc(db, "avatars", id), { img: out, updated: Date.now() });
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
  const id = doc(collection(db, "bookings")).id;
  const now = Date.now();
  const services = S.sel.filter(svcById);
  const data = {
    date: S.date, start: S.time, dur, artist, anyArtist: S.artist === "any",
    services, serviceNames: services.map(x => svcById(x).name), total: Math.round(selTotal()),
    name: f.name.trim().slice(0, 60), phone: f.phone.trim().slice(0, 25), note: f.note.trim().slice(0, 250),
    status: SET.autoConfirm === false ? "pending" : "confirmed", created: now, updated: now, ...(chair ? { chair: true } : {})
  };
  S.saving = true; render(true);
  const save = async () => {
    const batch = writeBatch(db);
    batch.set(doc(db, "bookings", id), data);
    batch.set(doc(db, "busy", id), { date: data.date, start: data.start, dur: data.dur, artist: data.artist, ...(chair ? { chair: true } : {}) });
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
  const ids = lsGet("nb-my", []); ids.unshift(id); lsSet("nb-my", ids.slice(0, 30));
  MY[id] = Object.assign({ id }, data); watchMine();
  S.lastBooked = data.status; S.bookTab = "upcoming";
  Object.assign(S, { sel: [], artist: "any", date: null, time: null, tried: false, form: { name: f.name, phone: f.phone, note: "" } });
  S.view = "bookings"; S.armed = null; render(false);
}
async function cancelBooking(id) {
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, "bookings", id), { status: "cancelled", updated: Date.now() });
    batch.delete(doc(db, "busy", id));
    await batch.commit();
    toast("Запись отменена");
  } catch (err) { toast(errText(err)); }
  S.armed = null; render(true);
}
async function moveBooking(id, artist) {
  const b = findBooking(id);
  if (!b || !artistFree(artist, b.date, b.start, b.dur, b.id)) { toast("У этого мастера уже занято"); render(true); return; }
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, "bookings", id), { artist, anyArtist: false, updated: Date.now() });
    batch.update(doc(db, "busy", id), { artist });
    await batch.commit();
    toast("Запись передана: " + artistName(artist));
  } catch (err) { toast(errText(err)); }
  render(true);
}
async function saveSettings() {
  const D = S.draft;
  const fail = msg => { S.draftErr = msg; refreshChrome(); };
  D.name = (D.name || "").trim(); D.area = (D.area || "").trim(); D.phone = (D.phone || "").trim(); D.telegram = tgUser(D.telegram);
  D.artists = D.artists.map(a => ({ id: a.id, name: (a.name || "").trim(), email: (a.email || "").trim().toLowerCase() }));
  D.services = D.services.map(s => ({ id: s.id, cat: s.cat, name: (s.name || "").trim(), dur: Math.round((Number(s.dur) || 0) / 5) * 5, price: Math.round(Number(s.price) || 0) }));
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
    const id = doc(collection(db, "works")).id, batch = writeBatch(db);
    batch.set(doc(db, "works", id), { artist, cat: D.cat, title: (D.title || "").trim().slice(0, 60), thumb: D.thumb, created: Date.now(), hidden: false });
    batch.set(doc(db, "workImages", id), { img: D.img });
    await batch.commit();
    FULL[id] = D.img; S.workDraft = null; toast("Фото опубликовано. Клиенты уже видят его.");
  } catch (err) { toast(errText(err)); }
  S.wBusy = false; render(true);
}
async function deleteWork(id) {
  try { const batch = writeBatch(db); batch.delete(doc(db, "works", id)); batch.delete(doc(db, "workImages", id)); await batch.commit(); toast("Фото удалено"); }
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
