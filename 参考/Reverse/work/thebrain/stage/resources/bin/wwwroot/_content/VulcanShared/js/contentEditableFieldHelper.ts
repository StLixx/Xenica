import {safeInvoke, safeInvokeAsync} from "./interop.js";

type ContentEditableFieldRegistration = {
    element: HTMLElement;
    dotNetHelper: any;
    callbacks: ContentEditableFieldCallbacks;
    onInput: EventListener;
    onKeydown: EventListener;
    onFocus: EventListener;
    onBlur: EventListener;
    onPaste: EventListener;
};

type ContentEditableFieldCallbacks = {
    onChanged: string;
    onFocused: string;
    onBlurred: string;
    onDoneEditing: string;
    onArrowDown?: string;
    onArrowUp?: string;
    onArrowLeft?: string;
    onArrowRight?: string;
};

class ContentEditableFieldHelper {

    private registrations: Map<string, ContentEditableFieldRegistration> = new Map();
    private pendingBlurPromise: Promise<void> | null = null;
    private isNavigating: boolean = false;

    // Called from Blazor
    init(dotNetHelper: any, fieldId: string, callbacks: ContentEditableFieldCallbacks) {
        this.dispose(fieldId);

        const element = document.getElementById(fieldId);
        if(!element) {
            return;
        }

        const registration: ContentEditableFieldRegistration = {
            element,
            dotNetHelper,
            callbacks,
            onInput: (event: Event) => {
                const target = event.target as HTMLElement | null;
                const value = target && target.textContent ? target.textContent : "";
                safeInvoke(dotNetHelper, callbacks.onChanged, [value]);
            },
            onKeydown: (event: Event) => {
                const keyEvent = event as KeyboardEvent;
                if(keyEvent.key === "Enter" || keyEvent.key === "Escape") {
                    keyEvent.preventDefault();
                    keyEvent.stopPropagation();
					if(element) {
						(element as HTMLElement).blur();
					}
					safeInvoke(dotNetHelper, callbacks.onDoneEditing);
                } else if(keyEvent.key === "ArrowDown" && callbacks.onArrowDown) {
                    if(this.isNavigating) return;
                    const selection = window.getSelection();
                    let xPosition: number | null = null;
                    if(selection && selection.rangeCount > 0) {
                        const range = selection.getRangeAt(0);
                        if(element.contains(range.commonAncestorContainer)) {
                            const rect = range.getBoundingClientRect();

                            // Check if cursor is on the last visual row of a wrapped field
                            const elementRect = element.getBoundingClientRect();
                            const style = window.getComputedStyle(element);
                            const paddingBottom = parseFloat(style.paddingBottom) || 0;
                            const contentBottom = elementRect.bottom - paddingBottom;
                            if(rect.height > 0 && rect.bottom < contentBottom - rect.height / 2) {
                                // Not on last visual row — let default arrow-down move within the field
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
                } else if(keyEvent.key === "ArrowUp" && callbacks.onArrowUp) {
                    if(this.isNavigating) return;
                    const selection = window.getSelection();
                    let xPosition: number | null = null;
                    if(selection && selection.rangeCount > 0) {
                        const range = selection.getRangeAt(0);
                        if(element.contains(range.commonAncestorContainer)) {
                            const rect = range.getBoundingClientRect();

                            // Check if cursor is on the first visual row of a wrapped field
                            const elementRect = element.getBoundingClientRect();
                            const style = window.getComputedStyle(element);
                            const paddingTop = parseFloat(style.paddingTop) || 0;
                            const contentTop = elementRect.top + paddingTop;
                            if(rect.height > 0 && rect.top > contentTop + rect.height / 2) {
                                // Not on first visual row — let default arrow-up move within the field
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
                } else if(keyEvent.key === "ArrowLeft" && callbacks.onArrowLeft) {
                    if(this.isNavigating) return;
                    // Check if cursor is at the start of the field
                    const selection = window.getSelection();
                    if(selection && selection.rangeCount > 0) {
                        const range = selection.getRangeAt(0);
                        const textNode = element.firstChild as Text;

                        // Handle empty field (no text node) or cursor at start
                        const isEmpty = !textNode || textNode.nodeType !== Node.TEXT_NODE;
                        const isAtStart = range.startOffset === 0;

                        if(element.contains(range.commonAncestorContainer) && (isEmpty || isAtStart)) {
                            // Cursor is at the start (or field is empty)
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
                } else if(keyEvent.key === "ArrowRight" && callbacks.onArrowRight) {
                    if(this.isNavigating) return;
                    // Check if cursor is at the end of the field
                    const selection = window.getSelection();
                    if(selection && selection.rangeCount > 0) {
                        const range = selection.getRangeAt(0);
                        const textNode = element.firstChild as Text;

                        // Handle empty field (no text node) or cursor at end of text node
                        const isEmpty = !textNode || textNode.nodeType !== Node.TEXT_NODE;
                        const isAtEnd = textNode && textNode.nodeType === Node.TEXT_NODE &&
                                       range.startOffset === textNode.length;

                        if(element.contains(range.commonAncestorContainer) && (isEmpty || isAtEnd)) {
                            // Cursor is at the end (or field is empty)
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
                // Pass current text directly from DOM so C# always has the latest value,
                // regardless of whether onInput's invokeMethodAsync has completed
                const currentText = element.textContent || "";
                this.pendingBlurPromise = safeInvokeAsync(dotNetHelper, callbacks.onBlurred, [currentText]);
                await this.pendingBlurPromise;
                this.pendingBlurPromise = null;
            },
            onPaste: (event: Event) => {
                const clipboardEvent = event as ClipboardEvent;
                const text = clipboardEvent.clipboardData?.getData('text/plain') || '';
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

    // Called from Blazor when the component is disposed so we can release listeners and references
    dispose(fieldId?: string) {
        if(fieldId) {
            this.disposeRegistration(fieldId);
        } else {
            const ids = Array.from(this.registrations.keys());
            for(const id of ids) {
                this.disposeRegistration(id);
            }
        }
    }

    private disposeRegistration(fieldId: string) {
        const registration = this.registrations.get(fieldId);
        if(!registration) {
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

    // Check if the registered element has been replaced in the DOM and re-initialize if so
    ensureAttached(fieldId: string): void {
        const registration = this.registrations.get(fieldId);
        if(!registration) return;

        const currentElement = document.getElementById(fieldId);
        if(!currentElement || currentElement === registration.element) return;

        // Element was replaced in DOM — re-initialize with stored config
        const { dotNetHelper, callbacks } = registration;
        this.init(dotNetHelper, fieldId, callbacks);
    }

    // Wait for any pending blur operation to complete
    async waitForPendingBlur(): Promise<void> {
        if(this.pendingBlurPromise) {
            await this.pendingBlurPromise;
        }
    }
}

export const contentEditableFieldHelper: ContentEditableFieldHelper = new ContentEditableFieldHelper();
