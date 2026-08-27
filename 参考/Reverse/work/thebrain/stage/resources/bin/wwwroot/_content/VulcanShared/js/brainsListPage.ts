import {safeInvoke} from "./interop.js";

class BrainsListPage {
	dotNetHelper: any;
	handleKeydownBound!: (event: KeyboardEvent) => void;

	constructor() {
	}

	// Called from blazor
	init(dotNetHelper: any) {
		this.dotNetHelper = dotNetHelper;

		this.handleKeydownBound = this.handleKeydown.bind(this);

		document.addEventListener('keydown', this.handleKeydownBound);
	}

	handleKeydown(event: KeyboardEvent) {
		if(!this.dotNetHelper) return;

		const key = event.key || event.code;

		// Check if we're in an editable element - if so, let it handle keys normally (except for Escape)
		const activeEl = document.activeElement as HTMLElement;
		const isInEditableElement = this.isEditableElement(activeEl);

		if(key === '/') {
			this.focusFilterBrainsInput(event);
			return;
		}

		if(key === 'Escape') {
			this.checkIfShouldStopFiltering(event);
			return;
		}

		// Don't handle arrow keys or Enter if we're in an editable element
		if(isInEditableElement) {
			return;
		}

		// Handle arrow keys, Home, and End
		if(key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight' ||
		   key === 'Up' || key === 'Down' || key === 'Left' || key === 'Right' ||
		   key === 'Home' || key === 'End') {
			safeInvoke(this.dotNetHelper, 'HandleKeyboardArrowNavigationAsync', [key]);
			event.preventDefault();
			return;
		}

		// Handle Enter key
		if(key === 'Enter' || key === 'NumpadEnter') {
			safeInvoke(this.dotNetHelper, 'HandleEnterKey');
			event.preventDefault();
			return;
		}
	}

	private isEditableElement(element: HTMLElement): boolean {
		if (!element) return false;

		const tagName = element.tagName.toLowerCase();

		// Check for input elements with text-like types
		if (tagName === 'input') {
			const inputType = (element as HTMLInputElement).type.toLowerCase();
			const textInputTypes = ['text', 'password', 'email', 'url', 'tel', 'search', 'number'];
			return textInputTypes.includes(inputType);
		}

		// Check for textarea
		if (tagName === 'textarea') {
			return true;
		}

		// Check for contenteditable elements
		if (element.contentEditable === 'true') {
			return true;
		}

		// Check for specific venus editor elements
		const editorIds = ['mdeHtml', 'mdeStyledMarkdownHtml', 'mdeText'];
		if (element.id && editorIds.includes(element.id)) {
			return true;
		}

		return false;
	}

	focusFilterBrainsInput(event: KeyboardEvent) {
		let isOtherInputElementFocused = document.activeElement instanceof HTMLInputElement;
		if(!isOtherInputElementFocused) {
			event.preventDefault();
			safeInvoke(this.dotNetHelper, 'StartFilteringFromShortcut');
		}
	}

	checkIfShouldStopFiltering(event: KeyboardEvent) {
		const inputIds = ['filter-brains-input', 'filter-brains-input-compact'];

		inputIds.forEach(id => {
			let inputElement = document.getElementById(id);
			if(inputElement && inputElement === document.activeElement) {
				event.preventDefault();
				inputElement.blur();
				safeInvoke(this.dotNetHelper, 'StopFilteringFromShortcut');
			}
		});
	}

	// Called from blazor
	scrollFocusedBrainIntoView(brainId: string) {
		const brainElement = document.querySelector(`[data-brain-id="${brainId}"]`) as HTMLElement;
		if (brainElement) {
			const rect = brainElement.getBoundingClientRect();
			const padding = 30; // pixels of padding

			// Check if element is outside viewport with padding
			if (rect.top < padding || rect.bottom > window.innerHeight - padding) {
				brainElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
			}
		}
	}

	// Called from blazor - returns the number of columns in the grid by detecting items in the same row
	getGridColumnCount(): number {
		const brainElements = document.querySelectorAll('[data-brain-id]');
		if (brainElements.length === 0) {
			return 1;
		}

		const firstElement = brainElements[0] as HTMLElement;
		const firstTop = firstElement.getBoundingClientRect().top;
		let columnCount = 1;

		// Count how many elements are at the same vertical position as the first element
		for (let i = 1; i < brainElements.length; i++) {
			const element = brainElements[i] as HTMLElement;
			const top = element.getBoundingClientRect().top;

			// Allow small tolerance for floating point differences
			if (Math.abs(top - firstTop) < 5) {
				columnCount++;
			} else {
				break; // We've reached a new row
			}
		}

		return columnCount;
	}

	// Called from blazor
	dispose() {
		document.removeEventListener('keydown', this.handleKeydownBound);
		this.dotNetHelper = null;
	}
}

export const brainsListPage: BrainsListPage = new BrainsListPage();
