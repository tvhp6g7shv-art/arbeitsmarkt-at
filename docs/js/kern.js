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

/* --- Hilfsmittel ------------------------------------------------------ */
let wurzel = document.getElementById("dashboard") || document.body;
const stil   = (name) => getComputedStyle(wurzel).getPropertyValue(name).trim();
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
  return {
    textStyle: { fontFamily: stil("--viz-font"), color: stil("--viz-text-2") },
    grid: { left: 8, right: 20, top: 18, bottom: 8, containLabel: true },
    tooltip: {
      backgroundColor: stil("--viz-surface"),
      borderColor: stil("--viz-border"),
      borderWidth: 1,
      padding: [9, 12],
      textStyle: { color: stil("--viz-text"), fontSize: 12.5 },
      extraCssText: "box-shadow:0 4px 16px rgba(0,0,0,.10);border-radius:8px;",
    },
  };
}
const achse = () => ({
  axisLine:  { lineStyle: { color: stil("--viz-axis"), width: 1 } },
  axisTick:  { show: false },
  axisLabel: { color: stil("--viz-muted"), fontSize: 11 },
  splitLine: { lineStyle: { color: stil("--viz-grid"), width: 1, type: "solid" } },
});


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
                   "fluss", "dauer", "schulung", "eu", "stellen", "branche"];
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

  sicher("KPI-Zeile", () => AMS.baueKpis(kpi, zeitreihe));
  sicher("Zeitreihe", () => AMS.baueZeitreihe(zeitreihe));
  sicher("Ausbildung", () => AMS.baueAusbildung(ausbildung, "AT"));
  sicher("Verlauf", () => AMS.baueVerlauf(ausbildung, "absolut"));
  sicher("Generationen", () => AMS.baueGenerationen(generationen, "AT"));
  sicher("Karte", () => AMS.baueKarte(karte, geo));

  document.getElementById("m-verlauf").addEventListener("click", (e) => {
    const knopf = e.target.closest("button[data-modus]");
    if (!knopf) return;
    for (const b of e.currentTarget.querySelectorAll("button"))
      b.setAttribute("aria-pressed", String(b === knopf));
    AMS.baueVerlauf(ausbildung, knopf.dataset.modus);
  });
  sicher("Bundesländer", () => AMS.baueLaender(laender));
  sicher("AMS-Bezirke", () => AMS.baueBezirke(bezirke, meta));
  sicher("Zu-/Abgänge", () => AMS.baueFluss(fluss));
  sicher("Vormerkdauer", () => AMS.baueDauer(dauer));
  sicher("Schulungen", () => AMS.baueSchulung(schulung));
  sicher("EU-Verlauf", () => AMS.baueEu(eu));
  sicher("EU-Rangliste", () => AMS.baueEuRang(eu));
  sicher("Inflation/Arbeitslosigkeit", () => AMS.bauePhillips(eu));
  sicher("Offene Stellen", () => AMS.baueStellen(stellen));
  sicher("Branchen", () => AMS.baueBranche(branche));
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
  AMS.verdrahteEinbetten(meta);

  window.addEventListener("resize", () => diagramme.forEach((d) => d.resize()));
}

/* --- Namensraum: die Chart-Dateien hängen sich hier an ---------------- */
const AMS = {
  hole, basis, achse, tabelle, stil, zahl, pz, monat, deltaText,
  setzeText, setzeHtml, sicher, diagramme, baueFuss,
  setzeBasis: (pfad) => { DATEN_BASIS = pfad; },
  setzeWurzel: (element) => { wurzel = element; },
  start,
};
global.AMS = AMS;
})(window);
