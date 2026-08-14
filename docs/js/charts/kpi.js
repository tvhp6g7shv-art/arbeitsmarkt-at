/* ===========================================================================
   Arbeitsmarkt-Dashboard Österreich — Themenstrang: kpi
   ---------------------------------------------------------------------------
   Wird nach js/kern.js geladen; die Helfer kommen aus window.AMS.
   Der Diagrammcode selbst ist unverändert aus charts.js (v17) übernommen.
   =========================================================================== */
(function (AMS) {
"use strict";
const { stil, zahl, pz, monat, basis, achse, tabelle, setzeText, setzeHtml,
        deltaText, diagramme } = AMS;

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

AMS.baueKpis = baueKpis;
})(window.AMS);
