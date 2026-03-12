// Derive ICS URL from current page location — works locally and on GitHub Pages
function getIcsUrl() {
  const base = window.location.href.replace(/\/?$/, "").replace(/\/index\.html$/, "");
  return base + "/calendars/latest.ics";
}

const ICS_URL = getIcsUrl();
const WEBCAL_URL = ICS_URL.replace(/^https?:\/\//, "webcal://");

// Wire up subscribe buttons (header + main section)
function wireSubscribeButtons(suffix) {
  const s = suffix ? `-${suffix}` : "";
  document.getElementById(`btn-google${s}`).addEventListener("click", () => {
    const calUrl = "https://calendar.google.com/calendar/r?cid=" + encodeURIComponent(WEBCAL_URL);
    window.open(calUrl, "_blank");
  });
  document.getElementById(`btn-apple${s}`).addEventListener("click", () => {
    window.location.href = WEBCAL_URL;
  });
  document.getElementById(`btn-outlook${s}`).addEventListener("click", () => {
    const outlookUrl = "https://outlook.live.com/calendar/0/addfromweb?url=" + encodeURIComponent(ICS_URL);
    window.open(outlookUrl, "_blank");
  });
  document.getElementById(`btn-download${s}`).addEventListener("click", () => {
    const a = document.createElement("a");
    a.href = ICS_URL;
    a.download = "livingston-schools.ics";
    a.click();
  });
}

wireSubscribeButtons();       // header buttons (btn-google, etc.)
wireSubscribeButtons("main"); // section buttons (btn-google-main, etc.)

// Show subscribe URL in footer
const urlDisplay = document.getElementById("subscribe-url-display");
if (urlDisplay) {
  urlDisplay.textContent = WEBCAL_URL;
}

// Format date string (YYYY-MM-DD) to readable format
function formatDate(dateStr) {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

// Format a date range for display
function formatDateRange(start, end) {
  if (start === end) {
    return formatDate(start);
  }
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);

  const startDate = new Date(sy, sm - 1, sd);
  const endDate = new Date(ey, em - 1, ed);

  const startStr = startDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const endStr = endDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  return `${startStr} – ${endStr}`;
}

// Get month label from YYYY-MM-DD
function getMonthKey(dateStr) {
  const [year, month] = dateStr.split("-").map(Number);
  const date = new Date(year, month - 1, 1);
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

// Get today's date as YYYY-MM-DD (local time)
function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Render events grouped by month
function renderEvents(eventsData) {
  const container = document.getElementById("events-list");
  container.innerHTML = "";

  if (!eventsData.events || eventsData.events.length === 0) {
    container.innerHTML = '<p class="loading">No events found.</p>';
    return;
  }

  // Group by month
  const groups = new Map();
  for (const event of eventsData.events) {
    const key = getMonthKey(event.start);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(event);
  }

  const today = todayStr();
  let scrollTarget = null;

  for (const [monthLabel, events] of groups) {
    const groupEl = document.createElement("div");
    groupEl.className = "month-group";

    const labelEl = document.createElement("div");
    labelEl.className = "month-label";
    labelEl.textContent = monthLabel;
    groupEl.appendChild(labelEl);

    for (const event of events) {
      const card = document.createElement("div");
      card.className = `event-card ${event.type}`;

      // Mark first event on or after today as the scroll target
      if (!scrollTarget && event.end >= today) {
        scrollTarget = card;
        card.classList.add("today-anchor");
      }

      const dateEl = document.createElement("div");
      dateEl.className = "event-date";
      dateEl.textContent = formatDateRange(event.start, event.end);

      const infoEl = document.createElement("div");
      infoEl.className = "event-info";

      const titleEl = document.createElement("div");
      titleEl.className = "event-title";
      titleEl.textContent = event.title;
      infoEl.appendChild(titleEl);

      if (event.description) {
        const descEl = document.createElement("div");
        descEl.className = "event-desc";
        descEl.textContent = event.description;
        infoEl.appendChild(descEl);
      }

      card.appendChild(dateEl);
      card.appendChild(infoEl);
      groupEl.appendChild(card);
    }

    container.appendChild(groupEl);
  }

  if (scrollTarget) {
    scrollTarget.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

// Load events.json
fetch("events.json")
  .then((res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  })
  .then((data) => {
    renderEvents(data);
  })
  .catch((err) => {
    const container = document.getElementById("events-list");
    container.innerHTML = `
      <div class="error-msg">
        <strong>Could not load events.</strong><br>
        ${err.message}<br><br>
        Run <code>npm run build</code> to generate <code>docs/events.json</code>.
      </div>
    `;
  });
