// This is only used by Deku is here in VulcanShared with all the other typescript for simplicity
import {safeInvoke} from "./interop.js";

class WebEmbedHelper {
	dotNetHelper: any;
	private observers: Map<string, ResizeObserver> = new Map();
	private intersectionObservers: Map<string, IntersectionObserver> = new Map();
	private mutationObservers: Map<string, MutationObserver> = new Map();
	private scrollListeners: Map<string, () => void> = new Map();
	private resizeListeners: Map<string, () => void> = new Map();
	private zoomMediaQueries: Map<string, MediaQueryList> = new Map();
	private zoomListeners: Map<string, () => void> = new Map();
	private lastPositions: Map<string, { left: number, top: number, width: number, height: number }> = new Map();

	setDotNetHelper(newDotNetHelper: any): void {
		this.dotNetHelper = newDotNetHelper;
	}

	startTracking(webEmbedControlId: string): void {
		var element = document.getElementById(webEmbedControlId);
		if (!element) return;

		const updatePosition = () => {
			const rect = element!.getBoundingClientRect();
			const newPosition = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };

			// Check if position actually changed to avoid unnecessary calls
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

		// Immediately update position
		updatePosition();

		// 1. Observe size changes of the element itself
		const resizeObserver = new ResizeObserver(updatePosition);
		resizeObserver.observe(element);
		this.observers.set(webEmbedControlId, resizeObserver);

		// 2. Observe position changes using IntersectionObserver
		const intersectionObserver = new IntersectionObserver((entries) => {
			updatePosition();
		}, {
			// Use root margin to ensure we catch changes even when element is slightly outside viewport
			rootMargin: '100px',
			// Use threshold of 0 to detect any intersection change
			threshold: 0
		});
		intersectionObserver.observe(element);
		this.intersectionObservers.set(webEmbedControlId, intersectionObserver);

		// 3. Observe DOM changes that might affect layout
		const mutationObserver = new MutationObserver((mutations) => {
			let shouldUpdate = false;
			mutations.forEach((mutation) => {
				// Check if any changes could affect our element's position
				if (mutation.type === 'childList' ||
					mutation.type === 'attributes' ||
					mutation.type === 'characterData') {
					shouldUpdate = true;
				}
			});
			if (shouldUpdate) {
				// Use setTimeout to allow DOM changes to settle
				setTimeout(updatePosition, 0);
			}
		});

		// Observe changes to the document body and the element's parent chain
		mutationObserver.observe(document.body, {
			childList: true,
			subtree: true,
			attributes: true,
			attributeFilter: ['style', 'class'], // Watch for style and class changes
			characterData: true
		});
		this.mutationObservers.set(webEmbedControlId, mutationObserver);

		// 4. Observe scroll changes
		const scrollListener = () => updatePosition();
		window.addEventListener('scroll', scrollListener, true);
		this.scrollListeners.set(webEmbedControlId, scrollListener);

		// 5. Observe window resize changes
		const resizeListener = () => updatePosition();
		window.addEventListener('resize', resizeListener);
		this.resizeListeners.set(webEmbedControlId, resizeListener);

		// 6. Observe zoom changes using matchMedia
		// Send initial zoom level
		safeInvoke(this.dotNetHelper, 'UpdateZoomLevel', [window.devicePixelRatio]);
		
		// Set up zoom change detection
		let currentZoom = window.devicePixelRatio;
		const setupZoomListener = () => {
			// Remove previous listener if it exists
			const oldMediaQuery = this.zoomMediaQueries.get(webEmbedControlId);
			const oldListener = this.zoomListeners.get(webEmbedControlId);
			if (oldMediaQuery && oldListener) {
				oldMediaQuery.removeEventListener('change', oldListener);
			}

			// Create new media query for current zoom level
			const mqString = `(resolution: ${currentZoom}dppx)`;
			const mediaQuery = matchMedia(mqString);
			
			// Create listener that detects when zoom changes
			const zoomListener = () => {
				const newZoom = window.devicePixelRatio;
				if (Math.abs(newZoom - currentZoom) > 0.001) {
					currentZoom = newZoom;
					// Notify .NET of zoom change
					safeInvoke(this.dotNetHelper, 'UpdateZoomLevel', [newZoom]);
					// Update position with new zoom
					updatePosition();
					// Set up new listener for the new zoom level
					setupZoomListener();
				}
			};
			
			mediaQuery.addEventListener('change', zoomListener);
			this.zoomMediaQueries.set(webEmbedControlId, mediaQuery);
			this.zoomListeners.set(webEmbedControlId, zoomListener);
		};
		
		setupZoomListener();
	}

	stopTracking(webEmbedControlId: string): void {
		// Stop observing size changes
		const observer = this.observers.get(webEmbedControlId);
		if (observer) {
			observer.disconnect();
			this.observers.delete(webEmbedControlId);
		}

		// Stop observing intersection changes
		const intersectionObserver = this.intersectionObservers.get(webEmbedControlId);
		if (intersectionObserver) {
			intersectionObserver.disconnect();
			this.intersectionObservers.delete(webEmbedControlId);
		}

		// Stop observing DOM changes
		const mutationObserver = this.mutationObservers.get(webEmbedControlId);
		if (mutationObserver) {
			mutationObserver.disconnect();
			this.mutationObservers.delete(webEmbedControlId);
		}

		// Remove scroll listener
		const scrollListener = this.scrollListeners.get(webEmbedControlId);
		if (scrollListener) {
			window.removeEventListener('scroll', scrollListener, true);
			this.scrollListeners.delete(webEmbedControlId);
		}

		// Remove resize listener
		const resizeListener = this.resizeListeners.get(webEmbedControlId);
		if (resizeListener) {
			window.removeEventListener('resize', resizeListener);
			this.resizeListeners.delete(webEmbedControlId);
		}

		// Remove zoom listener
		const zoomMediaQuery = this.zoomMediaQueries.get(webEmbedControlId);
		const zoomListener = this.zoomListeners.get(webEmbedControlId);
		if (zoomMediaQuery && zoomListener) {
			zoomMediaQuery.removeEventListener('change', zoomListener);
			this.zoomMediaQueries.delete(webEmbedControlId);
			this.zoomListeners.delete(webEmbedControlId);
		}

		// Clean up stored position
		this.lastPositions.delete(webEmbedControlId);
	}
}

export const webEmbedHelper: WebEmbedHelper = new WebEmbedHelper();

// @ts-ignore
globalThis.webEmbedHelper = webEmbedHelper;