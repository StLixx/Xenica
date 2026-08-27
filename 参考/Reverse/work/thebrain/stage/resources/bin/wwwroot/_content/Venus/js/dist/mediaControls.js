import { safeInvoke } from "./interop.js";
export class MediaControls {
    static initializeMediaControls(mediaElement, dotNetHelper) {
        if (!mediaElement)
            return;
        mediaElement.addEventListener('play', () => {
            safeInvoke(dotNetHelper, 'UpdatePlayState', [true]);
        });
        mediaElement.addEventListener('pause', () => {
            safeInvoke(dotNetHelper, 'UpdatePlayState', [false]);
        });
        mediaElement.addEventListener('timeupdate', () => {
            safeInvoke(dotNetHelper, 'UpdateTime', [mediaElement.currentTime, mediaElement.duration]);
        });
        mediaElement.addEventListener('volumechange', () => {
            safeInvoke(dotNetHelper, 'UpdateVolume', [mediaElement.volume, mediaElement.muted]);
        });
        mediaElement.addEventListener('loadedmetadata', () => {
            safeInvoke(dotNetHelper, 'UpdateTime', [mediaElement.currentTime, mediaElement.duration]);
            safeInvoke(dotNetHelper, 'UpdateVolume', [mediaElement.volume, mediaElement.muted]);
        });
        const fullscreenChangeHandler = () => {
            const isFullscreen = !!(document.fullscreenElement ||
                document.webkitFullscreenElement ||
                document.mozFullScreenElement ||
                document.msFullscreenElement);
            safeInvoke(dotNetHelper, 'UpdateFullscreenState', [isFullscreen]);
        };
        document.addEventListener('fullscreenchange', fullscreenChangeHandler);
        document.addEventListener('webkitfullscreenchange', fullscreenChangeHandler);
        document.addEventListener('mozfullscreenchange', fullscreenChangeHandler);
        document.addEventListener('msfullscreenchange', fullscreenChangeHandler);
    }
    static togglePlayPause(mediaElement) {
        if (!mediaElement)
            return;
        if (mediaElement.paused) {
            mediaElement.play().catch(err => {
                console.warn('Play failed:', err);
            });
        }
        else {
            mediaElement.pause();
        }
    }
    static seekTo(mediaElement, time) {
        if (!mediaElement)
            return;
        mediaElement.currentTime = time;
    }
    static setVolume(mediaElement, volume) {
        if (!mediaElement)
            return;
        mediaElement.volume = Math.max(0, Math.min(1, volume));
        if (mediaElement.muted && volume > 0) {
            mediaElement.muted = false;
        }
    }
    static toggleMute(mediaElement) {
        if (!mediaElement)
            return;
        mediaElement.muted = !mediaElement.muted;
    }
    static toggleFullscreen(mediaElement) {
        if (!mediaElement)
            return;
        if (!document.fullscreenElement) {
            if (mediaElement.requestFullscreen) {
                mediaElement.requestFullscreen().catch(err => {
                    console.warn('Fullscreen request failed:', err);
                });
            }
            else if (mediaElement.webkitRequestFullscreen) {
                mediaElement.webkitRequestFullscreen();
            }
            else if (mediaElement.mozRequestFullScreen) {
                mediaElement.mozRequestFullScreen();
            }
            else if (mediaElement.msRequestFullscreen) {
                mediaElement.msRequestFullscreen();
            }
        }
        else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            }
            else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            }
            else if (document.mozCancelFullScreen) {
                document.mozCancelFullScreen();
            }
            else if (document.msExitFullscreen) {
                document.msExitFullscreen();
            }
        }
    }
    static getClickPercentage(element, clientX) {
        if (!element)
            return 0;
        const rect = element.getBoundingClientRect();
        const x = clientX - rect.left;
        const width = rect.width;
        if (width === 0)
            return 0;
        const percentage = Math.max(0, Math.min(1, x / width));
        return percentage;
    }
}
//# sourceMappingURL=mediaControls.js.map