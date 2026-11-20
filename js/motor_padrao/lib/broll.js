// =========================================================================
// broll.js — catálogo de B-roll do cliente + transformar SUGESTÕES da IA em
// entradas do plano. A IA nunca escolhe "arquivo qualquer": ela escolhe um ID
// do catálogo (responseSchema com enum de IDs) e a palavra onde entra.
//
//   node broll.js catalogar <pasta> [saida.json] [--miniaturas pasta]
// =========================================================================
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { localizarFrase } = require("./legenda_ass");

const EXT_VIDEO = /\.(mp4|mov|m4v|mkv|webm)$/i;

function listar(pasta) {
  const out = [];
  for (const nome of fs.readdirSync(pasta)) {
    const p = path.join(pasta, nome);
    const st = fs.statSync(p);
    if (st.isDirectory()) out.push(...listar(p));
    else if (EXT_VIDEO.test(nome)) out.push(p);
  }
  return out;
}

function ffprobe(arquivo, ffprobeBin = "ffprobe") {
  const r = spawnSync(ffprobeBin, ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", arquivo], { encoding: "utf8", windowsHide: true });
  if (r.status !== 0) return null;
  const j = JSON.parse(r.stdout || "{}");
  const v = (j.streams || []).find((s) => s.codec_type === "video");
  if (!v) return null;
  let rot = 0;
  if (v.tags && v.tags.rotate) rot = Number(v.tags.rotate);
  for (const sd of v.side_data_list || []) if (sd.rotation != null) rot = Number(sd.rotation);
  const giro = Math.abs(rot) % 180 === 90;
  const w = giro ? v.height : v.width, h = giro ? v.width : v.height;
  return {
    dur: Number((j.format && j.format.duration) || v.duration || 0),
    w, h, rotacao: rot,
    vertical: h > w,
    hdr: ["arib-std-b67", "smpte2084"].includes(v.color_transfer),
    fps: (() => { const [a, b] = String(v.r_frame_rate || "30/1").split("/").map(Number); return b ? a / b : a; })(),
    audio: (j.streams || []).some((s) => s.codec_type === "audio")
  };
}

/**
 * Cataloga a pasta de B-roll do cliente. Guarde o resultado em catalogo.json
 * e peça à IA para ETIQUETAR cada item (tags: "drone", "nelore", "curral"...)
 * olhando as miniaturas. Etiquetas ficam no próprio catálogo (campo tags).
 */
function catalogar(pasta, { ffprobeBin, miniaturas, ffmpegBin = "ffmpeg" } = {}) {
  const itens = [];
  for (const arq of listar(pasta)) {
    const info = ffprobe(arq, ffprobeBin);
    if (!info || info.dur < 1) continue;
    const id = path.relative(pasta, arq).replace(/\\/g, "/");
    const item = { id, arquivo: arq, ...info, tags: [], problemas: [] };
    if (miniaturas) {
      fs.mkdirSync(miniaturas, { recursive: true });
      const mini = path.join(miniaturas, id.replace(/[\\/:*?"<>|]+/g, "_") + ".jpg");
      // 3 quadros (20%, 50%, 80%) lado a lado: é o que a IA olha para etiquetar e achar texto queimado
      const ts = [0.2, 0.5, 0.8].map((p) => (info.dur * p).toFixed(2));
      const sel = ts.map((t) => `eq(n\\,${Math.round(t * (info.fps || 30))})`).join("+");
      spawnSync(ffmpegBin, ["-v", "error", "-y", "-i", arq, "-vf", `select='${sel}',scale=-2:240,tile=3x1`, "-frames:v", "1", mini], { windowsHide: true });
      if (fs.existsSync(mini)) item.miniatura = mini;
    }
    itens.push(item);
  }
  return { pasta: path.resolve(pasta), criado: new Date().toISOString(), itens };
}

/**
 * Sugestões da IA -> entradas do plano.
 * sugestoes: [{ clipe: "<id do catálogo>", palavra: "boiada", perto?: 12.3, in?: 2.0, modo?: "tela_cheia" }]
 * Devolve { broll: [...], avisos: [...] } (as REGRAS de duração/posição vêm depois, em regras.js).
 */
function sugestoesParaPlano({ sugestoes, catalogo, palavras, padrao }) {
  const avisos = [];
  const porId = new Map((catalogo.itens || []).map((i) => [i.id, i]));
  const broll = [];
  for (const s of sugestoes || []) {
    const item = porId.get(s.clipe);
    if (!item) { avisos.push(`B-roll "${s.clipe}" não existe no catálogo: ignorado (a IA não pode inventar arquivo).`); continue; }
    if ((item.problemas || []).length) avisos.push(`B-roll ${item.id}: ${item.problemas.join(", ")}.`);
    const loc = s.palavra ? localizarFrase(palavras, s.palavra, s.perto) : null;
    const t0 = loc ? palavras[loc.i0].t : s.perto;
    if (t0 == null) { avisos.push(`B-roll ${item.id}: palavra "${s.palavra}" não achada na fala.`); continue; }
    const dMin = padrao.broll.duracao_s.min;
    const inicio = s.in != null ? s.in : Math.max(0, Math.min(item.dur - dMin, item.dur * 0.3));
    broll.push({ id: item.id, arquivo: item.arquivo, t0, t1: t0 + dMin, in: inicio, modo: s.modo, vertical: item.vertical, hdr: item.hdr, durClipe: item.dur });
    if (item.hdr) avisos.push(`B-roll ${item.id} é HDR (iPhone): converter para SDR antes (libplacebo/zscale), senão a cor sai errada.`);
  }
  return { broll, avisos };
}

function lerUsados(arquivo) {
  try { return new Set(JSON.parse(fs.readFileSync(arquivo, "utf8"))); } catch (_) { return new Set(); }
}
function gravarUsados(arquivo, set, novos) {
  const s = new Set([...set, ...novos]);
  fs.writeFileSync(arquivo, JSON.stringify([...s], null, 2));
}

module.exports = { catalogar, ffprobe, sugestoesParaPlano, lerUsados, gravarUsados };

if (require.main === module) {
  const [cmd, pasta, saida] = process.argv.slice(2);
  if (cmd !== "catalogar" || !pasta) {
    console.log("uso: node broll.js catalogar <pasta> [saida.json] [--miniaturas <pasta>]");
    process.exit(1);
  }
  const iM = process.argv.indexOf("--miniaturas");
  const cat = catalogar(pasta, { miniaturas: iM > 0 ? process.argv[iM + 1] : null });
  const out = saida && !saida.startsWith("--") ? saida : "catalogo.json";
  fs.writeFileSync(out, JSON.stringify(cat, null, 2));
  console.log(`${cat.itens.length} clipes catalogados em ${out} (${cat.itens.filter((i) => i.vertical).length} verticais, ${cat.itens.filter((i) => i.hdr).length} HDR).`);
}
