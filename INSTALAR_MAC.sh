#!/bin/bash
# =========================================================================
# Media Grabber Pro v4.5 - Instalador e Inicializador para macOS
# =========================================================================

echo "==================================================================="
echo "  ⚡ MEDIA GRABBER PRO - INSTALACAO NO MACOS (CHROME / BRAVE / EDGE)"
echo "==================================================================="
echo ""

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
cd "$SCRIPT_DIR"

# Configura ambiente Homebrew (Apple Silicon M1/M2/M3/M4 ou Intel)
if [ -f "/opt/homebrew/bin/brew" ]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
elif [ -f "/usr/local/bin/brew" ]; then
    eval "$(/usr/local/bin/brew shellenv)"
fi

# 1. Verifica Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js nao encontrado."
    if command -v brew &> /dev/null; then
        echo "📦 Instalando Node.js via Homebrew..."
        brew install node
    else
        echo "⚠️ Por favor, instale o Node.js em: https://nodejs.org"
        exit 1
    fi
else
    echo "✓ Node.js detectado: $(node -v)"
fi

# 2. Verifica FFmpeg
if ! command -v ffmpeg &> /dev/null; then
    echo "❌ FFmpeg nao encontrado."
    if command -v brew &> /dev/null; then
        echo "📦 Instalando FFmpeg via Homebrew..."
        brew install ffmpeg
    else
        echo "⚠️ Instale o FFmpeg via Homebrew: brew install ffmpeg"
    fi
else
    echo "✓ FFmpeg detectado"
fi

# 3. Verifica yt-dlp
if ! command -v yt-dlp &> /dev/null; then
    echo "❌ yt-dlp nao encontrado."
    if command -v brew &> /dev/null; then
        echo "📦 Instalando yt-dlp via Homebrew..."
        brew install yt-dlp
    elif command -v pip3 &> /dev/null; then
        pip3 install -U yt-dlp
    fi
else
    echo "✓ yt-dlp detectado: $(yt-dlp --version)"
fi

# 4. Inicia o Motor Local em Segundo Plano
echo ""
echo "🚀 Iniciando motor local em http://127.0.0.1:48721..."
mkdir -p "$HOME/.mediagrabber"
pkill -f "media_engine_server.js" 2>/dev/null
nohup node "$SCRIPT_DIR/js/media_engine_server.js" > "$HOME/.mediagrabber/engine.log" 2>&1 &
sleep 2

# Testa se o motor respondeu
if curl -s http://127.0.0.1:48721/api/health | grep -q "ok"; then
    echo "✓ Motor ativo e funcionando com sucesso!"
else
    echo "⚠️ O motor iniciou. Logs em: $HOME/.mediagrabber/engine.log"
fi

echo ""
echo "==================================================================="
echo "  COMO ATIVAR A EXTENSAO NO GOOGLE CHROME DO SEU MAC:"
echo "==================================================================="
echo "1. Abra o Chrome e acesse: chrome://extensions"
echo "2. No canto superior direito, ATIVE a chave 'Modo do desenvolvedor'."
echo "3. Clique no botao 'Carregar sem compactacao' (Load unpacked)."
echo "4. Selecione esta pasta:"
echo "   $SCRIPT_DIR"
echo "5. Pronto! Fixe o icone do Media Grabber Pro na barra do Chrome."
echo "==================================================================="

# Tenta abrir o Chrome automaticamente
if [ -d "/Applications/Google Chrome.app" ]; then
    open -a "Google Chrome" "chrome://extensions" 2>/dev/null
fi
