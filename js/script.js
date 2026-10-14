/* Annotation Survey · paper browser
   Loads the survey's coding spreadsheet, then lets readers search, filter,
   and open every paper. All state lives in the URL so views can be shared. */
(() => {
  "use strict";

  // ── Data sources ──────────────────────────────────────────────
  const SHEET_URL =
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vSDf3Uc4wp0I_O-uZ_mDCOmHAaktsU7MXdw6VpvN8im_5XDN_rmShVYhuAbJbQLj2fUBjmjmxjKmIjP/pub?gid=1840793528&single=true&output=csv";
  // Saved copy of the sheet, used only if the live sheet can't be reached
  const SNAPSHOT_URL = "data/papers.csv";

  // Research areas, in the order the survey presents them
  const AREAS = [
    { key: "Survey", short: "Survey", color: "--c-survey" },
    { key: "Empirical Study", short: "Empirical study", color: "--c-empirical" },
    { key: "Tool, Technique, and Framework", short: "Tool & technique", color: "--c-tools" },
    { key: "Storytelling and Narrative Visualizations", short: "Storytelling", color: "--c-story" },
    { key: "Collaborative Sensemaking and Data Analysis", short: "Collaboration", color: "--c-collab" },
    { key: "Exploratory Data Analysis", short: "Exploratory analysis", color: "--c-eda" },
    { key: "Provenance", short: "Provenance", color: "--c-prov" },
    { key: "Dashboard", short: "Dashboard", color: "--c-dash" },
    { key: "Uncertainty Visualization", short: "Uncertainty", color: "--c-uncert" },
    { key: "Interaction and User Engagement", short: "Interaction & engagement", color: "--c-interact" },
  ];
  const AREA = Object.fromEntries(AREAS.map((a) => [a.key, a]));
  const TYPES = ["Textual", "Graphical"];
  const GENS = ["Manual", "Semi-automatic", "Automatic"];
  const NONE = "Not specified";

  // Spelling fixes for venue names as they appear in the sheet
  const VENUE_FIX = {
    "Human Comptuer Interaction": "Human Computer Interaction",
    "Visual Communicaiton Quarterly": "Visual Communication Quarterly",
    "Computer Graphics and Application": "Computer Graphics and Applications",
  };
  const VENUE_FULL = {
    TVCG: "IEEE Transactions on Visualization and Computer Graphics",
    CHI: "ACM Conference on Human Factors in Computing Systems (CHI)",
    "CHI Extended Abstract": "Extended Abstracts of the ACM CHI Conference",
    CGF: "Computer Graphics Forum",
    VAST: "IEEE Conference on Visual Analytics Science and Technology (VAST)",
    PacificVis: "IEEE Pacific Visualization Symposium (PacificVis)",
    UIST: "ACM Symposium on User Interface Software and Technology (UIST)",
    "Computer Graphics and Applications": "IEEE Computer Graphics and Applications",
  };


  // ── Elements ──────────────────────────────────────────────────
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const els = {
    search: $("#search"),
    sort: $("#sort"),
    cards: $("#cards"),
    count: $("#count"),
    chips: $("#chips"),
    empty: $("#empty"),
    filters: $("#filters"),
    filtersBody: $("#filters-body"),
    filtersOpen: $("#filters-open"),
    filtersOpenN: $("#filters-open-n"),
    filtersDone: $("#filters-done"),
    scrim: $("#filters-scrim"),
    yearFrom: $("#year-from"),
    yearTo: $("#year-to"),
    yearsReset: $("#years-reset"),
    svg: $("#timeline-svg"),
    detail: $("#detail"),
    detailBody: $("#detail-body"),
    detailPos: $("#detail-pos"),
    detailPrev: $("#detail-prev"),
    detailNext: $("#detail-next"),
    toast: $("#toast"),
    status: $(".status"),
  };

  // ── State ─────────────────────────────────────────────────────
  const FACETS = ["cats", "types", "gen", "venues"];
  const PARAM = { cats: "area", types: "type", gen: "gen", venues: "venue" };
  const state = {
    q: "",
    cats: new Set(),
    types: new Set(),
    gen: new Set(),
    venues: new Set(),
    y0: null,
    y1: null,
    sort: "newest",
    view: "grid",
  };
  let records = [];
  let results = [];
  let minYear = 0;
  let maxYear = 0;
  let terms = [];
  let termRe = null;
  let venuesExpanded = false;
  let detailId = null;
  let detailPushed = false;
  const cardEls = new Map();
  const optValues = { cats: [], types: [], gen: [], venues: [] };
  const optTotals = { cats: {}, types: {}, gen: {}, venues: {} };
  const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ── Helpers ───────────────────────────────────────────────────
  const clean = (s) => (s == null ? "" : String(s)).replace(/\s+/g, " ").trim();

  // The sheet keeps some names in BibTeX form, e.g. D{\"o}rk or Hornb{\ae}k
  const LATEX_ACCENT = {
    "'": "\u0301", "`": "\u0300", "^": "\u0302", '"': "\u0308", "~": "\u0303", "=": "\u0304",
    ".": "\u0307", u: "\u0306", v: "\u030C", H: "\u030B", c: "\u0327", k: "\u0328", r: "\u030A",
  };
  const LATEX_LETTER = {
    ae: "æ", AE: "Æ", oe: "œ", OE: "Œ", aa: "å", AA: "Å", ss: "ß", o: "ø", O: "Ø", l: "ł", L: "Ł", i: "ı", j: "ȷ",
  };
  function delatex(s) {
    if (!s.includes("\\")) return s;
    return s
      .replace(/\\(ae|AE|oe|OE|aa|AA|ss|o|O|l|L|i|j)(?![a-zA-Z])\s?/g, (m, c) => LATEX_LETTER[c])
      .replace(/\\([`'^"~=.uvHckr])\s*\{?\s*([A-Za-zıȷ])\s*\}?/g, (m, a, c) =>
        (c === "ı" ? "i" : c === "ȷ" ? "j" : c) + LATEX_ACCENT[a],
      )
      .replace(/\\&/g, "&")
      .replace(/[{}]/g, "")
      .normalize("NFC");
  }
  const blank = (s) => /^[-–—]?$/.test(clean(s));
  const fold = (s) =>
    String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
    );
  const capture = (el, e) => {
    try {
      el.setPointerCapture(e.pointerId);
    } catch (err) {}
  };
  const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

  // Escape text and wrap search terms in <mark>, ignoring accents like the search does
  function hl(text) {
    const chars = Array.from(String(text || ""));
    if (!termRe) return esc(chars.join(""));
    const folded = chars.map((c) => fold(c)[0] || c).join("");
    let out = "";
    let last = 0;
    termRe.lastIndex = 0;
    for (const m of folded.matchAll(termRe)) {
      out += esc(chars.slice(last, m.index).join(""));
      out += `<mark>${esc(chars.slice(m.index, m.index + m[0].length).join(""))}</mark>`;
      last = m.index + m[0].length;
    }
    return out + esc(chars.slice(last).join(""));
  }

  function setTerms(q) {
    terms = fold(q).split(/\s+/).filter(Boolean);
    termRe = terms.length
      ? new RegExp(
          `(${terms
            .slice()
            .sort((a, b) => b.length - a.length)
            .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
            .join("|")})`,
          "gi",
        )
      : null;
  }

  function listPhrase(items) {
    if (items.length < 2) return items.join("");
    if (items.length === 2) return `${items[0]} and ${items[1]}`;
    return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
  }

  // ── Parsing ───────────────────────────────────────────────────
  function parseGen(raw) {
    const out = new Set();
    clean(raw)
      .split(/\s*,\s*(?:and\s+)?|\s+and\s+/i)
      .forEach((tok) => {
        const t = tok.trim().toLowerCase();
        if (t === "manual") out.add("Manual");
        else if (t === "semi-automatic" || t === "semi automatic") out.add("Semi-automatic");
        else if (t === "automatic") out.add("Automatic");
      });
    return GENS.filter((g) => out.has(g));
  }

  function toRecord(row, i) {
    // drop a stray trailing period; keep ? and !
    const title = delatex(clean(row["Title"])).replace(/\.+$/, "");
    const venueRaw = clean(row["Venue"]);
    const venue = VENUE_FIX[venueRaw] || venueRaw;
    const year = parseInt(row["Year"], 10);
    const t = clean(row["Annotation Types"]).toLowerCase();
    const types = TYPES.filter((x) => t.includes(x.toLowerCase()));
    const gen = parseGen(row["Annotation Generation Method"]);
    const areas = AREAS.filter((a) => clean(row[a.key]).toUpperCase() === "X").map((a) => a.key);
    const doi = clean(row["DOI"]).replace(/^https?:\/\/(dx\.)?doi\.org\//i, "");
    const subcats = blank(row["Annotation Subcategories"]) ? "" : clean(row["Annotation Subcategories"]);
    const authors = delatex(clean(row["Authors"]));
    const abstract = delatex(clean(row["Abstract"]));
    const id = clean(row["Paper Identifier"]) || `paper-${i}`;
    return {
      id,
      title,
      authors,
      venue,
      year: Number.isFinite(year) ? year : null,
      doi,
      bibtex: String(row["BibTex"] || "").trim(),
      abstract,
      subcats,
      types,
      gen,
      areas,
      f: {
        cats: areas,
        types: types.length ? types : [NONE],
        gen: gen.length ? gen : [NONE],
        venues: venue ? [venue] : [NONE],
      },
      search: fold([title, authors, venue, venueRaw, abstract, doi, subcats, year].join(" ")),
    };
  }

  // ── Loading ───────────────────────────────────────────────────
  async function fetchText(url, ms) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    try {
      const res = await fetch(url, { signal: ctrl.signal, cache: "no-cache" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } finally {
      clearTimeout(timer);
    }
  }

  function parseCSV(text) {
    const parsed = Papa.parse(text, { header: true, skipEmptyLines: "greedy" });
    const rows = parsed.data.filter((r) => clean(r["Title"]));
    if (!rows.length || !("Year" in rows[0])) throw new Error("Unexpected sheet format");
    return rows;
  }

  async function load() {
    let rows;
    try {
      rows = parseCSV(await fetchText(SHEET_URL, 9000));
    } catch (err) {
      try {
        rows = parseCSV(await fetchText(SNAPSHOT_URL, 15000));
      } catch (err2) {
        els.count.textContent = "The paper list could not be loaded. Please refresh the page.";
        return;
      }
    }

    records = rows.map(toRecord);
    const years = records.map((r) => r.year).filter((y) => y != null);
    minYear = Math.min(...years);
    maxYear = Math.max(...years);

    buildFacets();
    buildYearSelects();
    fillStats();
    fillPlaceholder();
    matchMedia("(max-width: 560px)").addEventListener("change", fillPlaceholder);
    // read the paper before the first render rewrites the URL
    const paper = new URLSearchParams(location.search).get("paper");
    readURL();
    buildTimeline();
    update({ first: true });
    if (paper) openDetail(paper, { push: false });

    if ("ResizeObserver" in window) {
      let w = els.svg.clientWidth;
      new ResizeObserver(() => {
        if (Math.abs(els.svg.clientWidth - w) > 1) {
          w = els.svg.clientWidth;
          buildTimeline();
          drawTimeline();
        }
      }).observe(els.svg);
    }
  }

  // ── Masthead figures ──────────────────────────────────────────
  // a placeholder that fits the screen, with the real count
  function fillPlaceholder() {
    const short = matchMedia("(max-width: 560px)").matches;
    els.search.placeholder = short
      ? `Search ${records.length} papers`
      : `Search ${records.length} papers by title, author, abstract, or venue`;
  }

  function fillStats() {
    const venues = new Set(records.map((r) => r.venue).filter(Boolean));
    const areas = AREAS.filter((a) => records.some((r) => r.areas.includes(a.key)));
    const set = (k, v) => $$(`[data-stat="${k}"]`).forEach((el) => (el.textContent = v));
    set("papers", records.length);
    set("years", `${minYear}–${maxYear}`);
    set("venues", venues.size);
    set("areas", areas.length);
  }


  // ── Facets ────────────────────────────────────────────────────
  function buildFacets() {
    const count = (facet) => {
      const m = new Map();
      records.forEach((r) => r.f[facet].forEach((v) => m.set(v, (m.get(v) || 0) + 1)));
      return m;
    };
    const has = (facet, v) => records.some((r) => r.f[facet].includes(v));

    optValues.cats = AREAS.map((a) => a.key).filter((k) => has("cats", k));
    optValues.types = [...TYPES, NONE].filter((v) => has("types", v));
    optValues.gen = [...GENS, NONE].filter((v) => has("gen", v));
    const vc = count("venues");
    optValues.venues = [...vc.keys()].sort((a, b) => vc.get(b) - vc.get(a) || a.localeCompare(b));
    FACETS.forEach((facet) => {
      const m = count(facet);
      optValues[facet].forEach((v) => (optTotals[facet][v] = m.get(v) || 0));
    });

    FACETS.forEach((facet) => {
      const box = $(`.facet[data-facet="${facet}"] .facet__opts`);
      box.innerHTML = optValues[facet]
        .map((v) => {
          const c = facet === "cats" ? ` style="--opt-c: var(${AREA[v].color})"` : "";
          const title = facet === "venues" && VENUE_FULL[v] ? ` title="${esc(VENUE_FULL[v])}"` : "";
          return `<label class="opt"${c}${title} data-value="${esc(v)}">
            <input type="checkbox" value="${esc(v)}" />
            <span class="opt__box" aria-hidden="true"></span>
            <span class="opt__name">${esc(v)}</span>
            <span class="opt__n"></span>
            <span class="opt__bar" aria-hidden="true"><i class="t"></i><i class="n"></i></span>
          </label>`;
        })
        .join("");
    });

    els.filtersBody.addEventListener("change", (e) => {
      const input = e.target.closest(".opt input");
      if (!input) return;
      const facet = input.closest(".facet").dataset.facet;
      input.checked ? state[facet].add(input.value) : state[facet].delete(input.value);
      update({ scroll: true });
    });

    const more = $('.facet[data-facet="venues"] .facet__more');
    more.addEventListener("click", () => {
      venuesExpanded = !venuesExpanded;
      syncControls();
    });
  }

  function buildYearSelects() {
    const opts = [];
    for (let y = minYear; y <= maxYear; y++) opts.push(`<option value="${y}">${y}</option>`);
    els.yearFrom.innerHTML = opts.join("");
    els.yearTo.innerHTML = opts.join("");
    const onChange = () => {
      let a = +els.yearFrom.value;
      let b = +els.yearTo.value;
      if (a > b) [a, b] = [b, a];
      setYears(a, b);
    };
    els.yearFrom.addEventListener("change", onChange);
    els.yearTo.addEventListener("change", onChange);
  }

  function setYears(a, b) {
    state.y0 = a <= minYear ? null : a;
    state.y1 = b >= maxYear ? null : b;
    update({ scroll: true });
  }

  const lo = () => state.y0 ?? minYear;
  const hi = () => state.y1 ?? maxYear;
  const yearsActive = () => state.y0 != null || state.y1 != null;

  // ── Filtering ─────────────────────────────────────────────────
  function matches(r, except, also) {
    for (const t of terms) if (!r.search.includes(t)) return false;
    for (const facet of FACETS) {
      if (facet === except || facet === also || !state[facet].size) continue;
      if (!r.f[facet].some((v) => state[facet].has(v))) return false;
    }
    if (except !== "years" && also !== "years" && yearsActive()) {
      if (r.year == null || r.year < lo() || r.year > hi()) return false;
    }
    return true;
  }

  const SORTS = {
    newest: (a, b) => (b.year || 0) - (a.year || 0) || a.title.localeCompare(b.title),
    oldest: (a, b) => (a.year || 9999) - (b.year || 9999) || a.title.localeCompare(b.title),
    title: (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
    venue: (a, b) => a.venue.localeCompare(b.venue) || (b.year || 0) - (a.year || 0),
  };

  function activeCount() {
    return FACETS.reduce((n, f) => n + state[f].size, 0) + (yearsActive() ? 1 : 0);
  }

  function update({ first = false, scroll = false, typing = false } = {}) {
    results = records.filter((r) => matches(r)).sort(SORTS[state.sort] || SORTS.newest);
    syncControls();
    renderCards(first, typing);
    renderStatus();
    drawTimeline();
    writeURL();
    if (scroll) scrollToResults();
  }

  function scrollToResults() {
    const top = els.status.getBoundingClientRect().top;
    const toolbarH = $("#toolbar").offsetHeight;
    if (top < toolbarH) {
      window.scrollTo({
        top: window.scrollY + top - toolbarH - 16,
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      });
    }
  }

  // Facet counts: how many papers each option would show, given every other filter
  function syncControls() {
    FACETS.forEach((facet) => {
      const pool = records.filter((r) => matches(r, facet));
      const counts = new Map();
      pool.forEach((r) => r.f[facet].forEach((v) => counts.set(v, (counts.get(v) || 0) + 1)));
      const box = $(`.facet[data-facet="${facet}"]`);
      const max = Math.max(1, ...Object.values(optTotals[facet]));
      $$(".opt", box).forEach((opt, i) => {
        const v = optValues[facet][i];
        const n = counts.get(v) || 0;
        const input = $("input", opt);
        input.checked = state[facet].has(v);
        $(".opt__n", opt).textContent = n;
        $(".opt__bar .t", opt).style.width = `${(optTotals[facet][v] / max) * 100}%`;
        $(".opt__bar .n", opt).style.width = `${(n / max) * 100}%`;
        opt.classList.toggle("is-zero", n === 0 && !input.checked);
        if (facet === "venues") opt.hidden = !venuesExpanded && i >= 6 && !input.checked;
      });
      if (facet === "venues") {
        const more = $(".facet__more", box);
        more.hidden = optValues.venues.length <= 6;
        more.textContent = venuesExpanded ? "Show fewer" : `Show all ${optValues.venues.length} venues`;
      }
    });

    els.yearFrom.value = lo();
    els.yearTo.value = hi();
    els.yearsReset.hidden = !yearsActive();
    els.sort.value = state.sort;
    $$("#sort-pills input").forEach((i) => (i.checked = i.value === state.sort));
    if (els.search.value !== state.q) els.search.value = state.q;

    const n = activeCount();
    els.filtersOpenN.hidden = n === 0;
    els.filtersOpenN.textContent = n;
    els.filtersDone.textContent = results.length ? `Show ${plural(results.length, "paper")}` : "No papers match";
    $$("[data-view]", $(".seg")).forEach((b) => b.setAttribute("aria-pressed", b.dataset.view === state.view));
    els.cards.dataset.view = state.view;
  }

  // ── Cards ─────────────────────────────────────────────────────
  function catsHTML(r) {
    if (!r.areas.length) return "";
    return `<ul class="cats">${r.areas
      .map((k) => `<li style="--cat-c: var(${AREA[k].color})"><i aria-hidden="true"></i>${esc(AREA[k].short)}</li>`)
      .join("")}</ul>`;
  }

  function thumbHTML(r, cls) {
    const id = encodeURIComponent(r.id);
    return `<div class="sheet ${cls}">
      <img src="thumbs/${id}.webp" data-fallback="thumbnails/${id}.png" alt="" width="612" height="560" loading="lazy" decoding="async" />
    </div>`;
  }

  function wireThumb(img, r) {
    const done = () => img.classList.add("is-loaded");
    img.addEventListener("load", done);
    img.addEventListener("error", () => {
      if (img.dataset.fallback) {
        img.src = img.dataset.fallback;
        delete img.dataset.fallback;
      } else {
        const cover = document.createElement("div");
        cover.className = "cover";
        cover.innerHTML = `<b>${esc(r.title)}</b><span>${esc(r.venue)}${r.year ? ` · ${r.year}` : ""}</span>`;
        img.replaceWith(cover);
      }
    });
    if (img.complete && img.naturalWidth) done();
  }

  function cardBody(r) {
    return `<h3 class="card__title"><a class="card__link" href="?paper=${encodeURIComponent(r.id)}" data-id="${esc(r.id)}">${hl(r.title)}</a></h3>
      <p class="card__authors">${hl(r.authors)}</p>`;
  }

  function makeCard(r) {
    const el = document.createElement("article");
    el.className = "card";
    el.dataset.id = r.id;
    el.innerHTML = `${thumbHTML(r, "card__sheet")}
      <div class="card__meta"><span class="year">${r.year ?? ""}</span><span class="sep" aria-hidden="true">·</span><span class="venue" title="${esc(VENUE_FULL[r.venue] || r.venue)}">${esc(r.venue)}</span></div>
      <div class="card__body">${cardBody(r)}</div>
      ${catsHTML(r)}`;
    // flatten the body wrapper so grid/list layouts see title and authors directly
    const body = $(".card__body", el);
    body.replaceWith(...body.childNodes);
    wireThumb($("img", el), r);
    return el;
  }

  const inView = (rect, margin = 120) => rect.bottom > -margin && rect.top < innerHeight + margin;

  let lastQ = "";
  function renderCards(first) {
    const qChanged = lastQ !== state.q;
    lastQ = state.q;
    // remember where visible cards were, so they can glide to their new places
    const animate = !first && !reduceMotion();
    const before = new Map();
    if (animate) {
      for (const el of els.cards.children) {
        const rect = el.getBoundingClientRect();
        if (inView(rect)) before.set(el, rect);
      }
    }
    const frag = document.createDocumentFragment();
    results.forEach((r, i) => {
      let el = cardEls.get(r.id);
      if (!el) {
        el = makeCard(r);
        cardEls.set(r.id, el);
      } else if (qChanged) {
        $(".card__link", el).innerHTML = hl(r.title);
        $(".card__authors", el).innerHTML = hl(r.authors);
      }
      if (first) {
        el.classList.add("is-new");
        el.style.setProperty("--i", i);
      }
      frag.appendChild(el);
    });
    els.cards.replaceChildren(frag);
    els.cards.removeAttribute("aria-busy");
    els.empty.hidden = results.length > 0;
    if (animate) {
      let k = 0;
      for (const el of els.cards.children) {
        const rect = el.getBoundingClientRect();
        if (!inView(rect)) continue;
        const was = before.get(el);
        if (was) {
          const dx = was.left - rect.left;
          const dy = was.top - rect.top;
          if (dx || dy) {
            el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], {
              duration: 480,
              easing: "cubic-bezier(0.2, 0.7, 0.2, 1)",
            });
          }
        } else {
          el.animate(
            [
              { opacity: 0, transform: "translateY(10px) scale(0.985)" },
              { opacity: 1, transform: "none" },
            ],
            { duration: 420, delay: Math.min(k++ * 22, 260), easing: "cubic-bezier(0.16, 1, 0.3, 1)", fill: "backwards" },
          );
        }
      }
    }
    if (first) setTimeout(() => cardEls.forEach((el) => el.classList.remove("is-new")), 1200);
  }

  // ── Status line and chips ─────────────────────────────────────
  function renderStatus() {
    const total = records.length;
    const n = results.length;
    els.count.innerHTML =
      n === total
        ? `<strong>${total}</strong> papers`
        : `<strong>${n}</strong> of ${total} papers`;

    const chips = [];
    const chip = (label, action, color) =>
      chips.push(
        `<button type="button" class="chip" data-action="${esc(action)}" aria-label="Remove filter: ${esc(label)}"${color ? ` style="--chip-c: var(${color})"` : ""}>${color ? '<i aria-hidden="true"></i>' : ""}${esc(label)}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17"/></svg></button>`,
      );
    if (state.q) chip(`“${state.q}”`, "q");
    state.cats.forEach((v) => chip(AREA[v].short, `cats|${v}`, AREA[v].color));
    state.types.forEach((v) => chip(v === NONE ? "Type not specified" : `${v} annotations`, `types|${v}`));
    state.gen.forEach((v) => chip(v === NONE ? "Generation not specified" : `${v} generation`, `gen|${v}`));
    state.venues.forEach((v) => chip(v, `venues|${v}`));
    if (yearsActive()) chip(lo() === hi() ? `${lo()}` : `${lo()}–${hi()}`, "years");
    if (chips.length > 1) chips.push(`<button type="button" class="chip chip--clear" data-clear>Clear all</button>`);
    els.chips.innerHTML = chips.join("");
  }

  els.chips.addEventListener("click", (e) => {
    const b = e.target.closest(".chip[data-action]");
    if (!b) return;
    const [facet, value] = b.dataset.action.split(/\|(.*)/s);
    if (facet === "q") state.q = "";
    else if (facet === "years") state.y0 = state.y1 = null;
    else state[facet].delete(value);
    if (facet === "q") setTerms("");
    update();
  });

  function clearAll() {
    state.q = "";
    setTerms("");
    FACETS.forEach((f) => state[f].clear());
    state.y0 = state.y1 = null;
    update({ scroll: true });
  }
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-clear]")) clearAll();
  });

  // ── Timeline ──────────────────────────────────────────────────
  const tl = { bars: [], w: 0, h: 0, padT: 22, padB: 20, step: 0, brush: null, tip: null };

  function buildTimeline() {
    const svg = els.svg;
    const w = svg.clientWidth || 600;
    const h = svg.clientHeight || 92;
    const n = maxYear - minYear + 1;
    tl.w = w;
    tl.h = h;
    tl.step = w / n;
    const bw = Math.max(2, Math.min(tl.step * 0.74, 26));
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);

    const every = tl.step < 9 ? 10 : 5;
    let html = `<line class="axis" x1="0" x2="${w}" y1="${h - tl.padB + 0.5}" y2="${h - tl.padB + 0.5}"/>`;
    html += `<rect class="brush" y="${tl.padT - 4}" height="${h - tl.padB - tl.padT + 4}" x="0" width="0" visibility="hidden"/>`;
    for (let i = 0; i < n; i++) {
      const y = minYear + i;
      const x = i * tl.step + (tl.step - bw) / 2;
      html += `<g data-i="${i}"><rect class="bar-ghost" x="${x}" width="${bw}" y="${h - tl.padB}" height="0"/><rect class="bar-on" x="${x}" width="${bw}" y="${h - tl.padB}" height="0"/><rect class="bar-preview" x="${x}" width="${bw}" y="${h - tl.padB}" height="0"/></g>`;
      const edge = i === 0 || i === n - 1;
      const gap = Math.ceil(40 / tl.step);
      const near = (y - minYear < gap && i !== 0) || (maxYear - y < gap && i !== n - 1);
      if (edge || (y % every === 0 && !near)) {
        const anchor = i === 0 ? "start" : i === n - 1 ? "end" : "middle";
        const tx = i === 0 ? x : i === n - 1 ? x + bw : x + bw / 2;
        html += `<text x="${tx}" y="${h - 4}" text-anchor="${anchor}">${y}</text>`;
      }
    }
    html += `<g class="tip" visibility="hidden"><rect class="tip-bg" rx="4" height="20"/><text class="tip-text" y="0"></text></g>`;
    svg.innerHTML = html;
    tl.bars = $$("g[data-i]", svg).map((g) => ({ g, ghost: g.children[0], on: g.children[1], pre: g.children[2] }));
    tl.brush = $(".brush", svg);
    tl.tip = $(".tip", svg);
  }

  function setRect(el, y, height) {
    el.setAttribute("y", y);
    el.setAttribute("height", height);
    el.style.y = `${y}px`;
    el.style.height = `${height}px`;
  }

  let tlCounts = [];
  function drawTimeline() {
    if (!tl.bars.length) return;
    const n = maxYear - minYear + 1;
    tlCounts = new Array(n).fill(0);
    records.forEach((r) => {
      if (r.year != null && matches(r, "years")) tlCounts[r.year - minYear]++;
    });
    const pre = tl.preview ? tl.preview.counts : null;
    const max = Math.max(1, ...tlCounts, ...(pre || []));
    const base = tl.h - tl.padB;
    const avail = base - tl.padT;
    const height = (c) => (c ? Math.max(2, (c / max) * avail) : 0);
    tl.bars.forEach((b, i) => {
      const bh = height(tlCounts[i]);
      const yr = minYear + i;
      const inRange = yr >= lo() && yr <= hi();
      setRect(b.ghost, base - bh, bh);
      setRect(b.on, inRange ? base - bh : base, inRange ? bh : 0);
      const ph = pre ? height(pre[i]) : 0;
      setRect(b.pre, base - ph, ph);
    });
    const inSel = tlCounts.reduce((s, c, i) => s + (minYear + i >= lo() && minYear + i <= hi() ? c : 0), 0);
    els.svg.setAttribute(
      "aria-label",
      `Papers per year from ${minYear} to ${maxYear}. ${yearsActive() ? `Selected ${lo()} to ${hi()}, ${plural(inSel, "paper")}.` : ""}`,
    );
  }

  // Hovering a filter option shows where its papers fall in time
  const tlLabel = $("#timeline-label");
  function previewTimeline(facet, value) {
    if (!facet) {
      if (!tl.preview) return;
      tl.preview = null;
      els.svg.classList.remove("is-previewing");
      tlLabel.textContent = "Papers per year";
      tlLabel.classList.remove("is-preview");
      drawTimeline();
      return;
    }
    const n = maxYear - minYear + 1;
    const counts = new Array(n).fill(0);
    let inRange = 0;
    records.forEach((r) => {
      if (r.year == null || !r.f[facet].includes(value) || !matches(r, "years", facet)) return;
      counts[r.year - minYear]++;
      if (r.year >= lo() && r.year <= hi()) inRange++;
    });
    tl.preview = { counts };
    els.svg.style.setProperty("--preview-c", facet === "cats" ? `var(${AREA[value].color})` : "var(--accent)");
    els.svg.classList.add("is-previewing");
    const name = facet === "cats" ? AREA[value].short : value;
    tlLabel.textContent = `${name} · ${plural(inRange, "paper")}`;
    tlLabel.classList.add("is-preview");
    drawTimeline();
  }

  // Hovering a paper marks its year
  function markYear(year) {
    tl.bars.forEach((b, i) => b.g.classList.toggle("is-mark", year != null && minYear + i === year));
  }

  function showTip(i) {
    if (i == null) {
      tl.tip.setAttribute("visibility", "hidden");
      tl.bars.forEach((b) => b.g.classList.remove("is-hover"));
      return;
    }
    tl.bars.forEach((b, j) => b.g.classList.toggle("is-hover", j === i));
    const text = $("text", tl.tip);
    text.textContent = `${minYear + i} · ${plural(tlCounts[i] || 0, "paper")}`;
    const tw = text.getComputedTextLength() + 16;
    const cx = i * tl.step + tl.step / 2;
    const x = Math.max(0, Math.min(tl.w - tw, cx - tw / 2));
    const bar = tl.bars[i].ghost;
    const top = Math.max(0, parseFloat(bar.getAttribute("y")) - 26);
    $("rect", tl.tip).setAttribute("x", x);
    $("rect", tl.tip).setAttribute("y", top);
    $("rect", tl.tip).setAttribute("width", tw);
    text.setAttribute("x", x + 8);
    text.setAttribute("y", top + 14);
    tl.tip.setAttribute("visibility", "visible");
  }

  (function wireTimeline() {
    const svg = els.svg;
    let start = null;
    let startX = 0;
    let dragging = false;
    const idxAt = (e) => {
      const rect = svg.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * tl.w;
      return Math.max(0, Math.min(maxYear - minYear, Math.floor(x / tl.step)));
    };
    const showBrush = (a, b) => {
      const [i, j] = a < b ? [a, b] : [b, a];
      tl.brush.setAttribute("x", i * tl.step);
      tl.brush.setAttribute("width", (j - i + 1) * tl.step);
      tl.brush.setAttribute("visibility", "visible");
    };
    svg.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      start = idxAt(e);
      startX = e.clientX;
      dragging = false;
      capture(svg, e);
    });
    svg.addEventListener("pointermove", (e) => {
      const i = idxAt(e);
      if (start != null) {
        if (!dragging && Math.abs(e.clientX - startX) > 4) dragging = true;
        if (dragging) showBrush(start, i);
      }
      if (e.pointerType === "mouse" || start != null) showTip(i);
    });
    const end = (e) => {
      if (start == null) return;
      const i = idxAt(e);
      tl.brush.setAttribute("visibility", "hidden");
      if (dragging) {
        const [a, b] = start < i ? [start, i] : [i, start];
        setYears(minYear + a, minYear + b);
      } else {
        const y = minYear + i;
        if (lo() === y && hi() === y) setYears(minYear, maxYear);
        else setYears(y, y);
      }
      start = null;
      dragging = false;
      if (e.pointerType !== "mouse") showTip(null);
    };
    svg.addEventListener("pointerup", end);
    svg.addEventListener("pointercancel", () => {
      start = null;
      dragging = false;
      tl.brush.setAttribute("visibility", "hidden");
      showTip(null);
    });
    svg.addEventListener("pointerleave", () => {
      if (start == null) showTip(null);
    });
    els.yearsReset.addEventListener("click", () => setYears(minYear, maxYear));
  })();

  (function wireLinking() {
    let current = null;
    els.filtersBody.addEventListener("pointerover", (e) => {
      if (e.pointerType !== "mouse") return;
      const opt = e.target.closest(".opt");
      if (opt === current) return;
      current = opt;
      if (!opt) return previewTimeline(null);
      previewTimeline(opt.closest(".facet").dataset.facet, opt.dataset.value);
    });
    els.filtersBody.addEventListener("pointerleave", () => {
      current = null;
      previewTimeline(null);
    });
    els.filtersBody.addEventListener("change", () => {
      if (current) previewTimeline(current.closest(".facet").dataset.facet, current.dataset.value);
    });

    let hovered = null;
    els.cards.addEventListener("pointerover", (e) => {
      if (e.pointerType !== "mouse") return;
      const card = e.target.closest(".card[data-id]");
      if (card === hovered) return;
      hovered = card;
      const r = card && records.find((x) => x.id === card.dataset.id);
      markYear(r ? r.year : null);
    });
    els.cards.addEventListener("pointerleave", () => {
      hovered = null;
      markYear(null);
    });
  })();

  // ── URL state ─────────────────────────────────────────────────
  function readURL() {
    const p = new URLSearchParams(location.search);
    state.q = p.get("q") || "";
    setTerms(state.q);
    FACETS.forEach((f) => {
      state[f] = new Set(p.getAll(PARAM[f]).filter((v) => optValues[f].includes(v)));
    });
    const from = parseInt(p.get("from"), 10);
    const to = parseInt(p.get("to"), 10);
    state.y0 = from > minYear && from <= maxYear ? from : null;
    state.y1 = to < maxYear && to >= minYear ? to : null;
    if (state.y0 != null && state.y1 != null && state.y0 > state.y1) [state.y0, state.y1] = [state.y1, state.y0];
    if (SORTS[p.get("sort")]) state.sort = p.get("sort");
  }

  function paramsFor(paper) {
    const p = new URLSearchParams();
    if (state.q) p.set("q", state.q);
    FACETS.forEach((f) => state[f].forEach((v) => p.append(PARAM[f], v)));
    if (state.y0 != null) p.set("from", state.y0);
    if (state.y1 != null) p.set("to", state.y1);
    if (state.sort !== "newest") p.set("sort", state.sort);
    if (paper) p.set("paper", paper);
    const s = p.toString();
    return `${location.pathname}${s ? `?${s}` : ""}${location.hash}`;
  }

  function writeURL() {
    history.replaceState(history.state, "", paramsFor(detailId));
  }

  // opening and closing a paper adds history entries; the page itself should not jump
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";

  window.addEventListener("popstate", () => {
    const paper = new URLSearchParams(location.search).get("paper");
    detailPushed = false;
    if (paper) openDetail(paper, { push: false });
    else if (els.detail.open) {
      els.detail.close();
      finishClose();
    }
  });

  // ── Detail sheet ──────────────────────────────────────────────
  function navList() {
    return results.some((r) => r.id === detailId) ? results : [...records].sort(SORTS[state.sort]);
  }

  let openedFrom = null;
  let skipReturn = false;
  function openDetail(id, { push = true } = {}) {
    const r = records.find((x) => x.id === id);
    if (!r) return;
    const wasOpen = els.detail.open;
    detailId = id;
    renderDetail(r, wasOpen);
    if (push && !wasOpen) {
      history.pushState({ paper: id }, "", paramsFor(id));
      detailPushed = true;
    } else {
      writeURL();
    }
    if (!wasOpen) {
      openedFrom = id;
      els.detail.showModal();
      document.documentElement.classList.add("has-modal");
      els.detailBody.scrollTop = 0;
      $("#detail-close").focus({ preventScroll: true });
    }
  }

  // Closing an entry we pushed goes back in history; popstate then closes the dialog
  function closeDetail() {
    if (!els.detail.open) return;
    if (detailPushed) history.back();
    else {
      els.detail.close();
      finishClose();
    }
  }

  // Runs once per close, whichever path closed the dialog
  function finishClose() {
    if (!detailId) return;
    document.documentElement.classList.remove("has-modal");
    const id = detailId;
    detailId = null;
    detailPushed = false;
    writeURL();
    if (skipReturn) return void (skipReturn = false);
    const card = cardEls.get(id);
    if (!card || !card.isConnected) return;
    const rect = card.getBoundingClientRect();
    const hidden = rect.top < $("#toolbar").offsetHeight || rect.bottom > innerHeight;
    if (hidden) card.scrollIntoView({ block: "center" });
    $(".card__link", card).focus({ preventScroll: true });
    // mark where the reader is, if they browsed away from where they started
    if (hidden || id !== openedFrom) {
      card.classList.remove("is-flash");
      void card.offsetWidth;
      card.classList.add("is-flash");
      setTimeout(() => card.classList.remove("is-flash"), 2100);
    }
  }
  els.detail.addEventListener("close", finishClose);

  function factRow(term, value) {
    return value ? `<dt>${term}</dt><dd>${value}</dd>` : "";
  }

  function renderDetail(r, swap) {
    const list = navList();
    const i = list.findIndex((x) => x.id === r.id);
    els.detailPos.textContent = i >= 0 ? `${i + 1} of ${list.length}` : "";
    els.detailPrev.disabled = i <= 0;
    els.detailNext.disabled = i < 0 || i >= list.length - 1;

    const venueFull = VENUE_FULL[r.venue];
    const typeText = r.types.length ? listPhrase(r.types) : NONE;
    const genText = r.gen.length ? listPhrase(r.gen.map((g, k) => (k ? g.toLowerCase() : g))) : NONE;
    const areas = r.areas.length
      ? `<ul class="cats">${r.areas
          .map(
            (k) =>
              `<li><button type="button" data-area="${esc(k)}" style="--cat-c: var(${AREA[k].color})" title="Show all papers in this area"><i class="dot" aria-hidden="true"></i>${esc(k)}</button></li>`,
          )
          .join("")}</ul>`
      : "";
    const doiLink = r.doi
      ? `<a class="u" href="https://doi.org/${encodeURI(r.doi)}" target="_blank" rel="noopener">${esc(r.doi)}</a>`
      : "";

    els.detailBody.innerHTML = `
      ${thumbHTML(r, "detail__sheet")}
      <p class="detail__meta"><span class="year">${r.year ?? ""}</span><span class="sep" aria-hidden="true">·</span>${esc(r.venue)}</p>
      <h2 id="detail-title">${hl(r.title)}</h2>
      <p class="detail__authors">${hl(r.authors)}</p>
      ${venueFull ? `<p class="detail__venue">${esc(venueFull)}</p>` : ""}
      <div class="detail__actions">
        ${r.doi ? `<a class="btn btn--solid btn--small" href="https://doi.org/${encodeURI(r.doi)}" target="_blank" rel="noopener">Open paper<span aria-hidden="true">↗</span></a>` : ""}
        ${r.bibtex ? `<button class="btn btn--small" type="button" data-copy-bib>Copy BibTeX</button><button class="btn btn--small btn--ghost" type="button" data-dl-bib>Download .bib</button>` : ""}
      </div>
      <dl class="facts">
        ${factRow("Annotation type", esc(typeText))}
        ${factRow("Generation method", esc(genText))}
        ${factRow("Annotation forms", r.subcats ? esc(r.subcats) : "")}
        ${factRow("Research areas", areas)}
        ${factRow("DOI", doiLink)}
      </dl>
      ${r.abstract ? `<section class="detail__section"><h3 class="label">Abstract</h3><p class="abstract">${hl(r.abstract)}</p></section>` : ""}
      ${r.bibtex ? `<details><summary>BibTeX</summary><pre>${esc(r.bibtex)}</pre></details>` : ""}`;

    wireThumb($("img", els.detailBody), r);
    if (swap) {
      els.detailBody.classList.remove("is-swap");
      void els.detailBody.offsetWidth;
      els.detailBody.classList.add("is-swap");
      els.detailBody.scrollTop = 0;
    }
  }

  function step(dir) {
    if (!els.detail.open || !detailId) return;
    const list = navList();
    const i = list.findIndex((x) => x.id === detailId);
    const next = list[i + dir];
    if (next) openDetail(next.id, { push: false });
  }

  els.detailPrev.addEventListener("click", () => step(-1));
  els.detailNext.addEventListener("click", () => step(1));
  $("#detail-close").addEventListener("click", closeDetail);
  $("#detail-link").addEventListener("click", () => copy(location.href, "Link copied"));
  els.detail.addEventListener("click", (e) => {
    if (e.target === els.detail) closeDetail();
  });
  els.detail.addEventListener("cancel", (e) => {
    e.preventDefault();
    closeDetail();
  });
  els.detail.addEventListener("keydown", (e) => {
    if (e.target.closest("input, textarea, select")) return;
    if (e.key === "ArrowLeft") step(-1);
    if (e.key === "ArrowRight") step(1);
  });
  els.detailBody.addEventListener("click", (e) => {
    const r = records.find((x) => x.id === detailId);
    if (!r) return;
    if (e.target.closest("[data-copy-bib]")) copy(r.bibtex, "BibTeX copied");
    if (e.target.closest("[data-dl-bib]")) download(`${r.id}.bib`, `${r.bibtex}\n`, "application/x-bibtex");
    const area = e.target.closest("[data-area]");
    if (area) {
      FACETS.forEach((f) => state[f].clear());
      state.cats.add(area.dataset.area);
      state.y0 = state.y1 = null;
      skipReturn = true;
      closeDetail();
      update();
      requestAnimationFrame(() => els.status.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  });

  els.cards.addEventListener("click", (e) => {
    const link = e.target.closest(".card__link");
    if (!link || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    openDetail(link.dataset.id);
  });

  // ── Copy, download, export ────────────────────────────────────
  let toastTimer;
  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove("is-on"), 2200);
  }

  async function copy(text, msg) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;opacity:0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    toast(msg);
  }

  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  $$("[data-copy]").forEach((b) =>
    b.addEventListener("click", () => copy($(`#${b.dataset.copy}`).textContent, "Citation copied")),
  );

  const exportMenu = $("#export");
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-export]");
    if (!b) return;
    exportMenu.open = false;
    if (!results.length) return toast("No papers to export");
    const n = results.length;
    if (b.dataset.export === "csv") {
      const rows = results.map((r) => ({
        Title: r.title,
        Authors: r.authors,
        Year: r.year ?? "",
        Venue: r.venue,
        DOI: r.doi,
        "Annotation types": r.types.join("; "),
        "Generation method": r.gen.join("; "),
        "Research areas": r.areas.join("; "),
        "Annotation forms": r.subcats,
        Abstract: r.abstract,
        BibTeX: r.bibtex,
      }));
      download(`annotation-survey-${n}-papers.csv`, `﻿${Papa.unparse(rows)}`, "text/csv");
    } else {
      const bib = results.map((r) => r.bibtex).filter(Boolean).join("\n\n");
      download(`annotation-survey-${n}-papers.bib`, `${bib}\n`, "application/x-bibtex");
    }
    toast(`Exported ${plural(n, "paper")}`);
  });
  document.addEventListener("click", (e) => {
    if (exportMenu.open && !exportMenu.contains(e.target)) exportMenu.open = false;
  });

  // ── Toolbar ───────────────────────────────────────────────────
  let typingTimer;
  els.search.addEventListener("input", () => {
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
      state.q = els.search.value.trim();
      setTerms(state.q);
      update({ typing: true });
    }, 120);
  });
  els.search.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && els.search.value) {
      e.stopPropagation();
      els.search.value = "";
      state.q = "";
      setTerms("");
      update();
    }
  });

  els.sort.addEventListener("change", () => {
    state.sort = els.sort.value;
    update({ scroll: true });
  });
  $("#sort-pills").addEventListener("change", (e) => {
    state.sort = e.target.value;
    update();
  });

  $(".seg").addEventListener("click", (e) => {
    const b = e.target.closest("[data-view]");
    if (!b) return;
    state.view = b.dataset.view;
    try {
      localStorage.setItem("survey-view", state.view);
    } catch (err) {}
    syncControls();
  });
  try {
    const v = localStorage.getItem("survey-view");
    if (v === "grid" || v === "list") state.view = v;
  } catch (err) {}

  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && !e.target.closest("input, textarea, select, [contenteditable]") && !els.detail.open) {
      e.preventDefault();
      els.search.focus();
    }
    if (e.key === "Escape" && els.filters.classList.contains("is-open")) closeFilters();
  });

  // ── Filters sheet (small screens) ─────────────────────────────
  function openFilters() {
    els.filters.classList.add("is-open");
    els.scrim.hidden = false;
    els.filtersOpen.setAttribute("aria-expanded", "true");
    document.documentElement.classList.add("has-modal");
    setTimeout(() => $("#filters-close").focus({ preventScroll: true }), 50);
  }
  function closeFilters() {
    els.filters.classList.remove("is-open");
    els.scrim.hidden = true;
    els.filtersOpen.setAttribute("aria-expanded", "false");
    document.documentElement.classList.remove("has-modal");
    els.filtersOpen.focus({ preventScroll: true });
  }
  // Sheets with a handle can be pulled down to close
  function dragToDismiss(handle, sheet, query, onDismiss) {
    let y0 = null;
    let dy = 0;
    let t0 = 0;
    handle.addEventListener("pointerdown", (e) => {
      if (!matchMedia(query).matches || e.target.closest("button, a")) return;
      y0 = e.clientY;
      dy = 0;
      t0 = performance.now();
      capture(handle, e);
      sheet.style.transition = "none";
    });
    handle.addEventListener("pointermove", (e) => {
      if (y0 == null) return;
      dy = Math.max(0, e.clientY - y0);
      sheet.style.transform = `translateY(${dy}px)`;
    });
    const end = () => {
      if (y0 == null) return;
      y0 = null;
      const speed = dy / Math.max(1, performance.now() - t0);
      sheet.style.transition = "transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)";
      if (dy > 110 || (dy > 30 && speed > 0.6)) {
        sheet.style.transform = "translateY(100%)";
        setTimeout(() => {
          onDismiss();
          sheet.style.transform = "";
          sheet.style.transition = "";
        }, 220);
      } else {
        sheet.style.transform = "";
        setTimeout(() => (sheet.style.transition = ""), 300);
      }
    };
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  }
  dragToDismiss($(".filters__head"), els.filters, "(max-width: 900px)", closeFilters);
  dragToDismiss($(".detail__bar"), els.detail, "(max-width: 700px)", closeDetail);

  els.filtersOpen.addEventListener("click", openFilters);
  $("#filters-close").addEventListener("click", closeFilters);
  els.filtersDone.addEventListener("click", () => {
    closeFilters();
    scrollToResults();
  });
  els.scrim.addEventListener("click", closeFilters);
  matchMedia("(min-width: 901px)").addEventListener("change", (e) => {
    if (e.matches && els.filters.classList.contains("is-open")) closeFilters();
  });

  // ── Theme ─────────────────────────────────────────────────────
  $("#theme-toggle").addEventListener("click", (e) => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    const apply = () => {
      document.documentElement.dataset.theme = next;
      $("#theme-color-meta").setAttribute("content", next === "dark" ? "#0E1013" : "#F5F4F0");
    };
    try {
      localStorage.setItem("survey-theme", next);
    } catch (err) {}
    if (!document.startViewTransition || reduceMotion()) return apply();
    // the new theme spreads outward from the toggle
    const r = e.currentTarget.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    document.startViewTransition(apply).ready.then(() => {
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: 650, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)", pseudoElement: "::view-transition-new(root)" },
      );
    });
  });

  // Toolbar height feeds the sticky sidebar offset
  const setToolbarH = () =>
    document.documentElement.style.setProperty("--toolbar-h", `${$("#toolbar").offsetHeight}px`);
  setToolbarH();
  window.addEventListener("resize", setToolbarH);

  load();
})();
