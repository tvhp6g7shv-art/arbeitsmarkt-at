/* ===========================================================================
   Arbeitsmarkt-Dashboard Österreich — Themenstrang: phillips
   ---------------------------------------------------------------------------
   Wird nach js/kern.js geladen; die Helfer kommen aus window.AMS.
   Der Diagrammcode selbst ist unverändert aus charts.js (v17) übernommen.
   =========================================================================== */
(function (AMS) {
"use strict";
const { stil, zahl, pz, monat, basis, achse, tabelle, setzeText, setzeHtml,
        deltaText, diagramme } = AMS;

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
      /* Anfangs- und Endjahre verschiedener Länder landen gern übereinander. */
      labelLayout: { moveOverlap: "shiftY" },
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

AMS.bauePhillips = bauePhillips;
})(window.AMS);
