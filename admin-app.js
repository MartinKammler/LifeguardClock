/* admin-app.js – aus admin.html extrahiert (CSP-Migration) */
if (typeof CONFIG === 'undefined') window.CONFIG = undefined;
if (typeof ADMIN_CONFIG === 'undefined') window.ADMIN_CONFIG = undefined;

(function () {
  'use strict';

  /* ── State ─────────────────────────────────────────── */
  let users = [];          // array of user objects (live)
  let removedIds = [];     // Tombstone-Liste gelöschter Nutzer-IDs (wird in Cloud gespeichert)
  let usersVersion = 1;
  let _globalTypes = [];   // Globale Typen aus lgc_types.json (live)
  let _events      = [];   // Events aus lgc_events.json (live)
  let _eventEditIdx = null; // Index des gerade bearbeiteten Events (null = neu)
  let _editTypes = [];     // Typen der geladenen Gerätekonfig (per-device overrides)
  let usersExported = null;
  let saveTimer = null;
  let _cfgFull = null;     // vollständiges config-Objekt (für unveränderte Felder)

  /* ── Bekannte Geräte (localStorage) ────────────────── */
  const DEVICES_LS_KEY = 'lgc_admin_devices';
  function getKnownDevices() {
    try { return JSON.parse(localStorage.getItem(DEVICES_LS_KEY) || '[]'); } catch { return []; }
  }
  function addKnownDevice(id) {
    const list = getKnownDevices().filter(d => d !== id);
    list.unshift(id);
    localStorage.setItem(DEVICES_LS_KEY, JSON.stringify(list.slice(0, 20)));
    renderDeviceList();
  }
  function renderDeviceList() {
    // Bekannte Geräte nur noch als Autocomplete-Fallback – kein select
    const input = document.getElementById('cfg-device-id');
    if (!input.value) {
      const last = getKnownDevices()[0];
      if (last) input.value = last;
    }
  }

  async function discoverDevices() {
    const creds = getCredentials();
    if (!creds) { toast('Keine Zugangsdaten gespeichert.', 'err'); return; }
    const btn = document.getElementById('btn-cfg-discover');
    btn.disabled = true; btn.textContent = '…';
    try {
      const base = buildWebDavBase(creds);
      // Ordner anlegen falls noch nicht vorhanden (idempotent)
      await fetch(base, { method: 'MKCOL', headers: { Authorization: authHeader(creds) } }).catch(() => {});
      const res = await fetch(base, {
        method: 'PROPFIND',
        headers: { Authorization: authHeader(creds), Depth: '1' },
      });
      if (res.status === 404) {
        toast('Noch keine Geräte-Daten in der Cloud gefunden.', 'info');
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const xml = await res.text();
      const ids = [...xml.matchAll(/<[^>]*:href[^>]*>([^<]+)<\/[^>]*:href>/g)]
        .map(m => decodeURIComponent(m[1].trim()))
        .map(h => (h.match(/lgc_config_([^/]+)\.json$/) || [])[1])
        .filter(Boolean);
      if (ids.length === 0) {
        toast('Keine Gerätekonfigurationen in der Cloud gefunden.', 'info');
      } else {
        const sel = document.getElementById('cfg-device-select');
        const input = document.getElementById('cfg-device-id');
        sel.innerHTML = ids.map(id => `<option value="${escHtml(id)}">${escHtml(id)}</option>`).join('');
        sel.style.display = '';
        input.style.display = 'none';
        sel.value = ids[0];
        // Auswahl synchronisiert das versteckte Textfeld
        sel.onchange = () => { input.value = sel.value; };
        input.value = ids[0];
        toast(`${ids.length} Gerät${ids.length !== 1 ? 'e' : ''} gefunden.`, 'ok');
      }
    } catch(e) {
      toast('Suche fehlgeschlagen: ' + e.message, 'err');
    } finally {
      btn.disabled = false; btn.textContent = '🔍 Suchen';
    }
  }

  /* ── Permissions from global types ─────────────────── */
  function getPermDefs() {
    const src = _globalTypes.length > 0 ? _globalTypes
              : (window.CONFIG?.types || []);
    return src
      .filter(t => t.permissionKey)
      .map(t => ({ key: t.permissionKey, label: t.label }));
  }

  /* ── Cloud helpers ─────────────────────────────────── */
  const ADMIN_LS_KEY = 'lgc_cloud';

  function getCredentials() {
    // Reihenfolge: localStorage → admin_config.js (bootstrappt lgc_cloud einmalig)
    const stored = localStorage.getItem(ADMIN_LS_KEY);
    if (stored) {
      try { return JSON.parse(stored); } catch (e) {}
    }
    if (window.ADMIN_CONFIG && window.ADMIN_CONFIG.cloud) {
      const c = window.ADMIN_CONFIG.cloud;
      if (c.user && c.pass) {
        const creds = { url: c.url || '', user: c.user, pass: c.pass };
        localStorage.setItem(ADMIN_LS_KEY, JSON.stringify(creds));
        return creds;
      }
    }
    return null;
  }

  // Läuft der Admin über den Python-Proxy (localhost)?
  // Dann relative URLs – kein CORS, der Proxy leitet weiter.
  const IS_PROXY = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  const VALID_COLORS = new Set(['blue','green','amber','red','violet','grey','orange','cyan','pink','lime']);
  function safeColor(c) { return VALID_COLORS.has(c) ? c : 'blue'; }

  // Minimale Schema-Validatoren für Cloud-Daten
  function _validUser(u) {
    return u !== null && typeof u === 'object' &&
      typeof u.id === 'string' && u.id.length > 0 &&
      typeof u.name === 'string' && u.name.length > 0;
  }
  function _validType(t) {
    return t !== null && typeof t === 'object' &&
      typeof t.key === 'string' && t.key.length > 0 &&
      typeof t.logType === 'string' && t.logType.length > 0;
  }
  function _validEvent(e) {
    return e !== null && typeof e === 'object' &&
      typeof e.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.date);
  }

  function buildWebDavBase(creds) {
    if (IS_PROXY) {
      return `/remote.php/dav/files/${encodeURIComponent(creds.user)}/LifeguardClock`;
    }
    const base = creds.url
      .replace(/\/remote\.php\/dav.*/i, '')
      .replace(/\/index\.php.*/i, '');
    return `${base}/remote.php/dav/files/${encodeURIComponent(creds.user)}/LifeguardClock`;
  }

  function authHeader(creds) {
    return 'Basic ' + btoa(unescape(encodeURIComponent(`${creds.user}:${creds.pass}`)));
  }

  /* ── Status badge ──────────────────────────────────── */
  const statusBadge = document.getElementById('status-badge');
  function setStatus(state, text) {
    statusBadge.className = 'status-badge ' + state;
    statusBadge.textContent = text;
  }

  /* ── Toast ─────────────────────────────────────────── */
  const toastContainer = document.getElementById('toast-container');
  function toast(msg, type = 'info') {
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.textContent = msg;
    toastContainer.appendChild(el);
    setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 2800);
  }

  /* ── Load from cloud ───────────────────────────────── */
  function expandCloudCard() {
    cloudCardBody.classList.remove('hidden');
    cloudToggleIcon.classList.add('open');
  }

  async function loadUsers(silent = false) {
    const creds = getCredentials();
    if (!creds) {
      setStatus('gray', 'Nicht konfiguriert');
      expandCloudCard();
      if (!silent) toast('Keine Zugangsdaten gespeichert.', 'err');
      return;
    }
    setStatus('gray', 'Verbinde…');
    try {
      const url = buildWebDavBase(creds) + '/lgc_users.json';
      const res = await fetch(url, {
        method: 'GET',
        headers: { 'Authorization': authHeader(creds) }
      });
      if (res.status === 404) {
        setStatus('green', 'Verbunden (neu)');
        users = [];
        removedIds = []; // neuer Endpunkt – keine alten Tombstones übertragen
        renderTable();
        if (!silent) toast('Datei noch nicht vorhanden – wird beim ersten Speichern erstellt.', 'info');
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      usersVersion = data.version || 1;
      usersExported = data.exported || null;
      const rawUsers = Array.isArray(data.users) ? data.users : [];
      users = rawUsers.filter(_validUser);
      if (users.length !== rawUsers.length) {
        console.warn(`[lgc-admin] loadUsers: ${rawUsers.length - users.length} ungültige Einträge verworfen`);
      }
      removedIds = Array.isArray(data.removedIds) ? data.removedIds : [];
      setStatus('green', 'Verbunden');
      renderTable();
      if (!silent) toast(`${users.length} Nutzer geladen.`, 'ok');
    } catch (err) {
      setStatus('red', 'Fehler');
      expandCloudCard();
      if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
        document.getElementById('cors-banner').style.display = '';
        toast('Netzwerkfehler – Seite über lokalen Webserver öffnen (siehe Hinweis oben)', 'err');
      } else {
        toast('Verbindungsfehler: ' + err.message, 'err');
      }
    }
  }

  /* ── Save to cloud (debounced) ─────────────────────── */
  function saveToCloud() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(_doSave, 500);
  }

  async function _doSave() {
    const creds = getCredentials();
    if (!creds) { toast('Keine Zugangsdaten – Speichern nicht möglich.', 'err'); return; }
    setStatus('gray', 'Speichert…');
    try {
      // Ensure directory exists
      const dirUrl = buildWebDavBase(creds);
      await fetch(dirUrl, {
        method: 'MKCOL',
        headers: { 'Authorization': authHeader(creds) }
      }).catch(() => {}); // ignore if already exists

      const payload = {
        version: usersVersion,
        exported: new Date().toISOString(),
        count: users.length,
        users: users,
        removedIds: removedIds,
      };
      const url = dirUrl + '/lgc_users.json';
      const res = await fetch(url, {
        method: 'PUT',
        headers: {
          'Authorization': authHeader(creds),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload, null, 2)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatus('green', 'Gespeichert');
      updateOtpCount();
    } catch (err) {
      setStatus('red', 'Speicherfehler');
      toast('Fehler beim Speichern: ' + err.message, 'err');
    }
  }

  /* ── OTP helpers ───────────────────────────────────── */
  function genOtp() {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  function genId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return 'u' + crypto.randomUUID();
    return 'u' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  }

  function otpUsers() {
    return users.filter(u => u.mustChangePIN === true && !u.salt);
  }

  function updateOtpCount() {
    const n = otpUsers().length;
    document.getElementById('otp-count').textContent = n;
    document.getElementById('btn-print-pins').style.display = n > 0 ? '' : 'none';
  }

  /* ── Render table ──────────────────────────────────── */
  function renderTable() {
    const tbody = document.getElementById('user-tbody');
    tbody.innerHTML = '';
    updateOtpCount();

    if (users.length === 0) {
      const tr = document.createElement('tr');
      tr.className = 'empty-row';
      tr.innerHTML = '<td colspan="5">Keine Nutzer vorhanden. Mit &bdquo;+ Nutzer hinzuf&uuml;gen&ldquo; starten.</td>';
      tbody.appendChild(tr);
      return;
    }

    const permDefs = getPermDefs();

    users.forEach((user, idx) => {
      const tr = document.createElement('tr');

      // # column
      const tdNum = document.createElement('td');
      tdNum.className = 'col-num';
      tdNum.textContent = idx + 1;
      tr.appendChild(tdNum);

      // Name column
      const tdName = document.createElement('td');
      tdName.className = 'col-name';
      const nameSpan = document.createElement('span');
      nameSpan.className = 'name-display';
      nameSpan.title = 'Klicken zum Bearbeiten';
      nameSpan.textContent = user.name || '(kein Name)';
      nameSpan.addEventListener('click', () => startNameEdit(user.id, tdName, nameSpan));
      tdName.appendChild(nameSpan);
      tr.appendChild(tdName);

      // PIN column
      const tdPin = document.createElement('td');
      tdPin.className = 'col-pin';
      if (user.mustChangePIN && !user.salt) {
        // OTP — show plaintext
        const pinText = document.createTextNode(user.pin + '\u00a0');
        tdPin.appendChild(pinText);
        const badge = document.createElement('span');
        badge.className = 'otp-badge';
        badge.textContent = '⚠ Einmal-PIN';
        tdPin.appendChild(badge);
      } else {
        const mask = document.createElement('span');
        mask.className = 'pin-mask';
        mask.textContent = '••••••';
        tdPin.appendChild(mask);
      }
      tr.appendChild(tdPin);

      // Permissions column
      const tdPerms = document.createElement('td');
      tdPerms.className = 'col-perms';
      if (permDefs.length === 0) {
        tdPerms.style.color = 'var(--text-2)';
        tdPerms.style.fontSize = '0.78rem';
        tdPerms.textContent = 'Keine CONFIG-Typen';
      } else {
        const checksDiv = document.createElement('div');
        checksDiv.className = 'perm-checks';
        permDefs.forEach(pd => {
          const lbl = document.createElement('label');
          lbl.className = 'perm-check';
          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.checked = Array.isArray(user.permissions) && user.permissions.includes(pd.key);
          cb.addEventListener('change', () => {
            togglePermission(user.id, pd.key, cb.checked);
          });
          lbl.appendChild(cb);
          lbl.appendChild(document.createTextNode(pd.label));
          checksDiv.appendChild(lbl);
        });
        tdPerms.appendChild(checksDiv);
      }
      tr.appendChild(tdPerms);

      // Actions column
      const tdActs = document.createElement('td');
      tdActs.className = 'col-acts';
      const actsDiv = document.createElement('div');
      actsDiv.className = 'acts-row';

      const btnPin = document.createElement('button');
      btnPin.className = 'btn btn-amber btn-sm';
      btnPin.textContent = 'PIN zurücksetzen';
      btnPin.addEventListener('click', () => resetPin(user.id));
      actsDiv.appendChild(btnPin);

      const btnDel = document.createElement('button');
      btnDel.className = 'btn btn-danger btn-sm';
      btnDel.textContent = 'Löschen';
      btnDel.addEventListener('click', () => deleteUser(user.id));
      actsDiv.appendChild(btnDel);

      tdActs.appendChild(actsDiv);
      tr.appendChild(tdActs);

      tbody.appendChild(tr);
    });
  }

  /* ── Name inline edit ──────────────────────────────── */
  function startNameEdit(userId, td, span) {
    const user = users.find(u => u.id === userId);
    if (!user) return;

    const inp = document.createElement('input');
    inp.type = 'text';
    inp.className = 'name-input';
    inp.value = user.name || '';
    td.replaceChild(inp, span);
    inp.focus();
    inp.select();

    function commit() {
      const newName = inp.value.trim();
      if (newName && newName !== user.name) {
        user.name = newName;
        saveToCloud();
        toast('Name gespeichert.', 'ok');
      }
      renderTable();
    }

    inp.addEventListener('blur', commit);
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); inp.blur(); }
      if (e.key === 'Escape') { inp.value = user.name || ''; inp.blur(); }
    });
  }

  /* ── Permission toggle ─────────────────────────────── */
  function togglePermission(userId, permKey, enabled) {
    const user = users.find(u => u.id === userId);
    if (!user) return;
    if (!Array.isArray(user.permissions)) user.permissions = [];
    if (enabled) {
      if (!user.permissions.includes(permKey)) user.permissions.push(permKey);
    } else {
      user.permissions = user.permissions.filter(p => p !== permKey);
    }
    saveToCloud();
  }
  /* ── Reset PIN ─────────────────────────────────────── */
  function resetPin(userId) {
    const user = users.find(u => u.id === userId);
    if (!user) return;
    user.pin = genOtp();
    user.mustChangePIN = true;
    delete user.salt;
    saveToCloud();
    renderTable();
    toast(`Einmal-PIN für ${user.name} gesetzt: ${user.pin}`, 'ok');
  }

  /* ── Delete user ───────────────────────────────────── */
  function deleteUser(userId) {
    const user = users.find(u => u.id === userId);
    if (!user) return;
    if (!confirm(`Nutzer "${user.name}" wirklich löschen?`)) return;
    users = users.filter(u => u.id !== userId);
    if (!removedIds.includes(userId)) removedIds.push(userId);
    saveToCloud();
    renderTable();
    toast(`${user.name} gelöscht.`, 'info');
  }

  /* ── Add user ──────────────────────────────────────── */
  function buildNewPermChecks() {
    const permDefs = getPermDefs();
    const container = document.getElementById('new-perm-checks');
    container.innerHTML = '';
    if (permDefs.length === 0) {
      document.getElementById('new-perm-group').style.display = 'none';
      return;
    }
    document.getElementById('new-perm-group').style.display = '';
    permDefs.forEach(pd => {
      const lbl = document.createElement('label');
      lbl.className = 'perm-check';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.dataset.permKey = pd.key;
      lbl.appendChild(cb);
      lbl.appendChild(document.createTextNode(pd.label));
      container.appendChild(lbl);
    });
  }

  document.getElementById('btn-add-user').addEventListener('click', () => {
    const panel = document.getElementById('add-panel');
    panel.classList.remove('hidden');
    document.getElementById('new-name').value = '';
    buildNewPermChecks();
    document.getElementById('new-name').focus();
  });

  document.getElementById('btn-cancel-add').addEventListener('click', () => {
    document.getElementById('add-panel').classList.add('hidden');
  });

  document.getElementById('btn-do-add').addEventListener('click', () => {
    const name = document.getElementById('new-name').value.trim();
    if (!name) { toast('Bitte einen Namen eingeben.', 'err'); return; }

    const permChecks = document.querySelectorAll('#new-perm-checks input[type="checkbox"]');
    const permissions = [];
    permChecks.forEach(cb => { if (cb.checked) permissions.push(cb.dataset.permKey); });

    const newUser = {
      id: genId(),
      name: name,
      pin: genOtp(),
      mustChangePIN: true
    };
    if (permissions.length > 0) newUser.permissions = permissions;

    users.push(newUser);
    saveToCloud();
    renderTable();
    document.getElementById('add-panel').classList.add('hidden');
    toast(`${name} hinzugefügt. Einmal-PIN: ${newUser.pin}`, 'ok');
  });

  /* ── Export ────────────────────────────────────────── */
  document.getElementById('btn-export').addEventListener('click', () => {
    const payload = {
      version: usersVersion,
      exported: new Date().toISOString(),
      count: users.length,
      users: users
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'lgc_users_export_' + new Date().toISOString().slice(0,10) + '.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    toast('Export gestartet.', 'ok');
  });

  /* ── Print OTP pins ────────────────────────────────── */
  document.getElementById('btn-print-pins').addEventListener('click', openPrintPins);

  function openPrintPins() {
    const otpList = otpUsers();
    if (otpList.length === 0) { toast('Keine Einmal-PINs vorhanden.', 'info'); return; }

    const dateStr = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

    let rows = '';
    otpList.forEach((u, i) => {
      const even = (i + 1) % 2 === 0;
      rows += `<tr style="background:${even ? '#f5f5fa' : '#ffffff'}">
        <td style="padding:7px 12px;border-bottom:1px solid #e0e0ee;color:#999;font-size:9pt;width:32px;text-align:center;">${i + 1}</td>
        <td style="padding:7px 12px;border-bottom:1px solid #e0e0ee;font-weight:600;font-size:11pt;">${escHtml(u.name)}</td>
        <td style="padding:7px 12px;border-bottom:1px solid #e0e0ee;font-family:'Courier New',monospace;font-size:13pt;font-weight:700;letter-spacing:6px;color:#1a1a2e;text-align:center;width:130px;">${escHtml(u.pin)}</td>
        <td style="padding:7px 12px;border-bottom:1px solid #e0e0ee;font-size:8.5pt;color:#888;width:180px;">Beim 1. Login PIN &auml;ndern</td>
      </tr>`;
    });

    const html = `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8">
<title>LifeguardClock – Einmal-PINs</title>
<style>
  @page { size: A4 portrait; margin: 18mm 16mm 16mm 16mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11pt; color: #1a1a2e; background: #fff; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head><body>
<div style="display:flex;align-items:flex-end;justify-content:space-between;border-bottom:2px solid #1a1a2e;padding-bottom:8px;margin-bottom:18px;">
  <div>
    <div style="font-size:18pt;font-weight:700;letter-spacing:-0.3px;display:flex;align-items:center;gap:10px;"><img src="Logo.png" style="height:28pt;vertical-align:middle;border-radius:6pt"> LifeguardClock – Einmal-PINs</div>
    <div style="font-size:9pt;color:#555;margin-top:3px;">Bitte nach dem ersten Login eine pers&ouml;nliche PIN vergeben</div>
  </div>
  <div style="font-size:8.5pt;color:#777;text-align:right;line-height:1.6;">Stand: ${dateStr}<br>Vertraulich – nicht weitergeben</div>
</div>
<div style="background:#fff8e1;border:1px solid #f5c842;border-radius:5px;padding:8px 12px;font-size:9pt;color:#5a4200;margin-bottom:18px;">
  &#9888; Diese PINs sind tempor&auml;re Einmal-PINs. Beim ersten Einloggen wird automatisch eine neue pers&ouml;nliche PIN verlangt.
  Einmal-PINs bitte nach Aus&shy;h&auml;ndigung nicht aufbewahren.
</div>
<table style="width:100%;border-collapse:collapse;">
  <thead>
    <tr style="background:#1a1a2e;color:#fff;">
      <th style="padding:7px 12px;font-size:9pt;font-weight:600;text-transform:uppercase;letter-spacing:0.6px;text-align:center;">#</th>
      <th style="padding:7px 12px;font-size:9pt;font-weight:600;text-transform:uppercase;letter-spacing:0.6px;text-align:left;">Name</th>
      <th style="padding:7px 12px;font-size:9pt;font-weight:600;text-transform:uppercase;letter-spacing:0.6px;text-align:center;">Einmal-PIN</th>
      <th style="padding:7px 12px;font-size:9pt;font-weight:600;text-transform:uppercase;letter-spacing:0.6px;text-align:left;">Hinweis</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>
<div style="margin-top:18px;border-top:1px solid #ccc;padding-top:8px;font-size:8pt;color:#aaa;display:flex;justify-content:space-between;">
  <span>LifeguardClock – vertraulich</span>
  <span>${otpList.length} Mitglied${otpList.length !== 1 ? 'er' : ''}</span>
</div>
</body></html>`;

    const w = window.open('', '_blank', 'width=800,height=700');
    if (!w) { toast('Pop-up blockiert. Bitte Pop-ups erlauben.', 'err'); return; }
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 400);
  }

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ── Cloud card collapsible ────────────────────────── */
  const cloudCardBody = document.getElementById('cloud-card-body');
  const cloudToggleIcon = document.getElementById('cloud-toggle-icon');

  document.getElementById('cloud-card-toggle').addEventListener('click', () => {
    const hidden = cloudCardBody.classList.toggle('hidden');
    cloudToggleIcon.classList.toggle('open', !hidden);
  });

  /* ── Credentials: save + connect ───────────────────── */
  document.getElementById('btn-save-creds').addEventListener('click', () => {
    const url  = document.getElementById('inp-url').value.trim().replace(/\/$/, '');
    const user = document.getElementById('inp-user').value.trim();
    const pass = document.getElementById('inp-pass').value;
    if (!user || !pass || (!IS_PROXY && !url)) { toast('Bitte alle Felder ausfüllen.', 'err'); return; }
    localStorage.setItem('lgc_cloud', JSON.stringify({ url: url || 'http://localhost', user, pass }));
    loadUsers(false);
  });

  /* ── Credentials: test ─────────────────────────────── */
  document.getElementById('btn-test').addEventListener('click', async () => {
    const url  = document.getElementById('inp-url').value.trim().replace(/\/$/, '');
    const user = document.getElementById('inp-user').value.trim();
    const pass = document.getElementById('inp-pass').value;
    if (!user || !pass || (!IS_PROXY && !url)) { toast('Bitte alle Felder ausfüllen.', 'err'); return; }
    const creds = { url: url || 'http://localhost', user, pass };
    setStatus('gray', 'Teste…');
    try {
      const davUrl = buildWebDavBase(creds);
      const res = await fetch(davUrl, {
        method: 'PROPFIND',
        headers: {
          'Authorization': authHeader(creds),
          'Depth': '0'
        }
      });
      if (res.ok || res.status === 207 || res.status === 404) {
        setStatus('green', 'Verbunden');
        toast('Verbindung erfolgreich!', 'ok');
      } else {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch (err) {
      setStatus('red', 'Fehler');
      toast('Verbindungstest fehlgeschlagen: ' + err.message, 'err');
    }
  });

  /* ── Credentials: load ─────────────────────────────── */
  document.getElementById('btn-load').addEventListener('click', () => {
    // Persist current field values first
    const url  = document.getElementById('inp-url').value.trim().replace(/\/$/, '');
    const user = document.getElementById('inp-user').value.trim();
    const pass = document.getElementById('inp-pass').value;
    if (user && pass && (url || IS_PROXY)) {
      localStorage.setItem('lgc_cloud', JSON.stringify({ url: url || 'http://localhost', user, pass }));
    }
    loadUsers(false);
  });

  /* ── Startup ───────────────────────────────────────── */
  /* ── Tab navigation ─────────────────────────────────── */
  function switchTab(name) {
    document.querySelectorAll('.tab-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.tab === name)
    );
    document.querySelectorAll('.tab-panel').forEach(p =>
      p.classList.toggle('active', p.id === 'tab-' + name)
    );
    localStorage.setItem('lgc_admin_tab', name);
  }

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  /* ══════════════════════════════════════════════════════ */

  function init() {
    // file://-Protokoll: sofort CORS-Warnung zeigen
    if (location.protocol === 'file:') {
      document.getElementById('cors-banner').style.display = '';
    }

    // Warnung wenn admin_config.js fehlt und auch kein gespeicherter Key
    if (!window.ADMIN_CONFIG && !localStorage.getItem('lgc_cloud')) {
      document.getElementById('no-config-banner').style.display = '';
    }

    // Im Proxy-Modus: URL-Feld ausblenden (wird vom Server übernommen)
    if (IS_PROXY) {
      const urlGroup = document.getElementById('inp-url').closest('.form-group');
      if (urlGroup) urlGroup.style.display = 'none';
    }

    // Credential-Felder befüllen
    const creds = getCredentials();
    if (creds) {
      document.getElementById('inp-url').value  = creds.url  || '';
      document.getElementById('inp-user').value = creds.user || '';
      document.getElementById('inp-pass').value = creds.pass || '';
    }

    // Collapse cloud card if credentials are already stored
    const hasCreds = !!localStorage.getItem('lgc_cloud') ||
      (window.ADMIN_CONFIG && window.ADMIN_CONFIG.cloud && window.ADMIN_CONFIG.cloud.url);
    if (hasCreds) {
      cloudCardBody.classList.add('hidden');
      cloudToggleIcon.classList.remove('open');
    } else {
      cloudCardBody.classList.remove('hidden');
      cloudToggleIcon.classList.add('open');
    }

    // Aktiven Tab wiederherstellen (Default: cloud wenn keine Credentials, sonst mitglieder)
    const savedTab = localStorage.getItem('lgc_admin_tab') ||
      (hasCreds ? 'mitglieder' : 'cloud');
    switchTab(savedTab);

    // Nutzer beim Start laden (Fehler sichtbar anzeigen)
    if (creds && creds.url && creds.user && creds.pass) {
      loadUsers(false);
    } else {
      renderTable();
    }
  }

  init();
  renderDeviceList();

  // Typen und Events beim Start automatisch laden
  (async () => {
    const creds = getCredentials();
    if (!creds) return;
    const base = buildWebDavBase(creds);
    const hdrs = { Authorization: authHeader(creds) };

    // Typen laden
    try {
      const res = await fetch(`${base}/lgc_types.json`, { headers: hdrs });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.types)) {
          _globalTypes = data.types.filter(_validType).map(t => ({...t}));
          if (!window.CONFIG) window.CONFIG = {};
          window.CONFIG.types = _globalTypes;
          renderGlobalTypesList();
          renderTable();
          buildNewPermChecks();
          document.getElementById('btn-types-save').disabled = false;
          document.getElementById('types-meta').textContent =
            `Stand: ${data.updated ? new Date(data.updated).toLocaleString('de-DE') : '?'}`;
        }
      } else if (res.status === 404 && Array.isArray(window.CONFIG?.types) && window.CONFIG.types.length > 0) {
        // Datei noch nicht in Cloud – aus lokalem config.js vorbefüllen
        _globalTypes = window.CONFIG.types.map(t => ({...t}));
        renderGlobalTypesList();
        renderTable();
        buildNewPermChecks();
        document.getElementById('btn-types-save').disabled = false;
        document.getElementById('types-meta').textContent = 'Aus config.js – noch nicht in Cloud gespeichert';
      }
    } catch (e) {
      toast('Typen laden fehlgeschlagen: ' + e.message, 'err');
    }

    // Events laden
    try {
      const res = await fetch(`${base}/lgc_events.json`, { headers: hdrs });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.events)) {
          _events = data.events.filter(_validEvent).map(e => ({...e}));
          renderEventsList();
          document.getElementById('btn-events-save').disabled = false;
          document.getElementById('events-meta').textContent =
            `Stand: ${data.updated ? new Date(data.updated).toLocaleString('de-DE') : '?'}`;
        }
      }
    } catch {}
  })();

  /* ── Device config editor ──────────────────────────────── */
  /* ── Typen-Verwaltungs-UI ──────────────────────────────── */
  const _ZF_DAYS = [
    { key: 'mo', label: 'Mo' }, { key: 'di', label: 'Di' }, { key: 'mi', label: 'Mi' },
    { key: 'do', label: 'Do' }, { key: 'fr', label: 'Fr' }, { key: 'sa', label: 'Sa' },
    { key: 'so', label: 'So' },
  ];

  function renderTypesUI() {
    const container = document.getElementById('cfg-types-list');
    if (!container) return;
    if (_editTypes.length === 0) {
      container.innerHTML = '<p class="note" style="margin:0">Keine Typen – Konfiguration laden.</p>';
      return;
    }
    container.innerHTML = _editTypes.map((type, idx) => {
      const disabled = !!type.disabled;
      const hasZF    = !!type.requiresZeitfenster;
      const zfRows   = _ZF_DAYS.map(d => {
        const zf = type.zeitfenster?.[d.key];
        return `<div class="cfg-zf-row">
          <span class="cfg-zf-day">${escHtml(d.label)}</span>
          <input type="time" class="cfg-zf-inp" data-idx="${idx}" data-day="${escHtml(d.key)}" data-field="start" value="${escHtml(zf?.start ?? '')}">
          <span class="cfg-zf-sep">&ndash;</span>
          <input type="time" class="cfg-zf-inp" data-idx="${idx}" data-day="${escHtml(d.key)}" data-field="end"   value="${escHtml(zf?.end ?? '')}">
          <button class="btn-zf-clear" data-idx="${idx}" data-day="${escHtml(d.key)}" title="Zurücksetzen">&#xD7;</button>
        </div>`;
      }).join('');
      return `<div class="cfg-type-row${disabled ? ' is-disabled' : ''}" id="cfg-type-row-${idx}">
        <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
          <label class="cfg-type-toggle">
            <input type="checkbox" data-idx="${idx}" data-role="active" ${disabled ? '' : 'checked'}>
            <span class="cfg-type-name">${escHtml(type.label || type.key)}</span>
            <span class="cfg-type-key">${escHtml(type.key)}</span>
          </label>
          <label class="cfg-type-toggle" style="margin-left:auto">
            <input type="checkbox" data-idx="${idx}" data-role="zf" ${hasZF ? 'checked' : ''}>
            <span style="font-size:12px;color:var(--text-2)">Zeitfenster</span>
          </label>
        </div>
        <div class="cfg-zf-grid" id="cfg-zf-grid-${idx}" style="display:${hasZF ? '' : 'none'}">${zfRows}</div>
      </div>`;
    }).join('');

    // Aktiv-Checkboxes
    container.querySelectorAll('input[data-role="active"]').forEach(cb => {
      cb.addEventListener('change', () => {
        const idx = parseInt(cb.dataset.idx);
        _editTypes[idx].disabled = !cb.checked;
        document.getElementById(`cfg-type-row-${idx}`)?.classList.toggle('is-disabled', !cb.checked);
        syncTypesToTextarea();
      });
    });

    // Zeitfenster-Checkboxes
    container.querySelectorAll('input[data-role="zf"]').forEach(cb => {
      cb.addEventListener('change', () => {
        const idx = parseInt(cb.dataset.idx);
        _editTypes[idx].requiresZeitfenster = cb.checked;
        if (!cb.checked) delete _editTypes[idx].requiresZeitfenster;
        const grid = document.getElementById(`cfg-zf-grid-${idx}`);
        if (grid) grid.style.display = cb.checked ? '' : 'none';
        syncTypesToTextarea();
      });
    });

    // Zeitfenster-Inputs
    container.querySelectorAll('.cfg-zf-inp').forEach(inp => {
      inp.addEventListener('change', () => {
        const idx   = parseInt(inp.dataset.idx);
        const day   = inp.dataset.day;
        const field = inp.dataset.field;
        if (!_editTypes[idx].zeitfenster) _editTypes[idx].zeitfenster = {};
        if (!_editTypes[idx].zeitfenster[day]) _editTypes[idx].zeitfenster[day] = {};
        if (inp.value) {
          _editTypes[idx].zeitfenster[day][field] = inp.value;
        } else {
          delete _editTypes[idx].zeitfenster[day][field];
          if (!Object.keys(_editTypes[idx].zeitfenster[day]).length)
            delete _editTypes[idx].zeitfenster[day];
          if (!Object.keys(_editTypes[idx].zeitfenster).length)
            delete _editTypes[idx].zeitfenster;
        }
        syncTypesToTextarea();
      });
    });

    // Clear-Buttons
    container.querySelectorAll('.btn-zf-clear').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx);
        const day = btn.dataset.day;
        if (_editTypes[idx].zeitfenster) {
          delete _editTypes[idx].zeitfenster[day];
          if (!Object.keys(_editTypes[idx].zeitfenster).length)
            delete _editTypes[idx].zeitfenster;
        }
        renderTypesUI();
        syncTypesToTextarea();
      });
    });
  }

  function syncTypesToTextarea() {
    const ta = document.getElementById('cfg-types-json');
    if (ta) ta.value = JSON.stringify(_editTypes, null, 2);
  }

  document.getElementById('btn-json-to-ui')?.addEventListener('click', () => {
    try {
      const parsed = JSON.parse(document.getElementById('cfg-types-json').value);
      if (!Array.isArray(parsed)) throw new Error('kein Array');
      _editTypes = parsed.map(t => ({...t}));
      renderTypesUI();
      toast('JSON in Typen-Verwaltung übernommen.', 'ok');
    } catch (e) {
      toast('Ungültiges JSON: ' + e.message, 'err');
    }
  });

  /* ══════════════════════════════════════════════════════
     Globale Typen-Karte (lgc_types.json)
  ══════════════════════════════════════════════════════ */

  // Toggle
  document.getElementById('types-card-toggle').addEventListener('click', () => {
    const body = document.getElementById('types-card-body');
    const icon = document.getElementById('types-toggle-icon');
    body.classList.toggle('hidden');
    icon.classList.toggle('open');
  });
  document.getElementById('types-toggle-icon').classList.add('open');

  function renderGlobalTypesList() {
    const list = document.getElementById('types-list');
    if (_globalTypes.length === 0) {
      list.innerHTML = '<p class="note" style="margin:0">Keine Typen – aus Cloud laden oder neu erstellen.</p>';
      return;
    }
    list.innerHTML = _globalTypes.map((t, idx) => `
      <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
        <span style="width:16px;height:16px;border-radius:50%;background:var(--${safeColor(t.color)});flex-shrink:0"></span>
        <span style="font-weight:600;min-width:120px">${escHtml(t.label || t.key)}</span>
        <code style="font-size:11px;color:var(--text-3)">${escHtml(t.key)}</code>
        ${t.permissionKey ? `<span style="font-size:11px;padding:2px 6px;border-radius:4px;background:var(--surface-3)">${escHtml(t.permissionKey)}</span>` : ''}
        ${t.maxDurationMs ? `<span style="font-size:11px;color:var(--text-2)">${Math.round(t.maxDurationMs/60000)}min</span>` : ''}
        <div style="margin-left:auto;display:flex;gap:6px">
          <button class="btn btn-ghost" style="padding:4px 10px;font-size:12px" data-type-edit="${idx}">&#9998; Bearbeiten</button>
          <button class="btn btn-danger" style="padding:4px 10px;font-size:12px" data-type-del="${idx}">&#x2715;</button>
        </div>
      </div>`).join('');

    list.querySelectorAll('[data-type-edit]').forEach(btn => {
      btn.addEventListener('click', () => openTypeForm(parseInt(btn.dataset.typeEdit)));
    });
    list.querySelectorAll('[data-type-del]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.typeDel);
        if (!confirm(`Typ „${_globalTypes[idx].label || _globalTypes[idx].key}" löschen?`)) return;
        _globalTypes.splice(idx, 1);
        renderGlobalTypesList();
        document.getElementById('btn-types-save').disabled = false;
      });
    });
  }

  let _typeFormIdx = -1; // -1 = neu
  function openTypeForm(idx) {
    _typeFormIdx = idx;
    const t = idx >= 0 ? _globalTypes[idx] : {};
    document.getElementById('type-form-title').textContent = idx >= 0 ? 'Typ bearbeiten' : 'Neuer Typ';
    document.getElementById('tf-key').value       = t.key       || '';
    document.getElementById('tf-key').readOnly    = idx >= 0;
    document.getElementById('tf-label').value     = t.label     || '';
    document.getElementById('tf-logtype').value   = t.logType   || '';
    document.getElementById('tf-color').value     = t.color     || 'blue';
    document.getElementById('tf-permkey').value   = t.permissionKey || '';
    document.getElementById('tf-maxdur').value    = t.maxDurationMs ? Math.round(t.maxDurationMs / 60000) : '';
    document.getElementById('tf-cooldown').value  = t.cooldownMs    ? Math.round(t.cooldownMs    / 60000) : '';
    document.getElementById('tf-autostart').value = (t.autoStartKeys || []).join(', ');
    document.getElementById('tf-mutex').value     = (t.mutexKeys     || []).join(', ');
    document.getElementById('tf-order').value         = t.order != null ? t.order : '';
    document.getElementById('tf-pinned').checked      = !!t.pinned;
    document.getElementById('tf-requireszf').checked  = !!t.requiresZeitfenster;
    renderTypeFormZf(t.zeitfenster || {}, !!t.requiresZeitfenster);
    document.getElementById('type-form-wrap').style.display = '';
    document.getElementById('tf-label').focus();
  }

  function renderTypeFormZf(zeitfenster, show) {
    const wrap = document.getElementById('tf-zf-wrap');
    wrap.style.display = show ? '' : 'none';
    const grid = document.getElementById('tf-zf-grid');
    grid.innerHTML = _ZF_DAYS.map(d => {
      const zf = zeitfenster[d.key] || {};
      return `<div class="cfg-zf-row">
        <span class="cfg-zf-day">${escHtml(d.label)}</span>
        <input type="time" class="cfg-zf-inp" data-day="${d.key}" data-field="start" value="${escHtml(zf.start || '')}">
        <span class="cfg-zf-sep">&ndash;</span>
        <input type="time" class="cfg-zf-inp" data-day="${d.key}" data-field="end"   value="${escHtml(zf.end || '')}">
      </div>`;
    }).join('');
  }

  document.getElementById('tf-requireszf').addEventListener('change', function() {
    document.getElementById('tf-zf-wrap').style.display = this.checked ? '' : 'none';
  });

  document.getElementById('btn-type-form-save').addEventListener('click', () => {
    const key = document.getElementById('tf-key').value.trim().toLowerCase().replace(/\s+/g, '_');
    if (!key) { toast('Key darf nicht leer sein.', 'err'); return; }
    if (_typeFormIdx < 0 && _globalTypes.some(t => t.key === key)) {
      toast(`Key „${key}" existiert bereits.`, 'err'); return;
    }
    const label   = document.getElementById('tf-label').value.trim();
    const logType = document.getElementById('tf-logtype').value.trim() || key;
    const color   = document.getElementById('tf-color').value;
    const permKey = document.getElementById('tf-permkey').value.trim();
    const maxMin  = parseInt(document.getElementById('tf-maxdur').value)   || 0;
    const cdMin   = parseInt(document.getElementById('tf-cooldown').value) || 0;
    const autoStr = document.getElementById('tf-autostart').value;
    const muxStr  = document.getElementById('tf-mutex').value;
    const orderVal = parseInt(document.getElementById('tf-order').value);
    const pinned  = document.getElementById('tf-pinned').checked;
    const reqZf   = document.getElementById('tf-requireszf').checked;

    // Zeitfenster aus Grid lesen
    const zf = {};
    document.getElementById('tf-zf-grid').querySelectorAll('.cfg-zf-inp').forEach(inp => {
      if (!inp.value) return;
      const d = inp.dataset.day, f = inp.dataset.field;
      if (!zf[d]) zf[d] = {};
      zf[d][f] = inp.value;
    });

    const t = { key, label, logType, color };
    if (!isNaN(orderVal) && orderVal > 0) t.order = orderVal;
    if (pinned)          t.pinned = true;
    if (reqZf)           t.requiresZeitfenster = true;
    if (maxMin > 0)      t.maxDurationMs = maxMin * 60000;
    if (cdMin  > 0)      t.cooldownMs    = cdMin  * 60000;
    if (permKey)         t.permissionKey = permKey;
    const autoKeys = autoStr.split(',').map(s => s.trim()).filter(Boolean);
    const muxKeys  = muxStr.split(',').map(s => s.trim()).filter(Boolean);
    if (autoKeys.length) t.autoStartKeys = autoKeys;
    if (muxKeys.length)  t.mutexKeys     = muxKeys;
    if (reqZf && Object.keys(zf).length) t.zeitfenster = zf;

    if (_typeFormIdx >= 0) {
      _globalTypes[_typeFormIdx] = t;
    } else {
      _globalTypes.push(t);
    }
    document.getElementById('type-form-wrap').style.display = 'none';
    renderGlobalTypesList();
    document.getElementById('btn-types-save').disabled = false;
    // Permissions-Spalte aktuell halten
    renderTable();
    buildNewPermChecks();
  });

  document.getElementById('btn-type-form-cancel').addEventListener('click', () => {
    document.getElementById('type-form-wrap').style.display = 'none';
  });

  document.getElementById('btn-types-add').addEventListener('click', () => openTypeForm(-1));

  document.getElementById('btn-types-load').addEventListener('click', async () => {
    const creds = getCredentials();
    if (!creds) { toast('Keine Zugangsdaten.', 'err'); return; }
    const btn = document.getElementById('btn-types-load');
    btn.disabled = true; btn.textContent = '…';
    try {
      const res = await fetch(`${buildWebDavBase(creds)}/lgc_types.json`, {
        headers: { Authorization: authHeader(creds) },
      });
      if (res.status === 404) {
        if (Array.isArray(window.CONFIG?.types) && window.CONFIG.types.length > 0) {
          _globalTypes = window.CONFIG.types.map(t => ({...t}));
          renderGlobalTypesList();
          renderTable();
          buildNewPermChecks();
          document.getElementById('btn-types-save').disabled = false;
          document.getElementById('types-meta').textContent = 'Aus config.js – noch nicht in Cloud gespeichert';
          toast('lgc_types.json nicht gefunden – Typen aus config.js geladen. Bitte speichern.', 'info');
        } else {
          toast('lgc_types.json noch nicht vorhanden – Typen hier erstellen und speichern.', 'info');
        }
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!Array.isArray(data.types)) throw new Error('Ungültiges Format');
      const rawTypes = data.types.filter(_validType);
      if (rawTypes.length !== data.types.length) {
        console.warn(`[lgc-admin] types load: ${data.types.length - rawTypes.length} ungültige Einträge verworfen`);
      }
      _globalTypes = rawTypes.map(t => ({...t}));
      if (!window.CONFIG) window.CONFIG = {};
      window.CONFIG.types = _globalTypes;
      renderGlobalTypesList();
      renderTable();
      buildNewPermChecks();
      document.getElementById('btn-types-save').disabled = false;
      document.getElementById('types-meta').textContent =
        `Stand: ${data.updated ? new Date(data.updated).toLocaleString('de-DE') : '?'}`;
      toast(`${_globalTypes.length} Typ(en) geladen.`, 'ok');
    } catch (e) {
      toast('Fehler: ' + e.message, 'err');
    } finally {
      btn.disabled = false; btn.textContent = '☁ Typen laden';
    }
  });

  document.getElementById('btn-types-save').addEventListener('click', async () => {
    const creds = getCredentials();
    if (!creds) { toast('Keine Zugangsdaten.', 'err'); return; }
    const btn = document.getElementById('btn-types-save');
    btn.disabled = true; btn.textContent = '…';
    try {
      const base = buildWebDavBase(creds);
      await fetch(base, { method: 'MKCOL', headers: { Authorization: authHeader(creds) } }).catch(() => {});
      const payload = JSON.stringify({ version: 1, updated: new Date().toISOString(), types: _globalTypes }, null, 2);
      const res = await fetch(`${base}/lgc_types.json`, {
        method: 'PUT',
        headers: { Authorization: authHeader(creds), 'Content-Type': 'application/json' },
        body: payload,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      document.getElementById('types-meta').textContent = `Stand: ${new Date().toLocaleString('de-DE')}`;
      toast('Typen gespeichert – Geräte übernehmen beim nächsten Check.', 'ok');
    } catch (e) {
      toast('Fehler: ' + e.message, 'err');
    } finally {
      btn.disabled = false; btn.textContent = '↑ In Cloud speichern';
    }
  });

  /* ══════════════════════════════════════════════════════ */

  document.getElementById('btn-cfg-discover').addEventListener('click', discoverDevices);

  document.getElementById('btn-deploy-signal').addEventListener('click', async () => {
    const creds = getCredentials();
    if (!creds) { toast('Keine Zugangsdaten gespeichert.', 'err'); return; }
    const btn = document.getElementById('btn-deploy-signal');
    const status = document.getElementById('deploy-status');
    btn.disabled = true; btn.textContent = '…';
    try {
      const base = buildWebDavBase(creds);
      await fetch(base, { method: 'MKCOL', headers: { Authorization: authHeader(creds) } }).catch(() => {});
      const payload = JSON.stringify({ deployedAt: new Date().toISOString() });
      const r = await fetch(`${base}/lgc_deploy.json`, {
        method: 'PUT',
        headers: { Authorization: authHeader(creds), 'Content-Type': 'application/json' },
        body: payload,
      });
      if (r.ok) {
        toast('Deploy-Signal gesendet – Geräte laden beim nächsten Check neu.', 'ok');
        status.textContent = `Gesendet: ${new Date().toLocaleTimeString()}`;
      } else {
        toast(`Fehler: HTTP ${r.status}`, 'err');
      }
    } catch (e) {
      toast('Verbindungsfehler: ' + e.message, 'err');
    } finally {
      btn.disabled = false; btn.textContent = '🔄 Deploy-Signal senden';
    }
  });

  const cfgCardToggle = document.getElementById('config-card-toggle');
  const cfgCardBody   = document.getElementById('config-card-body');
  const cfgToggleIcon = document.getElementById('config-toggle-icon');

  cfgToggleIcon.classList.add('open');

  cfgCardToggle.addEventListener('click', () => {
    cfgCardBody.classList.toggle('hidden');
    cfgToggleIcon.classList.toggle('open');
  });

  document.getElementById('btn-cfg-load').addEventListener('click', async () => {
    const creds = getCredentials();
    if (!creds) { toast('Keine Zugangsdaten gespeichert.', 'err'); return; }
    const deviceId = document.getElementById('cfg-device-id').value.trim();
    if (!deviceId) { toast('Bitte Geräte-ID eingeben.', 'err'); return; }
    const btn = document.getElementById('btn-cfg-load');
    btn.disabled = true; btn.textContent = 'Lade…';
    try {
      const url = buildWebDavBase(creds) + `/lgc_config_${deviceId}.json`;
      const res = await fetch(url, { headers: { 'Authorization': authHeader(creds) } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const cfg = data.config || data;
      _cfgFull = cfg;

      // Einfache Felder befüllen
      document.getElementById('cfg-admin-pin').value    = cfg.adminPin ?? '';
      document.getElementById('cfg-day-boundary').value = cfg.dayBoundaryHour ?? 4;
      document.getElementById('cfg-screensaver').value  = cfg.screensaverSeconds ?? 60;
      document.getElementById('cfg-pin-clear').value    = cfg.pinClearSeconds ?? 5;

      // Per-device overrides aus typeOverrides mergen (neue Format)
      // Fallback: legacy types-Array aus alter Gerätekonfig
      const overrides = cfg.typeOverrides || {};
      const baseTypes = _globalTypes.length > 0 ? _globalTypes : (cfg.types || []);
      _editTypes = baseTypes.map(t => {
        const ov = overrides[t.key];
        if (!ov) return { ...t };
        const merged = { ...t };
        if ('disabled'   in ov) merged.disabled   = ov.disabled;
        if (ov.zeitfenster)     merged.zeitfenster = { ...ov.zeitfenster };
        return merged;
      });
      syncTypesToTextarea();
      renderTypesUI();

      addKnownDevice(deviceId);
      document.getElementById('cfg-meta').textContent =
        `Gerät: ${data.deviceId || deviceId} · Stand: ${data.exported ? new Date(data.exported).toLocaleString('de-DE') : '?'}`;
      document.getElementById('cfg-editor-wrap').style.display = '';
      toast('Konfiguration geladen.', 'ok');
    } catch (err) {
      toast('Fehler beim Laden: ' + err.message, 'err');
    } finally {
      btn.disabled = false; btn.textContent = 'Laden';
    }
  });

  document.getElementById('btn-cfg-save').addEventListener('click', async () => {
    const creds = getCredentials();
    if (!creds) { toast('Keine Zugangsdaten.', 'err'); return; }
    const deviceId = document.getElementById('cfg-device-id').value.trim();
    if (!deviceId) { toast('Geräte-ID fehlt.', 'err'); return; }

    // Einfache Felder lesen
    const adminPin = document.getElementById('cfg-admin-pin').value.trim();
    if (adminPin && !/^\d{6}$/.test(adminPin)) {
      toast('Admin-PIN muss genau 6 Ziffern haben.', 'err'); return;
    }
    const dayBoundary = parseInt(document.getElementById('cfg-day-boundary').value) || 4;
    const screensaver = parseInt(document.getElementById('cfg-screensaver').value) || 60;
    const pinClear    = parseInt(document.getElementById('cfg-pin-clear').value) || 0;

    // Per-device typeOverrides (nur disabled + zeitfenster)
    const typeOverrides = {};
    _editTypes.forEach(t => {
      const ov = {};
      if (t.disabled)    ov.disabled    = true;
      if (t.zeitfenster) ov.zeitfenster = t.zeitfenster;
      if (Object.keys(ov).length) typeOverrides[t.key] = ov;
    });

    // Nur gerätespezifische Felder speichern — types/cloud/defaultUsers nie in Gerätekonfig
    const { defaultUsers: _du, removedUsers: _ru, cloud: _cl, types: _ty, ...cfgBase } = (_cfgFull || {});
    const merged = { ...cfgBase, dayBoundaryHour: dayBoundary, screensaverSeconds: screensaver, pinClearSeconds: pinClear };
    if (Object.keys(typeOverrides).length) merged.typeOverrides = typeOverrides;
    if (adminPin) merged.adminPin = adminPin;

    const btn = document.getElementById('btn-cfg-save');
    btn.disabled = true; btn.textContent = '…';
    try {
      const payload = JSON.stringify({
        version: 1, exported: new Date().toISOString(), deviceId,
        config: merged,
      }, null, 2);
      const url = buildWebDavBase(creds) + `/lgc_config_${deviceId}.json`;
      const res = await fetch(url, {
        method: 'PUT',
        headers: { 'Authorization': authHeader(creds), 'Content-Type': 'application/json' },
        body: payload,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      _cfgFull = merged;
      toast('Konfiguration gespeichert.', 'ok');
      document.getElementById('cfg-meta').textContent =
        `Gerät: ${deviceId} · Stand: ${new Date().toLocaleString('de-DE')}`;
    } catch (err) {
      toast('Fehler beim Speichern: ' + err.message, 'err');
    } finally {
      btn.disabled = false; btn.textContent = 'Speichern';
    }
  });

  document.getElementById('btn-cfg-reset').addEventListener('click', () => {
    if (!confirm('Gespeicherte Cloud-Konfiguration für dieses Gerät entfernen?\n(Wirkt erst nach dem nächsten Neustart der App.)')) return;
    // This only makes sense locally — for the current browser's localStorage
    localStorage.removeItem('lgc_config_cloud');
    toast('Cloud-Konfiguration aus lokalem Speicher entfernt.', 'ok');
  });

  /* ── Einrichtungs-QR ───────────────────────────────── */
  // Karte aufklappen/zuklappen
  document.getElementById('qr-card-toggle').addEventListener('click', () => {
    const body = document.getElementById('qr-card-body');
    const icon = document.getElementById('qr-toggle-icon');
    const hidden = body.style.display === 'none';
    body.style.display = hidden ? '' : 'none';
    icon.innerHTML = hidden ? '&#9660;' : '&#9654;';
  });

  // Aus Cloud-Verbindung übernehmen
  document.getElementById('btn-fill-qr').addEventListener('click', () => {
    const url  = document.getElementById('inp-url').value.trim();
    const user = document.getElementById('inp-user').value.trim();
    const pass = document.getElementById('inp-pass').value.trim();
    if (!url || !user || !pass) { toast('Bitte zuerst Cloud-Verbindung ausfüllen.', 'warn'); return; }
    document.getElementById('qr-url').value  = url;
    document.getElementById('qr-user').value = user;
    document.getElementById('qr-pass').value = pass;
  });

  /* ══════════════════════════════════════════════════════
     Events / Sonderzeiten (lgc_events.json)
  ══════════════════════════════════════════════════════ */

  // Toggle
  document.getElementById('events-card-toggle').addEventListener('click', () => {
    const body = document.getElementById('events-card-body');
    const icon = document.getElementById('events-toggle-icon');
    body.classList.toggle('hidden');
    icon.classList.toggle('open');
  });
  document.getElementById('events-toggle-icon').classList.add('open');

  function renderEventsList() {
    const list = document.getElementById('events-list');
    if (_events.length === 0) {
      list.innerHTML = '<p class="note" style="margin:0">Keine Events &ndash; aus Cloud laden oder neu erstellen.</p>';
      return;
    }
    const sorted = [..._events].sort((a, b) => a.date.localeCompare(b.date));
    const rows = sorted.map((ev, i) => {
      const origIdx = _events.indexOf(ev);
      const types = ev.zeitfenster ? Object.keys(ev.zeitfenster) : [];
      const typesStr = types.length
        ? types.map(k => {
            const zf = ev.zeitfenster[k];
            return `<span style="font-size:0.78rem;color:var(--text-2)">${escHtml(k)}&nbsp;${escHtml(zf.start)}–${escHtml(zf.end)}</span>`;
          }).join('&ensp;')
        : '<span style="font-size:0.78rem;color:var(--text-3)">keine Overrides</span>';
      return `<div class="type-row" data-ev-idx="${origIdx}">
        <span style="font-family:monospace;font-size:0.85rem;min-width:90px">${escHtml(ev.date)}</span>
        <span style="flex:1;min-width:0">${escHtml(ev.label || '—')}</span>
        <span style="flex:2;min-width:0;display:flex;flex-wrap:wrap;gap:4px">${typesStr}</span>
        <button class="btn btn-ghost btn-xs btn-ev-edit" data-ev-idx="${origIdx}">&#x270F;</button>
        <button class="btn btn-ghost btn-xs btn-ev-del"  data-ev-idx="${origIdx}">&#x1F5D1;</button>
      </div>`;
    });
    list.innerHTML = rows.join('');
  }

  function getZfTypes() {
    // Typen mit requiresZeitfenster aus globalTypes oder window.CONFIG
    const src = (_globalTypes.length ? _globalTypes : window.CONFIG?.types) ?? [];
    return src.filter(t => t.requiresZeitfenster);
  }

  function buildEventZfGrid(zeitfenster) {
    const types = getZfTypes();
    if (!types.length) {
      return '<p class="note" style="margin:0;font-size:0.8rem">Keine Typen mit Zeitfenster vorhanden &ndash; zuerst Typen laden.</p>';
    }
    return types.map(t => {
      const zf = zeitfenster?.[t.key];
      const checked = !!zf;
      const start   = zf?.start ?? '07:00';
      const end     = zf?.end   ?? '21:00';
      return `<div class="cfg-field-row" style="align-items:center;gap:8px">
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;min-width:140px">
          <input type="checkbox" class="ef-zf-check" data-key="${escHtml(t.key)}" ${checked ? 'checked' : ''}>
          <span>${escHtml(t.label || t.key)}</span>
        </label>
        <input type="time" class="cfg-inp ef-zf-start" data-key="${escHtml(t.key)}" value="${escHtml(start)}" style="width:100px" ${checked ? '' : 'disabled'}>
        <span style="color:var(--text-3)">–</span>
        <input type="time" class="cfg-inp ef-zf-end"   data-key="${escHtml(t.key)}" value="${escHtml(end)}"   style="width:100px" ${checked ? '' : 'disabled'}>
      </div>`;
    }).join('');
  }

  function openEventForm(idx) {
    _eventEditIdx = idx ?? null;
    const ev = idx !== null ? _events[idx] : null;
    document.getElementById('event-form-title').textContent = ev ? 'Event bearbeiten' : 'Neues Event';
    document.getElementById('ef-date').value  = ev?.date  ?? '';
    document.getElementById('ef-label').value = ev?.label ?? '';
    document.getElementById('ef-zf-grid').innerHTML = buildEventZfGrid(ev?.zeitfenster ?? {});
    // Checkboxen steuern Inputs
    document.querySelectorAll('.ef-zf-check').forEach(cb => {
      cb.addEventListener('change', () => {
        const key = cb.dataset.key;
        document.querySelector(`.ef-zf-start[data-key="${key}"]`).disabled = !cb.checked;
        document.querySelector(`.ef-zf-end[data-key="${key}"]`).disabled   = !cb.checked;
      });
    });
    document.getElementById('event-form-wrap').style.display = '';
    document.getElementById('ef-date').focus();
  }

  function closeEventForm() {
    document.getElementById('event-form-wrap').style.display = 'none';
    _eventEditIdx = null;
  }

  document.getElementById('btn-events-add').addEventListener('click', () => openEventForm(null));

  document.getElementById('btn-event-form-cancel').addEventListener('click', closeEventForm);

  document.getElementById('btn-event-form-save').addEventListener('click', () => {
    const date  = document.getElementById('ef-date').value.trim();
    const label = document.getElementById('ef-label').value.trim();
    if (!date) { toast('Bitte ein Datum eingeben.', 'warn'); return; }
    // Datum-Duplikat prüfen
    const dupIdx = _events.findIndex((e, i) => e.date === date && i !== _eventEditIdx);
    if (dupIdx !== -1) { toast(`Für ${date} existiert bereits ein Event.`, 'warn'); return; }
    // Zeitfenster einsammeln
    const zeitfenster = {};
    document.querySelectorAll('.ef-zf-check:checked').forEach(cb => {
      const key   = cb.dataset.key;
      const start = document.querySelector(`.ef-zf-start[data-key="${key}"]`).value;
      const end   = document.querySelector(`.ef-zf-end[data-key="${key}"]`).value;
      if (start && end) zeitfenster[key] = { start, end };
    });
    const ev = { date, label, zeitfenster };
    if (_eventEditIdx !== null) {
      _events[_eventEditIdx] = ev;
    } else {
      _events.push(ev);
    }
    closeEventForm();
    renderEventsList();
    document.getElementById('btn-events-save').disabled = false;
    toast('Event gespeichert – noch nicht in Cloud.', 'info');
  });

  document.getElementById('events-list').addEventListener('click', e => {
    const editBtn = e.target.closest('.btn-ev-edit');
    const delBtn  = e.target.closest('.btn-ev-del');
    if (editBtn) { openEventForm(Number(editBtn.dataset.evIdx)); return; }
    if (delBtn) {
      const idx = Number(delBtn.dataset.evIdx);
      const ev  = _events[idx];
      if (!confirm(`Event ${ev.date} "${ev.label || ''}" löschen?`)) return;
      _events.splice(idx, 1);
      renderEventsList();
      document.getElementById('btn-events-save').disabled = false;
    }
  });

  document.getElementById('btn-events-load').addEventListener('click', async () => {
    const creds = getCredentials();
    if (!creds) { toast('Keine Zugangsdaten.', 'err'); return; }
    const btn = document.getElementById('btn-events-load');
    btn.disabled = true; btn.textContent = '…';
    try {
      const res = await fetch(`${buildWebDavBase(creds)}/lgc_events.json`, {
        headers: { Authorization: authHeader(creds) },
      });
      if (res.status === 404) {
        toast('lgc_events.json noch nicht vorhanden – Events neu erstellen und speichern.', 'info');
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!Array.isArray(data.events)) throw new Error('Ungültiges Format');
      _events = data.events.filter(_validEvent).map(e => ({...e}));
      renderEventsList();
      document.getElementById('btn-events-save').disabled = false;
      document.getElementById('events-meta').textContent =
        `Stand: ${data.updated ? new Date(data.updated).toLocaleString('de-DE') : '?'}`;
      toast(`${_events.length} Event(s) geladen.`, 'ok');
    } catch (e) {
      toast('Fehler: ' + e.message, 'err');
    } finally {
      btn.disabled = false; btn.textContent = '☁ Events laden';
    }
  });

  document.getElementById('btn-events-save').addEventListener('click', async () => {
    const creds = getCredentials();
    if (!creds) { toast('Keine Zugangsdaten.', 'err'); return; }
    const btn = document.getElementById('btn-events-save');
    btn.disabled = true; btn.textContent = '…';
    try {
      const base    = buildWebDavBase(creds);
      await fetch(base, { method: 'MKCOL', headers: { Authorization: authHeader(creds) } }).catch(() => {});
      const payload = JSON.stringify({ version: 1, updated: new Date().toISOString(), events: _events }, null, 2);
      const res = await fetch(`${base}/lgc_events.json`, {
        method: 'PUT',
        headers: { Authorization: authHeader(creds), 'Content-Type': 'application/json' },
        body: payload,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      document.getElementById('events-meta').textContent = `Stand: ${new Date().toLocaleString('de-DE')}`;
      toast('Events gespeichert – Geräte übernehmen beim nächsten Cloud-Sync.', 'ok');
    } catch (e) {
      toast('Fehler: ' + e.message, 'err');
    } finally {
      btn.disabled = false; btn.textContent = '↑ In Cloud speichern';
    }
  });

  /* ══════════════════════════════════════════════════════ */

  // QR erzeugen
  document.getElementById('btn-gen-qr').addEventListener('click', () => {
    const url  = document.getElementById('qr-url').value.trim();
    const user = document.getElementById('qr-user').value.trim();
    const pass = document.getElementById('qr-pass').value.trim();
    if (!url || !user || !pass) { toast('Bitte alle drei Felder ausfüllen.', 'warn'); return; }
    if (typeof QRCode === 'undefined') { toast('QR-Bibliothek lädt noch – kurz warten.', 'warn'); return; }
    const data = `lgc://cloud?url=${encodeURIComponent(url)}&user=${encodeURIComponent(user)}&pass=${encodeURIComponent(pass)}`;
    document.getElementById('qr-output').style.display = 'block';
    QRCode.toCanvas(document.getElementById('qr-canvas'), data, {
      width: 240, margin: 2,
      color: { dark: '#0f172a', light: '#ffffff' }
    }, err => { if (err) toast('QR-Fehler: ' + err.message, 'err'); });
  });

})();
