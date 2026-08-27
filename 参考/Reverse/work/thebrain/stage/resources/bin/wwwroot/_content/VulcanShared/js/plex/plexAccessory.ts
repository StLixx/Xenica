import {safeInvoke} from "../interop.js";

// Wheel deltas that reverse direction within this window are usually touch-surface
// noise (e.g. a finger resting on a Magic Mouse emits small alternating +/- deltas)
// rather than a deliberate change of scroll direction.
const WHEEL_REVERSAL_WINDOW_MS = 150;
// A rapid reversal is committed once its accumulated magnitude reaches this, so a
// deliberate flick the other way still lands within an event or two.
const WHEEL_REVERSAL_COMMIT_PX = 24;

// Filters wheel input for the horizontal accessory lists so alternating +/- noise
// doesn't make them jitter left and right. Input in the current direction, after a
// pause, or from rest passes through unchanged; only rapid opposite-sign deltas are
// held back, and they are netted against subsequent input (not dropped) so symmetric
// noise cancels to zero instead of drifting the list.
class WheelReversalFilter {
    private direction = 0;
    private lastInputTime = 0;
    private pendingReversal = 0;

    // Returns the delta to feed into the scroll accumulator; 0 when the event is
    // absorbed as probable noise.
    filter(delta: number): number {
        if(delta === 0) {
            return 0;
        }
        const now = performance.now();
        const direction = Math.sign(delta);
        const isRapid = now - this.lastInputTime <= WHEEL_REVERSAL_WINDOW_MS;
        this.lastInputTime = now;

        if(!isRapid || this.direction === 0) {
            this.direction = direction;
            this.pendingReversal = 0;
            return delta;
        }

        if(direction === this.direction) {
            // Net out any opposite blips absorbed just before this, so a +/- pair
            // sums to zero motion rather than passing only the + half.
            const effective = delta + this.pendingReversal;
            if(Math.sign(effective) === direction) {
                this.pendingReversal = 0;
                return effective;
            }
            this.pendingReversal = effective;
            return 0;
        }

        this.pendingReversal += delta;
        if(Math.abs(this.pendingReversal) < WHEEL_REVERSAL_COMMIT_PX) {
            return 0;
        }
        const committed = this.pendingReversal;
        this.direction = direction;
        this.pendingReversal = 0;
        return committed;
    }

    reset() {
        this.direction = 0;
        this.lastInputTime = 0;
        this.pendingReversal = 0;
    }
}

export class PlexAccessory {

    dotNetHelper: any | undefined;

    ptlScrollAmount: number = 0;
    ptlScrollInertia: number = 0.1;
    ptlIsScrolling: boolean = false;
    ptlScrollInterval: number | undefined;
    ptlWheelFilter: WheelReversalFilter = new WheelReversalFilter();

    pinnedThoughtsListScrollAmount: number = 0;
    pinnedThoughtsListScrollInertia: number = 0.1;
    pinnedThoughtsListIsScrolling: boolean = false;
    pinnedThoughtsListScrollInterval: number | undefined;
    pinnedThoughtsListWheelFilter: WheelReversalFilter = new WheelReversalFilter();
    pinnedThoughtsListResizeObserver: ResizeObserver | undefined;
    pinnedThoughtsListMutationObserver: MutationObserver | undefined;

    disablePresentationMode(){
        document.exitFullscreen();
    }

    // called from blazor
    public initPastThoughtsList() {
        const pastThoughtsListContainer = document.querySelector('.past-thoughts-list') as HTMLElement;
        const scrollLeftButton = document.querySelector('.past-thoughts-list-scroll-left') as HTMLButtonElement;
        const scrollRightButton = document.querySelector('.past-thoughts-list-scroll-right') as HTMLButtonElement;

        this.ptlScrollAmount = 0;
        this.ptlScrollInertia = 0.1;
        this.ptlIsScrolling = false;
        this.ptlScrollInterval = undefined;
        this.ptlWheelFilter.reset();

        if(!pastThoughtsListContainer || !scrollLeftButton || !scrollRightButton) {
            return;
        }

        pastThoughtsListContainer.addEventListener('wheel', (event: WheelEvent) => {
            event.preventDefault();
            const delta = this.ptlWheelFilter.filter(event.deltaY);
            if(delta === 0) {
                return;
            }
            this.ptlScrollAmount += delta;

            if(!this.ptlIsScrolling) {
                this.ptlIsScrolling = true;
                this.scrollPtl(pastThoughtsListContainer);
            }
        });

        const startScroll = (direction: number, shiftKey: boolean) => {
            if(shiftKey) {
                if(direction === -1) {
                    // Scroll to the start
                    this.ptlScrollAmount = -pastThoughtsListContainer.scrollWidth;
                } else {
                    // Scroll to the end
                    this.ptlScrollAmount = (pastThoughtsListContainer.scrollWidth - pastThoughtsListContainer.clientWidth - pastThoughtsListContainer.scrollLeft);
                }
                if(!this.ptlIsScrolling) {
                    this.ptlIsScrolling = true;
                    this.scrollPtl(pastThoughtsListContainer);
                }
            } else {
                this.ptlScrollAmount += 150 * direction; // Amount that each button click scrolls the PTL
                if(!this.ptlIsScrolling) {
                    this.ptlIsScrolling = true;
                    this.scrollPtl(pastThoughtsListContainer);
                }
                this.ptlScrollInterval = window.setInterval(() => {
                    this.ptlScrollAmount += 150 * direction;
                    if(!this.ptlIsScrolling) {
                        this.ptlIsScrolling = true;
                        this.scrollPtl(pastThoughtsListContainer);
                    }
                }, 100); // Adjust the interval time as needed for continuous scrolling speed
            }
        };

        const stopScroll = () => {
            if(this.ptlScrollInterval !== undefined) {
                clearInterval(this.ptlScrollInterval);
                this.ptlScrollInterval = undefined;
            }
        };

        scrollLeftButton.addEventListener('mousedown', (event) => startScroll(-1, event.shiftKey));
        scrollRightButton.addEventListener('mousedown', (event) => startScroll(1, event.shiftKey));
        document.addEventListener('mouseup', stopScroll);
        document.addEventListener('mouseleave', stopScroll);
    }

    // called from blazor
    public disposePastThoughtsList(){
        const pastThoughtsListContainer = document.querySelector('.past-thoughts-list') as HTMLElement;
        const scrollLeftButton = document.querySelector('.past-thoughts-list-scroll-left') as HTMLButtonElement;
        const scrollRightButton = document.querySelector('.past-thoughts-list-scroll-right') as HTMLButtonElement;

        this.ptlScrollAmount = 0;
        this.ptlScrollInertia = 0.1;
        this.ptlIsScrolling = false;
        if (this.ptlScrollInterval !== undefined) {
            clearInterval(this.ptlScrollInterval);
        }
        this.ptlScrollInterval = undefined;

        pastThoughtsListContainer?.removeEventListener('wheel', (event: WheelEvent) => {});

        scrollLeftButton?.removeEventListener('mousedown', (event) => {});
        scrollRightButton?.removeEventListener('mousedown', (event) => {});
    }

    private scrollPtl(container: HTMLElement) {
        if(this.ptlScrollAmount !== 0) {
            const scrollStep = this.ptlScrollAmount * this.ptlScrollInertia;
            container.scrollLeft += scrollStep;
            this.ptlScrollAmount -= scrollStep;

            if(Math.abs(this.ptlScrollAmount) < 1) {
                this.ptlScrollAmount = 0;
            }

            requestAnimationFrame(() => this.scrollPtl(container));
        } else {
            this.ptlIsScrolling = false;
        }
    }

    // called from blazor
    public initPinnedThoughtsList(dotNetHelper?: any, highlightColor: number = 0xffffff, gateSize: number = 3.5, rowHeight: number = 28) {
        this.dotNetHelper = dotNetHelper;
        const pinnedThoughtsListContainer = document.querySelector('.pinned-thoughts-list') as HTMLElement;
        const scrollLeftButton = document.querySelector('.pinned-thoughts-list-scroll-left') as HTMLButtonElement;
        const scrollRightButton = document.querySelector('.pinned-thoughts-list-scroll-right') as HTMLButtonElement;

        this.pinnedThoughtsListScrollAmount = 0;
        this.pinnedThoughtsListScrollInertia = 0.1;
        this.pinnedThoughtsListIsScrolling = false;
        this.pinnedThoughtsListScrollInterval = undefined;
        this.pinnedThoughtsListWheelFilter.reset();

        if(!pinnedThoughtsListContainer || !scrollLeftButton || !scrollRightButton) {
            return;
        }

        pinnedThoughtsListContainer.addEventListener('wheel', (event: WheelEvent) => {
            event.preventDefault();
            const delta = this.pinnedThoughtsListWheelFilter.filter(event.deltaY);
            if(delta === 0) {
                return;
            }
            this.pinnedThoughtsListScrollAmount += delta;

            if(!this.pinnedThoughtsListIsScrolling) {
                this.pinnedThoughtsListIsScrolling = true;
                this.scrollPinnedThoughtsList(pinnedThoughtsListContainer);
            }
        });

        const startPinnedThoughtsScroll = (direction: number, shiftKey: boolean) => {
            if(shiftKey) {
                if(direction === -1) {
                    // Scroll to the start
                    this.pinnedThoughtsListScrollAmount = -pinnedThoughtsListContainer.scrollWidth;
                } else {
                    // Scroll to the end
                    this.pinnedThoughtsListScrollAmount = (pinnedThoughtsListContainer.scrollWidth - pinnedThoughtsListContainer.clientWidth - pinnedThoughtsListContainer.scrollLeft);
                }
                if(!this.pinnedThoughtsListIsScrolling) {
                    this.pinnedThoughtsListIsScrolling = true;
                    this.scrollPinnedThoughtsList(pinnedThoughtsListContainer);
                }
            } else {
                this.pinnedThoughtsListScrollAmount += 150 * direction; // Amount that each button click scrolls the Pinned Thoughts List
                if(!this.pinnedThoughtsListIsScrolling) {
                    this.pinnedThoughtsListIsScrolling = true;
                    this.scrollPinnedThoughtsList(pinnedThoughtsListContainer);
                }
                this.pinnedThoughtsListScrollInterval = window.setInterval(() => {
                    this.pinnedThoughtsListScrollAmount += 150 * direction;
                    if(!this.pinnedThoughtsListIsScrolling) {
                        this.pinnedThoughtsListIsScrolling = true;
                        this.scrollPinnedThoughtsList(pinnedThoughtsListContainer);
                    }
                }, 100); // Adjust the interval time as needed for continuous scrolling speed
            }
        };

        const stopPinnedThoughtsScroll = () => {
            if(this.pinnedThoughtsListScrollInterval !== undefined) {
                clearInterval(this.pinnedThoughtsListScrollInterval);
                this.pinnedThoughtsListScrollInterval = undefined;
            }
        };

        scrollLeftButton.addEventListener('mousedown', (event) => startPinnedThoughtsScroll(-1, event.shiftKey));
        scrollRightButton.addEventListener('mousedown', (event) => startPinnedThoughtsScroll(1, event.shiftKey));
        document.addEventListener('mouseup', stopPinnedThoughtsScroll);
        document.addEventListener('mouseleave', stopPinnedThoughtsScroll);

        // Enable drag/drop reordering with autoscroll
        this.setupListDragDrop('.pinned-thoughts-list', 'x', 'ReorderPinnedThoughts', highlightColor, gateSize, rowHeight);

        // Hide scroll buttons when content fits without scrolling
        this.updatePinnedScrollButtonsVisibility();
        this.pinnedThoughtsListResizeObserver?.disconnect();
        this.pinnedThoughtsListResizeObserver = new ResizeObserver(() => {
            this.updatePinnedScrollButtonsVisibility();
        });
        this.pinnedThoughtsListResizeObserver.observe(pinnedThoughtsListContainer);

        // Watch for pins being added/removed (scrollWidth changes without container resize)
        this.pinnedThoughtsListMutationObserver?.disconnect();
        this.pinnedThoughtsListMutationObserver = new MutationObserver(() => {
            this.updatePinnedScrollButtonsVisibility();
        });
        this.pinnedThoughtsListMutationObserver.observe(pinnedThoughtsListContainer, { childList: true });
    }

    // called from blazor
    public disposePinnedThoughtsList(){
        const pinnedThoughtsListContainer = document.querySelector('.pinned-thoughts-list') as HTMLElement;
        const scrollLeftButton = document.querySelector('.pinned-thoughts-list-scroll-left') as HTMLButtonElement;
        const scrollRightButton = document.querySelector('.pinned-thoughts-list-scroll-right') as HTMLButtonElement;

        this.pinnedThoughtsListScrollAmount = 0;
        this.pinnedThoughtsListScrollInertia = 0.1;
        this.pinnedThoughtsListIsScrolling = false;
        if (this.pinnedThoughtsListScrollInterval !== undefined) {
            clearInterval(this.pinnedThoughtsListScrollInterval);
        }
        this.pinnedThoughtsListScrollInterval = undefined;

        pinnedThoughtsListContainer?.removeEventListener('wheel', (event: WheelEvent) => {});

        scrollLeftButton?.removeEventListener('mousedown', (event) => {});
        scrollRightButton?.removeEventListener('mousedown', (event) => {});

        this.pinnedThoughtsListResizeObserver?.disconnect();
        this.pinnedThoughtsListResizeObserver = undefined;
        this.pinnedThoughtsListMutationObserver?.disconnect();
        this.pinnedThoughtsListMutationObserver = undefined;
    }

    private updatePinnedScrollButtonsVisibility() {
        const container = document.querySelector('.pinned-thoughts-list') as HTMLElement;
        const scrollButtons = document.querySelector('.pinned-thoughts-list-scroll-buttons') as HTMLElement;
        if(!container || !scrollButtons) return;

        const hasOverflow = container.scrollWidth > container.clientWidth;
        scrollButtons.style.display = hasOverflow ? 'flex' : 'none';
    }

    private scrollPinnedThoughtsList(container: HTMLElement) {
        if(this.pinnedThoughtsListScrollAmount !== 0) {
            const scrollStep = this.pinnedThoughtsListScrollAmount * this.pinnedThoughtsListScrollInertia;
            container.scrollLeft += scrollStep;
            this.pinnedThoughtsListScrollAmount -= scrollStep;

            if(Math.abs(this.pinnedThoughtsListScrollAmount) < 1) {
                this.pinnedThoughtsListScrollAmount = 0;
            }

            requestAnimationFrame(() => this.scrollPinnedThoughtsList(container));
        } else {
            this.pinnedThoughtsListIsScrolling = false;
        }
    }

    // Drag & drop reordering for pinned thoughts (custom pointer/touch; avoids HTML5 drag events)
    // Drag & drop reordering for any accessory list (custom pointer/touch; avoids
    // HTML5 drag events). Listeners attach to document so the call is not coupled
    // to a specific element instance — fine if the container is created/replaced
    // by the framework after init. Idempotent: a per-(axis, callback) flag on
    // documentElement prevents duplicate registration across repeated init calls.
    public setupListDragDrop(
        containerSelector: string,
        axis: 'x' | 'y',
        callbackName: string,
        highlightColor: number,
        gateSize: number,
        rowHeight: number,
        // 'center' (default) → parent/child gates flank the row's centerline.
        // 'left'             → parent/child gates anchor at fixed offsets from the
        //                       row's LEFT edge (matches how outline-layout child
        //                       gates and selected-list gates are placed by
        //                       plexCanvas.getGateLocationFromRect).
        gateAlignment: 'center' | 'left' = 'center'
    ) {
        const flag = `listDragDropHooked_${axis}_${callbackName}`;
        if((document.documentElement.dataset as any)[flag] === '1') return;
        (document.documentElement.dataset as any)[flag] = '1';

        const isHorizontal = axis === 'x';
        // Cached container reference, refreshed in onPointerDown via getDirectChild.
        // In-flight uses (mousemove, mouseup) read this without re-resolving — the
        // container shouldn't change mid-drag. May be null at attach time if the
        // container hasn't rendered yet; getDirectChild re-resolves before any use.
        let container = document.querySelector(containerSelector) as HTMLElement;

        let draggingEl: HTMLElement | null = null;
        let dragGhost: HTMLElement | null = null;
        let dragPlaceholder: HTMLElement | null = null;
        let isPointerDown = false;
        let isDragging = false;
        let startX = 0, startY = 0;
        let startClientMain = 0; // X for horizontal, Y for vertical
        let startRect: DOMRect | null = null;
        let lastClientMain = 0;
        let autoScrollRAF: number | null = null;
        let edgeDir: number = 0; // -1 start, 1 end, 0 none
        let lastPlaceholderCenter: number | null = null;
        const DRAG_START_THRESHOLD = 6; // px

        const getDirectChild = (el: HTMLElement | null): HTMLElement | null => {
            if(!el) return null;
            // Re-resolve in case the framework replaced the element since attach.
            const live = document.querySelector(containerSelector) as HTMLElement | null;
            if(!live) return null;
            container = live;
            let cur: HTMLElement | null = el;
            while(cur && cur.parentElement !== container) {
                cur = cur.parentElement as HTMLElement | null;
            }
            return (cur && cur.parentElement === container) ? cur : null;
        };

        const toCssRgba = (num: number, alpha: number) => {
            num >>>= 0;
            const b = num & 0xFF;
            const g = (num >>> 8) & 0xFF;
            const r = (num >>> 16) & 0xFF;
            const a = Math.max(0, Math.min(1, alpha));
            return `rgba(${r},${g},${b},${a})`;
        };

        const ensurePlaceholder = (width: number, height: number) => {
            const activeOutline = highlightColor;
            const borderColor = toCssRgba(activeOutline, 1.0);
            const bgColor = toCssRgba(activeOutline, 0.15);
            if(!dragPlaceholder) {
                dragPlaceholder = document.createElement('div');
                dragPlaceholder.style.width = `${width}px`;
                dragPlaceholder.style.height = `${height}px`;
                dragPlaceholder.style.backgroundColor = `${bgColor}`;
                dragPlaceholder.style.border = `2px dashed ${borderColor}`;
                dragPlaceholder.style.borderRadius = '8px';
                dragPlaceholder.style.boxSizing = 'border-box';
                dragPlaceholder.style.flex = '0 0 auto';
            } else {
                dragPlaceholder.style.width = `${width}px`;
                dragPlaceholder.style.height = `${height}px`;
                dragPlaceholder.style.border = `2px dashed ${borderColor}`;
            }
            return dragPlaceholder;
        };

        const computeInsertion = (centerMain: number) => {
            const children = Array.from(container.children).filter(el => el !== dragPlaceholder) as HTMLElement[];
            for(let i = 0; i < children.length; i++) {
                const c = children[i];
                const cRect = c.getBoundingClientRect();
                const mid = isHorizontal
                    ? (cRect.left + cRect.width / 2)
                    : (cRect.top + cRect.height / 2);
                if(centerMain < mid) {
                    return { beforeEl: c, index: i };
                }
            }
            return { beforeEl: null as HTMLElement | null, index: children.length };
        };

        const positionPlaceholderAtCenter = (centerMain: number): boolean => {
            const ins = computeInsertion(centerMain);
            if(dragPlaceholder) {
                if(ins.beforeEl) {
                    if(dragPlaceholder !== ins.beforeEl.previousSibling) {
                        container.insertBefore(dragPlaceholder, ins.beforeEl);
                        return true;
                    }
                } else {
                    if(container.lastElementChild !== dragPlaceholder) {
                        container.appendChild(dragPlaceholder);
                        return true;
                    }
                }
            }
            return false;
        };

        const FLIP_DURATION_MS = 200;

        const flipAnimateChildren = (action: () => boolean) => {
            const currentPlaceholder = dragPlaceholder;
            const children = Array.from(container.children).filter(
                el => el !== currentPlaceholder
            ) as HTMLElement[];

            const firstRects = new Map<HTMLElement, DOMRect>();
            for (const child of children) {
                firstRects.set(child, child.getBoundingClientRect());
            }

            const didChange = action();
            if (!didChange) return;

            for (const child of children) {
                child.style.transition = 'none';
                child.style.transform = '';
            }

            for (const child of children) {
                if (!child.parentElement) continue;
                const first = firstRects.get(child);
                if (!first) continue;
                const last = child.getBoundingClientRect();
                const delta = isHorizontal ? (first.left - last.left) : (first.top - last.top);
                if (Math.abs(delta) < 1) continue;

                child.style.transform = isHorizontal ? `translateX(${delta}px)` : `translateY(${delta}px)`;
                child.offsetHeight;

                child.style.transition = `transform ${FLIP_DURATION_MS}ms ease`;
                child.style.transform = '';

                const onEnd = () => {
                    child.style.transition = '';
                    child.style.transform = '';
                    child.removeEventListener('transitionend', onEnd);
                };
                child.addEventListener('transitionend', onEnd);
                setTimeout(onEnd, FLIP_DURATION_MS + 50);
            }
        };

        const createGhost = (fromEl: HTMLElement, rect: DOMRect) => {
            const clone = fromEl.cloneNode(true) as HTMLElement;
            clone.style.position = 'fixed';
            clone.style.left = `${rect.left}px`;
            clone.style.top = `${rect.top}px`;
            clone.style.width = `${rect.width}px`;
            clone.style.height = `${rect.height}px`;
            clone.style.pointerEvents = 'none';
            clone.style.zIndex = '9999';
            clone.style.transition = 'none';
            clone.style.boxShadow = '0 6px 16px rgba(0,0,0,0.25)';
            clone.style.transform = 'scale(1.02)';
            document.body.appendChild(clone);
            return clone;
        };

        const updateGhostAndPlaceholder = (clientMain: number) => {
            if(!dragGhost || !startRect) return;
            const rect = container.getBoundingClientRect();
            if(isHorizontal) {
                const desiredLeft = startRect.left + (clientMain - startClientMain);
                const minLeft = rect.left;
                const maxLeft = rect.right - startRect.width;
                const clampedLeft = Math.max(minLeft, Math.min(maxLeft, desiredLeft));
                dragGhost.style.left = `${clampedLeft}px`;
                const centerX = desiredLeft + (startRect.width / 2);
                lastPlaceholderCenter = centerX;
                flipAnimateChildren(() => positionPlaceholderAtCenter(centerX));
            } else {
                const desiredTop = startRect.top + (clientMain - startClientMain);
                const minTop = rect.top;
                const maxTop = rect.bottom - startRect.height;
                const clampedTop = Math.max(minTop, Math.min(maxTop, desiredTop));
                dragGhost.style.top = `${clampedTop}px`;
                const centerY = desiredTop + (startRect.height / 2);
                lastPlaceholderCenter = centerY;
                flipAnimateChildren(() => positionPlaceholderAtCenter(centerY));
            }
        };

        const clearGhostAndPlaceholder = () => {
            if(dragGhost && dragGhost.parentElement) dragGhost.parentElement.removeChild(dragGhost);
            dragGhost = null;
            if(dragPlaceholder && dragPlaceholder.parentElement) dragPlaceholder.parentElement.removeChild(dragPlaceholder);
            dragPlaceholder = null;
            lastPlaceholderCenter = null;
        };

        const updateAutoScroll = () => {
            const rect = container.getBoundingClientRect();
            const extent = isHorizontal ? rect.width : rect.height;
            const startEdge = isHorizontal ? rect.left : rect.top;
            const endEdge = isHorizontal ? rect.right : rect.bottom;
            const threshold = Math.min(60, extent * 0.15);
            const maxSpeed = 24;
            let dir = 0;
            if(lastClientMain < startEdge + threshold) dir = -1;
            else if(lastClientMain > endEdge - threshold) dir = 1;
            edgeDir = dir;

            const step = () => {
                if(edgeDir === 0) { autoScrollRAF = null; return; }
                const dist = edgeDir < 0 ? (lastClientMain - startEdge) : (endEdge - lastClientMain);
                const ratio = Math.max(0, Math.min(1, (threshold - dist) / threshold));
                const delta = edgeDir * (2 + Math.floor(maxSpeed * ratio));
                if(isHorizontal) container.scrollLeft += delta;
                else container.scrollTop += delta;
                if(dragGhost) {
                    const centerMain = lastPlaceholderCenter ?? (() => {
                        const ghostRect = dragGhost!.getBoundingClientRect();
                        return isHorizontal
                            ? (ghostRect.left + ghostRect.width / 2)
                            : (ghostRect.top + ghostRect.height / 2);
                    })();
                    flipAnimateChildren(() => positionPlaceholderAtCenter(centerMain));
                }
                autoScrollRAF = requestAnimationFrame(step);
            };

            if(edgeDir !== 0 && autoScrollRAF == null) autoScrollRAF = requestAnimationFrame(step);
            if(edgeDir === 0 && autoScrollRAF != null) { cancelAnimationFrame(autoScrollRAF); autoScrollRAF = null; }
        };

        const clearAutoScroll = () => {
            edgeDir = 0;
            if(autoScrollRAF != null) { cancelAnimationFrame(autoScrollRAF); autoScrollRAF = null; }
        };

        const finalizeOrderAndNotify = () => {
            if(draggingEl && dragPlaceholder && dragPlaceholder.parentElement === container) {
                container.insertBefore(draggingEl, dragPlaceholder);
            }
            const ids: string[] = [];
            const nodes = container.querySelectorAll('[id^="tht-"]');
            nodes.forEach(n => { const id = (n as HTMLElement).id.substring(4, 40); if(id) ids.push(id); });
            safeInvoke(this.dotNetHelper, callbackName, [ids]);
        };

        let cancelNextClick = false;
        const suppressNextClick = (e: MouseEvent) => {
            if(cancelNextClick) {
                e.preventDefault();
                e.stopPropagation();
                cancelNextClick = false;
                document.removeEventListener('click', suppressNextClick, true);
            }
        };

        const pointFromEvent = (ev: MouseEvent | TouchEvent) => ('touches' in ev ? ev.touches[0] : ev as MouseEvent);

        const isOverGateForChild = (childEl: HTMLElement, clientX: number, clientY: number) => {
            // Approximate the same gate hitboxes used by plexCanvas for list reps.
            // Walk from the direct child down to the actual tht-{id} element so the
            // rect matches the visible row (the direct child can be a wider wrapper).
            let thtEl: HTMLElement | null = null;
            if(childEl.id && childEl.id.startsWith('tht-')) {
                thtEl = childEl;
            } else {
                thtEl = childEl.querySelector('[id^="tht-"]') as HTMLElement | null;
            }
            const rect = (thtEl ?? childEl).getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            // Use single-line rowHeight for the gate X offset, mirroring plexCanvas's
            // list-rep behavior. Wrapped multi-line selected rows have a tall rect
            // and would otherwise put gate hit-areas far across the row, swallowing
            // most clicks as "gate hits" and blocking drag-reorder from starting.
            const dx = rowHeight / 3.464;
            const gateSizeScaled = gateSize * 2.5;
            const jumpX = centerX - rect.width / 2;
            const jumpY = centerY;
            // Mirror plexCanvas.getGateLocationFromRect: 'left' alignment anchors
            // parent/child gates at fixed offsets from the row's LEFT edge so they
            // line up across rows of different widths.
            const parentX = gateAlignment === 'left' ? rect.left + 1.5 * dx : centerX - dx;
            const parentY = centerY - rect.height / 2;
            const childX = gateAlignment === 'left' ? rect.left + 3.5 * dx : centerX + dx;
            const childY = centerY + rect.height / 2;

            const inSquare = (gx: number, gy: number) => Math.abs(clientX - gx) <= gateSizeScaled && Math.abs(clientY - gy) <= gateSizeScaled;
            return inSquare(jumpX, jumpY) || inSquare(parentX, parentY) || inSquare(childX, childY);
        };

        const onPointerDown = (ev: MouseEvent | TouchEvent) => {
            const point = pointFromEvent(ev);
            const target = getDirectChild(ev.target as HTMLElement | null);
            if(!target) return;
            if(isOverGateForChild(target, point.clientX, point.clientY)) {
                return;
            }
            isPointerDown = true;
            draggingEl = target;
            startX = point.clientX;
            startY = point.clientY;
            startClientMain = isHorizontal ? point.clientX : point.clientY;
            startRect = target.getBoundingClientRect();
        };

        const startDragIfNeeded = (dx: number, dy: number) => {
            if(isDragging) return true;
            const main = isHorizontal ? dx : dy;
            const cross = isHorizontal ? dy : dx;
            if(Math.abs(main) > DRAG_START_THRESHOLD && Math.abs(main) > Math.abs(cross)) {
                // If a gate drag is already in progress (started on the same mousedown
                // but recognized by plexCanvas), don't start a row drag-reorder — the
                // two are mutually exclusive. Cancel our pointer-down state so endDrag
                // doesn't run cleanup either.
                if(document.body.classList.contains('plex-gate-dragging')) {
                    isPointerDown = false;
                    draggingEl = null;
                    startRect = null;
                    return false;
                }
                isDragging = true;
                cancelNextClick = true;
                document.addEventListener('click', suppressNextClick, true);
                // Mark global drag state to coordinate with Plex canvas hover logic.
                document.body.classList.add('list-reorder-dragging');
                (document.body as any).dataset.listReorderDragging = 'true';
                if(draggingEl && startRect) {
                    const ph = ensurePlaceholder(startRect.width, startRect.height);
                    const next = draggingEl.nextSibling;
                    draggingEl.parentElement?.removeChild(draggingEl);
                    if(next) container.insertBefore(ph, next as HTMLElement); else container.appendChild(ph);
                    dragGhost = createGhost(draggingEl, startRect);
                    const initialCenter = isHorizontal
                        ? startRect.left + (startRect.width / 2)
                        : startRect.top + (startRect.height / 2);
                    lastPlaceholderCenter = initialCenter;
                    positionPlaceholderAtCenter(initialCenter);
                }
                return true;
            }
            return false;
        };

        const onPointerMove = (ev: MouseEvent | TouchEvent) => {
            if(!isPointerDown) return;
            const point = 'touches' in ev ? ev.touches[0] : ev as MouseEvent;
            const dx = point.clientX - startX;
            const dy = point.clientY - startY;

            if(!isDragging) {
                if(!startDragIfNeeded(dx, dy)) return;
                if('preventDefault' in ev) { try { (ev as Event).preventDefault(); } catch(_) {} }
            }

            if(isDragging) {
                lastClientMain = isHorizontal ? point.clientX : point.clientY;
                updateGhostAndPlaceholder(lastClientMain);
                updateAutoScroll();
                if('preventDefault' in ev) { try { (ev as Event).preventDefault(); } catch(_) {} }
            }
        };

        const endDrag = () => {
            if(!isPointerDown) return;
            clearAutoScroll();
            if(isDragging) {
                flipAnimateChildren(() => {
                    finalizeOrderAndNotify();
                    clearGhostAndPlaceholder();
                    return true;
                });
            } else {
                clearGhostAndPlaceholder();
            }
            isPointerDown = false;
            isDragging = false;
            draggingEl = null;
            startRect = null;
            if(cancelNextClick) {
                cancelNextClick = false;
                document.removeEventListener('click', suppressNextClick, true);
            }
            document.body.classList.remove('list-reorder-dragging');
            try { delete (document.body as any).dataset.listReorderDragging; } catch(_) { /* ignore */ }
        };

        document.addEventListener('mousedown', onPointerDown as EventListener);
        document.addEventListener('mousemove', onPointerMove as EventListener);
        document.addEventListener('mouseup', () => endDrag());

        document.addEventListener('touchstart', onPointerDown as EventListener, { passive: true } as any);
        document.addEventListener('touchmove', onPointerMove as EventListener, { passive: false } as any);
        document.addEventListener('touchend', () => endDrag(), { passive: true } as any);
        document.addEventListener('touchcancel', () => endDrag(), { passive: true } as any);
    }

}
