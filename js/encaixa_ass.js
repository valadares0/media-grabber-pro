// ============================================================================
// Encaixa Corporativo B2B — Motor de Tipografia Cinética Editorial (ASS)
// Baseado no estudo quadro-a-quadro da referência B2B (pin_2.mp4):
//   1. Contraste tipográfico triplo: Montserrat Light + Montserrat ExtraBold + Playfair Display Bold Italic
//   2. Entrada ótica blur-to-sharp + wipe horizontal (\clip) + slide-up suave
//   3. Tarja riscada laranja brilhante animada (glow + core) em palavras de risco/erro
//   4. Composição editorial escalonada (Gancho inicial & Clímax/CTA final)
//   5. Flash cards corporativos full-screen (Laranja -> Branco -> Laranja)
//   6. Legendas minimalistas delicadas no corpo do vídeo
// ============================================================================

const STOPWORDS = new Set([
  "um", "uma", "uns", "umas", "o", "a", "os", "as", "no", "na", "nos", "nas",
  "do", "da", "dos", "das", "de", "em", "para", "pra", "por", "com", "sem",
  "que", "se", "e", "ou", "mas", "ao", "aos", "à", "às", "seu", "sua", "seus",
  "suas", "meu", "minha", "nosso", "nossa", "pode", "vai", "é", "são", "ter",
  "esse", "essa", "isso", "este", "esta", "isto", "num", "numa", "pelo", "pela"
]);

const NEGATIVE_KEYWORDS = new Set([
  "erro", "erros", "falha", "falhas", "falhar", "risco", "riscos", "comprometer",
  "problema", "problemas", "perder", "perda", "custo", "custos", "prejuízo",
  "prejuizo", "crítico", "critico", "falta", "travamento", "errado", "errada",
  "ruim", "pior", "nunca", "jamais", "quebra", "quebrar", "atraso", "dano",
  "danos", "cair", "cai", "zero", "lento", "caro", "medo", "perigo"
]);

const POSITIVE_KEYWORDS = new Set([
  "mercadoria", "mercadorias", "segurança", "seguranca", "resultado", "resultados",
  "empresa", "empresas", "negócio", "negocio", "lucro", "qualidade", "sucesso",
  "cliente", "clientes", "venda", "vendas", "solução", "solucao", "valor",
  "embalamento", "transporte", "trabalho", "meses", "anos", "futuro", "dinheiro",
  "crescimento", "marca", "processo", "eficiência", "eficiencia", "controle"
]);

function assTime(t) {
  t = Math.max(0, t);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = (t % 60).toFixed(2).padStart(5, "0");
  return `${h}:${String(m).padStart(2, "0")}:${s}`;
}

function esc(s) {
  return String(s || "").replace(/[{}\\]/g, "").replace(/\n/g, " ").trim();
}

function cleanWord(w) {
  return esc(w).toLowerCase().replace(/[.,!?;:()"'«»—–-]/g, "");
}

function isStopword(w) {
  return STOPWORDS.has(cleanWord(w));
}

function isNegative(w) {
  return NEGATIVE_KEYWORDS.has(cleanWord(w));
}

function isPositive(w) {
  return POSITIVE_KEYWORDS.has(cleanWord(w));
}

// Estima largura aproximada em pixels para posicionar elementos escalonados com precisão
function approxTextWidth(text, fontSize, tracking = 0, bold = false) {
  const factor = bold ? 0.56 : 0.48;
  return Math.round(text.length * (fontSize * factor + tracking));
}

// Agrupa palavras em batidas editoriais (2 a 5 palavras, respeitando pontuações e pausas)
function groupIntoBeats(ws, minWords = 2, maxWords = 5) {
  const beats = [];
  let cur = [];
  for (let i = 0; i < ws.length; i++) {
    const w = ws[i];
    cur.push(w);
    const next = ws[i + 1];
    const gap = next ? (next.t - (w.e || w.t + 0.35)) : 99;
    const hasPunct = /[.,!?;:]$/.test(w.w);
    if (cur.length >= maxWords || (cur.length >= minWords && (hasPunct || gap > 0.32)) || !next) {
      beats.push(cur);
      cur = [];
    }
  }
  return beats;
}

// Gera uma batida editorial escalonada (connector pequeno + âncora forte/serifada + cauda)
function renderStaggeredBeat(beat, s, e, anchorX, anchorY, scale, events, allowStrike = true) {
  const durMs = Math.max(250, Math.round((e - s) * 1000));
  const texts = beat.map((x) => esc(x.w));

  // Escolhe a palavra-âncora (prioridade: negativa -> positiva -> palavra mais longa não-stopword)
  let anchorIdx = -1;
  for (let i = 0; i < texts.length; i++) {
    if (isNegative(texts[i]) || isPositive(texts[i])) {
      anchorIdx = i;
      break;
    }
  }
  if (anchorIdx === -1) {
    let bestLen = -1;
    for (let i = 0; i < texts.length; i++) {
      const cw = cleanWord(texts[i]);
      const score = (isStopword(cw) ? 0 : 10) + cw.length;
      if (score > bestLen) { bestLen = score; anchorIdx = i; }
    }
  }
  if (anchorIdx < 0) anchorIdx = 0;

  const preWords = texts.slice(0, anchorIdx);
  const anchorWord = texts[anchorIdx];
  const postWords = texts.slice(anchorIdx + 1);

  const neg = isNegative(anchorWord);
  const pos = isPositive(anchorWord);
  const useSerif = neg || pos || anchorWord.length >= 8;

  const fLight = Math.round(52 * scale);
  const fBold = Math.round(110 * scale);
  const fSerif = Math.round(118 * scale);
  const anchorSize = useSerif ? fSerif : fBold;
  const anchorStyle = useSerif ? (neg ? "EncaixaSerifWhite" : "EncaixaSerifOrange") : "EncaixaBold";
  const anchorW = Math.max(Math.round(220 * scale), approxTextWidth(anchorWord, anchorSize, -2, true));

  const fadeOut = Math.min(140, Math.round(durMs * 0.2));

  // 1) Palavras conectoras antes da âncora (topo esquerdo, delicadas)
  if (preWords.length > 0) {
    const preText = preWords.join(" ");
    const preX = Math.round(anchorX - anchorW * 0.48);
    const preY = Math.round(anchorY - anchorSize * 0.52);
    events.push(
      `Dialogue: 2,${assTime(s)},${assTime(e)},EncaixaLight,,0,0,0,,` +
      `{\\an1\\pos(${preX},${preY})\\blur5\\t(0,160,\\blur0)\\fad(120,${fadeOut})}${preText}`
    );
  }

  // 2) Palavra-âncora principal (centro com reveal horizontal \clip + blur-to-sharp)
  const anchorDelay = preWords.length > 0 ? 0.08 : 0.0;
  const as = Math.min(e - 0.15, s + anchorDelay);
  const clipLeft = Math.round(anchorX - anchorW * 0.65);
  const clipRight = Math.round(anchorX + anchorW * 0.65);
  const clipTop = Math.round(anchorY - anchorSize * 0.85);
  const clipBot = Math.round(anchorY + anchorSize * 0.85);
  const revealMs = Math.min(280, Math.max(140, Math.round((e - as) * 450)));

  events.push(
    `Dialogue: 2,${assTime(as)},${assTime(e)},${anchorStyle},,0,0,0,,` +
    `{\\an5\\pos(${anchorX},${anchorY})\\blur5\\t(0,180,\\blur0)` +
    `\\clip(${clipLeft},${clipTop},${clipLeft + 18},${clipBot})` +
    `\\t(0,${revealMs},\\clip(${clipLeft},${clipTop},${clipRight},${clipBot}))` +
    `\\fad(80,${fadeOut})}${anchorWord}`
  );

  // 3) Tarja riscada laranja brilhante animada se for palavra negativa/impacto
  if (allowStrike && neg && (e - as) > 0.45) {
    const ss = as + Math.min(0.24, (e - as) * 0.35);
    const barHalfW = Math.round(anchorW * 0.54);
    const barX1 = anchorX - barHalfW;
    const barX2 = anchorX + barHalfW;
    const barY = Math.round(anchorY + anchorSize * 0.05);
    const barH = Math.max(4, Math.round(7 * scale));
    const swMs = Math.min(260, Math.max(120, Math.round((e - ss) * 500)));
    const rect = `m ${barX1} ${barY - barH} l ${barX2} ${barY - barH} l ${barX2} ${barY + barH} l ${barX1} ${barY + barH}`;

    // Camada de brilho (glow) laranja
    events.push(
      `Dialogue: 3,${assTime(ss)},${assTime(e)},EncaixaDraw,,0,0,0,,` +
      `{\\an7\\pos(0,0)\\c&H045DE8&\\3c&H045DE8&\\bord${Math.round(6 * scale)}\\blur8\\alpha&H68&` +
      `\\clip(${barX1 - 15},${barY - 25},${barX1},${barY + 25})` +
      `\\t(0,${swMs},\\clip(${barX1 - 15},${barY - 25},${barX2 + 15},${barY + 25}))` +
      `\\fad(40,${fadeOut})\\p1}${rect}{\\p0}`
    );
    // Núcleo nítido da tarja laranja
    events.push(
      `Dialogue: 4,${assTime(ss)},${assTime(e)},EncaixaDraw,,0,0,0,,` +
      `{\\an7\\pos(0,0)\\c&H045DE8&\\bord0\\blur0.8` +
      `\\clip(${barX1 - 5},${barY - 15},${barX1},${barY + 15})` +
      `\\t(0,${swMs},\\clip(${barX1 - 5},${barY - 15},${barX2 + 5},${barY + 15}))` +
      `\\fad(40,${fadeOut})\\p1}${rect}{\\p0}`
    );
  }

  // 4) Frase complementar abaixo (à direita/abaixo da âncora, com slide-up suave)
  if (postWords.length > 0) {
    const postDelay = Math.min((e - s) * 0.4, 0.35);
    const ps = Math.min(e - 0.15, s + postDelay);
    const lastW = postWords[postWords.length - 1];
    const lastIsSpecial = postWords.length >= 2 && !isStopword(lastW) && (isPositive(lastW) || lastW.length >= 7);

    const postY = Math.round(anchorY + anchorSize * 0.72);
    const postSlideStart = postY + Math.round(16 * scale);

    if (lastIsSpecial) {
      const lead = postWords.slice(0, -1).join(" ");
      const leadW = approxTextWidth(lead, fLight, -1, false);
      const specW = approxTextWidth(lastW, Math.round(52 * scale), -1, true);
      const totalW = leadW + Math.round(14 * scale) + specW;
      const startX = Math.round(anchorX + anchorW * 0.48 - totalW);

      events.push(
        `Dialogue: 2,${assTime(ps)},${assTime(e)},EncaixaLight,,0,0,0,,` +
        `{\\an4\\move(${startX},${postSlideStart},${startX},${postY},0,180)\\blur4\\t(0,160,\\blur0)\\fad(90,${fadeOut})}${lead}`
      );
      const specX = startX + leadW + Math.round(14 * scale);
      events.push(
        `Dialogue: 2,${assTime(ps + 0.05)},${assTime(e)},EncaixaSerifOrange,,0,0,0,,` +
        `{\\an4\\fs${Math.round(54 * scale)}\\move(${specX},${postSlideStart},${specX},${postY},0,180)\\blur4\\t(0,180,\\blur0)\\fad(90,${fadeOut})}${lastW}`
      );
    } else {
      const postText = postWords.join(" ");
      const postX = Math.round(anchorX + anchorW * 0.48);
      events.push(
        `Dialogue: 2,${assTime(ps)},${assTime(e)},EncaixaLight,,0,0,0,,` +
        `{\\an6\\move(${postX},${postSlideStart},${postX},${postY},0,180)\\blur4\\t(0,160,\\blur0)\\fad(90,${fadeOut})}${postText}`
      );
    }
  }
}

// Gera sequência de Flash Cards Color-Block (Laranja -> Branco -> Laranja) estilo pin_2.mp4
function renderColorBlockFlash(beat, s, e, W, H, scale, events) {
  const texts = beat.map((x) => esc(x.w));
  if (texts.length < 2) return false;

  // Divide em 3 blocos visuais (ou 2 se tiver só 2 palavras)
  let chunks;
  if (texts.length === 2) {
    chunks = [texts[0], texts[1]];
  } else if (texts.length === 3) {
    chunks = [texts[0], texts[1], texts[2]];
  } else {
    const mid = Math.ceil(texts.length / 3);
    chunks = [
      texts.slice(0, mid).join(" "),
      texts.slice(mid, mid * 2).join(" "),
      texts.slice(mid * 2).join(" ")
    ].filter(Boolean);
  }

  const totalDur = Math.max(0.9, e - s);
  const step = totalDur / chunks.length;
  const cx = Math.round(W / 2);
  const cy = Math.round(H / 2);
  const fullRect = `m 0 0 l ${W} 0 l ${W} ${H} l 0 ${H}`;

  chunks.forEach((txt, idx) => {
    const cs = s + idx * step;
    const ce = s + (idx + 1) * step;
    const isWhiteBg = idx % 2 === 1;
    const bgHex = isWhiteBg ? "&H00F5F5F5&" : "&H00045DE8&";
    const txtHex = isWhiteBg ? "&H00045DE8&" : "&H00FFFFFF&";

    events.push(
      `Dialogue: 5,${assTime(cs)},${assTime(ce)},EncaixaDraw,,0,0,0,,` +
      `{\\an7\\pos(0,0)\\c${bgHex}\\bord0\\p1}${fullRect}{\\p0}`
    );
    events.push(
      `Dialogue: 6,${assTime(cs)},${assTime(ce)},EncaixaFlash,,0,0,0,,` +
      `{\\an5\\pos(${cx},${cy})\\c${txtHex}\\fs${Math.round(78 * scale)}\\blur4\\t(0,110,\\blur0)}${txt}`
    );
  });
  return true;
}

function buildEncaixaAss(words, clipStart, clipEnd, opts, W, H) {
  const scale = W / 1080;
  const dur = Math.max(1, clipEnd - clipStart);
  const ws = words.filter((w) => w.t >= clipStart - 0.05 && w.t < clipEnd);

  let ass = `[Script Info]
ScriptType: v4.00+
PlayResX: ${W}
PlayResY: ${H}
WrapStyle: 1

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: EncaixaLight,Poppins Light,${Math.round(52 * scale)},&H00FFFFFF,&H00FFFFFF,&H00000000,&HB0000000,0,0,0,0,100,100,-1,0,1,1.2,2.5,5,40,40,0,1
Style: EncaixaBold,Poppins ExtraBold,${Math.round(110 * scale)},&H00FFFFFF,&H00FFFFFF,&H00000000,&HC0000000,-1,0,0,0,100,100,-3,0,1,1.5,3.5,5,40,40,0,1
Style: EncaixaSerifOrange,Playfair Display,${Math.round(118 * scale)},&H00045DE8,&H00045DE8,&H00000000,&HC0000000,-1,-1,0,0,100,100,-2,0,1,1.5,3.5,5,40,40,0,1
Style: EncaixaSerifWhite,Playfair Display,${Math.round(118 * scale)},&H00FFFFFF,&H00FFFFFF,&H00000000,&HC0000000,-1,-1,0,0,100,100,-2,0,1,1.5,3.5,5,40,40,0,1
Style: EncaixaFlash,Poppins,${Math.round(78 * scale)},&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,-1,0,1,0,0,5,60,60,0,1
Style: EncaixaBody,Poppins,${Math.round(58 * scale)},&H00FFFFFF,&H00045DE8,&H00000000,&HC0000000,0,0,0,0,100,100,-0.5,0,1,2.2,3,2,70,70,${Math.round(H * 0.20)},1
Style: EncaixaDraw,Poppins,20,&H00045DE8,&H00045DE8,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  if (!ws.length || opts.captions === false) {
    return ass;
  }

  const events = [];
  const allBeats = groupIntoBeats(ws, 2, 5);
  const cx = Math.round(W * 0.5);

  // Fase 1: Primeiros 2 a 3 beats (até ~5s) -> Tipografia Cinética Escalonada
  // Fase 2: Próximo beat curto (entre ~4s e ~7.5s) -> Flash Cards Laranja/Branco/Laranja
  // Fase 3: Corpo -> Legenda minimalista delicada com acentos serifados sutis
  // Fase 4: Último beat (clímax/CTA nos últimos ~3.5s) -> Volta à composição editorial escalonada

  let flashDone = false;
  const lastBeatIdx = allBeats.length - 1;

  allBeats.forEach((beat, idx) => {
    const s = Math.max(0, beat[0].t - clipStart);
    const nextBeat = allBeats[idx + 1];
    const rawEnd = nextBeat ? nextBeat[0].t - clipStart : (beat[beat.length - 1].e || beat[beat.length - 1].t + 0.8) - clipStart;
    const e = Math.min(dur, Math.max(s + 0.35, rawEnd));
    if (e <= s) return;

    // Beat 0 (abertura): acima da cabeça (20%) se curto, senão terço médio-inferior (66%)
    if (idx === 0) {
      const yPos = beat.length <= 2 ? Math.round(H * 0.20) : Math.round(H * 0.66);
      renderStaggeredBeat(beat, s, e, cx, yPos, scale, events, true);
      return;
    }

    // Beats 1 e 2 dentro dos primeiros 5.2s: composição escalonada no terço médio-inferior
    if (idx <= 2 && s < 5.2) {
      const yPos = Math.round(H * 0.66);
      renderStaggeredBeat(beat, s, e, cx, yPos, scale, events, true);
      return;
    }

    // Flash card color-block (1 vez por clipe, entre 4.2s e 8.5s)
    if (!flashDone && s >= 3.8 && s <= 8.5 && beat.length >= 2 && (e - s) >= 0.85) {
      flashDone = renderColorBlockFlash(beat, s, e, W, H, scale, events);
      if (flashDone) return;
    }

    // Clímax / CTA final (último beat se clipe > 12s e beat tiver 3+ palavras)
    if (idx === lastBeatIdx && dur > 12 && beat.length >= 3 && (e - s) >= 1.2) {
      renderStaggeredBeat(beat, s, e, cx, Math.round(H * 0.58), scale, events, false);
      return;
    }

    // Corpo do vídeo: legenda minimalista delicada com micro-destaque editorial
    const lineWords = beat.map((x) => {
      const t = esc(x.w);
      if (isPositive(t)) {
        return `{\\fnPlayfair Display\\b1\\i1\\c&H00045DE8&}${t}{\\rEncaixaBody}`;
      }
      if (isNegative(t)) {
        return `{\\fnPoppins ExtraBold\\b1}${t}{\\rEncaixaBody}`;
      }
      return t;
    }).join(" ");

    events.push(
      `Dialogue: 1,${assTime(s)},${assTime(e)},EncaixaBody,,0,0,0,,{\\blur2\\t(0,110,\\blur0)\\fad(100,90)}${lineWords}`
    );
  });

  ass += events.join("\n") + "\n";
  return ass;
}

module.exports = { buildEncaixaAss };
