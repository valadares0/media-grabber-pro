#!/usr/bin/env node
// Mede um vídeo de referência APROVADO e devolve números prontos para o padrão.
//   node medir_referencia.js <video.mp4> [--fonte assets/Montserrat-VF.ttf] [--caixa alta|baixa] [--saida medidas.json]
//
// Use ANTES de pedir ao Gemini para montar o padrão: o Gemini descreve o estilo,
// mas posição e tamanho vêm DAQUI (medido > descrito). O importador grava a
// origem de cada número em "proveniencia".
"use strict";
const fs = require("fs");
const path = require("path");
const { medirLegendaVideo, detectarCortes, detectarLogo, quadroRGB, corDestaque, duracao } = require("../lib/medir");
const { lerFonte, emPorAlturaMaiuscula } = require("../lib/fontes");

const arg = (n, d = null) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const video = process.argv[2];
if (!video || video.startsWith("--")) {
  console.log("uso: node medir_referencia.js <video> [--fonte x.ttf] [--caixa alta|baixa] [--saida medidas.json]");
  process.exit(1);
}
const caixa = arg("--caixa", "alta");
const fonte = arg("--fonte") ? lerFonte(arg("--fonte")) : null;

console.error("medindo legenda...");
const leg = medirLegendaVideo(video);
let tamanho = null;
if (leg.altura_linha_px) {
  // caixa alta: a altura da linha ≈ altura da maiúscula (acento pode somar uns px; a mediana filtra)
  // caixa baixa: linha inclui ascendentes/descendentes ≈ 0,95 em (aproximação)
  tamanho = caixa === "alta" ? Math.round(emPorAlturaMaiuscula(fonte, leg.altura_linha_px)) : Math.round(leg.altura_linha_px / 0.95);
}
console.error("procurando cor de destaque...");
let destaque = null;
if (leg.centro_y) {
  const dur = duracao(video);
  for (const t of [0.25, 0.4, 0.55, 0.7, 0.85].map((p) => p * dur)) {
    const buf = quadroRGB(video, t);
    const c = corDestaque(buf, 1080, 1920, [60, Math.max(0, leg.centro_y - 260), 1020, Math.min(1920, leg.centro_y + 260)]);
    if (c && (!destaque || c.pixels > destaque.pixels)) destaque = { ...c, t: +t.toFixed(2) };
  }
}
console.error("detectando cortes e logo...");
const cortes = detectarCortes(video);
const dur = duracao(video);
const intervalos = cortes.map((c, i) => c - (i ? cortes[i - 1] : 0));
const logo = detectarLogo(video);

const sugestao = {
  "legenda.centro_y": leg.centro_y,
  "legenda.tamanho_px": tamanho,
  "legenda.largura_max_px": leg.largura_max_px ? Math.min(1000, Math.round(leg.largura_max_px / 10) * 10) : null,
  "legenda.max_linhas": leg.linhas_por_bloco,
  "logo.centro_y": logo ? logo.centro_y : null,
  "logo.largura_px": logo ? logo.largura_px : null,
  "destaques[0].cor": destaque ? destaque.hex : null,
  "ritmo.corte_medio_s": intervalos.length ? +(intervalos.reduce((a, b) => a + b, 0) / intervalos.length).toFixed(2) : null
};
const out = {
  video: path.resolve(video),
  duracao_s: +dur.toFixed(2),
  legenda: leg,
  tamanho_estimado: { px_em: tamanho, base: caixa === "alta" ? `altura da maiúscula ${leg.altura_linha_px}px / capHeight ${fonte ? fonte.capHeightRazao.toFixed(3) : "0.70 (sem fonte)"}` : "altura da linha / 0,95" },
  destaque,
  logo,
  cortes: { quantidade: cortes.length, tempos: cortes.map((c) => +c.toFixed(2)) },
  sugestao_para_padrao: sugestao,
  confianca: "Medidas em 1080x1920. Confira com cartela_teste.js lado a lado com um quadro da referência antes de salvar."
};
const saida = arg("--saida");
if (saida) fs.writeFileSync(saida, JSON.stringify(out, null, 2));
console.log(JSON.stringify(saida ? { sugestao_para_padrao: sugestao, logo, destaque, salvo_em: saida } : out, null, 2));
