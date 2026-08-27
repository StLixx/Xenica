import { safeInvoke, safeInvokeAsync } from "./interop.js";
class NotesPerfTimer {
    constructor(operation, context) {
        this.operation = operation;
        this.startTime = performance.now();
        this.stepTime = this.startTime;
        this.context = context !== null && context !== void 0 ? context : {};
        this.stopped = false;
    }
    static start(operation, context) {
        return new NotesPerfTimer(operation, context);
    }
    withContext(key, value) {
        this.context[key] = value;
        return this;
    }
    step(stepName) {
        const now = performance.now();
        const elapsed = now - this.stepTime;
        console.log(`${NotesPerfTimer.PREFIX} ${this.operation} step: ${stepName} completed in ${elapsed.toFixed(2)}ms`);
        this.stepTime = now;
    }
    stop() {
        if (this.stopped) {
            return;
        }
        this.stopped = true;
        const elapsed = performance.now() - this.startTime;
        if (elapsed < NotesPerfTimer.LOG_THRESHOLD_MS) {
            return;
        }
        const contextEntries = Object.entries(this.context);
        const contextStr = contextEntries.length > 0
            ? ' (' + contextEntries.map(([k, v]) => `${k}: ${v}`).join(', ') + ')'
            : '';
        const slow = elapsed >= NotesPerfTimer.SLOW_THRESHOLD_MS ? ' [SLOW]' : '';
        if (slow) {
            console.warn(`${NotesPerfTimer.PREFIX} ${this.operation} completed in ${elapsed.toFixed(2)}ms${contextStr}${slow}`);
        }
        else {
            console.log(`${NotesPerfTimer.PREFIX} ${this.operation} completed in ${elapsed.toFixed(2)}ms${contextStr}`);
        }
    }
}
NotesPerfTimer.PREFIX = '[NotesPerfTimer]';
NotesPerfTimer.LOG_THRESHOLD_MS = 100;
NotesPerfTimer.SLOW_THRESHOLD_MS = 500;
const Block = Quill.import('blots/block');
const BlockEmbed = Quill.import('blots/block/embed');
const Embed = Quill.import('blots/embed');
const FontStyle = Quill.import('attributors/style/font');
const Inline = Quill.import('blots/inline');
const Image = Quill.import('formats/image');
const Delta = Quill.import('delta');
const Parchment = Quill.import('parchment');
const URL_CORE_PATTERN = String.raw `([a-z][a-z0-9+.\-]{0,31})\\?:\/\/(([a-z0-9$_\.\+!\*\'\(\),;\?&=\-~]|%[0-9a-f]{2})+(\\?:([a-z0-9$_\.\+!\*\'\(\),;\?&=\-~]|%[0-9a-f]{2})+)?@)?((([a-z0-9]\\?\.|[a-z0-9][a-z0-9-]*[a-z0-9]\\?\.)*[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|((\d|[1-9]\d|1\d{2}|2[0-4][0-9]|25[0-5])\\?\.){3}(25[0-5]|2[0-4][0-9]|1\d{2}|\d|[1-9]\d))(\\?:\d+)?)(((\/+([a-z0-9$_\.\+\/!\*\'\(\),;:@&=\-~]|%[0-9a-f]{2})*)*(\?([a-z0-9$_\.\+\/!\*\'\(\),;:@&=\-~]|%[0-9a-f]{2})*)?)?)?(\\?#([a-z0-9$_\.\+\/!\*\'\(\),;:@&=\-~]|%[0-9a-f]{2})*)?`;
const URL_BOUNDARY_REGEX = new RegExp(String.raw `(?:^|\s)${URL_CORE_PATTERN}`, 'gi');
const URL_EXACT_REGEX = new RegExp(String.raw `^${URL_CORE_PATTERN}$`, 'i');
const EMAIL_CORE_PATTERN = String.raw `[\w!#$%&'*+\/=?^_\`{|}~-]+(?:\.[\w!#$%&'*+\/=?^_\`{|}~-]+)*@(?:[\w](?:[\w-]*[\w])?\\?\.)+[\w](?:[\w-]*[\w])?`;
const EMAIL_BOUNDARY_REGEX = new RegExp(String.raw `(?:^|\s)(${EMAIL_CORE_PATTERN})(?:$|\s)`, 'gi');
const EMAIL_EXACT_REGEX = new RegExp(String.raw `^${EMAIL_CORE_PATTERN}$`, 'i');
const PHONE_CORE_PATTERN = String.raw `(?:\+?\d{1,3})?[-. (]*\d{3}[-. )]*\d{3}[-. ]*\d{4}(?: *x\d+)?`;
const PHONE_BOUNDARY_REGEX = new RegExp(String.raw `(?:^|\s)(${PHONE_CORE_PATTERN})(?=$|\W)`, 'g');
const PHONE_EXACT_REGEX = new RegExp(String.raw `^${PHONE_CORE_PATTERN}$`);
const MISSPELLING_SKIP_DATASET_KEY = 'misspellingSkipRanges';
const CELL_PROCESSED_HASH_DATASET_KEY = 'cellProcessedHash';
var CursorOffsetBehavior;
(function (CursorOffsetBehavior) {
    CursorOffsetBehavior[CursorOffsetBehavior["Preserve"] = 0] = "Preserve";
    CursorOffsetBehavior[CursorOffsetBehavior["LineEdge"] = 1] = "LineEdge";
})(CursorOffsetBehavior || (CursorOffsetBehavior = {}));
export class VenusEditor {
    constructor() {
        this.primaryNotesEditor = null;
        this.cellNotesEditor = null;
        this.activeEditor = 'primary';
        this.isRestoringSelection = false;
        this.keepCellEditorAliveDepth = 0;
        this.savedCellSelection = new SavedCellSelection();
        this.savedPrimarySelection = null;
        this.editorSettings = new NotesEditorSettings();
        this.editorElementId = '';
        this.linkTooltipContainerId = '';
        this.linkTooltipId = '';
        this.linkTooltipContentId = '';
        this.skipMathAdjacentSelect = false;
        this.heldMathInfo = null;
        this.editorContainer = null;
        this.editorOuterContainer = null;
        this.toolbarContainer = null;
        this.contentAreaInner = null;
        this.scrollCursorRafId = null;
        this.scrollCursorSmooth = false;
        this.dotNetHelper = null;
        this._pendingTimers = new Set();
        this._animatedCarets = new Map();
        this.autoSaveIdleDelay = 3000;
        this.spellcheckIdleDelay = 2000;
        this._isActivelyTyping = false;
        this._compositionPendingProcess = false;
        this.metaData = "";
        this.isDirty = false;
        this._visibilityChangeHandler = null;
        this._marginClickContainer = null;
        this._marginClickHandler = null;
        this.lastActiveTable = null;
        this.preserveTableControls = false;
        this.isStructuralTableOperation = false;
        this.tableState = new TableState();
        this.tableResizer = null;
        this.imageControls = null;
        this.tableCellSelectionDiv = null;
        this.dummyInput = null;
        this.justPressedEnter = false;
        this.hasIosHardwareKeyboard = null;
        this.textScalePercent = 100;
        this.minTextScalePercent = 50;
        this.maxTextScalePercent = 200;
        this.baseFontSizeCache = new WeakMap();
        this.URL_REGEX = /^(https?:\/\/[^\s]+)$/;
        this.MARKDOWN_LINK_URL_REGEX = /^([a-zA-Z][a-zA-Z0-9+.\-]*:|www\.)[^\s]+$/;
        this.editorListeners = new Map();
        this.resizeObservers = new Map;
        this.collapseState = new Map();
        this.outlineBlocks = [];
        this.outlineBlockById = new Map();
        this.hasAnyCollapsibleBlocks = false;
        this.collapseAnimationMode = 'single';
        this.hoveredCollapseId = null;
        this.collapseOverlay = null;
        this.collapseRenderScheduled = false;
        this.collapsePointerHandlers = new Map();
        this.lineIdSeed = 0;
        this.lineNodeById = new Map();
        this.collapseButtonOffset = 24;
        this.collapseHoverMargin = 48;
        this.lastCollapseOperationTime = 0;
        this._retryingPaste = false;
        this.copiedTableData = null;
        this.toolbarListeners = [];
        this.activeInlineTooltip = null;
        this.isProcessingVisibleLines = false;
        this.searchState = {
            findText: '',
            replaceText: '',
            caseSensitive: false,
            wholeWord: false,
            useRegex: false,
            matches: [],
            currentMatchIndex: -1,
            highlightElements: [],
            textToDeltaMap: [],
            deltaToTextMap: []
        };
        this.searchRefreshTimer = null;
        this.resizeRefreshTimer = null;
        this.dismissResultHighlight = null;
        this.copiedFormatting = null;
        this.toolbarButtons = [
            { buttonId: 'undo', formatKey: 'undo', formatValue: null, isMenu: false },
            { buttonId: 'redo', formatKey: 'redo', formatValue: null, isMenu: false },
            { buttonId: 'paragraph-style', formatKey: 'paragraph-style', formatValue: null, isMenu: true },
            { buttonId: 'bold', formatKey: 'bold', formatValue: null, isMenu: false },
            { buttonId: 'italic', formatKey: 'italic', formatValue: null, isMenu: false },
            { buttonId: 'underline', formatKey: 'underline', formatValue: null, isMenu: false },
            { buttonId: 'strikethrough', formatKey: 'strike', formatValue: null, isMenu: false },
            { buttonId: 'fore-color', formatKey: 'fore-color', formatValue: null, isMenu: false },
            { buttonId: 'back-color', formatKey: 'back-color', formatValue: null, isMenu: false },
            { buttonId: 'text-scale', formatKey: 'text-scale', formatValue: null, isMenu: true },
            { buttonId: 'link', formatKey: 'link', formatValue: null, isMenu: false },
            { buttonId: 'inline-code', formatKey: 'code', formatValue: null, isMenu: false },
            { buttonId: 'highlight', formatKey: 'highlight', formatValue: null, isMenu: false },
            { buttonId: 'remove-formatting', formatKey: 'remove-formatting', formatValue: null, isMenu: false },
            { buttonId: 'superscript', formatKey: 'script', formatValue: 'super', isMenu: false },
            { buttonId: 'subscript', formatKey: 'script', formatValue: 'sub', isMenu: false },
            { buttonId: 'align', formatKey: 'align', formatValue: null, isMenu: true },
            { buttonId: 'outdent', formatKey: 'outdent', formatValue: null, isMenu: false },
            { buttonId: 'indent', formatKey: 'indent', formatValue: null, isMenu: false },
            { buttonId: 'spellcheck', formatKey: 'spellcheck', formatValue: null, isMenu: false },
            { buttonId: 'horizontal-rule', formatKey: 'horizontal-rule', formatValue: null, isMenu: false },
            { buttonId: 'table', formatKey: 'table', formatValue: null, isMenu: false },
            { buttonId: 'date', formatKey: 'date', formatValue: null, isMenu: false },
            { buttonId: 'find-replace', formatKey: 'find-replace', formatValue: null, isMenu: true },
        ];
        this.keyboardBindings = {
            bold: {
                key: 'b',
                shortKey: true,
                handler: (range, context) => {
                    return false;
                }
            },
            italic: {
                key: 'i',
                shortKey: true,
                handler: (range, context) => {
                    return false;
                }
            },
            underline: {
                key: 'u',
                shortKey: true,
                handler: (range, context) => {
                    return false;
                }
            },
            inlineCode: {
                key: '`',
                handler: (range, context) => {
                    return this.handleInlineCodeKeyboardShortcut(range);
                }
            },
            tripleBacktick: {
                key: '`',
                handler: (range, context) => {
                    return this.handleCodeBlockKeyboardShortcut(range, context);
                }
            },
            strikethrough: {
                key: '~',
                shiftKey: true,
                handler: (range, context) => {
                    return this.handleStrikethroughKeyboardShortcut(range);
                }
            },
            highlight: {
                key: '=',
                shiftKey: false,
                handler: (range, context) => {
                    return this.handleHighlightKeyboardShortcut(range);
                }
            },
            asteriskItalicOrBold: {
                key: '*',
                shiftKey: true,
                handler: (range, context) => {
                    return this.handleAsteriskItalicOrBoldKeyboardShortcut(range);
                }
            },
            underscoreItalicOrBold: {
                key: '_',
                shiftKey: null,
                handler: (range, context) => {
                    return this.handleUnderscoreItalicOrBoldKeyboardShortcut(range);
                }
            },
            startOfDocumentBackspace: {
                key: 'Backspace',
                prefix: /^/,
                handler: (range, context) => {
                    if (range.index > 0) {
                        return true;
                    }
                    this.notesEditor().format('header', false);
                    this.notesEditor().format('list', false);
                    this.notesEditor().format('blockquote', false);
                    this.notesEditor().format('code-block', false);
                    return true;
                }
            },
            startOfLineBackspace: {
                key: 'Backspace',
                handler: (range, context) => {
                    if (!range)
                        return true;
                    if (range.length > 0)
                        return true;
                    const editor = this.notesEditor();
                    const [line, offset] = editor.getLine(range.index);
                    if (offset === 0) {
                        if (range.index > 0 && this.isIndexHidden(range.index - 1)) {
                            return false;
                        }
                        const formats = editor.getFormat(range.index, 1);
                        if (formats.header) {
                            editor.format('header', false, 'user');
                            return false;
                        }
                    }
                    return true;
                }
            },
            divider: {
                key: '-',
                handler: (range, context) => {
                    return this.handleDividerKeyboardShortcut(range, context);
                }
            },
            insertLink: {
                key: '[',
                handler: (range, context) => {
                    return this.handleInsertLinkKeyboardShortcut(range, context);
                }
            },
            markdownLink: {
                key: ')',
                shiftKey: null,
                handler: (range, context) => {
                    return this.handleMarkdownLinkKeyboardShortcut(range);
                }
            },
            insertMath: {
                key: '$',
                shiftKey: true,
                handler: (range, context) => {
                    return this.handleInsertMathKeyboardShortcut(range, context);
                }
            },
            tab: {
                key: 'Tab',
                handler: (range, context) => {
                    return this.handleTabKey(range, context);
                }
            },
            shiftTab: {
                key: 'Tab',
                shiftKey: true,
                handler: (range, context) => {
                    return this.handleShiftTabKey(range, context);
                }
            },
            undo: {
                key: 'z',
                shortKey: true,
                handler: (range, context) => {
                    return this.handleUndo();
                }
            },
            redo: {
                key: 'Z',
                shortKey: true,
                shiftKey: true,
                handler: (range, context) => {
                    return this.handleRedo();
                }
            },
            redo2: {
                key: 'y',
                shortKey: true,
                handler: (range, context) => {
                    return this.handleRedo();
                }
            },
            exit: {
                key: 'Escape',
                handler: (range, context) => {
                    safeInvoke(this.dotNetHelper, 'CloseRequested');
                }
            },
            exitInlineCodeRight: {
                key: 'ArrowRight',
                collapsed: true,
                format: ['code'],
                handler: (range, context) => {
                    if (!range || !this.notesEditor) {
                        return true;
                    }
                    const editor = this.notesEditor();
                    const [leaf, offsetInLeaf] = editor.getLeaf(range.index);
                    if (!leaf || offsetInLeaf !== leaf.length()) {
                        return true;
                    }
                    editor.format('code', false, 'user');
                    const nextChar = editor.getText(range.index, 1);
                    if (nextChar === '\n') {
                        editor.insertText(range.index, ' ', 'user');
                    }
                    return true;
                }
            },
            exitInlineCodeLeft: {
                key: 'ArrowLeft',
                collapsed: true,
                format: ['code'],
                handler: (range, context) => {
                    if (!range || !this.notesEditor) {
                        return true;
                    }
                    const editor = this.notesEditor();
                    const [leaf, offsetInLeaf] = editor.getLeaf(range.index);
                    if (!leaf || offsetInLeaf !== 0) {
                        return true;
                    }
                    const atDocStart = range.index === 0;
                    const charToLeft = atDocStart ? '\n' : editor.getText(range.index - 1, 1);
                    const spaceAlreadyThere = charToLeft === ' ';
                    editor.format('code', false, 'user');
                    return false;
                }
            },
            skipDividerUp: {
                key: 'ArrowUp',
                collapsed: true,
                handler: (range, context) => {
                    return this.moveCursorPastDividerUp(range, context);
                }
            },
            skipDividerDown: {
                key: 'ArrowDown',
                collapsed: true,
                handler: (range, context) => {
                    return this.moveCursorPastDividerDown(range, context);
                }
            },
            skipDividerLeft: {
                key: 'ArrowLeft',
                collapsed: true,
                handler: (range, context) => {
                    return this.moveCursorPastDividerLeft(range, context);
                }
            },
            skipDividerRight: {
                key: 'ArrowRight',
                collapsed: true,
                handler: (range, context) => {
                    return this.moveCursorPastDividerRight(range, context);
                }
            },
            skipTOCUp: {
                key: 'ArrowUp',
                collapsed: true,
                handler: (range, context) => {
                    return this.moveCursorPastTOCUp(range, context);
                }
            },
            deleteDividerForward: {
                key: 'Delete',
                collapsed: true,
                handler: (range, context) => {
                    return this.deleteDividerForward(range, context);
                }
            },
            exitCodeBlockUp: {
                key: 'ArrowUp',
                collapsed: true,
                format: ['code-block'],
                handler: (range, context) => {
                    return this.exitCodeBlockUp(range, context);
                }
            },
            exitCodeBlockLeft: {
                key: 'ArrowLeft',
                collapsed: true,
                format: ['code-block'],
                handler: (range, context) => {
                    return this.exitCodeBlockUp(range, context);
                }
            },
            exitCodeBlockDown: {
                key: 'ArrowDown',
                collapsed: true,
                format: ['code-block'],
                handler: (range, context) => {
                    return this.exitCodeBlockDown(range, context);
                }
            },
            exitCodeBlockRight: {
                key: 'ArrowRight',
                collapsed: true,
                format: ['code-block'],
                handler: (range, context) => {
                    return this.exitCodeBlockDown(range, context);
                }
            },
            exitMathUp: {
                key: 'ArrowUp',
                collapsed: true,
                handler: (range, context) => {
                    return this.exitMathUp(range, context);
                }
            },
            exitMathLeft: {
                key: 'ArrowLeft',
                collapsed: true,
                handler: (range, context) => {
                    return this.exitMathUp(range, context);
                }
            },
            exitMathDown: {
                key: 'ArrowDown',
                collapsed: true,
                handler: (range, context) => {
                    return this.exitMathDown(range, context);
                }
            },
            exitMathRight: {
                key: 'ArrowRight',
                collapsed: true,
                handler: (range, context) => {
                    return this.exitMathDown(range, context);
                }
            },
            navigateUp: {
                key: 'ArrowUp',
                collapsed: true,
                handler: (range, context) => {
                    return this.handleNavigateUp(range, context);
                }
            },
            navigateLeft: {
                key: 'ArrowLeft',
                collapsed: true,
                handler: (range, context) => {
                    return this.handleNavigateLeft(range, context);
                }
            },
            navigateDown: {
                key: 'ArrowDown',
                collapsed: true,
                handler: (range, context) => {
                    return this.handleNavigateDown(range, context);
                }
            },
            "embed left": {
                key: 'ArrowLeft',
                collapsed: true,
                offset: 0,
                handler: function (range, context) {
                    return true;
                }
            },
            "embed right": {
                key: 'ArrowRight',
                collapsed: true,
                offset: 0,
                handler: function (range, context) {
                    return true;
                }
            },
            "list autofill": false,
            lineStartMarkdown: {
                key: " ",
                shiftKey: null,
                handler: (range, context) => {
                    return this.handleLineStartMarkdownShortcut(range, context);
                }
            },
            listBracketCheckbox: {
                key: "]",
                shiftKey: null,
                prefix: /^\s*?\[(?: |[xX])?$/,
                handler: (range, context) => {
                    return this.handleBracketCheckboxKeyboardShortcut(range, context);
                }
            },
            shiftEnter: {
                key: 'Enter',
                shiftKey: true,
                handler: (range, context) => {
                    if (this.editorSettings.clientOs === ClientOs.iOS && getIosKeyboardHeight() > 0) {
                        return this.performPlainEnter(range);
                    }
                    return this.handleShiftEnter(range);
                }
            }
        };
        this.dragStartCoords = null;
        this.lastPointedCoords = null;
        this.lastPointerDownIndex = null;
        this.lastPointedTime = null;
        this.lastPointerDownScrollTop = null;
        this.TOOLTIP_DISTANCE_FROM_SOURCE = 35;
        this.TOOLTIP_VIEWPORT_PADDING = 5;
        this.debouncedUpdateTableControlsDisplayStateInternal = null;
        this.lineMoveQueue = [];
        this.isProcessingLineMoveQueue = false;
        this.debouncedUpdateToolbarStateInternal = null;
        this.disabledFormatKeysWhenInCode = [
            'bold',
            'italic',
            'underline',
            'fore-color',
            'back-color',
            'link',
            'image',
            'script',
            'align'
        ];
        this.disabledFormatKeysWhenInCell = [
            'link',
            'image',
            'indent',
            'outdent',
            'horizontal-rule',
            'table',
            'date'
        ];
    }
    isMacOS() {
        try {
            const ua = (navigator && navigator.userAgent) ? navigator.userAgent : '';
            const platform = (navigator && navigator.platform) ? navigator.platform : '';
            const isAppleMobile = /iPhone|iPad|iPod/i.test(ua);
            return !isAppleMobile && (/Macintosh|Mac OS X|Mac/i.test(ua) || /Mac/i.test(platform));
        }
        catch (_a) {
            return false;
        }
    }
    initQuillEditor(dotNetHelper, editorElementId, toolbarElementId, linkTooltipContainerId, linkTooltipId, linkTooltipContentId, editorSettings) {
        const perfTimer = NotesPerfTimer.start('initQuillEditor');
        if (editorSettings == null) {
            console.log('initQuillEditor failed: editorSettings must not be null');
        }
        this.dotNetHelper = dotNetHelper;
        this.editorElementId = editorElementId;
        this.linkTooltipContainerId = linkTooltipContainerId;
        this.linkTooltipId = linkTooltipId;
        this.linkTooltipContentId = linkTooltipContentId;
        this.editorContainer = document.getElementById(editorElementId);
        if (!this.editorContainer) {
            throw new Error(`Editor element with id '${editorElementId}' not found. DOM may not be ready yet.`);
        }
        this.editorOuterContainer = this.editorContainer.parentElement;
        if (!this.editorOuterContainer) {
            throw new Error(`Editor outer container (parentElement of '${editorElementId}') not found.`);
        }
        this.setupEditorContainerKeyboardHandler();
        this.setupMarginClickHandler();
        this.toolbarContainer = document.getElementById(toolbarElementId);
        this.contentAreaInner = document.getElementById('contentAreaInner');
        this.primaryNotesEditor = this.getEditor(this.editorContainer, false);
        const instanceIdMatch = editorElementId.match(/^editor-(.+)$/);
        if (instanceIdMatch && instanceIdMatch[1]) {
            const instanceId = instanceIdMatch[1];
            console.log(`[initQuillEditor] Registering instance: ${instanceId}`);
            editorInstances.set(instanceId, this);
        }
        else {
            console.log(`[initQuillEditor] No instance ID found in editorElementId: ${editorElementId}`);
        }
        this.setEditorSettings(editorSettings);
        this._visibilityChangeHandler = () => {
            if (document.visibilityState === 'hidden') {
                this.flushPendingAutoSave();
            }
        };
        document.addEventListener('visibilitychange', this._visibilityChangeHandler);
        this.setEditorClasses();
        this.primaryNotesEditor.history.clear();
        this.isDirty = false;
        perfTimer.stop();
        console.log('Initialized notes editor');
        const dummyInput = document.createElement('input');
        dummyInput.id = instanceIdMatch && instanceIdMatch[1] ? `dummyInput-${instanceIdMatch[1]}` : 'dummyInput';
        dummyInput.type = 'text';
        dummyInput.style.position = 'absolute';
        dummyInput.style.top = '0px';
        dummyInput.style.left = '0px';
        dummyInput.style.pointerEvents = 'none';
        dummyInput.style.opacity = '0';
        dummyInput.style.width = '0';
        dummyInput.style.height = '0';
        dummyInput.style.zIndex = '0';
        document.body.appendChild(dummyInput);
        this.dummyInput = dummyInput;
        if (this.contentAreaInner) {
            const contentAreaResizeObserver = new ResizeObserver(() => {
                this.refreshSearchAfterResize();
            });
            contentAreaResizeObserver.observe(this.contentAreaInner);
            this.resizeObservers.set('contentAreaInner', contentAreaResizeObserver);
        }
        this.updateMoveLineCommandStates();
        this.updateTableCommandStates();
    }
    setEditorClasses() {
        const editor = document.getElementById(this.editorElementId);
        if (!editor)
            return;
        const classSets = {
            standalone: ['border', 'border-t-0', 'border-lcolor', 'dark:border-lcolordark', 'rounded-b-xl', 'overflow-hidden'],
        };
        editor.classList.remove(...classSets.standalone);
        let classesToAdd = [];
        if (this.editorSettings.isStandalone) {
            classesToAdd.push(...classSets.standalone);
        }
        if (classesToAdd.length) {
            editor.classList.add(...classesToAdd);
        }
    }
    safeSetTimeout(callback, delay) {
        const id = setTimeout(() => {
            this._pendingTimers.delete(id);
            callback();
        }, delay);
        this._pendingTimers.add(id);
        return id;
    }
    setContents(contentPackage) {
        var _a, _b;
        const delta = JSON.parse(contentPackage.quillDelta);
        const perfTimer = NotesPerfTimer.start('setContents', { ops: (_b = (_a = delta.ops) === null || _a === void 0 ? void 0 : _a.length) !== null && _b !== void 0 ? _b : 0 });
        const savedScrollTop = this.primaryNotesEditor.root.scrollTop;
        let isSameNote = false;
        try {
            if (this.metaData && contentPackage.metaData) {
                const oldState = JSON.parse(this.metaData);
                const newState = JSON.parse(contentPackage.metaData);
                isSameNote = oldState.ThoughtId === newState.ThoughtId
                    && oldState.AttachmentId === newState.AttachmentId;
            }
        }
        catch (_c) {
        }
        this.primaryNotesEditor.history.clear();
        perfTimer.step('clearHistory');
        this.primaryNotesEditor.setText('', 'silent');
        const editorRoot = this.primaryNotesEditor.root;
        const rootParent = editorRoot.parentElement;
        const rootNextSibling = editorRoot.nextSibling;
        rootParent === null || rootParent === void 0 ? void 0 : rootParent.removeChild(editorRoot);
        perfTimer.step('clearAndDetach');
        try {
            this.primaryNotesEditor.setContents(delta);
            perfTimer.step('quillSetContents');
        }
        finally {
            if (rootParent) {
                if (rootNextSibling) {
                    rootParent.insertBefore(editorRoot, rootNextSibling);
                }
                else {
                    rootParent.appendChild(editorRoot);
                }
            }
            perfTimer.step('reattachDOM');
        }
        this.metaData = contentPackage.metaData;
        this.registerTablesWithEditor();
        this.registerImagesWithEditor();
        this.updateTextCounts();
        this.updateTableOfContents();
        this.refreshOutline();
        if (isSameNote) {
            this.primaryNotesEditor.root.scrollTop = savedScrollTop;
        }
        this.isDirty = false;
        if (this.searchState.findText) {
            this.safeSetTimeout(() => {
                this.performSearch(this.searchState.findText, this.searchState.caseSensitive, this.searchState.wholeWord, this.searchState.useRegex, false);
            }, 20);
        }
        perfTimer.step('postProcessing');
        perfTimer.stop();
        console.log('Loaded notes editor content');
    }
    notesEditor() {
        if (this.activeEditor === 'cell' && this.cellNotesEditor) {
            return this.cellNotesEditor;
        }
        return this.primaryNotesEditor;
    }
    isCellEditorInstance(quill) {
        return !!quill && quill === this.cellNotesEditor;
    }
    getCellProcessingId(quill) {
        var _a, _b, _c;
        if (!quill) {
            return '';
        }
        const root = (_a = quill.root) !== null && _a !== void 0 ? _a : null;
        if ((_b = root === null || root === void 0 ? void 0 : root.dataset) === null || _b === void 0 ? void 0 : _b.tableCellId) {
            return root.dataset.tableCellId;
        }
        if (quill === this.cellNotesEditor) {
            return (_c = this.tableState.activeCellId) !== null && _c !== void 0 ? _c : '';
        }
        return '';
    }
    getSelectionWithFallback() {
        const editor = this.notesEditor();
        if (!editor)
            return null;
        let range = editor.getSelection();
        if (!range) {
            if (this.activeEditor === 'cell' && this.savedCellSelection.cellSelection) {
                range = this.savedCellSelection.cellSelection;
            }
            else if (this.activeEditor === 'primary' && this.savedPrimarySelection) {
                range = this.savedPrimarySelection;
            }
        }
        return range;
    }
    withSelectionPreserved(operation) {
        var _a, _b;
        const selection = (_a = this.notesEditor()) === null || _a === void 0 ? void 0 : _a.getSelection();
        operation();
        if (selection) {
            (_b = this.notesEditor()) === null || _b === void 0 ? void 0 : _b.setSelection(selection.index, selection.length, 'silent');
        }
    }
    acquireCellKeepAlive() {
        this.keepCellEditorAliveDepth++;
    }
    releaseCellKeepAlive() {
        if (this.keepCellEditorAliveDepth > 0) {
            this.keepCellEditorAliveDepth--;
        }
    }
    get isCellEditorKeptAlive() {
        return this.keepCellEditorAliveDepth > 0;
    }
    isFocusInEditorChrome(el) {
        var _a, _b, _c, _d;
        if (!el)
            return false;
        if ((_a = this.toolbarContainer) === null || _a === void 0 ? void 0 : _a.contains(el))
            return true;
        if (!((_b = this.editorContainer) === null || _b === void 0 ? void 0 : _b.contains(el)))
            return false;
        return !((_d = (_c = el).closest) === null || _d === void 0 ? void 0 : _d.call(_c, '.ql-editor'));
    }
    isCellEditorActive() {
        return this.activeEditor === 'cell' && this.cellNotesEditor !== null;
    }
    registerTablesWithEditor() {
        const editorElement = document.getElementById(this.editorElementId);
        if (!editorElement)
            return;
        const tables = editorElement.querySelectorAll('table.ql-table-blot');
        tables.forEach((table) => {
            const t = table;
            TableBlot.setEditorForTable(t, this);
            TableBlot.setupTableClickDelegation(t);
        });
    }
    registerImagesWithEditor() {
        const editorElement = document.getElementById(this.editorElementId);
        if (!editorElement)
            return;
        const images = editorElement.querySelectorAll('img');
        images.forEach((image) => {
            setEditorForImage(image, this);
        });
    }
    getCellEditor(targetCell) {
        this.removeEventListenersForEditor(this.cellNotesEditor);
        this.cellNotesEditor = this.getEditor(targetCell, true);
        this.activeEditor = 'cell';
        return this.cellNotesEditor;
    }
    getEditor(element, isCellEditor) {
        const externalListeners = [];
        let savedSelectionInfo = null;
        if (isCellEditor) {
            const domSelection = window.getSelection();
            const hasTextSelection = domSelection && !domSelection.isCollapsed;
            if (hasTextSelection && domSelection) {
                try {
                    const range = domSelection.getRangeAt(0);
                    const startOffset = QuillExtensions.domToQuillIndex(element, range.startContainer, range.startOffset);
                    const endOffset = QuillExtensions.domToQuillIndex(element, range.endContainer, range.endOffset);
                    savedSelectionInfo = {
                        startOffset: startOffset,
                        endOffset: endOffset,
                        selectedText: range.toString()
                    };
                }
                catch (e) {
                    savedSelectionInfo = null;
                }
            }
        }
        const quill = new Quill(element, {
            modules: {
                toolbar: false,
                history: {
                    delay: 500,
                    maxStack: 100,
                    userOnly: true,
                },
                keyboard: {
                    bindings: this.keyboardBindings
                }
            },
            theme: 'snow',
        });
        this.preserveBackwardSelectionOnRestore(quill);
        this.initQuillExtensions(quill);
        this.setReadOnlyInternal(quill, this.editorSettings.readOnly, true, isCellEditor);
        if (savedSelectionInfo && isCellEditor) {
            try {
                const length = savedSelectionInfo.endOffset - savedSelectionInfo.startOffset;
                quill.setSelection(savedSelectionInfo.startOffset, length, 'silent');
            }
            catch (e) {
            }
        }
        if (!isCellEditor) {
            quill.root.setAttribute('data-placeholder', this.editorSettings.placeholderText || 'Start typing here...');
        }
        else {
            quill.root.setAttribute('data-table-editor', 'true');
        }
        QuillExtensions.detectEnterPress(quill, this);
        this.registerEditorChangeHandler(quill, isCellEditor);
        this.setupCopyAndPasteHandlers(quill, externalListeners);
        this.overrideClicks(quill);
        this.suppressDuplicateHistoryBeforeInput(quill);
        if (!isCellEditor) {
            QuillExtensions.guardPrimaryDeleteWhileCellActive(quill, this);
            QuillExtensions.interceptPrimaryTableAdjacentDelete(quill, this);
        }
        if (this.editorSettings.animateTextCursor) {
            this._animatedCarets.set(quill, new AnimatedCaret(quill));
        }
        quill.root.addEventListener('focus', () => {
            if (isCellEditor) {
                this.activeEditor = 'cell';
            }
            else {
                this.activeEditor = 'primary';
            }
            this.notifyEditorFocused();
            if (this.editorSettings.clientOs == ClientOs.iOS && this.hasIosHardwareKeyboard === null) {
                this.safeSetTimeout(() => {
                    this.hasIosHardwareKeyboard = getIosKeyboardHeight() === 0;
                }, 100);
            }
            if (!isCellEditor && (this.editorSettings.clientOs == ClientOs.iOS || this.editorSettings.clientOs == ClientOs.Android)) {
                const kbHeightAtFocus = parseFloat(getComputedStyle(document.documentElement)
                    .getPropertyValue('--keyboard-height').trim()) || 0;
                if (kbHeightAtFocus > 0) {
                    void this.ensureContentAreaFitsKeyboardThenScroll(quill);
                }
            }
        });
        quill.root.addEventListener('blur', (e) => {
            var _a;
            if (this.editorSettings.clientOs == ClientOs.Android) {
                quill.root.setAttribute('inputmode', 'none');
            }
            const related = e.relatedTarget;
            if (!related || ((_a = this.editorOuterContainer) === null || _a === void 0 ? void 0 : _a.contains(related))) {
                return;
            }
            if (related.closest('#plexContainer, #thought-properties-display, #toolbar-section')) {
                this.notifyEditorBlur();
            }
        });
        if (!isCellEditor) {
            window.addEventListener('keyboardheightchange', (e) => {
                const detail = e.detail;
                if (!detail) {
                    return;
                }
                if (detail.height <= 0 && detail.previousHeight > 0) {
                    if (this.editorSettings.clientOs == ClientOs.Android && document.activeElement === quill.root) {
                        quill.root.setAttribute('inputmode', 'none');
                    }
                    return;
                }
                if (detail.height <= 0) {
                    return;
                }
                if (this.editorSettings.clientOs != ClientOs.iOS && this.editorSettings.clientOs != ClientOs.Android) {
                    return;
                }
                if (document.activeElement !== quill.root) {
                    return;
                }
                void this.ensureContentAreaFitsKeyboardThenScroll(quill);
            });
        }
        let pointerDownClientY = null;
        quill.root.addEventListener('pointerdown', (event) => {
            var _a;
            if (this.editorSettings.clientOs == ClientOs.Android) {
                quill.root.removeAttribute('inputmode');
                pointerDownClientY = event.clientY;
            }
            if (this.heldMathInfo) {
                this.exitMathHold();
            }
            if (!quill.options.readOnly && event.button === 0) {
                const mdTarget = event.target;
                const math = mdTarget.closest('.ql-math');
                if (math) {
                    let ownerQuill = quill;
                    const cell = math.closest('td');
                    if (cell && quill === this.primaryNotesEditor) {
                        const cellQuill = TableBlot.activateCell(cell, this);
                        if (cellQuill)
                            ownerQuill = cellQuill;
                    }
                    const mathBlot = Quill.find(math);
                    if (mathBlot && ((_a = mathBlot.statics) === null || _a === void 0 ? void 0 : _a.blotName) === MathExpressionBlot.blotName) {
                        const idx = ownerQuill.getIndex(mathBlot);
                        if (idx !== -1 && idx != null) {
                            event.preventDefault();
                            event.stopPropagation();
                            this.openMathDialogForBlot(ownerQuill, mathBlot, idx);
                            return;
                        }
                    }
                }
            }
            const selectedTable = this.tableState.lastTableWithSelection;
            if (selectedTable) {
                const clickTarget = event.target;
                if (clickTarget && !selectedTable.contains(clickTarget)) {
                    TableBlot.setTableSelection(selectedTable, null, null);
                }
            }
            const rect = quill.root.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;
            this.lastPointedTime = Date.now();
            this.lastPointedCoords = { x, y };
            this.dragStartCoords = { x, y };
            this.lastPointerDownIndex = QuillExtensions.getClosestIndex(quill, x, y);
            if (this.editorSettings.clientOs == ClientOs.iOS) {
                const scrollContainer = this.contentAreaInner || document.getElementById('contentAreaInner') || quill.root;
                this.lastPointerDownScrollTop = scrollContainer.scrollTop;
            }
        });
        const SCROLL_THRESHOLD_PX = 10;
        quill.root.addEventListener('touchmove', (e) => {
            if (this.editorSettings.clientOs != ClientOs.Android || pointerDownClientY === null) {
                return;
            }
            if (e.touches.length !== 1) {
                return;
            }
            const dy = Math.abs(e.touches[0].clientY - pointerDownClientY);
            if (dy >= SCROLL_THRESHOLD_PX) {
                const kbHeight = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--keyboard-height') || '0');
                if (kbHeight <= 0) {
                    quill.root.setAttribute('inputmode', 'none');
                }
                pointerDownClientY = null;
            }
        }, { passive: true });
        const resetPointerTracking = () => { pointerDownClientY = null; };
        quill.root.addEventListener('touchend', resetPointerTracking, { passive: true });
        quill.root.addEventListener('touchcancel', resetPointerTracking, { passive: true });
        const tabKeydownHandler = (event) => {
            if (event.key !== 'Tab' || event.altKey || this.editorSettings.readOnly) {
                return;
            }
            if (this.tableState.activeCellId) {
                event.preventDefault();
                event.stopImmediatePropagation();
                QuillExtensions.handleTabInCell(this, !event.shiftKey);
                return;
            }
            const range = quill.getSelection();
            if (!range) {
                return;
            }
            const context = {
                collapsed: range.length === 0,
                format: quill.getFormat(range.index, range.length),
                offset: 0,
                prefix: '',
                suffix: ''
            };
            event.preventDefault();
            event.stopImmediatePropagation();
            event.stopPropagation();
            event.returnValue = false;
            if (event.shiftKey) {
                this.handleShiftTabKey(range, context);
            }
            else {
                this.handleTabKey(range, context);
            }
        };
        quill.root.addEventListener('keydown', tabKeydownHandler, true);
        externalListeners.push({ element: quill.root, event: 'keydown', handler: tabKeydownHandler });
        const escapeKeyHandler = (event) => {
            if (event.key !== 'Escape' || !this.tableState.lastTableWithSelection) {
                return;
            }
            TableBlot.setTableSelection(this.tableState.lastTableWithSelection, null, null);
            event.preventDefault();
            event.stopImmediatePropagation();
        };
        quill.root.addEventListener('keydown', escapeKeyHandler, true);
        externalListeners.push({ element: quill.root, event: 'keydown', handler: escapeKeyHandler });
        const clearCellSelectionHandler = (event) => {
            if (!this.tableState.lastTableWithSelection) {
                return;
            }
            const key = event.key;
            if (key === 'Escape' || key === 'Delete' || key === 'Backspace') {
                return;
            }
            if (key === 'Shift' || key === 'Control' || key === 'Alt' || key === 'Meta') {
                return;
            }
            if (event.shiftKey && (key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight')) {
                return;
            }
            if (event.ctrlKey || event.metaKey) {
                return;
            }
            TableBlot.setTableSelection(this.tableState.lastTableWithSelection, null, null);
        };
        quill.root.addEventListener('keydown', clearCellSelectionHandler, true);
        externalListeners.push({ element: quill.root, event: 'keydown', handler: clearCellSelectionHandler });
        quill.root.addEventListener('pointerup', (event) => {
            if (this.editorSettings.readOnly) {
                return;
            }
            if (this.editorSettings.clientOs == ClientOs.iOS) {
                const DRAG_THRESHOLD = 10;
                let hasMovedSignificantly = false;
                if (this.dragStartCoords) {
                    const rect = quill.root.getBoundingClientRect();
                    const x = event.clientX - rect.left;
                    const y = event.clientY - rect.top;
                    const dx = x - this.dragStartCoords.x;
                    const dy = y - this.dragStartCoords.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    hasMovedSignificantly = distance > DRAG_THRESHOLD;
                    this.dragStartCoords = null;
                }
                if (hasMovedSignificantly || (this.lastPointedTime && Date.now() - this.lastPointedTime > 1000)) {
                    return;
                }
            }
        });
        if (!isCellEditor) {
            const moveHandler = (evt) => this.handleEditorPointerMove(evt, quill);
            const leaveHandler = (evt) => this.handleEditorPointerLeave(evt);
            quill.root.addEventListener('mousemove', moveHandler);
            quill.root.addEventListener('mouseleave', leaveHandler);
            this.collapsePointerHandlers.set(quill, { move: moveHandler, leave: leaveHandler });
        }
        this.initSpellCheckState(quill);
        this.applyTextScaleToEditor(quill, this.textScalePercent / 100);
        if (!isCellEditor) {
            this.safeSetTimeout(() => QuillExtensions.processVisibleLines(quill, this), 500);
        }
        const debouncedProcessVisibleLines = debounce(QuillExtensions.processVisibleLines, 100);
        const debouncedUpdateTOC = debounce(() => this.updateTableOfContents(), 250);
        const debouncedRefreshOutline = isCellEditor ? null : debounce(() => this.refreshOutline(quill), 250);
        quill.on('text-change', (delta, oldDelta, source) => {
            if (!this.isStructuralTableOperation && source !== 'silent') {
                if (!quill.composition.isComposing) {
                    debouncedProcessVisibleLines(quill, this);
                }
                else {
                    this._compositionPendingProcess = true;
                }
            }
            if (!isCellEditor) {
                const isStructuralChange = QuillExtensions.isStructuralChange(delta, oldDelta);
                if (isStructuralChange) {
                    debouncedRefreshOutline === null || debouncedRefreshOutline === void 0 ? void 0 : debouncedRefreshOutline();
                }
                if (isStructuralChange || QuillExtensions.isHeadingChange(delta, oldDelta)) {
                    debouncedUpdateTOC === null || debouncedUpdateTOC === void 0 ? void 0 : debouncedUpdateTOC();
                }
            }
            if (source === 'user') {
                this.lastCollapseOperationTime = 0;
                this._isActivelyTyping = true;
                if (this._typingIdleTimer) {
                    clearTimeout(this._typingIdleTimer);
                }
                this._typingIdleTimer = setTimeout(() => {
                    var _a, _b;
                    this._isActivelyTyping = false;
                    if (quill.composition.isComposing) {
                        this._compositionPendingProcess = true;
                        return;
                    }
                    const sel = quill.getSelection();
                    if (sel) {
                        const [cursorLine] = quill.getLine(sel.index);
                        if ((_b = (_a = cursorLine === null || cursorLine === void 0 ? void 0 : cursorLine.domNode) === null || _a === void 0 ? void 0 : _a.dataset) === null || _b === void 0 ? void 0 : _b.processedHash) {
                            delete cursorLine.domNode.dataset.processedHash;
                        }
                    }
                    QuillExtensions.processVisibleLines(quill, this);
                }, this.spellcheckIdleDelay);
                if (this.justPressedEnter && this.editorSettings.clientOs === ClientOs.iOS) {
                    this.justPressedEnter = false;
                    this.safeSetTimeout(() => {
                        this.dummyInput.focus();
                        this.safeSetTimeout(() => {
                            quill.focus();
                        }, 0);
                    }, 0);
                }
            }
        });
        quill.on('composition-end', () => {
            if (this._compositionPendingProcess) {
                this._compositionPendingProcess = false;
                this.safeSetTimeout(() => {
                    debouncedProcessVisibleLines(quill, this);
                }, 0);
            }
        });
        const scrollAndResizeHandler = () => {
            if (quill !== this.primaryNotesEditor && quill !== this.cellNotesEditor) {
                return;
            }
            debouncedProcessVisibleLines(quill, this);
            if (!isCellEditor) {
                this.scheduleCollapseUiUpdate();
            }
            if (this.activeInlineTooltip) {
                const formats = quill.getFormat(this.activeInlineTooltip.index, this.activeInlineTooltip.length);
                if (!formats.link && !formats.mention) {
                    this.hideLinkTooltip();
                    return;
                }
                const url = (formats.link || formats.mention);
                const displayText = this.getNameFromUrl(url);
                const bounds = quill.getBounds({ index: this.activeInlineTooltip.index, length: this.activeInlineTooltip.length });
                this.showLinkTooltip(displayText, url, bounds, quill);
            }
            if (this.imageControls) {
                this.imageControls.positionControls();
            }
        };
        quill.root.addEventListener('scroll', scrollAndResizeHandler);
        const resizeObserver = new ResizeObserver(entries => {
            for (let entry of entries) {
                scrollAndResizeHandler();
            }
        });
        resizeObserver.observe(quill.root);
        this.resizeObservers.set(quill, resizeObserver);
        let parent = quill.root.parentElement;
        while (parent) {
            const overflowY = getComputedStyle(parent).overflowY;
            if (overflowY === 'auto' || overflowY === 'scroll') {
                parent.addEventListener('scroll', scrollAndResizeHandler);
                externalListeners.push({ element: parent, event: 'scroll', handler: scrollAndResizeHandler });
            }
            parent = parent.parentElement;
        }
        window.addEventListener('scroll', scrollAndResizeHandler);
        externalListeners.push({ element: window, event: 'scroll', handler: scrollAndResizeHandler });
        this.editorListeners.set(quill, externalListeners);
        if (!isCellEditor) {
            this.refreshOutline(quill);
        }
        return quill;
    }
    removeEventListenersForEditor(quill) {
        if (!quill)
            return;
        const externalListeners = this.editorListeners.get(quill);
        if (externalListeners) {
            externalListeners.forEach(({ element, event, handler }) => {
                element.removeEventListener(event, handler);
            });
            this.editorListeners.delete(quill);
        }
        const resizeObserver = this.resizeObservers.get(quill);
        if (resizeObserver) {
            resizeObserver.disconnect();
            this.resizeObservers.delete(quill);
        }
        const pointerHandlers = this.collapsePointerHandlers.get(quill);
        if (pointerHandlers) {
            quill.root.removeEventListener('mousemove', pointerHandlers.move);
            quill.root.removeEventListener('mouseleave', pointerHandlers.leave);
            this.collapsePointerHandlers.delete(quill);
        }
        const caret = this._animatedCarets.get(quill);
        if (caret) {
            caret.dispose();
            this._animatedCarets.delete(quill);
        }
    }
    initQuillExtensions(quill) {
        const LinkBlot = quill.constructor.import('formats/link');
        this.overrideLinkSanitizer(LinkBlot);
        this.overrideFontStyleWhitelist(FontStyle);
        Quill.register(LineBreakBlot, true);
        Quill.register(DividerBlot, true);
        Quill.register(MultiLevelBlockquoteBlot, true);
        Quill.register(MathExpressionBlot, true);
        Quill.register(TableBlot, true);
        Quill.register(TableOfContentsBlot, true);
        Quill.register(MentionStatusBlot, true);
        Quill.register(MentionBlot, true);
        Quill.register(MisspellingBlot, true);
        Quill.register(HighlightBlot, true);
        Quill.register(ResizableImage, true);
        Quill.register(FontStyle, true);
        quill.on('editor-change', (eventName, ...args) => {
            this.checkIfLinkTooltipShouldBeShown();
        });
        QuillExtensions.enableTableBlot(quill, this);
        QuillExtensions.addMathSelectionHoldBindings(quill, this);
    }
    overrideClicks(quill) {
        quill.root.addEventListener('click', (event) => {
            this.overrideClick(quill, false, event);
        });
        quill.root.addEventListener('contextmenu', (event) => {
            if (this.editorSettings.clientOs == ClientOs.Android || this.editorSettings.clientOs == ClientOs.iOS) {
                return;
            }
            this.overrideClick(quill, true, event);
        });
    }
    overrideClick(quill, isContextClick, event) {
        var _a, _b;
        const readonly = quill.options.readOnly;
        const target = event.target;
        if (!readonly && !isContextClick) {
            return;
        }
        let showLinkTooltip = false;
        let contextMenuType = null;
        let contextMenuWord = null;
        let contextMenuIndex = null;
        let contextMenuLength = null;
        const currentSelection = this.getSelectionWithFallback();
        const hasSelection = currentSelection && currentSelection.length > 0;
        const anchor = target.closest('a');
        if (anchor) {
            if (!isContextClick) {
                event.preventDefault();
                safeInvoke(this.dotNetHelper, "HandleLinkClick", [anchor.href]);
                return;
            }
            else {
                if (hasSelection) {
                    const rect = quill.root.getBoundingClientRect();
                    const x = event.clientX - rect.left;
                    const y = event.clientY - rect.top;
                    const clickedIndex = QuillExtensions.getClosestIndex(quill, x, y);
                    if (clickedIndex >= currentSelection.index && clickedIndex < currentSelection.index + currentSelection.length) {
                        showLinkTooltip = false;
                    }
                    else {
                        showLinkTooltip = true;
                        contextMenuType = ((_a = anchor.href) === null || _a === void 0 ? void 0 : _a.startsWith('brain://')) ? 'thoughtLink' : 'link';
                    }
                }
                else {
                    showLinkTooltip = true;
                    contextMenuType = ((_b = anchor.href) === null || _b === void 0 ? void 0 : _b.startsWith('brain://')) ? 'thoughtLink' : 'link';
                }
            }
        }
        else {
            const misspelling = target.closest('.misspelled-word');
            const mention = target.closest('.mentioned-thought');
            if (mention) {
                if (isContextClick && hasSelection) {
                    const rect = quill.root.getBoundingClientRect();
                    const x = event.clientX - rect.left;
                    const y = event.clientY - rect.top;
                    const clickedIndex = QuillExtensions.getClosestIndex(quill, x, y);
                    if (clickedIndex >= currentSelection.index && clickedIndex < currentSelection.index + currentSelection.length) {
                        showLinkTooltip = false;
                    }
                    else {
                        showLinkTooltip = true;
                        if (misspelling && (mention.contains(misspelling) || misspelling.contains(mention))) {
                            const misspellingBlot = Quill.find(misspelling);
                            if (misspellingBlot && misspellingBlot !== quill) {
                                const word = misspelling.textContent || "";
                                const index = quill.getIndex(misspellingBlot);
                                const length = word.length;
                                contextMenuType = 'link-misspelling';
                                contextMenuWord = word;
                                contextMenuIndex = index;
                                contextMenuLength = length;
                            }
                            else {
                                contextMenuType = 'link';
                            }
                        }
                        else {
                            contextMenuType = 'link';
                        }
                    }
                }
                else {
                    showLinkTooltip = true;
                    if (isContextClick) {
                        if (misspelling && (mention.contains(misspelling) || misspelling.contains(mention))) {
                            const misspellingBlot = Quill.find(misspelling);
                            if (misspellingBlot && misspellingBlot !== quill) {
                                const word = misspelling.textContent || "";
                                const index = quill.getIndex(misspellingBlot);
                                const length = word.length;
                                contextMenuType = 'link-misspelling';
                                contextMenuWord = word;
                                contextMenuIndex = index;
                                contextMenuLength = length;
                            }
                            else {
                                contextMenuType = 'link';
                            }
                        }
                        else {
                            contextMenuType = 'link';
                        }
                    }
                }
            }
            else {
                if (misspelling && isContextClick) {
                    event.preventDefault();
                    event.stopPropagation();
                    const rect = quill.root.getBoundingClientRect();
                    const x = event.clientX - rect.left;
                    const y = event.clientY - rect.top;
                    const tappedIndex = QuillExtensions.getClosestIndex(quill, x, y);
                    quill.setSelection({ index: tappedIndex, length: 0 });
                    const misspellingBlot = Quill.find(misspelling);
                    if (misspellingBlot && misspellingBlot !== quill) {
                        const word = misspelling.textContent || "";
                        const index = quill.getIndex(misspellingBlot);
                        const length = word.length;
                        this.showContextMenu(event.clientX, event.clientY, "misspelling", word, index, length);
                    }
                    return;
                }
            }
        }
        if (showLinkTooltip) {
            event.preventDefault();
            if (isContextClick) {
                event.stopPropagation();
            }
            const rect = quill.root.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;
            const tappedIndex = QuillExtensions.getClosestIndex(quill, x, y);
            if (contextMenuType === 'link-misspelling' && contextMenuIndex != null && contextMenuLength != null) {
                quill.setSelection({ index: contextMenuIndex, length: contextMenuLength });
            }
            else {
                quill.setSelection({ index: tappedIndex, length: 0 });
            }
            this.checkIfLinkTooltipShouldBeShown();
            if (isContextClick && contextMenuType) {
                this.showContextMenu(event.clientX, event.clientY, contextMenuType, contextMenuWord !== null && contextMenuWord !== void 0 ? contextMenuWord : undefined, contextMenuIndex !== null && contextMenuIndex !== void 0 ? contextMenuIndex : undefined, contextMenuLength !== null && contextMenuLength !== void 0 ? contextMenuLength : undefined);
            }
        }
        else if (this.activeInlineTooltip != null) {
            event.preventDefault();
            event.stopPropagation();
            this.hideLinkTooltip();
        }
        else {
            if (isContextClick) {
                let isSelectedCells = false;
                const targetTable = target.closest('table');
                const targetCell = target.closest('td');
                if (targetTable) {
                    TableBlot.getSelectedCells(targetTable).forEach((cell) => {
                        if (cell === targetCell) {
                            isSelectedCells = true;
                        }
                    });
                }
                if (!isSelectedCells) {
                    const isCellEditorActive = this.isCellEditorActive();
                    if (!isCellEditorActive) {
                        if (targetCell) {
                            TableBlot.activateCell(targetCell, this);
                        }
                    }
                }
                const targetImage = target.closest('img') || (target.tagName === 'IMG' ? target : null);
                if (targetImage) {
                    const imageBlot = Quill.find(targetImage);
                    if (imageBlot && imageBlot !== quill) {
                        const index = quill.getIndex(imageBlot);
                        if (index !== -1) {
                            quill.setSelection(index, 1, 'silent');
                        }
                    }
                }
                event.preventDefault();
                event.stopPropagation();
                let mode = "standard";
                if (isSelectedCells) {
                    mode = "table";
                }
                this.showContextMenu(event.clientX, event.clientY, mode);
            }
            else {
            }
        }
    }
    overrideLinkSanitizer(LinkBlot) {
        LinkBlot.sanitize = (url) => url;
    }
    overrideFontStyleWhitelist(FontStyle) {
        FontStyle.whitelist = null;
    }
    getNameFromUrl(url) {
        const isInternalLink = url.startsWith('brain://');
        if (isInternalLink && url.indexOf('?name=') > -1) {
            let name = url.substring(url.indexOf('?name=') + 6);
            name = decodeURIComponent(name);
            return name;
        }
        return url;
    }
    checkIfLinkTooltipShouldBeShown() {
        const quill = this.notesEditor();
        const range = this.getSelectionWithFallback();
        if (!quill || !range) {
            this.hideLinkTooltip();
            return;
        }
        if (range.length > 0 || range.index === 0) {
            this.hideLinkTooltip();
            return;
        }
        const isSelectionCollapsed = range.length === 0;
        const formats = quill.getFormat(range.index, range.length);
        if (formats.link || formats.mention) {
            const [leaf, offset] = quill.getLeaf(isSelectionCollapsed ? range.index : range.index + 1);
            const url = formats.link || formats.mention;
            let displayText = this.getNameFromUrl(url);
            const bounds = quill.getBounds(range);
            this.showLinkTooltip(displayText, url, bounds, quill);
            this.activeInlineTooltip = {
                index: range.index,
                length: range.length,
                type: formats.link ? 'link' : 'mention'
            };
        }
        else {
            this.hideLinkTooltip();
        }
    }
    getFormatRange(quill, index, formatName) {
        let formatBlot = null;
        const [leaf] = quill.getLeaf(index);
        if (leaf) {
            if (leaf.statics && leaf.statics.blotName === formatName) {
                formatBlot = leaf;
            }
            else if (leaf.parent && leaf.parent.statics && leaf.parent.statics.blotName === formatName) {
                formatBlot = leaf.parent;
            }
        }
        if (formatBlot) {
            const formatIndex = quill.getIndex(formatBlot);
            const length = formatBlot.length();
            return { index: formatIndex, length: length };
        }
        return null;
    }
    getFormatRangeForLinkOrMention(index) {
        const quill = this.notesEditor();
        let formatRange = this.getFormatRange(quill, index, 'link');
        let formatType = 'link';
        if (!formatRange) {
            formatRange = this.getFormatRange(quill, index, 'mention');
            formatType = 'mention';
        }
        if (!formatRange) {
            return null;
        }
        let start = formatRange.index;
        let end = formatRange.index + formatRange.length;
        const leftRange = this.getFormatRange(quill, formatRange.index - 1, formatType);
        const rightRange = this.getFormatRange(quill, formatRange.index + formatRange.length, formatType);
        if (leftRange) {
            start = leftRange.index;
        }
        if (rightRange) {
            end = rightRange.index + rightRange.length;
        }
        return { index: start, length: end - start, type: formatType };
    }
    getWordRangeAtIndex(index) {
        const quill = this.notesEditor();
        if (!quill)
            return null;
        const totalLength = quill.getLength();
        if (index < 0 || index >= totalLength)
            return null;
        const lookBehind = Math.min(index, 100);
        const lookAhead = Math.min(totalLength - index, 100);
        const startPos = index - lookBehind;
        const contents = quill.getContents(startPos, lookBehind + lookAhead);
        let textChunk = '';
        for (const op of (contents.ops || [])) {
            if (typeof op.insert === 'string') {
                textChunk += op.insert;
            }
            else if (op.insert != null) {
                textChunk += '\n';
            }
        }
        const cursorPosInChunk = lookBehind;
        const wordCharRegex = /[^\s\p{P}\p{Z}]/u;
        const nonWordCharRegex = /[\s\p{P}\p{Z}]/u;
        let searchPos = cursorPosInChunk;
        const charAtCursor = textChunk[cursorPosInChunk];
        if (!charAtCursor) {
            return null;
        }
        if (nonWordCharRegex.test(charAtCursor)) {
            if (cursorPosInChunk > 0 && wordCharRegex.test(textChunk[cursorPosInChunk - 1])) {
                searchPos = cursorPosInChunk - 1;
            }
            else {
                return null;
            }
        }
        let wordStart = searchPos;
        while (wordStart > 0 && wordCharRegex.test(textChunk[wordStart - 1])) {
            wordStart--;
        }
        let wordEnd = searchPos + 1;
        while (wordEnd < textChunk.length && wordCharRegex.test(textChunk[wordEnd])) {
            wordEnd++;
        }
        const wordStartIndex = startPos + wordStart;
        const wordLength = wordEnd - wordStart;
        if (wordLength === 0) {
            return null;
        }
        return { index: wordStartIndex, length: wordLength };
    }
    middleTruncateText(text, maxLength = 45) {
        if (!text || text.length <= maxLength) {
            return text;
        }
        const availableLength = maxLength - 3;
        const startLength = Math.ceil(availableLength * 0.5);
        const endLength = Math.floor(availableLength * 0.5);
        const start = text.substring(0, startLength);
        const end = text.substring(text.length - endLength);
        return `${start}...${end}`;
    }
    refreshOutline(quillOverride) {
        var _a, _b, _c, _d;
        const editor = quillOverride !== null && quillOverride !== void 0 ? quillOverride : this.notesEditor();
        if (!editor) {
            this.outlineBlocks = [];
            this.outlineBlockById.clear();
            this.hasAnyCollapsibleBlocks = false;
            this.scheduleCollapseUiUpdate();
            return;
        }
        const lines = editor.getLines(0, editor.getLength());
        const outline = [];
        const map = new Map();
        const stack = [];
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const domNode = line.domNode;
            const length = typeof line.length === 'function' ? line.length() : 0;
            if (!domNode) {
                continue;
            }
            const lineText = (_b = (_a = domNode.innerText) !== null && _a !== void 0 ? _a : domNode.textContent) !== null && _b !== void 0 ? _b : '';
            const lineIndexInDoc = typeof editor.getIndex === 'function' ? editor.getIndex(line) : 0;
            const lineFormats = typeof line.formats === 'function' ? line.formats() : editor.getFormat(lineIndexInDoc, Math.max(1, length));
            const { level, type } = this.computeOutlineLevel(line, lineText, lineFormats);
            const id = this.ensureLineId(domNode);
            const outlinePosition = outline.length;
            const block = {
                id,
                lineIndex: i,
                outlinePosition,
                outlineEndPosition: outlinePosition,
                level,
                type,
                isCollapsible: false,
                isCollapsed: (_d = (_c = this.collapseState.get(id)) === null || _c === void 0 ? void 0 : _c.isCollapsed) !== null && _d !== void 0 ? _d : false,
                domNode,
                parentId: null
            };
            while (stack.length && stack[stack.length - 1].level >= block.level) {
                stack.pop();
            }
            if (block.type !== 'list') {
                while (stack.length && stack[stack.length - 1].type === 'list') {
                    stack.pop();
                }
            }
            block.parentId = stack.length ? stack[stack.length - 1].id : null;
            stack.push(block);
            outline.push(block);
            map.set(id, block);
        }
        let foundCollapsible = false;
        for (let index = 0; index < outline.length; index++) {
            const block = outline[index];
            let hasChild = false;
            let lastDescendant = index;
            for (let lookahead = index + 1; lookahead < outline.length; lookahead++) {
                const candidate = outline[lookahead];
                if (candidate.level <= block.level) {
                    break;
                }
                if (block.type === 'list' && candidate.type === 'paragraph') {
                    break;
                }
                hasChild = true;
                lastDescendant = lookahead;
            }
            if (hasChild && block.type !== 'paragraph' && block.type !== 'code') {
                block.isCollapsible = true;
                block.outlineEndPosition = lastDescendant;
                foundCollapsible = true;
            }
            else {
                block.isCollapsed = false;
                block.outlineEndPosition = block.outlinePosition;
                if (this.collapseState.has(block.id)) {
                    this.collapseState.delete(block.id);
                }
            }
        }
        for (const id of Array.from(this.collapseState.keys())) {
            if (!map.has(id)) {
                this.collapseState.delete(id);
            }
        }
        this.outlineBlocks = outline;
        this.outlineBlockById = map;
        this.hasAnyCollapsibleBlocks = foundCollapsible;
        this.applyCollapseState(false);
        this.scheduleCollapseUiUpdate();
    }
    computeOutlineLevel(line, text, formats) {
        const indent = typeof (formats === null || formats === void 0 ? void 0 : formats.indent) === 'number' ? formats.indent : 0;
        if (formats === null || formats === void 0 ? void 0 : formats.header) {
            const headerLevel = Number(formats.header) || 1;
            return { level: headerLevel * 10, type: 'heading' };
        }
        if (formats === null || formats === void 0 ? void 0 : formats.list) {
            return { level: 100 + indent * 10, type: 'list' };
        }
        if (formats === null || formats === void 0 ? void 0 : formats['code-block']) {
            return { level: 200 + indent * 10, type: 'code' };
        }
        if (formats === null || formats === void 0 ? void 0 : formats.blockquote) {
            const quoteLevel = typeof formats.blockquote === 'number' ? formats.blockquote : 1;
            return { level: 150 + (quoteLevel - 1) * 10 + indent, type: 'blockquote' };
        }
        const trimmed = text.trim();
        return { level: 300 + indent * 10 + (trimmed.length === 0 ? 5 : 0), type: trimmed.length === 0 ? 'paragraph' : 'paragraph' };
    }
    ensureLineId(domNode) {
        var _a;
        if (!domNode.dataset) {
            domNode.dataset = {};
        }
        let id = (_a = domNode.dataset.venusLineId) !== null && _a !== void 0 ? _a : '';
        if (id) {
            const existingOwner = this.lineNodeById.get(id);
            if (existingOwner && existingOwner !== domNode) {
                if (existingOwner.isConnected) {
                    console.log(`[VenusEditor] Duplicate line id '${id}' detected; assigning a new id for cloned line.`);
                    id = '';
                }
                else {
                    this.lineNodeById.delete(id);
                }
            }
        }
        if (!id) {
            this.lineIdSeed++;
            id = `vl-${this.lineIdSeed}`;
            domNode.dataset.venusLineId = id;
        }
        this.lineNodeById.set(id, domNode);
        return id;
    }
    applyCollapseState(allowAnimation = true) {
        var _a, _b, _c;
        const editor = this.notesEditor();
        if (!editor) {
            return;
        }
        const neverCollapse = this.editorSettings.collapseButtonVisibility === OutlineCollapseButtonVisibility.Never;
        const hiddenLineIndices = new Set();
        for (const block of this.outlineBlocks) {
            const isCollapsed = neverCollapse ? false : ((_b = (_a = this.collapseState.get(block.id)) === null || _a === void 0 ? void 0 : _a.isCollapsed) !== null && _b !== void 0 ? _b : false);
            block.isCollapsed = block.isCollapsible && isCollapsed;
            if (block.isCollapsed) {
                for (let pos = block.outlinePosition + 1; pos <= block.outlineEndPosition && pos < this.outlineBlocks.length; pos++) {
                    hiddenLineIndices.add(this.outlineBlocks[pos].lineIndex);
                }
            }
        }
        const enableAnimation = allowAnimation && this.collapseAnimationMode === 'single';
        const lines = editor.getLines(0, editor.getLength());
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const domNode = line.domNode;
            if (!domNode) {
                continue;
            }
            const shouldHide = hiddenLineIndices.has(i);
            const wasHidden = ((_c = domNode.dataset) === null || _c === void 0 ? void 0 : _c.collapsedHidden) === 'true';
            if (shouldHide) {
                if (enableAnimation && !wasHidden) {
                    this.animateLineHide(domNode);
                }
                else {
                    this.stopLineAnimation(domNode);
                    domNode.style.display = 'none';
                    domNode.style.height = '';
                    domNode.style.opacity = '';
                    domNode.style.transition = '';
                    domNode.style.overflow = '';
                    if (!domNode.dataset) {
                        domNode.dataset = {};
                    }
                    domNode.dataset.collapsedHidden = 'true';
                }
            }
            else {
                if (enableAnimation && wasHidden) {
                    this.animateLineShow(domNode);
                }
                else {
                    this.stopLineAnimation(domNode);
                    domNode.style.display = '';
                    domNode.style.height = '';
                    domNode.style.opacity = '';
                    domNode.style.transition = '';
                    domNode.style.overflow = '';
                    if (!domNode.dataset) {
                        domNode.dataset = {};
                    }
                    domNode.dataset.collapsedHidden = 'false';
                }
            }
        }
        const codeBlockContainers = editor.root.querySelectorAll('.ql-code-block-container');
        for (const container of codeBlockContainers) {
            const children = Array.from(container.children);
            const allChildrenHidden = children.length > 0 && children.every(child => { var _a; return ((_a = child.dataset) === null || _a === void 0 ? void 0 : _a.collapsedHidden) === 'true'; });
            if (allChildrenHidden) {
                container.style.display = 'none';
            }
            else {
                container.style.display = '';
            }
        }
        this.collapseAnimationMode = 'single';
        this.updateCollapseForSelection();
        this.updateOutlineCommandStates();
    }
    stopLineAnimation(domNode) {
        const cleanup = domNode._collapseAnimationCleanup;
        if (cleanup) {
            cleanup();
        }
    }
    animateLineHide(domNode) {
        this.stopLineAnimation(domNode);
        const startHeight = domNode.offsetHeight;
        domNode.dataset.collapsedHidden = 'true';
        domNode.style.display = '';
        if (startHeight <= 0) {
            domNode.style.display = 'none';
            domNode.style.height = '';
            domNode.style.opacity = '';
            domNode.style.transition = '';
            domNode.style.overflow = '';
            delete domNode._collapseAnimationCleanup;
            return;
        }
        domNode.style.overflow = 'hidden';
        domNode.style.height = `${startHeight}px`;
        domNode.style.opacity = '1';
        domNode.style.transition = 'height 180ms ease, opacity 180ms ease';
        const cleanup = () => {
            domNode.removeEventListener('transitionend', onTransition);
            domNode.style.display = 'none';
            domNode.style.height = '';
            domNode.style.opacity = '';
            domNode.style.transition = '';
            domNode.style.overflow = '';
            delete domNode._collapseAnimationCleanup;
        };
        const onTransition = (event) => {
            if (event.propertyName !== 'height') {
                return;
            }
            cleanup();
        };
        domNode.addEventListener('transitionend', onTransition);
        domNode._collapseAnimationCleanup = cleanup;
        requestAnimationFrame(() => {
            domNode.style.height = '0px';
            domNode.style.opacity = '0';
        });
    }
    animateLineShow(domNode) {
        this.stopLineAnimation(domNode);
        domNode.dataset.collapsedHidden = 'false';
        domNode.style.display = '';
        domNode.style.overflow = 'hidden';
        domNode.style.height = '0px';
        domNode.style.opacity = '0';
        domNode.style.transition = 'height 180ms ease, opacity 180ms ease';
        const targetHeight = domNode.scrollHeight;
        if (targetHeight <= 0) {
            domNode.style.height = '';
            domNode.style.opacity = '';
            domNode.style.transition = '';
            domNode.style.overflow = '';
            delete domNode._collapseAnimationCleanup;
            return;
        }
        const cleanup = () => {
            domNode.removeEventListener('transitionend', onTransition);
            domNode.style.height = '';
            domNode.style.opacity = '';
            domNode.style.transition = '';
            domNode.style.overflow = '';
            delete domNode._collapseAnimationCleanup;
        };
        const onTransition = (event) => {
            if (event.propertyName !== 'height') {
                return;
            }
            cleanup();
        };
        domNode.addEventListener('transitionend', onTransition);
        domNode._collapseAnimationCleanup = cleanup;
        requestAnimationFrame(() => {
            domNode.style.height = `${targetHeight}px`;
            domNode.style.opacity = '1';
        });
    }
    scheduleCollapseUiUpdate() {
        if (this.collapseRenderScheduled) {
            return;
        }
        this.collapseRenderScheduled = true;
        requestAnimationFrame(() => {
            this.collapseRenderScheduled = false;
            this.renderCollapseControls();
        });
    }
    ensureCollapseOverlay() {
        if (this.collapseOverlay && this.collapseOverlay.isConnected) {
            return this.collapseOverlay;
        }
        const editor = this.notesEditor();
        if (!editor) {
            return null;
        }
        const container = editor.container;
        if (!container) {
            return null;
        }
        if (getComputedStyle(container).position === 'static') {
            container.style.position = 'relative';
        }
        const overlay = document.createElement('div');
        overlay.className = 'venus-collapse-overlay';
        overlay.style.position = 'absolute';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.right = '0';
        overlay.style.bottom = '0';
        overlay.style.pointerEvents = 'none';
        overlay.style.zIndex = '2';
        container.appendChild(overlay);
        this.collapseOverlay = overlay;
        return overlay;
    }
    clearCollapseOverlay() {
        if (this.collapseOverlay && this.collapseOverlay.isConnected) {
            this.collapseOverlay.innerHTML = '';
            this.collapseOverlay.style.display = 'none';
        }
    }
    static setClassPresence(element, className, present) {
        if (element.classList.contains(className) !== present) {
            element.classList.toggle(className, present);
        }
    }
    renderCollapseControls() {
        const editor = this.notesEditor();
        if (!editor) {
            this.clearCollapseOverlay();
            return;
        }
        if (this.isCellEditorActive() && this.isCellEditorInstance(editor)) {
            const cellRoot = editor.root;
            VenusEditor.setClassPresence(cellRoot, 'venus-outline-collapsible', false);
            if (this.collapseOverlay) {
                this.collapseOverlay.innerHTML = '';
                this.collapseOverlay.style.display = 'none';
            }
            return;
        }
        const rootElement = editor.root;
        const overlay = this.ensureCollapseOverlay();
        if (!overlay) {
            VenusEditor.setClassPresence(rootElement, 'venus-outline-collapsible', false);
            return;
        }
        if (!this.hasAnyCollapsibleBlocks || this.editorSettings.collapseButtonVisibility === OutlineCollapseButtonVisibility.Never) {
            overlay.innerHTML = '';
            overlay.style.display = 'none';
            VenusEditor.setClassPresence(rootElement, 'venus-outline-collapsible', false);
            VenusEditor.setClassPresence(rootElement, 'venus-collapse-hidden-phone', this.editorSettings.isPhone && this.editorSettings.collapseButtonVisibility === OutlineCollapseButtonVisibility.Never);
            return;
        }
        overlay.style.display = '';
        const container = editor.container;
        const containerRect = container.getBoundingClientRect();
        const rootRect = rootElement.getBoundingClientRect();
        const cssScaleY = rootElement.offsetHeight > 0
            ? rootRect.height / rootElement.offsetHeight
            : 1;
        const rootOffsetWithinContainer = (rootRect.top - containerRect.top) / cssScaleY;
        const viewportTop = rootElement.scrollTop - this.collapseHoverMargin;
        const viewportBottom = rootElement.scrollTop + rootElement.clientHeight + this.collapseHoverMargin;
        const range = this.getSelectionWithFallback();
        const selectionBlock = range ? this.getOutlineBlockForIndex(range.index) : null;
        const nearestSelectionCollapse = range ? this.getNearestCollapsibleBlockForIndex(range.index) : null;
        const existingButtons = new Map();
        const buttonsToRemove = [];
        Array.from(overlay.children).forEach(child => {
            if (!(child instanceof HTMLButtonElement)) {
                return;
            }
            const blockId = child.dataset.blockId;
            if (!blockId) {
                buttonsToRemove.push(child);
                return;
            }
            if (existingButtons.has(blockId)) {
                buttonsToRemove.push(child);
                return;
            }
            existingButtons.set(blockId, child);
        });
        if (buttonsToRemove.length > 0) {
            console.log(`[VenusEditor] Removed ${buttonsToRemove.length} duplicate collapse toggle(s) from overlay.`);
            for (const leftover of buttonsToRemove) {
                leftover.remove();
            }
        }
        const horizontalPosition = Math.max(rootElement.scrollLeft + 4, 4);
        let renderedButtons = 0;
        for (const block of this.outlineBlocks) {
            if (!block.isCollapsible) {
                continue;
            }
            const domNode = block.domNode;
            if (!domNode || !domNode.isConnected) {
                continue;
            }
            const blockTop = this.getOffsetTopRelativeTo(domNode, rootElement);
            const blockHeight = domNode.offsetHeight || (domNode.getBoundingClientRect().height / cssScaleY);
            const blockBottom = blockTop + blockHeight;
            if (blockBottom < viewportTop) {
                continue;
            }
            if (blockTop > viewportBottom) {
                break;
            }
            let button = existingButtons.get(block.id);
            if (!button) {
                button = document.createElement('button');
                button.type = 'button';
                button.className = 'venus-collapse-toggle';
                button.dataset.blockId = block.id;
                button.style.position = 'absolute';
                button.setAttribute('aria-expanded', block.isCollapsed ? 'false' : 'true');
                button.addEventListener('click', event => {
                    event.preventDefault();
                    event.stopPropagation();
                    this.toggleCollapseById(block.id, true);
                });
                button.addEventListener('mouseenter', () => {
                    if (this.hoveredCollapseId !== block.id) {
                        this.hoveredCollapseId = block.id;
                        this.scheduleCollapseUiUpdate();
                    }
                });
                button.addEventListener('mouseleave', evt => {
                    var _a;
                    const related = evt.relatedTarget;
                    if (related && (((_a = related.classList) === null || _a === void 0 ? void 0 : _a.contains('venus-collapse-toggle')) || related.closest('.venus-collapse-overlay'))) {
                        return;
                    }
                    if (this.editorSettings.collapseButtonVisibility !== OutlineCollapseButtonVisibility.Always) {
                        this.hoveredCollapseId = null;
                        this.scheduleCollapseUiUpdate();
                    }
                });
                const icon = document.createElement('i');
                icon.style.display = 'inline-block';
                icon.style.transition = 'transform 160ms ease';
                button.appendChild(icon);
                this.updateCollapseIcon(icon, block.isCollapsed);
                overlay.appendChild(button);
            }
            button.dataset.blockId = block.id;
            button.setAttribute('aria-expanded', block.isCollapsed ? 'false' : 'true');
            const iconElement = button.querySelector('i');
            if (iconElement) {
                this.updateCollapseIcon(iconElement, block.isCollapsed);
            }
            const visibleTop = blockTop - rootElement.scrollTop;
            const verticalCenter = rootOffsetWithinContainer + visibleTop + (blockHeight / 2);
            button.style.top = `${verticalCenter}px`;
            button.style.left = `${horizontalPosition}px`;
            button.style.transform = 'translateY(-50%)';
            const cursorWithinBlock = (nearestSelectionCollapse === null || nearestSelectionCollapse === void 0 ? void 0 : nearestSelectionCollapse.id) === block.id && selectionBlock != null;
            const pointerWithinBlock = this.hoveredCollapseId === block.id;
            const shouldShow = this.editorSettings.collapseButtonVisibility === OutlineCollapseButtonVisibility.Always ||
                block.isCollapsed ||
                cursorWithinBlock ||
                pointerWithinBlock;
            let opacityValue = '0';
            if (shouldShow) {
                opacityValue = cursorWithinBlock ? '1' : '0.3';
            }
            button.style.opacity = opacityValue;
            button.style.transition = 'opacity 120ms ease-out';
            button.style.pointerEvents = shouldShow ? 'auto' : 'none';
            existingButtons.delete(block.id);
            renderedButtons++;
        }
        for (const leftover of existingButtons.values()) {
            leftover.remove();
        }
        if (renderedButtons === 0) {
            overlay.style.display = 'none';
        }
        VenusEditor.setClassPresence(rootElement, 'venus-outline-collapsible', this.hasAnyCollapsibleBlocks);
    }
    updateCollapseIcon(icon, isCollapsed) {
        icon.className = 'fa fa-caret-right fa-lg';
        if (!icon.style.display) {
            icon.style.display = 'inline-block';
        }
        if (!icon.style.transition) {
            icon.style.transition = 'transform 160ms ease';
        }
        icon.style.transform = isCollapsed ? 'rotate(0deg)' : 'rotate(90deg)';
    }
    handleEditorPointerMove(event, quill) {
        if (this.editorSettings.collapseButtonVisibility === OutlineCollapseButtonVisibility.Minimally ||
            this.editorSettings.collapseButtonVisibility === OutlineCollapseButtonVisibility.Never) {
            return;
        }
        const target = event.target;
        if (target && target.classList.contains('venus-collapse-toggle') && target.dataset.blockId) {
            if (this.hoveredCollapseId !== target.dataset.blockId) {
                this.hoveredCollapseId = target.dataset.blockId;
                this.scheduleCollapseUiUpdate();
            }
            return;
        }
        const root = quill === null || quill === void 0 ? void 0 : quill.root;
        if (!root) {
            return;
        }
        const rootRect = root.getBoundingClientRect();
        const relativeX = event.clientX - rootRect.left + root.scrollLeft;
        const relativeY = event.clientY - rootRect.top + root.scrollTop;
        const editor = this.notesEditor();
        if (!editor) {
            return;
        }
        const index = QuillExtensions.getClosestIndex(quill, relativeX, relativeY);
        const hoverBlock = this.getNearestCollapsibleBlockForIndex(index);
        const nextHoverId = hoverBlock ? hoverBlock.id : null;
        if (this.hoveredCollapseId !== nextHoverId) {
            this.hoveredCollapseId = nextHoverId;
            this.scheduleCollapseUiUpdate();
        }
    }
    handleEditorPointerLeave(event) {
        if (event && event.relatedTarget instanceof HTMLElement) {
            if (event.relatedTarget.classList.contains('venus-collapse-toggle') || event.relatedTarget.closest('.venus-collapse-overlay')) {
                return;
            }
        }
        if (this.hoveredCollapseId !== null) {
            this.hoveredCollapseId = null;
            this.scheduleCollapseUiUpdate();
        }
    }
    getOffsetTopRelativeTo(node, ancestor) {
        let top = 0;
        let current = node;
        while (current && current !== ancestor) {
            top += current.offsetTop || 0;
            current = current.offsetParent;
        }
        if (current === ancestor) {
            return top;
        }
        const scaleY = ancestor.offsetHeight > 0
            ? ancestor.getBoundingClientRect().height / ancestor.offsetHeight
            : 1;
        const nodeRect = node.getBoundingClientRect();
        const ancestorRect = ancestor.getBoundingClientRect();
        return (nodeRect.top - ancestorRect.top) / scaleY + (ancestor.scrollTop || 0);
    }
    toggleCollapseById(blockId, animate) {
        var _a;
        if (this.editorSettings.collapseButtonVisibility === OutlineCollapseButtonVisibility.Never) {
            return;
        }
        const range = this.getSelectionWithFallback();
        const entry = this.collapseState.get(blockId);
        const isCollapsed = (_a = entry === null || entry === void 0 ? void 0 : entry.isCollapsed) !== null && _a !== void 0 ? _a : false;
        this.setCollapseState(blockId, !isCollapsed);
        this.collapseAnimationMode = animate ? 'single' : 'multi';
        this.applyCollapseState(animate);
        this.scheduleCollapseUiUpdate();
        this.updateOutlineCommandStates(range !== null && range !== void 0 ? range : null);
    }
    setCollapseState(blockId, collapsed) {
        if (collapsed) {
            this.collapseState.set(blockId, { isCollapsed: true });
            this.lastCollapseOperationTime = Date.now();
        }
        else {
            if (this.collapseState.has(blockId)) {
                this.collapseState.delete(blockId);
            }
        }
    }
    getOutlineBlockForIndex(index) {
        var _a, _b, _c;
        const editor = this.notesEditor();
        if (!editor) {
            return null;
        }
        const [line] = editor.getLine(index);
        if (!line || !line.domNode) {
            return null;
        }
        const domNode = line.domNode;
        const lineId = (_b = (_a = domNode.dataset) === null || _a === void 0 ? void 0 : _a.venusLineId) !== null && _b !== void 0 ? _b : this.ensureLineId(domNode);
        return lineId ? (_c = this.outlineBlockById.get(lineId)) !== null && _c !== void 0 ? _c : null : null;
    }
    getCollapsedBlockAtIndex(index) {
        var _a, _b;
        const block = this.getOutlineBlockForIndex(index);
        if (!block || !block.isCollapsible) {
            return null;
        }
        const isCollapsed = (_b = (_a = this.collapseState.get(block.id)) === null || _a === void 0 ? void 0 : _a.isCollapsed) !== null && _b !== void 0 ? _b : block.isCollapsed;
        return isCollapsed ? block : null;
    }
    getNearestCollapsibleBlockForIndex(index) {
        const block = this.getOutlineBlockForIndex(index);
        return this.getNearestCollapsibleAncestor(block);
    }
    ensureBlockReadyForOutdent(block) {
        if (!block.parentId) {
            return null;
        }
        const editor = this.notesEditor();
        if (!editor) {
            return null;
        }
        const nextSibling = this.getNextSiblingBlock(block);
        if (!nextSibling) {
            return null;
        }
        const parent = this.getBlockById(block.parentId);
        if (!parent) {
            return null;
        }
        const blockSpan = this.getBlockSpanIncludingDescendants(block);
        const parentSpan = this.getBlockSpanIncludingDescendants(parent);
        const length = blockSpan.end - blockSpan.start;
        if (length <= 0) {
            return null;
        }
        const targetIndex = parentSpan.end;
        return this.moveDocumentSpan(blockSpan.start, length, targetIndex);
    }
    moveDocumentSpan(start, length, targetIndex) {
        const editor = this.notesEditor();
        if (!editor || length <= 0) {
            return null;
        }
        const content = editor.getContents(start, length);
        editor.deleteText(start, length, 'user');
        const adjustedTarget = targetIndex > start ? targetIndex - length : targetIndex;
        let insertDelta = new Delta().retain(Math.max(0, adjustedTarget));
        insertDelta = insertDelta.concat(content);
        editor.updateContents(insertDelta, 'user');
        return Math.max(0, adjustedTarget);
    }
    getBlockSpanIncludingDescendants(block) {
        const startSpan = this.getDocumentSpanForBlock(block);
        let lastBlock = block;
        if (block.outlineEndPosition > block.outlinePosition) {
            const candidate = this.outlineBlocks[block.outlineEndPosition];
            if (candidate) {
                lastBlock = candidate;
            }
        }
        const endSpan = this.getDocumentSpanForBlock(lastBlock);
        return { start: startSpan.start, end: endSpan.end };
    }
    getListBlockSpanAtIndex(index) {
        const editor = this.notesEditor();
        const docLength = editor ? editor.getLength() : 0;
        if (editor && docLength > 0) {
            if (index < 0) {
                index = 0;
            }
            else if (index >= docLength) {
                index = docLength - 1;
            }
        }
        const tryIndex = (lookupIndex) => {
            if (editor && docLength > 0 && (lookupIndex < 0 || lookupIndex >= docLength)) {
                return null;
            }
            let block = this.getOutlineBlockForIndex(lookupIndex);
            const visited = new Set();
            while (block) {
                if (block.type === 'list') {
                    const span = this.getBlockSpanIncludingDescendants(block);
                    if (span.start <= lookupIndex && lookupIndex < span.end) {
                        return { block, start: span.start, end: span.end };
                    }
                    break;
                }
                if (!block.parentId || visited.has(block.parentId)) {
                    break;
                }
                visited.add(block.parentId);
                block = this.getBlockById(block.parentId);
            }
            return null;
        };
        const primary = tryIndex(index);
        if (primary) {
            return primary;
        }
        return tryIndex(index + 1);
    }
    updateSelectionAfterStructuralChange(index, length) {
        const editor = this.notesEditor();
        if (!editor) {
            return;
        }
        editor.setSelection(index, length, 'silent');
        if (this.activeEditor === 'cell') {
            this.savedCellSelection.cellSelection = { index, length };
        }
        else {
            this.savedPrimarySelection = { index, length };
        }
    }
    getNearestCollapsibleAncestor(block) {
        let current = block;
        const visited = new Set();
        while (current && !current.isCollapsible) {
            if (!current.parentId || visited.has(current.parentId)) {
                return null;
            }
            visited.add(current.parentId);
            current = this.getBlockById(current.parentId);
        }
        return current !== null && current !== void 0 ? current : null;
    }
    getBlockById(id) {
        var _a;
        if (!id) {
            return null;
        }
        return (_a = this.outlineBlockById.get(id)) !== null && _a !== void 0 ? _a : null;
    }
    isBlockAncestor(ancestor, descendant) {
        let current = descendant;
        const visited = new Set();
        while (current) {
            if (current.id === ancestor.id) {
                return true;
            }
            if (!current.parentId || visited.has(current.parentId)) {
                break;
            }
            visited.add(current.parentId);
            current = this.getBlockById(current.parentId);
        }
        return false;
    }
    doesBlockOverlapSelection(block, startBlock, endBlock) {
        if (!startBlock) {
            return false;
        }
        const effectiveEndBlock = endBlock !== null && endBlock !== void 0 ? endBlock : startBlock;
        if (this.isBlockAncestor(block, startBlock) || this.isBlockAncestor(block, effectiveEndBlock)) {
            return true;
        }
        const startPos = Math.min(startBlock.outlinePosition, effectiveEndBlock.outlinePosition);
        const endPos = Math.max(startBlock.outlinePosition, effectiveEndBlock.outlinePosition);
        return block.outlinePosition <= endPos && block.outlineEndPosition >= startPos;
    }
    getDocumentIndexForBlock(block) {
        var _a;
        const editor = this.notesEditor();
        if (!editor) {
            return 0;
        }
        const blot = (_a = Quill.find) === null || _a === void 0 ? void 0 : _a.call(Quill, block.domNode);
        if (blot && typeof editor.getIndex === 'function') {
            return editor.getIndex(blot);
        }
        throw new Error('Unable to find document index for outline block.');
    }
    getDocumentSpanForBlock(block) {
        var _a;
        const editor = this.notesEditor();
        if (!editor) {
            return { start: 0, end: 0 };
        }
        const start = this.getDocumentIndexForBlock(block);
        const lastBlock = (_a = this.outlineBlocks[block.outlineEndPosition]) !== null && _a !== void 0 ? _a : block;
        let endStart = start;
        try {
            endStart = this.getDocumentIndexForBlock(lastBlock);
        }
        catch (_b) {
            endStart = start;
        }
        let end = endStart;
        const endLineInfo = editor.getLine(endStart);
        const endLine = endLineInfo ? endLineInfo[0] : null;
        if (endLine) {
            end = endStart + endLine.length();
        }
        return { start, end };
    }
    getListBlocksInRange(range) {
        const editor = this.notesEditor();
        if (!editor) {
            return [];
        }
        const selectionEnd = range.index + Math.max(1, range.length || 1);
        const selected = [];
        const seen = new Set();
        let cursor = range.index;
        const maxIterations = 10000;
        let iterations = 0;
        while (cursor < selectionEnd && iterations++ < maxIterations) {
            const spanInfo = this.getListBlockSpanAtIndex(cursor);
            if (spanInfo && !seen.has(spanInfo.block.id)) {
                selected.push(spanInfo.block);
                seen.add(spanInfo.block.id);
                cursor = Math.max(spanInfo.end, cursor + 1);
                if (range.length === 0) {
                    break;
                }
                continue;
            }
            const lineInfo = editor.getLine(cursor);
            if (!lineInfo) {
                break;
            }
            const line = lineInfo[0];
            const offset = typeof lineInfo[1] === 'number' ? lineInfo[1] : 0;
            const lineStart = cursor - offset;
            const lineLength = typeof line.length === 'function' ? line.length() : 1;
            cursor = lineStart + Math.max(1, lineLength);
            if (range.length === 0) {
                break;
            }
        }
        return selected;
    }
    getListSelectionInfo(range) {
        const blocks = this.getListBlocksInRange(range);
        if (blocks.length === 0) {
            return null;
        }
        let start = Infinity;
        let end = -Infinity;
        for (const block of blocks) {
            const span = this.getBlockSpanIncludingDescendants(block);
            if (span.start < start) {
                start = span.start;
            }
            if (span.end > end) {
                end = span.end;
            }
        }
        return { blocks, start, end };
    }
    getPreviousSiblingBlock(block) {
        let pos = block.outlinePosition - 1;
        while (pos >= 0) {
            const candidate = this.outlineBlocks[pos];
            if (!candidate) {
                break;
            }
            if (candidate.level < block.level) {
                break;
            }
            if (candidate.level === block.level && candidate.parentId === block.parentId) {
                return candidate;
            }
            pos--;
        }
        return null;
    }
    getNextSiblingBlock(block) {
        let pos = block.outlineEndPosition + 1;
        while (pos < this.outlineBlocks.length) {
            const candidate = this.outlineBlocks[pos];
            if (!candidate) {
                break;
            }
            if (candidate.level < block.level) {
                break;
            }
            if (candidate.level === block.level && candidate.parentId === block.parentId) {
                return candidate;
            }
            pos++;
        }
        return null;
    }
    reapplyCollapseStateAfterMove(originalBlockId, targetIndex) {
        if (!originalBlockId) {
            return;
        }
        const editor = this.notesEditor();
        if (!editor) {
            return;
        }
        this.refreshOutline(editor);
        const targetBlock = this.getOutlineBlockForIndex(targetIndex);
        if (!targetBlock || !targetBlock.isCollapsible) {
            return;
        }
        if (targetBlock.id !== originalBlockId) {
            if (this.collapseState.has(originalBlockId)) {
                this.collapseState.delete(originalBlockId);
            }
        }
        this.setCollapseState(targetBlock.id, true);
        this.applyCollapseState(true);
        this.scheduleCollapseUiUpdate();
    }
    isIndexHidden(index) {
        var _a, _b, _c, _d;
        const block = this.getOutlineBlockForIndex(index);
        if (!block) {
            return false;
        }
        let ancestor = block.parentId ? (_a = this.outlineBlockById.get(block.parentId)) !== null && _a !== void 0 ? _a : null : null;
        const visited = new Set();
        while (ancestor) {
            if (visited.has(ancestor.id)) {
                break;
            }
            visited.add(ancestor.id);
            const isCollapsed = ancestor.isCollapsible && ((_c = (_b = this.collapseState.get(ancestor.id)) === null || _b === void 0 ? void 0 : _b.isCollapsed) !== null && _c !== void 0 ? _c : ancestor.isCollapsed);
            if (isCollapsed) {
                return true;
            }
            ancestor = ancestor.parentId ? (_d = this.outlineBlockById.get(ancestor.parentId)) !== null && _d !== void 0 ? _d : null : null;
        }
        return false;
    }
    getCollapsedAncestor(index) {
        var _a, _b, _c, _d;
        const block = this.getOutlineBlockForIndex(index);
        if (!block) {
            return null;
        }
        let ancestor = block.parentId ? (_a = this.outlineBlockById.get(block.parentId)) !== null && _a !== void 0 ? _a : null : null;
        const visited = new Set();
        while (ancestor) {
            if (visited.has(ancestor.id)) {
                break;
            }
            visited.add(ancestor.id);
            const isCollapsed = ancestor.isCollapsible && ((_c = (_b = this.collapseState.get(ancestor.id)) === null || _b === void 0 ? void 0 : _b.isCollapsed) !== null && _c !== void 0 ? _c : ancestor.isCollapsed);
            if (isCollapsed) {
                return ancestor;
            }
            ancestor = ancestor.parentId ? (_d = this.outlineBlockById.get(ancestor.parentId)) !== null && _d !== void 0 ? _d : null : null;
        }
        return null;
    }
    findNearestVisibleIndex(index) {
        var _a, _b;
        const editor = this.notesEditor();
        if (!editor) {
            return 0;
        }
        const maxIndex = Math.max(0, editor.getLength() - 1);
        let forward = index;
        let backward = index;
        while (forward <= maxIndex || backward >= 0) {
            if (forward <= maxIndex && !this.isIndexHidden(forward)) {
                return forward;
            }
            if (backward >= 0 && !this.isIndexHidden(backward)) {
                return backward;
            }
            if (backward >= 0) {
                const block = this.getOutlineBlockForIndex(backward);
                if (block) {
                    const collapsedBlock = this.getNearestCollapsibleAncestor(block);
                    if (collapsedBlock && ((_b = (_a = this.collapseState.get(collapsedBlock.id)) === null || _a === void 0 ? void 0 : _a.isCollapsed) !== null && _b !== void 0 ? _b : collapsedBlock.isCollapsed)) {
                        return this.getDocumentIndexForBlock(collapsedBlock);
                    }
                }
            }
            forward++;
            backward--;
        }
        return 0;
    }
    updateCollapseForSelection() {
        const editor = this.notesEditor();
        if (!editor) {
            return;
        }
        const hasFocus = typeof editor.hasFocus === 'function' ? editor.hasFocus() : document.activeElement === editor.root;
        if (!hasFocus) {
            return;
        }
        const range = this.getSelectionWithFallback();
        if (!range) {
            return;
        }
        if (range.length > 0 && !this.isIndexHidden(range.index) && !this.isIndexHidden(range.index + range.length - 1)) {
            return;
        }
        if (!this.isIndexHidden(range.index)) {
            return;
        }
        const timeSinceLastCollapse = Date.now() - this.lastCollapseOperationTime;
        const isRecentCollapseOperation = timeSinceLastCollapse < 200;
        if (!isRecentCollapseOperation) {
            const collapsedAncestor = this.getCollapsedAncestor(range.index);
            if (collapsedAncestor) {
                this.setCollapseState(collapsedAncestor.id, false);
                this.applyCollapseState(true);
                this.scheduleCollapseUiUpdate();
                return;
            }
        }
        const newIndex = this.findNearestVisibleIndex(range.index);
        editor.setSelection(newIndex, 0, 'silent');
    }
    showLinkTooltip(text, url, bounds, quillContext) {
        const quillInstance = quillContext !== null && quillContext !== void 0 ? quillContext : this.notesEditor();
        if (!quillInstance)
            return;
        const range = this.getSelectionWithFallback();
        if (!range || range.length > 0)
            return;
        let formatRange = this.getFormatRangeForLinkOrMention(range.index);
        if (formatRange == null) {
            console.log('No link or mention formatting at the current cursor.');
            return;
        }
        safeInvoke(this.dotNetHelper, "WillShowLinkTooltip", [url, formatRange.index, formatRange.length, formatRange.type === 'mention']);
        const tooltipContainer = document.getElementById(this.linkTooltipContainerId);
        const linkElement = document.getElementById(this.linkTooltipId);
        if (!tooltipContainer || !linkElement)
            return;
        linkElement.textContent = this.middleTruncateText(text);
        linkElement.href = "javascript:void(0)";
        linkElement.target = "";
        linkElement.onclick = (evt) => {
            evt.preventDefault();
            safeInvoke(this.dotNetHelper, "HandleLinkClick", [url]);
        };
        tooltipContainer.style.display = 'block';
        tooltipContainer.style.transform = '';
        this.enableSwipeToDismiss(tooltipContainer);
        this.positionTooltip(quillInstance, bounds, tooltipContainer);
    }
    positionTooltip(quillInstance, bounds, tooltipContainer) {
        var _a, _b;
        const editorContainer = (_a = quillInstance === null || quillInstance === void 0 ? void 0 : quillInstance.container) !== null && _a !== void 0 ? _a : (_b = this.primaryNotesEditor) === null || _b === void 0 ? void 0 : _b.container;
        if (!editorContainer)
            return;
        const editorRect = editorContainer.getBoundingClientRect();
        const tooltipWidth = tooltipContainer.offsetWidth;
        const caretCenterX = editorRect.left + bounds.left + (bounds.width / 2);
        const initialLeft = caretCenterX - (tooltipWidth / 2);
        const initialTop = (editorRect.top + bounds.bottom) + this.TOOLTIP_DISTANCE_FROM_SOURCE;
        const scaleContainer = tooltipContainer.closest('.attachments-and-note-section-scale-content');
        const scale = scaleContainer ? getScaleFactor(scaleContainer) : 1;
        let relativeLeft;
        let relativeTop;
        let caretInScaledSpace;
        if (scaleContainer) {
            const containerRect = scaleContainer.getBoundingClientRect();
            relativeLeft = (initialLeft - containerRect.left) / scale;
            relativeTop = (initialTop - containerRect.top) / scale;
            caretInScaledSpace = (caretCenterX - containerRect.left) / scale;
        }
        else {
            relativeLeft = initialLeft;
            relativeTop = initialTop;
            caretInScaledSpace = caretCenterX;
        }
        const scaledContainerWidth = scaleContainer ? (scaleContainer.offsetWidth) : window.innerWidth;
        const minLeft = this.TOOLTIP_VIEWPORT_PADDING;
        const maxLeft = scaledContainerWidth - tooltipWidth - this.TOOLTIP_VIEWPORT_PADDING;
        if (relativeLeft < minLeft) {
            relativeLeft = minLeft;
        }
        else if (relativeLeft > maxLeft) {
            relativeLeft = maxLeft;
        }
        tooltipContainer.style.left = `${relativeLeft}px`;
        tooltipContainer.style.top = `${relativeTop}px`;
        let arrowX = caretInScaledSpace - relativeLeft;
        const ARROW_MARGIN = 10;
        if (arrowX < ARROW_MARGIN) {
            arrowX = ARROW_MARGIN;
        }
        else if (arrowX > tooltipWidth - ARROW_MARGIN) {
            arrowX = tooltipWidth - ARROW_MARGIN;
        }
        tooltipContainer.style.setProperty('--arrow-left', `${arrowX}px`);
        const tooltipRect = tooltipContainer.getBoundingClientRect();
        const outOfBounds = tooltipRect.top < (editorRect.top + 20);
        if (outOfBounds) {
            this.hideLinkTooltip();
        }
        else {
            tooltipContainer.style.opacity = '1';
            tooltipContainer.childNodes.forEach((child) => {
                if (child instanceof HTMLElement) {
                    child.style.pointerEvents = 'auto';
                }
            });
        }
    }
    enableSwipeToDismiss(tooltip) {
        if (tooltip.dataset.swipeToDismissEnabled === 'true') {
            return;
        }
        tooltip.dataset.swipeToDismissEnabled = 'true';
        const DRAG_THRESHOLD = 5;
        const SWIPE_DISMISS_THRESHOLD = 60;
        const LOCK_DIRECTION_DISTANCE = 10;
        const FADE_START_THRESHOLD = 20;
        let pointerDown = false;
        let swiping = false;
        let lockedAxis = null;
        let startX = 0, startY = 0;
        let currentX = 0, currentY = 0;
        let pointerId = null;
        const originalTransition = tooltip.style.transition;
        function getMagneticDistance(d, threshold) {
            if (d >= threshold)
                return d;
            const ratio = d / threshold;
            const curved = 1 - Math.pow(1 - ratio, 0.3);
            return threshold * curved;
        }
        const onPointerDown = (e) => {
            if (e.target.id.startsWith('backgroundOverlay_')) {
                return;
            }
            pointerDown = true;
            swiping = false;
            lockedAxis = null;
            startX = e.clientX;
            startY = e.clientY;
            currentX = startX;
            currentY = startY;
            pointerId = e.pointerId;
        };
        const onPointerMove = (e) => {
            if (!pointerDown || e.pointerId !== pointerId)
                return;
            if (e.buttons === 0) {
                onPointerUpOrCancel(e);
                return;
            }
            currentX = e.clientX;
            currentY = e.clientY;
            const dxRaw = currentX - startX;
            const dyRaw = currentY - startY;
            if (!swiping) {
                const movedDistance = Math.sqrt(dxRaw * dxRaw + dyRaw * dyRaw);
                if (movedDistance > DRAG_THRESHOLD) {
                    swiping = true;
                    e.preventDefault();
                    tooltip.setPointerCapture(e.pointerId);
                    tooltip.style.transition = 'none';
                }
                else {
                    return;
                }
            }
            const absDx = Math.abs(dxRaw);
            const absDy = Math.abs(dyRaw);
            if (!lockedAxis) {
                if (absDx > absDy && absDx > LOCK_DIRECTION_DISTANCE) {
                    lockedAxis = 'horizontal';
                }
                else if (absDy > absDx && absDy > LOCK_DIRECTION_DISTANCE) {
                    lockedAxis = 'vertical';
                }
                else {
                    return;
                }
            }
            let distanceRaw = 0;
            let sign = 1;
            if (lockedAxis === 'horizontal') {
                distanceRaw = absDx;
                sign = dxRaw < 0 ? -1 : 1;
            }
            else {
                distanceRaw = absDy;
                sign = dyRaw < 0 ? -1 : 1;
            }
            const distanceMagnetic = getMagneticDistance(distanceRaw, SWIPE_DISMISS_THRESHOLD);
            let tx = 0, ty = 0;
            if (lockedAxis === 'horizontal') {
                tx = distanceMagnetic * sign;
            }
            else {
                ty = distanceMagnetic * sign;
            }
            let newOpacity = 1;
            if (distanceRaw > FADE_START_THRESHOLD) {
                const fadeRange = SWIPE_DISMISS_THRESHOLD - FADE_START_THRESHOLD;
                const fadeDistance = Math.min(distanceRaw - FADE_START_THRESHOLD, fadeRange);
                const ratio = fadeDistance / fadeRange;
                newOpacity = 1 - ratio;
            }
            tooltip.style.transform = `translate(${tx}px, ${ty}px)`;
            tooltip.style.opacity = String(newOpacity);
            e.preventDefault();
        };
        const onPointerUpOrCancel = (e) => {
            if (!pointerDown || e.pointerId !== pointerId)
                return;
            tooltip.style.transition = originalTransition || 'transform 0.2s ease-out, opacity 0.2s ease-out';
            if (swiping) {
                e.preventDefault();
                const dxRaw = currentX - startX;
                const dyRaw = currentY - startY;
                let distanceRaw = 0;
                if (lockedAxis === 'horizontal') {
                    distanceRaw = Math.abs(dxRaw);
                }
                else if (lockedAxis === 'vertical') {
                    distanceRaw = Math.abs(dyRaw);
                }
                if (distanceRaw >= SWIPE_DISMISS_THRESHOLD) {
                    tooltip.style.opacity = '0';
                    tooltip.style.display = 'none';
                }
                else {
                    tooltip.style.transform = '';
                    tooltip.style.opacity = '1';
                }
            }
            pointerDown = false;
            swiping = false;
            lockedAxis = null;
            pointerId = null;
        };
        tooltip.addEventListener('pointerdown', onPointerDown);
        tooltip.addEventListener('pointermove', onPointerMove);
        tooltip.addEventListener('pointerup', onPointerUpOrCancel);
        tooltip.addEventListener('pointercancel', onPointerUpOrCancel);
    }
    enterMathHold(quill, mathBlot, mathIndex, entryDirection) {
        var _a, _b;
        const domNode = mathBlot === null || mathBlot === void 0 ? void 0 : mathBlot.domNode;
        if (!domNode)
            return;
        if (this.heldMathInfo && this.heldMathInfo.mathDomNode !== domNode) {
            this.heldMathInfo.mathDomNode.classList.remove('ql-math-selected');
        }
        if (this.heldMathInfo && this.heldMathInfo.quill !== quill) {
            const prevRoot = (_a = this.heldMathInfo.quill.container) === null || _a === void 0 ? void 0 : _a.querySelector('.ql-editor');
            prevRoot === null || prevRoot === void 0 ? void 0 : prevRoot.classList.remove('ql-math-holding');
        }
        this.heldMathInfo = { quill, mathIndex, mathDomNode: domNode, entryDirection };
        domNode.classList.add('ql-math-selected');
        const editorRoot = (_b = quill.container) === null || _b === void 0 ? void 0 : _b.querySelector('.ql-editor');
        editorRoot === null || editorRoot === void 0 ? void 0 : editorRoot.classList.add('ql-math-holding');
    }
    exitMathHold() {
        var _a;
        if (this.heldMathInfo) {
            this.heldMathInfo.mathDomNode.classList.remove('ql-math-selected');
            const editorRoot = (_a = this.heldMathInfo.quill.container) === null || _a === void 0 ? void 0 : _a.querySelector('.ql-editor');
            editorRoot === null || editorRoot === void 0 ? void 0 : editorRoot.classList.remove('ql-math-holding');
            this.heldMathInfo = null;
        }
    }
    syncMathRangeHighlight(quill) {
        const editorRoot = quill === null || quill === void 0 ? void 0 : quill.root;
        if (!editorRoot)
            return;
        const range = quill.getSelection ? quill.getSelection() : null;
        const hasRange = range != null && range.length > 0;
        const rangeStart = hasRange ? range.index : 0;
        const rangeEnd = hasRange ? range.index + range.length : 0;
        const heldNode = (this.heldMathInfo && this.heldMathInfo.quill === quill)
            ? this.heldMathInfo.mathDomNode
            : null;
        const mathNodes = editorRoot.querySelectorAll('.ql-math');
        mathNodes.forEach((el) => {
            var _a;
            const node = el;
            if (node.closest('.ql-editor') !== editorRoot)
                return;
            if (node === heldNode) {
                VenusEditor.setClassPresence(node, 'ql-math-selected', true);
                return;
            }
            const blot = Quill.find(node);
            if (!blot || ((_a = blot.statics) === null || _a === void 0 ? void 0 : _a.blotName) !== MathExpressionBlot.blotName)
                return;
            const idx = quill.getIndex(blot);
            const inRange = hasRange && rangeStart <= idx && rangeEnd > idx;
            VenusEditor.setClassPresence(node, 'ql-math-selected', inRange);
        });
    }
    hideLinkTooltip() {
        const tooltipContainer = document.getElementById(this.linkTooltipContainerId);
        if (tooltipContainer && tooltipContainer.style.opacity !== '0') {
            tooltipContainer.style.opacity = '0';
            tooltipContainer.childNodes.forEach((child) => {
                if (child instanceof HTMLElement) {
                    child.style.pointerEvents = 'none';
                }
            });
            this.safeSetTimeout(() => {
                if (tooltipContainer) {
                    tooltipContainer.style.display = 'none';
                }
            }, 200);
            safeInvoke(this.dotNetHelper, "OnLinkTooltipHidden");
        }
        this.activeInlineTooltip = null;
    }
    ensureMathLineCursorLandingSpot(editor, targetIndex, side = 'after') {
        var _a, _b, _c, _d, _e;
        const [line] = editor.getLine(targetIndex);
        if (!line)
            return targetIndex;
        const onlyMath = ((_a = line.children) === null || _a === void 0 ? void 0 : _a.head) === ((_b = line.children) === null || _b === void 0 ? void 0 : _b.tail)
            && ((_e = (_d = (_c = line.children) === null || _c === void 0 ? void 0 : _c.head) === null || _d === void 0 ? void 0 : _d.statics) === null || _e === void 0 ? void 0 : _e.blotName) === MathExpressionBlot.blotName;
        if (!onlyMath)
            return targetIndex;
        const mathIndex = editor.getIndex(line.children.head);
        this.skipMathAdjacentSelect = true;
        if (side === 'before') {
            editor.insertText(mathIndex, '\n', 'silent');
            this.skipMathAdjacentSelect = true;
            return mathIndex;
        }
        else {
            const afterMath = mathIndex + 1;
            editor.insertText(afterMath, ' ', 'silent');
            this.skipMathAdjacentSelect = true;
            return afterMath + 1;
        }
    }
    clampTextScalePercentage(percent) {
        if (!Number.isFinite(percent)) {
            return 100;
        }
        const rounded = Math.round(percent);
        return Math.min(this.maxTextScalePercent, Math.max(this.minTextScalePercent, rounded));
    }
    applyTextScaleToEditor(editor, scale) {
    }
    setPrimaryHistoryIgnoreChange(ignore) {
        var _a;
        const history = (_a = this.primaryNotesEditor) === null || _a === void 0 ? void 0 : _a.history;
        if (history)
            history.ignoreChange = ignore;
    }
    withHistoryIgnored(fn) {
        this.setPrimaryHistoryIgnoreChange(true);
        try {
            return fn();
        }
        finally {
            this.flushPrimaryEditorMutations();
            this.setPrimaryHistoryIgnoreChange(false);
        }
    }
    cutoffPrimaryHistory() {
        var _a;
        (_a = this.primaryNotesEditor) === null || _a === void 0 ? void 0 : _a.history.cutoff();
    }
    scheduleProcessVisibleLines() {
        if (this.primaryNotesEditor) {
            this.safeSetTimeout(() => {
                QuillExtensions.processVisibleLines(this.primaryNotesEditor, this);
            }, 100);
        }
    }
    flushPrimaryEditorMutations() {
        var _a;
        (_a = this.primaryNotesEditor) === null || _a === void 0 ? void 0 : _a.update();
    }
    setupMarginClickHandler() {
        if (!this.editorOuterContainer) {
            return;
        }
        const container = this.editorOuterContainer.closest('[data-notes-editor-margin]');
        if (!container) {
            return;
        }
        this._marginClickContainer = container;
        this._marginClickHandler = (e) => this.handleMarginClick(e);
        container.addEventListener('mousedown', this._marginClickHandler);
    }
    handleMarginClick(event) {
        if (event.button !== 0) {
            return;
        }
        if (event.defaultPrevented) {
            return;
        }
        const target = event.target;
        if (!target) {
            return;
        }
        if (target.closest('[data-notes-editor-margin-exempt], [draggable="true"], .ql-editor, button, a, input, textarea, select, label, img, video, audio, iframe, [contenteditable="true"], [role="button"], [role="link"], [role="checkbox"], [role="menuitem"], [role="tab"], [role="option"]')) {
            return;
        }
        const quill = this.notesEditor();
        if (!quill) {
            return;
        }
        const editor = quill.root;
        const rect = editor.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
            return;
        }
        event.preventDefault();
        this.focusAtPoint(event.clientX, event.clientY);
    }
    focusAtPoint(clickX, clickY) {
        const quill = this.notesEditor();
        if (!quill) {
            return;
        }
        const editor = quill.root;
        const rect = editor.getBoundingClientRect();
        const style = window.getComputedStyle(editor);
        const padLeft = parseFloat(style.paddingLeft) || 0;
        const padRight = parseFloat(style.paddingRight) || 0;
        const padTop = parseFloat(style.paddingTop) || 0;
        const padBottom = parseFloat(style.paddingBottom) || 0;
        const minX = rect.left + padLeft + 1;
        const maxX = rect.right - padRight - 1;
        const minY = rect.top + padTop + 1;
        const maxY = rect.bottom - padBottom - 1;
        const clampedX = Math.min(Math.max(clickX, minX), Math.max(maxX, minX));
        const clampedY = Math.min(Math.max(clickY, minY), Math.max(maxY, minY));
        let range = null;
        if (typeof document.caretRangeFromPoint === 'function') {
            range = document.caretRangeFromPoint(clampedX, clampedY);
        }
        else if (document.caretPositionFromPoint) {
            const pos = document.caretPositionFromPoint(clampedX, clampedY);
            if (pos) {
                range = document.createRange();
                range.setStart(pos.offsetNode, pos.offset);
                range.collapse(true);
            }
        }
        editor.focus({ preventScroll: true });
        if (range && editor.contains(range.startContainer)) {
            const sel = window.getSelection();
            if (sel) {
                sel.removeAllRanges();
                sel.addRange(range);
            }
        }
        else {
            const len = quill.getLength();
            quill.setSelection(Math.max(0, len - 1), 0);
        }
    }
    setupEditorContainerKeyboardHandler() {
        if (!this.editorOuterContainer)
            return;
        this.editorOuterContainer.setAttribute('tabindex', '-1');
        this.editorOuterContainer.style.outline = 'none';
        this.editorOuterContainer.addEventListener('keydown', (e) => {
            var _a;
            const target = e.target;
            if ((_a = target === null || target === void 0 ? void 0 : target.closest) === null || _a === void 0 ? void 0 : _a.call(target, '[contenteditable="true"]'))
                return;
            if (!this.primaryNotesEditor)
                return;
            const isCtrlOrCmd = e.ctrlKey || e.metaKey;
            if (!isCtrlOrCmd || e.altKey)
                return;
            if (e.key.toLowerCase() === 'z' && !e.shiftKey) {
                this.handleUndo();
                e.preventDefault();
            }
            else if ((e.key.toLowerCase() === 'z' && e.shiftKey) || (e.key.toLowerCase() === 'y' && !e.shiftKey)) {
                this.handleRedo();
                e.preventDefault();
            }
        });
    }
    focusEditorContainer() {
        var _a;
        (_a = this.editorOuterContainer) === null || _a === void 0 ? void 0 : _a.focus({ preventScroll: true });
        safeInvoke(this.dotNetHelper, 'UpdateEditorFocusState', [true]);
    }
    restoreActiveEditorFocus(targetCellId) {
        if (targetCellId) {
            const cached = this.tableState.editorCache[targetCellId];
            if ((cached === null || cached === void 0 ? void 0 : cached.quill) && document.contains(cached.cellElement)) {
                cached.quill.focus();
                safeInvoke(this.dotNetHelper, 'UpdateEditorFocusState', [true]);
                return;
            }
        }
        const target = this.notesEditor();
        if (target === null || target === void 0 ? void 0 : target.focus) {
            target.focus();
        }
        safeInvoke(this.dotNetHelper, 'UpdateEditorFocusState', [true]);
    }
    notifyEditorFocused() {
        safeInvoke(this.dotNetHelper, 'NotifyEditorFocused');
    }
    notifyEditorBlur() {
        safeInvoke(this.dotNetHelper, 'NotifyEditorBlur');
    }
    updateTableControlsDisplayState() {
        if (this.debouncedUpdateTableControlsDisplayStateInternal === null) {
            this.debouncedUpdateTableControlsDisplayStateInternal = debounce(this.updateTableControlsDisplayStateInternal.bind(this), 50);
        }
        this.debouncedUpdateTableControlsDisplayStateInternal();
    }
    setBooleanFormatOnCells(format, value) {
        if (!this.areCellsSelected()) {
            return;
        }
        const formats = { [format]: value };
        const table = this.lastActiveTable;
        const selectionStartCell = TableBlot.getSelectionStartCell(table);
        const selectionEndCell = TableBlot.getSelectionEndCell(table);
        const selectedCells = TableBlot.getSelectedCells(table);
        this.removeTableControlsFromTable(table);
        selectedCells.forEach((cell) => {
            if (cell.id === this.tableState.activeCellId) {
                const cellQuill = this.tableState.editorCache[cell.id].quill;
                cellQuill.formatText(0, cellQuill.getLength(), formats);
            }
            else {
                const newHtml = QuillExtensions.applyFormattingToHtml(cell.innerHTML, formats);
                cell.innerHTML = newHtml;
            }
        });
        TableBlot.setupTableControls(table);
        TableBlot.setTableSelection(table, selectionStartCell, selectionEndCell);
    }
    setFormatOnCells(formatType, formatValue, shouldRemoveFormat, shouldRemoveParagraphFormats) {
        if (!this.areCellsSelected()) {
            return;
        }
        let formats = null;
        if (formatType === '') {
            formats = null;
        }
        else {
            if (shouldRemoveParagraphFormats) {
                formats = { [formatType]: formatValue, ['list']: false, ['code-block']: false };
            }
            else {
                formats = { [formatType]: formatValue };
            }
        }
        const table = this.lastActiveTable;
        const selectionStartCell = TableBlot.getSelectionStartCell(table);
        const selectionEndCell = TableBlot.getSelectionEndCell(table);
        const selectedCells = TableBlot.getSelectedCells(table);
        this.removeTableControlsFromTable(table);
        selectedCells.forEach((cell) => {
            if (cell.id === this.tableState.activeCellId) {
                const cellQuill = this.tableState.editorCache[cell.id].quill;
                if (shouldRemoveFormat) {
                    cellQuill.removeFormat(0, cellQuill.getLength(), 'user');
                    const currentDelta = cellQuill.getContents();
                    const cleanedDelta = QuillExtensions.removeTrailingNewlinesFromDelta(currentDelta);
                    cellQuill.setContents(cleanedDelta, 'user');
                }
                if (formats !== null) {
                    cellQuill.formatText(0, cellQuill.getLength(), formats);
                }
            }
            else {
                if (shouldRemoveFormat) {
                    const noFormatHtml = QuillExtensions.removeFormat(cell.innerHTML);
                    cell.innerHTML = noFormatHtml;
                }
                if (formats !== null) {
                    const newHtml = QuillExtensions.applyFormattingToHtml(cell.innerHTML, formats);
                    cell.innerHTML = newHtml;
                }
            }
        });
        TableBlot.setupTableControls(table);
        TableBlot.setTableSelection(table, selectionStartCell, selectionEndCell);
    }
    areCellsSelected() {
        if (!this.lastActiveTable)
            return false;
        const ts = TableBlot.getTableSelection(this.lastActiveTable);
        return ts.startRow !== -1 && ts.startCol !== -1;
    }
    getActiveTable() {
        var _a;
        const active = document.activeElement;
        if (active && ((_a = this.editorContainer) === null || _a === void 0 ? void 0 : _a.contains(active))) {
            const cell = active.closest('td');
            if (cell) {
                const table = cell.closest('table');
                if (table && this.editorContainer.contains(table)) {
                    return table;
                }
            }
        }
        return null;
    }
    updateTableControlsDisplayStateInternal() {
        const activeTable = this.getActiveTable();
        if (activeTable && !this.lastActiveTable) {
            this.lastActiveTable = activeTable;
            TableBlot.setupTableControls(activeTable);
        }
        else if (!activeTable && this.lastActiveTable) {
            if (this.tableState.lastTableWithSelection || this.preserveTableControls) {
                return;
            }
            const oldTable = this.lastActiveTable;
            this.lastActiveTable = null;
            this.removeTableControlsFromTable(oldTable);
        }
        else if (activeTable && activeTable !== this.lastActiveTable) {
            const oldTable = this.lastActiveTable;
            this.lastActiveTable = activeTable;
            this.removeTableControlsFromTable(oldTable);
            TableBlot.setupTableControls(activeTable);
        }
    }
    preserveBackwardSelectionOnRestore(quill) {
        const selection = quill.selection;
        const originalSetNativeRange = selection.setNativeRange;
        selection.setNativeRange = function (startNode, startOffset, endNode = startNode, endOffset = startOffset, force = false) {
            if (!force && startNode != null && endNode != null && selection.hasFocus()) {
                try {
                    if (startNode instanceof Element && startNode.tagName === 'BR' && startNode.parentNode) {
                        startOffset = Array.from(startNode.parentNode.childNodes).indexOf(startNode);
                        startNode = startNode.parentNode;
                    }
                    if (endNode instanceof Element && endNode.tagName === 'BR' && endNode.parentNode) {
                        endOffset = Array.from(endNode.parentNode.childNodes).indexOf(endNode);
                        endNode = endNode.parentNode;
                    }
                    const native = document.getSelection();
                    if (native && native.rangeCount > 0) {
                        const current = native.getRangeAt(0);
                        const requested = document.createRange();
                        requested.setStart(startNode, startOffset !== null && startOffset !== void 0 ? startOffset : 0);
                        requested.setEnd(endNode, endOffset !== null && endOffset !== void 0 ? endOffset : 0);
                        if (requested.compareBoundaryPoints(Range.START_TO_START, current) === 0
                            && requested.compareBoundaryPoints(Range.END_TO_END, current) === 0) {
                            return;
                        }
                    }
                }
                catch (_a) {
                }
            }
            return originalSetNativeRange.call(this, startNode, startOffset, endNode, endOffset, force);
        };
    }
    registerEditorChangeHandler(quill, isCellEditor) {
        quill.on('editor-change', (eventName, ...args) => {
            var _a, _b, _c;
            if (this.editorSettings.readOnly) {
                return;
            }
            if (eventName === 'text-change') {
                const [delta, oldDelta, source] = args;
                if (source !== 'silent') {
                    this.updateToolbarState();
                    this.isDirty = true;
                    if (!isCellEditor) {
                        this.scheduleCountUpdate();
                        this.scheduleAutoSave();
                    }
                    if (this.searchState.findText && this.searchState.matches.length > 0) {
                        this.refreshSearchAfterEdit();
                    }
                }
            }
            else if (eventName === 'selection-change') {
                let range = quill.getSelection();
                this.updateTableControlsDisplayState();
                if (this.editorSettings.clientOs == ClientOs.iOS && !((_a = quill.composition) === null || _a === void 0 ? void 0 : _a.isComposing) && range && range.length === 0 && this.lastPointedTime && this.lastPointerDownIndex) {
                    const timeDiff = Date.now() - this.lastPointedTime;
                    const [lastLine] = quill.getLine(quill.getLength() - 1);
                    const [currentLine] = quill.getLine(range.index);
                    const [tappedLine] = quill.getLine(this.lastPointerDownIndex);
                    const landedOnLastLine = lastLine && currentLine && currentLine === lastLine;
                    const tappedOnLastLine = lastLine && tappedLine && tappedLine === lastLine;
                    if (landedOnLastLine && !tappedOnLastLine && timeDiff < 400) {
                        const lastLineLength = lastLine.length();
                        if (range.index - this.lastPointerDownIndex > Math.max(10, lastLineLength)) {
                            const tappedIndex = this.lastPointerDownIndex;
                            quill.setSelection(tappedIndex, 0, 'silent');
                            range = { index: tappedIndex, length: 0 };
                            if (this.lastPointerDownScrollTop != null) {
                                const scrollContainer = this.contentAreaInner || document.getElementById('contentAreaInner') || quill.root;
                                scrollContainer.scrollTop = this.lastPointerDownScrollTop;
                            }
                            requestAnimationFrame(() => {
                                quill.setSelection(tappedIndex, 0, 'user');
                            });
                            this.lastPointedTime = null;
                            this.lastPointerDownIndex = null;
                            this.lastPointerDownScrollTop = null;
                        }
                    }
                }
                if (this.skipMathAdjacentSelect) {
                    this.skipMathAdjacentSelect = false;
                }
                else if (range && range.length === 0 && !this.editorSettings.readOnly) {
                    let mathLeaf = null;
                    let mathIndex = -1;
                    const [leafAt] = quill.getLeaf(range.index);
                    if (leafAt && ((_b = leafAt.statics) === null || _b === void 0 ? void 0 : _b.blotName) === MathExpressionBlot.blotName) {
                        mathLeaf = leafAt;
                    }
                    if (!mathLeaf && range.index > 0) {
                        const [leafBefore] = quill.getLeaf(range.index - 1);
                        if (leafBefore && ((_c = leafBefore.statics) === null || _c === void 0 ? void 0 : _c.blotName) === MathExpressionBlot.blotName) {
                            const beforeIndex = quill.getIndex(leafBefore);
                            if (range.index === beforeIndex + 1) {
                                mathLeaf = leafBefore;
                            }
                        }
                    }
                    if (mathLeaf) {
                        mathIndex = quill.getIndex(mathLeaf);
                        const recentlyClicked = this.lastPointedTime != null
                            && Date.now() - this.lastPointedTime < 500;
                        const entryDirection = recentlyClicked
                            ? null
                            : (range.index === mathIndex ? 'left' : 'right');
                        this.enterMathHold(quill, mathLeaf, mathIndex, entryDirection);
                    }
                }
                if (this.imageControls) {
                    this.imageControls.destroy();
                    this.imageControls = null;
                }
                if (range && range.length == 1) {
                    const blot = quill.getLeaf(range.index)[0];
                    if (blot instanceof ResizableImage) {
                        this.imageControls = new ImageControls(blot.domNode);
                    }
                }
                this.updateToolbarState();
                this.syncMathRangeHighlight(quill);
                if (!isCellEditor || range) {
                    this.handleSelectionChanged(isCellEditor);
                }
                this.scheduleCollapseUiUpdate();
                if (!isCellEditor && range && range.length === 0) {
                    this.scheduleScrollCursorAboveKeyboard(quill);
                }
            }
        });
    }
    setupCopyAndPasteHandlers(quill, externalListeners) {
        let isCtrlDown = false, isShiftDown = false, isMetaDown = false, isAltDown = false;
        const isMacOS = (() => {
            try {
                const ua = (navigator && navigator.userAgent) ? navigator.userAgent : '';
                const platform = (navigator && navigator.platform) ? navigator.platform : '';
                const isAppleMobile = /iPhone|iPad|iPod/i.test(ua);
                return !isAppleMobile && (/Macintosh|Mac OS X|Mac/i.test(ua) || /Mac/i.test(platform));
            }
            catch (_a) {
                return false;
            }
        })();
        const keydownHandler = (e) => {
            if (e.key === 'Control')
                isCtrlDown = true;
            if (e.key === 'Shift')
                isShiftDown = true;
            if (e.key === 'Meta')
                isMetaDown = true;
            if (e.key === 'Alt')
                isAltDown = true;
        };
        document.addEventListener('keydown', keydownHandler);
        externalListeners.push({ element: document, event: 'keydown', handler: keydownHandler });
        const keyupHandler = (e) => {
            if (e.key === 'Control')
                isCtrlDown = false;
            if (e.key === 'Shift')
                isShiftDown = false;
            if (e.key === 'Meta')
                isMetaDown = false;
            if (e.key === 'Alt')
                isAltDown = false;
        };
        document.addEventListener('keyup', keyupHandler);
        externalListeners.push({ element: document, event: 'keyup', handler: keyupHandler });
        quill.root.addEventListener('copy', (ev) => {
            if (quill === this.primaryNotesEditor && this.isCellEditorActive()) {
                return;
            }
            if (quill !== this.primaryNotesEditor && quill !== this.cellNotesEditor) {
                return;
            }
            if (this.copyTableSelection(ev))
                return;
            const selection = quill.getSelection(true);
            if (!selection || selection.length === 0)
                return;
            const imageUrl = this.getSelectedImageUrl(quill, selection);
            if (imageUrl) {
                console.log('[VenusEditor] Image-only selection detected in copy handler, imageUrl:', imageUrl.substring(0, 100));
                ev.preventDefault();
                ev.stopImmediatePropagation();
                ev.stopPropagation();
                this.copyImageToClipboard(imageUrl).then(ok => {
                    console.log('[VenusEditor] copyImageToClipboard result from keyboard handler:', ok);
                }).catch(err => {
                    console.error('[VenusEditor] copyImageToClipboard error from keyboard handler:', err);
                });
                return;
            }
            if (isMacOS) {
                try {
                    const plain = quill.getText(selection.index, selection.length);
                    let html = '';
                    try {
                        html = quill.getSemanticHTML(selection.index, selection.length);
                        html = this.cleanHtmlForClipboard(html);
                    }
                    catch (_a) { }
                    safeInvoke(this.dotNetHelper, 'SetClipboardFromEditor', [plain, html]);
                    ev.preventDefault();
                    ev.stopImmediatePropagation();
                    ev.stopPropagation();
                    return;
                }
                catch (_b) {
                }
            }
            if (ev.clipboardData) {
                ev.clipboardData.setData('application/x-quill-internal', 'true');
                const plain = quill.getText(selection.index, selection.length);
                let html = '';
                try {
                    html = quill.getSemanticHTML(selection.index, selection.length);
                    html = this.cleanHtmlForClipboard(html);
                }
                catch (_c) { }
                ev.clipboardData.setData('text/plain', plain);
                if (html)
                    ev.clipboardData.setData('text/html', html);
                ev.preventDefault();
            }
        }, true);
        quill.root.addEventListener('cut', (ev) => {
            var _a;
            if (quill === this.primaryNotesEditor && this.isCellEditorActive()) {
                return;
            }
            if (quill !== this.primaryNotesEditor && quill !== this.cellNotesEditor) {
                return;
            }
            if (this.cutTableSelection(ev))
                return;
            if (isMacOS) {
                const selection = quill.getSelection(true);
                if (!selection || selection.length === 0)
                    return;
                try {
                    const plain = quill.getText(selection.index, selection.length);
                    let html = '';
                    try {
                        html = quill.getSemanticHTML(selection.index, selection.length);
                        html = this.cleanHtmlForClipboard(html);
                    }
                    catch (_b) { }
                    safeInvoke(this.dotNetHelper, 'SetClipboardFromEditor', [plain, html]);
                    ev.preventDefault();
                    ev.stopImmediatePropagation();
                    ev.stopPropagation();
                    quill.deleteText(selection.index, selection.length, 'user');
                    return;
                }
                catch (_c) {
                }
            }
            let selection = quill.getSelection(true);
            const domSel = (_a = document.getSelection) === null || _a === void 0 ? void 0 : _a.call(document);
            if (ev.clipboardData) {
                ev.clipboardData.setData('application/x-quill-internal', 'true');
                if (selection && selection.length > 0) {
                    const plain = quill.getText(selection.index, selection.length);
                    let html = '';
                    try {
                        html = quill.getSemanticHTML(selection.index, selection.length);
                        html = this.cleanHtmlForClipboard(html);
                    }
                    catch (_d) { }
                    ev.clipboardData.setData('text/plain', plain);
                    if (html)
                        ev.clipboardData.setData('text/html', html);
                    ev.preventDefault();
                    quill.deleteText(selection.index, selection.length, 'user');
                }
                else if (domSel && domSel.toString()) {
                    ev.clipboardData.setData('text/plain', domSel.toString());
                    ev.preventDefault();
                    document.execCommand('delete');
                }
            }
        }, true);
        quill.root.addEventListener('paste', (ev) => {
            if (this.editorSettings.readOnly)
                return;
            const isMobile = this.editorSettings.clientOs == ClientOs.iOS
                || this.editorSettings.clientOs == ClientOs.Android;
            if (this.editorSettings.isDeku && !isMobile && !this._retryingPaste && !(isCtrlDown && isShiftDown)) {
                ev.preventDefault();
                ev.stopImmediatePropagation();
                safeInvokeAsync(this.dotNetHelper, 'CheckAndHandleClipboardFiles').then((handled) => {
                    if (!handled) {
                        this._retryingPaste = true;
                        this.notesEditor().focus();
                        document.execCommand('paste');
                        this._retryingPaste = false;
                    }
                });
                return;
            }
            const data = ev.clipboardData;
            if (!data)
                return;
            const tablePasteText = data.getData('text/plain');
            if (this.pasteTableContent(tablePasteText)) {
                ev.preventDefault();
                ev.stopImmediatePropagation();
                return;
            }
            if (this.activeEditor === 'cell') {
                const htmlForTableCheck = data.getData('text/html') || '';
                if (/<table[\s>]/i.test(htmlForTableCheck)) {
                    ev.preventDefault();
                    ev.stopImmediatePropagation();
                    return;
                }
            }
            const isInternalContent = !!data.getData('application/x-quill-internal');
            const originalText = data.getData('text/plain');
            const text = originalText.trim();
            const urlRegex = /^(https?:\/\/\S+)$/i;
            const isAlternatePaste = (isCtrlDown || isMetaDown) && isShiftDown;
            const isPlainPasteRequested = isAlternatePaste
                ? !this.editorSettings.pasteWithoutFormattingAsDefault
                : this.editorSettings.pasteWithoutFormattingAsDefault;
            const sel = quill.getSelection();
            const hasSelection = sel && sel.length > 0;
            if (sel) {
                const formats = quill.getFormat(sel.index, sel.length || 1);
                if (formats['code'] || formats['code-block']) {
                    ev.preventDefault();
                    ev.stopImmediatePropagation();
                    quill.deleteText(sel.index, sel.length, 'user');
                    quill.insertText(sel.index, originalText, 'user');
                    quill.setSelection(sel.index + originalText.length, 0, 'user');
                    return;
                }
            }
            if (hasSelection && urlRegex.test(text)) {
                ev.preventDefault();
                ev.stopImmediatePropagation();
                quill.formatText(sel.index, sel.length, 'link', text, 'user');
                return;
            }
            const html = data.getData('text/html');
            if (text && !isInternalContent) {
                ev.preventDefault();
                ev.stopImmediatePropagation();
                console.log('[PASTE DEBUG] Paste detected, text:', text, 'hasHtml:', !!html);
                safeInvokeAsync(this.dotNetHelper, 'GetThoughtMarkdownIfMatch', [text]).then((thoughtMarkdown) => {
                    console.log('[PASTE DEBUG] GetThoughtMarkdownIfMatch returned:', thoughtMarkdown);
                    if (thoughtMarkdown) {
                        const textToConvert = thoughtMarkdown + '\n';
                        this.insertMarkdownAsDelta(quill, textToConvert, originalText, text, sel, isAlternatePaste);
                    }
                    else if (html && !this.containsMarkdown(text)) {
                        this.pasteHtmlContent(quill, html, sel);
                    }
                    else {
                        const textToConvert = text + '\n';
                        this.insertMarkdownAsDelta(quill, textToConvert, originalText, text, sel, isAlternatePaste);
                    }
                });
                return;
            }
            const clipboard = quill.getModule('clipboard');
            if (isPlainPasteRequested || this.editorSettings.excludeColorInformationWhenPasting || this.editorSettings.excludeFontInformationWhenPasting) {
                const stripFormattingMatcher = (node, delta) => {
                    if (isPlainPasteRequested) {
                        delta.ops.forEach((op) => {
                            if (op.attributes) {
                                delete op.attributes;
                            }
                        });
                    }
                    else {
                        delta.ops.forEach((op) => {
                            if (op.attributes) {
                                if (this.editorSettings.excludeColorInformationWhenPasting) {
                                    delete op.attributes.color;
                                    delete op.attributes.background;
                                }
                                if (this.editorSettings.excludeFontInformationWhenPasting) {
                                    delete op.attributes.font;
                                    delete op.attributes.size;
                                }
                            }
                        });
                    }
                    return delta;
                };
                clipboard.addMatcher(Node.ELEMENT_NODE, stripFormattingMatcher);
                this.safeSetTimeout(() => {
                    clipboard.matchers = clipboard.matchers.filter(([, matcher]) => matcher !== stripFormattingMatcher);
                }, 0);
            }
        }, true);
        quill.root.addEventListener('paste', (ev) => {
            if (this.editorSettings.readOnly)
                return;
            const data = ev.clipboardData;
            if (!data)
                return;
            const plainPaste = (isCtrlDown || isMetaDown) && isShiftDown;
            if (!plainPaste) {
                this.checkForPastedUrl(quill, data);
            }
        });
        quill.root.addEventListener('cut', (ev) => {
            var _a;
            if (this.editorSettings.readOnly)
                return;
            if (quill === this.primaryNotesEditor && this.isCellEditorActive()) {
                return;
            }
            if (quill !== this.primaryNotesEditor && quill !== this.cellNotesEditor) {
                return;
            }
            if (isMacOS) {
                return;
            }
            const domSel = (_a = window.getSelection) === null || _a === void 0 ? void 0 : _a.call(window);
            if (!domSel || domSel.rangeCount === 0 || domSel.isCollapsed) {
                return;
            }
            if (!ev.clipboardData)
                return;
            const range = domSel.getRangeAt(0);
            const plain = domSel.toString();
            let html = '';
            try {
                const div = document.createElement('div');
                div.appendChild(range.cloneContents());
                html = div.innerHTML;
            }
            catch (_b) { }
            ev.clipboardData.setData('application/x-quill-internal', 'true');
            ev.clipboardData.setData('text/plain', plain);
            if (html)
                ev.clipboardData.setData('text/html', html);
            ev.preventDefault();
            ev.stopImmediatePropagation();
            try {
                document.execCommand('delete');
            }
            catch (_c) {
                const sel = quill.getSelection(true);
                if (sel && sel.length > 0) {
                    quill.deleteText(sel.index, sel.length, 'user');
                }
            }
        }, true);
    }
    checkForPastedUrl(quill, clipboardData) {
        const text = clipboardData.getData('text/plain');
        if (this.URL_REGEX.test(text)) {
            this.safeSetTimeout(async () => {
                const range = quill.getSelection();
                if (!range)
                    return;
                const urlStartIndex = range.index - text.length;
                quill.formatText(urlStartIndex, text.length, 'link', text, 'silent');
                if (!this.editorSettings.replaceUrlWithPageTitle) {
                    return;
                }
                const formats = quill.getFormat(urlStartIndex, text.length);
                if (formats.code || formats['code-block']) {
                    return;
                }
                quill.history.cutoff();
                const isImage = await this.checkIfImageUrl(text);
                if (isImage) {
                    this.replaceUrlWithImage(quill, text, urlStartIndex, text.length);
                }
                else {
                    this.replaceUrlWithPageTitle(quill, text, urlStartIndex, text.length);
                }
            }, 0);
        }
    }
    insertMarkdownAsDelta(quill, textToConvert, originalText, text, sel, skipUrlAutoReplacement = false) {
        safeInvokeAsync(this.dotNetHelper, 'ConvertMarkdownToDelta', [textToConvert]).then((deltaJson) => {
            if (deltaJson) {
                try {
                    const delta = JSON.parse(deltaJson);
                    delta.ops.pop();
                    const hadTrailingNewline = originalText !== text && originalText.endsWith('\n');
                    if (!hadTrailingNewline && delta.ops && delta.ops.length > 0) {
                        const lastOp = delta.ops[delta.ops.length - 1];
                        if (lastOp.insert === '\n' && !lastOp.attributes) {
                            delta.ops.pop();
                        }
                    }
                    const range = sel || quill.getSelection() || { index: 0, length: 0 };
                    if (range.length > 0) {
                        quill.deleteText(range.index, range.length, 'user');
                    }
                    delta.ops.unshift({ retain: range.index });
                    quill.updateContents(delta, 'user');
                    const insertLength = delta.ops.reduce((len, op) => len + (op.insert ? (typeof op.insert === 'string' ? op.insert.length : 1) : 0), 0);
                    quill.setSelection(range.index + insertLength, 0, 'user');
                    if (!skipUrlAutoReplacement && this.editorSettings.replaceUrlWithPageTitle && this.URL_REGEX.test(text)) {
                        const formats = quill.getFormat(range.index, text.length);
                        if (!formats.code && !formats['code-block']) {
                            quill.history.cutoff();
                            this.checkIfImageUrl(text).then((isImage) => {
                                if (isImage) {
                                    this.replaceUrlWithImage(quill, text, range.index, text.length);
                                }
                                else {
                                    this.replaceUrlWithPageTitle(quill, text, range.index, text.length);
                                }
                            });
                        }
                    }
                }
                catch (ex) {
                    console.error('Failed to parse markdown delta:', ex);
                    const range = sel || quill.getSelection() || { index: 0, length: 0 };
                    quill.deleteText(range.index, range.length, 'user');
                    quill.insertText(range.index, text, 'user');
                }
            }
            else {
                const range = sel || quill.getSelection() || { index: 0, length: 0 };
                quill.deleteText(range.index, range.length, 'user');
                quill.insertText(range.index, text, 'user');
            }
        });
    }
    containsMarkdown(text) {
        const markdownPatterns = [
            /^#{1,6}\s/m,
            /\*\*[^*]+\*\*/,
            /__[^_]+__/,
            /~~[^~]+~~/,
            /==[^=]+==/,
            /(?<!\*)\*[^*\s][^*]*[^*\s]\*(?!\*)/,
            /(?<!_)_[^_\s][^_]*[^_\s]_(?!_)/,
            /\[[^\]]+\]\([^)]+\)/,
            /^[-*+]\s/m,
            /`[^`]+`/,
            /^```/m,
            /^>\s/m,
            /\$\$[^$]+\$\$/,
            /^:?-+:?\s*$/m,
            /^\|.+\|.+\|$/m,
        ];
        return markdownPatterns.some(pattern => pattern.test(text));
    }
    pasteHtmlContent(quill, html, sel) {
        try {
            const delta = quill.clipboard.convert({ html: html });
            if (this.editorSettings.pasteWithoutFormattingAsDefault) {
                delta.ops.forEach((op) => {
                    if (op.attributes) {
                        delete op.attributes;
                    }
                });
            }
            else {
                delta.ops.forEach((op) => {
                    if (op.attributes) {
                        if (this.editorSettings.excludeColorInformationWhenPasting) {
                            delete op.attributes.color;
                            delete op.attributes.background;
                        }
                        if (this.editorSettings.excludeFontInformationWhenPasting) {
                            delete op.attributes.font;
                            delete op.attributes.size;
                        }
                    }
                });
            }
            const range = sel || quill.getSelection() || { index: 0, length: 0 };
            if (range.length > 0) {
                quill.deleteText(range.index, range.length, 'user');
            }
            delta.ops.unshift({ retain: range.index });
            quill.updateContents(delta, 'user');
            const insertLength = delta.ops.reduce((len, op) => len + (op.insert ? (typeof op.insert === 'string' ? op.insert.length : 1) : 0), 0);
            quill.setSelection(range.index + insertLength, 0, 'user');
        }
        catch (ex) {
            console.error('Failed to paste HTML content:', ex);
            const range = sel || quill.getSelection() || { index: 0, length: 0 };
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = html;
            const plainText = tempDiv.textContent || tempDiv.innerText || '';
            quill.deleteText(range.index, range.length, 'user');
            quill.insertText(range.index, plainText, 'user');
        }
    }
    replaceUrlWithPageTitle(quill, url, urlStartIndex, urlLength) {
        if (!this.editorSettings.replaceUrlWithPageTitle)
            return;
        const formats = quill.getFormat(urlStartIndex, urlLength);
        if (formats.code || formats['code-block'])
            return;
        this.fetchPageTitle(url).then(pageTitle => {
            if (pageTitle && pageTitle !== url) {
                const currentSelection = quill.getSelection();
                const cursorAtEndOfUrl = currentSelection && currentSelection.index === urlStartIndex + urlLength;
                quill.history.cutoff();
                quill.deleteText(urlStartIndex, urlLength, 'user');
                quill.insertText(urlStartIndex, pageTitle, { link: url }, 'user');
                if (cursorAtEndOfUrl) {
                    quill.setSelection(urlStartIndex + pageTitle.length, 0, 'silent');
                }
                quill.history.cutoff();
            }
        }).catch(error => {
            console.error('Error fetching page title:', error);
        });
    }
    replaceUrlWithImage(quill, url, urlStartIndex, urlLength) {
        const currentSelection = quill.getSelection();
        const cursorAtEndOfUrl = currentSelection && currentSelection.index === urlStartIndex + urlLength;
        quill.history.cutoff();
        quill.deleteText(urlStartIndex, urlLength, 'user');
        quill.insertEmbed(urlStartIndex, 'image', url, 'user');
        if (cursorAtEndOfUrl) {
            quill.setSelection(urlStartIndex + 1, 0, 'silent');
        }
        quill.history.cutoff();
    }
    async fetchPageTitle(url) {
        try {
            if (url.includes('reddit.com')) {
                if (url.includes('/comments/')) {
                    const jsonUrl = url.split('?')[0] + '.json';
                    const redditTitle = await safeInvokeAsync(this.dotNetHelper, 'FetchRedditTitle', [jsonUrl]);
                    if (redditTitle) {
                        return redditTitle;
                    }
                }
            }
            if (url.includes('twitter.com') || url.includes('x.com')) {
                const tweetInfo = this.extractTweetInfo(url);
                if (tweetInfo) {
                    return `Tweet by @${tweetInfo.username}`;
                }
            }
            const title = await safeInvokeAsync(this.dotNetHelper, 'FetchPageTitle', [url]);
            return title || null;
        }
        catch (error) {
            console.error('Error fetching page title:', error);
            return null;
        }
    }
    extractTweetInfo(url) {
        const tweetRegex = /(?:twitter|x)\.com\/([^/]+)\/status\/(\d+)/i;
        const match = url.match(tweetRegex);
        if (!match)
            return null;
        return {
            username: match[1],
            tweetId: match[2]
        };
    }
    async checkIfImageUrl(url) {
        try {
            const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.ico'];
            const urlPath = url.split('?')[0].toLowerCase();
            const hasImageExtension = imageExtensions.some(ext => urlPath.endsWith(ext));
            if (hasImageExtension) {
                return true;
            }
            const contentType = await safeInvokeAsync(this.dotNetHelper, 'FetchContentType', [url]);
            return !!contentType && contentType.startsWith('image/');
        }
        catch (error) {
            console.error('Error checking if URL is image:', error);
            return false;
        }
    }
    handleSelectionChanged(isCellEditor) {
        if (!isCellEditor && this.tableState.ignoreNextSelectionChange) {
            this.tableState.ignoreNextSelectionChange = false;
            return;
        }
        if (this.isRestoringSelection)
            return;
        this.keepCellEditorAliveDepth = 0;
        if (!isCellEditor) {
            const currentSelection = this.primaryNotesEditor.getSelection();
            if (currentSelection) {
                this.activeEditor = 'primary';
                this.savedCellSelection.cellId = null;
                this.savedPrimarySelection = currentSelection;
            }
            const range = this.getSelectionWithFallback();
            this.updateOutlineCommandStates(range !== null && range !== void 0 ? range : null);
            this.updateMoveLineCommandStates(range !== null && range !== void 0 ? range : null);
            this.updateTableCommandStates();
        }
        else {
            this.activeEditor = 'cell';
            this.savedPrimarySelection = null;
            this.savedCellSelection.cellId = this.cellNotesEditor.container.id;
            const currentSelection = this.cellNotesEditor.getSelection();
            if (currentSelection) {
                this.savedCellSelection.cellSelection = currentSelection;
            }
            this.updateOutlineCommandStates(null);
            this.updateMoveLineCommandStates(null);
            this.updateTableCommandStates();
        }
    }
    restoreSavedSelection(scrollIntoView = false) {
        const savedCellElement = this.savedCellSelection.cellId
            ? document.getElementById(this.savedCellSelection.cellId)
            : null;
        if (!savedCellElement) {
            if (this.savedCellSelection.cellId) {
                this.savedCellSelection.cellId = null;
            }
            this.activeEditor = 'primary';
            const editor = this.notesEditor();
            editor.focus();
            if (scrollIntoView && this.savedPrimarySelection) {
                this.scrollSelectionIntoView(editor, this.savedPrimarySelection.index);
            }
            return editor;
        }
        this.isRestoringSelection = true;
        try {
            const editor = TableBlot.activateCell(savedCellElement, this);
            this.activeEditor = 'cell';
            editor === null || editor === void 0 ? void 0 : editor.focus();
            editor === null || editor === void 0 ? void 0 : editor.setSelection(this.savedCellSelection.cellSelection);
            if (scrollIntoView && editor && this.savedCellSelection.cellSelection) {
                this.scrollSelectionIntoView(editor, this.savedCellSelection.cellSelection.index);
            }
            return editor;
        }
        finally {
            this.isRestoringSelection = false;
        }
    }
    scrollSelectionIntoView(editor, index) {
        try {
            const [line] = editor.getLine(index);
            if (line && line.domNode) {
                line.domNode.scrollIntoView({
                    block: 'center',
                    behavior: 'smooth',
                    inline: 'nearest'
                });
            }
        }
        catch (e) {
            console.warn('Failed to scroll selection into view:', e);
        }
    }
    async ensureContentAreaFitsKeyboardThenScroll(quill) {
        var _a, _b;
        let didResize = false;
        if (this.editorSettings.isTablet
            && this.editorSettings.clientOs == ClientOs.iOS
            && typeof window !== 'undefined'
            && ((_a = window.brainPage) === null || _a === void 0 ? void 0 : _a.ensureContentAreaFitsKeyboard)) {
            const paneEl = quill.root.closest('#content-area-container');
            const splitterRoot = document.getElementById('plex-and-content-area');
            const kbHeight = parseFloat(getComputedStyle(document.documentElement)
                .getPropertyValue('--keyboard-height').trim()) || 0;
            if (paneEl && splitterRoot && kbHeight > 0) {
                const splitterTotal = splitterRoot.clientHeight;
                const paneHeight = paneEl.clientHeight;
                const requiredPaneHeight = kbHeight + 200;
                if (splitterTotal > 0 && paneHeight < requiredPaneHeight) {
                    const isLandscape = window.innerWidth > window.innerHeight;
                    const isTopBottomLayout = paneEl.offsetWidth >= splitterRoot.offsetWidth - 5;
                    if (isLandscape && isTopBottomLayout && ((_b = window.brainPage) === null || _b === void 0 ? void 0 : _b.maximizeContentArea)) {
                        window.brainPage.maximizeContentArea();
                        await this.waitForPaneHeight(paneEl, splitterTotal);
                    }
                    else {
                        const newPlexPx = Math.max(0, splitterTotal - requiredPaneHeight);
                        const newPercent = (newPlexPx / splitterTotal) * 100;
                        window.brainPage.ensureContentAreaFitsKeyboard(newPercent);
                        await this.waitForPaneHeight(paneEl, requiredPaneHeight);
                    }
                    didResize = true;
                }
            }
        }
        if (didResize) {
            await this.scrollCursorAboveKeyboardUntilStable(quill);
        }
        else {
            this.scheduleScrollCursorAboveKeyboard(quill, true);
        }
    }
    waitForPaneHeight(paneEl, targetHeight, timeoutMs = 600) {
        return new Promise(resolve => {
            const start = performance.now();
            const initialHeight = paneEl.clientHeight;
            let lastHeight = initialHeight;
            let stableFrames = 0;
            let hasMoved = false;
            const stableFrameThreshold = 3;
            const tick = () => {
                const h = paneEl.clientHeight;
                if (h >= targetHeight - 1) {
                    resolve();
                    return;
                }
                if (!hasMoved && h !== initialHeight) {
                    hasMoved = true;
                }
                if (hasMoved && h === lastHeight) {
                    stableFrames++;
                    if (stableFrames >= stableFrameThreshold) {
                        resolve();
                        return;
                    }
                }
                else {
                    stableFrames = 0;
                    lastHeight = h;
                }
                if (performance.now() - start > timeoutMs) {
                    resolve();
                    return;
                }
                requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
        });
    }
    async scrollCursorAboveKeyboardUntilStable(quill, maxAttempts = 6) {
        var _a;
        const scrollContainer = this.contentAreaInner || document.getElementById('contentAreaInner');
        if (!scrollContainer)
            return;
        for (let i = 0; i < maxAttempts; i++) {
            await new Promise(r => requestAnimationFrame(r));
            await new Promise(r => requestAnimationFrame(r));
            const range = quill.getSelection();
            if (!range)
                return;
            const kbHeight = parseFloat(getComputedStyle(document.documentElement)
                .getPropertyValue('--keyboard-height').trim()) || 0;
            if (kbHeight <= 0)
                return;
            const caretRect = this.getCaretViewportRect(quill);
            let targetRect = caretRect;
            if (!targetRect) {
                const [line] = quill.getLine(range.index);
                if (!(line === null || line === void 0 ? void 0 : line.domNode))
                    return;
                targetRect = line.domNode.getBoundingClientRect();
            }
            const keyboardTop = window.innerHeight - kbHeight;
            const toolbarEl = document.getElementById('venus-editor-toolbar-container');
            const isFloatingToolbar = (_a = toolbarEl === null || toolbarEl === void 0 ? void 0 : toolbarEl.classList.contains('phone-editor-toolbar')) !== null && _a !== void 0 ? _a : false;
            const occlusionTop = isFloatingToolbar
                ? Math.min(toolbarEl.getBoundingClientRect().top, keyboardTop - toolbarEl.offsetHeight)
                : keyboardTop;
            const margin = 16;
            const visibleBottom = occlusionTop - margin;
            let delta = 0;
            if (targetRect.bottom > visibleBottom) {
                delta = targetRect.bottom - visibleBottom;
            }
            else if (targetRect.top < 0) {
                delta = targetRect.top - margin;
            }
            if (delta === 0)
                return;
            scrollContainer.scrollTop += delta;
        }
    }
    getCaretViewportRect(quill) {
        try {
            const doc = quill.root.ownerDocument;
            const sel = doc.getSelection();
            if (!sel || sel.rangeCount === 0)
                return null;
            const range = sel.getRangeAt(0);
            const rects = range.getClientRects();
            if (rects.length > 0) {
                const r = rects[0];
                if (r.height > 0)
                    return r;
            }
            const bcr = range.getBoundingClientRect();
            if (bcr.height > 0)
                return bcr;
            return null;
        }
        catch (_a) {
            return null;
        }
    }
    scheduleScrollCursorAboveKeyboard(quill, smooth = false) {
        this.scrollCursorSmooth = this.scrollCursorSmooth || smooth;
        if (this.scrollCursorRafId !== null) {
            return;
        }
        this.scrollCursorRafId = requestAnimationFrame(() => {
            this.scrollCursorRafId = null;
            const smooth = this.scrollCursorSmooth;
            this.scrollCursorSmooth = false;
            const range = quill.getSelection();
            if (range) {
                this.scrollCursorAboveKeyboard(quill, range.index, smooth);
            }
        });
    }
    scrollCursorAboveKeyboard(quill, index, smooth = false) {
        var _a;
        try {
            const keyboardHeightStr = getComputedStyle(document.documentElement)
                .getPropertyValue('--keyboard-height').trim();
            const keyboardHeight = parseFloat(keyboardHeightStr) || 0;
            if (keyboardHeight <= 0) {
                return;
            }
            const scrollContainer = this.contentAreaInner || document.getElementById('contentAreaInner');
            if (!scrollContainer) {
                return;
            }
            const caretRect = this.getCaretViewportRect(quill);
            let targetRect = caretRect;
            if (!targetRect) {
                const [line] = quill.getLine(index);
                if (!(line === null || line === void 0 ? void 0 : line.domNode)) {
                    return;
                }
                targetRect = line.domNode.getBoundingClientRect();
            }
            const keyboardTop = window.innerHeight - keyboardHeight;
            const toolbarEl = document.getElementById('venus-editor-toolbar-container');
            const isFloatingToolbar = (_a = toolbarEl === null || toolbarEl === void 0 ? void 0 : toolbarEl.classList.contains('phone-editor-toolbar')) !== null && _a !== void 0 ? _a : false;
            const occlusionTop = isFloatingToolbar
                ? Math.min(toolbarEl.getBoundingClientRect().top, keyboardTop - toolbarEl.offsetHeight)
                : keyboardTop;
            const margin = 16;
            const visibleBottom = occlusionTop - margin;
            let delta = 0;
            if (targetRect.bottom > visibleBottom) {
                delta = targetRect.bottom - visibleBottom;
            }
            else if (targetRect.top < 0) {
                delta = targetRect.top - margin;
            }
            if (delta !== 0) {
                if (smooth) {
                    scrollContainer.scrollTo({
                        top: scrollContainer.scrollTop + delta,
                        behavior: 'smooth'
                    });
                }
                else {
                    scrollContainer.scrollTop += delta;
                }
            }
        }
        catch (e) {
            console.warn('Failed to scroll cursor above keyboard:', e);
        }
    }
    initSpellCheckState(quill) {
        const useSpellcheck = false;
        quill.root.setAttribute('spellcheck', useSpellcheck);
        this.updateToolbarState();
    }
    handleUndo() {
        if (!this.primaryNotesEditor)
            return;
        this.preserveTableControls = true;
        const wasInCell = this.activeEditor === 'cell' && !!this.cellNotesEditor;
        const targetCellId = wasInCell ? this.tableState.activeCellId : undefined;
        if (wasInCell) {
            if (this.notesEditor().history.stack.undo.length > 0) {
                this.notesEditor().history.undo();
            }
            else {
                const fastForwardAmount = this.cellNotesEditor.history.stack.redo.length * 2;
                for (let i = 0; i < fastForwardAmount + 1; i++) {
                    this.primaryNotesEditor.history.undo();
                }
            }
        }
        else {
            this.primaryNotesEditor.history.undo();
        }
        this.reconstructTablesAfterUndoRedo();
        this.restoreEditorFocusAfterUndoRedo(targetCellId);
    }
    handleRedo() {
        if (!this.primaryNotesEditor)
            return;
        this.preserveTableControls = true;
        const wasInCell = this.activeEditor === 'cell' && !!this.cellNotesEditor;
        const targetCellId = wasInCell ? this.tableState.activeCellId : undefined;
        if (wasInCell) {
            if (this.notesEditor().history.stack.redo.length > 0) {
                this.notesEditor().history.redo();
            }
            else {
                this.primaryNotesEditor.history.redo();
            }
        }
        else {
            this.primaryNotesEditor.history.redo();
        }
        this.reconstructTablesAfterUndoRedo();
        this.restoreEditorFocusAfterUndoRedo(targetCellId);
    }
    restoreEditorFocusAfterUndoRedo(targetCellId) {
        this.safeSetTimeout(() => this.restoreActiveEditorFocus(targetCellId), 0);
    }
    suppressDuplicateHistoryBeforeInput(quill) {
        quill.root.addEventListener('beforeinput', (ev) => {
            if (ev.inputType === 'historyUndo' || ev.inputType === 'historyRedo') {
                ev.preventDefault();
                ev.stopImmediatePropagation();
            }
        }, true);
    }
    reconstructTablesAfterUndoRedo() {
        this.safeSetTimeout(() => {
            var _a;
            this.registerTablesWithEditor();
            for (const cellId of Object.keys(this.tableState.editorCache)) {
                const entry = this.tableState.editorCache[cellId];
                if (!document.contains(entry.cellElement)) {
                    (_a = entry.removeListener) === null || _a === void 0 ? void 0 : _a.call(entry);
                    delete this.tableState.editorCache[cellId];
                }
            }
            const activeTable = this.getActiveTable() || this.lastActiveTable;
            const editorElement = document.getElementById(this.editorElementId);
            if (editorElement) {
                const tables = editorElement.querySelectorAll('table.ql-table-blot');
                tables.forEach((table) => {
                    const htmlTable = table;
                    TableBlot.reapplyFormats(htmlTable);
                    if (htmlTable === activeTable) {
                        if (!htmlTable.querySelector('.ql-table-control')) {
                            TableBlot.setupTableControls(htmlTable);
                        }
                    }
                    else {
                        const staleControls = htmlTable.querySelectorAll('.ql-table-control');
                        if (staleControls.length > 0) {
                            this.withHistoryIgnored(() => {
                                staleControls.forEach(c => c.remove());
                            });
                        }
                    }
                });
            }
            this.preserveTableControls = false;
        }, 0);
    }
    setTextScale(scalePercent) {
        const numeric = Number(scalePercent);
        const clamped = this.clampTextScalePercentage(numeric);
        this.textScalePercent = clamped;
    }
    setParagraphStyle(style) {
        if (!this.notesEditor()) {
            throw new Error('Editor instance is null');
        }
        let formatType;
        let formatValue;
        let shouldRemoveFormat = false;
        let shouldRemoveParagraphFormats = false;
        switch (style) {
            case 'normal':
                formatType = 'header';
                formatValue = false;
                shouldRemoveParagraphFormats = true;
                break;
            case 'heading1':
                formatType = 'header';
                formatValue = 1;
                break;
            case 'heading2':
                formatType = 'header';
                formatValue = 2;
                break;
            case 'heading3':
                formatType = 'header';
                formatValue = 3;
                break;
            case 'heading4':
                formatType = 'header';
                formatValue = 4;
                break;
            case 'heading5':
                formatType = 'header';
                formatValue = 5;
                break;
            case 'heading6':
                formatType = 'header';
                formatValue = 6;
                break;
            case 'listbullet':
                formatType = 'list';
                formatValue = 'bullet';
                break;
            case 'listordered':
                formatType = 'list';
                formatValue = 'ordered';
                break;
            case 'listcheck':
                formatType = 'list';
                formatValue = 'unchecked';
                break;
            case 'codeblock':
                formatType = 'code-block';
                formatValue = true;
                shouldRemoveFormat = true;
                break;
            default:
                throw new Error('Unknown paragraph style: ' + style);
        }
        if (this.areCellsSelected()) {
            this.setFormatOnCells(formatType, formatValue, shouldRemoveFormat, shouldRemoveParagraphFormats);
            return;
        }
        const range = this.getSelectionWithFallback();
        if (!range) {
            throw new Error('No selection found');
        }
        const currentFormats = this.notesEditor().getFormat(range.index, range.length);
        let shouldToggleOff = false;
        if (style === 'listbullet' && currentFormats.list === 'bullet') {
            shouldToggleOff = true;
        }
        else if (style === 'listordered' && currentFormats.list === 'ordered') {
            shouldToggleOff = true;
        }
        else if (style === 'listcheck' && (currentFormats.list === 'checked' || currentFormats.list === 'unchecked')) {
            shouldToggleOff = true;
        }
        if (shouldToggleOff) {
            this.notesEditor().format('list', false, 'user');
            return;
        }
        if (shouldRemoveFormat) {
            this.notesEditor().removeFormat(range.index, range.length, 'user');
        }
        if (shouldRemoveParagraphFormats) {
            this.notesEditor().format('list', false, 'user');
            this.notesEditor().format('code-block', false, 'user');
        }
        this.notesEditor().format(formatType, formatValue, 'user');
    }
    removeInlineFormatsOnly(index, length) {
        this.withSelectionPreserved(() => {
            const inlineFormats = ['bold', 'italic', 'underline', 'strike', 'color', 'background', 'link', 'highlight', 'script'];
            for (const format of inlineFormats) {
                this.notesEditor().formatText(index, length, format, false, 'user');
            }
        });
    }
    toggleBooleanFormat(format) {
        if (!this.notesEditor())
            return false;
        const range = this.getSelectionWithFallback();
        if (!range)
            return false;
        const currentFormats = this.notesEditor().getFormat(range.index, range.length);
        const isApplied = currentFormats[format] === true;
        if (this.areCellsSelected()) {
            this.setBooleanFormatOnCells(format, !isApplied);
            return false;
        }
        if (currentFormats.code && format !== 'code')
            return false;
        if (currentFormats['code-block'] && format !== 'code-block')
            return false;
        if (format === 'code' && !isApplied) {
            this.removeInlineFormatsOnly(range.index, range.length);
        }
        this.notesEditor().format(format, !isApplied, 'user');
        this.updateToolbarState();
        return false;
    }
    toggleKeyValueFormat(key, value) {
        if (!this.notesEditor())
            return false;
        const range = this.getSelectionWithFallback();
        if (!range)
            return false;
        const currentFormats = this.notesEditor().getFormat(range.index, range.length);
        const isApplied = currentFormats[key] === value;
        if (currentFormats.code || currentFormats['code-block'])
            return false;
        this.notesEditor().format(key, isApplied ? false : value, 'user');
        this.updateToolbarState();
        return false;
    }
    setForeColor(color) {
        if (this.areCellsSelected()) {
            this.setFormatOnCells('color', color, false, false);
            return false;
        }
        if (!this.restoreSavedSelection())
            return false;
        this.notesEditor().format('color', color, 'user');
        return false;
    }
    setBackColor(color) {
        if (this.areCellsSelected()) {
            this.setFormatOnCells('background', color, false, false);
            return false;
        }
        if (!this.restoreSavedSelection())
            return false;
        this.notesEditor().format('background', color, 'user');
        return false;
    }
    removeForeColor() {
        if (this.areCellsSelected()) {
            this.setFormatOnCells('color', false, false, false);
            return false;
        }
        if (!this.restoreSavedSelection())
            return false;
        this.notesEditor().format('color', false, 'user');
        return false;
    }
    removeBackColor() {
        if (this.areCellsSelected()) {
            this.setFormatOnCells('background', false, false, false);
            return false;
        }
        if (!this.restoreSavedSelection())
            return false;
        this.notesEditor().format('background', false, 'user');
        return false;
    }
    showInsertLinkDialog() {
        if (!this.notesEditor())
            return false;
        let range = this.getSelectionWithFallback();
        if (!range)
            return false;
        this.acquireCellKeepAlive();
        if (range.length === 0) {
            const formatRange = this.getFormatRangeForLinkOrMention(range.index);
            if (formatRange) {
                this.notesEditor().setSelection(formatRange.index, formatRange.length, 'api');
                range = formatRange;
            }
            else {
                const wordRange = this.getWordRangeAtIndex(range.index);
                if (wordRange) {
                    this.notesEditor().setSelection(wordRange.index, wordRange.length, 'api');
                    range = wordRange;
                }
            }
        }
        const formats = this.notesEditor().getFormat(range.index, range.length);
        const selectedText = this.notesEditor().getText(range.index, range.length);
        let prefilledText = '';
        let isUpdatingExistingText = false;
        if (formats.link) {
            prefilledText = formats.link;
        }
        else if (selectedText) {
            prefilledText = selectedText;
        }
        if (selectedText) {
            isUpdatingExistingText = true;
        }
        const bounds = this.notesEditor().getBounds(range.index);
        const editorRect = this.notesEditor().container.getBoundingClientRect();
        const x = editorRect.left + bounds.left;
        const y = editorRect.top + bounds.bottom;
        safeInvoke(this.dotNetHelper, 'ShowInsertLinkDialog', [prefilledText, isUpdatingExistingText, x, y]);
        return false;
    }
    showInsertImageDialog() {
        if (!this.notesEditor())
            return false;
        let range = this.getSelectionWithFallback();
        if (!range)
            return false;
        this.acquireCellKeepAlive();
        const bounds = this.notesEditor().getBounds(range.index);
        const editorRect = this.notesEditor().container.getBoundingClientRect();
        const x = editorRect.left + bounds.left;
        const y = editorRect.top + bounds.bottom;
        safeInvoke(this.dotNetHelper, 'ShowInsertImageDialog', [x, y]);
        return false;
    }
    showInsertTableDialog() {
        if (!this.notesEditor())
            return false;
        if (this.activeEditor === 'cell')
            return false;
        let range = this.getSelectionWithFallback();
        if (!range)
            return false;
        this.savedCellSelection.cellId = null;
        this.savedPrimarySelection = range;
        const bounds = this.notesEditor().getBounds(range.index);
        const editorRect = this.notesEditor().container.getBoundingClientRect();
        const x = editorRect.left + bounds.left;
        const y = editorRect.top + bounds.bottom;
        safeInvoke(this.dotNetHelper, 'ShowInsertTableDialog', [x, y]);
        return false;
    }
    showTableThemeDialog(targetTable) {
        var _a;
        const table = (_a = targetTable !== null && targetTable !== void 0 ? targetTable : this.getActiveTable()) !== null && _a !== void 0 ? _a : this.lastActiveTable;
        if (!table)
            return;
        this.preserveTableControls = true;
        const explicit = {};
        Array.from(table.attributes).forEach(attr => {
            if (attr.name.startsWith('data-table-') && attr.name !== 'data-table-editor') {
                const key = attr.name.substring(5);
                explicit[key] = attr.value;
            }
        });
        const effective = {};
        const cs = getComputedStyle(table);
        effective['table-foreground-color'] = this.rgbToHex(cs.color);
        effective['table-background-color'] = this.rgbToHex(cs.backgroundColor);
        const rows = table.querySelectorAll('tr');
        if (rows.length > 1) {
            effective['table-alt-background-color'] = this.rgbToHex(getComputedStyle(rows[1]).backgroundColor);
        }
        const firstCell = table.querySelector('td');
        if (firstCell) {
            effective['table-line-color'] = this.rgbToHex(getComputedStyle(firstCell).borderColor);
        }
        const firstRowCell = table.querySelector('tr:first-child td');
        if (firstRowCell) {
            const frcs = getComputedStyle(firstRowCell);
            effective['table-first-row-foreground-color'] = this.rgbToHex(frcs.color);
            effective['table-first-row-background-color'] = this.rgbToHex(frcs.backgroundColor);
            effective['table-first-row-line-color'] = this.rgbToHex(frcs.borderColor);
        }
        if (rows.length > 1) {
            const col1Cell = rows[1].querySelector('td:first-child');
            if (col1Cell) {
                const fccs = getComputedStyle(col1Cell);
                effective['table-first-column-foreground-color'] = this.rgbToHex(fccs.color);
                effective['table-first-column-background-color'] = this.rgbToHex(fccs.backgroundColor);
                effective['table-first-column-line-color'] = this.rgbToHex(fccs.borderColor);
            }
        }
        safeInvoke(this.dotNetHelper, 'ShowTableThemeDialog', [JSON.stringify(explicit), JSON.stringify(effective)]);
    }
    rgbToHex(rgb) {
        if (!rgb)
            return '';
        if (rgb.startsWith('#'))
            return rgb.toUpperCase();
        const match = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (!match)
            return '';
        const r = parseInt(match[1]);
        const g = parseInt(match[2]);
        const b = parseInt(match[3]);
        return `#${r.toString(16).padStart(2, '0').toUpperCase()}${g.toString(16).padStart(2, '0').toUpperCase()}${b.toString(16).padStart(2, '0').toUpperCase()}`;
    }
    commitTableColumnWidths(table) {
        const blot = Quill.find(table);
        if (!blot)
            return;
        const index = this.primaryNotesEditor.getIndex(blot);
        if (index === -1)
            return;
        const colgroup = table.querySelector('colgroup');
        if (!colgroup)
            return;
        const widths = ['-1'];
        colgroup.querySelectorAll('col').forEach((col) => {
            const w = parseInt(col.style.width || '0') || 0;
            widths.push(String(w));
        });
        this.cutoffPrimaryHistory();
        this.primaryNotesEditor.formatText(index, 1, { 'table-column-widths': widths.join(',') }, 'user');
        this.cutoffPrimaryHistory();
    }
    applyTableTheme(formatsJson) {
        const table = this.getActiveTable() || this.lastActiveTable;
        if (!table)
            return;
        const blot = Quill.find(table);
        if (!blot)
            return;
        const index = this.primaryNotesEditor.getIndex(blot);
        if (index === -1)
            return;
        const formats = JSON.parse(formatsJson);
        const formatKeys = [
            'table-foreground-color', 'table-background-color', 'table-alt-background-color',
            'table-line-color', 'table-first-row-foreground-color', 'table-first-row-background-color',
            'table-first-row-line-color', 'table-first-column-foreground-color',
            'table-first-column-background-color', 'table-first-column-line-color',
            'table-theme-name'
        ];
        const formatObj = {};
        for (const key of formatKeys) {
            formatObj[key] = formats[key] || null;
        }
        this.cutoffPrimaryHistory();
        this.primaryNotesEditor.formatText(index, 1, formatObj, 'user');
        this.cutoffPrimaryHistory();
        delete table.dataset.tbShapeKey;
        this.preserveTableControls = false;
        this.restoreActiveEditorFocus();
    }
    cancelTableTheme() {
        this.preserveTableControls = false;
        this.restoreActiveEditorFocus();
    }
    insertImage(imageUrl) {
        let editor = null;
        try {
            if (!this.restoreSavedSelection()) {
                return;
            }
            const range = this.getSelectionWithFallback();
            if (!range)
                return;
            editor = this.notesEditor();
            editor.history.cutoff();
            editor.insertEmbed(range.index, 'image', imageUrl, 'user');
            editor.setSelection(range.index + 1, 0, 'user');
        }
        finally {
            if (editor) {
                editor.history.cutoff();
            }
            this.releaseCellKeepAlive();
        }
    }
    insertLink(displayText, url, index, length) {
        let editor = null;
        try {
            if (index !== -1 && length !== -1) {
                this.notesEditor().setSelection(index, length, 'user');
            }
            else {
                if (!this.restoreSavedSelection()) {
                    return;
                }
            }
            const range = this.getSelectionWithFallback();
            if (!range)
                return;
            editor = this.notesEditor();
            editor.history.cutoff();
            if (range.length > 0) {
                if (displayText) {
                    editor.deleteText(range.index, range.length);
                }
                else {
                    editor.format('link', url, 'user');
                    editor.format('mention', '', 'silent');
                    return;
                }
            }
            if (!displayText) {
                displayText = url;
            }
            const insertIndex = range.index;
            editor.insertText(insertIndex, displayText, { link: url }, 'user');
            editor.setSelection(insertIndex + displayText.length, 0, 'silent');
            if (displayText === url && this.URL_REGEX.test(url)) {
                const editor = this.notesEditor();
                editor.history.cutoff();
                this.replaceUrlWithPageTitle(editor, url, insertIndex, displayText.length);
            }
        }
        finally {
            if (editor) {
                editor.history.cutoff();
            }
            this.releaseCellKeepAlive();
        }
    }
    startEditingLink(index, length) {
        this.notesEditor().setSelection(index, length, 'api');
        this.showInsertLinkDialog();
    }
    focusEditor(xPosition = null, scrollIntoView = false, focusAtStart = false, focusAtEnd = false) {
        if (xPosition !== null) {
            this.focusAtXPosition(xPosition, scrollIntoView);
        }
        else if (focusAtStart) {
            const quill = this.notesEditor();
            if (quill) {
                quill.setSelection(0, 0);
                if (scrollIntoView) {
                    quill.root.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
            }
        }
        else if (focusAtEnd) {
            const quill = this.notesEditor();
            if (quill) {
                const endPosition = Math.max(0, quill.getLength() - 1);
                quill.setSelection(endPosition, 0);
                if (scrollIntoView) {
                    quill.root.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
            }
        }
        else {
            this.restoreSavedSelection(scrollIntoView);
        }
    }
    focusAtXPosition(targetX, scrollIntoView = false) {
        const quill = this.notesEditor();
        if (!quill)
            return;
        quill.focus();
        const editorElement = quill.root;
        const editorRect = editorElement.getBoundingClientRect();
        const textContent = quill.getText();
        let closestIndex = 0;
        let closestDistance = Infinity;
        for (let i = 0; i <= Math.min(textContent.length, 100); i++) {
            const bounds = quill.getBounds(i);
            if (bounds) {
                const absoluteX = editorRect.left + bounds.left;
                const distance = Math.abs(absoluteX - targetX);
                if (distance < closestDistance) {
                    closestDistance = distance;
                    closestIndex = i;
                }
                if (bounds.top > 0)
                    break;
            }
        }
        quill.setSelection(closestIndex, 0);
        if (scrollIntoView) {
            editorElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }
    removeFormatting() {
        if (!this.notesEditor())
            return false;
        if (this.areCellsSelected()) {
            this.setFormatOnCells('', '', true, false);
            return false;
        }
        const range = this.getSelectionWithFallback();
        if (!range)
            return false;
        this.notesEditor().removeFormat(range.index, range.length, 'user');
        this.updateToolbarState();
        return false;
    }
    getSelectedTextForSearch() {
        if (!this.primaryNotesEditor)
            return '';
        const selection = this.getSelectionWithFallback();
        if (!selection || selection.length === 0)
            return '';
        const selectedText = this.primaryNotesEditor.getText(selection.index, selection.length).trim();
        if (selectedText.length > 0 && selectedText.length <= 100 && !selectedText.includes('\n')) {
            return selectedText;
        }
        return '';
    }
    getSelectedDelta() {
        if (!this.primaryNotesEditor)
            return '';
        const selection = this.getSelectionWithFallback();
        if (!selection || selection.length === 0)
            return '';
        const quillDelta = this.primaryNotesEditor.getContents(selection.index, selection.length);
        return JSON.stringify(quillDelta);
    }
    executeCommand(command) {
        if (!this.notesEditor())
            return;
        if (command.startsWith('Notes.Formatting.') || command.startsWith('VenusEditor.')) {
            const formatType = command
                .replace('Notes.Formatting.', '')
                .replace('VenusEditor.', '')
                .toLowerCase();
            switch (formatType) {
                case 'inlinecode':
                    this.toggleBooleanFormat('code');
                    break;
                case 'strikethrough':
                    this.toggleBooleanFormat('strike');
                    break;
                case 'superscript':
                    this.toggleKeyValueFormat('script', 'super');
                    break;
                case 'subscript':
                    this.toggleKeyValueFormat('script', 'sub');
                    break;
                case 'remove':
                    this.removeFormatting();
                    break;
                default:
                    this.toggleBooleanFormat(formatType);
                    break;
            }
            return;
        }
        if (command.startsWith('Notes.ParagraphFormatting.')) {
            if (command.startsWith('Notes.ParagraphFormatting.Justify')) {
                const alignment = command.replace('Notes.ParagraphFormatting.Justify', '').toLowerCase();
                this.setTextAlign(alignment);
                return;
            }
            else if (command === 'Notes.ParagraphFormatting.Indent') {
                this.handleIndent();
                return;
            }
            else if (command === 'Notes.ParagraphFormatting.Outdent') {
                this.handleOutdent();
                return;
            }
            else {
                const style = command.replace('Notes.ParagraphFormatting.', '').toLowerCase();
                this.setParagraphStyle(style);
                return;
            }
        }
        if (command.startsWith('Notes.Table.')) {
            const tableCommand = command.replace('Notes.Table.', '');
            switch (tableCommand) {
                case 'DeleteColumn':
                    this.deleteColumn();
                    break;
                case 'DeleteRow':
                    this.deleteRow();
                    break;
                case 'DuplicateRow':
                    this.duplicateRow();
                    break;
                case 'DuplicateColumn':
                    this.duplicateColumn();
                    break;
                case 'MoveRowUp':
                    this.moveRow(-1);
                    break;
                case 'MoveRowDown':
                    this.moveRow(1);
                    break;
                case 'MoveColumnLeft':
                    this.moveColumn(-1);
                    break;
                case 'MoveColumnRight':
                    this.moveColumn(1);
                    break;
                case 'MoveCellUp':
                    this.moveCell(0, -1);
                    break;
                case 'MoveCellDown':
                    this.moveCell(0, 1);
                    break;
                case 'MoveCellLeft':
                    this.moveCell(-1, 0);
                    break;
                case 'MoveCellRight':
                    this.moveCell(1, 0);
                    break;
                case 'SplitTable':
                    this.splitTable();
                    break;
                case 'MergeTableAbove':
                    this.mergeTables('above');
                    break;
                case 'MergeTableBelow':
                    this.mergeTables('below');
                    break;
                case 'JustifyLeft':
                    this.justifyTable('left');
                    break;
                case 'JustifyCenter':
                    this.justifyTable('center');
                    break;
                case 'JustifyRight':
                    this.justifyTable('right');
                    break;
                case 'AlignCellLeft':
                    this.justifyCells('left');
                    break;
                case 'AlignCellCenter':
                    this.justifyCells('center');
                    break;
                case 'AlignCellRight':
                    this.justifyCells('right');
                    break;
                case 'AlignRowLeft':
                    this.justifyRow('left');
                    break;
                case 'AlignRowCenter':
                    this.justifyRow('center');
                    break;
                case 'AlignRowRight':
                    this.justifyRow('right');
                    break;
                case 'AlignColumnLeft':
                    this.justifyColumn('left');
                    break;
                case 'AlignColumnCenter':
                    this.justifyColumn('center');
                    break;
                case 'AlignColumnRight':
                    this.justifyColumn('right');
                    break;
                case 'Theme':
                    this.showTableThemeDialog();
                    return;
                default:
                    console.warn(`Unknown table command: ${tableCommand}`);
                    break;
            }
            this.restoreActiveEditorFocus();
            return;
        }
        switch (command) {
            case 'Notes.InsertThoughtOrWebLink':
                this.showInsertLinkDialog();
                break;
            case 'Notes.InsertDate':
                this.insertDate();
                break;
            case 'Notes.InsertImage':
                this.showInsertImageDialog();
                break;
            case 'Notes.InsertTable':
                this.showInsertTableDialog();
                break;
            case 'Notes.InsertTOC':
                this.insertTableOfContents();
                break;
            case 'Notes.InsertHorizontalRule':
                this.insertHorizontalRule();
                break;
            case 'Notes.InsertMathematicalExpression':
                this.insertMathExpression();
                break;
            case 'Notes.ExtractChildThought':
                this.extractChildThought();
                break;
            case 'Notes.Copy':
                this.copySelection();
                break;
            case 'Notes.Cut':
                this.cutSelection();
                break;
            case 'Notes.CopyAsPlainText':
                this.copyAsPlainText();
                break;
            case 'Notes.CopyAsMarkdown':
                this.copyAsMarkdown();
                break;
            case 'Notes.CopyAsHtmlSource':
                this.copyAsHtmlSource();
                break;
            case 'Notes.Paste':
                this.pasteViaCommand();
                break;
            case 'Notes.PasteWithoutFormatting':
                this.pasteWithoutFormatting();
                break;
            case 'Notes.SelectAll':
                this.selectAll();
                break;
            case 'Notes.CopyFormatting':
                this.copyFormatting();
                break;
            case 'Notes.PasteFormatting':
                this.pasteFormatting();
                break;
            case 'Notes.MoveLineUp':
                this.moveLineUp();
                break;
            case 'Notes.MoveLineDown':
                this.moveLineDown();
                break;
            case 'Notes.ExpandCollapseToggle':
                this.toggleCollapseAtSelection();
                break;
            case 'Notes.CollapseHere':
                this.collapseAllHere();
                break;
            case 'Notes.ExpandHere':
                this.expandAllHere();
                break;
            case 'Notes.CollapseAllExceptHere':
                this.collapseAllExceptSelection();
                break;
            case 'Notes.CollapseAll':
                this.collapseAll();
                break;
            case 'Notes.ExpandAll':
                this.expandAll();
                break;
            default:
                console.warn(`Unknown command: ${command}`);
                break;
        }
    }
    extractChildThought() {
        const range = this.getSelectionWithFallback();
        if (!range)
            return;
        const quillDelta = this.notesEditor().getContents(range.index, range.length);
        safeInvoke(this.dotNetHelper, 'ExtractAsChildThought', [JSON.stringify(quillDelta)]);
    }
    deleteSelection() {
        if (!this.notesEditor())
            return;
        const range = this.getSelectionWithFallback();
        if (!range)
            return;
        this.notesEditor().deleteText(range.index, range.length, 'user');
    }
    updateTableOfContents() {
        const quill = this.notesEditor();
        if (!quill)
            return;
        const headings = extractHeadings(quill);
        const scroll = quill.scroll;
        const tocBlots = [];
        scroll.descendants((blot) => {
            if (blot instanceof TableOfContentsBlot) {
                tocBlots.push(blot);
            }
        });
        for (const tocBlot of tocBlots) {
            tocBlot.updateContent(headings);
        }
    }
    extractTableSelectionData(table) {
        var _a;
        const ts = TableBlot.getTableSelection(table);
        if (ts.startRow === -1 || ts.startCol === -1 || ts.endRow === -1 || ts.endCol === -1)
            return null;
        const minRow = Math.min(ts.startRow, ts.endRow);
        const maxRow = Math.max(ts.startRow, ts.endRow);
        const minCol = Math.min(ts.startCol, ts.endCol);
        const maxCol = Math.max(ts.startCol, ts.endCol);
        const rowCount = maxRow - minRow + 1;
        const colCount = maxCol - minCol + 1;
        const themeFormats = {};
        Array.from(table.attributes).forEach(attr => {
            if (attr.name.startsWith('data-table-')) {
                themeFormats[attr.name.substring(5)] = attr.value;
            }
        });
        const colgroup = table.querySelector('colgroup');
        if (colgroup) {
            const allCols = colgroup.querySelectorAll('col');
            const widths = ['-1'];
            let hasAnyWidth = false;
            for (let c = minCol; c <= maxCol; c++) {
                const w = parseInt(((_a = allCols[c]) === null || _a === void 0 ? void 0 : _a.style.width) || '0') || 0;
                if (w > 0)
                    hasAnyWidth = true;
                widths.push(String(w));
            }
            if (hasAnyWidth) {
                themeFormats['table-column-widths'] = widths.join(',');
            }
            else {
                delete themeFormats['table-column-widths'];
            }
        }
        const cells = [];
        const plainRows = [];
        let htmlTable = '<table';
        for (const [key, value] of Object.entries(themeFormats)) {
            htmlTable += ` data-${key}="${this.escapeHtmlAttr(value)}"`;
        }
        htmlTable += '>';
        const plainScratch = document.createElement('div');
        for (let r = minRow; r <= maxRow; r++) {
            const row = table.rows[r];
            if (!row)
                continue;
            const cellRow = [];
            const plainCells = [];
            htmlTable += '<tr>';
            for (let c = minCol; c <= maxCol; c++) {
                const cell = row.cells[c];
                if (!cell) {
                    cellRow.push('');
                    plainCells.push('');
                    htmlTable += '<td></td>';
                    continue;
                }
                const cellClone = cell.cloneNode(true);
                cellClone.querySelectorAll('.ql-table-control').forEach(el => el.remove());
                const cellHtml = cellClone.innerHTML || '';
                cellRow.push(cellHtml);
                plainScratch.innerHTML = cellHtml;
                plainCells.push(plainScratch.textContent || '');
                htmlTable += '<td>' + cellHtml + '</td>';
            }
            cells.push(cellRow);
            plainRows.push(plainCells.join('\t'));
            htmlTable += '</tr>';
        }
        htmlTable += '</table>';
        return {
            rows: rowCount,
            columns: colCount,
            cells,
            plainText: plainRows.join('\n'),
            html: htmlTable,
            themeFormats
        };
    }
    escapeHtmlAttr(value) {
        return value
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }
    copyTableSelection(ev) {
        var _a, _b;
        const table = this.tableState.lastTableWithSelection;
        if (!table)
            return false;
        const savedTs = TableBlot.getTableSelection(table);
        const data = this.extractTableSelectionData(table);
        if (!data)
            return false;
        this.copiedTableData = {
            rows: data.rows,
            columns: data.columns,
            cells: data.cells,
            plainText: data.plainText,
            themeFormats: data.themeFormats
        };
        const plain = data.plainText;
        const html = this.cleanHtmlForClipboard(data.html);
        if (ev) {
            if (this.isMacOS()) {
                safeInvoke(this.dotNetHelper, 'SetClipboardFromEditor', [plain, html]);
            }
            else {
                (_a = ev.clipboardData) === null || _a === void 0 ? void 0 : _a.setData('text/plain', plain);
                if (html)
                    (_b = ev.clipboardData) === null || _b === void 0 ? void 0 : _b.setData('text/html', html);
            }
            ev.preventDefault();
            ev.stopImmediatePropagation();
            ev.stopPropagation();
        }
        else {
            if (this.isMacOS()) {
                safeInvoke(this.dotNetHelper, 'SetClipboardFromEditor', [plain, html]);
            }
            else {
                navigator.clipboard.writeText(plain);
            }
        }
        this.restoreTableSelectionIfNeeded(table, savedTs);
        return true;
    }
    restoreTableSelectionIfNeeded(table, savedTs) {
        var _a, _b;
        if (savedTs.startRow === -1)
            return;
        const currentTs = TableBlot.getTableSelection(table);
        if (currentTs.startRow !== -1)
            return;
        const startCell = (_a = table.rows[savedTs.startRow]) === null || _a === void 0 ? void 0 : _a.cells[savedTs.startCol];
        const endCell = (_b = table.rows[savedTs.endRow]) === null || _b === void 0 ? void 0 : _b.cells[savedTs.endCol];
        if (startCell && endCell) {
            TableBlot.setTableSelection(table, startCell, endCell);
        }
    }
    cutTableSelection(ev) {
        if (!this.copyTableSelection(ev))
            return false;
        const table = this.tableState.lastTableWithSelection;
        if (!table)
            return true;
        const cells = TableBlot.getSelectedCells(table);
        if (this.isCellEditorActive()) {
            this.notesEditor().deleteText(0, this.notesEditor().getLength(), 'api');
        }
        cells.forEach(cell => {
            if (cell.id !== this.tableState.activeCellId) {
                cell.innerHTML = '<p><br></p>';
            }
        });
        delete table.dataset.tbShapeKey;
        TableBlot.setupTableControls(table);
        return true;
    }
    pasteTableContent(clipboardPlainText) {
        var _a, _b, _c, _d;
        if (!this.copiedTableData)
            return false;
        if (clipboardPlainText !== this.copiedTableData.plainText) {
            this.copiedTableData = null;
            return false;
        }
        const srcData = this.copiedTableData;
        const table = this.getActiveTable();
        if (table) {
            let targetRow;
            let targetCol;
            const ts = TableBlot.getTableSelection(table);
            if (ts.startRow !== -1 && ts.startCol !== -1) {
                targetRow = Math.min(ts.startRow, ts.endRow);
                targetCol = Math.min(ts.startCol, ts.endCol);
            }
            else if (this.tableState.activeCellId) {
                const cellElement = document.getElementById(this.tableState.activeCellId);
                if (!cellElement)
                    return false;
                const row = cellElement.parentElement;
                targetRow = Array.from(table.rows).indexOf(row);
                targetCol = Array.from(row.cells).indexOf(cellElement);
            }
            else {
                return false;
            }
            const existingRows = table.rows.length;
            const existingCols = (_b = (_a = table.rows[0]) === null || _a === void 0 ? void 0 : _a.cells.length) !== null && _b !== void 0 ? _b : 0;
            const neededRows = targetRow + srcData.rows;
            const neededCols = targetCol + srcData.columns;
            if (existingCols < neededCols || existingRows < neededRows) {
                TableBlot.performUndoableOperation(table, () => {
                    for (let i = existingCols; i < neededCols; i++) {
                        TableBlot.addColumn(table, i);
                    }
                    for (let i = existingRows; i < neededRows; i++) {
                        TableBlot.addRow(table, i);
                    }
                });
            }
            for (let r = 0; r < srcData.rows; r++) {
                for (let c = 0; c < srcData.columns; c++) {
                    const tRow = targetRow + r;
                    const tCol = targetCol + c;
                    const row = table.rows[tRow];
                    if (!row)
                        continue;
                    const cell = row.cells[tCol];
                    if (!cell)
                        continue;
                    const cellHtml = srcData.cells[r][c];
                    if (!cellHtml && cellHtml !== '')
                        continue;
                    if (cell.id === this.tableState.activeCellId && this.tableState.editorCache[cell.id]) {
                        const cellQuill = this.tableState.editorCache[cell.id].quill;
                        const delta = cellQuill.clipboard.convert({ html: cellHtml });
                        cellQuill.setContents(delta, 'user');
                    }
                    else {
                        cell.innerHTML = cellHtml || '<p><br></p>';
                    }
                }
            }
            TableBlot.setTableSelection(table, null, null);
            delete table.dataset.tbShapeKey;
            TableBlot.setupTableControls(table);
        }
        else {
            const range = this.getSelectionWithFallback();
            if (!range)
                return false;
            const deltaCells = srcData.cells.map(row => row.map(cellHtml => {
                if (!cellHtml)
                    return '{"ops":[]}';
                const delta = QuillExtensions.convertHtmlToDelta(cellHtml);
                return JSON.stringify(delta);
            }));
            const tableValue = JSON.stringify({
                columns: srcData.columns,
                rows: srcData.rows,
                cells: deltaCells
            });
            (_c = this.primaryNotesEditor) === null || _c === void 0 ? void 0 : _c.insertEmbed(range.index, 'table', tableValue, 'user');
            if (srcData.themeFormats && Object.keys(srcData.themeFormats).length > 0) {
                (_d = this.primaryNotesEditor) === null || _d === void 0 ? void 0 : _d.formatText(range.index, 1, srcData.themeFormats, 'user');
            }
            this.safeSetTimeout(() => { this.registerTablesWithEditor(); }, 0);
        }
        return true;
    }
    copySelection() {
        if (this.copyTableSelection())
            return;
        const range = this.getSelectionWithFallback();
        if (!range || range.length === 0)
            return;
        const imageUrl = this.getSelectedImageUrl(this.notesEditor(), range);
        if (imageUrl) {
            console.log('[VenusEditor] Image-only selection detected in copySelection, imageUrl:', imageUrl.substring(0, 100));
            this.copyImageToClipboard(imageUrl).then(ok => {
                console.log('[VenusEditor] copyImageToClipboard result from copySelection:', ok);
            }).catch(err => {
                console.error('[VenusEditor] copyImageToClipboard error from copySelection:', err);
            });
            return;
        }
        if (this.isMacOS()) {
            try {
                const plain = this.notesEditor().getText(range.index, range.length);
                let html = '';
                try {
                    html = this.notesEditor().getSemanticHTML(range.index, range.length);
                    html = this.cleanHtmlForClipboard(html);
                }
                catch (_a) { }
                safeInvoke(this.dotNetHelper, 'SetClipboardFromEditor', [plain, html]);
                return;
            }
            catch (_b) { }
        }
        document.execCommand('copy');
    }
    cutSelection() {
        if (this.cutTableSelection())
            return;
        const range = this.getSelectionWithFallback();
        if (!range || range.length === 0)
            return;
        if (this.isMacOS()) {
            try {
                const plain = this.notesEditor().getText(range.index, range.length);
                let html = '';
                try {
                    html = this.notesEditor().getSemanticHTML(range.index, range.length);
                    html = this.cleanHtmlForClipboard(html);
                }
                catch (_a) { }
                safeInvoke(this.dotNetHelper, 'SetClipboardFromEditor', [plain, html]);
                this.notesEditor().deleteText(range.index, range.length, 'user');
                return;
            }
            catch (_b) { }
        }
        document.execCommand('cut');
    }
    copyAsPlainText() {
        const range = this.getSelectionWithFallback();
        if (!range)
            return;
        const text = this.notesEditor().getText(range.index, range.length);
        navigator.clipboard.writeText(text);
    }
    copyAsMarkdown() {
        const range = this.getSelectionWithFallback();
        if (!range)
            return;
        const quillDelta = this.notesEditor().getContents(range.index, range.length);
        safeInvoke(this.dotNetHelper, 'CopyAsMarkdown', [JSON.stringify(quillDelta)]);
    }
    copyAsHtmlSource() {
        const range = this.getSelectionWithFallback();
        if (!range)
            return;
        let html = this.notesEditor().getSemanticHTML(range.index, range.length);
        html = this.removeMentionSpansAndConvertRelativeLinks(html);
        navigator.clipboard.writeText(html);
    }
    cleanHtmlForClipboard(html) {
        if (!html)
            return html;
        return html.replace(/&nbsp;/g, ' ');
    }
    removeMentionSpansAndConvertRelativeLinks(html) {
        html = html.replace(/&nbsp;/g, ' ');
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;
        const processedHashElements = tempDiv.querySelectorAll('[data-processed-hash]');
        processedHashElements.forEach(element => {
            element.removeAttribute('data-processed-hash');
        });
        const mentionStatusSpans = tempDiv.querySelectorAll('span[data-mention-status]');
        mentionStatusSpans.forEach(span => {
            var _a;
            const textNode = document.createTextNode(span.textContent || '');
            (_a = span.parentNode) === null || _a === void 0 ? void 0 : _a.replaceChild(textNode, span);
        });
        const mentionSpans = tempDiv.querySelectorAll('span[data-mention]');
        mentionSpans.forEach(span => {
            var _a;
            const textNode = document.createTextNode(span.textContent || '');
            (_a = span.parentNode) === null || _a === void 0 ? void 0 : _a.replaceChild(textNode, span);
        });
        const links = tempDiv.querySelectorAll('a[href]');
        links.forEach(link => {
            const href = link.getAttribute('href');
            if (href && href.startsWith('/')) {
                link.setAttribute('href', 'https://app.thebrain.com' + href);
            }
        });
        return tempDiv.innerHTML;
    }
    pasteViaCommand() {
        if (this.editorSettings.isDeku) {
            this.notesEditor().focus();
            document.execCommand('paste');
            return;
        }
        this.pasteViaCommandInternal();
    }
    pasteViaCommandInternal() {
        if (this.copiedTableData) {
            navigator.clipboard.readText().then(text => {
                if (!this.pasteTableContent(text)) {
                    this.pasteViaCommandInternalDefault();
                }
            }).catch(() => {
                this.pasteViaCommandInternalDefault();
            });
            return;
        }
        this.pasteViaCommandInternalDefault();
    }
    pasteViaCommandInternalDefault() {
        navigator.clipboard.read().then(items => {
            for (const item of items) {
                if (item.types.includes('text/html')) {
                    item.getType('text/html').then(blob => {
                        blob.text().then(html => {
                            const delta = QuillExtensions.convertHtmlToDelta(html);
                            if (this.editorSettings.pasteWithoutFormattingAsDefault || this.editorSettings.excludeColorInformationWhenPasting || this.editorSettings.excludeFontInformationWhenPasting) {
                                delta.ops.forEach((op) => {
                                    if (op.attributes) {
                                        if (this.editorSettings.pasteWithoutFormattingAsDefault) {
                                            delete op.attributes;
                                        }
                                        else {
                                            if (this.editorSettings.excludeColorInformationWhenPasting) {
                                                delete op.attributes.color;
                                                delete op.attributes.background;
                                            }
                                            if (this.editorSettings.excludeFontInformationWhenPasting) {
                                                delete op.attributes.font;
                                                delete op.attributes.size;
                                            }
                                        }
                                    }
                                });
                            }
                            const selection = this.getSelectionWithFallback();
                            if (!selection)
                                return;
                            const index = selection.index;
                            delta.ops.unshift({ retain: index });
                            this.notesEditor().updateContents(delta);
                        });
                    });
                    return;
                }
                if (item.types.includes('text/plain')) {
                    item.getType('text/plain').then(blob => {
                        blob.text().then(text => {
                            const range = this.getSelectionWithFallback();
                            if (!range)
                                return;
                            if (this.editorSettings.defaultEditMode === EditorMode.StyledMarkdown &&
                                !this.editorSettings.pasteWithoutFormattingAsDefault) {
                                safeInvokeAsync(this.dotNetHelper, 'GetThoughtMarkdownIfMatch', [text]).then((thoughtMarkdown) => {
                                    const textToConvert = thoughtMarkdown || text;
                                    safeInvokeAsync(this.dotNetHelper, 'ConvertMarkdownToDelta', [textToConvert]).then((deltaJson) => {
                                        if (deltaJson) {
                                            try {
                                                const delta = JSON.parse(deltaJson);
                                                if (range.length > 0) {
                                                    this.notesEditor().deleteText(range.index, range.length, 'user');
                                                }
                                                delta.ops.unshift({ retain: range.index });
                                                this.notesEditor().updateContents(delta, 'user');
                                                const insertLength = delta.ops.reduce((len, op) => len + (op.insert ? (typeof op.insert === 'string' ? op.insert.length : 1) : 0), 0);
                                                this.notesEditor().setSelection(range.index + insertLength, 0, 'user');
                                            }
                                            catch (ex) {
                                                console.error('Failed to parse markdown delta:', ex);
                                                this.notesEditor().deleteText(range.index, range.length);
                                                this.notesEditor().insertText(range.index, text, 'user');
                                            }
                                        }
                                        else {
                                            this.notesEditor().deleteText(range.index, range.length);
                                            this.notesEditor().insertText(range.index, text, 'user');
                                        }
                                    });
                                });
                            }
                            else {
                                this.notesEditor().deleteText(range.index, range.length);
                                this.notesEditor().insertText(range.index, text, 'user');
                            }
                        });
                    });
                    return;
                }
            }
        }).catch(err => {
            console.warn('Paste failed:', err);
        });
    }
    pasteWithoutFormatting() {
        navigator.clipboard.readText().then(text => {
            const range = this.getSelectionWithFallback();
            if (range) {
                this.notesEditor().deleteText(range.index, range.length);
                this.notesEditor().insertText(range.index, text, 'user');
                this.notesEditor().setSelection(range.index + text.length, 0);
            }
        });
    }
    insertPlainText(text, detectMarkdown) {
        if (!this.notesEditor())
            return;
        const range = this.getSelectionWithFallback();
        if (range) {
            if (detectMarkdown) {
                const textToConvert = text + '\n';
                this.insertMarkdownAsDelta(this.notesEditor(), textToConvert, text, text, range, true);
            }
            else {
                this.notesEditor().deleteText(range.index, range.length);
                this.notesEditor().insertText(range.index, text, 'user');
                this.notesEditor().setSelection(range.index + text.length, 0);
            }
        }
    }
    selectAll() {
        this.notesEditor().setSelection(0, this.notesEditor().getLength());
    }
    copyFormatting() {
        const range = this.getSelectionWithFallback();
        if (!range || range.length === 0)
            return;
        const allFormats = this.notesEditor().getFormat(range.index, range.length);
        const inlineFormats = {};
        const lineFormats = {};
        for (const key in allFormats) {
            if (VenusEditor.lineFormatKeys.includes(key)) {
                lineFormats[key] = allFormats[key];
            }
            else {
                inlineFormats[key] = allFormats[key];
            }
        }
        this.copiedFormatting = { inlineFormats, lineFormats };
    }
    getSelectedImageUrl(quill, selection) {
        if (!selection || selection.length === 0)
            return null;
        const delta = quill.getContents(selection.index, selection.length);
        if (!delta || !delta.ops)
            return null;
        let imageUrl = null;
        let hasOtherContent = false;
        for (const op of delta.ops) {
            if (typeof op.insert === 'object' && op.insert.image) {
                if (imageUrl !== null) {
                    hasOtherContent = true;
                    break;
                }
                imageUrl = op.insert.image;
            }
            else if (typeof op.insert === 'string') {
                if (op.insert !== '\n') {
                    hasOtherContent = true;
                    break;
                }
            }
            else if (op.insert) {
                hasOtherContent = true;
                break;
            }
        }
        return hasOtherContent ? null : imageUrl;
    }
    async copyImageToClipboard(imageUrl) {
        try {
            console.log('[VenusEditor] copyImageToClipboard: fetching image url:', imageUrl.substring(0, 100));
            const response = await fetch(imageUrl);
            if (!response.ok) {
                console.error('[VenusEditor] copyImageToClipboard: fetch failed, status:', response.status, response.statusText);
                return false;
            }
            const blob = await response.blob();
            console.log('[VenusEditor] copyImageToClipboard: fetched blob, type:', blob.type, 'size:', blob.size);
            let mimeType = blob.type;
            if (!mimeType || !mimeType.startsWith('image/')) {
                mimeType = 'image/png';
            }
            let pngBlob = blob;
            if (mimeType !== 'image/png') {
                console.log('[VenusEditor] copyImageToClipboard: converting from', mimeType, 'to PNG via canvas');
                const img = document.createElement('img');
                img.crossOrigin = 'anonymous';
                const loadPromise = new Promise((resolve, reject) => {
                    img.onload = () => resolve(img);
                    img.onerror = reject;
                });
                img.src = imageUrl;
                await loadPromise;
                const canvas = document.createElement('canvas');
                canvas.width = img.naturalWidth;
                canvas.height = img.naturalHeight;
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    console.error('[VenusEditor] copyImageToClipboard: failed to get canvas 2d context');
                    return false;
                }
                ctx.drawImage(img, 0, 0);
                pngBlob = await new Promise((resolve, reject) => {
                    canvas.toBlob(b => b ? resolve(b) : reject(new Error('Canvas toBlob failed')), 'image/png');
                });
                console.log('[VenusEditor] copyImageToClipboard: converted to PNG, size:', pngBlob.size);
            }
            console.log('[VenusEditor] copyImageToClipboard: dotNetHelper available:', !!this.dotNetHelper);
            if (this.dotNetHelper) {
                try {
                    const arrayBuffer = await pngBlob.arrayBuffer();
                    const bytes = new Uint8Array(arrayBuffer);
                    console.log('[VenusEditor] copyImageToClipboard: converting', bytes.byteLength, 'bytes to base64');
                    const base64 = await new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onloadend = () => {
                            const dataUrl = reader.result;
                            resolve(dataUrl.substring(dataUrl.indexOf(',') + 1));
                        };
                        reader.onerror = reject;
                        reader.readAsDataURL(pngBlob);
                    });
                    console.log('[VenusEditor] copyImageToClipboard: calling SetClipboardImageFromEditor, base64 length:', base64.length);
                    const success = await safeInvokeAsync(this.dotNetHelper, 'SetClipboardImageFromEditor', [base64]);
                    console.log('[VenusEditor] copyImageToClipboard: SetClipboardImageFromEditor returned:', success);
                    if (success)
                        return true;
                }
                catch (ex) {
                    console.error('[VenusEditor] copyImageToClipboard: .NET interop failed:', ex);
                }
            }
            console.log('[VenusEditor] copyImageToClipboard: falling back to navigator.clipboard.write');
            await navigator.clipboard.write([
                new ClipboardItem({ 'image/png': pngBlob })
            ]);
            console.log('[VenusEditor] copyImageToClipboard: navigator.clipboard.write succeeded');
            return true;
        }
        catch (ex) {
            console.error('[VenusEditor] copyImageToClipboard: top-level error:', ex);
            return false;
        }
    }
    pasteFormatting() {
        if (!this.copiedFormatting)
            return;
        const range = this.getSelectionWithFallback();
        if (!range || range.length === 0)
            return;
        const editor = this.notesEditor();
        this.withSelectionPreserved(() => {
            if (Object.keys(this.copiedFormatting.inlineFormats).length > 0) {
                editor.formatText(range.index, range.length, this.copiedFormatting.inlineFormats, 'user');
            }
            if (Object.keys(this.copiedFormatting.lineFormats).length > 0) {
                const lines = editor.getLines(range.index, range.length);
                for (const line of lines) {
                    const lineIndex = editor.getIndex(line);
                    for (const formatKey in this.copiedFormatting.lineFormats) {
                        editor.formatLine(lineIndex, 1, formatKey, this.copiedFormatting.lineFormats[formatKey], 'user');
                    }
                }
            }
        });
    }
    isCommandChecked(command) {
        if (!this.notesEditor())
            return false;
        if (command.startsWith('Notes.Formatting.') || command.startsWith('VenusEditor.')) {
            const formatType = command
                .replace('Notes.Formatting.', '')
                .replace('VenusEditor.', '')
                .toLowerCase();
            const range = this.getSelectionWithFallback();
            if (!range)
                return false;
            const currentFormats = this.notesEditor().getFormat(range.index, range.length);
            switch (formatType) {
                case 'bold':
                    return currentFormats.bold === true;
                case 'italic':
                    return currentFormats.italic === true;
                case 'underline':
                    return currentFormats.underline === true;
                case 'strike':
                case 'strikethrough':
                    return currentFormats.strike === true;
                case 'code':
                case 'inlinecode':
                    return currentFormats.code === true;
                case 'highlight':
                    return currentFormats.highlight === true;
                case 'superscript':
                    return currentFormats.script === 'super';
                case 'subscript':
                    return currentFormats.script === 'sub';
                default:
                    return false;
            }
        }
        if (command.startsWith('Notes.ParagraphFormatting.')) {
            const style = command.replace('Notes.ParagraphFormatting.', '').toLowerCase();
            const range = this.getSelectionWithFallback();
            if (!range)
                return false;
            const currentFormats = this.notesEditor().getFormat(range.index, range.length);
            switch (style) {
                case 'normal':
                    return !currentFormats.header && !currentFormats.list && !currentFormats['code-block'];
                case 'heading1':
                    return currentFormats.header === 1;
                case 'heading2':
                    return currentFormats.header === 2;
                case 'heading3':
                    return currentFormats.header === 3;
                case 'heading4':
                    return currentFormats.header === 4;
                case 'heading5':
                    return currentFormats.header === 5;
                case 'heading6':
                    return currentFormats.header === 6;
                case 'listbullet':
                    return currentFormats.list === 'bullet';
                case 'listordered':
                    return currentFormats.list === 'ordered';
                case 'listcheck':
                    return currentFormats.list === 'checked' || currentFormats.list === 'unchecked';
                case 'codeblock':
                    return !!currentFormats['code-block'];
                case 'justifyleft':
                    return !currentFormats.align || currentFormats.align === 'left';
                case 'justifycenter':
                    return currentFormats.align === 'center';
                case 'justifyright':
                    return currentFormats.align === 'right';
                default:
                    return false;
            }
        }
        console.warn(`Unknown command in isCommandChecked: ${command}`);
        return false;
    }
    setTextAlign(alignment) {
        if (!this.notesEditor())
            return;
        const range = this.getSelectionWithFallback();
        if (!range)
            return;
        if (alignment === "left") {
            this.notesEditor().format('align', false, 'user');
        }
        this.notesEditor().format('align', alignment, 'user');
    }
    getTableContext() {
        const table = this.getActiveTable() || this.lastActiveTable;
        if (!table) {
            return null;
        }
        let rowCount = 1;
        let columnCount = 1;
        const ts = TableBlot.getTableSelection(table);
        if (ts.startRow !== -1 && ts.startCol != -1) {
            if (ts.endRow !== ts.startRow) {
                rowCount = Math.abs(ts.startRow - ts.endRow) + 1;
            }
            if (ts.endCol !== ts.startCol) {
                columnCount = Math.abs(ts.startCol - ts.endCol) + 1;
            }
            const rowIndex = Math.min(ts.startRow, ts.endRow);
            const columnIndex = Math.min(ts.startCol, ts.endCol);
            return { table, rowIndex, columnIndex, rowCount, columnCount };
        }
        const cellId = this.tableState.activeCellId || this.tableState.lastActiveCellId;
        if (!cellId) {
            return null;
        }
        const cellElement = document.getElementById(cellId);
        if (!cellElement) {
            return null;
        }
        const row = cellElement.parentElement;
        const rowIndex = Array.from(table.rows).indexOf(row);
        const columnIndex = Array.from(row.cells).indexOf(cellElement);
        return { table, rowIndex, columnIndex, rowCount, columnCount };
    }
    deleteColumn() {
        var _a, _b, _c;
        const context = this.getTableContext();
        if (!context || context.columnIndex < 0)
            return;
        TableBlot.performUndoableOperation(context.table, () => {
            for (let i = 0; i < context.columnCount; i++) {
                TableBlot.deleteColumn(context.table, context.columnIndex);
            }
        });
        const firstRow = context.table.rows[0];
        if (firstRow && firstRow.cells.length > 0) {
            const newColIndex = Math.min(context.columnIndex, firstRow.cells.length - 1);
            const newCol = Math.max(0, newColIndex > 0 ? context.columnIndex - 1 : 0);
            const startCell = (_b = (_a = context.table.rows[0]) === null || _a === void 0 ? void 0 : _a.cells[newCol]) !== null && _b !== void 0 ? _b : null;
            const lastRow = context.table.rows[context.table.rows.length - 1];
            const endCell = (_c = lastRow === null || lastRow === void 0 ? void 0 : lastRow.cells[newCol]) !== null && _c !== void 0 ? _c : null;
            if (startCell && endCell) {
                TableBlot.setTableSelection(context.table, startCell, endCell);
            }
        }
    }
    deleteRow() {
        var _a, _b;
        const context = this.getTableContext();
        if (!context || context.rowIndex < 0)
            return;
        TableBlot.performUndoableOperation(context.table, () => {
            for (let i = 0; i < context.rowCount; i++) {
                TableBlot.deleteRow(context.table, context.rowIndex);
            }
        });
        if (context.table.rows.length > 0) {
            const newRowIndex = Math.min(context.rowIndex, context.table.rows.length - 1);
            const newRow = Math.max(0, newRowIndex > 0 ? context.rowIndex - 1 : 0);
            const row = context.table.rows[newRow];
            if (row) {
                const startCell = (_a = row.cells[0]) !== null && _a !== void 0 ? _a : null;
                const endCell = (_b = row.cells[row.cells.length - 1]) !== null && _b !== void 0 ? _b : null;
                if (startCell && endCell) {
                    TableBlot.setTableSelection(context.table, startCell, endCell);
                }
            }
        }
    }
    duplicateRow() {
        const context = this.getTableContext();
        if (!context || context.rowIndex < 0)
            return;
        const selectionStartCell = TableBlot.getSelectionStartCell(context.table);
        const selectionEndCell = TableBlot.getSelectionEndCell(context.table);
        TableBlot.performUndoableOperation(context.table, () => {
            for (let i = 0; i < context.rowCount; i++) {
                const toDupe = context.rowIndex + i;
                TableBlot.duplicateRow(context.table, toDupe);
                for (let j = 0; j < context.rowCount - 1; j++) {
                    TableBlot.moveRow(context.table, toDupe + 1 + j, 1);
                }
            }
        });
        if (selectionStartCell && selectionEndCell) {
            TableBlot.setTableSelection(context.table, selectionStartCell, selectionEndCell);
        }
    }
    duplicateColumn() {
        const context = this.getTableContext();
        if (!context || context.columnIndex < 0)
            return;
        const selectionStartCell = TableBlot.getSelectionStartCell(context.table);
        const selectionEndCell = TableBlot.getSelectionEndCell(context.table);
        TableBlot.performUndoableOperation(context.table, () => {
            for (let i = 0; i < context.columnCount; i++) {
                const toDupe = context.columnIndex + i;
                TableBlot.duplicateColumn(context.table, toDupe);
                for (let j = 0; j < context.columnCount - 1; j++) {
                    TableBlot.moveColumn(context.table, toDupe + 1 + j, 1);
                }
            }
        });
        if (selectionStartCell && selectionEndCell) {
            TableBlot.setTableSelection(context.table, selectionStartCell, selectionEndCell);
        }
    }
    moveRow(direction) {
        const context = this.getTableContext();
        if (!context || context.rowIndex < 0)
            return;
        const selectionStartCell = TableBlot.getSelectionStartCell(context.table);
        const selectionEndCell = TableBlot.getSelectionEndCell(context.table);
        if (context.rowCount > 1) {
            if (direction > 0) {
                if (context.rowIndex + context.rowCount - 1 >= context.table.rows.length - 1) {
                    return;
                }
            }
            else {
                if (context.rowIndex <= 0) {
                    return;
                }
            }
            TableBlot.performUndoableOperation(context.table, () => {
                if (direction > 0) {
                    const outsideRowIndex = context.rowIndex + context.rowCount;
                    for (let i = 0; i < context.rowCount; i++) {
                        TableBlot.moveRow(context.table, outsideRowIndex - i, -1);
                    }
                }
                else {
                    const outsideRowIndex = context.rowIndex - 1;
                    for (let i = 0; i < context.rowCount; i++) {
                        TableBlot.moveRow(context.table, outsideRowIndex + i, 1);
                    }
                }
            });
        }
        else {
            TableBlot.moveRow(context.table, context.rowIndex, direction);
        }
        if (selectionStartCell !== null && selectionEndCell !== null) {
            TableBlot.setTableSelection(context.table, selectionStartCell, selectionEndCell);
        }
    }
    moveColumn(direction) {
        const context = this.getTableContext();
        if (!context || context.columnIndex < 0)
            return;
        const selectionStartCell = TableBlot.getSelectionStartCell(context.table);
        const selectionEndCell = TableBlot.getSelectionEndCell(context.table);
        if (context.columnCount > 1) {
            const firstRow = context.table.rows[0];
            if (!firstRow)
                return;
            if (direction > 0) {
                if (context.columnIndex + context.columnCount - 1 >= firstRow.cells.length - 1) {
                    return;
                }
            }
            else {
                if (context.columnIndex <= 0) {
                    return;
                }
            }
            TableBlot.performUndoableOperation(context.table, () => {
                if (direction > 0) {
                    const outsideColumnIndex = context.columnIndex + context.columnCount;
                    for (let i = 0; i < context.columnCount; i++) {
                        TableBlot.moveColumn(context.table, outsideColumnIndex - i, -1);
                    }
                }
                else {
                    const outsideColumnIndex = context.columnIndex - 1;
                    for (let i = 0; i < context.columnCount; i++) {
                        TableBlot.moveColumn(context.table, outsideColumnIndex + i, 1);
                    }
                }
            });
        }
        else {
            TableBlot.moveColumn(context.table, context.columnIndex, direction);
        }
        if (selectionStartCell !== null && selectionEndCell !== null) {
            TableBlot.setTableSelection(context.table, selectionStartCell, selectionEndCell);
        }
    }
    moveCell(colDelta, rowDelta) {
        var _a, _b, _c, _d;
        const context = this.getTableContext();
        if (!context)
            return;
        const firstRow = context.table.rows[0];
        if (!firstRow)
            return;
        const totalRows = context.table.rows.length;
        const totalCols = firstRow.cells.length;
        if (rowDelta < 0 && context.rowIndex + rowDelta < 0)
            return;
        if (rowDelta > 0 && context.rowIndex + context.rowCount - 1 + rowDelta >= totalRows)
            return;
        if (colDelta < 0 && context.columnIndex + colDelta < 0)
            return;
        if (colDelta > 0 && context.columnIndex + context.columnCount - 1 + colDelta >= totalCols)
            return;
        const rowStart = rowDelta > 0 ? context.rowIndex + context.rowCount - 1 : context.rowIndex;
        const rowEnd = rowDelta > 0 ? context.rowIndex - 1 : context.rowIndex + context.rowCount;
        const rowStep = rowDelta > 0 ? -1 : 1;
        const colStart = colDelta > 0 ? context.columnIndex + context.columnCount - 1 : context.columnIndex;
        const colEnd = colDelta > 0 ? context.columnIndex - 1 : context.columnIndex + context.columnCount;
        const colStep = colDelta > 0 ? -1 : 1;
        TableBlot.performUndoableOperation(context.table, () => {
            for (let r = rowStart; r !== rowEnd; r += rowStep) {
                for (let c = colStart; c !== colEnd; c += colStep) {
                    TableBlot.swapCells(context.table, r, c, r + rowDelta, c + colDelta, this.tableState);
                }
            }
        });
        const newStartRow = context.rowIndex + rowDelta;
        const newStartCol = context.columnIndex + colDelta;
        const newEndRow = newStartRow + context.rowCount - 1;
        const newEndCol = newStartCol + context.columnCount - 1;
        const newStartCell = (_b = (_a = context.table.rows[newStartRow]) === null || _a === void 0 ? void 0 : _a.cells[newStartCol]) !== null && _b !== void 0 ? _b : null;
        const newEndCell = (_d = (_c = context.table.rows[newEndRow]) === null || _c === void 0 ? void 0 : _c.cells[newEndCol]) !== null && _d !== void 0 ? _d : null;
        TableBlot.setTableSelection(context.table, newStartCell, newEndCell);
    }
    splitTable() {
        const context = this.getTableContext();
        if (!context || context.rowIndex <= 0)
            return;
        TableBlot.splitTable(context.table, context.rowIndex, this.tableState, this.primaryNotesEditor);
        this.safeSetTimeout(() => {
            this.registerTablesWithEditor();
        }, 0);
    }
    applyAlignmentToCells(table, cells, alignment) {
        const value = alignment === 'left' ? false : alignment;
        const formats = { align: value };
        const selectionStartCell = TableBlot.getSelectionStartCell(table);
        const selectionEndCell = TableBlot.getSelectionEndCell(table);
        this.removeTableControlsFromTable(table);
        cells.forEach(cell => {
            if (cell.id === this.tableState.activeCellId) {
                const cellQuill = this.tableState.editorCache[cell.id].quill;
                cellQuill.formatText(0, cellQuill.getLength(), formats);
            }
            else {
                const newHtml = QuillExtensions.applyFormattingToHtml(cell.innerHTML, formats);
                cell.innerHTML = newHtml;
            }
        });
        TableBlot.setupTableControls(table);
        TableBlot.setTableSelection(table, selectionStartCell, selectionEndCell);
    }
    justifyCells(alignment) {
        const context = this.getTableContext();
        if (!context)
            return;
        const table = context.table;
        let cells;
        if (this.areCellsSelected()) {
            cells = Array.from(TableBlot.getSelectedCells(table));
        }
        else if (this.tableState.activeCellId) {
            const cached = this.tableState.editorCache[this.tableState.activeCellId];
            if (cached === null || cached === void 0 ? void 0 : cached.cellElement)
                cells = [cached.cellElement];
            else
                return;
        }
        else {
            return;
        }
        this.applyAlignmentToCells(table, cells, alignment);
    }
    justifyRow(alignment) {
        const context = this.getTableContext();
        if (!context)
            return;
        const rows = context.table.querySelectorAll('tr');
        const cells = [];
        for (let r = context.rowIndex; r < context.rowIndex + context.rowCount; r++) {
            const row = rows[r];
            if (row) {
                row.querySelectorAll('td').forEach(td => cells.push(td));
            }
        }
        this.applyAlignmentToCells(context.table, cells, alignment);
    }
    justifyColumn(alignment) {
        const context = this.getTableContext();
        if (!context)
            return;
        const cells = [];
        context.table.querySelectorAll('tr').forEach(row => {
            const tds = row.querySelectorAll('td');
            for (let c = context.columnIndex; c < context.columnIndex + context.columnCount; c++) {
                if (tds[c])
                    cells.push(tds[c]);
            }
        });
        this.applyAlignmentToCells(context.table, cells, alignment);
    }
    justifyTable(justification) {
        const context = this.getTableContext();
        if (!context)
            return;
        const blot = Quill.find(context.table);
        if (!blot)
            return;
        const index = this.primaryNotesEditor.getIndex(blot);
        if (index === -1)
            return;
        const value = justification === 'left' ? null : justification;
        this.primaryNotesEditor.formatText(index, 1, { 'table-justification': value }, 'user');
    }
    mergeTables(direction) {
        const context = this.getTableContext();
        if (!context)
            return;
        TableBlot.mergeTables(context.table, direction, this.tableState, this.primaryNotesEditor);
        this.safeSetTimeout(() => {
            this.registerTablesWithEditor();
        }, 0);
    }
    adjustListIndent(delta) {
        var _a, _b;
        const editor = this.notesEditor();
        if (!editor) {
            return false;
        }
        const range = this.getSelectionWithFallback();
        if (!range) {
            return false;
        }
        this.refreshOutline();
        const targetIds = this.getListBlocksInRange(range).map(block => block.id);
        if (targetIds.length === 0) {
            return false;
        }
        const caretIndex = range.index;
        const selectionLength = range.length;
        let changed = false;
        for (const blockId of targetIds) {
            let block = this.getBlockById(blockId);
            if (!block) {
                continue;
            }
            let blockStartIndex = this.getBlockSpanIncludingDescendants(block).start;
            const originalSpan = this.getBlockSpanIncludingDescendants(block);
            const caretInsideBlock = caretIndex >= originalSpan.start && caretIndex <= originalSpan.end;
            if (delta < 0) {
                const newStart = this.ensureBlockReadyForOutdent(block);
                if (newStart !== null) {
                    blockStartIndex = newStart;
                    this.refreshOutline();
                    block = (_a = this.getOutlineBlockForIndex(blockStartIndex)) !== null && _a !== void 0 ? _a : this.getBlockById(blockId);
                    if (!block) {
                        continue;
                    }
                }
            }
            const spanBeforeIndent = this.getBlockSpanIncludingDescendants(block);
            const blockChanged = this.applyIndentToListBlock(editor, spanBeforeIndent.start, spanBeforeIndent.end - spanBeforeIndent.start, delta);
            changed = changed || blockChanged;
            if (blockChanged) {
                this.refreshOutline();
                block = (_b = this.getOutlineBlockForIndex(blockStartIndex)) !== null && _b !== void 0 ? _b : this.getBlockById(blockId);
                if (!block) {
                    continue;
                }
            }
            if (caretInsideBlock) {
                const updatedSpan = this.getBlockSpanIncludingDescendants(block);
                this.updateSelectionAfterStructuralChange(updatedSpan.start, selectionLength);
            }
        }
        if (changed) {
            this.refreshOutline();
        }
        return changed;
    }
    applyIndentToListBlock(editor, start, length, delta) {
        const lines = editor.getLines(start, Math.max(1, length));
        if (!lines || lines.length === 0) {
            return false;
        }
        const savedSelection = editor.getSelection();
        let updated = false;
        for (const line of lines) {
            const lineIndex = typeof editor.getIndex === 'function' ? editor.getIndex(line) : start;
            const lineLength = Math.max(1, typeof line.length === 'function' ? line.length() : 1);
            const formats = typeof line.formats === 'function' ? line.formats() : editor.getFormat(lineIndex, lineLength);
            if (!(formats === null || formats === void 0 ? void 0 : formats.list)) {
                continue;
            }
            const currentIndent = typeof formats.indent === 'number' ? formats.indent : 0;
            const nextIndent = Math.max(0, currentIndent + delta);
            if (nextIndent === currentIndent) {
                continue;
            }
            editor.formatLine(lineIndex, lineLength, 'indent', nextIndent, 'user');
            updated = true;
        }
        if (updated && savedSelection) {
            editor.setSelection(savedSelection.index, savedSelection.length, 'silent');
        }
        return updated;
    }
    handleTabKey(range, context) {
        if (!this.notesEditor())
            return false;
        if (!range)
            return false;
        if (context.format['code-block']) {
            return false;
        }
        if (context.format.header) {
            const currentLevel = context.format.header;
            if (currentLevel < 6) {
                this.notesEditor().format('header', currentLevel + 1, 'user');
                return true;
            }
            return false;
        }
        if (context.format.list) {
            if (this.adjustListIndent(1)) {
                return false;
            }
            const currentIndent = context.format.indent || 0;
            this.notesEditor().format('indent', currentIndent + 1, 'user');
            return false;
        }
        const [line, offset] = this.notesEditor().getLine(range.index);
        if (line) {
            const startOfLine = range.index - offset;
            this.notesEditor().insertText(startOfLine, '\t', 'user');
            this.notesEditor().setSelection(range.index + 1, 0, 'api');
        }
        return false;
    }
    handleShiftTabKey(range, context) {
        if (!this.notesEditor())
            return false;
        if (!range)
            return false;
        if (context.format['code-block']) {
            return false;
        }
        if (context.format.header) {
            const currentLevel = context.format.header;
            if (currentLevel > 1) {
                this.notesEditor().format('header', currentLevel - 1, 'user');
            }
            return false;
        }
        if (context.format.list) {
            const currentIndent = context.format.indent || 0;
            if (currentIndent > 0) {
                if (this.adjustListIndent(-1)) {
                    return false;
                }
                this.notesEditor().format('indent', currentIndent - 1, 'user');
            }
            return false;
        }
        const [line, offset] = this.notesEditor().getLine(range.index);
        if (line) {
            const startOfLine = range.index - offset;
            const textBefore = this.notesEditor().getText(startOfLine, 1);
            if (textBefore === '\t') {
                this.notesEditor().deleteText(startOfLine, 1);
            }
        }
        return false;
    }
    handleShiftEnter(range) {
        const editor = this.notesEditor();
        if (!editor || !range)
            return false;
        if (range.length > 0) {
            editor.deleteText(range.index, range.length, 'user');
        }
        const [line, offset] = editor.getLine(range.index);
        const isEndOfBlock = line && offset === line.length() - 1;
        if (isEndOfBlock) {
            const Delta = Quill.import('delta');
            const delta = new Delta()
                .retain(range.index)
                .insert({ linebreak: true })
                .insert({ linebreak: true });
            editor.updateContents(delta, 'user');
        }
        else {
            editor.insertEmbed(range.index, 'linebreak', true, 'user');
        }
        editor.setSelection(range.index + 1, 0, 'silent');
        return false;
    }
    performPlainEnter(range) {
        const editor = this.notesEditor();
        if (!editor || !range) {
            return false;
        }
        const [line, offset] = editor.getLine(range.index);
        const formats = editor.getFormat(range.index);
        const listValue = formats && formats.list;
        const isListLine = listValue === 'bullet' || listValue === 'ordered'
            || listValue === 'checked' || listValue === 'unchecked';
        const isEmptyListItem = isListLine && line && line.length() === 1 && offset === 0;
        if (isEmptyListItem) {
            const indent = (formats && formats.indent) || 0;
            if (indent > 0) {
                editor.format('indent', indent - 1, 'user');
            }
            else {
                editor.format('list', false, 'user');
            }
            return false;
        }
        if (range.length > 0) {
            editor.deleteText(range.index, range.length, 'user');
        }
        editor.insertText(range.index, '\n', 'user');
        editor.setSelection(range.index + 1, 0, 'silent');
        return false;
    }
    insertLineBreak() {
        const editor = this.notesEditor();
        if (!editor) {
            return;
        }
        const range = this.getSelectionWithFallback();
        if (!range) {
            return;
        }
        this.handleShiftEnter(range);
    }
    moveLineUp() {
        this.enqueueLineMove(-1);
        return false;
    }
    moveLineDown() {
        this.enqueueLineMove(1);
        return false;
    }
    enqueueLineMove(direction) {
        this.lineMoveQueue.push(direction);
        if (this.isProcessingLineMoveQueue) {
            return;
        }
        this.isProcessingLineMoveQueue = true;
        const processNext = () => {
            if (this.lineMoveQueue.length === 0) {
                this.isProcessingLineMoveQueue = false;
                return;
            }
            const nextDirection = this.lineMoveQueue.shift();
            if (nextDirection === undefined) {
                this.isProcessingLineMoveQueue = false;
                return;
            }
            try {
                this.moveLinesCore(nextDirection);
            }
            catch (error) {
                console.error('Failed to move line', error);
            }
            if (this.lineMoveQueue.length === 0) {
                this.isProcessingLineMoveQueue = false;
                return;
            }
            requestAnimationFrame(processNext);
        };
        requestAnimationFrame(processNext);
    }
    moveLinesCore(direction) {
        var _a;
        const editor = this.restoreSavedSelection();
        if (!editor) {
            this.updateMoveLineCommandStates();
            return false;
        }
        const range = this.getSelectionWithFallback();
        if (!range) {
            this.updateMoveLineCommandStates();
            return false;
        }
        const documentLength = editor.getLength();
        if (documentLength <= 1) {
            this.updateMoveLineCommandStates();
            return false;
        }
        const startLineInfo = editor.getLine(range.index);
        const startLine = startLineInfo ? startLineInfo[0] : null;
        const startOffset = startLineInfo && typeof startLineInfo[1] === 'number' ? startLineInfo[1] : 0;
        if (!startLine) {
            this.updateMoveLineCommandStates();
            return false;
        }
        let blockStart = range.index - startOffset;
        let lastIndex = range.length > 0 ? range.index + range.length - 1 : range.index;
        if (lastIndex >= documentLength) {
            lastIndex = documentLength - 1;
        }
        const endLineInfo = editor.getLine(lastIndex);
        const endLine = endLineInfo ? endLineInfo[0] : null;
        const endOffset = endLineInfo && typeof endLineInfo[1] === 'number' ? endLineInfo[1] : 0;
        if (!endLine) {
            this.updateMoveLineCommandStates();
            return false;
        }
        let blockEnd = lastIndex - endOffset + endLine.length();
        let blockLength = blockEnd - blockStart;
        if (blockLength <= 0) {
            this.updateMoveLineCommandStates();
            return false;
        }
        const collapsedBlock = this.getCollapsedBlockAtIndex(range.index);
        const collapsedBlockId = (_a = collapsedBlock === null || collapsedBlock === void 0 ? void 0 : collapsedBlock.id) !== null && _a !== void 0 ? _a : null;
        if (collapsedBlock) {
            const span = this.getDocumentSpanForBlock(collapsedBlock);
            if (span.end > span.start) {
                blockStart = span.start;
                blockEnd = span.end;
                blockLength = blockEnd - blockStart;
            }
        }
        let listSelectionInfo = null;
        if (!collapsedBlock) {
            listSelectionInfo = this.getListSelectionInfo(range);
            if (listSelectionInfo) {
                blockStart = listSelectionInfo.start;
                blockEnd = listSelectionInfo.end;
                blockLength = blockEnd - blockStart;
            }
        }
        if (direction < 0) {
            if (collapsedBlockId && collapsedBlock) {
                const prevSibling = this.getPreviousSiblingBlock(collapsedBlock);
                if (prevSibling) {
                    const prevSpan = this.getDocumentSpanForBlock(prevSibling);
                    const prevStart = prevSpan.start;
                    const prevLength = prevSpan.end - prevSpan.start;
                    if (prevLength <= 0) {
                        this.updateMoveLineCommandStates();
                        return false;
                    }
                    if (prevSpan.end === blockStart) {
                        const blockDelta = editor.getContents(blockStart, blockLength);
                        const prevDelta = editor.getContents(prevStart, prevLength);
                        let composedDelta = new Delta().retain(prevStart).delete(prevLength + blockLength);
                        composedDelta = composedDelta.concat(blockDelta);
                        composedDelta = composedDelta.concat(prevDelta);
                        editor.updateContents(composedDelta, 'user');
                        const newIndex = prevStart;
                        editor.setSelection(newIndex, range.length, 'user');
                        if (this.activeEditor === 'primary') {
                            this.savedPrimarySelection = { index: newIndex, length: range.length };
                        }
                        this.reapplyCollapseStateAfterMove(collapsedBlockId, newIndex);
                        this.updateMoveLineCommandStates();
                        return true;
                    }
                }
            }
            if (listSelectionInfo) {
                const firstBlock = listSelectionInfo.blocks[0];
                const prevListSibling = this.getPreviousSiblingBlock(firstBlock);
                if (prevListSibling && prevListSibling.type === 'list') {
                    const prevSpan = this.getBlockSpanIncludingDescendants(prevListSibling);
                    if (prevSpan.end === blockStart) {
                        const blockDelta = editor.getContents(blockStart, blockLength);
                        const prevDelta = editor.getContents(prevSpan.start, prevSpan.end - prevSpan.start);
                        let composedDelta = new Delta().retain(prevSpan.start).delete((prevSpan.end - prevSpan.start) + blockLength);
                        composedDelta = composedDelta.concat(blockDelta);
                        composedDelta = composedDelta.concat(prevDelta);
                        editor.updateContents(composedDelta, 'user');
                        this.refreshOutline(editor);
                        const newIndex = prevSpan.start;
                        editor.setSelection(newIndex, range.length, 'user');
                        if (this.activeEditor === 'primary') {
                            this.savedPrimarySelection = { index: newIndex, length: range.length };
                        }
                        this.updateMoveLineCommandStates();
                        return true;
                    }
                }
            }
            const prevIndex = blockStart - 1;
            if (prevIndex < 0) {
                this.updateMoveLineCommandStates();
                return false;
            }
            const prevLineInfo = editor.getLine(prevIndex);
            const prevLine = prevLineInfo ? prevLineInfo[0] : null;
            const prevOffset = prevLineInfo && typeof prevLineInfo[1] === 'number' ? prevLineInfo[1] : 0;
            if (!prevLine) {
                this.updateMoveLineCommandStates();
                return false;
            }
            const prevStart = prevIndex - prevOffset;
            const prevLength = prevLine.length();
            const blockDelta = editor.getContents(blockStart, blockLength);
            const prevDelta = editor.getContents(prevStart, prevLength);
            let composedDelta = new Delta().retain(prevStart).delete(prevLength + blockLength);
            composedDelta = composedDelta.concat(blockDelta);
            composedDelta = composedDelta.concat(prevDelta);
            editor.updateContents(composedDelta, 'user');
            this.refreshOutline(editor);
            const newIndex = Math.max(0, prevStart);
            editor.setSelection(newIndex, range.length, 'user');
            if (this.activeEditor === 'primary') {
                this.savedPrimarySelection = { index: newIndex, length: range.length };
            }
            if (collapsedBlockId) {
                this.reapplyCollapseStateAfterMove(collapsedBlockId, newIndex);
            }
            this.updateMoveLineCommandStates();
            return true;
        }
        if (direction > 0) {
            if (collapsedBlockId && collapsedBlock) {
                const nextSibling = this.getNextSiblingBlock(collapsedBlock);
                if (nextSibling) {
                    const nextSpan = this.getDocumentSpanForBlock(nextSibling);
                    const nextStart = nextSpan.start;
                    const nextLength = nextSpan.end - nextSpan.start;
                    if (nextLength <= 0) {
                        this.updateMoveLineCommandStates();
                        return false;
                    }
                    if (blockEnd === nextSpan.start) {
                        const blockDelta = editor.getContents(blockStart, blockLength);
                        const nextDelta = editor.getContents(nextStart, nextLength);
                        let composedDelta = new Delta().retain(blockStart).delete(blockLength + nextLength);
                        composedDelta = composedDelta.concat(nextDelta);
                        composedDelta = composedDelta.concat(blockDelta);
                        editor.updateContents(composedDelta, 'user');
                        const newIndex = blockStart + nextLength;
                        editor.setSelection(newIndex, range.length, 'user');
                        if (this.activeEditor === 'primary') {
                            this.savedPrimarySelection = { index: newIndex, length: range.length };
                        }
                        this.reapplyCollapseStateAfterMove(collapsedBlockId, newIndex);
                        this.updateMoveLineCommandStates();
                        return true;
                    }
                }
            }
            if (listSelectionInfo) {
                const lastBlock = listSelectionInfo.blocks[listSelectionInfo.blocks.length - 1];
                const nextListSibling = this.getNextSiblingBlock(lastBlock);
                if (nextListSibling && nextListSibling.type === 'list') {
                    const nextSpan = this.getBlockSpanIncludingDescendants(nextListSibling);
                    if (blockEnd === nextSpan.start) {
                        const blockDelta = editor.getContents(blockStart, blockLength);
                        const nextDelta = editor.getContents(nextSpan.start, nextSpan.end - nextSpan.start);
                        let composedDelta = new Delta().retain(blockStart).delete(blockLength + (nextSpan.end - nextSpan.start));
                        composedDelta = composedDelta.concat(nextDelta);
                        composedDelta = composedDelta.concat(blockDelta);
                        editor.updateContents(composedDelta, 'user');
                        this.refreshOutline(editor);
                        const newIndex = blockStart + (nextSpan.end - nextSpan.start);
                        editor.setSelection(newIndex, range.length, 'user');
                        if (this.activeEditor === 'primary') {
                            this.savedPrimarySelection = { index: newIndex, length: range.length };
                        }
                        if (collapsedBlockId) {
                            this.setCollapseState(collapsedBlockId, true);
                        }
                        this.updateMoveLineCommandStates();
                        return true;
                    }
                }
            }
            const afterIndex = blockStart + blockLength;
            if (afterIndex >= documentLength) {
                this.updateMoveLineCommandStates();
                return false;
            }
            const nextLineInfo = editor.getLine(afterIndex);
            const nextLine = nextLineInfo ? nextLineInfo[0] : null;
            const nextOffset = nextLineInfo && typeof nextLineInfo[1] === 'number' ? nextLineInfo[1] : 0;
            if (!nextLine) {
                this.updateMoveLineCommandStates();
                return false;
            }
            const nextStart = afterIndex - nextOffset;
            const nextLineLength = nextLine.length();
            const blockDelta = editor.getContents(blockStart, blockLength);
            const nextDelta = editor.getContents(nextStart, nextLineLength);
            let composedDelta = new Delta().retain(blockStart).delete(blockLength + nextLineLength);
            composedDelta = composedDelta.concat(nextDelta);
            composedDelta = composedDelta.concat(blockDelta);
            editor.updateContents(composedDelta, 'user');
            this.refreshOutline(editor);
            const newIndex = blockStart + nextLineLength;
            editor.setSelection(newIndex, range.length, 'user');
            if (this.activeEditor === 'primary') {
                this.savedPrimarySelection = { index: newIndex, length: range.length };
            }
            if (collapsedBlockId) {
                this.reapplyCollapseStateAfterMove(collapsedBlockId, newIndex);
            }
            this.updateMoveLineCommandStates();
            return true;
        }
        return false;
    }
    handleIndent() {
        if (!this.notesEditor())
            return false;
        const range = this.getSelectionWithFallback();
        if (!range)
            return false;
        const currentFormat = this.notesEditor().getFormat();
        if (currentFormat.list) {
            const currentLevel = currentFormat.indent || 0;
            if (this.adjustListIndent(1)) {
                return false;
            }
            this.notesEditor().format('indent', currentLevel + 1, 'user');
        }
        else {
            const currentLevel = currentFormat.blockquote || 0;
            this.notesEditor().format('blockquote', currentLevel + 1, 'user');
        }
        return false;
    }
    handleOutdent() {
        if (!this.notesEditor())
            return false;
        const range = this.getSelectionWithFallback();
        if (!range)
            return false;
        const currentFormat = this.notesEditor().getFormat();
        if (currentFormat.list) {
            const currentLevel = currentFormat.indent || 0;
            if (currentLevel > 0) {
                if (this.adjustListIndent(-1)) {
                    return false;
                }
                this.notesEditor().format('indent', currentLevel - 1, 'user');
            }
        }
        else {
            const currentLevel = currentFormat.blockquote || 0;
            if (currentLevel > 0) {
                this.notesEditor().format('blockquote', currentLevel - 1, 'user');
            }
        }
        return false;
    }
    toggleSpellcheck() {
        if (!this.notesEditor())
            return false;
        if (this.editorSettings.isSpellCheckEnabled) {
            this.editorSettings.isSpellCheckEnabled = false;
            this.notesEditor().root.setAttribute('spellcheck', 'false');
        }
        else {
            this.editorSettings.isSpellCheckEnabled = true;
            this.notesEditor().root.setAttribute('spellcheck', 'true');
        }
        this.updateToolbarState();
        return false;
    }
    insertEmbedAtCursor(embedType, embedValue, selectEmbedAfterInsert = false) {
        if (!this.notesEditor())
            return false;
        const range = this.getSelectionWithFallback();
        if (!range)
            return false;
        const editor = this.notesEditor();
        editor.history.cutoff();
        if (range.length > 0) {
            editor.deleteText(range.index, range.length, 'user');
        }
        const [line, offset] = editor.getLine(range.index);
        let isEmptyLine = false;
        if (line) {
            const lineStart = range.index - offset;
            const lineLength = line.length();
            const lineContents = editor.getContents(lineStart, lineLength);
            const hasContent = (lineContents.ops || []).some((op) => {
                if (typeof op.insert === 'string') {
                    return op.insert.replace(/\n/g, '').length > 0;
                }
                return op.insert != null;
            });
            isEmptyLine = !hasContent;
        }
        let embedIndex = range.index;
        if (isEmptyLine) {
            editor.insertEmbed(range.index, embedType, embedValue, 'user');
        }
        else {
            editor.insertText(range.index, '\n', 'user');
            embedIndex = range.index + 1;
            editor.insertEmbed(embedIndex, embedType, embedValue, 'user');
        }
        if (selectEmbedAfterInsert) {
            editor.setSelection({ index: embedIndex, length: 1 }, 'user');
        }
        else {
            editor.setSelection(embedIndex + 1, 0);
        }
        editor.history.cutoff();
        return false;
    }
    insertHorizontalRule() {
        return this.insertEmbedAtCursor('divider', 'hr');
    }
    insertTableOfContents() {
        const result = this.insertEmbedAtCursor('table-of-contents', 'toc');
        this.safeSetTimeout(() => {
            this.updateTableOfContents();
        }, 0);
        return result;
    }
    insertMathExpression() {
        var _a;
        const quill = this.notesEditor();
        if (!quill)
            return false;
        if ((_a = quill.options) === null || _a === void 0 ? void 0 : _a.readOnly)
            return false;
        const range = this.getSelectionWithFallback();
        if (!range)
            return false;
        this.acquireCellKeepAlive();
        const editorKind = this.getEditorKind(quill);
        const { x, y, width } = this.computeDialogAnchor(quill, range.index, range.length);
        this.dotNetHelper.invokeMethodAsync('ShowMathDialog', '', editorKind, range.index, range.length, false, x, y, width);
        return false;
    }
    getEditorKind(quill) {
        return quill === this.cellNotesEditor ? 'cell' : 'primary';
    }
    computeDialogAnchor(quill, index, length = 0) {
        var _a;
        try {
            const bounds = quill.getBounds({ index, length });
            const containerRect = quill.container.getBoundingClientRect();
            const noteCard = document.getElementById('contentAreaInner');
            const anchorRect = ((_a = noteCard !== null && noteCard !== void 0 ? noteCard : quill.root) !== null && _a !== void 0 ? _a : quill.container).getBoundingClientRect();
            const horizontalInset = 32;
            const width = Math.max(anchorRect.width - horizontalInset * 2, 0);
            return {
                x: anchorRect.left + horizontalInset,
                y: containerRect.top + bounds.bottom,
                width,
            };
        }
        catch (_b) {
            return { x: 0, y: 0, width: 0 };
        }
    }
    openMathDialogForBlot(quill, mathBlot, index) {
        var _a;
        const mathNode = mathBlot.domNode;
        const latex = ((_a = mathNode === null || mathNode === void 0 ? void 0 : mathNode.getAttribute('data-math-source')) !== null && _a !== void 0 ? _a : '')
            .replace(/\t/g, ' \\\\    ')
            .replace(/ {4}/g, '\n');
        const editorKind = this.getEditorKind(quill);
        this.enterMathHold(quill, mathBlot, index, null);
        this.acquireCellKeepAlive();
        const { x, y, width } = this.computeDialogAnchor(quill, index, 1);
        this.dotNetHelper.invokeMethodAsync('ShowMathDialog', latex, editorKind, index, 1, true, x, y, width);
        return true;
    }
    insertMath(latex, editorKind, index, length, isEditing) {
        var _a;
        try {
            const quill = editorKind === 'cell' ? this.cellNotesEditor : this.primaryNotesEditor;
            if (!quill)
                return;
            const storedLatex = (latex !== null && latex !== void 0 ? latex : '').replace(/\r\n?/g, '\n').replace(/\n/g, '    ');
            quill.history.cutoff();
            try {
                if (isEditing) {
                    quill.formatText(index, Math.max(length, 1), MathExpressionBlot.blotName, storedLatex, 'user');
                }
                else {
                    if (length > 0) {
                        quill.deleteText(index, length, 'user');
                    }
                    quill.insertEmbed(index, 'math', storedLatex, 'user');
                }
                this.skipMathAdjacentSelect = true;
                quill.setSelection(index, 0, 'user');
                const [blot] = quill.getLeaf(index + 1);
                if (blot && ((_a = blot.statics) === null || _a === void 0 ? void 0 : _a.blotName) === MathExpressionBlot.blotName) {
                    this.enterMathHold(quill, blot, index, null);
                }
            }
            finally {
                quill.history.cutoff();
            }
        }
        finally {
            this.releaseCellKeepAlive();
        }
    }
    cancelMathDialog(editorKind, index = -1) {
        var _a;
        try {
            if (index >= 0) {
                const quill = editorKind === 'cell' ? this.cellNotesEditor : this.primaryNotesEditor;
                if (quill) {
                    this.skipMathAdjacentSelect = true;
                    quill.setSelection(index, 0, 'user');
                    const [blot] = quill.getLeaf(index + 1);
                    if (blot && ((_a = blot.statics) === null || _a === void 0 ? void 0 : _a.blotName) === MathExpressionBlot.blotName) {
                        this.enterMathHold(quill, blot, index, null);
                    }
                }
            }
        }
        finally {
            this.releaseCellKeepAlive();
        }
    }
    insertTable(numRows = 3, numCols = 3) {
        if (!this.restoreSavedSelection())
            return false;
        if (this.activeEditor === 'cell')
            return false;
        const range = this.getSelectionWithFallback();
        if (!range)
            return false;
        const cells = [];
        for (let i = 0; i < numRows + 1; i++) {
            const row = [];
            for (let j = 0; j < numCols; j++) {
                row.push("{\"ops\":[]}");
            }
            cells.push(row);
        }
        const tableValue = JSON.stringify({
            columns: numCols,
            rows: numRows,
            cells: cells
        });
        this.cutoffPrimaryHistory();
        this.notesEditor().insertEmbed(range.index, 'table', tableValue, 'user');
        this.cutoffPrimaryHistory();
        this.safeSetTimeout(() => {
            this.registerTablesWithEditor();
        }, 0);
        return false;
    }
    insertDate() {
        var _a;
        const editor = this.notesEditor();
        if (!editor) {
            return false;
        }
        const now = new Date();
        const range = this.getSelectionWithFallback();
        if (!range) {
            return false;
        }
        const rangeIndex = range.index;
        const rangeLength = (_a = range.length) !== null && _a !== void 0 ? _a : 0;
        const insertPlainText = (text) => {
            editor.history.cutoff();
            if (rangeLength >= 1) {
                editor.deleteText(rangeIndex, rangeLength, 'user');
            }
            editor.insertText(rangeIndex, text, 'user');
            editor.setSelection(rangeIndex + text.length, 0);
            editor.history.cutoff();
        };
        if (this.editorSettings.useCustomDateTimeFormat && this.editorSettings.customDateTimeFormat) {
            const escapedFormat = this.escapeDateTimeFormatPunctuation(this.editorSettings.customDateTimeFormat);
            const markdownFormatted = this.formatDateWithCustomFormat(now, escapedFormat);
            if (this.dotNetHelper) {
                safeInvokeAsync(this.dotNetHelper, 'ConvertMarkdownToDelta', [markdownFormatted])
                    .then((deltaJson) => {
                    if (!deltaJson) {
                        insertPlainText(markdownFormatted);
                        return;
                    }
                    try {
                        const parsed = JSON.parse(deltaJson);
                        const contentDelta = new Delta(parsed);
                        const { delta: deltaToInsert } = this.trimTrailingPlainNewlinesFromDelta(contentDelta);
                        const deltaLength = deltaToInsert.length();
                        const insertedLength = deltaLength > 0 ? deltaLength : contentDelta.length();
                        let composedDelta = new Delta().retain(rangeIndex);
                        if (rangeLength >= 1) {
                            composedDelta = composedDelta.delete(rangeLength);
                        }
                        const effectiveDelta = deltaLength > 0 ? deltaToInsert : contentDelta;
                        composedDelta = composedDelta.concat(effectiveDelta);
                        editor.history.cutoff();
                        editor.updateContents(composedDelta, 'user');
                        editor.setSelection(rangeIndex + insertedLength, 0);
                        editor.history.cutoff();
                    }
                    catch (error) {
                        console.error('Failed to insert custom date markdown as delta', error);
                        insertPlainText(markdownFormatted);
                    }
                });
                return false;
            }
            insertPlainText(markdownFormatted);
            return false;
        }
        const textToInsert = `${now.toLocaleDateString()}, ${now.toLocaleTimeString()}`;
        insertPlainText(textToInsert);
        return false;
    }
    escapeDateTimeFormatPunctuation(format) {
        return format.replace(/\//g, '\\/').replace(/:/g, '\\:');
    }
    formatDateWithCustomFormat(date, format) {
        const formatMap = {
            'd': () => date.getDate().toString(),
            'dd': () => String(date.getDate()).padStart(2, '0'),
            'ddd': () => date.toLocaleString(undefined, { weekday: 'short' }),
            'dddd': () => date.toLocaleString(undefined, { weekday: 'long' }),
            'M': () => (date.getMonth() + 1).toString(),
            'MM': () => String(date.getMonth() + 1).padStart(2, '0'),
            'MMM': () => date.toLocaleString(undefined, { month: 'short' }),
            'MMMM': () => date.toLocaleString(undefined, { month: 'long' }),
            'yy': () => String(date.getFullYear()).slice(-2),
            'yyyy': () => String(date.getFullYear()),
            'h': () => ((date.getHours() % 12) || 12).toString(),
            'hh': () => String((date.getHours() % 12) || 12).padStart(2, '0'),
            'H': () => date.getHours().toString(),
            'HH': () => String(date.getHours()).padStart(2, '0'),
            'm': () => date.getMinutes().toString(),
            'mm': () => String(date.getMinutes()).padStart(2, '0'),
            's': () => date.getSeconds().toString(),
            'ss': () => String(date.getSeconds()).padStart(2, '0'),
            'tt': () => date.toLocaleString(undefined, { hour: 'numeric', hour12: true }).replace(/[\d\s]/g, '').trim() || (date.getHours() >= 12 ? 'PM' : 'AM'),
            'fff': () => String(date.getMilliseconds()).padStart(3, '0'),
            'z': () => {
                const off = -date.getTimezoneOffset();
                return (off < 0 ? '-' : '+') + Math.floor(Math.abs(off) / 60);
            },
            'zz': () => {
                const off = -date.getTimezoneOffset();
                return (off < 0 ? '-' : '+') + String(Math.floor(Math.abs(off) / 60)).padStart(2, '0');
            },
            'zzz': () => {
                const off = -date.getTimezoneOffset();
                return (off < 0 ? '-' : '+') + String(Math.floor(Math.abs(off) / 60)).padStart(2, '0') + ':' + String(Math.abs(off) % 60).padStart(2, '0');
            },
            'K': () => {
                const off = -date.getTimezoneOffset();
                return (off < 0 ? '-' : '+') + String(Math.floor(Math.abs(off) / 60)).padStart(2, '0') + ':' + String(Math.abs(off) % 60).padStart(2, '0');
            }
        };
        let result = '';
        let i = 0;
        while (i < format.length) {
            if (format[i] === '\'') {
                i++;
                while (i < format.length && format[i] !== '\'') {
                    result += format[i];
                    i++;
                }
                i++;
            }
            else if (format[i] === '"') {
                i++;
                while (i < format.length && format[i] !== '"') {
                    result += format[i];
                    i++;
                }
                i++;
            }
            else if (format[i] === '\\') {
                i++;
                if (i < format.length) {
                    result += format[i];
                    i++;
                }
            }
            else {
                let matched = false;
                for (let len = 4; len >= 1; len--) {
                    const specifier = format.substr(i, len);
                    if (formatMap[specifier]) {
                        result += formatMap[specifier]();
                        i += len;
                        matched = true;
                        break;
                    }
                }
                if (!matched) {
                    result += format[i];
                    i++;
                }
            }
        }
        return result;
    }
    trimTrailingPlainNewlinesFromDelta(delta) {
        if (!delta || !delta.ops || delta.ops.length === 0) {
            return { delta, removed: 0 };
        }
        const ops = delta.ops;
        const lastOp = ops[ops.length - 1];
        if (typeof lastOp.insert !== 'string') {
            return { delta, removed: 0 };
        }
        if (lastOp.attributes && Object.keys(lastOp.attributes).length > 0) {
            return { delta, removed: 0 };
        }
        const match = lastOp.insert.match(/\n+$/);
        if (!match) {
            return { delta, removed: 0 };
        }
        const removeCount = match[0].length;
        const trimmedInsert = lastOp.insert.slice(0, lastOp.insert.length - removeCount);
        const trimmedOps = ops.slice(0, ops.length - 1);
        if (trimmedInsert.length > 0) {
            trimmedOps.push(Object.assign(Object.assign({}, lastOp), { insert: trimmedInsert }));
        }
        return { delta: new Delta(trimmedOps), removed: removeCount };
    }
    toggleEditMode() {
    }
    showMoreActions() {
    }
    finishFullscreenChange() { }
    setFullscreen(_isFullscreen) { }
    setToolbarMaskActive(isActive) {
        const elem = document.querySelector('.toolbar-inner');
        if (!elem)
            return;
        if (isActive) {
            this.updateToolbarMask();
        }
        else {
            this.safeSetTimeout(() => {
                elem.style.removeProperty('mask-image');
                elem.style.removeProperty('webkit-mask-image');
            }, 50);
        }
    }
    initToolbarMask() {
        if (!this.toolbarContainer)
            return;
        const toolbarInner = this.toolbarContainer.querySelector('.toolbar-inner');
        const venusToolbarScrollable = this.toolbarContainer.querySelector('.venus-toolbar-scrollable');
        const scrollableElement = toolbarInner || venusToolbarScrollable;
        if (!scrollableElement)
            return;
        scrollableElement.addEventListener('scroll', () => {
            this.updateToolbarMask();
        });
    }
    updateToolbarMask() {
        if (!this.toolbarContainer)
            return;
        const toolbarInner = this.toolbarContainer.querySelector('.toolbar-inner');
        const venusToolbarScrollable = this.toolbarContainer.querySelector('.venus-toolbar-scrollable');
        const scrollableElement = toolbarInner || venusToolbarScrollable;
        if (!scrollableElement)
            return;
        const tolerance = 1;
        const atLeftEdge = scrollableElement.scrollLeft <= 0;
        const atRightEdge = scrollableElement.scrollLeft + scrollableElement.clientWidth + tolerance >= scrollableElement.scrollWidth;
        const createMask = (leftOffset, rightOffset) => ({
            webkit: `-webkit-linear-gradient(to right, transparent, black ${leftOffset}, black ${rightOffset}, transparent)`,
            standard: `linear-gradient(to right, transparent, black ${leftOffset}, black ${rightOffset}, transparent)`
        });
        let mask;
        if (atLeftEdge) {
            mask = createMask('0%', 'calc(100% - 25px)');
        }
        else if (atRightEdge) {
            mask = createMask('calc(0% + 25px)', '100%');
        }
        else {
            mask = createMask('calc(0% + 25px)', 'calc(100% - 25px)');
        }
        scrollableElement.style.webkitMaskImage = mask.webkit;
        scrollableElement.style.maskImage = mask.standard;
    }
    handleInlineFormatKeyboardShortcut(range, character, formatType, detectDoubled = true) {
        const currentFormats = this.notesEditor().getFormat(range.index, range.length || 1);
        if (currentFormats['code'] || currentFormats['code-block']) {
            return true;
        }
        if (detectDoubled && range.index > 0) {
            const textBefore = this.notesEditor().getText(range.index - 1, 1);
            if (textBefore === character) {
                this.notesEditor().deleteText(range.index - 1, 1, 'user');
                this.toggleBooleanFormat(formatType);
                return false;
            }
        }
        const currentLine = this.notesEditor().getLine(range.index);
        if (currentLine && currentLine[0]) {
            const line = currentLine[0];
            const lineText = line.domNode.textContent || '';
            const lineOffset = this.notesEditor().getIndex(line);
            const positionInLine = range.index - lineOffset;
            const charBefore = positionInLine > 0 ? lineText[positionInLine - 1] : '';
            const charAfter = positionInLine < lineText.length ? lineText[positionInLine] : '';
            const isValidClosing = charBefore.trim().length > 0 &&
                (charAfter.trim().length === 0 || positionInLine >= lineText.length);
            if (!isValidClosing) {
                return true;
            }
            let matchPos = -1;
            for (let i = positionInLine - 1; i >= 0; i--) {
                if (lineText[i] === character) {
                    if ((character === '*' || character === '_' || character === '~') && ((i > 0 && lineText[i - 1] === character) || (i < lineText.length - 1 && lineText[i + 1] === character))) {
                        continue;
                    }
                    const format = this.notesEditor().getFormat(lineOffset + i, 1);
                    if (!format[formatType] && !format['code-block']) {
                        const openCharBefore = i > 0 ? lineText[i - 1] : '';
                        const openCharAfter = i < lineText.length - 1 ? lineText[i + 1] : '';
                        const isValidOpening = (i === 0 || openCharBefore.trim().length === 0) &&
                            openCharAfter.trim().length > 0;
                        if (isValidOpening) {
                            matchPos = i;
                            break;
                        }
                    }
                }
            }
            if (matchPos >= 0) {
                const startIndex = lineOffset + matchPos;
                const length = range.index - startIndex - 1;
                if (length > 0) {
                    this.notesEditor().insertText(range.index, character, 'user');
                    this.notesEditor().history.cutoff();
                    this.notesEditor().deleteText(startIndex, 1, 'user');
                    if (formatType === 'code') {
                        this.removeInlineFormatsOnly(startIndex, length);
                    }
                    this.notesEditor().formatText(startIndex, length, formatType, true, 'user');
                    const isAtEndOfLine = positionInLine >= lineText.length;
                    if (isAtEndOfLine) {
                        this.notesEditor().insertText(startIndex + length, ' ', 'user');
                        this.notesEditor().formatText(startIndex + length, 1, formatType, false, 'user');
                        this.notesEditor().setSelection(startIndex + length + 1, 0, 'user');
                        this.notesEditor().deleteText(startIndex + length + 1, 1, 'user');
                    }
                    else {
                        this.notesEditor().deleteText(startIndex + length, 1, 'user');
                        this.notesEditor().setSelection(startIndex + length, 0, 'user');
                    }
                    return false;
                }
            }
        }
        return true;
    }
    handleInlineCodeKeyboardShortcut(range) {
        return this.handleInlineFormatKeyboardShortcut(range, '`', 'code');
    }
    handleStrikethroughKeyboardShortcut(range) {
        const handled = this.handleDoubleCharacterFormatKeyboardShortcut(range, '~', 'strike');
        if (!handled) {
            return false;
        }
        return this.handleInlineFormatKeyboardShortcut(range, '~', 'strike', false);
    }
    handleDoubleCharacterFormatKeyboardShortcut(range, character, formatType) {
        const currentFormats = this.notesEditor().getFormat(range.index, range.length || 1);
        if (currentFormats['code'] || currentFormats['code-block']) {
            return true;
        }
        if (range.index > 0) {
            const textBefore = this.notesEditor().getText(range.index - 1, 1);
            if (textBefore === character) {
                const currentLine = this.notesEditor().getLine(range.index);
                if (currentLine && currentLine[0]) {
                    const line = currentLine[0];
                    const lineText = line.domNode.textContent || '';
                    const lineOffset = this.notesEditor().getIndex(line);
                    const positionInLine = range.index - lineOffset;
                    const charBeforeDouble = positionInLine > 1 ? lineText[positionInLine - 2] : '';
                    const charAfter = positionInLine < lineText.length ? lineText[positionInLine] : '';
                    const isValidClosing = charBeforeDouble.trim().length > 0 &&
                        (charAfter.trim().length === 0 || positionInLine >= lineText.length);
                    if (isValidClosing) {
                        for (let i = positionInLine - 2; i >= 1; i--) {
                            if (lineText[i] === character && lineText[i - 1] === character) {
                                const format = this.notesEditor().getFormat(lineOffset + i, 1);
                                if (!format[formatType] && !format['code-block']) {
                                    const openCharBefore = i > 1 ? lineText[i - 2] : '';
                                    const openCharAfter = i + 1 < lineText.length ? lineText[i + 1] : '';
                                    const isValidOpening = (i === 1 || openCharBefore.trim().length === 0) &&
                                        openCharAfter.trim().length > 0;
                                    if (isValidOpening) {
                                        const startIndex = lineOffset + i - 1;
                                        const endIndex = range.index - 1;
                                        const length = endIndex - startIndex - 2;
                                        if (length > 0) {
                                            this.notesEditor().insertText(range.index, character, 'user');
                                            this.notesEditor().history.cutoff();
                                            this.notesEditor().deleteText(startIndex, 2, 'user');
                                            this.notesEditor().formatText(startIndex, length, formatType, true, 'user');
                                            const isAtEndOfLine = positionInLine >= lineText.length;
                                            if (isAtEndOfLine) {
                                                this.notesEditor().insertText(startIndex + length, ' ', 'user');
                                                this.notesEditor().formatText(startIndex + length, 1, formatType, false, 'user');
                                                this.notesEditor().setSelection(startIndex + length + 1, 0, 'user');
                                                this.notesEditor().deleteText(startIndex + length + 1, 2, 'user');
                                            }
                                            else {
                                                this.notesEditor().deleteText(startIndex + length, 2, 'user');
                                                this.notesEditor().setSelection(startIndex + length, 0, 'user');
                                            }
                                            return false;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        return true;
    }
    handleHighlightKeyboardShortcut(range) {
        return this.handleDoubleCharacterFormatKeyboardShortcut(range, '=', 'highlight');
    }
    handleAsteriskItalicOrBoldKeyboardShortcut(range) {
        const handled = this.handleDoubleCharacterFormatKeyboardShortcut(range, '*', 'bold');
        if (!handled) {
            return false;
        }
        return this.handleInlineFormatKeyboardShortcut(range, '*', 'italic', false);
    }
    handleUnderscoreItalicOrBoldKeyboardShortcut(range) {
        const handled = this.handleDoubleCharacterFormatKeyboardShortcut(range, '_', 'bold');
        if (!handled) {
            return false;
        }
        return this.handleInlineFormatKeyboardShortcut(range, '_', 'italic', false);
    }
    handleCodeBlockKeyboardShortcut(range, context) {
        if (context.format.code === true) {
            this.notesEditor().format('code-block', true, 'user');
            return false;
        }
        return true;
    }
    handleDividerKeyboardShortcut(range, context) {
        if (!range || !this.notesEditor)
            return true;
        const editor = this.notesEditor();
        const [line, offset] = editor.getLine(range.index);
        const lineStart = range.index - offset;
        if (offset === 2) {
            const textBefore = editor.getText(lineStart, 2);
            if (textBefore === '--') {
                editor.deleteText(lineStart, 2, 'user');
                editor.setSelection(lineStart, 0, 'user');
                this.insertHorizontalRule();
                return false;
            }
        }
        return true;
    }
    navigatePastBlockBackward(range, context, blotName, handleStacking, offsetBehavior) {
        var _a, _b;
        if (!range || !this.notesEditor) {
            return true;
        }
        const editor = this.notesEditor();
        const [currentLine, offset] = editor.getLine(range.index);
        if (!currentLine || offset !== 0) {
            return true;
        }
        const positionBefore = Math.max(range.index - 1, 0);
        const [leafBefore] = editor.getLeaf(positionBefore);
        if (!leafBefore || ((_a = leafBefore.statics) === null || _a === void 0 ? void 0 : _a.blotName) !== blotName) {
            return true;
        }
        let targetBlot = leafBefore;
        if (handleStacking) {
            let searchIndex = editor.getIndex(leafBefore) - 1;
            while (searchIndex >= 0) {
                const [candidateLine] = editor.getLine(searchIndex);
                if (!candidateLine) {
                    break;
                }
                const candidateBlotName = (_b = candidateLine.statics) === null || _b === void 0 ? void 0 : _b.blotName;
                if (candidateBlotName === blotName) {
                    targetBlot = candidateLine;
                    const candidateIndex = editor.getIndex(candidateLine);
                    searchIndex = candidateIndex - 1;
                    continue;
                }
                const candidateIndex = editor.getIndex(candidateLine);
                const candidateLength = Math.max(candidateLine.length() - 1, 0);
                const targetOffset = offsetBehavior === CursorOffsetBehavior.Preserve
                    ? Math.min(offset, candidateLength)
                    : candidateLength;
                editor.setSelection(candidateIndex + targetOffset, 0, 'user');
                return false;
            }
        }
        else {
            const blockIndex = editor.getIndex(targetBlot);
            if (blockIndex > 0) {
                const [lineAbove] = editor.getLine(blockIndex - 1);
                if (lineAbove) {
                    const lineIndex = editor.getIndex(lineAbove);
                    const lineLength = Math.max(lineAbove.length() - 1, 0);
                    editor.setSelection(lineIndex + lineLength, 0, 'user');
                    return false;
                }
            }
        }
        const blockIndex = editor.getIndex(targetBlot);
        editor.insertText(blockIndex, '\n', 'user');
        editor.setSelection(blockIndex, 0, 'user');
        return false;
    }
    moveCursorPastDividerUp(range, context) {
        return this.navigatePastBlockBackward(range, context, 'divider', true, CursorOffsetBehavior.Preserve);
    }
    navigatePastBlockForward(range, context, blotName, handleStacking, offsetBehavior) {
        var _a, _b;
        if (!range || !this.notesEditor) {
            return true;
        }
        const editor = this.notesEditor();
        const [currentLine, offset] = editor.getLine(range.index);
        if (!currentLine) {
            return true;
        }
        const lineStart = range.index - offset;
        const lineEnd = lineStart + currentLine.length();
        if (range.index < lineEnd - 1) {
            return true;
        }
        const [firstCandidate] = editor.getLine(lineEnd);
        if (!firstCandidate || ((_a = firstCandidate.statics) === null || _a === void 0 ? void 0 : _a.blotName) !== blotName) {
            return true;
        }
        let targetBlot = firstCandidate;
        if (handleStacking) {
            let searchIndex = editor.getIndex(firstCandidate) + firstCandidate.length();
            const maxLength = editor.getLength();
            while (searchIndex < maxLength) {
                const [candidateLine] = editor.getLine(searchIndex);
                if (!candidateLine) {
                    break;
                }
                const candidateBlotName = (_b = candidateLine.statics) === null || _b === void 0 ? void 0 : _b.blotName;
                if (candidateBlotName === blotName) {
                    targetBlot = candidateLine;
                    const candidateIndex = editor.getIndex(candidateLine);
                    searchIndex = candidateIndex + candidateLine.length();
                    continue;
                }
                const candidateIndex = editor.getIndex(candidateLine);
                const candidateLength = Math.max(candidateLine.length() - 1, 0);
                const targetOffset = offsetBehavior === CursorOffsetBehavior.Preserve
                    ? Math.min(offset, candidateLength)
                    : 0;
                editor.setSelection(candidateIndex + targetOffset, 0, 'user');
                return false;
            }
        }
        else {
            const blockIndex = editor.getIndex(targetBlot);
            const blockEnd = blockIndex + targetBlot.length();
            const [lineBelow] = editor.getLine(blockEnd);
            if (lineBelow) {
                const lineIndex = editor.getIndex(lineBelow);
                editor.setSelection(lineIndex, 0, 'user');
                return false;
            }
        }
        const insertIndex = this.ensureLineBelowDivider(editor, targetBlot);
        editor.setSelection(insertIndex, 0, 'user');
        return false;
    }
    moveCursorPastDividerDown(range, context) {
        return this.navigatePastBlockForward(range, context, 'divider', true, CursorOffsetBehavior.Preserve);
    }
    moveCursorPastDividerLeft(range, context) {
        return this.navigatePastBlockBackward(range, context, 'divider', true, CursorOffsetBehavior.LineEdge);
    }
    moveCursorPastDividerRight(range, context) {
        return this.navigatePastBlockForward(range, context, 'divider', true, CursorOffsetBehavior.LineEdge);
    }
    ensureLineBelowDivider(editor, dividerBlot, beforeIndex) {
        const baseIndex = editor.getIndex(dividerBlot) + dividerBlot.length();
        let insertIndex = baseIndex;
        if (beforeIndex !== undefined) {
            insertIndex = Math.max(Math.min(beforeIndex, editor.getLength() - 1), baseIndex);
        }
        editor.insertText(insertIndex, '\n', 'user');
        return insertIndex;
    }
    moveCursorPastTOCUp(range, context) {
        return this.navigatePastBlockBackward(range, context, 'table-of-contents', false, CursorOffsetBehavior.Preserve);
    }
    deleteDividerForward(range, context) {
        var _a;
        if (!range || !this.notesEditor) {
            return true;
        }
        const editor = this.notesEditor();
        const [currentLine, offset] = editor.getLine(range.index);
        if (!currentLine) {
            return true;
        }
        if (range.length > 0) {
            return true;
        }
        const lineLength = currentLine.length();
        if (offset < lineLength - 1) {
            return true;
        }
        const lineStart = range.index - offset;
        const afterLineIndex = lineStart + lineLength;
        const [nextLine] = editor.getLine(afterLineIndex);
        if (!nextLine || ((_a = nextLine.statics) === null || _a === void 0 ? void 0 : _a.blotName) !== 'divider') {
            return true;
        }
        const dividerIndex = editor.getIndex(nextLine);
        const deleteLength = Math.max(nextLine.length(), 1);
        editor.deleteText(dividerIndex, deleteLength, 'user');
        const charAfterDelete = editor.getText(dividerIndex, 1);
        if (charAfterDelete === '\n') {
            editor.deleteText(dividerIndex, 1, 'user');
        }
        editor.setSelection(range.index, 0, 'user');
        return false;
    }
    handleInsertLinkKeyboardShortcut(range, context) {
        const textBefore = this.notesEditor().getText(range.index - 1, 1);
        if (textBefore === '[') {
            this.notesEditor().deleteText(range.index - 1, 1);
            this.showInsertLinkDialog();
            return false;
        }
        return true;
    }
    handleMarkdownLinkKeyboardShortcut(range) {
        if (!range || range.length > 0 || !this.notesEditor) {
            return true;
        }
        const editor = this.notesEditor();
        const currentFormats = editor.getFormat(range.index, 1);
        if (currentFormats['code'] || currentFormats['code-block']) {
            return true;
        }
        const currentLine = editor.getLine(range.index);
        if (!currentLine || !currentLine[0]) {
            return true;
        }
        const line = currentLine[0];
        const lineText = line.domNode.textContent || '';
        const lineOffset = editor.getIndex(line);
        const positionInLine = range.index - lineOffset;
        const textBeforeCursor = lineText.substring(0, positionInLine);
        const match = textBeforeCursor.match(/\[([^\[\]]+)\]\(([^()\s]+)$/);
        if (!match) {
            return true;
        }
        const displayText = match[1];
        const url = match[2];
        const matchStartInLine = positionInLine - match[0].length;
        const isImage = matchStartInLine > 0 && lineText[matchStartInLine - 1] === '!';
        if (isImage ? !this.URL_REGEX.test(url) : !this.MARKDOWN_LINK_URL_REGEX.test(url)) {
            return true;
        }
        const markerLength = match[0].length + (isImage ? 1 : 0);
        const matchStart = lineOffset + matchStartInLine - (isImage ? 1 : 0);
        const matchFormats = editor.getFormat(matchStart, markerLength);
        if (matchFormats['link'] || matchFormats['code'] || matchFormats['code-block']) {
            return true;
        }
        editor.insertText(range.index, ')', 'user');
        editor.history.cutoff();
        editor.deleteText(matchStart, markerLength + 1, 'user');
        if (isImage) {
            editor.insertEmbed(matchStart, 'image', url, 'user');
            editor.setSelection(matchStart + 1, 0, 'user');
            return false;
        }
        editor.insertText(matchStart, displayText, { link: url }, 'user');
        const isAtEndOfLine = positionInLine >= lineText.length;
        if (isAtEndOfLine) {
            editor.insertText(matchStart + displayText.length, ' ', 'user');
            editor.formatText(matchStart + displayText.length, 1, 'link', false, 'user');
            editor.setSelection(matchStart + displayText.length + 1, 0, 'user');
        }
        else {
            editor.setSelection(matchStart + displayText.length, 0, 'user');
        }
        return false;
    }
    handleInsertMathKeyboardShortcut(range, context) {
        const textBefore = this.notesEditor().getText(range.index - 1, 1);
        if (textBefore === '$') {
            this.notesEditor().deleteText(range.index - 1, 1);
            this.insertMathExpression();
            return false;
        }
        return true;
    }
    handleLineStartMarkdownShortcut(range, context) {
        if (!range || !this.notesEditor)
            return true;
        const editor = this.notesEditor();
        const [line, offset] = editor.getLine(range.index);
        const lineStart = range.index - offset;
        const before = editor.getText(lineStart, offset);
        const headingMatch = before.match(/^#{1,6}$/);
        if (headingMatch) {
            const level = headingMatch[0].length;
            editor.insertText(range.index, ' ', 'user');
            editor.history.cutoff();
            editor.deleteText(lineStart, level + 1, 'user');
            const headingStyles = ['heading1', 'heading2', 'heading3', 'heading4', 'heading5', 'heading6'];
            this.setParagraphStyle(headingStyles[level - 1]);
            return false;
        }
        const blockquoteMatch = before.match(/^>{1,6}$/);
        if (blockquoteMatch) {
            const level = blockquoteMatch[0].length;
            const prefixLength = level;
            editor.insertText(range.index, ' ', 'user');
            editor.history.cutoff();
            editor.deleteText(lineStart, prefixLength + 1, 'user');
            editor.formatLine(lineStart, 1, 'blockquote', level, 'user');
            return false;
        }
        let alignValue;
        let hasAlignment = false;
        let alignPrefixLength = 0;
        if (before === ':-:') {
            alignValue = 'center';
            hasAlignment = true;
            alignPrefixLength = 3;
        }
        else if (before === ':--') {
            alignValue = false;
            hasAlignment = true;
            alignPrefixLength = 3;
        }
        else if (before === '--:') {
            alignValue = 'right';
            hasAlignment = true;
            alignPrefixLength = 3;
        }
        if (hasAlignment) {
            editor.insertText(range.index, ' ', 'user');
            editor.history.cutoff();
            editor.deleteText(lineStart, alignPrefixLength + 1, 'user');
            editor.formatLine(lineStart, 1, 'align', alignValue, 'user');
            return false;
        }
        let listType;
        let prefixLength = 0;
        if (before === '-') {
            listType = 'unchecked';
            prefixLength = 1;
        }
        else if (before === '*') {
            listType = 'bullet';
            prefixLength = 1;
        }
        else if (before === '+') {
            listType = 'checked';
            prefixLength = 1;
        }
        else if (before === '1.') {
            listType = 'ordered';
            prefixLength = 2;
        }
        if (listType) {
            editor.insertText(range.index, ' ', 'user');
            editor.history.cutoff();
            editor.deleteText(lineStart, prefixLength + 1, 'user');
            editor.formatLine(lineStart, 1, 'list', listType, 'user');
            return false;
        }
        return true;
    }
    handleBracketCheckboxKeyboardShortcut(range, context) {
        const trimmedPrefix = context.prefix.trim();
        let listType = null;
        if (trimmedPrefix === '[') {
            listType = 'unchecked';
        }
        else if (trimmedPrefix.toLowerCase() === '[x') {
            listType = 'checked';
        }
        if (listType) {
            const markerLength = context.prefix.length - context.prefix.indexOf('[');
            this.notesEditor().deleteText(range.index - markerLength, markerLength);
            this.notesEditor().formatLine(range.index - markerLength, 1, 'list', listType);
            return false;
        }
        return true;
    }
    exitCodeBlockUp(range, context) {
        if (!range || !this.notesEditor) {
            return true;
        }
        const editor = this.notesEditor();
        const [line, offset] = editor.getLine(range.index);
        if (offset > 0) {
            return true;
        }
        const lineStart = range.index - offset;
        if (lineStart === 0) {
            editor.insertText(0, '\n', 'user');
            editor.setSelection(0, 0, 'user');
            editor.format('code-block', false, 'user');
            return false;
        }
        return true;
    }
    exitCodeBlockDown(range, context) {
        if (!range || !this.notesEditor) {
            return true;
        }
        const editor = this.notesEditor();
        const [line, offset] = editor.getLine(range.index);
        const lineEnd = range.index - offset + line.length();
        if (range.index < lineEnd - 1) {
            return true;
        }
        if (lineEnd >= editor.getLength() - 1) {
            editor.insertText(editor.getLength() - 1, '\n', 'user');
            editor.setSelection(editor.getLength() - 1, 0, 'user');
            editor.format('code-block', false, 'user');
            return false;
        }
        return true;
    }
    exitMathUp(range, context) {
        var _a;
        if (!range || !this.notesEditor) {
            return true;
        }
        const editor = this.notesEditor();
        const [line, offset] = editor.getLine(range.index);
        const lineStart = range.index - offset;
        if (lineStart !== 0) {
            return true;
        }
        if (offset > 0) {
            return true;
        }
        const [leaf] = editor.getLeaf(range.index);
        const hasMath = leaf && ((_a = leaf.statics) === null || _a === void 0 ? void 0 : _a.blotName) === MathExpressionBlot.blotName;
        if (!hasMath) {
            return true;
        }
        editor.insertText(0, '\n', 'user');
        editor.setSelection(0, 0, 'user');
        return false;
    }
    exitMathDown(range, context) {
        var _a;
        if (!range || !this.notesEditor) {
            return true;
        }
        const editor = this.notesEditor();
        const [line, offset] = editor.getLine(range.index);
        const lineEnd = range.index - offset + line.length();
        if (range.index < lineEnd - 1) {
            return true;
        }
        if (lineEnd < editor.getLength() - 1) {
            return true;
        }
        const lineStart = range.index - offset;
        let hasMath = false;
        for (let i = lineStart; i < lineEnd; i++) {
            const [l] = editor.getLeaf(i);
            if (l && ((_a = l.statics) === null || _a === void 0 ? void 0 : _a.blotName) === MathExpressionBlot.blotName) {
                hasMath = true;
                break;
            }
        }
        if (!hasMath) {
            return true;
        }
        editor.insertText(editor.getLength() - 2, '\n', 'user');
        editor.setSelection(editor.getLength() - 2, 0, 'user');
        return false;
    }
    handleNavigateUp(range, context) {
        if (!range || !this.notesEditor) {
            return true;
        }
        if (this.activeEditor === 'cell') {
            return true;
        }
        const editor = this.notesEditor();
        const [line, offset] = editor.getLine(range.index);
        const lineStart = range.index - offset;
        if (lineStart === 0) {
            const cursorBounds = editor.getBounds(range.index);
            const lineBounds = editor.getBounds(lineStart, line.length());
            if (!cursorBounds || !lineBounds) {
                return true;
            }
            if (cursorBounds.top <= lineBounds.top + cursorBounds.height / 2) {
                const editorElement = editor.root;
                const editorRect = editorElement.getBoundingClientRect();
                const xPosition = cursorBounds ? editorRect.left + cursorBounds.left : null;
                safeInvoke(this.dotNetHelper, 'NavigateUpFromEditor', [xPosition]);
                return false;
            }
        }
        if (offset > 0) {
            const cursorBounds = editor.getBounds(range.index);
            if (cursorBounds) {
                const prevCharBounds = editor.getBounds(range.index - 1);
                if (prevCharBounds && cursorBounds.top > prevCharBounds.top + cursorBounds.height / 2) {
                    const targetTop = prevCharBounds.top;
                    const targetX = cursorBounds.left;
                    let closestOffset = range.index - 1;
                    let closestDistance = Infinity;
                    for (let i = lineStart; i < range.index; i++) {
                        const iBounds = editor.getBounds(i);
                        if (!iBounds)
                            continue;
                        if (Math.abs(iBounds.top - targetTop) > cursorBounds.height / 2)
                            continue;
                        const distance = Math.abs(iBounds.left - targetX);
                        if (distance < closestDistance) {
                            closestDistance = distance;
                            closestOffset = i;
                        }
                    }
                    editor.setSelection(closestOffset, 0, 'user');
                    return false;
                }
            }
        }
        return true;
    }
    handleNavigateLeft(range, context) {
        if (!range || !this.notesEditor) {
            return true;
        }
        if (this.activeEditor === 'cell') {
            return true;
        }
        const editor = this.notesEditor();
        if (range.index === 0) {
            safeInvoke(this.dotNetHelper, 'NavigateLeftFromEditor');
            return false;
        }
        return true;
    }
    handleNavigateDown(range, context) {
        if (!range || !this.notesEditor) {
            return true;
        }
        if (this.activeEditor === 'cell') {
            return true;
        }
        const editor = this.notesEditor();
        const [line, offset] = editor.getLine(range.index);
        const lineEnd = range.index - offset + line.length();
        const docLength = editor.getLength();
        if (lineEnd < docLength) {
            return true;
        }
        const cursorBounds = editor.getBounds(range.index);
        const lineBounds = editor.getBounds(range.index - offset, line.length());
        if (!cursorBounds || !lineBounds) {
            return true;
        }
        if (cursorBounds.bottom < lineBounds.bottom - cursorBounds.height / 2) {
            return true;
        }
        safeInvoke(this.dotNetHelper, 'NavigateDownFromEditor');
        return false;
    }
    updateToolbarState() {
        if (this.debouncedUpdateToolbarStateInternal === null) {
            this.debouncedUpdateToolbarStateInternal = debounce(this.updateToolbarStateInternal.bind(this), 100);
        }
        this.debouncedUpdateToolbarStateInternal();
    }
    updateToolbarStateInternal() {
        if (!this.notesEditor())
            return;
        const range = this.getSelectionWithFallback();
        if (!range) {
            return;
        }
        const formats = this.notesEditor().getFormat(range.index, range.length);
        this.updateParagraphDropdownToolbarState(formats);
        this.updateBooleanFormatToolbarStates(formats);
        this.updateTextColorToolbarState(formats);
        this.updateTextAlignToolbarState(formats);
        this.updateMoveLineCommandStates(range);
        this.updateTableCommandStates();
    }
    updateParagraphDropdownToolbarState(formats) {
        let paragraphStyle = 'normal';
        if (formats.header) {
            switch (formats.header) {
                case 1:
                    paragraphStyle = 'header1';
                    break;
                case 2:
                    paragraphStyle = 'header2';
                    break;
                case 3:
                    paragraphStyle = 'header3';
                    break;
                case 4:
                    paragraphStyle = 'header4';
                    break;
                case 5:
                    paragraphStyle = 'header5';
                    break;
                case 6:
                    paragraphStyle = 'header6';
                    break;
            }
        }
        else if (formats['code-block']) {
            paragraphStyle = 'code-block';
        }
        else if (formats.list === 'bullet') {
            paragraphStyle = 'list-bullet';
        }
        else if (formats.list === 'ordered') {
            paragraphStyle = 'list-ordered';
        }
        else if (formats.list === 'check' || formats.list === 'checked' || formats.list === 'unchecked') {
            paragraphStyle = 'list-check';
        }
        else {
            paragraphStyle = 'normal';
        }
        safeInvoke(this.dotNetHelper, 'UpdateParagraphStyleIconAndLabel', [paragraphStyle]);
        const stateUpdates = {
            'VenusEditor.Normal': paragraphStyle === 'normal',
            'VenusEditor.Heading1': paragraphStyle === 'header1',
            'VenusEditor.Heading2': paragraphStyle === 'header2',
            'VenusEditor.Heading3': paragraphStyle === 'header3',
            'VenusEditor.Heading4': paragraphStyle === 'header4',
            'VenusEditor.Heading5': paragraphStyle === 'header5',
            'VenusEditor.Heading6': paragraphStyle === 'header6',
            'VenusEditor.BulletList': paragraphStyle === 'list-bullet',
            'VenusEditor.OrderedList': paragraphStyle === 'list-ordered',
            'VenusEditor.CheckList': paragraphStyle === 'list-check',
            'VenusEditor.CodeBlock': paragraphStyle === 'code-block'
        };
        safeInvoke(this.dotNetHelper, 'UpdateCommandStates', [stateUpdates]);
    }
    showContextMenu(x, y, type, word, index, length) {
        safeInvoke(this.dotNetHelper, 'ShowContextMenu', [x, y, type, word, index, length]);
    }
    updateBooleanFormatToolbarStates(formats) {
        const stateUpdates = {};
        this.toolbarButtons.forEach(button => {
            if (button.isMenu || button.buttonId === 'spellcheck')
                return;
            const formatKey = button.formatKey;
            const isHighlighted = formats[formatKey] === true
                || (button.formatKey === 'link' && formats.link)
                || (button.formatKey === 'image' && formats.image);
            const isDisabled = (formats.code || formats['code-block']) && this.disabledFormatKeysWhenInCode.includes(button.formatKey)
                || formats['code-block'] && button.formatKey === 'code'
                || button.formatKey === 'undo' && this.primaryNotesEditor.history.stack.undo.length === 0
                || button.formatKey === 'redo' && this.primaryNotesEditor.history.stack.redo.length === 0 && this.notesEditor().history.stack.redo.length === 0
                || this.areCellsSelected() && this.disabledFormatKeysWhenInCell.includes(button.formatKey);
            if (button.buttonId) {
                const commandSuffix = button.buttonId
                    .replace(/-([a-z])/g, (_, c) => c.toUpperCase())
                    .replace(/^[a-z]/, c => c.toUpperCase());
                const commandId = `VenusEditor.${commandSuffix}`;
                if (button.formatKey === 'undo' || button.formatKey === 'redo') {
                    stateUpdates[commandId] = !isDisabled;
                }
                else {
                    stateUpdates[commandId] = !!isHighlighted;
                }
            }
        });
        if (Object.keys(stateUpdates).length > 0) {
            safeInvoke(this.dotNetHelper, 'UpdateCommandStates', [stateUpdates]);
        }
    }
    updateTextColorToolbarState(formats) {
        if (formats.color) {
            safeInvoke(this.dotNetHelper, 'UpdateForeColor', [formats.color]);
        }
        else {
            safeInvoke(this.dotNetHelper, 'UpdateForeColor', ['']);
        }
        if (formats.background) {
            safeInvoke(this.dotNetHelper, 'UpdateBackColor', [formats.background]);
        }
        else {
            safeInvoke(this.dotNetHelper, 'UpdateBackColor', ['']);
        }
    }
    updateTextAlignToolbarState(formats) {
        let alignStyle = 'left';
        if (formats.align) {
            alignStyle = formats.align;
        }
        safeInvoke(this.dotNetHelper, 'UpdateTextAlignIcon', [alignStyle]);
        const stateUpdates = {
            'VenusEditor.AlignLeft': alignStyle === 'left',
            'VenusEditor.AlignCenter': alignStyle === 'center',
            'VenusEditor.AlignRight': alignStyle === 'right'
        };
        safeInvoke(this.dotNetHelper, 'UpdateCommandStates', [stateUpdates]);
    }
    disposeToolbarHandlers() {
        this.toolbarListeners.forEach(({ element, event, handler }) => {
            element.removeEventListener(event, handler);
        });
        this.toolbarListeners = [];
    }
    replaceText(index, length, newText) {
        const quill = this.notesEditor();
        if (!quill)
            return;
        quill.deleteText(index, length, 'user');
        quill.insertText(index, newText, 'user');
        quill.setSelection(index + newText.length, 0, 'user');
    }
    refreshTextProcessing() {
        const quill = this.notesEditor();
        if (!quill)
            return;
        this.clearMentionInformation(quill);
        QuillExtensions.processVisibleLines(quill, this);
    }
    disposeQuillEditor() {
        var _a, _b, _c, _d, _e, _f;
        const perfTimer = NotesPerfTimer.start('disposeQuillEditor');
        if (this.primaryNotesEditor) {
            this.primaryNotesEditor.disable();
        }
        this.flushPendingAutoSave();
        if (this._visibilityChangeHandler) {
            document.removeEventListener('visibilitychange', this._visibilityChangeHandler);
            this._visibilityChangeHandler = null;
        }
        if (this._marginClickContainer && this._marginClickHandler) {
            this._marginClickContainer.removeEventListener('mousedown', this._marginClickHandler);
            this._marginClickContainer = null;
            this._marginClickHandler = null;
        }
        if (this._typingIdleTimer) {
            clearTimeout(this._typingIdleTimer);
            this._typingIdleTimer = undefined;
        }
        this._compositionPendingProcess = false;
        for (const id of this._pendingTimers) {
            clearTimeout(id);
        }
        this._pendingTimers.clear();
        this.activeInlineTooltip = null;
        if (!this.primaryNotesEditor)
            return;
        this.dotNetHelper = null;
        const toolbar = (_b = (_a = this.primaryNotesEditor.theme) === null || _a === void 0 ? void 0 : _a.modules) === null || _b === void 0 ? void 0 : _b.toolbar;
        if (toolbar === null || toolbar === void 0 ? void 0 : toolbar.container) {
            toolbar.container.remove();
        }
        if ((_d = (_c = this.primaryNotesEditor.theme) === null || _c === void 0 ? void 0 : _c.tooltip) === null || _d === void 0 ? void 0 : _d.root) {
            this.primaryNotesEditor.theme.tooltip.root.remove();
        }
        this.removeEventListenersForEditor(this.primaryNotesEditor);
        this.removeEventListenersForEditor(this.cellNotesEditor);
        const caiObserver = this.resizeObservers.get('contentAreaInner');
        if (caiObserver) {
            caiObserver.disconnect();
            this.resizeObservers.delete('contentAreaInner');
        }
        if (this.dummyInput && this.dummyInput.parentElement) {
            this.dummyInput.parentElement.removeChild(this.dummyInput);
            this.dummyInput = null;
        }
        if (this.tableResizer) {
            this.tableResizer.destroy();
            this.tableResizer = null;
        }
        for (const cellId in this.tableState.editorCache) {
            (_f = (_e = this.tableState.editorCache[cellId]).removeListener) === null || _f === void 0 ? void 0 : _f.call(_e);
            delete this.tableState.editorCache[cellId];
        }
        if (this.editorElementId) {
            const instanceIdMatch = this.editorElementId.match(/^editor-(.+)$/);
            if (instanceIdMatch && instanceIdMatch[1]) {
                const instanceId = instanceIdMatch[1];
                console.log(`[disposeQuillEditor] Removing instance: ${instanceId}`);
                editorInstances.delete(instanceId);
            }
        }
        perfTimer.stop();
        console.log('Disposed Notes Editor');
    }
    writeStaticCellHtml(cell, html) {
        const overlays = [];
        for (const child of Array.from(cell.children)) {
            if (child.classList.contains('ql-table-control')) {
                overlays.push(child);
            }
        }
        cell.innerHTML = html;
        for (const overlay of overlays) {
            cell.appendChild(overlay);
        }
    }
    applyProcessing(lineIndex, lineLength, expectedHash, processes, editorContext = 'primary', cellId) {
        var _a, _b, _c;
        if (editorContext === 'cell-static') {
            if (!cellId) {
                return;
            }
            if (this.tableState.editorCache[cellId]) {
                return;
            }
            const cell = document.getElementById(cellId);
            if (!cell) {
                return;
            }
            const result = QuillExtensions.applyTextProcessesToHtml(cell.innerHTML, processes);
            this.writeStaticCellHtml(cell, result.html);
            if (result.skipRanges.length > 0) {
                cell.dataset[MISSPELLING_SKIP_DATASET_KEY] = JSON.stringify(result.skipRanges);
            }
            else if (cell.dataset[MISSPELLING_SKIP_DATASET_KEY]) {
                delete cell.dataset[MISSPELLING_SKIP_DATASET_KEY];
            }
            return;
        }
        const quill = editorContext === 'cell'
            ? this.getCellQuillForProcessing(cellId)
            : this.primaryNotesEditor;
        if (!quill)
            return;
        if ((_a = quill.composition) === null || _a === void 0 ? void 0 : _a.isComposing)
            return;
        const text = quill.getText(lineIndex, lineLength);
        const computedHash = QuillExtensions.computeHash(text);
        if (expectedHash !== computedHash) {
            return;
        }
        const lines = quill.getLines(lineIndex, lineLength);
        if (!lines || lines.length === 0) {
            return;
        }
        const primaryLine = lines[0];
        const skipRanges = QuillExtensions.getMisspellingSkipRanges((_b = primaryLine === null || primaryLine === void 0 ? void 0 : primaryLine.domNode) !== null && _b !== void 0 ? _b : null);
        const savedScrollTop = quill.root.scrollTop;
        const isAndroid = ((_c = this.editorSettings) === null || _c === void 0 ? void 0 : _c.clientOs) == ClientOs.Android;
        const inputmodeWasSet = isAndroid && quill.root.getAttribute('inputmode') === 'none';
        const editorIsDisengaged = isAndroid && document.activeElement === quill.root && !inputmodeWasSet;
        if (editorIsDisengaged) {
            quill.root.setAttribute('inputmode', 'none');
        }
        processes.forEach(process => {
            const textStart = process.index;
            const textEnd = process.index + process.length;
            if (process.property === 'misspelling' && process.value) {
                const overlapsSkipRange = skipRanges.some(range => textStart < range.end && textEnd > range.start);
                if (overlapsSkipRange) {
                    return;
                }
                const segment = text.substring(textStart, textEnd);
                if (URL_EXACT_REGEX.test(segment) || EMAIL_EXACT_REGEX.test(segment)) {
                    return;
                }
            }
            const quillIndex = QuillExtensions.convertTextOffsetToDeltaIndex(quill, primaryLine, lineIndex, lineLength, process.index);
            if (process.property === 'mention' && process.value) {
                const formats = quill.getFormat(quillIndex, 1);
                if (formats.link) {
                    return;
                }
            }
            if (process.property === 'misspelling' && process.value) {
                const formats = quill.getFormat(quillIndex, process.length);
                if (formats.link) {
                    return;
                }
                if (this._isActivelyTyping) {
                    const sel = quill.getSelection();
                    if (sel && sel.index >= quillIndex && sel.index <= quillIndex + process.length) {
                        return;
                    }
                }
            }
            quill.formatText(quillIndex, process.length, process.property, process.value, 'silent');
        });
        quill.root.scrollTop = savedScrollTop;
    }
    applyProcessingBatch(results) {
        if (!results || results.length === 0) {
            return;
        }
        for (const r of results) {
            if (!r.cellId) {
                continue;
            }
            if (this.tableState.editorCache[r.cellId]) {
                continue;
            }
            const cell = document.getElementById(r.cellId);
            if (!cell) {
                continue;
            }
            const result = QuillExtensions.applyTextProcessesToHtml(cell.innerHTML, r.processes);
            this.writeStaticCellHtml(cell, result.html);
            if (result.skipRanges.length > 0) {
                cell.dataset[MISSPELLING_SKIP_DATASET_KEY] = JSON.stringify(result.skipRanges);
            }
            else if (cell.dataset[MISSPELLING_SKIP_DATASET_KEY]) {
                delete cell.dataset[MISSPELLING_SKIP_DATASET_KEY];
            }
        }
    }
    getCellQuillForProcessing(cellId) {
        var _a, _b;
        const resolvedId = (cellId && cellId.length > 0) ? cellId : this.tableState.activeCellId;
        if (resolvedId && ((_a = this.tableState.editorCache[resolvedId]) === null || _a === void 0 ? void 0 : _a.quill)) {
            return this.tableState.editorCache[resolvedId].quill;
        }
        if (this.cellNotesEditor) {
            const cellRoot = this.cellNotesEditor.root;
            const rootCellId = (_b = cellRoot === null || cellRoot === void 0 ? void 0 : cellRoot.dataset) === null || _b === void 0 ? void 0 : _b.tableCellId;
            if (!resolvedId || rootCellId === resolvedId) {
                return this.cellNotesEditor;
            }
        }
        return null;
    }
    setReadOnlyInternal(quill, isReadOnly, isFirstCall, isCellEditor) {
        if (!isFirstCall && quill.options.readOnly === isReadOnly) {
            return;
        }
        quill.options.readOnly = isReadOnly;
        this.editorSettings.readOnly = isReadOnly;
        this.activeInlineTooltip = null;
        this.savedPrimarySelection = null;
        this.savedCellSelection = new SavedCellSelection();
        this.hideLinkTooltip();
        quill.enable(!isReadOnly);
        if (!isCellEditor) {
            if (isReadOnly) {
                quill.root.classList.add('ql-read-only');
            }
            else {
                quill.root.classList.remove('ql-read-only');
                this.clearMentionInformation(quill);
            }
        }
        this.setEditorClasses();
        if (isReadOnly) {
            this.removeAllTableControls();
        }
    }
    removeTableControlsFromTable(table) {
        if (!table)
            return;
        this.withHistoryIgnored(() => {
            table.querySelectorAll('.ql-table-control').forEach(control => control.remove());
        });
        delete table.dataset.tbShapeKey;
    }
    removeAllTableControls() {
        if (!this.editorContainer)
            return;
        const container = this.editorContainer;
        this.withHistoryIgnored(() => {
            container.querySelectorAll('.ql-table-control').forEach(control => control.remove());
            container.querySelectorAll('table.ql-table-blot').forEach((t) => {
                delete t.dataset.tbShapeKey;
            });
        });
    }
    setEditorSettings(editorSettings) {
        var _a, _b, _c;
        if (!this.primaryNotesEditor)
            return;
        this.editorSettings = editorSettings;
        if (typeof this.editorSettings.collapseButtonVisibility !== 'number') {
            this.editorSettings.collapseButtonVisibility = OutlineCollapseButtonVisibility.OnHoverOfText;
        }
        this.reconcileAnimatedCarets();
        if (typeof editorSettings.textScalePercent === 'number') {
            this.setTextScale(editorSettings.textScalePercent);
        }
        this.setReadOnlyInternal(this.primaryNotesEditor, editorSettings.readOnly, false, false);
        this.updateCountVisibility();
        if (editorSettings.showWordCount || editorSettings.showCharacterCount) {
            this.updateTextCounts();
        }
        QuillExtensions.processVisibleLines(this.primaryNotesEditor, this);
        if (!editorSettings.doMentionProcessing) {
            this.clearMentionInformation(this.primaryNotesEditor);
        }
        if (this.imageControls) {
            this.imageControls.destroy();
            this.imageControls = null;
        }
        this.initSpellCheckState(this.primaryNotesEditor);
        this.refreshOutline();
        if (this.editorSettings.collapseButtonVisibility === OutlineCollapseButtonVisibility.Never) {
            this.collapseState.clear();
            this.applyCollapseState(false);
        }
        this.scheduleCollapseUiUpdate();
        const rootEl = (_a = this.primaryNotesEditor) === null || _a === void 0 ? void 0 : _a.root;
        if (rootEl) {
            rootEl.classList.toggle('venus-collapse-hidden-phone', this.editorSettings.isPhone && this.editorSettings.collapseButtonVisibility === OutlineCollapseButtonVisibility.Never);
        }
        if (this.editorSettings.clientOs == ClientOs.Android) {
            if ((_b = this.primaryNotesEditor) === null || _b === void 0 ? void 0 : _b.root) {
                this.primaryNotesEditor.root.setAttribute('inputmode', 'none');
            }
            if ((_c = this.cellNotesEditor) === null || _c === void 0 ? void 0 : _c.root) {
                this.cellNotesEditor.root.setAttribute('inputmode', 'none');
            }
        }
        if (this.editorSettings.clientOs == ClientOs.iOS && !window.__iosSwipeDismissInstalled) {
            window.__iosSwipeDismissInstalled = true;
            let tracking = false;
            let enteredKeyboard = false;
            let lastSelectionStr = '';
            const DISMISS_THRESHOLD_PX = 30;
            const isEditableTarget = (el) => {
                if (!el)
                    return false;
                const tag = el.tagName;
                if (tag === 'INPUT' || tag === 'TEXTAREA')
                    return true;
                if (el.isContentEditable)
                    return true;
                return false;
            };
            const getKeyboardTop = () => {
                const raw = getComputedStyle(document.documentElement).getPropertyValue('--keyboard-height').trim();
                const kbHeight = parseFloat(raw) || 0;
                return kbHeight > 0 ? window.innerHeight - kbHeight : -1;
            };
            const getSelectionSignature = () => {
                const sel = window.getSelection();
                if (!sel || sel.rangeCount === 0)
                    return '';
                const r = sel.getRangeAt(0);
                return `${r.startOffset}:${r.endOffset}:${r.collapsed}`;
            };
            document.addEventListener('touchstart', (e) => {
                var _a;
                tracking = false;
                enteredKeyboard = false;
                if (e.touches.length !== 1)
                    return;
                const kbTop = getKeyboardTop();
                if (kbTop < 0 || !isEditableTarget(document.activeElement))
                    return;
                if ((_a = e.target) === null || _a === void 0 ? void 0 : _a.closest('#venus-editor-toolbar-container'))
                    return;
                tracking = true;
                lastSelectionStr = getSelectionSignature();
            }, { capture: true, passive: true });
            document.addEventListener('touchmove', (e) => {
                if (!tracking || e.touches.length !== 1)
                    return;
                const currentSel = getSelectionSignature();
                if (currentSel !== lastSelectionStr) {
                    tracking = false;
                    return;
                }
                const touchY = e.touches[0].clientY;
                const kbTop = getKeyboardTop();
                if (kbTop < 0) {
                    tracking = false;
                    return;
                }
                if (!enteredKeyboard) {
                    if (touchY >= kbTop) {
                        enteredKeyboard = true;
                    }
                }
                if (enteredKeyboard) {
                    const depthIntoKeyboard = touchY - kbTop;
                    if (depthIntoKeyboard >= DISMISS_THRESHOLD_PX) {
                        const active = document.activeElement;
                        if (active && isEditableTarget(active)) {
                            active.blur();
                        }
                        tracking = false;
                    }
                }
            }, { capture: true, passive: true });
            const reset = () => { tracking = false; enteredKeyboard = false; lastSelectionStr = ''; };
            document.addEventListener('touchend', reset, { capture: true, passive: true });
            document.addEventListener('touchcancel', reset, { capture: true, passive: true });
        }
    }
    reconcileAnimatedCarets() {
        const want = !!this.editorSettings.animateTextCursor;
        const editors = [this.primaryNotesEditor, this.cellNotesEditor].filter(q => !!q);
        for (const quill of editors) {
            const existing = this._animatedCarets.get(quill);
            if (want && !existing) {
                this._animatedCarets.set(quill, new AnimatedCaret(quill));
            }
            else if (!want && existing) {
                existing.dispose();
                this._animatedCarets.delete(quill);
            }
        }
    }
    clearMentionInformation(targetEditor) {
        var _a, _b;
        const editor = targetEditor !== null && targetEditor !== void 0 ? targetEditor : this.primaryNotesEditor;
        if (!editor)
            return;
        editor.formatText(0, editor.getLength(), 'mention', '', 'silent');
        const lines = editor.getLines();
        for (const line of lines) {
            const domNode = line === null || line === void 0 ? void 0 : line.domNode;
            if ((_a = domNode === null || domNode === void 0 ? void 0 : domNode.dataset) === null || _a === void 0 ? void 0 : _a.processedHash) {
                delete domNode.dataset.processedHash;
            }
            if ((_b = domNode === null || domNode === void 0 ? void 0 : domNode.dataset) === null || _b === void 0 ? void 0 : _b[MISSPELLING_SKIP_DATASET_KEY]) {
                delete domNode.dataset[MISSPELLING_SKIP_DATASET_KEY];
            }
        }
        const rootNode = editor.root;
        if (rootNode) {
            const tableCells = rootNode.querySelectorAll('table.ql-table-blot td');
            tableCells.forEach(cellElement => {
                const cell = cellElement;
                const cleanedHtml = QuillExtensions.clearMentionAndMisspellingFromHtml(cell.innerHTML);
                if (cell.innerHTML !== cleanedHtml) {
                    this.writeStaticCellHtml(cell, cleanedHtml);
                }
                if (cell.dataset[CELL_PROCESSED_HASH_DATASET_KEY]) {
                    delete cell.dataset[CELL_PROCESSED_HASH_DATASET_KEY];
                }
                if (cell.dataset[MISSPELLING_SKIP_DATASET_KEY]) {
                    delete cell.dataset[MISSPELLING_SKIP_DATASET_KEY];
                }
            });
        }
    }
    getContentAsHtml() {
        if (!this.primaryNotesEditor)
            return '';
        let html = this.primaryNotesEditor.getSemanticHTML();
        html = this.removeMentionSpansAndConvertRelativeLinks(html);
        return html;
    }
    toggleCollapseAtSelection() {
        const editor = this.notesEditor();
        if (!editor) {
            return;
        }
        this.refreshOutline(editor);
        const range = this.getSelectionWithFallback();
        if (!range) {
            return;
        }
        const block = this.getNearestCollapsibleBlockForIndex(range.index);
        if (!block) {
            return;
        }
        this.toggleCollapseById(block.id, true);
    }
    collapseAll() {
        if (this.editorSettings.collapseButtonVisibility === OutlineCollapseButtonVisibility.Never) {
            return;
        }
        this.refreshOutline();
        let changed = false;
        for (const block of this.outlineBlocks) {
            if (block.isCollapsible) {
                this.collapseState.set(block.id, { isCollapsed: true });
                block.isCollapsed = true;
                changed = true;
            }
        }
        if (changed) {
            this.collapseAnimationMode = 'multi';
            this.applyCollapseState(true);
            this.scheduleCollapseUiUpdate();
        }
    }
    updateMoveLineCommandStates(rangeOverride) {
        if (!this.dotNetHelper) {
            return;
        }
        const disabledState = {
            'Notes.MoveLineUp': false,
            'Notes.MoveLineDown': false,
            'VenusEditor.MoveUp': false,
            'VenusEditor.MoveDown': false
        };
        if (this.activeEditor === 'cell') {
            safeInvoke(this.dotNetHelper, 'UpdateCommandStates', [disabledState]);
            return;
        }
        const editor = this.notesEditor();
        if (!editor) {
            safeInvoke(this.dotNetHelper, 'UpdateCommandStates', [disabledState]);
            return;
        }
        const range = rangeOverride === undefined ? this.getSelectionWithFallback() : rangeOverride;
        let canMoveUp = false;
        let canMoveDown = false;
        if (range) {
            const documentLength = editor.getLength();
            if (documentLength > 1) {
                const startLineInfo = editor.getLine(range.index);
                const startLine = startLineInfo ? startLineInfo[0] : null;
                const startOffset = startLineInfo && typeof startLineInfo[1] === 'number' ? startLineInfo[1] : 0;
                if (startLine) {
                    const blockStart = range.index - startOffset;
                    let lastIndex = range.length > 0 ? range.index + range.length - 1 : range.index;
                    if (lastIndex >= documentLength) {
                        lastIndex = documentLength - 1;
                    }
                    const endLineInfo = editor.getLine(lastIndex);
                    const endLine = endLineInfo ? endLineInfo[0] : null;
                    const endOffset = endLineInfo && typeof endLineInfo[1] === 'number' ? endLineInfo[1] : 0;
                    if (endLine) {
                        const blockEnd = lastIndex - endOffset + endLine.length();
                        const blockLength = blockEnd - blockStart;
                        if (blockLength > 0) {
                            if (blockStart > 0) {
                                const prevLineInfo = editor.getLine(blockStart - 1);
                                canMoveUp = !!(prevLineInfo && prevLineInfo[0]);
                            }
                            const afterIndex = blockStart + blockLength;
                            if (afterIndex < documentLength) {
                                const nextLineInfo = editor.getLine(afterIndex);
                                const nextLine = nextLineInfo ? nextLineInfo[0] : null;
                                if (nextLine) {
                                    canMoveDown = true;
                                }
                            }
                        }
                    }
                }
            }
        }
        const stateUpdates = {
            'Notes.MoveLineUp': canMoveUp,
            'Notes.MoveLineDown': canMoveDown,
            'VenusEditor.MoveUp': canMoveUp,
            'VenusEditor.MoveDown': canMoveDown
        };
        safeInvoke(this.dotNetHelper, 'UpdateCommandStates', [stateUpdates]);
    }
    updateTableCommandStates() {
        var _a, _b, _c, _d;
        if (!this.dotNetHelper) {
            return;
        }
        const isInTable = this.isCellEditorActive();
        const stateUpdates = {
            'Notes.Table': isInTable,
            'Notes.InsertMathematicalExpression': true,
        };
        const context = this.getTableContext();
        if (context) {
            const totalRows = context.table.rows.length;
            const totalCols = (_b = (_a = context.table.rows[0]) === null || _a === void 0 ? void 0 : _a.cells.length) !== null && _b !== void 0 ? _b : 0;
            const canMoveUp = context.rowIndex > 0;
            const canMoveDown = context.rowIndex + context.rowCount - 1 < totalRows - 1;
            const canMoveLeft = context.columnIndex > 0;
            const canMoveRight = context.columnIndex + context.columnCount - 1 < totalCols - 1;
            stateUpdates['Notes.Table.MoveCellUp'] = canMoveUp;
            stateUpdates['Notes.Table.MoveCellDown'] = canMoveDown;
            stateUpdates['Notes.Table.MoveCellLeft'] = canMoveLeft;
            stateUpdates['Notes.Table.MoveCellRight'] = canMoveRight;
            stateUpdates['Notes.Table.MoveRowUp'] = canMoveUp;
            stateUpdates['Notes.Table.MoveRowDown'] = canMoveDown;
            stateUpdates['Notes.Table.MoveColumnLeft'] = canMoveLeft;
            stateUpdates['Notes.Table.MoveColumnRight'] = canMoveRight;
            const tableAbove = TableBlot.findAdjacentTable(context.table, 'above');
            const tableBelow = TableBlot.findAdjacentTable(context.table, 'below');
            stateUpdates['Notes.Table.MergeTableAbove'] = tableAbove !== null;
            stateUpdates['Notes.Table.MergeTableBelow'] = tableBelow !== null;
        }
        else {
            stateUpdates['Notes.Table.MoveCellUp'] = false;
            stateUpdates['Notes.Table.MoveCellDown'] = false;
            stateUpdates['Notes.Table.MoveCellLeft'] = false;
            stateUpdates['Notes.Table.MoveCellRight'] = false;
            stateUpdates['Notes.Table.MoveRowUp'] = false;
            stateUpdates['Notes.Table.MoveRowDown'] = false;
            stateUpdates['Notes.Table.MoveColumnLeft'] = false;
            stateUpdates['Notes.Table.MoveColumnRight'] = false;
            stateUpdates['Notes.Table.MergeTableAbove'] = false;
            stateUpdates['Notes.Table.MergeTableBelow'] = false;
        }
        safeInvoke(this.dotNetHelper, 'UpdateCommandStates', [stateUpdates]);
        safeInvoke(this.dotNetHelper, 'UpdateTableSelectionCounts', [(_c = context === null || context === void 0 ? void 0 : context.rowCount) !== null && _c !== void 0 ? _c : 1, (_d = context === null || context === void 0 ? void 0 : context.columnCount) !== null && _d !== void 0 ? _d : 1]);
    }
    updateOutlineCommandStates(rangeOverride) {
        var _a, _b, _c, _d;
        if (!this.dotNetHelper) {
            return;
        }
        const hasCollapsible = this.outlineBlocks.some(block => block.isCollapsible);
        const anyCollapsed = this.outlineBlocks.some(block => { var _a, _b; return block.isCollapsible && ((_b = (_a = this.collapseState.get(block.id)) === null || _a === void 0 ? void 0 : _a.isCollapsed) !== null && _b !== void 0 ? _b : block.isCollapsed); });
        const anyExpanded = this.outlineBlocks.some(block => { var _a, _b; return block.isCollapsible && !((_b = (_a = this.collapseState.get(block.id)) === null || _a === void 0 ? void 0 : _a.isCollapsed) !== null && _b !== void 0 ? _b : block.isCollapsed); });
        const range = rangeOverride === undefined ? this.getSelectionWithFallback() : rangeOverride;
        let canToggle = false;
        let canCollapseHere = false;
        let canExpandHere = false;
        let targetBlock = null;
        if (range) {
            targetBlock = this.getNearestCollapsibleBlockForIndex(range.index);
            canToggle = targetBlock !== null;
        }
        if (targetBlock) {
            const isCollapsed = targetBlock.isCollapsible && ((_b = (_a = this.collapseState.get(targetBlock.id)) === null || _a === void 0 ? void 0 : _a.isCollapsed) !== null && _b !== void 0 ? _b : targetBlock.isCollapsed);
            canCollapseHere = targetBlock.isCollapsible && !isCollapsed;
            let hasCollapsedInside = false;
            for (let pos = targetBlock.outlinePosition + 1; pos <= targetBlock.outlineEndPosition; pos++) {
                const candidate = this.outlineBlocks[pos];
                if (!candidate || !candidate.isCollapsible) {
                    continue;
                }
                const candidateCollapsed = (_d = (_c = this.collapseState.get(candidate.id)) === null || _c === void 0 ? void 0 : _c.isCollapsed) !== null && _d !== void 0 ? _d : candidate.isCollapsed;
                if (candidateCollapsed) {
                    hasCollapsedInside = true;
                    break;
                }
            }
            canExpandHere = hasCollapsedInside;
        }
        const stateUpdates = {
            'Notes.CollapseAll': hasCollapsible && anyExpanded,
            'Notes.CollapseAllExceptHere': hasCollapsible,
            'Notes.CollapseHere': canCollapseHere,
            'Notes.ExpandCollapseToggle': canToggle,
            'Notes.ExpandHere': canExpandHere,
            'Notes.ExpandAll': anyCollapsed
        };
        safeInvoke(this.dotNetHelper, 'UpdateCommandStates', [stateUpdates]);
    }
    expandAll() {
        this.refreshOutline();
        if (this.collapseState.size === 0) {
            return;
        }
        this.collapseState.clear();
        for (const block of this.outlineBlocks) {
            block.isCollapsed = false;
        }
        this.collapseAnimationMode = 'multi';
        this.applyCollapseState(true);
        this.scheduleCollapseUiUpdate();
    }
    collapseAllHere() {
        if (this.editorSettings.collapseButtonVisibility === OutlineCollapseButtonVisibility.Never) {
            return;
        }
        const editor = this.notesEditor();
        if (!editor) {
            return;
        }
        this.refreshOutline(editor);
        const range = this.getSelectionWithFallback();
        if (!range) {
            return;
        }
        const block = this.getNearestCollapsibleBlockForIndex(range.index);
        if (!block) {
            return;
        }
        let changed = false;
        if (block.isCollapsible) {
            for (let pos = block.outlinePosition + 1; pos <= block.outlineEndPosition; pos++) {
                const candidate = this.outlineBlocks[pos];
                if (!candidate || !candidate.isCollapsible) {
                    continue;
                }
                const state = this.collapseState.get(candidate.id);
                if (!(state === null || state === void 0 ? void 0 : state.isCollapsed)) {
                    this.collapseState.set(candidate.id, { isCollapsed: true });
                    changed = true;
                }
                if (!candidate.isCollapsed) {
                    candidate.isCollapsed = true;
                    changed = true;
                }
            }
        }
        if (changed) {
            this.collapseAnimationMode = 'multi';
            this.applyCollapseState(true);
            this.scheduleCollapseUiUpdate();
        }
    }
    expandAllHere() {
        const editor = this.notesEditor();
        if (!editor) {
            return;
        }
        this.refreshOutline(editor);
        const range = this.getSelectionWithFallback();
        if (!range) {
            return;
        }
        const block = this.getNearestCollapsibleBlockForIndex(range.index);
        if (!block) {
            return;
        }
        let changed = false;
        if (block.isCollapsible) {
            if (this.collapseState.delete(block.id)) {
                changed = true;
            }
            if (block.isCollapsed) {
                block.isCollapsed = false;
                changed = true;
            }
            for (let pos = block.outlinePosition + 1; pos <= block.outlineEndPosition; pos++) {
                const candidate = this.outlineBlocks[pos];
                if (!candidate || !candidate.isCollapsible) {
                    continue;
                }
                if (this.collapseState.delete(candidate.id)) {
                    changed = true;
                }
                if (candidate.isCollapsed) {
                    candidate.isCollapsed = false;
                    changed = true;
                }
            }
        }
        if (changed) {
            this.collapseAnimationMode = 'multi';
            this.applyCollapseState(true);
            this.scheduleCollapseUiUpdate();
        }
    }
    collapseAllExceptSelection() {
        var _a, _b;
        if (this.editorSettings.collapseButtonVisibility === OutlineCollapseButtonVisibility.Never) {
            return;
        }
        const editor = this.notesEditor();
        if (!editor) {
            return;
        }
        this.refreshOutline(editor);
        const range = this.getSelectionWithFallback();
        if (!range) {
            return;
        }
        const selectionStartBlock = this.getOutlineBlockForIndex(range.index);
        const selectionEndBlock = range.length === 0 ? selectionStartBlock : this.getOutlineBlockForIndex(range.index + range.length - 1);
        let changed = false;
        for (const block of this.outlineBlocks) {
            if (!block.isCollapsible) {
                continue;
            }
            const overlapsSelection = this.doesBlockOverlapSelection(block, selectionStartBlock, selectionEndBlock);
            if (overlapsSelection) {
                if (this.collapseState.delete(block.id)) {
                    changed = true;
                }
                if (block.isCollapsed) {
                    block.isCollapsed = false;
                    changed = true;
                }
            }
            else {
                const alreadyCollapsed = (_b = (_a = this.collapseState.get(block.id)) === null || _a === void 0 ? void 0 : _a.isCollapsed) !== null && _b !== void 0 ? _b : block.isCollapsed;
                if (!alreadyCollapsed) {
                    this.collapseState.set(block.id, { isCollapsed: true });
                    block.isCollapsed = true;
                    changed = true;
                }
            }
        }
        if (changed) {
            this.collapseAnimationMode = 'multi';
            this.applyCollapseState(true);
            this.scheduleCollapseUiUpdate();
        }
    }
    canToggleCollapseAtSelection() {
        const editor = this.notesEditor();
        if (!editor) {
            return false;
        }
        this.refreshOutline(editor);
        const range = this.getSelectionWithFallback();
        if (!range) {
            return false;
        }
        return this.getNearestCollapsibleBlockForIndex(range.index) !== null;
    }
    hasCollapsibleBlocks() {
        this.refreshOutline();
        for (const block of this.outlineBlocks) {
            if (block.isCollapsible) {
                return true;
            }
        }
        return false;
    }
    getContentPackage() {
        const perfTimer = NotesPerfTimer.start('getContentPackage');
        if (!this.primaryNotesEditor) {
            perfTimer.stop();
            return new ContentPackage();
        }
        const quillDelta = this.primaryNotesEditor.getContents();
        perfTimer.step('getContents');
        const contentPackage = new ContentPackage();
        contentPackage.quillDelta = JSON.stringify(quillDelta);
        perfTimer.step('jsonStringify');
        contentPackage.metaData = this.metaData;
        perfTimer.withContext('ops', quillDelta.ops.length);
        perfTimer.stop();
        return contentPackage;
    }
    getMetaDataPackage() {
        const metaDataPackage = new MetaDataPackage();
        metaDataPackage.metaData = this.metaData;
        metaDataPackage.isDirty = this.isDirty;
        return metaDataPackage;
    }
    isProblematicRegexPattern(pattern) {
        if (!pattern || pattern.length === 0)
            return false;
        if (pattern.endsWith('\\'))
            return true;
        if (pattern === '\\b' || pattern === '\\B' || pattern === '^' || pattern === '$')
            return true;
        const openBrackets = (pattern.match(/\[/g) || []).length;
        const closeBrackets = (pattern.match(/\]/g) || []).length;
        if (openBrackets !== closeBrackets)
            return true;
        const openParens = (pattern.match(/\(/g) || []).length;
        const closeParens = (pattern.match(/\)/g) || []).length;
        if (openParens !== closeParens)
            return true;
        const openBraces = (pattern.match(/\{/g) || []).length;
        const closeBraces = (pattern.match(/\}/g) || []).length;
        if (openBraces !== closeBraces)
            return true;
        if (/^[*+?{]/.test(pattern))
            return true;
        if (/\\$/.test(pattern))
            return true;
        return false;
    }
    executeFindReplace(findText, replaceText, caseSensitive, wholeWord, useRegex, action) {
        const searchChanged = this.searchState.findText !== findText ||
            this.searchState.caseSensitive !== caseSensitive ||
            this.searchState.wholeWord !== wholeWord ||
            this.searchState.useRegex !== useRegex;
        if (searchChanged) {
            this.searchState.findText = findText;
            this.searchState.caseSensitive = caseSensitive;
            this.searchState.wholeWord = wholeWord;
            this.searchState.useRegex = useRegex;
            this.performSearch(findText, caseSensitive, wholeWord, useRegex);
            if (action === 'FindNext') {
                return;
            }
        }
        this.searchState.replaceText = replaceText;
        switch (action) {
            case 'FindNext':
                this.findNext();
                break;
            case 'FindPrevious':
                this.findPrevious();
                break;
            case 'Replace':
                this.replaceCurrent();
                break;
            case 'ReplaceAll':
                this.replaceAll();
                break;
            default:
                console.warn('Unknown Find/Replace action:', action);
        }
    }
    dismissFindReplaceBar() {
        const quill = this.notesEditor();
        const matches = this.searchState.matches;
        const idx = this.searchState.currentMatchIndex;
        const hasCurrentMatch = quill && idx >= 0 && idx < matches.length;
        let deltaIndex = -1;
        let deltaLength = 0;
        if (hasCurrentMatch) {
            deltaIndex = matches[idx].deltaIndex;
            deltaLength = matches[idx].deltaLength;
        }
        this.clearSearchState();
        if (quill) {
            if (hasCurrentMatch) {
                quill.setSelection(deltaIndex, deltaLength, 'user');
            }
            quill.focus();
        }
    }
    highlightSearchTerm(findText) {
        if (!findText) {
            return;
        }
        this.activeEditor = 'primary';
        const quill = this.notesEditor();
        if (!quill) {
            return;
        }
        quill.focus();
        this.searchState.findText = findText;
        this.searchState.caseSensitive = false;
        this.searchState.wholeWord = false;
        this.searchState.useRegex = false;
        this.searchState.currentMatchIndex = -1;
        this.performSearch(findText, false, false, false, true);
        if (this.searchState.matches.length === 0) {
            this.clearSearchState();
            return;
        }
        const reposition = () => {
            if (this.searchState.matches.length === 0) {
                return;
            }
            this.updateHighlights();
            this.scrollToCurrentMatch();
        };
        requestAnimationFrame(reposition);
        this.safeSetTimeout(reposition, 250);
        const clear = () => {
            quill.off('text-change', onTextChange);
            quill.root.removeEventListener('mousedown', clear);
            this.dismissResultHighlight = null;
            this.clearSearchState();
        };
        const onTextChange = (_delta, _oldDelta, source) => {
            if (source === 'user') {
                clear();
            }
        };
        quill.on('text-change', onTextChange);
        quill.root.addEventListener('mousedown', clear);
        this.dismissResultHighlight = clear;
    }
    clearResultHighlightIfShowing() {
        if (this.dismissResultHighlight) {
            this.dismissResultHighlight();
        }
    }
    clearSearchState() {
        if (this.searchRefreshTimer) {
            clearTimeout(this.searchRefreshTimer);
            this.searchRefreshTimer = null;
        }
        if (this.resizeRefreshTimer) {
            clearTimeout(this.resizeRefreshTimer);
            this.resizeRefreshTimer = null;
        }
        this.clearHighlights();
        this.searchState.findText = '';
        this.searchState.replaceText = '';
        this.searchState.caseSensitive = false;
        this.searchState.wholeWord = false;
        this.searchState.matches = [];
        this.searchState.currentMatchIndex = -1;
        this.searchState.textToDeltaMap = [];
        this.searchState.deltaToTextMap = [];
    }
    performSearch(findText, caseSensitive, wholeWord, useRegex = false, scrollToMatch = true) {
        if (!findText || !this.notesEditor())
            return;
        this.clearHighlights();
        this.searchState.matches = [];
        this.searchState.currentMatchIndex = -1;
        const delta = this.notesEditor().getContents();
        const { searchText, textToDeltaMap, deltaToTextMap } = this.buildSearchableText(delta);
        this.searchState.textToDeltaMap = textToDeltaMap;
        this.searchState.deltaToTextMap = deltaToTextMap;
        if (!searchText) {
            this.updateMatchInfo();
            return;
        }
        let flags = 'g';
        if (!caseSensitive)
            flags += 'i';
        let pattern = findText;
        if (useRegex) {
            if (this.isProblematicRegexPattern(findText)) {
                safeInvoke(this.dotNetHelper, 'ShowFindReplaceRegexError', ['Pattern appears incomplete - continue typing']);
                this.updateMatchInfo();
                return;
            }
            if (wholeWord) {
                pattern = '\\b(?:' + pattern + ')\\b';
            }
        }
        else {
            pattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            if (wholeWord) {
                pattern = '\\b' + pattern + '\\b';
            }
        }
        let regex;
        try {
            regex = new RegExp(pattern, flags);
        }
        catch (e) {
            console.warn('Invalid regex pattern:', pattern, e);
            safeInvoke(this.dotNetHelper, 'ShowFindReplaceRegexError', ['Invalid regular expression']);
            this.updateMatchInfo();
            return;
        }
        let match;
        let matchCount = 0;
        const MAX_MATCHES = 10000;
        const startTime = Date.now();
        const TIMEOUT_MS = 1000;
        while ((match = regex.exec(searchText)) !== null) {
            if (Date.now() - startTime > TIMEOUT_MS) {
                console.warn('Regex search timed out after', TIMEOUT_MS, 'ms');
                safeInvoke(this.dotNetHelper, 'ShowFindReplaceRegexError', ['Search operation timed out - pattern too complex']);
                this.updateMatchInfo();
                return;
            }
            if (++matchCount > MAX_MATCHES) {
                console.warn('Regex search found too many matches (>', MAX_MATCHES, ')');
                safeInvoke(this.dotNetHelper, 'ShowFindReplaceRegexError', ['Too many matches found - please refine your pattern']);
                this.updateMatchInfo();
                return;
            }
            const textIndex = match.index;
            const textLength = match[0].length;
            if (textLength === 0) {
                if (regex.lastIndex === textIndex) {
                    regex.lastIndex = textIndex + 1;
                }
                continue;
            }
            const deltaPosition = this.textToDeltaPosition(textIndex, textToDeltaMap);
            const deltaEndPosition = this.textToDeltaPosition(textIndex + textLength, textToDeltaMap);
            if (deltaPosition !== null && deltaEndPosition !== null) {
                this.searchState.matches.push({
                    index: textIndex,
                    length: textLength,
                    deltaIndex: deltaPosition,
                    deltaLength: deltaEndPosition - deltaPosition
                });
            }
        }
        if (this.searchState.matches.length > 0 && this.searchState.currentMatchIndex === -1) {
            const lastSelection = this.getSelectionWithFallback();
            if (lastSelection && lastSelection.index >= 0) {
                let startIndex = 0;
                for (let i = 0; i < this.searchState.matches.length; i++) {
                    if (this.searchState.matches[i].deltaIndex >= lastSelection.index) {
                        startIndex = i;
                        break;
                    }
                }
                this.searchState.currentMatchIndex = startIndex;
            }
            else {
                this.searchState.currentMatchIndex = 0;
            }
        }
        this.updateHighlights();
        this.updateMatchInfo();
        if (scrollToMatch && this.searchState.matches.length > 0) {
            this.scrollToCurrentMatch();
        }
    }
    buildSearchableText(delta) {
        let searchText = '';
        const textToDeltaMap = [];
        const deltaToTextMap = [];
        let deltaIndex = 0;
        for (const op of delta.ops) {
            if (typeof op.insert === 'string') {
                const text = op.insert;
                for (let i = 0; i < text.length; i++) {
                    textToDeltaMap.push({ textIndex: searchText.length + i, deltaIndex: deltaIndex + i });
                    deltaToTextMap.push({ deltaIndex: deltaIndex + i, textIndex: searchText.length + i });
                }
                searchText += text;
                deltaIndex += text.length;
            }
            else if (typeof op.insert === 'object') {
                textToDeltaMap.push({ textIndex: searchText.length, deltaIndex: deltaIndex });
                deltaToTextMap.push({ deltaIndex: deltaIndex, textIndex: searchText.length });
                searchText += ' ';
                deltaIndex += 1;
            }
        }
        return { searchText, textToDeltaMap, deltaToTextMap };
    }
    textToDeltaPosition(textIndex, textToDeltaMap) {
        for (let i = 0; i < textToDeltaMap.length; i++) {
            if (textToDeltaMap[i].textIndex === textIndex) {
                return textToDeltaMap[i].deltaIndex;
            }
            if (textToDeltaMap[i].textIndex > textIndex) {
                return i > 0 ? textToDeltaMap[i - 1].deltaIndex : 0;
            }
        }
        return textToDeltaMap.length > 0 ? textToDeltaMap[textToDeltaMap.length - 1].deltaIndex : null;
    }
    updateMatchInfo() {
        const currentIndex = this.searchState.currentMatchIndex >= 0 ? this.searchState.currentMatchIndex + 1 : 0;
        const totalMatches = this.searchState.matches.length;
        safeInvoke(this.dotNetHelper, 'UpdateFindReplaceMatchInfo', [currentIndex, totalMatches]);
    }
    clearHighlights() {
        this.searchState.highlightElements.forEach(el => {
            if (el.parentNode) {
                el.parentNode.removeChild(el);
            }
        });
        this.searchState.highlightElements = [];
        if (this.notesEditor()) {
            const editor = this.notesEditor();
            const highlightContainer = editor.container.querySelector('.find-replace-highlight-container');
            if (highlightContainer) {
                highlightContainer.innerHTML = '';
            }
        }
    }
    updateHighlights() {
        this.clearHighlights();
        if (!this.notesEditor() || this.searchState.matches.length === 0)
            return;
        const editor = this.notesEditor();
        let highlightContainer = editor.container.querySelector('.find-replace-highlight-container');
        if (!highlightContainer) {
            highlightContainer = document.createElement('div');
            highlightContainer.className = 'find-replace-highlight-container';
            highlightContainer.style.position = 'absolute';
            highlightContainer.style.top = '0';
            highlightContainer.style.left = '0';
            highlightContainer.style.width = '100%';
            highlightContainer.style.height = '100%';
            highlightContainer.style.pointerEvents = 'none';
            editor.container.style.position = 'relative';
            editor.container.appendChild(highlightContainer);
        }
        const scale = getScaleFactor(editor.container);
        this.searchState.matches.forEach((match, index) => {
            const bounds = editor.getBounds(match.deltaIndex, match.deltaLength);
            const isCurrentMatch = index === this.searchState.currentMatchIndex;
            const highlight = this.createHighlightElement(bounds, isCurrentMatch);
            this.searchState.highlightElements.push(highlight);
            highlight.style.position = 'absolute';
            highlight.style.left = (bounds.left / scale) + 'px';
            highlight.style.top = (bounds.top / scale) + 'px';
            highlight.style.width = (bounds.width / scale) + 'px';
            highlight.style.height = (bounds.height / scale) + 'px';
            highlight.style.pointerEvents = 'none';
            highlight.style.zIndex = '10';
            highlightContainer.appendChild(highlight);
        });
    }
    createHighlightElement(bounds, isCurrentMatch) {
        const highlight = document.createElement('div');
        highlight.className = isCurrentMatch ? 'find-replace-current' : 'find-replace-highlight';
        if (isCurrentMatch) {
            highlight.style.backgroundColor = 'rgba(255, 165, 0, 0.4)';
            highlight.style.outline = '1px solid rgba(255, 165, 0, 0.8)';
        }
        else {
            highlight.style.backgroundColor = 'rgba(255, 255, 0, 0.3)';
        }
        highlight.style.borderRadius = '2px';
        return highlight;
    }
    scrollToCurrentMatch() {
        if (this.searchState.currentMatchIndex < 0 ||
            this.searchState.currentMatchIndex >= this.searchState.matches.length ||
            !this.notesEditor())
            return;
        const currentHighlight = this.searchState.highlightElements[this.searchState.currentMatchIndex];
        if (!currentHighlight)
            return;
        currentHighlight.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
            inline: 'nearest'
        });
    }
    findNext() {
        if (this.searchState.matches.length === 0)
            return;
        this.searchState.currentMatchIndex = (this.searchState.currentMatchIndex + 1) % this.searchState.matches.length;
        this.updateHighlights();
        this.updateMatchInfo();
        this.scrollToCurrentMatch();
    }
    findPrevious() {
        if (this.searchState.matches.length === 0)
            return;
        this.searchState.currentMatchIndex = this.searchState.currentMatchIndex <= 0
            ? this.searchState.matches.length - 1
            : this.searchState.currentMatchIndex - 1;
        this.updateHighlights();
        this.updateMatchInfo();
        this.scrollToCurrentMatch();
    }
    replaceCurrent() {
        if (this.searchState.currentMatchIndex < 0 ||
            this.searchState.currentMatchIndex >= this.searchState.matches.length ||
            !this.notesEditor())
            return;
        const match = this.searchState.matches[this.searchState.currentMatchIndex];
        const editor = this.notesEditor();
        const replacementEndPosition = match.deltaIndex + this.searchState.replaceText.length;
        editor.deleteText(match.deltaIndex, match.deltaLength, 'user');
        editor.insertText(match.deltaIndex, this.searchState.replaceText, 'user');
        this.performSearch(this.searchState.findText, this.searchState.caseSensitive, this.searchState.wholeWord, this.searchState.useRegex);
        if (this.searchState.matches.length > 0) {
            let nextMatchIndex = 0;
            for (let i = 0; i < this.searchState.matches.length; i++) {
                if (this.searchState.matches[i].deltaIndex >= replacementEndPosition) {
                    nextMatchIndex = i;
                    break;
                }
            }
            this.searchState.currentMatchIndex = nextMatchIndex;
            this.updateHighlights();
            this.updateMatchInfo();
            this.scrollToCurrentMatch();
        }
    }
    replaceAll() {
        if (this.searchState.matches.length === 0 || !this.notesEditor())
            return;
        const editor = this.notesEditor();
        const sortedMatches = [...this.searchState.matches].sort((a, b) => b.deltaIndex - a.deltaIndex);
        editor.history.cutoff();
        for (const match of sortedMatches) {
            editor.deleteText(match.deltaIndex, match.deltaLength, 'user');
            editor.insertText(match.deltaIndex, this.searchState.replaceText, 'user');
        }
        editor.history.cutoff();
        this.clearSearchState();
        this.updateMatchInfo();
    }
    refreshSearchAfterEdit() {
        if (this.searchRefreshTimer) {
            clearTimeout(this.searchRefreshTimer);
        }
        this.searchRefreshTimer = setTimeout(() => {
            const currentMatch = this.searchState.currentMatchIndex >= 0 &&
                this.searchState.currentMatchIndex < this.searchState.matches.length ?
                this.searchState.matches[this.searchState.currentMatchIndex] : null;
            this.performSearch(this.searchState.findText, this.searchState.caseSensitive, this.searchState.wholeWord, this.searchState.useRegex, false);
            if (currentMatch && this.searchState.matches.length > 0) {
                let closestIndex = 0;
                let closestDistance = Number.MAX_VALUE;
                for (let i = 0; i < this.searchState.matches.length; i++) {
                    const distance = Math.abs(this.searchState.matches[i].deltaIndex - currentMatch.deltaIndex);
                    if (distance < closestDistance) {
                        closestDistance = distance;
                        closestIndex = i;
                    }
                }
                this.searchState.currentMatchIndex = closestIndex;
                this.updateHighlights();
                this.updateMatchInfo();
            }
        }, 20);
    }
    refreshSearchAfterResize() {
        if (this.searchState.findText && this.searchState.matches.length > 0) {
            if (this.resizeRefreshTimer) {
                clearTimeout(this.resizeRefreshTimer);
            }
            this.resizeRefreshTimer = setTimeout(() => {
                this.updateHighlights();
            }, 100);
        }
    }
    toggleFindReplaceBar() {
        const selectedText = this.getSelectedTextForSearch();
        safeInvoke(this.dotNetHelper, 'ToggleFindReplaceBar', [selectedText]);
    }
    refreshHighlightsForScale() {
        if (this.searchState.findText && this.searchState.matches.length > 0) {
            this.updateHighlights();
        }
    }
    exportToHtml() {
        if (!this.primaryNotesEditor) {
            return '';
        }
        const editorOuter = this.editorOuterContainer;
        if (!editorOuter) {
            const editorElement = this.primaryNotesEditor.root;
            const clonedElement = editorElement.cloneNode(true);
            return clonedElement.outerHTML;
        }
        const editorClone = editorOuter.cloneNode(true);
        const elementsToRemove = editorClone.querySelectorAll('.ql-tooltip, .ql-clipboard, .notesEditorLinkTooltip, .ql-cursor, .ql-hidden');
        elementsToRemove.forEach(el => el.remove());
        this.processImagesForExport(editorClone);
        return editorClone.outerHTML;
    }
    exportToCompleteHtml(title = 'Exported Notes', isForPdf = false, themeStyles = '', backgroundColor = '#ffffff') {
        const content = this.exportToHtml();
        let bgColor = backgroundColor || '#ffffff';
        if (this.contentAreaInner) {
            const contentStyles = window.getComputedStyle(this.contentAreaInner);
            bgColor = contentStyles.backgroundColor || backgroundColor || '#ffffff';
        }
        let textColor = '#000000';
        if (this.primaryNotesEditor) {
            const editorElement = this.primaryNotesEditor.root;
            const computedStyles = window.getComputedStyle(editorElement);
            textColor = computedStyles.color || '#000000';
        }
        const isDarkMode = document.documentElement.classList.contains('dark') ||
            document.body.classList.contains('dark') ||
            !!document.querySelector('.dark');
        const darkModeClass = isDarkMode ? ' class="dark"' : '';
        const allStyles = this.extractAllStyles();
        return `<!DOCTYPE html>
<html${darkModeClass} style="background-color: ${bgColor};">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${this.escapeHtml(title)}</title>
    <style>
        ${allStyles}

        body {
        	padding: ${isForPdf ? '0' : '2rem'};
        }

        @media print {

            * {
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
                color-adjust: exact !important;
            }

        	@page {
        		background-color: ${bgColor} !important;
        	}
        }
    </style>
</head>
<body style="background-color: ${bgColor}; color: ${textColor};">
    ${content}
</body>
</html>`;
    }
    extractAllStyles() {
        let allStyles = '';
        const fontLinks = document.querySelectorAll('link[href*="fonts.googleapis.com"]');
        fontLinks.forEach(link => {
            const href = link.href;
            if (href) {
                allStyles += `@import url('${href}');\n`;
            }
        });
        const styleElements = document.querySelectorAll('style');
        styleElements.forEach(style => {
            const styleContent = style.innerHTML;
            if (styleContent) {
                allStyles += styleContent + '\n';
            }
        });
        const styleSheets = document.styleSheets;
        for (let i = 0; i < styleSheets.length; i++) {
            try {
                const sheet = styleSheets[i];
                const rules = sheet.cssRules || sheet.rules;
                if (rules) {
                    for (let j = 0; j < rules.length; j++) {
                        const rule = rules[j];
                        if (rule.cssText) {
                            if (rule.cssText.includes('.ql-') ||
                                rule.cssText.includes('#editor') ||
                                rule.cssText.includes('.editor') ||
                                rule.cssText.includes('note') ||
                                rule.cssText.includes('font') ||
                                rule.cssText.includes('color') ||
                                rule.cssText.includes('text') ||
                                rule.cssText.includes('p ') ||
                                rule.cssText.includes('h1') ||
                                rule.cssText.includes('h2') ||
                                rule.cssText.includes('h3') ||
                                rule.cssText.includes('h4') ||
                                rule.cssText.includes('h5') ||
                                rule.cssText.includes('h6') ||
                                rule.cssText.includes('strong') ||
                                rule.cssText.includes('em') ||
                                rule.cssText.includes('ul') ||
                                rule.cssText.includes('ol') ||
                                rule.cssText.includes('li') ||
                                rule.cssText.includes('blockquote') ||
                                rule.cssText.includes('code') ||
                                rule.cssText.includes('pre') ||
                                rule.cssText.includes('table') ||
                                rule.cssText.includes('td') ||
                                rule.cssText.includes('th') ||
                                rule.cssText.includes('hr')) {
                                allStyles += rule.cssText + '\n';
                            }
                        }
                    }
                }
            }
            catch (e) {
                console.warn('Could not access stylesheet:', e);
            }
        }
        return allStyles;
    }
    processImagesForExport(element) {
        const images = element.querySelectorAll('img');
        images.forEach(img => {
            if (!img.style.maxWidth) {
                img.style.maxWidth = '100%';
            }
            if (!img.style.height) {
                img.style.height = 'auto';
            }
        });
    }
    cleanupForExport(element) {
        const editorClasses = ['ql-cursor', 'ql-tooltip', 'ql-hidden'];
        editorClasses.forEach(className => {
            const elements = element.querySelectorAll(`.${className}`);
            elements.forEach(el => el.remove());
        });
        const editableElements = element.querySelectorAll('[contenteditable]');
        editableElements.forEach(el => el.removeAttribute('contenteditable'));
        const elementsWithData = element.querySelectorAll('[data-blot-name]');
        elementsWithData.forEach(el => {
            if (el.tagName !== 'LI' || !el.hasAttribute('data-list')) {
                el.removeAttribute('data-blot-name');
            }
        });
    }
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    updateTextCounts() {
        if (!this.primaryNotesEditor || !this.dotNetHelper)
            return;
        if (!this.editorSettings.showWordCount && !this.editorSettings.showCharacterCount)
            return;
        const text = this.primaryNotesEditor.getText();
        const textLength = text.length;
        let wordCount = 0;
        let isWordCountEstimated = false;
        if (this.editorSettings.showWordCount) {
            if (textLength > 50000) {
                isWordCountEstimated = true;
                const sampleSize = Math.min(5000, textLength);
                const sample = text.substring(0, sampleSize);
                let sampleWordCount = 0;
                let inWord = false;
                for (let i = 0; i < sampleSize; i++) {
                    const char = sample[i];
                    const isWordChar = !this.isBreakingOrWhitespace(char);
                    if (isWordChar && !inWord) {
                        sampleWordCount++;
                        inWord = true;
                    }
                    else if (!isWordChar && inWord) {
                        inWord = false;
                    }
                }
                const avgCharsPerWord = sampleSize / Math.max(1, sampleWordCount);
                wordCount = Math.round(textLength / avgCharsPerWord);
            }
            else {
                let inWord = false;
                for (let i = 0; i < textLength; i++) {
                    const char = text[i];
                    const isWordChar = !this.isBreakingOrWhitespace(char);
                    if (isWordChar && !inWord) {
                        wordCount++;
                        inWord = true;
                    }
                    else if (!isWordChar && inWord) {
                        inWord = false;
                    }
                }
            }
        }
        let characterCount = 0;
        if (this.editorSettings.showCharacterCount) {
            characterCount = Math.max(0, textLength - 1);
        }
        safeInvoke(this.dotNetHelper, 'UpdateTextCounts', [wordCount, characterCount, isWordCountEstimated]);
    }
    isBreakingOrWhitespace(char) {
        if (char === ' ' || char === '\t' || char === '\n' || char === '\r') {
            return true;
        }
        if (VenusEditor.punctuationSet.has(char) && !VenusEditor.joiningSet.has(char)) {
            return true;
        }
        return false;
    }
    scheduleCountUpdate() {
        if (this.updateCountsTimer) {
            clearTimeout(this.updateCountsTimer);
        }
        this.updateCountsTimer = setTimeout(() => {
            this.updateTextCounts();
        }, 500);
    }
    scheduleAutoSave() {
        if (this.autoSaveTimer) {
            clearTimeout(this.autoSaveTimer);
        }
        this.autoSaveTimer = setTimeout(() => {
            if (this.isDirty) {
                this.safeSetTimeout(() => {
                    const contentPackage = this.getContentPackage();
                    safeInvoke(this.dotNetHelper, 'StartAutoSave', [contentPackage.quillDelta, contentPackage.metaData]);
                    console.log('Notes auto-save started');
                }, 0);
                this.isDirty = false;
            }
        }, this.autoSaveIdleDelay);
    }
    flushPendingAutoSave() {
        if (this.autoSaveTimer) {
            clearTimeout(this.autoSaveTimer);
            this.autoSaveTimer = undefined;
        }
        if (this.isDirty && this.dotNetHelper && this.primaryNotesEditor) {
            const perfTimer = NotesPerfTimer.start('flushPendingAutoSave');
            try {
                const contentPackage = this.getContentPackage();
                perfTimer.step('getContentPackage');
                safeInvoke(this.dotNetHelper, 'StartAutoSave', [contentPackage.quillDelta, contentPackage.metaData]);
                perfTimer.stop();
                console.log('Notes auto-save flushed (pending save)');
                this.isDirty = false;
            }
            catch (e) {
                perfTimer.stop();
                console.warn('Failed to flush auto-save:', e);
            }
        }
    }
    updateCountVisibility() {
        if (this.editorSettings) {
            safeInvoke(this.dotNetHelper, 'UpdateCountVisibility', [this.editorSettings.showWordCount,
                this.editorSettings.showCharacterCount]);
        }
    }
}
VenusEditor.lineFormatKeys = ['list', 'header', 'blockquote', 'code-block', 'indent', 'align'];
VenusEditor.punctuationChars = '""\'\"«»`~!@#$%^&*()-_=+[]{}\\|;:\',<.>/?–—\u00a0';
VenusEditor.punctuationSet = new Set(VenusEditor.punctuationChars.split(''));
VenusEditor.joiningSet = new Set(['\u2019', '\'']);
class ContentPackage {
    constructor() {
        this.quillDelta = "";
        this.metaData = "";
    }
}
class MetaDataPackage {
    constructor() {
        this.metaData = "";
        this.isDirty = false;
    }
}
class SavedCellSelection {
    constructor() {
        this.cellId = null;
        this.cellSelection = null;
    }
}
class ToolbarButton {
    constructor() {
        this.formatValue = null;
        this.buttonId = '';
        this.formatKey = '';
        this.formatValue = null;
        this.isMenu = false;
    }
}
var EditorMode;
(function (EditorMode) {
    EditorMode[EditorMode["Normal"] = 0] = "Normal";
    EditorMode[EditorMode["Split"] = 1] = "Split";
    EditorMode[EditorMode["StyledMarkdown"] = 2] = "StyledMarkdown";
    EditorMode[EditorMode["RawMarkdown"] = 3] = "RawMarkdown";
})(EditorMode || (EditorMode = {}));
var ClientOs;
(function (ClientOs) {
    ClientOs[ClientOs["Other"] = 0] = "Other";
    ClientOs[ClientOs["Android"] = 1] = "Android";
    ClientOs[ClientOs["iOS"] = 2] = "iOS";
})(ClientOs || (ClientOs = {}));
var OutlineCollapseButtonVisibility;
(function (OutlineCollapseButtonVisibility) {
    OutlineCollapseButtonVisibility[OutlineCollapseButtonVisibility["Minimally"] = 0] = "Minimally";
    OutlineCollapseButtonVisibility[OutlineCollapseButtonVisibility["OnHoverOfText"] = 1] = "OnHoverOfText";
    OutlineCollapseButtonVisibility[OutlineCollapseButtonVisibility["Always"] = 2] = "Always";
    OutlineCollapseButtonVisibility[OutlineCollapseButtonVisibility["Never"] = 3] = "Never";
})(OutlineCollapseButtonVisibility || (OutlineCollapseButtonVisibility = {}));
class NotesEditorSettings {
    constructor() {
        this.isStandalone = false;
        this.readOnly = false;
        this.pasteWithoutFormattingAsDefault = false;
        this.defaultEditMode = EditorMode.Normal;
        this.clientOs = ClientOs.Other;
        this.doMentionProcessing = false;
        this.isSpellCheckEnabled = false;
        this.useCustomDateTimeFormat = false;
        this.customDateTimeFormat = '';
        this.excludeColorInformationWhenPasting = true;
        this.excludeFontInformationWhenPasting = true;
        this.showWordCount = true;
        this.showCharacterCount = false;
        this.replaceUrlWithPageTitle = false;
        this.textScalePercent = 100;
        this.lineHeight = 1.2;
        this.collapseButtonVisibility = OutlineCollapseButtonVisibility.OnHoverOfText;
        this.placeholderText = '';
        this.isDeku = false;
        this.isPhone = false;
        this.isTablet = false;
        this.animateTextCursor = false;
    }
}
const ParchmentEmbedBlot = Parchment.EmbedBlot;
class LineBreakBlot extends ParchmentEmbedBlot {
    length() {
        return 1;
    }
}
LineBreakBlot.blotName = 'linebreak';
LineBreakBlot.tagName = 'BR';
LineBreakBlot.className = 'ql-line-break';
class DividerBlot extends BlockEmbed {
    static create(value) {
        const node = super.create();
        node.setAttribute('contenteditable', 'false');
        node.setAttribute('data-type', value);
        return node;
    }
    static value(node) {
        var _a;
        return (_a = node.getAttribute('data-type')) !== null && _a !== void 0 ? _a : 'hr';
    }
}
DividerBlot.blotName = 'divider';
DividerBlot.tagName = 'hr';
class MathExpressionBlot extends Embed {
    static create(value) {
        const node = super.create();
        node.setAttribute('contenteditable', 'false');
        node.style.fontSize = '125%';
        MathExpressionBlot.renderMath(node, typeof value === 'string' ? value : '');
        return node;
    }
    static value(domNode) {
        var _a;
        return (_a = domNode.getAttribute('data-math-source')) !== null && _a !== void 0 ? _a : '';
    }
    format(name, value) {
        if (name === MathExpressionBlot.blotName) {
            MathExpressionBlot.renderMath(this.domNode, typeof value === 'string' ? value : '');
        }
        else {
            super.format(name, value);
        }
    }
    static renderMath(node, value) {
        const mathSource = typeof value === 'string' ? value : '';
        node.setAttribute('data-math-source', mathSource);
        typesetMathIntoNode(node, mathSource);
    }
}
MathExpressionBlot.blotName = 'math';
MathExpressionBlot.className = 'ql-math';
MathExpressionBlot.tagName = 'span';
class MentionStatusBlot extends Inline {
    static create(value) {
        let node = super.create();
        node.setAttribute('data-mention-status', value);
        return node;
    }
    static formats(node) {
        return node.getAttribute('data-mention-status');
    }
}
MentionStatusBlot.blotName = 'mention-status';
MentionStatusBlot.tagName = 'span';
class MentionBlot extends Inline {
    static create(id) {
        let node = super.create();
        if (id) {
            node.setAttribute('data-mention', id);
        }
        return node;
    }
    static formats(node) {
        return node.getAttribute('data-mention');
    }
}
MentionBlot.blotName = 'mention';
MentionBlot.className = 'mentioned-thought';
MentionBlot.tagName = 'span';
class MisspellingBlot extends Inline {
    static create(value) {
        let node = super.create();
        return node;
    }
    static formats(node) {
        return '';
    }
}
MisspellingBlot.blotName = 'misspelling';
MisspellingBlot.className = 'misspelled-word';
MisspellingBlot.tagName = 'span';
class HighlightBlot extends Inline {
    static create(value) {
        let node = super.create();
        return node;
    }
    static formats(node) {
        return true;
    }
}
HighlightBlot.blotName = 'highlight';
HighlightBlot.tagName = 'mark';
HighlightBlot.className = 'highlight';
class MultiLevelBlockquoteBlot extends Block {
    static create(value) {
        const node = super.create();
        if (typeof value === 'number') {
            node.setAttribute('data-level', value.toString());
            node.style.marginLeft = `${value * 2}rem`;
        }
        return node;
    }
    static formats(domNode) {
        const levelAttr = domNode.getAttribute('data-level');
        return levelAttr ? parseInt(levelAttr, 10) : 1;
    }
    format(name, value) {
        if (name === MultiLevelBlockquoteBlot.blotName && value) {
            this.domNode.setAttribute('data-level', value.toString());
            this.domNode.style.marginLeft = `${value * 2}rem`;
        }
        else {
            super.format(name, value);
        }
    }
}
MultiLevelBlockquoteBlot.blotName = 'blockquote';
MultiLevelBlockquoteBlot.tagName = 'blockquote';
function extractHeadings(quill) {
    const delta = quill.getContents();
    const headings = [];
    let headingIndex = 0;
    let currentLineText = '';
    let documentPosition = 0;
    let lineStartPosition = 0;
    for (const op of delta.ops) {
        if (op.insert && typeof op.insert === 'string') {
            const parts = op.insert.split('\n');
            for (let i = 0; i < parts.length; i++) {
                if (i > 0) {
                    if (op.attributes && op.attributes.header) {
                        const level = op.attributes.header;
                        const trimmedText = currentLineText.trim();
                        if (trimmedText.length > 0 && !trimmedText.endsWith('\u200B') && !trimmedText.endsWith('\u200C')) {
                            headings.push({
                                level: level,
                                text: trimmedText,
                                index: headingIndex++,
                                position: lineStartPosition
                            });
                        }
                    }
                    documentPosition++;
                    lineStartPosition = documentPosition;
                    currentLineText = parts[i];
                    documentPosition += parts[i].length;
                }
                else {
                    currentLineText += parts[i];
                    documentPosition += parts[i].length;
                }
            }
        }
        else {
            documentPosition++;
        }
    }
    return headings;
}
function getEditorForTOC(tocElement) {
    const editorElement = tocElement.closest('[id^="editor-"]');
    if (editorElement) {
        const editorId = editorElement.id;
        const instanceId = editorId.replace('editor-', '');
        return getEditorInstance(instanceId) || null;
    }
    return null;
}
class TableOfContentsBlot extends BlockEmbed {
    static create(value) {
        const node = super.create(value);
        node.setAttribute('contenteditable', 'false');
        node.setAttribute('data-toc', 'true');
        const container = document.createElement('div');
        container.className = 'ql-toc-container';
        container.innerHTML = '<div class="ql-toc-items"></div>';
        node.appendChild(container);
        return node;
    }
    static value(node) {
        return 'toc';
    }
    static generateTOCItemsHtml(headings, useAnchors = false) {
        if (headings.length === 0) {
            return '';
        }
        const minLevel = Math.min(...headings.map(h => h.level));
        const items = [];
        for (const heading of headings) {
            const relativeLevel = heading.level - minLevel;
            const indent = relativeLevel * 1.5;
            const isBold = relativeLevel === 0;
            const div = document.createElement('div');
            div.textContent = heading.text;
            const text = div.innerHTML;
            const style = `margin-left: ${indent}rem;${useAnchors ? '' : ' cursor: pointer;'}`;
            const className = `ql-toc-item ql-toc-item-level-${relativeLevel}${isBold ? ' ql-toc-item-bold' : ''}`;
            if (useAnchors) {
                const anchorId = this.generateAnchorId(heading.text);
                items.push(`<div class="${className}" style="${style}"><a href="#${anchorId}">${text}</a></div>`);
            }
            else {
                items.push(`<div class="${className}" style="${style}" data-heading-index="${heading.index}" data-heading-position="${heading.position}">${text}</div>`);
            }
        }
        return items.join('');
    }
    static generateAnchorId(text) {
        if (!text) {
            return 'heading';
        }
        let id = text.toLowerCase();
        id = id.replace(/[*_`\[\]()]+/g, '');
        id = id.replace(/[^\w]+/g, '-');
        id = id.replace(/-+/g, '-').replace(/^-+|-+$/g, '');
        if (!id) {
            id = 'heading';
        }
        return id;
    }
    updateContent(headings) {
        let itemsContainer = this.domNode.querySelector('.ql-toc-items');
        if (!itemsContainer) {
            const container = document.createElement('div');
            container.className = 'ql-toc-container';
            container.innerHTML = '<div class="ql-toc-items"></div>';
            this.domNode.innerHTML = '';
            this.domNode.appendChild(container);
            itemsContainer = this.domNode.querySelector('.ql-toc-items');
        }
        if (headings.length === 0) {
            itemsContainer.innerHTML = '';
            return;
        }
        itemsContainer.innerHTML = TableOfContentsBlot.generateTOCItemsHtml(headings, false);
        this.attachClickHandlers();
    }
    attachClickHandlers() {
        const items = this.domNode.querySelectorAll('.ql-toc-item');
        items.forEach((item) => {
            item.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                const position = parseInt(item.getAttribute('data-heading-position') || '0', 10);
                const editor = getEditorForTOC(this.domNode);
                if (!editor) {
                    console.warn('[TableOfContentsBlot] Could not find editor instance');
                    return;
                }
                const quill = editor.notesEditor();
                if (!quill)
                    return;
                quill.setSelection(position, 0, 'silent');
                setTimeout(() => {
                    const [line] = quill.getLine(position);
                    if (line && line.domNode) {
                        line.domNode.scrollIntoView({
                            behavior: 'smooth',
                            block: 'center',
                            inline: 'nearest'
                        });
                    }
                }, 0);
            });
        });
    }
}
TableOfContentsBlot.blotName = 'table-of-contents';
TableOfContentsBlot.tagName = 'div';
TableOfContentsBlot.className = 'ql-toc';
function getEditorForImage(image) {
    const editor = imageToEditorMap.get(image);
    if (editor) {
        return editor;
    }
    const editorElement = image.closest('[id^="editor-"]');
    if (editorElement) {
        const editorId = editorElement.id;
        const instanceId = editorId.replace('editor-', '');
        const foundEditor = getEditorInstance(instanceId);
        if (foundEditor) {
            imageToEditorMap.set(image, foundEditor);
            return foundEditor;
        }
    }
    return null;
}
function setEditorForImage(image, editor) {
    imageToEditorMap.set(image, editor);
}
class ResizableImage extends Image {
    static create(value) {
        let actualUrl = value;
        let zoom = null;
        let width = null;
        if (typeof value === 'string' && value.includes('#$')) {
            const paramStartIndex = value.indexOf('#$');
            const actualUrl = value.substring(0, paramStartIndex);
            const paramString = value.substring(paramStartIndex);
            const paramRegex = /#\$([^$]+)\$/g;
            let match;
            while ((match = paramRegex.exec(paramString)) !== null) {
                const param = match[1];
                if (param.startsWith('width=')) {
                    const widthValue = param.substring(6);
                    if (widthValue.endsWith('p')) {
                        const percentage = widthValue.substring(0, widthValue.length - 1);
                        let num = Number(percentage) / 100;
                        zoom = `${num}`;
                    }
                    else {
                        width = widthValue;
                    }
                }
            }
        }
        const node = super.create(actualUrl);
        node.style.maxWidth = '100%';
        node.classList.add('cursor-default');
        if (zoom) {
            setImageScale(node, parseFloat(zoom));
        }
        else if (width) {
            node.style.width = width;
        }
        node.addEventListener('click', (event) => {
            const editor = getEditorForImage(node);
            if (!editor) {
                console.warn('[ResizableImage] Could not find editor for image', node);
                return;
            }
            const quill = editor.notesEditor();
            if (quill) {
                const imageBlot = Quill.find(node);
                if (imageBlot) {
                    const index = quill.getIndex(imageBlot);
                    quill.setSelection(index, 1, 'user');
                }
            }
            if (editor.imageControls) {
                editor.imageControls.destroy();
            }
            if (editor.editorSettings.clientOs != ClientOs.iOS && editor.editorSettings.clientOs != ClientOs.Android) {
                if (!editor.editorSettings.readOnly) {
                    editor.imageControls = new ImageControls(node);
                }
            }
        });
        return node;
    }
    static value(node) {
        let src = node.getAttribute('src');
        if (src && src.includes('#$')) {
            src = src.substring(0, src.indexOf('#$'));
        }
        const scale = getImageScale(node);
        if (scale !== 1) {
            let scalePercent = Math.round(scale * 100);
            src += '#$width=' + scalePercent + 'p$';
        }
        else if (node.style.width && !node.getAttribute('data-scale')) {
            let widthString = node.style.width;
            src += '#$width=' + widthString + '$';
        }
        return src;
    }
}
class TableState {
    constructor() {
        this.ignoreNextSelectionChange = false;
        this.editorCache = {};
        this.lastTableWithSelection = null;
    }
}
const tableToEditorMap = new WeakMap();
const imageToEditorMap = new WeakMap();
class TableBlot extends BlockEmbed {
    static hashCellContent(cell) {
        const clone = cell.cloneNode(true);
        this.removeControlsFromCell(clone);
        return QuillExtensions.computeHash(clone.innerHTML);
    }
    static storeCellDelta(cell, delta) {
        this.cellDeltas.set(cell, { delta, contentHash: this.hashCellContent(cell) });
    }
    static readCellDelta(cell) {
        const entry = this.cellDeltas.get(cell);
        if (!entry)
            return null;
        if (entry.contentHash !== this.hashCellContent(cell)) {
            this.cellDeltas.delete(cell);
            return null;
        }
        return entry.delta;
    }
    static getEditorForTable(table) {
        const editor = tableToEditorMap.get(table);
        if (editor) {
            return editor;
        }
        const editorElement = table.closest('[id^="editor-"]');
        if (editorElement) {
            const editorId = editorElement.id;
            const instanceId = editorId.replace('editor-', '');
            const foundEditor = getEditorInstance(instanceId);
            if (foundEditor) {
                tableToEditorMap.set(table, foundEditor);
                return foundEditor;
            }
        }
        throw new Error('[TableBlot.getEditorForTable] Could not find editor instance for table - table may not be properly registered');
    }
    static setEditorForTable(table, editor) {
        tableToEditorMap.set(table, editor);
    }
    static create(value) {
        const node = super.create();
        node.setAttribute('contenteditable', 'false');
        node.classList.add('ql-table-blot');
        node.style.textAlign = 'unset';
        const tableData = JSON.parse(value);
        const colgroup = document.createElement('colgroup');
        node.appendChild(colgroup);
        for (let i = 0; i < tableData.columns; i++) {
            const col = document.createElement('col');
            colgroup.appendChild(col);
        }
        for (let rowNum = 0; rowNum < tableData.rows; rowNum++) {
            const row = node.insertRow();
            for (let colNum = 0; colNum < tableData.columns; colNum++) {
                const cell = row.insertCell();
                const deltaJson = tableData.cells[rowNum][colNum];
                try {
                    const delta = JSON.parse(deltaJson);
                    const html = QuillExtensions.convertDeltaToHtml(delta);
                    cell.innerHTML = html || '<p><br></p>';
                    this.storeCellDelta(cell, delta);
                }
                catch (error) {
                    console.error('Error parsing delta JSON:', error);
                    cell.innerHTML = '<p><br></p>';
                }
            }
        }
        TableBlot.setupTableClickDelegation(node);
        new TableCellDragHandler(node, TableBlot.tableSelectionChangeListener);
        return node;
    }
    static handleDeleteOrBackspace(editor) {
        if (editor.tableState.lastTableWithSelection) {
            const table = editor.tableState.lastTableWithSelection;
            const ts = TableBlot.getTableSelection(table);
            if (ts.startRow === -1 || ts.startCol === -1 || ts.endRow === -1 || ts.endCol === -1) {
                return true;
            }
            const isWholeRowSelected = ts.startCol === 0 && ts.endCol === table.rows[ts.startRow].cells.length - 1;
            const isWholeColumnSelected = ts.startRow === 0 && ts.endRow === table.rows.length - 1;
            const isWholeTableSelected = isWholeRowSelected && isWholeColumnSelected;
            if (isWholeTableSelected) {
                const tableEditor = this.getEditorForTable(table);
                tableEditor.cutoffPrimaryHistory();
                tableEditor.isStructuralTableOperation = true;
                try {
                    table.remove();
                }
                finally {
                    tableEditor.flushPrimaryEditorMutations();
                    tableEditor.isStructuralTableOperation = false;
                    tableEditor.scheduleProcessVisibleLines();
                }
                return false;
            }
            if (isWholeRowSelected) {
                const minRow = ts.endRow > ts.startRow ? ts.startRow : ts.endRow;
                const maxRow = ts.endRow > ts.startRow ? ts.endRow : ts.startRow;
                const count = maxRow - minRow + 1;
                this.performUndoableOperation(table, () => {
                    for (let i = 0; i < count; i++) {
                        table.deleteRow(minRow);
                    }
                });
                return;
            }
            if (isWholeColumnSelected) {
                const minCol = ts.endCol > ts.startCol ? ts.startCol : ts.endCol;
                const maxCol = ts.endCol > ts.startCol ? ts.endCol : ts.startCol;
                const count = maxCol - minCol + 1;
                this.performUndoableOperation(table, () => {
                    for (let i = 0; i < count; i++) {
                        this.deleteColumnInternal(table, minCol);
                    }
                });
                return;
            }
            const cells = TableBlot.getSelectedCells(table);
            if (editor.isCellEditorActive()) {
                editor.notesEditor().deleteText(0, editor.notesEditor().getLength(), 'api');
            }
            cells.forEach(cell => {
                if (cell.id !== editor.tableState.activeCellId) {
                    cell.innerHTML = '<p><br></p>';
                }
            });
            delete table.dataset.tbShapeKey;
            TableBlot.setupTableControls(table);
            return false;
        }
        return true;
    }
    static setTableSelection(table, startCell, endCell, skipActivateCell = false) {
        const editor = TableBlot.getEditorForTable(table);
        if (startCell !== null && endCell != null) {
            const startRow = startCell.parentElement.rowIndex;
            const startCol = startCell.cellIndex;
            const endRow = endCell.parentElement.rowIndex;
            const endCol = endCell.cellIndex;
            table.dataset.selectionStartRow = startRow.toString();
            table.dataset.selectionStartCol = startCol.toString();
            table.dataset.selectionEndRow = endRow.toString();
            table.dataset.selectionEndCol = endCol.toString();
            editor.tableState.lastTableWithSelection = table;
            if (!editor.tableState.activeCellId && !skipActivateCell) {
                const cellQuill = TableBlot.activateCell(startCell, editor);
                if (cellQuill === null || cellQuill === void 0 ? void 0 : cellQuill.root) {
                    cellQuill.root.style.removeProperty('color');
                    cellQuill.root.style.removeProperty('background-color');
                }
                TableBlot.setupTableControls(table);
            }
            else if (skipActivateCell) {
                TableBlot.setupTableControls(table);
            }
        }
        else {
            if (table.dataset.selectionStartRow || table.dataset.selectionStartCol || table.dataset.selectionEndRow || table.dataset.selectionEndCol) {
                delete table.dataset.selectionStartRow;
                delete table.dataset.selectionStartCol;
                delete table.dataset.selectionEndRow;
                delete table.dataset.selectionEndCol;
            }
            editor.tableState.lastTableWithSelection = null;
        }
        this.updateTableSelectionDiv(table);
        editor.updateToolbarState();
    }
    static getSelectionStartCell(table) {
        var _a;
        const ts = TableBlot.getTableSelection(table);
        if (ts.startRow === -1 || ts.startCol === -1) {
            return null;
        }
        return ((_a = table.rows[ts.startRow]) === null || _a === void 0 ? void 0 : _a.cells[ts.startCol]) || null;
    }
    static getSelectionEndCell(table) {
        var _a;
        const ts = TableBlot.getTableSelection(table);
        if (ts.endRow === -1 || ts.endCol === -1) {
            return null;
        }
        return ((_a = table.rows[ts.endRow]) === null || _a === void 0 ? void 0 : _a.cells[ts.endCol]) || null;
    }
    static updateTableSelectionDiv(table) {
        var _a, _b, _c, _d;
        const editor = TableBlot.getEditorForTable(table);
        const ts = TableBlot.getTableSelection(table);
        const startCell = ts.startRow !== -1 && ts.startCol !== -1 ? (_a = table.rows[ts.startRow]) === null || _a === void 0 ? void 0 : _a.cells[ts.startCol] : null;
        const endCell = ts.endRow !== -1 && ts.endCol !== -1 ? (_b = table.rows[ts.endRow]) === null || _b === void 0 ? void 0 : _b.cells[ts.endCol] : null;
        const cellSelectionDiv = table.querySelector('.ql-table-cell-selection');
        if (!startCell || !endCell) {
            if (cellSelectionDiv) {
                cellSelectionDiv.style.left = '0px';
                cellSelectionDiv.style.top = '0px';
                cellSelectionDiv.style.width = '0px';
                cellSelectionDiv.style.height = '0px';
                cellSelectionDiv.style.color = 'transparent';
            }
            (_c = editor.tableResizer) === null || _c === void 0 ? void 0 : _c.resumeResizing();
            return;
        }
        if (!cellSelectionDiv) {
            console.error('Failed to find table cell selection element');
        }
        if (cellSelectionDiv) {
            const startRect = startCell.getBoundingClientRect();
            const endRect = endCell.getBoundingClientRect();
            const left = Math.min(startRect.x, endRect.x) - 1;
            const top = Math.min(startRect.y, endRect.y) - 1;
            const right = Math.max(startRect.right, endRect.right) - 1;
            const bottom = Math.max(startRect.bottom, endRect.bottom) - 1;
            const table = startCell.closest('table');
            const tableRect = table.getBoundingClientRect();
            const scale = getScaleFactor(table);
            cellSelectionDiv.style.left = `${(left - tableRect.left) / scale}px`;
            cellSelectionDiv.style.top = `${(top - tableRect.top) / scale}px`;
            cellSelectionDiv.style.width = `${(right - left) / scale}px`;
            cellSelectionDiv.style.height = `${(bottom - top) / scale}px`;
        }
        else {
            console.warn('ql-table-cell-selection element not found - selection will not be visible');
        }
        (_d = editor.tableResizer) === null || _d === void 0 ? void 0 : _d.pauseResizing();
    }
    static getSelectedCells(table) {
        const startRow = parseInt(table.dataset.selectionStartRow || '-1');
        const startCol = parseInt(table.dataset.selectionStartCol || '-1');
        const endRow = parseInt(table.dataset.selectionEndRow || '-1');
        const endCol = parseInt(table.dataset.selectionEndCol || '-1');
        if (startRow === -1 || startCol === -1 || endRow === -1 || endCol === -1) {
            return [];
        }
        const minRow = Math.min(startRow, endRow);
        const maxRow = Math.max(startRow, endRow);
        const minCol = Math.min(startCol, endCol);
        const maxCol = Math.max(startCol, endCol);
        const selectedCells = [];
        const rows = table.rows;
        for (let rowIndex = minRow; rowIndex <= maxRow; rowIndex++) {
            if (rowIndex < rows.length) {
                const row = rows[rowIndex];
                for (let colIndex = minCol; colIndex <= maxCol; colIndex++) {
                    if (colIndex < row.cells.length) {
                        selectedCells.push(row.cells[colIndex]);
                    }
                }
            }
        }
        return selectedCells;
    }
    static getAdjacentCell(cell, direction, table) {
        var _a, _b, _c, _d;
        const row = cell.parentElement.rowIndex;
        const col = cell.cellIndex;
        if (direction === QuillExtensions.ArrowLeft) {
            if (col > 0)
                return ((_a = table.rows[row]) === null || _a === void 0 ? void 0 : _a.cells[col - 1]) || null;
        }
        else if (direction === QuillExtensions.ArrowRight) {
            if (col < table.rows[row].cells.length - 1)
                return ((_b = table.rows[row]) === null || _b === void 0 ? void 0 : _b.cells[col + 1]) || null;
        }
        else if (direction === QuillExtensions.ArrowUp) {
            if (row > 0)
                return ((_c = table.rows[row - 1]) === null || _c === void 0 ? void 0 : _c.cells[col]) || null;
        }
        else if (direction === QuillExtensions.ArrowDown) {
            if (row < table.rows.length - 1)
                return ((_d = table.rows[row + 1]) === null || _d === void 0 ? void 0 : _d.cells[col]) || null;
        }
        return null;
    }
    static getNextCell(cell, table) {
        const row = cell.parentElement.rowIndex;
        const col = cell.cellIndex;
        if (col < table.rows[row].cells.length - 1) {
            return table.rows[row].cells[col + 1];
        }
        if (row < table.rows.length - 1) {
            return table.rows[row + 1].cells[0];
        }
        return null;
    }
    static getPreviousCell(cell, table) {
        const row = cell.parentElement.rowIndex;
        const col = cell.cellIndex;
        if (col > 0) {
            return table.rows[row].cells[col - 1];
        }
        if (row > 0) {
            const prevRow = table.rows[row - 1];
            return prevRow.cells[prevRow.cells.length - 1];
        }
        return null;
    }
    static setupTableControls(node) {
        var _a, _b;
        const perfTimer = NotesPerfTimer.start('setupTableControls');
        try {
            const editor = TableBlot.getEditorForTable(node);
            if (editor.editorSettings.readOnly) {
                perfTimer.withContext('readOnly', 1);
                return;
            }
            const rows = node.rows.length;
            const cols = (_b = (_a = node.rows[0]) === null || _a === void 0 ? void 0 : _a.cells.length) !== null && _b !== void 0 ? _b : 0;
            const shapeKey = `${rows}x${cols}`;
            if (node.dataset.tbShapeKey === shapeKey && node.querySelector('.ql-table-theme-button')) {
                perfTimer.withContext('skipped', 1).withContext('shape', shapeKey);
                return;
            }
            editor.withHistoryIgnored(() => {
                const controlsList = node.querySelectorAll('.ql-table-control');
                controlsList.forEach(control => {
                    if (control === editor.tableCellSelectionDiv) {
                        return;
                    }
                    if (control.classList.contains('ql-column-resizer')) {
                        return;
                    }
                    control.remove();
                });
                const controlOutlineColor = 'rgb(var(--vusr-text-primary) / 53%)';
                const controlFillColor = 'rgb(var(--vusr-text-primary) / 27%)';
                const firstCell = node.querySelector('td');
                if (!firstCell) {
                    console.warn('No cells found in the table to attach the cell selection display');
                    return;
                }
                let tableCellSelectionDiv = node.querySelector('.ql-table-cell-selection');
                if (!tableCellSelectionDiv) {
                    tableCellSelectionDiv = document.createElement('div');
                    tableCellSelectionDiv.className = 'ql-table-control ql-table-cell-selection absolute top-0 left-0 z-10 pointer-events-none';
                    tableCellSelectionDiv.style.backgroundColor = controlFillColor;
                    firstCell.appendChild(tableCellSelectionDiv);
                    editor.tableCellSelectionDiv = tableCellSelectionDiv;
                }
                else {
                    const containingCell = tableCellSelectionDiv.closest('td');
                    if (!containingCell) {
                        console.warn('Failed to find the containing cell for the cell selection display');
                        return;
                    }
                    if (containingCell !== firstCell) {
                        containingCell.removeChild(tableCellSelectionDiv);
                        firstCell.appendChild(tableCellSelectionDiv);
                    }
                    editor.tableCellSelectionDiv = tableCellSelectionDiv;
                }
                if (editor.tableResizer && editor.tableResizer.table === node) {
                    editor.tableResizer.refresh(controlFillColor);
                }
                else {
                    if (editor.tableResizer) {
                        editor.tableResizer.destroy();
                    }
                    editor.tableResizer = new TableResizer(node, controlFillColor);
                }
                const addControlFactory = (orientation, edge) => {
                    const button = document.createElement('div');
                    button.className = 'ql-table-add-button ql-table-control cursor-default';
                    button.style.width = this.controlSize + 'px';
                    button.style.height = this.controlSize + 'px';
                    button.style.backgroundColor = 'transparent';
                    const inner = document.createElement('div');
                    inner.style.position = 'absolute';
                    inner.style.width = this.innerControlSize + 'px';
                    inner.style.height = this.innerControlSize + 'px';
                    inner.style.left = (this.controlSize - this.innerControlSize) / 2 + 'px';
                    inner.style.top = (this.controlSize - this.innerControlSize) / 2 + 'px';
                    inner.style.background = controlFillColor;
                    inner.style.border = '1px solid ' + controlOutlineColor;
                    inner.style.borderRadius = this.innerControlSize + 'px';
                    inner.style.transition = 'opacity 0.3s ease';
                    const icon = document.createElement('i');
                    icon.className = 'far fa-fw fa-circle-plus';
                    icon.style.position = 'absolute';
                    icon.style.left = '50%';
                    icon.style.top = '50%';
                    icon.style.transform = 'translate(-50%, -50%)';
                    icon.style.fontSize = this.controlIconSize + 'px';
                    icon.style.color = controlOutlineColor;
                    icon.style.opacity = '0';
                    icon.style.transition = 'opacity 0.3s ease';
                    button.appendChild(inner);
                    button.appendChild(icon);
                    button.addEventListener('mouseenter', () => {
                        inner.style.opacity = '0';
                        icon.style.opacity = '1';
                    });
                    button.addEventListener('mouseleave', () => {
                        inner.style.opacity = '1';
                        icon.style.opacity = '0';
                    });
                    return button;
                };
                new TableControlAdder(node, {
                    position: 'bottom',
                    placement: 'edge',
                    onClick: (e, index, control, isContextClick) => {
                        if (!isContextClick) {
                            this.addColumn(node, index);
                        }
                    },
                    controlFactory: addControlFactory
                });
                new TableControlAdder(node, {
                    position: 'right',
                    placement: 'edge',
                    onClick: (e, index, control, isContextClick) => {
                        if (!isContextClick) {
                            this.addRow(node, index);
                        }
                    },
                    controlFactory: addControlFactory
                });
                const selectRowOrColumnControlFactory = (orientation, edge) => {
                    let normalIcon = '';
                    let hoverIcon = '';
                    if (orientation == 'horizontal') {
                        normalIcon = 'fas fa-chevron-down';
                        hoverIcon = 'far fa-circle-chevron-down';
                    }
                    else {
                        normalIcon = 'fas fa-chevron-right';
                        hoverIcon = 'far fa-circle-chevron-right';
                    }
                    const button = document.createElement('div');
                    button.className = 'ql-table-delete-button ql-table-control cursor-default';
                    button.style.width = this.controlSize + 'px';
                    button.style.height = this.controlSize + 'px';
                    button.style.backgroundColor = 'transparent';
                    const inner = document.createElement('i');
                    inner.className = 'fa-fw ' + normalIcon;
                    inner.style.position = 'absolute';
                    inner.style.left = '50%';
                    inner.style.top = '50%';
                    inner.style.transform = 'translate(-50%, -50%)';
                    inner.style.fontSize = (this.controlIconSize - 6) + 'px';
                    inner.style.color = controlOutlineColor;
                    inner.style.transition = 'opacity 0.3s ease';
                    const hover = document.createElement('i');
                    hover.className = 'fa-fw ' + hoverIcon;
                    hover.style.position = 'absolute';
                    hover.style.left = '50%';
                    hover.style.top = '50%';
                    hover.style.transform = 'translate(-50%, -50%)';
                    hover.style.fontSize = this.controlIconSize + 'px';
                    hover.style.color = controlOutlineColor;
                    hover.style.opacity = '0';
                    hover.style.transition = 'opacity 0.3s ease';
                    button.appendChild(inner);
                    button.appendChild(hover);
                    button.addEventListener('mouseenter', () => {
                        inner.style.opacity = '0';
                        hover.style.opacity = '1';
                    });
                    button.addEventListener('mouseleave', () => {
                        inner.style.opacity = '1';
                        hover.style.opacity = '0';
                    });
                    return button;
                };
                new TableControlAdder(node, {
                    position: 'top',
                    placement: 'center',
                    onClick: (e, index, control, isContextClick) => {
                        this.selectColumn(node, index);
                        if (isContextClick) {
                            editor.showContextMenu(e.clientX, e.clientY, "table-column");
                        }
                    },
                    controlFactory: selectRowOrColumnControlFactory
                });
                new TableControlAdder(node, {
                    position: 'left',
                    placement: 'center',
                    onClick: (e, index, control, isContextClick) => {
                        this.selectRow(node, index);
                        if (isContextClick) {
                            editor.showContextMenu(e.clientX, e.clientY, "table-row");
                        }
                    },
                    controlFactory: selectRowOrColumnControlFactory
                });
                const themeButton = document.createElement('div');
                themeButton.className = 'ql-table-control ql-table-theme-button';
                themeButton.style.position = 'absolute';
                themeButton.style.width = this.controlSize + 'px';
                themeButton.style.height = this.controlSize + 'px';
                themeButton.style.left = -this.controlSize + 'px';
                themeButton.style.top = -this.controlSize + 'px';
                themeButton.style.display = 'flex';
                themeButton.style.alignItems = 'center';
                themeButton.style.justifyContent = 'center';
                themeButton.style.cursor = 'pointer';
                themeButton.style.opacity = '0.5';
                themeButton.style.transition = 'opacity 0.2s ease';
                const themeIcon = document.createElement('i');
                themeIcon.className = 'far fa-palette';
                themeIcon.style.fontSize = (this.controlIconSize - 2) + 'px';
                themeIcon.style.color = controlOutlineColor;
                themeButton.appendChild(themeIcon);
                themeButton.addEventListener('mouseenter', () => { themeButton.style.opacity = '1'; });
                themeButton.addEventListener('mouseleave', () => { themeButton.style.opacity = '0.5'; });
                themeButton.addEventListener('click', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    editor.showTableThemeDialog(node);
                });
                firstCell.appendChild(themeButton);
            });
            node.dataset.tbShapeKey = shapeKey;
            perfTimer.withContext('shape', shapeKey).withContext('rebuilt', 1);
        }
        finally {
            perfTimer.stop();
        }
    }
    static setupTableClickDelegation(table) {
        if (table.dataset.tbClickDelegated === '1') {
            return;
        }
        table.dataset.tbClickDelegated = '1';
        table.addEventListener('click', (event) => {
            const pointerEvent = event;
            const target = event.target;
            const anchor = target.closest('a');
            if (anchor) {
                event.preventDefault();
            }
            if (target.closest('.ql-table-control')) {
                return;
            }
            const cell = target.closest('td');
            if (!cell || cell.closest('table') !== table) {
                return;
            }
            const editor = TableBlot.getEditorForTable(table);
            if (editor.tableState.lastTableWithSelection === table) {
                editor.notifyEditorFocused();
                return;
            }
            const domSelection = window.getSelection();
            const hasTextSelection = domSelection && !domSelection.isCollapsed;
            if (hasTextSelection) {
                editor.notifyEditorFocused();
                editor.updateTableControlsDisplayState();
                return;
            }
            const handled = this.activateEditorAt(pointerEvent.clientX, pointerEvent.clientY, false, editor);
            if (!handled) {
                const cellQuill = this.activateCell(cell, editor);
                if (cellQuill) {
                    const bounds = cell.getBoundingClientRect();
                    const scale = getScaleFactor(cell);
                    const relativeX = (pointerEvent.clientX - bounds.x) / scale;
                    const relativeY = (pointerEvent.clientY - bounds.y) / scale;
                    QuillExtensions.setSelectionFromCoordinates(cellQuill, relativeX, relativeY);
                    pointerEvent.stopPropagation();
                }
            }
            else {
                event.stopPropagation();
            }
            editor.notifyEditorFocused();
            editor.updateTableControlsDisplayState();
        });
    }
    static addColumn(table, columnIndex) {
        this.performUndoableOperation(table, () => {
            table.querySelectorAll('tr').forEach((row, rowIndex) => {
                const cell = document.createElement('td');
                row.insertBefore(cell, row.children[columnIndex]);
            });
            const colgroup = table.querySelector('colgroup');
            if (colgroup) {
                const col = document.createElement('col');
                colgroup.insertBefore(col, colgroup.children[columnIndex]);
            }
        });
    }
    static addRow(table, rowIndex) {
        this.performUndoableOperation(table, () => {
            const columns = table.rows[0].cells.length;
            const row = table.insertRow(rowIndex);
            for (let i = 0; i < columns; i++) {
                const cell = document.createElement('td');
                const p = document.createElement('p');
                p.appendChild(document.createElement('br'));
                cell.appendChild(p);
                row.appendChild(cell);
            }
        });
    }
    static selectColumn(table, columnIndex) {
        let startCell = null;
        let endCell = null;
        const rows = table.rows;
        if (rows.length === 0 || columnIndex < 0) {
            this.setTableSelection(table, startCell, endCell);
            return;
        }
        for (let i = 0; i < rows.length; i++) {
            const cell = rows[i].cells[columnIndex];
            if (cell) {
                startCell = cell;
                break;
            }
        }
        for (let i = rows.length - 1; i >= 0; i--) {
            const cell = rows[i].cells[columnIndex];
            if (cell) {
                endCell = cell;
                break;
            }
        }
        this.setTableSelection(table, startCell, endCell);
    }
    static selectRow(table, rowIndex) {
        let startCell = null;
        let endCell = null;
        const rows = table.rows;
        if (rows.length === 0 || rowIndex < 0 || rowIndex >= rows.length) {
            this.setTableSelection(table, startCell, endCell);
            return;
        }
        const row = rows[rowIndex];
        const cells = row.cells;
        if (cells.length === 0) {
            this.setTableSelection(table, startCell, endCell);
            return;
        }
        startCell = cells[0];
        endCell = cells[cells.length - 1];
        this.setTableSelection(table, startCell, endCell);
    }
    static deleteColumnInternal(table, columnIndex) {
        table.querySelectorAll('tr').forEach((row) => {
            row.deleteCell(columnIndex);
        });
        const colgroup = table.querySelector('colgroup');
        if (colgroup) {
            const cols = colgroup.querySelectorAll('col');
            if (cols[columnIndex])
                cols[columnIndex].remove();
        }
    }
    static deleteColumn(table, columnIndex) {
        this.performUndoableOperation(table, () => {
            this.deleteColumnInternal(table, columnIndex);
        });
    }
    static deleteRow(table, rowIndex) {
        this.performUndoableOperation(table, () => {
            table.deleteRow(rowIndex);
        });
    }
    static duplicateRow(table, rowIndex) {
        const originalRow = table.rows[rowIndex];
        if (!originalRow)
            return;
        this.performUndoableOperation(table, () => {
            const newRow = originalRow.cloneNode(true);
            newRow.querySelectorAll('.ql-table-control').forEach(control => {
                control.remove();
            });
            const parent = originalRow.parentElement;
            if (originalRow.nextSibling) {
                parent.insertBefore(newRow, originalRow.nextSibling);
            }
            else {
                parent.appendChild(newRow);
            }
        });
    }
    static duplicateColumn(table, columnIndex) {
        this.performUndoableOperation(table, () => {
            table.querySelectorAll('tr').forEach((row) => {
                const originalCell = row.cells[columnIndex];
                if (!originalCell)
                    return;
                const newCell = originalCell.cloneNode(true);
                newCell.querySelectorAll('.ql-table-control').forEach(control => {
                    control.remove();
                });
                row.insertBefore(newCell, originalCell.nextSibling);
            });
            const colgroup = table.querySelector('colgroup');
            if (colgroup) {
                const cols = colgroup.querySelectorAll('col');
                const originalCol = cols[columnIndex];
                if (originalCol) {
                    const newCol = originalCol.cloneNode(true);
                    colgroup.insertBefore(newCol, originalCol.nextSibling);
                }
            }
        });
    }
    static moveRow(table, rowIndex, direction) {
        const targetIndex = rowIndex + direction;
        if (targetIndex < 0 || targetIndex >= table.rows.length) {
            return;
        }
        this.performUndoableOperation(table, () => {
            const rowToMove = table.rows[rowIndex];
            const targetRow = table.rows[targetIndex];
            const parent = rowToMove.parentElement;
            if (direction > 0) {
                if (targetRow.nextSibling) {
                    parent.insertBefore(rowToMove, targetRow.nextSibling);
                }
                else {
                    parent.appendChild(rowToMove);
                }
            }
            else {
                parent.insertBefore(rowToMove, targetRow);
            }
        });
    }
    static moveColumn(table, columnIndex, direction) {
        const targetIndex = columnIndex + direction;
        const firstRow = table.rows[0];
        if (!firstRow || targetIndex < 0 || targetIndex >= firstRow.cells.length) {
            return;
        }
        this.performUndoableOperation(table, () => {
            table.querySelectorAll('tr').forEach((row) => {
                const cellToMove = row.cells[columnIndex];
                const targetCell = row.cells[targetIndex];
                if (!cellToMove || !targetCell)
                    return;
                if (direction > 0) {
                    row.insertBefore(cellToMove, targetCell.nextSibling);
                }
                else {
                    row.insertBefore(cellToMove, targetCell);
                }
            });
            const colgroup = table.querySelector('colgroup');
            if (colgroup) {
                const cols = colgroup.querySelectorAll('col');
                const colToMove = cols[columnIndex];
                const targetCol = cols[targetIndex];
                if (colToMove && targetCol) {
                    if (direction > 0) {
                        colgroup.insertBefore(colToMove, targetCol.nextSibling);
                    }
                    else {
                        colgroup.insertBefore(colToMove, targetCol);
                    }
                }
            }
        });
    }
    static swapCells(table, row1, col1, row2, col2, tableState) {
        var _a, _b, _c, _d, _e, _f;
        const cell1 = (_a = table.rows[row1]) === null || _a === void 0 ? void 0 : _a.cells[col1];
        const cell2 = (_b = table.rows[row2]) === null || _b === void 0 ? void 0 : _b.cells[col2];
        if (!cell1 || !cell2)
            return;
        if (tableState.editorCache[cell1.id]) {
            (_d = (_c = tableState.editorCache[cell1.id]).removeListener) === null || _d === void 0 ? void 0 : _d.call(_c);
            delete tableState.editorCache[cell1.id];
            cell1.classList.remove('ql-container', 'ql-snow');
        }
        if (tableState.editorCache[cell2.id]) {
            (_f = (_e = tableState.editorCache[cell2.id]).removeListener) === null || _f === void 0 ? void 0 : _f.call(_e);
            delete tableState.editorCache[cell2.id];
            cell2.classList.remove('ql-container', 'ql-snow');
        }
        tableState.activeCellId = undefined;
        this.performUndoableOperation(table, () => {
            const controls1 = this.removeControlsFromCell(cell1);
            const controls2 = this.removeControlsFromCell(cell2);
            const getCleanContent = (cell) => {
                const editorDiv = cell.querySelector('.ql-editor');
                return editorDiv ? editorDiv.innerHTML : cell.innerHTML;
            };
            const temp = getCleanContent(cell1);
            cell1.innerHTML = getCleanContent(cell2);
            cell2.innerHTML = temp;
            this.restoreControlsToCell(cell1, controls1);
            this.restoreControlsToCell(cell2, controls2);
        });
    }
    static findAdjacentTable(table, direction) {
        let sibling = direction === 'below'
            ? table.nextElementSibling
            : table.previousElementSibling;
        while (sibling) {
            if (sibling.tagName === 'TABLE' && sibling.classList.contains('ql-table-blot')) {
                return sibling;
            }
            if (sibling.tagName === 'P' && (!sibling.textContent || sibling.textContent === '\n')) {
                sibling = direction === 'below'
                    ? sibling.nextElementSibling
                    : sibling.previousElementSibling;
                continue;
            }
            return null;
        }
        return null;
    }
    static splitTable(table, rowIndex, tableState, editor) {
        var _a, _b;
        if (rowIndex <= 0 || rowIndex >= table.rows.length)
            return;
        const tableDataJson = this.value(table);
        const tableData = JSON.parse(tableDataJson);
        const formats = this.formats(table);
        const topData = {
            columns: tableData.columns,
            rows: rowIndex,
            cells: tableData.cells.slice(0, rowIndex)
        };
        const bottomData = {
            columns: tableData.columns,
            rows: tableData.rows - rowIndex,
            cells: tableData.cells.slice(rowIndex)
        };
        for (const cellId of Object.keys(tableState.editorCache)) {
            const cellElement = document.getElementById(cellId);
            if (cellElement && table.contains(cellElement)) {
                (_b = (_a = tableState.editorCache[cellId]).removeListener) === null || _b === void 0 ? void 0 : _b.call(_a);
                delete tableState.editorCache[cellId];
            }
        }
        tableState.activeCellId = undefined;
        const blot = Quill.find(table);
        if (!blot)
            return;
        const index = editor.getIndex(blot);
        if (index === -1)
            return;
        editor.deleteText(index, 1, 'user');
        editor.insertEmbed(index, 'table', JSON.stringify(topData), 'user');
        editor.insertText(index + 1, '\n', 'user');
        editor.insertEmbed(index + 2, 'table', JSON.stringify(bottomData), 'user');
        if (Object.keys(formats).length > 0) {
            editor.formatText(index, 1, formats, 'silent');
            editor.formatText(index + 2, 1, formats, 'silent');
        }
    }
    static mergeTables(table, direction, tableState, editor) {
        var _a, _b, _c, _d;
        const blot = Quill.find(table);
        if (!blot)
            return;
        const index = editor.getIndex(blot);
        if (index === -1)
            return;
        const adjacentTable = this.findAdjacentTable(table, direction);
        if (!adjacentTable)
            return;
        const currentCols = ((_a = table.rows[0]) === null || _a === void 0 ? void 0 : _a.cells.length) || 0;
        const adjacentCols = ((_b = adjacentTable.rows[0]) === null || _b === void 0 ? void 0 : _b.cells.length) || 0;
        if (currentCols === 0 && adjacentCols === 0)
            return;
        const adjacentBlot = Quill.find(adjacentTable);
        if (!adjacentBlot)
            return;
        const adjacentIndex = editor.getIndex(adjacentBlot);
        const firstTable = direction === 'above' ? adjacentTable : table;
        const secondTable = direction === 'above' ? table : adjacentTable;
        const firstIndex = Math.min(index, adjacentIndex);
        const secondIndex = Math.max(index, adjacentIndex);
        const firstData = JSON.parse(this.value(firstTable));
        const secondData = JSON.parse(this.value(secondTable));
        const formats = this.formats(firstTable);
        const maxCols = Math.max(firstData.columns, secondData.columns);
        const padRows = (cells, targetCols) => {
            return cells.map((row) => {
                while (row.length < targetCols) {
                    row.push({ content: '' });
                }
                return row;
            });
        };
        const mergedData = {
            columns: maxCols,
            rows: firstData.rows + secondData.rows,
            cells: padRows(firstData.cells, maxCols).concat(padRows(secondData.cells, maxCols))
        };
        for (const cellId of Object.keys(tableState.editorCache)) {
            const cellElement = document.getElementById(cellId);
            if (cellElement && (firstTable.contains(cellElement) || secondTable.contains(cellElement))) {
                (_d = (_c = tableState.editorCache[cellId]).removeListener) === null || _d === void 0 ? void 0 : _d.call(_c);
                delete tableState.editorCache[cellId];
            }
        }
        tableState.activeCellId = undefined;
        const deleteLength = secondIndex - firstIndex + 1;
        editor.deleteText(firstIndex, deleteLength, 'user');
        editor.insertEmbed(firstIndex, 'table', JSON.stringify(mergedData), 'user');
        if (Object.keys(formats).length > 0) {
            editor.formatText(firstIndex, 1, formats, 'silent');
        }
    }
    static performUndoableOperation(table, operation) {
        const editor = this.getEditorForTable(table);
        const isOutermost = this._batchDepth === 0;
        if (isOutermost) {
            editor.cutoffPrimaryHistory();
            editor.isStructuralTableOperation = true;
        }
        this._batchDepth++;
        try {
            operation();
        }
        finally {
            this._batchDepth--;
            if (isOutermost) {
                editor.flushPrimaryEditorMutations();
                this.setupTableControls(table);
                this.reapplyFormats(table);
                editor.isStructuralTableOperation = false;
                editor.cutoffPrimaryHistory();
                editor.scheduleProcessVisibleLines();
            }
        }
    }
    static reapplyFormats(table) {
        const perfTimer = NotesPerfTimer.start('reapplyFormats');
        try {
            const editor = this.getEditorForTable(table);
            const formats = this.formats(table);
            const activeKeys = TableBlot.POSITION_DEPENDENT_FORMAT_KEYS.filter(k => formats[k] != null);
            perfTimer.withContext('active', activeKeys.length);
            if (activeKeys.length === 0) {
                perfTimer.withContext('skipped', 1);
                return;
            }
            editor.withHistoryIgnored(() => {
                const clearRowBg = formats['table-alt-background-color'] != null;
                const clearCellBg = activeKeys.some(k => k === 'table-first-row-background-color' ||
                    k === 'table-first-column-background-color');
                const clearCellFg = activeKeys.some(k => k === 'table-first-row-foreground-color' ||
                    k === 'table-first-column-foreground-color');
                const clearCellBorder = activeKeys.some(k => k === 'table-line-color' ||
                    k === 'table-first-row-line-color' ||
                    k === 'table-first-column-line-color');
                if (clearRowBg) {
                    table.querySelectorAll('tr').forEach((el) => el.style.removeProperty('background-color'));
                }
                if (clearCellBg || clearCellFg || clearCellBorder) {
                    const cells = table.querySelectorAll('td');
                    cells.forEach((el) => {
                        if (clearCellBg)
                            el.style.removeProperty('background-color');
                        if (clearCellFg)
                            el.style.removeProperty('color');
                        if (clearCellBorder)
                            el.style.removeProperty('border-color');
                    });
                    perfTimer.withContext('cells', cells.length);
                }
                for (const key of activeKeys) {
                    this.formatInternal(table, key, formats[key]);
                }
            });
        }
        finally {
            perfTimer.stop();
        }
    }
    static value(node) {
        var _a;
        const tableData = new TableData();
        tableData.columns = ((_a = node.querySelector('tr')) === null || _a === void 0 ? void 0 : _a.childElementCount) || 0;
        tableData.rows = node.querySelectorAll('tr').length;
        tableData.cells = Array.from({ length: tableData.rows }, () => Array(tableData.columns).fill(""));
        node.querySelectorAll('tr').forEach((row, rowIndex) => {
            row.querySelectorAll('td').forEach((cell, colIndex) => {
                const cached = this.readCellDelta(cell);
                if (cached) {
                    tableData.cells[rowIndex][colIndex] = JSON.stringify(cached);
                    return;
                }
                const cellClone = cell.cloneNode(true);
                this.removeControlsFromCell(cellClone);
                const editorDiv = cellClone.querySelector('.ql-editor');
                if (editorDiv) {
                    editorDiv.style.removeProperty('color');
                    editorDiv.style.removeProperty('background-color');
                }
                const html = cellClone.innerHTML || "";
                const delta = QuillExtensions.convertHtmlToDelta(html);
                tableData.cells[rowIndex][colIndex] = JSON.stringify(delta);
            });
        });
        try {
            const editor = this.getEditorForTable(node);
            editor.tableState.ignoreNextSelectionChange = true;
        }
        catch (e) {
        }
        return JSON.stringify(tableData);
    }
    static formats(domNode) {
        const formats = {};
        const colgroup = domNode.querySelector('colgroup');
        if (colgroup) {
            const widths = [-1];
            colgroup.querySelectorAll('col').forEach(col => {
                const width = parseInt(col.style.width || '0');
                widths.push(width);
            });
            formats['table-column-widths'] = widths.join(',');
        }
        Array.from(domNode.attributes).forEach(attr => {
            if (attr.name.startsWith('data-table-')) {
                const key = attr.name.substring(5);
                if (formats[key] === undefined) {
                    formats[key] = attr.value;
                }
            }
        });
        return formats;
    }
    static formatInternal(domNode, name, value) {
        if (value) {
            domNode.setAttribute('data-' + name, value);
        }
        else {
            domNode.removeAttribute('data-' + name);
        }
        if (name === 'table-foreground-color') {
            if (value) {
                domNode.style.color = value;
            }
            else {
                domNode.style.removeProperty('color');
            }
        }
        else if (name === 'table-background-color') {
            if (value) {
                domNode.style.backgroundColor = value;
            }
            else {
                domNode.style.removeProperty('background-color');
            }
        }
        else if (name === 'table-alt-background-color') {
            var isAlt = true;
            domNode.querySelectorAll('tr').forEach((row) => {
                if (isAlt) {
                    if (value) {
                        row.style.backgroundColor = value;
                    }
                    else {
                        row.style.removeProperty('background-color');
                    }
                }
                isAlt = !isAlt;
            });
        }
        else if (name === 'table-line-color') {
            domNode.querySelectorAll('td').forEach((cell) => {
                if (value) {
                    cell.style.borderColor = value;
                }
                else {
                    cell.style.removeProperty('border-color');
                }
            });
        }
        else if (name === 'table-first-row-background-color') {
            domNode.querySelector('tr:first-child').querySelectorAll('td').forEach((cell) => {
                if (value) {
                    cell.style.backgroundColor = value;
                }
                else {
                    cell.style.removeProperty('background-color');
                }
            });
        }
        else if (name === 'table-first-row-foreground-color') {
            domNode.querySelector('tr:first-child').querySelectorAll('td').forEach((cell) => {
                if (value) {
                    cell.style.color = value;
                }
                else {
                    cell.style.removeProperty('color');
                }
            });
        }
        else if (name === 'table-first-row-line-color') {
            domNode.querySelector('tr:first-child').querySelectorAll('td').forEach((cell) => {
                if (value) {
                    cell.style.borderColor = value;
                }
                else {
                    cell.style.removeProperty('border-color');
                }
            });
        }
        else if (name === 'table-first-column-background-color') {
            domNode.querySelectorAll('td:first-child').forEach((cell, index) => {
                if (value) {
                    if (index > 0) {
                        cell.style.backgroundColor = value;
                    }
                }
                else {
                    cell.style.removeProperty('background-color');
                }
            });
        }
        else if (name === 'table-first-column-foreground-color') {
            domNode.querySelectorAll('td:first-child').forEach((cell, index) => {
                if (value) {
                    if (index > 0) {
                        cell.style.color = value;
                    }
                }
                else {
                    cell.style.removeProperty('color');
                }
            });
        }
        else if (name === 'table-first-column-line-color') {
            domNode.querySelectorAll('td:first-child').forEach((cell, index) => {
                if (value) {
                    if (index > 0) {
                        cell.style.borderColor = value;
                    }
                }
                else {
                    cell.style.removeProperty('border-color');
                }
            });
        }
        else if (name === 'table-justification') {
            domNode.style.removeProperty('margin-left');
            domNode.style.removeProperty('margin-right');
            if (value === 'center') {
                domNode.style.marginLeft = 'auto';
                domNode.style.marginRight = 'auto';
            }
            else if (value === 'right') {
                domNode.style.marginLeft = 'auto';
            }
        }
        else if (name === 'table-column-widths') {
            if (value) {
                const widths = value.split(',');
                domNode.querySelectorAll('col').forEach((col, index) => {
                    const w = parseInt(widths[index + 1]);
                    if (w > 0) {
                        col.style.width = w + 'px';
                    }
                    else {
                        col.style.removeProperty('width');
                    }
                });
            }
            else {
                domNode.querySelectorAll('col').forEach((col) => {
                    col.style.removeProperty('width');
                });
            }
        }
    }
    format(name, value) {
        if (name === 'align') {
            name = 'table-justification';
        }
        if (!name.startsWith('table-')) {
            super.format(name, value);
            return;
        }
        TableBlot.formatInternal(this.domNode, name, value);
    }
    static activateEditorAt(x, y, isFromArrowKeyEventInsideTable, editor) {
        const element = this.elementFromPointIgnoreClasses(x, y, ['ql-table-control']);
        const targetCell = element.closest('td');
        if (!targetCell) {
            if (editor.tableState.lastActiveCellId && editor.tableState.editorCache[editor.tableState.lastActiveCellId]) {
                const table = editor.tableState.editorCache[editor.tableState.lastActiveCellId].cellElement.closest('table');
                const tableRect = table.getBoundingClientRect();
                const isAbove = y < tableRect.top;
                const isBelow = y > tableRect.bottom;
                if (isAbove || isBelow) {
                    let editorElement = table.closest('.ql-editor');
                    if (editorElement) {
                        const quill = Quill.find(editorElement.parentElement);
                        if (quill && quill instanceof Quill) {
                            const bounds = editorElement.parentElement.getBoundingClientRect();
                            let index = QuillExtensions.getClosestIndex(quill, x - bounds.x, y - bounds.y);
                            if (isBelow) {
                                index++;
                            }
                            quill.setSelection(index, 0, 'user');
                            if (isAbove && index == 0 && isFromArrowKeyEventInsideTable) {
                                const line = quill.getLine(index);
                                if (line.length > 0 && line[0] instanceof TableBlot) {
                                    quill.insertText(0, '\n', 'user');
                                    quill.setSelection(0, 0, 'user');
                                }
                            }
                            editor.activeEditor = 'primary';
                            editorElement.focus();
                        }
                        else {
                            console.error('Could not find Quill instance');
                        }
                    }
                    return false;
                }
                else {
                    if (x > tableRect.right) {
                        let nextRow = editor.tableState.editorCache[editor.tableState.lastActiveCellId].cellElement.closest('tr').nextElementSibling;
                        if (nextRow) {
                            let cell = nextRow.querySelector('td');
                            let bounds = cell.getBoundingClientRect();
                            x = bounds.x;
                            y = bounds.y + bounds.height / 2;
                            return this.activateEditorAt(x, y, isFromArrowKeyEventInsideTable, editor);
                        }
                        else {
                            x = tableRect.x;
                            y = tableRect.y + tableRect.height + 10;
                            return this.activateEditorAt(x, y, isFromArrowKeyEventInsideTable, editor);
                        }
                    }
                    else if (x < tableRect.left) {
                        let prevRow = editor.tableState.editorCache[editor.tableState.lastActiveCellId].cellElement.closest('tr').previousElementSibling;
                        if (prevRow) {
                            let cells = prevRow.querySelectorAll('td');
                            let cell = cells[cells.length - 1];
                            let bounds = cell.getBoundingClientRect();
                            x = bounds.x + bounds.width - 1;
                            y = bounds.y + bounds.height / 2;
                            return this.activateEditorAt(x, y, isFromArrowKeyEventInsideTable, editor);
                        }
                        else {
                            const editorRect = table.closest('.ql-editor').getBoundingClientRect();
                            x = editorRect.right - 1;
                            y = tableRect.y - 10;
                            return this.activateEditorAt(x, y, isFromArrowKeyEventInsideTable, editor);
                        }
                    }
                }
            }
            return false;
        }
        const cellQuill = this.activateCell(targetCell, editor);
        if (!cellQuill) {
            return false;
        }
        let bounds = targetCell.getBoundingClientRect();
        const scale = getScaleFactor(targetCell);
        const relativeX = (x - bounds.x) / scale;
        const relativeY = (y - bounds.y) / scale;
        QuillExtensions.setSelectionFromCoordinates(cellQuill, relativeX, relativeY);
        return true;
    }
    static elementFromPointIgnoreClasses(x, y, ignoredClasses = []) {
        const processedElements = new Map();
        let element = document.documentElement;
        while (true) {
            let hitTest = document.elementFromPoint(x, y);
            if (!hitTest || hitTest === document.documentElement) {
                break;
            }
            element = hitTest;
            const shouldIgnoreElement = this.shouldIgnoreElementOrAncestors(element, x, y, ignoredClasses);
            if (shouldIgnoreElement.ignore) {
                const elementToHide = shouldIgnoreElement.elementToHide;
                if (processedElements.has(elementToHide)) {
                    break;
                }
                processedElements.set(elementToHide, elementToHide.style.pointerEvents);
                elementToHide.style.pointerEvents = 'none';
                continue;
            }
            break;
        }
        processedElements.forEach((originalPointerEvents, element) => {
            element.style.pointerEvents = originalPointerEvents;
        });
        return element;
    }
    static shouldIgnoreElementOrAncestors(element, x, y, ignoredClasses) {
        const rect = element.getBoundingClientRect();
        const isWithinBounds = x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
        if (!isWithinBounds) {
            return { ignore: true, elementToHide: element };
        }
        let currentElement = element;
        while (currentElement && currentElement !== document.documentElement) {
            const hasIgnoredClass = ignoredClasses.some(className => currentElement.classList.contains(className));
            if (hasIgnoredClass) {
                return { ignore: true, elementToHide: currentElement };
            }
            currentElement = currentElement.parentElement;
        }
        return { ignore: false };
    }
    static activateCell(targetCell, editor) {
        var _a;
        if (!targetCell)
            return undefined;
        const cellId = TableBlot.getCellId(targetCell);
        const cached = editor.tableState.editorCache[cellId];
        if (cached && !document.contains(cached.cellElement)) {
            (_a = cached.removeListener) === null || _a === void 0 ? void 0 : _a.call(cached);
            delete editor.tableState.editorCache[cellId];
        }
        if (editor.tableState.activeCellId == cellId && editor.tableState.editorCache[cellId]) {
            const existing = editor.tableState.editorCache[cellId].quill;
            const existingRoot = existing === null || existing === void 0 ? void 0 : existing.root;
            if (existingRoot) {
                existingRoot.dataset.tableCellId = cellId;
            }
            editor.activeEditor = 'cell';
            return existing;
        }
        editor.tableState.activeCellId = cellId;
        editor.tableState.lastActiveCellId = cellId;
        if (editor.tableState.editorCache[cellId]) {
            const cachedQuill = editor.tableState.editorCache[cellId].quill;
            const cachedRoot = cachedQuill === null || cachedQuill === void 0 ? void 0 : cachedQuill.root;
            if (cachedRoot) {
                cachedRoot.dataset.tableCellId = cellId;
            }
            editor.activeEditor = 'cell';
            return cachedQuill;
        }
        return TableBlot.createCellEditor(cellId, targetCell, editor);
    }
    static getCellId(cell) {
        let id = this.cellIds.get(cell);
        if (id)
            return id;
        id = Math.random().toString(36).substr(2, 9);
        this.cellIds.set(cell, id);
        cell.id = id;
        return id;
    }
    static removeControlsFromCell(cell) {
        const controlsList = cell.querySelectorAll('.ql-table-control');
        controlsList.forEach(control => control.remove());
        return controlsList;
    }
    static restoreControlsToCell(cell, controlsList) {
        controlsList.forEach(control => cell.appendChild(control));
    }
    static createCellEditor(cellId, targetCell, editor) {
        const perfTimer = NotesPerfTimer.start('createCellEditor');
        try {
            const { cellQuill, activationHash, computeCellHash } = editor.withHistoryIgnored(() => {
                var _a;
                const controlsList = this.removeControlsFromCell(targetCell);
                const cellQuill = editor.getCellEditor(targetCell);
                const cellRoot = cellQuill === null || cellQuill === void 0 ? void 0 : cellQuill.root;
                if (cellRoot) {
                    cellRoot.dataset.tableCellId = cellId;
                }
                const computeCellHash = () => {
                    const t = cellQuill.getText();
                    const s = t.endsWith('\n') ? t.slice(0, -1) : t;
                    return s.length > 0 ? QuillExtensions.computeHash(s) : '';
                };
                const activationHash = computeCellHash();
                if (editor.editorSettings.doMentionProcessing || editor.editorSettings.isSpellCheckEnabled) {
                    const staticHash = (_a = targetCell.dataset[CELL_PROCESSED_HASH_DATASET_KEY]) !== null && _a !== void 0 ? _a : '';
                    if (activationHash.length > 0 && activationHash !== staticHash) {
                        perfTimer.withContext('processVisible', 1);
                        QuillExtensions.processVisibleLines(cellQuill, editor, { force: true });
                    }
                    else {
                        perfTimer.withContext('processSkipped', 1);
                    }
                }
                this.restoreControlsToCell(targetCell, controlsList);
                return { cellQuill, activationHash, computeCellHash };
            });
            const cellStyle = window.getComputedStyle(targetCell);
            cellQuill.root.style.color = cellStyle.color;
            cellQuill.root.style.backgroundColor = cellStyle.backgroundColor;
            QuillExtensions.enableNavigationBetweenTableCells(cellQuill, editor);
            QuillExtensions.addCellEditorKeyboardBindings(cellQuill, editor);
            editor.tableState.editorCache[cellId] = {
                quill: cellQuill,
                cellElement: targetCell,
                removeListener: undefined
            };
            cellQuill.focus();
            const onSelectionChange = async (range) => {
                var _a, _b;
                if (!range) {
                    await new Promise(r => setTimeout(r, 0));
                    const activeEl = document.activeElement;
                    const focusInCell = activeEl && cellQuill.root && cellQuill.root.contains(activeEl);
                    const quillHasFocus = typeof cellQuill.hasFocus === 'function' && cellQuill.hasFocus();
                    if (focusInCell || quillHasFocus) {
                        return;
                    }
                    if (editor.isCellEditorKeptAlive)
                        return;
                    if (editor.isFocusInEditorChrome(activeEl))
                        return;
                    if (editor.editorSettings.doMentionProcessing || editor.editorSettings.isSpellCheckEnabled) {
                        const blurHash = computeCellHash();
                        if (blurHash !== activationHash) {
                            try {
                                await QuillExtensions.processVisibleLines(cellQuill, editor, { force: true, awaitCompletion: true });
                            }
                            catch (error) {
                                console.error('Failed to process cell text on blur:', error);
                            }
                        }
                    }
                    const blurDelta = cellQuill.getContents();
                    editor.withHistoryIgnored(() => {
                        const controlsList = this.removeControlsFromCell(targetCell);
                        const content = cellQuill.root.innerHTML;
                        targetCell.innerHTML = content || '<p><br></p>';
                        this.restoreControlsToCell(targetCell, controlsList);
                    });
                    this.storeCellDelta(targetCell, blurDelta);
                    targetCell.classList.remove('ql-container', 'ql-snow');
                    (_b = (_a = editor.tableState.editorCache[cellId]) === null || _a === void 0 ? void 0 : _a.removeListener) === null || _b === void 0 ? void 0 : _b.call(_a);
                    delete editor.tableState.editorCache[cellId];
                    if (editor.tableState.activeCellId === cellId) {
                        editor.tableState.activeCellId = undefined;
                    }
                }
            };
            editor.tableState.editorCache[cellId].removeListener = () => {
                cellQuill.off('selection-change', onSelectionChange);
            };
            cellQuill.on('selection-change', onSelectionChange);
            return cellQuill;
        }
        finally {
            perfTimer.stop();
        }
    }
    static buildStaticCellRequest(cell, editor) {
        const cellId = this.getCellId(cell);
        if (editor.tableState.editorCache[cellId]) {
            return null;
        }
        const text = QuillExtensions.getPlainTextFromHtml(cell.innerHTML);
        if (text.length === 0) {
            if (cell.dataset[CELL_PROCESSED_HASH_DATASET_KEY]) {
                delete cell.dataset[CELL_PROCESSED_HASH_DATASET_KEY];
            }
            if (cell.dataset[MISSPELLING_SKIP_DATASET_KEY]) {
                delete cell.dataset[MISSPELLING_SKIP_DATASET_KEY];
            }
            return null;
        }
        const computedHash = QuillExtensions.computeHash(text);
        if (cell.dataset[CELL_PROCESSED_HASH_DATASET_KEY] === computedHash) {
            return null;
        }
        cell.dataset[CELL_PROCESSED_HASH_DATASET_KEY] = computedHash;
        return { cellId, text, hashValue: computedHash };
    }
    static async processStaticTable(table, editor) {
        if (!editor.dotNetHelper) {
            return;
        }
        if (table.rows.length === 0) {
            return;
        }
        const viewportBottom = window.innerHeight || document.documentElement.clientHeight;
        const tableRect = table.getBoundingClientRect();
        if (tableRect.bottom < 0 || tableRect.top > viewportBottom) {
            return;
        }
        const batch = [];
        for (let r = 0; r < table.rows.length; r++) {
            const row = table.rows[r];
            const rowRect = row.getBoundingClientRect();
            if (rowRect.bottom < 0)
                continue;
            if (rowRect.top > viewportBottom)
                break;
            for (let c = 0; c < row.cells.length; c++) {
                const req = this.buildStaticCellRequest(row.cells[c], editor);
                if (req) {
                    batch.push(req);
                }
            }
        }
        if (batch.length === 0) {
            return;
        }
        await editor.dotNetHelper.invokeMethodAsync('ProcessCells', batch);
    }
    static getEditorForCellId(cellId) {
        const cell = document.getElementById(cellId);
        if (!cell) {
            return null;
        }
        const table = cell.closest('table');
        if (!table) {
            return null;
        }
        const editor = TableBlot.getEditorForTable(table);
        if (!editor || !editor.tableState.editorCache[cellId]) {
            return null;
        }
        return editor.tableState.editorCache[cellId];
    }
}
TableBlot.blotName = 'table';
TableBlot.tagName = 'table';
TableBlot._batchDepth = 0;
TableBlot.cellDeltas = new WeakMap();
TableBlot.tableSelectionChangeListener = (table, startCell, endCell) => {
    var _a;
    const editor = TableBlot.getEditorForTable(table);
    if ((_a = editor.tableResizer) === null || _a === void 0 ? void 0 : _a.isDragging) {
        return;
    }
    TableBlot.setTableSelection(table, startCell, endCell);
};
TableBlot.getTableSelection = (table) => ({
    startRow: parseInt(table.dataset.selectionStartRow || '-1'),
    startCol: parseInt(table.dataset.selectionStartCol || '-1'),
    endRow: parseInt(table.dataset.selectionEndRow || '-1'),
    endCol: parseInt(table.dataset.selectionEndCol || '-1')
});
TableBlot.controlSize = 20;
TableBlot.innerControlSize = 7;
TableBlot.controlIconSize = 14;
TableBlot.POSITION_DEPENDENT_FORMAT_KEYS = [
    'table-alt-background-color',
    'table-line-color',
    'table-first-row-background-color',
    'table-first-row-foreground-color',
    'table-first-row-line-color',
    'table-first-column-background-color',
    'table-first-column-foreground-color',
    'table-first-column-line-color',
];
TableBlot.cellIds = new WeakMap();
class AnimatedCaret {
    constructor(quill) {
        this.lastTextChangeTime = 0;
        this.lastMouseDownTime = 0;
        this.lastSelectionIndex = null;
        this.animationFrameId = null;
        this.hideTimerId = null;
        this.onMouseDown = () => {
            this.lastMouseDownTime = performance.now();
            this.cancelTimers();
            this.caretEl.style.display = 'none';
        };
        this.onTextChange = () => {
            this.lastTextChangeTime = performance.now();
            this.cancel();
        };
        this.onSelectionChange = (range, oldRange) => {
            var _a, _b;
            if (!range || range.length > 0) {
                this.cancel();
                this.lastSelectionIndex = (_a = range === null || range === void 0 ? void 0 : range.index) !== null && _a !== void 0 ? _a : null;
                return;
            }
            const now = performance.now();
            if (now - this.lastTextChangeTime < AnimatedCaret.TYPING_RECENT_MS) {
                this.lastSelectionIndex = range.index;
                return;
            }
            if (now - this.lastMouseDownTime < AnimatedCaret.CLICK_RECENT_MS) {
                this.cancel();
                this.lastSelectionIndex = range.index;
                return;
            }
            const fromIdx = (_b = oldRange === null || oldRange === void 0 ? void 0 : oldRange.index) !== null && _b !== void 0 ? _b : this.lastSelectionIndex;
            const toIdx = range.index;
            this.lastSelectionIndex = toIdx;
            if (fromIdx == null || fromIdx === toIdx)
                return;
            this.animate(fromIdx, toIdx);
        };
        this.quill = quill;
        this.editorRoot = quill.root;
        this.caretEl = document.createElement('div');
        this.caretEl.style.position = 'absolute';
        this.caretEl.style.width = '1px';
        this.caretEl.style.backgroundColor = 'currentColor';
        this.caretEl.style.pointerEvents = 'none';
        this.caretEl.style.zIndex = '999';
        this.caretEl.style.display = 'none';
        quill.container.appendChild(this.caretEl);
        quill.on('text-change', this.onTextChange);
        quill.on('selection-change', this.onSelectionChange);
        quill.container.addEventListener('mousedown', this.onMouseDown, true);
    }
    dispose() {
        this.quill.off('text-change', this.onTextChange);
        this.quill.off('selection-change', this.onSelectionChange);
        this.quill.container.removeEventListener('mousedown', this.onMouseDown, true);
        this.cancel();
        this.caretEl.remove();
    }
    animate(fromIdx, toIdx) {
        const fromBounds = this.quill.getBounds(fromIdx);
        const toBounds = this.quill.getBounds(toIdx);
        if (!fromBounds || !toBounds)
            return;
        const dx = toBounds.left - fromBounds.left;
        const dy = toBounds.top - fromBounds.top;
        const distance = Math.sqrt(dx * dx + dy * dy);
        let duration;
        if (distance >= 1200) {
            this.cancel();
            return;
        }
        if (distance < 30)
            duration = 51;
        else if (distance < 250)
            duration = 119;
        else
            duration = 153;
        this.cancelTimers();
        this.caretEl.style.left = `${fromBounds.left}px`;
        this.caretEl.style.top = `${fromBounds.top}px`;
        this.caretEl.style.height = `${toBounds.height}px`;
        this.caretEl.style.display = 'block';
        this.editorRoot.style.caretColor = 'transparent';
        const startTime = performance.now();
        const step = (now) => {
            const t = Math.min(1, (now - startTime) / duration);
            const eased = t * (2 - t);
            this.caretEl.style.left = `${fromBounds.left + (toBounds.left - fromBounds.left) * eased}px`;
            this.caretEl.style.top = `${fromBounds.top + (toBounds.top - fromBounds.top) * eased}px`;
            if (t < 1) {
                this.animationFrameId = requestAnimationFrame(step);
            }
            else {
                this.animationFrameId = null;
                this.editorRoot.style.caretColor = '';
                this.hideTimerId = window.setTimeout(() => {
                    this.caretEl.style.display = 'none';
                    this.hideTimerId = null;
                }, AnimatedCaret.POST_ANIMATION_HOLD_MS);
            }
        };
        this.animationFrameId = requestAnimationFrame(step);
    }
    cancel() {
        this.cancelTimers();
        this.editorRoot.style.caretColor = '';
        this.caretEl.style.display = 'none';
    }
    cancelTimers() {
        if (this.animationFrameId !== null) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        if (this.hideTimerId !== null) {
            clearTimeout(this.hideTimerId);
            this.hideTimerId = null;
        }
    }
}
AnimatedCaret.TYPING_RECENT_MS = 50;
AnimatedCaret.CLICK_RECENT_MS = 50;
AnimatedCaret.POST_ANIMATION_HOLD_MS = 530;
class TableCellDragHandler {
    constructor(table, listener) {
        this.startCell = null;
        this.endCell = null;
        this.isPointerDown = false;
        this.hasMovedToAnotherCell = false;
        this.setupEventListeners = () => {
            this.table.addEventListener('pointerdown', this.handlePointerDown);
            this.table.addEventListener('pointermove', this.handlePointerMove);
            this.table.addEventListener('pointerup', this.handlePointerUp);
        };
        this.getCellFromPoint = (x, y) => {
            const element = TableBlot.elementFromPointIgnoreClasses(x, y, ['ql-table-control']);
            if (!element)
                return null;
            const cell = element.closest('td, th');
            if (cell && this.table.contains(cell)) {
                return cell;
            }
            return null;
        };
        this.clearSelection = () => {
            this.startCell = null;
            this.endCell = null;
            this.hasMovedToAnotherCell = false;
            this.fireCellSelectionChangedEvent();
        };
        this.handlePointerDown = (e) => {
            if (e.button !== 0) {
                return;
            }
            this.clearSelection();
            const cell = this.getCellFromPoint(e.clientX, e.clientY);
            if (!cell) {
                return;
            }
            this.startCell = cell;
            this.isPointerDown = true;
        };
        this.handlePointerMove = (e) => {
            var _a, _b;
            if (!this.isPointerDown || !this.startCell)
                return;
            const cell = this.getCellFromPoint(e.clientX, e.clientY);
            if (!cell)
                return;
            if (cell === this.startCell) {
                if (this.hasMovedToAnotherCell) {
                    this.endCell = null;
                    this.hasMovedToAnotherCell = false;
                    this.fireCellSelectionChangedEvent();
                }
                return;
            }
            const editor = TableBlot.getEditorForTable(this.table);
            if (editor === null || editor === void 0 ? void 0 : editor.tableState.activeCellId) {
                const cached = editor.tableState.editorCache[editor.tableState.activeCellId];
                if (cached) {
                    (_a = cached.removeListener) === null || _a === void 0 ? void 0 : _a.call(cached);
                    (_b = cached.quill) === null || _b === void 0 ? void 0 : _b.setSelection(0, 0, 'silent');
                }
            }
            const sel = window.getSelection();
            if (sel && !sel.isCollapsed) {
                sel.removeAllRanges();
            }
            this.table.setPointerCapture(e.pointerId);
            this.hasMovedToAnotherCell = true;
            if (cell !== this.endCell) {
                this.endCell = cell;
                this.fireCellSelectionChangedEvent();
            }
        };
        this.handlePointerUp = (e) => {
            var _a, _b;
            if (this.isPointerDown) {
                const wasMultiCellDrag = this.hasMovedToAnotherCell;
                const dragStartCell = this.startCell;
                this.isPointerDown = false;
                this.hasMovedToAnotherCell = false;
                if (this.table.hasPointerCapture(e.pointerId)) {
                    this.table.releasePointerCapture(e.pointerId);
                }
                const editor = TableBlot.getEditorForTable(this.table);
                if (!editor)
                    return;
                if (wasMultiCellDrag) {
                    const activeId = editor.tableState.activeCellId;
                    if (activeId) {
                        (_b = (_a = editor.tableState.editorCache[activeId]) === null || _a === void 0 ? void 0 : _a.quill) === null || _b === void 0 ? void 0 : _b.focus();
                    }
                    return;
                }
                if (!dragStartCell)
                    return;
                const sel = window.getSelection();
                if (!sel || sel.isCollapsed || sel.rangeCount === 0)
                    return;
                const range = sel.getRangeAt(0);
                let startOffset = 0;
                let length = 0;
                try {
                    startOffset = QuillExtensions.domToQuillIndex(dragStartCell, range.startContainer, range.startOffset);
                    const endOffset = QuillExtensions.domToQuillIndex(dragStartCell, range.endContainer, range.endOffset);
                    length = endOffset - startOffset;
                }
                catch (err) {
                    return;
                }
                const cellQuill = TableBlot.activateCell(dragStartCell, editor);
                if (cellQuill === null || cellQuill === void 0 ? void 0 : cellQuill.setSelection) {
                    try {
                        cellQuill.setSelection(startOffset, length, 'silent');
                    }
                    catch (err) {
                    }
                }
            }
        };
        this.clear = () => {
            this.clearSelection();
        };
        this.destroy = () => {
            this.table.removeEventListener('pointerdown', this.handlePointerDown);
            this.table.removeEventListener('pointermove', this.handlePointerMove);
            this.table.removeEventListener('pointerup', this.handlePointerUp);
            this.listener = null;
            this.clearSelection();
        };
        this.table = table;
        this.listener = listener;
        this.setupEventListeners();
    }
    fireCellSelectionChangedEvent() {
        if (!this.listener) {
            return;
        }
        this.listener(this.table, this.startCell, this.endCell);
    }
}
class TableData {
    constructor() {
        this.columns = 3;
        this.rows = 2;
        this.cells = Array.from({ length: 3 }, () => Array(3).fill(""));
    }
}
class QuillExtensions {
    static createHeadlessQuill() {
        const container = document.createElement('div');
        container.style.display = 'none';
        document.body.appendChild(container);
        const quill = new Quill(container, {
            modules: {
                toolbar: false
            },
            theme: 'snow'
        });
        const cleanup = () => {
            container.remove();
        };
        return { quill, cleanup };
    }
    static getHeadlessHtml(quill) {
        return this.removeTrailingNewlinesFromHtml(quill.root.innerHTML);
    }
    static getQuill(blot) {
        if (!blot.scroll.domNode.parentNode) {
            return null;
        }
        return Quill.find(blot.scroll.domNode.parentNode);
    }
    static convertDeltaToHtml(delta) {
        const { quill, cleanup } = this.createHeadlessQuill();
        try {
            quill.setContents(delta);
            let html = quill.root.innerHTML;
            html = this.expandTableOfContentsBlots(html, quill);
            return html;
        }
        finally {
            cleanup();
        }
    }
    static getPlainTextFromHtml(html) {
        const { quill, cleanup } = this.createHeadlessQuill();
        try {
            quill.clipboard.dangerouslyPasteHTML(html);
            let text = quill.getText();
            if (text.endsWith('\n')) {
                text = text.slice(0, -1);
            }
            return text;
        }
        finally {
            cleanup();
        }
    }
    static expandTableOfContentsBlots(html, quill) {
        if (!html.includes('data-toc="true"')) {
            return html;
        }
        const headings = extractHeadings(quill);
        const tocItemsHtml = TableOfContentsBlot.generateTOCItemsHtml(headings, true);
        const tocHtml = `<div class="ql-toc" contenteditable="false" data-toc="true">
  <div class="ql-toc-container">
    <div class="ql-toc-items">
${tocItemsHtml}
    </div>
  </div>
</div>`;
        const tocRegex = /<div class="ql-toc"[^>]*data-toc="true"[^>]*>[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/g;
        html = html.replace(tocRegex, tocHtml);
        html = this.addHeadingIds(html, headings);
        return html;
    }
    static addHeadingIds(html, headings) {
        let headingIndex = 0;
        html = html.replace(/<h([1-6])([^>]*)>([\s\S]*?)<\/h\1>/gi, (match, level, attrs, content) => {
            if (attrs.includes('id=')) {
                return match;
            }
            const plainText = content.replace(/<[^>]+>/g, '').trim();
            if (plainText.endsWith('\u200B') || plainText.endsWith('\u200C')) {
                return match;
            }
            if (headingIndex < headings.length) {
                const heading = headings[headingIndex];
                headingIndex++;
                const anchorId = TableOfContentsBlot.generateAnchorId(heading.text);
                return `<h${level}${attrs} id="${anchorId}">${content}</h${level}>`;
            }
            return match;
        });
        return html;
    }
    static applyFormattingToHtml(html, formats) {
        const { quill, cleanup } = this.createHeadlessQuill();
        try {
            quill.clipboard.dangerouslyPasteHTML(html);
            quill.formatText(0, quill.getLength(), formats);
            return this.getHeadlessHtml(quill);
        }
        finally {
            cleanup();
        }
    }
    static applyTextProcessesToHtml(html, processes) {
        var _a;
        const { quill, cleanup } = this.createHeadlessQuill();
        try {
            quill.clipboard.dangerouslyPasteHTML(html);
            quill.formatText(0, quill.getLength(), 'mention', '', 'silent');
            quill.formatText(0, quill.getLength(), 'misspelling', '', 'silent');
            let text = quill.getText();
            if (text.endsWith('\n')) {
                text = text.slice(0, -1);
            }
            const delta = quill.getContents();
            const { skipRanges, autoLinkRanges } = this.extractMisspellingSkipRanges(text, (_a = delta === null || delta === void 0 ? void 0 : delta.ops) !== null && _a !== void 0 ? _a : []);
            processes.forEach(process => {
                var _a;
                const textStart = process.index;
                const textEnd = process.index + process.length;
                if (process.property === 'misspelling' && process.value) {
                    const overlapsSkipRange = skipRanges.some(range => textStart < range.end && textEnd > range.start);
                    if (overlapsSkipRange) {
                        return;
                    }
                    const segment = text.substring(textStart, textEnd);
                    if (URL_EXACT_REGEX.test(segment) || EMAIL_EXACT_REGEX.test(segment)) {
                        return;
                    }
                }
                const deltaIndex = this.convertTextOffsetToDeltaIndexFromOps((_a = delta === null || delta === void 0 ? void 0 : delta.ops) !== null && _a !== void 0 ? _a : [], process.index);
                if (process.property === 'mention' && process.value) {
                    const formats = quill.getFormat(deltaIndex, Math.max(process.length, 1));
                    if (formats.link) {
                        return;
                    }
                }
                if (process.property === 'misspelling' && process.value) {
                    const formats = quill.getFormat(deltaIndex, process.length);
                    if (formats.link) {
                        return;
                    }
                }
                quill.formatText(deltaIndex, process.length, process.property, process.value, 'silent');
            });
            autoLinkRanges.forEach(range => {
                var _a;
                const length = range.end - range.start;
                if (length <= 0) {
                    return;
                }
                const segment = text.substring(range.start, range.end);
                const deltaIndex = this.convertTextOffsetToDeltaIndexFromOps((_a = delta === null || delta === void 0 ? void 0 : delta.ops) !== null && _a !== void 0 ? _a : [], range.start);
                const formats = quill.getFormat(deltaIndex, length);
                if (formats.link) {
                    return;
                }
                const isEmail = EMAIL_EXACT_REGEX.test(segment);
                const linkValue = isEmail ? `mailto:${segment}` : segment;
                quill.formatText(deltaIndex, length, 'link', linkValue, 'silent');
            });
            return {
                html: this.getHeadlessHtml(quill),
                skipRanges
            };
        }
        finally {
            cleanup();
        }
    }
    static removeFormat(html) {
        const { quill, cleanup } = this.createHeadlessQuill();
        try {
            quill.clipboard.dangerouslyPasteHTML(html);
            quill.removeFormat(0, quill.getLength(), 'user');
            return this.getHeadlessHtml(quill);
        }
        finally {
            cleanup();
        }
    }
    static clearMentionAndMisspellingFromHtml(html) {
        const { quill, cleanup } = this.createHeadlessQuill();
        try {
            quill.clipboard.dangerouslyPasteHTML(html);
            quill.formatText(0, quill.getLength(), 'mention', '', 'silent');
            quill.formatText(0, quill.getLength(), 'misspelling', '', 'silent');
            return this.getHeadlessHtml(quill);
        }
        finally {
            cleanup();
        }
    }
    static removeTrailingNewlinesFromHtml(html) {
        const result = html.replace(/(<p><br><\/p>|<p><\/p>)+$/g, '');
        return result;
    }
    static removeTrailingNewlinesFromDelta(delta) {
        const cleanedDelta = JSON.parse(JSON.stringify(delta));
        if (!cleanedDelta.ops || cleanedDelta.ops.length === 0) {
            return cleanedDelta;
        }
        while (cleanedDelta.ops.length > 0) {
            const lastOp = cleanedDelta.ops[cleanedDelta.ops.length - 1];
            if (typeof lastOp.insert !== 'string' || !lastOp.insert.endsWith('\n'))
                break;
            const trimmed = lastOp.insert.replace(/\n+$/, '');
            if (trimmed === '') {
                cleanedDelta.ops.pop();
            }
            else {
                lastOp.insert = trimmed;
                break;
            }
        }
        return cleanedDelta;
    }
    static convertHtmlToDelta(html) {
        const { quill, cleanup } = this.createHeadlessQuill();
        try {
            return quill.clipboard.convert({ html: html });
        }
        finally {
            cleanup();
        }
    }
    static addCellEditorKeyboardBindings(quill, venusEditor) {
        quill.keyboard.addBinding({
            key: this.ArrowLeft,
            shiftKey: true
        }, (range, context) => {
            return this.handleShiftArrowKey(quill, this.ArrowLeft, range, context, venusEditor);
        });
        quill.keyboard.addBinding({
            key: this.ArrowUp,
            shiftKey: true
        }, (range, context) => {
            return this.handleShiftArrowKey(quill, this.ArrowUp, range, context, venusEditor);
        });
        quill.keyboard.addBinding({
            key: this.ArrowRight,
            shiftKey: true
        }, (range, context) => {
            return this.handleShiftArrowKey(quill, this.ArrowRight, range, context, venusEditor);
        });
        quill.keyboard.addBinding({
            key: this.ArrowDown,
            shiftKey: true
        }, (range, context) => {
            return this.handleShiftArrowKey(quill, this.ArrowDown, range, context, venusEditor);
        });
        quill.keyboard.addBinding({ key: 'Escape' }, (range, context) => {
            if (venusEditor.tableState.lastTableWithSelection) {
                TableBlot.setTableSelection(venusEditor.tableState.lastTableWithSelection, null, null);
                return false;
            }
            return true;
        });
        QuillExtensions.addMathSelectionHoldBindings(quill, venusEditor);
        QuillExtensions.interceptDeleteKey(quill, venusEditor);
    }
    static releaseCursorPastMath(quill, mathIndex, direction, editor) {
        const [line, offsetInLine] = quill.getLine(mathIndex);
        let targetIndex;
        if (direction === 'right') {
            targetIndex = mathIndex + 1;
            if (line) {
                const lineLength = line.length();
                const mathEndOffsetInLine = offsetInLine + 1;
                if (mathEndOffsetInLine >= lineLength - 1) {
                    const nextLineStart = mathIndex + 2;
                    if (nextLineStart < quill.getLength()) {
                        targetIndex = nextLineStart;
                    }
                    else {
                        return;
                    }
                }
            }
        }
        else {
            if (line && offsetInLine === 0) {
                if (mathIndex > 0) {
                    editor.skipMathAdjacentSelect = true;
                    quill.setSelection(mathIndex - 1, 0, 'user');
                }
                return;
            }
            targetIndex = mathIndex;
        }
        editor.skipMathAdjacentSelect = true;
        quill.setSelection(targetIndex, 0, 'user');
    }
    static tryVerticalNavIntoMathOnlyLine(quill, editor, event) {
        var _a, _b, _c;
        if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey)
            return false;
        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')
            return false;
        const range = quill.getSelection();
        if (!range || range.length > 0)
            return false;
        const [currentLine] = quill.getLine(range.index);
        if (!currentLine)
            return false;
        const targetLine = event.key === 'ArrowUp' ? currentLine.prev : currentLine.next;
        if (!targetLine)
            return false;
        const onlyChild = (_a = targetLine.children) === null || _a === void 0 ? void 0 : _a.head;
        if (!onlyChild || onlyChild !== ((_b = targetLine.children) === null || _b === void 0 ? void 0 : _b.tail))
            return false;
        if (((_c = onlyChild.statics) === null || _c === void 0 ? void 0 : _c.blotName) !== MathExpressionBlot.blotName)
            return false;
        const mathIndex = quill.getIndex(onlyChild);
        const entryDirection = event.key === 'ArrowUp' ? 'left' : 'right';
        event.preventDefault();
        event.stopPropagation();
        editor.enterMathHold(quill, onlyChild, mathIndex, entryDirection);
        return true;
    }
    static addMathSelectionHoldBindings(quill, editor) {
        const editorRoot = quill.container.querySelector('.ql-editor');
        if (!editorRoot)
            return;
        editorRoot.addEventListener('keydown', (event) => {
            var _a, _b, _c;
            if (this.tryVerticalNavIntoMathOnlyLine(quill, editor, event))
                return;
            if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) {
                if (editor.heldMathInfo && editor.heldMathInfo.quill === quill) {
                    editor.exitMathHold();
                }
                return;
            }
            const heldInfo = editor.heldMathInfo;
            const inHold = heldInfo !== null && heldInfo.quill === quill;
            if (inHold) {
                const mathIndex = heldInfo.mathIndex;
                if (event.key === 'ArrowRight') {
                    event.preventDefault();
                    event.stopPropagation();
                    editor.exitMathHold();
                    this.releaseCursorPastMath(quill, mathIndex, 'right', editor);
                    return;
                }
                if (event.key === 'ArrowLeft') {
                    event.preventDefault();
                    event.stopPropagation();
                    editor.exitMathHold();
                    this.releaseCursorPastMath(quill, mathIndex, 'left', editor);
                    return;
                }
                if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                    event.preventDefault();
                    event.stopPropagation();
                    editor.exitMathHold();
                    const [mathLine, mathLineOffset] = quill.getLine(mathIndex);
                    if (mathLine) {
                        const mathLineStart = mathIndex - mathLineOffset;
                        const probeIndex = event.key === 'ArrowUp'
                            ? mathLineStart - 1
                            : mathLineStart + mathLine.length();
                        if (probeIndex >= 0 && probeIndex < quill.getLength()) {
                            const [adjacentLine] = quill.getLine(probeIndex);
                            if (adjacentLine) {
                                const adjacentStart = quill.getIndex(adjacentLine);
                                const adjacentMax = Math.max(0, adjacentLine.length() - 1);
                                const targetOffset = Math.min(mathLineOffset, adjacentMax);
                                quill.setSelection(adjacentStart + targetOffset, 0, 'user');
                            }
                        }
                    }
                    return;
                }
                if (event.key === 'Enter') {
                    event.preventDefault();
                    event.stopPropagation();
                    const [blot] = quill.getLeaf(mathIndex + 1);
                    if (blot)
                        editor.openMathDialogForBlot(quill, blot, mathIndex);
                    return;
                }
                if (event.key === 'Escape') {
                    event.preventDefault();
                    event.stopPropagation();
                    const releaseDirection = heldInfo.entryDirection === 'left' ? 'right' : 'left';
                    editor.exitMathHold();
                    this.releaseCursorPastMath(quill, mathIndex, releaseDirection, editor);
                    return;
                }
                if (event.key === 'Backspace' || event.key === 'Delete') {
                    event.preventDefault();
                    event.stopPropagation();
                    editor.exitMathHold();
                    editor.skipMathAdjacentSelect = true;
                    quill.deleteText(mathIndex, 1, 'user');
                    quill.setSelection(mathIndex, 0, 'user');
                    return;
                }
                if (event.key.length === 1) {
                    event.preventDefault();
                    event.stopPropagation();
                    const [blot] = quill.getLeaf(mathIndex + 1);
                    if (blot)
                        editor.openMathDialogForBlot(quill, blot, mathIndex);
                    return;
                }
                if (event.key === 'Home' || event.key === 'End' || event.key === 'Tab' || event.key === 'PageUp' || event.key === 'PageDown') {
                    editor.exitMathHold();
                }
                return;
            }
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')
                return;
            if (editor.editorSettings.readOnly)
                return;
            const range = quill.getSelection();
            if (!range || range.length !== 0)
                return;
            if (event.key === 'ArrowRight') {
                let mathBlot = null;
                let mathIndex = -1;
                const [leafAt] = quill.getLeaf(range.index);
                if (leafAt && ((_a = leafAt.statics) === null || _a === void 0 ? void 0 : _a.blotName) === MathExpressionBlot.blotName
                    && quill.getIndex(leafAt) === range.index) {
                    mathBlot = leafAt;
                    mathIndex = range.index;
                }
                else {
                    const [leafAhead] = quill.getLeaf(range.index + 1);
                    if (leafAhead && ((_b = leafAhead.statics) === null || _b === void 0 ? void 0 : _b.blotName) === MathExpressionBlot.blotName
                        && quill.getIndex(leafAhead) === range.index + 1) {
                        mathBlot = leafAhead;
                        mathIndex = range.index + 1;
                    }
                }
                if (!mathBlot)
                    return;
                event.preventDefault();
                event.stopPropagation();
                if (event.repeat) {
                    editor.skipMathAdjacentSelect = true;
                    quill.setSelection(mathIndex + 1, 0, 'user');
                    return;
                }
                editor.enterMathHold(quill, mathBlot, mathIndex, 'left');
                return;
            }
            if (event.key === 'ArrowLeft') {
                if (range.index === 0)
                    return;
                const [leafBefore] = quill.getLeaf(range.index - 1);
                if (!leafBefore || ((_c = leafBefore.statics) === null || _c === void 0 ? void 0 : _c.blotName) !== MathExpressionBlot.blotName)
                    return;
                const mathIndex = quill.getIndex(leafBefore);
                if (mathIndex !== range.index - 1)
                    return;
                event.preventDefault();
                event.stopPropagation();
                if (event.repeat) {
                    editor.skipMathAdjacentSelect = true;
                    quill.setSelection(mathIndex, 0, 'user');
                    return;
                }
                editor.enterMathHold(quill, leafBefore, mathIndex, 'right');
                return;
            }
        }, true);
    }
    static handleTabInCell(editor, forward) {
        const cellId = editor.tableState.activeCellId;
        if (!cellId)
            return true;
        const cellElement = document.getElementById(cellId);
        if (!cellElement)
            return true;
        const table = cellElement.closest('table');
        if (!table)
            return true;
        const target = forward
            ? TableBlot.getNextCell(cellElement, table)
            : TableBlot.getPreviousCell(cellElement, table);
        if (!target)
            return false;
        const cellQuill = TableBlot.activateCell(target, editor);
        if (cellQuill) {
            cellQuill.setSelection(0, 0, 'user');
        }
        return false;
    }
    static interceptDeleteKey(quill, venusEditor) {
        const editor = quill.container.querySelector('.ql-editor');
        editor.addEventListener('keydown', (event) => {
            if (event.key === 'Delete' || event.keyCode === this.Delete ||
                event.key === 'Backspace' || event.keyCode === this.Backspace) {
                if (!TableBlot.handleDeleteOrBackspace(venusEditor)) {
                    event.preventDefault();
                    event.stopPropagation();
                }
            }
        }, true);
    }
    static guardPrimaryDeleteWhileCellActive(quill, venusEditor) {
        const editor = quill.container.querySelector('.ql-editor');
        editor.addEventListener('keydown', (event) => {
            var _a, _b, _c, _d, _e, _f, _g;
            const isBackspace = event.key === 'Backspace' || event.keyCode === this.Backspace;
            const isDelete = event.key === 'Delete' || event.keyCode === this.Delete;
            if (!isBackspace && !isDelete)
                return;
            if (event.target !== quill.root)
                return;
            const activeId = venusEditor.tableState.activeCellId;
            if (!activeId)
                return;
            const range = quill.getSelection();
            if (!range)
                return;
            let wouldTouchTable = false;
            if (range.length === 0) {
                const [line, offset] = quill.getLine(range.index);
                if (line) {
                    if (((_a = line.statics) === null || _a === void 0 ? void 0 : _a.blotName) === 'table') {
                        wouldTouchTable = true;
                    }
                    else if (isBackspace && offset === 0 && ((_c = (_b = line.prev) === null || _b === void 0 ? void 0 : _b.statics) === null || _c === void 0 ? void 0 : _c.blotName) === 'table') {
                        wouldTouchTable = true;
                    }
                    else if (isDelete && offset === line.length() - 1 && ((_e = (_d = line.next) === null || _d === void 0 ? void 0 : _d.statics) === null || _e === void 0 ? void 0 : _e.blotName) === 'table') {
                        wouldTouchTable = true;
                    }
                }
            }
            else {
                const [startLine] = quill.getLine(range.index);
                const [endLine] = quill.getLine(range.index + range.length);
                if (((_f = startLine === null || startLine === void 0 ? void 0 : startLine.statics) === null || _f === void 0 ? void 0 : _f.blotName) === 'table' || ((_g = endLine === null || endLine === void 0 ? void 0 : endLine.statics) === null || _g === void 0 ? void 0 : _g.blotName) === 'table') {
                    wouldTouchTable = true;
                }
            }
            if (!wouldTouchTable)
                return;
            event.preventDefault();
            event.stopPropagation();
            const cached = venusEditor.tableState.editorCache[activeId];
            if (cached === null || cached === void 0 ? void 0 : cached.quill) {
                cached.quill.focus();
            }
        }, true);
    }
    static interceptPrimaryTableAdjacentDelete(quill, venusEditor) {
        const editor = quill.container.querySelector('.ql-editor');
        editor.addEventListener('keydown', (event) => {
            var _a, _b, _c, _d;
            const isBackspace = event.key === 'Backspace' || event.keyCode === this.Backspace;
            const isDelete = event.key === 'Delete' || event.keyCode === this.Delete;
            if (!isBackspace && !isDelete)
                return;
            if (event.target !== quill.root)
                return;
            const range = quill.getSelection();
            if (!range || range.length > 0)
                return;
            const [line, offset] = quill.getLine(range.index);
            if (!line)
                return;
            if (((_a = line.statics) === null || _a === void 0 ? void 0 : _a.blotName) === 'table')
                return;
            let adjacent = null;
            if (isBackspace && offset === 0) {
                adjacent = line.prev;
            }
            else if (isDelete && offset === line.length() - 1) {
                adjacent = line.next;
            }
            if (!adjacent || ((_b = adjacent.statics) === null || _b === void 0 ? void 0 : _b.blotName) !== 'table')
                return;
            const table = adjacent.domNode;
            const rows = table.rows.length;
            const cols = (_d = (_c = table.rows[0]) === null || _c === void 0 ? void 0 : _c.cells.length) !== null && _d !== void 0 ? _d : 0;
            if (rows === 0 || cols === 0)
                return;
            if (venusEditor.tableState.lastTableWithSelection === table) {
                const ts = TableBlot.getTableSelection(table);
                if (ts.startRow === 0 && ts.endRow === rows - 1 &&
                    ts.startCol === 0 && ts.endCol === cols - 1) {
                    event.preventDefault();
                    event.stopPropagation();
                    TableBlot.handleDeleteOrBackspace(venusEditor);
                    return;
                }
            }
            const firstCell = table.rows[0].cells[0];
            const lastCell = table.rows[rows - 1].cells[cols - 1];
            if (!firstCell || !lastCell)
                return;
            event.preventDefault();
            event.stopPropagation();
            TableBlot.setTableSelection(table, firstCell, lastCell, true);
        }, true);
    }
    static handleShiftArrowKey(quill, key, range, context, editor) {
        if (editor.tableState.lastTableWithSelection) {
            const table = editor.tableState.lastTableWithSelection;
            const startCell = TableBlot.getSelectionStartCell(table);
            const endCell = TableBlot.getSelectionEndCell(table);
            if (startCell && endCell) {
                const adjacent = TableBlot.getAdjacentCell(endCell, key, table);
                if (adjacent) {
                    TableBlot.setTableSelection(table, startCell, adjacent);
                }
                return false;
            }
        }
        if (!range) {
            return true;
        }
        const [currentLine, offset] = quill.getLine(range.index);
        if (!currentLine) {
            return true;
        }
        const startOfLineIndex = range.index - offset;
        const selectionEnd = range.index + range.length;
        if (key == this.ArrowLeft) {
            if (range.index > 0) {
                return true;
            }
        }
        if (key == this.ArrowRight) {
            if (range.index < quill.getLength() - 1 && selectionEnd < quill.getLength() - 1) {
                return true;
            }
        }
        if (key == this.ArrowUp) {
            if (startOfLineIndex > 0) {
                return true;
            }
        }
        if (key == this.ArrowDown) {
            if (startOfLineIndex + currentLine.length() < quill.getLength() - 1) {
                const [endLine, endOffset] = quill.getLine(selectionEnd);
                if (endLine) {
                    const endLineStart = selectionEnd - endOffset;
                    if (endLineStart + endLine.length() < quill.getLength() - 1) {
                        return true;
                    }
                }
                else {
                    return true;
                }
            }
        }
        if (key == this.ArrowUp || key == this.ArrowDown) {
            const selectBounds = quill.getBounds(range.index);
            if (!selectBounds) {
                return true;
            }
            const lineBounds = quill.getBounds(range.index - offset, currentLine.length());
            if (!lineBounds) {
                return true;
            }
            if (key == this.ArrowUp) {
                if (selectBounds.top > lineBounds.top + selectBounds.height / 2) {
                    return true;
                }
            }
            else {
                if (selectBounds.bottom < lineBounds.bottom - selectBounds.height / 2) {
                    return true;
                }
            }
        }
        const cellId = editor.tableState.activeCellId;
        if (!cellId) {
            return true;
        }
        const cellElement = document.getElementById(cellId);
        if (!cellElement) {
            return true;
        }
        const table = cellElement.closest('table');
        if (!table) {
            return true;
        }
        const adjacent = TableBlot.getAdjacentCell(cellElement, key, table);
        if (!adjacent) {
            return false;
        }
        TableBlot.setTableSelection(table, cellElement, adjacent);
        return false;
    }
    static enableNavigationBetweenTableCells(quill, venusEditor) {
        quill.keyboard.addBinding({
            key: this.ArrowLeft,
        }, (range, context) => {
            return this.handleArrowKeyToTraverseCells(quill, this.ArrowLeft, range, context, venusEditor);
        });
        quill.keyboard.addBinding({
            key: this.ArrowUp,
        }, (range, context) => {
            return this.handleArrowKeyToTraverseCells(quill, this.ArrowUp, range, context, venusEditor);
        });
        quill.keyboard.addBinding({
            key: this.ArrowRight
        }, (range, context) => {
            return this.handleArrowKeyToTraverseCells(quill, this.ArrowRight, range, context, venusEditor);
        });
        quill.keyboard.addBinding({
            key: this.ArrowDown
        }, (range, context) => {
            return this.handleArrowKeyToTraverseCells(quill, this.ArrowDown, range, context, venusEditor);
        });
        for (const arrowKey of [this.ArrowLeft, this.ArrowUp, this.ArrowRight, this.ArrowDown]) {
            quill.keyboard.addBinding({ key: arrowKey, shiftKey: true }, (range, context) => {
                return this.handleShiftArrowKey(quill, arrowKey, range, context, venusEditor);
            });
        }
        const modifiers = [{ ctrlKey: true }, { metaKey: true }];
        for (const mod of modifiers) {
            for (const arrowKey of [this.ArrowLeft, this.ArrowUp, this.ArrowRight, this.ArrowDown]) {
                quill.keyboard.addBinding(Object.assign({ key: arrowKey }, mod), (range, context) => {
                    return this.handleArrowKeyToTraverseCells(quill, arrowKey, range, context, venusEditor);
                });
            }
        }
    }
    static handleArrowKeyToTraverseCells(quill, key, range, context, editor) {
        if (!range) {
            return true;
        }
        const [currentLine, offset] = quill.getLine(range.index);
        if (!currentLine) {
            return true;
        }
        const startOfLineIndex = range.index - offset;
        const selectBounds = quill.getBounds(range.index);
        if (!selectBounds) {
            return true;
        }
        const quillContainer = quill.container;
        const cellBounds = quillContainer.getBoundingClientRect();
        let x = cellBounds.left + selectBounds.left + selectBounds.width / 2;
        let y = cellBounds.top + selectBounds.top + selectBounds.height / 2;
        if (key == this.ArrowLeft) {
            if (range.index > 0) {
                return true;
            }
            x = cellBounds.left - 4;
        }
        if (key == this.ArrowRight) {
            if (range.index < quill.getLength() - 1) {
                return true;
            }
            x = cellBounds.right + 4;
        }
        if (key == this.ArrowUp) {
            if (startOfLineIndex > 0) {
                return true;
            }
            y = cellBounds.top - 4;
        }
        if (key == this.ArrowDown) {
            if (startOfLineIndex + currentLine.length() < quill.getLength() - 1) {
                return true;
            }
            y = cellBounds.bottom + 4;
        }
        if (key == this.ArrowUp || key == this.ArrowDown) {
            const lineBounds = quill.getBounds(range.index - offset, currentLine.length());
            if (!lineBounds) {
                return true;
            }
            if (key == this.ArrowUp) {
                if (selectBounds.top > lineBounds.top + selectBounds.height / 2) {
                    return true;
                }
            }
            else {
                if (selectBounds.bottom < lineBounds.bottom - selectBounds.height / 2) {
                    return true;
                }
            }
        }
        TableBlot.activateEditorAt(x, y, true, editor);
        return false;
    }
    static detectEnterPress(quill, venusEditor) {
        const editor = quill.container.querySelector('.ql-editor');
        editor.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.keyCode === 13) {
                venusEditor.justPressedEnter = true;
            }
        }, true);
    }
    static enableTableBlot(quill, venusEditor) {
        quill.keyboard.addBinding({
            key: this.ArrowLeft,
        }, (range, context) => {
            return this.handleArrowKeyToEnterTableBlot(quill, this.ArrowLeft, range, context, venusEditor);
        });
        quill.keyboard.addBinding({
            key: this.ArrowUp,
        }, (range, context) => {
            return this.handleArrowKeyToEnterTableBlot(quill, this.ArrowUp, range, context, venusEditor);
        });
        quill.keyboard.addBinding({
            key: this.ArrowRight
        }, (range, context) => {
            return this.handleArrowKeyToEnterTableBlot(quill, this.ArrowRight, range, context, venusEditor);
        });
        quill.keyboard.addBinding({
            key: this.ArrowDown
        }, (range, context) => {
            return this.handleArrowKeyToEnterTableBlot(quill, this.ArrowDown, range, context, venusEditor);
        });
    }
    static handleArrowKeyToEnterTableBlot(quill, key, range, context, venusEditor) {
        if (!range) {
            return true;
        }
        const [currentLine, offset] = quill.getLine(range.index);
        if (!currentLine) {
            return true;
        }
        if (key == this.ArrowLeft) {
            if (offset > 0) {
                return true;
            }
        }
        if (key == this.ArrowRight) {
            const [leaf, leafOffset] = quill.getLeaf(range.index);
            if (!leaf) {
                return true;
            }
            if (QuillExtensions.isTableBlot(leaf)) {
                if (leafOffset == 0) {
                    const node = leaf.domNode;
                    const cells = node.querySelectorAll('td');
                    const cell = cells[0];
                    TableBlot.activateCell(cell, venusEditor);
                    return false;
                }
                else {
                    return true;
                }
            }
            else {
                if (offset < currentLine.length() - 1) {
                    return true;
                }
            }
        }
        if (key == this.ArrowUp || key == this.ArrowDown) {
            let selectBounds = quill.getBounds(range.index);
            let lineBounds = quill.getBounds(range.index - offset, currentLine.length());
            if (key == this.ArrowUp) {
                if (selectBounds.top > lineBounds.top + selectBounds.height / 2) {
                    return true;
                }
            }
            else {
                if (selectBounds.bottom < lineBounds.bottom - selectBounds.height / 2) {
                    return true;
                }
            }
        }
        const fromAbove = key == this.ArrowRight || key == this.ArrowDown;
        let towardIndex = -1;
        if (fromAbove) {
            towardIndex = range.index + (currentLine.length() - offset);
        }
        else {
            towardIndex = range.index - offset - 1;
        }
        const [leaf, leafOffset] = quill.getLeaf(towardIndex);
        if (!leaf || !QuillExtensions.isTableBlot(leaf)) {
            return true;
        }
        if (key == this.ArrowLeft || key == this.ArrowRight) {
            const node = leaf.domNode;
            const cells = node.querySelectorAll('td');
            const cell = fromAbove ? cells[0] : cells[cells.length - 1];
            const newQuill = TableBlot.activateCell(cell, venusEditor);
            if (!fromAbove) {
                newQuill === null || newQuill === void 0 ? void 0 : newQuill.setSelection(newQuill.getLength() - 1, 0, 'user');
            }
        }
        else {
            const selectBounds = quill.getBounds(range.index);
            const quillContainer = quill.container;
            const quillBounds = quillContainer.getBoundingClientRect();
            let x = quillBounds.left + selectBounds.left + selectBounds.width / 2;
            let y = 0;
            const tableBlotIndex = quill.getIndex(leaf);
            const tableBounds = quill.getBounds(tableBlotIndex, 1);
            if (!tableBounds) {
                return true;
            }
            if (x <= quillBounds.left + tableBounds.left) {
                x = quillBounds.left + tableBounds.left + 1;
            }
            if (x >= quillBounds.left + tableBounds.right) {
                x = quillBounds.left + tableBounds.right - 1;
            }
            if (key == this.ArrowUp) {
                y = quillBounds.top + tableBounds.bottom - 4;
            }
            else {
                y = quillBounds.top + tableBounds.top + 4;
            }
            TableBlot.activateEditorAt(x, y, false, venusEditor);
        }
        return false;
    }
    static isTableBlot(blot) {
        var _a;
        return blot && (((_a = blot.statics) === null || _a === void 0 ? void 0 : _a.blotName) === TableBlot.blotName);
    }
    static isHeadingChange(delta, oldDelta) {
        if (!delta || !Array.isArray(delta.ops) || delta.ops.length === 0) {
            return false;
        }
        if (!oldDelta || typeof oldDelta.slice !== 'function') {
            return false;
        }
        let position = 0;
        for (const op of delta.ops) {
            if (op.insert) {
                if (typeof op.insert === 'string') {
                    if (!op.insert.includes('\n') && this.isPositionInHeading(oldDelta, position)) {
                        return true;
                    }
                }
                continue;
            }
            if (op.delete) {
                const deleteCount = typeof op.delete === 'number' ? op.delete : 0;
                if (deleteCount > 0) {
                    for (let i = 0; i < deleteCount; i++) {
                        if (this.isPositionInHeading(oldDelta, position + i)) {
                            return true;
                        }
                    }
                }
                continue;
            }
            if (typeof op.retain === 'number') {
                if (op.attributes) {
                    for (let i = 0; i < op.retain; i++) {
                        if (this.isPositionInHeading(oldDelta, position + i)) {
                            return true;
                        }
                    }
                }
                position += op.retain;
                continue;
            }
        }
        return false;
    }
    static isPositionInHeading(delta, targetPosition) {
        if (!delta || !Array.isArray(delta.ops)) {
            return false;
        }
        let position = 0;
        let lineStartPosition = 0;
        for (const op of delta.ops) {
            if (op.insert && typeof op.insert === 'string') {
                const text = op.insert;
                for (let i = 0; i < text.length; i++) {
                    const currentPos = position + i;
                    if (text[i] === '\n') {
                        if (targetPosition >= lineStartPosition && targetPosition <= currentPos) {
                            return !!(op.attributes && op.attributes.header);
                        }
                        lineStartPosition = currentPos + 1;
                    }
                }
                position += text.length;
            }
        }
        return false;
    }
    static isStructuralChange(delta, oldDelta) {
        var _a, _b;
        if (!delta || !Array.isArray(delta.ops) || delta.ops.length === 0) {
            return false;
        }
        const structuralKeys = ['header', 'list', 'blockquote', 'code-block', 'indent'];
        let position = 0;
        for (const op of delta.ops) {
            if (op.insert) {
                if (typeof op.insert === 'object') {
                    return true;
                }
                if (typeof op.insert === 'string' && op.insert.includes('\n')) {
                    if (op.attributes && (op.attributes.header || op.attributes.list || op.attributes['code-block'] || op.attributes['blockquote'])) {
                        return true;
                    }
                }
            }
            if (op.delete) {
                const deleteCount = typeof op.delete === 'number' ? op.delete : 0;
                if (deleteCount > 0 && oldDelta && typeof oldDelta.slice === 'function') {
                    const removed = oldDelta.slice(position, position + deleteCount);
                    for (const removedOp of (_a = removed.ops) !== null && _a !== void 0 ? _a : []) {
                        if (typeof removedOp.insert === 'string' && removedOp.insert.includes('\n')) {
                            return true;
                        }
                        if (typeof removedOp.insert === 'object') {
                            return true;
                        }
                    }
                }
                continue;
            }
            if (typeof op.retain === 'number') {
                const attrs = (_b = op.attributes) !== null && _b !== void 0 ? _b : {};
                for (const key of Object.keys(attrs)) {
                    if (structuralKeys.includes(key)) {
                        const value = attrs[key];
                        if (value !== undefined) {
                            return true;
                        }
                    }
                }
                if (op.attributes === null) {
                    return true;
                }
                position += op.retain;
                continue;
            }
        }
        return false;
    }
    static setSelectionFromCoordinates(quill, x, y) {
        let index = QuillExtensions.getClosestIndex(quill, x, y);
        quill.setSelection(index, 0, 'user');
        return index;
    }
    static getClosestIndex(quill, x, y) {
        const textLength = quill.getLength();
        if (textLength === 0)
            return 0;
        let lo = 0;
        let hi = textLength - 1;
        let candidate = 0;
        while (lo <= hi) {
            const mid = Math.floor((lo + hi) / 2);
            const bounds = quill.getBounds(mid);
            const midCenterY = bounds.top + bounds.height / 2;
            if (midCenterY < y) {
                candidate = mid;
                lo = mid + 1;
            }
            else if (midCenterY > y) {
                hi = mid - 1;
            }
            else {
                candidate = mid;
                break;
            }
        }
        let bestIndex = candidate;
        let bestDistance = 9999;
        const range = 100;
        for (let i = candidate - range; i <= candidate + range; i++) {
            if (i < 0 || i >= textLength)
                continue;
            const d = QuillExtensions.getDistanceWithinRow(quill, i, x, y);
            if (d != null && d < bestDistance) {
                bestDistance = d;
                bestIndex = i;
            }
        }
        return bestIndex;
    }
    static getDistanceWithinRow(quill, index, x, y) {
        const bounds = quill.getBounds(index);
        if (!bounds || bounds.top > y || bounds.bottom < y) {
            return null;
        }
        return Math.abs(bounds.left - x);
    }
    static domToQuillIndex(root, container, offsetInContainer) {
        if (container === root && container.nodeType === Node.ELEMENT_NODE) {
            let total = 0;
            const children = root.childNodes;
            for (let i = 0; i < offsetInContainer && i < children.length; i++) {
                total += QuillExtensions.fullSubtreeLength(children[i]);
            }
            return total;
        }
        return QuillExtensions.walkToTarget(root, container, offsetInContainer);
    }
    static walkToTarget(node, container, offsetInContainer) {
        if (node === container) {
            if (node.nodeType === Node.TEXT_NODE) {
                return offsetInContainer;
            }
            let total = 0;
            const children = node.childNodes;
            for (let i = 0; i < offsetInContainer && i < children.length; i++) {
                total += QuillExtensions.fullSubtreeLength(children[i]);
            }
            return total;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) {
            return 0;
        }
        if (!node.contains(container)) {
            return QuillExtensions.fullSubtreeLength(node);
        }
        let total = 0;
        for (const child of Array.from(node.childNodes)) {
            if (child === container || (child.nodeType === Node.ELEMENT_NODE && child.contains(container))) {
                total += QuillExtensions.walkToTarget(child, container, offsetInContainer);
                return total;
            }
            total += QuillExtensions.fullSubtreeLength(child);
        }
        return total;
    }
    static fullSubtreeLength(node) {
        if (node.nodeType === Node.TEXT_NODE) {
            return node.length;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) {
            return 0;
        }
        let total = 0;
        for (const child of Array.from(node.childNodes)) {
            total += QuillExtensions.fullSubtreeLength(child);
        }
        if (QuillExtensions.QUILL_BLOCK_TAGS.has(node.tagName)) {
            total += 1;
        }
        return total;
    }
    static computeHash(text) {
        let hash = 5381;
        for (let i = 0; i < text.length; i++) {
            hash = ((hash << 5) + hash) + text.charCodeAt(i);
        }
        return hash.toString(16);
    }
    static getFirstGraphemeLength(text) {
        if (!text) {
            return 0;
        }
        const newlineIndex = text.indexOf('\n');
        const segmentSource = newlineIndex >= 0 ? text.slice(0, newlineIndex) : text;
        if (segmentSource.length === 0) {
            return 0;
        }
        if (this.graphemeSegmenter) {
            for (const segment of this.graphemeSegmenter.segment(segmentSource)) {
                if (segment && typeof segment.segment === 'string' && segment.segment.length > 0) {
                    return segment.segment.length;
                }
                break;
            }
        }
        const codePoint = segmentSource.codePointAt(0);
        if (codePoint === undefined) {
            return 0;
        }
        return codePoint > 0xFFFF ? 2 : 1;
    }
    static convertTextOffsetToDeltaIndex(quill, line, lineIndex, lineLength, textOffset) {
        const delta = quill.getContents(lineIndex, lineLength);
        let accumulated = 0;
        let deltaIndex = lineIndex;
        for (const op of delta.ops) {
            const isString = typeof op.insert === 'string';
            const textLen = isString ? op.insert.length : 0;
            const deltaLen = isString ? op.insert.length : 1;
            if (accumulated + textLen > textOffset) {
                deltaIndex += textOffset - accumulated;
                return deltaIndex;
            }
            accumulated += textLen;
            deltaIndex += deltaLen;
        }
        return deltaIndex;
    }
    static convertTextOffsetToDeltaIndexFromOps(deltaOps, textOffset) {
        let accumulated = 0;
        let deltaIndex = 0;
        for (const op of deltaOps) {
            const isString = typeof (op === null || op === void 0 ? void 0 : op.insert) === 'string';
            const textLen = isString ? op.insert.length : 0;
            const deltaLen = isString ? op.insert.length : 1;
            if (accumulated + textLen > textOffset) {
                return deltaIndex + (textOffset - accumulated);
            }
            accumulated += textLen;
            deltaIndex += deltaLen;
        }
        return deltaIndex;
    }
    static async processLine(quill, line, venusEditor) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
        if (!venusEditor.dotNetHelper) {
            return;
        }
        const lineIndex = quill.getIndex(line);
        const lineLength = line.length();
        const domNode = (_a = line === null || line === void 0 ? void 0 : line.domNode) !== null && _a !== void 0 ? _a : null;
        const containsTable = !!domNode && (((_b = domNode.matches) === null || _b === void 0 ? void 0 : _b.call(domNode, 'table.ql-table-blot')) ||
            ((_c = domNode.querySelector) === null || _c === void 0 ? void 0 : _c.call(domNode, 'table.ql-table-blot')) != null);
        if (lineLength <= 1 && !containsTable) {
            if ((_d = domNode === null || domNode === void 0 ? void 0 : domNode.dataset) === null || _d === void 0 ? void 0 : _d.processedHash) {
                delete domNode.dataset.processedHash;
            }
            if ((_e = domNode === null || domNode === void 0 ? void 0 : domNode.dataset) === null || _e === void 0 ? void 0 : _e[MISSPELLING_SKIP_DATASET_KEY]) {
                delete domNode.dataset[MISSPELLING_SKIP_DATASET_KEY];
            }
            return;
        }
        const delta = quill.getContents(lineIndex, lineLength);
        const text = quill.getText(lineIndex, lineLength);
        const computedHash = QuillExtensions.computeHash(text);
        const existingHash = (_f = domNode === null || domNode === void 0 ? void 0 : domNode.dataset) === null || _f === void 0 ? void 0 : _f.processedHash;
        if (existingHash === computedHash) {
            return;
        }
        if (domNode === null || domNode === void 0 ? void 0 : domNode.dataset) {
            domNode.dataset.processedHash = computedHash;
        }
        const { skipRanges, autoLinkRanges } = QuillExtensions.extractMisspellingSkipRanges(text, (_g = delta === null || delta === void 0 ? void 0 : delta.ops) !== null && _g !== void 0 ? _g : []);
        if (domNode === null || domNode === void 0 ? void 0 : domNode.dataset) {
            if (skipRanges.length > 0) {
                domNode.dataset[MISSPELLING_SKIP_DATASET_KEY] = JSON.stringify(skipRanges);
            }
            else if (domNode.dataset[MISSPELLING_SKIP_DATASET_KEY]) {
                delete domNode.dataset[MISSPELLING_SKIP_DATASET_KEY];
            }
        }
        QuillExtensions.syncAutoLinks(quill, line, lineIndex, lineLength, text, autoLinkRanges);
        if (domNode) {
            if ((_h = domNode.matches) === null || _h === void 0 ? void 0 : _h.call(domNode, 'table.ql-table-blot')) {
                await TableBlot.processStaticTable(domNode, venusEditor);
            }
            else {
                const tables = (_k = (_j = domNode.querySelectorAll) === null || _j === void 0 ? void 0 : _j.call(domNode, 'table.ql-table-blot')) !== null && _k !== void 0 ? _k : [];
                for (const tableElement of tables) {
                    await TableBlot.processStaticTable(tableElement, venusEditor);
                }
            }
        }
        if (!venusEditor.editorSettings.doMentionProcessing && !venusEditor.editorSettings.isSpellCheckEnabled) {
            return;
        }
        const context = venusEditor.isCellEditorInstance(quill) ? 'cell' : 'primary';
        const cellId = context === 'cell' ? venusEditor.getCellProcessingId(quill) : '';
        await safeInvokeAsync(venusEditor.dotNetHelper, 'ProcessLine', [text, lineIndex, lineLength, computedHash, context, cellId]);
    }
    static async processVisibleLines(quill, venusEditor, options) {
        var _a;
        if (!venusEditor.dotNetHelper) {
            return;
        }
        if (!(options === null || options === void 0 ? void 0 : options.force) && ((_a = quill.composition) === null || _a === void 0 ? void 0 : _a.isComposing)) {
            venusEditor._compositionPendingProcess = true;
            return;
        }
        const isCellQuill = venusEditor.isCellEditorInstance(quill);
        const shouldForce = (options === null || options === void 0 ? void 0 : options.force) === true;
        const shouldAwaitCompletion = (options === null || options === void 0 ? void 0 : options.awaitCompletion) === true;
        const activeEditor = typeof venusEditor.notesEditor === 'function' ? venusEditor.notesEditor() : venusEditor.notesEditor;
        const isActiveQuill = activeEditor === quill;
        const hasFocusedActiveEditor = !!(isActiveQuill && activeEditor && typeof activeEditor.hasFocus === 'function' && activeEditor.hasFocus());
        if (!shouldForce) {
            if (venusEditor.isProcessingVisibleLines) {
                return;
            }
            if (venusEditor.isCellEditorActive() && !isCellQuill) {
                return;
            }
            if (!venusEditor.editorSettings.readOnly && hasFocusedActiveEditor && venusEditor.editorSettings.clientOs == ClientOs.Android) {
                return;
            }
        }
        const visibleBounds = QuillExtensions.getVisibleEditorBounds(quill);
        if (!shouldForce && visibleBounds.height === 0) {
            return;
        }
        if (venusEditor.isProcessingVisibleLines && !shouldForce) {
            return;
        }
        venusEditor.isProcessingVisibleLines = true;
        const perfTimer = NotesPerfTimer.start('processVisibleLines');
        let linesProcessed = 0;
        try {
            const lines = quill.getLines();
            if (lines.length === 0)
                return;
            let low = 0;
            let high = lines.length - 1;
            while (low < high) {
                const mid = Math.floor((low + high) / 2);
                const midBounds = lines[mid].domNode.getBoundingClientRect();
                if (!shouldForce && midBounds.bottom < visibleBounds.top) {
                    low = mid + 1;
                }
                else {
                    high = mid;
                }
            }
            for (let i = low; i < lines.length; i++) {
                const lineBounds = lines[i].domNode.getBoundingClientRect();
                if (!shouldForce && lineBounds.top >= visibleBounds.bottom) {
                    break;
                }
                const maybePromise = QuillExtensions.processLine(quill, lines[i], venusEditor);
                linesProcessed++;
                if (maybePromise && typeof maybePromise.then === 'function') {
                    await maybePromise;
                    await new Promise(r => setTimeout(r, 0));
                }
            }
        }
        finally {
            venusEditor.isProcessingVisibleLines = false;
            perfTimer.withContext('lines', linesProcessed);
            perfTimer.stop();
        }
    }
    static getVisibleEditorBounds(quill) {
        const editorRect = quill.root.getBoundingClientRect();
        const viewportRect = {
            top: 0,
            left: 0,
            right: window.innerWidth,
            bottom: window.innerHeight
        };
        const intersectTop = Math.max(editorRect.top, viewportRect.top);
        const intersectLeft = Math.max(editorRect.left, viewportRect.left);
        const intersectBottom = Math.min(editorRect.bottom, viewportRect.bottom);
        const intersectRight = Math.min(editorRect.right, viewportRect.right);
        return new DOMRect(intersectLeft, intersectTop, intersectRight - intersectLeft, intersectBottom - intersectTop);
    }
    static extractMisspellingSkipRanges(text, deltaOps) {
        var _a, _b, _c, _d, _e;
        const skipRanges = [];
        const autoLinkRanges = [];
        const ops = Array.isArray(deltaOps) ? deltaOps : [];
        const mergeRanges = (input) => {
            if (!Array.isArray(input) || input.length === 0) {
                return [];
            }
            const filtered = input
                .filter(range => typeof (range === null || range === void 0 ? void 0 : range.start) === 'number' && typeof (range === null || range === void 0 ? void 0 : range.end) === 'number' && range.end > range.start)
                .map(range => ({ start: range.start, end: range.end }))
                .sort((a, b) => a.start - b.start);
            if (filtered.length === 0) {
                return [];
            }
            const merged = [filtered[0]];
            for (let i = 1; i < filtered.length; i++) {
                const current = filtered[i];
                const last = merged[merged.length - 1];
                if (current.start <= last.end) {
                    if (current.end > last.end) {
                        last.end = current.end;
                    }
                    continue;
                }
                merged.push({ start: current.start, end: current.end });
            }
            return merged;
        };
        let textOffset = 0;
        let isCodeBlockLine = false;
        for (const op of ops) {
            const insert = op === null || op === void 0 ? void 0 : op.insert;
            const isString = typeof insert === 'string';
            const textLen = isString ? insert.length : 0;
            const attributes = (_a = op === null || op === void 0 ? void 0 : op.attributes) !== null && _a !== void 0 ? _a : null;
            if (attributes && attributes['code-block']) {
                isCodeBlockLine = true;
            }
            if (attributes && attributes.code && isString && textLen > 0) {
                skipRanges.push({ start: textOffset, end: textOffset + textLen });
            }
            textOffset += textLen;
        }
        if (isCodeBlockLine) {
            const lineLength = text.length;
            if (lineLength > 0) {
                skipRanges.push({ start: 0, end: lineLength });
            }
        }
        let urlMatch;
        while ((urlMatch = URL_BOUNDARY_REGEX.exec(text)) !== null) {
            const matchText = urlMatch[0];
            if (!matchText) {
                break;
            }
            let start = (_b = urlMatch.index) !== null && _b !== void 0 ? _b : 0;
            let urlPortion = matchText;
            if (/\s/.test((_c = urlPortion[0]) !== null && _c !== void 0 ? _c : '')) {
                start += 1;
                urlPortion = urlPortion.substring(1);
            }
            const end = start + urlPortion.length;
            if (urlPortion.length > 0) {
                skipRanges.push({ start, end });
                autoLinkRanges.push({ start, end });
            }
        }
        URL_BOUNDARY_REGEX.lastIndex = 0;
        let emailMatch;
        while ((emailMatch = EMAIL_BOUNDARY_REGEX.exec(text)) !== null) {
            const core = emailMatch[1];
            if (!core) {
                continue;
            }
            const relativeStart = emailMatch[0].indexOf(core);
            const start = ((_d = emailMatch.index) !== null && _d !== void 0 ? _d : 0) + (relativeStart >= 0 ? relativeStart : 0);
            const end = start + core.length;
            skipRanges.push({ start, end });
            autoLinkRanges.push({ start, end });
        }
        EMAIL_BOUNDARY_REGEX.lastIndex = 0;
        let phoneMatch;
        while ((phoneMatch = PHONE_BOUNDARY_REGEX.exec(text)) !== null) {
            const core = phoneMatch[1];
            if (!core) {
                continue;
            }
            const relativeStart = phoneMatch[0].indexOf(core);
            const start = ((_e = phoneMatch.index) !== null && _e !== void 0 ? _e : 0) + (relativeStart >= 0 ? relativeStart : 0);
            const end = start + core.length;
            skipRanges.push({ start, end });
            autoLinkRanges.push({ start, end });
        }
        PHONE_BOUNDARY_REGEX.lastIndex = 0;
        return {
            skipRanges: mergeRanges(skipRanges),
            autoLinkRanges: mergeRanges(autoLinkRanges)
        };
    }
    static getMisspellingSkipRanges(domNode) {
        if (!(domNode === null || domNode === void 0 ? void 0 : domNode.dataset)) {
            return [];
        }
        const raw = domNode.dataset[MISSPELLING_SKIP_DATASET_KEY];
        if (!raw) {
            return [];
        }
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                return parsed.filter(range => typeof range.start === 'number' && typeof range.end === 'number');
            }
        }
        catch (_a) {
            delete domNode.dataset[MISSPELLING_SKIP_DATASET_KEY];
        }
        return [];
    }
    static syncAutoLinks(quill, line, lineIndex, lineLength, text, autoLinkRanges) {
        var _a;
        const domNode = (_a = line === null || line === void 0 ? void 0 : line.domNode) !== null && _a !== void 0 ? _a : null;
        if (!domNode) {
            return;
        }
        const findLinkNode = (index) => {
            const [leaf] = quill.getLeaf(index);
            if (!leaf) {
                return null;
            }
            let current = leaf;
            while (current && current.domNode && current.domNode !== line.domNode) {
                const dom = current.domNode;
                if (dom.nodeType === Node.ELEMENT_NODE && dom.tagName === 'A') {
                    return dom;
                }
                current = current.parent;
            }
            return null;
        };
        const existingAutoLinks = Array.from(domNode.querySelectorAll('a[data-autolink="true"]'));
        existingAutoLinks.forEach(node => {
            var _a, _b;
            const blot = Quill.find(node);
            if (!blot) {
                return;
            }
            const startIndex = quill.getIndex(blot);
            const length = (_b = (_a = node.textContent) === null || _a === void 0 ? void 0 : _a.length) !== null && _b !== void 0 ? _b : 0;
            if (length <= 0) {
                return;
            }
            const relativeOffset = startIndex - lineIndex;
            const matchesRange = autoLinkRanges.some(range => relativeOffset >= range.start && relativeOffset + length <= range.end);
            if (!matchesRange) {
                node.removeAttribute('data-autolink');
                quill.formatText(startIndex, length, 'link', false, 'silent');
            }
        });
        autoLinkRanges.forEach(range => {
            var _a;
            const start = range.start;
            const end = range.end;
            if (end <= start) {
                return;
            }
            const length = end - start;
            const segment = text.substring(start, end);
            const deltaIndex = QuillExtensions.convertTextOffsetToDeltaIndex(quill, line, lineIndex, lineLength, start);
            const isEmail = EMAIL_EXACT_REGEX.test(segment);
            const isPhone = !isEmail && PHONE_EXACT_REGEX.test(segment);
            const linkValue = isEmail ? `mailto:${segment}` : isPhone ? `tel:${segment}` : segment;
            const linkNode = findLinkNode(deltaIndex);
            const isExistingLink = linkNode !== null;
            const isAutoLink = (linkNode === null || linkNode === void 0 ? void 0 : linkNode.getAttribute('data-autolink')) === 'true';
            if (isExistingLink && !isAutoLink) {
                return;
            }
            if (isAutoLink) {
                if (linkNode.getAttribute('href') !== linkValue) {
                    quill.formatText(deltaIndex, length, 'link', linkValue, 'silent');
                    const refreshed = findLinkNode(deltaIndex);
                    refreshed === null || refreshed === void 0 ? void 0 : refreshed.setAttribute('data-autolink', 'true');
                    return;
                }
                linkNode.setAttribute('data-autolink', 'true');
                return;
            }
            quill.formatText(deltaIndex, length, 'link', linkValue, 'silent');
            (_a = findLinkNode(deltaIndex)) === null || _a === void 0 ? void 0 : _a.setAttribute('data-autolink', 'true');
        });
    }
}
QuillExtensions.ArrowLeft = 37;
QuillExtensions.ArrowUp = 38;
QuillExtensions.ArrowRight = 39;
QuillExtensions.ArrowDown = 40;
QuillExtensions.Delete = 46;
QuillExtensions.Backspace = 8;
QuillExtensions.graphemeSegmenter = (typeof Intl !== 'undefined' && Intl.Segmenter)
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null;
QuillExtensions.QUILL_BLOCK_TAGS = new Set([
    'P', 'DIV', 'BLOCKQUOTE', 'PRE', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'
]);
class TableResizer {
    constructor(table, fillColor) {
        this.isDragging = false;
        this.currentCol = null;
        this.startX = 0;
        this.startWidth = 0;
        this.fillColor = "";
        this.resizeObserver = null;
        this.MIN_COLUMN_WIDTH = 35;
        this.table = table;
        this.cols = this.table.getElementsByTagName('col');
        this.fillColor = fillColor;
        this.pointerMoveHandler = this.resize.bind(this);
        this.pointerUpHandler = this.stopResize.bind(this);
        this.pointerCancelHandler = this.stopResize.bind(this);
        document.addEventListener('pointermove', this.pointerMoveHandler);
        document.addEventListener('pointerup', this.pointerUpHandler);
        document.addEventListener('pointercancel', this.pointerCancelHandler);
        this.resizeObserver = new ResizeObserver(() => this.updateResizerHeights());
        this.resizeObserver.observe(this.table);
        this.refresh(fillColor);
    }
    refresh(fillColor) {
        var _a;
        this.fillColor = fillColor;
        const headerCells = (_a = this.table.querySelector('tr')) === null || _a === void 0 ? void 0 : _a.cells;
        if (!headerCells)
            return;
        const existing = this.table.querySelectorAll('.ql-column-resizer');
        if (existing.length === headerCells.length) {
            for (let i = 0; i < existing.length; i++) {
                existing[i].style.backgroundColor = fillColor;
            }
            this.updateResizerHeights();
            return;
        }
        existing.forEach(h => h.remove());
        for (let i = 0; i < headerCells.length; i++) {
            const cell = headerCells[i];
            const resizer = document.createElement('div');
            resizer.className = 'ql-column-resizer ql-table-control';
            resizer.style.backgroundColor = this.fillColor;
            cell.appendChild(resizer);
            cell.style.position = 'relative';
            resizer.addEventListener('pointerdown', (e) => this.startResize(e, i));
            resizer.addEventListener('touchstart', (e) => e.preventDefault());
        }
        this.updateResizerHeights();
    }
    pauseResizing() {
        const resizers = this.table.getElementsByClassName('ql-column-resizer');
        for (let i = 0; i < resizers.length; i++) {
            resizers[i].style.pointerEvents = 'none';
        }
    }
    resumeResizing() {
        const resizers = this.table.getElementsByClassName('ql-column-resizer');
        for (let i = 0; i < resizers.length; i++) {
            resizers[i].style.pointerEvents = '';
        }
    }
    updateResizerHeights() {
        const tableHeight = this.table.offsetHeight;
        const resizers = this.table.getElementsByClassName('ql-column-resizer');
        for (let i = 0; i < resizers.length; i++) {
            resizers[i].style.height = `${tableHeight - 2}px`;
        }
    }
    startResize(e, index) {
        this.isDragging = true;
        this.currentCol = this.cols[index];
        this.startX = e.pageX;
        this.startWidth = this.currentCol.offsetWidth;
        e.target.setPointerCapture(e.pointerId);
        document.body.style.cursor = 'ew-resize';
        document.body.style.userSelect = 'none';
    }
    resize(e) {
        if (!this.isDragging || !this.currentCol)
            return;
        const diffX = e.pageX - this.startX;
        const newWidth = Math.max(this.MIN_COLUMN_WIDTH, this.startWidth + diffX);
        this.currentCol.style.width = `${newWidth}px`;
    }
    stopResize(e) {
        if (!this.isDragging)
            return;
        if (this.currentCol && this.currentCol.style.width === `${this.MIN_COLUMN_WIDTH}px`) {
            this.currentCol.style.width = "";
        }
        const wasResizing = this.currentCol !== null;
        this.isDragging = false;
        this.currentCol = null;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        if (wasResizing && document.body.contains(this.table)) {
            this.commitColumnWidths();
        }
    }
    commitColumnWidths() {
        var _a;
        (_a = TableBlot.getEditorForTable(this.table)) === null || _a === void 0 ? void 0 : _a.commitTableColumnWidths(this.table);
    }
    destroy() {
        document.removeEventListener('pointermove', this.pointerMoveHandler);
        document.removeEventListener('pointerup', this.pointerUpHandler);
        document.removeEventListener('pointercancel', this.pointerCancelHandler);
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
        }
    }
}
const sharedTableRemovalObservers = new WeakMap();
class TableControlAdder {
    constructor(table, options) {
        this.editorRoot = null;
        this.horizontalEdgeControls = [];
        this.verticalEdgeControls = [];
        this.table = table;
        this.options = options;
        this.editorRoot = this.table.closest('.ql-editor');
        if (window.getComputedStyle(this.table).position === 'static') {
            this.table.style.position = 'relative';
        }
        this.buildControls();
        if (this.editorRoot) {
            this.attachToSharedRemovalObserver();
        }
    }
    attachToSharedRemovalObserver() {
        if (!this.editorRoot)
            return;
        let entry = sharedTableRemovalObservers.get(this.table);
        if (!entry) {
            const editorRoot = this.editorRoot;
            const table = this.table;
            const newEntry = {
                observer: null,
                adders: new Set(),
                editorRoot,
                table,
                checkScheduled: false,
            };
            newEntry.observer = new MutationObserver(() => {
                if (newEntry.checkScheduled)
                    return;
                newEntry.checkScheduled = true;
                requestAnimationFrame(() => {
                    newEntry.checkScheduled = false;
                    if (editorRoot.contains(table))
                        return;
                    const toDestroy = Array.from(newEntry.adders);
                    for (const a of toDestroy) {
                        a.destroy();
                    }
                });
            });
            newEntry.observer.observe(editorRoot, { childList: true, subtree: true });
            sharedTableRemovalObservers.set(table, newEntry);
            entry = newEntry;
        }
        entry.adders.add(this);
    }
    clearControls() {
        this.horizontalEdgeControls.forEach(({ control }) => control.remove());
        this.verticalEdgeControls.forEach(({ control }) => control.remove());
        this.horizontalEdgeControls = [];
        this.verticalEdgeControls = [];
    }
    rebuildControls() {
        this.clearControls();
        this.buildControls();
    }
    buildControls() {
        if (this.options.position === 'top' || this.options.position === 'bottom') {
            this.buildHorizontalControls();
        }
        else {
            this.buildVerticalControls();
        }
    }
    buildHorizontalControls() {
        const row = this.options.position === 'top'
            ? this.table.querySelector('tr')
            : this.table.querySelector('tr:last-child');
        if (!row)
            return;
        const cells = row.cells;
        let yTransform;
        if (this.options.position === 'top') {
            yTransform = 'translateY(-100%)';
        }
        else {
            yTransform = 'translateY(100%)';
        }
        if (this.options.placement === 'center') {
            for (let i = 0; i < cells.length; i++) {
                const cell = cells[i];
                if (window.getComputedStyle(cell).position === 'static') {
                    cell.style.position = 'relative';
                }
                const control = this.createControl('horizontal', this.options.position);
                control.style.left = '50%';
                control.style.transform = 'translateX(-50%) ' + yTransform;
                control.style.top = this.options.position === 'top' ? '0' : '';
                control.style.bottom = this.options.position === 'bottom' ? '0' : '';
                control.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.options.onClick(e, i, control, false);
                });
                control.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.options.onClick(e, i, control, true);
                });
                control.addEventListener('pointerdown', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                });
                cell.appendChild(control);
            }
        }
        else {
            const controlCount = cells.length + 1;
            for (let i = 0; i < controlCount; i++) {
                let targetCell;
                if (i === 0) {
                    targetCell = cells[0];
                }
                else if (i === controlCount - 1) {
                    targetCell = cells[cells.length - 1];
                }
                else {
                    targetCell = cells[i];
                }
                if (window.getComputedStyle(targetCell).position === 'static') {
                    targetCell.style.position = 'relative';
                }
                const control = this.createControl('horizontal', this.options.position);
                let xTransform;
                if (i === controlCount - 1) {
                    control.style.right = '0';
                    xTransform = 'translateX(50%)';
                }
                else {
                    control.style.left = '0';
                    xTransform = 'translateX(-50%)';
                }
                if (this.options.position === 'top') {
                    control.style.top = '0';
                }
                else {
                    control.style.bottom = '0';
                }
                control.style.transform = `${xTransform} ${yTransform}`;
                control.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.options.onClick(e, i, control, false);
                });
                control.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.options.onClick(e, i, control, true);
                });
                control.addEventListener('pointerdown', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                });
                targetCell.appendChild(control);
                this.horizontalEdgeControls.push({ control, index: i });
            }
        }
    }
    buildVerticalControls() {
        const rows = Array.from(this.table.rows);
        if (rows.length === 0)
            return;
        let xTransform;
        if (this.options.position === 'left') {
            xTransform = 'translateX(-100%)';
        }
        else {
            xTransform = 'translateX(100%)';
        }
        if (this.options.placement === 'center') {
            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                const cell = this.options.position === 'left'
                    ? row.cells[0]
                    : row.cells[row.cells.length - 1];
                if (!cell)
                    continue;
                if (window.getComputedStyle(cell).position === 'static') {
                    cell.style.position = 'relative';
                }
                const control = this.createControl('vertical', this.options.position);
                control.style.top = '50%';
                control.style.transform = xTransform + 'translateY(-50%)';
                control.style.left = this.options.position === 'left' ? '0' : '';
                control.style.right = this.options.position === 'right' ? '0' : '';
                control.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.options.onClick(e, i, control, false);
                });
                control.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.options.onClick(e, i, control, true);
                });
                control.addEventListener('pointerdown', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                });
                cell.appendChild(control);
            }
        }
        else {
            const controlCount = rows.length + 1;
            for (let i = 0; i < controlCount; i++) {
                let targetRow = rows[0];
                if (i === 0) {
                    targetRow = rows[0];
                }
                else if (i === controlCount - 1) {
                    targetRow = rows[rows.length - 1];
                }
                else {
                    targetRow = rows[i];
                }
                const targetCell = this.options.position === 'left'
                    ? targetRow.cells[0]
                    : targetRow.cells[targetRow.cells.length - 1];
                if (!targetCell)
                    continue;
                if (window.getComputedStyle(targetCell).position === 'static') {
                    targetCell.style.position = 'relative';
                }
                const control = this.createControl('vertical', this.options.position);
                let yTransform;
                if (i === controlCount - 1) {
                    control.style.bottom = '0';
                    yTransform = 'translateY(50%)';
                }
                else {
                    control.style.top = '0';
                    yTransform = 'translateY(-50%)';
                }
                if (this.options.position === 'left') {
                    control.style.left = '0';
                }
                else {
                    control.style.right = '0';
                }
                control.style.transform = `${xTransform} ${yTransform}`;
                control.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.options.onClick(e, i, control, false);
                });
                control.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.options.onClick(e, i, control, true);
                });
                control.addEventListener('pointerdown', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                });
                targetCell.appendChild(control);
                this.verticalEdgeControls.push({ control, index: i });
            }
        }
    }
    createControl(orientation, edge) {
        if (this.options.controlFactory) {
            const el = this.options.controlFactory(orientation, edge);
            el.style.position = 'absolute';
            el.style.cursor = 'default';
            return el;
        }
        const control = document.createElement('div');
        control.className = `table-control table-control-${orientation}`;
        control.style.position = 'absolute';
        control.style.cursor = 'default';
        return control;
    }
    destroy() {
        const entry = sharedTableRemovalObservers.get(this.table);
        if (entry) {
            entry.adders.delete(this);
            if (entry.adders.size === 0) {
                entry.observer.disconnect();
                sharedTableRemovalObservers.delete(this.table);
            }
        }
        this.clearControls();
    }
}
function getImageScale(element) {
    const scaleAttr = element.getAttribute('data-scale');
    if (scaleAttr) {
        return parseFloat(scaleAttr) || 1;
    }
    return 1;
}
function setImageScale(element, scale) {
    element.setAttribute('data-scale', scale.toString());
    if (element.naturalWidth > 0) {
        const targetWidth = element.naturalWidth * scale;
        element.style.width = targetWidth + 'px';
        element.style.height = 'auto';
    }
    else {
        element.addEventListener('load', function setScaleOnLoad() {
            const targetWidth = element.naturalWidth * scale;
            element.style.width = targetWidth + 'px';
            element.style.height = 'auto';
            element.removeEventListener('load', setScaleOnLoad);
        });
    }
}
class ImageControls {
    constructor(image) {
        this.outline = null;
        this.corners = [];
        this.scaleDisplay = null;
        this.isDragging = false;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.initialZoom = 1;
        this.initialScale = 1;
        this.currentCorner = 0;
        this.removalObserver = null;
        this.controlSize = 20;
        this.innerControlSize = 10;
        this.controlFillColor = "#88888888";
        this.controlOutlineColor = '#000000';
        this.onDrag = (e) => {
            if (!this.isDragging)
                return;
            const deltaX = (e.clientX - this.dragStartX) / this.initialScale;
            const naturalWidth = this.image.naturalWidth;
            const initialWidth = naturalWidth * this.initialZoom;
            let newScale;
            let targetWidth;
            switch (this.currentCorner) {
                case 0:
                case 2:
                    targetWidth = initialWidth - deltaX;
                    newScale = targetWidth / naturalWidth;
                    break;
                case 1:
                case 3:
                    targetWidth = initialWidth + deltaX;
                    newScale = targetWidth / naturalWidth;
                    break;
                default:
                    newScale = this.initialZoom;
                    break;
            }
            newScale = Math.min(Math.max(newScale, 0.05), 1);
            setImageScale(this.image, newScale);
            this.positionControls();
            this.updateScaleDisplay(newScale);
        };
        this.stopDrag = () => {
            this.isDragging = false;
            document.removeEventListener('mousemove', this.onDrag);
            document.removeEventListener('mouseup', this.stopDrag);
            this.editor.classList.remove('dragging-image-resize');
            const scale = getImageScale(this.image);
            const roundedScale = Math.round(scale * 20) / 20;
            setImageScale(this.image, roundedScale);
            this.positionControls();
            this.updateScaleDisplay(roundedScale);
            this.removeScaleDisplay();
        };
        this.image = image;
        this.editor = image.closest('.ql-editor');
        if (!this.editor)
            throw new Error('Image not in Quill editor');
        const backgroundColor = getEffectiveBackgroundColor(this.editor);
        const lum = getLuminance(backgroundColor);
        if (lum > 0.5) {
            this.controlOutlineColor = '#00000088';
            this.controlFillColor = '#00000044';
        }
        else {
            this.controlOutlineColor = '#ffffff88';
            this.controlFillColor = '#ffffff44';
        }
        this.container = this.editor.parentElement;
        if (!this.container)
            throw new Error('No parent container for .ql-editor');
        if (window.getComputedStyle(this.container).position === 'static') {
            this.container.style.position = 'relative';
        }
        this.addControls();
        this.removalObserver = new MutationObserver(() => {
            if (!this.editor.contains(this.image)) {
                this.destroy();
            }
        });
        this.removalObserver.observe(this.editor, { childList: true, subtree: true });
    }
    addControls() {
        if (this.corners.length > 0)
            return;
        this.outline = this.createOutline();
        this.corners = [
            this.createCorner('top-left', 0),
            this.createCorner('top-right', 1),
            this.createCorner('bottom-left', 2),
            this.createCorner('bottom-right', 3)
        ];
        this.corners.forEach((corner, index) => {
            corner.addEventListener('mousedown', (e) => this.startDrag(e, index));
        });
        this.positionControls();
        this.editor.classList.add('transparent-selection');
    }
    removeControls() {
        if (this.outline) {
            this.outline.remove();
            this.outline = null;
        }
        this.corners.forEach(corner => corner.remove());
        this.corners = [];
        if (this.scaleDisplay) {
            this.scaleDisplay.remove();
            this.scaleDisplay = null;
        }
        this.editor.classList.remove('transparent-selection');
    }
    createOutline() {
        const outline = document.createElement('div');
        outline.setAttribute('data-image-control', 'outline');
        outline.style.position = 'absolute';
        outline.style.border = '1px dashed ' + this.controlOutlineColor;
        outline.style.pointerEvents = 'none';
        outline.style.display = 'none';
        this.container.appendChild(outline);
        return outline;
    }
    createCorner(position, index) {
        const corner = document.createElement('div');
        corner.setAttribute('data-image-control', `corner-${index}`);
        corner.className = `image-control image-control-${position}`;
        corner.style.position = 'absolute';
        corner.style.width = this.controlSize + 'px';
        corner.style.height = this.controlSize + 'px';
        corner.style.zIndex = '10';
        corner.style.display = 'none';
        switch (index) {
            case 0:
                corner.style.cursor = 'nwse-resize';
                break;
            case 1:
                corner.style.cursor = 'nesw-resize';
                break;
            case 2:
                corner.style.cursor = 'nesw-resize';
                break;
            case 3:
                corner.style.cursor = 'nwse-resize';
                break;
        }
        const inner = document.createElement('div');
        inner.style.position = 'absolute';
        inner.style.width = this.innerControlSize + 'px';
        inner.style.height = this.innerControlSize + 'px';
        inner.style.left = (this.controlSize - this.innerControlSize) / 2 + 'px';
        inner.style.top = (this.controlSize - this.innerControlSize) / 2 + 'px';
        inner.style.background = this.controlFillColor;
        inner.style.borderRadius = this.innerControlSize + 'px';
        inner.style.border = '1px solid ' + this.controlOutlineColor;
        corner.appendChild(inner);
        this.container.appendChild(corner);
        return corner;
    }
    createScaleDisplay(scale) {
        if (this.scaleDisplay) {
            this.scaleDisplay.style.display = 'flex';
            this.scaleDisplay.style.opacity = '0.95';
            this.updateScaleDisplay(scale);
            return;
        }
        const display = document.createElement('div');
        display.setAttribute('data-image-control', 'scale-display');
        display.style.position = 'absolute';
        display.style.display = 'flex';
        display.style.alignItems = 'center';
        display.style.justifyContent = 'center';
        display.style.backgroundColor = 'rgb(131 131 131 / 43%)';
        display.style.backdropFilter = 'blur(28px)';
        display.style.border = '1px solid rgb(255 255 255 / 38%)';
        display.style.borderRadius = '8px';
        display.style.padding = '2px 8px';
        display.style.fontSize = '18px';
        display.style.fontWeight = 'bold';
        display.style.color = 'rgb(255 255 255 / 78%)';
        display.style.pointerEvents = 'none';
        display.style.zIndex = '15';
        display.style.userSelect = 'none';
        display.style.opacity = '0';
        display.style.transition = 'opacity 0.15s ease-in-out';
        display.textContent = Math.round(scale * 100 / 5) * 5 + '%';
        this.container.appendChild(display);
        this.scaleDisplay = display;
        this.positionScaleDisplay();
        requestAnimationFrame(() => {
            if (this.scaleDisplay) {
                this.scaleDisplay.style.opacity = '0.95';
            }
        });
    }
    positionScaleDisplay() {
        if (!this.scaleDisplay)
            return;
        const scale = getScaleFactor(this.container);
        const rect = this.image.getBoundingClientRect();
        const containerRect = this.container.getBoundingClientRect();
        const imageLeft = (rect.left - containerRect.left) / scale;
        const imageTop = (rect.top - containerRect.top) / scale;
        const imageWidth = this.image.offsetWidth;
        const imageHeight = this.image.offsetHeight;
        const maxFontSize = 18;
        const maxPadding = 2;
        const targetWidthPercent = 0.9;
        let fontSize = maxFontSize;
        let padding = maxPadding;
        this.scaleDisplay.style.fontSize = `${fontSize}px`;
        this.scaleDisplay.style.padding = `${padding}px ${padding * 1.67}px`;
        let displayWidth = this.scaleDisplay.offsetWidth;
        let displayHeight = this.scaleDisplay.offsetHeight;
        const targetWidth = imageWidth * targetWidthPercent;
        const targetHeight = imageHeight * targetWidthPercent;
        if (displayWidth > targetWidth) {
            const widthRatio = targetWidth / displayWidth;
            fontSize *= widthRatio;
            padding *= widthRatio;
            this.scaleDisplay.style.fontSize = `${fontSize}px`;
            this.scaleDisplay.style.padding = `${padding}px ${padding * 1.67}px`;
            displayWidth = this.scaleDisplay.offsetWidth;
            displayHeight = this.scaleDisplay.offsetHeight;
        }
        if (displayHeight > targetHeight) {
            const heightRatio = targetHeight / displayHeight;
            fontSize *= heightRatio;
            padding *= heightRatio;
            this.scaleDisplay.style.fontSize = `${fontSize}px`;
            this.scaleDisplay.style.padding = `${padding}px ${padding * 1.67}px`;
            displayWidth = this.scaleDisplay.offsetWidth;
            displayHeight = this.scaleDisplay.offsetHeight;
        }
        this.scaleDisplay.style.left = `${imageLeft + (imageWidth - displayWidth) / 2}px`;
        this.scaleDisplay.style.top = `${imageTop + (imageHeight - displayHeight) / 2}px`;
    }
    updateScaleDisplay(newScale) {
        if (!this.scaleDisplay)
            return;
        this.scaleDisplay.textContent = Math.round(newScale * 100 / 5) * 5 + '%';
        this.positionScaleDisplay();
    }
    removeScaleDisplay() {
        if (!this.scaleDisplay)
            return;
        this.scaleDisplay.style.opacity = '0';
        setTimeout(() => {
            if (this.scaleDisplay) {
                this.scaleDisplay.remove();
                this.scaleDisplay = null;
            }
        }, 150);
    }
    positionControls() {
        const scale = getScaleFactor(this.container);
        const width = this.image.offsetWidth;
        const height = this.image.offsetHeight;
        const rect = this.image.getBoundingClientRect();
        const containerRect = this.container.getBoundingClientRect();
        let left = (rect.left - containerRect.left) / scale;
        let top = (rect.top - containerRect.top) / scale;
        if (navigator.platform.toUpperCase().indexOf('MAC') >= 0) {
        }
        if (this.outline) {
            this.outline.style.left = `${left}px`;
            this.outline.style.top = `${top}px`;
            this.outline.style.width = `${width}px`;
            this.outline.style.height = `${height}px`;
            this.outline.style.display = 'initial';
        }
        this.corners[0].style.left = `${left - this.controlSize / 2}px`;
        this.corners[0].style.top = `${top - this.controlSize / 2}px`;
        this.corners[0].style.display = 'initial';
        this.corners[1].style.left = `${left + width - this.controlSize / 2}px`;
        this.corners[1].style.top = `${top - this.controlSize / 2}px`;
        this.corners[1].style.display = 'initial';
        this.corners[2].style.left = `${left - this.controlSize / 2}px`;
        this.corners[2].style.top = `${top + height - this.controlSize / 2}px`;
        this.corners[2].style.display = 'initial';
        this.corners[3].style.left = `${left + width - this.controlSize / 2}px`;
        this.corners[3].style.top = `${top + height - this.controlSize / 2}px`;
        this.corners[3].style.display = 'initial';
    }
    startDrag(e, cornerIndex) {
        e.preventDefault();
        this.isDragging = true;
        this.currentCorner = cornerIndex;
        this.dragStartX = e.clientX;
        this.dragStartY = e.clientY;
        this.initialZoom = getImageScale(this.image);
        this.initialScale = getScaleFactor(this.container);
        this.editor.classList.add('dragging-image-resize');
        this.createScaleDisplay(this.initialZoom);
        document.addEventListener('mousemove', this.onDrag);
        document.addEventListener('mouseup', this.stopDrag);
    }
    destroy() {
        if (this.removalObserver) {
            this.removalObserver.disconnect();
            this.removalObserver = null;
        }
        if (this.scaleDisplay) {
            this.scaleDisplay.remove();
            this.scaleDisplay = null;
        }
        this.removeControls();
    }
    rebuildControls() {
        this.removeControls();
        this.addControls();
    }
}
function debounce(func, wait) {
    let timeout = null;
    return (...args) => {
        if (timeout !== null) {
            clearTimeout(timeout);
        }
        timeout = setTimeout(() => {
            func(...args);
            timeout = null;
        }, wait);
    };
}
function getEffectiveBackgroundColor(element) {
    let currentElement = element;
    while (currentElement) {
        const computedStyle = window.getComputedStyle(currentElement);
        const backgroundColor = computedStyle.backgroundColor;
        if (backgroundColor && !isTransparent(backgroundColor)) {
            return backgroundColor;
        }
        currentElement = currentElement.parentElement;
    }
    return 'rgba(255, 255, 255, 1)';
}
function isTransparent(color) {
    const normalizedColor = color.toLowerCase().trim();
    if (normalizedColor === 'transparent' ||
        normalizedColor === 'rgba(0, 0, 0, 0)' ||
        normalizedColor === 'rgba(0,0,0,0)') {
        return true;
    }
    const rgbaMatch = normalizedColor.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/);
    if (rgbaMatch) {
        const alpha = rgbaMatch[4];
        return alpha !== undefined && parseFloat(alpha) === 0;
    }
    return false;
}
export function getLuminance(computed) {
    const matches = computed.match(/rgb[a]?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!matches)
        return 0;
    const r = parseInt(matches[1]);
    const g = parseInt(matches[2]);
    const b = parseInt(matches[3]);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}
export class IosKeyboardManager {
    constructor() {
        this._status = { isOpen: false, height: 0 };
        this.listeners = [];
        this.hasSoftwareKeyboard = null;
        this.expectedKeyboardHeight = 0;
        this.initialHeight = 0;
        this.handleViewportChange = () => {
            this.updateStatus();
        };
        this.handleLegacyResize = () => {
            this.updateStatus();
        };
        this.win = typeof window !== 'undefined' ? window : null;
        if (!this.win)
            return;
        this.initialHeight = this.win.innerHeight || 0;
        this.visualViewport = this.win.visualViewport || null;
        this.setupEventListeners();
        this.updateStatus();
    }
    static getInstance() {
        if (!IosKeyboardManager.instance) {
            IosKeyboardManager.instance = new IosKeyboardManager();
        }
        return IosKeyboardManager.instance;
    }
    setupEventListeners() {
        if (!this.win)
            return;
        if (this.visualViewport) {
            this.visualViewport.addEventListener('resize', this.handleViewportChange);
            this.visualViewport.addEventListener('scroll', this.handleViewportChange);
        }
        else {
            this.win.addEventListener('resize', this.handleLegacyResize);
            this.setupInputListeners();
        }
    }
    setupInputListeners() {
        if (!this.win || !this.win.document)
            return;
        const inputs = this.win.document.querySelectorAll('input, textarea, [contenteditable]');
        for (const input of inputs) {
            input.addEventListener('focus', () => {
                setTimeout(() => this.updateStatus(), 300);
            });
            input.addEventListener('blur', () => {
                setTimeout(() => this.updateStatus(), 300);
            });
        }
    }
    updateStatus() {
        if (!this.win)
            return;
        let currentHeight;
        if (this.visualViewport) {
            currentHeight = this.visualViewport.height;
        }
        else {
            currentHeight = this.win.innerHeight || 0;
        }
        const heightDiff = this.initialHeight - currentHeight;
        const threshold = this.initialHeight * 0.15;
        const isKeyboardOpen = heightDiff > threshold;
        if (isKeyboardOpen) {
            this.expectedKeyboardHeight = heightDiff;
        }
        const newStatus = {
            isOpen: isKeyboardOpen,
            height: isKeyboardOpen ? heightDiff : 0
        };
        if (newStatus.isOpen !== this._status.isOpen ||
            newStatus.height !== this._status.height) {
            this.hasSoftwareKeyboard = true;
            this._status = newStatus;
            this.notifyListeners();
        }
    }
    get status() {
        return Object.assign({}, this._status);
    }
    addListener(callback) {
        this.listeners.push(callback);
        callback(this.status);
    }
    removeListener(callback) {
        this.listeners = this.listeners.filter(listener => listener !== callback);
    }
    notifyListeners() {
        this.listeners.forEach(listener => {
            try {
                listener(this.status);
            }
            catch (e) {
                console.error('Error in keyboard status listener:', e);
            }
        });
    }
    destroy() {
        if (!this.win)
            return;
        if (this.visualViewport) {
            this.visualViewport.removeEventListener('resize', this.handleViewportChange);
            this.visualViewport.removeEventListener('scroll', this.handleViewportChange);
        }
        else {
            this.win.removeEventListener('resize', this.handleLegacyResize);
        }
        this.listeners = [];
        IosKeyboardManager.instance = null;
    }
}
IosKeyboardManager.instance = null;
let iosKeyboardManagerInstance = null;
try {
    iosKeyboardManagerInstance = IosKeyboardManager.getInstance();
}
catch (e) {
    console.error('Failed to initialize keyboard manager:', e);
}
export const iosKeyboardManager = iosKeyboardManagerInstance;
export function isIosKeyboardVisible() {
    return iosKeyboardManager ? iosKeyboardManager.status.isOpen : false;
}
export function getIosKeyboardHeight() {
    return iosKeyboardManager ? iosKeyboardManager.status.height : 0;
}
const editorInstances = new Map();
export function getEditorInstance(instanceId) {
    return editorInstances.get(instanceId);
}
export function removeEditorInstance(instanceId) {
    editorInstances.delete(instanceId);
}
export function getEditor(instanceId) {
    return getEditorInstance(instanceId);
}
export async function callInstanceMethod(instanceId, batchCalls) {
    var _a;
    if (!instanceId) {
        throw new Error('instanceId is required for editor method calls');
    }
    if (!batchCalls || !Array.isArray(batchCalls)) {
        throw new Error('callInstanceMethod requires an array of method descriptors');
    }
    if (batchCalls.length === 0) {
        return [];
    }
    const results = [];
    let editor = getEditor(instanceId);
    for (const invocation of batchCalls) {
        const methodName = invocation.methodName;
        const invocationArgs = (_a = invocation.args) !== null && _a !== void 0 ? _a : [];
        if (!editor) {
            if (methodName === 'initQuillEditor') {
                editor = new VenusEditor();
            }
            else {
                throw new Error(`No editor instance found for instanceId: ${instanceId} | method: ${methodName}`);
            }
        }
        const method = editor[methodName];
        if (typeof method !== 'function') {
            throw new Error(`Method ${methodName} not found on VenusEditor instance`);
        }
        const result = method.apply(editor, invocationArgs);
        if (result && typeof result.then === 'function') {
            results.push(await result);
        }
        else {
            results.push(result);
        }
        editor = getEditor(instanceId);
    }
    return results;
}
function getScaleFactor(element) {
    const scaleContainer = element.closest('.attachments-and-note-section-scale-content');
    if (!scaleContainer) {
        return 1;
    }
    const rect = scaleContainer.getBoundingClientRect();
    const width = scaleContainer.offsetWidth;
    if (width === 0) {
        return 1;
    }
    const scale = rect.width / width;
    if (!Number.isFinite(scale) || scale <= 0) {
        return 1;
    }
    return scale;
}
function typesetMathIntoNode(node, source) {
    const normalized = source.replace(/\t/g, ' \\\\ ');
    const hasBackslashBreak = normalized.includes('\\\\');
    const hasEnvironment = normalized.includes('\\displaylines{') || normalized.includes('\\begin{');
    if (hasBackslashBreak && !hasEnvironment) {
        node.textContent = `\\(\\displaylines{${normalized}}\\)`;
    }
    else {
        node.textContent = `\\(${normalized}\\)`;
    }
    try {
        if (typeof MathJax !== 'undefined' && (MathJax === null || MathJax === void 0 ? void 0 : MathJax.typesetPromise)) {
            MathJax.typesetPromise([node]);
        }
    }
    catch (_a) {
    }
}
export function renderMathPreview(elementId, source) {
    if (!elementId) {
        return;
    }
    const node = document.getElementById(elementId);
    if (!node) {
        return;
    }
    typesetMathIntoNode(node, typeof source === 'string' ? source : '');
}
export const quillExtensions = QuillExtensions;
//# sourceMappingURL=venus-editor.js.map