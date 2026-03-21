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
    const n = { id: e.id || crypto.randomUUID(), nutzer: e.nutzer, typ: e.typ, aktion: e.aktion, zeitstempel: e.zeitstempel };
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
  if (cloudFileUrl) { cloudDirty = true; syncCloudSaveBtn(); }
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

// ─── Paired-Start finden (für dauer_ms-Neuberechnung) ─────────────────────────
function findPairedStart(stopEntry) {
  const stopTs = new Date(stopEntry.zeitstempel).getTime();
  return logData.log
    .filter(e => e.id !== stopEntry.id && e.nutzer === stopEntry.nutzer &&
                 e.typ === stopEntry.typ && e.aktion === 'start' &&
                 new Date(e.zeitstempel).getTime() <= stopTs)
    .sort((a,b) => new Date(b.zeitstempel) - new Date(a.zeitstempel))[0];
}

// ─── Mutationen ───────────────────────────────────────────────────────────────
function commit(fn) {
  fn();
  logData.log.sort((a,b) => new Date(a.zeitstempel) - new Date(b.zeitstempel));
  logData.count = logData.log.length;
  editingId = null;
  if (cloudFileUrl) { cloudDirty = true; syncCloudSaveBtn(); }
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

function saveEdit(id) {
  const nutzer = document.getElementById('ei-nutzer').value.trim();
  const typ    = document.getElementById('ei-typ').value;
  const aktion = document.getElementById('ei-aktion').value;
  const tsVal  = document.getElementById('ei-ts').value;
  if (!nutzer || !tsVal) return;
  const zeitstempel = localInputToIso(tsVal);
  commit(() => {
    const e = logData.log.find(x => x.id === id);
    if (!e) return;
    e.nutzer = nutzer; e.typ = typ; e.aktion = aktion; e.zeitstempel = zeitstempel;
    if (aktion === 'stop') {
      const paired = findPairedStart(e);
      if (paired) {
        const dur = new Date(e.zeitstempel) - new Date(paired.zeitstempel);
        if (dur < 0) { showToast('Stop darf nicht vor Start liegen'); return; }
        e.dauer_ms = dur;
      }
    } else {
      delete e.dauer_ms;
      // Recalc paired stop
      const stop = logData.log.find(s =>
        s.nutzer === nutzer && s.typ === typ && s.aktion === 'stop' &&
        new Date(s.zeitstempel) >= new Date(zeitstempel));
      if (stop) {
        const dur = new Date(stop.zeitstempel) - new Date(zeitstempel);
        if (dur < 0) { showToast('Stop darf nicht vor Start liegen'); return; }
        stop.dauer_ms = dur;
      }
    }
  });
}

function deleteEntry(id) {
  commit(() => { logData.log = logData.log.filter(e => e.id !== id); });
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
    const isEditing = editingId === e.id;
    const ti = _TYPE_MAP[e.typ] || { logType: e.typ, label: e.typ, main: '#888', dim: 'rgba(128,128,128,.15)' };
    // Für Edit-Dropdown: alle bekannten Typen + ggf. den aktuellen, falls unbekannt
    const editOpts = [
      ...(_TYPE_MAP[e.typ] ? [] : [ti]),
      ..._TYPES,
    ].map(t => `<option value="${escHtml(t.logType)}"${e.typ===t.logType?' selected':''}>${escHtml(t.label)}</option>`).join('');

    if (isEditing) {
      html += `<tr class="edit-row" data-id="${e.id}">
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
          <button class="btn btn-sm btn-primary btn-save" data-id="${e.id}">✓</button>
          <button class="btn btn-sm btn-cancel">✕</button>
        </td>
      </tr>`;
    } else {
      html += `<tr class="${hasIssue ? 'row-warn' : ''}" data-id="${e.id}">
        <td><span class="${hasIssue ? 'pair-warn' : 'pair-ok'}" title="${hasIssue ? 'Kein passendes Gegenstück' : 'Paar vollständig'}">${hasIssue ? '⚠' : '✓'}</span></td>
        <td>${e.nutzer ? escHtml(e.nutzer) : '<em style="color:var(--text-3)">—</em>'}</td>
        <td><span class="badge-typ" style="background:${ti.dim};color:${ti.main}">${escHtml(ti.label)}</span></td>
        <td><span class="badge-aktion ${e.aktion}">${e.aktion}</span></td>
        <td class="ts-cell">${fmtDatetime(e.zeitstempel)}</td>
        <td class="dur-cell">${e.aktion==='stop' ? fmtMs(e.dauer_ms) : '—'}</td>
        <td class="act-cell">
          <button class="btn btn-sm btn-edit" data-id="${e.id}" title="Bearbeiten">✏</button>
          <button class="btn btn-sm btn-del" data-id="${e.id}" title="Löschen">&#x1F5D1;</button>
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

// ─── Add pair modal ───────────────────────────────────────────────────────────
function openAddModal() {
  const day = logData.logicalDay || new Date().toISOString().slice(0,10);
  document.getElementById('add-nutzer').value = filterPerson || '';
  document.getElementById('add-typ').value    = _TYPES[0]?.logType || '';
  document.getElementById('add-von').value    = `${day}T08:00`;
  document.getElementById('add-bis').value    = `${day}T12:00`;
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
document.getElementById('cloud-cancel').addEventListener('click', () =>
  document.getElementById('modal-cloud').close());
document.getElementById('cloud-confirm').addEventListener('click', () => {
  const href = document.getElementById('cloud-file-select').value;
  document.getElementById('modal-cloud').close();
  if (href) loadFromCloud(href);
});

document.getElementById('inp-logical-day').addEventListener('change', e => {
  if (logData) { logData.logicalDay = e.target.value; pushHistory(); }
});

// Tabs
document.querySelectorAll('.tab-btn').forEach(btn => btn.addEventListener('click', () => {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  activeTab = btn.dataset.tab;
  if (logData) renderAll();
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
  if (editBtn)  { editingId = Number(editBtn.dataset.id); renderTable(validatePairs(logData.log)); }
  if (saveBtn)  { saveEdit(Number(saveBtn.dataset.id)); }
  if (cancelBtn){ editingId = null; renderTable(validatePairs(logData.log)); }
  if (delBtn) {
    if (confirm('Eintrag löschen?')) deleteEntry(Number(delBtn.dataset.id));
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

// Add pair
document.getElementById('btn-add-pair').addEventListener('click', openAddModal);
document.getElementById('add-von').addEventListener('input', updateDurPreview);
document.getElementById('add-bis').addEventListener('input', updateDurPreview);
document.getElementById('add-cancel').addEventListener('click', () =>
  document.getElementById('modal-add').close());
document.getElementById('add-confirm').addEventListener('click', () => {
  const nutzer = document.getElementById('add-nutzer').value.trim();
  const typ    = document.getElementById('add-typ').value;
  const von    = document.getElementById('add-von').value;
  const bis    = document.getElementById('add-bis').value;
  if (!nutzer) { alert('Bitte Person eingeben.'); return; }
  if (!von || !bis) { alert('Bitte Von und Bis ausfüllen.'); return; }
  const ms = new Date(bis) - new Date(von);
  if (ms <= 0) { alert('Bis muss nach Von liegen.'); return; }
  document.getElementById('modal-add').close();
  addPair(nutzer, typ, localInputToIso(von), localInputToIso(bis));
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
