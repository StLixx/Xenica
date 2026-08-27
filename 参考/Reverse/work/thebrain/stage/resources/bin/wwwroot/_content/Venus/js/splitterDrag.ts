import {safeInvoke} from "./interop.js";

type MaximizedState = 'none' | 'first' | 'second';

class SplitterDrag {
    private _isDragging: boolean = false;

    get isDragging(): boolean {
        return this._isDragging;
    }
    private containerElement: HTMLElement | null = null;
    private firstPaneElement: HTMLElement | null = null;
    private secondPaneElement: HTMLElement | null = null;
    private splitterBarElement: HTMLElement | null = null;

    private isHorizontal: boolean = true;
    private isFlipped: boolean = false;
    private barSize: number = 6;
    private minFirstPx: number = 0;
    private minSecondPx: number = 0;

    private startClientPos: number = 0;
    private startPosition: number = 50;
    private containerSize: number = 0;

    private dotNetHelper: any = null;
    private pointerId: number | null = null;
    // Locked from the first pointermove of the drag, not pointerdown — Linux/Electron
    // emits pointerdown and pointermove from separate XInput2 streams with different
    // pointerIds, so filtering subsequent moves by pointerdown's id never matches.
    // Locking from the first move works on every platform: on Win/Mac/iOS/Android the
    // first move's id equals pointerdown's id, on Linux it's the move-stream's id.
    private movePointerId: number | null = null;
    private _currentPosition: number = 50;

    // LiveResize mode
    private liveResize: boolean = true;
    private indicatorElement: HTMLElement | null = null;

    // Maximization fields
    private allowMaxFirst: boolean = false;
    private allowMaxSecond: boolean = false;
    private maximizedBorderSize: number = 4;
    private maximized: MaximizedState = 'none';
    private savedPosition: number = 50;
    private jumpedFromClientPos: number = 0;
    private dragStartMaximized: MaximizedState = 'none';

    // Animation
    private animationDurationMs: number = 250;

    // Transparent bar mode
    private transparentBar: boolean = false;

    // Bump stop visual feedback
    private bumpStopOverlay: HTMLElement | null = null;
    private bumpStopArrow: HTMLElement | null = null;
    private currentBumpStopProgress: number = 0;
    private bumpStopTargetPane: 'first' | 'second' | null = null;

    startDrag(
        dotNetHelper: any,
        containerElement: HTMLElement,
        firstPaneElement: HTMLElement,
        secondPaneElement: HTMLElement,
        splitterBarElement: HTMLElement,
        pointerId: number,
        clientX: number,
        clientY: number,
        isHorizontal: boolean,
        isFlipped: boolean,
        position: number,
        barSize: number,
        minFirstPx: number,
        minSecondPx: number,
        allowMaxFirst: boolean,
        allowMaxSecond: boolean,
        maximizedBorderSize: number,
        maximized: MaximizedState,
        liveResize: boolean,
        indicatorElement: HTMLElement | null,
        animationDurationMs: number,
        transparentBar: boolean
    ) {
        this.dotNetHelper = dotNetHelper;
        this.containerElement = containerElement;
        this.firstPaneElement = firstPaneElement;
        this.secondPaneElement = secondPaneElement;
        this.splitterBarElement = splitterBarElement;
        this.pointerId = pointerId;
        this.movePointerId = null;

        this.isHorizontal = isHorizontal;
        this.isFlipped = isFlipped;
        this.barSize = barSize;
        this.minFirstPx = minFirstPx;
        this.minSecondPx = minSecondPx;
        this.startPosition = position;
        this._currentPosition = position;
        this.savedPosition = position;

        // Maximization parameters
        this.allowMaxFirst = allowMaxFirst;
        this.allowMaxSecond = allowMaxSecond;
        this.maximizedBorderSize = maximizedBorderSize;
        this.maximized = maximized;
        this.dragStartMaximized = maximized;
        this.jumpedFromClientPos = 0;

        // LiveResize mode
        this.liveResize = liveResize;
        this.indicatorElement = indicatorElement;

        // Animation
        this.animationDurationMs = animationDurationMs;

        // Transparent bar mode
        this.transparentBar = transparentBar;

        this.startClientPos = isHorizontal ? clientX : clientY;
        this.containerSize = isHorizontal
            ? containerElement.clientWidth
            : containerElement.clientHeight;

        this._isDragging = true;

        // Remove transitions during drag
        this.firstPaneElement.style.transition = '';
        this.secondPaneElement.style.transition = '';

        // Capture pointer
        splitterBarElement.setPointerCapture(pointerId);

        // Add window-level event listeners
        window.addEventListener('pointermove', this.onPointerMove);
        window.addEventListener('pointerup', this.onPointerUp);
        window.addEventListener('pointercancel', this.onPointerUp);

        // For non-live resize mode, set indicator initial position
        // Note: Blazor controls visibility via class, JS only updates position
        if(!this.liveResize && this.indicatorElement) {
            this.applyIndicatorPosition(position);
        }

        // Reset bump stop state
        this.currentBumpStopProgress = 0;
        this.bumpStopTargetPane = null;
        this.clearBumpStopFeedback();
    }

    private onPointerMove = (e: PointerEvent) => {
        if(!this.isDragging) return;

        // Lock onto the first pointermove's id, then filter subsequent moves by it.
        // See movePointerId field comment for the Linux pointerdown/pointermove
        // pointerId mismatch this works around.
        if(this.movePointerId === null) {
            this.movePointerId = e.pointerId;
        } else if(e.pointerId !== this.movePointerId) {
            return;
        }

        // Failsafe: if no buttons are pressed, end the drag
        // This catches cases where pointerup was missed (e.g., during double-click)
        if(e.buttons === 0) {
            this.endDrag();
            return;
        }

        const currentPos = this.isHorizontal ? e.clientX : e.clientY;
        const deltaPx = currentPos - this.startClientPos;
        let deltaPercent = (this.containerSize > 0) ? (deltaPx / this.containerSize) * 100 : 0;

        if(this.isFlipped) {
            deltaPercent = -deltaPercent;
        }

        let rawNewPosition = this.startPosition + deltaPercent;

        // Calculate min percentages
        const minFirstPercent = (this.containerSize > 0) ? (this.minFirstPx / this.containerSize) * 100 : 0;
        const minSecondPercent = (this.containerSize > 0) ? (this.minSecondPx / this.containerSize) * 100 : 0;

        // Handle being in maximized state during drag
        if(this.maximized !== 'none' && (this.allowMaxFirst || this.allowMaxSecond)) {
            // Calculate jump zone boundaries using fixed 32px threshold
            const fixedJumpThresholdPx = 32;
            const jumpZoneFirstPercent = (this.minFirstPx > 0)
                ? (fixedJumpThresholdPx / this.containerSize) * 100
                : 0;
            const jumpZoneSecondPercent = (this.minSecondPx > 0)
                ? 100 - (fixedJumpThresholdPx / this.containerSize) * 100
                : 100;

            // Restore when rawNewPosition crosses back over the jump zone boundary
            // This makes restore symmetric with maximize: same threshold in both directions
            const shouldRestore =
                (this.maximized === 'second' && rawNewPosition >= jumpZoneFirstPercent) ||
                (this.maximized === 'first' && rawNewPosition <= jumpZoneSecondPercent);

            if(shouldRestore) {
                // Clamp position to valid range (will snap to minimum)
                const newPos = Math.max(minFirstPercent, Math.min(100 - minSecondPercent, rawNewPosition));

                // Restore from maximized - animate the expansion
                this.maximized = 'none';
                this.dragStartMaximized = 'none';
                this._currentPosition = newPos;

                // Animate restore with a smooth transition
                this.animateRestore(newPos);
                return;
            } else {
                // Still in maximized state, don't move
                return;
            }
        }

        // Jump-to-maximize logic (when dragging toward edge with AllowMaximize and minimums set)
        if((this.allowMaxFirst || this.allowMaxSecond) && this.maximized === 'none' && (this.minFirstPx > 0 || this.minSecondPx > 0)) {
            // Use fixed 32px threshold for jumping to maximize
            const fixedJumpThresholdPx = 32;
            const jumpZoneFirstPercent = (this.minFirstPx > 0)
                ? (fixedJumpThresholdPx / this.containerSize) * 100
                : 0;
            const jumpZoneSecondPercent = (this.minSecondPx > 0)
                ? 100 - (fixedJumpThresholdPx / this.containerSize) * 100
                : 100;

            // Calculate bump stop progress for visual feedback
            // Progress goes from 0 (at minimum) to 1 (at snap threshold)
            const bumpStopZonePx = fixedJumpThresholdPx - this.minFirstPx;
            const bumpStopZoneSecondPx = fixedJumpThresholdPx - this.minSecondPx;

            // Check if we're in the bump stop zone approaching first pane collapse
            if(this.allowMaxSecond && this.minFirstPx > 0 && rawNewPosition <= minFirstPercent) {
                const distanceIntoZone = minFirstPercent - rawNewPosition;
                const zoneSize = minFirstPercent - jumpZoneFirstPercent;
                const progress = zoneSize > 0 ? Math.min(1, distanceIntoZone / zoneSize) : 0;

                this.updateBumpStopFeedback(progress, 'first');

                // Check if we've crossed the snap threshold
                if(rawNewPosition < jumpZoneFirstPercent) {
                    // Clear feedback immediately before snap
                    this.clearBumpStopFeedback();

                    // Jump to maximize second (first pane collapses)
                    this.savedPosition = this._currentPosition;
                    this.jumpedFromClientPos = currentPos;
                    this.maximized = 'second';

                    // Apply maximized visual state with smooth animation
                    this.animateCollapse('second');
                    return;
                }

                // At bump stop - don't move further but show feedback
                if(this.liveResize) {
                    this.applyPosition(minFirstPercent);
                } else {
                    this.applyIndicatorPosition(minFirstPercent);
                }
                return;
            }

            // Check if we're in the bump stop zone approaching second pane collapse
            if(this.allowMaxFirst && this.minSecondPx > 0 && rawNewPosition >= (100 - minSecondPercent)) {
                const distanceIntoZone = rawNewPosition - (100 - minSecondPercent);
                const zoneSize = jumpZoneSecondPercent - (100 - minSecondPercent);
                const progress = zoneSize > 0 ? Math.min(1, distanceIntoZone / Math.abs(zoneSize)) : 0;

                this.updateBumpStopFeedback(progress, 'second');

                // Check if we've crossed the snap threshold
                if(rawNewPosition > jumpZoneSecondPercent) {
                    // Clear feedback immediately before snap
                    this.clearBumpStopFeedback();

                    // Jump to maximize first (second pane collapses)
                    this.savedPosition = this._currentPosition;
                    this.jumpedFromClientPos = currentPos;
                    this.maximized = 'first';

                    // Apply maximized visual state with smooth animation
                    this.animateCollapse('first');
                    return;
                }

                // At bump stop - don't move further but show feedback
                if(this.liveResize) {
                    this.applyPosition(100 - minSecondPercent);
                } else {
                    this.applyIndicatorPosition(100 - minSecondPercent);
                }
                return;
            }

            // Not in bump stop zone - clear any feedback
            if(this.currentBumpStopProgress > 0) {
                this.clearBumpStopFeedback();
            }
        }

        // Clamp position
        const newPosition = Math.max(minFirstPercent, Math.min(100 - minSecondPercent, rawNewPosition));

        // Apply to DOM directly
        if(this.liveResize) {
            this.applyPosition(newPosition);
        } else {
            this.applyIndicatorPosition(newPosition);
        }
    };

    private onPointerUp = (e: PointerEvent) => {
        if(!this.isDragging) return;

        // pointerup uses pointerdown's id on every platform we ship to (verified on
        // Linux too — only pointermove uses the separate stream id). Strict matching
        // here preserves multi-touch correctness: a different finger lifting won't
        // end this drag.
        if(e.pointerId !== this.pointerId && e.pointerId !== this.movePointerId) return;

        this.endDrag();
    };

    private applyPosition(position: number) {
        if(!this.firstPaneElement || !this.secondPaneElement) return;

        const visualPosition = this.isFlipped ? 100 - position : position;
        const firstSize = visualPosition;
        const secondSize = 100 - visualPosition;

        // TransparentBar: no offset needed since bar overlaps panes via negative margins
        const firstBarOffset = this.transparentBar ? 0 : (visualPosition / 100) * this.barSize;
        const secondBarOffset = this.transparentBar ? 0 : ((100 - visualPosition) / 100) * this.barSize;

        this.firstPaneElement.style.flex = `0 0 calc(${firstSize}% - ${firstBarOffset}px)`;
        this.secondPaneElement.style.flex = `0 0 calc(${secondSize}% - ${secondBarOffset}px)`;

        // Store current position for final callback
        this._currentPosition = position;
    }

    private applyIndicatorPosition(position: number) {
        if(!this.indicatorElement) return;

        const visualPosition = this.isFlipped ? 100 - position : position;
        if(this.isHorizontal) {
            this.indicatorElement.style.left = `${visualPosition}%`;
            this.indicatorElement.style.top = '0';
            this.indicatorElement.style.bottom = '0';
            this.indicatorElement.style.width = '2px';
            this.indicatorElement.style.height = '';
            this.indicatorElement.style.transform = 'translateX(-50%)';
        } else {
            this.indicatorElement.style.top = `${visualPosition}%`;
            this.indicatorElement.style.left = '0';
            this.indicatorElement.style.right = '0';
            this.indicatorElement.style.height = '2px';
            this.indicatorElement.style.width = '';
            this.indicatorElement.style.transform = 'translateY(-50%)';
        }
        this._currentPosition = position;
    }

    private applyMaximized(pane: 'first' | 'second') {
        if(!this.firstPaneElement || !this.secondPaneElement) return;

        // When maximized, one pane is 100% - border, the other is 0%
        // Account for flip: First content goes in first div when not flipped, second div when flipped
        const firstMaximized = this.isFlipped ? pane === 'second' : pane === 'first';

        if(firstMaximized) {
            this.firstPaneElement.style.flex = `0 0 calc(100% - ${this.maximizedBorderSize}px)`;
            this.secondPaneElement.style.flex = `0 0 0%`;
        } else {
            this.firstPaneElement.style.flex = `0 0 0%`;
            this.secondPaneElement.style.flex = `0 0 calc(100% - ${this.maximizedBorderSize}px)`;
        }
    }

    /**
     * Updates visual feedback when in the bump stop zone.
     * Progress goes from 0 (just hit minimum) to 1 (about to snap).
     */
    private updateBumpStopFeedback(progress: number, targetPane: 'first' | 'second') {
        this.currentBumpStopProgress = progress;
        this.bumpStopTargetPane = targetPane;

        if(!this.splitterBarElement || !this.containerElement) return;

        // Get the pane that will collapse
        const collapsingPane = targetPane === 'first'
            ? (this.isFlipped ? this.secondPaneElement : this.firstPaneElement)
            : (this.isFlipped ? this.firstPaneElement : this.secondPaneElement);

        if(!collapsingPane) return;

        // Eased progress for smoother feel (ease-in curve for building tension)
        const easedProgress = progress * progress;

        // Disable transition for immediate feedback
        this.splitterBarElement.style.transition = 'none';

        // 1. Subtle splitter bar glow - soft and understated
        const glowIntensity = 4 + (easedProgress * 8); // 4px to 12px
        const glowOpacity = 0.2 + (easedProgress * 0.3); // 0.2 to 0.5
        this.splitterBarElement.style.boxShadow =
            `0 0 ${glowIntensity}px rgb(var(--vapp-accent-warning) / ${glowOpacity})`;

        // 2. Splitter bar background - gentle color shift
        // Use setProperty with !important to override Tailwind classes
        const bgOpacity = 0.4 + (easedProgress * 0.4); // 0.4 to 0.8
        this.splitterBarElement.style.setProperty(
            'background-color',
            `rgb(var(--vapp-accent-warning) / ${bgOpacity})`,
            'important'
        );

        // 4. Create or update overlay on collapsing pane
        if(!this.bumpStopOverlay) {
            this.bumpStopOverlay = document.createElement('div');
            this.bumpStopOverlay.className = 'splitter-collapse-overlay';
            this.bumpStopOverlay.style.cssText = `
                position: absolute;
                inset: 0;
                pointer-events: none;
                z-index: 15;
            `;
            collapsingPane.style.position = 'relative';
            collapsingPane.appendChild(this.bumpStopOverlay);
        }

        // Gradient overlay that intensifies - subtle vignette effect from the collapsing edge
        const gradientDir = this.isHorizontal
            ? (targetPane === 'first' ? 'to right' : 'to left')
            : (targetPane === 'first' ? 'to bottom' : 'to top');

        const overlayOpacity = easedProgress * 0.4;
        this.bumpStopOverlay.style.background =
            `linear-gradient(${gradientDir}, rgb(var(--vapp-accent-warning) / ${overlayOpacity}) 0%, transparent 70%)`;

        // 5. Arrow indicator showing collapse direction
        if(!this.bumpStopArrow) {
            this.bumpStopArrow = document.createElement('div');
            this.bumpStopArrow.className = 'splitter-collapse-arrow';
            this.bumpStopArrow.innerHTML = this.getArrowSvg(targetPane);
            collapsingPane.appendChild(this.bumpStopArrow);
        }

        // Position arrow in the last third of the collapsing panel, centered
        const arrowOpacity = 0.3 + (easedProgress * 0.6); // 0.3 to 0.9
        const arrowSize = 48 + (easedProgress * 16); // 48px to 64px

        const positionPercent = targetPane === 'first' ? '16%' : '84%';
        const positionProp = this.isHorizontal ? 'left' : 'top';
        const centerProp = this.isHorizontal ? 'top' : 'left';

        this.bumpStopArrow.style.cssText = `
            position: absolute;
            ${positionProp}: ${positionPercent};
            ${centerProp}: 50%;
            transform: translate(-50%, -50%);
            width: ${arrowSize}px;
            height: ${arrowSize}px;
            opacity: ${arrowOpacity};
            pointer-events: none;
            z-index: 16;
            border-radius: 50%;
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            color: rgb(var(--vapp-accent-warning));
            filter: drop-shadow(0 2px 8px rgb(0 0 0 / 0.25));
        `;
    }

    /**
     * Gets the SVG with colored circle and arrow as transparent cutout.
     * Uses SVG mask to punch the arrow shape out of the circle.
     */
    private getArrowSvg(targetPane: 'first' | 'second'): string {
        // Arrow pointing toward the collapse edge
        let rotation = 0;
        if(this.isHorizontal) {
            rotation = targetPane === 'first' ? 180 : 0; // Left or Right
        } else {
            rotation = targetPane === 'first' ? 270 : 90; // Up or Down
        }

        // SVG with mask: the arrow is cut out of the colored circle
        // Uses currentColor to inherit from parent's CSS color property
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%">
            <defs>
                <mask id="arrow-cutout">
                    <circle cx="50" cy="50" r="50" fill="white"/>
                    <g transform="rotate(${rotation} 50 50)">
                        <line x1="26" y1="50" x2="60" y2="50" stroke="black" stroke-width="11" stroke-linecap="round"/>
                        <polyline points="48,34 66,50 48,66" stroke="black" stroke-width="11" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
                    </g>
                </mask>
            </defs>
            <circle cx="50" cy="50" r="50" fill="currentColor" mask="url(#arrow-cutout)"/>
        </svg>`;
    }

    /**
     * Clears all bump stop visual feedback.
     */
    private clearBumpStopFeedback() {
        this.currentBumpStopProgress = 0;
        this.bumpStopTargetPane = null;

        if(this.splitterBarElement) {
            this.splitterBarElement.style.transition = '';
            this.splitterBarElement.style.boxShadow = '';
            this.splitterBarElement.style.removeProperty('background-color');
        }

        if(this.bumpStopOverlay) {
            this.bumpStopOverlay.remove();
            this.bumpStopOverlay = null;
        }

        if(this.bumpStopArrow) {
            this.bumpStopArrow.remove();
            this.bumpStopArrow = null;
        }
    }

    /**
     * Animates the collapse when snapping to maximized state.
     * Provides a quick, deliberate transition - just enough to feel intentional.
     */
    private animateCollapse(maximizedPane: 'first' | 'second') {
        if(!this.firstPaneElement || !this.secondPaneElement) return;

        const duration = 50; // ms - very quick, just a hint of easing
        const easing = 'cubic-bezier(0.2, 0, 0.4, 1)'; // quick ease-out

        // Enable transitions temporarily
        this.firstPaneElement.style.transition = `flex ${duration}ms ${easing}`;
        this.secondPaneElement.style.transition = `flex ${duration}ms ${easing}`;

        // Apply the maximized state
        this.applyMaximized(maximizedPane);

        // Clear transitions after animation completes
        setTimeout(() => {
            if(this.firstPaneElement) this.firstPaneElement.style.transition = '';
            if(this.secondPaneElement) this.secondPaneElement.style.transition = '';
        }, duration);
    }

    /**
     * Animates restore from maximized state.
     * Quick expansion to match the collapse feel.
     */
    private animateRestore(targetPosition: number) {
        if(!this.firstPaneElement || !this.secondPaneElement) return;

        const duration = 60; // ms - quick restore
        const easing = 'cubic-bezier(0.2, 0, 0.4, 1)'; // quick ease-out

        // Enable transitions temporarily
        this.firstPaneElement.style.transition = `flex ${duration}ms ${easing}`;
        this.secondPaneElement.style.transition = `flex ${duration}ms ${easing}`;

        // Apply the position
        this.applyPosition(targetPosition);

        // Clear transitions after animation completes
        setTimeout(() => {
            if(this.firstPaneElement) this.firstPaneElement.style.transition = '';
            if(this.secondPaneElement) this.secondPaneElement.style.transition = '';
        }, duration);
    }

    private endDrag() {
        if(!this._isDragging) return;

        this._isDragging = false;

        // Clear any bump stop visual feedback
        this.clearBumpStopFeedback();

        // Immediately sync position to splitterStates so ResizeObserver has current data
        // This avoids race condition where resize fires before C# round-trip completes
        if(this.containerElement) {
            const state = splitterStates.get(this.containerElement);
            if(state) {
                // Check if we ended at minimum and set/clear the locked flags
                const tolerancePercent = 0.5;
                const minFirstPercent = this.containerSize > 0 ? (this.minFirstPx / this.containerSize) * 100 : 0;
                const minSecondPercent = this.containerSize > 0 ? (this.minSecondPx / this.containerSize) * 100 : 0;

                const isFirstAtMin = this.minFirstPx > 0 && this._currentPosition <= minFirstPercent + tolerancePercent;
                const isSecondAtMin = this.minSecondPx > 0 && (100 - this._currentPosition) <= minSecondPercent + tolerancePercent;

                state.position = this._currentPosition;
                state.maximized = this.maximized;
                state.isFirstLockedToMin = isFirstAtMin;
                state.isSecondLockedToMin = isSecondAtMin;
            }
        }

        // Remove event listeners
        window.removeEventListener('pointermove', this.onPointerMove);
        window.removeEventListener('pointerup', this.onPointerUp);
        window.removeEventListener('pointercancel', this.onPointerUp);

        // Release pointer capture
        if(this.splitterBarElement && this.pointerId !== null) {
            try {
                this.splitterBarElement.releasePointerCapture(this.pointerId);
            } catch {}
        }

        // Note: Blazor controls indicator visibility via class based on _isDragging state

        // Restore transitions
        if(this.firstPaneElement) {
            this.firstPaneElement.style.transition = `flex ${this.animationDurationMs}ms ease-out`;
        }
        if(this.secondPaneElement) {
            this.secondPaneElement.style.transition = `flex ${this.animationDurationMs}ms ease-out`;
        }

        // Call back to C# with final position and maximized state
        safeInvoke(this.dotNetHelper, 'OnDragEndFromJs', [this._currentPosition, this.maximized]);

        this.dotNetHelper = null;
        this.pointerId = null;
        this.movePointerId = null;
    }

    cancelDrag() {
        if(this._isDragging) {
            this.endDrag();
        }
    }
}

const splitterDrag = new SplitterDrag();

// Track transparent bar hover handlers for cleanup
const transparentBarHandlers = new WeakMap<HTMLElement, { enter: () => void, leave: () => void }>();

// ResizeObserver storage for splitter component
const resizeObservers: Map<HTMLElement, ResizeObserver> = new Map();

// Splitter auto-orientation and resize state storage
type SplitterState = {
	isAutoMode: boolean;
	effectiveOrientation: 'horizontal' | 'vertical';
	threshold: number;
	position: number;
	minFirstSizePx: number;
	minSecondSizePx: number;
	barSize: number;
	transparentBar: boolean;
	flip: boolean;
	maximized: 'none' | 'first' | 'second';
	firstPane: HTMLElement;
	secondPane: HTMLElement;
	splitterBar: HTMLElement;
	dotNetRef: any;
	// Track if panes are locked to minimum size (set by drag, cleared when dragged away)
	isFirstLockedToMin: boolean;
	isSecondLockedToMin: boolean;
	orientationChangedMethod: string;
	positionChangedMethod: string;
	lastContainerSize: number;  // Track previous size for at-minimum detection
	// Debounce timer for .NET callbacks during rapid resize
	resizeDebounceTimer: number | null;
	// Pending .NET callback data (to send after debounce)
	pendingOrientationChange: number | null;  // 0 = horizontal, 1 = vertical
	pendingPositionChange: number | null;
};
const splitterStates: Map<HTMLElement, SplitterState> = new Map();

/**
 * Stops observing an element for resize events.
 */
function unobserveResize(element: HTMLElement): void {
	if(!element) return;

	const observer = resizeObservers.get(element);
	if(observer) {
		observer.disconnect();
		resizeObservers.delete(element);
	}

	// Clean up debounce timer and splitter state
	const state = splitterStates.get(element);
	if(state?.resizeDebounceTimer) {
		clearTimeout(state.resizeDebounceTimer);
	}
	splitterStates.delete(element);
}

// Debounce delay for .NET callbacks during resize (ms)
const RESIZE_DEBOUNCE_MS = 100;

/**
 * Flushes any pending .NET callbacks for a splitter state.
 * Called after debounce timer expires.
 */
function flushPendingCallbacks(state: SplitterState): void {
	if(state.pendingOrientationChange !== null) {
		safeInvoke(state.dotNetRef, state.orientationChangedMethod, [state.pendingOrientationChange]);
		state.pendingOrientationChange = null;
	}
	if(state.pendingPositionChange !== null) {
		safeInvoke(state.dotNetRef, state.positionChangedMethod, [state.pendingPositionChange]);
		state.pendingPositionChange = null;
	}
	state.resizeDebounceTimer = null;
}

/**
 * Schedules a debounced .NET callback for orientation or position changes.
 * DOM updates are applied immediately; .NET is notified after debounce.
 */
function scheduleCallback(state: SplitterState): void {
	if(state.resizeDebounceTimer !== null) {
		clearTimeout(state.resizeDebounceTimer);
	}
	state.resizeDebounceTimer = window.setTimeout(() => flushPendingCallbacks(state), RESIZE_DEBOUNCE_MS);
}

/**
 * Applies orientation changes directly to the DOM for instant feedback.
 */
function applyOrientationToDOM(
	container: HTMLElement,
	splitterBar: HTMLElement,
	orientation: 'horizontal' | 'vertical'
): void {
	if(orientation === 'horizontal') {
		container.classList.remove('flex-col');
		container.classList.add('flex-row');
		splitterBar.style.cursor = 'ew-resize';
	} else {
		container.classList.remove('flex-row');
		container.classList.add('flex-col');
		splitterBar.style.cursor = 'ns-resize';
	}
}

/**
 * Applies position changes directly to the DOM for instant feedback.
 * When animated=false, disables transitions permanently (until next animated call).
 * This prevents visible "correction" animations during resize operations.
 */
function applyPositionToDOM(state: {
	effectiveOrientation: 'horizontal' | 'vertical';
	position: number;
	barSize: number;
	transparentBar: boolean;
	flip: boolean;
	firstPane: HTMLElement;
	secondPane: HTMLElement;
}, animated: boolean = false): void {
	const visualPosition = state.flip ? 100 - state.position : state.position;
	const barOffset = state.transparentBar ? 0 : (visualPosition / 100) * state.barSize;
	const secondBarOffset = state.transparentBar ? 0 : ((100 - visualPosition) / 100) * state.barSize;

	// Set transitions: explicit transition for animated, 'none' for instant updates
	const transition = animated ? 'flex 150ms ease-out' : 'none';
	state.firstPane.style.transition = transition;
	state.secondPane.style.transition = transition;

	state.firstPane.style.flex = `0 0 calc(${visualPosition}% - ${barOffset}px)`;
	state.secondPane.style.flex = `0 0 calc(${100 - visualPosition}% - ${secondBarOffset}px)`;
}

/**
 * Starts observing a splitter container for auto-orientation and minimum size constraints.
 * Handles changes directly in JS for smooth performance.
 * Only calls back to .NET when values actually change.
 */
function observeSplitterResize(
	container: HTMLElement,
	firstPane: HTMLElement,
	secondPane: HTMLElement,
	splitterBar: HTMLElement,
	isAutoMode: boolean,
	threshold: number,
	initialOrientation: string,
	position: number,
	minFirstSizePx: number,
	minSecondSizePx: number,
	barSize: number,
	transparentBar: boolean,
	flip: boolean,
	maximized: string,
	dotNetRef: any,
	orientationChangedMethod: string,
	positionChangedMethod: string
): void {
	if(!container || !dotNetRef) return;

	// Clean up any existing observer
	unobserveResize(container);

	// Get initial container size for at-minimum detection
	const rect = container.getBoundingClientRect();
	const effectiveOrientation = initialOrientation as 'horizontal' | 'vertical';
	const initialContainerSize = effectiveOrientation === 'horizontal' ? rect.width : rect.height;

	// Check if initially at minimum
	const tolerancePercent = 0.5;
	const initMinFirstPercent = initialContainerSize > 0 ? (minFirstSizePx / initialContainerSize) * 100 : 0;
	const initMinSecondPercent = initialContainerSize > 0 ? (minSecondSizePx / initialContainerSize) * 100 : 0;
	const isFirstLockedToMin = minFirstSizePx > 0 && position <= initMinFirstPercent + tolerancePercent;
	const isSecondLockedToMin = minSecondSizePx > 0 && (100 - position) <= initMinSecondPercent + tolerancePercent;

	// Store state for this container
	const state: SplitterState = {
		isAutoMode,
		effectiveOrientation,
		threshold,
		position,
		minFirstSizePx,
		minSecondSizePx,
		barSize,
		transparentBar,
		flip,
		maximized: maximized as 'none' | 'first' | 'second',
		firstPane,
		secondPane,
		splitterBar,
		dotNetRef,
		orientationChangedMethod,
		positionChangedMethod,
		lastContainerSize: initialContainerSize,
		isFirstLockedToMin,
		isSecondLockedToMin,
		resizeDebounceTimer: null,
		pendingOrientationChange: null,
		pendingPositionChange: null
	};
	splitterStates.set(container, state);

	const observer = new ResizeObserver((entries) => {
		for(const entry of entries) {
			const width = entry.contentRect.width;
			const height = entry.contentRect.height;

			// Track if orientation changed (to skip at-minimum detection)
			let orientationChanged = false;

			// Handle auto-orientation
			if(state.isAutoMode) {
				let newOrientation: 'horizontal' | 'vertical' | null = null;
				if(width - height > state.threshold) {
					newOrientation = 'horizontal';
				} else if(height - width > state.threshold) {
					newOrientation = 'vertical';
				}

				if(newOrientation && newOrientation !== state.effectiveOrientation) {
					state.effectiveOrientation = newOrientation;
					orientationChanged = true;

					// Apply DOM changes directly for instant feedback
					applyOrientationToDOM(container, splitterBar, newOrientation);

					// Queue .NET notification (debounced to avoid flooding during rapid resize)
					state.pendingOrientationChange = newOrientation === 'horizontal' ? 0 : 1;
					scheduleCallback(state);
				}
			}

			// Handle minimum size constraints - but skip when maximized
			if((state.minFirstSizePx > 0 || state.minSecondSizePx > 0) && state.maximized === 'none') {
				const containerSize = state.effectiveOrientation === 'horizontal' ? width : height;
				if(containerSize > 0) {
					const minFirstPercent = (state.minFirstSizePx / containerSize) * 100;
					const minSecondPercent = (state.minSecondSizePx / containerSize) * 100;

					let newPosition = state.position;

					// Use explicit locked-to-min flags instead of detecting at-minimum
					// These flags are set by drag end and cleared when dragged away from minimum
					if(!orientationChanged) {
						if(state.isFirstLockedToMin && !state.isSecondLockedToMin) {
							// Keep first pane at its minimum pixel size
							newPosition = (state.minFirstSizePx / containerSize) * 100;
						} else if(state.isSecondLockedToMin && !state.isFirstLockedToMin) {
							// Keep second pane at its minimum pixel size
							newPosition = 100 - (state.minSecondSizePx / containerSize) * 100;
						}
						// If both locked (shouldn't happen normally), fall through to clamping
					}

					// Clamp to valid range
					newPosition = Math.max(minFirstPercent, Math.min(100 - minSecondPercent, newPosition));

					if(Math.abs(newPosition - state.position) > 0.01) {
						state.position = newPosition;

						// Apply position directly to DOM
						applyPositionToDOM(state, false);

						// Queue .NET notification (debounced to avoid flooding during rapid resize)
						state.pendingPositionChange = newPosition;
						scheduleCallback(state);
					}

					// Update last container size for next resize
					state.lastContainerSize = containerSize;
				}
			} else {
				// Still track container size even when no constraints or maximized
				const containerSize = state.effectiveOrientation === 'horizontal' ? width : height;
				if(containerSize > 0) {
					state.lastContainerSize = containerSize;
				}
			}
		}
	});

	observer.observe(container);
	resizeObservers.set(container, observer);

	// Apply initial orientation if auto mode
	if(isAutoMode) {
		applyOrientationToDOM(container, splitterBar, state.effectiveOrientation);
	}
}

/**
 * Applies maximized state directly to the DOM.
 */
function applyMaximizedToDOM(state: {
	flip: boolean;
	firstPane: HTMLElement;
	secondPane: HTMLElement;
}, pane: 'first' | 'second', animated: boolean = false): void {
	// When maximized, one pane is 100%, the other is 0%
	// Account for flip: First content goes in first div when not flipped, second div when flipped
	const firstMaximized = state.flip ? pane === 'second' : pane === 'first';

	// Set transitions: explicit transition for animated, 'none' for instant updates
	const transition = animated ? 'flex 150ms ease-out' : 'none';
	state.firstPane.style.transition = transition;
	state.secondPane.style.transition = transition;

	if(firstMaximized) {
		state.firstPane.style.flex = '0 0 100%';
		state.secondPane.style.flex = '0 0 0%';
	} else {
		state.firstPane.style.flex = '0 0 0%';
		state.secondPane.style.flex = '0 0 100%';
	}
}

/**
 * Updates splitter state when parameters change from .NET.
 * @param targetOrientation The target orientation when switching out of auto mode ('horizontal' or 'vertical')
 * @param forcePosition When true, applies the position even if locked to minimum (e.g., when switching navigation modes)
 */
function updateSplitterState(
	container: HTMLElement,
	isAutoMode: boolean,
	position: number,
	minFirstSizePx: number,
	minSecondSizePx: number,
	flip: boolean,
	maximized: string,
	targetOrientation?: string,
	forcePosition?: boolean
): void {
	const state = splitterStates.get(container);
	if(!state) return;

	const previousMaximized = state.maximized;  // Track which pane was maximized
	const wasMaximized = previousMaximized !== 'none';
	const nextMaximized = maximized as 'none' | 'first' | 'second';
	const wasAutoMode = state.isAutoMode;
	state.isAutoMode = isAutoMode;
	state.maximized = nextMaximized;

	// Handle position updates when locked to minimum (but not when maximized)
	if((state.isFirstLockedToMin || state.isSecondLockedToMin) && nextMaximized === 'none') {
		if(forcePosition) {
			// Explicit unlock requested (e.g., navigation mode switch)
			state.isFirstLockedToMin = false;
			state.isSecondLockedToMin = false;
			state.position = position;
		} else {
			// Keep locked - re-apply the locked position to DOM to counteract Blazor's render
			const rect = container.getBoundingClientRect();
			const containerSize = state.effectiveOrientation === 'horizontal' ? rect.width : rect.height;
			if(containerSize > 0) {
				let lockedPosition: number;
				if(state.isFirstLockedToMin) {
					lockedPosition = (state.minFirstSizePx / containerSize) * 100;
				} else {
					lockedPosition = 100 - (state.minSecondSizePx / containerSize) * 100;
				}
				state.position = lockedPosition;
				applyPositionToDOM(state, false);
			}
		}
	} else {
		state.position = position;
	}
	state.minFirstSizePx = minFirstSizePx;
	state.minSecondSizePx = minSecondSizePx;
	state.flip = flip;

	// When transitioning TO a maximized state, animate from current position to maximized.
	// Let Blazor-driven flex changes animate via pane transitions.
	// Avoid JS reapplying positions during maximize/restore to prevent animation fighting.
	if(wasMaximized && state.maximized === 'none') {
		// Clamp restored position to minimums if container size changed while maximized.
		let targetPosition = state.position;
		if(state.minFirstSizePx > 0 || state.minSecondSizePx > 0) {
			const rect = container.getBoundingClientRect();
			const containerSize = state.effectiveOrientation === 'horizontal' ? rect.width : rect.height;
			if(containerSize > 0) {
				const minFirstPercent = (state.minFirstSizePx / containerSize) * 100;
				const minSecondPercent = (state.minSecondSizePx / containerSize) * 100;
				targetPosition = Math.max(minFirstPercent,
					Math.min(100 - minSecondPercent, state.position));

				if(Math.abs(targetPosition - state.position) > 0.01) {
					state.position = targetPosition;
					safeInvoke(state.dotNetRef, state.positionChangedMethod, [targetPosition]);
				}
			}
		}

		// Animate restore (show) by starting from maximized state, then transitioning to position.
		applyMaximizedToDOM(state, previousMaximized, false);
		state.firstPane.offsetHeight;
		state.secondPane.offsetHeight;
		requestAnimationFrame(() => {
			applyPositionToDOM(state, true);
		});
	}

	// If switching to auto mode, trigger an immediate evaluation
	if(isAutoMode && !wasAutoMode) {
		const rect = container.getBoundingClientRect();
		let newOrientation: 'horizontal' | 'vertical' | null = null;
		if(rect.width - rect.height > state.threshold) {
			newOrientation = 'horizontal';
		} else if(rect.height - rect.width > state.threshold) {
			newOrientation = 'vertical';
		}

		if(newOrientation && newOrientation !== state.effectiveOrientation) {
			state.effectiveOrientation = newOrientation;
			applyOrientationToDOM(container, state.splitterBar, newOrientation);
			safeInvoke(state.dotNetRef, state.orientationChangedMethod, [newOrientation === 'horizontal' ? 0 : 1]);
		}
	}
	// For non-auto mode, always sync effective orientation with target
	// This handles both switching out of auto mode AND switching between horizontal/vertical
	else if(!isAutoMode && targetOrientation) {
		const orientation = targetOrientation as 'horizontal' | 'vertical';
		if(orientation !== state.effectiveOrientation) {
			state.effectiveOrientation = orientation;
			// Don't apply to DOM here - Blazor will handle the DOM update
			// Just update state so ResizeObserver doesn't fight with Blazor
		}
	}
}

export const SplitterDragModule = {
    startDrag: (
        dotNetHelper: any,
        container: HTMLElement,
        firstPane: HTMLElement,
        secondPane: HTMLElement,
        splitterBar: HTMLElement,
        pointerId: number,
        clientX: number,
        clientY: number,
        isHorizontal: boolean,
        isFlipped: boolean,
        position: number,
        barSize: number,
        minFirstPx: number,
        minSecondPx: number,
        allowMaxFirst: boolean,
        allowMaxSecond: boolean,
        maximizedBorderSize: number,
        maximized: MaximizedState,
        liveResize: boolean,
        indicatorElement: HTMLElement | null,
        animationDurationMs: number,
        transparentBar: boolean
    ) => {
        splitterDrag.startDrag(
            dotNetHelper, container, firstPane, secondPane, splitterBar,
            pointerId, clientX, clientY, isHorizontal, isFlipped,
            position, barSize, minFirstPx, minSecondPx,
            allowMaxFirst, allowMaxSecond, maximizedBorderSize, maximized,
            liveResize, indicatorElement, animationDurationMs, transparentBar
        );
    },
    cancelDrag: () => {
        splitterDrag.cancelDrag();
    },
    initTransparentBar: (splitterBar: HTMLElement, hoverColor: string) => {
        // Remove any existing handlers first
        const existing = transparentBarHandlers.get(splitterBar);
        if(existing) {
            splitterBar.removeEventListener('mouseenter', existing.enter);
            splitterBar.removeEventListener('mouseleave', existing.leave);
        }

        const enterHandler = () => {
            if(!splitterDrag.isDragging) {
                splitterBar.style.backgroundColor = hoverColor;
            }
        };
        const leaveHandler = () => {
            if(!splitterDrag.isDragging) {
                splitterBar.style.backgroundColor = '';
            }
        };

        splitterBar.addEventListener('mouseenter', enterHandler);
        splitterBar.addEventListener('mouseleave', leaveHandler);

        transparentBarHandlers.set(splitterBar, { enter: enterHandler, leave: leaveHandler });
    },
    disposeTransparentBar: (splitterBar: HTMLElement) => {
        const handlers = transparentBarHandlers.get(splitterBar);
        if(handlers) {
            splitterBar.removeEventListener('mouseenter', handlers.enter);
            splitterBar.removeEventListener('mouseleave', handlers.leave);
            transparentBarHandlers.delete(splitterBar);
        }
    },
    observeSplitterResize,
    updateSplitterState,
    unobserveResize
};
