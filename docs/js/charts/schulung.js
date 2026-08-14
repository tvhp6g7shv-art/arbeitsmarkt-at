/* ===========================================================================
   Arbeitsmarkt-Dashboard Österreich — Themenstrang: schulung
   ---------------------------------------------------------------------------
   Wird nach js/kern.js geladen; die Helfer kommen aus window.AMS.
   Der Diagrammcode selbst ist unverändert aus charts.js (v17) übernommen.
   =========================================================================== */
(function (AMS) {
"use strict";
const { stil, zahl, pz, monat, basis, achse, tabelle, setzeText, setzeHtml,
        deltaText, diagramme, schrift } = AMS;

/* --- 9 — Personen in Schulung ---------------------------------------- */
function baueSchulung(daten) {
  const S = schrift();   /* Schriftgrößen aus den CSS-Variablen */
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
      axisLabel: { color: stil("--viz-muted"), fontSize: S.achse,
        formatter: (v) => new Date(v).toLocaleDateString("de-AT", { month: "short", year: "2-digit" }) } },
    yAxis: { ...achse(), type: "value", axisLine: { show: false },
      axisLabel: { color: stil("--viz-muted"), fontSize: S.achse, formatter: (v) => zahl(v) } },
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

AMS.baueSchulung = baueSchulung;
})(window.AMS);
