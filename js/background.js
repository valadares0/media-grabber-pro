// =========================================================================
// Media Grabber Pro v4.5 - Background Service Worker
// Instant YouTube (Videos, Kids, Lives, Shorts) Detection, Native Messaging
// Auto-Launcher for Local Engine, In-Tab Stream Recorder & Zero Chrome Errors
// =========================================================================

const mediaStore = {}; // tabId -> Map(key -> mediaItem)
const tabUrls = {};    // tabId -> last known URL
const tabTitles = {};  // tabId -> main page title

const ENGINE_BASE = "http://127.0.0.1:48721";
const NATIVE_HOST = "com.mediagrabber.engine";

const VIDEO_EXTS = [".mp4", ".m3u8", ".webm", ".mkv", ".mov", ".m4v"];
const AUDIO_EXTS = [".mp3", ".m4a", ".aac", ".wav", ".ogg", ".flac"];
const IMAGE_EXTS = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"];

const SEGMENT_NOISE_RE =
  /(\/seg[-_]|\/frag[-_]|\/chunk[-_]|\.ts(\?|$)|\.m4s(\?|$)|init\.mp4|googlevideo\.com\/videoplayback|ytimg\.com|ggpht\.com|googleusercontent\.com|google-analytics|doubleclick|facebook\.com\/tr|\/ads\/|favicon|sprite|avatar|icon|logo|1x1|pixel)/i;

function clearTabStore(tabId) {
  if (!tabId) return;
  mediaStore[tabId] = new Map();
  updateBadge(tabId);
}

function extractYouTubeId(urlStr) {
  if (!urlStr) return null;
  try {
    const u = new URL(urlStr);
    if (u.hostname.includes("youtube.com")) {
      if (u.pathname === "/watch") return u.searchParams.get("v");
      const shortsMatch = u.pathname.match(/^\/shorts\/([a-zA-Z0-9_-]{6,20})/);
      if (shortsMatch) return shortsMatch[1];
      const liveMatch = u.pathname.match(/^\/live\/([a-zA-Z0-9_-]{6,20})/);
      if (liveMatch) return liveMatch[1];
    } else if (u.hostname === "youtu.be") {
      return u.pathname.slice(1).split("/")[0];
    }
  } catch (_) {}
  return null;
}

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

async function fetchWithTimeout(url, timeoutMs = 2000, opts = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    let finalOpts = { credentials: "omit", ...opts, signal: ctrl.signal };
    if (String(url).startsWith(ENGINE_BASE)) {
      const token = await getEngineToken();
      if (token) {
        finalOpts.headers = { ...(opts.headers || {}), "X-MG-Token": token };
      }
    }
    return await fetch(url, finalOpts);
  } finally {
    clearTimeout(timer);
  }
}

// Auto-launch Local Media Engine via Chrome Native Messaging if not running
async function ensureLocalEngineRunning() {
  try {
    const r = await fetchWithTimeout(`${ENGINE_BASE}/api/health`, 800);
    if (r.ok) return true;
  } catch (_) {}

  try {
    await new Promise((resolve) => {
      chrome.runtime.sendNativeMessage(NATIVE_HOST, { action: "START_ENGINE" }, () => {
        // Ignore chrome.runtime.lastError if any
        void chrome.runtime.lastError;
        resolve();
      });
    });
    const r2 = await fetchWithTimeout(`${ENGINE_BASE}/api/health`, 1200);
    return r2.ok;
  } catch (_) {
    return false;
  }
}

chrome.runtime.onStartup.addListener(() => {
  ensureLocalEngineRunning();
});

chrome.runtime.onInstalled.addListener(() => {
  ensureLocalEngineRunning();
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "mgp-root",
      title: "Media Grabber Pro",
      contexts: ["page", "frame", "video", "audio", "image", "link"]
    });

    chrome.contextMenus.create({
      id: "mgp-download-direct",
      parentId: "mgp-root",
      title: "⬇ Baixar esta mídia em Alta Qualidade",
      contexts: ["video", "audio", "image", "link"]
    });

    chrome.contextMenus.create({
      id: "mgp-scan-page",
      parentId: "mgp-root",
      title: "🔍 Zerar e Escanear esta página agora",
      contexts: ["page", "frame", "video", "image"]
    });
  });

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    for (const t of tabs || []) {
      if (t.id && t.url && t.url.startsWith("http")) {
        tabUrls[t.id] = t.url;
        if (t.title) tabTitles[t.id] = cleanMainTabTitle(t.title);
        runDeepScanOnTab(t.id, true);
      }
    }
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab || !tab.id) return;
  if (info.menuItemId === "mgp-download-direct") {
    const rawUrl = info.srcUrl || info.linkUrl;
    if (rawUrl) {
      const mediaType =
        info.mediaType === "video"
          ? "video"
          : info.mediaType === "audio"
          ? "audio"
          : "image";
      const upgraded = await resolveBestUrl(rawUrl, mediaType);
      await triggerDownload({
        url: upgraded,
        title: tab.title || "midia",
        type: mediaType,
        site: getDomain(tab.url),
        resLabel: "Original"
      });
    }
  } else if (info.menuItemId === "mgp-scan-page") {
    await runDeepScanOnTab(tab.id, true);
    try {
      await chrome.action.openPopup();
    } catch (_) {}
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  delete mediaStore[tabId];
  delete tabUrls[tabId];
  delete tabTitles[tabId];
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tab && tab.title) {
    const cleaned = cleanMainTabTitle(tab.title);
    if (cleaned) tabTitles[tabId] = cleaned;
  }
  if (changeInfo.status === "loading") {
    if (changeInfo.url && changeInfo.url !== tabUrls[tabId]) {
      tabUrls[tabId] = changeInfo.url;
      clearTabStore(tabId);
    } else if (!changeInfo.url) {
      clearTabStore(tabId);
    }
  } else if (changeInfo.url && changeInfo.url !== tabUrls[tabId]) {
    tabUrls[tabId] = changeInfo.url;
    clearTabStore(tabId);
    setTimeout(() => runDeepScanOnTab(tabId, false), 450);
  } else if (changeInfo.status === "complete" && tab && tab.url && tab.url.startsWith("http")) {
    tabUrls[tabId] = tab.url;
    runDeepScanOnTab(tabId, false);
  }
});

// WebRequest Sniffer (ignores googlevideo chunks, YouTube thumbnails & noise)
chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    if (details.tabId < 0) return;
    const url = details.url;
    if (!url.startsWith("http") || SEGMENT_NOISE_RE.test(url)) return;

    const tabUrl = tabUrls[details.tabId] || "";
    if (tabUrl.includes("youtube.com") || tabUrl.includes("youtu.be")) {
      return;
    }

    let contentType = "";
    let contentLength = 0;

    if (details.responseHeaders) {
      for (const h of details.responseHeaders) {
        const name = h.name.toLowerCase();
        if (name === "content-type") contentType = (h.value || "").toLowerCase();
        else if (name === "content-length") contentLength = parseInt(h.value || "0", 10) || 0;
      }
    }

    const lowerUrl = url.toLowerCase();
    const isM3U8 = lowerUrl.includes(".m3u8") || contentType.includes("mpegurl");

    if (isM3U8) {
      handleM3U8Detected(details.tabId, url);
      return;
    }

    let type = null;
    const cleanPath = lowerUrl.split("?")[0];

    if (contentType.startsWith("video/") || VIDEO_EXTS.some((ext) => cleanPath.endsWith(ext))) {
      if (contentLength > 0 && contentLength < 30000) return;
      type = "video";
    } else if (contentType.startsWith("audio/") || AUDIO_EXTS.some((ext) => cleanPath.endsWith(ext))) {
      type = "audio";
    } else if (contentType.startsWith("image/") || IMAGE_EXTS.some((ext) => cleanPath.endsWith(ext))) {
      const isBehance =
        lowerUrl.includes("behance.net/project_modules/") ||
        lowerUrl.includes("behance.net/projects/");
      const isCcvThumb = lowerUrl.includes("ccv.adobe") || lowerUrl.includes("behance");
      if (!isBehance && !isCcvThumb && contentLength > 0 && contentLength < 25000) return;
      type = "image";
    }

    if (type) {
      if (type === "image" && lowerUrl.includes("ccv.adobe")) {
        attachPosterToVideo(details.tabId, url);
        return;
      }

      registerMediaItem(
        details.tabId,
        buildMediaItem({
          url,
          type,
          size: contentLength,
          tabId: details.tabId
        })
      );
    }
  },
  { urls: ["<all_urls>"] },
  ["responseHeaders"]
);

function attachPosterToVideo(tabId, imageUrl) {
  const map = mediaStore[tabId];
  if (!map) return;
  const ccvMatch = imageUrl.match(/ccv\.adobe\.(?:com|io)\/(?:v1\/player\/ccv\/)?([a-zA-Z0-9_-]{8,15})/i);
  for (const item of map.values()) {
    if (item.type === "video") {
      if (ccvMatch && item.key.includes(ccvMatch[1])) {
        item.thumbnail = imageUrl;
      } else if (!item.thumbnail) {
        item.thumbnail = imageUrl;
      }
    }
  }
}

async function handleM3U8Detected(tabId, m3u8Url, customTitle, customPoster, customDuration, frameId) {
  if (/\/hls_\d+\/|chunklist|index_\d+|media_\d+/i.test(m3u8Url)) {
    const existing = getTabItems(tabId);
    if (existing.some((i) => i.isStream)) return;
  }

  const baseId = extractStreamKey(m3u8Url);
  const variants = await parseM3U8Variants(m3u8Url);

  const defaultVariants =
    variants.length > 0
      ? variants
      : [
          {
            label: "1080p Full HD (HLS)",
            res: "1920×1080",
            height: 1080,
            url: m3u8Url,
            ext: "HLS",
            isStream: true
          },
          {
            label: "720p HD (HLS)",
            res: "1280×720",
            height: 720,
            url: m3u8Url,
            ext: "HLS",
            isStream: true
          },
          {
            label: "480p SD (HLS)",
            res: "854×480",
            height: 480,
            url: m3u8Url,
            ext: "HLS",
            isStream: true
          }
        ];

  const bestVariant = defaultVariants[0];
  const fallbackTitle = tabTitles[tabId] || "Vídeo em Alta Definição";

  registerMediaItem(tabId, {
    id: "hls_" + hashStr(baseId),
    key: getCanonicalMediaKey(m3u8Url, "video"),
    url: bestVariant.url,
    masterUrl: m3u8Url,
    previewUrl: bestVariant.mp4Fallback || "",
    thumbnail: customPoster || "",
    duration: customDuration || 0,
    frameId: typeof frameId === "number" ? frameId : 0,
    type: "video",
    isStream: true,
    ext: "MP4",
    size: bestVariant.approxBytes || 0,
    title: normalizeVideoTitle(customTitle, fallbackTitle),
    quality: bestVariant.label,
    resLabel: bestVariant.label,
    dimensions: bestVariant.res || "1920×1080",
    variants: defaultVariants,
    time: Date.now()
  });
}

async function parseM3U8Variants(masterUrl) {
  const variants = [];
  try {
    const resp = await fetchWithTimeout(masterUrl, 2200);
    if (!resp.ok) return variants;
    const text = await resp.text();
    if (!text.includes("#EXT-X-STREAM-INF")) return variants;

    const masterQuery = masterUrl.includes("?") ? masterUrl.slice(masterUrl.indexOf("?")) : "";
    const lines = text.split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith("#EXT-X-STREAM-INF:")) {
        const resMatch = line.match(/RESOLUTION=(\d+x\d+)/i);
        const bwMatch = line.match(/BANDWIDTH=(\d+)/i);
        const res = resMatch ? resMatch[1] : "";
        const height = res ? parseInt(res.split("x")[1], 10) : 0;
        const bw = bwMatch ? parseInt(bwMatch[1], 10) : 0;

        let nextLine = "";
        for (let j = i + 1; j < lines.length; j++) {
          if (lines[j].trim() && !lines[j].trim().startsWith("#")) {
            nextLine = lines[j].trim();
            break;
          }
        }
        if (nextLine) {
          let resolvedUrl = new URL(nextLine, masterUrl).href;
          if (masterQuery && !resolvedUrl.includes("?")) {
            resolvedUrl += masterQuery;
          }
          const fmtRes = res ? res.replace("x", "×") : "";
          const label =
            height >= 2160
              ? `4K Ultra HD (${height}p)`
              : height >= 1080
              ? `1080p Full HD ${fmtRes ? "(" + fmtRes + ")" : ""}`
              : height >= 720
              ? `720p HD ${fmtRes ? "(" + fmtRes + ")" : ""}`
              : height > 0
              ? `${height}p SD ${fmtRes ? "(" + fmtRes + ")" : ""}`
              : "Stream Original";

          variants.push({
            label: label.trim(),
            res: fmtRes || "HD",
            height: height || 720,
            bandwidth: bw,
            approxBytes: bw > 0 ? Math.round((bw / 8) * 35) : 0,
            url: resolvedUrl,
            ext: "HLS",
            isStream: true
          });
        }
      }
    }
    variants.sort((a, b) => b.height - a.height || b.bandwidth - a.bandwidth);

    const unique = [];
    const seenLabels = new Set();
    for (const v of variants) {
      if (!seenLabels.has(v.label)) {
        seenLabels.add(v.label);
        unique.push(v);
      }
    }
    return unique;
  } catch (_) {}
  return variants;
}

function buildMediaItem(raw) {
  const url = raw.url;
  const type = raw.type || "image";
  const ytId = raw.ytId || extractYouTubeId(url);
  const isEngine = Boolean(raw.isEngine || ytId);
  const canonicalKey = getCanonicalMediaKey(url, type);
  const variants = raw.variants || buildQualityVariants(url, type, raw.width, raw.height, isEngine);
  const best = variants[0] || { label: "Original", url, res: "", ext: extractExt(url, type).toUpperCase() };

  let dims = "";
  if (raw.width && raw.height) {
    dims = `${raw.width}×${raw.height}`;
  } else if (best.res) {
    dims = best.res;
  }

  const extUpper = (raw.ext || extractExt(best.url, type)).toUpperCase();
  const pageTitle = raw.tabId && tabTitles[raw.tabId] ? tabTitles[raw.tabId] : "";
  const dur = Number(raw.duration) || 0;

  return {
    id: ytId ? "yt_" + ytId : type + "_" + hashStr(canonicalKey),
    key: canonicalKey,
    ytId: ytId || "",
    url: best.url,
    sourcePageUrl: raw.sourcePageUrl || (isEngine ? url : ""),
    previewUrl:
      raw.previewUrl || (type === "video" && !isEngine && !url.includes(".m3u8") ? url : ""),
    thumbnail:
      raw.thumbnail ||
      raw.poster ||
      (ytId ? `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg` : type === "image" ? url : ""),
    duration: dur,
    frameId: typeof raw.frameId === "number" ? raw.frameId : 0,
    type,
    isEngine,
    isStream: Boolean(raw.isStream || url.includes(".m3u8")),
    ext: extUpper,
    size: raw.size || (dur > 0 && type === "video" ? Math.round(dur * 320000) : 0),
    width: raw.width || 0,
    height: raw.height || 0,
    dimensions: dims,
    quality: best.label,
    resLabel: best.label,
    title: normalizeVideoTitle(
      raw.title || guessMediaTitle(url, type === "video" ? "Vídeo" : type === "audio" ? "Áudio" : "Foto"),
      pageTitle
    ),
    variants,
    time: Date.now()
  };
}

function getCanonicalMediaKey(url, type) {
  try {
    const ytId = extractYouTubeId(url);
    if (ytId) {
      return "youtube_vid_" + ytId;
    }
    const behanceMatch = url.match(
      /behance\.net\/project_modules\/[^/]+\/([a-zA-Z0-9_]+\.[a-zA-Z0-9_]+\.[a-zA-Z0-9]+)/i
    );
    if (behanceMatch) {
      return "behance_img_" + behanceMatch[1].toLowerCase();
    }
    const ccvMatch = url.match(/ccv\.adobe\.(?:com|io)\/(?:v1\/player\/ccv\/)?([a-zA-Z0-9_-]{8,15})/i);
    if (ccvMatch) {
      return "adobe_ccv_" + ccvMatch[1];
    }
    const mp4Rendition = url.match(/^(.*?)_(360|480|540|576|720|1080|2160)(\.mp4)/i);
    if (mp4Rendition && type === "video") {
      return "mp4_rendition_" + mp4Rendition[1];
    }
    const u = new URL(url);
    return type + ":" + u.origin + u.pathname;
  } catch (_) {
    return type + ":" + url.split("?")[0];
  }
}

function buildQualityVariants(url, type, width, height, isEngine = false) {
  if (isEngine || extractYouTubeId(url)) {
    return [
      { label: "1080p Full HD (MP4)", res: "1920×1080", height: 1080, url, ext: "MP4", isEngine: true },
      { label: "720p HD (MP4)", res: "1280×720", height: 720, url, ext: "MP4", isEngine: true },
      { label: "480p SD (MP4)", res: "854×480", height: 480, url, ext: "MP4", isEngine: true },
      { label: "360p Rápido (MP4)", res: "640×360", height: 360, url, ext: "MP4", isEngine: true }
    ];
  }

  const behanceMatch = url.match(
    /(https?:\/\/mir-s3-cdn-cf\.behance\.net\/project_modules)\/[^/]+\/([a-zA-Z0-9_]+\.[a-zA-Z0-9_]+\.[a-zA-Z0-9]+)/i
  );
  if (behanceMatch) {
    const base = behanceMatch[1];
    const file = behanceMatch[2];
    const ext = extractExt(file, "image").toUpperCase();
    return [
      { label: "Original (Source Máxima)", res: "Original", url: `${base}/source/${file}`, ext, isStream: false },
      { label: "Full Size (FS)", res: "Alta Resolução", url: `${base}/fs/${file}`, ext, isStream: false },
      { label: "4K Ultra HD (3840px)", res: "3840w", url: `${base}/max_3840/${file}`, ext, isStream: false },
      { label: "Full HD (1400px)", res: "1400w", url: `${base}/1400/${file}`, ext, isStream: false }
    ];
  }

  const extUpper = extractExt(url, type).toUpperCase();
  if (type === "video") {
    const mp4ResMatch = url.match(/^(.*?)_(360|480|540|576|720|1080|2160)(\.mp4.*)$/i);
    const detectedHeight = mp4ResMatch ? parseInt(mp4ResMatch[2], 10) : height || 1080;

    return [
      {
        label: "1080p Full HD (Máxima)",
        res: width && height ? `${width}×${height}` : "1920×1080",
        height: 1080,
        url,
        ext: extUpper,
        isStream: url.includes(".m3u8")
      },
      {
        label: "720p HD",
        res: "1280×720",
        height: 720,
        url,
        ext: extUpper,
        isStream: url.includes(".m3u8")
      },
      {
        label: `${detectedHeight < 720 ? detectedHeight : 480}p SD (Leve)`,
        res: "854×480",
        height: 480,
        url,
        ext: extUpper,
        isStream: url.includes(".m3u8")
      }
    ];
  }

  let resLabel = "Original (Máxima)";
  if (height >= 2160 || width >= 3840) resLabel = `4K Ultra HD (${width}×${height})`;
  else if (height >= 1080 || width >= 1920) resLabel = `Full HD (${width}×${height})`;
  else if (width > 0 && height > 0) resLabel = `Original (${width}×${height})`;

  return [
    {
      label: resLabel,
      res: width && height ? `${width}×${height}` : "",
      url,
      ext: extUpper,
      isStream: false
    }
  ];
}

function isPlaceholderTitle(str) {
  if (!str) return true;
  const s = String(str).trim().toLowerCase();
  return (
    !s ||
    s === "youtube" ||
    s === "vídeo" ||
    s === "video" ||
    s === "vídeo 1" ||
    s === "foto" ||
    s.startsWith("video_") ||
    s.startsWith("youtube video") ||
    s.includes("creative cloud player")
  );
}

function registerMediaItem(tabId, newItem) {
  if (!mediaStore[tabId]) {
    mediaStore[tabId] = new Map();
  }
  const map = mediaStore[tabId];
  const existing = map.get(newItem.key);

  if (existing) {
    if (newItem.masterUrl) existing.masterUrl = newItem.masterUrl;
    if (newItem.isEngine) {
      existing.isEngine = true;
      if (newItem.sourcePageUrl) existing.sourcePageUrl = newItem.sourcePageUrl;
      if (newItem.previewUrl) existing.previewUrl = newItem.previewUrl;
      if (newItem.variants && newItem.variants.length > 0) existing.variants = newItem.variants;
    } else if (newItem.isStream && newItem.variants && newItem.variants.length > 0) {
      const directMp4Url = !existing.isStream && existing.url.includes(".mp4") ? existing.url : existing.previewUrl;
      existing.variants = [...newItem.variants];
      if (directMp4Url && directMp4Url.includes(".mp4")) {
        existing.previewUrl = directMp4Url;
        existing.variants.push({
          label: "MP4 Direto (Compatível)",
          res: existing.dimensions || "SD/HD",
          height: 576,
          url: directMp4Url,
          ext: "MP4",
          isStream: false
        });
      }
      existing.url = newItem.url;
      existing.isStream = true;
      existing.resLabel = newItem.resLabel;
      existing.quality = newItem.quality;
    } else if (!newItem.isStream && newItem.url && newItem.url.includes(".mp4")) {
      existing.previewUrl = newItem.url;
      if (existing.isStream && existing.variants) {
        const hasDirect = existing.variants.some((v) => v.url === newItem.url);
        if (!hasDirect) {
          existing.variants.push({
            label: "MP4 Direto (Compatível)",
            res: newItem.dimensions || "SD/HD",
            height: 576,
            url: newItem.url,
            ext: "MP4",
            isStream: false
          });
        }
      }
    }

    if (newItem.size > existing.size) existing.size = newItem.size;
    if (newItem.duration > (existing.duration || 0)) existing.duration = newItem.duration;
    if (newItem.frameId && !existing.frameId) existing.frameId = newItem.frameId;
    if (newItem.thumbnail && (!existing.thumbnail || existing.thumbnail.startsWith("data:"))) {
      existing.thumbnail = newItem.thumbnail;
    }
    if (newItem.title && !isPlaceholderTitle(newItem.title) && isPlaceholderTitle(existing.title)) {
      existing.title = newItem.title;
    }
    if (newItem.width > existing.width) {
      existing.width = newItem.width;
      existing.height = newItem.height;
      existing.dimensions = `${newItem.width}×${newItem.height}`;
    }
  } else {
    map.set(newItem.key, newItem);
  }

  updateBadge(tabId);
}

function getTabItems(tabId) {
  const map = mediaStore[tabId];
  if (!map) return [];
  const arr = Array.from(map.values()).sort((a, b) => {
    if (a.type !== b.type) {
      if (a.type === "video") return -1;
      if (b.type === "video") return 1;
    }
    return (b.size || b.width || 0) - (a.size || a.width || 0);
  });

  const mainTitle = tabTitles[tabId] || "";
  let vidCount = 0;
  let imgCount = 0;
  let audCount = 0;

  return arr.map((item, idx) => {
    let displayTitle = normalizeVideoTitle(item.title, mainTitle);
    if (item.type === "video") {
      vidCount++;
      if (isPlaceholderTitle(displayTitle)) {
        displayTitle =
          !isPlaceholderTitle(mainTitle) ? mainTitle : `Vídeo #${vidCount}`;
      } else if (!displayTitle.match(/Vídeo\s*\d+/i) && arr.filter((x) => x.type === "video").length > 1) {
        displayTitle = `${displayTitle} - Vídeo ${vidCount}`;
      }
    } else if (item.type === "image") {
      imgCount++;
      if (!displayTitle || /^[a-f0-9_.-]{15,}$/i.test(displayTitle)) {
        displayTitle = !isPlaceholderTitle(mainTitle) ? `${mainTitle} - Foto ${imgCount}` : `Foto #${imgCount}`;
      }
    } else {
      audCount++;
      if (!displayTitle) displayTitle = `Áudio #${audCount}`;
    }
    return {
      ...item,
      index: idx + 1,
      title: displayTitle
    };
  });
}

function cleanMainTabTitle(raw) {
  if (!raw) return "";
  const cleaned = String(raw)
    .replace(/^\(\d+\)\s*/, "")
    .replace(/\s*[-|•::]+\s*(Behance|YouTube|Vimeo).*$/i, "")
    .replace(/Creative Cloud Player[\d.\s-]*/gi, "")
    .trim()
    .slice(0, 75);
  return isPlaceholderTitle(cleaned) ? "" : cleaned;
}

function normalizeVideoTitle(title, fallbackMainTitle) {
  let clean = String(title || "")
    .replace(/^\(\d+\)\s*/, "")
    .replace(/\s*-\s*YouTube$/i, "")
    .replace(/Creative Cloud Player[\d.\s-]*/gi, "")
    .replace(/^[\s-|•:]+|[\s-|•:]+$/g, "")
    .trim();
  if (isPlaceholderTitle(clean)) {
    return !isPlaceholderTitle(fallbackMainTitle) ? fallbackMainTitle : "Vídeo";
  }
  return clean.slice(0, 80);
}

function updateBadge(tabId) {
  const count = mediaStore[tabId] ? mediaStore[tabId].size : 0;
  chrome.action.setBadgeText({ tabId, text: count > 0 ? String(count) : "" });
  chrome.action.setBadgeBackgroundColor({ tabId, color: "#0284c7" });
}

async function resolveBestUrl(url, type, fallbackUrl) {
  const behanceMatch = url.match(
    /(https?:\/\/mir-s3-cdn-cf\.behance\.net\/project_modules)\/[^/]+\/([a-zA-Z0-9_]+\.[a-zA-Z0-9_]+\.[a-zA-Z0-9]+)/i
  );
  if (behanceMatch && type === "image") {
    try {
      const r = await fetchWithTimeout(url, 1800);
      if (r.ok) return url;
    } catch (_) {}
    const base = behanceMatch[1];
    const file = behanceMatch[2];
    for (const c of [`${base}/source/${file}`, `${base}/fs/${file}`, `${base}/max_3840/${file}`, `${base}/1400/${file}`]) {
      try {
        const r = await fetchWithTimeout(c, 1800);
        if (r.ok) return c;
      } catch (_) {}
    }
  }

  if (type === "video" && url.includes(".mp4")) {
    try {
      const r = await fetchWithTimeout(url, 1800);
      if (r.ok) return url;
    } catch (_) {}
    if (fallbackUrl && fallbackUrl.includes(".mp4")) {
      return fallbackUrl;
    }
  }

  return url;
}

async function triggerDownload(opts) {
  const item = opts.item || opts;
  let targetUrl = opts.url || item.url;
  const type = opts.type || item.type || "video";
  const site = sanitizeName(opts.site || item.site || "Web");
  const baseTitle = sanitizeName(opts.title || item.title || "midia");
  const resTag = opts.resLabel ? "_" + sanitizeName(opts.resLabel.split(" ")[0]) : "";
  const prefixNum = opts.orderPrefix ? `${String(opts.orderPrefix).padStart(2, "0")}_` : "";

  targetUrl = await resolveBestUrl(targetUrl, type, item.previewUrl || item.url);

  const folderType = type === "video" ? "Videos" : type === "audio" ? "Audios" : "Fotos";
  const ext = (opts.forceExt || extractExt(targetUrl, type)).toLowerCase();
  const filename = `MediaGrabber/${folderType}/${site}/${prefixNum}${baseTitle}${resTag}.${ext}`;

  const downloadId = await chrome.downloads.download({
    url: targetUrl,
    filename,
    saveAs: Boolean(opts.saveAs)
  });
  return downloadId;
}

// Enrich YouTube / External URL via Local Media Engine (auto-starts engine if needed)
async function enrichFromLocalEngine(tabId, targetUrl) {
  try {
    await ensureLocalEngineRunning();
    const resp = await fetchWithTimeout(`${ENGINE_BASE}/api/info`, 18000, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: targetUrl })
    });
    if (!resp.ok) return [];
    const data = await resp.json();
    const items = data.items || [];
    if (tabId) {
      for (const it of items) {
        it.tabId = tabId;
        registerMediaItem(tabId, buildMediaItem(it));
      }
    }
    return items;
  } catch (_) {
    return [];
  }
}

// Deep Scan across all frames in the active tab
async function runDeepScanOnTab(tabId, resetFirst = false) {
  if (!tabId) return;
  if (resetFirst) {
    clearTabStore(tabId);
  }

  try {
    const tabObj = await chrome.tabs.get(tabId).catch(() => null);
    if (tabObj && tabObj.title) {
      const cleaned = cleanMainTabTitle(tabObj.title);
      if (cleaned) tabTitles[tabId] = cleaned;
    }
    if (tabObj && tabObj.url) {
      tabUrls[tabId] = tabObj.url;
      const ytId = extractYouTubeId(tabObj.url);
      if (ytId) {
        // On YouTube watch/shorts/live, ensure only the current video is kept
        if (mediaStore[tabId]) {
          for (const k of Array.from(mediaStore[tabId].keys())) {
            if (k !== "youtube_vid_" + ytId) {
              mediaStore[tabId].delete(k);
            }
          }
        }
        const isShort = tabObj.url.includes("/shorts/");
        const canonicalYtUrl = isShort
          ? `https://www.youtube.com/shorts/${ytId}`
          : `https://www.youtube.com/watch?v=${ytId}`;
        registerMediaItem(
          tabId,
          buildMediaItem({
            url: canonicalYtUrl,
            sourcePageUrl: canonicalYtUrl,
            ytId,
            isEngine: true,
            type: "video",
            ext: "MP4",
            title: tabTitles[tabId] || `Vídeo ${ytId}`,
            thumbnail: `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`,
            width: isShort ? 1080 : 1920,
            height: isShort ? 1920 : 1080,
            tabId
          })
        );
        enrichFromLocalEngine(tabId, canonicalYtUrl);
      }
    }

    const results = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: () => {
        const found = [];
        const rawTitle = (document.title || "")
          .replace(/^\(\d+\)\s*/, "")
          .replace(/Creative Cloud Player[\d.\s-]*/gi, "")
          .replace(/\s*[-|•]\s*(Behance|YouTube).*$/i, "")
          .trim();

        let ytId = null;
        try {
          const u = new URL(location.href);
          if (u.hostname.includes("youtube.com")) {
            if (u.pathname === "/watch") ytId = u.searchParams.get("v");
            else if (u.pathname.startsWith("/shorts/")) ytId = u.pathname.split("/")[2];
            else if (u.pathname.startsWith("/live/")) ytId = u.pathname.split("/")[2];
          }
        } catch (_) {}

        if (ytId) {
          const v = document.querySelector("video.html5-main-video") || document.querySelector("video");
          const dur = v && Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 0;
          const w = (v && v.videoWidth) || 1920;
          const h = (v && v.videoHeight) || 1080;
          const ytTitleEl = document.querySelector(
            "ytd-watch-metadata h1 yt-formatted-string, h1.ytd-watch-metadata, ytd-reel-video-renderer[is-active] h2, #title h1"
          );
          const domTitle = ytTitleEl && ytTitleEl.textContent ? ytTitleEl.textContent.trim() : "";
          const ytTitle =
            domTitle.length > 2 && domTitle.toLowerCase() !== "youtube"
              ? domTitle
              : rawTitle.toLowerCase() !== "youtube"
              ? rawTitle
              : "";
          const isShort = location.pathname.startsWith("/shorts/");
          const canonicalUrl = isShort
            ? `https://www.youtube.com/shorts/${ytId}`
            : `https://www.youtube.com/watch?v=${ytId}`;

          let poster = `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`;
          if (v && v.readyState >= 2 && v.videoWidth > 0) {
            try {
              const c = document.createElement("canvas");
              c.width = 320;
              c.height = Math.round((320 * v.videoHeight) / v.videoWidth) || 180;
              c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
              poster = c.toDataURL("image/jpeg", 0.85);
            } catch (_) {}
          }

          found.push({
            url: canonicalUrl,
            sourcePageUrl: canonicalUrl,
            ytId,
            isEngine: true,
            type: "video",
            title: ytTitle || `Vídeo ${ytId}`,
            poster,
            thumbnail: poster,
            duration: dur,
            width: w,
            height: h
          });
          return found;
        }

        function getElementTitle(el, fallbackPrefix, idx) {
          const aria =
            el.getAttribute && (el.getAttribute("title") || el.getAttribute("aria-label") || el.getAttribute("alt"));
          if (aria && aria.trim().length > 2 && !aria.includes("Creative Cloud Player")) return aria.trim();
          const container =
            el.closest && el.closest("figure, article, section, [class*='Project'], [class*='module']");
          if (container) {
            const heading = container.querySelector(
              "h1, h2, h3, h4, figcaption, [class*='title'], [class*='Title']"
            );
            if (heading && heading.textContent.trim().length > 2) {
              return heading.textContent.trim().slice(0, 70);
            }
          }
          return rawTitle ? `${rawTitle} - ${fallbackPrefix} ${idx}` : `${fallbackPrefix} ${idx}`;
        }

        // 1. Videos & Sources in DOM
        let vIdx = 0;
        let domVideoDuration = 0;
        let domVideoThumb = "";

        document.querySelectorAll("video").forEach((v) => {
          vIdx++;
          const urls = new Set();
          if (v.currentSrc && v.currentSrc.startsWith("http")) urls.add(v.currentSrc);
          if (v.src && v.src.startsWith("http")) urls.add(v.src);
          v.querySelectorAll("source").forEach((s) => {
            if (s.src && s.src.startsWith("http")) urls.add(s.src);
          });

          const dur = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 0;
          if (dur > domVideoDuration) domVideoDuration = dur;

          let poster = v.poster || "";
          if (!poster) {
            const parentImg = v.parentElement && v.parentElement.querySelector("img");
            if (parentImg && parentImg.src) poster = parentImg.src;
          }
          if (v.readyState >= 2 && v.videoWidth > 0) {
            try {
              const c = document.createElement("canvas");
              c.width = 240;
              c.height = Math.round((240 * v.videoHeight) / v.videoWidth) || 135;
              c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
              poster = c.toDataURL("image/jpeg", 0.82);
            } catch (_) {}
          }
          if (poster && !domVideoThumb) domVideoThumb = poster;

          const w = v.videoWidth || v.clientWidth || 0;
          const h = v.videoHeight || v.clientHeight || 0;
          const title = getElementTitle(v, "Vídeo", vIdx);

          if (urls.size === 0 && (v.currentSrc || v.src || "").startsWith("blob:")) {
            found.push({
              url: location.href,
              sourcePageUrl: location.href,
              isEngine: true,
              type: "video",
              title,
              poster,
              thumbnail: poster,
              duration: dur,
              width: w || 1920,
              height: h || 1080
            });
          }

          urls.forEach((u) => {
            found.push({
              url: u,
              type: "video",
              title,
              poster,
              thumbnail: poster,
              duration: dur,
              width: w,
              height: h
            });
          });
        });

        // 2. Performance Resource Timing
        let framePoster = domVideoThumb;
        const domImgs = document.querySelectorAll("img");
        if (!framePoster && domImgs.length === 1 && domImgs[0].src) {
          framePoster = domImgs[0].src;
        }

        try {
          const entries = performance.getEntriesByType("resource") || [];
          if (!framePoster && entries.length > 0 && entries.length < 45) {
            const imgEntry = entries.find((e) => /\.(jpg|jpeg|png|webp)(\?|$)/i.test(e.name || ""));
            if (imgEntry) framePoster = imgEntry.name;
          }
          entries.forEach((entry) => {
            const u = entry.name;
            if (!u || !u.startsWith("http")) return;
            const low = u.toLowerCase();
            if (
              low.includes(".ts") ||
              low.includes(".m4s") ||
              low.includes("init.mp4") ||
              low.includes("googlevideo.com")
            ) {
              return;
            }

            if (low.includes(".m3u8") || low.includes(".mp4") || low.includes(".webm")) {
              found.push({
                url: u,
                type: "video",
                title: rawTitle || "Vídeo",
                poster: framePoster,
                thumbnail: framePoster,
                duration: domVideoDuration,
                size: entry.encodedBodySize || 0
              });
            } else if (
              low.includes("behance.net/project_modules/") &&
              /\.(jpg|jpeg|png|webp)(\?|$)/i.test(low)
            ) {
              found.push({
                url: u,
                type: "image",
                title: rawTitle || "Foto",
                size: entry.encodedBodySize || 0
              });
            }
          });
        } catch (_) {}

        // 3. High-Resolution Images in DOM (skip on YouTube)
        if (!location.hostname.includes("youtube.com")) {
          let iIdx = 0;
          document.querySelectorAll("img").forEach((el) => {
            let src =
              el.currentSrc ||
              el.src ||
              el.getAttribute("data-src") ||
              el.getAttribute("data-original") ||
              "";
            const srcset = el.getAttribute("srcset") || "";
            if (srcset) {
              const parts = srcset
                .split(",")
                .map((s) => s.trim().split(/\s+/)[0])
                .filter((s) => s && s.startsWith("http"));
              if (parts.length > 0) src = parts[parts.length - 1];
            }
            if (!src || !src.startsWith("http")) return;
            const low = src.toLowerCase();
            if (low.includes("avatar") || low.includes("profile") || low.includes("favicon") || low.endsWith(".svg")) {
              return;
            }
            const w = el.naturalWidth || el.width || el.clientWidth || 0;
            const h = el.naturalHeight || el.height || el.clientHeight || 0;
            const isPortfolioImg =
              low.includes("project_modules") ||
              low.includes("behance.net/projects/") ||
              low.includes("unsplash") ||
              low.includes("pinimg");

            if (isPortfolioImg || (w >= 250 && h >= 180)) {
              iIdx++;
              found.push({
                url: src,
                type: "image",
                title: getElementTitle(el, "Foto", iIdx),
                thumbnail: el.currentSrc || el.src || src,
                width: w,
                height: h
              });
            }
          });
        }

        return found;
      }
    });

    if (results) {
      for (const frameResult of results) {
        const frameId = frameResult.frameId || 0;
        const items = frameResult.result || [];
        for (const item of items) {
          item.frameId = frameId;
          item.tabId = tabId;
          if (item.url.includes(".m3u8")) {
            await handleM3U8Detected(
              tabId,
              item.url,
              item.title,
              item.thumbnail || item.poster,
              item.duration,
              frameId
            );
          } else {
            registerMediaItem(tabId, buildMediaItem(item));
          }
        }
      }
    }
  } catch (_) {}
}

async function autoScrollAndScanTab(tabId) {
  if (!tabId) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: false },
      func: async () => {
        const step = Math.max(600, Math.floor(window.innerHeight * 0.85));
        const maxSteps = 12;
        for (let i = 0; i < maxSteps; i++) {
          if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 10) break;
          window.scrollBy({ top: step, behavior: "smooth" });
          await new Promise((r) => setTimeout(r, 260));
        }
        window.scrollTo({ top: 0, behavior: "smooth" });
        await new Promise((r) => setTimeout(r, 350));
      }
    });
  } catch (_) {}
  await runDeepScanOnTab(tabId, true);
}

async function seekAndCaptureTabVideo(tabId, frameId, timeSec) {
  if (!tabId) return null;
  try {
    const target = frameId ? { tabId, frameIds: [frameId] } : { tabId, allFrames: true };
    const results = await chrome.scripting.executeScript({
      target,
      args: [Number(timeSec) || 0],
      func: async (targetTime) => {
        const v = document.querySelector("video.html5-main-video") || document.querySelector("video");
        if (!v) return null;

        if (v.readyState < 1) {
          try {
            v.preload = "auto";
            v.load();
          } catch (_) {}
        }

        const dur = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 0;
        const clamped = dur > 0 ? Math.min(Math.max(0, targetTime), Math.max(0, dur - 0.05)) : Math.max(0, targetTime);

        if (Math.abs(v.currentTime - clamped) > 0.08) {
          await new Promise((resolve) => {
            const onSeek = () => {
              v.removeEventListener("seeked", onSeek);
              resolve();
            };
            v.addEventListener("seeked", onSeek);
            try {
              v.currentTime = clamped;
            } catch (_) {
              resolve();
            }
            setTimeout(() => {
              v.removeEventListener("seeked", onSeek);
              resolve();
            }, 650);
          });
        }

        let frameDataUrl = "";
        if (v.videoWidth > 0 && v.videoHeight > 0) {
          try {
            const c = document.createElement("canvas");
            const maxW = 640;
            const scale = Math.min(1, maxW / v.videoWidth);
            c.width = Math.round(v.videoWidth * scale);
            c.height = Math.round(v.videoHeight * scale);
            c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
            frameDataUrl = c.toDataURL("image/jpeg", 0.85);
          } catch (_) {}
        }

        const ytTitleEl = document.querySelector(
          "ytd-watch-metadata h1 yt-formatted-string, h1.ytd-watch-metadata, ytd-reel-video-renderer[is-active] h2"
        );
        const videoTitle = ytTitleEl && ytTitleEl.textContent ? ytTitleEl.textContent.trim() : "";

        return {
          duration: dur,
          currentTime: v.currentTime || clamped,
          width: v.videoWidth || 0,
          height: v.videoHeight || 0,
          frameDataUrl,
          poster: v.poster || "",
          title: videoTitle
        };
      }
    });

    if (results) {
      for (const r of results) {
        if (r && r.result && (r.result.frameDataUrl || r.result.duration > 0)) {
          return r.result;
        }
      }
    }
  } catch (_) {}
  return null;
}

function extractStreamKey(url) {
  const ccv = url.match(/ccv\.adobe\.(?:com|io)\/(?:v1\/player\/ccv\/)?([a-zA-Z0-9_-]{8,15})/i);
  if (ccv) return "ccv_" + ccv[1];
  return url.split("?")[0];
}

function extractExt(url, type) {
  try {
    const clean = url.split("?")[0].split("#")[0];
    const m = clean.match(/\.([a-zA-Z0-9]{2,5})$/);
    if (m) {
      const e = m[1].toLowerCase();
      if (e === "m3u8" || e === "ts") return "mp4";
      if (["mp4", "webm", "mkv", "mov", "jpg", "jpeg", "png", "webp", "gif", "mp3", "m4a", "wav"].includes(e)) {
        return e;
      }
    }
  } catch (_) {}
  return type === "video" ? "mp4" : type === "audio" ? "mp3" : "jpg";
}

function guessMediaTitle(url, fallback) {
  try {
    const clean = url.split("?")[0].split("#")[0];
    const parts = clean.split("/").filter(Boolean);
    let last = parts[parts.length - 1] || fallback;
    if (last === "master.m3u8" && parts.length >= 2) {
      last = "Video_" + parts[parts.length - 2];
    }
    return decodeURIComponent(last).replace(/\.[^.]+$/, "");
  } catch (_) {
    return fallback;
  }
}

function sanitizeName(str) {
  return (
    String(str || "arquivo")
      .replace(/[\\/:*?"<>|]+/g, "_")
      .replace(/\s+/g, "_")
      .replace(/^_+|_+$/g, "")
      .substring(0, 60) || "arquivo"
  );
}

function getDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch (_) {
    return "Site";
  }
}

function hashStr(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h).toString(36);
}

function safeReply(sendResponse, payload) {
  try {
    sendResponse(payload);
  } catch (_) {}
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (!request || !request.action) return false;

  if (request.action === "ENSURE_ENGINE") {
    ensureLocalEngineRunning()
      .then((ok) => safeReply(sendResponse, { ok }))
      .catch(() => safeReply(sendResponse, { ok: false }));
    return true;
  }

  if (request.action === "SPA_URL_CHANGED") {
    if (sender.tab && sender.tab.id) {
      const tabId = sender.tab.id;
      tabUrls[tabId] = request.url || sender.tab.url || "";
      if (request.title) {
        const cleaned = cleanMainTabTitle(request.title);
        if (cleaned) tabTitles[tabId] = cleaned;
      }
      clearTabStore(tabId);
      runDeepScanOnTab(tabId, false);
    }
    safeReply(sendResponse, { ok: true });
    return false;
  }

  if (request.action === "GET_MEDIA") {
    const tabId = request.tabId;
    const list = getTabItems(tabId);
    safeReply(sendResponse, { items: list, media: list });
    return false;
  }

  if (request.action === "DEEP_SCAN" || request.action === "DEEP_SCAN_TAB") {
    const tabId = request.tabId;
    const resetFirst = Boolean(request.reset);
    runDeepScanOnTab(tabId, resetFirst)
      .then(() => {
        const list = getTabItems(tabId);
        safeReply(sendResponse, { items: list, media: list });
      })
      .catch(() => {
        const list = getTabItems(tabId);
        safeReply(sendResponse, { items: list, media: list });
      });
    return true;
  }

  if (request.action === "RESET_AND_SCAN_TAB") {
    const tabId = request.tabId;
    runDeepScanOnTab(tabId, true)
      .then(() => {
        const list = getTabItems(tabId);
        safeReply(sendResponse, { items: list, media: list });
      })
      .catch(() => {
        safeReply(sendResponse, { items: [], media: [] });
      });
    return true;
  }

  if (request.action === "SCAN_EXTERNAL_URL") {
    const tabId = request.tabId;
    const targetUrl = String(request.url || "").trim();
    if (request.reset && tabId) {
      clearTabStore(tabId);
    }
    enrichFromLocalEngine(tabId, targetUrl)
      .then((engineItems) => {
        if (engineItems.length === 0 && targetUrl.startsWith("http")) {
          const ytId = extractYouTubeId(targetUrl);
          const fallbackItem = buildMediaItem({
            url: targetUrl,
            sourcePageUrl: targetUrl,
            ytId,
            isEngine: true,
            type: "video",
            ext: "MP4",
            title: ytId ? `Vídeo (${ytId})` : guessMediaTitle(targetUrl, "Vídeo do Link"),
            thumbnail: ytId ? `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg` : "",
            tabId
          });
          if (tabId) registerMediaItem(tabId, fallbackItem);
        }
        const list = tabId ? getTabItems(tabId) : engineItems;
        safeReply(sendResponse, { ok: true, items: list, media: list });
      })
      .catch(() => {
        const list = tabId ? getTabItems(tabId) : [];
        safeReply(sendResponse, { ok: false, items: list, media: list });
      });
    return true;
  }

  if (request.action === "AUTO_SCROLL_SCAN") {
    const tabId = request.tabId;
    autoScrollAndScanTab(tabId)
      .then(() => {
        const list = getTabItems(tabId);
        safeReply(sendResponse, { items: list, media: list });
      })
      .catch(() => {
        const list = getTabItems(tabId);
        safeReply(sendResponse, { items: list, media: list });
      });
    return true;
  }

  if (request.action === "SEEK_TAB_VIDEO") {
    seekAndCaptureTabVideo(request.tabId, request.frameId, request.timeSec)
      .then((res) => {
        if (res && res.title && request.tabId && mediaStore[request.tabId]) {
          for (const it of mediaStore[request.tabId].values()) {
            if (isPlaceholderTitle(it.title)) {
              it.title = res.title;
            }
          }
        }
        safeReply(sendResponse, res || { ok: false });
      })
      .catch(() => {
        safeReply(sendResponse, { ok: false });
      });
    return true;
  }

  if (request.action === "OPEN_DOWNLOAD_FOLDER") {
    if (request.filePath) {
      ensureLocalEngineRunning().then(() => {
        fetchWithTimeout(`${ENGINE_BASE}/api/open-folder`, 2000, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filePath: request.filePath })
        }).catch(() => {
          try {
            chrome.downloads.showDefaultFolder();
          } catch (_) {}
        });
      });
    } else {
      try {
        if (request.downloadId) {
          chrome.downloads.show(request.downloadId);
        } else {
          chrome.downloads.showDefaultFolder();
        }
      } catch (_) {}
    }
    safeReply(sendResponse, { ok: true });
    return false;
  }

  if (request.action === "ADD_DOM_MEDIA" || request.action === "ADD_MEDIA_FROM_DOM") {
    const payload = request.media || request.item;
    if (sender.tab && sender.tab.id && payload && payload.url) {
      const frameId = sender.frameId || 0;
      payload.frameId = frameId;
      payload.tabId = sender.tab.id;
      if (payload.url.includes(".m3u8")) {
        handleM3U8Detected(
          sender.tab.id,
          payload.url,
          payload.title,
          payload.thumbnail || payload.poster,
          payload.duration,
          frameId
        );
      } else {
        registerMediaItem(sender.tab.id, buildMediaItem(payload));
        if (payload.isEngine || payload.ytId) {
          enrichFromLocalEngine(sender.tab.id, payload.sourcePageUrl || payload.url);
        }
      }
      safeReply(sendResponse, { status: "ok" });
    }
    return false;
  }

  if (request.action === "CLEAR_MEDIA") {
    const tabId = request.tabId;
    clearTabStore(tabId);
    safeReply(sendResponse, { status: "cleared", items: [], media: [] });
    return false;
  }

  if (request.action === "DOWNLOAD" || request.action === "DOWNLOAD_MEDIA") {
    triggerDownload(request)
      .then((downloadId) => {
        safeReply(sendResponse, { status: "started", downloadId });
      })
      .catch(() => {
        safeReply(sendResponse, { status: "error" });
      });
    return true;
  }

  return false;
});
