/* editor-app.js – aus editor.html extrahiert (CSP-Migration) */
if (typeof CONFIG === 'undefined') window.CONFIG = undefined;
if (typeof ADMIN_CONFIG === 'undefined') window.ADMIN_CONFIG = undefined;

// ─── HTML-Escape ──────────────────────────────────────────────────────────────
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── Import-Validierung ───────────────────────────────────────────────────────
function normalizeLogEntries(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter(e =>
    e && typeof e === 'object'
    && typeof e.nutzer === 'string' && e.nutzer
    && typeof e.typ === 'string'
    && typeof e.aktion === 'string' && (e.aktion === 'start' || e.aktion === 'stop')
    && typeof e.zeitstempel === 'string' && !isNaN(Date.parse(e.zeitstempel))
  ).map(e => {
    const fallbackId = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : String(genId());
    const n = { id: e.id ?? fallbackId, nutzer: e.nutzer, typ: e.typ, aktion: e.aktion, zeitstempel: e.zeitstempel };
    if (typeof e.dauer_ms === 'number') n.dauer_ms = e.dauer_ms;
    return n;
  });
}

// ─── State ────────────────────────────────────────────────────────────────────
let logData      = null;   // { version, exported, logicalDay, count, log }
let history      = [];     // undo stack: array of JSON strings
let histIdx      = -1;
let filterPerson = null;
let activeTab    = 'table';
let editingId    = null;   // id of row currently in inline edit mode
let cloudFileUrl = null;   // URL der geladenen Cloud-Datei (null = lokal)
let cloudDirty   = false;  // true wenn ungespeicherte Änderungen gegenüber Cloud
let cloudIsPIF   = false;  // true wenn geladene Cloud-Datei ein PIF (lgc_pif_*) ist
let addMode      = 'pair'; // 'pair' | 'single'

// ─── Typ-Farb-Palette (passend zu LifeguardClock.html) ────────────────────────────
const COLOR_PALETTE = {
  blue:   { main: '#3b82f6', dim: 'rgba(59,130,246,.15)'  },
  green:  { main: '#22c55e', dim: 'rgba(34,197,94,.15)'   },
  amber:  { main: '#f59e0b', dim: 'rgba(245,158,11,.15)'  },
  orange: { main: '#fb923c', dim: 'rgba(251,146,60,.15)'  },
  red:    { main: '#ef4444', dim: 'rgba(239,68,68,.15)'   },
  lime:   { main: '#a3e635', dim: 'rgba(163,230,53,.15)'  },
  cyan:   { main: '#22d3ee', dim: 'rgba(34,211,238,.15)'  },
  violet: { main: '#8b5cf6', dim: 'rgba(139,92,246,.15)'  },
  pink:   { main: '#f472b6', dim: 'rgba(244,114,182,.15)' },
  grey:   { main: '#9ca3af', dim: 'rgba(156,163,175,.15)' },
};
const _FALLBACK_COLOR_ORDER = ['blue','amber','red','green','violet','orange','cyan','pink','lime','grey'];

// Stabiler Hash-Fallback: gleicher logType → immer gleiche Farbe
function _hashColor(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = (h * 33 ^ str.charCodeAt(i)) >>> 0;
  return COLOR_PALETTE[_FALLBACK_COLOR_ORDER[h % 5]];
}

// Dynamisch aus CONFIG.types aufgebaut; wird bei jedem Laden erweitert
let _TYPES   = [];   // [{ logType, label, main, dim }, …]
let _TYPE_MAP = {};  // logType → { logType, label, main, dim }

function buildTypeMaps() {
  const seen = new Set();
  const result = [];

  // 1. Aus lgc_type_config (localStorage, gesetzt von LifeguardClock.html),
  //    dann lgc_cloud_types (direkte Cloud-Quelle), dann CONFIG.types als Fallback
  let _cfgTypes = null;
  try {
    const stored = JSON.parse(localStorage.getItem('lgc_type_config') || '[]');
    if (stored.length > 0) _cfgTypes = stored;
  } catch (e) {}
  if (!_cfgTypes) {
    try {
      const cloud = JSON.parse(localStorage.getItem('lgc_cloud_types') || '[]');
      if (cloud.length > 0) _cfgTypes = cloud.filter(t => !t.disabled);
    } catch (e) {}
  }
  if (!_cfgTypes) {
    try { if (Array.isArray(CONFIG?.types)) _cfgTypes = CONFIG.types.filter(t => !t.disabled); } catch(e) {}
  }
  if (_cfgTypes) {
    _cfgTypes.forEach((t, i) => {
      const c = COLOR_PALETTE[t.color] || _hashColor(t.logType);
      result.push({ logType: t.logType, label: t.label, main: c.main, dim: c.dim });
      seen.add(t.logType);
    });
  }

  // 2. Typen im geladenen Log, die nicht in CONFIG stehen (Alt-Daten)
  if (logData?.log) {
    [...new Set(logData.log.map(e => e.typ))].filter(Boolean).forEach(lt => {
      if (seen.has(lt)) return;
      const c = _hashColor(lt);
      result.push({ logType: lt, label: lt, main: c.main, dim: c.dim });
      seen.add(lt);
    });
  }

  // 3. Minimal-Fallback (kein config.js, leere Datei)
  if (result.length === 0) {
    [['anwesenheit','Anwesenheit','blue'],
     ['wachstunde_ehrenamtlich','Wachstunden','amber'],
     ['sanitätsstunde','Sanitätsstunden','red']].forEach(([lt, lbl, col]) => {
      const c = COLOR_PALETTE[col];
      result.push({ logType: lt, label: lbl, main: c.main, dim: c.dim });
    });
  }

  _TYPES   = result;
  _TYPE_MAP = {};
  _TYPES.forEach(t => { _TYPE_MAP[t.logType] = t; });
}

function populateTypSelect() {
  const sel = document.getElementById('add-typ');
  sel.innerHTML = _TYPES.map(t =>
    `<option value="${escHtml(t.logType)}">${escHtml(t.label)}</option>`
  ).join('');
}

// ─── Utils ────────────────────────────────────────────────────────────────────
function genId() { return Date.now() + Math.random(); }
function showToast(msg) { alert(msg); }
function sameEntryId(a, b) { return String(a) === String(b); }
function getEntryById(id) {
  return logData?.log?.find(e => sameEntryId(e.id, id));
}
function markDirty() {
  if (!cloudFileUrl) return;
  cloudDirty = true;
  syncCloudSaveBtn();
}

function isoToLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = n => String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function localInputToIso(local) {
  if (!local) return '';
  return new Date(local).toISOString();
}

function fmtMs(ms) {
  if (!ms || ms < 0) return '—';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}:${String(m).padStart(2,'0')} h` : `${m} min`;
}
function fmtDatetime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit' }) + ' ' +
         d.toLocaleTimeString('de-DE', { hour:'2-digit', minute:'2-digit' });
}
function fmtTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('de-DE', { hour:'2-digit', minute:'2-digit' });
}

// ─── Personen (config.js + geladene Datei) ────────────────────────────────────
function getKnownPersons() {
  const names = new Set();
  if (typeof CONFIG !== 'undefined' && CONFIG?.defaultUsers)
    CONFIG.defaultUsers.forEach(u => names.add(u.name));
  logData?.log?.forEach(e => e.nutzer && names.add(e.nutzer));
  return [...names].sort();
}
function updateDatalist() {
  document.getElementById('known-persons-list').innerHTML =
    getKnownPersons().map(n => `<option value="${n.replace(/"/g,'&quot;')}">`).join('');
}

// ─── Cloud: Credentials & Helpers ────────────────────────────────────────────
const IS_PROXY = location.hostname === 'localhost' || location.hostname === '127.0.0.1';

function getCloudCreds() {
  try {
    const s = JSON.parse(localStorage.getItem('lgc_cloud') || '{}');
    if (s.user && s.pass && (IS_PROXY || s.url)) return s;
  } catch {}
  if (window.ADMIN_CONFIG?.cloud?.user && window.ADMIN_CONFIG?.cloud?.pass) {
    const c = window.ADMIN_CONFIG.cloud;
    const creds = { url: c.url || '', user: c.user, pass: c.pass };
    localStorage.setItem('lgc_cloud', JSON.stringify(creds));
    return creds;
  }
  return null;
}

function cloudDavBase(creds) {
  if (IS_PROXY) return `/remote.php/dav/files/${encodeURIComponent(creds.user)}/LifeguardClock`;
  const url = creds.url.trim().replace(/\/$/, '')
    .replace(/\/remote\.php\/dav.*/i, '').replace(/\/index\.php.*/i, '');
  return `${url}/remote.php/dav/files/${encodeURIComponent(creds.user)}/LifeguardClock`;
}

function cloudAuth(creds) {
  return 'Basic ' + btoa(unescape(encodeURIComponent(creds.user + ':' + creds.pass)));
}

function syncCloudSaveBtn() {
  const btn = document.getElementById('btn-cloud-save');
  const ind = document.getElementById('hdr-cloud-file');
  if (!cloudFileUrl) {
    btn.disabled = true;
    btn.textContent = '\u2601 Speichern';
    btn.classList.remove('dirty');
    ind.style.display = 'none';
    return;
  }
  const name = cloudFileUrl.split('/').pop();
  ind.textContent = '\u2601 ' + name;
  ind.style.display = '';
  btn.disabled = !cloudDirty;
  if (cloudDirty) {
    btn.textContent = '\u2601 Speichern\u2009*';
    btn.classList.add('dirty');
  } else {
    btn.textContent = '\u2601 Gespeichert';
    btn.classList.remove('dirty');
  }
}

// ─── Cloud: Datei-Liste laden ─────────────────────────────────────────────────
async function openCloudPicker() {
  const creds = getCloudCreds();
  if (!creds) {
    alert('Keine Cloud-Zugangsdaten gefunden.\nBitte zuerst in admin.html konfigurieren.');
    return;
  }
  const btn = document.getElementById('btn-cloud-load');
  btn.disabled = true; btn.textContent = '\u23F3 Lade\u2026';
  try {
    const base = cloudDavBase(creds);
    const auth = cloudAuth(creds);
    await fetch(base, { method: 'MKCOL', headers: { Authorization: auth } }).catch(() => {});
    const res = await fetch(base, {
      method: 'PROPFIND',
      headers: { Authorization: auth, Depth: '1' },
    });
    if (res.status === 404) {
      alert('Kein LifeguardClock-Ordner in der Cloud.\nBitte erst die Hauptapp synchronisieren.');
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    const hrefs = [...xml.matchAll(/<[^>]*:href[^>]*>([^<]+)<\/[^>]*:href>/g)]
      .map(m => decodeURIComponent(m[1].trim()))
      .filter(h => /lgc_pif_.+_\d{4}-\d{2}\.json$/.test(h))
      .sort((a, b) => b.localeCompare(a));
    if (hrefs.length === 0) {
      alert('Keine PIF-Dateien in der Cloud gefunden.\nBitte erst mit LifeguardClock stempeln um Nutzerdaten zu erzeugen.\n\nLegacy-Gerätedateien können weiterhin über „Datei öffnen" geladen werden.');
      return;
    }
    const sel = document.getElementById('cloud-file-select');
    sel.innerHTML = hrefs.map(h => {
      const name = h.split('/').pop();
      const m    = name.match(/^lgc_pif_(.+)_(\d{4}-\d{2})\.json$/);
      const label = m ? `${m[2]}  –  ${m[1]}` : name;
      return `<option value="${escHtml(h)}">${escHtml(label)}</option>`;
    }).join('');
    document.getElementById('modal-cloud').showModal();
  } catch(e) {
    alert('Cloud-Fehler: ' + e.message);
  } finally {
    btn.disabled = false; btn.textContent = '\u2601 Cloud';
  }
}

// ─── Typen aus Cloud holen und localStorage aktualisieren ─────────────────────
async function refreshTypesFromCloud() {
  const creds = getCloudCreds();
  if (!creds) return;
  try {
    const r = await fetch(`${cloudDavBase(creds)}/lgc_types.json`,
      { headers: { Authorization: cloudAuth(creds) }, cache: 'no-store' });
    if (!r.ok) return;
    const data = await r.json();
    if (!Array.isArray(data.types) || data.types.length === 0) return;
    // lgc_type_config überschreiben damit buildTypeMaps die frischen Farben nimmt
    localStorage.setItem('lgc_cloud_types', JSON.stringify(data.types));
    localStorage.setItem('lgc_type_config', JSON.stringify(
      data.types.filter(t => !t.disabled).map(t => ({ logType: t.logType, label: t.label, color: t.color }))
    ));
  } catch {}
}

// ─── Cloud: Datei laden ───────────────────────────────────────────────────────
async function loadFromCloud(href) {
  const creds = getCloudCreds();
  if (!creds) return;
  const auth    = cloudAuth(creds);
  const fileUrl = IS_PROXY
    ? href
    : (creds.url.trim().replace(/\/$/, '') + (href.startsWith('/') ? href : '/' + href));
  try {
    const [r] = await Promise.all([
      fetch(fileUrl, { headers: { Authorization: auth } }),
      refreshTypesFromCloud(),
    ]);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const json = await r.json();
    cloudIsPIF = !!(json.version === 1 && json.userId && Array.isArray(json.entries));
    const rawLog = cloudIsPIF ? json.entries : (json.log || []);
    logData    = { ...json, log: normalizeLogEntries(rawLog) };
    cloudFileUrl = fileUrl;
    cloudDirty   = false;
    history = []; histIdx = -1; editingId = null; filterPerson = null;
    buildTypeMaps();
    populateTypSelect();
    pushHistory();
    renderAll();
    syncCloudSaveBtn();
  } catch(e) { alert('Fehler beim Laden: ' + e.message); }
}

// ─── Cloud: Speichern (PUT) ───────────────────────────────────────────────────
async function saveToCloud() {
  if (!cloudFileUrl || !cloudDirty) return;
  const creds = getCloudCreds();
  if (!creds) return;
  const btn = document.getElementById('btn-cloud-save');
  btn.disabled = true; btn.textContent = '\u23F3 Speichere\u2026';
  try {
    const out = { ...logData, exported: new Date().toISOString(), count: logData.log.length };
    if (cloudIsPIF) { out.entries = out.log; delete out.log; }
    const r = await fetch(cloudFileUrl, {
      method: 'PUT',
      headers: { Authorization: cloudAuth(creds), 'Content-Type': 'application/json' },
      body: JSON.stringify(out, null, 2),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    cloudDirty = false;
    syncCloudSaveBtn();
  } catch(e) {
    alert('Speichern fehlgeschlagen: ' + e.message);
    btn.disabled = false;
    syncCloudSaveBtn();
  }
}

// ─── Datei laden / neu ────────────────────────────────────────────────────────
async function loadFile(file) {
  try {
    const json = JSON.parse(await file.text());
    const isPIF = !!(json.version === 1 && json.userId && Array.isArray(json.entries));
    const rawLog = isPIF ? json.entries : (json.log || []);
    logData      = { ...json, log: normalizeLogEntries(rawLog) };
    cloudFileUrl = null; cloudDirty = false; cloudIsPIF = false;
    history = []; histIdx = -1; editingId = null; filterPerson = null;
    buildTypeMaps();
    populateTypSelect();
    pushHistory();
    renderAll();
    syncCloudSaveBtn();
  } catch(e) { alert('Ungültige JSON-Datei: ' + e.message); }
}

function newFile() {
  const today = new Date().toISOString().slice(0,10);
  logData = { version: 2, exported: new Date().toISOString(),
              logicalDay: today, count: 0, log: [] };
  cloudFileUrl = null; cloudDirty = false;
  history = []; histIdx = -1; editingId = null; filterPerson = null;
  buildTypeMaps();
  populateTypSelect();
  pushHistory();
  renderAll();
  syncCloudSaveBtn();
}

// ─── Undo / Redo ──────────────────────────────────────────────────────────────
function pushHistory() {
  history = history.slice(0, histIdx + 1);
  history.push(JSON.stringify({ log: logData.log, logicalDay: logData.logicalDay }));
  if (history.length > 50) history.shift();
  histIdx = history.length - 1;
  syncUndoButtons();
}
function _restoreSnap(snap) {
  logData.log        = snap.log;
  logData.logicalDay = snap.logicalDay;
  logData.count      = snap.log.length;
  document.getElementById('inp-logical-day').value = snap.logicalDay || '';
  editingId = null;
  markDirty();
  syncUndoButtons();
  renderAll();
}
function undo() {
  if (histIdx <= 0) return;
  histIdx--;
  _restoreSnap(JSON.parse(history[histIdx]));
}
function redo() {
  if (histIdx >= history.length - 1) return;
  histIdx++;
  _restoreSnap(JSON.parse(history[histIdx]));
}
function syncUndoButtons() {
  document.getElementById('btn-undo').disabled = histIdx <= 0;
  document.getElementById('btn-redo').disabled = histIdx >= history.length - 1;
}

// ─── Paar-Validierung ─────────────────────────────────────────────────────────
function validatePairs(log) {
  const issues = new Set();
  const groups = {};
  for (const e of log) {
    const k = `${e.nutzer}|${e.typ}`;
    if (!groups[k]) groups[k] = [];
    groups[k].push(e);
  }
  for (const entries of Object.values(groups)) {
    const sorted = [...entries].sort((a,b) => new Date(a.zeitstempel) - new Date(b.zeitstempel));
    let openStart = null;
    for (const e of sorted) {
      if (e.aktion === 'start') {
        if (openStart) issues.add(openStart.id); // doppelter Start
        openStart = e;
      } else {
        if (!openStart) issues.add(e.id); // Stop ohne Start
        else openStart = null;
      }
    }
    if (openStart) issues.add(openStart.id); // unclosed
  }
  return issues;
}

// ─── Validation: Konstante ────────────────────────────────────────────────────
const MIN_PAIR_DURATION_MS = 15 * 60 * 1000;

// ─── buildValidationIssues ───────────────────────────────────────────────────
function buildValidationIssues(enrichedEntries, typesConfig) {
  const DAY_BOUNDARY = 4;
  function logicalDay(isoTs) {
    const d = new Date(isoTs);
    if (d.getHours() < DAY_BOUNDARY) d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }
  const groups = {};
  for (const e of enrichedEntries) {
    const k = `${e.nutzer}|||${e.typ}`;
    if (!groups[k]) groups[k] = [];
    groups[k].push(e);
  }
  const issues = [];
  for (const group of Object.values(groups)) {
    const sorted = [...group].sort((a, b) => new Date(a.zeitstempel) - new Date(b.zeitstempel));
    let openStart = null;
    for (const e of sorted) {
      if (e.aktion === 'start') {
        if (openStart) {
          issues.push({ issueType: 'double-start', person: e.nutzer, logType: e.typ,
            logicalDate: logicalDay(openStart.zeitstempel), mainEntry: null,
            entries: [openStart, e], pifHref: openStart.pifHref, linked: [], skipped: false });
        }
        openStart = e;
      } else {
        if (!openStart) {
          issues.push({ issueType: 'orphan-stop', person: e.nutzer, logType: e.typ,
            logicalDate: logicalDay(e.zeitstempel), mainEntry: e,
            entries: [e], pifHref: e.pifHref, linked: [], skipped: false });
        } else {
          const durMs = new Date(e.zeitstempel) - new Date(openStart.zeitstempel);
          if (durMs > 0 && durMs < MIN_PAIR_DURATION_MS) {
            issues.push({ issueType: 'short-pair', person: e.nutzer, logType: e.typ,
              logicalDate: logicalDay(openStart.zeitstempel), mainEntry: null,
              entries: [openStart, e], pifHref: openStart.pifHref, linked: [], skipped: false });
          }
          openStart = null;
        }
      }
    }
    if (openStart) {
      issues.push({ issueType: 'open-start', person: openStart.nutzer, logType: openStart.typ,
        logicalDate: logicalDay(openStart.zeitstempel), mainEntry: openStart,
        entries: [openStart], pifHref: openStart.pifHref, linked: [], skipped: false });
    }
  }
  return issues;
}

// ─── getLinkedIssues ─────────────────────────────────────────────────────────
function getLinkedIssues(issue, allIssues, typesConfig) {
  if (issue.issueType !== 'open-start') return [];
  const myType = typesConfig.find(t => t.logType === issue.logType);
  const myIsService = !!myType?.autoStartKeys?.includes('anwesenheit');
  return allIssues.filter(o =>
    o !== issue &&
    o.issueType === 'open-start' &&
    o.person === issue.person &&
    o.logicalDate === issue.logicalDate &&
    !o.skipped &&
    (
      (issue.logType === 'anwesenheit' &&
        !!typesConfig.find(t => t.logType === o.logType)?.autoStartKeys?.includes('anwesenheit')) ||
      (myIsService && o.logType === 'anwesenheit')
    )
  );
}

// ─── Validation State ─────────────────────────────────────────────────────────
let validationIssues  = [];
let validationPifCache = {};

// ─── Fix-Mutationsfunktionen ──────────────────────────────────────────────────
function applyOpenStartFix(issue, stopIso, linkedToFix) {
  const dur = new Date(stopIso) - new Date(issue.mainEntry.zeitstempel);
  validationPifCache[issue.pifHref].entries.push({
    id: genId(), nutzer: issue.person, typ: issue.logType,
    aktion: 'stop', zeitstempel: stopIso, dauer_ms: dur,
  });
  for (const linked of linkedToFix) {
    const linkedDur = new Date(stopIso) - new Date(linked.mainEntry.zeitstempel);
    validationPifCache[linked.pifHref].entries.push({
      id: genId(), nutzer: linked.person, typ: linked.logType,
      aktion: 'stop', zeitstempel: stopIso, dauer_ms: linkedDur,
    });
  }
}

function applyOrphanStopFix(issue, startIso) {
  validationPifCache[issue.pifHref].entries.push({
    id: genId(), nutzer: issue.person, typ: issue.logType,
    aktion: 'start', zeitstempel: startIso,
  });
  const stopInCache = validationPifCache[issue.pifHref].entries.find(
    e => String(e.id) === String(issue.mainEntry.id)
  );
  if (stopInCache) stopInCache.dauer_ms = new Date(stopInCache.zeitstempel) - new Date(startIso);
}

function applyDoubleStartFix(issue, deleteId) {
  const toDelete = issue.entries.find(e => String(e.id) === String(deleteId));
  if (!toDelete || !validationPifCache[toDelete.pifHref]) return;
  validationPifCache[toDelete.pifHref].entries =
    validationPifCache[toDelete.pifHref].entries.filter(
      e => String(e.id) !== String(deleteId)
    );
}

function applyShortPairFix(issue, newStartIso, newStopIso) {
  const [start, stop] = issue.entries;
  const startInCache = validationPifCache[start.pifHref].entries.find(
    e => String(e.id) === String(start.id)
  );
  const stopInCache = validationPifCache[stop.pifHref].entries.find(
    e => String(e.id) === String(stop.id)
  );
  if (startInCache) startInCache.zeitstempel = newStartIso;
  if (stopInCache) {
    stopInCache.zeitstempel = newStopIso;
    stopInCache.dauer_ms = new Date(newStopIso) - new Date(newStartIso);
  }
}

function applyDeleteFix(issue) {
  for (const e of issue.entries) {
    validationPifCache[e.pifHref].entries =
      validationPifCache[e.pifHref].entries.filter(
        c => String(c.id) !== String(e.id)
      );
  }
}

// ─── Cloud: PIF-Dateien speichern ─────────────────────────────────────────────
async function savePifHrefs(hrefs) {
  const creds = getCloudCreds();
  if (!creds) throw new Error('Keine Cloud-Zugangsdaten');
  await Promise.all([...new Set(hrefs)].map(href => {
    const pif = validationPifCache[href];
    const out = { ...pif, exported: new Date().toISOString(), count: pif.entries.length };
    return fetch(href, {
      method: 'PUT',
      headers: { Authorization: cloudAuth(creds), 'Content-Type': 'application/json' },
      body: JSON.stringify(out, null, 2),
    }).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); });
  }));
}

function issueTypeLabel(type) {
  return { 'open-start': 'Vergessen auszustempeln', 'orphan-stop': 'Stop ohne Start',
           'double-start': 'Doppelt eingestempelt', 'short-pair': 'Verdächtig kurze Dauer',
         }[type] || type;
}

function setValidationTabBadge(state) {
  const tab = document.getElementById('tab-validation');
  if (!tab) return;
  tab.style.display = '';
  if (state === 'loading') { tab.textContent = '⏳ Prüfe…'; return; }
  if (state === 'error')   { tab.textContent = '⚠ Fehler'; return; }
  const n = typeof state === 'number' ? state : validationIssues.filter(i => !i.skipped).length;
  tab.textContent = n === 0 ? '✓ Alles OK' : `⚠ Probleme (${n})`;
}

async function fetchAndValidate() {
  const creds = getCloudCreds();
  if (!creds) {
    alert('Keine Cloud-Zugangsdaten gefunden.\nBitte zuerst in admin.html konfigurieren.');
    return;
  }
  const btn = document.getElementById('btn-validate-all');
  btn.disabled = true;
  setValidationTabBadge('loading');
  // Tab anzeigen + aktivieren
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-validation').classList.add('active');
  activeTab = 'validation';
  document.getElementById('panel-table').hidden    = true;
  document.getElementById('panel-timeline').hidden = true;
  document.getElementById('panel-validation').hidden = false;
  document.getElementById('panel-empty').hidden    = true;
  document.getElementById('validation-cards').innerHTML =
    '<div class="v-empty"><div class="v-empty-title" style="color:var(--text-2)">Lade PIF-Dateien…</div></div>';
  try {
    const base = cloudDavBase(creds);
    const auth = cloudAuth(creds);
    await Promise.all([
      fetch(base, { method: 'MKCOL', headers: { Authorization: auth } }).catch(() => {}),
      refreshTypesFromCloud(),
    ]);
    const res = await fetch(base, { method: 'PROPFIND',
      headers: { Authorization: auth, Depth: '1' } });
    if (!res.ok) throw new Error(`PROPFIND HTTP ${res.status}`);
    const xml = await res.text();

    const now = new Date();
    const months = [
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
      (() => { const d = new Date(now); d.setMonth(d.getMonth() - 1);
               return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; })(),
    ];

    const hrefs = [...xml.matchAll(/<[^>]*:href[^>]*>([^<]+)<\/[^>]*:href>/g)]
      .map(m => decodeURIComponent(m[1].trim()))
      .filter(h => /lgc_pif_.+_\d{4}-\d{2}\.json$/.test(h) &&
                   months.some(mo => h.includes(`_${mo}.json`)));

    if (hrefs.length === 0) {
      setValidationTabBadge(0);
      document.getElementById('validation-cards').innerHTML =
        '<div class="v-empty"><div class="v-empty-icon">☁</div>' +
        '<div class="v-empty-title" style="color:var(--text-2)">Keine PIF-Dateien für die letzten zwei Monate gefunden</div></div>';
      return;
    }

    validationPifCache = {};
    const results = await Promise.allSettled(hrefs.map(async href => {
      const fileUrl = IS_PROXY
        ? href
        : (creds.url.trim().replace(/\/$/, '') + (href.startsWith('/') ? href : '/' + href));
      const r = await fetch(fileUrl, { headers: { Authorization: auth } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      validationPifCache[fileUrl] = { ...data, entries: normalizeLogEntries(data.entries || []) };
      return fileUrl;
    }));

    const failed = results.filter(r => r.status === 'rejected').length;
    if (failed > 0) showToast(`${failed} Datei(en) konnten nicht geladen werden.`);

    const enrichedEntries = [];
    for (const [href, pif] of Object.entries(validationPifCache)) {
      for (const e of pif.entries) enrichedEntries.push({ ...e, pifHref: href });
    }

    let typesConfig = [];
    try {
      typesConfig = JSON.parse(localStorage.getItem('lgc_cloud_types') || '[]');
      if (!typesConfig.length) typesConfig = JSON.parse(localStorage.getItem('lgc_type_config') || '[]');
    } catch {}

    validationIssues = buildValidationIssues(enrichedEntries, typesConfig);
    for (const issue of validationIssues) {
      issue.linked = getLinkedIssues(issue, validationIssues, typesConfig);
    }

    buildTypeMaps();
    renderValidationPanel();
  } catch (e) {
    alert('Fehler beim Prüfen: ' + e.message);
    setValidationTabBadge('error');
  } finally {
    btn.disabled = false;
  }
}

function renderValidationPanel() {
  const active = validationIssues.filter(i => !i.skipped);
  setValidationTabBadge(active.length);
  const container = document.getElementById('validation-cards');
  if (!container) return;

  if (validationIssues.length === 0) {
    container.innerHTML = '<div class="v-empty"><div class="v-empty-icon">✓</div>' +
      '<div class="v-empty-title">Keine Probleme gefunden</div></div>';
    return;
  }

  let html = '';
  if (active.length === 0 && validationIssues.some(i => i.skipped)) {
    html += `<div class="v-all-skipped">${validationIssues.length} Issue(s) übersprungen.&nbsp;` +
      `<button class="btn btn-sm" id="btn-reset-skip">Alle zurücksetzen</button></div>`;
  }
  for (let i = 0; i < validationIssues.length; i++) {
    html += renderIssueCard(validationIssues[i], i);
  }
  container.innerHTML = html;
}

function renderIssueCard(issue, idx) {
  const ti = _TYPE_MAP[issue.logType] ||
    { label: issue.logType, main: '#9ca3af', dim: 'rgba(156,163,175,.15)' };
  const dateStr = issue.logicalDate
    ? new Date(issue.logicalDate + 'T12:00:00').toLocaleDateString('de-DE',
        { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '';
  const hdr = `<div class="v-card-hdr">
    <span class="v-person">${escHtml(issue.person)}</span>
    <span class="badge-typ" style="background:${ti.dim};color:${ti.main}">${escHtml(ti.label)}</span>
    <span class="v-date">${escHtml(dateStr)}</span>
    <span class="badge-issue-type ${escHtml(issue.issueType)}">${escHtml(issueTypeLabel(issue.issueType))}</span>
  </div>`;

  if (issue.skipped) {
    return `<div class="v-card v-card-skipped" data-issue-idx="${idx}">${hdr}
      <div class="v-card-body"><div style="display:flex;gap:8px;align-items:center">
        <span class="v-skip-note">&#x2192; Übersprungen</span>
        <button class="btn btn-sm v-unskip" data-issue-idx="${idx}">Zurücksetzen</button>
      </div></div></div>`;
  }

  let body = '';
  if (issue.issueType === 'open-start') {
    const startTime = escHtml(fmtTime(issue.mainEntry.zeitstempel));
    const defStop   = issue.logicalDate ? `${issue.logicalDate}T16:00` : '';
    const linkedHtml = issue.linked.map((lk, li) => {
      const lti = _TYPE_MAP[lk.logType] || { label: lk.logType, main: '#9ca3af' };
      return `<label class="v-linked-label">
        <input type="checkbox" class="v-linked-check"
          data-issue-idx="${idx}" data-linked-idx="${li}" checked>
        <span style="color:${lti.main}">${escHtml(lti.label)}</span> ebenfalls beenden
      </label>`;
    }).join('');
    body = `<div class="v-info">Eingestempelt: ${startTime} &mdash; kein Stop vorhanden</div>
      <div class="v-fix-row">
        <span class="v-fix-label">Stop-Zeit</span>
        <input type="datetime-local" class="v-time-input" id="v-stop-${idx}"
          value="${escHtml(defStop)}" step="60">
      </div>
      ${linkedHtml ? `<div class="v-linked-group">${linkedHtml}</div>` : ''}
      <div class="v-card-ftr">
        <button class="btn btn-sm btn-primary v-fix-open-start" data-issue-idx="${idx}">✓ Speichern</button>
        <button class="btn btn-sm v-skip" data-issue-idx="${idx}">→ Überspringen</button>
        <button class="btn btn-sm btn-danger v-delete-start" data-issue-idx="${idx}">✗ Start löschen</button>
      </div>`;
  } else if (issue.issueType === 'orphan-stop') {
    const stopTime = escHtml(fmtTime(issue.mainEntry.zeitstempel));
    const defStart = issue.logicalDate ? `${issue.logicalDate}T08:00` : '';
    body = `<div class="v-info">Stop vorhanden (${stopTime}) &mdash; kein Start gefunden</div>
      <div class="v-fix-row">
        <span class="v-fix-label">Start-Zeit</span>
        <input type="datetime-local" class="v-time-input" id="v-start-${idx}"
          value="${escHtml(defStart)}" step="60">
      </div>
      <div class="v-card-ftr">
        <button class="btn btn-sm btn-primary v-fix-orphan-stop" data-issue-idx="${idx}">✓ Speichern</button>
        <button class="btn btn-sm v-skip" data-issue-idx="${idx}">→ Überspringen</button>
        <button class="btn btn-sm btn-danger v-delete-stop" data-issue-idx="${idx}">✗ Stop löschen</button>
      </div>`;
  } else if (issue.issueType === 'double-start') {
    const [e0, e1] = issue.entries;
    const t0 = escHtml(fmtTime(e0.zeitstempel)), t1 = escHtml(fmtTime(e1.zeitstempel));
    body = `<div class="v-info">Zwei Starts: ${t0} und ${t1} &mdash; kein Stop dazwischen</div>
      <div class="v-card-ftr">
        <button class="btn btn-sm btn-danger v-delete-first-start" data-issue-idx="${idx}">✗ ${t0} löschen</button>
        <button class="btn btn-sm btn-danger v-delete-second-start" data-issue-idx="${idx}">✗ ${t1} löschen</button>
        <button class="btn btn-sm v-skip" data-issue-idx="${idx}">→ Überspringen</button>
      </div>`;
  } else if (issue.issueType === 'short-pair') {
    const [sp0, sp1] = issue.entries;
    const durMs = new Date(sp1.zeitstempel) - new Date(sp0.zeitstempel);
    body = `<div class="v-info">Dauer: ${escHtml(fmtMs(durMs))} (${escHtml(fmtTime(sp0.zeitstempel))} &ndash; ${escHtml(fmtTime(sp1.zeitstempel))})</div>
      <div class="v-fix-row-double">
        <div class="v-fix-row">
          <span class="v-fix-label">Von</span>
          <input type="datetime-local" class="v-time-input" id="v-sp-start-${idx}"
            value="${isoToLocalInput(sp0.zeitstempel)}" step="60">
        </div>
        <div class="v-fix-row">
          <span class="v-fix-label">Bis</span>
          <input type="datetime-local" class="v-time-input" id="v-sp-stop-${idx}"
            value="${isoToLocalInput(sp1.zeitstempel)}" step="60">
        </div>
      </div>
      <div class="v-card-ftr">
        <button class="btn btn-sm btn-primary v-fix-short-pair" data-issue-idx="${idx}">✓ Speichern</button>
        <button class="btn btn-sm btn-danger v-delete-pair" data-issue-idx="${idx}">✗ Paar löschen</button>
        <button class="btn btn-sm v-skip" data-issue-idx="${idx}">→ Überspringen</button>
      </div>`;
  }

  return `<div class="v-card" data-issue-idx="${idx}">${hdr}
    <div class="v-card-body">${body}</div></div>`;
}

// ─── Paired-Start finden (für dauer_ms-Neuberechnung) ─────────────────────────
function findPairedStart(stopEntry) {
  const stopTs = new Date(stopEntry.zeitstempel).getTime();
  return logData.log
    .filter(e => !sameEntryId(e.id, stopEntry.id) && e.nutzer === stopEntry.nutzer &&
                 e.typ === stopEntry.typ && e.aktion === 'start' &&
                 new Date(e.zeitstempel).getTime() <= stopTs)
    .sort((a,b) => new Date(b.zeitstempel) - new Date(a.zeitstempel))[0];
}
function findNextPairedStop(startEntry) {
  const startTs = new Date(startEntry.zeitstempel).getTime();
  return logData.log
    .filter(e => !sameEntryId(e.id, startEntry.id) && e.nutzer === startEntry.nutzer &&
                 e.typ === startEntry.typ && e.aktion === 'stop' &&
                 new Date(e.zeitstempel).getTime() >= startTs)
    .sort((a,b) => new Date(a.zeitstempel) - new Date(b.zeitstempel))[0];
}

// ─── Mutationen ───────────────────────────────────────────────────────────────
function commit(fn) {
  fn();
  logData.log.sort((a,b) => new Date(a.zeitstempel) - new Date(b.zeitstempel));
  logData.count = logData.log.length;
  editingId = null;
  markDirty();
  pushHistory();
  renderAll();
}

function addPair(nutzer, typ, vonIso, bisIso) {
  const durMs = new Date(bisIso) - new Date(vonIso);
  commit(() => {
    logData.log.push(
      { id: genId(), nutzer, typ, aktion: 'start', zeitstempel: vonIso },
      { id: genId(), nutzer, typ, aktion: 'stop',  zeitstempel: bisIso, dauer_ms: durMs }
    );
  });
}

function addSingle(nutzer, typ, aktion, zeitstempel) {
  commit(() => {
    const entry = { id: genId(), nutzer, typ, aktion, zeitstempel };
    if (aktion === 'stop') {
      const ts = new Date(zeitstempel).getTime();
      const pairedStart = logData.log
        .filter(e => e.nutzer === nutzer && e.typ === typ && e.aktion === 'start' &&
                     new Date(e.zeitstempel).getTime() <= ts)
        .sort((a, b) => new Date(b.zeitstempel) - new Date(a.zeitstempel))[0];
      if (pairedStart) entry.dauer_ms = ts - new Date(pairedStart.zeitstempel).getTime();
    }
    logData.log.push(entry);
  });
}

function saveEdit(id) {
  const nutzer = document.getElementById('ei-nutzer').value.trim();
  const typ    = document.getElementById('ei-typ').value;
  const aktion = document.getElementById('ei-aktion').value;
  const tsVal  = document.getElementById('ei-ts').value;
  if (!nutzer || !tsVal) return;
  const current = getEntryById(id);
  if (!current) return;
  const zeitstempel = localInputToIso(tsVal);
  const draft = { ...current, nutzer, typ, aktion, zeitstempel };

  if (aktion === 'stop') {
    const paired = findPairedStart(draft);
    const laterStart = logData.log
      .filter(e => !sameEntryId(e.id, draft.id) && e.nutzer === draft.nutzer &&
                   e.typ === draft.typ && e.aktion === 'start' &&
                   new Date(e.zeitstempel).getTime() > new Date(draft.zeitstempel).getTime())
      .sort((a, b) => new Date(a.zeitstempel) - new Date(b.zeitstempel))[0];
    if (!paired && laterStart) {
      showToast('Stop darf nicht vor Start liegen');
      return;
    }
  } else {
    const nextStop = findNextPairedStop(draft);
    const earlierStop = logData.log
      .filter(e => !sameEntryId(e.id, draft.id) && e.nutzer === draft.nutzer &&
                   e.typ === draft.typ && e.aktion === 'stop' &&
                   new Date(e.zeitstempel).getTime() < new Date(draft.zeitstempel).getTime())
      .sort((a, b) => new Date(b.zeitstempel) - new Date(a.zeitstempel))[0];
    if (!nextStop && earlierStop) {
      showToast('Start darf nicht nach Stop liegen');
      return;
    }
  }

  commit(() => {
    const e = getEntryById(id);
    if (!e) return;
    e.nutzer = nutzer; e.typ = typ; e.aktion = aktion; e.zeitstempel = zeitstempel;
    if (aktion === 'stop') {
      const paired = findPairedStart(e);
      if (paired) {
        const dur = new Date(e.zeitstempel) - new Date(paired.zeitstempel);
        e.dauer_ms = dur;
      } else {
        delete e.dauer_ms;
      }
    } else {
      delete e.dauer_ms;
      // Recalc paired stop
      const stop = findNextPairedStop(e);
      if (stop) {
        const dur = new Date(stop.zeitstempel) - new Date(zeitstempel);
        stop.dauer_ms = dur;
      }
    }
  });
}

function deleteEntry(id) {
  commit(() => { logData.log = logData.log.filter(e => !sameEntryId(e.id, id)); });
}

// ─── Export ───────────────────────────────────────────────────────────────────
function exportJSON() {
  const out = { ...logData, exported: new Date().toISOString(), count: logData.log.length };
  const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob),
    download: `lgc_${logData.logicalDay || 'export'}.json`,
  });
  a.click();
  URL.revokeObjectURL(a.href);
}

// ─── Render ───────────────────────────────────────────────────────────────────
function renderAll() {
  if (!logData) return;
  // Meta
  document.getElementById('inp-logical-day').value = logData.logicalDay || '';
  document.getElementById('entry-count').textContent = `${logData.log.length} Einträge`;
  document.getElementById('btn-export').disabled = false;
  // Validation
  const issues = validatePairs(logData.log);
  const badge = document.getElementById('v-badge');
  badge.style.display = '';
  if (issues.size === 0) {
    badge.textContent = '✓ Alle Paare vollständig';
    badge.className = 'v-badge ok';
  } else {
    badge.textContent = `⚠ ${issues.size} offene Einträge`;
    badge.className = 'v-badge warn';
  }
  // Panels
  document.getElementById('panel-empty').hidden    = true;
  document.getElementById('panel-table').hidden    = activeTab !== 'table';
  document.getElementById('panel-timeline').hidden = activeTab !== 'timeline';
  // Person filter
  renderPersonFilter();
  // Datalist
  updateDatalist();
  // Content
  if (activeTab === 'table')    renderTable(issues);
  else                          renderTimeline();
}

function renderPersonFilter() {
  const persons = [...new Set(logData.log.map(e => e.nutzer))].filter(Boolean).sort();
  document.getElementById('person-filter').innerHTML =
    `<button class="filter-btn${filterPerson === null ? ' active' : ''}" data-p="">Alle</button>` +
    persons.map(p =>
      `<button class="filter-btn${filterPerson === p ? ' active' : ''}"
        data-p="${escHtml(p)}">${escHtml(p)}</button>`
    ).join('');
}

function visibleLog() {
  return filterPerson ? logData.log.filter(e => e.nutzer === filterPerson) : logData.log;
}

function renderTable(issues) {
  const log = visibleLog();
  let html = '';
  for (const e of log) {
    const hasIssue = issues.has(e.id);
    const isEditing = sameEntryId(editingId, e.id);
    const ti = _TYPE_MAP[e.typ] || { logType: e.typ, label: e.typ, main: '#888', dim: 'rgba(128,128,128,.15)' };
    const safeId = escHtml(String(e.id));
    // Für Edit-Dropdown: alle bekannten Typen + ggf. den aktuellen, falls unbekannt
    const editOpts = [
      ...(_TYPE_MAP[e.typ] ? [] : [ti]),
      ..._TYPES,
    ].map(t => `<option value="${escHtml(t.logType)}"${e.typ===t.logType?' selected':''}>${escHtml(t.label)}</option>`).join('');

    if (isEditing) {
      html += `<tr class="edit-row" data-id="${safeId}">
        <td><span class="${hasIssue ? 'pair-warn' : 'pair-ok'}">${hasIssue ? '⚠' : '✓'}</span></td>
        <td><input class="edit-input" id="ei-nutzer" list="known-persons-list" value="${escHtml(e.nutzer)}" style="min-width:140px"></td>
        <td><select class="edit-input" id="ei-typ" style="min-width:150px">${editOpts}</select></td>
        <td><select class="edit-input" id="ei-aktion">
          <option value="start"${e.aktion==='start'?' selected':''}>start</option>
          <option value="stop"${e.aktion==='stop'?' selected':''}>stop</option>
        </select></td>
        <td><input type="datetime-local" class="edit-input" id="ei-ts" value="${isoToLocalInput(e.zeitstempel)}" step="60" style="min-width:170px"></td>
        <td class="dur-cell">${e.aktion==='stop' ? fmtMs(e.dauer_ms) : '—'}</td>
        <td class="act-cell">
          <button class="btn btn-sm btn-primary btn-save" data-id="${safeId}">✓</button>
          <button class="btn btn-sm btn-cancel">✕</button>
        </td>
      </tr>`;
    } else {
      html += `<tr class="${hasIssue ? 'row-warn' : ''}" data-id="${safeId}">
        <td><span class="${hasIssue ? 'pair-warn' : 'pair-ok'}" title="${hasIssue ? 'Kein passendes Gegenstück' : 'Paar vollständig'}">${hasIssue ? '⚠' : '✓'}</span></td>
        <td>${e.nutzer ? escHtml(e.nutzer) : '<em style="color:var(--text-3)">—</em>'}</td>
        <td><span class="badge-typ" style="background:${ti.dim};color:${ti.main}">${escHtml(ti.label)}</span></td>
        <td><span class="badge-aktion ${e.aktion}">${e.aktion}</span></td>
        <td class="ts-cell">${fmtDatetime(e.zeitstempel)}</td>
        <td class="dur-cell">${e.aktion==='stop' ? fmtMs(e.dauer_ms) : '—'}</td>
        <td class="act-cell">
          <button class="btn btn-sm btn-edit" data-id="${safeId}" title="Bearbeiten">✏</button>
          <button class="btn btn-sm btn-del" data-id="${safeId}" title="Löschen">&#x1F5D1;</button>
        </td>
      </tr>`;
    }
  }
  if (html === '') {
    html = `<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-3)">Keine Einträge</td></tr>`;
  }
  document.getElementById('log-tbody').innerHTML = html;
}

function renderTimeline() {
  const log = visibleLog();
  const el = document.getElementById('timeline-view');
  if (log.length === 0) { el.innerHTML = '<div class="tl-empty">Keine Einträge</div>'; return; }

  const allTs = log.map(e => new Date(e.zeitstempel).getTime()).filter(t => !isNaN(t));
  const tMin = Math.min(...allTs);
  const tMax = Math.max(...allTs);
  const tRange = tMax - tMin || 3600000;

  const persons = [...new Set(log.map(e => e.nutzer))].sort();

  // Axis
  let axisHtml = '<div class="tl-axis">';
  for (let i = 0; i <= 4; i++) {
    const ts = tMin + tRange * i / 4;
    axisHtml += `<span class="tl-tick" style="left:${(i/4*100).toFixed(1)}%">${fmtTime(new Date(ts).toISOString())}</span>`;
  }
  axisHtml += '</div>';

  // Legend (nur verwendete Typen, in Config-Reihenfolge)
  const usedLogTypes = new Set(log.map(e => e.typ));
  const legendHtml = '<div class="tl-legend">' +
    _TYPES.filter(ti => usedLogTypes.has(ti.logType)).map(ti =>
      `<div class="tl-legend-item"><div class="tl-legend-dot" style="background:${ti.main}"></div>${escHtml(ti.label)}</div>`
    ).join('') +
    '</div>';

  // Alle im Log vorkommenden Typen in Config-Reihenfolge (dann Rest)
  const orderedTypes = [
    ..._TYPES.filter(ti => usedLogTypes.has(ti.logType)),
    ...[...usedLogTypes].filter(lt => !_TYPE_MAP[lt]).map(lt => ({
      logType: lt, label: lt, main: '#888', dim: 'rgba(128,128,128,.15)',
    })),
  ];

  let rowsHtml = '';
  for (const person of persons) {
    const pLog = log.filter(e => e.nutzer === person);
    for (const ti of orderedTypes) {
      const typ = ti.logType;
      const tLog = pLog.filter(e => e.typ === typ).sort((a,b) => new Date(a.zeitstempel) - new Date(b.zeitstempel));
      if (tLog.length === 0) continue;

      let segs = '';
      let openStart = null;
      for (const e of tLog) {
        if (e.aktion === 'start') {
          openStart = e;
        } else if (e.aktion === 'stop' && openStart) {
          const s = new Date(openStart.zeitstempel).getTime();
          const en = new Date(e.zeitstempel).getTime();
          const left = ((s - tMin) / tRange * 100).toFixed(2);
          const width = ((en - s) / tRange * 100).toFixed(2);
          segs += `<div class="tl-seg" style="left:${left}%;width:${width}%;background:${ti.main}"
            title="${escHtml(person)} · ${escHtml(ti.label)} · ${fmtTime(openStart.zeitstempel)}–${fmtTime(e.zeitstempel)} (${fmtMs(e.dauer_ms)})"></div>`;
          openStart = null;
        }
      }
      if (openStart) {
        const s = new Date(openStart.zeitstempel).getTime();
        const left = ((s - tMin) / tRange * 100).toFixed(2);
        const width = ((tMax - s) / tRange * 100).toFixed(2);
        segs += `<div class="tl-seg tl-seg-open" style="left:${left}%;width:${width}%;background:${ti.main}" title="Offen – kein Stop"></div>`;
      }

      rowsHtml += `<div class="tl-row">
        <div class="tl-label">
          <div class="tl-person" title="${escHtml(person)}">${escHtml(person)}</div>
          <div class="tl-ltype" style="color:${ti.main}">${escHtml(ti.label)}</div>
        </div>
        <div class="tl-track">${segs}</div>
      </div>`;
    }
  }

  el.innerHTML = `<div class="tl-header">
      <span class="tl-date">${escHtml(logData.logicalDay || '')}</span>
      <span class="tl-range">${fmtTime(new Date(tMin).toISOString())} – ${fmtTime(new Date(tMax).toISOString())}</span>
    </div>
    ${legendHtml}
    ${axisHtml}
    ${rowsHtml}`;
}

// ─── Add modal ────────────────────────────────────────────────────────────────
function switchAddMode(mode) {
  addMode = mode;
  document.getElementById('add-modal-title').textContent =
    mode === 'pair' ? 'Neues Eintragspaar' : 'Neuer Einzeleintrag';
  document.getElementById('add-mode-pair').classList.toggle('active', mode === 'pair');
  document.getElementById('add-mode-single').classList.toggle('active', mode === 'single');
  document.getElementById('add-pair-section').style.display   = mode === 'pair'   ? '' : 'none';
  document.getElementById('add-single-section').style.display = mode === 'single' ? '' : 'none';
}

function openAddModal() {
  const day = logData.logicalDay || new Date().toISOString().slice(0,10);
  document.getElementById('add-nutzer').value  = filterPerson || '';
  document.getElementById('add-typ').value     = _TYPES[0]?.logType || '';
  document.getElementById('add-von').value     = `${day}T08:00`;
  document.getElementById('add-bis').value     = `${day}T12:00`;
  document.getElementById('add-ts').value      = isoToLocalInput(new Date().toISOString());
  document.getElementById('add-aktion').value  = 'stop';
  switchAddMode('pair');
  updateDurPreview();
  document.getElementById('modal-add').showModal();
}
function updateDurPreview() {
  const von = document.getElementById('add-von').value;
  const bis = document.getElementById('add-bis').value;
  if (!von || !bis) { document.getElementById('dur-preview').textContent = 'Dauer: —'; return; }
  const ms = new Date(bis) - new Date(von);
  document.getElementById('dur-preview').textContent =
    ms > 0 ? `Dauer: ${fmtMs(ms)}` : 'Bis muss nach Von liegen';
}

// ─── Init ─────────────────────────────────────────────────────────────────────
buildTypeMaps();
populateTypSelect();

// ─── Event listeners ──────────────────────────────────────────────────────────
document.getElementById('btn-load').addEventListener('click', () =>
  document.getElementById('file-input').click());
document.getElementById('file-input').addEventListener('change', e => {
  if (e.target.files[0]) loadFile(e.target.files[0]);
  e.target.value = '';
});
document.getElementById('btn-new').addEventListener('click', newFile);
document.getElementById('btn-export').addEventListener('click', exportJSON);
document.getElementById('btn-undo').addEventListener('click', undo);
document.getElementById('btn-redo').addEventListener('click', redo);

document.getElementById('btn-cloud-load').addEventListener('click', openCloudPicker);
document.getElementById('btn-cloud-save').addEventListener('click', saveToCloud);
document.getElementById('btn-validate-all').addEventListener('click', fetchAndValidate);
document.getElementById('cloud-cancel').addEventListener('click', () =>
  document.getElementById('modal-cloud').close());
document.getElementById('cloud-confirm').addEventListener('click', () => {
  const href = document.getElementById('cloud-file-select').value;
  document.getElementById('modal-cloud').close();
  if (href) loadFromCloud(href);
});

document.getElementById('inp-logical-day').addEventListener('change', e => {
  if (!logData || logData.logicalDay === e.target.value) return;
  logData.logicalDay = e.target.value;
  markDirty();
  pushHistory();
  renderAll();
});

// Tabs
document.querySelectorAll('.tab-btn').forEach(btn => btn.addEventListener('click', () => {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  activeTab = btn.dataset.tab;
  document.getElementById('panel-table').hidden      = activeTab !== 'table';
  document.getElementById('panel-timeline').hidden   = activeTab !== 'timeline';
  document.getElementById('panel-validation').hidden = activeTab !== 'validation';
  document.getElementById('panel-empty').hidden      = logData !== null || activeTab === 'validation';
  if (activeTab === 'validation') renderValidationPanel();
  else if (logData) renderAll();
}));

// Person filter (event delegation)
document.getElementById('person-filter').addEventListener('click', e => {
  const btn = e.target.closest('.filter-btn');
  if (!btn) return;
  filterPerson = btn.dataset.p || null;
  renderAll();
});

// Table delegation
document.getElementById('log-tbody').addEventListener('click', e => {
  const editBtn  = e.target.closest('.btn-edit');
  const saveBtn  = e.target.closest('.btn-save');
  const cancelBtn= e.target.closest('.btn-cancel');
  const delBtn   = e.target.closest('.btn-del');
  if (editBtn)  { editingId = editBtn.dataset.id; renderTable(validatePairs(logData.log)); }
  if (saveBtn)  { saveEdit(saveBtn.dataset.id); }
  if (cancelBtn){ editingId = null; renderTable(validatePairs(logData.log)); }
  if (delBtn) {
    if (confirm('Eintrag löschen?')) deleteEntry(delBtn.dataset.id);
  }
});

// Clear all
document.getElementById('btn-clear-all').addEventListener('click', () => {
  if (!logData) return;
  const count = logData.log.length;
  if (!count) { alert('Keine Einträge vorhanden.'); return; }
  document.getElementById('clear-count').textContent =
    count + (count === 1 ? ' Eintrag' : ' Einträge');
  document.getElementById('modal-clear').showModal();
});
document.getElementById('clear-cancel').addEventListener('click', () =>
  document.getElementById('modal-clear').close());
document.getElementById('clear-confirm').addEventListener('click', () => {
  document.getElementById('modal-clear').close();
  commit(() => { logData.log = []; });
});

// Add modal
document.getElementById('btn-add-pair').addEventListener('click', openAddModal);
document.getElementById('add-mode-pair').addEventListener('click', () => switchAddMode('pair'));
document.getElementById('add-mode-single').addEventListener('click', () => switchAddMode('single'));
document.getElementById('add-von').addEventListener('input', updateDurPreview);
document.getElementById('add-bis').addEventListener('input', updateDurPreview);
document.getElementById('add-cancel').addEventListener('click', () =>
  document.getElementById('modal-add').close());
document.getElementById('add-confirm').addEventListener('click', () => {
  const nutzer = document.getElementById('add-nutzer').value.trim();
  const typ    = document.getElementById('add-typ').value;
  if (!nutzer) { alert('Bitte Person eingeben.'); return; }
  if (addMode === 'single') {
    const aktion = document.getElementById('add-aktion').value;
    const ts     = document.getElementById('add-ts').value;
    if (!ts) { alert('Bitte Zeitpunkt ausfüllen.'); return; }
    document.getElementById('modal-add').close();
    addSingle(nutzer, typ, aktion, localInputToIso(ts));
  } else {
    const von = document.getElementById('add-von').value;
    const bis = document.getElementById('add-bis').value;
    if (!von || !bis) { alert('Bitte Von und Bis ausfüllen.'); return; }
    const ms = new Date(bis) - new Date(von);
    if (ms <= 0) { alert('Bis muss nach Von liegen.'); return; }
    document.getElementById('modal-add').close();
    addPair(nutzer, typ, localInputToIso(von), localInputToIso(bis));
  }
});

// Keyboard shortcuts
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
  if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
  if (e.key === 'Escape') {
    document.getElementById('modal-add').close();
    if (editingId !== null) { editingId = null; if (logData) renderTable(validatePairs(logData.log)); }
  }
});

// Drag & drop
document.addEventListener('dragover', e => {
  e.preventDefault();
  document.getElementById('main-area').classList.add('drop-active');
});
document.addEventListener('dragleave', e => {
  if (!e.relatedTarget || e.relatedTarget === document.documentElement)
    document.getElementById('main-area').classList.remove('drop-active');
});
document.addEventListener('drop', e => {
  e.preventDefault();
  document.getElementById('main-area').classList.remove('drop-active');
  const file = e.dataTransfer.files[0];
  if (file?.name.endsWith('.json')) loadFile(file);
  else if (file) alert('Bitte eine .json Datei ablegen.');
});
