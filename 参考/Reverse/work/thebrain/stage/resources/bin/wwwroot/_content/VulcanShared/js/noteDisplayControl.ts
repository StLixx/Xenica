import {safeInvoke} from "./interop.js";

class NoteDisplayControl {
    
    dotNetHelper: any;
    boundHandleContextMenu: EventListener;

    constructor() {
        this.boundHandleContextMenu = this.handleContextMenu.bind(this) as EventListener;
    }

    init(dotNetHelper: any) {
        this.dotNetHelper = dotNetHelper;
    }

    // Called from Blazor
    addMentionsEventListeners(isIosUser: boolean) {
        
        const eventType = isIosUser ? "longpress" : "contextmenu";
        
        // Select all elements with the 'recognized-text' class
        const recognizedElements = document.querySelectorAll('.recognized-text');

        recognizedElements.forEach((element) => {
            // Remove any existing touch event listeners to prevent duplicates
            element.removeEventListener(eventType, this.boundHandleContextMenu);

            // Add touch event listeners for long-press detection
            element.addEventListener(eventType, this.boundHandleContextMenu);
        });
    }

    handleContextMenu(event: Event) {
        event.preventDefault();
        
        const clientX = event instanceof CustomEvent ? event.detail.clientX : (event as MouseEvent).clientX;
        const clientY = event instanceof CustomEvent ? event.detail.clientY : (event as MouseEvent).clientY;

        const element = event.target as HTMLElement;
        const thoughtId = element.getAttribute('data-thought-id');
        const lineNumString = element.getAttribute('data-line-num');
        const offsetStartString = element.getAttribute('data-offset-start');
        const offsetEndString = element.getAttribute('data-offset-end');

        if(!element || !thoughtId || !lineNumString || !offsetStartString || !offsetEndString) {
            console.error('Failed to get thoughtId, lineNum, or offset from unlinked mention element');
            return;
        }

        const lineNum = parseInt(lineNumString, 10);
        const offsetStart = parseInt(offsetStartString, 10);
        const offsetEnd = parseInt(offsetEndString, 10);

        // Use detail.clientX and detail.clientY instead of event.clientX
        safeInvoke(this.dotNetHelper, 'ShowContextMenuForMention', [thoughtId, clientX, clientY, lineNum, offsetStart, offsetEnd]);
    }
}

export const noteDisplayControl: NoteDisplayControl = new NoteDisplayControl();
