// =========================================================================
// legenda_ass.js — gera o .ass (legenda, destaques, título, números) a partir
// do PADRÃO v2 + palavras com tempo. Substitui o buildAss() do ai_clips.js.
//
// O que ele resolve (cada item é um bug do motor antigo):
//  1. Tamanho: converte px do padrão (em, como PIL/CapCut) para o Fontsize do
//     libass (fontes.fontsizeAss). Antes: "60" virava letra de ~38 px.
//  2. Fonte: nome exato da instância ("Montserrat ExtraBold") + Bold=0, e o
//     motor passa fontsdir= para o ffmpeg. Antes: fonte trocada em silêncio.
//  3. Posição: \an5\pos(x, y) no CENTRO VISUAL (altura das maiúsculas ou das
//     minúsculas), não margem de baixo em %. Cada linha é um evento próprio.
//  4. Quebra de linha medida pela largura real das letras: o texto NUNCA
//     encolhe para caber; se não cabe, vira 2 linhas ou 2 blocos.
//  5. Bloco nunca atravessa corte; quebra em pausa e em pontuação.
//  6. Destaque (ex.: "BRANCA|dourada") entra no instante em que a palavra é
//     falada, e não se repete na legenda de baixo.
//  7. Sombra suave de verdade (camada própria com desfoque), sem \fscx112
//     que fazia a linha "pular".
//  8. Animações só do catálogo (padrao.CATALOGO_MOTION), com os mesmos tempos.
//
// Tempos: tudo na linha do tempo FINAL (depois dos cortes de pausa).
// =========================================================================
"use strict";

const { lerFonte, fontsizeAss, nomeParaAss, calibrarLargura, garantirEstatica } = require("./fontes");
const { asset } = require("./padrao");

// ---------------- utilidades ----------------
const r2 = (n) => Math.round(n * 100) / 100;

function assTime(t) {
  const cs = Math.max(0, Math.round(t * 100));
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  const c = cs % 100;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(c).padStart(2, "0")}`;
}

function corAss(hex) {
  const m = String(hex || "#FFFFFF").match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i);
  if (!m) return "&H00FFFFFF&";
  return `&H00${m[3]}${m[2]}${m[1]}&`.toUpperCase();
}
function alphaAss(opacidade) {
  const a = Math.round((1 - Math.max(0, Math.min(1, opacidade))) * 255);
  return `&H${a.toString(16).padStart(2, "0").toUpperCase()}&`;
}
const esc = (s) => String(s).replace(/[{}\\]/g, "").replace(/\s*\n\s*/g, " ");

function normPalavra(s) {
  return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}
const VAZIAS = new Set(["DE", "DA", "DO", "DAS", "DOS", "COM", "QUE", "UMA", "UM", "PRA", "PARA", "NAO", "E", "O", "A", "OS", "AS", "EM", "NO", "NA"]);

function aplicarCaixa(texto, caixa, maiusculasSempre = []) {
  let t = String(texto);
  if (caixa === "alta") t = t.toLocaleUpperCase("pt-BR");
  else if (caixa === "baixa") t = t.toLocaleLowerCase("pt-BR");
  for (const nome of maiusculasSempre || []) {
    const re = new RegExp(`(^|[^\\p{L}\\p{N}])(${nome.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})(?=$|[^\\p{L}\\p{N}])`, "giu");
    t = t.replace(re, (_, pre) => pre + nome);
  }
  return t;
}

function semPontuacaoFinal(t) { return t.replace(/[\s.,;:!?…]+$/u, ""); }

// ---------------- fontes ----------------
/**
 * Carrega as fontes do padrão. Fonte VARIÁVEL vira TTF estático do peso pedido
 * (o libass não escolhe instância de fonte variável). info.original = arquivo do padrão.
 * Um mesmo id usado em pesos diferentes (ex.: VERSO legenda 600, tag 800, explosão 900)
 * gera um arquivo estático POR PESO (variante(peso)). As usadas ficam em fontes._usadas.
 */
function carregarFontes(padrao) {
  const out = {};
  const usadas = new Set();
  for (const [id, f] of Object.entries(padrao.fontes || {})) {
    const original = asset(padrao, f.arquivo);
    const cache = new Map();
    const variante = (peso, italico) => {
      const p = Number(peso) || f.peso || 400, it = italico != null ? Boolean(italico) : Boolean(f.italico);
      const k = `${p}|${it}`;
      if (!cache.has(k)) {
        const arq = garantirEstatica(original, p, it);
        const info = lerFonte(arq);
        info.original = original;
        info.convertidaDeVariavel = arq !== original;
        cache.set(k, info);
      }
      const info = cache.get(k);
      usadas.add(info.arquivo);
      return info;
    };
    out[id] = { cfg: f, original, variante, get info() { return variante(f.peso, f.italico); } };
  }
  Object.defineProperty(out, "_usadas", { value: usadas, enumerable: false });
  return out;
}

/**
 * Resolve o estilo de um papel (legenda, destaque, título...).
 * cfg: { fonte, peso, tamanho_px, cor, caixa, sombra, contorno, italico, espacamento_letras_px }
 */
function resolverEstilo(cfg, fontes, padrao) {
  const f = fontes[cfg.fonte];
  if (!f) throw new Error(`fonte "${cfg.fonte}" não carregada`);
  const peso = cfg.peso || f.cfg.peso || 400;
  const italico = cfg.italico != null ? cfg.italico : Boolean(f.cfg.italico);
  const em = Number(cfg.tamanho_px);
  const fi = f.variante ? f.variante(peso, italico) : f.info;
  const upm = fi.unitsPerEm;
  // centro do "box" do libass acima da linha de base (unidades) vs. centro visual do texto
  const win = fi.os2 && fi.os2.winAscent + fi.os2.winDescent > 0
    ? { a: fi.os2.winAscent, d: fi.os2.winDescent }
    : { a: fi.hhea.ascender, d: -fi.hhea.descender };
  const centroBox = (win.a - win.d) / 2;
  const cap = (fi.os2 && fi.os2.capHeight) || upm * 0.7;
  const xh = (fi.os2 && fi.os2.xHeight) || upm * 0.52;
  const ref = cfg.caixa === "baixa" ? (xh + cap) / 4 /* mistura: minúsculas têm ascendentes */ : cap / 2;
  // largura real (fonte variável / kerning): calibrada 1x com o próprio libass
  const fatorLarg = padrao._semCalibrar ? 1 : calibrarLargura(fi, peso, italico);
  return {
    fn: nomeParaAss(fi, peso, italico),
    fs: fontsizeAss(fi, em),
    em,
    cor: cfg.cor || "#FFFFFF",
    caixa: cfg.caixa || "original",
    sombra: cfg.sombra === undefined ? padrao.legenda.sombra : cfg.sombra,
    contorno: cfg.contorno || null,
    fsp: Number(cfg.espacamento_letras_px) || 0,
    entrelinha: cfg.entrelinha || padrao.legenda.entrelinha || 1.15,
    // \an5 centraliza o box; somamos isto ao y para o CENTRO VISUAL cair no y do padrão
    ajusteY: ((ref - centroBox) / upm) * em,
    largura: (txt) => fi.larguraTexto(txt, em, Number(cfg.espacamento_letras_px) || 0) * fatorLarg,
    fatorLargura: fatorLarg,
    tagFundo: cfg.tag_fundo || null
  };
}

// ---------------- animação de entrada (catálogo) ----------------
/**
 * Devolve { pos, tags } para um texto em (x, y).
 * alphaFinal: "&H00&" para o texto, alpha da sombra para a camada de sombra.
 * blurFinal: desfoque final (0 no texto, desfoque da sombra na sombra).
 */
function entradaAss(entrada, x, y, alphaFinal, blurFinal) {
  const e = entrada || { tipo: "corte_seco" };
  const ms = (s, def) => Math.round((e[s] != null ? e[s] : def) * 1000);
  const pos = `\\pos(${r2(x)},${r2(y)})`;
  const baseBlur = blurFinal ? `\\blur${blurFinal}` : "";
  switch (e.tipo) {
    case "fade":
      return { pos, tags: `${baseBlur}\\fad(${ms("dur", 0.2)},0)` };
    case "pop": {
      const de = Math.round((e.de || 0.85) * 100);
      return { pos, tags: `${baseBlur}\\fscx${de}\\fscy${de}\\t(0,${ms("dur", 0.15)},\\fscx100\\fscy100)` };
    }
    case "pop_rebote": {
      const de = Math.round((e.de || 0.7) * 100), pico = Math.round((e.pico || 1.08) * 100), d = ms("dur", 0.3);
      const giro = e.giro != null ? e.giro : -6;
      return { pos, tags: `${baseBlur}\\fscx${de}\\fscy${de}\\frz${giro}\\t(0,${Math.round(d * 0.6)},\\fscx${pico}\\fscy${pico}\\frz0)\\t(${Math.round(d * 0.6)},${d},\\fscx100\\fscy100)` };
    }
    case "crescer": {
      const de = Math.round((e.de || 0.6) * 100);
      // aceleração 0.5 = rápido no começo e freando no fim; nunca passa de 100%
      return { pos, tags: `${baseBlur}\\alpha&HFF&\\fscx${de}\\fscy${de}\\t(0,${ms("dur", 0.3)},0.5,\\alpha${alphaFinal}\\fscx100\\fscy100)` };
    }
    case "desfoque_foco": {
      const d = ms("dur", 0.3);
      const dy = e.dy != null ? Number(e.dy) : 0;
      const pTag = dy ? `\\move(${r2(x)},${r2(y + dy)},${r2(x)},${r2(y)},0,${d})` : pos;
      return { pos: pTag, tags: `\\alpha&HFF&\\blur${e.blur || 12}\\t(0,${d},0.6,\\alpha${alphaFinal}\\blur${blurFinal || 0})` };
    }
    case "sobe_fade": {
      const dy = e.dy != null ? e.dy : 40, d = ms("dur", 0.27);
      return { pos: `\\move(${r2(x)},${r2(y + dy)},${r2(x)},${r2(y)},0,${d})`, tags: `${baseBlur}\\fad(${d},0)` };
    }
    case "slam": {
      const de = Math.round((e.de || 1.6) * 100);
      return { pos, tags: `\\fscx${de}\\fscy${de}\\blur${e.blur || 8}\\t(0,${ms("dur", 0.4)},0.6,\\fscx100\\fscy100\\blur${blurFinal || 0})` };
    }
    default: // corte_seco, maquina_escrever e palavra_por_palavra (tratados no texto), conta_numero (eventos)
      return { pos, tags: baseBlur };
  }
}

/** Máquina de escrever: cada letra com alpha 0->final, a partir de "inicioMs". */
function textoMaquinaEscrever(texto, durMs, inicioMs, alphaFinal) {
  const chars = [...texto];
  const passo = durMs / Math.max(1, chars.length);
  return chars.map((c, i) => {
    if (c === " ") return " ";
    const a = Math.round(inicioMs + i * passo);
    return `{\\alpha&HFF&\\t(${a},${a + 40},\\alpha${alphaFinal})}${c}`;
  }).join("");
}

// ---------------- desenho de um texto (sombra + texto + tag) ----------------
function eventosTexto({ texto, x, y, t0, t1, est, entrada, camada = 1, prefixoTexto = null }) {
  const out = [];
  if (!texto || t1 - t0 < 0.04) return out;
  const yv = y + est.ajusteY;
  const base = `\\an5\\fn${est.fn}\\fs${est.fs}\\fsp${est.fsp}\\b0\\i0\\shad0`;
  const durEsc = entrada && entrada.tipo === "maquina_escrever" ? Math.round((entrada.dur || 0.3) * 1000) : 0;
  const inicioEsc = entrada && entrada.inicio_ms ? entrada.inicio_ms : 0;
  const corpo = (alphaFinal) => prefixoTexto
    ? prefixoTexto(alphaFinal)
    : durEsc ? textoMaquinaEscrever(esc(texto), durEsc, inicioEsc, alphaFinal) : esc(texto);

  if (est.tagFundo) {
    const tf = est.tagFundo, pad = tf.padding_px || 20, raio = tf.raio_px || 0;
    const w = est.largura(texto) + pad * 2, h = est.em * 0.72 + pad * 2;
    const ent = entradaAss(entrada, x, y, "&H00&", 0);
    out.push(`Dialogue: ${camada},${assTime(t0)},${assTime(t1)},Base,,0,0,0,,{\\an5${ent.pos}\\bord0\\shad0\\1c${corAss(tf.cor)}${ent.tags}\\p1}${retanguloArredondado(w, h, raio)}{\\p0}`);
  }
  const s = est.sombra;
  if (s && s.opacidade > 0) {
    const aS = alphaAss(s.opacidade);
    const ent = entradaAss(entrada, x + (s.dx || 0), yv + (s.dy || 0), aS, s.desfoque || 0);
    out.push(`Dialogue: ${camada},${assTime(t0)},${assTime(t1)},Base,,0,0,0,,{${base}\\bord0\\1c${corAss(s.cor)}\\alpha${aS}${ent.pos}${ent.tags}}${corpo(aS)}`);
  }
  const c = est.contorno;
  const bord = c && c.largura ? `\\bord${c.largura}\\3c${corAss(c.cor || "#000000")}` : "\\bord0";
  const ent = entradaAss(entrada, x, yv, "&H00&", 0);
  out.push(`Dialogue: ${camada + 1},${assTime(t0)},${assTime(t1)},Base,,0,0,0,,{${base}${bord}\\1c${corAss(est.cor)}${ent.pos}${ent.tags}}${corpo("&H00&")}`);
  return out;
}

function retanguloArredondado(w, h, r) {
  const W = r2(w), H = r2(h), R = Math.min(r, w / 2, h / 2);
  if (!R) return `m 0 0 l ${W} 0 ${W} ${H} 0 ${H}`;
  const k = r2(R * 0.448); // controle de bézier ~ quarto de círculo
  return [
    `m ${R} 0 l ${r2(W - R)} 0`, `b ${r2(W - k)} 0 ${W} ${k} ${W} ${R}`,
    `l ${W} ${r2(H - R)}`, `b ${W} ${r2(H - k)} ${r2(W - k)} ${H} ${r2(W - R)} ${H}`,
    `l ${R} ${H}`, `b ${k} ${H} 0 ${r2(H - k)} 0 ${r2(H - R)}`,
    `l 0 ${R}`, `b 0 ${k} ${k} 0 ${R} 0`
  ].join(" ");
}

// ---------------- localizar frase falada ----------------
/** Acha a sequência de palavras que forma "texto" mais perto do tempo "perto". */
function localizarFrase(palavras, texto, perto = null) {
  const alvo = String(texto).split(/\s+/).map(normPalavra).filter(Boolean);
  if (!alvo.length) return null;
  let melhor = null;
  for (let i = 0; i <= palavras.length - alvo.length; i++) {
    let ok = true;
    for (let k = 0; k < alvo.length; k++) {
      if (normPalavra(palavras[i + k].w) !== alvo[k]) { ok = false; break; }
    }
    if (!ok) continue;
    const dist = perto == null ? i : Math.abs(palavras[i].t - perto);
    if (!melhor || dist < melhor.dist) melhor = { i0: i, i1: i + alvo.length - 1, dist };
  }
  return melhor;
}

// ---------------- blocos da legenda ----------------
function montarBlocos(palavras, L, est, { cortes, destaquesLinha }) {
  const blocos = [];
  let cur = [];
  const destDe = new Map(); // índice da palavra -> destaque (linha abaixo)
  for (const d of destaquesLinha) for (let i = d.i0; i <= d.i1; i++) destDe.set(i, d);

  const textoDe = (arr) => arr.map((x) => x.w).join(" ");
  const fecha = () => { if (cur.length) blocos.push(cur); cur = []; };

  for (let i = 0; i < palavras.length; i++) {
    const w = { ...palavras[i], idx: i };
    const prev = cur[cur.length - 1];
    const brancas = cur.filter((x) => !destDe.has(x.idx));
    if (prev) {
      const prevDest = destDe.get(prev.idx), wDest = destDe.get(i);
      const cortou = cortes.some((c) => c > prev.t + 0.01 && c <= w.t + 0.02);
      const pausa = w.t - (prev.e || prev.t) > L.quebra_em_pausa_s;
      const pontuacao = /[.!?…]$/.test(prev.w) && brancas.length >= L.palavras_por_bloco.min;
      const destTerminou = prevDest && prevDest !== wDest; // destaque fecha o bloco
      const cheio = !wDest && brancas.length >= L.palavras_por_bloco.max;
      const longo = !wDest && textoDe([...brancas, w]).length > L.max_caracteres;
      if (cortou || pausa || pontuacao || destTerminou || cheio || longo) fecha();
    }
    cur.push(w);
  }
  fecha();

  return blocos.map((arr, k) => {
    const brancas = arr.filter((x) => !destDe.has(x.idx));
    const dest = arr.map((x) => destDe.get(x.idx)).find(Boolean) || null;
    const t0 = arr[0].t;
    const ultimo = arr[arr.length - 1];
    const prox = blocos[k + 1];
    let t1 = prox && prox[0].t - (ultimo.e || ultimo.t) < 0.7 ? prox[0].t : (ultimo.e || ultimo.t + 0.4) + 0.25;
    const corte = cortes.find((c) => c > t0 + 0.05 && c < t1);
    if (corte) t1 = corte;
    return { t0, t1, palavras: brancas, destaque: dest };
  });
}

/** Quebra o texto em linhas que cabem em largura_max (nunca diminui a fonte). */
function quebrarLinhas(palavrasTxt, est, larguraMax, maxLinhas) {
  const txt = palavrasTxt.join(" ");
  if (est.largura(txt) <= larguraMax || palavrasTxt.length < 2) return [txt];
  if (maxLinhas < 2) return null;
  let melhor = null;
  for (let i = 1; i < palavrasTxt.length; i++) {
    const a = palavrasTxt.slice(0, i).join(" "), b = palavrasTxt.slice(i).join(" ");
    const m = Math.max(est.largura(a), est.largura(b));
    // preferir a 1ª linha mais curta ou igual (pirâmide invertida lê melhor)
    const pen = m + (est.largura(a) > est.largura(b) ? 1 : 0);
    if (!melhor || pen < melhor.pen) melhor = { linhas: [a, b], pen, m };
  }
  return melhor.m <= larguraMax ? melhor.linhas : null;
}

/**
 * Texto grande (título, número, destaque) em 1 ou 2 linhas que CABEM na tela.
 * Devolve { eventos, yUltima, linhas }. ancora: "centro" (bloco centrado em y) ou "primeira".
 */
function eventosMultilinha({ texto, x, y, t0, t1, est, entrada, camada, larguraMax, maxLinhas = 2, ancora = "centro", avisos }) {
  const pals = String(texto).split(/\s+/).filter(Boolean);
  let linhas = quebrarLinhas(pals, est, larguraMax, maxLinhas);
  if (!linhas) {
    linhas = quebrarLinhas(pals, est, Infinity, 1);
    if (avisos) avisos.push(`"${texto}" (${est.em}px) não cabe em ${maxLinhas} linha(s) de ${Math.round(larguraMax)}px: encurte o texto (o tamanho NÃO é reduzido).`);
  }
  const lh = est.em * est.entrelinha;
  const y0 = ancora === "primeira" ? y : y - ((linhas.length - 1) * lh) / 2;
  const eventos = [];
  linhas.forEach((ln, i) => eventos.push(...eventosTexto({ texto: ln, x, y: y0 + i * lh, t0, t1, est, entrada, camada })));
  return { eventos, yUltima: y0 + (linhas.length - 1) * lh, linhas };
}

// =========================================================================
/**
 * @param {object} o
 *   padrao       padrão v2 normalizado (carregarPadrao)
 *   palavras     [{t, e, w}] na linha do tempo final
 *   duracao      duração final (s)
 *   cortes       [t] tempos dos cortes (jump cuts / troca de plano) na linha final
 *   destaques    [{id, texto, perto?, t1?}]  id = destaques[].id do padrão
 *   titulos      [{texto, linha2?, t0, t1}]
 *   numeros      [{texto, linha2?, t0, t1}]
 *   ocultar      [[t0, t1]] intervalos sem legenda (elemento esconde_legenda)
 * @returns {{ass:string, blocos:object[], avisos:string[], fontes:string[]}}
 */
function gerarAss(o) {
  const P = o.padrao;
  const L = P.legenda;
  const W = P.canvas.w, H = P.canvas.h;
  const fontes = o.fontes || carregarFontes(P);
  const avisos = [];
  const palavras = (o.palavras || []).filter((w) => w && w.w && w.t >= 0 && w.t < (o.duracao || Infinity)).sort((a, b) => a.t - b.t);
  const cortes = [...(o.cortes || [])].sort((a, b) => a - b);
  const eventos = [];
  const ocultar = [...(o.ocultar || [])];

  const estLeg = L.ativa ? resolverEstilo({ ...L }, fontes, P) : null;
  const destCfg = Object.fromEntries((P.destaques || []).map((d) => [d.id, d]));

  // 1) destaques -> ancorar na fala
  const destaquesLinha = [], destaquesSubst = [];
  for (const d of o.destaques || []) {
    const cfg = destCfg[d.id];
    if (!cfg) { avisos.push(`destaque "${d.id}" não existe no padrão.`); continue; }
    const loc = localizarFrase(palavras, d.texto, d.perto);
    if (!loc) { avisos.push(`destaque "${d.texto}" não foi achado na fala: não entrou.`); continue; }
    const item = { ...d, cfg, i0: loc.i0, i1: loc.i1, t0: palavras[loc.i0].t, tFim: palavras[loc.i1].e || palavras[loc.i1].t + 0.4 };
    if (cfg.posicao === "linha_abaixo_da_legenda") destaquesLinha.push(item);
    else destaquesSubst.push(item);
  }

  // 2) títulos (topo) e números (no lugar da legenda)
  const larguraGrande = W - 100; // títulos/números/destaques: 50 px de margem de cada lado
  const TG = P.titulo_gancho;
  for (const ti of o.titulos || []) {
    if (!TG.ativo) { avisos.push("título pedido, mas titulo_gancho.ativo = false no padrão."); break; }
    const est = resolverEstilo(TG, fontes, P);
    const txt = aplicarCaixa(ti.texto, TG.caixa);
    const m = eventosMultilinha({ texto: txt, x: W / 2, y: TG.centro_y, t0: ti.t0, t1: ti.t1, est, entrada: TG.entrada, camada: 5, larguraMax: larguraGrande, avisos });
    eventos.push(...m.eventos);
    if (ti.linha2 && TG.linha2) {
      const est2 = resolverEstilo({ ...TG.linha2, sombra: TG.linha2.sombra || est.sombra }, fontes, P);
      const sub = palavras.filter((w) => w.t >= ti.t0 - 0.05 && w.t < ti.t1);
      const loc = TG.linha2.sincronia === "na_palavra" ? localizarFrase(sub, ti.linha2) : null;
      const t2 = loc ? sub[loc.i0].t : ti.t0;
      const y2 = m.yUltima + (est.em * 0.72) / 2 + 14 + (est2.em * 0.72) / 2;
      eventos.push(...eventosMultilinha({ texto: aplicarCaixa(ti.linha2, TG.linha2.caixa), x: W / 2, y: y2, t0: t2, t1: ti.t1, est: est2, entrada: { tipo: "corte_seco" }, camada: 5, larguraMax: larguraGrande, ancora: "primeira", avisos }).eventos);
    }
  }
  const NU = P.numeros;
  for (const n of o.numeros || []) {
    if (!NU.ativo) { avisos.push("número pedido, mas numeros.ativo = false."); break; }
    const est = resolverEstilo(NU, fontes, P);
    let yUlt = NU.centro_y;
    if (NU.entrada && NU.entrada.tipo === "conta_numero" && /^\d[\d.]*$/.test(n.texto)) {
      const alvo = Number(n.texto.replace(/\./g, "")), dur = NU.entrada.dur || 0.8, passos = Math.max(2, Math.round(dur * 15));
      for (let k = 0; k <= passos; k++) {
        const ta = n.t0 + (dur * k) / passos, tb = k === passos ? n.t1 : n.t0 + (dur * (k + 1)) / passos;
        const v = Math.round((alvo * k) / passos).toLocaleString("pt-BR");
        eventos.push(...eventosTexto({ texto: v, x: W / 2, y: NU.centro_y, t0: ta, t1: tb, est, entrada: { tipo: "corte_seco" }, camada: 5 }));
      }
    } else {
      const m = eventosMultilinha({ texto: aplicarCaixa(n.texto, NU.caixa || "alta"), x: W / 2, y: NU.centro_y, t0: n.t0, t1: n.t1, est, entrada: NU.entrada, camada: 5, larguraMax: larguraGrande, avisos });
      eventos.push(...m.eventos);
      yUlt = m.yUltima;
    }
    if (n.linha2 && NU.linha2) {
      const est2 = resolverEstilo(NU.linha2, fontes, P);
      const y2 = yUlt + (est.em * 0.72) / 2 + 16 + (est2.em * 0.72) / 2;
      eventos.push(...eventosMultilinha({ texto: aplicarCaixa(n.linha2, NU.linha2.caixa), x: W / 2, y: y2, t0: n.t0, t1: n.t1, est: est2, entrada: { tipo: "corte_seco" }, camada: 5, larguraMax: larguraGrande, ancora: "primeira", avisos }).eventos);
    }
    if (NU.posicao === "substitui_legenda") ocultar.push([n.t0, n.t1]);
  }

  // 3) destaques que SUBSTITUEM a legenda (impacto, explosão, tag)
  for (const d of destaquesSubst) {
    const cfg = d.cfg;
    const est = resolverEstilo(cfg, fontes, P);
    const t1 = d.t1 || Math.min(d.tFim + 0.5, cortes.find((c) => c > d.t0 + 0.05) || Infinity, o.duracao || Infinity);
    const y = cfg.posicao === "topo" ? (cfg.centro_y || 470) : (cfg.centro_y || L.centro_y);
    eventos.push(...eventosMultilinha({ texto: aplicarCaixa(d.texto, cfg.caixa, L.maiusculas_sempre), x: W / 2, y, t0: d.t0, t1, est, entrada: cfg.entrada, camada: 7, larguraMax: larguraGrande, avisos }).eventos);
    if (cfg.posicao === "substitui_legenda") ocultar.push([d.t0, t1]);
  }

  // 4) legenda
  const blocosOut = [];
  if (L.ativa) {
    const titulosJan = (o.titulos || []).map((t) => ({ t0: t.t0, t1: t.t1, chave: new Set(`${t.texto} ${t.linha2 || ""}`.split(/\s+/).map(normPalavra).filter((x) => x.length > 2 && !VAZIAS.has(x))) }));
    let blocos = montarBlocos(palavras, L, estLeg, { cortes, destaquesLinha });

    for (const b of blocos) {
      // não repetir destaque/título na legenda de baixo
      let ws = b.palavras;
      if (L.nao_repetir_destaque) {
        for (const tj of titulosJan) {
          if (b.t0 < tj.t1 - 0.05 && b.t1 > tj.t0 + 0.05) ws = ws.filter((w) => !tj.chave.has(normPalavra(w.w)));
        }
      }
      // intervalos sem legenda
      let t0 = b.t0, t1 = b.t1;
      let escondido = false;
      for (const [a, z] of ocultar) {
        if (t0 >= a - 0.02 && t1 <= z + 0.02) escondido = true;
        else if (t0 < a && t1 > a) t1 = a;
        else if (t0 < z && t1 > z) t0 = z;
      }
      if (escondido || t1 - t0 < 0.08) continue;

      let textos = ws.map((w) => w.w);
      if (textos.length) {
        let txt = aplicarCaixa(textos.join(" "), L.caixa, L.maiusculas_sempre);
        if (L.sem_pontuacao_final) txt = semPontuacaoFinal(txt);
        textos = txt.split(" ").filter(Boolean);
      }
      let linhas = textos.length ? quebrarLinhas(textos, estLeg, L.largura_max_px, L.max_linhas) : [];
      if (linhas === null) {
        // não cabe nem em max_linhas: divide o bloco em dois no tempo (mantém o tamanho da fonte!)
        const meio = Math.ceil(ws.length / 2);
        const tm = ws[meio].t;
        const partes = [[ws.slice(0, meio), t0, tm], [ws.slice(meio), tm, t1]];
        for (const [pw, a, z] of partes) {
          let tx = aplicarCaixa(pw.map((w) => w.w).join(" "), L.caixa, L.maiusculas_sempre);
          if (L.sem_pontuacao_final) tx = semPontuacaoFinal(tx);
          const ln = quebrarLinhas(tx.split(" "), estLeg, L.largura_max_px, L.max_linhas) || [tx];
          if (ln.some((l) => estLeg.largura(l) > L.largura_max_px)) avisos.push(`"${tx}" passa de ${L.largura_max_px}px mesmo dividido.`);
          blocosOut.push({ t0: a, t1: z, linhas: ln, palavras: pw, destaque: null });
        }
        continue;
      }
      blocosOut.push({ t0, t1, linhas, palavras: ws, destaque: b.destaque });
    }

    for (const b of blocosOut) {
      const n = b.linhas.length;
      const lh = estLeg.em * estLeg.entrelinha;
      const yBase = L.ancora === "centro_primeira_linha" ? L.centro_y : L.centro_y - ((n - 1) * lh) / 2;
      b.linhas.forEach((ln, i) => {
        const y = yBase + i * lh;
        let prefixo = null;
        if (L.palavra_ativa && L.palavra_ativa.modo === "palavra_por_palavra") {
          const ws = b.palavras;
          prefixo = (alphaFinal) => ln.split(" ").map((p, k) => {
            const w = ws[b.linhas.slice(0, i).join(" ").split(" ").filter(Boolean).length + k];
            const a = w ? Math.max(0, Math.round((w.t - b.t0) * 1000)) : 0;
            return `{\\alpha&HFF&\\t(${a},${a + 1},\\alpha${alphaFinal})}${esc(p)}`;
          }).join(" ");
        }
        const usaCorAtiva = L.palavra_ativa && L.palavra_ativa.modo === "cor" && L.palavra_ativa.cor && b.palavras.length > 1;
        if (!usaCorAtiva) {
          eventos.push(...eventosTexto({ texto: ln, x: L.centro_x || W / 2, y, t0: b.t0, t1: b.t1, est: estLeg, entrada: L.entrada, camada: 1, prefixoTexto: prefixo }));
        }
      });
      // palavra ativa colorida sem sobreposição dupla (zero flicker/piscar)
      if (L.palavra_ativa && L.palavra_ativa.modo === "cor" && L.palavra_ativa.cor && b.palavras.length > 1) {
        let idxGlobal = 0;
        b.linhas.forEach((ln, i) => {
          const y = yBase + i * lh;
          const pals = ln.split(" ");
          pals.forEach((p, k) => {
            const w = b.palavras[idxGlobal + k];
            if (!w) return;
            const prox = b.palavras[idxGlobal + k + 1];
            const isFirst = idxGlobal + k === 0;
            const a = isFirst ? b.t0 : Math.max(b.t0, w.t);
            const z = Math.min(b.t1, prox ? prox.t : b.t1);
            if (z <= a) return;
            const txt = pals.map((q, j) => (j === k ? `{\\1c${corAss(L.palavra_ativa.cor)}}${esc(q)}{\\1c${corAss(estLeg.cor)}}` : esc(q))).join(" ");
            eventos.push(...eventosTexto({ texto: ln, x: L.centro_x || W / 2, y, t0: a, t1: z, est: estLeg, entrada: isFirst ? L.entrada : { tipo: "corte_seco" }, camada: 1, prefixoTexto: () => txt }));
          });
          idxGlobal += pals.length;
        });
      }
      // destaque na linha de baixo, entrando quando a palavra é falada
      if (b.destaque) {
        const cfg = b.destaque.cfg;
        const est = resolverEstilo(cfg, fontes, P);
        const yUlt = yBase + (n - 1) * lh;
        const y = n === 0 ? (cfg.centro_y || L.centro_y)
          : cfg.centro_y && n <= 1 ? cfg.centro_y
          : yUlt + (estLeg.em * 0.72) / 2 + (cfg.espaco_px != null ? cfg.espaco_px : 10) + (est.em * 0.72) / 2 + (estLeg.em * 0.2);
        let tx = aplicarCaixa(b.destaque.texto, cfg.caixa, L.maiusculas_sempre);
        if (L.sem_pontuacao_final) tx = semPontuacaoFinal(tx);
        const ent = { ...(cfg.entrada || {}) };
        let tIn = b.destaque.t0;
        if (cfg.sincronia === "depois_da_branca") {
          tIn = b.t0;
          if (ent.tipo === "maquina_escrever") ent.inicio_ms = Math.round(((L.entrada && L.entrada.dur) || 0.3) * 1000);
        }
        eventos.push(...eventosTexto({ texto: tx, x: W / 2, y, t0: Math.max(b.t0, tIn), t1: b.t1, est, entrada: ent, camada: 1 }));
        b.destaqueTexto = tx;
      }
    }
  }

  const header = [
    "[Script Info]",
    "; gerado por motor_padrao/lib/legenda_ass.js",
    "ScriptType: v4.00+",
    `PlayResX: ${W}`,
    `PlayResY: ${H}`,
    "WrapStyle: 2",
    "ScaledBorderAndShadow: yes",
    "YCbCr Matrix: TV.709",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    "Style: Base,Arial,60,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,5,0,0,0,1",
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"
  ].join("\n");

  return {
    ass: header + "\n" + eventos.join("\n") + "\n",
    blocos: blocosOut.map((b) => ({ t0: r2(b.t0), t1: r2(b.t1), linhas: b.linhas, destaque: b.destaqueTexto || null })),
    avisos,
    // arquivos .ttf que o ASS usa: copie TODOS para a pasta passada em fontsdir=
    fontes: fontes._usadas ? [...fontes._usadas] : Object.values(fontes).map((f) => f.info.arquivo)
  };
}

module.exports = { gerarAss, localizarFrase, aplicarCaixa, carregarFontes, resolverEstilo, assTime, corAss, normPalavra };
