#!/usr/bin/env node
// =========================================================================
// motor.js — edição completa a partir de um projeto.json + padrão v2.
//   node motor.js projeto.json [--sem-conferir]
//
// projeto.json (caminhos relativos ao próprio projeto.json):
// {
//   "padrao": "padroes/daniel_gaia/padrao.json",
//   "bruto": "bruto.mp4",                         vídeo original (ou "fala" já cortada)
//   "segmentos": [{"a": 0.0, "b": 2.4}, ...],     trechos do BRUTO que ficam (sem pausas); opcional
//   "palavras": "palavras.json",                  [{t,e,w}] no tempo do BRUTO (Whisper / legenda YouTube)
//   "plano": {
//     "destaques": [{"id": "dourado", "texto": "até 2030", "perto": 3.1}],
//     "titulos":   [{"texto": "CICLO", "linha2": "pecuário", "t0": 0, "t1": 3}],
//     "numeros":   [{"texto": "2 BEZERROS", "linha2": "por 1 boi gordo", "t0": 20, "t1": 23}],
//     "broll_sugestoes": [{"clipe": "drone/IMG_1569.MOV", "palavra": "boiada"}],
//     "elementos": [], "flashes": [12.1], "zoom": []
//   },
//   "catalogo_broll": "catalogo.json",
//   "usados_broll": "broll_usados.json",
//   "work": "work", "saida": "final.mp4"
// }
// Tempos do plano: na linha do tempo FINAL (depois dos cortes). O motor converte
// as palavras do bruto para a linha final.
// =========================================================================
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { carregarPadrao, asset } = require("./lib/padrao");
const { gerarAss, carregarFontes } = require("./lib/legenda_ass");
const { aplicarRegras, elementosPorGatilho } = require("./lib/regras");
const { sugestoesParaPlano, lerUsados, gravarUsados } = require("./lib/broll");
const { montarComando } = require("./lib/composicao");
const { avisosFonte } = require("./lib/fontes");

function rodar(bin, args, cwd) {
  const r = spawnSync(bin, args, { cwd, encoding: "utf8", windowsHide: true, maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`${bin} falhou:\n${String(r.stderr).split("\n").slice(-12).join("\n")}`);
  return r;
}

/** Corta o bruto nos segmentos (re-encode, corte exato no quadro — NUNCA "-c copy" com -ss). */
function cortarSegmentos(bruto, segmentos, saida, canvas) {
  const parts = segmentos.map((s, i) =>
    `[0:v]trim=start=${s.a.toFixed(3)}:end=${s.b.toFixed(3)},setpts=PTS-STARTPTS[v${i}];` +
    `[0:a]atrim=start=${s.a.toFixed(3)}:end=${s.b.toFixed(3)},asetpts=PTS-STARTPTS[a${i}]`).join(";");
  const ins = segmentos.map((_, i) => `[v${i}][a${i}]`).join("");
  rodar("ffmpeg", ["-y", "-v", "error", "-i", bruto, "-filter_complex",
    `${parts};${ins}concat=n=${segmentos.length}:v=1:a=1[vc][ac];[vc]scale=${canvas.w}:${canvas.h}:force_original_aspect_ratio=increase,crop=${canvas.w}:${canvas.h},fps=${canvas.fps}[vo]`,
    "-map", "[vo]", "-map", "[ac]", "-c:v", "libx264", "-preset", "veryfast", "-crf", "16", "-c:a", "aac", "-b:a", "192k", saida]);
}

/** Palavras do bruto -> linha final (descarta as que caíram em pausa cortada). */
function remapearPalavras(palavras, segmentos) {
  const out = [];
  let acc = 0;
  for (const s of segmentos) {
    for (const w of palavras) {
      if (w.t >= s.a - 0.05 && w.t < s.b) {
        const t = acc + Math.max(0, w.t - s.a);
        const e = acc + Math.min(s.b, w.e || w.t + 0.4) - s.a;
        out.push({ t: +t.toFixed(3), e: +Math.max(t + 0.08, e).toFixed(3), w: w.w });
      }
    }
    acc += s.b - s.a;
  }
  return out.sort((a, b) => a.t - b.t);
}

function main() {
  const projArq = process.argv[2];
  if (!projArq) { console.log("uso: node motor.js projeto.json [--sem-conferir]"); process.exit(1); }
  const base = path.dirname(path.resolve(projArq));
  const R = (p) => (p ? path.resolve(base, p) : null);
  const proj = JSON.parse(fs.readFileSync(projArq, "utf8"));
  const work = R(proj.work || "work");
  fs.mkdirSync(path.join(work, "fontes"), { recursive: true });

  // 1) padrão
  const { padrao, erros, avisos } = carregarPadrao(R(proj.padrao));
  if (erros.length) { console.error("PADRÃO COM ERRO — não renderizo:\n - " + erros.join("\n - ")); process.exit(1); }
  const todosAvisos = [...avisos];

  // 2) fala + palavras na linha final
  let fala, palavras = JSON.parse(fs.readFileSync(R(proj.palavras), "utf8"));
  let cortes = proj.cortes || [];
  if (proj.segmentos && proj.segmentos.length) {
    fala = path.join(work, "fala.mp4");
    console.error(`cortando ${proj.segmentos.length} segmentos...`);
    cortarSegmentos(R(proj.bruto), proj.segmentos, fala, padrao.canvas);
    palavras = remapearPalavras(palavras, proj.segmentos);
    let acc = 0;
    cortes = proj.segmentos.slice(0, -1).map((s) => +(acc += s.b - s.a).toFixed(3));
  } else {
    fala = R(proj.fala || proj.bruto);
  }
  const fimFala = proj.segmentos && proj.segmentos.length
    ? proj.segmentos.reduce((a, s) => a + (s.b - s.a), 0)
    : Number(spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", fala], { encoding: "utf8" }).stdout) || 0;

  // 3) plano: B-roll do catálogo + elementos por gatilho + regras
  const plano = { ...(proj.plano || {}) };
  if (plano.broll_sugestoes && proj.catalogo_broll) {
    const catalogo = JSON.parse(fs.readFileSync(R(proj.catalogo_broll), "utf8"));
    const r = sugestoesParaPlano({ sugestoes: plano.broll_sugestoes, catalogo, palavras, padrao });
    plano.broll = [...(plano.broll || []), ...r.broll];
    todosAvisos.push(...r.avisos);
  }
  if (plano.auto_elementos !== false) {
    const auto = elementosPorGatilho(padrao, palavras, cortes, fimFala);
    const ja = new Set((plano.elementos || []).map((e) => e.id));
    plano.elementos = [...(plano.elementos || []), ...auto.filter((e) => !ja.has(e.id))];
  }
  const usados = proj.usados_broll ? lerUsados(R(proj.usados_broll)) : new Set();
  const reg = aplicarRegras({ padrao, plano, palavras, cortes, fimFala, usadosBroll: usados });
  todosAvisos.push(...reg.avisos);

  // 4) fontes + legenda (fonte variável vira TTF estático por peso; todas vão para work/fontes)
  const fontes = carregarFontes(padrao);
  const leg = gerarAss({
    padrao, fontes, palavras, duracao: fimFala, cortes,
    destaques: reg.plano.destaques, titulos: reg.plano.titulos, numeros: reg.plano.numeros, ocultar: reg.ocultarLegenda
  });
  for (const arq of leg.fontes) fs.copyFileSync(arq, path.join(work, "fontes", path.basename(arq)));
  for (const [id, f] of Object.entries(fontes)) {
    const original = require("./lib/fontes").lerFonte(f.original);
    if (original.variavel) todosAvisos.push(`fonte ${id}: ${path.basename(f.original)} é variável -> convertida para TTF estático (o libass não escolhe peso de fonte variável). Guarde o TTF estático em assets/.`);
    else avisosFonte(original, f.cfg.peso).forEach((a) => todosAvisos.push(`fonte ${id}: ${a}`));
  }
  todosAvisos.push(...leg.avisos);
  fs.writeFileSync(path.join(work, "legenda.ass"), leg.ass, "utf8");

  // 5) composição (cwd = work)
  const saida = R(proj.saida || "final.mp4");
  const cmd = montarComando({
    padrao, fala, duracao: fimFala, ass: "legenda.ass", fontsDir: "fontes",
    zoom: reg.plano.zoom, broll: reg.plano.broll, elementos: reg.plano.elementos.map((e) => ({ ...e, arquivo: e.arquivo })),
    flashes: reg.plano.flashes, saida, semFechamento: proj.sem_fechamento, semMusica: proj.sem_musica
  });
  fs.writeFileSync(path.join(work, "ffmpeg_filtro.txt"), cmd.filtro);
  console.error("renderizando...");
  rodar("ffmpeg", cmd.args, work);

  // 6) plano final (para QA, para a interface e para o editor de palpites)
  const final = {
    padrao: R(proj.padrao), saida, duracao_fala: fimFala, duracao_total: cmd.duracaoTotal,
    cortes, blocos: leg.blocos, plano: reg.plano, avisos: todosAvisos
  };
  fs.writeFileSync(path.join(work, "plano_final.json"), JSON.stringify(final, null, 2));
  if (proj.usados_broll) gravarUsados(R(proj.usados_broll), usados, reg.plano.broll.map((b) => b.id).filter(Boolean));

  console.log(`\nOK: ${saida}`);
  todosAvisos.forEach((a) => console.log(`  aviso  ${a}`));

  // 7) conferência automática (trava de entrega)
  if (!process.argv.includes("--sem-conferir")) {
    const r = spawnSync(process.execPath, [path.join(__dirname, "ferramentas", "conferir_render.js"), saida, path.join(work, "plano_final.json")], { stdio: "inherit" });
    process.exit(r.status || 0);
  }
}

if (require.main === module) {
  try { main(); } catch (e) { console.error(e.message); process.exit(1); }
}

module.exports = { remapearPalavras, cortarSegmentos };
