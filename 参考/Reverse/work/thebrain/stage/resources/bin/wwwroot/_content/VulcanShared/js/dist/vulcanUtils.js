import { safeInvoke, safeInvokeAsync } from "./interop.js";
export class VulcanUtils {
    static initKeyboardNavProvider() {
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
    static setSearchNavigationActive(active) {
        VulcanUtils.initKeyboardNavProvider();
        VulcanUtils.searchNavigationActive = active;
        if (active) {
            VulcanUtils.clearMentionsKeyboardSelection();
        }
    }
    static isSearchNavigationActive() {
        return VulcanUtils.searchNavigationActive;
    }
    static clearMentionsKeyboardSelection() {
        if (VulcanUtils.mentionsSectionKeyboardHandlers.size > 0) {
            for (const selector of VulcanUtils.mentionsSectionKeyboardHandlers.keys()) {
                const mentionsContainer = document.querySelector(selector);
                if (mentionsContainer) {
                    const selectedElements = mentionsContainer.querySelectorAll('.keyboard-selected');
                    selectedElements.forEach(el => el.classList.remove('keyboard-selected'));
                }
            }
        }
    }
    static addKeyboardSelectableToMentionLinks(containerSelector, activeThoughtId) {
        const container = document.querySelector(containerSelector);
        if (!container)
            return;
        container.querySelectorAll('a[href*="brain/"]').forEach(link => {
            const href = link.getAttribute('href') || '';
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
    static addClickHandlerToRecognizedText(containerSelector, selfThoughtId, dotNetRef) {
        const container = document.querySelector(containerSelector);
        if (!container)
            return;
        container.querySelectorAll('.recognized-text[data-thought-id]').forEach(span => {
            const thoughtId = span.getAttribute('data-thought-id');
            if (!thoughtId || thoughtId === selfThoughtId)
                return;
            span.style.cursor = 'pointer';
            span.addEventListener('click', () => {
                safeInvoke(dotNetRef, 'OnRecognizedTextClicked', [thoughtId]);
            });
        });
    }
    static addContextMenuHandlerToSelfMentions(containerSelector, selfThoughtId, dotNetRef) {
        var _a;
        const container = document.querySelector(containerSelector);
        if (!container)
            return;
        const escapedId = ((_a = window.CSS) === null || _a === void 0 ? void 0 : _a.escape) ? CSS.escape(selfThoughtId) : selfThoughtId;
        const selector = `.recognized-text[data-thought-id="${escapedId}"][data-source-thought-id][data-source-line-num]`;
        container.querySelectorAll(selector).forEach(span => {
            const sourceThoughtId = span.getAttribute('data-source-thought-id');
            const sourceLineNumStr = span.getAttribute('data-source-line-num');
            span.style.cursor = 'context-menu';
            span.addEventListener('contextmenu', (e) => {
                var _a;
                const me = e;
                me.preventDefault();
                me.stopPropagation();
                const phrase = (_a = span.textContent) !== null && _a !== void 0 ? _a : '';
                safeInvokeAsync(dotNetRef, 'OnSelfMentionContextMenu', [sourceThoughtId, parseInt(sourceLineNumStr, 10), phrase, me.clientX, me.clientY]);
            });
        });
    }
    static addExternalLinkClickHandler(containerSelector, dotNetRef) {
        const container = document.querySelector(containerSelector);
        if (!container)
            return;
        container.querySelectorAll('a[href]').forEach(link => {
            const href = link.getAttribute('href') || '';
            if (!/^https?:\/\//i.test(href))
                return;
            if (link.hasAttribute('data-external-handler-attached'))
                return;
            link.setAttribute('data-external-handler-attached', '');
            link.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                safeInvokeAsync(dotNetRef, 'OnExternalLinkClicked', [href]);
            });
        });
    }
    static setupMentionsSectionKeyboardHandler(containerSelector, dotNetRef) {
        VulcanUtils.initKeyboardNavProvider();
        const container = document.querySelector(containerSelector);
        if (!container)
            return;
        VulcanUtils.removeMentionsSectionKeyboardHandler(containerSelector);
        const handler = (event) => {
            var _a, _b, _c;
            const isKeyboardNavLocked = (_c = (_b = (_a = window.__venusKeyboardNavLockProvider) === null || _a === void 0 ? void 0 : _a.isLocked) === null || _b === void 0 ? void 0 : _b.call(_a)) !== null && _c !== void 0 ? _c : false;
            if (VulcanUtils.searchNavigationActive || isKeyboardNavLocked) {
                return;
            }
            const elements = Array.from(container.querySelectorAll('[keyboard-selectable]'));
            if (elements.length === 0)
                return;
            const currentElement = elements.find(el => el.classList.contains('keyboard-selected'));
            const currentIndex = currentElement ? elements.indexOf(currentElement) : -1;
            if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
                event.preventDefault();
                event.stopPropagation();
                if (currentIndex <= 0) {
                    safeInvoke(dotNetRef, 'OnNavigateUpFromMentions');
                }
                else {
                    currentElement === null || currentElement === void 0 ? void 0 : currentElement.classList.remove('keyboard-selected');
                    const prevElement = elements[currentIndex - 1];
                    prevElement.classList.add('keyboard-selected');
                    prevElement.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
                }
            }
            else if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
                event.preventDefault();
                event.stopPropagation();
                if (currentIndex < elements.length - 1) {
                    currentElement === null || currentElement === void 0 ? void 0 : currentElement.classList.remove('keyboard-selected');
                    const nextElement = elements[currentIndex + 1];
                    nextElement.classList.add('keyboard-selected');
                    nextElement.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
                }
            }
            else if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey) {
                event.preventDefault();
                event.stopPropagation();
                if (currentElement) {
                    currentElement.click();
                }
            }
            else if (event.key === 'ContextMenu' || (event.key === 'Enter' && (navigator.platform.toLowerCase().includes('mac') ? event.metaKey : event.ctrlKey))) {
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
            }
            else if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                safeInvoke(dotNetRef, 'OnNavigateUpFromMentions');
            }
        };
        container.addEventListener('keydown', handler);
        VulcanUtils.mentionsSectionKeyboardHandlers.set(containerSelector, { handler, dotNetRef });
    }
    static removeMentionsSectionKeyboardHandler(containerSelector) {
        const existing = VulcanUtils.mentionsSectionKeyboardHandlers.get(containerSelector);
        if (existing) {
            const container = document.querySelector(containerSelector);
            if (container) {
                container.removeEventListener('keydown', existing.handler);
            }
            VulcanUtils.mentionsSectionKeyboardHandlers.delete(containerSelector);
        }
    }
    static focusLinksAndMentionsSection(containerSelector) {
        const container = document.querySelector(containerSelector);
        if (!container)
            return;
        const firstSelectable = container.querySelector('[keyboard-selectable]');
        if (!firstSelectable)
            return;
        container.focus();
        container.querySelectorAll('.keyboard-selected').forEach(el => el.classList.remove('keyboard-selected'));
        firstSelectable.classList.add('keyboard-selected');
        firstSelectable.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
    }
    static addKeyboardSelectableToAttachments(containerSelector) {
        const container = document.querySelector(containerSelector);
        if (!container)
            return;
        container.querySelectorAll('div[data-attachment-id]').forEach(el => {
            if (!el.hasAttribute('keyboard-selectable')) {
                el.setAttribute('keyboard-selectable', '');
            }
        });
    }
    static setupAttachmentsSectionKeyboardHandler(containerSelector, dotNetRef) {
        VulcanUtils.initKeyboardNavProvider();
        const container = document.querySelector(containerSelector);
        if (!container)
            return;
        VulcanUtils.removeAttachmentsSectionKeyboardHandler(containerSelector);
        const handler = (event) => {
            var _a, _b, _c;
            const isKeyboardNavLocked = (_c = (_b = (_a = window.__venusKeyboardNavLockProvider) === null || _a === void 0 ? void 0 : _a.isLocked) === null || _b === void 0 ? void 0 : _b.call(_a)) !== null && _c !== void 0 ? _c : false;
            if (VulcanUtils.searchNavigationActive || isKeyboardNavLocked) {
                return;
            }
            const elements = Array.from(container.querySelectorAll('[keyboard-selectable]'));
            if (elements.length === 0)
                return;
            const currentElement = elements.find(el => el.classList.contains('keyboard-selected'));
            const currentIndex = currentElement ? elements.indexOf(currentElement) : -1;
            if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
                event.preventDefault();
                event.stopPropagation();
                if (currentIndex <= 0) {
                    currentElement === null || currentElement === void 0 ? void 0 : currentElement.classList.remove('keyboard-selected');
                    safeInvoke(dotNetRef, 'OnNavigateUpFromAttachments');
                }
                else {
                    currentElement === null || currentElement === void 0 ? void 0 : currentElement.classList.remove('keyboard-selected');
                    const prevElement = elements[currentIndex - 1];
                    prevElement.classList.add('keyboard-selected');
                    prevElement.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
                }
            }
            else if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
                event.preventDefault();
                event.stopPropagation();
                if (currentIndex >= elements.length - 1) {
                    currentElement === null || currentElement === void 0 ? void 0 : currentElement.classList.remove('keyboard-selected');
                    safeInvoke(dotNetRef, 'OnNavigateDownFromAttachments');
                }
                else {
                    currentElement === null || currentElement === void 0 ? void 0 : currentElement.classList.remove('keyboard-selected');
                    const nextElement = elements[currentIndex + 1];
                    nextElement.classList.add('keyboard-selected');
                    nextElement.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
                }
            }
            else if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey) {
                event.preventDefault();
                event.stopPropagation();
                if (currentElement) {
                    const clickTarget = currentElement.querySelector('.place-items-center');
                    (clickTarget !== null && clickTarget !== void 0 ? clickTarget : currentElement).click();
                }
            }
            else if (event.key === 'ContextMenu' || (event.key === 'Enter' && (navigator.platform.toLowerCase().includes('mac') ? event.metaKey : event.ctrlKey))) {
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
            }
            else if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                currentElement === null || currentElement === void 0 ? void 0 : currentElement.classList.remove('keyboard-selected');
                safeInvoke(dotNetRef, 'OnNavigateDownFromAttachments');
            }
        };
        container.addEventListener('keydown', handler);
        VulcanUtils.attachmentsSectionKeyboardHandlers.set(containerSelector, { handler, dotNetRef });
    }
    static removeAttachmentsSectionKeyboardHandler(containerSelector) {
        const existing = VulcanUtils.attachmentsSectionKeyboardHandlers.get(containerSelector);
        if (existing) {
            const container = document.querySelector(containerSelector);
            if (container) {
                container.removeEventListener('keydown', existing.handler);
            }
            VulcanUtils.attachmentsSectionKeyboardHandlers.delete(containerSelector);
        }
    }
    static focusAttachmentsSection(containerSelector) {
        const container = document.querySelector(containerSelector);
        if (!container)
            return;
        const firstSelectable = container.querySelector('[keyboard-selectable]');
        if (!firstSelectable)
            return;
        container.focus();
        container.querySelectorAll('.keyboard-selected').forEach(el => el.classList.remove('keyboard-selected'));
        firstSelectable.classList.add('keyboard-selected');
        firstSelectable.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
    }
    static focusAttachmentsSectionLast(containerSelector) {
        const container = document.querySelector(containerSelector);
        if (!container)
            return;
        const selectables = container.querySelectorAll('[keyboard-selectable]');
        if (selectables.length === 0)
            return;
        const lastSelectable = selectables[selectables.length - 1];
        container.focus();
        container.querySelectorAll('.keyboard-selected').forEach(el => el.classList.remove('keyboard-selected'));
        lastSelectable.classList.add('keyboard-selected');
        lastSelectable.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
    }
    static clearAttachmentsKeyboardSelection() {
        for (const selector of VulcanUtils.attachmentsSectionKeyboardHandlers.keys()) {
            const container = document.querySelector(selector);
            if (container) {
                container.querySelectorAll('.keyboard-selected').forEach(el => el.classList.remove('keyboard-selected'));
            }
        }
    }
    static startScrolling() {
        if (VulcanUtils.scrollInterval !== null) {
            return;
        }
        const plexAndContentArea = document.getElementById('plex-and-content-area');
        let toScroll = plexAndContentArea;
        if (plexAndContentArea.scrollHeight <= plexAndContentArea.clientHeight) {
            toScroll = document.getElementById('contentAreaInner');
        }
        function stopAutoScrollOnUserInteraction() {
            VulcanUtils.stopScrolling();
        }
        toScroll.addEventListener('wheel', stopAutoScrollOnUserInteraction, { passive: true });
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
        VulcanUtils.scrollInterval = window.setInterval(() => {
            const targetScroll = document.getElementById('plex-and-content-area');
            if (!targetScroll) {
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
    static stopScrolling() {
        if (VulcanUtils.scrollInterval !== null) {
            clearInterval(VulcanUtils.scrollInterval);
            VulcanUtils.scrollInterval = null;
        }
    }
    static detectInputActivity(dotNetReference) {
        this.inputActivityDotNetReference = dotNetReference;
        window.addEventListener('touchstart', this.handleInputEvent);
        window.addEventListener('mousedown', this.handleInputEvent);
        window.addEventListener('mousemove', this.handleInputEvent);
        window.addEventListener('keypress', this.handleInputEvent);
    }
    static saveCurrentScrollPosition() {
        if (VulcanUtils.currentEntityId) {
            const scrollPercentage = VulcanUtils.getContentAreaScrollPosition();
            VulcanUtils.scrollPositions.set(VulcanUtils.currentEntityId, scrollPercentage);
        }
    }
    static savePreRenderScrollPosition() {
        if (VulcanUtils.preRenderScrollPct === null) {
            VulcanUtils.preRenderScrollPct = VulcanUtils.getContentAreaScrollPosition();
        }
    }
    static registerCurrentEntity(entityId) {
        VulcanUtils.currentEntityId = entityId;
        if (!VulcanUtils.scrollHandler) {
            VulcanUtils.setupScrollTracking();
        }
    }
    static setupScrollTracking() {
        VulcanUtils.scrollHandler = () => {
            if (VulcanUtils.currentEntityId) {
                const scrollPercentage = VulcanUtils.getContentAreaScrollPosition();
                VulcanUtils.scrollPositions.set(VulcanUtils.currentEntityId, scrollPercentage);
                if (scrollPercentage > 0 && Math.floor(scrollPercentage / 10) !== Math.floor((VulcanUtils.scrollPositions.get(VulcanUtils.currentEntityId) || 0) / 10)) {
                }
            }
        };
        const contentAreaInner = document.getElementById('contentAreaInner');
        const plexAndContentArea = document.getElementById('plex-and-content-area');
        if (contentAreaInner) {
            contentAreaInner.addEventListener('scroll', VulcanUtils.scrollHandler, { passive: true });
        }
        if (plexAndContentArea) {
            plexAndContentArea.addEventListener('scroll', VulcanUtils.scrollHandler, { passive: true });
        }
    }
    static getSavedScrollPosition(entityType, entityId) {
        const key = `${entityType}_${entityId}`;
        const position = VulcanUtils.scrollPositions.get(key) || 0;
        return position;
    }
    static getScrollPercentage(element) {
        const scrollableHeight = element.scrollHeight - element.clientHeight;
        if (scrollableHeight <= 0) {
            return 0;
        }
        const percentage = (element.scrollTop / scrollableHeight) * 100;
        return Math.min(100, Math.max(0, percentage));
    }
    static setScrollPercentage(element, percentage) {
        const scrollableHeight = element.scrollHeight - element.clientHeight;
        if (scrollableHeight > 0) {
            const clampedPercentage = Math.min(100, Math.max(0, percentage));
            element.scrollTop = (clampedPercentage / 100) * scrollableHeight;
        }
    }
    static getContentAreaScrollPosition() {
        const contentAreaInner = document.getElementById('contentAreaInner');
        if (!contentAreaInner) {
            return 0;
        }
        if (contentAreaInner.scrollHeight > contentAreaInner.clientHeight) {
            const percentage = VulcanUtils.getScrollPercentage(contentAreaInner);
            return percentage;
        }
        const plexAndContentArea = document.getElementById('plex-and-content-area');
        if (plexAndContentArea && plexAndContentArea.scrollHeight > plexAndContentArea.clientHeight) {
            const percentage = VulcanUtils.getScrollPercentage(plexAndContentArea);
            return percentage;
        }
        return 0;
    }
    static setContentAreaScrollPosition(percentage) {
        const contentAreaInner = document.getElementById('contentAreaInner');
        if (!contentAreaInner) {
            return;
        }
        if (contentAreaInner.scrollHeight > contentAreaInner.clientHeight) {
            VulcanUtils.setScrollPercentage(contentAreaInner, percentage);
            if (VulcanUtils.currentEntityId) {
                VulcanUtils.scrollPositions.set(VulcanUtils.currentEntityId, percentage);
            }
            return;
        }
        const plexAndContentArea = document.getElementById('plex-and-content-area');
        if (plexAndContentArea && plexAndContentArea.scrollHeight > plexAndContentArea.clientHeight) {
            VulcanUtils.setScrollPercentage(plexAndContentArea, percentage);
            if (VulcanUtils.currentEntityId) {
                VulcanUtils.scrollPositions.set(VulcanUtils.currentEntityId, percentage);
            }
        }
        else {
        }
    }
    static resetContentAreaScrollToTop() {
        VulcanUtils.setContentAreaScrollPosition(0);
    }
    static startWindowScrollResetGuard(intervalMs = 500) {
        VulcanUtils.stopWindowScrollResetGuard();
        const resetScroll = () => {
            if (window.scrollX !== 0 || window.scrollY !== 0) {
                window.scrollTo(0, 0);
            }
            if (document.documentElement.scrollTop !== 0) {
                document.documentElement.scrollTop = 0;
            }
            if (document.body.scrollTop !== 0) {
                document.body.scrollTop = 0;
            }
        };
        VulcanUtils.windowScrollResetHandler = resetScroll;
        window.addEventListener('scroll', resetScroll, { passive: true });
        document.addEventListener('scroll', resetScroll, { passive: true });
        VulcanUtils.windowScrollResetGuardInterval = window.setInterval(resetScroll, intervalMs);
    }
    static stopWindowScrollResetGuard() {
        if (VulcanUtils.windowScrollResetHandler !== null) {
            window.removeEventListener('scroll', VulcanUtils.windowScrollResetHandler);
            document.removeEventListener('scroll', VulcanUtils.windowScrollResetHandler);
            VulcanUtils.windowScrollResetHandler = null;
        }
        if (VulcanUtils.windowScrollResetGuardInterval !== null) {
            window.clearInterval(VulcanUtils.windowScrollResetGuardInterval);
            VulcanUtils.windowScrollResetGuardInterval = null;
        }
    }
    static restoreScrollForCurrentEntity() {
        var _a, _b;
        if (VulcanUtils.currentEntityId) {
            const savedPercentage = (_b = (_a = VulcanUtils.preRenderScrollPct) !== null && _a !== void 0 ? _a : VulcanUtils.scrollPositions.get(VulcanUtils.currentEntityId)) !== null && _b !== void 0 ? _b : 0;
            VulcanUtils.preRenderScrollPct = null;
            VulcanUtils.setContentAreaScrollPosition(savedPercentage);
        }
    }
    static registerSearchPasteHandler(elementId, dotNetReference) {
        try {
            const el = document.getElementById(elementId);
            if (!el) {
                return;
            }
            const handler = (e) => {
                try {
                    const text = e.clipboardData && e.clipboardData.getData ? (e.clipboardData.getData('text') || '') : '';
                    if (!text) {
                        return;
                    }
                    const trimmed = text.trim();
                    if (!trimmed) {
                        return;
                    }
                    e.preventDefault();
                    if (dotNetReference) {
                        safeInvokeAsync(dotNetReference, 'OnSearchInputPasteAsync', [trimmed])
                            .then((handled) => {
                            var _a, _b;
                            if (!handled) {
                                try {
                                    const start = ((_a = el.selectionStart) !== null && _a !== void 0 ? _a : el.value.length);
                                    const end = ((_b = el.selectionEnd) !== null && _b !== void 0 ? _b : start);
                                    const before = el.value.substring(0, start);
                                    const after = el.value.substring(end);
                                    el.value = before + trimmed + after;
                                    const caret = start + trimmed.length;
                                    el.selectionStart = el.selectionEnd = caret;
                                    const evt = new Event('input', { bubbles: true });
                                    el.dispatchEvent(evt);
                                }
                                catch (_c) { }
                            }
                        });
                    }
                }
                catch (_a) { }
            };
            VulcanUtils.searchPasteHandlers.set(elementId, handler);
            el.addEventListener('paste', handler);
        }
        catch (_a) { }
    }
    static unregisterSearchPasteHandler(elementId) {
        try {
            const el = document.getElementById(elementId);
            const handler = VulcanUtils.searchPasteHandlers.get(elementId);
            if (el && handler) {
                el.removeEventListener('paste', handler);
            }
            VulcanUtils.searchPasteHandlers.delete(elementId);
        }
        catch (_a) { }
    }
    static setAttachmentsScale(wrapper, scalePercent) {
        if (!wrapper) {
            return;
        }
        const content = wrapper.querySelector(':scope > .attachments-and-note-section-scale-content');
        const spacer = wrapper.querySelector(':scope > .attachments-and-note-section-scale-spacer');
        if (!content) {
            return;
        }
        const numeric = Number(scalePercent);
        const clampedPercent = Number.isFinite(numeric) ? Math.min(200, Math.max(50, numeric)) : 100;
        const scale = clampedPercent / 100;
        const existingObserver = wrapper.__attachmentsScaleObserver;
        if (existingObserver) {
            existingObserver.disconnect();
            wrapper.__attachmentsScaleObserver = undefined;
        }
        content.style.transformOrigin = 'top left';
        if (Math.abs(scale - 1) < 0.0001) {
            content.style.transform = '';
            content.style.width = '';
            content.style.maxWidth = '';
            content.style.maxHeight = '';
            wrapper.style.height = '';
            if (spacer) {
                spacer.style.height = '';
            }
            return;
        }
        const inversePercent = (100 / scale).toFixed(5);
        content.style.transform = `scale(${scale})`;
        content.style.width = `${inversePercent}%`;
        content.style.maxWidth = 'none';
        content.style.maxHeight = 'none';
        wrapper.style.height = '';
        const updateSpacer = () => {
            if (!spacer) {
                return;
            }
            const baseHeight = content.scrollHeight;
            const extra = Math.max(0, (scale - 1) * baseHeight);
            spacer.style.height = `${extra}px`;
        };
        updateSpacer();
        const observer = new ResizeObserver(() => updateSpacer());
        observer.observe(content);
        wrapper.__attachmentsScaleObserver = observer;
    }
    static observeContentAreaHeight(dotNetRef, elementId, threshold) {
        VulcanUtils.removeContentAreaHeightObserver();
        const element = document.getElementById(elementId);
        if (!element)
            return;
        VulcanUtils.contentAreaHeightDotNetRef = dotNetRef;
        let lastBelowThreshold = null;
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
    static removeContentAreaHeightObserver() {
        if (VulcanUtils.contentAreaHeightObserver) {
            VulcanUtils.contentAreaHeightObserver.disconnect();
            VulcanUtils.contentAreaHeightObserver = null;
        }
        VulcanUtils.contentAreaHeightDotNetRef = null;
    }
    static setupDragScroll(elementId) {
        const container = document.getElementById(elementId);
        if (!container)
            return;
        VulcanUtils.cleanupDragScroll(elementId);
        const edgeSize = 50;
        const scrollSpeed = 8;
        let scrollInterval = null;
        const handleDragOver = (e) => {
            const rect = container.getBoundingClientRect();
            const mouseY = e.clientY;
            const distFromTop = mouseY - rect.top;
            const distFromBottom = rect.bottom - mouseY;
            if (scrollInterval !== null) {
                cancelAnimationFrame(scrollInterval);
                scrollInterval = null;
            }
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
        VulcanUtils.dragScrollCleanups.set(elementId, () => {
            container.removeEventListener('dragover', handleDragOver);
            document.removeEventListener('dragend', handleDragEnd);
            document.removeEventListener('drop', handleDragEnd);
            if (scrollInterval !== null) {
                cancelAnimationFrame(scrollInterval);
            }
        });
    }
    static cleanupDragScroll(elementId) {
        const cleanup = VulcanUtils.dragScrollCleanups.get(elementId);
        if (cleanup) {
            cleanup();
            VulcanUtils.dragScrollCleanups.delete(elementId);
        }
    }
    static attachLinkInterceptor(containerId, dotNetRef, method) {
        const container = document.getElementById(containerId);
        if (!container || !dotNetRef || !method) {
            return;
        }
        VulcanUtils.detachLinkInterceptor(containerId);
        const handler = (event) => {
            const target = event.target;
            if (!target)
                return;
            const anchor = target.closest('a');
            if (!anchor)
                return;
            const href = anchor.getAttribute('href');
            if (!href)
                return;
            event.preventDefault();
            event.stopPropagation();
            safeInvoke(dotNetRef, method, [href]);
        };
        container.addEventListener('click', handler);
        VulcanUtils.linkInterceptors.set(containerId, { container, handler });
    }
    static detachLinkInterceptor(containerId) {
        const interceptor = VulcanUtils.linkInterceptors.get(containerId);
        if (interceptor) {
            interceptor.container.removeEventListener('click', interceptor.handler);
            VulcanUtils.linkInterceptors.delete(containerId);
        }
    }
    static setupContentAreaClickToFocus(elementId) {
        VulcanUtils.removeContentAreaClickToFocus();
        const element = document.getElementById(elementId);
        if (!element)
            return;
        const handler = (e) => {
            var _a;
            const target = e.target;
            if (!target)
                return;
            if (target.closest('input, textarea, select, button, a, [contenteditable="true"], [role="button"], [keyboard-selectable], .ql-editor')) {
                return;
            }
            const editor = element.querySelector('.ql-editor');
            if (!editor)
                return;
            const editorRect = editor.getBoundingClientRect();
            if (e.clientY <= editorRect.bottom)
                return;
            const scrollContainer = editor.closest('#contentAreaInner');
            const savedScrollTop = (_a = scrollContainer === null || scrollContainer === void 0 ? void 0 : scrollContainer.scrollTop) !== null && _a !== void 0 ? _a : 0;
            const savedEditorScrollTop = editor.scrollTop;
            editor.focus({ preventScroll: true });
            const sel = window.getSelection();
            if (sel) {
                sel.selectAllChildren(editor);
                sel.collapseToEnd();
            }
            if (scrollContainer)
                scrollContainer.scrollTop = savedScrollTop;
            editor.scrollTop = savedEditorScrollTop;
        };
        element.addEventListener('click', handler);
        VulcanUtils.contentAreaClickHandler = { element, handler };
    }
    static removeContentAreaClickToFocus() {
        if (VulcanUtils.contentAreaClickHandler) {
            VulcanUtils.contentAreaClickHandler.element.removeEventListener('click', VulcanUtils.contentAreaClickHandler.handler);
            VulcanUtils.contentAreaClickHandler = null;
        }
    }
    static printHtmlContent(htmlContent, title) {
        const iframe = document.createElement("iframe");
        iframe.style.position = "fixed";
        iframe.style.left = "-9999px";
        iframe.style.top = "-9999px";
        iframe.style.width = "0";
        iframe.style.height = "0";
        document.body.appendChild(iframe);
        const iframeWindow = iframe.contentWindow;
        const doc = iframe.contentDocument || (iframeWindow === null || iframeWindow === void 0 ? void 0 : iframeWindow.document);
        if (!doc || !iframeWindow) {
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
VulcanUtils.currentEntityId = '';
VulcanUtils.scrollPositions = new Map();
VulcanUtils.scrollHandler = null;
VulcanUtils.preRenderScrollPct = null;
VulcanUtils.scrollInterval = null;
VulcanUtils.scrollSpeed = 200;
VulcanUtils.windowScrollResetGuardInterval = null;
VulcanUtils.windowScrollResetHandler = null;
VulcanUtils.searchNavigationActive = false;
VulcanUtils.mentionsSectionKeyboardHandlers = new Map();
VulcanUtils.attachmentsSectionKeyboardHandlers = new Map();
VulcanUtils.lastInputActivityTime = 0;
VulcanUtils.handleInputEvent = (event) => {
    if (VulcanUtils.inputActivityDotNetReference) {
        const now = Date.now();
        if (VulcanUtils.lastInputActivityTime && now - VulcanUtils.lastInputActivityTime < 100) {
            return;
        }
        safeInvoke(VulcanUtils.inputActivityDotNetReference, 'OnInputActivity', [event.type]);
    }
};
VulcanUtils.searchPasteHandlers = new Map();
VulcanUtils.contentAreaHeightObserver = null;
VulcanUtils.contentAreaHeightDotNetRef = null;
VulcanUtils.dragScrollCleanups = new Map();
VulcanUtils.linkInterceptors = new Map();
VulcanUtils.contentAreaClickHandler = null;
//# sourceMappingURL=vulcanUtils.js.map