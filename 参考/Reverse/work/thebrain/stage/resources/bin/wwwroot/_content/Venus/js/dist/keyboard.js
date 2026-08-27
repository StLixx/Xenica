import { safeInvoke } from "./interop.js";
class Keyboard {
    constructor() {
        this.subscribers = [];
        this.ignoreKeyboardShortcuts = false;
        this.suppressScopeElementId = null;
        this.isDialogShowing = false;
        this.dialogShortcuts = new Set();
        this.preventDefaultShortcuts = new Set();
        this.isOnlyShiftKeyPressed = false;
        this.isOnlyAltKeyPressed = false;
        this.isOnlyCtrlKeyPressed = false;
        this.isOnlyCmdKeyPressed = false;
        this.isShiftAndAltOnlyPressed = false;
        this.pressedCombos = new Set();
        this.modifierDown = new Set();
        this.nonModState = new Map();
        this.boundHandleKeyDown = this.handleKeyDown.bind(this);
        this.boundHandleKeyUp = this.handleKeyUp.bind(this);
        this.boundHandleWindowBlur = () => this.handleWindowBlur();
        this.boundHandleWindowFocus = () => this.handleWindowFocus();
    }
    init() {
        window.addEventListener("keydown", this.boundHandleKeyDown);
        window.addEventListener("keyup", this.boundHandleKeyUp);
        window.addEventListener("blur", this.boundHandleWindowBlur);
        window.addEventListener("focus", this.boundHandleWindowFocus);
    }
    addSubscriber(dotNetRef, filter) {
        this.subscribers.push({ ref: dotNetRef, filter });
    }
    removeSubscriber(dotNetRef) {
        this.subscribers = this.subscribers.filter(s => s.ref !== dotNetRef);
    }
    setIgnoreGlobalKeyboardShortcuts(ignore, scopeElementId = null) {
        this.ignoreKeyboardShortcuts = ignore;
        this.suppressScopeElementId = ignore ? scopeElementId : null;
        if (ignore) {
            this.pressedCombos.clear();
            this.modifierDown.clear();
            this.nonModState.clear();
        }
    }
    isFocusInsideSuppressScope() {
        if (!this.suppressScopeElementId)
            return false;
        const scope = document.getElementById(this.suppressScopeElementId);
        if (!scope)
            return false;
        const active = document.activeElement;
        return !!active && scope.contains(active);
    }
    setIsDialogShowing(isShowing) {
        this.isDialogShowing = isShowing;
    }
    setDialogShortcuts(shortcuts) {
        this.dialogShortcuts = new Set(shortcuts.map(s => this.canonicalizeCombo(s)));
    }
    setPreventDefaultShortcuts(shortcuts) {
        this.preventDefaultShortcuts = new Set(shortcuts.map(s => this.canonicalizeCombo(s)));
    }
    canonicalizeCombo(combo) {
        const parts = combo.split("+");
        if (parts.length < 2) {
            return combo;
        }
        const synonyms = {
            Ctrl: "Ctrl", Control: "Ctrl",
            Cmd: "Cmd", Meta: "Cmd", Win: "Cmd",
            Shift: "Shift",
            Alt: "Alt", Option: "Alt"
        };
        const key = parts[parts.length - 1];
        const modifiers = new Set(parts.slice(0, -1).map(p => { var _a; return (_a = synonyms[p]) !== null && _a !== void 0 ? _a : p; }));
        const ordered = [];
        for (const modifier of ["Ctrl", "Cmd", "Shift", "Alt"]) {
            if (modifiers.delete(modifier)) {
                ordered.push(modifier);
            }
        }
        ordered.push(...modifiers, key);
        return ordered.join("+");
    }
    normalizeKeyCombo(event, ignoreModifierOnly = true) {
        const parts = [];
        if (event.ctrlKey)
            parts.push("Ctrl");
        if (event.metaKey)
            parts.push("Cmd");
        if (event.shiftKey)
            parts.push("Shift");
        if (event.altKey)
            parts.push("Alt");
        let key = this.extractKey(event);
        if (!key || (ignoreModifierOnly && this.isModifierKey(key))) {
            return null;
        }
        parts.push(key);
        return parts.join("+");
    }
    extractKey(event) {
        if (event.shiftKey && /^Digit\d$/.test(event.code)) {
            return this.getKeyFromCode(event.code);
        }
        if (event.altKey && this.isApplePlatform()) {
            const fromCode = this.getKeyFromCode(event.code);
            if (fromCode) {
                return fromCode;
            }
        }
        const fromKey = this.normalizeKey(event.key);
        if (fromKey && fromKey !== 'Dead' && fromKey !== 'Unidentified') {
            return fromKey;
        }
        return this.getKeyFromCode(event.code);
    }
    getKeyFromCode(code) {
        const letterMatch = code.match(/^Key([A-Z])$/);
        if (letterMatch) {
            return letterMatch[1];
        }
        const digitMatch = code.match(/^Digit(\d)$/);
        if (digitMatch) {
            return digitMatch[1];
        }
        const symbolMap = {
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
        return null;
    }
    normalizeKey(key) {
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
                }
                else if (key.startsWith('F') && /^F\d+$/.test(key)) {
                    return key;
                }
                else if (['Home', 'End', 'PageUp', 'PageDown', 'Insert'].includes(key)) {
                    return key;
                }
                return key;
        }
    }
    isApplePlatform() {
        const userAgent = navigator.userAgent.toLowerCase();
        return /iphone|ipad|ipod|macintosh|mac os x/.test(userAgent);
    }
    handleKeyDown(event) {
        const isRepeatEvent = event.repeat;
        this.reconcileModifierState(event);
        if (this.isModifierKey(event.key)) {
            return;
        }
        if (this.hasAnyOnlyModifierState()) {
            this.clearAllOnlyModifierStates();
            this.notifyOfOnlyModifierKeyChange();
        }
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
        const anyModifierDown = this.modifierDown.size > 0 || event.ctrlKey || event.altKey || event.shiftKey || event.metaKey;
        const activeEl = document.activeElement;
        this.nonModState.set(event.code, {
            hadModifierDuringHold: anyModifierDown,
            keyName: this.normalizeKey(event.key),
            elementWhenPressed: activeEl
        });
        if (anyModifierDown) {
            const combo = this.normalizeKeyCombo(event);
            if (combo) {
                const isComboAlreadyPressed = this.pressedCombos.has(combo);
                if (!isComboAlreadyPressed) {
                    this.pressedCombos.add(combo);
                }
                else if (!isRepeatEvent) {
                    return;
                }
                if (this.preventDefaultShortcuts.has(combo)) {
                    event.preventDefault();
                }
                if (!this.shouldExecuteShortcut(combo)) {
                    return;
                }
                const activeEl = document.activeElement;
                const isEditableElement = this.isEditableElement(activeEl);
                this.notifySubscribers("HandleKeyboardShortcutAsyncWithRepeat", combo, isEditableElement, isRepeatEvent);
            }
        }
    }
    handleKeyUp(event) {
        this.reconcileModifierState(event);
        if (this.isModifierKey(event.key)) {
            const releasedModifier = this.normalizeModifierKey(event.code) || event.key;
            let shouldClear = false;
            if (this.pressedCombos.size > 0) {
                for (const combo of this.pressedCombos) {
                    const parts = combo.split('+');
                    const modifiers = parts.slice(0, -1);
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
                this.pressedCombos.clear();
            }
            return;
        }
        const combo = this.normalizeKeyCombo(event);
        if (combo) {
            this.pressedCombos.delete(combo);
        }
        const state = this.nonModState.get(event.code);
        this.nonModState.delete(event.code);
        if (state && !state.hadModifierDuringHold) {
            if (this.isEditableElement(state.elementWhenPressed)) {
                return;
            }
            if (!this.shouldExecuteShortcut(state.keyName)) {
                return;
            }
            this.notifySubscribers("HandleKeyboardSingleKeyPressAsync", state.keyName);
        }
    }
    notifySubscribers(methodName, ...args) {
        const param = args[0];
        this.subscribers.forEach(subscriber => {
            if (!subscriber.filter || subscriber.filter.length === 0 || subscriber.filter.includes(param)) {
                safeInvoke(subscriber.ref, methodName, args, () => {
                    this.subscribers = this.subscribers.filter(s => s !== subscriber);
                });
            }
        });
    }
    notifyOfOnlyModifierKeyChange() {
        if (!this.shouldExecuteModifierNotification()) {
            return;
        }
        this.subscribers.forEach(subscriber => {
            if (!subscriber.filter || subscriber.filter.length === 0 ||
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
    normalizeModifierKey(key) {
        if (key === "ShiftLeft" || key === "ShiftRight")
            return "Shift";
        if (key === "ControlLeft" || key === "ControlRight")
            return "Control";
        if (key === "AltLeft" || key === "AltRight")
            return "Alt";
        if (key === "MetaLeft" || key === "MetaRight")
            return "Meta";
        return key;
    }
    isModifierKey(k) {
        return k === "Shift" || k === "Control" || k === "Ctrl" || k === "Alt" || k === "Meta" || k === "OS" ||
            k === "ShiftLeft" || k === "ShiftRight" || k === "ControlLeft" || k === "ControlRight" ||
            k === "AltLeft" || k === "AltRight" || k === "MetaLeft" || k === "MetaRight";
    }
    hasAnyOnlyModifierState() {
        return this.isOnlyShiftKeyPressed || this.isOnlyAltKeyPressed || this.isOnlyCtrlKeyPressed || this.isOnlyCmdKeyPressed;
    }
    clearAllOnlyModifierStates() {
        this.isOnlyShiftKeyPressed = false;
        this.isOnlyAltKeyPressed = false;
        this.isOnlyCtrlKeyPressed = false;
        this.isOnlyCmdKeyPressed = false;
    }
    reconcileModifierState(event) {
        const actualShift = event.shiftKey;
        const actualAlt = event.altKey;
        const actualCtrl = event.ctrlKey;
        const actualMeta = event.metaKey;
        const trackedShift = this.modifierDown.has('Shift');
        const trackedAlt = this.modifierDown.has('Alt');
        const trackedCtrl = this.modifierDown.has('Control') || this.modifierDown.has('Ctrl');
        const trackedMeta = this.modifierDown.has('Meta') || this.modifierDown.has('OS');
        let stateChanged = false;
        if (actualShift !== trackedShift) {
            if (actualShift) {
                this.modifierDown.add('Shift');
            }
            else {
                this.modifierDown.delete('Shift');
            }
            stateChanged = true;
        }
        if (actualAlt !== trackedAlt) {
            if (actualAlt) {
                this.modifierDown.add('Alt');
            }
            else {
                this.modifierDown.delete('Alt');
            }
            stateChanged = true;
        }
        if (actualCtrl !== trackedCtrl) {
            if (actualCtrl) {
                this.modifierDown.add('Control');
            }
            else {
                this.modifierDown.delete('Control');
                this.modifierDown.delete('Ctrl');
            }
            stateChanged = true;
        }
        if (actualMeta !== trackedMeta) {
            if (actualMeta) {
                this.modifierDown.add('Meta');
            }
            else {
                this.modifierDown.delete('Meta');
                this.modifierDown.delete('OS');
            }
            stateChanged = true;
        }
        if (stateChanged) {
            const modifierCount = this.modifierDown.size;
            const prevShiftAndAlt = this.isShiftAndAltOnlyPressed;
            this.isShiftAndAltOnlyPressed = modifierCount === 2 && this.modifierDown.has('Shift') && this.modifierDown.has('Alt');
            if (modifierCount === 0) {
                if (this.hasAnyOnlyModifierState()) {
                    this.clearAllOnlyModifierStates();
                    this.notifyOfOnlyModifierKeyChange();
                }
            }
            else if (modifierCount === 1) {
                const modifier = Array.from(this.modifierDown)[0];
                let newOnlyState = false;
                this.clearAllOnlyModifierStates();
                if (modifier === 'Shift') {
                    this.isOnlyShiftKeyPressed = true;
                    newOnlyState = true;
                }
                else if (modifier === 'Alt') {
                    this.isOnlyAltKeyPressed = true;
                    newOnlyState = true;
                }
                else if (modifier === 'Control' || modifier === 'Ctrl') {
                    this.isOnlyCtrlKeyPressed = true;
                    newOnlyState = true;
                }
                else if (modifier === 'Meta' || modifier === 'OS') {
                    this.isOnlyCmdKeyPressed = true;
                    newOnlyState = true;
                }
                if (newOnlyState) {
                    this.notifyOfOnlyModifierKeyChange();
                }
            }
            else {
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
    isEditableElement(element) {
        if (!element)
            return false;
        if (element.id === 'searchInputControl')
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
    shouldExecuteShortcut(shortcut) {
        if (this.ignoreKeyboardShortcuts) {
            if (!this.suppressScopeElementId || this.isFocusInsideSuppressScope()) {
                return false;
            }
        }
        if (this.isDialogShowing) {
            return this.dialogShortcuts.has(shortcut);
        }
        return true;
    }
    shouldExecuteModifierNotification() {
        if (this.ignoreKeyboardShortcuts) {
            if (!this.suppressScopeElementId || this.isFocusInsideSuppressScope()) {
                return false;
            }
        }
        if (this.isDialogShowing) {
            let currentModifier = '';
            if (this.isOnlyShiftKeyPressed)
                currentModifier = 'Shift';
            else if (this.isOnlyAltKeyPressed)
                currentModifier = 'Alt';
            else if (this.isOnlyCtrlKeyPressed)
                currentModifier = 'Ctrl';
            else if (this.isOnlyCmdKeyPressed)
                currentModifier = 'Cmd';
            return currentModifier ? this.dialogShortcuts.has(currentModifier) : true;
        }
        return true;
    }
    handleWindowBlur() {
        this.pressedCombos.clear();
        this.nonModState.clear();
    }
    handleWindowFocus() {
        this.pressedCombos.clear();
        this.nonModState.clear();
    }
    getShiftKeyState() {
        return this.isOnlyShiftKeyPressed;
    }
    getAltKeyState() {
        return this.isOnlyAltKeyPressed;
    }
    getCtrlKeyState() {
        return this.isOnlyCtrlKeyPressed;
    }
    getCmdKeyState() {
        return this.isOnlyCmdKeyPressed;
    }
    getAllModifierStates() {
        return {
            isOnlyShiftPressed: this.isOnlyShiftKeyPressed,
            isOnlyAltPressed: this.isOnlyAltKeyPressed,
            isOnlyCtrlPressed: this.isOnlyCtrlKeyPressed,
            isOnlyCmdPressed: this.isOnlyCmdKeyPressed,
            isShiftAndAltPressed: this.isShiftAndAltOnlyPressed
        };
    }
    destroy() {
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
export const keyboard = new Keyboard();
//# sourceMappingURL=keyboard.js.map