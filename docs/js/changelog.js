/* ===========================================================================
   Arbeitsmarkt-Dashboard Österreich — Changelog-Seite aus changelog.json
   ---------------------------------------------------------------------------
   WARUM ES DIESE DATEI GIBT (20.08.2026)

   Die Changelog-Seite auf arbeitsmarkt-monitor.at war handgepflegtes Markup im
   Oxygen-Builder. Die Versionsnummer stand damit an VIER Stellen — `VERSION`
   in kern.js, `?v=NN` als Cachebrecher, `docs/data/changelog.json` fuer den
   Bluesky-Bot und eben die Seite selbst. Am 20.08. ging genau das schief: der
   Abschnitt „Zwei Oesterreichs" stand oeffentlich auf der Startseite, die
   Fusszeile sagte weiterhin V 02, und die Changelog-Seite kannte ihn nicht.

   Ab jetzt rendert die Seite aus `changelog.json`. Wer dort eine Ausgabe
   ergaenzt, ergaenzt Seite, Fusszeile und Bluesky-Beitrag in einem Zug.

   WAS DIESE DATEI NICHT LOEST: `kern.js` liest seine `VERSION` weiterhin aus
   einem Literal, nicht aus der JSON. Der Grund steht in
   `social/pruefe_version.py`: `signaturHtml()` laeuft synchron beim
   Seitenaufbau, ein `fetch` kaeme zu spaet. Solange das so ist, haelt der
   Workflow beide Staende gegeneinander und faellt durch, wenn sie
   auseinanderlaufen. Diese Pruefung ersetzt den Umbau, sie macht ihn nicht
   ueberfluessig.

   EINBAU: ein leeres `<div id="changelog-ausgaben">` an der Stelle, an der
   die Eintraege stehen sollen; optional ein zweites fuer die Vorgeschichte.
   Diese Datei danach laden. Sie braucht kern.js NICHT — die Changelog-Seite
   ist kein Dashboard und laedt keine Diagramme.
   =========================================================================== */
(function () {
"use strict";

/* Feste Adresse statt aus location.href abgeleitet: die Seite liegt auf
   WordPress, die Daten auf GitHub Pages. Derselbe Grund wie bei
   `PAGES_BASIS` in einbetten.js. */
var PAGES = "https://tvhp6g7shv-art.github.io/arbeitsmarkt-at";

/* Kein innerHTML aus fremden Daten ohne Not — aber `seite` enthaelt
   absichtlich Entities wie `&nbsp;` und gelegentlich `<a>`. Die Datei liegt
   im eigenen Repo und geht durch denselben Review wie der uebrige Code;
   sie ist Quelltext, nicht Nutzereingabe. Der Kompromiss: Text wird als HTML
   eingesetzt, alle STRUKTURELLEN Werte (Nummer, Datum) dagegen als
   textContent, damit ein Tippfehler in der JSON nicht das Markup zerlegt. */
function absatz(eintrag) {
  var p = document.createElement("p");
  var kopf = document.createElement("strong");
  kopf.appendChild(document.createTextNode("V " + eintrag.nummer + " — "));
  var zeit = document.createElement("time");
  zeit.setAttribute("datetime", eintrag.datum);
  zeit.textContent = eintrag.datum_text;
  kopf.appendChild(zeit);
  p.appendChild(kopf);
  (eintrag.seite || []).forEach(function (text) {
    p.appendChild(document.createElement("br"));
    var span = document.createElement("span");
    span.innerHTML = text;
    p.appendChild(span);
  });
  return p;
}

function baue(daten) {
  var ziel = document.getElementById("changelog-ausgaben");
  if (!ziel) return;

  /* NUR VEROEFFENTLICHTE AUSGABEN. `veroeffentlicht` ist kein Freigabe-Flag,
     sondern eine Tatsachenaussage: steht die Ausgabe wirklich auf der Seite?
     Ein Eintrag, der vorbereitet, aber noch nicht ausgeliefert ist, gehoert
     nicht in die oeffentliche Liste — sonst verspricht die Seite etwas, das
     es noch nicht gibt. Dieselbe Regel gilt fuer den Bluesky-Bot. */
  var sichtbar = (daten.ausgaben || []).filter(function (a) {
    return a.veroeffentlicht === true;
  });

  if (!sichtbar.length) return;          /* Bestand stehen lassen, nicht leeren */
  ziel.textContent = "";
  sichtbar.forEach(function (a) { ziel.appendChild(absatz(a)); });
}

/* Faellt der Abruf aus, bleibt der Platzhalterinhalt stehen, statt dass die
   Seite eine leere Liste zeigt. Ein Changelog, der nichts anzeigt, sieht aus
   wie ein Changelog ohne Eintraege — das waere die schlechtere Luege. */
fetch(PAGES + "/data/changelog.json", { cache: "no-cache" })
  .then(function (a) { if (!a.ok) throw new Error("HTTP " + a.status); return a.json(); })
  .then(baue)
  .catch(function (fehler) {
    console.error("[Changelog] changelog.json nicht ladbar:", fehler);
  });
})();
