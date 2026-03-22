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
    // Google Calendar expects the raw webcal:// URL (not percent-encoded)
    const calUrl = "https://calendar.google.com/calendar/render?cid=" + WEBCAL_URL;
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

// Render events grouped by month
function renderEvents(eventsData) {
  const container = document.getElementById("events-list");
  container.innerHTML = "";

  if (!eventsData.events || eventsData.events.length === 0) {
    container.innerHTML = '<div class="error-msg"><strong>No events yet</strong>The calendar for this school year hasn\'t been published yet. Check back soon!</div>';
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
      card.dataset.date = event.start;  // enables deep-link anchoring

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

  const hash = window.location.hash.slice(1); // strip leading "#"
  const hashTarget = hash ? document.querySelector(`[data-date="${hash}"]`) : null;

  if (hashTarget) {
    hashTarget.scrollIntoView({ behavior: "smooth", block: "start" });
  } else if (scrollTarget) {
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
