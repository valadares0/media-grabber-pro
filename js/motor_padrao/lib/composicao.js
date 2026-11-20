// =========================================================================
// composicao.js — monta UM comando ffmpeg que aplica o padrão inteiro sobre a
// fala já cortada: zoom (no corte / lento), B-roll (faixa do topo esfumada ou
// tela cheia), logo, elementos PNG presos na fala (com a entrada do catálogo),
// legenda .ass (com fontsdir), flash, fechamento e áudio (música + loudnorm).
//
// Ordem das camadas (de baixo para cima), igual aos motores Python aprovados:
//   fala(+zoom) -> B-roll -> logo -> elementos -> legenda/textos -> flash
//   ... e depois o fechamento emendado no fim.
//
// Testado com ffmpeg 9 (gyan.dev, Windows): scale eval=frame + crop para zoom
// animado; overlay eval=frame aceita elemento com tamanho animado.
//
// O comando roda com cwd = pasta de trabalho, porque o filtro "subtitles" no
// Windows quebra com "C:\..." (dois-pontos). Por isso legenda e fontes são
// passados por caminho RELATIVO ("legenda.ass", "fontes").
// =========================================================================
"use strict";

const { asset } = require("./padrao");

const f3 = (n) => Number(n).toFixed(3);

/** Expressão de zoom Z(t) a partir de um plano [{t0,t1,de,ate}] (de==ate = zoom constante). */
function exprZoom(plano) {
  if (!plano || !plano.length) return null;
  let e = "1";
  for (const z of [...plano].sort((a, b) => b.t0 - a.t0)) {
    const de = Number(z.de != null ? z.de : z.escala), ate = Number(z.ate != null ? z.ate : de);
    const val = de === ate ? f3(de) : `(${f3(de)}+(${f3(ate - de)})*(t-${f3(z.t0)})/${f3(Math.max(0.04, z.t1 - z.t0))})`;
    e = `if(between(t,${f3(z.t0)},${f3(z.t1)}),${val},${e})`;
  }
  return e;
}

/** Fator de escala s(t) (t = tempo do próprio elemento, começa em 0) para cada entrada do catálogo. */
function exprEscalaEntrada(ent) {
  const e = ent || { tipo: "corte_seco" };
  const d = f3(e.dur || 0.3);
  const p = `min(t/${d},1)`;
  const easeOut = `(1-pow(1-${p},3))`;
  switch (e.tipo) {
    case "crescer": return `(${f3(e.de || 0.6)}+${f3(1 - (e.de || 0.6))}*${easeOut})`;
    case "pop": return `(${f3(e.de || 0.85)}+${f3(1 - (e.de || 0.85))}*${easeOut})`;
    case "slam": return `(${f3(e.de || 1.6)}-${f3((e.de || 1.6) - 1)}*${easeOut})`;
    case "pop_rebote": {
      const de = e.de || 0.7, pico = e.pico || 1.08, d1 = (e.dur || 0.3) * 0.6, d2 = (e.dur || 0.3) * 0.4;
      return `if(lt(t,${f3(d1)}),${f3(de)}+${f3(pico - de)}*(1-pow(1-t/${f3(d1)},2)),${f3(pico)}-${f3(pico - 1)}*min((t-${f3(d1)})/${f3(d2)},1))`;
    }
    default: return null;
  }
}

function temFade(ent) {
  return ent && ["fade", "crescer", "desfoque_foco", "sobe_fade", "pop", "slam"].includes(ent.tipo);
}

/**
 * @param {object} o
 *  padrao       padrão v2 normalizado
 *  fala         arquivo da fala já cortada (relativo ao cwd ou absoluto) — ideal já em W x H
 *  duracao      duração da fala (s)
 *  ass          "legenda.ass" (relativo ao cwd) ou null
 *  fontsDir     "fontes" (relativo ao cwd) ou null
 *  zoom         [{t0,t1,de,ate}]
 *  broll        [{arquivo, t0, t1, in, modo:"faixa_topo"|"tela_cheia"}]
 *  elementos    [{arquivo, t0, t1, largura_px, centro_x, centro_y, entrada}]
 *  flashes      [t]
 *  saida        "final.mp4"
 *  semFechamento, semMusica  (bool)
 */
function montarComando(o) {
  const P = o.padrao;
  const W = P.canvas.w, H = P.canvas.h, FPS = P.canvas.fps;
  const D = Number(o.duracao);
  const args = ["-y", "-hide_banner", "-loglevel", "error", "-stats"];
  const filtros = [];
  let n = 0; // índice do próximo input
  const input = (...a) => { args.push(...a); return n++; };

  // ---------------- fala + zoom ----------------
  const iFala = input("-i", o.fala);
  let cur = "vfala";
  filtros.push(`[${iFala}:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${FPS},setsar=1,format=yuv420p,trim=duration=${f3(D)},setpts=PTS-STARTPTS[${cur}]`);
  const z = exprZoom(o.zoom);
  if (z) {
    filtros.push(`[${cur}]scale=w='trunc(${W}*(${z})/2)*2':h='trunc(${H}*(${z})/2)*2':eval=frame,crop=${W}:${H},setsar=1[vzoom]`);
    cur = "vzoom";
  }

  // ---------------- B-roll ----------------
  const B = P.broll;
  (o.broll || []).forEach((b, k) => {
    const dur = b.t1 - b.t0;
    const iB = input("-ss", f3(b.in || 0), "-t", f3(dur + 0.1), "-i", b.arquivo);
    const nome = `br${k}`;
    if (b.modo === "faixa_topo") {
      const y0 = B.faixa.y0, y1 = B.faixa.y1, hF = y1 - y0, fe = Math.max(1, B.faixa.esfumado_px || 80);
      filtros.push(
        `[${iB}:v]scale=${W}:${hF}:force_original_aspect_ratio=increase,crop=${W}:${hF},fps=${FPS},format=rgba,` +
        `geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='255*clip((H-Y)/${fe},0,1)',setpts=PTS-STARTPTS+${f3(b.t0)}/TB[${nome}]`
      );
      filtros.push(`[${cur}][${nome}]overlay=0:${y0}:enable='between(t,${f3(b.t0)},${f3(b.t1)})':eof_action=pass[v_${nome}]`);
    } else {
      filtros.push(`[${iB}:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${FPS},format=yuv420p,setpts=PTS-STARTPTS+${f3(b.t0)}/TB[${nome}]`);
      filtros.push(`[${cur}][${nome}]overlay=0:0:enable='between(t,${f3(b.t0)},${f3(b.t1)})':eof_action=pass[v_${nome}]`);
    }
    cur = `v_${nome}`;
  });

  // ---------------- logo ----------------
  const LG = P.logo;
  if (LG.ativo && LG.arquivo) {
    const iL = input("-loop", "1", "-t", f3(D), "-i", o.logoArquivo || asset(P, LG.arquivo));
    const esc = LG.tela_cheia ? `scale=${W}:${H}` : `scale=${Math.round(LG.largura_px)}:-2`;
    filtros.push(`[${iL}:v]format=rgba,${esc}[logo]`);
    const x = LG.tela_cheia ? "0" : `${Math.round(LG.centro_x || W / 2)}-w/2`;
    const y = LG.tela_cheia ? "0" : `${Math.round(LG.centro_y)}-h/2`;
    filtros.push(`[${cur}][logo]overlay=x='${x}':y='${y}':enable='lte(t,${f3(D)})'[vlogo]`);
    cur = "vlogo";
  }

  // ---------------- elementos presos na fala ----------------
  (o.elementos || []).forEach((el, k) => {
    const dur = el.t1 - el.t0;
    const iE = input("-loop", "1", "-t", f3(dur + 0.05), "-i", el.arquivo);
    const ent = el.entrada || P.elementos.entrada || { tipo: "corte_seco" };
    const s = exprEscalaEntrada(ent);
    const larg = Math.round(el.largura_px);
    let cadeia = `[${iE}:v]format=rgba`;
    if (temFade(ent)) cadeia += `,fade=t=in:st=0:d=${f3(Math.min(ent.dur || 0.3, 0.3))}:alpha=1`;
    if (ent.tipo === "pop_rebote" && ent.giro) {
      const d1 = f3((ent.dur || 0.3) * 0.6);
      cadeia += `,rotate=a='${f3(ent.giro)}*PI/180*(1-min(t/${d1},1))':c=none:ow='hypot(iw,ih)':oh=ow`;
    }
    cadeia += s
      ? `,scale=w='trunc(${larg}*${s}/2)*2':h=-2:eval=frame`
      : `,scale=${larg}:-2`;
    cadeia += `,setpts=PTS-STARTPTS+${f3(el.t0)}/TB[el${k}]`;
    filtros.push(cadeia);
    const cx = Math.round(el.centro_x || W / 2), cy = Math.round(el.centro_y);
    const yExpr = ent.tipo === "sobe_fade"
      ? `${cy}-h/2+${ent.dy || 40}*(1-min((t-${f3(el.t0)})/${f3(ent.dur || 0.27)},1))`
      : `${cy}-h/2`;
    filtros.push(`[${cur}][el${k}]overlay=x='${cx}-w/2':y='${yExpr}':eval=frame:enable='between(t,${f3(el.t0)},${f3(el.t1)})':eof_action=pass[vel${k}]`);
    cur = `vel${k}`;
  });

  // ---------------- legenda / textos (.ass) ----------------
  if (o.ass) {
    filtros.push(`[${cur}]subtitles=${o.ass}${o.fontsDir ? `:fontsdir=${o.fontsDir}` : ""}[vleg]`);
    cur = "vleg";
  }

  // ---------------- flash ----------------
  if ((o.flashes || []).length) {
    const fl = P.transicoes.flash;
    const q = (fl.quadros || 2) / FPS;
    const iF = input("-f", "lavfi", "-i", `color=c=${(fl.cor || "#FFFFFF").replace("#", "0x")}:s=${W}x${H}:r=${FPS}:d=${f3(D)}`);
    const en = o.flashes.map((t) => `between(t,${f3(t)},${f3(t + q - 0.001)})`).join("+");
    filtros.push(`[${cur}][${iF}:v]overlay=0:0:enable='${en}'[vflash]`);
    cur = "vflash";
  }

  // ---------------- fechamento ----------------
  const FE = P.fechamento;
  let vFinal = cur;
  let durFech = 0;
  if (FE.ativo && !o.semFechamento) {
    durFech = Number(FE.duracao_s) || 2;
    if (FE.tipo === "clipe" && FE.arquivo) {
      const iC = input("-i", asset(P, FE.arquivo));
      filtros.push(`[${iC}:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${FPS},setsar=1,format=yuv420p,trim=duration=${f3(durFech)},setpts=PTS-STARTPTS[fech]`);
    } else {
      const iBg = input("-f", "lavfi", "-i", `color=c=${(FE.fundo || "#000000").replace("#", "0x")}:s=${W}x${H}:r=${FPS}:d=${f3(durFech)}`);
      let fch = `fechbg`;
      filtros.push(`[${iBg}:v]format=yuv420p[${fch}]`);
      if (FE.logo) {
        const iFL = input("-loop", "1", "-t", f3(durFech), "-i", asset(P, FE.logo));
        filtros.push(`[${iFL}:v]format=rgba,scale=${Math.round(FE.largura_px || W * 0.6)}:-2[fechlogo]`);
        filtros.push(`[${fch}][fechlogo]overlay=x='(W-w)/2':y='${Math.round(FE.centro_y || H / 2)}-h/2'[fechc]`);
        fch = "fechc";
      }
      if (FE.entrada && FE.entrada.tipo === "fade") {
        filtros.push(`[${fch}]fade=t=in:st=0:d=${f3(FE.entrada.dur || 0.4)}[fechf]`);
        fch = "fechf";
      }
      const an = FE.animacao;
      if (an && an.tipo === "zoom_lento") {
        const ze = `(${f3(an.de || 1)}+${f3((an.ate || 1.05) - (an.de || 1))}*t/${f3(durFech)})`;
        filtros.push(`[${fch}]scale=w='trunc(${W}*${ze}/2)*2':h='trunc(${H}*${ze}/2)*2':eval=frame,crop=${W}:${H},setsar=1[fechz]`);
        fch = "fechz";
      }
      filtros.push(`[${fch}]setsar=1[fech]`);
    }
    filtros.push(`[${cur}]trim=duration=${f3(D)},setpts=PTS-STARTPTS[vcorpo];[vcorpo][fech]concat=n=2:v=1:a=0[vfim]`);
    vFinal = "vfim";
  }

  // ---------------- áudio ----------------
  const A = P.audio;
  const total = D + durFech;
  filtros.push(`[${iFala}:a]atrim=duration=${f3(D)},asetpts=PTS-STARTPTS,apad=whole_dur=${f3(total)}[voz]`);
  let aCur = "voz";
  if (A.musica && A.musica.ativa && A.musica.arquivo && !o.semMusica) {
    const iM = input("-stream_loop", "-1", "-i", asset(P, A.musica.arquivo));
    const vol = A.musica.volume != null ? A.musica.volume : Math.pow(10, (A.musica.volume_db_sob_voz || -20) / 20);
    const fo = A.musica.fade_saida_s || 1.5;
    let m = `[${iM}:a]atrim=duration=${f3(total)},asetpts=PTS-STARTPTS,volume=${f3(vol)}`;
    if (A.musica.sobe_no_fim && durFech > 0) m += `,volume='if(gte(t,${f3(D)}),2.5,1)':eval=frame`;
    m += `,afade=t=out:st=${f3(Math.max(0, total - fo))}:d=${f3(fo)}[mus]`;
    filtros.push(m);
    filtros.push(`[voz][mus]amix=inputs=2:duration=first:normalize=0[mix]`);
    aCur = "mix";
  }
  filtros.push(`[${aCur}]loudnorm=I=${A.lufs || -14}:TP=-1.0:LRA=11,aresample=48000[aout]`);

  args.push(
    "-filter_complex", filtros.join(";\n"),
    "-map", `[${vFinal}]`, "-map", "[aout]",
    "-c:v", "libx264", "-preset", o.preset || "veryfast", "-crf", String(o.crf || 18), "-pix_fmt", "yuv420p", "-r", String(FPS),
    "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart",
    "-t", f3(total),
    o.saida
  );
  return { args, filtro: filtros.join(";\n"), duracaoTotal: total };
}

module.exports = { montarComando, exprZoom, exprEscalaEntrada };
