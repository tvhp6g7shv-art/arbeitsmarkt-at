/* ===========================================================================
   Arbeitsmarkt-Dashboard Österreich — Themenstrang: fluss
   ---------------------------------------------------------------------------
   Wird nach js/kern.js geladen; die Helfer kommen aus window.AMS.
   Der Diagrammcode selbst ist unverändert aus charts.js (v17) übernommen.
   =========================================================================== */
(function (AMS) {
"use strict";
const { stil, zahl, pz, monat, basis, achse, tabelle, setzeText, setzeHtml,
        deltaText, diagramme, schrift } = AMS;

/* --- 7 — Zugänge und Abgänge ----------------------------------------
   Zwei Serien, deshalb Legende plus Endpunktbeschriftung. Der Bestand
   verschweigt die Bewegung dahinter — hier wird sie sichtbar. */
function baueFluss(daten) {
  const S = schrift();   /* Schriftgrößen aus den CSS-Variablen */
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
                color: stil("--viz-text-2"), fontSize: S.achse, distance: 6 },
    labelLayout: { moveOverlap: "shiftY" },
  }));

  d.setOption({
    ...basis(),
    grid: { left: 8, right: 100, top: 34, bottom: 8, containLabel: true },
    legend: { top: 0, left: 0, itemWidth: 11, itemHeight: 11, itemGap: 16,
              textStyle: { color: stil("--viz-text-2"), fontSize: S.serie } },
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
      axisLabel: { color: stil("--viz-muted"), fontSize: S.achse,
        formatter: (v) => new Date(v).toLocaleDateString("de-AT", { month: "short", year: "2-digit" }) } },
    yAxis: { ...achse(), type: "value", axisLine: { show: false },
      axisLabel: { color: stil("--viz-muted"), fontSize: S.achse, formatter: (v) => zahl(v) } },
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

AMS.baueFluss = baueFluss;
})(window.AMS);
