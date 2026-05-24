import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRemoteJWKSet, jwtVerify } from "jose";
import pg from "pg";

const { Pool } = pg;

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const rootDir = resolve(__dirname);
const dataDir = join(rootDir, "runtime-data");
const uploadDir = join(dataDir, "uploads");
const dbPath = join(dataDir, "db.json");
const port = Number(process.env.PORT || 8888);
const appEnv = process.env.APP_ENV || "local";
const authProvider = process.env.AUTH_PROVIDER || "demo";
const dataAdapter = process.env.DATA_ADAPTER || "json";
const releaseSha = process.env.RELEASE_SHA || "local";
const strictEnvironment = ["staging", "production"].includes(appEnv);
const mediaScope = process.env.MEDIA_SCOPE || (strictEnvironment ? "profile_images" : "demo_all");
const bodyLimitJsonBytes = Number(process.env.BODY_LIMIT_JSON_BYTES || 64 * 1024);
const rateLimitWindowSeconds = Number(process.env.RATE_LIMIT_WINDOW_SECONDS || 60);
const rateLimitMaxRequests = Number(process.env.RATE_LIMIT_MAX_REQUESTS || (strictEnvironment ? 120 : 600));
const corsAllowedOrigins = new Set((process.env.CORS_ALLOWED_ORIGINS || "").split(",").map((origin) => origin.trim()).filter(Boolean));
const rateLimitStore = new Map();
let pgPool = null;
let auth0Jwks = null;

validateStartupConfig();

const roles = {
  player: "demo-player-token",
  parent: "demo-parent-token",
  coach: "demo-coach-token",
  admin: "demo-admin-token"
};

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml; charset=utf-8",
  ".md": "text/markdown; charset=utf-8"
};

function seedDb() {
  const now = new Date().toISOString();
  return {
    schemaVersion: "backend-demo-1.0.0",
    users: [
      { id: "user_player_1", externalAuthId: "auth0|synthetic-player", displayName: "Noam Levy", email: "player@example.test", roles: ["player"], token: roles.player, state: "active_private" },
      { id: "user_parent_1", externalAuthId: "auth0|synthetic-parent", displayName: "Dana Levy", email: "parent@example.test", roles: ["parent"], token: roles.parent, state: "active_private" },
      { id: "user_coach_1", externalAuthId: "auth0|synthetic-coach", displayName: "Coach Amir", email: "coach@example.test", roles: ["coach"], token: roles.coach, state: "active_private" },
      { id: "user_admin_1", externalAuthId: "auth0|synthetic-admin", displayName: "Platform Admin", email: "admin@example.test", roles: ["super_admin", "moderator"], token: roles.admin, state: "active_private" }
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

async function ensureDb() {
  if (dataAdapter === "postgres") return ensurePostgresDb();
  await mkdir(uploadDir, { recursive: true });
  try {
    return JSON.parse(await readFile(dbPath, "utf-8"));
  } catch {
    const db = seedDb();
    await saveDb(db);
    return db;
  }
}

async function saveDb(db) {
  if (dataAdapter === "postgres") return savePostgresDb(db);
  await mkdir(dataDir, { recursive: true });
  await writeFile(dbPath, JSON.stringify(db, null, 2), "utf-8");
}

function getPgPool() {
  if (!pgPool) {
    pgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_SSL_MODE === "require" ? { rejectUnauthorized: false } : undefined
    });
  }
  return pgPool;
}

async function ensurePostgresDb() {
  const pool = getPgPool();
  try {
    const result = await pool.query("select state from app_state where id = $1", ["default"]);
    if (result.rows[0]?.state) return result.rows[0].state;
    if (process.env.ALLOW_SYNTHETIC_SEED === "true") {
      const db = seedDb();
      await savePostgresDb(db);
      return db;
    }
    const error = new Error("PostgreSQL app_state row is missing. Run npm run seed:postgres with synthetic data.");
    error.code = "POSTGRES_STATE_NOT_SEEDED";
    throw error;
  } catch (error) {
    if (!error.code) error.code = "POSTGRES_NOT_READY";
    throw error;
  }
}

async function savePostgresDb(db) {
  const pool = getPgPool();
  await pool.query(
    `
      insert into app_state (id, state, updated_at)
      values ($1, $2::jsonb, now())
      on conflict (id)
      do update set state = excluded.state, updated_at = now()
    `,
    ["default", JSON.stringify(db)]
  );
}

function validateStartupConfig() {
  if (!strictEnvironment) return;
  const failures = [];
  if (authProvider === "demo") failures.push("AUTH_PROVIDER must not be demo when APP_ENV is staging or production.");
  if (dataAdapter === "json") failures.push("DATA_ADAPTER must not be json when APP_ENV is staging or production.");
  if (!process.env.APP_BASE_URL) failures.push("APP_BASE_URL is required when APP_ENV is staging or production.");
  if (!process.env.CORS_ALLOWED_ORIGINS) failures.push("CORS_ALLOWED_ORIGINS is required when APP_ENV is staging or production.");
  if (authProvider === "auth0") {
    for (const name of ["AUTH_ISSUER", "AUTH_AUDIENCE", "AUTH_JWKS_URL"]) {
      if (!process.env[name]) failures.push(`${name} is required for Auth0.`);
    }
  }
  if (dataAdapter === "postgres" && !process.env.DATABASE_URL) failures.push("DATABASE_URL is required for PostgreSQL.");
  if (failures.length) {
    throw new Error(`Invalid ${appEnv} configuration: ${failures.join(" ")}`);
  }
}

function securityHeaders() {
  const headers = {
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=()",
    "content-security-policy": "default-src 'self'; img-src 'self' data: blob:; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    "cross-origin-opener-policy": "same-origin",
    "cross-origin-resource-policy": "same-origin"
  };
  if (process.env.ENABLE_HSTS === "true") {
    headers["strict-transport-security"] = "max-age=31536000; includeSubDomains";
  }
  return headers;
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    ...securityHeaders(),
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(body);
}

function sendError(res, statusCode, code, message, requestId) {
  sendJson(res, statusCode, { error: { code, message, requestId } });
}

async function readJson(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > bodyLimitJsonBytes) {
      const error = new Error("JSON payload too large.");
      error.code = "PAYLOAD_TOO_LARGE";
      throw error;
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf-8"));
  } catch {
    const error = new Error("Request body must be valid JSON.");
    error.code = "BAD_JSON";
    throw error;
  }
}

async function readBuffer(req, maxBytes) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) {
      const error = new Error("Payload too large");
      error.code = "PAYLOAD_TOO_LARGE";
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function getAuth0Jwks() {
  if (!auth0Jwks) auth0Jwks = createRemoteJWKSet(new URL(process.env.AUTH_JWKS_URL));
  return auth0Jwks;
}

async function verifyAuth0Token(token) {
  if (!token) return { ok: false, statusCode: 401, code: "AUTH_REQUIRED", message: "Missing bearer token." };
  try {
    const { payload } = await jwtVerify(token, getAuth0Jwks(), {
      issuer: process.env.AUTH_ISSUER,
      audience: process.env.AUTH_AUDIENCE
    });
    return { ok: true, payload };
  } catch {
    return { ok: false, statusCode: 401, code: "AUTH_INVALID", message: "Invalid or expired bearer token." };
  }
}

async function requestContext(req, db, requestId) {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (strictEnvironment && authProvider === "demo") {
    return { requestId, user: null, demoAuthBlocked: true };
  }
  if (authProvider === "auth0") {
    const verification = await verifyAuth0Token(token);
    if (!verification.ok) return { requestId, user: null, authError: verification };
    const subject = verification.payload.sub;
    const user = db.users.find((candidate) => candidate.externalAuthId === subject) || null;
    if (!user) return { requestId, user: null, userNotProvisioned: true, authSubject: subject };
    return { requestId, user, authSubject: subject };
  }
  if (authProvider !== "demo") return { requestId, user: null, authProviderUnsupported: true };
  const user = db.users.find((candidate) => candidate.token === token) || null;
  return { requestId, user };
}

function requireAuth(ctx, res) {
  if (ctx.user) return true;
  if (ctx.demoAuthBlocked) {
    sendError(res, 401, "DEMO_AUTH_DISABLED", "Demo bearer tokens are disabled in staging and production.", ctx.requestId);
    return false;
  }
  if (ctx.authError) {
    sendError(res, ctx.authError.statusCode, ctx.authError.code, ctx.authError.message, ctx.requestId);
    return false;
  }
  if (ctx.userNotProvisioned) {
    sendError(res, 403, "USER_NOT_PROVISIONED", "Authenticated user is not provisioned in Player Twin.", ctx.requestId);
    return false;
  }
  if (ctx.authProviderUnsupported) {
    sendError(res, 501, "AUTH_PROVIDER_NOT_IMPLEMENTED", "Managed auth is configured but not implemented in this demo server.", ctx.requestId);
    return false;
  }
  sendError(res, 401, "AUTH_REQUIRED", "Missing or invalid bearer token.", ctx.requestId);
  return false;
}

function hasRole(user, role) {
  return user?.roles?.includes(role);
}

function playerById(db, playerId) {
  return db.playerProfiles.find((player) => player.id === playerId);
}

function guardianLinkFor(db, guardianUserId, playerUserId) {
  return db.guardianLinks.find((link) => link.guardianUserId === guardianUserId && link.playerUserId === playerUserId && link.status === "active");
}

function coachCanAccess(db, coachUserId, playerProfileId) {
  const playerMemberships = db.teamMemberships.filter((membership) => membership.playerProfileId === playerProfileId && membership.status === "guardian_approved");
  return playerMemberships.some((membership) =>
    db.coachAssignments.some((assignment) => assignment.coachUserId === coachUserId && assignment.teamId === membership.teamId && assignment.status === "active")
  );
}

function canAccessPlayer(db, user, player, write = false) {
  if (!user || !player) return false;
  if (player.userId === user.id) return true;
  if (guardianLinkFor(db, user.id, player.userId)) return true;
  if (!write && coachCanAccess(db, user.id, player.id)) return true;
  return hasRole(user, "super_admin") || hasRole(user, "moderator");
}

function activeConsent(db, player, scope) {
  const links = db.guardianLinks.filter((link) => link.playerUserId === player.userId && link.status === "active");
  return links.some((link) =>
    db.consents.some((consent) => consent.guardianLinkId === link.id && consent.scope === scope && consent.status === "granted")
  );
}

function audit(db, actor, action, resourceType, resourceId, metadata = {}) {
  db.auditLogs.push({
    id: randomUUID(),
    actorUserId: actor?.id || null,
    action,
    resourceType,
    resourceId,
    metadata,
    createdAt: new Date().toISOString()
  });
}

function statAverage(stats) {
  return Math.round(stats.PAC * 0.2 + stats.SHO * 0.22 + stats.PAS * 0.22 + stats.DEF * 0.14 + stats.PHY * 0.22);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function validateNumber(value, min, max, integer = false) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  if (integer && !Number.isInteger(parsed)) return null;
  if (parsed < min || parsed > max) return null;
  return parsed;
}

function publicPlayer(db, player, viewer) {
  const canSeeName = player.visibility !== "private" || player.userId === viewer?.id || guardianLinkFor(db, viewer?.id, player.userId) || hasRole(viewer, "super_admin");
  return {
    id: player.id,
    displayName: canSeeName ? player.displayName : "Private Player",
    birthYear: player.birthYear,
    sport: player.sport,
    position: player.position,
    region: player.region,
    visibility: player.visibility,
    stats: player.stats,
    ovr: statAverage(player.stats),
    xp: player.xp,
    weeklyGain: player.weeklyGain
  };
}

function leaderboardDisplayName(player) {
  if (player.visibility === "leaderboard_alias") return stablePlayerAlias(player.id);
  if (player.visibility === "private") return "Private Player";
  return player.displayName;
}

function stablePlayerAlias(playerId) {
  const digest = createHash("sha256").update(playerId).digest("hex");
  const number = (Number.parseInt(digest.slice(0, 6), 16) % 9000) + 1000;
  return `Player ${number}`;
}

async function checkAuth0Ready() {
  if (authProvider !== "auth0") return { ok: !strictEnvironment, details: { configured: authProvider } };
  try {
    const response = await fetch(process.env.AUTH_JWKS_URL, { method: "GET" });
    return { ok: response.ok, details: { configured: authProvider, jwksReachable: response.ok } };
  } catch {
    return { ok: false, details: { configured: authProvider, jwksReachable: false } };
  }
}

async function checkPostgresReady() {
  if (dataAdapter !== "postgres") return { ok: !strictEnvironment, details: { configured: dataAdapter } };
  try {
    const pool = getPgPool();
    await pool.query("select 1");
    const state = await pool.query("select 1 from app_state where id = $1", ["default"]);
    return { ok: state.rowCount === 1, details: { configured: dataAdapter, connected: true, syntheticStateSeeded: state.rowCount === 1 } };
  } catch {
    return { ok: false, details: { configured: dataAdapter, connected: false, syntheticStateSeeded: false } };
  }
}

async function readinessPayload() {
  let db = null;
  let stateError = null;
  try {
    db = await ensureDb();
  } catch (error) {
    stateError = error.code || "STATE_UNAVAILABLE";
  }
  const authCheck = await checkAuth0Ready();
  const postgresCheck = await checkPostgresReady();
  const checks = [
    { name: "runtime", ok: true, details: { appEnv, releaseSha, nodeEnv: process.env.NODE_ENV || "unset" } },
    { name: "data_adapter", ok: !strictEnvironment || dataAdapter === "postgres", details: { configured: dataAdapter } },
    { name: "auth_provider", ok: authCheck.ok, details: authCheck.details },
    { name: "postgres", ok: postgresCheck.ok, details: postgresCheck.details },
    { name: "app_state", ok: Boolean(db), details: { schemaVersion: db?.schemaVersion || null, error: stateError } },
    { name: "demo_database", ok: !strictEnvironment || dataAdapter !== "json", details: { path: dataAdapter === "json" ? dbPath : null } },
    { name: "media_scope", ok: mediaScope === "profile_images" || !strictEnvironment, details: { configured: mediaScope } },
    { name: "cors", ok: !strictEnvironment || corsAllowedOrigins.size > 0, details: { allowedOrigins: corsAllowedOrigins.size } }
  ];
  const ok = checks.every((check) => check.ok);
  return { ok, appEnv, releaseSha, checks, time: new Date().toISOString() };
}

async function handleApi(req, res, db, pathname, searchParams, requestId) {
  const ctx = await requestContext(req, db, requestId);
  res.setHeader("x-request-id", ctx.requestId);

  if (pathname === "/api/health") {
    return sendJson(res, 200, { ok: true, appEnv, releaseSha, schemaVersion: db.schemaVersion, time: new Date().toISOString() });
  }

  if (pathname === "/api/ready") {
    const payload = await readinessPayload();
    return sendJson(res, payload.ok ? 200 : 503, payload);
  }

  if (!requireAuth(ctx, res)) return;

  if (pathname === "/api/me" && req.method === "GET") {
    const linkedPlayers = db.playerProfiles.filter((player) => player.userId === ctx.user.id || guardianLinkFor(db, ctx.user.id, player.userId) || coachCanAccess(db, ctx.user.id, player.id));
    return sendJson(res, 200, { user: { id: ctx.user.id, displayName: ctx.user.displayName, roles: ctx.user.roles }, linkedPlayers: linkedPlayers.map((player) => publicPlayer(db, player, ctx.user)) });
  }

  if (pathname === "/api/players" && req.method === "GET") {
    const players = db.playerProfiles.filter((player) => canAccessPlayer(db, ctx.user, player, false));
    return sendJson(res, 200, { players: players.map((player) => publicPlayer(db, player, ctx.user)) });
  }

  const playerMatch = pathname.match(/^\/api\/players\/([^/]+)$/);
  if (playerMatch && req.method === "GET") {
    const player = playerById(db, playerMatch[1]);
    if (!player) return sendError(res, 404, "NOT_FOUND", "Player not found.", ctx.requestId);
    if (!canAccessPlayer(db, ctx.user, player, false)) return sendError(res, 403, "RELATIONSHIP_FORBIDDEN", "You cannot view this player.", ctx.requestId);
    return sendJson(res, 200, { player: publicPlayer(db, player, ctx.user), consents: consentSummary(db, player) });
  }

  const matchSubmit = pathname.match(/^\/api\/players\/([^/]+)\/matches$/);
  if (matchSubmit && req.method === "POST") {
    const player = playerById(db, matchSubmit[1]);
    if (!player) return sendError(res, 404, "NOT_FOUND", "Player not found.", ctx.requestId);
    if (!canAccessPlayer(db, ctx.user, player, true)) return sendError(res, 403, "RELATIONSHIP_FORBIDDEN", "You cannot submit for this player.", ctx.requestId);
    if (!activeConsent(db, player, "performance_tracking")) return sendError(res, 403, "CONSENT_REQUIRED", "Guardian consent is required for performance tracking.", ctx.requestId);

    const body = await readJson(req);
    const goals = validateNumber(body.goals, 0, 12, true);
    const assists = validateNumber(body.assists, 0, 12, true);
    const minutes = validateNumber(body.minutes, 1, 130, true);
    const distanceKm = validateNumber(body.distanceKm, 0, 20, false);
    const effort = validateNumber(body.effort, 3, 5, true);
    if ([goals, assists, minutes, distanceKm, effort].includes(null) || !["win", "draw", "loss"].includes(body.result)) {
      return sendError(res, 400, "VALIDATION_FAILED", "Invalid match payload.", ctx.requestId);
    }

    const xpAwarded = 50 + goals * 10 + assists * 8 + (body.result === "win" ? 10 : 0);
    player.stats.SHO = clamp(player.stats.SHO + goals * 0.65 + effort * 0.1, 1, 99);
    player.stats.PAS = clamp(player.stats.PAS + assists * 0.55, 1, 99);
    player.stats.PHY = clamp(player.stats.PHY + minutes / 160 + effort * 0.16, 1, 99);
    player.stats.PAC = clamp(player.stats.PAC + distanceKm / 28, 1, 99);
    player.xp += xpAwarded;
    player.weeklyGain += xpAwarded;

    const activity = {
      id: randomUUID(),
      playerProfileId: player.id,
      type: "match",
      source: "self_reported",
      verification: "unverified",
      payload: { goals, assists, minutes, distanceKm, effort, result: body.result },
      xpAwarded,
      createdAt: new Date().toISOString()
    };
    db.activities.unshift(activity);
    audit(db, ctx.user, "match_submitted", "activity_log", activity.id, { playerProfileId: player.id, xpAwarded });
    await saveDb(db);
    return sendJson(res, 201, { activity, player: publicPlayer(db, player, ctx.user) });
  }

  const trainingSubmit = pathname.match(/^\/api\/players\/([^/]+)\/trainings$/);
  if (trainingSubmit && req.method === "POST") {
    const player = playerById(db, trainingSubmit[1]);
    if (!player) return sendError(res, 404, "NOT_FOUND", "Player not found.", ctx.requestId);
    if (!canAccessPlayer(db, ctx.user, player, true)) return sendError(res, 403, "RELATIONSHIP_FORBIDDEN", "You cannot submit for this player.", ctx.requestId);
    if (!activeConsent(db, player, "performance_tracking")) return sendError(res, 403, "CONSENT_REQUIRED", "Guardian consent is required for performance tracking.", ctx.requestId);

    const body = await readJson(req);
    const durationMinutes = validateNumber(body.durationMinutes, 15, 180, true);
    const effort = validateNumber(body.effort, 3, 5, true);
    if (durationMinutes === null || effort === null || !["PAC", "SHO", "PAS", "DEF", "PHY"].includes(body.focus)) {
      return sendError(res, 400, "VALIDATION_FAILED", "Invalid training payload.", ctx.requestId);
    }

    const xpAwarded = 30 + Math.round(durationMinutes / 20) + effort * 3;
    player.stats[body.focus] = clamp(player.stats[body.focus] + 0.8 + durationMinutes / 150 + effort * 0.12, 1, 99);
    player.xp += xpAwarded;
    player.weeklyGain += xpAwarded;

    const activity = {
      id: randomUUID(),
      playerProfileId: player.id,
      type: "training",
      source: "self_reported",
      verification: "unverified",
      payload: { type: body.type || "technical", durationMinutes, focus: body.focus, effort },
      xpAwarded,
      createdAt: new Date().toISOString()
    };
    db.activities.unshift(activity);
    audit(db, ctx.user, "training_submitted", "activity_log", activity.id, { playerProfileId: player.id, xpAwarded });
    await saveDb(db);
    return sendJson(res, 201, { activity, player: publicPlayer(db, player, ctx.user) });
  }

  const privacyPatch = pathname.match(/^\/api\/parent\/children\/([^/]+)\/privacy$/);
  if (privacyPatch && req.method === "PATCH") {
    const player = playerById(db, privacyPatch[1]);
    if (!player) return sendError(res, 404, "NOT_FOUND", "Player not found.", ctx.requestId);
    if (!guardianLinkFor(db, ctx.user.id, player.userId) && !hasRole(ctx.user, "super_admin")) {
      return sendError(res, 403, "RELATIONSHIP_FORBIDDEN", "Only a linked parent can update privacy.", ctx.requestId);
    }
    const body = await readJson(req);
    if (["private", "parent_only", "team", "leaderboard_alias", "public_portfolio"].includes(body.visibility)) {
      player.visibility = body.visibility;
    }
    if (typeof body.leaderboardParticipation === "boolean") {
      setConsent(db, player, "leaderboard_participation", body.leaderboardParticipation ? "granted" : "withdrawn");
    }
    audit(db, ctx.user, "privacy_updated", "player_profile", player.id, body);
    await saveDb(db);
    return sendJson(res, 200, { player: publicPlayer(db, player, ctx.user), consents: consentSummary(db, player) });
  }

  if (pathname === "/api/guardian/consents" && req.method === "POST") {
    const body = await readJson(req);
    const player = playerById(db, body.playerId);
    if (!player) return sendError(res, 404, "NOT_FOUND", "Player not found.", ctx.requestId);
    if (!guardianLinkFor(db, ctx.user.id, player.userId) && !hasRole(ctx.user, "super_admin")) {
      return sendError(res, 403, "RELATIONSHIP_FORBIDDEN", "Only a linked parent can change consent.", ctx.requestId);
    }
    if (!["profile_basic", "performance_tracking", "leaderboard_participation", "media_upload", "team_sharing", "public_portfolio", "scout_discovery", "analytics_optional"].includes(body.scope)) {
      return sendError(res, 400, "VALIDATION_FAILED", "Invalid consent scope.", ctx.requestId);
    }
    setConsent(db, player, body.scope, body.decision === "withdrawn" ? "withdrawn" : "granted");
    audit(db, ctx.user, "consent_changed", "player_profile", player.id, { scope: body.scope, decision: body.decision });
    await saveDb(db);
    return sendJson(res, 200, { consents: consentSummary(db, player) });
  }

  if (pathname === "/api/leaderboards" && req.method === "GET") {
    const scope = searchParams.get("scope") || "region";
    const players = db.playerProfiles
      .filter((player) => activeConsent(db, player, "leaderboard_participation"))
      .map((player) => ({
        id: player.id,
        displayName: leaderboardDisplayName(player),
        position: player.position,
        region: player.region,
        ovr: statAverage(player.stats),
        weeklyGain: player.weeklyGain
      }))
      .filter((player) => scope !== "region" || player.region === "center")
      .sort((a, b) => b.weeklyGain - a.weeklyGain || b.ovr - a.ovr);
    return sendJson(res, 200, { scope, metric: "weekly_xp", players });
  }

  if (pathname === "/api/media/upload-intents" && req.method === "POST") {
    const body = await readJson(req);
    const player = playerById(db, body.playerId);
    if (!player) return sendError(res, 404, "NOT_FOUND", "Player not found.", ctx.requestId);
    if (!canAccessPlayer(db, ctx.user, player, false)) return sendError(res, 403, "RELATIONSHIP_FORBIDDEN", "You cannot upload for this player.", ctx.requestId);
    if (!activeConsent(db, player, "media_upload")) return sendError(res, 403, "CONSENT_REQUIRED", "Guardian consent is required for media upload.", ctx.requestId);

    const allowed = mediaPolicy(body.category, body.mimeType, Number(body.sizeBytes));
    if (!allowed.ok) return sendError(res, 400, "MEDIA_POLICY_REJECTED", allowed.message, ctx.requestId);

    const media = {
      id: randomUUID(),
      ownerPlayerProfileId: player.id,
      uploadedBy: ctx.user.id,
      category: body.category,
      status: "pending_upload",
      visibility: "private",
      objectKey: `${randomUUID()}-${safeFileName(body.fileName || "upload.bin")}`,
      mimeType: body.mimeType,
      sizeBytes: Number(body.sizeBytes),
      sha256: null,
      createdAt: new Date().toISOString()
    };
    db.mediaAssets.push(media);
    audit(db, ctx.user, "media_upload_intent_created", "media_asset", media.id, { category: media.category, sizeBytes: media.sizeBytes });
    await saveDb(db);
    return sendJson(res, 201, {
      mediaId: media.id,
      uploadUrl: `/api/media/${media.id}/upload`,
      requiredHeaders: { "content-type": media.mimeType },
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString()
    });
  }

  const mediaUpload = pathname.match(/^\/api\/media\/([^/]+)\/upload$/);
  if (mediaUpload && req.method === "PUT") {
    const media = db.mediaAssets.find((item) => item.id === mediaUpload[1]);
    if (!media) return sendError(res, 404, "NOT_FOUND", "Media asset not found.", ctx.requestId);
    const player = playerById(db, media.ownerPlayerProfileId);
    if (!canAccessPlayer(db, ctx.user, player, false)) return sendError(res, 403, "RELATIONSHIP_FORBIDDEN", "You cannot upload this media.", ctx.requestId);
    const requestContentType = String(req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
    if (requestContentType !== media.mimeType.toLowerCase()) {
      return sendError(res, 400, "MEDIA_POLICY_REJECTED", "Upload content-type does not match the upload intent.", ctx.requestId);
    }
    const buffer = await readBuffer(req, media.sizeBytes + 1);
    if (buffer.length !== media.sizeBytes) {
      return sendError(res, 400, "MEDIA_POLICY_REJECTED", "Uploaded byte length must match the upload intent.", ctx.requestId);
    }
    const hash = createHash("sha256").update(buffer).digest("hex");
    await writeFile(join(uploadDir, media.objectKey), buffer);
    media.sha256 = hash;
    media.status = "needs_parent_approval";
    media.uploadedAt = new Date().toISOString();
    audit(db, ctx.user, "media_uploaded", "media_asset", media.id, { sha256: hash, sizeBytes: buffer.length });
    await saveDb(db);
    return sendJson(res, 200, { media });
  }

  if (pathname === "/api/audit-logs" && req.method === "GET") {
    if (!hasRole(ctx.user, "super_admin") && !hasRole(ctx.user, "moderator")) {
      return sendError(res, 403, "ROLE_FORBIDDEN", "Admin role required.", ctx.requestId);
    }
    return sendJson(res, 200, { auditLogs: db.auditLogs.slice(-100).reverse() });
  }

  return sendError(res, 404, "NOT_FOUND", "Endpoint not found.", ctx.requestId);
}

function consentSummary(db, player) {
  const links = db.guardianLinks.filter((link) => link.playerUserId === player.userId && link.status === "active");
  const consents = db.consents.filter((consent) => links.some((link) => link.id === consent.guardianLinkId));
  return Object.fromEntries(consents.map((consent) => [consent.scope, consent.status]));
}

function setConsent(db, player, scope, status) {
  const link = db.guardianLinks.find((candidate) => candidate.playerUserId === player.userId && candidate.status === "active");
  if (!link) return;
  const existing = db.consents.find((consent) => consent.guardianLinkId === link.id && consent.scope === scope);
  const now = new Date().toISOString();
  if (existing) {
    existing.status = status;
    existing.withdrawnAt = status === "withdrawn" ? now : null;
    existing.grantedAt = status === "granted" ? now : existing.grantedAt;
    return;
  }
  db.consents.push({ id: randomUUID(), guardianLinkId: link.id, scope, status, consentVersion: "2026-05", grantedAt: status === "granted" ? now : null, withdrawnAt: status === "withdrawn" ? now : null });
}

function mediaPolicy(category, mimeType, sizeBytes) {
  if (mediaScope === "profile_images" && category !== "profile_image") {
    return { ok: false, message: "Only profile images are enabled in this environment." };
  }
  const policies = {
    profile_image: { mime: ["image/jpeg", "image/png", "image/webp"], max: 10 * 1024 * 1024 },
    match_clip: { mime: ["video/mp4", "video/quicktime"], max: 250 * 1024 * 1024 },
    training_clip: { mime: ["video/mp4", "video/quicktime"], max: 250 * 1024 * 1024 },
    achievement_document: { mime: ["application/pdf", "image/jpeg", "image/png"], max: 20 * 1024 * 1024 },
    team_document: { mime: ["application/pdf", "image/jpeg", "image/png"], max: 20 * 1024 * 1024 }
  };
  const policy = policies[category];
  if (!policy) return { ok: false, message: "Unsupported media category." };
  if (!policy.mime.includes(mimeType)) return { ok: false, message: "Unsupported file type for category." };
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > policy.max) return { ok: false, message: "File size exceeds policy." };
  return { ok: true };
}

function safeFileName(name) {
  return String(name).replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
}

async function serveStatic(req, res, pathname) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const safePath = normalize(decodeURIComponent(requested)).replace(/^(\.\.[/\\])+/, "");
  const filePath = resolve(join(rootDir, safePath));
  if (!filePath.startsWith(rootDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) throw new Error("not file");
    res.writeHead(200, {
      ...securityHeaders(),
      "content-type": mimeTypes[extname(filePath).toLowerCase()] || "application/octet-stream",
      "cache-control": "no-store"
    });
    createReadStream(filePath).pipe(res);
  } catch {
    res.writeHead(404, { ...securityHeaders(), "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
    res.end("Not found");
  }
}

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (!origin) return;
  const localPreviewOrigin = !strictEnvironment && /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin);
  if (corsAllowedOrigins.has(origin) || localPreviewOrigin) {
    res.setHeader("access-control-allow-origin", origin);
    res.setHeader("vary", "Origin");
    res.setHeader("access-control-allow-methods", "GET,POST,PATCH,PUT,OPTIONS");
    res.setHeader("access-control-allow-headers", "authorization,content-type,x-request-id");
    res.setHeader("access-control-max-age", "300");
  }
}

function rateLimit(req, res) {
  if (!req.url?.startsWith("/api/") || req.url.startsWith("/api/health")) return true;
  const now = Date.now();
  const windowMs = rateLimitWindowSeconds * 1000;
  const key = req.socket.remoteAddress || "unknown";
  const current = rateLimitStore.get(key);
  if (!current || current.resetAt <= now) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  current.count += 1;
  if (current.count <= rateLimitMaxRequests) return true;
  res.setHeader("retry-after", String(Math.ceil((current.resetAt - now) / 1000)));
  sendError(res, 429, "RATE_LIMITED", "Too many requests. Try again later.", res.getHeader("x-request-id"));
  return false;
}

function logEvent(level, event, fields = {}) {
  const payload = {
    level,
    event,
    service: "player-twin-api",
    appEnv,
    releaseSha,
    time: new Date().toISOString(),
    ...fields
  };
  const line = JSON.stringify(payload);
  if (level === "error") console.error(line);
  else console.log(line);
}

const server = createServer(async (req, res) => {
  const requestId = randomUUID();
  const startedAt = Date.now();
  let pathname = req.url || "/";
  res.setHeader("x-request-id", requestId);
  res.on("finish", () => {
    logEvent("info", "http_request", {
      requestId,
      method: req.method,
      path: pathname,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
      remoteAddressHash: createHash("sha256").update(req.socket.remoteAddress || "unknown").digest("hex").slice(0, 16)
    });
  });
  try {
    applyCors(req, res);
    const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
    pathname = url.pathname;
    if (req.method === "OPTIONS" && url.pathname.startsWith("/api/")) {
      res.writeHead(204, securityHeaders());
      res.end();
      return;
    }
    if (!rateLimit(req, res)) return;
    if (url.pathname === "/api/health") {
      return sendJson(res, 200, { ok: true, appEnv, releaseSha, time: new Date().toISOString() });
    }
    if (url.pathname === "/api/ready") {
      const payload = await readinessPayload();
      return sendJson(res, payload.ok ? 200 : 503, payload);
    }
    const db = await ensureDb();
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, db, url.pathname, url.searchParams, requestId);
      return;
    }
    await serveStatic(req, res, url.pathname);
  } catch (error) {
    const status = error.code === "PAYLOAD_TOO_LARGE" ? 413 : error.code === "BAD_JSON" ? 400 : error.code?.startsWith("POSTGRES_") ? 503 : 500;
    const code = error.code === "PAYLOAD_TOO_LARGE" ? "PAYLOAD_TOO_LARGE" : error.code === "BAD_JSON" ? "BAD_JSON" : error.code?.startsWith("POSTGRES_") ? error.code : "SERVER_ERROR";
    const message = error.code === "BAD_JSON" ? "Request body must be valid JSON." : error.message || "Unexpected server error.";
    logEvent("error", "request_failed", { requestId, code, status, message });
    sendError(res, status, code, message, requestId);
  }
});

server.listen(port, () => {
  logEvent("info", "server_started", { url: `http://127.0.0.1:${port}`, authProvider, dataAdapter, mediaScope });
  if (authProvider === "demo" && !strictEnvironment) {
    logEvent("info", "demo_tokens_enabled", { tokens: Object.keys(roles) });
  }
});
