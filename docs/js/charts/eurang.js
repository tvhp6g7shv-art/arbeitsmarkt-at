/* ===========================================================================
   Arbeitsmarkt-Dashboard Österreich — Themenstrang: eurang
   ---------------------------------------------------------------------------
   Wird nach js/kern.js geladen; die Helfer kommen aus window.AMS.
   Der Diagrammcode selbst ist unverändert aus charts.js (v17) übernommen.
   =========================================================================== */
(function (AMS) {
"use strict";
const { stil, zahl, pz, monat, basis, achse, tabelle, setzeText, setzeHtml,
        deltaText, diagramme, schrift ,
        istSchmal, balkenGitter, kategorieLabel, legende, endLabelZeigen} = AMS;

/* --- 10b — EU-Rangliste: eine Farbe für Österreich, Grau für den Rest ---
   Die Botschaft ist "wo steht Österreich", nicht "welches Land ist welches".
   Dafür ist Hervorhebung die richtige Form: 26 bunte Balken würden genau die
   eine Information zudecken, um die es geht. */
function baueEuRang(daten) {
  const S = schrift();   /* Schriftgrößen aus den CSS-Variablen */
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
      axisLabel: { hideOverlap: true, color: stil("--viz-muted"), fontSize: S.eng, interval: 0,
                   hideOverlap: false } },
    yAxis: { ...achse(), type: "value", axisLine: { show: false },
      axisLabel: { hideOverlap: true, color: stil("--viz-muted"), fontSize: S.achse, formatter: (v) => v + " %" } },
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
        show: true, position: "top", fontSize: S.eng,
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
                 color: stil("--viz-text-2"), fontSize: S.achse, position: "insideEndTop" },
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

AMS.baueEuRang = baueEuRang;
})(window.AMS);
