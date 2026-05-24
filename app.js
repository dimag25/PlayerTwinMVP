const STORAGE_KEY = "playerTwinProductionUi.v1";
const LEVEL_SIZE = 3000;

const defaultState = {
  player: {
    name: "אורי לוי",
    alias: "שחקן_7",
    age: "U15",
    position: "חלוץ מרכזי",
    region: "אזור מרכז",
    ovr: 84,
    stats: { כוח: 88, טכניקה: 83, קצב: 81 },
    xp: 2350,
    streak: 12,
    weeklyGain: 311,
    confidence: "עצמי + הורה",
    privacy: {
      guardianApproved: true,
      visible: false,
      leaderboard: true
    }
  },
  activityType: "match",
  updateStep: 1,
  leaderboardFilter: "region",
  activities: [
    {
      type: "match",
      title: "משחק ליגה",
      meta: "דיווח עצמי · אושר על ידי הורה",
      xp: 78,
      createdAt: new Date(Date.now() - 86400000).toISOString()
    },
    {
      type: "training",
      title: "אימון סיומת",
      meta: "דיווח עצמי · מאושר",
      xp: 45,
      createdAt: new Date(Date.now() - 172800000).toISOString()
    }
  ],
  events: [
    { title: "אישור הורה עודכן", meta: "היום 18:24" },
    { title: "פעילות נשמרה", meta: "אתמול 20:10" },
    { title: "דירוג נשאר בכינוי", meta: "ברירת מחדל פרטית" }
  ]
};

const leaderboardPlayers = [
  { rank: 1, name: "שחקן_7", alias: "שחקן_7", team: "גלו למאמנים", ovr: 89, xp: 742, current: false },
  { rank: 2, name: "כוכב_11", alias: "כוכב_11", team: "גלו למאמנים", ovr: 87, xp: 706, current: false },
  { rank: 3, name: "חלוץ_99", alias: "חלוץ_99", team: "גלו למאמנים", ovr: 86, xp: 690, current: false },
  { rank: 4, name: "מהיר_10", alias: "מהיר_10", team: "גלו למאמנים", ovr: 84, xp: 655, current: false }
];

let state = loadState();
let toastTimer = null;

const els = {
  views: document.querySelectorAll(".view"),
  navButtons: document.querySelectorAll("[data-nav]"),
  playerName: document.getElementById("player-name"),
  playerAge: document.getElementById("player-age"),
  position: document.getElementById("position"),
  region: document.getElementById("region"),
  ovr: document.getElementById("ovr"),
  statGrid: document.getElementById("stat-grid"),
  levelLabel: document.getElementById("level-label"),
  xpLabel: document.getElementById("xp-label"),
  xpBar: document.getElementById("xp-bar"),
  streak: document.getElementById("streak"),
  weeklyGain: document.getElementById("weekly-gain"),
  confidence: document.getElementById("confidence"),
  guardianStatus: document.getElementById("guardian-status"),
  recentActivities: document.getElementById("recent-activities"),
  timeline: document.getElementById("timeline"),
  dataActivityList: document.getElementById("data-activity-list"),
  verifiedStats: document.getElementById("verified-stats"),
  leaderboardList: document.getElementById("leaderboard-list"),
  modalBackdrop: document.getElementById("modal-backdrop"),
  updateSheet: document.getElementById("update-sheet"),
  activityForm: document.getElementById("activity-form"),
  activityError: document.getElementById("activity-error"),
  stepBack: document.getElementById("step-back"),
  stepNext: document.getElementById("step-next"),
  submitActivity: document.getElementById("submit-activity"),
  previewXp: document.getElementById("preview-xp"),
  previewCopy: document.getElementById("preview-copy"),
  stepPill: document.getElementById("step-pill"),
  exportData: document.getElementById("export-data"),
  visibleToggle: document.getElementById("privacy-visible"),
  leaderboardToggle: document.getElementById("privacy-leaderboard"),
  guardianToggle: document.getElementById("privacy-guardian"),
  aliasMode: document.getElementById("alias-mode"),
  toast: document.getElementById("toast")
};

function loadState() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return structuredClone(defaultState);
    const parsed = JSON.parse(stored);
    return {
      ...structuredClone(defaultState),
      ...parsed,
      player: {
        ...structuredClone(defaultState.player),
        ...(parsed.player || {}),
        stats: { ...defaultState.player.stats, ...(parsed.player?.stats || {}) },
        privacy: { ...defaultState.player.privacy, ...(parsed.player?.privacy || {}) }
      },
      activities: Array.isArray(parsed.activities) ? parsed.activities : defaultState.activities,
      events: Array.isArray(parsed.events) ? parsed.events : defaultState.events
    };
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState() {
  state.events = state.events.slice(0, 20);
  state.activities = state.activities.slice(0, 20);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function numberFmt(value) {
  return new Intl.NumberFormat("he-IL").format(value);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function activityLabel(type) {
  return { match: "משחק", training: "אימון", other: "אחר" }[type] || "פעילות";
}

function render() {
  const { player } = state;
  const level = Math.max(1, Math.floor(player.xp / 250) + 1);
  const xpIntoLevel = player.xp % LEVEL_SIZE;
  const xpPercent = Math.min(100, Math.round((xpIntoLevel / LEVEL_SIZE) * 100));

  els.playerName.textContent = player.name;
  els.playerAge.textContent = player.age;
  els.position.textContent = player.position;
  els.region.textContent = player.region;
  els.ovr.textContent = player.ovr;
  els.levelLabel.textContent = `רמה ${level}`;
  els.xpLabel.textContent = `${numberFmt(xpIntoLevel)} / ${numberFmt(LEVEL_SIZE)}`;
  els.xpBar.style.width = `${xpPercent}%`;
  els.streak.textContent = `${player.streak} 🔥`;
  els.weeklyGain.textContent = `+${numberFmt(player.weeklyGain)} XP`;
  els.confidence.textContent = player.confidence;
  els.guardianStatus.textContent = player.privacy.guardianApproved ? "הכל מאושר" : "נדרש אישור הורה";

  els.statGrid.innerHTML = Object.entries(player.stats)
    .map(([label, value]) => `<div><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span></div>`)
    .join("");

  renderActivities();
  renderVerifiedStats();
  renderParent();
  renderLeaderboard();
  renderUpdateStep();
}

function renderActivities() {
  const empty = `<article class="empty-state"><strong>אין עדיין פעילות חדשה</strong><p>עדכון ראשון יפעיל XP, סטטיסטיקות והיסטוריית התקדמות.</p></article>`;
  const rows = state.activities.map((activity) => {
    const date = new Intl.DateTimeFormat("he-IL", { day: "2-digit", month: "2-digit" }).format(new Date(activity.createdAt));
    return `
      <article class="activity-row">
        <div>
          <strong>${escapeHtml(activity.title)}</strong>
          <p>${escapeHtml(activity.meta)} · ${date}</p>
        </div>
        <span>+${escapeHtml(activity.xp)} XP</span>
      </article>
    `;
  }).join("");
  els.recentActivities.innerHTML = rows || empty;
  els.timeline.innerHTML = rows || empty;
}

function renderVerifiedStats() {
  const stats = [
    { label: "שערים", value: 14, trust: "מאושר הורה" },
    { label: "בישולים", value: 9, trust: "דיווח עצמי" },
    { label: "משחקים", value: 32, trust: "מאומת" },
    { label: "דקות", value: "1,842", trust: "מאומת" }
  ];

  els.verifiedStats.innerHTML = stats.map((item) => `
    <article>
      <span>${escapeHtml(item.label)}</span>
      <strong>${escapeHtml(item.value)}</strong>
      <em>${escapeHtml(item.trust)}</em>
    </article>
  `).join("");
}

function renderParent() {
  els.guardianToggle.checked = state.player.privacy.guardianApproved;
  els.visibleToggle.checked = state.player.privacy.visible;
  els.leaderboardToggle.checked = state.player.privacy.leaderboard;
  document.querySelector('[data-consent-label="guardian"]').textContent = state.player.privacy.guardianApproved ? "מאושר" : "חסום";
  document.querySelector('[data-consent-label="visible"]').textContent = state.player.privacy.visible ? "שם גלוי" : "פרטי";
  document.querySelector('[data-consent-label="leaderboard"]').textContent = state.player.privacy.leaderboard ? "פעיל" : "כבוי";

  els.dataActivityList.innerHTML = state.events.map((event) => `
    <article>
      <strong>${escapeHtml(event.title)}</strong>
      <span>${escapeHtml(event.meta)}</span>
    </article>
  `).join("");
}

function renderLeaderboard() {
  const currentName = state.player.privacy.visible && !els.aliasMode?.checked ? state.player.name : state.player.alias;
  const current = {
    rank: 5,
    name: currentName,
    alias: state.player.alias,
    team: state.player.privacy.visible ? "שם גלוי באישור" : "כינוי פרטי",
    ovr: state.player.ovr,
    xp: state.player.weeklyGain,
    current: true
  };
  const players = state.player.privacy.leaderboard ? [...leaderboardPlayers, current] : leaderboardPlayers;

  els.leaderboardList.innerHTML = players.map((player) => `
    <article class="leader-row ${player.current ? "is-current" : ""}">
      <span class="rank-badge">${escapeHtml(player.rank)}</span>
      <div>
        <strong>${escapeHtml(player.name)}${player.current ? " · אתה" : ""}</strong>
        <p>${escapeHtml(player.team)} · OVR ${escapeHtml(player.ovr)}</p>
      </div>
      <span class="leader-score">+${escapeHtml(player.xp)}</span>
    </article>
  `).join("");
}

function switchView(viewName) {
  els.views.forEach((view) => view.classList.toggle("is-active", view.dataset.view === viewName));
  els.navButtons.forEach((button) => button.classList.toggle("is-active", button.dataset.nav === viewName));
  addEvent(`נפתח מסך ${viewName}`, "פעולת משתמש");
  saveState();
}

function openUpdateSheet() {
  state.updateStep = 1;
  els.activityError.textContent = "";
  els.modalBackdrop.hidden = false;
  els.updateSheet.classList.add("is-open");
  els.updateSheet.setAttribute("aria-hidden", "false");
  renderUpdateStep();
}

function closeModals() {
  els.modalBackdrop.hidden = true;
  els.updateSheet.classList.remove("is-open");
  els.updateSheet.setAttribute("aria-hidden", "true");
  els.activityError.textContent = "";
}

function renderUpdateStep() {
  document.querySelectorAll(".form-step").forEach((step) => {
    step.classList.toggle("is-active", Number(step.dataset.step) === state.updateStep);
  });
  document.querySelectorAll(".step-progress span").forEach((item, index) => {
    item.classList.toggle("is-active", index < state.updateStep);
  });
  els.stepPill.textContent = `${state.updateStep}/3`;
  els.stepBack.disabled = state.updateStep === 1;
  els.stepNext.hidden = state.updateStep === 3;
  els.submitActivity.hidden = state.updateStep !== 3;
  document.querySelectorAll("[data-activity-type]").forEach((button) => {
    button.classList.toggle("is-selected", button.dataset.activityType === state.activityType);
  });
  renderSubmitPreview();
}

function activityFormEstimate() {
  const data = Object.fromEntries(new FormData(els.activityForm));
  const goals = Math.max(0, Math.min(12, Number(data.goals || 0)));
  const assists = Math.max(0, Math.min(12, Number(data.assists || 0)));
  const minutes = Math.max(15, Math.min(120, Number(data.minutes || 72)));
  const impact = Math.max(1, Math.min(5, Number(data.impact || 4)));
  const xp = 40 + goals * 14 + assists * 10 + Math.round(minutes / 6) + impact * 8;
  return { goals, assists, minutes, impact, xp };
}

function renderSubmitPreview() {
  const estimate = activityFormEstimate();
  els.previewXp.textContent = `+${estimate.xp} XP`;
  els.previewCopy.textContent = `${activityLabel(state.activityType)} עם ${estimate.minutes} דקות, ${estimate.goals} שערים ו-${estimate.assists} בישולים יעדכן XP, סטטיסטיקות ויומן פעילות.`;
}

function addEvent(title, meta) {
  state.events.unshift({ title, meta });
  state.events = state.events.slice(0, 20);
}

function submitActivity(event) {
  event.preventDefault();
  els.activityError.textContent = "";

  if (!state.player.privacy.guardianApproved) {
    els.activityError.textContent = "נדרש אישור הורה לפני שמירת נתוני שחקן.";
    showToast("נדרש אישור הורה");
    return;
  }

  const data = Object.fromEntries(new FormData(els.activityForm));
  const { goals, assists, minutes, impact, xp } = activityFormEstimate();

  state.player.xp += xp;
  state.player.weeklyGain += xp;
  state.player.streak = Math.max(state.player.streak + 1, 1);
  state.player.stats["טכניקה"] = Math.min(99, state.player.stats["טכניקה"] + assists);
  state.player.stats["קצב"] = Math.min(99, state.player.stats["קצב"] + Math.round(impact / 2));
  state.player.stats["כוח"] = Math.min(99, state.player.stats["כוח"] + Math.round(minutes / 90));
  state.player.ovr = Math.round(Object.values(state.player.stats).reduce((sum, value) => sum + value, 0) / 3);

  state.activities.unshift({
    type: state.activityType,
    title: `${activityLabel(state.activityType)} · ${goals} שערים, ${assists} בישולים`,
    meta: "דיווח עצמי · אושר על ידי הורה",
    xp,
    createdAt: new Date().toISOString()
  });
  addEvent("פעילות חדשה נשמרה", `${activityLabel(state.activityType)} · +${xp} XP`);
  saveState();
  render();
  closeModals();
  showToast(`פעילות נשמרה! +${xp} XP`);
}

function exportData() {
  const payload = {
    app: "Player Twin",
    exportedAt: new Date().toISOString(),
    note: "Local prototype export only. Not a production child-data record.",
    state
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `player-twin-export-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  addEvent("ייצוא נתונים נוצר", "הורה ביקש קובץ מקומי");
  saveState();
  renderParent();
  showToast("קובץ ייצוא נוצר");
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.classList.add("is-visible");
  toastTimer = window.setTimeout(() => els.toast.classList.remove("is-visible"), 2400);
}

function bindEvents() {
  els.navButtons.forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.nav));
  });
  document.querySelectorAll("[data-open-update]").forEach((button) => {
    button.addEventListener("click", openUpdateSheet);
  });
  document.querySelectorAll("[data-close-modal]").forEach((button) => {
    button.addEventListener("click", closeModals);
  });
  els.modalBackdrop.addEventListener("click", closeModals);
  els.stepBack.addEventListener("click", () => {
    state.updateStep = Math.max(1, state.updateStep - 1);
    renderUpdateStep();
  });
  els.stepNext.addEventListener("click", () => {
    state.updateStep = Math.min(3, state.updateStep + 1);
    renderUpdateStep();
  });
  els.activityForm.addEventListener("submit", submitActivity);

  document.querySelectorAll("[data-activity-type]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activityType = button.dataset.activityType;
      renderUpdateStep();
    });
  });

  document.querySelectorAll('input[type="range"]').forEach((input) => {
    input.addEventListener("input", () => {
      const valueEl = document.querySelector(`[data-range-value="${input.name}"]`);
      if (valueEl) valueEl.textContent = input.value;
      renderSubmitPreview();
    });
  });

  document.querySelectorAll('#activity-form input[type="number"], #activity-form select').forEach((input) => {
    input.addEventListener("input", renderSubmitPreview);
    input.addEventListener("change", renderSubmitPreview);
  });

  [
    [els.guardianToggle, "guardianApproved", "אישור הורה עודכן"],
    [els.visibleToggle, "visible", "נראות שם ותמונה עודכנה"],
    [els.leaderboardToggle, "leaderboard", "הרשאת דירוג עודכנה"]
  ].forEach(([toggle, key, title]) => {
    toggle.addEventListener("change", () => {
      state.player.privacy[key] = toggle.checked;
      addEvent(title, toggle.checked ? "פעיל" : "כבוי");
      saveState();
      render();
    });
  });

  els.aliasMode.addEventListener("change", renderLeaderboard);
  document.querySelectorAll("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll("[data-filter]").forEach((item) => item.classList.toggle("is-selected", item === button));
      state.leaderboardFilter = button.dataset.filter;
      saveState();
      renderLeaderboard();
    });
  });

  document.querySelectorAll("[data-approval]").forEach((button) => {
    button.addEventListener("click", () => {
      addEvent(button.dataset.approval === "approve" ? "מדיה אושרה" : "מדיה נדחתה", "וידאו משחק 18.5.26");
      saveState();
      renderParent();
      showToast(button.dataset.approval === "approve" ? "האישור נשמר" : "הבקשה נדחתה");
    });
  });

  els.exportData.addEventListener("click", exportData);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeModals();
  });
}

bindEvents();
render();
