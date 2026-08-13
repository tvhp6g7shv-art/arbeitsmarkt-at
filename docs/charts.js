/* ===========================================================================
   Arbeitsmarkt-Dashboard Österreich — Diagrammbausteine
   ---------------------------------------------------------------------------
   Wird von index.html (Dashboard) und embed.html (Einbettung) genutzt.
   Alle Funktionen hängen unter window.AMS.

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

/* =====================================================================
   AUFBAU
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

  sicher("KPI-Zeile", () => baueKpis(kpi, zeitreihe));
  sicher("Zeitreihe", () => baueZeitreihe(zeitreihe));
  sicher("Ausbildung", () => baueAusbildung(ausbildung, "AT"));
  sicher("Verlauf", () => baueVerlauf(ausbildung, "absolut"));
  sicher("Generationen", () => baueGenerationen(generationen, "AT"));
  sicher("Karte", () => baueKarte(karte, geo));

  document.getElementById("m-verlauf").addEventListener("click", (e) => {
    const knopf = e.target.closest("button[data-modus]");
    if (!knopf) return;
    for (const b of e.currentTarget.querySelectorAll("button"))
      b.setAttribute("aria-pressed", String(b === knopf));
    baueVerlauf(ausbildung, knopf.dataset.modus);
  });
  sicher("Bundesländer", () => baueLaender(laender));
  sicher("AMS-Bezirke", () => baueBezirke(bezirke, meta));
  sicher("Zu-/Abgänge", () => baueFluss(fluss));
  sicher("Vormerkdauer", () => baueDauer(dauer));
  sicher("Schulungen", () => baueSchulung(schulung));
  sicher("EU-Verlauf", () => baueEu(eu));
  sicher("EU-Rangliste", () => baueEuRang(eu));
  sicher("Inflation/Arbeitslosigkeit", () => bauePhillips(eu));
  sicher("Offene Stellen", () => baueStellen(stellen));
  sicher("Branchen", () => baueBranche(branche));
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
  verdrahteEinbetten(meta);

  window.addEventListener("resize", () => diagramme.forEach((d) => d.resize()));
}

/* --- 1 — KPI-Kacheln (Kennzahl + Veränderung + Sparkline) ------------ */
function baueKpis(kpi, zeitreihe) {
  if (!kpi) return;
  const g = kpi.nach_geschlecht || {};
  const gesamt = kpi.arbeitslose_gesamt || 0;
  const anteil = (v) => (gesamt && v) ? `${pz(v / gesamt * 100)} % aller Arbeitslosen` : "";
  const kacheln = [
    { titel: "Arbeitslose insgesamt", wert: kpi.arbeitslose_gesamt, delta: kpi.veraenderung_pct, spark: true },
    { titel: "Männer", wert: g.M ?? g.m, unter: anteil(g.M ?? g.m) },
    { titel: "Frauen", wert: g.W ?? g.w, unter: anteil(g.W ?? g.w) },
    {
      titel: "Arbeitslosenquote EU-Definition",
      text: kpi.quote_eu ? `${pz(kpi.quote_eu.spanne[0])} – ${pz(kpi.quote_eu.spanne[1])} %` : "–",
      unter: kpi.quote_eu ? `Spannweite der Bundesländer, ${kpi.quote_eu.jahr}` : "",
    },
  ];

  document.getElementById("kpis").innerHTML = kacheln.map((k, i) => `
    <div class="viz-kpi">
      <p class="viz-kpi-titel">${k.titel}</p>
      <div class="viz-kpi-wert">${k.text ?? zahl(k.wert)}</div>
      <div class="viz-kpi-delta">${k.delta !== undefined ? deltaText(k.delta) : (k.unter ?? "")}</div>
      ${k.spark ? `<div class="viz-kpi-spark" id="spark-${i}"></div>` : ""}
    </div>`).join("");

  const feld = document.getElementById("spark-0");
  if (!feld) return;
  const d = echarts.init(feld, null, { renderer: "svg" });
  const letzte = zeitreihe.gesamt.slice(-36);
  d.setOption({
    animation: false,
    grid: { left: 0, right: 0, top: 3, bottom: 3 },
    xAxis: { type: "category", show: false, data: letzte.map((_, i) => i), boundaryGap: false },
    yAxis: { type: "value", show: false, min: "dataMin", max: "dataMax" },
    series: [{
      type: "line", data: letzte, showSymbol: false,
      lineStyle: { width: 2, color: stil("--viz-series-1") },
      areaStyle: { color: stil("--viz-series-1"), opacity: 0.10 },
    }],
  });
  diagramme.push(d);
}

/* --- 2 — Zeitreihe: zwei Serien -> Legende + Endpunkt-Beschriftung --- */
function baueZeitreihe(daten) {
  if (!daten?.monate?.length) return;
  const d = echarts.init(document.getElementById("c-zeitreihe"), null, { renderer: "svg" });
  const beschriftung = { M: "Männer", W: "Frauen", m: "Männer", w: "Frauen" };
  const farben = [stil("--viz-series-1"), stil("--viz-series-2")];

  const serien = Object.entries(daten.nach_geschlecht).map(([schluessel, werte], i) => ({
    name: beschriftung[schluessel] ?? schluessel,
    type: "line",
    data: werte,
    smooth: false,
    showSymbol: false,
    symbol: "circle",
    symbolSize: 8,
    lineStyle: { width: 2, color: farben[i] },
    itemStyle: { color: farben[i] },
    emphasis: { focus: "series" },
    endLabel: {           /* selektive Direktbeschriftung statt Zahl an jedem Punkt */
      show: true, formatter: (p) => p.seriesName,
      color: stil("--viz-text-2"), fontSize: 11.5, distance: 6,
    },
  }));

  d.setOption({
    ...basis(),
    grid: { left: 8, right: 70, top: 34, bottom: 8, containLabel: true },
    legend: {                       /* bei >= 2 Serien immer vorhanden */
      top: 0, left: 0, itemWidth: 11, itemHeight: 11, itemGap: 18,
      textStyle: { color: stil("--viz-text-2"), fontSize: 12 },
    },
    tooltip: {
      ...basis().tooltip,
      trigger: "axis",
      axisPointer: { type: "line", lineStyle: { color: stil("--viz-axis"), width: 1 } },
      formatter: (p) => `<strong>${monat(daten.monate[p[0].dataIndex])}</strong><br>` +
        p.map((r) => `${r.marker} ${r.seriesName}&nbsp;&nbsp;<strong>${zahl(r.value)}</strong>`).join("<br>"),
    },
    xAxis: {
      ...achse(), type: "category", boundaryGap: false,
      data: daten.monate,
      splitLine: { show: false },
      axisLabel: {
        color: stil("--viz-muted"), fontSize: 11,
        formatter: (v) => new Date(v).getMonth() === 0 ? new Date(v).getFullYear() : "",
        interval: 0,
      },
    },
    yAxis: {
      ...achse(), type: "value",
      axisLine: { show: false },
      axisLabel: { color: stil("--viz-muted"), fontSize: 11, formatter: (v) => zahl(v) },
    },
    series: serien,
  });
  diagramme.push(d);

  document.getElementById("t-zeitreihe").innerHTML = tabelle(
    [{ titel: "Monat", wert: (z) => monat(z.m) },
     { titel: "Gesamt", num: true, wert: (z) => zahl(z.g) }],
    daten.monate.map((m, i) => ({ m, g: daten.gesamt[i] })).reverse().slice(0, 24)
  );
}

/* --- 3 — Ausbildungsstand: eine Farbe, Länge trägt die Größe ---------
   Das Diagramm zeigt 7 Gruppen; die 18 Einzelstufen des AMS stehen in
   der Tabellenansicht. Mehr als etwa sieben Balken kann man nicht mehr
   sinnvoll vergleichen. */
function baueAusbildung(daten, region) {
  if (!daten?.gruppen?.length) return;
  const d = echarts.getInstanceByDom(document.getElementById("c-ausbildung"))
         || echarts.init(document.getElementById("c-ausbildung"), null, { renderer: "svg" });
  if (!diagramme.includes(d)) diagramme.push(d);

  const jeGruppe = daten.gruppen_je_bundesland || {};
  const werte = daten.gruppen.map((g) =>
    region === "AT" ? g.bestand : (jeGruppe[region]?.[g.schluessel] ?? 0)
  );
  const namen = daten.gruppen.map((g) => g.name);
  const summe = werte.reduce((a, b) => a + b, 0);

  document.getElementById("u-ausbildung").textContent =
    `${region === "AT" ? "Österreich gesamt" : region} · Stand ${monat(daten.stand)}`;

  d.setOption({
    ...basis(),
    /* Feste linke Spalte für die Bezeichnungen: containLabel schneidet bei
       langen Namen das erste Zeichen an. */
    grid: { left: 172, right: 72, top: 10, bottom: 34 },
    tooltip: {
      ...basis().tooltip, trigger: "item",
      formatter: (p) => `<strong>${p.name}</strong><br>${zahl(p.value)} Personen` +
        (summe ? `<br><span style="color:${stil("--viz-muted")}">${pz(p.value / summe * 100)} % aller Arbeitslosen</span>` : ""),
    },
    xAxis: { ...achse(), type: "value", axisLine: { show: false },
             axisLabel: { color: stil("--viz-muted"), fontSize: 11, formatter: (v) => zahl(v) } },
    yAxis: { ...achse(), type: "category", data: namen, inverse: true,
             splitLine: { show: false },
             axisLabel: { color: stil("--viz-text-2"), fontSize: 12,
                          width: 158, overflow: "break", margin: 12 } },
    series: [{
      type: "bar",
      data: werte,
      barWidth: "58%",
      itemStyle: { color: stil("--viz-series-1"), borderRadius: [0, 4, 4, 0] },
      label: { show: true, position: "right", distance: 8,
               color: stil("--viz-text-2"), fontSize: 11.5,
               formatter: (p) => zahl(p.value) },
    }],
  }, { replaceMerge: ["series", "yAxis"] });

  // Tabelle zeigt die volle Auflösung: alle 18 AMS-Stufen
  const jeStufe = daten.je_bundesland || {};
  const stufenWerte = daten.stufen.map((s) =>
    region === "AT" ? s.bestand : (jeStufe[region]?.[s.code] ?? 0)
  );
  const stufenSumme = stufenWerte.reduce((a, b) => a + b, 0);

  document.getElementById("t-ausbildung").innerHTML = tabelle(
    [{ titel: "Ausbildung", wert: (z) => z.name },
     { titel: "Code", wert: (z) => z.code },
     { titel: "Personen", num: true, wert: (z) => zahl(z.wert) },
     { titel: "Anteil", num: true,
       wert: (z) => stufenSumme ? pz(z.wert / stufenSumme * 100) + " %" : "–" }],
    daten.stufen.map((s, i) => ({ name: s.name, code: s.code, wert: stufenWerte[i] }))
  );
}

/* --- 3a — Verlauf der Ausbildungsgruppen ----------------------------
   Sechs Linien über die letzten 18 Monate. Feste Farbzuordnung je Gruppe:
   die Farbe folgt der Sache, nicht dem Rang. „Ungeklärt" bleibt draußen —
   die Kategorie sagt nichts aus und kostet nur eine Farbe. */
const VERLAUF_GRUPPEN = ["pflicht", "lehre", "mittel", "matura", "akademie", "hoch"];

function baueVerlauf(daten, modus = "absolut") {
  const quelle = daten?.zeitreihe_gruppen;
  if (!quelle?.serien) return;
  document.getElementById("s-verlauf").style.display = "";

  const monate = quelle.monate;
  const namen = Object.fromEntries(daten.gruppen.map((g) => [g.schluessel, g.name]));
  const vorhanden = VERLAUF_GRUPPEN.filter((k) => quelle.serien[k]);

  const feld = document.getElementById("c-verlauf");
  const d = echarts.getInstanceByDom(feld) || echarts.init(feld, null, { renderer: "svg" });
  if (!diagramme.includes(d)) diagramme.push(d);

  const farben = [stil("--viz-series-1"), stil("--viz-series-2"), stil("--viz-series-3"),
                  stil("--viz-series-4"), stil("--viz-series-5"), stil("--viz-series-6")];
  const istIndex = modus === "index";
  const startMonat = monat(monate[0]);

  document.getElementById("u-verlauf").textContent = istIndex
    ? `Entwicklung seit ${startMonat}, Ausgangswert = 100 · Österreich gesamt`
    : `Bestand am Monatsende, Österreich gesamt · letzte ${monate.length} Monate`;

  const serien = vorhanden.map((schluessel, i) => {
    const roh = quelle.serien[schluessel];
    const start = roh.find((v) => v > 0) || 1;
    return {
      name: namen[schluessel] ?? schluessel,
      type: "line",
      data: istIndex ? roh.map((v) => Math.round(v / start * 1000) / 10) : roh,
      showSymbol: false, symbol: "circle", symbolSize: 8,
      lineStyle: { width: 2, color: farben[i] },
      itemStyle: { color: farben[i] },
      emphasis: { focus: "series" },
      endLabel: { show: true, formatter: (p) => p.seriesName,
                  color: stil("--viz-text-2"), fontSize: 11, distance: 6 },
      labelLayout: { moveOverlap: "shiftY" },
    };
  });

  d.setOption({
    ...basis(),
    grid: { left: 8, right: 200, top: 34, bottom: 8, containLabel: true },
    legend: { top: 0, left: 0, itemWidth: 11, itemHeight: 11, itemGap: 14,
              textStyle: { color: stil("--viz-text-2"), fontSize: 12 } },
    tooltip: {
      ...basis().tooltip, trigger: "axis",
      axisPointer: { type: "line", lineStyle: { color: stil("--viz-axis"), width: 1 } },
      formatter: (p) => `<strong>${monat(monate[p[0].dataIndex])}</strong><br>` +
        p.map((r) => `${r.marker} ${r.seriesName}&nbsp;&nbsp;<strong>` +
          `${istIndex ? pz(r.value) : zahl(r.value)}</strong>`).join("<br>"),
    },
    xAxis: {
      ...achse(), type: "category", boundaryGap: false, data: monate,
      splitLine: { show: false },
      axisLabel: { color: stil("--viz-muted"), fontSize: 11,
        formatter: (v) => new Date(v).toLocaleDateString("de-AT",
          { month: "short", year: "2-digit" }) },
    },
    yAxis: {
      ...achse(), type: "value", axisLine: { show: false },
      axisLabel: { color: stil("--viz-muted"), fontSize: 11,
                   formatter: (v) => istIndex ? v : zahl(v) },
    },
    series: serien,
  }, { replaceMerge: ["series"] });

  document.getElementById("t-verlauf").innerHTML = tabelle(
    [{ titel: "Monat", wert: (z) => monat(z.m) },
     ...vorhanden.map((k) => ({ titel: namen[k] ?? k, num: true,
                                wert: (z) => zahl(quelle.serien[k][z.i]) }))],
    monate.map((m, i) => ({ m, i })).reverse()
  );
}

/* --- 3b — Generationen: eine Farbe, Geburtsjahre als Zweitzeile ------
   Die Zuordnung Altersgruppe → Generation ist eine Näherung; der Hinweis
   dazu steht unter dem Diagramm, die exakten Altersgruppen in der Tabelle. */
function baueGenerationen(daten, region) {
  if (!daten || !daten.generationen?.length) return;
  document.getElementById("s-generationen").style.display = "";

  const feld = document.getElementById("c-generationen");
  const d = echarts.getInstanceByDom(feld) || echarts.init(feld, null, { renderer: "svg" });
  if (!diagramme.includes(d)) diagramme.push(d);

  const je = daten.je_bundesland || {};
  const werte = daten.generationen.map((g) =>
    region === "AT" ? g.bestand : (je[region]?.[g.schluessel] ?? 0)
  );
  const namen = daten.generationen.map((g) => `${g.name}\n${g.geburtsjahre}`);
  const summe = werte.reduce((a, b) => a + b, 0);

  document.getElementById("u-generationen").textContent =
    `${region === "AT" ? "Österreich gesamt" : region} · Stand ${monat(daten.stand)}`;
  document.getElementById("h-generationen").textContent = daten.hinweis ?? "";

  d.setOption({
    ...basis(),
    grid: { left: 172, right: 72, top: 10, bottom: 34 },
    tooltip: {
      ...basis().tooltip, trigger: "item",
      formatter: (p) => {
        const g = daten.generationen[p.dataIndex];
        return `<strong>${g.name}</strong><br>` +
          `<span style="color:${stil("--viz-muted")}">geboren ${g.geburtsjahre} · ` +
          `heute ${g.alter_von}–${g.alter_bis} Jahre</span><br>` +
          `${zahl(p.value)} Personen` +
          (summe ? `<br><span style="color:${stil("--viz-muted")}">` +
            `${pz(p.value / summe * 100)} % aller Arbeitslosen</span>` : "") +
          (g.altersgruppen?.length ? `<br><span style="color:${stil("--viz-muted")}">` +
            `Altersgruppen: ${g.altersgruppen.join(", ")}</span>` : "");
      },
    },
    xAxis: { ...achse(), type: "value", axisLine: { show: false },
             axisLabel: { color: stil("--viz-muted"), fontSize: 11, formatter: (v) => zahl(v) } },
    yAxis: { ...achse(), type: "category", data: namen, inverse: true,
             splitLine: { show: false },
             axisLabel: { color: stil("--viz-text-2"), fontSize: 12, lineHeight: 15,
                          width: 158, overflow: "break", margin: 12 } },
    series: [{
      type: "bar", data: werte, barWidth: "58%",
      itemStyle: { color: stil("--viz-series-1"), borderRadius: [0, 4, 4, 0] },
      label: { show: true, position: "right", distance: 8,
               color: stil("--viz-text-2"), fontSize: 11.5,
               formatter: (p) => zahl(p.value) },
    }],
  }, { replaceMerge: ["series", "yAxis"] });

  // Tabelle zeigt die unverfälschte Ebene: die AMS-Altersgruppen selbst
  const nachSchluessel = Object.fromEntries(daten.generationen.map((g) => [g.schluessel, g.name]));
  document.getElementById("t-generationen").innerHTML = tabelle(
    [{ titel: "Altersgruppe", wert: (z) => z.beschriftung },
     { titel: "Zugeordnete Generation", wert: (z) => nachSchluessel[z.generation] ?? z.generation },
     { titel: "Personen", num: true, wert: (z) => zahl(z.bestand) }],
    daten.altersgruppen ?? []
  );
}

/* --- 4 — Karte: Bezirksregionen, sequenzielle Skala hell → dunkel ----
   Die Flächen sind aus ganzen politischen Bezirken verschmolzen, damit die
   AMS-Zahlen exakt auf die Geometrie passen. Wo AMS-Region und Bezirk sich
   nicht decken (Wien, Graz, Linz), bildet die Karte die zusammengefasste
   Einheit ab — lieber gröber und richtig als fein und falsch. */
/* ECharts kennt nur Polygon und MultiPolygon. Die Geometriereparatur im ETL
   liefert bei kaputten Rändern aber eine GeometryCollection — Flächen plus
   die Linienreste, die beim Reparieren anfallen. ECharts sucht darin
   `coordinates`, findet nichts und wirft „Invalid geoJson format".
   Hier werden solche Sammlungen auf ihre Flächen reduziert. Das ETL macht
   dasselbe seit v12; diese Zeile hält auch ältere Datenstände am Leben. */
function flaechenNormalisieren(geo) {
  if (!geo?.features) return geo;
  const raus = (g) => {
    if (!g) return null;
    if (g.type === "Polygon" || g.type === "MultiPolygon") return g;
    if (g.type === "GeometryCollection") {
      const teile = (g.geometries ?? []).map(raus).filter(Boolean);
      if (!teile.length) return null;
      const ringe = teile.flatMap((t) =>
        t.type === "Polygon" ? [t.coordinates] : t.coordinates);
      return { type: "MultiPolygon", coordinates: ringe };
    }
    return null;
  };
  return {
    ...geo,
    features: geo.features
      .map((f) => ({ ...f, geometry: raus(f.geometry) }))
      .filter((f) => f.geometry),
  };
}

function baueKarte(karte, geo) {
  const feld = document.getElementById("c-karte");
  if (!karte || !geo) {
    /* Höhe zurücknehmen, sonst bleibt ein leerer Kasten stehen */
    feld.className = "";
    feld.style.height = "auto";
    feld.innerHTML = `<p class="viz-unterzeile" style="padding:4px 0 0">
      Die Karte ist gerade nicht verfügbar — die Werte stehen in der Tabelle
      „AMS-Bezirke“ weiter unten.</p>`;
    const knopf = document.querySelector('[data-ziel="t-karte"]');
    if (knopf) knopf.style.display = "none";
    return;
  }

  document.getElementById("u-karte").textContent =
    `Registrierte Arbeitslose am ${monat(karte.stand)} · ${karte.regionen.length} Regionen`;

  echarts.registerMap("at-bezirke", flaechenNormalisieren(geo));
  const d = echarts.init(feld, null, { renderer: "canvas" });
  const nachName = Object.fromEntries(karte.regionen.map((r) => [r.name, r]));
  const werte = karte.regionen.map((r) => ({ name: r.name, value: r.bestand }));
  const max = Math.max(...karte.regionen.map((r) => r.bestand));

  d.setOption({
    ...basis(),
    tooltip: {
      ...basis().tooltip, trigger: "item",
      formatter: (p) => {
        const r = nachName[p.name];
        if (!r) return `${p.name}<br><span style="color:${stil("--viz-muted")}">keine Daten</span>`;
        const v = r.veraenderung_pct;
        return `<strong>${r.name}</strong><br>` +
          `<span style="color:${stil("--viz-muted")}">${r.bundesland ?? ""}</span><br>` +
          `${zahl(r.bestand)} Arbeitslose` +
          (v === null || v === undefined ? "" :
            `<br><span style="color:${v > 0 ? stil("--viz-kritisch") : stil("--viz-gut")}">` +
            `${v > 0 ? "▲" : "▼"} ${pz(Math.abs(v))} % ggü. Vorjahr</span>`);
      },
    },
    visualMap: {
      min: 0, max: max, left: 12, bottom: 14, orient: "vertical",
      itemWidth: 12, itemHeight: 130, calculable: true,
      formatter: (v) => zahl(Math.round(v)),
      textStyle: { color: stil("--viz-muted"), fontSize: 11 },
      inRange: { color: [stil("--viz-seq-1"), stil("--viz-seq-2"), stil("--viz-seq-3"),
                         stil("--viz-seq-4"), stil("--viz-seq-5"), stil("--viz-seq-6")] },
    },
    series: [{
      type: "map", map: "at-bezirke", data: werte,
      roam: true, aspectScale: 0.78,
      itemStyle: { areaColor: stil("--viz-grid"), borderColor: stil("--viz-surface"), borderWidth: 0.8 },
      emphasis: { label: { show: false },
                  itemStyle: { borderColor: stil("--viz-text"), borderWidth: 1.5 } },
      select: { disabled: true },
    }],
  });
  diagramme.push(d);

  document.getElementById("t-karte").innerHTML = tabelle(
    [{ titel: "Region", wert: (z) => z.name },
     { titel: "Bundesland", wert: (z) => z.bundesland ?? "–" },
     { titel: "Personen", num: true, wert: (z) => zahl(z.bestand) },
     { titel: "ggü. Vorjahr", num: true,
       wert: (z) => z.veraenderung_pct === null || z.veraenderung_pct === undefined ? "–"
         : `${z.veraenderung_pct > 0 ? "+" : ""}${pz(z.veraenderung_pct)} %` }],
    [...karte.regionen].sort((x, y) => y.bestand - x.bestand)
  );
}

/* --- 6 — AMS-Bezirke: nur Tabelle, mit klarer Einordnung ------------ */
function baueBezirke(daten, meta) {
  if (!daten?.bezirke?.length) return;
  document.getElementById("u-bezirke").textContent =
    `${daten.bezirke.length} Geschäftsstellenbezirke · Stand ${monat(daten.stand)}`;
  document.getElementById("h-bezirke").textContent = meta.hinweis_bezirke ?? "";

  const zeilen = [...daten.bezirke].sort((a, b) => b.bestand - a.bestand);
  document.getElementById("t-bezirke").innerHTML = tabelle(
    [{ titel: "AMS-Bezirk", wert: (z) => z.name },
     { titel: "Bundesland", wert: (z) => z.bundesland ?? "–" },
     { titel: "Personen", num: true, wert: (z) => zahl(z.bestand) },
     { titel: "ggü. Vorjahr", num: true,
       wert: (z) => z.veraenderung_pct === null || z.veraenderung_pct === undefined ? "–" :
         `${z.veraenderung_pct > 0 ? "+" : ""}${pz(z.veraenderung_pct)} %` }],
    zeilen
  );
}

/* --- 5 — Bundesländer: Tabelle mit Sparklines ------------------------ */
function baueLaender(daten) {
  if (!daten?.laender?.length) return;
  document.getElementById("u-laender").textContent =
    `Stand ${monat(daten.stand)} · Verlauf der letzten ${daten.sparkline_monate.length} Monate`;

  const zeilen = daten.laender.map((l, i) => `
    <tr>
      <td>${l.name}</td>
      <td class="num">${zahl(l.bestand)}</td>
      <td class="num">${l.veraenderung_pct === null ? "–" :
        `<span class="${l.veraenderung_pct > 0 ? "viz-delta-hoch" : "viz-delta-runter"}">` +
        `${l.veraenderung_pct > 0 ? "▲" : "▼"} ${pz(Math.abs(l.veraenderung_pct))} %</span>`}</td>
      <td class="num">${l.quote_eu === null || l.quote_eu === undefined ? "–" : pz(l.quote_eu) + " %"}</td>
      <td class="viz-spark-zelle"><div id="bl-spark-${i}" style="height:30px"></div></td>
    </tr>`).join("");

  document.getElementById("t-laender").innerHTML = `
    <table class="viz-tabelle">
      <thead><tr>
        <th>Bundesland</th>
        <th class="num">Arbeitslose</th>
        <th class="num">ggü. Vorjahr</th>
        <th class="num">Quote EU-Def.</th>
        <th>Verlauf</th>
      </tr></thead>
      <tbody>${zeilen}</tbody>
    </table>`;

  daten.laender.forEach((l, i) => {
    const feld = document.getElementById(`bl-spark-${i}`);
    if (!feld) return;
    const d = echarts.init(feld, null, { renderer: "svg" });
    d.setOption({
      animation: false,
      grid: { left: 1, right: 1, top: 3, bottom: 3 },
      xAxis: { type: "category", show: false, data: l.sparkline.map((_, k) => k), boundaryGap: false },
      yAxis: { type: "value", show: false, min: "dataMin", max: "dataMax" },
      series: [{ type: "line", data: l.sparkline, showSymbol: false,
                 lineStyle: { width: 2, color: stil("--viz-series-1") } }],
    });
    diagramme.push(d);
  });
}

/* --- Quellenangabe (CC BY 4.0 verlangt Namensnennung) ---------------- */
function baueFuss(meta) {
  document.getElementById("fuss").innerHTML =
    "Datenquellen: " +
    meta.quellen.map((q) => `<a href="${q.url}" target="_blank" rel="noopener">${q.name}</a> (${q.lizenz})`).join(" · ") +
    `<br>${meta.hinweis_definitionen}`;
}



/* --- 7 — Zugänge und Abgänge ----------------------------------------
   Zwei Serien, deshalb Legende plus Endpunktbeschriftung. Der Bestand
   verschweigt die Bewegung dahinter — hier wird sie sichtbar. */
function baueFluss(daten) {
  if (!daten) return;
  const abschnitt = document.getElementById("s-fluss");
  if (abschnitt) abschnitt.style.display = "";

  const feld = document.getElementById("c-fluss");
  if (!feld) return;
  const d = echarts.getInstanceByDom(feld) || echarts.init(feld, null, { renderer: "svg" });
  if (!diagramme.includes(d)) diagramme.push(d);

  setzeText("u-fluss", `Bewegungen je Monat · letzte ${daten.monate.length} Monate`);
  setzeText("h-fluss", daten.hinweis);

  const farben = [stil("--viz-series-2"), stil("--viz-series-3")];
  const serien = [
    { name: "Zugänge", werte: daten.zugang },
    { name: "Abgänge", werte: daten.abgang },
  ].map((s, i) => ({
    name: s.name, type: "line", data: s.werte,
    showSymbol: false, symbol: "circle", symbolSize: 8,
    lineStyle: { width: 2, color: farben[i] },
    itemStyle: { color: farben[i] },
    emphasis: { focus: "series" },
    endLabel: { show: true, formatter: (p) => p.seriesName,
                color: stil("--viz-text-2"), fontSize: 11, distance: 6 },
    labelLayout: { moveOverlap: "shiftY" },
  }));

  d.setOption({
    ...basis(),
    grid: { left: 8, right: 100, top: 34, bottom: 8, containLabel: true },
    legend: { top: 0, left: 0, itemWidth: 11, itemHeight: 11, itemGap: 16,
              textStyle: { color: stil("--viz-text-2"), fontSize: 12 } },
    tooltip: {
      ...basis().tooltip, trigger: "axis",
      axisPointer: { type: "line", lineStyle: { color: stil("--viz-axis"), width: 1 } },
      formatter: (p) => {
        const i = p[0].dataIndex;
        const saldo = daten.saldo[i];
        return `<strong>${monat(daten.monate[i])}</strong><br>` +
          p.map((r) => `${r.marker} ${r.seriesName}&nbsp;&nbsp;<strong>${zahl(r.value)}</strong>`).join("<br>") +
          `<br><span style="color:${saldo > 0 ? stil("--viz-kritisch") : stil("--viz-gut")}">` +
          `Saldo ${saldo > 0 ? "+" : ""}${zahl(saldo)}</span>`;
      },
    },
    xAxis: { ...achse(), type: "category", boundaryGap: false, data: daten.monate,
      splitLine: { show: false },
      axisLabel: { color: stil("--viz-muted"), fontSize: 11,
        formatter: (v) => new Date(v).toLocaleDateString("de-AT", { month: "short", year: "2-digit" }) } },
    yAxis: { ...achse(), type: "value", axisLine: { show: false },
      axisLabel: { color: stil("--viz-muted"), fontSize: 11, formatter: (v) => zahl(v) } },
    series: serien,
  }, { replaceMerge: ["series"] });

  setzeHtml("t-fluss", tabelle(
    [{ titel: "Monat", wert: (z) => monat(z.m) },
     { titel: "Zugänge", num: true, wert: (z) => zahl(daten.zugang[z.i]) },
     { titel: "Abgänge", num: true, wert: (z) => zahl(daten.abgang[z.i]) },
     { titel: "Saldo", num: true,
       wert: (z) => (daten.saldo[z.i] > 0 ? "+" : "") + zahl(daten.saldo[z.i]) }],
    daten.monate.map((m, i) => ({ m, i })).reverse()
  ));
}

/* --- 8 — Vormerkdauer und Langzeitbeschäftigungslosigkeit ------------
   Geordnete Kategorien, deshalb eine Farbe: die Balkenlänge trägt die
   Größe, der Farbton hätte nichts hinzuzufügen. */
function baueDauer(daten) {
  if (!daten?.vormerkdauer?.gruppen?.length) return;
  const abschnitt = document.getElementById("s-dauer");
  if (abschnitt) abschnitt.style.display = "";

  const feld = document.getElementById("c-dauer");
  if (!feld) return;
  const d = echarts.getInstanceByDom(feld) || echarts.init(feld, null, { renderer: "svg" });
  if (!diagramme.includes(d)) diagramme.push(d);

  const gruppen = daten.vormerkdauer.gruppen;
  setzeText("u-dauer", `Wie lange die aktuell Vorgemerkten schon gemeldet sind · Stand ${monat(daten.vormerkdauer.stand)}`);
  setzeText("h-dauer", daten.langzeit?.hinweis ?? "");

  d.setOption({
    ...basis(),
    grid: { left: 150, right: 84, top: 10, bottom: 34 },
    tooltip: { ...basis().tooltip, trigger: "item",
      formatter: (p) => `<strong>${p.name}</strong><br>${zahl(p.value)} Personen<br>` +
        `<span style="color:${stil("--viz-muted")}">${pz(gruppen[p.dataIndex].anteil_pct)} % aller Vorgemerkten</span>` },
    xAxis: { ...achse(), type: "value", axisLine: { show: false },
      axisLabel: { color: stil("--viz-muted"), fontSize: 11, formatter: (v) => zahl(v) } },
    yAxis: { ...achse(), type: "category", inverse: true,
      data: gruppen.map((g) => g.name), splitLine: { show: false },
      axisLabel: { color: stil("--viz-text-2"), fontSize: 12, width: 136,
                   overflow: "break", margin: 12 } },
    series: [{ type: "bar", data: gruppen.map((g) => g.bestand), barWidth: "58%",
      itemStyle: { color: stil("--viz-series-1"), borderRadius: [0, 4, 4, 0] },
      label: { show: true, position: "right", distance: 8,
               color: stil("--viz-text-2"), fontSize: 11.5,
               formatter: (p) => zahl(p.value) } }],
  }, { replaceMerge: ["series", "yAxis"] });

  setzeHtml("t-dauer", tabelle(
    [{ titel: "Vormerkdauer", wert: (z) => z.name },
     { titel: "Personen", num: true, wert: (z) => zahl(z.bestand) },
     { titel: "Anteil", num: true, wert: (z) => pz(z.anteil_pct) + " %" }],
    gruppen
  ));
}

/* --- 9 — Personen in Schulung ---------------------------------------- */
function baueSchulung(daten) {
  if (!daten) return;
  const abschnitt = document.getElementById("s-schulung");
  if (abschnitt) abschnitt.style.display = "";

  const feld = document.getElementById("c-schulung");
  if (!feld) return;
  const d = echarts.getInstanceByDom(feld) || echarts.init(feld, null, { renderer: "svg" });
  if (!diagramme.includes(d)) diagramme.push(d);

  setzeText("u-schulung", `Bestand am Monatsende · Stand ${monat(daten.stand)}`);
  setzeText("h-schulung", daten.hinweis);

  d.setOption({
    ...basis(),
    grid: { left: 8, right: 20, top: 16, bottom: 8, containLabel: true },
    tooltip: { ...basis().tooltip, trigger: "axis",
      axisPointer: { type: "line", lineStyle: { color: stil("--viz-axis"), width: 1 } },
      formatter: (p) => `<strong>${monat(daten.monate[p[0].dataIndex])}</strong><br>` +
        `${zahl(p[0].value)} Personen in Schulung` },
    xAxis: { ...achse(), type: "category", boundaryGap: false, data: daten.monate,
      splitLine: { show: false },
      axisLabel: { color: stil("--viz-muted"), fontSize: 11,
        formatter: (v) => new Date(v).toLocaleDateString("de-AT", { month: "short", year: "2-digit" }) } },
    yAxis: { ...achse(), type: "value", axisLine: { show: false },
      axisLabel: { color: stil("--viz-muted"), fontSize: 11, formatter: (v) => zahl(v) } },
    series: [{ type: "line", data: daten.werte, showSymbol: false,
      lineStyle: { width: 2, color: stil("--viz-series-1") },
      areaStyle: { color: stil("--viz-series-1"), opacity: 0.10 } }],
  }, { replaceMerge: ["series"] });

  setzeHtml("t-schulung", tabelle(
    [{ titel: "Monat", wert: (z) => monat(z.m) },
     { titel: "In Schulung", num: true, wert: (z) => zahl(daten.werte[z.i]) }],
    daten.monate.map((m, i) => ({ m, i })).reverse()
  ));
}

/* --- 10 — Österreich im EU-Vergleich --------------------------------- */
function baueEu(daten) {
  if (!daten?.serien) return;
  const abschnitt = document.getElementById("s-eu");
  if (abschnitt) abschnitt.style.display = "";

  const feld = document.getElementById("c-eu");
  if (!feld) return;
  const d = echarts.getInstanceByDom(feld) || echarts.init(feld, null, { renderer: "svg" });
  if (!diagramme.includes(d)) diagramme.push(d);

  setzeText("u-eu", `${daten.definition} · ${daten.jahre[0]}–${daten.jahre[daten.jahre.length - 1]}`);
  setzeText("h-eu", "Diese Quote folgt der EU-weiten Definition und liegt " +
    "systematisch niedriger als die nationale AMS-Rechnung. Beide Zahlen sind " +
    "richtig, sie messen Unterschiedliches.");

  const farben = [stil("--viz-series-1"), stil("--viz-series-2"), stil("--viz-series-3")];
  const serien = Object.entries(daten.serien).map(([code, werte], i) => ({
    name: daten.namen?.[code] ?? code,
    type: "line", data: werte, showSymbol: true, symbol: "circle", symbolSize: 8,
    lineStyle: { width: 2, color: farben[i % farben.length] },
    itemStyle: { color: farben[i % farben.length] },
    emphasis: { focus: "series" },
    endLabel: { show: true, formatter: (p) => p.seriesName,
                color: stil("--viz-text-2"), fontSize: 11, distance: 6 },
    labelLayout: { moveOverlap: "shiftY" },
  }));

  d.setOption({
    ...basis(),
    grid: { left: 8, right: 120, top: 34, bottom: 8, containLabel: true },
    legend: { top: 0, left: 0, itemWidth: 11, itemHeight: 11, itemGap: 16,
              textStyle: { color: stil("--viz-text-2"), fontSize: 12 } },
    tooltip: { ...basis().tooltip, trigger: "axis",
      formatter: (p) => `<strong>${daten.jahre[p[0].dataIndex]}</strong><br>` +
        p.map((r) => `${r.marker} ${r.seriesName}&nbsp;&nbsp;<strong>${pz(r.value)} %</strong>`).join("<br>") },
    xAxis: { ...achse(), type: "category", boundaryGap: false, data: daten.jahre,
             splitLine: { show: false } },
    yAxis: { ...achse(), type: "value", axisLine: { show: false },
      axisLabel: { color: stil("--viz-muted"), fontSize: 11, formatter: (v) => v + " %" } },
    series: serien,
  }, { replaceMerge: ["series"] });

  setzeHtml("t-eu", tabelle(
    [{ titel: "Jahr", wert: (z) => z.j },
     ...Object.keys(daten.serien).map((code) => ({
       titel: daten.namen?.[code] ?? code, num: true,
       wert: (z) => daten.serien[code][z.i] === null ? "–" : pz(daten.serien[code][z.i]) + " %" }))],
    daten.jahre.map((j, i) => ({ j, i })).reverse()
  ));
}

/* --- 10b — EU-Rangliste: eine Farbe für Österreich, Grau für den Rest ---
   Die Botschaft ist "wo steht Österreich", nicht "welches Land ist welches".
   Dafür ist Hervorhebung die richtige Form: 26 bunte Balken würden genau die
   eine Information zudecken, um die es geht. */
function baueEuRang(daten) {
  if (!daten?.rangliste?.length) return;
  const feld = document.getElementById("c-eurang");
  if (!feld) return;
  const abschnitt = document.getElementById("s-eurang");
  if (abschnitt) abschnitt.style.display = "";

  const d = echarts.getInstanceByDom(feld) || echarts.init(feld, null, { renderer: "svg" });
  if (!diagramme.includes(d)) diagramme.push(d);

  const liste = daten.rangliste;
  const platz = daten.platz_oesterreich;
  setzeText("u-eurang",
    `${daten.definition} · ${daten.rang_jahr}` +
    (platz ? ` · Österreich auf Platz ${platz} von ${liste.length} EU-Ländern` : ""));
  setzeText("h-eurang",
    "Aufsteigend sortiert: links die niedrigste Quote. Diese Werte folgen der " +
    "EU-Definition und sind deshalb nicht mit den absoluten AMS-Zahlen weiter " +
    "oben verrechenbar.");

  d.setOption({
    ...basis(),
    grid: { left: 8, right: 40, top: 12, bottom: 8, containLabel: true },
    tooltip: { ...basis().tooltip, trigger: "item",
      formatter: (p) => {
        const e = liste[p.dataIndex];
        return `<strong>${e.name}</strong><br>${pz(e.wert)} % Arbeitslosenquote` +
          (e.hervorgehoben && platz ? `<br><span style="color:${stil("--viz-muted")}">` +
            `Platz ${platz} von ${liste.length}</span>` : "");
      } },
    xAxis: { ...achse(), type: "category", data: liste.map((e) => e.code),
      splitLine: { show: false },
      axisLabel: { color: stil("--viz-muted"), fontSize: 10.5, interval: 0,
                   hideOverlap: false } },
    yAxis: { ...achse(), type: "value", axisLine: { show: false },
      axisLabel: { color: stil("--viz-muted"), fontSize: 11, formatter: (v) => v + " %" } },
    series: [{
      type: "bar", barWidth: "62%",
      data: liste.map((e) => ({
        value: e.wert,
        itemStyle: {
          color: e.hervorgehoben ? stil("--viz-series-1") : stil("--viz-grid"),
          borderRadius: [4, 4, 0, 0],
        },
      })),
      label: {
        show: true, position: "top", fontSize: 10.5,
        color: stil("--viz-text-2"),
        /* Zahl nur dort, wo sie gebraucht wird: Österreich und die Ränder */
        formatter: (p) => {
          const e = liste[p.dataIndex];
          return (e.hervorgehoben || p.dataIndex === 0 || p.dataIndex === liste.length - 1)
            ? pz(e.wert) : "";
        },
      },
      /* EU-Schnitt als Linie statt als Balken — er ist kein Land */
      markLine: daten.eu_referenz === null || daten.eu_referenz === undefined ? undefined : {
        silent: true, symbol: "none",
        lineStyle: { color: stil("--viz-series-2"), width: 1.5, type: "dashed" },
        label: { formatter: `EU-27: ${pz(daten.eu_referenz)} %`,
                 color: stil("--viz-text-2"), fontSize: 11, position: "insideEndTop" },
        data: [{ yAxis: daten.eu_referenz }],
      },
    }],
  }, { replaceMerge: ["series", "xAxis"] });

  setzeHtml("t-eurang", tabelle(
    [{ titel: "Platz", num: true, wert: (z) => z.i + 1 },
     { titel: "Land", wert: (z) => z.name },
     { titel: "Quote", num: true, wert: (z) => pz(z.wert) + " %" }],
    liste.map((e, i) => ({ ...e, i }))
  ));
}

/* --- 11 — Offene Stellen und Stellenandrang -------------------------- */
function baueStellen(daten) {
  if (!daten?.laender?.length) return;
  const abschnitt = document.getElementById("s-stellen");
  if (abschnitt) abschnitt.style.display = "";

  const feld = document.getElementById("c-stellen");
  if (!feld) return;
  const d = echarts.getInstanceByDom(feld) || echarts.init(feld, null, { renderer: "svg" });
  if (!diagramme.includes(d)) diagramme.push(d);

  setzeText("u-stellen",
    `Arbeitslose je gemeldeter offener Stelle · Stand ${monat(daten.stand)} · ` +
    `${zahl(daten.stellen_gesamt)} offene Stellen gesamt`);
  setzeText("h-stellen", daten.hinweis);

  const sortiert = [...daten.laender].sort((a, b) => (b.andrang ?? 0) - (a.andrang ?? 0));

  d.setOption({
    ...basis(),
    grid: { left: 130, right: 72, top: 10, bottom: 34 },
    tooltip: { ...basis().tooltip, trigger: "item",
      formatter: (p) => {
        const l = sortiert[p.dataIndex];
        return `<strong>${l.name}</strong><br>${pz(l.andrang)} Arbeitslose je offener Stelle<br>` +
          `<span style="color:${stil("--viz-muted")}">${zahl(l.arbeitslose)} Arbeitslose · ` +
          `${zahl(l.stellen)} offene Stellen</span>`;
      } },
    xAxis: { ...achse(), type: "value", axisLine: { show: false },
      axisLabel: { color: stil("--viz-muted"), fontSize: 11 } },
    yAxis: { ...achse(), type: "category", inverse: true,
      data: sortiert.map((l) => l.name), splitLine: { show: false },
      axisLabel: { color: stil("--viz-text-2"), fontSize: 12, margin: 12 } },
    series: [{ type: "bar", data: sortiert.map((l) => l.andrang), barWidth: "58%",
      itemStyle: { color: stil("--viz-series-1"), borderRadius: [0, 4, 4, 0] },
      label: { show: true, position: "right", distance: 8,
               color: stil("--viz-text-2"), fontSize: 11.5,
               formatter: (p) => pz(p.value) } }],
  }, { replaceMerge: ["series", "yAxis"] });

  setzeHtml("t-stellen", tabelle(
    [{ titel: "Bundesland", wert: (z) => z.name },
     { titel: "Offene Stellen", num: true, wert: (z) => zahl(z.stellen) },
     { titel: "Arbeitslose", num: true, wert: (z) => zahl(z.arbeitslose) },
     { titel: "je Stelle", num: true, wert: (z) => z.andrang === null ? "–" : pz(z.andrang) }],
    sortiert
  ));
}

/* --- 12 — Nach Wirtschaftszweig -------------------------------------- */
function baueBranche(daten) {
  if (!daten?.branchen?.length) return;
  const abschnitt = document.getElementById("s-branche");
  if (abschnitt) abschnitt.style.display = "";

  const feld = document.getElementById("c-branche");
  if (!feld) return;
  const d = echarts.getInstanceByDom(feld) || echarts.init(feld, null, { renderer: "svg" });
  if (!diagramme.includes(d)) diagramme.push(d);

  /* Der ÖNACE-Schlüssel („O78200 - …") gehört nicht auf die Achse. Das ETL
     trennt ihn seit v15 selbst ab; hier passiert dasselbe noch einmal, damit
     auch ein älterer Datenstand saubere Beschriftungen zeigt. */
  const ohneCode = (b) => {
    if (b.code !== undefined) return b;
    const treffer = /^([A-Z]?\d{3,6})\s*-\s*(.+)$/.exec(b.name ?? "");
    if (!treffer) return b;
    const klar = /^k\.?\s?a\.?$/i.test(treffer[2].trim()) ? "Ohne Angabe" : treffer[2].trim();
    return { ...b, name: klar, code: treffer[1] };
  };
  daten = { ...daten, branchen: daten.branchen.map(ohneCode) };

  const top = daten.branchen.slice(0, 10);
  setzeText("u-branche", `Zehn größte Wirtschaftszweige · Stand ${monat(daten.stand)}`);
  setzeText("h-branche", daten.hinweis);

  d.setOption({
    ...basis(),
    grid: { left: 210, right: 84, top: 10, bottom: 34 },
    tooltip: { ...basis().tooltip, trigger: "item",
      formatter: (p) => {
        const b = top[p.dataIndex];
        const v = b.veraenderung_pct;
        return `<strong>${b.name}</strong><br>${zahl(b.bestand)} Arbeitslose` +
          (v === null || v === undefined ? "" :
            `<br><span style="color:${v > 0 ? stil("--viz-kritisch") : stil("--viz-gut")}">` +
            `${v > 0 ? "▲" : "▼"} ${pz(Math.abs(v))} % ggü. Vorjahr</span>`);
      } },
    xAxis: { ...achse(), type: "value", axisLine: { show: false },
      axisLabel: { color: stil("--viz-muted"), fontSize: 11, formatter: (v) => zahl(v) } },
    yAxis: { ...achse(), type: "category", inverse: true,
      data: top.map((b) => b.name), splitLine: { show: false },
      axisLabel: { color: stil("--viz-text-2"), fontSize: 12, width: 196,
                   overflow: "break", margin: 12 } },
    series: [{ type: "bar", data: top.map((b) => b.bestand), barWidth: "58%",
      itemStyle: { color: stil("--viz-series-1"), borderRadius: [0, 4, 4, 0] },
      label: { show: true, position: "right", distance: 8,
               color: stil("--viz-text-2"), fontSize: 11.5,
               formatter: (p) => zahl(p.value) } }],
  }, { replaceMerge: ["series", "yAxis"] });

  setzeHtml("t-branche", tabelle(
    [{ titel: "Wirtschaftszweig", wert: (z) => z.name },
     { titel: "ÖNACE", wert: (z) => z.code || "–" },
     { titel: "Arbeitslose", num: true, wert: (z) => zahl(z.bestand) },
     { titel: "ggü. Vorjahr", num: true,
       wert: (z) => z.veraenderung_pct === null || z.veraenderung_pct === undefined ? "–"
         : `${z.veraenderung_pct > 0 ? "+" : ""}${pz(z.veraenderung_pct)} %` }],
    daten.branchen
  ));
}

/* --- 15 — Phillips-Kurve: Inflation gegen Arbeitslosigkeit -----------
   Beide Größen sind Prozentwerte derselben Quelle und derselben Frequenz —
   nur deshalb dürfen sie in einer Grafik stehen. Als verbundenes
   Streudiagramm, weil die Frage „wie hängen die zwei zusammen" lautet und
   nicht „wie verlief jede für sich". Der Pfad macht die Jahre lesbar.
   Beschriftet werden nur erstes und letztes Jahr je Land; jeder Punkt an
   jedem Jahr wäre Zahlensalat. */
function bauePhillips(daten) {
  if (!daten?.inflation || !daten?.serien || !daten?.jahre) return;
  const abschnitt = document.getElementById("s-phillips");
  const feld = document.getElementById("c-phillips");
  if (!feld) return;

  /* Nur Gebiete, für die BEIDE Reihen vorliegen. */
  const gebiete = Object.keys(daten.inflation)
    .filter((code) => Array.isArray(daten.serien[code]));
  const punkte = {};
  for (const code of gebiete) {
    punkte[code] = daten.jahre
      .map((jahr, i) => ({ jahr, x: daten.serien[code][i], y: daten.inflation[code][i] }))
      .filter((p) => p.x !== null && p.x !== undefined && p.y !== null && p.y !== undefined);
  }
  const brauchbar = gebiete.filter((code) => punkte[code].length >= 2);
  if (!brauchbar.length) return;
  if (abschnitt) abschnitt.style.display = "";

  const d = echarts.getInstanceByDom(feld) || echarts.init(feld, null, { renderer: "svg" });
  if (!diagramme.includes(d)) diagramme.push(d);

  const alle = brauchbar.flatMap((c) => punkte[c]);
  const jahrVon = Math.min(...alle.map((p) => Number(p.jahr)));
  const jahrBis = Math.max(...alle.map((p) => Number(p.jahr)));
  setzeText("u-phillips",
    `Arbeitslosenquote (waagrecht) und HVPI-Inflation (senkrecht), ${jahrVon}–${jahrBis} · ` +
    `je Punkt ein Jahr`);
  setzeText("h-phillips",
    "Beide Werte stammen von Eurostat, sind Jahreswerte und in Prozent — deshalb " +
    "stehen sie auf einer gemeinsamen Skala. Der Verlauf zeigt, wie sich beide " +
    "Größen gemeinsam bewegt haben. Er belegt keinen ursächlichen Zusammenhang: " +
    "Der klassische Gegenlauf von Inflation und Arbeitslosigkeit ist empirisch " +
    "umstritten und war 2021–2023 durch Energiepreise und Lieferketten überlagert.");

  const farben = [stil("--viz-series-1"), stil("--viz-series-2"), stil("--viz-series-3")];
  const serien = brauchbar.map((code, i) => {
    const liste = punkte[code];
    const farbe = farben[i % farben.length];
    return {
      name: daten.namen?.[code] ?? code,
      type: "line",
      data: liste.map((p) => [p.x, p.y, p.jahr]),
      showSymbol: true, symbol: "circle", symbolSize: 9,
      lineStyle: { width: 2, color: farbe },
      itemStyle: { color: farbe, borderColor: stil("--viz-surface"), borderWidth: 2 },
      emphasis: { focus: "series" },
      /* Nur Anfang und Ende beschriften — sonst 21 Zahlen im Bild. */
      label: {
        show: true, fontSize: 11, color: stil("--viz-text-2"),
        position: "top", distance: 8,
        formatter: (p) => (p.dataIndex === 0 || p.dataIndex === liste.length - 1)
          ? p.value[2] : "",
      },
    };
  });

  d.setOption({
    ...basis(),
    /* containLabel rechnet die Achsen-NAMEN nicht ein — ohne festen Rand
       links und unten fällt „Inflation" aus dem Bild. */
    grid: { left: 56, right: 28, top: 40, bottom: 52, containLabel: true },
    legend: { top: 0, left: 0, itemWidth: 11, itemHeight: 11, itemGap: 16,
              textStyle: { color: stil("--viz-text-2"), fontSize: 12 } },
    tooltip: { ...basis().tooltip, trigger: "item",
      formatter: (p) => `<strong>${p.seriesName} ${p.value[2]}</strong><br>` +
        `Arbeitslosenquote&nbsp;&nbsp;<strong>${pz(p.value[0])} %</strong><br>` +
        `Inflation&nbsp;&nbsp;<strong>${pz(p.value[1])} %</strong>` },
    xAxis: { ...achse(), type: "value", scale: true,
      name: "Arbeitslosenquote", nameLocation: "middle", nameGap: 30,
      nameTextStyle: { color: stil("--viz-muted"), fontSize: 11 },
      axisLabel: { color: stil("--viz-muted"), fontSize: 11, formatter: (v) => v + " %" } },
    yAxis: { ...achse(), type: "value", scale: true, axisLine: { show: false },
      name: "Inflation", nameLocation: "middle", nameGap: 46,
      nameTextStyle: { color: stil("--viz-muted"), fontSize: 11 },
      axisLabel: { color: stil("--viz-muted"), fontSize: 11, formatter: (v) => v + " %" } },
    series: serien,
  }, { replaceMerge: ["series"] });

  setzeHtml("t-phillips", tabelle(
    [{ titel: "Jahr", wert: (z) => z.j },
     ...brauchbar.flatMap((code) => {
       const name = daten.namen?.[code] ?? code;
       return [
         { titel: `${name}: Arbeitslosenquote`, num: true,
           wert: (z) => daten.serien[code][z.i] === null ? "–" : pz(daten.serien[code][z.i]) + " %" },
         { titel: `${name}: Inflation`, num: true,
           wert: (z) => daten.inflation[code][z.i] === null ? "–" : pz(daten.inflation[code][z.i]) + " %" },
       ];
     })],
    daten.jahre.map((j, i) => ({ j, i })).reverse()
  ));
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

/* --- Einbetten: Schnipsel bauen und anzeigen -------------------------
   Die Quellenangabe steckt in der eingebetteten Grafik selbst. Wer sie
   weiterverbreitet, transportiert die Namensnennung damit zwangsläufig mit —
   das ist die Bedingung der CC-BY-Lizenz der Datenquellen. */
const EINBETT_HOEHEN = {
  zeitreihe: 460, ausbildung: 540, verlauf: 540, generationen: 460,
  karte: 590, fluss: 460, dauer: 440, schulung: 420,
  stellen: 440, branche: 560, eu: 460, eurang: 440,
};
const EINBETT_TITEL = {
  zeitreihe: "Arbeitslosigkeit in Österreich, Monatsverlauf",
  ausbildung: "Arbeitslosigkeit nach höchster abgeschlossener Ausbildung",
  verlauf: "Verlauf der Arbeitslosigkeit in den größten Ausbildungsgruppen",
  generationen: "Darstellung der Arbeitslosigkeit nach Generationen",
  karte: "Verteilung der Arbeitslosigkeit nach Bezirken",
  fluss: "Zugänge und Abgänge in die Arbeitslosigkeit",
  dauer: "Dauer der bestehenden Arbeitslosigkeit",
  schulung: "Personen in Schulung — nicht in der Arbeitslosigkeit enthalten",
  stellen: "Offene Stellen und Arbeitslose je offener Stelle",
  branche: "Arbeitslosigkeit nach Wirtschaftszweig",
  eu: "Arbeitslosenquote im Vergleich mit EU-27 und Deutschland",
  eurang: "Arbeitslosenquote: Wo Österreich in der EU steht",
  phillips: "Inflation im Verhältnis zur Arbeitslosigkeit",
};

function einbettBasis() {
  const pfad = location.href.replace(/[^/]*$/, "");
  return pfad.replace(/\/$/, "");
}

function einbettCode(chart) {
  const hoehe = EINBETT_HOEHEN[chart] ?? 480;
  const titel = EINBETT_TITEL[chart] ?? "Arbeitsmarkt Österreich";
  return `<iframe title="${titel}"
        src="${einbettBasis()}/embed.html?chart=${chart}"
        width="100%" height="${hoehe}" style="border:0" loading="lazy"
        scrolling="no"></iframe>
<script>
/* passt die Höhe automatisch an — optional, ohne greift die Höhe oben */
addEventListener("message", function (e) {
  if (!e.data || e.data.typ !== "ams-hoehe") return;
  document.querySelectorAll('iframe[src*="embed.html"]').forEach(function (f) {
    if (f.contentWindow === e.source) f.style.height = e.data.hoehe + "px";
  });
});
<\/script>`;
}

function verdrahteEinbetten(meta) {
  const dialog = document.getElementById("einbett-dialog");
  if (!dialog) return;
  const feld = document.getElementById("einbett-code");
  const credit = document.getElementById("einbett-credit");
  const angaben = meta?.einbettung ?? {};

  document.addEventListener("click", (e) => {
    const knopf = e.target.closest(".viz-einbetten");
    if (!knopf) return;
    feld.value = einbettCode(knopf.dataset.chart);
    credit.textContent =
      `Datenquelle: AMS Österreich, STATISTIK AUSTRIA, Eurostat (CC BY 4.0) · ` +
      `Grafik: ${angaben.grafik_von ?? "—"}`;
    dialog.showModal();
  });

  document.getElementById("einbett-schliessen")?.addEventListener(
    "click", () => dialog.close());
  document.getElementById("einbett-kopieren")?.addEventListener("click", async (e) => {
    feld.select();
    try {
      await navigator.clipboard.writeText(feld.value);
      e.target.textContent = "Kopiert";
      setTimeout(() => (e.target.textContent = "Code kopieren"), 1600);
    } catch {
      document.execCommand("copy");        /* ältere Browser */
    }
  });
}

global.AMS = {
  hole, basis, achse, tabelle, stil, zahl, pz, monat, deltaText, diagramme,
  baueKpis, baueZeitreihe, baueAusbildung, baueVerlauf, baueGenerationen,
  baueKarte, baueLaender, baueBezirke, baueFuss,
  baueFluss, baueDauer, baueSchulung, baueEu, baueEuRang, bauePhillips,
  baueStellen, baueBranche,
  einbettCode, verdrahteEinbetten, EINBETT_TITEL,
  setzeBasis: (pfad) => { DATEN_BASIS = pfad; },
  setzeWurzel: (element) => { wurzel = element; },
  start,
};
})(window);
