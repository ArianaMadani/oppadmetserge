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
  var currentView = "artiesten"; // welke tab/scherm actief is (voor gerichte re-renders)

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

  // Grid-grenzen per dag. Vr/za: 12:00 -> 12:00 volgende dag (36). Zo: 12:00 -> 23:00 (23).
  function gridRange(dayId) {
    if (dayId === "zo") return { start: 12, end: 23 };
    return { start: 12, end: 36 };
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

  function route() {
    var hash = location.hash.replace(/^#/, "");
    var parts = hash.split("/");

    if (parts[0] === "artiest" && parts[1]) {
      renderDetail(parts[1]);
      setActiveTab(null);
      return;
    }
    if (parts[0] === "schema") {
      renderSchedule(parts[1] || currentDay);
      setActiveTab("schema");
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
          (a.tip ? '<span class="tip-badge" title="Tip van Serge & Ariana">★</span>' : '') +
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
            '<br><span class="slot-line__stage">📍 ' + escapeHtml(s.stage) + '</span>' +
          '</div>' +
        '</div>';
      }).join("") + '</div>';
    } else {
      slotsHtml = '<div class="detail__slots"><div class="slot-none">Nog niet op het blokkenschema</div></div>';
    }

    var html =
      '<button class="back-btn" data-back="1">← Terug</button>' +
      '<div class="detail" style="--stage-color:' + color + '">' +
        (a.tip ? '<div class="detail__tip">★ Tip van Serge &amp; Ariana</div>' : '') +
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
  //  TAB 3: BLOKKENSCHEMA
  // ======================================================================
  var currentDay = "vr";
  var HOUR_WIDTH = 108; // px per uur (horizontaal scrollbaar)
  var STAGE_LABEL_WIDTH = 116;

  // Verzamel alle getimede slots per dag + podium; en de "geen tijd"-slots.
  function slotsForDay(dayId) {
    var timed = [];   // {artist, slot, absStart, absEnd}
    var untimed = {}; // stage -> [ {artist, slot} ]
    DATA.artists.forEach(function (a) {
      (a.slots || []).forEach(function (s) {
        if (s.day !== dayId) return;
        if (s.start == null || s.end == null) {
          if (!untimed[s.stage]) untimed[s.stage] = [];
          untimed[s.stage].push({ artist: a, slot: s });
        } else {
          timed.push({
            artist: a, slot: s,
            absStart: absHour(s.start),
            absEnd: absEndHour(s.start, s.end)
          });
        }
      });
    });
    return { timed: timed, untimed: untimed };
  }

  function renderSchedule(dayId) {
    currentView = "schema";
    if (DAY_ORDER.indexOf(dayId) === -1) dayId = "vr";
    currentDay = dayId;

    var data = slotsForDay(dayId);
    var range = gridRange(dayId);
    var totalHours = range.end - range.start;
    var gridWidth = STAGE_LABEL_WIDTH + totalHours * HOUR_WIDTH;

    // Dag-switcher
    var html = '<div class="day-switcher">';
    DATA.days.forEach(function (d) {
      html += '<button data-day="' + d.id + '" class="' +
        (d.id === dayId ? "is-active" : "") + '">' +
        escapeHtml(d.label) + '<small>' + escapeHtml(d.datum) + '</small></button>';
    });
    html += '</div>';

    // Podia met minstens één (getimed of ongetimed) slot voor deze dag,
    // maar we tonen alle podia uit data.stages in vaste volgorde als ze slots hebben.
    var stagesWithContent = DATA.stages.filter(function (st) {
      var hasTimed = data.timed.some(function (t) { return t.slot.stage === st; });
      return hasTimed; // rij in het tijd-grid alleen als er getimede blokken zijn
    });

    // ---- Tijd-grid ----
    html += '<div class="schedule-scroll"><div class="schedule-grid" style="' +
      'grid-template-columns:' + STAGE_LABEL_WIDTH + 'px repeat(' + totalHours +
      ', ' + HOUR_WIDTH + 'px);' +
      'grid-template-rows:30px repeat(' + stagesWithContent.length + ', 58px);' +
      'width:' + gridWidth + 'px;">';

    // Rij 1: hoek + tijd-as
    html += '<div class="time-head corner">Podium</div>';
    for (var h = range.start; h < range.end; h++) {
      html += '<div class="time-head" style="grid-column:span 1;">' +
        pad2(h % 24) + ':00</div>';
    }

    // Podium-rijen
    stagesWithContent.forEach(function (st, rowIdx) {
      var rowLine = rowIdx + 2; // grid rows zijn 1-based; rij 1 = tijd-as
      // Sticky label
      html += '<div class="stage-label" style="grid-row:' + rowLine + ';grid-column:1;' +
        '--stage-color:' + stageColor(st) + '">' +
        '<span class="stage-label__swatch"></span>' + escapeHtml(st) + '</div>';

      // Achtergrond-cel over alle uren
      html += '<div class="stage-row-bg" style="grid-row:' + rowLine +
        ';grid-column:2 / span ' + totalHours + ';position:relative;">';

      // Blokken voor dit podium
      data.timed.filter(function (t) { return t.slot.stage === st; })
        .forEach(function (t) {
          var left = (t.absStart - range.start) * HOUR_WIDTH;
          var clampedEnd = Math.min(t.absEnd, range.end);
          var width = (clampedEnd - t.absStart) * HOUR_WIDTH;
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

    html += '</div></div>'; // schedule-grid + scroll

    html += '<p class="schedule-hint">Sleep het schema naar links/rechts. ' +
      'Nacht loopt door tot ’s ochtends. Tik op een blok voor info. ' +
      '❤️ = jouw favoriet.</p>';

    // ---- "Verder deze dag" (slots zonder tijd) ----
    var untimedStages = DATA.stages.filter(function (st) { return data.untimed[st]; });
    if (untimedStages.length) {
      html += '<div class="no-time-section">' +
        '<div class="section-title">Verder deze dag (tijd nog onbekend)</div>';
      untimedStages.forEach(function (st) {
        html += '<div class="no-time-stage" style="--stage-color:' + stageColor(st) + '">' +
          '<div class="no-time-stage__head"><span class="swatch"></span>' +
          escapeHtml(st) + '</div><div class="no-time-chips">';
        data.untimed[st].forEach(function (item) {
          var fav = isFav(item.artist.id);
          html += '<button class="no-time-chip' + (fav ? " is-fav" : "") + '" ' +
            'data-artist="' + escapeHtml(item.artist.id) + '">' +
            (item.artist.tip ? "★ " : "") +
            escapeHtml(item.artist.name) + '</button>';
        });
        html += '</div></div>';
      });
      html += '</div>';
    }

    el("view").innerHTML = html;

    // Events
    document.querySelectorAll("[data-day]").forEach(function (b) {
      b.addEventListener("click", function () {
        location.hash = "schema/" + b.getAttribute("data-day");
      });
    });
    document.querySelectorAll(".sched-block[data-artist], .no-time-chip[data-artist]")
      .forEach(function (b) {
        b.addEventListener("click", function () {
          location.hash = "artiest/" + b.getAttribute("data-artist");
        });
      });

    scrollTop();
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

    scrollTop();
  }

  // ---- Start ----
  if (!location.hash) {
    // Zet default-hash zonder history-entry; triggert hashchange -> route().
    location.replace("#artiesten");
  }
  // Render meteen de huidige (of zojuist gezette) hash.
  route();
})();
