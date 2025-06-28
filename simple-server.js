const http = require('http');
const url = require('url');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const VLCPlayer = require('./vlc-player');

// MIME типы для статических файлов
const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.wav': 'audio/wav',
    '.mp4': 'video/mp4',
    '.woff': 'application/font-woff',
    '.ttf': 'application/font-ttf',
    '.eot': 'application/vnd.ms-fontobject',
    '.otf': 'application/font-otf',
    '.wasm': 'application/wasm'
};

// Хранилище базовых URL для HLS сегментов
// HLS поддержка удалена для стабильности

// Инициализация VLC плеера
const vlcPlayer = new VLCPlayer();

// Проверяем и создаем папку downloads при запуске
const downloadsDir = path.join(__dirname, 'downloads');
if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir, { recursive: true });
    console.log('📁 Создана папка downloads:', downloadsDir);
}

// Функция для скачивания видео
function downloadVideo(videoUrl, quality, downloadPath, callback) {
    console.log('📥 Начинаем скачивание:', videoUrl, 'качество:', quality);
    
    // Путь к yt-dlp в виртуальном окружении
    const ytDlpPath = path.join(__dirname, 'venv', 'Scripts', 'yt-dlp.exe');
    
    // Создаем папку downloads если её нет
    if (!fs.existsSync(downloadPath)) {
        fs.mkdirSync(downloadPath, { recursive: true });
    }
    
    // Определяем формат для скачивания
    let formatSelector;
    if (quality === 'best') {
        formatSelector = 'best[height<=1080]/best';
    } else {
        formatSelector = `${quality}/best[height<=${quality.replace('p', '')}]/best`;
    }
    
    // Определяем тип сайта для специальных параметров
    const isAdultSite = videoUrl.includes('pornhub.com') || 
                       videoUrl.includes('xvideos.com') || 
                       videoUrl.includes('xhamster.com');
    const isYouTube = videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be');
    const isRussianSite = videoUrl.includes('rutube.ru') || 
                         videoUrl.includes('vk.com') || 
                         videoUrl.includes('mail.ru');
    
    // Базовые параметры для скачивания
    const args = [
        '--no-cache-dir',
        '--format', formatSelector,
        '--no-playlist',
        '--playlist-items', '1',
        '--output', path.join(downloadPath, '%(title)s.%(ext)s'),
        '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        '--extractor-retries', '5',
        '--fragment-retries', '5',
        '--retry-sleep', '2',
        '--write-info-json',
        '--write-thumbnail',
        '--embed-metadata',
        '--add-metadata'
    ];
    
    // Добавляем специальные параметры для разных типов сайтов
    if (isAdultSite) {
        console.log('🔞 Обнаружен adult-сайт, добавляем специальные параметры');
        args.push('--age-limit', '18');
        args.push('--no-check-certificate');
        args.push('--ignore-errors');
    }
    
    if (isYouTube) {
        console.log('📺 Обнаружен YouTube, добавляем оптимизации');
        args.push('--extract-flat', 'false');
        args.push('--no-warnings');
    }
    
    if (isRussianSite) {
        console.log('🇷🇺 Обнаружен российский сайт, добавляем geo-bypass');
        args.push('--geo-bypass');
        args.push('--geo-bypass-country', 'RU');
    }
    
    // Добавляем URL в конце
    args.push(videoUrl);
    
    console.log('📋 Команда скачивания:', ytDlpPath, args.join(' '));
    
    const ytDlp = spawn(ytDlpPath, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false
    });
    
    let stdout = '';
    let stderr = '';
    let downloadProgress = '';
    
    ytDlp.stdout.on('data', (data) => {
        const output = data.toString();
        stdout += output;
        
        // Отслеживаем прогресс скачивания
        if (output.includes('%')) {
            const lines = output.split('\n');
            for (const line of lines) {
                if (line.includes('%') && line.includes('ETA')) {
                    downloadProgress = line.trim();
                    console.log('📊 Прогресс:', downloadProgress);
                }
            }
        }
    });
    
    ytDlp.stderr.on('data', (data) => {
        const output = data.toString();
        stderr += output;
        console.log('📝 yt-dlp stderr:', output);
    });
    
    ytDlp.on('close', (code) => {
        console.log('📊 Скачивание завершено с кодом:', code);
        
        if (code === 0) {
            // Ищем скачанный файл
            const files = fs.readdirSync(downloadPath);
            const videoFiles = files.filter(file => {
                const ext = path.extname(file).toLowerCase();
                return ['.mp4', '.webm', '.mkv', '.avi', '.mov'].includes(ext);
            });
            
            if (videoFiles.length > 0) {
                const downloadedFile = videoFiles[videoFiles.length - 1]; // Берем последний файл
                const filePath = path.join(downloadPath, downloadedFile);
                const fileStats = fs.statSync(filePath);
                
                console.log('✅ Видео скачано успешно:', downloadedFile);
                callback(null, {
                    fileName: downloadedFile,
                    filePath: filePath,
                    fileSize: fileStats.size,
                    downloadTime: new Date().toISOString()
                });
            } else {
                console.error('❌ Скачанный файл не найден');
                callback(new Error('Скачанный файл не найден'), null);
            }
        } else {
            console.error('❌ Основное скачивание не удалось, пробуем упрощенный метод...');
            
            // Пробуем упрощенный метод без дополнительных параметров
            const fallbackArgs = [
                '--no-cache-dir',
                '--format', 'best',
                '--no-playlist',
                '--playlist-items', '1',
                '--output', path.join(downloadPath, '%(title)s.%(ext)s'),
                '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                '--ignore-errors',
                '--no-warnings',
                videoUrl
            ];
            
            console.log('🔄 Fallback команда:', ytDlpPath, fallbackArgs.join(' '));
            
            const fallbackYtDlp = spawn(ytDlpPath, fallbackArgs, {
                stdio: ['pipe', 'pipe', 'pipe'],
                shell: false
            });
            
            let fallbackStdout = '';
            let fallbackStderr = '';
            
            fallbackYtDlp.stdout.on('data', (data) => {
                const output = data.toString();
                fallbackStdout += output;
                console.log('📊 Fallback прогресс:', output.trim());
            });
            
            fallbackYtDlp.stderr.on('data', (data) => {
                const output = data.toString();
                fallbackStderr += output;
                console.log('📝 Fallback stderr:', output);
            });
            
            fallbackYtDlp.on('close', (fallbackCode) => {
                if (fallbackCode === 0) {
                    // Ищем скачанный файл
                    const files = fs.readdirSync(downloadPath);
                    const videoFiles = files.filter(file => {
                        const ext = path.extname(file).toLowerCase();
                        return ['.mp4', '.webm', '.mkv', '.avi', '.mov'].includes(ext);
                    });
                    
                    if (videoFiles.length > 0) {
                        const downloadedFile = videoFiles[videoFiles.length - 1];
                        const filePath = path.join(downloadPath, downloadedFile);
                        const fileStats = fs.statSync(filePath);
                        
                        console.log('✅ Fallback скачивание успешно:', downloadedFile);
                        callback(null, {
                            fileName: downloadedFile,
                            filePath: filePath,
                            fileSize: fileStats.size,
                            downloadTime: new Date().toISOString()
                        });
                    } else {
                        const error = new Error('Файл не найден после fallback скачивания');
                        console.error('❌ Fallback ошибка:', error.message);
                        callback(error, null);
                    }
                } else {
                    const error = new Error(stderr || fallbackStderr || 'Ошибка скачивания видео');
                    console.error('❌ Окончательная ошибка скачивания:', error.message);
                    callback(error, null);
                }
            });
            
            fallbackYtDlp.on('error', (error) => {
                console.error('❌ Ошибка fallback yt-dlp:', error.message);
                const finalError = new Error(stderr || 'Не удалось скачать видео');
                callback(finalError, null);
            });
        }
    });
    
    ytDlp.on('error', (error) => {
        console.error('❌ Ошибка запуска yt-dlp для скачивания:', error.message);
        callback(error, null);
    });
}

// Функция для получения stream URL с умным выбором формата
function getStreamUrl(videoUrl, quality, callback) {
    console.log('🎬 Получаем stream URL для:', videoUrl, 'качество:', quality);
    
    // Сначала получаем информацию о видео для определения типа
    extractVideoInfo(videoUrl, (infoError, videoInfo) => {
        let isLive = false;
        let isRecent = false;
        
        if (!infoError && videoInfo) {
            isLive = videoInfo.is_live || videoInfo.live_status === 'is_live';
            isRecent = videoInfo.upload_date && 
                new Date(videoInfo.upload_date.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3')) > 
                new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        }
        
        console.log(`📊 Тип контента: ${isLive ? 'Live Stream 🔴' : isRecent ? 'Recent Video 🆕' : 'Regular Video 📹'}`);
        
        // Путь к yt-dlp в виртуальном окружении
        const ytDlpPath = path.join(__dirname, 'venv', 'Scripts', 'yt-dlp.exe');
        
        // ПРИНУДИТЕЛЬНО используем ТОЛЬКО MP4 форматы - никакого HLS!
        // Как в DuckDuckGo и Patreon - только прямые видео ссылки
        let formatSelector;
        if (isLive) {
            // Для live-стримов тоже пробуем MP4, если недоступен - откажемся
            formatSelector = 'best[ext=mp4][height<=720]/best[ext=mp4]/worst[ext=mp4]';
        } else {
            // Для всех остальных видео - СТРОГО ТОЛЬКО MP4
            formatSelector = quality === 'best' ? 
                'best[ext=mp4][height<=720]/best[ext=mp4]/worst[ext=mp4]' : 
                `${quality}[ext=mp4]/best[ext=mp4]`;
        }
        
        console.log('🎯 Формат селектор:', formatSelector);
        
        // Параметры для получения прямой ссылки
        const args = [
            '--no-cache-dir',
            '--get-url',
            '--no-playlist',
            '--playlist-items', '1',
            '--format', formatSelector,
            '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            '--extractor-retries', '3',
            videoUrl
        ];
        
        console.log('📋 Команда stream:', ytDlpPath, args.join(' '));
        
        const ytDlp = spawn(ytDlpPath, args, {
            stdio: ['pipe', 'pipe', 'pipe'],
            shell: false
        });
        
        let stdout = '';
        let stderr = '';
        
        ytDlp.stdout.on('data', (data) => {
            stdout += data.toString();
        });
        
        ytDlp.stderr.on('data', (data) => {
            stderr += data.toString();
        });
        
        ytDlp.on('close', (code) => {
            console.log('📊 yt-dlp stream завершен с кодом:', code);
            
            if (code === 0 && stdout.trim()) {
                const streamUrl = stdout.trim().split('\n')[0]; // Берем первую ссылку
                console.log('✅ Stream URL получен:', streamUrl.substring(0, 100) + '...');
                
                // Определяем тип потока
                if (streamUrl.includes('.m3u8')) {
                    console.log('📺 Обнаружен HLS поток (.m3u8)');
                } else if (streamUrl.includes('videoplayback')) {
                    console.log('🎥 Обнаружен MP4 поток');
                } else {
                    console.log('🔍 Неизвестный тип потока');
                }
                
                callback(null, streamUrl);
            } else {
                console.error('❌ Ошибка получения stream URL, пробуем альтернативный формат...');
                
                // Пробуем альтернативные форматы - MP4, WebM, но НЕ HLS
                const fallbackArgs = [
                    '--no-cache-dir',
                    '--get-url',
                    '--no-playlist',
                    '--playlist-items', '1',
                    '--format', 'worst[ext=mp4]/best[ext=webm]/worst[ext=webm]/best[ext!=m3u8]',
                    '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    '--extractor-retries', '3',
                    '--fragment-retries', '3',
                    videoUrl
                ];
                
                console.log('🔄 Fallback команда:', ytDlpPath, fallbackArgs.join(' '));
                
                const fallbackYtDlp = spawn(ytDlpPath, fallbackArgs, {
                    stdio: ['pipe', 'pipe', 'pipe'],
                    shell: false
                });
                
                let fallbackStdout = '';
                let fallbackStderr = '';
                
                fallbackYtDlp.stdout.on('data', (data) => {
                    fallbackStdout += data.toString();
                });
                
                fallbackYtDlp.stderr.on('data', (data) => {
                    fallbackStderr += data.toString();
                });
                
                fallbackYtDlp.on('close', (fallbackCode) => {
                    if (fallbackCode === 0 && fallbackStdout.trim()) {
                        const fallbackStreamUrl = fallbackStdout.trim().split('\n')[0];
                        console.log('✅ Fallback Stream URL получен:', fallbackStreamUrl.substring(0, 100) + '...');
                        callback(null, fallbackStreamUrl);
                    } else {
                        const error = new Error(stderr || fallbackStderr || 'Не удалось получить stream URL');
                        console.error('❌ Окончательная ошибка получения stream URL:', error.message);
                        callback(error, null);
                    }
                });
                
                fallbackYtDlp.on('error', (error) => {
                    console.error('❌ Ошибка fallback yt-dlp:', error.message);
                    const finalError = new Error(stderr || 'Не удалось получить stream URL');
                    callback(finalError, null);
                });
            }
        });
        
        ytDlp.on('error', (error) => {
            console.error('❌ Ошибка запуска yt-dlp для stream:', error.message);
            callback(error, null);
        });
    });
}

// Функция для выполнения yt-dlp
function extractVideoInfo(videoUrl, callback) {
    console.log('🔍 Извлекаем информацию о видео:', videoUrl);
    
    // Путь к yt-dlp в виртуальном окружении
    const ytDlpPath = path.join(__dirname, 'venv', 'Scripts', 'yt-dlp.exe');
    
    // Параметры для yt-dlp
    const args = [
        '--no-cache-dir',
        '--dump-json',
        '--no-playlist',
        '--playlist-items', '1',
        '--format', 'best[height<=720]/best',
        '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        videoUrl
    ];
    
    console.log('📋 Команда:', ytDlpPath, args.join(' '));
    
    const ytDlp = spawn(ytDlpPath, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false
    });
    
    let stdout = '';
    let stderr = '';
    
    ytDlp.stdout.on('data', (data) => {
        stdout += data.toString();
    });
    
    ytDlp.stderr.on('data', (data) => {
        stderr += data.toString();
    });
    
    ytDlp.on('close', (code) => {
        console.log('📊 yt-dlp завершен с кодом:', code);
        
        if (code === 0 && stdout.trim()) {
            try {
                const videoInfo = JSON.parse(stdout.trim());
                console.log('✅ Информация о видео получена:', videoInfo.title);
                callback(null, videoInfo);
            } catch (error) {
                console.error('❌ Ошибка парсинга JSON:', error.message);
                callback(error, null);
            }
        } else {
            const error = new Error(stderr || 'Неизвестная ошибка yt-dlp');
            console.error('❌ Ошибка yt-dlp:', error.message);
            callback(error, null);
        }
    });
    
    ytDlp.on('error', (error) => {
        console.error('❌ Ошибка запуска yt-dlp:', error.message);
        callback(error, null);
    });
}

// Функция для отправки JSON ответа
function sendJSON(res, data, statusCode = 200) {
    res.writeHead(statusCode, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end(JSON.stringify(data));
}

// Функция для отправки файла
function sendFile(res, filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    
    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('Файл не найден');
            } else {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('Ошибка сервера');
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content);
        }
    });
}

// Создаем HTTP сервер
const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    
    console.log(`📡 ${req.method} ${pathname}`);
    
    // CORS для всех запросов
    if (req.method === 'OPTIONS') {
        res.writeHead(200, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        });
        res.end();
        return;
    }
    
    // API маршруты
    if (pathname === '/api/extract') {
        if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => {
                body += chunk.toString();
            });
            req.on('end', () => {
                try {
                    const { url: videoUrl } = JSON.parse(body);
                    if (!videoUrl) {
                        sendJSON(res, { error: 'URL не указан' }, 400);
                        return;
                    }
                    
                    extractVideoInfo(videoUrl, (error, videoInfo) => {
                        if (error) {
                            sendJSON(res, { error: error.message }, 500);
                        } else {
                            sendJSON(res, { success: true, videoInfo });
                        }
                    });
                } catch (error) {
                    sendJSON(res, { error: 'Неверный JSON' }, 400);
                }
            });
        } else {
            sendJSON(res, { error: 'Метод не поддерживается' }, 405);
        }
        return;
    }
    
    // API для получения прямой ссылки на видео
    if (pathname === '/api/stream') {
        if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => {
                body += chunk.toString();
            });
            req.on('end', () => {
                try {
                    const { url: videoUrl, quality } = JSON.parse(body);
                    if (!videoUrl) {
                        sendJSON(res, { error: 'URL не указан' }, 400);
                        return;
                    }
                    
                    getStreamUrl(videoUrl, quality, (error, streamUrl) => {
                        if (error) {
                            sendJSON(res, { error: error.message }, 500);
                        } else {
                            sendJSON(res, { success: true, streamUrl });
                        }
                    });
                } catch (error) {
                    sendJSON(res, { error: 'Неверный JSON' }, 400);
                }
            });
        } else {
            sendJSON(res, { error: 'Метод не поддерживается' }, 405);
        }
        return;
    }
    
    // API для скачивания видео
    if (pathname === '/api/download') {
        if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => {
                body += chunk.toString();
            });
            req.on('end', () => {
                try {
                    const { url: videoUrl, quality, downloadPath } = JSON.parse(body);
                    if (!videoUrl) {
                        sendJSON(res, { error: 'URL не указан' }, 400);
                        return;
                    }
                    
                    const finalDownloadPath = downloadPath || path.join(__dirname, 'downloads');
                    
                    downloadVideo(videoUrl, quality || 'best', finalDownloadPath, (error, result) => {
                        if (error) {
                            sendJSON(res, { error: error.message }, 500);
                        } else {
                            sendJSON(res, { 
                                success: true, 
                                message: 'Видео успешно скачано',
                                ...result
                            });
                        }
                    });
                } catch (error) {
                    sendJSON(res, { error: 'Неверный JSON' }, 400);
                }
            });
        } else {
            sendJSON(res, { error: 'Метод не поддерживается' }, 405);
        }
        return;
    }
    
    // API для воспроизведения в VLC
    if (pathname === '/api/vlc') {
        if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => {
                body += chunk.toString();
            });
            req.on('end', () => {
                try {
                    const { url: videoUrl, action } = JSON.parse(body);
                    
                    if (action === 'check') {
                        sendJSON(res, { 
                            available: vlcPlayer.isAvailable(),
                            path: vlcPlayer.vlcPath 
                        });
                        return;
                    }
                    
                    if (action === 'stop') {
                        const stopped = vlcPlayer.stop();
                        sendJSON(res, { success: stopped });
                        return;
                    }
                    
                    if (action === 'play') {
                        if (!videoUrl) {
                            sendJSON(res, { error: 'URL не указан' }, 400);
                            return;
                        }
                        
                        if (!vlcPlayer.isAvailable()) {
                            sendJSON(res, { error: 'VLC Media Player не найден' }, 404);
                            return;
                        }
                        
                        vlcPlayer.playFromUrl(videoUrl)
                            .then(() => {
                                sendJSON(res, { success: true, message: 'Видео запущено в VLC' });
                            })
                            .catch(error => {
                                sendJSON(res, { error: error.message }, 500);
                            });
                        return;
                    }
                    
                    sendJSON(res, { error: 'Неизвестное действие' }, 400);
                } catch (error) {
                    sendJSON(res, { error: 'Неверный JSON' }, 400);
                }
            });
        } else {
            sendJSON(res, { error: 'Метод не поддерживается' }, 405);
        }
        return;
    }
    
    // API для проксирования видео
    if (pathname.startsWith('/proxy/')) {
        let videoUrl = decodeURIComponent(pathname.substring(7)); // Убираем '/proxy/'
        
        // HLS сегменты больше не поддерживаются
        if (!videoUrl.startsWith('http')) {
            console.error('❌ Относительный путь не поддерживается:', videoUrl);
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('Относительные пути не поддерживаются');
            return;
        }
        
        // Отклоняем HLS потоки
        if (videoUrl.includes('.m3u8') || videoUrl.includes('.ts')) {
            console.error('❌ HLS потоки не поддерживаются:', videoUrl);
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('HLS потоки не поддерживаются - используйте VLC');
            return;
        }
        
        // Проверяем, что URL валидный
        if (!videoUrl.startsWith('http')) {
            console.error('❌ Невалидный URL:', videoUrl);
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('Невалидный URL для проксирования');
            return;
        }
        
        console.log('🔄 Проксируем видео:', videoUrl.substring(0, 100) + '...');
        
        // Проксируем запрос
        const https = require('https');
        const http_module = videoUrl.startsWith('https:') ? https : require('http');
        
        const proxyReq = http_module.get(videoUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://www.youtube.com/',
                'Accept': '*/*',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'identity',
                'Range': req.headers.range || ''
            }
        }, (proxyRes) => {
            // Копируем заголовки ответа
            const headers = {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Range',
                'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges'
            };
            
            // Копируем важные заголовки от источника
            if (proxyRes.headers['content-type']) {
                headers['Content-Type'] = proxyRes.headers['content-type'];
            }
            if (proxyRes.headers['content-length']) {
                headers['Content-Length'] = proxyRes.headers['content-length'];
            }
            if (proxyRes.headers['content-range']) {
                headers['Content-Range'] = proxyRes.headers['content-range'];
            }
            if (proxyRes.headers['accept-ranges']) {
                headers['Accept-Ranges'] = proxyRes.headers['accept-ranges'];
            }
            
            res.writeHead(proxyRes.statusCode, headers);
            proxyRes.pipe(res);
        });
        
        proxyReq.on('error', (error) => {
            console.error('❌ Ошибка проксирования:', error.message);
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Ошибка проксирования видео');
        });
        
        return;
    }
    
    // Статические файлы (с поддержкой cache-busting параметров)
    if (pathname === '/' || pathname === '/index.html') {
        sendFile(res, path.join(__dirname, 'src', 'renderer', 'index.html'));
    } else if (pathname === '/renderer.js' || pathname.startsWith('/renderer.js?')) {
        sendFile(res, path.join(__dirname, 'src', 'renderer', 'renderer.js'));
    } else if (pathname === '/styles.css' || pathname.startsWith('/styles.css?')) {
        sendFile(res, path.join(__dirname, 'src', 'renderer', 'styles.css'));
    } else if (pathname.startsWith('/assets/')) {
        // Обработка файлов из папки assets
        const assetPath = path.join(__dirname, pathname);
        sendFile(res, assetPath);
    } else {
        // 404 для остальных путей
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Страница не найдена');
    }
});

const PORT = 3001;
server.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
    console.log(`🌐 Откройте http://localhost:${PORT} в браузере`);
}); 