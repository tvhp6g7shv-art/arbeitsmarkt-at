/* ===========================================================================
   Arbeitsmarkt-Dashboard Österreich — Themenstrang: eu
   ---------------------------------------------------------------------------
   Wird nach js/kern.js geladen; die Helfer kommen aus window.AMS.
   Der Diagrammcode selbst ist unverändert aus charts.js (v17) übernommen.
   =========================================================================== */
(function (AMS) {
"use strict";
const { stil, zahl, pz, monat, basis, achse, tabelle, setzeText, setzeHtml,
        deltaText, diagramme } = AMS;

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

AMS.baueEu = baueEu;
})(window.AMS);
