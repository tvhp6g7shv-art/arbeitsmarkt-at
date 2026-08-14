/* ===========================================================================
   Arbeitsmarkt-Dashboard Österreich — Themenstrang: zeitreihe
   ---------------------------------------------------------------------------
   Wird nach js/kern.js geladen; die Helfer kommen aus window.AMS.
   Der Diagrammcode selbst ist unverändert aus charts.js (v17) übernommen.
   =========================================================================== */
(function (AMS) {
"use strict";
const { stil, zahl, pz, monat, basis, achse, tabelle, setzeText, setzeHtml,
        deltaText, diagramme, schrift ,
        istSchmal, balkenGitter, kategorieLabel, legende, endLabelZeigen} = AMS;

/* --- 2 — Zeitreihe: zwei Serien -> Legende + Endpunkt-Beschriftung --- */
function baueZeitreihe(daten) {
  const S = schrift();   /* Schriftgrößen aus den CSS-Variablen */
  if (!daten?.monate?.length) return;
  const feld = document.getElementById("c-zeitreihe");
  const d = echarts.init(feld, null, { renderer: "svg" });
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
    endLabel: {           /* selektive Direktbeschriftung statt Zahl an jedem Punkt.
                             Schmal abgeschaltet: sie kostet 70 px Breite, die dann
                             der Zeichenflaeche fehlen. Die Legende oben bleibt. */
      show: endLabelZeigen(feld), formatter: (p) => p.seriesName,
      color: stil("--viz-text-2"), fontSize: S.label, distance: 6,
    },
  }));

  d.setOption({
    ...basis(),
    grid: { left: 8, right: endLabelZeigen(feld) ? 70 : 8, top: 34, bottom: 8,
            containLabel: true },
    legend: legende(feld, {         /* bei >= 2 Serien immer vorhanden */
      top: 0, left: 0, itemWidth: 11, itemHeight: 11, itemGap: 18,
      textStyle: { color: stil("--viz-text-2"), fontSize: S.serie },
    }),
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
        hideOverlap: true,
        color: stil("--viz-muted"), fontSize: S.achse,
        formatter: (v) => new Date(v).getMonth() === 0 ? new Date(v).getFullYear() : "",
        interval: 0,
      },
    },
    yAxis: {
      ...achse(), type: "value",
      axisLine: { show: false },
      axisLabel: { hideOverlap: true, color: stil("--viz-muted"), fontSize: S.achse, formatter: (v) => zahl(v) },
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

AMS.baueZeitreihe = baueZeitreihe;
})(window.AMS);
