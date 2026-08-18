/* ===========================================================================
   Arbeitsmarkt-Dashboard Österreich — Themenstrang: ausbildung
   ---------------------------------------------------------------------------
   Wird nach js/kern.js geladen; die Helfer kommen aus window.AMS.
   Der Diagrammcode selbst ist unverändert aus charts.js (v17) übernommen.
   =========================================================================== */
(function (AMS) {
"use strict";
const { stil, zahl, pz, monat, basis, achse, tabelle, setzeText, setzeHtml,
        deltaText, diagramme, schrift ,
        istSchmal, balkenGitter, kategorieLabel, legende, endLabelZeigen} = AMS;

/* --- 3 — Ausbildungsstand: eine Farbe, Länge trägt die Größe ---------
   Das Diagramm zeigt 7 Gruppen; die 18 Einzelstufen des AMS stehen in
   der Tabellenansicht. Mehr als etwa sieben Balken kann man nicht mehr
   sinnvoll vergleichen. */
function baueAusbildung(daten, region) {
  const S = schrift();   /* Schriftgrößen aus den CSS-Variablen */
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
    grid: balkenGitter(document.getElementById("c-ausbildung"), { left: 172, right: 72 }),
    tooltip: {
      ...basis().tooltip, trigger: "item",
      formatter: (p) => `<strong>${p.name}</strong><br>${zahl(p.value)} Personen` +
        (summe ? `<br><span style="color:${stil("--viz-muted")}">${pz(p.value / summe * 100)} % aller Arbeitslosen</span>` : ""),
    },
    xAxis: { ...achse(), type: "value", axisLine: { show: false },
             axisLabel: { hideOverlap: true, color: stil("--viz-muted"), fontSize: S.achse, formatter: (v) => zahl(v) } },
    yAxis: { ...achse(), type: "category", data: namen, inverse: true,
             splitLine: { show: false },
             axisLabel: { color: stil("--viz-text-2"), fontSize: S.serie,
                          width: 158, overflow: "break", margin: 12,
                          ...kategorieLabel(document.getElementById("c-ausbildung"), 172, namen.length) } },
    series: [{
      type: "bar",
      data: werte,
      barWidth: "58%",
      itemStyle: { color: stil("--viz-series-1"), borderRadius: [0, 4, 4, 0] },
      label: { show: true, position: "right", distance: 8,
               color: stil("--viz-text-2"), fontSize: S.label,
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

AMS.baueAusbildung = baueAusbildung;
})(window.AMS);
