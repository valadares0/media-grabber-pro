#!/usr/bin/env node
// =========================================================================
// cartela_teste.js — PROVA VISUAL de um padrão antes de editar qualquer vídeo.
// Desenha legenda (frase com muitos acentos), destaque, título, logo e o 1º
// elemento da biblioteca sobre um quadro da referência, e põe LADO A LADO com
// o quadro original da referência, com linhas-guia no y do padrão.
//
//   node cartela_teste.js <padrao.json> [--ref video.mp4@3.2 | --ref quadro.png] [--saida cartela.png]
//
// É isto que o usuário aprova depois de importar um PDF/referência. Se a
// legenda da direita não cai em cima da da esquerda, o padrão está errado.
// =========================================================================
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { carregarPadrao, asset } = require("../lib/padrao");
const { gerarAss, carregarFontes } = require("../lib/legenda_ass");
const { montarComando } = require("../lib/composicao");

const arg = (n, d = null) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const padArq = process.argv[2];
if (!padArq || padArq.startsWith("--")) {
  console.log("uso: node cartela_teste.js <padrao.json> [--ref video.mp4@3.2 | --ref quadro.png] [--saida cartela.png]");
  process.exit(1);
}
const { padrao, erros, avisos } = carregarPadrao(padArq);
if (erros.length) { console.error("padrão com erro:\n - " + erros.join("\n - ")); process.exit(1); }
const W = padrao.canvas.w, H = padrao.canvas.h;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cartela_"));
const saida = path.resolve(arg("--saida", "cartela_teste.png"));
const run = (args, cwd) => { const r = spawnSync("ffmpeg", ["-v", "error", "-y", ...args], { cwd, encoding: "utf8", windowsHide: true }); if (r.status) throw new Error(r.stderr); };

// 1) quadro de fundo: da referência (vídeo@tempo ou imagem) ou um degradê neutro
let refPng = null;
const ref = arg("--ref");
if (ref) {
  const [arq, t] = ref.includes("@") ? [ref.slice(0, ref.lastIndexOf("@")), ref.slice(ref.lastIndexOf("@") + 1)] : [ref, null];
  refPng = path.join(tmp, "ref.png");
  run([...(t ? ["-ss", t] : []), "-i", path.resolve(arq), "-frames:v", "1", "-vf", `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2`, refPng]);
}
const base = path.join(tmp, "base.mp4");
if (refPng) run(["-loop", "1", "-t", "3", "-i", refPng, "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-shortest", "-vf", `fps=${padrao.canvas.fps},format=yuv420p`, "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac", base]);
else run(["-f", "lavfi", "-i", `gradients=s=${W}x${H}:c0=0x3A4A3A:c1=0x1C2420:d=3:r=${padrao.canvas.fps}`, "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-shortest", "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac", base]);

// 2) fala sintética com acentos (o erro mais comum é acento virar quadrado), num bloco só
const dest = (padrao.destaques || [])[0];
const comLinha = dest && dest.posicao === "linha_abaixo_da_legenda";
const max = padrao.legenda.palavras_por_bloco.max;
const frase = ["AÇÃO", "NO", "SERTÃO", "É", "MÁXIMA"].slice(0, Math.max(1, max)).concat(comLinha ? ["até", "2030"] : []);
const palavras = frase.map((w, i) => ({ t: 0.1 + i * 0.08, e: 0.1 + i * 0.08 + 0.07, w }));
const r = gerarAss({
  padrao, palavras, duracao: 3, cortes: [],
  destaques: comLinha ? [{ id: dest.id, texto: "até 2030" }] : [],
  titulos: padrao.titulo_gancho.ativo ? [{ texto: "TÍTULO DO GANCHO", linha2: padrao.titulo_gancho.linha2 ? "destaque" : null, t0: 0, t1: 3 }] : []
});
// legenda fica na tela até o fim da cartela
fs.writeFileSync(path.join(tmp, "legenda.ass"), r.ass.replace(/Dialogue: (\d+),([^,]+),([^,]+),/g, (m, l, a) => `Dialogue: ${l},${a},0:00:03.00,`), "utf8");
fs.mkdirSync(path.join(tmp, "fontes"));
for (const f of r.fontes) fs.copyFileSync(f, path.join(tmp, "fontes", path.basename(f)));

// 3) composição: logo + 1º elemento + legenda (sem fechamento/música)
const el = (padrao.elementos.biblioteca || []).find((e) => fs.existsSync(asset(padrao, e.arquivo)) && !e.esconde_legenda);
const cmd = montarComando({
  padrao: { ...padrao, logo: { ...padrao.logo, ativo: padrao.logo.ativo && fs.existsSync(asset(padrao, padrao.logo.arquivo || "")) } },
  fala: base, duracao: 3, ass: "legenda.ass", fontsDir: "fontes",
  elementos: el ? [{ arquivo: asset(padrao, el.arquivo), t0: 0, t1: 3, largura_px: el.largura_px, centro_x: el.centro_x, centro_y: el.centro_y, entrada: { tipo: "corte_seco" } }] : [],
  saida: path.join(tmp, "cartela.mp4"), semFechamento: true, semMusica: true
});
run(cmd.args.slice(1), tmp);

// 4) quadro final + guias + lado a lado com a referência
const guias = [
  `drawbox=x=0:y=${padrao.legenda.centro_y - 1}:w=iw:h=2:color=red@0.7:t=fill`,
  padrao.logo.ativo && padrao.logo.centro_y && !padrao.logo.tela_cheia ? `drawbox=x=0:y=${padrao.logo.centro_y - 1}:w=iw:h=2:color=cyan@0.7:t=fill` : null,
  padrao.titulo_gancho.ativo ? `drawbox=x=0:y=${padrao.titulo_gancho.centro_y - 1}:w=iw:h=2:color=yellow@0.7:t=fill` : null,
  ...(padrao.zonas_proibidas || []).map((z) => `drawbox=x=${z.x0}:y=${z.y0}:w=${z.x1 - z.x0}:h=${z.y1 - z.y0}:color=red@0.8:t=3`)
].filter(Boolean).join(",");
const quadro = path.join(tmp, "quadro.png");
run(["-ss", "2.0", "-i", path.join(tmp, "cartela.mp4"), "-frames:v", "1", "-vf", guias, quadro]);
if (refPng) {
  run(["-i", refPng, "-i", quadro, "-filter_complex", `[0:v]${guias}[a];[a][1:v]hstack=inputs=2,scale=1080:-2`, "-frames:v", "1", saida]);
} else {
  run(["-i", quadro, "-vf", "scale=540:-2", "-frames:v", "1", saida]);
}
console.log(`cartela: ${saida}`);
console.log(refPng
  ? "esquerda = referência, direita = padrão aplicado POR CIMA do mesmo quadro (se a referência já tem legenda, as duas devem cair uma sobre a outra). Linha vermelha = legenda.centro_y, ciano = logo, amarela = título, caixas vermelhas = zonas proibidas."
  : "linha vermelha = legenda.centro_y; caixas vermelhas = zonas proibidas (UI do Instagram).");
[...avisos, ...r.avisos].forEach((a) => console.log(`  aviso  ${a}`));
