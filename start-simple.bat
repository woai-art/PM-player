@echo off
echo 🚀 Запуск упрощенного медиа плеера...
echo.

REM Проверяем наличие Node.js
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js не найден! Установите Node.js с https://nodejs.org/
    pause
    exit /b 1
)

REM Проверяем наличие Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Python не найден! Установите Python с https://python.org/
    pause
    exit /b 1
)

REM Проверяем виртуальное окружение
if not exist "venv\Scripts\activate.bat" (
    echo 📦 Создаем виртуальное окружение Python...
    python -m venv venv
    if %errorlevel% neq 0 (
        echo ❌ Ошибка создания виртуального окружения
        pause
        exit /b 1
    )
)

REM Активируем виртуальное окружение и устанавливаем yt-dlp
if not exist "venv\Scripts\yt-dlp.exe" (
    echo 📥 Устанавливаем yt-dlp...
    call venv\Scripts\activate.bat
    pip install yt-dlp
    call venv\Scripts\deactivate.bat
    if %errorlevel% neq 0 (
        echo ❌ Ошибка установки yt-dlp
        pause
        exit /b 1
    )
)

echo ✅ Все зависимости готовы!
echo 🌐 Запускаем веб-сервер...
echo.

REM Запускаем упрощенный сервер
node simple-server.js

pause 