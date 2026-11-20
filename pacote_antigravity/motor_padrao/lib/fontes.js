// =========================================================================
// fontes.js — lê arquivos .ttf/.otf SEM dependências e responde:
//   - qual o nome que o libass/ASS precisa (família / nome completo)
//   - se é fonte variável (e qual o peso padrão que o libass vai usar)
//   - métricas (unitsPerEm, ascender/descender, capHeight, winAscent/winDescent)
//   - se a fonte tem os glifos de acento do português
//   - largura de um texto em px (para quebrar linha sem encolher a fonte)
//   - CONVERSÃO de "tamanho em px do padrão" (PIL/CapCut/Figma = em) para o
//     Fontsize do ASS (libass mede pela altura real ascender+descender).
//
// Por que isso existe: o libass NÃO usa o tamanho "em". Ele escala a fonte para
// que (usWinAscent + usWinDescent) = Fontsize. Na Montserrat isso dá ~19% menor
// do que o mesmo número no PIL/CapCut. É uma das causas da "legenda menor".
// =========================================================================
"use strict";

const fs = require("fs");
const path = require("path");

const ACENTOS_PT = "ÁÀÂÃÉÊÍÓÔÕÚÜÇáàâãéêíóôõúüç";

function lerTabelas(buf) {
  const sig = buf.readUInt32BE(0);
  if (sig === 0x74746366) throw new Error("Arquivo .ttc (coleção) não suportado: extraia a fonte individual.");
  const numTables = buf.readUInt16BE(4);
  const tabelas = {};
  for (let i = 0; i < numTables; i++) {
    const off = 12 + i * 16;
    const tag = buf.toString("latin1", off, off + 4);
    tabelas[tag] = { offset: buf.readUInt32BE(off + 8), length: buf.readUInt32BE(off + 12) };
  }
  return tabelas;
}

function lerNomes(buf, t) {
  const nomes = {};
  if (!t) return nomes;
  const base = t.offset;
  const count = buf.readUInt16BE(base + 2);
  const strOff = base + buf.readUInt16BE(base + 4);
  const candidatos = {};
  for (let i = 0; i < count; i++) {
    const r = base + 6 + i * 12;
    const platform = buf.readUInt16BE(r);
    const encoding = buf.readUInt16BE(r + 2);
    const language = buf.readUInt16BE(r + 4);
    const nameId = buf.readUInt16BE(r + 6);
    const len = buf.readUInt16BE(r + 8);
    const off = buf.readUInt16BE(r + 10);
    if (![1, 2, 4, 6, 16, 17].includes(nameId) && nameId < 256) continue; // >=256: nomes das instâncias (fvar)
    const raw = buf.subarray(strOff + off, strOff + off + len);
    let s;
    if (platform === 3 || platform === 0) {
      // UTF-16BE
      const sw = Buffer.alloc(raw.length);
      for (let k = 0; k + 1 < raw.length; k += 2) { sw[k] = raw[k + 1]; sw[k + 1] = raw[k]; }
      s = sw.toString("utf16le");
    } else if (platform === 1 && encoding === 0) {
      s = raw.toString("latin1");
    } else continue;
    // prioridade: Windows inglês (0x409) > outros
    const prio = platform === 3 && language === 0x409 ? 3 : platform === 3 ? 2 : 1;
    if (!candidatos[nameId] || candidatos[nameId].prio < prio) candidatos[nameId] = { prio, s };
  }
  for (const k of Object.keys(candidatos)) nomes[k] = candidatos[k].s;
  return nomes;
}

function lerCmap(buf, t) {
  // devolve Map(codepoint -> glyphId) para subtabelas formato 4 e 12 (Unicode)
  const mapa = new Map();
  if (!t) return mapa;
  const base = t.offset;
  const n = buf.readUInt16BE(base + 2);
  let escolhido = null;
  for (let i = 0; i < n; i++) {
    const r = base + 4 + i * 8;
    const pid = buf.readUInt16BE(r);
    const eid = buf.readUInt16BE(r + 2);
    const off = base + buf.readUInt32BE(r + 4);
    const fmt = buf.readUInt16BE(off);
    const score = (fmt === 12 ? 10 : fmt === 4 ? 5 : 0) + (pid === 3 && (eid === 10 || eid === 1) ? 2 : pid === 0 ? 1 : 0);
    if ((fmt === 4 || fmt === 12) && (!escolhido || score > escolhido.score)) escolhido = { off, fmt, score };
  }
  if (!escolhido) return mapa;
  const o = escolhido.off;
  if (escolhido.fmt === 4) {
    const segX2 = buf.readUInt16BE(o + 6);
    const seg = segX2 / 2;
    const ends = o + 14, starts = ends + segX2 + 2, deltas = starts + segX2, ranges = deltas + segX2;
    for (let s = 0; s < seg; s++) {
      const end = buf.readUInt16BE(ends + s * 2);
      const start = buf.readUInt16BE(starts + s * 2);
      const delta = buf.readInt16BE(deltas + s * 2);
      const roff = buf.readUInt16BE(ranges + s * 2);
      for (let c = start; c <= end && c !== 0xffff; c++) {
        let g;
        if (roff === 0) g = (c + delta) & 0xffff;
        else {
          const gi = ranges + s * 2 + roff + (c - start) * 2;
          g = buf.readUInt16BE(gi);
          if (g !== 0) g = (g + delta) & 0xffff;
        }
        if (g) mapa.set(c, g);
      }
    }
  } else {
    const nGroups = buf.readUInt32BE(o + 12);
    for (let gidx = 0; gidx < nGroups; gidx++) {
      const r = o + 16 + gidx * 12;
      const start = buf.readUInt32BE(r), end = buf.readUInt32BE(r + 4), g0 = buf.readUInt32BE(r + 8);
      for (let c = start; c <= end && c - start < 70000; c++) mapa.set(c, g0 + (c - start));
    }
  }
  return mapa;
}

function lerFvar(buf, t, nomes) {
  if (!t) return null;
  const base = t.offset;
  const axesOff = base + buf.readUInt16BE(base + 4);
  const axisCount = buf.readUInt16BE(base + 8);
  const axisSize = buf.readUInt16BE(base + 10);
  const instanceCount = buf.readUInt16BE(base + 12);
  const instanceSize = buf.readUInt16BE(base + 14);
  const eixos = [];
  for (let i = 0; i < axisCount; i++) {
    const r = axesOff + i * axisSize;
    eixos.push({
      tag: buf.toString("latin1", r, r + 4),
      min: buf.readInt32BE(r + 4) / 65536,
      padrao: buf.readInt32BE(r + 8) / 65536,
      max: buf.readInt32BE(r + 12) / 65536
    });
  }
  const instancias = [];
  const instOff = axesOff + axisCount * axisSize;
  for (let i = 0; i < instanceCount; i++) {
    const r = instOff + i * instanceSize;
    const nomeId = buf.readUInt16BE(r);
    const coords = {};
    eixos.forEach((e, k) => { coords[e.tag] = buf.readInt32BE(r + 4 + k * 4) / 65536; });
    instancias.push({ nome: (nomes && nomes[nomeId]) || `instancia_${i}`, coords });
  }
  return { eixos, instancias };
}

/**
 * Lê uma fonte e devolve tudo que o motor precisa.
 * @param {string} arquivo caminho do .ttf/.otf
 */
function lerFonte(arquivo) {
  const buf = fs.readFileSync(arquivo);
  const t = lerTabelas(buf);
  if (!t.head || !t.hhea) throw new Error(`Fonte inválida (sem head/hhea): ${arquivo}`);
  const upm = buf.readUInt16BE(t.head.offset + 18);
  const hhea = {
    ascender: buf.readInt16BE(t.hhea.offset + 4),
    descender: buf.readInt16BE(t.hhea.offset + 6),
    lineGap: buf.readInt16BE(t.hhea.offset + 8),
    numberOfHMetrics: buf.readUInt16BE(t.hhea.offset + 34)
  };
  let os2 = null;
  if (t["OS/2"]) {
    const o = t["OS/2"].offset;
    const versao = buf.readUInt16BE(o);
    os2 = {
      versao,
      peso: buf.readUInt16BE(o + 4),
      fsSelection: buf.readUInt16BE(o + 62),
      typoAscender: buf.readInt16BE(o + 68),
      typoDescender: buf.readInt16BE(o + 70),
      winAscent: buf.readUInt16BE(o + 74),
      winDescent: buf.readUInt16BE(o + 76),
      capHeight: versao >= 2 && t["OS/2"].length >= 90 ? buf.readInt16BE(o + 88) : null,
      xHeight: versao >= 2 && t["OS/2"].length >= 88 ? buf.readInt16BE(o + 86) : null
    };
  }
  const nomes = lerNomes(buf, t.name);
  const cmap = lerCmap(buf, t.cmap);
  const fv = lerFvar(buf, t.fvar, nomes);
  const fvar = fv ? fv.eixos : null;
  const instancias = fv ? fv.instancias : [];

  // larguras (hmtx)
  const avancos = [];
  if (t.hmtx) {
    for (let i = 0; i < hhea.numberOfHMetrics; i++) avancos.push(buf.readUInt16BE(t.hmtx.offset + i * 4));
  }
  const avancoGlifo = (g) => avancos[Math.min(g, avancos.length - 1)] || upm * 0.5;

  // altura que o libass usa para "Fontsize" (ver ass_font.c: set_font_metrics + FT_SIZE_REQUEST_TYPE_REAL_DIM)
  let alturaLibass;
  if (os2 && os2.winAscent + os2.winDescent > 0) alturaLibass = os2.winAscent + os2.winDescent;
  else if (hhea.ascender - hhea.descender > 0) alturaLibass = hhea.ascender - hhea.descender;
  else alturaLibass = upm;

  const faltando = [...ACENTOS_PT].filter((ch) => !cmap.has(ch.codePointAt(0)));
  const pesoPadraoVariavel = fvar ? (fvar.find((e) => e.tag === "wght") || {}).padrao : null;

  return {
    arquivo: path.resolve(arquivo),
    familia: nomes[16] || nomes[1] || path.basename(arquivo, path.extname(arquivo)),
    familiaWindows: nomes[1] || null, // nome ID 1 (é o que o libass mais casa)
    subfamilia: nomes[17] || nomes[2] || "",
    nomeCompleto: nomes[4] || null,
    nomePostScript: nomes[6] || null,
    peso: os2 ? os2.peso : null,
    italico: os2 ? Boolean(os2.fsSelection & 1) : false,
    variavel: Boolean(fvar),
    eixos: fvar || [],
    instancias,
    pesoPadraoVariavel,
    unitsPerEm: upm,
    hhea,
    os2,
    capHeightRazao: os2 && os2.capHeight ? os2.capHeight / upm : 0.7,
    fatorLibass: alturaLibass / upm, // Fontsize_ASS = tamanho_em_px * fatorLibass
    acentosFaltando: faltando,
    temGlifo: (ch) => cmap.has(String(ch).codePointAt(0)),
    /** largura aproximada (sem kerning) de um texto em px, para tamanho em px (em) */
    larguraTexto(texto, emPx, espacamentoPx = 0) {
      let u = 0;
      const chars = [...String(texto)];
      for (const ch of chars) {
        const g = cmap.get(ch.codePointAt(0));
        u += g ? avancoGlifo(g) : upm * 0.55;
      }
      return (u / upm) * emPx + Math.max(0, chars.length - 1) * espacamentoPx;
    }
  };
}

/** px do padrão (em, como PIL/CapCut/Figma) -> Fontsize do ASS para o libass desenhar do MESMO tamanho */
function fontsizeAss(fonte, emPx) {
  return Math.round(emPx * fonte.fatorLibass * 100) / 100;
}

/** altura medida de letra MAIÚSCULA no quadro (px) -> tamanho em px (em) */
function emPorAlturaMaiuscula(fonte, alturaMaiusculaPx) {
  const r = fonte && fonte.capHeightRazao ? fonte.capHeightRazao : 0.7;
  return alturaMaiusculaPx / r;
}

/**
 * Nome para o campo Fontname do ASS (sempre com Bold=0 e Italic=0 no estilo: o peso vem do ARQUIVO).
 * - Fonte estática: nome completo (ex.: "Montserrat ExtraBold"). É o único caminho confiável.
 * - Fonte variável: o libass NÃO escolhe instância (testado libass 0.17.5 / ffmpeg 9:
 *   "Montserrat ExtraBold" -> ArialMT; "Montserrat" + Bold=-1 -> Thin com negrito FALSO).
 *   Por isso o motor converte a variável em estática antes (garantirEstatica). Este ramo só
 *   devolve o nome que a instância TERIA, para mensagens.
 */
function nomeParaAss(fonte, peso, italico = false) {
  if (!fonte.variavel) return fonte.nomeCompleto || fonte.familiaWindows || fonte.familia;
  const alvo = Number(peso) || 400;
  const cands = fonte.instancias.filter((i) => /italic/i.test(i.nome) === Boolean(italico) || !fonte.instancias.some((j) => /italic/i.test(j.nome)));
  const lista = cands.length ? cands : fonte.instancias;
  if (!lista.length) return fonte.familia;
  let melhor = lista[0];
  for (const i of lista) {
    if (Math.abs((i.coords.wght || 400) - alvo) < Math.abs((melhor.coords.wght || 400) - alvo)) melhor = i;
  }
  return /^regular$/i.test(melhor.nome) ? fonte.familia : `${fonte.familia} ${melhor.nome}`;
}

/** Avisos que o motor deve mostrar ANTES de renderizar. */
function avisosFonte(fonte, pesoDesejado) {
  const av = [];
  if (fonte.acentosFaltando.length) {
    av.push(`A fonte ${fonte.familia} não tem: ${fonte.acentosFaltando.join(" ")} (o acento vira quadrado ou some).`);
  }
  if (fonte.variavel) {
    av.push(
      `${path.basename(fonte.arquivo)} é fonte VARIÁVEL (peso padrão ${fonte.pesoPadraoVariavel}). ` +
        `O libass não escolhe o peso de fonte variável (sai fina, com negrito falso ou troca por Arial). ` +
        `O motor gera um TTF estático "${nomeParaAss(fonte, pesoDesejado || 800)}" com fontTools; ` +
        `o ideal é guardar o TTF estático do peso certo em assets/.`
    );
  } else if (pesoDesejado && fonte.peso && Math.abs(fonte.peso - pesoDesejado) >= 100) {
    av.push(`Peso pedido ${pesoDesejado}, mas o arquivo é peso ${fonte.peso} (${fonte.nomeCompleto}).`);
  }
  return av;
}

/**
 * Calibra a largura REAL desenhada pelo libass (peso da instância variável, kerning)
 * contra a estimativa por hmtx. Fonte variável guarda no hmtx a largura do peso
 * padrão (ex.: Thin 100); o ExtraBold é bem mais largo -> sem calibrar, a quebra
 * de linha deixa passar da largura máxima. Faz 1 render pequeno com ffmpeg e guarda.
 * Devolve o fator (real / estimado). Se o ffmpeg falhar, devolve 1 e o motor avisa.
 */
const _cacheCal = new Map();
function calibrarLargura(fonte, peso, italico = false, ffmpegBin = "ffmpeg") {
  const chave = `${fonte.arquivo}|${peso}|${italico}`;
  if (_cacheCal.has(chave)) return _cacheCal.get(chave);
  const os = require("os");
  const { spawnSync } = require("child_process");
  const amostra = "AÇÃO NO CAMPO VAI SE ALONGAR ninguém esperava 2030";
  const em = 100;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "calfonte_"));
  let fator = 1;
  try {
    fs.copyFileSync(fonte.arquivo, path.join(tmp, path.basename(fonte.arquivo)));
    const ass = [
      "[Script Info]", "ScriptType: v4.00+", "PlayResX: 4000", "PlayResY: 300", "ScaledBorderAndShadow: yes", "",
      "[V4+ Styles]",
      "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
      `Style: C,${nomeParaAss(fonte, peso, italico)},${fontsizeAss(fonte, em)},&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,5,0,0,0,1`,
      "", "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
      `Dialogue: 0,0:00:00.00,0:00:01.00,C,,0,0,0,,{\\pos(2000,150)}${amostra}`, ""
    ].join("\n");
    fs.writeFileSync(path.join(tmp, "c.ass"), ass, "utf8");
    const r = spawnSync(ffmpegBin, ["-v", "error", "-f", "lavfi", "-i", "color=c=black:s=4000x300:d=1", "-vf", "subtitles=c.ass:fontsdir=.",
      "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "gray", "-"], { cwd: tmp, maxBuffer: 4000 * 300 + 1024, windowsHide: true });
    if (r.status === 0 && r.stdout && r.stdout.length >= 4000 * 300) {
      let x0 = 4000, x1 = -1;
      for (let y = 0; y < 300; y++) for (let x = 0; x < 4000; x++) if (r.stdout[y * 4000 + x] > 128) { if (x < x0) x0 = x; if (x > x1) x1 = x; }
      const est = fonte.larguraTexto(amostra, em);
      if (x1 > x0 && est > 0) fator = (x1 - x0 + 1) / est;
    }
  } catch (_) { /* fica 1 */ }
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
  _cacheCal.set(chave, fator);
  return fator;
}

/**
 * Python de verdade. No Windows, "python" no PATH costuma ser o ATALHO da Microsoft Store
 * (WindowsApps\python.exe), que não roda nada quando chamado pelo Node. Ordem:
 * MOTOR_PYTHON (env) > %LOCALAPPDATA%\Programs\Python\Python3xx\python.exe > py > python3 > python.
 */
function candidatosPython() {
  const out = [];
  if (process.env.MOTOR_PYTHON) out.push(process.env.MOTOR_PYTHON);
  if (process.platform === "win32") {
    const bases = [
      process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Programs", "Python"),
      process.env.ProgramFiles, process.env["ProgramFiles(x86)"]
    ].filter(Boolean);
    for (const b of bases) {
      try {
        fs.readdirSync(b).filter((d) => /^Python3\d+/i.test(d)).sort().reverse()
          .forEach((d) => { const p = path.join(b, d, "python.exe"); if (fs.existsSync(p)) out.push(p); });
      } catch (_) {}
    }
    out.push("py", "python3", "python");
  } else {
    out.push("/opt/homebrew/bin/python3", "/usr/local/bin/python3", "python3", "python");
  }
  return out;
}

/**
 * Fonte variável -> TTF estático do peso pedido (fontTools varLib.instancer), em cache.
 * Fonte estática -> devolve o próprio arquivo.
 * Precisa de Python com fonttools (pip install fonttools). Se não houver, lança erro claro.
 */
function garantirEstatica(arquivo, peso, italico = false, cacheDir = null) {
  const f = lerFonte(arquivo);
  if (!f.variavel) return arquivo;
  const os = require("os");
  const { spawnSync } = require("child_process");
  const dir = cacheDir || path.join(os.tmpdir(), "motor_padrao_fontes");
  fs.mkdirSync(dir, { recursive: true });
  const st = fs.statSync(arquivo);
  const nome = nomeParaAss(f, peso, italico).replace(/[^A-Za-z0-9]+/g, "-");
  const destino = path.join(dir, `${nome}-${Math.round(st.mtimeMs)}-${st.size}.ttf`);
  if (fs.existsSync(destino)) return destino;
  // cópia num caminho curto: Python no Windows não abre caminhos > 260 caracteres (OneDrive, pastas fundas)
  const origemCurta = path.join(dir, `vf-${Math.round(st.mtimeMs)}-${st.size}${path.extname(arquivo)}`);
  if (!fs.existsSync(origemCurta)) fs.copyFileSync(arquivo, origemCurta);
  arquivo = origemCurta;
  const eixos = (f.eixos || []).map((e) => {
    if (e.tag === "wght") return `wght=${Math.max(e.min, Math.min(e.max, Number(peso) || e.padrao))}`;
    if (e.tag === "ital") return `ital=${italico ? 1 : 0}`;
    return `${e.tag}=${e.padrao}`;
  });
  const tentativas = candidatosPython();
  let ultimoErro = "";
  for (const py of tentativas) {
    for (const extra of [["--update-name-table"], []]) {
      const r = spawnSync(py, ["-m", "fontTools.varLib.instancer", arquivo, ...eixos, "-o", destino, ...extra], { encoding: "utf8", windowsHide: true });
      if (r.status === 0 && fs.existsSync(destino)) return destino;
      ultimoErro = (r.stderr || r.error || "").toString().slice(-300);
    }
  }
  throw new Error(
    `A fonte ${path.basename(arquivo)} é variável e o libass não usa o peso ${peso} dela. ` +
    `Instale o fontTools (pip install fonttools) para o motor converter, ou coloque o TTF ESTÁTICO do peso ${peso} em assets/. ` +
    `Detalhe: ${ultimoErro}`
  );
}

module.exports = { lerFonte, fontsizeAss, emPorAlturaMaiuscula, nomeParaAss, avisosFonte, calibrarLargura, garantirEstatica, ACENTOS_PT };

if (require.main === module) {
  const arq = process.argv[2];
  if (!arq) {
    console.log("uso: node fontes.js <fonte.ttf> [tamanho_px]");
    process.exit(1);
  }
  const f = lerFonte(arq);
  const px = Number(process.argv[3]) || 60;
  console.log(JSON.stringify({
    familia: f.familia, familiaWindows: f.familiaWindows, nomeCompleto: f.nomeCompleto, subfamilia: f.subfamilia,
    peso: f.peso, variavel: f.variavel, pesoPadraoVariavel: f.pesoPadraoVariavel, unitsPerEm: f.unitsPerEm,
    os2: f.os2, hhea: f.hhea, fatorLibass: +f.fatorLibass.toFixed(4), capHeightRazao: +f.capHeightRazao.toFixed(4),
    instancias: f.instancias.map((i) => `${i.nome} (${JSON.stringify(i.coords)})`),
    nomeParaAss_800: nomeParaAss(f, 800), [`fontsizeAss(${px}px)`]: fontsizeAss(f, px),
    larguraTeste: Math.round(f.larguraTexto("VAI SE ALONGAR", px)), acentosFaltando: f.acentosFaltando,
    avisos: avisosFonte(f, 800)
  }, null, 2));
}
