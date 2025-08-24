// Retro Music Player JavaScript
class MusicPlayer {
    constructor() {
        this.audioPlayer = document.getElementById('audioPlayer');
        this.playlist = [];
        this.currentTrackIndex = 0;
        this.youtubePlayer = null;
        this.progressInterval = null;
        this.nextTrackPreloaded = false;

        // Feature flags
        this.enableCuratedPlaylists = false;

        // Cache for playlist data
        this.playlistCache = new Map();
        this.cacheExpiration = 30 * 60 * 1000; // 30 minutes in milliseconds

        // Mobile touch handling
        this.touchStartX = 0;
        this.touchStartY = 0;
        this.isTouchDevice = 'ontouchstart' in window;

        // State machine
        this.playerState = 'UNINITIALIZED';
        this.trackState = 'NO_TRACK';
        this.playbackState = 'STOPPED';

        // State definitions
        this.PLAYER_STATES = {
            UNINITIALIZED: 'UNINITIALIZED',
            INITIALIZING: 'INITIALIZING',
            READY: 'READY',
            ERROR: 'ERROR'
        };

        this.TRACK_STATES = {
            NO_TRACK: 'NO_TRACK',
            LOADING: 'LOADING',
            LOADED: 'LOADED',
            ERROR: 'ERROR'
        };

        this.PLAYBACK_STATES = {
            STOPPED: 'STOPPED',
            PLAYING: 'PLAYING',
            PAUSED: 'PAUSED',
            BUFFERING: 'BUFFERING',
            ENDED: 'ENDED'
        };

        this.initializeElements();
        this.bindEvents();

        // Initialize YouTube player when API is ready
        this.transitionPlayerState('INITIALIZING');
        window.onYouTubeIframeAPIReady = () => {
            this.initYouTubePlayer();
        };

        // If API is already loaded
        if (window.YT && window.YT.Player) {
            this.initYouTubePlayer();
        }

        // Start progress update interval
        this.startProgressUpdates();

        // Initialize curated playlists only if feature flag is enabled
        if (this.enableCuratedPlaylists) {
            setTimeout(() => {
                this.initializeCuratedPlaylists();
            }, 100);
        } else {
            this.hideCuratedPlaylistsUI();
        }
    }

    // State machine methods
    transitionPlayerState(newState) {
        console.log(`Player state: ${this.playerState} -> ${newState}`);
        this.playerState = newState;
        this.updateUI();
    }

    transitionTrackState(newState) {
        console.log(`Track state: ${this.trackState} -> ${newState}`);
        this.trackState = newState;
        this.updateUI();
    }

    transitionPlaybackState(newState) {
        // console.log(`Playback state: ${this.playbackState} -> ${newState}`);
        this.playbackState = newState;
        this.updateUI();
    }

    canPlay() {
        return this.playerState === 'READY' &&
            this.trackState === 'LOADED' &&
            this.playbackState !== 'PLAYING';
    }

    canPause() {
        return this.playerState === 'READY' &&
            this.trackState === 'LOADED' &&
            this.playbackState === 'PLAYING';
    }

    canLoadTrack() {
        return this.playerState === 'READY';
    }

    updateUI() {
        // Update play button based on state
        if (this.playbackState === 'PLAYING') {
            this.playBtn.textContent = '⏸';
        } else {
            this.playBtn.textContent = '▶';
        }

        // Update status message based on states
        if (this.playerState === 'INITIALIZING') {
            this.updateStatusMessage('Initializing YouTube player...');
        } else if (this.playerState === 'READY' && this.trackState === 'NO_TRACK') {
            this.updateStatusMessage('Ready - Load a YouTube video');
        } else if (this.trackState === 'LOADING') {
            this.updateStatusMessage('Loading track...');
        } else if (this.trackState === 'LOADED' && this.playbackState === 'STOPPED') {
            this.updateStatusMessage('Track ready to play');
        } else if (this.playbackState === 'PLAYING') {
            this.updateStatusMessage('Playing');
        } else if (this.playbackState === 'PAUSED') {
            this.updateStatusMessage('Paused');
        }
    }

    initializeElements() {
        this.mainThumbnail = document.getElementById('mainThumbnail');
        this.mainThumbnailImg = document.getElementById('mainThumbnailImg');
        this.playBtn = document.getElementById('playBtn');
        this.prevBtn = document.getElementById('prevBtn');
        this.nextBtn = document.getElementById('nextBtn');
        this.progressFill = document.getElementById('progressFill');
        this.currentTimeEl = document.getElementById('currentTime');
        this.totalTimeEl = document.getElementById('duration');
        this.trackTitle = document.getElementById('trackTitle');
        this.trackArtist = document.getElementById('trackArtist');
        this.statusMessage = document.getElementById('statusMessage');
        this.playlistItems = document.getElementById('playlistItems');
        this.youtubeUrl = document.getElementById('youtubeUrl');
        this.loadYoutubeBtn = document.getElementById('loadYoutubeBtn');
        this.playlistCategories = document.getElementById('playlistCategories');
        this.curatedPlaylistsGrid = document.getElementById('curatedPlaylistsGrid');
    }

    bindEvents() {
        // Control buttons
        this.playBtn.addEventListener('click', () => this.togglePlay());
        // this.stopBtn.addEventListener('click', () => this.stop()); // No stop button in HTML
        this.prevBtn.addEventListener('click', () => this.previousTrack());
        this.nextBtn.addEventListener('click', () => this.nextTrack());
        this.loadYoutubeBtn.addEventListener('click', () => this.loadYouTube());

        // Clear playlist button
        const clearPlaylistBtn = document.getElementById('clearPlaylistBtn');
        if (clearPlaylistBtn) {
            clearPlaylistBtn.addEventListener('click', () => this.clearPlaylist());
        }

        // YouTube input and button
        this.youtubeUrl.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.loadYouTube();
            }
        });

        // Curated playlist events (only if enabled)
        if (this.enableCuratedPlaylists) {
            this.bindCuratedPlaylistEvents();
        }

        // Progress bar click to seek
        const progressBar = document.querySelector('.progress-bar');
        progressBar.addEventListener('click', (e) => this.seek(e));
        if (this.isTouchDevice) {
            progressBar.addEventListener('touchend', (e) => {
                e.preventDefault();
                this.seek(e.changedTouches[0]);
            });
        }

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space') {
                e.preventDefault();
                this.togglePlay();
            } else if (e.code === 'ArrowLeft') {
                e.preventDefault();
                this.previousTrack();
            } else if (e.code === 'ArrowRight') {
                e.preventDefault();
                this.nextTrack();
            } else if (e.code === 'Escape') {
                e.preventDefault();
                this.stop();
            }
        });
    }

    async loadYouTube() {
        const url = this.youtubeUrl.value.trim();
        if (!url) {
            this.updateStatusMessage('Please enter a YouTube URL');
            return;
        }

        // Check if URL contains a playlist
        if (url.includes('list=')) {
            await this.loadYouTubePlaylist(url);
        } else {
            await this.loadYouTubeVideo(url);
        }
    }

    renderPlaylist() {
        if (this.playlist.length === 0) {
            this.playlistItems.innerHTML = '<p class="empty-playlist">No music loaded</p>';
            return;
        }

        this.playlistItems.innerHTML = '';
        this.playlist.forEach((track, index) => {
            const item = document.createElement('div');
            item.className = `playlist-item ${index === this.currentTrackIndex ? 'active' : ''}`;

            if (track.isYouTube && track.thumbnail) {
                item.innerHTML = `
                    <div class="playlist-item-thumbnail">
                        <img src="${track.thumbnail}" alt="Thumbnail" loading="lazy">
                    </div>
                    <div class="playlist-item-info">
                        <div class="playlist-item-title">${track.name}</div>
                        <div class="playlist-item-artist">${track.artist}</div>
                    </div>
                    <button class="playlist-item-remove" title="Remove from playlist">×</button>
                `;
            } else {
                item.innerHTML = `
                    <div class="playlist-item-info">
                        <div class="playlist-item-title">${track.name}</div>
                        <div class="playlist-item-artist">${track.artist}</div>
                    </div>
                    <button class="playlist-item-remove" title="Remove from playlist">×</button>
                `;
            }

            // Add click event for selecting track (but not on remove button)
            item.addEventListener('click', (e) => {
                if (!e.target.classList.contains('playlist-item-remove')) {
                    this.selectTrack(index);
                }
            });

            // Add remove button event
            const removeBtn = item.querySelector('.playlist-item-remove');
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.removeTrack(index);
            });

            this.playlistItems.appendChild(item);
        });
    }

    selectTrack(index) {
        if (index >= 0 && index < this.playlist.length) {
            this.currentTrackIndex = index;
            this.shouldAutoPlay = true;
            this.loadTrack(index);
            this.renderPlaylist();
        }
    }

    removeTrack(index) {
        if (index < 0 || index >= this.playlist.length) return;

        const wasCurrentTrack = index === this.currentTrackIndex;
        const wasPlaying = this.playbackState === 'PLAYING';

        // Remove track from playlist
        this.playlist.splice(index, 1);

        // Handle empty playlist
        if (this.playlist.length === 0) {
            this.stop();
            this.animateTrackInfoChange('Ready to Play', '');
            this.mainThumbnailImg.style.display = 'none';
            this.currentTrackIndex = 0;
            this.renderPlaylist();
            this.updateStatusMessage('Playlist is now empty');
            return;
        }

        // Adjust current track index
        if (index < this.currentTrackIndex) {
            // Removed track was before current track
            this.currentTrackIndex--;
        } else if (index === this.currentTrackIndex) {
            // Removed the currently playing track
            if (this.currentTrackIndex >= this.playlist.length) {
                // Was the last track, go to first track
                this.currentTrackIndex = 0;
            }
            // Load the new current track
            this.loadTrack(this.currentTrackIndex);
            if (wasPlaying) {
                // Auto-play if the removed track was playing
                this.shouldAutoPlay = true;
            }
        }
        // If index > currentTrackIndex, no adjustment needed

        this.renderPlaylist();
        this.updateStatusMessage(`Removed track from playlist (${this.playlist.length} remaining)`);
    }

    loadTrack(index) {
        if (index < 0 || index >= this.playlist.length) return;

        if (!this.canLoadTrack()) {
            console.log('Cannot load track - player not ready');
            // Wait for player to be ready, then retry
            if (this.playerState === 'INITIALIZING') {
                setTimeout(() => this.loadTrack(index), 1000);
            }
            return;
        }

        const track = this.playlist[index];
        this.currentTrackIndex = index;

        // Transition to loading state
        this.transitionTrackState('LOADING');
        this.transitionPlaybackState('STOPPED');

        // Reset preload flag for new track
        this.nextTrackPreloaded = false;

        // Load YouTube video
        this.loadYouTubePlayer(track.videoId);

        // Update track info with animation
        this.animateTrackInfoChange(track.name, track.artist);

        if (track.thumbnail) {
            this.mainThumbnailImg.src = track.thumbnail;
            this.mainThumbnailImg.style.display = 'block';
            document.querySelector('.thumbnail-placeholder').style.display = 'none';
        } else {
            this.mainThumbnailImg.style.display = 'none';
            document.querySelector('.thumbnail-placeholder').style.display = 'flex';
        }

        this.renderPlaylist();
        this.updateStatusMessage(`Loaded: ${track.name}`);
    }

    togglePlay() {
        console.log(this.playlist)
        if (this.playlist.length === 0) {
            this.updateStatusMessage('Please load YouTube videos first');
            return;
        }

        if (this.canPause()) {
            this.pause();
        } else if (this.canPlay()) {
            this.play();
        }
    }

    play() {
        if (!this.canPlay()) {
            console.log('Cannot play - invalid state');
            return;
        }

        if (this.youtubePlayer && this.youtubePlayer.playVideo) {
            this.youtubePlayer.playVideo();
            this.transitionPlaybackState('PLAYING');
        }
    }

    pause() {
        if (!this.canPause()) {
            console.log('Cannot pause - invalid state');
            return;
        }

        if (this.youtubePlayer && this.youtubePlayer.pauseVideo) {
            this.youtubePlayer.pauseVideo();
            this.transitionPlaybackState('PAUSED');
        }
    }

    stop() {
        if (this.youtubePlayer && this.youtubePlayer.pauseVideo) {
            this.youtubePlayer.pauseVideo();
            this.youtubePlayer.seekTo(0);
        }

        this.transitionPlaybackState('STOPPED');
        this.progressFill.style.width = '0%';
        this.currentTimeEl.textContent = '0:00';
    }

    previousTrack() {
        if (this.playlist.length === 0) return;

        // Mark that we should auto-play if currently playing
        if (this.playbackState === 'PLAYING') {
            this.shouldAutoPlay = true;
        }

        this.currentTrackIndex = (this.currentTrackIndex - 1 + this.playlist.length) % this.playlist.length;
        this.loadTrack(this.currentTrackIndex);
        this.renderPlaylist();
    }

    nextTrack() {
        if (this.playlist.length === 0) return;

        // Mark that we should auto-play if currently playing
        if (this.playbackState === 'PLAYING') {
            this.shouldAutoPlay = true;
        }

        this.currentTrackIndex = (this.currentTrackIndex + 1) % this.playlist.length;
        this.loadTrack(this.currentTrackIndex);
        this.renderPlaylist();
    }

    seamlessNextTrack() {
        if (this.playlist.length === 0) return;

        // Mark that we should auto-play the next track
        this.shouldAutoPlay = true;

        this.currentTrackIndex = (this.currentTrackIndex + 1) % this.playlist.length;
        this.loadTrack(this.currentTrackIndex);
        this.renderPlaylist();
    }

    updateProgress() {
        if ((this.playbackState === 'READY' || this.playbackState === 'PLAYING') && this.youtubePlayer) {
            try {
                const currentTime = this.youtubePlayer.playerInfo?.currentTime || this.youtubePlayer.getCurrentTime();
                const duration = this.youtubePlayer.playerInfo?.duration || this.youtubePlayer.getDuration();


                if (duration > 0 && !isNaN(duration) && !isNaN(currentTime)) {
                    const progress = (currentTime / duration) * 100;
                    this.progressFill.style.width = progress + '%';
                    this.currentTimeEl.textContent = this.formatTime(currentTime);
                    this.totalTimeEl.textContent = this.formatTime(duration);

                    // Pre-load next track when current track is near end (last 3 seconds)
                    if (duration - currentTime <= 3 && !this.nextTrackPreloaded) {
                        this.preloadNextTrack();
                    }
                } else if (duration === 0) {
                    // Video might still be loading
                    this.currentTimeEl.textContent = '0:00';
                    this.totalTimeEl.textContent = '--:--';
                }
            } catch (error) {
                console.log('YouTube player not ready for progress updates', error);
            }
        }
    }

    seek(event) {
        const progressBar = event.currentTarget || event.target.closest('.progress-bar');
        const rect = progressBar.getBoundingClientRect();
        const clickX = (event.clientX || event.pageX) - rect.left;
        const width = rect.width;
        const percentage = Math.max(0, Math.min(1, clickX / width));

        if ((this.playbackState === 'READY' || this.playbackState === 'PLAYING') && this.youtubePlayer) {
            try {
                const duration = this.youtubePlayer.playerInfo?.duration || this.youtubePlayer.getDuration();
                if (duration > 0) {
                    const seekTime = percentage * duration;

                    console.log(this.youtubePlayer.seekTo)

                    this.youtubePlayer.seekTo(seekTime, true);
                } else {
                    console.log('Duration not available for seeking');
                }
            } catch (error) {
                console.error('Error seeking:', error);
            }
        } else {
            console.log('Cannot seek - player not ready or not YouTube source');
        }
    }

    startProgressUpdates() {
        this.progressInterval = setInterval(() => {
            this.updateProgress();
        }, 1000);
    }

    preloadNextTrack() {
        if (this.playlist.length <= 1) return;

        const nextIndex = (this.currentTrackIndex + 1) % this.playlist.length;
        const nextTrack = this.playlist[nextIndex];

        if (nextTrack && nextTrack.videoId) {
            // Mark as preloaded to avoid multiple preload attempts
            this.nextTrackPreloaded = true;
            this.updateStatusMessage('Preparing next track...');
        }
    }

    updateDuration() {
        if ((this.playbackState === 'READY' || this.playbackState === 'PLAYING') && this.youtubePlayer) {
            try {
                // Try playerInfo.duration first, fallback to getDuration()
                const duration = this.youtubePlayer.playerInfo?.duration || this.youtubePlayer.getDuration();
                if (duration > 0 && !isNaN(duration)) {
                    this.totalTimeEl.textContent = this.formatTime(duration);
                } else {
                    // Retry after a longer delay if duration not available yet
                    setTimeout(() => this.updateDuration(), 2000);
                }
            } catch (error) {
                console.log('Duration not available yet, retrying...', error);
                setTimeout(() => this.updateDuration(), 2000);
            }
        } else {
            // Player not ready, wait longer
            setTimeout(() => this.updateDuration(), 2000);
        }
    }

    formatTime(seconds) {
        if (isNaN(seconds)) return '0:00';

        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    initYouTubePlayer() {
        this.youtubePlayer = new YT.Player('youtubePlayer', {
            height: '0',
            width: '0',
            events: {
                'onReady': (event) => {
                    console.log('YouTube player ready');
                    this.youtubePlayer = event.target;

                    // Wait for all methods to be available before marking as ready
                    this.waitForPlayerMethods();
                },
                'onStateChange': (event) => this.onYouTubeStateChange(event)
            }
        });
    }

    waitForPlayerMethods() {
        const checkMethods = () => {
            if (this.youtubePlayer &&
                typeof this.youtubePlayer.getDuration === 'function' &&
                typeof this.youtubePlayer.getCurrentTime === 'function' &&
                typeof this.youtubePlayer.cueVideoById === 'function' &&
                typeof this.youtubePlayer.playVideo === 'function' &&
                typeof this.youtubePlayer.seekTo === 'function') {

                console.log('All YouTube player methods available');
                this.transitionPlayerState('READY');

                // Load default playlist after player is ready
                this.loadDefaultPlaylist();
            } else {
                console.log('Waiting for YouTube player methods...');
                setTimeout(checkMethods, 500);
            }
        };

        checkMethods();
    }

    async loadDefaultPlaylist() {
        try {
            const defaultPlaylistUrl = 'https://www.youtube.com/playlist?list=PLK6xDuf0xV-dznUlGRYJs_wqCDPUv651D';
            await this.loadYouTubePlaylist(defaultPlaylistUrl);
        } catch (error) {
            console.error('Error loading default playlist:', error);
            this.updateStatusMessage('Ready - Load a YouTube video');
        }
    }

    onYouTubeStateChange(event) {
        if (event.data === YT.PlayerState.ENDED) {
            this.transitionPlaybackState('ENDED');
            this.seamlessNextTrack();
        } else if (event.data === YT.PlayerState.PLAYING) {
            this.transitionPlaybackState('PLAYING');
            this.updateDuration();
        } else if (event.data === YT.PlayerState.PAUSED) {
            this.transitionPlaybackState('PAUSED');
        } else if (event.data === YT.PlayerState.BUFFERING) {
            this.transitionPlaybackState('BUFFERING');
        } else if (event.data === YT.PlayerState.CUED) {
            this.transitionTrackState('LOADED');
            setTimeout(() => {
                this.updateDuration();
                this.updateProgress();
            }, 1500);
            // Auto-play if we were playing before
            if (this.shouldAutoPlay) {
                setTimeout(() => {
                    this.youtubePlayer.playVideo();
                    this.shouldAutoPlay = false;
                }, 1500);
            }
        }
    }

    loadYouTubePlayer(videoId) {
        console.log(this.playerState, videoId)
        if (this.playerState === 'READY' && this.youtubePlayer.cueVideoById) {
            this.youtubePlayer.cueVideoById(videoId);

            // If we should auto-play, do it after a short delay
            if (this.shouldAutoPlay) {
                setTimeout(() => {
                    this.youtubePlayer.playVideo();
                    this.shouldAutoPlay = false;
                }, 500);
            }
        } else if (this.playerState !== 'READY') {
            this.updateStatusMessage('YouTube player initializing...');
        }
    }


    async loadYouTubeVideo(url) {
        if (this.playerState !== 'READY') {
            this.updateStatusMessage('Player not ready - please wait');
            return;
        }

        const videoId = this.extractYouTubeVideoId(url);
        if (!videoId) {
            this.updateStatusMessage('Invalid YouTube URL');
            return;
        }

        this.updateStatusMessage('Loading YouTube video...');
        this.loadYoutubeBtn.textContent = 'Loading...';
        this.loadYoutubeBtn.disabled = true;

        try {
            // Get video info using oEmbed API
            const videoInfo = await this.getYouTubeVideoInfo(videoId);
            const track = {
                name: videoInfo.title || 'YouTube Video',
                artist: videoInfo.author_name || 'YouTube',
                url: null,
                videoId: videoId,
                thumbnail: videoInfo.thumbnail_url,
                isYouTube: true
            };

            this.playlist.push(track);

            // If no track is currently loaded, load this one
            if (this.playlist.length === 1) {
                this.currentTrackIndex = 0;
                this.loadTrack(0);
            }

            this.renderPlaylist();
            this.youtubeUrl.value = '';
            this.updateStatusMessage('YouTube video added to playlist');
        } catch (error) {
            console.error('Error loading YouTube video:', error);
            this.updateStatusMessage('Error loading YouTube video');
        } finally {
            this.loadYoutubeBtn.textContent = 'Load';
            this.loadYoutubeBtn.disabled = false;
        }
    }

    extractYouTubeVideoId(url) {
        if (!url || typeof url !== 'string') {
            return null;
        }

        const patterns = [
            /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
            /youtube\.com\/watch\?.*v=([^&\n?#]+)/
        ];

        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match) return match[1];
        }
        return null;
    }

    extractYouTubePlaylistId(url) {
        if (!url || typeof url !== 'string') {
            return null;
        }

        const patterns = [
            /[?&]list=([^&\n?#]+)/,
            /youtube\.com\/playlist\?list=([^&\n?#]+)/
        ];

        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match) return match[1];
        }
        return null;
    }

    async getYouTubeVideoInfo(videoId) {
        try {
            const response = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
            if (!response.ok) {
                console.warn(`oEmbed failed for video ${videoId}, using fallback`);
                throw new Error('oEmbed request failed');
            }
            const data = await response.json();

            // Extract thumbnail URL from oEmbed response
            let thumbnailUrl = data.thumbnail_url;

            // If oEmbed doesn't provide thumbnail, use YouTube's direct thumbnail URLs
            if (!thumbnailUrl) {
                thumbnailUrl = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
            }

            return {
                title: data.title || 'YouTube Video',
                author_name: data.author_name || 'YouTube',
                thumbnail_url: thumbnailUrl
            };
        } catch (error) {
            // Fallback if oEmbed fails - use direct YouTube thumbnail and basic info
            console.log(`Using fallback info for video ${videoId}`);
            return {
                title: 'YouTube Video',
                author_name: 'YouTube',
                thumbnail_url: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`
            };
        }
    }

    async loadYouTubePlaylist(url) {
        if (this.playerState !== 'READY') {
            this.updateStatusMessage('Player not ready - please wait');
            return;
        }

        const playlistId = this.extractYouTubePlaylistId(url);
        if (!playlistId) {
            this.updateStatusMessage('Invalid YouTube playlist URL');
            return;
        }

        this.updateStatusMessage('Loading YouTube playlist...');
        this.loadYoutubeBtn.textContent = 'Loading...';
        this.loadYoutubeBtn.disabled = true;

        try {
            // Check if playlist is already loaded by checking for duplicate video IDs
            const videos = await this.getYouTubePlaylistVideos(playlistId);
            if (videos.length === 0) {
                this.updateStatusMessage('No videos found in playlist');
                return;
            }

            // Check for existing videos in current playlist
            const existingVideoIds = new Set(this.playlist.filter(track => track.isYouTube).map(track => track.videoId));
            const newVideos = videos.filter(video => !existingVideoIds.has(video.videoId));

            if (newVideos.length === 0) {
                this.updateStatusMessage('Playlist already added - no new videos to load');
                return;
            }

            if (newVideos.length < videos.length) {
                this.updateStatusMessage(`Found ${videos.length - newVideos.length} duplicate videos, adding ${newVideos.length} new videos...`);
            }

            // Add only new videos to playlist
            const promises = newVideos.map(async video => {
                const videoInfo = await this.getYouTubeVideoInfo(video.videoId);
                return {
                    name: videoInfo.title || video.title || 'YouTube Video',
                    artist: videoInfo.author_name || 'YouTube',
                    url: null,
                    videoId: video.videoId,
                    thumbnail: videoInfo.thumbnail_url || `https://img.youtube.com/vi/${video.videoId}/mqdefault.jpg`,
                    isYouTube: true
                };
            });

            const tracks = await Promise.all(promises);
            if (tracks && tracks.length > 0) {
                const playlistWasEmpty = this.playlist.length === 0;
                tracks.forEach(track => this.playlist.push(track));

                // If no track is currently loaded, load the first one
                if (playlistWasEmpty) {
                    this.currentTrackIndex = 0;
                    this.loadTrack(0);
                }

                this.renderPlaylist();
                this.youtubeUrl.value = '';
                this.updateStatusMessage(`Added ${tracks.length} new videos from playlist`);
            }
            // Cache the result
            const cacheKey = `playlist_${playlistId}`;
            this.playlistCache.set(cacheKey, {
                data: videos,
                timestamp: Date.now()
            });

            console.log('Cached playlist data for:', playlistId);
            return videos;
        } catch (error) {
            console.error('Error loading YouTube playlist', error);
        } finally {
            this.loadYoutubeBtn.textContent = 'LOAD';
            this.loadYoutubeBtn.disabled = false;
        }
    }

    // Cache management methods
    clearPlaylistCache() {
        this.playlistCache.clear();
        console.log('Playlist cache cleared');
    }

    getCacheStats() {
        const stats = {
            totalEntries: this.playlistCache.size,
            entries: []
        };

        for (const [key, value] of this.playlistCache.entries()) {
            const age = Date.now() - value.timestamp;
            const isExpired = age > this.cacheExpiration;
            stats.entries.push({
                key,
                age: Math.round(age / 1000), // age in seconds
                expired: isExpired,
                dataSize: value.data.length
            });
        }

        return stats;
    }

    cleanExpiredCache() {
        const now = Date.now();
        let cleaned = 0;

        for (const [key, value] of this.playlistCache.entries()) {
            if (now - value.timestamp > this.cacheExpiration) {
                this.playlistCache.delete(key);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            console.log(`Cleaned ${cleaned} expired cache entries`);
        }

        return cleaned;
    }

    async getYouTubePlaylistVideos(playlistId) {
        // Clean expired cache entries first
        this.cleanExpiredCache();

        // Check cache first
        const cacheKey = `playlist_${playlistId}`;
        const cached = this.playlistCache.get(cacheKey);

        if (cached && (Date.now() - cached.timestamp) < this.cacheExpiration) {
            console.log('Using cached playlist data for:', playlistId);
            return cached.data;
        }

        try {
            // Try multiple CORS proxy services for better reliability
            const rssUrl = `https://www.youtube.com/feeds/videos.xml?playlist_id=${playlistId}`;
            const proxyUrls = [
                `https://proxy.cors.sh/${rssUrl}`,
                `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(rssUrl)}`,
                `https://api.allorigins.win/raw?url=${encodeURIComponent(rssUrl)}`,
            ];

            let response;
            let lastError;

            for (const proxyUrl of proxyUrls) {
                try {
                    response = await fetch(proxyUrl);
                    if (response.ok) break;
                    lastError = new Error(`Proxy ${proxyUrl} returned ${response.status}`);
                } catch (error) {
                    lastError = error;
                    continue;
                }
            }

            if (!response || !response.ok) {
                throw lastError || new Error('All proxy services failed');
            }

            const xmlText = await response.text();
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

            const entries = xmlDoc.querySelectorAll('entry');
            const videos = [];

            entries.forEach(entry => {
                const videoId = entry.querySelector('videoId')?.textContent;
                const title = entry.querySelector('title')?.textContent;

                if (videoId && title) {
                    videos.push({
                        videoId: videoId,
                        title: title
                    });
                }
            });

            // Cache the result
            this.playlistCache.set(cacheKey, {
                data: videos,
                timestamp: Date.now()
            });

            console.log('Cached playlist data for:', playlistId);
            return videos.slice(0, 50); // Limit to first 50 videos
        } catch (error) {
            console.error('Error fetching playlist:', error);
            // Fallback: try to extract video IDs from playlist page HTML (limited)
            return this.fallbackPlaylistExtraction(playlistId);
        }
    }

    async fallbackPlaylistExtraction(playlistId) {
        try {
            // This is a basic fallback that won't work due to CORS, but shows the approach
            this.updateStatusMessage('Trying alternative method...');

            // For now, return empty array and suggest manual video addition
            this.updateStatusMessage('Unable to load playlist. Please add videos individually.');
            return [];
        } catch (error) {
            return [];
        }
    }

    hideCuratedPlaylistsUI() {
        // Hide curated playlists section
        const curatedSection = document.querySelector('.curated-playlists');
        if (curatedSection) {
            curatedSection.style.display = 'none';
        }

        // Hide category buttons
        const categoryButtons = document.querySelector('.playlist-categories');
        if (categoryButtons) {
            categoryButtons.style.display = 'none';
        }

        console.log('Curated playlists feature disabled');
    }

    initializeCuratedPlaylists() {
        // Check if curated playlists are loaded
        if (!window.CURATED_PLAYLISTS) {
            console.log('CURATED_PLAYLISTS not found, retrying...');
            setTimeout(() => {
                this.initializeCuratedPlaylists();
            }, 500);
            return;
        }

        console.log('CURATED_PLAYLISTS loaded successfully');
        this.currentCategory = 'all';
        this.renderCuratedPlaylists();
    }

    bindCuratedPlaylistEvents() {
        // Category button events
        this.playlistCategories.addEventListener('click', (e) => {
            if (e.target.classList.contains('category-btn')) {
                // Update active category
                this.playlistCategories.querySelectorAll('.category-btn').forEach(btn => {
                    btn.classList.remove('active');
                });
                e.target.classList.add('active');

                // Update current category and render
                this.currentCategory = e.target.dataset.category;
                this.renderCuratedPlaylists();
            }
        });
    }

    renderCuratedPlaylists() {
        if (!window.CURATED_PLAYLISTS) {
            console.error('CURATED_PLAYLISTS not loaded');
            return;
        }

        let playlists = [];

        if (this.currentCategory === 'all') {
            // Get all playlists from all categories
            for (const category of Object.keys(CURATED_PLAYLISTS)) {
                playlists.push(...Object.values(CURATED_PLAYLISTS[category]));
            }
        } else {
            // Get playlists from specific category
            if (CURATED_PLAYLISTS[this.currentCategory]) {
                playlists = Object.values(CURATED_PLAYLISTS[this.currentCategory]);
            }
        }

        this.curatedPlaylistsGrid.innerHTML = '';

        if (playlists.length === 0) {
            this.curatedPlaylistsGrid.innerHTML = '<p style="color: #ccc; text-align: center;">No playlists found</p>';
            return;
        }

        playlists.forEach(playlist => {
            const card = document.createElement('div');
            card.className = 'curated-playlist-card';
            card.dataset.playlistId = playlist.id;
            card.style.borderColor = playlist.color;

            card.innerHTML = `
                <div class="playlist-card-count">${playlist.videos.length}</div>
                <div class="playlist-thumbnail">${playlist.thumbnail}</div>
                <div class="playlist-card-title">${playlist.name}</div>
                <div class="playlist-card-description">${playlist.description}</div>
            `;

            this.curatedPlaylistsGrid.appendChild(card);
        });

        console.log(`Rendered ${playlists.length} playlists for category: ${this.currentCategory}`);
    }


    getPlaylistById(playlistId) {
        for (const category of Object.keys(CURATED_PLAYLISTS)) {
            for (const playlist of Object.values(CURATED_PLAYLISTS[category])) {
                if (playlist.id === playlistId) {
                    return playlist;
                }
            }
        }
        return null;
    }

    updateStatusMessage(message) {
        this.statusMessage.textContent = message;

        // Add a subtle animation to draw attention
        this.statusMessage.style.transform = 'scale(1.05)';
        setTimeout(() => {
            this.statusMessage.style.transform = 'scale(1)';
        }, 200);
    }

    initializeTouchGestures() {
        if (!this.isTouchDevice) return;

        const playerMain = document.querySelector('.player-main');

        playerMain.addEventListener('touchstart', (e) => {
            this.touchStartX = e.touches[0].clientX;
            this.touchStartY = e.touches[0].clientY;
        }, { passive: true });

        playerMain.addEventListener('touchend', (e) => {
            if (!this.touchStartX || !this.touchStartY) return;

            const touchEndX = e.changedTouches[0].clientX;
            const touchEndY = e.changedTouches[0].clientY;

            const deltaX = touchEndX - this.touchStartX;
            const deltaY = touchEndY - this.touchStartY;

            // Only process horizontal swipes (ignore vertical scrolling)
            if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50) {
                if (deltaX > 0) {
                    // Swipe right - previous track
                    this.previousTrack();
                } else {
                    // Swipe left - next track
                    this.nextTrack();
                }
            }

            // Double tap to play/pause
            if (Math.abs(deltaX) < 10 && Math.abs(deltaY) < 10) {
                const now = Date.now();
                if (this.lastTap && (now - this.lastTap) < 300) {
                    this.togglePlay();
                    this.lastTap = null;
                } else {
                    this.lastTap = now;
                }
            }

            this.touchStartX = 0;
            this.touchStartY = 0;
        }, { passive: true });
    }

    clearPlaylist() {
        // Stop current playback
        if (this.canPause()) {
            this.pause();
        }

        // Clear playlist data
        this.playlist = [];
        this.currentTrackIndex = 0;
        this.shouldAutoPlay = false;

        // Reset player states
        this.transitionTrackState('NO_TRACK');
        this.transitionPlaybackState('STOPPED');

        // Clear UI elements with animation
        this.animateTrackInfoChange('No Track Loaded', '');
        this.mainThumbnailImg.style.display = 'none';
        document.querySelector('.thumbnail-placeholder').style.display = 'flex';

        // Reset progress using correct element references
        this.progressFill.style.width = '0%';
        this.currentTimeEl.textContent = '0:00';
        this.totalTimeEl.textContent = '0:00';

        // Update playlist display
        this.renderPlaylist();
        this.updateStatusMessage('Playlist cleared');
    }

    animateTrackInfoChange(newTitle, newArtist) {
        // Fade out current content
        this.trackTitle.classList.add('fade-out');
        this.trackArtist.classList.add('fade-out');

        // After fade out completes, update content and fade in
        setTimeout(() => {
            this.trackTitle.textContent = newTitle;
            this.trackArtist.textContent = newArtist;
            
            // Remove fade-out and add fade-in
            this.trackTitle.classList.remove('fade-out');
            this.trackArtist.classList.remove('fade-out');
            this.trackTitle.classList.add('fade-in');
            this.trackArtist.classList.add('fade-in');

            // Clean up fade-in class after animation
            setTimeout(() => {
                this.trackTitle.classList.remove('fade-in');
                this.trackArtist.classList.remove('fade-in');
            }, 400);
        }, 200);
    }
}

// Make the player globally accessible
document.addEventListener('DOMContentLoaded', () => {
    new MusicPlayer();
});

// Add keyboard shortcuts for better UX
document.addEventListener('keydown', (e) => {
    if (window.musicPlayer) {
        switch (e.code) {
            case 'Space':
                e.preventDefault();
                window.musicPlayer.togglePlay();
                break;
            case 'ArrowLeft':
                e.preventDefault();
                window.musicPlayer.previousTrack();
                break;
            case 'ArrowRight':
                e.preventDefault();
                window.musicPlayer.nextTrack();
                break;
            case 'Escape':
                e.preventDefault();
                window.musicPlayer.stop();
                break;
        }
    }
});
