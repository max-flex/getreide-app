/* =====================================================================
   data.js  —  Agronomisches Wissen & Modellparameter
   Quelle der Richtwerte: gängige BBCH-/GDD-Literatur für den Bioanbau
   (Mitteleuropa). Werte sind Schätzwerte und in den Einstellungen je
   Feld anpassbar. Keine Garantie – dienen als Entscheidungshilfe.
   ===================================================================== */

// ---- Kulturen / Getreidearten -------------------------------------------------
// baseTemp = Basistemperatur (°C) für die Temperatursummen (GDD).
// gddToMaturity = ungefähre Wärmesumme von Aussaat bis Erntereife.
// Winterkulturen: Basis 0 °C unterdrückt Winterbeitrag weitgehend.
const CROPS = {
  dinkel: {
    name: "Dinkel (Winterdinkel)",
    type: "Wintergetreide",
    icon: "🌾",
    baseTemp: 0,
    gddToMaturity: 2050,
    sowWindow: "Ende Sept. – Mitte Okt.",
    harvestWindow: "Ende Juli – Mitte Aug.",
    note: "Anspruchslos, gut für Grenzstandorte und Bioanbau. Spelz schützt Korn.",
    stages: "cereal"
  },
  winterroggen: {
    name: "Winterroggen",
    type: "Wintergetreide",
    icon: "🌾",
    baseTemp: 0,
    gddToMaturity: 1900,
    sowWindow: "Mitte Sept. – Ende Okt.",
    harvestWindow: "Mitte Juli – Anf. Aug.",
    note: "Sehr winterhart & genügsam, starke Unkrautunterdrückung (Allelopathie).",
    stages: "cereal"
  },
  winterweizen: {
    name: "Winterweizen",
    type: "Wintergetreide",
    icon: "🌾",
    baseTemp: 0,
    gddToMaturity: 2100,
    sowWindow: "Anf. Okt. – Anf. Nov.",
    harvestWindow: "Ende Juli – Mitte Aug.",
    note: "Höhere Standortansprüche; im Bioanbau N-Versorgung beachten.",
    stages: "cereal"
  },
  wintergerste: {
    name: "Wintergerste",
    type: "Wintergetreide",
    icon: "🌾",
    baseTemp: 0,
    gddToMaturity: 1800,
    sowWindow: "Mitte – Ende Sept.",
    harvestWindow: "Anf. – Mitte Juli",
    note: "Frühe Ernte, gute Vorfrucht für Raps. Frostempfindlicher als Roggen.",
    stages: "cereal"
  },
  hafer: {
    name: "Hafer (Sommerhafer)",
    type: "Sommergetreide",
    icon: "🌾",
    baseTemp: 4,
    gddToMaturity: 1500,
    sowWindow: "März – April",
    harvestWindow: "Anf. – Mitte Aug.",
    note: "Gesundungsfrucht, unterdrückt Fußkrankheiten; liebt gleichmäßige Feuchte.",
    stages: "cereal"
  },
  buchweizen: {
    name: "Buchweizen",
    type: "Sommerkultur (Pseudogetreide)",
    icon: "🌱",
    baseTemp: 6,
    gddToMaturity: 1050,
    sowWindow: "Mitte Mai – Mitte Juni (nach letztem Frost)",
    harvestWindow: "Sept. – Anf. Okt.",
    note: "Frostempfindlich! Kurze Kultur, top Unkrautunterdrücker & Bienenweide.",
    stages: "buckwheat"
  }
};

// ---- Phänologische Stadien (Anteil der erreichten Wärmesumme) ----------------
const STAGE_TABLES = {
  cereal: [
    { upTo: 0.06, bbch: "00–09", name: "Keimung / Auflaufen" },
    { upTo: 0.22, bbch: "10–29", name: "Blattentwicklung & Bestockung" },
    { upTo: 0.42, bbch: "30–39", name: "Schossen (Schaftstreckung)" },
    { upTo: 0.55, bbch: "40–59", name: "Ährenschwellen & Ährenschieben" },
    { upTo: 0.66, bbch: "60–69", name: "Blüte" },
    { upTo: 0.80, bbch: "70–79", name: "Milchreife (Kornfüllung)" },
    { upTo: 0.92, bbch: "80–89", name: "Teigreife" },
    { upTo: 1.01, bbch: "90–99", name: "Vollreife / Erntereif" }
  ],
  buckwheat: [
    { upTo: 0.10, bbch: "00–09", name: "Keimung / Auflaufen" },
    { upTo: 0.30, bbch: "10–19", name: "Jugendentwicklung (Blattbildung)" },
    { upTo: 0.45, bbch: "50–59", name: "Knospenbildung / Blühbeginn" },
    { upTo: 0.70, bbch: "60–69", name: "Vollblüte" },
    { upTo: 0.90, bbch: "70–79", name: "Kornbildung & -füllung" },
    { upTo: 1.01, bbch: "80–99", name: "Abreife / Erntereif" }
  ]
};

// ---- Bio-Unkraut-Wissensdatenbank --------------------------------------------
// Eingriffszeitpunkt im Bioanbau = Striegeln/Hacken im richtigen Fenster,
// vorbeugende & kulturtechnische Maßnahmen. KEINE chemischen Herbizide.
const WEEDS_SEED = [
  {
    id: "ackerfuchsschwanz",
    name: "Ackerfuchsschwanz",
    latin: "Alopecurus myosuroides",
    kind: "Ungras",
    cropsAffected: ["winterweizen", "wintergerste", "winterroggen", "dinkel"],
    severity: "hoch",
    timing: "Bekämpfung im Herbst & zeitigem Frühjahr; Striegeln im Vorauflauf bis 3-Blatt-Stadium des Ungrases.",
    organic: [
      "Weite Fruchtfolge mit Sommerungen & Kleegras zur Durchbrechung des Lebenszyklus",
      "Pflug / wendende Bodenbearbeitung vergräbt Samen tief",
      "Falsches/Scheinsaatbett: auflaufen lassen, dann abflammen/striegeln vor der Saat",
      "Spätere Saat im Herbst senkt Auflaufdruck deutlich",
      "Blindstriegeln vor Kulturauflauf, später Striegeln bei trockener Witterung"
    ],
    note: "Verbreitet Herbizidresistenzen – im Bio kein Problem, aber kulturtechnisch hartnäckig."
  },
  {
    id: "windhalm",
    name: "Gemeiner Windhalm",
    latin: "Apera spica-venti",
    kind: "Ungras",
    cropsAffected: ["winterweizen", "winterroggen", "dinkel", "wintergerste"],
    severity: "mittel",
    timing: "Herbst & Frühjahr; Striegeln ab 2–3 Blatt der Kultur bei trockenem Boden.",
    organic: [
      "Spätsaat reduziert Herbstauflauf",
      "Konkurrenzstarke Sorten & ausreichende Saatdichte",
      "Striegeln im Vorauflauf und Nachauflauf",
      "Stoppelbearbeitung zur Auflaufförderung & anschließender Bekämpfung"
    ],
    note: "Lichtkeimer – flache Bodenbearbeitung fördert Auflauf, dann gezielt bekämpfen."
  },
  {
    id: "kamille",
    name: "Echte / Geruchlose Kamille",
    latin: "Matricaria spp. / Tripleurospermum",
    kind: "zweikeimblättrig",
    cropsAffected: ["winterweizen", "winterroggen", "dinkel", "hafer"],
    severity: "mittel",
    timing: "Striegeln im Keimblatt- bis 2-Laubblatt-Stadium (Fädchenstadium) – hier am empfindlichsten.",
    organic: [
      "Blindstriegeln und frühes Nachauflaufstriegeln im Fädchenstadium",
      "Dichte, konkurrenzstarke Bestände",
      "Fruchtfolge mit Hackfrüchten & Schnittnutzung (Kleegras)",
      "Stoppelbearbeitung gegen Samenbildung nach der Ernte"
    ],
    note: "Sehr samenreich – Versamung unbedingt verhindern."
  },
  {
    id: "klettenlabkraut",
    name: "Klettenlabkraut",
    latin: "Galium aparine",
    kind: "zweikeimblättrig",
    cropsAffected: ["winterweizen", "dinkel", "wintergerste", "winterroggen"],
    severity: "hoch",
    timing: "Früh bekämpfen! Striegeln solange klein (bis ~2 Quirle); später kaum noch fassbar.",
    organic: [
      "Frühes, wiederholtes Striegeln im Jugendstadium",
      "Konkurrenzstarke, dichte Bestände",
      "Weite Fruchtfolge; Kleegras-Schnittnutzung dezimiert Samen",
      "Ernteerschwernis & Lager beachten – früh handeln"
    ],
    note: "Klettert hoch, erschwert Ernte und drückt Bestände nieder."
  },
  {
    id: "ackerkratzdistel",
    name: "Ackerkratzdistel",
    latin: "Cirsium arvense",
    kind: "Wurzelunkraut (mehrjährig)",
    cropsAffected: ["winterweizen", "winterroggen", "dinkel", "hafer", "buchweizen"],
    severity: "hoch",
    timing: "Mechanik gegen Wurzelsystem: wiederholtes Schneiden/Hacken zur Knospenbildung (Rosettenstadium / vor Blüte) erschöpft Wurzeln.",
    organic: [
      "Mehrjähriges Kleegras mit mehrfachem Schnitt erschöpft die Wurzelausläufer",
      "Stoppelbearbeitung: Wurzelschneiden + Austrocknen in Trockenphasen",
      "Konsequentes Abschneiden vor der Blüte über mehrere Jahre",
      "Konkurrenzstarke Kulturen (Roggen, Kleegras)"
    ],
    note: "Wurzelunkraut – nur durch Aushungern über Jahre dauerhaft zu schwächen."
  },
  {
    id: "ackerwinde",
    name: "Ackerwinde",
    latin: "Convolvulus arvensis",
    kind: "Wurzelunkraut (mehrjährig)",
    cropsAffected: ["winterweizen", "dinkel", "hafer", "buchweizen"],
    severity: "mittel",
    timing: "Wiederholte Bodenbearbeitung in Trockenphasen; konkurrenzstarke Kulturen unterdrücken.",
    organic: [
      "Aushungern durch wiederholtes Hacken/Schälen",
      "Dichte Untersaaten & Kleegras",
      "Trockenheitsphasen für Wurzelbekämpfung nutzen"
    ],
    note: "Tiefes Wurzelwerk – Geduld & Trockenphasen nutzen."
  },
  {
    id: "vogelmiere",
    name: "Vogelmiere",
    latin: "Stellaria media",
    kind: "zweikeimblättrig",
    cropsAffected: ["winterweizen", "wintergerste", "dinkel", "hafer", "buchweizen"],
    severity: "mittel",
    timing: "Striegeln im Keim-/Fädchenstadium; verträgt mehrere Striegelgänge schlecht.",
    organic: [
      "Wiederholtes Blind- und Nachauflaufstriegeln",
      "Schnellschließende, dichte Bestände",
      "Nährstoffüberschuss vermeiden (zeigt N-Reichtum an)"
    ],
    note: "Zeigerpflanze für stickstoffreiche Böden; ganzjährig keimfähig."
  },
  {
    id: "ackerdistel_senf",
    name: "Acker-Senf / Hederich",
    latin: "Sinapis arvensis / Raphanus raphanistrum",
    kind: "zweikeimblättrig",
    cropsAffected: ["hafer", "buchweizen", "winterweizen"],
    severity: "mittel",
    timing: "Striegeln/Hacken im frühen Laubblattstadium; bei Sommerungen im Reihenanbau hacken.",
    organic: [
      "Striegeln im Keimblattstadium",
      "Reihenanbau + Hacke bei Sommerkulturen",
      "Fruchtfolge ohne Kreuzblütler-Häufung (Klumpfußrisiko)"
    ],
    note: "Bei Buchweizen/Hafer relevant; früh und konsequent bekämpfen."
  }
];

// ---- Striegel-/Hack-Faustregeln ----------------------------------------------
const HOEING_RULES = [
  "Blindstriegeln: 3–5 Tage nach Saat, solange Unkraut im 'weißen Fädchenstadium' keimt – die wirksamste Maßnahme.",
  "Nachauflaufstriegeln: ab 3-Blatt-Stadium des Getreides, quer oder diagonal zur Saatrichtung.",
  "Trockene, sonnige Witterung wählen – aufgerissene Unkräuter vertrocknen, Boden krümelt.",
  "Nicht striegeln bei nassem Boden, Frost oder direkt vor Regen.",
  "Unkräuter sind am Keim-/Fädchenstadium am empfindlichsten – Timing schlägt Intensität.",
  "Wurzelunkräuter (Distel, Winde, Quecke) nicht striegeln (Verschleppung!) – schneiden/aushungern.",
  "Buchweizen unterdrückt Unkraut selbst stark – meist genügt sauberes, abgesetztes Saatbett."
];

// ---- Krankheiten & Schädlinge (Bio-Fokus) ------------------------------------
// organic = vorbeugende & zugelassene Bio-Maßnahmen. risk = begünstigende
// Witterung (dient als Hinweis, verknüpfbar mit den Wetterdaten).
const DISEASES_SEED = [
  {
    id: "gelbrost",
    name: "Gelbrost",
    latin: "Puccinia striiformis",
    type: "Pilz",
    icon: "🟡",
    cropsAffected: ["winterweizen", "dinkel", "winterroggen", "wintergerste"],
    severity: "hoch",
    risk: "Kühl-feucht (8–15 °C), lange Blattnässe, Frühjahr; anfällige Sorten.",
    timing: "Beobachtung ab Schossen (BBCH 30) bis Blüte; entscheidend ist die Sortenwahl VOR der Saat.",
    organic: [
      "Resistente/robuste Sorten wählen (wichtigste Maßnahme im Bio)",
      "Sortenmischungen anbauen – bremsen die Ausbreitung stark",
      "Nicht zu dichte Bestände, ausgewogene N-Versorgung",
      "Früher Befall: keine kurative Bio-Bekämpfung – auf Toleranz & Mischung setzen"
    ],
    note: "Gelbe Pustelreihen auf Blättern. Rasant bei kühl-feuchtem Frühjahr."
  },
  {
    id: "braunrost",
    name: "Braunrost",
    latin: "Puccinia recondita / triticina",
    type: "Pilz",
    icon: "🟤",
    cropsAffected: ["winterweizen", "dinkel", "winterroggen"],
    severity: "mittel",
    risk: "Warm-feucht (15–22 °C), spätere Entwicklung als Gelbrost (Frühsommer).",
    timing: "Ab Ährenschieben/Blüte relevant; Sortenwahl vorbeugend.",
    organic: [
      "Widerstandsfähige Sorten & Sortenmischungen",
      "Ausgewogene Düngung, luftige Bestände",
      "Frühe Sorten reifen dem Befall teils davon"
    ],
    note: "Rostbraune, verstreute Pusteln v. a. auf der Blattoberseite."
  },
  {
    id: "mehltau",
    name: "Echter Mehltau",
    latin: "Blumeria graminis",
    type: "Pilz",
    icon: "⚪",
    cropsAffected: ["winterweizen", "dinkel", "wintergerste", "hafer"],
    severity: "mittel",
    risk: "Warm, wechselnd feucht/trocken, dichte üppige Bestände, hohe N-Gaben.",
    timing: "Bestockung bis Ährenschieben; vorbeugend über Bestandesführung.",
    organic: [
      "Nicht zu dicht säen, moderate N-Versorgung (kein Luxuskonsum)",
      "Robuste Sorten & Mischungen",
      "Netzschwefel ist im Ökolandbau geregelt zulässig (Auflagen/Verband beachten)",
      "Luftige, abtrocknende Bestände fördern"
    ],
    note: "Weißer, abwischbarer Pilzrasen auf Blättern & Halm."
  },
  {
    id: "septoria",
    name: "Septoria-Blattdürre",
    latin: "Zymoseptoria tritici",
    type: "Pilz",
    icon: "🍂",
    cropsAffected: ["winterweizen", "dinkel"],
    severity: "mittel",
    risk: "Nass-kühl, Spritzwasser bei Regen (Sporen wandern nach oben), dichte Bestände.",
    timing: "Schossen bis Blüte; wichtig ist gesundes oberes Blattwerk (Fahnenblatt).",
    organic: [
      "Weniger anfällige Sorten wählen",
      "Weite Reihen/geringere Dichte → schnelleres Abtrocknen",
      "Spätsaat & Strohrotte fördern (Infektionsquelle mindern)",
      "Weite Fruchtfolge"
    ],
    note: "Bräunliche Blattflecken mit schwarzen Pyknidien (Punkten)."
  },
  {
    id: "mutterkorn",
    name: "Mutterkorn",
    latin: "Claviceps purpurea",
    type: "Pilz (giftig!)",
    icon: "🌑",
    cropsAffected: ["winterroggen", "dinkel", "winterweizen"],
    severity: "hoch",
    risk: "Kühl-feuchte, verzögerte Blüte (v. a. Roggen als Fremdbefruchter); Gräser am Feldrand.",
    timing: "Blüte (BBCH 60–69) ist der Infektionszeitpunkt – vorbeugen ist alles.",
    organic: [
      "Sauberes, geprüftes/zertifiziertes Saatgut (mutterkornfrei)",
      "Grasbewuchs an Feldrändern/Wegen vor der Roggenblüte mähen",
      "Tiefe wendende Bodenbearbeitung vergräbt Sklerotien",
      "Saatgut reinigen (Sklerotien aussortieren), 2–3 Jahre Anbaupause auf befallenen Flächen"
    ],
    note: "Schwarze Hörner (Sklerotien) statt Körnern – stark giftige Alkaloide! Besonders Roggen."
  },
  {
    id: "brand",
    name: "Stein- & Flugbrand",
    latin: "Tilletia caries / Ustilago spp.",
    type: "Pilz (saatgutbürtig)",
    icon: "⚫",
    cropsAffected: ["winterweizen", "dinkel", "wintergerste", "hafer"],
    severity: "hoch",
    risk: "Übertragung über Saatgut/Boden; Steinbrand bei kühler Saatbetttemperatur.",
    timing: "Vor der Saat entscheidend – Saatgutgesundheit & -behandlung.",
    organic: [
      "Anerkanntes, auf Brand getestetes Saatgut verwenden",
      "Physikalische Saatgutbehandlung: Warmwasser- oder Heißluftbeize, Elektronenbehandlung",
      "Zugelassene Bio-Beizmittel (z. B. auf Basis von Senfmehl/Cerall-Bakterien) prüfen",
      "Kein Nachbau von befallenen Partien"
    ],
    note: "Steinbrand: Fischgeruch, Körner voller schwarzer Sporen. Über Saatgut vermeidbar."
  },
  {
    id: "fusarium",
    name: "Ährenfusariose",
    latin: "Fusarium spp.",
    type: "Pilz (Mykotoxine)",
    icon: "🌸",
    cropsAffected: ["winterweizen", "dinkel", "winterroggen", "hafer"],
    severity: "hoch",
    risk: "Warm-feucht/Regen WÄHREND der Blüte; Vorfrucht Mais, viel Ernterückstand, Lager.",
    timing: "Blüte (BBCH 61–69) ist das kritische Infektionsfenster.",
    organic: [
      "Fruchtfolge: kein Getreide direkt nach Mais",
      "Maisstroh & Ernterückstände sauber einarbeiten (Rotte fördern)",
      "Lager/Umbruch vermeiden (standfeste Sorten, moderate N)",
      "Weniger anfällige Sorten, zügig dreschen & trocknen"
    ],
    note: "Weiß-rosa Ähren; Risiko: DON-/Mykotoxine im Erntegut."
  },
  {
    id: "rhynchosporium",
    name: "Blattfleckenkrankheit / Rhynchosporium",
    latin: "Rhynchosporium spp.",
    type: "Pilz",
    icon: "🍃",
    cropsAffected: ["winterroggen", "wintergerste"],
    severity: "mittel",
    risk: "Kühl-nass, dichte Bestände; v. a. Roggen & Gerste.",
    timing: "Schossen bis Ährenschieben.",
    organic: [
      "Robuste Sorten, aufgelockerte Bestände",
      "Weite Fruchtfolge, Strohrotte",
      "Ausgewogene Düngung"
    ],
    note: "Grau-grüne, dunkel umrandete Blattflecken."
  },
  {
    id: "blattlaus",
    name: "Getreideblattläuse",
    latin: "Sitobion avenae u. a.",
    type: "Schädling",
    icon: "🐛",
    cropsAffected: ["winterweizen", "dinkel", "winterroggen", "wintergerste", "hafer"],
    severity: "mittel",
    risk: "Warm-trocken ab Ährenschieben; Läuse saugen & übertragen Viren (Gelbverzwergung).",
    timing: "Ährenschieben bis Milchreife beobachten; Nützlinge fördern statt spritzen.",
    organic: [
      "Nützlinge fördern: Blühstreifen, Hecken (Marienkäfer, Schwebfliegen, Schlupfwespen)",
      "Spätsaat bei Wintergetreide senkt Virusrisiko im Herbst",
      "Meist reguliert die Natur – Bekämpfungsschwelle abwarten",
      "Ausgewogene Düngung (üppige Bestände locken Läuse)"
    ],
    note: "Direktschaden + Virusübertragung. Bei Nützlingsbesatz meist kein Eingriff nötig."
  },
  {
    id: "getreidehaehnchen",
    name: "Getreidehähnchen",
    latin: "Oulema spp.",
    type: "Schädling",
    icon: "🪲",
    cropsAffected: ["winterweizen", "dinkel", "hafer", "wintergerste"],
    severity: "niedrig",
    risk: "Warmes Frühjahr; Larven schaben Fensterfraß an oberen Blättern.",
    timing: "Schossen bis Ährenschieben; Fahnenblatt beobachten.",
    organic: [
      "Nützlinge & strukturreiche Feldränder fördern",
      "Meist unter der Schadschwelle – Toleranz",
      "Gesunde, zügig wachsende Bestände"
    ],
    note: "Typischer 'Fensterfraß' (weiße Streifen) an den obersten Blättern."
  }
];

// ---- Standard-Kartenmittelpunkt: Südtirol (Bozen) ----------------------------
const MAP_DEFAULT = { lat: 46.4983, lon: 11.3548, zoom: 9, region: "Südtirol / Italien" };

// ---- Kuratierte Bio-Fachquellen (für 'Erkenntnisse') -------------------------
const CURATED_SOURCES = [
  { title: "FiBL – Forschungsinstitut für biologischen Landbau", url: "https://www.fibl.org", note: "Merkblätter & Forschung zum Bioackerbau." },
  { title: "Bioland – Pflanzenbau-Beratung", url: "https://www.bioland.de", note: "Praxiswissen Bio-Getreide & Beikrautregulierung." },
  { title: "Naturland – Anbaurichtlinien & Beratung", url: "https://www.naturland.de", note: "Richtlinien, Sortenempfehlungen." },
  { title: "Open-Meteo – freie Wetter-/Klimadaten", url: "https://open-meteo.com", note: "Datenquelle dieser App (Archiv + Prognose)." },
  { title: "BBCH-Skala (Wachstumsstadien)", url: "https://www.juliuskuehn.de", note: "Einheitliche Codierung der Entwicklungsstadien." },
  { title: "LfL Bayern – Pflanzenbau", url: "https://www.lfl.bayern.de", note: "Regionale Anbauhinweise, Versuchsberichte." },
  { title: "Versuchszentrum Laimburg (Südtirol)", url: "https://www.laimburg.it", note: "Land- & forstwirtschaftliche Forschung in Südtirol." },
  { title: "Beratungsring Berglandwirtschaft (BRING)", url: "https://www.bring.bz.it", note: "Beratung für den Südtiroler Acker- & Bergbau." },
  { title: "Bioland Südtirol", url: "https://www.bioland-suedtirol.it", note: "Bioverband & Beratung in Südtirol." }
];

window.AGRO = { CROPS, STAGE_TABLES, WEEDS_SEED, DISEASES_SEED, HOEING_RULES, CURATED_SOURCES, MAP_DEFAULT };
