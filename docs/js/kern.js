/* ===========================================================================
   Arbeitsmarkt-Dashboard Österreich — Kern
   ---------------------------------------------------------------------------
   Gemeinsame Helfer, Laden der Daten und Seitenaufbau. Wird von index.html
   und embed.html als ERSTES Skript geladen; die Diagramme selbst stecken in
   je einer Datei unter js/charts/ und hängen sich an window.AMS an.

   Ladereihenfolge (defer hält sie ein): kern.js -> js/charts/*.js ->
   js/einbetten.js. start() läuft erst nach DOMContentLoaded, dann sind
   alle Bausteine da.

   Farben kommen ausschließlich aus CSS-Variablen (--viz-*). In Oxygen 6
   überschreibst du die Variablen im Stylesheet, die Diagramme ziehen nach.
   =========================================================================== */
(function (global) {
"use strict";

/* =====================================================================
   KONFIGURATION — hier die eigene Adresse eintragen
   ===================================================================== */
let DATEN_BASIS = "./data";   // In Oxygen: "https://DEIN-GITHUB-NAME.github.io/arbeitsmarkt-at/data"

/* --- Hilfsmittel ------------------------------------------------------
   wurzel ist das Element, von dem ALLE Farb- und Größentoken gelesen
   werden. Es darf nie null werden: stil() läuft in jedem Diagrammmodul
   als Erstes, ein null hier legt also das ganze Dashboard lahm.
   Siehe setzeWurzel() weiter unten. */
let wurzel = document.getElementById("dashboard") || document.body;
const stil   = (name) => getComputedStyle(wurzel).getPropertyValue(name).trim();

/* --- Typografie ------------------------------------------------------
   ECharts erbt NICHTS aus dem CSS: Diagrammtext wird von der Bibliothek
   selbst gesetzt und dabei über eine Canvas-Messung ausgemessen. Darum
   werden Schriftgrößen hier aus den CSS-Variablen geholt und in die
   Option gegeben, statt sie per CSS zu setzen.

   Wichtig: Diagrammtext NIE über CSS-Selektoren stylen — auch nicht beim
   SVG-Renderer, wo der Text als <text> im DOM steht. ECharts misst die
   Breiten weiter über Canvas; ein CSS-Override verschiebt Achsenlabels
   und schneidet Bezirks- und Ländernamen falsch ab.

   Der zweite Parameter ist der Rückfallwert. Fehlt ein Token — etwa weil
   in Oxygen nur die Farben überschrieben wurden — bleibt die bisherige
   Größe stehen, statt dass ECharts NaN bekommt. */
const px = (name, standard) => parseFloat(stil(name)) || standard;
const schrift = () => ({
  familie: stil("--viz-font") || "system-ui, sans-serif",
  achse:   px("--viz-fs-achse", 11),      // Achsenbeschriftung, visualMap
  label:   px("--viz-fs-label", 11.5),    // Werte am Balken- oder Punktende
  serie:   px("--viz-fs-serie", 12),      // Kategorienamen, Legende
  tooltip: px("--viz-fs-tooltip", 12.5),
  eng:     px("--viz-fs-eng", 10.5),      // 27 Ländernamen auf einer Achse
});
const zahl   = (n) => (n === null || n === undefined) ? "–" : n.toLocaleString("de-AT");
/* Prozentwerte immer mit deutschem Dezimalkomma */
const pz     = (n, stellen = 1) => (n === null || n === undefined) ? "–"
  : n.toLocaleString("de-AT", { minimumFractionDigits: stellen, maximumFractionDigits: stellen });
const monat  = (s) => new Date(s).toLocaleDateString("de-AT", { month: "long", year: "numeric" });

async function hole(name) {
  /* cache: "no-cache" erzwingt eine Rückfrage beim Server. Ohne das zeigt
     der Browser nach der Monatsaktualisierung wochenlang alte Zahlen — und
     einmal als fehlend gemerkte Dateien bleiben fehlend. Die Antwort ist
     bei unveränderten Daten ein 304, kostet also fast nichts. */
  const antwort = await fetch(`${DATEN_BASIS}/${name}.json`, { cache: "no-cache" });
  if (!antwort.ok) throw new Error(`${name}.json konnte nicht geladen werden (HTTP ${antwort.status})`);
  return antwort.json();
}

/* Gemeinsames ECharts-Grundgerüst: dünne Marken, zurückhaltendes Raster,
   Text in Textfarben statt in Serienfarben. */
function basis() {
  const s = schrift();
  return {
    textStyle: { fontFamily: s.familie, fontSize: s.serie, color: stil("--viz-text-2") },
    grid: { left: 8, right: 20, top: 18, bottom: 8, containLabel: true },
    tooltip: {
      backgroundColor: stil("--viz-surface"),
      borderColor: stil("--viz-border"),
      borderWidth: 1,
      padding: [9, 12],
      textStyle: { color: stil("--viz-text"), fontSize: s.tooltip },
      extraCssText: "box-shadow:0 4px 16px rgba(0,0,0,.10);border-radius:8px;",
    },
  };
}
const achse = () => ({
  axisLine:  { lineStyle: { color: stil("--viz-axis"), width: 1 } },
  axisTick:  { show: false },
  axisLabel: { color: stil("--viz-muted"), fontSize: schrift().achse, hideOverlap: true },
  splitLine: { lineStyle: { color: stil("--viz-grid"), width: 1, type: "solid" } },
});

/* --- Schmale Fenster -------------------------------------------------
   ECharts kennt keine Media Queries. Die Option wird EINMAL gebaut,
   `resize()` skaliert sie danach nur noch — Gitterabstaende in Pixeln,
   Legenden und Endbeschriftungen bleiben, wie sie beim Bau waren. Genau
   daher kommen die zusammengeschobenen Achsenzahlen auf dem Handy.

   Diese Helfer liefern breitenabhaengige Werte, und `start()` baut die
   Diagramme neu, sobald die Schwelle ueberschritten wird.

   560 px: darunter reicht die Breite fuer die Desktop-Gitter der
   liegenden Balken nicht mehr (links allein 172 px fuer die
   Kategorienamen, rechts 72 px fuer die Werte — bei 350 px Fenster
   bleiben 106 px Zeichenflaeche). */
const SCHMAL = 560;
const feldBreite = (el) =>
  el?.clientWidth || document.documentElement.clientWidth;
const istSchmal = (el) => feldBreite(el) < SCHMAL;

/* Zeilenhoehe der Kategorienamen und Mindestrand rechts.

   RAND_RECHTS: Am rechten Gitterrand stehen ZWEI Dinge, die ECharts beim
   Layout nicht mitrechnet — die Wertbeschriftung des laengsten Balkens
   (`position: "right"`, Abstand 8) und die HAELFTE der letzten
   Achsenzahl, die mittig ueber dem Gitterende sitzt. Mit den alten 8 px
   im Schmalmodus ragte „150 000" um 13 px aus der Zeichenflaeche und
   wurde zu „150 0" abgeschnitten (gemessen 18.08.2026 bei 480 px
   Diagrammbreite). 60 px decken beides ab. */
const ZEILE = 16;
const RAND_RECHTS = 60;

/* Anteil der Breite, den die Kategorienamen hoechstens belegen duerfen.
   Darueber bleibt zu wenig Zeichenflaeche fuer die Balken. */
const ANTEIL_LINKS = 0.34;

/* Linker Gitterrand fuer liegende Balken. Desktop: der feste Pixelwert
   aus der Diagrammdatei, damit die Kategorienamen aller Diagramme in
   einer Flucht stehen — aber gedeckelt, sobald die Zeichenflaeche
   schmaler wird. Genau dieser Deckel fehlte: auf dem iPad quer stand der
   Rand weiter auf 150–210 px, waehrend die Flaeche nur noch rund 480 px
   breit war. */
const randLinks = (el, desktopLinks = 120) => istSchmal(el)
  ? Math.round(feldBreite(el) * 0.32)
  : Math.min(desktopLinks, Math.round(feldBreite(el) * ANTEIL_LINKS));

/* Gitter fuer liegende Balken. Schmal: containLabel rechnet den linken
   Platz selbst. Sonst: fester bzw. gedeckelter Rand links, immer
   mindestens RAND_RECHTS rechts. */
const balkenGitter = (el, desktop) => istSchmal(el)
  ? { left: 4, right: RAND_RECHTS, top: 10, bottom: 34, containLabel: true }
  : { top: 10, bottom: 34, ...desktop,
      left: randLinks(el, desktop?.left),
      right: Math.max(RAND_RECHTS, desktop?.right ?? RAND_RECHTS) };

/* Kategorienamen links hart begrenzen, sonst frisst „Pflichtschule oder
   weniger" die halbe Breite — oder sie ragt links aus dem Diagramm.

   `anzahl` ist die Zahl der Kategorien: Passen zwei Textzeilen nicht in
   die Hoehe einer Kategoriezeile, wird gekuerzt statt umgebrochen. Ohne
   das kleben bei zehn Wirtschaftszweigen in 260 px Hoehe die
   zweizeiligen Namen ineinander. */
function kategorieLabel(el, desktopLinks = 120, anzahl = 0) {
  const links = randLinks(el, desktopLinks);
  /* 44 px sind oberer (10) + unterer (34) Gitterrand. */
  const platz = anzahl > 0 ? ((el?.clientHeight || 300) - 44) / anzahl : 999;
  const zweiZeilen = platz >= 2 * ZEILE;
  /* Breite und Hoehe reichen: nichts vorschreiben, die Diagrammdatei
     behaelt ihre Vorgaben. So bleibt die Desktop-Ansicht unveraendert. */
  if (!istSchmal(el) && links >= desktopLinks && zweiZeilen) return {};
  return {
    width: Math.max(56, links - 16),   /* 12 px `margin` + Luft fuer „…" */
    overflow: zweiZeilen ? "break" : "truncate",
    lineHeight: ZEILE,
  };
}

/* Legende schmal: scrollbar in EINER Zeile statt ueber drei Zeilen ins
   Diagramm zu laufen. */
const legende = (el, werte) => istSchmal(el)
  ? { ...werte, type: "scroll", itemGap: 10 }
  : werte;

/* Endpunktbeschriftung rechts kostet Breite, die schmal nicht da ist. */
const endLabelZeigen = (el) => !istSchmal(el);

/* Ruft `neuBauen` auf, sobald die Seite die Schwelle wechselt — nicht bei
   jedem Pixel. Entprellt, weil ein Fensterzug Dutzende Ereignisse wirft.

   v42: Nicht mehr nur die 560er-Schwelle. Seit die Gitterraender links
   gedeckelt werden, haengt die Geometrie an der Breite selbst — `resize()`
   allein zeichnet nur mit den alten Pixelwerten neu. Verglichen wird
   deshalb eine grobe Stufe von 160 px; das loest beim Umschlagen des
   Layouts (960/1024 px) aus, aber nicht bei jedem Zug am Fenster. */
const STUFE = 160;
const breitenStufe = (el) =>
  istSchmal(el) ? -1 : Math.floor(feldBreite(el) / STUFE);

function beiBreitenwechsel(neuBauen) {
  let warStufe = breitenStufe(document.getElementById("c-zeitreihe"));
  let timer = null;
  global.addEventListener("resize", () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const jetzt = breitenStufe(document.getElementById("c-zeitreihe"));
      if (jetzt === warStufe) return;
      warStufe = jetzt;
      neuBauen();
    }, 200);
  });
}

/* --- Neuvermessung nach dem Laden der Schrift ------------------------
   ECharts misst und zeichnet EINMAL beim Aufbau und rendert danach nie
   von selbst neu. Ist Figtree zu diesem Zeitpunkt noch nicht geladen,
   bleibt der gesamte Diagrammtext dauerhaft in der Ersatzschrift stehen —
   während die Seite ringsum bereits richtig aussieht. Genau so sieht der
   Fehler „die Schrift kommt nicht in die Karten" aus.

   resize() stößt eine vollständige Neuvermessung an. Die Karten brauchen
   zusätzlich __neuLayouten, weil ihr layoutSize eine aus dem Container
   gerechnete Pixelzahl ist. Der Aufruf ist folgenlos, wenn die Schrift
   schon da war. */
function neuVermessen() {
  diagramme.forEach((d) => {
    if (!d || d.isDisposed?.()) return;
    d.resize();
    if (typeof d.__neuLayouten === "function") d.__neuLayouten();
  });
  /* Sparklines der KPI-Kacheln hängen nicht in `diagramme` */
  document.querySelectorAll(".viz-kpi-spark").forEach((el) => {
    const d = global.echarts?.getInstanceByDom(el);
    if (d) d.resize();
  });
}


/* Setzt Text/HTML nur, wenn das Element existiert — die Einbettseite
   enthält jeweils nur einen Ausschnitt der Markierungen. */
function setzeText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text ?? "";
}
function setzeHtml(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html ?? "";
}

/* --- Tabellenansicht: jedes Diagramm hat eine ------------------------- */
document.addEventListener("click", (e) => {
  const knopf = e.target.closest(".viz-tabelle-schalter");
  if (!knopf) return;
  const feld = document.getElementById(knopf.dataset.ziel);
  const zeigen = feld.classList.contains("viz-verborgen");
  feld.classList.toggle("viz-verborgen", !zeigen);
  knopf.textContent = zeigen ? "Diagramm" : "Tabelle";
});

function tabelle(spalten, zeilen) {
  const kopf = spalten.map((s) => `<th class="${s.num ? "num" : ""}">${s.titel}</th>`).join("");
  const koerper = zeilen.map((z) =>
    "<tr>" + spalten.map((s) => `<td class="${s.num ? "num" : ""}">${s.wert(z)}</td>`).join("") + "</tr>"
  ).join("");
  return `<table class="viz-tabelle"><thead><tr>${kopf}</tr></thead><tbody>${koerper}</tbody></table>`;
}

function deltaText(pct) {
  if (pct === null || pct === undefined) return "";
  const hoch = pct > 0;
  const klasse = hoch ? "viz-delta-hoch" : "viz-delta-runter";
  const pfeil = hoch ? "▲" : "▼";
  const wort = hoch ? "mehr" : "weniger";
  return `<span class="${klasse}">${pfeil} ${Math.abs(pct).toLocaleString("de-AT")} % ${wort} als im Vorjahr</span>`;
}

/* --- Kartenlayout ----------------------------------------------------
   Gemeinsam für Bezirks- und EU-Karte. Liefert die Werte, mit denen ECharts
   eine Karte formtreu in ihren Container einpasst.

   Die Falle dahinter, zweimal getreten und in v20 ausgemessen:

   1. `layoutSize` in PROZENT bezieht ECharts auf die KÜRZERE Containerseite.
      Bei 1098 x 470 px sind das 470 — eine breite, flache Fläche bleibt
      dadurch ungenutzt. Mehr Höhe hilft nicht, die Prozentangabe bleibt an
      die Höhe gekettet.
   2. `left/right/top/bottom` statt `layoutCenter/layoutSize` ist keine
      Lösung, sondern schlimmer: ECharts ZIEHT die Karte dann in das
      Rechteck. Gemessen am 14.08.2026: Österreich 24 %, Europa 178 % zu
      breit. Aspekterhaltend ist allein das Paar layoutCenter + layoutSize.

   Deshalb hier: layoutSize als PIXELZAHL, aus dem Container gerechnet, und
   bei jedem resize neu. `aspectScale` ist der Ausgleich für die
   Plattkarten-Projektion und entspricht dem Kosinus der mittleren Breite —
   0,67 für Österreich, 0,63 für Europa. Ohne ihn wäre die Karte in
   Ost-West-Richtung gestreckt.

   `rahmen` ist [[West, Süd], [Ost, Nord]]. Die 0,98 halten einen Rand frei,
   damit die äußersten Ränder nicht an der Containerkante kleben. */
function kartenLayout(feld, rahmen, aspectScale) {
  const breite = feld.clientWidth || 1;
  const hoehe = feld.clientHeight || 1;
  const gradBreit = rahmen[1][0] - rahmen[0][0];
  const gradHoch = rahmen[1][1] - rahmen[0][1];
  const verhaeltnis = (gradBreit * aspectScale) / gradHoch;
  const groesse = verhaeltnis >= 1
    ? Math.min(breite, hoehe * verhaeltnis)     // breiter als hoch: Breite begrenzt
    : Math.min(hoehe, breite / verhaeltnis);    // höher als breit: Höhe begrenzt
  return {
    aspectScale,
    boundingCoords: rahmen,
    layoutCenter: ["50%", "50%"],
    layoutSize: Math.floor(groesse * 0.98),
  };
}

/* --- Schutzhülle -----------------------------------------------------
   Fällt ein Diagramm aus, darf das nicht die restliche Seite leeren.
   Vorher hat ein einziger Fehler alle nachfolgenden Abschnitte
   verschluckt, inklusive ihrer Tabellen. */
const FEHLER = [];
const FEHLENDE = [];
function sicher(name, aufruf) {
  try {
    aufruf();
  } catch (fehler) {
    FEHLER.push(name);
    console.error(`[Dashboard] ${name} fehlgeschlagen:`, fehler);
  }
}

/* --- Quellenangabe (CC BY 4.0 verlangt Namensnennung) ---------------- */
function baueFuss(meta) {
  document.getElementById("fuss").innerHTML =
    "Datenquellen: " +
    meta.quellen.map((q) => `<a href="${q.url}" target="_blank" rel="noopener">${q.name}</a> (${q.lizenz})`).join(" · ") +
    `<br>${meta.hinweis_definitionen}`;
}

/* =====================================================================
   AUFBAU — ruft die Diagrammbausteine aus js/charts/ über AMS auf
   ===================================================================== */
const diagramme = [];

async function start() {
  /* Jede Datei einzeln laden. Fällt eine aus, fehlt nur ihr Abschnitt —
     nicht die halbe Seite. Zwingend sind allein meta und kpi. */
  const DATEIEN = ["meta", "kpi", "zeitreihe", "ausbildung", "bezirke",
                   "bundeslaender", "karte", "karte_geo", "generationen",
                   "fluss", "dauer", "schulung", "eu", "eukarte", "eukarte_geo",
                   "stellen", "branche"];
  const geladen = {};
  await Promise.all(DATEIEN.map(async (name) => {
    geladen[name] = await hole(name).catch(() => null);
    if (!geladen[name]) FEHLENDE.push(name);
  }));

  const meta = geladen.meta, kpi = geladen.kpi;
  const zeitreihe = geladen.zeitreihe, ausbildung = geladen.ausbildung;
  const bezirke = geladen.bezirke, laender = geladen.bundeslaender;
  const karte = geladen.karte, geo = geladen.karte_geo;
  const generationen = geladen.generationen, fluss = geladen.fluss;
  const dauer = geladen.dauer, schulung = geladen.schulung;
  const eu = geladen.eu, stellen = geladen.stellen, branche = geladen.branche;
  const eukarte = geladen.eukarte, eukarteGeo = geladen.eukarte_geo;

  if (!meta || !kpi) {
    document.getElementById("lead").textContent =
      "Die Grunddaten konnten nicht geladen werden. Bitte die Seite neu laden.";
    return;
  }

  document.getElementById("lead").textContent =
    `Registrierte Arbeitslose, Stand ${monat(kpi.stand)}` +
    (meta?.generiert_am
      ? ` · zuletzt aktualisiert am ${new Date(meta.generiert_am).toLocaleDateString("de-AT")}`
      : "");

  /* Alle Diagramme in EINER Funktion, damit sie beim Wechsel der
     Breitenschwelle vollstaendig neu gebaut werden koennen. Was nur
     einmal passieren darf — Ereignisse anhaengen, Quellenzeile, Ausfall-
     meldung — steht bewusst ausserhalb. */
  let verlaufModus = "absolut";
  function baueAlles() {
    sicher("KPI-Zeile", () => AMS.baueKpis(kpi));
    sicher("Zeitreihe", () => AMS.baueZeitreihe(zeitreihe));
    sicher("Ausbildung", () => AMS.baueAusbildung(ausbildung, "AT"));
    sicher("Verlauf", () => AMS.baueVerlauf(ausbildung, verlaufModus));
    sicher("Generationen", () => AMS.baueGenerationen(generationen, "AT"));
    sicher("Karte", () => AMS.baueKarte(karte, geo));
    sicher("Bundesländer", () => AMS.baueLaender(laender));
    sicher("AMS-Bezirke", () => AMS.baueBezirke(bezirke, meta));
    sicher("Zu-/Abgänge", () => AMS.baueFluss(fluss));
    sicher("Vormerkdauer", () => AMS.baueDauer(dauer));
    sicher("Schulungen", () => AMS.baueSchulung(schulung));
    sicher("EU-Rangliste", () => AMS.baueEuRang(eu));
    sicher("EU-Karte", () => AMS.baueEuKarte(eukarte, eukarteGeo));
    sicher("Offene Stellen", () => AMS.baueStellen(stellen));
    sicher("Branchen", () => AMS.baueBranche(branche));
  }
  baueAlles();
  beiBreitenwechsel(baueAlles);

  document.getElementById("m-verlauf").addEventListener("click", (e) => {
    const knopf = e.target.closest("button[data-modus]");
    if (!knopf) return;
    for (const b of e.currentTarget.querySelectorAll("button"))
      b.setAttribute("aria-pressed", String(b === knopf));
    /* gemerkt, damit ein Neubau bei Breitenwechsel den Modus behaelt */
    verlaufModus = knopf.dataset.modus;
    AMS.baueVerlauf(ausbildung, verlaufModus);
  });
  sicher("Quellenangabe", () => baueFuss(meta));

  /* Ausfälle benennen statt still schlucken */
  const ausgefallen = [...new Set([...FEHLER, ...FEHLENDE])];
  if (ausgefallen.length) {
    const feld = document.getElementById("fuss");
    if (feld) feld.insertAdjacentHTML("beforeend",
      `<br><span style="color:${stil("--viz-kritisch")}">Gerade nicht ` +
      `verfügbar: ${ausgefallen.join(", ")}. Die übrigen Angaben sind ` +
      `davon unberührt.</span>`);
  }
  /* js/einbetten.js ist optional: embed.html laedt es nicht, und eine
     Gastgeberseite kann es weglassen. Ohne diesen Guard riss der Aufruf den
     ganzen Seitenaufbau ab. Bis v25 half sich der WordPress-Block mit einer
     Attrappe — die ist seit v26 nicht mehr noetig. */
  if (typeof AMS.verdrahteEinbetten === "function") AMS.verdrahteEinbetten(meta);

  /* Erst NACH dem Aufbau anhängen: Ist die Schrift schon da, löst das
     Versprechen sofort aus und der Aufruf kostet nur ein resize. Ist sie
     noch unterwegs, kommt die Neuvermessung, sobald sie eintrifft. */
  if (document.fonts?.ready) document.fonts.ready.then(neuVermessen);

  /* Karten brauchen nach dem resize mehr als d.resize(): ihr layoutSize ist
     eine Pixelzahl und muss aus der neuen Containergröße neu gerechnet
     werden. Wer das braucht, hängt sich als __neuLayouten an. */
  window.addEventListener("resize", () => diagramme.forEach((d) => {
    d.resize();
    if (typeof d.__neuLayouten === "function") d.__neuLayouten();
  }));
}

/* --- Namensraum: die Chart-Dateien hängen sich hier an ---------------- */
const AMS = {
  hole, basis, achse, tabelle, stil, zahl, pz, monat, deltaText,
  setzeText, setzeHtml, sicher, diagramme, baueFuss, kartenLayout,
  schrift, px, neuVermessen,
  /* Breitenabhaengiges Layout — siehe „Schmale Fenster" oben */
  istSchmal, balkenGitter, kategorieLabel, legende, endLabelZeigen,
  setzeBasis: (pfad) => { DATEN_BASIS = pfad; },
  /* Fail-soft: ein null-Argument darf den Rückfall (#dashboard bzw. body)
     NICHT überschreiben. Genau das ist am 14.08. auf der WordPress-Seite
     passiert — der `.viz-root`-Wrapper fehlte im Oxygen-Markup, der übliche
     Aufruf `setzeWurzel(document.querySelector(".viz-root"))` übergab null,
     und jedes der 13 Module starb in stil() an getComputedStyle(null).
     Ohne Wrapper fehlen nur die Token: die Diagramme kommen dann in den
     ECharts-Vorgabefarben, statt gar nicht zu erscheinen. */
  setzeWurzel: (element) => {
    if (!element) {
      console.warn("[Dashboard] setzeWurzel: kein Element übergeben — " +
        "fehlt der .viz-root-Wrapper? Es bleibt bei " +
        (wurzel === document.body ? "document.body" : "#dashboard") +
        ", die --viz-*-Token greifen dort vermutlich nicht.");
      return;
    }
    wurzel = element;
  },
  start,
};
global.AMS = AMS;
})(window);
