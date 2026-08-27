import { safeInvoke } from "./interop.js";
export class AiChatUtils {
    static enableAutoScroll(containerId) {
        AiChatUtils.autoScrollEnabled = true;
        AiChatUtils.scrollContainer = document.getElementById(containerId);
        if (!AiChatUtils.scrollContainer) {
            console.warn(`AiChatUtils: Container with ID '${containerId}' not found`);
            return;
        }
        AiChatUtils.scrollContainer.addEventListener('scroll', AiChatUtils.onUserScroll, { passive: true });
    }
    static scrollToBottom(containerId) {
        if (!AiChatUtils.autoScrollEnabled) {
            return;
        }
        const container = document.getElementById(containerId);
        if (!container) {
            console.warn(`AiChatUtils: Container with ID '${containerId}' not found`);
            return;
        }
        container.scrollTo({
            top: container.scrollHeight,
            behavior: 'auto'
        });
    }
    static scrollToBottomForced(containerId) {
        const container = document.getElementById(containerId);
        if (!container) {
            console.warn(`AiChatUtils: Container with ID '${containerId}' not found`);
            return;
        }
        AiChatUtils.autoScrollEnabled = true;
        container.scrollTo({
            top: container.scrollHeight,
            behavior: 'smooth'
        });
    }
    static resetAutoScroll(containerId) {
        AiChatUtils.autoScrollEnabled = true;
        AiChatUtils.scrollToBottom(containerId);
    }
    static scrollElementIntoView(elementId) {
        const element = document.getElementById(elementId);
        if (element) {
            element.scrollIntoView({ block: 'nearest', behavior: 'instant' });
        }
    }
    static attachLinkInterceptor(containerId, dotNetRef, method) {
        const container = document.getElementById(containerId);
        if (!container || !dotNetRef || !method) {
            console.warn(`AiChatUtils: attachLinkInterceptor missing container or dotNetRef for '${containerId}'`);
            return;
        }
        if (AiChatUtils.linkInterceptor) {
            AiChatUtils.linkInterceptor.container.removeEventListener('click', AiChatUtils.linkInterceptor.handler);
            AiChatUtils.linkInterceptor = null;
        }
        const handler = (event) => {
            const target = event.target;
            if (!target) {
                return;
            }
            const anchor = target.closest('a');
            if (!anchor) {
                return;
            }
            const href = anchor.getAttribute('href');
            if (!href) {
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            safeInvoke(dotNetRef, method, [href]);
        };
        container.addEventListener('click', handler);
        AiChatUtils.linkInterceptor = { container, handler };
    }
    static cleanup() {
        if (AiChatUtils.scrollContainer) {
            AiChatUtils.scrollContainer.removeEventListener('scroll', AiChatUtils.onUserScroll);
            AiChatUtils.scrollContainer = null;
        }
        if (AiChatUtils.inputBlockObserver) {
            AiChatUtils.inputBlockObserver.disconnect();
            AiChatUtils.inputBlockObserver = null;
        }
        if (AiChatUtils.linkInterceptor) {
            AiChatUtils.linkInterceptor.container.removeEventListener('click', AiChatUtils.linkInterceptor.handler);
            AiChatUtils.linkInterceptor = null;
        }
        AiChatUtils.disconnectSentinel();
        AiChatUtils.autoScrollEnabled = true;
    }
    static autoResizeTextarea(textareaId, minRows = 1, maxRows = 10) {
        const textarea = document.getElementById(textareaId);
        if (!textarea) {
            console.warn(`AiChatUtils: Textarea with ID '${textareaId}' not found`);
            return;
        }
        const scrollPos = textarea.scrollTop;
        textarea.style.height = 'auto';
        const computedStyle = getComputedStyle(textarea);
        const lineHeight = parseFloat(computedStyle.lineHeight);
        const paddingTop = parseFloat(computedStyle.paddingTop);
        const paddingBottom = parseFloat(computedStyle.paddingBottom);
        const minHeight = (lineHeight * minRows) + paddingTop + paddingBottom;
        const maxHeight = (lineHeight * maxRows) + paddingTop + paddingBottom;
        const contentHeight = textarea.scrollHeight;
        const newHeight = Math.min(Math.max(contentHeight, minHeight), maxHeight);
        textarea.style.height = `${newHeight}px`;
        textarea.style.overflowY = contentHeight > maxHeight ? 'auto' : 'hidden';
        textarea.scrollTop = scrollPos;
    }
    static setupTextareaAutoResize(textareaId, minRows = 1, maxRows = 10) {
        const textarea = document.getElementById(textareaId);
        if (!textarea) {
            console.warn(`AiChatUtils: Textarea with ID '${textareaId}' not found`);
            return;
        }
        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
            }
            const slashMenuOpen = textarea.getAttribute('data-slash-menu-open') === 'true';
            const mentionMenuOpen = textarea.getAttribute('data-mention-menu-open') === 'true';
            if ((slashMenuOpen || mentionMenuOpen) && (e.key === 'ArrowUp' || e.key === 'ArrowDown' || (e.ctrlKey && (e.key === 'n' || e.key === 'p')))) {
                e.preventDefault();
            }
        });
        AiChatUtils.autoResizeTextarea(textareaId, minRows, maxRows);
    }
    static observeInputBlockHeight(inputBlockSelector, chatContainerId) {
        const inputBlock = document.querySelector(inputBlockSelector);
        const chatContainer = document.getElementById(chatContainerId);
        if (!inputBlock || !chatContainer) {
            console.warn(`AiChatUtils: Could not find input block or chat container`);
            return;
        }
        const resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const inputBlockHeight = entry.target.getBoundingClientRect().height;
                const bottomOffset = 16;
                const bufferSpace = 16;
                const totalPadding = inputBlockHeight + bottomOffset + bufferSpace;
                const root = chatContainer.parentElement;
                if (root) {
                    root.style.setProperty('--input-block-height', `${totalPadding}px`);
                    root.style.setProperty('--input-bar-height', `${inputBlockHeight}px`);
                }
            }
        });
        resizeObserver.observe(inputBlock);
        AiChatUtils.inputBlockObserver = resizeObserver;
    }
    static getContentEditableText(elementId) {
        const element = document.getElementById(elementId);
        if (!element)
            return '';
        let result = '';
        const walkNodes = (node) => {
            if (node.nodeType === Node.TEXT_NODE) {
                result += node.textContent || '';
            }
            else if (node.nodeType === Node.ELEMENT_NODE) {
                const el = node;
                if (el.classList.contains('thought-ref')) {
                    const thoughtId = el.getAttribute('data-thought-id');
                    const thoughtName = el.textContent;
                    result += `[[thought:${thoughtId}|${thoughtName}]]`;
                }
                else if (el.tagName === 'BR') {
                    result += '\n';
                }
                else {
                    const isBlock = ['DIV', 'P'].includes(el.tagName);
                    if (isBlock && result.length > 0 && !result.endsWith('\n')) {
                        result += '\n';
                    }
                    for (const child of el.childNodes) {
                        walkNodes(child);
                    }
                }
            }
        };
        for (const child of element.childNodes) {
            walkNodes(child);
        }
        return result.replace(/^\s+$/, '').replace(/\n+$/, '');
    }
    static insertThoughtMention(elementId, thoughtId, thoughtName, charsToDelete, iconUrl = null) {
        const element = document.getElementById(elementId);
        if (!element)
            return;
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0)
            return;
        for (let i = 0; i < charsToDelete; i++) {
            selection.modify('extend', 'backward', 'character');
        }
        const range = selection.getRangeAt(0);
        range.deleteContents();
        const span = document.createElement('span');
        span.className = 'thought-ref bg-vapp-accent-primary/20 text-vapp-accent-primary border border-vapp-accent-primary/30 rounded-md px-1 inline-flex items-center gap-1';
        span.setAttribute('data-thought-id', thoughtId);
        span.setAttribute('contenteditable', 'false');
        if (iconUrl) {
            const img = document.createElement('img');
            img.src = iconUrl;
            img.className = 'w-4 h-4 rounded-sm inline-block';
            img.loading = 'lazy';
            span.appendChild(img);
        }
        span.appendChild(document.createTextNode(`${thoughtName}`));
        range.insertNode(span);
        range.setStartAfter(span);
        range.setEndAfter(span);
        selection.removeAllRanges();
        selection.addRange(range);
        const space = document.createTextNode(' ');
        range.insertNode(space);
        range.setStartAfter(space);
        range.setEndAfter(space);
        selection.removeAllRanges();
        selection.addRange(range);
        element.focus();
    }
    static autoResizeContentEditable(elementId) {
        const element = document.getElementById(elementId);
        if (!element)
            return;
        const currentHeight = element.getBoundingClientRect().height;
        const previousInlineTransition = element.style.transition;
        element.style.transition = 'none';
        element.style.height = 'auto';
        const computedStyle = getComputedStyle(element);
        const minHeight = parseFloat(computedStyle.minHeight) || 24;
        const maxHeight = parseFloat(computedStyle.maxHeight) || 240;
        const contentHeight = element.scrollHeight;
        const newHeight = Math.min(Math.max(contentHeight, minHeight), maxHeight);
        element.style.height = `${currentHeight}px`;
        void element.offsetHeight;
        element.style.transition = previousInlineTransition;
        element.style.height = `${newHeight}px`;
        element.style.overflowY = contentHeight > maxHeight ? 'auto' : 'hidden';
    }
    static setupContentEditable(elementId) {
        const element = document.getElementById(elementId);
        if (!element)
            return;
        element.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
            }
            const slashMenuOpen = element.getAttribute('data-slash-menu-open') === 'true';
            const mentionMenuOpen = element.getAttribute('data-mention-menu-open') === 'true';
            if ((slashMenuOpen || mentionMenuOpen) &&
                (e.key === 'ArrowUp' || e.key === 'ArrowDown' || (e.ctrlKey && (e.key === 'n' || e.key === 'p')))) {
                e.preventDefault();
            }
        });
        AiChatUtils.autoResizeContentEditable(elementId);
    }
    static setContentEditableText(elementId, text) {
        const element = document.getElementById(elementId);
        if (!element)
            return;
        element.textContent = text;
    }
    static focusContentEditable(elementId) {
        const element = document.getElementById(elementId);
        if (!element)
            return;
        element.focus();
        const selection = window.getSelection();
        if (selection) {
            const range = document.createRange();
            range.selectNodeContents(element);
            range.collapse(false);
            selection.removeAllRanges();
            selection.addRange(range);
        }
    }
    static initScriptEditor(elementId, instruction, builtInVars) {
        const element = document.getElementById(elementId);
        if (!element)
            return;
        if (!instruction || instruction.trim() === '') {
            element.innerHTML = '<br>';
            return;
        }
        const escaped = instruction
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\n/g, '<br>');
        const html = escaped.replace(/\{(\w+)\}/g, (match, varName) => {
            const isBuiltIn = builtInVars.includes(varName);
            const colorClass = isBuiltIn
                ? 'bg-vapp-accent-primary/10 text-vapp-accent-primary border-vapp-accent-primary'
                : 'bg-vapp-accent-secondary/10 text-vapp-accent-secondary border-vapp-accent-secondary';
            return `<span class="script-var inline-flex items-center gap-0.5 px-1.5 py-0.5 mx-0.5 rounded-full text-sm font-medium border ${colorClass}" contenteditable="false" data-var="${varName}"><span class="opacity-75 text-xs">{</span>${varName}<span class="opacity-75 text-xs">}</span></span>`;
        });
        element.innerHTML = html;
        element.addEventListener('paste', (e) => {
            var _a;
            e.preventDefault();
            const text = ((_a = e.clipboardData) === null || _a === void 0 ? void 0 : _a.getData('text/plain')) || '';
            document.execCommand('insertText', false, text);
        });
    }
    static insertScriptVariable(elementId, varName, isBuiltIn) {
        const element = document.getElementById(elementId);
        if (!element)
            return;
        const colorClass = isBuiltIn
            ? 'bg-vapp-accent-primary/10 text-vapp-accent-primary border-vapp-accent-primary'
            : 'bg-vapp-accent-secondary/10 text-vapp-accent-secondary border-vapp-accent-secondary';
        const span = document.createElement('span');
        span.className = `script-var inline-flex items-center gap-0.5 px-1.5 py-0.5 mx-0.5 rounded-full text-sm font-medium border ${colorClass}`;
        span.contentEditable = 'false';
        span.dataset.var = varName;
        span.innerHTML = `<span class="opacity-75 text-xs">{</span>${varName}<span class="opacity-75 text-xs">}</span>`;
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0 && element.contains(selection.anchorNode)) {
            const range = selection.getRangeAt(0);
            range.deleteContents();
            range.insertNode(span);
            const space = document.createTextNode(' ');
            range.setStartAfter(span);
            range.insertNode(space);
            range.setStartAfter(space);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
        }
        else {
            element.appendChild(span);
            element.appendChild(document.createTextNode(' '));
        }
        element.focus();
    }
    static getScriptEditorText(elementId) {
        const element = document.getElementById(elementId);
        if (!element)
            return '';
        let result = '';
        const walk = (node) => {
            if (node.nodeType === Node.TEXT_NODE) {
                result += node.textContent;
            }
            else if (node.nodeType === Node.ELEMENT_NODE) {
                const el = node;
                if (el.classList.contains('script-var')) {
                    result += `{${el.dataset.var}}`;
                }
                else if (el.tagName === 'BR') {
                    result += '\n';
                }
                else if (el.tagName === 'DIV' || el.tagName === 'P') {
                    if (result.length > 0 && !result.endsWith('\n')) {
                        result += '\n';
                    }
                    node.childNodes.forEach(walk);
                }
                else {
                    node.childNodes.forEach(walk);
                }
            }
        };
        element.childNodes.forEach(walk);
        return result;
    }
    static initScriptCodeEditor(elementId, lineNumbersElementId, code, dotNetRef) {
        var _a;
        const element = document.getElementById(elementId);
        if (!element)
            return;
        const state = element._codeEditorState || { isUpdating: false, debounceTimer: null };
        state.dotNetRef = dotNetRef;
        state.lineNumbersElement = lineNumbersElementId ? document.getElementById(lineNumbersElementId) : null;
        state.measureElement = this.ensureCodeEditorMeasureElement(element, state.measureElement);
        state.undoStack = [];
        state.redoStack = [];
        state.pendingSnapshot = null;
        state.lastPlainText = '';
        state.errorEntries = [];
        state.errorText = '';
        state.pendingErrors = null;
        state.vimEnabled = false;
        state.vimMode = 'insert';
        state.vimPending = null;
        state.vimYank = null;
        state.vimFind = null;
        state.vimReplaceSelection = null;
        state.vimMouseDown = false;
        state.vimMouseDragging = false;
        state.vimVisualMode = 'none';
        state.vimVisualAnchor = null;
        state.vimVisualCursor = null;
        state.vimHasFocus = document.activeElement === element;
        state.vimCaretUpdateInProgress = false;
        state.vimCaretUpdatePending = false;
        if (state.errorTimer) {
            clearTimeout(state.errorTimer);
        }
        state.errorTimer = null;
        if (state.resizeObserver) {
            state.resizeObserver.disconnect();
        }
        if (window.ResizeObserver) {
            state.resizeObserver = new ResizeObserver(() => {
                const plainText = this.getScriptCodeEditorText(elementId);
                this.updateCodeEditorLineNumbers(state.lineNumbersElement, plainText, element, state.measureElement);
            });
            state.resizeObserver.observe(element);
        }
        if (state.scrollSyncHandler) {
            (_a = state.scrollPane) === null || _a === void 0 ? void 0 : _a.removeEventListener('scroll', state.scrollSyncHandler);
        }
        const pane = element.closest('.script-code-editor-pane');
        if (pane && state.lineNumbersElement) {
            state.scrollPane = pane;
            state.scrollSyncHandler = () => {
                if (state.lineNumbersElement) {
                    state.lineNumbersElement.scrollTop = pane.scrollTop;
                }
            };
            pane.addEventListener('scroll', state.scrollSyncHandler, { passive: true });
        }
        element._codeEditorState = state;
        this.setScriptCodeEditorText(elementId, code);
        state.lastPlainText = this.getScriptCodeEditorText(elementId);
        const maxUndoEntries = 200;
        const pushUndoSnapshot = (snapshot) => {
            if (!snapshot)
                return;
            const last = state.undoStack.length > 0 ? state.undoStack[state.undoStack.length - 1] : null;
            if (last && last.text === snapshot.text)
                return;
            state.undoStack.push(snapshot);
            if (state.undoStack.length > maxUndoEntries) {
                state.undoStack.shift();
            }
        };
        const captureSnapshot = () => {
            return {
                text: this.getScriptCodeEditorText(elementId),
                selection: this.getCodeEditorSelectionOffsets(element)
            };
        };
        const recordUndoSnapshot = (snapshot) => {
            pushUndoSnapshot(snapshot);
            state.redoStack = [];
            state.pendingSnapshot = null;
        };
        const normalizeSelection = (selection, textLength) => {
            if (!selection) {
                return { start: textLength, end: textLength };
            }
            const start = Math.max(0, Math.min(selection.start, textLength));
            const end = Math.max(0, Math.min(selection.end, textLength));
            return start <= end ? { start, end } : { start: end, end: start };
        };
        const applyUpdate = (updatedText, start, end) => {
            state.isUpdating = true;
            const errorEntries = state.errorText === updatedText ? state.errorEntries : null;
            element.innerHTML = this.highlightScriptCode(updatedText, errorEntries) || '';
            this.setCodeEditorSelectionOffsets(element, start, end);
            this.updateCodeEditorLineNumbers(state.lineNumbersElement, updatedText, element, state.measureElement);
            state.isUpdating = false;
            state.pendingSnapshot = null;
            state.lastPlainText = updatedText;
            scheduleVimCaretUpdate();
            scheduleCaretScroll(end);
            if (state.dotNetRef) {
                if (state.debounceTimer)
                    clearTimeout(state.debounceTimer);
                state.debounceTimer = setTimeout(() => {
                    safeInvoke(state.dotNetRef, 'OnCodeEditorTextChanged', [updatedText]);
                }, 150);
            }
        };
        const applySnapshot = (snapshot) => {
            if (!snapshot)
                return;
            const selection = normalizeSelection(snapshot.selection, snapshot.text.length);
            applyUpdate(snapshot.text, selection.start, selection.end);
        };
        const undo = () => {
            const snapshot = state.undoStack.pop();
            if (!snapshot)
                return;
            state.redoStack.push(captureSnapshot());
            applySnapshot(snapshot);
        };
        const redo = () => {
            const snapshot = state.redoStack.pop();
            if (!snapshot)
                return;
            state.undoStack.push(captureSnapshot());
            applySnapshot(snapshot);
        };
        const setVimMode = (mode) => {
            if (state.vimMode === mode)
                return;
            state.vimMode = mode;
            state.vimPending = null;
            if (mode === 'insert') {
                state.vimVisualMode = 'none';
                state.vimVisualAnchor = null;
                state.vimVisualCursor = null;
            }
            if (state.dotNetRef) {
                safeInvoke(state.dotNetRef, 'OnCodeEditorVimModeChanged', [mode]);
            }
            updateVimCaret();
        };
        const ensureVimCaretElement = () => {
            if (state.vimCaretElement && state.vimCaretElement.parentElement === element) {
                return state.vimCaretElement;
            }
            const caret = document.createElement('div');
            caret.className = 'script-code-editor-caret-block';
            caret.setAttribute('contenteditable', 'false');
            element.appendChild(caret);
            state.vimCaretElement = caret;
            return caret;
        };
        const updateVimCaret = () => {
            if (state.vimCaretUpdateInProgress)
                return;
            if (!state.vimEnabled || state.vimMode !== 'normal') {
                if (state.vimCaretElement) {
                    state.vimCaretElement.style.display = 'none';
                }
                element.classList.remove('vim-normal');
                element.classList.remove('vim-moving');
                return;
            }
            state.vimCaretUpdateInProgress = true;
            try {
                element.classList.add('vim-normal');
                const selection = window.getSelection();
                if (!selection || selection.rangeCount === 0) {
                    if (state.vimCaretElement) {
                        state.vimCaretElement.style.display = 'none';
                    }
                    return;
                }
                if (!selection.isCollapsed) {
                    const inVisual = state.vimVisualMode && state.vimVisualMode !== 'none';
                    if (state.vimMouseDragging && !inVisual) {
                        if (state.vimCaretElement) {
                            state.vimCaretElement.style.display = 'none';
                        }
                        return;
                    }
                    const elementRect = element.getBoundingClientRect();
                    const style = window.getComputedStyle(element);
                    const fontSize = parseFloat(style.fontSize) || 14;
                    const lineHeight = parseFloat(style.lineHeight) || fontSize * 1.2;
                    const minWidth = Math.max(6, Math.round(fontSize * 0.6));
                    const applyCaretRect = (rect) => {
                        const caret = ensureVimCaretElement();
                        caret.style.width = `${minWidth}px`;
                        caret.style.height = `${lineHeight}px`;
                        caret.style.left = `${rect.left - elementRect.left + element.scrollLeft}px`;
                        caret.style.top = `${rect.top - elementRect.top + element.scrollTop}px`;
                        caret.style.display = 'block';
                    };
                    let rect = null;
                    if (inVisual && state.vimVisualCursor !== null && state.vimVisualCursor !== undefined) {
                        const selectionOffsets = this.getCodeEditorSelectionOffsets(element);
                        const caretOffset = Math.max(0, Math.min(state.vimVisualCursor, this.getScriptCodeEditorText(elementId).length));
                        const pos = this.getCodeEditorPositionForOffset(element, caretOffset);
                        const range = document.createRange();
                        range.setStart(pos.container, pos.offset);
                        range.collapse(true);
                        rect = range.getClientRects()[0] || range.getBoundingClientRect();
                        if (!rect || (!rect.width && !rect.height)) {
                            const marker = document.createElement('span');
                            marker.textContent = '\u200b';
                            marker.style.display = 'inline-block';
                            marker.style.width = '1px';
                            marker.style.height = '1em';
                            marker.style.opacity = '0';
                            marker.style.pointerEvents = 'none';
                            range.insertNode(marker);
                            rect = marker.getBoundingClientRect();
                            const parent = marker.parentNode;
                            if (parent) {
                                parent.removeChild(marker);
                                parent.normalize();
                            }
                            if (selectionOffsets) {
                                this.setCodeEditorSelectionOffsets(element, selectionOffsets.start, selectionOffsets.end);
                            }
                        }
                    }
                    if (!rect) {
                        const focusNode = selection.focusNode;
                        if (!focusNode || !element.contains(focusNode)) {
                            if (state.vimCaretElement) {
                                state.vimCaretElement.style.display = 'none';
                            }
                            return;
                        }
                        const focusRange = document.createRange();
                        try {
                            focusRange.setStart(focusNode, selection.focusOffset);
                            focusRange.collapse(true);
                        }
                        catch (_a) {
                            if (state.vimCaretElement) {
                                state.vimCaretElement.style.display = 'none';
                            }
                            return;
                        }
                        rect = focusRange.getClientRects()[0] || focusRange.getBoundingClientRect();
                    }
                    if (rect) {
                        applyCaretRect(rect);
                    }
                    return;
                }
                const range = selection.getRangeAt(0).cloneRange();
                if (!element.contains(range.startContainer)) {
                    if (state.vimCaretElement) {
                        state.vimCaretElement.style.display = 'none';
                    }
                    return;
                }
                range.collapse(true);
                let rect = range.getClientRects()[0];
                if (!rect) {
                    rect = range.getBoundingClientRect();
                }
                let caretLeft = rect ? rect.left : null;
                if (!rect || (!rect.width && !rect.height)) {
                    const selectionOffsets = this.getCodeEditorSelectionOffsets(element);
                    if (selectionOffsets) {
                        const probeRange = document.createRange();
                        const startPos = this.getCodeEditorPositionForOffset(element, selectionOffsets.start);
                        probeRange.setStart(startPos.container, startPos.offset);
                        probeRange.collapse(true);
                        const marker = document.createElement('span');
                        marker.textContent = '\u200b';
                        marker.style.display = 'inline-block';
                        marker.style.width = '1px';
                        marker.style.height = '1em';
                        marker.style.opacity = '0';
                        marker.style.pointerEvents = 'none';
                        probeRange.insertNode(marker);
                        rect = marker.getBoundingClientRect();
                        caretLeft = rect ? rect.left : caretLeft;
                        const parent = marker.parentNode;
                        if (parent) {
                            parent.removeChild(marker);
                            parent.normalize();
                        }
                        this.setCodeEditorSelectionOffsets(element, selectionOffsets.start, selectionOffsets.end);
                    }
                }
                if (!rect || caretLeft === null) {
                    const elementRectFallback = element.getBoundingClientRect();
                    const style = window.getComputedStyle(element);
                    const paddingLeft = parseFloat(style.paddingLeft) || 0;
                    const paddingTop = parseFloat(style.paddingTop) || 0;
                    rect = elementRectFallback;
                    caretLeft = elementRectFallback.left + paddingLeft;
                    const fallbackTop = elementRectFallback.top + paddingTop;
                    rect = {
                        left: caretLeft,
                        top: fallbackTop,
                        right: caretLeft,
                        bottom: fallbackTop,
                        width: 0,
                        height: 0,
                        x: caretLeft,
                        y: fallbackTop,
                        toJSON: () => ({})
                    };
                }
                const elementRect = element.getBoundingClientRect();
                const style = window.getComputedStyle(element);
                const fontSize = parseFloat(style.fontSize) || 14;
                const lineHeight = parseFloat(style.lineHeight) || fontSize * 1.2;
                const minWidth = Math.max(6, Math.round(fontSize * 0.6));
                const rawWidth = rect.width || 0;
                const width = rawWidth >= minWidth ? rawWidth : minWidth;
                const caret = ensureVimCaretElement();
                caret.style.width = `${width}px`;
                caret.style.height = `1rem`;
                const left = (caretLeft !== null && caretLeft !== void 0 ? caretLeft : rect.left) - elementRect.left + element.scrollLeft;
                caret.style.left = `${left}px`;
                caret.style.top = `${rect.top - elementRect.top + element.scrollTop}px`;
                caret.style.display = 'block';
            }
            finally {
                state.vimCaretUpdateInProgress = false;
            }
        };
        const scheduleVimCaretUpdate = () => {
            if (!state.vimEnabled || state.vimMode !== 'normal')
                return;
            if (state.vimCaretUpdatePending)
                return;
            state.vimCaretUpdatePending = true;
            requestAnimationFrame(() => {
                state.vimCaretUpdatePending = false;
                updateVimCaret();
            });
        };
        state.vimUpdateCaret = updateVimCaret;
        state.vimScheduleCaret = scheduleVimCaretUpdate;
        const getScrollContainer = () => {
            const container = element.closest('.script-code-editor-scroll');
            if (container)
                return container;
            let parent = element.parentElement;
            while (parent) {
                const style = window.getComputedStyle(parent);
                if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
                    return parent;
                }
                parent = parent.parentElement;
            }
            return null;
        };
        const getCaretRectForOffset = (offset) => {
            const pos = this.getCodeEditorPositionForOffset(element, offset);
            const range = document.createRange();
            range.setStart(pos.container, pos.offset);
            range.collapse(true);
            let rect = range.getClientRects()[0] || range.getBoundingClientRect();
            if (rect && (rect.width || rect.height)) {
                return rect;
            }
            const marker = document.createElement('span');
            marker.textContent = '\u200b';
            marker.style.display = 'inline-block';
            marker.style.width = '1px';
            marker.style.height = '1em';
            marker.style.opacity = '0';
            marker.style.pointerEvents = 'none';
            range.insertNode(marker);
            rect = marker.getBoundingClientRect();
            const parent = marker.parentNode;
            if (parent) {
                parent.removeChild(marker);
                parent.normalize();
            }
            return rect && (rect.width || rect.height) ? rect : null;
        };
        const ensureCaretVisible = (offset) => {
            const container = getScrollContainer();
            if (!container)
                return;
            let targetOffset = offset;
            if (targetOffset === null || targetOffset === undefined) {
                const selectionOffsets = this.getCodeEditorSelectionOffsets(element);
                if (!selectionOffsets)
                    return;
                targetOffset = selectionOffsets.end;
            }
            const rect = getCaretRectForOffset(Math.max(0, Math.min(targetOffset, this.getScriptCodeEditorText(elementId).length)));
            if (!rect)
                return;
            const containerRect = container.getBoundingClientRect();
            const padding = 12;
            const top = rect.top - containerRect.top + container.scrollTop;
            const bottom = rect.bottom - containerRect.top + container.scrollTop;
            const viewTop = container.scrollTop;
            const viewBottom = viewTop + container.clientHeight;
            if (top < viewTop + padding) {
                container.scrollTop = Math.max(0, top - padding);
            }
            else if (bottom > viewBottom - padding) {
                container.scrollTop = bottom - container.clientHeight + padding;
            }
            const left = rect.left - containerRect.left + container.scrollLeft;
            const right = rect.right - containerRect.left + container.scrollLeft;
            const viewLeft = container.scrollLeft;
            const viewRight = viewLeft + container.clientWidth;
            if (left < viewLeft + padding) {
                container.scrollLeft = Math.max(0, left - padding);
            }
            else if (right > viewRight - padding) {
                container.scrollLeft = right - container.clientWidth + padding;
            }
        };
        const scheduleCaretScroll = (offset) => {
            requestAnimationFrame(() => ensureCaretVisible(offset));
        };
        const markVimCaretMovement = () => {
            if (!state.vimEnabled || state.vimMode !== 'normal')
                return;
            element.classList.add('vim-moving');
            if (state.vimCaretMoveTimer) {
                clearTimeout(state.vimCaretMoveTimer);
            }
            state.vimCaretMoveTimer = setTimeout(() => {
                element.classList.remove('vim-moving');
            }, 500);
        };
        const getLineInfo = (text, offset) => {
            const lines = text.split('\n');
            const lineStarts = [];
            let running = 0;
            for (const line of lines) {
                lineStarts.push(running);
                running += line.length + 1;
            }
            let lineIndex = 0;
            for (let i = 0; i < lines.length; i++) {
                const lineStart = lineStarts[i];
                const lineEnd = lineStart + lines[i].length;
                if (offset <= lineEnd || i === lines.length - 1) {
                    lineIndex = i;
                    break;
                }
            }
            const lineStart = lineStarts[lineIndex];
            const lineEnd = lineStart + lines[lineIndex].length;
            const column = Math.max(0, offset - lineStart);
            return { lines, lineStarts, lineIndex, lineStart, lineEnd, column, lineText: lines[lineIndex] };
        };
        const isWhitespace = (ch) => /\s/.test(ch);
        const isWordChar = (ch) => /[A-Za-z0-9_]/.test(ch);
        const moveNextTokenStart = (text, offset) => {
            let i = Math.min(offset, text.length);
            if (i >= text.length)
                return text.length;
            if (isWhitespace(text[i])) {
                while (i < text.length && isWhitespace(text[i]))
                    i++;
                return i;
            }
            if (isWordChar(text[i])) {
                while (i < text.length && isWordChar(text[i]))
                    i++;
            }
            else {
                i++;
            }
            while (i < text.length && isWhitespace(text[i]))
                i++;
            return i;
        };
        const movePrevTokenStart = (text, offset) => {
            if (text.length === 0 || offset <= 0)
                return 0;
            let i = Math.min(offset - 1, text.length - 1);
            while (i > 0 && isWhitespace(text[i]))
                i--;
            if (isWordChar(text[i])) {
                while (i > 0 && isWordChar(text[i - 1]))
                    i--;
                return i;
            }
            return i;
        };
        const moveTokenEnd = (text, offset) => {
            if (text.length === 0)
                return 0;
            let i = Math.min(offset, text.length - 1);
            if (isWhitespace(text[i])) {
                while (i < text.length && isWhitespace(text[i]))
                    i++;
                if (i >= text.length)
                    return text.length - 1;
            }
            const isWord = isWordChar(text[i]);
            let end = i;
            if (isWord) {
                while (end + 1 < text.length && isWordChar(text[end + 1]))
                    end++;
            }
            if (i === end) {
                let next = end + 1;
                while (next < text.length && isWhitespace(text[next]))
                    next++;
                if (next < text.length) {
                    if (isWordChar(text[next])) {
                        end = next;
                        while (end + 1 < text.length && isWordChar(text[end + 1]))
                            end++;
                    }
                    else {
                        end = next;
                    }
                }
            }
            return end;
        };
        const getIndentUnit = (baseIndent) => {
            if (!baseIndent.includes('\t') && baseIndent.includes(' ')) {
                return '  ';
            }
            return '\t';
        };
        const inputHandler = () => {
            if (state.isUpdating)
                return;
            state.isUpdating = true;
            const caretOffset = this.getCodeEditorCaretOffset(element);
            const plainText = this.getScriptCodeEditorText(elementId);
            const errorEntries = state.errorText === plainText ? state.errorEntries : null;
            const html = this.highlightScriptCode(plainText, errorEntries);
            element.innerHTML = html || '';
            this.setCodeEditorCaretOffset(element, caretOffset);
            this.updateCodeEditorLineNumbers(state.lineNumbersElement, plainText, element, state.measureElement);
            state.isUpdating = false;
            if (state.pendingSnapshot) {
                if (plainText !== state.pendingSnapshot.text) {
                    pushUndoSnapshot(state.pendingSnapshot);
                    state.redoStack = [];
                }
                state.pendingSnapshot = null;
            }
            state.lastPlainText = plainText;
            scheduleVimCaretUpdate();
            if (state.dotNetRef) {
                if (state.debounceTimer)
                    clearTimeout(state.debounceTimer);
                state.debounceTimer = setTimeout(() => {
                    safeInvoke(state.dotNetRef, 'OnCodeEditorTextChanged', [plainText]);
                }, 150);
            }
        };
        const keyHandler = (e) => {
            var _a, _b, _c, _d, _e;
            const hasModKey = (e.ctrlKey || e.metaKey) && !e.altKey;
            if (hasModKey) {
                const key = e.key.toLowerCase();
                if (key === 'z') {
                    e.preventDefault();
                    if (e.shiftKey) {
                        redo();
                    }
                    else {
                        undo();
                    }
                    return;
                }
                if (key === 'r') {
                    e.preventDefault();
                    redo();
                    return;
                }
                if (key === 'y') {
                    e.preventDefault();
                    redo();
                    return;
                }
            }
            if (state.vimEnabled) {
                if (state.vimMode === 'insert') {
                    if (e.key === 'Escape') {
                        e.preventDefault();
                        setVimMode('normal');
                        scheduleVimCaretUpdate();
                        return;
                    }
                }
                else {
                    e.preventDefault();
                    const selectionOffsets = this.getCodeEditorSelectionOffsets(element);
                    if (!selectionOffsets)
                        return;
                    const plainText = this.getScriptCodeEditorText(elementId);
                    let cursor = selectionOffsets.start;
                    let inVisual = state.vimVisualMode && state.vimVisualMode !== 'none';
                    if (inVisual) {
                        if (state.vimVisualCursor === null || state.vimVisualCursor === undefined) {
                            state.vimVisualCursor = selectionOffsets.end;
                        }
                        cursor = state.vimVisualCursor;
                    }
                    const applyTextChange = (updatedText, newCursor) => {
                        recordUndoSnapshot({ text: plainText, selection: selectionOffsets });
                        applyUpdate(updatedText, newCursor, newCursor);
                        markVimCaretMovement();
                    };
                    const deleteRange = (start, end) => {
                        const safeStart = Math.max(0, Math.min(start, plainText.length));
                        const safeEnd = Math.max(safeStart, Math.min(end, plainText.length));
                        if (safeStart === safeEnd)
                            return;
                        const updated = plainText.slice(0, safeStart) + plainText.slice(safeEnd);
                        applyTextChange(updated, Math.min(safeStart, updated.length));
                    };
                    if (!inVisual && selectionOffsets.start !== selectionOffsets.end) {
                        if (e.key === 'p' && state.vimYank) {
                            const selectionStart = selectionOffsets.start;
                            const selectionEnd = selectionOffsets.end;
                            const insertText = state.vimYank;
                            const updated = plainText.slice(0, selectionStart) + insertText + plainText.slice(selectionEnd);
                            const newCursor = Math.max(0, selectionStart + insertText.length - 1);
                            applyTextChange(updated, Math.min(newCursor, updated.length));
                            return;
                        }
                        if (e.key === 'r') {
                            state.vimPending = 'r';
                            state.vimReplaceSelection = { start: selectionOffsets.start, end: selectionOffsets.end };
                            return;
                        }
                        if (e.key === 'y' || e.key === 'd' || e.key === 'c' || e.key === 'x') {
                            const selectionStart = selectionOffsets.start;
                            const selectionEnd = selectionOffsets.end;
                            state.vimYank = plainText.slice(selectionStart, selectionEnd);
                            if (e.key === 'd' || e.key === 'c' || e.key === 'x') {
                                deleteRange(selectionStart, selectionEnd);
                            }
                            if (e.key === 'c') {
                                setVimMode('insert');
                            }
                            else {
                                this.setCodeEditorSelectionOffsets(element, selectionStart, selectionStart);
                            }
                            return;
                        }
                        this.setCodeEditorSelectionOffsets(element, cursor, cursor);
                    }
                    const moveCursor = (newCursor) => {
                        const clamped = Math.max(0, Math.min(newCursor, plainText.length));
                        if (state.vimVisualMode && state.vimVisualMode !== 'none') {
                            updateVisualSelection(clamped);
                        }
                        else {
                            this.setCodeEditorSelectionOffsets(element, clamped, clamped);
                            markVimCaretMovement();
                            scheduleVimCaretUpdate();
                            scheduleCaretScroll(clamped);
                        }
                    };
                    const info = getLineInfo(plainText, cursor);
                    const moveVertical = (direction) => {
                        const targetIndex = info.lineIndex + direction;
                        if (targetIndex < 0 || targetIndex >= info.lines.length)
                            return;
                        const targetLine = info.lines[targetIndex];
                        const targetCol = Math.min(info.column, targetLine.length);
                        const targetStart = info.lineStarts[targetIndex];
                        moveCursor(targetStart + targetCol);
                    };
                    const updateVisualSelection = (target, modeOverride) => {
                        if (state.vimVisualMode === 'none' && !modeOverride)
                            return;
                        const mode = modeOverride || state.vimVisualMode;
                        if (state.vimVisualAnchor === null || state.vimVisualAnchor === undefined) {
                            state.vimVisualAnchor = cursor;
                        }
                        state.vimVisualCursor = target;
                        let start = Math.min(state.vimVisualAnchor, target);
                        let end = Math.max(state.vimVisualAnchor, target);
                        if (mode === 'line') {
                            const startInfo = getLineInfo(plainText, start);
                            const endInfo = getLineInfo(plainText, end);
                            start = startInfo.lineStart;
                            end = endInfo.lineEnd;
                            if (end < plainText.length) {
                                end += 1;
                            }
                        }
                        else {
                            if (end < plainText.length) {
                                end += 1;
                            }
                        }
                        this.setCodeEditorSelectionOffsets(element, start, end);
                        markVimCaretMovement();
                        scheduleVimCaretUpdate();
                        scheduleCaretScroll(target);
                    };
                    const setVisualMode = (mode) => {
                        if (state.vimVisualMode === mode)
                            return;
                        state.vimVisualMode = mode;
                        if (mode === 'none') {
                            state.vimVisualAnchor = null;
                            state.vimVisualCursor = null;
                            if (state.vimEnabled && state.vimMode === 'normal' && state.dotNetRef) {
                                safeInvoke(state.dotNetRef, 'OnCodeEditorVimModeChanged', ['normal']);
                            }
                            return;
                        }
                        if (state.vimVisualAnchor === null || state.vimVisualAnchor === undefined) {
                            state.vimVisualAnchor = cursor;
                        }
                        if (state.vimEnabled && state.vimMode === 'normal' && state.dotNetRef) {
                            safeInvoke(state.dotNetRef, 'OnCodeEditorVimModeChanged', [mode === 'line' ? 'visual-line' : 'visual']);
                        }
                    };
                    const findCharForward = (target) => {
                        for (let i = cursor + 1; i < info.lineEnd; i++) {
                            if (plainText[i] === target)
                                return i;
                        }
                        return null;
                    };
                    const findCharBackward = (target) => {
                        for (let i = cursor - 1; i >= info.lineStart; i--) {
                            if (plainText[i] === target)
                                return i;
                        }
                        return null;
                    };
                    const applyFindMotion = (dir, target, op = null) => {
                        const forward = dir === 'f' || dir === 't';
                        const match = forward ? findCharForward(target) : findCharBackward(target);
                        if (match === null)
                            return;
                        if (op) {
                            let rangeStart = cursor;
                            let rangeEnd = cursor;
                            if (dir === 'f') {
                                rangeStart = cursor;
                                rangeEnd = match + 1;
                            }
                            else if (dir === 't') {
                                rangeStart = cursor;
                                rangeEnd = match;
                            }
                            else if (dir === 'F') {
                                rangeStart = match;
                                rangeEnd = cursor + 1;
                            }
                            else if (dir === 'T') {
                                rangeStart = match + 1;
                                rangeEnd = cursor + 1;
                            }
                            deleteRange(rangeStart, rangeEnd);
                            moveCursor(Math.min(rangeStart, plainText.length));
                            if (op === 'c') {
                                setVimMode('insert');
                            }
                        }
                        else {
                            let targetIndex = match;
                            if (dir === 't') {
                                targetIndex = Math.max(info.lineStart, match - 1);
                            }
                            else if (dir === 'T') {
                                targetIndex = Math.min(info.lineEnd, match + 1);
                            }
                            moveCursor(targetIndex);
                        }
                        state.vimFind = { dir, char: target };
                    };
                    const deleteTo = (target) => {
                        const end = target <= cursor ? Math.min(cursor + 1, plainText.length) : target;
                        deleteRange(cursor, end);
                    };
                    const getWordBounds = (text, offset) => {
                        if (!text.length)
                            return null;
                        let idx = Math.min(offset, text.length - 1);
                        if (isWhitespace(text[idx])) {
                            idx = moveNextTokenStart(text, idx);
                            if (idx >= text.length)
                                return null;
                        }
                        if (isWordChar(text[idx])) {
                            let start = idx;
                            while (start > 0 && isWordChar(text[start - 1]))
                                start--;
                            let end = idx + 1;
                            while (end < text.length && isWordChar(text[end]))
                                end++;
                            return { start, end };
                        }
                        return { start: idx, end: Math.min(idx + 1, text.length) };
                    };
                    const isEscapedQuote = (text, index) => {
                        let backslashCount = 0;
                        for (let i = index - 1; i >= 0 && text[i] === '\\'; i--) {
                            backslashCount++;
                        }
                        return backslashCount % 2 === 1;
                    };
                    const findEnclosingPair = (openChar, closeChar) => {
                        const lineStart = info.lineStart;
                        const lineEnd = info.lineEnd;
                        const text = plainText;
                        if (openChar === closeChar) {
                            let openIndex = -1;
                            for (let i = cursor - 1; i >= lineStart; i--) {
                                if (text[i] === openChar && !isEscapedQuote(text, i)) {
                                    openIndex = i;
                                    break;
                                }
                            }
                            if (openIndex < 0)
                                return null;
                            let closeIndex = -1;
                            for (let i = cursor; i < lineEnd; i++) {
                                if (text[i] === closeChar && !isEscapedQuote(text, i)) {
                                    closeIndex = i;
                                    break;
                                }
                            }
                            if (closeIndex < 0 || closeIndex <= openIndex)
                                return null;
                            return { openIndex, closeIndex };
                        }
                        let openIndex = -1;
                        let depth = 0;
                        for (let i = cursor - 1; i >= lineStart; i--) {
                            const ch = text[i];
                            if (ch === openChar) {
                                if (depth === 0) {
                                    openIndex = i;
                                    break;
                                }
                                depth--;
                            }
                            else if (ch === closeChar) {
                                depth++;
                            }
                        }
                        if (openIndex < 0)
                            return null;
                        let closeIndex = -1;
                        depth = 0;
                        for (let i = cursor; i < lineEnd; i++) {
                            const ch = text[i];
                            if (ch === closeChar) {
                                if (depth === 0) {
                                    closeIndex = i;
                                    break;
                                }
                                depth--;
                            }
                            else if (ch === openChar) {
                                depth++;
                            }
                        }
                        if (closeIndex < 0)
                            return null;
                        return { openIndex, closeIndex };
                    };
                    inVisual = state.vimVisualMode && state.vimVisualMode !== 'none';
                    if (inVisual) {
                        if (state.vimPending === 'vi' && e.key.length === 1) {
                            const keyChar = e.key;
                            let openChar = keyChar;
                            let closeChar = keyChar;
                            if (keyChar === ')') {
                                openChar = '(';
                                closeChar = ')';
                            }
                            else if (keyChar === ']') {
                                openChar = '[';
                                closeChar = ']';
                            }
                            else if (keyChar === '}') {
                                openChar = '{';
                                closeChar = '}';
                            }
                            else if (keyChar === '(' || keyChar === '[' || keyChar === '{') {
                                openChar = keyChar;
                                closeChar = keyChar === '(' ? ')' : keyChar === '[' ? ']' : '}';
                            }
                            const pair = findEnclosingPair(openChar, closeChar);
                            if (pair && pair.openIndex < pair.closeIndex && cursor > pair.openIndex && cursor <= pair.closeIndex) {
                                const start = pair.openIndex + 1;
                                const end = pair.closeIndex;
                                state.vimVisualMode = 'char';
                                state.vimVisualAnchor = start;
                                state.vimVisualCursor = Math.max(start, end - 1);
                                this.setCodeEditorSelectionOffsets(element, start, end);
                                markVimCaretMovement();
                                scheduleVimCaretUpdate();
                            }
                            state.vimPending = null;
                            return;
                        }
                        if (e.key === 'i') {
                            state.vimPending = 'vi';
                            return;
                        }
                        if (e.key === 'Escape') {
                            state.vimPending = null;
                            const collapseTo = (_a = state.vimVisualCursor) !== null && _a !== void 0 ? _a : cursor;
                            setVisualMode('none');
                            this.setCodeEditorSelectionOffsets(element, collapseTo, collapseTo);
                            markVimCaretMovement();
                            scheduleVimCaretUpdate();
                            return;
                        }
                        if (e.key === 'v' && state.vimVisualMode === 'char') {
                            state.vimPending = null;
                            const collapseTo = (_b = state.vimVisualCursor) !== null && _b !== void 0 ? _b : cursor;
                            setVisualMode('none');
                            this.setCodeEditorSelectionOffsets(element, collapseTo, collapseTo);
                            markVimCaretMovement();
                            scheduleVimCaretUpdate();
                            return;
                        }
                        if (e.key === 'V' && state.vimVisualMode === 'line') {
                            state.vimPending = null;
                            const collapseTo = (_c = state.vimVisualCursor) !== null && _c !== void 0 ? _c : cursor;
                            setVisualMode('none');
                            this.setCodeEditorSelectionOffsets(element, collapseTo, collapseTo);
                            markVimCaretMovement();
                            scheduleVimCaretUpdate();
                            return;
                        }
                        if (e.key === 'V' && state.vimVisualMode === 'char') {
                            state.vimPending = null;
                            setVisualMode('line');
                            updateVisualSelection((_d = state.vimVisualCursor) !== null && _d !== void 0 ? _d : cursor, 'line');
                            return;
                        }
                        if (e.key === 'v' && state.vimVisualMode === 'line') {
                            state.vimPending = null;
                            setVisualMode('char');
                            updateVisualSelection((_e = state.vimVisualCursor) !== null && _e !== void 0 ? _e : cursor, 'char');
                            return;
                        }
                        const selection = this.getCodeEditorSelectionOffsets(element);
                        if (selection && (e.key === 'y' || e.key === 'd' || e.key === 'c')) {
                            state.vimPending = null;
                            state.vimYank = plainText.slice(selection.start, selection.end);
                            if (e.key === 'd' || e.key === 'c') {
                                deleteRange(selection.start, selection.end);
                            }
                            setVisualMode('none');
                            if (e.key === 'c') {
                                setVimMode('insert');
                            }
                            else {
                                const collapseTo = selection.start;
                                this.setCodeEditorSelectionOffsets(element, collapseTo, collapseTo);
                            }
                            return;
                        }
                    }
                    const pending = state.vimPending;
                    if (pending) {
                        if (e.key === 'Shift' || e.key === 'Alt' || e.key === 'Control' || e.key === 'Meta') {
                            return;
                        }
                        state.vimPending = null;
                        if (pending === 'r') {
                            if (e.key.length !== 1)
                                return;
                            if (state.vimReplaceSelection) {
                                const selectionStart = Math.max(0, Math.min(state.vimReplaceSelection.start, plainText.length));
                                const selectionEnd = Math.max(selectionStart, Math.min(state.vimReplaceSelection.end, plainText.length));
                                state.vimReplaceSelection = null;
                                if (selectionStart === selectionEnd)
                                    return;
                                const count = selectionEnd - selectionStart;
                                const replacement = e.key.repeat(count);
                                const updated = plainText.slice(0, selectionStart) + replacement + plainText.slice(selectionEnd);
                                applyTextChange(updated, Math.min(selectionStart, updated.length));
                                return;
                            }
                            if (cursor >= plainText.length)
                                return;
                            const updated = plainText.slice(0, cursor) + e.key + plainText.slice(cursor + 1);
                            applyTextChange(updated, Math.min(cursor, updated.length));
                            return;
                        }
                        if (pending === 'f' || pending === 'F' || pending === 't' || pending === 'T') {
                            if (e.key.length !== 1)
                                return;
                            applyFindMotion(pending, e.key);
                            return;
                        }
                        if (pending.length === 2 && (pending[0] === 'c' || pending[0] === 'd') && (pending[1] === 'f' || pending[1] === 'F' || pending[1] === 't' || pending[1] === 'T')) {
                            if (e.key.length !== 1)
                                return;
                            applyFindMotion(pending[1], e.key, pending[0]);
                            return;
                        }
                        if (pending === 'g' && e.key === 'g') {
                            moveCursor(0);
                            return;
                        }
                        if (pending === 'd' && e.key === 'd') {
                            let deleteStart = info.lineStart;
                            let deleteEnd = info.lineEnd;
                            if (info.lineEnd < plainText.length) {
                                deleteEnd = info.lineEnd + 1;
                            }
                            else if (info.lineStart > 0) {
                                deleteStart = info.lineStart - 1;
                            }
                            state.vimYank = info.lineText;
                            const updated = plainText.slice(0, deleteStart) + plainText.slice(deleteEnd);
                            applyTextChange(updated, Math.min(deleteStart, updated.length));
                            return;
                        }
                        if (pending === 'y' && e.key === 'y') {
                            state.vimYank = info.lineText;
                            return;
                        }
                        if (pending === 'd' && e.key === 'w') {
                            deleteTo(moveNextTokenStart(plainText, cursor));
                            return;
                        }
                        if (pending === 'c' && e.key === 'w') {
                            deleteTo(moveNextTokenStart(plainText, cursor));
                            setVimMode('insert');
                            return;
                        }
                        if ((pending === 'c' || pending === 'd') && (e.key === 'f' || e.key === 'F' || e.key === 't' || e.key === 'T')) {
                            state.vimPending = `${pending}${e.key}`;
                            return;
                        }
                        if ((pending === 'c' || pending === 'd') && e.key === 'i') {
                            state.vimPending = pending === 'c' ? 'ci' : 'di';
                            return;
                        }
                        if (pending === 'ci' && e.key === 'w') {
                            const bounds = getWordBounds(plainText, cursor);
                            if (bounds) {
                                deleteRange(bounds.start, bounds.end);
                                moveCursor(bounds.start);
                                setVimMode('insert');
                            }
                            return;
                        }
                        if (pending === 'di' && e.key === 'w') {
                            const bounds = getWordBounds(plainText, cursor);
                            if (bounds) {
                                deleteRange(bounds.start, bounds.end);
                                moveCursor(bounds.start);
                            }
                            return;
                        }
                        if ((pending === 'ci' || pending === 'di') && e.key.length === 1) {
                            const keyChar = e.key;
                            let openChar = keyChar;
                            let closeChar = keyChar;
                            if (keyChar === ')') {
                                openChar = '(';
                                closeChar = ')';
                            }
                            else if (keyChar === ']') {
                                openChar = '[';
                                closeChar = ']';
                            }
                            else if (keyChar === '}') {
                                openChar = '{';
                                closeChar = '}';
                            }
                            else if (keyChar === '(' || keyChar === '[' || keyChar === '{') {
                                openChar = keyChar;
                                closeChar = keyChar === '(' ? ')' : keyChar === '[' ? ']' : '}';
                            }
                            const pair = findEnclosingPair(openChar, closeChar);
                            if (pair && pair.openIndex < pair.closeIndex && cursor > pair.openIndex && cursor <= pair.closeIndex) {
                                deleteRange(pair.openIndex + 1, pair.closeIndex);
                                moveCursor(pair.openIndex + 1);
                                if (pending === 'ci') {
                                    setVimMode('insert');
                                }
                            }
                            return;
                        }
                        return;
                    }
                    switch (e.key) {
                        case 'h':
                        case 'ArrowLeft':
                            moveCursor(cursor - 1);
                            return;
                        case 'l':
                        case 'ArrowRight':
                            moveCursor(cursor + 1);
                            return;
                        case 'k':
                        case 'ArrowUp':
                            moveVertical(-1);
                            return;
                        case 'j':
                        case 'ArrowDown':
                            moveVertical(1);
                            return;
                        case '0':
                            moveCursor(info.lineStart);
                            return;
                        case '$':
                            if (info.lineEnd > info.lineStart) {
                                moveCursor(info.lineEnd - 1);
                            }
                            else {
                                moveCursor(info.lineStart);
                            }
                            return;
                        case 'w':
                            moveCursor(moveNextTokenStart(plainText, cursor));
                            return;
                        case 'b':
                            moveCursor(movePrevTokenStart(plainText, cursor));
                            return;
                        case 'e':
                            moveCursor(moveTokenEnd(plainText, cursor));
                            return;
                        case ';':
                            if (!state.vimFind)
                                return;
                            {
                                applyFindMotion(state.vimFind.dir, state.vimFind.char);
                            }
                            return;
                        case 'f':
                            state.vimPending = 'f';
                            return;
                        case 'F':
                            state.vimPending = 'F';
                            return;
                        case 't':
                            state.vimPending = 't';
                            return;
                        case 'T':
                            state.vimPending = 'T';
                            return;
                        case 'v':
                            if (!inVisual) {
                                state.vimPending = null;
                                setVisualMode('char');
                                updateVisualSelection(cursor, 'char');
                            }
                            return;
                        case 'V':
                            if (!inVisual) {
                                state.vimPending = null;
                                setVisualMode('line');
                                updateVisualSelection(cursor, 'line');
                            }
                            return;
                        case 'g':
                            state.vimPending = 'g';
                            return;
                        case 'G':
                            if (info.lines.length > 0) {
                                const lastIndex = info.lines.length - 1;
                                moveCursor(info.lineStarts[lastIndex]);
                            }
                            return;
                        case 'x':
                            if (cursor < plainText.length) {
                                const updated = plainText.slice(0, cursor) + plainText.slice(cursor + 1);
                                applyTextChange(updated, Math.min(cursor, updated.length));
                            }
                            return;
                        case 'r':
                            state.vimPending = 'r';
                            return;
                        case 'C':
                            {
                                if (cursor < info.lineEnd) {
                                    deleteRange(cursor, info.lineEnd);
                                }
                                moveCursor(Math.min(cursor, plainText.length));
                                setVimMode('insert');
                            }
                            return;
                        case 'S':
                            {
                                const indentMatch = info.lineText.match(/^[\t ]*/);
                                const indent = indentMatch ? indentMatch[0] : '';
                                const lineStart = info.lineStart;
                                const lineEnd = info.lineEnd;
                                const updated = plainText.slice(0, lineStart) + indent + plainText.slice(lineEnd);
                                applyTextChange(updated, lineStart + indent.length);
                                setVimMode('insert');
                            }
                            return;
                        case 'c':
                            state.vimPending = 'c';
                            return;
                        case 'd':
                            state.vimPending = 'd';
                            return;
                        case 'y':
                            state.vimPending = 'y';
                            return;
                        case 'p':
                            if (!state.vimYank)
                                return;
                            {
                                const insertAt = info.lineEnd < plainText.length ? info.lineEnd + 1 : info.lineEnd;
                                const insertText = info.lineEnd < plainText.length ? `${state.vimYank}\n` : `\n${state.vimYank}`;
                                const updated = plainText.slice(0, insertAt) + insertText + plainText.slice(insertAt);
                                const cursorOffset = insertAt + (info.lineEnd < plainText.length ? 0 : 1);
                                applyTextChange(updated, cursorOffset);
                            }
                            return;
                        case 'o':
                        case 'O':
                            {
                                const baseIndentMatch = info.lineText.match(/^[\t ]*/);
                                const baseIndent = baseIndentMatch ? baseIndentMatch[0] : '';
                                const indentUnit = getIndentUnit(baseIndent);
                                const trimmed = info.lineText.replace(/[\t ]+$/, '');
                                const indent = baseIndent + (trimmed.endsWith('{') ? indentUnit : '');
                                if (e.key === 'o') {
                                    const insertAt = info.lineEnd < plainText.length ? info.lineEnd + 1 : info.lineEnd;
                                    const insertText = info.lineEnd < plainText.length ? `${indent}\n` : `\n${indent}`;
                                    const updated = plainText.slice(0, insertAt) + insertText + plainText.slice(insertAt);
                                    const cursorOffset = insertAt + (info.lineEnd < plainText.length ? 0 : 1) + indent.length;
                                    applyTextChange(updated, cursorOffset);
                                }
                                else {
                                    const insertAt = info.lineStart;
                                    const insertText = `${indent}\n`;
                                    const updated = plainText.slice(0, insertAt) + insertText + plainText.slice(insertAt);
                                    const cursorOffset = insertAt + indent.length;
                                    applyTextChange(updated, cursorOffset);
                                }
                                setVimMode('insert');
                            }
                            return;
                        case 'i':
                            setVimMode('insert');
                            scheduleVimCaretUpdate();
                            return;
                        case 'a':
                            if (cursor < info.lineEnd) {
                                moveCursor(cursor + 1);
                            }
                            setVimMode('insert');
                            scheduleVimCaretUpdate();
                            return;
                        case 'I':
                            {
                                const match = info.lineText.match(/^[\t ]*/);
                                const indent = match ? match[0].length : 0;
                                moveCursor(info.lineStart + indent);
                                setVimMode('insert');
                            }
                            return;
                        case 'A':
                            moveCursor(info.lineEnd);
                            setVimMode('insert');
                            return;
                        case 'u':
                            undo();
                            markVimCaretMovement();
                            scheduleVimCaretUpdate();
                            return;
                        case 'Escape':
                            state.vimPending = null;
                            scheduleVimCaretUpdate();
                            return;
                        default:
                            return;
                    }
                }
            }
            if (e.key === '"') {
                const selectionOffsets = this.getCodeEditorSelectionOffsets(element);
                if (!selectionOffsets)
                    return;
                const plainText = this.getScriptCodeEditorText(elementId);
                if (selectionOffsets.start === selectionOffsets.end) {
                    const nextChar = plainText[selectionOffsets.end] || '';
                    if (nextChar === '"') {
                        e.preventDefault();
                        this.setCodeEditorSelectionOffsets(element, selectionOffsets.end + 1, selectionOffsets.end + 1);
                        return;
                    }
                }
                e.preventDefault();
                recordUndoSnapshot({ text: plainText, selection: selectionOffsets });
                const updated = this.replaceCodeSelectionWithPair(plainText, selectionOffsets.start, selectionOffsets.end, '"', '"');
                applyUpdate(updated.text, updated.start, updated.end);
                return;
            }
            if (e.key === '[' || e.key === '{' || e.key === '(') {
                const selectionOffsets = this.getCodeEditorSelectionOffsets(element);
                if (!selectionOffsets)
                    return;
                const plainText = this.getScriptCodeEditorText(elementId);
                const closeChar = e.key === '[' ? ']' : (e.key === '{' ? '}' : ')');
                e.preventDefault();
                recordUndoSnapshot({ text: plainText, selection: selectionOffsets });
                const updated = this.replaceCodeSelectionWithPair(plainText, selectionOffsets.start, selectionOffsets.end, e.key, closeChar);
                applyUpdate(updated.text, updated.start, updated.end);
                return;
            }
            if (e.key === ']' || e.key === '}' || e.key === ')') {
                const selectionOffsets = this.getCodeEditorSelectionOffsets(element);
                if (!selectionOffsets)
                    return;
                const plainText = this.getScriptCodeEditorText(elementId);
                if (selectionOffsets.start === selectionOffsets.end) {
                    const nextChar = plainText[selectionOffsets.end] || '';
                    if (nextChar === e.key) {
                        e.preventDefault();
                        this.setCodeEditorSelectionOffsets(element, selectionOffsets.end + 1, selectionOffsets.end + 1);
                        return;
                    }
                }
                e.preventDefault();
                recordUndoSnapshot({ text: plainText, selection: selectionOffsets });
                const updated = this.replaceCodeSelectionWithText(plainText, selectionOffsets.start, selectionOffsets.end, e.key);
                applyUpdate(updated.text, updated.start, updated.end);
                return;
            }
            if (e.key === 'Enter') {
                const selectionOffsets = this.getCodeEditorSelectionOffsets(element);
                if (!selectionOffsets || selectionOffsets.start !== selectionOffsets.end)
                    return;
                const plainText = this.getScriptCodeEditorText(elementId);
                const cursor = selectionOffsets.start;
                if (cursor < 0 || cursor > plainText.length)
                    return;
                const lineStartIndex = plainText.lastIndexOf('\n', cursor - 1) + 1;
                const lineEndIndex = plainText.indexOf('\n', cursor);
                const lineText = plainText.slice(lineStartIndex, lineEndIndex === -1 ? plainText.length : lineEndIndex);
                const indentMatch = lineText.match(/^[\t ]*/);
                const baseIndent = indentMatch ? indentMatch[0] : '';
                let indentUnit = '\t';
                if (!baseIndent.includes('\t') && baseIndent.includes(' ')) {
                    indentUnit = '  ';
                }
                if (cursor > 0 && cursor < plainText.length && plainText[cursor - 1] === '{' && plainText[cursor] === '}') {
                    e.preventDefault();
                    recordUndoSnapshot({ text: plainText, selection: selectionOffsets });
                    const insertion = `\n${baseIndent}${indentUnit}\n${baseIndent}`;
                    const updatedText = plainText.slice(0, cursor) + insertion + plainText.slice(cursor);
                    const newCursor = cursor + 1 + baseIndent.length + indentUnit.length;
                    applyUpdate(updatedText, newCursor, newCursor);
                    return;
                }
                e.preventDefault();
                recordUndoSnapshot({ text: plainText, selection: selectionOffsets });
                const linePrefix = plainText.slice(lineStartIndex, cursor);
                const trimmedPrefix = linePrefix.replace(/[\t ]+$/, '');
                const shouldIndentExtra = trimmedPrefix.endsWith('{');
                const indent = baseIndent + (shouldIndentExtra ? indentUnit : '');
                const insertion = `\n${indent}`;
                const updatedText = plainText.slice(0, cursor) + insertion + plainText.slice(cursor);
                const newCursor = cursor + 1 + indent.length;
                applyUpdate(updatedText, newCursor, newCursor);
                return;
            }
            if (e.key === 'Tab') {
                e.preventDefault();
                const selectionOffsets = this.getCodeEditorSelectionOffsets(element);
                const plainText = this.getScriptCodeEditorText(elementId);
                if (!selectionOffsets) {
                    recordUndoSnapshot(captureSnapshot());
                    this.insertTextAtCursor(element, '\t');
                    inputHandler();
                    return;
                }
                recordUndoSnapshot({ text: plainText, selection: selectionOffsets });
                const result = this.applyCodeIndentation(plainText, selectionOffsets.start, selectionOffsets.end, e.shiftKey);
                applyUpdate(result.text, result.start, result.end);
            }
        };
        const beforeInputHandler = () => {
            if (state.isUpdating)
                return;
            state.pendingSnapshot = captureSnapshot();
        };
        const pasteHandler = (e) => {
            var _a;
            e.preventDefault();
            recordUndoSnapshot(captureSnapshot());
            const text = this.normalizeScriptCodeText(((_a = e.clipboardData) === null || _a === void 0 ? void 0 : _a.getData('text/plain')) || '');
            this.insertTextAtCursor(element, text);
            inputHandler();
        };
        const existingInput = element._codeInputHandler;
        const existingKey = element._codeKeyHandler;
        const existingPaste = element._codePasteHandler;
        const existingBeforeInput = element._codeBeforeInputHandler;
        const existingSelection = element._codeSelectionHandler;
        const existingFocus = element._codeFocusHandler;
        const existingBlur = element._codeBlurHandler;
        const existingMouseDown = element._codeMouseDownHandler;
        const existingMouseMove = element._codeMouseMoveHandler;
        const existingMouseUp = element._codeMouseUpHandler;
        if (existingInput)
            element.removeEventListener('input', existingInput);
        if (existingKey)
            element.removeEventListener('keydown', existingKey);
        if (existingPaste)
            element.removeEventListener('paste', existingPaste);
        if (existingBeforeInput)
            element.removeEventListener('beforeinput', existingBeforeInput);
        if (existingSelection)
            document.removeEventListener('selectionchange', existingSelection);
        if (existingFocus)
            element.removeEventListener('focus', existingFocus);
        if (existingBlur)
            element.removeEventListener('blur', existingBlur);
        if (existingMouseDown)
            element.removeEventListener('mousedown', existingMouseDown);
        if (existingMouseMove)
            element.removeEventListener('mousemove', existingMouseMove);
        if (existingMouseUp)
            document.removeEventListener('mouseup', existingMouseUp);
        const selectionHandler = () => {
            if (!state.vimEnabled || state.vimMode !== 'normal')
                return;
            const selection = window.getSelection();
            if (!selection || selection.rangeCount === 0)
                return;
            const range = selection.getRangeAt(0);
            if (!element.contains(range.startContainer))
                return;
            markVimCaretMovement();
            scheduleVimCaretUpdate();
        };
        const focusHandler = () => {
            state.vimHasFocus = true;
            scheduleVimCaretUpdate();
        };
        const blurHandler = () => {
            state.vimHasFocus = false;
            updateVimCaret();
        };
        const mouseDownHandler = (e) => {
            if (e.button !== 0)
                return;
            state.vimMouseDown = true;
            state.vimMouseDragging = false;
        };
        const mouseMoveHandler = () => {
            if (!state.vimMouseDown)
                return;
            state.vimMouseDragging = true;
            scheduleVimCaretUpdate();
        };
        const mouseUpHandler = () => {
            if (!state.vimMouseDown && !state.vimMouseDragging)
                return;
            state.vimMouseDown = false;
            state.vimMouseDragging = false;
            scheduleVimCaretUpdate();
        };
        element._codeInputHandler = inputHandler;
        element._codeKeyHandler = keyHandler;
        element._codePasteHandler = pasteHandler;
        element._codeBeforeInputHandler = beforeInputHandler;
        element._codeSelectionHandler = selectionHandler;
        element._codeFocusHandler = focusHandler;
        element._codeBlurHandler = blurHandler;
        element._codeMouseDownHandler = mouseDownHandler;
        element._codeMouseMoveHandler = mouseMoveHandler;
        element._codeMouseUpHandler = mouseUpHandler;
        element.addEventListener('input', inputHandler);
        element.addEventListener('keydown', keyHandler);
        element.addEventListener('paste', pasteHandler);
        element.addEventListener('beforeinput', beforeInputHandler);
        document.addEventListener('selectionchange', selectionHandler);
        element.addEventListener('focus', focusHandler);
        element.addEventListener('blur', blurHandler);
        element.addEventListener('mousedown', mouseDownHandler);
        element.addEventListener('mousemove', mouseMoveHandler);
        document.addEventListener('mouseup', mouseUpHandler);
    }
    static setScriptCodeEditorText(elementId, code) {
        const element = document.getElementById(elementId);
        if (!element)
            return;
        const normalized = this.normalizeScriptCodeText(code || '');
        const html = this.highlightScriptCode(normalized);
        element.innerHTML = html || '';
        const state = element._codeEditorState;
        if (state === null || state === void 0 ? void 0 : state.lineNumbersElement) {
            state.measureElement = this.ensureCodeEditorMeasureElement(element, state.measureElement);
            this.updateCodeEditorLineNumbers(state.lineNumbersElement, normalized, element, state.measureElement);
        }
        if (state) {
            state.lastPlainText = normalized;
            state.pendingSnapshot = null;
            state.undoStack = [];
            state.redoStack = [];
            state.errorEntries = [];
            state.errorText = '';
            state.pendingErrors = null;
            if (state.errorTimer) {
                clearTimeout(state.errorTimer);
                state.errorTimer = null;
            }
        }
    }
    static refreshScriptCodeEditorLayout(elementId) {
        const element = document.getElementById(elementId);
        if (!element)
            return;
        const state = element._codeEditorState;
        if (state === null || state === void 0 ? void 0 : state.lineNumbersElement) {
            state.measureElement = this.ensureCodeEditorMeasureElement(element, state.measureElement);
            const plainText = this.getScriptCodeEditorText(elementId);
            this.updateCodeEditorLineNumbers(state.lineNumbersElement, plainText, element, state.measureElement);
        }
    }
    static renderScriptCodeExample(elementId, code) {
        const element = document.getElementById(elementId);
        if (!element)
            return;
        element.innerHTML = this.highlightScriptCode(code || '') || '';
    }
    static getScriptCodeEditorText(elementId) {
        const element = document.getElementById(elementId);
        if (!element)
            return '';
        return this.normalizeScriptCodeText(this.getScriptCodeTextFromNode(element));
    }
    static highlightScriptCode(code, errorEntries = null) {
        const tokens = this.tokenizeScriptCode(this.normalizeScriptCodeText(code || ''));
        const sortedErrors = errorEntries ? [...errorEntries].sort((a, b) => a.offset - b.offset) : [];
        let errorIndex = 0;
        let html = '';
        let offset = 0;
        for (const token of tokens) {
            const tokenStart = offset;
            const tokenEnd = tokenStart + token.value.length;
            let hasError = false;
            let errorMessage = '';
            while (errorIndex < sortedErrors.length && sortedErrors[errorIndex].offset < tokenStart) {
                errorIndex++;
            }
            let scanIndex = errorIndex;
            while (scanIndex < sortedErrors.length && sortedErrors[scanIndex].offset < tokenEnd) {
                if (!hasError) {
                    hasError = true;
                    errorMessage = sortedErrors[scanIndex].message || '';
                }
                scanIndex++;
            }
            const escaped = this.escapeHtml(token.value).replace(/\n/g, '<br>');
            if (token.type === 'whitespace') {
                html += escaped;
                offset = tokenEnd;
                continue;
            }
            let className = token.className;
            if (hasError) {
                className = className ? `${className} script-code-token-error` : 'script-code-token-error';
            }
            const errorAttr = hasError && errorMessage
                ? ` data-error="${this.escapeHtmlAttribute(errorMessage)}"`
                : '';
            html += `<span class="${className}"${errorAttr}>${escaped}</span>`;
            errorIndex = scanIndex;
            offset = tokenEnd;
        }
        return html;
    }
    static tokenizeScriptCode(code) {
        const tokens = [];
        const keywords = new Set(['name', 'websearch', 'reasoning', 'param', 'text', 'if', 'else', 'required', 'label', 'options', 'default', 'placeholder', 'true', 'false']);
        const types = new Set(['choice']);
        let i = 0;
        let lastSignificant = null;
        const pushToken = (type, className, value) => {
            tokens.push({ type, className, value });
        };
        while (i < code.length) {
            const ch = code[i];
            const next = i + 1 < code.length ? code[i + 1] : '';
            if (ch === '/' && next === '/') {
                let start = i;
                i += 2;
                while (i < code.length && code[i] !== '\n')
                    i++;
                pushToken('comment', 'script-code-token-comment', code.slice(start, i));
                continue;
            }
            if (ch === '"') {
                let start = i;
                i++;
                while (i < code.length) {
                    const c = code[i];
                    if (c === '\\') {
                        i += 2;
                        continue;
                    }
                    if (c === '"') {
                        i++;
                        break;
                    }
                    i++;
                }
                pushToken('string', 'script-code-token-string', code.slice(start, i));
                continue;
            }
            if (/\s/.test(ch)) {
                let start = i;
                i++;
                while (i < code.length && /\s/.test(code[i]))
                    i++;
                const whitespace = code.slice(start, i);
                if (whitespace.includes('\n')) {
                    lastSignificant = null;
                }
                pushToken('whitespace', '', whitespace);
                continue;
            }
            if (/[A-Za-z_]/.test(ch)) {
                let start = i;
                i++;
                while (i < code.length && /[A-Za-z0-9_]/.test(code[i]))
                    i++;
                const value = code.slice(start, i);
                const tokenKey = value.toLowerCase();
                if ((tokenKey === 'choice' || tokenKey === 'text') && lastSignificant === 'param') {
                    pushToken('type', 'script-code-token-type', value);
                }
                else if (keywords.has(tokenKey)) {
                    pushToken('keyword', 'script-code-token-keyword', value);
                }
                else if (types.has(tokenKey)) {
                    pushToken('type', 'script-code-token-type', value);
                }
                else {
                    pushToken('identifier', 'script-code-token-identifier', value);
                }
                lastSignificant = tokenKey;
                continue;
            }
            if ((ch === '=' && next === '=') || (ch === '!' && next === '=') || (ch === '&' && next === '&') || (ch === '|' && next === '|')) {
                pushToken('operator', 'script-code-token-operator', code.slice(i, i + 2));
                i += 2;
                continue;
            }
            if ('{}[](),;'.includes(ch)) {
                pushToken('punctuation', 'script-code-token-punctuation', ch);
                if (ch === ';') {
                    lastSignificant = null;
                }
                i++;
                continue;
            }
            pushToken('punctuation', 'script-code-token-punctuation', ch);
            i++;
        }
        return tokens;
    }
    static buildErrorEntries(code, errors) {
        var _a, _b, _c;
        if (!errors || errors.length === 0)
            return [];
        const lines = code.split('\n');
        const lineStarts = [];
        let running = 0;
        for (const line of lines) {
            lineStarts.push(running);
            running += line.length + 1;
        }
        const entries = [];
        for (const error of errors) {
            const lineIndex = ((_a = error === null || error === void 0 ? void 0 : error.line) !== null && _a !== void 0 ? _a : 0) - 1;
            if (lineIndex < 0 || lineIndex >= lines.length)
                continue;
            const lineText = lines[lineIndex];
            const lineStart = lineStarts[lineIndex];
            const lineEnd = lineStart + lineText.length;
            const rawColumn = Math.max(1, (_b = error === null || error === void 0 ? void 0 : error.column) !== null && _b !== void 0 ? _b : 1);
            let target = Math.min(lineStart + rawColumn - 1, lineEnd);
            if (target >= lineEnd && lineEnd > lineStart) {
                target = lineEnd - 1;
            }
            const isWhitespace = (index) => index >= lineStart && index < lineEnd && /\s/.test(code[index]);
            if (target < lineEnd && isWhitespace(target)) {
                let forward = target;
                while (forward < lineEnd && /\s/.test(code[forward]))
                    forward++;
                if (forward < lineEnd) {
                    target = forward;
                }
                else {
                    let backward = target - 1;
                    while (backward >= lineStart && /\s/.test(code[backward]))
                        backward--;
                    if (backward >= lineStart) {
                        target = backward;
                    }
                }
            }
            entries.push({ offset: target, message: (_c = error === null || error === void 0 ? void 0 : error.message) !== null && _c !== void 0 ? _c : 'Invalid syntax.' });
        }
        const byOffset = new Map();
        for (const entry of entries) {
            if (!byOffset.has(entry.offset)) {
                byOffset.set(entry.offset, entry.message);
            }
        }
        return Array.from(byOffset.entries())
            .sort((a, b) => a[0] - b[0])
            .map(([offset, message]) => ({ offset, message }));
    }
    static setScriptCodeEditorErrors(elementId, errors, sourceText, debounceMs = 400) {
        const element = document.getElementById(elementId);
        if (!element)
            return;
        const state = element._codeEditorState;
        if (!state)
            return;
        state.pendingErrors = { errors: errors || [], text: sourceText || '' };
        if (state.errorTimer) {
            clearTimeout(state.errorTimer);
        }
        state.errorTimer = setTimeout(() => {
            const pending = state.pendingErrors;
            state.pendingErrors = null;
            if (!pending)
                return;
            const plainText = this.getScriptCodeEditorText(elementId);
            if (this.normalizeScriptCodeText(pending.text) !== plainText) {
                return;
            }
            state.errorEntries = this.buildErrorEntries(plainText, pending.errors);
            state.errorText = plainText;
            const selection = this.getCodeEditorSelectionOffsets(element);
            state.isUpdating = true;
            const html = this.highlightScriptCode(plainText, state.errorEntries);
            element.innerHTML = html || '';
            if (selection) {
                this.setCodeEditorSelectionOffsets(element, selection.start, selection.end);
            }
            this.updateCodeEditorLineNumbers(state.lineNumbersElement, plainText, element, state.measureElement);
            state.isUpdating = false;
        }, Math.max(0, debounceMs || 0));
    }
    static setScriptCodeEditorVimMode(elementId, enabled, mode = 'normal') {
        const element = document.getElementById(elementId);
        if (!element)
            return;
        const state = element._codeEditorState;
        if (!state)
            return;
        const applyMode = (nextMode) => {
            if (state.vimMode === nextMode)
                return;
            state.vimMode = nextMode;
            state.vimPending = null;
            if (nextMode === 'insert') {
                state.vimVisualMode = 'none';
                state.vimVisualAnchor = null;
                state.vimVisualCursor = null;
            }
            if (state.dotNetRef) {
                safeInvoke(state.dotNetRef, 'OnCodeEditorVimModeChanged', [nextMode]);
            }
            if (state.vimUpdateCaret) {
                state.vimUpdateCaret();
            }
            if (state.vimScheduleCaret) {
                state.vimScheduleCaret();
            }
        };
        state.vimEnabled = !!enabled;
        state.vimPending = null;
        if (!state.vimEnabled) {
            applyMode('insert');
            return;
        }
        const normalized = mode && mode.toLowerCase() === 'normal' ? 'normal' : 'insert';
        applyMode(normalized);
    }
    static escapeHtml(text) {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }
    static escapeHtmlAttribute(text) {
        return text
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }
    static normalizeScriptCodeText(text) {
        return text.replace(/\r\n?/g, '\n');
    }
    static getCodeEditorCaretOffset(element) {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0)
            return null;
        const range = selection.getRangeAt(0);
        if (!element.contains(range.startContainer))
            return null;
        return this.getCodeEditorOffsetForPosition(element, range.startContainer, range.startOffset);
    }
    static setCodeEditorCaretOffset(element, offset) {
        if (offset === null)
            return;
        this.setCodeEditorSelectionOffsets(element, offset, offset);
    }
    static insertTextAtCursor(element, text) {
        const selection = window.getSelection();
        if (!selection)
            return;
        if (!selection.rangeCount || !element.contains(selection.anchorNode)) {
            element.focus();
            const range = document.createRange();
            range.selectNodeContents(element);
            range.collapse(false);
            selection.removeAllRanges();
            selection.addRange(range);
        }
        const range = selection.getRangeAt(0);
        range.deleteContents();
        const textNode = document.createTextNode(text);
        range.insertNode(textNode);
        range.setStartAfter(textNode);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
    }
    static getCodeEditorSelectionOffsets(element) {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0)
            return null;
        const range = selection.getRangeAt(0);
        if (!element.contains(range.startContainer) || !element.contains(range.endContainer))
            return null;
        const start = this.getCodeEditorOffsetForPosition(element, range.startContainer, range.startOffset);
        const end = this.getCodeEditorOffsetForPosition(element, range.endContainer, range.endOffset);
        if (start === null || end === null)
            return null;
        return start <= end ? { start, end } : { start: end, end: start };
    }
    static getCodeEditorOffsetForPosition(element, container, offset) {
        const range = document.createRange();
        range.selectNodeContents(element);
        try {
            range.setEnd(container, offset);
        }
        catch (_a) {
            return null;
        }
        const fragment = range.cloneContents();
        return this.getScriptCodeTextFromNode(fragment).length;
    }
    static setCodeEditorSelectionOffsets(element, startOffset, endOffset) {
        const selection = window.getSelection();
        if (!selection)
            return;
        const startPos = this.getCodeEditorPositionForOffset(element, startOffset);
        const endPos = this.getCodeEditorPositionForOffset(element, endOffset);
        const range = document.createRange();
        range.setStart(startPos.container, startPos.offset);
        range.setEnd(endPos.container, endPos.offset);
        selection.removeAllRanges();
        selection.addRange(range);
    }
    static getCodeEditorPositionForOffset(element, offset) {
        let remaining = Math.max(0, offset);
        let found = null;
        const walk = (node) => {
            var _a;
            if (found)
                return;
            if (node.nodeType === Node.TEXT_NODE) {
                const textLength = ((_a = node.textContent) === null || _a === void 0 ? void 0 : _a.length) || 0;
                if (remaining <= textLength) {
                    found = { container: node, offset: remaining };
                    return;
                }
                remaining -= textLength;
            }
            else if (node.nodeType === Node.ELEMENT_NODE) {
                const el = node;
                if (el.tagName === 'BR') {
                    if (remaining === 0) {
                        const parent = el.parentNode || element;
                        const index = Array.prototype.indexOf.call(parent.childNodes, el);
                        found = { container: parent, offset: index };
                        return;
                    }
                    remaining--;
                    if (remaining === 0) {
                        const parent = el.parentNode || element;
                        const index = Array.prototype.indexOf.call(parent.childNodes, el);
                        found = { container: parent, offset: index + 1 };
                        return;
                    }
                }
                else {
                    node.childNodes.forEach(walk);
                }
            }
        };
        element.childNodes.forEach(walk);
        if (found) {
            return found;
        }
        return { container: element, offset: element.childNodes.length };
    }
    static applyCodeIndentation(text, startOffset, endOffset, isUnindent) {
        const safeText = text || '';
        let effectiveEnd = endOffset;
        if (effectiveEnd > 0 && effectiveEnd <= safeText.length && safeText[effectiveEnd - 1] === '\n' && startOffset !== endOffset) {
            effectiveEnd -= 1;
        }
        const lines = safeText.split('\n');
        const lineStartOffsets = [];
        let runningOffset = 0;
        for (const line of lines) {
            lineStartOffsets.push(runningOffset);
            runningOffset += line.length + 1;
        }
        let startLineIndex = 0;
        let endLineIndex = lines.length - 1;
        for (let i = 0; i < lines.length; i++) {
            const lineStart = lineStartOffsets[i];
            const lineEnd = lineStart + lines[i].length;
            if (startOffset >= lineStart && startOffset <= lineEnd) {
                startLineIndex = i;
            }
            if (effectiveEnd >= lineStart && effectiveEnd <= lineEnd) {
                endLineIndex = i;
            }
        }
        const deltas = new Array(lines.length).fill(0);
        for (let i = startLineIndex; i <= endLineIndex; i++) {
            const line = lines[i];
            if (isUnindent) {
                if (line.startsWith('\t')) {
                    lines[i] = line.substring(1);
                    deltas[i] = -1;
                }
                else if (line.startsWith('  ')) {
                    lines[i] = line.substring(2);
                    deltas[i] = -2;
                }
            }
            else {
                lines[i] = '\t' + line;
                deltas[i] = 1;
            }
        }
        const adjustOffset = (offset) => {
            let adjusted = offset;
            for (let i = 0; i < lines.length; i++) {
                const lineStart = lineStartOffsets[i];
                const lineEnd = lineStart + (lines[i].length - deltas[i]);
                if (offset > lineEnd) {
                    adjusted += deltas[i];
                }
                else if (offset >= lineStart) {
                    adjusted += deltas[i];
                    break;
                }
            }
            return Math.max(0, adjusted);
        };
        const newStart = adjustOffset(startOffset);
        const newEnd = adjustOffset(endOffset);
        return { text: lines.join('\n'), start: newStart, end: newEnd };
    }
    static replaceCodeSelectionWithPair(text, startOffset, endOffset, openChar, closeChar) {
        const before = text.slice(0, startOffset);
        const after = text.slice(endOffset);
        const middle = text.slice(startOffset, endOffset);
        const updated = `${before}${openChar}${middle}${closeChar}${after}`;
        if (startOffset === endOffset) {
            const cursor = startOffset + openChar.length;
            return { text: updated, start: cursor, end: cursor };
        }
        return { text: updated, start: startOffset + openChar.length, end: endOffset + openChar.length };
    }
    static replaceCodeSelectionWithText(text, startOffset, endOffset, insertText) {
        const before = text.slice(0, startOffset);
        const after = text.slice(endOffset);
        const updated = `${before}${insertText}${after}`;
        const cursor = before.length + insertText.length;
        return { text: updated, start: cursor, end: cursor };
    }
    static updateCodeEditorLineNumbers(lineNumbersElement, text, editorElement, measureElement) {
        if (!lineNumbersElement)
            return;
        const normalized = this.normalizeScriptCodeText(text);
        const lineHeight = this.getLineHeight(editorElement);
        const style = window.getComputedStyle(editorElement);
        const whiteSpace = style.whiteSpace || 'pre-wrap';
        const wrapEnabled = whiteSpace === 'pre-wrap';
        if (measureElement) {
            measureElement.style.whiteSpace = whiteSpace;
        }
        if (!measureElement || !lineHeight || !wrapEnabled) {
            const lineCount = Math.max(1, normalized.split('\n').length);
            const lines = new Array(lineCount);
            for (let i = 0; i < lineCount; i++) {
                lines[i] = (i + 1).toString();
            }
            lineNumbersElement.textContent = lines.join('\n');
            return;
        }
        const lines = normalized.split('\n');
        const lineNumbers = [];
        const maxWidth = Math.max(1, editorElement.clientWidth);
        measureElement.style.width = `${maxWidth}px`;
        for (let i = 0; i < lines.length; i++) {
            const lineText = lines[i] === '' ? ' ' : lines[i];
            measureElement.textContent = lineText;
            const height = measureElement.getBoundingClientRect().height || lineHeight;
            const wraps = Math.max(1, Math.ceil(height / lineHeight - 0.01));
            lineNumbers.push((i + 1).toString());
            for (let j = 1; j < wraps; j++) {
                lineNumbers.push('');
            }
        }
        lineNumbersElement.textContent = lineNumbers.join('\n');
    }
    static getLineHeight(element) {
        const lineHeight = window.getComputedStyle(element).lineHeight;
        const parsed = parseFloat(lineHeight || '');
        return Number.isFinite(parsed) ? parsed : 0;
    }
    static ensureCodeEditorMeasureElement(editorElement, existingElement) {
        if (existingElement && existingElement.isConnected) {
            return existingElement;
        }
        const measure = document.createElement('div');
        const style = window.getComputedStyle(editorElement);
        measure.className = 'script-code-editor-measure';
        measure.style.fontFamily = style.fontFamily;
        measure.style.fontSize = style.fontSize;
        measure.style.fontWeight = style.fontWeight;
        measure.style.lineHeight = style.lineHeight;
        measure.style.whiteSpace = style.whiteSpace || 'pre-wrap';
        measure.style.position = 'absolute';
        measure.style.visibility = 'hidden';
        measure.style.pointerEvents = 'none';
        measure.style.left = '-9999px';
        measure.style.top = '0';
        measure.style.padding = '0';
        document.body.appendChild(measure);
        return measure;
    }
    static getScriptCodeTextFromNode(root) {
        let result = '';
        const walk = (node) => {
            var _a;
            if (node.nodeType === Node.TEXT_NODE) {
                result += this.normalizeScriptCodeText(node.textContent || '');
            }
            else if (node.nodeType === Node.ELEMENT_NODE) {
                const el = node;
                if (el.tagName === 'BR') {
                    result += '\n';
                }
                else if (el.tagName === 'DIV' || el.tagName === 'P') {
                    if (result.length > 0 && !result.endsWith('\n')) {
                        result += '\n';
                    }
                    node.childNodes.forEach(walk);
                }
                else {
                    node.childNodes.forEach(walk);
                }
            }
            else {
                (_a = node.childNodes) === null || _a === void 0 ? void 0 : _a.forEach(walk);
            }
        };
        walk(root);
        return result;
    }
    static initScriptEditorBlocks(blockIds, texts, builtInVars, dotNetRef) {
        blockIds.forEach((id, index) => {
            const elementId = `block-${id}`;
            const text = texts[index] || '';
            this.initScriptEditor(elementId, text, builtInVars);
            if (dotNetRef) {
                const element = document.getElementById(elementId);
                if (element) {
                    const existingHandler = element._inputHandler;
                    if (existingHandler) {
                        element.removeEventListener('input', existingHandler);
                    }
                    let debounceTimer = null;
                    const handler = () => {
                        if (debounceTimer)
                            clearTimeout(debounceTimer);
                        debounceTimer = setTimeout(() => {
                            const currentText = this.getScriptEditorBlockText(id);
                            safeInvoke(dotNetRef, 'OnBlockTextChanged', [id, currentText]);
                        }, 150);
                    };
                    element._inputHandler = handler;
                    element.addEventListener('input', handler);
                }
            }
        });
    }
    static getScriptEditorBlockText(blockId) {
        return this.getScriptEditorText(`block-${blockId}`);
    }
    static closeOpenMenus() {
        document.body.click();
    }
    static insertScriptVariableInBlocks(blockIds, varName, isBuiltIn) {
        const selection = window.getSelection();
        for (const id of blockIds) {
            const element = document.getElementById(`block-${id}`);
            if (element && selection && selection.anchorNode && element.contains(selection.anchorNode)) {
                this.insertScriptVariable(`block-${id}`, varName, isBuiltIn);
                return;
            }
        }
        if (blockIds.length > 0) {
            const firstBlockId = `block-${blockIds[0]}`;
            const element = document.getElementById(firstBlockId);
            if (element) {
                element.focus();
                const range = document.createRange();
                range.selectNodeContents(element);
                range.collapse(false);
                selection === null || selection === void 0 ? void 0 : selection.removeAllRanges();
                selection === null || selection === void 0 ? void 0 : selection.addRange(range);
                this.insertScriptVariable(firstBlockId, varName, isBuiltIn);
            }
        }
    }
    static isBlockEmpty(element) {
        let hasContent = false;
        const walk = (node) => {
            if (hasContent)
                return;
            if (node.nodeType === Node.TEXT_NODE) {
                if ((node.textContent || '').trim().length > 0) {
                    hasContent = true;
                }
            }
            else if (node.nodeType === Node.ELEMENT_NODE) {
                const el = node;
                if (el.classList.contains('script-var')) {
                    hasContent = true;
                }
                else if (el.tagName !== 'BR') {
                    el.childNodes.forEach(walk);
                }
            }
        };
        element.childNodes.forEach(walk);
        return !hasContent;
    }
    static isAtBlockStart(element) {
        var _a;
        const selection = window.getSelection();
        if (!selection || !selection.isCollapsed || selection.rangeCount === 0) {
            return false;
        }
        if (this.isBlockEmpty(element)) {
            return true;
        }
        const range = selection.getRangeAt(0);
        let node = range.startContainer;
        let offset = range.startOffset;
        if (offset !== 0) {
            return false;
        }
        while (node && node !== element) {
            const parent = node.parentNode;
            if (!parent)
                break;
            let sibling = node.previousSibling;
            while (sibling) {
                if (sibling.nodeName === 'BR') {
                    sibling = sibling.previousSibling;
                    continue;
                }
                if ((_a = sibling.classList) === null || _a === void 0 ? void 0 : _a.contains('script-var')) {
                    return false;
                }
                const text = sibling.textContent || '';
                if (text.trim().length > 0) {
                    return false;
                }
                sibling = sibling.previousSibling;
            }
            node = parent;
        }
        return true;
    }
    static isAtBlockEnd(element) {
        var _a, _b;
        const selection = window.getSelection();
        if (!selection || !selection.isCollapsed || selection.rangeCount === 0) {
            return false;
        }
        if (this.isBlockEmpty(element)) {
            return true;
        }
        const range = selection.getRangeAt(0);
        let node = range.startContainer;
        let offset = range.startOffset;
        if (node.nodeType === Node.TEXT_NODE) {
            if (offset !== (((_a = node.textContent) === null || _a === void 0 ? void 0 : _a.length) || 0)) {
                return false;
            }
        }
        while (node && node !== element) {
            const parent = node.parentNode;
            if (!parent)
                break;
            let sibling = node.nextSibling;
            while (sibling) {
                if (sibling.nodeName === 'BR') {
                    sibling = sibling.nextSibling;
                    continue;
                }
                if ((_b = sibling.classList) === null || _b === void 0 ? void 0 : _b.contains('script-var')) {
                    return false;
                }
                const text = sibling.textContent || '';
                if (text.trim().length > 0) {
                    return false;
                }
                sibling = sibling.nextSibling;
            }
            node = parent;
        }
        return true;
    }
    static focusBlockStart(blockId) {
        const element = document.getElementById(`block-${blockId}`);
        if (!element)
            return;
        element.focus();
        const selection = window.getSelection();
        if (selection) {
            const range = document.createRange();
            if (element.firstChild) {
                if (element.firstChild.nodeType === Node.TEXT_NODE) {
                    range.setStart(element.firstChild, 0);
                }
                else {
                    range.setStart(element, 0);
                }
            }
            else {
                range.setStart(element, 0);
            }
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
        }
    }
    static focusBlockEnd(blockId) {
        const element = document.getElementById(`block-${blockId}`);
        if (!element)
            return;
        element.focus();
        const selection = window.getSelection();
        if (selection) {
            const range = document.createRange();
            range.selectNodeContents(element);
            range.collapse(false);
            selection.removeAllRanges();
            selection.addRange(range);
        }
    }
    static setupBlockNavigation(blockIds) {
        for (let i = 0; i < blockIds.length; i++) {
            const currentBlockId = blockIds[i];
            const element = document.getElementById(`block-${currentBlockId}`);
            if (!element)
                continue;
            const existingHandler = element._blockNavHandler;
            if (existingHandler) {
                element.removeEventListener('keydown', existingHandler);
            }
            const prevBlockId = i > 0 ? blockIds[i - 1] : null;
            const nextBlockId = i < blockIds.length - 1 ? blockIds[i + 1] : null;
            const handler = (e) => {
                if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                    return;
                }
                if ((e.key === 'ArrowUp' || e.key === 'ArrowLeft') && prevBlockId !== null) {
                    if (this.isAtBlockStart(element)) {
                        e.preventDefault();
                        this.focusBlockEnd(prevBlockId);
                    }
                }
                if ((e.key === 'ArrowDown' || e.key === 'ArrowRight') && nextBlockId !== null) {
                    if (this.isAtBlockEnd(element)) {
                        e.preventDefault();
                        this.focusBlockStart(nextBlockId);
                    }
                }
            };
            element._blockNavHandler = handler;
            element.addEventListener('keydown', handler);
        }
    }
    static attachSelectAllHandler(containerId) {
        const container = document.getElementById(containerId);
        if (!container) {
            console.warn(`AiChatUtils: attachSelectAllHandler - Container with ID '${containerId}' not found`);
            return;
        }
        const handlerKey = `_selectAllHandler_${containerId}`;
        const mouseHandlerKey = `_selectAllMouseHandler_${containerId}`;
        const stateKey = `_selectAllLastClickInContainer_${containerId}`;
        const existingHandler = document[handlerKey];
        if (existingHandler) {
            document.removeEventListener('keydown', existingHandler, true);
        }
        const existingMouseHandler = document[mouseHandlerKey];
        if (existingMouseHandler) {
            document.removeEventListener('mousedown', existingMouseHandler, true);
        }
        const mouseHandler = (e) => {
            document[stateKey] = container.contains(e.target);
        };
        const keyHandler = (e) => {
            if (!((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a')) {
                return;
            }
            const selection = window.getSelection();
            const activeElement = document.activeElement;
            let isWithinContainer = false;
            if (activeElement && container.contains(activeElement)) {
                isWithinContainer = true;
            }
            if (!isWithinContainer && selection && selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                if (container.contains(range.commonAncestorContainer)) {
                    isWithinContainer = true;
                }
            }
            if (!isWithinContainer && document[stateKey] === true) {
                isWithinContainer = true;
            }
            if (!isWithinContainer) {
                return;
            }
            e.preventDefault();
            e.stopPropagation();
            const newRange = document.createRange();
            newRange.selectNodeContents(container);
            selection === null || selection === void 0 ? void 0 : selection.removeAllRanges();
            selection === null || selection === void 0 ? void 0 : selection.addRange(newRange);
        };
        document[handlerKey] = keyHandler;
        document[mouseHandlerKey] = mouseHandler;
        document.addEventListener('keydown', keyHandler, true);
        document.addEventListener('mousedown', mouseHandler, true);
    }
    static observeSentinel(sentinelId, scrollContainerId, dotNetRef, method) {
        AiChatUtils.disconnectSentinel();
        const sentinel = document.getElementById(sentinelId);
        const scrollContainer = document.getElementById(scrollContainerId);
        if (!sentinel || !scrollContainer)
            return;
        AiChatUtils.sentinelObserver = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) {
                safeInvoke(dotNetRef, method);
            }
        }, { root: scrollContainer, threshold: 0 });
        AiChatUtils.sentinelObserver.observe(sentinel);
    }
    static disconnectSentinel() {
        if (AiChatUtils.sentinelObserver) {
            AiChatUtils.sentinelObserver.disconnect();
            AiChatUtils.sentinelObserver = null;
        }
    }
}
AiChatUtils.autoScrollEnabled = true;
AiChatUtils.scrollContainer = null;
AiChatUtils.inputBlockObserver = null;
AiChatUtils.linkInterceptor = null;
AiChatUtils.sentinelObserver = null;
AiChatUtils.onUserScroll = () => {
    if (!AiChatUtils.scrollContainer) {
        return;
    }
    const container = AiChatUtils.scrollContainer;
    const scrollTop = container.scrollTop;
    const scrollHeight = container.scrollHeight;
    const clientHeight = container.clientHeight;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    const isAtBottom = distanceFromBottom <= 50;
    if (isAtBottom) {
        AiChatUtils.autoScrollEnabled = true;
    }
    else {
        AiChatUtils.autoScrollEnabled = false;
    }
};
//# sourceMappingURL=aiChatUtils.js.map