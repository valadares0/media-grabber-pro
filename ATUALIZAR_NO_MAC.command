#!/bin/bash
# Atualiza a extensão a partir do GitHub e (re)inicia o motor local no Mac.
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
cd "$SCRIPT_DIR"

if [ -f "/opt/homebrew/bin/brew" ]; then eval "$(/opt/homebrew/bin/brew shellenv)"; 
elif [ -f "/usr/local/bin/brew" ]; then eval "$(/usr/local/bin/brew shellenv)"; fi

echo "🔄 Atualizando Media Grabber Pro..."
git pull --autostash origin main || { echo "❌ Falha no git pull"; read -p "ENTER para fechar..."; exit 1; }

# Dependências do motor (necessárias para gerar MP4 válido)
command -v ffmpeg  &>/dev/null || brew install ffmpeg
command -v yt-dlp  &>/dev/null || brew install yt-dlp
command -v node    &>/dev/null || brew install node

echo "🚀 Reiniciando motor local..."
mkdir -p "$HOME/.mediagrabber"
pkill -f "media_engine_server.js" 2>/dev/null
nohup node "$SCRIPT_DIR/js/media_engine_server.js" > "$HOME/.mediagrabber/engine.log" 2>&1 &
sleep 2
curl -s http://127.0.0.1:48721/api/health | grep -q ok && echo "✓ Motor ativo" || echo "⚠️ Veja $HOME/.mediagrabber/engine.log"

echo "✓ Pronto. No Chrome: chrome://extensions → 🔄 Recarregar."
read -p "ENTER para fechar..."
