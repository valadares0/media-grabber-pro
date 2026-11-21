// =========================================================================
// Media Grabber Pro v4.0 - Popup, Paste-Link Scanner & Video Trimmer Studio
// Features:
// - Instant YouTube (Videos, Lives, Shorts) Detection & SPA Reset
// - Direct Paste-Link Bar (🔗 Colar Link -> Scan or Cut any URL directly)
// - 4-Tier Fail-Safe Video Trimmer & Downloader:
//   * Tier 0: Local High-Speed Media Engine (yt-dlp + ffmpeg on 127.0.0.1:48721)
//   * Tier 1: Lossless HLS (.m3u8) Segment Slicer
//   * Tier 2: Same-Origin MP4 Blob Recorder
// - Zero console.error / console.warn to keep Chrome Extensions Error Log 100% clean
// =========================================================================

const ENGINE_BASE = "http://127.0.0.1:48721";

let allMedia = [];
let currentFilter = "all";
let activeTabId = null;
let currentSiteName = "Web";
let selectedIds = new Set();

// Studio State
let studioVideos = [];
let activeStudioItem = null;
let studioDuration = 30;
let trimStart = 0;
let trimEnd = 10;
let studioHlsSegments = [];
let isPlayingCutLoop = false;
let userEditedClipName = false;
let seekBridgeBusy = false;
let pendingBridgeSeek = null;

// DOM Elements - Scanner View
const scannerView = document.getElementById("scannerView");
const studioView = document.getElementById("studioView");
const mediaListEl = document.getElementById("mediaList");
const siteHostEl = document.getElementById("siteHost");
const scanBtn = document.getElementById("scanBtn");
const autoScrollBtn = document.getElementById("autoScrollBtn");
const openStudioBtn = document.getElementById("openStudioBtn");
const downloadAllBtn = document.getElementById("downloadAllBtn");

// DOM Elements - Paste Link Bar
const togglePasteLinkBtn = document.getElementById("togglePasteLinkBtn");
const pasteLinkPanel = document.getElementById("pasteLinkPanel");
const pasteClipboardBtn = document.getElementById("pasteClipboardBtn");
const pasteUrlInput = document.getElementById("pasteUrlInput");
const scanUrlBtn = document.getElementById("scanUrlBtn");
const cutUrlBtn = document.getElementById("cutUrlBtn");
const pasteLinkStatus = document.getElementById("pasteLinkStatus");

const selectAllCheck = document.getElementById("selectAllCheck");
const selectedCountEl = document.getElementById("selectedCount");
const autoNumberCheck = document.getElementById("autoNumberCheck");
const hdOnlyCheck = document.getElementById("hdOnlyCheck");
const openFolderTopBtn = document.getElementById("openFolderTopBtn");

const batchProgressWrap = document.getElementById("batchProgressWrap");
const batchProgressLabel = document.getElementById("batchProgressLabel");
const batchProgressPct = document.getElementById("batchProgressPct");
const batchProgressFill = document.getElementById("batchProgressFill");

const countAllEl = document.getElementById("countAll");
const countVideoEl = document.getElementById("countVideo");
const countImageEl = document.getElementById("countImage");
const countAudioEl = document.getElementById("countAudio");

// DOM Elements - Studio View
const backToListBtn = document.getElementById("backToListBtn");
const studioVideoSelect = document.getElementById("studioVideoSelect");
const captureStudioFrameBtn = document.getElementById("captureStudioFrameBtn");
const expandFullTabBtn = document.getElementById("expandFullTabBtn");
const studioVideo = document.getElementById("studioVideo");
const studioBridgeImg = document.getElementById("studioBridgeImg");
const studioSceneBadge = document.getElementById("studioSceneBadge");
const studioResolutionTag = document.getElementById("studioResolutionTag");

const tlStartLabel = document.getElementById("tlStartLabel");
const tlEndLabel = document.getElementById("tlEndLabel");
const tlCutDuration = document.getElementById("tlCutDuration");
const tlEstWeight = document.getElementById("tlEstWeight");
const timelineTrack = document.getElementById("timelineTrack");
const timelineSelectedBar = document.getElementById("timelineSelectedBar");
const timelinePlayhead = document.getElementById("timelinePlayhead");
const needleStart = document.getElementById("needleStart");
const needleEnd = document.getElementById("needleEnd");
const tooltipStart = document.getElementById("tooltipStart");
const tooltipEnd = document.getElementById("tooltipEnd");

const inputStartTime = document.getElementById("inputStartTime");
const inputEndTime = document.getElementById("inputEndTime");
const setStartCurrentBtn = document.getElementById("setStartCurrentBtn");
const setEndCurrentBtn = document.getElementById("setEndCurrentBtn");
const previewCutLoopBtn = document.getElementById("previewCutLoopBtn");
const studioTotalDurationLabel = document.getElementById("studioTotalDurationLabel");

const studioClipName = document.getElementById("studioClipName");
const studioResSelect = document.getElementById("studioResSelect");
const studioModeSelect = document.getElementById("studioModeSelect");
const saveTrimmedClipBtn = document.getElementById("saveTrimmedClipBtn");
const studioProgressWrap = document.getElementById("studioProgressWrap");
const studioProgressStatus = document.getElementById("studioProgressStatus");
const studioProgressPct = document.getElementById("studioProgressPct");
const studioProgressFill = document.getElementById("studioProgressFill");

// DOM Elements - Modal
const previewModal = document.getElementById("previewModal");
const modalBackdrop = document.getElementById("modalBackdrop");
const modalBody = document.getElementById("modalBody");
const modalTitle = document.getElementById("modalTitle");
const modalBadge = document.getElementById("modalBadge");
const modalSnapFrameBtn = document.getElementById("modalSnapFrameBtn");
const modalOpenTrimmerBtn = document.getElementById("modalOpenTrimmerBtn");
const modalQualitySelect = document.getElementById("modalQualitySelect");
const modalDownloadBtn = document.getElementById("modalDownloadBtn");
const closeModalBtn = document.getElementById("closeModalBtn");

// =========================================================================
// FORMATTING & TIME HELPERS
// =========================================================================

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return "";
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  const kb = bytes / 1024;
  return `${kb.toFixed(0)} KB`;
}

function formatTime(sec) {
  const s = Math.max(0, Number(sec) || 0);
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = Math.floor(s % 60);
  const tenths = Math.floor((s - Math.floor(s)) * 10);
  if (hrs > 0) {
    return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${tenths}`;
  }
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${tenths}`;
}

function formatTimeForFilename(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${String(mins).padStart(2, "0")}m${String(secs).padStart(2, "0")}s`;
}

function parseTimeInput(str, maxDur) {
  if (!str) return 0;
  const clean = String(str).trim().replace(",", ".");
  const parts = clean.split(":").map((p) => parseFloat(p) || 0);
  let total = 0;
  if (parts.length === 3) {
    total = parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    total = parts[0] * 60 + parts[1];
  } else {
    total = parseFloat(clean) || 0;
  }
  return Math.max(0, Math.min(total, maxDur || 99999));
}

function sanitizeFileName(name) {
  return (
    (name || "midia")
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
      .replace(/\s+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 75) || "midia"
  );
}

function isPlatformUrl(urlStr) {
  if (!urlStr) return false;
  return /(youtube\.com\/(watch|shorts|live)|youtu\.be\/|instagram\.com\/(p|reel|tv)|tiktok\.com\/|vimeo\.com\/|twitter\.com\/|x\.com\/|twitch\.tv\/|facebook\.com\/)/i.test(
    urlStr
  );
}

function getPlayableVideoUrl(item, selectedUrl) {
  if (item.previewUrl && !item.previewUrl.includes(".m3u8")) return item.previewUrl;
  if (selectedUrl && !selectedUrl.includes(".m3u8") && !isPlatformUrl(selectedUrl) && !item.isEngine) {
    return selectedUrl;
  }
  const mp4Variant = (item.variants || []).find(
    (v) => v.url && !v.url.includes(".m3u8") && !v.isEngine && !isPlatformUrl(v.url)
  );
  return mp4Variant ? mp4Variant.url : "";
}

// =========================================================================
// LOCAL HIGH-SPEED MEDIA ENGINE CLIENT (127.0.0.1:48721)
// =========================================================================

let _engineToken = null;
async function getEngineToken() {
  if (_engineToken) return _engineToken;
  try {
    const r = await fetch(chrome.runtime.getURL("js/engine_token.json"));
    if (r.ok) {
      const j = await r.json();
      _engineToken = j?.token || "";
    }
  } catch (_) {}
  return _engineToken || "";
}

async function runLocalEngineDownload(payload, onProgress) {
  try {
    const h = await fetch(`${ENGINE_BASE}/api/health`);
    if (!h.ok) throw new Error("not ok");
  } catch (_) {
    if (onProgress) onProgress(2, "Iniciando motor de vídeo local...", 0, 0);
    await chrome.runtime.sendMessage({ action: "ENSURE_ENGINE" }).catch(() => {});
  }

  const token = await getEngineToken();
  const authHeaders = token ? { "X-MG-Token": token } : {};

  const startResp = await fetch(`${ENGINE_BASE}/api/download`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders },
    body: JSON.stringify(payload)
  });
  if (!startResp.ok) {
    throw new Error("Engine HTTP " + startResp.status);
  }
  const startData = await startResp.json();
  if (!startData.ok || !startData.jobId) {
    throw new Error(startData.error || "Falha ao iniciar job");
  }

  const jobId = startData.jobId;
  await trackBgJob({ jobId, title: payload.title || payload.filename || "Download", startedAt: Date.now() });
  try {
    while (true) {
      await new Promise((r) => setTimeout(r, 400));
      const progResp = await fetch(`${ENGINE_BASE}/api/progress/${jobId}`, { headers: authHeaders });
      if (!progResp.ok) throw new Error("Job perdido");
      const progData = await progResp.json();
      const job = progData.job;
      if (!job) throw new Error("Job inválido");

      if (onProgress) {
        onProgress(job.pct || 0, job.statusText || "Processando...", job.downloadedBytes || 0, job.totalBytes || 0);
      }

      if (job.status === "done") {
        return job;
      }
      if (job.status === "error") {
        throw new Error(job.error || "Erro no download");
      }
    }
  } finally {
    await untrackBgJob(jobId);
  }
}

// =========================================================================
// TAREFAS EM SEGUNDO PLANO: o motor local continua baixando/cortando mesmo
// com o popup fechado. Aqui só guardamos o jobId para retomar o progresso.
// =========================================================================
const BG_JOBS_KEY = "mg_active_jobs";

async function trackBgJob(entry) {
  try {
    const { [BG_JOBS_KEY]: list = [] } = await chrome.storage.local.get(BG_JOBS_KEY);
    const next = list.filter((j) => j.jobId !== entry.jobId && Date.now() - (j.startedAt || 0) < 6 * 3600 * 1000);
    next.push(entry);
    await chrome.storage.local.set({ [BG_JOBS_KEY]: next });
  } catch (_) {}
}

async function untrackBgJob(jobId) {
  try {
    const { [BG_JOBS_KEY]: list = [] } = await chrome.storage.local.get(BG_JOBS_KEY);
    await chrome.storage.local.set({ [BG_JOBS_KEY]: list.filter((j) => j.jobId !== jobId) });
  } catch (_) {}
}

async function resumeBgJobs() {
  let list = [];
  try {
    ({ [BG_JOBS_KEY]: list = [] } = await chrome.storage.local.get(BG_JOBS_KEY));
  } catch (_) { return; }
  if (!list.length) return;

  let box = document.getElementById("bgJobs");
  if (!box) {
    box = document.createElement("div");
    box.id = "bgJobs";
    box.className = "bg-jobs";
    const header = document.querySelector("header.header");
    if (header && header.parentNode) header.parentNode.insertBefore(box, header.nextSibling);
    else document.body.prepend(box);
  }
  box.innerHTML = "";

  const token = await getEngineToken();
  const headers = token ? { "X-MG-Token": token } : {};

  if (list.length > 1) {
    const headerRow = document.createElement("div");
    headerRow.className = "bg-jobs-header";
    headerRow.innerHTML = `<span>Downloads em Segundo Plano (${list.length})</span>`;
    const cancelAllBtn = document.createElement("button");
    cancelAllBtn.className = "btn-cancel-all";
    cancelAllBtn.textContent = "✕ Cancelar Todos";
    cancelAllBtn.onclick = async () => {
      cancelAllBtn.disabled = true;
      cancelAllBtn.textContent = "Cancelando...";
      try {
        await fetch(`${ENGINE_BASE}/api/cancel-all`, { method: "POST", headers });
      } catch (_) {}
      for (const e of list) {
        await untrackBgJob(e.jobId);
      }
      box.innerHTML = "";
    };
    headerRow.appendChild(cancelAllBtn);
    box.appendChild(headerRow);
  }

  for (const entry of list) {
    const row = document.createElement("div");
    row.className = "bg-job";
    const top = document.createElement("div");
    top.className = "bg-job-top";
    const title = document.createElement("span");
    title.className = "bg-job-title";
    title.textContent = entry.title;
    
    const right = document.createElement("div");
    right.style.display = "flex";
    right.style.alignItems = "center";
    right.style.gap = "6px";

    const pct = document.createElement("b");
    pct.textContent = "…";

    const cancelJobBtn = document.createElement("button");
    cancelJobBtn.className = "btn-cancel-job";
    cancelJobBtn.title = "Cancelar este download";
    cancelJobBtn.textContent = "✕";
    cancelJobBtn.onclick = async (e) => {
      e.stopPropagation();
      cancelJobBtn.disabled = true;
      try {
        await fetch(`${ENGINE_BASE}/api/cancel/${entry.jobId}`, { method: "POST", headers });
      } catch (_) {}
      await untrackBgJob(entry.jobId);
      row.remove();
      if (!box.querySelectorAll(".bg-job").length) box.innerHTML = "";
    };

    right.append(pct, cancelJobBtn);
    top.append(title, right);

    const bar = document.createElement("div");
    bar.className = "bg-job-bar";
    const fill = document.createElement("div");
    fill.className = "bg-job-fill";
    bar.appendChild(fill);
    const status = document.createElement("div");
    status.style.marginTop = "4px";
    status.textContent = "Continuando em segundo plano...";
    row.append(top, bar, status);
    box.appendChild(row);

    (async () => {
      while (true) {
        let job = null;
        try {
          const r = await fetch(`${ENGINE_BASE}/api/progress/${entry.jobId}`, { headers });
          if (r.ok) job = (await r.json()).job;
        } catch (_) {}
        if (!job) {
          status.textContent = "Tarefa não encontrada (motor reiniciado).";
          row.classList.add("error");
          await untrackBgJob(entry.jobId);
          return;
        }
        fill.style.width = `${job.pct || 0}%`;
        pct.textContent = `${Math.round(job.pct || 0)}%`;
        status.textContent = job.statusText || "Processando...";
        if (job.status === "done" || job.status === "error") {
          row.classList.add(job.status);
          cancelJobBtn.remove();
          if (job.status === "error") status.textContent = job.error || "falha";
          if (job.status === "done" && job.outputPath) {
            const open = document.createElement("button");
            open.className = "btn-icon";
            open.style.marginTop = "5px";
            open.textContent = "📁 Abrir pasta";
            open.onclick = () => chrome.runtime.sendMessage({ action: "OPEN_DOWNLOAD_FOLDER", filePath: job.outputPath });
            row.appendChild(open);
          }
          await untrackBgJob(entry.jobId);
          return;
        }
        await new Promise((res) => setTimeout(res, 800));
      }
    })();
  }
}

// =========================================================================
// SISTEMA DE ATUALIZAÇÃO AUTOMÁTICA EM 1 CLIQUE NA EXTENSÃO
// =========================================================================
const GITHUB_REPO = "valadares0/media-grabber-pro";
const CURRENT_VERSION = chrome.runtime.getManifest()?.version || "5.0.0";

function isNewerVersion(remote, local) {
  const r = String(remote || "").replace(/^v/, "").split(".").map(Number);
  const l = String(local || "").replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < Math.max(r.length, l.length); i++) {
    const rv = r[i] || 0;
    const lv = l[i] || 0;
    if (rv > lv) return true;
    if (rv < lv) return false;
  }
  return false;
}

async function checkForExtensionUpdates() {
  try {
    const rawUrl = `https://raw.githubusercontent.com/${GITHUB_REPO}/main/manifest.json?_t=${Date.now()}`;
    const resp = await fetch(rawUrl, { cache: "no-store" });
    if (!resp.ok) return;
    const remoteManifest = await resp.json();
    const remoteVer = remoteManifest.version;

    if (isNewerVersion(remoteVer, CURRENT_VERSION)) {
      showUpdateBanner(remoteVer);
    }
  } catch (_) {}
}

function showUpdateBanner(newVersion) {
  if (document.getElementById("updateBanner")) return;

  const banner = document.createElement("div");
  banner.id = "updateBanner";
  banner.className = "update-banner";

  banner.innerHTML = `
    <div class="update-banner-info">
      <span class="update-banner-icon">⚡</span>
      <div class="update-banner-text">
        Nova versão <b>v${newVersion}</b> disponível!
      </div>
    </div>
    <button id="btnUpdateNow" class="btn-update-now">🔄 Atualizar Agora</button>
  `;

  const header = document.querySelector("header.header");
  if (header && header.parentNode) {
    header.parentNode.insertBefore(banner, header.nextSibling);
  } else {
    document.body.prepend(banner);
  }

  const updateBtn = banner.querySelector("#btnUpdateNow");
  updateBtn.onclick = async () => {
    updateBtn.disabled = true;
    updateBtn.textContent = "⏳ Atualizando...";

    const token = await getEngineToken();
    const headers = { "Content-Type": "application/json", ...(token ? { "X-MG-Token": token } : {}) };

    try {
      const r = await fetch(`${ENGINE_BASE}/api/self-update`, {
        method: "POST",
        headers
      });

      if (r.ok) {
        updateBtn.textContent = "✓ Atualizado! Reiniciando...";
        setTimeout(() => {
          chrome.runtime.reload();
          window.close();
        }, 800);
      } else {
        throw new Error("Falha no motor local");
      }
    } catch (_) {
      // Se o motor local não estiver rodando no momento, instrui ou recarrega
      updateBtn.textContent = "🔄 Recarregando...";
      setTimeout(() => {
        chrome.runtime.reload();
        window.location.reload();
      }, 500);
    }
  };
}

resumeBgJobs();
checkForExtensionUpdates();

// =========================================================================
// AUDIO WAV ENCODER (Full or Trimmed [startSec, endSec])
// =========================================================================

function audioBufferToWavBlob(buffer, startSec = 0, endSec = null) {
  const numOfChan = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const startSample = Math.max(0, Math.floor(startSec * sampleRate));
  const endSample = endSec ? Math.min(buffer.length, Math.floor(endSec * sampleRate)) : buffer.length;
  const frameCount = Math.max(1, endSample - startSample);

  const length = frameCount * numOfChan * 2 + 44;
  const out = new ArrayBuffer(length);
  const view = new DataView(out);
  const channels = [];
  let pos = 0;

  function setUint16(data) {
    view.setUint16(pos, data, true);
    pos += 2;
  }
  function setUint32(data) {
    view.setUint32(pos, data, true);
    pos += 4;
  }

  setUint32(0x46464952); // "RIFF"
  setUint32(length - 8);
  setUint32(0x45564157); // "WAVE"
  setUint32(0x20746d66); // "fmt "
  setUint32(16);
  setUint16(1);
  setUint16(numOfChan);
  setUint32(sampleRate);
  setUint32(sampleRate * 2 * numOfChan);
  setUint16(numOfChan * 2);
  setUint16(16);
  setUint32(0x61746164); // "data"
  setUint32(length - pos - 4);

  for (let i = 0; i < numOfChan; i++) {
    channels.push(buffer.getChannelData(i));
  }

  for (let offset = startSample; offset < endSample; offset++) {
    for (let i = 0; i < numOfChan; i++) {
      let sample = Math.max(-1, Math.min(1, channels[i][offset]));
      sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
      view.setInt16(pos, sample, true);
      pos += 2;
    }
  }
  return new Blob([out], { type: "audio/wav" });
}

// =========================================================================
// HLS (.M3U8) INSPECTOR & SEGMENT SLICER WITH QUERY TOKEN PRESERVATION
// =========================================================================

async function parseHlsMediaSegments(m3u8Url) {
  const resp = await fetch(m3u8Url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const text = await resp.text();
  const queryPart = m3u8Url.includes("?") ? m3u8Url.slice(m3u8Url.indexOf("?")) : "";
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (text.includes("#EXT-X-STREAM-INF")) {
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith("#EXT-X-STREAM-INF") && lines[i + 1] && !lines[i + 1].startsWith("#")) {
        let subUrl = new URL(lines[i + 1], m3u8Url).href;
        if (queryPart && !subUrl.includes("?")) subUrl += queryPart;
        return parseHlsMediaSegments(subUrl);
      }
    }
  }

  const segments = [];
  let cursor = 0;
  let nextDur = 4.0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("#EXTINF:")) {
      const m = line.match(/#EXTINF:([\d.]+)/i);
      nextDur = m ? parseFloat(m[1]) || 4.0 : 4.0;
    } else if (!line.startsWith("#")) {
      const segUrl = new URL(line, m3u8Url).href;
      const altUrl = queryPart && !segUrl.includes("?") ? segUrl + queryPart : "";
      segments.push({
        start: cursor,
        end: cursor + nextDur,
        duration: nextDur,
        url: segUrl,
        altUrl
      });
      cursor += nextDur;
    }
  }

  return {
    totalDuration: cursor,
    segments
  };
}

async function fetchHlsBuffer(m3u8Url, onProgress, rangeStartSec = null, rangeEndSec = null) {
  const parsed = await parseHlsMediaSegments(m3u8Url);
  let targetSegments = parsed.segments;

  if (rangeStartSec !== null && rangeEndSec !== null && targetSegments.length > 0) {
    targetSegments = targetSegments.filter((seg) => seg.end > rangeStartSec && seg.start < rangeEndSec);
    if (targetSegments.length === 0) {
      targetSegments = [parsed.segments[0]];
    }
  }

  const chunks = [];
  let downloadedBytes = 0;
  for (let i = 0; i < targetSegments.length; i++) {
    let segResp = await fetch(targetSegments[i].url);
    if (!segResp.ok && targetSegments[i].altUrl) {
      segResp = await fetch(targetSegments[i].altUrl);
    }
    if (segResp.ok) {
      const buf = await segResp.arrayBuffer();
      chunks.push(buf);
      downloadedBytes += buf.byteLength;
    }
    if (onProgress) {
      const pct = Math.round(((i + 1) / targetSegments.length) * 100);
      onProgress(pct, downloadedBytes, 0, i + 1, targetSegments.length);
    }
  }
  if (chunks.length === 0) {
    throw new Error("Sem dados nos segmentos HLS");
  }
  return { chunks, downloadedBytes };
}

async function fetchDirectWithProgress(primaryUrl, onProgress, fallbackUrl = "") {
  let resp = await fetch(primaryUrl).catch(() => null);
  if ((!resp || !resp.ok) && fallbackUrl && fallbackUrl !== primaryUrl) {
    resp = await fetch(fallbackUrl);
  }
  if (!resp || !resp.ok) {
    throw new Error(`HTTP ${resp ? resp.status : "Network"}`);
  }

  const totalBytes = parseInt(resp.headers.get("content-length") || "0", 10) || 0;

  if (!resp.body) {
    const buf = await resp.arrayBuffer();
    if (onProgress) onProgress(100, buf.byteLength, buf.byteLength);
    return new Blob([buf], { type: resp.headers.get("content-type") || "video/mp4" });
  }

  const reader = resp.body.getReader();
  const chunks = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.byteLength;
    if (onProgress) {
      const pct = totalBytes > 0 ? Math.min(99, Math.round((received / totalBytes) * 100)) : 50;
      onProgress(pct, received, totalBytes);
    }
  }
  if (onProgress) onProgress(100, received, totalBytes || received);
  return new Blob(chunks, { type: resp.headers.get("content-type") || "video/mp4" });
}

async function recordTrimmedClipFromBlob(videoBlob, startSec, endSec, onProgress) {
  const localBlobUrl = URL.createObjectURL(videoBlob);
  const offVid = document.createElement("video");
  offVid.muted = false;
  offVid.volume = 0.01;
  offVid.playsInline = true;
  offVid.preload = "auto";
  offVid.src = localBlobUrl;

  try {
    await new Promise((resolve, reject) => {
      offVid.onloadedmetadata = resolve;
      offVid.onerror = reject;
      setTimeout(resolve, 2500);
    });

    const dur = Number.isFinite(offVid.duration) && offVid.duration > 0 ? offVid.duration : endSec;
    const actualStart = Math.max(0, Math.min(startSec, dur - 0.2));
    const actualEnd = Math.min(dur, Math.max(endSec, actualStart + 0.3));
    const clipLen = Math.max(0.3, actualEnd - actualStart);

    offVid.currentTime = actualStart;
    await new Promise((resolve) => {
      offVid.onseeked = resolve;
      setTimeout(resolve, 600);
    });

    const stream = offVid.captureStream ? offVid.captureStream() : offVid.mozCaptureStream();
    const mime = MediaRecorder.isTypeSupported("video/mp4;codecs=avc1,mp4a.40.2")
      ? "video/mp4;codecs=avc1,mp4a.40.2"
      : MediaRecorder.isTypeSupported("video/mp4")
      ? "video/mp4"
      : MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
      ? "video/webm;codecs=vp9,opus"
      : "video/webm";

    const recChunks = [];
    const recorder = new MediaRecorder(stream, {
      mimeType: mime,
      videoBitsPerSecond: 8000000
    });

    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) recChunks.push(ev.data);
    };

    const stopPromise = new Promise((resolve) => {
      recorder.onstop = resolve;
    });

    recorder.start(150);
    await offVid.play().catch(() => {});

    const startedAt = Date.now();
    while (offVid.currentTime < actualEnd && !offVid.ended) {
      const elapsed = offVid.currentTime - actualStart;
      const pct = Math.min(99, Math.max(1, Math.round((elapsed / clipLen) * 100)));
      if (onProgress) {
        onProgress(pct, formatTime(offVid.currentTime), formatTime(actualEnd));
      }
      if ((Date.now() - startedAt) / 1000 > clipLen + 3) break;
      await new Promise((r) => setTimeout(r, 120));
    }

    offVid.pause();
    if (recorder.state !== "inactive") {
      recorder.stop();
    }
    await stopPromise;

    const ext = mime.includes("mp4") ? "mp4" : "webm";
    return {
      blob: new Blob(recChunks, { type: mime }),
      ext
    };
  } finally {
    offVid.pause();
    offVid.removeAttribute("src");
    URL.revokeObjectURL(localBlobUrl);
  }
}

// =========================================================================
// DOWNLOAD EXECUTION WITH VISUAL PROGRESS BAR
// =========================================================================

async function executeDownload(item, chosenVariant, mode, buttonEl, progressRefs, orderIndex) {
  const targetUrl = chosenVariant ? chosenVariant.url : item.url;
  const fallbackUrl = item.previewUrl || item.url;
  const resLabel = chosenVariant ? chosenVariant.label : item.resLabel || "Original";
  const originalText = buttonEl ? buttonEl.textContent : "⬇ Baixar";
  const prefix =
    autoNumberCheck && autoNumberCheck.checked && orderIndex ? `${String(orderIndex).padStart(2, "0")}_` : "";
  const safeName = prefix + sanitizeFileName(item.title);

  function setProgress(pct, statusText) {
    if (progressRefs && progressRefs.wrap) {
      progressRefs.wrap.classList.remove("hidden");
      progressRefs.fill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
      progressRefs.pct.textContent = `${Math.round(pct)}%`;
      progressRefs.status.textContent = statusText;
    }
    if (buttonEl) {
      buttonEl.textContent = `⏳ ${Math.round(pct)}%`;
    }
  }

  try {
    if (buttonEl) buttonEl.disabled = true;
    setProgress(2, "Iniciando download...");

    let savedDownloadId = null;
    let savedFilePath = null;

    const useEngine =
      Boolean(
        item.isEngine ||
        (chosenVariant && chosenVariant.isEngine) ||
        isPlatformUrl(targetUrl) ||
        item.type === "video" ||
        targetUrl.includes(".m3u8")
      ) && mode !== "photo_only";

    if (useEngine) {
      let engineJob = null;
      try {
        engineJob = await runLocalEngineDownload(
          {
            url: item.sourcePageUrl || targetUrl,
            title: item.title,
            filename: sanitizeFileName(item.title),
            site: currentSiteName,
            mode,
            height: (chosenVariant && chosenVariant.height) || 1080,
            orderPrefix: prefix
          },
          (pct, statusText) => {
            setProgress(pct, statusText);
          }
        );
        savedFilePath = engineJob.outputPath;
        setProgress(100, engineJob.statusText || "✓ Download concluído!");
      } catch (engineErr) {
        // Se falhar o motor local (ex: no Mac antes de iniciar motor), cai no fallback do navegador
        engineJob = null;
      }
      if (engineJob) {
        if (buttonEl) {
          buttonEl.textContent = "✓ Salvo!";
          buttonEl.classList.add("done");
        }
        if (progressRefs && progressRefs.openFolderBtn) {
          progressRefs.openFolderBtn.classList.remove("hidden");
          progressRefs.openFolderBtn.onclick = (e) => {
            e.stopPropagation();
            chrome.runtime.sendMessage({
              action: "OPEN_DOWNLOAD_FOLDER",
              filePath: savedFilePath
            });
          };
        }
        return;
      }
    } else if (mode === "photo_only") {
      setProgress(40, "Preparando imagem em alta definição...");
      if (item.type === "video") {
        const photoUrl = item.thumbnail || "";
        if (photoUrl.startsWith("data:image/")) {
          savedDownloadId = await chrome.downloads.download({
            url: photoUrl,
            filename: `MediaGrabber/Fotos/${currentSiteName}/${safeName}_Capa.jpg`,
            saveAs: false
          });
        } else if (photoUrl.startsWith("http")) {
          const res = await chrome.runtime.sendMessage({
            action: "DOWNLOAD",
            url: photoUrl,
            title: `${item.title}_Capa`,
            type: "image",
            site: currentSiteName,
            orderPrefix: autoNumberCheck.checked ? orderIndex : null,
            forceExt: "jpg"
          });
          savedDownloadId = res && res.downloadId;
        }
      } else {
        const res = await chrome.runtime.sendMessage({
          action: "DOWNLOAD",
          item,
          url: targetUrl,
          title: item.title,
          type: "image",
          site: currentSiteName,
          orderPrefix: autoNumberCheck.checked ? orderIndex : null,
          resLabel
        });
        savedDownloadId = res && res.downloadId;
      }
      setProgress(100, "✓ Foto salva com sucesso!");
    } else if (mode === "audio_only") {
      setProgress(15, "Extraindo faixa de áudio...");
      const playUrl = getPlayableVideoUrl(item, targetUrl);
      let arrayBuf;
      if (playUrl && !playUrl.includes(".m3u8")) {
        const blob = await fetchDirectWithProgress(
          playUrl,
          (pct, rec, tot) => {
            setProgress(
              Math.round(pct * 0.75),
              `Baixando áudio: ${formatBytes(rec)}${tot ? " / " + formatBytes(tot) : ""}`
            );
          },
          fallbackUrl
        );
        arrayBuf = await blob.arrayBuffer();
      } else {
        const hlsTarget = targetUrl.includes(".m3u8") ? targetUrl : item.masterUrl || targetUrl;
        const { chunks } = await fetchHlsBuffer(hlsTarget, (pct, rec) => {
          setProgress(Math.round(pct * 0.75), `Baixando stream de áudio: ${formatBytes(rec)}`);
        });
        arrayBuf = await new Blob(chunks).arrayBuffer();
      }

      setProgress(85, "Convertendo áudio para WAV de alta qualidade...");
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const decoded = await audioCtx.decodeAudioData(arrayBuf.slice(0));
      const wavBlob = audioBufferToWavBlob(decoded);
      const blobUrl = URL.createObjectURL(wavBlob);
      savedDownloadId = await chrome.downloads.download({
        url: blobUrl,
        filename: `MediaGrabber/Audios/${currentSiteName}/${safeName}_Audio.wav`,
        saveAs: false
      });
      setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
      setProgress(100, "✓ Áudio salvo com sucesso!");
    } else if (targetUrl.includes(".m3u8") || (chosenVariant && chosenVariant.isStream && !targetUrl.includes(".mp4"))) {
      const { chunks, downloadedBytes } = await fetchHlsBuffer(targetUrl, (pct, rec, _tot, curSeg, totSeg) => {
        setProgress(pct, `Baixando vídeo (${curSeg}/${totSeg}): ${formatBytes(rec)}`);
      });
      const blob = new Blob(chunks, { type: "video/mp4" });
      const blobUrl = URL.createObjectURL(blob);
      const tag = sanitizeFileName(resLabel.split(" ")[0]);
      savedDownloadId = await chrome.downloads.download({
        url: blobUrl,
        filename: `MediaGrabber/Videos/${currentSiteName}/${safeName}_${tag}.mp4`,
        saveAs: false
      });
      setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
      setProgress(100, `✓ Concluído (${formatBytes(downloadedBytes)})!`);
    } else {
      try {
        const blob = await fetchDirectWithProgress(
          targetUrl,
          (pct, rec, tot) => {
            const sizeInfo = tot > 0 ? `${formatBytes(rec)} / ${formatBytes(tot)}` : formatBytes(rec);
            setProgress(pct, `Baixando: ${sizeInfo}`);
          },
          fallbackUrl
        );
        const blobUrl = URL.createObjectURL(blob);
        const tag = sanitizeFileName(resLabel.split(" ")[0]);
        const folder = item.type === "video" ? "Videos" : item.type === "audio" ? "Audios" : "Fotos";
        const ext = (chosenVariant && chosenVariant.ext ? chosenVariant.ext : item.ext || "mp4").toLowerCase();
        savedDownloadId = await chrome.downloads.download({
          url: blobUrl,
          filename: `MediaGrabber/${folder}/${currentSiteName}/${safeName}_${tag}.${ext}`,
          saveAs: false
        });
        setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
        setProgress(100, `✓ Concluído (${formatBytes(blob.size)})!`);
      } catch (_) {
        const engineJob = await runLocalEngineDownload(
          {
            url: item.sourcePageUrl || targetUrl,
            title: item.title,
            filename: sanitizeFileName(item.title),
            site: currentSiteName,
            mode,
            height: (chosenVariant && chosenVariant.height) || 1080,
            orderPrefix: prefix
          },
          (pct, statusText) => setProgress(pct, statusText)
        );
        savedFilePath = engineJob.outputPath;
        setProgress(100, engineJob.statusText || "✓ Salvo na pasta Downloads!");
      }
    }

    if (buttonEl) {
      buttonEl.textContent = "✓ Salvo!";
      buttonEl.classList.add("done");
    }
    if (progressRefs && progressRefs.openFolderBtn) {
      progressRefs.openFolderBtn.classList.remove("hidden");
      progressRefs.openFolderBtn.onclick = (e) => {
        e.stopPropagation();
        chrome.runtime.sendMessage({
          action: "OPEN_DOWNLOAD_FOLDER",
          downloadId: savedDownloadId,
          filePath: savedFilePath
        });
      };
    }
  } catch (_) {
    setProgress(0, "Erro ao baixar arquivo");
    if (buttonEl) buttonEl.textContent = "Erro";
  } finally {
    setTimeout(() => {
      if (buttonEl) {
        buttonEl.disabled = false;
        buttonEl.classList.remove("done");
        buttonEl.textContent = originalText;
      }
    }, 2400);
  }
}

// =========================================================================
// FILTERING, SELECTION & RENDERING ENUMERATED LIST
// =========================================================================

function getVisibleMedia() {
  let list = currentFilter === "all" ? allMedia : allMedia.filter((m) => m.type === currentFilter);
  if (hdOnlyCheck && hdOnlyCheck.checked) {
    list = list.filter((m) => {
      if (m.type === "video") return true;
      if (m.width >= 800 || m.height >= 600) return true;
      if (m.url && m.url.includes("project_modules")) return true;
      return false;
    });
  }
  return list;
}

function updateCountsAndSelectionUI() {
  countAllEl.textContent = allMedia.length;
  countVideoEl.textContent = allMedia.filter((m) => m.type === "video").length;
  countImageEl.textContent = allMedia.filter((m) => m.type === "image").length;
  countAudioEl.textContent = allMedia.filter((m) => m.type === "audio").length;

  const visible = getVisibleMedia();
  const visibleSelected = visible.filter((m) => selectedIds.has(m.id));
  selectedCountEl.textContent = visibleSelected.length;

  if (visible.length > 0 && visibleSelected.length === visible.length) {
    selectAllCheck.checked = true;
  } else {
    selectAllCheck.checked = false;
  }

  if (visibleSelected.length > 0) {
    downloadAllBtn.textContent = `⬇ Baixar (${visibleSelected.length})`;
  } else {
    downloadAllBtn.textContent = "⬇ Baixar Tudo";
  }
}

function renderList() {
  updateCountsAndSelectionUI();
  const filtered = getVisibleMedia();

  if (filtered.length === 0) {
    mediaListEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔍</div>
        <h2>Nenhuma mídia encontrada nesta visualização</h2>
        <p>Clique em <strong>Scanner</strong> para escanear do zero, em <strong>🔗 Colar Link</strong> para analisar qualquer URL ou em <strong>⏬ Rolar</strong>.</p>
      </div>`;
    return;
  }

  mediaListEl.innerHTML = "";

  filtered.forEach((item, idx) => {
    const orderNum = idx + 1;
    const card = document.createElement("div");
    card.className = "media-card" + (selectedIds.has(item.id) ? " selected" : "");

    const variants =
      Array.isArray(item.variants) && item.variants.length > 0
        ? item.variants
        : [{ label: item.resLabel || item.quality || "Original", url: item.url, ext: item.ext }];

    let selectedVariant = variants[0];

    const mainRow = document.createElement("div");
    mainRow.className = "card-main-row";

    // 1. Left Column: Checkbox + Enumeration Badge (#1, #2, #3...)
    const leftCol = document.createElement("div");
    leftCol.className = "card-left-col";

    const checkEl = document.createElement("input");
    checkEl.type = "checkbox";
    checkEl.className = "item-check";
    checkEl.checked = selectedIds.has(item.id);
    checkEl.title = "Marcar para download em lote";
    checkEl.addEventListener("change", () => {
      if (checkEl.checked) selectedIds.add(item.id);
      else selectedIds.delete(item.id);
      card.classList.toggle("selected", checkEl.checked);
      updateCountsAndSelectionUI();
    });

    const indexBadge = document.createElement("div");
    indexBadge.className = "item-index";
    indexBadge.textContent = `#${orderNum}`;

    leftCol.appendChild(checkEl);
    leftCol.appendChild(indexBadge);

    // 2. Thumbnail Box (First Frame / Live Hover Play)
    const thumbBox = document.createElement("div");
    thumbBox.className = "thumb-box";
    thumbBox.title =
      item.type === "video"
        ? "Passe o mouse para reproduzir • Clique para ampliar"
        : "Clique para ampliar a foto";

    if (item.type === "image") {
      const img = document.createElement("img");
      img.src = item.thumbnail || item.url;
      img.loading = "lazy";
      img.onerror = () => {
        if (img.src !== item.url) img.src = item.url;
      };
      thumbBox.appendChild(img);

      const tag = document.createElement("span");
      tag.className = "thumb-live-tag";
      tag.textContent = item.dimensions || item.ext || "FOTO";
      thumbBox.appendChild(tag);
    } else if (item.type === "video") {
      const playableUrl = getPlayableVideoUrl(item, selectedVariant.url);
      if (playableUrl && !playableUrl.includes(".m3u8")) {
        const vid = document.createElement("video");
        vid.muted = true;
        vid.loop = true;
        vid.playsInline = true;
        vid.preload = "metadata";
        if (item.thumbnail) vid.poster = item.thumbnail;
        vid.src = playableUrl.includes("#") ? playableUrl : `${playableUrl}#t=0.1`;
        thumbBox.appendChild(vid);

        thumbBox.addEventListener("mouseenter", () => {
          thumbBox.classList.add("playing");
          vid.play().catch(() => {});
        });
        thumbBox.addEventListener("mouseleave", () => {
          thumbBox.classList.remove("playing");
          vid.pause();
          try {
            vid.currentTime = 0.1;
          } catch (_) {}
        });
      } else if (item.thumbnail) {
        const posterImg = document.createElement("img");
        posterImg.src = item.thumbnail;
        thumbBox.appendChild(posterImg);
      }

      const overlay = document.createElement("div");
      overlay.className = "thumb-overlay";
      overlay.innerHTML = `<div class="thumb-play-icon">▶</div>`;

      const tag = document.createElement("span");
      tag.className = "thumb-live-tag";
      tag.textContent = item.duration > 0 ? formatTime(item.duration).replace(/\.\d$/, "") : item.dimensions || "FULL HD";

      thumbBox.appendChild(overlay);
      thumbBox.appendChild(tag);
    } else {
      thumbBox.innerHTML = `<div class="thumb-play-icon">🎵</div>`;
    }

    thumbBox.addEventListener("click", () => openModal(item, selectedVariant, orderNum));

    // 3. Info Column: Editable Name + Quick Action Buttons + Selectors
    const info = document.createElement("div");
    info.className = "media-info";

    const headerRow = document.createElement("div");
    headerRow.className = "media-header-row";

    const titleInput = document.createElement("input");
    titleInput.type = "text";
    titleInput.className = "media-title-input";
    titleInput.value = item.title || `Mídia ${orderNum}`;
    titleInput.title = "Clique para editar o nome do arquivo antes de baixar";
    titleInput.addEventListener("change", () => {
      item.title = titleInput.value.trim() || item.title;
    });

    const badge = document.createElement("span");
    badge.className = `badge ${item.type}`;
    badge.textContent = item.type === "video" ? "VÍDEO" : item.type === "image" ? "FOTO" : "ÁUDIO";

    headerRow.appendChild(titleInput);
    headerRow.appendChild(badge);

    const sizeText = formatBytes(item.size);
    if (sizeText) {
      const sizeSpan = document.createElement("span");
      sizeSpan.className = "meta-size";
      sizeSpan.textContent = sizeText;
      headerRow.appendChild(sizeSpan);
    }

    if (item.type === "video") {
      const cutQuickBtn = document.createElement("button");
      cutQuickBtn.className = "mini-action-btn trim-btn";
      cutQuickBtn.textContent = "✂️ Cortar";
      cutQuickBtn.title = "Abrir este vídeo no Estúdio de Corte para baixar apenas um trecho";
      cutQuickBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openTrimmerStudio(item);
      });
      headerRow.appendChild(cutQuickBtn);
    }

    const copyBtn = document.createElement("button");
    copyBtn.className = "mini-action-btn";
    copyBtn.textContent = "🔗";
    copyBtn.title = "Copiar link direto desta mídia";
    copyBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(selectedVariant.url || item.url);
      copyBtn.textContent = "✓";
      setTimeout(() => (copyBtn.textContent = "🔗"), 1400);
    });
    headerRow.appendChild(copyBtn);

    const openFolderBtn = document.createElement("button");
    openFolderBtn.className = "mini-action-btn hidden";
    openFolderBtn.textContent = "📂";
    openFolderBtn.title = "Mostrar arquivo baixado na pasta";
    headerRow.appendChild(openFolderBtn);

    // Controls Row: Resolution + Mode
    const controlsRow = document.createElement("div");
    controlsRow.className = "media-controls-row";

    const resGroup = document.createElement("div");
    resGroup.className = "select-group";
    const resLabelEl = document.createElement("span");
    resLabelEl.className = "select-label";
    resLabelEl.textContent = "Resolução:";
    const selectRes = document.createElement("select");
    selectRes.className = "res-select";
    variants.forEach((v, vIdx) => {
      const opt = document.createElement("option");
      opt.value = String(vIdx);
      opt.textContent = v.label || "Original";
      selectRes.appendChild(opt);
    });
    selectRes.addEventListener("change", () => {
      const vIdx = parseInt(selectRes.value, 10) || 0;
      selectedVariant = variants[vIdx] || variants[0];
    });
    resGroup.appendChild(resLabelEl);
    resGroup.appendChild(selectRes);

    const modeGroup = document.createElement("div");
    modeGroup.className = "select-group";
    const modeLabelEl = document.createElement("span");
    modeLabelEl.className = "select-label";
    modeLabelEl.textContent = "O que baixar:";
    const selectMode = document.createElement("select");
    selectMode.className = "mode-select";

    if (item.type === "video") {
      selectMode.innerHTML = `
        <option value="video_full">🎬 Vídeo Completo (MP4)</option>
        <option value="video_only">🔇 Apenas Vídeo</option>
        <option value="photo_only">🖼️ Apenas Foto (Capa JPG)</option>
        <option value="audio_only">🎵 Apenas Áudio (WAV)</option>
      `;
    } else if (item.type === "image") {
      selectMode.innerHTML = `<option value="photo_only">🖼️ Apenas Foto (Original)</option>`;
    } else {
      selectMode.innerHTML = `<option value="audio_only">🎵 Apenas Áudio</option>`;
    }
    modeGroup.appendChild(modeLabelEl);
    modeGroup.appendChild(selectMode);

    controlsRow.appendChild(resGroup);
    controlsRow.appendChild(modeGroup);

    info.appendChild(headerRow);
    info.appendChild(controlsRow);

    // 4. Download Button + Individual Progress Bar
    const progressWrap = document.createElement("div");
    progressWrap.className = "card-progress-wrap hidden";
    const progressInfo = document.createElement("div");
    progressInfo.className = "card-progress-info";
    const progressStatus = document.createElement("span");
    progressStatus.textContent = "Preparando...";
    const progressPct = document.createElement("span");
    progressPct.textContent = "0%";
    progressInfo.appendChild(progressStatus);
    progressInfo.appendChild(progressPct);

    const progressTrack = document.createElement("div");
    progressTrack.className = "progress-track";
    const progressFill = document.createElement("div");
    progressFill.className = "progress-fill";
    progressFill.style.width = "0%";
    progressTrack.appendChild(progressFill);
    progressWrap.appendChild(progressInfo);
    progressWrap.appendChild(progressTrack);

    const progressRefs = {
      wrap: progressWrap,
      status: progressStatus,
      pct: progressPct,
      fill: progressFill,
      openFolderBtn
    };

    const dlBtn = document.createElement("button");
    dlBtn.className = "download-btn";
    dlBtn.textContent = "⬇ Baixar";
    dlBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      item.title = titleInput.value.trim() || item.title;
      executeDownload(item, selectedVariant, selectMode.value, dlBtn, progressRefs, orderNum);
    });

    mainRow.appendChild(leftCol);
    mainRow.appendChild(thumbBox);
    mainRow.appendChild(info);
    mainRow.appendChild(dlBtn);

    card.appendChild(mainRow);
    card.appendChild(progressWrap);
    mediaListEl.appendChild(card);
  });
}

// =========================================================================
// DIRECT PASTE LINK BAR (🔗 COLAR LINK)
// =========================================================================

function showPasteStatus(msg, isError = false) {
  if (!pasteLinkStatus) return;
  pasteLinkStatus.classList.remove("hidden");
  pasteLinkStatus.style.color = isError ? "#fb7185" : "#38bdf8";
  pasteLinkStatus.textContent = msg;
}

if (togglePasteLinkBtn) {
  togglePasteLinkBtn.addEventListener("click", async () => {
    const isHidden = pasteLinkPanel.classList.contains("hidden");
    if (isHidden) {
      pasteLinkPanel.classList.remove("hidden");
      togglePasteLinkBtn.classList.add("active");
      try {
        const clipText = await navigator.clipboard.readText();
        if (clipText && clipText.trim().startsWith("http") && !pasteUrlInput.value) {
          pasteUrlInput.value = clipText.trim();
        }
      } catch (_) {}
      pasteUrlInput.focus();
      pasteUrlInput.select();
    } else {
      pasteLinkPanel.classList.add("hidden");
      togglePasteLinkBtn.classList.remove("active");
    }
  });
}

if (pasteClipboardBtn) {
  pasteClipboardBtn.addEventListener("click", async () => {
    try {
      const clipText = await navigator.clipboard.readText();
      if (clipText) {
        pasteUrlInput.value = clipText.trim();
        pasteUrlInput.focus();
      }
    } catch (_) {}
  });
}

async function handleScanPastedUrl(openInTrimmer = false) {
  const rawUrl = (pasteUrlInput.value || "").trim();
  if (!rawUrl || !rawUrl.startsWith("http")) {
    showPasteStatus("⚠️ Cole um link válido começando com http:// ou https://", true);
    return;
  }

  scanUrlBtn.disabled = true;
  cutUrlBtn.disabled = true;
  showPasteStatus("⏳ Analisando link e extraindo streams em alta definição...");

  try {
    const u = new URL(rawUrl);
    currentSiteName = u.hostname.replace(/^www\./, "");
    siteHostEl.textContent = `Link: ${currentSiteName}`;
  } catch (_) {}

  try {
    const res = await chrome.runtime.sendMessage({
      action: "SCAN_EXTERNAL_URL",
      tabId: activeTabId,
      url: rawUrl,
      reset: true
    });

    const items = (res && (res.items || res.media)) || [];
    if (items.length > 0) {
      allMedia = items;
      selectedIds.clear();
      renderList();
      showPasteStatus(`✓ ${items.length} mídia(s) encontrada(s) no link!`);
      if (openInTrimmer) {
        const firstVid = allMedia.find((m) => m.type === "video") || allMedia[0];
        if (firstVid && firstVid.type === "video") {
          await openTrimmerStudio(firstVid);
        }
      }
    } else {
      showPasteStatus("⚠️ Nenhuma mídia encontrada neste link.", true);
    }
  } catch (_) {
    showPasteStatus("⚠️ Erro ao analisar o link.", true);
  } finally {
    scanUrlBtn.disabled = false;
    cutUrlBtn.disabled = false;
  }
}

if (scanUrlBtn) {
  scanUrlBtn.addEventListener("click", () => handleScanPastedUrl(false));
}
if (cutUrlBtn) {
  cutUrlBtn.addEventListener("click", () => handleScanPastedUrl(true));
}
if (pasteUrlInput) {
  pasteUrlInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      handleScanPastedUrl(false);
    }
  });
}

// =========================================================================
// VIEW 2: VIDEO TRIMMER STUDIO (ESTÚDIO DE CORTE COM DUPLA AGULHA)
// =========================================================================

async function openTrimmerStudio(preselectedVideo = null) {
  studioVideos = allMedia.filter((m) => m.type === "video");
  if (studioVideos.length === 0) {
    return;
  }

  document.body.classList.add("studio-mode");
  scannerView.classList.add("hidden");
  studioView.classList.remove("hidden");

  studioVideoSelect.innerHTML = "";
  studioVideos.forEach((v, idx) => {
    const opt = document.createElement("option");
    opt.value = String(idx);
    opt.textContent = `#${idx + 1} — ${v.title}`;
    if (preselectedVideo && v.id === preselectedVideo.id) {
      opt.selected = true;
    }
    studioVideoSelect.appendChild(opt);
  });

  const chosenIdx = parseInt(studioVideoSelect.value, 10) || 0;
  await loadVideoIntoStudio(studioVideos[chosenIdx]);
}

studioVideoSelect.addEventListener("change", async () => {
  const idx = parseInt(studioVideoSelect.value, 10) || 0;
  if (studioVideos[idx]) {
    await loadVideoIntoStudio(studioVideos[idx]);
  }
});

backToListBtn.addEventListener("click", () => {
  isPlayingCutLoop = false;
  studioVideo.pause();
  studioView.classList.add("hidden");
  scannerView.classList.remove("hidden");
  document.body.classList.remove("studio-mode");
});

expandFullTabBtn.addEventListener("click", () => {
  const url = chrome.runtime.getURL(`popup.html?studio=1&tabId=${activeTabId}`);
  chrome.tabs.create({ url });
});

async function loadVideoIntoStudio(item) {
  activeStudioItem = item;
  isPlayingCutLoop = false;
  userEditedClipName = false;
  studioHlsSegments = [];
  studioProgressWrap.classList.add("hidden");

  const variants =
    Array.isArray(item.variants) && item.variants.length > 0
      ? item.variants
      : [{ label: item.resLabel || "1080p Full HD", url: item.url, ext: item.ext }];

  studioResSelect.innerHTML = "";
  variants.forEach((v, idx) => {
    const opt = document.createElement("option");
    opt.value = String(idx);
    opt.textContent = v.label || "Original";
    studioResSelect.appendChild(opt);
  });

  studioResolutionTag.textContent = variants[0].label || "1080p Full HD";
  studioResSelect.onchange = () => {
    const rIdx = parseInt(studioResSelect.value, 10) || 0;
    if (variants[rIdx]) studioResolutionTag.textContent = variants[rIdx].label;
  };

  let playableUrl = getPlayableVideoUrl(item, variants[0].url);
  studioDuration = item.duration && item.duration > 0 ? item.duration : 60;

  const hlsVariant =
    variants.find((v) => v.url && v.url.includes(".m3u8")) || (item.masterUrl ? { url: item.masterUrl } : null);
  if (hlsVariant && hlsVariant.url) {
    try {
      const parsed = await parseHlsMediaSegments(hlsVariant.url);
      if (parsed.totalDuration > 0) {
        studioDuration = parsed.totalDuration;
        studioHlsSegments = parsed.segments;
      }
    } catch (_) {}
  }

  let loadedDirectVideo = false;
  if (playableUrl && !playableUrl.includes(".m3u8")) {
    studioBridgeImg.classList.add("hidden");
    studioVideo.classList.remove("hidden");
    if (item.thumbnail) studioVideo.poster = item.thumbnail;
    studioVideo.src = playableUrl;

    loadedDirectVideo = await new Promise((resolve) => {
      studioVideo.onloadedmetadata = () => {
        if (Number.isFinite(studioVideo.duration) && studioVideo.duration > 0) {
          studioDuration = studioVideo.duration;
        }
        resolve(true);
      };
      studioVideo.onerror = () => resolve(false);
      setTimeout(() => resolve(studioVideo.readyState >= 1), 1500);
    });
  }

  if (!loadedDirectVideo) {
    studioVideo.pause();
    studioVideo.removeAttribute("src");
    studioVideo.classList.add("hidden");
    studioBridgeImg.classList.remove("hidden");
    if (item.thumbnail) {
      studioBridgeImg.src = item.thumbnail;
    }
    const bridgeInfo = await chrome.runtime
      .sendMessage({
        action: "SEEK_TAB_VIDEO",
        tabId: activeTabId,
        frameId: item.frameId || 0,
        timeSec: 0.1
      })
      .catch(() => null);
    if (bridgeInfo && bridgeInfo.duration > 0) {
      studioDuration = bridgeInfo.duration;
      item.duration = bridgeInfo.duration;
    }
    if (bridgeInfo && bridgeInfo.frameDataUrl) {
      studioBridgeImg.src = bridgeInfo.frameDataUrl;
    }
    if (
      bridgeInfo &&
      bridgeInfo.title &&
      bridgeInfo.title.toLowerCase() !== "youtube" &&
      (item.title.toLowerCase() === "youtube" || item.title.startsWith("Vídeo"))
    ) {
      item.title = bridgeInfo.title;
      const selOpt = studioVideoSelect.options[studioVideoSelect.selectedIndex];
      if (selOpt) selOpt.textContent = `#${studioVideoSelect.selectedIndex + 1} — ${item.title}`;
    }
  }

  // If duration is still unknown (e.g. external pasted link not open in tab), query Local Media Engine
  if ((item.isEngine || isPlatformUrl(item.url)) && (!item.duration || item.duration <= 0)) {
    try {
      await chrome.runtime.sendMessage({ action: "ENSURE_ENGINE" }).catch(() => {});
      const token = await getEngineToken();
      const infoResp = await fetch(`${ENGINE_BASE}/api/info`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { "X-MG-Token": token } : {}) },
        body: JSON.stringify({ url: item.sourcePageUrl || item.url })
      });
      if (infoResp.ok) {
        const infoData = await infoResp.json();
        if (infoData.item) {
          if (infoData.item.duration > 0) {
            studioDuration = infoData.item.duration;
            item.duration = infoData.item.duration;
          }
          if (infoData.item.title && (item.title.toLowerCase() === "youtube" || item.title.startsWith("Vídeo"))) {
            item.title = infoData.item.title;
          }
        }
      }
    } catch (_) {}
  }

  trimStart = 0;
  trimEnd = Math.min(studioDuration, Math.max(5, Math.min(60, Math.round(studioDuration * 0.35 * 10) / 10)));
  studioTotalDurationLabel.textContent = `Total: ${formatTime(studioDuration)}`;
  updateStudioTimelineUI("start", false);
  seekStudioMonitor(0, "start");
}

function updateStudioClipDefaultName() {
  if (userEditedClipName || !activeStudioItem) return;
  const base = sanitizeFileName(activeStudioItem.title);
  const t1 = formatTimeForFilename(trimStart);
  const t2 = formatTimeForFilename(trimEnd);
  studioClipName.value = `${base}_Corte_${t1}_a_${t2}`;
}

studioClipName.addEventListener("input", () => {
  userEditedClipName = true;
});

function updateStudioTimelineUI(activeNeedle = "start", updateInputs = true) {
  const dur = Math.max(0.5, studioDuration);
  trimStart = Math.max(0, Math.min(trimStart, trimEnd - 0.2));
  trimEnd = Math.min(dur, Math.max(trimEnd, trimStart + 0.2));

  const startPct = (trimStart / dur) * 100;
  const endPct = (trimEnd / dur) * 100;

  needleStart.style.left = `${startPct}%`;
  needleEnd.style.left = `${endPct}%`;
  timelineSelectedBar.style.left = `${startPct}%`;
  timelineSelectedBar.style.width = `${Math.max(0.5, endPct - startPct)}%`;

  const fmtStart = formatTime(trimStart);
  const fmtEnd = formatTime(trimEnd);
  const cutDur = Math.max(0.1, trimEnd - trimStart);

  tooltipStart.textContent = fmtStart;
  tooltipEnd.textContent = fmtEnd;
  tlStartLabel.textContent = fmtStart;
  tlEndLabel.textContent = fmtEnd;
  tlCutDuration.textContent = `${cutDur.toFixed(1)}s`;

  const fullBytes = activeStudioItem && activeStudioItem.size > 0 ? activeStudioItem.size : dur * 320000;
  const estBytes = Math.round(fullBytes * (cutDur / dur));
  tlEstWeight.textContent = `~${formatBytes(estBytes) || "1.5 MB"}`;

  if (updateInputs) {
    inputStartTime.value = fmtStart;
    inputEndTime.value = fmtEnd;
  }

  if (activeNeedle === "start") {
    studioSceneBadge.textContent = `🟢 INÍCIO DO CORTE: ${fmtStart}`;
    studioSceneBadge.style.borderColor = "#10b981";
  } else {
    studioSceneBadge.textContent = `🔴 FINAL DO CORTE: ${fmtEnd}`;
    studioSceneBadge.style.borderColor = "#f43f5e";
  }

  updateStudioClipDefaultName();
}

async function seekStudioMonitor(targetSec, whichNeedle = "start") {
  const clamped = Math.max(0, Math.min(targetSec, studioDuration));
  const pct = (clamped / Math.max(0.5, studioDuration)) * 100;
  timelinePlayhead.style.left = `${pct}%`;

  if (!studioVideo.classList.contains("hidden") && studioVideo.src) {
    try {
      studioVideo.currentTime = clamped;
    } catch (_) {}
    return;
  }

  pendingBridgeSeek = { timeSec: clamped, whichNeedle };
  if (seekBridgeBusy) return;
  seekBridgeBusy = true;

  while (pendingBridgeSeek) {
    const req = pendingBridgeSeek;
    pendingBridgeSeek = null;
    try {
      const res = await chrome.runtime.sendMessage({
        action: "SEEK_TAB_VIDEO",
        tabId: activeTabId,
        frameId: activeStudioItem ? activeStudioItem.frameId || 0 : 0,
        timeSec: req.timeSec
      });
      if (res && res.frameDataUrl) {
        studioBridgeImg.src = res.frameDataUrl;
      }
      if (res && res.duration > 0 && Math.abs(res.duration - studioDuration) > 1) {
        studioDuration = res.duration;
        studioTotalDurationLabel.textContent = `Total: ${formatTime(studioDuration)}`;
      }
    } catch (_) {}
  }
  seekBridgeBusy = false;
}

function setupNeedleDrag(needleEl, which) {
  needleEl.addEventListener("mousedown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    isPlayingCutLoop = false;
    studioVideo.pause();

    function onMove(moveEv) {
      const rect = timelineTrack.getBoundingClientRect();
      const relX = Math.max(0, Math.min(moveEv.clientX - rect.left, rect.width));
      const sec = (relX / Math.max(1, rect.width)) * studioDuration;

      if (which === "start") {
        trimStart = Math.min(sec, trimEnd - 0.2);
        updateStudioTimelineUI("start", true);
        seekStudioMonitor(trimStart, "start");
      } else {
        trimEnd = Math.max(sec, trimStart + 0.2);
        updateStudioTimelineUI("end", true);
        seekStudioMonitor(trimEnd, "end");
      }
    }

    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  });
}

setupNeedleDrag(needleStart, "start");
setupNeedleDrag(needleEnd, "end");

timelineTrack.addEventListener("mousedown", (e) => {
  if (e.target.closest(".timeline-needle")) return;
  const rect = timelineTrack.getBoundingClientRect();
  const relX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
  const clickedSec = (relX / Math.max(1, rect.width)) * studioDuration;

  const distStart = Math.abs(clickedSec - trimStart);
  const distEnd = Math.abs(clickedSec - trimEnd);
  if (distStart <= distEnd) {
    trimStart = Math.min(clickedSec, trimEnd - 0.2);
    updateStudioTimelineUI("start", true);
    seekStudioMonitor(trimStart, "start");
  } else {
    trimEnd = Math.max(clickedSec, trimStart + 0.2);
    updateStudioTimelineUI("end", true);
    seekStudioMonitor(trimEnd, "end");
  }
});

inputStartTime.addEventListener("change", () => {
  trimStart = Math.min(parseTimeInput(inputStartTime.value, studioDuration), trimEnd - 0.2);
  updateStudioTimelineUI("start", true);
  seekStudioMonitor(trimStart, "start");
});

inputEndTime.addEventListener("change", () => {
  trimEnd = Math.max(parseTimeInput(inputEndTime.value, studioDuration), trimStart + 0.2);
  updateStudioTimelineUI("end", true);
  seekStudioMonitor(trimEnd, "end");
});

document.querySelectorAll(".nudge-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const target = btn.dataset.target;
    const delta = parseFloat(btn.dataset.delta) || 0;
    if (target === "start") {
      trimStart = Math.max(0, Math.min(trimStart + delta, trimEnd - 0.2));
      updateStudioTimelineUI("start", true);
      seekStudioMonitor(trimStart, "start");
    } else {
      trimEnd = Math.min(studioDuration, Math.max(trimEnd + delta, trimStart + 0.2));
      updateStudioTimelineUI("end", true);
      seekStudioMonitor(trimEnd, "end");
    }
  });
});

setStartCurrentBtn.addEventListener("click", () => {
  const cur = !studioVideo.classList.contains("hidden") ? studioVideo.currentTime : trimStart;
  trimStart = Math.min(cur, trimEnd - 0.2);
  updateStudioTimelineUI("start", true);
  seekStudioMonitor(trimStart, "start");
});

setEndCurrentBtn.addEventListener("click", () => {
  const cur = !studioVideo.classList.contains("hidden") ? studioVideo.currentTime : trimEnd;
  trimEnd = Math.max(cur, trimStart + 0.2);
  updateStudioTimelineUI("end", true);
  seekStudioMonitor(trimEnd, "end");
});

previewCutLoopBtn.addEventListener("click", () => {
  if (studioVideo.classList.contains("hidden") || !studioVideo.src) {
    seekStudioMonitor(trimStart, "start");
    return;
  }
  if (isPlayingCutLoop) {
    isPlayingCutLoop = false;
    studioVideo.pause();
    previewCutLoopBtn.textContent = "▶ Assistir Trecho";
  } else {
    isPlayingCutLoop = true;
    studioVideo.currentTime = trimStart;
    studioVideo.play().catch(() => {});
    previewCutLoopBtn.textContent = "⏸ Pausar Trecho";
  }
});

studioVideo.addEventListener("timeupdate", () => {
  const cur = studioVideo.currentTime;
  const pct = (cur / Math.max(0.5, studioDuration)) * 100;
  timelinePlayhead.style.left = `${pct}%`;

  if (isPlayingCutLoop && cur >= trimEnd) {
    studioVideo.currentTime = trimStart;
    studioVideo.play().catch(() => {});
  }
});

async function captureCurrentFrameAsPhoto(videoEl, imgEl, baseName) {
  const safe = sanitizeFileName(baseName || "Cena");
  if (videoEl && !videoEl.classList.contains("hidden") && videoEl.videoWidth > 0) {
    try {
      const c = document.createElement("canvas");
      c.width = videoEl.videoWidth;
      c.height = videoEl.videoHeight;
      c.getContext("2d").drawImage(videoEl, 0, 0, c.width, c.height);
      const dataUrl = c.toDataURL("image/jpeg", 0.95);
      await chrome.downloads.download({
        url: dataUrl,
        filename: `MediaGrabber/Fotos/${currentSiteName}/${safe}_Frame.jpg`,
        saveAs: false
      });
      return;
    } catch (_) {}
  }
  const bridge = await chrome.runtime
    .sendMessage({
      action: "SEEK_TAB_VIDEO",
      tabId: activeTabId,
      frameId: activeStudioItem ? activeStudioItem.frameId || 0 : 0,
      timeSec: videoEl && !videoEl.classList.contains("hidden") ? videoEl.currentTime : trimStart
    })
    .catch(() => null);

  if (bridge && bridge.frameDataUrl) {
    await chrome.downloads.download({
      url: bridge.frameDataUrl,
      filename: `MediaGrabber/Fotos/${currentSiteName}/${safe}_Frame.jpg`,
      saveAs: false
    });
  } else if (imgEl && imgEl.src) {
    await chrome.downloads.download({
      url: imgEl.src,
      filename: `MediaGrabber/Fotos/${currentSiteName}/${safe}_Frame.jpg`,
      saveAs: false
    });
  }
}

captureStudioFrameBtn.addEventListener("click", () => {
  captureCurrentFrameAsPhoto(studioVideo, studioBridgeImg, studioClipName.value || "Cena");
});

// =========================================================================
// 4-TIER FAIL-SAFE VIDEO CLIP TRIMMER
// Tier 0: Local Engine (yt-dlp + ffmpeg for YouTube Lives, Videos, Shorts & Any Link)
// Tier 1: Fast Lossless HLS Segment Slicer
// Tier 2: Same-Origin MP4 Blob Recorder
// =========================================================================

saveTrimmedClipBtn.addEventListener("click", async () => {
  if (!activeStudioItem) return;
  const variants =
    Array.isArray(activeStudioItem.variants) && activeStudioItem.variants.length > 0
      ? activeStudioItem.variants
      : [{ label: "Original", url: activeStudioItem.url, ext: "MP4" }];

  const resIdx = parseInt(studioResSelect.value, 10) || 0;
  const chosenVariant = variants[resIdx] || variants[0];
  const mode = studioModeSelect.value;
  const customFileName = sanitizeFileName(studioClipName.value || activeStudioItem.title);
  const originalBtnText = saveTrimmedClipBtn.textContent;

  function setStudioProg(pct, msg) {
    studioProgressWrap.classList.remove("hidden");
    studioProgressFill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
    studioProgressPct.textContent = `${Math.round(pct)}%`;
    studioProgressStatus.textContent = msg;
  }

  try {
    saveTrimmedClipBtn.disabled = true;
    setStudioProg(3, "Iniciando corte do trecho selecionado...");

    // 1. Mode: Save Start + End Frames as JPG
    if (mode === "clip_frames") {
      await seekStudioMonitor(trimStart, "start");
      await new Promise((r) => setTimeout(r, 350));
      await captureCurrentFrameAsPhoto(studioVideo, studioBridgeImg, `${customFileName}_Inicio`);
      setStudioProg(50, "Salvando frame final...");
      await seekStudioMonitor(trimEnd, "end");
      await new Promise((r) => setTimeout(r, 350));
      await captureCurrentFrameAsPhoto(studioVideo, studioBridgeImg, `${customFileName}_Fim`);
      setStudioProg(100, "✓ Fotos de Início e Fim salvas!");
      return;
    }

    // Tier 0: Local High-Speed Media Engine (yt-dlp + ffmpeg)
    // Works for YouTube Videos, YouTube Lives, YouTube Shorts, Instagram, TikTok, Vimeo, and direct URLs!
    const engineTargetUrl = activeStudioItem.sourcePageUrl || chosenVariant.url || activeStudioItem.url;
    let engineSucceeded = false;

    try {
      const job = await runLocalEngineDownload(
        {
          url: engineTargetUrl,
          title: activeStudioItem.title,
          filename: customFileName,
          site: currentSiteName,
          mode: mode === "clip_audio" ? "clip_audio" : "clip_video",
          height: chosenVariant.height || 1080,
          startTime: Math.round(trimStart * 10) / 10,
          endTime: Math.round(trimEnd * 10) / 10
        },
        (pct, statusText) => {
          setStudioProg(pct, statusText);
        }
      );
      setStudioProg(100, job.statusText || "✓ Trecho cortado e salvo na pasta Downloads!");
      engineSucceeded = true;
    } catch (_) {
      engineSucceeded = false;
    }

    if (engineSucceeded) return;

    // Find best HLS URL or verified MP4 URL for Browser-Only Fallbacks
    const anyHlsVariant = variants.find((v) => v.url && v.url.includes(".m3u8"));
    const hlsUrl =
      chosenVariant.url && chosenVariant.url.includes(".m3u8")
        ? chosenVariant.url
        : activeStudioItem.masterUrl || (anyHlsVariant ? anyHlsVariant.url : "");

    const verifiedMp4Url =
      activeStudioItem.previewUrl ||
      (!chosenVariant.url.includes(".m3u8") ? chosenVariant.url : "") ||
      activeStudioItem.url;

    // 2. Mode: Audio Only of the Trimmed Range [trimStart, trimEnd]
    if (mode === "clip_audio") {
      setStudioProg(15, "Extraindo áudio do trecho selecionado...");
      let arrayBuf = null;
      let sliceFromZero = false;

      if (hlsUrl) {
        try {
          const { chunks } = await fetchHlsBuffer(
            hlsUrl,
            (pct, rec) => setStudioProg(Math.round(pct * 0.75), `Baixando trecho de áudio: ${formatBytes(rec)}`),
            trimStart,
            trimEnd
          );
          arrayBuf = await new Blob(chunks).arrayBuffer();
          sliceFromZero = true;
        } catch (_) {}
      }

      if (!arrayBuf) {
        const blob = await fetchDirectWithProgress(
          chosenVariant.url,
          (pct, rec) => setStudioProg(Math.round(pct * 0.7), `Carregando áudio: ${formatBytes(rec)}`),
          verifiedMp4Url
        );
        arrayBuf = await blob.arrayBuffer();
      }

      setStudioProg(85, "Cortando exatamente de " + formatTime(trimStart) + " até " + formatTime(trimEnd) + "...");
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const decoded = await audioCtx.decodeAudioData(arrayBuf.slice(0));
      const wavBlob = sliceFromZero
        ? audioBufferToWavBlob(decoded, 0, trimEnd - trimStart)
        : audioBufferToWavBlob(decoded, trimStart, trimEnd);
      const blobUrl = URL.createObjectURL(wavBlob);
      await chrome.downloads.download({
        url: blobUrl,
        filename: `MediaGrabber/Audios/${currentSiteName}/${customFileName}.wav`,
        saveAs: false
      });
      setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
      setStudioProg(100, "✓ Áudio do trecho salvo com sucesso!");
      return;
    }

    // Tier 1: Fast Lossless HLS Segment Slicing
    let hlsSucceeded = false;
    if (hlsUrl) {
      try {
        const { chunks, downloadedBytes } = await fetchHlsBuffer(
          hlsUrl,
          (pct, rec, _tot, curSeg, totSeg) => {
            setStudioProg(pct, `Cortando segmentos HD (${curSeg}/${totSeg}) • ${formatBytes(rec)}`);
          },
          trimStart,
          trimEnd
        );
        const blob = new Blob(chunks, { type: "video/mp4" });
        const blobUrl = URL.createObjectURL(blob);
        await chrome.downloads.download({
          url: blobUrl,
          filename: `MediaGrabber/Videos/${currentSiteName}/${customFileName}.mp4`,
          saveAs: false
        });
        setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
        setStudioProg(100, `✓ Trecho cortado salvo com sucesso (${formatBytes(downloadedBytes)})!`);
        hlsSucceeded = true;
      } catch (_) {
        hlsSucceeded = false;
      }
    }

    // Tier 2: Fetch MP4 into Same-Origin Blob -> Record [trimStart, trimEnd]
    if (!hlsSucceeded) {
      setStudioProg(10, "Carregando stream de vídeo para corte preciso...");
      const mp4Blob = await fetchDirectWithProgress(
        chosenVariant.url && !chosenVariant.url.includes(".m3u8") ? chosenVariant.url : verifiedMp4Url,
        (pct, rec, tot) => {
          const halfPct = Math.round(pct * 0.5);
          const sz = tot > 0 ? `${formatBytes(rec)} / ${formatBytes(tot)}` : formatBytes(rec);
          setStudioProg(halfPct, `Preparando vídeo (${sz})...`);
        },
        verifiedMp4Url
      );

      setStudioProg(52, `Recortando trecho ${formatTime(trimStart)} → ${formatTime(trimEnd)}...`);
      const { blob: clippedBlob, ext } = await recordTrimmedClipFromBlob(
        mp4Blob,
        trimStart,
        trimEnd,
        (recPct, curT, endT) => {
          const totalPct = 50 + Math.round(recPct * 0.49);
          setStudioProg(totalPct, `Cortando cena: ${curT} / ${endT}`);
        }
      );

      const blobUrl = URL.createObjectURL(clippedBlob);
      await chrome.downloads.download({
        url: blobUrl,
        filename: `MediaGrabber/Videos/${currentSiteName}/${customFileName}.${ext}`,
        saveAs: false
      });
      setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
      setStudioProg(100, `✓ Trecho cortado salvo com sucesso (${formatBytes(clippedBlob.size)})!`);
    }
  } catch (_) {
    setStudioProg(0, "Não foi possível cortar este stream diretamente.");
  } finally {
    saveTrimmedClipBtn.disabled = false;
    saveTrimmedClipBtn.textContent = originalBtnText;
  }
});

// =========================================================================
// QUICK PREVIEW MODAL
// =========================================================================

function openModal(item, initialVariant, orderNum) {
  previewModal.classList.remove("hidden");
  modalTitle.textContent = `#${orderNum || item.index || 1} — ${item.title || "Visualização"}`;
  modalBadge.className = `badge ${item.type}`;
  modalBadge.textContent = item.ext || item.type.toUpperCase();
  modalBody.innerHTML = "";

  if (item.type === "video") {
    modalSnapFrameBtn.classList.remove("hidden");
    modalOpenTrimmerBtn.classList.remove("hidden");
    modalOpenTrimmerBtn.onclick = () => {
      closeModal();
      openTrimmerStudio(item);
    };
  } else {
    modalSnapFrameBtn.classList.add("hidden");
    modalOpenTrimmerBtn.classList.add("hidden");
  }

  const variants =
    Array.isArray(item.variants) && item.variants.length > 0
      ? item.variants
      : [{ label: item.resLabel || "Original", url: item.url, ext: item.ext }];

  modalQualitySelect.innerHTML = "";
  variants.forEach((v, idx) => {
    const opt = document.createElement("option");
    opt.value = String(idx);
    opt.textContent = v.label || "Original";
    if (initialVariant && v.label === initialVariant.label) opt.selected = true;
    modalQualitySelect.appendChild(opt);
  });

  function renderModalPreview(variant) {
    modalBody.innerHTML = "";
    if (item.type === "video") {
      const playUrl = getPlayableVideoUrl(item, variant.url);
      if (playUrl && !playUrl.includes(".m3u8")) {
        const v = document.createElement("video");
        v.controls = true;
        v.autoplay = true;
        if (item.thumbnail) v.poster = item.thumbnail;
        v.src = playUrl;
        modalBody.appendChild(v);
        modalSnapFrameBtn.onclick = () => captureCurrentFrameAsPhoto(v, null, item.title);
      } else if (item.thumbnail) {
        const img = document.createElement("img");
        img.src = item.thumbnail;
        modalBody.appendChild(img);
        modalSnapFrameBtn.onclick = () => captureCurrentFrameAsPhoto(null, img, item.title);
      }
    } else if (item.type === "image") {
      const img = document.createElement("img");
      img.src = variant.url || item.url;
      modalBody.appendChild(img);
    } else {
      const a = document.createElement("audio");
      a.controls = true;
      a.autoplay = true;
      a.src = variant.url || item.url;
      modalBody.appendChild(a);
    }
  }

  const startIdx = parseInt(modalQualitySelect.value, 10) || 0;
  renderModalPreview(variants[startIdx] || variants[0]);

  modalQualitySelect.onchange = () => {
    const idx = parseInt(modalQualitySelect.value, 10) || 0;
    renderModalPreview(variants[idx] || variants[0]);
  };

  modalDownloadBtn.onclick = () => {
    const idx = parseInt(modalQualitySelect.value, 10) || 0;
    const chosen = variants[idx] || variants[0];
    executeDownload(
      item,
      chosen,
      item.type === "video" ? "video_full" : item.type === "image" ? "photo_only" : "audio_only",
      modalDownloadBtn,
      null,
      orderNum
    );
  };
}

function closeModal() {
  previewModal.classList.add("hidden");
  modalBody.innerHTML = "";
}

closeModalBtn.addEventListener("click", closeModal);
modalBackdrop.addEventListener("click", closeModal);

// =========================================================================
// TOP BAR & FILTER EVENTS
// =========================================================================

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    currentFilter = tab.dataset.type;
    renderList();
  });
});

selectAllCheck.addEventListener("change", () => {
  const visible = getVisibleMedia();
  if (selectAllCheck.checked) {
    visible.forEach((m) => selectedIds.add(m.id));
  } else {
    visible.forEach((m) => selectedIds.delete(m.id));
  }
  renderList();
});

hdOnlyCheck.addEventListener("change", renderList);

openFolderTopBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ action: "OPEN_DOWNLOAD_FOLDER" });
});

openStudioBtn.addEventListener("click", () => {
  openTrimmerStudio(null);
});

async function runScanner(resetFirst = true) {
  if (!activeTabId) return;
  scanBtn.classList.add("scanning");
  if (resetFirst) {
    allMedia = [];
    selectedIds.clear();
    renderList();
  }
  try {
    const res = await chrome.runtime.sendMessage({
      action: resetFirst ? "RESET_AND_SCAN_TAB" : "DEEP_SCAN_TAB",
      tabId: activeTabId,
      reset: resetFirst
    });
    allMedia = (res && (res.items || res.media)) || [];
    renderList();
  } catch (_) {
  } finally {
    setTimeout(() => scanBtn.classList.remove("scanning"), 400);
  }
}

scanBtn.addEventListener("click", () => runScanner(true));

autoScrollBtn.addEventListener("click", async () => {
  if (!activeTabId) return;
  const orig = autoScrollBtn.textContent;
  autoScrollBtn.textContent = "⏳ Rolando...";
  autoScrollBtn.disabled = true;
  allMedia = [];
  selectedIds.clear();
  renderList();
  try {
    const res = await chrome.runtime.sendMessage({
      action: "AUTO_SCROLL_SCAN",
      tabId: activeTabId
    });
    allMedia = (res && (res.items || res.media)) || [];
    renderList();
  } catch (_) {
  } finally {
    autoScrollBtn.disabled = false;
    autoScrollBtn.textContent = orig;
  }
});

downloadAllBtn.addEventListener("click", async () => {
  const visible = getVisibleMedia();
  const targets = visible.filter((m) => selectedIds.has(m.id));
  const listToDownload = targets.length > 0 ? targets : visible;

  if (listToDownload.length === 0) return;

  downloadAllBtn.disabled = true;
  batchProgressWrap.classList.remove("hidden");

  for (let i = 0; i < listToDownload.length; i++) {
    const item = listToDownload[i];
    const bestVariant =
      Array.isArray(item.variants) && item.variants.length > 0
        ? item.variants[0]
        : { label: "Original", url: item.url, ext: item.ext };

    const overallPct = Math.round((i / listToDownload.length) * 100);
    batchProgressFill.style.width = `${overallPct}%`;
    batchProgressPct.textContent = `${overallPct}%`;
    batchProgressLabel.textContent = `Baixando ${i + 1} de ${listToDownload.length}: ${item.title}`;

    await executeDownload(
      item,
      bestVariant,
      item.type === "video" ? "video_full" : item.type === "image" ? "photo_only" : "audio_only",
      null,
      null,
      i + 1
    );
    await new Promise((r) => setTimeout(r, 250));
  }

  batchProgressFill.style.width = "100%";
  batchProgressPct.textContent = "100%";
  batchProgressLabel.textContent = `✓ Todos os ${listToDownload.length} arquivos foram salvos!`;

  setTimeout(() => {
    downloadAllBtn.disabled = false;
    updateCountsAndSelectionUI();
    batchProgressWrap.classList.add("hidden");
  }, 2600);
});

// =========================================================================
// INITIALIZATION
// =========================================================================

const urlParams = new URLSearchParams(window.location.search);
const isFullTabStudio = urlParams.get("studio") === "1";
const paramTabId = parseInt(urlParams.get("tabId") || "0", 10);

if (isFullTabStudio) {
  document.body.classList.add("fulltab-mode");
}

chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
  const activeTab = paramTabId ? { id: paramTabId, url: "" } : tabs && tabs[0];
  if (!activeTab) return;
  activeTabId = activeTab.id;

  try {
    if (activeTab.url) {
      const u = new URL(activeTab.url);
      currentSiteName = u.hostname.replace(/^www\./, "");
      siteHostEl.textContent = currentSiteName;
    }
  } catch (_) {
    siteHostEl.textContent = "Página ativa";
  }

  await runScanner(false);

  if (isFullTabStudio) {
    openTrimmerStudio(null);
  }
});

// ---- Cortes Virais IA: abre o estúdio em aba própria com o link da aba atual ----
document.getElementById("openAiStudioBtn")?.addEventListener("click", async () => {
  let url = "";
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && /^https?:/.test(tab.url)) url = tab.url;
  } catch (_) {}
  const pasted = document.getElementById("pasteUrlInput")?.value.trim();
  if (pasted && /^https?:/.test(pasted)) url = pasted;
  chrome.tabs.create({ url: chrome.runtime.getURL("ai_studio.html") + (url ? "?url=" + encodeURIComponent(url) : "") });
});
