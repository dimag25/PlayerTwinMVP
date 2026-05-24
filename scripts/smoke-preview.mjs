const baseUrl = process.env.SMOKE_BASE_URL || `http://127.0.0.1:${process.env.PORT || 8888}`;
const token = process.env.SMOKE_TOKEN || "demo-player-token";

async function check(name, path, options = {}) {
  const response = await fetch(new URL(path, baseUrl), {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(options.auth === false ? {} : { authorization: `Bearer ${token}` })
    }
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${name} failed: ${response.status} ${body}`);
  }
  return response;
}

await check("health", "/api/health", { auth: false });
await check("ready", "/api/ready", { auth: false });
await check("index", "/index.html", { auth: false });
await check("player API", "/api/players/player_1");

console.log(`Smoke checks passed for ${baseUrl}`);
