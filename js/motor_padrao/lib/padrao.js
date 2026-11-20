// =========================================================================
// padrao.js — o "Padrão de Edição v2" de um cliente.
//
// Um padrão é um JSON com MEDIDAS (px, s, hex), nunca adjetivos. A IA (Gemini)
// pode PROPOR um padrão a partir de PDF/referência, mas quem garante que ele é
// aplicável é este módulo: completa com padrões, valida, aplica as correções do
// editor (que valem mais que tudo) e recusa motion que não existe no catálogo.
//
// Uso:
//   const { carregarPadrao } = require("./padrao");
//   const { padrao, erros, avisos } = carregarPadrao("padroes/daniel_gaia/padrao.json");
// =========================================================================
"use strict";

const fs = require("fs");
const path = require("path");

// -------------------------------------------------------------------------
// CATÁLOGO DE MOTION — a ÚNICA lista de animações que o motor sabe fazer.
// O padrão só pode citar nomes daqui. Se o PDF pedir algo fora do catálogo,
// o importador grava em "pendencias" (nunca inventa).
// Cada item: parâmetros padrão + onde é usado + como é implementado.
// -------------------------------------------------------------------------
const CATALOGO_MOTION = {
  // ---- entrada de TEXTO e ELEMENTO ----
  corte_seco:      { tipo: "entrada", params: {}, impl: "aparece inteiro no quadro (sem tag)" },
  fade:            { tipo: "entrada", params: { dur: 0.2 }, impl: "ASS \\fad(dur,0) | ffmpeg fade=in:alpha=1" },
  pop:             { tipo: "entrada", params: { de: 0.85, dur: 0.15 }, impl: "escala de→1,00" },
  pop_rebote:      { tipo: "entrada", params: { de: 0.7, pico: 1.08, dur: 0.3, giro: -6 }, impl: "escala de→pico→1,00 + giro→0" },
  crescer:         { tipo: "entrada", params: { de: 0.6, dur: 0.3 }, impl: "escala de→1,00 + fade, freando (sem passar do tamanho)" },
  desfoque_foco:   { tipo: "entrada", params: { blur: 12, dur: 0.3 }, impl: "desfoque→nítido + fade" },
  sobe_fade:       { tipo: "entrada", params: { dy: 40, dur: 0.27 }, impl: "sobe dy px + fade" },
  maquina_escrever:{ tipo: "entrada", params: { dur: 0.3 }, impl: "letra a letra com fade (texto)" },
  slam:            { tipo: "entrada", params: { de: 1.6, blur: 8, dur: 0.4 }, impl: "entra enorme e desfocado e assenta" },
  palavra_por_palavra: { tipo: "entrada", params: {}, impl: "cada palavra aparece quando é falada" },
  conta_numero:    { tipo: "entrada", params: { dur: 0.8 }, impl: "número conta de 0 até o valor" },
  // ---- saída ----
  sai_no_corte:    { tipo: "saida", params: {}, impl: "some no corte, sem animação" },
  fade_saida:      { tipo: "saida", params: { dur: 0.2 }, impl: "fade de saída" },
  // ---- câmera ----
  zoom_no_corte:   { tipo: "camera", params: { niveis: [1.0, 1.2] }, impl: "troca de escala JUNTO com o corte da fala" },
  zoom_lento:      { tipo: "camera", params: { de: 1.0, ate: 1.26, dur: 3.5 }, impl: "keyframe linear dentro de um trecho" },
  punch_in:        { tipo: "camera", params: { escala: 1.14 }, impl: "pulo de escala NO MEIO da fala (sem corte)" },
  // ---- transição ----
  flash:           { tipo: "transicao", params: { cor: "#FFFFFF", quadros: 2 }, impl: "tela cheia da cor por N quadros no corte" },
  dissolve:        { tipo: "transicao", params: { dur: 0.2 }, impl: "xfade dissolve" },
  // ---- planejados (ainda NÃO implementados: o validador avisa) ----
  whip:            { tipo: "transicao", params: { dur: 0.2 }, impl: "PLANEJADO", planejado: true },
  brilho_passando: { tipo: "entrada", params: { dur: 0.6 }, impl: "PLANEJADO", planejado: true }
};

// Nomes que aparecem nos PDFs como PROIBIDOS -> nomes do catálogo (para o validador pegar).
const SINONIMOS_PROIBIDOS = {
  quique: ["pop_rebote"], rebote: ["pop_rebote"], "zoom punch": ["punch_in"], punch: ["punch_in"],
  "palavra a palavra": ["palavra_por_palavra"], "palavra-a-palavra": ["palavra_por_palavra"],
  "texto pulando": ["palavra_por_palavra"], balanco: [], balanço: [], tremida: [], glitch: [], neon: [],
  brilho: ["brilho_passando"], "3d": [], grao: [], grão: [], emoji: [], "caixa pulsando": []
};

// -------------------------------------------------------------------------
// VALORES PADRÃO (só preenchem o que o padrão do cliente não disse)
// -------------------------------------------------------------------------
const PADRAO_BASE = {
  versao_schema: 2,
  canvas: { w: 1080, h: 1920, fps: 30 },
  fontes: {},
  cores: {},
  zonas_proibidas: [
    { nome: "UI topo Instagram", x0: 0, y0: 0, x1: 1080, y1: 220 },
    { nome: "UI base Instagram", x0: 0, y0: 1700, x1: 1080, y1: 1920 },
    { nome: "botões à direita", x0: 960, y0: 900, x1: 1080, y1: 1700 }
  ],
  legenda: {
    ativa: true, fonte: null, peso: 700, tamanho_px: 60, cor: "#FFFFFF", caixa: "original",
    sem_pontuacao_final: true, ancora: "centro_bloco", centro_y: 1400, centro_x: 540,
    largura_max_px: 900, max_linhas: 2, entrelinha: 1.15, espacamento_letras_px: 0,
    palavras_por_bloco: { min: 1, max: 4 }, max_caracteres: 28, quebra_em_pausa_s: 0.35,
    entrada: { tipo: "corte_seco" }, saida: { tipo: "sai_no_corte" },
    palavra_ativa: { modo: "nenhum", cor: null },
    sombra: { cor: "#000000", opacidade: 0.6, dx: 3, dy: 4, desfoque: 2 },
    contorno: null, caixa_fundo: null,
    manter_fala_original: true, nao_repetir_destaque: true, maiusculas_sempre: []
  },
  destaques: [],
  titulo_gancho: { ativo: false },
  numeros: { ativo: false },
  logo: { ativo: false },
  elementos: { regra: "entra_na_fala_sai_no_corte", max_simultaneos: 2, entrada: { tipo: "corte_seco" }, biblioteca: [] },
  broll: {
    ativo: false, pasta: null, modo: "tela_cheia",
    faixa: { y0: 0, y1: 760, esfumado_px: 80, atras_do_logo: true },
    vertical_vai_para: "tela_cheia", duracao_s: { min: 1.5, max: 4 }, cobertura_max_pct: 40,
    intervalo_min_s: 1.0, entra: "na_palavra", legenda_continua: true,
    nao_junto_com: ["titulo_gancho"], nao_repetir_entre_videos: true,
    conferir: ["texto_queimado", "marca_dagua", "tarja_preta", "pessoa_cortada"], ia_gerada_permitida: false
  },
  camera: { zoom: { modo: "nenhum", niveis: [1.0, 1.2], intervalo_min_s: 2.5, lento: null }, enquadrar_rosto: true },
  ritmo: { novidade_a_cada_s: { min: 2, max: 6 }, cortar_pausas_acima_s: 0.3, duracao_alvo_s: { min: 15, max: 60 }, gancho_max_s: 3 },
  transicoes: { padrao: "corte_seco", flash: { cor: "#FFFFFF", quadros: 2, max_por_video: 2 }, dissolve_s: 0.2 },
  fechamento: { ativo: false },
  audio: { lufs: -14, voz_limpa: true, musica: { ativa: false }, sfx: {} },
  motions_permitidos: null, // null = todo o catálogo implementado
  motions_proibidos: [],
  checklist: [],
  correcoes: [],
  proveniencia: {},
  pendencias: []
};

// -------------------------------------------------------------------------
function ehObjeto(v) { return v && typeof v === "object" && !Array.isArray(v); }

function mesclar(base, extra) {
  if (!ehObjeto(base) || !ehObjeto(extra)) return extra === undefined ? base : extra;
  const out = { ...base };
  for (const k of Object.keys(extra)) {
    out[k] = ehObjeto(base[k]) && ehObjeto(extra[k]) ? mesclar(base[k], extra[k]) : extra[k];
  }
  return out;
}

function lerCaminho(obj, caminho) {
  return caminho.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function gravarCaminho(obj, caminho, valor) {
  const partes = caminho.split(".");
  let o = obj;
  for (let i = 0; i < partes.length - 1; i++) {
    const k = partes[i];
    if (/^\d+$/.test(partes[i + 1]) && !Array.isArray(o[k])) o[k] = o[k] || [];
    else if (o[k] == null || typeof o[k] !== "object") o[k] = {};
    o = o[k];
  }
  o[partes[partes.length - 1]] = valor;
}

/**
 * Correções do editor valem MAIS que o PDF. Cada correção com "campo" + "valor"
 * é gravada por cima do padrão, em ordem de data (a mais nova vence).
 * Correções só com "regra" (texto) ficam para a IA ler e para regras.js aplicar.
 */
function aplicarCorrecoes(p) {
  const lista = [...(p.correcoes || [])].sort((a, b) => String(a.data || "").localeCompare(String(b.data || "")));
  for (const c of lista) {
    if (c.campo && c.valor !== undefined) {
      gravarCaminho(p, c.campo, c.valor);
      p.proveniencia[c.campo] = `correção ${c.data || ""} ${c.origem || ""}`.trim();
    }
  }
  return p;
}

function normalizar(raw) {
  const p = mesclar(JSON.parse(JSON.stringify(PADRAO_BASE)), raw || {});
  // compatibilidade: tamanho em "px" pode vir como string "60px"
  const numerar = (o, k) => { if (o && typeof o[k] === "string") o[k] = parseFloat(o[k]); };
  numerar(p.legenda, "tamanho_px");
  numerar(p.legenda, "centro_y");
  // escala proporcional se o canvas não for 1080x1920 e as medidas vierem em 1080x1920
  return aplicarCorrecoes(p);
}

function hexValido(h) { return typeof h === "string" && /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(h); }

/** Todos os motions que o padrão usa (para conferir com permitidos/proibidos). */
function motionsUsados(p) {
  const usados = [];
  const add = (onde, m) => { if (m && m.tipo) usados.push({ onde, nome: m.tipo }); };
  add("legenda.entrada", p.legenda.entrada);
  add("legenda.saida", p.legenda.saida);
  if (p.legenda.palavra_ativa && p.legenda.palavra_ativa.modo === "palavra_por_palavra") usados.push({ onde: "legenda.palavra_ativa", nome: "palavra_por_palavra" });
  (p.destaques || []).forEach((d, i) => add(`destaques[${i}].entrada`, d.entrada));
  if (p.titulo_gancho.ativo) add("titulo_gancho.entrada", p.titulo_gancho.entrada);
  if (p.numeros.ativo) add("numeros.entrada", p.numeros.entrada);
  add("elementos.entrada", p.elementos.entrada);
  (p.elementos.biblioteca || []).forEach((e, i) => add(`elementos.biblioteca[${i}].entrada`, e.entrada));
  if (p.camera.zoom.modo === "no_corte_alternado") usados.push({ onde: "camera.zoom", nome: "zoom_no_corte" });
  if (p.camera.zoom.modo === "punch_in") usados.push({ onde: "camera.zoom", nome: "punch_in" });
  if (p.camera.zoom.lento) usados.push({ onde: "camera.zoom.lento", nome: "zoom_lento" });
  if (p.fechamento.ativo && p.fechamento.animacao) add("fechamento.animacao", p.fechamento.animacao);
  if (p.fechamento.ativo && p.fechamento.entrada) add("fechamento.entrada", p.fechamento.entrada);
  return usados;
}

function proibidosNormalizados(p) {
  const out = new Set();
  for (const raw of p.motions_proibidos || []) {
    const k = String(raw).toLowerCase().trim();
    if (CATALOGO_MOTION[k]) out.add(k);
    for (const s of SINONIMOS_PROIBIDOS[k] || []) out.add(s);
  }
  return out;
}

/**
 * Valida o padrão. ERRO = o motor não pode renderizar; AVISO = renderiza, mas pode sair diferente.
 * @param {object} p padrão normalizado
 * @param {object} opts { baseDir, conferirArquivos: true }
 */
function validar(p, opts = {}) {
  const erros = [], avisos = [];
  const { w: W, h: H } = p.canvas;
  const baseDir = opts.baseDir || ".";
  const existe = (arq) => !arq || fs.existsSync(path.resolve(baseDir, arq));

  if (p.versao_schema !== 2) erros.push("versao_schema deve ser 2.");
  if (!p.id || !/^[a-z0-9_]+$/.test(p.id)) erros.push("id obrigatório, só a-z 0-9 _ (ex.: daniel_gaia).");

  // fontes
  for (const [id, f] of Object.entries(p.fontes || {})) {
    if (!f.arquivo) erros.push(`fontes.${id}: falta "arquivo" (.ttf). Sem o arquivo, o ffmpeg troca a fonte em silêncio.`);
    else if (opts.conferirArquivos !== false && !existe(f.arquivo)) erros.push(`fontes.${id}: arquivo não encontrado: ${f.arquivo}`);
  }
  const fonteExiste = (id, onde) => {
    if (!id) { erros.push(`${onde}: falta "fonte" (id de uma entrada em "fontes").`); return; }
    if (!p.fontes[id]) erros.push(`${onde}: fonte "${id}" não está em "fontes".`);
  };

  // legenda
  const L = p.legenda;
  if (L.ativa) {
    fonteExiste(L.fonte, "legenda");
    if (!(L.tamanho_px >= 20 && L.tamanho_px <= 250)) erros.push(`legenda.tamanho_px fora do razoável: ${L.tamanho_px}`);
    if (!(L.centro_y > 0 && L.centro_y < H)) erros.push(`legenda.centro_y fora da tela: ${L.centro_y}`);
    if (!hexValido(L.cor)) erros.push(`legenda.cor inválida: ${L.cor}`);
    if (!["alta", "baixa", "original"].includes(L.caixa)) erros.push(`legenda.caixa deve ser alta|baixa|original`);
    if (L.largura_max_px > W) erros.push("legenda.largura_max_px maior que a tela.");
    if (L.palavras_por_bloco.min > L.palavras_por_bloco.max) erros.push("legenda.palavras_por_bloco: min > max.");
    for (const z of p.zonas_proibidas || []) {
      const meia = (L.tamanho_px * L.max_linhas * L.entrelinha) / 2;
      if (L.centro_y + meia > z.y0 && L.centro_y - meia < z.y1 && z.x0 <= L.centro_x && z.x1 >= L.centro_x) {
        avisos.push(`legenda (y ${L.centro_y}) invade a zona proibida "${z.nome}".`);
      }
    }
    if (L.palavra_ativa && L.palavra_ativa.modo === "escala") {
      erros.push("legenda.palavra_ativa.modo 'escala' foi removido: mudar o tamanho da palavra faz a linha 'pular'. Use 'cor' ou 'nenhum'.");
    }
  }
  (p.destaques || []).forEach((d, i) => {
    const onde = `destaques[${i}]`;
    if (!d.id) erros.push(`${onde}: falta id.`);
    fonteExiste(d.fonte, onde);
    if (!hexValido(d.cor || "")) erros.push(`${onde}: cor inválida.`);
    if (!["linha_abaixo_da_legenda", "substitui_legenda", "topo", "lado_da_cabeca"].includes(d.posicao)) {
      erros.push(`${onde}: posicao deve ser linha_abaixo_da_legenda|substitui_legenda|topo|lado_da_cabeca.`);
    }
  });
  if (p.titulo_gancho.ativo) {
    fonteExiste(p.titulo_gancho.fonte, "titulo_gancho");
    if (!p.titulo_gancho.centro_y) erros.push("titulo_gancho.centro_y obrigatório.");
  }
  if (p.numeros.ativo) fonteExiste(p.numeros.fonte, "numeros");

  // logo / elementos / fechamento: arquivos
  if (p.logo.ativo && !p.logo.tela_cheia && p.logo.centro_y) {
    for (const z of p.zonas_proibidas || []) {
      const cx = p.logo.centro_x || W / 2;
      if (p.logo.centro_y > z.y0 && p.logo.centro_y < z.y1 && cx >= z.x0 && cx <= z.x1) {
        avisos.push(`logo (centro y ${p.logo.centro_y}) está dentro da zona proibida "${z.nome}".`);
      }
    }
  }
  if (p.logo.ativo) {
    if (!p.logo.arquivo) erros.push("logo.arquivo obrigatório (PNG com transparência).");
    else if (opts.conferirArquivos !== false && !existe(p.logo.arquivo)) erros.push(`logo: não achei ${p.logo.arquivo}`);
    if (!p.logo.largura_px || !p.logo.centro_y) erros.push("logo: largura_px e centro_y obrigatórios (medidos em 1080x1920).");
  }
  (p.elementos.biblioteca || []).forEach((e, i) => {
    if (!e.arquivo) erros.push(`elementos.biblioteca[${i}] (${e.id}): falta arquivo.`);
    else if (opts.conferirArquivos !== false && !existe(e.arquivo)) erros.push(`elemento ${e.id}: não achei ${e.arquivo}`);
    if (!e.gatilhos || !e.gatilhos.length) avisos.push(`elemento ${e.id}: sem "gatilhos" (palavras faladas que fazem ele entrar).`);
  });
  if (p.fechamento.ativo && p.fechamento.logo && opts.conferirArquivos !== false && !existe(p.fechamento.logo)) {
    erros.push(`fechamento: não achei ${p.fechamento.logo}`);
  }
  if (p.broll.ativo) {
    if (p.broll.duracao_s.min > p.broll.duracao_s.max) erros.push("broll.duracao_s: min > max.");
    if (!["faixa_topo", "tela_cheia", "faixa_topo_ou_tela_cheia"].includes(p.broll.modo)) erros.push("broll.modo inválido.");
    if (p.broll.ia_gerada_permitida) avisos.push("broll.ia_gerada_permitida = true: cliente real normalmente NÃO aceita imagem gerada como prova.");
  }

  // motions
  const proibidos = proibidosNormalizados(p);
  for (const u of motionsUsados(p)) {
    const cat = CATALOGO_MOTION[u.nome];
    if (!cat) erros.push(`${u.onde}: motion "${u.nome}" não existe no catálogo (${Object.keys(CATALOGO_MOTION).join(", ")}).`);
    else if (cat.planejado) avisos.push(`${u.onde}: motion "${u.nome}" ainda não foi implementado no motor (sai como corte_seco).`);
    if (proibidos.has(u.nome)) erros.push(`${u.onde}: usa "${u.nome}", que este cliente PROÍBE.`);
    if (p.motions_permitidos && !p.motions_permitidos.includes(u.nome)) erros.push(`${u.onde}: "${u.nome}" não está em motions_permitidos.`);
  }

  for (const c of p.correcoes || []) {
    if (c.campo && lerCaminho(p, c.campo) === undefined) avisos.push(`correção ${c.data}: campo "${c.campo}" não existe no padrão.`);
  }
  if ((p.pendencias || []).length) avisos.push(`${p.pendencias.length} pendência(s) para confirmar com o usuário: ${p.pendencias.join(" | ")}`);
  return { erros, avisos };
}

/** Lê padrao.json, normaliza, valida. baseDir = pasta do padrão (onde está "assets/"). */
function carregarPadrao(arquivo, opts = {}) {
  const raw = JSON.parse(fs.readFileSync(arquivo, "utf8"));
  const padrao = normalizar(raw);
  const baseDir = opts.baseDir || path.dirname(path.resolve(arquivo));
  const { erros, avisos } = validar(padrao, { ...opts, baseDir });
  padrao._baseDir = baseDir;
  return { padrao, erros, avisos };
}

/** Caminho absoluto de um asset do padrão. */
function asset(padrao, rel) {
  if (!rel) return null;
  return path.isAbsolute(rel) ? rel : path.resolve(padrao._baseDir || ".", rel);
}

/**
 * Migra o perfil antigo da extensão (customStyle de ~/.mediagrabber/clients/*.json) para v2.
 * O resultado SEMPRE sai com pendências, porque o perfil antigo não tinha medidas reais.
 */
function migrarPerfilV1(v1) {
  const cs = v1.customStyle || {};
  const id = String(v1.id || v1.name || "cliente").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  return {
    versao_schema: 2,
    id,
    nome: v1.name || id,
    descricao: v1.description || "",
    fontes: { principal: { arquivo: `assets/${(cs.font || "Fonte").replace(/\s+/g, "")}.ttf`, peso: 800 } },
    legenda: {
      ativa: v1.style !== "none",
      fonte: "principal",
      tamanho_px: Number(cs.fontSize) || 70,
      cor: cs.primaryColor || "#FFFFFF",
      caixa: cs.uppercase === false ? "original" : "alta",
      centro_y: Math.round(1920 * (1 - (cs.marginVPct != null ? cs.marginVPct : 0.28))),
      palavras_por_bloco: { min: 1, max: Number(cs.wordsPerLine) || 3 },
      contorno: cs.outlineWidth ? { cor: "#000000", largura: Number(cs.outlineWidth) } : null,
      palavra_ativa: cs.highlightColor ? { modo: "cor", cor: cs.highlightColor } : { modo: "nenhum" }
    },
    camera: { zoom: { modo: "nenhum", lento: v1.dynamic ? { de: 1.0, ate: 1 + (Number(v1.zoomStrength) || 0.06), dur: null } : null } },
    pendencias: [
      "Perfil migrado da v1: tamanho, posição e fonte NÃO foram medidos. Rode medir_referencia.js num vídeo aprovado.",
      `Envie o arquivo .ttf da fonte "${cs.font || "?"}" para assets/.`
    ]
  };
}

module.exports = {
  CATALOGO_MOTION, PADRAO_BASE, normalizar, validar, carregarPadrao, aplicarCorrecoes,
  motionsUsados, proibidosNormalizados, asset, migrarPerfilV1, lerCaminho, gravarCaminho, mesclar
};
