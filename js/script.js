// Define the toggleDiv function
function toggleDiv(button, abstractDiv) {
  let contentDiv = document.getElementById(abstractDiv);
  let buttonElem = document.getElementById(button);
  if (contentDiv.style.display === "none" || contentDiv.style.display === "") {
    buttonElem.innerHTML = "▼";
    contentDiv.style.display = "block";
  } else {
    buttonElem.innerHTML = "►";
    contentDiv.style.display = "none";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const url =
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vSDf3Uc4wp0I_O-uZ_mDCOmHAaktsU7MXdw6VpvN8im_5XDN_rmShVYhuAbJbQLj2fUBjmjmxjKmIjP/pub?gid=1840793528&single=true&output=csv";

  const cardsContainer = document.getElementById("cards-container");
  const venueFilterContainer = document.getElementById(
    "venue-filter-container",
  );
  const otherFiltersContainer = document.getElementById(
    "other-filters-container",
  );
  const searchBar = document.getElementById("search-bar");
  const totalPapersSpan = document.getElementById("total-papers");
  // const yearSlider = document.getElementById('year-slider');
  // const yearRangeLabel = document.getElementById('year-range-label');
  const darkModeToggle = document.getElementById("dark-mode-toggle");

  // Add event listeners for Annotation Types checkboxes
  const textualCheckbox = document.getElementById("textual-checkbox");
  const graphicalCheckbox = document.getElementById("graphical-checkbox");

  textualCheckbox.addEventListener("change", filterCards);
  graphicalCheckbox.addEventListener("change", filterCards);

  const manualCheckbox = document.getElementById("manual-checkbox");
  const automaticCheckbox = document.getElementById("automatic-checkbox");
  const semiAutomaticCheckbox = document.getElementById(
    "semi-automatic-checkbox",
  );

  manualCheckbox.addEventListener("change", filterCards);
  automaticCheckbox.addEventListener("change", filterCards);
  semiAutomaticCheckbox.addEventListener("change", filterCards);

  // Load sound effects
  const clickSound = new Audio("sounds/click.mp3");
  const modalOpenSound = new Audio("sounds/modal-open.mp3");
  const filterSelectSound = new Audio("sounds/filter-select.mp3");

  const otherFields = [
    "Empirical Study",
    "Tool, Technique, and Framework",
    "Storytelling and Narrative Visualizations",
    "Collaborative Sensemaking and Data Analysis",
    "Exploratory Data Analysis",
    "Provenance",
    "Uncertainty Visualization",
    "Interaction and User Engagement",
  ];
  const alwaysShowFields = [
    "Annotation Types",
    "Annotation Subcategories",
    "Annotation Generation Method",
  ];
  let otherVenues = [];
  let data = []; // Global variable to store parsed data
  let filteredData = []; // Global variable to store filtered data
  let activeTagFilter = null; // Currently active tag filter field name
  let _shownRecords = []; // Tracks the records currently rendered as cards

  const tagFieldColors = {
    "Empirical Study": "color-green",
    "Tool, Technique, and Framework": "color-orange",
    "Storytelling and Narrative Visualizations": "color-violet",
    "Collaborative Sensemaking and Data Analysis": "color-teal",
    "Exploratory Data Analysis": "color-indigo",
    Provenance: "color-amber",
    "Uncertainty Visualization": "color-red",
    "Interaction and User Engagement": "color-cyan",
  };

  // Clear Filters logic — resets every filter back to initial "show all" state
  function clearFilters() {
    // Uncheck then re-check all filter checkboxes (triggers no change events)
    document
      .querySelectorAll(
        ".venue-checkbox, .other-checkbox, .annotation-checkbox, .annotation-generation-checkbox",
      )
      .forEach((cb) => {
        cb.checked = true;
      });

    // Reset "Deselect All" button labels
    [
      "select-all-venues",
      "select-all-types",
      "select-all-annotation-types",
      "select-all-annotation-generation",
    ].forEach((id) => {
      const btn = document.getElementById(id);
      if (btn) {
        btn.textContent = "Deselect All";
        btn.classList.remove("active");
      }
    });

    // Reset search bar
    searchBar.value = "";

    // Reset active tag filter
    activeTagFilter = null;

    // Reset year slider — this fires the 'update' event which calls filterCards()
    const sliderEl = document.getElementById("year-range-slider");
    if (sliderEl && sliderEl.noUiSlider) {
      sliderEl.noUiSlider.set([1994, 2024]);
    } else {
      filterCards(); // fallback if slider not ready
    }
  }

  // Attach to button
  document
    .getElementById("clear-filters-btn")
    .addEventListener("click", clearFilters);

  // Initialize the chart with interactive tooltips
  const ctx = document.getElementById("papers-chart").getContext("2d");
  let papersChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: [],
      datasets: [
        {
          label: "Papers",
          data: [],
          backgroundColor: function (context) {
            const chart = context.chart;
            const { ctx: c, chartArea } = chart;
            if (!chartArea) return "rgba(99, 102, 241, 0.6)";
            const gradient = c.createLinearGradient(
              0,
              chartArea.top,
              0,
              chartArea.bottom,
            );
            gradient.addColorStop(0, "rgba(99, 102, 241, 0.85)");
            gradient.addColorStop(1, "rgba(37, 99, 235, 0.35)");
            return gradient;
          },
          borderColor: "rgba(99, 102, 241, 0.9)",
          borderWidth: 1,
          borderRadius: 4,
          borderSkipped: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 300 },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: {
            maxRotation: 45,
            minRotation: 0,
            font: { size: 7, family: "inherit" },
            color: "rgba(100, 110, 140, 0.7)",
            maxTicksLimit: 8,
          },
        },
        y: {
          beginAtZero: true,
          grid: { color: "rgba(120, 130, 160, 0.1)" },
          border: { display: false, dash: [4, 4] },
          ticks: {
            stepSize: 1,
            font: { size: 7, family: "inherit" },
            color: "rgba(100, 110, 140, 0.7)",
            padding: 4,
          },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "rgba(15, 18, 30, 0.92)",
          titleFont: { size: 11, family: "inherit", weight: "700" },
          bodyFont: { size: 10, family: "inherit" },
          padding: 10,
          cornerRadius: 10,
          borderColor: "rgba(99, 102, 241, 0.4)",
          borderWidth: 1,
          callbacks: {
            title: (items) => `Year: ${items[0].label}`,
            label: (item) => ` ${item.raw} paper${item.raw !== 1 ? "s" : ""}`,
          },
        },
      },
    },
  });

  // Parse the CSV data from the URL
  Papa.parse(url, {
    download: true,
    header: true,
    skipEmptyLines: false,
    complete: function (results) {
      data = results.data;
      const records = results.data;
      if (records.length === 0) {
        console.error("No data found in the CSV file.");
        return;
      }
      const venues = getUniqueVenues(records);
      generateVenueFilters(venues);
      generateOtherFilters(records);
      renderCards(records);
      updateChart(records);

      // Event listeners for filtering
      venueFilterContainer.addEventListener("change", filterCards);
      otherFiltersContainer.addEventListener("change", filterCards);
      searchBar.addEventListener("input", filterCards);

      // Sort select event listener
      const sortSelect = document.getElementById("sort-select");
      if (sortSelect) sortSelect.addEventListener("change", filterCards);

      // Handle slider change
      // yearSlider.addEventListener('input', handleYearSliderChange);

      // Select All functionality
      document
        .getElementById("select-all-venues")
        .addEventListener("click", () => {
          toggleSelectAll("venue-checkbox");
          //playSound(filterSelectSound);
        });
      document
        .getElementById("select-all-types")
        .addEventListener("click", () => {
          toggleSelectAll("other-checkbox");
          //playSound(filterSelectSound);
        });
      // Add event listener for the "Select All" / "Deselect All" button for Annotation Types
      document
        .getElementById("select-all-annotation-types")
        .addEventListener("click", function () {
          toggleSelectAll(this, "annotation-checkbox"); // Target 'annotation-checkbox' class
        });

      // Handle dark mode toggle with smooth transition and tooltips
      darkModeToggle.addEventListener("change", toggleDarkMode);
      darkModeToggle.title = darkModeToggle.checked
        ? "Switch to Light Mode"
        : "Switch to Dark Mode"; // Set initial tooltip
    },
    error: function (error) {
      console.error("Error parsing CSV:", error);
    },
  });

  // Handle year slider change
  // function handleYearSliderChange() {
  //     const maxYear = parseInt(yearSlider.value);
  //     yearRangeLabel.textContent = `1994 - ${maxYear}`;
  //     filterCards();
  // }

  const yearMinLabel = document.getElementById("year-min");
  const yearMaxLabel = document.getElementById("year-max");

  // Initialize noUiSlider for range selection
  noUiSlider.create(document.getElementById("year-range-slider"), {
    start: [1994, 2024], // Starting range for the slider
    connect: true,
    range: {
      min: 1994,
      max: 2024,
    },
    step: 1,
    tooltips: [false, false], // Optional: Tooltips on the handles
    format: {
      to: (value) => Math.round(value), // Display rounded year values
      from: (value) => Number(value),
    },
  });

  // ── Unified card interaction delegation ───────────────────────
  // Handles: abstract toggle · tag filter · drawer open
  cardsContainer.addEventListener("click", (e) => {
    // 1. Abstract toggle (triangle button)
    const triBtn = e.target.closest(".triangle-button");
    if (triBtn) {
      const suffix = triBtn.id.replace("abstractButton-", "");
      toggleDiv(triBtn.id, "abstractDiv-" + suffix);
      return;
    }

    // 2. Tag chip click → filter, don't open drawer
    const tag = e.target.closest(".tag--clickable");
    if (tag) {
      filterByTag(tag.dataset.field);
      return;
    }

    // 3. PDF / Cite buttons or DOI links → let them bubble naturally
    if (e.target.closest(".card-action-btn, .card-details a, button, a"))
      return;

    // 4. Anything else on the card → open drawer
    const card = e.target.closest(".card");
    if (!card) return;
    const idx = parseInt(card.dataset.cardIdx, 10);
    if (isNaN(idx) || !_shownRecords[idx]) return;
    openDrawer(_shownRecords[idx]);
  });

  function filterByTag(field) {
    if (activeTagFilter === field) {
      // Toggle off: restore all category checkboxes
      activeTagFilter = null;
      document.querySelectorAll(".other-checkbox").forEach((cb) => {
        cb.checked = true;
      });
      updateButtonState("select-all-types", "other-checkbox");
    } else {
      // Toggle on: check only this field
      activeTagFilter = field;
      document.querySelectorAll(".other-checkbox").forEach((cb) => {
        cb.checked = cb.value === field;
      });
      updateButtonState("select-all-types", "other-checkbox");
    }
    filterCards();
  }

  // Update the labels and filter the data when the slider values change
  document
    .getElementById("year-range-slider")
    .noUiSlider.on("update", function (values) {
      const minYear = Math.round(values[0]);
      const maxYear = Math.round(values[1]);

      // Update the display to show selected range
      yearMinLabel.textContent = minYear;
      yearMaxLabel.textContent = maxYear;

      // Call filterCards function to update the displayed data
      filterCards();
    });

  // Function to toggle checkboxes and update the button text
  function toggleSelectAll(button, className) {
    const checkboxes = document.querySelectorAll(`.${className}`);
    const allChecked = Array.from(checkboxes).every((cb) => cb.checked);
    const someChecked = Array.from(checkboxes).some((cb) => cb.checked);

    // If any checkbox is checked, toggle all to unchecked
    if (someChecked) {
      checkboxes.forEach((cb) => (cb.checked = false));
      button.textContent = "Select All";
      button.classList.remove("active");
    } else {
      // If none are checked, toggle all to checked
      checkboxes.forEach((cb) => (cb.checked = true));
      button.textContent = "Deselect All";
      button.classList.add("active");
    }

    filterCards(); // Update displayed data based on the checkbox state
  }

  // Add event listeners for the "Select All" / "Deselect All" buttons
  document
    .getElementById("select-all-venues")
    .addEventListener("click", function () {
      toggleSelectAll(this, "venue-checkbox");
    });

  document
    .getElementById("select-all-types")
    .addEventListener("click", function () {
      toggleSelectAll(this, "other-checkbox");
    });

  // Update button state based on manual checkbox changes
  document
    .getElementById("venue-filter-container")
    .addEventListener("change", () => {
      updateButtonState("select-all-venues", "venue-checkbox");
      playSound(filterSelectSound);
    });

  document
    .getElementById("other-filters-container")
    .addEventListener("change", () => {
      updateButtonState("select-all-types", "other-checkbox");
      playSound(filterSelectSound);
    });

  // Update button state when checkboxes are changed manually
  document
    .getElementById("annotation-filter-container")
    .addEventListener("change", () => {
      updateButtonState("select-all-annotation-types", "annotation-checkbox");
      playSound(filterSelectSound);
    });

  document
    .getElementById("select-all-annotation-generation")
    .addEventListener("click", function () {
      toggleSelectAll(this, "annotation-generation-checkbox"); // Target 'annotation-generation-checkbox' class
    });

  // Function to update the button text based on the checkbox state
  function updateButtonState(buttonId, className) {
    const button = document.getElementById(buttonId);
    const checkboxes = document.querySelectorAll(`.${className}`);
    const someChecked = Array.from(checkboxes).some((cb) => cb.checked);

    button.textContent = someChecked ? "Deselect All" : "Select All";
    if (someChecked) {
      button.classList.add("active");
    } else {
      button.classList.remove("active");
    }
  }

  // Get unique venues from records
  function getUniqueVenues(records) {
    const venueCounts = {};

    records.forEach((record) => {
      const venue = record["Venue"];
      if (venue) {
        if (!venueCounts[venue]) {
          venueCounts[venue] = 0;
        }
        venueCounts[venue]++;
      }
    });

    const venues = [];
    let otherCount = 0;

    Object.keys(venueCounts).forEach((venue) => {
      if (venueCounts[venue] >= 5) {
        venues.push({ venue, count: venueCounts[venue] });
      } else {
        otherVenues.push(venue);
        otherCount += venueCounts[venue];
      }
    });

    venues.sort((a, b) => b.count - a.count);

    if (otherCount > 0) {
      venues.push({ venue: "Other", count: otherCount });
    }

    return venues;
  }

  // Generate filters for venues
  function generateVenueFilters(venues) {
    const grid = document.createElement("div");
    grid.className = "filter-items-grid";
    venues.forEach(({ venue, count }) => {
      const label = document.createElement("label");
      label.className = "venue-filter";
      label.innerHTML = `<input type="checkbox" class="venue-checkbox" value="${venue}" checked><span class="filter-item-name">${venue}</span><span class="filter-count">${count}</span>`;
      grid.appendChild(label);
    });
    venueFilterContainer.appendChild(grid);
  }

  // Generate filters for other fields
  function generateOtherFilters(records) {
    const otherCounts = {};

    records.forEach((record) => {
      otherFields.forEach((field) => {
        if (record[field] === "X") {
          if (!otherCounts[field]) {
            otherCounts[field] = 0;
          }
          otherCounts[field]++;
        }
      });
    });

    const grid = document.createElement("div");
    grid.className = "filter-items-grid filter-items-grid--column";
    otherFields.forEach((field) => {
      const colorClass = tagFieldColors[field] || "";
      const label = document.createElement("label");
      label.className = `other-filter ${colorClass}`;
      label.innerHTML = `<input type="checkbox" class="other-checkbox" value="${field}" checked><span class="filter-item-name">${field}</span><span class="filter-count">${otherCounts[field] || 0}</span>`;
      grid.appendChild(label);
    });
    otherFiltersContainer.appendChild(grid);
  }

  // Define the fields to include in the CSV
  const requiredFields = ["Title", "Venue", "Year", "Authors", "BibTex"];

  // Function to download filtered data as CSV
  function downloadCSV(records) {
    if (records.length === 0) {
      alert("No data available to download.");
      return;
    }

    // Extract only the required fields from each record
    const csvContent = [
      requiredFields.join(","), // Header row
      ...records.map(
        (record) =>
          requiredFields.map((field) => `"${record[field] || ""}"`).join(","), // Add each row with the required fields
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "filtered_papers.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Add event listener to the download button
  document
    .getElementById("download-csv-button")
    .addEventListener("click", () => {
      downloadCSV(filteredData); // Use the globally stored filtered data
      playSound(clickSound);
    });

  // Render cards with content based on the records
  function renderCards(records) {
    _shownRecords = records; // store reference for delegation
    cardsContainer.innerHTML = ""; // Clear previous cards
    records.forEach((record, idx) => {
      const card = document.createElement("div");
      card.className = "card card-animated";
      card.dataset.cardIdx = idx; // used by the delegated click handler
      card.innerHTML = generateCardContent(record, idx);
      cardsContainer.appendChild(card);
    });
    totalPapersSpan.textContent = records.length; // Update total papers count

    // Update results bar
    const resultsCountEl = document.getElementById("results-count");
    if (resultsCountEl) {
      const total = data.length || records.length;
      const showing = records.length;
      if (showing === total) {
        resultsCountEl.innerHTML = `<strong>${showing}</strong> papers`;
      } else {
        resultsCountEl.innerHTML = `Showing <strong>${showing}</strong> of <strong>${total}</strong> papers`;
      }
    }

    updateChart(records); // Update chart data
  }

  // Generate card content dynamically with search term highlighting
  function generateCardContent(record, idx) {
    let content = "";
    content += `<img src="thumbnails/${record["Paper Identifier"]}.png" alt="Paper Image" class="card-image" width="100%"/>`;
    content += `<h3>${highlightSearchTerm(record["Title"])}</h3>`;

    // Grouping Authors, Annotation Types, and Annotation Generation Method
    content += `<div class="card-details">`;
    content += `<p><strong>Authors:</strong> ${highlightSearchTerm(record["Authors"])}</p>`;

    if (record["Venue"]) {
      content += `<p><strong>Venue:</strong> ${highlightSearchTerm(record["Venue"])}</p>`;
    }

    if (record["Annotation Types"]) {
      content += `<p><strong>Annotation Types:</strong> ${highlightSearchTerm(record["Annotation Types"])}</p>`;
    }

    if (record["Annotation Generation Method"]) {
      content += `<p><strong>Annotation Generation Method:</strong> ${highlightSearchTerm(record["Annotation Generation Method"])}</p>`;
    }

    // Add DOI if present
    if (record["DOI"]) {
      content += `<p><strong>DOI:</strong> <a href="https://doi.org/${record["DOI"]}" target="_blank">${record["DOI"]}</a></p>`;
    }

    content += `</div>`;

    let tags = "";
    otherFields.forEach((field) => {
      if (record[field] === "X") {
        const colorClass = tagFieldColors[field] || "";
        const activeClass = activeTagFilter === field ? "tag--active" : "";
        tags += `<span class="tag tag--clickable ${colorClass} ${activeClass}" data-field="${field}">${field}</span> `;
      }
    });

    if (tags) {
      content += `<p><strong>Tags:</strong> ${tags}</p>`;
    }

    content += `<p><strong>Abstract</strong> `;
    content += `<span class="triangle-button" id="abstractButton-${idx}" style="cursor: pointer;">►</span>`;
    content += `</p>`;
    content += `<div class="abstract-div" id="abstractDiv-${idx}" style="display: none;">${highlightSearchTerm(record["Abstract"])}</div>`;

    // Card action buttons row
    content += `<div class="card-actions">`;

    // PDF / DOI button
    if (record["DOI"]) {
      content += `<a href="https://doi.org/${record["DOI"]}" target="_blank" class="card-action-btn card-action-btn--pdf" title="View paper">
        <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
        PDF
      </a>`;
    } else {
      content += `<span class="card-action-btn card-action-btn--pdf card-action-btn--disabled" title="No DOI available">
        <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        PDF
      </span>`;
    }

    // BibTeX button
    if (record["BibTex"]) {
      content += `<button onclick="downloadBibtex('${idx}')" class="card-action-btn card-action-btn--bib" title="Download BibTeX">
        <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        Cite
      </button>`;
    }

    content += `</div>`;

    return content;
  }

  // ── Drawer ──────────────────────────────────────────────────
  function openDrawer(record) {
    const body = document.getElementById("drawer-body");
    body.scrollTop = 0;

    // Build category tags HTML
    const activeTags = otherFields.filter((f) => record[f] === "X");
    const tagsHtml = activeTags
      .map((f) => {
        const cc = tagFieldColors[f] || "";
        return `<span class="tag ${cc}">${f}</span>`;
      })
      .join("");

    // Action buttons for title area
    const pdfBtn = record["DOI"]
      ? `<a href="https://doi.org/${record["DOI"]}" target="_blank" rel="noopener" class="drawer__btn drawer__btn--pdf">
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          View Paper
        </a>`
      : `<span class="drawer__btn drawer__btn--pdf drawer__btn--disabled">
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          No PDF Available
        </span>`;

    const bibBtn = record["BibTex"]
      ? `<button class="drawer__btn drawer__btn--bib" id="drawer-cite-btn">
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Download BibTeX
        </button>`
      : "";

    body.innerHTML = `
      <div class="drawer__figure">
        <img src="thumbnails/${record["Paper Identifier"]}.png"
             alt="${(record["Title"] || "").replace(/"/g, "&quot;")}"
             class="drawer__img" loading="lazy" />
      </div>

      <div class="drawer__inner">
        <div class="drawer__hero">
          <h2 class="drawer__title" id="drawer-title">${record["Title"] || "Untitled"}</h2>
          <div class="drawer__hero-footer">
            <div class="drawer__meta-row">
              ${record["Year"] ? `<span class="drawer__meta-pill drawer__meta-pill--year">${record["Year"]}</span>` : ""}
              ${record["Venue"] ? `<span class="drawer__meta-pill drawer__meta-pill--venue" title="${record["Venue"]}">${record["Venue"]}</span>` : ""}
            </div>
            <div class="drawer__title-actions">
              ${pdfBtn}
              ${bibBtn}
            </div>
          </div>
        </div>

        <dl class="drawer__dl">
          <div class="drawer__dl-row">
            <dt>Authors</dt>
            <dd>${record["Authors"] || "—"}</dd>
          </div>
          ${record["Annotation Types"] ? `<div class="drawer__dl-row"><dt>Annotation Types</dt><dd>${record["Annotation Types"]}</dd></div>` : ""}
          ${record["Annotation Generation Method"] ? `<div class="drawer__dl-row"><dt>Generation</dt><dd>${record["Annotation Generation Method"]}</dd></div>` : ""}
          ${record["DOI"] ? `<div class="drawer__dl-row"><dt>DOI</dt><dd><a href="https://doi.org/${record["DOI"]}" target="_blank" rel="noopener" class="drawer__link">${record["DOI"]}</a></dd></div>` : ""}
        </dl>

        ${tagsHtml ? `<div class="drawer__section"><span class="drawer__section-label">Categories</span><div class="drawer__tags">${tagsHtml}</div></div>` : ""}

        ${record["Abstract"] ? `<div class="drawer__section"><span class="drawer__section-label">Abstract</span><p class="drawer__abstract">${record["Abstract"]}</p></div>` : ""}
      </div>
    `;

    // Wire cite button
    if (record["BibTex"]) {
      document
        .getElementById("drawer-cite-btn")
        .addEventListener("click", () => {
          const blob = new Blob([record["BibTex"]], { type: "text/plain" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `${record["Paper Identifier"]}.bib`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        });
    }

    const overlay = document.getElementById("drawer-overlay");
    overlay.classList.add("is-open");
    overlay.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    document.getElementById("paper-drawer").focus();
  }

  function closeDrawer() {
    const overlay = document.getElementById("drawer-overlay");
    overlay.classList.remove("is-open");
    overlay.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  // Close drawer on overlay backdrop click
  document.getElementById("drawer-overlay").addEventListener("click", (e) => {
    if (e.target === document.getElementById("drawer-overlay")) closeDrawer();
  });
  // Close drawer on close button click
  document
    .getElementById("drawer-close")
    .addEventListener("click", closeDrawer);
  // Close drawer on Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeDrawer();
  });

  // Function to highlight search terms within the text
  function highlightSearchTerm(text) {
    const searchQuery = searchBar.value.toLowerCase();
    if (!searchQuery) return text;

    const regex = new RegExp(`(${searchQuery})`, "gi");
    return text.replace(regex, "<mark>$1</mark>");
  }

  // Function to update the chart data based on current records
  function updateChart(records) {
    const yearCounts = {};
    records.forEach((record) => {
      const year = record["Year"];
      if (year) {
        yearCounts[year] = (yearCounts[year] || 0) + 1;
      }
    });

    const years = Object.keys(yearCounts).sort();
    const counts = years.map((year) => yearCounts[year]);

    papersChart.data.labels = years;
    papersChart.data.datasets[0].data = counts;
    papersChart.update();
  }

  // Function to download BibTeX file
  window.downloadBibtex = function (idx) {
    const bibtex = data[idx]["BibTex"];
    const paperId = data[idx]["Paper Identifier"];
    const blob = new Blob([bibtex], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${paperId}.bib`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  function filterCards() {
    const checkedVenues = Array.from(
      document.querySelectorAll(".venue-checkbox:checked"),
    ).map((cb) => cb.value);
    const checkedOtherFields = Array.from(
      document.querySelectorAll(".other-checkbox:checked"),
    ).map((cb) => cb.value);
    const searchQuery = searchBar.value.toLowerCase();

    // Get the minimum and maximum year from the range slider
    const minYear = parseInt(yearMinLabel.textContent);
    const maxYear = parseInt(yearMaxLabel.textContent);

    // Check the state of the "Textual" and "Graphical" checkboxes
    const isTextualChecked = textualCheckbox.checked;
    const isGraphicalChecked = graphicalCheckbox.checked;

    // Check the state of the "Annotation Generation" checkboxes
    const isManualChecked = manualCheckbox.checked;
    const isAutomaticChecked = automaticCheckbox.checked;
    const isSemiAutomaticChecked = semiAutomaticCheckbox.checked;

    // Log the state of the annotation generation checkboxes
    console.log(
      `Manual: ${isManualChecked}, Automatic: ${isAutomaticChecked}, Semi-Automatic: ${isSemiAutomaticChecked}`,
    );

    // Filter the records based on selected filters, year range, search query, and annotation types
    filteredData = data.filter((record) => {
      const recordVenue = record["Venue"];
      const recordYear = parseInt(record["Year"]);
      const matchesYear = recordYear >= minYear && recordYear <= maxYear; // Filter by year range

      const matchesVenue = checkedVenues.includes(recordVenue);
      const matchesOtherVenue =
        checkedVenues.includes("Other") && otherVenues.includes(recordVenue);
      // If all category checkboxes are checked (or none selected), show all papers
      // regardless of whether they have any category tag. Only filter when the user
      // has deliberately deselected at least one category.
      const totalOtherCheckboxes =
        document.querySelectorAll(".other-checkbox").length;
      const allOtherChecked =
        checkedOtherFields.length === totalOtherCheckboxes;
      const matchesOtherFields =
        allOtherChecked ||
        checkedOtherFields.length === 0 ||
        checkedOtherFields.some((field) => record[field] === "X");

      const title = record["Title"] ? record["Title"].toLowerCase() : "";
      const abstract = record["Abstract"]
        ? record["Abstract"].toLowerCase()
        : "";
      const authors = record["Authors"] ? record["Authors"].toLowerCase() : "";
      const matchesSearchQuery =
        title.includes(searchQuery) ||
        abstract.includes(searchQuery) ||
        authors.includes(searchQuery);

      // Filter by annotation types
      // When ALL boxes checked → show everything (including papers with no type value)
      const annotationType = record["Annotation Types"]
        ? record["Annotation Types"].toLowerCase()
        : "";

      const allAnnotationChecked = isTextualChecked && isGraphicalChecked;
      const noneAnnotationChecked = !isTextualChecked && !isGraphicalChecked;
      let matchesAnnotationType = true;
      if (noneAnnotationChecked) {
        matchesAnnotationType = false;
      } else if (!allAnnotationChecked) {
        if (isTextualChecked) {
          matchesAnnotationType = annotationType.includes("textual");
        } else {
          matchesAnnotationType = annotationType.includes("graphical");
        }
      }

      // Filter by annotation generation method
      // When ALL boxes checked → show everything (including papers with no method value)
      const annotationGenerationMethod = record["Annotation Generation Method"]
        ? record["Annotation Generation Method"].trim().toLowerCase()
        : "";

      const allGenerationChecked =
        isManualChecked && isAutomaticChecked && isSemiAutomaticChecked;
      const noneGenerationChecked =
        !isManualChecked && !isAutomaticChecked && !isSemiAutomaticChecked;
      let matchesAnnotationGeneration = true;
      if (noneGenerationChecked) {
        matchesAnnotationGeneration = false;
      } else if (!allGenerationChecked) {
        matchesAnnotationGeneration =
          (isManualChecked && annotationGenerationMethod.includes("manual")) ||
          (isAutomaticChecked && annotationGenerationMethod === "automatic") ||
          (isSemiAutomaticChecked &&
            annotationGenerationMethod === "semi-automatic");
      }

      return (
        matchesYear &&
        (matchesVenue || matchesOtherVenue) &&
        matchesOtherFields &&
        matchesSearchQuery &&
        matchesAnnotationType &&
        matchesAnnotationGeneration
      );
    });

    // Log the filtered data for debugging
    console.log("Filtered Data:", filteredData);

    // Apply sort from results bar
    const sortSelect = document.getElementById("sort-select");
    const sortVal = sortSelect ? sortSelect.value : "default";
    if (sortVal === "year-desc") {
      filteredData.sort(
        (a, b) => parseInt(b["Year"] || 0) - parseInt(a["Year"] || 0),
      );
    } else if (sortVal === "year-asc") {
      filteredData.sort(
        (a, b) => parseInt(a["Year"] || 0) - parseInt(b["Year"] || 0),
      );
    } else if (sortVal === "title-asc") {
      filteredData.sort((a, b) =>
        (a["Title"] || "").localeCompare(b["Title"] || ""),
      );
    }

    renderCards(filteredData); // Render the filtered records
  }

  // Function to toggle dark mode with a smooth transition and update tooltip
  function toggleDarkMode() {
    const elements = document.querySelectorAll(
      ".main-container, .filters-container, .content-container, #total-papers-container, #year-filter-container, #venue-filter-container, #other-filters-container, .filter-header, .card, .tag, .select-all-button, .triangle-button, #search-bar, .venue-filter, .other-filter, .abstract-div",
    );

    elements.forEach((element) => {
      element.classList.toggle("dark-mode");
    });

    const isDarkMode = document.body.classList.toggle("dark-mode");
    localStorage.setItem("darkMode", isDarkMode ? "enabled" : "disabled");

    // Update tooltip based on mode
    darkModeToggle.title = isDarkMode
      ? "Switch to Light Mode"
      : "Switch to Dark Mode";
  }

  // Function to play sound effects
  function playSound(sound) {
    sound.currentTime = 0;
    sound.play();
  }

  // Default to dark mode unless user has a saved preference
  if (!localStorage.getItem("darkMode")) {
    document.body.classList.add("dark-mode");
    darkModeToggle.checked = true;
    localStorage.setItem("darkMode", "enabled");
  } else if (localStorage.getItem("darkMode") === "enabled") {
    darkModeToggle.checked = true;
    if (!document.body.classList.contains("dark-mode")) toggleDarkMode();
  }
});
