import {safeInvoke} from "./interop.js";

interface KeyboardSubscriber {
	ref: any;
	filter?: string[];
}

class Keyboard {
	private subscribers: KeyboardSubscriber[] = [];
	ignoreKeyboardShortcuts: boolean = false;
	suppressScopeElementId: string | null = null;
	isDialogShowing: boolean = false;
	dialogShortcuts: Set<string> = new Set();
	preventDefaultShortcuts: Set<string> = new Set();

	private isOnlyShiftKeyPressed: boolean = false;
	private isOnlyAltKeyPressed: boolean = false;
	private isOnlyCtrlKeyPressed: boolean = false;
	private isOnlyCmdKeyPressed: boolean = false;
	private isShiftAndAltOnlyPressed: boolean = false;

	boundHandleKeyDown: EventListener;
	boundHandleKeyUp: EventListener;
	boundHandleWindowBlur: () => void;
	boundHandleWindowFocus: () => void;
	private pressedCombos: Set<string> = new Set();

	// Track state for safe single-key detection
	private modifierDown: Set<string> = new Set();
	private nonModState: Map<string, { hadModifierDuringHold: boolean; keyName: string; elementWhenPressed: HTMLElement }> = new Map();

	constructor() {
		this.boundHandleKeyDown = this.handleKeyDown.bind(this) as EventListener;
		this.boundHandleKeyUp = this.handleKeyUp.bind(this) as EventListener;
		this.boundHandleWindowBlur = () => this.handleWindowBlur();
		this.boundHandleWindowFocus = () => this.handleWindowFocus();
	}

	init(): void {
		window.addEventListener("keydown", this.boundHandleKeyDown);
		window.addEventListener("keyup", this.boundHandleKeyUp);
		window.addEventListener("blur", this.boundHandleWindowBlur);
		window.addEventListener("focus", this.boundHandleWindowFocus);
	}

	// Called from Blazor
	addSubscriber(dotNetRef: any, filter?: string[]): void {
		this.subscribers.push({ref: dotNetRef, filter});
	}

	// Called from Blazor
	removeSubscriber(dotNetRef: any): void {
		this.subscribers = this.subscribers.filter(s => s.ref !== dotNetRef);
	}

	// Called from Blazor
	// scopeElementId: when provided, suppression only applies while focus is inside that element.
	// Use this for inline dialogs (e.g. find/replace bar) so shortcuts triggered from outside the
	// dialog still fire. Omit (null) for global suppression — needed for shortcut-capture UIs.
	setIgnoreGlobalKeyboardShortcuts(ignore: boolean, scopeElementId: string | null = null): void {
		this.ignoreKeyboardShortcuts = ignore;
		this.suppressScopeElementId = ignore ? scopeElementId : null;
		if (ignore) {
			this.pressedCombos.clear();
			this.modifierDown.clear();
			this.nonModState.clear();
		}
	}

	private isFocusInsideSuppressScope(): boolean {
		if(!this.suppressScopeElementId) return false;
		const scope = document.getElementById(this.suppressScopeElementId);
		if(!scope) return false;
		const active = document.activeElement as HTMLElement | null;
		return !!active && scope.contains(active);
	}

	// Called from Blazor
	setIsDialogShowing(isShowing: boolean): void {
		this.isDialogShowing = isShowing;
	}

	// Called from Blazor
	setDialogShortcuts(shortcuts: string[]): void {
		this.dialogShortcuts = new Set(shortcuts.map(s => this.canonicalizeCombo(s)));
	}

	// Called from Blazor
	setPreventDefaultShortcuts(shortcuts: string[]): void {
		this.preventDefaultShortcuts = new Set(shortcuts.map(s => this.canonicalizeCombo(s)));
	}

	// Rewrite a combo string from Blazor into the modifier order produced by normalizeKeyCombo
	// (Ctrl, Cmd, Shift, Alt) so set lookups match. The C# side emits a different order
	// (Cmd, Ctrl, Alt, Shift — see VulcanCommandManager.GetStringFromInputBinding), which made
	// combos like Alt+Shift+Up miss the preventDefault/dialog shortcut sets.
	private canonicalizeCombo(combo: string): string {
		const parts = combo.split("+");
		if (parts.length < 2) {
			return combo;
		}
		const synonyms: { [name: string]: string } = {
			Ctrl: "Ctrl", Control: "Ctrl",
			Cmd: "Cmd", Meta: "Cmd", Win: "Cmd",
			Shift: "Shift",
			Alt: "Alt", Option: "Alt"
		};
		const key = parts[parts.length - 1];
		const modifiers = new Set(parts.slice(0, -1).map(p => synonyms[p] ?? p));
		const ordered: string[] = [];
		for (const modifier of ["Ctrl", "Cmd", "Shift", "Alt"]) {
			if (modifiers.delete(modifier)) {
				ordered.push(modifier);
			}
		}
		// Preserve any unrecognized modifiers rather than dropping them
		ordered.push(...modifiers, key);
		return ordered.join("+");
	}

	private normalizeKeyCombo(event: KeyboardEvent, ignoreModifierOnly: boolean = true): string | null {
		const parts: string[] = [];

		// Order: Ctrl, Cmd, Shift, Alt - matches the format used in SystemShortcuts.json and InputBindings
		if (event.ctrlKey) parts.push("Ctrl");
		if (event.metaKey) parts.push("Cmd");
		if (event.shiftKey) parts.push("Shift");
		if (event.altKey) parts.push("Alt");

		let key = this.extractKey(event);

		if (!key || (ignoreModifierOnly && this.isModifierKey(key))) {
			return null;
		}

		parts.push(key);
		return parts.join("+");
	}

	// Resolve the logical key for shortcut matching.
	// Prefer event.key so non-QWERTY layouts (AZERTY, QWERTZ, Dvorak…) produce the character the user
	// actually typed — e.g. Ctrl+Z on AZERTY is undo, not close-tab. Shortcuts in SystemShortcuts.json
	// are declared as logical chars, so this aligns matching with how shortcuts are written.
	// Exception: with Shift held on a digit, event.key is the shifted symbol (e.g. "!" not "1"),
	// but shortcuts are declared like "Ctrl+Shift+1" — fall back to the physical digit from event.code.
	// Exception: on Apple platforms with Option held, event.key is the composed special character
	// (e.g. Option+C → "ç" on the U.S. layout), never the base key — fall back to event.code.
	private extractKey(event: KeyboardEvent): string | null {
		if(event.shiftKey && /^Digit\d$/.test(event.code)) {
			return this.getKeyFromCode(event.code);
		}
		if(event.altKey && this.isApplePlatform()) {
			const fromCode = this.getKeyFromCode(event.code);
			if(fromCode) {
				return fromCode;
			}
		}
		const fromKey = this.normalizeKey(event.key);
		if(fromKey && fromKey !== 'Dead' && fromKey !== 'Unidentified') {
			return fromKey;
		}
		return this.getKeyFromCode(event.code);
	}

	private getKeyFromCode(code: string): string | null {
		// Handle letter keys (KeyA -> A, KeyB -> B, etc.)
		const letterMatch = code.match(/^Key([A-Z])$/);
		if (letterMatch) {
			return letterMatch[1];
		}

		// Handle digit keys (Digit0 -> 0, Digit1 -> 1, etc.)
		const digitMatch = code.match(/^Digit(\d)$/);
		if (digitMatch) {
			return digitMatch[1];
		}

		// Handle symbol keys - map to their base character
		const symbolMap: { [code: string]: string } = {
			'Minus': '-',
			'Equal': '=',
			'BracketLeft': '[',
			'BracketRight': ']',
			'Backslash': '\\',
			'Semicolon': ';',
			'Quote': "'",
			'Comma': ',',
			'Period': '.',
			'Slash': '/',
			'Backquote': '`'
		};

		if (symbolMap[code]) {
			return symbolMap[code];
		}

		// For other codes, return null to fall back to event.key handling
		return null;
	}

	private normalizeKey(key: string): string {
		switch (key) {
			case ' ': return 'Space';
			case 'ArrowUp': return 'Up';
			case 'ArrowDown': return 'Down';
			case 'ArrowLeft': return 'Left';
			case 'ArrowRight': return 'Right';
			case 'Delete': return 'Del';
			case 'Enter': return 'Enter';
			case 'Tab': return 'Tab';
			case 'Backspace': return 'Backspace';
			case 'Escape': return 'Esc';
			default:
				if (key.length === 1) {
					return key.toUpperCase();
				} else if (key.startsWith('F') && /^F\d+$/.test(key)) {
					return key;
				} else if (['Home', 'End', 'PageUp', 'PageDown', 'Insert'].includes(key)) {
					return key;
				}
				return key;
		}
	}

	private isApplePlatform(): boolean {
		const userAgent = navigator.userAgent.toLowerCase();
		return /iphone|ipad|ipod|macintosh|mac os x/.test(userAgent);
	}

	private handleKeyDown(event: KeyboardEvent): void {
		const isRepeatEvent = event.repeat;
		
		// Reconcile modifier state with actual keyboard state before processing
		this.reconcileModifierState(event);

		// If this is a modifier key, we're done - reconciliation already handled it
		if (this.isModifierKey(event.key)) {
			return;
		}

		// Non-modifier key pressed - clear any "only" modifier states
		if (this.hasAnyOnlyModifierState()) {
			this.clearAllOnlyModifierStates();
			this.notifyOfOnlyModifierKeyChange();
		}

		// If non-modifier key is pressed, clear any existing combos that end with this key
		// This avoids stale combos blocking re-trigger when keyup didn't fire (e.g., macCatalyst focus loss)
		if (!this.isModifierKey(event.key)) {
			const keyFromCode = this.extractKey(event);
			if (keyFromCode) {
				for (const combo of Array.from(this.pressedCombos)) {
					const parts = combo.split('+');
					const last = parts[parts.length - 1];
					if (last === keyFromCode) {
						this.pressedCombos.delete(combo);
					}
				}
			}
		}

		// Record single-key state for keyup decision
		const anyModifierDown = this.modifierDown.size > 0 || event.ctrlKey || event.altKey || event.shiftKey || event.metaKey;
		const activeEl = document.activeElement as HTMLElement;
		this.nonModState.set(event.code, {
			hadModifierDuringHold: anyModifierDown,
			keyName: this.normalizeKey(event.key),
			elementWhenPressed: activeEl
		});

		// Handle combos immediately if any modifier is down (de-duped via pressedCombos)
		if (anyModifierDown) {
			const combo = this.normalizeKeyCombo(event);
			if (combo) {
				const isComboAlreadyPressed = this.pressedCombos.has(combo);
				if(!isComboAlreadyPressed) {
					this.pressedCombos.add(combo);
				} else if(!isRepeatEvent) {
					return;
				}

				if (this.preventDefaultShortcuts.has(combo)) {
					event.preventDefault();
				}

				if (!this.shouldExecuteShortcut(combo)) {
					// If shortcuts should not be executed, just track without invoking
					return;
				}

				const activeEl = document.activeElement as HTMLElement;
				const isEditableElement = this.isEditableElement(activeEl);
				this.notifySubscribers("HandleKeyboardShortcutAsyncWithRepeat", combo, isEditableElement, isRepeatEvent);
			}
		}
	}

	private handleKeyUp(event: KeyboardEvent): void {
		// Reconcile modifier state with actual keyboard state before processing
		this.reconcileModifierState(event);

		// If this is a modifier key, check if it's the last modifier in any pressed combos
		if (this.isModifierKey(event.key)) {
			// Check if this modifier being released is the only/last modifier in pressed combos
			const releasedModifier = this.normalizeModifierKey(event.code) || event.key;
			let shouldClear = false;
			
			if (this.pressedCombos.size > 0) {
				// Check if any pressed combo would have no modifiers left after releasing this one
				for (const combo of this.pressedCombos) {
					const parts = combo.split('+');
					const modifiers = parts.slice(0, -1); // All parts except the last (which is the key)
					
					// If this combo only has the modifier we're releasing, clear all combos
					if (modifiers.length === 1 && 
						(modifiers[0] === releasedModifier || 
						 (modifiers[0] === 'Ctrl' && releasedModifier === 'Control') ||
						 (modifiers[0] === 'Cmd' && releasedModifier === 'Meta'))) {
						shouldClear = true;
						break;
					}
				}
			}
			if (shouldClear) {
				// This handles the macOS case where only Cmd keyup is triggered for Cmd+key combos
				this.pressedCombos.clear();
			}
			return;
		}

		// Remove from pressed combos (in case it was part of one)
		const combo = this.normalizeKeyCombo(event);
		if (combo) {
			this.pressedCombos.delete(combo);
		}

		// Single key handling — only if no modifier was ever held during key press
		const state = this.nonModState.get(event.code);
		this.nonModState.delete(event.code);
		if(state && !state.hadModifierDuringHold) {
			// Use the element that was focused when the key was pressed, not the current one
			// This handles cases where focus changes between keydown and keyup (e.g., when dismissing a dialog)
			if(this.isEditableElement(state.elementWhenPressed)) {
				return; // Ignore single key presses in editable elements
			}

			if(!this.shouldExecuteShortcut(state.keyName)) {
				// If shortcuts should not be executed, just track the single key without invoking
				return;
			}

			this.notifySubscribers("HandleKeyboardSingleKeyPressAsync", state.keyName);
		}
	}

	private notifySubscribers(methodName: string, ...args: any[]): void {
		const param = args[0];
		this.subscribers.forEach(subscriber => {
			if(!subscriber.filter || subscriber.filter.length === 0 || subscriber.filter.includes(param)) {
				safeInvoke(subscriber.ref, methodName, args, () => {
					this.subscribers = this.subscribers.filter(s => s !== subscriber);
				});
			}
		});
	}

	private notifyOfOnlyModifierKeyChange(): void {
		if(!this.shouldExecuteModifierNotification()) {
			return;
		}

		this.subscribers.forEach(subscriber => {
			if(!subscriber.filter || subscriber.filter.length === 0 ||
				subscriber.filter.some(filter => this.isModifierKey(filter))) {
				safeInvoke(subscriber.ref, 'UpdateModifierKeyState', [
					this.isOnlyShiftKeyPressed,
					this.isOnlyAltKeyPressed,
					this.isOnlyCtrlKeyPressed,
					this.isOnlyCmdKeyPressed,
					this.isShiftAndAltOnlyPressed
				], () => {
					this.subscribers = this.subscribers.filter(s => s !== subscriber);
				});
			}
		});
	}

	private normalizeModifierKey(key: string): string {
		if (key === "ShiftLeft" || key === "ShiftRight") return "Shift";
		if (key === "ControlLeft" || key === "ControlRight") return "Control";
		if (key === "AltLeft" || key === "AltRight") return "Alt";
		if (key === "MetaLeft" || key === "MetaRight") return "Meta";
		return key;
	}

	private isModifierKey(k: string): boolean {
		return k === "Shift" || k === "Control" || k === "Ctrl" || k === "Alt" || k === "Meta" || k === "OS" ||
			k === "ShiftLeft" || k === "ShiftRight" || k === "ControlLeft" || k === "ControlRight" ||
			k === "AltLeft" || k === "AltRight" || k === "MetaLeft" || k === "MetaRight";
	}

	private hasAnyOnlyModifierState(): boolean {
		return this.isOnlyShiftKeyPressed || this.isOnlyAltKeyPressed || this.isOnlyCtrlKeyPressed || this.isOnlyCmdKeyPressed;
	}

	private clearAllOnlyModifierStates(): void {
		this.isOnlyShiftKeyPressed = false;
		this.isOnlyAltKeyPressed = false;
		this.isOnlyCtrlKeyPressed = false;
		this.isOnlyCmdKeyPressed = false;
	}

	private reconcileModifierState(event: KeyboardEvent): void {
		// Reconcile tracked modifier state with actual keyboard state
		const actualShift = event.shiftKey;
		const actualAlt = event.altKey;
		const actualCtrl = event.ctrlKey;
		const actualMeta = event.metaKey;

		const trackedShift = this.modifierDown.has('Shift');
		const trackedAlt = this.modifierDown.has('Alt');
		const trackedCtrl = this.modifierDown.has('Control') || this.modifierDown.has('Ctrl');
		const trackedMeta = this.modifierDown.has('Meta') || this.modifierDown.has('OS');

		let stateChanged = false;

		// Reconcile Shift key
		if (actualShift !== trackedShift) {
			if (actualShift) {
				this.modifierDown.add('Shift');
			} else {
				this.modifierDown.delete('Shift');
			}
			stateChanged = true;
		}

		// Reconcile Alt key
		if (actualAlt !== trackedAlt) {
			if (actualAlt) {
				this.modifierDown.add('Alt');
			} else {
				this.modifierDown.delete('Alt');
			}
			stateChanged = true;
		}

		// Reconcile Ctrl key
		if (actualCtrl !== trackedCtrl) {
			if (actualCtrl) {
				this.modifierDown.add('Control');
			} else {
				this.modifierDown.delete('Control');
				this.modifierDown.delete('Ctrl');
			}
			stateChanged = true;
		}

		// Reconcile Meta/Cmd key
		if (actualMeta !== trackedMeta) {
			if (actualMeta) {
				this.modifierDown.add('Meta');
			} else {
				this.modifierDown.delete('Meta');
				this.modifierDown.delete('OS');
			}
			stateChanged = true;
		}

		// If state changed, update "only" modifier states
		if (stateChanged) {
			// Recalculate "only" modifier states based on reconciled state
			const modifierCount = this.modifierDown.size;
			const prevShiftAndAlt = this.isShiftAndAltOnlyPressed;
			this.isShiftAndAltOnlyPressed = modifierCount === 2 && this.modifierDown.has('Shift') && this.modifierDown.has('Alt');
			
			if (modifierCount === 0) {
				// No modifiers pressed
				if (this.hasAnyOnlyModifierState()) {
					this.clearAllOnlyModifierStates();
					this.notifyOfOnlyModifierKeyChange();
				}
			} else if (modifierCount === 1) {
				// Exactly one modifier pressed
				const modifier = Array.from(this.modifierDown)[0];
				let newOnlyState = false;
				
				this.clearAllOnlyModifierStates();
				
				if (modifier === 'Shift') {
					this.isOnlyShiftKeyPressed = true;
					newOnlyState = true;
				} else if (modifier === 'Alt') {
					this.isOnlyAltKeyPressed = true;
					newOnlyState = true;
				} else if (modifier === 'Control' || modifier === 'Ctrl') {
					this.isOnlyCtrlKeyPressed = true;
					newOnlyState = true;
				} else if (modifier === 'Meta' || modifier === 'OS') {
					this.isOnlyCmdKeyPressed = true;
					newOnlyState = true;
				}
				
				if (newOnlyState) {
					this.notifyOfOnlyModifierKeyChange();
				}
			} else {
				// Multiple modifiers pressed
				if (this.hasAnyOnlyModifierState()) {
					this.clearAllOnlyModifierStates();
					this.notifyOfOnlyModifierKeyChange();
				}
			}

			if (prevShiftAndAlt !== this.isShiftAndAltOnlyPressed) {
				this.notifyOfOnlyModifierKeyChange();
			}
		}
	}

	private isEditableElement(element: HTMLElement): boolean {
		if (!element) return false;
		
		if(element.id === 'searchInputControl') return false;

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

	private shouldExecuteShortcut(shortcut: string): boolean {
		if (this.ignoreKeyboardShortcuts) {
			// Scoped suppression: only suppress when focus is inside the registered scope.
			// Global suppression (no scope) blocks all shortcuts.
			if(!this.suppressScopeElementId || this.isFocusInsideSuppressScope()) {
				return false;
			}
		}

		if (this.isDialogShowing) {
			return this.dialogShortcuts.has(shortcut);
		}

		return true;
	}

	private shouldExecuteModifierNotification(): boolean {
		if (this.ignoreKeyboardShortcuts) {
			if(!this.suppressScopeElementId || this.isFocusInsideSuppressScope()) {
				return false;
			}
		}

		if (this.isDialogShowing) {
			// Check if any of the currently pressed modifier keys are in dialog shortcuts
			let currentModifier = '';
			if (this.isOnlyShiftKeyPressed) currentModifier = 'Shift';
			else if (this.isOnlyAltKeyPressed) currentModifier = 'Alt';
			else if (this.isOnlyCtrlKeyPressed) currentModifier = 'Ctrl';
			else if (this.isOnlyCmdKeyPressed) currentModifier = 'Cmd';

			return currentModifier ? this.dialogShortcuts.has(currentModifier) : true;
		}

		return true;
	}

	private handleWindowBlur(): void {
		// Note: This does not get called on Mac/iOS when switching apps in Deku
		
		// Clear combo and non-modifier state when window loses focus
		this.pressedCombos.clear();
		this.nonModState.clear();
		// Note: We don't clear modifierDown anymore since reconcileModifierState 
		// will correct it on the next keyboard event
	}

	private handleWindowFocus(): void {
		// Note: This does not get called on Mac/iOS when switching apps in Deku

		// Clear combo and non-modifier state when regaining focus
		this.pressedCombos.clear();
		this.nonModState.clear();
		// Note: We don't clear modifierDown anymore since reconcileModifierState 
		// will correct it on the next keyboard event
	}

	getShiftKeyState(): boolean {
		return this.isOnlyShiftKeyPressed;
	}

	getAltKeyState(): boolean {
		return this.isOnlyAltKeyPressed;
	}

	getCtrlKeyState(): boolean {
		return this.isOnlyCtrlKeyPressed;
	}

	getCmdKeyState(): boolean {
		return this.isOnlyCmdKeyPressed;
	}

	getAllModifierStates(): { isOnlyShiftPressed: boolean, isOnlyAltPressed: boolean, isOnlyCtrlPressed: boolean, isOnlyCmdPressed: boolean, isShiftAndAltPressed: boolean } {
		return {
			isOnlyShiftPressed: this.isOnlyShiftKeyPressed,
			isOnlyAltPressed: this.isOnlyAltKeyPressed,
			isOnlyCtrlPressed: this.isOnlyCtrlKeyPressed,
			isOnlyCmdPressed: this.isOnlyCmdKeyPressed,
			isShiftAndAltPressed: this.isShiftAndAltOnlyPressed
		};
	}

	destroy(): void {
		window.removeEventListener("keydown", this.boundHandleKeyDown);
		window.removeEventListener("keyup", this.boundHandleKeyUp);
		window.removeEventListener("blur", this.boundHandleWindowBlur);
		window.removeEventListener("focus", this.boundHandleWindowFocus);
		this.subscribers = [];
		this.ignoreKeyboardShortcuts = false;
		this.isDialogShowing = false;
		this.dialogShortcuts.clear();
		this.preventDefaultShortcuts.clear();
		this.pressedCombos.clear();
		this.modifierDown.clear();
		this.nonModState.clear();
		this.clearAllOnlyModifierStates();
	}
}

export const keyboard: Keyboard = new Keyboard();
