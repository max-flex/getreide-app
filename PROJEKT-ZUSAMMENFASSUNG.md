# 🌾 Getreide-Wissensdatenbank — Projekt-Zusammenfassung

> Handover-Dokument. Stand: 2026-07-04. Diese Datei fasst zusammen, **was** die App
> kann, **wie** sie aufgebaut ist und **wo** man weitermachen kann — damit die Arbeit
> auch ohne den ursprünglichen Chatverlauf fortgesetzt werden kann.

---

## 1. Was ist das?

Eine **lokale Web-App** (läuft im Browser, kein Server, keine Cloud) als interaktive
Wissensdatenbank für den (Bio-)Getreidebau. Sie verwaltet Felder/Kulturen mit Standort,
Fotos und Erfahrungen, holt **echte Wetterdaten** (Vergangenheit + Vorhersage) und
erstellt daraus **Reife-, Wachstums- und Ernteprognosen**. Dazu Wissensmodule zu
**Krankheiten/Schädlingen** und **Unkraut (Bio)** sowie ein **Mehrjahresvergleich**
der Erntetermine und **Backup/Export**.

- **Plattform:** Web-App (Browser, PC/Tablet/Handy)
- **Speicherung:** lokal im Browser (IndexedDB) — nichts wird hochgeladen
- **Standard-Region:** Südtirol / Italien (Kartenmittelpunkt Bozen)
- **Sprache der Oberfläche:** Deutsch
- **Design:** dunkelblaues, modernes Theme

---

## 2. Starten

- **Einfachste Variante:** Doppelklick auf **`Start.bat`** → öffnet die App unter
  `http://localhost:8123/`. Ein minimierter PowerShell-Server (`serve.ps1`) liefert die
  Dateien aus; zum Beenden dessen Fenster schließen.
- **Alternative:** `index.html` direkt im Browser öffnen (falls der Wetterabruf dabei
  blockiert wird, `Start.bat` nutzen).
- **Internet** wird gebraucht für: Wetter (Open-Meteo), Kartenkacheln (OpenStreetMap),
  Ortsnamen-Rücksuche (BigDataCloud), Karten-Bibliothek (Leaflet via unpkg CDN).
  Alle Dienste sind **kostenlos und ohne Konto/API-Schlüssel**.

---

## 2a. Auf dem Android-Handy installieren

Zwei Wege, siehe Chat-Antwort vom 2026-07-04 für die volle Anleitung:

1. **Schnell, im selben WLAN:** `Start.bat` (ggf. einmal „Als Administrator ausführen"
   für WLAN-Freigabe), dann auf dem Handy `http://<PC-IP>:8123/` öffnen. Ohne HTTPS
   bietet Chrome meist nur ein einfaches Lesezeichen-Icon an (kein echtes Standalone-Fenster).
2. **Empfohlen, ortsunabhängig & vollwertig installierbar:** Ordner kostenlos über
   Netlify Drop (`app.netlify.com/drop`) oder GitHub Pages als HTTPS-Seite hosten,
   dann auf dem Handy öffnen und „App installieren" antippen → echtes Icon, Standalone-
   Fenster, Offline-Start dank Service Worker.

---

## 3. Funktionen (Tabs)

| Tab | Inhalt |
|---|---|
| **Übersicht** | Dashboard: Kennzahlen + je Feld Reifestand (BBCH), Fortschrittsbalken, Ernteprognose |
| **Felder & Kulturen** | Feld anlegen/bearbeiten: Kultur, Standort per **Karte anklicken** (Standard Südtirol) oder Ortssuche, Aussaatdatum, Fläche, Fotos, Notizen, Ernte-Chronik. Modellparameter je Feld unter „Erweitert" anpassbar |
| **Wetter & Prognose** | Vergangene Witterung + 16-Tage-Vorhersage, Temperatur-/Niederschlags-Diagramm, Wärmesummen-Kurve, Stadien |
| **Krankheiten** | 10 Pilze/Schädlinge mit begünstigender Witterung, Bio-Maßnahmen, Zeitpunkt; filterbar nach Kultur, erweiterbar |
| **Unkraut (Bio)** | 8 Beikräuter mit Bio-Maßnahmen & Eingriffszeitpunkt + Striegel-Faustregeln; filterbar, erweiterbar |
| **Vergleich** | Mehrjahresvergleich Erntetermine (Diagramm Erntedatum × Jahr, Linie je Kultur, Prognose als hohler Punkt) + Chronik-Tabelle (Vegetationsdauer, Ertrag) |
| **Erkenntnisse** | Notizen/Beobachtungen + eigene & kuratierte Fachquellen (inkl. Südtirol: Laimburg, BRING, Bioland Südtirol) |
| **🤖 Assistent** | Chatbot für Fragen/Lösungen, kennt die eigenen Felddaten (Prompt-Kontext) und kann per Websuche auf aktuelle Infos zugreifen. Einziger Tab, der **nicht lokal** läuft (siehe Abschnitt 3a) |
| **Daten** | Vollständiges JSON-Backup (inkl. Fotos) herunterladen, Import (Zusammenführen/Ersetzen), Zurücksetzen |
| **Hilfe** | Bedienung, Datenschutz, Modellhinweis, Datenquellen |

---

## 3a. Assistent (Tab „🤖 Assistent") — einzige nicht-lokale Funktion

Chatbot auf Basis der **Anthropic Claude API**, direkt aus dem Browser aufgerufen
(`fetch` gegen `https://api.anthropic.com/v1/messages` mit Header
`anthropic-dangerous-direct-browser-access: true` fürs CORS-Handling — kein Server/Proxy,
da kein Node/npm zur Verfügung steht, siehe Abschnitt 4).

- **Eigener API-Key nötig:** kostenlos erstellbar unter console.anthropic.com, Abrechnung
  nutzungsbasiert über das eigene Anthropic-Konto (kein Anthropic-Guthaben in dieser App).
- **Datenzugriff:** Bei jeder Anfrage wird eine kompakte Text-Zusammenfassung der Felder
  (Kultur, Standort, Aussaat, aktueller Reifestand/BBCH, Ernteprognose) und der letzten
  5 Notizen als System-Prompt mitgeschickt (`buildAssistantContext()` in `app.js`).
- **Internetzugriff:** Server-seitiges Websearch-Tool (`web_search_20260209`), ein-/ausschaltbar.
- **Speicherung (Store `settings` in IndexedDB, seit DB-Version 3):** API-Key, gewähltes
  Modell und Chatverlauf liegen nur lokal im Browser — **bewusst nicht** Teil von
  `exportAll`/`importAll` (Backup), damit der Key nicht versehentlich in einer geteilten
  Backup-Datei landet.
- **Modellwahl:** Standard Claude Opus 4.8 (stärkste Antworten), alternativ Sonnet 5 oder
  Haiku 4.5 (günstiger) über Dropdown wählbar.
- **Fallstrick beim Testen mit dem Preview-Server:** Der Service Worker cached `app.js`
  cache-first; nach Codeänderungen im Assistenten ggf. `CACHE_NAME` in `service-worker.js`
  erhöhen oder SW/Cache im Browser manuell löschen, sonst läuft eine alte Version.

---

## 4. Technik / Architektur

**Kein Build-Schritt, reine statische Dateien** (klassische `<script>`, keine Module —
damit auch per `file://` lauffähig).

| Datei | Zweck |
|---|---|
| `index.html` | Grundgerüst, Tabs, Leaflet-CDN-Einbindung |
| `styles.css` | Dunkelblaues Design (CSS-Variablen in `:root`) |
| `data.js` | **Wissens- & Modelldaten**: `CROPS`, `STAGE_TABLES`, `WEEDS_SEED`, `DISEASES_SEED`, `HOEING_RULES`, `CURATED_SOURCES`, `MAP_DEFAULT`. Wird global als `window.AGRO` bereitgestellt |
| `app.js` | Gesamte Logik: IndexedDB, Wetterabruf, Wachstumsmodell, Karte, Export, UI-Rendering |
| `serve.ps1`, `Start.bat` | Lokaler PowerShell-Webserver (Port 8123), bindet wenn möglich auch fürs WLAN (`http://+:8123/`) |
| `manifest.json` | PWA-Manifest (Name, Icons, `display: standalone`, dunkelblaues Theme) |
| `service-worker.js` | Cached App-Shell (HTML/CSS/JS/Icons) fürs Offline-Öffnen; Live-Daten (Wetter, Karte) gehen weiter live über Netzwerk |
| `icons/` | App-Icons (192/512/512-maskable/apple-touch), erzeugt mit `gen-icons.ps1` |
| `.claude/launch.json` | Preview-Konfiguration (nur für Entwicklung mit Claude Code) |

**Als Android-App installierbar (PWA):** `index.html` bindet `manifest.json` ein und
registriert `service-worker.js`. Über Chrome auf dem Handy → „App installieren" /
„Zum Startbildschirm hinzufügen" entsteht ein echtes App-Icon mit Standalone-Fenster
(ohne Adressleiste). Für eine vollwertige Installation (inkl. Offline-Fähigkeit)
braucht Chrome einen sicheren Kontext (HTTPS oder `localhost`) — siehe Abschnitt 2a.

**Wichtiger Fallstrick (gelöst):** `CROPS` & Co. werden in `data.js` als globale
`const` deklariert. In `app.js` **nicht erneut** per `const {…} = window.AGRO`
deklarieren → sonst „Identifier already declared", und `app.js` läuft gar nicht.
`app.js` nutzt die Globals aus `data.js` direkt.

**Datenspeicher (IndexedDB, DB-Name `getreide-wissensdb`, Version 2):**
Object Stores: `fields`, `notes`, `sources`, `weeds`, `diseases`, `harvests` (Index
`fieldId`), `photos` (Index `fieldId`, Bilder als Blob).
Bei Schema-Änderung **DB-Version erhöhen** und Store in `DB.open().onupgradeneeded` anlegen.

**Externe Dienste (alle keyless):**
- Wetter-Vorhersage: `api.open-meteo.com/v1/forecast` (`past_days`, `forecast_days=16`)
- Wetter-Archiv: `archive-api.open-meteo.com/v1/archive` (für Aussaat > ~80 Tage her)
- Ortssuche (Name→Koord.): `geocoding-api.open-meteo.com`
- Rücksuche (Koord.→Name): `api.bigdatacloud.net/data/reverse-geocode-client`
- Karte: Leaflet 1.9.4 (unpkg) + OpenStreetMap-Tiles

---

## 5. Das Prognose-Modell (Kurzfassung)

**Wärmesummen-Modell (Growing Degree Days, °Cd):**
Pro Tag ab Aussaat: `GDD = max(0, (Tmax+Tmin)/2 − Basistemperatur)`, aufsummiert.

- Anteil `erreichte Summe / Ziel-Summe` → **Wachstumsstadium (BBCH)** aus `STAGE_TABLES`
  (Tabelle `cereal` für Getreide, `buckwheat` für Buchweizen).
- **Ernteprognose:** Rest-Wärmesumme mit der 16-Tage-Vorhersage (bzw. Mittel der letzten
  14 Tage) fortgeschrieben → voraussichtliches Erntedatum.
- Kulturparameter (`baseTemp`, `gddToMaturity`) stehen in `data.js` → `CROPS` und sind
  **je Feld überschreibbar** (Feld-Formular → „Erweitert"). Winterkulturen: Basis 0 °C
  unterdrückt den Winterbeitrag weitgehend.

> ⚠️ Literatur-Richtwerte, **Schätzung als Entscheidungshilfe, keine Garantie.**
> Verbesserung: Ziel-Wärmesumme je Feld an eigene Erntejahre kalibrieren.

**Enthaltene Kulturen:** Dinkel, Winterroggen, Winterweizen, Wintergerste, Hafer,
Buchweizen (+ „Eigene Kultur").

---

## 6. Verifizierter Teststand

Beim Bau erfolgreich getestet (im Browser, echte Live-Dienste):
- Feld anlegen, Ortssuche + **Kartenklick** (→ „Bozen, Trentino-Südtirol, Italien")
- Wetterabruf: 278 Tagesdaten kombiniert (Archiv+Vorhersage), GDD 1895/1900 °Cd,
  Stadium „Vollreife/Erntereif", Ernteprognose berechnet
- Diagramme (Temp/Niederschlag, Wärmesumme, Erntevergleich) rendern korrekt
- Krankheiten-, Unkraut-, Vergleichs-, Daten-Tab funktionsfähig
- Export/Import-Roundtrip OK
- Keine Konsolenfehler. Testdaten wurden wieder entfernt (DB startet leer).

---

## 7. Offene Ideen / nächste Schritte

- **Witterungsbasierte Krankheits-Risikoampel:** geladene Wetterdaten automatisch mit
  den `risk`-Bedingungen der Erreger (in `DISEASES_SEED`) abgleichen → Ampel je Feld.
- ~~PWA: Manifest + Service Worker~~ **erledigt (2026-07-04)** — siehe Abschnitt 4/2a.
- **Automatische Prognose-Aktualisierung** im Hintergrund (statt manuell „aktualisieren").
- **Saatgut-/Sorten-/Düngungs-Tagebuch** je Feld.
- **Kalibrierung** der `gddToMaturity`-Werte aus den erfassten Ernteterminen.

---

## 8. Datenschutz

Alle Feld-, Notiz-, Ernte- und Fotodaten liegen ausschließlich **lokal im Browser**
(IndexedDB). Es gibt kein Backend. Wichtig: Browser-Daten nicht löschen — sonst sind die
Einträge weg. **Regelmäßig über Tab „Daten" ein Backup herunterladen.**

**Ausnahme Assistent (Tab „🤖 Assistent"):** Dort werden Chatnachrichten sowie eine kurze
Zusammenfassung der Felddaten an die Anthropic-API übertragen (siehe Abschnitt 3a) — nur
wenn dieser Tab aktiv genutzt wird, mit dem eigenen API-Key, nach Anthropics Datenschutzbedingungen.
