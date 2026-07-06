/* =====================================================================
   app.js  —  Getreide-Wissensdatenbank (lokale Web-App)
   Speicherung: IndexedDB (Daten + Fotos bleiben auf deinem Gerät)
   Wetter:      Open-Meteo (Archiv + Vorhersage, kostenlos, ohne Konto)
   ===================================================================== */
// CROPS, STAGE_TABLES, WEEDS_SEED, HOEING_RULES, CURATED_SOURCES
// stammen als globale Konstanten aus data.js (gleicher Skript-Scope).

/* ---------- kleine Helfer ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtDate = (d) => d ? new Date(d).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "–";
const todayISO = () => new Date().toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);

function toast(msg, ms = 2600) {
  const t = $("#toast");
  t.textContent = msg; t.classList.remove("hidden");
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add("hidden"), ms);
}

function openModal(html) {
  $("#modal-content").innerHTML = html;
  $("#modal-backdrop").classList.remove("hidden");
}
function closeModal() { if (typeof destroyPickMap === "function") destroyPickMap(); $("#modal-backdrop").classList.add("hidden"); $("#modal-content").innerHTML = ""; }
$("#modal-close").onclick = closeModal;
$("#modal-backdrop").addEventListener("click", e => { if (e.target.id === "modal-backdrop") closeModal(); });

/* ---------- IndexedDB ---------- */
const DB = {
  _db: null,
  open() {
    return new Promise((res, rej) => {
      const r = indexedDB.open("getreide-wissensdb", 3);
      r.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains("fields")) db.createObjectStore("fields", { keyPath: "id" });
        if (!db.objectStoreNames.contains("notes")) db.createObjectStore("notes", { keyPath: "id" });
        if (!db.objectStoreNames.contains("sources")) db.createObjectStore("sources", { keyPath: "id" });
        if (!db.objectStoreNames.contains("weeds")) db.createObjectStore("weeds", { keyPath: "id" });
        if (!db.objectStoreNames.contains("diseases")) db.createObjectStore("diseases", { keyPath: "id" });
        if (!db.objectStoreNames.contains("photos")) {
          const p = db.createObjectStore("photos", { keyPath: "id" });
          p.createIndex("fieldId", "fieldId", { unique: false });
        }
        if (!db.objectStoreNames.contains("harvests")) {
          const h = db.createObjectStore("harvests", { keyPath: "id" });
          h.createIndex("fieldId", "fieldId", { unique: false });
        }
        // Version 3: Assistent-Einstellungen (API-Key, Modell) + Chatverlauf.
        // Bewusst NICHT Teil von exportAll/importAll (Backup) - API-Key bleibt geräte-lokal.
        if (!db.objectStoreNames.contains("settings")) db.createObjectStore("settings", { keyPath: "id" });
      };
      r.onsuccess = () => { this._db = r.result; res(); };
      r.onerror = () => rej(r.error);
    });
  },
  tx(store, mode = "readonly") { return this._db.transaction(store, mode).objectStore(store); },
  all(store) {
    return new Promise((res, rej) => { const r = this.tx(store).getAll(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  },
  get(store, id) {
    return new Promise((res, rej) => { const r = this.tx(store).get(id); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  },
  put(store, obj) {
    return new Promise((res, rej) => { const r = this.tx(store, "readwrite").put(obj); r.onsuccess = () => res(obj); r.onerror = () => rej(r.error); });
  },
  del(store, id) {
    return new Promise((res, rej) => { const r = this.tx(store, "readwrite").delete(id); r.onsuccess = () => res(); r.onerror = () => rej(r.error); });
  },
  byIndex(store, index, value) {
    return new Promise((res, rej) => { const r = this.tx(store).index(index).getAll(value); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  }
};

/* ---------- Open-Meteo ---------- */
const WMO = { 0: "☀️", 1: "🌤️", 2: "⛅", 3: "☁️", 45: "🌫️", 48: "🌫️", 51: "🌦️", 53: "🌦️", 55: "🌧️", 61: "🌧️", 63: "🌧️", 65: "🌧️", 71: "🌨️", 73: "🌨️", 75: "❄️", 80: "🌦️", 81: "🌧️", 82: "⛈️", 95: "⛈️", 96: "⛈️", 99: "⛈️" };
const wIcon = (c) => WMO[c] ?? "🌡️";

async function geocode(name) {
  const u = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=5&language=de&format=json`;
  const r = await fetch(u); if (!r.ok) throw new Error("Geocoding fehlgeschlagen");
  const j = await r.json();
  return (j.results || []).map(x => ({
    name: x.name, country: x.country, admin1: x.admin1, lat: x.latitude, lon: x.longitude
  }));
}

// Rückwärts-Geocoding (Koordinaten -> Ortsname), keyless via BigDataCloud.
async function reverseGeocode(lat, lon) {
  try {
    const u = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=de`;
    const r = await fetch(u); if (!r.ok) return null;
    const j = await r.json();
    const place = j.city || j.locality || j.principalSubdivision || "";
    const detail = [place, j.principalSubdivision].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(", ");
    return { name: detail || place, country: j.countryName || "" };
  } catch { return null; }
}

/* ---------- Leaflet-Kartenauswahl ---------- */
let _pickMap = null, _pickMarker = null, _pickIcon = null;
function destroyPickMap() { if (_pickMap) { _pickMap.remove(); _pickMap = null; _pickMarker = null; } }

function initPickMap(lat, lon, onPick) {
  destroyPickMap();
  const d = MAP_DEFAULT;
  const hasPos = lat != null && lon != null;
  const center = hasPos ? [lat, lon] : [d.lat, d.lon];
  _pickMap = L.map("ff-map", { scrollWheelZoom: true }).setView(center, hasPos ? 13 : d.zoom);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19, attribution: "&copy; OpenStreetMap"
  }).addTo(_pickMap);
  _pickIcon = L.divIcon({ className: "pin-icon", html: "📍", iconSize: [24, 24], iconAnchor: [12, 22] });
  if (hasPos) placePickMarker(lat, lon, onPick);
  _pickMap.on("click", (e) => { placePickMarker(e.latlng.lat, e.latlng.lng, onPick); onPick(e.latlng.lat, e.latlng.lng); });
  setTimeout(() => _pickMap && _pickMap.invalidateSize(), 250);
}
function placePickMarker(lat, lon, onPick) {
  if (!_pickMarker) {
    _pickMarker = L.marker([lat, lon], { draggable: true, icon: _pickIcon }).addTo(_pickMap);
    _pickMarker.on("dragend", () => { const p = _pickMarker.getLatLng(); onPick(p.lat, p.lng); });
  } else { _pickMarker.setLatLng([lat, lon]); }
}

// Liefert zusammengeführte Tagesreihe (Archiv + Vorhersage) ab Aussaat.
async function fetchWeatherSeries(lat, lon, sowDate) {
  const map = new Map(); // date -> {tmax,tmin,prcp,code}
  const merge = (j) => {
    const d = j.daily; if (!d || !d.time) return;
    d.time.forEach((t, i) => {
      map.set(t, {
        date: t,
        tmax: d.temperature_2m_max?.[i] ?? null,
        tmin: d.temperature_2m_min?.[i] ?? null,
        prcp: d.precipitation_sum?.[i] ?? null,
        code: d.weathercode?.[i] ?? null
      });
    });
  };
  const sow = new Date(sowDate);
  const ageDays = daysBetween(sow, new Date());
  const dailyVars = "temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode";

  // Archiv für ältere Zeiträume (Aussaat liegt > ~80 Tage zurück)
  if (ageDays > 80) {
    const end = new Date(); end.setDate(end.getDate() - 6);
    const archU = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}` +
      `&start_date=${sowDate}&end_date=${end.toISOString().slice(0, 10)}` +
      `&daily=${dailyVars}&timezone=auto`;
    const ar = await fetch(archU); if (ar.ok) merge(await ar.json());
  }
  // Vorhersage-API: jüngste Vergangenheit (überschreibt Archiv-Lücke) + Zukunft
  const past = Math.min(92, Math.max(10, ageDays + 1));
  const fcU = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&daily=${dailyVars}&past_days=${past}&forecast_days=16&timezone=auto`;
  const fr = await fetch(fcU); if (!fr.ok) throw new Error("Wetterabruf fehlgeschlagen"); merge(await fr.json());

  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/* ---------- Wachstumsmodell (Temperatursummen / GDD) ---------- */
function cropParams(field) {
  const c = CROPS[field.crop] || null;
  return {
    name: field.crop === "custom" ? (field.customCropName || "Eigene Kultur") : (c?.name || field.crop),
    baseTemp: field.baseTemp ?? c?.baseTemp ?? 5,
    gddTarget: field.gddToMaturity ?? c?.gddToMaturity ?? 1800,
    stages: STAGE_TABLES[c?.stages] || STAGE_TABLES.cereal
  };
}

function computeGrowth(field) {
  const series = field.weatherCache?.series;
  if (!series || !field.sowDate) return null;
  const p = cropParams(field);
  const today = todayISO();
  let gdd = 0, gddSeries = [];
  let lastMean = null;
  const recent = []; // letzte 14 Tage GDD/Tag für Prognose
  for (const day of series) {
    if (day.date < field.sowDate) continue;
    const tmax = day.tmax, tmin = day.tmin;
    if (tmax == null || tmin == null) continue;
    const mean = (tmax + tmin) / 2;
    const dgdd = Math.max(0, mean - p.baseTemp);
    if (day.date <= today) {
      gdd += dgdd;
      gddSeries.push({ date: day.date, gdd });
      if (daysBetween(day.date, today) <= 14) recent.push(dgdd);
      lastMean = mean;
    }
  }
  const frac = Math.min(1, gdd / p.gddTarget);
  // aktuelles Stadium
  let stage = p.stages[p.stages.length - 1];
  for (const s of p.stages) { if (frac <= s.upTo) { stage = s; break; } }

  // Ernteprognose: künftige GDD aus Vorhersage akkumulieren
  let predDate = null, remaining = Math.max(0, p.gddTarget - gdd);
  if (remaining <= 0) {
    predDate = today; // bereits erntereif
  } else {
    // Tagesschätzung aus Vorhersage (Zukunft) bevorzugt, sonst Mittel der letzten 14 Tage
    const future = series.filter(d => d.date > today && d.tmax != null && d.tmin != null);
    const avgRecent = recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : 0;
    let acc = 0, cur = new Date(today);
    for (let i = 0; i < 200; i++) {
      cur.setDate(cur.getDate() + 1);
      const iso = cur.toISOString().slice(0, 10);
      const f = future.find(d => d.date === iso);
      const dgdd = f ? Math.max(0, (f.tmax + f.tmin) / 2 - p.baseTemp) : avgRecent;
      acc += dgdd;
      if (acc >= remaining) { predDate = iso; break; }
    }
  }
  return {
    params: p, gdd: Math.round(gdd), frac, stage, gddSeries,
    predDate, daysToHarvest: predDate ? daysBetween(today, predDate) : null,
    lastUpdate: field.weatherCache.fetchedAt
  };
}

async function refreshWeather(field, silent) {
  if (!field.lat || !field.lon) { if (!silent) toast("Bitte zuerst einen Standort setzen."); return field; }
  if (!field.sowDate) { if (!silent) toast("Bitte Aussaatdatum angeben."); return field; }
  try {
    if (!silent) toast("Wetterdaten werden geladen …");
    const series = await fetchWeatherSeries(field.lat, field.lon, field.sowDate);
    field.weatherCache = { fetchedAt: Date.now(), series };
    await DB.put("fields", field);
    if (!silent) toast("Wetter & Prognose aktualisiert ✓");
  } catch (e) {
    if (!silent) toast("Fehler beim Wetterabruf: " + e.message);
  }
  return field;
}

/* ---------- Fotos ---------- */
async function addPhotos(fieldId, fileList) {
  for (const file of fileList) {
    if (!file.type.startsWith("image/")) continue;
    await DB.put("photos", { id: uid(), fieldId, blob: file, name: file.name, date: todayISO() });
  }
}
const photoURLs = new Map();
function photoURL(photo) {
  if (!photoURLs.has(photo.id)) photoURLs.set(photo.id, URL.createObjectURL(photo.blob));
  return photoURLs.get(photo.id);
}

/* =====================================================================
   VIEWS
   ===================================================================== */
const App = {
  fields: [], notes: [], sources: [], userWeeds: [], userDiseases: [], harvests: [], tab: "dashboard",
  assistantSettings: { apiKey: "", model: "claude-opus-4-8", webSearch: true },
  chatMessages: [], // { role: "user"|"assistant", text, citations?, imageDataURL? }
  chatBusy: false,
  chatImage: null,   // angehängtes Bild (dataURL) für die nächste Nachricht
  lastBackup: null   // { blob, filename, createdAt, fields, photos } – nur für die Sitzung
};

function switchTab(tab) {
  App.tab = tab;
  $$(".tab").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
  $$(".view").forEach(v => v.classList.toggle("active", v.id === "view-" + tab));
  render();
}
$("#tabs").addEventListener("click", e => { const b = e.target.closest(".tab"); if (b) switchTab(b.dataset.tab); });

function render() {
  if (App.tab === "dashboard") renderDashboard();
  if (App.tab === "fields") renderFields();
  if (App.tab === "weather") renderWeather();
  if (App.tab === "diseases") renderDiseases();
  if (App.tab === "weeds") renderWeeds();
  if (App.tab === "compare") renderCompare();
  if (App.tab === "knowledge") renderKnowledge();
  if (App.tab === "stages") renderStages();
  if (App.tab === "assistant") renderAssistant();
  if (App.tab === "data") renderData();
  if (App.tab === "help") renderHelp();
}

/* ---------- Dashboard ---------- */
function renderDashboard() {
  const v = $("#view-dashboard");
  const crops = new Set(App.fields.map(f => f.crop));
  const harvests = App.fields.map(f => computeGrowth(f)).filter(g => g && g.predDate);
  const next = harvests.sort((a, b) => a.predDate.localeCompare(b.predDate))[0];

  v.innerHTML = `
    <div class="view-head">
      <div><h2>Übersicht</h2><p class="lead">Dein Anbauüberblick mit aktuellem Reifestand und Ernteprognosen.</p></div>
      <button class="btn" id="dash-add">＋ Feld anlegen</button>
    </div>
    <div class="stat-row">
      <div class="stat"><div class="num">${App.fields.length}</div><div class="lbl">Felder / Schläge</div></div>
      <div class="stat"><div class="num">${crops.size}</div><div class="lbl">Kulturarten</div></div>
      <div class="stat"><div class="num">${next ? next.daysToHarvest + " T" : "–"}</div><div class="lbl">nächste Ernte (Tage)</div></div>
      <div class="stat"><div class="num">${App.notes.length}</div><div class="lbl">Notizen / Erfahrungen</div></div>
    </div>
    ${App.fields.length === 0
      ? `<div class="empty"><div class="big">🌾</div><p>Noch keine Felder angelegt.</p><button class="btn" id="dash-add2">Erstes Feld anlegen</button></div>`
      : `<div class="grid cols-2" id="dash-cards"></div>`}
  `;
  $("#dash-add") && ($("#dash-add").onclick = () => fieldForm());
  $("#dash-add2") && ($("#dash-add2").onclick = () => fieldForm());

  const wrap = $("#dash-cards");
  if (wrap) App.fields.forEach(f => wrap.appendChild(fieldSummaryCard(f)));
}

function fieldSummaryCard(f) {
  const g = computeGrowth(f);
  const c = CROPS[f.crop];
  const div = document.createElement("div");
  div.className = "card";
  div.innerHTML = `
    <div class="card-body">
      <div class="flex-between">
        <h3>${esc(f.name)}</h3>
        <span class="badge crop">${c?.icon || "🌱"} ${esc(cropParams(f).name)}</span>
      </div>
      <p class="meta">📍 ${esc(f.locationName || "kein Standort")} ${f.areaHa ? "· " + f.areaHa + " ha" : ""}</p>
      <p class="meta">Aussaat: ${fmtDate(f.sowDate)}</p>
      ${g ? phenologyBlock(g) : `<p class="muted" style="font-size:.85rem">Noch keine Prognose – Wetterdaten laden.</p>
        <button class="btn small" data-refresh="${f.id}">Prognose berechnen</button>`}
    </div>`;
  const rb = div.querySelector("[data-refresh]");
  if (rb) rb.onclick = async () => { rb.textContent = "lädt…"; await refreshWeather(f); await reload(); };
  div.querySelector("h3").style.cursor = "pointer";
  div.querySelector("h3").onclick = () => { switchTab("fields"); setTimeout(() => fieldDetail(f.id), 50); };
  return div;
}

function phenologyBlock(g) {
  const pct = Math.round(g.frac * 100);
  const chips = g.params.stages.map(s => {
    const cls = s === g.stage ? "current" : (g.frac > s.upTo ? "done" : "");
    return `<span class="stage-chip ${cls}">${esc(s.name)}</span>`;
  }).join("");
  return `
    <div style="margin-top:8px">
      <div class="flex-between" style="font-size:.84rem;margin-bottom:4px">
        <strong>${esc(g.stage.name)}</strong>
        <span class="muted">BBCH ${g.stage.bbch} · ${pct}%</span>
      </div>
      <div class="progress"><span style="width:${pct}%"></span></div>
      <div class="row" style="margin-top:8px">
        <div><span class="muted" style="font-size:.78rem">Wärmesumme</span><br><strong>${g.gdd} / ${g.params.gddTarget} °Cd</strong></div>
        <div><span class="muted" style="font-size:.78rem">Ernteprognose</span><br>
          <strong>${g.daysToHarvest === 0 ? "erntereif!" : fmtDate(g.predDate)}</strong>
          ${g.daysToHarvest > 0 ? `<span class="muted"> (${g.daysToHarvest} T)</span>` : ""}</div>
      </div>
      <div class="stage-list">${chips}</div>
    </div>`;
}

/* ---------- Felder & Kulturen ---------- */
function renderFields() {
  const v = $("#view-fields");
  v.innerHTML = `
    <div class="view-head">
      <div><h2>Felder &amp; Kulturen</h2><p class="lead">Lege Schläge an: Kultur, Standort, Aussaat, Fotos und deine Erfahrungen.</p></div>
      <button class="btn" id="f-add">＋ Feld anlegen</button>
    </div>
    ${App.fields.length === 0
      ? `<div class="empty"><div class="big">📋</div><p>Noch keine Felder.</p></div>`
      : `<div class="grid cols-2" id="f-cards"></div>`}
  `;
  $("#f-add").onclick = () => fieldForm();
  const wrap = $("#f-cards");
  if (wrap) App.fields.forEach(async f => {
    const card = document.createElement("div");
    card.className = "card field-card";
    const photos = await DB.byIndex("photos", "fieldId", f.id);
    const cover = photos[0] ? `style="background-image:url('${photoURL(photos[0])}')"` : "";
    const c = CROPS[f.crop];
    card.innerHTML = `
      <div class="photo" ${cover}>${photos[0] ? "" : (c?.icon || "🌱")}</div>
      <div class="card-body">
        <div class="flex-between"><h3>${esc(f.name)}</h3><span class="badge crop">${esc(cropParams(f).name)}</span></div>
        <p class="meta">📍 ${esc(f.locationName || "–")} ${f.areaHa ? "· " + f.areaHa + " ha" : ""}</p>
        <p class="meta">🌱 Aussaat ${fmtDate(f.sowDate)} ${photos.length ? "· 📷 " + photos.length : ""}</p>
        <div class="row" style="margin-top:10px">
          <button class="btn small" data-detail>Öffnen</button>
          <button class="btn small ghost" data-edit>Bearbeiten</button>
        </div>
      </div>`;
    card.querySelector("[data-detail]").onclick = () => fieldDetail(f.id);
    card.querySelector("[data-edit]").onclick = () => fieldForm(f);
    wrap.appendChild(card);
  });
}

function fieldForm(field) {
  const f = field || {};
  const cropOpts = Object.entries(CROPS).map(([k, c]) =>
    `<option value="${k}" ${f.crop === k ? "selected" : ""}>${c.name}</option>`).join("") +
    `<option value="custom" ${f.crop === "custom" ? "selected" : ""}>Eigene Kultur …</option>`;
  openModal(`
    <h2>${field ? "Feld bearbeiten" : "Neues Feld"}</h2>
    <label>Name des Feldes / Schlags</label>
    <input id="ff-name" value="${esc(f.name || "")}" placeholder="z. B. Hofacker Nord" />
    <div class="row">
      <div><label>Kultur</label><select id="ff-crop">${cropOpts}</select></div>
      <div><label>Fläche (ha)</label><input id="ff-area" type="number" step="0.01" value="${f.areaHa ?? ""}" /></div>
    </div>
    <div id="ff-custom" style="display:${f.crop === "custom" ? "block" : "none"}">
      <label>Name eigene Kultur</label><input id="ff-customname" value="${esc(f.customCropName || "")}" />
    </div>
    <label>Standort suchen (Ort)</label>
    <div class="row">
      <input id="ff-place" value="${esc(f.locationName || "")}" placeholder="z. B. Bozen, Brixen, Meran …" style="flex:3" />
      <button class="btn" id="ff-geo" type="button" style="flex:1">🔍 Suchen</button>
    </div>
    <div id="ff-geo-results"></div>
    <label>Auf der Karte anklicken (Marker ist verschiebbar)</label>
    <div id="ff-map" class="map-pick"></div>
    <p class="hint">Standard-Kartenausschnitt: ${esc(MAP_DEFAULT.region)}. Klick setzt Koordinaten &amp; Ortsname automatisch.</p>
    <div class="row">
      <div><label>Breite (lat)</label><input id="ff-lat" type="number" step="0.0001" value="${f.lat ?? ""}" /></div>
      <div><label>Länge (lon)</label><input id="ff-lon" type="number" step="0.0001" value="${f.lon ?? ""}" /></div>
    </div>
    <input type="hidden" id="ff-country" value="${esc(f.country || "")}" />
    <label>Aussaatdatum</label>
    <input id="ff-sow" type="date" value="${f.sowDate || ""}" />
    <div class="row">
      <div><label>Einstellung Sämaschine (kg/ha)</label>
        <input id="ff-seedrate" type="number" step="0.1" value="${f.seedRateKgHa ?? ""}" placeholder="z. B. 160" /></div>
    </div>
    <label>Einsaatmenge je Jahr (kg) – Historie</label>
    <div id="ff-seedhist"></div>
    <button class="btn small ghost" id="ff-addseed" type="button" style="margin-top:6px">＋ Jahr hinzufügen</button>
    <p class="hint">z. B. 2025: 30 kg, 2026: 35 kg – so bleibt die Historie der Einsaatmengen erhalten.</p>
    <label>Foto(s) vom Feld</label>
    <input type="file" id="ff-photos" accept="image/*" multiple />
    <div id="ff-photo-info" class="hint"></div>
    <details style="margin-top:12px">
      <summary class="muted" style="cursor:pointer">Erweitert: Modellparameter (Temperatursummen)</summary>
      <div class="row">
        <div><label>Basistemperatur (°C)</label><input id="ff-base" type="number" step="0.5" value="${f.baseTemp ?? ""}" placeholder="aus Kultur"/></div>
        <div><label>Ziel-Wärmesumme (°Cd)</label><input id="ff-gdd" type="number" value="${f.gddToMaturity ?? ""}" placeholder="aus Kultur"/></div>
      </div>
      <p class="hint">Leer lassen = Standardwerte der gewählten Kultur. Anpassen, wenn du eigene Erfahrungswerte hast.</p>
    </details>
    <label>Notizen / Erfahrungen</label>
    <textarea id="ff-notes" placeholder="Bodenart, Vorfrucht, Sorte, Düngung, Beobachtungen …">${esc(f.notes || "")}</textarea>
    <hr class="sep" />
    <div class="flex-between">
      ${field ? `<button class="btn danger" id="ff-del">Löschen</button>` : "<span></span>"}
      <div class="row"><button class="btn ghost" id="ff-cancel">Abbrechen</button><button class="btn" id="ff-save">Speichern</button></div>
    </div>
  `);
  // --- Karte initialisieren ---
  const onMapPick = async (lat, lon) => {
    $("#ff-lat").value = lat.toFixed(4); $("#ff-lon").value = lon.toFixed(4);
    const rev = await reverseGeocode(lat, lon);
    if (rev) { if (rev.name) $("#ff-place").value = rev.name; if (rev.country) $("#ff-country").value = rev.country; }
  };
  if (window.L) initPickMap(f.lat ?? null, f.lon ?? null, onMapPick);

  $("#ff-crop").onchange = (e) => { $("#ff-custom").style.display = e.target.value === "custom" ? "block" : "none"; };
  $("#ff-cancel").onclick = closeModal;

  // --- Einsaatmengen-Historie (Jahr + kg) ---
  const seedRow = (year = "", kg = "") => {
    const d = document.createElement("div");
    d.className = "row seed-row";
    d.innerHTML = `
      <input type="number" class="sh-year" placeholder="Jahr" min="2000" max="2100" value="${year}" style="flex:1" />
      <input type="number" class="sh-kg" placeholder="kg" step="0.1" value="${kg}" style="flex:1" />
      <button type="button" class="btn small ghost sh-del" style="flex:0;min-width:auto">×</button>`;
    d.querySelector(".sh-del").onclick = () => d.remove();
    $("#ff-seedhist").appendChild(d);
  };
  (f.seedHistory || []).forEach(s => seedRow(s.year, s.kg));
  if (!(f.seedHistory || []).length) {
    const y = f.sowDate ? new Date(f.sowDate).getFullYear() : new Date().getFullYear();
    seedRow(y, "");
  }
  $("#ff-addseed").onclick = () => seedRow(new Date().getFullYear() + (field ? 1 : 0), "");
  $("#ff-photos").onchange = (e) => {
    $("#ff-photo-info").textContent = e.target.files.length
      ? `${e.target.files.length} Foto(s) ausgewählt – werden beim Speichern hinzugefügt.` : "";
  };
  $("#ff-geo").onclick = async () => {
    const q = $("#ff-place").value.trim(); if (!q) return;
    $("#ff-geo-results").innerHTML = `<p class="muted">Suche …</p>`;
    try {
      const res = await geocode(q);
      if (!res.length) { $("#ff-geo-results").innerHTML = `<p class="muted">Kein Ort gefunden.</p>`; return; }
      $("#ff-geo-results").innerHTML = res.map((r, i) =>
        `<button type="button" class="btn ghost small" data-geo="${i}" style="margin:4px 4px 0 0">
          ${esc(r.name)}${r.admin1 ? ", " + esc(r.admin1) : ""} (${esc(r.country)})</button>`).join("");
      $$("[data-geo]", $("#ff-geo-results")).forEach(b => b.onclick = () => {
        const r = res[+b.dataset.geo];
        $("#ff-lat").value = r.lat.toFixed(4); $("#ff-lon").value = r.lon.toFixed(4);
        $("#ff-place").value = r.name; $("#ff-country").value = r.country;
        $("#ff-geo-results").innerHTML = `<p class="muted">✓ ${esc(r.name)}, ${esc(r.country)} übernommen.</p>`;
        if (_pickMap) { _pickMap.setView([r.lat, r.lon], 13); placePickMarker(r.lat, r.lon, onMapPick); }
      });
    } catch (e) { $("#ff-geo-results").innerHTML = `<p class="muted">Fehler: ${esc(e.message)}</p>`; }
  };
  $("#ff-save").onclick = async () => {
    const obj = field ? { ...field } : { id: uid(), createdAt: Date.now() };
    obj.name = $("#ff-name").value.trim() || "Unbenannt";
    obj.crop = $("#ff-crop").value;
    obj.customCropName = $("#ff-customname")?.value.trim() || "";
    obj.areaHa = parseFloat($("#ff-area").value) || null;
    obj.locationName = $("#ff-place").value.trim();
    obj.country = $("#ff-country").value;
    obj.lat = parseFloat($("#ff-lat").value) || null;
    obj.lon = parseFloat($("#ff-lon").value) || null;
    obj.sowDate = $("#ff-sow").value || null;
    obj.baseTemp = $("#ff-base").value !== "" ? parseFloat($("#ff-base").value) : null;
    obj.gddToMaturity = $("#ff-gdd").value !== "" ? parseFloat($("#ff-gdd").value) : null;
    obj.seedRateKgHa = $("#ff-seedrate").value !== "" ? parseFloat($("#ff-seedrate").value) : null;
    obj.seedHistory = $$(".seed-row", $("#ff-seedhist")).map(r => ({
      year: parseInt(r.querySelector(".sh-year").value, 10) || null,
      kg: r.querySelector(".sh-kg").value !== "" ? parseFloat(r.querySelector(".sh-kg").value) : null
    })).filter(s => s.year && s.kg != null).sort((a, b) => a.year - b.year);
    obj.notes = $("#ff-notes").value.trim();
    // bei Standort-/Aussaatänderung Cache verwerfen
    if (field && (field.lat !== obj.lat || field.lon !== obj.lon || field.sowDate !== obj.sowDate)) obj.weatherCache = null;
    await DB.put("fields", obj);
    const photoFiles = $("#ff-photos").files;
    if (photoFiles.length) await addPhotos(obj.id, photoFiles);
    closeModal(); await reload();
    toast("Gespeichert ✓");
  };
  if ($("#ff-del")) $("#ff-del").onclick = async () => {
    if (!confirm("Feld wirklich löschen? Auch zugehörige Fotos werden entfernt.")) return;
    const photos = await DB.byIndex("photos", "fieldId", field.id);
    for (const p of photos) await DB.del("photos", p.id);
    await DB.del("fields", field.id); closeModal(); await reload(); toast("Gelöscht");
  };
}

async function fieldDetail(id) {
  const f = await DB.get("fields", id);
  const g = computeGrowth(f);
  const photos = await DB.byIndex("photos", "fieldId", id);
  const c = CROPS[f.crop];
  openModal(`
    <div class="flex-between">
      <h2 style="margin:0">${c?.icon || "🌱"} ${esc(f.name)}</h2>
      <button class="btn small ghost" id="fd-edit">Bearbeiten</button>
    </div>
    <p class="meta muted">${esc(cropParams(f).name)} · 📍 ${esc(f.locationName || "–")} ${f.areaHa ? "· " + f.areaHa + " ha" : ""}</p>
    <p class="meta">Aussaat: <strong>${fmtDate(f.sowDate)}</strong> ${c ? `· Typ: ${esc(c.type)}` : ""}
      ${f.seedRateKgHa ? `· Sämaschine: <strong>${f.seedRateKgHa} kg/ha</strong>` : ""}</p>
    ${c ? `<p class="hint">Aussaatfenster ${esc(c.sowWindow)} · typ. Ernte ${esc(c.harvestWindow)}</p>` : ""}
    ${(f.seedHistory || []).length ? `<p class="meta">🌾 Einsaatmengen: ${f.seedHistory.map(s => `${s.year}: <strong>${s.kg} kg</strong>`).join(" · ")}</p>` : ""}
    <hr class="sep"/>
    <div class="flex-between"><h3 style="margin:0">Reife &amp; Ernteprognose</h3>
      <button class="btn small" id="fd-refresh">↻ Wetter aktualisieren</button></div>
    <div id="fd-pheno">${g ? phenologyBlock(g) +
      `<p class="hint">Stand der Wetterdaten: ${new Date(g.lastUpdate).toLocaleString("de-DE")}</p>`
      : `<p class="muted">Noch keine Wetterdaten. Klick „Wetter aktualisieren“.</p>`}</div>
    <hr class="sep"/>
    <h3>Fotos</h3>
    <input type="file" id="fd-photo" accept="image/*" multiple />
    <div class="photo-thumbs" id="fd-thumbs">
      ${photos.map(p => `<div class="thumb" style="background-image:url('${photoURL(p)}')"><button data-delp="${p.id}">×</button></div>`).join("") || `<span class="muted">Noch keine Fotos.</span>`}
    </div>
    <hr class="sep"/>
    <div class="flex-between"><h3 style="margin:0">Ernte-Chronik</h3>
      <button class="btn small" id="fd-harvest">＋ Ernte erfassen</button></div>
    <div id="fd-harvests" style="margin-top:8px"></div>
    <hr class="sep"/>
    <h3>Notizen</h3>
    <p style="white-space:pre-wrap">${esc(f.notes) || "<span class='muted'>–</span>"}</p>
  `);
  const hs = App.harvests.filter(x => x.fieldId === id).sort((a, b) => (b.harvestDate || "").localeCompare(a.harvestDate || ""));
  $("#fd-harvests").innerHTML = hs.length ? hs.map(hh => {
    const veg = (hh.sowDate && hh.harvestDate) ? daysBetween(hh.sowDate, hh.harvestDate) + " T" : "–";
    return `<div class="note-item"><div class="flex-between"><strong>Ernte ${new Date(hh.harvestDate).getFullYear()}: ${fmtDate(hh.harvestDate)}</strong>
      <button class="btn small ghost" data-delfh="${hh.id}">×</button></div>
      <div class="date">Veg.-dauer ${veg}${harvestYieldText(hh) ? " · " + harvestYieldText(hh) : ""}</div>
      ${hh.note ? `<div style="font-size:.88rem">${esc(hh.note)}</div>` : ""}</div>`;
  }).join("") : `<p class="muted" style="font-size:.88rem">Noch keine Ernte erfasst.</p>`;
  $("#fd-harvest").onclick = () => harvestForm(id);
  $$("[data-delfh]").forEach(b => b.onclick = async () => { await DB.del("harvests", b.dataset.delfh); await loadAll(); fieldDetail(id); });
  $("#fd-edit").onclick = () => fieldForm(f);
  $("#fd-refresh").onclick = async () => {
    $("#fd-pheno").innerHTML = `<p class="muted">Lädt Wetterdaten …</p>`;
    await refreshWeather(f);
    const nf = await DB.get("fields", id); const ng = computeGrowth(nf);
    $("#fd-pheno").innerHTML = ng ? phenologyBlock(ng) : `<p class="muted">Keine Prognose möglich.</p>`;
    await loadAll();
  };
  $("#fd-photo").onchange = async (e) => {
    await addPhotos(id, e.target.files);
    fieldDetail(id); await loadAll();
  };
  $$("[data-delp]").forEach(b => b.onclick = async () => { await DB.del("photos", b.dataset.delp); fieldDetail(id); });
}

/* ---------- Wetter & Prognose ---------- */
function renderWeather() {
  const v = $("#view-weather");
  if (!App.fields.length) {
    v.innerHTML = `<div class="view-head"><div><h2>Wetter &amp; Prognose</h2></div></div>
      <div class="empty"><div class="big">🌦️</div><p>Lege zuerst ein Feld mit Standort an.</p></div>`; return;
  }
  const opts = App.fields.map(f => `<option value="${f.id}">${esc(f.name)} – ${esc(cropParams(f).name)}</option>`).join("");
  v.innerHTML = `
    <div class="view-head"><div><h2>Wetter &amp; Prognose</h2>
      <p class="lead">Vergangene Witterung, aktuelle Vorhersage und der Verlauf der Wärmesumme.</p></div>
      <select id="w-sel" style="max-width:300px">${opts}</select></div>
    <div id="w-body"></div>`;
  $("#w-sel").onchange = () => weatherPanel($("#w-sel").value);
  weatherPanel(App.fields[0].id);
}

async function weatherPanel(id) {
  const f = App.fields.find(x => x.id === id);
  const body = $("#w-body");
  if (!f.weatherCache) {
    body.innerHTML = `<div class="card"><div class="card-body">
      <p>Noch keine Wetterdaten geladen.</p>
      <button class="btn" id="w-load">↻ Wetterdaten laden</button></div></div>`;
    $("#w-load").onclick = async () => { body.innerHTML = `<p class="muted">Lädt …</p>`; await refreshWeather(f); await loadAll(); weatherPanel(id); };
    return;
  }
  const g = computeGrowth(f);
  const series = f.weatherCache.series;
  const today = todayISO();
  const future = series.filter(d => d.date >= today).slice(0, 12);

  body.innerHTML = `
    <div class="grid cols-2">
      <div class="card"><div class="card-body">
        <h3>Aktueller Stand</h3>
        ${g ? phenologyBlock(g) : ""}
      </div></div>
      <div class="card"><div class="card-body">
        <h3>Vorhersage (16 Tage)</h3>
        <div class="weather-days">${future.map(d => `
          <div class="wday"><div class="d">${new Date(d.date).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" })}</div>
            <div class="ic">${wIcon(d.code)}</div>
            <div class="t">${d.tmax != null ? Math.round(d.tmax) + "°" : "–"}</div>
            <div class="t tmin">${d.tmin != null ? Math.round(d.tmin) + "°" : ""}</div>
            <div class="d">${d.prcp != null ? d.prcp.toFixed(1) + " mm" : ""}</div>
          </div>`).join("")}</div>
      </div></div>
    </div>
    <div class="card" style="margin-top:16px"><div class="card-body">
      <h3>Temperatur &amp; Niederschlag (Verlauf)</h3>
      <canvas id="w-canvas" height="240"></canvas>
    </div></div>
    <div class="card" style="margin-top:16px"><div class="card-body">
      <h3>Wärmesumme seit Aussaat (°Cd)</h3>
      <canvas id="g-canvas" height="200"></canvas>
      <p class="hint">Linie = aufsummierte Tagesgrade; gestrichelte Linie = Zielwert für Erntereife (${g?.params.gddTarget ?? "–"} °Cd).</p>
    </div></div>
    <div style="margin-top:14px"><button class="btn ghost" id="w-refresh">↻ Aktualisieren</button></div>
  `;
  $("#w-refresh").onclick = async () => { await refreshWeather(f); await loadAll(); weatherPanel(id); };
  drawTempChart($("#w-canvas"), series.slice(-75));
  if (g) drawGddChart($("#g-canvas"), g.gddSeries, g.params.gddTarget);
}

function setupCanvas(cv) {
  const ratio = window.devicePixelRatio || 1;
  const w = cv.clientWidth || 600, h = cv.height;
  cv.width = w * ratio; cv.height = h * ratio;
  const ctx = cv.getContext("2d"); ctx.scale(ratio, ratio);
  return { ctx, w, h };
}

function drawTempChart(cv, data) {
  const { ctx, w, h } = setupCanvas(cv);
  const pad = { l: 34, r: 12, t: 12, b: 22 };
  const temps = data.flatMap(d => [d.tmax, d.tmin]).filter(x => x != null);
  if (!temps.length) return;
  const tMin = Math.min(...temps, 0), tMax = Math.max(...temps, 5);
  const prcps = data.map(d => d.prcp ?? 0); const pMax = Math.max(...prcps, 5);
  const X = i => pad.l + (i / (data.length - 1)) * (w - pad.l - pad.r);
  const Y = t => pad.t + (1 - (t - tMin) / (tMax - tMin)) * (h - pad.t - pad.b);
  // Achsen
  ctx.strokeStyle = "rgba(255,255,255,.08)"; ctx.lineWidth = 1; ctx.fillStyle = "#93a4c4"; ctx.font = "10px Segoe UI";
  for (let k = 0; k <= 4; k++) {
    const t = tMin + (k / 4) * (tMax - tMin); const y = Y(t);
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
    ctx.fillText(Math.round(t) + "°", 4, y + 3);
  }
  // Niederschlag (Balken)
  ctx.fillStyle = "rgba(56,189,248,.30)";
  data.forEach((d, i) => { const ph = ((d.prcp ?? 0) / pMax) * (h - pad.t - pad.b) * 0.5; ctx.fillRect(X(i) - 1.5, h - pad.b - ph, 3, ph); });
  // tmax / tmin Linien
  const line = (key, col) => {
    ctx.strokeStyle = col; ctx.lineWidth = 1.8; ctx.beginPath();
    let started = false;
    data.forEach((d, i) => { if (d[key] == null) return; const x = X(i), y = Y(d[key]); started ? ctx.lineTo(x, y) : ctx.moveTo(x, y); started = true; });
    ctx.stroke();
  };
  line("tmax", "#f87171"); line("tmin", "#38bdf8");
  // heute-Markierung
  const ti = data.findIndex(d => d.date >= todayISO());
  if (ti > 0) { ctx.strokeStyle = "#4ade80"; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(X(ti), pad.t); ctx.lineTo(X(ti), h - pad.b); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = "#4ade80"; ctx.fillText("heute", X(ti) + 2, pad.t + 8); }
  // Legende
  ctx.fillStyle = "#f87171"; ctx.fillText("● Tmax", w - 110, pad.t + 4);
  ctx.fillStyle = "#38bdf8"; ctx.fillText("● Tmin", w - 60, pad.t + 4);
}

function drawGddChart(cv, gddSeries, target) {
  const { ctx, w, h } = setupCanvas(cv);
  if (!gddSeries.length) return;
  const pad = { l: 40, r: 12, t: 12, b: 22 };
  const max = Math.max(target * 1.05, gddSeries[gddSeries.length - 1].gdd);
  const X = i => pad.l + (i / Math.max(1, gddSeries.length - 1)) * (w - pad.l - pad.r);
  const Y = g => pad.t + (1 - g / max) * (h - pad.t - pad.b);
  ctx.strokeStyle = "rgba(255,255,255,.08)"; ctx.fillStyle = "#93a4c4"; ctx.font = "10px Segoe UI";
  for (let k = 0; k <= 4; k++) { const val = (k / 4) * max; const y = Y(val); ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke(); ctx.fillText(Math.round(val), 4, y + 3); }
  // Zielwert
  ctx.strokeStyle = "#fbbf24"; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.moveTo(pad.l, Y(target)); ctx.lineTo(w - pad.r, Y(target)); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = "#fbbf24"; ctx.fillText("Erntereife", w - 70, Y(target) - 4);
  // Kurve
  ctx.strokeStyle = "#4ade80"; ctx.lineWidth = 2.4; ctx.beginPath();
  gddSeries.forEach((d, i) => { const x = X(i), y = Y(d.gdd); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke();
  ctx.fillStyle = "#4ade80"; ctx.fillText(gddSeries[gddSeries.length - 1].gdd + " °Cd", X(gddSeries.length - 1) - 40, Y(gddSeries[gddSeries.length - 1].gdd) - 6);
}

/* ---------- Unkraut (Bio) ---------- */
function renderWeeds() {
  const v = $("#view-weeds");
  const all = [...WEEDS_SEED, ...App.userWeeds];
  const cropFilter = renderWeeds._crop || "all";
  const sevColor = { hoch: "danger", mittel: "warn", niedrig: "ok" };
  const cropSel = `<option value="all">alle Kulturen</option>` +
    Object.entries(CROPS).map(([k, c]) => `<option value="${k}" ${cropFilter === k ? "selected" : ""}>${c.name}</option>`).join("");
  const list = all.filter(wd => cropFilter === "all" || (wd.cropsAffected || []).includes(cropFilter));

  v.innerHTML = `
    <div class="view-head">
      <div><h2>Unkraut-Management (Bio)</h2>
      <p class="lead">Beikräuter, vorbeugende &amp; mechanische Maßnahmen und der richtige Eingriffszeitpunkt – ohne chemische Herbizide.</p></div>
      <button class="btn" id="weed-add">＋ Eigenes Beikraut</button>
    </div>
    <div class="card" style="margin-bottom:16px"><div class="card-body">
      <h3>🪶 Striegel- &amp; Hack-Faustregeln</h3>
      <ul class="organic-list">${HOEING_RULES.map(r => `<li>${esc(r)}</li>`).join("")}</ul>
    </div></div>
    <div class="row" style="margin-bottom:14px"><div style="max-width:280px">
      <label>Nach Kultur filtern</label><select id="weed-filter">${cropSel}</select></div></div>
    <div class="grid cols-2" id="weed-cards"></div>
  `;
  $("#weed-filter").onchange = (e) => { renderWeeds._crop = e.target.value; renderWeeds(); };
  $("#weed-add").onclick = () => weedForm();
  const wrap = $("#weed-cards");
  list.forEach(wd => {
    const div = document.createElement("div");
    div.className = "card weed-card";
    const isUser = App.userWeeds.includes(wd);
    div.innerHTML = `
      <div class="card-body">
        <div class="flex-between">
          <h3>${esc(wd.name)}</h3>
          <span class="badge ${sevColor[wd.severity] || ""}">${esc(wd.severity || "")}</span>
        </div>
        <p class="meta"><em>${esc(wd.latin || "")}</em> · ${esc(wd.kind || "")}</p>
        <p style="font-size:.86rem"><strong>⏱ Eingriffszeitpunkt:</strong> ${esc(wd.timing || "")}</p>
        <strong style="font-size:.85rem">Bio-Maßnahmen:</strong>
        <ul class="organic-list">${(wd.organic || []).map(o => `<li>${esc(o)}</li>`).join("")}</ul>
        ${wd.note ? `<p class="hint">ℹ️ ${esc(wd.note)}</p>` : ""}
        ${(wd.cropsAffected || []).length ? `<div style="margin-top:6px">${wd.cropsAffected.map(k => `<span class="tag">${esc(CROPS[k]?.name || k)}</span>`).join("")}</div>` : ""}
        ${isUser ? `<div style="margin-top:8px"><button class="btn small ghost" data-deletew="${wd.id}">Löschen</button></div>` : ""}
      </div>`;
    if (isUser) div.querySelector("[data-deletew]").onclick = async () => { await DB.del("weeds", wd.id); await loadAll(); renderWeeds(); };
    wrap.appendChild(div);
  });
}

function weedForm() {
  const cropChecks = Object.entries(CROPS).map(([k, c]) =>
    `<label style="font-weight:400;display:inline-flex;gap:5px;margin-right:10px"><input type="checkbox" style="width:auto" value="${k}" class="wf-crop"/> ${c.name}</label>`).join("");
  openModal(`
    <h2>Eigenes Beikraut hinzufügen</h2>
    <label>Name</label><input id="wf-name" />
    <div class="row">
      <div><label>Lat. Name</label><input id="wf-latin" /></div>
      <div><label>Art</label><input id="wf-kind" placeholder="z. B. zweikeimblättrig / Ungras" /></div>
    </div>
    <label>Problemstärke</label>
    <select id="wf-sev"><option value="niedrig">niedrig</option><option value="mittel" selected>mittel</option><option value="hoch">hoch</option></select>
    <label>Eingriffszeitpunkt</label><textarea id="wf-timing"></textarea>
    <label>Bio-Maßnahmen (eine pro Zeile)</label><textarea id="wf-organic"></textarea>
    <label>Betroffene Kulturen</label><div style="margin-top:4px">${cropChecks}</div>
    <label>Hinweis</label><input id="wf-note" />
    <hr class="sep"/>
    <div class="row"><button class="btn ghost" id="wf-cancel">Abbrechen</button><button class="btn" id="wf-save">Speichern</button></div>
  `);
  $("#wf-cancel").onclick = closeModal;
  $("#wf-save").onclick = async () => {
    const obj = {
      id: uid(), name: $("#wf-name").value.trim() || "Unbenannt", latin: $("#wf-latin").value.trim(),
      kind: $("#wf-kind").value.trim(), severity: $("#wf-sev").value, timing: $("#wf-timing").value.trim(),
      organic: $("#wf-organic").value.split("\n").map(s => s.trim()).filter(Boolean),
      cropsAffected: $$(".wf-crop").filter(c => c.checked).map(c => c.value), note: $("#wf-note").value.trim()
    };
    await DB.put("weeds", obj); closeModal(); await loadAll(); renderWeeds(); toast("Beikraut gespeichert ✓");
  };
}

/* ---------- Krankheiten & Schädlinge (Bio) ---------- */
function renderDiseases() {
  const v = $("#view-diseases");
  const all = [...DISEASES_SEED, ...App.userDiseases];
  const cropFilter = renderDiseases._crop || "all";
  const sevColor = { hoch: "danger", mittel: "warn", niedrig: "ok" };
  const typeColor = { "Schädling": "info" };
  const cropSel = `<option value="all">alle Kulturen</option>` +
    Object.entries(CROPS).map(([k, c]) => `<option value="${k}" ${cropFilter === k ? "selected" : ""}>${c.name}</option>`).join("");
  const list = all.filter(d => cropFilter === "all" || (d.cropsAffected || []).includes(cropFilter));

  v.innerHTML = `
    <div class="view-head">
      <div><h2>Krankheiten &amp; Schädlinge</h2>
      <p class="lead">Erkennen, begünstigende Witterung, vorbeugende &amp; zugelassene Bio-Maßnahmen und der richtige Beobachtungs-/Eingriffszeitpunkt.</p></div>
      <button class="btn" id="dis-add">＋ Eigener Eintrag</button>
    </div>
    <div class="card" style="margin-bottom:16px"><div class="card-body">
      <h3>🛡️ Grundsätze im Bio-Pflanzenschutz</h3>
      <ul class="organic-list">
        <li><strong>Vorbeugung zuerst:</strong> resistente/robuste Sorten &amp; Sortenmischungen sind die wichtigste Stellschraube.</li>
        <li><strong>Weite Fruchtfolge</strong> unterbricht Krankheitszyklen (v. a. kein Getreide nach Mais → Fusarium).</li>
        <li><strong>Gesundes Saatgut</strong> (geprüft/zertifiziert, ggf. Warmwasser-/Heißluftbehandlung) gegen saatgutbürtige Erreger.</li>
        <li><strong>Bestandesführung:</strong> luftige, nicht überdüngte Bestände trocknen schnell ab → weniger Pilzdruck.</li>
        <li><strong>Nützlinge fördern</strong> (Blühstreifen, Hecken) reguliert Blattläuse &amp; Co. meist von selbst.</li>
      </ul>
    </div></div>
    <div class="row" style="margin-bottom:14px"><div style="max-width:280px">
      <label>Nach Kultur filtern</label><select id="dis-filter">${cropSel}</select></div></div>
    <div class="grid cols-2" id="dis-cards"></div>
  `;
  $("#dis-filter").onchange = (e) => { renderDiseases._crop = e.target.value; renderDiseases(); };
  $("#dis-add").onclick = () => diseaseForm();
  const wrap = $("#dis-cards");
  list.forEach(d => {
    const div = document.createElement("div");
    div.className = "card weed-card";
    const isUser = App.userDiseases.includes(d);
    div.innerHTML = `
      <div class="card-body">
        <div class="flex-between">
          <h3>${d.icon || "🦠"} ${esc(d.name)}</h3>
          <span class="badge ${sevColor[d.severity] || ""}">${esc(d.severity || "")}</span>
        </div>
        <p class="meta"><em>${esc(d.latin || "")}</em> · <span class="badge ${typeColor[d.type] || "warn"}">${esc(d.type || "")}</span></p>
        ${d.risk ? `<p style="font-size:.86rem"><strong>🌡️ Begünstigt durch:</strong> ${esc(d.risk)}</p>` : ""}
        <p style="font-size:.86rem"><strong>⏱ Zeitpunkt:</strong> ${esc(d.timing || "")}</p>
        <strong style="font-size:.85rem">Bio-Maßnahmen:</strong>
        <ul class="organic-list">${(d.organic || []).map(o => `<li>${esc(o)}</li>`).join("")}</ul>
        ${d.note ? `<p class="hint">ℹ️ ${esc(d.note)}</p>` : ""}
        ${(d.cropsAffected || []).length ? `<div style="margin-top:6px">${d.cropsAffected.map(k => `<span class="tag">${esc(CROPS[k]?.name || k)}</span>`).join("")}</div>` : ""}
        ${isUser ? `<div style="margin-top:8px"><button class="btn small ghost" data-deld="${d.id}">Löschen</button></div>` : ""}
      </div>`;
    if (isUser) div.querySelector("[data-deld]").onclick = async () => { await DB.del("diseases", d.id); await loadAll(); renderDiseases(); };
    wrap.appendChild(div);
  });
}

function diseaseForm() {
  const cropChecks = Object.entries(CROPS).map(([k, c]) =>
    `<label style="font-weight:400;display:inline-flex;gap:5px;margin-right:10px"><input type="checkbox" style="width:auto" value="${k}" class="df-crop"/> ${c.name}</label>`).join("");
  openModal(`
    <h2>Eigener Krankheits-/Schädlingseintrag</h2>
    <label>Name</label><input id="df-name" />
    <div class="row">
      <div><label>Lat. Name</label><input id="df-latin" /></div>
      <div><label>Typ</label><input id="df-type" placeholder="Pilz / Schädling / Virus" /></div>
    </div>
    <label>Problemstärke</label>
    <select id="df-sev"><option value="niedrig">niedrig</option><option value="mittel" selected>mittel</option><option value="hoch">hoch</option></select>
    <label>Begünstigende Witterung / Bedingungen</label><input id="df-risk" />
    <label>Beobachtungs-/Eingriffszeitpunkt</label><textarea id="df-timing"></textarea>
    <label>Bio-Maßnahmen (eine pro Zeile)</label><textarea id="df-organic"></textarea>
    <label>Betroffene Kulturen</label><div style="margin-top:4px">${cropChecks}</div>
    <label>Hinweis</label><input id="df-note" />
    <hr class="sep"/>
    <div class="row"><button class="btn ghost" id="df-cancel">Abbrechen</button><button class="btn" id="df-save">Speichern</button></div>
  `);
  $("#df-cancel").onclick = closeModal;
  $("#df-save").onclick = async () => {
    const obj = {
      id: uid(), name: $("#df-name").value.trim() || "Unbenannt", latin: $("#df-latin").value.trim(),
      type: $("#df-type").value.trim() || "–", severity: $("#df-sev").value, risk: $("#df-risk").value.trim(),
      timing: $("#df-timing").value.trim(), organic: $("#df-organic").value.split("\n").map(s => s.trim()).filter(Boolean),
      cropsAffected: $$(".df-crop").filter(c => c.checked).map(c => c.value), note: $("#df-note").value.trim(), icon: "🦠"
    };
    await DB.put("diseases", obj); closeModal(); await loadAll(); renderDiseases(); toast("Eintrag gespeichert ✓");
  };
}

/* ---------- Mehrjahresvergleich der Erntetermine ---------- */
const CROP_COLORS = ["#38bdf8", "#4ade80", "#fbbf24", "#f87171", "#a78bfa", "#f472b6", "#22d3ee"];
function cropColor(key) {
  const keys = Object.keys(CROPS).concat("custom");
  return CROP_COLORS[keys.indexOf(key) % CROP_COLORS.length] || "#93a4c4";
}
const doy = (ds) => { const d = new Date(ds); return Math.round((d - new Date(d.getFullYear(), 0, 0)) / 86400000); };
const doyToLabel = (n) => { const d = new Date(2001, 0, n); return d.toLocaleDateString("de-DE", { day: "2-digit", month: "short" }); };

function renderCompare() {
  const v = $("#view-compare");
  const hs = App.harvests.slice().sort((a, b) => (a.harvestDate || "").localeCompare(b.harvestDate || ""));
  // aktuelle Prognosen als Vergleichspunkte
  const preds = [];
  App.fields.forEach(f => { const g = computeGrowth(f); if (g && g.predDate) preds.push({ field: f, crop: f.crop, predDate: g.predDate }); });

  v.innerHTML = `
    <div class="view-head">
      <div><h2>Mehrjahresvergleich – Erntetermine</h2>
      <p class="lead">Erfasste Erntetermine je Kultur über die Jahre – erkenne Muster, vergleiche Vegetationsdauer &amp; Ertrag. Hohle Punkte = aktuelle Modellprognose.</p></div>
      <button class="btn" id="cmp-add">＋ Ernte erfassen</button>
    </div>
    ${hs.length === 0 && preds.length === 0
      ? `<div class="empty"><div class="big">📊</div><p>Noch keine Erntedaten. Erfasse eine vergangene Ernte, um Jahre zu vergleichen.</p><button class="btn" id="cmp-add2">Ernte erfassen</button></div>`
      : `
      <div class="card"><div class="card-body">
        <h3>Erntezeitpunkt nach Jahr</h3>
        <canvas id="cmp-canvas" height="260"></canvas>
        <div class="legend" id="cmp-legend"></div>
      </div></div>
      <div class="card" style="margin-top:16px"><div class="card-body">
        <h3>Ernte-Chronik</h3>
        <div style="overflow-x:auto"><table id="cmp-table"></table></div>
      </div></div>`}
  `;
  $("#cmp-add") && ($("#cmp-add").onclick = () => harvestForm());
  $("#cmp-add2") && ($("#cmp-add2").onclick = () => harvestForm());
  if (hs.length === 0 && preds.length === 0) return;

  drawHarvestChart($("#cmp-canvas"), hs, preds);
  // Legende (Kulturen)
  const usedCrops = [...new Set(hs.map(h => h.crop).concat(preds.map(p => p.crop)))];
  $("#cmp-legend").innerHTML = usedCrops.map(k =>
    `<span style="color:${cropColor(k)}">${esc(CROPS[k]?.name || k)}</span>`).join("") + `<span style="color:#93a4c4">○ = Prognose ${new Date().getFullYear()}</span>`;

  // Tabelle
  const rows = hs.map(h => {
    const f = App.fields.find(x => x.id === h.fieldId);
    const veg = (h.sowDate && h.harvestDate) ? daysBetween(h.sowDate, h.harvestDate) : null;
    return `<tr>
      <td>${new Date(h.harvestDate).getFullYear()}</td>
      <td>${esc(CROPS[h.crop]?.name || h.crop)}</td>
      <td>${esc(f?.name || h.fieldName || "–")}</td>
      <td>${fmtDate(h.sowDate)}</td>
      <td><strong>${fmtDate(h.harvestDate)}</strong></td>
      <td>${veg != null ? veg + " Tage" : "–"}</td>
      <td>${harvestYieldText(h) || "–"}</td>
      <td>${esc(h.note || "")}</td>
      <td><button class="btn small ghost" data-delh="${h.id}">×</button></td>
    </tr>`;
  }).join("");
  $("#cmp-table").innerHTML = `<thead><tr><th>Jahr</th><th>Kultur</th><th>Feld</th><th>Aussaat</th><th>Ernte</th><th>Veg.-dauer</th><th>Ertrag</th><th>Notiz</th><th></th></tr></thead><tbody>${rows}</tbody>`;
  $$("[data-delh]").forEach(b => b.onclick = async () => { await DB.del("harvests", b.dataset.delh); await loadAll(); renderCompare(); });
}

// Ertragsanzeige: neue Einträge (amountKg/yieldKgHa), alte Einträge (yieldDtHa) kompatibel
function harvestYieldText(h) {
  const kgHa = h.yieldKgHa ?? (h.yieldDtHa != null ? h.yieldDtHa * 100 : null);
  const parts = [];
  if (h.amountKg != null) parts.push(`${h.amountKg} kg gesamt`);
  if (kgHa != null) parts.push(`${Math.round(kgHa)} kg/ha`);
  return parts.join(" · ") || null;
}

function harvestForm(fieldId) {
  const fieldOpts = App.fields.map(f => `<option value="${f.id}" ${fieldId === f.id ? "selected" : ""}>${esc(f.name)} – ${esc(cropParams(f).name)}</option>`).join("");
  const preF = App.fields.find(f => f.id === fieldId);
  openModal(`
    <h2>Ernte erfassen</h2>
    ${App.fields.length ? `<label>Feld</label><select id="hf-field">${fieldOpts}</select>` : `<p class="muted">Kein Feld vorhanden – lege zuerst ein Feld an. (Du kannst trotzdem eine Ernte ohne Feldbezug erfassen.)</p>`}
    <div class="row">
      <div><label>Aussaatdatum</label><input id="hf-sow" type="date" value="${preF?.sowDate || ""}" /></div>
      <div><label>Erntedatum</label><input id="hf-harvest" type="date" value="${todayISO()}" /></div>
    </div>
    <div class="row">
      <div><label>Erntemenge gesamt (kg)</label><input id="hf-kg" type="number" step="1" placeholder="z. B. 4500" /></div>
      <div><label>Ertrag (kg/ha)</label><input id="hf-kgha" type="number" step="1" placeholder="autom. aus Fläche" /></div>
    </div>
    <p class="hint" id="hf-areahint"></p>
    <label>Notiz (Sorte, Qualität, Witterung …)</label><textarea id="hf-note"></textarea>
    <hr class="sep"/>
    <div class="row"><button class="btn ghost" id="hf-cancel">Abbrechen</button><button class="btn" id="hf-save">Speichern</button></div>
  `);
  $("#hf-cancel").onclick = closeModal;
  // kg/ha automatisch aus Gesamtmenge und Feldfläche berechnen (bleibt manuell überschreibbar)
  const currentArea = () => App.fields.find(x => x.id === $("#hf-field")?.value)?.areaHa || null;
  const updateAreaHint = () => {
    const a = currentArea();
    $("#hf-areahint").textContent = a
      ? `Fläche des Feldes: ${a} ha – kg/ha wird automatisch berechnet.`
      : "Keine Fläche am Feld hinterlegt – kg/ha bitte selbst eintragen.";
  };
  const autoKgHa = () => {
    const a = currentArea(); const kg = parseFloat($("#hf-kg").value);
    if (a && !isNaN(kg)) $("#hf-kgha").value = Math.round(kg / a);
  };
  updateAreaHint();
  $("#hf-kg").oninput = autoKgHa;
  $("#hf-field") && ($("#hf-field").onchange = () => {
    const f = App.fields.find(x => x.id === $("#hf-field").value);
    if (f && !$("#hf-sow").value) $("#hf-sow").value = f.sowDate || "";
    updateAreaHint(); autoKgHa();
  });
  $("#hf-save").onclick = async () => {
    const fid = $("#hf-field")?.value || null;
    const f = App.fields.find(x => x.id === fid);
    if (!$("#hf-harvest").value) { toast("Bitte Erntedatum angeben."); return; }
    await DB.put("harvests", {
      id: uid(), fieldId: fid, fieldName: f?.name || "", crop: f?.crop || "custom",
      sowDate: $("#hf-sow").value || null, harvestDate: $("#hf-harvest").value,
      amountKg: $("#hf-kg").value !== "" ? parseFloat($("#hf-kg").value) : null,
      yieldKgHa: $("#hf-kgha").value !== "" ? parseFloat($("#hf-kgha").value) : null,
      note: $("#hf-note").value.trim(), createdAt: Date.now()
    });
    closeModal(); await loadAll();
    if (App.tab === "compare") renderCompare(); else toast("Ernte gespeichert ✓");
    toast("Ernte gespeichert ✓");
  };
}

function drawHarvestChart(cv, harvests, preds) {
  const { ctx, w, h } = setupCanvas(cv);
  const pad = { l: 44, r: 14, t: 14, b: 26 };
  const pts = harvests.filter(x => x.harvestDate).map(x => ({ year: new Date(x.harvestDate).getFullYear(), doy: doy(x.harvestDate), crop: x.crop, pred: false }));
  const ppts = preds.map(p => ({ year: new Date(p.predDate).getFullYear(), doy: doy(p.predDate), crop: p.crop, pred: true }));
  const allPts = pts.concat(ppts);
  if (!allPts.length) return;
  const years = [...new Set(allPts.map(p => p.year))].sort();
  const yMinYear = years[0] - 0.4, yMaxYear = years[years.length - 1] + 0.4;
  const doys = allPts.map(p => p.doy);
  let dMin = Math.min(...doys) - 8, dMax = Math.max(...doys) + 8;
  if (dMax - dMin < 30) { dMin -= 15; dMax += 15; }
  const X = (yr) => pad.l + ((yr - yMinYear) / (yMaxYear - yMinYear)) * (w - pad.l - pad.r);
  const Y = (d) => pad.t + ((d - dMin) / (dMax - dMin)) * (h - pad.t - pad.b);
  // Achsen/Gitter (y = Datum)
  ctx.strokeStyle = "rgba(255,255,255,.08)"; ctx.fillStyle = "#93a4c4"; ctx.font = "10px Segoe UI";
  for (let k = 0; k <= 4; k++) { const dv = dMin + (k / 4) * (dMax - dMin); const y = Y(dv); ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke(); ctx.fillText(doyToLabel(Math.round(dv)), 2, y + 3); }
  // Jahres-Ticks
  years.forEach(yr => { ctx.fillText(yr, X(yr) - 12, h - pad.b + 16); });
  // Linien je Kultur (über Jahre) + Punkte
  const byCrop = {};
  pts.forEach(p => { (byCrop[p.crop] = byCrop[p.crop] || []).push(p); });
  Object.entries(byCrop).forEach(([crop, arr]) => {
    arr.sort((a, b) => a.year - b.year);
    ctx.strokeStyle = cropColor(crop); ctx.lineWidth = 2; ctx.beginPath();
    arr.forEach((p, i) => { const x = X(p.year), y = Y(p.doy); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke();
    arr.forEach(p => { ctx.fillStyle = cropColor(crop); ctx.beginPath(); ctx.arc(X(p.year), Y(p.doy), 5, 0, 7); ctx.fill(); });
  });
  // Prognose-Punkte (hohl)
  ppts.forEach(p => { ctx.strokeStyle = cropColor(p.crop); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(X(p.year), Y(p.doy), 6, 0, 7); ctx.stroke(); });
}

/* ---------- Daten: Export / Import / Backup ---------- */
function blobToDataURL(blob) { return new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); }); }
function dataURLToBlob(u) { const [m, b64] = u.split(","); const mime = m.match(/:(.*?);/)[1]; const bin = atob(b64); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return new Blob([a], { type: mime }); }

async function exportAll() {
  const data = {
    app: "Getreide-Wissensdatenbank", version: 2, exportedAt: new Date().toISOString(),
    fields: await DB.all("fields"), notes: await DB.all("notes"), sources: await DB.all("sources"),
    weeds: await DB.all("weeds"), diseases: await DB.all("diseases"), harvests: await DB.all("harvests"), photos: []
  };
  const photos = await DB.all("photos");
  for (const p of photos) data.photos.push({ id: p.id, fieldId: p.fieldId, name: p.name, date: p.date, dataURL: await blobToDataURL(p.blob) });
  const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
  App.lastBackup = {
    blob, filename: `getreide-backup_${todayISO()}.json`,
    createdAt: new Date(), fields: data.fields.length, photos: photos.length
  };
  toast(`Backup erstellt: ${data.fields.length} Felder, ${photos.length} Fotos ✓`);
  renderData();
}

function downloadBackup() {
  const b = App.lastBackup; if (!b) return;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(b.blob);
  a.download = b.filename;
  a.click(); URL.revokeObjectURL(a.href);
}

async function shareBackup() {
  const b = App.lastBackup; if (!b) return;
  const file = new File([b.blob], b.filename, { type: "application/json" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "Getreide-Backup", text: `Backup vom ${fmtDate(todayISO())}` });
    } catch (e) {
      if (e.name !== "AbortError") toast("Teilen fehlgeschlagen: " + e.message);
    }
  } else {
    downloadBackup();
    toast("Teilen wird auf diesem Gerät nicht unterstützt – Datei wurde stattdessen heruntergeladen.");
  }
}

async function importAll(json, mode) {
  const d = JSON.parse(json);
  if (mode === "replace") {
    for (const s of ["fields", "notes", "sources", "weeds", "diseases", "harvests", "photos"]) {
      const all = await DB.all(s); for (const x of all) await DB.del(s, x.id);
    }
  }
  for (const s of ["fields", "notes", "sources", "weeds", "diseases", "harvests"]) {
    for (const x of (d[s] || [])) await DB.put(s, x);
  }
  for (const p of (d.photos || [])) {
    if (!p.dataURL) continue;
    await DB.put("photos", { id: p.id, fieldId: p.fieldId, name: p.name, date: p.date, blob: dataURLToBlob(p.dataURL) });
  }
  await reload();
  toast("Backup importiert ✓");
}

function renderData() {
  const v = $("#view-data");
  const counts = { Felder: App.fields.length, Notizen: App.notes.length, Quellen: App.sources.length, "eig. Unkräuter": App.userWeeds.length, "eig. Krankheiten": App.userDiseases.length, Ernten: App.harvests.length };
  v.innerHTML = `
    <div class="view-head"><div><h2>Daten &amp; Backup</h2>
      <p class="lead">Sichere deine gesamte Wissensdatenbank (inkl. Fotos) als Datei oder stelle sie wieder her. Ideal für Geräte-Wechsel oder regelmäßige Sicherung.</p></div></div>
    <div class="stat-row">${Object.entries(counts).map(([k, n]) => `<div class="stat"><div class="num">${n}</div><div class="lbl">${k}</div></div>`).join("")}</div>
    <div class="grid cols-2">
      <div class="card"><div class="card-body">
        <h3>⬇️ Export / Backup</h3>
        <p>Speichert alle Felder, Notizen, Quellen, eigene Unkraut-/Krankheitseinträge, Erntedaten und Fotos in einer einzigen JSON-Datei.</p>
        <button class="btn" id="d-export">Backup erstellen</button>
        ${App.lastBackup ? `
        <div class="backup-file">
          <div class="flex-between">
            <div>📄 <strong>${esc(App.lastBackup.filename)}</strong><br>
              <span class="muted" style="font-size:.8rem">${App.lastBackup.fields} Felder · ${App.lastBackup.photos} Fotos · ${Math.round(App.lastBackup.blob.size / 1024)} kB · erstellt ${App.lastBackup.createdAt.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr</span></div>
          </div>
          <div class="row" style="margin-top:10px">
            <button class="btn small" id="d-share">📤 Teilen / Versenden</button>
            <button class="btn small ghost" id="d-download">⬇️ Herunterladen</button>
          </div>
        </div>` : ""}
      </div></div>
      <div class="card"><div class="card-body">
        <h3>⬆️ Import / Wiederherstellen</h3>
        <p>Backup-Datei einlesen. „Zusammenführen" ergänzt vorhandene Daten, „Ersetzen" löscht vorher alles.</p>
        <label>Backup-Datei (.json)</label><input type="file" id="d-file" accept="application/json,.json" />
        <div class="row" style="margin-top:10px">
          <button class="btn ghost" id="d-merge">Zusammenführen</button>
          <button class="btn danger" id="d-replace">Ersetzen</button>
        </div>
      </div></div>
    </div>
    <div class="card" style="margin-top:16px"><div class="card-body">
      <h3>🗑️ Zurücksetzen</h3>
      <p class="muted">Löscht alle in diesem Browser gespeicherten Daten unwiderruflich. Vorher am besten ein Backup erstellen.</p>
      <button class="btn danger" id="d-reset">Alle Daten löschen</button>
    </div></div>
  `;
  $("#d-export").onclick = () => exportAll();
  $("#d-share") && ($("#d-share").onclick = () => shareBackup());
  $("#d-download") && ($("#d-download").onclick = () => downloadBackup());
  const doImport = async (mode) => {
    const file = $("#d-file").files[0];
    if (!file) { toast("Bitte zuerst eine Backup-Datei wählen."); return; }
    if (mode === "replace" && !confirm("Wirklich ALLE aktuellen Daten ersetzen? Das kann nicht rückgängig gemacht werden.")) return;
    try { await importAll(await file.text(), mode); renderData(); }
    catch (e) { toast("Import fehlgeschlagen: " + e.message); }
  };
  $("#d-merge").onclick = () => doImport("merge");
  $("#d-replace").onclick = () => doImport("replace");
  $("#d-reset").onclick = async () => {
    if (!confirm("Alle Daten in diesem Browser löschen?")) return;
    for (const s of ["fields", "notes", "sources", "weeds", "diseases", "harvests", "photos"]) {
      const all = await DB.all(s); for (const x of all) await DB.del(s, x.id);
    }
    await reload(); renderData(); toast("Alle Daten gelöscht.");
  };
}

/* ---------- Erkenntnisse / Quellen ---------- */
function renderKnowledge() {
  const v = $("#view-knowledge");
  const fieldOpts = `<option value="">(allgemein)</option>` + App.fields.map(f => `<option value="${f.id}">${esc(f.name)}</option>`).join("");
  v.innerHTML = `
    <div class="view-head"><div><h2>Erkenntnisse &amp; Quellen</h2>
      <p class="lead">Halte Beobachtungen, neue Erkenntnisse und Fachquellen fest – deine wachsende Wissensbasis.</p></div></div>
    <div class="grid cols-2">
      <div class="card"><div class="card-body">
        <h3>📝 Neue Notiz / Erkenntnis</h3>
        <label>Titel</label><input id="kn-title" placeholder="z. B. Striegeltermin Hofacker" />
        <div class="row">
          <div><label>Bezug zu Feld</label><select id="kn-field">${fieldOpts}</select></div>
          <div><label>Datum</label><input id="kn-date" type="date" value="${todayISO()}" /></div>
        </div>
        <label>Inhalt</label><textarea id="kn-body" placeholder="Beobachtung, Ergebnis, Schlussfolgerung …"></textarea>
        <label>Schlagworte (Komma-getrennt)</label><input id="kn-tags" placeholder="Striegeln, Roggen, Trockenheit" />
        <div style="margin-top:10px"><button class="btn" id="kn-save">Speichern</button></div>
      </div></div>
      <div class="card"><div class="card-body">
        <h3>🔗 Quelle / Link hinzufügen</h3>
        <label>Titel</label><input id="sr-title" />
        <label>URL</label><input id="sr-url" placeholder="https://…" />
        <label>Notiz</label><input id="sr-note" />
        <div style="margin-top:10px"><button class="btn" id="sr-save">Quelle speichern</button></div>
        <hr class="sep"/>
        <h4>Empfohlene Bio-Fachquellen</h4>
        <ul class="organic-list">${CURATED_SOURCES.map(s => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a> – <span class="muted">${esc(s.note)}</span></li>`).join("")}</ul>
      </div></div>
    </div>
    <div class="card" style="margin-top:16px"><div class="card-body">
      <h3>Deine Notizen</h3><div id="kn-list"></div>
    </div></div>
    <div class="card" style="margin-top:16px"><div class="card-body">
      <h3>Deine Quellen</h3><div id="sr-list"></div>
    </div></div>
  `;
  $("#kn-save").onclick = async () => {
    const title = $("#kn-title").value.trim(); if (!title) { toast("Bitte Titel eingeben."); return; }
    await DB.put("notes", {
      id: uid(), title, fieldId: $("#kn-field").value || null, date: $("#kn-date").value,
      body: $("#kn-body").value.trim(), tags: $("#kn-tags").value.split(",").map(s => s.trim()).filter(Boolean), createdAt: Date.now()
    });
    await loadAll(); renderKnowledge(); toast("Notiz gespeichert ✓");
  };
  $("#sr-save").onclick = async () => {
    const title = $("#sr-title").value.trim(); if (!title) { toast("Bitte Titel eingeben."); return; }
    await DB.put("sources", { id: uid(), title, url: $("#sr-url").value.trim(), note: $("#sr-note").value.trim(), date: todayISO() });
    await loadAll(); renderKnowledge(); toast("Quelle gespeichert ✓");
  };
  const kl = $("#kn-list");
  kl.innerHTML = App.notes.length ? "" : `<p class="muted">Noch keine Notizen.</p>`;
  App.notes.slice().sort((a, b) => (b.date || "").localeCompare(a.date || "")).forEach(n => {
    const fld = App.fields.find(f => f.id === n.fieldId);
    const d = document.createElement("div"); d.className = "note-item";
    d.innerHTML = `<div class="flex-between"><strong>${esc(n.title)}</strong><button class="btn small ghost" data-deln="${n.id}">×</button></div>
      <div class="date">${fmtDate(n.date)} ${fld ? "· " + esc(fld.name) : ""}</div>
      <div style="white-space:pre-wrap;font-size:.9rem">${esc(n.body)}</div>
      <div>${(n.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join("")}</div>`;
    d.querySelector("[data-deln]").onclick = async () => { await DB.del("notes", n.id); await loadAll(); renderKnowledge(); };
    kl.appendChild(d);
  });
  const sl = $("#sr-list");
  sl.innerHTML = App.sources.length ? "" : `<p class="muted">Noch keine eigenen Quellen.</p>`;
  App.sources.forEach(s => {
    const d = document.createElement("div"); d.className = "note-item";
    d.innerHTML = `<div class="flex-between"><strong>${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a>` : esc(s.title)}</strong>
      <button class="btn small ghost" data-dels="${s.id}">×</button></div>
      <div style="font-size:.86rem">${esc(s.note)}</div>`;
    d.querySelector("[data-dels]").onclick = async () => { await DB.del("sources", s.id); await loadAll(); renderKnowledge(); };
    sl.appendChild(d);
  });
}

/* ---------- Blattstadien / BBCH-Infothek ---------- */
// Illustrationen als Inline-SVG (funktionieren offline, skalierbar, keine externen Bilder).
const STAGE_SVG = {
  keimung: `<svg viewBox="0 0 120 120"><rect x="0" y="86" width="120" height="34" fill="#3a2a18"/><path d="M60 86 C60 74 58 66 56 60" stroke="#7bbf5a" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M56 62 q-9 -4 -14 -1 q6 6 14 3z" fill="#8fd06a"/><circle cx="60" cy="96" r="4" fill="#e9c46a"/></svg>`,
  bestockung: `<svg viewBox="0 0 120 120"><rect x="0" y="86" width="120" height="34" fill="#3a2a18"/><g stroke="#5aa845" stroke-width="3.4" fill="none" stroke-linecap="round"><path d="M60 86 C60 60 60 46 60 36"/><path d="M60 78 C48 66 44 56 42 48"/><path d="M60 76 C72 64 78 54 80 46"/><path d="M60 82 C52 74 48 68 46 62"/><path d="M60 82 C68 74 72 68 74 62"/></g></svg>`,
  schossen: `<svg viewBox="0 0 120 120"><rect x="0" y="86" width="120" height="34" fill="#3a2a18"/><path d="M60 86 L60 24" stroke="#4f9a3f" stroke-width="5" stroke-linecap="round"/><path d="M60 60 q-18 -6 -26 -18" stroke="#6cbb52" stroke-width="3.4" fill="none" stroke-linecap="round"/><path d="M60 48 q18 -6 26 -18" stroke="#6cbb52" stroke-width="3.4" fill="none" stroke-linecap="round"/><ellipse cx="60" cy="52" rx="7" ry="11" fill="#8fd06a" opacity=".6"/></svg>`,
  aehrenschieben: `<svg viewBox="0 0 120 120"><rect x="0" y="86" width="120" height="34" fill="#3a2a18"/><path d="M60 86 L60 30" stroke="#4f9a3f" stroke-width="5" stroke-linecap="round"/><g fill="#9bd66f"><ellipse cx="60" cy="24" rx="6" ry="12"/><ellipse cx="52" cy="34" rx="4" ry="8"/><ellipse cx="68" cy="34" rx="4" ry="8"/><ellipse cx="53" cy="46" rx="4" ry="8"/><ellipse cx="67" cy="46" rx="4" ry="8"/></g></svg>`,
  bluete: `<svg viewBox="0 0 120 120"><rect x="0" y="86" width="120" height="34" fill="#3a2a18"/><path d="M60 86 L60 30" stroke="#5a9a45" stroke-width="5" stroke-linecap="round"/><g fill="#c7e59a"><ellipse cx="60" cy="24" rx="6" ry="12"/><ellipse cx="52" cy="34" rx="4" ry="8"/><ellipse cx="68" cy="34" rx="4" ry="8"/><ellipse cx="53" cy="46" rx="4" ry="8"/><ellipse cx="67" cy="46" rx="4" ry="8"/></g><g stroke="#e9c46a" stroke-width="1.6"><path d="M50 30 l-7 3"/><path d="M70 30 l7 3"/><path d="M49 42 l-7 3"/><path d="M71 42 l7 3"/></g></svg>`,
  milchreife: `<svg viewBox="0 0 120 120"><rect x="0" y="86" width="120" height="34" fill="#3a2a18"/><path d="M64 86 C60 60 58 44 60 28" stroke="#a9b84a" stroke-width="5" fill="none" stroke-linecap="round"/><g fill="#d9d15e"><ellipse cx="60" cy="24" rx="6" ry="12"/><ellipse cx="52" cy="34" rx="4.5" ry="9"/><ellipse cx="68" cy="34" rx="4.5" ry="9"/><ellipse cx="53" cy="47" rx="4.5" ry="9"/><ellipse cx="67" cy="47" rx="4.5" ry="9"/></g><g stroke="#c9b84a" stroke-width="1.4"><path d="M60 14 l0 -8"/><path d="M52 24 l-4 -8"/><path d="M68 24 l4 -8"/></g></svg>`,
  teigreife: `<svg viewBox="0 0 120 120"><rect x="0" y="86" width="120" height="34" fill="#3a2a18"/><path d="M66 86 C58 58 56 42 62 26" stroke="#c6a53e" stroke-width="5" fill="none" stroke-linecap="round"/><g fill="#e5b84e"><ellipse cx="62" cy="24" rx="6" ry="12"/><ellipse cx="54" cy="34" rx="5" ry="9"/><ellipse cx="70" cy="34" rx="5" ry="9"/><ellipse cx="55" cy="47" rx="5" ry="9"/><ellipse cx="69" cy="47" rx="5" ry="9"/></g><g stroke="#caa23a" stroke-width="1.4"><path d="M62 14 l0 -8"/><path d="M54 24 l-4 -8"/><path d="M70 24 l4 -8"/></g></svg>`,
  vollreife: `<svg viewBox="0 0 120 120"><rect x="0" y="86" width="120" height="34" fill="#3a2a18"/><path d="M72 86 C58 60 54 42 66 22" stroke="#b98a2e" stroke-width="5" fill="none" stroke-linecap="round"/><g fill="#e0a636"><ellipse cx="68" cy="20" rx="6" ry="12" transform="rotate(12 68 20)"/><ellipse cx="59" cy="30" rx="5" ry="9" transform="rotate(12 59 30)"/><ellipse cx="75" cy="30" rx="5" ry="9" transform="rotate(12 75 30)"/><ellipse cx="60" cy="44" rx="5" ry="9" transform="rotate(12 60 44)"/><ellipse cx="74" cy="44" rx="5" ry="9" transform="rotate(12 74 44)"/></g><g stroke="#c68f2c" stroke-width="1.4"><path d="M68 8 l3 -8"/><path d="M58 20 l-4 -8"/><path d="M78 20 l4 -8"/></g></svg>`,
  buchweizen_jung: `<svg viewBox="0 0 120 120"><rect x="0" y="86" width="120" height="34" fill="#3a2a18"/><path d="M60 86 L60 40" stroke="#c0574a" stroke-width="3.5" stroke-linecap="round"/><g fill="#6cbb52"><path d="M60 58 q-16 -10 -24 -4 q10 12 24 6z"/><path d="M60 48 q16 -10 24 -4 q-10 12 -24 6z"/></g></svg>`,
  buchweizen_bluete: `<svg viewBox="0 0 120 120"><rect x="0" y="86" width="120" height="34" fill="#3a2a18"/><path d="M60 86 L60 30" stroke="#b0503f" stroke-width="3.5" stroke-linecap="round"/><g fill="#5aa845"><path d="M60 66 q-16 -10 -24 -4 q10 12 24 6z"/><path d="M60 56 q16 -10 24 -4 q-10 12 -24 6z"/></g><g fill="#f2e6ef" stroke="#d7a9c6" stroke-width="1"><circle cx="60" cy="26" r="4.5"/><circle cx="50" cy="34" r="4"/><circle cx="70" cy="34" r="4"/><circle cx="55" cy="44" r="4"/><circle cx="66" cy="44" r="4"/></g></svg>`
};

const CEREAL_STAGES_INFO = [
  { svg: "keimung", bbch: "00–09", name: "Keimung / Auflaufen", text: "Das Korn quillt, keimt und der erste Trieb (Koleoptile) durchstößt den Boden. Sichtbar wird das erste Laubblatt. Wichtig sind gute Bodenfeuchte und Saattiefe." },
  { svg: "bestockung", bbch: "10–29", name: "Blattentwicklung & Bestockung", text: "Die Pflanze bildet Laubblätter und beginnt zu bestocken – aus einem Korn entstehen mehrere Seitentriebe (Bestockungstriebe). Die Bestockung bestimmt maßgeblich die spätere Ährenzahl. Idealer Zeitpunkt fürs Striegeln gegen Unkraut." },
  { svg: "schossen", bbch: "30–39", name: "Schossen (Schaftstreckung)", text: "Der Haupttrieb streckt sich, die Halmknoten werden fühlbar. Ab dem 1-Knoten-Stadium reagiert das Getreide empfindlich – mechanische Eingriffe nur noch vorsichtig. Hoher Nährstoff- und Wasserbedarf." },
  { svg: "aehrenschieben", bbch: "40–59", name: "Ährenschwellen & Ährenschieben", text: "Die Ähre schwillt in der Blattscheide an (Grannenspitzen werden sichtbar) und schiebt sich schließlich heraus. Bei Gerste erkennbar an den langen Grannen, bei Weizen/Dinkel an der kompakten Ähre." },
  { svg: "bluete", bbch: "60–69", name: "Blüte", text: "Die Blüte erfolgt meist selbstbefruchtend, oft sind die Staubbeutel sichtbar. Kritische Phase für Ährenfusariose bei feucht-warmer Witterung. Roggen ist Fremdbefruchter (Windbestäubung)." },
  { svg: "milchreife", bbch: "70–79", name: "Milchreife (Kornfüllung)", text: "Die Körner füllen sich, der Inhalt ist milchig-flüssig. Ähre und Halm noch grün. Entscheidende Phase für den Ertrag – Wasserstress reduziert jetzt die Kornfüllung." },
  { svg: "teigreife", bbch: "80–89", name: "Teigreife", text: "Der Korninhalt wird teigig-fest, die Bestände färben sich gelb. Bei Erreichen der Gelbreife ist die Einlagerung weitgehend abgeschlossen." },
  { svg: "vollreife", bbch: "90–99", name: "Vollreife / Erntereif", text: "Die Körner sind hart, das Stroh trocken und gelb-braun. Ähren neigen sich. Bei Kornfeuchte unter ~14–15 % kann gedroschen werden – Erntezeitpunkt." }
];

const BUCKWHEAT_STAGES_INFO = [
  { svg: "keimung", bbch: "00–09", name: "Keimung / Auflaufen", text: "Buchweizen (kein echtes Getreide, sondern ein Knöterichgewächs) keimt rasch und wärmeliebend. Die Keimblätter (Kotyledonen) sind herzförmig." },
  { svg: "buchweizen_jung", bbch: "10–19", name: "Jugendentwicklung (Blattbildung)", text: "Schnelle Jugendentwicklung mit rötlichem Stängel und herzförmigen Blättern. Buchweizen unterdrückt durch rasches Wachstum viele Beikräuter – beliebt als Zwischenfrucht." },
  { svg: "buchweizen_bluete", bbch: "50–69", name: "Knospen- & Vollblüte", text: "Lange, gestaffelte Blüte mit weiß-rosa Blüten – wertvolle Bienenweide. Blüte und Kornansatz laufen gleichzeitig, daher reift Buchweizen ungleichmäßig ab." },
  { svg: "milchreife", bbch: "70–79", name: "Kornbildung & -füllung", text: "Die dreikantigen Nüsschen bilden sich. Da Blüte und Reife überlappen, sind gleichzeitig Blüten und reife Körner an der Pflanze." },
  { svg: "vollreife", bbch: "80–99", name: "Abreife / Erntereif", text: "Ein Großteil der Körner ist braun-schwarz und hart. Geerntet wird, wenn ~70–75 % der Körner reif sind – ein Kompromiss wegen der ungleichen Abreife. Frostempfindlich." }
];

function stageAccordion(list) {
  return list.map((s, i) => `
    <div class="stage-info">
      <div class="stage-svg">${STAGE_SVG[s.svg] || ""}</div>
      <div class="stage-info-body">
        <div class="flex-between"><strong>${i + 1}. ${esc(s.name)}</strong><span class="badge info">BBCH ${esc(s.bbch)}</span></div>
        <p style="margin:.4em 0 0">${esc(s.text)}</p>
      </div>
    </div>`).join("");
}

function renderStages() {
  const v = $("#view-stages");
  v.innerHTML = `
    <div class="view-head"><div><h2>🌱 Blattstadien &amp; Wachstum</h2>
      <p class="lead">Die Entwicklungsstadien der Getreidearten – erklärt und illustriert. Die Einteilung folgt der internationalen <strong>BBCH-Skala</strong> (00 = Keimung … 99 = Vollreife), auf der auch die Ernteprognose der App beruht.</p></div></div>

    <div class="card"><div class="card-body">
      <h3>🌾 Getreide (Dinkel, Weizen, Roggen, Gerste, Hafer)</h3>
      <p class="muted" style="font-size:.9rem">Die Stadien laufen bei allen echten Getreidearten sehr ähnlich ab. Kulturspezifische Besonderheiten sind bei den einzelnen Stadien vermerkt.</p>
      <div class="stage-info-list">${stageAccordion(CEREAL_STAGES_INFO)}</div>
    </div></div>

    <div class="card" style="margin-top:16px"><div class="card-body">
      <h3>🔺 Buchweizen (Sonderfall)</h3>
      <p class="muted" style="font-size:.9rem">Buchweizen ist botanisch kein Getreide (Knöterichgewächs) und reift wegen der langen, gestaffelten Blüte ungleichmäßig ab – daher eine eigene Stadien-Einteilung.</p>
      <div class="stage-info-list">${stageAccordion(BUCKWHEAT_STAGES_INFO)}</div>
    </div></div>

    <div class="card" style="margin-top:16px"><div class="card-body">
      <h3>ℹ️ Was bedeutet BBCH?</h3>
      <p>Die <strong>BBCH-Skala</strong> beschreibt Entwicklungsstadien von Pflanzen mit einem zweistelligen Code (00–99). Die Zehnerstelle steht für die Hauptphase (z. B. 1x = Blattentwicklung, 3x = Schossen, 6x = Blüte, 9x = Reife), die Einerstelle für die Feinstufe. So lässt sich der Entwicklungsstand exakt und kulturübergreifend benennen – wichtig für Pflanzenschutz-, Striegel- und Erntetermine.</p>
    </div></div>
  `;
}

/* ---------- Assistent (Claude API) ---------- */
// Läuft NICHT lokal: Fragen + eine kurze Datenzusammenfassung gehen über den
// eigenen API-Key direkt an api.anthropic.com. Key/Modell/Chatverlauf liegen
// im Store "settings" (siehe DB.open) und sind bewusst NICHT im JSON-Backup.
const ASSISTANT_MODELS = [
  { id: "claude-opus-4-8", label: "Claude Opus 4.8 (stärkste Antworten, teuerste)" },
  { id: "claude-sonnet-5", label: "Claude Sonnet 5 (ausgewogen)" },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5 (schnell & günstig)" }
];

function mdLite(text) {
  let h = esc(text);
  h = h.replace(/```([\s\S]*?)```/g, (_, c) => `<pre><code>${c}</code></pre>`);
  h = h.replace(/`([^`]+)`/g, "<code>$1</code>");
  h = h.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  h = h.replace(/(https?:\/\/[^\s<]+)/g, (u) => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`);
  return h.replace(/\n/g, "<br>");
}

function buildAssistantContext() {
  const lines = [`Heutiges Datum: ${todayISO()}.`];
  if (!App.fields.length) {
    lines.push("Der Nutzer hat noch keine Felder angelegt.");
  } else {
    lines.push(`Angelegte Felder (${App.fields.length}):`);
    for (const f of App.fields) {
      const g = computeGrowth(f);
      const p = cropParams(f);
      let line = `- "${f.name}": Kultur ${p.name}, Standort ${f.locationName || "unbekannt"}, Aussaat ${f.sowDate || "unbekannt"}${f.areaHa ? `, ${f.areaHa} ha` : ""}.`;
      line += g
        ? ` Aktuell: ${g.stage.name} (BBCH ${g.stage.bbch}), Wärmesumme ${g.gdd}/${g.params.gddTarget} °Cd, Ernteprognose ${g.daysToHarvest === 0 ? "erntereif" : fmtDate(g.predDate) + ` (${g.daysToHarvest} Tage)`}.`
        : " Noch keine Wetterprognose berechnet.";
      lines.push(line);
    }
  }
  if (App.notes.length) {
    lines.push("Letzte Notizen/Erkenntnisse des Nutzers:");
    App.notes.slice().sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 5)
      .forEach(n => lines.push(`- ${n.title} (${fmtDate(n.date)}): ${(n.body || "").slice(0, 200)}`));
  }
  return lines.join("\n");
}

function buildSystemPrompt() {
  return `Du bist der Assistent in der App "Getreide-Wissensdatenbank" - einer lokalen Anwendung für (Bio-)Getreidebau ` +
    `(Dinkel, Roggen, Weizen, Gerste, Hafer, Buchweizen) mit Schwerpunkt Südtirol. Beantworte Fragen zu Anbau, Wetter, ` +
    `Wachstumsstadien, Krankheiten/Schädlingen und Unkrautregulierung (v. a. Bio-Maßnahmen) sowie zu den unten aufgeführten ` +
    `eigenen Daten des Nutzers. Nutze die Websuche, wenn dein Wissen für eine aktuelle oder spezifische Frage nicht ausreicht ` +
    `(z. B. aktuelle Wetterlage, Marktpreise, neue Studien). Antworte auf Deutsch, praxisnah und knapp.\n\n` +
    `BILDANALYSE: Wenn der Nutzer ein Foto von Boden, Pflanze oder Bestand schickt, analysiere es: ` +
    `(1) bestimme sichtbare Beikräuter/Unkräuter möglichst genau (deutscher + botanischer Name), ` +
    `(2) beurteile Kulturpflanze, Entwicklungsstadium und auffällige Krankheits-/Nährstoff-/Schädlingssymptome, ` +
    `(3) beurteile den Boden (Struktur, Verschlämmung, Bewuchs) soweit erkennbar, ` +
    `(4) gib konkrete Bio-taugliche Handlungsempfehlungen (Striegeln/Hacken, Zeitpunkt, Fruchtfolge, Vorbeugung). ` +
    `Nenne deine Unsicherheit offen, wenn das Bild keine sichere Bestimmung zulässt, und frage ggf. nach einem schärferen Detailfoto.\n\n` +
    `--- Daten des Nutzers ---\n${buildAssistantContext()}`;
}

async function persistChat() {
  await DB.put("settings", { id: "chatHistory", messages: App.chatMessages });
}

// Bild client-seitig auf max. Kantenlänge verkleinern und als JPEG-DataURL zurückgeben
// (spart Tokens/Bandbreite; das Original wird nicht gespeichert).
function resizeImageToDataURL(file, maxEdge = 1024, quality = 0.8) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxEdge || height > maxEdge) {
        const sc = maxEdge / Math.max(width, height);
        width = Math.round(width * sc); height = Math.round(height * sc);
      }
      const cv = document.createElement("canvas");
      cv.width = width; cv.height = height;
      cv.getContext("2d").drawImage(img, 0, 0, width, height);
      res(cv.toDataURL("image/jpeg", quality));
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => rej(new Error("Bild konnte nicht gelesen werden"));
    img.src = URL.createObjectURL(file);
  });
}

// Chat-Nachricht → API-Content: mit Bild als Vision-Block, sonst reiner Text.
function chatMsgToApi(m) {
  if (m.role === "user" && m.imageDataURL) {
    const [meta, b64] = m.imageDataURL.split(",");
    const media = (meta.match(/:(.*?);/) || [])[1] || "image/jpeg";
    return {
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: media, data: b64 } },
        { type: "text", text: m.text || "Analysiere dieses Foto." }
      ]
    };
  }
  return { role: m.role, content: m.text };
}

async function sendAssistantMessage(userText, imageDataURL) {
  const key = App.assistantSettings.apiKey;
  if (!key) { toast("Bitte zuerst einen Anthropic API-Key hinterlegen."); return; }

  App.chatMessages.push({ role: "user", text: userText, imageDataURL: imageDataURL || null });
  App.chatBusy = true;
  await persistChat();
  renderChatMessages();

  const tools = App.assistantSettings.webSearch ? [{ type: "web_search_20260209", name: "web_search", max_uses: 3 }] : [];
  let messages = App.chatMessages.filter(m => !m.error).map(chatMsgToApi);

  try {
    let finalText = "";
    const citations = [];
    for (let i = 0; i < 5; i++) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true"
        },
        body: JSON.stringify({
          model: App.assistantSettings.model,
          max_tokens: 2048,
          system: buildSystemPrompt(),
          tools,
          messages
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);

      for (const block of data.content || []) {
        if (block.type === "text") {
          finalText += block.text;
          for (const c of (block.citations || [])) if (c.url) citations.push(c);
        } else if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
          for (const r of block.content) if (r.url) citations.push(r);
        }
      }

      if (data.stop_reason === "pause_turn") {
        messages = [...messages, { role: "assistant", content: data.content }];
        continue;
      }
      break;
    }
    const urls = [...new Set(citations.map(c => c.url).filter(Boolean))];
    App.chatMessages.push({ role: "assistant", text: finalText || "(keine Antwort erhalten)", citations: urls });
  } catch (e) {
    App.chatMessages.push({ role: "assistant", text: `⚠️ Fehler: ${e.message}`, error: true });
  } finally {
    App.chatBusy = false;
    await persistChat();
    renderChatMessages();
  }
}

function renderChatMessages() {
  const c = $("#as-messages");
  if (!c) return;
  c.innerHTML = App.chatMessages.length ? "" : `<p class="muted">Noch keine Nachrichten. Frag mich etwas zu deinem Anbau!</p>`;
  for (const m of App.chatMessages) {
    const d = document.createElement("div");
    d.className = "chat-msg " + (m.role === "user" ? "user" : "assistant") + (m.error ? " error" : "");
    let html = "";
    if (m.imageDataURL) html += `<img class="chat-img" src="${m.imageDataURL}" alt="Foto" />`;
    html += mdLite(m.text);
    if (m.citations?.length) {
      html += `<div class="chat-sources">Quellen: ${m.citations.map((u, i) => `<a href="${esc(u)}" target="_blank" rel="noopener">[${i + 1}]</a>`).join(" ")}</div>`;
    }
    d.innerHTML = html;
    c.appendChild(d);
  }
  if (App.chatBusy) {
    const d = document.createElement("div");
    d.className = "chat-msg assistant busy";
    d.innerHTML = `<span class="dot"></span><span class="dot"></span><span class="dot"></span>`;
    c.appendChild(d);
  }
  c.scrollTop = c.scrollHeight;
}

function renderAssistant() {
  const v = $("#view-assistant");
  const s = App.assistantSettings;
  const hasKey = !!s.apiKey;
  v.innerHTML = `
    <div class="view-head"><div><h2>🤖 Assistent</h2>
      <p class="lead">Stellt Fragen zu deinem Anbau, zu Krankheiten/Unkraut oder allgemein zum Getreidebau. Der Assistent kennt deine Felddaten und kann bei Bedarf im Web suchen.</p></div></div>
    <div class="card" style="margin-bottom:16px"><div class="card-body">
      <h3>⚙️ Einstellungen</h3>
      <p class="hint" style="margin-top:-6px">
        Anders als der Rest der App läuft der Assistent <strong>nicht rein lokal</strong>: Deine Frage sowie eine kurze
        Zusammenfassung deiner Felddaten werden mit deinem eigenen API-Key direkt an die Anthropic-API gesendet
        (kostenpflichtig, Abrechnung über dein Anthropic-Konto). Der Key bleibt nur in diesem Browser gespeichert
        und ist <strong>nicht</strong> im Daten-Backup (Tab „Daten“) enthalten.
      </p>
      <label>Anthropic API-Key</label>
      <input id="as-key" type="password" placeholder="sk-ant-…" value="${esc(s.apiKey)}" autocomplete="off" />
      <p class="hint">Kostenlos erstellen unter <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">console.anthropic.com</a> (nutzungsbasierte Abrechnung).</p>
      <div class="row">
        <div><label>Modell</label>
          <select id="as-model">${ASSISTANT_MODELS.map(m => `<option value="${m.id}" ${m.id === s.model ? "selected" : ""}>${esc(m.label)}</option>`).join("")}</select>
        </div>
        <div><label>Websuche</label>
          <select id="as-web"><option value="1" ${s.webSearch ? "selected" : ""}>an</option><option value="0" ${!s.webSearch ? "selected" : ""}>aus</option></select>
        </div>
      </div>
      <div style="margin-top:10px"><button class="btn" id="as-save">Speichern</button></div>
    </div></div>
    <div class="card"><div class="card-body">
      <div class="flex-between"><h3>💬 Chat &amp; Bildanalyse</h3><button class="btn small ghost" id="as-clear">Verlauf löschen</button></div>
      <p class="hint" style="margin-top:-4px">Tipp: 📷-Button unten antippen, um ein Foto (Boden, Pflanze, Unkraut) zur Analyse hochzuladen.</p>
      ${hasKey ? "" : `<p class="muted">Bitte zuerst oben einen API-Key hinterlegen, um den Assistenten zu nutzen.</p>`}
      <div id="as-messages" class="chat-messages"></div>
      <div id="as-image-preview" class="chat-attach hidden"></div>
      <div class="chat-input-row">
        <input type="file" id="as-file" accept="image/*" capture="environment" hidden />
        <button class="btn ghost chat-cam" id="as-cam" title="Foto anhängen" ${hasKey ? "" : "disabled"}>📷</button>
        <textarea id="as-input" placeholder="Frage stellen oder Foto analysieren lassen …" ${hasKey ? "" : "disabled"}></textarea>
        <button class="btn" id="as-send" ${hasKey ? "" : "disabled"}>Senden</button>
      </div>
    </div></div>
  `;
  $("#as-save").onclick = async () => {
    App.assistantSettings = {
      apiKey: $("#as-key").value.trim(),
      model: $("#as-model").value,
      webSearch: $("#as-web").value === "1"
    };
    await DB.put("settings", { id: "assistant", ...App.assistantSettings });
    toast("Einstellungen gespeichert ✓");
    renderAssistant();
  };
  $("#as-clear").onclick = async () => {
    if (!confirm("Chatverlauf löschen?")) return;
    App.chatMessages = [];
    await persistChat();
    renderChatMessages();
  };
  const input = $("#as-input");
  const renderImagePreview = () => {
    const box = $("#as-image-preview");
    if (App.chatImage) {
      box.classList.remove("hidden");
      box.innerHTML = `<img src="${App.chatImage}" alt="Vorschau" /><button class="chat-attach-del" id="as-img-del" title="Entfernen">×</button>`;
      $("#as-img-del").onclick = () => { App.chatImage = null; renderImagePreview(); };
    } else {
      box.classList.add("hidden"); box.innerHTML = "";
    }
  };
  const send = () => {
    const text = input.value.trim();
    if ((!text && !App.chatImage) || App.chatBusy) return;
    const img = App.chatImage;
    input.value = ""; App.chatImage = null; renderImagePreview();
    sendAssistantMessage(text || "Bitte analysiere dieses Foto (Boden/Pflanze/Unkraut) und gib Bio-Tipps.", img);
  };
  if ($("#as-cam")) $("#as-cam").onclick = () => $("#as-file").click();
  if ($("#as-file")) $("#as-file").onchange = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try { App.chatImage = await resizeImageToDataURL(file); renderImagePreview(); }
    catch (err) { toast("Bild-Fehler: " + err.message); }
    e.target.value = "";
  };
  if ($("#as-send")) $("#as-send").onclick = send;
  if (input) input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  });
  renderImagePreview();
  renderChatMessages();
}

/* ---------- Hilfe ---------- */
function renderHelp() {
  $("#view-help").innerHTML = `
    <div class="view-head"><div><h2>Hilfe &amp; Hinweise</h2></div></div>
    <div class="card"><div class="card-body">
      <h3>So funktioniert die App</h3>
      <ol>
        <li><strong>Feld anlegen</strong> (Tab „Felder &amp; Kulturen“): Kultur wählen, Standort auf der <strong>Karte anklicken</strong> (Standard Südtirol – setzt Koordinaten &amp; Ortsname automatisch) oder Ort suchen, Aussaatdatum eintragen. Fotos &amp; Notizen ergänzen.</li>
        <li><strong>Wetter laden</strong>: In der Felddetail-Ansicht oder im Tab „Wetter &amp; Prognose“ auf „Wetter aktualisieren“ klicken. Die App holt vergangene Witterung &amp; 16-Tage-Vorhersage von Open-Meteo.</li>
        <li><strong>Prognose</strong>: Aus den Temperaturen wird die Wärmesumme (°Cd) berechnet → daraus Wachstumsstadium (BBCH), Reifestand und voraussichtlicher Erntezeitpunkt.</li>
        <li><strong>Krankheiten</strong>: Pilze &amp; Schädlinge mit begünstigender Witterung und Bio-Maßnahmen, filterbar nach Kultur, erweiterbar.</li>
        <li><strong>Unkraut (Bio)</strong>: Maßnahmen &amp; Eingriffszeitpunkte – filterbar nach Kultur, erweiterbar um eigene Beikräuter.</li>
        <li><strong>Vergleich</strong>: Ernten je Feld/Jahr erfassen (auch in der Felddetail-Ansicht) → Mehrjahresvergleich der Erntetermine, Vegetationsdauer &amp; Erträge.</li>
        <li><strong>Erkenntnisse</strong>: Notizen, Beobachtungen und Fachquellen sammeln.</li>
        <li><strong>🤖 Assistent</strong>: Fragen zum Anbau stellen – kennt deine Felddaten und kann bei Bedarf im Web suchen. Erfordert einen eigenen (kostenpflichtigen) Anthropic-API-Key.</li>
        <li><strong>Daten</strong>: Regelmäßig ein <strong>Backup</strong> herunterladen (inkl. Fotos) und bei Bedarf wiederherstellen.</li>
      </ol>
      <hr class="sep"/>
      <h3>Datenspeicherung</h3>
      <p>Alle Daten und Fotos werden <strong>lokal in deinem Browser</strong> gespeichert (IndexedDB). Nichts wird hochgeladen. Tipp: Browser-Daten nicht löschen, sonst gehen die Einträge verloren – nutze regelmäßig <strong>Daten → Backup herunterladen</strong> zur Sicherung und für den Geräte-Wechsel.
      <strong>Ausnahme:</strong> Der Tab „🤖 Assistent“ sendet deine Frage und eine kurze Zusammenfassung deiner Felddaten mit deinem eigenen API-Key an die Anthropic-API – nur wenn du diesen Tab aktiv nutzt. API-Key und Chatverlauf sind nicht im Backup enthalten.</p>
      <h3>Modell-Hinweis</h3>
      <p class="muted">Die Prognosen beruhen auf einem Temperatursummen-Modell mit Literatur-Richtwerten und dienen als Entscheidungshilfe – keine Garantie. Die Modellparameter (Basistemperatur, Ziel-Wärmesumme) lassen sich je Feld unter „Erweitert“ an deine Erfahrungswerte anpassen.</p>
      <h3>Datenquellen</h3>
      <p>Wetter &amp; Klima: <a href="https://open-meteo.com" target="_blank" rel="noopener">Open-Meteo</a> (frei, ohne Konto). Fachgrundlagen: FiBL, Bioland, Naturland, BBCH-Skala.</p>
    </div></div>`;
}

/* ---------- Laden / Init ---------- */
async function loadAll() {
  App.fields = await DB.all("fields");
  App.notes = await DB.all("notes");
  App.sources = await DB.all("sources");
  App.userWeeds = await DB.all("weeds");
  App.userDiseases = await DB.all("diseases");
  App.harvests = await DB.all("harvests");
  App.fields.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  const settings = await DB.get("settings", "assistant");
  if (settings) App.assistantSettings = { ...App.assistantSettings, ...settings };
  const chat = await DB.get("settings", "chatHistory");
  App.chatMessages = chat?.messages || [];
}
async function reload() { await loadAll(); render(); }

(async function init() {
  try {
    await DB.open();
    await loadAll();
    render();
  } catch (e) {
    $("#main").innerHTML = `<div class="empty"><div class="big">⚠️</div><p>Konnte Datenbank nicht öffnen: ${esc(e.message)}</p>
      <p class="muted">Bitte einen modernen Browser verwenden (Chrome, Edge, Firefox).</p></div>`;
  }
})();
