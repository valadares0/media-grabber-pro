// =========================================================================
// Media Grabber Pro - Estúdio de Cortes Virais IA (front-end)
// =========================================================================
const ENGINE = "http://127.0.0.1:48721";
const $ = (id) => document.getElementById(id);

let current = null; // { url, meta, clips }

// ---------- utilidades ----------
function fmt(t) {
  t = Math.max(0, Math.round(t));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(s).padStart(2, "0");
}
function parseTime(str) {
  const p = String(str).trim().split(":").map(Number);
  if (p.some(isNaN)) return NaN;
  return p.reduce((acc, v) => acc * 60 + v, 0);
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
async function api(path, body) {
  const token = await getEngineToken();
  const headers = token ? { "X-MG-Token": token } : {};
  if (body) headers["Content-Type"] = "application/json";
  const r = await fetch(ENGINE + path, body
    ? { method: "POST", headers, body: JSON.stringify(body) }
    : { headers });
  return r.json();
}

const MG_STAGES = {
  analyze: [
    { ico: "⬇️", lbl: "Baixando", anim: "anim-dl", maxPct: 28 },
    { ico: "📝", lbl: "Transcrevendo", anim: "anim-write", maxPct: 58 },
    { ico: "🧠", lbl: "Analisando IA", anim: "anim-pulse", maxPct: 95 },
    { ico: "✅", lbl: "Pronto", anim: "anim-pulse", maxPct: 100 }
  ],
  render: [
    { ico: "⬇️", lbl: "Baixando", anim: "anim-dl", maxPct: 43 },
    { ico: "✂️", lbl: "Cortando", anim: "anim-cut", maxPct: 49 },
    { ico: "🎯", lbl: "Rastreando", anim: "anim-pulse", maxPct: 56 },
    { ico: "✍️", lbl: "Legendando", anim: "anim-write", maxPct: 68 },
    { ico: "🎬", lbl: "Renderizando", anim: "anim-spin", maxPct: 95 },
    { ico: "✅", lbl: "Conferido", anim: "anim-pulse", maxPct: 100 }
  ]
};

function updateStageLoader(container, mode, pct, statusText) {
  if (!container) return;
  const stages = MG_STAGES[mode] || MG_STAGES.render;
  let wrap = container.querySelector(".mg-stage-loader");
  if (!wrap || wrap.dataset.mode !== mode) {
    if (wrap) wrap.remove();
    wrap = document.createElement("div");
    wrap.className = "mg-stage-loader";
    wrap.dataset.mode = mode;

    const stepsEl = document.createElement("div");
    stepsEl.className = "mg-stage-steps";
    stages.forEach((st) => {
      const s = document.createElement("div");
      s.className = "mg-stage-step";
      const ico = document.createElement("div");
      ico.className = "mg-stage-ico";
      const span = document.createElement("span");
      span.className = st.anim;
      span.textContent = st.ico;
      ico.appendChild(span);
      const lbl = document.createElement("div");
      lbl.className = "mg-stage-lbl";
      lbl.textContent = st.lbl;
      s.appendChild(ico);
      s.appendChild(lbl);
      stepsEl.appendChild(s);
    });

    const track = document.createElement("div");
    track.className = "mg-stage-track";
    const fill = document.createElement("div");
    fill.className = "mg-stage-fill";
    track.appendChild(fill);

    const meta = document.createElement("div");
    meta.className = "mg-stage-meta";
    const mTxt = document.createElement("span");
    mTxt.className = "mg-stage-msg";
    const mPct = document.createElement("b");
    mPct.className = "mg-stage-pct";
    meta.appendChild(mTxt);
    meta.appendChild(mPct);

    wrap.appendChild(stepsEl);
    wrap.appendChild(track);
    wrap.appendChild(meta);
    container.prepend(wrap);
  }

  const p = Math.max(0, Math.min(100, Number(pct) || 0));
  let activeIdx = stages.findIndex((st) => p < st.maxPct);
  if (activeIdx === -1) activeIdx = stages.length - 1;
  if (p >= 100) activeIdx = stages.length;

  wrap.querySelectorAll(".mg-stage-step").forEach((el, idx) => {
    el.classList.remove("done", "active");
    const icoSpan = el.querySelector(".mg-stage-ico span");
    if (idx < activeIdx) {
      el.classList.add("done");
      if (icoSpan) icoSpan.textContent = "✓";
    } else if (idx === activeIdx) {
      el.classList.add("active");
      if (icoSpan) icoSpan.textContent = stages[idx].ico;
    } else {
      if (icoSpan) icoSpan.textContent = stages[idx].ico;
    }
  });
  const fillEl = wrap.querySelector(".mg-stage-fill");
  if (fillEl) fillEl.style.width = p + "%";
  const msgEl = wrap.querySelector(".mg-stage-msg");
  if (msgEl) msgEl.textContent = statusText || "";
  const pctEl = wrap.querySelector(".mg-stage-pct");
  if (pctEl) pctEl.textContent = Math.round(p) + "%";
}
function poll(jobId, onTick) {
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const { job } = await api("/api/progress/" + jobId);
        if (!job) return reject(new Error("Job perdido (motor reiniciou?)"));
        onTick(job);
        if (job.status === "done") return resolve(job);
        if (job.status === "error") return reject(new Error(job.error || "Erro"));
        setTimeout(tick, 800);
      } catch (e) { reject(e); }
    };
    tick();
  });
}
function ytId(url) {
  const m = url.match(/(?:v=|youtu\.be\/|shorts\/|live\/|embed\/)([\w-]{11})/);
  return m ? m[1] : null;
}

function renderUsage(u) {
  if (!u) return;
  const dailyBudget = 1000000; // 1M tokens/dia referência do Free Tier
  const today = u.todayTokens || 0;
  const pct = Math.min(100, Math.max(today > 0 ? 2 : 0, (today / dailyBudget) * 100));
  const estUsd = ((today / 1000000) * 0.15).toFixed(4);
  $("usageLabel").textContent =
    `📊 Consumo API Gemini hoje: ${today.toLocaleString("pt-BR")} tokens (${u.todayRequests || 0} chamadas)` +
    (u.lastTokens ? ` · Última: ${u.lastTokens.toLocaleString("pt-BR")} tokens (${u.lastModel || "gemini"})` : "");
  $("usageCost").textContent = `Custo est.: ~US$ ${estUsd} (Grátis no Free Tier) · Total geral: ${(u.totalTokens || 0).toLocaleString("pt-BR")}`;
  $("usageFill").style.width = pct + "%";
}

// ---------- motor / config ----------
async function checkEngine() {
  const pill = $("engineStatus");
  try {
    const h = await api("/api/health");
    const c = await api("/api/ai/config");
    pill.textContent = `Motor ativo · ${c.hasKey ? "Gemini conectado ✓" : "sem chave Gemini"}`;
    pill.className = "pill " + (c.hasKey ? "ok" : "");
    $("keyStatus").textContent = c.hasKey ? `Chave salva ${c.keyHint || ""} · modelo ${c.model}` : "Nenhuma chave salva.";
    $("modelInput").value = c.model || "";
    if (c.usage) renderUsage(c.usage);
    if (!c.hasKey) $("settings").classList.remove("hidden");
    return !!h.ok;
  } catch (_) {
    pill.textContent = "Motor desligado — execute INSTALAR_EXTENSAO.bat";
    pill.className = "pill bad";
    return false;
  }
}

$("settingsBtn").onclick = () => $("settings").classList.toggle("hidden");
$("saveKeyBtn").onclick = async () => {
  const body = { geminiModel: $("modelInput").value };
  if ($("apiKeyInput").value.trim()) body.geminiApiKey = $("apiKeyInput").value.trim();
  await api("/api/ai/config", body);
  $("apiKeyInput").value = "";
  await checkEngine();
};
$("openFolderBtn").onclick = async (e) => {
  const b = e.target;
  const original = b.textContent;
  b.textContent = "Abrindo pasta...";
  try {
    const res = await api("/api/open-folder", {});
    const target = res.path || "Downloads\\MediaGrabber\\Videos\\Cortes_IA";
    if (navigator.clipboard) {
      navigator.clipboard.writeText(target).catch(() => {});
    }
    b.textContent = "✓ Pasta aberta!";
    setTimeout(() => { b.textContent = original; }, 2500);
  } catch (_) {
    b.textContent = "Erro ao abrir";
    setTimeout(() => { b.textContent = original; }, 2500);
  }
};
$("updateEngineBtn").onclick = async (e) => {
  const b = e.target;
  b.disabled = true;
  b.textContent = "Atualizando...";
  try {
    const { jobId } = await api("/api/engine/update", {});
    const job = await poll(jobId, () => {});
    b.textContent = job.statusText;
  } catch (err) {
    b.textContent = "Falhou: " + err.message;
  }
  setTimeout(() => { b.disabled = false; b.textContent = "🔄 Atualizar motor"; }, 4000);
};

// ---------- análise ----------
$("analyzeBtn").onclick = async () => {
  const url = $("urlInput").value.trim();
  if (!/^https?:\/\//.test(url)) return alert("Cole um link válido (http...).");
  const btn = $("analyzeBtn");
  btn.disabled = true;
  $("clips").innerHTML = "";
  $("videoMeta").classList.add("hidden");
  const prog = $("analyzeProgress");
  const fix = $("fixingBanner");
  prog.classList.remove("hidden");
  fix.classList.add("hidden");
  try {
    const { jobId, error } = await api("/api/ai/analyze", {
      url,
      minLen: +$("minLen").value, maxLen: +$("maxLen").value,
      count: +$("count").value, focus: $("focus").value.trim()
    });
    if (!jobId) throw new Error(error || "Falha ao iniciar");
    const job = await poll(jobId, (j) => {
      $("analyzeFill").style.width = j.pct + "%";
      $("analyzeText").textContent = j.statusText;
      updateStageLoader(prog, "analyze", j.pct, j.statusText);
      if (j.fixing) {
        $("fixingText").textContent = j.statusText || "Estou corrigindo, aguarde...";
        fix.classList.remove("hidden");
      } else {
        fix.classList.add("hidden");
      }
    });
    current = { url, ...job.result };
    if (job.result?.usage) renderUsage(job.result.usage);
    renderMeta();
    renderClips();
  } catch (e) {
    fix.classList.add("hidden");
    $("analyzeText").textContent = "❌ " + e.message;
    $("analyzeFill").style.width = "0";
    return;
  } finally {
    btn.disabled = false;
  }
  fix.classList.add("hidden");
  prog.classList.add("hidden");
};

function renderMeta() {
  const m = current.meta;
  const el = $("videoMeta");
  el.innerHTML = "";
  if (m.thumbnail) {
    const img = document.createElement("img");
    img.src = m.thumbnail;
    el.appendChild(img);
  }
  const box = document.createElement("div");
  box.innerHTML = `<h2></h2><div class="muted"></div>`;
  box.querySelector("h2").textContent = m.title;
  box.querySelector("div").textContent =
    `${m.uploader} · ${fmt(m.duration)} · ${current.wordCount} palavras transcritas · análise: ${current.engine === "gemini" ? "Gemini IA" : "local (sem chave)"}`;
  el.appendChild(box);
  el.classList.remove("hidden");
}

function renderClips() {
  const list = $("clips");
  list.innerHTML = "";
  const id = ytId(current.url);
  current.clips.forEach((c, i) => {
    const node = $("clipTpl").content.firstElementChild.cloneNode(true);
    if (i === 0) node.classList.add("rank1");
    const sc = node.querySelector(".score");
    sc.textContent = c.score;
    sc.classList.add(c.score >= 90 ? "s90" : c.score >= 80 ? "s80" : "s70");
    node.querySelector(".title").textContent = `#${i + 1} ${c.title}`;
    node.querySelector(".hook").textContent = c.hook ? `“${c.hook}”` : "";
    node.querySelector(".reason").textContent = c.reason;
    const subs = c.scores || {};
    const labels = { hook: "Gancho", flow: "Fluidez", value: "Valor", trend: "Tendência" };
    const moodLabels = {
      calm: "🕊️ Trilha: Calma (Piano)",
      epic: "⚔️ Trilha: Épica",
      hype: "🔥 Trilha: Hype / Animada",
      tense: "⚡ Trilha: Tensão / Alerta"
    };
    node.querySelector(".subscores").innerHTML = Object.keys(labels)
      .filter((k) => subs[k] != null)
      .map((k) => `<span>${labels[k]} <b>${Math.round(subs[k])}</b></span>`).join("") +
      (c.musicMood && moodLabels[c.musicMood] ? ` <span class="pill" style="font-size:11px;margin-left:4px">${moodLabels[c.musicMood]}</span>` : "");
    const ts = node.querySelector(".t-start"), te = node.querySelector(".t-end"), len = node.querySelector(".len");
    ts.value = fmt(c.start);
    te.value = fmt(c.end);
    const upd = () => {
      const s = parseTime(ts.value), e = parseTime(te.value);
      if (!isNaN(s) && !isNaN(e) && e > s) { c.start = s; c.end = e; len.textContent = `${Math.round(e - s)}s`; setPreview(); }
    };
    ts.onchange = upd; te.onchange = upd;
    len.textContent = `${Math.round(c.end - c.start)}s`;
    node.querySelector(".transcript").textContent = c.transcript;
    node.querySelector(".caption").value = [c.caption, (c.hashtags || []).join(" ")].filter(Boolean).join("\n\n");

    const prev = node.querySelector(".preview");
    function setPreview() {
      prev.classList.remove("vertical-sim");
      prev.innerHTML = "";
      const img = document.createElement("img");
      img.src = id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : (current.meta.thumbnail || "");
      img.title = "Clique para pré-visualizar este corte";
      img.style.cursor = "pointer";
      img.onclick = () => previewClip(c, node);
      const badge = document.createElement("span");
      badge.className = "preview-badge";
      badge.textContent = "▶ Clique para pré-visualizar";
      prev.append(img, badge);
    }
    setPreview();

    node.querySelector(".act-preview").onclick = () => previewClip(c, node);
    node.querySelector(".act-mp4").onclick = () => renderClip(c, node, "mp4");
    node.querySelector(".act-gif").onclick = () => renderClip(c, node, "gif");
    node.querySelector(".act-mp3").onclick = () => renderClip(c, node, "mp3");
    node.querySelector(".act-copy").onclick = (e) => {
      navigator.clipboard.writeText(node.querySelector(".caption").value);
      e.target.textContent = "✓ Copiado";
    };
    c._node = node;
    list.appendChild(node);
  });
}

// ---------- Presets de Edição & Perfis de Clientes ----------
let activeClientId = "tibapa";
let currentModalPresetId = "tibapa";

const PRESETS = {
  tibapa: {
    name: "⛪ Tibapa (Sermão / Pregação)",
    badge: "Referência Pinterest (Alcance Juazeiro / Elizeu)",
    format: "vertical",
    layout: "crop",
    style: "tibapa",
    trimSilences: false,
    centerPerson: true,
    dynamic: false,
    hook: false,
    previewImg: `${ENGINE}/api/ai/preset-preview/tibapa`,
    aiFocus: "Pregação, sermão e mensagem de fé: momentos de revelação profunda, ensinamentos bíblicos, conexão emocional e conclusão com autoridade.",
    specs: {
      desc: "Estilo editorial premium baseado diretamente nos vídeos de sermão do Pinterest. Tipografia sóbria sem traços infantis, com destaque em âmbar dourado bíblico e pausas naturais preservadas para máxima autoridade espiritual.",
      font: "Georgia / Playfair (Serif Editorial, 70px)",
      colors: [
        { label: "Branco puro (Base)", hex: "#FFFFFF" },
        { label: "Âmbar Dourado (Palavras-Chave)", hex: "#D97706" }
      ],
      position: "Centro / Altura do Tórax (35% da base)",
      pacing: "2 a 3 palavras por bloco (Ritmo Solene)",
      silences: "Pausas naturais preservadas (Sem corte picotado)",
      useFor: "Cultos, pregações, ministração bíblica, palestras reflexivas"
    }
  },
  mrbeast: {
    name: "💚 MrBeast Hype",
    badge: "Ultra Retenção & Viralidade",
    format: "vertical",
    layout: "crop",
    style: "mrbeast",
    trimSilences: true,
    centerPerson: true,
    dynamic: true,
    hook: true,
    previewImg: `${ENGINE}/api/ai/preset-preview/mrbeast`,
    aiFocus: "Cortes ultra dinâmicos, momentos de alta adrenalina, desafios, reações e frases curtas explosivas.",
    specs: {
      desc: "Estilo assinatura MrBeast: fonte gigante em caixa alta com traço preto ultra pesado de 7px, gancho vibrante no topo e animação de pop em cada palavra para retenção máxima no TikTok e Shorts.",
      font: "Impact (Caixa Alta Gigante, 88px, traço 7px)",
      colors: [
        { label: "Branco puro", hex: "#FFFFFF" },
        { label: "Verde Neon Hype", hex: "#22C55E" },
        { label: "Amarelo Elétrico (Gancho)", hex: "#FFE600" }
      ],
      position: "Centro da tela com impulsos de escala (30% margem)",
      pacing: "1 a 2 palavras por segundo (Frenético)",
      silences: "Corte agressivo de pausas e respiros (> 0.25s)",
      useFor: "Vídeos de desafios, games, reações rápidas e entretenimento viral"
    }
  },
  hormozi: {
    name: "🔥 Hormozi Viral",
    badge: "Autoridade & Business",
    format: "vertical",
    layout: "crop",
    style: "hormozi",
    trimSilences: true,
    centerPerson: true,
    dynamic: true,
    hook: true,
    previewImg: `${ENGINE}/api/ai/preset-preview/hormozi`,
    aiFocus: "Dicas práticas de negócios, dinheiro, mentalidade, frases diretas e sem rodeios.",
    specs: {
      desc: "Estilo Alex Hormozi: tipografia bold condensada com destaque amarelo marcante, tarja de gancho de alto contraste no topo e remoção cirúrgica de respiros para fala acelerada.",
      font: "Arial Black (Pesado, Caixa Alta, 78px)",
      colors: [
        { label: "Branco puro", hex: "#FFFFFF" },
        { label: "Amarelo Ouro", hex: "#FACC15" }
      ],
      position: "Terço médio / Centro (30% margem vertical)",
      pacing: "2 a 3 palavras por linha com pop dinâmico",
      silences: "Corte rápido de respiros (> 0.35s)",
      useFor: "Marketing, vendas, finanças, mentoria e desenvolvimento pessoal"
    }
  },
  podcast: {
    name: "🎙️ Podcast / Debate",
    badge: "Conversa & Entrevista Fluida",
    format: "vertical",
    layout: "blur",
    style: "clean",
    trimSilences: true,
    centerPerson: false,
    dynamic: false,
    hook: false,
    previewImg: `${ENGINE}/api/ai/preset-preview/podcast`,
    aiFocus: "Conversas profundas, histórias interessantes, debates e revelações entre duas ou mais pessoas.",
    specs: {
      desc: "Enquadramento 9:16 com fundo desfocado que mantém ambos os participantes visíveis sem distorção. Legendas elegantes em caixa normal com faixa escura translúcida (estilo Netflix / documentário).",
      font: "Segoe UI (Caixa normal, 58px, Faixa escura)",
      colors: [
        { label: "Branco gelo", hex: "#F8FAFC" },
        { label: "Azul Céu Moderno", hex: "#38BDF8" }
      ],
      position: "Terço inferior clássico (18% da base)",
      pacing: "4 a 6 palavras por linha (Leitura confortável)",
      silences: "Corte suave de pausas longas sem quebrar a fala",
      useFor: "Mesacasts, podcasts, entrevistas e conversas a dois"
    }
  },
  encaixa: {
    name: "🏭 Encaixa (Corporativo B2B)",
    badge: "Referência Pinterest (Indústria)",
    format: "vertical",
    layout: "crop",
    style: "encaixa",
    trimSilences: true,
    centerPerson: true,
    dynamic: false,
    hook: false,
    previewImg: `${ENGINE}/api/ai/preset-preview/encaixa`,
    aiFocus: "Processos industriais, histórias de clientes, autoridade corporativa e storytelling institucional.",
    specs: {
      desc: "Tipografia cinética editorial fiel ao vídeo de referência: combina sans delicada (Montserrat Light), sans forte (ExtraBold) e serifada itálica (Playfair Display) em laranja corporativo, com tarja riscada brilhante animada e flash cards Laranja/Branco.",
      font: "Montserrat Light + ExtraBold + Playfair Display Italic",
      colors: [
        { label: "Branco puro", hex: "#FFFFFF" },
        { label: "Laranja Industrial", hex: "#E85D04" }
      ],
      position: "Composição escalonada no gancho + corpo minimalista na base",
      pacing: "Batidas editoriais com blur-to-sharp, wipe horizontal e flash cards",
      silences: "Corte moderado de pausas",
      useFor: "Empresas, fábricas, serviços, B2B e estudos de caso"
    }
  },
  cinema: {
    name: "🎬 Cinema 16:9",
    badge: "Documentário & YouTube",
    format: "original",
    layout: "crop",
    style: "clean",
    trimSilences: false,
    centerPerson: false,
    dynamic: false,
    hook: false,
    previewImg: `${ENGINE}/api/ai/preset-preview/cinema`,
    aiFocus: "Momentos solenes, histórias cinematográficas e frases de impacto visual em formato widescreen.",
    specs: {
      desc: "Mantém a proporção horizontal original (16:9) do vídeo com legendas em estilo de cinema europeu: fonte com serifa suave amarela na base da tela, ideal para YouTube horizontal.",
      font: "Georgia (Serif Cinema, 54px)",
      colors: [
        { label: "Amarelo Cinema Suave", hex: "#FEF08A" }
      ],
      position: "Base da tela (10% margem vertical)",
      pacing: "Frases completas de 5 a 7 palavras",
      silences: "Sem corte de pausas (Respeita o tempo do orador)",
      useFor: "YouTube longo, documentários, cursos e palestras completas"
    }
  },
  raw: {
    name: "🧼 Cru (Sem Edição)",
    badge: "Puro Original",
    format: "vertical",
    layout: "crop",
    style: "none",
    trimSilences: false,
    centerPerson: true,
    dynamic: false,
    hook: false,
    previewImg: `${ENGINE}/api/ai/preset-preview/raw`,
    aiFocus: "Trechos espontâneos e autênticos sem nenhuma legenda ou alteração.",
    specs: {
      desc: "Corte limpo e direto da filmagem original sem legendas, sem gancho e sem aceleração artificial. Ideal para quem prefere finalizar a edição manualmente no Premiere ou CapCut.",
      font: "Sem legendas inseridas",
      colors: [
        { label: "Gravação original", hex: "#94A3B8" }
      ],
      position: "Enquadramento 9:16 ou original",
      pacing: "Áudio 100% original sem cortes de respiração",
      silences: "Sem cortes",
      useFor: "Exportação de brutos para pós-produção externa"
    }
  }
};

function applyPresetObj(p, clientId = null) {
  activeClientId = clientId;
  if (p.format) $("optFormat").value = p.format;
  if (p.layout) $("optLayout").value = p.layout;
  if (p.style) $("optStyle").value = p.style;
  if (p.trimSilences != null) $("optTrimSilences").checked = !!p.trimSilences;
  if (p.centerPerson != null) $("optCenterPerson").checked = !!p.centerPerson;
  if (p.dynamic != null) $("optDynamic").checked = !!p.dynamic;
  if (p.hook != null) $("optHook").checked = !!p.hook;
  if (p.bgMusic && $("optMusic")) $("optMusic").value = p.bgMusic;
  if (p.aiFocus && !$("focus").value.trim()) $("focus").value = p.aiFocus;

  const badge = $("activePresetBadge");
  if (badge) {
    badge.textContent = `Ativo: ${p.name || clientId || "Padrão"}`;
  }
}

// Modal de prévia de preset
function openPresetPreview(presetKey, customData = null) {
  currentModalPresetId = presetKey;
  const p = customData || PRESETS[presetKey] || PRESETS.tibapa;
  const specs = p.specs || {};

  $("modalPresetName").textContent = p.name || presetKey;
  $("modalPresetBadge").textContent = p.badge || "Visualização Real";
  $("modalPresetDesc").textContent = specs.desc || p.description || "Preset profissional de edição de vídeo.";

  $("specFont").textContent = specs.font || (p.customStyle?.font ? `${p.customStyle.font} (${p.customStyle.fontSize}px)` : "-");
  $("specPosition").textContent = specs.position || (p.customStyle?.marginVPct ? `${Math.round(p.customStyle.marginVPct * 100)}% da base` : "Centro da tela");
  $("specPacing").textContent = specs.pacing || (p.customStyle?.wordsPerLine ? `${p.customStyle.wordsPerLine} palavras por bloco` : "Dinâmico");
  $("specSilences").textContent = specs.silences || (p.trimSilences ? "✂️ Corta respiros e pausas" : "Pausas preservadas");
  $("specUseFor").textContent = specs.useFor || p.aiFocus || "Cortes e vídeos virais";

  const colorContainer = $("specColors");
  colorContainer.innerHTML = "";
  const colorList = specs.colors || [
    { label: "Principal", hex: p.customStyle?.primaryColor || "#FFFFFF" },
    { label: "Destaque", hex: p.customStyle?.highlightColor || "#FACC15" }
  ];
  colorList.forEach((c) => {
    const chip = document.createElement("span");
    chip.className = "color-chip";
    chip.innerHTML = `<span class="color-dot" style="background:${c.hex}"></span> <b>${c.label}</b> (${c.hex})`;
    colorContainer.appendChild(chip);
  });

  const img = $("modalPresetImg");
  const fallbackSrc = `previews/${presetKey}.jpg`;
  img.onerror = () => { img.src = fallbackSrc; };
  img.src = p.previewImg || `${ENGINE}/api/ai/preset-preview/${presetKey}`;

  $("presetPreviewModal").classList.remove("hidden");
}

function closePresetModal() {
  $("presetPreviewModal").classList.add("hidden");
}

$("closePresetModalBtn").onclick = closePresetModal;
$("modalCloseBtn").onclick = closePresetModal;
document.querySelector(".preset-modal-overlay").onclick = closePresetModal;

$("modalSelectPresetBtn").onclick = () => {
  const card = document.querySelector(`.preset-card[data-preset="${currentModalPresetId}"]`) ||
               document.querySelector(`.preset-card[data-client-id="${currentModalPresetId}"]`);
  if (card) card.click();
  closePresetModal();
};

$("newClientBtn").onclick = () => $("clientImportBox").classList.toggle("hidden");

$("clientPdfInput")?.addEventListener("change", (e) => {
  const f = e.target.files?.[0];
  if ($("pdfFileName")) $("pdfFileName").textContent = f ? `✓ ${f.name} (${(f.size/1024).toFixed(0)} KB)` : "";
});

function bindPresetButtons() {
  document.querySelectorAll(".preset-card").forEach((card) => {
    card.onclick = (e) => {
      // Se clicou no botão "Ver Prévia", abre o modal
      if (e.target.closest(".btn-preview-preset")) {
        const pId = card.dataset.preset;
        const cId = card.dataset.clientId;
        if (cId) {
          openPresetPreview(cId, JSON.parse(card.dataset.clientJson));
        } else if (pId) {
          openPresetPreview(pId);
        }
        return;
      }
      document.querySelectorAll(".preset-card").forEach((b) => b.classList.remove("active"));
      card.classList.add("active");
      if (card.dataset.clientId) {
        applyPresetObj(JSON.parse(card.dataset.clientJson), card.dataset.clientId);
      } else {
        const p = PRESETS[card.dataset.preset];
        if (p) applyPresetObj(p, null);
      }
    };
  });
}

function openPadraoPreviewModal(p) {
  const existing = document.getElementById("mgPadraoPreviewModal");
  if (existing) existing.remove();

  const pad = p.padrao || {};
  const leg = pad.legenda || {};
  const dest = (pad.destaques && pad.destaques[0]) || null;
  const corTexto = leg.cor || "#FFFFFF";
  const corAtiva = leg.palavra_ativa?.cor || dest?.cor || "#FFD400";
  const corContorno = leg.contorno?.cor || "#000000";
  const tamPx = Number(leg.tamanho_px) || 60;
  const centroY = Number(leg.centro_y) || 1480;
  const caixaAlta = leg.caixa === "alta";
  const fonteNome = Object.values(pad.fontes || {})[0]?.arquivo
    ? String(Object.values(pad.fontes || {})[0].arquivo).split(/[\\/]/).pop()
    : (leg.fonte || "Montserrat ExtraBold");

  const overlay = document.createElement("div");
  overlay.id = "mgPadraoPreviewModal";
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(4,7,15,0.82);backdrop-filter:blur(6px);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px";
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

  const box = document.createElement("div");
  box.style.cssText = "background:#111827;border:1px solid #26324d;border-radius:14px;max-width:740px;width:100%;padding:18px;display:flex;gap:20px;flex-wrap:wrap;color:#e5e7eb;box-shadow:0 24px 60px rgba(0,0,0,0.6)";

  // Lado esquerdo: Canvas 9:16 (324 x 576 = escala 0.3 de 1080x1920)
  const canvasWrap = document.createElement("div");
  canvasWrap.style.cssText = "flex:0 0 290px;display:flex;flex-direction:column;align-items:center;gap:8px";
  const canvas = document.createElement("canvas");
  canvas.width = 540;
  canvas.height = 960;
  canvas.style.cssText = "width:270px;height:480px;border-radius:12px;border:1px solid #334155;background:#090d16;box-shadow:0 12px 30px rgba(0,0,0,0.5)";
  const ctx = canvas.getContext("2d");

  // Fundo estilo estúdio / vídeo real
  const bgGrad = ctx.createLinearGradient(0, 0, 540, 960);
  bgGrad.addColorStop(0, "#1e293b");
  bgGrad.addColorStop(0.45, "#0f172a");
  bgGrad.addColorStop(1, "#020617");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, 540, 960);

  // Luz de recorte suave + silhueta estilizada do apresentador
  const rad = ctx.createRadialGradient(270, 340, 30, 270, 380, 280);
  rad.addColorStop(0, "rgba(99,102,241,0.22)");
  rad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = rad;
  ctx.fillRect(0, 0, 540, 960);
  ctx.fillStyle = "rgba(148,163,184,0.16)";
  ctx.beginPath(); ctx.arc(270, 310, 74, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(270, 560, 145, 190, 0, Math.PI, 0, true); ctx.fill();

  // Gradiente inferior de leitura
  const legGrad = ctx.createLinearGradient(0, 560, 0, 960);
  legGrad.addColorStop(0, "rgba(0,0,0,0)");
  legGrad.addColorStop(1, "rgba(0,0,0,0.72)");
  ctx.fillStyle = legGrad;
  ctx.fillRect(0, 560, 540, 400);

  // Zonas seguras Reels/Shorts (discreto)
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.setLineDash([6, 6]);
  ctx.strokeRect(20, 110, 460, 740);
  ctx.setLineDash([]);

  // Desenha legenda de exemplo com a fonte, cor e posição reais (escala 0.5 de 1080x1920)
  if (leg.ativo !== false) {
    const fontScale = 0.5;
    const fSize = Math.max(18, Math.round(tamPx * fontScale));
    const yPos = Math.round(centroY * fontScale);
    const weight = (leg.peso || 800) >= 700 ? "900" : "600";
    ctx.font = `${weight} ${fSize}px "Montserrat", "Segoe UI", Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const l1 = caixaAlta ? "ESSE É O ESTILO" : "Esse é o estilo";
    const w1 = caixaAlta ? "DA SUA " : "da sua ";
    const w2 = caixaAlta ? "LEGENDA" : "legenda";

    ctx.shadowColor = "rgba(0,0,0,0.85)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;
    ctx.lineWidth = Math.max(2, (leg.contorno?.espessura_px || 3) * 1.1);
    ctx.strokeStyle = corContorno;

    // Linha 1
    ctx.strokeText(l1, 270, yPos - fSize * 0.65);
    ctx.fillStyle = corTexto;
    ctx.fillText(l1, 270, yPos - fSize * 0.65);

    // Linha 2 com palavra ativa em destaque
    const m1 = ctx.measureText(w1).width;
    const m2 = ctx.measureText(w2).width;
    const startX = 270 - (m1 + m2) / 2;
    ctx.textAlign = "left";
    ctx.strokeText(w1, startX, yPos + fSize * 0.55);
    ctx.fillStyle = corTexto;
    ctx.fillText(w1, startX, yPos + fSize * 0.55);
    ctx.strokeText(w2, startX + m1, yPos + fSize * 0.55);
    ctx.fillStyle = corAtiva;
    ctx.fillText(w2, startX + m1, yPos + fSize * 0.55);

    // Linha de destaque extra (ex: dourado do Gaia / linha vermelha)
    if (dest) {
      ctx.textAlign = "center";
      const dSize = Math.max(16, Math.round((dest.tamanho_px || tamPx * 1.1) * fontScale));
      ctx.font = `900 ${dSize}px "Montserrat", "Segoe UI", Arial, sans-serif`;
      const dTxt = (dest.caixa === "alta" ? "DESTAQUE DE IMPACTO" : "Destaque de impacto");
      ctx.strokeText(dTxt, 270, yPos + fSize * 1.8);
      ctx.fillStyle = dest.cor || corAtiva;
      ctx.fillText(dTxt, 270, yPos + fSize * 1.8);
    }
  } else {
    ctx.font = "700 22px 'Segoe UI', Arial, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.textAlign = "center";
    ctx.fillText("Vídeo limpo (sem legenda)", 270, 480);
  }
  canvasWrap.appendChild(canvas);

  // Lado direito: Detalhes de fontes, cores e ações
  const info = document.createElement("div");
  info.style.cssText = "flex:1;min-width:260px;display:flex;flex-direction:column;gap:12px";

  const head = document.createElement("div");
  head.style.cssText = "display:flex;justify-content:space-between;align-items:center";
  const h3 = document.createElement("h3");
  h3.style.cssText = "margin:0;font-size:17px";
  h3.textContent = p.nome || p.id;
  const closeBtn = document.createElement("button");
  closeBtn.className = "ghost";
  closeBtn.textContent = "✕ Fechar";
  closeBtn.onclick = () => overlay.remove();
  head.appendChild(h3);
  head.appendChild(closeBtn);
  info.appendChild(head);

  const specs = document.createElement("div");
  specs.style.cssText = "display:grid;gap:8px;font-size:13px;background:#0b1020;padding:12px;border-radius:10px;border:1px solid #1e293b";
  const addSpec = (k, v, swatchHex) => {
    const row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:8px";
    const kl = document.createElement("span"); kl.style.color = "#94a3b8"; kl.textContent = k;
    const vr = document.createElement("span"); vr.style.cssText = "display:flex;align-items:center;gap:6px;font-weight:600";
    if (swatchHex) {
      const dot = document.createElement("span");
      dot.style.cssText = `width:14px;height:14px;border-radius:4px;border:1px solid rgba(255,255,255,0.3);background:${swatchHex};display:inline-block`;
      vr.appendChild(dot);
    }
    const vt = document.createElement("span"); vt.textContent = v;
    vr.appendChild(vt);
    row.appendChild(kl); row.appendChild(vr);
    specs.appendChild(row);
  };
  addSpec("Fonte", fonteNome);
  addSpec("Tamanho / Posição", `${tamPx}px · Y=${centroY}px (${caixaAlta ? "MAIÚSCULAS" : "Original"})`);
  addSpec("Cor principal", corTexto, corTexto);
  addSpec("Cor de destaque", corAtiva, corAtiva);
  addSpec("Contorno", corContorno, corContorno);
  addSpec("Corte de pausas", `> ${pad.ritmo?.cortar_pausas_acima_s || 0.45}s`);
  info.appendChild(specs);

  const pendList = [...(p.erros || []), ...(p.pendencias || [])];
  if (pendList.length) {
    const pBox = document.createElement("div");
    pBox.style.cssText = "font-size:12px;background:#291f0a;border:1px solid #854d0e;color:#fde68a;padding:10px;border-radius:8px;max-height:110px;overflow:auto";
    pBox.textContent = "⚠ Pendências: " + pendList.join(" · ");
    info.appendChild(pBox);
  }

  const actions = document.createElement("div");
  actions.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;margin-top:auto";

  const btnUse = document.createElement("button");
  btnUse.className = "primary";
  btnUse.textContent = "✓ Usar este padrão";
  btnUse.onclick = () => {
    const c = document.querySelector(`.preset-card[data-preset="${p.id}"]`);
    if (c) c.click();
    overlay.remove();
  };
  actions.appendChild(btnUse);

  const btnFfmpeg = document.createElement("button");
  btnFfmpeg.className = "ghost";
  btnFfmpeg.textContent = "🎬 Prova Real (FFmpeg)";
  btnFfmpeg.onclick = async () => {
    btnFfmpeg.disabled = true;
    btnFfmpeg.textContent = "⏳ Gerando...";
    try {
      const r = await api(`/api/padroes/${encodeURIComponent(p.id)}/cartela`, {});
      if (r.ok && r.image) {
        const img = new Image();
        img.onload = () => { ctx.clearRect(0, 0, 540, 960); ctx.drawImage(img, 0, 0, 540, 960); };
        img.src = r.image;
      } else {
        alert("Não foi possível gerar a prova FFmpeg: " + (r.error || "verifique se o TTF está em assets/"));
      }
    } finally {
      btnFfmpeg.disabled = false;
      btnFfmpeg.textContent = "🎬 Prova Real (FFmpeg)";
    }
  };
  actions.appendChild(btnFfmpeg);

  const btnRegra = document.createElement("button");
  btnRegra.className = "ghost";
  btnRegra.textContent = "📌 Salvar regra";
  btnRegra.onclick = async () => {
    const regra = prompt(`Regra permanente ("isso vale sempre") para "${p.nome}":`);
    if (!regra || !regra.trim()) return;
    const r = await api(`/api/padroes/${encodeURIComponent(p.id)}/correcao`, { regra: regra.trim(), origem: "studio_ui" });
    alert(r.ok ? "✓ Regra salva neste padrão!" : ("Erro: " + (r.error || "")));
  };
  actions.appendChild(btnRegra);

  info.appendChild(actions);
  box.appendChild(canvasWrap);
  box.appendChild(info);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
}

async function loadClients() {
  try {
    const { padroes } = await api("/api/padroes");
    const bar = $("presetsBar");
    bar.textContent = "";
    const allList = Array.isArray(padroes) ? padroes : [];
    const editorPro = allList.find((x) => x.id === "editor_pro");
    const list = editorPro ? [editorPro] : allList;

    list.forEach((p) => {
      const card = document.createElement("div");
      card.className = "preset-card";
      card.dataset.preset = p.id;
      card.dataset.clientId = p.id;

      const top = document.createElement("div");
      top.className = "preset-card-top";
      const titleEl = document.createElement("b");
      titleEl.textContent = p.nome || p.id;
      top.appendChild(titleEl);

      const btnPreview = document.createElement("button");
      btnPreview.className = "ghost";
      btnPreview.style.cssText = "font-size:11px;padding:4px 9px";
      btnPreview.textContent = "👁️ Ver Prévia";
      btnPreview.title = "Ver exemplo visual de como fica a edição com cores e fontes reais";
      btnPreview.onclick = (ev) => {
        ev.stopPropagation();
        openPadraoPreviewModal(p);
      };
      top.appendChild(btnPreview);
      card.appendChild(top);

      const sub = document.createElement("span");
      const leg = p.padrao?.legenda;
      const pausa = p.padrao?.ritmo?.cortar_pausas_acima_s || 0.45;
      sub.textContent = leg?.ativo === false
        ? `Sem legenda · pausa > ${pausa}s`
        : `${leg?.tamanho_px || 60}px · ${leg?.cor || "#FFFFFF"} · pausa > ${pausa}s`;
      card.appendChild(sub);

      const badge = document.createElement("div");
      badge.className = "preset-badge";
      const nPend = (p.pendencias || []).length + (p.erros || []).length;
      if (nPend > 0) {
        badge.textContent = `⚠ ${nPend} pendência(s)`;
        badge.style.color = "#fbbf24";
        badge.title = [...(p.erros || []), ...(p.pendencias || [])].join("\n");
      } else {
        badge.textContent = "✓ Motor v2 Pronto";
        badge.style.color = "#34d399";
      }
      card.appendChild(badge);

      card.onclick = () => {
        document.querySelectorAll(".preset-card").forEach((c) => c.classList.remove("active"));
        card.classList.add("active");
        activeClientId = p.id;
        localStorage.setItem("mg_active_padrao", p.id);
        const badgeEl = $("activePresetBadge");
        if (badgeEl) badgeEl.textContent = `Ativo: ${p.nome}`;
        if ($("optLayout") && p.layout_padrao) $("optLayout").value = p.layout_padrao;
        if ($("focus") && p.foco_ia) $("focus").value = p.foco_ia;
      };

      bar.appendChild(card);
    });

    const initial = list[0];
    if (initial) {
      const targetCard = bar.querySelector(`.preset-card[data-preset="${initial.id}"]`);
      if (targetCard) targetCard.click();
    }
  } catch (e) {
    const bar = $("presetsBar");
    if (bar) bar.textContent = "Motor local offline ou sem token (" + e.message + ")";
  }
}

$("importClientBtn").onclick = async () => {
  const nome = $("clientNameInput").value.trim();
  if (!nome) return alert("Digite o nome do padrão/cliente.");
  const st = $("clientImportStatus");
  const btn = $("importClientBtn");
  btn.disabled = true;
  st.textContent = "Preparando arquivos...";
  try {
    let pdfBase64 = "";
    const file = $("clientPdfInput").files?.[0];
    if (file) {
      pdfBase64 = await new Promise((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(String(fr.result || "").replace(/^data:[^;]+;base64,/, ""));
        fr.onerror = rej;
        fr.readAsDataURL(file);
      });
    }
    const observacoes = $("clientNotesInput").value.trim();
    const { jobId, error } = await api("/api/padroes/importar", { nome, pdfBase64: pdfBase64 || null, observacoes });
    if (!jobId) throw new Error(error || "Falha ao iniciar importação");
    const job = await poll(jobId, (j) => { st.textContent = `${j.pct}% · ${j.statusText}`; });
    if (job.result?.usage) renderUsage(job.result.usage);
    await loadClients();
    st.textContent = job.statusText;
    await loadClients();
    const savedId = job.result?.client?.id;
    if (savedId) {
      document.querySelector(`.preset-card[data-client-id="${savedId}"]`)?.click();
    }
  } catch (e) {
    st.textContent = "❌ " + e.message;
  } finally {
    btn.disabled = false;
  }
};
bindPresetButtons();

// ---------- Etapa 1: Prévia INSTANTÂNEA e CRUA (sem baixar, sem processar) ----------
function previewClip(c, node) {
  const prev = node.querySelector(".preview");
  const prevCap = node.querySelector(".preview-caption");
  const txt = node.querySelector(".ptext");
  const prog = node.querySelector(".progress");

  const isVert = $("optFormat").value === "vertical";
  prev.innerHTML = "";
  prev.classList.toggle("vertical-sim", isVert);

  const video = document.createElement("video");
  video.src = `${ENGINE}/api/ai/stream?url=${encodeURIComponent(current.url)}#t=${Math.floor(c.start)},${Math.ceil(c.end)}`;
  video.controls = true;
  video.autoplay = true;
  video.playsInline = true;
  video.ontimeupdate = () => {
    if (video.currentTime >= c.end) {
      video.pause();
    }
  };
  prev.appendChild(video);

  const badge = document.createElement("span");
  badge.className = "preview-badge";
  badge.textContent = "Prévia crua (áudio original)";
  prev.appendChild(badge);

  prevCap.textContent = "Prévia crua instantânea (sem baixar/editar). Gostou? Clique em ✨ Confirmar e Editar (MP4).";
  prevCap.classList.remove("hidden");
  prog.classList.add("hidden");
  txt.textContent = "";
}

// ---------- Etapa 2: Confirmar e Editar ----------
async function renderClip(c, node, output) {
  const prog = node.querySelector(".progress");
  const fill = node.querySelector(".fill"), txt = node.querySelector(".ptext");
  const btns = node.querySelectorAll(".actions button");
  btns.forEach((b) => (b.disabled = true));
  prog.classList.remove("hidden");
  const style = $("optStyle").value;
  try {
    const { jobId, error } = await api("/api/ai/render", {
      url: current.url,
      start: c.start, end: c.end,
      title: c.title,
      filename: `${String(c.score).padStart(2, "0")}_${c.title}`,
      hook: $("optHook").checked ? (c.hook || c.title) : "",
      captions: style !== "none",
      style,
      format: $("optFormat").value,
      layout: $("optLayout").value,
      trimSilences: $("optTrimSilences").checked,
      centerPerson: $("optCenterPerson").checked,
      allowSplit: true,
      dynamic: $("optDynamic").checked,
      clientId: activeClientId || "editor_pro",
      padraoId: activeClientId || "editor_pro",
      bgMusic: $("optMusic") ? $("optMusic").value : "auto",
      musicMood: c.musicMood || "calm",
      output
    });
    if (!jobId) throw new Error(error || "Falha ao iniciar");
    const job = await poll(jobId, (j) => {
      fill.style.width = j.pct + "%";
      txt.textContent = j.statusText;
      updateStageLoader(prog, "render", j.pct, j.statusText);
    });
    updateStageLoader(prog, "render", 100, job.statusText || "Concluído!");
    txt.textContent = "";
    const resBox = document.createElement("div");
    const borderCol = job.needsReview ? "#f59e0b" : "var(--ok)";
    resBox.style.cssText = `margin-top:8px;padding:8px 12px;background:#0d1322;border:1px solid ${borderCol};border-radius:8px;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap`;
    const labelSpan = document.createElement("span");
    labelSpan.style.cssText = `font-size:12px;color:${borderCol}`;
    labelSpan.textContent = (job.needsReview ? "⚠ Precisa revisão · Salvo em: " : "✓ Conferido · Salvo em: ") + (job.outputPath || "");
    if (job.needsReview && Array.isArray(job.reviewReasons) && job.reviewReasons.length) {
      labelSpan.title = job.reviewReasons.join("\n");
    }
    const actDiv = document.createElement("div");
    actDiv.style.cssText = "display:flex;gap:6px";
    const btnOpen = document.createElement("button");
    btnOpen.className = "ghost act-open-file";
    btnOpen.style.cssText = "padding:4px 8px;font-size:11px";
    btnOpen.textContent = "📁 Abrir no Explorer";
    btnOpen.onclick = () => api("/api/open-folder", { filePath: job.outputPath });
    const btnCopy = document.createElement("button");
    btnCopy.className = "ghost act-copy-path";
    btnCopy.style.cssText = "padding:4px 8px;font-size:11px";
    btnCopy.textContent = "📋 Copiar Caminho";
    btnCopy.onclick = (e) => {
      navigator.clipboard.writeText(job.outputPath);
      e.target.textContent = "✓ Copiado!";
      setTimeout(() => { e.target.textContent = "📋 Copiar Caminho"; }, 2000);
    };
    actDiv.appendChild(btnOpen);
    actDiv.appendChild(btnCopy);
    resBox.appendChild(labelSpan);
    resBox.appendChild(actDiv);
    txt.appendChild(resBox);
    addHistory({ title: c.title, score: c.score, path: job.outputPath, output, at: Date.now() });
  } catch (e) {
    txt.textContent = "❌ " + e.message;
  } finally {
    btns.forEach((b) => (b.disabled = false));
  }
}

$("renderTopBtn").onclick = async () => {
  if (!current) return;
  for (const c of current.clips.slice(0, 3)) await renderClip(c, c._node, "mp4");
};

// ---------- histórico ----------
function addHistory(item) {
  const h = JSON.parse(localStorage.getItem("aiHistory") || "[]");
  h.unshift(item);
  localStorage.setItem("aiHistory", JSON.stringify(h.slice(0, 50)));
  renderHistory();
}
function renderHistory() {
  const h = JSON.parse(localStorage.getItem("aiHistory") || "[]");
  const el = $("history");
  if (!h.length) return;
  el.innerHTML = "";
  h.forEach((it) => {
    const row = document.createElement("div");
    row.className = "h";
    const left = document.createElement("span");
    left.textContent = `[${it.score}] ${it.title} · ${it.output.toUpperCase()} · ${new Date(it.at).toLocaleString("pt-BR")}`;
    const right = document.createElement("div");
    right.style.display = "flex";
    right.style.gap = "8px";
    
    const a = document.createElement("button");
    a.className = "ghost";
    a.style.padding = "3px 8px";
    a.style.fontSize = "11px";
    a.textContent = "📁 Abrir";
    a.onclick = () => api("/api/open-folder", { filePath: it.path });

    const c = document.createElement("button");
    c.className = "ghost";
    c.style.padding = "3px 8px";
    c.style.fontSize = "11px";
    c.textContent = "📋 Caminho";
    c.onclick = (e) => {
      navigator.clipboard.writeText(it.path);
      e.target.textContent = "✓ Copiado!";
      setTimeout(() => { e.target.textContent = "📋 Caminho"; }, 1500);
    };

    right.append(a, c);
    row.append(left, right);
    el.appendChild(row);
  });
}

// ---------- init ----------
const qsUrl = new URLSearchParams(location.search).get("url");
if (qsUrl) $("urlInput").value = qsUrl;
renderHistory();
checkEngine();

loadClients();
