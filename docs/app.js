// Derive ICS URL from current page location — works locally and on GitHub Pages
function getBaseUrl() {
  return window.location.href.replace(/\/?$/, "").replace(/\/index\.html$/, "");
}

// Returns the active ICS URL — district-only or district+schools via /api/calendar
function getActiveIcsUrl() {
  if (selectedSchools.size > 0) {
    return getCalendarApiUrl([...selectedSchools].sort());
  }
  return getBaseUrl() + "/calendars/latest.ics";
}

function getActiveWebcalUrl() {
  return getActiveIcsUrl().replace(/^https?:\/\//, "webcal://");
}

// Wire up subscribe buttons (header + main section)
function wireSubscribeButtons(suffix) {
  const s = suffix ? `-${suffix}` : "";
  document.getElementById(`btn-google${s}`).addEventListener("click", () => {
    const calUrl = "https://calendar.google.com/calendar/render?cid=" + getActiveWebcalUrl();
    window.open(calUrl, "_blank");
  });
  document.getElementById(`btn-apple${s}`).addEventListener("click", () => {
    window.location.href = getActiveWebcalUrl();
  });
  document.getElementById(`btn-outlook${s}`).addEventListener("click", () => {
    window.open("https://outlook.live.com/calendar/0/addfromweb?url=" + encodeURIComponent(getActiveIcsUrl()), "_blank");
  });
  document.getElementById(`btn-download${s}`).addEventListener("click", () => {
    const a = document.createElement("a");
    a.href = getActiveIcsUrl();
    a.download = "livingston-schools.ics";
    a.click();
  });
}

wireSubscribeButtons();       // header buttons (btn-google, etc.)
wireSubscribeButtons("main"); // section buttons (btn-google-main, etc.)

function updateFooterUrl() {
  const urlDisplay = document.getElementById("subscribe-url-display");
  if (urlDisplay) urlDisplay.textContent = getActiveWebcalUrl();
}

function formatTime(hhmm) {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  if (h === 0 && m === 0) return "";
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return m === 0 ? `${hour} ${suffix}` : `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

// Set default footer URL (no schools selected yet)
(function() {
  const urlDisplay = document.getElementById("subscribe-url-display");
  if (urlDisplay) urlDisplay.textContent = (getBaseUrl() + "/calendars/latest.ics").replace(/^https?:\/\//, "webcal://");
})();

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

// Share an event via Web Share API or copy link to clipboard
function shareEvent(event) {
  const dateText = formatDateRange(event.start, event.end);
  const baseUrl = window.location.href.replace(/#.*$/, "");
  const shareUrl = baseUrl + "#" + event.start;
  const shareText = event.title + " — " + dateText;

  if (navigator.share) {
    navigator.share({ title: event.title, text: shareText, url: shareUrl }).catch(() => {});
    return;
  }

  navigator.clipboard.writeText(shareText + "\n" + shareUrl).then(() => {
    showToast("Link copied!");
  }).catch(() => {
    showToast("Could not copy link");
  });
}

// Show a brief toast notification
function showToast(message) {
  let toast = document.getElementById("share-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "share-toast";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => toast.classList.remove("visible"), 2000);
}

let allEventsData = null;
const selectedSchools = new Set(); // abbreviations: "LHS", "HIL", etc.

const SCHOOL_TO_ABBR = {
  "Burnet Hill Elementary": "BHE",
  "Collins Elementary": "COL",
  "Harrison Elementary": "HAR",
  "Hillside Elementary": "HIL",
  "Mt. Pleasant Middle": "MPM",
  "Heritage Middle": "HMS",
  "Riker Hill Elementary": "RHE",
  "Mt. Pleasant Elementary": "MPE",
  "Livingston High School": "LHS",
};

const ABBR_TO_SCHOOL = Object.fromEntries(
  Object.entries(SCHOOL_TO_ABBR).map(([k, v]) => [v, k])
);

function getCalendarApiUrl(abbrs) {
  const base = window.location.origin;
  const param = abbrs.length > 0 ? "?schools=" + abbrs.join(",") : "";
  return base + "/api/calendar" + param;
}

function getSelectedSchoolNames() {
  return [...selectedSchools].map(a => ABBR_TO_SCHOOL[a]).filter(Boolean);
}

// Called when a checkbox changes — only updates subscribe panel, no scroll
function onSchoolSelectionChanged() {
  updateSubscribePanel();
  updateFooterUrl();
}

// Called by "View Calendar" button — commits selection, scrolls to events
function applySchoolSelection() {
  const url = new URL(window.location);
  if (selectedSchools.size > 0) {
    url.searchParams.set("schools", [...selectedSchools].sort().join(","));
  } else {
    url.searchParams.delete("schools");
  }
  history.replaceState(null, "", url);

  renderEvents(allEventsData, false);
  const anchor = document.querySelector(".today-anchor");
  (anchor || document.getElementById("events-list")).scrollIntoView({ behavior: "smooth", block: "start" });
}

// Restore selections from URL on load
function restoreFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("schools") || "";
  for (const abbr of raw.split(",").map(s => s.trim().toUpperCase()).filter(s => s in ABBR_TO_SCHOOL)) {
    selectedSchools.add(abbr);
  }
}

function syncCheckboxes() {
  document.querySelectorAll("#school-picker input[type=checkbox]").forEach(cb => {
    cb.checked = selectedSchools.has(cb.value);
  });
}

function updateSubscribePanel() {
  const panel = document.getElementById("school-subscribe-panel");
  if (!panel) return;
  const abbrs = [...selectedSchools].sort();
  panel.textContent = "";

  if (abbrs.length === 0) {
    panel.style.display = "none";
    return;
  }
  panel.style.display = "";

  const icsUrl = getCalendarApiUrl(abbrs);
  const webcalUrl = icsUrl.replace(/^https?:\/\//, "webcal://");

  const info = document.createElement("p");
  info.className = "subscribe-panel-info";
  info.textContent = "Subscribe to district + " + abbrs.join(", ") + ":";
  panel.appendChild(info);

  const buttons = document.createElement("div");
  buttons.className = "button-group";

  const googleBtn = document.createElement("button");
  googleBtn.className = "btn btn-google";
  googleBtn.textContent = "Add to Google Calendar";
  googleBtn.addEventListener("click", () => {
    window.open("https://calendar.google.com/calendar/render?cid=" + webcalUrl, "_blank");
  });

  const appleBtn = document.createElement("button");
  appleBtn.className = "btn btn-apple";
  appleBtn.textContent = "Add to Apple Calendar";
  appleBtn.addEventListener("click", () => {
    window.location.href = webcalUrl;
  });

  const outlookBtn = document.createElement("button");
  outlookBtn.className = "btn btn-outlook";
  outlookBtn.textContent = "Add to Outlook";
  outlookBtn.addEventListener("click", () => {
    window.open("https://outlook.live.com/calendar/0/addfromweb?url=" + encodeURIComponent(icsUrl), "_blank");
  });

  buttons.appendChild(googleBtn);
  buttons.appendChild(appleBtn);
  buttons.appendChild(outlookBtn);
  panel.appendChild(buttons);

  const urlNote = document.createElement("code");
  urlNote.className = "subscribe-url-note";
  urlNote.textContent = webcalUrl;
  panel.appendChild(urlNote);
}

// School picker — checkboxes that filter events AND build subscribe URL
function renderSchoolPicker(schools) {
  const picker = document.getElementById("school-picker");
  if (!picker) return;
  picker.textContent = "";

  const checkboxList = document.createElement("div");
  checkboxList.className = "school-checkbox-list";

  for (const school of schools) {
    const abbr = SCHOOL_TO_ABBR[school];
    if (!abbr) continue;

    const label = document.createElement("label");
    label.className = "school-checkbox";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = abbr;
    checkbox.checked = selectedSchools.has(abbr);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) selectedSchools.add(abbr);
      else selectedSchools.delete(abbr);
      onSchoolSelectionChanged();
    });

    const text = document.createElement("span");
    text.textContent = school;

    label.appendChild(checkbox);
    label.appendChild(text);
    checkboxList.appendChild(label);
  }

  picker.appendChild(checkboxList);

  const goBtn = document.createElement("button");
  goBtn.className = "btn btn-go";
  goBtn.textContent = "View Calendar";
  goBtn.addEventListener("click", applySchoolSelection);
  picker.appendChild(goBtn);

  const panel = document.createElement("div");
  panel.id = "school-subscribe-panel";
  panel.className = "school-subscribe-panel";
  picker.appendChild(panel);
  updateSubscribePanel();
}

// Render events grouped by month. Pass autoScroll=false to suppress scroll.
function renderEvents(eventsData, autoScroll) {
  if (autoScroll === undefined) autoScroll = true;
  const container = document.getElementById("events-list");
  container.innerHTML = "";

  const activeSchoolNames = getSelectedSchoolNames();
  const events = (eventsData.events ?? []).filter(e => {
    if (!e.school) return true; // always show district events
    return activeSchoolNames.includes(e.school); // show selected schools only
  });

  if (events.length === 0) {
    container.innerHTML = '<div class="error-msg"><strong>No events yet</strong>The calendar for this school year hasn\'t been published yet. Check back soon!</div>';
    return;
  }

  // Group by month
  const groups = new Map();
  for (const event of events) {
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
      card.dataset.date = event.start;  // enables deep-link anchoring

      // Mark first event on or after today as the scroll target
      if (!scrollTarget && event.end >= today) {
        scrollTarget = card;
        card.classList.add("today-anchor");
      }

      const dateEl = document.createElement("div");
      dateEl.className = "event-date";
      dateEl.textContent = formatDateRange(event.start, event.end);
      const time = formatTime(event.startTime);
      if (time) {
        const timeEl = document.createElement("div");
        timeEl.className = "event-time";
        timeEl.textContent = time;
        dateEl.appendChild(timeEl);
      }

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

      const shareBtn = document.createElement("button");
      shareBtn.className = "share-btn";
      shareBtn.title = "Share this event";
      shareBtn.setAttribute("aria-label", "Share " + event.title);
      // Static SVG icon — no user input
      shareBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>';
      shareBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        shareEvent(event);
      });

      card.appendChild(dateEl);
      card.appendChild(infoEl);
      card.appendChild(shareBtn);
      groupEl.appendChild(card);
    }

    container.appendChild(groupEl);
  }

  if (autoScroll) {
    const hash = window.location.hash.slice(1);
    const hashTarget = hash ? document.querySelector(`[data-date="${hash}"]`) : null;

    if (hashTarget) {
      hashTarget.scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (scrollTarget) {
      scrollTarget.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }
}

// Load events.json
fetch("events.json")
  .then((res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  })
  .then((data) => {
    allEventsData = data;
    restoreFromUrl();
    updateFooterUrl();
    const schools = [...new Set(data.events.filter(e => e.school).map(e => e.school))].sort();
    if (schools.length > 0) renderSchoolPicker(schools);
    renderEvents(data);
  })
  .catch(() => {
    const container = document.getElementById("events-list");
    container.textContent = "";
    const msg = document.createElement("div");
    msg.className = "error-msg";
    const strong = document.createElement("strong");
    strong.textContent = "Couldn't load the calendar";
    const text = document.createElement("p");
    text.textContent = "Something went wrong loading the events. Try refreshing the page — if the problem continues, the calendar may be temporarily unavailable.";
    msg.appendChild(strong);
    msg.appendChild(text);
    container.appendChild(msg);
  });
