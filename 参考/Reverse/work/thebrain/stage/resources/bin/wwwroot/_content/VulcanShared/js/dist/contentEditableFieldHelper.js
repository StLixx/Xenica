import { safeInvoke, safeInvokeAsync } from "./interop.js";
class ContentEditableFieldHelper {
    constructor() {
        this.registrations = new Map();
        this.pendingBlurPromise = null;
        this.isNavigating = false;
    }
    init(dotNetHelper, fieldId, callbacks) {
        this.dispose(fieldId);
        const element = document.getElementById(fieldId);
        if (!element) {
            return;
        }
        const registration = {
            element,
            dotNetHelper,
            callbacks,
            onInput: (event) => {
                const target = event.target;
                const value = target && target.textContent ? target.textContent : "";
                safeInvoke(dotNetHelper, callbacks.onChanged, [value]);
            },
            onKeydown: (event) => {
                const keyEvent = event;
                if (keyEvent.key === "Enter" || keyEvent.key === "Escape") {
                    keyEvent.preventDefault();
                    keyEvent.stopPropagation();
                    if (element) {
                        element.blur();
                    }
                    safeInvoke(dotNetHelper, callbacks.onDoneEditing);
                }
                else if (keyEvent.key === "ArrowDown" && callbacks.onArrowDown) {
                    if (this.isNavigating)
                        return;
                    const selection = window.getSelection();
                    let xPosition = null;
                    if (selection && selection.rangeCount > 0) {
                        const range = selection.getRangeAt(0);
                        if (element.contains(range.commonAncestorContainer)) {
                            const rect = range.getBoundingClientRect();
                            const elementRect = element.getBoundingClientRect();
                            const style = window.getComputedStyle(element);
                            const paddingBottom = parseFloat(style.paddingBottom) || 0;
                            const contentBottom = elementRect.bottom - paddingBottom;
                            if (rect.height > 0 && rect.bottom < contentBottom - rect.height / 2) {
                                return;
                            }
                            xPosition = rect.left;
                        }
                    }
                    keyEvent.preventDefault();
                    keyEvent.stopPropagation();
                    this.isNavigating = true;
                    safeInvokeAsync(dotNetHelper, callbacks.onArrowDown, [xPosition]).then(() => {
                        this.isNavigating = false;
                    }, () => {
                        this.isNavigating = false;
                    });
                }
                else if (keyEvent.key === "ArrowUp" && callbacks.onArrowUp) {
                    if (this.isNavigating)
                        return;
                    const selection = window.getSelection();
                    let xPosition = null;
                    if (selection && selection.rangeCount > 0) {
                        const range = selection.getRangeAt(0);
                        if (element.contains(range.commonAncestorContainer)) {
                            const rect = range.getBoundingClientRect();
                            const elementRect = element.getBoundingClientRect();
                            const style = window.getComputedStyle(element);
                            const paddingTop = parseFloat(style.paddingTop) || 0;
                            const contentTop = elementRect.top + paddingTop;
                            if (rect.height > 0 && rect.top > contentTop + rect.height / 2) {
                                return;
                            }
                            xPosition = rect.left;
                        }
                    }
                    keyEvent.preventDefault();
                    keyEvent.stopPropagation();
                    this.isNavigating = true;
                    safeInvokeAsync(dotNetHelper, callbacks.onArrowUp, [xPosition]).then(() => {
                        this.isNavigating = false;
                    }, () => {
                        this.isNavigating = false;
                    });
                }
                else if (keyEvent.key === "ArrowLeft" && callbacks.onArrowLeft) {
                    if (this.isNavigating)
                        return;
                    const selection = window.getSelection();
                    if (selection && selection.rangeCount > 0) {
                        const range = selection.getRangeAt(0);
                        const textNode = element.firstChild;
                        const isEmpty = !textNode || textNode.nodeType !== Node.TEXT_NODE;
                        const isAtStart = range.startOffset === 0;
                        if (element.contains(range.commonAncestorContainer) && (isEmpty || isAtStart)) {
                            keyEvent.preventDefault();
                            keyEvent.stopPropagation();
                            this.isNavigating = true;
                            safeInvokeAsync(dotNetHelper, callbacks.onArrowLeft).then(() => {
                                this.isNavigating = false;
                            }, () => {
                                this.isNavigating = false;
                            });
                        }
                    }
                }
                else if (keyEvent.key === "ArrowRight" && callbacks.onArrowRight) {
                    if (this.isNavigating)
                        return;
                    const selection = window.getSelection();
                    if (selection && selection.rangeCount > 0) {
                        const range = selection.getRangeAt(0);
                        const textNode = element.firstChild;
                        const isEmpty = !textNode || textNode.nodeType !== Node.TEXT_NODE;
                        const isAtEnd = textNode && textNode.nodeType === Node.TEXT_NODE &&
                            range.startOffset === textNode.length;
                        if (element.contains(range.commonAncestorContainer) && (isEmpty || isAtEnd)) {
                            keyEvent.preventDefault();
                            keyEvent.stopPropagation();
                            this.isNavigating = true;
                            safeInvokeAsync(dotNetHelper, callbacks.onArrowRight).then(() => {
                                this.isNavigating = false;
                            }, () => {
                                this.isNavigating = false;
                            });
                        }
                    }
                }
            },
            onFocus: () => {
                safeInvoke(dotNetHelper, callbacks.onFocused);
            },
            onBlur: async () => {
                const currentText = element.textContent || "";
                this.pendingBlurPromise = safeInvokeAsync(dotNetHelper, callbacks.onBlurred, [currentText]);
                await this.pendingBlurPromise;
                this.pendingBlurPromise = null;
            },
            onPaste: (event) => {
                var _a;
                const clipboardEvent = event;
                const text = ((_a = clipboardEvent.clipboardData) === null || _a === void 0 ? void 0 : _a.getData('text/plain')) || '';
                const sanitizedText = text.replace(/\r/g, '').replace(/\n/g, '');
                clipboardEvent.preventDefault();
                document.execCommand('insertText', false, sanitizedText);
            }
        };
        element.addEventListener("input", registration.onInput);
        element.addEventListener("keydown", registration.onKeydown);
        element.addEventListener("focus", registration.onFocus);
        element.addEventListener("blur", registration.onBlur);
        element.addEventListener("paste", registration.onPaste);
        this.registrations.set(fieldId, registration);
        console.log(`ContentEditableFieldHelper: Initialized for element with ID ${fieldId}`);
    }
    dispose(fieldId) {
        if (fieldId) {
            this.disposeRegistration(fieldId);
        }
        else {
            const ids = Array.from(this.registrations.keys());
            for (const id of ids) {
                this.disposeRegistration(id);
            }
        }
    }
    disposeRegistration(fieldId) {
        const registration = this.registrations.get(fieldId);
        if (!registration) {
            return;
        }
        const { element, onInput, onKeydown, onFocus, onBlur, onPaste } = registration;
        element.removeEventListener("input", onInput);
        element.removeEventListener("keydown", onKeydown);
        element.removeEventListener("focus", onFocus);
        element.removeEventListener("blur", onBlur);
        element.removeEventListener("paste", onPaste);
        this.registrations.delete(fieldId);
        console.log(`ContentEditableFieldHelper: Disposed for element with ID ${fieldId}`);
    }
    ensureAttached(fieldId) {
        const registration = this.registrations.get(fieldId);
        if (!registration)
            return;
        const currentElement = document.getElementById(fieldId);
        if (!currentElement || currentElement === registration.element)
            return;
        const { dotNetHelper, callbacks } = registration;
        this.init(dotNetHelper, fieldId, callbacks);
    }
    async waitForPendingBlur() {
        if (this.pendingBlurPromise) {
            await this.pendingBlurPromise;
        }
    }
}
export const contentEditableFieldHelper = new ContentEditableFieldHelper();
//# sourceMappingURL=contentEditableFieldHelper.js.map