# Op pad met Serge — oppadmetserge.nl

Op de voorpagina staat nu de **Landjuweel 2026-app**: iedereen uit de
vriendengroep geeft door of ze meegaan (23–26 juli, Ruigoord), of ze een
kaartje hebben (en hoeveel), of ze in een huisje willen en wanneer ze komen
en weggaan. Zo is er eindelijk overzicht.

- **✍️ Invullen** — je naam + je antwoorden. Nog een keer invullen met
  dezelfde naam = je antwoord bijwerken.
- **👥 Wie gaat mee** — het overzicht: wie gaat er mee, hoeveel kaartjes
  zijn er, wie heeft er nog geen.
- **🏠 Huisjes** — de drie huisjes (1×4 en 2×8 plekken), wie erin ligt en
  van wanneer tot wanneer. Indelen kan via de knop "✏️ Huisjes indelen"
  (geen pincode; vrienden onder elkaar).
- **🛒 Meenemen** — de boodschappenlijst: iedereen zet erop wat ie meeneemt.
  Staat er al iets dat erop lijkt ("bier" vs "bier, 2 kratten"), dan krijg
  je eerst een waarschuwing. Je eigen spullen kun je er weer af halen.

De antwoorden staan in een Google Spreadsheet van Ariana. De koppeling loopt
via Google Apps Script — zie [apps-script/Code.gs](apps-script/Code.gs) voor
het script én de installatie-stappen. De web-app-URL die daaruit komt hoort
in `app.js` bovenin bij `SCRIPT_URL`.

De **Wildeburg 2026-app** (het vorige festival) staat nog gewoon op
[oppadmetserge.nl/wildeburg](https://oppadmetserge.nl/wildeburg/) — zie de
map [wildeburg/](wildeburg/).

## Lokaal bekijken

Open `index.html` in je browser. Zolang `SCRIPT_URL` leeg is zie je
voorbeeldgegevens (nepnamen), zodat je kunt zien hoe het werkt.
