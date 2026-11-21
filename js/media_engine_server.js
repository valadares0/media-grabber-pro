// =========================================================================
// Media Grabber Pro v4.5 - Local High-Speed Media Engine Server
// Powered by yt-dlp + ejs:github + ffmpeg for ALL YouTube Videos (including
// Kids/Protected, Lives, Shorts), Instagram, TikTok, Vimeo, Behance & Any Link
// Runs silently on http://127.0.0.1:48721
// =========================================================================

const http = require("http");
const { spawn } = require("child_process");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
const os = require("os");

const PORT = 48721;
const HOST = "127.0.0.1";

function loadOrCreateEngineToken() {
  const dir = path.join(os.homedir(), ".mediagrabber");
  const tokenFile = path.join(dir, "token");
  fs.mkdirSync(dir, { recursive: true });
  let tok = "";
  try {
    if (fs.existsSync(tokenFile)) tok = fs.readFileSync(tokenFile, "utf8").trim();
  } catch (_) {}
  if (!tok || tok.length < 24) {
    tok = crypto.randomBytes(32).toString("hex");
    fs.writeFileSync(tokenFile, tok, { mode: 0o600 });
  }
  try {
    fs.writeFileSync(path.join(__dirname, "engine_token.json"), JSON.stringify({ token: tok }), "utf8");
  } catch (_) {}
  return tok;
}
const ENGINE_TOKEN = loadOrCreateEngineToken();

const YTDLP_CANDIDATES = [
  path.join(os.homedir(), "AppData", "Local", "Programs", "Python", "Python312", "Scripts", "yt-dlp.exe"),
  path.join(os.homedir(), "AppData", "Local", "Programs", "Python", "Python311", "Scripts", "yt-dlp.exe"),
  path.join(os.homedir(), "AppData", "Roaming", "Python", "Python312", "Scripts", "yt-dlp.exe"),
  "/opt/homebrew/bin/yt-dlp",
  "/usr/local/bin/yt-dlp",
  "yt-dlp"
];

const FFMPEG_DIR_CANDIDATES = [
  path.join(os.homedir(), "AppData", "Local", "ffmpeg", "ffmpeg-master-latest-win64-gpl", "bin"),
  path.join(os.homedir(), "AppData", "Local", "Microsoft", "WinGet", "Links"),
  "/opt/homebrew/bin",
  "/usr/local/bin"
];

function resolveYtDlp() {
  for (const p of YTDLP_CANDIDATES) {
    if (p === "yt-dlp" || fs.existsSync(p)) return p;
  }
  return "yt-dlp";
}

function resolveFfmpegDir() {
  const exeName = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  for (const d of FFMPEG_DIR_CANDIDATES) {
    if (fs.existsSync(path.join(d, exeName))) return d;
  }
  return "";
}

const YTDLP_BIN = resolveYtDlp();
const FFMPEG_DIR = resolveFfmpegDir();
const DOWNLOADS_ROOT = path.join(os.homedir(), "Downloads", "MediaGrabber");

const jobs = new Map(); // jobId -> job state
const infoCache = new Map(); // url -> { timestamp, data }

function sanitizeName(str) {
  return (
    String(str || "midia")
      .replace(/[<>:"/\\|?*\x00-\x1F]+/g, "_")
      .replace(/\s+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 80) || "midia"
  );
}

function getDomain(urlStr) {
  try {
    return new URL(urlStr).hostname.replace(/^www\./, "");
  } catch (_) {
    return "Web";
  }
}

function parseFfmpegTime(timeStr) {
  if (!timeStr) return 0;
  const parts = timeStr.trim().split(":").map((n) => parseFloat(n) || 0);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return "0 KB";
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

// Run yt-dlp --dump-single-json with --remote-components ejs:github
function extractUrlInfoWithYtDlp(targetUrl) {
  return new Promise((resolve) => {
    const cached = infoCache.get(targetUrl);
    if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
      return resolve(cached.data);
    }

    const args = [
      "--js-runtimes",
      "node",
      "--remote-components",
      "ejs:github",
      "--dump-single-json",
      "--no-warnings",
      "--no-playlist",
      "--",
      targetUrl
    ];

    const proc = spawn(YTDLP_BIN, args, { windowsHide: true });
    let stdout = "";
    let killed = false;

    const timer = setTimeout(() => {
      killed = true;
      try {
        proc.kill();
      } catch (_) {}
      resolve(null);
    }, 22000);

    proc.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });

    proc.on("error", () => {
      clearTimeout(timer);
      resolve(null);
    });

    proc.on("close", (code) => {
      clearTimeout(timer);
      if (killed || code !== 0 || !stdout.trim()) {
        return resolve(null);
      }
      try {
        const info = JSON.parse(stdout.trim());
        infoCache.set(targetUrl, { timestamp: Date.now(), data: info });
        resolve(info);
      } catch (_) {
        resolve(null);
      }
    });
  });
}

// Fallback HTML scraper for non-video-platform URLs (portfolios, blogs, direct links)
async function scrapeGenericWebpage(targetUrl) {
  const items = [];
  try {
    const resp = await fetch(targetUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
      }
    });
    if (!resp.ok) return items;
    const ct = (resp.headers.get("content-type") || "").toLowerCase();
    const cl = parseInt(resp.headers.get("content-length") || "0", 10) || 0;

    if (ct.startsWith("video/") || /\.(mp4|m3u8|webm|mov)(\?|$)/i.test(targetUrl)) {
      items.push({
        id: "direct_vid_" + Date.now(),
        url: targetUrl,
        previewUrl: targetUrl.includes(".m3u8") ? "" : targetUrl,
        type: "video",
        ext: targetUrl.includes(".m3u8") ? "HLS" : "MP4",
        title: "Vídeo Direto (" + getDomain(targetUrl) + ")",
        quality: "1080p Full HD (Original)",
        resLabel: "1080p Full HD",
        size: cl,
        variants: [
          { label: "1080p Full HD (Original)", height: 1080, url: targetUrl, ext: "MP4" },
          { label: "720p HD", height: 720, url: targetUrl, ext: "MP4" }
        ]
      });
      return items;
    }

    if (ct.startsWith("image/") || /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(targetUrl)) {
      items.push({
        id: "direct_img_" + Date.now(),
        url: targetUrl,
        thumbnail: targetUrl,
        type: "image",
        ext: "JPG",
        title: "Imagem Direta (" + getDomain(targetUrl) + ")",
        quality: "Original (Máxima)",
        resLabel: "Original",
        size: cl,
        variants: [{ label: "Original (Máxima)", url: targetUrl, ext: "JPG" }]
      });
      return items;
    }

    const html = await resp.text();
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const pageTitle = titleMatch ? titleMatch[1].replace(/\s+/g, " ").trim().slice(0, 65) : getDomain(targetUrl);

    const seen = new Set();

    const vidRegex = /https?:\\?\/\\?\/[^"'\s<>\\]+\.(?:mp4|m3u8)(?:\?[^"'\s<>\\]*)?/gi;
    let m;
    let vCount = 0;
    while ((m = vidRegex.exec(html)) !== null) {
      const cleanUrl = m[0].replace(/\\\//g, "/");
      if (seen.has(cleanUrl)) continue;
      seen.add(cleanUrl);
      vCount++;
      items.push({
        id: "scraped_vid_" + vCount + "_" + Date.now(),
        url: cleanUrl,
        previewUrl: cleanUrl.includes(".m3u8") ? "" : cleanUrl,
        type: "video",
        ext: cleanUrl.includes(".m3u8") ? "HLS" : "MP4",
        title: `${pageTitle} - Vídeo ${vCount}`,
        quality: "1080p Full HD",
        resLabel: "1080p Full HD",
        variants: [
          { label: "1080p Full HD", height: 1080, url: cleanUrl, ext: "MP4" },
          { label: "720p HD", height: 720, url: cleanUrl, ext: "MP4" }
        ]
      });
    }

    const imgRegex = /https?:\\?\/\\?\/[^"'\s<>\\]+\.(?:jpg|jpeg|png|webp)(?:\?[^"'\s<>\\]*)?/gi;
    let iCount = 0;
    while ((m = imgRegex.exec(html)) !== null) {
      const cleanUrl = m[0].replace(/\\\//g, "/");
      const low = cleanUrl.toLowerCase();
      if (
        seen.has(cleanUrl) ||
        low.includes("avatar") ||
        low.includes("favicon") ||
        low.includes("icon") ||
        low.includes("logo") ||
        low.includes("sprite")
      ) {
        continue;
      }
      seen.add(cleanUrl);
      iCount++;
      if (iCount > 40) break;
      items.push({
        id: "scraped_img_" + iCount + "_" + Date.now(),
        url: cleanUrl,
        thumbnail: cleanUrl,
        type: "image",
        ext: low.includes(".png") ? "PNG" : "JPG",
        title: `${pageTitle} - Foto ${iCount}`,
        quality: "Alta Resolução",
        resLabel: "Original",
        variants: [{ label: "Original (Máxima)", url: cleanUrl, ext: "JPG" }]
      });
    }
  } catch (_) {}
  return items;
}

function buildItemFromYtDlpInfo(info, originalUrl) {
  const formats = Array.isArray(info.formats) ? info.formats : [];

  // Find a direct combined mp4 url (e.g. itag 18 on YouTube) for instant <video> preview in popup/studio
  let previewMp4 = "";
  const combinedMp4s = formats.filter(
    (f) =>
      f.url &&
      f.ext === "mp4" &&
      f.vcodec &&
      f.vcodec !== "none" &&
      f.acodec &&
      f.acodec !== "none" &&
      !String(f.protocol || "").includes("m3u8") &&
      !String(f.protocol || "").includes("dash")
  );
  if (combinedMp4s.length > 0) {
    combinedMp4s.sort((a, b) => (b.height || 0) - (a.height || 0));
    previewMp4 = combinedMp4s[0].url;
  }

  const heights = new Set();
  formats.forEach((f) => {
    if (f.height && f.vcodec && f.vcodec !== "none") {
      heights.add(f.height);
    }
  });

  const maxH = heights.size > 0 ? Math.max(...heights) : info.height || 1080;
  const pageUrl = info.webpage_url || originalUrl;
  const duration = Number(info.duration) || 0;
  const isLive = Boolean(info.is_live || info.live_status === "is_live" || info.live_status === "was_live");

  const thumb =
    info.thumbnail ||
    (info.id ? `https://i.ytimg.com/vi/${info.id}/hqdefault.jpg` : "");

  const approxSize = duration > 0 ? Math.round(duration * 350000) : 0;

  const variants = [
    {
      label: "1080p Full HD (MP4)",
      res: "1920×1080",
      height: 1080,
      url: pageUrl,
      ext: "MP4",
      isEngine: true
    },
    {
      label: "720p HD (MP4)",
      res: "1280×720",
      height: 720,
      url: pageUrl,
      ext: "MP4",
      isEngine: true
    },
    {
      label: "480p SD (MP4)",
      res: "854×480",
      height: 480,
      url: pageUrl,
      ext: "MP4",
      isEngine: true
    },
    {
      label: "360p Leve / Rápido (MP4)",
      res: "640×360",
      height: 360,
      url: pageUrl,
      ext: "MP4",
      isEngine: true
    }
  ];

  if (maxH >= 2160) {
    variants.unshift({
      label: "4K Ultra HD (2160p MP4)",
      res: "3840×2160",
      height: 2160,
      url: pageUrl,
      ext: "MP4",
      isEngine: true
    });
  }

  return {
    id: "yt_" + (info.id || Date.now()),
    key: "youtube_vid_" + (info.id || pageUrl),
    ytId: info.id || "",
    url: pageUrl,
    sourcePageUrl: pageUrl,
    previewUrl: previewMp4,
    thumbnail: thumb,
    duration,
    isLive,
    isEngine: true,
    type: "video",
    ext: "MP4",
    size: approxSize,
    width: info.width || 1920,
    height: info.height || 1080,
    dimensions: `${info.width || 1920}×${info.height || 1080}`,
    quality: variants[0].label,
    resLabel: variants[0].label,
    title: info.title || "Vídeo",
    variants,
    time: Date.now()
  };
}

// ---- Fila: no máx. MAX_PARALLEL downloads rodando; o resto espera (continua mesmo com a extensão fechada) ----
const MAX_PARALLEL = 3;
const pendingQueue = [];
function countRunning() {
  return [...new Set(jobs.values())].filter((j) => j.status === "running").length;
}
function startDownloadJob(opts) {
  const jobId = opts.jobId || "job_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
  opts.jobId = jobId;
  if (countRunning() < MAX_PARALLEL && pendingQueue.length === 0) return _startDownloadJobNow(opts);
  const job = {
    jobId, url: opts.url, status: "queued", pct: 0, downloadedBytes: 0, totalBytes: 0,
    statusText: "Na fila de downloads...", outputPath: "", filename: "", error: null
  };
  jobs.set(jobId, job);
  pendingQueue.push({ job, opts });
  return job;
}
setInterval(() => {
  while (pendingQueue.length && countRunning() < MAX_PARALLEL) {
    const { job, opts } = pendingQueue.shift();
    if (job.status !== "queued") continue; // cancelado enquanto esperava
    try {
      const runningJob = _startDownloadJobNow(opts);
      jobs.set(job.jobId, runningJob);
    } catch (e) {
      job.status = "error";
      job.error = e.message;
    }
  }
}, 700);

function _startDownloadJobNow(opts) {
  const jobId = opts.jobId || "job_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
  const url = String(opts.url || "").trim();
  const site = sanitizeName(opts.site || getDomain(url));
  const mode = opts.mode || "video_full";
  const height = Number(opts.height) || 1080;
  const startTime = opts.startTime !== undefined && opts.startTime !== null ? Number(opts.startTime) : null;
  const endTime = opts.endTime !== undefined && opts.endTime !== null ? Number(opts.endTime) : null;
  const isTrim = startTime !== null && endTime !== null && endTime > startTime;
  const clipDuration = isTrim ? Math.max(0.5, endTime - startTime) : 0;

  const isAudio = mode === "audio_only" || mode === "clip_audio";
  const isPhoto = mode === "photo_only";

  const subFolder = isAudio ? "Audios" : isPhoto ? "Fotos" : "Videos";
  const targetDir = path.join(DOWNLOADS_ROOT, subFolder, site);
  fs.mkdirSync(targetDir, { recursive: true });

  const prefix = opts.orderPrefix ? String(opts.orderPrefix) : "";
  const baseName = sanitizeName(prefix + (opts.filename || opts.title || "video"));
  const ext = isAudio ? "wav" : isPhoto ? "jpg" : "mp4";
  const finalPath = path.join(targetDir, `${baseName}.${ext}`);

  try {
    if (fs.existsSync(finalPath)) fs.unlinkSync(finalPath);
  } catch (_) {}

  const job = {
    jobId,
    url,
    status: "running",
    pct: 3,
    downloadedBytes: 0,
    totalBytes: 0,
    statusText: isTrim
      ? `Preparando corte HD (${startTime.toFixed(1)}s → ${endTime.toFixed(1)}s)...`
      : "Conectando ao stream em alta definição...",
    outputPath: finalPath,
    filename: `${baseName}.${ext}`,
    relativeChromePath: `MediaGrabber/${subFolder}/${site}/${baseName}.${ext}`,
    error: null
  };
  jobs.set(jobId, job);

  // Build yt-dlp arguments with --remote-components ejs:github & "--" before URL (safe for IDs starting with "-")
  const args = [
    "--js-runtimes",
    "node",
    "--remote-components",
    "ejs:github",
    "--no-playlist",
    "--newline",
    "--force-overwrites"
  ];
  if (FFMPEG_DIR) {
    args.push("--ffmpeg-location", FFMPEG_DIR);
  }

  if (isPhoto) {
    args.push(
      "--write-thumbnail",
      "--skip-download",
      "--convert-thumbnails",
      "jpg",
      "-o",
      path.join(targetDir, baseName)
    );
  } else if (isAudio) {
    args.push("-f", "bestaudio[protocol^=http]/bestaudio/best", "-x", "--audio-format", "wav", "--audio-quality", "0");
    if (isTrim) {
      args.push("--download-sections", `*${startTime}-${endTime}`);
    }
    args.push("-o", finalPath);
  } else {
    args.push("--concurrent-fragments", "4");
    if (mode === "video_only") {
      args.push(
        "-f",
        `bestvideo[height<=${height}][protocol^=http][ext=mp4]/bestvideo*[height<=${height}]/best*[height<=${height}]/best`
      );
    } else {
      // Prioritize H.264 (avc1) + AAC (m4a) over HTTP DASH for universal compatibility & 5x faster section seeking!
      args.push(
        "-f",
        `bestvideo[height<=${height}][vcodec^=avc1][protocol^=http]+bestaudio[protocol^=http][ext=m4a]/bestvideo[height<=${height}][protocol^=http][ext=mp4]+bestaudio[protocol^=http][ext=m4a]/bestvideo*[height<=${height}][protocol^=http]+bestaudio[protocol^=http]/bestvideo*[height<=${height}]+bestaudio/best*[height<=${height}]/best`
      );
    }
    args.push("--merge-output-format", "mp4");
    if (isTrim) {
      args.push("--download-sections", `*${startTime}-${endTime}`);
    }
    args.push("-o", finalPath);
  }

  args.push("--", url);

  const proc = spawn(YTDLP_BIN, args, { windowsHide: true });
  job._proc = proc;
  let lastStderrErr = "";

  function handleOutputLine(line) {
    const clean = line.trim();
    if (!clean) return;

    if (clean.startsWith("ERROR:")) {
      lastStderrErr = clean;
    }

    // 1. Parse standard yt-dlp progress
    const dlMatch = clean.match(/\[download\]\s+([\d.]+)%\s+of\s+~?\s*([\d.]+)(KiB|MiB|GiB)/i);
    if (dlMatch) {
      const pct = Math.min(99, Math.max(1, parseFloat(dlMatch[1]) || 0));
      const val = parseFloat(dlMatch[2]) || 0;
      const unit = dlMatch[3].toUpperCase();
      const mult = unit === "GIB" ? 1073741824 : unit === "MIB" ? 1048576 : 1024;
      const totBytes = Math.round(val * mult);
      const curBytes = Math.round(totBytes * (pct / 100));

      job.pct = pct;
      job.totalBytes = totBytes;
      job.downloadedBytes = curBytes;
      job.statusText = `Baixando: ${formatBytes(curBytes)} / ${formatBytes(totBytes)} (${Math.round(pct)}%)`;
      return;
    }

    // 2. Parse ffmpeg section cutting progress: frame= 1200 ... size= 8448KiB time=00:00:17.10
    const ffSizeMatch = clean.match(/size=\s*(\d+)KiB/i);
    const ffTimeMatch = clean.match(/time=\s*(\d+:\d+:\d+(?:\.\d+)?)/i);
    if (ffTimeMatch && isTrim && clipDuration > 0) {
      const curSec = parseFfmpegTime(ffTimeMatch[1]);
      const pct = Math.min(99, Math.max(5, Math.round((curSec / clipDuration) * 100)));
      const bytes = ffSizeMatch ? parseInt(ffSizeMatch[1], 10) * 1024 : job.downloadedBytes;
      job.pct = pct;
      job.downloadedBytes = bytes;
      job.statusText = `Cortando trecho HD: ${curSec.toFixed(1)}s / ${clipDuration.toFixed(1)}s (${formatBytes(bytes)})`;
      return;
    }

    if (clean.includes("[youtube]") && clean.includes("Downloading")) {
      job.pct = Math.max(job.pct, 6);
      job.statusText = "Extraindo stream de alta velocidade do YouTube...";
    } else if (clean.includes("[Merger]") || clean.includes("Merging formats")) {
      job.pct = Math.max(job.pct, 95);
      job.statusText = "Finalizando arquivo MP4 em alta definição...";
    } else if (clean.includes("[ExtractAudio]")) {
      job.pct = Math.max(job.pct, 92);
      job.statusText = "Convertendo áudio para WAV...";
    }
  }

  proc.stdout.on("data", (d) => {
    d.toString("utf8").split(/\r?\n|\r/).forEach(handleOutputLine);
  });

  proc.stderr.on("data", (d) => {
    d.toString("utf8").split(/\r?\n|\r/).forEach(handleOutputLine);
  });

  proc.on("error", (err) => {
    job.status = "error";
    job.error = err.message;
    job.statusText = "Erro ao executar motor local";
  });

  proc.on("close", (code) => {
    if (code === 0 && fs.existsSync(finalPath)) {
      const stat = fs.statSync(finalPath);
      job.downloadedBytes = stat.size;
      job.totalBytes = stat.size;
      job.pct = 100;
      job.status = "done";
      job.statusText = `✓ Salvo em Downloads (${formatBytes(stat.size)})!`;
    } else {
      const dirFiles = fs.readdirSync(targetDir);
      const found = dirFiles.find((f) => f.startsWith(baseName) && !f.endsWith(".part") && !f.endsWith(".ytdl"));
      if (found) {
        const altPath = path.join(targetDir, found);
        const stat = fs.statSync(altPath);
        job.outputPath = altPath;
        job.filename = found;
        job.downloadedBytes = stat.size;
        job.totalBytes = stat.size;
        job.pct = 100;
        job.status = "done";
        job.statusText = `✓ Salvo em Downloads (${formatBytes(stat.size)})!`;
      } else {
        job.status = "error";
        job.error = lastStderrErr || `Exit code ${code}`;
        job.statusText = "Erro ao processar stream.";
      }
    }
  });

  return job;
}

function sendJson(res, status, obj, req) {
  const origin = String(req?.headers?.origin || "");
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-MG-Token"
  };
  if (origin.startsWith("chrome-extension://")) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Vary"] = "Origin";
  }
  res.writeHead(status, headers);
  res.end(JSON.stringify(obj));
}

function readJsonBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (c) => {
      body += c.toString("utf8");
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch (_) {
        resolve({});
      }
    });
  });
}

const aiHandle = require("./ai_clips")({
  YTDLP_BIN, FFMPEG_DIR, DOWNLOADS_ROOT, jobs, sanitizeName, extractUrlInfoWithYtDlp
});

const server = http.createServer(async (req, res) => {
  const send = (status, obj) => sendJson(res, status, obj, req);
  if (req.method === "OPTIONS") {
    return send(200, { ok: true });
  }

  const parsedUrl = new URL(req.url, `http://${HOST}:${PORT}`);
  const pathname = parsedUrl.pathname;

  if (pathname === "/api/health" && req.method === "GET") {
    return send(200, {
      ok: true,
      version: "5.2.0",
      ytdlp: YTDLP_BIN,
      ffmpeg: FFMPEG_DIR
    });
  }

  const reqToken = String(req.headers["x-mg-token"] || "").trim();
  if (reqToken !== ENGINE_TOKEN) {
    return send(401, { ok: false, error: "Unauthorized: missing or invalid X-MG-Token" });
  }

  if (pathname === "/api/self-update" && req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      const extId = String(body.extId || "").trim();

      // Find the folder where the running extension lives (Opera GX, Chrome, or engine parent folder)
      function findExtensionDir(targetId) {
        const home = os.homedir();
        const candidatePrefs = [];

        // Mac Opera GX and Chrome paths
        candidatePrefs.push(
          path.join(home, "Library/Application Support/com.operasoftware.OperaGX/Default/Preferences"),
          path.join(home, "Library/Application Support/com.operasoftware.OperaGX/Preferences"),
          path.join(home, "Library/Application Support/Opera Software/Opera GX Stable/Preferences"),
          path.join(home, "Library/Application Support/Google/Chrome/Default/Preferences"),
          path.join(home, "Library/Application Support/Google/Chrome/Default/Secure Preferences")
        );

        // Windows Opera GX and Chrome paths
        const appData = process.env.APPDATA || "";
        const localAppData = process.env.LOCALAPPDATA || "";
        if (appData) {
          candidatePrefs.push(
            path.join(appData, "Opera Software/Opera GX Stable/Preferences"),
            path.join(appData, "Opera Software/Opera GX Stable/Secure Preferences")
          );
        }
        if (localAppData) {
          candidatePrefs.push(
            path.join(localAppData, "Google/Chrome/User Data/Default/Preferences"),
            path.join(localAppData, "Google/Chrome/User Data/Default/Secure Preferences")
          );
        }

        if (targetId) {
          for (const prefFile of candidatePrefs) {
            try {
              if (fs.existsSync(prefFile)) {
                const content = JSON.parse(fs.readFileSync(prefFile, "utf8"));
                const settings = content?.extensions?.settings || {};
                if (settings[targetId] && settings[targetId].path && fs.existsSync(settings[targetId].path)) {
                  return settings[targetId].path;
                }
              }
            } catch (_) {}
          }
        }
        return path.resolve(__dirname, "..");
      }

      const targetDir = findExtensionDir(extId);

      // If directory is a git repo, use git pull
      if (fs.existsSync(path.join(targetDir, ".git"))) {
        const gitProc = spawn("git", ["pull", "--autostash", "origin", "main"], { cwd: targetDir });
        let output = "";
        let errOutput = "";
        gitProc.stdout.on("data", (d) => { output += d.toString(); });
        gitProc.stderr.on("data", (d) => { errOutput += d.toString(); });
        gitProc.on("close", (code) => {
          if (code === 0) {
            send(200, { ok: true, path: targetDir, output: output.trim() || "Atualizado com sucesso via Git" });
          } else {
            send(500, { ok: false, path: targetDir, error: errOutput.trim() || `git pull falhou com código ${code}` });
          }
        });
        return;
      }

      // If not git repo (e.g. unzipped folder), download latest main zip from GitHub and unpack
      const tmpZip = path.join(os.tmpdir(), `mg_update_${Date.now()}.zip`);
      const tmpExtract = path.join(os.tmpdir(), `mg_extract_${Date.now()}`);
      fs.mkdirSync(tmpExtract, { recursive: true });

      const zipUrl = "https://codeload.github.com/valadares0/media-grabber-pro/zip/refs/heads/main";
      const https = require("https");
      const fileStream = fs.createWriteStream(tmpZip);
      https.get(zipUrl, (resStream) => {
        if (resStream.statusCode !== 200) {
          return send(500, { ok: false, error: `GitHub HTTP ${resStream.statusCode}` });
        }
        resStream.pipe(fileStream);
        fileStream.on("finish", () => {
          fileStream.close();
          // Extract with tar (available on Mac and Windows 10+)
          const tarProc = spawn("tar", ["-xf", tmpZip, "-C", tmpExtract]);
          tarProc.on("close", (tCode) => {
            try {
              if (tCode === 0) {
                const subDir = path.join(tmpExtract, "media-grabber-pro-main");
                const srcDir = fs.existsSync(subDir) ? subDir : tmpExtract;
                // Copy all files over targetDir, preserving local token
                fs.cpSync(srcDir, targetDir, {
                  recursive: true,
                  filter: (src) => !src.includes("engine_token.json")
                });
                try { fs.rmSync(tmpZip, { force: true }); } catch (_) {}
                try { fs.rmSync(tmpExtract, { recursive: true, force: true }); } catch (_) {}
                return send(200, { ok: true, path: targetDir, output: "Atualizado com sucesso via GitHub Zip" });
              }
              return send(500, { ok: false, error: `Falha ao descompactar atualização (tar code ${tCode})` });
            } catch (errCp) {
              return send(500, { ok: false, error: errCp.message });
            }
          });
        });
      }).on("error", (e) => {
        send(500, { ok: false, error: e.message });
      });
      return;
    } catch (e) {
      return send(500, { ok: false, error: e.message });
    }
  }

  try {
    if (await aiHandle(pathname, req, res, readJsonBody, (r, status, obj) => sendJson(r, status, obj, req))) return;
  } catch (e) {
    return send(500, { ok: false, error: e.message });
  }

  if (pathname === "/api/info" && req.method === "POST") {
    const body = await readJsonBody(req);
    const targetUrl = String(body.url || "").trim();
    if (!targetUrl || !targetUrl.startsWith("http")) {
      return send(400, { ok: false, error: "URL inválida" });
    }

    const ytInfo = await extractUrlInfoWithYtDlp(targetUrl);
    if (ytInfo && (ytInfo.id || ytInfo.url || ytInfo.formats)) {
      const item = buildItemFromYtDlpInfo(ytInfo, targetUrl);
      return send(200, { ok: true, items: [item], item });
    }

    const scraped = await scrapeGenericWebpage(targetUrl);
    return send(200, { ok: true, items: scraped, item: scraped[0] || null });
  }

  if (pathname === "/api/download" && req.method === "POST") {
    const body = await readJsonBody(req);
    if (!body.url) {
      return send(400, { ok: false, error: "URL ausente" });
    }
    const job = startDownloadJob(body);
    return send(200, { ok: true, jobId: job.jobId, job });
  }

  if (pathname.startsWith("/api/progress/") && req.method === "GET") {
    const jobId = pathname.replace("/api/progress/", "").trim();
    const job = jobs.get(jobId);
    if (!job) {
      return send(404, { ok: false, error: "Job não encontrado" });
    }
    return send(200, { ok: true, job });
  }

  if (pathname.startsWith("/api/cancel/") && req.method === "POST") {
    const jobId = pathname.replace("/api/cancel/", "").trim();
    const job = jobs.get(jobId);
    if (job) {
      if (job._proc && !job._proc.killed) {
        try { job._proc.kill("SIGKILL"); } catch (_) {}
      }
      job.status = "error";
      job.error = "Cancelado pelo usuário";
      job.statusText = "Download cancelado.";
      try {
        if (job.outputPath && fs.existsSync(job.outputPath)) fs.unlinkSync(job.outputPath);
      } catch (_) {}
    }
    return send(200, { ok: true, jobId, cancelled: true });
  }

  if (pathname === "/api/cancel-all" && req.method === "POST") {
    let count = 0;
    for (const [id, job] of jobs.entries()) {
      if (job.status === "running" || job.status === "queued") {
        if (job._proc && !job._proc.killed) {
          try { job._proc.kill("SIGKILL"); } catch (_) {}
        }
        job.status = "error";
        job.error = "Cancelado pelo usuário";
        job.statusText = "Cancelado.";
        try {
          if (job.outputPath && fs.existsSync(job.outputPath)) fs.unlinkSync(job.outputPath);
        } catch (_) {}
        count++;
      }
    }
    return send(200, { ok: true, cancelledCount: count });
  }

  if (pathname.startsWith("/api/file/") && req.method === "GET") {
    const jobId = pathname.replace("/api/file/", "").trim();
    const job = jobs.get(jobId);
    if (!job || !job.outputPath || !fs.existsSync(job.outputPath)) {
      res.writeHead(404);
      return res.end("Not found");
    }
    const stat = fs.statSync(job.outputPath);
    res.writeHead(200, {
      "Content-Type": job.filename.endsWith(".wav") ? "audio/wav" : "video/mp4",
      "Content-Length": stat.size,
      "Content-Disposition": `attachment; filename="${encodeURIComponent(job.filename)}"`,
      "Access-Control-Allow-Origin": "*"
    });
    fs.createReadStream(job.outputPath).pipe(res);
    return;
  }

  if (pathname === "/api/open-folder" && req.method === "POST") {
    const body = await readJsonBody(req);
    const rootResolved = path.resolve(DOWNLOADS_ROOT);
    fs.mkdirSync(rootResolved, { recursive: true });
    const cortesDir = path.join(rootResolved, "Videos", "Cortes_IA");
    let target = fs.existsSync(cortesDir) ? cortesDir : rootResolved;

    if (body.filePath) {
      const candidate = path.resolve(String(body.filePath));
      const rootCmp = rootResolved.toLowerCase();
      const candCmp = candidate.toLowerCase();
      if (candCmp !== rootCmp && !candCmp.startsWith(rootCmp + path.sep)) {
        return send(403, { ok: false, error: "Caminho fora da pasta de downloads permitida" });
      }
      if (fs.existsSync(candidate)) target = candidate;
    }

    try {
      const isFile = fs.existsSync(target) && fs.statSync(target).isFile();
      if (process.platform === "darwin") {
        const args = isFile ? ["-R", target] : [target];
        spawn("open", args, { detached: true, stdio: "ignore" }).unref();
      } else {
        const args = isFile ? ["/select,", target] : [target];
        spawn("explorer.exe", args, { detached: true, stdio: "ignore", windowsHide: true }).unref();
      }
    } catch (_) {}
    return send(200, { ok: true, path: target, downloadsRoot: DOWNLOADS_ROOT });
  }

  return send(404, { ok: false, error: "Not found" });
});

process.on("uncaughtException", (err) => {
  console.error("[UncaughtException]", err?.message || err);
});
process.on("unhandledRejection", (reason) => {
  console.error("[UnhandledRejection]", reason);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    process.exit(0);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Media Grabber Pro Engine v4.5 ativo em http://${HOST}:${PORT}`);
});
