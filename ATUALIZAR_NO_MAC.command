#!/bin/bash
# =========================================================================
# ATUALIZAR MEDIA GRABBER PRO NO MAC
# =========================================================================

echo "====================================================="
echo "  🔄 Atualizando Media Grabber Pro com o PC Windows..."
echo "====================================================="

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
cd "$SCRIPT_DIR"

if [ -d ".git" ]; then
    echo "📦 Baixando as últimas modificações do GitHub..."
    git pull origin main
    echo ""
    echo "✓ Extensão atualizada com sucesso!"
    echo "💡 Abra o Chrome do seu Mac em chrome://extensions e clique em 🔄 recarregar."
else
    echo "Iniciando sincronização..."
    git init
    git remote add origin https://github.com/valadares0/media-grabber-pro.git
    git pull origin main
fi

read -p "Pressione ENTER para fechar..."
