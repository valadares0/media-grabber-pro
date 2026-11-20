# 03 — Regras universais (valem para todo cliente)

Cada regra abaixo nasceu de uma reprovação ou correção real do usuário. Onde um cliente tem regra diferente, o `PADRAO.md` do cliente vence.

## Processo
1. **Ler antes de cortar.** PADRAO.md + PDF + quadros de referência antes do primeiro corte.
2. **Medir, não descrever.** Toda posição/tamanho vem de medida em pixel num quadro 1080×1920 (ver `08_...`). Nunca "deixar o layout por conta de quem renderiza".
3. **Nada de estilo inventado.** Sem padrão para aquilo? Proponha o mais sóbrio dentro do padrão e peça OK. O usuário já rejeitou: cor "cinematográfica" pesada, glitch, neon, celular dourado, balanço, flutuação "infantilizada".
4. **Aprovação.** Todo vídeo vai para o usuário antes de qualquer envio. A IA não envia nada ao cliente.
5. **Não invente dados.** Preço, taxa, data, nome, número: use só o que o usuário/arquivo confirmou. Sem PNG correspondente? Pergunte.
6. **Pastas.** Brutos e `padrao_*` são só leitura. Trabalho em `edicoes/<video>/` (ou `edicao_<ia>/` se duas IAs editam o mesmo vídeo; nunca toque na pasta da outra).

## Texto na tela
7. **Acentuação conferida no quadro renderizado.** O erro típico: fonte sem glifo → acento vira quadrado/some. Renderize um quadro-teste com a frase mais acentuada e abra o PNG. (Ex.: ç ã é ô à.)
8. **Fonte é da marca do cliente.** Nunca usar fonte de outro cliente. Uma família só por cliente quando o padrão disser.
9. **Mantenha a fala como foi dita** ("cê", "tá", "pra", "né?"). Não "corrija" para português formal.
10. **Legenda acompanha a voz, sem adiantar.** Bloco nunca atravessa um corte.
11. **Frase em destaque não se repete na legenda.** Se título/destaque (ex.: branca + palavra dourada) já mostra a frase, a legenda de baixo NÃO a repete; se só parte repete, a legenda fica só com a parte que não repete. (Regra do usuário, 06/11/2026; automática em `gaia_regras.py`.)
12. **Zona proibida da UI do Instagram:** topo 0–220 px, base 1700–1920 px, coluna direita x > 960 não recebem texto importante.
13. **Legenda não cobre o rosto.** Ajuste a altura do bloco (plano fechado × aberto).
14. **Contraste:** sombra suave preta; sem caixa/contorno salvo se o PADRAO mandar.

## Elementos e animações
15. **Elemento (selo, preço, data, logo falado) entra quando a pessoa fala o assunto e fica até ela mudar de assunto ou a cena acabar — o que vier primeiro. Sai no corte, sem animação de saída.** (Marca/Leilão/Toagro; preço sobre vários B-rolls usa "hold".)
16. **Entrada curta e específica do cliente:** máquina de escrever 0,3 s (Marca), pop com rebote 0,3 s (Marca), crescer 60→100% com fade 0,3 s freando (Leilão), desfoque→foco 0,3 s (Gaia título). Não misture estilos de animação entre clientes.
17. **Sem efeitos proibidos pelo cliente:** consulte "Proibido" no PADRAO (ex.: Leilão proíbe quique, tremida, glitch, neon, emoji, zoom punch; Toagro proíbe brilho, neon, glitch, 3D, grão, aberração; Marca proíbe glitch, brilho, neon, 3D, tremida).
18. **Logo é o arquivo oficial.** Nunca digitar o nome da marca, esticar, recolorir ou separar marcas combinadas. Use a versão certa (colorida/branca/preta) para o fundo.

## B-roll e ritmo
19. **B-roll mostra o que está sendo dito naquele segundo** (fala "mapa" → mostra mapa). Footage **real** do cliente; nunca imagem gerada por IA como B-roll.
20. **Duração mínima de cena de apoio:** Gaia 2,5 s; Marca 1,5–2,5 s com cortes na batida; Toagro 1,5–4 s. Cena nunca mais curta que o padrão do cliente.
21. **Confira B-roll antes de usar:** texto/marca d'água queimados, tarja preta, recorte que corta cabeça, clipe vertical esticado. Clipe vertical → tela cheia (`cover`), não na faixa do topo.
22. **Cenas de apoio no mesmo assunto da fala e na ordem da história**; nada de pessoas cortadas só pernas/tronco.
23. **Ritmo:** algo novo na tela a cada 2–4 s (Toagro), 4–6 s (Gaia/Marca/agência ~4 s). Zoom só junto com corte da fala (Gaia: nunca trocar zoom em menos de 2,5 s).
24. **Gancho:** começa na frase mais forte, sem "oi/então". Os 3 primeiros segundos decidem.

## Cor e áudio
25. **iPhone HDR → SDR** antes de tudo (libplacebo). Depois só exposição e balanço leves. Grade pesada foi reprovada.
26. **Voz na frente, limpa.** Trilha baixa, sobe no fechamento, sai em fade. Final −14 LUFS. Música: só se o padrão pedir; no estilo agência não se põe trilha.
27. **Efeitos sonoros** (woosh/ding) só onde o padrão do cliente usa (Gaia: Woosh 0,28, Title Swoosh 0,38, Woosh Motion 0,60, ding 0,32; música 0,08).

## Estrutura
28. **Fechamento é assinatura do cliente:** Toagro tela preta + logo branca 1–2 s; Marca preto + logo 655 px em fade 0,4 s; Gaia branco + logos coloridos com zoom lento ~2 s; Leilão papel com logo gravado ~5 s.
29. **Duração-alvo:** Toagro 15–45 s; Marca 18–35 s; Leilão 30–40 s; Gaia ~45–60 s (conforme fala). 1080×1920, 30 fps, H.264.
30. **Cada formato derivado** (16:9, 1:1) só depois do 9:16 aprovado, com os mesmos cortes (Marca: ver PDF p. 14).

## Honestidade na entrega
31. Liste o que foi conferido e o que não foi: **áudio nunca é ouvido pela IA**; valores/nomes a confirmar; acentos conferidos em quais quadros.
32. Se uma regra do PDF contradiz uma correção posterior do usuário, vale a correção (as skills registram essas correções por data).
