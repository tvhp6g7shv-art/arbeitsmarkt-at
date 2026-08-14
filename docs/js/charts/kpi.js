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

/* --- 1 — KPI-Kacheln (Kennzahl + Veränderung) -------------------------
   Die Sparkline in der ersten Kachel ist in v20 entfallen (User-Entscheid).
   Sie zeigte 36 Monate ohne Achsen und ohne Beschriftung — dieselbe Reihe,
   die direkt darunter als vollständiges Diagramm mit Achsen steht. Der
   Parameter `zeitreihe` ist damit hinfällig; die Aufrufer geben ihn nicht
   mehr mit. */
function baueKpis(kpi) {
  if (!kpi) return;
  const g = kpi.nach_geschlecht || {};
  const gesamt = kpi.arbeitslose_gesamt || 0;
  const anteil = (v) => (gesamt && v) ? `${pz(v / gesamt * 100)} % aller Arbeitslosen` : "";
  const kacheln = [
    { titel: "Arbeitslose insgesamt", wert: kpi.arbeitslose_gesamt, delta: kpi.veraenderung_pct },
    { titel: "Männer", wert: g.M ?? g.m, unter: anteil(g.M ?? g.m) },
    { titel: "Frauen", wert: g.W ?? g.w, unter: anteil(g.W ?? g.w) },
    {
      titel: "Arbeitslosenquote EU-Definition",
      text: kpi.quote_eu ? `${pz(kpi.quote_eu.spanne[0])} – ${pz(kpi.quote_eu.spanne[1])} %` : "–",
      unter: kpi.quote_eu ? `Spannweite der Bundesländer, ${kpi.quote_eu.jahr}` : "",
    },
  ];

  document.getElementById("kpis").innerHTML = kacheln.map((k) => `
    <div class="viz-kpi">
      <p class="viz-kpi-titel">${k.titel}</p>
      <div class="viz-kpi-wert">${k.text ?? zahl(k.wert)}</div>
      <div class="viz-kpi-delta">${k.delta !== undefined ? deltaText(k.delta) : (k.unter ?? "")}</div>
    </div>`).join("");

}

AMS.baueKpis = baueKpis;
})(window.AMS);
