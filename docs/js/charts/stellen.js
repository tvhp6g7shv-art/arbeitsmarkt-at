/* ===========================================================================
   Arbeitsmarkt-Dashboard Österreich — Themenstrang: stellen
   ---------------------------------------------------------------------------
   Wird nach js/kern.js geladen; die Helfer kommen aus window.AMS.
   Der Diagrammcode selbst ist unverändert aus charts.js (v17) übernommen.
   =========================================================================== */
(function (AMS) {
"use strict";
const { stil, zahl, pz, monat, basis, achse, tabelle, setzeText, setzeHtml,
        deltaText, diagramme, schrift ,
        istSchmal, balkenGitter, kategorieLabel, legende, endLabelZeigen,
        hoverDunkler} = AMS;

/* --- 11 — Offene Stellen und Stellenandrang -------------------------- */
function baueStellen(daten) {
  const S = schrift();   /* Schriftgrößen aus den CSS-Variablen */
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
    grid: balkenGitter(feld, { left: 130, right: 72 }),
    tooltip: { ...basis().tooltip, trigger: "item",
      formatter: (p) => {
        const l = sortiert[p.dataIndex];
        return `<strong>${l.name}</strong><br>${pz(l.andrang)} Arbeitslose je offener Stelle<br>` +
          `<span style="color:${stil("--viz-muted")}">${zahl(l.arbeitslose)} Arbeitslose · ` +
          `${zahl(l.stellen)} offene Stellen</span>`;
      } },
    xAxis: { ...achse(), type: "value", axisLine: { show: false },
      axisLabel: { hideOverlap: true, color: stil("--viz-muted"), fontSize: S.achse } },
    yAxis: { ...achse(), type: "category", inverse: true,
      data: sortiert.map((l) => l.name), splitLine: { show: false },
      axisLabel: { color: stil("--viz-text-2"), fontSize: S.serie, margin: 12,
                   ...kategorieLabel(feld, 130, sortiert.length) } },
    series: [{ type: "bar", data: sortiert.map((l) => l.andrang), barWidth: "58%",
      itemStyle: { color: stil("--viz-series-1"), borderRadius: [0, 4, 4, 0] },
      /* Ohne die Angabe hellt ECharts den Balken beim Hover auf. */
      emphasis: hoverDunkler(stil("--viz-series-1")),
      label: { show: true, position: "right", distance: 8,
               color: stil("--viz-text-2"), fontSize: S.label,
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

AMS.baueStellen = baueStellen;
})(window.AMS);
