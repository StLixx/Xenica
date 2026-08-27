// Media Controls TypeScript Module
// Provides functionality for controlling HTML5 video/audio elements

import {safeInvoke} from "./interop.js";

interface DotNetHelper {
    invokeMethodAsync(methodName: string, ...args: any[]): Promise<any>;
}

export class MediaControls {

    public static initializeMediaControls(mediaElement: HTMLMediaElement, dotNetHelper: DotNetHelper): void {
        if (!mediaElement) return;

        // Set up event listeners
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

        // Listen for fullscreen changes (with vendor prefixes)
        const fullscreenChangeHandler = () => {
            const isFullscreen = !!(document.fullscreenElement ||
                                    (document as any).webkitFullscreenElement ||
                                    (document as any).mozFullScreenElement ||
                                    (document as any).msFullscreenElement);
            safeInvoke(dotNetHelper, 'UpdateFullscreenState', [isFullscreen]);
        };

        document.addEventListener('fullscreenchange', fullscreenChangeHandler);
        document.addEventListener('webkitfullscreenchange', fullscreenChangeHandler);
        document.addEventListener('mozfullscreenchange', fullscreenChangeHandler);
        document.addEventListener('msfullscreenchange', fullscreenChangeHandler);
    }

    public static togglePlayPause(mediaElement: HTMLMediaElement): void {
        if (!mediaElement) return;

        if (mediaElement.paused) {
            mediaElement.play().catch(err => {
                console.warn('Play failed:', err);
            });
        } else {
            mediaElement.pause();
        }
    }

    public static seekTo(mediaElement: HTMLMediaElement, time: number): void {
        if (!mediaElement) return;
        mediaElement.currentTime = time;
    }

    public static setVolume(mediaElement: HTMLMediaElement, volume: number): void {
        if (!mediaElement) return;
        mediaElement.volume = Math.max(0, Math.min(1, volume));
        if (mediaElement.muted && volume > 0) {
            mediaElement.muted = false;
        }
    }

    public static toggleMute(mediaElement: HTMLMediaElement): void {
        if (!mediaElement) return;
        mediaElement.muted = !mediaElement.muted;
    }

    public static toggleFullscreen(mediaElement: HTMLMediaElement): void {
        if (!mediaElement) return;

        if (!document.fullscreenElement) {
            if (mediaElement.requestFullscreen) {
                mediaElement.requestFullscreen().catch(err => {
                    console.warn('Fullscreen request failed:', err);
                });
            } else if ((mediaElement as any).webkitRequestFullscreen) {
                (mediaElement as any).webkitRequestFullscreen();
            } else if ((mediaElement as any).mozRequestFullScreen) {
                (mediaElement as any).mozRequestFullScreen();
            } else if ((mediaElement as any).msRequestFullscreen) {
                (mediaElement as any).msRequestFullscreen();
            }
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if ((document as any).webkitExitFullscreen) {
                (document as any).webkitExitFullscreen();
            } else if ((document as any).mozCancelFullScreen) {
                (document as any).mozCancelFullScreen();
            } else if ((document as any).msExitFullscreen) {
                (document as any).msExitFullscreen();
            }
        }
    }

    public static getClickPercentage(element: HTMLElement, clientX: number): number {
        if (!element) return 0;

        const rect = element.getBoundingClientRect();
        const x = clientX - rect.left;
        const width = rect.width;

        if (width === 0) return 0;

        const percentage = Math.max(0, Math.min(1, x / width));
        return percentage;
    }
}
