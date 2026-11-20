// =========================================================================
// Media Grabber Pro - AI Viral Clips Engine (estilo OpusClip)
// Fluxo: transcrição com timestamps (legendas yt-dlp) -> Gemini pontua os
// melhores momentos -> ffmpeg renderiza 9:16 + legenda dinâmica palavra a palavra.
// =========================================================================

const { spawn, spawnSync } = require("child_process");
const https = require("https");
const path = require("path");
const fs = require("fs");
const os = require("os");
const padroesStore = require("./padroes_store");
const { gerarAss, carregarFontes } = require("./motor_padrao/lib/legenda_ass");
const { aplicarRegras, elementosPorGatilho } = require("./motor_padrao/lib/regras");
const { montarComando } = require("./motor_padrao/lib/composicao");
const { promptPlano, schemaPlanoGemini, validarPlanoIA } = require("./motor_padrao/lib/plano_ia");
const { importarPadrao } = require("./motor_padrao/lib/importar_padrao");

const CONFIG_DIR = path.join(os.homedir(), ".mediagrabber");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");
const USAGE_FILE = path.join(CONFIG_DIR, "usage.json");
const CLIENTS_DIR = path.join(CONFIG_DIR, "clients");
const WORK_ROOT = path.join(os.tmpdir(), "mediagrabber_ai");

function listClients() {
  try {
    if (!fs.existsSync(CLIENTS_DIR)) return [];
    return fs.readdirSync(CLIENTS_DIR)
      .filter((f) => f.endsWith(".json"))
      .map((f) => {
        try { return JSON.parse(fs.readFileSync(path.join(CLIENTS_DIR, f), "utf8")); }
        catch (_) { return null; }
      })
      .filter(Boolean);
  } catch (_) { return []; }
}

function getClient(id) {
  if (!id) return null;
  try {
    const p = path.join(CLIENTS_DIR, `${String(id).replace(/[^a-z0-9_-]/gi, "")}.json`);
    return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null;
  } catch (_) { return null; }
}

function saveClient(profile) {
  fs.mkdirSync(CLIENTS_DIR, { recursive: true });
  const id = String(profile.id || profile.name || "cliente")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || ("c_" + Date.now());
  const full = { ...profile, id, updatedAt: new Date().toISOString() };
  fs.writeFileSync(path.join(CLIENTS_DIR, `${id}.json`), JSON.stringify(full, null, 2));
  return full;
}

function deleteClient(id) {
  try {
    const p = path.join(CLIENTS_DIR, `${String(id).replace(/[^a-z0-9_-]/gi, "")}.json`);
    if (fs.existsSync(p)) fs.unlinkSync(p);
    return true;
  } catch (_) { return false; }
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function loadUsage() {
  const today = todayStr();
  try {
    const u = JSON.parse(fs.readFileSync(USAGE_FILE, "utf8"));
    if (u.date !== today) {
      u.date = today;
      u.todayTokens = 0;
      u.todayPromptTokens = 0;
      u.todayOutputTokens = 0;
      u.todayRequests = 0;
    }
    return u;
  } catch (_) {
    return {
      date: today,
      todayTokens: 0,
      todayPromptTokens: 0,
      todayOutputTokens: 0,
      todayRequests: 0,
      totalTokens: 0,
      totalRequests: 0,
      lastTokens: 0,
      lastModel: ""
    };
  }
}

function recordUsage(meta, model) {
  if (!meta) return loadUsage();
  const u = loadUsage();
  const pt = Number(meta.promptTokenCount) || 0;
  const ct = Number(meta.candidatesTokenCount) || 0;
  const tt = Number(meta.totalTokenCount) || pt + ct;
  u.todayTokens += tt;
  u.todayPromptTokens = (u.todayPromptTokens || 0) + pt;
  u.todayOutputTokens = (u.todayOutputTokens || 0) + ct;
  u.todayRequests += 1;
  u.totalTokens = (u.totalTokens || 0) + tt;
  u.totalRequests = (u.totalRequests || 0) + 1;
  u.lastTokens = tt;
  u.lastModel = model;
  try {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(USAGE_FILE, JSON.stringify(u, null, 2));
  } catch (_) {}
  return u;
}

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
  } catch (_) {
    return {};
  }
}

function saveConfig(patch) {
  const cfg = { ...loadConfig(), ...patch };
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
  return cfg;
}

function getApiKey() {
  return loadConfig().geminiApiKey || process.env.GEMINI_API_KEY || "";
}

function getModel() {
  const m = loadConfig().geminiModel;
  // Migra automaticamente modelos antigos/descontinuados para os ativos
  if (!m || /2\.0-flash|2\.5-flash|flash-latest$/i.test(m)) return "gemini-3-flash-preview";
  return m;
}

function logError(context, err) {
  try {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    const line = `[${new Date().toISOString()}] [${context}] ${err?.stack || err}\n`;
    fs.appendFileSync(path.join(CONFIG_DIR, "errors.log"), line);
  } catch (_) {}
}

function run(bin, args, opts = {}, onLine) {
  return new Promise((resolve) => {
    let out = "";
    let err = "";
    let proc;
    try {
      proc = spawn(bin, args, { windowsHide: true, ...opts });
    } catch (e) {
      return resolve({ code: -1, out, err: e.message });
    }
    const feed = (buf, isErr) => {
      const s = buf.toString("utf8");
      if (isErr) err += s;
      else out += s;
      if (onLine) s.split(/\r?\n|\r/).forEach((l) => l.trim() && onLine(l.trim()));
    };
    proc.stdout.on("data", (d) => feed(d, false));
    proc.stderr.on("data", (d) => feed(d, true));
    proc.on("error", (e) => resolve({ code: -1, out, err: err + e.message }));
    proc.on("close", (code) => resolve({ code, out, err }));
  });
}

// ---------------------------------------------------------------------------
// 1) TRANSCRIÇÃO
// ---------------------------------------------------------------------------

// json3 do YouTube: auto-legendas trazem tempo por palavra (tOffsetMs)
function parseJson3(raw) {
  const data = JSON.parse(raw);
  const words = [];
  for (const ev of data.events || []) {
    if (!ev.segs) continue;
    const base = (ev.tStartMs || 0) / 1000;
    const dur = (ev.dDurationMs || 0) / 1000;
    const segs = ev.segs.filter((s) => s.utf8 && s.utf8.trim());
    const hasOffsets = segs.some((s) => s.tOffsetMs);
    segs.forEach((s, i) => {
      const parts = s.utf8.replace(/\n/g, " ").trim().split(/\s+/);
      parts.forEach((w, j) => {
        let t;
        if (hasOffsets) t = base + (s.tOffsetMs || 0) / 1000 + j * 0.05;
        else t = base + (dur * (i + j / parts.length)) / Math.max(1, segs.length);
        words.push({ t, w });
      });
    });
  }
  words.sort((a, b) => a.t - b.t);
  // remove duplicatas de legendas "rolantes"
  const clean = [];
  for (const w of words) {
    const prev = clean[clean.length - 1];
    if (prev && prev.w === w.w && Math.abs(prev.t - w.t) < 0.3) continue;
    clean.push(w);
  }
  for (let i = 0; i < clean.length; i++) {
    const next = clean[i + 1];
    clean[i].e = next ? Math.min(next.t, clean[i].t + 1.2) : clean[i].t + 0.6;
  }
  return clean;
}

function httpGetText(urlStr, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const req = https.get(urlStr, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      timeout: timeoutMs
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return httpGetText(res.headers.location, timeoutMs).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve(data));
    });
    req.on("timeout", () => { req.destroy(); reject(new Error("Timeout")); });
    req.on("error", reject);
  });
}

function pickBestSubTrack(info) {
  const sources = [info?.subtitles || {}, info?.automatic_captions || {}];
  const priorities = ["pt-BR", "pt-orig", "pt", "pt-PT", "en-orig", "en-US", "en", "es-orig", "es"];
  for (const map of sources) {
    const keys = Object.keys(map).filter((k) => k && k !== "live_chat");
    if (!keys.length) continue;
    for (const p of priorities) {
      if (map[p]?.length) return { lang: p, tracks: map[p] };
    }
    const ptKey = keys.find((k) => k.startsWith("pt"));
    if (ptKey) return { lang: ptKey, tracks: map[ptKey] };
    const enKey = keys.find((k) => k.startsWith("en"));
    if (enKey) return { lang: enKey, tracks: map[enKey] };
    return { lang: keys[0], tracks: map[keys[0]] };
  }
  return null;
}

async function fetchTranscript(ytdlp, url, workDir, onStatus, info) {
  onStatus("Buscando legendas/transcrição com timestamps...");
  const picked = pickBestSubTrack(info);

  // 1) Tenta baixar direto o json3 da única faixa escolhida (instantâneo, evita 429)
  if (picked) {
    const json3Track = picked.tracks.find((t) => t.ext === "json3" && t.url);
    if (json3Track) {
      try {
        const raw = await httpGetText(json3Track.url);
        const words = parseJson3(raw);
        if (words.length > 20) return words;
      } catch (_) {}
    }
  }

  // 2) Fallback: yt-dlp pedindo APENAS 1 idioma (nunca múltiplos ao mesmo tempo para não tomar HTTP 429)
  const subLang = picked ? picked.lang : "pt-orig,pt,en";
  const args = [
    "--js-runtimes", "node", "--remote-components", "ejs:github",
    "--skip-download", "--write-subs", "--write-auto-subs",
    "--sub-langs", subLang,
    "--sub-format", "json3", "--no-playlist", "--no-warnings",
    "-o", path.join(workDir, "subs"), "--", url
  ];
  await run(ytdlp, args);
  const files = fs.existsSync(workDir) ? fs.readdirSync(workDir).filter((f) => f.endsWith(".json3")) : [];
  if (!files.length) return null;
  const rank = (f) => (/\.pt[.-]/.test(f) || f.includes(".pt.") ? 0 : /\.en/.test(f) ? 1 : 2);
  files.sort((a, b) => rank(a) - rank(b));
  try {
    const words = parseJson3(fs.readFileSync(path.join(workDir, files[0]), "utf8"));
    return words.length > 20 ? words : null;
  } catch (_) {
    return null;
  }
}

// Fallback: baixa o áudio leve e pede a transcrição ao Gemini
async function transcribeWithGemini(ytdlp, ffmpegDir, url, workDir, onStatus, onFixing) {
  onStatus("Sem legendas: extraindo áudio leve para transcrição por IA...");
  const audioPath = path.join(workDir, "audio.mp3");
  const args = ["--js-runtimes", "node", "--remote-components", "ejs:github",
    "-f", "bestaudio/best", "-x", "--audio-format", "mp3",
    "--postprocessor-args", "ExtractAudio:-ac 1 -ar 16000 -b:a 16k",
    "--no-playlist", "-o", path.join(workDir, "audio.%(ext)s")];
  if (ffmpegDir) args.push("--ffmpeg-location", ffmpegDir);
  args.push("--", url);
  await run(ytdlp, args);
  if (!fs.existsSync(audioPath)) throw new Error("Não foi possível extrair o áudio do vídeo.");
  const size = fs.statSync(audioPath).size;
  if (size > 19 * 1024 * 1024) throw new Error("Vídeo longo demais sem legendas (áudio > 19MB). Tente um vídeo com legendas.");

  onStatus("Gemini transcrevendo o áudio (pode levar 1-2 min)...");
  const b64 = fs.readFileSync(audioPath).toString("base64");
  const prompt =
    'Transcreva este áudio. Responda APENAS JSON: {"segments":[{"s":segundos_inicio,"e":segundos_fim,"text":"frase"}]}. ' +
    "Frases curtas (máx 10 palavras), timestamps precisos em segundos.";
  const json = await callGemini([{ inline_data: { mime_type: "audio/mp3", data: b64 } }, { text: prompt }], onFixing);
  const words = [];
  for (const seg of json.segments || []) {
    const parts = String(seg.text || "").trim().split(/\s+/).filter(Boolean);
    const s = Number(seg.s) || 0;
    const e = Math.max(s + 0.3, Number(seg.e) || s + 2);
    parts.forEach((w, i) => {
      const t = s + ((e - s) * i) / parts.length;
      words.push({ t, e: s + ((e - s) * (i + 1)) / parts.length, w });
    });
  }
  return words;
}

// ---------------------------------------------------------------------------
// 2) GEMINI - CÉREBRO VIRAL
// ---------------------------------------------------------------------------

function httpsPostJson(urlStr, payload, timeoutMs = 180000, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const bodyStr = JSON.stringify(payload);
    const req = https.request({
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      method: "POST",
      timeout: timeoutMs,
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(bodyStr),
        ...extraHeaders
      }
    }, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, ok: res.statusCode >= 200 && res.statusCode < 300, json: JSON.parse(data || "{}") });
        } catch (_) {
          resolve({ status: res.statusCode, ok: false, json: { error: { message: data.slice(0, 200) } } });
        }
      });
    });
    req.on("timeout", () => { req.destroy(); reject(new Error("Tempo limite ao conectar com Gemini")); });
    req.on("error", reject);
    req.write(bodyStr);
    req.end();
  });
}

async function callGemini(parts, onFixing, opts = {}) {
  const key = getApiKey();
  if (!key) throw new Error("NO_KEY");
  const primary = getModel();
  const models = [
    ...new Set([
      primary,
      "gemini-3-flash-preview",
      "gemini-3.1-flash-lite",
      "gemini-3.1-flash-lite-preview",
      "gemini-flash-latest",
      "gemini-flash-lite-latest",
      "gemini-3.1-pro-preview"
    ])
  ];
  const generationConfig = {
    responseMimeType: "application/json",
    temperature: typeof opts.temperature === "number" ? opts.temperature : 0.6
  };
  if (opts.responseSchema) generationConfig.responseSchema = opts.responseSchema;
  const payload = {
    contents: [{ role: "user", parts }],
    generationConfig
  };

  let lastErr = null;
  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    if (i > 0 && onFixing) {
      onFixing(`Modelo anterior indisponível — testando ${model}...`);
    }
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    try {
      const res = await httpsPostJson(endpoint, payload, 180000, { "x-goog-api-key": key });
      if (!res.ok) {
        const msg = (res.json?.error && res.json.error.message) || `HTTP ${res.status}`;
        lastErr = new Error("Gemini: " + msg);
        logError(`callGemini:${model}`, msg);
        // Se sobrecarregado (503), limite (429), inválido/descontinuado (400/404), tenta o próximo modelo
        if (
          res.status === 400 ||
          res.status === 404 ||
          res.status === 429 ||
          res.status === 500 ||
          res.status === 503 ||
          /high demand|overloaded|no longer available|not found|deprecated/i.test(msg)
        ) {
          continue;
        }
        throw lastErr;
      }
      const text = res.json.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "{}";
      const parsed = JSON.parse(text.replace(/^```json|```$/g, "").trim());
      if (res.json.usageMetadata) {
        recordUsage(res.json.usageMetadata, model);
      }
      if (i > 0) {
        // Auto-salva o modelo que funcionou para as próximas análises serem instantâneas
        saveConfig({ geminiModel: model });
      }
      return parsed;
    } catch (e) {
      lastErr = e;
      logError(`callGemini:${model}`, e.message);
    }
  }
  throw lastErr || new Error("Falha ao consultar Gemini.");
}

function fmt(t) {
  const s = Math.floor(t);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// Agrupa palavras em linhas "[mm:ss|seg] texto" (~6s) para o prompt
function transcriptToLines(words) {
  const lines = [];
  let cur = null;
  for (const w of words) {
    if (!cur || w.t - cur.t > 6) {
      if (cur) lines.push(cur);
      cur = { t: w.t, text: [] };
    }
    cur.text.push(w.w);
  }
  if (cur) lines.push(cur);
  return lines.map((l) => `[${l.t.toFixed(1)}] ${l.text.join(" ")}`).join("\n");
}

function parseSec(v) {
  if (typeof v === "number") return isFinite(v) ? v : NaN;
  const s = String(v || "").trim().replace(/s$/i, "");
  if (!s) return NaN;
  if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s);
  if (s.includes(":")) {
    return s.split(":").reduce((acc, p) => acc * 60 + (parseFloat(p) || 0), 0);
  }
  return parseFloat(s);
}

async function scoreWithGemini(words, meta, opts, onFixing) {
  let transcript = transcriptToLines(words);
  if (transcript.length > 400000) transcript = transcript.slice(0, 400000);
  const min = opts.minLen || 25;
  const max = opts.maxLen || 60;
  const n = opts.count || 8;
  const prompt = `Você é um editor especialista em vídeos virais (Shorts, Reels, TikTok), como o OpusClip.
Vídeo: "${meta.title}" (canal: ${meta.uploader || "?"}, duração ${Math.round(meta.duration || 0)}s).
Abaixo a transcrição com timestamps em segundos.

Encontre os ${n} MELHORES trechos autossuficientes para virar cortes virais.
Duração média aproximada: em torno de ${min}s a ${max}s — mas PRIORIZE SEMPRE concluir o assunto!
REGRA OBRIGATÓRIA DE CORTE:
- NUNCA corte no meio de uma frase ou antes da pessoa terminar a explicação/conclusão do assunto.
- O "start" DEVE ser no início exato de uma frase (nunca no meio de um raciocínio).
- O "end" DEVE ser APÓS o ponto final/conclusão da última frase do assunto (com ~0.5s de folga depois da última palavra falada). Prefira estender 5 a 15 segundos a cortar alguém falando!
Critérios: gancho forte nos 3 primeiros segundos, emoção/polêmica/humor/revelação, começo e fim em frases completas com conclusão clara, faz sentido sem contexto.
${opts.focus ? "Foco pedido pelo usuário: " + opts.focus : ""}

Responda APENAS JSON neste formato:
{"clips":[{"start":120,"end":165,"title":"título chamativo curto","hook":"texto de gancho na tela (máx 6 palavras, MAIÚSCULAS)","score":90,"musicMood":"calm","scores":{"hook":90,"flow":85,"value":92,"trend":88},"reason":"por que viraliza (1 frase)","caption":"legenda do post com emojis","hashtags":["#tag"]}]}
Para "musicMood", use: "calm" (sermão, fé, reflexão, piano suave), "epic" (inspiradora, orquestral), "hype" (animada, viral, rápida, dinâmica), ou "tense" (suspense, alerta, mistério).
Use sempre números em segundos para start e end. Ordene por score decrescente. Escreva em português.

TRANSCRIÇÃO:
${transcript}`;
  const json = await callGemini([{ text: prompt }], onFixing);
  const arr = Array.isArray(json)
    ? json
    : Array.isArray(json?.clips)
      ? json.clips
      : Array.isArray(json?.cortes)
        ? json.cortes
        : Object.values(json || {}).find((v) => Array.isArray(v)) || [];
  if (!arr.length) {
    logError("scoreWithGemini:empty", JSON.stringify(json).slice(0, 400));
  }
  const snapToSentence = (rawStart, rawEnd) => {
    if (!Array.isArray(words) || !words.length) return { start: rawStart, end: rawEnd };
    const totalDur = Number(meta.duration) || (words[words.length - 1].e || rawEnd);
    let s = rawStart;
    let e = rawEnd;
    // Ajusta início para começo de frase se caiu no meio de uma frase contínua
    let idxStart = words.findIndex((w) => w.t >= s - 0.15);
    if (idxStart > 0) {
      let k = idxStart;
      while (k > 0 && (words[idxStart].t - words[k - 1].t) <= 3.0) {
        const prev = words[k - 1];
        const gap = words[k].t - (prev.e || prev.t);
        if (/[.!?…]$/.test(String(prev.w || "").trim()) || gap >= 0.55) break;
        k--;
      }
      s = Math.max(0, words[k].t - 0.15);
    }
    // Estende fim até o fechamento da frase/pausa natural (até +10s) para nunca cortar falando
    let idxEnd = -1;
    for (let i = 0; i < words.length; i++) {
      if (words[i].t <= e + 0.15) idxEnd = i;
      else break;
    }
    if (idxEnd >= 0) {
      let k = idxEnd;
      while (k < words.length - 1 && (words[k].t - e) <= 10.0) {
        const cur = words[k];
        const nxt = words[k + 1];
        const gap = nxt.t - (cur.e || cur.t);
        if (/[.!?…]$/.test(String(cur.w || "").trim()) || gap >= 0.6) break;
        k++;
      }
      e = Math.min(totalDur, Math.max(e, (words[k].e || words[k].t + 0.4) + 0.45));
    }
    return { start: +s.toFixed(2), end: +e.toFixed(2) };
  };
  return arr.map((c) => {
    const rawStart = Math.max(0, parseSec(c.start ?? c.inicio) || 0);
    const endParsed = parseSec(c.end ?? c.fim);
    const rawEnd = isFinite(endParsed) && endParsed > rawStart ? endParsed : rawStart + 30;
    const { start, end } = snapToSentence(rawStart, rawEnd);
    const rawMood = String(c.musicMood || c.mood || "calm").toLowerCase();
    const musicMood = ["calm", "epic", "hype", "tense"].includes(rawMood) ? rawMood : "calm";
    return {
      start,
      end,
      title: String(c.title || c.titulo || "Corte"),
      hook: String(c.hook || c.gancho || ""),
      score: Math.max(0, Math.min(100, Math.round(Number(c.score) || 75))),
      scores: c.scores || {},
      musicMood,
      reason: String(c.reason || c.motivo || ""),
      caption: String(c.caption || c.legenda || ""),
      hashtags: Array.isArray(c.hashtags) ? c.hashtags : []
    };
  });
}

// Sem chave: heurística local (densidade de fala + pontuação emocional)
function scoreHeuristic(words, opts) {
  const len = Math.round(((opts.minLen || 25) + (opts.maxLen || 60)) / 2);
  const end = words.length ? words[words.length - 1].t : 0;
  const cands = [];
  const emo = /[!?]|nunca|verdade|incr[ií]vel|segredo|ningu[eé]m|absurdo|caramba|meu deus|olha|cuidado|erro|dinheiro/i;
  for (let s = 0; s + len <= end; s += 5) {
    const ws = words.filter((w) => w.t >= s && w.t < s + len);
    if (ws.length < 10) continue;
    const density = ws.length / len;
    const hits = ws.filter((w) => emo.test(w.w)).length;
    const hookHits = ws.filter((w) => w.t < s + 4 && emo.test(w.w)).length;
    cands.push({ s, raw: density * 10 + hits * 3 + hookHits * 6, ws });
  }
  cands.sort((a, b) => b.raw - a.raw);
  const picked = [];
  for (const c of cands) {
    if (picked.some((p) => Math.abs(p.s - c.s) < len)) continue;
    picked.push(c);
    if (picked.length >= (opts.count || 8)) break;
  }
  const top = picked[0]?.raw || 1;
  return picked.map((c) => {
    const text = c.ws.map((w) => w.w).join(" ");
    const textLower = text.toLowerCase();
    let musicMood = "calm";
    if (/dinheiro|sucesso|milh|viral|jogo|meta|rápido|desafio/i.test(textLower)) musicMood = "hype";
    else if (/cuidado|alerta|medo|perigo|segredo|atenção|erro/i.test(textLower)) musicMood = "tense";
    else if (/vencer|história|conquista|mundo|vida|futuro|sonho/i.test(textLower)) musicMood = "epic";
    return {
      start: c.s,
      end: c.s + len,
      title: text.split(" ").slice(0, 8).join(" ") + "...",
      hook: text.split(" ").slice(0, 4).join(" ").toUpperCase(),
      score: Math.round(55 + 40 * (c.raw / top)),
      scores: {},
      musicMood,
      reason: "Análise local (sem IA): alta densidade de fala e palavras de impacto.",
      caption: "",
      hashtags: []
    };
  });
}

// (Legendas e estilos agora são gerados por js/motor_padrao/lib/legenda_ass.js)

function audioScore(f, origLang) {
  const lang = String(f.language || "").toLowerCase();
  const note = String(f.format_note || "").toLowerCase();
  let s = 0;
  if (/original|default/.test(note)) s += 1000;
  if (/dubbed|auto-dub/.test(note)) s -= 2000;
  if (origLang && lang.startsWith(origLang.toLowerCase().split("-")[0])) s += 500;
  if (lang.startsWith("pt")) s += 400;
  if (!lang || lang === "und") s += 100;
  if (f.ext === "m4a") s += 20;
  return s + (f.abr || 0) / 1000;
}

function pickStreamUrls(info, maxHeight = 1080) {
  const fmts = Array.isArray(info?.formats) ? info.formats : [];
  const origLang = info?.language || "pt";
  const isDirectHttp = (f) => f && f.url && /^https?:/.test(f.url) && !String(f.protocol || "").includes("m3u8") && !String(f.url).includes(".m3u8");
  const videos = fmts
    .filter((f) => isDirectHttp(f) && f.vcodec && f.vcodec !== "none" && (f.height || 0) <= maxHeight)
    .sort((a, b) => {
      const aAvc = String(a.vcodec).startsWith("avc1") ? 1 : 0;
      const bAvc = String(b.vcodec).startsWith("avc1") ? 1 : 0;
      if (bAvc !== aAvc) return bAvc - aAvc;
      return (b.height || 0) - (a.height || 0);
    });
  const audios = fmts
    .filter((f) => isDirectHttp(f) && f.acodec && f.acodec !== "none" && (!f.vcodec || f.vcodec === "none"))
    .sort((a, b) => audioScore(b, origLang) - audioScore(a, origLang));
  if (videos[0] && audios[0]) return { videoUrl: videos[0].url, audioUrl: audios[0].url };
  const muxed = fmts.filter((f) => isDirectHttp(f) && f.vcodec !== "none" && f.acodec !== "none" && (f.height || 0) <= maxHeight)
    .sort((a, b) => audioScore(b, origLang) - audioScore(a, origLang) || (b.height || 0) - (a.height || 0));
  if (muxed[0]) return { videoUrl: muxed[0].url, audioUrl: null };
  return null;
}

function pickMuxedPreviewUrl(info) {
  const fmts = Array.isArray(info?.formats) ? info.formats : [];
  const origLang = info?.language || "pt";
  const isDirectHttp = (f) => f && f.url && /^https?:/.test(f.url) && !String(f.protocol || "").includes("m3u8") && !String(f.url).includes(".m3u8");
  const muxed = fmts
    .filter((f) => isDirectHttp(f) && f.vcodec && f.vcodec !== "none" && f.acodec && f.acodec !== "none" && f.ext === "mp4")
    .sort((a, b) => audioScore(b, origLang) - audioScore(a, origLang) || (b.height || 0) - (a.height || 0));
  return muxed[0]?.url || null;
}

// Detecta pausas/respiros > minSilenceSec via silencedetect e devolve intervalos de fala [s, e] relativos ao clipe
async function detectSpeechSegments(ffmpeg, src, dur, minSilenceSec = 0.45) {
  const d = Math.max(0.08, Number(minSilenceSec) || 0.45).toFixed(2);
  const res = await run(ffmpeg, ["-i", src, "-af", `silencedetect=noise=-32dB:d=${d}`, "-f", "null", "-"]);
  const silences = [];
  let curStart = null;
  for (const line of (res.err || "").split(/\r?\n/)) {
    const ms = line.match(/silence_start:\s*([\d.]+)/);
    if (ms) curStart = parseFloat(ms[1]);
    const me = line.match(/silence_end:\s*([\d.]+)/);
    if (me && curStart !== null) {
      silences.push([curStart, parseFloat(me[1])]);
      curStart = null;
    }
  }
  if (curStart !== null) silences.push([curStart, dur]);
  if (!silences.length) return null;

  const pad = 0.08; // margem natural para não cortar sílabas
  const keep = [];
  let cursor = 0;
  for (const [ss, se] of silences) {
    const segEnd = Math.min(dur, ss + pad);
    if (segEnd - cursor > 0.25) keep.push([cursor, segEnd]);
    cursor = Math.max(cursor, se - pad);
  }
  if (dur - cursor > 0.25) keep.push([cursor, dur]);
  // Só aplica se realmente economizar pelo menos 1.2s
  const keptDur = keep.reduce((a, [s, e]) => a + (e - s), 0);
  if (!keep.length || dur - keptDur < 1.2) return null;
  return keep;
}

function remapWordsForJumpCuts(words, keepSegs, clipStart, clipEnd) {
  const inClip = words.filter((w) => w.t >= clipStart - 0.1 && w.t < clipEnd);
  if (!keepSegs || !keepSegs.length) return inClip;
  const out = [];
  for (const w of inClip) {
    const rel = w.t - clipStart;
    let acc = 0;
    for (const [s, e] of keepSegs) {
      if (rel >= s - 0.12 && rel <= e + 0.12) {
        const clamped = Math.max(s, Math.min(e, rel));
        const newT = clipStart + acc + (clamped - s);
        const durW = Math.max(0.15, (w.e || w.t + 0.4) - w.t);
        out.push({ t: newT, e: newT + durW, w: w.w });
        break;
      }
      acc += e - s;
    }
  }
  return out;
}

// Estima posição horizontal X (0..1) onde há mais movimento/fala na cena para manter a pessoa centralizada no 9:16
function detectSpeakerCenterX(ffmpeg, src, dur) {
  return new Promise((resolve) => {
    const W = 160, H = 90;
    const sampleDur = Math.min(8, Math.max(2, dur));
    const ss = Math.max(0, (dur - sampleDur) / 2);
    const proc = spawn(ffmpeg, [
      "-ss", ss.toFixed(2), "-t", sampleDur.toFixed(2), "-i", src,
      "-vf", `fps=2,scale=${W}:${H},tblend=all_mode=difference,format=gray`,
      "-f", "rawvideo", "-"
    ], { windowsHide: true });
    const chunks = [];
    const timer = setTimeout(() => { try { proc.kill(); } catch (_) {} resolve(0.5); }, 6000);
    proc.stdout.on("data", (c) => chunks.push(c));
    proc.on("error", () => { clearTimeout(timer); resolve(0.5); });
    proc.on("close", () => {
      clearTimeout(timer);
      const buf = Buffer.concat(chunks);
      const frameSize = W * H;
      const nFrames = Math.floor(buf.length / frameSize);
      if (nFrames < 2) return resolve(0.5);
      const colWeights = new Float64Array(W);
      // Foca nos 75% superiores (rosto/tronco do apresentador, ignora barras inferiores)
      const maxY = Math.floor(H * 0.78);
      for (let f = 1; f < nFrames; f++) {
        const off = f * frameSize;
        for (let y = 5; y < maxY; y++) {
          const row = off + y * W;
          for (let x = 0; x < W; x++) {
            const v = buf[row + x];
            if (v > 18) colWeights[x] += v;
          }
        }
      }
      let sumW = 0, sumWX = 0;
      for (let x = 0; x < W; x++) {
        sumW += colWeights[x];
        sumWX += colWeights[x] * x;
      }
      if (sumW <= 0) return resolve(0.5);
      const cx = (sumWX / sumW) / W;
      resolve(Math.max(0.18, Math.min(0.82, cx)));
    });
  });
}

// Detecta rosto(s), cortes de câmera e divisão de tela para podcast (1 em cima, 1 embaixo) via OpenCV YuNet
function smartReframeVideo(ffmpeg, src, dur, allowSplit = true) {
  return new Promise((resolve) => {
    const scriptPath = path.join(__dirname, "..", "scripts", "smart_reframe.py");
    const modelPath = path.join(__dirname, "..", "assets", "models", "face_detection_yunet_2023mar.onnx");
    if (!fs.existsSync(scriptPath) || !fs.existsSync(modelPath)) {
      return detectSpeakerCenterX(ffmpeg, src, dur).then((cx) =>
        resolve([{ start: 0, end: dur, mode: "single", cx, cy: 0.45 }])
      );
    }
    const pyBin = process.platform === "win32" ? "python" : "python3";
    const proc = spawn(pyBin, [scriptPath, src, modelPath, allowSplit ? "1" : "0"], { windowsHide: true });
    let out = "";
    const timer = setTimeout(() => {
      try { proc.kill(); } catch (_) {}
      detectSpeakerCenterX(ffmpeg, src, dur).then((cx) =>
        resolve([{ start: 0, end: dur, mode: "single", cx, cy: 0.45 }])
      );
    }, 45000);
    proc.stdout.on("data", (c) => { out += c.toString(); });
    proc.on("error", () => {
      clearTimeout(timer);
      detectSpeakerCenterX(ffmpeg, src, dur).then((cx) =>
        resolve([{ start: 0, end: dur, mode: "single", cx, cy: 0.45 }])
      );
    });
    proc.on("close", () => {
      clearTimeout(timer);
      try {
        const lines = out.trim().split(/\r?\n/).reverse();
        const jsonLine = lines.find((l) => l.trim().startsWith("{"));
        const parsed = jsonLine ? JSON.parse(jsonLine) : null;
        if (parsed && Array.isArray(parsed.segments) && parsed.segments.length > 0) {
          return resolve(parsed.segments);
        }
      } catch (_) {}
      detectSpeakerCenterX(ffmpeg, src, dur).then((cx) =>
        resolve([{ start: 0, end: dur, mode: "single", cx, cy: 0.45 }])
      );
    });
  });
}

function buildDynamicCxExpr(segments) {
  if (!segments || segments.length <= 1) {
    return (segments?.[0]?.cx ?? 0.5).toFixed(4);
  }
  // Monta expressão aninhada: if(lt(t, t1), cx0, if(lt(t, t2), cx1, ...))
  let expr = (segments[segments.length - 1].cx ?? 0.5).toFixed(4);
  for (let i = segments.length - 2; i >= 0; i--) {
    const seg = segments[i];
    expr = `if(lt(t,${Number(seg.end).toFixed(3)}),${Number(seg.cx).toFixed(4)},${expr})`;
  }
  return expr;
}

function buildReframeFilter(segments, W, H, dur, zStr, dynamic, layout) {
  const hasComplex = Array.isArray(segments) && segments.some((s) => s.mode === "split" || s.mode === "fit_blur");
  const zoom = dynamic ? `,scale=w='trunc(iw*(1+${zStr}*t/${dur.toFixed(2)})/2)*2':h='trunc(ih*(1+${zStr}*t/${dur.toFixed(2)})/2)*2':eval=frame,crop=${W}:${H}` : "";

  if (!hasComplex) {
    const cxExpr = buildDynamicCxExpr(segments);
    const cropExpr = `crop=${W}:${H}:'max(0,min(iw-${W},(iw*(${cxExpr}))-${W}/2))':0`;
    if (layout === "crop") {
      return `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,${cropExpr}${zoom}[v]`;
    }
    return `[0:v]split[a][b];[a]scale=${W}:${H}:force_original_aspect_ratio=increase,${cropExpr},boxblur=30:5,eq=brightness=-0.08[bg];` +
      `[b]scale=${W}:-2[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2${zoom}[v]`;
  }

  // Modo híbrido por tomada: centraliza rosto(s), divide tela em podcast a 2, e preserva slides 16:9 sem cortar texto
  const halfH = Math.floor(H / 2);
  const parts = [];
  const concatInputs = [];
  segments.forEach((seg, idx) => {
    const s = Number(seg.start).toFixed(3);
    const e = Number(seg.end).toFixed(3);
    const trim = `trim=start=${s}:end=${e},setpts=PTS-STARTPTS`;
    if (seg.mode === "split") {
      const c1 = Number(seg.cx1 ?? 0.28).toFixed(4);
      const c2 = Number(seg.cx2 ?? 0.72).toFixed(4);
      parts.push(
        `[0:v]${trim},split[t${idx}][b${idx}];` +
        `[t${idx}]scale=${W}:${halfH}:force_original_aspect_ratio=increase,crop=${W}:${halfH}:'max(0,min(iw-${W},(iw*${c1})-${W}/2))':0,setsar=1[top${idx}];` +
        `[b${idx}]scale=${W}:${halfH}:force_original_aspect_ratio=increase,crop=${W}:${halfH}:'max(0,min(iw-${W},(iw*${c2})-${W}/2))':0,setsar=1[bot${idx}];` +
        `[top${idx}][bot${idx}]vstack=inputs=2,setsar=1[seg${idx}]`
      );
    } else if (seg.mode === "fit_blur") {
      parts.push(
        `[0:v]${trim},split[fb_a${idx}][fb_b${idx}];` +
        `[fb_a${idx}]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=30:5,eq=brightness=-0.12[fb_bg${idx}];` +
        `[fb_b${idx}]scale=${W}:-2[fb_fg${idx}];` +
        `[fb_bg${idx}][fb_fg${idx}]overlay=(W-w)/2:(H-h)/2,setsar=1[seg${idx}]`
      );
    } else {
      const cx = Number(seg.cx ?? 0.5).toFixed(4);
      parts.push(
        `[0:v]${trim},scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}:'max(0,min(iw-${W},(iw*${cx})-${W}/2))':0,setsar=1[seg${idx}]`
      );
    }
    concatInputs.push(`[seg${idx}]`);
  });
  parts.push(`${concatInputs.join("")}concat=n=${segments.length}:v=1:a=0[v]`);
  return parts.join(";");
}

module.exports = function createAiClips(ctx) {
  const { YTDLP_BIN, FFMPEG_DIR, DOWNLOADS_ROOT, jobs, sanitizeName, extractUrlInfoWithYtDlp } = ctx;
  const ffmpeg = FFMPEG_DIR ? path.join(FFMPEG_DIR, process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg") : "ffmpeg";
  const analyses = new Map(); // url -> { words, meta, info }
  const previewCache = new Map(); // key -> { path, dir, createdAt }

  function newJob(kind) {
    const jobId = `${kind}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const job = { jobId, status: "running", pct: 2, statusText: "Iniciando...", error: null };
    jobs.set(jobId, job);
    return job;
  }

  async function downloadSegmentFast(url, start, end, outPath, job, pctEnd = 50, audioOnly = false) {
    const dur = Math.max(1, end - start);
    const entry = analyses.get(url);
    const cacheKey = `${url}|${Math.round(start)}|${Math.round(end)}|${audioOnly ? "a" : "v"}`;
    const cached = previewCache.get(cacheKey);
    if (cached && fs.existsSync(cached.path)) {
      fs.copyFileSync(cached.path, outPath);
      job.pct = pctEnd;
      job.statusText = "Trecho em cache pronto!";
      return outPath;
    }

    // 1) Caminho ultra-rápido: ffmpeg seek direto via HTTP Range nas URLs já extraídas pelo yt-dlp (baixa SÓ os 30-50s, em ~3-5s!)
    const streams = !audioOnly && entry?.info ? pickStreamUrls(entry.info, 1080) : null;
    if (streams) {
      job.statusText = "Buscando trecho direto via HTTP (sem baixar a live)...";
      const ffArgs = ["-y", "-ss", String(start), "-t", String(dur), "-i", streams.videoUrl];
      if (streams.audioUrl) {
        ffArgs.push("-ss", String(start), "-t", String(dur), "-i", streams.audioUrl, "-map", "0:v:0", "-map", "1:a:0");
      }
      ffArgs.push("-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", "-shortest", outPath);
      const ff = await run(ffmpeg, ffArgs, {}, (l) => {
        const m = l.match(/time=\s*(\d+):(\d+):([\d.]+)/);
        if (m) {
          const s = +m[1] * 3600 + +m[2] * 60 + +m[3];
          job.pct = Math.min(pctEnd, 5 + Math.round((s / dur) * (pctEnd - 5)));
          job.statusText = `Extraindo trecho: ${s.toFixed(0)}s / ${dur.toFixed(0)}s`;
        }
      });
      if (ff.code === 0 && fs.existsSync(outPath) && fs.statSync(outPath).size > 50000) {
        previewCache.set(cacheKey, { path: outPath, createdAt: Date.now() });
        return outPath;
      }
      try { if (fs.existsSync(outPath)) fs.unlinkSync(outPath); } catch (_) {}
    }

    // 2) Fallback: yt-dlp --download-sections SEM --force-keyframes-at-cuts (muito mais rápido)
    const dir = path.dirname(outPath);
    const dlArgs = [
      "--js-runtimes", "node", "--remote-components", "ejs:github", "--no-playlist", "--newline",
      "-f", audioOnly
        ? "bestaudio[format_note*=original]/bestaudio[language^=pt]/bestaudio[ext=m4a]/bestaudio/best"
        : "bestvideo[height<=1080][vcodec^=avc1]+bestaudio[format_note*=original]/bestvideo[height<=1080][vcodec^=avc1]+bestaudio[language^=pt]/bestvideo[height<=1080][vcodec^=avc1]+bestaudio[ext=m4a]/bestvideo[height<=1080]+bestaudio/best[height<=1080]/best",
      "--merge-output-format", "mp4", "--download-sections", `*${start}-${end}`,
      "-o", audioOnly ? path.join(dir, "raw.%(ext)s") : outPath
    ];
    if (FFMPEG_DIR) dlArgs.push("--ffmpeg-location", FFMPEG_DIR);
    dlArgs.push("--", url);
    const dl = await run(YTDLP_BIN, dlArgs, {}, (l) => {
      const m = l.match(/time=\s*(\d+):(\d+):([\d.]+)/);
      if (m) {
        const s = +m[1] * 3600 + +m[2] * 60 + +m[3];
        job.pct = Math.min(pctEnd, 5 + Math.round((s / dur) * (pctEnd - 5)));
        job.statusText = `Baixando trecho: ${s.toFixed(0)}s / ${dur.toFixed(0)}s`;
      }
    });
    const rawFile = fs.readdirSync(dir).find((f) => f.startsWith(path.basename(outPath, path.extname(outPath))));
    if (!rawFile) throw new Error("Falha ao baixar o trecho. " + (dl.err.match(/ERROR:.*/)?.[0] || ""));
    const finalSrc = path.join(dir, rawFile);
    previewCache.set(cacheKey, { path: finalSrc, createdAt: Date.now() });
    return finalSrc;
  }

  async function analyze(job, body) {
    const url = String(body.url).trim();
    const workDir = path.join(WORK_ROOT, sanitizeName(url).slice(-40) + "_" + Date.now());
    fs.mkdirSync(workDir, { recursive: true });
    const status = (t, pct) => {
      job.statusText = t;
      if (pct) job.pct = pct;
    };

    status("Lendo informações do vídeo...", 5);
    const info = await extractUrlInfoWithYtDlp(url);
    if (!info) throw new Error("Não consegui ler esse link. Verifique se o vídeo é público.");
    const meta = {
      title: info.title || "Vídeo",
      uploader: info.uploader || info.channel || "",
      duration: info.duration || 0,
      thumbnail: info.thumbnail || "",
      id: info.id,
      isYouTube: /youtube|youtu\.be/.test(url),
      isLive: !!info.is_live
    };
    job.meta = meta;

    const onFixing = (msg) => {
      job.fixing = true;
      job.statusText = `🟡 Estou corrigindo, aguarde... (${msg})`;
    };

    let words = await fetchTranscript(YTDLP_BIN, url, workDir, (t) => status(t, 20), info);
    if (!words) {
      if (!getApiKey()) throw new Error("Este vídeo não tem legendas. Configure sua chave Gemini para transcrever por IA.");
      words = await transcribeWithGemini(YTDLP_BIN, FFMPEG_DIR, url, workDir, (t) => status(t, 35), onFixing);
    }
    if (!words || words.length < 10) throw new Error("Transcrição vazia — o vídeo parece não ter fala.");
    analyses.set(url, { words, meta, info });

    const opts = { minLen: body.minLen, maxLen: body.maxLen, count: body.count, focus: body.focus };
    let clips;
    let engine = "gemini";
    if (getApiKey()) {
      status(`Gemini analisando ${words.length} palavras em busca de momentos virais...`, 60);
      try {
        clips = await scoreWithGemini(words, meta, opts, onFixing);
        if (!clips || !clips.length) {
          engine = "local";
          onFixing("Gemini retornou vazio — gerando cortes locais");
          clips = scoreHeuristic(words, opts);
        }
      } catch (e) {
        if (/high demand|overloaded|429|503|Tempo limite|no longer available|not found|deprecated/i.test(e.message)) {
          engine = "local";
          onFixing("Gemini indisponível — usando análise local");
          clips = scoreHeuristic(words, opts);
        } else {
          throw e;
        }
      }
    } else {
      engine = "local";
      status("Sem chave Gemini: usando análise local...", 60);
      clips = scoreHeuristic(words, opts);
    }
    const dur = meta.duration || words[words.length - 1].t;
    clips = clips
      .filter((c) => c.end > c.start + 3)
      .map((c, i) => ({
        ...c,
        id: `c${i + 1}`,
        end: Math.min(c.end, dur || c.end),
        transcript: words.filter((w) => w.t >= c.start && w.t < c.end).map((w) => w.w).join(" "),
        words: words.filter((w) => w.t >= c.start - 0.1 && w.t < c.end).map((w) => ({
          t: +(w.t - c.start).toFixed(2),
          e: +((w.e || w.t + 0.4) - c.start).toFixed(2),
          w: w.w
        }))
      }));
    job.fixing = false;
    job.result = { meta, clips, engine, wordCount: words.length, usage: loadUsage() };
    job.status = "done";
    job.pct = 100;
    job.statusText = `✓ ${clips.length} cortes encontrados`;
  }

  // Etapa 1: Pré-visualização rápida (baixa SÓ o trecho, sem render pesado ainda)
  async function preview(job, body) {
    const url = String(body.url).trim();
    const start = Number(body.start) || 0;
    const end = Number(body.end) || start + 30;
    const prevDir = path.join(WORK_ROOT, "prev_" + job.jobId);
    fs.mkdirSync(prevDir, { recursive: true });
    const rawPath = path.join(prevDir, "raw.mp4");
    job.pct = 8;
    job.statusText = "Extraindo prévia rápida do trecho...";
    const src = await downloadSegmentFast(url, start, end, rawPath, job, 95, false);
    job.outputPath = src;
    job.status = "done";
    job.pct = 100;
    job.statusText = "✓ Prévia pronta!";
  }

  // Etapa 2: Edição completa após confirmação do usuário (jump-cuts + centralização + 9:16 + legenda dinâmica)
  async function render(job, body) {
    const url = String(body.url || "").trim();
    const localFile = body.localFile ? path.resolve(String(body.localFile)) : null;
    const start = Number(body.start) || 0;
    const end = Number(body.end) || start + 30;
    let dur = Math.max(1, end - start);
    const output = body.output || "mp4"; // mp4 | gif | mp3
    const vertical = body.format !== "original";
    const workDir = path.join(WORK_ROOT, "render_" + job.jobId);
    fs.mkdirSync(path.join(workDir, "fontes"), { recursive: true });

    // Carregar padrão v2 do motor (com fallback automático para assets/fontes ausentes)
    const padraoId = body.padraoId || body.clientId || body.style || "encaixa";
    const loaded = padroesStore.getPadrao(padraoId) || padroesStore.getPadrao("encaixa") || padroesStore.getPadrao("tibapa");
    if (!loaded) throw new Error(`Padrão "${padraoId}" não encontrado.`);
    const { padrao, avisosFallback } = padroesStore.prepararParaRender(loaded.padrao, loaded.dir);
    if (body.captions === false && padrao.legenda) padrao.legenda.ativo = false;

    job.statusText = "Preparando trecho escolhido...";
    job.pct = 5;
    const rawPath = path.join(workDir, "raw.mp4");
    let src;
    if (localFile && fs.existsSync(localFile)) {
      if (body.start != null && body.end != null && body.end > body.start) {
        const cutRes = await run(ffmpeg, [
          "-y", "-ss", String(start), "-t", String(dur), "-i", localFile,
          "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p",
          "-c:a", "aac", "-b:a", "160k", rawPath
        ]);
        if (cutRes.code !== 0) throw new Error("Falha ao recortar arquivo local.");
        src = rawPath;
      } else {
        src = localFile;
        const pr = spawnSync(ffmpeg.replace(/ffmpeg(\.exe)?$/i, "ffprobe$1"), [
          "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", src
        ], { encoding: "utf8", windowsHide: true });
        dur = Math.max(1, Number(pr.stdout) || dur);
      }
      job.pct = 42;
    } else {
      src = await downloadSegmentFast(url, start, end, rawPath, job, 42, output === "mp3");
    }

    const entry = url ? analyses.get(url) : null;
    let words = (Array.isArray(body.words) ? body.words : (entry ? entry.words : []))
      .map((w) => ({ ...w, w: String(w.w || "").replace(/\[[^\]]*\]/g, "").trim() }))
      .filter((w) => w.w.length > 0);
    let palavrasRel = words
      .filter((w) => w.t >= start - 0.05 && w.t < end)
      .map((w) => ({
        t: +Math.max(0, w.t - start).toFixed(3),
        e: +Math.min(dur, Math.max(w.t - start + 0.08, (w.e || w.t + 0.4) - start)).toFixed(3),
        w: w.w
      }));
    let cortes = [];

    // 1) Tirar respiros e pausas (jump cuts) usando o limiar do padrão
    const limiarPausa = Number(padrao.ritmo?.cortar_pausas_acima_s) || 0.45;
    if (output !== "mp3" && body.trimSilences !== false) {
      job.statusText = `Cortando pausas > ${limiarPausa}s...`;
      job.pct = 46;
      const keepSegs = await detectSpeechSegments(ffmpeg, src, dur, limiarPausa);
      if (keepSegs && keepSegs.length) {
        const jumpPath = path.join(workDir, "jump.mp4");
        const segParts = keepSegs.map(([s, e], i) =>
          `[0:v]trim=start=${s.toFixed(3)}:end=${e.toFixed(3)},setpts=PTS-STARTPTS[v${i}];` +
          `[0:a]atrim=start=${s.toFixed(3)}:end=${e.toFixed(3)},asetpts=PTS-STARTPTS[a${i}]`
        ).join(";");
        const concatInputs = keepSegs.map((_, i) => `[v${i}][a${i}]`).join("");
        const jArgs = [
          "-y", "-i", src,
          "-filter_complex", `${segParts};${concatInputs}concat=n=${keepSegs.length}:v=1:a=1[vo][ao]`,
          "-map", "[vo]", "-map", "[ao]", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-c:a", "aac", "-b:a", "160k", jumpPath
        ];
        const jr = await run(ffmpeg, jArgs);
        if (jr.code === 0 && fs.existsSync(jumpPath)) {
          src = jumpPath;
          const remapped = remapWordsForJumpCuts(words, keepSegs, start, end);
          palavrasRel = remapped.map((w) => ({
            t: +Math.max(0, w.t - start).toFixed(3),
            e: +Math.max(w.t - start + 0.08, (w.e || w.t + 0.4) - start).toFixed(3),
            w: w.w
          }));
          let acc = 0;
          cortes = keepSegs.slice(0, -1).map(([s, e]) => +(acc += (e - s)).toFixed(3));
          dur = keepSegs.reduce((a, [s, e]) => a + (e - s), 0);
        }
      }
    }

    const site = vertical ? "Cortes_IA" : "Cortes_IA_Original";
    const outDir = path.join(DOWNLOADS_ROOT, output === "mp3" ? "Audios" : "Videos", site);
    fs.mkdirSync(outDir, { recursive: true });
    const base = sanitizeName(body.filename || body.title || "corte_ia");
    const outPath = path.join(outDir, `${base}.${output}`);

    if (output === "mp3") {
      job.statusText = "Convertendo para MP3...";
      job.pct = 60;
      const ff = await run(ffmpeg, ["-y", "-i", src, "-vn", "-c:a", "libmp3lame", "-q:a", "0", outPath], { cwd: workDir });
      if (ff.code !== 0 || !fs.existsSync(outPath)) throw new Error("ffmpeg falhou ao gerar MP3");
      try { fs.rmSync(workDir, { recursive: true, force: true }); } catch (_) {}
      const stat = fs.statSync(outPath);
      job.outputPath = outPath;
      job.filename = path.basename(outPath);
      job.totalBytes = stat.size;
      job.status = "done";
      job.pct = 100;
      job.statusText = `✓ Pronto! ${(stat.size / 1048576).toFixed(1)} MB`;
      return;
    }

    // 2) Layout "blur" (podcast) ou reframe inteligente 9:16 antes de compor no motor
    let falaPath = src;
    const layout = body.layout || padrao.layout_padrao || "crop";
    if (vertical && (layout === "blur" || body.centerPerson !== false)) {
      const W = padrao.canvas?.w || 1080;
      const H = padrao.canvas?.h || 1920;
      let segments = [{ start: 0, end: dur, mode: "single", cx: 0.5, cy: 0.45 }];
      if (layout === "crop" && body.centerPerson !== false) {
        job.statusText = "Rastreando rosto(s) no 9:16...";
        job.pct = 50;
        segments = await smartReframeVideo(ffmpeg, src, dur, body.allowSplit !== false);
      }
      const fala9x16 = path.join(workDir, "fala_9x16.mp4");
      const reframeVf = buildReframeFilter(segments, W, H, dur, 0, false, layout);
      const rf = await run(ffmpeg, [
        "-y", "-i", src, "-filter_complex", reframeVf,
        "-map", "[v]", "-map", "0:a?",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "16", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k", fala9x16
      ]);
      if (rf.code === 0 && fs.existsSync(fala9x16)) falaPath = fala9x16;
    }

    // 3) Plano editorial automático (IA via plano_ia.js + fallback determinístico) + elementos + regras
    let plano = { ...(body.plano || {}) };
    const temPlanoManual = (plano.destaques?.length || plano.titulos?.length || plano.numeros?.length);
    if (!temPlanoManual && palavrasRel.length && (padrao.destaques?.length || padrao.titulo_gancho?.ativo)) {
      job.statusText = "Montando plano de edição (destaques, gancho e ritmo)...";
      job.pct = 53;
      try {
        if (getApiKey()) {
          const prompt = promptPlano(padrao, palavrasRel, []);
          const schema = schemaPlanoGemini(padrao, []);
          const rawIa = await callGemini([{ text: prompt }], null, { responseSchema: schema, temperature: 0.35 });
          const val = validarPlanoIA(rawIa, padrao, palavrasRel, []);
          plano = { ...val.plano, ...plano };
        }
      } catch (e) {
        logError("render:plano_ia", e.message);
      }

      // Fallback determinístico: garante que o estilo do padrão (destaques + título + flashes) SEMPRE apareça
      if ((!plano.destaques || !plano.destaques.length) && Array.isArray(padrao.destaques) && padrao.destaques.length) {
        const stop = new Set(["que","para","com","uma","mais","como","mas","por","dos","das","nos","nas","seu","sua","isso","esse","essa","está","esta","você","voce","aqui","quando","então","entao","muito","tudo","fazer","pode","sobre","pelo","pela","porque","onde"]);
        const cands = palavrasRel.filter((w) => {
          const clean = String(w.w || "").replace(/[^\p{L}\p{N}]/gu, "");
          return clean.length >= 6 && !stop.has(clean.toLowerCase()) && w.t >= 3.2 && w.t <= Math.max(4, dur - 1.5);
        });
        const maxD = Math.min(5, padrao.destaques[0]?.freq_por_video?.max || 5);
        const step = Math.max(1, Math.floor(cands.length / Math.max(1, maxD)));
        const picks = [];
        for (let i = 0; i < cands.length && picks.length < maxD; i += step) {
          const w = cands[i];
          const useClimax = padrao.destaques[1] && picks.length === Math.floor(maxD / 2);
          picks.push({
            id: useClimax ? padrao.destaques[1].id : padrao.destaques[0].id,
            texto: String(w.w || "").replace(/[.,!?;:]+$/g, ""),
            perto: w.t
          });
        }
        plano.destaques = picks;
      }
      if ((!plano.flashes || !plano.flashes.length) && padrao.transicoes?.flash && cortes.length >= 2) {
        const maxF = Math.min(2, padrao.transicoes.flash.max_por_video || 2);
        const mid = cortes[Math.floor(cortes.length / 2)];
        plano.flashes = maxF >= 2 && cortes.length >= 4
          ? [cortes[Math.floor(cortes.length / 3)], cortes[Math.floor((cortes.length * 2) / 3)]]
          : [mid];
      }
    }
    if ((!plano.titulos || !plano.titulos.length) && padrao.titulo_gancho?.ativo) {
      const rawHook = String(body.hook || body.title || "").trim();
      if (rawHook) {
        const parts = rawHook.split(/\s+/);
        const half = Math.max(1, Math.ceil(parts.length / 2));
        plano.titulos = [{
          texto: parts.slice(0, half).join(" "),
          linha2: parts.slice(half).join(" ") || "",
          t0: 0,
          t1: Math.min(3.2, dur)
        }];
      }
    }
    if (plano.auto_elementos !== false) {
      const auto = elementosPorGatilho(padrao, palavrasRel, cortes, dur);
      const ja = new Set((plano.elementos || []).map((e) => e.id));
      plano.elementos = [...(plano.elementos || []), ...auto.filter((e) => !ja.has(e.id))];
    }
    const reg = aplicarRegras({ padrao, plano, palavras: palavrasRel, cortes, fimFala: dur });
    const todosAvisos = [...(loaded.avisos || []), ...(avisosFallback || []), ...(padrao.pendencias || []).map((p) => `pendência: ${p}`), ...reg.avisos];

    // 4) Fontes estáticas + ASS via motor_padrao
    const fontes = carregarFontes(padrao);
    const leg = gerarAss({
      padrao, fontes, palavras: palavrasRel, duracao: dur, cortes,
      destaques: reg.plano.destaques, titulos: reg.plano.titulos, numeros: reg.plano.numeros,
      ocultar: reg.ocultarLegenda
    });
    for (const arq of leg.fontes) {
      fs.copyFileSync(arq, path.join(workDir, "fontes", path.basename(arq)));
    }
    todosAvisos.push(...leg.avisos);
    fs.writeFileSync(path.join(workDir, "legenda.ass"), leg.ass, "utf8");

    // 5) Composição via montarComando (cwd = workDir)
    const renderOut = output === "gif" ? path.join(workDir, "composed.mp4") : outPath;
    const cmd = montarComando({
      padrao, fala: falaPath, duracao: dur, ass: "legenda.ass", fontsDir: "fontes",
      zoom: reg.plano.zoom, broll: reg.plano.broll, elementos: reg.plano.elementos,
      flashes: reg.plano.flashes, saida: renderOut,
      semFechamento: body.semFechamento === true,
      semMusica: body.bgMusic === "none"
    });
    fs.writeFileSync(path.join(workDir, "ffmpeg_filtro.txt"), cmd.filtro, "utf8");

    job.statusText = "Renderizando com Motor de Padrão v2...";
    job.pct = 58;
    const ff = await run(ffmpeg, cmd.args, { cwd: workDir }, (l) => {
      const m = l.match(/time=\s*(\d+):(\d+):([\d.]+)/);
      if (m) {
        const s = +m[1] * 3600 + +m[2] * 60 + +m[3];
        job.pct = Math.min(94, 58 + Math.round((s / Math.max(1, cmd.duracaoTotal)) * 36));
        job.statusText = `Editando e renderizando: ${s.toFixed(0)}s / ${cmd.duracaoTotal.toFixed(0)}s`;
      }
    });
    if (ff.code !== 0 || !fs.existsSync(renderOut)) {
      throw new Error("ffmpeg falhou: " + ff.err.split("\n").filter(Boolean).slice(-4).join(" | "));
    }

    if (output === "gif") {
      const gifW = vertical ? 480 : 640;
      const gr = await run(ffmpeg, [
        "-y", "-i", renderOut, "-t", String(Math.min(dur, 15)),
        "-vf", `fps=12,scale=${gifW}:-1:flags=lanczos,split[g1][g2];[g1]palettegen[p];[g2][p]paletteuse`,
        outPath
      ], { cwd: workDir });
      if (gr.code !== 0 || !fs.existsSync(outPath)) throw new Error("Falha ao gerar GIF");
    }

    // 6) Conferência automática (conferir_render.js)
    const planoFinalPath = path.join(workDir, "plano_final.json");
    fs.writeFileSync(planoFinalPath, JSON.stringify({
      padrao: loaded.file, saida: outPath, duracao_fala: dur, duracao_total: cmd.duracaoTotal,
      cortes, blocos: leg.blocos, plano: reg.plano, avisos: todosAvisos
    }, null, 2), "utf8");

    if (output === "mp4" && body.skipQa !== true) {
      job.statusText = "Conferindo render (tamanho, posição, fonte)...";
      job.pct = 96;
      const qaScript = path.join(__dirname, "motor_padrao", "ferramentas", "conferir_render.js");
      const qa = spawnSync(process.execPath, [qaScript, outPath, planoFinalPath], { encoding: "utf8", windowsHide: true });
      job.qaOutput = (qa.stdout || "") + (qa.stderr || "");
      job.qaPassed = qa.status === 0;
      if (qa.status !== 0) {
        job.needsReview = true;
        job.reviewReasons = job.qaOutput.split(/\r?\n/).filter((l) => /FALHA|erro|aviso/i.test(l));
      }
    }

    const stat = fs.statSync(outPath);
    job.outputPath = outPath;
    job.filename = path.basename(outPath);
    job.totalBytes = stat.size;
    job.avisos = todosAvisos;
    job.status = "done";
    job.pct = 100;
    job.statusText = job.needsReview
      ? `⚠ Precisa revisão (${(stat.size / 1048576).toFixed(1)} MB)`
      : `✓ Pronto! ${(stat.size / 1048576).toFixed(1)} MB`;
  }

  function launch(kind, fn, body) {
    const job = newJob(kind);
    fn(job, body).catch((e) => {
      job.status = "error";
      job.error = e.message === "NO_KEY" ? "Configure sua chave Gemini (⚙️)." : e.message;
      job.statusText = "Erro";
    });
    return job;
  }

  async function updateEngine(job) {
    job.statusText = "Atualizando yt-dlp...";
    let r = await run(YTDLP_BIN, ["-U"]);
    if (!/up to date|Updated|atualizado/i.test(r.out + r.err)) {
      r = await run("python", ["-m", "pip", "install", "-U", "yt-dlp"]);
    }
    const v = await run(YTDLP_BIN, ["--version"]);
    job.status = "done";
    job.pct = 100;
    job.statusText = `✓ yt-dlp versão ${v.out.trim()}`;
  }

  async function importClientProfile(job, body) {
    const name = String(body.name || "").trim();
    if (!name) throw new Error("Informe o nome do cliente.");
    if (!getApiKey()) throw new Error("Configure sua chave Gemini (⚙️) para extrair o padrão por IA.");

    const workDir = path.join(WORK_ROOT, "client_" + job.jobId);
    fs.mkdirSync(workDir, { recursive: true });
    const parts = [];

    if (body.pdfBase64) {
      job.statusText = "Lendo manual PDF do cliente...";
      job.pct = 30;
      const cleanB64 = String(body.pdfBase64).replace(/^data:[^;]+;base64,/, "");
      parts.push({ inline_data: { mime_type: "application/pdf", data: cleanB64 } });
    }

    const refUrls = Array.isArray(body.referenceUrls)
      ? body.referenceUrls.map((u) => String(u).trim()).filter((u) => /^https?:/.test(u))
      : [];

    for (let idx = 0; idx < Math.min(3, refUrls.length); idx++) {
      const refUrl = refUrls[idx];
      job.statusText = `Analisando vídeo de referência ${idx + 1}/${Math.min(3, refUrls.length)}...`;
      job.pct = 15 + idx * 20;
      const vidPath = path.join(workDir, `ref_${idx}.mp4`);
      await run(YTDLP_BIN, [
        "--no-playlist", "--no-warnings",
        "-f", "best[ext=mp4]/best",
        "-o", vidPath, "--", refUrl
      ]);
      let vidSource = fs.existsSync(vidPath) ? vidPath : null;
      if (!vidSource && /pinterest\.|pin\.it/i.test(refUrl)) {
        try {
          const html = await httpGetText(refUrl);
          const mp4M = html.match(/https:\/\/v[^"'\\]+\.mp4/);
          const m3u8M = html.match(/https:\/\/[^"'\\]+\.m3u8/);
          vidSource = mp4M?.[0] || m3u8M?.[0] || null;
        } catch (_) {}
      }
      if (vidSource) {
        for (const sec of [1, 3, 6]) {
          const imgPath = path.join(workDir, `ref_${idx}_${sec}.jpg`);
          await run(ffmpeg, ["-y", "-ss", String(sec), "-i", vidSource, "-frames:v", "1", "-q:v", "3", imgPath]);
          if (fs.existsSync(imgPath)) {
            parts.push({ inline_data: { mime_type: "image/jpeg", data: fs.readFileSync(imgPath).toString("base64") } });
          }
        }
      }
    }

    if (!parts.length && !body.notes) {
      throw new Error("Envie um PDF, links de vídeos de referência ou instruções de estilo.");
    }

    job.statusText = "Gemini extraindo o DNA de edição do cliente...";
    job.pct = 70;
    const prompt = `Você é um diretor de pós-produção de vídeo. Analise os anexos (PDF de guia e/ou frames de vídeos de referência) do cliente "${name}".
${body.notes ? "Observações adicionais: " + body.notes : ""}

Extraia o padrão exato de edição e responda APENAS JSON neste formato:
{
  "name": "${name}",
  "description": "resumo curto em 1 frase do estilo visual/ritmo",
  "format": "vertical" ou "original",
  "layout": "crop" ou "blur",
  "style": "hormozi" ou "mrbeast" ou "clean" ou "none",
  "trimSilences": true ou false,
  "centerPerson": true ou false,
  "dynamic": true ou false,
  "zoomStrength": 0.06,
  "hook": true ou false,
  "aiFocus": "instrução curta para a IA escolher cortes no estilo desse cliente",
  "customStyle": {
    "font": "Arial Black",
    "fontSize": 76,
    "primaryColor": "#FFFFFF",
    "highlightColor": "#FACC15",
    "outlineWidth": 5,
    "letterSpacing": 1,
    "wordsPerLine": 3,
    "marginVPct": 0.26,
    "uppercase": true,
    "hookBgColor": "#FACC15",
    "hookTextColor": "#000000"
  }
}`;
    parts.push({ text: prompt });
    const profile = await callGemini(parts, (m) => {
      job.fixing = true;
      job.statusText = `🟡 Estou corrigindo, aguarde... (${m})`;
    });
    profile.name = name;
    const saved = saveClient(profile);
    try { fs.rmSync(workDir, { recursive: true, force: true }); } catch (_) {}
    job.fixing = false;
    job.result = { client: saved, usage: loadUsage() };
    job.status = "done";
    job.pct = 100;
    job.statusText = `✓ Padrão do cliente "${saved.name}" salvo!`;
  }

  // Retorna true se a rota foi tratada
  return async function handle(pathname, req, res, readJsonBody, sendJson) {
    // --- Biblioteca de Padrões v2 (Fases 1, 2, 7) ---
    if (pathname === "/api/padroes" && req.method === "GET") {
      return sendJson(res, 200, { ok: true, padroes: padroesStore.listPadroes() }), true;
    }
    if (pathname === "/api/padroes/importar" && req.method === "POST") {
      const body = await readJsonBody(req);
      if (!body.nome) return sendJson(res, 400, { ok: false, error: "Nome do padrão ausente" }), true;
      const job = launch("padrao_import", async (j, b) => {
        j.statusText = "Extraindo regras do PDF e medidas da referência...";
        j.pct = 20;
        const resImp = await importarPadrao({
          id: b.id,
          nome: b.nome,
          pdfBase64: b.pdfBase64 || null,
          quadrosBase64: Array.isArray(b.quadrosBase64) ? b.quadrosBase64 : [],
          medidas: b.medidas || null,
          observacoes: b.observacoes || "",
          callGemini: (parts, opts) => callGemini(parts, (m) => { j.statusText = m; }, opts)
        });
        j.pct = 85;
        const saved = padroesStore.savePadrao(resImp.padrao.id, resImp.padrao, { force: true });
        j.result = { ...resImp, saved };
        j.status = "done";
        j.pct = 100;
        j.statusText = `✓ Padrão "${resImp.padrao.nome}" importado!`;
      }, body);
      return sendJson(res, 200, { ok: true, jobId: job.jobId }), true;
    }
    if (pathname.startsWith("/api/padroes/") && pathname.endsWith("/correcao") && req.method === "POST") {
      const id = pathname.slice("/api/padroes/".length, -"/correcao".length).trim();
      const body = await readJsonBody(req);
      const r = padroesStore.addCorrecao(id, body);
      return sendJson(res, r.ok ? 200 : 400, r), true;
    }
    if (pathname.startsWith("/api/padroes/") && pathname.endsWith("/asset") && req.method === "POST") {
      const id = pathname.slice("/api/padroes/".length, -"/asset".length).trim();
      const body = await readJsonBody(req);
      if (!body.filename || !body.base64) return sendJson(res, 400, { ok: false, error: "filename e base64 são obrigatórios" }), true;
      const r = padroesStore.saveAsset(id, body.filename, body.base64);
      return sendJson(res, 200, r), true;
    }
    if (pathname.startsWith("/api/padroes/") && pathname.endsWith("/cartela") && req.method === "POST") {
      const id = pathname.slice("/api/padroes/".length, -"/cartela".length).trim();
      const loaded = padroesStore.getPadrao(id);
      if (!loaded) return sendJson(res, 404, { ok: false, error: "Padrão não encontrado" }), true;
      const outPng = path.join(loaded.dir, "cartela.png");
      const script = path.join(__dirname, "motor_padrao", "ferramentas", "cartela_teste.js");
      const r = spawnSync(process.execPath, [script, loaded.file, "--saida", outPng], { encoding: "utf8", windowsHide: true });
      if (r.status !== 0 || !fs.existsSync(outPng)) {
        return sendJson(res, 500, { ok: false, error: (r.stderr || r.stdout || "Falha ao gerar cartela").trim() }), true;
      }
      const b64 = fs.readFileSync(outPng).toString("base64");
      return sendJson(res, 200, { ok: true, image: `data:image/png;base64,${b64}` }), true;
    }
    if (pathname.startsWith("/api/padroes/") && req.method === "GET") {
      const id = pathname.slice("/api/padroes/".length).trim();
      const loaded = padroesStore.getPadrao(id);
      if (!loaded) return sendJson(res, 404, { ok: false, error: "Padrão não encontrado" }), true;
      return sendJson(res, 200, { ok: true, ...loaded }), true;
    }
    if (pathname.startsWith("/api/padroes/") && req.method === "POST") {
      const id = pathname.slice("/api/padroes/".length).trim();
      const body = await readJsonBody(req);
      const r = padroesStore.savePadrao(id, body.padrao || body);
      return sendJson(res, r.ok ? 200 : 400, r), true;
    }
    if (pathname.startsWith("/api/padroes/") && req.method === "DELETE") {
      const id = pathname.slice("/api/padroes/".length).trim();
      return sendJson(res, 200, padroesStore.deletePadrao(id)), true;
    }

    // --- Plano de Edição IA por corte (Fase 3) ---
    if (pathname === "/api/ai/plano" && req.method === "POST") {
      const body = await readJsonBody(req);
      const loaded = padroesStore.getPadrao(body.padraoId || body.style || "daniel_gaia") || padroesStore.getPadrao("tibapa");
      if (!loaded) return sendJson(res, 404, { ok: false, error: "Padrão não encontrado" }), true;
      const padrao = loaded.padrao;
      const palavras = Array.isArray(body.palavras) ? body.palavras : [];
      const dur = Number(body.duracao) || (palavras.length ? (palavras[palavras.length - 1].e || 30) : 30);
      const catalogo = Array.isArray(body.catalogo) ? body.catalogo : [];
      const prompt = promptPlano(padrao, palavras, catalogo);
      const schema = schemaPlanoGemini(padrao, catalogo);
      const rawIa = await callGemini([{ text: prompt }], null, { responseSchema: schema, temperature: 0.3 });
      const val = validarPlanoIA(rawIa, padrao, palavras, catalogo);
      const reg = aplicarRegras({ padrao, plano: val.plano, palavras, cortes: body.cortes || [], fimFala: dur });
      return sendJson(res, 200, {
        ok: true,
        plano: reg.plano,
        ocultarLegenda: reg.ocultarLegenda,
        avisos: [...val.avisos, ...reg.avisos]
      }), true;
    }

    if (pathname === "/api/ai/config" && req.method === "GET") {
      const cfg = loadConfig();
      return sendJson(res, 200, { ok: true, hasKey: !!getApiKey(), model: getModel(), keyHint: cfg.geminiApiKey ? "••••" + cfg.geminiApiKey.slice(-4) : "", usage: loadUsage() }), true;
    }
    if (pathname === "/api/ai/usage" && req.method === "GET") {
      return sendJson(res, 200, { ok: true, usage: loadUsage() }), true;
    }
    if (pathname === "/api/ai/clients" && req.method === "GET") {
      return sendJson(res, 200, { ok: true, clients: listClients() }), true;
    }
    if (pathname === "/api/ai/clients/import" && req.method === "POST") {
      const body = await readJsonBody(req);
      if (!body.name) return sendJson(res, 400, { ok: false, error: "Nome do cliente ausente" }), true;
      return sendJson(res, 200, { ok: true, jobId: launch("client", importClientProfile, body).jobId }), true;
    }
    if (pathname.startsWith("/api/ai/preset-preview/") && req.method === "GET") {
      const cleanName = pathname.replace("/api/ai/preset-preview/", "").replace(/[^a-zA-Z0-9_-]/g, "").trim();
      const previewsDir = path.join(__dirname, "..", "previews");
      const filePath = path.join(previewsDir, `${cleanName}.jpg`);
      if (fs.existsSync(filePath)) {
        try {
          const stat = fs.statSync(filePath);
          res.writeHead(200, {
            "Content-Type": "image/jpeg",
            "Content-Length": stat.size,
            "Cache-Control": "public, max-age=86400",
            "Access-Control-Allow-Origin": "*"
          });
          const stream = fs.createReadStream(filePath);
          stream.on("error", () => { try { res.end(); } catch (_) {} });
          stream.pipe(res);
          return true;
        } catch (_) {}
      }
      res.writeHead(404, { "Access-Control-Allow-Origin": "*" });
      res.end("Preview image not found");
      return true;
    }
    if (pathname.startsWith("/api/ai/clients/") && req.method === "DELETE") {
      const id = pathname.replace("/api/ai/clients/", "").trim();
      return sendJson(res, 200, { ok: deleteClient(id) }), true;
    }
    if (pathname === "/api/ai/config" && req.method === "POST") {
      const body = await readJsonBody(req);
      const patch = {};
      if (typeof body.geminiApiKey === "string") patch.geminiApiKey = body.geminiApiKey.trim();
      if (typeof body.geminiModel === "string" && body.geminiModel.trim()) patch.geminiModel = body.geminiModel.trim();
      saveConfig(patch);
      return sendJson(res, 200, { ok: true, hasKey: !!getApiKey(), model: getModel() }), true;
    }
    if (pathname === "/api/ai/analyze" && req.method === "POST") {
      const body = await readJsonBody(req);
      if (!body.url) return sendJson(res, 400, { ok: false, error: "URL ausente" }), true;
      return sendJson(res, 200, { ok: true, jobId: launch("ai", analyze, body).jobId }), true;
    }
    if (pathname === "/api/ai/stream" && req.method === "GET") {
      const targetUrl = new URL(req.url, "http://127.0.0.1").searchParams.get("url");
      if (!targetUrl) return sendJson(res, 400, { ok: false, error: "URL ausente" }), true;
      let entry = analyses.get(targetUrl);
      if (!entry?.info) {
        const info = await extractUrlInfoWithYtDlp(targetUrl);
        if (info) {
          entry = { ...(entry || {}), info };
          analyses.set(targetUrl, entry);
        }
      }
      const streamUrl = pickMuxedPreviewUrl(entry?.info);
      if (!streamUrl) return sendJson(res, 404, { ok: false, error: "Stream de prévia indisponível" }), true;
      const headers = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" };
      if (req.headers.range) headers.Range = req.headers.range;
      const u = new URL(streamUrl);
      const proxyReq = https.request({
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        method: "GET",
        headers
      }, (up) => {
        const outHeaders = {
          "Content-Type": up.headers["content-type"] || "video/mp4",
          "Accept-Ranges": "bytes",
          "Access-Control-Allow-Origin": "*"
        };
        if (up.headers["content-length"]) outHeaders["Content-Length"] = up.headers["content-length"];
        if (up.headers["content-range"]) outHeaders["Content-Range"] = up.headers["content-range"];
        res.writeHead(up.statusCode || 200, outHeaders);
        up.pipe(res);
      });
      proxyReq.on("error", () => {
        if (!res.headersSent) res.writeHead(502);
        res.end();
      });
      req.on("close", () => proxyReq.destroy());
      proxyReq.end();
      return true;
    }
    if (pathname === "/api/ai/preview" && req.method === "POST") {
      const body = await readJsonBody(req);
      if (!body.url) return sendJson(res, 400, { ok: false, error: "URL ausente" }), true;
      return sendJson(res, 200, { ok: true, jobId: launch("prev", preview, body).jobId }), true;
    }
    if (pathname.startsWith("/api/ai/preview-file/") && req.method === "GET") {
      const jobId = pathname.replace("/api/ai/preview-file/", "").trim();
      const job = jobs.get(jobId);
      if (!job || !job.outputPath || !fs.existsSync(job.outputPath)) {
        res.writeHead(404);
        return res.end("Not found");
      }
      const stat = fs.statSync(job.outputPath);
      const range = req.headers.range;
      if (range) {
        const [sStr, eStr] = range.replace(/bytes=/, "").split("-");
        const s = parseInt(sStr, 10) || 0;
        const e = eStr ? parseInt(eStr, 10) : stat.size - 1;
        res.writeHead(206, {
          "Content-Range": `bytes ${s}-${e}/${stat.size}`,
          "Accept-Ranges": "bytes",
          "Content-Length": e - s + 1,
          "Content-Type": "video/mp4",
          "Access-Control-Allow-Origin": "*"
        });
        fs.createReadStream(job.outputPath, { start: s, end: e }).pipe(res);
      } else {
        res.writeHead(200, {
          "Content-Length": stat.size,
          "Accept-Ranges": "bytes",
          "Content-Type": "video/mp4",
          "Access-Control-Allow-Origin": "*"
        });
        fs.createReadStream(job.outputPath).pipe(res);
      }
      return true;
    }
    if (pathname === "/api/ai/render" && req.method === "POST") {
      const body = await readJsonBody(req);
      if (!body.url && !body.localFile) return sendJson(res, 400, { ok: false, error: "URL ou localFile ausente" }), true;
      return sendJson(res, 200, { ok: true, jobId: launch("render", render, body).jobId }), true;
    }
    if (pathname === "/api/engine/update" && req.method === "POST") {
      return sendJson(res, 200, { ok: true, jobId: launch("upd", updateEngine, {}).jobId }), true;
    }
    return false;
  };
};
