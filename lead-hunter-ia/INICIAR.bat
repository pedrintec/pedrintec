@echo off
chcp 65001 >nul
title Lead Hunter IA - Launcher
cd /d "%~dp0"

:: Verifica Node.js
where node >nul 2>nul
if errorlevel 1 (
    echo [ERRO] Node.js nao encontrado.
    echo Instale em https://nodejs.org e tente novamente.
    echo.
    pause
    exit /b 1
)

:: Primeira execucao: instala dependencias se nao existir node_modules
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

:: Cria .env se nao existir
if not exist ".env" (
    copy ".env.example" ".env" >nul
    echo [setup] Arquivo .env criado a partir do exemplo.
    echo [setup] Configure suas chaves de API no .env se desejar coleta automatica.
)

:: Garante que o banco de dados existe (aplica migrations)
if not exist "data\\lead-hunter.db" (
    echo [setup] Criando banco de dados local...
    call npm run db:migrate
    if errorlevel 1 (
        echo [ERRO] Falha ao migrar o banco de dados.
        pause
        exit /b 1
    )
)

:menu
cls
echo.
echo =============================================
echo          LEAD HUNTER IA - LAUNCHER
echo =============================================
echo.
echo  1) Iniciar Painel Web (http://localhost:3000)
echo  2) Iniciar CLI (modo interativo de busca)
echo  3) Iniciar Ambos (Web + CLI em janelas separadas)
echo  4) Sair
echo.
set /p "opcao=Escolha uma opcao: "
if "%opcao%"=="1" goto startweb
if "%opcao%"=="2" goto startcli
if "%opcao%"=="3" goto startboth
if "%opcao%"=="4" goto :eof
echo Opcao invalida! Tente novamente.
pause
goto menu

:startweb
cls
echo Iniciando o servidor web...
echo.
call npm run web
goto :eof

:startcli
cls
echo Iniciando a interface de linha de comando (CLI)...
echo.
call npm run start
goto :eof

:startboth
cls
echo Iniciando Painel Web e CLI em janelas separadas...
echo.
start "LeadHunter_LeadHunter Web" /min cmd /c "call npm run web"
timeout /t 3 >nul
start "LeadHunter CLI" cmd /c "call npm run start"
echo.
echo Ambos os processos foram iniciados em janelas separadas.
echo Para parar, feche cada janela ou pressione Ctrl+C nelas.
pause
goto :eof