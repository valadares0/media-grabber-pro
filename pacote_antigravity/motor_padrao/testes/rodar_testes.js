#!/usr/bin/env node
// =========================================================================
// Testes do motor_padrao. Sem dependências (node:test + node:assert + ffmpeg).
//   node testes/rodar_testes.js            (todos, inclusive render ~30 s)
//   node testes/rodar_testes.js --rapido   (sem render)
// =========================================================================
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const RAIZ = path.resolve(__dirname, "..");
const { lerFonte, fontsizeAss, nomeParaAss, garantirEstatica } = require("../lib/fontes");
const { carregarPadrao, normalizar, validar } = require("../lib/padrao");
const { gerarAss } = require("../lib/legenda_ass");
const { aplicarRegras } = require("../lib/regras");
const { remapearPalavras } = require("../motor");

const PT = path.join(__dirname, "padrao_teste");
const FONTE = path.join(PT, "assets", "Montserrat-VF.ttf");
const RAPIDO = process.argv.includes("--rapido");

function ff(args, cwd) {
  const r = spawnSync("ffmpeg", ["-v", "error", "-y", ...args], { cwd, encoding: "utf8", windowsHide: true });
  if (r.status !== 0) throw new Error(r.stderr);
}

// palavras de teste (tempo do BRUTO), com uma pausa de 4,0 a 4,6 s que será cortada
const FRASE = [
  [0.30, "Olha"], [0.55, "só"], [0.80, "isso"], [1.05, "aqui."], [1.60, "A"], [1.75, "ação"], [2.10, "do"], [2.25, "mercado"],
  [2.80, "chama"], [3.15, "atenção."], [4.70, "O"], [4.85, "ciclo"], [5.20, "vai"], [5.40, "se"], [5.60, "alongar"],
  [6.10, "até"], [6.35, "2030"], [6.90, "no"], [7.05, "campo."], [7.70, "Ninguém"], [8.10, "esperava"], [8.55, "essa"],
  [8.80, "virada,"], [9.20, "né?"]
];
const PALAVRAS_BRUTO = FRASE.map(([t, w], i) => ({ t, e: (FRASE[i + 1] ? Math.min(FRASE[i + 1][0], t + 0.45) : t + 0.4), w }));

// ---------------------------------------------------------------------------
test("fontes: Montserrat variável vira TTF estático ExtraBold e o tamanho é corrigido", () => {
  const f = lerFonte(FONTE);
  assert.equal(f.variavel, true);
  assert.equal(f.unitsPerEm, 1000);
  assert.equal(f.pesoPadraoVariavel, 100, "o peso padrão da VF é Thin: é isso que o libass desenha");
  // libass mede por winAscent+winDescent (1109+453): 60 px do padrão = Fontsize 93,72 no ASS
  assert.ok(Math.abs(fontsizeAss(f, 60) - 93.72) < 0.01);
  assert.deepEqual(f.acentosFaltando, []);
  const est = lerFonte(garantirEstatica(FONTE, 800));
  assert.equal(est.variavel, false);
  assert.equal(est.peso, 800);
  assert.equal(nomeParaAss(est, 800), "Montserrat ExtraBold");
});

test("libass desenha a maiúscula com a altura do PIL/CapCut (60 px -> H ≈ 42 px)", { skip: RAPIDO }, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "libass_"));
  const est = garantirEstatica(FONTE, 800);
  fs.copyFileSync(est, path.join(tmp, path.basename(est)));
  const fi = lerFonte(est);
  fs.writeFileSync(path.join(tmp, "t.ass"), [
    "[Script Info]", "ScriptType: v4.00+", "PlayResX: 1080", "PlayResY: 1920", "", "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: C,${nomeParaAss(fi, 800)},${fontsizeAss(fi, 60)},&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,5,0,0,0,1`,
    "", "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    "Dialogue: 0,0:00:00.00,0:00:01.00,C,,0,0,0,,{\\pos(540,960)}HHHH", ""].join("\n"));
  const r = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "verbose", "-f", "lavfi", "-i", "color=c=black:s=1080x1920:d=1", "-vf", "subtitles=t.ass:fontsdir=.", "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "gray", "-"], { cwd: tmp, maxBuffer: 1080 * 1920 + 1024 });
  const log = String(r.stderr);
  assert.ok(/fontselect: \(Montserrat ExtraBold.*-> Montserrat-ExtraBold/.test(log), "libass não achou a Montserrat ExtraBold: " + (log.match(/fontselect.*/g) || []).join(" | "));
  let y0 = 9999, y1 = -1;
  for (let y = 0; y < 1920; y++) for (let x = 0; x < 1080; x++) if (r.stdout[y * 1080 + x] > 128) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const h = y1 - y0 + 1;
  assert.ok(Math.abs(h - 42) <= 2, `altura do H = ${h}px (PIL/CapCut com 60px = 42px)`);
});

test("padrões de exemplo dos clientes validam sem erro", () => {
  for (const id of fs.readdirSync(path.join(RAIZ, "padroes"))) {
    const { erros } = carregarPadrao(path.join(RAIZ, "padroes", id, "padrao.json"), { conferirArquivos: false });
    assert.deepEqual(erros, [], `${id}: ${erros.join("; ")}`);
  }
});

test("validador recusa motion proibido e motion inexistente", () => {
  const raw = JSON.parse(fs.readFileSync(path.join(RAIZ, "padroes", "guadalupe_leilao", "padrao.json"), "utf8"));
  raw.elementos.entrada = { tipo: "pop_rebote" }; // Guadalupe proíbe quique/rebote
  raw.legenda.entrada = { tipo: "zoom_explosivo" }; // não existe no catálogo
  const p = normalizar(raw);
  const { erros } = validar(p, { conferirArquivos: false });
  assert.ok(erros.some((e) => e.includes("PROÍBE") && e.includes("pop_rebote")), erros.join("\n"));
  assert.ok(erros.some((e) => e.includes("zoom_explosivo")), erros.join("\n"));
});

test("correção do editor vence o PDF", () => {
  const p = normalizar({ id: "x", broll: { duracao_s: { min: 1.1, max: 4 } }, correcoes: [{ data: "2026-11-12", campo: "broll.duracao_s.min", valor: 2.5 }] });
  assert.equal(p.broll.duracao_s.min, 2.5);
});

test("remapear palavras depois de cortar a pausa", () => {
  const segs = [{ a: 0, b: 4.0 }, { a: 4.6, b: 10 }];
  const fin = remapearPalavras(PALAVRAS_BRUTO, segs);
  const ciclo = fin.find((w) => w.w === "ciclo");
  assert.ok(Math.abs(ciclo.t - (4.0 + (4.85 - 4.6))) < 0.001);
});

test("legenda: bloco nunca atravessa corte, destaque entra na palavra e não repete", () => {
  const { padrao } = carregarPadrao(path.join(PT, "padrao.json"), { conferirArquivos: false });
  const segs = [{ a: 0, b: 4.0 }, { a: 4.6, b: 10 }];
  const palavras = remapearPalavras(PALAVRAS_BRUTO, segs);
  const r = gerarAss({ padrao, palavras, duracao: 9.4, cortes: [4.0], destaques: [{ id: "dourado", texto: "até 2030" }] });
  for (const b of r.blocos) assert.ok(!(b.t0 < 4.0 - 0.01 && b.t1 > 4.0 + 0.01), `bloco atravessa o corte: ${JSON.stringify(b)}`);
  const comDest = r.blocos.find((b) => b.destaque);
  assert.ok(comDest, "nenhum bloco com destaque");
  assert.equal(comDest.destaque, "até 2030");
  assert.ok(!comDest.linhas.join(" ").includes("2030"), "destaque repetido na legenda de baixo");
  // a dourada entra quando "até" é falado, não no começo do bloco
  const ate = palavras.find((w) => w.w === "até");
  assert.ok(r.ass.includes(`Dialogue: 2,${toAss(ate.t)}`), "linha dourada não começa no tempo da palavra");
  // tamanho certo no ASS e nome da instância
  assert.ok(r.ass.includes("\\fnMontserrat ExtraBold\\fs93.72"), "Fontname/Fontsize errados no ASS");
  assert.ok(!/\\fscx112/.test(r.ass), "voltou o \\fscx112 que faz a linha pular");
});

test("regras: B-roll curto vira 2,5 s, sai do título, elemento sai no corte", () => {
  const { padrao } = carregarPadrao(path.join(PT, "padrao.json"), { conferirArquivos: false });
  const plano = {
    titulos: [{ texto: "CICLO", t0: 0, t1: 2.5 }],
    broll: [{ id: "a", arquivo: "a.mp4", t0: 2.0, t1: 3.0, vertical: false }, { id: "b", arquivo: "b.mp4", t0: 6.0, t1: 6.8, vertical: true }],
    elementos: [{ id: "x", arquivo: "x.png", t0: 3.2, t1: 6.0, largura_px: 300, centro_y: 1300 }]
  };
  const r = aplicarRegras({ padrao, plano, palavras: [], cortes: [4.0], fimFala: 20 });
  const a = r.plano.broll.find((b) => b.id === "a"), b = r.plano.broll.find((x) => x.id === "b");
  // com 9,4 s de fala, os dois B-rolls passariam de 40% de cobertura: o 2º sai
  const curto = aplicarRegras({ padrao, plano, palavras: [], cortes: [4.0], fimFala: 9.4 });
  assert.equal(curto.plano.broll.length, 1, "cobertura máxima não foi respeitada");
  assert.ok(a.t0 >= 2.5, "B-roll não saiu de cima do título");
  assert.ok(a.t1 - a.t0 >= 2.5 - 1e-6, "B-roll menor que 2,5 s");
  assert.equal(b.modo, "tela_cheia", "clipe vertical deveria ir para tela cheia");
  assert.equal(r.plano.elementos[0].t1, 4.0, "elemento deveria sair no corte");
  assert.ok(r.plano.zoom.length >= 1);
});

test("importador: medida do vídeo vence o PDF; motion fora do catálogo vira pendência", async () => {
  const { importarPadrao, schemaFatosGemini } = require("../lib/importar_padrao");
  assert.ok(schemaFatosGemini().properties.fatos.items.properties.campo.enum.includes("legenda.centro_y"));
  const respostaGemini = {
    fatos: [
      { campo: "legenda.tamanho_px", valor: "48", pagina: 5, citacao: "legenda média, cerca de 48", confianca: "descrito" },
      { campo: "legenda.centro_y", valor: "1400", pagina: 5, citacao: "terço inferior", confianca: "inferido" },
      { campo: "legenda.caixa", valor: "\"alta\"", pagina: 5, citacao: "CAIXA ALTA", confianca: "medido_no_pdf" },
      { campo: "legenda.cor", valor: "\"#FFFFFF\"", pagina: 5, citacao: "branca", confianca: "descrito" },
      { campo: "legenda.fonte_nome", valor: "\"Montserrat ExtraBold\"", pagina: 4, citacao: "Montserrat ExtraBold", confianca: "medido_no_pdf" },
      { campo: "legenda.peso", valor: "800", pagina: 4, citacao: "ExtraBold", confianca: "medido_no_pdf" },
      { campo: "destaques.0.cor", valor: "\"#EBCE1D\"", pagina: 6, citacao: "dourado #EBCE1D", confianca: "medido_no_pdf" },
      { campo: "destaques.0.posicao", valor: "\"linha_abaixo_da_legenda\"", pagina: 6, citacao: "embaixo da branca", confianca: "descrito" },
      { campo: "destaques.0.tamanho_px", valor: "66", pagina: 6, citacao: "itálico", confianca: "inferido" },
      { campo: "destaques.0.fonte_nome", valor: "\"Playfair Display Italic\"", pagina: 6, citacao: "Playfair", confianca: "descrito" }
    ],
    motions: [
      { onde: "titulo_gancho.entrada", descricao_pdf: "entra com desfoque", catalogo: "desfoque_foco", dur_s: 0.3, pagina: 8 },
      { onde: "elementos.entrada", descricao_pdf: "explosão de partículas", catalogo: "nao_existe", pagina: 8 }
    ],
    proibidos: ["glitch", "neon"],
    regras_texto: ["dourada só entra quando ele fala a palavra"],
    pendencias: ["PDF não diz a duração do fechamento"]
  };
  const medidas = { video: "ref1.mp4", sugestao_para_padrao: { "legenda.centro_y": 1497, "legenda.tamanho_px": 60 } };
  let schemaUsado = null;
  const r = await importarPadrao({
    id: "cliente_x", nome: "Cliente X", pdfBase64: "data:application/pdf;base64,AAAA", medidas,
    callGemini: async (parts, opts) => { schemaUsado = opts.responseSchema; return respostaGemini; }
  });
  assert.ok(schemaUsado, "não passou responseSchema ao Gemini");
  assert.equal(r.padrao.legenda.tamanho_px, 60, "medida do vídeo deveria vencer o 'cerca de 48' do PDF");
  assert.equal(r.padrao.legenda.centro_y, 1497);
  assert.match(r.padrao.proveniencia["legenda.tamanho_px"], /medido em ref1/);
  assert.equal(r.padrao.legenda.fonte, "montserrat_extrabold");
  assert.equal(r.padrao.titulo_gancho.entrada.tipo, "desfoque_foco");
  assert.ok(r.padrao.pendencias.some((p) => p.includes("explosão de partículas")), "motion fora do catálogo deveria virar pendência");
  assert.ok(r.padrao.pendencias.some((p) => p.includes("Montserrat ExtraBold")), "fonte sem arquivo deveria virar pendência");
  assert.ok(r.conflitos.some((c) => c.includes("legenda.tamanho_px")), "conflito PDF × vídeo deveria ser listado");
  assert.deepEqual(r.erros, [], r.erros.join("; "));
});

test("plano da IA: descarta destaque fora da fala, id inventado e B-roll fora do catálogo", () => {
  const { validarPlanoIA, schemaPlanoGemini, promptPlano } = require("../lib/plano_ia");
  const { padrao } = carregarPadrao(path.join(PT, "padrao.json"), { conferirArquivos: false });
  const palavras = remapearPalavras(PALAVRAS_BRUTO, [{ a: 0, b: 4.0 }, { a: 4.6, b: 10 }]);
  const catalogo = { itens: [{ id: "drone/boiada.mp4", tags: ["drone", "boiada"] }] };
  const sch = schemaPlanoGemini(padrao, catalogo);
  assert.deepEqual(sch.properties.destaques.items.properties.id.enum, ["dourado"]);
  assert.deepEqual(sch.properties.broll.items.properties.clipe.enum, ["drone/boiada.mp4"]);
  assert.ok(promptPlano(padrao, palavras, { catalogo }).includes("[0.3] Olha"));
  const r = validarPlanoIA({
    titulo: { texto: "CICLO", linha2: "pecuário" },
    destaques: [
      { id: "dourado", texto: "até 2030", perto_s: 5.8 },
      { id: "dourado", texto: "boi gordo", perto_s: 3 },     // não foi falado
      { id: "neon_piscando", texto: "campo", perto_s: 6.5 }  // id inventado
    ],
    broll: [{ clipe: "drone/boiada.mp4", palavra: "campo", perto_s: 6.5 }, { clipe: "inventado.mp4", palavra: "campo", perto_s: 6.5 }],
    flashes_s: [4.0, 6.0, 8.0]
  }, { padrao, palavras, catalogo, duracao: 9.4 });
  assert.equal(r.plano.destaques.length, 1);
  assert.equal(r.plano.broll_sugestoes.length, 1);
  assert.equal(r.plano.flashes.length, 2, "flash acima do máximo do padrão");
  assert.equal(r.plano.titulos[0].texto, "CICLO");
  assert.equal(r.avisos.length, 3);
});

function toAss(t) {
  const cs = Math.round(t * 100);
  return `0:00:${String(Math.floor(cs / 100)).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
test("render completo + conferência mede legenda no lugar e no tamanho do padrão", { skip: RAPIDO }, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "motor_padrao_"));
  // assets sintéticos do padrão de teste
  ff(["-f", "lavfi", "-i", "color=c=0x2266CC:s=400x100,format=rgba", "-frames:v", "1", path.join(PT, "assets", "logo.png")]);
  ff(["-f", "lavfi", "-i", "color=c=0xCC2222:s=400x120,format=rgba", "-frames:v", "1", path.join(PT, "assets", "selo.png")]);
  ff(["-f", "lavfi", "-i", "color=c=0x118833:s=600x200,format=rgba", "-frames:v", "1", path.join(PT, "assets", "logo_cor.png")]);
  // bruto: fundo escuro com leve gradiente + tom de voz; B-roll: testsrc2
  ff(["-f", "lavfi", "-i", "gradients=s=1080x1920:c0=0x202428:c1=0x303840:d=10:r=30", "-f", "lavfi", "-i", "sine=f=220:d=10",
    "-shortest", "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac", path.join(tmp, "bruto.mp4")]);
  ff(["-f", "lavfi", "-i", "testsrc2=s=1920x1080:r=30:d=6", "-c:v", "libx264", "-preset", "ultrafast", path.join(tmp, "broll_teste.mp4")]);
  fs.writeFileSync(path.join(tmp, "palavras.json"), JSON.stringify(PALAVRAS_BRUTO));
  fs.writeFileSync(path.join(tmp, "catalogo.json"), JSON.stringify({ itens: [{ id: "broll_teste.mp4", arquivo: path.join(tmp, "broll_teste.mp4"), dur: 6, w: 1920, h: 1080, vertical: false, hdr: false, tags: ["teste"] }] }));
  fs.writeFileSync(path.join(tmp, "projeto.json"), JSON.stringify({
    padrao: path.join(PT, "padrao.json"),
    bruto: "bruto.mp4",
    segmentos: [{ a: 0, b: 4.0 }, { a: 4.6, b: 10 }],
    palavras: "palavras.json",
    catalogo_broll: "catalogo.json",
    plano: {
      titulos: [{ texto: "CICLO", linha2: "pecuário", t0: 0, t1: 2.5 }],
      destaques: [{ id: "dourado", texto: "até 2030" }],
      broll_sugestoes: [{ clipe: "broll_teste.mp4", palavra: "campo" }],
      flashes: [4.0]
    },
    work: "work", saida: "final.mp4"
  }, null, 2));
  const r = spawnSync(process.execPath, [path.join(RAIZ, "motor.js"), path.join(tmp, "projeto.json")], { encoding: "utf8" });
  console.log(r.stdout, r.stderr);
  assert.equal(r.status, 0, "motor/conferência reprovou");
  assert.ok(fs.existsSync(path.join(tmp, "final.mp4")));
  assert.ok(fs.existsSync(path.join(tmp, "work", "folha_contato.jpg")));
  // ida e volta: medir o vídeo renderizado tem que devolver as medidas do padrão
  const m = spawnSync(process.execPath, [path.join(RAIZ, "ferramentas", "medir_referencia.js"), path.join(tmp, "final.mp4"), "--fonte", FONTE, "--caixa", "alta", "--saida", path.join(tmp, "medidas.json")], { encoding: "utf8" });
  assert.equal(m.status, 0, m.stderr);
  const s = JSON.parse(fs.readFileSync(path.join(tmp, "medidas.json"), "utf8")).sugestao_para_padrao;
  assert.ok(Math.abs(s["legenda.centro_y"] - 1497) <= 6, `medido y ${s["legenda.centro_y"]}`);
  assert.ok(Math.abs(s["legenda.tamanho_px"] - 60) <= 3, `medido tamanho ${s["legenda.tamanho_px"]}`);
  assert.ok(Math.abs(s["logo.centro_y"] - 282) <= 6 && Math.abs(s["logo.largura_px"] - 400) <= 8, `logo medido ${s["logo.centro_y"]} / ${s["logo.largura_px"]}`);
  console.log(`   (arquivos do teste em ${tmp})`);
});
