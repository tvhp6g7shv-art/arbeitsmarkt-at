/* ===========================================================================
   Arbeitsmarkt-Dashboard Österreich — Themenstrang: bezirke
   ---------------------------------------------------------------------------
   Wird nach js/kern.js geladen; die Helfer kommen aus window.AMS.
   Der Diagrammcode selbst ist unverändert aus charts.js (v17) übernommen.
   =========================================================================== */
(function (AMS) {
"use strict";
const { stil, zahl, pz, monat, basis, achse, tabelle, setzeText, setzeHtml,
        deltaText, diagramme } = AMS;

/* --- 6 — AMS-Bezirke: nur Tabelle, mit klarer Einordnung ------------ */
function baueBezirke(daten, meta) {
  if (!daten?.bezirke?.length) return;
  document.getElementById("u-bezirke").textContent =
    `${daten.bezirke.length} Geschäftsstellenbezirke · Stand ${monat(daten.stand)}`;
  document.getElementById("h-bezirke").textContent = meta.hinweis_bezirke ?? "";

  const zeilen = [...daten.bezirke].sort((a, b) => b.bestand - a.bestand);
  document.getElementById("t-bezirke").innerHTML = tabelle(
    [{ titel: "AMS-Bezirk", wert: (z) => z.name },
     { titel: "Bundesland", wert: (z) => z.bundesland ?? "–" },
     { titel: "Personen", num: true, wert: (z) => zahl(z.bestand) },
     { titel: "ggü. Vorjahr", num: true,
       wert: (z) => z.veraenderung_pct === null || z.veraenderung_pct === undefined ? "–" :
         `${z.veraenderung_pct > 0 ? "+" : ""}${pz(z.veraenderung_pct)} %` }],
    zeilen
  );
}

AMS.baueBezirke = baueBezirke;
})(window.AMS);
