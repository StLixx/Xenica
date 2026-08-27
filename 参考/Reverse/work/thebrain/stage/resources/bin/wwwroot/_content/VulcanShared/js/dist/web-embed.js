import { safeInvoke } from "./interop.js";
class WebEmbedHelper {
    constructor() {
        this.observers = new Map();
        this.intersectionObservers = new Map();
        this.mutationObservers = new Map();
        this.scrollListeners = new Map();
        this.resizeListeners = new Map();
        this.zoomMediaQueries = new Map();
        this.zoomListeners = new Map();
        this.lastPositions = new Map();
    }
    setDotNetHelper(newDotNetHelper) {
        this.dotNetHelper = newDotNetHelper;
    }
    startTracking(webEmbedControlId) {
        var element = document.getElementById(webEmbedControlId);
        if (!element)
            return;
        const updatePosition = () => {
            const rect = element.getBoundingClientRect();
            const newPosition = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
            const lastPosition = this.lastPositions.get(webEmbedControlId);
            if (!lastPosition ||
                Math.abs(lastPosition.left - newPosition.left) > 0.1 ||
                Math.abs(lastPosition.top - newPosition.top) > 0.1 ||
                Math.abs(lastPosition.width - newPosition.width) > 0.1 ||
                Math.abs(lastPosition.height - newPosition.height) > 0.1) {
                this.lastPositions.set(webEmbedControlId, newPosition);
                safeInvoke(this.dotNetHelper, 'PositionWebEmbed', [rect.left, rect.top, rect.width, rect.height]);
            }
        };
        updatePosition();
        const resizeObserver = new ResizeObserver(updatePosition);
        resizeObserver.observe(element);
        this.observers.set(webEmbedControlId, resizeObserver);
        const intersectionObserver = new IntersectionObserver((entries) => {
            updatePosition();
        }, {
            rootMargin: '100px',
            threshold: 0
        });
        intersectionObserver.observe(element);
        this.intersectionObservers.set(webEmbedControlId, intersectionObserver);
        const mutationObserver = new MutationObserver((mutations) => {
            let shouldUpdate = false;
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList' ||
                    mutation.type === 'attributes' ||
                    mutation.type === 'characterData') {
                    shouldUpdate = true;
                }
            });
            if (shouldUpdate) {
                setTimeout(updatePosition, 0);
            }
        });
        mutationObserver.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['style', 'class'],
            characterData: true
        });
        this.mutationObservers.set(webEmbedControlId, mutationObserver);
        const scrollListener = () => updatePosition();
        window.addEventListener('scroll', scrollListener, true);
        this.scrollListeners.set(webEmbedControlId, scrollListener);
        const resizeListener = () => updatePosition();
        window.addEventListener('resize', resizeListener);
        this.resizeListeners.set(webEmbedControlId, resizeListener);
        safeInvoke(this.dotNetHelper, 'UpdateZoomLevel', [window.devicePixelRatio]);
        let currentZoom = window.devicePixelRatio;
        const setupZoomListener = () => {
            const oldMediaQuery = this.zoomMediaQueries.get(webEmbedControlId);
            const oldListener = this.zoomListeners.get(webEmbedControlId);
            if (oldMediaQuery && oldListener) {
                oldMediaQuery.removeEventListener('change', oldListener);
            }
            const mqString = `(resolution: ${currentZoom}dppx)`;
            const mediaQuery = matchMedia(mqString);
            const zoomListener = () => {
                const newZoom = window.devicePixelRatio;
                if (Math.abs(newZoom - currentZoom) > 0.001) {
                    currentZoom = newZoom;
                    safeInvoke(this.dotNetHelper, 'UpdateZoomLevel', [newZoom]);
                    updatePosition();
                    setupZoomListener();
                }
            };
            mediaQuery.addEventListener('change', zoomListener);
            this.zoomMediaQueries.set(webEmbedControlId, mediaQuery);
            this.zoomListeners.set(webEmbedControlId, zoomListener);
        };
        setupZoomListener();
    }
    stopTracking(webEmbedControlId) {
        const observer = this.observers.get(webEmbedControlId);
        if (observer) {
            observer.disconnect();
            this.observers.delete(webEmbedControlId);
        }
        const intersectionObserver = this.intersectionObservers.get(webEmbedControlId);
        if (intersectionObserver) {
            intersectionObserver.disconnect();
            this.intersectionObservers.delete(webEmbedControlId);
        }
        const mutationObserver = this.mutationObservers.get(webEmbedControlId);
        if (mutationObserver) {
            mutationObserver.disconnect();
            this.mutationObservers.delete(webEmbedControlId);
        }
        const scrollListener = this.scrollListeners.get(webEmbedControlId);
        if (scrollListener) {
            window.removeEventListener('scroll', scrollListener, true);
            this.scrollListeners.delete(webEmbedControlId);
        }
        const resizeListener = this.resizeListeners.get(webEmbedControlId);
        if (resizeListener) {
            window.removeEventListener('resize', resizeListener);
            this.resizeListeners.delete(webEmbedControlId);
        }
        const zoomMediaQuery = this.zoomMediaQueries.get(webEmbedControlId);
        const zoomListener = this.zoomListeners.get(webEmbedControlId);
        if (zoomMediaQuery && zoomListener) {
            zoomMediaQuery.removeEventListener('change', zoomListener);
            this.zoomMediaQueries.delete(webEmbedControlId);
            this.zoomListeners.delete(webEmbedControlId);
        }
        this.lastPositions.delete(webEmbedControlId);
    }
}
export const webEmbedHelper = new WebEmbedHelper();
globalThis.webEmbedHelper = webEmbedHelper;
//# sourceMappingURL=web-embed.js.map