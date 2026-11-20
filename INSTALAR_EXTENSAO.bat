@echo off
chcp 65001 >nul
title Instalador Automatico - Media Grabber Pro v2.0
echo ===================================================================
echo   MEDIA GRABBER PRO v2.0 - INSTALACAO AUTOMATICA NO CHROME
echo ===================================================================
echo.
echo Instalando e ativando a extensao automaticamente no Google Chrome...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0auto_install.ps1"
echo.
echo Pronto! A extensao Media Grabber Pro ja esta instalada e fixada no topo do Chrome.
timeout /t 3 >nul
exit
