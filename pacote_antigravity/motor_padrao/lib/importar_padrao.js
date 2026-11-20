// =========================================================================
// importar_padrao.js — PDF / referências -> Padrão v2, SEM deixar a IA "inventar".
//
// Por que o importador antigo falhava: pedia ao Gemini o JSON final de 11
// campos. Tudo que o PDF dizia e não cabia nesses campos sumia; o que o PDF
// não dizia, o Gemini inventava; e tamanho/posição eram chutados olhando 3
// quadros. Resultado: padrão "parecido", aplicado errado.
//
// Fluxo novo:
//   1. Gemini lê o PDF (inline application/pdf) + quadros e devolve FATOS:
//      cada fato = {campo (lista FECHADA), valor, página, citação, confiança}.
//      responseSchema obriga o formato; campo fora da lista é impossível.
//   2. Motions pedidos são mapeados para o CATÁLOGO (ou "nao_existe" -> pendência).
//   3. medir_referencia.js mede o vídeo aprovado (legenda y/tamanho, logo, cor).
//   4. ESTE código monta o padrão: medido no vídeo > medido no PDF > descrito > inferido.
//      Conflito entre fontes vira pendência, não chute.
//   5. validar() + cartela_teste.js -> usuário aprova -> salva padrao.json.
// =========================================================================
"use strict";

const { CATALOGO_MOTION, normalizar, validar, gravarCaminho } = require("./padrao");

// Campos que a IA pode preencher (o resto vem de valores padrão ou do usuário).
const CAMPOS_IMPORTAVEIS = [
  "legenda.ativa", "legenda.tamanho_px", "legenda.peso", "legenda.cor", "legenda.caixa", "legenda.centro_y",
  "legenda.ancora", "legenda.largura_max_px", "legenda.max_linhas", "legenda.palavras_por_bloco.min",
  "legenda.palavras_por_bloco.max", "legenda.max_caracteres", "legenda.sem_pontuacao_final",
  "legenda.sombra.opacidade", "legenda.sombra.dx", "legenda.sombra.dy", "legenda.sombra.desfoque",
  "legenda.contorno.largura", "legenda.contorno.cor", "legenda.caixa_fundo.cor", "legenda.maiusculas_sempre",
  "legenda.fonte_nome",
  "destaques.0.nome", "destaques.0.quando", "destaques.0.posicao", "destaques.0.fonte_nome", "destaques.0.peso",
  "destaques.0.tamanho_px", "destaques.0.cor", "destaques.0.caixa", "destaques.0.italico", "destaques.0.centro_y",
  "destaques.1.nome", "destaques.1.quando", "destaques.1.posicao", "destaques.1.fonte_nome", "destaques.1.peso",
  "destaques.1.tamanho_px", "destaques.1.cor", "destaques.1.caixa", "destaques.1.italico", "destaques.1.centro_y",
  "titulo_gancho.ativo", "titulo_gancho.tamanho_px", "titulo_gancho.cor", "titulo_gancho.caixa", "titulo_gancho.centro_y",
  "titulo_gancho.fonte_nome", "titulo_gancho.duracao_s.max",
  "numeros.ativo", "numeros.tamanho_px", "numeros.cor", "numeros.centro_y", "numeros.posicao",
  "logo.ativo", "logo.largura_px", "logo.centro_y", "logo.centro_x", "logo.durante",
  "elementos.regra", "elementos.max_simultaneos",
  "broll.ativo", "broll.modo", "broll.faixa.y0", "broll.faixa.y1", "broll.duracao_s.min", "broll.duracao_s.max",
  "broll.cobertura_max_pct", "broll.legenda_continua",
  "camera.zoom.modo", "camera.zoom.niveis", "camera.zoom.intervalo_min_s",
  "ritmo.novidade_a_cada_s.min", "ritmo.novidade_a_cada_s.max", "ritmo.cortar_pausas_acima_s",
  "ritmo.duracao_alvo_s.min", "ritmo.duracao_alvo_s.max",
  "transicoes.padrao", "transicoes.flash.cor", "transicoes.flash.max_por_video", "transicoes.dissolve_s",
  "fechamento.ativo", "fechamento.fundo", "fechamento.largura_px", "fechamento.duracao_s",
  "audio.lufs", "audio.musica.ativa", "audio.musica.volume",
  "cores.principal", "cores.destaque", "cores.fundo_fechamento"
];

const ORDEM_CONFIANCA = { medido_video: 4, medido_no_pdf: 3, descrito: 2, inferido: 1 };

/** responseSchema do Gemini (subconjunto OpenAPI) para a etapa de FATOS. */
function schemaFatosGemini() {
  return {
    type: "OBJECT",
    properties: {
      fatos: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            campo: { type: "STRING", enum: CAMPOS_IMPORTAVEIS },
            valor: { type: "STRING", description: "valor em JSON: 60, \"#EBCE1D\", true, [1.0,1.2], \"alta\"" },
            unidade: { type: "STRING", nullable: true },
            pagina: { type: "INTEGER", nullable: true },
            citacao: { type: "STRING", description: "trecho do PDF (até 15 palavras) ou descrição do quadro de onde veio" },
            confianca: { type: "STRING", enum: ["medido_no_pdf", "descrito", "inferido"] }
          },
          required: ["campo", "valor", "citacao", "confianca"]
        }
      },
      motions: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            onde: { type: "STRING", enum: ["legenda.entrada", "destaques.0.entrada", "destaques.1.entrada", "titulo_gancho.entrada", "numeros.entrada", "elementos.entrada", "fechamento.animacao", "camera.zoom"] },
            descricao_pdf: { type: "STRING" },
            catalogo: { type: "STRING", enum: [...Object.keys(CATALOGO_MOTION), "nao_existe"] },
            dur_s: { type: "NUMBER", nullable: true },
            pagina: { type: "INTEGER", nullable: true }
          },
          required: ["onde", "descricao_pdf", "catalogo"]
        }
      },
      proibidos: { type: "ARRAY", items: { type: "STRING" } },
      regras_texto: { type: "ARRAY", items: { type: "STRING" }, description: "regras que não cabem em campos (ex.: 'dourada só entra quando ele fala a palavra')" },
      checklist: { type: "ARRAY", items: { type: "STRING" } },
      pendencias: { type: "ARRAY", items: { type: "STRING" }, description: "o que o PDF não diz ou é ambíguo — perguntar ao usuário" }
    },
    required: ["fatos", "motions", "proibidos", "regras_texto", "pendencias"]
  };
}

/** Prompt da etapa de FATOS. Vai junto com o PDF (inline) e quadros de referência. */
function promptFatos({ nome, notas }) {
  return `Você é um diretor de pós-produção. Leia o manual (PDF) e os quadros de referência do cliente "${nome}".
${notas ? `Observações do usuário (valem mais que o PDF): ${notas}\n` : ""}
TAREFA: extrair FATOS de edição, um por campo, para uma lista FECHADA de campos (enum do schema).

REGRAS — siga todas:
1. NÃO invente. Se o PDF não diz, NÃO crie o fato; escreva em "pendencias" o que falta.
2. Toda medida em PIXELS num quadro 1080x1920 (vertical). Se o PDF usa outra resolução (ex.: 720x1280),
   converta (×1,5) e diga na citação. Se o PDF dá a posição como "terço inferior", isso é "descrito",
   não "medido_no_pdf" — e não invente um número exato: use o centro da faixa e marque "inferido".
3. "tamanho_px" é o tamanho da FONTE (em), como no CapCut/Figma/Photoshop. Se o PDF só mostra a ALTURA
   da letra maiúscula, divida por 0,7 e marque "inferido".
4. "centro_y" é o CENTRO VISUAL do texto (meio da letra maiúscula), medido do topo.
5. Cores sempre em hex (#RRGGBB). "caixa": "alta" (MAIÚSCULAS), "baixa" (minúsculas) ou "original".
6. "fonte_nome": o nome da família como aparece no PDF (ex.: "Montserrat ExtraBold"). O arquivo .ttf
   o usuário envia depois.
7. "valor" é JSON: número sem unidade (60), texto entre aspas ("#FFFFFF"), booleano (true), lista ([1.0,1.2]).
8. ANIMAÇÕES: para cada animação descrita, escolha o item MAIS PRÓXIMO do catálogo:
   ${Object.entries(CATALOGO_MOTION).filter(([, v]) => !v.planejado).map(([k, v]) => `${k} (${v.impl})`).join("; ")}.
   Se nenhum serve, use "nao_existe" e descreva — o motor NÃO vai improvisar.
9. "proibidos": tudo que o PDF manda NÃO fazer (glitch, neon, quique, zoom punch, palavra a palavra...).
10. "regras_texto": regras de tempo/lógica que não cabem em campos (ex.: "elemento entra quando a pessoa
    fala o assunto e sai no corte", "B-roll mínimo 2,5 s", "dourada só quando ele fala a palavra").
11. "confianca": "medido_no_pdf" só quando o PDF escreve o número; "descrito" quando o PDF diz em palavras;
    "inferido" quando você deduziu de uma imagem.
12. Cite a página e um trecho curto (até 15 palavras) em "citacao".`;
}

function parseValor(v) {
  if (typeof v !== "string") return v;
  try { return JSON.parse(v); } catch (_) { return v.replace(/^"|"$/g, ""); }
}

/**
 * Monta o padrão a partir dos fatos (Gemini) + medidas (medir_referencia.js).
 * @param {object} o { id, nome, fatos: {fatos, motions, proibidos, regras_texto, checklist, pendencias}, medidas, fontesArquivos: {"Montserrat ExtraBold": "assets/x.ttf"}, logoArquivo }
 * @returns {{padrao, erros, avisos, conflitos}}
 */
function montarPadrao(o) {
  const F = o.fatos || {};
  const raw = { versao_schema: 2, id: o.id, nome: o.nome, fontes: {}, correcoes: [], proveniencia: {}, pendencias: [...(F.pendencias || [])] };
  const melhor = new Map(); // campo -> {valor, conf, origem}
  const conflitos = [];
  const propor = (campo, valor, conf, origem) => {
    const atual = melhor.get(campo);
    if (atual && JSON.stringify(atual.valor) !== JSON.stringify(valor)) {
      const dif = typeof valor === "number" && typeof atual.valor === "number" ? Math.abs(valor - atual.valor) / Math.max(1, Math.abs(atual.valor)) : 1;
      if (dif > 0.08) conflitos.push(`${campo}: ${JSON.stringify(atual.valor)} (${atual.origem}) × ${JSON.stringify(valor)} (${origem})`);
    }
    if (!atual || ORDEM_CONFIANCA[conf] > ORDEM_CONFIANCA[atual.conf]) melhor.set(campo, { valor, conf, origem });
  };

  for (const f of F.fatos || []) {
    if (!CAMPOS_IMPORTAVEIS.includes(f.campo)) continue;
    propor(f.campo, parseValor(f.valor), f.confianca || "inferido", `pdf p.${f.pagina || "?"}: "${String(f.citacao || "").slice(0, 80)}"`);
  }
  // medidas do vídeo aprovado vencem o que o PDF só descreve
  const S = (o.medidas && o.medidas.sugestao_para_padrao) || {};
  const mapa = { "legenda.centro_y": "legenda.centro_y", "legenda.tamanho_px": "legenda.tamanho_px", "legenda.largura_max_px": "legenda.largura_max_px", "logo.centro_y": "logo.centro_y", "logo.largura_px": "logo.largura_px", "destaques[0].cor": "destaques.0.cor" };
  for (const [k, campo] of Object.entries(mapa)) {
    if (S[k] != null) propor(campo, S[k], "medido_video", `medido em ${o.medidas.video || "referência"}`);
  }

  for (const [campo, { valor, origem }] of melhor) {
    gravarCaminho(raw, campo, valor);
    raw.proveniencia[campo] = origem;
  }

  // fontes: nome do PDF -> arquivo enviado pelo usuário
  const usaFonte = (secao) => {
    const nomeF = secao && secao.fonte_nome;
    if (!nomeF) return;
    const id = nomeF.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_");
    if (!raw.fontes[id]) {
      const arq = (o.fontesArquivos || {})[nomeF];
      raw.fontes[id] = { arquivo: arq || `assets/${nomeF.replace(/\s+/g, "-")}.ttf`, peso: secao.peso || 400, italico: Boolean(secao.italico) };
      if (!arq) raw.pendencias.push(`Enviar o arquivo .ttf ESTÁTICO de "${nomeF}" (peso ${secao.peso || "?"}) para ${raw.fontes[id].arquivo}.`);
    }
    secao.fonte = id;
    delete secao.fonte_nome;
  };
  usaFonte(raw.legenda);
  (raw.destaques || []).forEach((d, i) => { usaFonte(d); d.id = d.id || `destaque_${i + 1}`; d.entrada = d.entrada || { tipo: "corte_seco" }; });
  usaFonte(raw.titulo_gancho);
  if (raw.titulo_gancho && raw.titulo_gancho.ativo && !raw.titulo_gancho.fonte && raw.legenda) raw.titulo_gancho.fonte = raw.legenda.fonte;
  if (raw.numeros && raw.numeros.ativo && !raw.numeros.fonte && raw.legenda) raw.numeros.fonte = raw.legenda.fonte;

  // logo / fechamento: arquivo vem do usuário
  if (raw.logo && raw.logo.ativo !== false && (raw.logo.centro_y || o.logoArquivo)) {
    raw.logo.ativo = true;
    raw.logo.arquivo = o.logoArquivo || "assets/logo.png";
    if (!o.logoArquivo) raw.pendencias.push("Enviar o logo em PNG com fundo transparente para assets/logo.png.");
  }

  // motions -> catálogo
  for (const m of F.motions || []) {
    if (m.catalogo === "nao_existe" || !CATALOGO_MOTION[m.catalogo]) {
      raw.pendencias.push(`Animação "${m.descricao_pdf}" (${m.onde}, p.${m.pagina || "?"}) não existe no catálogo do motor. Escolher a mais próxima ou pedir para implementar.`);
      continue;
    }
    if (m.onde === "camera.zoom") {
      gravarCaminho(raw, "camera.zoom.modo", m.catalogo === "zoom_no_corte" ? "no_corte_alternado" : m.catalogo === "punch_in" ? "punch_in" : "nenhum");
      if (m.catalogo === "zoom_lento") gravarCaminho(raw, "camera.zoom.lento", { de: 1.0, ate: 1.1, dur: m.dur_s || 3 });
    } else {
      gravarCaminho(raw, m.onde, { tipo: m.catalogo, ...(m.dur_s ? { dur: m.dur_s } : {}) });
    }
    raw.proveniencia[m.onde] = `pdf p.${m.pagina || "?"}: ${m.descricao_pdf}`;
  }
  raw.motions_proibidos = F.proibidos || [];
  raw.checklist = F.checklist || [];
  (F.regras_texto || []).forEach((r) => raw.correcoes.push({ data: new Date().toISOString().slice(0, 10), origem: "pdf", regra: r }));
  conflitos.forEach((c) => raw.pendencias.push(`Conflito de medidas: ${c}`));

  const padrao = normalizar(raw);
  const { erros, avisos } = validar(padrao, { conferirArquivos: false });
  return { padrao: { ...raw, ...{ pendencias: raw.pendencias } }, padraoNormalizado: padrao, erros, avisos, conflitos };
}

/**
 * Fluxo completo, com o callGemini da extensão injetado (ai_clips.js já tem um).
 * callGemini(parts, { responseSchema }) -> objeto JSON
 */
async function importarPadrao({ id, nome, notas, pdfBase64, quadrosBase64 = [], medidas, fontesArquivos, logoArquivo, callGemini }) {
  const parts = [];
  if (pdfBase64) parts.push({ inline_data: { mime_type: "application/pdf", data: pdfBase64.replace(/^data:[^;]+;base64,/, "") } });
  for (const q of quadrosBase64) parts.push({ inline_data: { mime_type: "image/jpeg", data: q } });
  parts.push({ text: promptFatos({ nome, notas }) });
  const fatos = await callGemini(parts, { responseSchema: schemaFatosGemini(), temperature: 0.1 });
  return montarPadrao({ id, nome, fatos, medidas, fontesArquivos, logoArquivo });
}

module.exports = { CAMPOS_IMPORTAVEIS, schemaFatosGemini, promptFatos, montarPadrao, importarPadrao };
