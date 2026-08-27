import { safeInvoke } from "./interop.js";
class NoteDisplayControl {
    constructor() {
        this.boundHandleContextMenu = this.handleContextMenu.bind(this);
    }
    init(dotNetHelper) {
        this.dotNetHelper = dotNetHelper;
    }
    addMentionsEventListeners(isIosUser) {
        const eventType = isIosUser ? "longpress" : "contextmenu";
        const recognizedElements = document.querySelectorAll('.recognized-text');
        recognizedElements.forEach((element) => {
            element.removeEventListener(eventType, this.boundHandleContextMenu);
            element.addEventListener(eventType, this.boundHandleContextMenu);
        });
    }
    handleContextMenu(event) {
        event.preventDefault();
        const clientX = event instanceof CustomEvent ? event.detail.clientX : event.clientX;
        const clientY = event instanceof CustomEvent ? event.detail.clientY : event.clientY;
        const element = event.target;
        const thoughtId = element.getAttribute('data-thought-id');
        const lineNumString = element.getAttribute('data-line-num');
        const offsetStartString = element.getAttribute('data-offset-start');
        const offsetEndString = element.getAttribute('data-offset-end');
        if (!element || !thoughtId || !lineNumString || !offsetStartString || !offsetEndString) {
            console.error('Failed to get thoughtId, lineNum, or offset from unlinked mention element');
            return;
        }
        const lineNum = parseInt(lineNumString, 10);
        const offsetStart = parseInt(offsetStartString, 10);
        const offsetEnd = parseInt(offsetEndString, 10);
        safeInvoke(this.dotNetHelper, 'ShowContextMenuForMention', [thoughtId, clientX, clientY, lineNum, offsetStart, offsetEnd]);
    }
}
export const noteDisplayControl = new NoteDisplayControl();
//# sourceMappingURL=noteDisplayControl.js.map