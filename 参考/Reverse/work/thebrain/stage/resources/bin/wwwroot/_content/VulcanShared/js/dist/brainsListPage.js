import { safeInvoke } from "./interop.js";
class BrainsListPage {
    constructor() {
    }
    init(dotNetHelper) {
        this.dotNetHelper = dotNetHelper;
        this.handleKeydownBound = this.handleKeydown.bind(this);
        document.addEventListener('keydown', this.handleKeydownBound);
    }
    handleKeydown(event) {
        if (!this.dotNetHelper)
            return;
        const key = event.key || event.code;
        const activeEl = document.activeElement;
        const isInEditableElement = this.isEditableElement(activeEl);
        if (key === '/') {
            this.focusFilterBrainsInput(event);
            return;
        }
        if (key === 'Escape') {
            this.checkIfShouldStopFiltering(event);
            return;
        }
        if (isInEditableElement) {
            return;
        }
        if (key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight' ||
            key === 'Up' || key === 'Down' || key === 'Left' || key === 'Right' ||
            key === 'Home' || key === 'End') {
            safeInvoke(this.dotNetHelper, 'HandleKeyboardArrowNavigationAsync', [key]);
            event.preventDefault();
            return;
        }
        if (key === 'Enter' || key === 'NumpadEnter') {
            safeInvoke(this.dotNetHelper, 'HandleEnterKey');
            event.preventDefault();
            return;
        }
    }
    isEditableElement(element) {
        if (!element)
            return false;
        const tagName = element.tagName.toLowerCase();
        if (tagName === 'input') {
            const inputType = element.type.toLowerCase();
            const textInputTypes = ['text', 'password', 'email', 'url', 'tel', 'search', 'number'];
            return textInputTypes.includes(inputType);
        }
        if (tagName === 'textarea') {
            return true;
        }
        if (element.contentEditable === 'true') {
            return true;
        }
        const editorIds = ['mdeHtml', 'mdeStyledMarkdownHtml', 'mdeText'];
        if (element.id && editorIds.includes(element.id)) {
            return true;
        }
        return false;
    }
    focusFilterBrainsInput(event) {
        let isOtherInputElementFocused = document.activeElement instanceof HTMLInputElement;
        if (!isOtherInputElementFocused) {
            event.preventDefault();
            safeInvoke(this.dotNetHelper, 'StartFilteringFromShortcut');
        }
    }
    checkIfShouldStopFiltering(event) {
        const inputIds = ['filter-brains-input', 'filter-brains-input-compact'];
        inputIds.forEach(id => {
            let inputElement = document.getElementById(id);
            if (inputElement && inputElement === document.activeElement) {
                event.preventDefault();
                inputElement.blur();
                safeInvoke(this.dotNetHelper, 'StopFilteringFromShortcut');
            }
        });
    }
    scrollFocusedBrainIntoView(brainId) {
        const brainElement = document.querySelector(`[data-brain-id="${brainId}"]`);
        if (brainElement) {
            const rect = brainElement.getBoundingClientRect();
            const padding = 30;
            if (rect.top < padding || rect.bottom > window.innerHeight - padding) {
                brainElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    }
    getGridColumnCount() {
        const brainElements = document.querySelectorAll('[data-brain-id]');
        if (brainElements.length === 0) {
            return 1;
        }
        const firstElement = brainElements[0];
        const firstTop = firstElement.getBoundingClientRect().top;
        let columnCount = 1;
        for (let i = 1; i < brainElements.length; i++) {
            const element = brainElements[i];
            const top = element.getBoundingClientRect().top;
            if (Math.abs(top - firstTop) < 5) {
                columnCount++;
            }
            else {
                break;
            }
        }
        return columnCount;
    }
    dispose() {
        document.removeEventListener('keydown', this.handleKeydownBound);
        this.dotNetHelper = null;
    }
}
export const brainsListPage = new BrainsListPage();
//# sourceMappingURL=brainsListPage.js.map