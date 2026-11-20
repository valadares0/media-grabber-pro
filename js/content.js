// =========================================================================
// Media Grabber Pro v4.0 - Content Script, YouTube SPA Watcher & Frame Scanner
// Instant detection for YouTube (Videos, Lives, Shorts), HTML5 Video & Images
// =========================================================================

(function () {
  if (window.__mediaGrabberLoaded) return;
  window.__mediaGrabberLoaded = true;

  const reportedUrls = new Set();
  let lastKnownHref = location.href;

  function cleanTitle(raw) {
    if (!raw) return document.title || "Midia";
    return String(raw)
      .replace(/^\(\d+\)\s*/, "")
      .replace(/\s*-\s*YouTube$/i, "")
      .replace(/Creative Cloud Player[\d.\s-]*/gi, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 85);
  }

  function extractYouTubeId(urlStr) {
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

  function getYouTubeDomTitle() {
    const selectors = [
      "ytd-watch-metadata h1 yt-formatted-string",
      "h1.ytd-watch-metadata",
      "ytd-reel-video-renderer[is-active] h2",
      "ytd-reel-player-overlay-renderer h2",
      "#title h1"
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent && el.textContent.trim().length > 2) {
        return cleanTitle(el.textContent);
      }
    }
    return cleanTitle(document.title);
  }

  function sendMedia(payload) {
    if (!payload || !payload.url) return;
    if (
      payload.url.startsWith("data:") ||
      payload.url.startsWith("blob:") ||
      payload.url.startsWith("chrome-extension:")
    ) {
      return;
    }
    const dedupKey = payload.url + "|" + (payload.duration || 0);
    if (reportedUrls.has(dedupKey)) return;
    reportedUrls.add(dedupKey);

    try {
      chrome.runtime.sendMessage({
        action: "ADD_DOM_MEDIA",
        media: payload
      });
    } catch (_) {}
  }

  function scanFrameMedia() {
    const pageTitle = cleanTitle(document.title);
    const ytId = extractYouTubeId(location.href);

    // 0. Special Fast-Path for YouTube Watch, Live & Shorts
    if (ytId) {
      const mainVid = document.querySelector("video.html5-main-video") || document.querySelector("video");
      const dur = mainVid && Number.isFinite(mainVid.duration) && mainVid.duration > 0 ? mainVid.duration : 0;
      const w = (mainVid && mainVid.videoWidth) || 1920;
      const h = (mainVid && mainVid.videoHeight) || 1080;
      const isShort = location.pathname.startsWith("/shorts/");
      const canonicalUrl = isShort
        ? `https://www.youtube.com/shorts/${ytId}`
        : `https://www.youtube.com/watch?v=${ytId}`;
      const ytTitle = getYouTubeDomTitle() || pageTitle || `YouTube Video ${ytId}`;
      const ytThumb = `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`;

      sendMedia({
        url: canonicalUrl,
        sourcePageUrl: canonicalUrl,
        isEngine: true,
        ytId,
        type: "video",
        ext: "MP4",
        quality: "1080p Full HD (MP4)",
        title: ytTitle,
        thumbnail: ytThumb,
        duration: dur,
        width: w,
        height: h
      });
    }

    // 1. Scan <video> elements and <source> children
    document.querySelectorAll("video").forEach((v, idx) => {
      const urls = new Set();
      if (v.currentSrc && v.currentSrc.startsWith("http")) urls.add(v.currentSrc);
      if (v.src && v.src.startsWith("http")) urls.add(v.src);
      v.querySelectorAll("source").forEach((s) => {
        if (s.src && s.src.startsWith("http")) urls.add(s.src);
      });

      const dur = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 0;
      const poster = v.poster || null;
      const w = v.videoWidth || v.clientWidth || 0;
      const h = v.videoHeight || v.clientHeight || 0;
      const title = cleanTitle(
        v.getAttribute("title") ||
          v.getAttribute("aria-label") ||
          `${pageTitle} - Vídeo ${idx + 1}`
      );

      // If video uses MSE (blob:) on a non-YouTube site, register the page URL for the Local Media Engine
      if (urls.size === 0 && !ytId && (v.currentSrc || v.src || "").startsWith("blob:")) {
        sendMedia({
          url: location.href,
          sourcePageUrl: location.href,
          isEngine: true,
          type: "video",
          ext: "MP4",
          quality: h >= 1080 ? "1080p Full HD" : "720p HD",
          title: pageTitle || `Vídeo ${idx + 1}`,
          thumbnail: poster,
          duration: dur,
          width: w || 1920,
          height: h || 1080
        });
      }

      urls.forEach((u) => {
        const isHls = u.includes(".m3u8");
        sendMedia({
          url: u,
          type: "video",
          ext: isHls ? "HLS" : "MP4",
          quality: h >= 1080 ? "1080p Full HD" : h >= 720 ? "720p HD" : "Original (Vídeo)",
          title,
          thumbnail: poster,
          duration: dur,
          width: w,
          height: h
        });
      });
    });

    // 2. Scan <audio> elements
    document.querySelectorAll("audio").forEach((a, idx) => {
      const u = a.currentSrc || a.src;
      if (u && u.startsWith("http")) {
        sendMedia({
          url: u,
          type: "audio",
          ext: "MP3",
          quality: "Áudio Original",
          title: `${pageTitle} - Áudio ${idx + 1}`
        });
      }
    });

    // 3. Scan high-res <img> elements & srcset (skip tiny YouTube UI thumbnails when on watch/shorts page)
    if (!ytId) {
      document.querySelectorAll("img").forEach((img, idx) => {
        const w = img.naturalWidth || img.width || img.clientWidth || 0;
        const h = img.naturalHeight || img.height || img.clientHeight || 0;
        if (w < 220 && h < 220 && !img.srcset && !img.dataset?.src) return;

        let bestUrl = img.currentSrc || img.src || img.dataset?.src || "";
        if (img.srcset) {
          const candidates = img.srcset
            .split(",")
            .map((p) => {
              const parts = p.trim().split(/\s+/);
              return {
                url: parts[0],
                score: parseInt(parts[1] || "0", 10) || 0
              };
            })
            .filter((c) => c.url && c.url.startsWith("http"))
            .sort((a, b) => b.score - a.score);
          if (candidates.length > 0) bestUrl = candidates[0].url;
        }

        if (!bestUrl || !bestUrl.startsWith("http")) return;
        const lower = bestUrl.toLowerCase();
        if (
          lower.includes("avatar") ||
          lower.includes("favicon") ||
          lower.includes("logo") ||
          lower.includes("sprite") ||
          lower.endsWith(".svg")
        ) {
          return;
        }

        const altTitle = cleanTitle(img.alt || img.title || `${pageTitle} - Foto ${idx + 1}`);
        sendMedia({
          url: bestUrl,
          type: "image",
          ext: lower.includes(".png") ? "PNG" : lower.includes(".webp") ? "WEBP" : "JPG",
          quality: w >= 1920 ? `Alta (${w}×${h})` : w > 0 ? `${w}×${h}px` : "Alta Resolução",
          title: altTitle,
          thumbnail: img.currentSrc || img.src || bestUrl,
          width: w,
          height: h
        });
      });
    }

    // 4. Scan Performance Resource Timing entries
    try {
      const resources = performance.getEntriesByType("resource") || [];
      for (const r of resources) {
        const u = r.name;
        if (!u || !u.startsWith("http")) continue;
        const lower = u.toLowerCase();
        if (lower.includes("googlevideo.com/videoplayback")) continue;
        if (lower.includes(".m3u8") || lower.includes(".mp4") || lower.includes(".webm")) {
          if (lower.includes(".ts") || lower.includes(".m4s")) continue;
          sendMedia({
            url: u,
            type: "video",
            ext: lower.includes(".m3u8") ? "HLS" : "MP4",
            quality: lower.includes("1080")
              ? "1080p Full HD"
              : lower.includes("720")
              ? "720p HD"
              : lower.includes(".m3u8")
              ? "Stream Master (Multi-Res)"
              : "Vídeo Direto",
            title: `${pageTitle} - Stream de Vídeo`
          });
        } else if (lower.includes("project_modules/") && /\.(jpg|jpeg|png|webp)(\?|$)/i.test(lower)) {
          sendMedia({
            url: u,
            type: "image",
            ext: "JPG",
            quality: "Original (Source)",
            title: `${pageTitle} - Imagem`
          });
        }
      }
    } catch (_) {}
  }

  function handleSpaNavigation() {
    if (location.href !== lastKnownHref) {
      lastKnownHref = location.href;
      reportedUrls.clear();
      try {
        chrome.runtime.sendMessage({
          action: "SPA_URL_CHANGED",
          url: location.href,
          title: document.title
        });
      } catch (_) {}
      setTimeout(scanFrameMedia, 250);
      setTimeout(scanFrameMedia, 1200);
    }
  }

  // YouTube & SPA Navigation Listeners
  window.addEventListener("yt-navigate-finish", () => {
    lastKnownHref = "";
    handleSpaNavigation();
  });
  window.addEventListener("yt-page-data-updated", () => {
    setTimeout(scanFrameMedia, 300);
  });
  window.addEventListener("popstate", handleSpaNavigation);
  setInterval(handleSpaNavigation, 800);

  // Initial scan + delayed scans for lazy players
  scanFrameMedia();
  setTimeout(scanFrameMedia, 1000);
  setTimeout(scanFrameMedia, 2800);

  // Throttled MutationObserver
  let scanTimer = null;
  const observer = new MutationObserver(() => {
    if (scanTimer) return;
    scanTimer = setTimeout(() => {
      scanTimer = null;
      scanFrameMedia();
    }, 1000);
  });

  if (document.documentElement) {
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  // Listen for explicit scan requests from popup/background
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.action === "SCAN_DOM") {
      reportedUrls.clear();
      scanFrameMedia();
      sendResponse({ ok: true });
    }
    return false;
  });
})();
