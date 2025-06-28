const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class VLCPlayer {
    constructor() {
        this.vlcPath = this.findVLCPath();
        this.currentProcess = null;
    }

    // Поиск VLC в стандартных местах установки
    findVLCPath() {
        const possiblePaths = [
            'C:\\Program Files\\VideoLAN\\VLC\\vlc.exe',
            'C:\\Program Files (x86)\\VideoLAN\\VLC\\vlc.exe',
            'vlc.exe' // Если VLC в PATH
        ];

        for (const vlcPath of possiblePaths) {
            if (fs.existsSync(vlcPath)) {
                console.log('✅ VLC найден:', vlcPath);
                return vlcPath;
            }
        }

        console.log('⚠️ VLC не найден в стандартных местах');
        return null;
    }

    // Проверка доступности VLC
    isAvailable() {
        return this.vlcPath !== null;
    }

    // Воспроизведение видео в VLC
    playVideo(videoUrl, title = '') {
        if (!this.isAvailable()) {
            throw new Error('VLC Media Player не найден');
        }

        // Останавливаем предыдущий процесс если есть
        if (this.currentProcess) {
            this.currentProcess.kill();
        }

        console.log('🎬 Запускаем VLC для:', title || videoUrl);

        const args = [
            videoUrl // Просто запускаем VLC с видео - самый простой способ
        ];

        if (title) {
            args.push('--meta-title', title);
        }

        this.currentProcess = spawn(this.vlcPath, args, {
            stdio: ['ignore', 'pipe', 'pipe']
        });

        this.currentProcess.stdout.on('data', (data) => {
            console.log('VLC stdout:', data.toString());
        });

        this.currentProcess.stderr.on('data', (data) => {
            console.log('VLC stderr:', data.toString());
        });

        this.currentProcess.on('close', (code) => {
            console.log('VLC завершен с кодом:', code);
            this.currentProcess = null;
        });

        this.currentProcess.on('error', (error) => {
            console.error('❌ Ошибка запуска VLC:', error.message);
            this.currentProcess = null;
        });

        return true;
    }

    // Остановка воспроизведения
    stop() {
        if (this.currentProcess) {
            this.currentProcess.kill();
            this.currentProcess = null;
            console.log('⏹️ VLC остановлен');
            return true;
        }
        return false;
    }

    // Воспроизведение через VLC с предварительным получением ссылки
    async playFromUrl(originalUrl, quality = 'best') {
        return new Promise((resolve, reject) => {
            // Используем ту же функцию что и в основном сервере
            const { spawn } = require('child_process');
            const ytDlpPath = path.join(__dirname, 'venv', 'Scripts', 'yt-dlp.exe');

            // Получаем прямую ссылку для VLC
            const args = [
                '--no-cache-dir',
                '--get-url',
                '--no-playlist',
                '--playlist-items', '1',
                '--format', 'best[ext=mp4][height<=720]/best[ext=mp4]/best[height<=1080]/best',
                '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                originalUrl
            ];

            console.log('🔍 Получаем ссылку для VLC:', originalUrl);

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
                if (code === 0 && stdout.trim()) {
                    const streamUrl = stdout.trim().split('\n')[0];
                    console.log('✅ Ссылка для VLC получена');
                    
                    try {
                        this.playVideo(streamUrl, 'Media Player Video');
                        resolve(true);
                    } catch (error) {
                        reject(error);
                    }
                } else {
                    reject(new Error(stderr || 'Не удалось получить ссылку для VLC'));
                }
            });

            ytDlp.on('error', (error) => {
                reject(error);
            });
        });
    }
}

module.exports = VLCPlayer; 