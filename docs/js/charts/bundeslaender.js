/* ===========================================================================
   Arbeitsmarkt-Dashboard Österreich — Themenstrang: bundeslaender
   ---------------------------------------------------------------------------
   Wird nach js/kern.js geladen; die Helfer kommen aus window.AMS.
   Der Diagrammcode selbst ist unverändert aus charts.js (v17) übernommen.
   =========================================================================== */
(function (AMS) {
"use strict";
const { stil, zahl, pz, monat, basis, achse, tabelle, setzeText, setzeHtml,
        deltaText, diagramme } = AMS;

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

AMS.baueLaender = baueLaender;
})(window.AMS);
