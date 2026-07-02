@echo off
chcp 65001 >nul
title Lead Hunter IA - Painel
cd /d "%~dp0"

echo ==============================================
echo            LEAD HUNTER IA
echo    Iniciando o painel web local...
echo ==============================================
echo.

REM --- Verifica se o Node.js esta instalado ---
where node >nul 2>nul
if errorlevel 1 (
  echo [ERRO] Node.js nao encontrado.
  echo Instale em https://nodejs.org e tente de novo.
  echo.
  pause
  exit /b 1
)

REM --- Primeira execucao: instala dependencias ---
if not exist "node_modules" (
  echo [setup] Primeira execucao detectada.
  echo [setup] Instalando dependencias ... isso pode levar alguns minutos.
  call npm install
  if errorlevel 1 (
    echo [ERRO] Falha ao instalar dependencias.
    pause
    exit /b 1
  )
)

REM --- Cria o arquivo .env se nao existir ---
if not exist ".env" (
  copy ".env.example" ".env" >nul
  echo [setup] Arquivo .env criado a partir do exemplo.
  echo [setup] Configure sua chave de API no .env se desejar coleta automatica.
)

REM --- Cria/atualiza o banco de dados ---
if not exist "data\lead-hunter.db" (
  echo [setup] Criando banco de dados local...
  call npm run db:migrate
)

REM --- Abre o navegador automaticamente apos o servidor subir (em paralelo) ---
start "LeadHunter_Browser" /min cmd /c "timeout /t 4 >nul & explorer http://localhost:3000"

echo.
echo  Painel: http://localhost:3000
echo  (Para PARAR o servidor: feche esta janela ou pressione Ctrl+C)
echo.

REM --- Inicia o servidor web (mantem esta janela aberta) ---
call npm run web

echo.
echo Servidor encerrado.
pause
