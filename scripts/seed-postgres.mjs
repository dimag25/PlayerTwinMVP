import { randomUUID } from "node:crypto";
import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required.");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL_MODE === "require" ? { rejectUnauthorized: false } : undefined
});

function syntheticState() {
  const now = new Date().toISOString();
  return {
    schemaVersion: "backend-demo-1.0.0",
    users: [
      { id: "user_player_1", externalAuthId: process.env.SEED_PLAYER_AUTH_SUB || "auth0|synthetic-player", displayName: "Noam Levy", email: "player@example.test", roles: ["player"], token: "demo-player-token", state: "active_private" },
      { id: "user_parent_1", externalAuthId: process.env.SEED_PARENT_AUTH_SUB || "auth0|synthetic-parent", displayName: "Dana Levy", email: "parent@example.test", roles: ["parent"], token: "demo-parent-token", state: "active_private" },
      { id: "user_coach_1", externalAuthId: process.env.SEED_COACH_AUTH_SUB || "auth0|synthetic-coach", displayName: "Coach Amir", email: "coach@example.test", roles: ["coach"], token: "demo-coach-token", state: "active_private" },
      { id: "user_admin_1", externalAuthId: process.env.SEED_ADMIN_AUTH_SUB || "auth0|synthetic-admin", displayName: "Platform Admin", email: "admin@example.test", roles: ["super_admin", "moderator"], token: "demo-admin-token", state: "active_private" }
    ],
    playerProfiles: [
      {
        id: "player_1",
        userId: "user_player_1",
        displayName: "Noam L.",
        birthYear: 2010,
        sport: "football",
        position: "CAM",
        region: "center",
        visibility: "private",
        stats: { PAC: 82, SHO: 78, PAS: 81, DEF: 70, PHY: 78 },
        xp: 820,
        weeklyGain: 42
      }
    ],
    guardianLinks: [
      { id: "guardian_link_1", guardianUserId: "user_parent_1", playerUserId: "user_player_1", status: "active", approvedAt: now }
    ],
    consents: [
      { id: randomUUID(), guardianLinkId: "guardian_link_1", scope: "profile_basic", status: "granted", consentVersion: "2026-05", grantedAt: now },
      { id: randomUUID(), guardianLinkId: "guardian_link_1", scope: "performance_tracking", status: "granted", consentVersion: "2026-05", grantedAt: now },
      { id: randomUUID(), guardianLinkId: "guardian_link_1", scope: "leaderboard_participation", status: "granted", consentVersion: "2026-05", grantedAt: now },
      { id: randomUUID(), guardianLinkId: "guardian_link_1", scope: "media_upload", status: "granted", consentVersion: "2026-05", grantedAt: now }
    ],
    teams: [
      { id: "team_1", name: "Central Academy U16", sport: "football", region: "center" }
    ],
    coachAssignments: [
      { id: "coach_assignment_1", coachUserId: "user_coach_1", teamId: "team_1", status: "active" }
    ],
    teamMemberships: [
      { id: "membership_1", playerProfileId: "player_1", teamId: "team_1", status: "guardian_approved" }
    ],
    activities: [
      { id: randomUUID(), playerProfileId: "player_1", type: "training", source: "self_reported", verification: "unverified", payload: { focus: "PAS", durationMinutes: 65, effort: 4 }, xpAwarded: 30, createdAt: now },
      { id: randomUUID(), playerProfileId: "player_1", type: "match", source: "self_reported", verification: "unverified", payload: { goals: 1, assists: 1, minutes: 72, distanceKm: 8.4, effort: 4, result: "win" }, xpAwarded: 50, createdAt: now }
    ],
    mediaAssets: [],
    auditLogs: [],
    productEvents: []
  };
}

try {
  const state = syntheticState();
  await pool.query(
    `
      insert into app_state (id, state, updated_at)
      values ($1, $2::jsonb, now())
      on conflict (id)
      do update set state = excluded.state, updated_at = now()
    `,
    ["default", JSON.stringify(state)]
  );
  console.log("Seeded synthetic PostgreSQL app state.");
} finally {
  await pool.end();
}
