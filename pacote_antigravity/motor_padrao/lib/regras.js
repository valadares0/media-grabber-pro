// =========================================================================
// regras.js — aplica as regras do padrão no PLANO de edição, sem depender da
// IA lembrar. A IA (Gemini) só SUGERE momentos; este módulo decide tempos,
// durações e posições e devolve avisos. Generaliza o gaia_regras.py.
//
// plano = {
//   broll:     [{arquivo, id?, t0, t1, in?, modo?, vertical?}],
//   elementos: [{id?, arquivo, t0, t1?, largura_px, centro_x?, centro_y, esconde_legenda?, hold?, entrada?}],
//   zoom:      [{t0, t1, de, ate?}],
//   flashes:   [t],
//   titulos:   [{texto, linha2?, t0, t1}],
//   destaques: [{id, texto, perto?}],
//   numeros:   [{texto, linha2?, t0, t1}]
// }
// =========================================================================
"use strict";

const { proibidosNormalizados, asset } = require("./padrao");
const { localizarFrase } = require("./legenda_ass");

const r3 = (n) => Math.round(n * 1000) / 1000;

function proximoCorte(cortes, t, folga = 0.05) {
  return cortes.find((c) => c > t + folga);
}

/** Elementos da biblioteca que entram sozinhos quando a pessoa fala o gatilho. */
function elementosPorGatilho(padrao, palavras, cortes, fimFala) {
  const out = [];
  for (const e of padrao.elementos.biblioteca || []) {
    for (const g of e.gatilhos || []) {
      let ultimoFim = -1;
      for (let i = 0; i < palavras.length; i++) {
        const sub = palavras.slice(i, i + g.split(/\s+/).length + 1);
        const loc = localizarFrase(sub, g);
        if (!loc || loc.i0 !== 0) continue;
        const t0 = palavras[i].t;
        if (t0 < ultimoFim) continue;
        const t1 = Math.min(proximoCorte(cortes, t0) || t0 + 3, t0 + 4, fimFala);
        out.push({ id: e.id, arquivo: asset(padrao, e.arquivo), t0: r3(t0), t1: r3(t1), largura_px: e.largura_px, centro_x: e.centro_x, centro_y: e.centro_y, esconde_legenda: e.esconde_legenda, entrada: e.entrada, origem: `gatilho "${g}"` });
        ultimoFim = t1;
      }
    }
  }
  return out.sort((a, b) => a.t0 - b.t0);
}

/** Zoom no corte, alternando os níveis, nunca mais perto que intervalo_min_s. */
function zoomAutomatico(padrao, cortes, fimFala) {
  const Z = padrao.camera.zoom;
  if (Z.modo !== "no_corte_alternado") return [];
  const niveis = Z.niveis && Z.niveis.length ? Z.niveis : [1.0, 1.2];
  const marcas = [0];
  for (const c of cortes) if (c - marcas[marcas.length - 1] >= Z.intervalo_min_s && c < fimFala - 0.5) marcas.push(c);
  return marcas.map((t0, i) => ({ t0, t1: i + 1 < marcas.length ? marcas[i + 1] : fimFala, de: niveis[i % niveis.length], ate: niveis[i % niveis.length] }));
}

/**
 * Aplica todas as regras. Devolve { plano, ocultarLegenda, avisos }.
 * @param {object} o { padrao, plano, palavras, cortes, fimFala, usadosBroll:Set }
 */
function aplicarRegras(o) {
  const P = o.padrao;
  const cortes = [...(o.cortes || [])].sort((a, b) => a - b);
  const fim = o.fimFala;
  const avisos = [];
  const plano = JSON.parse(JSON.stringify(o.plano || {}));
  plano.broll = plano.broll || [];
  plano.elementos = plano.elementos || [];
  plano.zoom = plano.zoom || [];
  plano.flashes = plano.flashes || [];
  plano.titulos = plano.titulos || [];
  plano.destaques = plano.destaques || [];
  plano.numeros = plano.numeros || [];

  // ---------- títulos ----------
  const TG = P.titulo_gancho;
  for (const t of plano.titulos) {
    if (TG.duracao_s) {
      const d = t.t1 - t.t0;
      if (d < TG.duracao_s.min) t.t1 = Math.min(fim, t.t0 + TG.duracao_s.min);
      if (d > TG.duracao_s.max) t.t1 = t.t0 + TG.duracao_s.max;
    }
  }

  // ---------- B-roll ----------
  const B = P.broll;
  if (!B.ativo && plano.broll.length) { avisos.push("B-roll pedido, mas broll.ativo = false no padrão: ignorado."); plano.broll = []; }
  const bloqueiosTitulo = (B.nao_junto_com || []).includes("titulo_gancho") ? plano.titulos.map((t) => [t.t0, t.t1]) : [];
  let brolls = plano.broll.sort((a, b) => a.t0 - b.t0);
  for (const b of brolls) {
    // modo
    if (!b.modo) b.modo = B.modo === "faixa_topo_ou_tela_cheia" ? "faixa_topo" : B.modo;
    if (b.vertical && b.modo === "faixa_topo" && B.vertical_vai_para === "tela_cheia") {
      b.modo = "tela_cheia";
      avisos.push(`B-roll ${b.id || b.arquivo}: clipe vertical -> tela cheia (regra do padrão).`);
    }
    // não junto com título: começa depois do título
    for (const [a, z] of bloqueiosTitulo) {
      if (b.t0 < z && b.t1 > a) {
        avisos.push(`B-roll ${b.id || b.arquivo} em ${b.t0.toFixed(2)}s batia com o título: movido para ${z.toFixed(2)}s.`);
        const d = b.t1 - b.t0; b.t0 = z; b.t1 = z + d;
      }
    }
    if (o.usadosBroll && b.id && o.usadosBroll.has(b.id) && B.nao_repetir_entre_videos) {
      avisos.push(`B-roll ${b.id} já foi usado em outro vídeo (cena REPETIDA).`);
    }
  }
  // duração mínima/máxima (estende o fim; se não cabe, começa antes — como o editor fez no Gaia)
  brolls = brolls.sort((a, b) => a.t0 - b.t0);
  brolls.forEach((b, i) => {
    const antes = b.t1 - b.t0;
    const prox = Math.min(brolls[i + 1] ? brolls[i + 1].t0 : fim, ...bloqueiosTitulo.map(([a]) => a).filter((a) => a > b.t0 + 1e-3), fim);
    if (antes < B.duracao_s.min) {
      b.t1 = Math.min(b.t0 + B.duracao_s.min, prox);
      if (b.t1 - b.t0 < B.duracao_s.min) {
        const ant = i > 0 ? brolls[i - 1].t1 : 0;
        const novo0 = Math.max(ant, b.t1 - B.duracao_s.min);
        b.in = Math.max(0, (b.in || 0) - (b.t0 - novo0));
        b.t0 = novo0;
      }
    }
    if (b.t1 - b.t0 > B.duracao_s.max) b.t1 = b.t0 + B.duracao_s.max;
    b.t0 = r3(b.t0); b.t1 = r3(Math.min(b.t1, fim));
    if (Math.abs(b.t1 - b.t0 - antes) > 0.01) avisos.push(`B-roll ${b.id || b.arquivo}: ${antes.toFixed(2)}s -> ${(b.t1 - b.t0).toFixed(2)}s.`);
    if (b.t1 - b.t0 < B.duracao_s.min - 0.01) avisos.push(`B-roll ${b.id || b.arquivo}: só cabe ${(b.t1 - b.t0).toFixed(2)}s (mín. ${B.duracao_s.min}s).`);
  });
  // cobertura máxima
  const cobertura = () => brolls.reduce((a, b) => a + (b.t1 - b.t0), 0) / Math.max(1, fim);
  while (brolls.length && cobertura() * 100 > B.cobertura_max_pct + 0.5) {
    const tirado = brolls.pop();
    avisos.push(`B-roll ${tirado.id || tirado.arquivo} removido: cobertura passaria de ${B.cobertura_max_pct}%.`);
  }
  plano.broll = brolls;

  // ---------- elementos ----------
  const E = P.elementos;
  const proibidos = proibidosNormalizados(P);
  plano.elementos = plano.elementos.sort((a, b) => a.t0 - b.t0);
  for (const el of plano.elementos) {
    if (E.regra === "entra_na_fala_sai_no_corte" && !el.hold) {
      const c = proximoCorte(cortes, el.t0);
      if (!el.t1 || (c && el.t1 > c)) el.t1 = c || el.t1 || Math.min(fim, el.t0 + 3);
    }
    el.t1 = Math.min(el.t1, fim);
    const ent = el.entrada || E.entrada;
    if (ent && proibidos.has(ent.tipo)) {
      avisos.push(`elemento ${el.id || el.arquivo}: entrada "${ent.tipo}" é proibida neste cliente -> trocada por corte_seco.`);
      el.entrada = { tipo: "corte_seco" };
    }
  }
  // máximo simultâneo
  for (let i = 0; i < plano.elementos.length; i++) {
    const el = plano.elementos[i];
    const juntos = plano.elementos.filter((x) => x !== el && x.t0 < el.t1 && x.t1 > el.t0 && x.t0 <= el.t0);
    if (juntos.length >= E.max_simultaneos) {
      avisos.push(`elemento ${el.id || el.arquivo} em ${el.t0}s removido: passaria de ${E.max_simultaneos} na tela.`);
      plano.elementos.splice(i, 1); i--;
    }
  }
  const ocultarLegenda = plano.elementos.filter((e) => e.esconde_legenda).map((e) => [e.t0, e.t1]);

  // ---------- zoom ----------
  const Z = P.camera.zoom;
  if (!plano.zoom.length) plano.zoom = zoomAutomatico(P, cortes, fim);
  else {
    const zs = []; let ult = null;
    for (const z of plano.zoom.sort((a, b) => a.t0 - b.t0)) {
      if (ult != null && z.t0 - ult < Z.intervalo_min_s) { avisos.push(`zoom em ${z.t0.toFixed(2)}s removido (menos de ${Z.intervalo_min_s}s do anterior).`); continue; }
      if (Z.modo === "no_corte_alternado" && (z.de === z.ate || z.ate == null) && !cortes.some((c) => Math.abs(c - z.t0) < 0.08) && z.t0 > 0.05) {
        avisos.push(`zoom em ${z.t0.toFixed(2)}s não está num corte (o padrão troca o zoom JUNTO com o corte).`);
      }
      if (proibidos.has("punch_in") && z.de !== z.ate && z.t1 - z.t0 < 0.3) avisos.push(`zoom em ${z.t0}s parece punch-in (proibido).`);
      zs.push(z); ult = z.t0;
    }
    plano.zoom = zs;
  }
  if (Z.lento && Z.lento.max_por_video) {
    const lentos = plano.zoom.filter((z) => z.ate != null && z.de !== z.ate);
    if (lentos.length > Z.lento.max_por_video) avisos.push(`${lentos.length} zooms lentos (máx. ${Z.lento.max_por_video}).`);
  }

  // ---------- flash ----------
  const FL = P.transicoes.flash;
  plano.flashes = plano.flashes.map((t) => {
    const c = cortes.reduce((m, x) => (Math.abs(x - t) < Math.abs(m - t) ? x : m), Infinity);
    return Math.abs(c - t) <= 0.2 ? c : t;
  }).slice(0, FL.max_por_video != null ? FL.max_por_video : 2);
  if ((o.plano.flashes || []).length > plano.flashes.length) avisos.push(`flashes cortados para ${plano.flashes.length} (máx. do padrão).`);

  // ---------- frequência de destaques ----------
  const minutos = Math.max(0.25, fim / 60);
  for (const d of P.destaques || []) {
    const qtd = plano.destaques.filter((x) => x.id === d.id).length;
    if (d.freq_por_video && (qtd < d.freq_por_video.min || qtd > d.freq_por_video.max)) {
      avisos.push(`destaque "${d.id}": ${qtd} no vídeo (padrão: ${d.freq_por_video.min}–${d.freq_por_video.max}).`);
    }
  }
  if (P.regras_destaque && P.regras_destaque.freq_por_minuto) {
    const f = plano.destaques.length / minutos, fr = P.regras_destaque.freq_por_minuto;
    if (f < fr.min || f > fr.max) avisos.push(`${f.toFixed(1)} destaques/min (padrão ${fr.min}–${fr.max}).`);
  }
  if (P.regras_destaque && P.regras_destaque.nunca_mesmo_tipo_seguido) {
    const ord = [...plano.destaques].sort((a, b) => (a.perto || 0) - (b.perto || 0));
    for (let i = 1; i < ord.length; i++) if (ord[i].id === ord[i - 1].id) avisos.push(`dois destaques "${ord[i].id}" seguidos (o padrão alterna os tipos).`);
  }

  // ---------- ritmo: "algo novo a cada N s" ----------
  const R = P.ritmo;
  const novidades = [0, ...cortes, ...plano.broll.map((b) => b.t0), ...plano.elementos.map((e) => e.t0), ...plano.titulos.map((t) => t.t0), ...plano.zoom.map((z) => z.t0), ...plano.flashes]
    .filter((t) => t <= fim).sort((a, b) => a - b);
  for (let i = 1; i < novidades.length; i++) {
    const gap = novidades[i] - novidades[i - 1];
    if (gap > R.novidade_a_cada_s.max + 0.5) avisos.push(`ritmo: ${gap.toFixed(1)}s sem nada novo entre ${novidades[i - 1].toFixed(1)}s e ${novidades[i].toFixed(1)}s (padrão: a cada ${R.novidade_a_cada_s.min}–${R.novidade_a_cada_s.max}s).`);
  }
  if (R.duracao_alvo_s && (fim < R.duracao_alvo_s.min || fim > R.duracao_alvo_s.max)) {
    avisos.push(`duração da fala ${fim.toFixed(1)}s fora do alvo ${R.duracao_alvo_s.min}–${R.duracao_alvo_s.max}s.`);
  }
  return { plano, ocultarLegenda, avisos };
}

module.exports = { aplicarRegras, elementosPorGatilho, zoomAutomatico };
