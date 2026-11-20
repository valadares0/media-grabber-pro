#!/usr/bin/env node
// Valida um padrão de edição v2 e mostra o que está errado ANTES de renderizar.
//   node validar_padrao.js padroes/daniel_gaia/padrao.json [--sem-arquivos]
// Sai com código 1 se houver ERRO (use como trava no motor e no importador de PDF).
"use strict";
const path = require("path");
const { carregarPadrao, asset } = require("../lib/padrao");
const { lerFonte, avisosFonte, nomeParaAss, fontsizeAss } = require("../lib/fontes");

const arq = process.argv[2];
if (!arq) {
  console.log("uso: node validar_padrao.js <padrao.json> [--sem-arquivos]");
  process.exit(2);
}
const semArquivos = process.argv.includes("--sem-arquivos");
const { padrao, erros, avisos } = carregarPadrao(arq, { conferirArquivos: !semArquivos });

// fontes: nome certo para o ASS, tamanho corrigido e acentos
const infoFontes = [];
if (!semArquivos) {
  for (const [id, f] of Object.entries(padrao.fontes)) {
    try {
      const fi = lerFonte(asset(padrao, f.arquivo));
      avisosFonte(fi, f.peso).forEach((a) => avisos.push(`fonte ${id}: ${a}`));
      const usos = [];
      if (padrao.legenda.fonte === id) usos.push(["legenda", padrao.legenda.tamanho_px, padrao.legenda.peso || f.peso]);
      (padrao.destaques || []).filter((d) => d.fonte === id).forEach((d) => usos.push([`destaque ${d.id}`, d.tamanho_px, d.peso || f.peso]));
      infoFontes.push({
        id,
        arquivo: path.basename(fi.arquivo),
        variavel: fi.variavel,
        usos: usos.map(([onde, px, peso]) => `${onde}: ${px}px -> Fontname "${nomeParaAss(fi, peso, f.italico)}" Fontsize ${fontsizeAss(fi, px)}`)
      });
    } catch (e) {
      erros.push(`fonte ${id}: ${e.message}`);
    }
  }
}

console.log(`\n== ${padrao.nome} (${padrao.id}) ==`);
infoFontes.forEach((f) => {
  console.log(`  fonte ${f.id} (${f.arquivo}${f.variavel ? ", variável" : ""})`);
  f.usos.forEach((u) => console.log(`     ${u}`));
});
erros.forEach((e) => console.log(`  ERRO   ${e}`));
avisos.forEach((a) => console.log(`  aviso  ${a}`));
if (!erros.length) console.log("  OK: padrão aplicável pelo motor.");
process.exit(erros.length ? 1 : 0);
