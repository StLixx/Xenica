import {safeInvoke, safeInvokeAsync} from "./interop.js";

// Interface for cross-module communication with venus-utils
declare global {
    interface Window {
        __venusKeyboardNavExclusionProvider?: {
            isSearchActive: () => boolean;
            getExcludedContainerSelectors: () => string[];
        };
        __venusKeyboardNavLockProvider?: {
            isLocked: () => boolean;
        };
    }
}

export class VulcanUtils {
    // Scroll position tracking
    private static currentEntityId: string = '';
    private static scrollPositions: Map<string, number> = new Map();
    private static scrollHandler: any = null;
    private static preRenderScrollPct: number | null = null;

    private static scrollInterval: number | null = null;
    private static scrollSpeed: number = 200;

    // HACK: Window scroll reset guard. On some mobile devices (e.g. iPhone), certain UI
    // interactions (like opening the selection tool in the left drawer) cause the entire
    // window/document to scroll, making both the navigation and content area visible
    // simultaneously. This should never happen. This guard detects and resets the scroll
    // to recover from such issues.
    private static windowScrollResetGuardInterval: number | null = null;
    private static windowScrollResetHandler: (() => void) | null = null;

    // Mentions/Links keyboard navigation state
    private static searchNavigationActive: boolean = false;
    private static mentionsSectionKeyboardHandlers: Map<string, { handler: (e: KeyboardEvent) => void, dotNetRef: any }> = new Map();

    // Attachments keyboard navigation state
    private static attachmentsSectionKeyboardHandlers: Map<string, { handler: (e: KeyboardEvent) => void, dotNetRef: any }> = new Map();

    // Initialize the cross-module provider for venus-utils
    private static initKeyboardNavProvider() {
        if (!window.__venusKeyboardNavExclusionProvider) {
            window.__venusKeyboardNavExclusionProvider = {
                isSearchActive: () => VulcanUtils.searchNavigationActive,
                getExcludedContainerSelectors: () => [
                    ...Array.from(VulcanUtils.mentionsSectionKeyboardHandlers.keys()),
                    ...Array.from(VulcanUtils.attachmentsSectionKeyboardHandlers.keys())
                ]
            };
        }
    }

    // Called by Blazor to indicate search is active/inactive
    public static setSearchNavigationActive(active: boolean) {
        VulcanUtils.initKeyboardNavProvider();
        VulcanUtils.searchNavigationActive = active;

        // When search becomes active, clear keyboard selection from mentions containers
        if (active) {
            VulcanUtils.clearMentionsKeyboardSelection();
        }
    }

    // Check if search navigation is active
    public static isSearchNavigationActive(): boolean {
        return VulcanUtils.searchNavigationActive;
    }

    // Clear keyboard selection from all registered mentions containers
    public static clearMentionsKeyboardSelection() {
        if (VulcanUtils.mentionsSectionKeyboardHandlers.size > 0) {
            for (const selector of VulcanUtils.mentionsSectionKeyboardHandlers.keys()) {
                const mentionsContainer = document.querySelector(selector) as HTMLElement;
                if (mentionsContainer) {
                    const selectedElements = mentionsContainer.querySelectorAll('.keyboard-selected');
                    selectedElements.forEach(el => el.classList.remove('keyboard-selected'));
                }
            }
        }
    }

    // Called from Blazor to add keyboard-selectable attribute to all links within a mentions section.
    // activeThoughtId, when supplied, is the thought currently being viewed: links back to it do
    // nothing when clicked (we're already there), so they must not be keyboard-selectable.
    public static addKeyboardSelectableToMentionLinks(containerSelector: string, activeThoughtId?: string) {
        const container = document.querySelector(containerSelector);
        if (!container) return;

        // Find all anchor tags with brain/ links within the mentions section
        container.querySelectorAll('a[href*="brain/"]').forEach(link => {
            const href = link.getAttribute('href') || '';
            // Skip and un-tag links to the active thought. Removing the attribute (rather than just
            // skipping) undoes a prior call made without activeThoughtId that may have tagged it.
            if (activeThoughtId && href.includes(activeThoughtId)) {
                link.removeAttribute('keyboard-selectable');
                link.classList.remove('keyboard-selected');
                return;
            }
            if (!link.hasAttribute('keyboard-selectable')) {
                link.setAttribute('keyboard-selectable', '');
            }
        });
    }

    public static addClickHandlerToRecognizedText(containerSelector: string, selfThoughtId: string, dotNetRef: any) {
        const container = document.querySelector(containerSelector);
        if (!container) return;

        container.querySelectorAll('.recognized-text[data-thought-id]').forEach(span => {
            const thoughtId = span.getAttribute('data-thought-id');
            if (!thoughtId || thoughtId === selfThoughtId) return;
            (span as HTMLElement).style.cursor = 'pointer';
            span.addEventListener('click', () => {
                safeInvoke(dotNetRef, 'OnRecognizedTextClicked', [thoughtId]);
            });
        });
    }

    // Right-clicking a self-mention (data-thought-id === current thought) opens a context menu
    // with a "Link Mention" action that rewrites the source note. preventDefault + stopPropagation
    // suppress the browser menu and the section-level LinksAndMentionsContextMenu so only ours shows.
    //
    // Only spans the Blazor post-processor tagged with data-source-thought-id / data-source-line-num
    // get the handler. Self-mentions on bullet lines (where a source thought's own name contains the
    // active thought's name) are intentionally left untagged — they have no "excerpt line to
    // rewrite", and right-click should bubble to the outer section menu.
    public static addContextMenuHandlerToSelfMentions(containerSelector: string, selfThoughtId: string, dotNetRef: any) {
        const container = document.querySelector(containerSelector);
        if (!container) return;

        const escapedId = (window as any).CSS?.escape ? CSS.escape(selfThoughtId) : selfThoughtId;
        const selector = `.recognized-text[data-thought-id="${escapedId}"][data-source-thought-id][data-source-line-num]`;
        container.querySelectorAll(selector).forEach(span => {
            const sourceThoughtId = span.getAttribute('data-source-thought-id')!;
            const sourceLineNumStr = span.getAttribute('data-source-line-num')!;
            (span as HTMLElement).style.cursor = 'context-menu';
            span.addEventListener('contextmenu', (e: Event) => {
                const me = e as MouseEvent;
                me.preventDefault();
                me.stopPropagation();
                const phrase = span.textContent ?? '';
                safeInvokeAsync(dotNetRef, 'OnSelfMentionContextMenu',
                    [sourceThoughtId, parseInt(sourceLineNumStr, 10), phrase, me.clientX, me.clientY]);
            });
        });
    }

    // Routes clicks on absolute http(s) <a> tags inside the container through Blazor (IUrlOpener)
    // instead of letting the browser navigate the whole app to the link.
    public static addExternalLinkClickHandler(containerSelector: string, dotNetRef: any) {
        const container = document.querySelector(containerSelector);
        if (!container) return;

        container.querySelectorAll('a[href]').forEach(link => {
            const href = link.getAttribute('href') || '';
            if (!/^https?:\/\//i.test(href)) return; // brain/ and other relative links are handled by Blazor
            if (link.hasAttribute('data-external-handler-attached')) return;
            link.setAttribute('data-external-handler-attached', '');
            link.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                safeInvokeAsync(dotNetRef, 'OnExternalLinkClicked', [href]);
            });
        });
    }

    // Called from Blazor to set up keyboard handling for the mentions section
    public static setupMentionsSectionKeyboardHandler(containerSelector: string, dotNetRef: any) {
        VulcanUtils.initKeyboardNavProvider();

        const container = document.querySelector(containerSelector) as HTMLElement;
        if (!container) return;

        // Remove existing handler if any
        VulcanUtils.removeMentionsSectionKeyboardHandler(containerSelector);

        const handler = (event: KeyboardEvent) => {
            // Don't handle if search navigation is active or keyboard navigation is locked
            const isKeyboardNavLocked = window.__venusKeyboardNavLockProvider?.isLocked?.() ?? false;
            if (VulcanUtils.searchNavigationActive || isKeyboardNavLocked) {
                return; // Let the event propagate to search/locked container's handler
            }

            const elements = Array.from(container.querySelectorAll('[keyboard-selectable]')) as HTMLElement[];
            if (elements.length === 0) return;

            // Find the currently selected element
            const currentElement = elements.find(el => el.classList.contains('keyboard-selected'));
            const currentIndex = currentElement ? elements.indexOf(currentElement) : -1;

            if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
                event.preventDefault();
                event.stopPropagation();

                if (currentIndex <= 0) {
                    // At first element or no selection - navigate back to editor
                    safeInvoke(dotNetRef, 'OnNavigateUpFromMentions');
                } else {
                    // Move to previous element
                    currentElement?.classList.remove('keyboard-selected');
                    const prevElement = elements[currentIndex - 1];
                    prevElement.classList.add('keyboard-selected');
                    prevElement.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
                }
            } else if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
                event.preventDefault();
                event.stopPropagation();

                if (currentIndex < elements.length - 1) {
                    // Move to next element
                    currentElement?.classList.remove('keyboard-selected');
                    const nextElement = elements[currentIndex + 1];
                    nextElement.classList.add('keyboard-selected');
                    nextElement.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
                }
                // At last element - do nothing (don't wrap)
            } else if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey) {
                event.preventDefault();
                event.stopPropagation();

                if (currentElement) {
                    currentElement.click();
                }
            } else if (event.key === 'ContextMenu' || (event.key === 'Enter' && (navigator.platform.toLowerCase().includes('mac') ? event.metaKey : event.ctrlKey))) {
                event.preventDefault();
                event.stopPropagation();

                if (currentElement) {
                    const rect = currentElement.getBoundingClientRect();
                    const contextEvent = new MouseEvent('contextmenu', {
                        bubbles: true,
                        cancelable: true,
                        clientX: rect.left + rect.width / 2,
                        clientY: rect.top + rect.height / 2
                    });
                    currentElement.dispatchEvent(contextEvent);
                }
            } else if (event.key === 'Escape') {
                // Escape exits the mentions section
                event.preventDefault();
                event.stopPropagation();
                safeInvoke(dotNetRef, 'OnNavigateUpFromMentions');
            }
        };

        container.addEventListener('keydown', handler);
        VulcanUtils.mentionsSectionKeyboardHandlers.set(containerSelector, { handler, dotNetRef });
    }

    // Called from Blazor to remove keyboard handler for mentions section
    public static removeMentionsSectionKeyboardHandler(containerSelector: string) {
        const existing = VulcanUtils.mentionsSectionKeyboardHandlers.get(containerSelector);
        if (existing) {
            const container = document.querySelector(containerSelector) as HTMLElement;
            if (container) {
                container.removeEventListener('keydown', existing.handler);
            }
            VulcanUtils.mentionsSectionKeyboardHandlers.delete(containerSelector);
        }
    }

    // Called from Blazor to focus the links and mentions section and select the first element
    public static focusLinksAndMentionsSection(containerSelector: string) {
        const container = document.querySelector(containerSelector) as HTMLElement;
        if (!container) return;

        // Find the first keyboard-selectable element in the container
        const firstSelectable = container.querySelector('[keyboard-selectable]') as HTMLElement;

        // Only focus the container if there are selectable elements
        // If there's nothing to select, keep focus in the editor
        if (!firstSelectable) return;

        // Focus the container so it can receive keyboard events
        container.focus();

        // Clear any existing selection in the container
        container.querySelectorAll('.keyboard-selected').forEach(el => el.classList.remove('keyboard-selected'));

        // Select the first element
        firstSelectable.classList.add('keyboard-selected');
        firstSelectable.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
    }

    // Called from Blazor to add keyboard-selectable attribute to all attachment items in a container
    public static addKeyboardSelectableToAttachments(containerSelector: string) {
        const container = document.querySelector(containerSelector);
        if(!container) return;

        container.querySelectorAll('div[data-attachment-id]').forEach(el => {
            if(!el.hasAttribute('keyboard-selectable')) {
                el.setAttribute('keyboard-selectable', '');
            }
        });
    }

    // Called from Blazor to set up keyboard handling for the attachments section
    public static setupAttachmentsSectionKeyboardHandler(containerSelector: string, dotNetRef: any) {
        VulcanUtils.initKeyboardNavProvider();

        const container = document.querySelector(containerSelector) as HTMLElement;
        if(!container) return;

        // Remove existing handler if any
        VulcanUtils.removeAttachmentsSectionKeyboardHandler(containerSelector);

        const handler = (event: KeyboardEvent) => {
            const isKeyboardNavLocked = window.__venusKeyboardNavLockProvider?.isLocked?.() ?? false;
            if(VulcanUtils.searchNavigationActive || isKeyboardNavLocked) {
                return;
            }

            const elements = Array.from(container.querySelectorAll('[keyboard-selectable]')) as HTMLElement[];
            if(elements.length === 0) return;

            const currentElement = elements.find(el => el.classList.contains('keyboard-selected'));
            const currentIndex = currentElement ? elements.indexOf(currentElement) : -1;

            if(event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
                event.preventDefault();
                event.stopPropagation();

                if(currentIndex <= 0) {
                    // At first element or no selection - navigate up out of attachments
                    currentElement?.classList.remove('keyboard-selected');
                    safeInvoke(dotNetRef, 'OnNavigateUpFromAttachments');
                } else {
                    currentElement?.classList.remove('keyboard-selected');
                    const prevElement = elements[currentIndex - 1];
                    prevElement.classList.add('keyboard-selected');
                    prevElement.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
                }
            } else if(event.key === 'ArrowDown' || event.key === 'ArrowRight') {
                event.preventDefault();
                event.stopPropagation();

                if(currentIndex >= elements.length - 1) {
                    // At last element - navigate down out of attachments
                    currentElement?.classList.remove('keyboard-selected');
                    safeInvoke(dotNetRef, 'OnNavigateDownFromAttachments');
                } else {
                    currentElement?.classList.remove('keyboard-selected');
                    const nextElement = elements[currentIndex + 1];
                    nextElement.classList.add('keyboard-selected');
                    nextElement.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
                }
            } else if(event.key === 'Enter' && !event.ctrlKey && !event.metaKey) {
                event.preventDefault();
                event.stopPropagation();

                if(currentElement) {
                    // Click the inner IconTile clickable div (has the Blazor @onclick handler)
                    const clickTarget = currentElement.querySelector('.place-items-center') as HTMLElement;
                    (clickTarget ?? currentElement).click();
                }
            } else if(event.key === 'ContextMenu' || (event.key === 'Enter' && (navigator.platform.toLowerCase().includes('mac') ? event.metaKey : event.ctrlKey))) {
                event.preventDefault();
                event.stopPropagation();

                if(currentElement) {
                    const rect = currentElement.getBoundingClientRect();
                    const contextEvent = new MouseEvent('contextmenu', {
                        bubbles: true,
                        cancelable: true,
                        clientX: rect.left + rect.width / 2,
                        clientY: rect.top + rect.height / 2
                    });
                    currentElement.dispatchEvent(contextEvent);
                }
            } else if(event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                currentElement?.classList.remove('keyboard-selected');
                safeInvoke(dotNetRef, 'OnNavigateDownFromAttachments');
            }
        };

        container.addEventListener('keydown', handler);
        VulcanUtils.attachmentsSectionKeyboardHandlers.set(containerSelector, { handler, dotNetRef });
    }

    // Called from Blazor to remove keyboard handler for attachments section
    public static removeAttachmentsSectionKeyboardHandler(containerSelector: string) {
        const existing = VulcanUtils.attachmentsSectionKeyboardHandlers.get(containerSelector);
        if(existing) {
            const container = document.querySelector(containerSelector) as HTMLElement;
            if(container) {
                container.removeEventListener('keydown', existing.handler);
            }
            VulcanUtils.attachmentsSectionKeyboardHandlers.delete(containerSelector);
        }
    }

    // Called from Blazor to focus the attachments section and select the first element
    public static focusAttachmentsSection(containerSelector: string) {
        const container = document.querySelector(containerSelector) as HTMLElement;
        if(!container) return;

        const firstSelectable = container.querySelector('[keyboard-selectable]') as HTMLElement;
        if(!firstSelectable) return;

        container.focus();
        container.querySelectorAll('.keyboard-selected').forEach(el => el.classList.remove('keyboard-selected'));
        firstSelectable.classList.add('keyboard-selected');
        firstSelectable.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
    }

    // Called from Blazor to focus the attachments section and select the last element
    public static focusAttachmentsSectionLast(containerSelector: string) {
        const container = document.querySelector(containerSelector) as HTMLElement;
        if(!container) return;

        const selectables = container.querySelectorAll('[keyboard-selectable]');
        if(selectables.length === 0) return;

        const lastSelectable = selectables[selectables.length - 1] as HTMLElement;

        container.focus();
        container.querySelectorAll('.keyboard-selected').forEach(el => el.classList.remove('keyboard-selected'));
        lastSelectable.classList.add('keyboard-selected');
        lastSelectable.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
    }

    // Clear keyboard selection from all registered attachment containers
    public static clearAttachmentsKeyboardSelection() {
        for(const selector of VulcanUtils.attachmentsSectionKeyboardHandlers.keys()) {
            const container = document.querySelector(selector) as HTMLElement;
            if(container) {
                container.querySelectorAll('.keyboard-selected').forEach(el => el.classList.remove('keyboard-selected'));
            }
        }
    }

    // called from Blazor
    public static startScrolling(): void {
        if(VulcanUtils.scrollInterval !== null) {
            return; // Already scrolling
        }

        // Find which element to scroll (will change depending on plex orientation)
        const plexAndContentArea = document.getElementById('plex-and-content-area') as HTMLElement;
        let toScroll = plexAndContentArea;
        if(plexAndContentArea.scrollHeight <= plexAndContentArea.clientHeight) {
            toScroll = document.getElementById('contentAreaInner') as HTMLElement;
        }

        // Stop scrolling when the user interacts
        function stopAutoScrollOnUserInteraction() {
            VulcanUtils.stopScrolling();
        }
        // Mouse wheel
        toScroll.addEventListener('wheel', stopAutoScrollOnUserInteraction, { passive: true });
        // Dragging
        let isPointerDown = false;
        toScroll.addEventListener('pointerdown', (event) => {
            isPointerDown = true;
            stopAutoScrollOnUserInteraction();
        });
        toScroll.addEventListener('pointermove', (event) => {
            if (isPointerDown) {
                stopAutoScrollOnUserInteraction();
            }
        });
        toScroll.addEventListener('pointerup', (event) => {
            isPointerDown = false;
        });
        toScroll.addEventListener('pointercancel', (event) => {
            isPointerDown = false;
        });

        // Auto-scroll using the interval
        VulcanUtils.scrollInterval = window.setInterval(() => {
            // Reusing the toScroll variable doesn't work, so we need to find the element again
            const targetScroll = document.getElementById('plex-and-content-area');
            if(!targetScroll) {
                VulcanUtils.stopScrolling();
                return;
            }
            targetScroll.scrollTo({
                left: 0,
                top: targetScroll.scrollTop + VulcanUtils.scrollSpeed,
                behavior: 'smooth',
            });
        }, 200);
    }

    // called from Blazor
    public static stopScrolling(): void {
        if(VulcanUtils.scrollInterval !== null) {
            clearInterval(VulcanUtils.scrollInterval);
            VulcanUtils.scrollInterval = null;
        }
    }

    static inputActivityDotNetReference: any;
    static lastInputActivityTime: number = 0;
    // called from Blazor 
    public static detectInputActivity(dotNetReference: any) {
        this.inputActivityDotNetReference = dotNetReference;
        window.addEventListener('touchstart', this.handleInputEvent);
        window.addEventListener('mousedown', this.handleInputEvent);
        window.addEventListener('mousemove', this.handleInputEvent);
        window.addEventListener('keypress', this.handleInputEvent);
    }
    
    private static handleInputEvent = (event: Event): void => {
        if(VulcanUtils.inputActivityDotNetReference) {
            // Do not call if we just called within the last 100ms
            const now = Date.now();
            if (VulcanUtils.lastInputActivityTime && now - VulcanUtils.lastInputActivityTime < 100) {
                return;
            }
            safeInvoke(VulcanUtils.inputActivityDotNetReference, 'OnInputActivity', [event.type]);
        }
    }
    
    // Save scroll position for current entity before switching
    public static saveCurrentScrollPosition(): void {
        if(VulcanUtils.currentEntityId) {
            const scrollPercentage = VulcanUtils.getContentAreaScrollPosition();
            VulcanUtils.scrollPositions.set(VulcanUtils.currentEntityId, scrollPercentage);
            //console.log(`[VulcanUtils] saveCurrentScrollPosition: Saved position ${scrollPercentage.toFixed(1)}% for ${VulcanUtils.currentEntityId}`);
        }
    }

    // Snapshot scroll position before a Blazor re-render so it survives reflow-induced scroll resets.
    // The scroll event handler may overwrite scrollPositions with 0 during reflow, so we keep
    // a separate variable that restoreScrollForCurrentEntity prefers.
    public static savePreRenderScrollPosition(): void {
        if(VulcanUtils.preRenderScrollPct === null) {
            VulcanUtils.preRenderScrollPct = VulcanUtils.getContentAreaScrollPosition();
        }
    }
    
    // Register the current entity being displayed
    public static registerCurrentEntity(entityId: string): void {
        //console.log(`[VulcanUtils] registerCurrentEntity: id=${entityId}`);
        
        // Don't save scroll position here - it should be saved before content changes
        
        // Update current entity
        VulcanUtils.currentEntityId = entityId;
        
        // Set up scroll tracking if not already done
        if(!VulcanUtils.scrollHandler) {
            VulcanUtils.setupScrollTracking();
        }
    }
    
    // Set up scroll position tracking
    private static setupScrollTracking(): void {
        VulcanUtils.scrollHandler = () => {
            if(VulcanUtils.currentEntityId) {
                const scrollPercentage = VulcanUtils.getContentAreaScrollPosition();
                VulcanUtils.scrollPositions.set(VulcanUtils.currentEntityId, scrollPercentage);
                // Only log significant changes (every 10%)
                if(scrollPercentage > 0 && Math.floor(scrollPercentage / 10) !== Math.floor((VulcanUtils.scrollPositions.get(VulcanUtils.currentEntityId) || 0) / 10)) {
                    //console.log(`[VulcanUtils] Updated scroll position to ${scrollPercentage.toFixed(1)}% for ${VulcanUtils.currentEntityId}`);
                }
            }
        };
        
        // Listen for scroll events on both possible containers
        const contentAreaInner = document.getElementById('contentAreaInner');
        const plexAndContentArea = document.getElementById('plex-and-content-area');
        
        if(contentAreaInner) {
            contentAreaInner.addEventListener('scroll', VulcanUtils.scrollHandler, { passive: true });
        }
        if(plexAndContentArea) {
            plexAndContentArea.addEventListener('scroll', VulcanUtils.scrollHandler, { passive: true });
        }
        
        //console.log('[VulcanUtils] Scroll tracking initialized');
    }
    
    // Get saved scroll position for an entity
    public static getSavedScrollPosition(entityType: string, entityId: string): number {
        const key = `${entityType}_${entityId}`;
        const position = VulcanUtils.scrollPositions.get(key) || 0;
        //console.log(`[VulcanUtils] getSavedScrollPosition: ${position} for ${key}`);
        return position;
    }
    
    // Get scroll position as a percentage (0-100)
    private static getScrollPercentage(element: HTMLElement): number {
        const scrollableHeight = element.scrollHeight - element.clientHeight;
        if(scrollableHeight <= 0) {
            return 0;
        }
        const percentage = (element.scrollTop / scrollableHeight) * 100;
        return Math.min(100, Math.max(0, percentage)); // Clamp between 0 and 100
    }
    
    // Set scroll position from a percentage (0-100)
    private static setScrollPercentage(element: HTMLElement, percentage: number): void {
        const scrollableHeight = element.scrollHeight - element.clientHeight;
        if(scrollableHeight > 0) {
            const clampedPercentage = Math.min(100, Math.max(0, percentage));
            element.scrollTop = (clampedPercentage / 100) * scrollableHeight;
        }
    }
    
    // Scroll position management for content area (returns percentage)
    public static getContentAreaScrollPosition(): number {
        const contentAreaInner = document.getElementById('contentAreaInner');
        if(!contentAreaInner) {
            //console.log('[VulcanUtils] getContentAreaScrollPosition: contentAreaInner not found');
            return 0;
        }
        
        // Check if contentAreaInner itself is scrollable
        if(contentAreaInner.scrollHeight > contentAreaInner.clientHeight) {
            const percentage = VulcanUtils.getScrollPercentage(contentAreaInner);
            //console.log(`[VulcanUtils] getContentAreaScrollPosition: contentAreaInner ${percentage.toFixed(1)}% (scrollTop=${contentAreaInner.scrollTop}, scrollHeight=${contentAreaInner.scrollHeight}, clientHeight=${contentAreaInner.clientHeight})`);
            return percentage;
        }
        
        // Otherwise check if plex-and-content-area is scrollable
        const plexAndContentArea = document.getElementById('plex-and-content-area');
        if(plexAndContentArea && plexAndContentArea.scrollHeight > plexAndContentArea.clientHeight) {
            const percentage = VulcanUtils.getScrollPercentage(plexAndContentArea);
            //console.log(`[VulcanUtils] getContentAreaScrollPosition: plex-and-content-area ${percentage.toFixed(1)}% (scrollTop=${plexAndContentArea.scrollTop}, scrollHeight=${plexAndContentArea.scrollHeight}, clientHeight=${plexAndContentArea.clientHeight})`);
            return percentage;
        }
        
        //console.log('[VulcanUtils] getContentAreaScrollPosition: no scrollable element found, returning 0');
        return 0;
    }
    
    public static setContentAreaScrollPosition(percentage: number): void {
        //console.log(`[VulcanUtils] setContentAreaScrollPosition: attempting to set position to ${percentage.toFixed(1)}%`);
        
        const contentAreaInner = document.getElementById('contentAreaInner');
        if(!contentAreaInner) {
            //console.log('[VulcanUtils] setContentAreaScrollPosition: contentAreaInner not found');
            return;
        }
        
        // Check if contentAreaInner itself is scrollable
        if(contentAreaInner.scrollHeight > contentAreaInner.clientHeight) {
            VulcanUtils.setScrollPercentage(contentAreaInner, percentage);
            //console.log(`[VulcanUtils] setContentAreaScrollPosition: set contentAreaInner to ${percentage.toFixed(1)}% (scrollTop is now ${contentAreaInner.scrollTop}, scrollHeight=${contentAreaInner.scrollHeight}, clientHeight=${contentAreaInner.clientHeight})`);
            
            // Update our tracked position
            if(VulcanUtils.currentEntityId) {
                VulcanUtils.scrollPositions.set(VulcanUtils.currentEntityId, percentage);
            }
            return;
        }
        
        // Otherwise check if plex-and-content-area is scrollable
        const plexAndContentArea = document.getElementById('plex-and-content-area');
        if(plexAndContentArea && plexAndContentArea.scrollHeight > plexAndContentArea.clientHeight) {
            VulcanUtils.setScrollPercentage(plexAndContentArea, percentage);
            //console.log(`[VulcanUtils] setContentAreaScrollPosition: set plex-and-content-area to ${percentage.toFixed(1)}% (scrollTop is now ${plexAndContentArea.scrollTop}, scrollHeight=${plexAndContentArea.scrollHeight}, clientHeight=${plexAndContentArea.clientHeight})`);
            
            // Update our tracked position
            if(VulcanUtils.currentEntityId) {
                VulcanUtils.scrollPositions.set(VulcanUtils.currentEntityId, percentage);
            }
        } else {
            //console.log('[VulcanUtils] setContentAreaScrollPosition: no scrollable element found');
        }
    }
    
    public static resetContentAreaScrollToTop(): void {
        VulcanUtils.setContentAreaScrollPosition(0);
    }

    // HACK: Start a guard that resets window scroll position to the top.
    // On some mobile devices, certain UI interactions cause the entire window to scroll
    // unexpectedly (e.g. selecting the selection tool from the left drawer on iPhone).
    // Uses both a scroll event listener (immediate response) and a periodic interval
    // (backup) to detect and recover from such issues.
    public static startWindowScrollResetGuard(intervalMs: number = 500): void {
        VulcanUtils.stopWindowScrollResetGuard();

        const resetScroll = () => {
            if(window.scrollX !== 0 || window.scrollY !== 0) {
                window.scrollTo(0, 0);
            }
            if(document.documentElement.scrollTop !== 0) {
                document.documentElement.scrollTop = 0;
            }
            if(document.body.scrollTop !== 0) {
                document.body.scrollTop = 0;
            }
        };

        // Immediate response via scroll event listener
        VulcanUtils.windowScrollResetHandler = resetScroll;
        window.addEventListener('scroll', resetScroll, { passive: true });
        document.addEventListener('scroll', resetScroll, { passive: true });

        // Periodic backup check
        VulcanUtils.windowScrollResetGuardInterval = window.setInterval(resetScroll, intervalMs);
    }

    public static stopWindowScrollResetGuard(): void {
        if(VulcanUtils.windowScrollResetHandler !== null) {
            window.removeEventListener('scroll', VulcanUtils.windowScrollResetHandler);
            document.removeEventListener('scroll', VulcanUtils.windowScrollResetHandler);
            VulcanUtils.windowScrollResetHandler = null;
        }
        if(VulcanUtils.windowScrollResetGuardInterval !== null) {
            window.clearInterval(VulcanUtils.windowScrollResetGuardInterval);
            VulcanUtils.windowScrollResetGuardInterval = null;
        }
    }

    // Restore scroll position for current entity
    public static restoreScrollForCurrentEntity(): void {
        if(VulcanUtils.currentEntityId) {
            // Prefer the pre-render snapshot — the scrollPositions map may have been
            // overwritten to 0 by a scroll event fired during a layout reflow.
            const savedPercentage = VulcanUtils.preRenderScrollPct
                ?? VulcanUtils.scrollPositions.get(VulcanUtils.currentEntityId)
                ?? 0;
            VulcanUtils.preRenderScrollPct = null;
            //console.log(`[VulcanUtils] restoreScrollForCurrentEntity: Restoring position ${savedPercentage.toFixed(1)}% for ${VulcanUtils.currentEntityId}`);
            VulcanUtils.setContentAreaScrollPosition(savedPercentage);
        }
    }

    // Paste handler management for search input
    private static searchPasteHandlers: Map<string, (e: ClipboardEvent) => void> = new Map();

    public static registerSearchPasteHandler(elementId: string, dotNetReference: any): void {
        try {
            const el = document.getElementById(elementId) as HTMLInputElement | null;
            if(!el) { return; }

            const handler = (e: ClipboardEvent) => {
                try {
                    const text = e.clipboardData && e.clipboardData.getData ? (e.clipboardData.getData('text') || '') : '';
                    if(!text) { return; }

                    const trimmed = text.trim();
                    if(!trimmed) { return; }

                    // Prevent default paste and ask .NET to handle (for GUIDs, copied thoughts, etc.)
                    e.preventDefault();

                    if(dotNetReference) {
                        safeInvokeAsync(dotNetReference, 'OnSearchInputPasteAsync', [trimmed])
                            .then((handled: boolean) => {
                                if(!handled) {
                                    // Not a special paste; perform the paste manually to mimic default behavior
                                    try {
                                        const start = (el.selectionStart ?? el.value.length);
                                        const end = (el.selectionEnd ?? start);
                                        const before = el.value.substring(0, start);
                                        const after = el.value.substring(end);
                                        el.value = before + trimmed + after;
                                        const caret = start + trimmed.length;
                                        el.selectionStart = el.selectionEnd = caret;
                                        // Trigger input event so Blazor @bind updates
                                        const evt = new Event('input', { bubbles: true });
                                        el.dispatchEvent(evt);
                                    } catch { /* ignore */ }
                                }
                            });
                    }
                } catch { /* ignore */ }
            };

            // Store and add listener
            VulcanUtils.searchPasteHandlers.set(elementId, handler);
            el.addEventListener('paste', handler);
        } catch { /* ignore */ }
    }

    public static unregisterSearchPasteHandler(elementId: string): void {
        try {
            const el = document.getElementById(elementId) as HTMLInputElement | null;
            const handler = VulcanUtils.searchPasteHandlers.get(elementId);
            if(el && handler) {
                el.removeEventListener('paste', handler);
            }
            VulcanUtils.searchPasteHandlers.delete(elementId);
        } catch { /* ignore */ }
    }

    public static setAttachmentsScale(wrapper: HTMLElement, scalePercent: number): void {
        if(!wrapper) {
            return;
        }

        const content = wrapper.querySelector(':scope > .attachments-and-note-section-scale-content') as HTMLElement | null;
        const spacer = wrapper.querySelector(':scope > .attachments-and-note-section-scale-spacer') as HTMLElement | null;
        if(!content) {
            return;
        }

        const numeric = Number(scalePercent);
        const clampedPercent = Number.isFinite(numeric) ? Math.min(200, Math.max(50, numeric)) : 100;
        const scale = clampedPercent / 100;

        // Tear down any previous observer; we'll re-create one below if scale != 1.
        const existingObserver = (wrapper as any).__attachmentsScaleObserver as ResizeObserver | undefined;
        if(existingObserver) {
            existingObserver.disconnect();
            (wrapper as any).__attachmentsScaleObserver = undefined;
        }

        content.style.transformOrigin = 'top left';

        if(Math.abs(scale - 1) < 0.0001) {
            content.style.transform = '';
            content.style.width = '';
            content.style.maxWidth = '';
            content.style.maxHeight = '';
            wrapper.style.height = '';
            if(spacer) {
                spacer.style.height = '';
            }
            return;
        }

        const inversePercent = (100 / scale).toFixed(5);
        content.style.transform = `scale(${scale})`;
        content.style.width = `${inversePercent}%`;
        content.style.maxWidth = 'none';
        content.style.maxHeight = 'none';
        // Wrapper has no explicit height; layout flows naturally from content + spacer +
        // pb-[calc(...)] padding-bottom. This keeps the keyboard-height var live without
        // any JS recompute on keyboard show/hide.
        wrapper.style.height = '';

        // The CSS scale on .attachments-and-note-section-scale-content visually expands the
        // element by `scale` but contributes nothing to layout. Without compensation, the
        // visual content extends `(scale - 1) * scrollHeight` past where layout thinks the
        // wrapper ends — eating into / past the keyboard-clearance padding-bottom. The
        // sibling spacer reserves that missing layout space so the wrapper grows naturally
        // and the padding-bottom sits below the scaled visual.
        const updateSpacer = () => {
            if(!spacer) {
                return;
            }
            const baseHeight = content.scrollHeight;
            const extra = Math.max(0, (scale - 1) * baseHeight);
            spacer.style.height = `${extra}px`;
        };

        updateSpacer();

        const observer = new ResizeObserver(() => updateSpacer());
        observer.observe(content);
        (wrapper as any).__attachmentsScaleObserver = observer;
    }

    // Content area height observer for disabling hero images when too short
    private static contentAreaHeightObserver: ResizeObserver | null = null;
    private static contentAreaHeightDotNetRef: any = null;

    public static observeContentAreaHeight(dotNetRef: any, elementId: string, threshold: number): void {
        VulcanUtils.removeContentAreaHeightObserver();

        const element = document.getElementById(elementId);
        if (!element) return;

        VulcanUtils.contentAreaHeightDotNetRef = dotNetRef;
        let lastBelowThreshold: boolean | null = null;

        VulcanUtils.contentAreaHeightObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const height = entry.contentRect.height;
                const isBelowThreshold = height < threshold;
                if (isBelowThreshold !== lastBelowThreshold) {
                    lastBelowThreshold = isBelowThreshold;
                    safeInvoke(dotNetRef, 'OnContentAreaHeightThresholdChanged', [isBelowThreshold]);
                }
            }
        });

        VulcanUtils.contentAreaHeightObserver.observe(element);
    }

    public static removeContentAreaHeightObserver(): void {
        if (VulcanUtils.contentAreaHeightObserver) {
            VulcanUtils.contentAreaHeightObserver.disconnect();
            VulcanUtils.contentAreaHeightObserver = null;
        }
        VulcanUtils.contentAreaHeightDotNetRef = null;
    }

    // Drag-scroll helpers for auto-scrolling containers during drag operations
    private static dragScrollCleanups: Map<string, () => void> = new Map();

    public static setupDragScroll(elementId: string): void {
        const container = document.getElementById(elementId);
        if (!container) return;

        // Clean up any previous setup for this element
        VulcanUtils.cleanupDragScroll(elementId);

        const edgeSize = 50; // pixels from edge to trigger scroll
        const scrollSpeed = 8; // pixels per frame
        let scrollInterval: number | null = null;

        const handleDragOver = (e: DragEvent) => {
            const rect = container.getBoundingClientRect();
            const mouseY = e.clientY;

            // Calculate distance from edges
            const distFromTop = mouseY - rect.top;
            const distFromBottom = rect.bottom - mouseY;

            // Clear any existing interval
            if (scrollInterval !== null) {
                cancelAnimationFrame(scrollInterval);
                scrollInterval = null;
            }

            // Scroll up if near top
            if (distFromTop < edgeSize && container.scrollTop > 0) {
                const intensity = 1 - (distFromTop / edgeSize);
                const scroll = () => {
                    container.scrollTop -= scrollSpeed * intensity;
                    if (container.scrollTop > 0) {
                        scrollInterval = requestAnimationFrame(scroll);
                    }
                };
                scrollInterval = requestAnimationFrame(scroll);
            }
            // Scroll down if near bottom
            else if (distFromBottom < edgeSize && container.scrollTop < container.scrollHeight - container.clientHeight) {
                const intensity = 1 - (distFromBottom / edgeSize);
                const scroll = () => {
                    container.scrollTop += scrollSpeed * intensity;
                    if (container.scrollTop < container.scrollHeight - container.clientHeight) {
                        scrollInterval = requestAnimationFrame(scroll);
                    }
                };
                scrollInterval = requestAnimationFrame(scroll);
            }
        };

        const handleDragEnd = () => {
            if (scrollInterval !== null) {
                cancelAnimationFrame(scrollInterval);
                scrollInterval = null;
            }
        };

        container.addEventListener('dragover', handleDragOver);
        document.addEventListener('dragend', handleDragEnd);
        document.addEventListener('drop', handleDragEnd);

        // Store cleanup function for this element
        VulcanUtils.dragScrollCleanups.set(elementId, () => {
            container.removeEventListener('dragover', handleDragOver);
            document.removeEventListener('dragend', handleDragEnd);
            document.removeEventListener('drop', handleDragEnd);
            if (scrollInterval !== null) {
                cancelAnimationFrame(scrollInterval);
            }
        });
    }

    public static cleanupDragScroll(elementId: string): void {
        const cleanup = VulcanUtils.dragScrollCleanups.get(elementId);
        if (cleanup) {
            cleanup();
            VulcanUtils.dragScrollCleanups.delete(elementId);
        }
    }

    private static linkInterceptors: Map<string, { container: HTMLElement, handler: (e: Event) => void }> = new Map();

    /**
     * Intercepts clicks on <a> tags inside a container and routes non-brain:// URLs
     * to a .NET callback instead of default navigation.
     */
    public static attachLinkInterceptor(containerId: string, dotNetRef: any, method: string): void {
        const container = document.getElementById(containerId);
        if(!container || !dotNetRef || !method) {
            return;
        }

        VulcanUtils.detachLinkInterceptor(containerId);

        const handler = (event: Event) => {
            const target = event.target as HTMLElement | null;
            if(!target) return;

            const anchor = target.closest('a');
            if(!anchor) return;

            const href = anchor.getAttribute('href');
            if(!href) return;

            event.preventDefault();
            event.stopPropagation();

            safeInvoke(dotNetRef, method, [href]);
        };

        container.addEventListener('click', handler);
        VulcanUtils.linkInterceptors.set(containerId, { container, handler });
    }

    public static detachLinkInterceptor(containerId: string): void {
        const interceptor = VulcanUtils.linkInterceptors.get(containerId);
        if(interceptor) {
            interceptor.container.removeEventListener('click', interceptor.handler);
            VulcanUtils.linkInterceptors.delete(containerId);
        }
    }

    // Click-to-focus: clicking non-interactive areas in ContentArea focuses the notes editor
    private static contentAreaClickHandler: { element: HTMLElement, handler: (e: MouseEvent) => void } | null = null;

    public static setupContentAreaClickToFocus(elementId: string): void {
        VulcanUtils.removeContentAreaClickToFocus();

        const element = document.getElementById(elementId);
        if(!element) return;

        const handler = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if(!target) return;

            // Don't redirect focus if clicking on an interactive element
            if(target.closest('input, textarea, select, button, a, [contenteditable="true"], [role="button"], [keyboard-selectable], .ql-editor')) {
                return;
            }

            // Find the Quill editor inside the content area
            const editor = element.querySelector('.ql-editor') as HTMLElement;
            if(!editor) return;

            const editorRect = editor.getBoundingClientRect();

            // Only focus for clicks below the editor
            if(e.clientY <= editorRect.bottom) return;

            // Save scroll positions before focusing
            const scrollContainer = editor.closest('#contentAreaInner') as HTMLElement;
            const savedScrollTop = scrollContainer?.scrollTop ?? 0;
            const savedEditorScrollTop = editor.scrollTop;

            // Focus editor and place cursor at the end of content
            editor.focus({ preventScroll: true });
            const sel = window.getSelection();
            if(sel) {
                sel.selectAllChildren(editor);
                sel.collapseToEnd();
            }

            // Restore scroll positions
            if(scrollContainer) scrollContainer.scrollTop = savedScrollTop;
            editor.scrollTop = savedEditorScrollTop;
        };

        element.addEventListener('click', handler);
        VulcanUtils.contentAreaClickHandler = { element, handler };
    }

    public static removeContentAreaClickToFocus(): void {
        if(VulcanUtils.contentAreaClickHandler) {
            VulcanUtils.contentAreaClickHandler.element.removeEventListener('click', VulcanUtils.contentAreaClickHandler.handler);
            VulcanUtils.contentAreaClickHandler = null;
        }
    }

	static printHtmlContent(htmlContent: string, title: string): void {
		const iframe = document.createElement("iframe");
		iframe.style.position = "fixed";
		iframe.style.left = "-9999px";
		iframe.style.top = "-9999px";
		iframe.style.width = "0";
		iframe.style.height = "0";
		document.body.appendChild(iframe);

		const iframeWindow = iframe.contentWindow;
		const doc = iframe.contentDocument || iframeWindow?.document;
		if(!doc || !iframeWindow) {
			document.body.removeChild(iframe);
			return;
		}

		doc.open();
		doc.write(htmlContent);
		doc.close();

		const cleanup = () => {
			iframeWindow.removeEventListener("afterprint", cleanup);
			document.body.removeChild(iframe);
		};
		iframeWindow.addEventListener("afterprint", cleanup);

		iframe.onload = () => {
			iframeWindow.focus();
			iframeWindow.print();
		};
	}
}
