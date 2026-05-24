import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import { exportJWK, generateKeyPair, SignJWT } from "jose";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for staging foundation smoke.");

const issuer = "https://local-smoke.auth0.test/";
const audience = "https://api.local-smoke.player-twin.test";
const subject = "auth0|synthetic-player";
const apiPort = Number(process.env.STAGING_SMOKE_PORT || 8896);

async function run(command, args, env = {}) {
  const child = spawn(command, args, {
    env: { ...process.env, ...env },
    stdio: "inherit"
  });
  const code = await new Promise((resolve) => child.on("exit", resolve));
  if (code !== 0) throw new Error(`${command} ${args.join(" ")} failed with exit code ${code}`);
}

async function waitFor(url, options = {}) {
  const deadline = Date.now() + 15000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, options);
      if (response.ok) return response;
      lastError = new Error(`${url} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(500);
  }
  throw lastError || new Error(`${url} was not ready`);
}

const { privateKey, publicKey } = await generateKeyPair("RS256");
const jwk = await exportJWK(publicKey);
jwk.kid = "local-staging-smoke";
jwk.alg = "RS256";
jwk.use = "sig";

const jwksServer = createServer((req, res) => {
  if (req.url === "/.well-known/jwks.json") {
    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ keys: [jwk] }));
    return;
  }
  res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  res.end("Not found");
});

await new Promise((resolve) => jwksServer.listen(0, "127.0.0.1", resolve));
const jwksPort = jwksServer.address().port;
const jwksUrl = `http://127.0.0.1:${jwksPort}/.well-known/jwks.json`;
const apiBaseUrl = `http://127.0.0.1:${apiPort}`;

const stagingEnv = {
  APP_ENV: "staging",
  NODE_ENV: "production",
  PORT: String(apiPort),
  APP_BASE_URL: apiBaseUrl,
  PUBLIC_WEB_ORIGIN: apiBaseUrl,
  CORS_ALLOWED_ORIGINS: apiBaseUrl,
  AUTH_PROVIDER: "auth0",
  AUTH_ISSUER: issuer,
  AUTH_AUDIENCE: audience,
  AUTH_JWKS_URL: jwksUrl,
  DATA_ADAPTER: "postgres",
  DATABASE_URL: databaseUrl,
  DATABASE_SSL_MODE: process.env.DATABASE_SSL_MODE || "disable",
  MEDIA_SCOPE: "profile_images",
  RELEASE_SHA: "local-staging-smoke",
  SEED_PLAYER_AUTH_SUB: subject
};

let apiProcess;
try {
  await run(process.execPath, ["scripts/migrate.mjs"], stagingEnv);
  await run(process.execPath, ["scripts/seed-postgres.mjs"], stagingEnv);

  apiProcess = spawn(process.execPath, ["server.mjs"], {
    env: { ...process.env, ...stagingEnv },
    stdio: ["ignore", "pipe", "pipe"]
  });
  apiProcess.stdout.on("data", (chunk) => process.stdout.write(chunk));
  apiProcess.stderr.on("data", (chunk) => process.stderr.write(chunk));

  await waitFor(`${apiBaseUrl}/api/ready`);

  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "RS256", kid: jwk.kid })
    .setIssuedAt()
    .setIssuer(issuer)
    .setAudience(audience)
    .setSubject(subject)
    .setExpirationTime("5m")
    .sign(privateKey);

  await waitFor(`${apiBaseUrl}/api/players/player_1`, {
    headers: { authorization: `Bearer ${token}` }
  });

  console.log(`Staging foundation smoke passed for ${apiBaseUrl}`);
} finally {
  if (apiProcess && !apiProcess.killed) {
    apiProcess.kill();
    await Promise.race([
      new Promise((resolve) => apiProcess.once("exit", resolve)),
      delay(3000)
    ]);
  }
  await new Promise((resolve) => jwksServer.close(resolve));
}
