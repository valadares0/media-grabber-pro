// =========================================================================
// plano_ia.js — a IA SUGERE o plano de edição de um corte (destaques, título,
// números, B-roll, flash); este módulo PRENDE a resposta ao padrão e à fala:
//   - id de destaque só entre os do padrão (enum)
//   - clipe de B-roll só entre os do catálogo (enum)
//   - texto de destaque/título TEM que existir na fala (senão é descartado)
//   - quantidade respeitando freq_por_video / freq_por_minuto
// Depois disso, regras.js decide tempos e durações. A IA nunca escolhe px, s ou cor.
// =========================================================================
"use strict";

const { localizarFrase, normPalavra } = require("./legenda_ass");

function schemaPlanoGemini(padrao, catalogo) {
  const idsDest = (padrao.destaques || []).map((d) => d.id);
  const idsClipe = ((catalogo && catalogo.itens) || []).map((i) => i.id);
  const props = {
    titulo: {
      type: "OBJECT", nullable: true,
      properties: { texto: { type: "STRING" }, linha2: { type: "STRING", nullable: true }, motivo: { type: "STRING" } },
      required: ["texto"]
    },
    destaques: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          id: idsDest.length ? { type: "STRING", enum: idsDest } : { type: "STRING" },
          texto: { type: "STRING", description: "palavras EXATAS da fala (1 a 3 palavras)" },
          perto_s: { type: "NUMBER", description: "segundo aproximado em que a palavra é falada (tempo do corte)" },
          motivo: { type: "STRING" }
        },
        required: ["id", "texto", "perto_s"]
      }
    },
    numeros: {
      type: "ARRAY",
      items: { type: "OBJECT", properties: { texto: { type: "STRING" }, linha2: { type: "STRING", nullable: true }, perto_s: { type: "NUMBER" } }, required: ["texto", "perto_s"] }
    },
    flashes_s: { type: "ARRAY", items: { type: "NUMBER" }, description: "troca de assunto (no máximo o do padrão)" }
  };
  if (idsClipe.length) {
    props.broll = {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          clipe: { type: "STRING", enum: idsClipe },
          palavra: { type: "STRING", description: "palavra EXATA da fala onde o B-roll entra" },
          perto_s: { type: "NUMBER" },
          motivo: { type: "STRING" }
        },
        required: ["clipe", "palavra", "perto_s"]
      }
    };
  }
  return { type: "OBJECT", properties: props, required: ["destaques"] };
}

function promptPlano(padrao, palavras, { catalogo, foco } = {}) {
  const linhas = [];
  let cur = null;
  for (const w of palavras) {
    if (!cur || w.t - cur.t > 4) { if (cur) linhas.push(cur); cur = { t: w.t, ws: [] }; }
    cur.ws.push(w.w);
  }
  if (cur) linhas.push(cur);
  const transcricao = linhas.map((l) => `[${l.t.toFixed(1)}] ${l.ws.join(" ")}`).join("\n");
  const dest = (padrao.destaques || []).map((d) => `- ${d.id}: ${d.nome || ""} — usar quando: ${d.quando || d.gatilho || "?"}${d.freq_por_video ? ` (${d.freq_por_video.min}–${d.freq_por_video.max} por vídeo)` : ""}`).join("\n");
  const clipes = ((catalogo && catalogo.itens) || []).slice(0, 300).map((i) => `- ${i.id}: ${(i.tags || []).join(", ") || "sem etiqueta"}${i.vertical ? " (vertical)" : ""}`).join("\n");
  const regras = (padrao.correcoes || []).filter((c) => c.regra && !c.campo).map((c) => `- ${c.regra}`).join("\n");
  return `Você é o editor do cliente "${padrao.nome}". Planeje a edição DESTE corte seguindo o padrão.
${foco ? `Foco: ${foco}\n` : ""}
DESTAQUES disponíveis (use só estes ids):
${dest || "- (nenhum)"}
${padrao.titulo_gancho.ativo ? `TÍTULO-GANCHO: ${padrao.titulo_gancho.quando || "gancho no início"}. Curto (até 3 palavras + linha2 opcional).` : "TÍTULO: este cliente não usa."}
${padrao.numeros.ativo ? "NÚMEROS: quando a fala cita número importante (preço, quantidade, ano)." : ""}
${clipes ? `B-ROLL (use só estes ids; escolha pelo assunto falado NAQUELE segundo; ${padrao.broll.ordem || ""}):\n${clipes}` : "B-ROLL: sem catálogo — não sugira."}
REGRAS DO CLIENTE:
${regras || "- (nenhuma além do padrão)"}

OBRIGATÓRIO:
1. "texto" e "palavra" são palavras EXATAS da transcrição (mesma grafia). Se não existir na fala, não sugira.
2. Não escolha tamanho, cor, posição nem duração: o motor aplica o padrão.
3. Menos é mais: respeite as quantidades do padrão. Gancho nos 3 primeiros segundos.

TRANSCRIÇÃO (segundos do corte):
${transcricao}`;
}

/** Resposta da IA -> plano do motor. Descarta o que não existe na fala/catálogo/padrão. */
function validarPlanoIA(resp, { padrao, palavras, catalogo, duracao }) {
  const avisos = [];
  const plano = { destaques: [], titulos: [], numeros: [], broll_sugestoes: [], flashes: [] };
  const ids = new Set((padrao.destaques || []).map((d) => d.id));
  for (const d of (resp && resp.destaques) || []) {
    if (!ids.has(d.id)) { avisos.push(`destaque com id desconhecido "${d.id}" descartado.`); continue; }
    if (!localizarFrase(palavras, d.texto, d.perto_s)) { avisos.push(`destaque "${d.texto}" não está na fala: descartado.`); continue; }
    plano.destaques.push({ id: d.id, texto: d.texto, perto: d.perto_s });
  }
  // frequência por tipo
  for (const cfg of padrao.destaques || []) {
    const max = cfg.freq_por_video ? cfg.freq_por_video.max : null;
    const desse = plano.destaques.filter((x) => x.id === cfg.id);
    if (max != null && desse.length > max) {
      const sobra = desse.slice(max);
      plano.destaques = plano.destaques.filter((x) => !sobra.includes(x));
      avisos.push(`${sobra.length} destaque(s) "${cfg.id}" a mais removidos (máx. ${max}).`);
    }
  }
  if (resp && resp.titulo && padrao.titulo_gancho.ativo) {
    const max = (padrao.titulo_gancho.duracao_s && padrao.titulo_gancho.duracao_s.max) || 4;
    plano.titulos.push({ texto: resp.titulo.texto, linha2: resp.titulo.linha2 || null, t0: 0, t1: Math.min(max, duracao || max) });
  }
  if (padrao.numeros.ativo) {
    for (const n of (resp && resp.numeros) || []) {
      const alvo = String(n.texto).split(/\s+/).map(normPalavra).find((x) => /\d/.test(x));
      const w = palavras.find((p) => normPalavra(p.w) === alvo && Math.abs(p.t - n.perto_s) < 3);
      if (!w) { avisos.push(`número "${n.texto}" não foi achado na fala: descartado.`); continue; }
      plano.numeros.push({ texto: n.texto, linha2: n.linha2 || null, t0: w.t, t1: Math.min(w.t + 2.5, duracao || w.t + 2.5) });
    }
  }
  const idsClipe = new Set(((catalogo && catalogo.itens) || []).map((i) => i.id));
  for (const b of (resp && resp.broll) || []) {
    if (!idsClipe.has(b.clipe)) { avisos.push(`B-roll "${b.clipe}" não existe no catálogo: descartado.`); continue; }
    plano.broll_sugestoes.push({ clipe: b.clipe, palavra: b.palavra, perto: b.perto_s });
  }
  plano.flashes = ((resp && resp.flashes_s) || []).slice(0, padrao.transicoes.flash.max_por_video || 0);
  return { plano, avisos };
}

module.exports = { schemaPlanoGemini, promptPlano, validarPlanoIA };
