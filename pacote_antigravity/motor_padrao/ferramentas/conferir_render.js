#!/usr/bin/env node
// =========================================================================
// conferir_render.js — TRAVA DE ENTREGA. Lê o MP4 final + plano_final.json e
// MEDE no quadro renderizado se a legenda está onde o padrão manda, do tamanho
// que o padrão manda e sem passar da largura; mede o loudness; gera a folha de
// contato. Sai com código 1 se reprovar.
//   node conferir_render.js final.mp4 work/plano_final.json [--tol-y 14] [--tol-tam 0.12]
// =========================================================================
"use strict";
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { carregarPadrao } = require("../lib/padrao");
const { carregarFontes } = require("../lib/legenda_ass");
const { quadroRGB, mascara, medirMascara, mediana } = require("../lib/medir");

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? Number(process.argv[i + 1]) : d; };
const [video, planoArq] = process.argv.slice(2);
if (!video || !planoArq) { console.log("uso: node conferir_render.js final.mp4 plano_final.json"); process.exit(2); }

const plano = JSON.parse(fs.readFileSync(planoArq, "utf8"));
const { padrao } = carregarPadrao(plano.padrao, { conferirArquivos: false });
const L = padrao.legenda;
const W = padrao.canvas.w, H = padrao.canvas.h;
const tolY = arg("--tol-y", 14), tolTam = arg("--tol-tam", 0.12);
const falhas = [], ok = [], avisos = [];

// ---------- legenda ----------
if (L.ativa && plano.blocos && plano.blocos.length) {
  const fontes = carregarFontes(padrao);
  const fi = fontes[L.fonte].info;
  const capEsperada = L.tamanho_px * fi.capHeightRazao;
  // blocos sem destaque, sem broll/elemento por cima, espalhados no vídeo
  const ocupados = [...(plano.plano.broll || []).filter((b) => b.modo === "tela_cheia"), ...(plano.plano.elementos || [])].map((x) => [x.t0, x.t1]);
  const livres = plano.blocos.filter((b) => !b.destaque && b.t1 - b.t0 > 0.25 && !ocupados.some(([a, z]) => b.t0 < z && b.t1 > a));
  const amostra = livres.filter((_, i) => i % Math.max(1, Math.floor(livres.length / 8)) === 0).slice(0, 8);
  const meia = L.tamanho_px * L.max_linhas * L.entrelinha;
  const regiao = [40, Math.max(0, Math.round(L.centro_y - meia - 40)), W - 40, Math.min(H, Math.round(L.centro_y + meia + 40))];
  const medidas = [];
  for (const b of amostra) {
    const t = b.t0 + Math.min(0.5, (b.t1 - b.t0) / 2) + 0.05; // depois da animação de entrada
    const m = medirMascara(mascara(quadroRGB(video, t, W, H), W, H, { regiao }), W, H, regiao);
    if (!m) { avisos.push(`sem texto medido em ${t.toFixed(2)}s ("${b.linhas.join(" / ")}")`); continue; }
    const ult = m.linhas[m.linhas.length - 1];
    const cyRef = L.ancora === "centro_primeira_linha" ? m.linhas[0].cy : Math.round((m.linhas[0].cy + ult.cy) / 2);
    const alturas = m.linhas.map((l) => l.nucleo);
    medidas.push({ t: +t.toFixed(2), texto: b.linhas.join(" / "), cy: cyRef, linhas: m.linhas.length, altura: mediana(alturas), largura: m.largura });
  }
  if (!medidas.length) falhas.push("nenhum quadro com legenda medido.");
  for (const m of medidas) {
    if (Math.abs(m.cy - L.centro_y) > tolY) falhas.push(`legenda em ${m.t}s: centro y ${m.cy} (padrão ${L.centro_y} ±${tolY}) — "${m.texto}"`);
    if (m.largura > L.largura_max_px + 12) falhas.push(`legenda em ${m.t}s: largura ${m.largura}px > ${L.largura_max_px}px — "${m.texto}"`);
    if (m.linhas > L.max_linhas) falhas.push(`legenda em ${m.t}s: ${m.linhas} linhas (máx. ${L.max_linhas})`);
  }
  if (L.caixa === "alta" && medidas.length) {
    const alt = mediana(medidas.map((m) => m.altura));
    const desvio = (alt - capEsperada) / capEsperada;
    // altura do NÚCLEO da letra (sem til/acento/cedilha) comparada com capHeight da fonte
    if (Math.abs(desvio) > tolTam) falhas.push(`tamanho da legenda: maiúscula ${alt}px, esperado ≈ ${capEsperada.toFixed(0)}px (${L.tamanho_px}px no padrão) — ${(desvio * 100).toFixed(0)}%`);
    else ok.push(`tamanho da legenda: maiúscula ${alt}px ≈ esperado ${capEsperada.toFixed(0)}px`);
  }
  if (medidas.length && !falhas.some((f) => f.includes("centro y"))) ok.push(`posição da legenda: ${medidas.length} blocos com centro em y ${L.centro_y} ±${tolY}`);
  fs.writeFileSync(path.join(path.dirname(planoArq), "conferencia_legenda.json"), JSON.stringify(medidas, null, 2));
}

// ---------- loudness ----------
const lr = spawnSync("ffmpeg", ["-hide_banner", "-i", video, "-af", "ebur128", "-f", "null", "-"], { encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
const mI = String(lr.stderr).match(/Integrated loudness:\s*\n\s*I:\s*(-?[\d.]+) LUFS/);
if (mI) {
  const I = Number(mI[1]), alvo = padrao.audio.lufs || -14;
  if (Math.abs(I - alvo) > 1.5) falhas.push(`loudness ${I} LUFS (alvo ${alvo} ±1,5)`);
  else ok.push(`loudness ${I} LUFS (alvo ${alvo})`);
} else avisos.push("não consegui medir o loudness.");

// ---------- duração ----------
const dr = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", video], { encoding: "utf8" });
const dur = Number(String(dr.stdout).trim());
if (plano.duracao_total && Math.abs(dur - plano.duracao_total) > 0.2) falhas.push(`duração ${dur.toFixed(2)}s, esperado ${plano.duracao_total.toFixed(2)}s`);

// ---------- folha de contato ----------
const folha = path.join(path.dirname(planoArq), "folha_contato.jpg");
spawnSync("ffmpeg", ["-v", "error", "-y", "-i", video, "-vf", `fps=1/1.5,scale=216:-2,tile=6x4:padding=4`, "-frames:v", "1", folha], { windowsHide: true });

console.log("\n== Conferência automática ==");
ok.forEach((x) => console.log(`  ok     ${x}`));
avisos.forEach((x) => console.log(`  aviso  ${x}`));
falhas.forEach((x) => console.log(`  FALHA  ${x}`));
if (fs.existsSync(folha)) console.log(`  folha de contato: ${folha}`);
console.log("  NÃO conferido aqui: áudio ouvido (a IA não ouve), acento visto por humano, escolha das cenas de B-roll.");
process.exit(falhas.length ? 1 : 0);
