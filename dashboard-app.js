/* dashboard-app.js – aus dashboard.html extrahiert (CSP-Migration) */
if (typeof CONFIG === 'undefined') window.CONFIG = undefined;
if (typeof ADMIN_CONFIG === 'undefined') window.ADMIN_CONFIG = undefined;

    // ─── HTML-Escape ─────────────────────────────────────────────────────────
    function escHtml(s) {
      return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    // ─── Typ-Farbpalette & bekannte Labels ───────────────────────────────────
    const COLOR_PALETTE = {
      blue:   { main: '#3b82f6', dim: 'rgba(59,130,246,.15)'  },
      amber:  { main: '#f59e0b', dim: 'rgba(245,158,11,.15)'  },
      orange: { main: '#fb923c', dim: 'rgba(251,146,60,.15)'  },
      red:    { main: '#ef4444', dim: 'rgba(239,68,68,.15)'   },
      green:  { main: '#22c55e', dim: 'rgba(34,197,94,.15)'   },
      lime:   { main: '#a3e635', dim: 'rgba(163,230,53,.15)'  },
      cyan:   { main: '#22d3ee', dim: 'rgba(34,211,238,.15)'  },
      violet: { main: '#8b5cf6', dim: 'rgba(139,92,246,.15)'  },
      pink:   { main: '#f472b6', dim: 'rgba(244,114,182,.15)' },
      grey:   { main: '#9ca3af', dim: 'rgba(156,163,175,.15)' },
    };
    const COLOR_FALLBACK = ['blue','amber','red','green','violet','orange','cyan','pink','lime','grey'];

    const KNOWN_LABELS = {
      anwesenheit:             'Anwesenheit',
      wachstunde_ehrenamtlich: 'Wachstunden',
      sanitätsstunde:          'Sanitätsstunden',
      wachdienst:              'Wachdienst',
      sanitaetsdienst:         'Sanitätsdienst',
      sanitätsdienst:          'Sanitätsdienst',
      verwaltung:              'Verwaltung',
      ausbildung:              'Ausbildung',
      helfer:                  'Helfer',
    };

    // Dynamisch aus den geladenen Daten abgeleitet
    let TYPES  = [];    // logType-Strings in Reihenfolge
    let T_INFO = {};    // logType → { label, main, dim }

    // Aus lgc_type_config (localStorage, gesetzt von LifeguardClock.html) oder CONFIG.types
    const CFG_TYPE_MAP = {};
    function _buildCfgMap(types) {
      types.forEach((t, i) => {
        const c = COLOR_PALETTE[t.color] || COLOR_PALETTE[COLOR_FALLBACK[i % 5]];
        CFG_TYPE_MAP[t.logType] = { label: t.label, main: c.main, dim: c.dim, order: i };
      });
    }
    try {
      const stored = JSON.parse(localStorage.getItem('lgc_type_config') || '[]');
      if (stored.length > 0) _buildCfgMap(stored);
    } catch (e) {}
    if (Object.keys(CFG_TYPE_MAP).length === 0 &&
        typeof CONFIG !== 'undefined' && Array.isArray(CONFIG?.types)) {
      _buildCfgMap(CONFIG.types.filter(t => !t.disabled));
    }

    function buildTypeList(typeTotals) {
      // Reihenfolge: aus CONFIG (wenn verfügbar), sonst anwesenheit zuerst dann nach Stunden
      const sorted = Object.keys(typeTotals).sort((a, b) => {
        const oa = CFG_TYPE_MAP[a]?.order ?? 999;
        const ob = CFG_TYPE_MAP[b]?.order ?? 999;
        if (oa !== ob) return oa - ob;
        if (a === 'anwesenheit') return -1;
        if (b === 'anwesenheit') return 1;
        return typeTotals[b] - typeTotals[a];
      });
      TYPES  = sorted;
      T_INFO = {};
      sorted.forEach((lt, i) => {
        const cfg = CFG_TYPE_MAP[lt];
        const c   = cfg || COLOR_PALETTE[COLOR_FALLBACK[i % 5]];
        T_INFO[lt] = { label: cfg?.label || KNOWN_LABELS[lt] || lt, main: c.main, dim: c.dim };
      });
    }

    // Hilfsfunktionen für Inline-Styles
    function tStyle(lt) {
      const i = T_INFO[lt] || { main: '#888', dim: 'rgba(128,128,128,.15)' };
      return `--type-color:${i.main};--type-dim:${i.dim}`;
    }
    function tColor(lt) {
      return `color:${(T_INFO[lt]||{main:'#888'}).main}`;
    }

    // ─── State ───────────────────────────────────────────────────────────────
    let DB = null;          // parsed data model
    let dayIdx  = 0;
    let weekIdx = 0;
    let activePerson = null;

    // ─── Hilfsfunktionen ─────────────────────────────────────────────────────
    function fmtH(ms) {
      if (!ms) return '—';
      const h = Math.floor(ms / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      return `${h}:${String(m).padStart(2,'0')}`;
    }
    function fmtMs(ms) {
      if (!ms) return '—';
      const h = Math.floor(ms / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      return h > 0 ? `${h} h ${String(m).padStart(2,'0')} min` : `${m} min`;
    }
    function fmtDateLong(iso) {
      return new Date(iso + 'T12:00:00').toLocaleDateString('de-DE',
        { weekday:'long', day:'numeric', month:'long', year:'numeric' });
    }
    function fmtDateShort(iso) {
      return new Date(iso + 'T12:00:00').toLocaleDateString('de-DE',
        { day:'2-digit', month:'2-digit', year:'numeric' });
    }
    function fmtWeekday(iso) {
      return new Date(iso + 'T12:00:00').toLocaleDateString('de-DE', { weekday:'short' });
    }
    function isoWeekKey(iso) {
      const d = new Date(iso + 'T12:00:00');
      const day = d.getDay() || 7;
      d.setDate(d.getDate() + 4 - day);
      const jan4 = new Date(d.getFullYear(), 0, 4);
      const kw = 1 + Math.round(((d - jan4) / 86400000 - 3 + ((jan4.getDay()||7))) / 7);
      return `${d.getFullYear()}-W${String(kw).padStart(2,'0')}`;
    }
    function fmtWeek(wk) {
      const [y, w] = wk.split('-W');
      return `KW\u00a0${w}\u00a0/${y}`;
    }
    // Berechnet den logischen Tag eines Eintrags (lokale Zeit, Tagesgrenze wie in LifeguardClock)
    function entryLogicalDay(zeitstempel) {
      if (!zeitstempel) return null;
      const d = new Date(zeitstempel);
      if (isNaN(d)) return null;
      const boundary = (typeof CONFIG !== 'undefined' && CONFIG?.dayBoundaryHour) ?? 4;
      if (d.getHours() < boundary) d.setDate(d.getDate() - 1);
      const p = n => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
    }

    function importedEntryBaseKey(entry) {
      return JSON.stringify({
        nutzer: entry?.nutzer ?? '',
        typ: entry?.typ ?? '',
        aktion: entry?.aktion ?? '',
        zeitstempel: entry?.zeitstempel ?? '',
        dauer_ms: entry?.dauer_ms ?? '',
        auto: !!entry?.auto,
      });
    }
    function normalizeImportedEntries(rawEntries) {
      const fallbackCounts = new Map();
      let normalizedCount = 0;
      const entries = [];
      for (const entry of (Array.isArray(rawEntries) ? rawEntries : [])) {
        if (!entry || typeof entry !== 'object') continue;
        if (entry.id !== undefined && entry.id !== null && entry.id !== '') {
          entries.push(entry);
          continue;
        }
        const baseKey = importedEntryBaseKey(entry);
        const idx = fallbackCounts.get(baseKey) || 0;
        fallbackCounts.set(baseKey, idx + 1);
        normalizedCount++;
        entries.push({ ...entry, id: `fallback:${baseKey}:${idx}` });
      }
      return { entries, normalizedCount };
    }
    function takeUniqueImportedEntries(rawEntries, seenEntryIds, sourceLabel) {
      const { entries, normalizedCount } = normalizeImportedEntries(rawEntries);
      if (normalizedCount) {
        console.warn(`${sourceLabel}: ${normalizedCount} Einträge ohne id wurden mit Ersatz-ID verarbeitet.`);
      }
      const uniqueEntries = [];
      for (const entry of entries) {
        const key = String(entry.id);
        if (seenEntryIds.has(key)) continue;
        seenEntryIds.add(key);
        uniqueEntries.push(entry);
      }
      return uniqueEntries;
    }
    function showTab(name) {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === `tab-${name}`));
    }

    // ─── Laden ───────────────────────────────────────────────────────────────
    async function processFiles(fileList) {
      const entries      = [];
      const seenFiles    = new Set();
      const seenEntryIds = new Set();  // verhindert Doppelzählung wenn PIF + Gerätedatei geladen
      for (const file of fileList) {
        const isPIF    = /^lgc_pif_.+_\d{4}-\d{2}\.json$/.test(file.name);
        const isDevice = /^lgc_.*\d{4}-\d{2}-\d{2}\.json$/.test(file.name);
        if (!isPIF && !isDevice) continue;
        if (seenFiles.has(file.name)) continue;
        seenFiles.add(file.name);
        try {
          const json = JSON.parse(await file.text());
          if (isPIF) {
            const byDay = {};
            for (const e of takeUniqueImportedEntries(json.entries || [], seenEntryIds, file.name)) {
              const day = entryLogicalDay(e.zeitstempel);
              if (!day) continue;
              (byDay[day] ??= []).push(e);
            }
            for (const [day, log] of Object.entries(byDay)) entries.push({ day, log });
          } else {
            if (Array.isArray(json.log)) {
              const byDay = {};
              for (const e of takeUniqueImportedEntries(json.log, seenEntryIds, file.name)) {
                const day = entryLogicalDay(e.zeitstempel);
                if (!day) continue;
                (byDay[day] ??= []).push(e);
              }
              for (const [day, log] of Object.entries(byDay)) entries.push({ day, log });
            }
          }
        } catch { /* überspringe kaputte Datei */ }
      }
      if (entries.length === 0) {
        alert('Keine gültigen lgc_*.json Dateien gefunden.');
        return;
      }
      DB = buildDB(entries);
      buildTypeList(DB.typeTotals);
      dayIdx  = DB.days.length - 1;
      weekIdx = DB.weeks.length - 1;
      activePerson = DB.persons[0] ?? null;
      document.getElementById('file-badge').textContent = `${entries.length} Dateien`;
      document.getElementById('file-badge').style.display = '';
      document.getElementById('header-range').textContent =
        `${fmtDateShort(DB.days[0])} – ${fmtDateShort(DB.days[DB.days.length-1])}`;
      renderAll();
    }

    document.getElementById('btn-load').addEventListener('click', async () => {
      if (typeof window.showDirectoryPicker === 'function') {
        // File System Access API (HTTPS / localhost)
        try {
          const dir = await window.showDirectoryPicker({ mode: 'read' });
          const files = [];
          for await (const entry of dir.values()) {
            if (entry.kind === 'file') files.push(await entry.getFile());
          }
          await processFiles(files);
        } catch (e) {
          if (e.name !== 'AbortError') alert('Fehler: ' + e.message);
        }
      } else {
        // Fallback: <input webkitdirectory> (file://, Firefox, …)
        document.getElementById('file-input').click();
      }
    });

    document.getElementById('file-input').addEventListener('change', async e => {
      await processFiles(Array.from(e.target.files));
      e.target.value = ''; // Reset damit gleicher Ordner nochmals ladbar
    });

    // ─── Datenmodell aufbauen ─────────────────────────────────────────────────
    function buildDB(entries) {
      // by[day][person][typ] = ms
      const by = {};
      const personSet = new Set();
      const typeTotals = {};   // logType → Gesamtdauer aller Daten

      // Alle Quellen pro Tag zusammenführen bevor gepaart wird –
      // Start kann aus Gerätedatei stammen, Stop aus PIF (oder umgekehrt)
      const allByDay = {};
      for (const { day, log } of entries) {
        if (!allByDay[day]) allByDay[day] = [];
        allByDay[day].push(...log);
      }

      for (const [day, log] of Object.entries(allByDay)) {
        const groups = {};
        for (const e of log) {
          if (!e.nutzer || !e.typ) continue;
          const k = `${e.nutzer}\0${e.typ}`;
          if (!groups[k]) groups[k] = [];
          groups[k].push(e);
        }
        for (const grpEntries of Object.values(groups)) {
          const sorted = grpEntries.sort((a, b) => new Date(a.zeitstempel) - new Date(b.zeitstempel));
          const p = sorted[0].nutzer;
          const t = sorted[0].typ;
          let openStart = null;
          for (const e of sorted) {
            if (e.aktion === 'start') {
              openStart = e;
            } else if (e.aktion === 'stop') {
              if (!openStart) continue; // verwaister Stop (kein Start auf diesem Tag) → überspringen
              let durMs = (e.dauer_ms > 0) ? e.dauer_ms : null;
              if (!durMs) {
                durMs = new Date(e.zeitstempel) - new Date(openStart.zeitstempel);
              }
              if (durMs > 0) {
                personSet.add(p);
                if (!by[day]) by[day] = {};
                if (!by[day][p]) by[day][p] = {};
                by[day][p][t] = (by[day][p][t] || 0) + durMs;
                typeTotals[t] = (typeTotals[t] || 0) + durMs;
              }
              openStart = null;
            }
          }
        }
      }

      const days = Object.keys(by).sort();
      const persons = [...personSet].sort();

      // Wochen
      const weekMap = {};
      for (const d of days) {
        const wk = isoWeekKey(d);
        if (!weekMap[wk]) weekMap[wk] = [];
        weekMap[wk].push(d);
      }
      const weeks = Object.keys(weekMap).sort();

      return { by, days, persons, weekMap, weeks, typeTotals };
    }

    // ─── Alle Tabs neu rendern ────────────────────────────────────────────────
    function renderAll() {
      ['overview','days','weeks','persons','export'].forEach(t => {
        document.getElementById(`${t}-empty`).style.display = 'none';
        document.getElementById(`${t}-data`).style.display  = '';
      });
      renderOverview();
      renderDay();
      renderWeek();
      renderPersonFilter();
      renderPersonDetail();
    }

    // ─── Übersicht ────────────────────────────────────────────────────────────
    function renderOverview() {
      // Gesamtsummen
      const totals = {};
      for (const typ of TYPES) totals[typ] = 0;
      for (const dayData of Object.values(DB.by))
        for (const pd of Object.values(dayData))
          for (const typ of TYPES) totals[typ] += pd[typ] || 0;

      document.getElementById('summary-cards').innerHTML = TYPES.map(typ => `
        <div class="card" style="${tStyle(typ)}">
          <div class="card-label">${escHtml(T_INFO[typ]?.label || typ)}</div>
          <div class="card-value">${fmtH(totals[typ])}<span class="card-unit">h</span></div>
          <div class="card-sub">${DB.days.length} Tage · ${DB.persons.length} Personen</div>
        </div>
      `).join('');

      // Personen-Gesamtdaten für Top-Listen
      const ptotals = {};
      for (const p of DB.persons) { ptotals[p] = {}; for (const t of TYPES) ptotals[p][t] = 0; }
      for (const dayData of Object.values(DB.by))
        for (const [p, pd] of Object.entries(dayData))
          for (const typ of TYPES) ptotals[p][typ] = (ptotals[p][typ]||0) + (pd[typ]||0);

      const topFor = typ => Object.entries(ptotals)
        .filter(([,d]) => d[typ] > 0)
        .sort((a,b) => b[1][typ] - a[1][typ])
        .slice(0, 5);

      const vereinTop = Object.entries(ptotals)
        .map(([name, d]) => [name, TYPES.filter(t => t !== 'anwesenheit').reduce((s, t) => s + (d[t] || 0), 0)])
        .filter(([, h]) => h > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
      const vereinStyle = '--type-color:#c9a800;--type-dim:rgba(120,120,120,0.12)';

      const rankCls = ['rank-1','rank-2','rank-3','',''];
      const vereinCard = `
        <div class="top-list">
          <div class="top-list-hdr" style="${vereinStyle}">&#x1F3C6; Top Verein</div>
          ${vereinTop.length === 0
            ? '<div class="top-item" style="color:var(--text-3)">Keine Daten</div>'
            : vereinTop.map(([name, h], i) => `
                <div class="top-item">
                  <div class="top-rank ${rankCls[i]}">${i+1}</div>
                  <div class="top-name">${escHtml(name)}</div>
                  <div class="top-val" style="${vereinStyle}">${fmtH(h)} h</div>
                </div>`).join('')}
        </div>`;
      document.getElementById('top-grid').innerHTML = vereinCard + TYPES.map(typ => {
        const top = topFor(typ);
        return `
          <div class="top-list">
            <div class="top-list-hdr" style="${tStyle(typ)}">&#x1F3C6; Top ${escHtml(T_INFO[typ]?.label || typ)}</div>
            ${top.length === 0
              ? '<div class="top-item" style="color:var(--text-3)">Keine Daten</div>'
              : top.map(([name, d], i) => `
                  <div class="top-item">
                    <div class="top-rank ${rankCls[i]}">${i+1}</div>
                    <div class="top-name">${escHtml(name)}</div>
                    <div class="top-val" style="${tStyle(typ)}">${fmtH(d[typ])} h</div>
                  </div>`).join('')}
          </div>`;
      }).join('');

      // Korrelation mit Anwesenheit
      renderCorrelation(ptotals);

      // Kalender
      renderCalendar();
    }

    function pearsonR(xs, ys) {
      const n = xs.length;
      if (n < 2) return null;
      const mx = xs.reduce((a,b) => a+b, 0) / n;
      const my = ys.reduce((a,b) => a+b, 0) / n;
      const num = xs.reduce((s,x,i) => s + (x - mx) * (ys[i] - my), 0);
      const dx = Math.sqrt(xs.reduce((s,x) => s + (x - mx) ** 2, 0));
      const dy = Math.sqrt(ys.reduce((s,y) => s + (y - my) ** 2, 0));
      if (dx === 0 || dy === 0) return null;
      return num / (dx * dy);
    }

    function renderCorrelation(ptotals) {
      const sec = document.getElementById('corr-section');
      const corrTypes = TYPES.filter(t => t !== 'anwesenheit');
      if (!TYPES.includes('anwesenheit') || corrTypes.length === 0 || DB.persons.length < 3) {
        sec.style.display = 'none';
        return;
      }
      const anwVals = DB.persons.map(p => (ptotals[p]?.anwesenheit || 0) / 3600000);
      const html = corrTypes.map(t => {
        const tVals = DB.persons.map(p => (ptotals[p]?.[t] || 0) / 3600000);
        const r = pearsonR(anwVals, tVals);
        if (r === null) return '';
        const pct = Math.round(Math.abs(r) * 100);
        return `
          <div class="corr-item" style="${tStyle(t)}">
            <div class="corr-label">Anwesenheit &#x2194; ${escHtml(T_INFO[t]?.label || t)}</div>
            <div class="corr-bar-wrap">
              <div class="corr-bar" style="width:${pct}%;background:var(--type-color)"></div>
            </div>
            <div class="corr-val">${r >= 0 ? '+' : ''}${r.toFixed(2)}</div>
          </div>`;
      }).filter(Boolean).join('');
      document.getElementById('corr-grid').innerHTML = html || '<span style="color:var(--text-3);font-size:13px">Nicht genug Daten</span>';
      sec.style.display = html ? '' : 'none';
    }

    function renderCalendar() {
      const daySet = new Set(DB.days);
      // Gruppiere nach Monat
      const months = {};
      for (const d of DB.days) {
        const m = d.slice(0, 7);
        if (!months[m]) months[m] = true;
      }
      // Füge ggf. fehlende Monate im Bereich ein
      const allMonths = [];
      if (DB.days.length > 0) {
        const [y0, m0] = DB.days[0].split('-').map(Number);
        const [y1, m1] = DB.days[DB.days.length-1].split('-').map(Number);
        for (let y = y0, m = m0; y < y1 || (y === y1 && m <= m1); ) {
          allMonths.push(`${y}-${String(m).padStart(2,'0')}`);
          m++; if (m > 12) { m = 1; y++; }
        }
      }

      let html = '';
      for (const month of allMonths) {
        const [y, m] = month.split('-').map(Number);
        const name = new Date(y, m-1, 1).toLocaleDateString('de-DE', { month:'long', year:'numeric' });
        html += `<div class="cal-month-label">${name}</div>`;
        // Leertage vorne (Montag = 0)
        const firstDow = (new Date(y, m-1, 1).getDay() + 6) % 7;
        for (let i = 0; i < firstDow; i++) html += `<div class="cal-spacer"></div>`;
        const daysInMonth = new Date(y, m, 0).getDate();
        for (let d = 1; d <= daysInMonth; d++) {
          const iso = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
          const has = daySet.has(iso);
          html += `<div class="cal-day${has ? ' has-data' : ''}"
            ${has ? `data-iso="${iso}" title="${fmtDateShort(iso)}"` : ''}
          >${d}</div>`;
        }
      }
      // Altes Element durch frisches ersetzen – verhindert akkumulierte Event-Listener
      const oldGrid = document.getElementById('cal-grid');
      const calGrid = oldGrid.cloneNode(false);
      calGrid.innerHTML = html;
      calGrid.addEventListener('click', e => {
        const iso = e.target.closest('[data-iso]')?.dataset.iso;
        if (iso) jumpToDay(iso);
      });
      oldGrid.replaceWith(calGrid);
    }

    function jumpToDay(iso) {
      const idx = DB.days.indexOf(iso);
      if (idx < 0) return;
      dayIdx = idx;
      renderDay();
      showTab('days');
    }

    // ─── Tage ─────────────────────────────────────────────────────────────────
    function renderDay() {
      if (!DB || DB.days.length === 0) return;
      const day = DB.days[dayIdx];
      const dayData = DB.by[day] || {};

      document.getElementById('day-label-main').textContent = fmtDateLong(day);
      document.getElementById('day-label-sub').textContent  = `Tag ${dayIdx+1} von ${DB.days.length}`;
      document.getElementById('day-prev').disabled = dayIdx === 0;
      document.getElementById('day-next').disabled = dayIdx === DB.days.length - 1;

      const totals = {};
      let hasAny = false;
      const rows = DB.persons.map(p => {
        const d = dayData[p] || {};
        if (!TYPES.some(t => d[t] > 0)) return '';
        hasAny = true;
        for (const t of TYPES) totals[t] = (totals[t]||0) + (d[t]||0);
        return `<tr>
          <td>${escHtml(p)}</td>
          ${TYPES.map(t => `<td class="col-type" style="${tColor(t)}">${fmtMs(d[t])}</td>`).join('')}
        </tr>`;
      }).filter(Boolean);

      document.getElementById('day-table').innerHTML = `
        <table class="data-table">
          <thead><tr>
            <th>Person</th>
            ${TYPES.map(t => `<th class="col-type" style="${tColor(t)}">${escHtml(T_INFO[t]?.label||t)}</th>`).join('')}
          </tr></thead>
          <tbody>
            ${rows.length > 0
              ? rows.join('') + `<tr class="total-row">
                  <td>Gesamt</td>
                  ${TYPES.map(t => `<td class="col-type" style="${tColor(t)}">${fmtMs(totals[t])}</td>`).join('')}
                </tr>`
              : `<tr class="no-data-row"><td colspan="${1+TYPES.length}">Keine Einträge für diesen Tag</td></tr>`}
          </tbody>
        </table>`;
    }

    document.getElementById('day-prev').addEventListener('click', () => { dayIdx--; renderDay(); });
    document.getElementById('day-next').addEventListener('click', () => { dayIdx++; renderDay(); });

    // ─── Wochen ───────────────────────────────────────────────────────────────
    function renderWeek() {
      if (!DB || DB.weeks.length === 0) return;
      const wk = DB.weeks[weekIdx];
      const wkDays = DB.weekMap[wk] || [];

      document.getElementById('week-label-main').textContent = fmtWeek(wk);
      document.getElementById('week-label-sub').textContent =
        wkDays.length > 0
          ? `${fmtDateShort(wkDays[0])} – ${fmtDateShort(wkDays[wkDays.length-1])}`
          : '';
      document.getElementById('week-prev').disabled = weekIdx === 0;
      document.getElementById('week-next').disabled = weekIdx === DB.weeks.length - 1;

      // Aggregieren
      const pw = {};
      for (const p of DB.persons) { pw[p] = {}; for (const t of TYPES) pw[p][t] = 0; }
      for (const d of wkDays) {
        for (const [p, pd] of Object.entries(DB.by[d] || {})) {
          if (!pw[p]) { pw[p] = {}; for (const t of TYPES) pw[p][t] = 0; }
          for (const t of TYPES) pw[p][t] += pd[t] || 0;
        }
      }

      const totals = {};
      const rows = DB.persons.map(p => {
        const d = pw[p] || {};
        if (!TYPES.some(t => d[t] > 0)) return '';
        for (const t of TYPES) totals[t] = (totals[t]||0) + (d[t]||0);
        return `<tr>
          <td>${escHtml(p)}</td>
          ${TYPES.map(t => `<td class="col-type" style="${tColor(t)}">${fmtMs(d[t])}</td>`).join('')}
        </tr>`;
      }).filter(Boolean);

      document.getElementById('week-table').innerHTML = `
        <table class="data-table">
          <thead><tr>
            <th>Person</th>
            ${TYPES.map(t => `<th class="col-type" style="${tColor(t)}">${escHtml(T_INFO[t]?.label||t)}</th>`).join('')}
          </tr></thead>
          <tbody>
            ${rows.length > 0
              ? rows.join('') + `<tr class="total-row">
                  <td>Gesamt</td>
                  ${TYPES.map(t => `<td class="col-type" style="${tColor(t)}">${fmtMs(totals[t])}</td>`).join('')}
                </tr>`
              : `<tr class="no-data-row"><td colspan="${1+TYPES.length}">Keine Einträge für diese Woche</td></tr>`}
          </tbody>
        </table>`;
    }

    document.getElementById('week-prev').addEventListener('click', () => { weekIdx--; renderWeek(); });
    document.getElementById('week-next').addEventListener('click', () => { weekIdx++; renderWeek(); });

    // ─── Personen ─────────────────────────────────────────────────────────────
    function renderPersonFilter() {
      document.getElementById('person-filter').innerHTML = DB.persons.map(p => `
        <button class="person-btn${p === activePerson ? ' active' : ''}"
          data-person="${escHtml(p)}">${escHtml(p)}</button>
      `).join('');
    }

    document.getElementById('person-filter').addEventListener('click', e => {
      const btn = e.target.closest('.person-btn');
      if (!btn) return;
      activePerson = btn.dataset.person;
      document.querySelectorAll('.person-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.person === activePerson));
      renderPersonDetail();
    });

    function renderPersonDetail() {
      if (!activePerson || !DB) return;
      const totals = {};
      for (const t of TYPES) totals[t] = 0;
      const rows = [];

      for (const day of DB.days) {
        const d = (DB.by[day] || {})[activePerson] || {};
        if (!TYPES.some(t => d[t] > 0)) continue;
        for (const t of TYPES) totals[t] += d[t] || 0;
        rows.push(`<tr>
          <td>${fmtDateShort(day)}</td>
          <td class="col-dim">${fmtWeekday(day)}</td>
          ${TYPES.map(t => `<td class="col-type" style="${tColor(t)}">${fmtMs(d[t])}</td>`).join('')}
        </tr>`);
      }

      document.getElementById('person-detail').innerHTML = `
        <div class="person-name-heading">${escHtml(activePerson)}</div>
        <div class="cards" style="margin-bottom:20px">
          ${TYPES.map(typ => {
            const anwMs = totals['anwesenheit'];
            const pct = (typ !== 'anwesenheit' && anwMs > 0)
              ? Math.round(totals[typ] / anwMs * 100) : null;
            return `
            <div class="card" style="${tStyle(typ)}">
              <div class="card-label">${escHtml(T_INFO[typ]?.label||typ)}</div>
              <div class="card-value">${fmtH(totals[typ])}<span class="card-unit">h</span></div>
              ${pct !== null ? `
              <div style="margin-top:8px">
                <div style="height:4px;background:var(--bg3);border-radius:2px;overflow:hidden">
                  <div style="height:100%;width:${Math.min(pct,100)}%;background:var(--type-color);border-radius:2px"></div>
                </div>
                <div style="font-size:11px;color:var(--text-2);margin-top:4px">${pct}\u00a0% der Anwesenheit</div>
              </div>` : ''}
            </div>`;
          }).join('')}
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr>
              <th>Datum</th><th></th>
              ${TYPES.map(t => `<th class="col-type" style="${tColor(t)}">${escHtml(T_INFO[t]?.label||t)}</th>`).join('')}
            </tr></thead>
            <tbody>
              ${rows.length > 0
                ? rows.join('')
                : `<tr class="no-data-row"><td colspan="${2+TYPES.length}">Keine Daten</td></tr>`}
            </tbody>
          </table>
        </div>`;
    }

    // ─── Export ───────────────────────────────────────────────────────────────
    // Schützt CSV-Zellen vor Formula-Injection (=, +, -, @, Tab, CR als Präfix)
    function csvCell(val) {
      const s = String(val ?? '').replace(/"/g, '""');
      return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
    }
    function csvDL(filename, rows) {
      const csv = '\uFEFF' + rows
        .map(r => r.map(c => `"${csvCell(c)}"`).join(';'))
        .join('\r\n');
      const a = Object.assign(document.createElement('a'), {
        href: 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv),
        download: filename,
      });
      a.click();
    }

    document.getElementById('exp-all').addEventListener('click', () => {
      const header = ['Datum', 'Person', ...TYPES.map(t => `${T_INFO[t]?.label||t} (min)`)];
      const rows = [header];
      for (const day of DB.days)
        for (const [p, pd] of Object.entries(DB.by[day]))
          rows.push([day, p, ...TYPES.map(t => Math.round((pd[t]||0)/60000))]);
      csvDL('lgc_alle_tage.csv', rows);
    });

    document.getElementById('exp-weeks').addEventListener('click', () => {
      const header = ['KW', 'Person', ...TYPES.map(t => `${T_INFO[t]?.label||t} (min)`)];
      const rows = [header];
      for (const wk of DB.weeks) {
        const pw = {};
        for (const d of DB.weekMap[wk])
          for (const [p, pd] of Object.entries(DB.by[d] || {})) {
            if (!pw[p]) pw[p] = {};
            for (const t of TYPES) pw[p][t] = (pw[p][t]||0) + (pd[t]||0);
          }
        for (const [p, pd] of Object.entries(pw))
          rows.push([fmtWeek(wk), p, ...TYPES.map(t => Math.round((pd[t]||0)/60000))]);
      }
      csvDL('lgc_wochen.csv', rows);
    });

    document.getElementById('exp-persons').addEventListener('click', () => {
      const header = ['Person', ...TYPES.map(t => `${T_INFO[t]?.label||t} (min)`)];
      const rows = [header];
      const pt = {};
      for (const [, dayData] of Object.entries(DB.by))
        for (const [p, pd] of Object.entries(dayData)) {
          if (!pt[p]) pt[p] = {};
          for (const t of TYPES) pt[p][t] = (pt[p][t]||0) + (pd[t]||0);
        }
      for (const p of DB.persons)
        rows.push([p, ...TYPES.map(t => Math.round(((pt[p]||{})[t]||0)/60000))]);
      csvDL('lgc_personen.csv', rows);
    });

    // ─── Cloud-Laden ──────────────────────────────────────────────────────────
    const IS_PROXY = location.hostname === 'localhost' || location.hostname === '127.0.0.1';

    function getCloudCreds() {
      // lgc_cloud lesen; wenn leer, einmalig aus admin_config.js bootstrappen
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
      let url = creds.url.trim().replace(/\/$/, '');
      url = url.replace(/\/remote\.php\/dav.*/i, '');
      url = url.replace(/\/index\.php.*/i, '');
      return `${url}/remote.php/dav/files/${encodeURIComponent(creds.user)}/LifeguardClock`;
    }

    async function _doCloudLoad(creds) {
      const base = cloudDavBase(creds);
      const auth = 'Basic ' + btoa(unescape(encodeURIComponent(creds.user + ':' + creds.pass)));
      const btn = document.getElementById('btn-cloud');
      btn.disabled = true;
      btn.textContent = '⏳ Lade…';
      try {
        // Ordner anlegen falls noch nicht vorhanden (idempotent)
        await fetch(base, { method: 'MKCOL', headers: { Authorization: auth } }).catch(() => {});
        const res = await fetch(base, {
          method: 'PROPFIND',
          headers: { Authorization: auth, Depth: '1', 'Content-Type': 'application/xml' },
        });
        if (res.status === 404) {
          btn.disabled = false; btn.textContent = '☁️ Cloud laden';
          alert('Kein LifeguardClock-Ordner in der Cloud gefunden.\nBitte erst die Hauptapp synchronisieren.');
          return;
        }
        if (!res.ok) throw new Error(`PROPFIND: HTTP ${res.status}`);
        const xml = await res.text();

        // Nur PIF-Dateien laden – Gerätedateien sind Backup, nicht Datenquelle
        const hrefs = [...xml.matchAll(/<[^>]*:href[^>]*>([^<]+)<\/[^>]*:href>/g)]
          .map(m => decodeURIComponent(m[1].trim()))
          .filter(h => /lgc_pif_.+_\d{4}-\d{2}\.json$/.test(h));

        if (hrefs.length === 0) {
          btn.disabled = false; btn.textContent = '☁️ Cloud laden';
          alert('Keine PIF-Dateien (lgc_pif_*) in der Cloud gefunden.\nBitte erst mit LifeguardClock stempeln und synchronisieren.');
          return;
        }

        const entries      = [];
        const seenHrefs    = new Set();
        const seenEntryIds = new Set();
        for (const href of hrefs) {
          if (seenHrefs.has(href)) continue;
          seenHrefs.add(href);
          const fileUrl = IS_PROXY
            ? href
            : (creds.url.replace(/\/$/, '') + (href.startsWith('/') ? href : '/' + href));
          try {
            const r = await fetch(fileUrl, { headers: { Authorization: auth } });
            if (!r.ok) continue;
            const json = await r.json();
            const byDay = {};
            for (const e of takeUniqueImportedEntries(json.entries || [], seenEntryIds, href)) {
              const day = entryLogicalDay(e.zeitstempel);
              if (!day) continue;
              (byDay[day] ??= []).push(e);
            }
            for (const [day, log] of Object.entries(byDay)) entries.push({ day, log });
          } catch {}
        }

        btn.disabled = false; btn.textContent = '☁️ Cloud laden';
        if (entries.length === 0) { alert('Keine gültigen PIF-Dateien geladen.'); return; }

        DB = buildDB(entries);
        buildTypeList(DB.typeTotals);
        dayIdx  = DB.days.length - 1;
        weekIdx = DB.weeks.length - 1;
        activePerson = DB.persons[0] ?? null;
        document.getElementById('file-badge').textContent = `☁ ${hrefs.length} PIF-Datei${hrefs.length !== 1 ? 'en' : ''}`;
        document.getElementById('file-badge').style.display = '';
        document.getElementById('header-range').textContent =
          `${fmtDateShort(DB.days[0])} – ${fmtDateShort(DB.days[DB.days.length-1])}`;
        renderAll();
      } catch(e) {
        btn.disabled = false; btn.textContent = '☁️ Cloud laden';
        alert('Cloud-Fehler: ' + e.message);
      }
    }

    document.getElementById('btn-cloud').addEventListener('click', async () => {
      const creds = getCloudCreds();
      if (creds) {
        await _doCloudLoad(creds);
      } else {
        const bar = document.getElementById('cloud-creds-bar');
        bar.style.display = bar.style.display === 'none' ? '' : 'none';
      }
    });

    document.getElementById('cc-ok').addEventListener('click', async () => {
      const url  = document.getElementById('cc-url').value.trim();
      const user = document.getElementById('cc-user').value.trim();
      const pass = document.getElementById('cc-pass').value.trim();
      const hint = document.getElementById('cc-hint');
      if (!user || !pass || (!IS_PROXY && !url)) {
        hint.textContent = IS_PROXY
          ? 'Benutzername und Passwort erforderlich.'
          : 'URL, Benutzername und Passwort erforderlich.';
        return;
      }
      hint.textContent = '';
      const creds = { url, user, pass };
      localStorage.setItem('lgc_cloud', JSON.stringify(creds));
      document.getElementById('cloud-creds-bar').style.display = 'none';
      await _doCloudLoad(creds);
    });

    // ─── Tab-Wechsel ─────────────────────────────────────────────────────────
    document.querySelectorAll('.tab-btn').forEach(btn =>
      btn.addEventListener('click', () => showTab(btn.dataset.tab)));
