const PLAYER_ID = "player_1";

const tokenSelect = document.getElementById("token-select");
const rolePill = document.getElementById("role-pill");
const roleHelper = document.getElementById("role-helper");
const roleTabs = document.querySelectorAll("[data-token]");
const outputs = {
  me: document.getElementById("me-output"),
  privacy: document.getElementById("privacy-output"),
  player: document.getElementById("player-output"),
  media: document.getElementById("media-output"),
  audit: document.getElementById("audit-output")
};

const roleCopy = {
  "demo-player-token": {
    label: "Player",
    helper: "Player can read their own context and submit allowed performance updates when consent is granted."
  },
  "demo-parent-token": {
    label: "Parent",
    helper: "Parent can change child privacy and consent, then inspect the resulting player state."
  },
  "demo-coach-token": {
    label: "Coach",
    helper: "Coach is useful for relationship-based access checks and blocked parent-only actions."
  },
  "demo-admin-token": {
    label: "Admin",
    helper: "Admin can inspect audit logs and validate operational read access."
  }
};

function token() {
  return tokenSelect.value;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      authorization: `Bearer ${token()}`,
      ...(options.body instanceof Blob ? {} : { "content-type": "application/json" }),
      ...(options.headers || {})
    }
  });
  const body = await response.json();
  if (!response.ok) throw body;
  return body;
}

function print(target, value) {
  target.textContent = JSON.stringify(value, null, 2);
}

function printError(target, error) {
  target.textContent = JSON.stringify(error, null, 2);
}

function syncRoleUi() {
  const current = tokenSelect.value;
  const copy = roleCopy[current] || roleCopy["demo-player-token"];
  rolePill.textContent = copy.label;
  roleHelper.textContent = copy.helper;
  roleTabs.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.token === current);
  });
}

tokenSelect.addEventListener("change", syncRoleUi);

roleTabs.forEach((button) => {
  button.addEventListener("click", () => {
    tokenSelect.value = button.dataset.token;
    syncRoleUi();
  });
});

document.getElementById("load-me").addEventListener("click", async () => {
  try {
    print(outputs.me, await api("/api/me"));
  } catch (error) {
    printError(outputs.me, error);
  }
});

document.getElementById("save-privacy").addEventListener("click", async () => {
  try {
    print(outputs.privacy, await api(`/api/parent/children/${PLAYER_ID}/privacy`, {
      method: "PATCH",
      body: JSON.stringify({
        visibility: document.getElementById("visibility-select").value,
        leaderboardParticipation: document.getElementById("leaderboard-consent").checked
      })
    }));
  } catch (error) {
    printError(outputs.privacy, error);
  }
});

document.getElementById("withdraw-performance").addEventListener("click", async () => {
  try {
    print(outputs.privacy, await api("/api/guardian/consents", {
      method: "POST",
      body: JSON.stringify({
        playerId: PLAYER_ID,
        scope: "performance_tracking",
        decision: "withdrawn"
      })
    }));
  } catch (error) {
    printError(outputs.privacy, error);
  }
});

document.getElementById("grant-performance").addEventListener("click", async () => {
  try {
    print(outputs.privacy, await api("/api/guardian/consents", {
      method: "POST",
      body: JSON.stringify({
        playerId: PLAYER_ID,
        scope: "performance_tracking",
        decision: "granted"
      })
    }));
  } catch (error) {
    printError(outputs.privacy, error);
  }
});

document.getElementById("submit-match").addEventListener("click", async () => {
  try {
    print(outputs.player, await api(`/api/players/${PLAYER_ID}/matches`, {
      method: "POST",
      body: JSON.stringify({
        goals: 1,
        assists: 1,
        minutes: 72,
        distanceKm: 8.4,
        effort: 4,
        result: "win"
      })
    }));
  } catch (error) {
    printError(outputs.player, error);
  }
});

document.getElementById("submit-training").addEventListener("click", async () => {
  try {
    print(outputs.player, await api(`/api/players/${PLAYER_ID}/trainings`, {
      method: "POST",
      body: JSON.stringify({
        type: "technical",
        durationMinutes: 65,
        focus: "PAS",
        effort: 4
      })
    }));
  } catch (error) {
    printError(outputs.player, error);
  }
});

document.getElementById("load-player").addEventListener("click", async () => {
  try {
    print(outputs.player, await api(`/api/players/${PLAYER_ID}`));
  } catch (error) {
    printError(outputs.player, error);
  }
});

document.getElementById("upload-media").addEventListener("click", async () => {
  const file = document.getElementById("media-file").files[0];
  if (!file) {
    outputs.media.textContent = "Choose a file first.";
    return;
  }
  try {
    const intent = await api("/api/media/upload-intents", {
      method: "POST",
      body: JSON.stringify({
        playerId: PLAYER_ID,
        category: document.getElementById("media-category").value,
        mimeType: file.type,
        sizeBytes: file.size,
        fileName: file.name,
        visibility: "private"
      })
    });
    const upload = await api(intent.uploadUrl, {
      method: "PUT",
      headers: { "content-type": file.type },
      body: file
    });
    print(outputs.media, { intent, upload });
  } catch (error) {
    printError(outputs.media, error);
  }
});

document.getElementById("load-leaderboard").addEventListener("click", async () => {
  try {
    print(outputs.audit, await api("/api/leaderboards?scope=region"));
  } catch (error) {
    printError(outputs.audit, error);
  }
});

document.getElementById("load-audit").addEventListener("click", async () => {
  const previous = tokenSelect.value;
  tokenSelect.value = "demo-admin-token";
  syncRoleUi();
  try {
    print(outputs.audit, await api("/api/audit-logs"));
  } catch (error) {
    printError(outputs.audit, error);
  } finally {
    tokenSelect.value = previous;
    syncRoleUi();
  }
});

syncRoleUi();
