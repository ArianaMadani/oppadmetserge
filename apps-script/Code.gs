/* ========================================================================
   Landjuweel 2026 — spreadsheet-koppeling (Google Apps Script)

   Dit script hoort bij een Google Spreadsheet en maakt er een mini-server
   van: de webapp op oppadmetserge.nl leest en schrijft de antwoorden via
   dit script.

   ZO ZET JE HET OP (samen met Claude, of zelf):
   1. Maak een nieuwe Google Spreadsheet (sheets.new), noem hem bv.
      "Landjuweel 2026 — aanmeldingen".
   2. Menu: Extensies → Apps Script. Plak daar de inhoud van dit bestand
      (vervang alles wat er al staat).
   3. Kies in het menu: Implementeren → Nieuwe implementatie → type
      "Web-app". Instellingen:
        - Uitvoeren als: Mij
        - Wie heeft toegang: Iedereen
      Klik op Implementeren en geef toestemming (Google waarschuwt dat de
      app niet geverifieerd is: kies Geavanceerd → Doorgaan).
   4. Kopieer de web-app-URL (eindigt op /exec) en zet die in app.js in
      SCRIPT_URL.
   ======================================================================== */

var BLADNAAM = "Antwoorden";
// Let op: Geboortedatum/Woonplaats/Legitimatie staan expres achteraan (kolom
// J-L), zodat bestaande rijen niet verschuiven.
var KOLOMMEN = ["Naam", "Meegaan", "Kaartjes", "WilHuisje", "Aankomst", "Vertrek", "Opmerking", "Huisje", "Bijgewerkt", "Geboortedatum", "Woonplaats", "Legitimatie"];

var BOODSCHAPPEN_BLAD = "Boodschappen";
var BOODSCHAPPEN_KOLOMMEN = ["Wat", "Wie", "Toegevoegd"];

function blad() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(BLADNAAM);
  if (!sheet) {
    sheet = ss.insertSheet(BLADNAAM);
    sheet.appendRow(KOLOMMEN);
    sheet.setFrozenRows(1);
  }
  // Nieuwe kolommen (bijv. Geboortedatum) automatisch van een kopje voorzien.
  if (!sheet.getRange(1, KOLOMMEN.length).getValue()) {
    sheet.getRange(1, 1, 1, KOLOMMEN.length).setValues([KOLOMMEN]);
    // Geboortedatum als tekst bewaren, anders maakt Sheets er een datum van.
    sheet.getRange(2, 10, sheet.getMaxRows() - 1, 1).setNumberFormat("@");
  }
  return sheet;
}

// Geboortedatum kan door Sheets als echte datum zijn opgeslagen; altijd
// teruggeven als "dd-mm-jjjj".
function alsTekstDatum(w) {
  if (w instanceof Date) {
    return Utilities.formatDate(w, "Europe/Amsterdam", "dd-MM-yyyy");
  }
  return String(w || "");
}

function alleRijen() {
  var sheet = blad();
  var waarden = sheet.getDataRange().getValues();
  var rijen = [];
  for (var i = 1; i < waarden.length; i++) {
    var r = waarden[i];
    if (!r[0]) continue;
    rijen.push({
      naam: String(r[0]),
      meegaan: String(r[1]),
      kaartjes: Number(r[2]) || 0,
      wilHuisje: String(r[3]),
      aankomst: String(r[4]),
      vertrek: String(r[5]),
      opmerking: String(r[6]),
      huisje: String(r[7]),
      geboortedatum: alsTekstDatum(r[9]),
      woonplaats: String(r[10] || ""),
      legitimatie: String(r[11] || "")
    });
  }
  return rijen;
}

function boodschappenBlad() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(BOODSCHAPPEN_BLAD);
  if (!sheet) {
    sheet = ss.insertSheet(BOODSCHAPPEN_BLAD);
    sheet.appendRow(BOODSCHAPPEN_KOLOMMEN);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function alleBoodschappen() {
  var waarden = boodschappenBlad().getDataRange().getValues();
  var items = [];
  for (var i = 1; i < waarden.length; i++) {
    if (!waarden[i][0]) continue;
    items.push({ wat: String(waarden[i][0]), wie: String(waarden[i][1]) });
  }
  return items;
}

function antwoord(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  return antwoord({ ok: true, rows: alleRijen(), boodschappen: alleBoodschappen() });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000); // niet twee inzendingen tegelijk verwerken
  try {
    var body = JSON.parse(e.postData.contents);

    if (body.action === "submit") return antwoord(verwerkInzending(body.entry));
    if (body.action === "assign") return antwoord(verwerkIndeling(body));
    if (body.action === "addItem") return antwoord(voegItemToe(body));
    if (body.action === "removeItem") return antwoord(verwijderItem(body));
    if (body.action === "removeEntry") return antwoord(verwijderInzending(body));

    return antwoord({ ok: false, error: "onbekende actie" });
  } catch (fout) {
    return antwoord({ ok: false, error: String(fout) });
  } finally {
    lock.releaseLock();
  }
}

function voegItemToe(body) {
  var wat = String(body.wat || "").trim().slice(0, 60);
  var wie = String(body.wie || "").trim().slice(0, 40);
  if (!wat || !wie) return { ok: false, error: "wat of wie ontbreekt" };
  boodschappenBlad().appendRow([wat, wie, new Date()]);
  return { ok: true };
}

function verwijderItem(body) {
  var sheet = boodschappenBlad();
  var waarden = sheet.getDataRange().getValues();
  for (var i = 1; i < waarden.length; i++) {
    if (normNaam(waarden[i][0]) === normNaam(body.wat) &&
        normNaam(waarden[i][1]) === normNaam(body.wie)) {
      sheet.deleteRow(i + 1);
      return { ok: true };
    }
  }
  return { ok: false, error: "niet gevonden" };
}

// Hele inzending verwijderen (bijv. een testrij, of iemand die afhaakt).
function verwijderInzending(body) {
  var rijNr = vindRijNummer(body.naam);
  if (rijNr < 0) return { ok: false, error: "naam niet gevonden" };
  blad().deleteRow(rijNr);
  return { ok: true };
}

function normNaam(naam) {
  return String(naam || "").trim().toLowerCase();
}

function vindRijNummer(naam) {
  var waarden = blad().getDataRange().getValues();
  for (var i = 1; i < waarden.length; i++) {
    if (normNaam(waarden[i][0]) === normNaam(naam)) return i + 1; // 1-gebaseerd
  }
  return -1;
}

function verwerkInzending(entry) {
  if (!entry || !String(entry.naam || "").trim()) {
    return { ok: false, error: "naam ontbreekt" };
  }
  var sheet = blad();
  var naam = String(entry.naam).trim().slice(0, 40);
  var rijNr = vindRijNummer(naam);

  // Bestaande huisjes-indeling bewaren als iemand z'n antwoord bijwerkt.
  var huisje = "";
  if (rijNr > 0) huisje = String(sheet.getRange(rijNr, 8).getValue());

  var rij = [
    naam,
    String(entry.meegaan || "").slice(0, 10),
    Math.max(0, Math.min(10, Number(entry.kaartjes) || 0)),
    String(entry.wilHuisje || "").slice(0, 5),
    String(entry.aankomst || "").slice(0, 2),
    String(entry.vertrek || "").slice(0, 2),
    String(entry.opmerking || "").slice(0, 300),
    huisje,
    new Date(),
    String(entry.geboortedatum || "").slice(0, 10),
    String(entry.woonplaats || "").slice(0, 60),
    String(entry.legitimatie || "").slice(0, 12)
  ];

  if (rijNr > 0) {
    sheet.getRange(rijNr, 1, 1, rij.length).setValues([rij]);
  } else {
    sheet.appendRow(rij);
    rijNr = sheet.getLastRow();
  }

  // De geboortedatum nogmaals nadrukkelijk als tekst wegschrijven. Doen we
  // dat niet, dan leest Sheets "05-11-1988" soms op z'n Amerikaans (11 mei
  // in plaats van 5 november) en draaien dag en maand stiekem om.
  var gebCel = sheet.getRange(rijNr, 10);
  gebCel.setNumberFormat("@");
  gebCel.setValue(rij[9]);

  return { ok: true };
}

function verwerkIndeling(body) {
  var rijNr = vindRijNummer(body.naam);
  if (rijNr < 0) return { ok: false, error: "naam niet gevonden" };

  var huisje = String(body.huisje || "");
  if (["", "1", "2", "3"].indexOf(huisje) < 0) {
    return { ok: false, error: "onbekend huisje" };
  }
  blad().getRange(rijNr, 8).setValue(huisje);
  blad().getRange(rijNr, 9).setValue(new Date());
  return { ok: true };
}
