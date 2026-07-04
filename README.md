# 🌾 Getreide-Wissensdatenbank

Eine lokale Web-App für den Getreidebau (Dinkel, Roggen, Buchweizen, Weizen, Gerste, Hafer …):
interaktive Wissensbasis mit Standort, Fotos, Erfahrungen, Live-Wetterdaten und
Reife-/Ernteprognosen sowie Bio-Unkrautmanagement.

## Starten

**Variante A – am einfachsten:** Doppelklick auf **`Start.bat`**.
Es öffnet sich der Browser unter `http://localhost:8123/`.
(Ein kleiner Hintergrund-Server „Getreide-Server“ läuft minimiert – zum Beenden dieses Fenster schließen.)

**Variante B:** Doppelklick auf **`index.html`** (öffnet die App direkt im Browser).
Falls der Wetterabruf dabei blockiert wird, nutze Variante A.

> Moderner Browser nötig (Chrome, Edge oder Firefox).

## Funktionen

| Bereich | Inhalt |
|---|---|
| **Übersicht** | Dashboard mit Reifestand & Ernteprognose je Feld |
| **Felder & Kulturen** | Schläge anlegen: Kultur, Standort per **Karte anklicken** (Standard **Südtirol**) oder Ortssuche, Aussaat, Fotos, Notizen, Ernte-Chronik |
| **Wetter & Prognose** | Vergangene Witterung + 16-Tage-Vorhersage, Temperatur-/Niederschlagsverlauf, Wärmesummen-Kurve |
| **Krankheiten** | Pilze & Schädlinge mit begünstigender Witterung, Bio-Maßnahmen & Zeitpunkt, filterbar, erweiterbar |
| **Unkraut (Bio)** | Beikräuter mit Bio-Maßnahmen & Eingriffszeitpunkt, filterbar nach Kultur, erweiterbar |
| **Vergleich** | Mehrjahresvergleich der Erntetermine (Diagramm), Vegetationsdauer & Erträge je Kultur |
| **Erkenntnisse** | Notizen, Beobachtungen und Fachquellen sammeln (inkl. Südtiroler Quellen) |
| **Daten** | Vollständiges Export-/Backup als JSON (inkl. Fotos) und Wiederherstellung |

## Wie die Prognose funktioniert

Aus den Tagestemperaturen wird die **Wärmesumme (Growing Degree Days, °Cd)** ab Aussaat
berechnet. Über kulturspezifische Richtwerte (Basistemperatur, Ziel-Wärmesumme) ergeben sich
**Wachstumsstadium (BBCH)**, **Reifestand** und der voraussichtliche **Erntezeitpunkt**.
Die künftige Entwicklung wird mit der 16-Tage-Vorhersage fortgeschrieben.

Die Modellparameter sind je Feld unter **„Erweitert"** anpassbar – so kannst du eigene
Erfahrungswerte einfließen lassen und das Modell mit jeder Saison verbessern.

> ⚠️ Schätzwerte als Entscheidungshilfe, keine Garantie.

## Daten & Datenschutz

Alle Daten und Fotos werden **lokal im Browser** gespeichert (IndexedDB) – nichts wird hochgeladen.
**Backup** jederzeit über den Tab *Daten* als JSON-Datei (inkl. Fotos).
Wetterdaten kommen live von **[Open-Meteo](https://open-meteo.com)**, Kartenkacheln von
**OpenStreetMap**, Ortsnamen (Rückwärts-Suche) von **BigDataCloud** – alle kostenlos & ohne Konto.

## Dateien

- `index.html`, `styles.css` – Oberfläche (dunkelblaues Design)
- `data.js` – Kulturparameter, Unkraut- & Krankheits-Wissensdatenbank, Quellen, Kartenstandard
- `app.js` – Logik (Datenbank, Wetter, Modell, Karte, Export, UI)
- `serve.ps1`, `Start.bat` – lokaler Start

## Ideen für den weiteren Ausbau

- Saatgut-/Sorten- und Düngungs-Tagebuch je Feld
- Witterungsbasierte Krankheits-Risikoampel (Wetterdaten × Erreger-Bedingungen)
- Automatische Prognose-Aktualisierung im Hintergrund
- Installierbar als PWA fürs Handy (Offline-Nutzung im Feld)
