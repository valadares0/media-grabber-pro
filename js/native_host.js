// =========================================================================
// Media Grabber Pro v4.5 - Chrome Native Messaging Host
// Automatically spawns media_engine_server.js on demand when Chrome needs it
// =========================================================================

const { spawn } = require("child_process");
const path = require("path");
const http = require("http");

const serverScript = path.join(__dirname, "media_engine_server.js");

function checkEngineHealth() {
  return new Promise((resolve) => {
    const req = http.get("http://127.0.0.1:48721/api/health", { timeout: 600 }, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function ensureEngineRunning() {
  const alive = await checkEngineHealth();
  if (alive) return true;

  try {
    const child = spawn(process.execPath, [serverScript], {
      detached: true,
      stdio: "ignore",
      windowsHide: true
    });
    child.unref();
  } catch (_) {}

  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 150));
    if (await checkEngineHealth()) return true;
  }
  return false;
}

function sendNativeReply(obj) {
  const buf = Buffer.from(JSON.stringify(obj), "utf8");
  const header = Buffer.alloc(4);
  header.writeUInt32LE(buf.length, 0);
  process.stdout.write(header);
  process.stdout.write(buf);
}

process.stdin.once("readable", async () => {
  const header = process.stdin.read(4);
  if (header && header.length === 4) {
    const len = header.readUInt32LE(0);
    process.stdin.read(len);
  }
  const ok = await ensureEngineRunning();
  sendNativeReply({ ok, port: 48721 });
  process.exit(0);
});
