#!/bin/bash
# =========================================================================
# Media Grabber Pro v5.0 - Instalador 1-Clique para macOS
# =========================================================================

cd "$(dirname "$0")"
DIR="$(pwd)"

clear
echo "==================================================================="
echo "  ⚡ MEDIA GRABBER PRO - INSTALADOR AUTOMATICO (1 CLIQUE PARA MAC)"
echo "==================================================================="
echo ""
echo "Instalando tudo automaticamente, aguarde alguns segundos..."
echo ""

# 1. Configura ambiente Homebrew (Apple Silicon M1/M2/M3/M4 ou Intel)
if [ -f "/opt/homebrew/bin/brew" ]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
elif [ -f "/usr/local/bin/brew" ]; then
    eval "$(/usr/local/bin/brew shellenv)"
fi

# Se não tiver Homebrew, instala silenciosamente
if ! command -v brew &> /dev/null; then
    echo "📦 Instalando gerenciador de pacotes Homebrew..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" < /dev/null
    if [ -f "/opt/homebrew/bin/brew" ]; then
        eval "$(/opt/homebrew/bin/brew shellenv)"
    elif [ -f "/usr/local/bin/brew" ]; then
        eval "$(/usr/local/bin/brew shellenv)"
    fi
fi

# Instala Node.js se necessário
if ! command -v node &> /dev/null; then
    echo "📦 Instalando Node.js..."
    brew install node &> /dev/null
fi

# Instala FFmpeg se necessário
if ! command -v ffmpeg &> /dev/null; then
    echo "📦 Instalando FFmpeg..."
    brew install ffmpeg &> /dev/null
fi

# Instala yt-dlp se necessário
if ! command -v yt-dlp &> /dev/null; then
    echo "📦 Instalando yt-dlp..."
    brew install yt-dlp &> /dev/null
fi

# 2. Configura e inicia o Motor Local permanente (LaunchAgent)
echo "🚀 Configurando motor local permanente..."
mkdir -p "$HOME/.mediagrabber"
mkdir -p "$HOME/Library/LaunchAgents"

PLIST="$HOME/Library/LaunchAgents/com.mediagrabber.engine.plist"
NODE_BIN="$(command -v node || echo '/opt/homebrew/bin/node')"

cat <<EOF > "$PLIST"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.mediagrabber.engine</string>
    <key>ProgramArguments</key>
    <array>
        <string>$NODE_BIN</string>
        <string>$DIR/js/media_engine_server.js</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>$HOME/.mediagrabber/engine.log</string>
    <key>StandardErrorPath</key>
    <string>$HOME/.mediagrabber/engine.log</string>
</dict>
</plist>
EOF

launchctl unload "$PLIST" 2>/dev/null
launchctl load -w "$PLIST" 2>/dev/null
pkill -f "media_engine_server.js" 2>/dev/null
nohup "$NODE_BIN" "$DIR/js/media_engine_server.js" > "$HOME/.mediagrabber/engine.log" 2>&1 &
sleep 2

# 3. Abre o Chrome diretamente com a extensão carregada
echo "🌐 Abrindo Google Chrome com a extensao e estúdio de cortes..."
osascript -e 'display notification "Media Grabber Pro instalado e ativo no seu Mac!" with title "Media Grabber Pro"' 2>/dev/null

if [ -d "/Applications/Google Chrome.app" ]; then
    open -n -a "Google Chrome" --args --load-extension="$DIR" "$DIR/ai_studio.html"
else
    open "$DIR/ai_studio.html"
fi

echo ""
echo "==================================================================="
echo "  ✓ INSTALACAO CONCLUIDA COM SUCESSO!"
echo "  O motor esta rodando em segundo plano e o Chrome foi aberto."
echo "==================================================================="
echo ""
sleep 3
exit 0
