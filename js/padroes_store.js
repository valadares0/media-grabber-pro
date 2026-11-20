// =========================================================================
// Media Grabber Pro — Biblioteca de Padrões v2 (~/.mediagrabber/padroes/)
// Unifica padrões embutidos (motor_padrao/padroes), perfis v1 migrados
// (~/.mediagrabber/clients) e os presets legados em arquivos padrao.json v2.
// =========================================================================
"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const {
  carregarPadrao,
  validar,
  migrarPerfilV1,
  PADRAO_BASE
} = require("./motor_padrao/lib/padrao");

const MG_DIR = path.join(os.homedir(), ".mediagrabber");
const PADROES_DIR = path.join(MG_DIR, "padroes");
const LEGACY_CLIENTS_DIR = path.join(MG_DIR, "clients");
const EMBEDDED_PADROES_DIR = path.join(__dirname, "motor_padrao", "padroes");
const EXTENSION_FONTS_DIR = path.join(__dirname, "..", "assets", "fonts");

function sanitizeId(raw) {
  return String(raw || "padrao")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48) || "padrao";
}

function copyDirIfMissing(src, dst) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      copyDirIfMissing(s, d);
    } else if (!fs.existsSync(d)) {
      fs.copyFileSync(s, d);
    }
  }
}

function resolveDefaultFontFile() {
  const candidates = [
    path.join(EXTENSION_FONTS_DIR, "Montserrat-ExtraBold.ttf"),
    path.join(EXTENSION_FONTS_DIR, "Montserrat-Bold.ttf"),
    "C:\\Windows\\Fonts\\arialbd.ttf",
    "C:\\Windows\\Fonts\\segoeuib.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function buildPresetV2(id, nome, opts) {
  const p = JSON.parse(JSON.stringify(PADRAO_BASE));
  p.id = id;
  p.nome = nome;
  p.cliente = nome;
  p.proveniencia = { origem: "preset_embutido_v2" };
  p.pendencias = [];

  const fontFile = resolveDefaultFontFile();
  if (fontFile) {
    p.fontes = {
      principal: { arquivo: fontFile, peso: opts.peso || 800, italico: false }
    };
  } else {
    p.pendencias.push("Envie o arquivo TTF estático da fonte principal em assets/");
  }

  p.legenda.fonte = "principal";
  p.legenda.peso = opts.peso || 800;
  p.legenda.tamanho_px = opts.tamanho_px || 62;
  p.legenda.cor = opts.cor || "#FFFFFF";
  p.legenda.caixa = opts.caixa || "alta";
  p.legenda.centro_y = opts.centro_y || 1480;
  p.legenda.largura_max_px = 900;
  p.legenda.max_linhas = 2;
  p.legenda.palavra_ativa = opts.palavra_ativa || { modo: "cor", cor: opts.corAtiva || "#FFD400" };
  p.legenda.contorno = opts.contorno || { cor: "#000000", espessura_px: 3 };
  p.legenda.sombra = { cor: "#000000", opacidade: 0.75, dx: 0, dy: 4, desfoque: 6 };
  p.legenda.entrada = opts.entrada || "pop";

  if (opts.desativarLegenda) {
    p.legenda.ativo = false;
  }

  p.destaques = opts.destaques || [
    {
      id: "destaque",
      nome: "Destaque",
      quando: "palavras-chave de impacto, números ou promessa central",
      posicao: "linha_abaixo_da_legenda",
      fonte: "principal",
      peso: 800,
      tamanho_px: Math.round((opts.tamanho_px || 62) * 1.15),
      cor: opts.corAtiva || "#FFD400",
      caixa: "alta",
      espaco_px: 14,
      entrada: "pop",
      sincronia: "na_palavra",
      freq_por_video: { min: 1, max: 4 }
    }
  ];

  p.ritmo.cortar_pausas_acima_s = opts.pausa_s || 0.35;
  p.camera.zoom = opts.zoom || { modo: "no_corte_alternado", niveis: [1.0, 1.07], intervalo_min_s: 3.0 };
  p.broll.ativo = false;
  p.broll.ia_gerada_permitida = false;
  p.foco_ia = opts.foco || "";
  p.layout_padrao = opts.layout || "crop";
  return p;
}

const LEGACY_PRESETS = [
  ["tibapa", "Tibapa (Padrão Viral)", { cor: "#FFFFFF", corAtiva: "#00F0FF", tamanho_px: 64, caixa: "alta", pausa_s: 0.30, foco: "ganchos fortes, viradas rápidas e frases de alto impacto" }],
  ["mrbeast", "MrBeast (Impacto)", { cor: "#FFFFFF", corAtiva: "#FFE600", tamanho_px: 70, caixa: "alta", pausa_s: 0.22, foco: "ritmo acelerado, desafios, números e retenção máxima" }],
  ["hormozi", "Hormozi (Negócios)", { cor: "#FFFFFF", corAtiva: "#00FF66", tamanho_px: 66, caixa: "alta", pausa_s: 0.25, foco: "insights práticos de negócios, dinheiro, vendas e lições diretas" }],
  ["podcast", "Podcast (Conversa)", { cor: "#FFFFFF", corAtiva: "#FFAA00", tamanho_px: 58, caixa: "original", pausa_s: 0.45, layout: "blur", foco: "histórias envolventes, opiniões marcantes e cortes completos de raciocínio" }],
  ["encaixa", "Encaixa (Editorial Pro)", { cor: "#FFFFFF", corAtiva: "#FF6B00", tamanho_px: 64, caixa: "alta", centro_y: 1460, pausa_s: 0.22, zoom: { modo: "no_corte_alternado", niveis: [1.0, 1.08], intervalo_min_s: 2.5 }, foco: "clareza didática, ganchos fortes, dados concretos e ritmo editorial dinâmico" }],
  ["cinema", "Cinema (Minimalista)", { cor: "#F5F5F5", corAtiva: "#E5C158", tamanho_px: 52, caixa: "original", centro_y: 1580, pausa_s: 0.50, entrada: "fade", foco: "momentos emocionantes, reflexão e narrativa cinematográfica" }],
  ["raw", "Limpo (Sem Legenda)", { desativarLegenda: true, pausa_s: 0.45, foco: "melhores momentos completos sem intervenção visual" }]
];

let _initialized = false;

function initPadroesStore() {
  if (_initialized) return;
  _initialized = true;
  fs.mkdirSync(PADROES_DIR, { recursive: true });

  // 1) Copiar padrões embutidos de js/motor_padrao/padroes/*
  if (fs.existsSync(EMBEDDED_PADROES_DIR)) {
    for (const entry of fs.readdirSync(EMBEDDED_PADROES_DIR, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      copyDirIfMissing(path.join(EMBEDDED_PADROES_DIR, entry.name), path.join(PADROES_DIR, entry.name));
    }
  }

  // 2) Converter presets fixos legados para arquivos v2 se ainda não existirem
  for (const [id, nome, opts] of LEGACY_PRESETS) {
    const dir = path.join(PADROES_DIR, id);
    const file = path.join(dir, "padrao.json");
    if (!fs.existsSync(file)) {
      fs.mkdirSync(path.join(dir, "assets"), { recursive: true });
      const p = buildPresetV2(id, nome, opts);
      fs.writeFileSync(file, JSON.stringify(p, null, 2), "utf8");
    }
  }

  // 3) Migrar ~/.mediagrabber/clients/*.json (v1 -> v2) se ainda não migrados
  if (fs.existsSync(LEGACY_CLIENTS_DIR)) {
    for (const f of fs.readdirSync(LEGACY_CLIENTS_DIR)) {
      if (!f.endsWith(".json")) continue;
      try {
        const v1 = JSON.parse(fs.readFileSync(path.join(LEGACY_CLIENTS_DIR, f), "utf8"));
        const id = sanitizeId(v1.id || path.basename(f, ".json"));
        const dir = path.join(PADROES_DIR, id);
        const file = path.join(dir, "padrao.json");
        if (!fs.existsSync(file)) {
          fs.mkdirSync(path.join(dir, "assets"), { recursive: true });
          const v2 = migrarPerfilV1(v1);
          fs.writeFileSync(file, JSON.stringify(v2, null, 2), "utf8");
        }
      } catch (_) {}
    }
  }
}

function padraoFile(id) {
  initPadroesStore();
  return path.join(PADROES_DIR, sanitizeId(id), "padrao.json");
}

function getPadrao(id) {
  initPadroesStore();
  const file = padraoFile(id);
  if (!fs.existsSync(file)) return null;
  const res = carregarPadrao(file);
  return { ...res, file, dir: path.dirname(file) };
}

function listPadroes() {
  initPadroesStore();
  const out = [];
  for (const entry of fs.readdirSync(PADROES_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = path.join(PADROES_DIR, entry.name, "padrao.json");
    if (!fs.existsSync(file)) continue;
    try {
      const { padrao, erros, avisos } = carregarPadrao(file);
      const cartelaPng = path.join(PADROES_DIR, entry.name, "cartela.png");
      out.push({
        id: padrao.id || entry.name,
        nome: padrao.nome || entry.name,
        cliente: padrao.cliente || padrao.nome || entry.name,
        versao: padrao.versao || 2,
        foco_ia: padrao.foco_ia || "",
        layout_padrao: padrao.layout_padrao || "crop",
        pendencias: padrao.pendencias || [],
        erros,
        avisos,
        hasCartela: fs.existsSync(cartelaPng),
        padrao
      });
    } catch (e) {
      out.push({ id: entry.name, nome: entry.name, erros: [e.message], avisos: [], pendencias: [] });
    }
  }
  return out.sort((a, b) => a.nome.localeCompare(b.nome));
}

function savePadrao(id, rawPadrao, { force = false } = {}) {
  initPadroesStore();
  const cleanId = sanitizeId(id || rawPadrao.id || rawPadrao.nome);
  const dir = path.join(PADROES_DIR, cleanId);
  fs.mkdirSync(path.join(dir, "assets"), { recursive: true });
  const file = path.join(dir, "padrao.json");

  const copy = { ...rawPadrao, id: cleanId };
  const val = validar(copy, { exigirArquivos: false, dir });
  if (val.erros.length && !force) {
    return { ok: false, erros: val.erros, avisos: val.avisos };
  }

  // Versionamento: salva padrao.vN.json antes de sobrescrever
  if (fs.existsSync(file)) {
    const versions = fs.readdirSync(dir)
      .map((f) => f.match(/^padrao\.v(\d+)\.json$/))
      .filter(Boolean)
      .map((m) => Number(m[1]));
    const nextV = versions.length ? Math.max(...versions) + 1 : 1;
    fs.copyFileSync(file, path.join(dir, `padrao.v${nextV}.json`));
  }

  fs.writeFileSync(file, JSON.stringify(copy, null, 2), "utf8");
  return { ok: true, id: cleanId, file, erros: val.erros, avisos: val.avisos };
}

function addCorrecao(id, correcao) {
  const loaded = getPadrao(id);
  if (!loaded) return { ok: false, error: "Padrão não encontrado" };
  const p = JSON.parse(fs.readFileSync(loaded.file, "utf8"));
  p.correcoes = Array.isArray(p.correcoes) ? p.correcoes : [];
  p.correcoes.push({
    data: new Date().toISOString().slice(0, 10),
    origem: correcao.origem || "usuario",
    regra: String(correcao.regra || "").trim(),
    ...(correcao.campo ? { campo: String(correcao.campo).trim(), valor: correcao.valor } : {})
  });
  return savePadrao(id, p);
}

function saveAsset(id, filename, base64Data) {
  initPadroesStore();
  const cleanId = sanitizeId(id);
  const safeName = path.basename(String(filename || "asset.bin")).replace(/[^\w.\-]/g, "_");
  const dir = path.join(PADROES_DIR, cleanId, "assets");
  fs.mkdirSync(dir, { recursive: true });
  const dst = path.join(dir, safeName);
  const raw = String(base64Data || "").replace(/^data:[^;]+;base64,/, "");
  fs.writeFileSync(dst, Buffer.from(raw, "base64"));
  return { ok: true, path: dst, relPath: `assets/${safeName}` };
}

function deletePadrao(id) {
  initPadroesStore();
  const dir = path.join(PADROES_DIR, sanitizeId(id));
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  return { ok: true };
}

function prepararParaRender(rawPadrao, baseDir) {
  const p = JSON.parse(JSON.stringify(rawPadrao));
  const avisosFallback = [];
  const defaultFont = resolveDefaultFontFile();
  const resolveAsset = (rel) => {
    if (!rel) return null;
    if (path.isAbsolute(rel)) return rel;
    return baseDir ? path.resolve(baseDir, rel) : path.resolve(rel);
  };

  if (p.fontes && typeof p.fontes === "object") {
    for (const [k, f] of Object.entries(p.fontes)) {
      const full = resolveAsset(f?.arquivo);
      if (!full || !fs.existsSync(full)) {
        if (defaultFont) {
          p.fontes[k] = { ...f, arquivo: defaultFont };
          avisosFallback.push(`fonte "${k}" ausente -> usando fallback ${path.basename(defaultFont)}`);
        }
      } else {
        p.fontes[k] = { ...f, arquivo: full };
      }
    }
  }
  if (p.logo?.ativo) {
    const lf = resolveAsset(p.logo.arquivo);
    if (!lf || !fs.existsSync(lf)) {
      p.logo.ativo = false;
      avisosFallback.push("logo ausente -> desativado neste render");
    } else {
      p.logo.arquivo = lf;
    }
  }
  if (p.fechamento?.ativo) {
    const ff = resolveAsset(p.fechamento.logo || p.fechamento.clipe);
    if (!ff || !fs.existsSync(ff)) {
      p.fechamento.ativo = false;
      avisosFallback.push("fechamento ausente -> desativado neste render");
    }
  }
  if (Array.isArray(p.elementos?.biblioteca)) {
    p.elementos.biblioteca = p.elementos.biblioteca.filter((el) => {
      const ef = resolveAsset(el?.arquivo);
      if (!ef || !fs.existsSync(ef)) {
        avisosFallback.push(`elemento "${el?.id || "?"}" ausente -> ignorado`);
        return false;
      }
      el.arquivo = ef;
      return true;
    });
  }
  if (p.audio?.musica?.ativa) {
    const mf = resolveAsset(p.audio.musica.arquivo);
    if (!mf || !fs.existsSync(mf)) {
      p.audio.musica.ativa = false;
    } else {
      p.audio.musica.arquivo = mf;
    }
  }
  return { padrao: p, avisosFallback };
}

module.exports = {
  PADROES_DIR,
  initPadroesStore,
  listPadroes,
  getPadrao,
  savePadrao,
  addCorrecao,
  saveAsset,
  deletePadrao,
  padraoFile,
  prepararParaRender
};
