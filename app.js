/* ========================================================================
   Op pad met Serge — Wildeburg 2026
   Vanilla JS, hash-navigatie, localStorage-favorieten.
   Data komt uit data.js (globale WILDEBURG_DATA).
   ======================================================================== */

(function () {
  "use strict";

  // data.js definieert `const WILDEBURG_DATA` op top-level scope. Bij een klassiek
  // <script> is dat een globale lexicale binding (WILDEBURG_DATA), maar GEEN
  // window-property. Daarom hier de bare global gebruiken, niet window.WILDEBURG_DATA.
  var DATA = (typeof WILDEBURG_DATA !== "undefined")
    ? WILDEBURG_DATA
    : window.WILDEBURG_DATA;
  var FAV_KEY = "wildeburg-favs";

  // ---- Podium-kleuren (matchen met CSS-variabelen, ook voor inline styles) ----
  var STAGE_COLORS = {
    "Wildlive":        "#e8623a",
    "Strand":          "#2aa6c4",
    "Helling":         "#7b5cd6",
    "BUD X Lodge":     "#c8447e",
    "Bamboebos":       "#3f9e56",
    "Duinpan":         "#d99b28",
    "Studio De Baan":  "#b0863a",
    "Achtertuin":      "#e0b93f",
    "Kas":             "#5c9a6f"
  };
  function stageColor(stage) {
    return STAGE_COLORS[stage] || "#326049";
  }

  // ---- Kaart: podium-slugs (voor deep-links #kaart/<slug>) ----
  var STAGE_SLUG = {
    "Wildlive":       "wildlive",
    "Strand":         "strand",
    "Helling":        "helling",
    "BUD X Lodge":    "bud-x-lodge",
    "Bamboebos":      "bamboebos",
    "Duinpan":        "duinpan",
    "Studio De Baan": "studio-de-baan",
    "Achtertuin":     "achtertuin",
    "Kas":            "kas"
  };
  var SLUG_STAGE = {};
  Object.keys(STAGE_SLUG).forEach(function (s) { SLUG_STAGE[STAGE_SLUG[s]] = s; });
  function stageSlug(stage) { return STAGE_SLUG[stage] || ""; }

  // ---- Kaart: marker-posities (percentages t.o.v. de afbeelding) ----
  // Podium-markers (klikbaar, met programma).
  var STAGE_MARKERS = [
    { stage: "Wildlive",       x: 18.7, y: 21.6 },
    { stage: "Strand",         x: 25.2, y: 30.4 },
    { stage: "Studio De Baan", x: 19.3, y: 38.3 },
    { stage: "Kas",            x: 52.7, y: 41.9 },
    { stage: "Bamboebos",      x: 45.7, y: 48.4 },
    { stage: "BUD X Lodge",    x: 57.4, y: 48.7 },
    { stage: "Helling",        x: 21.0, y: 56.2 },
    { stage: "Duinpan",        x: 45.9, y: 58.4 },
    { stage: "Achtertuin",     x: 19.7, y: 76.7 }
  ];
  // Neutrale info-markers (geen programma).
  var INFO_MARKERS = [
    { name: "Entree",                     x: 79.7, y: 6.4 },
    { name: "EHBO",                       x: 19.1, y: 13.1 },
    { name: "Dorpshart (campingwinkel)",  x: 35.8, y: 18.6 },
    { name: "Eiland",                     x: 63.0, y: 65.3 },
    { name: "Vuurtorenstrand",            x: 67.5, y: 81.9 }
  ];

  // ---- Kleine helpers ----
  function el(id) { return document.getElementById(id); }

  function escapeHtml(str) {
    if (str == null) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // Diakriet-ongevoelig + lowercase (voor zoeken: "jasmin" vindt "Jasmín")
  function normalize(str) {
    return String(str || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  // ---- App-state ----
  var currentView = "home"; // welke tab/scherm actief is (voor gerichte re-renders)

  // ---- Festival-klok (voor de HOME "Nu op Wildeburg"-widget) ----
  // Maand-index in JS: juli = 6. Festival: vr 10 juli 12:00 t/m zo 12 juli 23:00.
  var FEST_START_TS = new Date(2026, 6, 10, 12, 0, 0, 0); // globaal uur 0 op de tijdlijn
  var FEST_END_TS   = new Date(2026, 6, 12, 23, 0, 0, 0);
  var FEST_DAY_MID  = new Date(2026, 6, 10, 0, 0, 0, 0);  // middernacht vóór vrijdag (voor countdown)

  // ---- Favorieten (localStorage) ----
  var favs = loadFavs();
  function loadFavs() {
    try {
      var raw = localStorage.getItem(FAV_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  function saveFavs() {
    try { localStorage.setItem(FAV_KEY, JSON.stringify(favs)); } catch (e) {}
  }
  function isFav(id) { return favs.indexOf(id) !== -1; }
  function toggleFav(id) {
    var i = favs.indexOf(id);
    if (i === -1) favs.push(id); else favs.splice(i, 1);
    saveFavs();
  }

  // ---- Data-indexen ----
  var byId = {};
  DATA.artists.forEach(function (a) { byId[a.id] = a; });

  var artistsSorted = DATA.artists.slice().sort(function (a, b) {
    return a.name.localeCompare(b.name, "nl", { sensitivity: "base" });
  });

  var dayById = {};
  DATA.days.forEach(function (d) { dayById[d.id] = d; });
  var DAY_ORDER = DATA.days.map(function (d) { return d.id; });

  // ---- Tijd-/nachtlogica ----
  // Een festivaldag loopt van 12:00 tot 12:00 de volgende dag.
  // Tijden < 12:00 horen bij de nacht/ochtend NA die dag -> uur + 24.
  // Voorbeeld: day "vr", start "02:00" => absoluut uur 26 (zaterdagnacht).
  function toHours(t) {
    if (t == null) return null;
    var parts = t.split(":");
    var h = parseInt(parts[0], 10);
    var m = parseInt(parts[1], 10) || 0;
    return h + m / 60;
  }
  // Absoluut uur binnen het dag-grid (12 = 12:00 middag, 26 = 02:00 nacht, 36 = 12:00 dag erna)
  function absHour(t) {
    var h = toHours(t);
    if (h == null) return null;
    if (h < 12) h += 24; // ochtend/nacht hoort bij de nacht van deze festivaldag
    return h;
  }
  // Voor eindtijd: als end kleiner is dan start (over middernacht), tel er 24 bij op.
  function absEndHour(start, end) {
    var s = absHour(start);
    var e = absHour(end);
    if (s == null || e == null) return e;
    if (e <= s) e += 24;
    return e;
  }

  // Format een absoluut uur (12..36) terug naar "HH:MM"
  function fmtAbsHour(absH) {
    var h = absH % 24;
    var hh = Math.floor(h);
    var mm = Math.round((h - hh) * 60);
    return pad2(hh) + ":" + pad2(mm);
  }
  function pad2(n) { return (n < 10 ? "0" : "") + n; }

  // Op welke festivaldag valt een slot voor "Mijn schema" chronologisch?
  // We gebruiken absHour als sorteersleutel binnen de festivaldag.

  // ---- Router ----
  window.addEventListener("hashchange", route);

  // Onthoud scrollposities per tab, zodat "terug" vanaf een artiest
  // niet naar het begin van de lijst of het schema springt.
  // Het schema is één doorlopend grid: nog maar één horizontale scrollpositie
  // ({x: grid-scroll, y: verticale paginascroll}). Artiesten: alleen de
  // verticale paginascroll (getal).
  var savedScroll = { schema: null, artiesten: 0 };
  function pageY() {
    return window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
  }
  function rememberScroll() {
    if (currentView === "schema") {
      var sc = document.querySelector(".schedule-scroll");
      savedScroll.schema = { x: sc ? sc.scrollLeft : 0, y: pageY() };
    } else if (currentView === "artiesten") {
      savedScroll.artiesten = pageY();
    }
  }

  function route() {
    var hash = location.hash.replace(/^#/, "");
    var parts = hash.split("/");
    rememberScroll();
    clearHomeTimer(); // stop de minuut-tik zodra we (mogelijk) home verlaten

    // Gedeelde route-link: #route=<id,id,...> (let op: géén "/"-formaat).
    if (hash.indexOf("route=") === 0) {
      renderRouteImport(hash.slice("route=".length));
      setActiveTab(null);
      return;
    }
    if (hash === "" || parts[0] === "home") {
      renderHome();
      setActiveTab("home");
      return;
    }
    if (parts[0] === "artiest" && parts[1]) {
      renderDetail(parts[1]);
      setActiveTab(null);
      return;
    }
    if (parts[0] === "schema") {
      renderSchedule();
      setActiveTab("schema");
      // Deep-link #schema/za => spring naar die dag; anders herstel scrollpositie.
      var dayParam = (parts[1] && DAY_ORDER.indexOf(parts[1]) !== -1) ? parts[1] : null;
      var applySchemaScroll = function () {
        var sc = document.querySelector(".schedule-scroll");
        if (!sc) return;
        void sc.scrollWidth; // forceer layout zodat scrollLeft niet naar 0 klemt
        if (dayParam) {
          sc.scrollLeft = dayScrollLeft(dayParam);
          window.scrollTo(0, 0);
        } else if (savedScroll.schema) {
          sc.scrollLeft = savedScroll.schema.x || 0;
          window.scrollTo(0, savedScroll.schema.y || 0);
        } else {
          window.scrollTo(0, 0);
        }
        updateDaySpy();
      };
      // Het brede grid is soms pas na een layout-tick echt scrollbaar (scrollLeft
      // zou anders naar 0 klemmen). rAF dekt het vloeiende geval; de timer is een
      // betrouwbaar vangnet (ook als rAF gethrottled is).
      requestAnimationFrame(function () {
        applySchemaScroll();
        requestAnimationFrame(applySchemaScroll);
      });
      setTimeout(applySchemaScroll, 80);
      return;
    }
    if (parts[0] === "kaart") {
      var focusSlug = (parts[1] && SLUG_STAGE[parts[1]]) ? parts[1] : null;
      renderMap(focusSlug);
      setActiveTab("kaart");
      return;
    }
    if (parts[0] === "podium" && parts[1]) {
      renderStage(parts[1]);
      setActiveTab(null);
      return;
    }
    if (parts[0] === "mijn") {
      renderMySchedule();
      setActiveTab("mijn");
      return;
    }
    // default
    renderArtists();
    setActiveTab("artiesten");
    var savedY = savedScroll.artiesten || 0;
    // Herstel na de render zodat de (langere) lijst er al staat.
    requestAnimationFrame(function () { window.scrollTo(0, savedY); });
  }

  function setActiveTab(tab) {
    var btns = document.querySelectorAll(".tabbar__btn");
    btns.forEach(function (b) {
      b.classList.toggle("is-active", b.getAttribute("data-tab") === tab);
    });
  }

  function scrollTop() {
    window.scrollTo(0, 0);
  }

  // ======================================================================
  //  TAB 1 + 5: ARTIESTEN (lijst + zoeken/filteren)
  // ======================================================================
  var searchState = {
    q: "",
    genres: [],       // actieve genre-filters
    tipOnly: false,
    favOnly: false,
    showAllGenres: false
  };

  // Verzamel alle genres + frequentie
  var genreCount = {};
  DATA.artists.forEach(function (a) {
    (a.genres || []).forEach(function (g) {
      genreCount[g] = (genreCount[g] || 0) + 1;
    });
  });
  var allGenresByFreq = Object.keys(genreCount).sort(function (a, b) {
    var d = genreCount[b] - genreCount[a];
    return d !== 0 ? d : a.localeCompare(b, "nl");
  });
  var TOP_GENRES = 15;

  // Nachtsets: tijden vóór 12:00 horen bij de nacht ná die festivaldag.
  var NIGHT_AFTER = { vr: "za", za: "zo", zo: "ma" };
  function isNight(s) { return s.start != null && parseInt(s.start, 10) < 12; }
  function dayText(s) {
    var day = dayById[s.day];
    var label = day ? day.label : s.day;
    return isNight(s) ? label.toLowerCase() + "nacht (" + s.day + " → " + (NIGHT_AFTER[s.day] || "?") + ")" : label;
  }

  function slotSummary(a) {
    // Korte dag+tijd+podium regels voor op de kaart
    if (!a.slots || a.slots.length === 0) {
      return '<div class="slot-none">Nog niet op het blokkenschema</div>';
    }
    return a.slots.map(function (s) {
      var tijd = (s.start && s.end) ? (s.start + "–" + s.end) : "tijd nog onbekend";
      return '<div class="slot-line-mini">' +
             '<span class="dot" style="background:' + stageColor(s.stage) + '"></span>' +
             '<span>' + escapeHtml(capFirst(dayText(s))) + ' · ' +
             escapeHtml(tijd) + ' · ' + escapeHtml(s.stage) + '</span></div>';
    }).join("");
  }
  function capFirst(t) { return t.charAt(0).toUpperCase() + t.slice(1); }

  function matchesFilters(a) {
    if (searchState.tipOnly && !a.tip) return false;
    if (searchState.favOnly && !isFav(a.id)) return false;

    if (searchState.genres.length) {
      var ag = a.genres || [];
      for (var i = 0; i < searchState.genres.length; i++) {
        if (ag.indexOf(searchState.genres[i]) === -1) return false; // AND
      }
    }

    if (searchState.q) {
      var q = normalize(searchState.q);
      var hay = normalize(a.name + " " + (a.desc || "") + " " + (a.genres || []).join(" "));
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  }

  function renderArtists() {
    currentView = "artiesten";
    var list = artistsSorted.filter(matchesFilters);

    var genresToShow = searchState.showAllGenres
      ? allGenresByFreq
      : allGenresByFreq.slice(0, TOP_GENRES);

    var html = "";

    // Zoekbalk
    html += '<div class="searchbar">' +
            '<span class="searchbar__icon">🔍</span>' +
            '<input id="searchInput" type="search" inputmode="search" ' +
            'placeholder="Zoek artiest, genre of omschrijving…" ' +
            'value="' + escapeHtml(searchState.q) + '" autocomplete="off">' +
            '</div>';

    // Toggles
    html += '<div class="filter-row">' +
            '<button class="toggle-chip' + (searchState.tipOnly ? " is-active" : "") +
              '" data-toggle="tip">★ Alleen tips</button>' +
            '<button class="toggle-chip' + (searchState.favOnly ? " is-active" : "") +
              '" data-toggle="fav">❤️ Alleen favorieten</button>' +
            '</div>';

    // Genre-filters
    html += '<div class="genre-filters">';
    genresToShow.forEach(function (g) {
      var active = searchState.genres.indexOf(g) !== -1;
      html += '<button class="genre-chip' + (active ? " is-active" : "") +
              '" data-genre="' + escapeHtml(g) + '">' + escapeHtml(g) + '</button>';
    });
    if (allGenresByFreq.length > TOP_GENRES) {
      html += '<button class="genre-more" data-more="1">' +
              (searchState.showAllGenres ? "minder ▲" : "meer… ▾") + '</button>';
    }
    html += '</div>';

    html += '<div class="result-count">' + list.length + ' van ' +
            DATA.artists.length + ' artiesten</div>';

    // Kaarten
    if (list.length === 0) {
      html += '<div class="no-results">Geen artiesten gevonden. Pas je zoekopdracht of filters aan.</div>';
    } else {
      html += '<div class="card-list">';
      list.forEach(function (a) { html += artistCard(a); });
      html += '</div>';
    }

    el("view").innerHTML = html;
    bindArtistsEvents();
  }

  function artistCard(a) {
    var color = a.slots && a.slots.length ? stageColor(a.slots[0].stage) : "#326049";
    var favClass = isFav(a.id) ? " is-fav" : "";
    var heart = isFav(a.id) ? "❤️" : "🤍";

    var genresHtml = (a.genres || []).slice(0, 6).map(function (g) {
      return '<span class="mini-chip">' + escapeHtml(g) + '</span>';
    }).join("");

    return '' +
      '<div class="artist-card" data-artist="' + escapeHtml(a.id) + '" ' +
        'style="--stage-color:' + color + '">' +
        '<button class="fav-btn' + favClass + '" data-fav="' + escapeHtml(a.id) + '" ' +
          'aria-label="Favoriet aan/uit">' + heart + '</button>' +
        '<div class="artist-card__name">' +
          escapeHtml(a.name) +
          (a.tip ? '<span class="tip-badge" title="Tip van Serge">★</span>' : '') +
        '</div>' +
        (genresHtml ? '<div class="artist-card__genres">' + genresHtml + '</div>' : '') +
        '<div class="artist-card__slots">' + slotSummary(a) + '</div>' +
      '</div>';
  }

  function bindArtistsEvents() {
    var input = el("searchInput");
    if (input) {
      input.addEventListener("input", function () {
        searchState.q = input.value;
        // Alleen de lijst + teller verversen zou ideaal zijn; hier hele view,
        // maar we herstellen focus + cursor.
        var pos = input.selectionStart;
        renderArtists();
        var again = el("searchInput");
        if (again) { again.focus(); try { again.setSelectionRange(pos, pos); } catch (e) {} }
      });
    }

    document.querySelectorAll("[data-toggle]").forEach(function (b) {
      b.addEventListener("click", function () {
        var t = b.getAttribute("data-toggle");
        if (t === "tip") searchState.tipOnly = !searchState.tipOnly;
        if (t === "fav") searchState.favOnly = !searchState.favOnly;
        renderArtists();
      });
    });

    document.querySelectorAll("[data-genre]").forEach(function (b) {
      b.addEventListener("click", function () {
        var g = b.getAttribute("data-genre");
        var i = searchState.genres.indexOf(g);
        if (i === -1) searchState.genres.push(g); else searchState.genres.splice(i, 1);
        renderArtists();
      });
    });

    var moreBtn = document.querySelector("[data-more]");
    if (moreBtn) moreBtn.addEventListener("click", function () {
      searchState.showAllGenres = !searchState.showAllGenres;
      renderArtists();
    });

    bindCardEvents();
  }

  // Klik op kaart -> detail; klik op hartje -> toggle (zonder navigeren)
  function bindCardEvents() {
    document.querySelectorAll(".artist-card[data-artist]").forEach(function (card) {
      card.addEventListener("click", function (e) {
        if (e.target.closest("[data-fav]")) return; // hartje handelt zelf af
        location.hash = "artiest/" + card.getAttribute("data-artist");
      });
    });
    document.querySelectorAll("[data-fav]").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        var id = btn.getAttribute("data-fav");
        toggleFav(id);
        // Visuele update ter plekke
        var nowFav = isFav(id);
        btn.classList.toggle("is-fav", nowFav);
        btn.textContent = nowFav ? "❤️" : "🤍";
        // Als "alleen favorieten" aan staat, kan de kaart weg moeten
        if (searchState.favOnly && !nowFav && currentView === "artiesten") {
          renderArtists();
        }
      });
    });
  }

  // ======================================================================
  //  TAB 2: ARTIESTDETAIL
  // ======================================================================
  function renderDetail(id) {
    currentView = "detail";
    var a = byId[id];
    if (!a) {
      el("view").innerHTML =
        '<button class="back-btn" data-back="1">← Terug</button>' +
        '<div class="no-results">Artiest niet gevonden.</div>';
      bindBack();
      scrollTop();
      return;
    }

    var color = a.slots && a.slots.length ? stageColor(a.slots[0].stage) : "#326049";
    var favActive = isFav(a.id);

    var genresHtml = (a.genres || []).map(function (g) {
      return '<span class="mini-chip">' + escapeHtml(g) + '</span>';
    }).join("");

    var descHtml = a.desc
      ? '<p class="detail__desc">' + escapeHtml(a.desc) + '</p>'
      : '<p class="detail__desc is-empty">Nog geen notitie — wordt aangevuld!</p>';

    var slotsHtml = "";
    if (a.slots && a.slots.length) {
      slotsHtml = '<div class="detail__slots">' + a.slots.map(function (s) {
        var day = dayById[s.day];
        var tijd = (s.start && s.end)
          ? (s.start + "–" + s.end)
          : "Tijd nog onbekend";
        var extras = "";
        if (s.live) extras += '<span class="tag-live">LIVE</span>';
        if (s.label) extras += '<span class="tag-label">' + escapeHtml(s.label) + '</span>';
        var dagKop = isNight(s)
          ? escapeHtml((day ? day.label : s.day) + "nacht") +
            '<br><small class="muted">' + escapeHtml("nacht " + s.day + " → " + (NIGHT_AFTER[s.day] || "?")) + '</small>'
          : escapeHtml(day ? day.label : s.day) +
            '<br><small class="muted">' + escapeHtml(day ? day.datum : "") + '</small>';
        return '<div class="slot-line" style="--stage-color:' + stageColor(s.stage) + '">' +
          '<div class="slot-line__day">' + dagKop + '</div>' +
          '<div class="slot-line__body">' +
            '<span class="slot-line__time">' + escapeHtml(tijd) + '</span>' + extras +
            '<br><a class="slot-line__stage slot-line__stage--link" ' +
              'href="#kaart/' + stageSlug(s.stage) + '">📍 ' + escapeHtml(s.stage) + '</a>' +
          '</div>' +
        '</div>';
      }).join("") + '</div>';
    } else {
      slotsHtml = '<div class="detail__slots"><div class="slot-none">Nog niet op het blokkenschema</div></div>';
    }

    var html =
      '<button class="back-btn" data-back="1">← Terug</button>' +
      '<div class="detail" style="--stage-color:' + color + '">' +
        (a.tip ? '<div class="detail__tip">★ Tip van Serge</div>' : '') +
        '<h1 class="detail__name">' + escapeHtml(a.name) + '</h1>' +
        (genresHtml ? '<div class="chips">' + genresHtml + '</div>' : '') +
        descHtml +
        slotsHtml +
        '<button class="detail__fav' + (favActive ? " is-fav" : "") + '" data-detailfav="' +
          escapeHtml(a.id) + '">' +
          '<span class="big-heart">' + (favActive ? "❤️" : "🤍") + '</span>' +
          '<span>' + (favActive ? "In mijn schema" : "Voeg toe aan mijn schema") + '</span>' +
        '</button>' +
      '</div>';

    el("view").innerHTML = html;
    bindBack();

    var favBtn = document.querySelector("[data-detailfav]");
    favBtn.addEventListener("click", function () {
      toggleFav(a.id);
      var now = isFav(a.id);
      favBtn.classList.toggle("is-fav", now);
      favBtn.querySelector(".big-heart").textContent = now ? "❤️" : "🤍";
      favBtn.querySelector("span:last-child").textContent =
        now ? "In mijn schema" : "Voeg toe aan mijn schema";
    });

    scrollTop();
  }

  function bindBack() {
    var b = document.querySelector("[data-back]");
    if (b) b.addEventListener("click", function () {
      if (history.length > 1) history.back();
      else location.hash = "artiesten";
    });
  }

  // ======================================================================
  //  TAB 3: DOORLOPEND BLOKKENSCHEMA (één continue tijdlijn)
  // ======================================================================
  // De hele festival-tijdlijn staat op één horizontaal scrollend grid:
  // vrijdag 12:00 → zaterdag 12:00 → zondag 12:00 → zondag 23:00 (59 uur),
  // zodat de nacht gewoon doorloopt. Globale uur-offset t.o.v. vrijdag 12:00:
  //   dayIndex(vr=0,za=1,zo=2) * 24 + (absHour − 12)
  var currentDay = "vr";            // welke dag-knop actief oogt (scroll-spy stuurt dit)
  var HOUR_WIDTH = 92;              // px per uur (iets smaller dan vroeger => prettiger op mobiel)
  var STAGE_LABEL_WIDTH = 112;
  var FEST_START = 12;             // vrijdag 12:00 = globaal uur 0
  var FEST_TOTAL_HOURS = 59;       // t/m zondag 23:00

  function dayIndex(dayId) {
    var i = DAY_ORDER.indexOf(dayId);
    return i === -1 ? 0 : i;
  }
  // Globaal uur (0..59) op de doorlopende as voor een absoluut uur binnen een dag.
  function globalHour(dayId, absH) {
    return dayIndex(dayId) * 24 + (absH - FEST_START);
  }
  // Globaal uur waarop 12:00 van een dag begint (vr=0, za=24, zo=48).
  function dayGlobalStart(dayId) { return dayIndex(dayId) * 24; }
  // scrollLeft die 12:00 van een dag netjes links naast de podium-kolom zet.
  function dayScrollLeft(dayId) { return dayGlobalStart(dayId) * HOUR_WIDTH; }

  // Verzamel alle getimede slots (globaal geplaatst) en de "geen tijd"-slots per dag.
  function slotsForFestival() {
    var timed = [];        // {artist, slot, gStart, gEnd, stage}
    var untimedByDay = {}; // dayId -> stage -> [ {artist, slot} ]
    DATA.artists.forEach(function (a) {
      (a.slots || []).forEach(function (s) {
        if (s.start == null || s.end == null) {
          if (!untimedByDay[s.day]) untimedByDay[s.day] = {};
          if (!untimedByDay[s.day][s.stage]) untimedByDay[s.day][s.stage] = [];
          untimedByDay[s.day][s.stage].push({ artist: a, slot: s });
        } else {
          timed.push({
            artist: a, slot: s, stage: s.stage,
            gStart: globalHour(s.day, absHour(s.start)),
            gEnd: globalHour(s.day, absEndHour(s.start, s.end))
          });
        }
      });
    });
    return { timed: timed, untimedByDay: untimedByDay };
  }

  function renderSchedule() {
    currentView = "schema";

    var data = slotsForFestival();
    var totalHours = FEST_TOTAL_HOURS;
    var gridWidth = STAGE_LABEL_WIDTH + totalHours * HOUR_WIDTH;

    // Dag-knoppen = jump-knoppen (geen re-render meer)
    var html = '<div class="day-switcher">';
    DATA.days.forEach(function (d) {
      html += '<button data-day="' + d.id + '">' +
        escapeHtml(d.label) + '<small>' + escapeHtml(d.datum) + '</small></button>';
    });
    html += '</div>';

    // Podia met minstens één getimed blok (vaste volgorde uit data.stages)
    var stagesWithContent = DATA.stages.filter(function (st) {
      return data.timed.some(function (t) { return t.stage === st; });
    });

    // ---- Doorlopend tijd-grid ----
    html += '<div class="schedule-scroll"><div class="schedule-grid" style="' +
      'grid-template-columns:' + STAGE_LABEL_WIDTH + 'px repeat(' + totalHours +
      ', ' + HOUR_WIDTH + 'px);' +
      'grid-template-rows:22px 30px repeat(' + stagesWithContent.length + ', 58px);' +
      'width:' + gridWidth + 'px;">';

    // Rij 1: hoek (spant 2 kop-rijen) + dag-banden
    html += '<div class="time-head corner" style="grid-row:1 / span 2;">Podium</div>';
    DATA.days.forEach(function (d) {
      var startH = dayGlobalStart(d.id);
      var nextIdx = dayIndex(d.id) + 1;
      var endH = Math.min(nextIdx * 24, totalHours);
      var span = endH - startH;
      if (span <= 0) return;
      html += '<div class="day-band' + (dayIndex(d.id) > 0 ? " is-boundary" : "") +
        '" style="grid-row:1;grid-column:' + (2 + startH) + ' / span ' + span + ';">' +
        '<span class="day-band__txt">' + escapeHtml(d.label + ' · ' + d.datum) + '</span></div>';
    });

    // Rij 2: tijd-as (uur-labels), continu 12:00 → 23:00 dag erna
    for (var h = 0; h < totalHours; h++) {
      var clock = (FEST_START + h) % 24;
      var boundary = (h % 24 === 0 && h > 0) ? " is-boundary" : "";
      html += '<div class="time-head' + boundary + '" style="grid-row:2;grid-column:' +
        (2 + h) + ';">' + pad2(clock) + ':00</div>';
    }

    // Podium-rijen
    stagesWithContent.forEach(function (st, rowIdx) {
      var rowLine = rowIdx + 3; // rij 1 = dag-band, rij 2 = tijd-as
      html += '<a class="stage-label stage-label--link" href="#podium/' + stageSlug(st) +
        '" style="grid-row:' + rowLine + ';grid-column:1;' +
        '--stage-color:' + stageColor(st) + '">' +
        '<span class="stage-label__swatch"></span>' +
        '<span class="stage-label__txt">' + escapeHtml(st) + '</span></a>';

      html += '<div class="stage-row-bg" style="grid-row:' + rowLine +
        ';grid-column:2 / span ' + totalHours + ';position:relative;">';

      data.timed.filter(function (t) { return t.stage === st; })
        .forEach(function (t) {
          var left = t.gStart * HOUR_WIDTH;
          var clampedEnd = Math.min(t.gEnd, totalHours);
          var width = (clampedEnd - t.gStart) * HOUR_WIDTH;
          if (width < 26) width = 26;
          var fav = isFav(t.artist.id);
          html += '<button class="sched-block' +
            (t.artist.tip ? " is-tip" : "") + (fav ? " is-fav" : "") + '" ' +
            'data-artist="' + escapeHtml(t.artist.id) + '" ' +
            'style="left:' + left + 'px;width:' + (width - 4) + 'px;' +
            'background:' + stageColor(st) + '">' +
            '<span class="sched-block__name">' + escapeHtml(t.artist.name) + '</span>' +
            '<span class="sched-block__time">' + escapeHtml(t.slot.start + "–" + t.slot.end) + '</span>' +
            (fav ? '<span class="fav-corner">❤️</span>' : '') +
          '</button>';
        });

      html += '</div>'; // stage-row-bg
    });

    // Verticale scheidslijnen op dag-grenzen (za 12:00, zo 12:00) over de hele hoogte
    DATA.days.forEach(function (d) {
      if (dayIndex(d.id) === 0) return;
      var x = STAGE_LABEL_WIDTH + dayGlobalStart(d.id) * HOUR_WIDTH;
      html += '<div class="day-divider" style="left:' + x + 'px;"></div>';
    });

    html += '</div></div>'; // schedule-grid + scroll

    html += '<p class="schedule-hint">Sleep het schema naar links/rechts — het loopt ' +
      'door van vrijdag t/m zondagavond, de nacht incluis. Tik op een dag om erheen ' +
      'te springen, of op een blok voor info. ❤️ = jouw favoriet.</p>';

    // ---- "Verder deze dag" (slots zonder tijd), gegroepeerd per dag ----
    DAY_ORDER.forEach(function (dayId) {
      var byStage = data.untimedByDay[dayId];
      if (!byStage) return;
      var stages = DATA.stages.filter(function (st) { return byStage[st]; });
      if (!stages.length) return;
      var day = dayById[dayId];
      html += '<div class="no-time-section">' +
        '<div class="section-title">Verder op ' +
        escapeHtml(day ? day.label.toLowerCase() : dayId) + ' (tijd nog onbekend)</div>';
      stages.forEach(function (st) {
        html += '<div class="no-time-stage" style="--stage-color:' + stageColor(st) + '">' +
          '<div class="no-time-stage__head"><span class="swatch"></span>' +
          escapeHtml(st) + '</div><div class="no-time-chips">';
        byStage[st].forEach(function (item) {
          var fav = isFav(item.artist.id);
          html += '<button class="no-time-chip' + (fav ? " is-fav" : "") + '" ' +
            'data-artist="' + escapeHtml(item.artist.id) + '">' +
            (item.artist.tip ? "★ " : "") +
            escapeHtml(item.artist.name) + '</button>';
        });
        html += '</div></div>';
      });
      html += '</div>';
    });

    el("view").innerHTML = html;

    // Dag-knoppen: smooth-scroll (jump) naar 12:00 van die dag, geen re-render.
    document.querySelectorAll("[data-day]").forEach(function (b) {
      b.addEventListener("click", function () {
        var dayId = b.getAttribute("data-day");
        var sc = document.querySelector(".schedule-scroll");
        setActiveDayBtn(dayId);
        smoothScrollLeft(sc, dayScrollLeft(dayId), 450);
        // Houd de URL netjes zonder een re-render/hashchange te forceren.
        if (history.replaceState) history.replaceState(null, "", "#schema/" + dayId);
      });
    });

    document.querySelectorAll(".sched-block[data-artist], .no-time-chip[data-artist]")
      .forEach(function (b) {
        b.addEventListener("click", function () {
          location.hash = "artiest/" + b.getAttribute("data-artist");
        });
      });

    // Scroll-spy: actieve dag-knop volgt de horizontale scrollpositie.
    var sc = document.querySelector(".schedule-scroll");
    if (sc) sc.addEventListener("scroll", onScheduleScroll, { passive: true });
  }

  // ---- Vloeiende jump-scroll (eigen rAF-animatie, werkt overal) ----
  var programmaticScroll = false;
  var jumpTimer = null;
  var jumpToken = 0; // invalideert een lopende animatie zodra er een nieuwe start
  function smoothScrollLeft(el, target, duration) {
    if (!el) return;
    clearTimeout(jumpTimer);
    jumpToken++;
    var myToken = jumpToken;
    var start = el.scrollLeft;
    var dist = target - start;
    duration = duration || 450;
    programmaticScroll = true; // onderdruk de spy tijdens de animatie
    var done = false;
    function finish() {
      if (done || myToken !== jumpToken) return; // al klaar of vervangen
      done = true;
      el.scrollLeft = target;
      programmaticScroll = false;
      updateDaySpy();
    }
    if (Math.abs(dist) < 1) { finish(); return; }
    var t0 = null;
    function ease(p) { return p < 0.5 ? 2 * p * p : -1 + (4 - 2 * p) * p; } // easeInOutQuad
    function step(ts) {
      if (done || myToken !== jumpToken) return; // afgebroken
      if (t0 === null) t0 = ts;
      var p = Math.min((ts - t0) / duration, 1);
      el.scrollLeft = Math.round(start + dist * ease(p));
      if (p < 1) requestAnimationFrame(step);
      else finish();
    }
    requestAnimationFrame(step);
    // Vangnet: mocht rAF gethrottled/gepauzeerd zijn (verborgen tab e.d.), dan
    // landt deze timeout ons alsnog netjes op de juiste plek (whoever-first-wins).
    jumpTimer = setTimeout(finish, duration + 400);
  }

  // ---- Scroll-spy voor het doorlopende schema ----
  var spyTicking = false;
  function onScheduleScroll() {
    if (programmaticScroll) return; // geen spy tijdens een jump (voorkomt geflikker)
    if (spyTicking) return;
    spyTicking = true;
    requestAnimationFrame(function () {
      spyTicking = false;
      updateDaySpy();
    });
  }
  // Bepaal welke dag het (net na de linkerrand) van de viewport raakt en markeer die.
  function updateDaySpy() {
    var sc = document.querySelector(".schedule-scroll");
    if (!sc) return;
    // Probe iets voorbij de sticky podium-kolom, zodat de "actieve" dag die is
    // waarvan de blokken links in beeld staan.
    var probeX = sc.scrollLeft + STAGE_LABEL_WIDTH + HOUR_WIDTH * 0.5;
    var gHour = (probeX - STAGE_LABEL_WIDTH) / HOUR_WIDTH; // 0..59
    var dayId = gHour < 24 ? "vr" : (gHour < 48 ? "za" : "zo");
    setActiveDayBtn(dayId);
  }
  function setActiveDayBtn(dayId) {
    currentDay = dayId;
    document.querySelectorAll("[data-day]").forEach(function (b) {
      b.classList.toggle("is-active", b.getAttribute("data-day") === dayId);
    });
  }

  // ======================================================================
  //  TAB 4: MIJN SCHEMA (favorieten)
  // ======================================================================
  function renderMySchedule() {
    currentView = "mijn";

    if (favs.length === 0) {
      el("view").innerHTML =
        '<div class="empty-state">' +
          '<div class="empty-state__emoji">❤️</div>' +
          '<h2>Nog geen favorieten</h2>' +
          '<p>Tik bij een artiest op het <span class="heart-inline">🤍 hartje</span> ' +
          'om ’m toe te voegen. Je favorieten verschijnen hier als persoonlijk tijdschema.</p>' +
          '<p class="muted">Ze worden op dit apparaat/deze browser opgeslagen.</p>' +
        '</div>';
      scrollTop();
      return;
    }

    // Verzamel favoriete slots (getimed) en favoriete artiesten zonder tijd
    var perDay = {};     // dayId -> [ {artist, slot, absStart, absEnd} ]
    var noTimeFavs = [];  // artiesten die favoriet zijn maar geen enkele getimede slot

    DAY_ORDER.forEach(function (d) { perDay[d] = []; });

    favs.forEach(function (id) {
      var a = byId[id];
      if (!a) return;
      var timedSlots = (a.slots || []).filter(function (s) {
        return s.start != null && s.end != null;
      });
      if (timedSlots.length === 0) {
        noTimeFavs.push(a);
        return;
      }
      timedSlots.forEach(function (s) {
        if (!perDay[s.day]) perDay[s.day] = [];
        perDay[s.day].push({
          artist: a, slot: s,
          absStart: absHour(s.start),
          absEnd: absEndHour(s.start, s.end)
        });
      });
    });

    var html = '';

    // Deel-knoppen bovenaan (er is hier altijd ≥ 1 favoriet). Op een laptop
    // toont navigator.share weinig opties, dus ook WhatsApp + kopieer-link.
    html += '<div class="share-row">' +
      '<div class="share-intro">Dit is jouw route — deel ’m met je vrienden!</div>' +
      '<div class="share-btns">' +
        '<button class="share-btn share-btn--native" id="shareNativeBtn" type="button" hidden>' +
          '📤 Deel</button>' +
        '<button class="share-btn share-btn--wa" id="shareWaBtn" type="button">' +
          'WhatsApp</button>' +
        '<button class="share-btn share-btn--copy" id="shareCopyBtn" type="button">' +
          '🔗 Kopieer link</button>' +
      '</div>' +
      '<div class="share-feedback" id="shareFeedback" hidden></div>' +
      '</div>';

    DAY_ORDER.forEach(function (dayId) {
      var items = perDay[dayId];
      if (!items || items.length === 0) return;
      items.sort(function (x, y) { return x.absStart - y.absStart; });

      // Overlap-detectie (chronologisch): markeer elke overlap met eerdere favoriet
      items.forEach(function (item, i) {
        item.overlaps = [];
        for (var j = 0; j < items.length; j++) {
          if (j === i) continue;
          var other = items[j];
          // overlap als start < other.end EN other.start < end
          if (item.absStart < other.absEnd && other.absStart < item.absEnd) {
            item.overlaps.push(other.artist.name);
          }
        }
      });

      var day = dayById[dayId];
      html += '<div class="myday"><div class="myday__head">' +
        escapeHtml(day.label) + ' · ' + escapeHtml(day.datum) + '</div>' +
        '<div class="timeline">';

      items.forEach(function (item) {
        var s = item.slot;
        var color = stageColor(s.stage);
        var overlapHtml = "";
        if (item.overlaps.length) {
          overlapHtml = '<div class="tl-overlap">⚠️ overlapt met ' +
            escapeHtml(item.overlaps.join(", ")) + '</div>';
        }
        var extras = "";
        if (s.live) extras += '<span class="tag-live">LIVE</span>';
        if (s.label) extras += '<span class="tag-label">' + escapeHtml(s.label) + '</span>';

        html += '<button class="tl-item" data-artist="' + escapeHtml(item.artist.id) +
          '" style="--stage-color:' + color + '">' +
          '<div class="tl-item__time">' + escapeHtml(s.start + "–" + s.end) +
            (isNight(s) ? '<br><small class="muted">’s nachts</small>' : '') + '</div>' +
          '<div class="tl-item__body">' +
            '<div class="tl-item__name">' + escapeHtml(item.artist.name) +
              (item.artist.tip ? '<span class="tip-badge">★</span>' : '') + extras + '</div>' +
            '<div class="tl-item__stage">📍 ' + escapeHtml(s.stage) + '</div>' +
            overlapHtml +
          '</div>' +
          '<span class="tl-heart">❤️</span>' +
        '</button>';
      });

      html += '</div></div>';
    });

    if (noTimeFavs.length) {
      noTimeFavs.sort(function (a, b) { return a.name.localeCompare(b.name, "nl"); });
      html += '<div class="myday no-time-fav-section">' +
        '<div class="myday__head">Nog geen tijd bekend</div>' +
        '<div class="no-time-chips">';
      noTimeFavs.forEach(function (a) {
        html += '<button class="no-time-chip is-fav" data-artist="' + escapeHtml(a.id) + '">' +
          (a.tip ? "★ " : "") + escapeHtml(a.name) + '</button>';
      });
      html += '</div></div>';
    }

    el("view").innerHTML = html;

    document.querySelectorAll("[data-artist]").forEach(function (b) {
      b.addEventListener("click", function () {
        location.hash = "artiest/" + b.getAttribute("data-artist");
      });
    });

    // (1) Deel — alleen tonen als navigator.share bestaat (anders verborgen).
    var nativeBtn = el("shareNativeBtn");
    if (nativeBtn && navigator.share) {
      nativeBtn.hidden = false;
      nativeBtn.addEventListener("click", shareRoute);
    }
    // (2) WhatsApp — opent wa.me met de ge-encodeerde route-tekst (nieuw tabblad).
    var waBtn = el("shareWaBtn");
    if (waBtn) waBtn.addEventListener("click", function () {
      var text = "Dit is mijn Wildeburg-route! " + buildRouteUrl();
      window.open("https://wa.me/?text=" + encodeURIComponent(text), "_blank");
    });
    // (3) Kopieer link — clipboard met zichtbare feedback.
    var copyBtn = el("shareCopyBtn");
    if (copyBtn) copyBtn.addEventListener("click", function () {
      copyRouteUrl(buildRouteUrl());
    });

    scrollTop();
  }

  // ======================================================================
  //  ROUTE DELEN ("Dit is mijn route") + IMPORTEREN via #route=<ids>
  // ======================================================================

  // Bouw de deel-link dynamisch uit location (domein verhuist binnenkort,
  // dus NIETS hardcoden).
  function buildRouteUrl() {
    return location.origin + location.pathname + "#route=" + favs.join(",");
  }

  function showShareFeedback(msg) {
    var fb = el("shareFeedback");
    if (!fb) return;
    fb.textContent = msg;
    fb.hidden = false;
  }

  // Kopieer-fallback voor browsers zonder navigator.clipboard (of zonder
  // https): onzichtbare textarea + execCommand("copy").
  function legacyCopy(text) {
    try {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, ta.value.length);
      var ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch (e) { return false; }
  }

  function copyRouteUrl(url) {
    var COPIED = "Gekopieerd! Plak ’m in je groepsapp";
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () {
        showShareFeedback(COPIED);
      }).catch(function () {
        if (legacyCopy(url)) showShareFeedback(COPIED);
        else showShareFeedback("Kopiëren lukte niet — dit is je link: " + url);
      });
    } else if (legacyCopy(url)) {
      showShareFeedback(COPIED);
    } else {
      showShareFeedback("Kopiëren lukte niet — dit is je link: " + url);
    }
  }

  function shareRoute() {
    if (!favs.length) return;
    var url = buildRouteUrl();
    if (navigator.share) {
      navigator.share({
        title: "Op pad met Serge — mijn Wildeburg-route",
        text: "Dit is mijn Wildeburg-route!",
        url: url
      }).catch(function (err) {
        // Geannuleerd door de gebruiker = prima; anders alsnog kopiëren.
        if (err && err.name !== "AbortError") copyRouteUrl(url);
      });
    } else {
      copyRouteUrl(url);
    }
  }

  // Na een import-keuze: #route=… uit de URL halen (zodat herladen niet
  // opnieuw vraagt) en doorgaan naar de gewenste tab.
  function finishRouteImport(targetHash) {
    if (history.replaceState) {
      history.replaceState(null, "", location.pathname + location.search + "#" + targetHash);
      route(); // replaceState vuurt geen hashchange, dus zelf routeren
    } else {
      location.hash = targetHash; // heel oude browsers: gewoon navigeren
    }
  }

  function renderRouteImport(idsParam) {
    currentView = "route-import";

    // Parse: komma-gescheiden ids; onbekende ids stil negeren, dubbelen ook.
    var ids = [];
    decodeURIComponent(idsParam || "").split(",").forEach(function (raw) {
      var id = raw.trim();
      if (id && byId[id] && ids.indexOf(id) === -1) ids.push(id);
    });

    if (ids.length === 0) {
      el("view").innerHTML =
        '<div class="route-import">' +
          '<div class="route-import__emoji">🤔</div>' +
          '<h2 class="route-import__title">Deze route-link bevat geen (bekende) acts</h2>' +
          '<p class="route-import__sub">Vraag je vriend(in) om de link opnieuw te delen.</p>' +
          '<button class="route-import__btn route-import__btn--primary" data-routeok="1">' +
            'Naar home</button>' +
        '</div>';
      document.querySelector("[data-routeok]").addEventListener("click", function () {
        finishRouteImport("home");
      });
      scrollTop();
      return;
    }

    var names = ids.map(function (id) { return byId[id].name; });
    var MAX_NAMES = 6;
    var listHtml = names.slice(0, MAX_NAMES).map(function (n) {
      return '<li>' + escapeHtml(n) + '</li>';
    }).join("");
    var moreHtml = names.length > MAX_NAMES
      ? '<li class="route-import__more">en ' + (names.length - MAX_NAMES) + ' meer…</li>'
      : '';

    el("view").innerHTML =
      '<div class="route-import">' +
        '<div class="route-import__emoji">📬</div>' +
        '<h2 class="route-import__title">Iemand deelt z’n Wildeburg-route met je: ' +
          ids.length + ' act' + (ids.length === 1 ? '' : 's') + ' 🎉</h2>' +
        '<ul class="route-import__list">' + listHtml + moreHtml + '</ul>' +
        '<button class="route-import__btn route-import__btn--primary" data-routeadd="1">' +
          '❤️ Voeg toe aan mijn favorieten</button>' +
        '<button class="route-import__btn" data-routecancel="1">Nee, laat maar</button>' +
      '</div>';

    document.querySelector("[data-routeadd]").addEventListener("click", function () {
      // UNION: alleen toevoegen wat nog niet favoriet is; niets verwijderen.
      ids.forEach(function (id) {
        if (favs.indexOf(id) === -1) favs.push(id);
      });
      saveFavs();
      finishRouteImport("mijn");
    });
    document.querySelector("[data-routecancel]").addEventListener("click", function () {
      finishRouteImport("home");
    });

    scrollTop();
  }

  // ======================================================================
  //  TAB 0: HOME (welkom + "Nu op Wildeburg" + stats + Over Serge)
  // ======================================================================
  var TIP_COUNT = DATA.artists.filter(function (a) { return a.tip; }).length;

  // Minuut-tik die de "Nu op Wildeburg"-widget bijwerkt zolang home in beeld is.
  var homeTimer = null;
  function clearHomeTimer() {
    if (homeTimer) { clearInterval(homeTimer); homeTimer = null; }
  }

  // Getimede slots per podium (gesorteerd op globale starttijd), gememoïseerd.
  var _timedByStage = null;
  function timedByStage() {
    if (_timedByStage) return _timedByStage;
    _timedByStage = {};
    slotsForFestival().timed.forEach(function (t) {
      (_timedByStage[t.stage] = _timedByStage[t.stage] || []).push(t);
    });
    Object.keys(_timedByStage).forEach(function (k) {
      _timedByStage[k].sort(function (a, b) { return a.gStart - b.gStart; });
    });
    return _timedByStage;
  }
  // Wat speelt er NU / STRAKS op een podium, gegeven het globale uur (0..59)?
  // Wordt gedeeld door de home-widget én de kaart-popups.
  function stageNowNext(stage, globalNow) {
    var list = timedByStage()[stage] || [];
    var current = null, next = null;
    list.forEach(function (t) {
      if (t.gStart <= globalNow && globalNow < t.gEnd) current = t;
    });
    list.forEach(function (t) {
      if (t.gStart > globalNow && (!next || t.gStart < next.gStart)) next = t;
    });
    return { current: current, next: next, first: list[0] || null };
  }

  // Bouwt de inhoud van het "Nu op Wildeburg"-blok op basis van de apparaatklok.
  function buildNowHtml() {
    var now = new Date();

    // ---- VÓÓR het festival: countdown ----
    if (now < FEST_START_TS) {
      var todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      var dayDiff = Math.round((FEST_DAY_MID - todayMid) / 86400000);
      var msg;
      if (dayDiff >= 2) {
        msg = "Nog " + dayDiff + " nachtjes slapen";
      } else if (dayDiff === 1) {
        msg = "Morgen begint het!!";
      } else {
        // Vrijdag 10 juli, vóór 12:00
        var uren = Math.max(1, Math.ceil((FEST_START_TS - now) / 3600000));
        msg = "Vandaag!! Nog " + uren + " uur…";
      }
      return '<div class="home-now__count">' + escapeHtml(msg) + '</div>' +
             '<div class="home-now__sub">Wildeburg 2026 · 10–12 juli · Kraggenburg</div>';
    }

    // ---- NA het festival ----
    if (now > FEST_END_TS) {
      return '<div class="home-now__count">Dat was Wildeburg 2026 — tot volgend jaar!</div>';
    }

    // ---- TIJDENS het festival: per podium de act die NU speelt ----
    var globalNow = (now - FEST_START_TS) / 3600000; // 0..59 op de doorlopende tijdlijn
    var rows = "";

    DATA.stages.forEach(function (st) {
      var nn = stageNowNext(st, globalNow);
      var current = nn.current, next = nn.next;
      if (!current) return; // podia zonder actueel programma weglaten

      var a = current.artist;
      var marks = "";
      if (a.tip) marks += '<span class="home-now__star" title="Tip van Serge">★</span>';
      if (isFav(a.id)) marks += '<span class="home-now__heart" title="Favoriet">❤️</span>';

      rows += '<a class="home-now__act" href="#artiest/' + escapeHtml(a.id) + '" ' +
        'style="--stage-color:' + stageColor(st) + '">' +
        '<span class="home-now__dot"></span>' +
        '<span class="home-now__info">' +
          '<span class="home-now__stage">' + escapeHtml(st) + '</span>' +
          '<span class="home-now__name">' + escapeHtml(a.name) + marks + '</span>' +
          '<span class="home-now__till">nog tot ' + escapeHtml(current.slot.end) + '</span>' +
          (next
            ? '<span class="home-now__next">straks: ' + escapeHtml(next.artist.name) +
              ' (' + escapeHtml(next.slot.start) + ')</span>'
            : '') +
        '</span>' +
      '</a>';
    });

    if (!rows) {
      return '<div class="home-now__sub">Even geen live programma — kijk zo weer!</div>';
    }
    return '<div class="home-now__list">' + rows + '</div>';
  }

  // ---- "Vraag het Serge": kies een aanbeveling -------------------------
  // Sluit hutjes zonder muzikaal programma uit + acts zonder notitie.
  var SERGE_EXCLUDE_TYPES = { host: true, overig: true, theater: true };
  function sergeEligible(a) {
    return a && !SERGE_EXCLUDE_TYPES[a.type] &&
      a.desc != null && String(a.desc).trim() !== "";
  }

  // Getimede slots die NU spelen of binnen 2 uur beginnen (globaal uur).
  function sergeFestivalCandidates(globalNow) {
    var out = [];
    slotsForFestival().timed.forEach(function (t) {
      if (!sergeEligible(t.artist)) return;
      var playingNow = t.gStart <= globalNow && globalNow < t.gEnd;
      var soon = t.gStart >= globalNow && t.gStart <= globalNow + 2;
      if (playingNow || soon) out.push(t);
    });
    return out;
  }
  function sergePickFrom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }
  // Levert { mode:"festival"|"listen", artist, slot } of null.
  // excludeId zorgt dat "Doe nog een gok" nooit direct dezelfde teruggeeft.
  function pickSergeSuggestion(excludeId) {
    var now = new Date();
    var during = now >= FEST_START_TS && now <= FEST_END_TS;
    if (during) {
      var globalNow = (now - FEST_START_TS) / 3600000;
      var cands = sergeFestivalCandidates(globalNow);
      var notSame = cands.filter(function (t) { return t.artist.id !== excludeId; });
      var pool = notSame.length ? notSame : cands;
      if (pool.length) {
        // Voorkeur voor tip-acts (met desc).
        var tips = pool.filter(function (t) { return t.artist.tip; });
        var t = sergePickFrom(tips.length ? tips : pool);
        return { mode: "festival", artist: t.artist, slot: t.slot };
      }
      // Geen live kandidaten in het venster (bv. nachtgat) -> luistertip.
    }
    // Buiten festivaltijd (of geen live kandidaten): willekeurige tip-act.
    var listenPool = DATA.artists.filter(function (a) {
      return sergeEligible(a) && a.tip;
    });
    var notSameL = listenPool.filter(function (a) { return a.id !== excludeId; });
    var lp = notSameL.length ? notSameL : listenPool;
    if (!lp.length) return null;
    var a = sergePickFrom(lp);
    var firstTimed = (a.slots || []).filter(function (s) { return s.start != null; })[0];
    var slot = firstTimed || (a.slots || [])[0] || null;
    return { mode: "listen", artist: a, slot: slot };
  }

  // Dag + tijd + podium voor "wanneer speelt hij" (luistertip).
  function sergeWhen(slot) {
    if (!slot) return "Nog niet op het blokkenschema";
    var tijd = (slot.start && slot.end) ? (slot.start + "–" + slot.end) : "tijd nog onbekend";
    return capFirst(dayText(slot)) + " · " + tijd + " · " + slot.stage;
  }

  // Bouw de aanbeveling-HTML (zonder de "Doe nog een gok"-knop).
  function buildSergeRec(sugg) {
    var a = sugg.artist;
    var star = a.tip ? ' <span class="home-ask__star" title="Tip van Serge">★</span>' : '';
    var quote = '<div class="home-ask__quote">' +
      '<span class="home-ask__says">Serge zegt:</span> ' +
      '<em>“' + escapeHtml(a.desc) + '”</em></div>';

    if (sugg.mode === "festival") {
      var s = sugg.slot;
      var tijd = (s.start && s.end) ? (s.start + "–" + s.end) : "tijd nog onbekend";
      return '<div class="home-ask__rec">' +
        '<div class="home-ask__line">' +
          '<a class="home-ask__name" href="#artiest/' + escapeHtml(a.id) + '">' +
            escapeHtml(a.name) + star + '</a>' +
        '</div>' +
        '<div class="home-ask__meta">' + escapeHtml(tijd) + ' · ' +
          '<a class="home-ask__stage" href="#kaart/' + stageSlug(s.stage) + '">📍 ' +
          escapeHtml(s.stage) + '</a></div>' +
        quote +
      '</div>';
    }
    // Luistertip
    return '<div class="home-ask__rec">' +
      '<p class="home-ask__lead">Alvast in de stemming komen? Serge raadt ' +
        '<a class="home-ask__name" href="#artiest/' + escapeHtml(a.id) + '">' +
        escapeHtml(a.name) + '</a> aan:</p>' +
      quote +
      '<p class="home-ask__when">Speelt: ' + escapeHtml(sergeWhen(sugg.slot)) + '</p>' +
    '</div>';
  }

  var lastSergeId = null;
  function showSergeSuggestion() {
    var box = el("homeAskResult");
    if (!box) return;
    var sugg = pickSergeSuggestion(lastSergeId);
    var intro = el("homeAskIntro");
    if (!sugg) {
      box.innerHTML = '<div class="home-ask__rec"><p class="home-ask__lead">' +
        'Serge is even sprakeloos — probeer het zo nog eens!</p></div>';
      box.hidden = false;
      if (intro) intro.hidden = true;
      return;
    }
    lastSergeId = sugg.artist.id;
    box.innerHTML = buildSergeRec(sugg) +
      '<button class="home-ask__again" type="button" id="askSergeAgain">Doe nog een gok</button>';
    box.hidden = false;
    if (intro) intro.hidden = true;
    var again = el("askSergeAgain");
    if (again) again.addEventListener("click", showSergeSuggestion);
  }

  function renderHome() {
    currentView = "home";

    var favCount = favs.length;

    var sergeText =
      '<p>Serge is de synth-nerd van de vriendengroep: het type dat op een festival ' +
      'niet naar de dj kijkt, maar naar de kabels erachter. Nieuwsgierig naar alles ' +
      'wat piept, bromt of knettert — hoe obscuurder, hoe beter.</p>' +
      '<p>Voor Wildeburg 2026 heeft hij alle 163 acts beluisterd. Ja, állemaal. Ook de ' +
      'autotune (daar moet hij nog even van bijkomen). Bij elke act schreef hij zijn ' +
      'ongezouten mening: soms lovend, soms genadeloos, altijd eerlijk.</p>' +
      '<p>Wat begon als een grapje in een notitie, groeide uit tot een heuse gids mét ' +
      'webapp, waarin je ook je eigen favvies kunt bewaren. De ★ sterretjes markeren ' +
      'Serges ultieme favorieten — grote kans dat je hem daar links vooraan in het wild spot.</p>';

    var html =
      '<section class="home">' +
        '<div class="home-hero">' +
          '<h2 class="home-hero__title">Welkom!</h2>' +
          '<p class="home-hero__intro">Alle artiesten van Wildeburg 2026, het complete ' +
          'blokkenschema en de ongezouten mening van Serge bij (bijna) elke act.</p>' +
        '</div>' +

        '<div class="home-block">' +
          '<div class="section-title">Nu op Wildeburg</div>' +
          '<div id="homeNow" class="home-now">' + buildNowHtml() + '</div>' +
        '</div>' +

        '<div class="home-block">' +
          '<div class="section-title">Vraag het Serge</div>' +
          '<div class="home-ask" id="homeAsk">' +
            '<div class="home-ask__intro" id="homeAskIntro">' +
              '<p class="home-ask__q">Help, ik weet niet waar ik heen moet!</p>' +
              '<button class="home-ask__btn" id="askSergeBtn" type="button">Vraag het Serge</button>' +
            '</div>' +
            '<div class="home-ask__result" id="homeAskResult" hidden></div>' +
          '</div>' +
        '</div>' +

        '<div class="home-stats">' +
          '<a class="home-stat" href="#artiesten">' +
            '<span class="home-stat__num">' + DATA.artists.length + '</span>' +
            '<span class="home-stat__label">acts</span></a>' +
          '<button class="home-stat" type="button" data-hometips="1">' +
            '<span class="home-stat__num">★ ' + TIP_COUNT + '</span>' +
            '<span class="home-stat__label">tips van Serge</span></button>' +
          '<a class="home-stat" href="#mijn">' +
            '<span class="home-stat__num">' + favCount + '</span>' +
            '<span class="home-stat__label">jouw favorieten</span></a>' +
        '</div>' +

        '<details class="home-serge" id="overSerge">' +
          '<summary class="home-serge__summary">Wie is Serge eigenlijk?</summary>' +
          '<div class="home-serge__panel">' +
            '<figure class="home-serge__figure" id="sergeFigure">' +
              '<img class="home-serge__img" src="./serge.jpg" alt="Serge achter de knopjes">' +
              '<figcaption class="home-serge__caption">Serge in het wild, in z\'n ' +
              'natuurlijke habitat (achter de knopjes).</figcaption>' +
            '</figure>' +
            '<div class="home-serge__text">' + sergeText + '</div>' +
          '</div>' +
        '</details>' +
      '</section>';

    el("view").innerHTML = html;

    // Tips-tegel: zet het "★ Alleen tips"-filter aan en ga naar de artiestenlijst.
    var tipsBtn = document.querySelector("[data-hometips]");
    if (tipsBtn) tipsBtn.addEventListener("click", function () {
      searchState.tipOnly = true;
      location.hash = "artiesten";
    });

    // "Vraag het Serge": eerste klik toont een aanbeveling in dezelfde kaart.
    lastSergeId = null;
    var askBtn = el("askSergeBtn");
    if (askBtn) askBtn.addEventListener("click", showSergeSuggestion);

    // Foto-blok netjes verbergen als serge.jpg (nog) niet bestaat.
    var sergeImg = document.querySelector("#sergeFigure .home-serge__img");
    var sergeFig = el("sergeFigure");
    if (sergeImg && sergeFig) {
      sergeImg.addEventListener("error", function () { sergeFig.style.display = "none"; });
      // Als de load al mislukt was vóór onze listener: complete + geen afmetingen.
      if (sergeImg.complete && sergeImg.naturalWidth === 0) {
        sergeFig.style.display = "none";
      }
    }

    // Elke minuut de "Nu"-widget herberekenen zolang home zichtbaar is.
    clearHomeTimer();
    homeTimer = setInterval(function () {
      var n = el("homeNow");
      if (!n) { clearHomeTimer(); return; } // van view gewisseld
      n.innerHTML = buildNowHtml();
    }, 60000);

    scrollTop(); // home heeft geen scroll-geheugen
  }

  // ======================================================================
  //  TAB 5: KAART (plattegrond met podium-markers)
  // ======================================================================
  var mapPopupEl = null;

  function closeMapPopup() {
    if (mapPopupEl) { mapPopupEl.parentNode && mapPopupEl.parentNode.removeChild(mapPopupEl); mapPopupEl = null; }
    var bd = el("mapPopBackdrop");
    if (bd) bd.hidden = true;
  }

  // Popup-inhoud voor een podium-marker (deelt de nu/straks-logica met home).
  function buildStagePopupContent(stage) {
    var now = new Date();
    var color = stageColor(stage);
    var html = '<div class="mk-pop__title">' +
      '<span class="mk-pop__dot" style="background:' + color + '"></span>' +
      escapeHtml(stage) + '</div>';

    function actLink(t) {
      return '<a class="mk-pop__act" href="#artiest/' + escapeHtml(t.artist.id) + '">' +
        (t.artist.tip ? '★ ' : '') + escapeHtml(t.artist.name) + '</a>';
    }

    // Link naar de volledige podiumpagina (onder de nu/straks-regels).
    function stageAllLink() {
      return '<a class="mk-pop__all" href="#podium/' + stageSlug(stage) + '">' +
        'Alle acts op dit podium →</a>';
    }

    if (now > FEST_END_TS) {
      html += '<div class="mk-pop__line">Wildeburg is voorbij 🌲</div>';
      return html + stageAllLink();
    }
    if (now < FEST_START_TS) {
      var first = stageNowNext(stage, -1).first; // -1 => geen current; first = eerste act
      if (first) {
        html += '<div class="mk-pop__line">Eerste act: ' +
          escapeHtml(first.slot.day) + ' ' + escapeHtml(first.slot.start) + ' ' +
          actLink(first) + '</div>';
      } else {
        html += '<div class="mk-pop__line">Nog geen programma bekend.</div>';
      }
      return html + stageAllLink();
    }

    // Tijdens het festival
    var gn = (now - FEST_START_TS) / 3600000;
    var nn = stageNowNext(stage, gn);
    if (nn.current) {
      html += '<div class="mk-pop__line"><strong>Nu:</strong> ' + actLink(nn.current) +
        ' <span class="mk-pop__t">(tot ' + escapeHtml(nn.current.slot.end) + ')</span></div>';
    }
    if (nn.next) {
      html += '<div class="mk-pop__line"><strong>Straks:</strong> ' + actLink(nn.next) +
        ' <span class="mk-pop__t">(' + escapeHtml(nn.next.slot.start) + ')</span></div>';
    }
    if (!nn.current && !nn.next) {
      html += '<div class="mk-pop__line">Geen act meer op dit podium.</div>';
    }
    return html + stageAllLink();
  }

  function openMapPopup(stage, infoName) {
    closeMapPopup();
    var content = infoName
      ? '<div class="mk-pop__title"><span class="mk-pop__dot mk-pop__dot--info"></span>' +
        escapeHtml(infoName) + '</div>'
      : buildStagePopupContent(stage);

    var pop = document.createElement("div");
    pop.className = "mk-pop";
    pop.innerHTML = '<button class="mk-pop__close" aria-label="Sluiten">×</button>' + content;
    el("view").appendChild(pop);
    mapPopupEl = pop;

    var bd = el("mapPopBackdrop");
    if (bd) bd.hidden = false;

    pop.querySelector(".mk-pop__close").addEventListener("click", function (e) {
      e.stopPropagation();
      closeMapPopup();
    });
    // Klik binnen de popup mag niet "buiten-sluiten" triggeren.
    pop.addEventListener("click", function (e) { e.stopPropagation(); });
    // Na navigeren via een act-link of de podiumpagina-link de popup opruimen.
    pop.querySelectorAll(".mk-pop__act, .mk-pop__all").forEach(function (a) {
      a.addEventListener("click", function () { closeMapPopup(); });
    });
  }

  // Centreer een marker in het scroll-venster van de kaart.
  function centerMapMarker(marker) {
    var sc = el("mapScroll"), innerEl = el("mapInner");
    if (!sc || !innerEl || !marker) return;
    var xPct = parseFloat(marker.style.left) / 100;
    var yPct = parseFloat(marker.style.top) / 100;
    sc.scrollLeft = innerEl.offsetWidth * xPct - sc.clientWidth / 2;
    sc.scrollTop = innerEl.offsetHeight * yPct - sc.clientHeight / 2;
  }

  function renderMap(focusSlug) {
    currentView = "kaart";

    var markersHtml = "";
    STAGE_MARKERS.forEach(function (m) {
      var slug = stageSlug(m.stage);
      markersHtml += '<button class="map-marker map-marker--stage" ' +
        'data-stageslug="' + escapeHtml(slug) + '" ' +
        'style="left:' + m.x + '%;top:' + m.y + '%;--stage-color:' + stageColor(m.stage) + '" ' +
        'aria-label="' + escapeHtml(m.stage) + '"></button>';
    });
    INFO_MARKERS.forEach(function (m) {
      markersHtml += '<button class="map-marker map-marker--info" ' +
        'data-infoname="' + escapeHtml(m.name) + '" ' +
        'style="left:' + m.x + '%;top:' + m.y + '%" ' +
        'aria-label="' + escapeHtml(m.name) + '"></button>';
    });

    var html =
      '<div class="map-wrap">' +
        '<div class="map-zoom">' +
          '<button class="map-zoom__btn" type="button" data-zoom="in" aria-label="Inzoomen">+</button>' +
          '<button class="map-zoom__btn" type="button" data-zoom="out" aria-label="Uitzoomen">−</button>' +
          '<button class="map-zoom__btn" type="button" data-zoom="reset" aria-label="Zoom resetten">⤢</button>' +
        '</div>' +
        '<div class="map-scroll" id="mapScroll">' +
          '<div class="map-inner" id="mapInner" style="width:100%;">' +
            '<img class="map-img" id="mapImg" src="./kaart.jpg" ' +
            'alt="Plattegrond Wildeburg 2026">' +
            markersHtml +
          '</div>' +
        '</div>' +
      '</div>' +
      '<p class="map-source">Plattegrond © ' +
        '<a href="https://wildeburg.nl" target="_blank" rel="noopener">Wildeburg — wildeburg.nl</a></p>' +
      '<div class="map-pop-backdrop" id="mapPopBackdrop" hidden></div>';

    el("view").innerHTML = html;
    scrollTop();

    // ---- Zoom ----
    var ZOOM_LEVELS = [100, 175, 250];
    var zoomIdx = 0;
    var inner = el("mapInner");
    function applyZoom() { inner.style.width = ZOOM_LEVELS[zoomIdx] + "%"; }
    document.querySelectorAll("[data-zoom]").forEach(function (b) {
      b.addEventListener("click", function () {
        var z = b.getAttribute("data-zoom");
        if (z === "in") zoomIdx = Math.min(ZOOM_LEVELS.length - 1, zoomIdx + 1);
        else if (z === "out") zoomIdx = Math.max(0, zoomIdx - 1);
        else zoomIdx = 0;
        applyZoom();
      });
    });

    // ---- Marker-kliks ----
    document.querySelectorAll(".map-marker--stage").forEach(function (mk) {
      mk.addEventListener("click", function (e) {
        e.stopPropagation();
        openMapPopup(SLUG_STAGE[mk.getAttribute("data-stageslug")], null);
      });
    });
    document.querySelectorAll(".map-marker--info").forEach(function (mk) {
      mk.addEventListener("click", function (e) {
        e.stopPropagation();
        openMapPopup(null, mk.getAttribute("data-infoname"));
      });
    });

    // Tik-buiten-sluit (op de kaart of op de backdrop).
    el("mapScroll").addEventListener("click", closeMapPopup);
    var bd = el("mapPopBackdrop");
    if (bd) bd.addEventListener("click", closeMapPopup);

    // ---- Deep-link: pulse + centreer (+ popup) ----
    if (focusSlug) {
      var target = document.querySelector(
        '.map-marker--stage[data-stageslug="' + focusSlug + '"]');
      if (target) {
        target.classList.add("is-pulse");
        var focusStage = SLUG_STAGE[focusSlug];
        var doFocus = function () {
          centerMapMarker(target);
          openMapPopup(focusStage, null);
        };
        var img = el("mapImg");
        if (img && img.complete && img.naturalWidth > 0) {
          requestAnimationFrame(doFocus);
        } else if (img) {
          img.addEventListener("load", function () { requestAnimationFrame(doFocus); });
        }
        // Vangnet als de load-event al gepasseerd was.
        setTimeout(function () { centerMapMarker(target); }, 300);
      }
    }
  }

  // ======================================================================
  //  PODIUMPAGINA (#podium/<slug>) — alle sets op één podium, chronologisch
  // ======================================================================
  function stageSetRow(a, s, color) {
    var fav = isFav(a.id);
    var heart = fav ? "❤️" : "🤍";
    var extras = "";
    if (s.live) extras += '<span class="tag-live">LIVE</span>';
    if (s.label) extras += '<span class="tag-label">' + escapeHtml(s.label) + '</span>';
    return '<div class="stage-set' + (fav ? " is-fav" : "") + '" data-artist="' +
      escapeHtml(a.id) + '" style="--stage-color:' + color + '">' +
      '<div class="stage-set__time">' + escapeHtml(s.start + "–" + s.end) +
        (isNight(s) ? '<br><small class="muted">’s nachts</small>' : '') + '</div>' +
      '<div class="stage-set__body">' +
        '<div class="stage-set__name">' + escapeHtml(a.name) +
          (a.tip ? '<span class="tip-badge">★</span>' : '') + extras + '</div>' +
      '</div>' +
      '<button class="stage-set__heart" data-fav="' + escapeHtml(a.id) +
        '" aria-label="Favoriet aan/uit">' + heart + '</button>' +
    '</div>';
  }

  function renderStage(slug) {
    currentView = "podium";
    var stage = SLUG_STAGE[slug];
    if (!stage) {
      el("view").innerHTML =
        '<button class="back-btn" data-back="1">← Terug</button>' +
        '<div class="no-results">Podium niet gevonden.</div>';
      bindBack();
      scrollTop();
      return;
    }
    var color = stageColor(stage);

    // Verzamel alle sets op dit podium, gescheiden in getimed / zonder tijd.
    var perDay = {}, untimedPerDay = {};
    DAY_ORDER.forEach(function (d) { perDay[d] = []; untimedPerDay[d] = []; });
    DATA.artists.forEach(function (a) {
      (a.slots || []).forEach(function (s) {
        if (s.stage !== stage) return;
        if (!perDay[s.day]) { perDay[s.day] = []; untimedPerDay[s.day] = []; }
        if (s.start != null && s.end != null) {
          perDay[s.day].push({ artist: a, slot: s, abs: absHour(s.start) });
        } else {
          untimedPerDay[s.day].push({ artist: a, slot: s });
        }
      });
    });

    var html =
      '<button class="back-btn" data-back="1">← Terug</button>' +
      '<div class="stage-page" style="--stage-color:' + color + '">' +
        '<div class="stage-page__head">' +
          '<h1 class="stage-page__name">' + escapeHtml(stage) + '</h1>' +
          '<a class="stage-page__maplink" href="#kaart/' + slug + '">📍 Op de kaart</a>' +
        '</div>';

    var any = false;
    DAY_ORDER.forEach(function (dayId) {
      var items = perDay[dayId] || [];
      var untimed = untimedPerDay[dayId] || [];
      if (!items.length && !untimed.length) return;
      any = true;
      items.sort(function (x, y) { return x.abs - y.abs; });
      var day = dayById[dayId];
      html += '<div class="stage-day">' +
        '<div class="stage-day__head">' +
          escapeHtml((day ? day.label + ' · ' + day.datum : dayId)) + '</div>' +
        '<div class="stage-day__list">';
      items.forEach(function (item) {
        html += stageSetRow(item.artist, item.slot, color);
      });
      html += '</div>';
      if (untimed.length) {
        html += '<div class="no-time-chips stage-day__chips">';
        untimed.forEach(function (item) {
          var fav = isFav(item.artist.id);
          html += '<button class="no-time-chip' + (fav ? " is-fav" : "") + '" ' +
            'data-artist="' + escapeHtml(item.artist.id) + '">' +
            (item.artist.tip ? "★ " : "") + escapeHtml(item.artist.name) + '</button>';
        });
        html += '</div>';
      }
      html += '</div>';
    });
    if (!any) html += '<div class="no-results">Nog geen programma op dit podium.</div>';
    html += '</div>';

    el("view").innerHTML = html;
    bindBack();

    // Rij klikbaar -> artiestdetail (behalve een klik op het hartje).
    document.querySelectorAll(".stage-set[data-artist]").forEach(function (row) {
      row.addEventListener("click", function (e) {
        if (e.target.closest("[data-fav]")) return;
        location.hash = "artiest/" + row.getAttribute("data-artist");
      });
    });
    // Chips (sets zonder tijd) navigeren gewoon door.
    document.querySelectorAll(".stage-day__chips [data-artist]").forEach(function (b) {
      b.addEventListener("click", function () {
        location.hash = "artiest/" + b.getAttribute("data-artist");
      });
    });
    // Hartje togglen zonder door te navigeren.
    document.querySelectorAll(".stage-set [data-fav]").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        var id = btn.getAttribute("data-fav");
        toggleFav(id);
        var nowFav = isFav(id);
        btn.textContent = nowFav ? "❤️" : "🤍";
        var row = btn.closest(".stage-set");
        if (row) row.classList.toggle("is-fav", nowFav);
      });
    });

    scrollTop();
  }

  // ---- Start ----
  // Lege hash => HOME (default). route() vangt hash === "" zelf af, dus we
  // hoeven geen default-hash te forceren.
  route();
})();
