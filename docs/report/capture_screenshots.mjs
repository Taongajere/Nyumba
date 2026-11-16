// Captures report screenshots from the running dev servers with headless Chrome.
//   node docs/report/capture_screenshots.mjs
// Needs: Django on :8000, Next.js on :3000, demo data from `manage.py seed_demo`.
// Passwords are read from backend/DEMO_ACCOUNTS.local.md at runtime (never stored here).
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const out = join(here, "screenshots");
mkdirSync(out, { recursive: true });

const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const WEB = "http://localhost:3000";
const API = "http://127.0.0.1:8000";

const accounts = Object.fromEntries(
  [...readFileSync(join(root, "backend", "DEMO_ACCOUNTS.local.md"), "utf8").matchAll(/\*\*(\w+)\*\* \(\w+\): `([^`]+)`/g)].map((m) => [m[1], m[2]])
);

async function token(username) {
  const res = await fetch(`${API}/api/auth/login/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login: username, password: accounts[username] }),
  });
  if (!res.ok) throw new Error(`login ${username}: ${res.status}`);
  return (await res.json()).token;
}

const SHOTS = [
  { user: null, path: "/login", file: "01-login" },
  { user: "thandiwe", path: "/", file: "02-explore-map", wait: 9000 },
  { user: "thandiwe", path: "/properties", file: "03-properties-grid" },
  { user: "thandiwe", path: "/listings/22", file: "04-listing-detail" },
  { user: "thandiwe", path: "/boarding-houses", file: "05-boarding-search", wait: 9000 },
  { user: "thandiwe", path: "/boarding-houses/1", file: "06-boarding-detail" },
  { user: "thandiwe", path: "/bookings", file: "07-my-bookings" },
  { user: "thandiwe", path: "/bookings/2", file: "08-booking-detail" },
  { user: "thandiwe", path: "/payments", file: "09-payments" },
  { user: "thandiwe", path: "/become-provider", file: "10-become-provider" },
  { user: "thandiwe", path: "/favourites", file: "11-favourites" },
  { user: "mwansa_rooms", path: "/provider", file: "12-provider-dashboard" },
  { user: "mwansa_rooms", path: "/provider/boarding", file: "13-provider-boarding" },
  { user: "mwansa_rooms", path: "/provider/boarding/1", file: "14-provider-rooms" },
  { user: "chanda_homes", path: "/provider/earnings", file: "15-provider-earnings" },
  { user: "chanda_homes", path: "/provider/analytics", file: "16-provider-analytics" },
  { user: "chanda_homes", path: "/provider/properties", file: "17-provider-properties" },
  { user: "nyumba_admin", path: "/admin", file: "18-admin-overview" },
  { user: "nyumba_admin", path: "/admin/applications", file: "19-admin-applications" },
  { user: "nyumba_admin", path: "/admin/listings", file: "20-admin-listings" },
  { user: "nyumba_admin", path: "/admin/finance", file: "21-admin-finance" },
  { user: "nyumba_admin", path: "/admin/settings", file: "22-admin-commission" },
  { user: "thandiwe", path: "/", file: "23-mobile-explore", mobile: true, wait: 7000 },
  { user: "mwansa_rooms", path: "/provider", file: "24-mobile-provider", mobile: true },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = mkdtempSync(join(tmpdir(), "nyumba-shots-"));
const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=9333", `--user-data-dir=${profile}`, "--hide-scrollbars", "about:blank"], { stdio: "ignore" });

let ws;
let seq = 0;
const pending = new Map();
function send(method, params = {}, sessionId) {
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params, sessionId }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

try {
  let version;
  for (let i = 0; i < 40 && !version; i++) {
    await sleep(250);
    version = await fetch("http://127.0.0.1:9333/json/version").then((r) => r.json()).catch(() => null);
  }
  ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result);
    }
  };
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  await send("Page.enable", {}, sessionId);
  await send("Network.enable", {}, sessionId);

  const tokens = {};
  for (const shot of SHOTS) {
    await send("Network.clearBrowserCookies", {}, sessionId);
    if (shot.user) {
      tokens[shot.user] ??= await token(shot.user);
      await send("Network.setCookie", { name: "nyumba_token", value: tokens[shot.user], domain: "localhost", path: "/", httpOnly: true }, sessionId);
    }
    const [w, h] = shot.mobile ? [390, 844] : [1440, 900];
    await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: shot.mobile ? 2 : 1, mobile: Boolean(shot.mobile) }, sessionId);
    await send("Page.navigate", { url: WEB + shot.path }, sessionId);
    await sleep(shot.wait ?? 5000);
    const { data } = await send("Page.captureScreenshot", { format: "png" }, sessionId);
    writeFileSync(join(out, `${shot.file}.png`), Buffer.from(data, "base64"));
    console.log("saved", shot.file);
  }
} finally {
  ws?.close();
  chrome.kill();
}
