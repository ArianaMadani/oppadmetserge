/* ========================================================================
   Landjuweel 2026 — wie gaat mee?

   De antwoorden staan in een Google Spreadsheet. De app praat daarmee via
   een Google Apps Script "web app" (zie apps-script/Code.gs). Na de
   Google-setup hoort de web-app-URL hieronder in SCRIPT_URL te staan.
   Zolang die leeg is, draait de app lokaal met voorbeeldgegevens.
   ======================================================================== */

var SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyAH-_FREhKVL2JrnWesUzpsSRJXPyK3HlmS3jbslZfz9w47X6nPXdooA7O0q_Mg4IPRQ/exec";

// De dagen van het festival. Camping open: do 10:00 tot ma 14:00.
var DAGEN = [
  { id: "do", label: "donderdag 23 juli" },
  { id: "vr", label: "vrijdag 24 juli" },
  { id: "za", label: "zaterdag 25 juli" },
  { id: "zo", label: "zondag 26 juli" },
  { id: "ma", label: "maandag 27 juli" }
];

var HUISJES = [
  { id: "1", naam: "Huisje 1", plekken: 4 },
  { id: "2", naam: "Huisje 2", plekken: 8 },
  { id: "3", naam: "Huisje 3", plekken: 8 }
];

/* ---------------- Hulpjes ---------------- */

function $(sel) { return document.querySelector(sel); }

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function normNaam(naam) { return String(naam || "").trim().toLowerCase(); }

function dagIndex(id) {
  for (var i = 0; i < DAGEN.length; i++) if (DAGEN[i].id === id) return i;
  return -1;
}

function dagenTekst(row) {
  var a = dagIndex(row.aankomst), v = dagIndex(row.vertrek);
  if (a < 0 || v < 0) return "";
  if (a === v) return DAGEN[a].id;
  return DAGEN[a].id + "–" + DAGEN[v].id;
}

/* ---------------- Gegevens laden & versturen ---------------- */

var rows = [];          // alle antwoorden uit de spreadsheet
var boodschappen = [];  // de meeneem-lijst uit de spreadsheet
var demo = false;       // lokaal testen zonder spreadsheet
var demoBoodschappen = [
  { wat: "BBQ + kolen", wie: "Serge" },
  { wat: "Bier (2 kratten)", wie: "Kasper" },
  { wat: "Slingers en lampjes", wie: "Loes" }
];
var demoRows = [
  { naam: "Serge", meegaan: "ja", kaartjes: 2, wilHuisje: "ja", aankomst: "do", vertrek: "ma", opmerking: "Ik heb een kaartje over!", huisje: "1", geboortedatum: "12-03-1978", woonplaats: "Amsterdam", legitimatie: "paspoort" },
  { naam: "Ariana", meegaan: "ja", kaartjes: 1, wilHuisje: "ja", aankomst: "do", vertrek: "ma", opmerking: "", huisje: "1" },
  { naam: "Pim", meegaan: "ja", kaartjes: 0, wilHuisje: "ja", aankomst: "vr", vertrek: "zo", opmerking: "Kom met de trein", huisje: "" },
  { naam: "Loes", meegaan: "misschien", kaartjes: 0, wilHuisje: "ja", aankomst: "za", vertrek: "zo", opmerking: "Hoor het vrijdag pas van werk", huisje: "" },
  { naam: "Kasper", meegaan: "ja", kaartjes: 1, wilHuisje: "nee", aankomst: "do", vertrek: "zo", opmerking: "Ik neem m'n tent mee", huisje: "" },
  { naam: "Femke", meegaan: "nee", kaartjes: 1, wilHuisje: "", aankomst: "", vertrek: "", opmerking: "Kaartje over te nemen!", huisje: "" }
];

function isLokaal() {
  return location.protocol === "file:" ||
         location.hostname === "localhost" ||
         location.hostname === "127.0.0.1";
}

function toonMelding(tekst, isFout) {
  var el = $("#melding");
  el.textContent = tekst;
  el.className = "melding" + (isFout ? " melding--fout" : "");
  el.hidden = false;
}

function verbergMelding() { $("#melding").hidden = true; }

function haalLijst() {
  if (demo) {
    rows = demoRows.slice();
    boodschappen = demoBoodschappen.slice();
    return Promise.resolve();
  }
  return fetch(SCRIPT_URL + "?action=list")
    .then(function (res) { return res.json(); })
    .then(function (data) {
      if (!data.ok) throw new Error(data.error || "onbekende fout");
      rows = data.rows || [];
      boodschappen = data.boodschappen || [];
      verbergMelding();
    });
}

function stuurOp(payload) {
  if (demo) {
    // Nabootsen wat de spreadsheet doet: bijwerken op naam.
    if (payload.action === "submit") {
      var e = payload.entry, gevonden = false;
      for (var i = 0; i < demoRows.length; i++) {
        if (normNaam(demoRows[i].naam) === normNaam(e.naam)) {
          e.huisje = demoRows[i].huisje;
          demoRows[i] = e;
          gevonden = true;
        }
      }
      if (!gevonden) { e.huisje = ""; demoRows.push(e); }
    }
    if (payload.action === "assign") {
      for (var j = 0; j < demoRows.length; j++) {
        if (normNaam(demoRows[j].naam) === normNaam(payload.naam)) {
          demoRows[j].huisje = payload.huisje;
        }
      }
    }
    if (payload.action === "addItem") {
      demoBoodschappen.push({ wat: payload.wat, wie: payload.wie });
    }
    if (payload.action === "removeItem") {
      demoBoodschappen = demoBoodschappen.filter(function (b) {
        return !(normNaam(b.wat) === normNaam(payload.wat) &&
                 normNaam(b.wie) === normNaam(payload.wie));
      });
    }
    return Promise.resolve({ ok: true });
  }
  // Let op: geen Content-Type-header zetten! Zo blijft het een "simpel"
  // verzoek en werkt het zonder gedoe met Google (CORS).
  return fetch(SCRIPT_URL, { method: "POST", body: JSON.stringify(payload) })
    .then(function (res) { return res.json(); });
}

/* ---------------- Tabs ---------------- */

var TABS = ["invullen", "overzicht", "huisjes", "programma", "boodschappen"];

function toonTab(naam) {
  if (TABS.indexOf(naam) < 0) naam = "invullen";
  TABS.forEach(function (t) {
    $("#tab-" + t).hidden = (t !== naam);
  });
  document.querySelectorAll(".tabbar__btn").forEach(function (btn) {
    btn.classList.toggle("is-actief", btn.dataset.tab === naam);
  });
  window.scrollTo(0, 0);
  if (naam === "overzicht" || naam === "huisjes" || naam === "boodschappen") {
    haalLijst().then(renderAlles).catch(laadFout);
  }
}

function laadFout() {
  toonMelding("Kon de gegevens niet laden. Controleer je internet en probeer het opnieuw.", true);
}

window.addEventListener("hashchange", function () {
  toonTab(location.hash.replace("#", ""));
});

/* ---------------- Toast ---------------- */

var toastTimer = null;
function toast(tekst) {
  var el = $("#toast");
  el.textContent = tekst;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { el.hidden = true; }, 2600);
}

/* ---------------- Formulier ---------------- */

var kaartjes = 0;

function keuzeVan(groepEl) {
  var g = groepEl.querySelector(".is-gekozen");
  return g ? g.dataset.waarde : "";
}

function kiesIn(groepEl, waarde) {
  groepEl.querySelectorAll(".keuzeknop").forEach(function (k) {
    k.classList.toggle("is-gekozen", k.dataset.waarde === waarde);
  });
}

function zetKaartjes(n) {
  kaartjes = Math.max(0, Math.min(10, n));
  $("#kaartjes-getal").textContent = kaartjes;
  $("#kaartjes-hint").textContent = kaartjes === 0 ? "0 = nog geen kaartje" :
    (kaartjes === 1 ? "1 kaartje" : kaartjes + " kaartjes");
}

function toonVerblijfBlok() {
  var meegaan = keuzeVan($("#f-meegaan"));
  $("#blok-verblijf").style.display = (meegaan === "nee") ? "none" : "";
  toonHuisjeGegevens();
}

// De check-in-velden (geboortedatum, woonplaats, legitimatie) alleen tonen
// als iemand in een huisje wil slapen.
function toonHuisjeGegevens() {
  var wil = keuzeVan($("#f-huisje"));
  $("#blok-huisje-gegevens").hidden = (wil !== "ja");
}

function vulFormulierMet(row) {
  kiesIn($("#f-meegaan"), row.meegaan || "");
  kiesIn($("#f-huisje"), row.wilHuisje || "");
  zetKaartjes(parseInt(row.kaartjes, 10) || 0);
  if (row.aankomst) $("#f-aankomst").value = row.aankomst;
  if (row.vertrek) $("#f-vertrek").value = row.vertrek;
  $("#f-opmerking").value = row.opmerking || "";

  // Check-in-gegevens (geboortedatum als "dd-mm-jjjj").
  var geb = String(row.geboortedatum || "").split("-");
  $("#f-gebdag").value = geb.length === 3 ? String(parseInt(geb[0], 10)) : "";
  $("#f-gebmaand").value = geb.length === 3 ? String(parseInt(geb[1], 10)) : "";
  $("#f-gebjaar").value = geb.length === 3 ? geb[2] : "";
  $("#f-woonplaats").value = row.woonplaats || "";
  kiesIn($("#f-legitimatie"), row.legitimatie || "");

  toonVerblijfBlok();
}

function zoekRij(naam) {
  for (var i = 0; i < rows.length; i++) {
    if (normNaam(rows[i].naam) === normNaam(naam)) return rows[i];
  }
  return null;
}

function naamGewijzigd() {
  var rij = zoekRij($("#f-naam").value);
  var hint = $("#naam-hint");
  if (rij) {
    vulFormulierMet(rij);
    hint.textContent = "We kennen je al — je eerdere antwoord wordt bijgewerkt. 👋";
    hint.hidden = false;
  } else {
    hint.hidden = true;
  }
}

function initFormulier() {
  // Dag-keuzes vullen (aankomst: do t/m zo, vertrek: do t/m ma).
  DAGEN.forEach(function (d, i) {
    if (i < DAGEN.length - 1) {
      $("#f-aankomst").insertAdjacentHTML("beforeend",
        '<option value="' + d.id + '">' + d.label + "</option>");
    }
    $("#f-vertrek").insertAdjacentHTML("beforeend",
      '<option value="' + d.id + '">' + d.label + "</option>");
  });
  $("#f-aankomst").value = "do";
  $("#f-vertrek").value = "ma";

  // Geboortedatum-keuzes vullen (dag 1-31, maand, jaar).
  var MAANDEN = ["januari", "februari", "maart", "april", "mei", "juni",
                 "juli", "augustus", "september", "oktober", "november", "december"];
  for (var d = 1; d <= 31; d++) {
    $("#f-gebdag").insertAdjacentHTML("beforeend", '<option value="' + d + '">' + d + "</option>");
  }
  MAANDEN.forEach(function (m, i) {
    $("#f-gebmaand").insertAdjacentHTML("beforeend", '<option value="' + (i + 1) + '">' + m + "</option>");
  });
  for (var j = 2010; j >= 1935; j--) {
    $("#f-gebjaar").insertAdjacentHTML("beforeend", '<option value="' + j + '">' + j + "</option>");
  }

  // Keuzeknoppen.
  document.querySelectorAll(".keuzeknoppen").forEach(function (groep) {
    groep.addEventListener("click", function (ev) {
      var knop = ev.target.closest(".keuzeknop");
      if (!knop) return;
      kiesIn(groep, knop.dataset.waarde);
      if (groep.id === "f-meegaan") toonVerblijfBlok();
      if (groep.id === "f-huisje") toonHuisjeGegevens();
    });
  });

  // Kaartjes-teller.
  $("#kaartjes-min").addEventListener("click", function () { zetKaartjes(kaartjes - 1); });
  $("#kaartjes-plus").addEventListener("click", function () { zetKaartjes(kaartjes + 1); });

  // Naam: eerdere antwoorden herkennen.
  $("#f-naam").addEventListener("change", naamGewijzigd);
  $("#f-naam").addEventListener("blur", naamGewijzigd);

  $("#formulier").addEventListener("submit", verstuurFormulier);
}

function verstuurFormulier(ev) {
  ev.preventDefault();

  var naam = $("#f-naam").value.trim();
  var meegaan = keuzeVan($("#f-meegaan"));
  if (!naam) { toast("Vul eerst je naam in 🙂"); return; }
  if (!meegaan) { toast("Kies of je meegaat 🙂"); return; }

  // Geboortedatum samenstellen als "dd-mm-jjjj" (alleen als alles gekozen is).
  var gd = $("#f-gebdag").value, gm = $("#f-gebmaand").value, gj = $("#f-gebjaar").value;
  var geboortedatum = (gd && gm && gj)
    ? ("0" + gd).slice(-2) + "-" + ("0" + gm).slice(-2) + "-" + gj
    : "";

  var entry = {
    naam: naam,
    meegaan: meegaan,
    kaartjes: kaartjes,
    wilHuisje: meegaan === "nee" ? "" : keuzeVan($("#f-huisje")),
    aankomst: meegaan === "nee" ? "" : $("#f-aankomst").value,
    vertrek: meegaan === "nee" ? "" : $("#f-vertrek").value,
    opmerking: $("#f-opmerking").value.trim(),
    geboortedatum: geboortedatum,
    woonplaats: $("#f-woonplaats").value.trim(),
    legitimatie: keuzeVan($("#f-legitimatie"))
  };

  if (entry.aankomst && dagIndex(entry.vertrek) < dagIndex(entry.aankomst)) {
    toast("Je vertrek is eerder dan je aankomst 🤔");
    return;
  }

  // Wie in een huisje wil, moet de check-in-gegevens invullen (nodig voor
  // de registratie bij het park).
  if (entry.meegaan !== "nee" && entry.wilHuisje === "ja") {
    if (!geboortedatum) { toast("Vul je geboortedatum nog even in 🙂"); return; }
    if (!entry.woonplaats) { toast("Vul je woonplaats nog even in 🙂"); return; }
    if (!entry.legitimatie) { toast("Kies nog hoe je je kunt legitimeren 🙂"); return; }
  }

  var knop = $("#verstuurknop");
  knop.disabled = true;
  knop.textContent = "Versturen…";

  stuurOp({ action: "submit", entry: entry })
    .then(function (data) {
      if (!data.ok) throw new Error(data.error || "onbekende fout");
      try { localStorage.setItem("lj_naam", naam); } catch (e) {}
      return haalLijst();
    })
    .then(function () {
      renderAlles();
      toast("Opgeslagen, dankjewel " + naam + "! 🎉");
      location.hash = "#overzicht";
    })
    .catch(function () {
      toast("Versturen is niet gelukt 😕 Probeer het nog eens.");
    })
    .then(function () {
      knop.disabled = false;
      knop.textContent = "Versturen ✨";
    });
}

/* ---------------- Overzicht renderen ---------------- */

function kaartjesBadge(row) {
  var n = parseInt(row.kaartjes, 10) || 0;
  if (n === 0) return '<span class="badge badge--let-op">🎫 nog geen kaartje</span>';
  return '<span class="badge badge--goed">🎫 ' + n + (n === 1 ? " kaartje" : " kaartjes") + "</span>";
}

// Zijn de check-in-gegevens (voor het park) compleet?
function gegevensCompleet(row) {
  return !!(row.geboortedatum && row.woonplaats && row.legitimatie);
}

function checkinBadge(row) {
  if (row.meegaan === "nee" || row.wilHuisje !== "ja") return "";
  if (gegevensCompleet(row)) return '<span class="badge badge--goed">🪪 check-in compleet</span>';
  return '<span class="badge badge--let-op">🪪 check-in gegevens ontbreken</span>';
}

function huisjeBadge(row) {
  if (row.meegaan === "nee") return "";
  if (row.wilHuisje === "nee") return '<span class="badge">⛺ regelt zelf iets</span>';
  if (row.wilHuisje !== "ja") return "";
  if (row.huisje) {
    var h = HUISJES.filter(function (x) { return x.id === String(row.huisje); })[0];
    return '<span class="badge badge--goed">🏠 ' + esc(h ? h.naam : "Huisje " + row.huisje) + "</span>";
  }
  return '<span class="badge badge--roze">🏠 wil in een huisje</span>';
}

function persoonKaart(row) {
  var dagen = row.meegaan === "nee" ? "" : esc(dagenTekst(row));
  return '<div class="persoon">' +
    '<div class="persoon__kop">' +
      '<span class="persoon__naam">' + esc(row.naam) + "</span>" +
      (dagen ? '<span class="persoon__dagen">📅 ' + dagen + "</span>" : "") +
    "</div>" +
    '<div class="badges">' + kaartjesBadge(row) + huisjeBadge(row) + checkinBadge(row) + "</div>" +
    (row.opmerking ? '<p class="persoon__opmerking">💬 ' + esc(row.opmerking) + "</p>" : "") +
  "</div>";
}

function renderOverzicht() {
  var ja = [], misschien = [], nee = [];
  rows.forEach(function (r) {
    if (r.meegaan === "ja") ja.push(r);
    else if (r.meegaan === "misschien") misschien.push(r);
    else nee.push(r);
  });
  var opNaam = function (a, b) { return a.naam.localeCompare(b.naam, "nl"); };
  ja.sort(opNaam); misschien.sort(opNaam); nee.sort(opNaam);

  var totaalKaartjes = 0;
  rows.forEach(function (r) { totaalKaartjes += parseInt(r.kaartjes, 10) || 0; });
  var zonderKaartje = ja.filter(function (r) { return !(parseInt(r.kaartjes, 10) > 0); }).length;
  var willenHuisje = rows.filter(function (r) {
    return r.meegaan !== "nee" && r.wilHuisje === "ja";
  }).length;
  var totaalPlekken = HUISJES.reduce(function (som, h) { return som + h.plekken; }, 0);

  $("#tegels").innerHTML =
    '<div class="tegel"><div class="tegel__getal">' + ja.length + "</div>" +
      '<div class="tegel__label">gaan mee</div>' +
      (misschien.length ? '<div class="tegel__extra">+' + misschien.length + " misschien</div>" : "") +
    "</div>" +
    '<div class="tegel"><div class="tegel__getal">' + totaalKaartjes + "</div>" +
      '<div class="tegel__label">kaartjes in de groep</div>' +
      (zonderKaartje ? '<div class="tegel__extra">' + zonderKaartje + " nog zonder</div>" : "") +
    "</div>" +
    '<div class="tegel"><div class="tegel__getal">' + willenHuisje + "</div>" +
      '<div class="tegel__label">willen in huisje</div>' +
      '<div class="tegel__extra">' + totaalPlekken + " plekken</div>" +
    "</div>";

  var html = "";
  if (!rows.length) {
    html = '<div class="leeg">Nog niemand heeft iets ingevuld.<br>Wees de eerste! ✍️</div>';
  } else {
    if (ja.length) html += '<h2 class="groepkop">🎉 Gaan mee (' + ja.length + ")</h2>" + ja.map(persoonKaart).join("");
    if (misschien.length) html += '<h2 class="groepkop">🤔 Misschien (' + misschien.length + ")</h2>" + misschien.map(persoonKaart).join("");
    if (nee.length) html += '<h2 class="groepkop">😢 Gaan niet mee (' + nee.length + ")</h2>" + nee.map(persoonKaart).join("");
  }
  $("#mensenlijst").innerHTML = html;
}

/* ---------------- Huisjes renderen ---------------- */

var beheer = false;

function dagBlokjes(row) {
  var a = dagIndex(row.aankomst), v = dagIndex(row.vertrek);
  var html = '<div class="dagblokjes">';
  DAGEN.forEach(function (d, i) {
    var aanwezig = a >= 0 && v >= 0 && i >= a && i <= v;
    html += '<span class="dagblok' + (aanwezig ? " dagblok--aanwezig" : "") + '">' + d.id + "</span>";
  });
  return html + "</div>";
}

function wijsKeuze(row) {
  var html = '<div class="wijskeuze" data-naam="' + esc(row.naam) + '">';
  HUISJES.forEach(function (h) {
    var gekozen = String(row.huisje) === h.id ? " is-gekozen" : "";
    html += '<button type="button" class="wijsknop' + gekozen + '" data-huisje="' + h.id + '">' + h.id + "</button>";
  });
  html += '<button type="button" class="wijsknop" data-huisje="">✕</button></div>';
  return html;
}

function bewonerRij(row) {
  var sub = row.meegaan === "misschien" ? " <small>(misschien)</small>" : "";
  if (!gegevensCompleet(row)) sub += ' <small title="check-in gegevens ontbreken">⚠️</small>';
  return '<div class="bewoner">' +
    '<span class="bewoner__naam">' + esc(row.naam) + sub + "</span>" +
    (beheer ? wijsKeuze(row) : dagBlokjes(row)) +
  "</div>";
}

function renderHuisjes() {
  var kandidaten = rows.filter(function (r) {
    return r.meegaan !== "nee" && r.wilHuisje === "ja";
  });

  var html = "";
  HUISJES.forEach(function (h) {
    var bewoners = kandidaten.filter(function (r) { return String(r.huisje) === h.id; });
    bewoners.sort(function (a, b) { return a.naam.localeCompare(b.naam, "nl"); });

    var vrij = h.plekken - bewoners.length;
    var plekkenTekst, plekkenKlas = "huisje__plekken";
    if (vrij > 0) plekkenTekst = vrij + " van " + h.plekken + " plekken vrij";
    else if (vrij === 0) { plekkenTekst = "vol (" + h.plekken + " plekken)"; }
    else { plekkenTekst = Math.abs(vrij) + " te veel!"; plekkenKlas += " huisje__plekken--vol"; }

    var stippen = "";
    for (var i = 0; i < h.plekken; i++) {
      stippen += '<span class="stip' + (i < bewoners.length ? " stip--bezet" : "") + '"></span>';
    }

    html += '<div class="huisje">' +
      '<div class="huisje__kop">' +
        '<span class="huisje__naam">🏠 ' + esc(h.naam) + "</span>" +
        '<span class="' + plekkenKlas + '">' + plekkenTekst + "</span>" +
      "</div>" +
      '<div class="huisje__stippen">' + stippen + "</div>" +
      (bewoners.length ? bewoners.map(bewonerRij).join("")
                       : '<div class="huisje__leeg">Nog leeg — wie wil hier liggen?</div>') +
    "</div>";
  });

  var zwevend = kandidaten.filter(function (r) { return !r.huisje; });
  zwevend.sort(function (a, b) { return a.naam.localeCompare(b.naam, "nl"); });
  var zwevendHtml = "";
  if (zwevend.length) {
    zwevendHtml = '<div class="intedelen-kaart">' +
      '<div class="huisje__kop"><span class="huisje__naam">✋ Nog in te delen (' + zwevend.length + ")</span></div>" +
      zwevend.map(bewonerRij).join("") +
      (beheer ? "" : '<p class="huisje__leeg">Indelen? Tik onderaan op "✏️ Huisjes indelen".</p>') +
    "</div>";
  }

  $("#huisjeslijst").innerHTML = html;
  $("#intedelen").innerHTML = zwevendHtml;

  var knop = $("#beheerknop");
  knop.textContent = beheer ? "✅ Klaar met indelen" : "✏️ Huisjes indelen";
  knop.classList.toggle("is-actief", beheer);
}

function initHuisjes() {
  $("#beheerknop").addEventListener("click", function () {
    beheer = !beheer;
    renderHuisjes();
  });

  // Toewijs-knopjes (werken via event delegation, ze worden telkens opnieuw getekend).
  $("#tab-huisjes").addEventListener("click", function (ev) {
    var knop = ev.target.closest(".wijsknop");
    if (!knop || !beheer) return;
    var naam = knop.closest(".wijskeuze").dataset.naam;
    var huisje = knop.dataset.huisje;

    stuurOp({ action: "assign", naam: naam, huisje: huisje })
      .then(function (data) {
        if (!data.ok) throw new Error(data.error);
        var rij = zoekRij(naam);
        if (rij) rij.huisje = huisje;
        renderHuisjes();
        toast(huisje ? naam + " → Huisje " + huisje + " ✔" : naam + " uit het huisje gehaald");
      })
      .catch(function () { toast("Indelen is niet gelukt 😕"); });
  });
}

/* ---------------- Boodschappen ---------------- */

var tochToevoegen = false; // tweede klik na de "staat al op de lijst"-waarschuwing

function normItem(s) {
  return String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
}

// Staat iets dat hierop lijkt al op de lijst? (zelfde tekst, of de een
// bevat de ander: "bier" matcht ook "bier (2 kratten)")
function lijktAlOpLijst(wat) {
  var n = normItem(wat);
  if (n.length < 2) return [];
  return boodschappen.filter(function (b) {
    var m = normItem(b.wat);
    return m === n || m.indexOf(n) >= 0 || n.indexOf(m) >= 0;
  });
}

function renderBoodschappen() {
  var lijst = boodschappen.slice().sort(function (a, b) {
    return a.wat.localeCompare(b.wat, "nl");
  });
  var mijnNaam = "";
  try { mijnNaam = localStorage.getItem("lj_naam") || ""; } catch (e) {}
  mijnNaam = normNaam($("#b-wie").value || mijnNaam);

  var html;
  if (!lijst.length) {
    html = '<div class="leeg">De lijst is nog leeg.<br>Wat neem jij mee? 🛒</div>';
  } else {
    html = '<h2 class="groepkop">🛒 Op de lijst (' + lijst.length + ")</h2>" +
      lijst.map(function (b) {
        var vanMij = mijnNaam && normNaam(b.wie) === mijnNaam;
        return '<div class="bewoner boodschap">' +
          '<span class="bewoner__naam">' + esc(b.wat) +
            ' <small>— ' + esc(b.wie) + "</small></span>" +
          (vanMij ? '<button type="button" class="wijsknop boodschap__weg" data-wat="' +
                    esc(b.wat) + '" data-wie="' + esc(b.wie) + '">✕</button>' : "") +
        "</div>";
      }).join("");
  }
  $("#boodschappenlijst").innerHTML = html;
}

function initBoodschappen() {
  var watVeld = $("#b-wat");

  // Waarschuwing live bijwerken zolang je typt; "toch toevoegen" vervalt dan.
  watVeld.addEventListener("input", function () {
    tochToevoegen = false;
    $("#b-knop").textContent = "Op de lijst zetten 🛒";
    var zelfde = lijktAlOpLijst(watVeld.value);
    var w = $("#b-waarschuwing");
    if (zelfde.length) {
      w.textContent = "⚠️ Lijkt al op de lijst te staan: " + zelfde.map(function (b) {
        return "“" + b.wat + "” (" + b.wie + ")";
      }).join(", ");
      w.hidden = false;
    } else {
      w.hidden = true;
    }
  });

  $("#boodschap-formulier").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var wat = watVeld.value.trim();
    var wie = $("#b-wie").value.trim();
    if (!wat) { toast("Vul in wat je meeneemt 🙂"); return; }
    if (!wie) { toast("Vul ook je naam in 🙂"); return; }

    // Dubbel-check: eerst waarschuwen, pas na een tweede klik toevoegen.
    var zelfde = lijktAlOpLijst(wat);
    if (zelfde.length && !tochToevoegen) {
      tochToevoegen = true;
      $("#b-knop").textContent = "Staat er al — toch toevoegen?";
      toast("Check de lijst even — " + zelfde[0].wie + " neemt al zoiets mee 👀");
      return;
    }

    var knop = $("#b-knop");
    knop.disabled = true;
    stuurOp({ action: "addItem", wat: wat, wie: wie })
      .then(function (data) {
        if (!data.ok) throw new Error(data.error || "onbekende fout");
        try { localStorage.setItem("lj_naam", wie); } catch (e) {}
        return haalLijst();
      })
      .then(function () {
        watVeld.value = "";
        tochToevoegen = false;
        $("#b-waarschuwing").hidden = true;
        renderAlles();
        toast("Staat op de lijst! 🛒");
      })
      .catch(function () { toast("Toevoegen is niet gelukt 😕 Probeer het nog eens."); })
      .then(function () {
        knop.disabled = false;
        knop.textContent = "Op de lijst zetten 🛒";
      });
  });

  // Eigen spulletjes weer van de lijst halen.
  $("#boodschappenlijst").addEventListener("click", function (ev) {
    var knop = ev.target.closest(".boodschap__weg");
    if (!knop) return;
    stuurOp({ action: "removeItem", wat: knop.dataset.wat, wie: knop.dataset.wie })
      .then(function (data) {
        if (!data.ok) throw new Error(data.error || "onbekende fout");
        return haalLijst();
      })
      .then(function () {
        renderAlles();
        toast("Van de lijst gehaald ✔");
      })
      .catch(function () { toast("Weghalen is niet gelukt 😕"); });
  });
}

/* ---------------- Programma (line-up per dag) ---------------- */

var PROGRAMMA_DAGEN = [
  { id: "do", label: "do 23" },
  { id: "vr", label: "vr 24" },
  { id: "za", label: "za 25" },
  { id: "zo", label: "zo 26" }
];

var programmaDag = "do";
var alleenHartjes = false;

// Favorieten blijven op je eigen telefoon bewaard.
function leesHartjes() {
  try { return JSON.parse(localStorage.getItem("lj_hartjes") || "[]"); }
  catch (e) { return []; }
}

function actKey(dag, act) { return dag + "|" + act.tijd + "|" + act.naam; }

function isHartje(dag, act) { return leesHartjes().indexOf(actKey(dag, act)) >= 0; }

function wisselHartje(dag, act) {
  var lijst = leesHartjes();
  var key = actKey(dag, act);
  var i = lijst.indexOf(key);
  if (i >= 0) lijst.splice(i, 1); else lijst.push(key);
  try { localStorage.setItem("lj_hartjes", JSON.stringify(lijst)); } catch (e) {}
}

// Nachtelijke tijden (t/m 05:00) sorteren ná de avond.
function tijdSleutel(tijd) {
  var delen = tijd.split(":");
  var minuten = parseInt(delen[0], 10) * 60 + parseInt(delen[1], 10);
  if (minuten < 300) minuten += 1440;
  return minuten;
}

function renderProgramma() {
  // Dag-knopjes.
  $("#dagkiezer").innerHTML = PROGRAMMA_DAGEN.map(function (d) {
    return '<button type="button" class="dagknop' +
      (d.id === programmaDag ? " is-gekozen" : "") + '" data-dag="' + d.id + '">' +
      d.label + "</button>";
  }).join("");

  var acts = (LINEUP[programmaDag] || []).slice().sort(function (a, b) {
    return tijdSleutel(a.tijd) - tijdSleutel(b.tijd) || a.naam.localeCompare(b.naam, "nl");
  });

  var zoek = normItem($("#p-zoek").value);
  if (zoek) {
    acts = acts.filter(function (a) {
      return normItem(a.naam).indexOf(zoek) >= 0 || normItem(a.podium).indexOf(zoek) >= 0;
    });
  }
  if (alleenHartjes) {
    acts = acts.filter(function (a) { return isHartje(programmaDag, a); });
  }

  $("#p-hartjes").classList.toggle("is-actief", alleenHartjes);

  if (!LINEUP[programmaDag] || !LINEUP[programmaDag].length) {
    $("#programmalijst").innerHTML =
      '<div class="leeg">Het programma van deze dag staat er nog niet in.<br>Komt eraan! 🎪</div>';
    return;
  }
  if (!acts.length) {
    $("#programmalijst").innerHTML =
      '<div class="leeg">' + (alleenHartjes ? "Nog geen favorieten voor deze dag.<br>Tik op een hartje bij een optreden! ❤️"
                                            : "Niets gevonden voor deze zoekopdracht. 🤷") + "</div>";
    return;
  }

  // Groeperen per tijd.
  var html = "", vorigeTijd = null;
  acts.forEach(function (a) {
    if (a.tijd !== vorigeTijd) {
      html += '<h2 class="groepkop">🕐 ' + esc(a.tijd) + "</h2>";
      vorigeTijd = a.tijd;
    }
    var vol = isHartje(programmaDag, a);
    html += '<div class="act">' +
      '<div class="act__info">' +
        '<span class="act__naam">' + esc(a.naam) + "</span>" +
        '<span class="act__podium">' + esc(a.podium) + "</span>" +
      "</div>" +
      '<button type="button" class="act__hart' + (vol ? " is-vol" : "") +
        '" data-tijd="' + esc(a.tijd) + '" data-naam="' + esc(a.naam) + '">' +
        (vol ? "❤️" : "♡") + "</button>" +
    "</div>";
  });
  $("#programmalijst").innerHTML = html;
}

function initProgramma() {
  $("#dagkiezer").addEventListener("click", function (ev) {
    var knop = ev.target.closest(".dagknop");
    if (!knop) return;
    programmaDag = knop.dataset.dag;
    renderProgramma();
  });

  $("#p-zoek").addEventListener("input", renderProgramma);

  $("#p-hartjes").addEventListener("click", function () {
    alleenHartjes = !alleenHartjes;
    renderProgramma();
  });

  $("#programmalijst").addEventListener("click", function (ev) {
    var hart = ev.target.closest(".act__hart");
    if (!hart) return;
    wisselHartje(programmaDag, { tijd: hart.dataset.tijd, naam: hart.dataset.naam });
    renderProgramma();
  });

  renderProgramma();
}

/* ---------------- Alles ---------------- */

function renderAlles() {
  renderOverzicht();
  renderHuisjes();
  renderBoodschappen();
  // Namenlijstje bij het naamveld, handig om je eigen antwoord terug te vinden.
  $("#namenlijst").innerHTML = rows.map(function (r) {
    return '<option value="' + esc(r.naam) + '"></option>';
  }).join("");
}

function init() {
  if (!SCRIPT_URL) {
    if (isLokaal()) {
      demo = true;
      toonMelding("🧪 Voorbeeldweergave met nepgegevens — de app is nog niet aan de spreadsheet gekoppeld.");
    } else {
      toonMelding("⚙️ Bijna klaar! De app is nog niet aan de spreadsheet gekoppeld, invullen kan nog niet.");
    }
  }

  initFormulier();
  initHuisjes();
  initBoodschappen();
  initProgramma();
  toonTab(location.hash.replace("#", ""));

  // Naam van de vorige keer alvast invullen.
  try {
    var vorige = localStorage.getItem("lj_naam");
    if (vorige) { $("#f-naam").value = vorige; $("#b-wie").value = vorige; }
  } catch (e) {}

  haalLijst().then(function () {
    renderAlles();
    naamGewijzigd();
  }).catch(laadFout);

  // Elke minuut verversen zolang je op het overzicht of de huisjes kijkt.
  setInterval(function () {
    if (document.hidden) return;
    if ($("#tab-invullen").hidden === false) return;
    haalLijst().then(renderAlles).catch(function () {});
  }, 60000);
}

init();
