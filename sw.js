/* ========================================================================
   Service worker — Op pad met Serge (Wildeburg 2026)
   Offline-cache voor het festivalterrein (slecht bereik). De app opent altijd
   direct uit de cache en ververst op de achtergrond (stale-while-revalidate).
   RELATIEVE paden, zodat dit ook werkt onder het subpad /oppadmetserge/ op
   GitHub Pages.
   ======================================================================== */

// Cache-versie met datum. Bij een nieuwe versie: verhoog de datum -> oude cache
// wordt in 'activate' opgeruimd en de nieuwe bestanden worden opnieuw gecachet.
var CACHE = "wildeburg-v2026-07-07c";

// Kern-bestanden: alles-of-niets (de app moet compleet offline werken).
var ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./data.js"
];

// Optionele bestanden: individueel cachen mét catch, zodat een 404 (bv. als
// serge.jpg nog niet is toegevoegd) de installatie NIET laat mislukken.
var OPTIONAL_ASSETS = [
  "./serge.jpg",
  "./kaart.jpg"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return cache.addAll(ASSETS).then(function () {
        // Optionele assets stuk voor stuk; faal niet als er eentje ontbreekt.
        return Promise.all(OPTIONAL_ASSETS.map(function (url) {
          return cache.add(url).catch(function () { /* bestand ontbreekt: prima */ });
        }));
      });
    })
  );
  // Nieuwe worker meteen actief maken (geen wachtstand).
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        if (key !== CACHE) return caches.delete(key);
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;

  event.respondWith(
    caches.open(CACHE).then(function (cache) {
      return cache.match(req).then(function (cached) {
        // Op de achtergrond verversen.
        var network = fetch(req).then(function (res) {
          if (res && res.status === 200 &&
              (res.type === "basic" || res.type === "default")) {
            cache.put(req, res.clone());
          }
          return res;
        }).catch(function () {
          // Offline: val terug op de cache (kan undefined zijn).
          return cached;
        });

        // Serveer meteen uit cache indien aanwezig, anders wacht op het netwerk.
        return cached || network;
      });
    })
  );
});
