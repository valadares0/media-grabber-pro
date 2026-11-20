// =========================================================================
// medir.js — transforma "a legenda fica embaixo" em "centro y = 1497, letra
// maiúscula com 42 px". Lê quadros com ffmpeg (sem dependências) e mede pixels.
// Base de: medir_referencia.js (aprender cliente) e conferir_render.js (QA).
// =========================================================================
"use strict";

const { spawnSync } = require("child_process");

const EH_IMAGEM = /\.(png|jpe?g|webp|bmp)$/i;

/** Um quadro como RGB cru (W x H), com a imagem encaixada sem distorcer. */
function quadroRGB(arquivo, t, W = 1080, H = 1920, ffmpegBin = "ffmpeg") {
  const args = ["-v", "error"];
  if (t != null && !EH_IMAGEM.test(arquivo)) args.push("-ss", String(t));
  args.push("-i", arquivo, "-frames:v", "1",
    "-vf", `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2`,
    "-f", "rawvideo", "-pix_fmt", "rgb24", "-");
  const r = spawnSync(ffmpegBin, args, { maxBuffer: W * H * 3 + 1024, windowsHide: true });
  if (r.status !== 0 || !r.stdout || r.stdout.length < W * H * 3) {
    throw new Error(`não consegui ler o quadro ${t}s de ${arquivo}: ${String(r.stderr || "").slice(0, 300)}`);
  }
  return r.stdout;
}

function duracao(arquivo, ffprobeBin = "ffprobe") {
  const r = spawnSync(ffprobeBin, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", arquivo], { encoding: "utf8", windowsHide: true });
  return Number(String(r.stdout).trim()) || 0;
}

/** Máscara de pixels de uma cor ("branco" = claro e sem saturação; ou "#RRGGBB" com tolerância). */
function mascara(buf, W, H, { cor = "branco", tol = 40, regiao = null } = {}) {
  const [x0, y0, x1, y1] = regiao || [0, 0, W, H];
  const m = new Uint8Array(W * H);
  let alvo = null;
  if (cor !== "branco") {
    const h = cor.replace("#", "");
    alvo = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  }
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * W + x) * 3;
      const r = buf[i], g = buf[i + 1], b = buf[i + 2];
      let ok;
      if (!alvo) ok = Math.min(r, g, b) > 205 && Math.max(r, g, b) - Math.min(r, g, b) < 40;
      else ok = Math.abs(r - alvo[0]) <= tol && Math.abs(g - alvo[1]) <= tol && Math.abs(b - alvo[2]) <= tol;
      if (ok) m[y * W + x] = 1;
    }
  }
  return m;
}

/** Caixa e linhas de texto de uma máscara (linhas separadas por >= 6 px vazios). */
function medirMascara(m, W, H, regiao = null) {
  const [x0, y0, x1, y1] = regiao || [0, 0, W, H];
  const linhasPx = [];
  let total = 0;
  for (let y = y0; y < y1; y++) {
    let c = 0, mnx = Infinity, mxx = -1;
    for (let x = x0; x < x1; x++) if (m[y * W + x]) { c++; if (x < mnx) mnx = x; if (x > mxx) mxx = x; }
    linhasPx.push({ y, c, mnx, mxx });
    total += c;
  }
  const minC = Math.max(2, Math.round(W * 0.002));
  const bandas = [];
  let cur = null, vazio = 0;
  for (const l of linhasPx) {
    if (l.c >= minC) {
      if (!cur) cur = { y0: l.y, y1: l.y, x0: l.mnx, x1: l.mxx, px: 0, rows: [] };
      cur.y1 = l.y; cur.x0 = Math.min(cur.x0, l.mnx); cur.x1 = Math.max(cur.x1, l.mxx); cur.px += l.c;
      cur.rows.push(l);
      vazio = 0;
    } else if (cur) {
      vazio++;
      if (vazio >= 6) { bandas.push(cur); cur = null; vazio = 0; }
    }
  }
  if (cur) bandas.push(cur);
  const boas = bandas.filter((b) => b.y1 - b.y0 >= 8 && b.px > 40);
  if (!boas.length) return null;
  // núcleo da linha: só as linhas de pixel "cheias" (corpo das letras). Til, acento e
  // cedilha são finos e ficam de fora -> altura do núcleo ≈ altura da maiúscula.
  for (const b of boas) {
    const pico = Math.max(...b.rows.map((r) => r.c));
    const cheias = b.rows.filter((r) => r.c >= pico * 0.3);
    b.nucleo0 = cheias.length ? cheias[0].y : b.y0;
    b.nucleo1 = cheias.length ? cheias[cheias.length - 1].y : b.y1;
  }
  const bx0 = Math.min(...boas.map((b) => b.x0)), bx1 = Math.max(...boas.map((b) => b.x1));
  const by0 = Math.min(...boas.map((b) => b.y0)), by1 = Math.max(...boas.map((b) => b.y1));
  return {
    x0: bx0, y0: by0, x1: bx1, y1: by1, largura: bx1 - bx0 + 1, altura: by1 - by0 + 1,
    cx: Math.round((bx0 + bx1) / 2), cy: Math.round((by0 + by1) / 2), pixels: total,
    linhas: boas.map((b) => ({
      y0: b.y0, y1: b.y1, altura: b.y1 - b.y0 + 1, largura: b.x1 - b.x0 + 1,
      nucleo: b.nucleo1 - b.nucleo0 + 1, // ≈ altura da maiúscula, sem acento/cedilha
      cy: Math.round((b.nucleo0 + b.nucleo1) / 2) // centro VISUAL (do corpo da letra)
    }))
  };
}

const mediana = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };

/** Pixels que ficam iguais em quase todos os quadros (logo, marca fixa) — para tirar da medição da legenda. */
function mapaEstatico(quadros, W, H, frac = 0.8) {
  const cont = new Uint16Array(W * H);
  for (const m of quadros) for (let i = 0; i < m.length; i++) if (m[i]) cont[i]++;
  const est = new Uint8Array(W * H);
  const lim = Math.max(2, Math.ceil(quadros.length * frac));
  for (let i = 0; i < cont.length; i++) if (cont[i] >= lim) est[i] = 1;
  return est;
}

/**
 * Mede a legenda de um vídeo de referência.
 * @returns {{centro_y, centro_y_primeira_linha, altura_linha_px, largura_max_px, linhas_por_bloco, amostras, quadrosComTexto}}
 */
function medirLegendaVideo(video, { W = 1080, H = 1920, regiao = [60, 860, 1020, 1760], amostras = 24, inicio = 0.5, ffmpegBin, ffprobeBin } = {}) {
  const dur = duracao(video, ffprobeBin);
  const fim = Math.max(inicio + 1, dur - 0.5);
  const ts = Array.from({ length: amostras }, (_, i) => inicio + ((fim - inicio) * i) / Math.max(1, amostras - 1));
  const masks = ts.map((t) => mascara(quadroRGB(video, t, W, H, ffmpegBin), W, H, { regiao }));
  const est = mapaEstatico(masks, W, H);
  const medidas = [];
  const areaRegiao = (regiao[2] - regiao[0]) * (regiao[3] - regiao[1]);
  masks.forEach((m, k) => {
    for (let i = 0; i < m.length; i++) if (est[i]) m[i] = 0;
    const med = medirMascara(m, W, H, regiao);
    // tela branca (fechamento, flash, papel) não é legenda: texto ocupa pouca área
    if (med && med.pixels > 300 && med.pixels < areaRegiao * 0.2 && med.altura < (regiao[3] - regiao[1]) * 0.6) {
      medidas.push({ t: +ts[k].toFixed(2), ...med });
    }
  });
  if (!medidas.length) return { quadrosComTexto: 0, amostras: ts.length };
  const todasLinhas = medidas.flatMap((m) => m.linhas);
  return {
    quadrosComTexto: medidas.length,
    amostras: ts.length,
    centro_y: mediana(medidas.map((m) => Math.round((m.linhas[0].cy + m.linhas[m.linhas.length - 1].cy) / 2))),
    centro_y_primeira_linha: mediana(medidas.map((m) => m.linhas[0].cy)),
    altura_linha_px: mediana(todasLinhas.map((l) => l.nucleo)),
    altura_com_acentos_px: mediana(todasLinhas.map((l) => l.altura)),
    largura_max_px: Math.max(...medidas.map((m) => m.largura)),
    linhas_por_bloco: mediana(medidas.map((m) => m.linhas.length)),
    espaco_entre_linhas_px: mediana(medidas.filter((m) => m.linhas.length > 1).map((m) => m.linhas[1].cy - m.linhas[0].cy)),
    detalhe: medidas.map((m) => ({ t: m.t, cy: m.cy, linhas: m.linhas.length, nucleo: m.linhas.map((l) => l.nucleo) }))
  };
}

/** Cor saturada dominante perto da legenda (dourado, vermelho...). */
function corDestaque(buf, W, H, regiao) {
  const [x0, y0, x1, y1] = regiao;
  let n = 0, sr = 0, sg = 0, sb = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = (y * W + x) * 3, r = buf[i], g = buf[i + 1], b = buf[i + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx > 140 && mx - mn > 80) { n++; sr += r; sg += g; sb += b; }
  }
  if (n < 150) return null;
  const hex = (v) => Math.round(v / n).toString(16).padStart(2, "0");
  return { hex: `#${hex(sr)}${hex(sg)}${hex(sb)}`.toUpperCase(), pixels: n };
}

/** Tempos de corte (troca de cena) pelo detector do ffmpeg. */
function detectarCortes(video, limiar = 0.3, ffmpegBin = "ffmpeg") {
  const r = spawnSync(ffmpegBin, ["-hide_banner", "-i", video, "-vf", `select='gt(scene,${limiar})',showinfo`, "-an", "-f", "null", "-"], { encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  const ts = [];
  for (const m of String(r.stderr).matchAll(/pts_time:([\d.]+)/g)) ts.push(Number(m[1]));
  return ts;
}

/** Região fixa (logo) num conjunto de quadros: pixels que não mudam e têm borda. Sugestão, não verdade. */
function detectarLogo(video, { W = 1080, H = 1920, amostras = 16, regiao = [0, 0, 1080, 760], ffmpegBin, ffprobeBin } = {}) {
  const dur = duracao(video, ffprobeBin);
  const ts = Array.from({ length: amostras }, (_, i) => 0.3 + ((dur - 0.6) * i) / Math.max(1, amostras - 1));
  const qs = ts.map((t) => quadroRGB(video, t, W, H, ffmpegBin));
  const [x0, y0, x1, y1] = regiao;
  const est = new Uint8Array(W * H);
  let estaticos = 0, area = 0;
  const lum = (q, i) => (q[i] + q[i + 1] + q[i + 2]) / 3;
  const N = qs.length, precisa = Math.ceil(N * 0.75); // tolera flash, fechamento e B-roll em tela cheia
  const vals = new Float64Array(N);
  for (let y = y0 + 1; y < y1 - 1; y++) for (let x = x0 + 1; x < x1 - 1; x++) {
    const i = (y * W + x) * 3;
    for (let k = 0; k < N; k++) vals[k] = lum(qs[k], i);
    const med = [...vals].sort((a, b) => a - b)[N >> 1];
    let iguais = 0, kRef = -1;
    for (let k = 0; k < N; k++) if (Math.abs(vals[k] - med) < 14) { iguais++; if (kRef < 0) kRef = k; }
    area++;
    if (iguais >= precisa) {
      estaticos++;
      // borda em qualquer direção (o pixel de DENTRO do logo é o estático; o de fora muda com o fundo)
      const q = qs[kRef], l = lum(q, i);
      const g = Math.max(Math.abs(l - lum(q, i + 3)), Math.abs(l - lum(q, i - 3)), Math.abs(l - lum(q, i + W * 3)), Math.abs(l - lum(q, i - W * 3)));
      if (g > 30) est[y * W + x] = 1;
    }
  }
  const med = medirMascara(est, W, H, regiao);
  const confianca = estaticos / Math.max(1, area) > 0.6 ? "baixa (câmera parada: fundo também não muda)" : "média";
  return med ? { centro_x: med.cx, centro_y: med.cy, largura_px: med.largura, altura_px: med.altura, confianca } : null;
}

module.exports = { quadroRGB, duracao, mascara, medirMascara, medirLegendaVideo, corDestaque, detectarCortes, detectarLogo, mediana };
