/* lifeguardclock.js – aus LifeguardClock.html extrahiert (CSP-Migration) */

/* Minimaler Fallback – wird von config.js überschrieben wenn vorhanden. */
if (typeof CONFIG === 'undefined') {
  window.CONFIG = {
    adminPin:     '000000',
    types: [
      { key: 'anwesenheit', label: 'Anwesenheit', logType: 'anwesenheit',
        color: 'blue', pinned: true }
    ],
    defaultUsers: [],
    removedUsers: [],
    cloud: { url: '', user: '', pass: '' },
  };
}

'use strict';

/* ── Typ-Schema-Validierung ────────────────────────────────── */
const VALID_COLORS = new Set(['blue', 'green', 'amber', 'red', 'violet', 'grey', 'orange', 'cyan', 'pink', 'lime']);
const SAFE_KEY_RE  = /^[a-zA-Z0-9_-]+$/;

function normalizeType(t) {
  if (!t || typeof t.key !== 'string' || !SAFE_KEY_RE.test(t.key)) return null;
  if (typeof t.logType !== 'string' || !t.logType) return null;
  const n = { key: t.key, logType: t.logType };
  n.label = (typeof t.label === 'string' && t.label) ? t.label : t.key;
  n.color = VALID_COLORS.has(t.color) ? t.color : 'green';
  if (typeof t.pinned === 'boolean') n.pinned = t.pinned;
  if (typeof t.permissionKey === 'string') n.permissionKey = t.permissionKey;
  if (typeof t.requiresZeitfenster === 'boolean') n.requiresZeitfenster = t.requiresZeitfenster;
  if (typeof t.maxDurationMs === 'number' && t.maxDurationMs > 0) n.maxDurationMs = t.maxDurationMs;
  if (typeof t.cooldownMs === 'number' && t.cooldownMs > 0) n.cooldownMs = t.cooldownMs;
  if (typeof t.order === 'number') n.order = t.order;
  if (typeof t.disabled === 'boolean') n.disabled = t.disabled;
  if (Array.isArray(t.autoStartKeys)) n.autoStartKeys = t.autoStartKeys.filter(k => typeof k === 'string');
  if (Array.isArray(t.mutexKeys))     n.mutexKeys     = t.mutexKeys.filter(k => typeof k === 'string');
  if (t.zeitfenster && typeof t.zeitfenster === 'object') n.zeitfenster = t.zeitfenster;
  return n;
}

/* ── CONFIG ─────────────────────────────────────────────────── */
function getUsers() {
  const removeIds = new Set(CONFIG.removedUsers || []);
  // Defaults ohne gelöschte Einträge (gefiltert + geklont)
  const defaults  = CONFIG.defaultUsers
    .filter(u => !removeIds.has(u.id))
    .map(u => ({...u}));

  let stored;
  try { stored = JSON.parse(localStorage.getItem('lgc_users') || 'null'); } catch {}
  if (!Array.isArray(stored)) {
    // Kein oder ungültiger Storage – Defaults speichern und zurückgeben
    localStorage.setItem('lgc_users', JSON.stringify(defaults));
    return defaults;
  }

  // Strukturell ungültige Einträge verwerfen, dann gelöschte entfernen
  stored = stored.filter(u => u && typeof u.id === 'string' && u.id
                            && typeof u.name === 'string');
  stored = stored.filter(u => !removeIds.has(u.id));
  // Fehlende Default-Einträge ergänzen (bereits gefiltert und geklont)
  const storedIds = new Set(stored.map(u => u.id));
  const newUsers  = defaults.filter(u => !storedIds.has(u.id)).map(u => ({...u}));
  const result    = newUsers.length ? [...stored, ...newUsers] : stored;
  localStorage.setItem('lgc_users', JSON.stringify(result));
  return result;
}
function saveUsers(list) {
  localStorage.setItem('lgc_users', JSON.stringify(list));
  USERS.length = 0;
  list.forEach(u => USERS.push(u));
  scheduleUsersCloudSync();
}

/* ── Cloud-Konfiguration: Overlay beim Start ─────────────────
   pullConfigFromCloud() speichert die Cloud-Konfig in localStorage.
   Dieser Block liest sie beim App-Start und mergt sie in CONFIG,
   BEVOR die abgeleiteten Konstanten (TYPES, ADMIN_PIN usw.) berechnet werden.
   cloud.* und deviceId werden nie überschrieben (Sicherheit / Bootstrapping). */
;(function applyCloudConfigOverlay() {
  const DEVICE_FIELDS = ['adminPin', 'dayBoundaryHour', 'pinClearSeconds',
                         'autoLogoutSeconds', 'screensaverSeconds', 'zeitfensterDefaults'];
  // ── Gerätespezifische Felder aus lgc_config_cloud ────────────
  let typeOverrides = {};
  try {
    const raw = localStorage.getItem('lgc_config_cloud');
    if (raw) {
      const ov = JSON.parse(raw);
      if (ov && typeof ov === 'object') {
        DEVICE_FIELDS.forEach(k => { if (k in ov) CONFIG[k] = ov[k]; });
        typeOverrides = ov.typeOverrides || {};
        // Legacy: komplette types-Array in device config (vor v0.6)
        if (Array.isArray(ov.types) && ov.types.length > 0 && !localStorage.getItem('lgc_cloud_types')) {
          CONFIG.types = ov.types;
        }
      }
    }
  } catch {}
  // ── Globale Typen aus lgc_cloud_types + per-device Overrides ─
  try {
    const rawTypes = localStorage.getItem('lgc_cloud_types');
    if (!rawTypes) return;
    const cloudTypes = JSON.parse(rawTypes);
    if (!Array.isArray(cloudTypes) || cloudTypes.length === 0) return;
    const validTypes = cloudTypes.map(normalizeType).filter(Boolean);
    if (validTypes.length === 0) return;
    CONFIG.types = validTypes.map(t => {
      const ov = typeOverrides[t.key];
      if (!ov) return t;
      const merged = { ...t };
      if ('disabled' in ov) merged.disabled = ov.disabled;
      if (ov.zeitfenster)   merged.zeitfenster = ov.zeitfenster;
      return merged;
    });
  } catch {}
})();

let USERS = getUsers();
const ADMIN_PIN = CONFIG.adminPin;
const PIN_LEN   = 6;

/* ── Gerätekennung ───────────────────────────────────────────
   Priorität: CONFIG.deviceId → lesbarer Auto-Name (Plattform + 4 Hex)
   Beispiele: iphone-3f7a  ipad-9b2c  android-x4f2  win-1a5e       */
function detectPlatformPrefix() {
  const ua = (navigator.userAgent || '').toLowerCase();
  const pl = (navigator.platform  || '').toLowerCase();
  if (/ipad/.test(ua))                       return 'ipad';
  if (/iphone/.test(ua))                     return 'iphone';
  if (/android/.test(ua) && /mobile/.test(ua)) return 'android';
  if (/android/.test(ua))                    return 'android-tab';
  if (/win/.test(pl))                        return 'win';
  if (/mac/.test(pl) && !/iphone|ipad/.test(ua)) return 'mac';
  if (/linux/.test(pl))                      return 'linux';
  return 'geraet';
}
function randomHex(len) {
  // crypto.randomUUID() ist ab Chrome 92 / Firefox 95 / Safari 15.4 verfügbar.
  // Fallback für ältere Android WebViews: Math.random() (statistisch ausreichend
  // für eine Geräte-ID mit wenigen Geräten).
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, '').slice(0, len);
  }
  return Array.from({ length: len }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}
function getDeviceId() {
  if (CONFIG.deviceId) return CONFIG.deviceId.trim();
  const KEY = 'lgc_device_id';
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = `${detectPlatformPrefix()}-${randomHex(6)}`;
    localStorage.setItem(KEY, id);
  }
  return id;
}
const DEVICE_ID   = getDeviceId();
const APP_VERSION = '0.8';

/* ── Proxy-Erkennung (admin-server.py auf localhost) ─────────
   Wenn die App über den lokalen Python-Proxy läuft, werden alle
   /remote.php/* Anfragen transparent an Nextcloud weitergeleitet –
   kein CORS-Problem, URL-Feld optional.
*/
const IS_PROXY = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
if (IS_PROXY) document.body.classList.add('proxy-layout');

/* ── Cloud-Konfiguration aus config.js übernehmen (nur wenn noch leer)
   Bedingung: user gesetzt (url ist im Proxy-Modus optional) */
if (CONFIG.cloud?.user && !localStorage.getItem('lgc_cloud')) {
  localStorage.setItem('lgc_cloud', JSON.stringify({
    url:  CONFIG.cloud.url  || '',
    user: CONFIG.cloud.user,
    pass: CONFIG.cloud.pass || '',
  }));
}

/* ── CRYPTO ──────────────────────────────────────────── */
async function hashPIN(pin, salt) {
  const data = new TextEncoder().encode(salt + ':' + pin);
  const buf  = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verifyPIN(entered, user) {
  // mustChangePIN: true → PIN ist Klartext (Einmal-PIN)
  if (user.mustChangePIN || !user.salt) return entered === user.pin;
  return (await hashPIN(entered, user.salt)) === user.pin;
}

function randomSalt() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

// Prüft ob eine PIN bereits von einem anderen Benutzer verwendet wird
async function isPINTaken(pin, excludeId) {
  for (const u of USERS) {
    if (u.id === excludeId) continue;
    if (u.mustChangePIN || !u.salt) {
      if (u.pin === pin) return true;
    } else {
      if ((await hashPIN(pin, u.salt)) === u.pin) return true;
    }
  }
  return false;
}

// Gibt true zurück wenn die PIN zu schwach ist
function isWeakPIN(pin) {
  if (/^(.)\1{5}$/.test(pin)) return true;
  const n = [...pin].map(Number);
  const diffs = n.slice(1).map((d, i) => d - n[i]);
  if (diffs.every(d => d === 1))  return true;
  if (diffs.every(d => d === -1)) return true;
  return false;
}

// Typen aus config.js ableiten (deaktivierte Typen ausblenden, nach order sortieren)
const TYPES = (CONFIG.types || [])
  .filter(t => !t.disabled)
  .map((t, i) => ({ _origIdx: i, ...t }))
  .sort((a, b) => {
    const ao = a.order ?? Infinity, bo = b.order ?? Infinity;
    if (ao !== bo) return ao - bo;
    return a._origIdx - b._origIdx;  // gleiche order → Originalreihenfolge
  })
  .map(({ _origIdx, ...t }) => t);
const TIME_KEYS = TYPES.filter(t => t.requiresZeitfenster).map(t => t.key);

// Dynamische CSS-Badge-Klassen für Typ-Farben in Admin/Log-Ansicht
function injectTypeCSS() {
  const varMap = { blue: '--blue', green: '--green', amber: '--amber', red: '--red', violet: '--violet', grey: '--grey', orange: '--orange', cyan: '--cyan', pink: '--pink', lime: '--lime' };
  const lines  = TYPES.map(t => {
    const v = varMap[t.color] || '--green';
    return `.badge-${t.key} { background: var(${v}-dim); color: var(${v}); }`;
  });
  const style = document.createElement('style');
  style.textContent = lines.join('\n');
  document.head.appendChild(style);
}
injectTypeCSS();

// Typkonfiguration in localStorage persistieren, damit Dashboard/Editor
// die konfigurierten Farben lesen können ohne config.js zu benötigen.
localStorage.setItem('lgc_type_config', JSON.stringify(
  TYPES.map(t => ({ logType: t.logType, label: t.label, color: t.color }))
));

/* ── STATE ──────────────────────────────────────────────────── */
let currentUser = null;
let pinBuffer   = '';
let idleTimer   = null;
let idleCount   = CONFIG.autoLogoutSeconds ?? 20;
const IDLE_SECONDS = CONFIG.autoLogoutSeconds ?? 20;

/* ── STORAGE HELPERS ────────────────────────────────────────── */
function markLocalChange() {
  localStorage.setItem('lgc_cloud_last_change', new Date().toISOString());
}

// Log-Key trägt immer den logischen Kalendermonat → automatische Monats-Rotation.
// Beispiel: lgc_log_2026-03.  Stempel nahe Mitternacht erhalten dank dayBoundaryHour
// den korrekten logischen Monat (todayISO basiert auf lokaler Zeit).
function logKey() {
  return `lgc_log_${todayISO().slice(0, 7)}`;
}
function getLog() {
  try { return JSON.parse(localStorage.getItem(logKey()) || '[]'); }
  catch { showToast('⚠ Logdaten beschädigt – bitte Admin informieren'); return []; }
}
// Vormonat-Log für Monatswechsel-Lookups (z. B. Auto-Stop an Monatsende)
function getPrevLog() {
  const d = new Date();
  if (d.getHours() < (CONFIG.dayBoundaryHour ?? 4)) d.setDate(d.getDate() - 1);
  const m = d.getMonth(); // 0-indexed; 0 = Januar
  const key = m === 0
    ? `lgc_log_${d.getFullYear() - 1}-12`
    : `lgc_log_${d.getFullYear()}-${pad(m)}`;
  try { return JSON.parse(localStorage.getItem(key) || '[]'); }
  catch { return []; }
}
function saveLog(log) {
  localStorage.setItem(logKey(), JSON.stringify(log));
  markLocalChange();
  writeLocalBackup();    // Backup-Snapshot sofort
  scheduleCloudSync();   // Cloud-Sync verzögert (60 s Debounce)
}
function addEntry(entry) {
  const log = getLog();
  log.push({ id: Date.now() + Math.random(), ...entry });
  saveLog(log);
  const u = getUsers().find(u => u.name === entry.nutzer);
  if (u) pushUserPif(u.id).catch(() => {});
}

function getAllStates() {
  try { return JSON.parse(localStorage.getItem('lgc_state') || '{}'); }
  catch { showToast('⚠ Zustandsdaten beschädigt – bitte Admin informieren'); return {}; }
}
function saveAllStates(s) {
  localStorage.setItem('lgc_state', JSON.stringify(s));
  markLocalChange();
}
function getUserState(uid) {
  const all   = getAllStates();
  const saved = all[uid] || {};
  const state = {};
  TYPES.forEach(t => { state[t.key] = saved[t.key] ?? false; });
  state.cooldown = {};
  TYPES.forEach(t => { state.cooldown[t.key] = saved.cooldown?.[t.key] ?? null; });
  return state;
}
function setTypeActive(uid, key, val) {
  const all = getAllStates();
  if (!all[uid]) { all[uid] = { cooldown: {} }; TYPES.forEach(t => { all[uid][t.key] = false; }); }
  all[uid][key] = val;
  saveAllStates(all);
}

/* ── ZEITFENSTER ────────────────────────────────────────────── */
const _ZF_DAY_KEYS = ['so', 'mo', 'di', 'mi', 'do', 'fr', 'sa'];

// Standard-Zeitfenster für einen Typ (aus Typ-Definition oder globalem Fallback)
function getZFDefaultForType(type) {
  const d = new Date();
  if (d.getHours() < (CONFIG.dayBoundaryHour ?? 4)) d.setDate(d.getDate() - 1);
  const dayKey = _ZF_DAY_KEYS[d.getDay()];
  if (type?.zeitfenster) return type.zeitfenster[dayKey] ?? null;
  return (CONFIG.zeitfensterDefaults?.[dayKey]) ?? { start: '07:00', end: '21:00' };
}

// Heutiges Zeitfenster für einen Typ (tages-Override aus localStorage oder Default)
function getZeitfensterForType(type) {
  try {
    const s = JSON.parse(localStorage.getItem('lgc_zeitfenster') || 'null');
    if (s && s.date === todayISO() && s.types?.[type.key]) return s.types[type.key];
  } catch {}
  return getZFDefaultForType(type);
}

// Heutiges Override für einen Typ speichern
function saveZeitfensterForType(typeKey, start, end) {
  let s = {};
  try { s = JSON.parse(localStorage.getItem('lgc_zeitfenster') || '{}'); } catch {}
  if (s.date !== todayISO()) s = { date: todayISO(), types: {} };
  if (!s.types) s.types = {};
  s.types[typeKey] = { start, end };
  localStorage.setItem('lgc_zeitfenster', JSON.stringify(s));
}

function timeToMin(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}
function isWithinZeitfensterForType(type) {
  const zf = getZeitfensterForType(type);
  if (!zf) return false;
  const now   = timeToMin(currentHHMM());
  const start = timeToMin(zf.start);
  const end   = timeToMin(zf.end);
  if (start < end)  return now >= start && now < end;   // normal:           07:00–21:00
  if (start > end)  return now >= start || now < end;   // über Mitternacht: 22:00–02:00
  return false;                                          // start === end → leerer Bereich
}
function todayISO(d = new Date()) {
  const boundary = CONFIG.dayBoundaryHour ?? 4;
  const dt = new Date(d);
  if (dt.getHours() < boundary) dt.setDate(dt.getDate() - 1);
  // lokale Komponenten verwenden – toISOString() würde nach UTC konvertieren
  // und kann in deutschen Zeitzonen rund um Mitternacht den falschen Tag liefern
  return `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}`;
}

function currentHHMM() {
  const n = new Date();
  return `${pad(n.getHours())}:${pad(n.getMinutes())}`;
}

/* ── LOKALES BACKUP (nur localStorage, kein Cloud-Sync) ─────── */
function writeLocalBackup() {
  const day = todayISO();
  const log = getLog();
  localStorage.setItem(`lgc_backup_${day}`, JSON.stringify({
    ts:    new Date().toISOString(),
    count: log.length,
    log,
  }));
}
writeLocalBackup(); // Sofort beim Laden

// Runs every 10 s — stops sessions of types whose window has expired
function checkZeitfensterEnd() {
  const allStates = getAllStates();
  const now       = new Date().toISOString();
  let changed     = false;

  USERS.forEach(user => {
    const state = allStates[user.id];
    if (!state) return;
    TIME_KEYS.forEach(key => {
      if (!state[key]) return;
      const type   = TYPES.find(t => t.key === key);
      if (isWithinZeitfensterForType(type)) return;
      const durMs  = calcDurationMs(user.name, type.logType, now);
      const log    = getLog();
      log.push({ id: Date.now() + Math.random(), nutzer: user.name, typ: type.logType, aktion: 'stop', zeitstempel: now, auto: true, dauer_ms: durMs });
      saveLog(log);
      state[key] = false;
      changed = true;
      if (currentUser && currentUser.id === user.id) {
        syncDashboard();
        showToast(`Zeitfenster abgelaufen – ${type.label} beendet`);
      }
    });
  });

  if (changed) saveAllStates(allStates);
}
setInterval(checkZeitfensterEnd, 10000);

// Läuft alle 10 s – stoppt Typen mit maxDurationMs automatisch und setzt Cooldown
function checkTimeLimits() {
  const allStates = getAllStates();
  const now       = new Date();
  let changed     = false;

  USERS.forEach(user => {
    const state = allStates[user.id];
    if (!state) return;

    TYPES.forEach(type => {
      if (!type.maxDurationMs || !state[type.key]) return;
      const startMs = getTypeStartMs(user.name, type.logType);
      if (startMs === null) return;
      if (now.getTime() - startMs < type.maxDurationMs) return;

      // Auto-Stop
      const stopTs = new Date(startMs + type.maxDurationMs).toISOString();
      const log    = getLog();
      log.push({ id: Date.now() + Math.random(), nutzer: user.name, typ: type.logType, aktion: 'stop',
        zeitstempel: stopTs, auto: true, dauer_ms: type.maxDurationMs });
      saveLog(log);
      state[type.key] = false;

      // Cooldown setzen
      if (type.cooldownMs) {
        if (!state.cooldown) state.cooldown = {};
        state.cooldown[type.key] = new Date(now.getTime() + type.cooldownMs).toISOString();
      }

      allStates[user.id] = state;
      changed = true;

      if (currentUser && currentUser.id === user.id) {
        syncDashboard();
        const hours    = Math.round(type.maxDurationMs / 3600000);
        const minPause = type.cooldownMs ? Math.round(type.cooldownMs / 60000) : 0;
        showToast(`${type.label}: ${hours}h-Limit erreicht${minPause ? `\nBitte ${minPause} min pausieren` : ''}`);
      }
    });
  });

  if (changed) saveAllStates(allStates);
}
setInterval(checkTimeLimits, 10000);

// Läuft alle 30 s – schließt alle offenen Sitzungen beim Tageswechsel (4-Uhr-Grenze)
let _lastKnownDay = todayISO();
function checkDayBoundary(now = new Date()) {
  const currentDay = todayISO(now);
  if (currentDay === _lastKnownDay) return;
  _lastKnownDay = currentDay;

  // Stoppt alle aktiven Sitzungen zum exakten Grenzzeitpunkt (z. B. 04:00:00)
  const boundary  = CONFIG.dayBoundaryHour ?? 4;
  const boundaryTs = new Date(now);
  boundaryTs.setHours(boundary, 0, 0, 0);
  const stopTs    = boundaryTs.toISOString();
  const allStates = getAllStates();
  let changed     = false;

  USERS.forEach(user => {
    const state = allStates[user.id];
    if (!state) return;
    TYPES.forEach(type => {
      if (!state[type.key]) return;
      const durMs = calcDurationMs(user.name, type.logType, stopTs);
      const log   = getLog();
      log.push({ id: Date.now() + Math.random(), nutzer: user.name, typ: type.logType,
        aktion: 'stop', zeitstempel: stopTs, auto: true, dauer_ms: durMs });
      saveLog(log);
      state[type.key] = false;
      changed = true;
    });
  });

  if (changed) {
    saveAllStates(allStates);
    writeLocalBackup();
  }
}
setInterval(checkDayBoundary, 30000);

/* ── IDLE TIMER ─────────────────────────────────────────────── */
function updateIdleDisplay() {
  const el  = document.getElementById('idle-counter');
  const num = document.getElementById('idle-num');
  if (!el || !num) return;
  num.textContent = idleCount;
  el.className = 'idle-counter' +
    (idleCount <= 5 ? ' danger' : idleCount <= 10 ? ' warning' : '');
}

function startIdleTimer() {
  idleCount = IDLE_SECONDS;
  updateIdleDisplay();
  clearInterval(idleTimer);
  idleTimer = setInterval(() => {
    idleCount--;
    updateIdleDisplay();
    if (idleCount <= 0) { stopIdleTimer(); logout(); }
  }, 1000);
}

function resetIdleTimer() {
  if (!idleTimer) return;
  idleCount = IDLE_SECONDS;
  updateIdleDisplay();
}

function stopIdleTimer() {
  clearInterval(idleTimer);
  idleTimer = null;
}

// Reset on any interaction while dashboard is visible
['click', 'touchstart', 'keydown'].forEach(evt =>
  document.addEventListener(evt, () => {
    if (document.getElementById('screen-dashboard').classList.contains('active'))
      resetIdleTimer();
  }, { passive: true })
);

/* ── STRING HELPERS ─────────────────────────────────────────── */
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ── DURATION HELPERS ───────────────────────────────────────── */
function fmtDuration(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${pad(m)}min`;
  if (m > 0) return `${m}min ${pad(sec)}s`;
  return `${sec}s`;
}

function calcDuration(userName, logType) {
  const log = getLog();
  for (let i = log.length - 1; i >= 0; i--) {
    const e = log[i];
    if (e.nutzer === userName && e.typ === logType && e.aktion === 'start')
      return fmtDuration(Date.now() - new Date(e.zeitstempel).getTime());
  }
  return null;
}
// Returns duration in ms; atTs = stop timestamp (defaults to now)
function calcDurationMs(userName, logType, atTs) {
  const atTime = atTs ? new Date(atTs).getTime() : Date.now();
  // Suche erst im aktuellen Monats-Log, dann im Vormonat (Monatswechsel-Bug-Fix)
  for (const log of [getLog(), getPrevLog()]) {
    for (let i = log.length - 1; i >= 0; i--) {
      const e = log[i];
      if (e.nutzer !== userName || e.typ !== logType) continue;
      if (e.aktion === 'stop')  return 0;  // stop vor start → keine offene Sitzung
      if (e.aktion === 'start') return Math.max(0, atTime - new Date(e.zeitstempel).getTime());
    }
  }
  return 0;
}

// Gibt den Startzeitpunkt (epoch-ms) der aktuellen Sitzung für einen Typ zurück, oder null
function getTypeStartMs(userName, logType) {
  for (const log of [getLog(), getPrevLog()]) {
    for (let i = log.length - 1; i >= 0; i--) {
      const e = log[i];
      if (e.nutzer === userName && e.typ === logType) {
        return e.aktion === 'start' ? new Date(e.zeitstempel).getTime() : null;
      }
    }
  }
  return null;
}

// Gibt verbleibende ms bis maxDurationMs zurück, oder null wenn kein Limit / nicht aktiv
function typeRemainingMs(userName, type) {
  if (!type.maxDurationMs) return null;
  const startMs = getTypeStartMs(userName, type.logType);
  if (startMs === null) return null;
  return Math.max(0, type.maxDurationMs - (Date.now() - startMs));
}

/* ── CLOCK ──────────────────────────────────────────────────── */
const DAYS   = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'];
const MONTHS = ['Januar','Februar','März','April','Mai','Juni','Juli',
                'August','September','Oktober','November','Dezember'];

function pad(n) { return String(n).padStart(2, '0'); }

function fmtTime(d) { return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; }
function fmtDate(d) { return `${DAYS[d.getDay()]}, ${d.getDate()}. ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; }

function updateElapsedTimes() {
  if (!currentUser) return;
  const state = getUserState(currentUser.id);
  const log   = getLog();
  const nowMs = Date.now();
  TYPES.forEach(({ key, logType }) => {
    const el = document.getElementById(`elapsed-time-${key}`);
    if (!el || !state[key]) return;
    // Akkumuliert verlängerte Segmente (extend:true) zur Gesamtlaufzeit
    let totalMs    = 0;
    let collecting = false;
    let extending  = false;
    for (let i = log.length - 1; i >= 0; i--) {
      const e = log[i];
      if (e.nutzer !== currentUser.name || e.typ !== logType) continue;
      if (e.aktion === 'start') {
        if (!collecting) {
          totalMs   += nowMs - new Date(e.zeitstempel).getTime();
          collecting = true;
          extending  = !!e.extend;
        } else if (extending && e.extend) {
          continue; // Zwischen-Start bereits über dauer_ms des Stop erfasst
        } else {
          break;
        }
      } else if (e.aktion === 'stop') {
        if (collecting && e.extend) {
          totalMs += e.dauer_ms || 0;
        } else if (collecting) {
          break;
        }
      }
    }
    if (collecting) {
      const sec = Math.floor(totalMs / 1000);
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      const s = sec % 60;
      el.textContent = h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
    }
  });
}

function tickClock() {
  const now = new Date();
  const ts  = fmtTime(now);
  document.getElementById('login-clock').textContent = ts;
  document.getElementById('dash-clock').textContent  = ts;
  document.getElementById('login-date').textContent  = fmtDate(now);
  document.getElementById('ss-time').textContent     = ts;
  document.getElementById('ss-date').textContent     = fmtDate(now);
  if (currentUser && document.getElementById('screen-dashboard').classList.contains('active')) {
    updateElapsedTimes();
    updateTimerNotices();
  }
}

setInterval(tickClock, 1000);
tickClock();

/* ── SCREENS ────────────────────────────────────────────────── */
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  if (id === 'screen-login') {
    clearPIN();
    startSsTimer();
  } else {
    stopSsTimer();
  }
}

/* ── PIN LOGIC ──────────────────────────────────────────────── */
function refreshDots() {
  document.querySelectorAll('#pin-dots .pin-dot').forEach((dot, i) => {
    dot.classList.toggle('filled', i < pinBuffer.length);
  });
}

let pinIdleTimer = null;
function clearPIN(msg) {
  pinBuffer = '';
  refreshDots();
  const el = document.getElementById('pin-error');
  el.textContent = msg || '';
  if (pinIdleTimer) { clearTimeout(pinIdleTimer); pinIdleTimer = null; }
}
function resetPinIdleTimer() {
  if (pinIdleTimer) clearTimeout(pinIdleTimer);
  if (pinBuffer.length === 0) { pinIdleTimer = null; return; }
  const _pinClearMs = (CONFIG.pinClearSeconds ?? 15) * 1000;
  if (_pinClearMs > 0) pinIdleTimer = setTimeout(() => { clearPIN(); }, _pinClearMs);
}

function pushDigit(d) {
  if (pinBuffer.length >= PIN_LEN) return;
  pinBuffer += d;
  refreshDots();
  resetPinIdleTimer();
  if (pinBuffer.length === PIN_LEN) setTimeout(submitPIN, 160);
}

function popDigit() {
  if (!pinBuffer.length) return;
  pinBuffer = pinBuffer.slice(0, -1);
  refreshDots();
  document.getElementById('pin-error').textContent = '';
  resetPinIdleTimer();
}

let _pinSubmitting = false;
async function submitPIN() {
  if (_pinSubmitting) return;
  _pinSubmitting = true;
  try {
    if (pinBuffer === ADMIN_PIN) {
      clearPIN();
      showAdminPwPrompt();
      return;
    }
    let matchedUser = null;
    for (const u of USERS) {
      if (await verifyPIN(pinBuffer, u)) { matchedUser = u; break; }
    }
    if (matchedUser) {
      currentUser = matchedUser;
      clearPIN();
      if (matchedUser.mustChangePIN) {
        showChangePINOverlay(matchedUser);
      } else {
        openDashboard();
      }
    } else {
      document.getElementById('pin-error').textContent = 'Ungültige PIN';
      const dots = document.getElementById('pin-dots');
      dots.classList.remove('shake');
      void dots.offsetWidth; // reflow to restart animation
      dots.classList.add('shake');
      setTimeout(() => { dots.classList.remove('shake'); clearPIN(); }, 520);
    }
  } finally {
    _pinSubmitting = false;
  }
}

// Keypad input – gemeinsame Verarbeitungsfunktion
function handleKeyInput(key) {
  key.classList.add('pressed');
  setTimeout(() => key.classList.remove('pressed'), 160);
  if (key.dataset.digit !== undefined) pushDigit(key.dataset.digit);
  else if (key.dataset.action === 'del') popDigit();
  else if (key.dataset.action === 'ok' && pinBuffer.length === PIN_LEN) submitPIN();
}

// Touchend: schnelle Reaktion auf Touchscreens (kein 300-ms-Delay, z. B. Fire-Tablet / Silk)
let _keypadLastTouch = 0;
document.getElementById('keypad').addEventListener('touchend', e => {
  const key = e.target.closest('.key');
  if (!key) return;
  if (e.cancelable) e.preventDefault(); // verhindert synthetischen Click – nur wenn erlaubt
  _keypadLastTouch = Date.now();
  handleKeyInput(key);
}, { passive: false });

// Click (Maus / synthetischer Touch-Click – ignoriert wenn touchend kurz zuvor gefeuert hat)
document.getElementById('keypad').addEventListener('click', e => {
  if (Date.now() - _keypadLastTouch < 500) return;
  const key = e.target.closest('.key');
  if (!key) return;
  handleKeyInput(key);
});

// Physical keyboard
document.addEventListener('keydown', e => {
  if (!document.getElementById('screen-login').classList.contains('active')) return;
  if (e.key >= '0' && e.key <= '9') pushDigit(e.key);
  else if (e.key === 'Backspace') popDigit();
  else if (e.key === 'Enter' && pinBuffer.length === PIN_LEN) submitPIN();
});


/* ── PIN-ÄNDERN OVERLAY ─────────────────────────────── */
let _cpUser   = null;
let _cpBuffer = '';
let _cpFirst  = '';
let _cpStep   = 1;

function showChangePINOverlay(user) {
  _cpUser   = user;
  _cpBuffer = '';
  _cpFirst  = '';
  _cpStep   = 1;
  document.getElementById('pin-change-name').textContent = 'Hallo, ' + user.name + '!';
  document.getElementById('pin-change-step').textContent = 'Neue PIN eingeben';
  document.getElementById('pin-change-error').textContent = '';
  updateCPDots();
  document.getElementById('pin-change-overlay').classList.add('visible');
}

function updateCPDots() {
  document.querySelectorAll('#pin-change-dots .pin-dot').forEach((d, i) => {
    d.classList.toggle('filled', i < _cpBuffer.length);
  });
}

function cpPushDigit(d) {
  if (_cpBuffer.length >= PIN_LEN) return;
  _cpBuffer += d;
  updateCPDots();
  if (_cpBuffer.length === PIN_LEN) setTimeout(cpSubmit, 160);
}

function cpPopDigit() {
  if (!_cpBuffer.length) return;
  _cpBuffer = _cpBuffer.slice(0, -1);
  updateCPDots();
  document.getElementById('pin-change-error').textContent = '';
}

async function cpSubmit() {
  const errEl = document.getElementById('pin-change-error');
  if (_cpStep === 1) {
    if (_cpBuffer === ADMIN_PIN) {
      errEl.textContent = 'Diese PIN ist für den Admin reserviert.';
      _cpBuffer = ''; updateCPDots(); return;
    }
    if (isWeakPIN(_cpBuffer)) {
      errEl.textContent = 'Zu einfach (z. B. 123456 oder 111111) – bitte eine andere PIN wählen.';
      _cpBuffer = ''; updateCPDots(); return;
    }
    _cpFirst  = _cpBuffer;
    _cpBuffer = '';
    _cpStep   = 2;
    document.getElementById('pin-change-step').textContent = 'PIN bestätigen';
    updateCPDots();
    errEl.textContent = '';
  } else {
    if (_cpBuffer !== _cpFirst) {
      errEl.textContent = 'PINs stimmen nicht überein – bitte neu vergeben.';
      _cpBuffer = ''; _cpFirst = ''; _cpStep = 1;
      document.getElementById('pin-change-step').textContent = 'Neue PIN eingeben';
      updateCPDots(); return;
    }
    if (await isPINTaken(_cpFirst, _cpUser.id)) {
      errEl.textContent = 'Diese PIN wird bereits von jemand anderem verwendet.';
      _cpBuffer = ''; _cpFirst = ''; _cpStep = 1;
      document.getElementById('pin-change-step').textContent = 'Neue PIN eingeben';
      updateCPDots(); return;
    }
    const salt    = randomSalt();
    const hash    = await hashPIN(_cpBuffer, salt);
    const updated = { ..._cpUser, pin: hash, salt, mustChangePIN: false };
    saveUsers(USERS.map(u => u.id !== _cpUser.id ? u : updated));
    if (currentUser && currentUser.id === _cpUser.id) currentUser = updated;
    document.getElementById('pin-change-overlay').classList.remove('visible');
    showToast('PIN erfolgreich gesetzt ✓');
    openDashboard();
  }
}

document.getElementById('pin-change-keypad').addEventListener('click', e => {
  const key = e.target.closest('.key');
  if (!key) return;
  key.classList.add('pressed');
  setTimeout(() => key.classList.remove('pressed'), 160);
  if (key.dataset.digit !== undefined) cpPushDigit(key.dataset.digit);
  else if (key.dataset.action === 'del') cpPopDigit();
  else if (key.dataset.action === 'ok' && _cpBuffer.length === PIN_LEN) cpSubmit();
});
/* ── DASHBOARD ──────────────────────────────────────────────── */

// Erzeugt die Action-Group-Elemente dynamisch aus CONFIG.types, gefiltert nach Berechtigungen
function renderDashboardHTML(user) {
  const userPerms  = user.permissions; // undefined = alle Typen sichtbar
  const pinnedEl   = document.getElementById('actions-pinned');
  const scrollEl   = document.getElementById('actions-scroll');
  if (!pinnedEl || !scrollEl) return;

  pinnedEl.innerHTML = '';
  scrollEl.innerHTML = '';

  const colorVars = {
    blue:   '--blue',
    green:  '--green',
    amber:  '--amber',
    red:    '--red',
    violet: '--violet',
    grey:   '--grey',
    cyan:   '--cyan',
    pink:   '--pink',
    orange: '--orange',
    lime:   '--lime',
  };

  const visibleTypes = TYPES.filter(t =>
    !t.permissionKey || !userPerms || userPerms.includes(t.permissionKey)
  );

  if (visibleTypes.length === 0) {
    pinnedEl.innerHTML = `<div style="padding:18px 12px;color:var(--red);font-size:14px;line-height:1.5">
      ⚠ Keine Stempeltypen konfiguriert.<br>
      <span style="color:var(--text-2);font-size:12px">
        Admin → Gerätekonfiguration → „Konfig aktualisieren"<br>
        oder „⚠ Lokale Konfig zurücksetzen"
      </span>
    </div>`;
    return;
  }

  scrollEl.classList.remove('no-scroll');

  visibleTypes.forEach(type => {
    const v   = colorVars[type.color] || '--green';
    const css = `--gc: var(${v}); --gc-dim: var(${v}-dim); --gc-glow: var(${v}-glow);`;

    const timerHtml = type.maxDurationMs ? `
      <div class="group-timer" id="timer-${type.key}">
        <div class="gtimer-label">Ausstempeln in</div>
        <div class="gtimer-countdown" id="timer-count-${type.key}">—</div>
      </div>` : '';

    const html = `
      <div class="action-group" id="group-${type.key}" data-type="${type.key}" style="${css}">
        <div class="group-hdr">
          <div class="group-dot"></div>
          <div class="group-title">${escHtml(type.label)}</div>
          <div class="group-badge off" id="badge-${type.key}">Inaktiv</div>
        </div>
        <div class="group-elapsed">
          <div class="group-elapsed-label">Laufzeit</div>
          <div class="group-elapsed-time" id="elapsed-time-${type.key}">—</div>
        </div>
        ${timerHtml}
        <div class="group-notice" id="notice-${type.key}"></div>
        <div class="group-btns">
          <button class="action-btn btn-start" id="start-${type.key}"
            data-type="${escHtml(type.key)}" data-action="start"
>
            <span class="btn-icon">&#x25B6;</span>
            <span class="btn-lbl">Beginnen</span>
          </button>
          <button class="action-btn btn-stop" id="stop-${type.key}"
            data-type="${escHtml(type.key)}" data-action="stop"
>
            <span class="btn-icon">&#x23F9;</span>
            <span class="btn-lbl">Beenden</span>
          </button>
        </div>
      </div>`;

    ((!IS_PROXY && type.pinned) ? pinnedEl : scrollEl).insertAdjacentHTML('beforeend', html);
  });
}

function openDashboard() {
  localStorage.setItem('lgc_session', JSON.stringify({ uid: currentUser.id, date: todayISO() }));
  document.getElementById('hdr-name').textContent = currentUser.name;
  renderDashboardHTML(currentUser);
  syncDashboard();
  showScreen('screen-dashboard');
  startIdleTimer();
  // Geräteübergreifenden Stand laden: PIF aus Cloud holen und UI aktualisieren
  fetchUserPif(currentUser.id).catch(() => {});
}

function syncDashboard() {
  const state     = getUserState(currentUser.id);
  const userPerms = currentUser.permissions; // undefined = alle sichtbar

  TYPES.forEach(type => {
    const { key } = type;
    // Nicht gerenderte Typen (keine Berechtigung) überspringen
    if (type.permissionKey && userPerms && !userPerms.includes(type.permissionKey)) return;
    const group = document.getElementById(`group-${key}`);
    if (!group) return;

    const active        = !!state[key];
    const inWindow      = type.requiresZeitfenster ? isWithinZeitfensterForType(type) : true;
    const zf            = type.requiresZeitfenster ? getZeitfensterForType(type) : null;
    const blocked       = type.requiresZeitfenster && !inWindow && !active;
    const cooldownUntil = state.cooldown?.[key];
    const inCooldown    = !!(cooldownUntil && new Date(cooldownUntil) > new Date());
    const canExtend     = !!(type.maxDurationMs && active);

    const badge    = document.getElementById(`badge-${key}`);
    const startBtn = document.getElementById(`start-${key}`);
    const stopBtn  = document.getElementById(`stop-${key}`);
    const notice   = document.getElementById(`notice-${key}`);

    group.classList.toggle('is-active', active);
    badge.textContent = active ? 'Aktiv' : 'Inaktiv';
    badge.className   = 'group-badge ' + (active ? 'on' : 'off');

    const icon = startBtn.querySelector('.btn-icon');
    const lbl  = startBtn.querySelector('.btn-lbl');
    if (canExtend) {
      startBtn.disabled = false;
      startBtn.classList.add('extend-mode');
      if (icon) icon.textContent = '↺';
      if (lbl)  lbl.textContent  = 'Verlängern';
    } else if (inCooldown) {
      startBtn.disabled = true;
      startBtn.classList.remove('extend-mode');
      if (icon) icon.textContent = '\u23F8';
      if (lbl)  lbl.textContent  = 'Pause\u2026';
    } else {
      startBtn.disabled = active || blocked;
      startBtn.classList.remove('extend-mode');
      if (icon) icon.textContent = '\u25B6';
      if (lbl)  lbl.textContent  = 'Beginnen';
    }
    stopBtn.disabled = !active;

    if (notice) {
      if (blocked) {
        notice.classList.remove('urgent');
        notice.textContent = zf ? `Nur ${zf.start}\u2013${zf.end} Uhr m\u00f6glich` : 'Heute nicht verf\u00fcgbar';
        notice.classList.add('visible');
      } else if (inCooldown) {
        const remMs = new Date(cooldownUntil) - Date.now();
        notice.textContent = `Pflichtpause \u2013 noch ${fmtDuration(remMs)}`;
        notice.classList.add('urgent', 'visible');
      } else {
        notice.classList.remove('visible', 'urgent');
      }
    }
  });

  // Aktive Typen dynamisch in den Pinned-Bereich verschieben
  if (!IS_PROXY) {
    const pinnedEl  = document.getElementById('actions-pinned');
    const scrollEl  = document.getElementById('actions-scroll');
    const anyActive = TYPES.some(t =>
      !!state[t.key] && !(t.permissionKey && userPerms && !userPerms.includes(t.permissionKey))
    );
    // Immer in TYPES-Reihenfolge einhängen, damit die Reihenfolge nach
    // dem Ausstempeln wiederhergestellt wird (appendChild ans Ende = korrekte Ordnung)
    TYPES.forEach(type => {
      if (type.permissionKey && userPerms && !userPerms.includes(type.permissionKey)) return;
      const group = document.getElementById(`group-${type.key}`);
      if (!group) return;
      const isActive       = !!state[type.key];
      const shouldBePinned = isActive || (!anyActive && type.pinned);
      group.classList.toggle('compact', !shouldBePinned && !isActive);
      (shouldBePinned ? pinnedEl : scrollEl).appendChild(group);
    });
  }
}

// Aktualisiert Countdown-Timer und Cooldown-Anzeigen für alle Typen mit maxDurationMs
function updateTimerNotices() {
  if (!currentUser) return;
  const state = getUserState(currentUser.id);

  TYPES.forEach(type => {
    const { key } = type;
    const timerEl = document.getElementById(`timer-${key}`);
    const countEl = document.getElementById(`timer-count-${key}`);
    const notice  = document.getElementById(`notice-${key}`);

    // Cooldown-Countdown im Notice-Bereich live aktualisieren
    const cooldownUntil = state.cooldown?.[key];
    if (cooldownUntil && new Date(cooldownUntil) > new Date() && notice?.classList.contains('visible')) {
      const remMs = new Date(cooldownUntil) - Date.now();
      notice.textContent = `Pflichtpause \u2013 noch ${fmtDuration(remMs)}`;
    }

    if (!timerEl) return; // Typ hat kein maxDurationMs

    if (!state[key]) {
      timerEl.classList.remove('visible', 'urgent');
      return;
    }

    const remMs = typeRemainingMs(currentUser.name, type);
    if (remMs === null) { timerEl.classList.remove('visible', 'urgent'); return; }

    const totalSec = Math.ceil(remMs / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (countEl) countEl.textContent = h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;

    const urgent = remMs < 10 * 60 * 1000;
    timerEl.classList.toggle('urgent', urgent);
    timerEl.classList.add('visible');
  });
}

function handleAction(key, action) {
  if (!currentUser) return;
  const type = TYPES.find(t => t.key === key);
  if (!type) return;

  const now      = new Date();
  const messages = [];

  // "Verlängern" für Typen mit maxDurationMs, wenn bereits aktiv
  if (action === 'start' && type.maxDurationMs) {
    const state = getUserState(currentUser.id);
    if (state[key]) {
      const durMs = calcDurationMs(currentUser.name, type.logType);
      addEntry({ nutzer: currentUser.name, typ: type.logType, aktion: 'stop',  zeitstempel: now.toISOString(), dauer_ms: durMs, extend: true });
      addEntry({ nutzer: currentUser.name, typ: type.logType, aktion: 'start', zeitstempel: now.toISOString(), extend: true });
      // Cooldown zurücksetzen (User hat aktiv verlängert)
      const allStates = getAllStates();
      if (allStates[currentUser.id]) {
        if (!allStates[currentUser.id].cooldown) allStates[currentUser.id].cooldown = {};
        allStates[currentUser.id].cooldown[key] = null;
        saveAllStates(allStates);
      }
      syncDashboard();
      const hours = Math.round(type.maxDurationMs / 3600000);
      showToast(`${type.label}: Timer verlängert – neue ${hours}h`);
      return;
    }
  }

  // Zeitfenster-Sperre
  if (action === 'start' && type.requiresZeitfenster && !isWithinZeitfensterForType(type)) {
    const zf = getZeitfensterForType(type);
    showToast(zf ? `Nur ${zf.start}\u2013${zf.end} Uhr m\u00f6glich` : 'Heute nicht verf\u00fcgbar');
    return;
  }

  // Cooldown-Sperre
  if (action === 'start') {
    const state         = getUserState(currentUser.id);
    const cooldownUntil = state.cooldown?.[key];
    if (cooldownUntil && new Date(cooldownUntil) > now) {
      const remMs = new Date(cooldownUntil) - now;
      showToast(`${type.label}: Pflichtpause \u2013 noch ${fmtDuration(remMs)}`);
      return;
    }
  }

  // mutexKeys: konfligierende Typen beenden
  if (action === 'start' && type.mutexKeys?.length) {
    const state = getUserState(currentUser.id);
    type.mutexKeys.forEach(otherKey => {
      if (!state[otherKey]) return;
      const otherType  = TYPES.find(t => t.key === otherKey);
      if (!otherType) return;
      const otherDurMs = calcDurationMs(currentUser.name, otherType.logType);
      addEntry({ nutzer: currentUser.name, typ: otherType.logType, aktion: 'stop', zeitstempel: now.toISOString(), dauer_ms: otherDurMs });
      setTypeActive(currentUser.id, otherKey, false);
      messages.push(`${otherType.label} beendet${otherDurMs ? ' (' + fmtDuration(otherDurMs) + ')' : ''}`);
    });
  }

  // Stop eines Typs → abhängige Typen beenden (nur solche, die diesen via autoStartKeys erfordern)
  if (action === 'stop') {
    const state = getUserState(currentUser.id);
    TYPES.forEach(t => {
      if (t.key === key || !state[t.key]) return;
      if (!t.autoStartKeys?.includes(key)) return; // kein autoStartKeys-Bezug → keine Abhängigkeit
      const durMs = calcDurationMs(currentUser.name, t.logType);
      addEntry({ nutzer: currentUser.name, typ: t.logType, aktion: 'stop', zeitstempel: now.toISOString(), dauer_ms: durMs });
      setTypeActive(currentUser.id, t.key, false);
      messages.push(`${t.label} beendet${durMs ? ' (' + fmtDuration(durMs) + ')' : ''}`);
    });
  }

  // autoStartKeys: andere Typen automatisch starten
  if (action === 'start' && type.autoStartKeys?.length) {
    const state = getUserState(currentUser.id);
    type.autoStartKeys.forEach(autoKey => {
      if (state[autoKey]) return;
      const autoType = TYPES.find(t => t.key === autoKey);
      if (!autoType) return;
      addEntry({ nutzer: currentUser.name, typ: autoType.logType, aktion: 'start', zeitstempel: now.toISOString() });
      setTypeActive(currentUser.id, autoKey, true);
      messages.push(`${autoType.label} automatisch gestartet`);
    });
  }

  // Haupt-Aktion
  const durMs = action === 'stop' ? calcDurationMs(currentUser.name, type.logType) : 0;
  addEntry({ nutzer: currentUser.name, typ: type.logType, aktion: action, zeitstempel: now.toISOString(), ...(durMs ? { dauer_ms: durMs } : {}) });
  setTypeActive(currentUser.id, key, action === 'start');

  // Cooldown beim manuellen Start löschen
  if (action === 'start') {
    const allStates = getAllStates();
    if (allStates[currentUser.id]) {
      if (!allStates[currentUser.id].cooldown) allStates[currentUser.id].cooldown = {};
      allStates[currentUser.id].cooldown[key] = null;
      saveAllStates(allStates);
    }
  }

  syncDashboard();
  const verb = action === 'start' ? 'gestartet' : 'beendet';
  const dur  = durMs ? fmtDuration(durMs) : null;
  messages.unshift(`${type.label} ${verb}${dur ? ' (' + dur + ')' : ''}`);
  showToast(messages.join('\n'));
}

document.getElementById('btn-logout').addEventListener('click', () => logout(true));

// explicit=true: Abmelden-Button → Session löschen
// explicit=false (oder Event-Objekt vom Listener): Idle-Timeout → Session behalten
function logout(explicit) {
  stopIdleTimer();
  closeMyHours();
  currentUser = null;
  if (explicit === true) localStorage.removeItem('lgc_session');
  showScreen('screen-login');
}

/* ── CLOUD SYNC – ereignisgesteuert mit Debounce ────────────── */
// Im Proxy-Betrieb (localhost) sofort synchronisieren.
// Im Direkt-Betrieb: 60s Debounce, damit mehrere Stempel gebündelt werden.
let _syncDebounceTimer = null;
const SYNC_DEBOUNCE_MS = IS_PROXY ? 0 : (CONFIG.cloudSyncDebounceSeconds ?? 60) * 1000;

function scheduleCloudSync() {
  if (_syncDebounceTimer) clearTimeout(_syncDebounceTimer);
  _syncDebounceTimer = setTimeout(() => {
    _syncDebounceTimer = null;
    syncToCloud(true);
  }, SYNC_DEBOUNCE_MS);
}

let _usersSyncDebounceTimer = null;
function scheduleUsersCloudSync() {
  if (_usersSyncDebounceTimer) clearTimeout(_usersSyncDebounceTimer);
  _usersSyncDebounceTimer = setTimeout(() => {
    _usersSyncDebounceTimer = null;
    backupUsersToCloud(true);
  }, SYNC_DEBOUNCE_MS);
}

/* ── CLOUD / NEXTCLOUD WEBDAV ───────────────────────────────── */
function getCloudConfig() {
  try { return JSON.parse(localStorage.getItem('lgc_cloud') || 'null'); }
  catch { return null; }
}
function saveCloudConfigData(cfg) {
  localStorage.setItem('lgc_cloud', JSON.stringify(cfg));
}
// Proxy-Modus: URL nicht erforderlich (server kennt Nextcloud-URL aus admin_config.js)
function isCloudConfigured(cfg) {
  return !!(cfg && (IS_PROXY || cfg.url) && cfg.user && cfg.pass);
}

// ── Change-Tracking (hier Platzhalter – Def. bei Storage-Helpers) ──
function getCloudLastOk() {
  // Backwards-compatible: fall back to old key name
  return localStorage.getItem('lgc_cloud_last_ok')
      || localStorage.getItem('lgc_cloud_last')
      || null;
}
function hasPendingCloudData() {
  const lastOk     = getCloudLastOk();
  const lastChange = localStorage.getItem('lgc_cloud_last_change');
  if (!lastChange) return false;
  if (!lastOk)     return true;
  return new Date(lastChange) > new Date(lastOk);
}

// ── Error-Log ────────────────────────────────────────────────
function getCloudErrLog() {
  try { return JSON.parse(localStorage.getItem('lgc_cloud_errors') || '[]'); }
  catch { return []; }
}
function addCloudErr(msg) {
  const log = getCloudErrLog();
  log.unshift({ ts: new Date().toISOString(), msg });
  if (log.length > 20) log.length = 20;
  localStorage.setItem('lgc_cloud_errors', JSON.stringify(log));
  updateCloudStatus();
}
function clearCloudErrors() {
  localStorage.removeItem('lgc_cloud_errors');
  updateCloudStatus();
}

// ── WebDAV helpers ───────────────────────────────────────────
function cloudDavBase(cfg) {
  if (IS_PROXY) return `/remote.php/dav/files/${encodeURIComponent(cfg.user)}/LifeguardClock`;
  let url = cfg.url.trim().replace(/\/$/, '');
  url = url.replace(/\/remote\.php\/dav.*/i, '');
  url = url.replace(/\/index\.php.*/i, '');
  return `${url}/remote.php/dav/files/${encodeURIComponent(cfg.user)}/LifeguardClock`;
}
function cloudHeaders(cfg, extra) {
  return {
    'Authorization': 'Basic ' + btoa(unescape(encodeURIComponent(`${cfg.user}:${cfg.pass}`))),
    'Content-Type': 'application/json',
    ...extra,
  };
}
async function ensureCloudFolder(cfg) {
  try {
    await fetch(cloudDavBase(cfg), {
      method: 'MKCOL',
      headers: { 'Authorization': 'Basic ' + btoa(unescape(encodeURIComponent(`${cfg.user}:${cfg.pass}`))) },
    });
  } catch {}
}

// ── Core sync ────────────────────────────────────────────────
let _syncRunning = false;

async function syncToCloud(silent = false) {
  const cfg = getCloudConfig();
  if (!isCloudConfigured(cfg)) {
    if (!silent) showToast('Cloud nicht konfiguriert – erst speichern');
    return false;
  }
  if (_syncRunning) return false;
  _syncRunning = true;

  const syncBtn = document.getElementById('btn-cloud-sync');
  if (syncBtn) { syncBtn.disabled = true; syncBtn.textContent = '…'; }

  try {
    await ensureCloudFolder(cfg);
    const base    = cloudDavBase(cfg);
    const day     = todayISO();
    const payload = JSON.stringify({
      version:    2,
      exported:   new Date().toISOString(),
      deviceId:   DEVICE_ID,
      logicalDay: day,
      count:      getLog().length,
      log:        getLog(),
      state:      getAllStates(),
    }, null, 2);
    const hdrs = cloudHeaders(cfg);

    const [r1, r2] = await Promise.all([
      fetch(`${base}/lgc_${DEVICE_ID}_${day}.json`,    { method: 'PUT', headers: hdrs, body: payload }),
      fetch(`${base}/lgc_${DEVICE_ID}_latest.json`,    { method: 'PUT', headers: hdrs, body: payload }),
    ]);

    if (r1.ok && r2.ok) {
      const now = new Date().toISOString();
      localStorage.setItem('lgc_cloud_last_ok', now);
      localStorage.setItem('lgc_cloud_last',    now); // legacy compat
      clearCloudErrors();
      if (!silent) showToast('Cloud-Sync erfolgreich');
      updateCloudStatus();
      return true;
    } else {
      const code = r1.status || r2.status;
      const msg  = code === 401 ? 'Authentifizierung fehlgeschlagen' : `HTTP ${code}`;
      addCloudErr(msg);
      if (!silent) showToast(`Cloud-Sync fehlgeschlagen: ${msg}`);
      return false;
    }
  } catch (e) {
    const msg = navigator.onLine ? ('Netzwerkfehler: ' + e.message) : 'Kein Netzwerk';
    addCloudErr(msg);
    if (!silent) showToast(msg);
    return false;
  } finally {
    _syncRunning = false;
    if (syncBtn) { syncBtn.disabled = false; syncBtn.textContent = 'Jetzt synchronisieren'; }
  }
}

// ── Per-User Personal Info Files (PIF) ──────────────────────
// Jeder Nutzer hat eine eigene Cloud-Datei: lgc_pif_<userId>_YYYY-MM.json
// Dadurch ist der aktive Stempel-Status geräteübergreifend konsistent.

function mergeUserEntries(cloudEntries) {
  if (!Array.isArray(cloudEntries) || !cloudEntries.length) return false;
  const log = getLog();
  const existingIds = new Set(log.map(e => e.id));
  const newEntries = cloudEntries.filter(e => !existingIds.has(e.id));
  if (!newEntries.length) return false;
  const merged = [...log, ...newEntries].sort((a, b) => a.id - b.id);
  saveLog(merged);
  return true;
}

async function pushUserPif(userId) {
  const cfg = getCloudConfig();
  if (!isCloudConfigured(cfg)) return;
  const user = getUsers().find(u => u.id === userId);
  if (!user) return;
  const month   = todayISO().slice(0, 7);
  const day     = todayISO();
  const entries = getLog().filter(e => e.nutzer === user.name && e.zeitstempel?.startsWith(day));
  const payload = JSON.stringify({
    version:  1,
    userId,
    userName: user.name,
    month,
    exported: new Date().toISOString(),
    entries,
  });
  try {
    await ensureCloudFolder(cfg);
    await fetch(`${cloudDavBase(cfg)}/lgc_pif_${userId}_${month}.json`,
      { method: 'PUT', headers: cloudHeaders(cfg), body: payload });
  } catch {}
}

async function fetchUserPif(userId) {
  const cfg = getCloudConfig();
  if (!isCloudConfigured(cfg)) return;
  const user = getUsers().find(u => u.id === userId);
  if (!user) return;
  const month  = todayISO().slice(0, 7);
  const months = [month];
  // Vormonat laden falls wir noch vor der Tagesgrenze sind
  const d = new Date();
  if (d.getHours() < (CONFIG.dayBoundaryHour ?? 4)) {
    const m = d.getMonth();
    months.push(m === 0
      ? `${d.getFullYear() - 1}-12`
      : `${d.getFullYear()}-${String(m).padStart(2, '0')}`);
  }
  const base = cloudDavBase(cfg);
  const hdrs = cloudHeaders(cfg);
  let changed = false;
  for (const mon of months) {
    try {
      const resp = await fetch(`${base}/lgc_pif_${userId}_${mon}.json`, { headers: hdrs });
      if (!resp.ok) continue;
      const data = await resp.json();
      if (mergeUserEntries(data.entries)) changed = true;
    } catch {}
  }
  if (changed && currentUser?.id === userId) syncDashboard();
}

// ── Auto-Retry bei Netzwerkrückkehr ─────────────────────────
window.addEventListener('online', () => {
  const cfg = getCloudConfig();
  if (isCloudConfigured(cfg) && hasPendingCloudData()) {
    setTimeout(() => syncToCloud(true), 1500);
  }
  setTimeout(() => silentConfigCheck(), 2000);
});

async function testCloudConnection() {
  const cfg = getCloudConfig();
  if (!isCloudConfigured(cfg)) {
    showToast('Erst Zugangsdaten eingeben und speichern');
    return;
  }
  const btn = document.getElementById('btn-cloud-test');
  if (btn) { btn.disabled = true; btn.textContent = 'Teste…'; }

  try {
    const davRoot = IS_PROXY
      ? `/remote.php/dav/files/${encodeURIComponent(cfg.user)}/`
      : `${cfg.url.trim().replace(/\/$/, '').replace(/\/remote\.php\/dav.*/i, '')}/remote.php/dav/files/${encodeURIComponent(cfg.user)}/`;
    const r = await fetch(
      davRoot,
      { method: 'PROPFIND', headers: { 'Authorization': 'Basic ' + btoa(unescape(encodeURIComponent(`${cfg.user}:${cfg.pass}`))), 'Depth': '0' } }
    );
    if (r.status === 207 || r.status === 200) {
      showToast('Verbindung erfolgreich');
      updateCloudStatus(null, true);
    } else if (r.status === 401) {
      showToast('Falsche Zugangsdaten (HTTP 401)');
      updateCloudStatus('Authentifizierung fehlgeschlagen');
    } else {
      showToast(`Verbindungsfehler: HTTP ${r.status}`);
      updateCloudStatus(`HTTP ${r.status}`);
    }
  } catch (e) {
    showToast('Verbindung fehlgeschlagen – CORS oder URL prüfen');
    updateCloudStatus('Verbindung fehlgeschlagen');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Verbindung testen'; }
  }
}

async function restoreFromCloud() {
  const cfg = getCloudConfig();
  if (!isCloudConfigured(cfg)) { showToast('Cloud nicht konfiguriert'); return; }

  const btn = document.getElementById('btn-cloud-restore');
  if (btn) { btn.disabled = true; btn.textContent = 'Lade…'; }

  try {
    const r = await fetch(
      `${cloudDavBase(cfg)}/lgc_${DEVICE_ID}_latest.json`,
      { headers: { 'Authorization': 'Basic ' + btoa(unescape(encodeURIComponent(`${cfg.user}:${cfg.pass}`))) } }
    );
    if (!r.ok) { showToast(`Fehler beim Laden: HTTP ${r.status}`); return; }
    const data = await r.json();
    const ts   = new Date(data.exported).toLocaleString('de-DE');
    showConfirm(
      `Cloud-Daten vom ${ts} laden?\n${data.count} Einträge\n\nLokale Daten werden überschrieben!`,
      () => {
        saveLog(data.log || []);
        if (data.state) saveAllStates(data.state);
        writeLocalBackup();
        renderAdmin();
        renderStundenOverview();
        showToast(`${data.count} Einträge wiederhergestellt`);
      }
    );
  } catch (e) {
    showToast('Wiederherstellung fehlgeschlagen: ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Wiederherstellen'; }
  }
}

/* ── NUTZER-BACKUP ──────────────────────────────────────────── */
function exportUsersLocal() {
  const payload = JSON.stringify({ version: 1, exported: new Date().toISOString(),
    count: USERS.length, users: USERS }, null, 2);
  const a = Object.assign(document.createElement('a'), {
    href:     URL.createObjectURL(new Blob([payload], { type: 'application/json' })),
    download: `lgc_users_${todayISO()}.json`,
  });
  a.click();
  URL.revokeObjectURL(a.href);
}

async function backupUsersToCloud(silent = false) {
  const cfg = getCloudConfig();
  if (!isCloudConfigured(cfg)) { if (!silent) showToast('Cloud nicht konfiguriert'); return; }
  const btn = document.getElementById('btn-users-up');
  if (btn) { btn.disabled = true; btn.textContent = '…'; }
  try {
    await ensureCloudFolder(cfg);
    const payload = JSON.stringify({ version: 1, exported: new Date().toISOString(),
      count: USERS.length, users: USERS }, null, 2);
    const r = await fetch(`${cloudDavBase(cfg)}/lgc_users.json`,
      { method: 'PUT', headers: cloudHeaders(cfg), body: payload });
    if (!silent) { r.ok ? showToast('Nutzerdaten gesichert') : showToast(`Fehler: HTTP ${r.status}`); }
  } catch (e) { if (!silent) showToast('Sicherung fehlgeschlagen: ' + e.message); }
  finally { if (btn) { btn.disabled = false; btn.textContent = 'In Cloud sichern'; } }
}

async function restoreUsersFromCloud() {
  const cfg = getCloudConfig();
  if (!isCloudConfigured(cfg)) { showToast('Cloud nicht konfiguriert'); return; }
  const btn = document.getElementById('btn-users-down');
  if (btn) { btn.disabled = true; btn.textContent = 'Lade…'; }
  try {
    const r = await fetch(`${cloudDavBase(cfg)}/lgc_users.json`,
      { headers: { 'Authorization': 'Basic ' + btoa(unescape(encodeURIComponent(`${cfg.user}:${cfg.pass}`))) } });
    if (!r.ok) { showToast(`Fehler beim Laden: HTTP ${r.status}`); return; }
    const data = await r.json();
    const ts = new Date(data.exported).toLocaleString('de-DE');
    showConfirm(
      `Nutzerdaten vom ${ts} wiederherstellen?\n${data.count} Nutzer\n\nLokale Nutzerdaten werden überschrieben!`,
      () => {
        saveUsers(data.users || []);
        renderUsersSection();
        renderStundenOverview();
        showToast(`${data.count} Nutzer wiederhergestellt`);
      }
    );
  } catch (e) { showToast('Wiederherstellung fehlgeschlagen: ' + e.message); }
  finally { if (btn) { btn.disabled = false; btn.textContent = 'Aus Cloud wiederherstellen'; } }
}

/* ── GERÄTEKONFIGURATION: CLOUD-SYNC ────────────────────────── */
async function pushConfigToCloud(silent = false) {
  const cfg = getCloudConfig();
  if (!isCloudConfigured(cfg)) { if (!silent) showToast('Cloud nicht konfiguriert'); return; }
  const btn = document.getElementById('btn-cfg-up');
  if (btn) { btn.disabled = true; btn.textContent = '…'; }
  try {
    await ensureCloudFolder(cfg);
    // Nur gerätespezifische Felder hochladen — keine Nutzer, keine Cloud-Zugangsdaten
    const DEVICE_FIELDS = ['adminPin', 'dayBoundaryHour', 'pinClearSeconds',
                           'autoLogoutSeconds', 'screensaverSeconds', 'zeitfensterDefaults'];
    const exportable = {};
    DEVICE_FIELDS.forEach(k => { if (k in CONFIG) exportable[k] = CONFIG[k]; });
    // Per-device Overrides: nur disabled + zeitfenster pro Typ
    const typeOverrides = {};
    (CONFIG.types || []).forEach(t => {
      const ov = {};
      if (t.disabled)    ov.disabled    = true;
      if (t.zeitfenster) ov.zeitfenster = t.zeitfenster;
      if (Object.keys(ov).length) typeOverrides[t.key] = ov;
    });
    if (Object.keys(typeOverrides).length) exportable.typeOverrides = typeOverrides;
    const payload = JSON.stringify({
      version: 1, exported: new Date().toISOString(), deviceId: DEVICE_ID,
      config: exportable,
    }, null, 2);
    const r = await fetch(`${cloudDavBase(cfg)}/lgc_config_${DEVICE_ID}.json`,
      { method: 'PUT', headers: cloudHeaders(cfg), body: payload });
    if (r.ok) { showToast(silent ? '☁ Gerät in Cloud registriert' : 'Konfiguration hochgeladen'); }
    else       { showToast(`Cloud-Fehler: HTTP ${r.status}`); }
  } catch (e) { showToast('Cloud-Fehler: ' + e.message); }
  finally { if (btn) { btn.disabled = false; btn.textContent = 'Konfig hochladen'; } }
}

async function silentConfigCheck() {
  const cfg = getCloudConfig();
  if (!isCloudConfigured(cfg)) return;
  const hdrs = { 'Authorization': 'Basic ' + btoa(unescape(encodeURIComponent(`${cfg.user}:${cfg.pass}`))) };
  const noCache = { headers: hdrs, cache: 'no-store' };
  // ── Deploy-Signal prüfen (alle Geräte) ──────────────────────
  try {
    const rd = await fetch(`${cloudDavBase(cfg)}/lgc_deploy.json`, noCache);
    if (rd.ok) {
      const deploy = await rd.json();
      const sig = deploy.deployedAt || '';
      const seen = localStorage.getItem('lgc_deploy_seen') || '';
      if (sig && sig !== seen) {
        localStorage.setItem('lgc_deploy_seen', sig);
        showToast('Update verfügbar – Seite wird neu geladen…');
        setTimeout(() => location.reload(), 2000);
        return;
      }
    }
  } catch {}
  // ── Globale Typen aus lgc_types.json prüfen ─────────────────
  try {
    const rt = await fetch(`${cloudDavBase(cfg)}/lgc_types.json`, noCache);
    if (rt.ok) {
      const typesData = await rt.json();
      if (Array.isArray(typesData.types) && typesData.types.length > 0) {
        const current  = localStorage.getItem('lgc_cloud_types') || '[]';
        const incoming = JSON.stringify(typesData.types);
        if (current !== incoming) {
          localStorage.setItem('lgc_cloud_types', incoming);
          location.reload();
          return;
        }
      }
    }
  } catch {}
  // ── Gerätespezifische Konfiguration prüfen ───────────────────
  try {
    const r = await fetch(`${cloudDavBase(cfg)}/lgc_config_${DEVICE_ID}.json`, noCache);
    if (!r.ok) { if (r.status === 404) pushConfigToCloud(true); return; }
    const data = await r.json();
    if (!data.config || typeof data.config !== 'object') return;
    const localRaw = localStorage.getItem('lgc_config_cloud');
    if (localRaw) {
      try {
        const local = JSON.parse(localRaw);
        if (JSON.stringify(local) === JSON.stringify(data.config)) return;
      } catch {}
    }
    localStorage.setItem('lgc_config_cloud', JSON.stringify(data.config));
    location.reload();
  } catch {}
}

async function pullConfigFromCloud() {
  const cfg = getCloudConfig();
  if (!isCloudConfigured(cfg)) { showToast('Cloud nicht konfiguriert'); return; }
  const btn = document.getElementById('btn-cfg-down');
  if (btn) { btn.disabled = true; btn.textContent = 'Lade…'; }
  try {
    const r = await fetch(`${cloudDavBase(cfg)}/lgc_config_${DEVICE_ID}.json`,
      { headers: { 'Authorization': 'Basic ' + btoa(unescape(encodeURIComponent(`${cfg.user}:${cfg.pass}`))) } });
    if (!r.ok) { showToast(`Fehler: HTTP ${r.status}`); return; }
    const data = await r.json();
    if (!data.config || typeof data.config !== 'object') { showToast('Ungültige Konfig-Datei'); return; }
    const ts = new Date(data.exported).toLocaleString('de-DE');
    showConfirm(
      `Konfiguration vom ${ts} laden?\n\nDie App wird neu gestartet, um die Änderungen zu übernehmen.`,
      () => {
        localStorage.setItem('lgc_config_cloud', JSON.stringify(data.config));
        location.reload();
      }
    );
  } catch (e) { showToast('Fehler: ' + e.message); }
  finally { if (btn) { btn.disabled = false; btn.textContent = 'Konfig aktualisieren'; } }
}

function resetConfigCloud() {
  showConfirm(
    '⚠ Lokale Cloud-Konfiguration zurücksetzen?\n\n' +
    'Damit wird die zuletzt vom Cloud-Server geladene Gerätekonfiguration aus dem Gerätespeicher gelöscht.\n\n' +
    'Die App startet danach neu und verwendet wieder die Grundkonfiguration aus config.js.\n\n' +
    'Stempeldaten und Nutzer bleiben erhalten.',
    () => {
      localStorage.removeItem('lgc_config_cloud');
      location.reload();
    }
  );
}

/* ── NUTZER-STARTUP-SYNC ────────────────────────────────────── */
// Merged Cloud-Nutzerliste mit lokalen Daten:
// - Cloud ist maßgeblich für neue Nutzer und Admin-PIN-Resets
// - Lokal gesetzte PINs (salt vorhanden, kein mustChangePIN) bleiben erhalten
function mergeCloudUsers(cloudUsers) {
  const local    = getUsers();
  const localMap = Object.fromEntries(local.map(u => [u.id, u]));
  const result   = [];
  for (const cu of cloudUsers) {
    const lu = localMap[cu.id];
    if (!lu) {
      result.push(cu); // neuer Nutzer aus Cloud
    } else {
      // Expliziter Admin-Reset: Cloud hat mustChangePIN=true ohne salt → Cloud gewinnt
      const adminReset = cu.mustChangePIN === true && !cu.salt;
      if (lu.salt && !lu.mustChangePIN && !adminReset) {
        // Lokal gesetzte PIN behalten (Namens-/Berechtigungsänderungen aus Cloud übernehmen)
        result.push({ ...cu, pin: lu.pin, salt: lu.salt, mustChangePIN: false });
      } else {
        result.push(cu); // Admin-Reset, OTP oder neue Nutzerin → Cloud-Version
      }
    }
    delete localMap[cu.id];
  }
  // Lokal-only Nutzer behalten (noch nicht in Cloud gespeichert)
  for (const lu of Object.values(localMap)) result.push(lu);
  return result;
}

// Zieht beim App-Start einmalig die Nutzerliste aus der Cloud.
// Läuft nach getUsers() (localStorage-Fallback) async im Hintergrund.
async function syncUsersFromCloud(silent = false) {
  const cfg = getCloudConfig();
  if (!isCloudConfigured(cfg)) return false;
  try {
    const r = await fetch(`${cloudDavBase(cfg)}/lgc_users.json`, {
      headers: { 'Authorization': 'Basic ' + btoa(unescape(encodeURIComponent(`${cfg.user}:${cfg.pass}`))) }
    });
    if (!r.ok) return false;
    const data = await r.json();
    if (!Array.isArray(data.users) || !data.users.length) return false;
    const merged = mergeCloudUsers(data.users);
    localStorage.setItem('lgc_users', JSON.stringify(merged));
    USERS.length = 0;
    merged.forEach(u => USERS.push(u));
    // currentUser aktualisieren falls bereits eingeloggt (Race Condition Fix)
    if (currentUser) {
      const updated = USERS.find(u => u.id === currentUser.id);
      if (updated) {
        Object.assign(currentUser, updated);
        if (document.getElementById('screen-dashboard')?.classList.contains('active')) {
          renderDashboardHTML(currentUser);
          syncDashboard();
        }
      }
    }
    if (!silent) showToast('Nutzerdaten aus Cloud synchronisiert');
    return true;
  } catch { return false; }
}

// Called from the rendered HTML buttons
function saveCloudConfig_form() {
  const url  = (document.getElementById('cloud-url')?.value  || '').trim();
  const user = (document.getElementById('cloud-user')?.value || '').trim();
  const pass = (document.getElementById('cloud-pass')?.value || '').trim();
  if ((!IS_PROXY && !url) || !user || !pass) { showToast(IS_PROXY ? 'Bitte Benutzername und Passwort ausfüllen' : 'Bitte alle drei Felder ausfüllen'); return; }
  saveCloudConfigData({ url, user, pass });
  renderCloudSection();
  showToast('Cloud-Zugangsdaten gespeichert');
}

function updateCloudStatus() {
  const el = document.getElementById('cloud-status');
  if (!el) return;

  const cfg        = getCloudConfig();
  const lastOk     = getCloudLastOk();
  const errLog     = getCloudErrLog();
  const hasErrors  = errLog.length > 0;
  const pending    = hasPendingCloudData();
  const configured = isCloudConfigured(cfg);

  // Only show alerts if credentials are set and connection was established before
  const showAlerts = configured && !!lastOk;

  const lastStr = lastOk
    ? `Letzter Sync: ${new Date(lastOk).toLocaleString('de-DE')}`
    : 'Noch kein Sync';

  let dotClass, stateStr;
  if (!configured) { dotClass = 'warn'; stateStr = 'Nicht konfiguriert'; }
  else if (hasErrors && showAlerts) { dotClass = 'err'; stateStr = 'Fehler aufgetreten'; }
  else if (pending && showAlerts)   { dotClass = 'warn'; stateStr = 'Ausstehend'; }
  else if (lastOk)                  { dotClass = 'ok';   stateStr = 'OK'; }
  else                              { dotClass = 'warn'; stateStr = 'Nicht getestet'; }

  // Pending banner
  const pendingBanner = (showAlerts && pending) ? `
    <div class="cloud-pending-banner">
      <span>&#x23F3; Lokale Daten noch nicht &uuml;bertragen</span>
      <button class="btn-usr-save" style="height:28px;padding:0 12px;font-size:12px"
              data-cloud-action="sync">Jetzt &uuml;bertragen</button>
    </div>` : '';

  // Error banner with log
  const errBanner = (showAlerts && hasErrors) ? `
    <div class="cloud-err-banner">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">
        <span>&#x26A0; ${errLog.length} fehlgeschlagene &Uuml;bertragung${errLog.length > 1 ? 'en' : ''}</span>
        <button class="btn-usr-cancel" style="height:26px;padding:0 10px;font-size:11px;border-color:var(--red);color:var(--red)"
                data-cloud-action="clear-errors">Fehler l&ouml;schen</button>
      </div>
      <div class="cloud-err-log">
        ${errLog.slice(0, 5).map(e => `
          <div class="cloud-err-entry">
            <span class="cloud-err-ts">${new Date(e.ts).toLocaleString('de-DE')}</span>
            <span>${escHtml(e.msg)}</span>
          </div>`).join('')}
        ${errLog.length > 5 ? `<div style="color:var(--text-3);font-size:11px">… und ${errLog.length - 5} weitere</div>` : ''}
      </div>
    </div>` : '';

  el.innerHTML = `
    <div class="cloud-status-row">
      <div class="cloud-dot ${dotClass}"></div>
      <span style="color:var(--text-2)">${stateStr}</span>
      <span style="color:var(--text-3);margin-left:auto">${lastStr}</span>
    </div>
    ${pendingBanner}
    ${errBanner}
    <div class="cloud-note">
      Tipp: Verwende ein Nextcloud <strong>App-Passwort</strong> (Einstellungen &rarr; Sicherheit),
      nicht dein Hauptpasswort. Dateien landen im Ordner <code>LifeguardClock/</code>
      als <code>lgc_${DEVICE_ID}_DATUM.json</code>.
    </div>`;
}

function renderCloudSection() {
  const el  = document.getElementById('cloud-section');
  const cfg = getCloudConfig();
  el.innerHTML = `<div style="padding:0 14px 4px">
    <div class="zf-card">
      <div class="zf-card-title">&#x2601; Cloud-Sync &mdash; Nextcloud / WebDAV</div>
      <div class="cloud-note" style="margin-bottom:10px">
        Ger&auml;te-ID dieses Ger&auml;ts: <code>${DEVICE_ID}</code>${CONFIG.deviceId ? ' <span style="color:var(--text-3)">(aus config.js)</span>' : ''}
        ${IS_PROXY ? '<br><span style="color:var(--green)">&#x2713; Proxy-Modus – URL wird vom Server bereitgestellt</span>' : ''}
      </div>
      <div class="cloud-fields">
        <label class="cloud-field">
          <span>Nextcloud-URL${IS_PROXY ? ' <span style="color:var(--text-3);font-weight:400">(optional im Proxy-Modus)</span>' : ''}</span>
          <input type="url" id="cloud-url" placeholder="${IS_PROXY ? 'aus admin_config.js (optional)' : 'https://cloud.example.com'}"
            value="${cfg?.url ? cfg.url.replace(/"/g,'&quot;') : ''}">
        </label>
        <label class="cloud-field">
          <span>Benutzername</span>
          <input type="text" id="cloud-user" autocomplete="off"
            placeholder="benutzername"
            value="${cfg?.user ? cfg.user.replace(/"/g,'&quot;') : ''}">
        </label>
        <label class="cloud-field">
          <span>App-Passwort</span>
          <input type="password" id="cloud-pass" autocomplete="new-password"
            placeholder="xxxx-xxxx-xxxx-xxxx"
            value="${cfg?.pass ? cfg.pass.replace(/"/g,'&quot;') : ''}">
        </label>
      </div>
      <div class="cloud-btns">
        <button class="btn-cloud btn-cloud-save"    data-cloud-action="save-config">Speichern</button>
        <button class="btn-cloud btn-cloud-test"    id="btn-cloud-test"    data-cloud-action="test">Verbindung testen</button>
        <button class="btn-cloud btn-cloud-sync"    id="btn-cloud-sync"    data-cloud-action="sync">Jetzt synchronisieren</button>
        <button class="btn-cloud btn-cloud-restore" id="btn-cloud-restore" data-cloud-action="restore">Wiederherstellen</button>
      </div>
      <div class="cloud-status" id="cloud-status"></div>
    </div>
    <div class="zf-card" style="margin-top:12px">
      <div class="zf-card-title">&#x1F464; Nutzerverwaltung</div>
      <div class="cloud-note" style="margin-bottom:10px">
        Nutzer zentral verwalten mit <strong>admin.html</strong> &mdash; &auml;ndert
        <code>lgc_users.json</code> in der Cloud, alle Ger&auml;te laden beim n&auml;chsten
        Start automatisch die aktuelle Liste.
      </div>
      <div class="cloud-btns">
        <button class="btn-cloud btn-cloud-users-down"  id="btn-users-down"  data-cloud-action="restore-users">Aus Cloud wiederherstellen</button>
      </div>
    </div>
    <div class="zf-card" style="margin-top:12px">
      <div class="zf-card-title">&#x1F4CB; Ger&auml;tekonfiguration</div>
      <div class="cloud-note" style="margin-bottom:10px">
        Die Konfiguration dieses Ger&auml;ts (<code>${DEVICE_ID}</code>) als
        <code>lgc_config_${DEVICE_ID}.json</code> in der Cloud sichern &mdash;
        dort bearbeiten (z.&nbsp;B. am PC) &mdash; und hier wieder einlesen.
        Cloud-Zugangsdaten und Ger&auml;te-ID werden dabei nie &uuml;berschrieben.
      </div>
      <div class="cloud-btns">
        <button class="btn-cloud" id="btn-cfg-up"   data-cloud-action="push-config">Konfig hochladen</button>
        <button class="btn-cloud" id="btn-cfg-down" data-cloud-action="pull-config">Konfig aktualisieren</button>
        <button class="btn-cloud btn-cfg-reset" data-cloud-action="reset-config">⚠ Lokale Konfig zurücksetzen</button>
      </div>
    </div>
  </div>`;
  updateCloudStatus();
}

/* ── SICHERES HERUNTERFAHREN ────────────────────────── */
function logAllActiveSessions() {
  const allStates = getAllStates();
  const now       = new Date().toISOString();
  let changed     = false;

  USERS.forEach(user => {
    const state = allStates[user.id];
    if (!state) return;
    TYPES.forEach(type => {
      if (state[type.key]) {
        const durMs = calcDurationMs(user.name, type.logType, now);
        const log   = getLog();
        log.push({ id: Date.now() + Math.random(), nutzer: user.name, typ: type.logType, aktion: 'stop', zeitstempel: now, auto: true, dauer_ms: durMs });
        saveLog(log);
        state[type.key] = false;
        changed = true;
      }
    });
  });

  if (changed) saveAllStates(allStates);
}

// Kein Auto-Stop bei beforeunload/pagehide (Crash-Recovery: State bleibt in localStorage erhalten)
// Sauberes Herunterfahren nur über den "Herunterfahren"-Button im Admin-Bereich.

/* ── ADMIN ──────────────────────────────────────────────────── */
/* ── STUNDEN-ÜBERSICHT ──────────────────────────────────────── */
function computeHours() {
  const log  = getLog();
  const now  = Date.now();
  // { userName: { logType: { totalMs, active } } }
  const result = {};
  const open   = {}; // key "userName||logType" → startMs

  [...log]
    .sort((a, b) => new Date(a.zeitstempel) - new Date(b.zeitstempel))
    .forEach(e => {
      const k = `${e.nutzer}||${e.typ}`;
      if (!result[e.nutzer])         result[e.nutzer]         = {};
      if (!result[e.nutzer][e.typ])  result[e.nutzer][e.typ]  = { totalMs: 0, active: false };

      if (e.aktion === 'start') {
        open[k] = new Date(e.zeitstempel).getTime();
        result[e.nutzer][e.typ].active = true;
      } else {
        if (open[k] != null) {
          result[e.nutzer][e.typ].totalMs += new Date(e.zeitstempel).getTime() - open[k];
          delete open[k];
        }
        result[e.nutzer][e.typ].active = false;
      }
    });

  // Add elapsed time for still-open sessions
  Object.entries(open).forEach(([k, startMs]) => {
    const [userName, logType] = k.split('||');
    if (result[userName]?.[logType]) result[userName][logType].totalMs += now - startMs;
  });

  return result;
}

function fmtDurationMs(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${pad(m)}min`;
  if (m > 0) return `${m}min`;
  return `< 1min`;
}

function renderStundenOverview() {
  const el   = document.getElementById('ov-section');
  const data = computeHours();
  const users = Object.keys(data);

  if (!users.length) { el.innerHTML = ''; return; }

  const colorToThClass = { blue: 'ov-th-blue', green: 'ov-th-green', amber: 'ov-th-amber', red: 'ov-th-red', violet: 'ov-th-violet', grey: 'ov-th-grey', orange: 'ov-th-orange', cyan: 'ov-th-cyan', pink: 'ov-th-pink', lime: 'ov-th-lime' };
  const cols = TYPES.map(t => ({
    logType: t.logType,
    thClass: colorToThClass[t.color] || 'ov-th-green',
    label:   escHtml(t.label),
  }));

  const allStates = getAllStates();

  const rows = users.map(name => {
    const user      = USERS.find(u => u.name === name);
    const uid       = user?.id;
    const uState    = uid ? getUserState(uid) : {};
    const hasActive = TYPES.some(t => uState[t.key]);

    const cells = cols.map(({ logType }) => {
      const d = data[name][logType];
      if (!d || d.totalMs === 0) return `<td class="ov-dur ov-none">&mdash;</td>`;
      const live = d.active ? `<span class="ov-live">live</span>` : '';
      return `<td class="ov-dur">${fmtDurationMs(d.totalMs)}${live}</td>`;
    }).join('');

    const stopBtn = `<button class="btn-user-stop" ${hasActive ? '' : 'disabled'}
      data-uid="${escHtml(uid)}" data-name="${escHtml(name)}"
      data-user-action="stop-sessions"
      title="Alle aktiven Sitzungen beenden">&#x23F9; Ausstempeln</button>`;
    const editBtn = `<button class="btn-user-edit"
      data-name="${escHtml(name)}"
      data-user-action="edit-modal"
      title="Eintr&auml;ge bearbeiten">&#x270E; Bearbeiten</button>`;

    return `<tr>
      <td class="ov-name">${escHtml(name)}</td>${cells}
      <td><div class="ov-actions">${stopBtn}${editBtn}</div></td>
    </tr>`;
  }).join('');

  const headers = cols.map(c => `<th class="${c.thClass}">${c.label}</th>`).join('');

  el.innerHTML = `
    <div class="ov-card">
      <div class="ov-card-title"><span>Geleistete Stunden (gesamt)</span></div>
      <div style="overflow-x:auto">
        <table class="ov-table">
          <thead><tr><th>Nutzer</th>${headers}<th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

/* ── PER-USER AUSSTEMPELN ───────────────────────────────────── */
function stopUserSessions(uid, userName) {
  const allStates = getAllStates();
  const state     = allStates[uid];
  if (!state) { showToast('Keine aktiven Sitzungen'); return; }
  const now = new Date().toISOString();
  let count = 0;
  TYPES.forEach(type => {
    if (!state[type.key]) return;
    const durMs = calcDurationMs(userName, type.logType, now);
    const log   = getLog();
    log.push({ id: Date.now() + Math.random(), nutzer: userName, typ: type.logType, aktion: 'stop', zeitstempel: now, auto: true, dauer_ms: durMs });
    saveLog(log);
    state[type.key] = false;
    count++;
  });
  if (count) {
    allStates[uid] = state;
    saveAllStates(allStates);
    renderStundenOverview();
    renderAdmin();
    showToast(`${userName}: ${count} Sitzung${count !== 1 ? 'en' : ''} beendet`);
  } else {
    showToast(`${userName}: keine aktiven Sitzungen`);
  }
}

/* ── EDIT MODAL ─────────────────────────────────────────────── */
let editingUser = null;
let editEntries = [];

function openEditModal(userName) {
  editingUser = userName;
  const log = getLog();
  editEntries = log
    .filter(e => e.nutzer === userName)
    .sort((a, b) => new Date(a.zeitstempel) - new Date(b.zeitstempel))
    .map(e => ({ ...e, _deleted: false }));
  document.getElementById('modal-title').textContent = `Einträge: ${userName}`;
  renderModalEntries();
  document.getElementById('modal-edit').style.display = '';
}

function renderModalEntries() {
  const typeClass = Object.fromEntries(TYPES.map(t => [t.logType, t.key]));
  const rows = editEntries.map((e, i) => {
    const tc  = typeClass[e.typ] || '';
    const tl  = TYPES.find(t => t.logType === e.typ)?.label || e.typ;
    const ac  = e.aktion === 'start' ? 'start' : 'stop';
    const al  = e.aktion === 'start' ? '&#x25B6; Start' : '&#x25A0; Stop';
    // Format for datetime-local: YYYY-MM-DDTHH:MM:SS
    const ts  = new Date(e.zeitstempel).toISOString().slice(0, 19);
    const del = e._deleted;
    const delBtn = del
      ? `<button class="btn-del-entry restore" data-entry-idx="${i}">&#x21A9; Zurück</button>`
      : `<button class="btn-del-entry"         data-entry-idx="${i}">&#x2715;</button>`;
    const durStr = (e.aktion === 'stop' && e.dauer_ms)
      ? `<span style="font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--text-3)">${fmtDuration(e.dauer_ms)}</span>`
      : '';
    return `<tr class="${del ? 'deleted' : ''}">
      <td><span class="badge badge-${tc}">${escHtml(tl)}</span></td>
      <td><span class="badge badge-${ac}">${al}</span>${durStr}</td>
      <td><input class="edit-ts" type="datetime-local" step="1" value="${ts}"
          ${del ? 'disabled' : ''} data-entry-idx="${i}"></td>
      <td>${delBtn}</td>
    </tr>`;
  }).join('');

  document.getElementById('modal-body').innerHTML = editEntries.length
    ? `<table class="edit-table">
        <thead><tr><th>Typ</th><th>Aktion</th><th>Zeitstempel</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
       </table>`
    : `<div class="empty-state" style="padding:40px 20px">Keine Einträge</div>`;
}

function toggleDeleteEntry(i) {
  editEntries[i]._deleted = !editEntries[i]._deleted;
  renderModalEntries();
}

function updateEntryTs(i, val) {
  if (!val) return;
  editEntries[i].zeitstempel = new Date(val).toISOString();
}

function saveModalChanges() {
  const log     = getLog();
  const editIds = new Set(editEntries.map(e => e.id));
  const others  = log.filter(e => !editIds.has(e.id));
  const kept    = editEntries
    .filter(e => !e._deleted)
    .map(({ _deleted, ...e }) => e);
  saveLog([...others, ...kept].sort((a, b) => new Date(a.zeitstempel) - new Date(b.zeitstempel)));
  closeModal();
  renderAdmin();
  renderStundenOverview();
  writeLocalBackup();
  showToast('Einträge gespeichert');
}

function closeModal() {
  document.getElementById('modal-edit').style.display = 'none';
  editingUser = null;
  editEntries = [];
}

/* ── CONFIRM MODAL (ersetzt native confirm() – Fully Kiosk kompatibel) ── */
let _confirmCb = null;
function showConfirm(msg, onConfirm) {
  document.getElementById('confirm-msg').textContent = msg;
  _confirmCb = onConfirm;
  document.getElementById('modal-confirm').style.display = '';
}
function _closeConfirm() {
  document.getElementById('modal-confirm').style.display = 'none';
  _confirmCb = null;
}
document.getElementById('confirm-cancel').addEventListener('click', _closeConfirm);
document.getElementById('confirm-ok').addEventListener('click', () => {
  const cb = _confirmCb;
  _closeConfirm();
  if (cb) cb();
});
document.getElementById('modal-confirm').addEventListener('click', e => {
  if (e.target === document.getElementById('modal-confirm')) _closeConfirm();
});

/* ── BACKUPS ─────────────────────────────────────────────────── */
function renderBackups() {
  const el   = document.getElementById('backup-section');
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith('lgc_backup_')) keys.push(k);
  }
  keys.sort().reverse();

  if (!keys.length) { el.innerHTML = ''; return; }

  const rows = keys.map(key => {
    try {
      const data = JSON.parse(localStorage.getItem(key) || 'null');
      if (!data) return '';
      const date = key.replace('lgc_backup_', '');
      const ts   = new Date(data.ts).toLocaleString('de-DE');
      return `<tr>
        <td style="font-family:'JetBrains Mono',monospace">${date}</td>
        <td style="font-size:12px;color:var(--text-2)">${ts}</td>
        <td>${data.count} Eintr.</td>
        <td><button class="btn-sm btn-export" style="font-size:11px;height:30px;padding:0 10px"
            data-backup-key="${escHtml(key)}">&#x2193; CSV</button></td>
      </tr>`;
    } catch { return ''; }
  }).join('');

  el.innerHTML = `<div style="padding:0 14px 4px">
    <div class="ov-card">
      <div class="ov-card-title"><span>Tages-Backups (Tageswechsel ${CONFIG.dayBoundaryHour ?? 4}:00 Uhr)</span></div>
      <div style="overflow-x:auto">
        <table class="log-table" style="min-width:300px">
          <thead><tr><th>Tag</th><th>Letztes Backup</th><th>Eintr.</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  </div>`;
}

// Schützt CSV-Zellen vor Formula-Injection (=, +, -, @, Tab, CR als Präfix)
function csvCell(val) {
  const s = String(val ?? '');
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
}

function downloadBackup(key) {
  try {
    const data = JSON.parse(localStorage.getItem(key) || 'null');
    if (!data) { showToast('Backup nicht gefunden'); return; }
    const date   = key.replace('lgc_backup_', '');
    const header = 'ID;Zeitstempel;Datum;Uhrzeit;Nutzer;Typ;Aktion;Dauer\r\n';
    const rows   = data.log.map(e => {
      const d   = new Date(e.zeitstempel);
      const dur = (e.aktion === 'stop' && e.dauer_ms) ? fmtDuration(e.dauer_ms) : '';
      return `"${e.id}";"${e.zeitstempel}";"${d.toLocaleDateString('de-DE')}";"${d.toLocaleTimeString('de-DE')}";"${csvCell(e.nutzer)}";"${csvCell(e.typ)}";"${csvCell(e.aktion)}";"${dur}"`;
    }).join('\r\n');
    const blob = new Blob(['\uFEFF' + header + rows], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `lgc_backup_${date}.csv`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  } catch { showToast('Download fehlgeschlagen'); }
}

/* ── ALLE AUSSTEMPELN ───────────────────────────────────────── */
function stopAllActiveSessions() {
  const allStates = getAllStates();
  const now       = new Date().toISOString();
  let   count     = 0;

  USERS.forEach(user => {
    const state = allStates[user.id];
    if (!state) return;
    TYPES.forEach(type => {
      if (!state[type.key]) return;
      const durMs = calcDurationMs(user.name, type.logType, now);
      const log   = getLog();
      log.push({ id: Date.now() + Math.random(), nutzer: user.name, typ: type.logType, aktion: 'stop', zeitstempel: now, auto: true, dauer_ms: durMs });
      saveLog(log);
      state[type.key] = false;
      count++;
    });
  });

  if (count) {
    saveAllStates(allStates);
    renderAdmin();
    renderStundenOverview();
    showToast(`${count} Sitzung${count !== 1 ? 'en' : ''} beendet`);
  } else {
    showToast('Keine aktiven Sitzungen');
  }
}

function safeShutdown() {
  showConfirm('Alle aktiven Sitzungen werden jetzt beendet.\nDas Gerät kann danach sicher ausgeschaltet werden.', () => {
    stopAllActiveSessions();
    document.getElementById('shutdown-time').textContent =
      'Heruntergefahren um ' + new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + ' Uhr';
    localStorage.removeItem('lgc_session');
    showScreen('screen-shutdown');
  });
}

document.getElementById('btn-shutdown').addEventListener('click', safeShutdown);

document.getElementById('btn-stopall').addEventListener('click', () => {
  const allStates = getAllStates();
  const active = USERS.some(u => TYPES.some(t => getAllStates()[u.id]?.[t.key]));
  if (!active) { showToast('Keine aktiven Sitzungen'); return; }
  showConfirm('Alle aktiven Sitzungen jetzt beenden?', stopAllActiveSessions);
});

let _adminActiveTab = 'protokoll';

function switchAdminTab(tabId) {
  _adminActiveTab = tabId;
  document.querySelectorAll('.admin-tab').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === tabId)
  );
  document.querySelectorAll('.admin-tab-content').forEach(c =>
    c.classList.toggle('active', c.id === 'tab-' + tabId)
  );
  if (tabId === 'protokoll')   { renderAdmin(); }
  if (tabId === 'stunden')     { renderStundenOverview(); renderBackups(); }
  if (tabId === 'passwort')    { renderPasswordSection(); }
  if (tabId === 'zeitfenster') { renderZeitfenster(); }
  if (tabId === 'cloud')       { renderCloudSection(); }
}

function openAdmin() {
  showScreen('screen-admin');
  switchAdminTab(_adminActiveTab);
}

/* ── ADMIN PASSWORD (SHA-256 hashed) ────────────────────────── */
const ADMIN_PW_KEY     = 'lgc_admin_pw';
const ADMIN_PW_SALT_KEY = 'lgc_admin_pw_salt';
const ADMIN_PW_DEFAULT = 'Admin19101913';

async function hashAdminPw(pw, salt) {
  const data = new TextEncoder().encode(salt + ':' + pw);
  const buf  = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function genAdminSalt() {
  return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
}

async function verifyAdminPw(entered) {
  const stored = localStorage.getItem(ADMIN_PW_KEY);
  const salt   = localStorage.getItem(ADMIN_PW_SALT_KEY);
  if (!stored || !salt) {
    // Kein gespeichertes PW → Default-Vergleich (Klartext, Migration)
    return entered === ADMIN_PW_DEFAULT;
  }
  const hash = await hashAdminPw(entered, salt);
  return hash === stored;
}

async function saveAdminPw(pw) {
  const salt = genAdminSalt();
  const hash = await hashAdminPw(pw, salt);
  localStorage.setItem(ADMIN_PW_SALT_KEY, salt);
  localStorage.setItem(ADMIN_PW_KEY, hash);
}

function showAdminPwPrompt() {
  document.getElementById('admin-pw-input').value = '';
  document.getElementById('admin-pw-err').textContent = '';

  // Cloud-Status & Geräte-ID im Hint anzeigen
  const hint = document.getElementById('admin-pw-hint');
  const cfg  = getCloudConfig();
  const lastOk = getCloudLastOk();
  const errs   = getCloudErrLog();
  let cloudLine;
  if (!isCloudConfigured(cfg)) {
    cloudLine = '☁ Cloud nicht konfiguriert';
  } else if (lastOk) {
    const t = new Date(lastOk).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    cloudLine = `☁ Sync OK – ${t}`;
  } else if (errs.length) {
    cloudLine = `☁ Fehler: ${errs[errs.length - 1].msg || errs[errs.length - 1]}`;
  } else {
    cloudLine = '☁ Noch kein Sync';
  }
  hint.textContent = `Gerät: ${DEVICE_ID} · ${cloudLine}`;

  document.getElementById('admin-pw-overlay').classList.add('visible');
  setTimeout(() => document.getElementById('admin-pw-input').focus(), 120);
}

function cancelAdminPw() {
  document.getElementById('admin-pw-overlay').classList.remove('visible');
  document.getElementById('admin-pw-input').value = '';
  document.getElementById('admin-pw-err').textContent  = '';
  document.getElementById('admin-pw-hint').textContent = '';
}

async function submitAdminPw() {
  const input = document.getElementById('admin-pw-input');
  if (await verifyAdminPw(input.value)) {
    cancelAdminPw();
    openAdmin();
  } else {
    document.getElementById('admin-pw-err').textContent = 'Falsches Passwort.';
    input.value = '';
    input.focus();
  }
}

// Enter-Taste im Passwort-Feld bestätigt
document.getElementById('admin-pw-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') submitAdminPw();
});

// Funktion zum Ändern des Admin-Passworts
async function saveAdminPwForm() {
  const cur  = document.getElementById('apw-cur').value;
  const neu  = document.getElementById('apw-new').value.trim();
  const neu2 = document.getElementById('apw-new2').value.trim();
  const err  = document.getElementById('apw-err');

  if (!(await verifyAdminPw(cur))) { err.textContent = 'Aktuelles Passwort falsch.'; return; }
  if (neu.length < 4)              { err.textContent = 'Neues Passwort muss mind. 4 Zeichen haben.'; return; }
  if (neu !== neu2)                { err.textContent = 'Passwörter stimmen nicht überein.'; return; }

  await saveAdminPw(neu);
  document.getElementById('apw-cur').value  = '';
  document.getElementById('apw-new').value  = '';
  document.getElementById('apw-new2').value = '';
  err.textContent = '';
  showToast('Admin-Passwort geändert');
}

/* ── USERS SECTION ──────────────────────────────────────────── */
let _pendingNew = false; // true while "Neuer Benutzer" form is open

function renderPasswordSection() {
  const el = document.getElementById('pw-section');
  const isDefaultPw = !localStorage.getItem(ADMIN_PW_KEY);
  el.innerHTML = `
    <div class="users-card">
      <div class="users-card-title" style="color:var(--amber)">
        &#x1F512; Admin-Passwort
        ${isDefaultPw ? '<span style="font-size:10px;color:var(--amber);font-weight:700;letter-spacing:0.5px">&#x26A0; Standard-Passwort aktiv!</span>' : ''}
      </div>
      <div style="padding:14px 16px;display:flex;flex-direction:column;gap:10px">
        <div class="user-edit-row">
          <div class="user-edit-field">
            <label>Aktuelles Passwort</label>
            <input type="password" id="apw-cur" style="width:180px"
                   autocomplete="current-password" maxlength="64" placeholder="••••••••">
          </div>
          <div class="user-edit-field">
            <label>Neues Passwort</label>
            <input type="password" id="apw-new" style="width:180px"
                   autocomplete="new-password" maxlength="64" placeholder="••••••••">
          </div>
          <div class="user-edit-field">
            <label>Neues Passwort best&auml;tigen</label>
            <input type="password" id="apw-new2" style="width:180px"
                   autocomplete="new-password" maxlength="64" placeholder="••••••••">
          </div>
        </div>
        <div class="user-edit-err" id="apw-err"></div>
        <div>
          <button class="btn-usr-save" id="btn-save-admin-pw-form">Passwort &auml;ndern</button>
        </div>
      </div>
    </div>
  `;
}

function renderUsersSection() {
  const el = document.getElementById('users-section');

  // Build list: real users + optional pending-new slot
  const list = [...USERS];
  const newId = '__new__';

  const rowsHtml = list.map(u => `
    <div class="user-row" id="urow-${u.id}">
      <span class="user-name-lbl">${escHtml(u.name)}</span>
      <span class="user-pin-lbl${u.mustChangePIN ? ' otp-badge' : ''}">${u.mustChangePIN ? '⚠️ Einmal-PIN' : '••••••'}</span>
      <button class="btn-usr-edit" data-user-action="toggle-edit" data-uid="${u.id}">Bearbeiten</button>
    </div>
    <div class="user-edit-panel" id="uedit-${u.id}">
      ${u.mustChangePIN ? `
      <div class="otp-info">
        <span class="otp-info-lbl">Aktuelle Einmal-PIN:</span>
        <span class="otp-info-val">${escHtml(u.pin)}</span>
      </div>` : ''}
      <div class="user-edit-row">
        <div class="user-edit-field">
          <label>Name</label>
          <input type="text" id="uname-${u.id}" value="${escHtml(u.name)}" maxlength="40" autocomplete="off" placeholder="Name">
        </div>
        <div class="user-edit-field">
          <label>Neue Einmal-PIN setzen (leer = unver&auml;ndert)</label>
          <input type="password" id="upin-${u.id}" class="pin-inp" maxlength="6" placeholder="──────" autocomplete="new-password" inputmode="numeric">
        </div>
        <div class="user-edit-field">
          <label>PIN best&auml;tigen</label>
          <input type="password" id="upin2-${u.id}" class="pin-inp" maxlength="6" placeholder="──────" autocomplete="new-password" inputmode="numeric">
        </div>
      </div>
      <div class="user-edit-err" id="uerr-${u.id}"></div>
      <div class="user-edit-btns">
        <button class="btn-usr-save"   data-user-action="save-edit" data-uid="${u.id}">Speichern</button>
        <button class="btn-usr-cancel" data-user-action="toggle-edit" data-uid="${u.id}">Abbrechen</button>
        <button class="btn-usr-edit"   data-user-action="reset-pin" data-uid="${u.id}">&#x1F504; Zuf&auml;llige Einmal-PIN</button>
        ${USERS.length > 1 ? `<button class="btn-usr-del" data-user-action="delete" data-uid="${u.id}">Benutzer l&ouml;schen</button>` : ''}
      </div>
    </div>
  `).join('');

  const newFormHtml = _pendingNew ? `
    <div class="user-edit-panel open" id="uedit-${newId}" style="border-top:1px solid var(--border)">
      <div style="font-size:11px;font-weight:700;color:var(--blue);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Neuer Benutzer</div>
      <div class="user-edit-row">
        <div class="user-edit-field">
          <label>Name</label>
          <input type="text" id="uname-${newId}" maxlength="40" autocomplete="off" placeholder="Name eingeben">
        </div>
        <div class="user-edit-field">
          <label>PIN</label>
          <input type="password" id="upin-${newId}" class="pin-inp" maxlength="6" placeholder="──────" autocomplete="new-password" inputmode="numeric">
        </div>
        <div class="user-edit-field">
          <label>PIN best&auml;tigen</label>
          <input type="password" id="upin2-${newId}" class="pin-inp" maxlength="6" placeholder="──────" autocomplete="new-password" inputmode="numeric">
        </div>
      </div>
      <div class="user-edit-err" id="uerr-${newId}"></div>
      <div class="user-edit-btns">
        <button class="btn-usr-save"   data-user-action="save-edit" data-uid="${newId}">Anlegen</button>
        <button class="btn-usr-cancel" data-user-action="cancel-new">Abbrechen</button>
      </div>
    </div>
  ` : '';

  el.innerHTML = `
    <div class="users-card">
      <div class="users-card-title">
        <span>&#9681; Benutzer &amp; PINs</span>
        <button class="btn-usr-add" data-user-action="add">+ Neuer Benutzer</button>
      </div>
      ${rowsHtml}
      ${newFormHtml}
    </div>
  `;
}

function toggleUserEdit(id) {
  const panel = document.getElementById('uedit-' + id);
  if (!panel) return;
  const opening = !panel.classList.contains('open');
  // Close all panels
  document.querySelectorAll('.user-edit-panel').forEach(p => p.classList.remove('open'));
  document.querySelectorAll('.btn-usr-edit').forEach(b => b.classList.remove('active'));
  if (opening) {
    panel.classList.add('open');
    const btn = document.querySelector('#urow-' + id + ' .btn-usr-edit');
    if (btn) btn.classList.add('active');
    document.getElementById('upin-'  + id).value = '';
    document.getElementById('upin2-' + id).value = '';
    document.getElementById('uerr-'  + id).textContent = '';
  }
}

function saveUserEdit(id) {
  const nameEl = document.getElementById('uname-' + id);
  const pinEl  = document.getElementById('upin-'  + id);
  const pin2El = document.getElementById('upin2-' + id);
  const errEl  = document.getElementById('uerr-'  + id);

  const name = nameEl.value.trim();
  const pin  = pinEl.value.trim();
  const pin2 = pin2El.value.trim();

  if (!name) { errEl.textContent = 'Name darf nicht leer sein.'; return; }

  const isNew = (id === '__new__');
  if (isNew || pin) {
    if (!/^\d{6}$/.test(pin)) { errEl.textContent = 'PIN muss genau 6 Ziffern sein.'; return; }
    if (pin !== pin2)          { errEl.textContent = 'PINs stimmen nicht überein.'; return; }
    if (pin === ADMIN_PIN)     { errEl.textContent = 'Diese PIN ist für den Admin reserviert.'; return; }
  }

  if (isNew) {
    const newUser = { id: 'u' + Date.now(), name, pin, mustChangePIN: true };
    saveUsers([...USERS, newUser]);
    _pendingNew = false;
  } else {
    const existing = USERS.find(u => u.id === id);
    const oldName  = existing?.name;
    let updated = { ...existing, name };
    if (pin) {
      // Admin-gesetzte PIN → Einmal-PIN (Klartext), wird beim nächsten Login erzwungen zu ändern
      delete updated.salt;
      updated = { ...updated, pin, mustChangePIN: true };
    }
    saveUsers(USERS.map(u => u.id !== id ? u : updated));
    // Alle Log- und Backup-Einträge mit dem alten Namen auf den neuen Namen aktualisieren
    if (oldName && oldName !== name) {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith('lgc_log_')) {
          try {
            const entries = JSON.parse(localStorage.getItem(key) || '[]');
            if (!Array.isArray(entries)) continue;
            let changed = false;
            entries.forEach(e => { if (e.nutzer === oldName) { e.nutzer = name; changed = true; } });
            if (changed) localStorage.setItem(key, JSON.stringify(entries));
          } catch {}
        } else if (key.startsWith('lgc_backup_')) {
          try {
            const backup = JSON.parse(localStorage.getItem(key) || 'null');
            if (!backup?.log) continue;
            let changed = false;
            backup.log.forEach(e => { if (e.nutzer === oldName) { e.nutzer = name; changed = true; } });
            if (changed) localStorage.setItem(key, JSON.stringify(backup));
          } catch {}
        }
      }
    }
  }
  renderUsersSection();
  showToast('Gespeichert');
}

function deleteUser(id) {
  const user = USERS.find(u => u.id === id);
  if (!user) return;
  showConfirm(`Benutzer "${user.name}" wirklich löschen?\nStempeleinträge bleiben erhalten.`, () => {
    saveUsers(USERS.filter(u => u.id !== id));
    renderUsersSection();
    showToast('Benutzer gelöscht');
  });
}

function resetUserPINRandom(id) {
  const user = USERS.find(u => u.id === id);
  if (!user) return;
  const otp     = String(Math.floor(100000 + Math.random() * 900000));
  const updated = { ...user, pin: otp, mustChangePIN: true };
  delete updated.salt;
  saveUsers(USERS.map(u => u.id !== id ? u : updated));
  renderUsersSection();
  // Edit-Panel öffnen, damit die generierte PIN sichtbar ist
  const panel = document.getElementById('uedit-' + id);
  if (panel) panel.classList.add('open');
  showToast('Neue Einmal-PIN generiert');
}

function openEinmalpins() {
  const otpUsers = USERS.filter(u => u.mustChangePIN);
  if (!otpUsers.length) {
    showToast('Keine Nutzer mit Einmal-PIN vorhanden');
    return;
  }
  const dateStr = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const rows = otpUsers.map((u, i) =>
    `<tr><td class="num">${i + 1}</td><td class="name">${escHtml(u.name)}</td><td class="pin">${escHtml(u.pin)}</td><td class="hint">Beim 1.&nbsp;Login PIN&nbsp;ändern</td></tr>`
  ).join('\n    ');
  const html = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<title>LifeguardClock – Einmal-PINs</title>
<style>
  @page { size: A4 portrait; margin: 18mm 16mm 16mm 16mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11pt; color: #1a1a2e; background: #fff; }
  .page-header { display: flex; align-items: flex-end; justify-content: space-between; border-bottom: 2px solid #1a1a2e; padding-bottom: 8px; margin-bottom: 18px; }
  .page-title { font-size: 18pt; font-weight: 700; letter-spacing: -0.3px; }
  .page-subtitle { font-size: 9pt; color: #555; margin-top: 3px; }
  .page-meta { font-size: 8.5pt; color: #777; text-align: right; line-height: 1.6; }
  .notice { background: #fff8e1; border: 1px solid #f5c842; border-radius: 5px; padding: 8px 12px; font-size: 9pt; color: #5a4200; margin-bottom: 18px; }
  table { width: 100%; border-collapse: collapse; }
  thead tr { background: #1a1a2e; color: #fff; }
  thead th { padding: 7px 12px; font-size: 9pt; font-weight: 600; text-transform: uppercase; letter-spacing: 0.6px; text-align: left; }
  thead th.center { text-align: center; }
  tbody tr:nth-child(even) { background: #f5f5fa; }
  tbody tr:nth-child(odd)  { background: #ffffff; }
  tbody td { padding: 7px 12px; border-bottom: 1px solid #e0e0ee; vertical-align: middle; }
  td.num { color: #999; font-size: 9pt; width: 32px; text-align: center; }
  td.name { font-weight: 600; font-size: 11pt; }
  td.pin { font-family: 'Courier New', monospace; font-size: 13pt; font-weight: 700; letter-spacing: 6px; color: #1a1a2e; text-align: center; width: 130px; }
  td.hint { font-size: 8.5pt; color: #888; width: 180px; }
  .page-footer { margin-top: 18px; border-top: 1px solid #ccc; padding-top: 8px; font-size: 8pt; color: #aaa; display: flex; justify-content: space-between; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>
<div class="page-header">
  <div>
    <div class="page-title"><img src="Logo.png" style="height:28pt;vertical-align:middle;margin-right:8px"> LifeguardClock – Einmal-PINs</div>
    <div class="page-subtitle">Bitte nach dem ersten Login eine persönliche PIN vergeben</div>
  </div>
  <div class="page-meta">Stand: ${dateStr}<br>Vertraulich – nicht weitergeben</div>
</div>
<div class="notice">⚠ Diese PINs sind temporäre Einmal-PINs. Beim ersten Einloggen wird automatisch eine neue persönliche PIN verlangt. Einmal-PINs bitte nach Aushändigung nicht aufbewahren.</div>
<table>
  <thead>
    <tr><th class="center">#</th><th>Name</th><th class="center">Einmal-PIN</th><th>Hinweis</th></tr>
  </thead>
  <tbody>
    ${rows}
  </tbody>
</table>
<div class="page-footer">
  <span>LifeguardClock – vertraulich</span>
  <span>${otpUsers.length} Mitglieder</span>
</div>
</body>
</html>`;
  const w = window.open('', '_blank');
  if (!w) { showToast('Popup wurde blockiert – bitte Popups erlauben'); return; }
  w.document.write(html);
  w.document.close();
}

function addUser() {
  if (_pendingNew) return;
  _pendingNew = true;
  // Close any open edit panels
  document.querySelectorAll('.user-edit-panel').forEach(p => p.classList.remove('open'));
  document.querySelectorAll('.btn-usr-edit').forEach(b => b.classList.remove('active'));
  renderUsersSection();
  setTimeout(() => {
    const inp = document.getElementById('uname-__new__');
    if (inp) inp.focus();
  }, 50);
}

function cancelNewUser() {
  _pendingNew = false;
  renderUsersSection();
}

document.getElementById('modal-x').addEventListener('click',      closeModal);
document.getElementById('modal-cancel').addEventListener('click',  closeModal);
document.getElementById('modal-save').addEventListener('click',    saveModalChanges);
// Close on backdrop click
document.getElementById('modal-edit').addEventListener('click', e => {
  if (e.target === document.getElementById('modal-edit')) closeModal();
});

function renderZeitfenster() {
  const section  = document.getElementById('zf-section');
  const now      = currentHHMM();
  const zfTypes  = TYPES.filter(t => t.requiresZeitfenster);
  if (zfTypes.length === 0) { section.innerHTML = ''; return; }

  let rows = '';
  zfTypes.forEach(type => {
    const zf       = getZeitfensterForType(type);
    const inWindow = isWithinZeitfensterForType(type);
    const start    = zf?.start ?? '';
    const end      = zf?.end ?? '';
    const statusCls  = zf ? (inWindow ? 'zf-status ok' : 'zf-status warn') : 'zf-status warn';
    const statusText = zf
      ? (inWindow
          ? `Aktiv \u2014 ${now} \u2208 ${start}\u2013${end}`
          : `Au\u00dferhalb \u2014 ${now} \u2209 ${start}\u2013${end}`)
      : 'Heute gesperrt';
    rows += `
      <div class="zf-type-row">
        <span class="zf-type-label">${escHtml(type.label)}</span>
        <label class="zf-field">Von <input type="time" id="zf-start-${type.key}" value="${start}"></label>
        <label class="zf-field">Bis <input type="time" id="zf-end-${type.key}" value="${end}"></label>
        <button class="btn-zf-save" data-key="${type.key}">Speichern</button>
        <span class="${statusCls}" id="zf-status-${type.key}">${statusText}</span>
      </div>`;
  });

  section.innerHTML = `
    <div class="zf-card">
      <div class="zf-card-title">&#x23F1; Zeitfenster heute</div>
      ${rows}
    </div>`;

  section.querySelectorAll('.btn-zf-save').forEach(btn => {
    btn.addEventListener('click', () => {
      const key   = btn.dataset.key;
      const type  = TYPES.find(t => t.key === key);
      const start = document.getElementById(`zf-start-${key}`).value;
      const end   = document.getElementById(`zf-end-${key}`).value;
      if (!start || !end) { showToast('Bitte beide Zeiten angeben'); return; }
      if (start === end)  { showToast('Start- und Endzeit dürfen nicht identisch sein'); return; }
      saveZeitfensterForType(key, start, end);
      renderZeitfenster();
      checkZeitfensterEnd();
      checkTimeLimits();
      showToast(`${type?.label ?? key}: ${start}\u2013${end}`);
    });
  });
}

function renderAdmin() {
  const log = getLog();

  // Stats
  const statsEl = document.getElementById('admin-stats');
  const total   = log.length;
  const byUser  = {};
  log.forEach(e => { byUser[e.nutzer] = (byUser[e.nutzer] || 0) + 1; });
  const userChips = Object.entries(byUser)
    .map(([n, c]) => `<div class="stat-chip">${escHtml(n)}: <span>${c}</span></div>`)
    .join('');
  statsEl.innerHTML =
    `<div class="stat-chip">Gesamt: <span>${total}</span></div>${userChips}`;

  // Table
  const bodyEl = document.getElementById('admin-body');
  if (!total) {
    bodyEl.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">&#x1F4CB;</span>
        Noch keine Eintr&auml;ge vorhanden
      </div>`;
    return;
  }

  const typeClass = Object.fromEntries(TYPES.map(t => [t.logType, t.key]));

  const rows = [...log].reverse().map(e => {
    const d    = new Date(e.zeitstempel);
    const date = d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const time = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const tc   = typeClass[e.typ] || '';
    const ac   = e.aktion === 'start' ? 'start' : 'stop';
    const al   = e.aktion === 'start' ? '&#x25B6; Start' : '&#x25A0; Stop';
    const tl   = TYPES.find(t => t.logType === e.typ)?.label || e.typ;
    const autoTag = e.auto ? ' <span class="badge badge-auto" title="Automatisch beim Schlie&szlig;en der Seite">Auto</span>' : '';

    return `
      <tr>
        <td>
          <div style="font-family:'JetBrains Mono',monospace;font-size:13px">${time}</div>
          <div class="ts-date">${date}</div>
        </td>
        <td>${escHtml(e.nutzer)}</td>
        <td><span class="badge badge-${escHtml(tc)}">${escHtml(tl)}</span></td>
        <td><span class="badge badge-${ac}">${al}</span>${autoTag}</td>
        <td style="font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--text-2);white-space:nowrap">
          ${e.aktion === 'stop' && e.dauer_ms ? fmtDuration(e.dauer_ms) : ''}
        </td>
      </tr>`;
  }).join('');

  bodyEl.innerHTML = `
    <div class="admin-body-scroll">
      <table class="log-table">
        <thead>
          <tr>
            <th>Zeitstempel</th>
            <th>Nutzer</th>
            <th>Typ</th>
            <th>Aktion</th>
            <th>Dauer</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

document.getElementById('btn-admin-logout').addEventListener('click', () => logout(true));

document.getElementById('btn-export').addEventListener('click', () => {
  const log = getLog();
  if (!log.length) { showToast('Keine Daten vorhanden'); return; }

  const header = 'ID;Zeitstempel;Datum;Uhrzeit;Nutzer;Typ;Aktion;Dauer\r\n';
  const rows = log.map(e => {
    const d    = new Date(e.zeitstempel);
    const date = d.toLocaleDateString('de-DE');
    const time = d.toLocaleTimeString('de-DE');
    const dur  = (e.aktion === 'stop' && e.dauer_ms) ? fmtDuration(e.dauer_ms) : '';
    return `"${e.id}";"${e.zeitstempel}";"${date}";"${time}";"${csvCell(e.nutzer)}";"${csvCell(e.typ)}";"${csvCell(e.aktion)}";"${dur}"`;
  }).join('\r\n');

  const now  = new Date();
  const ts   = `${now.toISOString().slice(0,10)}_${pad(now.getHours())}-${pad(now.getMinutes())}`;
  const bom  = '\uFEFF'; // UTF-8 BOM for Excel
  const blob = new Blob([bom + header + rows], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `lgc_${ts}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast(`${log.length} Einträge exportiert`);
});

document.getElementById('btn-clr').addEventListener('click', () => {
  showConfirm('Alle Protokolleinträge unwiderruflich löschen?', () => {
    saveLog([]);
    renderAdmin();
    showToast('Protokoll geleert');
  });
});

// Löscht NUR Stempeldaten: Logs, Backups, State, Session.
// Alles andere (Cloud-Config, Nutzer, Passwort, Zeitfenster, Geräte-ID, Typen etc.) bleibt.
function clearStampData() {
  const toDelete = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith('lgc_')) continue;
    if (k.startsWith('lgc_log_') || k.startsWith('lgc_backup_') ||
        k === 'lgc_state' || k === 'lgc_session') {
      toDelete.push(k);
    }
  }
  toDelete.forEach(k => localStorage.removeItem(k));
}

document.getElementById('btn-clearstamps').addEventListener('click', () => {
  const logKeys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith('lgc_log_')) logKeys.push(k);
  }
  const total = logKeys.reduce((n, k) => {
    try { return n + JSON.parse(localStorage.getItem(k) || '[]').length; } catch { return n; }
  }, 0);
  showConfirm(
    `Alle Stempeldaten auf diesem Gerät löschen?\n\n` +
    `Betroffen:\n` +
    `• ${total} Stempeleinträge (${logKeys.length} Monat${logKeys.length !== 1 ? 'e' : ''})\n` +
    `• Alle lokalen Backups\n` +
    `• Aktive Ein-/Ausstempel-Zustände\n\n` +
    `Erhalten bleiben:\n` +
    `• Nutzer & PINs\n` +
    `• Cloud-Zugangsdaten & Sync\n` +
    `• Admin-Passwort\n` +
    `• Zeitfenster & Typ-Konfiguration`,
    () => {
      clearStampData();
      renderAdmin();
      showToast('Alle Stempeldaten gelöscht');
    }
  );
});

// Löscht alle Stempel-Daten dieses Geräts (Logs aller Jahre, Backups, Zustand, Session).
// Konfiguration, Gerät-ID, Nutzer und Cloud-Zugangsdaten bleiben erhalten.
function resetAllLocalData() {
  const keep = new Set([
    'lgc_device_id', 'lgc_cloud', 'lgc_config_cloud',
    'lgc_users', 'lgc_zeitfenster',
    'lgc_cloud_last_ok', 'lgc_cloud_last',
  ]);
  const toDelete = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith('lgc_') && !keep.has(k)) toDelete.push(k);
  }
  toDelete.forEach(k => localStorage.removeItem(k));
}

document.getElementById('btn-reset').addEventListener('click', () => {
  const year = todayISO().slice(0, 4);
  showConfirm(
    `Gerät vollständig zurücksetzen?\n\nGelöscht werden:\n• Alle Protokolle (lgc_log_*)\n• Alle lokalen Backups\n• Aktive Stempel-Zustände\n\nErhalten bleiben:\n• Nutzer & PINs\n• Cloud-Zugangsdaten\n• Gerät-ID\n\nAktuelle Saison: ${year}`,
    () => {
      resetAllLocalData();
      renderAdmin();
      showToast('Gerät zurückgesetzt');
    }
  );
});

/* ── KIOSK-MODUS ────────────────────────────────────────────── */
let adminExitedFullscreen = false;
let wakeLock = null;

// ── Vollbild ──
async function enterFullscreen() {
  if (IS_PROXY) return;   // kein Vollbild im lokalen Entwicklungsmodus
  try {
    adminExitedFullscreen = false;
    await (document.documentElement.requestFullscreen?.() ||
           document.documentElement.webkitRequestFullscreen?.() ||
           document.documentElement.mozRequestFullScreen?.());
  } catch {}
}

function exitKioskMode() {
  adminExitedFullscreen = true;
  try {
    (document.exitFullscreen?.() ||
     document.webkitExitFullscreen?.() ||
     document.mozCancelFullScreen?.());
  } catch {}
}

function isFullscreen() {
  return !!(document.fullscreenElement ||
            document.webkitFullscreenElement ||
            document.mozFullScreenElement);
}


// Wenn Vollbild unerwartet beendet wird → automatisch neu anfordern
document.addEventListener('fullscreenchange',       onFsChange);
document.addEventListener('webkitfullscreenchange', onFsChange);
document.addEventListener('mozfullscreenchange',    onFsChange);
function onFsChange() {
  if (!isFullscreen() && !adminExitedFullscreen) {
    setTimeout(enterFullscreen, 800);
  }
}

// Beim ersten Touch/Klick Vollbild anfordern (Browser-Pflicht: user gesture)
function firstInteractionHandler() {
  if (!isFullscreen() && !adminExitedFullscreen) enterFullscreen();
}
document.addEventListener('click',      firstInteractionHandler, { once: true });
document.addEventListener('touchstart', firstInteractionHandler, { once: true });

// ── Wake Lock (Bildschirm wach halten) ──
async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
    }
  } catch {}
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') requestWakeLock();
});
requestWakeLock();

// ── Tastaturkürzel blockieren ──
document.addEventListener('keydown', e => {
  const blocked =
    e.key === 'F5'  || e.key === 'F11' || e.key === 'F12' ||
    e.key === 'F1'  || e.key === 'F2'  || e.key === 'F3'  ||
    (e.altKey  && e.key === 'F4') ||
    (e.ctrlKey && ['r','R','w','W','n','N','t','T','l','L','u','U','f','F','p','P','s','S'].includes(e.key)) ||
    (e.metaKey && ['r','R','w','W','n','N','t','T','l','L'].includes(e.key));
  if (blocked) { e.preventDefault(); e.stopPropagation(); }
}, true); // capture-Phase: vor allem anderen

// ── Kontextmenü (Rechtsklick / Langes Drücken) blockieren ──
document.addEventListener('contextmenu', e => e.preventDefault());

// ── Zurück-Geste / -Taste blockieren ──
history.pushState(null, '', location.href);
window.addEventListener('popstate', () => {
  history.pushState(null, '', location.href);
});

// ── Ziehen und Text-Selektion deaktivieren ──
document.addEventListener('dragstart',       e => e.preventDefault());
document.addEventListener('selectstart',     e => e.preventDefault());
// Layout ist position:fixed – kein globales touchmove-preventDefault nötig

// ── Orientierung sperren (Portrait – konsistent mit Manifest und CSS-Fallback) ──
try {
  screen.orientation?.lock?.('portrait').catch(() => {});
} catch {}



/* ── MY HOURS OVERLAY ───────────────────────────────────────── */
function fmtQuarterH(ms) {
  // Floor to completed quarter hours: only count full 15-min blocks
  const totalMin  = ms / 60000;
  const floored   = Math.floor(totalMin / 15) * 15;
  const h         = Math.floor(floored / 60);
  const m         = floored % 60;
  const frac      = m === 0 ? '0' : m === 15 ? '25' : m === 30 ? '5' : '75';
  return `${h},${frac}`;
}

function showMyHours() {
  if (!currentUser) return;
  renderMyHours();
  document.getElementById('my-hours-overlay').classList.add('visible');
}

function closeMyHours() {
  document.getElementById('my-hours-overlay').classList.remove('visible');
}

function renderMyHours() {
  const data    = computeHours();
  const mine    = data[currentUser.name] || {};
  const rowsEl  = document.getElementById('my-hours-rows');

  const allRows = TYPES.map(t => {
    const d    = mine[t.logType];
    const ms   = d?.totalMs || 0;
    const live = d?.active   || false;
    const val  = fmtQuarterH(ms);
    const colorVars = { blue: '--blue', green: '--green', amber: '--amber', red: '--red', violet: '--violet', orange: '--orange', cyan: '--cyan', pink: '--pink', lime: '--lime', grey: '--grey' };
    const _fallbackVars = ['--blue','--amber','--red','--green','--violet','--orange','--cyan','--pink','--lime','--grey'];
    const col  = `var(${colorVars[t.color] || _fallbackVars[TYPES.indexOf(t) % 5]})`;
    return `
      <div class="my-hours-row" style="border-left-color:${col}">
        <span class="my-hours-label" style="color:${col}">${escHtml(t.label)}</span>
        <span class="my-hours-val" style="color:${col}">
          ${val}<span class="my-hours-unit">h${live ? ' ●' : ''}</span>
        </span>
      </div>`;
  });

  rowsEl.innerHTML = allRows.join('');
}

/* ── SCREENSAVER ────────────────────────────────────────────── */
const SS_TIMEOUT = CONFIG.screensaverSeconds ?? 60; // seconds of inactivity on login screen before screensaver
let ssTimer    = null;
let ssMoveTimer = null;
let ssActive   = false;

function startSsTimer() {
  stopSsTimer();
  ssTimer = setTimeout(showScreensaver, SS_TIMEOUT * 1000);
}

function stopSsTimer() {
  if (ssTimer)    { clearTimeout(ssTimer);    ssTimer    = null; }
  if (ssMoveTimer){ clearInterval(ssMoveTimer); ssMoveTimer = null; }
  if (ssActive) hideScreensaverImmediate();
}

function showScreensaver() {
  ssActive = true;
  const el = document.getElementById('screensaver');
  el.classList.add('visible');
  moveSsClock();
  ssMoveTimer = setInterval(moveSsClock, 8000);
}

function hideScreensaver() {
  if (!ssActive) return;
  ssActive = false;
  document.getElementById('screensaver').classList.remove('visible');
  if (ssMoveTimer) { clearInterval(ssMoveTimer); ssMoveTimer = null; }
  // Restart idle timer so screensaver comes back if still on login
  startSsTimer();
}

function hideScreensaverImmediate() {
  ssActive = false;
  document.getElementById('screensaver').classList.remove('visible');
  if (ssMoveTimer) { clearInterval(ssMoveTimer); ssMoveTimer = null; }
}

function moveSsClock() {
  const el   = document.getElementById('ss-clock');
  const w    = el.offsetWidth  || 200;
  const h    = el.offsetHeight || 80;
  const maxX = Math.max(10, 100 - (w / window.innerWidth)  * 100 - 5);
  const maxY = Math.max(10, 100 - (h / window.innerHeight) * 100 - 5);
  el.style.left = (5 + Math.random() * (maxX - 5)).toFixed(1) + 'vw';
  el.style.top  = (5 + Math.random() * (maxY - 5)).toFixed(1) + 'vh';
}

// Screensaver schließen: der auslösende Touch/Klick soll NICHT
// gleichzeitig eine PIN-Taste drücken. Alle Folge-Events der gleichen
// Berührung (touchend, mousedown, mouseup, click) werden geblockt,
// bis der Finger wieder gehoben wurde (= click-Event abgeschlossen).
let _ssDismissed = false;

['touchstart', 'mousedown', 'keydown'].forEach(evt => {
  document.addEventListener(evt, e => {
    if (ssActive) {
      hideScreensaver();
      if (evt !== 'keydown') _ssDismissed = true;
      e.stopPropagation();
    }
  }, { capture: true });
});

// touchend und click (= Finger weg) der gleichen Berührung abfangen
document.addEventListener('touchend', e => {
  if (_ssDismissed) e.stopPropagation();
}, { capture: true });

document.addEventListener('mouseup', e => {
  if (_ssDismissed) e.stopPropagation();
}, { capture: true });

// click ist immer das letzte synthetische Event – danach Flag löschen
document.addEventListener('click', e => {
  if (_ssDismissed) { _ssDismissed = false; e.stopPropagation(); }
}, { capture: true });

// Interactions on the login screen reset the ss idle timer
['touchstart', 'mousedown', 'keydown'].forEach(evt => {
  document.addEventListener(evt, () => {
    if (!ssActive && document.getElementById('screen-login').classList.contains('active')) {
      startSsTimer();
    }
  });
});

// App startet auf dem Login-Screen → Screensaver-Timer sofort starten
startSsTimer();

// Nutzer aus Cloud nachziehen (async, nach Login-Screen-Render)
syncUsersFromCloud(true).then(ok => {
  if (ok && document.getElementById('screen-admin')?.classList.contains('active')) {
    renderUsersSection();
  }
});

// Einrichtungs-Button anzeigen wenn Cloud nicht konfiguriert
checkCloudSetupButton();

/* ── SPLASH ─────────────────────────────────────────────────── */
function openSplash() {
  document.getElementById('splash-version').textContent = 'v' + APP_VERSION;
  document.getElementById('splash-overlay').classList.add('visible');
}
function closeSplash() {
  document.getElementById('splash-overlay').classList.remove('visible');
}
document.querySelector('.app-brand').addEventListener('click', openSplash);

// Stille Konfigurationsprüfung beim Start
setTimeout(() => silentConfigCheck(), 3000);


// Session-Wiederherstellung ohne PIN wurde entfernt (Sicherheit: Shared-Tablet).
// Crash-Recovery für Wachstunde läuft nach PIN-Login in openDashboard().

/* ── TOAST ──────────────────────────────────────────────────── */
let toastTimer = null;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('visible');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('visible'), 2800);
}


/* ── CLOUD SETUP QR ──────────────────────────────────────────── */
let _qrStream   = null;
let _qrScanning = false;

function checkCloudSetupButton() {
  const wrap = document.getElementById('setup-cloud-wrap');
  if (!wrap) return;
  isCloudConfigured(getCloudConfig())
    ? wrap.classList.remove('visible')
    : wrap.classList.add('visible');
}

function openCloudSetup() {
  document.getElementById('cloud-setup-overlay').classList.add('visible');
  startQrScanner();
}

function closeCloudSetup() {
  document.getElementById('cloud-setup-overlay').classList.remove('visible');
  stopQrScanner();
  // Video und Status zurücksetzen, Eingabefelder leeren
  const video = document.getElementById('qr-video');
  const form  = document.getElementById('qr-manual-form');
  if (video) video.style.display = '';
  if (form)  form.querySelectorAll('input').forEach(i => i.value = '');
}

function stopQrScanner() {
  _qrScanning = false;
  if (_qrStream) { _qrStream.getTracks().forEach(t => t.stop()); _qrStream = null; }
  const v = document.getElementById('qr-video');
  if (v) v.srcObject = null;
}

async function startQrScanner() {
  const video  = document.getElementById('qr-video');
  const status = document.getElementById('qr-scan-status');
  if (!video || !status) return;
  status.textContent = 'Kamera wird gestartet…';

  if (!navigator.mediaDevices?.getUserMedia) {
    status.textContent = 'Kamera nicht verfügbar. Manuell konfigurieren.';
    return;
  }
  try {
    _qrStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    video.srcObject = _qrStream;
  } catch {
    status.textContent = 'Kamera-Zugriff verweigert.';
    return;
  }

  _qrScanning = true;
  status.textContent = 'QR-Code in Kamera halten…';

  if (typeof jsQR === 'undefined') {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'jsqr.min.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('jsqr.min.js fehlt oder ist beschädigt'));
      document.head.appendChild(s);
    });
  }

  const canvas = document.createElement('canvas');
  const ctx    = canvas.getContext('2d');

  const scan = () => {
    if (!_qrScanning) return;
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width  = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height);
      if (code) { handleQrResult(code.data); return; }
    }
    requestAnimationFrame(scan);
  };
  video.addEventListener('loadedmetadata', scan, { once: true });
}

function showManualCloudForm() {
  const video  = document.getElementById('qr-video');
  const status = document.getElementById('qr-scan-status');
  if (video)  video.style.display  = 'none';
  if (status) status.textContent   = 'QR-Scanner nicht verfügbar – bitte manuell eingeben.';
}

function submitManualCloud() {
  const url  = document.getElementById('qr-manual-url')?.value.trim()  || '';
  const user = document.getElementById('qr-manual-user')?.value.trim() || '';
  const pass = document.getElementById('qr-manual-pass')?.value.trim() || '';
  const status = document.getElementById('qr-scan-status');
  if (!url || !user || !pass) {
    if (status) { status.style.display = 'block'; status.textContent = 'Bitte alle Felder ausfüllen.'; }
    return;
  }
  const cfg = { url, user, pass };
  localStorage.setItem('lgc_cloud', JSON.stringify(cfg));
  closeCloudSetup();
  checkCloudSetupButton();
  showToast('☁ Cloud konfiguriert');
  syncUsersFromCloud(true);
  pushConfigToCloud(true);
}

function handleQrResult(raw) {
  const PREFIX = 'lgc://cloud?';
  const status = document.getElementById('qr-scan-status');
  if (!raw.startsWith(PREFIX)) {
    if (status) status.textContent = 'Ungültiger QR-Code. Bitte Einrichtungs-QR vom Admin scannen.';
    stopQrScanner();
    setTimeout(startQrScanner, 2000);
    return;
  }
  const p   = new URLSearchParams(raw.slice(PREFIX.length));
  const cfg = { url: p.get('url') || '', user: p.get('user') || '', pass: p.get('pass') || '' };
  if (!cfg.url || !cfg.user || !cfg.pass) {
    if (status) status.textContent = 'QR-Code unvollständig. Neuen QR beim Admin anfordern.';
    stopQrScanner();
    setTimeout(startQrScanner, 2000);
    return;
  }
  localStorage.setItem('lgc_cloud', JSON.stringify(cfg));
  closeCloudSetup();
  checkCloudSetupButton();
  showToast('☁ Cloud konfiguriert');
  syncUsersFromCloud(true);
  pushConfigToCloud(true); // Gerät in Cloud registrieren → sofort in Admin sichtbar
}

// ── Portrait-Lock: Manifest übernimmt bei installierter PWA.
// JS-Lock nur als Fallback für Browser ohne Manifest-Orientation-Support,
// aber ohne .lock() um die OS-Dreh-Animation beim Start zu vermeiden.
document.body.classList.add('orientation-ready');

// ── Service Worker registrieren ───────────────────────────────
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').catch(err => {
    console.warn('SW-Registrierung fehlgeschlagen:', err);
  });
  // Neuer SW hat übernommen → App neu laden (PWA-Update)
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    showToast('App-Update installiert – wird neu geladen…');
    setTimeout(() => location.reload(), 2000);
  });
}

// ── Event-Bindings (CSP: kein inline onclick) ──────────────────────────────
document.getElementById('btn-open-cloud-setup')?.addEventListener('click', openCloudSetup);
document.getElementById('btn-close-cloud-setup')?.addEventListener('click', closeCloudSetup);
document.getElementById('btn-submit-manual-cloud')?.addEventListener('click', submitManualCloud);
document.getElementById('btn-my-hours')?.addEventListener('click', showMyHours);
document.getElementById('btn-kiosk-exit')?.addEventListener('click', exitKioskMode);
document.getElementById('btn-close-splash')?.addEventListener('click', closeSplash);
document.getElementById('btn-close-my-hours')?.addEventListener('click', closeMyHours);
document.getElementById('btn-cancel-admin-pw')?.addEventListener('click', cancelAdminPw);
document.getElementById('btn-submit-admin-pw')?.addEventListener('click', submitAdminPw);
document.getElementById('btn-admin-pw-cloud')?.addEventListener('click', () => {
  cancelAdminPw(); openCloudSetup();
});

// Splash + Meine-Stunden Overlay: Klick auf Hintergrund schließt
document.getElementById('splash-overlay')?.addEventListener('click', e => {
  if (e.target === e.currentTarget) closeSplash();
});
document.getElementById('my-hours-overlay')?.addEventListener('click', e => {
  if (e.target === e.currentTarget) closeMyHours();
});

// Admin-Tabs
document.querySelectorAll('.admin-tab[data-tab]').forEach(btn =>
  btn.addEventListener('click', () => switchAdminTab(btn.dataset.tab))
);

// ── Event-Delegation: dynamisch gerenderte Buttons ─────────────────────────

// Dashboard: Stempel-Buttons (handleAction)
document.getElementById('dash-body')?.addEventListener('click', e => {
  const btn = e.target.closest('[data-type][data-action]');
  if (btn) handleAction(btn.dataset.type, btn.dataset.action);
});

// Stunden-Übersicht: Ausstempeln + Bearbeiten
document.getElementById('ov-section')?.addEventListener('click', e => {
  const btn = e.target.closest('[data-user-action]');
  if (!btn) return;
  const action = btn.dataset.userAction;
  if (action === 'stop-sessions') stopUserSessions(btn.dataset.uid, btn.dataset.name);
  if (action === 'edit-modal') openEditModal(btn.dataset.name);
});

// Edit-Modal: Löschen/Wiederherstellen + Zeitstempel-Änderung
document.getElementById('modal-body')?.addEventListener('click', e => {
  const btn = e.target.closest('[data-entry-idx]');
  if (btn && btn.tagName === 'BUTTON') toggleDeleteEntry(Number(btn.dataset.entryIdx));
});
document.getElementById('modal-body')?.addEventListener('change', e => {
  const inp = e.target.closest('input[data-entry-idx]');
  if (inp) updateEntryTs(Number(inp.dataset.entryIdx), inp.value);
});

// Backup: CSV-Download
document.getElementById('backup-section')?.addEventListener('click', e => {
  const btn = e.target.closest('[data-backup-key]');
  if (btn) downloadBackup(btn.dataset.backupKey);
});

// Passwort-Sektion
document.getElementById('pw-section')?.addEventListener('click', e => {
  if (e.target.closest('#btn-save-admin-pw-form')) saveAdminPwForm();
});

// Cloud-Sektion: alle Buttons mit data-cloud-action
document.getElementById('cloud-section')?.addEventListener('click', e => {
  const btn = e.target.closest('[data-cloud-action]');
  if (!btn) return;
  const action = btn.dataset.cloudAction;
  if (action === 'save-config')   saveCloudConfig_form();
  if (action === 'test')          testCloudConnection();
  if (action === 'sync')          syncToCloud(false);
  if (action === 'restore')       restoreFromCloud();
  if (action === 'restore-users') restoreUsersFromCloud();
  if (action === 'push-config')   pushConfigToCloud();
  if (action === 'pull-config')   pullConfigFromCloud();
  if (action === 'reset-config')  resetConfigCloud();
  if (action === 'clear-errors')  clearCloudErrors();
});

// User-Verwaltung: alle Buttons mit data-user-action
document.getElementById('users-section')?.addEventListener('click', e => {
  const btn = e.target.closest('[data-user-action]');
  if (!btn) return;
  const action = btn.dataset.userAction;
  const uid    = btn.dataset.uid;
  if (action === 'toggle-edit') toggleUserEdit(uid);
  if (action === 'save-edit')   saveUserEdit(uid);
  if (action === 'reset-pin')   resetUserPINRandom(uid);
  if (action === 'delete')      deleteUser(uid);
  if (action === 'cancel-new')  cancelNewUser();
  if (action === 'add')         addUser();
});
