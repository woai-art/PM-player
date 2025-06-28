// Проверяем, работаем ли мы в Electron или в браузере
let ipcRenderer = null;
try {
    if (typeof require !== 'undefined') {
        const electron = require('electron');
        ipcRenderer = electron.ipcRenderer;
    }
} catch (e) {
    console.log('🌐 Работаем в веб-режиме');
}

class MediaPlayerUI {
    constructor() {
        this.currentVideo = null;
        this.isPlaying = false;
        this.currentTab = 'player';
        this.library = JSON.parse(localStorage.getItem('mediaLibrary') || '[]');
        this.settings = JSON.parse(localStorage.getItem('playerSettings') || '{}');
        this.vlcAvailable = false;
        
        this.initializeUI();
        this.setupEventListeners();
        this.loadSettings();
        this.checkVLCAvailability();
    }

    initializeUI() {
        // Initialize tabs
        this.switchTab('player');
        
        // Load library and downloads
        this.renderLibrary();
        this.renderDownloads();
        
        // Setup default settings
        if (!this.settings.defaultQuality) {
            this.settings.defaultQuality = 'best';
            this.settings.autoPlay = true;
            this.settings.downloadPath = './downloads';
            this.settings.ytDlpPath = 'yt-dlp';
            this.saveSettings();
        }
    }

    setupEventListeners() {
        // Tab navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', () => {
                const tab = item.dataset.tab;
                this.switchTab(tab);
            });
        });

        // URL input and load button
        const urlInput = document.getElementById('url-input');
        const loadBtn = document.getElementById('load-url-btn');
        
        loadBtn.addEventListener('click', () => {
            const url = urlInput.value.trim();
            if (url) {
                this.loadMedia(url);
            }
        });

        urlInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const url = urlInput.value.trim();
                if (url) {
                    this.loadMedia(url);
                }
            }
        });

        // File selection
        document.getElementById('select-file-btn').addEventListener('click', async () => {
            if (ipcRenderer) {
                // Electron режим
                try {
                    const result = await ipcRenderer.invoke('select-file');
                    if (!result.canceled && result.filePaths.length > 0) {
                        const filePath = result.filePaths[0];
                        this.loadLocalFile(filePath);
                    }
                } catch (error) {
                    this.showToast('Error selecting file: ' + error.message, 'error');
                }
            } else {
                // Веб режим - используем input file
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'video/*,audio/*';
                input.onchange = (e) => {
                    const file = e.target.files[0];
                    if (file) {
                        const url = URL.createObjectURL(file);
                        this.currentVideo = {
                            title: file.name,
                            url: url,
                            isLocal: true
                        };
                        this.playCurrentVideo();
                        this.showToast('Local file loaded successfully!', 'success');
                    }
                };
                input.click();
            }
        });

        // Play button
        document.getElementById('play-btn').addEventListener('click', () => {
            this.playCurrentVideo();
        });

        // VLC button
        document.getElementById('vlc-btn').addEventListener('click', () => {
            this.playInVLC();
        });

        // Download button
        document.getElementById('download-btn').addEventListener('click', () => {
            this.downloadCurrentVideo();
        });

        // Video player controls
        const video = document.getElementById('video-element');
        const playPauseBtn = document.getElementById('play-pause-btn');
        const stopBtn = document.getElementById('stop-btn');
        const volumeSlider = document.getElementById('volume-slider');
        const fullscreenBtn = document.getElementById('fullscreen-btn');

        playPauseBtn.addEventListener('click', () => {
            this.togglePlayPause();
        });

        stopBtn.addEventListener('click', () => {
            this.stopVideo();
        });

        volumeSlider.addEventListener('input', (e) => {
            video.volume = e.target.value / 100;
        });

        fullscreenBtn.addEventListener('click', () => {
            this.toggleFullscreen();
        });

        // Video events
        video.addEventListener('loadedmetadata', () => {
            this.updateTimeDisplay();
        });

        video.addEventListener('timeupdate', () => {
            this.updateTimeDisplay();
        });

        video.addEventListener('play', () => {
            this.isPlaying = true;
            playPauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
        });

        video.addEventListener('pause', () => {
            this.isPlaying = false;
            playPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
        });

        video.addEventListener('ended', () => {
            this.isPlaying = false;
            playPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
        });

        // Library controls
        document.getElementById('add-to-library-btn').addEventListener('click', () => {
            this.switchTab('player');
        });

        // Settings
        document.getElementById('default-quality').addEventListener('change', (e) => {
            this.settings.defaultQuality = e.target.value;
            this.saveSettings();
        });

        document.getElementById('auto-play').addEventListener('change', (e) => {
            this.settings.autoPlay = e.target.checked;
            this.saveSettings();
        });

        document.getElementById('yt-dlp-path').addEventListener('change', (e) => {
            this.settings.ytDlpPath = e.target.value;
            this.saveSettings();
        });

        document.getElementById('update-yt-dlp-btn').addEventListener('click', async () => {
            if (ipcRenderer) {
                // Electron режим
                this.showLoading('Обновление yt-dlp...');
                try {
                    await ipcRenderer.invoke('update-yt-dlp');
                    this.hideLoading();
                    this.showToast('yt-dlp успешно обновлен!', 'success');
                } catch (error) {
                    this.hideLoading();
                    this.showToast('Ошибка обновления: ' + error.message, 'error');
                }
            } else {
                // Веб режим - показываем инструкцию
                this.showToast('В веб-режиме обновите yt-dlp командой: pip install --upgrade yt-dlp', 'info');
            }
        });

        // Window controls (if needed)
        document.getElementById('minimize-btn').addEventListener('click', () => {
            // Window minimize functionality would be handled by main process
        });

        document.getElementById('maximize-btn').addEventListener('click', () => {
            // Window maximize functionality would be handled by main process
        });

        document.getElementById('close-btn').addEventListener('click', () => {
            // Window close functionality would be handled by main process
        });
    }

    switchTab(tabName) {
        // Update navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

        // Update content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`${tabName}-tab`).classList.add('active');

        this.currentTab = tabName;
    }

    async loadMedia(url) {
        this.showLoading('Extracting video information...');
        
        try {
            let videoInfo;
            
            // Проверяем, работаем ли мы в веб-режиме или Electron
            if (ipcRenderer) {
                // Electron режим
                videoInfo = await ipcRenderer.invoke('extract-video-info', url);
            } else {
                // Веб режим - используем HTTP API
                const response = await fetch('/api/extract', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ url })
                });
                
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || 'Network error');
                }
                
                const result = await response.json();
                videoInfo = result.videoInfo;
            }
            
            this.currentVideo = { ...videoInfo, url, formats: videoInfo.formats };
            
            this.displayVideoInfo(videoInfo);
            this.hideLoading();
            
            this.showToast('Video information loaded successfully!', 'success');
        } catch (error) {
            this.hideLoading();
            
            // Улучшенные сообщения об ошибках
            let errorMessage = error.message;
            if (errorMessage.includes('playlist')) {
                errorMessage = 'Обнаружен плейлист. Попробуйте ссылку на конкретное видео из плейлиста.';
            } else if (errorMessage.includes('live')) {
                errorMessage = 'Ошибка загрузки прямой трансляции. Попробуйте позже.';
            } else if (errorMessage.includes('Unsupported')) {
                errorMessage = 'Сайт не поддерживается. Поддерживаются: YouTube, Vimeo, RuTube, VK, Mail.ru, Odnoklassniki, PornHub и 1000+ других сайтов.';
            } else if (errorMessage.includes('rezka')) {
                errorMessage = 'HDRezka не поддерживается. Попробуйте RuTube, VK Video или YouTube.';
            } else if (errorMessage.includes('HTTP Error 403')) {
                errorMessage = 'Доступ запрещен. Сайт блокирует загрузку или нужен VPN.';
            } else if (errorMessage.includes('Private video')) {
                errorMessage = 'Видео приватное. Требуется авторизация на сайте.';
            } else if (errorMessage.includes('Sign in to confirm')) {
                errorMessage = 'Требуется вход в аккаунт для контента 18+.';
            }
            
            this.showToast(errorMessage, 'error');
            console.error('Error loading video:', error);
        }
    }

    loadLocalFile(filePath) {
        this.currentVideo = {
            title: filePath.split(/[\\/]/).pop(),
            url: `file://${filePath}`,
            isLocal: true
        };

        // For local files, directly show the player
        this.playCurrentVideo();
        this.showToast('Local file loaded successfully!', 'success');
    }

    displayVideoInfo(videoInfo) {
        const videoInfoDiv = document.getElementById('video-info');
        const thumbnail = document.getElementById('video-thumbnail');
        const title = document.getElementById('video-title');
        const duration = document.getElementById('video-duration');
        const qualitySelect = document.getElementById('quality-select');

        console.log('Video info received:', videoInfo);

        // Set thumbnail
        if (videoInfo.thumbnail) {
            thumbnail.src = videoInfo.thumbnail;
            thumbnail.style.display = 'block';
        } else {
            thumbnail.style.display = 'none';
        }

        // Set title
        title.textContent = videoInfo.title || 'Unknown Title';

        // Set duration and additional info
        let durationText = '';
        let statusIcon = '';
        
        if (videoInfo.is_live) {
            durationText = '🔴 ПРЯМАЯ ТРАНСЛЯЦИЯ';
            statusIcon = '🔴';
        } else if (videoInfo.duration) {
            durationText = this.formatDuration(videoInfo.duration);
            
            // Проверяем, новое ли видео
            if (videoInfo.upload_date) {
                const uploadDate = new Date(
                    videoInfo.upload_date.substring(0, 4),
                    videoInfo.upload_date.substring(4, 6) - 1,
                    videoInfo.upload_date.substring(6, 8)
                );
                const now = new Date();
                const diffHours = (now - uploadDate) / (1000 * 60 * 60);
                
                if (diffHours < 6) {
                    statusIcon = '🆕';
                    durationText = '🆕 ' + durationText;
                } else if (diffHours < 24) {
                    statusIcon = '⏰';
                }
            }
        } else {
            durationText = 'Продолжительность неизвестна';
        }
        
        // Добавляем информацию о канале
        if (videoInfo.uploader) {
            durationText += ` • ${videoInfo.uploader}`;
        }
        
        // Добавляем просмотры
        if (videoInfo.view_count) {
            durationText += ` • ${this.formatViews(videoInfo.view_count)} просмотров`;
        }
        
        // Добавляем возрастное ограничение
        if (videoInfo.age_limit && videoInfo.age_limit > 0) {
            durationText += ` • 18+`;
            statusIcon = '🔞';
        }
        
        duration.textContent = durationText;

        // Populate quality options
        qualitySelect.innerHTML = '<option value="best">Best Available</option>';
        if (videoInfo.formats && videoInfo.formats.length > 0) {
            const uniqueQualities = new Set();
            videoInfo.formats.forEach(format => {
                if (format.height && format.vcodec !== 'none') {
                    const quality = `${format.height}p`;
                    if (!uniqueQualities.has(quality)) {
                        uniqueQualities.add(quality);
                        const option = document.createElement('option');
                        option.value = format.format_id;
                        option.textContent = quality;
                        qualitySelect.appendChild(option);
                    }
                }
            });
        }

        videoInfoDiv.style.display = 'block';
    }

    async playCurrentVideo() {
        if (!this.currentVideo) {
            this.showToast('No video loaded', 'error');
            return;
        }

        const video = document.getElementById('video-element');
        const videoPlayer = document.getElementById('video-player');
        const qualitySelect = document.getElementById('quality-select');

        try {
            if (this.currentVideo.isLocal) {
                // Local file
                video.src = this.currentVideo.url;
            } else {
                // Online video - get stream URL
                this.showLoading('Getting video stream...');
                const selectedQuality = qualitySelect.value;
                
                let streamUrl;
                if (ipcRenderer) {
                    // Electron режим
                    streamUrl = await ipcRenderer.invoke('get-stream-url', this.currentVideo.url, selectedQuality);
                } else {
                    // Веб режим - получаем stream URL через API
                    const response = await fetch('/api/stream', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ 
                            url: this.currentVideo.url, 
                            quality: selectedQuality 
                        })
                    });
                    
                    if (!response.ok) {
                        const errorData = await response.json();
                        throw new Error(errorData.error || 'Network error');
                    }
                    
                    const result = await response.json();
                    // Используем проксированный URL для избежания CORS проблем
                    streamUrl = '/proxy/' + encodeURIComponent(result.streamUrl);
                }
                
                // Проверяем тип потока - ОТКЛОНЯЕМ HLS для стабильности
                if (streamUrl.includes('.m3u8')) {
                    console.error('❌ Получен HLS поток, но HLS отключен для стабильности');
                    this.hideLoading();
                    this.showToast('Получен HLS поток. Используйте кнопку VLC для воспроизведения или попробуйте другое качество.', 'error');
                    return;
                } else {
                    // Обычное видео (MP4, WebM и т.д.) - ЕДИНСТВЕННЫЙ поддерживаемый формат
                    console.log('🎥 Используем стандартный HTML5 плеер для MP4/WebM');
                    video.src = streamUrl;
                    
                    // Попытка автозапуска для обычных видео
                    const playPromise = video.play();
                    if (playPromise !== undefined) {
                        playPromise.then(() => {
                            console.log('✅ Автовоспроизведение запущено');
                            this.isPlaying = true;
                            document.getElementById('play-pause-btn').innerHTML = '<i class="fas fa-pause"></i>';
                        }).catch(error => {
                            console.log('⚠️ Автовоспроизведение заблокировано:', error.message);
                            this.showToast('Нажмите кнопку Play для запуска видео', 'info');
                            
                            // Делаем кнопку Play более заметной
                            const playButton = document.getElementById('play-pause-btn');
                            if (playButton) {
                                playButton.style.backgroundColor = '#00ff88';
                                playButton.style.boxShadow = '0 0 20px #00ff88';
                                playButton.style.animation = 'pulse 1.5s infinite';
                                playButton.style.transform = 'scale(1.1)';
                            }
                        });
                    }
                }
                
                this.hideLoading();
            }

            videoPlayer.style.display = 'block';
            
            // Добавляем обработчики ошибок для видео
            video.addEventListener('error', (e) => {
                console.error('Ошибка воспроизведения видео:', e);
                const error = video.error;
                let errorMessage = 'Ошибка воспроизведения видео';
                
                if (error) {
                    switch (error.code) {
                        case error.MEDIA_ERR_ABORTED:
                            errorMessage = 'Воспроизведение прервано пользователем';
                            break;
                        case error.MEDIA_ERR_NETWORK:
                            errorMessage = 'Ошибка сети при загрузке видео';
                            break;
                        case error.MEDIA_ERR_DECODE:
                            errorMessage = 'Ошибка декодирования видео';
                            break;
                        case error.MEDIA_ERR_SRC_NOT_SUPPORTED:
                            errorMessage = 'Формат видео не поддерживается браузером';
                            break;
                        default:
                            errorMessage = 'Неизвестная ошибка воспроизведения';
                    }
                }
                
                this.showToast(errorMessage + '. Попробуйте другое качество или перезагрузите страницу.', 'error');
            });
            
            video.addEventListener('loadstart', () => {
                console.log('Начало загрузки видео');
                this.showToast('Загрузка видео...', 'info');
            });
            
            video.addEventListener('canplay', () => {
                console.log('Видео готово к воспроизведению');
                this.showToast('Видео готово к воспроизведению', 'success');
                
                // Показываем кнопку воспроизведения если автовоспроизведение не сработало
                if (video.paused) {
                    const playButton = document.getElementById('play-pause-btn');
                    playButton.style.backgroundColor = '#00ff88';
                    playButton.style.animation = 'pulse 2s infinite';
                }
            });
            
            // Добавляем обработчик клика по видео для включения звука
            video.addEventListener('click', () => {
                if (video.muted) {
                    video.muted = false;
                    console.log('🔊 Звук включен по клику');
                    this.showToast('Звук включен', 'success');
                }
            });
            
            if (this.settings.autoPlay) {
                video.play().catch(error => {
                    console.error('Ошибка автовоспроизведения:', error);
                    this.showToast('Автовоспроизведение заблокировано браузером. Нажмите кнопку воспроизведения.', 'info');
                });
            }

            // Add to library if not already there
            this.addToLibrary(this.currentVideo);

        } catch (error) {
            this.hideLoading();
            this.showToast('Error playing video: ' + error.message, 'error');
            console.error('Error playing video:', error);
        }
    }

    togglePlayPause() {
        const video = document.getElementById('video-element');
        const playButton = document.getElementById('play-pause-btn');
        
        if (this.isPlaying) {
            video.pause();
        } else {
            video.play().then(() => {
                // Включаем звук при первом клике
                if (video.muted) {
                    video.muted = false;
                    console.log('🔊 Звук включен автоматически');
                }
                
                // Сбрасываем стили кнопки при успешном запуске
                if (playButton) {
                    playButton.style.backgroundColor = '';
                    playButton.style.boxShadow = '';
                    playButton.style.animation = '';
                    playButton.style.transform = '';
                }
            }).catch(error => {
                console.error('Ошибка воспроизведения:', error);
            });
        }
    }

    stopVideo() {
        const video = document.getElementById('video-element');
        
        // Очищаем HLS инстанс если он есть
        if (video.hlsInstance) {
            video.hlsInstance.destroy();
            video.hlsInstance = null;
            console.log('🧹 HLS инстанс очищен');
        }
        
        video.pause();
        video.currentTime = 0;
        video.src = '';
        this.isPlaying = false;
        document.getElementById('play-pause-btn').innerHTML = '<i class="fas fa-play"></i>';
    }

    toggleFullscreen() {
        const video = document.getElementById('video-element');
        if (document.fullscreenElement) {
            document.exitFullscreen();
        } else {
            video.requestFullscreen();
        }
    }

    updateTimeDisplay() {
        const video = document.getElementById('video-element');
        const timeDisplay = document.getElementById('time-display');
        
        const current = this.formatTime(video.currentTime);
        const total = this.formatTime(video.duration);
        
        timeDisplay.textContent = `${current} / ${total}`;
    }

    formatTime(seconds) {
        if (isNaN(seconds)) return '00:00';
        
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        
        if (hours > 0) {
            return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        } else {
            return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
    }

    formatDuration(seconds) {
        if (!seconds) return 'Unknown';
        return this.formatTime(seconds);
    }

    formatViews(count) {
        if (!count) return '0';
        if (count >= 1000000) {
            return (count / 1000000).toFixed(1) + 'M';
        } else if (count >= 1000) {
            return (count / 1000).toFixed(1) + 'K';
        }
        return count.toString();
    }

    addToLibrary(video) {
        const exists = this.library.find(item => item.url === video.url);
        if (!exists) {
            this.library.push({
                title: video.title,
                url: video.url,
                thumbnail: video.thumbnail,
                duration: video.duration,
                addedAt: new Date().toISOString(),
                isLocal: video.isLocal || false
            });
            this.saveLibrary();
            this.renderLibrary();
        }
    }

    renderLibrary() {
        const libraryGrid = document.getElementById('library-grid');
        
        if (this.library.length === 0) {
            libraryGrid.innerHTML = `
                <div class="library-item-placeholder">
                    <i class="fas fa-folder-open"></i>
                    <p>No media in library</p>
                    <small>Add videos or audio files to get started</small>
                </div>
            `;
            return;
        }

        libraryGrid.innerHTML = this.library.map(item => `
            <div class="library-item" data-url="${item.url}">
                <div class="library-item-thumbnail">
                    ${item.thumbnail ? `<img src="${item.thumbnail}" alt="${item.title}">` : '<i class="fas fa-file-video"></i>'}
                </div>
                <div class="library-item-info">
                    <h4>${item.title}</h4>
                    <p>${item.duration ? this.formatDuration(item.duration) : 'Unknown'}</p>
                    <small>${new Date(item.addedAt).toLocaleDateString()}</small>
                </div>
                <div class="library-item-actions">
                    <button class="btn small primary play-library-item">
                        <i class="fas fa-play"></i>
                    </button>
                    <button class="btn small secondary remove-library-item">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');

        // Add event listeners for library items
        libraryGrid.querySelectorAll('.play-library-item').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const url = e.target.closest('.library-item').dataset.url;
                const item = this.library.find(i => i.url === url);
                if (item) {
                    this.currentVideo = item;
                    this.switchTab('player');
                    this.playCurrentVideo();
                }
            });
        });

        libraryGrid.querySelectorAll('.remove-library-item').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const url = e.target.closest('.library-item').dataset.url;
                this.removeFromLibrary(url);
            });
        });
    }

    removeFromLibrary(url) {
        this.library = this.library.filter(item => item.url !== url);
        this.saveLibrary();
        this.renderLibrary();
        this.showToast('Item removed from library', 'info');
    }

    saveLibrary() {
        localStorage.setItem('mediaLibrary', JSON.stringify(this.library));
    }

    loadSettings() {
        document.getElementById('default-quality').value = this.settings.defaultQuality || 'best';
        document.getElementById('auto-play').checked = this.settings.autoPlay !== false;
        document.getElementById('download-path').value = this.settings.downloadPath || './downloads';
        document.getElementById('yt-dlp-path').value = this.settings.ytDlpPath || 'yt-dlp';
    }

    saveSettings() {
        localStorage.setItem('playerSettings', JSON.stringify(this.settings));
    }

    showLoading(text = 'Loading...') {
        const overlay = document.getElementById('loading-overlay');
        const loadingText = document.getElementById('loading-text');
        loadingText.textContent = text;
        overlay.style.display = 'flex';
    }

    hideLoading() {
        const overlay = document.getElementById('loading-overlay');
        overlay.style.display = 'none';
    }

    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        
        container.appendChild(toast);
        
        // Auto remove after 3 seconds
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 3000);
    }

    // Download Methods
    async downloadCurrentVideo() {
        if (!this.currentVideo) {
            this.showToast('Сначала загрузите видео', 'error');
            return;
        }

        if (this.currentVideo.isLocal) {
            this.showToast('Локальные файлы нельзя скачивать', 'error');
            return;
        }

        try {
            this.showLoading('Скачивание видео...');
            
            const quality = document.getElementById('quality-select').value || 'best';
            const downloadPath = this.settings.downloadPath || './downloads';
            
            const response = await fetch('/api/download', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    url: this.currentVideo.url,
                    quality: quality,
                    downloadPath: downloadPath
                })
            });
            
            const result = await response.json();
            this.hideLoading();
            
            if (result.success) {
                this.showToast(`Видео скачано: ${result.fileName}`, 'success');
                
                // Добавляем в список загрузок
                this.addToDownloads({
                    fileName: result.fileName,
                    filePath: result.filePath,
                    fileSize: result.fileSize,
                    downloadTime: result.downloadTime,
                    originalUrl: this.currentVideo.url,
                    title: this.currentVideo.title
                });
                
                // Переключаемся на вкладку Downloads
                this.switchTab('downloads');
            } else {
                this.showToast('Ошибка скачивания: ' + result.error, 'error');
            }
        } catch (error) {
            this.hideLoading();
            console.error('❌ Ошибка скачивания:', error);
            this.showToast('Ошибка скачивания: ' + error.message, 'error');
        }
    }

    addToDownloads(downloadInfo) {
        let downloads = JSON.parse(localStorage.getItem('downloads') || '[]');
        downloads.unshift(downloadInfo); // Добавляем в начало списка
        
        // Ограничиваем список до 50 элементов
        if (downloads.length > 50) {
            downloads = downloads.slice(0, 50);
        }
        
        localStorage.setItem('downloads', JSON.stringify(downloads));
        this.renderDownloads();
    }

    renderDownloads() {
        const downloads = JSON.parse(localStorage.getItem('downloads') || '[]');
        const downloadsList = document.getElementById('downloads-list');
        
        if (downloads.length === 0) {
            downloadsList.innerHTML = `
                <div class="downloads-placeholder">
                    <i class="fas fa-download"></i>
                    <p>No downloads</p>
                    <small>Downloaded media will appear here</small>
                </div>
            `;
            return;
        }
        
        downloadsList.innerHTML = downloads.map(item => `
            <div class="download-item" data-path="${item.filePath}">
                <div class="download-info">
                    <h4>${item.title || item.fileName}</h4>
                    <p>Файл: ${item.fileName}</p>
                    <p>Размер: ${this.formatFileSize(item.fileSize)}</p>
                    <small>Скачано: ${new Date(item.downloadTime).toLocaleString()}</small>
                </div>
                <div class="download-actions">
                    <button class="btn small primary open-download" title="Открыть файл">
                        <i class="fas fa-play"></i>
                    </button>
                    <button class="btn small secondary show-in-folder" title="Показать в папке">
                        <i class="fas fa-folder-open"></i>
                    </button>
                    <button class="btn small secondary remove-download" title="Удалить из списка">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');
        
        // Добавляем обработчики событий
        downloadsList.querySelectorAll('.open-download').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const filePath = e.target.closest('.download-item').dataset.path;
                this.openDownloadedFile(filePath);
            });
        });
        
        downloadsList.querySelectorAll('.show-in-folder').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const filePath = e.target.closest('.download-item').dataset.path;
                this.showInFolder(filePath);
            });
        });
        
        downloadsList.querySelectorAll('.remove-download').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const filePath = e.target.closest('.download-item').dataset.path;
                this.removeFromDownloads(filePath);
            });
        });
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    async openDownloadedFile(filePath) {
        if (ipcRenderer) {
            // Electron режим - открываем через системный плеер
            try {
                await ipcRenderer.invoke('open-file', filePath);
                this.showToast('Файл открыт', 'success');
            } catch (error) {
                this.showToast('Ошибка открытия файла: ' + error.message, 'error');
            }
        } else {
            // Веб режим - показываем информацию
            this.showToast('В веб-режиме откройте файл вручную: ' + filePath, 'info');
        }
    }

    async showInFolder(filePath) {
        if (ipcRenderer) {
            // Electron режим - показываем в проводнике
            try {
                await ipcRenderer.invoke('show-in-folder', filePath);
            } catch (error) {
                this.showToast('Ошибка открытия папки: ' + error.message, 'error');
            }
        } else {
            // Веб режим - показываем путь
            this.showToast('Файл находится в: ' + filePath, 'info');
        }
    }

    removeFromDownloads(filePath) {
        let downloads = JSON.parse(localStorage.getItem('downloads') || '[]');
        downloads = downloads.filter(item => item.filePath !== filePath);
        localStorage.setItem('downloads', JSON.stringify(downloads));
        this.renderDownloads();
        this.showToast('Удалено из списка загрузок', 'info');
    }

    // VLC Integration Methods
    async checkVLCAvailability() {
        try {
            const response = await fetch('/api/vlc', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ action: 'check' })
            });
            
            const result = await response.json();
            this.vlcAvailable = result.available;
            
            const vlcBtn = document.getElementById('vlc-btn');
            if (this.vlcAvailable) {
                vlcBtn.disabled = false;
                vlcBtn.title = `Открыть в VLC Media Player (${result.path})`;
                console.log('✅ VLC доступен:', result.path);
            } else {
                vlcBtn.disabled = true;
                vlcBtn.title = 'VLC Media Player не найден. Установите VLC для использования этой функции.';
                console.log('❌ VLC не найден');
            }
        } catch (error) {
            console.error('❌ Ошибка проверки VLC:', error);
            const vlcBtn = document.getElementById('vlc-btn');
            vlcBtn.disabled = true;
            vlcBtn.title = 'Ошибка проверки VLC';
        }
    }

    async playInVLC() {
        if (!this.currentVideo) {
            this.showToast('Сначала загрузите видео', 'error');
            return;
        }

        if (!this.vlcAvailable) {
            this.showToast('VLC Media Player не найден. Установите VLC для использования этой функции.', 'error');
            return;
        }

        try {
            this.showLoading('Запуск VLC Media Player...');
            
            const response = await fetch('/api/vlc', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    action: 'play',
                    url: this.currentVideo.url 
                })
            });
            
            const result = await response.json();
            this.hideLoading();
            
            if (result.success) {
                this.showToast('Видео запущено в VLC Media Player', 'success');
            } else {
                this.showToast('Ошибка запуска VLC: ' + result.error, 'error');
            }
        } catch (error) {
            this.hideLoading();
            console.error('❌ Ошибка запуска VLC:', error);
            this.showToast('Ошибка запуска VLC: ' + error.message, 'error');
        }
    }

    async stopVLC() {
        try {
            const response = await fetch('/api/vlc', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ action: 'stop' })
            });
            
            const result = await response.json();
            if (result.success) {
                this.showToast('VLC остановлен', 'info');
            }
        } catch (error) {
            console.error('❌ Ошибка остановки VLC:', error);
        }
    }
}

// Initialize the media player UI when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new MediaPlayerUI();
});

// Handle drag and drop for files
document.addEventListener('dragover', (e) => {
    e.preventDefault();
});

document.addEventListener('drop', (e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
        const file = files[0];
        const mediaPlayer = window.mediaPlayerUI || new MediaPlayerUI();
        mediaPlayer.loadLocalFile(file.path);
    }
}); 