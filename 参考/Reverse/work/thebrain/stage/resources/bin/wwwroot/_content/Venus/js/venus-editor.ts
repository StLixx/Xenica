import {safeInvoke, safeInvokeAsync} from "./interop.js";

class NotesPerfTimer {
	private static readonly PREFIX = '[NotesPerfTimer]';
	// Any completion below this is silent. Lower this (e.g. 0) to trace a specific
	// slow path. SLOW_THRESHOLD_MS below still promotes the log to a warn when
	// something is genuinely slow, regardless of LOG_THRESHOLD_MS.
	private static readonly LOG_THRESHOLD_MS = 100;
	private static readonly SLOW_THRESHOLD_MS = 500;

	private operation: string;
	private startTime: number;
	private stepTime: number;
	private context: Record<string, string | number>;
	private stopped: boolean;

	private constructor(operation: string, context?: Record<string, string | number>) {
		this.operation = operation;
		this.startTime = performance.now();
		this.stepTime = this.startTime;
		this.context = context ?? {};
		this.stopped = false;
	}

	static start(operation: string, context?: Record<string, string | number>): NotesPerfTimer {
		return new NotesPerfTimer(operation, context);
	}

	withContext(key: string, value: string | number): NotesPerfTimer {
		this.context[key] = value;
		return this;
	}

	step(stepName: string): void {
		const now = performance.now();
		const elapsed = now - this.stepTime;
		console.log(`${NotesPerfTimer.PREFIX} ${this.operation} step: ${stepName} completed in ${elapsed.toFixed(2)}ms`);
		this.stepTime = now;
	}

	stop(): void {
		if(this.stopped) {
			return;
		}
		this.stopped = true;
		const elapsed = performance.now() - this.startTime;
		// Silent completion for routine ops so the instrumentation doesn't pay
		// console.log overhead on every short-circuit / cheap-path invocation.
		if(elapsed < NotesPerfTimer.LOG_THRESHOLD_MS) {
			return;
		}
		const contextEntries = Object.entries(this.context);
		const contextStr = contextEntries.length > 0
			? ' (' + contextEntries.map(([k, v]) => `${k}: ${v}`).join(', ') + ')'
			: '';
		const slow = elapsed >= NotesPerfTimer.SLOW_THRESHOLD_MS ? ' [SLOW]' : '';
		if(slow) {
			console.warn(`${NotesPerfTimer.PREFIX} ${this.operation} completed in ${elapsed.toFixed(2)}ms${contextStr}${slow}`);
		} else {
			console.log(`${NotesPerfTimer.PREFIX} ${this.operation} completed in ${elapsed.toFixed(2)}ms${contextStr}`);
		}
	}
}

const Block: any = Quill.import('blots/block');
const BlockEmbed: any = Quill.import('blots/block/embed');
const Embed: any = Quill.import('blots/embed');
const FontStyle: any = Quill.import('attributors/style/font');
const Inline: any = Quill.import('blots/inline');
const Image: any = Quill.import('formats/image');
const Delta: any = Quill.import('delta');

const Parchment = Quill.import('parchment');

declare const MathJax: {
	typesetPromise?: (elements: HTMLElement[]) => Promise<any>;
};

// NOTE: These regex patterns must stay in sync with UrlCoreRxString and EmailRxString in
// KezaEdit/KezaCore/Keza/KezaUtilities.cs. Update both locations together.
const URL_CORE_PATTERN = String.raw`([a-z][a-z0-9+.\-]{0,31})\\?:\/\/(([a-z0-9$_\.\+!\*\'\(\),;\?&=\-~]|%[0-9a-f]{2})+(\\?:([a-z0-9$_\.\+!\*\'\(\),;\?&=\-~]|%[0-9a-f]{2})+)?@)?((([a-z0-9]\\?\.|[a-z0-9][a-z0-9-]*[a-z0-9]\\?\.)*[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|((\d|[1-9]\d|1\d{2}|2[0-4][0-9]|25[0-5])\\?\.){3}(25[0-5]|2[0-4][0-9]|1\d{2}|\d|[1-9]\d))(\\?:\d+)?)(((\/+([a-z0-9$_\.\+\/!\*\'\(\),;:@&=\-~]|%[0-9a-f]{2})*)*(\?([a-z0-9$_\.\+\/!\*\'\(\),;:@&=\-~]|%[0-9a-f]{2})*)?)?)?(\\?#([a-z0-9$_\.\+\/!\*\'\(\),;:@&=\-~]|%[0-9a-f]{2})*)?`;
const URL_BOUNDARY_REGEX = new RegExp(String.raw`(?:^|\s)${URL_CORE_PATTERN}`, 'gi');
const URL_EXACT_REGEX = new RegExp(String.raw`^${URL_CORE_PATTERN}$`, 'i');

const EMAIL_CORE_PATTERN = String.raw`[\w!#$%&'*+\/=?^_\`{|}~-]+(?:\.[\w!#$%&'*+\/=?^_\`{|}~-]+)*@(?:[\w](?:[\w-]*[\w])?\\?\.)+[\w](?:[\w-]*[\w])?`;
const EMAIL_BOUNDARY_REGEX = new RegExp(String.raw`(?:^|\s)(${EMAIL_CORE_PATTERN})(?:$|\s)`, 'gi');
const EMAIL_EXACT_REGEX = new RegExp(String.raw`^${EMAIL_CORE_PATTERN}$`, 'i');

// Phone-number core pattern matching KezaUtilities.PhoneNumberRx (10-digit numbers with optional
// country code, allowing separators like spaces, dashes, dots, and parentheses, plus optional "x" extension).
const PHONE_CORE_PATTERN = String.raw`(?:\+?\d{1,3})?[-. (]*\d{3}[-. )]*\d{3}[-. ]*\d{4}(?: *x\d+)?`;
const PHONE_BOUNDARY_REGEX = new RegExp(String.raw`(?:^|\s)(${PHONE_CORE_PATTERN})(?=$|\W)`, 'g');
const PHONE_EXACT_REGEX = new RegExp(String.raw`^${PHONE_CORE_PATTERN}$`);

// Serialized skip ranges stored on line DOM nodes to coordinate spellcheck suppression and auto-link detection.
const MISSPELLING_SKIP_DATASET_KEY = 'misspellingSkipRanges';
const CELL_PROCESSED_HASH_DATASET_KEY = 'cellProcessedHash';

enum CursorOffsetBehavior {
	Preserve,  // Maintain cursor column position when moving between lines
	LineEdge   // Move to line edge (end for backward/up/left, start for forward/down/right)
}

type OutlineBlockType = 'heading' | 'list' | 'blockquote' | 'code' | 'paragraph' | 'other';

interface OutlineBlock {
	id: string;
	lineIndex: number;
	outlinePosition: number;
	outlineEndPosition: number;
	level: number;
	type: OutlineBlockType;
	isCollapsible: boolean;
	isCollapsed: boolean;
	domNode: HTMLElement;
	parentId: string | null;
}

interface CollapseStateEntry {
	isCollapsed: boolean;
}

export class VenusEditor {

	private primaryNotesEditor: any | null = null;
	private cellNotesEditor: any | null = null;
	public activeEditor: 'primary' | 'cell' = 'primary'; // Track which editor is currently active

	private isRestoringSelection = false;
	// Ref-counted keep-alive for the active cell editor (> 0 spares the blur destroy path).
	private keepCellEditorAliveDepth: number = 0;
	private savedCellSelection = new SavedCellSelection();
	private savedPrimarySelection: { index: number, length: number } | null = null
	
	public editorSettings: NotesEditorSettings = new NotesEditorSettings();

	private editorElementId: string = '';
	private linkTooltipContainerId: string = '';
	private linkTooltipId: string = '';
	private linkTooltipContentId: string = '';
	// Public so QuillExtensions helpers can set it to bypass the "snap cursor adjacent to
	// math into hold state" logic in the selection-change listener.
	public skipMathAdjacentSelect: boolean = false;
	// Select-and-hold state tracked purely in JS so it survives Chrome's native-selection
	// collapse on contenteditable=false embeds inside <td> cells. When non-null, the named
	// blot is painted with .ql-math-selected and the hold-state key handler dispatches off
	// this flag instead of Quill's selection. entryDirection records which side the user
	// approached from so Escape releases in the direction of travel. null = click/unknown.
	public heldMathInfo: {
		quill: any,
		mathIndex: number,
		mathDomNode: HTMLElement,
		entryDirection: 'left' | 'right' | null
	} | null = null;

	// Container references for scoped DOM queries
	private editorContainer: HTMLElement | null = null;
	private editorOuterContainer: HTMLElement | null = null;
	private toolbarContainer: HTMLElement | null = null;
	private contentAreaInner: HTMLElement | null = null;  // Optional parent container from Vulcan
	private scrollCursorRafId: number | null = null;
	private scrollCursorSmooth: boolean = false;

	public dotNetHelper: any | null = null;


	private autoSaveTimer: number | undefined;
	private updateCountsTimer: number | undefined;
	private _pendingTimers: Set<number> = new Set();
	private _animatedCarets: Map<any, AnimatedCaret> = new Map();
	private autoSaveIdleDelay: number = 3000; // Wait 3 seconds after last edit before auto-saving
	private spellcheckIdleDelay: number = 2000; // Show misspelling at cursor after 2 seconds of no typing
	private _isActivelyTyping: boolean = false;
	private _typingIdleTimer: number | undefined;
	_compositionPendingProcess: boolean = false;

	private metaData: string = "";
	private isDirty: boolean = false;
	private _visibilityChangeHandler: (() => void) | null = null;
	private _marginClickContainer: HTMLElement | null = null;
	private _marginClickHandler: ((e: MouseEvent) => void) | null = null;

	private lastActiveTable: HTMLTableElement | null = null;
	private preserveTableControls: boolean = false;
	// Suppresses processVisibleLines during structural table operations to prevent
	// text recognition / spellcheck from running on every intermediate DOM state.
	public isStructuralTableOperation: boolean = false;

	// Table state management
	public tableState = new TableState();

	// Table resizer
	public tableResizer: TableResizer | null = null;

	// Image controls
	public imageControls: ImageControls | null = null;

	// Table cell selection div
	public tableCellSelectionDiv: HTMLDivElement | null = null;

	// Stuff for fixing iOS capitalization on newline issue
	public dummyInput: HTMLInputElement | null = null;
	public justPressedEnter: boolean = false;

	private hasIosHardwareKeyboard: boolean | null = null;




	private textScalePercent: number = 100;
	private readonly minTextScalePercent: number = 50;
	private readonly maxTextScalePercent: number = 200;
	private baseFontSizeCache: WeakMap<HTMLElement, number> = new WeakMap();

	private readonly URL_REGEX = /^(https?:\/\/[^\s]+)$/;

	// URLs accepted when converting a typed markdown link like [Yahoo](https://yahoo.com).
	// Accepts any scheme (https://, brain://, mailto:, tel:, etc.) or a www. prefix.
	private readonly MARKDOWN_LINK_URL_REGEX = /^([a-zA-Z][a-zA-Z0-9+.\-]*:|www\.)[^\s]+$/;

	private editorListeners: Map<any, Array<{
		element: HTMLElement | Window | Document,
		event: string,
		handler: Function
	}>> = new Map();
	private resizeObservers: Map<any, ResizeObserver> = new Map;
	private collapseState: Map<string, CollapseStateEntry> = new Map();
	private outlineBlocks: OutlineBlock[] = [];
	private outlineBlockById: Map<string, OutlineBlock> = new Map();
	private hasAnyCollapsibleBlocks: boolean = false;
	private collapseAnimationMode: 'single' | 'multi' = 'single';
	private hoveredCollapseId: string | null = null;
	private collapseOverlay: HTMLElement | null = null;
	private collapseRenderScheduled: boolean = false;
	private collapsePointerHandlers: Map<any, { move: (event: MouseEvent) => void; leave: (event: MouseEvent) => void }> = new Map();
	private lineIdSeed: number = 0;
	private lineNodeById: Map<string, HTMLElement> = new Map();
	private readonly collapseButtonOffset: number = 24;
	private readonly collapseHoverMargin: number = 48;
	private lastCollapseOperationTime: number = 0;
	private _retryingPaste: boolean = false;

	// Structured table data from the last table copy, used for paste-into-table
	public copiedTableData: { rows: number; columns: number; cells: string[][]; plainText: string; themeFormats: Record<string, string> } | null = null;

	// Toolbar-specific listeners
	private toolbarListeners: Array<{ element: HTMLElement | Window | Document, event: string, handler: EventListener }> = [];
	private activeInlineTooltip: { index: number; length: number; type: 'link' | 'mention' } | null = null;

	isProcessingVisibleLines: boolean = false;

	private isMacOS(): boolean {
		try {
			const ua = (navigator && navigator.userAgent) ? navigator.userAgent : '';
			const platform = (navigator && (navigator as any).platform) ? (navigator as any).platform : '';
			const isAppleMobile = /iPhone|iPad|iPod/i.test(ua);
			return !isAppleMobile && (/Macintosh|Mac OS X|Mac/i.test(ua) || /Mac/i.test(platform));
		} catch { return false; }
	}

	// Find and Replace state management
	private searchState = {
		findText: '',
		replaceText: '',
		caseSensitive: false,
		wholeWord: false,
		useRegex: false,
		matches: [] as Array<{index: number, length: number, deltaIndex: number, deltaLength: number}>,
		currentMatchIndex: -1,
		highlightElements: [] as HTMLElement[],
		textToDeltaMap: [] as Array<{textIndex: number, deltaIndex: number}>,
		deltaToTextMap: [] as Array<{deltaIndex: number, textIndex: number}>
	};
	private searchRefreshTimer: any = null;
	private resizeRefreshTimer: any = null;
	// Holds the teardown for the active note-content search-result highlight, so it can be dismissed
	// externally (e.g. when the editor loses focus to the plex). Null when no highlight is showing.
	private dismissResultHighlight: (() => void) | null = null;

	// Copied formatting storage
	private copiedFormatting: { inlineFormats: any; lineFormats: any } | null = null;

	// Line formats that should be applied using formatLine instead of formatText
	private static readonly lineFormatKeys = ['list', 'header', 'blockquote', 'code-block', 'indent', 'align'];

	private toolbarButtons: ToolbarButton[] = [
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

	private keyboardBindings = {
		bold: {
			key: 'b',
			shortKey: true,  // On Windows/Linux => Ctrl + B, on Mac => Cmd + B
			handler: (range: any, context: any) => {
				return false;
			}
		},
		italic: {
			key: 'i',
			shortKey: true,
			handler: (range: any, context: any) => {
				return false;
			}
		},
		underline: {
			key: 'u',
			shortKey: true,
			handler: (range: any, context: any) => {
				return false;
			}
		},
		inlineCode: {
			key: '`',
			handler: (range: any, context: any) => {
				return this.handleInlineCodeKeyboardShortcut(range);
			}
		},
		tripleBacktick: {
			key: '`',
			handler: (range: any, context: any) => {
				return this.handleCodeBlockKeyboardShortcut(range, context);
			}
		},
		strikethrough: {
			key: '~',
			shiftKey: true,
			handler: (range: any, context: any) => {
				return this.handleStrikethroughKeyboardShortcut(range);
			}
		},
		highlight: {
			key: '=',
			shiftKey: false,
			handler: (range: any, context: any) => {
				return this.handleHighlightKeyboardShortcut(range);
			}
		},
		asteriskItalicOrBold: {
			key: '*',
			shiftKey: true,
			handler: (range: any, context: any) => {
				return this.handleAsteriskItalicOrBoldKeyboardShortcut(range);
			}
		},
		underscoreItalicOrBold: {
			key: '_',
			shiftKey: null,
			handler: (range: any, context: any) => {
				return this.handleUnderscoreItalicOrBoldKeyboardShortcut(range);
			}
		},
		startOfDocumentBackspace: {
			key: 'Backspace',
			prefix: /^/,
			handler: (range: any, context: any) => {
				if(range.index > 0) {
					return true;
				}

				// We are at the start of the document and the user pressed backspace, remove all line formatting from the current line
				this.notesEditor().format('header', false);
				this.notesEditor().format('list', false);
				this.notesEditor().format('blockquote', false);
				this.notesEditor().format('code-block', false);

				// Also allow default behavior to continue so any selected content is removed
				return true;
			}
		},
		startOfLineBackspace: {
			key: 'Backspace',
			handler: (range: any, context: any) => {
				if(!range) return true;
				if(range.length > 0) return true;

				// Get the current line and offset within that line
				const editor = this.notesEditor();
				const [line, offset] = editor.getLine(range.index);

				// Check if we're at the beginning of a line
				if(offset === 0) {
					// We are at the start of a line and the user pressed backspace
					if(range.index > 0 && this.isIndexHidden(range.index - 1)) {
						// Do not allow backspace to delete hidden content
						return false;
					}

					// Remove header formatting if present
					const formats = editor.getFormat(range.index, 1);
					if(formats.header) {
						editor.format('header', false, 'user');
						return false;
					}
				}

				return true;
			}
		},
		divider: {
			key: '-',
			handler: (range: any, context: any) => {
				return this.handleDividerKeyboardShortcut(range, context);
			}
		},
		insertLink: {
			key: '[',
			handler: (range: any, context: any) => {
				return this.handleInsertLinkKeyboardShortcut(range, context);
			}
		},
		// Convert a typed markdown link like [Yahoo](https://yahoo.com) when the closing paren is typed
		markdownLink: {
			key: ')',
			shiftKey: null,
			handler: (range: any, context: any) => {
				return this.handleMarkdownLinkKeyboardShortcut(range);
			}
		},
		insertMath: {
			key: '$',
			shiftKey: true,
			handler: (range: any, context: any) => {
				return this.handleInsertMathKeyboardShortcut(range, context);
			}
		},
		tab: {
			key: 'Tab',
			handler: (range: any, context: any) => {
				return this.handleTabKey(range, context);
			}
		},
		shiftTab: {
			key: 'Tab',
			shiftKey: true,
			handler: (range: any, context: any) => {
				return this.handleShiftTabKey(range, context);
			}
		},
		// custom undo/redo bindings are needed because of cell editors 
		undo: {
			key: 'z',
			shortKey: true,
			handler: (range: any, context: any) => {
				return this.handleUndo();
			}
		},
		redo: {
			key: 'Z',
			shortKey: true,
			shiftKey: true,
			handler: (range: any, context: any) => {
				return this.handleRedo();
			}
		},
		redo2: {
			key: 'y',
			shortKey: true,
			handler: (range: any, context: any) => {
				return this.handleRedo();
			}
		},
		exit: {
			key: 'Escape',
			handler: (range: any, context: any) => {
				safeInvoke(this.dotNetHelper, 'CloseRequested');
			}
		},

		exitInlineCodeRight: {
			key: 'ArrowRight',
			collapsed: true,
			format: ['code'],
			handler: (range: any, context: any) => {
				if(!range || !this.notesEditor) {
					return true;
				}

				const editor = this.notesEditor();

				const [leaf, offsetInLeaf] = editor.getLeaf(range.index);
				if(!leaf || offsetInLeaf !== leaf.length()) {
					return true;
				}

				editor.format('code', false, 'user');

				const nextChar = editor.getText(range.index, 1);
				if(nextChar === '\n') {
					editor.insertText(range.index, ' ', 'user');
				}

				// return true so Quill still performs its normal Arrow-Right step
				return true;
			}
		},

		exitInlineCodeLeft: {
			key: 'ArrowLeft',
			collapsed: true,
			format: ['code'],
			handler: (range: any, context: any) => {
				if(!range || !this.notesEditor) {
					return true;
				}

				const editor = this.notesEditor();

				const [leaf, offsetInLeaf] = editor.getLeaf(range.index);
				if(!leaf || offsetInLeaf !== 0) {
					return true;
				}

				const atDocStart = range.index === 0;
				const charToLeft = atDocStart ? '\n' : editor.getText(range.index - 1, 1);
				const spaceAlreadyThere = charToLeft === ' ';

				editor.format('code', false, 'user');

				// Skip Quill’s default left arrow handling
				return false;
			}
		},
		skipDividerUp: {
			key: 'ArrowUp',
			collapsed: true,
			handler: (range: any, context: any) => {
				return this.moveCursorPastDividerUp(range, context);
			}
		},
		skipDividerDown: {
			key: 'ArrowDown',
			collapsed: true,
			handler: (range: any, context: any) => {
				return this.moveCursorPastDividerDown(range, context);
			}
		},
		skipDividerLeft: {
			key: 'ArrowLeft',
			collapsed: true,
			handler: (range: any, context: any) => {
				return this.moveCursorPastDividerLeft(range, context);
			}
		},
		skipDividerRight: {
			key: 'ArrowRight',
			collapsed: true,
			handler: (range: any, context: any) => {
				return this.moveCursorPastDividerRight(range, context);
			}
		},
		skipTOCUp: {
			key: 'ArrowUp',
			collapsed: true,
			handler: (range: any, context: any) => {
				return this.moveCursorPastTOCUp(range, context);
			}
		},
		deleteDividerForward: {
			key: 'Delete',
			collapsed: true,
			handler: (range: any, context: any) => {
				return this.deleteDividerForward(range, context);
			}
		},
		exitCodeBlockUp: {
			key: 'ArrowUp',
			collapsed: true,
			format: ['code-block'],
			handler: (range: any, context: any) => {
				return this.exitCodeBlockUp(range, context);
			}
		},
		exitCodeBlockLeft: {
			key: 'ArrowLeft',
			collapsed: true,
			format: ['code-block'],
			handler: (range: any, context: any) => {
				return this.exitCodeBlockUp(range, context);
			}
		},
		exitCodeBlockDown: {
			key: 'ArrowDown',
			collapsed: true,
			format: ['code-block'],
			handler: (range: any, context: any) => {
				return this.exitCodeBlockDown(range, context);
			}
		},
		exitCodeBlockRight: {
			key: 'ArrowRight',
			collapsed: true,
			format: ['code-block'],
			handler: (range: any, context: any) => {
				return this.exitCodeBlockDown(range, context);
			}
		},
		exitMathUp: {
			key: 'ArrowUp',
			collapsed: true,
			handler: (range: any, context: any) => {
				return this.exitMathUp(range, context);
			}
		},
		exitMathLeft: {
			key: 'ArrowLeft',
			collapsed: true,
			handler: (range: any, context: any) => {
				return this.exitMathUp(range, context);
			}
		},
		exitMathDown: {
			key: 'ArrowDown',
			collapsed: true,
			handler: (range: any, context: any) => {
				return this.exitMathDown(range, context);
			}
		},
		exitMathRight: {
			key: 'ArrowRight',
			collapsed: true,
			handler: (range: any, context: any) => {
				return this.exitMathDown(range, context);
			}
		},
		navigateUp: {
			key: 'ArrowUp',
			collapsed: true,
			handler: (range: any, context: any) => {
				return this.handleNavigateUp(range, context);
			}
		},
		navigateLeft: {
			key: 'ArrowLeft',
			collapsed: true,
			handler: (range: any, context: any) => {
				return this.handleNavigateLeft(range, context);
			}
		},
		navigateDown: {
			key: 'ArrowDown',
			collapsed: true,
			handler: (range: any, context: any) => {
				return this.handleNavigateDown(range, context);
			}
		},

		// "embed left" and "embed right" bindings must be set because if we do not override them at this level, the bindings
		// for the left and right arrow keys set up in enableTableBlot do not fire on empty lines
		"embed left": {
			key: 'ArrowLeft',
			collapsed: true,
			offset: 0,
			handler: function(range: any, context: any) {
				return true;
			}
		},
		"embed right": {
			key: 'ArrowRight',
			collapsed: true,
			offset: 0,
			handler: function(range: any, context: any) {
				return true;
			}
		},

		// Disable default quill behavior for list matching
		"list autofill": false,

		lineStartMarkdown: {
			key: " ",
			shiftKey: null,
			handler: (range: any, context: any) => {
				return this.handleLineStartMarkdownShortcut(range, context);
			}
		},

		// Support typing "[]" or "[ ]" to create an unchecked checkbox and "[x]" to create a checked one
		listBracketCheckbox: {
			key: "]",
			shiftKey: null,
			prefix: /^\s*?\[(?: |[xX])?$/,
			handler: (range: any, context: any) => {
				return this.handleBracketCheckboxKeyboardShortcut(range, context);
			}
		},

		// Shift+Enter inserts a <br> (soft line break) instead of a new block
		shiftEnter: {
			key: 'Enter',
			shiftKey: true,
			handler: (range: any, context: any) => {
				// iOS soft keyboards auto-enable Shift at sentence starts for auto-capitalization,
				// making every sentence-start Enter look like Shift+Enter. Treat Shift+Enter as
				// plain Enter when the iOS soft keyboard is visible. Hardware keyboard on iOS
				// hides the soft keyboard (height === 0), so users with a physical keyboard still
				// get the Shift+Enter shortcut. Soft-keyboard users can use the toolbar's "Insert
				// Line Break" command instead.
				if(this.editorSettings.clientOs === ClientOs.iOS && getIosKeyboardHeight() > 0) {
					return this.performPlainEnter(range);
				}
				return this.handleShiftEnter(range);
			}
		}

	};

	/**
	 * Main entry point: creates Quill, sets up toolbar references,
	 * then attaches event handlers in separate steps.
	 */
	// Called from Blazor
	public initQuillEditor(dotNetHelper: any, editorElementId: string, toolbarElementId: string, linkTooltipContainerId: string, linkTooltipId: string, linkTooltipContentId: string, editorSettings: NotesEditorSettings) {
		const perfTimer = NotesPerfTimer.start('initQuillEditor');
		if(editorSettings == null) {
			console.log('initQuillEditor failed: editorSettings must not be null');
		}

		this.dotNetHelper = dotNetHelper;
		this.editorElementId = editorElementId;
		this.linkTooltipContainerId = linkTooltipContainerId;
		this.linkTooltipId = linkTooltipId;
		this.linkTooltipContentId = linkTooltipContentId;

		// Store container references for scoped DOM queries
		this.editorContainer = document.getElementById(editorElementId)!;
		if(!this.editorContainer) {
			throw new Error(`Editor element with id '${editorElementId}' not found. DOM may not be ready yet.`);
		}
		this.editorOuterContainer = this.editorContainer.parentElement;
		if(!this.editorOuterContainer) {
			throw new Error(`Editor outer container (parentElement of '${editorElementId}') not found.`);
		}
		this.setupEditorContainerKeyboardHandler();
		this.setupMarginClickHandler();
		this.toolbarContainer = document.getElementById(toolbarElementId);
		// contentAreaInner is an optional parent container from Vulcan - may not exist
		// Note: If multiple editors exist, they will share this container. This is acceptable
		// since it's only used for background color detection and resize observation.
		this.contentAreaInner = document.getElementById('contentAreaInner');

		this.primaryNotesEditor = this.getEditor(this.editorContainer, false);

		// Extract instanceId from editorElementId (format: "editor-{instanceId}")
		const instanceIdMatch = editorElementId.match(/^editor-(.+)$/);
		if(instanceIdMatch && instanceIdMatch[1]) {
			const instanceId = instanceIdMatch[1];
			console.log(`[initQuillEditor] Registering instance: ${instanceId}`);
			editorInstances.set(instanceId, this);
		} else {
			console.log(`[initQuillEditor] No instance ID found in editorElementId: ${editorElementId}`);
		}

		this.setEditorSettings(editorSettings);

		// Flush pending auto-save when the app is backgrounded (page becomes hidden)
		this._visibilityChangeHandler = () => {
			if(document.visibilityState === 'hidden') {
				this.flushPendingAutoSave();
			}
		};
		document.addEventListener('visibilitychange', this._visibilityChangeHandler);

		this.setEditorClasses();

		this.primaryNotesEditor.history.clear();
		this.isDirty = false;
		perfTimer.stop();
		console.log('Initialized notes editor');

		// Create a dummy text input that we can switch focus to so we can reset capitalization on iOS without the keyboard flickering
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

		// Auto-save is handled via debouncing in the text-change handler (see scheduleAutoSave method)
		// No need to set up a timer here anymore
		
		// Set up ResizeObserver for contentAreaInner to handle Find & Replace highlights
		if(this.contentAreaInner) {
			const contentAreaResizeObserver = new ResizeObserver(() => {
				this.refreshSearchAfterResize();
			});
			contentAreaResizeObserver.observe(this.contentAreaInner);
			// Store it so we can clean it up later
			this.resizeObservers.set('contentAreaInner', contentAreaResizeObserver);
		}
		
		this.updateMoveLineCommandStates();
		this.updateTableCommandStates();

	}

	private setEditorClasses() {
		const editor = document.getElementById(this.editorElementId);
		if(!editor) return;

		// Classes must be added and removed instead of setting them all at once because there are existing classes
		// including some managed by quill that must be preserved

		const classSets = {
			standalone: ['border', 'border-t-0', 'border-lcolor', 'dark:border-lcolordark', 'rounded-b-xl', 'overflow-hidden'],
		};

		// Clear all our custom classes
		editor.classList.remove(...classSets.standalone);

		// Pick which set is applicable
		let classesToAdd: string[] = [];

		if(this.editorSettings.isStandalone) {
			classesToAdd.push(...classSets.standalone);
		}

		// Now add the appropriate classes
		if(classesToAdd.length) {
			editor.classList.add(...classesToAdd);
		}
	}

	/// Tracked setTimeout that auto-cleans on completion and is cleared on dispose
	private safeSetTimeout(callback: () => void, delay: number): number {
		const id = setTimeout(() => {
			this._pendingTimers.delete(id);
			callback();
		}, delay) as unknown as number;
		this._pendingTimers.add(id);
		return id;
	}

	// Called from Blazor
	public setContents(contentPackage: ContentPackage) {
		const delta = JSON.parse(contentPackage.quillDelta);
		const perfTimer = NotesPerfTimer.start('setContents', { ops: delta.ops?.length ?? 0 });

		// Save scroll position before Quill replaces the DOM.
		// For same-note reloads (e.g. cross-window sync), we restore it after content is set.
		const savedScrollTop = this.primaryNotesEditor.root.scrollTop;
		let isSameNote = false;
		try {
			if(this.metaData && contentPackage.metaData) {
				const oldState = JSON.parse(this.metaData);
				const newState = JSON.parse(contentPackage.metaData);
				isSameNote = oldState.ThoughtId === newState.ThoughtId
					&& oldState.AttachmentId === newState.AttachmentId;
			}
		} catch {
			// If metadata parsing fails, fall back to default behavior (no scroll preservation)
		}

		this.primaryNotesEditor.history.clear();
		perfTimer.step('clearHistory');

		// Clear content first so setContents diffs against empty instead of old content
		this.primaryNotesEditor.setText('', 'silent');

		// Detach editor from DOM during content load to avoid incremental reflow (especially Firefox)
		const editorRoot = this.primaryNotesEditor.root;
		const rootParent = editorRoot.parentElement;
		const rootNextSibling = editorRoot.nextSibling;
		rootParent?.removeChild(editorRoot);
		perfTimer.step('clearAndDetach');

		try {
			this.primaryNotesEditor.setContents(delta);
			perfTimer.step('quillSetContents');
		} finally {
			if(rootParent) {
				if(rootNextSibling) {
					rootParent.insertBefore(editorRoot, rootNextSibling);
				} else {
					rootParent.appendChild(editorRoot);
				}
			}
			perfTimer.step('reattachDOM');
		}

		this.metaData = contentPackage.metaData;

		// Register all tables in the editor with this editor instance
		this.registerTablesWithEditor();
		// Register all images in the editor with this editor instance
		this.registerImagesWithEditor();

        // Update word/character counts after setting content
        this.updateTextCounts();

		// Update table of contents after setting content
		this.updateTableOfContents();
		this.refreshOutline();

		// Restore scroll position when reloading the same note
		if(isSameNote) {
			this.primaryNotesEditor.root.scrollTop = savedScrollTop;
		}

		// This must be done last as some of the above calls may trigger change events
		this.isDirty = false;

		// Re-execute find/replace search if one is active against the new content.
		// Defer to allow Quill to fully render the new content so getBounds returns correct rects for highlights.
		if(this.searchState.findText) {
			this.safeSetTimeout(() => {
				this.performSearch(this.searchState.findText, this.searchState.caseSensitive, this.searchState.wholeWord, this.searchState.useRegex, false);
			}, 20);
		}

		perfTimer.step('postProcessing');
		perfTimer.stop();
		console.log('Loaded notes editor content');
	}

	public notesEditor(): any | null {
		// Use explicit tracking instead of relying on getSelection() which can be null on macOS
		if(this.activeEditor === 'cell' && this.cellNotesEditor) {
			return this.cellNotesEditor;
		}
		return this.primaryNotesEditor;
	}

	public isCellEditorInstance(quill: any | null | undefined): boolean {
		return !!quill && quill === this.cellNotesEditor;
	}

	public getCellProcessingId(quill: any | null | undefined): string {
		if(!quill) {
			return '';
		}
		const root = (quill.root as HTMLElement | undefined) ?? null;
		if(root?.dataset?.tableCellId) {
			return root.dataset.tableCellId;
		}
		if(quill === this.cellNotesEditor) {
			return this.tableState.activeCellId ?? '';
		}
		return '';
	}

	/**
	 * Gets the current selection from the active editor, with fallback to saved selection.
	 * This addresses the macOS issue where getSelection() returns null when the editor loses focus.
	 */
	public getSelectionWithFallback(): { index: number; length: number } | null {
		const editor = this.notesEditor();
		if(!editor) return null;
		
		// Try to get the current selection
		let range = editor.getSelection();
		
		// If getSelection() returns null (common on macOS when focus is lost),
		// fall back to the saved selection
		if(!range) {
			if(this.activeEditor === 'cell' && this.savedCellSelection.cellSelection) {
				range = this.savedCellSelection.cellSelection;
			} else if(this.activeEditor === 'primary' && this.savedPrimarySelection) {
				range = this.savedPrimarySelection;
			}
		}
		
		return range;
	}

	private withSelectionPreserved(operation: () => void): void {
		const selection = this.notesEditor()?.getSelection();
		operation();
		if(selection) {
			this.notesEditor()?.setSelection(selection.index, selection.length, 'silent');
		}
	}

	public acquireCellKeepAlive(): void {
		this.keepCellEditorAliveDepth++;
	}

	public releaseCellKeepAlive(): void {
		if(this.keepCellEditorAliveDepth > 0) {
			this.keepCellEditorAliveDepth--;
		}
	}

	public get isCellEditorKeptAlive(): boolean {
		return this.keepCellEditorAliveDepth > 0;
	}

	// True when `el` is in toolbar or editor chrome (menus, dropdowns) but not .ql-editor content.
	public isFocusInEditorChrome(el: Element | null): boolean {
		if(!el) return false;
		if(this.toolbarContainer?.contains(el)) return true;
		if(!this.editorContainer?.contains(el)) return false;
		return !(el as HTMLElement).closest?.('.ql-editor');
	}

	public isCellEditorActive(): boolean {
		return this.activeEditor === 'cell' && this.cellNotesEditor !== null;
	}

	/**
	 * Register all tables in the editor's content with this editor instance
	 * This allows table-related event handlers to access the correct editor
	 */
	private registerTablesWithEditor(): void {
		const editorElement = document.getElementById(this.editorElementId);
		if(!editorElement) return;

		const tables = editorElement.querySelectorAll('table.ql-table-blot');
		tables.forEach((table: Element) => {
			const t = table as HTMLTableElement;
			TableBlot.setEditorForTable(t, this);
			// Idempotent — handles tables that existed before TableBlot.create was
			// invoked for them (e.g. HTML paste paths, dev hot-reload).
			TableBlot.setupTableClickDelegation(t);
		});
	}

	/**
	 * Register all images in the editor's content with this editor instance
	 * This allows image-related event handlers to access the correct editor
	 */
	private registerImagesWithEditor(): void {
		const editorElement = document.getElementById(this.editorElementId);
		if(!editorElement) return;

		const images = editorElement.querySelectorAll('img');
		images.forEach((image: Element) => {
			setEditorForImage(image as HTMLImageElement, this);
		});
	}

	public getCellEditor(targetCell: HTMLElement): any {
		this.removeEventListenersForEditor(this.cellNotesEditor);
		this.cellNotesEditor = this.getEditor(targetCell, true);
		this.activeEditor = 'cell'; // Set active editor when creating cell editor
		return this.cellNotesEditor;
	}

	dragStartCoords: { x: number; y: number } | null = null;
	lastPointedCoords: { x: number; y: number } | null = null;
	lastPointerDownIndex: number | null = null;
	lastPointedTime: number | null = null;
	lastPointerDownScrollTop: number | null = null;


	private getEditor(element: HTMLElement, isCellEditor: boolean): any {
		// Array to store listeners on document, window, and scrollable parents
		const externalListeners: Array<{ element: HTMLElement | Window | Document, event: string, handler: Function }> = [];

		// Save text selection information before Quill destroys the DOM
		// We'll use this to restore the selection after Quill creates its own DOM structure
		let savedSelectionInfo: { startOffset: number; endOffset: number; selectedText: string } | null = null;
		if(isCellEditor) {
			const domSelection = window.getSelection();
			const hasTextSelection = domSelection && !domSelection.isCollapsed;
			if(hasTextSelection && domSelection) {
				try {
					const range = domSelection.getRangeAt(0);
					// Use Quill-aware index conversion (counts \n per block boundary).
					// Naive Range.toString().length undercounts by N for selections starting
					// after N preceding paragraphs - lands cells on the wrong line on dblclick.
					const startOffset = QuillExtensions.domToQuillIndex(element, range.startContainer, range.startOffset);
					const endOffset = QuillExtensions.domToQuillIndex(element, range.endContainer, range.endOffset);

					savedSelectionInfo = {
						startOffset: startOffset,
						endOffset: endOffset,
						selectedText: range.toString()
					};
				} catch(e) {
					savedSelectionInfo = null;
				}
			}
		}

		const quill = new Quill(element, {
			modules: {
				toolbar: false, // we're managing our own custom toolbar
				history: {
					delay: 500,
					maxStack: 100,
					userOnly: true, // do not put mention processing on the undo stack
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

		// Restore selection using Quill's API
		if(savedSelectionInfo && isCellEditor) {
			try {
				// Use Quill's setSelection to restore the selection
				const length = savedSelectionInfo.endOffset - savedSelectionInfo.startOffset;
				quill.setSelection(savedSelectionInfo.startOffset, length, 'silent');
			} catch(e) {
				// If restoration fails, just continue without the selection
			}
		}

		if(!isCellEditor) {
			// Set the placeholder text. Quill toggles `ql-blank` class automatically when the
			// editor is empty (its built-in `isBlank()` returns true for the natural fresh-Quill
			// state — single Block blot containing only a Break). The CSS rule
			// `.ql-editor.ql-blank::before { content: attr(data-placeholder); ... }` reads this
			// attribute and renders the placeholder. We no longer add our own `ql-editor-empty`
			// class or use a custom rule — we used to need that because the bottom-padding blot
			// made `isBlank()` always return false, but the blot has been removed.
			quill.root.setAttribute('data-placeholder', this.editorSettings.placeholderText || 'Start typing here...');
		} else {
			quill.root.setAttribute('data-table-editor', 'true');
		}

		QuillExtensions.detectEnterPress(quill, this);

		this.registerEditorChangeHandler(quill, isCellEditor);
		this.setupCopyAndPasteHandlers(quill, externalListeners);
		this.overrideClicks(quill);
		this.suppressDuplicateHistoryBeforeInput(quill);

		if(!isCellEditor) {
			QuillExtensions.guardPrimaryDeleteWhileCellActive(quill, this);
			QuillExtensions.interceptPrimaryTableAdjacentDelete(quill, this);
		}
		// Each editor (primary and each cell) gets its own AnimatedCaret. lastSelectionIndex
		// is per-instance and starts null on a fresh cell, so cell-to-cell jumps fall
		// through to "snap" naturally (oldRange null + lastSelectionIndex null → no animation).
		// Within-cell moves animate the same as within-primary moves.
		if(this.editorSettings.animateTextCursor) {
			this._animatedCarets.set(quill, new AnimatedCaret(quill));
		}

		quill.root.addEventListener('focus', () => {
			// Track which editor is active
			if(isCellEditor) {
				this.activeEditor = 'cell';
			} else {
				this.activeEditor = 'primary';
			}

			// Tell .NET the editor has focus. FocusedArea (and thus the toolbar enabled
			// state + shortcut gating) is otherwise only updated by the BrainPage document
			// click handler and a handful of arrow-key navigation handlers — so focus that
			// arrives any other way (native Tab traversal, Arrow Down from the label field,
			// programmatic focus) leaves the toolbar stuck disabled. NotifyEditorFocused is
			// idempotent and only runs the ChangeFocusAsync cascade when the area is actually
			// changing, so re-focus and cell-to-cell moves are cheap.
			this.notifyEditorFocused();

			if(this.editorSettings.clientOs == ClientOs.iOS && this.hasIosHardwareKeyboard === null) {
				this.safeSetTimeout(() => {
					this.hasIosHardwareKeyboard = getIosKeyboardHeight() === 0;
				}, 100);
			}

			// When the user taps into the editor on a touch platform, the keyboard animates
			// in after focus fires. We don't know exactly when --keyboard-height will be set
			// or what its final value will be (iOS can multi-stage; Android dispatches on
			// every IME inset change). Avoid arbitrary timeouts: if the keyboard is already
			// up (e.g. user re-tapped quickly after blur), run the fit/scroll logic now;
			// otherwise the unified keyboardheightchange listener (registered below) will
			// catch the keyboard's appearance and run it then.
			if(!isCellEditor && (this.editorSettings.clientOs == ClientOs.iOS || this.editorSettings.clientOs == ClientOs.Android)) {
				const kbHeightAtFocus = parseFloat(getComputedStyle(document.documentElement)
					.getPropertyValue('--keyboard-height').trim()) || 0;
				if(kbHeightAtFocus > 0) {
					void this.ensureContentAreaFitsKeyboardThenScroll(quill);
				}
			}
		});

		quill.root.addEventListener('blur', (e: FocusEvent) => {
			// Android: re-arm inputmode="none" so any later programmatic focus by background
			// Quill operations (selection clamps, mention clears, navigation re-renders, etc.)
			// does NOT pop the soft keyboard. The pointerdown handler removes inputmode again
			// the next time the user explicitly interacts with the editor.
			if(this.editorSettings.clientOs == ClientOs.Android) {
				quill.root.setAttribute('inputmode', 'none');
			}

			// Mirror of the focus handler: when focus leaves the editor for another major
			// area (e.g. Tab/Arrow out to the plex, properties, or main toolbar) disable the
			// notes toolbar + shortcuts. Scoped conservatively to those known sibling areas:
			// blur also fires for cell-to-cell moves and for clicking the notes toolbar's own
			// buttons/popovers, and disabling in those cases would break the very interaction
			// the user is performing. Anything not positively in another area keeps the editor
			// "focused" — re-focus and click both self-correct via NotifyEditorFocused.
			const related = e.relatedTarget as HTMLElement | null;
			if(!related || this.editorOuterContainer?.contains(related)) {
				return;
			}
			if(related.closest('#plexContainer, #thought-properties-display, #toolbar-section')) {
				this.notifyEditorBlur();
			}
		});

		// Unified keyboard handling: react to every keyboard appearance/growth (iOS and
		// Android) by running the fit/scroll logic against the current --keyboard-height.
		// startup.js dispatches 'keyboardheightchange' on iOS too (mirrors the Android
		// native event) so this single listener covers both platforms. Reacting on every
		// growth (not just first show) makes us robust to multi-stage iOS keyboard
		// animations and Android IME inset changes.
		//
		// NOTE: We must NOT gate on `this.editorSettings.clientOs` at attach time —
		// `getEditor` runs BEFORE `setEditorSettings` in `initQuillEditor`, so at this point
		// editorSettings is still the default and the check would skip the listener entirely.
		// Move the platform check inside the callback so it's evaluated when the event fires.
		if(!isCellEditor) {
			window.addEventListener('keyboardheightchange', (e: Event) => {
				const detail = (e as CustomEvent).detail;
				if(!detail) {
					return;
				}

				// Keyboard hide transition: re-arm Android inputmode="none" so any subsequent
				// programmatic focus from background Quill ops (mention/spellcheck reprocessing
				// triggered by scroll, etc.) cannot pop the keyboard back up. Tapping a
				// non-editable spot on Android does NOT actually blur quill.root — focus stays
				// on the contenteditable even with the keyboard hidden, so the existing blur
				// handler never fires in that scenario. This branch covers it.
				if(detail.height <= 0 && detail.previousHeight > 0) {
					if(this.editorSettings.clientOs == ClientOs.Android && document.activeElement === quill.root) {
						quill.root.setAttribute('inputmode', 'none');
					}
					return;
				}

				if(detail.height <= 0) {
					return;
				}
				if(this.editorSettings.clientOs != ClientOs.iOS && this.editorSettings.clientOs != ClientOs.Android) {
					return;
				}
				if(document.activeElement !== quill.root) {
					return;
				}
				void this.ensureContentAreaFitsKeyboardThenScroll(quill);
			});
		}

		// Android: track the pointerdown Y so the touchmove handler below can detect
		// whether the gesture is a scroll (re-arm inputmode) vs. a tap (leave it removed).
		let pointerDownClientY: number | null = null;

		quill.root.addEventListener('pointerdown', (event: PointerEvent) => {
			// Android: the user is about to interact with the editor — allow the soft
			// keyboard to appear when focus follows. The matching blur handler re-arms
			// inputmode="none" so any later programmatic focus stays silent.
			// pointerdown fires BEFORE the synthetic focus event, so the browser sees
			// the new inputmode value when it decides whether to show the keyboard.
			if(this.editorSettings.clientOs == ClientOs.Android) {
				quill.root.removeAttribute('inputmode');
				pointerDownClientY = event.clientY;
			}

			// Any mouse/touch interaction cancels the keyboard-driven math hold state.
			// Clicks on the held math open the dialog via the branch below; insertMath /
			// cancelMathDialog then re-enter hold on the committed or unchanged blot.
			if(this.heldMathInfo) {
				this.exitMathHold();
			}

			// Intercept math clicks here (not in the click handler) so the browser never sets a
			// selection on the math blot. Also handles math in a not-yet-active table cell: the
			// pointerdown fires on primary (event bubbled from the cell) before the table's
			// click delegate has a chance to activate the cell, so Quill.find(math) would walk
			// up to the TableBlot and we'd fall through. Activate the cell first so the math is
			// registered as a blot in the cell's tree, then dispatch the dialog off the cell's
			// quill. Without this, first click would only activate the cell and position the
			// cursor; the dialog would need a second click to open.
			if(!quill.options.readOnly && event.button === 0) {
				const mdTarget = event.target as HTMLElement;
				const math = mdTarget.closest('.ql-math');
				if(math) {
					let ownerQuill: any = quill;
					const cell = (math as HTMLElement).closest('td') as HTMLTableCellElement | null;
					if(cell && quill === this.primaryNotesEditor) {
						const cellQuill = TableBlot.activateCell(cell, this);
						if(cellQuill) ownerQuill = cellQuill;
					}
					const mathBlot = Quill.find(math);
					if(mathBlot && (mathBlot as any).statics?.blotName === MathExpressionBlot.blotName) {
						const idx = (ownerQuill as any).getIndex(mathBlot);
						if(idx !== -1 && idx != null) {
							event.preventDefault();
							event.stopPropagation();
							this.openMathDialogForBlot(ownerQuill, mathBlot, idx);
							return;
						}
					}
				}
			}

			// Clear any multi-cell table selection when the click lands outside the selected table.
			const selectedTable = this.tableState.lastTableWithSelection;
			if(selectedTable) {
				const clickTarget = event.target as Element | null;
				if(clickTarget && !selectedTable.contains(clickTarget)) {
					TableBlot.setTableSelection(selectedTable, null, null);
				}
			}

			// Get the bounding rectangle of the element
			const rect = quill.root.getBoundingClientRect();

			// Compute the x/y relative to the element's top-left corner
			const x = event.clientX - rect.left;
			const y = event.clientY - rect.top;

			this.lastPointedTime = Date.now();
			this.lastPointedCoords = {x, y};
			this.dragStartCoords = {x, y};
			this.lastPointerDownIndex = QuillExtensions.getClosestIndex(quill, x, y);

			// iOS: snapshot scroll position so we can undo WebKit's auto-scroll-to-bottom
			// when the list-tap cursor-jump bug fires (see registerEditorChangeHandler).
			if(this.editorSettings.clientOs == ClientOs.iOS) {
				const scrollContainer = this.contentAreaInner || document.getElementById('contentAreaInner') || quill.root;
				this.lastPointerDownScrollTop = scrollContainer.scrollTop;
			}

		});

		// Android: if the user's touch gesture becomes a scroll (touchmove with significant
		// vertical movement), re-arm inputmode="none". The pointerdown handler above removed
		// inputmode so the keyboard can appear for taps, but a scroll gesture should NOT
		// show the keyboard. Without this, scroll-triggered processVisibleLines calls
		// formatText → addRange → side-effect-focus the editor, and since inputmode was
		// removed by pointerdown, the keyboard pops up at scroll end.
		// For a genuine tap there is no significant touchmove, so inputmode stays removed
		// and the keyboard shows immediately as expected.
		const SCROLL_THRESHOLD_PX = 10;
		quill.root.addEventListener('touchmove', (e: TouchEvent) => {
			if(this.editorSettings.clientOs != ClientOs.Android || pointerDownClientY === null) {
				return;
			}
			if(e.touches.length !== 1) {
				return;
			}
			const dy = Math.abs(e.touches[0].clientY - pointerDownClientY);
			if(dy >= SCROLL_THRESHOLD_PX) {
				// Only re-arm inputmode if the keyboard is NOT currently showing.
				// If the user is actively editing (keyboard visible) and scrolls the
				// note content, we must NOT set inputmode="none" — that tells the
				// browser the element doesn't want a keyboard and hides it mid-edit.
				const kbHeight = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--keyboard-height') || '0');
				if(kbHeight <= 0) {
					quill.root.setAttribute('inputmode', 'none');
				}
				pointerDownClientY = null;
			}
		}, { passive: true });
		const resetPointerTracking = () => { pointerDownClientY = null; };
		quill.root.addEventListener('touchend', resetPointerTracking, { passive: true });
		quill.root.addEventListener('touchcancel', resetPointerTracking, { passive: true });

		// Quill's keyboard bindings don't reliably fire when the caret is at column 0,
		// which meant list indent/outdent (Tab/Shift+Tab) failed to run our logic.
		// Capture the keydown ourselves so we can always run handleTabKey/handleShiftTabKey
		// and suppress the browser's default focus traversal.
		const tabKeydownHandler = (event: KeyboardEvent) => {
			if(event.key !== 'Tab' || event.altKey || this.editorSettings.readOnly) {
				return;
			}
			if(this.tableState.activeCellId) {
				event.preventDefault();
				event.stopImmediatePropagation();
				QuillExtensions.handleTabInCell(this, !event.shiftKey);
				return;
			}
			const range = quill.getSelection();
			if(!range) {
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

			if(event.shiftKey) {
				this.handleShiftTabKey(range, context);
			} else {
				this.handleTabKey(range, context);
			}
		};
		quill.root.addEventListener('keydown', tabKeydownHandler, true);
		externalListeners.push({element: quill.root, event: 'keydown', handler: tabKeydownHandler});

		const escapeKeyHandler = (event: KeyboardEvent) => {
			if(event.key !== 'Escape' || !this.tableState.lastTableWithSelection) {
				return;
			}
			TableBlot.setTableSelection(this.tableState.lastTableWithSelection, null, null);
			event.preventDefault();
			event.stopImmediatePropagation();
		};
		quill.root.addEventListener('keydown', escapeKeyHandler, true);
		externalListeners.push({element: quill.root, event: 'keydown', handler: escapeKeyHandler});

		// Clear multi-cell selection on navigation keys (arrows, Tab, Enter, printable chars)
		const clearCellSelectionHandler = (event: KeyboardEvent) => {
			if(!this.tableState.lastTableWithSelection) {
				return;
			}
			const key = event.key;
			// Don't interfere with keys that have dedicated handlers
			if(key === 'Escape' || key === 'Delete' || key === 'Backspace') {
				return;
			}
			// Don't clear on modifier-only presses
			if(key === 'Shift' || key === 'Control' || key === 'Alt' || key === 'Meta') {
				return;
			}
			// Don't clear on Shift+Arrow (extends selection)
			if(event.shiftKey && (key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight')) {
				return;
			}
			// Don't clear on Ctrl/Cmd combos (copy, cut, undo, etc.)
			if(event.ctrlKey || event.metaKey) {
				return;
			}
			TableBlot.setTableSelection(this.tableState.lastTableWithSelection, null, null);
		};
		quill.root.addEventListener('keydown', clearCellSelectionHandler, true);
		externalListeners.push({element: quill.root, event: 'keydown', handler: clearCellSelectionHandler});

		quill.root.addEventListener('pointerup', (event: PointerEvent) => {
			if(this.editorSettings.readOnly) {
				return;
			}
			if(this.editorSettings.clientOs == ClientOs.iOS) {

				const DRAG_THRESHOLD = 10;
				let hasMovedSignificantly = false;

				if(this.dragStartCoords) {
					const rect = quill.root.getBoundingClientRect();
					const x = event.clientX - rect.left;
					const y = event.clientY - rect.top;

					const dx = x - this.dragStartCoords.x;
					const dy = y - this.dragStartCoords.y;
					const distance = Math.sqrt(dx * dx + dy * dy);

					hasMovedSignificantly = distance > DRAG_THRESHOLD;
					this.dragStartCoords = null; // reset for next time
				}

				// If user has dragged significantly or held for more than a second, skip the logic to set cursor position
				if(hasMovedSignificantly || (this.lastPointedTime && Date.now() - this.lastPointedTime > 1000)) {
					return;
				}

			}
		});

		if(!isCellEditor) {
			const moveHandler = (evt: MouseEvent) => this.handleEditorPointerMove(evt, quill);
			const leaveHandler = (evt: MouseEvent) => this.handleEditorPointerLeave(evt);
			quill.root.addEventListener('mousemove', moveHandler);
			quill.root.addEventListener('mouseleave', leaveHandler);
			this.collapsePointerHandlers.set(quill, { move: moveHandler, leave: leaveHandler });
		}

		this.initSpellCheckState(quill);
		this.applyTextScaleToEditor(quill, this.textScalePercent / 100);

		if(!isCellEditor) {
			// Defer the initial pass off the editor-construction path. Kicking
			// processVisibleLines off immediately means the user's very-first click
			// competes with a full-table static-processing sweep for primary-editor
			// mutation flush time, producing cold-start "cursor disappears" /
			// "click is slow" artifacts on large tables. A short timeout lets the
			// UI paint and lets the user's opening click land cleanly; processing
			// starts a moment later.
			this.safeSetTimeout(() => QuillExtensions.processVisibleLines(quill, this), 500);
		}

		const debouncedProcessVisibleLines = debounce(QuillExtensions.processVisibleLines, 100);
		const debouncedUpdateTOC = debounce(() => this.updateTableOfContents(), 250);
		const debouncedRefreshOutline: ((...args: any[]) => void) | null = isCellEditor ? null : debounce(() => this.refreshOutline(quill), 250);

		quill.on('text-change', (delta, oldDelta, source) => {
			if(!this.isStructuralTableOperation && source !== 'silent') {
				if(!quill.composition.isComposing) {
					debouncedProcessVisibleLines(quill, this);
				} else {
					this._compositionPendingProcess = true;
				}
			}
			if(!isCellEditor) {
				const isStructuralChange = QuillExtensions.isStructuralChange(delta, oldDelta);
				if(isStructuralChange) {
					debouncedRefreshOutline?.();
				}

				if(isStructuralChange || QuillExtensions.isHeadingChange(delta, oldDelta)) {
					debouncedUpdateTOC?.();
				}
			}
			if(source === 'user') {
				// Reset collapse operation tracking on user edits
				this.lastCollapseOperationTime = 0;

				// Suppress misspelling underline at cursor while actively typing
				this._isActivelyTyping = true;
				if(this._typingIdleTimer) {
					clearTimeout(this._typingIdleTimer);
				}
				this._typingIdleTimer = setTimeout(() => {
					this._isActivelyTyping = false;
					if(quill.composition.isComposing) {
						this._compositionPendingProcess = true;
						return;
					}
					const sel = quill.getSelection();
					if(sel) {
						const [cursorLine] = quill.getLine(sel.index);
						if(cursorLine?.domNode?.dataset?.processedHash) {
							delete cursorLine.domNode.dataset.processedHash;
						}
					}
					QuillExtensions.processVisibleLines(quill, this);
				}, this.spellcheckIdleDelay);

				if(this.justPressedEnter && this.editorSettings.clientOs === ClientOs.iOS) {
					// On iOS, change the focus from the editor and return quickly after pressing enter to enable auto-capitalization.
					// Use of the dummy input element prevents keyboard flicker and disappearing that happens if calling blur() directly on the editor.
					this.justPressedEnter = false;
					this.safeSetTimeout(() => {
						this.dummyInput!.focus();
						this.safeSetTimeout(() => {
							quill.focus();
						}, 0);
					}, 0);
				}
			}
		});

		quill.on('composition-end', () => {
			if(this._compositionPendingProcess) {
				this._compositionPendingProcess = false;
				this.safeSetTimeout(() => {
					debouncedProcessVisibleLines(quill, this);
				}, 0);
			}
		});

		// Scroll and Resize Listeners on window, and scrollable parents
		const scrollAndResizeHandler = () => {
			if(quill !== this.primaryNotesEditor && quill !== this.cellNotesEditor) {
				// this should not happen if the listeners are detached correctly
				return;
			}

			debouncedProcessVisibleLines(quill, this);
			if(!isCellEditor) {
				this.scheduleCollapseUiUpdate();
			}

			// if there is a link/mention tooltip, reposition it. Math tooltip is no longer used.
			if(this.activeInlineTooltip) {
				const formats = quill.getFormat(this.activeInlineTooltip.index, this.activeInlineTooltip.length);
				if(!formats.link && !formats.mention) {
					this.hideLinkTooltip();
					return;
				}

				const url: string = (formats.link || formats.mention) as string;
				const displayText = this.getNameFromUrl(url);
				const bounds = quill.getBounds({index: this.activeInlineTooltip.index, length: this.activeInlineTooltip.length});

				// Reposition
				this.showLinkTooltip(displayText, url, bounds, quill);
			}

			if(this.imageControls) {
				// Image controls are shown, reposition them
				this.imageControls.positionControls();
			}
		};

		// Always attach to the Quill editor's root.
		quill.root.addEventListener('scroll', scrollAndResizeHandler);
		// ResizeObserver for the Quill editor's root
		const resizeObserver = new ResizeObserver(entries => {
			for(let entry of entries) {
				scrollAndResizeHandler();
			}
		});
		resizeObserver.observe(quill.root);
		this.resizeObservers.set(quill, resizeObserver);

		// Attach to scrollable parents
		let parent: HTMLElement | null = quill.root.parentElement;
		while(parent) {
			const overflowY = getComputedStyle(parent).overflowY;
			if(overflowY === 'auto' || overflowY === 'scroll') {
				parent.addEventListener('scroll', scrollAndResizeHandler);
				externalListeners.push({element: parent, event: 'scroll', handler: scrollAndResizeHandler});
			}
			parent = parent.parentElement;
		}

		// Attach to window
		window.addEventListener('scroll', scrollAndResizeHandler);
		externalListeners.push({element: window, event: 'scroll', handler: scrollAndResizeHandler});

		// Store external listeners for this quill instance
		this.editorListeners.set(quill, externalListeners);

		if(!isCellEditor) {
			this.refreshOutline(quill);
		}

		return quill;
	}

	private removeEventListenersForEditor(quill: any) {
		// Remove external event listeners (on document, window, and scrollable parents)
		if(!quill) return;
		const externalListeners = this.editorListeners.get(quill);
		if(externalListeners) {
			externalListeners.forEach(({element, event, handler}) => {
				element.removeEventListener(event, handler as EventListener);
			});
			this.editorListeners.delete(quill);
		}
		const resizeObserver = this.resizeObservers.get(quill);
		if(resizeObserver) {
			resizeObserver.disconnect();
			this.resizeObservers.delete(quill);
		}

		const pointerHandlers = this.collapsePointerHandlers.get(quill);
		if(pointerHandlers) {
			quill.root.removeEventListener('mousemove', pointerHandlers.move as EventListener);
			quill.root.removeEventListener('mouseleave', pointerHandlers.leave as EventListener);
			this.collapsePointerHandlers.delete(quill);
		}

		const caret = this._animatedCarets.get(quill);
		if(caret) {
			caret.dispose();
			this._animatedCarets.delete(quill);
		}
	}

	/**
	 * Sets up overrides/extensions for Quill
	 */
	private initQuillExtensions(quill: any): void {
		const LinkBlot = quill.constructor.import('formats/link')
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

		quill.on('editor-change', (eventName: string, ...args: any) => {
			this.checkIfLinkTooltipShouldBeShown();
		});

		QuillExtensions.enableTableBlot(quill, this);
		QuillExtensions.addMathSelectionHoldBindings(quill, this);
	}

	private overrideClicks(quill: any): void {
		quill.root.addEventListener('click', (event: MouseEvent) => {
			this.overrideClick(quill, false, event);
		});
		quill.root.addEventListener('contextmenu', (event: MouseEvent) => {
			// On phones, suppress the custom context menu entirely.
			// The floating toolbar provides formatting actions, and the native OS
			// selection handles provide cut/copy/paste.
			if(this.editorSettings.clientOs == ClientOs.Android || this.editorSettings.clientOs == ClientOs.iOS) {
				return;
			}
			this.overrideClick(quill, true, event);
		});
	}

	private overrideClick(quill: any, isContextClick: boolean, event: MouseEvent) {

		const readonly = quill.options.readOnly;
		const target = event.target as HTMLElement;

		if(!readonly && !isContextClick) {
			// Math clicks are handled in pointerdown above (to avoid a tooltip flash from the
			// native selection change). Non-context non-readonly clicks are otherwise left to
			// Quill's default handling.
			return;
		}

		let showLinkTooltip = false;
		let contextMenuType: string | null = null;
		let contextMenuWord: string | null = null;
		let contextMenuIndex: number | null = null;
		let contextMenuLength: number | null = null;

		// Get the current selection to check if we're clicking within a selection
		const currentSelection = this.getSelectionWithFallback();
		const hasSelection = currentSelection && currentSelection.length > 0;

		// Check for a link click
		const anchor = target.closest('a');
		if(anchor) {
			// This is a link
			if(!isContextClick) {
				// Follow the link. Allow Blazor to handle link clicks so brain:// links can be opened in the app
				event.preventDefault();
				safeInvoke(this.dotNetHelper, "HandleLinkClick", [anchor.href]);
				return;
			} else {
				// Check if the link is within an existing selection
				// If so, show standard context menu instead of link menu
				if(hasSelection) {
					const rect = quill.root.getBoundingClientRect();
					const x = event.clientX - rect.left;
					const y = event.clientY - rect.top;
					const clickedIndex = QuillExtensions.getClosestIndex(quill, x, y);

					// If clicked position is within the selection, don't show link tooltip
					if(clickedIndex >= currentSelection.index && clickedIndex < currentSelection.index + currentSelection.length) {
						showLinkTooltip = false;
					} else {
						// Context-click on link shows tooltip
						showLinkTooltip = true;
						contextMenuType = anchor.href?.startsWith('brain://') ? 'thoughtLink' : 'link';
					}
				} else {
					// No selection, show link tooltip
					showLinkTooltip = true;
					contextMenuType = anchor.href?.startsWith('brain://') ? 'thoughtLink' : 'link';
				}
			}
		} else {
			const misspelling = target.closest('.misspelled-word');

			// Check for mention
			const mention = target.closest('.mentioned-thought');
			if(mention) {
				// Check if the mention is within an existing selection
				// If so, show standard context menu instead of link menu
				if(isContextClick && hasSelection) {
					const rect = quill.root.getBoundingClientRect();
					const x = event.clientX - rect.left;
					const y = event.clientY - rect.top;
					const clickedIndex = QuillExtensions.getClosestIndex(quill, x, y);

					// If clicked position is within the selection, don't show link tooltip
					if(clickedIndex >= currentSelection.index && clickedIndex < currentSelection.index + currentSelection.length) {
						showLinkTooltip = false;
					} else {
						// Left or right click on mention shows tooltip
						showLinkTooltip = true;
						if(misspelling && (mention.contains(misspelling) || misspelling.contains(mention))) {
							const misspellingBlot = Quill.find(misspelling);
							if(misspellingBlot && misspellingBlot !== quill) {
								const word = misspelling.textContent || "";
								const index = quill.getIndex(misspellingBlot as any);
								const length = word.length;

								contextMenuType = 'link-misspelling';
								contextMenuWord = word;
								contextMenuIndex = index;
								contextMenuLength = length;
							} else {
								contextMenuType = 'link';
							}
						} else {
							contextMenuType = 'link';
						}
					}
				} else {
					// Left or right click on mention shows tooltip
					showLinkTooltip = true;
					if(isContextClick) {
						if(misspelling && (mention.contains(misspelling) || misspelling.contains(mention))) {
							const misspellingBlot = Quill.find(misspelling);
							if(misspellingBlot && misspellingBlot !== quill) {
								const word = misspelling.textContent || "";
								const index = quill.getIndex(misspellingBlot as any);
								const length = word.length;

								contextMenuType = 'link-misspelling';
								contextMenuWord = word;
								contextMenuIndex = index;
								contextMenuLength = length;
							} else {
								contextMenuType = 'link';
							}
						} else {
							contextMenuType = 'link';
						}
					}
				}
			} else {
				// Check for misspelling (only if not a link or mention - mentions take precedence)
				if(misspelling && isContextClick) {
					// Show misspelling context menu
					event.preventDefault();
					event.stopPropagation();
					const rect = quill.root.getBoundingClientRect();
					const x = event.clientX - rect.left;
					const y = event.clientY - rect.top;
					const tappedIndex = QuillExtensions.getClosestIndex(quill, x, y);
					quill.setSelection({index: tappedIndex, length: 0});

					// Find the MisspellingBlot from the DOM element
					const misspellingBlot = Quill.find(misspelling);
					if(misspellingBlot && misspellingBlot !== quill) {
						const word = misspelling.textContent || "";
						const index = quill.getIndex(misspellingBlot as any);
						const length = word.length;

						this.showContextMenu(event.clientX, event.clientY, "misspelling", word, index, length);
					}
					return;
				}
			}
		}

		if(showLinkTooltip) {

			event.preventDefault();
			if(isContextClick) {
				event.stopPropagation();
			}
			const rect = quill.root.getBoundingClientRect();
			const x = event.clientX - rect.left;
			const y = event.clientY - rect.top;
			const tappedIndex = QuillExtensions.getClosestIndex(quill, x, y);
			if(contextMenuType === 'link-misspelling' && contextMenuIndex != null && contextMenuLength != null) {
				quill.setSelection({index: contextMenuIndex, length: contextMenuLength});
			} else {
				quill.setSelection({index: tappedIndex, length: 0});
			}
			// Instead of opening immediately, show a tooltip with the link info so it can be linked or opened
			this.checkIfLinkTooltipShouldBeShown();

			if(isContextClick && contextMenuType) {
				this.showContextMenu(
					event.clientX,
					event.clientY,
					contextMenuType,
					contextMenuWord ?? undefined,
					contextMenuIndex ?? undefined,
					contextMenuLength ?? undefined
				);
			}

		} else if(this.activeInlineTooltip != null) {

			// If we have an active link range, it means we are showing a tooltip

			// Dismiss link tooltip
			event.preventDefault();
			event.stopPropagation();
			this.hideLinkTooltip();
		} else {
			// This is a click on a normal part of the text and there isn't a link tooltip to dismiss
			if(isContextClick) {
				// Context click handling

				let isSelectedCells = false;

				// Check if we are clicking on a selection of table cells
				const targetTable = target.closest('table') as HTMLTableElement;
				const targetCell = target.closest('td') as HTMLElement;
				if(targetTable) {
					TableBlot.getSelectedCells(targetTable).forEach((cell) => {
						if(cell === targetCell) {
							// The clicked cell is part of the selection
							isSelectedCells = true;
						}
					})
				}

				if(!isSelectedCells) {
					const isCellEditorActive = this.isCellEditorActive();
					if(!isCellEditorActive) {
						if(targetCell) {
							// If the cell editor is nor active but we are clicking ona table cell, activate the cell editor
							TableBlot.activateCell(targetCell, this);
						}
					}
				}

				// Check if right-clicking on an image - if so, select the image
				const targetImage = target.closest('img') || (target.tagName === 'IMG' ? target : null);
				if(targetImage) {
					const imageBlot = Quill.find(targetImage);
					if(imageBlot && imageBlot !== quill) {
						const index = quill.getIndex(imageBlot as any);
						if(index !== -1) {
							quill.setSelection(index, 1, 'silent');
						}
					}
				}

				// Show context menu
				event.preventDefault();
				event.stopPropagation();
				let mode = "standard";
				if(isSelectedCells) {
					mode = "table";
				}
				this.showContextMenu(event.clientX, event.clientY, mode);
			} else {
				// proceeed normally
			}
		}
	}

	private overrideLinkSanitizer(LinkBlot: any): void {
		LinkBlot.sanitize = (url: string) => url;
	}

	private overrideFontStyleWhitelist(FontStyle: any): void {
		FontStyle.whitelist = null;
	}

	private getNameFromUrl(url: string): string {
		const isInternalLink = url.startsWith('brain://');
		if(isInternalLink && url.indexOf('?name=') > -1) {
			let name = url.substring(url.indexOf('?name=') + 6);
			// Unescape the display text
			name = decodeURIComponent(name);
			return name;
		}
		return url;
	}

	private checkIfLinkTooltipShouldBeShown(): void {
		const quill = this.notesEditor();
		const range = this.getSelectionWithFallback();

		if(!quill || !range) {
			this.hideLinkTooltip();
			return;
		}

		// Math tooltip has been replaced by the select-and-hold keyboard model - arrow into a
		// math blot selects it, and Enter / click / printable key opens MathDialog. The tooltip
		// branch that used to live here is gone; the hold bindings are added in
		// QuillExtensions.addMathSelectionHoldBindings.

		if(range.length > 0 || range.index === 0) {
			this.hideLinkTooltip();
			return;
		}

		const isSelectionCollapsed = range.length === 0;

		// Check if we're inside a link blot at the current selection index
		const formats = quill.getFormat(range.index, range.length);

		if(formats.link || formats.mention) {
			const [leaf, offset] = quill.getLeaf(isSelectionCollapsed ? range.index : range.index + 1);

			const url = formats.link || formats.mention;

			let displayText = this.getNameFromUrl(url);

			// Get the bounds (x, y, width, height) of the cursor
			const bounds = quill.getBounds(range);

			// Show the tooltip with the link info, positioned above the cursor
			this.showLinkTooltip(displayText, url, bounds, quill);
			this.activeInlineTooltip = {
				index: range.index,
				length: range.length,
				type: formats.link ? 'link' : 'mention'
			};

		} else {
			this.hideLinkTooltip();
		}
	}

	private getFormatRange(quill: any, index: number, formatName: string) {
		let formatBlot = null;

		// Try using getLeaf to find the leaf at the index.
		const [leaf] = quill.getLeaf(index);
		if(leaf) {
			// Check if the leaf itself has the desired format.
			if(leaf.statics && leaf.statics.blotName === formatName) {
				formatBlot = leaf;
			}
			// Otherwise, check if its parent (often the inline format) is the desired format.
			else if(leaf.parent && leaf.parent.statics && leaf.parent.statics.blotName === formatName) {
				formatBlot = leaf.parent;
			}
		}

		if(formatBlot) {
			const formatIndex = quill.getIndex(formatBlot);
			const length = formatBlot.length();
			return {index: formatIndex, length: length};
		}

		return null;
	}

	private getFormatRangeForLinkOrMention(index: number): { index: number; length: number; type: string } | null {
		const quill = this.notesEditor();

		let formatRange = this.getFormatRange(quill, index, 'link');
		let formatType = 'link';

		if(!formatRange) {
			formatRange = this.getFormatRange(quill, index, 'mention');
			formatType = 'mention';
		}

		if(!formatRange) {
			return null;
		}

		let start = formatRange.index;
		let end = formatRange.index + formatRange.length;

		// check if the format continues to the left or right
		const leftRange = this.getFormatRange(quill, formatRange.index - 1, formatType);
		const rightRange = this.getFormatRange(quill, formatRange.index + formatRange.length, formatType);
		if(leftRange) {
			start = leftRange.index;
		}
		if(rightRange) {
			end = rightRange.index + rightRange.length;
		}

		return {index: start, length: end - start, type: formatType};
	}

	/**
	 * Finds the word boundaries at the given index position.
	 * A word is defined as a sequence of non-whitespace, non-punctuation characters.
	 * Returns the range of the word if the cursor is at the beginning, middle, or end of a word.
	 */
	private getWordRangeAtIndex(index: number): { index: number; length: number } | null {
		const quill = this.notesEditor();
		if(!quill) return null;

		const totalLength = quill.getLength();
		if(index < 0 || index >= totalLength) return null;

		// Get a reasonable chunk of text around the cursor.
		// Use getContents() rather than getText() because getText() strips embeds
		// (e.g. inline math blots), which would misalign chunk indices with Quill's
		// index space and cause the word search to find the wrong boundaries.
		const lookBehind = Math.min(index, 100);
		const lookAhead = Math.min(totalLength - index, 100);
		const startPos = index - lookBehind;
		const contents = quill.getContents(startPos, lookBehind + lookAhead);
		let textChunk = '';
		for(const op of (contents.ops || [])) {
			if(typeof op.insert === 'string') {
				textChunk += op.insert;
			} else if(op.insert != null) {
				// Embed: occupies 1 in Quill's index space. Use a newline so it
				// acts as a word boundary and keeps positions aligned.
				textChunk += '\n';
			}
		}
		const cursorPosInChunk = lookBehind;

		// Word boundary regex: matches sequences of non-whitespace, non-punctuation characters
		// This includes letters, numbers, and common word characters across different languages
		const wordCharRegex = /[^\s\p{P}\p{Z}]/u;
		const nonWordCharRegex = /[\s\p{P}\p{Z}]/u;

		// Determine the position to start searching from
		let searchPos = cursorPosInChunk;
		const charAtCursor = textChunk[cursorPosInChunk];

		if(!charAtCursor) {
			return null;
		}

		if(nonWordCharRegex.test(charAtCursor)) {
			// Current character is not a word character
			// Check if the character before the cursor is a word character (cursor at end of word)
			if(cursorPosInChunk > 0 && wordCharRegex.test(textChunk[cursorPosInChunk - 1])) {
				// Cursor is at the end of a word, use the position before the cursor
				searchPos = cursorPosInChunk - 1;
			} else {
				// Not on or immediately after a word character, no word to select
				return null;
			}
		}

		// Find the start of the word by moving backward
		let wordStart = searchPos;
		while(wordStart > 0 && wordCharRegex.test(textChunk[wordStart - 1])) {
			wordStart--;
		}

		// Find the end of the word by moving forward
		let wordEnd = searchPos + 1;
		while(wordEnd < textChunk.length && wordCharRegex.test(textChunk[wordEnd])) {
			wordEnd++;
		}

		// Convert chunk-relative positions back to document positions
		const wordStartIndex = startPos + wordStart;
		const wordLength = wordEnd - wordStart;

		if(wordLength === 0) {
			return null;
		}

		return { index: wordStartIndex, length: wordLength };
	}

	// The further away the tooltip is, the less likely it is to interfere with iOS long-press-and-drag on spacebar cursor movement
	TOOLTIP_DISTANCE_FROM_SOURCE = 35;
	TOOLTIP_VIEWPORT_PADDING = 5;

	/**
	 * Truncates text in the middle (macOS-style) if it exceeds maxLength.
	 * Shows approximately 40% from the start and 40% from the end with "..." in the middle.
	 */
	private middleTruncateText(text: string, maxLength: number = 45): string {
		if (!text || text.length <= maxLength) {
			return text;
		}

		// Calculate how many characters to show on each side
		// Reserve 3 characters for the ellipsis "..."
		const availableLength = maxLength - 3;
		const startLength = Math.ceil(availableLength * 0.5);
		const endLength = Math.floor(availableLength * 0.5);

		const start = text.substring(0, startLength);
		const end = text.substring(text.length - endLength);

		return `${start}...${end}`;
	}

	// Rebuild the outline metadata for the entire document. We walk each Quill line,
	// classify it (heading/list/paragraph/etc.), assign nesting levels, and update the
	// collapse state so the UI can draw chevrons and hide ranges efficiently.
	private refreshOutline(quillOverride?: any): void {
		const editor = quillOverride ?? this.notesEditor();
		if(!editor) {
			// No editor means no outline; clear cached state and bail.
			this.outlineBlocks = [];
			this.outlineBlockById.clear();
			this.hasAnyCollapsibleBlocks = false;
			this.scheduleCollapseUiUpdate();
			return;
		}

		// Pull every Quill line and use it to rebuild the OutlineBlock list.
		const lines = editor.getLines(0, editor.getLength());
		const outline: OutlineBlock[] = [];
		const map = new Map<string, OutlineBlock>();
		const stack: OutlineBlock[] = [];

		for(let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const domNode = line.domNode as HTMLElement | null;
			const length = typeof line.length === 'function' ? line.length() : 0;
			if(!domNode) {
				continue;
			}

			// Capture the raw text and formats to classify the outline level.
			const lineText = domNode.innerText ?? domNode.textContent ?? '';
			const lineIndexInDoc = typeof editor.getIndex === 'function' ? editor.getIndex(line) : 0;
			const lineFormats = typeof line.formats === 'function' ? line.formats() : editor.getFormat(lineIndexInDoc, Math.max(1, length));
			const { level, type } = this.computeOutlineLevel(line, lineText, lineFormats);
			const id = this.ensureLineId(domNode);
			const outlinePosition = outline.length;

			// Seed a new OutlineBlock; outlineEndPosition will be corrected after children walk.
			const block: OutlineBlock = {
				id,
				lineIndex: i,
				outlinePosition,
				outlineEndPosition: outlinePosition,
				level,
				type,
				isCollapsible: false,
				isCollapsed: this.collapseState.get(id)?.isCollapsed ?? false,
				domNode,
				parentId: null
			};

			// Pop anything on the stack that is a peer or ancestor; the remaining entry becomes our parent.
			while(stack.length && stack[stack.length - 1].level >= block.level) {
				stack.pop();
			}
			if(block.type !== 'list') {
				while(stack.length && stack[stack.length - 1].type === 'list') {
					stack.pop();
				}
			}
			block.parentId = stack.length ? stack[stack.length - 1].id : null;
			stack.push(block);

			// Cache block by id for fast lookups later.
			outline.push(block);
			map.set(id, block);
		}

		// Second pass: mark collapsible nodes and compute descendant ranges.
		let foundCollapsible = false;
		for(let index = 0; index < outline.length; index++) {
			const block = outline[index];
			let hasChild = false;
			let lastDescendant = index;

			for(let lookahead = index + 1; lookahead < outline.length; lookahead++) {
				const candidate = outline[lookahead];
				if(candidate.level <= block.level) {
					break;
				}
				// Lists shouldn’t scoop up trailing paragraphs that aren’t part of the same list.
				if(block.type === 'list' && candidate.type === 'paragraph') {
					break;
				}
				hasChild = true;
				lastDescendant = lookahead;
			}

			if(hasChild && block.type !== 'paragraph' && block.type !== 'code') {
				// Non-paragraph and non-code parents become collapsible and inherit the descendant offsets.
				block.isCollapsible = true;
				block.outlineEndPosition = lastDescendant;
				foundCollapsible = true;
			} else {
				// Paragraphs, code blocks, or leaf nodes can never stay collapsed; clear any previous flag.
				block.isCollapsed = false;
				block.outlineEndPosition = block.outlinePosition;
				if(this.collapseState.has(block.id)) {
					this.collapseState.delete(block.id);
				}
			}
		}

		// Drop stale collapse entries for blocks that disappeared (e.g. deleted lines).
		for(const id of Array.from(this.collapseState.keys())) {
			if(!map.has(id)) {
				this.collapseState.delete(id);
			}
		}

		// Cache the freshly built outline and immediately reapply collapse visibility (no animation here).
		this.outlineBlocks = outline;
		this.outlineBlockById = map;
		this.hasAnyCollapsibleBlocks = foundCollapsible;
		this.applyCollapseState(false);
		this.scheduleCollapseUiUpdate();
	}

	// Convert Quill formatting for a single line into an outline “level” and type.
	// Headings, lists, blockquotes and code blocks get distinct bands so parents can
	// be compared numerically with their descendants.
	private computeOutlineLevel(line: any, text: string, formats: any): { level: number; type: OutlineBlockType } {
		const indent = typeof formats?.indent === 'number' ? formats.indent : 0;
		if(formats?.header) {
			// Headings sit at low numbers so they outrank body text.
			const headerLevel = Number(formats.header) || 1;
			return { level: headerLevel * 10, type: 'heading' };
		}
		if(formats?.list) {
			// Lists get a higher band so nested list items remain children of their headers.
			return { level: 100 + indent * 10, type: 'list' };
		}
		if(formats?.['code-block']) {
			// Code blocks live in their own band; indent keeps position for nested code.
			return { level: 200 + indent * 10, type: 'code' };
		}
		if(formats?.blockquote) {
			// Blockquotes add a constant so they never collapse paragraphs above them.
			const quoteLevel = typeof formats.blockquote === 'number' ? formats.blockquote : 1;
			return { level: 150 + (quoteLevel - 1) * 10 + indent, type: 'blockquote' };
		}
		const trimmed = text.trim();
		// Plain paragraphs are parked at the highest band so they always sit under headings/lists.
		return { level: 300 + indent * 10 + (trimmed.length === 0 ? 5 : 0), type: trimmed.length === 0 ? 'paragraph' : 'paragraph' };
	}

	private ensureLineId(domNode: HTMLElement): string {
		if(!domNode.dataset) {
			(domNode as any).dataset = {};
		}

		let id = domNode.dataset.venusLineId ?? '';
		if(id) {
			const existingOwner = this.lineNodeById.get(id);
			if(existingOwner && existingOwner !== domNode) {
				if(existingOwner.isConnected) {
					// Collision with another live node; force this node to take a fresh id.
					console.log(`[VenusEditor] Duplicate line id '${id}' detected; assigning a new id for cloned line.`);
					id = '';
				} else {
					// Stale owner: drop it so the new node can reuse the identifier.
					this.lineNodeById.delete(id);
				}
			}
		}

		if(!id) {
			this.lineIdSeed++;
			id = `vl-${this.lineIdSeed}`;
			domNode.dataset.venusLineId = id;
		}

		this.lineNodeById.set(id, domNode);
		return id;
	}

	// Apply the current collapse state to the DOM. We compute which lines should be
	// hidden based on collapsed parents, then show/hide (and optionally animate) only
	// those DOM nodes, keeping the rest of the document untouched.
	private applyCollapseState(allowAnimation: boolean = true): void {
		const editor = this.notesEditor();
		if(!editor) {
			return;
		}

		const neverCollapse = this.editorSettings.collapseButtonVisibility === OutlineCollapseButtonVisibility.Never;
		const hiddenLineIndices = new Set<number>();
		for(const block of this.outlineBlocks) {
			// Collapse state lives outside outlineBlocks; sync `isCollapsed` from the map.
			const isCollapsed = neverCollapse ? false : (this.collapseState.get(block.id)?.isCollapsed ?? false);
			block.isCollapsed = block.isCollapsible && isCollapsed;
			if(block.isCollapsed) {
				for(let pos = block.outlinePosition + 1; pos <= block.outlineEndPosition && pos < this.outlineBlocks.length; pos++) {
					hiddenLineIndices.add(this.outlineBlocks[pos].lineIndex);
				}
			}
		}

		const enableAnimation = allowAnimation && this.collapseAnimationMode === 'single';
		const lines = editor.getLines(0, editor.getLength());
		for(let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const domNode = line.domNode as HTMLElement | null;
			if(!domNode) {
				continue;
			}
			const shouldHide = hiddenLineIndices.has(i);
			const wasHidden = domNode.dataset?.collapsedHidden === 'true';

			if(shouldHide) {
				if(enableAnimation && !wasHidden) {
					// Newly hidden line: play a height/opacity animation before removing it.
					this.animateLineHide(domNode);
				} else {
					// Either we were already hidden, or animation is disabled; snap back to hidden state.
					this.stopLineAnimation(domNode);
					domNode.style.display = 'none';
					domNode.style.height = '';
					domNode.style.opacity = '';
					domNode.style.transition = '';
					domNode.style.overflow = '';
					if(!domNode.dataset) {
						(domNode as any).dataset = {};
					}
					domNode.dataset.collapsedHidden = 'true';
				}
			} else {
				if(enableAnimation && wasHidden) {
					// Previously hidden line is returning; animate it back into view.
					this.animateLineShow(domNode);
				} else {
					// Nothing to animate—ensure the node is visible and clean.
					this.stopLineAnimation(domNode);
					domNode.style.display = '';
					domNode.style.height = '';
					domNode.style.opacity = '';
					domNode.style.transition = '';
					domNode.style.overflow = '';
					if(!domNode.dataset) {
						(domNode as any).dataset = {};
					}
					domNode.dataset.collapsedHidden = 'false';
				}
			}
		}

		// Hide code block containers when all their children are hidden
		const codeBlockContainers = editor.root.querySelectorAll('.ql-code-block-container');
		for(const container of codeBlockContainers) {
			const children = Array.from(container.children) as HTMLElement[];
			const allChildrenHidden = children.length > 0 && children.every(child => child.dataset?.collapsedHidden === 'true');
			if(allChildrenHidden) {
				(container as HTMLElement).style.display = 'none';
			} else {
				(container as HTMLElement).style.display = '';
			}
		}

		this.collapseAnimationMode = 'single';

		// Folding may move the caret; ensure we're not leaving it inside hidden content.
		this.updateCollapseForSelection();
		this.updateOutlineCommandStates();
	}
	
	private stopLineAnimation(domNode: HTMLElement): void {
		const cleanup = (domNode as any)._collapseAnimationCleanup as (() => void) | undefined;
		if(cleanup) {
			cleanup();
		}
	}
	
	private animateLineHide(domNode: HTMLElement): void {
		this.stopLineAnimation(domNode);
		const startHeight = domNode.offsetHeight;
		domNode.dataset.collapsedHidden = 'true';
		domNode.style.display = '';
		if(startHeight <= 0) {
			domNode.style.display = 'none';
			domNode.style.height = '';
			domNode.style.opacity = '';
			domNode.style.transition = '';
			domNode.style.overflow = '';
			delete (domNode as any)._collapseAnimationCleanup;
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
			delete (domNode as any)._collapseAnimationCleanup;
		};
	
		const onTransition = (event: TransitionEvent) => {
			if(event.propertyName !== 'height') {
				return;
			}
			cleanup();
		};
	
		domNode.addEventListener('transitionend', onTransition);
		(domNode as any)._collapseAnimationCleanup = cleanup;
		requestAnimationFrame(() => {
			domNode.style.height = '0px';
			domNode.style.opacity = '0';
		});
	}
	
	private animateLineShow(domNode: HTMLElement): void {
		this.stopLineAnimation(domNode);
		domNode.dataset.collapsedHidden = 'false';
		domNode.style.display = '';
		domNode.style.overflow = 'hidden';
		domNode.style.height = '0px';
		domNode.style.opacity = '0';
		domNode.style.transition = 'height 180ms ease, opacity 180ms ease';
	
		const targetHeight = domNode.scrollHeight;
		if(targetHeight <= 0) {
			domNode.style.height = '';
			domNode.style.opacity = '';
			domNode.style.transition = '';
			domNode.style.overflow = '';
			delete (domNode as any)._collapseAnimationCleanup;
			return;
		}
	
		const cleanup = () => {
			domNode.removeEventListener('transitionend', onTransition);
			domNode.style.height = '';
			domNode.style.opacity = '';
			domNode.style.transition = '';
			domNode.style.overflow = '';
			delete (domNode as any)._collapseAnimationCleanup;
		};
	
		const onTransition = (event: TransitionEvent) => {
			if(event.propertyName !== 'height') {
				return;
			}
			cleanup();
		};
	
		domNode.addEventListener('transitionend', onTransition);
		(domNode as any)._collapseAnimationCleanup = cleanup;
		requestAnimationFrame(() => {
			domNode.style.height = `${targetHeight}px`;
			domNode.style.opacity = '1';
		});
	}

	private scheduleCollapseUiUpdate(): void {
		if(this.collapseRenderScheduled) {
			return;
		}
		this.collapseRenderScheduled = true;
		requestAnimationFrame(() => {
			this.collapseRenderScheduled = false;
			this.renderCollapseControls();
		});
	}

	private ensureCollapseOverlay(): HTMLElement | null {
		if(this.collapseOverlay && this.collapseOverlay.isConnected) {
			return this.collapseOverlay;
		}
		const editor = this.notesEditor();
		if(!editor) {
			return null;
		}
		const container = editor.container as HTMLElement | null;
		if(!container) {
			return null;
		}
		if(getComputedStyle(container).position === 'static') {
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

	private clearCollapseOverlay(): void {
		if(this.collapseOverlay && this.collapseOverlay.isConnected) {
			this.collapseOverlay.innerHTML = '';
			this.collapseOverlay.style.display = 'none';
		}
	}

	/**
	 * classList.remove() rewrites the class attribute even when the token is absent, which
	 * fires Quill's MutationObserver and forces a native-selection save/restore on every
	 * call. Since this runs on every selection change, only touch the attribute when the
	 * class presence actually changes.
	 */
	private static setClassPresence(element: HTMLElement, className: string, present: boolean): void {
		if(element.classList.contains(className) !== present) {
			element.classList.toggle(className, present);
		}
	}

	private renderCollapseControls(): void {
		const editor = this.notesEditor();
		if(!editor) {
			this.clearCollapseOverlay();
			return;
		}

		if(this.isCellEditorActive() && this.isCellEditorInstance(editor)) {
			const cellRoot = editor.root as HTMLElement;
			VenusEditor.setClassPresence(cellRoot, 'venus-outline-collapsible', false);
			if(this.collapseOverlay) {
				this.collapseOverlay.innerHTML = '';
				this.collapseOverlay.style.display = 'none';
			}
			return;
		}

		const rootElement = editor.root as HTMLElement;
		const overlay = this.ensureCollapseOverlay();
		if(!overlay) {
			VenusEditor.setClassPresence(rootElement, 'venus-outline-collapsible', false);
			return;
		}

		if(!this.hasAnyCollapsibleBlocks || this.editorSettings.collapseButtonVisibility === OutlineCollapseButtonVisibility.Never) {
			overlay.innerHTML = '';
			overlay.style.display = 'none';
			VenusEditor.setClassPresence(rootElement, 'venus-outline-collapsible', false);
			VenusEditor.setClassPresence(rootElement, 'venus-collapse-hidden-phone',
				this.editorSettings.isPhone && this.editorSettings.collapseButtonVisibility === OutlineCollapseButtonVisibility.Never);
			return;
		}

		overlay.style.display = '';
		const container = editor.container as HTMLElement;
		const containerRect = container.getBoundingClientRect();
		const rootRect = rootElement.getBoundingClientRect();
		// Detect CSS scale transforms on ancestors so we convert viewport-space
		// measurements back to local CSS-space for absolute positioning.
		const cssScaleY = rootElement.offsetHeight > 0
			? rootRect.height / rootElement.offsetHeight
			: 1;
		const rootOffsetWithinContainer = (rootRect.top - containerRect.top) / cssScaleY;
		const viewportTop = rootElement.scrollTop - this.collapseHoverMargin;
		const viewportBottom = rootElement.scrollTop + rootElement.clientHeight + this.collapseHoverMargin;
		const range = this.getSelectionWithFallback();
		const selectionBlock = range ? this.getOutlineBlockForIndex(range.index) : null;
		const nearestSelectionCollapse = range ? this.getNearestCollapsibleBlockForIndex(range.index) : null;
		const existingButtons = new Map<string, HTMLButtonElement>();
		const buttonsToRemove: HTMLButtonElement[] = [];
		Array.from(overlay.children).forEach(child => {
			if(!(child instanceof HTMLButtonElement)) {
				return;
			}
			const blockId = child.dataset.blockId;
			if(!blockId) {
				buttonsToRemove.push(child);
				return;
			}
			if(existingButtons.has(blockId)) {
				buttonsToRemove.push(child);
				return;
			}
			existingButtons.set(blockId, child);
		});
		if(buttonsToRemove.length > 0) {
			console.log(`[VenusEditor] Removed ${buttonsToRemove.length} duplicate collapse toggle(s) from overlay.`);
			for(const leftover of buttonsToRemove) {
				leftover.remove();
			}
		}

		const horizontalPosition = Math.max(rootElement.scrollLeft + 4, 4);
		let renderedButtons = 0;
		for(const block of this.outlineBlocks) {
			if(!block.isCollapsible) {
				continue;
			}
			const domNode = block.domNode;
			if(!domNode || !domNode.isConnected) {
				continue;
			}

			const blockTop = this.getOffsetTopRelativeTo(domNode, rootElement);
			const blockHeight = domNode.offsetHeight || (domNode.getBoundingClientRect().height / cssScaleY);
			const blockBottom = blockTop + blockHeight;
			if(blockBottom < viewportTop) {
				continue;
			}
			if(blockTop > viewportBottom) {
				// Blocks mirror document order, so once we are past the viewport the rest
				// will fall below it as well.
				break;
			}

			let button = existingButtons.get(block.id);
			if(!button) {
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
					if(this.hoveredCollapseId !== block.id) {
						this.hoveredCollapseId = block.id;
						this.scheduleCollapseUiUpdate();
					}
				});
				button.addEventListener('mouseleave', evt => {
					const related = evt.relatedTarget as HTMLElement | null;
					if(related && (related.classList?.contains('venus-collapse-toggle') || related.closest('.venus-collapse-overlay'))) {
						return;
					}
					if(this.editorSettings.collapseButtonVisibility !== OutlineCollapseButtonVisibility.Always) {
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
			if(iconElement) {
				this.updateCollapseIcon(iconElement, block.isCollapsed);
			}

			const visibleTop = blockTop - rootElement.scrollTop;
			const verticalCenter = rootOffsetWithinContainer + visibleTop + (blockHeight / 2);
			button.style.top = `${verticalCenter}px`;
			button.style.left = `${horizontalPosition}px`;
			button.style.transform = 'translateY(-50%)';

			const cursorWithinBlock = nearestSelectionCollapse?.id === block.id && selectionBlock != null;
			const pointerWithinBlock = this.hoveredCollapseId === block.id;
			const shouldShow = this.editorSettings.collapseButtonVisibility === OutlineCollapseButtonVisibility.Always ||
				block.isCollapsed ||
				cursorWithinBlock ||
				pointerWithinBlock;
			let opacityValue = '0';
			if(shouldShow) {
				opacityValue = cursorWithinBlock ? '1' : '0.3';
			}
			button.style.opacity = opacityValue;
			button.style.transition = 'opacity 120ms ease-out';
			button.style.pointerEvents = shouldShow ? 'auto' : 'none';
			existingButtons.delete(block.id);
			renderedButtons++;
		}

		for(const leftover of existingButtons.values()) {
			leftover.remove();
		}

		if(renderedButtons === 0) {
			overlay.style.display = 'none';
		}

		VenusEditor.setClassPresence(rootElement, 'venus-outline-collapsible', this.hasAnyCollapsibleBlocks);
	}

	private updateCollapseIcon(icon: HTMLElement, isCollapsed: boolean): void {
		icon.className = 'fa fa-caret-right fa-lg';
		if(!icon.style.display) {
			icon.style.display = 'inline-block';
		}
		if(!icon.style.transition) {
			icon.style.transition = 'transform 160ms ease';
		}
		icon.style.transform = isCollapsed ? 'rotate(0deg)' : 'rotate(90deg)';
	}

	private handleEditorPointerMove(event: MouseEvent, quill: any): void {
		if(this.editorSettings.collapseButtonVisibility === OutlineCollapseButtonVisibility.Minimally ||
			this.editorSettings.collapseButtonVisibility === OutlineCollapseButtonVisibility.Never) {
			return;
		}
		const target = event.target as HTMLElement | null;
		if(target && target.classList.contains('venus-collapse-toggle') && target.dataset.blockId) {
			if(this.hoveredCollapseId !== target.dataset.blockId) {
				this.hoveredCollapseId = target.dataset.blockId;
				this.scheduleCollapseUiUpdate();
			}
			return;
		}
		const root = quill?.root as HTMLElement | null;
		if(!root) {
			return;
		}
		const rootRect = root.getBoundingClientRect();
		const relativeX = event.clientX - rootRect.left + root.scrollLeft;
		const relativeY = event.clientY - rootRect.top + root.scrollTop;
		const editor = this.notesEditor();
		if(!editor) {
			return;
		}
		const index = QuillExtensions.getClosestIndex(quill, relativeX, relativeY);
		const hoverBlock = this.getNearestCollapsibleBlockForIndex(index);
		const nextHoverId: string | null = hoverBlock ? hoverBlock.id : null;
		if(this.hoveredCollapseId !== nextHoverId) {
			this.hoveredCollapseId = nextHoverId;
			this.scheduleCollapseUiUpdate();
		}
	}

	private handleEditorPointerLeave(event?: MouseEvent): void {
		if(event && event.relatedTarget instanceof HTMLElement) {
			if(event.relatedTarget.classList.contains('venus-collapse-toggle') || event.relatedTarget.closest('.venus-collapse-overlay')) {
				return;
			}
		}
		if(this.hoveredCollapseId !== null) {
			this.hoveredCollapseId = null;
			this.scheduleCollapseUiUpdate();
		}
	}

	private getOffsetTopRelativeTo(node: HTMLElement, ancestor: HTMLElement): number {
		let top = 0;
		let current: HTMLElement | null = node;
		while(current && current !== ancestor) {
			top += current.offsetTop || 0;
			current = current.offsetParent as HTMLElement | null;
		}
		if(current === ancestor) {
			return top;
		}
		// Fallback using getBoundingClientRect. Compensate for CSS scale transforms
		// on ancestors so the result is in local CSS-space coordinates.
		const scaleY = ancestor.offsetHeight > 0
			? ancestor.getBoundingClientRect().height / ancestor.offsetHeight
			: 1;
		const nodeRect = node.getBoundingClientRect();
		const ancestorRect = ancestor.getBoundingClientRect();
		return (nodeRect.top - ancestorRect.top) / scaleY + (ancestor.scrollTop || 0);
	}

	private toggleCollapseById(blockId: string, animate: boolean): void {
		if(this.editorSettings.collapseButtonVisibility === OutlineCollapseButtonVisibility.Never) {
			return;
		}
		const range = this.getSelectionWithFallback();
		const entry = this.collapseState.get(blockId);
		const isCollapsed = entry?.isCollapsed ?? false;
		this.setCollapseState(blockId, !isCollapsed);
		this.collapseAnimationMode = animate ? 'single' : 'multi';
		this.applyCollapseState(animate);
		this.scheduleCollapseUiUpdate();
		this.updateOutlineCommandStates(range ?? null);
	}

	private setCollapseState(blockId: string, collapsed: boolean): void {
		if(collapsed) {
			this.collapseState.set(blockId, { isCollapsed: true });
			this.lastCollapseOperationTime = Date.now();
		} else {
			if(this.collapseState.has(blockId)) {
				this.collapseState.delete(blockId);
			}
		}
	}

	private getOutlineBlockForIndex(index: number): OutlineBlock | null {
		const editor = this.notesEditor();
		if(!editor) {
			return null;
		}

		const [line] = editor.getLine(index);
		if(!line || !line.domNode) {
			return null;
		}

		const domNode = line.domNode as HTMLElement;
		const lineId = domNode.dataset?.venusLineId ?? this.ensureLineId(domNode);
		return lineId ? this.outlineBlockById.get(lineId) ?? null : null;
	}

	private getCollapsedBlockAtIndex(index: number): OutlineBlock | null {
		const block = this.getOutlineBlockForIndex(index);
		if(!block || !block.isCollapsible) {
			return null;
		}
		const isCollapsed = this.collapseState.get(block.id)?.isCollapsed ?? block.isCollapsed;
		return isCollapsed ? block : null;
	}

	private getNearestCollapsibleBlockForIndex(index: number): OutlineBlock | null {
		const block = this.getOutlineBlockForIndex(index);
		return this.getNearestCollapsibleAncestor(block);
	}

	private ensureBlockReadyForOutdent(block: OutlineBlock): number | null {
		if(!block.parentId) {
			return null;
		}
		const editor = this.notesEditor();
		if(!editor) {
			return null;
		}
		const nextSibling = this.getNextSiblingBlock(block);
		if(!nextSibling) {
			return null;
		}
		const parent = this.getBlockById(block.parentId);
		if(!parent) {
			return null;
		}
		const blockSpan = this.getBlockSpanIncludingDescendants(block);
		const parentSpan = this.getBlockSpanIncludingDescendants(parent);
		const length = blockSpan.end - blockSpan.start;
		if(length <= 0) {
			return null;
		}
		const targetIndex = parentSpan.end;
		return this.moveDocumentSpan(blockSpan.start, length, targetIndex);
	}

	private moveDocumentSpan(start: number, length: number, targetIndex: number): number | null {
		const editor = this.notesEditor();
		if(!editor || length <= 0) {
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

	private getBlockSpanIncludingDescendants(block: OutlineBlock): { start: number; end: number } {
		const startSpan = this.getDocumentSpanForBlock(block);
		let lastBlock = block;
		if(block.outlineEndPosition > block.outlinePosition) {
			const candidate = this.outlineBlocks[block.outlineEndPosition];
			if(candidate) {
				lastBlock = candidate;
			}
		}
		const endSpan = this.getDocumentSpanForBlock(lastBlock);
		return { start: startSpan.start, end: endSpan.end };
	}

	private getListBlockSpanAtIndex(index: number): { block: OutlineBlock; start: number; end: number } | null {
		const editor = this.notesEditor();
		const docLength = editor ? editor.getLength() : 0;
		if(editor && docLength > 0) {
			if(index < 0) {
				index = 0;
			} else if(index >= docLength) {
				index = docLength - 1;
			}
		}

		const tryIndex = (lookupIndex: number): { block: OutlineBlock; start: number; end: number } | null => {
			if(editor && docLength > 0 && (lookupIndex < 0 || lookupIndex >= docLength)) {
				return null;
			}
			let block = this.getOutlineBlockForIndex(lookupIndex);
			const visited = new Set<string>();
			while(block) {
				if(block.type === 'list') {
					const span = this.getBlockSpanIncludingDescendants(block);
					if(span.start <= lookupIndex && lookupIndex < span.end) {
						return { block, start: span.start, end: span.end };
					}
					break;
				}
				if(!block.parentId || visited.has(block.parentId)) {
					break;
				}
				visited.add(block.parentId);
				block = this.getBlockById(block.parentId);
			}
			return null;
		};

		const primary = tryIndex(index);
		if(primary) {
			return primary;
		}
			return tryIndex(index + 1);
	}

	private updateSelectionAfterStructuralChange(index: number, length: number): void {
		const editor = this.notesEditor();
		if(!editor) {
			return;
		}
		editor.setSelection(index, length, 'silent');
		if(this.activeEditor === 'cell') {
			this.savedCellSelection.cellSelection = { index, length };
		} else {
			this.savedPrimarySelection = { index, length };
		}
	}

	private getNearestCollapsibleAncestor(block: OutlineBlock | null): OutlineBlock | null {
		let current = block;
		const visited = new Set<string>();
		while(current && !current.isCollapsible) {
			if(!current.parentId || visited.has(current.parentId)) {
				return null;
			}
			visited.add(current.parentId);
			current = this.getBlockById(current.parentId);
		}
		return current ?? null;
	}

	private getBlockById(id: string | null): OutlineBlock | null {
		if(!id) {
			return null;
		}
		return this.outlineBlockById.get(id) ?? null;
	}

	private isBlockAncestor(ancestor: OutlineBlock, descendant: OutlineBlock | null): boolean {
		let current = descendant;
		const visited = new Set<string>();
		while(current) {
			if(current.id === ancestor.id) {
				return true;
			}
			if(!current.parentId || visited.has(current.parentId)) {
				break;
			}
			visited.add(current.parentId);
			current = this.getBlockById(current.parentId);
		}
		return false;
	}

	private doesBlockOverlapSelection(block: OutlineBlock, startBlock: OutlineBlock | null, endBlock: OutlineBlock | null): boolean {
		if(!startBlock) {
			return false;
		}
		const effectiveEndBlock = endBlock ?? startBlock;
		if(this.isBlockAncestor(block, startBlock) || this.isBlockAncestor(block, effectiveEndBlock)) {
			return true;
		}
		const startPos = Math.min(startBlock.outlinePosition, effectiveEndBlock.outlinePosition);
		const endPos = Math.max(startBlock.outlinePosition, effectiveEndBlock.outlinePosition);
		return block.outlinePosition <= endPos && block.outlineEndPosition >= startPos;
	}

	private getDocumentIndexForBlock(block: OutlineBlock): number {
		const editor = this.notesEditor();
		if(!editor) {
			return 0;
		}
		const blot = Quill.find?.(block.domNode);
		if(blot && typeof editor.getIndex === 'function') {
			return editor.getIndex(blot);
		}
		throw new Error('Unable to find document index for outline block.');
	}

	private getDocumentSpanForBlock(block: OutlineBlock): { start: number; end: number } {
		const editor = this.notesEditor();
		if(!editor) {
			return { start: 0, end: 0 };
		}
		const start = this.getDocumentIndexForBlock(block);
		const lastBlock = this.outlineBlocks[block.outlineEndPosition] ?? block;
		let endStart = start;
		try {
			endStart = this.getDocumentIndexForBlock(lastBlock);
		} catch {
			endStart = start;
		}
		let end = endStart;
		const endLineInfo = editor.getLine(endStart);
		const endLine = endLineInfo ? endLineInfo[0] : null;
		if(endLine) {
			end = endStart + endLine.length();
		}
		return { start, end };
	}


	private getListBlocksInRange(range: { index: number; length: number }): OutlineBlock[] {
		const editor = this.notesEditor();
		if(!editor) {
			return [];
		}

		const selectionEnd = range.index + Math.max(1, range.length || 1);
		const selected: OutlineBlock[] = [];
		const seen = new Set<string>();
		let cursor = range.index;
		const maxIterations = 10000;
		let iterations = 0;

		while(cursor < selectionEnd && iterations++ < maxIterations) {
			const spanInfo = this.getListBlockSpanAtIndex(cursor);
			if(spanInfo && !seen.has(spanInfo.block.id)) {
				selected.push(spanInfo.block);
				seen.add(spanInfo.block.id);
				cursor = Math.max(spanInfo.end, cursor + 1);
				if(range.length === 0) {
					break;
				}
				continue;
			}

			const lineInfo = editor.getLine(cursor);
			if(!lineInfo) {
				break;
			}
			const line = lineInfo[0];
			const offset = typeof lineInfo[1] === 'number' ? lineInfo[1] : 0;
			const lineStart = cursor - offset;
			const lineLength = typeof line.length === 'function' ? line.length() : 1;
			cursor = lineStart + Math.max(1, lineLength);
			if(range.length === 0) {
				break;
			}
		}

		return selected;
	}

private getListSelectionInfo(range: { index: number; length: number }): { blocks: OutlineBlock[]; start: number; end: number } | null {
	const blocks = this.getListBlocksInRange(range);
	if(blocks.length === 0) {
		return null;
	}
	let start = Infinity;
	let end = -Infinity;
	for(const block of blocks) {
		const span = this.getBlockSpanIncludingDescendants(block);
		if(span.start < start) {
			start = span.start;
		}
		if(span.end > end) {
			end = span.end;
		}
	}
	return { blocks, start, end };
}

	private getPreviousSiblingBlock(block: OutlineBlock): OutlineBlock | null {
		let pos = block.outlinePosition - 1;
		while(pos >= 0) {
			const candidate = this.outlineBlocks[pos];
			if(!candidate) {
				break;
			}
			if(candidate.level < block.level) {
				break;
			}
			if(candidate.level === block.level && candidate.parentId === block.parentId) {
				return candidate;
			}
			pos--;
		}
		return null;
	}

	private getNextSiblingBlock(block: OutlineBlock): OutlineBlock | null {
		let pos = block.outlineEndPosition + 1;
		while(pos < this.outlineBlocks.length) {
			const candidate = this.outlineBlocks[pos];
			if(!candidate) {
				break;
			}
			if(candidate.level < block.level) {
				break;
			}
			if(candidate.level === block.level && candidate.parentId === block.parentId) {
				return candidate;
			}
			pos++;
		}
		return null;
	}

	private reapplyCollapseStateAfterMove(originalBlockId: string | null, targetIndex: number): void {
		if(!originalBlockId) {
			return;
		}
		const editor = this.notesEditor();
		if(!editor) {
			return;
		}
		this.refreshOutline(editor);
		const targetBlock = this.getOutlineBlockForIndex(targetIndex);
		if(!targetBlock || !targetBlock.isCollapsible) {
			return;
		}
		if(targetBlock.id !== originalBlockId) {
			if(this.collapseState.has(originalBlockId)) {
				this.collapseState.delete(originalBlockId);
			}
		}
		this.setCollapseState(targetBlock.id, true);
		this.applyCollapseState(true);
		this.scheduleCollapseUiUpdate();
	}

	private isIndexHidden(index: number): boolean {
		const block = this.getOutlineBlockForIndex(index);
		if(!block) {
			return false;
		}

		let ancestor = block.parentId ? this.outlineBlockById.get(block.parentId) ?? null : null;
		const visited = new Set<string>();
		while(ancestor) {
			if(visited.has(ancestor.id)) {
				break;
			}
			visited.add(ancestor.id);
			const isCollapsed = ancestor.isCollapsible && (this.collapseState.get(ancestor.id)?.isCollapsed ?? ancestor.isCollapsed);
			if(isCollapsed) {
				return true;
			}
			ancestor = ancestor.parentId ? this.outlineBlockById.get(ancestor.parentId) ?? null : null;
		}
		return false;
	}

	private getCollapsedAncestor(index: number): OutlineBlock | null {
		const block = this.getOutlineBlockForIndex(index);
		if(!block) {
			return null;
		}

		let ancestor = block.parentId ? this.outlineBlockById.get(block.parentId) ?? null : null;
		const visited = new Set<string>();
		while(ancestor) {
			if(visited.has(ancestor.id)) {
				break;
			}
			visited.add(ancestor.id);
			const isCollapsed = ancestor.isCollapsible && (this.collapseState.get(ancestor.id)?.isCollapsed ?? ancestor.isCollapsed);
			if(isCollapsed) {
				return ancestor;
			}
			ancestor = ancestor.parentId ? this.outlineBlockById.get(ancestor.parentId) ?? null : null;
		}
		return null;
	}

	private findNearestVisibleIndex(index: number): number {
		const editor = this.notesEditor();
		if(!editor) {
			return 0;
		}
		const maxIndex = Math.max(0, editor.getLength() - 1);
		let forward = index;
		let backward = index;
		while(forward <= maxIndex || backward >= 0) {
			if(forward <= maxIndex && !this.isIndexHidden(forward)) {
				return forward;
			}
			if(backward >= 0 && !this.isIndexHidden(backward)) {
				return backward;
			}
			if(backward >= 0) {
				const block = this.getOutlineBlockForIndex(backward);
				if(block) {
					const collapsedBlock = this.getNearestCollapsibleAncestor(block);
					if(collapsedBlock && (this.collapseState.get(collapsedBlock.id)?.isCollapsed ?? collapsedBlock.isCollapsed)) {
						return this.getDocumentIndexForBlock(collapsedBlock);
					}
				}
			}
			forward++;
			backward--;
		}
		return 0;
	}

	private updateCollapseForSelection(): void {
		const editor = this.notesEditor();
		if(!editor) {
			return;
		}
		const hasFocus = typeof editor.hasFocus === 'function' ? editor.hasFocus() : document.activeElement === editor.root;
		if(!hasFocus) {
			return;
		}
		const range = this.getSelectionWithFallback();
		if(!range) {
			return;
		}
		if(range.length > 0 && !this.isIndexHidden(range.index) && !this.isIndexHidden(range.index + range.length - 1)) {
			return;
		}
		if(!this.isIndexHidden(range.index)) {
			return;
		}
		// Check if a collapse operation happened recently (within 200ms)
		const timeSinceLastCollapse = Date.now() - this.lastCollapseOperationTime;
		const isRecentCollapseOperation = timeSinceLastCollapse < 200;

		// If the current line is hidden and it wasn't due to a recent collapse, unfold the collapsed ancestor
		if(!isRecentCollapseOperation) {
			const collapsedAncestor = this.getCollapsedAncestor(range.index);
			if(collapsedAncestor) {
				this.setCollapseState(collapsedAncestor.id, false);
				this.applyCollapseState(true);
				this.scheduleCollapseUiUpdate();
				return;
			}
		}

		// Otherwise, move to the nearest visible index
		const newIndex = this.findNearestVisibleIndex(range.index);
		editor.setSelection(newIndex, 0, 'silent');
	}

	private showLinkTooltip(text: string, url: string, bounds: any, quillContext?: any) {
		const quillInstance = quillContext ?? this.notesEditor();
		if(!quillInstance) return;
		const range = this.getSelectionWithFallback();
		if(!range || range.length > 0) return;

		let formatRange = this.getFormatRangeForLinkOrMention(range.index);

		if(formatRange == null) {
			console.log('No link or mention formatting at the current cursor.');
			return;
		}

		safeInvoke(this.dotNetHelper, "WillShowLinkTooltip", [url, formatRange.index, formatRange.length, formatRange.type === 'mention']);

		const tooltipContainer = document.getElementById(this.linkTooltipContainerId) as HTMLDivElement | null;
		const linkElement = document.getElementById(this.linkTooltipId) as HTMLAnchorElement | null;

		if(!tooltipContainer || !linkElement) return;

		linkElement.textContent = this.middleTruncateText(text);

		// We don't want the default anchor behavior, so override it
		linkElement.href = "javascript:void(0)";
		linkElement.target = "";

		// Add a new click handler that calls back into .NET
		linkElement.onclick = (evt) => {
			evt.preventDefault();
			safeInvoke(this.dotNetHelper, "HandleLinkClick", [url]);
		};

		tooltipContainer.style.display = 'block';
		tooltipContainer.style.transform = '';

		this.enableSwipeToDismiss(tooltipContainer);
		this.positionTooltip(quillInstance, bounds, tooltipContainer);
	}

	private positionTooltip(quillInstance: any, bounds: any, tooltipContainer: HTMLDivElement) {
		const editorContainer: HTMLElement | undefined = quillInstance?.container ?? this.primaryNotesEditor?.container;
		if(!editorContainer) return;

		const editorRect = editorContainer.getBoundingClientRect();
		const tooltipWidth = tooltipContainer.offsetWidth;

		// CARET midpoint in the editor (X position) - in viewport coordinates
		const caretCenterX = editorRect.left + bounds.left + (bounds.width / 2);

		// Initial unclamped positions for the tooltip - in viewport coordinates
		const initialLeft = caretCenterX - (tooltipWidth / 2);
		const initialTop = (editorRect.top + bounds.bottom) + this.TOOLTIP_DISTANCE_FROM_SOURCE;

		// Get scale information
		const scaleContainer = tooltipContainer.closest('.attachments-and-note-section-scale-content') as HTMLElement | null;
		const scale = scaleContainer ? getScaleFactor(scaleContainer) : 1;

		// Convert viewport coordinates to scaled coordinates
		let relativeLeft: number;
		let relativeTop: number;
		let caretInScaledSpace: number;

		if(scaleContainer) {
			const containerRect = scaleContainer.getBoundingClientRect();
			relativeLeft = (initialLeft - containerRect.left) / scale;
			relativeTop = (initialTop - containerRect.top) / scale;
			caretInScaledSpace = (caretCenterX - containerRect.left) / scale;
		} else {
			relativeLeft = initialLeft;
			relativeTop = initialTop;
			caretInScaledSpace = caretCenterX;
		}

		// Clamp tooltip horizontally within the scaled container bounds
		const scaledContainerWidth = scaleContainer ? (scaleContainer.offsetWidth) : window.innerWidth;
		const minLeft = this.TOOLTIP_VIEWPORT_PADDING;
		const maxLeft = scaledContainerWidth - tooltipWidth - this.TOOLTIP_VIEWPORT_PADDING;

		if(relativeLeft < minLeft) {
			relativeLeft = minLeft;
		} else if(relativeLeft > maxLeft) {
			relativeLeft = maxLeft;
		}

		tooltipContainer.style.left = `${relativeLeft}px`;
		tooltipContainer.style.top = `${relativeTop}px`;

		// Calculate the arrow offset within the tooltip
		let arrowX = caretInScaledSpace - relativeLeft;
		const ARROW_MARGIN = 10;
		if(arrowX < ARROW_MARGIN) {
			arrowX = ARROW_MARGIN;
		} else if(arrowX > tooltipWidth - ARROW_MARGIN) {
			arrowX = tooltipWidth - ARROW_MARGIN;
		}

		tooltipContainer.style.setProperty('--arrow-left', `${arrowX}px`);

		const tooltipRect = tooltipContainer.getBoundingClientRect();
		const outOfBounds = tooltipRect.top < (editorRect.top + 20);

		if(outOfBounds) {
			this.hideLinkTooltip();
		} else {
			tooltipContainer.style.opacity = '1';
			tooltipContainer.childNodes.forEach((child) => {
				if(child instanceof HTMLElement) {
					child.style.pointerEvents = 'auto';
				}
			});
		}
	}

	private enableSwipeToDismiss(tooltip: HTMLDivElement) {
		// showLinkTooltip runs on every show, but the tooltip element is persistent — only wire
		// the swipe handlers once, otherwise duplicate listeners with stale closure state pile up.
		if(tooltip.dataset.swipeToDismissEnabled === 'true') {
			return;
		}
		tooltip.dataset.swipeToDismissEnabled = 'true';

		// Thresholds
		const DRAG_THRESHOLD = 5;              // px before we treat pointer as a drag
		const SWIPE_DISMISS_THRESHOLD = 60;    // distance required to dismiss
		const LOCK_DIRECTION_DISTANCE = 10;    // distance to lock axis
		const FADE_START_THRESHOLD = 20;       // distance before fade-out begins

		// State
		let pointerDown = false;
		let swiping = false;            // Did we actually start the swipe?
		let lockedAxis: 'horizontal' | 'vertical' | null = null;

		let startX = 0, startY = 0;
		let currentX = 0, currentY = 0;
		let pointerId: number | null = null;

		// We'll track the original inline transition so we can restore it if needed
		const originalTransition = tooltip.style.transition;

		// “Magnetic” or “resistance” function
		function getMagneticDistance(d: number, threshold: number): number {
			if(d >= threshold) return d;
			const ratio = d / threshold;
			const curved = 1 - Math.pow(1 - ratio, 0.3);
			return threshold * curved;
		}

		// ─────────────────────────────────────────
		// 1) Pointer Down
		// ─────────────────────────────────────────
		const onPointerDown = (e: PointerEvent) => {
			if((e.target as HTMLElement).id.startsWith('backgroundOverlay_')) {
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

			// We do NOT call setPointerCapture() yet.
			// We do NOT call preventDefault().
			// Because we want to allow a potential click if they don't move much.
		};

		// ─────────────────────────────────────────
		// 2) Pointer Move
		// ─────────────────────────────────────────
		const onPointerMove = (e: PointerEvent) => {
			// Only handle the same pointer that started the interaction
			if(!pointerDown || e.pointerId !== pointerId) return;

			// A pointerup that lands outside the tooltip (e.g. it was hidden mid-press) never
			// reaches our listeners, leaving pointerDown stale. A move with no buttons pressed
			// is just a hover — treat it as the missed pointerup instead of a drag.
			if(e.buttons === 0) {
				onPointerUpOrCancel(e);
				return;
			}

			currentX = e.clientX;
			currentY = e.clientY;

			const dxRaw = currentX - startX;
			const dyRaw = currentY - startY;

			// If we're not yet swiping, check whether user has moved beyond DRAG_THRESHOLD:
			if(!swiping) {
				const movedDistance = Math.sqrt(dxRaw * dxRaw + dyRaw * dyRaw);
				if(movedDistance > DRAG_THRESHOLD) {
					// User is really dragging => begin “swipe” mode
					swiping = true;

					// Prevent a normal click
					e.preventDefault();

					// Capture pointer so we receive all further moves
					tooltip.setPointerCapture(e.pointerId);

					// Reset transitions so we can do fluid movement
					tooltip.style.transition = 'none';
				} else {
					// Not enough movement to treat as a drag => do nothing.
					// Let them keep “tapping”, possibly generating a click.
					return;
				}
			}

			// If we are swiping, do your existing swipe logic:
			const absDx = Math.abs(dxRaw);
			const absDy = Math.abs(dyRaw);

			// If we haven't locked the axis yet, see if user has moved enough:
			if(!lockedAxis) {
				if(absDx > absDy && absDx > LOCK_DIRECTION_DISTANCE) {
					lockedAxis = 'horizontal';
				} else if(absDy > absDx && absDy > LOCK_DIRECTION_DISTANCE) {
					lockedAxis = 'vertical';
				} else {
					// Not enough difference to lock axis yet
					return;
				}
			}

			// Now that we know which axis is locked, figure out how far along that axis:
			let distanceRaw = 0;
			let sign = 1;
			if(lockedAxis === 'horizontal') {
				distanceRaw = absDx;
				sign = dxRaw < 0 ? -1 : 1;
			} else {
				distanceRaw = absDy;
				sign = dyRaw < 0 ? -1 : 1;
			}

			// Magnetic / “resistance” beyond SWIPE_DISMISS_THRESHOLD
			const distanceMagnetic = getMagneticDistance(distanceRaw, SWIPE_DISMISS_THRESHOLD);

			// Move the tooltip
			let tx = 0, ty = 0;
			if(lockedAxis === 'horizontal') {
				tx = distanceMagnetic * sign;
			} else {
				ty = distanceMagnetic * sign;
			}

			// Fade out if we pass FADE_START_THRESHOLD
			let newOpacity = 1;
			if(distanceRaw > FADE_START_THRESHOLD) {
				const fadeRange = SWIPE_DISMISS_THRESHOLD - FADE_START_THRESHOLD;
				const fadeDistance = Math.min(distanceRaw - FADE_START_THRESHOLD, fadeRange);
				const ratio = fadeDistance / fadeRange;
				newOpacity = 1 - ratio;
			}

			tooltip.style.transform = `translate(${tx}px, ${ty}px)`;
			tooltip.style.opacity = String(newOpacity);

			// Since we're dragging, keep default from interfering
			e.preventDefault();
		};

		// ─────────────────────────────────────────
		// 3) Pointer Up or Cancel
		// ─────────────────────────────────────────
		const onPointerUpOrCancel = (e: PointerEvent) => {
			if(!pointerDown || e.pointerId !== pointerId) return;

			// Restore transitions
			tooltip.style.transition = originalTransition || 'transform 0.2s ease-out, opacity 0.2s ease-out';

			// If we were swiping, decide whether to dismiss or snap back
			if(swiping) {
				e.preventDefault(); // prevents click from firing

				// Check how far user ended up
				const dxRaw = currentX - startX;
				const dyRaw = currentY - startY;
				let distanceRaw = 0;
				if(lockedAxis === 'horizontal') {
					distanceRaw = Math.abs(dxRaw);
				} else if(lockedAxis === 'vertical') {
					distanceRaw = Math.abs(dyRaw);
				}

				if(distanceRaw >= SWIPE_DISMISS_THRESHOLD) {
					// If we swiped enough to dismiss
					tooltip.style.opacity = '0';
					tooltip.style.display = 'none';
				} else {
					// Snap back to original
					tooltip.style.transform = '';
					tooltip.style.opacity = '1';
				}
			}

			// Reset state
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

	// Enters the select-and-hold state on the given math blot. Paints the highlight class
	// directly from the flag instead of relying on Quill's native selection, so it works
	// reliably inside table cells where Chrome collapses programmatic ranges on embeds.
	// Also hides the native caret on the hosting editor so only the math highlight is visible.
	public enterMathHold(quill: any, mathBlot: any, mathIndex: number, entryDirection: 'left' | 'right' | null): void {
		const domNode = (mathBlot as any)?.domNode as HTMLElement | null;
		if(!domNode) return;
		if(this.heldMathInfo && this.heldMathInfo.mathDomNode !== domNode) {
			this.heldMathInfo.mathDomNode.classList.remove('ql-math-selected');
		}
		if(this.heldMathInfo && this.heldMathInfo.quill !== quill) {
			const prevRoot = this.heldMathInfo.quill.container?.querySelector('.ql-editor') as HTMLElement | null;
			prevRoot?.classList.remove('ql-math-holding');
		}
		this.heldMathInfo = { quill, mathIndex, mathDomNode: domNode, entryDirection };
		domNode.classList.add('ql-math-selected');
		const editorRoot = quill.container?.querySelector('.ql-editor') as HTMLElement | null;
		editorRoot?.classList.add('ql-math-holding');
	}

	public exitMathHold(): void {
		if(this.heldMathInfo) {
			this.heldMathInfo.mathDomNode.classList.remove('ql-math-selected');
			const editorRoot = this.heldMathInfo.quill.container?.querySelector('.ql-editor') as HTMLElement | null;
			editorRoot?.classList.remove('ql-math-holding');
			this.heldMathInfo = null;
		}
	}

	// Paints .ql-math-selected on every math blot whose index falls inside the current Quill
	// range. Browsers don't apply ::selection to contenteditable=false embeds, so a Shift+Arrow
	// or click-drag range across math would otherwise render as a gap in the selection. The
	// held blot (if any, for this quill) is kept painted regardless so the hold state survives
	// range-to-collapsed transitions.
	private syncMathRangeHighlight(quill: any): void {
		const editorRoot = quill?.root as HTMLElement | undefined;
		if(!editorRoot) return;
		const range = quill.getSelection ? quill.getSelection() : null;
		const hasRange = range != null && range.length > 0;
		const rangeStart = hasRange ? range.index : 0;
		const rangeEnd = hasRange ? range.index + range.length : 0;
		const heldNode = (this.heldMathInfo && this.heldMathInfo.quill === quill)
			? this.heldMathInfo.mathDomNode
			: null;

		const mathNodes = editorRoot.querySelectorAll('.ql-math');
		mathNodes.forEach((el: Element) => {
			const node = el as HTMLElement;
			// Skip math blots owned by a nested quill (e.g. cell math during a primary scan).
			if(node.closest('.ql-editor') !== editorRoot) return;
			if(node === heldNode) {
				VenusEditor.setClassPresence(node, 'ql-math-selected', true);
				return;
			}
			const blot = Quill.find(node) as any;
			if(!blot || blot.statics?.blotName !== MathExpressionBlot.blotName) return;
			const idx = quill.getIndex(blot);
			const inRange = hasRange && rangeStart <= idx && rangeEnd > idx;
			VenusEditor.setClassPresence(node, 'ql-math-selected', inRange);
		});
	}

	private hideLinkTooltip() {
		const tooltipContainer = document.getElementById(this.linkTooltipContainerId);
		if(tooltipContainer && tooltipContainer.style.opacity !== '0') {
			tooltipContainer.style.opacity = '0';
			tooltipContainer.childNodes.forEach((child) => {
				if(child instanceof HTMLElement) {
					child.style.pointerEvents = 'none';
				}
			});
			this.safeSetTimeout(() => {
				if(tooltipContainer) {
					tooltipContainer.style.display = 'none';
				}
			}, 200);
			safeInvoke(this.dotNetHelper, "OnLinkTooltipHidden");
		}

		this.activeInlineTooltip = null;
	}

	// If the cursor is on a line whose only content is a math blot, insert a
	// space (after) or newline (before) so the browser has a text node to render the caret in.
	// When side is 'before', a newline is inserted above (like exitMathUp).
	// When side is 'after' (default), a space is inserted after the math.
	// Returns the index the cursor should land at.
	private ensureMathLineCursorLandingSpot(editor: any, targetIndex: number, side: 'before' | 'after' = 'after'): number {
		const [line] = editor.getLine(targetIndex);
		if(!line) return targetIndex;
		const onlyMath = line.children?.head === line.children?.tail
			&& line.children?.head?.statics?.blotName === MathExpressionBlot.blotName;
		if(!onlyMath) return targetIndex;

		const mathIndex = editor.getIndex(line.children.head);
		this.skipMathAdjacentSelect = true;
		if(side === 'before') {
			editor.insertText(mathIndex, '\n', 'silent');
			this.skipMathAdjacentSelect = true;
			return mathIndex;  // cursor lands on the new empty line above the math
		} else {
			const afterMath = mathIndex + 1;
			editor.insertText(afterMath, ' ', 'silent');
			this.skipMathAdjacentSelect = true;
			return afterMath + 1;  // cursor lands after the space
		}
	}

	private clampTextScalePercentage(percent: number): number {
		if(!Number.isFinite(percent)) {
			return 100;
		}
		const rounded = Math.round(percent);
		return Math.min(this.maxTextScalePercent, Math.max(this.minTextScalePercent, rounded));
	}

	private applyTextScaleToEditor(editor: any | null, scale: number): void {
		// Scaling is managed outside the editor via the attachments wrapper.
	}

	/// Notifies .NET that the editor has focus, triggering FocusManager and toolbar activation.
	/// Called from table cell click handlers where stopPropagation prevents the document-level
	/// click listener from detecting the notes area click.
	public setPrimaryHistoryIgnoreChange(ignore: boolean): void {
		const history = this.primaryNotesEditor?.history;
		if(history) history.ignoreChange = ignore;
	}

	// Run `fn` with primary-editor history tracking disabled. Flushes pending
	// mutations before re-enabling so they can't bleed into the next undo entry.
	public withHistoryIgnored<T>(fn: () => T): T {
		this.setPrimaryHistoryIgnoreChange(true);
		try {
			return fn();
		} finally {
			this.flushPrimaryEditorMutations();
			this.setPrimaryHistoryIgnoreChange(false);
		}
	}

	/// Creates a clean undo boundary so the next change becomes its own undo entry
	/// instead of being merged with the previous one (due to the 500ms delay batching).
	public cutoffPrimaryHistory(): void {
		this.primaryNotesEditor?.history.cutoff();
	}

	/// Schedules processVisibleLines to run after structural table operations complete,
	/// since text-change events are suppressed during those operations.
	public scheduleProcessVisibleLines(): void {
		if(this.primaryNotesEditor) {
			this.safeSetTimeout(() => {
				QuillExtensions.processVisibleLines(this.primaryNotesEditor, this);
			}, 100);
		}
	}

	/// Forces the primary editor to process any pending DOM mutations immediately.
	/// Call this after direct DOM modifications while ignoreChange is still true,
	/// otherwise the async MutationObserver callback will process them after
	/// ignoreChange has been reset to false.
	public flushPrimaryEditorMutations(): void {
		this.primaryNotesEditor?.update();
	}

	// Clicks in the whitespace of the nearest ancestor marked with
	// `data-notes-editor-margin` (set by the host app) are redirected into the
	// editor at the click's Y, with X clamped into the editor's text area.
	private setupMarginClickHandler(): void {
		if(!this.editorOuterContainer) {
			return;
		}
		const container = this.editorOuterContainer.closest('[data-notes-editor-margin]') as HTMLElement | null;
		if(!container) {
			return;
		}
		this._marginClickContainer = container;
		this._marginClickHandler = (e: MouseEvent) => this.handleMarginClick(e);
		container.addEventListener('mousedown', this._marginClickHandler);
	}

	private handleMarginClick(event: MouseEvent): void {
		if(event.button !== 0) {
			return;
		}
		if(event.defaultPrevented) {
			return;
		}
		const target = event.target as HTMLElement | null;
		if(!target) {
			return;
		}
		// Let the browser handle clicks already in the editor or on any
		// interactive element — only redirect clicks on bare layout whitespace.
		// [draggable="true"] is critical: preventDefault() on mousedown is what
		// aborts the browser's drag initiation, so intercepting a press inside a
		// draggable (e.g. an attachment tile) would silently kill drag and drop.
		// [data-notes-editor-margin-exempt] lets the host app opt whole regions
		// out of margin forwarding (e.g. the attachments/events block).
		if(target.closest('[data-notes-editor-margin-exempt], [draggable="true"], .ql-editor, button, a, input, textarea, select, label, img, video, audio, iframe, [contenteditable="true"], [role="button"], [role="link"], [role="checkbox"], [role="menuitem"], [role="tab"], [role="option"]')) {
			return;
		}
		const quill = this.notesEditor();
		if(!quill) {
			return;
		}
		const editor = quill.root as HTMLElement;
		const rect = editor.getBoundingClientRect();
		if(rect.width === 0 || rect.height === 0) {
			return;
		}
		event.preventDefault();
		this.focusAtPoint(event.clientX, event.clientY);
	}

	private focusAtPoint(clickX: number, clickY: number): void {
		const quill = this.notesEditor();
		if(!quill) {
			return;
		}
		const editor = quill.root as HTMLElement;
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

		let range: Range | null = null;
		if(typeof document.caretRangeFromPoint === 'function') {
			range = document.caretRangeFromPoint(clampedX, clampedY);
		} else if((document as any).caretPositionFromPoint) {
			const pos = (document as any).caretPositionFromPoint(clampedX, clampedY);
			if(pos) {
				range = document.createRange();
				range.setStart(pos.offsetNode, pos.offset);
				range.collapse(true);
			}
		}

		editor.focus({ preventScroll: true });
		if(range && editor.contains(range.startContainer)) {
			const sel = window.getSelection();
			if(sel) {
				sel.removeAllRanges();
				sel.addRange(range);
			}
		} else {
			const len = quill.getLength();
			quill.setSelection(Math.max(0, len - 1), 0);
		}
	}

	private setupEditorContainerKeyboardHandler(): void {
		if(!this.editorOuterContainer) return;
		this.editorOuterContainer.setAttribute('tabindex', '-1');
		this.editorOuterContainer.style.outline = 'none';
		this.editorOuterContainer.addEventListener('keydown', (e: KeyboardEvent) => {
			// Don't handle if the keydown originated inside a contenteditable — Quill handles it.
			// We check `e.target` (stable through bubbling) rather than `document.activeElement`,
			// because handleUndo synchronously shifts focus to editorOuterContainer mid-bubble.
			// Using activeElement here used to fire the shortcut a SECOND time on Cmd+Z after
			// Quill's keyboard module already handled it.
			const target = e.target as Element | null;
			if(target?.closest?.('[contenteditable="true"]')) return;
			if(!this.primaryNotesEditor) return;

			const isCtrlOrCmd = e.ctrlKey || e.metaKey;
			if(!isCtrlOrCmd || e.altKey) return;

			if(e.key.toLowerCase() === 'z' && !e.shiftKey) {
				this.handleUndo();
				e.preventDefault();
			} else if((e.key.toLowerCase() === 'z' && e.shiftKey) || (e.key.toLowerCase() === 'y' && !e.shiftKey)) {
				this.handleRedo();
				e.preventDefault();
			}
		});
	}

	public focusEditorContainer(): void {
		this.editorOuterContainer?.focus({ preventScroll: true });
		// Only update the toolbar's editor focus flag — don't trigger
		// ChangeFocusAsync which cascades into re-processing all content.
		// FocusedArea is already ContentAreaNotes from the user's prior interaction.
		safeInvoke(this.dotNetHelper, 'UpdateEditorFocusState', [true]);
	}

	// Focus the actual contenteditable (cached cell quill if targetCellId is given
	// and still attached, else the currently active editor) and update the toolbar
	// focus flag. Use after dialogs, commands, or undo/redo close — focusEditorContainer
	// focuses the outer wrapper, which leaves the user unable to type.
	public restoreActiveEditorFocus(targetCellId?: string): void {
		if(targetCellId) {
			const cached = this.tableState.editorCache[targetCellId];
			if(cached?.quill && document.contains(cached.cellElement)) {
				cached.quill.focus();
				safeInvoke(this.dotNetHelper, 'UpdateEditorFocusState', [true]);
				return;
			}
		}
		const target = this.notesEditor();
		if(target?.focus) {
			target.focus();
		}
		safeInvoke(this.dotNetHelper, 'UpdateEditorFocusState', [true]);
	}

	public notifyEditorFocused(): void {
		safeInvoke(this.dotNetHelper, 'NotifyEditorFocused');
	}

	public notifyEditorBlur(): void {
		safeInvoke(this.dotNetHelper, 'NotifyEditorBlur');
	}

	debouncedUpdateTableControlsDisplayStateInternal: ((...args: Parameters<() => void>) => void) | null = null;

	public updateTableControlsDisplayState() {
		if(this.debouncedUpdateTableControlsDisplayStateInternal === null) {
			this.debouncedUpdateTableControlsDisplayStateInternal = debounce(
				this.updateTableControlsDisplayStateInternal.bind(this),
				50
			);
		}
		this.debouncedUpdateTableControlsDisplayStateInternal!();
	}
	
	private setBooleanFormatOnCells(format: string, value: boolean): void {
		if(!this.areCellsSelected()) {
			return;
		}
		
		const formats = { [format]: value };
		const table = this.lastActiveTable!;

		// Save the selection start and end cells before moving so we can restore the selection later
		const selectionStartCell = TableBlot.getSelectionStartCell(table);
		const selectionEndCell = TableBlot.getSelectionEndCell(table);

		const selectedCells = TableBlot.getSelectedCells(table);
		this.removeTableControlsFromTable(table);
		selectedCells.forEach((cell) => {
			if(cell.id === this.tableState.activeCellId) {
				const cellQuill = this.tableState.editorCache[cell.id]!.quill;
				cellQuill.formatText(0, cellQuill.getLength(), formats);
			} else {
				const newHtml = QuillExtensions.applyFormattingToHtml(cell.innerHTML, formats);
				cell.innerHTML = newHtml;
			}
		});
		TableBlot.setupTableControls(table);

		// Restore the selection to the same start and end cells
		TableBlot.setTableSelection(table, selectionStartCell, selectionEndCell);
	}

	private setFormatOnCells(formatType: string, formatValue: string | number | boolean, shouldRemoveFormat: boolean, shouldRemoveParagraphFormats: boolean): void {
		if(!this.areCellsSelected()) {
			return;
		}

		let formats : { [key: string]: string | number | boolean } | null = null;
		if(formatType === '') {
			formats = null;
		} else {
			if(shouldRemoveParagraphFormats) {
				formats = { [formatType]: formatValue, ['list']: false, ['code-block']: false };
			} else {
				formats = {[formatType]: formatValue};
			}
		}
		
		const table = this.lastActiveTable!;

		// Save the selection start and end cells before moving so we can restore the selection later
		const selectionStartCell = TableBlot.getSelectionStartCell(table);
		const selectionEndCell = TableBlot.getSelectionEndCell(table);

		const selectedCells = TableBlot.getSelectedCells(table);
		this.removeTableControlsFromTable(table);

		selectedCells.forEach((cell) => {
			if(cell.id === this.tableState.activeCellId) {
				const cellQuill = this.tableState.editorCache[cell.id]!.quill;

				// Handle removeFormat if needed
				if (shouldRemoveFormat) {
					cellQuill.removeFormat(0, cellQuill.getLength(), 'user');
					// There is a known issue with Quill where trailing newlines are added by removeFormat.
					const currentDelta = cellQuill.getContents();
					const cleanedDelta = QuillExtensions.removeTrailingNewlinesFromDelta(currentDelta);
					cellQuill.setContents(cleanedDelta, 'user');
				}

				if(formats !== null) {
					cellQuill.formatText(0, cellQuill.getLength(), formats);
				}
			} else {
				// For non-active cells, we need to handle removeFormat differently
				if (shouldRemoveFormat) {
					// Remove existing formatting before applying new format
					const noFormatHtml = QuillExtensions.removeFormat(cell.innerHTML);
					cell.innerHTML = noFormatHtml;
				}

				if(formats !== null) {
					const newHtml = QuillExtensions.applyFormattingToHtml(cell.innerHTML, formats);
					cell.innerHTML = newHtml;
				}
			}
		});

		TableBlot.setupTableControls(table);

		// Restore the selection to the same start and end cells
		TableBlot.setTableSelection(table, selectionStartCell, selectionEndCell);
	}
	
	private areCellsSelected(): boolean {
		if(!this.lastActiveTable) return false;

		const ts = TableBlot.getTableSelection(this.lastActiveTable);
		return ts.startRow !== -1 && ts.startCol !== -1;

	}

	private getActiveTable(): HTMLTableElement | null {
		// Use document.activeElement to determine if focus is inside a table cell.
		// This is more reliable than checking activeEditor state, which suffers from
		// race conditions between the cell editor and primary editor selection-change events.
		const active = document.activeElement;
		if(active && this.editorContainer?.contains(active)) {
			const cell = active.closest('td');
			if(cell) {
				const table = cell.closest('table') as HTMLTableElement | null;
				if(table && this.editorContainer.contains(table)) {
					return table;
				}
			}
		}
		return null;
	}
	
	private updateTableControlsDisplayStateInternal() {
		// Show/hide the table controls based on the selection

		// The primary editor's selection will be at the start or the end of the table if the selection is inside a table or if a cell editor is active
		const activeTable = this.getActiveTable();

		if(activeTable && !this.lastActiveTable) {
			this.lastActiveTable = activeTable;
			TableBlot.setupTableControls(activeTable);
		} else if(!activeTable && this.lastActiveTable) {
			// Don't clear controls if there's an active multi-cell selection (e.g. mid-drag)
			// or if an undo/redo is in progress
			if(this.tableState.lastTableWithSelection || this.preserveTableControls) {
				return;
			}
			const oldTable = this.lastActiveTable;
			this.lastActiveTable = null;
			this.removeTableControlsFromTable(oldTable);
		} else if(activeTable && activeTable !== this.lastActiveTable) {
			const oldTable = this.lastActiveTable;
			this.lastActiveTable = activeTable;
			this.removeTableControlsFromTable(oldTable!);
			TableBlot.setupTableControls(activeTable);
		}
	}

	/**
	 * Quill re-applies the native selection after any DOM mutation inside the editor
	 * (Selection's SCROLL_BEFORE_UPDATE/SCROLL_UPDATE handlers), and its setNativeRange
	 * rebuilds the selection via removeAllRanges()/addRange(). A DOM Range carries no
	 * direction, so a backward selection (Shift+Up extending toward the document start)
	 * is silently flipped forward and the next Shift+Up collapses it instead of extending.
	 * Quill's own "range unchanged" guard misses selections with a boundary on an empty
	 * line: it compares the normalized boundary (the <br> inside <p><br></p>) against the
	 * raw selection container (the <p>), so those selections get re-applied on every
	 * mutation — and our selection-change UI (collapse controls, caret animation) mutates
	 * editor attributes constantly. Skip the re-application whenever the requested range
	 * is geometrically identical to the current selection so the direction survives.
	 */
	private preserveBackwardSelectionOnRestore(quill: any): void {
		const selection = quill.selection;
		const originalSetNativeRange = selection.setNativeRange;
		selection.setNativeRange = function(startNode: any, startOffset?: number, endNode: any = startNode, endOffset: number | undefined = startOffset, force: boolean = false) {
			if(!force && startNode != null && endNode != null && selection.hasFocus()) {
				try {
					// Mirror setNativeRange's <br> conversion so blank-line boundaries are
					// compared in the same representation the browser stores for them.
					if(startNode instanceof Element && startNode.tagName === 'BR' && startNode.parentNode) {
						startOffset = Array.from(startNode.parentNode.childNodes).indexOf(startNode);
						startNode = startNode.parentNode;
					}
					if(endNode instanceof Element && endNode.tagName === 'BR' && endNode.parentNode) {
						endOffset = Array.from(endNode.parentNode.childNodes).indexOf(endNode);
						endNode = endNode.parentNode;
					}
					const native = document.getSelection();
					if(native && native.rangeCount > 0) {
						const current = native.getRangeAt(0);
						const requested = document.createRange();
						requested.setStart(startNode, startOffset ?? 0);
						requested.setEnd(endNode, endOffset ?? 0);
						if(requested.compareBoundaryPoints(Range.START_TO_START, current) === 0
							&& requested.compareBoundaryPoints(Range.END_TO_END, current) === 0) {
							return;
						}
					}
				} catch {
					// Comparison failed (detached node, bad offset) — defer to Quill.
				}
			}
			return originalSetNativeRange.call(this, startNode, startOffset, endNode, endOffset, force);
		};
	}

	/**
	 * Registers a single editor-change event handler:
	 * - Fires whenever text changes (text-change)
	 * - Fires whenever selection changes (selection-change)
	 */
	private registerEditorChangeHandler(quill: any, isCellEditor: boolean): void {
		quill.on('editor-change', (eventName: string, ...args: any[]) => {
			if(this.editorSettings.readOnly) {
				return;
			}
			if(eventName === 'text-change') {
				const [delta, oldDelta, source] = args;
				if(source !== 'silent') {
					this.updateToolbarState();
					this.isDirty = true;

					// Quill toggles its built-in `ql-blank` class automatically on text-change,
					// so we no longer need to manually maintain a custom empty-class for the placeholder.
					if(!isCellEditor) {
						// Schedule word/character count update for primary editor
						this.scheduleCountUpdate();
						// Schedule auto-save after user stops typing
						this.scheduleAutoSave();
					}

					// Refresh search if Find & Replace is active
					if(this.searchState.findText && this.searchState.matches.length > 0) {
						this.refreshSearchAfterEdit();
					}
				}
			} else if(eventName === 'selection-change') {

				let range = quill.getSelection();
				
				this.updateTableControlsDisplayState();

				// On iOS, if the cursor has jumped to the end of the document due to tapping on the first word in a list item, fix it
				if(this.editorSettings.clientOs == ClientOs.iOS && !quill.composition?.isComposing && range && range.length === 0 && this.lastPointedTime && this.lastPointerDownIndex) {
					const timeDiff = Date.now() - this.lastPointedTime;

					// "Landed on the last line" — covers both the exact-last-index variant and
					// the "start of empty trailing line" variant of the jump.
					const [lastLine] = quill.getLine(quill.getLength() - 1);
					const [currentLine] = quill.getLine(range.index);
					const [tappedLine] = quill.getLine(this.lastPointerDownIndex);
					const landedOnLastLine = lastLine && currentLine && currentLine === lastLine;
					const tappedOnLastLine = lastLine && tappedLine && tappedLine === lastLine;

					if(landedOnLastLine && !tappedOnLastLine && timeDiff < 400) {
						const lastLineLength = lastLine.length();
						if(range.index - this.lastPointerDownIndex > Math.max(10, lastLineLength)) {
							// Reset caret to where they actually tapped — silent so the
							// downstream selection-change handlers (toolbar, keyboard-aware
							// scroll) don't re-fire and re-scroll.
							const tappedIndex = this.lastPointerDownIndex;
							quill.setSelection(tappedIndex, 0, 'silent');
							range = {index: tappedIndex, length: 0};

							// Restore the editor scroll — WebKit auto-scrolled to the bottom
							// when it set the bad selection; setSelection alone doesn't undo it.
							if(this.lastPointerDownScrollTop != null) {
								const scrollContainer = this.contentAreaInner || document.getElementById('contentAreaInner') || quill.root;
								scrollContainer.scrollTop = this.lastPointerDownScrollTop;
							}

							// One normal selection-change so toolbar/collapse UI update against
							// the corrected caret. Keyboard-aware scroll is a no-op when the
							// line is already in view, so this won't undo the scroll restore.
							requestAnimationFrame(() => {
								quill.setSelection(tappedIndex, 0, 'user');
							});

							// Don't double-correct on subsequent unrelated selection-changes.
							this.lastPointedTime = null;
							this.lastPointerDownIndex = null;
							this.lastPointerDownScrollTop = null;
						}
					}
				}

				// If the cursor landed adjacent to a math blot (e.g. via native arrow-key nav in
				// a cell, or via programmatic cursor placement), enter the select-and-hold
				// state. We don't call setSelection(mathIndex, 1) here anymore because Chrome
				// collapses programmatic ranges spanning contenteditable=false embeds inside
				// <td>, which strips the highlight class. enterMathHold paints the class
				// directly from a JS flag so hold works uniformly in primary and in cells.
				if(this.skipMathAdjacentSelect) {
					this.skipMathAdjacentSelect = false;
				} else if(range && range.length === 0 && !this.editorSettings.readOnly) {
					let mathLeaf = null;
					let mathIndex = -1;

					// Check the leaf at cursor position
					const [leafAt] = quill.getLeaf(range.index);
					if(leafAt && leafAt.statics?.blotName === MathExpressionBlot.blotName) {
						mathLeaf = leafAt;
					}

					// Also check one position before (cursor may be just after the math blot)
					if(!mathLeaf && range.index > 0) {
						const [leafBefore] = quill.getLeaf(range.index - 1);
						if(leafBefore && leafBefore.statics?.blotName === MathExpressionBlot.blotName) {
							// Only select if the cursor is right at the blot's end boundary
							const beforeIndex = quill.getIndex(leafBefore);
							if(range.index === beforeIndex + 1) {
								mathLeaf = leafBefore;
							}
						}
					}

					if(mathLeaf) {
						mathIndex = quill.getIndex(mathLeaf);
						// Entry direction = which side of the blot the cursor landed on. Recent
						// pointerdown treats approach as ambiguous (null -> Escape releases left
						// per spec). Otherwise: at mathIndex = approached from left, at
						// mathIndex+1 = approached from right.
						const recentlyClicked = this.lastPointedTime != null
							&& Date.now() - this.lastPointedTime < 500;
						const entryDirection: 'left' | 'right' | null = recentlyClicked
							? null
							: (range.index === mathIndex ? 'left' : 'right');
						this.enterMathHold(quill, mathLeaf, mathIndex, entryDirection);
					}
				}


				if(this.imageControls) {
					this.imageControls.destroy();
					this.imageControls = null;
				}

				// if the selection is an image, show the image controls
				if(range && range.length == 1) {
					const blot = quill.getLeaf(range.index)[0];
					if(blot instanceof ResizableImage) {
						this.imageControls = new ImageControls(blot.domNode);
					}
				}

			this.updateToolbarState();
				this.syncMathRangeHighlight(quill);
				// Don't update activeEditor when a cell editor loses focus (range is null)
				// This would incorrectly set activeEditor to 'cell' after exiting the table
				if(!isCellEditor || range) {
					this.handleSelectionChanged(isCellEditor);
				}
				this.scheduleCollapseUiUpdate();

				// Keep the cursor above the keyboard when the user taps to move the
				// cursor or it moves via arrow keys. Throttled to once per animation frame so
				// that rapid cursor drags (e.g. the iOS spacebar cursor gesture) don't cause
				// the container to accelerate. No-op when keyboard isn't showing.
				// Skip when the user has a range selection (length > 0) — they may be
				// dragging a selection handle, and scrolling the anchor into view would
				// fight the browser's own auto-scroll for selection extension.
				if(!isCellEditor && range && range.length === 0) {
					this.scheduleScrollCursorAboveKeyboard(quill);
				}
			}
		});
	}

	/**
	 * Sets up the paste handler for the Quill editor.<br/>
	 * Provides and opportunity to perform logic before/after the paste occurs.<br/>
	 * This handler checks for pasted URLs and fetches their titles.
	 */
	private setupCopyAndPasteHandlers(quill: any, externalListeners: Array<{ element: HTMLElement | Window | Document, event: string, handler: Function }>): void {
		let isCtrlDown = false, isShiftDown = false, isMetaDown = false, isAltDown = false;

		// Detect macOS specifically (not iOS)
		const isMacOS = (() => {
			try {
				const ua = (navigator && navigator.userAgent) ? navigator.userAgent : '';
				const platform = (navigator && (navigator as any).platform) ? (navigator as any).platform : '';
				// iOS devices sometimes report as Mac; exclude iPhone/iPad/iPod
				const isAppleMobile = /iPhone|iPad|iPod/i.test(ua);
				return !isAppleMobile && (/Macintosh|Mac OS X|Mac/i.test(ua) || /Mac/i.test(platform));
			} catch { return false; }
		})();

		const keydownHandler = (e: KeyboardEvent) => {
			if(e.key === 'Control') isCtrlDown = true;
			if(e.key === 'Shift') isShiftDown = true;
			if(e.key === 'Meta') isMetaDown = true;   // Cmd on macOS
			if(e.key === 'Alt') isAltDown = true;
		};
		document.addEventListener('keydown', keydownHandler);
		externalListeners.push({element: document, event: 'keydown', handler: keydownHandler});

		const keyupHandler = (e: KeyboardEvent) => {
			if(e.key === 'Control') isCtrlDown = false;
			if(e.key === 'Shift') isShiftDown = false;
			if(e.key === 'Meta') isMetaDown = false;
			if(e.key === 'Alt') isAltDown = false;
		};
		document.addEventListener('keyup', keyupHandler);
		externalListeners.push({element: document, event: 'keyup', handler: keyupHandler});

		// Handle copy and cut events to reliably populate the system clipboard.
		// On macOS, explicitly route copy/cut to native clipboard via .NET to
		// ensure external apps receive proper NSPasteboard types.
		quill.root.addEventListener('copy', (ev: ClipboardEvent) => {
			// If this is the primary editor but a cell editor is active, don't handle the event
			// Let the cell editor's handler process it instead
			if(quill === this.primaryNotesEditor && this.isCellEditorActive()) {
				return;
			}

			// If this is a cell editor but it's not the currently active one, don't handle the event
			if(quill !== this.primaryNotesEditor && quill !== this.cellNotesEditor) {
				return;
			}

			// If a multi-cell table selection is active, copy the selected cells
			if(this.copyTableSelection(ev)) return;

			const selection = quill.getSelection(true);
			if(!selection || selection.length === 0) return;

			// Check if only an image is selected - if so, copy the image to clipboard
			const imageUrl = this.getSelectedImageUrl(quill, selection);
			if(imageUrl) {
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

			if(isMacOS) {
				// Build plain and HTML then forward to native clipboard via .NET
				try {
					const plain = quill.getText(selection.index, selection.length);
					let html = '';
					try {
						html = quill.getSemanticHTML(selection.index, selection.length);
						html = this.cleanHtmlForClipboard(html);
					} catch { }
					safeInvoke(this.dotNetHelper, 'SetClipboardFromEditor', [plain, html]);
					// Prevent default so WebKit doesn't overwrite the platform clipboard
					ev.preventDefault();
					ev.stopImmediatePropagation();
					ev.stopPropagation();
					return;
				} catch {
					// fall through to default behavior if something goes wrong
				}
			}

			if(ev.clipboardData) {
				// Add a custom marker to identify content copied from our editor
				ev.clipboardData.setData('application/x-quill-internal', 'true');

				// Set plain text and HTML so paste works in external apps
				const plain = quill.getText(selection.index, selection.length);
				let html = '';
				try {
					html = quill.getSemanticHTML(selection.index, selection.length);
					html = this.cleanHtmlForClipboard(html);
				} catch { /* fallback to plain text only */ }
				ev.clipboardData.setData('text/plain', plain);
				if(html) ev.clipboardData.setData('text/html', html);

				// Use our provided data
				ev.preventDefault();
			}
		}, true);

		quill.root.addEventListener('cut', (ev: ClipboardEvent) => {
			// If this is the primary editor but a cell editor is active, don't handle the event
			// Let the cell editor's handler process it instead
			if(quill === this.primaryNotesEditor && this.isCellEditorActive()) {
				return;
			}

			// If this is a cell editor but it's not the currently active one, don't handle the event
			if(quill !== this.primaryNotesEditor && quill !== this.cellNotesEditor) {
				return;
			}

			// If a multi-cell table selection is active, cut the selected cells
			if(this.cutTableSelection(ev)) return;

			if(isMacOS) {
				const selection = quill.getSelection(true);
				if(!selection || selection.length === 0) return;

				try {
					const plain = quill.getText(selection.index, selection.length);
					let html = '';
					try {
						html = quill.getSemanticHTML(selection.index, selection.length);
						html = this.cleanHtmlForClipboard(html);
					} catch { }
					safeInvoke(this.dotNetHelper, 'SetClipboardFromEditor', [plain, html]);
					// Perform the cut ourselves
					ev.preventDefault();
					ev.stopImmediatePropagation();
					ev.stopPropagation();
					quill.deleteText(selection.index, selection.length, 'user');
					return;
				} catch {
					// if something goes wrong, allow default to proceed
				}
			}

			// Try to use current selection
			let selection = quill.getSelection(true);
			// As a last resort, use DOM selection text to populate clipboard
			const domSel = document.getSelection?.();

			if(ev.clipboardData) {
				// Add a custom marker to identify content cut from our editor
				ev.clipboardData.setData('application/x-quill-internal', 'true');

				if(selection && selection.length > 0) {
					// Set plain text and HTML so paste works in external apps
					const plain = quill.getText(selection.index, selection.length);
					let html = '';
					try {
						html = quill.getSemanticHTML(selection.index, selection.length);
						html = this.cleanHtmlForClipboard(html);
					} catch { /* fallback to plain text only */ }
					ev.clipboardData.setData('text/plain', plain);
					if(html) ev.clipboardData.setData('text/html', html);

					// Use our provided data and perform the cut ourselves
					ev.preventDefault();
					quill.deleteText(selection.index, selection.length, 'user');
				} else if(domSel && domSel.toString()) {
					// Fallback: use DOM selection text to ensure clipboard isn't empty
					ev.clipboardData.setData('text/plain', domSel.toString());
					// Prevent default and delete using DOM to reflect in Quill via input events
					ev.preventDefault();
					document.execCommand('delete');
				}
			}
		}, true);

		/* -------  CAPTURE‑PHASE paste listener comes first  ------- */
		quill.root.addEventListener('paste', (ev: ClipboardEvent) => {
			if(this.editorSettings.readOnly) return;

			// On Dekutron, native file/image references are invisible to JS, so we must
			// check C# (async) before allowing the paste to proceed. We preventDefault
			// here to suppress the native paste while the async check runs. If C# finds
			// files or images it handles them directly; otherwise we re-trigger a native
			// paste via execCommand so the original handler below runs with full
			// functionality. The _retryingPaste flag prevents infinite recursion on re-entry.
			// On iOS/Android, do NOT round-trip through C# to inspect UIPasteboard.General — that
			// programmatic clipboard read trips iOS 16+'s "Paste from another app" privacy prompt
			// (a second bar appears with only "Paste"). Mobile clipboards rarely carry file URLs
			// anyway, so fall through to the standard event.clipboardData path below.
			const isMobile = this.editorSettings.clientOs == ClientOs.iOS
			              || this.editorSettings.clientOs == ClientOs.Android;
			// Skip the C# file/image round-trip when the user explicitly asked for raw paste
			// (Ctrl+Shift+V). Re-pasting via execCommand('paste') would always pull the full
			// clipboard (HTML + text), defeating Chromium's plain-only behavior for alternate
			// paste. Users asking for plain text don't expect file/image handling. Cmd+Shift+V
			// on macOS Dekutron is intercepted by the native Electron menu before reaching
			// here, so meta+shift isn't part of this check.
			if(this.editorSettings.isDeku && !isMobile && !this._retryingPaste && !(isCtrlDown && isShiftDown)) {
				ev.preventDefault();
				ev.stopImmediatePropagation();
				safeInvokeAsync(this.dotNetHelper, 'CheckAndHandleClipboardFiles').then((handled) => {
					if(!handled) {
						this._retryingPaste = true;
						this.notesEditor().focus();
						document.execCommand('paste');
						this._retryingPaste = false;
					}
				});
				return;
			}

			const data = ev.clipboardData;
			if(!data) return;

			// Check for internal table paste before any other handling
			const tablePasteText = data.getData('text/plain');
			if(this.pasteTableContent(tablePasteText)) {
				ev.preventDefault();
				ev.stopImmediatePropagation();
				return;
			}

			// Tables can't nest. If the clipboard carries a <table> and the user is editing
			// a cell, silently drop the paste so Quill's clipboard can't produce a nested
			// table embed. Plain-text and non-table HTML paste into cells is still fine.
			if(this.activeEditor === 'cell') {
				const htmlForTableCheck = data.getData('text/html') || '';
				if(/<table[\s>]/i.test(htmlForTableCheck)) {
					ev.preventDefault();
					ev.stopImmediatePropagation();
					return;
				}
			}

			const isInternalContent = !!data.getData('application/x-quill-internal');

			const originalText = data.getData('text/plain');
			const text = originalText.trim();
			const urlRegex = /^(https?:\/\/\S+)$/i;

			// `isAlternatePaste` = the user explicitly requested the "raw" paste action
			// (Ctrl/Cmd+Shift+V). We use this — NOT the resolved plain/formatted mode that
			// also accounts for `pasteWithoutFormattingAsDefault` — to gate the URL→title
			// auto-replacement. The default-plain setting is about content formatting (rich
			// → plain text); auto-replacement is a separate feature the user expects to keep
			// running on their normal Cmd+V even when default-plain is on. Only the explicit
			// "I want this raw, please don't transform it" action skips title fetch.
			const isAlternatePaste = (isCtrlDown || isMetaDown) && isShiftDown;
			const isPlainPasteRequested = isAlternatePaste
				? !this.editorSettings.pasteWithoutFormattingAsDefault
				: this.editorSettings.pasteWithoutFormattingAsDefault;

			const sel = quill.getSelection();
			const hasSelection = sel && sel.length > 0;

			// If cursor is inside a code block or inline code, always paste as plain text
			if(sel) {
				const formats = quill.getFormat(sel.index, sel.length || 1);
				if(formats['code'] || formats['code-block']) {
					ev.preventDefault();
					ev.stopImmediatePropagation();
					quill.deleteText(sel.index, sel.length, 'user');
					quill.insertText(sel.index, originalText, 'user');
					quill.setSelection(sel.index + originalText.length, 0, 'user');
					return;
				}
			}

			if(hasSelection && urlRegex.test(text)) {
				// User is pasting a lone URL **onto** selected text - make it a link
				ev.preventDefault();            // stop the browser + Quill paste
				ev.stopImmediatePropagation();  // Quill's handler never runs

				quill.formatText(sel!.index, sel!.length, 'link', text, 'user');
				return;                         // skip the rest
			}

			// Check for copied thoughts or plain text paste
			// This runs for both plain text only AND when HTML is present (e.g., Deku sets both)
			const html = data.getData('text/html');
			if(text && !isInternalContent) {
				ev.preventDefault();
				ev.stopImmediatePropagation();

				console.log('[PASTE DEBUG] Paste detected, text:', text, 'hasHtml:', !!html);

				// Check if pasting copied thoughts - convert to markdown links
				safeInvokeAsync<string>(this.dotNetHelper, 'GetThoughtMarkdownIfMatch', [text]).then((thoughtMarkdown) => {
					console.log('[PASTE DEBUG] GetThoughtMarkdownIfMatch returned:', thoughtMarkdown);

					if(thoughtMarkdown) {
						// Thought match found - insert as markdown link
						const textToConvert = thoughtMarkdown + '\n';
						this.insertMarkdownAsDelta(quill, textToConvert, originalText, text, sel, isAlternatePaste);
					} else if(html && !this.containsMarkdown(text)) {
						// No thought match but HTML present and text has no markdown - paste HTML using Quill's clipboard
						this.pasteHtmlContent(quill, html, sel);
					} else {
						// No thought match and no HTML, or HTML with markdown in text - convert plain text as markdown
						const textToConvert = text + '\n';
						this.insertMarkdownAsDelta(quill, textToConvert, originalText, text, sel, isAlternatePaste);
					}
				});

				return;
			}

			// Note: isAlternatePaste/isPlainPasteRequested are computed at the top of this handler.
			// This branch is the "WITH formatting" attempt for Shift+Ctrl+V / Shift+Cmd+V — however
			// browsers typically only provide plain text in the clipboard when shift is held, so we
			// rarely get here with rich content to preserve.

			/* ----------  register one‑shot matcher  ---------- */
			const clipboard = quill.getModule('clipboard');

			if(isPlainPasteRequested || this.editorSettings.excludeColorInformationWhenPasting || this.editorSettings.excludeFontInformationWhenPasting) {
				const stripFormattingMatcher = (node: Node, delta: any) => {
					if(isPlainPasteRequested) {
						// Strip ALL formatting - return plain text only
						delta.ops.forEach((op: any) => {
							if(op.attributes) {
								delete op.attributes;
							}
						});
					} else {
						// Strip only specific formatting based on settings
						delta.ops.forEach((op: any) => {
							if(op.attributes) {
								if(this.editorSettings.excludeColorInformationWhenPasting) {
									delete op.attributes.color;
									delete op.attributes.background;
								}
								if(this.editorSettings.excludeFontInformationWhenPasting) {
									delete op.attributes.font;
									delete op.attributes.size;
								}
							}
						});
					}
					return delta;
				};

				// Node.ELEMENT_NODE = 1  -> covers spans, divs, etc.
				clipboard.addMatcher(Node.ELEMENT_NODE, stripFormattingMatcher);

				// When Quill finishes inserting the paste, remove the matcher.
				// setTimeout 0 is enough - Quill's paste finishes in the same task.
				this.safeSetTimeout(() => {
					clipboard.matchers = clipboard.matchers.filter( ([, matcher]: [any, any]) => matcher !== stripFormattingMatcher); // [, matcher] is a tuple
				}, 0);
			}

		}, /* useCapture = */ true); // <‑‑‑ important!

		/* -------  BUBBLING‑PHASE listener  ------- */
		quill.root.addEventListener('paste', (ev: ClipboardEvent) => {
			if(this.editorSettings.readOnly) return;

			const data = ev.clipboardData;
			if(!data) return;

			// Skip URL title fetch on the explicit "raw paste" shortcut (Ctrl/Cmd+Shift+V).
			// We deliberately don't gate on `pasteWithoutFormattingAsDefault` here — that
			// setting changes how content formatting is handled, but auto-replacement is a
			// separate feature the user expects on their normal Cmd+V regardless.
			const plainPaste = (isCtrlDown || isMetaDown) && isShiftDown;
			if(!plainPaste) {
				// by now the content *is* in the document,
				// so title‑fetch & replacement still make sense
				this.checkForPastedUrl(quill, data);
			}
		});                                 // default useCapture = false

		/* -------  CAPTURE‑PHASE cut listener to preserve selection on macOS  ------- */
		quill.root.addEventListener('cut', (ev: ClipboardEvent) => {
			if(this.editorSettings.readOnly) return;

			// If this is the primary editor but a cell editor is active, don't handle the event
			// Let the cell editor's handler process it instead
			if(quill === this.primaryNotesEditor && this.isCellEditorActive()) {
				return;
			}

			// If this is a cell editor but it's not the currently active one, don't handle the event
			if(quill !== this.primaryNotesEditor && quill !== this.cellNotesEditor) {
				return;
			}

			// If macOS, allow native cut to propagate for better OS integration
			if(isMacOS) {
				return;
			}

			// Grab DOM selection early before any other listeners mutate it
			const domSel = window.getSelection?.();
			if(!domSel || domSel.rangeCount === 0 || domSel.isCollapsed) {
				return; // let default/bubbling handlers proceed
			}

			if(!ev.clipboardData) return;

			// Build plain text and HTML from the DOM range
			const range = domSel.getRangeAt(0);
			const plain = domSel.toString();
			let html = '';
			try {
				const div = document.createElement('div');
				div.appendChild(range.cloneContents());
				html = div.innerHTML;
			} catch { /* ignore */ }

			// Populate clipboard
			ev.clipboardData.setData('application/x-quill-internal', 'true');
			ev.clipboardData.setData('text/plain', plain);
			if(html) ev.clipboardData.setData('text/html', html);

			// Prevent default and perform deletion ourselves so Quill updates via input events
			ev.preventDefault();
			ev.stopImmediatePropagation();
			try {
				document.execCommand('delete');
			} catch {
				// Fallback: if execCommand fails, try Quill deletion using current selection
				const sel = quill.getSelection(true);
				if(sel && sel.length > 0) {
					quill.deleteText(sel.index, sel.length, 'user');
				}
			}
		}, true); // useCapture = true
	}

	/**
	 * Checks if the pasted content is a URL and converts it to a link,
	 * then optionally fetches its title and replaces the URL with it.
	 * If the URL is an image, inserts it as an image instead.
	 */
	private checkForPastedUrl(quill: any, clipboardData: DataTransfer): void {
		const text = clipboardData.getData('text/plain');

		if(this.URL_REGEX.test(text)) {
			// Let the default paste happen first
			this.safeSetTimeout(async () => {
				// Get the current selection - this will be just after the pasted URL
				const range = quill.getSelection();
				if(!range) return;

				const urlStartIndex = range.index - text.length;

				// Make sure the pasted URL is a link immediately
				quill.formatText(urlStartIndex, text.length, 'link', text, 'silent');

				// Only proceed with image detection and page title fetching if both settings allow it
				if(!this.editorSettings.replaceUrlWithPageTitle) {
					return;
				}

				// Check if we're in a code block
				const formats = quill.getFormat(urlStartIndex, text.length);
				if(formats.code || formats['code-block']) {
					return;
				}

				// Force a break in the undo stack between the paste and any later
				// auto-replacement (image or title). Without this, the async replacement
				// can land inside the paste's history-merge window (500ms) and a single
				// Ctrl+Z would undo both the replacement AND the paste itself, making it
				// impossible to keep the raw URL.
				quill.history.cutoff();

				// Check if this URL points to an image
				const isImage = await this.checkIfImageUrl(text);

				if(isImage) {
					// Replace the URL with an image embed
					this.replaceUrlWithImage(quill, text, urlStartIndex, text.length);
				} else {
					// Try to fetch the page title and replace the URL with the title
					this.replaceUrlWithPageTitle(quill, text, urlStartIndex, text.length);
				}
			}, 0);
		}
	}

	/**
	 * Helper method to insert markdown content as delta into the editor
	 * @param quill The Quill editor instance
	 * @param textToConvert The markdown text to convert
	 * @param originalText The original clipboard text (untrimmed)
	 * @param text The trimmed clipboard text
	 * @param sel The selection at time of paste
	 * @param skipUrlAutoReplacement True when the user explicitly requested the
	 *   raw paste action (Ctrl/Cmd+Shift+V or context-menu "Paste Without Formatting").
	 *   The URL→title auto-replacement is then skipped so the raw URL stays as-is.
	 *   Note: this is NOT just `pasteWithoutFormattingAsDefault` — auto-replacement
	 *   should still run on the user's default Cmd+V even if their default mode is plain.
	 */
	private insertMarkdownAsDelta(quill: any, textToConvert: string, originalText: string, text: string, sel: any, skipUrlAutoReplacement: boolean = false): void {
		safeInvokeAsync<string>(this.dotNetHelper, 'ConvertMarkdownToDelta', [textToConvert]).then((deltaJson) => {
			if(deltaJson) {
				try {
					const delta = JSON.parse(deltaJson);

					// Always remove trailing newline we added for parsing
					delta.ops.pop();

					// Check if original text had NO trailing newline, and if so, strip one more newline from delta if it is present and unformatted
					const hadTrailingNewline = originalText !== text && originalText.endsWith('\n');
					if(!hadTrailingNewline && delta.ops && delta.ops.length > 0) {
						const lastOp = delta.ops[delta.ops.length - 1];

						// If the last operation is a plain newline (no attributes), remove it
						if(lastOp.insert === '\n' && !lastOp.attributes) {
							delta.ops.pop();
						}
					}

					const range = sel || quill.getSelection() || { index: 0, length: 0 };

					// Delete selected text if any
					if(range.length > 0) {
						quill.deleteText(range.index, range.length, 'user');
					}

					// Insert the converted markdown delta
					delta.ops.unshift({ retain: range.index });
					quill.updateContents(delta, 'user');

					// Set cursor after inserted content
					const insertLength = delta.ops.reduce((len: number, op: any) =>
						len + (op.insert ? (typeof op.insert === 'string' ? op.insert.length : 1) : 0), 0);
					quill.setSelection(range.index + insertLength, 0, 'user');

					// Check if we pasted a URL and should fetch its page title.
					// Skip when the user explicitly requested raw paste (Ctrl/Cmd+Shift+V) —
					// they want the URL preserved as-is. The default-plain setting is
					// intentionally NOT considered here; auto-replacement should still run on
					// a normal Cmd+V even when the user's default is plain paste.
					if(!skipUrlAutoReplacement && this.editorSettings.replaceUrlWithPageTitle && this.URL_REGEX.test(text)) {
						const formats = quill.getFormat(range.index, text.length);
						if(!formats.code && !formats['code-block']) {
							// Break the undo stack here so the async replacement gets its own
							// undo entry instead of merging back into the paste.
							quill.history.cutoff();
							this.checkIfImageUrl(text).then((isImage: boolean) => {
								if(isImage) {
									this.replaceUrlWithImage(quill, text, range.index, text.length);
								} else {
									this.replaceUrlWithPageTitle(quill, text, range.index, text.length);
								}
							});
						}
					}
				} catch(ex) {
					console.error('Failed to parse markdown delta:', ex);
					// Fallback to plain text insert
					const range = sel || quill.getSelection() || { index: 0, length: 0 };
					quill.deleteText(range.index, range.length, 'user');
					quill.insertText(range.index, text, 'user');
				}
			} else {
				// Conversion failed, insert as plain text
				const range = sel || quill.getSelection() || { index: 0, length: 0 };
				quill.deleteText(range.index, range.length, 'user');
				quill.insertText(range.index, text, 'user');
			}
		});
	}

	private containsMarkdown(text: string): boolean {
		// Lightweight pattern-based detection for performance reasons and to be intentional
		// about what qualifies as markdown (avoiding false positives from a full parser)
		const markdownPatterns = [
			/^#{1,6}\s/m,                    // Headers: # Header
			/\*\*[^*]+\*\*/,                 // Bold: **text**
			/__[^_]+__/,                     // Bold: __text__
			/~~[^~]+~~/,                     // Strikethrough: ~~text~~
			/==[^=]+==/,                     // Highlight: ==text==
			/(?<!\*)\*[^*\s][^*]*[^*\s]\*(?!\*)/,  // Italic: *text* (not bold)
			/(?<!_)_[^_\s][^_]*[^_\s]_(?!_)/,     // Italic: _text_ (not bold)
			/\[[^\]]+\]\([^)]+\)/,           // Links: [text](url)
			/^[-*+]\s/m,                     // Unordered list: - item, * item, + item
			// /^\d+\.\s/m,                  // Ordered list: 1. item - disabled because too common in normal text
			/`[^`]+`/,                       // Inline code: `code`
			/^```/m,                         // Code block: ```
			/^>\s/m,                         // Blockquote: > text
			/\$\$[^$]+\$\$/,                 // Inline math: $$formula$$
			/^:?-+:?\s*$/m,                  // Justification: :-- (left), :-: (center), or --: (right)
			/^\|.+\|.+\|$/m,                 // Table row: |col1|col2|col3|
		];
		return markdownPatterns.some(pattern => pattern.test(text));
	}

	/**
	 * Helper method to paste HTML content into the editor
	 * @param quill The Quill editor instance
	 * @param html The HTML content to paste
	 * @param sel The selection at time of paste
	 */
	private pasteHtmlContent(quill: any, html: string, sel: any): void {
		try {
			// Convert HTML to delta using Quill's clipboard module
			const delta = quill.clipboard.convert({ html: html });

			// Apply formatting settings if needed
			if(this.editorSettings.pasteWithoutFormattingAsDefault) {
				// Strip ALL formatting
				delta.ops.forEach((op: any) => {
					if(op.attributes) {
						delete op.attributes;
					}
				});
			} else {
				// Strip specific formatting based on settings
				delta.ops.forEach((op: any) => {
					if(op.attributes) {
						if(this.editorSettings.excludeColorInformationWhenPasting) {
							delete op.attributes.color;
							delete op.attributes.background;
						}
						if(this.editorSettings.excludeFontInformationWhenPasting) {
							delete op.attributes.font;
							delete op.attributes.size;
						}
					}
				});
			}

			const range = sel || quill.getSelection() || { index: 0, length: 0 };

			// Delete selected text if any
			if(range.length > 0) {
				quill.deleteText(range.index, range.length, 'user');
			}

			// Insert the delta at the current position
			delta.ops.unshift({ retain: range.index });
			quill.updateContents(delta, 'user');

			// Set cursor after inserted content
			const insertLength = delta.ops.reduce((len: number, op: any) =>
				len + (op.insert ? (typeof op.insert === 'string' ? op.insert.length : 1) : 0), 0);
			quill.setSelection(range.index + insertLength, 0, 'user');
		} catch(ex) {
			console.error('Failed to paste HTML content:', ex);
			// Fallback: try to extract text from HTML and insert as plain text
			const range = sel || quill.getSelection() || { index: 0, length: 0 };
			const tempDiv = document.createElement('div');
			tempDiv.innerHTML = html;
			const plainText = tempDiv.textContent || tempDiv.innerText || '';
			quill.deleteText(range.index, range.length, 'user');
			quill.insertText(range.index, plainText, 'user');
		}
	}

	/**
	 * Replaces a URL link text with its fetched page title.
	 * The replacement is bracketed with history cutoffs so it forms its own undo
	 * entry — pressing Ctrl+Z restores the raw URL without also undoing the paste.
	 * @param quill The editor that owns the URL text. Captured at paste time so
	 *   activeEditor switching during the async fetch can't redirect us elsewhere.
	 * @param url The URL to fetch the title for
	 * @param urlStartIndex The index where the URL text starts in the editor
	 * @param urlLength The length of the URL text
	 */
	private replaceUrlWithPageTitle(quill: any, url: string, urlStartIndex: number, urlLength: number): void {
		// Only fetch page title if the setting is enabled
		if(!this.editorSettings.replaceUrlWithPageTitle) return;

		// Check if we're in a code block
		const formats = quill.getFormat(urlStartIndex, urlLength);
		if(formats.code || formats['code-block']) return;

		// Fetch the page title and update the link text
		this.fetchPageTitle(url).then(pageTitle => {
			if(pageTitle && pageTitle !== url) {
				// Check if cursor is still at the end of the URL before replacing
				const currentSelection = quill.getSelection();
				const cursorAtEndOfUrl = currentSelection && currentSelection.index === urlStartIndex + urlLength;

				// Break the undo stack BEFORE the change: this guarantees the
				// delete+insert below land in a brand-new undo entry instead of
				// being merged into the still-open paste entry.
				quill.history.cutoff();

				// Replace the URL text with the page title (keeping the link)
				quill.deleteText(urlStartIndex, urlLength, 'user');
				quill.insertText(urlStartIndex, pageTitle, {link: url}, 'user');

				// Only reposition cursor if it was at the end of the URL (user hasn't moved it)
				if(cursorAtEndOfUrl) {
					quill.setSelection(urlStartIndex + pageTitle.length, 0, 'silent');
				}

				// Break the undo stack AFTER the change too, so subsequent typing
				// doesn't merge back into the replacement entry.
				quill.history.cutoff();
			}
		}).catch(error => {
			console.error('Error fetching page title:', error);
			// Even if title fetching fails, the URL is already a link.
		});
	}

	/**
	 * Replaces a URL text with an image embed. Bracketed with history cutoffs so
	 * it forms its own undo entry separate from the paste that triggered it.
	 * @param quill The editor that owns the URL text. Captured at paste time so
	 *   activeEditor switching during the async fetch can't redirect us elsewhere.
	 */
	private replaceUrlWithImage(quill: any, url: string, urlStartIndex: number, urlLength: number): void {
		// Check if cursor is still at the end of the URL before replacing
		const currentSelection = quill.getSelection();
		const cursorAtEndOfUrl = currentSelection && currentSelection.index === urlStartIndex + urlLength;

		// Break the undo stack before the change so it gets its own entry.
		quill.history.cutoff();

		// Delete the URL text
		quill.deleteText(urlStartIndex, urlLength, 'user');

		// Insert the image embed at the position
		quill.insertEmbed(urlStartIndex, 'image', url, 'user');

		// Position cursor after the image
		if(cursorAtEndOfUrl) {
			quill.setSelection(urlStartIndex + 1, 0, 'silent');
		}

		quill.history.cutoff();
	}

	/**
	 * Fetches the title of a web page with special handling for different sites
	 * @param url The URL to fetch the title from
	 * @returns The page title or null if it couldn't be fetched
	 */
	private async fetchPageTitle(url: string): Promise<string | null> {
		try {
			// Special handling for Reddit URLs
			if(url.includes('reddit.com')) {
				// Convert URL to JSON API endpoint if it's a Reddit post
				if(url.includes('/comments/')) {
					const jsonUrl = url.split('?')[0] + '.json';
					const redditTitle = await safeInvokeAsync<string>(this.dotNetHelper, 'FetchRedditTitle', [jsonUrl]);
					if(redditTitle) {
						return redditTitle;
					}
				}
			}

			// Special handling for X/Twitter URLs
			if(url.includes('twitter.com') || url.includes('x.com')) {
				// Extract username and tweet ID for a more user-friendly display
				const tweetInfo = this.extractTweetInfo(url);
				if(tweetInfo) {
					return `Tweet by @${tweetInfo.username}`;
				}
			}

			// Default title fetching for other URLs
			const title = await safeInvokeAsync<string>(this.dotNetHelper, 'FetchPageTitle', [url]);
			return title || null;
		} catch(error) {
			console.error('Error fetching page title:', error);
			return null;
		}
	}

	/**
	 * Extracts tweet info from a Twitter/X URL
	 * @param url Twitter/X URL
	 * @returns Object with username and tweetId, or null if not valid
	 */
	private extractTweetInfo(url: string): { username: string, tweetId: string } | null {
		// Handle both twitter.com and x.com URLs
		// Example: https://twitter.com/username/status/1234567890123456789
		const tweetRegex = /(?:twitter|x)\.com\/([^/]+)\/status\/(\d+)/i;
		const match = url.match(tweetRegex);
		if(!match) return null;

		return {
			username: match[1],
			tweetId: match[2]
		};
	}

	/**
	 * Checks if a URL points to an image by checking the Content-Type header or file extension
	 * @param url The URL to check
	 * @returns true if the URL is an image, false otherwise
	 */
	private async checkIfImageUrl(url: string): Promise<boolean> {
		try {
			// First check common image extensions
			const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.ico'];
			const urlPath = url.split('?')[0].toLowerCase(); // Remove query params
			const hasImageExtension = imageExtensions.some(ext => urlPath.endsWith(ext));

			// If it has an image extension, consider it an image
			if(hasImageExtension) {
				return true;
			}

			// Otherwise, check the Content-Type header via C# method
			const contentType = await safeInvokeAsync<string>(this.dotNetHelper, 'FetchContentType', [url]);
			return !!contentType && contentType.startsWith('image/');
		} catch(error) {
			console.error('Error checking if URL is image:', error);
			return false;
		}
	}

	// Track the last selection and which editor it happened in so that we can restore it via restoreSavedSelection.
	// Saved selection is also used for knowing if the link tooltip should be shown.
	public handleSelectionChanged(isCellEditor: boolean): void {

		if(!isCellEditor && this.tableState.ignoreNextSelectionChange) {
			// Bogus selection change events are fired when a TableBlot's contents are changed and must
			// be ignored or we will incorrectly believe that the user returned to the primary editor.
			this.tableState.ignoreNextSelectionChange = false;
			return;
		}

		if(this.isRestoringSelection) return;

		// Safety-net for cancelled dialogs that never hit their release.
		this.keepCellEditorAliveDepth = 0;

		if(!isCellEditor) {
			// We're back in the primary editor
			const currentSelection = this.primaryNotesEditor.getSelection();
			// Only clear saved cell selection if the primary editor actually has a selection.
			// A null selection means focus left the cell but didn't land in the primary editor
			// (e.g., a dialog opened), so we need to preserve the cell state for restoration.
			if(currentSelection) {
				this.activeEditor = 'primary';
				this.savedCellSelection.cellId = null;
				this.savedPrimarySelection = currentSelection;
			}
			const range = this.getSelectionWithFallback();
			this.updateOutlineCommandStates(range ?? null);
			this.updateMoveLineCommandStates(range ?? null);
			this.updateTableCommandStates();
		} else {
			// We're in a cell editor
			this.activeEditor = 'cell';
			this.savedPrimarySelection = null;
			this.savedCellSelection.cellId = this.cellNotesEditor.container.id;
			const currentSelection = this.cellNotesEditor.getSelection();
			if(currentSelection) {
				this.savedCellSelection.cellSelection = currentSelection;
			}
			this.updateOutlineCommandStates(null);
			this.updateMoveLineCommandStates(null);
			this.updateTableCommandStates();
		}
	}


	// Necessary to restore the selection after may have been lost due to user interaction with a dialog.
	// For example, if the user clicks the "Insert Link" button, the selection is lost.
	// This method restores active editor and its selection to what it was before the dialog was opened.
	private restoreSavedSelection(scrollIntoView: boolean = false) {
		// The saved cell may be gone (table rebuilt, undo/redo, stale cellId) by the time
		// the dialog closes. Treat that like "no cell saved" and fall back to primary.
		const savedCellElement = this.savedCellSelection.cellId
			? document.getElementById(this.savedCellSelection.cellId)
			: null;

		if(!savedCellElement) {
			if(this.savedCellSelection.cellId) {
				this.savedCellSelection.cellId = null;
			}
			this.activeEditor = 'primary';
			const editor = this.notesEditor();
			editor.focus();
			if(scrollIntoView && this.savedPrimarySelection) {
				this.scrollSelectionIntoView(editor, this.savedPrimarySelection.index);
			}
			return editor;
		}

		this.isRestoringSelection = true; // prevent the restoration from re-saving
		try {
			const editor = TableBlot.activateCell(savedCellElement, this);
			this.activeEditor = 'cell';
			editor?.focus();
			editor?.setSelection(this.savedCellSelection.cellSelection);
			if(scrollIntoView && editor && this.savedCellSelection.cellSelection) {
				this.scrollSelectionIntoView(editor, this.savedCellSelection.cellSelection.index);
			}
			return editor;
		} finally {
			this.isRestoringSelection = false;
		}
	}

	private scrollSelectionIntoView(editor: any, index: number) {
		try {
			// Find the closest line element at the cursor position
			const [line] = editor.getLine(index);
			if(line && line.domNode) {
				// Use native scrollIntoView with center alignment
				line.domNode.scrollIntoView({
					block: 'center',
					behavior: 'smooth',
					inline: 'nearest'
				});
			}
		} catch(e) {
			// Silently fail if scrolling doesn't work
			console.warn('Failed to scroll selection into view:', e);
		}
	}

	/**
	 * iPad-only: when the Notes Editor pane (inside #plex-and-content-area) is shorter
	 * than the on-screen keyboard, ask BrainPage to shrink Plex so the cursor has room
	 * to scroll above the keyboard. Awaits the pane actually reaching the target height
	 * (RAF poll), then runs a verify-and-correct loop on the scroll position so we don't
	 * lose the cursor to multi-stage iOS keyboard animations, smooth-scroll-interrupting-
	 * itself races, or iOS WebKit's own auto-scroll-into-view kicking in after us.
	 *
	 * Safe to call repeatedly — fit-check no-ops if pane is already big enough, and the
	 * scroll loop no-ops as soon as the line is in view.
	 */
	private async ensureContentAreaFitsKeyboardThenScroll(quill: any): Promise<void> {
		let didResize = false;
		if(this.editorSettings.isTablet
			&& this.editorSettings.clientOs == ClientOs.iOS
			&& typeof window !== 'undefined'
			&& (window as any).brainPage?.ensureContentAreaFitsKeyboard) {
			const paneEl = quill.root.closest('#content-area-container') as HTMLElement | null;
			const splitterRoot = document.getElementById('plex-and-content-area');
			const kbHeight = parseFloat(getComputedStyle(document.documentElement)
				.getPropertyValue('--keyboard-height').trim()) || 0;
			if(paneEl && splitterRoot && kbHeight > 0) {
				const splitterTotal = splitterRoot.clientHeight;
				const paneHeight = paneEl.clientHeight;
				const requiredPaneHeight = kbHeight + 200;
				if(splitterTotal > 0 && paneHeight < requiredPaneHeight) {
					// Landscape + top/bottom (vertical) splitter layout: shrinking Plex to fit
					// keyboard+200 leaves Plex as a tiny sliver. Better UX is to fully maximize
					// the Notes pane (equivalent of tapping the splitter's maximize button) so
					// the editor takes the full container.
					//
					// Detect top/bottom layout from geometry: when panes are stacked vertically,
					// each pane spans the full splitter width.
					const isLandscape = window.innerWidth > window.innerHeight;
					const isTopBottomLayout = paneEl.offsetWidth >= splitterRoot.offsetWidth - 5;
					if(isLandscape && isTopBottomLayout && (window as any).brainPage?.maximizeContentArea) {
						(window as any).brainPage.maximizeContentArea();
						await this.waitForPaneHeight(paneEl, splitterTotal);
					} else {
						// Plex is the FIRST pane; PlexPosition is Plex's % of total.
						const newPlexPx = Math.max(0, splitterTotal - requiredPaneHeight);
						const newPercent = (newPlexPx / splitterTotal) * 100;
						(window as any).brainPage.ensureContentAreaFitsKeyboard(newPercent);
						await this.waitForPaneHeight(paneEl, requiredPaneHeight);
					}
					didResize = true;
				}
			}
		}
		if(didResize) {
			// Verify/instant-rescroll loop handles the splitter resize layout shift on iPad
			// (smooth scroll would fight the still-animating pane and land the line off).
			await this.scrollCursorAboveKeyboardUntilStable(quill);
		} else {
			// No layout shift expected — smooth scroll lands cleanly in one shot. The
			// phone floating-toolbar's CSS transition is handled by the predicted-occlusion
			// formula in scrollCursorAboveKeyboard, not by a verify loop.
			this.scheduleScrollCursorAboveKeyboard(quill, true);
		}
	}

	/**
	 * Resolves when paneEl's clientHeight reaches targetHeight, OR has stayed at the
	 * same non-initial size for `stableFrameThreshold` consecutive RAF frames (e.g.
	 * splitter clamped to a smaller value than requested), OR the timeout elapses.
	 *
	 * We require the pane to have actually moved off its initial height before counting
	 * stable frames — otherwise we'd resolve immediately on the first 3 frames before
	 * the splitter's CSS transition has even started, which is the bug we're fixing.
	 */
	private waitForPaneHeight(paneEl: HTMLElement, targetHeight: number, timeoutMs: number = 600): Promise<void> {
		return new Promise(resolve => {
			const start = performance.now();
			const initialHeight = paneEl.clientHeight;
			let lastHeight = initialHeight;
			let stableFrames = 0;
			let hasMoved = false;
			const stableFrameThreshold = 3;
			const tick = () => {
				const h = paneEl.clientHeight;
				if(h >= targetHeight - 1) {
					resolve();
					return;
				}
				if(!hasMoved && h !== initialHeight) {
					hasMoved = true;
				}
				if(hasMoved && h === lastHeight) {
					stableFrames++;
					if(stableFrames >= stableFrameThreshold) {
						resolve();
						return;
					}
				} else {
					stableFrames = 0;
					lastHeight = h;
				}
				if(performance.now() - start > timeoutMs) {
					resolve();
					return;
				}
				requestAnimationFrame(tick);
			};
			requestAnimationFrame(tick);
		});
	}

	/**
	 * Repeatedly verify that the cursor's line is above the keyboard, scrolling once per
	 * pass if it isn't. Uses *instant* scrolls (not smooth) so each iteration sees the
	 * effect of the previous one immediately — smooth scroll is async and would have
	 * subsequent passes computing delta against an interpolated mid-animation scrollTop.
	 *
	 * Loops up to `maxAttempts` times. Each pass waits 2 RAF frames before re-checking,
	 * which is enough for the browser (and any iOS WebKit auto-scroll that fired in
	 * response to keyboard appearance) to commit layout. Exits early once the line is
	 * in view, the cursor disappears, or the keyboard is dismissed.
	 */
	private async scrollCursorAboveKeyboardUntilStable(quill: any, maxAttempts: number = 6): Promise<void> {
		const scrollContainer = this.contentAreaInner || document.getElementById('contentAreaInner');
		if(!scrollContainer) return;

		for(let i = 0; i < maxAttempts; i++) {
			// Two RAFs: one to commit any pending layout, one for iOS to fire its own
			// auto-scroll-on-focus behavior (so we observe its effect, not race it).
			await new Promise(r => requestAnimationFrame(r));
			await new Promise(r => requestAnimationFrame(r));

			const range = quill.getSelection();
			if(!range) return;

			const kbHeight = parseFloat(getComputedStyle(document.documentElement)
				.getPropertyValue('--keyboard-height').trim()) || 0;
			if(kbHeight <= 0) return;

			// Caret rect (visual line) preferred — quill.getLine returns the Block Blot,
			// whose rect spans the whole paragraph for wrapped text.
			const caretRect = this.getCaretViewportRect(quill);
			let targetRect: { top: number; bottom: number } | null = caretRect;
			if(!targetRect) {
				const [line] = quill.getLine(range.index);
				if(!line?.domNode) return;
				targetRect = (line.domNode as HTMLElement).getBoundingClientRect();
			}
			const keyboardTop = window.innerHeight - kbHeight;
			const toolbarEl = document.getElementById('venus-editor-toolbar-container');
			const isFloatingToolbar = toolbarEl?.classList.contains('phone-editor-toolbar') ?? false;
			// The phone toolbar transitions its `bottom` over 300ms when --keyboard-height
			// changes, so its live getBoundingClientRect().top lags behind. By definition
			// of its CSS the toolbar always ends up just above the keyboard, so use
			// `keyboardTop - toolbar.offsetHeight` as the predicted occlusion floor — Math.min
			// picks the live value once it has caught up, and the predicted value while not.
			const occlusionTop = isFloatingToolbar
				? Math.min(toolbarEl!.getBoundingClientRect().top, keyboardTop - toolbarEl!.offsetHeight)
				: keyboardTop;
			const margin = 16;
			const visibleBottom = occlusionTop - margin;

			let delta = 0;
			if(targetRect.bottom > visibleBottom) {
				delta = targetRect.bottom - visibleBottom;
			} else if(targetRect.top < 0) {
				delta = targetRect.top - margin;
			}

			if(delta === 0) return; // Line is in view — done.

			scrollContainer.scrollTop += delta; // Instant — no smooth-scroll interruption races.
		}
	}

	/**
	 * Return the caret's viewport rect from the DOM Selection. Used by the
	 * keyboard-aware scroll routines below — `quill.getLine(index).domNode`'s rect
	 * spans the whole paragraph block, so for a wrapped `<p>` the caret could be at
	 * the top while the block bottom is way below. The DOM Range gives us the
	 * actual visual line the caret sits on.
	 *
	 * Returns null if no selection, or if the rects are degenerate (e.g. collapsed
	 * range at the very start of an empty block before the browser resolved its
	 * position) — callers fall back to the line element rect in that case.
	 */
	private getCaretViewportRect(quill: any): DOMRect | null {
		try {
			const doc = quill.root.ownerDocument as Document;
			const sel = doc.getSelection();
			if(!sel || sel.rangeCount === 0) return null;
			const range = sel.getRangeAt(0);

			// Prefer getClientRects()[0] — for a collapsed caret it's a single rect
			// sized to the visual line. getBoundingClientRect() can be 0,0,0,0 for
			// collapsed ranges in some WebKit cases.
			const rects = range.getClientRects();
			if(rects.length > 0) {
				const r = rects[0];
				if(r.height > 0) return r as DOMRect;
			}
			const bcr = range.getBoundingClientRect();
			if(bcr.height > 0) return bcr;
			return null;
		} catch {
			return null;
		}
	}

	/**
	 * Coalesce rapid cursor movement (e.g. the iOS spacebar cursor-drag gesture fires
	 * selection-change many times per frame) into a single scroll per animation frame,
	 * using the most recent cursor position. This prevents the container from
	 * "accelerating" during rapid cursor drags.
	 */
	private scheduleScrollCursorAboveKeyboard(quill: any, smooth: boolean = false): void {
		// Latch smooth=true so a smooth request during the same frame is honored
		this.scrollCursorSmooth = this.scrollCursorSmooth || smooth;
		if(this.scrollCursorRafId !== null) {
			return;
		}
		this.scrollCursorRafId = requestAnimationFrame(() => {
			this.scrollCursorRafId = null;
			const smooth = this.scrollCursorSmooth;
			this.scrollCursorSmooth = false;

			// Re-read the current selection — it may have moved since we were scheduled
			const range = quill.getSelection();
			if(range) {
				this.scrollCursorAboveKeyboard(quill, range.index, smooth);
			}
		});
	}

	/**
	 * If the iOS on-screen keyboard is covering the current cursor position, scroll
	 * #contentAreaInner just enough so the cursor's line sits above the keyboard.
	 *
	 * We can't use native Element.scrollIntoView here — it walks ALL scrollable ancestors
	 * including the window/document, which on iOS fights with the windowScrollResetGuard
	 * in vulcanUtils.ts (which aggressively pins window/document scroll to 0).
	 *
	 * We also can't use quill.getBounds() + quill.root.getBoundingClientRect() to derive
	 * viewport coordinates — quill.getBounds returns bounds relative to quill.root.parentNode
	 * (.ql-container), not quill.root (.ql-editor), and the mismatch plus .ql-editor's own
	 * overflow/padding was the source of the "cursor jumps to line above" bug.
	 *
	 * Primary scroll target is the caret's viewport rect from the DOM Selection
	 * (`getCaretViewportRect`) — this is the *visual line* the caret sits on. Using
	 * `quill.getLine(index).domNode.getBoundingClientRect()` would give the whole Block
	 * Blot's rect, which for a wrapped paragraph spans many visual lines and would
	 * scroll the bottom of the paragraph to the keyboard top (caret hidden offscreen).
	 * The line element rect is kept as a fallback for the rare cases where the Range
	 * API can't produce a usable rect (e.g. selection not yet attached to a node).
	 */
	private scrollCursorAboveKeyboard(quill: any, index: number, smooth: boolean = false): void {
		try {
			const keyboardHeightStr = getComputedStyle(document.documentElement)
				.getPropertyValue('--keyboard-height').trim();
			const keyboardHeight = parseFloat(keyboardHeightStr) || 0;
			if(keyboardHeight <= 0) {
				return;
			}

			const scrollContainer = this.contentAreaInner || document.getElementById('contentAreaInner');
			if(!scrollContainer) {
				return;
			}

			const caretRect = this.getCaretViewportRect(quill);
			let targetRect: { top: number; bottom: number } | null = caretRect;
			if(!targetRect) {
				const [line] = quill.getLine(index);
				if(!line?.domNode) {
					return;
				}
				targetRect = (line.domNode as HTMLElement).getBoundingClientRect();
			}
			const keyboardTop = window.innerHeight - keyboardHeight;

			// If the phone floating toolbar exists above the keyboard, use its top edge as
			// the occlusion boundary so the cursor isn't scrolled behind it. The toolbar's
			// `bottom` CSS transitions over 300ms when --keyboard-height changes, so its
			// live getBoundingClientRect().top lags behind for the duration of the slide.
			// By definition of the CSS it always ends up just above the keyboard, so use
			// `keyboardTop - toolbar.offsetHeight` as the predicted occlusion floor —
			// Math.min picks the live value once it has caught up, and the predicted value
			// while it hasn't (i.e. mid-transition).
			//
			// On tablets/desktop the same ID renders a top-pinned toolbar that is NOT a
			// keyboard occlusion boundary — the `phone-editor-toolbar` class is only added
			// by the phone branch of VenusEditorToolbar.razor, so we gate on that marker.
			const toolbarEl = document.getElementById('venus-editor-toolbar-container');
			const isFloatingToolbar = toolbarEl?.classList.contains('phone-editor-toolbar') ?? false;
			const occlusionTop = isFloatingToolbar
				? Math.min(toolbarEl!.getBoundingClientRect().top, keyboardTop - toolbarEl!.offsetHeight)
				: keyboardTop;
			const margin = 16;
			const visibleBottom = occlusionTop - margin;

			let delta = 0;
			if(targetRect.bottom > visibleBottom) {
				// Line is covered (or nearly so) by the keyboard — scroll the container down
				delta = targetRect.bottom - visibleBottom;
			} else if(targetRect.top < 0) {
				// Edge case: line scrolled above the visible area
				delta = targetRect.top - margin;
			}

			if(delta !== 0) {
				if(smooth) {
					scrollContainer.scrollTo({
						top: scrollContainer.scrollTop + delta,
						behavior: 'smooth'
					});
				} else {
					scrollContainer.scrollTop += delta;
				}
			}
		} catch(e) {
			console.warn('Failed to scroll cursor above keyboard:', e);
		}
	}

	private initSpellCheckState(quill: any): void {
		
		// TODO: macOS will automatically de-select any selected text when spell check is enabled. See [DEKU-1036].
		
		const useSpellcheck = false;
		// const useSpellcheck = this.editorSettings.isSpellCheckEnabled ? 'true' : 'false';
		
		quill.root.setAttribute('spellcheck', useSpellcheck);

		this.updateToolbarState();
	}

	/**
	 * Handles clicking the Undo button.
	 */
	private handleUndo(): void {
		if(!this.primaryNotesEditor) return;
		this.preserveTableControls = true;
		const wasInCell = this.activeEditor === 'cell' && !!this.cellNotesEditor;
		const targetCellId = wasInCell ? this.tableState.activeCellId : undefined;
		if(wasInCell) {
			if(this.notesEditor().history.stack.undo.length > 0) {
				// local undo is available, use it to prevent the cursor position from getting lost
				this.notesEditor().history.undo();
			} else {
				// local undo is not available, use the primary editor's undo stack and fast-forward by the amount of local redo steps times two
				// this undoes the local undo steps and then redoes them on the primary editor
				const fastForwardAmount = this.cellNotesEditor.history.stack.redo.length * 2;
				for(let i = 0; i < fastForwardAmount + 1; i++) {
					this.primaryNotesEditor.history.undo();
				}
			}
		} else {
			this.primaryNotesEditor.history.undo();
		}
		this.reconstructTablesAfterUndoRedo();
		this.restoreEditorFocusAfterUndoRedo(targetCellId);
	}

	/**
	 * Handles clicking the Redo button.
	 */
	private handleRedo(): void {
		if(!this.primaryNotesEditor) return;
		this.preserveTableControls = true;
		const wasInCell = this.activeEditor === 'cell' && !!this.cellNotesEditor;
		const targetCellId = wasInCell ? this.tableState.activeCellId : undefined;
		if(wasInCell) {
			if(this.notesEditor().history.stack.redo.length > 0) {
				// local redo is available, use it to prevent the cursor position from getting lost
				this.notesEditor().history.redo();
			} else {
				// local redo is not available, use the primary editor's redo stack
				this.primaryNotesEditor.history.redo();
			}
		} else {
			this.primaryNotesEditor.history.redo();
		}
		this.reconstructTablesAfterUndoRedo();
		this.restoreEditorFocusAfterUndoRedo(targetCellId);
	}

	// Defer past reconstructTablesAfterUndoRedo's setTimeout-scheduled teardown,
	// then route through the shared focus restorer.
	private restoreEditorFocusAfterUndoRedo(targetCellId: string | undefined): void {
		this.safeSetTimeout(() => this.restoreActiveEditorFocus(targetCellId), 0);
	}

	/// Quill's history module listens to `beforeinput` for `historyUndo`/`historyRedo`
	/// and calls `history.undo()`/`history.redo()` itself. On macOS, Cmd+Z fires both
	/// a `keydown` (which our `undo` keyboard binding handles via handleUndo) AND a
	/// `beforeinput` with `inputType: 'historyUndo'`. Both fire `history.undo()`, so a
	/// single keypress consumed two undo entries — collapsing what should be two
	/// distinct undo steps (e.g. paste, then async URL→title replacement) into one.
	/// Cmd+Shift+Z does not fire `beforeinput historyRedo` on macOS, which is why
	/// redo behaved correctly while undo combined steps.
	///
	/// We register a capture-phase listener that swallows historyUndo/historyRedo
	/// before Quill's bubble-phase listener sees them. The keyboard binding still
	/// fires and runs the undo/redo through our cell-editor-aware handler.
	private suppressDuplicateHistoryBeforeInput(quill: any): void {
		quill.root.addEventListener('beforeinput', (ev: InputEvent) => {
			if(ev.inputType === 'historyUndo' || ev.inputType === 'historyRedo') {
				ev.preventDefault();
				ev.stopImmediatePropagation();
			}
		}, /* useCapture */ true);
	}

	/// After undo/redo, tables rebuilt by create() have no interactive controls
	/// and aren't registered in tableToEditorMap. Deferred via setTimeout(0) to
	/// run after Quill's async MutationObserver callbacks settle.
	private reconstructTablesAfterUndoRedo(): void {
		this.safeSetTimeout(() => {
			this.registerTablesWithEditor();
			// Cells were rebuilt; cached quills point at detached DOM.
			for(const cellId of Object.keys(this.tableState.editorCache)) {
				const entry = this.tableState.editorCache[cellId];
				if(!document.contains(entry.cellElement)) {
					entry.removeListener?.();
					delete this.tableState.editorCache[cellId];
				}
			}
			const activeTable = this.getActiveTable() || this.lastActiveTable;
			const editorElement = document.getElementById(this.editorElementId);
			if(editorElement) {
				const tables = editorElement.querySelectorAll('table.ql-table-blot');
				tables.forEach((table: Element) => {
					const htmlTable = table as HTMLTableElement;
					// Reapply visual styles from data-table-* attributes on all tables,
					// since create() only builds cell structure without theme colors
					TableBlot.reapplyFormats(htmlTable);
					if(htmlTable === activeTable) {
						if(!htmlTable.querySelector('.ql-table-control')) {
							TableBlot.setupTableControls(htmlTable);
						}
					} else {
						// Remove stale controls from non-active tables
						const staleControls = htmlTable.querySelectorAll('.ql-table-control');
						if(staleControls.length > 0) {
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

	public setTextScale(scalePercent: number): void {
		const numeric = Number(scalePercent);
		const clamped = this.clampTextScalePercentage(numeric);
		this.textScalePercent = clamped;
	}

	// Called from Blazor
	public setParagraphStyle(style: string): void {
		if(!this.notesEditor()) {
			throw new Error('Editor instance is null');
		}

		let formatType: string;
		let formatValue: string | number | boolean;
		let shouldRemoveFormat = false;
		let shouldRemoveParagraphFormats = false;

		switch(style) {
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

		if(this.areCellsSelected()) {
			this.setFormatOnCells(formatType, formatValue, shouldRemoveFormat, shouldRemoveParagraphFormats);
			return;
		}

		const range = this.getSelectionWithFallback();
		if(!range) {
			throw new Error('No selection found');
		}

		// Check if the format is already applied and toggle it off if so
		const currentFormats = this.notesEditor().getFormat(range.index, range.length);
		let shouldToggleOff = false;

		if(style === 'listbullet' && currentFormats.list === 'bullet') {
			shouldToggleOff = true;
		} else if(style === 'listordered' && currentFormats.list === 'ordered') {
			shouldToggleOff = true;
		} else if(style === 'listcheck' && (currentFormats.list === 'checked' || currentFormats.list === 'unchecked')) {
			shouldToggleOff = true;
		}

		if(shouldToggleOff) {
			// Remove the list format to go back to normal text
			this.notesEditor().format('list', false, 'user');
			return;
		}

		if(shouldRemoveFormat) {
			this.notesEditor().removeFormat(range.index, range.length, 'user');
		}

		if(shouldRemoveParagraphFormats) {
			this.notesEditor().format('list', false, 'user');
			this.notesEditor().format('code-block', false, 'user');
		}

		this.notesEditor().format(formatType, formatValue, 'user');
	}

	/**
	 * Removes only inline formats from the specified range, preserving line-level formats
	 * like list, header, blockquote, code-block, indent, and align.
	 */
	private removeInlineFormatsOnly(index: number, length: number): void {
		this.withSelectionPreserved(() => {
			const inlineFormats = ['bold', 'italic', 'underline', 'strike', 'color', 'background', 'link', 'highlight', 'script'];
			for(const format of inlineFormats) {
				this.notesEditor().formatText(index, length, format, false, 'user');
			}
		});
	}

	/**
	 * Toggle the state of boolean formats like bold, italic, underline, etc.
	 */
	private toggleBooleanFormat(format: string): boolean {
		if(!this.notesEditor()) return false;
		
		const range = this.getSelectionWithFallback();
		if(!range) return false;

		const currentFormats = this.notesEditor().getFormat(range.index, range.length);
		const isApplied = currentFormats[format] === true;

		if(this.areCellsSelected()) {
			this.setBooleanFormatOnCells(format, !isApplied);
			return false;
		}

		// Prevent toggling other formats if in inline/code code block context
		if(currentFormats.code && format !== 'code') return false;
		if(currentFormats['code-block'] && format !== 'code-block') return false;

		// If toggling to inline code, clear all inline formats first (but preserve line formats like list)
		if(format === 'code' && !isApplied) {
			// Only remove formatting when applying code, not when removing it
			this.removeInlineFormatsOnly(range.index, range.length);
		}

		// Toggle the desired format on/off
		this.notesEditor().format(format, !isApplied, 'user');

		this.updateToolbarState();

		// Return false to prevent Quill’s built-in keyboard shortcut handling logic
		return false;
	}


	/**
	 * Toggle the state of key-value formats like superscript, subscript, etc.
	 * I.e. `script: 'super'`,   `script: 'sub'`, or `script: false`
	 */
	private toggleKeyValueFormat(key: string, value: string): boolean {
		if(!this.notesEditor()) return false;

		const range = this.getSelectionWithFallback();
		if(!range) return false;

		const currentFormats = this.notesEditor().getFormat(range.index, range.length);
		const isApplied = currentFormats[key] === value;

		if(currentFormats.code || currentFormats['code-block']) return false; // Don't allow toggling other formats when in code

		this.notesEditor().format(key, isApplied ? false : value, 'user');

		this.updateToolbarState();

		// Return false to prevent Quill’s built-in keyboard shortcut handling logic
		return false;
	}

	// Called by Blazor
	private setForeColor(color: string): boolean {
		if(this.areCellsSelected()) {
			this.setFormatOnCells('color', color, false, false);
			return false;
		}

		if(!this.restoreSavedSelection()) return false;

		this.notesEditor().format('color', color, 'user');

		return false;
	}

	// Called by Blazor
	private setBackColor(color: string): boolean {
		if(this.areCellsSelected()) {
			this.setFormatOnCells('background', color, false, false);
			return false;
		}

		if(!this.restoreSavedSelection()) return false;

		this.notesEditor().format('background', color, 'user');

		return false;
	}

	// Called by Blazor
	private removeForeColor(): boolean {
		if(this.areCellsSelected()) {
			this.setFormatOnCells('color', false, false, false);
			return false;
		}

		if(!this.restoreSavedSelection()) return false;

		this.notesEditor().format('color', false, 'user');

		return false;
	}

	// Called by Blazor
	private removeBackColor(): boolean {
		if(this.areCellsSelected()) {
			this.setFormatOnCells('background', false, false, false);
			return false;
		}

		if(!this.restoreSavedSelection()) return false;

		this.notesEditor().format('background', false, 'user');

		return false;
	}

	private showInsertLinkDialog(): boolean {
		if(!this.notesEditor()) return false;

		let range = this.getSelectionWithFallback();
		if(!range) return false;

		// Released in insertLink's finally, or by the safety-net on cancel.
		this.acquireCellKeepAlive();

		if(range.length === 0) {
			// Expand the selection to select the link/mention the cursor is in
			const formatRange = this.getFormatRangeForLinkOrMention(range.index);
			if(formatRange) {
				this.notesEditor().setSelection(formatRange.index, formatRange.length, 'api');
				range = formatRange;
			} else {
				// If not in a link/mention, try to select the word at the cursor
				const wordRange = this.getWordRangeAtIndex(range.index);
				if(wordRange) {
					this.notesEditor().setSelection(wordRange.index, wordRange.length, 'api');
					range = wordRange;
				}
			}
		}

		const formats = this.notesEditor().getFormat(range.index, range.length);
		const selectedText = this.notesEditor().getText(range.index, range.length);

		let prefilledText = '';
		let isUpdatingExistingText = false;

		if(formats.link) {
			prefilledText = formats.link;
		} else if(selectedText) {
			prefilledText = selectedText;
		}

		if(selectedText) {
			isUpdatingExistingText = true;
		}

		// Get cursor bounds and convert to viewport coordinates
		const bounds = this.notesEditor().getBounds(range.index);
		const editorRect = this.notesEditor().container.getBoundingClientRect();

		const x = editorRect.left + bounds.left;
		const y = editorRect.top + bounds.bottom;

		safeInvoke(this.dotNetHelper, 'ShowInsertLinkDialog', [prefilledText, isUpdatingExistingText, x, y]);
		return false;
	}

	private showInsertImageDialog(): boolean {
		if(!this.notesEditor()) return false;

		let range = this.getSelectionWithFallback();
		if(!range) return false;

		// Released in insertImage's finally, or by the safety-net on cancel.
		this.acquireCellKeepAlive();

		// Get cursor bounds and convert to viewport coordinates
		const bounds = this.notesEditor().getBounds(range.index);
		const editorRect = this.notesEditor().container.getBoundingClientRect();

		const x = editorRect.left + bounds.left;
		const y = editorRect.top + bounds.bottom;

		safeInvoke(this.dotNetHelper, 'ShowInsertImageDialog', [x, y]);
		return false;
	}

	private showInsertTableDialog(): boolean {
		if(!this.notesEditor()) return false;
		// Tables can't nest. Bail if the user is editing a cell.
		if(this.activeEditor === 'cell') return false;

		let range = this.getSelectionWithFallback();
		if(!range) return false;

		// Pin restore to primary; a stale cellId would pull insertTable into a cell.
		this.savedCellSelection.cellId = null;
		this.savedPrimarySelection = range;

		// Get cursor bounds and convert to viewport coordinates
		const bounds = this.notesEditor().getBounds(range.index);
		const editorRect = this.notesEditor().container.getBoundingClientRect();

		const x = editorRect.left + bounds.left;
		const y = editorRect.top + bounds.bottom;

		safeInvoke(this.dotNetHelper, 'ShowInsertTableDialog', [x, y]);
		return false;
	}

	public showTableThemeDialog(targetTable?: HTMLTableElement | null): void {
		// Explicit arg bypasses the active-table lookup, which can race with focus/selection
		// changes triggered by the click that opens the dialog.
		const table = targetTable ?? this.getActiveTable() ?? this.lastActiveTable;
		if(!table) return;
		this.preserveTableControls = true;

		// Read explicitly set formats from data attributes
		const explicit: Record<string, string> = {};
		Array.from(table.attributes).forEach(attr => {
			if(attr.name.startsWith('data-table-') && attr.name !== 'data-table-editor') {
				const key = attr.name.substring(5); // strip 'data-' → 'table-*'
				explicit[key] = attr.value;
			}
		});

		// Read effective/computed colors from the DOM for defaults
		const effective: Record<string, string> = {};
		const cs = getComputedStyle(table);
		effective['table-foreground-color'] = this.rgbToHex(cs.color);
		effective['table-background-color'] = this.rgbToHex(cs.backgroundColor);

		// Alt background: read from second row (even row = index 1)
		const rows = table.querySelectorAll('tr');
		if(rows.length > 1) {
			effective['table-alt-background-color'] = this.rgbToHex(getComputedStyle(rows[1]).backgroundColor);
		}

		// Line color: read from first cell
		const firstCell = table.querySelector('td');
		if(firstCell) {
			effective['table-line-color'] = this.rgbToHex(getComputedStyle(firstCell).borderColor);
		}

		// First row colors
		const firstRowCell = table.querySelector('tr:first-child td');
		if(firstRowCell) {
			const frcs = getComputedStyle(firstRowCell);
			effective['table-first-row-foreground-color'] = this.rgbToHex(frcs.color);
			effective['table-first-row-background-color'] = this.rgbToHex(frcs.backgroundColor);
			effective['table-first-row-line-color'] = this.rgbToHex(frcs.borderColor);
		}

		// First column colors (from second row's first cell to skip header)
		if(rows.length > 1) {
			const col1Cell = rows[1].querySelector('td:first-child');
			if(col1Cell) {
				const fccs = getComputedStyle(col1Cell);
				effective['table-first-column-foreground-color'] = this.rgbToHex(fccs.color);
				effective['table-first-column-background-color'] = this.rgbToHex(fccs.backgroundColor);
				effective['table-first-column-line-color'] = this.rgbToHex(fccs.borderColor);
			}
		}

		safeInvoke(this.dotNetHelper, 'ShowTableThemeDialog', [JSON.stringify(explicit), JSON.stringify(effective)]);
	}

	private rgbToHex(rgb: string): string {
		if(!rgb) return '';
		// Handle hex values passed through
		if(rgb.startsWith('#')) return rgb.toUpperCase();
		// Parse rgb(r, g, b) or rgba(r, g, b, a)
		const match = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
		if(!match) return '';
		const r = parseInt(match[1]);
		const g = parseInt(match[2]);
		const b = parseInt(match[3]);
		return `#${r.toString(16).padStart(2, '0').toUpperCase()}${g.toString(16).padStart(2, '0').toUpperCase()}${b.toString(16).padStart(2, '0').toUpperCase()}`;
	}

	public commitTableColumnWidths(table: HTMLTableElement): void {
		const blot = Quill.find(table);
		if(!blot) return;
		const index = this.primaryNotesEditor.getIndex(blot);
		if(index === -1) return;

		const colgroup = table.querySelector('colgroup');
		if(!colgroup) return;
		const widths: string[] = ['-1'];
		colgroup.querySelectorAll('col').forEach((col: any) => {
			const w = parseInt(col.style.width || '0') || 0;
			widths.push(String(w));
		});

		this.cutoffPrimaryHistory();
		this.primaryNotesEditor.formatText(index, 1, { 'table-column-widths': widths.join(',') }, 'user');
		this.cutoffPrimaryHistory();
	}

	public applyTableTheme(formatsJson: string): void {
		const table = this.getActiveTable() || this.lastActiveTable;
		if(!table) return;

		const blot = Quill.find(table);
		if(!blot) return;
		const index = this.primaryNotesEditor.getIndex(blot);
		if(index === -1) return;

		const formats: Record<string, string> = JSON.parse(formatsJson);

		const formatKeys = [
			'table-foreground-color', 'table-background-color', 'table-alt-background-color',
			'table-line-color', 'table-first-row-foreground-color', 'table-first-row-background-color',
			'table-first-row-line-color', 'table-first-column-foreground-color',
			'table-first-column-background-color', 'table-first-column-line-color',
			'table-theme-name'
		];

		const formatObj: Record<string, any> = {};
		for(const key of formatKeys) {
			formatObj[key] = formats[key] || null;
		}
		// Table-level formats don't shift length; Quill keeps the outer cursor naturally.
		this.cutoffPrimaryHistory();
		this.primaryNotesEditor.formatText(index, 1, formatObj, 'user');
		this.cutoffPrimaryHistory();

		// Theme change invalidates the shape cache so controls rebuild on next pass.
		delete table.dataset.tbShapeKey;

		this.preserveTableControls = false;
		this.restoreActiveEditorFocus();
	}

	public cancelTableTheme(): void {
		this.preserveTableControls = false;
		this.restoreActiveEditorFocus();
	}

	// Called by Blazor
	public insertImage(imageUrl: string): void {
		let editor: any = null;
		try {
			if(!this.restoreSavedSelection()) {
				return;
			}

			const range = this.getSelectionWithFallback();
			if(!range) return;

			editor = this.notesEditor();
			editor.history.cutoff();

			// Insert image at cursor position
			editor.insertEmbed(range.index, 'image', imageUrl, 'user');

			// Move cursor after the image
			editor.setSelection(range.index + 1, 0, 'user');
		} finally {
			if(editor) {
				editor.history.cutoff();
			}
			this.releaseCellKeepAlive();
		}
	}

	// Called by Blazor
	private insertLink(displayText: string, url: string, index: number, length: number): void {
		let editor: any = null;
		try {
			// If the selection is set, the link will be applied to the selected text unless displayText is provided
			// It there is no selection, the link will be inserted at the current cursor position

			if(index !== -1 && length !== -1) {
				this.notesEditor().setSelection(index, length, 'user');
			} else {
				if(!this.restoreSavedSelection()) {
					return;
				}
			}

			const range = this.getSelectionWithFallback();
			if(!range) return;

			editor = this.notesEditor();
			editor.history.cutoff();

			if(range.length > 0) {
				if(displayText) {
					// Delete the selected text before inserting the link
					editor.deleteText(range.index, range.length);
				} else {
					// Apply the to the selected text
					editor.format('link', url, 'user');
					editor.format('mention', '', 'silent');
					return;
				}
			}

			if(!displayText) {
				displayText = url;
			}

			const insertIndex = range.index;
			editor.insertText(insertIndex, displayText, {link: url}, 'user');
			// Position cursor after the inserted link
			editor.setSelection(insertIndex + displayText.length, 0, 'silent');

			// If the displayText is the same as the URL, try to fetch and replace with the page title
			if(displayText === url && this.URL_REGEX.test(url)) {
				const editor = this.notesEditor();
				// Break the undo stack so the async title replacement gets its own undo entry.
				editor.history.cutoff();
				this.replaceUrlWithPageTitle(editor, url, insertIndex, displayText.length);
			}
		} finally {
			if(editor) {
				editor.history.cutoff();
			}
			this.releaseCellKeepAlive();
		}
	}

	// Called by Blazor
	private startEditingLink(index: number, length: number): void {
		this.notesEditor().setSelection(index, length, 'api');
		this.showInsertLinkDialog();
	}

	// Called by Blazor
	public focusEditor(xPosition: number | null = null, scrollIntoView: boolean = false, focusAtStart: boolean = false, focusAtEnd: boolean = false): void {
		if(xPosition !== null) {
			this.focusAtXPosition(xPosition, scrollIntoView);
		} else if(focusAtStart) {
			const quill = this.notesEditor();
			if(quill) {
				quill.setSelection(0, 0);
				if(scrollIntoView) {
					quill.root.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
				}
			}
		} else if(focusAtEnd) {
			const quill = this.notesEditor();
			if(quill) {
				// Position at end of content (Quill always has a trailing newline at getLength() - 1)
				const endPosition = Math.max(0, quill.getLength() - 1);
				quill.setSelection(endPosition, 0);
				if(scrollIntoView) {
					quill.root.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
				}
			}
		} else {
			this.restoreSavedSelection(scrollIntoView);
		}
	}

	private focusAtXPosition(targetX: number, scrollIntoView: boolean = false): void {
		const quill = this.notesEditor();
		if(!quill) return;

		// Focus the editor first
		quill.focus();

		// Get the editor's bounds
		const editorElement = quill.root;
		const editorRect = editorElement.getBoundingClientRect();

		// Find the closest character position to the target X
		const textContent = quill.getText();
		let closestIndex = 0;
		let closestDistance = Infinity;

		// Sample positions throughout the first line of text
		for(let i = 0; i <= Math.min(textContent.length, 100); i++) {
			const bounds = quill.getBounds(i);
			if(bounds) {
				const absoluteX = editorRect.left + bounds.left;
				const distance = Math.abs(absoluteX - targetX);

				if(distance < closestDistance) {
					closestDistance = distance;
					closestIndex = i;
				}

				// Stop if we've gone past the first line
				if(bounds.top > 0) break;
			}
		}

		// Set the selection to the closest position
		quill.setSelection(closestIndex, 0);

		if(scrollIntoView) {
			editorElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
		}
	}

	private removeFormatting(): boolean {
		if(!this.notesEditor()) return false;
		
		if(this.areCellsSelected()) {
			this.setFormatOnCells('', '', true, false);
			return false;
		}

		const range = this.getSelectionWithFallback();
		if(!range) return false;

		this.notesEditor().removeFormat(range.index, range.length, 'user');

		this.updateToolbarState();

		return false;
	}
	
	// Called from Blazor
	// Returns selected text for search operations (find/replace, web search)
	// IMPORTANT: Only returns text if it's ≤100 chars and single-line
	// For general text retrieval, use getSelectedDelta() instead
	public getSelectedTextForSearch(): string {
		if(!this.primaryNotesEditor) return '';

		const selection = this.getSelectionWithFallback();
		if(!selection || selection.length === 0) return '';

		// Get the selected text
		const selectedText = this.primaryNotesEditor.getText(selection.index, selection.length).trim();

		// Only return text if it's a reasonable length for searching (not too long)
		// and doesn't contain newlines (single line searches work better)
		if(selectedText.length > 0 && selectedText.length <= 100 && !selectedText.includes('\n')) {
			return selectedText;
		}

		return '';
	}

	public getSelectedDelta(): string {
		if(!this.primaryNotesEditor) return '';

		const selection = this.getSelectionWithFallback();
		if(!selection || selection.length === 0) return '';

		const quillDelta = this.primaryNotesEditor.getContents(selection.index, selection.length);
		return JSON.stringify(quillDelta);
	}

	public executeCommand(command: string): void {
		if(!this.notesEditor()) return;

		if(command.startsWith('Notes.Formatting.') || command.startsWith('VenusEditor.')) {
			const formatType = command
				.replace('Notes.Formatting.', '')
				.replace('VenusEditor.', '')
				.toLowerCase();
			switch(formatType) {
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

		if(command.startsWith('Notes.ParagraphFormatting.')) {
			if(command.startsWith('Notes.ParagraphFormatting.Justify')) {
				const alignment = command.replace('Notes.ParagraphFormatting.Justify', '').toLowerCase();
				this.setTextAlign(alignment);
				return;
			} else if(command === 'Notes.ParagraphFormatting.Indent') {
				this.handleIndent();
				return;
			} else if(command === 'Notes.ParagraphFormatting.Outdent') {
				this.handleOutdent();
				return;
			} else {
				const style = command.replace('Notes.ParagraphFormatting.', '').toLowerCase();
				this.setParagraphStyle(style);
				return;
			}
		}

		if(command.startsWith('Notes.Table.')) {
			const tableCommand = command.replace('Notes.Table.', '');
			switch(tableCommand) {
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
					return; // don't restore focus — dialog takes focus and restores on apply/cancel
				default:
					console.warn(`Unknown table command: ${tableCommand}`);
					break;
			}
			this.restoreActiveEditorFocus();
			return;
		}

		// Handle individual Notes commands
		switch(command) {
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

	// Simple Notes Command implementations
	private extractChildThought(): void {
		// Get the selected content as quill delta and send it to Blazor
		const range = this.getSelectionWithFallback();
		if (!range) return;

		const quillDelta = this.notesEditor().getContents(range.index, range.length);
		safeInvoke(this.dotNetHelper, 'ExtractAsChildThought', [JSON.stringify(quillDelta)]);
	}
	
	// Called from Blazor when extractChildThought is completed
	public deleteSelection(): void {
		if(!this.notesEditor()) return;

		const range = this.getSelectionWithFallback();
		if(!range) return;

		this.notesEditor().deleteText(range.index, range.length, 'user');
	}

	/**
	 * Update all table of contents blots in the document with current headings
	 */
	private updateTableOfContents(): void {
		const quill = this.notesEditor();
		if(!quill) return;

		// Extract current headings from the document (automatically stops at metadata sections marker)
		const headings = extractHeadings(quill);

		// Find all TOC blots in the document
		const scroll = quill.scroll;
		const tocBlots: TableOfContentsBlot[] = [];

		scroll.descendants((blot: any) => {
			if(blot instanceof TableOfContentsBlot) {
				tocBlots.push(blot);
			}
		});

		// Update each TOC blot with current headings
		for(const tocBlot of tocBlots) {
			tocBlot.updateContent(headings);
		}
	}

	private extractTableSelectionData(table: HTMLTableElement): { rows: number; columns: number; cells: string[][]; plainText: string; html: string; themeFormats: Record<string, string> } | null {
		const ts = TableBlot.getTableSelection(table);
		if(ts.startRow === -1 || ts.startCol === -1 || ts.endRow === -1 || ts.endCol === -1) return null;

		const minRow = Math.min(ts.startRow, ts.endRow);
		const maxRow = Math.max(ts.startRow, ts.endRow);
		const minCol = Math.min(ts.startCol, ts.endCol);
		const maxCol = Math.max(ts.startCol, ts.endCol);
		const rowCount = maxRow - minRow + 1;
		const colCount = maxCol - minCol + 1;

		// Theme formats live as data-table-* attributes (set by TableBlot.formatInternal).
		const themeFormats: Record<string, string> = {};
		Array.from(table.attributes).forEach(attr => {
			if(attr.name.startsWith('data-table-')) {
				themeFormats[attr.name.substring(5)] = attr.value;
			}
		});

		// Sub-select column widths to the copied range (stored as "-1,w0,w1,...").
		const colgroup = table.querySelector('colgroup');
		if(colgroup) {
			const allCols = colgroup.querySelectorAll('col');
			const widths: string[] = ['-1'];
			let hasAnyWidth = false;
			for(let c = minCol; c <= maxCol; c++) {
				const w = parseInt((allCols[c] as HTMLElement | undefined)?.style.width || '0') || 0;
				if(w > 0) hasAnyWidth = true;
				widths.push(String(w));
			}
			if(hasAnyWidth) {
				themeFormats['table-column-widths'] = widths.join(',');
			} else {
				delete themeFormats['table-column-widths'];
			}
		}

		// Stores raw cell HTML (not delta JSON) to avoid creating headless Quill instances
		// which steal focus and deactivate the cell editor during copy.
		const cells: string[][] = [];
		const plainRows: string[] = [];
		// Emit data-table-* on the tag so the HTML paste fallback preserves theme too.
		let htmlTable = '<table';
		for(const [key, value] of Object.entries(themeFormats)) {
			htmlTable += ` data-${key}="${this.escapeHtmlAttr(value)}"`;
		}
		htmlTable += '>';
		const plainScratch = document.createElement('div');

		for(let r = minRow; r <= maxRow; r++) {
			const row = table.rows[r];
			if(!row) continue;
			const cellRow: string[] = [];
			const plainCells: string[] = [];
			htmlTable += '<tr>';

			for(let c = minCol; c <= maxCol; c++) {
				const cell = row.cells[c];
				if(!cell) {
					cellRow.push('');
					plainCells.push('');
					htmlTable += '<td></td>';
					continue;
				}

				const cellClone = cell.cloneNode(true) as HTMLElement;
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

	private escapeHtmlAttr(value: string): string {
		return value
			.replace(/&/g, '&amp;')
			.replace(/"/g, '&quot;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;');
	}

	/**
	 * If a multi-cell table selection is active, copies the selected cells to the clipboard.
	 * @param ev Optional ClipboardEvent from the copy/cut event handler (used to set clipboardData directly)
	 * @returns true if a table selection was copied, false otherwise
	 */
	private copyTableSelection(ev?: ClipboardEvent): boolean {
		const table = this.tableState.lastTableWithSelection;
		if(!table) return false;

		// Save selection state — headless Quill instances created during extraction can steal
		// focus from the cell editor, triggering deactivation and clearing the visual selection.
		const savedTs = TableBlot.getTableSelection(table);

		const data = this.extractTableSelectionData(table);
		if(!data) return false;

		this.copiedTableData = {
			rows: data.rows,
			columns: data.columns,
			cells: data.cells,
			plainText: data.plainText,
			themeFormats: data.themeFormats
		};

		const plain = data.plainText;
		const html = this.cleanHtmlForClipboard(data.html);

		if(ev) {
			if(this.isMacOS()) {
				safeInvoke(this.dotNetHelper, 'SetClipboardFromEditor', [plain, html]);
			} else {
				ev.clipboardData?.setData('text/plain', plain);
				if(html) ev.clipboardData?.setData('text/html', html);
			}
			ev.preventDefault();
			ev.stopImmediatePropagation();
			ev.stopPropagation();
		} else {
			// Called from copySelection() command path (no ClipboardEvent)
			if(this.isMacOS()) {
				safeInvoke(this.dotNetHelper, 'SetClipboardFromEditor', [plain, html]);
			} else {
				navigator.clipboard.writeText(plain);
			}
		}

		// Restore selection if it was lost during extraction
		this.restoreTableSelectionIfNeeded(table, savedTs);

		return true;
	}

	private restoreTableSelectionIfNeeded(table: HTMLTableElement, savedTs: { startRow: number; startCol: number; endRow: number; endCol: number }): void {
		if(savedTs.startRow === -1) return;
		const currentTs = TableBlot.getTableSelection(table);
		if(currentTs.startRow !== -1) return; // still intact

		// Re-establish from cell elements
		const startCell = table.rows[savedTs.startRow]?.cells[savedTs.startCol] as HTMLTableCellElement | undefined;
		const endCell = table.rows[savedTs.endRow]?.cells[savedTs.endCol] as HTMLTableCellElement | undefined;
		if(startCell && endCell) {
			TableBlot.setTableSelection(table, startCell, endCell);
		}
	}

	private cutTableSelection(ev?: ClipboardEvent): boolean {
		if(!this.copyTableSelection(ev)) return false;

		const table = this.tableState.lastTableWithSelection;
		if(!table) return true; // copy succeeded but table ref gone — still handled

		// Clear the content of the selected cells
		const cells = TableBlot.getSelectedCells(table);
		if(this.isCellEditorActive()) {
			this.notesEditor().deleteText(0, this.notesEditor().getLength(), 'api');
		}
		cells.forEach(cell => {
			if(cell.id !== this.tableState.activeCellId) {
				cell.innerHTML = '<p><br></p>';
			}
		});
		// Cell innerHTML wipes above may have destroyed controls living inside those
		// cells. Invalidate the setupTableControls shape cache so it does a full rebuild.
		delete table.dataset.tbShapeKey;
		TableBlot.setupTableControls(table);

		return true;
	}

	/**
	 * If copiedTableData is valid and the clipboard text matches, pastes the table data.
	 * When inside a table, fills cells starting at the active cell position (extending the table if needed).
	 * When outside a table, inserts a new table at the cursor.
	 * @param clipboardPlainText The plain text currently on the clipboard (from event or navigator.clipboard)
	 * @returns true if table content was pasted, false otherwise
	 */
	private pasteTableContent(clipboardPlainText: string): boolean {
		if(!this.copiedTableData) return false;
		if(clipboardPlainText !== this.copiedTableData.plainText) {
			this.copiedTableData = null;
			return false;
		}

		const srcData = this.copiedTableData;
		const table = this.getActiveTable();

		if(table) {
			// Paste into existing table: fill cells starting at the active cell position
			let targetRow: number;
			let targetCol: number;

			const ts = TableBlot.getTableSelection(table);
			if(ts.startRow !== -1 && ts.startCol !== -1) {
				targetRow = Math.min(ts.startRow, ts.endRow);
				targetCol = Math.min(ts.startCol, ts.endCol);
			} else if(this.tableState.activeCellId) {
				const cellElement = document.getElementById(this.tableState.activeCellId) as HTMLTableCellElement;
				if(!cellElement) return false;
				const row = cellElement.parentElement as HTMLTableRowElement;
				targetRow = Array.from(table.rows).indexOf(row);
				targetCol = Array.from(row.cells).indexOf(cellElement);
			} else {
				return false;
			}

			// Extend the table if the pasted content exceeds the current bounds
			const existingRows = table.rows.length;
			const existingCols = table.rows[0]?.cells.length ?? 0;
			const neededRows = targetRow + srcData.rows;
			const neededCols = targetCol + srcData.columns;

			// Collapse the table-extend into one undo entry and one rebuild.
			if(existingCols < neededCols || existingRows < neededRows) {
				TableBlot.performUndoableOperation(table, () => {
					for(let i = existingCols; i < neededCols; i++) {
						TableBlot.addColumn(table, i);
					}
					for(let i = existingRows; i < neededRows; i++) {
						TableBlot.addRow(table, i);
					}
				});
			}

			// Fill the target cells with the copied content (cells contain raw HTML)
			for(let r = 0; r < srcData.rows; r++) {
				for(let c = 0; c < srcData.columns; c++) {
					const tRow = targetRow + r;
					const tCol = targetCol + c;
					const row = table.rows[tRow];
					if(!row) continue;
					const cell = row.cells[tCol];
					if(!cell) continue;

					const cellHtml = srcData.cells[r][c];
					if(!cellHtml && cellHtml !== '') continue;

					// If this is the active cell editor, update through its Quill instance
					if(cell.id === this.tableState.activeCellId && this.tableState.editorCache[cell.id]) {
						const cellQuill = this.tableState.editorCache[cell.id].quill;
						const delta = cellQuill.clipboard.convert({html: cellHtml});
						cellQuill.setContents(delta, 'user');
					} else {
						cell.innerHTML = cellHtml || '<p><br></p>';
					}
				}
			}

			// Clear the multi-cell selection and rebuild controls.
			// Cell HTML writes above may have destroyed controls inside filled cells;
			// invalidate the shape cache so setupTableControls rebuilds rather than skipping.
			TableBlot.setTableSelection(table, null, null);
			delete table.dataset.tbShapeKey;
			TableBlot.setupTableControls(table);
		} else {
			// Paste as a new table in the main editor — insertEmbed expects delta JSON per cell
			const range = this.getSelectionWithFallback();
			if(!range) return false;

			const deltaCells = srcData.cells.map(row =>
				row.map(cellHtml => {
					if(!cellHtml) return '{"ops":[]}';
					const delta = QuillExtensions.convertHtmlToDelta(cellHtml);
					return JSON.stringify(delta);
				})
			);

			const tableValue = JSON.stringify({
				columns: srcData.columns,
				rows: srcData.rows,
				cells: deltaCells
			});

			this.primaryNotesEditor?.insertEmbed(range.index, 'table', tableValue, 'user');
			// insertEmbed only sets structure; reapply theme formats on top.
			if(srcData.themeFormats && Object.keys(srcData.themeFormats).length > 0) {
				this.primaryNotesEditor?.formatText(range.index, 1, srcData.themeFormats, 'user');
			}
			this.safeSetTimeout(() => { this.registerTablesWithEditor(); }, 0);
		}

		return true;
	}

	private copySelection(): void {
		if(this.copyTableSelection()) return;

		const range = this.getSelectionWithFallback();
		if(!range || range.length === 0) return;

		// Check if only an image is selected - if so, copy the image to clipboard
		const imageUrl = this.getSelectedImageUrl(this.notesEditor(), range);
		if(imageUrl) {
			console.log('[VenusEditor] Image-only selection detected in copySelection, imageUrl:', imageUrl.substring(0, 100));
			this.copyImageToClipboard(imageUrl).then(ok => {
				console.log('[VenusEditor] copyImageToClipboard result from copySelection:', ok);
			}).catch(err => {
				console.error('[VenusEditor] copyImageToClipboard error from copySelection:', err);
			});
			return;
		}

		if(this.isMacOS()) {
			try {
				const plain = this.notesEditor().getText(range.index, range.length);
				let html = '';
				try {
					html = this.notesEditor().getSemanticHTML(range.index, range.length);
					html = this.cleanHtmlForClipboard(html);
				} catch { }
				safeInvoke(this.dotNetHelper, 'SetClipboardFromEditor', [plain, html]);
				return;
			} catch { /* fallback below */ }
		}
		document.execCommand('copy');
	}

	private cutSelection(): void {
		if(this.cutTableSelection()) return;

		const range = this.getSelectionWithFallback();
		if(!range || range.length === 0) return;
		if(this.isMacOS()) {
			try {
				const plain = this.notesEditor().getText(range.index, range.length);
				let html = '';
				try {
					html = this.notesEditor().getSemanticHTML(range.index, range.length);
					html = this.cleanHtmlForClipboard(html);
				} catch { }
				safeInvoke(this.dotNetHelper, 'SetClipboardFromEditor', [plain, html]);
				this.notesEditor().deleteText(range.index, range.length, 'user');
				return;
			} catch { /* fallback below */ }
		}
		document.execCommand('cut');
	}

	private copyAsPlainText(): void {
		const range = this.getSelectionWithFallback();
		if (!range) return;
		
		const text = this.notesEditor().getText(range.index, range.length);
		navigator.clipboard.writeText(text);
	}

	private copyAsMarkdown(): void {
		// Get the selected content as quill delta and send it to Blazor for conversion
		const range = this.getSelectionWithFallback();
		if (!range) return;
		
		const quillDelta = this.notesEditor().getContents(range.index, range.length);
		safeInvoke(this.dotNetHelper, 'CopyAsMarkdown', [JSON.stringify(quillDelta)]);
	}

	private copyAsHtmlSource(): void {
		const range = this.getSelectionWithFallback();
		if(!range) return;
		
		let html = this.notesEditor().getSemanticHTML(range.index, range.length);
		html = this.removeMentionSpansAndConvertRelativeLinks(html);
		navigator.clipboard.writeText(html);
	}

	/**
	 * Cleans HTML for clipboard export by replacing &nbsp; with regular spaces.
	 * This fixes issues where apps like Obsidian interpret &nbsp; as line breaks.
	 */
	private cleanHtmlForClipboard(html: string): string {
		if(!html) return html;
		// getSemanticHTML outputs &nbsp; for all spaces - replace with regular spaces
		return html.replace(/&nbsp;/g, ' ');
	}

	private removeMentionSpansAndConvertRelativeLinks(html: string): string {

		// getSemanticHTML outputs &nbsp; for all spaces - fix this
		html = html.replace(/&nbsp;/g, ' ');
		
		// Create a temporary div to properly parse and manipulate the HTML
		const tempDiv = document.createElement('div');
		tempDiv.innerHTML = html;
		
		// Remove hashes stored on line elements
		const processedHashElements = tempDiv.querySelectorAll('[data-processed-hash]');
		processedHashElements.forEach(element => {
			element.removeAttribute('data-processed-hash');
		});
		
		// Remove all spans with data-mention-status attribute
		const mentionStatusSpans = tempDiv.querySelectorAll('span[data-mention-status]');
		mentionStatusSpans.forEach(span => {
			// Replace the span with its text content
			const textNode = document.createTextNode(span.textContent || '');
			span.parentNode?.replaceChild(textNode, span);
		});
		
		// Remove all spans with data-mention attribute  
		const mentionSpans = tempDiv.querySelectorAll('span[data-mention]');
		mentionSpans.forEach(span => {
			// Replace the span with its text content
			const textNode = document.createTextNode(span.textContent || '');
			span.parentNode?.replaceChild(textNode, span);
		});
		
		// Convert relative links to absolute links
		const links = tempDiv.querySelectorAll('a[href]');
		links.forEach(link => {
			const href = link.getAttribute('href');
			if (href && href.startsWith('/')) {
				link.setAttribute('href', 'https://app.thebrain.com' + href);
			}
		});
		
		return tempDiv.innerHTML;
	}

	private pasteViaCommand(): void {

		// NOTE: This method is called from Blazor when the use the context menu Paste command
		// There is another paste method that is called from the Quill paste event handler, that one is used for responding to Ctrl+V or Cmd+V

		// On Dekutron, trigger a native paste so it goes through the same capture-phase
		// paste listener as Cmd+V. This ensures images, files, and text are all handled
		// identically regardless of whether the user used the keyboard or context menu.
		if(this.editorSettings.isDeku) {
			this.notesEditor().focus();
			document.execCommand('paste');
			return;
		}

		this.pasteViaCommandInternal();
	}

	// Used by Vulcan (web client) where document.execCommand('paste') is blocked by browsers.
	// On Dekutron, pasteViaCommand() uses execCommand('paste') instead, bypassing this method.
	private pasteViaCommandInternal(): void {
		// Check for internal table paste first
		if(this.copiedTableData) {
			navigator.clipboard.readText().then(text => {
				if(!this.pasteTableContent(text)) {
					this.pasteViaCommandInternalDefault();
				}
			}).catch(() => {
				this.pasteViaCommandInternalDefault();
			});
			return;
		}
		this.pasteViaCommandInternalDefault();
	}

	private pasteViaCommandInternalDefault(): void {
		navigator.clipboard.read().then(items => {
			for(const item of items) {
				if(item.types.includes('text/html')) {
					item.getType('text/html').then(blob => {
						blob.text().then(html => {
							
							const delta = QuillExtensions.convertHtmlToDelta(html);

							if(this.editorSettings.pasteWithoutFormattingAsDefault || this.editorSettings.excludeColorInformationWhenPasting || this.editorSettings.excludeFontInformationWhenPasting) {
								// Remove formatting as per settings
								delta.ops.forEach((op: any) => {
									if(op.attributes) {
										if(this.editorSettings.pasteWithoutFormattingAsDefault) {
											// Strip ALL formatting
											delete op.attributes;
										} else {
											// Strip only specific formatting based on settings
											if(this.editorSettings.excludeColorInformationWhenPasting) {
												delete op.attributes.color;
												delete op.attributes.background;
											}
											if(this.editorSettings.excludeFontInformationWhenPasting) {
												delete op.attributes.font;
												delete op.attributes.size;
											}
										}
									}
								});
							}

							const selection = this.getSelectionWithFallback();
							if(!selection) return;
							const index = selection.index;
							delta.ops.unshift({ retain: index });

							this.notesEditor().updateContents(delta);
						});
					});
					return;
				}
				if(item.types.includes('text/plain')) {
					item.getType('text/plain').then(blob => {
						blob.text().then(text => {
							const range = this.getSelectionWithFallback();
							if(!range) return;

							// Convert markdown to formatted text when pasting in styled markdown mode
							if(this.editorSettings.defaultEditMode === EditorMode.StyledMarkdown &&
							   !this.editorSettings.pasteWithoutFormattingAsDefault) {
								// Check if pasting copied thoughts - convert to markdown links
								safeInvokeAsync<string>(this.dotNetHelper, 'GetThoughtMarkdownIfMatch', [text]).then((thoughtMarkdown) => {
									// Use thought markdown if available, otherwise use original text
									const textToConvert = thoughtMarkdown || text;

									// Convert markdown to Quill delta asynchronously
									safeInvokeAsync<string>(this.dotNetHelper, 'ConvertMarkdownToDelta', [textToConvert]).then((deltaJson) => {
									if(deltaJson) {
										try {
											const delta = JSON.parse(deltaJson);

											// Delete selected text if any
											if(range.length > 0) {
												this.notesEditor().deleteText(range.index, range.length, 'user');
											}

											// Insert the converted markdown delta
											delta.ops.unshift({ retain: range.index });
											this.notesEditor().updateContents(delta, 'user');

											// Set cursor after inserted content
											const insertLength = delta.ops.reduce((len: number, op: any) =>
												len + (op.insert ? (typeof op.insert === 'string' ? op.insert.length : 1) : 0), 0);
											this.notesEditor().setSelection(range.index + insertLength, 0, 'user');
										} catch(ex) {
											console.error('Failed to parse markdown delta:', ex);
											// Fallback to plain text insert
											this.notesEditor().deleteText(range.index, range.length);
											this.notesEditor().insertText(range.index, text, 'user');
										}
									} else {
										// Conversion failed, insert as plain text
										this.notesEditor().deleteText(range.index, range.length);
										this.notesEditor().insertText(range.index, text, 'user');
									}
									});
								});
							} else {
								// Not in markdown mode or paste without formatting enabled - insert as plain text
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
	
	private pasteWithoutFormatting(): void {
		navigator.clipboard.readText().then(text => {
			const range = this.getSelectionWithFallback();
			if(range) {
				this.notesEditor().deleteText(range.index, range.length);
				this.notesEditor().insertText(range.index, text, 'user');
				this.notesEditor().setSelection(range.index + text.length, 0);
			}
		});
	}

	public insertPlainText(text: string, detectMarkdown: boolean): void {
		if(!this.notesEditor()) return;
		const range = this.getSelectionWithFallback();
		if(range) {
			if(detectMarkdown) {
				const textToConvert = text + '\n';
				// This entry point is used by the C# NotesPasteWithoutFormattingCommand
				// (the "Paste Without Formatting" context-menu / native-menu command), so
				// skip the URL→title auto-replacement: the user explicitly asked for raw paste.
				this.insertMarkdownAsDelta(this.notesEditor(), textToConvert, text, text, range, /* skipUrlAutoReplacement */ true);
			} else {
				this.notesEditor().deleteText(range.index, range.length);
				this.notesEditor().insertText(range.index, text, 'user');
				this.notesEditor().setSelection(range.index + text.length, 0);
			}
		}
	}

	private selectAll(): void {
		this.notesEditor().setSelection(0, this.notesEditor().getLength());
	}

	private copyFormatting(): void {
		const range = this.getSelectionWithFallback();
		if(!range || range.length === 0) return;

		// Get the formatting from the current selection
		const allFormats = this.notesEditor().getFormat(range.index, range.length);

		// Separate inline formats from line formats
		const inlineFormats: any = {};
		const lineFormats: any = {};

		for(const key in allFormats) {
			if(VenusEditor.lineFormatKeys.includes(key)) {
				lineFormats[key] = allFormats[key];
			} else {
				inlineFormats[key] = allFormats[key];
			}
		}

		this.copiedFormatting = { inlineFormats, lineFormats };
	}

	/**
	 * Checks if the selection contains only an image (no other content).
	 * Returns the image URL if true, null otherwise.
	 */
	private getSelectedImageUrl(quill: any, selection: { index: number; length: number }): string | null {
		if(!selection || selection.length === 0) return null;

		const delta = quill.getContents(selection.index, selection.length);
		if(!delta || !delta.ops) return null;

		// Check if the delta contains exactly one image and nothing else
		// The delta should have one op with an image insert, possibly followed by a newline
		let imageUrl: string | null = null;
		let hasOtherContent = false;

		for(const op of delta.ops) {
			if(typeof op.insert === 'object' && op.insert.image) {
				if(imageUrl !== null) {
					// More than one image
					hasOtherContent = true;
					break;
				}
				imageUrl = op.insert.image;
			} else if(typeof op.insert === 'string') {
				// Allow trailing newline only
				if(op.insert !== '\n') {
					hasOtherContent = true;
					break;
				}
			} else if(op.insert) {
				// Some other embed type
				hasOtherContent = true;
				break;
			}
		}

		return hasOtherContent ? null : imageUrl;
	}

	/**
	 * Copies an image to the clipboard by fetching it as a blob.
	 * Returns true if successful, false otherwise.
	 */
	private async copyImageToClipboard(imageUrl: string): Promise<boolean> {
		try {
			console.log('[VenusEditor] copyImageToClipboard: fetching image url:', imageUrl.substring(0, 100));
			const response = await fetch(imageUrl);
			if(!response.ok) {
				console.error('[VenusEditor] copyImageToClipboard: fetch failed, status:', response.status, response.statusText);
				return false;
			}

			const blob = await response.blob();
			console.log('[VenusEditor] copyImageToClipboard: fetched blob, type:', blob.type, 'size:', blob.size);

			// Determine the MIME type - use image/png as fallback for ClipboardItem compatibility
			let mimeType = blob.type;
			if(!mimeType || !mimeType.startsWith('image/')) {
				mimeType = 'image/png';
			}

			// Convert to PNG if needed (required for both native and Web Clipboard API)
			let pngBlob = blob;
			if(mimeType !== 'image/png') {
				console.log('[VenusEditor] copyImageToClipboard: converting from', mimeType, 'to PNG via canvas');
				// Use createElement instead of new Image() because Quill overrides the Image constructor
				const img = document.createElement('img');
				img.crossOrigin = 'anonymous';

				const loadPromise = new Promise<HTMLImageElement>((resolve, reject) => {
					img.onload = () => resolve(img);
					img.onerror = reject;
				});

				img.src = imageUrl;
				await loadPromise;

				const canvas = document.createElement('canvas');
				canvas.width = img.naturalWidth;
				canvas.height = img.naturalHeight;
				const ctx = canvas.getContext('2d');
				if(!ctx) {
					console.error('[VenusEditor] copyImageToClipboard: failed to get canvas 2d context');
					return false;
				}
				ctx.drawImage(img, 0, 0);

				pngBlob = await new Promise<Blob>((resolve, reject) => {
					canvas.toBlob(b => b ? resolve(b) : reject(new Error('Canvas toBlob failed')), 'image/png');
				});
				console.log('[VenusEditor] copyImageToClipboard: converted to PNG, size:', pngBlob.size);
			}

			// Try native clipboard via .NET interop first (required for Electron/Dekutron)
			console.log('[VenusEditor] copyImageToClipboard: dotNetHelper available:', !!this.dotNetHelper);
			if(this.dotNetHelper) {
				try {
					const arrayBuffer = await pngBlob.arrayBuffer();
					const bytes = new Uint8Array(arrayBuffer);
					console.log('[VenusEditor] copyImageToClipboard: converting', bytes.byteLength, 'bytes to base64');
					// Convert to base64 via FileReader to avoid O(n²) string concatenation
					const base64: string = await new Promise((resolve, reject) => {
						const reader = new FileReader();
						reader.onloadend = () => {
							const dataUrl = reader.result as string;
							resolve(dataUrl.substring(dataUrl.indexOf(',') + 1));
						};
						reader.onerror = reject;
						reader.readAsDataURL(pngBlob);
					});
					console.log('[VenusEditor] copyImageToClipboard: calling SetClipboardImageFromEditor, base64 length:', base64.length);
					const success = await safeInvokeAsync<boolean>(this.dotNetHelper, 'SetClipboardImageFromEditor', [base64]);
					console.log('[VenusEditor] copyImageToClipboard: SetClipboardImageFromEditor returned:', success);
					if(success) return true;
				} catch(ex) {
					console.error('[VenusEditor] copyImageToClipboard: .NET interop failed:', ex);
					// Fall through to Web Clipboard API
				}
			}

			// Fall back to Web Clipboard API
			console.log('[VenusEditor] copyImageToClipboard: falling back to navigator.clipboard.write');
			await navigator.clipboard.write([
				new ClipboardItem({ 'image/png': pngBlob })
			]);
			console.log('[VenusEditor] copyImageToClipboard: navigator.clipboard.write succeeded');
			return true;
		} catch(ex) {
			console.error('[VenusEditor] copyImageToClipboard: top-level error:', ex);
			return false;
		}
	}

	private pasteFormatting(): void {
		if(!this.copiedFormatting) return;

		const range = this.getSelectionWithFallback();
		if(!range || range.length === 0) return;

		const editor = this.notesEditor();

		this.withSelectionPreserved(() => {
			// Apply inline formats to the text
			if(Object.keys(this.copiedFormatting!.inlineFormats).length > 0) {
				editor.formatText(range.index, range.length, this.copiedFormatting!.inlineFormats, 'user');
			}

			// Apply line formats to all lines in the selection
			if(Object.keys(this.copiedFormatting!.lineFormats).length > 0) {
				const lines = editor.getLines(range.index, range.length);
				for(const line of lines) {
					const lineIndex = editor.getIndex(line);
					for(const formatKey in this.copiedFormatting!.lineFormats) {
						editor.formatLine(lineIndex, 1, formatKey, this.copiedFormatting!.lineFormats[formatKey], 'user');
					}
				}
			}
		});
	}

	public isCommandChecked(command: string): boolean {
		if(!this.notesEditor()) return false;

		if(command.startsWith('Notes.Formatting.') || command.startsWith('VenusEditor.')) {
			const formatType = command
				.replace('Notes.Formatting.', '')
				.replace('VenusEditor.', '')
				.toLowerCase();
			const range = this.getSelectionWithFallback();
			if(!range) return false;

			const currentFormats = this.notesEditor().getFormat(range.index, range.length);
			switch(formatType) {
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

		if(command.startsWith('Notes.ParagraphFormatting.')) {
			const style = command.replace('Notes.ParagraphFormatting.', '').toLowerCase();
			const range = this.getSelectionWithFallback();
			if(!range) return false;

			const currentFormats = this.notesEditor().getFormat(range.index, range.length);
				switch(style) {
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

	// Called from Blazor
	public setTextAlign(alignment: string): void {
		if(!this.notesEditor()) return;

		const range = this.getSelectionWithFallback();
		if(!range) return;

		if(alignment === "left") {
			this.notesEditor().format('align', false, 'user');
		}

		this.notesEditor().format('align', alignment, 'user');
	}
	
	// Helper method to get table context for current active cell
	private getTableContext(): { table: HTMLTableElement, rowIndex: number, columnIndex: number, rowCount: number, columnCount: number } | null {

		// Fall back to lastActiveTable when focus has moved to toolbar/menu
		const table = this.getActiveTable() || this.lastActiveTable;

		if(!table) {
			return null;
		}

		let rowCount = 1;
		let columnCount = 1;
		
		// If there is a cell selection, use the top left corner cell to determine the row and column
		const ts = TableBlot.getTableSelection(table);
		if(ts.startRow !== -1 && ts.startCol != -1) {
			if(ts.endRow !== ts.startRow) {
				rowCount = Math.abs(ts.startRow - ts.endRow) + 1;
			}
			if(ts.endCol !== ts.startCol) {
				columnCount = Math.abs(ts.startCol - ts.endCol) + 1;
			}
			const rowIndex = Math.min(ts.startRow, ts.endRow);
			const columnIndex = Math.min(ts.startCol, ts.endCol);
			return { table, rowIndex, columnIndex, rowCount, columnCount };
		}
		
		// No cell selection, use the active or last active cell
		const cellId = this.tableState.activeCellId || this.tableState.lastActiveCellId;
		if(!cellId) {
			return null;
		}
		const cellElement = document.getElementById(cellId) as HTMLTableCellElement;
		if(!cellElement) {
			return null; // No active cell found
		}
		
		const row = cellElement.parentElement as HTMLTableRowElement;
		const rowIndex = Array.from(table.rows).indexOf(row);
		const columnIndex = Array.from(row.cells).indexOf(cellElement);

		return { table, rowIndex, columnIndex, rowCount, columnCount };
	}

	private deleteColumn(): void {
		const context = this.getTableContext();
		if(!context || context.columnIndex < 0) return;

		// Single compound so N deletes collapse to one undo entry and one rebuild.
		TableBlot.performUndoableOperation(context.table, () => {
			for(let i = 0; i < context.columnCount; i++) {
				TableBlot.deleteColumn(context.table, context.columnIndex);
			}
		});

		// Select adjacent column: prefer left, fallback to right
		const firstRow = context.table.rows[0];
		if(firstRow && firstRow.cells.length > 0) {
			const newColIndex = Math.min(context.columnIndex, firstRow.cells.length - 1);
			const newCol = Math.max(0, newColIndex > 0 ? context.columnIndex - 1 : 0);
			const startCell = context.table.rows[0]?.cells[newCol] ?? null;
			const lastRow = context.table.rows[context.table.rows.length - 1];
			const endCell = lastRow?.cells[newCol] ?? null;
			if(startCell && endCell) {
				TableBlot.setTableSelection(context.table, startCell, endCell);
			}
		}
	}

	private deleteRow(): void {
		const context = this.getTableContext();
		if(!context || context.rowIndex < 0) return;

		// Single compound so N deletes collapse to one undo entry and one rebuild.
		TableBlot.performUndoableOperation(context.table, () => {
			for(let i = 0; i < context.rowCount; i++) {
				TableBlot.deleteRow(context.table, context.rowIndex);
			}
		});

		// Select adjacent row: prefer above, fallback to below
		if(context.table.rows.length > 0) {
			const newRowIndex = Math.min(context.rowIndex, context.table.rows.length - 1);
			const newRow = Math.max(0, newRowIndex > 0 ? context.rowIndex - 1 : 0);
			const row = context.table.rows[newRow];
			if(row) {
				const startCell = row.cells[0] ?? null;
				const endCell = row.cells[row.cells.length - 1] ?? null;
				if(startCell && endCell) {
					TableBlot.setTableSelection(context.table, startCell, endCell);
				}
			}
		}
	}


	private duplicateRow(): void {
		const context = this.getTableContext();
		if(!context || context.rowIndex < 0) return;

		// Save selection before duplication
		const selectionStartCell = TableBlot.getSelectionStartCell(context.table);
		const selectionEndCell = TableBlot.getSelectionEndCell(context.table);

		// Single compound: one undo entry and one rebuild for the whole duplicate-and-reorder sweep.
		TableBlot.performUndoableOperation(context.table, () => {
			for(let i = 0; i < context.rowCount; i++) {
				const toDupe = context.rowIndex + i;
				TableBlot.duplicateRow(context.table, toDupe);
				// Move the duplicated row down so duplicates stay in order.
				for(let j = 0; j < context.rowCount - 1; j++) {
					TableBlot.moveRow(context.table, toDupe + 1 + j, 1);
				}
			}
		});

		// Restore selection to the original cells
		if(selectionStartCell && selectionEndCell) {
			TableBlot.setTableSelection(context.table, selectionStartCell, selectionEndCell);
		}
	}

	private duplicateColumn(): void {
		const context = this.getTableContext();
		if(!context || context.columnIndex < 0) return;

		// Save selection before duplication
		const selectionStartCell = TableBlot.getSelectionStartCell(context.table);
		const selectionEndCell = TableBlot.getSelectionEndCell(context.table);

		// Single compound: one undo entry and one rebuild for the whole duplicate-and-reorder sweep.
		TableBlot.performUndoableOperation(context.table, () => {
			for(let i = 0; i < context.columnCount; i++) {
				const toDupe = context.columnIndex + i;
				TableBlot.duplicateColumn(context.table, toDupe);
				// Move the duplicated column right so duplicates stay in order.
				for(let j = 0; j < context.columnCount - 1; j++) {
					TableBlot.moveColumn(context.table, toDupe + 1 + j, 1);
				}
			}
		});

		// Restore selection to the original cells
		if(selectionStartCell && selectionEndCell) {
			TableBlot.setTableSelection(context.table, selectionStartCell, selectionEndCell);
		}
	}

	private moveRow(direction: number): void {
		const context = this.getTableContext();
		if(!context || context.rowIndex < 0) return;

		// Save the selection start and end cells before moving so we can restore the selection later
		const selectionStartCell = TableBlot.getSelectionStartCell(context.table);
		const selectionEndCell = TableBlot.getSelectionEndCell(context.table);

		if(context.rowCount > 1) {
			// Check bounds for multi-row selection
			if(direction > 0) {
				// Moving down: check if last selected row is already the last row in table
				if(context.rowIndex + context.rowCount - 1 >= context.table.rows.length - 1) {
					return; // Already at bottom
				}
			} else {
				// Moving up: check if first selected row is already the first row
				if(context.rowIndex <= 0) {
					return; // Already at top
				}
			}

			// Batch all row moves so setupTableControls/reapplyFormats only run once
			TableBlot.performUndoableOperation(context.table, () => {
				// Move the row outside the selection in the opposite direction
				if(direction > 0) {
					// Moving selection down: move the row after the selection up (in opposite direction)
					const outsideRowIndex = context.rowIndex + context.rowCount;
					for(let i = 0; i < context.rowCount; i++) {
						TableBlot.moveRow(context.table, outsideRowIndex - i, -1);
					}
				} else {
					// Moving selection up: move the row before the selection down (in opposite direction)
					const outsideRowIndex = context.rowIndex - 1;
					for(let i = 0; i < context.rowCount; i++) {
						TableBlot.moveRow(context.table, outsideRowIndex + i, 1);
					}
				}
			});
		} else {
			TableBlot.moveRow(context.table, context.rowIndex, direction);
		}
		
		if(selectionStartCell !== null && selectionEndCell !== null) {
			// Restore the selection to the same start and end cells
			TableBlot.setTableSelection(context.table, selectionStartCell, selectionEndCell);
		}
	}

	private moveColumn(direction: number): void {
		const context = this.getTableContext();
		if(!context || context.columnIndex < 0) return;

		// Save the selection start and end cells before moving so we can restore the selection later
		const selectionStartCell = TableBlot.getSelectionStartCell(context.table);
		const selectionEndCell = TableBlot.getSelectionEndCell(context.table);

		if(context.columnCount > 1) {
			// Check bounds for multi-column selection
			const firstRow = context.table.rows[0];
			if(!firstRow) return;

			if(direction > 0) {
				// Moving right: check if last selected column is already the last column
				if(context.columnIndex + context.columnCount - 1 >= firstRow.cells.length - 1) {
					return; // Already at rightmost
				}
			} else {
				// Moving left: check if first selected column is already the first column
				if(context.columnIndex <= 0) {
					return; // Already at leftmost
				}
			}

			// Batch all column moves so setupTableControls/reapplyFormats only run once
			TableBlot.performUndoableOperation(context.table, () => {
				// Move the column outside the selection in the opposite direction
				if(direction > 0) {
					// Moving selection right: move the column after the selection left (in opposite direction)
					const outsideColumnIndex = context.columnIndex + context.columnCount;
					for(let i = 0; i < context.columnCount; i++) {
						TableBlot.moveColumn(context.table, outsideColumnIndex - i, -1);
					}
				} else {
					// Moving selection left: move the column before the selection right (in opposite direction)
					const outsideColumnIndex = context.columnIndex - 1;
					for(let i = 0; i < context.columnCount; i++) {
						TableBlot.moveColumn(context.table, outsideColumnIndex + i, 1);
					}
				}
			});
		} else {
			TableBlot.moveColumn(context.table, context.columnIndex, direction);
		}

		if(selectionStartCell !== null && selectionEndCell !== null) {
			// Restore the selection to the same start and end cells
			TableBlot.setTableSelection(context.table, selectionStartCell, selectionEndCell);
		}
	}

	private moveCell(colDelta: number, rowDelta: number): void {
		const context = this.getTableContext();
		if(!context) return;

		const firstRow = context.table.rows[0];
		if(!firstRow) return;
		const totalRows = context.table.rows.length;
		const totalCols = firstRow.cells.length;

		// Bounds check: ensure the entire selection can move in the given direction
		if(rowDelta < 0 && context.rowIndex + rowDelta < 0) return;
		if(rowDelta > 0 && context.rowIndex + context.rowCount - 1 + rowDelta >= totalRows) return;
		if(colDelta < 0 && context.columnIndex + colDelta < 0) return;
		if(colDelta > 0 && context.columnIndex + context.columnCount - 1 + colDelta >= totalCols) return;

		// Iterate in the opposite direction of the move to avoid overwriting
		const rowStart = rowDelta > 0 ? context.rowIndex + context.rowCount - 1 : context.rowIndex;
		const rowEnd = rowDelta > 0 ? context.rowIndex - 1 : context.rowIndex + context.rowCount;
		const rowStep = rowDelta > 0 ? -1 : 1;

		const colStart = colDelta > 0 ? context.columnIndex + context.columnCount - 1 : context.columnIndex;
		const colEnd = colDelta > 0 ? context.columnIndex - 1 : context.columnIndex + context.columnCount;
		const colStep = colDelta > 0 ? -1 : 1;

		// Wrap all swaps in a single batch so setupTableControls/reapplyFormats/flush
		// only run once at the end, not per cell.
		TableBlot.performUndoableOperation(context.table, () => {
			for(let r = rowStart; r !== rowEnd; r += rowStep) {
				for(let c = colStart; c !== colEnd; c += colStep) {
					TableBlot.swapCells(context.table, r, c, r + rowDelta, c + colDelta, this.tableState);
				}
			}
		});

		// Update selection to follow the moved content. swapCells swaps innerHTML
		// so the <td> elements stay in place — select the cells at the new position.
		const newStartRow = context.rowIndex + rowDelta;
		const newStartCol = context.columnIndex + colDelta;
		const newEndRow = newStartRow + context.rowCount - 1;
		const newEndCol = newStartCol + context.columnCount - 1;
		const newStartCell = context.table.rows[newStartRow]?.cells[newStartCol] ?? null;
		const newEndCell = context.table.rows[newEndRow]?.cells[newEndCol] ?? null;
		TableBlot.setTableSelection(context.table, newStartCell, newEndCell);
	}

	private splitTable(): void {
		const context = this.getTableContext();
		if(!context || context.rowIndex <= 0) return;

		TableBlot.splitTable(context.table, context.rowIndex, this.tableState, this.primaryNotesEditor);

		this.safeSetTimeout(() => {
			this.registerTablesWithEditor();
		}, 0);
	}

	private applyAlignmentToCells(table: HTMLTableElement, cells: HTMLElement[], alignment: string): void {
		const value = alignment === 'left' ? false : alignment;
		const formats: Record<string, any> = { align: value };

		const selectionStartCell = TableBlot.getSelectionStartCell(table);
		const selectionEndCell = TableBlot.getSelectionEndCell(table);

		this.removeTableControlsFromTable(table);
		cells.forEach(cell => {
			if(cell.id === this.tableState.activeCellId) {
				const cellQuill = this.tableState.editorCache[cell.id]!.quill;
				cellQuill.formatText(0, cellQuill.getLength(), formats);
			} else {
				const newHtml = QuillExtensions.applyFormattingToHtml(cell.innerHTML, formats);
				cell.innerHTML = newHtml;
			}
		});
		TableBlot.setupTableControls(table);
		TableBlot.setTableSelection(table, selectionStartCell, selectionEndCell);
	}

	private justifyCells(alignment: string): void {
		const context = this.getTableContext();
		if(!context) return;

		const table = context.table;
		let cells: HTMLElement[];

		if(this.areCellsSelected()) {
			cells = Array.from(TableBlot.getSelectedCells(table));
		} else if(this.tableState.activeCellId) {
			const cached = this.tableState.editorCache[this.tableState.activeCellId];
			if(cached?.cellElement) cells = [cached.cellElement];
			else return;
		} else {
			return;
		}

		this.applyAlignmentToCells(table, cells, alignment);
	}

	private justifyRow(alignment: string): void {
		const context = this.getTableContext();
		if(!context) return;

		const rows = context.table.querySelectorAll('tr');
		const cells: HTMLElement[] = [];
		for(let r = context.rowIndex; r < context.rowIndex + context.rowCount; r++) {
			const row = rows[r];
			if(row) {
				row.querySelectorAll('td').forEach(td => cells.push(td as HTMLElement));
			}
		}
		this.applyAlignmentToCells(context.table, cells, alignment);
	}

	private justifyColumn(alignment: string): void {
		const context = this.getTableContext();
		if(!context) return;

		const cells: HTMLElement[] = [];
		context.table.querySelectorAll('tr').forEach(row => {
			const tds = row.querySelectorAll('td');
			for(let c = context.columnIndex; c < context.columnIndex + context.columnCount; c++) {
				if(tds[c]) cells.push(tds[c] as HTMLElement);
			}
		});
		this.applyAlignmentToCells(context.table, cells, alignment);
	}

	private justifyTable(justification: 'left' | 'center' | 'right'): void {
		const context = this.getTableContext();
		if(!context) return;

		const blot = Quill.find(context.table);
		if(!blot) return;
		const index = this.primaryNotesEditor.getIndex(blot);
		if(index === -1) return;

		const value = justification === 'left' ? null : justification;
		// Table-level formats don't shift content length, so Quill keeps the outer
		// cursor naturally. Same rationale as applyTableTheme.
		this.primaryNotesEditor.formatText(index, 1, { 'table-justification': value }, 'user');
	}

	private mergeTables(direction: 'above' | 'below'): void {
		const context = this.getTableContext();
		if(!context) return;

		TableBlot.mergeTables(context.table, direction, this.tableState, this.primaryNotesEditor);

		this.safeSetTimeout(() => {
			this.registerTablesWithEditor();
		}, 0);
	}

	private adjustListIndent(delta: number): boolean {
		const editor = this.notesEditor();
		if(!editor) {
			return false;
		}

		const range = this.getSelectionWithFallback();
		if(!range) {
			return false;
		}

		this.refreshOutline();

		const targetIds = this.getListBlocksInRange(range).map(block => block.id);
		if(targetIds.length === 0) {
			return false;
		}

		const caretIndex = range.index;
		const selectionLength = range.length;

		let changed = false;
		for(const blockId of targetIds) {
			let block = this.getBlockById(blockId);
			if(!block) {
				continue;
			}

			let blockStartIndex = this.getBlockSpanIncludingDescendants(block).start;
			const originalSpan = this.getBlockSpanIncludingDescendants(block);
			const caretInsideBlock = caretIndex >= originalSpan.start && caretIndex <= originalSpan.end;

			if(delta < 0) {
				const newStart = this.ensureBlockReadyForOutdent(block);
				if(newStart !== null) {
					blockStartIndex = newStart;
					this.refreshOutline();
					block = this.getOutlineBlockForIndex(blockStartIndex) ?? this.getBlockById(blockId);
					if(!block) {
						continue;
					}
				}
			}

			const spanBeforeIndent = this.getBlockSpanIncludingDescendants(block);
			const blockChanged = this.applyIndentToListBlock(editor, spanBeforeIndent.start, spanBeforeIndent.end - spanBeforeIndent.start, delta);
			changed = changed || blockChanged;
			if(blockChanged) {
				this.refreshOutline();
				block = this.getOutlineBlockForIndex(blockStartIndex) ?? this.getBlockById(blockId);
				if(!block) {
					continue;
				}
			}

			if(caretInsideBlock) {
				const updatedSpan = this.getBlockSpanIncludingDescendants(block);
				this.updateSelectionAfterStructuralChange(updatedSpan.start, selectionLength);
			}
		}

		if(changed) {
			this.refreshOutline();
		}
		return changed;
	}

	private applyIndentToListBlock(editor: any, start: number, length: number, delta: number): boolean {
		const lines = editor.getLines(start, Math.max(1, length));
		if(!lines || lines.length === 0) {
			return false;
		}
		const savedSelection = editor.getSelection();
		let updated = false;
		for(const line of lines) {
			const lineIndex = typeof editor.getIndex === 'function' ? editor.getIndex(line) : start;
			const lineLength = Math.max(1, typeof line.length === 'function' ? line.length() : 1);
			const formats = typeof line.formats === 'function' ? line.formats() : editor.getFormat(lineIndex, lineLength);
			if(!formats?.list) {
				continue;
			}
			const currentIndent = typeof formats.indent === 'number' ? formats.indent : 0;
			const nextIndent = Math.max(0, currentIndent + delta);
			if(nextIndent === currentIndent) {
				continue;
			}
			editor.formatLine(lineIndex, lineLength, 'indent', nextIndent, 'user');
			updated = true;
		}
		if(updated && savedSelection) {
			editor.setSelection(savedSelection.index, savedSelection.length, 'silent');
		}
		return updated;
	}

	private handleTabKey(range: any, context: any): boolean {
		if(!this.notesEditor()) return false;

		if(!range) return false;

		// Use default tab behavior anywhere within code blocks
		if(context.format['code-block']) {
			return false;
		}

		// If on a heading, increase the heading level (H1→H2, H2→H3, ..., H5→H6)
		if(context.format.header) {
			const currentLevel = context.format.header;
			if(currentLevel < 6) {
				this.notesEditor().format('header', currentLevel + 1, 'user');
				return true; // Prevent default tab behavior
			}
			// Already at H6, cannot go further - eat the keypress
			return false;
		}

		// If on a list item, increase the indent level
		if(context.format.list) {
			if(this.adjustListIndent(1)) {
				return false;
			}
			const currentIndent = context.format.indent || 0;
			this.notesEditor().format('indent', currentIndent + 1, 'user');
			return false; // Prevent default tab behavior
		}

		// Otherwise, insert a tab at the beginning of the current line
		const [line, offset] = this.notesEditor().getLine(range.index);
		if(line) {
			const startOfLine = range.index - offset; // position at start of this line
			this.notesEditor().insertText(startOfLine, '\t', 'user');
			// Optionally, move the cursor to just after the inserted tab
			this.notesEditor().setSelection(range.index + 1, 0, 'api');
		}

		return false;
	}

	private handleShiftTabKey(range: any, context: any): boolean {
		if(!this.notesEditor()) return false;

		if(!range) return false;

		// Use default shift-tab behavior anywhere within code blocks
		if(context.format['code-block']) {
			return false;
		}

		// If on a heading, decrease the heading level (H6→H5, H5→H4, ..., H2→H1)
		if(context.format.header) {
			const currentLevel = context.format.header;
			if(currentLevel > 1) {
				this.notesEditor().format('header', currentLevel - 1, 'user');
			}
			// Eat the keypress to prevent default shift-tab behavior (focus shift)
			return false;
		}

		// If on a list item, decrease the indent level
		if(context.format.list) {
			const currentIndent = context.format.indent || 0;
			if(currentIndent > 0) {
				if(this.adjustListIndent(-1)) {
					return false;
				}
				this.notesEditor().format('indent', currentIndent - 1, 'user');
			}
			return false; // Prevent default shift-tab behavior
		}

		// Otherwise, remove a tab at the beginning of the current line
		const [line, offset] = this.notesEditor().getLine(range.index);
		if(line) {
			const startOfLine = range.index - offset; // position at start of this line
			const textBefore = this.notesEditor().getText(startOfLine, 1);
			if(textBefore === '\t') {
				this.notesEditor().deleteText(startOfLine, 1);
			}
		}

		return false;
	}

	private handleShiftEnter(range: any): boolean {
		const editor = this.notesEditor();
		if(!editor || !range) return false;

		if(range.length > 0) {
			editor.deleteText(range.index, range.length, 'user');
		}

		// Check if the cursor is at the end of the block (the linebreak would be
		// trailing). Browsers don't render a trailing <br>, so we insert two
		// linebreaks in that case — the second acts as a placeholder.
		const [line, offset] = editor.getLine(range.index);
		const isEndOfBlock = line && offset === line.length() - 1;

		if(isEndOfBlock) {
			// Insert two linebreaks as a single delta operation for clean undo
			const Delta = Quill.import('delta');
			const delta = new Delta()
				.retain(range.index)
				.insert({linebreak: true})
				.insert({linebreak: true});
			editor.updateContents(delta, 'user');
		} else {
			editor.insertEmbed(range.index, 'linebreak', true, 'user');
		}

		editor.setSelection(range.index + 1, 0, 'silent');
		return false;
	}

	// Replicates Quill's default Enter behavior (including exit-list on empty list item)
	// so we can substitute it for Shift+Enter when iOS auto-shift makes Shift+Enter
	// indistinguishable from a plain Enter.
	private performPlainEnter(range: any): boolean {
		const editor = this.notesEditor();
		if(!editor || !range) {
			return false;
		}

		const [line, offset] = editor.getLine(range.index);
		const formats = editor.getFormat(range.index);
		const listValue = formats && formats.list;
		const isListLine = listValue === 'bullet' || listValue === 'ordered'
			|| listValue === 'checked' || listValue === 'unchecked';
		const isEmptyListItem = isListLine && line && line.length() === 1 && offset === 0;

		if(isEmptyListItem) {
			const indent = (formats && formats.indent) || 0;
			if(indent > 0) {
				editor.format('indent', indent - 1, 'user');
			} else {
				editor.format('list', false, 'user');
			}
			return false;
		}

		if(range.length > 0) {
			editor.deleteText(range.index, range.length, 'user');
		}
		editor.insertText(range.index, '\n', 'user');
		editor.setSelection(range.index + 1, 0, 'silent');
		return false;
	}

	public insertLineBreak(): void {
		const editor = this.notesEditor();
		if(!editor) {
			return;
		}
		const range = this.getSelectionWithFallback();
		if(!range) {
			return;
		}
		this.handleShiftEnter(range);
	}

	private moveLineUp(): boolean {
		this.enqueueLineMove(-1);
		return false;
	}

	private moveLineDown(): boolean {
		this.enqueueLineMove(1);
		return false;
	}

	private lineMoveQueue: number[] = [];
	private isProcessingLineMoveQueue = false;

	private enqueueLineMove(direction: number): void {
		this.lineMoveQueue.push(direction);
		if(this.isProcessingLineMoveQueue) {
			return;
		}
		this.isProcessingLineMoveQueue = true;
		const processNext = () => {
			if(this.lineMoveQueue.length === 0) {
				this.isProcessingLineMoveQueue = false;
				return;
			}
			const nextDirection = this.lineMoveQueue.shift();
			if(nextDirection === undefined) {
				this.isProcessingLineMoveQueue = false;
				return;
			}
			try {
				this.moveLinesCore(nextDirection);
			} catch(error) {
				console.error('Failed to move line', error);
			}
			if(this.lineMoveQueue.length === 0) {
				this.isProcessingLineMoveQueue = false;
				return;
			}
			requestAnimationFrame(processNext);
		};
		requestAnimationFrame(processNext);
	}

	private moveLinesCore(direction: number): boolean {
		const editor = this.restoreSavedSelection();
		if(!editor) {
			this.updateMoveLineCommandStates();
			return false;
		}

		const range = this.getSelectionWithFallback();
		if(!range) {
			this.updateMoveLineCommandStates();
			return false;
		}

		const documentLength = editor.getLength();
		if(documentLength <= 1) {
			this.updateMoveLineCommandStates();
			return false;
		}

		const startLineInfo = editor.getLine(range.index);
		const startLine = startLineInfo ? startLineInfo[0] : null;
		const startOffset = startLineInfo && typeof startLineInfo[1] === 'number' ? startLineInfo[1] : 0;
		if(!startLine) {
			this.updateMoveLineCommandStates();
			return false;
		}
		let blockStart = range.index - startOffset;

		let lastIndex = range.length > 0 ? range.index + range.length - 1 : range.index;
		if(lastIndex >= documentLength) {
			lastIndex = documentLength - 1;
		}

		const endLineInfo = editor.getLine(lastIndex);
		const endLine = endLineInfo ? endLineInfo[0] : null;
		const endOffset = endLineInfo && typeof endLineInfo[1] === 'number' ? endLineInfo[1] : 0;
		if(!endLine) {
			this.updateMoveLineCommandStates();
			return false;
		}

		let blockEnd = lastIndex - endOffset + endLine.length();
		let blockLength = blockEnd - blockStart;
		if(blockLength <= 0) {
			this.updateMoveLineCommandStates();
			return false;
		}

		const collapsedBlock = this.getCollapsedBlockAtIndex(range.index);
		const collapsedBlockId = collapsedBlock?.id ?? null;
		if(collapsedBlock) {
			const span = this.getDocumentSpanForBlock(collapsedBlock);
			if(span.end > span.start) {
				blockStart = span.start;
				blockEnd = span.end;
				blockLength = blockEnd - blockStart;
			}
		}
		let listSelectionInfo: { blocks: OutlineBlock[]; start: number; end: number } | null = null;
		if(!collapsedBlock) {
			listSelectionInfo = this.getListSelectionInfo(range);
			if(listSelectionInfo) {
				blockStart = listSelectionInfo.start;
				blockEnd = listSelectionInfo.end;
				blockLength = blockEnd - blockStart;
			}
		}

		if(direction < 0) {
			if(collapsedBlockId && collapsedBlock) {
				const prevSibling = this.getPreviousSiblingBlock(collapsedBlock);
				if(prevSibling) {
					const prevSpan = this.getDocumentSpanForBlock(prevSibling);
					const prevStart = prevSpan.start;
					const prevLength = prevSpan.end - prevSpan.start;
					if(prevLength <= 0) {
						this.updateMoveLineCommandStates();
						return false;
					}
					if(prevSpan.end === blockStart) {
						// Only treat blocks as direct siblings when no other content sits between them.
						const blockDelta = editor.getContents(blockStart, blockLength);
						const prevDelta = editor.getContents(prevStart, prevLength);

						let composedDelta = new Delta().retain(prevStart).delete(prevLength + blockLength);
						composedDelta = composedDelta.concat(blockDelta);
						composedDelta = composedDelta.concat(prevDelta);
						editor.updateContents(composedDelta, 'user');

						const newIndex = prevStart;
						editor.setSelection(newIndex, range.length, 'user');
						if(this.activeEditor === 'primary') {
							this.savedPrimarySelection = { index: newIndex, length: range.length };
						}
						this.reapplyCollapseStateAfterMove(collapsedBlockId, newIndex);
						this.updateMoveLineCommandStates();
						return true;
					}
				}
			}

			if(listSelectionInfo) {
				const firstBlock = listSelectionInfo.blocks[0];
				const prevListSibling = this.getPreviousSiblingBlock(firstBlock);
				if(prevListSibling && prevListSibling.type === 'list') {
					const prevSpan = this.getBlockSpanIncludingDescendants(prevListSibling);
					if(prevSpan.end === blockStart) {
						// Only treat blocks as direct siblings when no other content sits between them.
						const blockDelta = editor.getContents(blockStart, blockLength);
						const prevDelta = editor.getContents(prevSpan.start, prevSpan.end - prevSpan.start);

						let composedDelta = new Delta().retain(prevSpan.start).delete((prevSpan.end - prevSpan.start) + blockLength);
						composedDelta = composedDelta.concat(blockDelta);
						composedDelta = composedDelta.concat(prevDelta);
						editor.updateContents(composedDelta, 'user');
						this.refreshOutline(editor);

						const newIndex = prevSpan.start;
						editor.setSelection(newIndex, range.length, 'user');
						if(this.activeEditor === 'primary') {
							this.savedPrimarySelection = { index: newIndex, length: range.length };
						}
						this.updateMoveLineCommandStates();
						return true;
					}
				}
			}

			const prevIndex = blockStart - 1;
			if(prevIndex < 0) {
				this.updateMoveLineCommandStates();
				return false;
			}
			const prevLineInfo = editor.getLine(prevIndex);
			const prevLine = prevLineInfo ? prevLineInfo[0] : null;
			const prevOffset = prevLineInfo && typeof prevLineInfo[1] === 'number' ? prevLineInfo[1] : 0;
			if(!prevLine) {
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
			if(this.activeEditor === 'primary') {
				this.savedPrimarySelection = { index: newIndex, length: range.length };
			}
			if(collapsedBlockId) {
				this.reapplyCollapseStateAfterMove(collapsedBlockId, newIndex);
			}
			this.updateMoveLineCommandStates();
			return true;
		}

		if(direction > 0) {
			if(collapsedBlockId && collapsedBlock) {
				const nextSibling = this.getNextSiblingBlock(collapsedBlock);
				if(nextSibling) {
					const nextSpan = this.getDocumentSpanForBlock(nextSibling);
					const nextStart = nextSpan.start;
					const nextLength = nextSpan.end - nextSpan.start;
					if(nextLength <= 0) {
						this.updateMoveLineCommandStates();
						return false;
					}
					if(blockEnd === nextSpan.start) {
						// Only treat blocks as direct siblings when no other content sits between them.
						const blockDelta = editor.getContents(blockStart, blockLength);
						const nextDelta = editor.getContents(nextStart, nextLength);

						let composedDelta = new Delta().retain(blockStart).delete(blockLength + nextLength);
						composedDelta = composedDelta.concat(nextDelta);
						composedDelta = composedDelta.concat(blockDelta);
						editor.updateContents(composedDelta, 'user');

						const newIndex = blockStart + nextLength;
						editor.setSelection(newIndex, range.length, 'user');
						if(this.activeEditor === 'primary') {
							this.savedPrimarySelection = {index: newIndex, length: range.length};
						}
						this.reapplyCollapseStateAfterMove(collapsedBlockId, newIndex);
						this.updateMoveLineCommandStates();
						return true;
					}
				}
			}

			if(listSelectionInfo) {
				const lastBlock = listSelectionInfo.blocks[listSelectionInfo.blocks.length - 1];
				const nextListSibling = this.getNextSiblingBlock(lastBlock);
				if(nextListSibling && nextListSibling.type === 'list') {
					const nextSpan = this.getBlockSpanIncludingDescendants(nextListSibling);
					if(blockEnd === nextSpan.start) {
						// Only treat blocks as direct siblings when no other content sits between them.
						const blockDelta = editor.getContents(blockStart, blockLength);
						const nextDelta = editor.getContents(nextSpan.start, nextSpan.end - nextSpan.start);

						let composedDelta = new Delta().retain(blockStart).delete(blockLength + (nextSpan.end - nextSpan.start));
						composedDelta = composedDelta.concat(nextDelta);
						composedDelta = composedDelta.concat(blockDelta);
						editor.updateContents(composedDelta, 'user');
						this.refreshOutline(editor);

						const newIndex = blockStart + (nextSpan.end - nextSpan.start);
						editor.setSelection(newIndex, range.length, 'user');
						if(this.activeEditor === 'primary') {
							this.savedPrimarySelection = {index: newIndex, length: range.length};
						}
						if(collapsedBlockId) {
							this.setCollapseState(collapsedBlockId, true);
						}
						this.updateMoveLineCommandStates();
						return true;
					}
				}
			}

			const afterIndex = blockStart + blockLength;
			if(afterIndex >= documentLength) {
				this.updateMoveLineCommandStates();
				return false;
			}

			const nextLineInfo = editor.getLine(afterIndex);
			const nextLine = nextLineInfo ? nextLineInfo[0] : null;
			const nextOffset = nextLineInfo && typeof nextLineInfo[1] === 'number' ? nextLineInfo[1] : 0;
			if(!nextLine) {
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
			if(this.activeEditor === 'primary') {
				this.savedPrimarySelection = {index: newIndex, length: range.length};
			}
			if(collapsedBlockId) {
				this.reapplyCollapseStateAfterMove(collapsedBlockId, newIndex);
			}
			this.updateMoveLineCommandStates();
			return true;
		}

		return false;
	}

	private handleIndent(): boolean {
		if(!this.notesEditor()) return false;

		const range = this.getSelectionWithFallback();
		if(!range) return false;

		const currentFormat = this.notesEditor().getFormat();

		if(currentFormat.list) {
			const currentLevel = currentFormat.indent || 0;
			if(this.adjustListIndent(1)) {
				return false;
			}
			this.notesEditor().format('indent', currentLevel + 1, 'user');
		} else {
			// Otherwise, outdent should decrease the blockquote level
			const currentLevel = currentFormat.blockquote || 0;
			this.notesEditor().format('blockquote', currentLevel + 1, 'user');
		}

		return false;
	}

	private handleOutdent(): boolean {
		if(!this.notesEditor()) return false;

		const range = this.getSelectionWithFallback();
		if(!range) return false;

		const currentFormat = this.notesEditor().getFormat();

		if(currentFormat.list) {
			// We're in a list, outdent should decrease the list level
			const currentLevel = currentFormat.indent || 0;
			if(currentLevel > 0) {
				if(this.adjustListIndent(-1)) {
					return false;
				}
				this.notesEditor().format('indent', currentLevel - 1, 'user');
			}
		} else {
			// Otherwise, outdent should decrease the blockquote level
			const currentLevel = currentFormat.blockquote || 0;
			if(currentLevel > 0) {
				this.notesEditor().format('blockquote', currentLevel - 1, 'user');
			}
		}

		return false;
	}

	private toggleSpellcheck(): boolean {
		if(!this.notesEditor()) return false;

		if(this.editorSettings.isSpellCheckEnabled) {
			this.editorSettings.isSpellCheckEnabled = false;
			this.notesEditor().root.setAttribute('spellcheck', 'false');
		} else {
			this.editorSettings.isSpellCheckEnabled = true;
			this.notesEditor().root.setAttribute('spellcheck', 'true');
		}

		this.updateToolbarState();

		return false;

	}

	/**
	 * Insert an embed (divider, table-of-contents, etc.) at the cursor position
	 * Handles newline insertion if not on an empty line
	 */
	private insertEmbedAtCursor(embedType: string, embedValue: string, selectEmbedAfterInsert: boolean = false): boolean {
		if(!this.notesEditor()) return false;

		const range = this.getSelectionWithFallback();
		if(!range) return false;

		const editor = this.notesEditor();

		editor.history.cutoff();

		if(range.length > 0) {
			editor.deleteText(range.index, range.length, 'user');
		}

		const [line, offset] = editor.getLine(range.index);
		let isEmptyLine = false;
		if(line) {
			const lineStart = range.index - offset;
			const lineLength = line.length();
			// Walk Delta ops rather than getText() so an inline embed (e.g. a math
			// blot) on an otherwise-blank line isn't mistaken for an empty line —
			// getText() strips embeds entirely.
			const lineContents = editor.getContents(lineStart, lineLength);
			const hasContent = (lineContents.ops || []).some((op: any) => {
				if(typeof op.insert === 'string') {
					return op.insert.replace(/\n/g, '').length > 0;
				}
				return op.insert != null;
			});
			isEmptyLine = !hasContent;
		}

		let embedIndex = range.index;
		if(isEmptyLine) {
			editor.insertEmbed(range.index, embedType, embedValue, 'user');
		} else {
			editor.insertText(range.index, '\n', 'user');
			embedIndex = range.index + 1;
			editor.insertEmbed(embedIndex, embedType, embedValue, 'user');
		}

		if(selectEmbedAfterInsert) {
			editor.setSelection({index: embedIndex, length: 1}, 'user');
		} else {
			editor.setSelection(embedIndex + 1, 0);
		}

		editor.history.cutoff();

		return false;
	}

	private insertHorizontalRule(): boolean {
		return this.insertEmbedAtCursor('divider', 'hr');
	}

	private insertTableOfContents(): boolean {
		const result = this.insertEmbedAtCursor('table-of-contents', 'toc');

		// Update the TOC immediately after insertion
		this.safeSetTimeout(() => {
			this.updateTableOfContents();
		}, 0);

		return result;
	}

	private insertMathExpression(): boolean {
		const quill = this.notesEditor();
		if(!quill) return false;
		if(quill.options?.readOnly) return false;
		const range = this.getSelectionWithFallback();
		if(!range) return false;
		// Keep the cell editor alive across the dialog so notesEditor() still returns it when
		// insertMath fires on commit. Released in insertMath's finally or cancelMathDialog.
		this.acquireCellKeepAlive();
		const editorKind = this.getEditorKind(quill);
		const {x, y, width} = this.computeDialogAnchor(quill, range.index, range.length);
		// length=0 with isEditing=false signals an insert at the current cursor position.
		this.dotNetHelper.invokeMethodAsync('ShowMathDialog', '', editorKind, range.index, range.length, false, x, y, width);
		return false;
	}

	private getEditorKind(quill: any): string {
		return quill === this.cellNotesEditor ? 'cell' : 'primary';
	}

	private computeDialogAnchor(quill: any, index: number, length: number = 0): {x: number, y: number, width: number} {
		try {
			const bounds = quill.getBounds({index, length});
			const containerRect = quill.container.getBoundingClientRect();
			// Anchor to the visually centered note card (#contentAreaInner) rather than the
			// .ql-editor itself - the editor sits inside the card with asymmetric pl-1 pr-8
			// padding, so matching .ql-editor produces a dialog that looks off-center even
			// though it spans the editor's content area. Falling back to quill.root keeps the
			// behavior sensible for contexts that don't have the notes-section layout.
			const noteCard = document.getElementById('contentAreaInner');
			const anchorRect = (noteCard ?? quill.root ?? quill.container).getBoundingClientRect();
			// Inset 32px on each side so the dialog feels slightly narrower than the note
			// card without losing horizontal centering.
			const horizontalInset = 32;
			const width = Math.max(anchorRect.width - horizontalInset * 2, 0);
			return {
				x: anchorRect.left + horizontalInset,
				y: containerRect.top + bounds.bottom,
				width,
			};
		} catch {
			return {x: 0, y: 0, width: 0};
		}
	}

	public openMathDialogForBlot(quill: any, mathBlot: any, index: number): boolean {
		const mathNode = (mathBlot as any).domNode as HTMLElement;
		// Legacy stored sources used \t as a line-break sentinel (MathSourceNewlineChar) that
		// also rendered as a visible break. Decode each \t to `\\` + 4 spaces: the 4-space
		// step below then turns it into `\\\n` in the textarea, preserving both the visible
		// break and the user's line layout - exactly how a user authoring today would write
		// it. On save, the `\n` re-encodes to 4 spaces, yielding standard `\\` + soft newline.
		// Current sources encode user newlines as runs of 4 spaces (see insertMath).
		const latex = (mathNode?.getAttribute('data-math-source') ?? '')
			.replace(/\t/g, ' \\\\    ')
			.replace(/ {4}/g, '\n');
		const editorKind = this.getEditorKind(quill);
		// Paint the selection highlight synchronously before the dialog opens so the user
		// sees the "math selected" visual during the Blazor interop round-trip rather than
		// only after the dialog closes.
		this.enterMathHold(quill, mathBlot, index, null);
		// Keep-alive pairs with insertMath/cancelMathDialog. length=1 + isEditing=true targets the
		// existing blot for in-place update.
		this.acquireCellKeepAlive();
		const {x, y, width} = this.computeDialogAnchor(quill, index, 1);
		this.dotNetHelper.invokeMethodAsync('ShowMathDialog', latex, editorKind, index, 1, true, x, y, width);
		return true;
	}

	// Called by Blazor after math dialog save.
	private insertMath(latex: string, editorKind: string, index: number, length: number, isEditing: boolean): void {
		try {
			const quill = editorKind === 'cell' ? this.cellNotesEditor : this.primaryNotesEditor;
			if(!quill) return;

			// Source newlines are whitespace per LaTeX/MathJax convention, so storing them as
			// spaces keeps the persisted form valid LaTeX. We use 4 spaces as a soft sentinel
			// so the dialog can restore the user's line breaks on reopen - every renderer
			// collapses runs of spaces to one in math mode, so this is invisible to MathJax /
			// KaTeX / real LaTeX. Visible line breaks still require `\\` (inside an environment
			// or as a bare top-level token that the render path auto-wraps in \displaylines{}).
			const storedLatex = (latex ?? '').replace(/\r\n?/g, '\n').replace(/\n/g, '    ');

			// Bracket the whole dialog-commit in history cutoffs so the ops inside - potentially a
			// deleteText + insertText('\n') + insertEmbed for a new insert, or a single formatText
			// for an edit - merge into one undo entry and can't merge with unrelated edits from
			// before/after the dialog session.
			quill.history.cutoff();

			try {
				if(isEditing) {
					quill.formatText(index, Math.max(length, 1), MathExpressionBlot.blotName, storedLatex, 'user');
				} else {
					if(length > 0) {
						quill.deleteText(index, length, 'user');
					}
					quill.insertEmbed(index, 'math', storedLatex, 'user');
				}

				// Re-enter select-and-hold on the committed blot so a subsequent Enter re-opens
				// the dialog. setSelection('user') restores editor focus after dialog close;
				// skipMathAdjacentSelect suppresses the adjacent-math snap so the entry direction
				// stays null (click/unknown -> Escape releases left per spec).
				this.skipMathAdjacentSelect = true;
				quill.setSelection(index, 0, 'user');
				const [blot] = quill.getLeaf(index + 1);
				if(blot && blot.statics?.blotName === MathExpressionBlot.blotName) {
					this.enterMathHold(quill, blot, index, null);
				}
			} finally {
				quill.history.cutoff();
			}
		} finally {
			this.releaseCellKeepAlive();
		}
	}

	// Called by Blazor when math dialog is cancelled.
	private cancelMathDialog(editorKind: string, index: number = -1): void {
		try {
			if(index >= 0) {
				const quill = editorKind === 'cell' ? this.cellNotesEditor : this.primaryNotesEditor;
				if(quill) {
					// Matches the post-commit flow so Enter re-opens the dialog on the unchanged blot.
					this.skipMathAdjacentSelect = true;
					quill.setSelection(index, 0, 'user');
					const [blot] = quill.getLeaf(index + 1);
					if(blot && blot.statics?.blotName === MathExpressionBlot.blotName) {
						this.enterMathHold(quill, blot, index, null);
					}
				}
			}
		} finally {
			this.releaseCellKeepAlive();
		}
	}

	private insertTable(numRows: number = 3, numCols: number = 3): boolean {
		if(!this.restoreSavedSelection()) return false;
		// restoreSavedSelection may have activated a cell editor. Tables can't nest,
		// so bail rather than silently inserting a table inside a cell.
		if(this.activeEditor === 'cell') return false;

		const range = this.getSelectionWithFallback();
		if(!range) return false;

		const cells = [];
		for(let i = 0; i < numRows + 1; i++) {
			const row = [];
			for(let j = 0; j < numCols; j++) {
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

		// Register the newly created table with this editor instance
		// Use a small delay to ensure the table has been rendered in the DOM
		this.safeSetTimeout(() => {
			this.registerTablesWithEditor();
		}, 0);

		return false;
	}

	private insertDate(): boolean {
		const editor = this.notesEditor();
		if(!editor) {
			return false;
		}

		const now = new Date();
		const range = this.getSelectionWithFallback();
		if(!range) {
			return false;
		}

		const rangeIndex = range.index;
		const rangeLength = range.length ?? 0;

		const insertPlainText = (text: string) => {
			editor.history.cutoff();
			if(rangeLength >= 1) {
				editor.deleteText(rangeIndex, rangeLength, 'user');
			}
			editor.insertText(rangeIndex, text, 'user');
			editor.setSelection(rangeIndex + text.length, 0);
			editor.history.cutoff();
		};

		if(this.editorSettings.useCustomDateTimeFormat && this.editorSettings.customDateTimeFormat) {
			const escapedFormat = this.escapeDateTimeFormatPunctuation(this.editorSettings.customDateTimeFormat);
			const markdownFormatted = this.formatDateWithCustomFormat(now, escapedFormat);

			if(this.dotNetHelper) {
				safeInvokeAsync<string>(this.dotNetHelper, 'ConvertMarkdownToDelta', [markdownFormatted])
					.then((deltaJson) => {
						if(!deltaJson) {
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
								if(rangeLength >= 1) {
									composedDelta = composedDelta.delete(rangeLength);
								}
								const effectiveDelta = deltaLength > 0 ? deltaToInsert : contentDelta;
								composedDelta = composedDelta.concat(effectiveDelta);
								editor.history.cutoff();
								editor.updateContents(composedDelta, 'user');
								editor.setSelection(rangeIndex + insertedLength, 0);
								editor.history.cutoff();
						} catch(error) {
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


	private escapeDateTimeFormatPunctuation(format: string): string {
		// Escape the characters '/' and ':' with a backslash.
		return format.replace(/\//g, '\\/').replace(/:/g, '\\:');
	}

	private formatDateWithCustomFormat(date: Date, format: string): string {
		// Map of C# format specifiers to their replacements
		const formatMap: { [key: string]: () => string } = {
			// Day
			'd': () => date.getDate().toString(),                          // Day without leading zero
			'dd': () => String(date.getDate()).padStart(2, '0'),             // Day with leading zero
			'ddd': () => date.toLocaleString(undefined, {weekday: 'short'}),   // Abbreviated day name
			'dddd': () => date.toLocaleString(undefined, {weekday: 'long'}),   // Full day name

			// Month
			'M': () => (date.getMonth() + 1).toString(),                     // Month without leading zero
			'MM': () => String(date.getMonth() + 1).padStart(2, '0'),          // Month with leading zero
			'MMM': () => date.toLocaleString(undefined, {month: 'short'}),     // Abbreviated month name
			'MMMM': () => date.toLocaleString(undefined, {month: 'long'}),     // Full month name

			// Year
			'yy': () => String(date.getFullYear()).slice(-2),                // Two-digit year
			'yyyy': () => String(date.getFullYear()),                        // Four-digit year

			// Hour
			'h': () => ((date.getHours() % 12) || 12).toString(),             // 12-hour without leading zero
			'hh': () => String((date.getHours() % 12) || 12).padStart(2, '0'),  // 12-hour with leading zero
			'H': () => date.getHours().toString(),                           // 24-hour without leading zero
			'HH': () => String(date.getHours()).padStart(2, '0'),              // 24-hour with leading zero

			// Minute
			'm': () => date.getMinutes().toString(),                         // Minutes without leading zero
			'mm': () => String(date.getMinutes()).padStart(2, '0'),            // Minutes with leading zero

			// Second
			's': () => date.getSeconds().toString(),                         // Seconds without leading zero
			'ss': () => String(date.getSeconds()).padStart(2, '0'),            // Seconds with leading zero

			// AM/PM designator
			'tt': () => date.toLocaleString(undefined, {hour: 'numeric', hour12: true}).replace(/[\d\s]/g, '').trim() || (date.getHours() >= 12 ? 'PM' : 'AM'),

			// Milliseconds (always 3 digits)
			'fff': () => String(date.getMilliseconds()).padStart(3, '0'),

			// Time zone offset from UTC. getTimezoneOffset() returns minutes to add to
			// local time to reach UTC (sign inverted), so negate it to get the real offset.
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

			// Time zone information (for a local date, the same offset string as zzz)
			'K': () => {
				const off = -date.getTimezoneOffset();
				return (off < 0 ? '-' : '+') + String(Math.floor(Math.abs(off) / 60)).padStart(2, '0') + ':' + String(Math.abs(off) % 60).padStart(2, '0');
			}
		};

		let result = '';
		let i = 0;
		while(i < format.length) {
			// Handle literal text enclosed in single quotes
			if(format[i] === '\'') {
				i++; // Skip the opening quote
				while(i < format.length && format[i] !== '\'') {
					result += format[i];
					i++;
				}
				i++; // Skip the closing quote
			}
			// Handle literal text enclosed in double quotes
			else if(format[i] === '"') {
				i++; // Skip the opening quote
				while(i < format.length && format[i] !== '"') {
					result += format[i];
					i++;
				}
				i++; // Skip the closing quote
			}
			// Handle escaped characters (using backslash)
			else if(format[i] === '\\') {
				i++;
				if(i < format.length) {
					result += format[i];
					i++;
				}
			} else {
				// Try to match a format specifier, checking longest possible specifier first
				let matched = false;
				for(let len = 4; len >= 1; len--) {
					const specifier = format.substr(i, len);
					if(formatMap[specifier]) {
						result += formatMap[specifier]();
						i += len;
						matched = true;
						break;
					}
				}
				// If no specifier matches, treat the current character as a literal
				if(!matched) {
					result += format[i];
					i++;
				}
			}
		}

		return result;
	}

	private trimTrailingPlainNewlinesFromDelta(delta: any): { delta: any, removed: number } {
		if(!delta || !delta.ops || delta.ops.length === 0) {
			return {delta, removed: 0};
		}

		const ops = delta.ops;
		const lastOp = ops[ops.length - 1];
		if(typeof lastOp.insert !== 'string') {
			return {delta, removed: 0};
		}

		if(lastOp.attributes && Object.keys(lastOp.attributes).length > 0) {
			return {delta, removed: 0};
		}

		const match = lastOp.insert.match(/\n+$/);
		if(!match) {
			return {delta, removed: 0};
		}

		const removeCount = match[0].length;
		const trimmedInsert = lastOp.insert.slice(0, lastOp.insert.length - removeCount);
		const trimmedOps = ops.slice(0, ops.length - 1);

		if(trimmedInsert.length > 0) {
			trimmedOps.push({...lastOp, insert: trimmedInsert});
		}

		return {delta: new Delta(trimmedOps), removed: removeCount};
	}

	// TODO: Implement
	private toggleEditMode(): void {

	}

	// TODO: Implement
	private showMoreActions(): void {

	}

	// No-ops: fullscreen mode has been removed but these are called from Blazor
	public finishFullscreenChange(): void {}
	public setFullscreen(_isFullscreen: boolean): void {}

	public setToolbarMaskActive(isActive: boolean): void {
		const elem = document.querySelector('.toolbar-inner') as HTMLElement;
		if(!elem) return;

		if(isActive) {
			this.updateToolbarMask();
		} else {
			this.safeSetTimeout(() => {
				elem.style.removeProperty('mask-image');
				elem.style.removeProperty('webkit-mask-image');
			}, 50);
		}
	}
	
	public initToolbarMask(): void {
		// Use stored toolbar container reference
		if(!this.toolbarContainer) return;
		const toolbarInner = this.toolbarContainer.querySelector('.toolbar-inner') as HTMLElement;
		const venusToolbarScrollable = this.toolbarContainer.querySelector('.venus-toolbar-scrollable') as HTMLElement;
		const scrollableElement = toolbarInner || venusToolbarScrollable;
		if(!scrollableElement) return;

		scrollableElement.addEventListener('scroll', () => {
			this.updateToolbarMask();
		});
	}

	public updateToolbarMask(): void {
		// Use stored toolbar container reference
		if(!this.toolbarContainer) return;
		const toolbarInner = this.toolbarContainer.querySelector('.toolbar-inner') as HTMLElement;
		const venusToolbarScrollable = this.toolbarContainer.querySelector('.venus-toolbar-scrollable') as HTMLElement;
		const scrollableElement = toolbarInner || venusToolbarScrollable;
		if(!scrollableElement) return;

		const tolerance: number = 1;

		// Determine scroll positions.
		const atLeftEdge = scrollableElement.scrollLeft <= 0;
		const atRightEdge = scrollableElement.scrollLeft + scrollableElement.clientWidth + tolerance >= scrollableElement.scrollWidth;

		// Helper to create mask image strings.
		const createMask = (leftOffset: string, rightOffset: string) => ({
			webkit: `-webkit-linear-gradient(to right, transparent, black ${leftOffset}, black ${rightOffset}, transparent)`,
			standard: `linear-gradient(to right, transparent, black ${leftOffset}, black ${rightOffset}, transparent)`
		});

		// Choose the appropriate mask based on scroll position.
		let mask;
		if(atLeftEdge) {
			mask = createMask('0%', 'calc(100% - 25px)');
		} else if(atRightEdge) {
			mask = createMask('calc(0% + 25px)', '100%');
		} else {
			mask = createMask('calc(0% + 25px)', 'calc(100% - 25px)');
		}

		scrollableElement.style.webkitMaskImage = mask.webkit;
		scrollableElement.style.maskImage = mask.standard;

	}

	private handleInlineFormatKeyboardShortcut(range: any, character: string, formatType: string, detectDoubled: boolean = true): boolean {
		// Don't apply formatting shortcuts if we're in inline code or a code block
		const currentFormats = this.notesEditor().getFormat(range.index, range.length || 1);
		if(currentFormats['code'] || currentFormats['code-block']) {
			return true; // Insert character normally
		}

		// First check for double character (if enabled)
		if(detectDoubled && range.index > 0) {
			const textBefore = this.notesEditor().getText(range.index - 1, 1);

			if(textBefore === character) {
				// We've typed a second consecutive character.

				// Remove the first character from the editor so it doesn't stay in the text.
				// We remove 1 character at (range.index - 1).
				this.notesEditor().deleteText(range.index - 1, 1, 'user');

				// Because we removed a character, the current cursor
				// effectively shifts left by 1. Toggling the format:
				this.toggleBooleanFormat(formatType);

				// Return false so Quill does not insert the new character.
				return false;
			}
		}

		// Check if this character would close an existing character to create inline formatting
		// Look backwards from current position to find an unmatched character
		const currentLine = this.notesEditor().getLine(range.index);
		if(currentLine && currentLine[0]) {
			const line = currentLine[0];
			const lineText = line.domNode.textContent || '';
			const lineOffset = this.notesEditor().getIndex(line);
			const positionInLine = range.index - lineOffset;

			// Check if the closing character (being typed) meets requirements:
			// - Must be preceded by non-whitespace
			// - Must be followed by whitespace or end of line
			const charBefore = positionInLine > 0 ? lineText[positionInLine - 1] : '';
			const charAfter = positionInLine < lineText.length ? lineText[positionInLine] : '';

			const isValidClosing = charBefore.trim().length > 0 &&
			                       (charAfter.trim().length === 0 || positionInLine >= lineText.length);

			if(!isValidClosing) {
				// Closing character doesn't meet requirements, insert it normally
				return true;
			}

			// Search backwards in the current line for an unmatched character
			let matchPos = -1;
			for(let i = positionInLine - 1; i >= 0; i--) {
				if(lineText[i] === character) {
					// Skip if this character is adjacent to the same character (e.g., part of ** or __ for bold, ~~ for strikethrough)
					if((character === '*' || character === '_' || character === '~') && ((i > 0 && lineText[i - 1] === character) || (i < lineText.length - 1 && lineText[i + 1] === character))) {
						continue;
					}
					// Check if this character is already part of formatted text
					const format = this.notesEditor().getFormat(lineOffset + i, 1);
					if(!format[formatType] && !format['code-block']) {
						// Check if the opening character meets requirements:
						// - Must be preceded by whitespace or start of line
						// - Must be followed by non-whitespace
						const openCharBefore = i > 0 ? lineText[i - 1] : '';
						const openCharAfter = i < lineText.length - 1 ? lineText[i + 1] : '';

						const isValidOpening = (i === 0 || openCharBefore.trim().length === 0) &&
						                       openCharAfter.trim().length > 0;

						if(isValidOpening) {
							matchPos = i;
							break;
						}
						// If not valid, continue searching for another character
					}
				}
			}

			if(matchPos >= 0) {
				// Found an unmatched character - format everything between
				const startIndex = lineOffset + matchPos;
				const length = range.index - startIndex - 1; // -1 to exclude the character itself

				if(length > 0) {
					// Insert the closing character first (this will be kept on undo)
					this.notesEditor().insertText(range.index, character, 'user');

					// Create an undo boundary to separate character from formatting
					this.notesEditor().history.cutoff();

					// Delete the opening character
					this.notesEditor().deleteText(startIndex, 1, 'user');

					// If applying code format, remove all existing inline formatting first (but preserve line formats like list)
					if(formatType === 'code') {
						this.removeInlineFormatsOnly(startIndex, length);
					}

					// Apply formatting to the text (cursor position shifted by -1 due to deletion)
					this.notesEditor().formatText(startIndex, length, formatType, true, 'user');

					// Check if we're at the end of the line
					const isAtEndOfLine = positionInLine >= lineText.length;

					if(isAtEndOfLine) {
						// Insert a space after the formatted text so next character is not formatted
						this.notesEditor().insertText(startIndex + length, ' ', 'user');

						// Remove formatting from the space
						this.notesEditor().formatText(startIndex + length, 1, formatType, false, 'user');

						// Move cursor to after the space
						this.notesEditor().setSelection(startIndex + length + 1, 0, 'user');

						// Delete the extra closing character we inserted earlier (now at startIndex + length + 1 after inserting space)
						this.notesEditor().deleteText(startIndex + length + 1, 1, 'user');
					} else {
						// Delete the extra closing character we inserted earlier (at startIndex + length)
						this.notesEditor().deleteText(startIndex + length, 1, 'user');

						// Move cursor past the formatted text
						this.notesEditor().setSelection(startIndex + length, 0, 'user');
					}

					// Return false to prevent inserting another closing character
					return false;
				}
			}
		}

		// If it wasn't the second consecutive character or closing character, do nothing special
		// and allow Quill to insert the character normally.
		return true;
	}

	private handleInlineCodeKeyboardShortcut(range: any): boolean {
		return this.handleInlineFormatKeyboardShortcut(range, '`', 'code');
	}

	private handleStrikethroughKeyboardShortcut(range: any): boolean {
		// First try ~~text~~ for strikethrough (GFM standard, double-character wrapping)
		const handled = this.handleDoubleCharacterFormatKeyboardShortcut(range, '~', 'strike');
		if(!handled) {
			return false; // Strikethrough formatting was applied
		}
		// Otherwise try ~text~ (single-character wrapping)
		return this.handleInlineFormatKeyboardShortcut(range, '~', 'strike', false);
	}

	/**
	 * Generic handler for double-character formatting shortcuts (e.g., ==text==, @@text@@)
	 * This handles the pattern: XXtextXX where XX is a double character sequence
	 * When the user types the 4th character, formatting is applied and all 4 characters are deleted
	 *
	 * @param range The current cursor range
	 * @param character The character to use (e.g., '=' for highlight, '@' for another format)
	 * @param formatType The Quill format type to apply (e.g., 'highlight')
	 * @returns false if formatting was applied, true to allow normal character insertion
	 */
	private handleDoubleCharacterFormatKeyboardShortcut(range: any, character: string, formatType: string): boolean {
		// Don't apply formatting shortcuts if we're in inline code or a code block
		const currentFormats = this.notesEditor().getFormat(range.index, range.length || 1);
		if(currentFormats['code'] || currentFormats['code-block']) {
			return true; // Insert character normally
		}

		// Check if we're typing a second consecutive character
		if(range.index > 0) {
			const textBefore = this.notesEditor().getText(range.index - 1, 1);

			if(textBefore === character) {
				// This is the 2nd or 4th character. Check if this could be the closing XX
				// by looking for an opening XX earlier in the line

				const currentLine = this.notesEditor().getLine(range.index);
				if(currentLine && currentLine[0]) {
					const line = currentLine[0];
					const lineText = line.domNode.textContent || '';
					const lineOffset = this.notesEditor().getIndex(line);
					const positionInLine = range.index - lineOffset;

					// Check if the closing XX (being typed) meets requirements:
					// - Must be preceded by non-whitespace (the text being formatted)
					// - Must be followed by whitespace or end of line
					const charBeforeDouble = positionInLine > 1 ? lineText[positionInLine - 2] : '';
					const charAfter = positionInLine < lineText.length ? lineText[positionInLine] : '';

					const isValidClosing = charBeforeDouble.trim().length > 0 &&
					                       (charAfter.trim().length === 0 || positionInLine >= lineText.length);

					if(isValidClosing) {
						// Search backwards for an opening XX
						for(let i = positionInLine - 2; i >= 1; i--) {
							if(lineText[i] === character && lineText[i - 1] === character) {
								// Found potential opening XX
								// Check if this position is already formatted
								const format = this.notesEditor().getFormat(lineOffset + i, 1);
								if(!format[formatType] && !format['code-block']) {
									// Check if the opening XX meets requirements:
									// - Must be preceded by whitespace or start of line
									// - Must be followed by non-whitespace
									const openCharBefore = i > 1 ? lineText[i - 2] : '';
									const openCharAfter = i + 1 < lineText.length ? lineText[i + 1] : '';

									const isValidOpening = (i === 1 || openCharBefore.trim().length === 0) &&
									                       openCharAfter.trim().length > 0;

									if(isValidOpening) {
										// Found valid opening XX
										const startIndex = lineOffset + i - 1; // Start of the opening XX
										const endIndex = range.index - 1; // Position of the first closing character
										const length = endIndex - startIndex - 2; // -2 to exclude the opening XX

										if(length > 0) {
											// Insert the 4th character first
											this.notesEditor().insertText(range.index, character, 'user');

											// Create an undo boundary
											this.notesEditor().history.cutoff();

											// Delete the opening XX
											this.notesEditor().deleteText(startIndex, 2, 'user');

											// Apply formatting (positions shifted by -2)
											this.notesEditor().formatText(startIndex, length, formatType, true, 'user');

											// Check if we're at the end of the line
											const isAtEndOfLine = positionInLine >= lineText.length;

											if(isAtEndOfLine) {
												// Insert a space after the formatted text
												this.notesEditor().insertText(startIndex + length, ' ', 'user');

												// Remove formatting from the space
												this.notesEditor().formatText(startIndex + length, 1, formatType, false, 'user');

												// Move cursor to after the space
												this.notesEditor().setSelection(startIndex + length + 1, 0, 'user');

												// Delete the closing XX (now at startIndex + length + 1)
												this.notesEditor().deleteText(startIndex + length + 1, 2, 'user');
											} else {
												// Delete the closing XX
												this.notesEditor().deleteText(startIndex + length, 2, 'user');

												// Move cursor past the formatted text
												this.notesEditor().setSelection(startIndex + length, 0, 'user');
											}

											// Return false to prevent inserting another character
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

		// Otherwise, insert the character normally
		return true;
	}

	private handleHighlightKeyboardShortcut(range: any): boolean {
		return this.handleDoubleCharacterFormatKeyboardShortcut(range, '=', 'highlight');
	}

	private handleAsteriskItalicOrBoldKeyboardShortcut(range: any): boolean {
		// First try **text** for bold (double-character wrapping, like ==text== for highlight)
		const handled = this.handleDoubleCharacterFormatKeyboardShortcut(range, '*', 'bold');
		if(!handled) {
			return false; // Bold formatting was applied
		}
		// Otherwise try *text* for italic (single-character wrapping)
		return this.handleInlineFormatKeyboardShortcut(range, '*', 'italic', false);
	}

	private handleUnderscoreItalicOrBoldKeyboardShortcut(range: any): boolean {
		// First try __text__ for bold (double-character wrapping, like **text**)
		const handled = this.handleDoubleCharacterFormatKeyboardShortcut(range, '_', 'bold');
		if(!handled) {
			return false; // Bold formatting was applied
		}
		// Otherwise try _text_ for italic (single-character wrapping)
		return this.handleInlineFormatKeyboardShortcut(range, '_', 'italic', false);
	}

	private handleCodeBlockKeyboardShortcut(range: any, context: any): boolean {
		if(context.format.code === true) {

			// Toggle the entire line into a code block
			this.notesEditor().format('code-block', true, 'user');

			// Return false to prevent the newly typed (third) backtick from being inserted
			return false;
		}

		// Otherwise, allow Quill to insert the single backtick normally
		return true;
	}

	private handleDividerKeyboardShortcut(range: any, context: any): boolean {
		if(!range || !this.notesEditor) return true;

		const editor = this.notesEditor();
		// Get the start of the current line and the text before caret
		const [line, offset] = editor.getLine(range.index);
		const lineStart = range.index - offset;

		// Only when at beginning of line with exactly two hyphens already typed
		if(offset === 2) {
			const textBefore = editor.getText(lineStart, 2);
			if(textBefore === '--') {
				// Remove the two hyphens, position cursor, and insert the divider
				editor.deleteText(lineStart, 2, 'user');
				editor.setSelection(lineStart, 0, 'user');
				this.insertHorizontalRule();
				return false; // prevent insertion of current '-'
			}
		}

		return true;
	}

	// Navigates the cursor past a block when moving backward (Up or Left arrow).
	//
	// handleStacking: Determines whether to handle "stacked blocks" - multiple consecutive instances
	// of the same block type with no content between them (e.g., three horizontal rules in a row).
	// - When true (e.g., for dividers): Skips past ALL stacked blocks at once, moving to content above the entire stack.
	//   This provides better UX when users have inserted multiple dividers - one arrow press skips the whole group.
	// - When false (e.g., for table of contents): Treats each block independently since stacking is not expected.
	//   A TOC block is typically singular in any given location.
	//
	// offsetBehavior: Controls cursor column positioning when moving to the line above the block.
	private navigatePastBlockBackward(range: any, context: any, blotName: string, handleStacking: boolean, offsetBehavior: CursorOffsetBehavior): boolean {
		if(!range || !this.notesEditor) {
			return true;
		}

		const editor = this.notesEditor();
		const [currentLine, offset] = editor.getLine(range.index);
		if(!currentLine || offset !== 0) {
			return true;
		}

		const positionBefore = Math.max(range.index - 1, 0);
		const [leafBefore] = editor.getLeaf(positionBefore);
		if(!leafBefore || leafBefore.statics?.blotName !== blotName) {
			return true;
		}

		let targetBlot = leafBefore;

		if(handleStacking) {
			// Find the topmost block in a stack of consecutive blocks
			let searchIndex = editor.getIndex(leafBefore) - 1;
			while(searchIndex >= 0) {
				const [candidateLine] = editor.getLine(searchIndex);
				if(!candidateLine) {
					break;
				}

				const candidateBlotName = candidateLine.statics?.blotName;
				if(candidateBlotName === blotName) {
					targetBlot = candidateLine;
					const candidateIndex = editor.getIndex(candidateLine);
					searchIndex = candidateIndex - 1;
					continue;
				}

				// Found content above - move cursor there
				const candidateIndex = editor.getIndex(candidateLine);
				const candidateLength = Math.max(candidateLine.length() - 1, 0);
				const targetOffset = offsetBehavior === CursorOffsetBehavior.Preserve
					? Math.min(offset, candidateLength)
					: candidateLength;
				editor.setSelection(candidateIndex + targetOffset, 0, 'user');
				return false;
			}
		} else {
			// Simple case: just check if there's a line above to move to
			const blockIndex = editor.getIndex(targetBlot);
			if(blockIndex > 0) {
				const [lineAbove] = editor.getLine(blockIndex - 1);
				if(lineAbove) {
					const lineIndex = editor.getIndex(lineAbove);
					const lineLength = Math.max(lineAbove.length() - 1, 0);
					editor.setSelection(lineIndex + lineLength, 0, 'user');
					return false;
				}
			}
		}

		// No content above - insert a line above the block
		const blockIndex = editor.getIndex(targetBlot);
		editor.insertText(blockIndex, '\n', 'user');
		editor.setSelection(blockIndex, 0, 'user');
		return false;
	}

	private moveCursorPastDividerUp(range: any, context: any): boolean {
		return this.navigatePastBlockBackward(range, context, 'divider', true, CursorOffsetBehavior.Preserve);
	}

	// Navigates the cursor past a block when moving forward (Down or Right arrow).
	//
	// handleStacking: Determines whether to handle "stacked blocks" - multiple consecutive instances
	// of the same block type with no content between them (e.g., three horizontal rules in a row).
	// - When true (e.g., for dividers): Skips past ALL stacked blocks at once, moving to content below the entire stack.
	//   This provides better UX when users have inserted multiple dividers - one arrow press skips the whole group.
	// - When false (e.g., for table of contents): Treats each block independently since stacking is not expected.
	//   A TOC block is typically singular in any given location.
	//
	// offsetBehavior: Controls cursor column positioning when moving to the line below the block.
	private navigatePastBlockForward(range: any, context: any, blotName: string, handleStacking: boolean, offsetBehavior: CursorOffsetBehavior): boolean {
		if(!range || !this.notesEditor) {
			return true;
		}

		const editor = this.notesEditor();
		const [currentLine, offset] = editor.getLine(range.index);
		if(!currentLine) {
			return true;
		}

		const lineStart = range.index - offset;
		const lineEnd = lineStart + currentLine.length();
		if(range.index < lineEnd - 1) {
			return true;
		}

		const [firstCandidate] = editor.getLine(lineEnd);
		if(!firstCandidate || firstCandidate.statics?.blotName !== blotName) {
			return true;
		}

		let targetBlot = firstCandidate;

		if(handleStacking) {
			// Find the bottommost block in a stack of consecutive blocks
			let searchIndex = editor.getIndex(firstCandidate) + firstCandidate.length();
			const maxLength = editor.getLength();
			while(searchIndex < maxLength) {
				const [candidateLine] = editor.getLine(searchIndex);
				if(!candidateLine) {
					break;
				}

				const candidateBlotName = candidateLine.statics?.blotName;
				if(candidateBlotName === blotName) {
					targetBlot = candidateLine;
					const candidateIndex = editor.getIndex(candidateLine);
					searchIndex = candidateIndex + candidateLine.length();
					continue;
				}

				// Found content below - move cursor there
				const candidateIndex = editor.getIndex(candidateLine);
				const candidateLength = Math.max(candidateLine.length() - 1, 0);
				const targetOffset = offsetBehavior === CursorOffsetBehavior.Preserve
					? Math.min(offset, candidateLength)
					: 0;
				editor.setSelection(candidateIndex + targetOffset, 0, 'user');
				return false;
			}
		} else {
			// Simple case: just check if there's a line below to move to
			const blockIndex = editor.getIndex(targetBlot);
			const blockEnd = blockIndex + targetBlot.length();
			const [lineBelow] = editor.getLine(blockEnd);
			if(lineBelow) {
				const lineIndex = editor.getIndex(lineBelow);
				editor.setSelection(lineIndex, 0, 'user');
				return false;
			}
		}

		// No content below - insert a line below the block
		const insertIndex = this.ensureLineBelowDivider(editor, targetBlot);
		editor.setSelection(insertIndex, 0, 'user');
		return false;
	}

	private moveCursorPastDividerDown(range: any, context: any): boolean {
		return this.navigatePastBlockForward(range, context, 'divider', true, CursorOffsetBehavior.Preserve);
	}

	private moveCursorPastDividerLeft(range: any, context: any): boolean {
		return this.navigatePastBlockBackward(range, context, 'divider', true, CursorOffsetBehavior.LineEdge);
	}

	private moveCursorPastDividerRight(range: any, context: any): boolean {
		return this.navigatePastBlockForward(range, context, 'divider', true, CursorOffsetBehavior.LineEdge);
	}

	private ensureLineBelowDivider(editor: any, dividerBlot: any, beforeIndex?: number): number {
		const baseIndex = editor.getIndex(dividerBlot) + dividerBlot.length();
		let insertIndex = baseIndex;
		if(beforeIndex !== undefined) {
			insertIndex = Math.max(Math.min(beforeIndex, editor.getLength() - 1), baseIndex);
		}

		editor.insertText(insertIndex, '\n', 'user');
		return insertIndex;
	}

	private moveCursorPastTOCUp(range: any, context: any): boolean {
		return this.navigatePastBlockBackward(range, context, 'table-of-contents', false, CursorOffsetBehavior.Preserve);
	}

	private deleteDividerForward(range: any, context: any): boolean {
		if(!range || !this.notesEditor) {
			return true;
		}

		const editor = this.notesEditor();
		const [currentLine, offset] = editor.getLine(range.index);
		if(!currentLine) {
			return true;
		}

		if(range.length > 0) {
			return true;
		}

		const lineLength = currentLine.length();
		if(offset < lineLength - 1) {
			return true;
		}

		const lineStart = range.index - offset;
		const afterLineIndex = lineStart + lineLength;

		const [nextLine] = editor.getLine(afterLineIndex);
		if(!nextLine || nextLine.statics?.blotName !== 'divider') {
			return true;
		}

		const dividerIndex = editor.getIndex(nextLine);
		const deleteLength = Math.max(nextLine.length(), 1);
		editor.deleteText(dividerIndex, deleteLength, 'user');
		const charAfterDelete = editor.getText(dividerIndex, 1);
		if(charAfterDelete === '\n') {
			editor.deleteText(dividerIndex, 1, 'user');
		}
		editor.setSelection(range.index, 0, 'user');
		return false;
	}

	private handleInsertLinkKeyboardShortcut(range: any, context: any): boolean {
		const textBefore = this.notesEditor().getText(range.index - 1, 1);
		if(textBefore === '[') {
			this.notesEditor().deleteText(range.index - 1, 1);

			this.showInsertLinkDialog();

			// Return false so Quill does not insert the new bracket.
			return false;
		}

		// Otherwise, allow Quill to insert the single bracket normally
		return true;
	}

	/**
	 * Detects a typed markdown link like [Yahoo](https://yahoo.com) when the closing paren
	 * is typed and converts it into a real link with the display text. A leading '!' makes
	 * it a markdown image like ![alt](https://example.com/cat.png), inserted as an image embed.
	 *
	 * @param range The current cursor range
	 * @returns false if a link or image was created, true to allow normal paren insertion
	 */
	private handleMarkdownLinkKeyboardShortcut(range: any): boolean {
		if(!range || range.length > 0 || !this.notesEditor) {
			return true;
		}

		const editor = this.notesEditor();

		// Don't convert inside inline code or a code block
		const currentFormats = editor.getFormat(range.index, 1);
		if(currentFormats['code'] || currentFormats['code-block']) {
			return true;
		}

		const currentLine = editor.getLine(range.index);
		if(!currentLine || !currentLine[0]) {
			return true;
		}

		const line = currentLine[0];
		const lineText = line.domNode.textContent || '';
		const lineOffset = editor.getIndex(line);
		const positionInLine = range.index - lineOffset;

		// Match a markdown link ending at the cursor: [text](url with the ) being typed now.
		// Display text cannot contain brackets; the URL cannot contain whitespace or parens.
		const textBeforeCursor = lineText.substring(0, positionInLine);
		const match = textBeforeCursor.match(/\[([^\[\]]+)\]\(([^()\s]+)$/);
		if(!match) {
			return true;
		}

		const displayText = match[1];
		const url = match[2];

		const matchStartInLine = positionInLine - match[0].length;

		// A '!' immediately before the '[' makes this a markdown image: ![alt](url)
		const isImage = matchStartInLine > 0 && lineText[matchStartInLine - 1] === '!';

		// Images must point at an http(s) URL; links accept any scheme or www. prefix
		if(isImage ? !this.URL_REGEX.test(url) : !this.MARKDOWN_LINK_URL_REGEX.test(url)) {
			return true;
		}

		const markerLength = match[0].length + (isImage ? 1 : 0);
		const matchStart = lineOffset + matchStartInLine - (isImage ? 1 : 0);

		// Don't convert if the markdown syntax overlaps an existing link or code formatting
		const matchFormats = editor.getFormat(matchStart, markerLength);
		if(matchFormats['link'] || matchFormats['code'] || matchFormats['code-block']) {
			return true;
		}

		// Insert the closing paren first (this will be kept on undo)
		editor.insertText(range.index, ')', 'user');

		// Create an undo boundary to separate the paren from the conversion
		editor.history.cutoff();

		// Remove the markdown syntax (including the just-inserted paren)
		editor.deleteText(matchStart, markerLength + 1, 'user');

		if(isImage) {
			// Insert an image embed (the alt text is not preserved by the image embed)
			editor.insertEmbed(matchStart, 'image', url, 'user');

			// Position cursor after the image
			editor.setSelection(matchStart + 1, 0, 'user');

			// Return false to prevent inserting another closing paren
			return false;
		}

		editor.insertText(matchStart, displayText, {link: url}, 'user');

		// Check if we're at the end of the line
		const isAtEndOfLine = positionInLine >= lineText.length;

		if(isAtEndOfLine) {
			// Insert a space after the link so the next character typed is not part of the link
			editor.insertText(matchStart + displayText.length, ' ', 'user');

			// Remove link formatting from the space
			editor.formatText(matchStart + displayText.length, 1, 'link', false, 'user');

			// Move cursor to after the space
			editor.setSelection(matchStart + displayText.length + 1, 0, 'user');
		} else {
			// Move cursor past the link
			editor.setSelection(matchStart + displayText.length, 0, 'user');
		}

		// Return false to prevent inserting another closing paren
		return false;
	}

	private handleInsertMathKeyboardShortcut(range: any, context: any): boolean {
		const textBefore = this.notesEditor().getText(range.index - 1, 1);
		if(textBefore === '$') {
			this.notesEditor().deleteText(range.index - 1, 1);

			this.insertMathExpression();

			// Return false so Quill does not insert the new dollar sign
			return false;
		}

		// Otherwise, allow Quill to insert the single dollar sign normally
		return true;
	}

	private handleLineStartMarkdownShortcut(range: any, context: any): boolean {
		if(!range || !this.notesEditor) return true;

		const editor = this.notesEditor();
		const [line, offset] = editor.getLine(range.index);
		const lineStart = range.index - offset;

		// Get the text from the start of the line up to the current position
		const before = editor.getText(lineStart, offset);

		// Check for heading patterns (support up to 6 levels: # to ######)
		const headingMatch = before.match(/^#{1,6}$/);
		if(headingMatch) {
			const level = headingMatch[0].length; // Number of '#' characters

			// Insert the space first (this will be kept on undo)
			editor.insertText(range.index, ' ', 'user');

			// Create an undo boundary to separate space insertion from formatting
			editor.history.cutoff();

			// Remove the prefix characters and the space
			editor.deleteText(lineStart, level + 1, 'user');

			// Apply heading formatting based on level
			const headingStyles = ['heading1', 'heading2', 'heading3', 'heading4', 'heading5', 'heading6'];
			this.setParagraphStyle(headingStyles[level - 1]);

			return false;
		}

		// Check for blockquote patterns (support up to 6 levels)
		const blockquoteMatch = before.match(/^>{1,6}$/);
		if(blockquoteMatch) {
			const level = blockquoteMatch[0].length; // Number of '>' characters
			const prefixLength = level; // Number of '>' characters to remove

			// Insert the space first (this will be kept on undo)
			editor.insertText(range.index, ' ', 'user');

			// Create an undo boundary to separate space insertion from formatting
			editor.history.cutoff();

			// Remove the prefix characters and the space
			editor.deleteText(lineStart, prefixLength + 1, 'user');

			// Apply blockquote formatting with the appropriate level
			editor.formatLine(lineStart, 1, 'blockquote', level, 'user');

			return false;
		}

		// Check for alignment patterns
		let alignValue: string | boolean | undefined;
		let hasAlignment = false;
		let alignPrefixLength = 0;

		if(before === ':-:') {
			alignValue = 'center';
			hasAlignment = true;
			alignPrefixLength = 3;
		} else if(before === ':--') {
			alignValue = false; // Left is the default, so use false to explicitly set it
			hasAlignment = true;
			alignPrefixLength = 3;
		} else if(before === '--:') {
			alignValue = 'right';
			hasAlignment = true;
			alignPrefixLength = 3;
		}

		if(hasAlignment) {
			// Insert the space first (this will be kept on undo)
			editor.insertText(range.index, ' ', 'user');

			// Create an undo boundary to separate space insertion from formatting
			editor.history.cutoff();

			// Remove the prefix characters and the space
			editor.deleteText(lineStart, alignPrefixLength + 1, 'user');

			// Apply alignment formatting
			editor.formatLine(lineStart, 1, 'align', alignValue, 'user');

			return false;
		}

		let listType;
		let prefixLength = 0;

		// Check for different list patterns
		if(before === '-') {
			listType = 'unchecked';
			prefixLength = 1;
		} else if(before === '*') {
			listType = 'bullet';
			prefixLength = 1;
		} else if(before === '+') {
			listType = 'checked';
			prefixLength = 1;
		} else if(before === '1.') {
			listType = 'ordered';
			prefixLength = 2;
		}

		if(listType) {
			// Insert the space first (this will be kept on undo)
			editor.insertText(range.index, ' ', 'user');

			// Create an undo boundary to separate space insertion from formatting
			editor.history.cutoff();

			// Remove the prefix characters and the space
			editor.deleteText(lineStart, prefixLength + 1, 'user');

			// Apply the list formatting
			editor.formatLine(lineStart, 1, 'list', listType, 'user');

			return false;
		}

		return true;
	}

	private handleBracketCheckboxKeyboardShortcut(range: any, context: any): boolean {
		// Triggered when typing ']' and the line has only '[', '[ ' or '[x' (with optional leading spaces)
		const trimmedPrefix = context.prefix.trim();

		let listType: string | null = null;
		if(trimmedPrefix === '[') {
			listType = 'unchecked';
		} else if(trimmedPrefix.toLowerCase() === '[x') {
			listType = 'checked';
		}

		if(listType) {
			// Remove everything from the '[' onwards and apply the checklist item
			const markerLength = context.prefix.length - context.prefix.indexOf('[');
			this.notesEditor().deleteText(range.index - markerLength, markerLength);
			this.notesEditor().formatLine(range.index - markerLength, 1, 'list', listType);
			// Prevent default ']' insertion
			return false;
		}

		return true;
	}
	
	private exitCodeBlockUp(range: any, context: any): boolean {
		if(!range || !this.notesEditor) {
			return true;
		}

		const editor = this.notesEditor();

		// Get the current line
		const [line, offset] = editor.getLine(range.index);

		// Only proceed if we're at the beginning of the line
		if(offset > 0) {
			return true;
		}

		// Get the index of the start of this line
		const lineStart = range.index - offset;

		// If we're at the very beginning of the document
		if(lineStart === 0) {
			editor.insertText(0, '\n', 'user');
			editor.setSelection(0, 0, 'user');
			editor.format('code-block', false, 'user');
			return false;
		} 

		// Default: let normal arrow key behavior proceed
		return true;
	}
	
	private exitCodeBlockDown(range: any, context: any): boolean {
		if(!range || !this.notesEditor) {
			return true;
		}

		const editor = this.notesEditor();

		// Get the current line and check if we're at the end of it
		const [line, offset] = editor.getLine(range.index);
		const lineEnd = range.index - offset + line.length();

		// Only proceed if we're at the end of the current line
		if(range.index < lineEnd - 1) {
			return true;
		}

		// Check if we're at the end of the document (Quill's trailing newline is at getLength() - 1)
		if(lineEnd >= editor.getLength() - 1) {
			// We're at the end of the document
			editor.insertText(editor.getLength() - 1, '\n', 'user');
			editor.setSelection(editor.getLength() - 1, 0, 'user');
			editor.format('code-block', false, 'user');
			return false;
		}

		// Default: let normal arrow key behavior proceed
		return true;
	}

	private exitMathUp(range: any, context: any): boolean {
		if(!range || !this.notesEditor) {
			return true;
		}

		const editor = this.notesEditor();

		// Only proceed if we're at the very beginning of the document
		const [line, offset] = editor.getLine(range.index);
		const lineStart = range.index - offset;
		if(lineStart !== 0) {
			return true;
		}

		// Only proceed if we're at the beginning of the line
		if(offset > 0) {
			return true;
		}

		// Check if the leaf at the cursor or just after is a math blot
		const [leaf] = editor.getLeaf(range.index);
		const hasMath = leaf && leaf.statics?.blotName === MathExpressionBlot.blotName;

		if(!hasMath) {
			return true;
		}

		// Insert a new line at the beginning and move cursor there
		editor.insertText(0, '\n', 'user');
		editor.setSelection(0, 0, 'user');
		return false;
	}

	private exitMathDown(range: any, context: any): boolean {
		if(!range || !this.notesEditor) {
			return true;
		}

		const editor = this.notesEditor();

		// Get the current line and check if we're at the end of it
		const [line, offset] = editor.getLine(range.index);
		const lineEnd = range.index - offset + line.length();

		// Only proceed if we're at or near the end of the current line
		if(range.index < lineEnd - 1) {
			return true;
		}

		// Check if we're at the end of the document (Quill's trailing newline is at getLength() - 1)
		if(lineEnd < editor.getLength() - 1) {
			return true;
		}

		// Check if there's a math blot on the current line (not just nearby).
		// Scan the leaves on this line to find a math expression.
		const lineStart = range.index - offset;
		let hasMath = false;
		for(let i = lineStart; i < lineEnd; i++) {
			const [l] = editor.getLeaf(i);
			if(l && l.statics?.blotName === MathExpressionBlot.blotName) {
				hasMath = true;
				break;
			}
		}

		if(!hasMath) {
			return true;
		}

		// Insert a new line at the end and move cursor there
		editor.insertText(editor.getLength() - 2, '\n', 'user');
		editor.setSelection(editor.getLength() - 2, 0, 'user');
		return false;
	}

	private handleNavigateUp(range: any, context: any): boolean {
		if(!range || !this.notesEditor) {
			return true;
		}

		// If we're in a cell editor, let the table cell navigation handle it
		if(this.activeEditor === 'cell') {
			return true;
		}

		const editor = this.notesEditor();

		// Get the current line
		const [line, offset] = editor.getLine(range.index);

		// Get the index of the start of this line
		const lineStart = range.index - offset;

		// Only navigate out of the editor if we're on the first line (lineStart === 0)
		if(lineStart === 0) {
			// Check if cursor is on the top visual row of a wrapped first line
			const cursorBounds = editor.getBounds(range.index);
			const lineBounds = editor.getBounds(lineStart, line.length());

			if(!cursorBounds || !lineBounds) {
				return true;
			}

			// If cursor is more than half a line height below the top of the line,
			// we're not on the first visual row — fall through to wrap boundary handling below
			if(cursorBounds.top <= lineBounds.top + cursorBounds.height / 2) {
				// We're on the top visual row — navigate out of the editor
				const editorElement = editor.root;
				const editorRect = editorElement.getBoundingClientRect();
				const xPosition = cursorBounds ? editorRect.left + cursorBounds.left : null;

				safeInvoke(this.dotNetHelper, 'NavigateUpFromEditor', [xPosition]);
				return false;
			}
		}

		// Handle wrap boundary: at the start of a wrapped visual row, the browser's native
		// ArrowUp may not move the cursor. Detect this and manually move to the previous visual row.
		if(offset > 0) {
			const cursorBounds = editor.getBounds(range.index);
			if(cursorBounds) {
				const prevCharBounds = editor.getBounds(range.index - 1);
				if(prevCharBounds && cursorBounds.top > prevCharBounds.top + cursorBounds.height / 2) {
					// Previous character is on a higher visual row — we're at a wrap boundary.
					const targetTop = prevCharBounds.top;
					const targetX = cursorBounds.left;

					// Find the character on the previous visual row closest to our X position
					let closestOffset = range.index - 1;
					let closestDistance = Infinity;
					for(let i = lineStart; i < range.index; i++) {
						const iBounds = editor.getBounds(i);
						if(!iBounds) continue;
						// Only consider characters on the previous visual row
						if(Math.abs(iBounds.top - targetTop) > cursorBounds.height / 2) continue;
						const distance = Math.abs(iBounds.left - targetX);
						if(distance < closestDistance) {
							closestDistance = distance;
							closestOffset = i;
						}
					}

					editor.setSelection(closestOffset, 0, 'user');
					return false;
				}
			}
		}

		// Not at a wrap boundary, allow default arrow up behavior
		return true;
	}

	private handleNavigateLeft(range: any, context: any): boolean {
		if(!range || !this.notesEditor) {
			return true;
		}

		// If we're in a cell editor, let the table cell navigation handle it
		if(this.activeEditor === 'cell') {
			return true;
		}

		const editor = this.notesEditor();

		// Only navigate left if we're at the very beginning of the document (index 0)
		if(range.index === 0) {
			// Call C# to move focus to the left of the editor
			safeInvoke(this.dotNetHelper, 'NavigateLeftFromEditor');
			// Prevent default arrow left behavior
			return false;
		}

		// Not at the beginning, allow default arrow left behavior
		return true;
	}

	private handleNavigateDown(range: any, context: any): boolean {
		if(!range || !this.notesEditor) {
			return true;
		}

		// If we're in a cell editor, let the table cell navigation handle it
		if(this.activeEditor === 'cell') {
			return true;
		}

		const editor = this.notesEditor();

		// Get the current line
		const [line, offset] = editor.getLine(range.index);
		const lineEnd = range.index - offset + line.length();

		// Check whether this is the last line. line.length() includes the line's terminating
		// newline, so lineEnd is the start of the next line. For the genuinely-last line that
		// terminating newline IS the document's final newline, so lineEnd === docLength.
		// (Using docLength - 1 here mis-fires when the last line is an empty bullet, whose single
		// newline sits at docLength - 1 — the line above it would then look like the last line.)
		const docLength = editor.getLength();
		if(lineEnd < docLength) {
			// Not on the last line of content
			return true;
		}

		// We're on the last line - check if cursor is on the bottom visual row
		const cursorBounds = editor.getBounds(range.index);
		const lineBounds = editor.getBounds(range.index - offset, line.length());

		if(!cursorBounds || !lineBounds) {
			return true;
		}

		// If cursor is more than half a line height above the bottom of the line, we're not on the last visual row
		if(cursorBounds.bottom < lineBounds.bottom - cursorBounds.height / 2) {
			return true;
		}

		// We're on the last visual row of the last line - navigate below the editor
		safeInvoke(this.dotNetHelper, 'NavigateDownFromEditor');
		return false;
	}

	/**
	 * Central method that updates **all** toolbar UI states
	 * (paragraph dropdown, bold button, etc.) based on the
	 * current selection/formats.
	 */
	public updateToolbarState(): void {
		if(this.debouncedUpdateToolbarStateInternal === null) {
			// Only run this method once every 100ms. Otherwise major changes cause hundreds or even thousands of calls.
			this.debouncedUpdateToolbarStateInternal = debounce(
				this.updateToolbarStateInternal.bind(this),
				100
			);
		}
		this.debouncedUpdateToolbarStateInternal();
	}

	debouncedUpdateToolbarStateInternal: ((...args: Parameters<() => void>) => void) | null = null;

	private updateToolbarStateInternal() {
		if(!this.notesEditor()) return;

		const range = this.getSelectionWithFallback();
		if(!range) {
			// TODO: Reset all toolbar buttons to default state or handle in the editor's `blur` event handler
			return;
		}

		// Get formats for the current selection
		const formats = this.notesEditor().getFormat(range.index, range.length);

		this.updateParagraphDropdownToolbarState(formats);
		this.updateBooleanFormatToolbarStates(formats);

		this.updateTextColorToolbarState(formats);
		this.updateTextAlignToolbarState(formats);
		this.updateMoveLineCommandStates(range);
		this.updateTableCommandStates();
	}

	/**
	 * Updates the paragraph style dropdown to reflect the user's current selection.
	 */
	private updateParagraphDropdownToolbarState(formats: any): void {
		let paragraphStyle = 'normal';

		if(formats.header) {
			switch(formats.header) {
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
		} else if(formats['code-block']) {
			paragraphStyle = 'code-block';
		} else if(formats.list === 'bullet') {
			paragraphStyle = 'list-bullet';
		} else if(formats.list === 'ordered') {
			paragraphStyle = 'list-ordered';
		} else if(formats.list === 'check' || formats.list === 'checked' || formats.list === 'unchecked') {
			paragraphStyle = 'list-check';
		} else {
			paragraphStyle = 'normal';
		}

		safeInvoke(this.dotNetHelper, 'UpdateParagraphStyleIconAndLabel', [paragraphStyle]);

		// Update command checked states for paragraph styles
		const stateUpdates: Record<string, boolean> = {
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

	public showContextMenu(x: number, y: number, type: string, word?: string, index?: number, length?: number): void {
		safeInvoke(this.dotNetHelper, 'ShowContextMenu', [x, y, type, word, index, length]);
	}

	private disabledFormatKeysWhenInCode = [
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
	
	private disabledFormatKeysWhenInCell = [
		'link',
		'image',
		'indent',
		'outdent',
		'horizontal-rule',
		'table',
		'date'
	];

	/**
	 * Updates boolean format buttons (bold, italic, underline, etc.) to reflect the user's current selection.
	 */
	private updateBooleanFormatToolbarStates(formats: any): void {
		const stateUpdates: Record<string, boolean> = {};

		this.toolbarButtons.forEach(button => {
			if(button.isMenu || button.buttonId === 'spellcheck') return;

			const formatKey = button.formatKey;
			const isHighlighted =
				formats[formatKey] === true
				|| (button.formatKey === 'link' && formats.link)
				|| (button.formatKey === 'image' && formats.image);

			const isDisabled =
				// code block
				(formats.code || formats['code-block']) && this.disabledFormatKeysWhenInCode.includes(button.formatKey)
				|| formats['code-block'] && button.formatKey === 'code'
				// undo - does not need to check cell editor's undo stack
				|| button.formatKey === 'undo' && this.primaryNotesEditor.history.stack.undo.length === 0
				// redo - enabled if there are any redo steps in either the primary or cell editor since local undo in cell does not affect primary editor
				|| button.formatKey === 'redo' && this.primaryNotesEditor.history.stack.redo.length === 0 && this.notesEditor().history.stack.redo.length === 0
				// cells selected
				|| this.areCellsSelected() && this.disabledFormatKeysWhenInCell.includes(button.formatKey);

			if(button.buttonId) {
				const commandSuffix = button.buttonId
					.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
					.replace(/^[a-z]/, c => c.toUpperCase());
				const commandId = `VenusEditor.${commandSuffix}`;
				// For undo/redo, send enabled state (inverse of disabled); for others, send checked state
				if(button.formatKey === 'undo' || button.formatKey === 'redo') {
					stateUpdates[commandId] = !isDisabled;
				} else {
					stateUpdates[commandId] = !!isHighlighted;
				}
			}

		})

		if(Object.keys(stateUpdates).length > 0) {
			safeInvoke(this.dotNetHelper, 'UpdateCommandStates', [stateUpdates]);
		}
	}

	private updateTextColorToolbarState(formats: any): void {
		if(formats.color) {
			safeInvoke(this.dotNetHelper, 'UpdateForeColor', [formats.color]);
		} else {
			safeInvoke(this.dotNetHelper, 'UpdateForeColor', ['']);
		}

		if(formats.background) {
			safeInvoke(this.dotNetHelper, 'UpdateBackColor', [formats.background]);
		} else {
			safeInvoke(this.dotNetHelper, 'UpdateBackColor', ['']);
		}
	}

	private updateTextAlignToolbarState(formats: any) {
		let alignStyle = 'left';

		if(formats.align) {
			alignStyle = formats.align;
		}

		safeInvoke(this.dotNetHelper, 'UpdateTextAlignIcon', [alignStyle]);

		// Update command checked states for alignment
		const stateUpdates: Record<string, boolean> = {
			'VenusEditor.AlignLeft': alignStyle === 'left',
			'VenusEditor.AlignCenter': alignStyle === 'center',
			'VenusEditor.AlignRight': alignStyle === 'right'
		};

		safeInvoke(this.dotNetHelper, 'UpdateCommandStates', [stateUpdates]);
	}

	// called from blazor
	public disposeToolbarHandlers() {
		// Remove tracked toolbar event listeners
		this.toolbarListeners.forEach(({element, event, handler}) => {
			element.removeEventListener(event, handler);
		});
		this.toolbarListeners = [];
	}

	// Spell checking helper methods
	public replaceText(index: number, length: number, newText: string): void {
		const quill = this.notesEditor();
		if(!quill) return;

		quill.deleteText(index, length, 'user');
		quill.insertText(index, newText, 'user');
		quill.setSelection(index + newText.length, 0, 'user');
	}

	public refreshTextProcessing(): void {
		const quill = this.notesEditor();
		if(!quill) return;

		// Clear mention and cached hash metadata so reprocessing will run for all lines
		this.clearMentionInformation(quill);
		QuillExtensions.processVisibleLines(quill, this);
	}

	// Called from Blazor
	public disposeQuillEditor(): void {
		const perfTimer = NotesPerfTimer.start('disposeQuillEditor');
		// Stop Quill from processing input or mutations during teardown
		if(this.primaryNotesEditor) {
			this.primaryNotesEditor.disable();
		}
		// Flush any pending auto-save before cleanup (must happen before dotNetHelper is nulled)
		this.flushPendingAutoSave();

		if(this._visibilityChangeHandler) {
			document.removeEventListener('visibilitychange', this._visibilityChangeHandler);
			this._visibilityChangeHandler = null;
		}
		if(this._marginClickContainer && this._marginClickHandler) {
			this._marginClickContainer.removeEventListener('mousedown', this._marginClickHandler);
			this._marginClickContainer = null;
			this._marginClickHandler = null;
		}
		if(this._typingIdleTimer) {
			clearTimeout(this._typingIdleTimer);
			this._typingIdleTimer = undefined;
		}
		this._compositionPendingProcess = false;
		for(const id of this._pendingTimers) {
			clearTimeout(id);
		}
		this._pendingTimers.clear();
		this.activeInlineTooltip = null;
		// AnimatedCaret instances are disposed via removeEventListenersForEditor
		// later in this method (called for both primary and cell editors).

		if(!this.primaryNotesEditor) return;

		this.dotNetHelper = null;

		const toolbar = this.primaryNotesEditor.theme?.modules?.toolbar;
		if(toolbar?.container) {
			toolbar.container.remove();
		}
		if(this.primaryNotesEditor.theme?.tooltip?.root) {
			this.primaryNotesEditor.theme.tooltip.root.remove();
		}

		this.removeEventListenersForEditor(this.primaryNotesEditor);
		this.removeEventListenersForEditor(this.cellNotesEditor);

		// Cleanup contentAreaInner ResizeObserver (stored with string key, not cleaned up by removeEventListenersForEditor)
		const caiObserver = this.resizeObservers.get('contentAreaInner');
		if(caiObserver) {
			caiObserver.disconnect();
			this.resizeObservers.delete('contentAreaInner');
		}

		// Remove dummyInput from DOM
		if(this.dummyInput && this.dummyInput.parentElement) {
			this.dummyInput.parentElement.removeChild(this.dummyInput);
			this.dummyInput = null;
		}

		// Cleanup table resizer
		if(this.tableResizer) {
			this.tableResizer.destroy();
			this.tableResizer = null;
		}

		// Cleanup table cell editors
		for(const cellId in this.tableState.editorCache) {
			this.tableState.editorCache[cellId].removeListener?.();
			delete this.tableState.editorCache[cellId];
		}

		// Remove instance from Map if it was registered
		if(this.editorElementId) {
			const instanceIdMatch = this.editorElementId.match(/^editor-(.+)$/);
			if(instanceIdMatch && instanceIdMatch[1]) {
				const instanceId = instanceIdMatch[1];
				console.log(`[disposeQuillEditor] Removing instance: ${instanceId}`);
				editorInstances.delete(instanceId);
			}
		}

		perfTimer.stop();
		console.log('Disposed Notes Editor');
	}

	// Rewrite cell content while keeping .ql-table-control overlays attached -
	// the headless Quill roundtrip upstream strips them.
	private writeStaticCellHtml(cell: HTMLTableCellElement, html: string): void {
		const overlays: HTMLElement[] = [];
		for(const child of Array.from(cell.children)) {
			if(child.classList.contains('ql-table-control')) {
				overlays.push(child as HTMLElement);
			}
		}
		cell.innerHTML = html;
		for(const overlay of overlays) {
			cell.appendChild(overlay);
		}
	}

	// Called from Blazor
	applyProcessing(lineIndex: number, lineLength: number, expectedHash: string, processes: JSTextProcess[], editorContext: 'primary' | 'cell' | 'cell-static' = 'primary', cellId?: string) {
		if(editorContext === 'cell-static') {
			if(!cellId) {
				return;
			}
			// Don't clobber a cell that was activated between the dispatch of the
			// static ProcessLine and the apply landing here. Static processing can
			// take seconds during a cold initial load; if the user clicked the cell
			// in that window, cell.innerHTML is now Quill's .ql-container/.ql-editor
			// structure, and replacing it below would destroy the live cell editor
			// mid-click (cursor appears, then disappears). The live editor handles
			// its own recognition via the 'cell' context.
			if(this.tableState.editorCache[cellId]) {
				return;
			}
			const cell = document.getElementById(cellId) as HTMLTableCellElement | null;
			if(!cell) {
				return;
			}
			const result = QuillExtensions.applyTextProcessesToHtml(cell.innerHTML, processes);
			this.writeStaticCellHtml(cell, result.html);
			if(result.skipRanges.length > 0) {
				cell.dataset[MISSPELLING_SKIP_DATASET_KEY] = JSON.stringify(result.skipRanges);
			} else if(cell.dataset[MISSPELLING_SKIP_DATASET_KEY]) {
				delete cell.dataset[MISSPELLING_SKIP_DATASET_KEY];
			}
			return;
		}

		const quill = editorContext === 'cell'
			? this.getCellQuillForProcessing(cellId)
			: this.primaryNotesEditor;
		if(!quill) return;
		if(quill.composition?.isComposing) return;
		// make sure the hash is still the same
		const text = quill.getText(lineIndex, lineLength);
		const computedHash = QuillExtensions.computeHash(text);
		if(expectedHash !== computedHash) {
			return;
		}
		const lines = quill.getLines(lineIndex, lineLength);
		if(!lines || lines.length === 0) {
			return;
		}
		const primaryLine = lines[0];
		const skipRanges = QuillExtensions.getMisspellingSkipRanges(primaryLine?.domNode ?? null);

		// Save scroll position before applying formatting operations
		// Multiple formatText calls can cause QuillJS to reset scroll position
		const savedScrollTop = quill.root.scrollTop;

		// Android: the formatText/getFormat calls below route through Quill's
		// selection.setNativeRange → document.getSelection().addRange(), which on Chromium
		// WebView side-effect-focuses (or re-asserts focus on) the contenteditable. If the
		// editor is not actively engaged (user dismissed the keyboard but tapping a non-
		// editable spot left focus on quill.root), this re-assertion can pop the soft
		// keyboard back up. Force inputmode="none" for the duration of the format loop in
		// that "focus-but-disengaged" state so the implicit focus side-effect stays silent.
		// NOTE: this is NOT the dead-end "wrap every Quill API" pattern from the failed
		// Android pan investigation — it's a single localized guard around one known
		// scroll-triggered side-effect-focus call site (applyProcessing).
		const isAndroid = this.editorSettings?.clientOs == ClientOs.Android;
		const inputmodeWasSet = isAndroid && (quill.root as HTMLElement).getAttribute('inputmode') === 'none';
		const editorIsDisengaged = isAndroid && document.activeElement === quill.root && !inputmodeWasSet;
		if(editorIsDisengaged) {
			(quill.root as HTMLElement).setAttribute('inputmode', 'none');
		}

		processes.forEach(process => {
			const textStart = process.index;
			const textEnd = process.index + process.length;

			if(process.property === 'misspelling' && process.value) {
				const overlapsSkipRange = skipRanges.some(range => textStart < range.end && textEnd > range.start);
				if(overlapsSkipRange) {
					return;
				}

				const segment = text.substring(textStart, textEnd);
				if(URL_EXACT_REGEX.test(segment) || EMAIL_EXACT_REGEX.test(segment)) {
					return;
				}
			}

			const quillIndex = QuillExtensions.convertTextOffsetToDeltaIndex(quill, primaryLine, lineIndex, lineLength, process.index);
			if(process.property === 'mention' && process.value) {
				// if the content at the location is part of a link, do not apply the mention
				const formats = quill.getFormat(quillIndex, 1);
				if(formats.link) {
					return;
				}
			}
			if(process.property === 'misspelling' && process.value) {
				const formats = quill.getFormat(quillIndex, process.length);
				if(formats.link) {
					return;
				}
				if(this._isActivelyTyping) {
					const sel = quill.getSelection();
					if(sel && sel.index >= quillIndex && sel.index <= quillIndex + process.length) {
						return;
					}
				}
			}
			quill.formatText(quillIndex, process.length, process.property, process.value, 'silent');
		});

		// Restore scroll position after formatting operations complete
		quill.root.scrollTop = savedScrollTop;
	}

	// Called from Blazor - batched counterpart to applyProcessing('cell-static').
	applyProcessingBatch(results: Array<{ cellId: string, hashValue: string, processes: JSTextProcess[] }>) {
		if(!results || results.length === 0) {
			return;
		}
		for(const r of results) {
			if(!r.cellId) {
				continue;
			}
			// Skip cells that activated between dispatch and apply - live editor owns them.
			if(this.tableState.editorCache[r.cellId]) {
				continue;
			}
			const cell = document.getElementById(r.cellId) as HTMLTableCellElement | null;
			if(!cell) {
				continue;
			}
			const result = QuillExtensions.applyTextProcessesToHtml(cell.innerHTML, r.processes);
			this.writeStaticCellHtml(cell, result.html);
			if(result.skipRanges.length > 0) {
				cell.dataset[MISSPELLING_SKIP_DATASET_KEY] = JSON.stringify(result.skipRanges);
			} else if(cell.dataset[MISSPELLING_SKIP_DATASET_KEY]) {
				delete cell.dataset[MISSPELLING_SKIP_DATASET_KEY];
			}
		}
	}

	private getCellQuillForProcessing(cellId?: string): any | null {
		const resolvedId = (cellId && cellId.length > 0) ? cellId : this.tableState.activeCellId;
		if(resolvedId && this.tableState.editorCache[resolvedId]?.quill) {
			return this.tableState.editorCache[resolvedId].quill;
		}
		if(this.cellNotesEditor) {
			const cellRoot = this.cellNotesEditor.root as HTMLElement | undefined;
			const rootCellId = cellRoot?.dataset?.tableCellId;
			if(!resolvedId || rootCellId === resolvedId) {
				return this.cellNotesEditor;
			}
		}
		return null;
	}

	public setReadOnlyInternal(quill: any, isReadOnly: boolean, isFirstCall: boolean, isCellEditor: boolean): void {
		if(!isFirstCall && quill.options.readOnly === isReadOnly) {
			// Ignore redundant calls
			return;
		}
		quill.options.readOnly = isReadOnly;
		this.editorSettings.readOnly = isReadOnly;
		this.activeInlineTooltip = null;
		this.savedPrimarySelection = null;
		this.savedCellSelection = new SavedCellSelection();
		this.hideLinkTooltip();
		quill.enable(!isReadOnly);
		if(!isCellEditor) {
			if(isReadOnly) {
				quill.root.classList.add('ql-read-only');
			} else {
				quill.root.classList.remove('ql-read-only');
				// Mentions are not displayed during editing so we need to clear their formatting
				this.clearMentionInformation(quill);
			}
		}
		this.setEditorClasses();

		if(isReadOnly) {
			this.removeAllTableControls();
		}
	}

	private removeTableControlsFromTable(table: HTMLTableElement): void {
		if(!table) return;
		this.withHistoryIgnored(() => {
			table.querySelectorAll('.ql-table-control').forEach(control => control.remove());
		});
		// Invalidate the shape cache so the next setupTableControls rebuilds rather
		// than short-circuiting on a matching signature with no controls present.
		delete table.dataset.tbShapeKey;
	}

	private removeAllTableControls(): void {
		if(!this.editorContainer) return;
		const container = this.editorContainer;
		this.withHistoryIgnored(() => {
			container.querySelectorAll('.ql-table-control').forEach(control => control.remove());
			// Invalidate shape caches so setupTableControls rebuilds rather than short-circuiting.
			container.querySelectorAll('table.ql-table-blot').forEach((t: any) => {
				delete t.dataset.tbShapeKey;
			});
		});
	}

	// Called from Blazor
	public setEditorSettings(editorSettings: NotesEditorSettings): void {
		if(!this.primaryNotesEditor) return;
		this.editorSettings = editorSettings;
		if(typeof this.editorSettings.collapseButtonVisibility !== 'number') {
			this.editorSettings.collapseButtonVisibility = OutlineCollapseButtonVisibility.OnHoverOfText;
		}

		this.reconcileAnimatedCarets();

		if(typeof editorSettings.textScalePercent === 'number') {
			this.setTextScale(editorSettings.textScalePercent);
		}

		// apply all settings that may affect the display of the content 

		this.setReadOnlyInternal(this.primaryNotesEditor, editorSettings.readOnly, false, false);
		
		// Update count visibility based on new settings
		this.updateCountVisibility();
		
		// If either count was just enabled, calculate and update immediately
		if(editorSettings.showWordCount || editorSettings.showCharacterCount) {
			this.updateTextCounts();
		}

		// Always process visible lines for auto-linking (URLs/emails)
		QuillExtensions.processVisibleLines(this.primaryNotesEditor, this);
		if(!editorSettings.doMentionProcessing) {
			this.clearMentionInformation(this.primaryNotesEditor);
		}

		if(this.imageControls) {
			this.imageControls.destroy();
			this.imageControls = null;
		}

		this.initSpellCheckState(this.primaryNotesEditor);
		this.refreshOutline();
		if(this.editorSettings.collapseButtonVisibility === OutlineCollapseButtonVisibility.Never) {
			this.collapseState.clear();
			this.applyCollapseState(false);
		}
		this.scheduleCollapseUiUpdate();

		// Reduce left padding on phones when collapse buttons are hidden
		const rootEl = this.primaryNotesEditor?.root as HTMLElement;
		if(rootEl) {
			rootEl.classList.toggle('venus-collapse-hidden-phone',
				this.editorSettings.isPhone && this.editorSettings.collapseButtonVisibility === OutlineCollapseButtonVisibility.Never);
		}

		// Android: default the contenteditable's `inputmode` to "none" so background Quill
		// operations that focus quill.root (setSelection, formatText, getFormat, etc.) do
		// not pop the soft keyboard during thought-navigation. The pointerdown handler
		// removes inputmode when the user genuinely interacts with the editor; the blur
		// handler re-arms it. This is the minimal fix needed to suppress the brief
		// keyboard flash that would otherwise occur on every navigation.
		if(this.editorSettings.clientOs == ClientOs.Android) {
			if(this.primaryNotesEditor?.root) {
				(this.primaryNotesEditor.root as HTMLElement).setAttribute('inputmode', 'none');
			}
			if(this.cellNotesEditor?.root) {
				(this.cellNotesEditor.root as HTMLElement).setAttribute('inputmode', 'none');
			}
		}

		// iOS: re-create the native UIScrollView "interactive keyboard dismiss" gesture in JS.
		// Native interactive dismissal (KeyboardDismissMode.Interactive on the WKScrollView) is
		// configured in iOSBlazorWebViewHandler.cs but never engages because the same handler
		// pins the WKScrollView (ScrollEnabled=false + KVO offset clamp) to prevent iOS from
		// auto-scrolling the whole webview when an input focuses. We can't unpin the scroll
		// view, so we install a document-level touch tracker that detects a sustained downward
		// drag while the soft keyboard is visible and an editable element has focus, then blurs
		// it to dismiss the keyboard. Installed once per page load.
		// iOS swipe-to-dismiss-keyboard: mimic native iOS behavior where the user must
		// drag their finger INTO the keyboard region and past a threshold before the
		// keyboard dismisses. Normal scrolling and selection handle drags above the
		// keyboard never trigger a dismiss.
		if(this.editorSettings.clientOs == ClientOs.iOS && !(window as any).__iosSwipeDismissInstalled) {
			(window as any).__iosSwipeDismissInstalled = true;
			let tracking = false;
			let enteredKeyboard = false;
			let lastSelectionStr = '';
			const DISMISS_THRESHOLD_PX = 30;

			const isEditableTarget = (el: Element | null): boolean => {
				if(!el) return false;
				const tag = el.tagName;
				if(tag === 'INPUT' || tag === 'TEXTAREA') return true;
				if((el as HTMLElement).isContentEditable) return true;
				return false;
			};

			const getKeyboardTop = (): number => {
				const raw = getComputedStyle(document.documentElement).getPropertyValue('--keyboard-height').trim();
				const kbHeight = parseFloat(raw) || 0;
				return kbHeight > 0 ? window.innerHeight - kbHeight : -1;
			};

			const getSelectionSignature = (): string => {
				const sel = window.getSelection();
				if(!sel || sel.rangeCount === 0) return '';
				const r = sel.getRangeAt(0);
				return `${r.startOffset}:${r.endOffset}:${r.collapsed}`;
			};

			document.addEventListener('touchstart', (e: TouchEvent) => {
				tracking = false;
				enteredKeyboard = false;
				if(e.touches.length !== 1) return;
				const kbTop = getKeyboardTop();
				if(kbTop < 0 || !isEditableTarget(document.activeElement)) return;
				// Don't track touches that start inside the floating phone toolbar —
				// the user is scrolling through toolbar buttons, not dismissing.
				if((e.target as Element)?.closest('#venus-editor-toolbar-container')) return;
				tracking = true;
				lastSelectionStr = getSelectionSignature();
			}, { capture: true, passive: true });

			document.addEventListener('touchmove', (e: TouchEvent) => {
				if(!tracking || e.touches.length !== 1) return;

				// If the text selection is changing, the user is dragging a selection
				// handle — not swiping to dismiss the keyboard. Abort tracking.
				const currentSel = getSelectionSignature();
				if(currentSel !== lastSelectionStr) {
					tracking = false;
					return;
				}

				const touchY = e.touches[0].clientY;
				const kbTop = getKeyboardTop();
				if(kbTop < 0) {
					tracking = false;
					return;
				}

				if(!enteredKeyboard) {
					if(touchY >= kbTop) {
						enteredKeyboard = true;
					}
				}

				if(enteredKeyboard) {
					const depthIntoKeyboard = touchY - kbTop;
					if(depthIntoKeyboard >= DISMISS_THRESHOLD_PX) {
						const active = document.activeElement as HTMLElement | null;
						if(active && isEditableTarget(active)) {
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

	// Create/dispose AnimatedCaret on already-attached editors so toggling the
	// user setting takes effect without a page reload.
	private reconcileAnimatedCarets(): void {
		const want = !!this.editorSettings.animateTextCursor;
		const editors = [this.primaryNotesEditor, this.cellNotesEditor].filter(q => !!q);
		for(const quill of editors) {
			const existing = this._animatedCarets.get(quill);
			if(want && !existing) {
				this._animatedCarets.set(quill, new AnimatedCaret(quill));
			} else if(!want && existing) {
				existing.dispose();
				this._animatedCarets.delete(quill);
			}
		}
	}

	private clearMentionInformation(targetEditor?: any): void {
		const editor = targetEditor ?? this.primaryNotesEditor;
		if(!editor) return;
		editor.formatText(0, editor.getLength(), 'mention', '', 'silent');
		const lines = editor.getLines();
		for(const line of lines) {
			const domNode = line?.domNode as HTMLElement | undefined;
			if(domNode?.dataset?.processedHash) {
				delete domNode.dataset.processedHash;
			}
			if(domNode?.dataset?.[MISSPELLING_SKIP_DATASET_KEY]) {
				delete domNode.dataset[MISSPELLING_SKIP_DATASET_KEY];
			}
		}

		const rootNode = editor.root as HTMLElement | undefined;
		if(rootNode) {
			const tableCells = rootNode.querySelectorAll('table.ql-table-blot td');
			tableCells.forEach(cellElement => {
				const cell = cellElement as HTMLTableCellElement;
				const cleanedHtml = QuillExtensions.clearMentionAndMisspellingFromHtml(cell.innerHTML);
				if(cell.innerHTML !== cleanedHtml) {
					this.writeStaticCellHtml(cell, cleanedHtml);
				}
				if(cell.dataset[CELL_PROCESSED_HASH_DATASET_KEY]) {
					delete cell.dataset[CELL_PROCESSED_HASH_DATASET_KEY];
				}
				if(cell.dataset[MISSPELLING_SKIP_DATASET_KEY]) {
					delete cell.dataset[MISSPELLING_SKIP_DATASET_KEY];
				}
			});
		}
	}

	// Called from Blazor
	public getContentAsHtml(): string {
		if(!this.primaryNotesEditor) return '';

		let html = this.primaryNotesEditor.getSemanticHTML();
		html = this.removeMentionSpansAndConvertRelativeLinks(html);
		return html;
	}

	public toggleCollapseAtSelection(): void {
		const editor = this.notesEditor();
		if(!editor) {
			return;
		}
		this.refreshOutline(editor);
		const range = this.getSelectionWithFallback();
		if(!range) {
			return;
		}
		const block = this.getNearestCollapsibleBlockForIndex(range.index);
		if(!block) {
			return;
		}
		this.toggleCollapseById(block.id, true);
	}

	public collapseAll(): void {
		if(this.editorSettings.collapseButtonVisibility === OutlineCollapseButtonVisibility.Never) {
			return;
		}
		this.refreshOutline();
		let changed = false;
		for(const block of this.outlineBlocks) {
			if(block.isCollapsible) {
				this.collapseState.set(block.id, { isCollapsed: true });
				block.isCollapsed = true;
				changed = true;
			}
		}
		if(changed) {
			this.collapseAnimationMode = 'multi';
			this.applyCollapseState(true);
			this.scheduleCollapseUiUpdate();
		}
	}

	private updateMoveLineCommandStates(rangeOverride?: { index: number; length: number } | null): void {
		if(!this.dotNetHelper) {
			return;
		}
		const disabledState = {
			'Notes.MoveLineUp': false,
			'Notes.MoveLineDown': false,
			'VenusEditor.MoveUp': false,
			'VenusEditor.MoveDown': false
		};

		if(this.activeEditor === 'cell') {
			safeInvoke(this.dotNetHelper, 'UpdateCommandStates', [disabledState]);
			return;
		}

		const editor = this.notesEditor();
		if(!editor) {
			safeInvoke(this.dotNetHelper, 'UpdateCommandStates', [disabledState]);
			return;
		}

		const range = rangeOverride === undefined ? this.getSelectionWithFallback() : rangeOverride;
		let canMoveUp = false;
		let canMoveDown = false;

		if(range) {
			const documentLength = editor.getLength();
			if(documentLength > 1) {
				const startLineInfo = editor.getLine(range.index);
				const startLine = startLineInfo ? startLineInfo[0] : null;
				const startOffset = startLineInfo && typeof startLineInfo[1] === 'number' ? startLineInfo[1] : 0;
				if(startLine) {
					const blockStart = range.index - startOffset;
					let lastIndex = range.length > 0 ? range.index + range.length - 1 : range.index;
					if(lastIndex >= documentLength) {
						lastIndex = documentLength - 1;
					}
					const endLineInfo = editor.getLine(lastIndex);
					const endLine = endLineInfo ? endLineInfo[0] : null;
					const endOffset = endLineInfo && typeof endLineInfo[1] === 'number' ? endLineInfo[1] : 0;
					if(endLine) {
						const blockEnd = lastIndex - endOffset + endLine.length();
						const blockLength = blockEnd - blockStart;
						if(blockLength > 0) {
							if(blockStart > 0) {
								const prevLineInfo = editor.getLine(blockStart - 1);
								canMoveUp = !!(prevLineInfo && prevLineInfo[0]);
							}
							const afterIndex = blockStart + blockLength;
							if(afterIndex < documentLength) {
								const nextLineInfo = editor.getLine(afterIndex);
								const nextLine = nextLineInfo ? nextLineInfo[0] : null;
								if(nextLine) {
									canMoveDown = true;
								}
							}
						}
					}
				}
			}
		}

		const stateUpdates: Record<string, boolean> = {
			'Notes.MoveLineUp': canMoveUp,
			'Notes.MoveLineDown': canMoveDown,
			'VenusEditor.MoveUp': canMoveUp,
			'VenusEditor.MoveDown': canMoveDown
		};
		safeInvoke(this.dotNetHelper, 'UpdateCommandStates', [stateUpdates]);
	}

	private updateTableCommandStates(): void {
		if(!this.dotNetHelper) {
			return;
		}
		const isInTable = this.isCellEditorActive();
		const stateUpdates: Record<string, boolean> = {
			'Notes.Table': isInTable,
			'Notes.InsertMathematicalExpression': true,
		};

		// Compute move boundary states
		const context = this.getTableContext();
		if(context) {
			const totalRows = context.table.rows.length;
			const totalCols = context.table.rows[0]?.cells.length ?? 0;
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

			// Merge states: check for adjacent table
			const tableAbove = TableBlot.findAdjacentTable(context.table, 'above');
			const tableBelow = TableBlot.findAdjacentTable(context.table, 'below');
			stateUpdates['Notes.Table.MergeTableAbove'] = tableAbove !== null;
			stateUpdates['Notes.Table.MergeTableBelow'] = tableBelow !== null;
		} else {
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
		safeInvoke(this.dotNetHelper, 'UpdateTableSelectionCounts',
			[context?.rowCount ?? 1, context?.columnCount ?? 1]);
	}

	private updateOutlineCommandStates(rangeOverride?: { index: number; length: number } | null): void {
		if(!this.dotNetHelper) {
			return;
		}
		const hasCollapsible = this.outlineBlocks.some(block => block.isCollapsible);
		const anyCollapsed = this.outlineBlocks.some(block => block.isCollapsible && (this.collapseState.get(block.id)?.isCollapsed ?? block.isCollapsed));
		const anyExpanded = this.outlineBlocks.some(block => block.isCollapsible && !(this.collapseState.get(block.id)?.isCollapsed ?? block.isCollapsed));
		const range = rangeOverride === undefined ? this.getSelectionWithFallback() : rangeOverride;
		let canToggle = false;
		let canCollapseHere = false;
		let canExpandHere = false;
		let targetBlock: OutlineBlock | null = null;
		if(range) {
			targetBlock = this.getNearestCollapsibleBlockForIndex(range.index);
			canToggle = targetBlock !== null;
		}

		if(targetBlock) {
			const isCollapsed = targetBlock.isCollapsible && (this.collapseState.get(targetBlock.id)?.isCollapsed ?? targetBlock.isCollapsed);
			canCollapseHere = targetBlock.isCollapsible && !isCollapsed;

			let hasCollapsedInside = false;
			for(let pos = targetBlock.outlinePosition + 1; pos <= targetBlock.outlineEndPosition; pos++) {
				const candidate = this.outlineBlocks[pos];
				if(!candidate || !candidate.isCollapsible) {
					continue;
				}
				const candidateCollapsed = this.collapseState.get(candidate.id)?.isCollapsed ?? candidate.isCollapsed;
				if(candidateCollapsed) {
					hasCollapsedInside = true;
					break;
				}
			}
			canExpandHere = hasCollapsedInside;
		}
		const stateUpdates: Record<string, boolean> = {
			'Notes.CollapseAll': hasCollapsible && anyExpanded,
			'Notes.CollapseAllExceptHere': hasCollapsible,
			'Notes.CollapseHere': canCollapseHere,
			'Notes.ExpandCollapseToggle': canToggle,
			'Notes.ExpandHere': canExpandHere,
			'Notes.ExpandAll': anyCollapsed
		};
		safeInvoke(this.dotNetHelper, 'UpdateCommandStates', [stateUpdates]);
	}

	public expandAll(): void {
		this.refreshOutline();
		if(this.collapseState.size === 0) {
			return;
		}
		this.collapseState.clear();
		for(const block of this.outlineBlocks) {
			block.isCollapsed = false;
		}
		this.collapseAnimationMode = 'multi';
		this.applyCollapseState(true);
		this.scheduleCollapseUiUpdate();
	}

	public collapseAllHere(): void {
		if(this.editorSettings.collapseButtonVisibility === OutlineCollapseButtonVisibility.Never) {
			return;
		}
		const editor = this.notesEditor();
		if(!editor) {
			return;
		}
		this.refreshOutline(editor);
		const range = this.getSelectionWithFallback();
		if(!range) {
			return;
		}
		const block = this.getNearestCollapsibleBlockForIndex(range.index);
		if(!block) {
			return;
		}
		let changed = false;
		if(block.isCollapsible) {
			for(let pos = block.outlinePosition + 1; pos <= block.outlineEndPosition; pos++) {
				const candidate = this.outlineBlocks[pos];
				if(!candidate || !candidate.isCollapsible) {
					continue;
				}
				const state = this.collapseState.get(candidate.id);
				if(!state?.isCollapsed) {
					this.collapseState.set(candidate.id, { isCollapsed: true });
					changed = true;
				}
				if(!candidate.isCollapsed) {
					candidate.isCollapsed = true;
					changed = true;
				}
			}
		}
		if(changed) {
			this.collapseAnimationMode = 'multi';
			this.applyCollapseState(true);
			this.scheduleCollapseUiUpdate();
		}
	}

	public expandAllHere(): void {
		const editor = this.notesEditor();
		if(!editor) {
			return;
		}
		this.refreshOutline(editor);
		const range = this.getSelectionWithFallback();
		if(!range) {
			return;
		}
		const block = this.getNearestCollapsibleBlockForIndex(range.index);
		if(!block) {
			return;
		}
		let changed = false;
		if(block.isCollapsible) {
			if(this.collapseState.delete(block.id)) {
				changed = true;
			}
			if(block.isCollapsed) {
				block.isCollapsed = false;
				changed = true;
			}
			for(let pos = block.outlinePosition + 1; pos <= block.outlineEndPosition; pos++) {
				const candidate = this.outlineBlocks[pos];
				if(!candidate || !candidate.isCollapsible) {
					continue;
				}
				if(this.collapseState.delete(candidate.id)) {
					changed = true;
				}
				if(candidate.isCollapsed) {
					candidate.isCollapsed = false;
					changed = true;
				}
			}
		}
		if(changed) {
			this.collapseAnimationMode = 'multi';
			this.applyCollapseState(true);
			this.scheduleCollapseUiUpdate();
		}
	}

	public collapseAllExceptSelection(): void {
		if(this.editorSettings.collapseButtonVisibility === OutlineCollapseButtonVisibility.Never) {
			return;
		}
		const editor = this.notesEditor();
		if(!editor) {
			return;
		}
		this.refreshOutline(editor);
		const range = this.getSelectionWithFallback();
		if(!range) {
			return;
		}
		const selectionStartBlock = this.getOutlineBlockForIndex(range.index);
		const selectionEndBlock = range.length === 0 ? selectionStartBlock : this.getOutlineBlockForIndex(range.index + range.length - 1);
		let changed = false;
		for(const block of this.outlineBlocks) {
			if(!block.isCollapsible) {
				continue;
			}
			const overlapsSelection = this.doesBlockOverlapSelection(block, selectionStartBlock, selectionEndBlock);
			if(overlapsSelection) {
				if(this.collapseState.delete(block.id)) {
					changed = true;
				}
				if(block.isCollapsed) {
					block.isCollapsed = false;
					changed = true;
				}
			} else {
				const alreadyCollapsed = this.collapseState.get(block.id)?.isCollapsed ?? block.isCollapsed;
				if(!alreadyCollapsed) {
					this.collapseState.set(block.id, { isCollapsed: true });
					block.isCollapsed = true;
					changed = true;
				}
			}
		}
		if(changed) {
			this.collapseAnimationMode = 'multi';
			this.applyCollapseState(true);
			this.scheduleCollapseUiUpdate();
		}
	}

	public canToggleCollapseAtSelection(): boolean {
		const editor = this.notesEditor();
		if(!editor) {
			return false;
		}
		this.refreshOutline(editor);
		const range = this.getSelectionWithFallback();
		if(!range) {
			return false;
		}
		return this.getNearestCollapsibleBlockForIndex(range.index) !== null;
	}

	public hasCollapsibleBlocks(): boolean {
		this.refreshOutline();
		for(const block of this.outlineBlocks) {
			if(block.isCollapsible) {
				return true;
			}
		}
		return false;
	}

	// Called from Blazor
	public getContentPackage(): ContentPackage {
		const perfTimer = NotesPerfTimer.start('getContentPackage');
		if(!this.primaryNotesEditor) {
			perfTimer.stop();
			return new ContentPackage();
		}
		const quillDelta = this.primaryNotesEditor.getContents();
		perfTimer.step('getContents');
		// Prepare the content package
		const contentPackage = new ContentPackage();
		// Convert to JSON string
		contentPackage.quillDelta = JSON.stringify(quillDelta);
		perfTimer.step('jsonStringify');
		contentPackage.metaData = this.metaData;
		perfTimer.withContext('ops', quillDelta.ops.length);
		perfTimer.stop();
		return contentPackage;
	}

	// Called from Blazor
	public getMetaDataPackage(): MetaDataPackage {
		const metaDataPackage = new MetaDataPackage();
		metaDataPackage.metaData = this.metaData;
		metaDataPackage.isDirty = this.isDirty;
		return metaDataPackage;
	}

	// Helper method to detect potentially problematic regex patterns
	private isProblematicRegexPattern(pattern: string): boolean {
		// Don't validate empty patterns
		if (!pattern || pattern.length === 0) return false;
		
		// Patterns that end with escape character
		if (pattern.endsWith('\\')) return true;
		
		// Patterns that are just boundary assertions (likely incomplete)
		if (pattern === '\\b' || pattern === '\\B' || pattern === '^' || pattern === '$') return true;
		
		// Patterns with unmatched brackets/parentheses
		const openBrackets = (pattern.match(/\[/g) || []).length;
		const closeBrackets = (pattern.match(/\]/g) || []).length;
		if (openBrackets !== closeBrackets) return true;
		
		const openParens = (pattern.match(/\(/g) || []).length;
		const closeParens = (pattern.match(/\)/g) || []).length;
		if (openParens !== closeParens) return true;
		
		const openBraces = (pattern.match(/\{/g) || []).length;
		const closeBraces = (pattern.match(/\}/g) || []).length;
		if (openBraces !== closeBraces) return true;
		
		// Patterns that start with quantifiers (invalid)
		if (/^[*+?{]/.test(pattern)) return true;
		
		// Incomplete escape sequences
		if (/\\$/.test(pattern)) return true;
		
		return false;
	}

	// Called from Blazor - Main entry point for Find and Replace functionality
	public executeFindReplace(findText: string, replaceText: string, caseSensitive: boolean, wholeWord: boolean, useRegex: boolean, action: string): void {
		// Check if search parameters changed
		const searchChanged = this.searchState.findText !== findText || 
			this.searchState.caseSensitive !== caseSensitive || 
			this.searchState.wholeWord !== wholeWord ||
			this.searchState.useRegex !== useRegex;
		
		if (searchChanged) {
			this.searchState.findText = findText;
			this.searchState.caseSensitive = caseSensitive;
			this.searchState.wholeWord = wholeWord;
			this.searchState.useRegex = useRegex;
			
			// Refresh search results
			this.performSearch(findText, caseSensitive, wholeWord, useRegex);
			
			// If search changed and action is FindNext, we've already selected the first match
			// so don't execute FindNext again
			if (action === 'FindNext') {
				return;
			}
		}
		
		this.searchState.replaceText = replaceText;
		
		// Execute the requested action
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

	// Called from Blazor when the Find/Replace bar is dismissed.
	// Selects the currently highlighted match in the editor so the caret lands on it,
	// then clears search state and focuses the editor.
	public dismissFindReplaceBar(): void {
		const quill = this.notesEditor();
		const matches = this.searchState.matches;
		const idx = this.searchState.currentMatchIndex;
		const hasCurrentMatch = quill && idx >= 0 && idx < matches.length;

		let deltaIndex = -1;
		let deltaLength = 0;
		if(hasCurrentMatch) {
			deltaIndex = matches[idx].deltaIndex;
			deltaLength = matches[idx].deltaLength;
		}

		this.clearSearchState();

		if(quill) {
			if(hasCurrentMatch) {
				quill.setSelection(deltaIndex, deltaLength, 'user');
			}
			quill.focus();
		}
	}

	// Called from Blazor when a note-content search result is activated. Highlights every match of the
	// query in the notes editor and scrolls to the first, reusing the Find/Replace search machinery.
	// On thought activation the notes editor is shown but not the focused/active editor, so the search
	// has no live editor to work against - focus it first. One-shot: clears on the next edit or click.
	public highlightSearchTerm(findText: string): void {
		if(!findText) {
			return;
		}
		// Make the primary notes editor active and focus it so performSearch runs against it.
		this.activeEditor = 'primary';
		const quill = this.notesEditor();
		if(!quill) {
			return;
		}
		quill.focus();

		this.searchState.findText = findText;
		this.searchState.caseSensitive = false;
		this.searchState.wholeWord = false;
		this.searchState.useRegex = false;
		this.searchState.currentMatchIndex = -1;
		this.performSearch(findText, false, false, false, true);
		if(this.searchState.matches.length === 0) {
			this.clearSearchState();
			return;
		}

		// The notes pane may still be sizing right after activation, so the first getBounds pass can
		// place the rects at the top-left. Reposition and re-scroll once layout settles.
		const reposition = () => {
			if(this.searchState.matches.length === 0) {
				return;
			}
			this.updateHighlights();
			this.scrollToCurrentMatch();
		};
		requestAnimationFrame(reposition);
		this.safeSetTimeout(reposition, 250);

		// One-shot: clear on the user's next edit, next click in the note, or - via
		// clearResultHighlightIfShowing - when the editor loses focus (the plex/toolbar is clicked).
		const clear = () => {
			quill.off('text-change', onTextChange);
			quill.root.removeEventListener('mousedown', clear);
			this.dismissResultHighlight = null;
			this.clearSearchState();
		};
		const onTextChange = (_delta: any, _oldDelta: any, source: string) => {
			if(source === 'user') {
				clear();
			}
		};
		quill.on('text-change', onTextChange);
		quill.root.addEventListener('mousedown', clear);
		this.dismissResultHighlight = clear;
	}

	// Called from Blazor when the notes editor loses focus (e.g. the plex or toolbar is clicked), so a
	// click outside the editor dismisses the highlight too.
	public clearResultHighlightIfShowing(): void {
		if(this.dismissResultHighlight) {
			this.dismissResultHighlight();
		}
	}

	// Called from Blazor
	public clearSearchState(): void {
		// Clear any pending refresh timers
		if(this.searchRefreshTimer) {
			clearTimeout(this.searchRefreshTimer);
			this.searchRefreshTimer = null;
		}
		if(this.resizeRefreshTimer) {
			clearTimeout(this.resizeRefreshTimer);
			this.resizeRefreshTimer = null;
		}
		
		// Remove all highlights
		this.clearHighlights();
		
		// Reset search state
		this.searchState.findText = '';
		this.searchState.replaceText = '';
		this.searchState.caseSensitive = false;
		this.searchState.wholeWord = false;
		this.searchState.matches = [];
		this.searchState.currentMatchIndex = -1;
		this.searchState.textToDeltaMap = [];
		this.searchState.deltaToTextMap = [];
	}

	private performSearch(findText: string, caseSensitive: boolean, wholeWord: boolean, useRegex: boolean = false, scrollToMatch: boolean = true): void {
		if (!findText || !this.notesEditor()) return;
		
		// Clear previous search results
		this.clearHighlights();
		this.searchState.matches = [];
		this.searchState.currentMatchIndex = -1;
		
		// Get the editor content as Delta
		const delta = this.notesEditor().getContents();
		
		// Build searchable text and position mappings
		const {searchText, textToDeltaMap, deltaToTextMap} = this.buildSearchableText(delta);
		
		this.searchState.textToDeltaMap = textToDeltaMap;
		this.searchState.deltaToTextMap = deltaToTextMap;
		
		if (!searchText) {
			this.updateMatchInfo();
			return;
		}
		
		// Create regex for searching
		let flags = 'g'; // global
		if (!caseSensitive) flags += 'i'; // case insensitive
		
		let pattern = findText;
		if (useRegex) {
			// Early validation for obviously problematic patterns
			if (this.isProblematicRegexPattern(findText)) {
				safeInvoke(this.dotNetHelper, 'ShowFindReplaceRegexError', ['Pattern appears incomplete - continue typing']);
				this.updateMatchInfo();
				return;
			}
			
			// Use the search text as a regex pattern directly
			// Don't escape, but wrap with word boundaries if wholeWord is enabled
			if (wholeWord) {
				pattern = '\\b(?:' + pattern + ')\\b';
			}
		} else {
			// Escape special regex characters for literal search
			pattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			if (wholeWord) {
				pattern = '\\b' + pattern + '\\b';
			}
		}
		
		let regex: RegExp;
		try {
			regex = new RegExp(pattern, flags);
		} catch (e) {
			// Invalid regex pattern - notify the UI and treat as no matches
			console.warn('Invalid regex pattern:', pattern, e);
			safeInvoke(this.dotNetHelper, 'ShowFindReplaceRegexError', ['Invalid regular expression']);
			this.updateMatchInfo();
			return;
		}
		
		let match;
		let matchCount = 0;
		const MAX_MATCHES = 10000; // Prevent excessive matches
		const startTime = Date.now();
		const TIMEOUT_MS = 1000; // 1 second timeout
		
		// Find all matches in the searchable text with protection against infinite loops
		while ((match = regex.exec(searchText)) !== null) {
			// Check for timeout
			if (Date.now() - startTime > TIMEOUT_MS) {
				console.warn('Regex search timed out after', TIMEOUT_MS, 'ms');
				safeInvoke(this.dotNetHelper, 'ShowFindReplaceRegexError', ['Search operation timed out - pattern too complex']);
				this.updateMatchInfo();
				return;
			}
			
			// Check for too many matches
			if (++matchCount > MAX_MATCHES) {
				console.warn('Regex search found too many matches (>', MAX_MATCHES, ')');
				safeInvoke(this.dotNetHelper, 'ShowFindReplaceRegexError', ['Too many matches found - please refine your pattern']);
				this.updateMatchInfo();
				return;
			}
			
			const textIndex = match.index;
			const textLength = match[0].length;
			
			// Protect against infinite loops from zero-length matches
			if (textLength === 0) {
				// If we matched at the same position as last time, advance manually
				if (regex.lastIndex === textIndex) {
					regex.lastIndex = textIndex + 1;
				}
				// Skip zero-length matches to avoid UI clutter
				continue;
			}
			
			// Convert text positions to Delta positions
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
		
		// Auto-select first match only if no match was previously selected
		if (this.searchState.matches.length > 0 && this.searchState.currentMatchIndex === -1) {
			// Try to start from the cursor position
			const lastSelection = this.getSelectionWithFallback();
			if (lastSelection && lastSelection.index >= 0) {
				// Find the first match after the cursor position
				let startIndex = 0;
				for (let i = 0; i < this.searchState.matches.length; i++) {
					if (this.searchState.matches[i].deltaIndex >= lastSelection.index) {
						startIndex = i;
						break;
					}
				}
				// If no match found after cursor, wrap to beginning
				this.searchState.currentMatchIndex = startIndex;
			} else {
				// No cursor position available, start at the beginning
				this.searchState.currentMatchIndex = 0;
			}
		}
		
		// Update highlights and UI
		this.updateHighlights();
		this.updateMatchInfo();

		// Scroll to first match if found (only if explicitly requested)
		if(scrollToMatch && this.searchState.matches.length > 0) {
			this.scrollToCurrentMatch();
		}
	}

	private buildSearchableText(delta: any): {searchText: string, textToDeltaMap: Array<{textIndex: number, deltaIndex: number}>, deltaToTextMap: Array<{deltaIndex: number, textIndex: number}>} {
		let searchText = '';
		const textToDeltaMap: Array<{textIndex: number, deltaIndex: number}> = [];
		const deltaToTextMap: Array<{deltaIndex: number, textIndex: number}> = [];
		let deltaIndex = 0;
		
		for (const op of delta.ops) {
			if (typeof op.insert === 'string') {
				// Regular text content
				const text = op.insert;
				
				// Map each character position
				for (let i = 0; i < text.length; i++) {
					textToDeltaMap.push({textIndex: searchText.length + i, deltaIndex: deltaIndex + i});
					deltaToTextMap.push({deltaIndex: deltaIndex + i, textIndex: searchText.length + i});
				}
				
				searchText += text;
				deltaIndex += text.length;
			} else if (typeof op.insert === 'object') {
				// Embed content (images, tables, horizontal rules, etc.)
				// Represent as a single space character in search text
				textToDeltaMap.push({textIndex: searchText.length, deltaIndex: deltaIndex});
				deltaToTextMap.push({deltaIndex: deltaIndex, textIndex: searchText.length});
				
				searchText += ' ';
				deltaIndex += 1; // Embeds are length 1 in Delta
			}
		}
		
		return {searchText, textToDeltaMap, deltaToTextMap};
	}

	private textToDeltaPosition(textIndex: number, textToDeltaMap: Array<{textIndex: number, deltaIndex: number}>): number | null {
		// Find the closest mapping entry
		for (let i = 0; i < textToDeltaMap.length; i++) {
			if (textToDeltaMap[i].textIndex === textIndex) {
				return textToDeltaMap[i].deltaIndex;
			}
			if (textToDeltaMap[i].textIndex > textIndex) {
				// We've gone past the target, use the previous entry
				return i > 0 ? textToDeltaMap[i - 1].deltaIndex : 0;
			}
		}
		
		// If we didn't find an exact match and didn't go past it, use the last entry
		return textToDeltaMap.length > 0 ? textToDeltaMap[textToDeltaMap.length - 1].deltaIndex : null;
	}

	private updateMatchInfo(): void {
		const currentIndex = this.searchState.currentMatchIndex >= 0 ? this.searchState.currentMatchIndex + 1 : 0;
		const totalMatches = this.searchState.matches.length;
		
		safeInvoke(this.dotNetHelper, 'UpdateFindReplaceMatchInfo', [currentIndex, totalMatches]);
	}

	private clearHighlights(): void {
		// Remove existing highlight elements
		this.searchState.highlightElements.forEach(el => {
			if (el.parentNode) {
				el.parentNode.removeChild(el);
			}
		});
		this.searchState.highlightElements = [];
		
		// Also clean up the highlight container if it exists
		if (this.notesEditor()) {
			const editor = this.notesEditor();
			const highlightContainer = editor.container.querySelector('.find-replace-highlight-container');
			if (highlightContainer) {
				highlightContainer.innerHTML = '';
			}
		}
	}

	private updateHighlights(): void {
		this.clearHighlights();

		if (!this.notesEditor() || this.searchState.matches.length === 0) return;

		const editor = this.notesEditor();

		// Create a container for highlights if it doesn't exist
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

		// Get the scale factor to adjust highlight positioning
		const scale = getScaleFactor(editor.container);

		// Create highlights for all matches
		this.searchState.matches.forEach((match, index) => {
			const bounds = editor.getBounds(match.deltaIndex, match.deltaLength);
			const isCurrentMatch = index === this.searchState.currentMatchIndex;

			const highlight = this.createHighlightElement(bounds, isCurrentMatch);
			this.searchState.highlightElements.push(highlight);

			// Position the highlight relative to the editor container, accounting for scale
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

	private createHighlightElement(bounds: any, isCurrentMatch: boolean): HTMLElement {
		const highlight = document.createElement('div');
		highlight.className = isCurrentMatch ? 'find-replace-current' : 'find-replace-highlight';
		
		// Default styles if CSS classes don't exist
		if (isCurrentMatch) {
			highlight.style.backgroundColor = 'rgba(255, 165, 0, 0.4)'; // Orange for current
			highlight.style.outline = '1px solid rgba(255, 165, 0, 0.8)'; // Orange outline for current
		} else {
			highlight.style.backgroundColor = 'rgba(255, 255, 0, 0.3)'; // Yellow for others
		}
		
		highlight.style.borderRadius = '2px';
		return highlight;
	}

	private scrollToCurrentMatch(): void {
		if (this.searchState.currentMatchIndex < 0 || 
			this.searchState.currentMatchIndex >= this.searchState.matches.length || 
			!this.notesEditor()) return;
		
		// Find the current highlight element
		const currentHighlight = this.searchState.highlightElements[this.searchState.currentMatchIndex];
		if (!currentHighlight) return;
		
		// Use the native scrollIntoView with centering
		currentHighlight.scrollIntoView({
			behavior: 'smooth',
			block: 'center',
			inline: 'nearest'
		});
	}

	private findNext(): void {
		if (this.searchState.matches.length === 0) return;
		
		this.searchState.currentMatchIndex = (this.searchState.currentMatchIndex + 1) % this.searchState.matches.length;
		this.updateHighlights();
		this.updateMatchInfo();
		this.scrollToCurrentMatch();
	}

	private findPrevious(): void {
		if (this.searchState.matches.length === 0) return;
		
		this.searchState.currentMatchIndex = this.searchState.currentMatchIndex <= 0 
			? this.searchState.matches.length - 1 
			: this.searchState.currentMatchIndex - 1;
		this.updateHighlights();
		this.updateMatchInfo();
		this.scrollToCurrentMatch();
	}

	private replaceCurrent(): void {
		if (this.searchState.currentMatchIndex < 0 || 
			this.searchState.currentMatchIndex >= this.searchState.matches.length || 
			!this.notesEditor()) return;
		
		const match = this.searchState.matches[this.searchState.currentMatchIndex];
		const editor = this.notesEditor();
		
		// Remember the position after the replacement
		const replacementEndPosition = match.deltaIndex + this.searchState.replaceText.length;
		
		// Perform the replacement
		editor.deleteText(match.deltaIndex, match.deltaLength, 'user');
		editor.insertText(match.deltaIndex, this.searchState.replaceText, 'user');
		
		// Refresh search to update positions
		this.performSearch(this.searchState.findText, this.searchState.caseSensitive, this.searchState.wholeWord, this.searchState.useRegex);
		
		// Find the next match after the replacement position
		if (this.searchState.matches.length > 0) {
			// Find the first match that starts at or after the replacement end position
			let nextMatchIndex = 0;
			for (let i = 0; i < this.searchState.matches.length; i++) {
				if (this.searchState.matches[i].deltaIndex >= replacementEndPosition) {
					nextMatchIndex = i;
					break;
				}
			}
			
			// If no match found after the replacement, wrap to the beginning
			this.searchState.currentMatchIndex = nextMatchIndex;
			this.updateHighlights();
			this.updateMatchInfo();
			this.scrollToCurrentMatch();
		}
	}

	private replaceAll(): void {
		if (this.searchState.matches.length === 0 || !this.notesEditor()) return;
		
		const editor = this.notesEditor();
		
		// Sort matches by position in descending order to maintain position integrity
		const sortedMatches = [...this.searchState.matches].sort((a, b) => b.deltaIndex - a.deltaIndex);
		
		// Group replacements for undo/redo
		editor.history.cutoff();
		
		// Perform all replacements
		for (const match of sortedMatches) {
			editor.deleteText(match.deltaIndex, match.deltaLength, 'user');
			editor.insertText(match.deltaIndex, this.searchState.replaceText, 'user');
		}
		
		editor.history.cutoff();
		
		// Clear search state as all matches have been replaced
		this.clearSearchState();
		this.updateMatchInfo();
	}
	
	private refreshSearchAfterEdit(): void {
		// Debounce the search refresh to avoid too many updates
		if(this.searchRefreshTimer) {
			clearTimeout(this.searchRefreshTimer);
		}
		this.searchRefreshTimer = setTimeout(() => {
			// Remember current match position before refresh
			const currentMatch = this.searchState.currentMatchIndex >= 0 &&
			this.searchState.currentMatchIndex < this.searchState.matches.length ?
				this.searchState.matches[this.searchState.currentMatchIndex] : null;

			// Refresh the search without scrolling (user is editing, not navigating)
			this.performSearch(this.searchState.findText, this.searchState.caseSensitive, this.searchState.wholeWord, this.searchState.useRegex, false);

			// Try to maintain position near where we were
			if(currentMatch && this.searchState.matches.length > 0) {
				// Find the closest match to where we were
				let closestIndex = 0;
				let closestDistance = Number.MAX_VALUE;

				for(let i = 0; i < this.searchState.matches.length; i++) {
					const distance = Math.abs(this.searchState.matches[i].deltaIndex - currentMatch.deltaIndex);
					if(distance < closestDistance) {
						closestDistance = distance;
						closestIndex = i;
					}
				}

				this.searchState.currentMatchIndex = closestIndex;
				this.updateHighlights();
				this.updateMatchInfo();
			}
		}, 20); // 20ms debounce
	}

	private refreshSearchAfterResize(): void {
		// Only refresh if Find & Replace is active with matches
		if(this.searchState.findText && this.searchState.matches.length > 0) {
			// Debounce the resize refresh to improve performance with many matches
			if(this.resizeRefreshTimer) {
				clearTimeout(this.resizeRefreshTimer);
			}
			this.resizeRefreshTimer = setTimeout(() => {
				// Simply update the highlights - no need to re-search since content hasn't changed
				this.updateHighlights();
			}, 100); // 100ms debounce for resize events
		}
	}
	
	// Called from keyboard shortcut and from Blazor (toolbar button)
	public toggleFindReplaceBar(): void {
		// Get selected text to pre-populate Find input
		const selectedText = this.getSelectedTextForSearch();
		safeInvoke(this.dotNetHelper, 'ToggleFindReplaceBar', [selectedText]);
	}

	/**
	 * Refreshes Find & Replace highlights when text scale changes.
	 * Called from Blazor when the text scale is adjusted.
	 */
	public refreshHighlightsForScale(): void {
		// Only refresh if Find & Replace is active with matches
		if(this.searchState.findText && this.searchState.matches.length > 0) {
			this.updateHighlights();
		}
	}

	/**
	 * Exports the QuillJS content as clean HTML with all styling preserved
	 */
	/**
	 * Exports the current editor content as HTML while preserving all formatting and styles.
	 * 
	 * This method creates a perfect visual clone of the editor content by:
	 * 1. Cloning the entire editor-outer container (not just the content) to preserve the full DOM structure
	 * 2. Removing editor-specific UI elements (tooltips, cursors, etc.) that shouldn't appear in exports
	 * 3. Processing images to ensure they display correctly in the exported HTML
	 * 
	 * The method prioritizes cloning #editor-outer because it contains the complete editor structure
	 * with all necessary wrapper elements. If #editor-outer is not found (e.g., in different contexts),
	 * it falls back to cloning just the editor root element.
	 * 
	 * @returns {string} The complete HTML string of the cloned and cleaned editor content
	 */
	public exportToHtml(): string {
		if (!this.primaryNotesEditor) {
			return '';
		}

		// Get the editor outer element that contains everything
		const editorOuter = this.editorOuterContainer;
		if (!editorOuter) {
			// Fallback to just the editor if outer not found
			const editorElement = this.primaryNotesEditor.root;
			const clonedElement = editorElement.cloneNode(true) as HTMLElement;
			// this.cleanupForExport(clonedElement);
			return clonedElement.outerHTML;
		}

		// Clone the entire editor with all its contents
		const editorClone = editorOuter.cloneNode(true) as HTMLElement;

		// Remove any hidden elements or UI controls from the clone
		const elementsToRemove = editorClone.querySelectorAll('.ql-tooltip, .ql-clipboard, .notesEditorLinkTooltip, .ql-cursor, .ql-hidden');
		elementsToRemove.forEach(el => el.remove());

		// Process images to ensure they're properly embedded
		this.processImagesForExport(editorClone);

		// Clean up any editor-specific classes and attributes
		// this.cleanupForExport(editorClone);

		return editorClone.outerHTML;
	}

	/**
	 * Exports the QuillJS content as a complete, standalone HTML document with all necessary styles.
	 * 
	 * This method creates a fully self-contained HTML document that perfectly replicates the
	 * appearance of the editor content. It's designed to work for both HTML file exports and
	 * PDF generation, with specific optimizations for each use case.
	 * 
	 * The method performs several critical operations:
	 * 1. Retrieves the actual computed colors from the editor's container elements
	 * 2. Extracts ALL styles from the document (Google Fonts, theme CSS, Quill styles)
	 * 3. Creates a complete HTML document with proper meta tags and styling
	 * 4. Includes comprehensive print media queries for PDF generation
	 * 5. Forces color preservation using print-color-adjust CSS properties
	 * 
	 * @param {string} title - The title for the HTML document (appears in browser tab)
	 * @param {boolean} isForPdf - Whether this export is intended for PDF generation.
	 *                              When true, removes padding to let PDF margins handle spacing.
	 *                              When false, adds padding for better standalone HTML viewing.
	 * @param {string} themeStyles - Additional theme-specific styles passed from C# (currently unused
	 *                               as we extract all styles directly from the document)
	 * @param {string} backgroundColor - Fallback background color if unable to extract from DOM
	 * 
	 * @returns {string} A complete HTML document as a string, ready to be saved or converted to PDF
	 */
	public exportToCompleteHtml(title: string = 'Exported Notes', isForPdf: boolean = false, themeStyles: string = '', backgroundColor: string = '#ffffff'): string {
		const content = this.exportToHtml();

		// Get the actual background color from contentAreaInner if available
		let bgColor = backgroundColor || '#ffffff';
		if (this.contentAreaInner) {
			const contentStyles = window.getComputedStyle(this.contentAreaInner);
			bgColor = contentStyles.backgroundColor || backgroundColor || '#ffffff';
		}

		// Get text color from the editor element
		let textColor = '#000000';
		if (this.primaryNotesEditor) {
			const editorElement = this.primaryNotesEditor.root as HTMLElement;
			const computedStyles = window.getComputedStyle(editorElement);
			textColor = computedStyles.color || '#000000';
		}

		// Detect if dark mode is active by checking if any parent element has the 'dark' class
		const isDarkMode = document.documentElement.classList.contains('dark') ||
			document.body.classList.contains('dark') ||
			!!document.querySelector('.dark');
		const darkModeClass = isDarkMode ? ' class="dark"' : '';

		// Extract all styles from the document
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

	/**
	 * Extracts all relevant styles from the current document to ensure exported content looks identical.
	 * 
	 * This is a critical method that captures ALL styling information needed to recreate the
	 * exact appearance of the editor content. It works by extracting styles from multiple sources
	 * in a specific order to ensure proper cascade and specificity:
	 * 
	 * 1. Google Fonts: Extracts all Google Font links and converts them to @import statements
	 * 2. Inline <style> elements: Captures theme-specific CSS that's dynamically generated
	 * 3. External stylesheets: Iterates through all loaded stylesheets and extracts relevant rules
	 * 
	 * The method filters CSS rules to include only those relevant to the editor content,
	 * including Quill classes (.ql-*), typography elements (h1-h6, p, etc.), and formatting
	 * elements (strong, em, lists, tables, etc.). This filtering prevents including unnecessary
	 * styles that could bloat the export or cause conflicts.
	 * 
	 * CORS restrictions may prevent access to some external stylesheets, which is handled
	 * gracefully with a warning rather than failing the export.
	 * 
	 * @returns {string} A string containing all extracted CSS rules and @import statements
	 */
	private extractAllStyles(): string {
		let allStyles = '';
		
		// First, extract Google Fonts imports from link elements
		const fontLinks = document.querySelectorAll('link[href*="fonts.googleapis.com"]');
		fontLinks.forEach(link => {
			const href = (link as HTMLLinkElement).href;
			if (href) {
				allStyles += `@import url('${href}');\n`;
			}
		});
		
		// Prioritize inline <style> elements first (these contain theme-specific CSS)
		const styleElements = document.querySelectorAll('style');
		styleElements.forEach(style => {
			const styleContent = style.innerHTML;
			if (styleContent) {
				allStyles += styleContent + '\n';
			}
		});
		
		// Extract all CSS rules from all stylesheets
		const styleSheets = document.styleSheets;
		for (let i = 0; i < styleSheets.length; i++) {
			try {
				const sheet = styleSheets[i];
				const rules = sheet.cssRules || sheet.rules;
				if (rules) {
					for (let j = 0; j < rules.length; j++) {
						const rule = rules[j];
						if (rule.cssText) {
							// Include rules related to the editor and Quill
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
			} catch (e) {
				// Some stylesheets may not be accessible due to CORS
				console.warn('Could not access stylesheet:', e);
			}
		}
		
		return allStyles;
	}

	/**
	 * Processes images in the cloned content to ensure they display correctly in exports.
	 * 
	 * Images in the editor may have various sizing constraints or responsive settings that
	 * need to be adjusted for export. This method ensures all images will:
	 * - Scale properly to fit within their container (max-width: 100%)
	 * - Maintain their aspect ratio (height: auto)
	 * - Display correctly in both HTML and PDF outputs
	 * 
	 * These style adjustments are applied directly to the image elements to ensure they
	 * override any conflicting styles that might exist in the exported document.
	 * 
	 * @param {HTMLElement} element - The cloned element containing images to process
	 */
	private processImagesForExport(element: HTMLElement): void {
		const images = element.querySelectorAll('img');
		images.forEach(img => {
			// Ensure images have proper attributes for export
			if (!img.style.maxWidth) {
				img.style.maxWidth = '100%';
			}
			if (!img.style.height) {
				img.style.height = 'auto';
			}
		});
	}

	/**
	 * Removes editor-specific elements and attributes that shouldn't appear in exported content.
	 * 
	 * The Quill editor adds various classes and attributes for functionality that are not
	 * needed (and would be confusing or broken) in exported HTML. This method performs
	 * a thorough cleanup to ensure the exported content is clean and semantic:
	 * 
	 * 1. Removes editor UI classes: Elements like cursors, tooltips, and hidden elements
	 *    that are part of the editing interface but not the actual content
	 * 
	 * 2. Removes contenteditable attributes: These make elements editable in the browser,
	 *    which we don't want in the exported HTML
	 * 
	 * 3. Removes Quill-specific data attributes: Attributes like data-blot-name are used
	 *    internally by Quill but serve no purpose in exported HTML. However, we preserve
	 *    data-list attributes on list items as these are needed for checkbox styling.
	 * 
	 * Note: This method is currently commented out in exportToHtml() but kept for potential
	 * future use if more aggressive cleanup is needed.
	 * 
	 * @param {HTMLElement} element - The cloned element to clean up
	 */
	private cleanupForExport(element: HTMLElement): void {
		// Remove editor-specific classes that shouldn't be in the export
		const editorClasses = ['ql-cursor', 'ql-tooltip', 'ql-hidden'];
		editorClasses.forEach(className => {
			const elements = element.querySelectorAll(`.${className}`);
			elements.forEach(el => el.remove());
		});

		// Remove contenteditable attributes
		const editableElements = element.querySelectorAll('[contenteditable]');
		editableElements.forEach(el => el.removeAttribute('contenteditable'));

		// Remove data attributes that are editor-specific (but preserve data-list for checkboxes)
		const elementsWithData = element.querySelectorAll('[data-blot-name]');
		elementsWithData.forEach(el => {
			// Preserve data-list attribute for checkbox lists
			if (el.tagName !== 'LI' || !el.hasAttribute('data-list')) {
				el.removeAttribute('data-blot-name');
			}
		});
	}

	/**
	 * Safely escapes HTML special characters to prevent XSS and rendering issues.
	 * 
	 * This utility method converts special HTML characters (<, >, &, ", ') into their
	 * corresponding HTML entities. This is crucial for:
	 * - Preventing XSS attacks when inserting user-provided text into HTML
	 * - Ensuring text displays correctly rather than being interpreted as HTML
	 * - Safely embedding titles and other text content in the exported HTML document
	 * 
	 * The method uses the browser's built-in text content handling rather than regex
	 * replacement, which is both more reliable and more performant.
	 * 
	 * @param {string} text - The text to escape
	 * @returns {string} The text with HTML special characters converted to entities
	 * 
	 * @example
	 * escapeHtml("<script>alert('XSS')</script>") 
	 * // Returns: "&lt;script&gt;alert('XSS')&lt;/script&gt;"
	 */
	private escapeHtml(text: string): string {
		const div = document.createElement('div');
		div.textContent = text;
		return div.innerHTML;
	}
	
	// Static sets for efficient character lookup - matches WordBreaker.cs
	// These match the punctuation characters from WordBreaker.cs
	private static readonly punctuationChars: string = '""\'\"«»`~!@#$%^&*()-_=+[]{}\\|;:\',<.>/?–—\u00a0';
	private static readonly punctuationSet: Set<string> = new Set(VenusEditor.punctuationChars.split(''));
	private static readonly joiningSet: Set<string> = new Set(['\u2019', '\'']); // ' and regular apostrophe
	
	private updateTextCounts(): void {
		if(!this.primaryNotesEditor || !this.dotNetHelper) return;
		
		// Only update if at least one count type is enabled
		if(!this.editorSettings.showWordCount && !this.editorSettings.showCharacterCount) return;
		
		const text = this.primaryNotesEditor.getText();
		const textLength = text.length;
		
		// Only calculate word count if it's going to be displayed
		let wordCount = 0;
		let isWordCountEstimated = false;
		if(this.editorSettings.showWordCount) {
			// For large documents (>50K chars), use estimation for performance
			if(textLength > 50000) {
				isWordCountEstimated = true;
				// Sample the first 5000 characters to get average word length
				const sampleSize = Math.min(5000, textLength);
				const sample = text.substring(0, sampleSize);
				let sampleWordCount = 0;
				let inWord = false;
				
				for(let i = 0; i < sampleSize; i++) {
					const char = sample[i];
					const isWordChar = !this.isBreakingOrWhitespace(char);
					
					if(isWordChar && !inWord) {
						sampleWordCount++;
						inWord = true;
					} else if(!isWordChar && inWord) {
						inWord = false;
					}
				}
				
				// Estimate total word count based on sample
				// Average chars per word in sample
				const avgCharsPerWord = sampleSize / Math.max(1, sampleWordCount);
				wordCount = Math.round(textLength / avgCharsPerWord);
			} else {
				// For smaller documents, count exactly
				let inWord = false;
				
				for(let i = 0; i < textLength; i++) {
					const char = text[i];
					const isWordChar = !this.isBreakingOrWhitespace(char);
					
					if(isWordChar && !inWord) {
						// Starting a new word
						wordCount++;
						inWord = true;
					} else if(!isWordChar && inWord) {
						// Ending a word
						inWord = false;
					}
				}
			}
		}
		
		// Only calculate character count if it's going to be displayed
		let characterCount = 0;
		if(this.editorSettings.showCharacterCount) {
			// Calculate character count (excluding the trailing newline that Quill adds)
			characterCount = Math.max(0, textLength - 1);
		}
		
		// Call the toolbar to update the display with estimation flag
		safeInvoke(this.dotNetHelper, 'UpdateTextCounts', [wordCount, characterCount, isWordCountEstimated]);
	}
	
	private isBreakingOrWhitespace(char: string): boolean {
		// Check if character is whitespace or punctuation (but not joining chars like apostrophes)
		if(char === ' ' || char === '\t' || char === '\n' || char === '\r') {
			return true;
		}
		if(VenusEditor.punctuationSet.has(char) && !VenusEditor.joiningSet.has(char)) {
			return true;
		}
		return false;
	}
	
	private scheduleCountUpdate(): void {
		// Clear any existing timer
		if(this.updateCountsTimer) {
			clearTimeout(this.updateCountsTimer);
		}

		// Schedule update after 500ms of no typing (debounce)
		this.updateCountsTimer = setTimeout(() => {
			this.updateTextCounts();
		}, 500);
	}

	private scheduleAutoSave(): void {
		// Clear any existing auto-save timer
		if(this.autoSaveTimer) {
			clearTimeout(this.autoSaveTimer);
		}

		// Schedule auto-save after user has stopped typing for the configured delay
		this.autoSaveTimer = setTimeout(() => {
			if(this.isDirty) {
				// Defer the heavy JSON serialization to avoid blocking the UI thread
				this.safeSetTimeout(() => {
					const contentPackage = this.getContentPackage();
					safeInvoke(this.dotNetHelper, 'StartAutoSave', [contentPackage.quillDelta, contentPackage.metaData]);
					console.log('Notes auto-save started');
				}, 0);
				this.isDirty = false;
			}
		}, this.autoSaveIdleDelay);
	}

	// Immediately flush any pending auto-save, bypassing the debounce timer.
	// Called on visibilitychange (app backgrounding) and before editor disposal to prevent data loss.
	private flushPendingAutoSave(): void {
		if(this.autoSaveTimer) {
			clearTimeout(this.autoSaveTimer);
			this.autoSaveTimer = undefined;
		}
		if(this.isDirty && this.dotNetHelper && this.primaryNotesEditor) {
			const perfTimer = NotesPerfTimer.start('flushPendingAutoSave');
			try {
				const contentPackage = this.getContentPackage();
				perfTimer.step('getContentPackage');
				safeInvoke(this.dotNetHelper, 'StartAutoSave', [contentPackage.quillDelta, contentPackage.metaData]);
				perfTimer.stop();
				console.log('Notes auto-save flushed (pending save)');
				this.isDirty = false;
			} catch(e) {
				perfTimer.stop();
				console.warn('Failed to flush auto-save:', e);
			}
		}
	}
	
	public updateCountVisibility(): void {
		if(this.editorSettings) {
			safeInvoke(this.dotNetHelper, 'UpdateCountVisibility',
				[this.editorSettings.showWordCount,
				this.editorSettings.showCharacterCount]);
		}
	}

}

// Must match the C# class
interface JSTextProcess {
	index: number;
	length: number;
	property: string;
	value: string;
}

// Must match the C# class in NotesEditorExternal
class ContentPackage {
	public quillDelta: string = "";
	public metaData: string = "";
}

// Must match the C# class in NotesEditorExternal
class MetaDataPackage {
	public metaData: string = "";
	public isDirty: boolean = false;
}

class SavedCellSelection {
	cellId: string | null = null;
	cellSelection: { index: number, length: number } | null = null;
}

class ToolbarButton {
	public buttonId: string;
	public formatKey: string;
	public formatValue: string | null = null;
	public isMenu: boolean;

	constructor() {
		this.buttonId = '';
		this.formatKey = '';
		this.formatValue = null
		this.isMenu = false;
	}
}

// Must match the C# enum EditorMode
enum EditorMode {
	Normal = 0,
	Split = 1,
	StyledMarkdown = 2,
	RawMarkdown = 3
}

// Must match the C# enum ClientOs
enum ClientOs {
	Other = 0,
	Android = 1,
	iOS = 2
}

// Must match the C# enum OutlineCollapseButtonVisibility
enum OutlineCollapseButtonVisibility {
	Minimally = 0,
	OnHoverOfText = 1,
	Always = 2,
	Never = 3
}

// Must match the C# class NotesEditorSettings
class NotesEditorSettings {
	public isStandalone: boolean = false;
	public readOnly: boolean = false;
	public pasteWithoutFormattingAsDefault: boolean = false;
	public defaultEditMode: EditorMode = EditorMode.Normal;
	public clientOs: ClientOs = ClientOs.Other;
	public doMentionProcessing: boolean = false;
	public isSpellCheckEnabled: boolean = false;
	public useCustomDateTimeFormat: boolean = false;
	public customDateTimeFormat: string = '';
	public excludeColorInformationWhenPasting: boolean = true;
	public excludeFontInformationWhenPasting: boolean = true;
	public showWordCount: boolean = true;
	public showCharacterCount: boolean = false;
	public replaceUrlWithPageTitle: boolean = false;
	public textScalePercent: number = 100;
	public lineHeight: number = 1.2;
	public collapseButtonVisibility: OutlineCollapseButtonVisibility = OutlineCollapseButtonVisibility.OnHoverOfText;
	public placeholderText: string = '';
	public isDeku: boolean = false;
	public isPhone: boolean = false;
	public isTablet: boolean = false;
	public animateTextCursor: boolean = false;
}


const ParchmentEmbedBlot: any = Parchment.EmbedBlot;

class LineBreakBlot extends ParchmentEmbedBlot {
	static blotName = 'linebreak';
	static tagName = 'BR';
	static className = 'ql-line-break';

	length(): number {
		return 1;
	}
}

class DividerBlot extends BlockEmbed {
	static blotName = 'divider';
	static tagName = 'hr';
	// do not put a class name or existing hrs will not be recognized
	//static className = 'ql-divider';

	static create(value: string): HTMLElement {
		const node = super.create();
		node.setAttribute('contenteditable', 'false');
		node.setAttribute('data-type', value);
		return node;
	}

	static value(node: HTMLElement): string {
		return node.getAttribute('data-type') ?? 'hr';
	}
}

class MathExpressionBlot extends Embed {
	static blotName = 'math';
	static className = 'ql-math';
	static tagName = 'span';

	static create(value: string) {
		const node = super.create() as HTMLElement;
		node.setAttribute('contenteditable', 'false');
		node.style.fontSize = '125%';
		MathExpressionBlot.renderMath(node, typeof value === 'string' ? value : '');
		return node;
	}

	static value(domNode: HTMLElement) {
		return domNode.getAttribute('data-math-source') ?? '';
	}

	format(name: string, value: any) {
		if(name === MathExpressionBlot.blotName) {
			MathExpressionBlot.renderMath(this.domNode as HTMLElement, typeof value === 'string' ? value : '');
		} else {
			super.format(name, value);
		}
	}

	private static renderMath(node: HTMLElement, value: string) {
		const mathSource = typeof value === 'string' ? value : '';
		node.setAttribute('data-math-source', mathSource);
		typesetMathIntoNode(node, mathSource);
	}
}

class MentionStatusBlot extends Inline {
	static blotName = 'mention-status';
	static tagName = 'span';

	static create(value: number) {
		let node = super.create();
		node.setAttribute('data-mention-status', value);
		return node;
	}

	static formats(node: HTMLElement) {
		return node.getAttribute('data-mention-status');
	}
}


class MentionBlot extends Inline {
	static blotName = 'mention';
	static className = 'mentioned-thought';
	static tagName = 'span';

	static create(id: string) {
		let node = super.create();
		if(id) {
			node.setAttribute('data-mention', id);
		}
		return node;
	}

	static formats(node: HTMLElement) {
		return node.getAttribute('data-mention');
	}
}

class MisspellingBlot extends Inline {
	static blotName = 'misspelling';
	static className = 'misspelled-word';
	static tagName = 'span';

	static create(value: string) {
		let node = super.create();
		// Value is empty for misspellings, but we can use it for future enhancements
		return node;
	}

	static formats(node: HTMLElement) {
		return '';
	}
}

class HighlightBlot extends Inline {
	static blotName = 'highlight';
	static tagName = 'mark';
	static className = 'highlight';

	static create(value: any) {
		let node = super.create();
		return node;
	}

	static formats(node: HTMLElement) {
		return true;
	}
}

class MultiLevelBlockquoteBlot extends Block {
	static blotName = 'blockquote'; // The format name Quill uses (e.g., quill.format('blockquote', 2))
	static tagName = 'blockquote'; // The DOM tag this blot uses

	/**
	 * Quill calls create() when inserting a new blot into the document.
	 */
	static create(value: any) {
		const node = super.create() as HTMLElement;

		// If the value is a number, treat it as the "level" of the blockquote
		if(typeof value === 'number') {
			node.setAttribute('data-level', value.toString());
			node.style.marginLeft = `${value * 2}rem`;
		}
		return node;
	}

	/**
	 * Quill calls formats() to read the format/value from a DOM node.
	 */
	static formats(domNode: HTMLElement) {
		const levelAttr = domNode.getAttribute('data-level');
		// If none, default to level 1 (or 0) – up to you
		return levelAttr ? parseInt(levelAttr, 10) : 1;
	}

	/**
	 * format() is called when we do quill.format('blockquote', <value>) on
	 * an existing blot. We update its data-level attribute accordingly.
	 */
	format(name: string, value: any) {
		if(name === MultiLevelBlockquoteBlot.blotName && value) {
			this.domNode.setAttribute('data-level', value.toString());
			this.domNode.style.marginLeft = `${value * 2}rem`;
		} else {
			super.format(name, value);
		}
	}
}

interface HeadingInfo {
	level: number;
	text: string;
	index: number;
	position: number;  // Document character offset for scrolling
	includeInBookmarks?: boolean;
}

/**
 * Extract all headings from a Quill editor's content.
 */
function extractHeadings(quill: any): HeadingInfo[] {
	const delta = quill.getContents();
	const headings: HeadingInfo[] = [];
	let headingIndex = 0;

	// In Quill, block-level formats like headers are stored on the newline character
	// We need to collect text until we hit a newline, then check if that newline has a header attribute
	let currentLineText = '';
	let documentPosition = 0;      // Track position in document
	let lineStartPosition = 0;     // Position where current line starts

	for(const op of delta.ops) {

		if(op.insert && typeof op.insert === 'string') {
			// Check if this insert contains newline(s)
			const parts = op.insert.split('\n');

			for(let i = 0; i < parts.length; i++) {
				if(i > 0) {
					// We've encountered a newline - check if it's a heading
					// The newline is between parts[i-1] and parts[i]
					// Check if this operation has a header attribute (on the newline)
					if(op.attributes && op.attributes.header) {
						const level = op.attributes.header;
						const trimmedText = currentLineText.trim();
						// Skip headings that end with a zero-width space (metadata section headings)
						// or a zero-width non-joiner (TOC-excluded headings that still get PDF bookmarks)
						if(trimmedText.length > 0 && !trimmedText.endsWith('\u200B') && !trimmedText.endsWith('\u200C')) {
							headings.push({
								level: level,
								text: trimmedText,
								index: headingIndex++,
								position: lineStartPosition
							});
						}
					}
					// Move past the newline
					documentPosition++;
					// Reset for next line
					lineStartPosition = documentPosition;
					currentLineText = parts[i];
					documentPosition += parts[i].length;
				} else {
					// No newline yet, accumulate text
					currentLineText += parts[i];
					documentPosition += parts[i].length;
				}
			}
		} else {
			// Non-string insert (like an image or embed)
			// These are treated as single characters in the flow
			documentPosition++;
		}
	}

	return headings;
}

/**
 * Get the editor instance associated with a table of contents element
 */
function getEditorForTOC(tocElement: HTMLElement): VenusEditor | null {
	// Find the editor by looking at the containing editor element
	const editorElement = tocElement.closest('[id^="editor-"]');
	if(editorElement) {
		const editorId = editorElement.id;
		const instanceId = editorId.replace('editor-', '');
		return getEditorInstance(instanceId) || null;
	}
	return null;
}

class TableOfContentsBlot extends BlockEmbed {
	static blotName = 'table-of-contents';
	static tagName = 'div';
	static className = 'ql-toc';

	static create(value: any) {
		const node = super.create(value) as HTMLElement;
		node.setAttribute('contenteditable', 'false');
		node.setAttribute('data-toc', 'true');

		// Initialize with empty content
		const container = document.createElement('div');
		container.className = 'ql-toc-container';
		container.innerHTML = '<div class="ql-toc-items"></div>';
		node.appendChild(container);

		return node;
	}

	static value(node: HTMLElement) {
		return 'toc';
	}

	/**
	 * Generates TOC items HTML from headings.
	 * @param headings Array of heading information
	 * @param useAnchors If true, generates anchor links for static HTML; if false, uses data attributes for interactive use
	 */
	static generateTOCItemsHtml(headings: HeadingInfo[], useAnchors: boolean = false): string {
		if(headings.length === 0) {
			return '';
		}

		// Find minimum heading level to use as base indent
		const minLevel = Math.min(...headings.map(h => h.level));

		// Generate TOC items
		const items: string[] = [];
		for(const heading of headings) {
			const relativeLevel = heading.level - minLevel;
			const indent = relativeLevel * 1.5; // 1.5rem per level
			const isBold = relativeLevel === 0; // Bold first-level items

			// Escape HTML in heading text
			const div = document.createElement('div');
			div.textContent = heading.text;
			const text = div.innerHTML;

			const style = `margin-left: ${indent}rem;${useAnchors ? '' : ' cursor: pointer;'}`;
			const className = `ql-toc-item ql-toc-item-level-${relativeLevel}${isBold ? ' ql-toc-item-bold' : ''}`;

			if(useAnchors) {
				// Generate anchor ID for static HTML export
				const anchorId = this.generateAnchorId(heading.text);
				items.push(`<div class="${className}" style="${style}"><a href="#${anchorId}">${text}</a></div>`);
			} else {
				// Generate with data attributes for interactive use
				items.push(`<div class="${className}" style="${style}" data-heading-index="${heading.index}" data-heading-position="${heading.position}">${text}</div>`);
			}
		}

		return items.join('');
	}

	/**
	 * Generates a URL-safe anchor ID from heading text
	 */
	static generateAnchorId(text: string): string {
		if(!text) {
			return 'heading';
		}

		// Convert to lowercase and replace spaces with hyphens
		let id = text.toLowerCase();

		// Remove markdown formatting characters
		id = id.replace(/[*_`\[\]()]+/g, '');

		// Replace spaces and special characters with hyphens
		id = id.replace(/[^\w]+/g, '-');

		// Remove leading/trailing hyphens and collapse multiple hyphens
		id = id.replace(/-+/g, '-').replace(/^-+|-+$/g, '');

		// If empty after cleanup, use a default
		if(!id) {
			id = 'heading';
		}

		return id;
	}

	/**
	 * Update the table of contents with current headings
	 */
	updateContent(headings: HeadingInfo[]): void {
		// Ensure the container structure exists
		let itemsContainer = this.domNode.querySelector('.ql-toc-items') as HTMLElement;
		if(!itemsContainer) {
			// If the structure isn't set up yet, create it
			const container = document.createElement('div');
			container.className = 'ql-toc-container';
			container.innerHTML = '<div class="ql-toc-items"></div>';
			this.domNode.innerHTML = '';
			this.domNode.appendChild(container);
			itemsContainer = this.domNode.querySelector('.ql-toc-items') as HTMLElement;
		}

		if(headings.length === 0) {
			itemsContainer.innerHTML = '';
			return;
		}

		// Generate TOC items HTML using shared static method (for interactive use)
		itemsContainer.innerHTML = TableOfContentsBlot.generateTOCItemsHtml(headings, false);

		// Attach click handlers after setting innerHTML
		this.attachClickHandlers();
	}

	/**
	 * Attach click handlers to TOC items for scrolling to headings
	 */
	private attachClickHandlers(): void {
		const items = this.domNode.querySelectorAll('.ql-toc-item');

		items.forEach((item: Element) => {
			item.addEventListener('click', (event: any) => {
				event.preventDefault();
				event.stopPropagation();

				const position = parseInt((item as HTMLElement).getAttribute('data-heading-position') || '0', 10);

				// Get the editor instance
				const editor = getEditorForTOC(this.domNode);
				if(!editor) {
					console.warn('[TableOfContentsBlot] Could not find editor instance');
					return;
				}

				const quill = editor.notesEditor();
				if(!quill) return;

				// Set selection at the heading first
				quill.setSelection(position, 0, 'silent');

				// Then scroll using setTimeout to ensure selection is set first
				setTimeout(() => {
					const [line] = quill.getLine(position);
					if(line && line.domNode) {
						// Scroll the heading into view centered
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

/**
 * Get the editor instance associated with an image element
 */
function getEditorForImage(image: HTMLImageElement): VenusEditor | null {
	const editor = imageToEditorMap.get(image);
	if(editor) {
		return editor;
	}

	// Fallback: try to find the editor by looking at the containing editor element
	const editorElement = image.closest('[id^="editor-"]');
	if(editorElement) {
		const editorId = editorElement.id;
		const instanceId = editorId.replace('editor-', '');
		const foundEditor = getEditorInstance(instanceId);
		if(foundEditor) {
			// Register this image with the found editor for future lookups
			imageToEditorMap.set(image, foundEditor);
			return foundEditor;
		}
	}

		return null;
	}


/**
 * Associate an image element with an editor instance
 */
function setEditorForImage(image: HTMLImageElement, editor: VenusEditor): void {
	imageToEditorMap.set(image, editor);
}

class ResizableImage extends Image {
	static create(value: any) {
		// Create the image element with the clean URL
		let actualUrl = value;
		let zoom: string | null = null;
		let width: string | null = null;

		// Look for TheBrain MD parameters at #$
		if(typeof value === 'string' && value.includes('#$')) {
			// Extract actual URL and parameters
			const paramStartIndex = value.indexOf('#$');
			const actualUrl = value.substring(0, paramStartIndex);
			const paramString = value.substring(paramStartIndex);

			// Extract and apply parameters
			const paramRegex = /#\$([^$]+)\$/g;
			let match;
			while((match = paramRegex.exec(paramString)) !== null) {
				const param = match[1];
				if(param.startsWith('width=')) {
					const widthValue = param.substring(6);
					if(widthValue.endsWith('p')) {
						// Width defined as a percentage. Use `transform: scale()` not `width` CSS property since width would make it a percentage of its container
						const percentage = widthValue.substring(0, widthValue.length - 1);
						let num = Number(percentage) / 100;
						zoom = `${num}`;
					} else {
						// Width defined in pixels or other unit
						width = widthValue;
					}
				}
				// Future parameters here (height, etc.)
			}
		}

		const node = super.create(actualUrl);
		node.style.maxWidth = '100%';
		node.classList.add('cursor-default');
		if(zoom) {
			// Use width-based scaling for better browser compatibility and proper layout
			setImageScale(node, parseFloat(zoom));
		} else if(width) {
			node.style.width = width;
		}

		// when clicked, add image controls
		node.addEventListener('click', (event: any) => {
			const editor = getEditorForImage(node as HTMLImageElement);
			if(!editor) {
				console.warn('[ResizableImage] Could not find editor for image', node);
				return;
			}

			// Select the image so Backspace/Delete will remove it
			const quill = editor.notesEditor();
			if(quill) {
				// Find the image blot and select it
				const imageBlot = Quill.find(node);
				if(imageBlot) {
					const index = quill.getIndex(imageBlot);
					// Select the image by setting selection with length 1
					quill.setSelection(index, 1, 'user');
				}
			}

			if(editor.imageControls) {
				editor.imageControls.destroy();
			}
			if(editor.editorSettings.clientOs != ClientOs.iOS && editor.editorSettings.clientOs != ClientOs.Android) {
				if(!editor.editorSettings.readOnly) {
					editor.imageControls = new ImageControls(node as HTMLImageElement);
				}
			}
		});

		return node;
	}

	static value(node: HTMLElement) {
		let src = node.getAttribute('src');
		// trim any existing parameters
		if(src && src.includes('#$')) {
			src = src.substring(0, src.indexOf('#$'));
		}
		// Check for scale from data attribute or width styles to append as parameters
		const scale = getImageScale(node as HTMLImageElement);
		if(scale !== 1) {
			// Convert scale to percentage (e.g., 0.75 -> 75)
			let scalePercent = Math.round(scale * 100);
			src += '#$width=' + scalePercent + 'p$';
		} else if(node.style.width && !node.getAttribute('data-scale')) {
			// Only use width if not using scale-based sizing
			let widthString = node.style.width;
			src += '#$width=' + widthString + '$';
		}
		return src;
	}
}

class TableState {
	activeCellId: string | undefined;
	lastActiveCellId: string | undefined;
	ignoreNextSelectionChange: boolean = false;
	editorCache: {
		[key: string]: {
			quill: any;
			cellElement: HTMLElement;
			removeListener?: () => void
		}
	} = {};
	lastTableWithSelection: HTMLTableElement | null = null;
}

// WeakMap to associate table elements with their editor instances
const tableToEditorMap = new WeakMap<HTMLTableElement, VenusEditor>();

// WeakMap to associate image elements with their editor instances
const imageToEditorMap = new WeakMap<HTMLImageElement, VenusEditor>();

class TableBlot extends BlockEmbed {
	static blotName = 'table';
	static tagName = 'table';
	// do not put a class name or existing tables will not be recognized
	// Note: Table state is now stored in TableState instance (venusEditor.tableState)

	// Tracks nesting depth for performUndoableOperation. When > 0, inner calls
	// skip flush/setupTableControls/reapplyFormats — only the outermost call handles them.
	private static _batchDepth: number = 0;

	// Per-cell canonical delta cache. Populated at create and on cell blur; read by
	// value() to skip the HTML-to-delta round-trip. Content hash invalidates the
	// entry when cell content changes outside these paths (recognition writes,
	// undo/redo, paste, format changes). Hash excludes .ql-table-control nodes so
	// that control add/remove via setupTableControls doesn't false-invalidate.
	private static cellDeltas = new WeakMap<HTMLTableCellElement, { delta: any, contentHash: string }>();

	private static hashCellContent(cell: HTMLTableCellElement): string {
		const clone = cell.cloneNode(true) as HTMLElement;
		this.removeControlsFromCell(clone);
		return QuillExtensions.computeHash(clone.innerHTML);
	}

	private static storeCellDelta(cell: HTMLTableCellElement, delta: any): void {
		this.cellDeltas.set(cell, { delta, contentHash: this.hashCellContent(cell) });
	}

	// Returns the cached delta if the hash still matches. Otherwise deletes the
	// stale entry and returns null so the caller falls through to HTML-to-delta.
	private static readCellDelta(cell: HTMLTableCellElement): any | null {
		const entry = this.cellDeltas.get(cell);
		if(!entry) return null;
		if(entry.contentHash !== this.hashCellContent(cell)) {
			this.cellDeltas.delete(cell);
			return null;
		}
		return entry.delta;
	}

	/**
	 * Get the editor instance associated with a table element
	 */
	static getEditorForTable(table: HTMLTableElement): VenusEditor {
		const editor = tableToEditorMap.get(table);
		if(editor) {
			return editor;
		}

		// Fallback: try to find the editor by looking at the containing editor element
		const editorElement = table.closest('[id^="editor-"]');
		if(editorElement) {
			const editorId = editorElement.id;
			// Extract instanceId from editor ID (format: "editor-{instanceId}")
			const instanceId = editorId.replace('editor-', '');
			const foundEditor = getEditorInstance(instanceId);
			if(foundEditor) {
				// Register this table with the found editor for future lookups
				tableToEditorMap.set(table, foundEditor);
				return foundEditor;
			}
		}

		// If we can't find the editor, throw an error
		throw new Error('[TableBlot.getEditorForTable] Could not find editor instance for table - table may not be properly registered');
	}

	/**
	 * Associate a table element with an editor instance
	 */
	static setEditorForTable(table: HTMLTableElement, editor: VenusEditor): void {
		tableToEditorMap.set(table, editor);
	}

	static create(value: string): HTMLElement {
		// Return an HTMLElement that is the table with the correct contents based on value

		// Create table and set as not editable. We need to dynamically make cells editable as the
		// users selects via the pointer or keyboard arrow keys.
		const node = super.create() as HTMLTableElement;
		node.setAttribute('contenteditable', 'false');
		node.classList.add('ql-table-blot');
		node.style.textAlign = 'unset'; // ignore the alignment of the parent for the contents of the table

		// Parse the JSON value to get the table data
		const tableData = JSON.parse(value) as TableData;

		// Add a colgroup to the table and a col for each column (used for setting widths)
		const colgroup = document.createElement('colgroup');
		node.appendChild(colgroup);
		for(let i = 0; i < tableData.columns; i++) {
			const col = document.createElement('col');
			colgroup.appendChild(col);
		}

		// Add the rows
		for(let rowNum = 0; rowNum < tableData.rows; rowNum++) {
			const row = node.insertRow();
			for(let colNum = 0; colNum < tableData.columns; colNum++) {
				const cell = row.insertCell();
				const deltaJson = tableData.cells[rowNum][colNum];
				try {
					const delta = JSON.parse(deltaJson);
					const html = QuillExtensions.convertDeltaToHtml(delta);
					cell.innerHTML = html || '<p><br></p>';
					this.storeCellDelta(cell, delta);
				} catch(error) {
					console.error('Error parsing delta JSON:', error);
					cell.innerHTML = '<p><br></p>';
				}
			}
		}

		// One delegated click listener for the entire table. Much cheaper than
		// per-cell listeners and immune to the cloneNode-loses-listeners bug class.
		TableBlot.setupTableClickDelegation(node);

		new TableCellDragHandler(node, TableBlot.tableSelectionChangeListener);

		return node;
	}

	private static tableSelectionChangeListener = (table: HTMLTableElement, startCell: HTMLTableCellElement | null, endCell: HTMLTableCellElement | null) => {
		const editor = TableBlot.getEditorForTable(table);
		if(editor.tableResizer?.isDragging) {
			return;
		}
		TableBlot.setTableSelection(table, startCell, endCell);
	}
	
	public static handleDeleteOrBackspace(editor: VenusEditor) {
		if(editor.tableState.lastTableWithSelection) {
			const table = editor.tableState.lastTableWithSelection;

			const ts = TableBlot.getTableSelection(table);
			if(ts.startRow === -1 || ts.startCol === -1 || ts.endRow === -1 || ts.endCol === -1) {
				// Shouldn't happen, but just in case
				return true;
			}

			// check is whole rows are selected
			const isWholeRowSelected = ts.startCol === 0 && ts.endCol === table.rows[ts.startRow].cells.length - 1;
			// check if whole columns are selected
			const isWholeColumnSelected = ts.startRow === 0 && ts.endRow === table.rows.length - 1;
			// check if the entire table is selected
			const isWholeTableSelected = isWholeRowSelected && isWholeColumnSelected;

			if(isWholeTableSelected) {
				// If the entire table is selected, remove the table
				const tableEditor = this.getEditorForTable(table);
				tableEditor.cutoffPrimaryHistory();
				tableEditor.isStructuralTableOperation = true;
				try {
					table.remove();
				} finally {
					tableEditor.flushPrimaryEditorMutations();
					tableEditor.isStructuralTableOperation = false;
					tableEditor.scheduleProcessVisibleLines();
				}
				return false;
			}

			if(isWholeRowSelected) {
				const minRow = ts.endRow > ts.startRow ? ts.startRow : ts.endRow;
				const maxRow = ts.endRow > ts.startRow ? ts.endRow : ts.startRow;
				const count = maxRow - minRow + 1;
				this.performUndoableOperation(table, () => {
					for(let i = 0; i < count; i++) {
						table.deleteRow(minRow);
					}
				});
				return;
			}

			if(isWholeColumnSelected) {
				const minCol = ts.endCol > ts.startCol ? ts.startCol : ts.endCol;
				const maxCol = ts.endCol > ts.startCol ? ts.endCol : ts.startCol;
				const count = maxCol - minCol + 1;
				// Use internal to avoid nested performUndoableOperation per column
				this.performUndoableOperation(table, () => {
					for(let i = 0; i < count; i++) {
						this.deleteColumnInternal(table, minCol);
					}
				});
				return;
			}

			// Clear the content of the selected cells

			// First the cell the user is currently editing
			const cells = TableBlot.getSelectedCells(table);
			if(editor.isCellEditorActive()) {
				editor.notesEditor().deleteText(0, editor.notesEditor().getLength(), 'api');
			}

			// Now all the other selected cells
			cells.forEach(cell => {
				// Don't clear the cell that is currently be edited
				if(cell.id !== editor.tableState.activeCellId) {
					// If set to completely empty, the cell becomes zero-height
					cell.innerHTML = '<p><br></p>';
				}
			});

			// Recreate the controls which may have been removed by the above actions.
			// Invalidate the shape cache so setupTableControls rebuilds — the cell wipes
			// above may have destroyed controls attached to the affected cells even
			// though the table shape is unchanged.
			delete table.dataset.tbShapeKey;
			TableBlot.setupTableControls(table);

			return false;
		}
		return true;
	}

	public static setTableSelection(table: HTMLTableElement, startCell: HTMLTableCellElement | null, endCell: HTMLTableCellElement | null, skipActivateCell: boolean = false): void {
		const editor = TableBlot.getEditorForTable(table);

		if(startCell !== null && endCell != null) {
			// Save start and end cell positions as data attributes on the table
			const startRow = (startCell.parentElement as HTMLTableRowElement).rowIndex;
			const startCol = startCell.cellIndex;
			const endRow = (endCell.parentElement as HTMLTableRowElement).rowIndex;
			const endCol = endCell.cellIndex;

			table.dataset.selectionStartRow = startRow.toString();
			table.dataset.selectionStartCol = startCol.toString();
			table.dataset.selectionEndRow = endRow.toString();
			table.dataset.selectionEndCol = endCol.toString();
			editor.tableState.lastTableWithSelection = table;

			if(!editor.tableState.activeCellId && !skipActivateCell) {
				// Activate the start cell to ensure table controls and focus context exist
				const cellQuill = TableBlot.activateCell(startCell, editor);
				// Strip inherited theme colors from the editor root — they're only
				// needed for display (the <td> already provides them via CSS) and
				// would leak into cell deltas when value() serializes the content.
				if(cellQuill?.root) {
					cellQuill.root.style.removeProperty('color');
					cellQuill.root.style.removeProperty('background-color');
				}
				TableBlot.setupTableControls(table);
			} else if(skipActivateCell) {
				// Keep primary cursor but still build the overlay.
				TableBlot.setupTableControls(table);
			}
		} else {
			if(table.dataset.selectionStartRow || table.dataset.selectionStartCol || table.dataset.selectionEndRow || table.dataset.selectionEndCol) {
				// Clear selection data attributes
				delete table.dataset.selectionStartRow;
				delete table.dataset.selectionStartCol;
				delete table.dataset.selectionEndRow;
				delete table.dataset.selectionEndCol;
			}
			editor.tableState.lastTableWithSelection = null;
		}
		this.updateTableSelectionDiv(table)

		editor.updateToolbarState();
	}

	static getSelectionStartCell(table: HTMLTableElement): HTMLTableCellElement | null {
		const ts = TableBlot.getTableSelection(table);
		if(ts.startRow === -1 || ts.startCol === -1) {
			return null;
		}
		return table.rows[ts.startRow]?.cells[ts.startCol] as HTMLTableCellElement || null;
	}

	static getSelectionEndCell(table: HTMLTableElement): HTMLTableCellElement | null {
		const ts = TableBlot.getTableSelection(table);
		if(ts.endRow === -1 || ts.endCol === -1) {
			return null;
		}
		return table.rows[ts.endRow]?.cells[ts.endCol] as HTMLTableCellElement || null;
	}

	static getTableSelection = (table: HTMLTableElement) => ({
		startRow: parseInt(table.dataset.selectionStartRow || '-1'),
		startCol: parseInt(table.dataset.selectionStartCol || '-1'),
		endRow: parseInt(table.dataset.selectionEndRow || '-1'),
		endCol: parseInt(table.dataset.selectionEndCol || '-1')
	});
	
	private static updateTableSelectionDiv(table: HTMLTableElement): void {
		const editor = TableBlot.getEditorForTable(table);

		const ts = TableBlot.getTableSelection(table);

		// Find the cell based on the saved start and end row/col
		const startCell = ts.startRow !== -1 && ts.startCol !== -1 ? table.rows[ts.startRow]?.cells[ts.startCol] as HTMLTableCellElement : null;
		const endCell = ts.endRow !== -1 && ts.endCol !== -1 ? table.rows[ts.endRow]?.cells[ts.endCol] as HTMLTableCellElement : null;

		// Find the cell selection div within this specific table
		const cellSelectionDiv = table.querySelector('.ql-table-cell-selection') as HTMLDivElement | null;

		if(!startCell || !endCell) {
			// If no multi-cell selection, hide the selection div
			if(cellSelectionDiv) {
				cellSelectionDiv.style.left = '0px';
				cellSelectionDiv.style.top = '0px';
				cellSelectionDiv.style.width = '0px';
				cellSelectionDiv.style.height = '0px';
				cellSelectionDiv.style.color = 'transparent';
			}
			editor.tableResizer?.resumeResizing();
			return;
		}

		// Draw the selection box using the top-left corner of the start cell and the bottom-right corner of the end cell
		if(!cellSelectionDiv) {
			console.error('Failed to find table cell selection element');
		}
		if(cellSelectionDiv) {
			// Color is already set in setupTableControls based on table background
			const startRect = startCell.getBoundingClientRect();
			const endRect = endCell.getBoundingClientRect();
			const left = Math.min(startRect.x, endRect.x) - 1;
			const top = Math.min(startRect.y, endRect.y) - 1;
			const right = Math.max(startRect.right, endRect.right) - 1;
			const bottom = Math.max(startRect.bottom, endRect.bottom) - 1;
			const table = startCell.closest('table');
			const tableRect = table!.getBoundingClientRect();
			const scale = getScaleFactor(table!);
			cellSelectionDiv.style.left = `${(left - tableRect.left) / scale}px`;
			cellSelectionDiv.style.top = `${(top - tableRect.top) / scale}px`;
			cellSelectionDiv.style.width = `${(right - left) / scale}px`;
			cellSelectionDiv.style.height = `${(bottom - top) / scale}px`;
		} else {
			console.warn('ql-table-cell-selection element not found - selection will not be visible');
		}
		// Disable column resizing while a table selection is active
		editor.tableResizer?.pauseResizing();
	}

	/**
	 * Returns a list of cells that form a rectangular area based on the saved start and end cells
	 * @param table The table element containing the selection data
	 * @returns Array of HTMLTableCellElement objects in the rectangular selection
	 */
	public static getSelectedCells(table: HTMLTableElement): HTMLTableCellElement[] {
		const startRow = parseInt(table.dataset.selectionStartRow || '-1');
		const startCol = parseInt(table.dataset.selectionStartCol || '-1');
		const endRow = parseInt(table.dataset.selectionEndRow || '-1');
		const endCol = parseInt(table.dataset.selectionEndCol || '-1');

		// Return empty array if no valid selection data
		if(startRow === -1 || startCol === -1 || endRow === -1 || endCol === -1) {
			return [];
		}

		// Determine the rectangular bounds
		const minRow = Math.min(startRow, endRow);
		const maxRow = Math.max(startRow, endRow);
		const minCol = Math.min(startCol, endCol);
		const maxCol = Math.max(startCol, endCol);

		const selectedCells: HTMLTableCellElement[] = [];
		const rows = table.rows;

		// Iterate through the rectangular area and collect cells
		for(let rowIndex = minRow; rowIndex <= maxRow; rowIndex++) {
			if(rowIndex < rows.length) {
				const row = rows[rowIndex];
				for(let colIndex = minCol; colIndex <= maxCol; colIndex++) {
					if(colIndex < row.cells.length) {
						selectedCells.push(row.cells[colIndex] as HTMLTableCellElement);
					}
				}
			}
		}

		return selectedCells;
	}

	static getAdjacentCell(cell: HTMLTableCellElement, direction: number, table: HTMLTableElement): HTMLTableCellElement | null {
		const row = (cell.parentElement as HTMLTableRowElement).rowIndex;
		const col = cell.cellIndex;

		if(direction === QuillExtensions.ArrowLeft) {
			if(col > 0) return table.rows[row]?.cells[col - 1] as HTMLTableCellElement || null;
		} else if(direction === QuillExtensions.ArrowRight) {
			if(col < table.rows[row].cells.length - 1) return table.rows[row]?.cells[col + 1] as HTMLTableCellElement || null;
		} else if(direction === QuillExtensions.ArrowUp) {
			if(row > 0) return table.rows[row - 1]?.cells[col] as HTMLTableCellElement || null;
		} else if(direction === QuillExtensions.ArrowDown) {
			if(row < table.rows.length - 1) return table.rows[row + 1]?.cells[col] as HTMLTableCellElement || null;
		}
		return null;
	}

	static getNextCell(cell: HTMLTableCellElement, table: HTMLTableElement): HTMLTableCellElement | null {
		const row = (cell.parentElement as HTMLTableRowElement).rowIndex;
		const col = cell.cellIndex;
		if(col < table.rows[row].cells.length - 1) {
			return table.rows[row].cells[col + 1] as HTMLTableCellElement;
		}
		if(row < table.rows.length - 1) {
			return table.rows[row + 1].cells[0] as HTMLTableCellElement;
		}
		return null;
	}

	static getPreviousCell(cell: HTMLTableCellElement, table: HTMLTableElement): HTMLTableCellElement | null {
		const row = (cell.parentElement as HTMLTableRowElement).rowIndex;
		const col = cell.cellIndex;
		if(col > 0) {
			return table.rows[row].cells[col - 1] as HTMLTableCellElement;
		}
		if(row > 0) {
			const prevRow = table.rows[row - 1];
			return prevRow.cells[prevRow.cells.length - 1] as HTMLTableCellElement;
		}
		return null;
	}

	private static controlSize: number = 20;
	private static innerControlSize: number = 7;
	private static controlIconSize: number = 14;

	public static setupTableControls(node: HTMLTableElement) {
		const perfTimer = NotesPerfTimer.start('setupTableControls');
		try {
		const editor = TableBlot.getEditorForTable(node);

		if(editor.editorSettings.readOnly) {
			perfTimer.withContext('readOnly', 1);
			return;
		}

		// Shape signature: if rows x cols match and the theme button is still present,
		// existing controls are valid. Shape-changing ops (add/delete/merge) fall through
		// and rebuild. applyTableTheme clears tbShapeKey on color changes.
		const rows = node.rows.length;
		const cols = node.rows[0]?.cells.length ?? 0;
		const shapeKey = `${rows}x${cols}`;
		if(node.dataset.tbShapeKey === shapeKey && node.querySelector('.ql-table-theme-button')) {
			perfTimer.withContext('skipped', 1).withContext('shape', shapeKey);
			return;
		}

		editor.withHistoryIgnored(() => {

		// remove any existing controls except the cell selection display and the
		// column resize handles — both are managed by stateful objects whose
		// lifetime spans rebuilds for the same table.
		const controlsList = node.querySelectorAll('.ql-table-control');
		controlsList.forEach(control => {
			if(control === editor.tableCellSelectionDiv) {
				return;
			}
			if(control.classList.contains('ql-column-resizer')) {
				return;
			}
			control.remove()
		});

		// Follow the note's text color (same var the outline collapse carets use) rather
		// than computing from the table's own background. A dark note with a light-themed
		// table would otherwise paint dark controls that disappear against the note bg.
		const controlOutlineColor = 'rgb(var(--vusr-text-primary) / 53%)';
		const controlFillColor = 'rgb(var(--vusr-text-primary) / 27%)';

		// Add the cell selection display
		const firstCell = node.querySelector('td');
		if(!firstCell) {
			console.warn('No cells found in the table to attach the cell selection display');
			return;
		}

		// Look for existing cell selection div in this table
		let tableCellSelectionDiv = node.querySelector('.ql-table-cell-selection') as HTMLDivElement | null;

		if(!tableCellSelectionDiv) {
			// Create new cell selection div for this table
			tableCellSelectionDiv = document.createElement('div');
			tableCellSelectionDiv.className = 'ql-table-control ql-table-cell-selection absolute top-0 left-0 z-10 pointer-events-none';
			tableCellSelectionDiv.style.backgroundColor = controlFillColor;
			firstCell.appendChild(tableCellSelectionDiv);
			// Store reference on editor for this table
			editor.tableCellSelectionDiv = tableCellSelectionDiv;
		} else {
			// Make sure the cell selection div is on the first cell
			const containingCell = tableCellSelectionDiv.closest('td');
			if(!containingCell) {
				console.warn('Failed to find the containing cell for the cell selection display');
				return;
			}
			if(containingCell !== firstCell) {
				containingCell.removeChild(tableCellSelectionDiv);
				firstCell.appendChild(tableCellSelectionDiv);
			}
			// Update editor reference to point to this table's selection div
			editor.tableCellSelectionDiv = tableCellSelectionDiv;
		}

		// Column resizing — reuse the existing resizer for this table (its document
		// listeners and ResizeObserver stay attached). Only tear down + replace when
		// the active table has actually changed.
		if(editor.tableResizer && editor.tableResizer.table === node) {
			editor.tableResizer.refresh(controlFillColor);
		} else {
			if(editor.tableResizer) {
				editor.tableResizer.destroy();
			}
			editor.tableResizer = new TableResizer(node, controlFillColor);
		}

		// Add buttons to create new columns and rows
		const addControlFactory = (
			orientation: 'horizontal' | 'vertical',
			edge: string
		): HTMLElement => {
			const button = document.createElement('div');
			button.className = 'ql-table-add-button ql-table-control cursor-default';
			button.style.width = this.controlSize + 'px';
			button.style.height = this.controlSize + 'px';
			button.style.backgroundColor = 'transparent';

			// inner visible control
			const inner = document.createElement('div');
			inner.style.position = 'absolute';
			inner.style.width = this.innerControlSize + 'px';
			inner.style.height = this.innerControlSize + 'px';
			inner.style.left = (this.controlSize - this.innerControlSize) / 2 + 'px';
			inner.style.top = (this.controlSize - this.innerControlSize) / 2 + 'px';
			inner.style.background = controlFillColor;
			inner.style.border = '1px solid ' + controlOutlineColor;
			inner.style.borderRadius = this.innerControlSize + 'px'; // round
			inner.style.transition = 'opacity 0.3s ease'; // Smooth transition for hover

			// Font Awesome icon (hidden by default)
			const icon = document.createElement('i');
			icon.className = 'far fa-fw fa-circle-plus';
			icon.style.position = 'absolute';
			icon.style.left = '50%';
			icon.style.top = '50%';
			icon.style.transform = 'translate(-50%, -50%)'; // Center the icon
			icon.style.fontSize = this.controlIconSize + 'px';
			icon.style.color = controlOutlineColor;
			icon.style.opacity = '0'; // Hidden initially
			icon.style.transition = 'opacity 0.3s ease'; // Smooth transition for hover

			// Append both elements
			button.appendChild(inner);
			button.appendChild(icon);

			// Hover event listeners
			button.addEventListener('mouseenter', () => {
				inner.style.opacity = '0'; // Hide the inner circle
				icon.style.opacity = '1'; // Show the icon
			});
			button.addEventListener('mouseleave', () => {
				inner.style.opacity = '1'; // Show the inner circle
				icon.style.opacity = '0'; // Hide the icon
			});

			return button;
		};
		// columns
		new TableControlAdder(node, {
			position: 'bottom',
			placement: 'edge',
			onClick: (e, index, control, isContextClick) => {
				if(!isContextClick) {
					this.addColumn(node, index);
				}
			},
			controlFactory: addControlFactory
		});
		// rows
		new TableControlAdder(node, {
			position: 'right',
			placement: 'edge',
			onClick: (e, index, control, isContextClick) => {
				if(!isContextClick) {
					this.addRow(node, index);
				}
			},
			controlFactory: addControlFactory
		});

		// Add buttons to select rows and columns
		const selectRowOrColumnControlFactory = (
			orientation: 'horizontal' | 'vertical',
			edge: string
		): HTMLElement => {
			let normalIcon = '';
			let hoverIcon = '';
			if(orientation == 'horizontal') {
				normalIcon = 'fas fa-chevron-down';
				hoverIcon = 'far fa-circle-chevron-down';
			} else {
				normalIcon = 'fas fa-chevron-right';
				hoverIcon = 'far fa-circle-chevron-right';
			}

			const button = document.createElement('div');
			button.className = 'ql-table-delete-button ql-table-control cursor-default';
			button.style.width = this.controlSize + 'px';
			button.style.height = this.controlSize + 'px';
			button.style.backgroundColor = 'transparent';

			// inner visible control
			const inner = document.createElement('i');
			inner.className = 'fa-fw ' + normalIcon;
			inner.style.position = 'absolute';
			inner.style.left = '50%';
			inner.style.top = '50%';
			inner.style.transform = 'translate(-50%, -50%)'; // Center the icon
			inner.style.fontSize = (this.controlIconSize - 6) + 'px';
			inner.style.color = controlOutlineColor;
			inner.style.transition = 'opacity 0.3s ease'; // Smooth transition for hover

			// hover control
			const hover = document.createElement('i');
			hover.className = 'fa-fw ' + hoverIcon;
			hover.style.position = 'absolute';
			hover.style.left = '50%';
			hover.style.top = '50%';
			hover.style.transform = 'translate(-50%, -50%)'; // Center the icon
			hover.style.fontSize = this.controlIconSize + 'px';
			hover.style.color = controlOutlineColor;
			hover.style.opacity = '0'; // Hidden initially
			hover.style.transition = 'opacity 0.3s ease'; // Smooth transition for hover

			// Append both elements
			button.appendChild(inner);
			button.appendChild(hover);

			// Hover event listeners
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
				if(isContextClick) {
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
				if(isContextClick) {
					editor.showContextMenu(e.clientX, e.clientY, "table-row");
				}
			},
			controlFactory: selectRowOrColumnControlFactory
		});

		// Theme button at top-left corner of table
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
			// Pass the table directly so a focus/selection-change race triggered by this click
			// can't clear lastActiveTable before the dialog reads it.
			editor.showTableThemeDialog(node);
		});

		firstCell.appendChild(themeButton);

		});

		// Cache the shape we just built for so subsequent calls can short-circuit.
		node.dataset.tbShapeKey = shapeKey;
		perfTimer.withContext('shape', shapeKey).withContext('rebuilt', 1);
		} finally {
			perfTimer.stop();
		}
	}

	/// Install a single delegated click listener on the table so we don't have to
	/// attach (and re-attach) per-cell listeners across add/duplicate/cloneNode
	/// paths. Idempotent via dataset.tbClickDelegated so callers don't need to
	/// track whether the delegation is already installed.
	public static setupTableClickDelegation(table: HTMLTableElement) {
		if(table.dataset.tbClickDelegated === '1') {
			return;
		}
		table.dataset.tbClickDelegated = '1';

		table.addEventListener('click', (event: any) => {
			const pointerEvent = event as PointerEvent;
			const target = event.target as HTMLElement;
			const anchor = target.closest('a');
			if(anchor) {
				// Block browser navigation, but fall through so the cell still activates
				// and selection-change fires — that's what drives the link tooltip.
				event.preventDefault();
			}

			// Ignore clicks on the table's own control overlays (add buttons, select
			// buttons, theme button, column resize handles). Most controls stop
			// propagation themselves; this is the defensive catch-all.
			if(target.closest('.ql-table-control')) {
				return;
			}

			// Find the cell under the click. Confirm it belongs to this table
			// (defends against nested-table content).
			const cell = target.closest('td') as HTMLTableCellElement | null;
			if(!cell || cell.closest('table') !== table) {
				return;
			}

			const editor = TableBlot.getEditorForTable(table);

			// If there's a multi-cell table selection, don't activate a cell editor —
			// the click event fires after pointerup from a drag and would destroy the selection.
			if(editor.tableState.lastTableWithSelection === table) {
				editor.notifyEditorFocused();
				return;
			}

			// Check if there's already a text selection - if so, don't override it
			// This preserves text selections made by dragging within a cell
			const domSelection = window.getSelection();
			const hasTextSelection = domSelection && !domSelection.isCollapsed;

			if(hasTextSelection) {
				// User has selected text, don't collapse the selection
				editor.notifyEditorFocused();
				editor.updateTableControlsDisplayState();
				return;
			}

			const handled = this.activateEditorAt(pointerEvent.clientX, pointerEvent.clientY, false, editor);
			if(!handled) {
				const cellQuill = this.activateCell(cell, editor);
				if(cellQuill) {
					const bounds = cell.getBoundingClientRect();
					const scale = getScaleFactor(cell);
					const relativeX = (pointerEvent.clientX - bounds.x) / scale;
					const relativeY = (pointerEvent.clientY - bounds.y) / scale;
					QuillExtensions.setSelectionFromCoordinates(cellQuill, relativeX, relativeY);
					pointerEvent.stopPropagation();
				}
			} else {
				event.stopPropagation();
			}

			editor.notifyEditorFocused();
			editor.updateTableControlsDisplayState();
		});
	}

	static addColumn(table: HTMLTableElement, columnIndex: number) {
		// Add a column to the table at the given index
		this.performUndoableOperation(table, () => {
			table.querySelectorAll('tr').forEach((row, rowIndex) => {
				const cell = document.createElement('td');
				row.insertBefore(cell, row.children[columnIndex]);
			});
			// Add the colgroup entry
			const colgroup = table.querySelector('colgroup');
			if(colgroup) {
				// add a col to the colgroup at the given index
				const col = document.createElement('col');
				colgroup.insertBefore(col, colgroup.children[columnIndex]);
			}
		});
	}

	static addRow(table: HTMLTableElement, rowIndex: number) {
		// Add a row to the table at the given index
		this.performUndoableOperation(table, () => {
			const columns = table.rows[0].cells.length;
			const row = table.insertRow(rowIndex);
			for(let i = 0; i < columns; i++) {
				const cell = document.createElement('td');
				// if nothing is added, rows will be zero height
				const p = document.createElement('p');
				p.appendChild(document.createElement('br'));
				cell.appendChild(p);
				row.appendChild(cell);
			}
		});
	}
	
	static selectColumn(table: HTMLTableElement, columnIndex: number) {
		let startCell: HTMLTableCellElement | null = null;
		let endCell: HTMLTableCellElement | null = null;

		const rows = table.rows;

		// Early return if table is empty or column index is invalid
		if (rows.length === 0 || columnIndex < 0) {
			this.setTableSelection(table, startCell, endCell);
			return;
		}

		// Find the first cell in the column (iterate from top)
		for (let i = 0; i < rows.length; i++) {
			const cell = rows[i].cells[columnIndex];
			if (cell) {
				startCell = cell;
				break;
			}
		}

		// Find the last cell in the column (iterate from bottom)
		for (let i = rows.length - 1; i >= 0; i--) {
			const cell = rows[i].cells[columnIndex];
			if (cell) {
				endCell = cell;
				break;
			}
		}
		
		this.setTableSelection(table, startCell, endCell);
	}

	static selectRow(table: HTMLTableElement, rowIndex: number) {
		let startCell: HTMLTableCellElement | null = null;
		let endCell: HTMLTableCellElement | null = null;

		const rows = table.rows;

		// Early return if table is empty or row index is invalid
		if (rows.length === 0 || rowIndex < 0 || rowIndex >= rows.length) {
			this.setTableSelection(table, startCell, endCell);
			return;
		}

		const row = rows[rowIndex];
		const cells = row.cells;

		// Early return if row has no cells
		if (cells.length === 0) {
			this.setTableSelection(table, startCell, endCell);
			return;
		}

		// First cell in the row
		startCell = cells[0];

		// Last cell in the row
		endCell = cells[cells.length - 1];

		this.setTableSelection(table, startCell, endCell);
	}
	
	// Delete a column from the table at the given index (raw DOM operation)
	private static deleteColumnInternal(table: HTMLTableElement, columnIndex: number) {
		table.querySelectorAll('tr').forEach((row) => {
			row.deleteCell(columnIndex);
		});
		// Delete the colgroup entry
		const colgroup = table.querySelector('colgroup');
		if(colgroup) {
			const cols = colgroup.querySelectorAll('col');
			if(cols[columnIndex]) cols[columnIndex].remove();
		}
	}

	static deleteColumn(table: HTMLTableElement, columnIndex: number) {
		this.performUndoableOperation(table, () => {
			this.deleteColumnInternal(table, columnIndex);
		});
	}

	static deleteRow(table: HTMLTableElement, rowIndex: number) {
		// Delete a row from the table at the given index
		this.performUndoableOperation(table, () => {
			table.deleteRow(rowIndex);
		});
	}

	static duplicateRow(table: HTMLTableElement, rowIndex: number) {
		// Get the row to duplicate
		const originalRow = table.rows[rowIndex];
		if(!originalRow) return;

		this.performUndoableOperation(table, () => {
			// Clone the row
			const newRow = originalRow.cloneNode(true) as HTMLTableRowElement;
			// Remove all controls from the cloned row
			newRow.querySelectorAll('.ql-table-control').forEach(control => {
				control.remove();
			});
			// Cloned cells keep their source's DOM id but aren't in the WeakMap,
			// so getCellId will mint a fresh id on first access - no manual clear needed.
			const parent = originalRow.parentElement!;
			if(originalRow.nextSibling) {
				parent.insertBefore(newRow, originalRow.nextSibling);
			} else {
				parent.appendChild(newRow);
			}
		});
	}

	static duplicateColumn(table: HTMLTableElement, columnIndex: number) {
		// Duplicate column in each row
		this.performUndoableOperation(table, () => {
			table.querySelectorAll('tr').forEach((row) => {
				const originalCell = row.cells[columnIndex];
				if(!originalCell) return;

				// Clone the cell
				const newCell = originalCell.cloneNode(true) as HTMLTableCellElement;
				// Remove all controls from the cloned cell
				newCell.querySelectorAll('.ql-table-control').forEach(control => {
					control.remove();
				});
				// WeakMap-backed getCellId mints a fresh id on first access; no manual clear needed.
				row.insertBefore(newCell, originalCell.nextSibling);
			});

			// Duplicate the colgroup entry
			const colgroup = table.querySelector('colgroup');
			if(colgroup) {
				const cols = colgroup.querySelectorAll('col');
				const originalCol = cols[columnIndex];
				if(originalCol) {
					const newCol = originalCol.cloneNode(true) as HTMLElement;
					colgroup.insertBefore(newCol, originalCol.nextSibling);
				}
			}
		});
	}

	static moveRow(table: HTMLTableElement, rowIndex: number, direction: number) {
		const targetIndex = rowIndex + direction;

		// Check bounds
		if(targetIndex < 0 || targetIndex >= table.rows.length) {
			return;
		}

		this.performUndoableOperation(table, () => {
			const rowToMove = table.rows[rowIndex];
			const targetRow = table.rows[targetIndex];

			// Get the parent container (tbody or table)
			const parent = rowToMove.parentElement!;

			if(direction > 0) {
				// Moving down: insert after target
				if(targetRow.nextSibling) {
					parent.insertBefore(rowToMove, targetRow.nextSibling);
				} else {
					parent.appendChild(rowToMove);
				}
			} else {
				// Moving up: insert before target
				parent.insertBefore(rowToMove, targetRow);
			}
		});
	}

	static moveColumn(table: HTMLTableElement, columnIndex: number, direction: number) {
		const targetIndex = columnIndex + direction;

		// Check bounds by looking at the first row
		const firstRow = table.rows[0];
		if(!firstRow || targetIndex < 0 || targetIndex >= firstRow.cells.length) {
			return;
		}

		// Move cells in each row
		this.performUndoableOperation(table, () => {
			table.querySelectorAll('tr').forEach((row) => {
				const cellToMove = row.cells[columnIndex];
				const targetCell = row.cells[targetIndex];
				if(!cellToMove || !targetCell) return;

				if(direction > 0) {
					// Moving right: insert after target
					row.insertBefore(cellToMove, targetCell.nextSibling);
				} else {
					// Moving left: insert before target
					row.insertBefore(cellToMove, targetCell);
				}
			});

			// Move the colgroup entry
			const colgroup = table.querySelector('colgroup');
			if(colgroup) {
				const cols = colgroup.querySelectorAll('col');
				const colToMove = cols[columnIndex];
				const targetCol = cols[targetIndex];
				if(colToMove && targetCol) {
					if(direction > 0) {
						// Moving right: insert after target
						colgroup.insertBefore(colToMove, targetCol.nextSibling);
					} else {
						// Moving left: insert before target
						colgroup.insertBefore(colToMove, targetCol);
					}
				}
			}
		});
	}

	static swapCells(table: HTMLTableElement, row1: number, col1: number, row2: number, col2: number, tableState: TableState): void {
		const cell1 = table.rows[row1]?.cells[col1];
		const cell2 = table.rows[row2]?.cells[col2];
		if(!cell1 || !cell2) return;

		// Deactivate any cell editors before the swap — clear cache and remove
		// Quill classes. Must happen before performUndoableOperation so the
		// cell editor DOM doesn't interfere with value() serialization.
		if(tableState.editorCache[cell1.id]) {
			tableState.editorCache[cell1.id].removeListener?.();
			delete tableState.editorCache[cell1.id];
			cell1.classList.remove('ql-container', 'ql-snow');
		}
		if(tableState.editorCache[cell2.id]) {
			tableState.editorCache[cell2.id].removeListener?.();
			delete tableState.editorCache[cell2.id];
			cell2.classList.remove('ql-container', 'ql-snow');
		}
		tableState.activeCellId = undefined;

		this.performUndoableOperation(table, () => {
			const controls1 = this.removeControlsFromCell(cell1);
			const controls2 = this.removeControlsFromCell(cell2);

			// If either cell had an active editor, its innerHTML contains the Quill
			// .ql-editor wrapper with inherited theme color styles. Extract just the
			// editor content to avoid swapping those styles into the other cell.
			const getCleanContent = (cell: HTMLTableCellElement): string => {
				const editorDiv = cell.querySelector('.ql-editor') as HTMLElement;
				return editorDiv ? editorDiv.innerHTML : cell.innerHTML;
			};

			const temp = getCleanContent(cell1);
			cell1.innerHTML = getCleanContent(cell2);
			cell2.innerHTML = temp;

			this.restoreControlsToCell(cell1, controls1);
			this.restoreControlsToCell(cell2, controls2);
		});
	}

	/// Searches for the nearest table in the given direction, skipping over empty
	/// paragraphs (newlines). Returns null if a non-empty non-table element is
	/// encountered first, or if no table is found.
	static findAdjacentTable(table: HTMLTableElement, direction: 'above' | 'below'): HTMLTableElement | null {
		let sibling = direction === 'below'
			? table.nextElementSibling
			: table.previousElementSibling;

		while(sibling) {
			if(sibling.tagName === 'TABLE' && sibling.classList.contains('ql-table-blot')) {
				return sibling as HTMLTableElement;
			}
			// Skip empty paragraphs (newlines between tables)
			if(sibling.tagName === 'P' && (!sibling.textContent || sibling.textContent === '\n')) {
				sibling = direction === 'below'
					? sibling.nextElementSibling
					: sibling.previousElementSibling;
				continue;
			}
			// Non-empty, non-table content found
			return null;
		}
		return null;
	}

	static splitTable(table: HTMLTableElement, rowIndex: number, tableState: TableState, editor: any): void {
		if(rowIndex <= 0 || rowIndex >= table.rows.length) return;

		// Serialize current table state
		const tableDataJson = this.value(table);
		const tableData = JSON.parse(tableDataJson);
		const formats = this.formats(table);

		// Build top table: rows 0..rowIndex-1
		const topData = {
			columns: tableData.columns,
			rows: rowIndex,
			cells: tableData.cells.slice(0, rowIndex)
		};

		// Build bottom table: rows rowIndex..end
		const bottomData = {
			columns: tableData.columns,
			rows: tableData.rows - rowIndex,
			cells: tableData.cells.slice(rowIndex)
		};

		// Clear cell editor state for all cells in this table
		for(const cellId of Object.keys(tableState.editorCache)) {
			const cellElement = document.getElementById(cellId);
			if(cellElement && table.contains(cellElement)) {
				tableState.editorCache[cellId].removeListener?.();
				delete tableState.editorCache[cellId];
			}
		}
		tableState.activeCellId = undefined;

		// Find the table's position in the Quill document
		const blot = Quill.find(table);
		if(!blot) return;
		const index = editor.getIndex(blot);
		if(index === -1) return;

		// Replace original table with two new tables, separated by a newline
		editor.deleteText(index, 1, 'user');
		editor.insertEmbed(index, 'table', JSON.stringify(topData), 'user');
		editor.insertText(index + 1, '\n', 'user');
		editor.insertEmbed(index + 2, 'table', JSON.stringify(bottomData), 'user');

		// Re-apply formats (column widths, colors) to both new tables
		if(Object.keys(formats).length > 0) {
			editor.formatText(index, 1, formats, 'silent');
			editor.formatText(index + 2, 1, formats, 'silent');
		}
	}

	static mergeTables(table: HTMLTableElement, direction: 'above' | 'below', tableState: TableState, editor: any): void {
		const blot = Quill.find(table);
		if(!blot) return;
		const index = editor.getIndex(blot);
		if(index === -1) return;

		// Find adjacent table, skipping newlines between tables
		const adjacentTable = this.findAdjacentTable(table, direction);
		if(!adjacentTable) return;

		const currentCols = table.rows[0]?.cells.length || 0;
		const adjacentCols = adjacentTable.rows[0]?.cells.length || 0;
		if(currentCols === 0 && adjacentCols === 0) return;

		// Determine which table is first (top) and which is second (bottom)
		const adjacentBlot = Quill.find(adjacentTable);
		if(!adjacentBlot) return;
		const adjacentIndex = editor.getIndex(adjacentBlot);

		const firstTable = direction === 'above' ? adjacentTable : table;
		const secondTable = direction === 'above' ? table : adjacentTable;
		const firstIndex = Math.min(index, adjacentIndex);
		const secondIndex = Math.max(index, adjacentIndex);

		// Serialize both tables
		const firstData = JSON.parse(this.value(firstTable));
		const secondData = JSON.parse(this.value(secondTable));
		const formats = this.formats(firstTable);

		// Pad rows in the narrower table with empty cells to match the wider one
		const maxCols = Math.max(firstData.columns, secondData.columns);
		const padRows = (cells: any[][], targetCols: number) => {
			return cells.map((row: any[]) => {
				while(row.length < targetCols) {
					row.push({ content: '' });
				}
				return row;
			});
		};

		// Build merged table data
		const mergedData = {
			columns: maxCols,
			rows: firstData.rows + secondData.rows,
			cells: padRows(firstData.cells, maxCols).concat(padRows(secondData.cells, maxCols))
		};

		// Clear cell editor state for cells in both tables
		for(const cellId of Object.keys(tableState.editorCache)) {
			const cellElement = document.getElementById(cellId);
			if(cellElement && (firstTable.contains(cellElement) || secondTable.contains(cellElement))) {
				tableState.editorCache[cellId].removeListener?.();
				delete tableState.editorCache[cellId];
			}
		}
		tableState.activeCellId = undefined;

		// Delete both tables and any newlines between them in one operation
		const deleteLength = secondIndex - firstIndex + 1;
		editor.deleteText(firstIndex, deleteLength, 'user');

		// Insert merged table at the first table's position
		editor.insertEmbed(firstIndex, 'table', JSON.stringify(mergedData), 'user');

		// Re-apply formats
		if(Object.keys(formats).length > 0) {
			editor.formatText(firstIndex, 1, formats, 'silent');
		}
	}

	/// Wraps a structural table operation (move/delete/insert/duplicate row/col, swap cells)
	/// so that the DOM change is recorded in Quill's undo history as a single entry.
	/// The subsequent setupTableControls and reapplyFormats calls remain suppressed.
	/// Supports nesting: when called from within another performUndoableOperation, inner
	/// calls only run the operation — flush/setupTableControls/reapplyFormats are deferred
	/// to the outermost call.
	static performUndoableOperation(table: HTMLTableElement, operation: () => void): void {
		const editor = this.getEditorForTable(table);
		const isOutermost = this._batchDepth === 0;

		if(isOutermost) {
			editor.cutoffPrimaryHistory();
			editor.isStructuralTableOperation = true;
		}
		this._batchDepth++;

		try {
			operation();
		} finally {
			this._batchDepth--;
			if(isOutermost) {
				editor.flushPrimaryEditorMutations();
				this.setupTableControls(table);
				this.reapplyFormats(table);
				editor.isStructuralTableOperation = false;
				editor.cutoffPrimaryHistory();
				editor.scheduleProcessVisibleLines();
			}
		}
	}

	// Position-dependent formats: their target cells/rows can change after a structural op.
	// Everything else (fg/bg/justification/column-widths) targets elements that structural
	// row/column ops don't touch, so those formats don't need re-application.
	private static readonly POSITION_DEPENDENT_FORMAT_KEYS = [
		'table-alt-background-color',
		'table-line-color',
		'table-first-row-background-color',
		'table-first-row-foreground-color',
		'table-first-row-line-color',
		'table-first-column-background-color',
		'table-first-column-foreground-color',
		'table-first-column-line-color',
	];

	static reapplyFormats(table: HTMLTableElement) {
		const perfTimer = NotesPerfTimer.start('reapplyFormats');
		try {
			const editor = this.getEditorForTable(table);
			const formats = this.formats(table);

			const activeKeys = TableBlot.POSITION_DEPENDENT_FORMAT_KEYS.filter(k => formats[k] != null);
			perfTimer.withContext('active', activeKeys.length);

			// Fast path: no position-dependent formats set. Root formats (fg/bg/justification/
			// column-widths) survive structural ops unchanged, so nothing needs re-syncing.
			// Skipping here is the common case for non-themed tables.
			if(activeKeys.length === 0) {
				perfTimer.withContext('skipped', 1);
				return;
			}

			editor.withHistoryIgnored(() => {
				// Narrow the blanket clear: only clear the style properties we'll re-apply,
				// and only on the elements each format actually targets.
				const clearRowBg = formats['table-alt-background-color'] != null;
				const clearCellBg = activeKeys.some(k =>
					k === 'table-first-row-background-color' ||
					k === 'table-first-column-background-color');
				const clearCellFg = activeKeys.some(k =>
					k === 'table-first-row-foreground-color' ||
					k === 'table-first-column-foreground-color');
				const clearCellBorder = activeKeys.some(k =>
					k === 'table-line-color' ||
					k === 'table-first-row-line-color' ||
					k === 'table-first-column-line-color');

				if(clearRowBg) {
					table.querySelectorAll('tr').forEach((el: any) => el.style.removeProperty('background-color'));
				}
				if(clearCellBg || clearCellFg || clearCellBorder) {
					const cells = table.querySelectorAll('td');
					cells.forEach((el: any) => {
						if(clearCellBg) el.style.removeProperty('background-color');
						if(clearCellFg) el.style.removeProperty('color');
						if(clearCellBorder) el.style.removeProperty('border-color');
					});
					perfTimer.withContext('cells', cells.length);
				}

				// Only re-apply position-dependent keys; root formats still live on the table root.
				for(const key of activeKeys) {
					this.formatInternal(table, key, formats[key]);
				}
			});
		} finally {
			perfTimer.stop();
		}
	}

	static value(node: HTMLElement): string {
		// Return the JSON representation of the table data based on the node's contents
		const tableData = new TableData();
		// Get the number of columns by counting the number of cells in the first row
		tableData.columns = node.querySelector('tr')?.childElementCount || 0;
		// Get the number of rows by counting the number of rows
		tableData.rows = node.querySelectorAll('tr').length;
		// Initialize the cells array
		tableData.cells = Array.from({length: tableData.rows}, () => Array(tableData.columns).fill(""));

		// Get the text content of each cell
		node.querySelectorAll('tr').forEach((row, rowIndex) => {
			row.querySelectorAll('td').forEach((cell, colIndex) => {
				const cached = this.readCellDelta(cell as HTMLTableCellElement);
				if(cached) {
					tableData.cells[rowIndex][colIndex] = JSON.stringify(cached);
					return;
				}

				// create a duplicate of the cell and remove all controls from it
				const cellClone = cell.cloneNode(true) as HTMLElement;
				this.removeControlsFromCell(cellClone);
				// Strip inline styles from Quill's .ql-editor wrapper (if this cell has
				// an active editor). The wrapper inherits color/backgroundColor from the
				// table theme for display, but convertHtmlToDelta would misinterpret them
				// as explicit text formatting, baking theme colors into the cell delta.
				const editorDiv = cellClone.querySelector('.ql-editor') as HTMLElement;
				if(editorDiv) {
					editorDiv.style.removeProperty('color');
					editorDiv.style.removeProperty('background-color');
				}
				const html = cellClone.innerHTML || "";

				const delta = QuillExtensions.convertHtmlToDelta(html);
				tableData.cells[rowIndex][colIndex] = JSON.stringify(delta);
			});
		});

		// Ignore the next selection-change event that will be triggered by the update to the primary editor
		// Only do this if we have an editor (not in headless mode for conversion)
		try {
			const editor = this.getEditorForTable(node as HTMLTableElement);
			editor.tableState.ignoreNextSelectionChange = true;
		} catch(e) {
			// In headless mode (e.g., convertDeltaToHtml), there's no editor to find
			// This is expected and safe to ignore
		}

		// Serialize the tableData into JSON
		return JSON.stringify(tableData);
	}

	static formats(domNode: HTMLElement): Record<string, any> {

		const formats: Record<string, any> = {};

		// Read column widths from the colgroup - the allows resizing to be saved
		const colgroup = domNode.querySelector('colgroup');
		if(colgroup) {
			const widths: number[] = [-1];
			colgroup.querySelectorAll('col').forEach(col => {
				const width = parseInt(col.style.width || '0');
				widths.push(width);
			});
			formats['table-column-widths'] = widths.join(',');
		}

		// Find all attributes stored as data-table-*
		Array.from(domNode.attributes).forEach(attr => {
			// Check if the attribute name starts with 'data-table-'
			if(attr.name.startsWith('data-table-')) {
				// Strip off 'data-' to form the format key.
				// For example, data-table-extra -> table-extra.
				const key = attr.name.substring(5);
				// Only add it if it's not already in the formats object.
				if(formats[key] === undefined) {
					formats[key] = attr.value;
				}
			}
		});

		return formats;
	}

	static formatInternal(domNode: HTMLElement, name: string, value: any) {

		// save everything as data-table-* attributes so it is easily retrievable
		// normally you want to store in the DOM as properties so that they can
		// be retrieved if converting from HTML to Delta, but in this case we
		// don't need to worry about that because there is no standard location for these
		// attributes in the DOM
		if(value) {
			domNode.setAttribute('data-' + name, value);
		} else {
			domNode.removeAttribute('data-' + name);
		}

		if(name === 'table-foreground-color') {
			if(value) {
				domNode.style.color = value;
			} else {
				domNode.style.removeProperty('color');
			}
		} else if(name === 'table-background-color') {
			if(value) {
				domNode.style.backgroundColor = value;
			} else {
				domNode.style.removeProperty('background-color');
			}
		} else if(name === 'table-alt-background-color') {
			var isAlt = true;
			domNode.querySelectorAll('tr').forEach((row: any) => {
				if(isAlt) {
					if(value) {
						row.style.backgroundColor = value;
					} else {
						row.style.removeProperty('background-color');
					}
				}
				isAlt = !isAlt;
			});
		} else if(name === 'table-line-color') {
			domNode.querySelectorAll('td').forEach((cell: any) => {
				if(value) {
					cell.style.borderColor = value;
				} else {
					cell.style.removeProperty('border-color');
				}
			});
		} else if(name === 'table-first-row-background-color') {
			domNode.querySelector('tr:first-child')!.querySelectorAll('td').forEach((cell: any) => {
				if(value) {
					cell.style.backgroundColor = value;
				} else {
					cell.style.removeProperty('background-color');
				}
			});
		} else if(name === 'table-first-row-foreground-color') {
			domNode.querySelector('tr:first-child')!.querySelectorAll('td').forEach((cell: any) => {
				if(value) {
					cell.style.color = value;
				} else {
					cell.style.removeProperty('color');
				}
			});
		} else if(name === 'table-first-row-line-color') {
			domNode.querySelector('tr:first-child')!.querySelectorAll('td').forEach((cell: any) => {
				if(value) {
					cell.style.borderColor = value;
				} else {
					cell.style.removeProperty('border-color');
				}
			});
		} else if(name === 'table-first-column-background-color') {
			domNode.querySelectorAll('td:first-child').forEach((cell: any, index: number) => {
				if(value) {
					if(index > 0) {
						cell.style.backgroundColor = value;
					}
				} else {
					cell.style.removeProperty('background-color');
				}
			});
		} else if(name === 'table-first-column-foreground-color') {
			domNode.querySelectorAll('td:first-child').forEach((cell: any, index: number) => {
				if(value) {
					if(index > 0) {
						cell.style.color = value;
					}
				} else {
					cell.style.removeProperty('color');
				}
			});
		} else if(name === 'table-first-column-line-color') {
			domNode.querySelectorAll('td:first-child').forEach((cell: any, index: number) => {
				if(value) {
					if(index > 0) {
						cell.style.borderColor = value;
					}
				} else {
					cell.style.removeProperty('border-color');
				}
			});
		} else if(name === 'table-justification') {
			domNode.style.removeProperty('margin-left');
			domNode.style.removeProperty('margin-right');
			if(value === 'center') {
				domNode.style.marginLeft = 'auto';
				domNode.style.marginRight = 'auto';
			} else if(value === 'right') {
				domNode.style.marginLeft = 'auto';
			}
		} else if(name === 'table-column-widths') {
			if(value) {
				const widths = value.split(',');
				domNode.querySelectorAll('col').forEach((col: any, index: number) => {
					const w = parseInt(widths[index + 1]);
					if(w > 0) {
						col.style.width = w + 'px';
					} else {
						col.style.removeProperty('width');
					}
				});
			} else {
				domNode.querySelectorAll('col').forEach((col: any) => {
					col.style.removeProperty('width');
				});
			}
		}
	}

	format(name: string, value: any) {
		if(name === 'align') {
			name = 'table-justification';
		}
		if(!name.startsWith('table-')) {
			// only handle table-* formats
			super.format(name, value);
			return;
		}

		TableBlot.formatInternal(this.domNode, name, value);
	}

	/// Activate the editor at the given x, y coordinates
	/// Returns true if a cell editor was activated, false if not
	static activateEditorAt(x: number, y: number, isFromArrowKeyEventInsideTable: boolean, editor: VenusEditor): boolean {
		const element = this.elementFromPointIgnoreClasses(x, y, ['ql-table-control']);
		const targetCell = element.closest('td') as HTMLElement;
		if(!targetCell) {
			// There is no cell at the location, check if we are within the y bounds of the table
			if(editor.tableState.lastActiveCellId && editor.tableState.editorCache[editor.tableState.lastActiveCellId]) {
				const table = editor.tableState.editorCache[editor.tableState.lastActiveCellId].cellElement.closest('table')!;
				const tableRect = table.getBoundingClientRect();
				const isAbove = y < tableRect.top;
				const isBelow = y > tableRect.bottom;
				if(isAbove || isBelow) {
					// Exit out to parent quill editor
					let editorElement = table.closest('.ql-editor') as HTMLElement | null;
					if(editorElement) {
						// Get the quill instance
						const quill = Quill.find(editorElement.parentElement!);
						if(quill && quill instanceof Quill) {
							const bounds = editorElement.parentElement!.getBoundingClientRect();
							let index = QuillExtensions.getClosestIndex(quill, x - bounds.x, y - bounds.y);
							if(isBelow) {
								// If below the table, we need to put the cursor onto the next line
								index++;
							}
							quill.setSelection(index, 0, 'user');
							if(isAbove && index == 0 && isFromArrowKeyEventInsideTable) {
								// We're at the start of the editor
								const line = quill.getLine(index);
								if(line.length > 0 && line[0] instanceof TableBlot) {
									// If the table is the first element, we should insert an empty line since otherwise the user won't be able to add content before it.
									quill.insertText(0, '\n', 'user');
									quill.setSelection(0, 0, 'user');
								}
							}
							// Reset activeEditor to primary since we've exited the table
							editor.activeEditor = 'primary';
							// Don't set the focus until the selection is set, otherwise it will scroll to the top
							editorElement.focus();
						} else {
							console.error('Could not find Quill instance');
						}
					}
					return false;
				} else {
					// Wrap to the next/previous row
					if(x > tableRect.right) {
						// Move to the next row
						let nextRow = editor.tableState.editorCache[editor.tableState.lastActiveCellId].cellElement.closest('tr')!.nextElementSibling;
						if(nextRow) {
							let cell = nextRow.querySelector('td')!;
							let bounds = cell.getBoundingClientRect();
							x = bounds.x;
							y = bounds.y + bounds.height / 2;
							return this.activateEditorAt(x, y, isFromArrowKeyEventInsideTable, editor);
						} else {
							// This is the last row, exit the table
							x = tableRect.x;
							y = tableRect.y + tableRect.height + 10;
							return this.activateEditorAt(x, y, isFromArrowKeyEventInsideTable, editor);
						}
					} else if(x < tableRect.left) {
						// Move to the previous row
						let prevRow = editor.tableState.editorCache[editor.tableState.lastActiveCellId].cellElement.closest('tr')!.previousElementSibling;
						if(prevRow) {
							// get the last cell in the row
							let cells = prevRow.querySelectorAll('td');
							let cell = cells[cells.length - 1];
							let bounds = cell.getBoundingClientRect();
							x = bounds.x + bounds.width - 1;
							y = bounds.y + bounds.height / 2;
							return this.activateEditorAt(x, y, isFromArrowKeyEventInsideTable, editor);
						} else {
							// This is the first row, exit the table
							const editorRect = table.closest('.ql-editor')!.getBoundingClientRect();
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
		if(!cellQuill) {
			return false;
		}

		let bounds = targetCell.getBoundingClientRect();
		const scale = getScaleFactor(targetCell);
		const relativeX = (x - bounds.x) / scale;
		const relativeY = (y - bounds.y) / scale;
		QuillExtensions.setSelectionFromCoordinates(cellQuill, relativeX, relativeY);
		return true;
	}

	static elementFromPointIgnoreClasses(x: number, y: number, ignoredClasses: string[] = []): HTMLElement {
		const processedElements = new Map<HTMLElement, string>();
		let element: HTMLElement = document.documentElement;

		while(true) {
			let hitTest = document.elementFromPoint(x, y);

			// If no element found or we've reached document/html, stop
			if(!hitTest || hitTest === document.documentElement) {
				break;
			}
			element = hitTest as HTMLElement;

			// Check if this element or any ancestor should be ignored
			const shouldIgnoreElement = this.shouldIgnoreElementOrAncestors(element, x, y, ignoredClasses);

			if(shouldIgnoreElement.ignore) {
				const elementToHide = shouldIgnoreElement.elementToHide!;
				// Already hid this once and still hit - hiding again won't help, bail out.
				if(processedElements.has(elementToHide)) {
					break;
				}
				processedElements.set(elementToHide, elementToHide.style.pointerEvents);
				elementToHide.style.pointerEvents = 'none';
				continue;
			}

			// Found a valid element
			break;
		}

		// Restore original pointer-events
		processedElements.forEach((originalPointerEvents, element) => {
			element.style.pointerEvents = originalPointerEvents;
		});

		return element;
	}

	private static shouldIgnoreElementOrAncestors(
		element: HTMLElement,
		x: number,
		y: number,
		ignoredClasses: string[]
	): { ignore: boolean; elementToHide?: HTMLElement } {
		// Bounds check only applies to the hit element itself. An ancestor whose
		// bounds don't contain (x,y) isn't blocking - hiding it won't stop
		// elementFromPoint from returning the same child again (infinite loop).
		const rect = element.getBoundingClientRect();
		const isWithinBounds = x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
		if(!isWithinBounds) {
			return {ignore: true, elementToHide: element};
		}

		let currentElement: HTMLElement | null = element;
		while(currentElement && currentElement !== document.documentElement) {
			const hasIgnoredClass = ignoredClasses.some(className =>
				currentElement!.classList.contains(className)
			);
			if(hasIgnoredClass) {
				return {ignore: true, elementToHide: currentElement};
			}
			currentElement = currentElement.parentElement;
		}

		return {ignore: false};
	}

	static activateCell(targetCell: HTMLElement, editor: VenusEditor): any | undefined {
		// TS signature says HTMLElement but callers sometimes pass null (e.g. a stale
		// getElementById lookup for a destroyed cell). Guard so getCellId's WeakMap.set
		// doesn't throw and stall whatever flow we're in the middle of.
		if(!targetCell) return undefined;
		const cellId = TableBlot.getCellId(targetCell);

		// Detached cell means stale quill; force a rebuild.
		const cached = editor.tableState.editorCache[cellId];
		if(cached && !document.contains(cached.cellElement)) {
			cached.removeListener?.();
			delete editor.tableState.editorCache[cellId];
		}

		if(editor.tableState.activeCellId == cellId && editor.tableState.editorCache[cellId]) {
			// already editing this cell
			const existing = editor.tableState.editorCache[cellId].quill;
			const existingRoot = existing?.root as HTMLElement | undefined;
			if(existingRoot) {
				existingRoot.dataset.tableCellId = cellId;
			}
			editor.activeEditor = 'cell';
			return existing;
		}

		editor.tableState.activeCellId = cellId;
		editor.tableState.lastActiveCellId = cellId;

		if(editor.tableState.editorCache[cellId]) {
			const cachedQuill = editor.tableState.editorCache[cellId].quill;
			const cachedRoot = cachedQuill?.root as HTMLElement | undefined;
			if(cachedRoot) {
				cachedRoot.dataset.tableCellId = cellId;
			}
			editor.activeEditor = 'cell';
			return cachedQuill;
		}

		return TableBlot.createCellEditor(cellId, targetCell, editor);
	}

	// WeakMap tracks which cell elements we've assigned an id to. Unlike cell.id
	// (which cloneNode(true) copies to clones), the map doesn't follow clones -
	// so the first getCellId call on a cloned cell always mints a fresh id.
	private static cellIds = new WeakMap<HTMLElement, string>();

	static getCellId(cell: HTMLElement): string {
		let id = this.cellIds.get(cell);
		if(id) return id;
		id = Math.random().toString(36).substr(2, 9);
		this.cellIds.set(cell, id);
		cell.id = id; // stamped for document.getElementById lookups
		return id;
	}

	private static removeControlsFromCell(cell: Element): NodeListOf<Element> {
		// If controls have been added to the cell, remove them before operations such as
		// creating the editor, getting the content, etc
		const controlsList = cell.querySelectorAll('.ql-table-control');
		controlsList.forEach(control => control.remove());
		return controlsList;
	}

	private static restoreControlsToCell(cell: Element, controlsList: NodeListOf<Element>) {
		controlsList.forEach(control => cell.appendChild(control));
	}

	static createCellEditor(cellId: string, targetCell: HTMLElement, editor: VenusEditor): any {
		const perfTimer = NotesPerfTimer.start('createCellEditor');
		try {

		// Prevent cell editor creation from being recorded in the primary editor's
		// history — Quill restructures the cell DOM which the primary editor's
		// MutationObserver detects as a text-change, corrupting both undo and redo stacks.
		const { cellQuill, activationHash, computeCellHash } = editor.withHistoryIgnored(() => {
			const controlsList = this.removeControlsFromCell(targetCell);
			const cellQuill = editor.getCellEditor(targetCell);
			const cellRoot = cellQuill?.root as HTMLElement | undefined;
			if(cellRoot) {
				cellRoot.dataset.tableCellId = cellId;
			}
			// Hash the cell's current text so we can (a) skip the activation-time
			// force-process when it matches the static-processed hash, and (b) later
			// skip the blur-time force-process when content is unchanged.
			const computeCellHash = (): string => {
				const t = cellQuill.getText();
				const s = t.endsWith('\n') ? t.slice(0, -1) : t;
				return s.length > 0 ? QuillExtensions.computeHash(s) : '';
			};
			const activationHash = computeCellHash();

			if(editor.editorSettings.doMentionProcessing || editor.editorSettings.isSpellCheckEnabled) {
				// Skip if empty or if content matches the last static-processed hash -
				// the static path already wrote recognition into the cell HTML.
				const staticHash = targetCell.dataset[CELL_PROCESSED_HASH_DATASET_KEY] ?? '';
				if(activationHash.length > 0 && activationHash !== staticHash) {
					perfTimer.withContext('processVisible', 1);
					QuillExtensions.processVisibleLines(cellQuill, editor, { force: true });
				} else {
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

			// Define the function within this method's scope
			const onSelectionChange = async (range: any) => {
				if(!range) {
					// Defer destroy by one tick. Quill's editor-change handler at
					// initQuillExtensions ends up calling getSelection() on the cell quill,
					// which internally calls update() — a recursive flush. During that
					// inner flush, selection-change can emit range=null transiently even
					// though the user is still typing in the cell. By the next macrotask
					// the recursive update has resolved and Quill's true selection state
					// is stable — so we re-check before tearing anything down.
					await new Promise<void>(r => setTimeout(r, 0));

					// Re-check using Quill's own focus tracking (doesn't trigger another
					// update) AND document.activeElement. If either says we're still in
					// the cell, the null was spurious.
					const activeEl = document.activeElement;
					const focusInCell = activeEl && cellQuill.root && cellQuill.root.contains(activeEl);
					const quillHasFocus = typeof cellQuill.hasFocus === 'function' && cellQuill.hasFocus();
					if(focusInCell || quillHasFocus) {
						return;
					}

					// Explicit keep-alive (dialog/tooltip) or chrome click — spare the destroy.
					if(editor.isCellEditorKeptAlive) return;
					if(editor.isFocusInEditorChrome(activeEl)) return;
					if(editor.editorSettings.doMentionProcessing || editor.editorSettings.isSpellCheckEnabled) {
						// Skip the blur-time force-process when the cell's text is unchanged
						// since activation. The cell quill's own text-change handler already
						// debounced-processes edits during the session, so running a full
						// awaited pass here on an unedited cell is pure overhead (and is a
						// major cause of the "click cell then click outside" hang).
						const blurHash = computeCellHash();
						if(blurHash !== activationHash) {
							try {
								await QuillExtensions.processVisibleLines(cellQuill, editor, { force: true, awaitCompletion: true });
							} catch(error) {
								console.error('Failed to process cell text on blur:', error);
							}
						}
					}
					// Capture the cell's clean delta directly from the live editor
					// before we overwrite innerHTML. This bypasses the HTML-to-delta
					// round-trip on the next value() call and avoids the theme-leak
					// from inline styles on cellQuill's root.
					const blurDelta = cellQuill.getContents();

					// Prevent cell deactivation from being recorded in the primary
					// editor's history — same reason as in createCellEditor.
					editor.withHistoryIgnored(() => {
						const controlsList = this.removeControlsFromCell(targetCell);
						const content = cellQuill.root.innerHTML;
						targetCell.innerHTML = content || '<p><br></p>';
						this.restoreControlsToCell(targetCell, controlsList);
					});
					this.storeCellDelta(targetCell as HTMLTableCellElement, blurDelta);

					targetCell.classList.remove('ql-container', 'ql-snow');
				editor.tableState.editorCache[cellId]?.removeListener?.();
				delete editor.tableState.editorCache[cellId];
				if(editor.tableState.activeCellId === cellId) {
					editor.tableState.activeCellId = undefined;
				}
			}
		};

		// Store the function that removes the listener
		editor.tableState.editorCache[cellId].removeListener = () => {
			cellQuill.off('selection-change', onSelectionChange);
		};

			cellQuill.on('selection-change', onSelectionChange);

			return cellQuill;
		} finally {
			perfTimer.stop();
		}
	}

	// Builds a request for ProcessCells, or null if the cell should be skipped.
	// Sets the hash preemptively so a concurrent pass won't re-dispatch in-flight cells.
	private static buildStaticCellRequest(cell: HTMLTableCellElement, editor: VenusEditor): { cellId: string, text: string, hashValue: string } | null {
		const cellId = this.getCellId(cell);
		if(editor.tableState.editorCache[cellId]) {
			return null; // live editor owns active cells
		}

		const text = QuillExtensions.getPlainTextFromHtml(cell.innerHTML);
		if(text.length === 0) {
			if(cell.dataset[CELL_PROCESSED_HASH_DATASET_KEY]) {
				delete cell.dataset[CELL_PROCESSED_HASH_DATASET_KEY];
			}
			if(cell.dataset[MISSPELLING_SKIP_DATASET_KEY]) {
				delete cell.dataset[MISSPELLING_SKIP_DATASET_KEY];
			}
			return null;
		}

		const computedHash = QuillExtensions.computeHash(text);
		if(cell.dataset[CELL_PROCESSED_HASH_DATASET_KEY] === computedHash) {
			return null;
		}

		cell.dataset[CELL_PROCESSED_HASH_DATASET_KEY] = computedHash;
		return { cellId, text, hashValue: computedHash };
	}

	static async processStaticTable(table: HTMLTableElement, editor: VenusEditor): Promise<void> {
		if(!editor.dotNetHelper) {
			return;
		}
		if(table.rows.length === 0) {
			return;
		}

		// Viewport cull (margin 0). Rows below viewport re-enter this path when the
		// user scrolls them into view (scroll handler -> processVisibleLines -> processLine).
		const viewportBottom = window.innerHeight || document.documentElement.clientHeight;

		// Table-level early exit: if the whole table is off-screen, skip every row.
		const tableRect = table.getBoundingClientRect();
		if(tableRect.bottom < 0 || tableRect.top > viewportBottom) {
			return;
		}

		// Row-level cull: one rect read per row, not per cell. Rows are in document
		// order so we can break as soon as a row starts past the viewport bottom.
		const batch: Array<{ cellId: string, text: string, hashValue: string }> = [];
		for(let r = 0; r < table.rows.length; r++) {
			const row = table.rows[r];
			const rowRect = row.getBoundingClientRect();
			if(rowRect.bottom < 0) continue;
			if(rowRect.top > viewportBottom) break;
			for(let c = 0; c < row.cells.length; c++) {
				const req = this.buildStaticCellRequest(row.cells[c] as HTMLTableCellElement, editor);
				if(req) {
					batch.push(req);
				}
			}
		}

		if(batch.length === 0) {
			return;
		}

		await editor.dotNetHelper.invokeMethodAsync('ProcessCells', batch);
	}

	public static getEditorForCellId(cellId: string) {
		// Try to find the cell element by ID
		const cell = document.getElementById(cellId);
		if(!cell) {
			return null;
		}

		// Get the table containing this cell
		const table = cell.closest('table') as HTMLTableElement;
		if(!table) {
			return null;
		}

		// Get the editor for this table
		const editor = TableBlot.getEditorForTable(table);
		if(!editor || !editor.tableState.editorCache[cellId]) {
			return null;
		}

		return editor.tableState.editorCache[cellId];
	}

}

// Hybrid cursor: native caret stays in charge for typing, IME, at-rest blinking.
// On a navigation move (arrow key, click, programmatic setSelection), hide the native
// caret, animate a custom div from old to new position, then yield back to native.
// Distance-adaptive durations match Keza; >1200px snaps.
class AnimatedCaret {
	private static readonly TYPING_RECENT_MS = 50;
	private static readonly CLICK_RECENT_MS = 50;
	// One full ON-phase of the native blink cycle. We hide the div precisely when
	// the native caret transitions into its first OFF phase, so the disappearance
	// reads as a normal blink rather than a swap.
	private static readonly POST_ANIMATION_HOLD_MS = 530;

	private quill: any;
	private editorRoot: HTMLElement;
	private caretEl: HTMLDivElement;
	private lastTextChangeTime = 0;
	private lastMouseDownTime = 0;
	private lastSelectionIndex: number | null = null;
	private animationFrameId: number | null = null;
	private hideTimerId: number | null = null;

	constructor(quill: any) {
		this.quill = quill;
		this.editorRoot = quill.root;

		// Caret div lives in .ql-container (sibling of .ql-editor) so Quill's
		// MutationObserver doesn't try to format/strip it as foreign content.
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
		// Listen on .ql-container (not .ql-editor) so clicks in empty parts of a
		// cell or in editor padding also register as click-driven moves. Capture
		// phase fires before Quill's own click handling.
		quill.container.addEventListener('mousedown', this.onMouseDown, true);
	}

	dispose(): void {
		this.quill.off('text-change', this.onTextChange);
		this.quill.off('selection-change', this.onSelectionChange);
		this.quill.container.removeEventListener('mousedown', this.onMouseDown, true);
		this.cancel();
		this.caretEl.remove();
	}

	private onMouseDown = (): void => {
		this.lastMouseDownTime = performance.now();
		// Hide any in-flight or held div immediately so it doesn't sit at its old
		// position while native paints at the click target. Don't restore caret-color
		// here: if we're mid-animation it's currently transparent, and restoring it
		// now would paint native at Quill's stale selection (still at the source)
		// before the browser has settled it at the click target - that's the OLD
		// flash we're fixing. caret-color is restored later in onSelectionChange's
		// click-snap branch via cancel(), once Quill has the new selection.
		this.cancelTimers();
		this.caretEl.style.display = 'none';
	};

	private onTextChange = (): void => {
		this.lastTextChangeTime = performance.now();
		// Document changed - native cursor is now in the right place. Bail out of any
		// in-flight navigation animation so we don't show a stale ghost.
		this.cancel();
	};

	private onSelectionChange = (range: any, oldRange: any): void => {
		if(!range || range.length > 0) {
			// Focus loss or range selection: native handles it.
			this.cancel();
			this.lastSelectionIndex = range?.index ?? null;
			return;
		}
		const now = performance.now();
		if(now - this.lastTextChangeTime < AnimatedCaret.TYPING_RECENT_MS) {
			// Selection-change rode in on the back of typing - don't animate.
			this.lastSelectionIndex = range.index;
			return;
		}
		if(now - this.lastMouseDownTime < AnimatedCaret.CLICK_RECENT_MS) {
			// Click-driven move. Restore caret-color now (in case mousedown caught
			// us mid-animation): the browser has settled the selection at the click
			// target by this point, so native paints there cleanly. No animation.
			this.cancel();
			this.lastSelectionIndex = range.index;
			return;
		}
		const fromIdx = oldRange?.index ?? this.lastSelectionIndex;
		const toIdx = range.index;
		this.lastSelectionIndex = toIdx;
		if(fromIdx == null || fromIdx === toIdx) return;

		this.animate(fromIdx, toIdx);
	};

	private animate(fromIdx: number, toIdx: number): void {
		const fromBounds = this.quill.getBounds(fromIdx);
		const toBounds = this.quill.getBounds(toIdx);
		if(!fromBounds || !toBounds) return;

		const dx = toBounds.left - fromBounds.left;
		const dy = toBounds.top - fromBounds.top;
		const distance = Math.sqrt(dx * dx + dy * dy);

		// Distance-adaptive durations (matches Keza). Huge jumps snap.
		let duration: number;
		if(distance >= 1200) {
			this.cancel();
			return;
		}
		if(distance < 30) duration = 51;
		else if(distance < 250) duration = 119;
		else duration = 153;

		this.cancelTimers();
		// Position the div at fromBounds BEFORE making it visible. Otherwise it'd
		// briefly paint at the previous animation's landing position, looking like
		// a jump back-and-forth before the slide starts.
		this.caretEl.style.left = `${fromBounds.left}px`;
		this.caretEl.style.top = `${fromBounds.top}px`;
		this.caretEl.style.height = `${toBounds.height}px`;
		this.caretEl.style.display = 'block';
		this.editorRoot.style.caretColor = 'transparent';

		const startTime = performance.now();
		const step = (now: number): void => {
			const t = Math.min(1, (now - startTime) / duration);
			const eased = t * (2 - t); // quadratic ease-out
			this.caretEl.style.left = `${fromBounds.left + (toBounds.left - fromBounds.left) * eased}px`;
			this.caretEl.style.top = `${fromBounds.top + (toBounds.top - fromBounds.top) * eased}px`;

			if(t < 1) {
				this.animationFrameId = requestAnimationFrame(step);
			} else {
				this.animationFrameId = null;
				// Restore native caret immediately at landing; it'll be in its ON phase
				// and stacks pixel-perfect over the div, so neither pop nor swap is
				// visible. The hide timer fires exactly when native blinks OFF, so the
				// div's disappearance rides the blink instead of being its own event.
				this.editorRoot.style.caretColor = '';
				this.hideTimerId = window.setTimeout(() => {
					this.caretEl.style.display = 'none';
					this.hideTimerId = null;
				}, AnimatedCaret.POST_ANIMATION_HOLD_MS);
			}
		};
		this.animationFrameId = requestAnimationFrame(step);
	}

	private cancel(): void {
		this.cancelTimers();
		this.editorRoot.style.caretColor = '';
		this.caretEl.style.display = 'none';
	}

	private cancelTimers(): void {
		if(this.animationFrameId !== null) {
			cancelAnimationFrame(this.animationFrameId);
			this.animationFrameId = null;
		}
		if(this.hideTimerId !== null) {
			clearTimeout(this.hideTimerId);
			this.hideTimerId = null;
		}
	}
}

class TableCellDragHandler {
	public startCell: HTMLTableCellElement | null = null;
	public endCell: HTMLTableCellElement | null = null;
	public isPointerDown: boolean = false;
	public hasMovedToAnotherCell: boolean = false;

	private table: HTMLTableElement;
	
	private listener: ((table: HTMLTableElement, startCell: HTMLTableCellElement | null, endCell: HTMLTableCellElement | null) => void) | null;

	constructor(table: HTMLTableElement, listener: (table: HTMLTableElement, startCell: HTMLTableCellElement | null, endCell: HTMLTableCellElement | null) => void) {
		this.table = table;
		this.listener = listener;
		this.setupEventListeners();
	}

	private setupEventListeners = () => {
		this.table.addEventListener('pointerdown', this.handlePointerDown);
		this.table.addEventListener('pointermove', this.handlePointerMove);
		this.table.addEventListener('pointerup', this.handlePointerUp);
	};

	private getCellFromPoint = (x: number, y: number): HTMLTableCellElement | null => {
		const element = TableBlot.elementFromPointIgnoreClasses(x, y, ['ql-table-control']);
		if(!element) return null;

		// Check if the element is a cell or find the closest parent cell
		const cell = element.closest('td, th') as HTMLTableCellElement;

		// Ensure the cell belongs to our table
		if(cell && this.table.contains(cell)) {
			return cell;
		}

		return null;
	};

	private clearSelection = () => {
		this.startCell = null;
		this.endCell = null;
		this.hasMovedToAnotherCell = false;
		this.fireCellSelectionChangedEvent();
	};

	private handlePointerDown = (e: PointerEvent) => {
		if(e.button !== 0) {
			return; // Only handle left mouse button
		}
		
		// Clear previous selection
		this.clearSelection();

		const cell = this.getCellFromPoint(e.clientX, e.clientY);
		if(!cell) {
			return;
		}

		this.startCell = cell;
		this.isPointerDown = true;
	};

	private handlePointerMove = (e: PointerEvent) => {
		if(!this.isPointerDown || !this.startCell) return;

		const cell = this.getCellFromPoint(e.clientX, e.clientY);
		if(!cell) return;

		if(cell === this.startCell) {
			// If we had moved to another cell but came back, clear the selection
			if(this.hasMovedToAnotherCell) {
				this.endCell = null;
				this.hasMovedToAnotherCell = false;
				this.fireCellSelectionChangedEvent();
			}
			return;
		}

		// Deactivate the cell editor before clearing text selection, otherwise
		// removeAllRanges triggers selection-change(null) which runs async cleanup
		const editor = TableBlot.getEditorForTable(this.table);
		if(editor?.tableState.activeCellId) {
			const cached = editor.tableState.editorCache[editor.tableState.activeCellId];
			if(cached) {
				cached.removeListener?.();
				// Collapse Quill's internal range so focus() on pointerup can't
				// restore the in-cell text selection the user started with.
				cached.quill?.setSelection(0, 0, 'silent');
			}
		}

		const sel = window.getSelection();
		if(sel && !sel.isCollapsed) {
			sel.removeAllRanges();
		}

		// Capture pointer to ensure we get move/up events even if pointer leaves table
		this.table.setPointerCapture(e.pointerId);

		this.hasMovedToAnotherCell = true;
		if(cell !== this.endCell) {
			this.endCell = cell;
			this.fireCellSelectionChangedEvent();
		}
	};
	
	private fireCellSelectionChangedEvent() {
		if(!this.listener) {
			return;
		}
		this.listener(this.table, this.startCell, this.endCell);
	}

	private handlePointerUp = (e: PointerEvent) => {
		if(this.isPointerDown) {
			const wasMultiCellDrag = this.hasMovedToAnotherCell;
			const dragStartCell = this.startCell;
			this.isPointerDown = false;
			this.hasMovedToAnotherCell = false;
			if (this.table.hasPointerCapture(e.pointerId)) {
				this.table.releasePointerCapture(e.pointerId);
			}
			const editor = TableBlot.getEditorForTable(this.table);
			if(!editor) return;
			// Focus the active cell's editor so the browser dispatches copy/cut
			// keyboard events to it, the same way row/column select does.
			if(wasMultiCellDrag) {
				const activeId = editor.tableState.activeCellId;
				if(activeId) {
					editor.tableState.editorCache[activeId]?.quill?.focus();
				}
				return;
			}
			// In-cell drag that produced a text selection: activate the start cell so
			// the selection is owned by the cell editor. Without this, primary's quill
			// reads the DOM selection and reports a range covering the TableBlot, so a
			// subsequent Backspace deletes the whole table.
			if(!dragStartCell) return;
			const sel = window.getSelection();
			if(!sel || sel.isCollapsed || sel.rangeCount === 0) return;
			// Translate the DOM range into character offsets within the cell BEFORE
			// activation. activateCell can rebuild the cell DOM via Quill creation,
			// which invalidates direct DOM range references; offsets survive.
			// Use Quill-aware conversion that counts \n per block boundary - naive
			// Range.toString().length undercounts by N for multi-line selections.
			const range = sel.getRangeAt(0);
			let startOffset = 0;
			let length = 0;
			try {
				startOffset = QuillExtensions.domToQuillIndex(dragStartCell, range.startContainer, range.startOffset);
				const endOffset = QuillExtensions.domToQuillIndex(dragStartCell, range.endContainer, range.endOffset);
				length = endOffset - startOffset;
			} catch(err) {
				return;
			}
			const cellQuill = TableBlot.activateCell(dragStartCell, editor);
			if(cellQuill?.setSelection) {
				try {
					cellQuill.setSelection(startOffset, length, 'silent');
				} catch(err) {
					// Offsets out of range or Quill not ready; cell still owns focus.
				}
			}
		}
	};

	// Public method to manually clear selection
	public clear = () => {
		this.clearSelection();
	};

	// Public method to remove event listeners (cleanup)
	public destroy = () => {
		this.table.removeEventListener('pointerdown', this.handlePointerDown);
		this.table.removeEventListener('pointermove', this.handlePointerMove);
		this.table.removeEventListener('pointerup', this.handlePointerUp);
		this.listener = null;
		this.clearSelection();
	};
}

class TableData {
	columns = 3;
	rows = 2;
	cells: string[][] = Array.from({length: 3}, () => Array(3).fill(""));
}

class QuillExtensions {

	static ArrowLeft = 37;
	static ArrowUp = 38;
	static ArrowRight = 39;
	static ArrowDown = 40;
	private static Delete = 46;
	private static Backspace = 8;

	private static graphemeSegmenter: any | null = (typeof Intl !== 'undefined' && (Intl as any).Segmenter)
		? new (Intl as any).Segmenter(undefined, { granularity: 'grapheme' })
		: null;

	// Create a temporary headless Quill for HTML/Delta conversions
	// Each operation gets its own instance to avoid conflicts between multiple editor instances
	private static createHeadlessQuill(): { quill: any, cleanup: () => void } {
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

	/// Returns the headless Quill's HTML with Quill's mandatory trailing
	/// newline stripped. Use this instead of reading quill.root.innerHTML
	/// directly to prevent trailing &lt;p&gt;&lt;br&gt;&lt;/p&gt; accumulation in table cells.
	private static getHeadlessHtml(quill: any): string {
		return this.removeTrailingNewlinesFromHtml(quill.root.innerHTML);
	}

	static getQuill(blot: any): any {
		if(!blot.scroll.domNode.parentNode) {
			return null;
		}
		return Quill.find(blot.scroll.domNode.parentNode);
	}

	static convertDeltaToHtml(delta: any): string {
		const { quill, cleanup } = this.createHeadlessQuill();

		try {
			// Set the contents of the Quill editor to the Delta
			quill.setContents(delta);

			// Get the HTML from the Quill instance
			let html = quill.root.innerHTML;

			// Expand table of contents blots for static export
			html = this.expandTableOfContentsBlots(html, quill);

			return html;
		} finally {
			cleanup();
		}
	}

	static getPlainTextFromHtml(html: string): string {
		const { quill, cleanup } = this.createHeadlessQuill();
		try {
			quill.clipboard.dangerouslyPasteHTML(html);
			let text = quill.getText();
			if(text.endsWith('\n')) {
				text = text.slice(0, -1);
			}
			return text;
		} finally {
			cleanup();
		}
	}

	/**
	 * Expands table of contents blots in HTML by generating static TOC HTML with anchor links
	 */
	private static expandTableOfContentsBlots(html: string, quill: any): string {
		// Check if there are any TOC blots in the HTML
		if(!html.includes('data-toc="true"')) {
			return html;
		}

		// Extract headings from the quill instance (automatically stops at metadata sections marker)
		const headings = extractHeadings(quill);

		// Generate TOC HTML with anchor links (for static export)
		const tocItemsHtml = TableOfContentsBlot.generateTOCItemsHtml(headings, true);

		// Build complete TOC HTML structure
		const tocHtml = `<div class="ql-toc" contenteditable="false" data-toc="true">
  <div class="ql-toc-container">
    <div class="ql-toc-items">
${tocItemsHtml}
    </div>
  </div>
</div>`;

		// Replace all TOC blot divs with the generated TOC HTML
		// Match the TOC div structure that Quill generates
		const tocRegex = /<div class="ql-toc"[^>]*data-toc="true"[^>]*>[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/g;
		html = html.replace(tocRegex, tocHtml);

		// Add ID attributes to heading elements for anchor navigation
		html = this.addHeadingIds(html, headings);

		return html;
	}

	/**
	 * Adds ID attributes to HTML heading elements based on extracted headings
	 */
	private static addHeadingIds(html: string, headings: HeadingInfo[]): string {
		// For each heading, find its HTML element and add an ID
		// We'll process the HTML and add IDs to h1-h6 tags in order

		let headingIndex = 0;

		// Replace heading tags with versions that have IDs
		html = html.replace(/<h([1-6])([^>]*)>([\s\S]*?)<\/h\1>/gi, (match, level, attrs, content) => {
			// Skip if already has an id attribute
			if(attrs.includes('id=')) {
				return match;
			}

			// Skip headings that end with a zero-width space or zero-width non-joiner
			// (headings excluded from the TOC by extractHeadings) without consuming a
			// heading from the list, so IDs stay aligned with the extracted headings
			const plainText = content.replace(/<[^>]+>/g, '').trim();
			if(plainText.endsWith('\u200B') || plainText.endsWith('\u200C')) {
				return match;
			}

			// Get the corresponding heading from our list
			if(headingIndex < headings.length) {
				const heading = headings[headingIndex];
				headingIndex++;

				// Generate anchor ID
				const anchorId = TableOfContentsBlot.generateAnchorId(heading.text);

				// Return heading with ID attribute
				return `<h${level}${attrs} id="${anchorId}">${content}</h${level}>`;
			}

			return match;
		});

		return html;
	}
	
	static applyFormattingToHtml(html: string, formats: Record<string, any>): string {
		const { quill, cleanup } = this.createHeadlessQuill();

		try {
			// Set the HTML of the Quill editor
			quill.clipboard.dangerouslyPasteHTML(html);

			// Apply formats to the Quill instance
			quill.formatText(0, quill.getLength(), formats);

			// Get the updated HTML from the Quill instance
			return this.getHeadlessHtml(quill);
		} finally {
			cleanup();
		}
	}

	// Static-cell entry for mention/misspelling/auto-link markup; applies via headless Quill.
	// New text-recognition features wired into ProcessLine must also be wired here. See VenusEditorOverview.md.
	static applyTextProcessesToHtml(html: string, processes: JSTextProcess[]): { html: string, skipRanges: Array<{start: number; end: number}> } {
		const { quill, cleanup } = this.createHeadlessQuill();
		try {
			quill.clipboard.dangerouslyPasteHTML(html);
			quill.formatText(0, quill.getLength(), 'mention', '', 'silent');
			quill.formatText(0, quill.getLength(), 'misspelling', '', 'silent');
			let text = quill.getText();
			if(text.endsWith('\n')) {
				text = text.slice(0, -1);
			}
			const delta = quill.getContents();
			const { skipRanges, autoLinkRanges } = this.extractMisspellingSkipRanges(text, delta?.ops ?? []);
			processes.forEach(process => {
				const textStart = process.index;
				const textEnd = process.index + process.length;

				if(process.property === 'misspelling' && process.value) {
					const overlapsSkipRange = skipRanges.some(range => textStart < range.end && textEnd > range.start);
					if(overlapsSkipRange) {
						return;
					}

					const segment = text.substring(textStart, textEnd);
					if(URL_EXACT_REGEX.test(segment) || EMAIL_EXACT_REGEX.test(segment)) {
						return;
					}
				}

				const deltaIndex = this.convertTextOffsetToDeltaIndexFromOps(delta?.ops ?? [], process.index);
				if(process.property === 'mention' && process.value) {
					const formats = quill.getFormat(deltaIndex, Math.max(process.length, 1));
					if(formats.link) {
						return;
					}
				}
				if(process.property === 'misspelling' && process.value) {
					const formats = quill.getFormat(deltaIndex, process.length);
					if(formats.link) {
						return;
					}
				}
				quill.formatText(deltaIndex, process.length, process.property, process.value, 'silent');
			});

			// Auto-link URL/email ranges. Static-cell counterpart to syncAutoLinks - without it,
			// URLs typed in cells stay plain text until the cell is activated.
			autoLinkRanges.forEach(range => {
				const length = range.end - range.start;
				if(length <= 0) {
					return;
				}
				const segment = text.substring(range.start, range.end);
				const deltaIndex = this.convertTextOffsetToDeltaIndexFromOps(delta?.ops ?? [], range.start);
				const formats = quill.getFormat(deltaIndex, length);
				if(formats.link) {
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
		} finally {
			cleanup();
		}
	}


	static removeFormat(html: string): string {
		const { quill, cleanup } = this.createHeadlessQuill();

		try {
			// Set the HTML of the Quill editor
			quill.clipboard.dangerouslyPasteHTML(html);

			// Apply formats to the Quill instance
			quill.removeFormat(0, quill.getLength(), 'user');

			// Get the updated HTML from the Quill instance
			return this.getHeadlessHtml(quill);
		} finally {
			cleanup();
		}
	}

	static clearMentionAndMisspellingFromHtml(html: string): string {
		const { quill, cleanup } = this.createHeadlessQuill();
		try {
			quill.clipboard.dangerouslyPasteHTML(html);
			quill.formatText(0, quill.getLength(), 'mention', '', 'silent');
			quill.formatText(0, quill.getLength(), 'misspelling', '', 'silent');
			return this.getHeadlessHtml(quill);
		} finally {
			cleanup();
		}
	}

	static removeTrailingNewlinesFromHtml(html: string): string {
		// Strip all trailing empty paragraphs (Quill's mandatory newline representation).
		// Uses + to clean up multiple accumulated trailing newlines.
		const result = html.replace(/(<p><br><\/p>|<p><\/p>)+$/g, '');
		return result;
	}

	static removeTrailingNewlinesFromDelta(delta: any): any {
		// Create a copy of the delta to avoid mutating the original
		const cleanedDelta = JSON.parse(JSON.stringify(delta));

		// Check if delta has operations
		if (!cleanedDelta.ops || cleanedDelta.ops.length === 0) {
			return cleanedDelta;
		}

		// Remove trailing newline-only ops (can accumulate from repeated round-trips)
		while(cleanedDelta.ops.length > 0) {
			const lastOp = cleanedDelta.ops[cleanedDelta.ops.length - 1];
			if(typeof lastOp.insert !== 'string' || !lastOp.insert.endsWith('\n')) break;

			const trimmed = lastOp.insert.replace(/\n+$/, '');
			if(trimmed === '') {
				cleanedDelta.ops.pop();
			} else {
				lastOp.insert = trimmed;
				break;
			}
		}

		return cleanedDelta;
	}

	static convertHtmlToDelta(html: string): any {
		const { quill, cleanup } = this.createHeadlessQuill();

		try {
			// Convert HTML to Delta using Quill's clipboard
			return quill.clipboard.convert({html: html});
		} finally {
			cleanup();
		}
	}
	
	static addCellEditorKeyboardBindings(quill: any, venusEditor: VenusEditor): void {
		// If shift+arrow keys are pressed while table cells are selected, deselect the cells
		quill.keyboard.addBinding(
			{
				key: this.ArrowLeft,
				shiftKey: true
			},
			(range: any, context: any) => {
				return this.handleShiftArrowKey(quill, this.ArrowLeft, range, context, venusEditor);
			}
		);
		quill.keyboard.addBinding(
			{
				key: this.ArrowUp,
				shiftKey: true
			},
			(range: any, context: any) => {
				return this.handleShiftArrowKey(quill, this.ArrowUp, range, context, venusEditor);
			}
		);
		quill.keyboard.addBinding(
			{
				key: this.ArrowRight,
				shiftKey: true
			},
			(range: any, context: any) => {
				return this.handleShiftArrowKey(quill, this.ArrowRight, range, context, venusEditor);
			}
		);
		quill.keyboard.addBinding(
			{
				key: this.ArrowDown,
				shiftKey: true
			},
			(range: any, context: any) => {
				return this.handleShiftArrowKey(quill, this.ArrowDown, range, context, venusEditor);
			}
		);
		// Escape clears multi-cell selection if one exists
		quill.keyboard.addBinding(
			{ key: 'Escape' },
			(range: any, context: any) => {
				if(venusEditor.tableState.lastTableWithSelection) {
					TableBlot.setTableSelection(venusEditor.tableState.lastTableWithSelection, null, null);
					return false;
				}
				return true;
			}
		);
		// Math-selection hold behavior: arrow into math selects the blot, next key releases
		// or escalates to the dialog. Shared with the primary editor so both behave identically.
		QuillExtensions.addMathSelectionHoldBindings(quill, venusEditor);
		// Delete/Backspace should clear the selected cells
		// Normal quill.keyboard.addBinding does not work for Delete/Backspace keys
		QuillExtensions.interceptDeleteKey(quill, venusEditor);
	}

	// Move the cursor past a math blot in the given direction, handling the line-edge cases
	// where a caret adjacent to a contenteditable=false embed fails to render. Shared by the
	// math-selection hold bindings on both primary and cell editors.
	static releaseCursorPastMath(quill: any, mathIndex: number, direction: 'left' | 'right', editor: VenusEditor): void {
		const [line, offsetInLine] = quill.getLine(mathIndex);
		let targetIndex: number;

		if(direction === 'right') {
			targetIndex = mathIndex + 1;
			if(line) {
				const lineLength = line.length();
				const mathEndOffsetInLine = offsetInLine + 1;
				// Math at the end of its line: the position right after it has no adjacent text
				// node for the caret. Jump to the start of the next line if one exists.
				if(mathEndOffsetInLine >= lineLength - 1) {
					const nextLineStart = mathIndex + 2; // past math + past trailing newline
					if(nextLineStart < quill.getLength()) {
						targetIndex = nextLineStart;
					} else {
						// Math at end of document - nowhere to land, stay put.
						return;
					}
				}
			}
		} else {
			// Math at the start of its line: landing at mathIndex produces an un-rendered
			// caret. Jump to the end of the previous line instead (its trailing newline).
			if(line && offsetInLine === 0) {
				if(mathIndex > 0) {
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

	// If Up/Down would move the cursor past a math-only line, enter the hold state on that
	// line's math blot instead and return true to signal the event was consumed. Returns
	// false for any other key, modifier combo, or target-line layout so the caller can fall
	// through. Entry direction is set so Escape releases back to the originating line.
	static tryVerticalNavIntoMathOnlyLine(quill: any, editor: VenusEditor, event: KeyboardEvent): boolean {
		if(event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return false;
		if(event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return false;
		const range = quill.getSelection();
		if(!range || range.length > 0) return false;
		const [currentLine] = quill.getLine(range.index);
		if(!currentLine) return false;
		const targetLine = event.key === 'ArrowUp' ? currentLine.prev : currentLine.next;
		if(!targetLine) return false;
		const onlyChild = targetLine.children?.head;
		if(!onlyChild || onlyChild !== targetLine.children?.tail) return false;
		if(onlyChild.statics?.blotName !== MathExpressionBlot.blotName) return false;
		const mathIndex = quill.getIndex(onlyChild);
		// ArrowUp -> came from below; entry 'left' so Escape releases 'right' (back below).
		// ArrowDown -> came from above; entry 'right' so Escape releases 'left' (back above).
		const entryDirection: 'left' | 'right' = event.key === 'ArrowUp' ? 'left' : 'right';
		event.preventDefault();
		event.stopPropagation();
		editor.enterMathHold(quill, onlyChild, mathIndex, entryDirection);
		return true;
	}

	// Installs the math-selection hold behavior on a quill instance. The hold state is
	// tracked via editor.heldMathInfo (a JS flag) rather than Quill's native selection, so
	// it works reliably inside table cells where Chrome collapses programmatic ranges on
	// contenteditable=false embeds. This listener owns all arrow/Enter/Escape/printable/
	// Backspace/Delete dispatch both for entering hold (arrow toward adjacent math) and for
	// exiting it (release, open dialog, delete blot).
	static addMathSelectionHoldBindings(quill: any, editor: VenusEditor): void {
		const editorRoot = quill.container.querySelector('.ql-editor') as HTMLElement | null;
		if(!editorRoot) return;

		editorRoot.addEventListener('keydown', (event: KeyboardEvent) => {
			// Vertical-nav entry into math-only line fires even when not in hold state.
			// The browser can't find a text caret on a line whose only content is a
			// contenteditable=false embed, so we enter hold directly.
			if(this.tryVerticalNavIntoMathOnlyLine(quill, editor, event)) return;

			// Shift+* falls through so Shift+Arrow range extension still works. Other
			// modifier combos (Ctrl+C, Cmd+A, etc.) also fall through. If we were in
			// single-blot hold state, exit it so the user moves into a normal range
			// selection cleanly; the range-highlight sync will repaint the math from
			// the new range in selection-change.
			if(event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) {
				if(editor.heldMathInfo && editor.heldMathInfo.quill === quill) {
					editor.exitMathHold();
				}
				return;
			}

			const heldInfo = editor.heldMathInfo;
			const inHold = heldInfo !== null && heldInfo.quill === quill;

			if(inHold) {
				const mathIndex = heldInfo!.mathIndex;

				if(event.key === 'ArrowRight') {
					event.preventDefault();
					event.stopPropagation();
					editor.exitMathHold();
					this.releaseCursorPastMath(quill, mathIndex, 'right', editor);
					return;
				}
				if(event.key === 'ArrowLeft') {
					event.preventDefault();
					event.stopPropagation();
					editor.exitMathHold();
					this.releaseCursorPastMath(quill, mathIndex, 'left', editor);
					return;
				}

				// ArrowUp / ArrowDown: land on the adjacent line at the offset closest to
				// the math's own column, clamped to that line's content.
				if(event.key === 'ArrowUp' || event.key === 'ArrowDown') {
					event.preventDefault();
					event.stopPropagation();
					editor.exitMathHold();
					const [mathLine, mathLineOffset] = quill.getLine(mathIndex);
					if(mathLine) {
						const mathLineStart = mathIndex - mathLineOffset;
						const probeIndex = event.key === 'ArrowUp'
							? mathLineStart - 1
							: mathLineStart + mathLine.length();
						if(probeIndex >= 0 && probeIndex < quill.getLength()) {
							const [adjacentLine] = quill.getLine(probeIndex);
							if(adjacentLine) {
								const adjacentStart = quill.getIndex(adjacentLine);
								const adjacentMax = Math.max(0, adjacentLine.length() - 1);
								const targetOffset = Math.min(mathLineOffset, adjacentMax);
								quill.setSelection(adjacentStart + targetOffset, 0, 'user');
							}
						}
					}
					return;
				}

				// Enter: open the dialog on the held blot.
				if(event.key === 'Enter') {
					event.preventDefault();
					event.stopPropagation();
					const [blot] = quill.getLeaf(mathIndex + 1);
					if(blot) editor.openMathDialogForBlot(quill, blot, mathIndex);
					return;
				}

				// Escape: release in the direction the user was travelling when they entered
				// the hold. Click/unknown approach (entryDirection=null) releases left per spec.
				if(event.key === 'Escape') {
					event.preventDefault();
					event.stopPropagation();
					const releaseDirection: 'left' | 'right' = heldInfo!.entryDirection === 'left' ? 'right' : 'left';
					editor.exitMathHold();
					this.releaseCursorPastMath(quill, mathIndex, releaseDirection, editor);
					return;
				}

				// Backspace / Delete: remove the held blot. In the old length-1-selection
				// design this worked via Quill's native selection-delete, but the flag-based
				// hold state doesn't select the blot so we delete explicitly.
				if(event.key === 'Backspace' || event.key === 'Delete') {
					event.preventDefault();
					event.stopPropagation();
					editor.exitMathHold();
					editor.skipMathAdjacentSelect = true;
					quill.deleteText(mathIndex, 1, 'user');
					quill.setSelection(mathIndex, 0, 'user');
					return;
				}

				// Printable character: open the dialog without letting the character land in
				// the editor.
				if(event.key.length === 1) {
					event.preventDefault();
					event.stopPropagation();
					const [blot] = quill.getLeaf(mathIndex + 1);
					if(blot) editor.openMathDialogForBlot(quill, blot, mathIndex);
					return;
				}

				// Everything else (Home, End, Tab, function keys, bare modifiers, etc.) falls
				// through to default browser behavior. Bare modifier keydowns don't move the
				// cursor, so hold stays valid. Any key that does move the cursor (Home, End,
				// Tab) would leave the class orphaned on the held blot, so exit for those.
				if(event.key === 'Home' || event.key === 'End' || event.key === 'Tab' || event.key === 'PageUp' || event.key === 'PageDown') {
					editor.exitMathHold();
				}
				return;
			}

			// Not in hold state: detect arrow-toward-adjacent-math and enter hold before the
			// browser moves the cursor. This preserves the correct entry direction (the user's
			// heading) which the post-move selection-change snap can't infer reliably because
			// contenteditable=false embeds cause atomic cursor skipping. On auto-repeat we
			// skip past the blot instead so held-down arrow keeps moving.
			if(event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
			if(editor.editorSettings.readOnly) return;
			const range = quill.getSelection();
			if(!range || range.length !== 0) return;

			if(event.key === 'ArrowRight') {
				// Two adjacency cases to catch before the browser moves the cursor past the
				// embed atomically: cursor at mathIndex (embed start) or at mathIndex - 1.
				let mathBlot: any = null;
				let mathIndex = -1;

				const [leafAt] = quill.getLeaf(range.index);
				if(leafAt && leafAt.statics?.blotName === MathExpressionBlot.blotName
					&& quill.getIndex(leafAt) === range.index) {
					mathBlot = leafAt;
					mathIndex = range.index;
				} else {
					const [leafAhead] = quill.getLeaf(range.index + 1);
					if(leafAhead && leafAhead.statics?.blotName === MathExpressionBlot.blotName
						&& quill.getIndex(leafAhead) === range.index + 1) {
						mathBlot = leafAhead;
						mathIndex = range.index + 1;
					}
				}
				if(!mathBlot) return;

				event.preventDefault();
				event.stopPropagation();
				if(event.repeat) {
					editor.skipMathAdjacentSelect = true;
					quill.setSelection(mathIndex + 1, 0, 'user');
					return;
				}
				editor.enterMathHold(quill, mathBlot, mathIndex, 'left');
				return;
			}

			if(event.key === 'ArrowLeft') {
				if(range.index === 0) return;
				const [leafBefore] = quill.getLeaf(range.index - 1);
				if(!leafBefore || leafBefore.statics?.blotName !== MathExpressionBlot.blotName) return;
				const mathIndex = quill.getIndex(leafBefore);
				if(mathIndex !== range.index - 1) return;
				event.preventDefault();
				event.stopPropagation();
				if(event.repeat) {
					editor.skipMathAdjacentSelect = true;
					quill.setSelection(mathIndex, 0, 'user');
					return;
				}
				editor.enterMathHold(quill, leafBefore, mathIndex, 'right');
				return;
			}
		}, true);
	}

	static handleTabInCell(editor: VenusEditor, forward: boolean): boolean {
		const cellId = editor.tableState.activeCellId;
		if(!cellId) return true;
		const cellElement = document.getElementById(cellId) as HTMLTableCellElement;
		if(!cellElement) return true;
		const table = cellElement.closest('table') as HTMLTableElement;
		if(!table) return true;

		const target = forward
			? TableBlot.getNextCell(cellElement, table)
			: TableBlot.getPreviousCell(cellElement, table);
		if(!target) return false;

		const cellQuill = TableBlot.activateCell(target, editor);
		if(cellQuill) {
			cellQuill.setSelection(0, 0, 'user');
		}
		return false;
	}

	static interceptDeleteKey(quill: any, venusEditor: VenusEditor) {
		const editor = quill.container.querySelector('.ql-editor');
		editor.addEventListener('keydown', (event: any) => {
			if(event.key === 'Delete' || event.keyCode === this.Delete ||
				event.key === 'Backspace' || event.keyCode === this.Backspace) {
				if(!TableBlot.handleDeleteOrBackspace(venusEditor)) {
					event.preventDefault();
					event.stopPropagation();
				}
			}
		}, true);
	}

	// While a cell editor is active, refuse any primary Backspace/Delete that would
	// destroy a table. Browsers can drift focus to primary mid-cell-edit (drag across
	// a contenteditable child or atomized link inside a <td>); without this guard the
	// drift-routed keydown would silently wipe the whole table.
	static guardPrimaryDeleteWhileCellActive(quill: any, venusEditor: VenusEditor) {
		const editor = quill.container.querySelector('.ql-editor');
		editor.addEventListener('keydown', (event: any) => {
			const isBackspace = event.key === 'Backspace' || event.keyCode === this.Backspace;
			const isDelete = event.key === 'Delete' || event.keyCode === this.Delete;
			if(!isBackspace && !isDelete) return;

			if(event.target !== quill.root) return;

			const activeId = venusEditor.tableState.activeCellId;
			if(!activeId) return;

			const range = quill.getSelection();
			if(!range) return;

			let wouldTouchTable = false;

			if(range.length === 0) {
				const [line, offset] = quill.getLine(range.index);
				if(line) {
					if(line.statics?.blotName === 'table') {
						wouldTouchTable = true;
					} else if(isBackspace && offset === 0 && line.prev?.statics?.blotName === 'table') {
						wouldTouchTable = true;
					} else if(isDelete && offset === line.length() - 1 && line.next?.statics?.blotName === 'table') {
						wouldTouchTable = true;
					}
				}
			} else {
				const [startLine] = quill.getLine(range.index);
				const [endLine] = quill.getLine(range.index + range.length);
				if(startLine?.statics?.blotName === 'table' || endLine?.statics?.blotName === 'table') {
					wouldTouchTable = true;
				}
			}

			if(!wouldTouchTable) return;

			event.preventDefault();
			event.stopPropagation();

			const cached = venusEditor.tableState.editorCache[activeId];
			if(cached?.quill) {
				cached.quill.focus();
			}
		}, true);
	}

	// Elevate a table-adjacent Backspace/Delete into a full-table select first
	// so a single keystroke can't destroy the whole table.
	static interceptPrimaryTableAdjacentDelete(quill: any, venusEditor: VenusEditor) {
		const editor = quill.container.querySelector('.ql-editor');
		editor.addEventListener('keydown', (event: any) => {
			const isBackspace = event.key === 'Backspace' || event.keyCode === this.Backspace;
			const isDelete = event.key === 'Delete' || event.keyCode === this.Delete;
			if(!isBackspace && !isDelete) return;

			// Capture phase runs through primary's root on the way to a cell — bail if
			// the event originated inside a cell (or any descendant that isn't primary).
			if(event.target !== quill.root) return;

			const range = quill.getSelection();
			if(!range || range.length > 0) return;

			const [line, offset] = quill.getLine(range.index);
			if(!line) return;
			// Only fire when the cursor is on a regular line, never on/inside a table.
			if(line.statics?.blotName === 'table') return;

			let adjacent: any = null;
			if(isBackspace && offset === 0) {
				adjacent = line.prev;
			} else if(isDelete && offset === line.length() - 1) {
				adjacent = line.next;
			}
			if(!adjacent || adjacent.statics?.blotName !== 'table') return;

			const table = adjacent.domNode as HTMLTableElement;
			const rows = table.rows.length;
			const cols = table.rows[0]?.cells.length ?? 0;
			if(rows === 0 || cols === 0) return;

			// Already fully selected — hand off to the normal delete path.
			if(venusEditor.tableState.lastTableWithSelection === table) {
				const ts = TableBlot.getTableSelection(table);
				if(ts.startRow === 0 && ts.endRow === rows - 1 &&
					ts.startCol === 0 && ts.endCol === cols - 1) {
					event.preventDefault();
					event.stopPropagation();
					TableBlot.handleDeleteOrBackspace(venusEditor);
					return;
				}
			}

			// First press: select the whole table without pulling focus into a cell.
			const firstCell = table.rows[0].cells[0] as HTMLTableCellElement;
			const lastCell = table.rows[rows - 1].cells[cols - 1] as HTMLTableCellElement;
			if(!firstCell || !lastCell) return;

			event.preventDefault();
			event.stopPropagation();
			TableBlot.setTableSelection(table, firstCell, lastCell, true);
		}, true);
	}

	private static handleShiftArrowKey(quill: any, key: number, range: any, context: any, editor: VenusEditor): boolean {
		// If a multi-cell selection already exists, extend it in the arrow direction
		if(editor.tableState.lastTableWithSelection) {
			const table = editor.tableState.lastTableWithSelection;
			const startCell = TableBlot.getSelectionStartCell(table);
			const endCell = TableBlot.getSelectionEndCell(table);
			if(startCell && endCell) {
				const adjacent = TableBlot.getAdjacentCell(endCell, key, table);
				if(adjacent) {
					TableBlot.setTableSelection(table, startCell, adjacent);
				}
				return false;
			}
		}

		// No existing multi-cell selection — use same boundary checks as handleArrowKeyToTraverseCells
		if(!range) {
			return true;
		}

		const [currentLine, offset] = quill.getLine(range.index);
		if(!currentLine) {
			return true;
		}
		const startOfLineIndex = range.index - offset;
		const selectionEnd = range.index + range.length;

		if(key == this.ArrowLeft) {
			if(range.index > 0) {
				return true;
			}
		}
		if(key == this.ArrowRight) {
			if(range.index < quill.getLength() - 1 && selectionEnd < quill.getLength() - 1) {
				return true;
			}
		}
		if(key == this.ArrowUp) {
			if(startOfLineIndex > 0) {
				return true;
			}
		}
		if(key == this.ArrowDown) {
			if(startOfLineIndex + currentLine.length() < quill.getLength() - 1) {
				// Also check selection end for multi-line selections
				const [endLine, endOffset] = quill.getLine(selectionEnd);
				if(endLine) {
					const endLineStart = selectionEnd - endOffset;
					if(endLineStart + endLine.length() < quill.getLength() - 1) {
						return true;
					}
				} else {
					return true;
				}
			}
		}

		// Visual line check for up/down (same as handleArrowKeyToTraverseCells)
		if(key == this.ArrowUp || key == this.ArrowDown) {
			const selectBounds = quill.getBounds(range.index);
			if(!selectBounds) {
				return true;
			}
			const lineBounds = quill.getBounds(range.index - offset, currentLine.length());
			if(!lineBounds) {
				return true;
			}
			if(key == this.ArrowUp) {
				if(selectBounds.top > lineBounds.top + selectBounds.height / 2) {
					return true;
				}
			} else {
				if(selectBounds.bottom < lineBounds.bottom - selectBounds.height / 2) {
					return true;
				}
			}
		}

		// At boundary — start a multi-cell selection
		const cellId = editor.tableState.activeCellId;
		if(!cellId) {
			return true;
		}
		const cellElement = document.getElementById(cellId) as HTMLTableCellElement;
		if(!cellElement) {
			return true;
		}
		const table = cellElement.closest('table') as HTMLTableElement;
		if(!table) {
			return true;
		}
		const adjacent = TableBlot.getAdjacentCell(cellElement, key, table);
		if(!adjacent) {
			return false;
		}
		TableBlot.setTableSelection(table, cellElement, adjacent);
		return false;
	}

	static enableNavigationBetweenTableCells(quill: any, venusEditor: VenusEditor): void {
		// Add a custom keyboard bindings for arrow keys
		quill.keyboard.addBinding(
			{
				key: this.ArrowLeft,
			},
			(range: any, context: any) => {
				return this.handleArrowKeyToTraverseCells(quill, this.ArrowLeft, range, context, venusEditor);
			}
		);
		quill.keyboard.addBinding(
			{
				key: this.ArrowUp,
			},
			(range: any, context: any) => {
				return this.handleArrowKeyToTraverseCells(quill, this.ArrowUp, range, context, venusEditor);
			}
		);
		quill.keyboard.addBinding(
			{
				key: this.ArrowRight
			},
			(range: any, context: any) => {
				return this.handleArrowKeyToTraverseCells(quill, this.ArrowRight, range, context, venusEditor);
			}
		);
		quill.keyboard.addBinding(
			{
				key: this.ArrowDown
			},
			(range: any, context: any) => {
				return this.handleArrowKeyToTraverseCells(quill, this.ArrowDown, range, context, venusEditor);
			}
		);
		// Shift+Arrow key bindings for multi-cell selection at boundary
		for(const arrowKey of [this.ArrowLeft, this.ArrowUp, this.ArrowRight, this.ArrowDown]) {
			quill.keyboard.addBinding(
				{ key: arrowKey, shiftKey: true },
				(range: any, context: any) => {
					return this.handleShiftArrowKey(quill, arrowKey, range, context, venusEditor);
				}
			);
		}
		// Ctrl+Arrow (Windows/Linux) and Cmd+Arrow (Mac) bindings for word-jump then cell traversal
		const modifiers = [{ ctrlKey: true }, { metaKey: true }];
		for(const mod of modifiers) {
			for(const arrowKey of [this.ArrowLeft, this.ArrowUp, this.ArrowRight, this.ArrowDown]) {
				quill.keyboard.addBinding(
					{ key: arrowKey, ...mod },
					(range: any, context: any) => {
						return this.handleArrowKeyToTraverseCells(quill, arrowKey, range, context, venusEditor);
					}
				);
			}
		}
	}

	private static handleArrowKeyToTraverseCells(quill: any, key: number, range: any, context: any, editor: VenusEditor): boolean {
		if(!range) {
			return true;
		}

		// Get the current line (block) where the cursor is.
		const [currentLine, offset] = quill.getLine(range.index);
		if(!currentLine) {
			return true;
		}
		const startOfLineIndex = range.index - offset;
		const selectBounds = quill.getBounds(range.index);
		if(!selectBounds) {
			return true;
		}

		// get the bounds of the cell we are in
		const quillContainer = (quill as any).container;
		const cellBounds = quillContainer.getBoundingClientRect();

		let x = cellBounds.left + selectBounds.left + selectBounds.width / 2;
		let y = cellBounds.top + selectBounds.top + selectBounds.height / 2;

		if(key == this.ArrowLeft) {
			// return if we are not at index 0
			if(range.index > 0) {
				return true;
			}
			x = cellBounds.left - 4;
		}
		if(key == this.ArrowRight) {
			// return if we are not at index end
			if(range.index < quill.getLength() - 1) {
				return true;
			}
			x = cellBounds.right + 4;
		}
		if(key == this.ArrowUp) {
			// return if we are not on the first line
			if(startOfLineIndex > 0) {
				return true;
			}
			y = cellBounds.top - 4;
		}
		if(key == this.ArrowDown) {
			// return if we are not on the last line
			if(startOfLineIndex + currentLine.length() < quill.getLength() - 1) {
				return true;
			}
			y = cellBounds.bottom + 4;
		}

		// if this is an up or down arrow, don't check for special handling unless we are at the top/bottom of the current line
		if(key == this.ArrowUp || key == this.ArrowDown) {
			const lineBounds = quill.getBounds(range.index - offset, currentLine.length());
			if(!lineBounds) {
				return true;
			}
			if(key == this.ArrowUp) {
				if(selectBounds.top > lineBounds.top + selectBounds.height / 2) {
					// we are more than half a line height away from the top
					return true;
				}
			} else {
				if(selectBounds.bottom < lineBounds.bottom - selectBounds.height / 2) {
					// we are more than half a line height away from the bottom
					return true;
				}
			}
		}

		// at this point we are pressing a key that will exit the cell...
		TableBlot.activateEditorAt(x, y, true, editor);

		// Returning false prevents the default Quill behavior.
		return false;
	}

	static detectEnterPress(quill: any, venusEditor: VenusEditor) {
		// This can't be done with Quill's built-in API because the binding does not work if the user presses Enter on an empty line
		const editor = quill.container.querySelector('.ql-editor');
		editor.addEventListener('keydown', (event: any) => {
			if(event.key === 'Enter' || event.keyCode === 13) {
				venusEditor.justPressedEnter = true;
			}
		}, true);
	}

	static enableTableBlot(quill: any, venusEditor: VenusEditor): void {
		// Add a custom keyboard bindings for arrow keys
		quill.keyboard.addBinding(
			{
				key: this.ArrowLeft,
			},
			(range: any, context: any) => {
				return this.handleArrowKeyToEnterTableBlot(quill, this.ArrowLeft, range, context, venusEditor);
			}
		);
		quill.keyboard.addBinding(
			{
				key: this.ArrowUp,
			},
			(range: any, context: any) => {
				return this.handleArrowKeyToEnterTableBlot(quill, this.ArrowUp, range, context, venusEditor);
			}
		);
		quill.keyboard.addBinding(
			{
				key: this.ArrowRight
			},
			(range: any, context: any) => {
				return this.handleArrowKeyToEnterTableBlot(quill, this.ArrowRight, range, context, venusEditor);
			}
		);
		quill.keyboard.addBinding(
			{
				key: this.ArrowDown
			},
			(range: any, context: any) => {
				return this.handleArrowKeyToEnterTableBlot(quill, this.ArrowDown, range, context, venusEditor);
			}
		);
	}

	private static handleArrowKeyToEnterTableBlot(quill: any, key: number, range: any, context: any, venusEditor: VenusEditor): boolean {
		if(!range) {
			return true;
		}

		// Get the current line (block) where the cursor is.
		const [currentLine, offset] = quill.getLine(range.index);
		if(!currentLine) {
			return true;
		}

		if(key == this.ArrowLeft) {
			// return if we are not at the start of the line
			if(offset > 0) {
				return true;
			}
		}
		if(key == this.ArrowRight) {
			// are we on the line with the table already?
			const [leaf, leafOffset] = quill.getLeaf(range.index);
			if(!leaf) {
				return true;
			}
			if(QuillExtensions.isTableBlot(leaf)) {
				if(leafOffset == 0) {
					// on line with leaf and going right - active first cell
					const node = leaf.domNode as HTMLElement;
					const cells = node.querySelectorAll('td')
					const cell = cells[0];
					TableBlot.activateCell(cell as HTMLElement, venusEditor);
					return false;
				} else {
					return true;
				}
			} else {
				// return if we are not at the end of the line
				if(offset < currentLine.length() - 1) {
					return true;
				}
			}
		}

		// if this is an up or down arrow, don't check for special handling unless we are at the top/bottom of the current line
		if(key == this.ArrowUp || key == this.ArrowDown) {
			let selectBounds = quill.getBounds(range.index)!;
			let lineBounds = quill.getBounds(range.index - offset, currentLine.length())!;
			if(key == this.ArrowUp) {
				if(selectBounds.top > lineBounds.top + selectBounds.height / 2) {
					// we are more than half a line height away from the top
					return true;
				}
			} else {
				if(selectBounds.bottom < lineBounds.bottom - selectBounds.height / 2) {
					// we are more than half a line height away from the bottom
					return true;
				}
			}
		}

		const fromAbove = key == this.ArrowRight || key == this.ArrowDown;

		// Determine the index after or before the current line.
		let towardIndex = -1;
		if(fromAbove) {
			// start of next line
			towardIndex = range.index + (currentLine.length() - offset);
		} else {
			// end of prior line
			towardIndex = range.index - offset - 1;
		}

		// Using getLeaf() lets you get the blot (or leaf) at a given index.
		const [leaf, leafOffset] = quill.getLeaf(towardIndex);

		// Check if the leaf is a table blot.
		if(!leaf || !QuillExtensions.isTableBlot(leaf)) {
			return true;
		}

		if(key == this.ArrowLeft || key == this.ArrowRight) {
			// activate first or last cell and put selection at start or beginning
			const node = leaf.domNode as HTMLElement;
			const cells = node.querySelectorAll('td')
			const cell = fromAbove ? cells[0] : cells[cells.length - 1]
			const newQuill = TableBlot.activateCell(cell as HTMLElement, venusEditor);
			if(!fromAbove) {
				// put cursor at end of line
				newQuill?.setSelection(newQuill.getLength() - 1, 0, 'user');
			}
		} else {
			// activate the cell that is above/below where we are now
			const selectBounds = quill.getBounds(range.index)!;

			// get the bounds of the cell we are in
			const quillContainer = (quill as any).container;
			const quillBounds = quillContainer.getBoundingClientRect();

			let x = quillBounds.left + selectBounds.left + selectBounds.width / 2;
			let y = 0;
			const tableBlotIndex = quill.getIndex(leaf);
			const tableBounds = quill.getBounds(tableBlotIndex, 1);
			if(!tableBounds) {
				return true;
			}
			if(x <= quillBounds.left + tableBounds.left) {
				x = quillBounds.left + tableBounds.left + 1;
			}
			if(x >= quillBounds.left + tableBounds.right) {
				x = quillBounds.left + tableBounds.right - 1;
			}
			if(key == this.ArrowUp) {
				y = quillBounds.top + tableBounds.bottom - 4;
			} else {
				y = quillBounds.top + tableBounds.top + 4;
			}
			TableBlot.activateEditorAt(x, y, false, venusEditor);
		}

		// Returning false prevents the default Quill behavior.
		return false;
	}

	// Helper function: Return true if the blot is an instance of our custom blot.
	static isTableBlot(blot: any): boolean {
		return blot && (blot.statics?.blotName === TableBlot.blotName);
	}
	
	static isHeadingChange(delta: any, oldDelta: any): boolean {
		// Return true if any text within a heading was changed
		if(!delta || !Array.isArray(delta.ops) || delta.ops.length === 0) {
			return false;
		}

		if(!oldDelta || typeof oldDelta.slice !== 'function') {
			return false;
		}

		let position = 0;

		for(const op of delta.ops) {
			// INSERTS -----------------------------------------------------------------
			if(op.insert) {
				if(typeof op.insert === 'string') {
					// Check if inserting text (non-newline) into a heading block
					if(!op.insert.includes('\n') && this.isPositionInHeading(oldDelta, position)) {
						return true;
					}
				}
				continue;
			}

			// DELETES -----------------------------------------------------------------
			if(op.delete) {
				const deleteCount = typeof op.delete === 'number' ? op.delete : 0;
				if(deleteCount > 0) {
					// Check if any of the deleted positions are within a heading
					for(let i = 0; i < deleteCount; i++) {
						if(this.isPositionInHeading(oldDelta, position + i)) {
							return true;
						}
					}
				}
				continue;
			}

			// RETAINS -----------------------------------------------------------------
			if(typeof op.retain === 'number') {
				// Check if attribute changes are being applied to heading content
				if(op.attributes) {
					// Check if any part of the retained range is within heading content
					for(let i = 0; i < op.retain; i++) {
						if(this.isPositionInHeading(oldDelta, position + i)) {
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

	/**
	 * Helper function to determine if a position in the delta is within a heading block.
	 * In Quill, heading formatting is applied to the newline that terminates a heading line,
	 * so we need to find which line the position belongs to and check if that line's
	 * terminating newline has a header attribute.
	 */
	private static isPositionInHeading(delta: any, targetPosition: number): boolean {
		if(!delta || !Array.isArray(delta.ops)) {
			return false;
		}

		let position = 0;
		let lineStartPosition = 0;

		for(const op of delta.ops) {
			if(op.insert && typeof op.insert === 'string') {
				const text = op.insert;

				// Check each character in this operation
				for(let i = 0; i < text.length; i++) {
					const currentPos = position + i;

					if(text[i] === '\n') {
						// Found a newline - check if target was in this line (including the newline position itself)
						if(targetPosition >= lineStartPosition && targetPosition <= currentPos) {
							// Target is in this line - check if this newline has header attribute
							return !!(op.attributes && op.attributes.header);
						}
						// Start tracking next line
						lineStartPosition = currentPos + 1;
					}
				}

				position += text.length;
			}
		}

		// Target is in the last line (no terminating newline found)
		// A line without a terminating newline cannot be a heading
		return false;
	}

	static isStructuralChange(delta: any, oldDelta: any): boolean {
		// Quill emits deltas for every tiny edit—adding a letter, deleting a character.
		// Rebuilding the outline (used for collapse controls & table of contents) is expensive,
		// so we only want to do it when the document’s block structure actually changes:
		//   * inserting/removing embeds (tables, TOC, etc.)
		//   * adding/removing structural line formats (headers, lists, blockquotes, code blocks)
		//   * changing indent levels
		//   * deleting structural newlines (removing a heading/list item, etc.)
		// Everything else (plain text edits, inline formatting) can safely skip the rebuild.

		if(!delta || !Array.isArray(delta.ops) || delta.ops.length === 0) {
			return false;
		}

		const structuralKeys = ['header', 'list', 'blockquote', 'code-block', 'indent'];
		let position = 0; // Tracks our location in the original document so we can inspect deletions.

		for(const op of delta.ops) {
			// INSERTS -----------------------------------------------------------------
			// Embeds (tables, custom blots, etc.) are inherently structural.
			if(op.insert) {
				if(typeof op.insert === 'object') {
					return true;
				}
				// String inserts that carry structural formatting (e.g., inserting a heading line).
				if(typeof op.insert === 'string' && op.insert.includes('\n')) {
					if(op.attributes && (op.attributes.header || op.attributes.list || op.attributes['code-block'] || op.attributes['blockquote'])) {
						return true;
					}
				}
			}

			// DELETES -----------------------------------------------------------------
			// Delta's `delete` op tells us how many characters were removed, but not what they were.
			// We slice the old delta at the current position to see if structural newlines/embeds were part of the deletion.
			if(op.delete) {
				const deleteCount = typeof op.delete === 'number' ? op.delete : 0;
				if(deleteCount > 0 && oldDelta && typeof oldDelta.slice === 'function') {
					const removed = oldDelta.slice(position, position + deleteCount);
					for(const removedOp of removed.ops ?? []) {
						if(typeof removedOp.insert === 'string' && removedOp.insert.includes('\n')) {
							// Removing a newline that belonged to a block (heading/list/etc.) impacts structure.
							return true;
						}
						if(typeof removedOp.insert === 'object') {
							// Removing an embed (table/TOC) is structural.
							return true;
						}
					}
				}
				continue;
			}

			// RETAINS -----------------------------------------------------------------
			// Retain ops can carry attributes toggles. When structural attributes are applied
			// (or explicitly cleared via null) we treat it as structural so the outline stays accurate.
			if(typeof op.retain === 'number') {
				const attrs = op.attributes ?? {};
				for(const key of Object.keys(attrs)) {
					if(structuralKeys.includes(key)) {
						const value = attrs[key];
						// Quill uses explicit values for updates and null for removals.
						if(value !== undefined) {
							return true;
						}
					}
				}
				if(op.attributes === null) {
					// No attributes means Quill is removing previously applied formats.
					return true;
				}
				position += op.retain;
				continue;
			}
		}

		return false;
	}

	/**
	 * Sets the cursor selection in the Quill editor based on screen coordinates.
	 * @param quill - The Quill instance to manipulate.
	 * @param x - The x-coordinate (relative to the Quill container).
	 * @param y - The y-coordinate (relative to the Quill container).
	 */
	static setSelectionFromCoordinates(quill: any, x: number, y: number): number {
		let index = QuillExtensions.getClosestIndex(quill, x, y);
		quill.setSelection(index, 0, 'user');
		return index;
	}

	/**
	 * Uses binary search (by vertical position) along with a local check to find the closest index
	 * in the Quill editor to the given (x, y) coordinate.
	 *
	 * @param quill - Your Quill instance.
	 * @param x - The x-coordinate (relative to the Quill container) to check.
	 * @param y - The y-coordinate (relative to the Quill container) to check.
	 * @returns The document index closest to the given x,y position.
	 */
	static getClosestIndex(quill: any, x: number, y: number): number {
		const textLength = quill.getLength();
		if(textLength === 0) return 0;

		// Binary search by comparing the vertical center of the bounds.
		let lo = 0;
		let hi = textLength - 1;
		let candidate = 0;

		while(lo <= hi) {
			const mid = Math.floor((lo + hi) / 2);
			const bounds = quill.getBounds(mid)!;
			const midCenterY = bounds.top + bounds.height / 2;

			if(midCenterY < y) {
				candidate = mid; // mid is the best candidate so far.
				lo = mid + 1;
			} else if(midCenterY > y) {
				hi = mid - 1;
			} else {
				// Exact vertical match.
				candidate = mid;
				break;
			}
		}

		// After binary search we have a candidate.
		// Check indices around the candidate to find the one with the smallest X distance.
		let bestIndex = candidate;
		let bestDistance = 9999;

		// Check up to 100 indices before and after candidate (this number must be high enough to cover the entire row)
		const range = 100;
		for(let i = candidate - range; i <= candidate + range; i++) {
			if(i < 0 || i >= textLength) continue;
			const d = QuillExtensions.getDistanceWithinRow(quill, i, x, y);
			if(d != null && d < bestDistance) {
				bestDistance = d;
				bestIndex = i;
			}
		}

		return bestIndex;
	}

	/**
	 * Returns the Euclidean distance between the given point and the center of the bounds for an index.
	 * @param quill - The Quill instance.
	 * @param index - The index in the Quill document to check.
	 * @param x - The x-coordinate to compare against.
	 * @param y - The y-coordinate to compare against.
	 * @returns The distance or null if the bounds are not on the same horizontal line as 'y'.
	 */
	private static getDistanceWithinRow(quill: any, index: number, x: number, y: number): number | null {
		const bounds = quill.getBounds(index);
		if(!bounds || bounds.top > y || bounds.bottom < y) {
			return null;
		}
		return Math.abs(bounds.left - x);
	}

	// Block-level tags Quill counts a trailing \n for in its character index.
	// Matches Quill's default Block / Header / List / Blockquote / CodeBlock blots.
	private static readonly QUILL_BLOCK_TAGS = new Set([
		'P', 'DIV', 'BLOCKQUOTE', 'PRE', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'
	]);

	// Convert a DOM (container, offsetInContainer) position into the equivalent
	// Quill character index relative to a root element. Range.toString().length
	// strips block-element \n separators, so naive `pre.toString().length` is short
	// by one per block boundary and lands cell selections on the wrong line.
	public static domToQuillIndex(root: Node, container: Node, offsetInContainer: number): number {
		if(container === root && container.nodeType === Node.ELEMENT_NODE) {
			let total = 0;
			const children = (root as Element).childNodes;
			for(let i = 0; i < offsetInContainer && i < children.length; i++) {
				total += QuillExtensions.fullSubtreeLength(children[i]);
			}
			return total;
		}
		return QuillExtensions.walkToTarget(root, container, offsetInContainer);
	}

	// Recursive helper: index contributed by `node` up to (but not including) target.
	private static walkToTarget(node: Node, container: Node, offsetInContainer: number): number {
		if(node === container) {
			if(node.nodeType === Node.TEXT_NODE) {
				return offsetInContainer;
			}
			let total = 0;
			const children = node.childNodes;
			for(let i = 0; i < offsetInContainer && i < children.length; i++) {
				total += QuillExtensions.fullSubtreeLength(children[i]);
			}
			return total;
		}
		if(node.nodeType !== Node.ELEMENT_NODE) {
			return 0;
		}
		if(!(node as Element).contains(container)) {
			return QuillExtensions.fullSubtreeLength(node);
		}
		let total = 0;
		for(const child of Array.from(node.childNodes)) {
			if(child === container || (child.nodeType === Node.ELEMENT_NODE && (child as Element).contains(container))) {
				total += QuillExtensions.walkToTarget(child, container, offsetInContainer);
				return total;
			}
			total += QuillExtensions.fullSubtreeLength(child);
		}
		return total;
	}

	// Sum of text lengths in the subtree rooted at `node`, plus +1 per Quill block
	// boundary (block elements count a trailing \n in Quill's index).
	private static fullSubtreeLength(node: Node): number {
		if(node.nodeType === Node.TEXT_NODE) {
			return (node as Text).length;
		}
		if(node.nodeType !== Node.ELEMENT_NODE) {
			return 0;
		}
		let total = 0;
		for(const child of Array.from(node.childNodes)) {
			total += QuillExtensions.fullSubtreeLength(child);
		}
		if(QuillExtensions.QUILL_BLOCK_TAGS.has((node as Element).tagName)) {
			total += 1;
		}
		return total;
	}

	// A simple hash function to compute a hash from a string (returns a hex string)
	public static computeHash(text: string): string {
		// Using a djb2-inspired algorithm:
		let hash = 5381;
		for(let i = 0; i < text.length; i++) {
			hash = ((hash << 5) + hash) + text.charCodeAt(i); // hash * 33 + c
		}
		return hash.toString(16);
	}

	private static getFirstGraphemeLength(text: string): number {
		if(!text) {
			return 0;
		}

		const newlineIndex = text.indexOf('\n');
		const segmentSource = newlineIndex >= 0 ? text.slice(0, newlineIndex) : text;
		if(segmentSource.length === 0) {
			return 0;
		}

		if(this.graphemeSegmenter) {
			for(const segment of this.graphemeSegmenter.segment(segmentSource)) {
				if(segment && typeof segment.segment === 'string' && segment.segment.length > 0) {
					return segment.segment.length;
				}
				break;
			}
		}

		const codePoint = segmentSource.codePointAt(0);
		if(codePoint === undefined) {
			return 0;
		}
		return codePoint > 0xFFFF ? 2 : 1;
	}

	public static convertTextOffsetToDeltaIndex(quill: any, line: any, lineIndex: number, lineLength: number, textOffset: number): number {
		// Get the Delta for the entire line
		const delta: any = quill.getContents(lineIndex, lineLength);
		let accumulated = 0;
		let deltaIndex = lineIndex;

		for(const op of delta.ops) {
			// Embeds occupy 0 chars in text-string space (they're stripped from
			// getText) but 1 in Quill's delta-index space. Tracking them as the
			// same length in both spaces would make embeds invisible to the
			// conversion — defeating the point of the function.
			const isString = typeof op.insert === 'string';
			const textLen = isString ? op.insert.length : 0;
			const deltaLen = isString ? op.insert.length : 1;

			if(accumulated + textLen > textOffset) {
				// The keyword starts in this op. Calculate the exact Delta offset.
				deltaIndex += textOffset - accumulated;
				return deltaIndex;
			}
			accumulated += textLen;
			deltaIndex += deltaLen;
		}
		// If textOffset is exactly at the end of the line.
		return deltaIndex;
	}

	private static convertTextOffsetToDeltaIndexFromOps(deltaOps: any[], textOffset: number): number {
		let accumulated = 0;
		let deltaIndex = 0;

		for(const op of deltaOps) {
			const isString = typeof op?.insert === 'string';
			const textLen = isString ? op.insert.length : 0;
			const deltaLen = isString ? op.insert.length : 1;
			if(accumulated + textLen > textOffset) {
				return deltaIndex + (textOffset - accumulated);
			}
			accumulated += textLen;
			deltaIndex += deltaLen;
		}

		return deltaIndex;
	}

	/**
	 * For each visible line, compute a hash and store it on the line element so we
	 * can skip redundant processing when the text has not changed.
	 */
	static async processLine(quill: any, line: any, venusEditor: VenusEditor): Promise<void> {
		if(!venusEditor.dotNetHelper) {
			return;
		}
		const lineIndex = quill.getIndex(line);
		const lineLength = line.length();
		const domNode: HTMLElement | null = line?.domNode ?? null;
		const containsTable = !!domNode && (
			domNode.matches?.('table.ql-table-blot') ||
			domNode.querySelector?.('table.ql-table-blot') != null
		);

		if(lineLength <= 1 && !containsTable) {
			if(domNode?.dataset?.processedHash) {
				delete domNode.dataset.processedHash;
			}
			if(domNode?.dataset?.[MISSPELLING_SKIP_DATASET_KEY]) {
				delete domNode.dataset[MISSPELLING_SKIP_DATASET_KEY];
			}
			return;
		}

		const delta: any = quill.getContents(lineIndex, lineLength);
		const text: string = quill.getText(lineIndex, lineLength);
		const computedHash = QuillExtensions.computeHash(text);
		const existingHash = domNode?.dataset?.processedHash;

		if(existingHash === computedHash) {
			return;
		}

		if(domNode?.dataset) {
			domNode.dataset.processedHash = computedHash;
		}

		const { skipRanges, autoLinkRanges } = QuillExtensions.extractMisspellingSkipRanges(text, delta?.ops ?? []);
		if(domNode?.dataset) {
			if(skipRanges.length > 0) {
				domNode.dataset[MISSPELLING_SKIP_DATASET_KEY] = JSON.stringify(skipRanges);
			} else if(domNode.dataset[MISSPELLING_SKIP_DATASET_KEY]) {
				delete domNode.dataset[MISSPELLING_SKIP_DATASET_KEY];
			}
		}

		QuillExtensions.syncAutoLinks(quill, line, lineIndex, lineLength, text, autoLinkRanges);

		if(domNode) {
			if(domNode.matches?.('table.ql-table-blot')) {
				await TableBlot.processStaticTable(domNode as HTMLTableElement, venusEditor);
			} else {
				// Non-table line - scan for tables embedded in its content.
				const tables = domNode.querySelectorAll?.('table.ql-table-blot') ?? [];
				for(const tableElement of tables) {
					await TableBlot.processStaticTable(tableElement as HTMLTableElement, venusEditor);
				}
			}
		}

		// Only invoke .NET ProcessLine when text processing is needed (mentions or spellcheck)
		if(!venusEditor.editorSettings.doMentionProcessing && !venusEditor.editorSettings.isSpellCheckEnabled) {
			return;
		}

		const context = venusEditor.isCellEditorInstance(quill) ? 'cell' : 'primary';
		const cellId = context === 'cell' ? venusEditor.getCellProcessingId(quill) : '';
		// IMPORTANT: This must be awaited. Otherwise, it leads to queue-starvation.
		// processLine is called in a sequential loop from processVisibleLines, and the outer
		// await only waits for *this* function's promise. If we fire-and-forget here, the loop
		// races ahead, dozens of ProcessLine calls pile up in Blazor's SignalR dispatch queue,
		// and each call's wall-clock inflates from ~200ms to 5-9s because every call sits
		// behind all the others. Keeping this await serializes the dispatch and keeps per-line
		// latency predictable. Do NOT remove without also re-architecting processVisibleLines.
		await safeInvokeAsync(venusEditor.dotNetHelper, 'ProcessLine', [text, lineIndex, lineLength, computedHash, context, cellId]);
	}

	static async processVisibleLines(quill: any, venusEditor: VenusEditor, options?: { force?: boolean; awaitCompletion?: boolean }): Promise<void> {
		if(!venusEditor.dotNetHelper) {
			return;
		}
		if(!options?.force && quill.composition?.isComposing) {
			venusEditor._compositionPendingProcess = true;
			return;
		}
		const isCellQuill = venusEditor.isCellEditorInstance(quill);
		const shouldForce = options?.force === true;
		const shouldAwaitCompletion = options?.awaitCompletion === true;
		const activeEditor = typeof venusEditor.notesEditor === 'function' ? venusEditor.notesEditor() : venusEditor.notesEditor;
		const isActiveQuill = activeEditor === quill;
		const hasFocusedActiveEditor = !!(isActiveQuill && activeEditor && typeof activeEditor.hasFocus === 'function' && activeEditor.hasFocus());

		if(!shouldForce) {
			if(venusEditor.isProcessingVisibleLines) {
				return;
			}
			if(venusEditor.isCellEditorActive() && !isCellQuill) {
				return;
			}
			if(!venusEditor.editorSettings.readOnly && hasFocusedActiveEditor && venusEditor.editorSettings.clientOs == ClientOs.Android) {
				// On Android: processing mentions while editing makes the cursor jump around on certain keyboards.
				return;
			}
		}

		// Get the visible boundaries of the editor.
		const visibleBounds = QuillExtensions.getVisibleEditorBounds(quill);
		if(!shouldForce && visibleBounds.height === 0) {
			// The editor is not visible, this happens while switching between thoughts
			return;
		}

		if(venusEditor.isProcessingVisibleLines && !shouldForce) {
			return;
		}
		venusEditor.isProcessingVisibleLines = true;
		const perfTimer = NotesPerfTimer.start('processVisibleLines');
		let linesProcessed = 0;
		try {
			const lines = quill.getLines();
			if(lines.length === 0) return;

			// Binary search for the first line whose bottom is at or below the top of the viewport.
			let low = 0;
			let high = lines.length - 1;
			while(low < high) {
				const mid = Math.floor((low + high) / 2);
				const midBounds = lines[mid].domNode.getBoundingClientRect();

				if(!shouldForce && midBounds.bottom < visibleBounds.top) {
					// This line is completely above the visible area.
					low = mid + 1;
				} else {
					// The line is at or below the top; it might be visible.
					high = mid;
				}
			}

			// Process lines sequentially to avoid queue starvation on Blazor Server.
			// Parallel dispatch causes all ProcessLine calls to queue up, each waiting
			// for the previous to complete, inflating wall-clock times from ~200ms to 5-9s.
			for(let i = low; i < lines.length; i++) {
				const lineBounds = lines[i].domNode.getBoundingClientRect();
				// If the line's top is below the bottom of the editor, we've exited the visible area.
				if(!shouldForce && lineBounds.top >= visibleBounds.bottom) {
					break;
				}
				const maybePromise = QuillExtensions.processLine(quill, lines[i], venusEditor);
				linesProcessed++;
				if(maybePromise && typeof (maybePromise as Promise<void>).then === 'function') {
					await maybePromise;
					// Yield to main thread so user interaction (clicks, typing) isn't blocked
					await new Promise<void>(r => setTimeout(r, 0));
				}
			}
		} finally {
			venusEditor.isProcessingVisibleLines = false;
			perfTimer.withContext('lines', linesProcessed);
			perfTimer.stop();
		}
	}

	/**
	 * Computes the intersection of the editor's bounds with the viewport.
	 * Returns a rectangle representing the visible portion of the editor.
	 *
	 * @param quill - The Quill instance.
	 */
	private static getVisibleEditorBounds(quill: any): DOMRect {
		const editorRect = quill.root.getBoundingClientRect();
		const viewportRect = {
			top: 0,
			left: 0,
			right: window.innerWidth,
			bottom: window.innerHeight
		};

		// Compute intersection boundaries.
		const intersectTop = Math.max(editorRect.top, viewportRect.top);
		const intersectLeft = Math.max(editorRect.left, viewportRect.left);
		const intersectBottom = Math.min(editorRect.bottom, viewportRect.bottom);
		const intersectRight = Math.min(editorRect.right, viewportRect.right);

		// Create a DOMRect-like object for the intersection.
		return new DOMRect(
			intersectLeft,
			intersectTop,
			intersectRight - intersectLeft,
			intersectBottom - intersectTop
		);
	}

	private static extractMisspellingSkipRanges(text: string, deltaOps: any[]): { skipRanges: Array<{start: number; end: number}>, autoLinkRanges: Array<{start: number; end: number}> } {
		const skipRanges: Array<{start: number; end: number}> = [];
		const autoLinkRanges: Array<{start: number; end: number}> = [];
		const ops = Array.isArray(deltaOps) ? deltaOps : [];

		const mergeRanges = (input: Array<{start: number; end: number}>): Array<{start: number; end: number}> => {
			if(!Array.isArray(input) || input.length === 0) {
				return [];
			}
			const filtered = input
				.filter(range => typeof range?.start === 'number' && typeof range?.end === 'number' && range.end > range.start)
				.map(range => ({ start: range.start, end: range.end }))
				.sort((a, b) => a.start - b.start);
			if(filtered.length === 0) {
				return [];
			}
			const merged: Array<{start: number; end: number}> = [filtered[0]];
			for(let i = 1; i < filtered.length; i++) {
				const current = filtered[i];
				const last = merged[merged.length - 1];
				if(current.start <= last.end) {
					if(current.end > last.end) {
						last.end = current.end;
					}
					continue;
				}
				merged.push({ start: current.start, end: current.end });
			}
			return merged;
		};

		// Track text-string offset (embeds contribute 0) rather than Quill's
		// delta-index offset (embeds count as 1). Consumers compare these ranges
		// against `process.index` which is in text-string space, so the inline-
		// `code` ranges below must use the same coordinate system as the URL/email
		// ranges produced from regex matches on `text`.
		let textOffset = 0;
		let isCodeBlockLine = false;

		for(const op of ops) {
			const insert = op?.insert;
			const isString = typeof insert === 'string';
			const textLen = isString ? insert.length : 0;
			const attributes = op?.attributes ?? null;

			if(attributes && attributes['code-block']) {
				isCodeBlockLine = true;
			}

			if(attributes && attributes.code && isString && textLen > 0) {
				skipRanges.push({ start: textOffset, end: textOffset + textLen });
			}

			textOffset += textLen;
		}

		if(isCodeBlockLine) {
			const lineLength = text.length;
			if(lineLength > 0) {
				skipRanges.push({ start: 0, end: lineLength });
			}
		}

		let urlMatch: RegExpExecArray | null;
		while((urlMatch = URL_BOUNDARY_REGEX.exec(text)) !== null) {
			const matchText = urlMatch[0];
			if(!matchText) {
				break;
			}
			let start = urlMatch.index ?? 0;
			let urlPortion = matchText;
			if(/\s/.test(urlPortion[0] ?? '')) {
				start += 1;
				urlPortion = urlPortion.substring(1);
			}
			const end = start + urlPortion.length;
			if(urlPortion.length > 0) {
				skipRanges.push({ start, end });
				autoLinkRanges.push({ start, end });
			}
		}
		URL_BOUNDARY_REGEX.lastIndex = 0;

		let emailMatch: RegExpExecArray | null;
		while((emailMatch = EMAIL_BOUNDARY_REGEX.exec(text)) !== null) {
			const core = emailMatch[1];
			if(!core) {
				continue;
			}
			const relativeStart = emailMatch[0].indexOf(core);
			const start = (emailMatch.index ?? 0) + (relativeStart >= 0 ? relativeStart : 0);
			const end = start + core.length;
			skipRanges.push({ start, end });
			autoLinkRanges.push({ start, end });
		}
		EMAIL_BOUNDARY_REGEX.lastIndex = 0;

		let phoneMatch: RegExpExecArray | null;
		while((phoneMatch = PHONE_BOUNDARY_REGEX.exec(text)) !== null) {
			const core = phoneMatch[1];
			if(!core) {
				continue;
			}
			const relativeStart = phoneMatch[0].indexOf(core);
			const start = (phoneMatch.index ?? 0) + (relativeStart >= 0 ? relativeStart : 0);
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

	static getMisspellingSkipRanges(domNode: HTMLElement | null): Array<{start: number; end: number}> {
		if(!domNode?.dataset) {
			return [];
		}
		const raw = domNode.dataset[MISSPELLING_SKIP_DATASET_KEY];
		if(!raw) {
			return [];
		}
		try {
			const parsed = JSON.parse(raw) as Array<{start: number; end: number}>;
			if(Array.isArray(parsed)) {
				return parsed.filter(range => typeof range.start === 'number' && typeof range.end === 'number');
			}
		} catch {
			delete domNode.dataset[MISSPELLING_SKIP_DATASET_KEY];
		}
		return [];
	}

	static syncAutoLinks(quill: any, line: any, lineIndex: number, lineLength: number, text: string, autoLinkRanges: Array<{start: number; end: number}>): void {
		const domNode: HTMLElement | null = line?.domNode ?? null;
		if(!domNode) {
			return;
		}

		const findLinkNode = (index: number): HTMLElement | null => {
			const [leaf] = quill.getLeaf(index);
			if(!leaf) {
				return null;
			}
			let current: any = leaf;
			while(current && current.domNode && current.domNode !== line.domNode) {
				const dom = current.domNode as Node;
				if(dom.nodeType === Node.ELEMENT_NODE && (dom as HTMLElement).tagName === 'A') {
					return dom as HTMLElement;
				}
				current = current.parent;
			}
			return null;
		};

		const existingAutoLinks = Array.from(domNode.querySelectorAll('a[data-autolink="true"]')) as HTMLElement[];
		existingAutoLinks.forEach(node => {
			const blot = Quill.find(node);
			if(!blot) {
				return;
			}
			const startIndex = quill.getIndex(blot);
			const length = node.textContent?.length ?? 0;
			if(length <= 0) {
				return;
			}
			const relativeOffset = startIndex - lineIndex;
			const matchesRange = autoLinkRanges.some(range => relativeOffset >= range.start && relativeOffset + length <= range.end);
			if(!matchesRange) {
				node.removeAttribute('data-autolink');
				quill.formatText(startIndex, length, 'link', false, 'silent');
			}
		});

		autoLinkRanges.forEach(range => {
			const start = range.start;
			const end = range.end;
			if(end <= start) {
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
			const isAutoLink = linkNode?.getAttribute('data-autolink') === 'true';

			if(isExistingLink && !isAutoLink) {
				return;
			}

			if(isAutoLink) {
				if(linkNode!.getAttribute('href') !== linkValue) {
					quill.formatText(deltaIndex, length, 'link', linkValue, 'silent');
					const refreshed = findLinkNode(deltaIndex);
					refreshed?.setAttribute('data-autolink', 'true');
					return;
				}
				linkNode!.setAttribute('data-autolink', 'true');
				return;
			}

			quill.formatText(deltaIndex, length, 'link', linkValue, 'silent');
			findLinkNode(deltaIndex)?.setAttribute('data-autolink', 'true');
		});
	}
}

class TableResizer {
	public readonly table: HTMLTableElement;
	private cols: HTMLCollection;
	public isDragging: boolean = false;
	private currentCol: HTMLElement | null = null;
	private startX: number = 0;
	private startWidth: number = 0;
	private fillColor = "";
	private resizeObserver: ResizeObserver | null = null; // Store ResizeObserver
	private MIN_COLUMN_WIDTH = 35;

	// Store event listener references
	private pointerMoveHandler: (e: PointerEvent) => void;
	private pointerUpHandler: (e: PointerEvent) => void;
	private pointerCancelHandler: (e: PointerEvent) => void;

	constructor(table: HTMLTableElement, fillColor: string) {
		this.table = table;
		this.cols = this.table.getElementsByTagName('col');
		this.fillColor = fillColor;

		// Bind methods to use as event listeners
		this.pointerMoveHandler = this.resize.bind(this);
		this.pointerUpHandler = this.stopResize.bind(this);
		this.pointerCancelHandler = this.stopResize.bind(this);

		// Document listeners and ResizeObserver are installed once per instance and
		// persist for its lifetime — they don't need to be recreated when the handles
		// are rebuilt for a structural change.
		document.addEventListener('pointermove', this.pointerMoveHandler);
		document.addEventListener('pointerup', this.pointerUpHandler);
		document.addEventListener('pointercancel', this.pointerCancelHandler);
		this.resizeObserver = new ResizeObserver(() => this.updateResizerHeights());
		this.resizeObserver.observe(this.table);

		this.refresh(fillColor);
	}

	/// Rebuild per-column handles so they match the current header cell count, and
	/// update fillColor on existing handles. Safe to call repeatedly — reuses
	/// existing handle divs when the column count is unchanged, only rebuilding
	/// them when necessary. Cheaper than destroy+new because document listeners
	/// and ResizeObserver stay attached.
	public refresh(fillColor: string): void {
		this.fillColor = fillColor;
		const headerCells = this.table.querySelector('tr')?.cells;
		if(!headerCells) return;

		const existing = this.table.querySelectorAll('.ql-column-resizer');
		if(existing.length === headerCells.length) {
			// Handle count matches cells — just update color (e.g. theme change).
			for(let i = 0; i < existing.length; i++) {
				(existing[i] as HTMLElement).style.backgroundColor = fillColor;
			}
			this.updateResizerHeights();
			return;
		}

		// Column count changed — rebuild handles.
		existing.forEach(h => h.remove());
		for(let i = 0; i < headerCells.length; i++) {
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
	
	public pauseResizing(): void {
		const resizers = this.table.getElementsByClassName('ql-column-resizer');
		for(let i = 0; i < resizers.length; i++) {
			(resizers[i] as HTMLElement).style.pointerEvents = 'none';
		}
	}
	
	public resumeResizing(): void {
		const resizers = this.table.getElementsByClassName('ql-column-resizer');
		for(let i = 0; i < resizers.length; i++) {
			(resizers[i] as HTMLElement).style.pointerEvents = '';
		}
	}

	private updateResizerHeights(): void {
		const tableHeight = this.table.offsetHeight;
		const resizers = this.table.getElementsByClassName('ql-column-resizer');
		for(let i = 0; i < resizers.length; i++) {
			(resizers[i] as HTMLElement).style.height = `${tableHeight - 2}px`;
		}
	}

	private startResize(e: PointerEvent, index: number): void {
		this.isDragging = true;
		this.currentCol = this.cols[index] as HTMLElement;
		this.startX = e.pageX;
		this.startWidth = this.currentCol.offsetWidth;

		// Capture the pointer to ensure all events go to this element
		(e.target as HTMLElement).setPointerCapture(e.pointerId);

		document.body.style.cursor = 'ew-resize'; // col-resize is not supported by MAUI blazor
		document.body.style.userSelect = 'none';
	}

	private resize(e: PointerEvent): void {
		if(!this.isDragging || !this.currentCol) return;

		const diffX = e.pageX - this.startX;
		const newWidth = Math.max(this.MIN_COLUMN_WIDTH, this.startWidth + diffX); // Minimum width of 50px
		this.currentCol.style.width = `${newWidth}px`;
	}

	private stopResize(e: PointerEvent): void {
		if(!this.isDragging) return;

		if(this.currentCol && this.currentCol.style.width === `${this.MIN_COLUMN_WIDTH}px`) {
			// When minimum width is set, use dynamic width
			this.currentCol.style.width = "";
		}
		const wasResizing = this.currentCol !== null;
		this.isDragging = false;
		this.currentCol = null;
		document.body.style.cursor = '';
		document.body.style.userSelect = '';

		// Commit the new widths via formatText so the resize becomes its own undo entry.
		// Mutating col.style.width directly bypasses Quill's history.
		if(wasResizing && document.body.contains(this.table)) {
			this.commitColumnWidths();
		}
	}

	private commitColumnWidths(): void {
		TableBlot.getEditorForTable(this.table)?.commitTableColumnWidths(this.table);
	}

	// Cleanup method
	public destroy(): void {
		// Remove global document event listeners
		document.removeEventListener('pointermove', this.pointerMoveHandler);
		document.removeEventListener('pointerup', this.pointerUpHandler);
		document.removeEventListener('pointercancel', this.pointerCancelHandler);

		// Disconnect ResizeObserver
		if(this.resizeObserver) {
			this.resizeObserver.disconnect();
		}
	}
}

interface TableControlOptions {
	/** Where to place the controls relative to the table */
	position: 'top' | 'bottom' | 'left' | 'right';
	/**
	 * How to place the controls along that side:
	 * - 'center' places one control inside each cell (or row)
	 * - 'edge' places one control at each cell boundary (resulting in one more than the number of cells/rows)
	 */
	placement: 'center' | 'edge';
	/**
	 * Callback invoked when a control is clicked.
	 * The index parameter represents:
	 * - for centered controls: the cell or row index;
	 * - for edge controls: the index of the edge (0 = first edge, last = after last cell/row)
	 */
	onClick: (event: MouseEvent, index: number, control: HTMLElement, isContextClick: boolean) => void;
	/**
	 * (Optional) Factory function to create a control element.
	 * Receives the orientation ("horizontal" or "vertical") and the edge (e.g., "top", "bottom", "left", "right")
	 * and should return an HTMLElement to be used as the control.
	 */
	controlFactory?: (
		orientation: 'horizontal' | 'vertical',
		edge: string
	) => HTMLElement;
}

// One removal observer per table, shared across all TableControlAdders for it.
// rAF-debounced so mutation bursts collapse to one containment check per frame.
interface SharedTableRemovalEntry {
	observer: MutationObserver;
	adders: Set<TableControlAdder>;
	editorRoot: HTMLElement;
	table: HTMLTableElement;
	checkScheduled: boolean;
}
const sharedTableRemovalObservers = new WeakMap<HTMLTableElement, SharedTableRemovalEntry>();

class TableControlAdder {
	private table: HTMLTableElement;
	private options: TableControlOptions;
	private editorRoot: HTMLElement | null = null;
	private horizontalEdgeControls: { control: HTMLElement; index: number }[] = [];
	private verticalEdgeControls: { control: HTMLElement; index: number }[] = [];

	constructor(table: HTMLTableElement, options: TableControlOptions) {
		this.table = table;
		this.options = options;
		this.editorRoot = this.table.closest('.ql-editor') as HTMLElement;

		// Ensure the table is positioned relatively.
		if(window.getComputedStyle(this.table).position === 'static') {
			this.table.style.position = 'relative';
		}

		// Initial creation of controls.
		this.buildControls();

		if(this.editorRoot) {
			this.attachToSharedRemovalObserver();
		}
	}

	private attachToSharedRemovalObserver(): void {
		if(!this.editorRoot) return;
		let entry = sharedTableRemovalObservers.get(this.table);
		if(!entry) {
			const editorRoot = this.editorRoot;
			const table = this.table;
			const newEntry: SharedTableRemovalEntry = {
				observer: null as unknown as MutationObserver,
				adders: new Set<TableControlAdder>(),
				editorRoot,
				table,
				checkScheduled: false,
			};
			newEntry.observer = new MutationObserver(() => {
				if(newEntry.checkScheduled) return;
				newEntry.checkScheduled = true;
				requestAnimationFrame(() => {
					newEntry.checkScheduled = false;
					if(editorRoot.contains(table)) return;
					// destroy() mutates the set - iterate a snapshot.
					const toDestroy = Array.from(newEntry.adders);
					for(const a of toDestroy) {
						a.destroy();
					}
				});
			});
			newEntry.observer.observe(editorRoot, {childList: true, subtree: true});
			sharedTableRemovalObservers.set(table, newEntry);
			entry = newEntry;
		}
		entry.adders.add(this);
	}

	// Clears any controls previously added.
	public clearControls(): void {
		this.horizontalEdgeControls.forEach(({control}) => control.remove());
		this.verticalEdgeControls.forEach(({control}) => control.remove());
		this.horizontalEdgeControls = [];
		this.verticalEdgeControls = [];
	}

	public rebuildControls(): void {
		this.clearControls();
		this.buildControls();
	}

	// Build controls based on options.
	private buildControls(): void {
		if(this.options.position === 'top' || this.options.position === 'bottom') {
			this.buildHorizontalControls();
		} else {
			this.buildVerticalControls();
		}
	}

	// Builds horizontal controls (for top or bottom).
	private buildHorizontalControls(): void {
		const row = this.options.position === 'top'
			? this.table.querySelector('tr')
			: this.table.querySelector('tr:last-child') as HTMLTableRowElement;
		if(!row) return;
		const cells = row.cells;
		let yTransform: string;
		if(this.options.position === 'top') {
			yTransform = 'translateY(-100%)';
		} else {
			yTransform = 'translateY(100%)';
		}
		if(this.options.placement === 'center') {
			// For center placement, add one control inside each cell.
			for(let i = 0; i < cells.length; i++) {
				const cell = cells[i];
				if(window.getComputedStyle(cell).position === 'static') {
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
					this.options.onClick(e, i, control, false)
				});
				control.addEventListener('contextmenu', (e) => {
					e.preventDefault();
					e.stopPropagation();
					this.options.onClick(e, i, control, true);
				});
				control.addEventListener('pointerdown', (e) => {
					// Prevent default pointer behavior to avoid text selection.
					e.preventDefault();
					e.stopPropagation();
				})
				cell.appendChild(control);
			}
		} else {
			// For edge placement, we need (cells.length + 1) controls.
			// We'll assign:
			// - Index 0: to the first cell (left edge)
			// - Indices 1..cells.length-1: to the cell at that index (left edge; the boundary between previous and current cell)
			// - Index cells.length: to the last cell (right edge)
			const controlCount = cells.length + 1;
			for(let i = 0; i < controlCount; i++) {
				let targetCell: HTMLTableCellElement;
				if(i === 0) {
					targetCell = cells[0];
				} else if(i === controlCount - 1) {
					targetCell = cells[cells.length - 1];
				} else {
					targetCell = cells[i];
				}
				if(window.getComputedStyle(targetCell).position === 'static') {
					targetCell.style.position = 'relative';
				}
				const control = this.createControl('horizontal', this.options.position);
				// For horizontal edge controls inside a cell, we position at the left or right.
				// For the all but the last, position at the left edge.
				// For the last cell, position at the right edge.
				let xTransform: string;
				if(i === controlCount - 1) {
					control.style.right = '0';
					// translateX(50%) centers the control horizontally.
					xTransform = 'translateX(50%)';
				} else {
					control.style.left = '0';
					// translateX(-50%) centers the control horizontally.
					xTransform = 'translateX(-50%)';
				}
				// Vertically, align to the top or bottom of the cell.
				if(this.options.position === 'top') {
					control.style.top = '0';
				} else {
					control.style.bottom = '0';
				}
				control.style.transform = `${xTransform} ${yTransform}`;
				// For identification in the callback, pass the current edge index.
				control.addEventListener('click', (e) => {
					e.preventDefault();
					e.stopPropagation();
					this.options.onClick(e, i, control, false)
				});
				control.addEventListener('contextmenu', (e) => {
					e.preventDefault();
					e.stopPropagation();
					this.options.onClick(e, i, control, true);
				});
				control.addEventListener('pointerdown', (e) => {
					// Prevent default pointer behavior to avoid text selection.
					e.preventDefault();
					e.stopPropagation();
				})
				targetCell.appendChild(control);
				this.horizontalEdgeControls.push({control, index: i});
			}
		}
	}

	// Builds vertical controls (for left or right).
	private buildVerticalControls(): void {
		const rows = Array.from(this.table.rows);
		if(rows.length === 0) return;
		let xTransform: string;
		if(this.options.position === 'left') {
			xTransform = 'translateX(-100%)';
		} else {
			xTransform = 'translateX(100%)';
		}
		if(this.options.placement === 'center') {
			// For center placement, add one control in the appropriate cell in each row.
			for(let i = 0; i < rows.length; i++) {
				const row = rows[i];
				const cell = this.options.position === 'left'
					? row.cells[0]
					: row.cells[row.cells.length - 1];
				if(!cell) continue;
				if(window.getComputedStyle(cell).position === 'static') {
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
					this.options.onClick(e, i, control, false)
				});
				control.addEventListener('contextmenu', (e) => {
					e.preventDefault();
					e.stopPropagation();
					this.options.onClick(e, i, control, true);
				});
				control.addEventListener('pointerdown', (e) => {
					// Prevent default pointer behavior to avoid text selection.
					e.preventDefault();
					e.stopPropagation();
				})
				cell.appendChild(control);
			}
		} else {
			// For edge placement, we need (rows.length + 1) controls.
			// We'll assign:
			// - Index 0: to the first row's cell (top edge)
			// - Indices 1..rows.length-1: to the row at that index (top edge; the boundary between previous and current row)
			// - Index rows.length: to the last row's cell (bottom edge)
			const controlCount = rows.length + 1;
			for(let i = 0; i < controlCount; i++) {
				let targetRow = rows[0]; // default
				if(i === 0) {
					targetRow = rows[0];
				} else if(i === controlCount - 1) {
					targetRow = rows[rows.length - 1];
				} else {
					targetRow = rows[i];
				}
				// For vertical edge controls, choose the cell from the row.
				const targetCell = this.options.position === 'left'
					? targetRow.cells[0]
					: targetRow.cells[targetRow.cells.length - 1];
				if(!targetCell) continue;
				if(window.getComputedStyle(targetCell).position === 'static') {
					targetCell.style.position = 'relative';
				}
				const control = this.createControl('vertical', this.options.position);
				// For vertical edge controls inside a cell, we position at the top or bottom.
				let yTransform: string;
				if(i === controlCount - 1) {
					control.style.bottom = '0';
					yTransform = 'translateY(50%)';
				} else {
					control.style.top = '0';
					yTransform = 'translateY(-50%)';
				}
				// Horizontally, align to the left for left edge, or right for right edge.
				if(this.options.position === 'left') {
					control.style.left = '0';
				} else {
					control.style.right = '0';
				}
				control.style.transform = `${xTransform} ${yTransform}`;
				control.addEventListener('click', (e) => {
					e.preventDefault();
					e.stopPropagation();
					this.options.onClick(e, i, control, false)
				});
				control.addEventListener('contextmenu', (e) => {
					e.preventDefault();
					e.stopPropagation();
					this.options.onClick(e, i, control, true);
				});
				control.addEventListener('pointerdown', (e) => {
					// Prevent default pointer behavior to avoid text selection.
					e.preventDefault();
					e.stopPropagation();
				})
				targetCell.appendChild(control);
				this.verticalEdgeControls.push({control, index: i});
			}
		}
	}

	// Creates a control element with common styling.
	private createControl(
		orientation: 'horizontal' | 'vertical',
		edge: string
	): HTMLElement {
		if(this.options.controlFactory) {
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

	public destroy(): void {
		const entry = sharedTableRemovalObservers.get(this.table);
		if(entry) {
			entry.adders.delete(this);
			if(entry.adders.size === 0) {
				entry.observer.disconnect();
				sharedTableRemovalObservers.delete(this.table);
			}
		}
		this.clearControls();
	}
}

/**
 * Helper functions for image scaling that affects layout (not just visual transform)
 */

/**
 * Get the scale value from an image element
 * Uses data attribute to track the intended scale
 * @param element The image element to get the scale from
 * @returns The scale value, or 1 if no scale is set
 */
function getImageScale(element: HTMLImageElement): number {
	const scaleAttr = element.getAttribute('data-scale');
	if(scaleAttr) {
		return parseFloat(scaleAttr) || 1;
	}
	return 1;
}

/**
 * Set the scale value on an image element by adjusting its width
 * This affects layout space unlike transform: scale()
 * @param element The image element to set the scale on
 * @param scale The scale value to set
 */
function setImageScale(element: HTMLImageElement, scale: number): void {
	// Store the scale in a data attribute for later retrieval
	element.setAttribute('data-scale', scale.toString());

	// Get the natural (original) width of the image
	// If the image hasn't loaded yet, we'll set it when it loads
	if(element.naturalWidth > 0) {
		const targetWidth = element.naturalWidth * scale;
		element.style.width = targetWidth + 'px';
		element.style.height = 'auto';
	} else {
		// Image not loaded yet, set up onload handler
		element.addEventListener('load', function setScaleOnLoad() {
			const targetWidth = element.naturalWidth * scale;
			element.style.width = targetWidth + 'px';
			element.style.height = 'auto';
			element.removeEventListener('load', setScaleOnLoad);
		});
	}
}

class ImageControls {
	private image: HTMLImageElement;
	private editor: HTMLElement; // .ql-editor
	private container: HTMLElement; // Parent of .ql-editor (e.g., .ql-container)
	private outline: HTMLElement | null = null;
	private corners: HTMLElement[] = [];
	private scaleDisplay: HTMLElement | null = null;
	private isDragging: boolean = false;
	private dragStartX: number = 0;
	private dragStartY: number = 0;
	private initialZoom: number = 1;
	private initialScale: number = 1;
	private currentCorner: number = 0;
	private removalObserver: MutationObserver | null = null;

	private controlSize: number = 20;
	private innerControlSize: number = 10;
	private controlFillColor = "#88888888";
	private controlOutlineColor = '#000000';

	constructor(image: HTMLImageElement) {
		this.image = image;
		this.editor = image.closest('.ql-editor') as HTMLElement;
		if(!this.editor) throw new Error('Image not in Quill editor');

		const backgroundColor = getEffectiveBackgroundColor(this.editor);
		const lum = getLuminance(backgroundColor);
		if(lum > 0.5) {
			this.controlOutlineColor = '#00000088';
			this.controlFillColor = '#00000044';
		} else {
			this.controlOutlineColor = '#ffffff88';
			this.controlFillColor = '#ffffff44';
		}

		// Use the parent of .ql-editor as the container for controls
		this.container = this.editor.parentElement as HTMLElement;
		if(!this.container) throw new Error('No parent container for .ql-editor');

		// Ensure the container is positioned relatively
		if(window.getComputedStyle(this.container).position === 'static') {
			this.container.style.position = 'relative';
		}

		// Add the controls now
		this.addControls();

		// Observe removal of the image from the editor (scoped to .ql-editor, not document.body).
		this.removalObserver = new MutationObserver(() => {
			if(!this.editor.contains(this.image)) {
				this.destroy();
			}
		});
		this.removalObserver.observe(this.editor, {childList: true, subtree: true});
	}

	private addControls(): void {
		if(this.corners.length > 0) return; // Already added

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

		// Make the selection transparent. The image controls will be visible letting the user know the image is selected.
		this.editor.classList.add('transparent-selection');
	}

	private removeControls(): void {
		if(this.outline) {
			this.outline.remove();
			this.outline = null;
		}
		this.corners.forEach(corner => corner.remove());
		this.corners = [];
		// Clean up scale display when controls are removed
		if(this.scaleDisplay) {
			this.scaleDisplay.remove();
			this.scaleDisplay = null;
		}
		this.editor.classList.remove('transparent-selection');
	}

	private createOutline(): HTMLElement {
		const outline = document.createElement('div');
		outline.setAttribute('data-image-control', 'outline');
		outline.style.position = 'absolute';
		outline.style.border = '1px dashed ' + this.controlOutlineColor;
		outline.style.pointerEvents = 'none';
		outline.style.display = 'none';
		this.container.appendChild(outline); // Append to parent
		return outline;
	}

	private createCorner(position: string, index: number): HTMLElement {

		// outer control that is larger than visible inner control
		const corner = document.createElement('div');
		corner.setAttribute('data-image-control', `corner-${index}`);
		corner.className = `image-control image-control-${position}`;
		corner.style.position = 'absolute';
		corner.style.width = this.controlSize + 'px';
		corner.style.height = this.controlSize + 'px';
		corner.style.zIndex = '10';
		corner.style.display = 'none';

		switch(index) {
			case 0:
				corner.style.cursor = 'nwse-resize';
				break; // top-left
			case 1:
				corner.style.cursor = 'nesw-resize';
				break; // top-right
			case 2:
				corner.style.cursor = 'nesw-resize';
				break; // bottom-left
			case 3:
				corner.style.cursor = 'nwse-resize';
				break; // bottom-right
		}

		// inner visible control
		const inner = document.createElement('div');
		inner.style.position = 'absolute';
		inner.style.width = this.innerControlSize + 'px';
		inner.style.height = this.innerControlSize + 'px';
		inner.style.left = (this.controlSize - this.innerControlSize) / 2 + 'px';
		inner.style.top = (this.controlSize - this.innerControlSize) / 2 + 'px';
		inner.style.background = this.controlFillColor;
		inner.style.borderRadius = this.innerControlSize + 'px'; // round
		inner.style.border = '1px solid ' + this.controlOutlineColor;

		corner.appendChild(inner);

		this.container.appendChild(corner); // Append to parent
		return corner;
	}

	private createScaleDisplay(scale: number): void {
		if(this.scaleDisplay) {
			// Already exists, just show it
			this.scaleDisplay.style.display = 'flex';
			this.scaleDisplay.style.opacity = '0.95';
			this.updateScaleDisplay(scale);
			return;
		}

		// Create the scale display overlay
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
		// display.style.textShadow = 'rgba(0, 0, 0, 0.4) -1px -1px 2px, rgba(0, 0, 0, 0.4) 1px -1px 2px, rgba(0, 0, 0, 0.4) -1px 1px 2px, rgba(0, 0, 0, 0.4) 1px 1px 2px';
		display.textContent = Math.round(scale * 100 / 5) * 5 + '%';

		this.container.appendChild(display);
		this.scaleDisplay = display;

		// Position it in the center of the image
		this.positionScaleDisplay();

		// Fade in
		requestAnimationFrame(() => {
			if(this.scaleDisplay) {
				this.scaleDisplay.style.opacity = '0.95';
			}
		});
	}

	private positionScaleDisplay(): void {
		if(!this.scaleDisplay) return;

		const scale = getScaleFactor(this.container);
		const rect = this.image.getBoundingClientRect();
		const containerRect = this.container.getBoundingClientRect();

		const imageLeft = (rect.left - containerRect.left) / scale;
		const imageTop = (rect.top - containerRect.top) / scale;
		const imageWidth = this.image.offsetWidth;
		const imageHeight = this.image.offsetHeight;

		// Proportional sizing: scale display takes up ~90% of image width, capped at maximum size
		const maxFontSize = 18;
		const maxPadding = 2;
		const targetWidthPercent = 0.9; // Display takes up 90% of image width

		// Start with maximum size
		let fontSize = maxFontSize;
		let padding = maxPadding;

		// Apply initial max sizing
		this.scaleDisplay.style.fontSize = `${fontSize}px`;
		this.scaleDisplay.style.padding = `${padding}px ${padding * 1.67}px`;

		// Measure the display at max size
		let displayWidth = this.scaleDisplay.offsetWidth;
		let displayHeight = this.scaleDisplay.offsetHeight;

		// Calculate target dimensions (90% of image size)
		const targetWidth = imageWidth * targetWidthPercent;
		const targetHeight = imageHeight * targetWidthPercent;

		// If display is wider than target, scale down to fit 90% of image width
		if(displayWidth > targetWidth) {
			const widthRatio = targetWidth / displayWidth;
			fontSize *= widthRatio;
			padding *= widthRatio;

			// Re-apply scaled sizing
			this.scaleDisplay.style.fontSize = `${fontSize}px`;
			this.scaleDisplay.style.padding = `${padding}px ${padding * 1.67}px`;

			// Re-measure after width adjustment
			displayWidth = this.scaleDisplay.offsetWidth;
			displayHeight = this.scaleDisplay.offsetHeight;
		}

		// Also check height doesn't overflow (safety check)
		if(displayHeight > targetHeight) {
			const heightRatio = targetHeight / displayHeight;
			fontSize *= heightRatio;
			padding *= heightRatio;

			// Re-apply height-adjusted sizing
			this.scaleDisplay.style.fontSize = `${fontSize}px`;
			this.scaleDisplay.style.padding = `${padding}px ${padding * 1.67}px`;

			// Final measurement
			displayWidth = this.scaleDisplay.offsetWidth;
			displayHeight = this.scaleDisplay.offsetHeight;
		}

		// Center the display on the image
		this.scaleDisplay.style.left = `${imageLeft + (imageWidth - displayWidth) / 2}px`;
		this.scaleDisplay.style.top = `${imageTop + (imageHeight - displayHeight) / 2}px`;
	}

	private updateScaleDisplay(newScale: number): void {
		if(!this.scaleDisplay) return;
		this.scaleDisplay.textContent = Math.round(newScale * 100 / 5) * 5 + '%';
		this.positionScaleDisplay();
	}

	private removeScaleDisplay(): void {
		if(!this.scaleDisplay) return;

		// Fade out
		this.scaleDisplay.style.opacity = '0';

		// Remove after fade
		setTimeout(() => {
			if(this.scaleDisplay) {
				this.scaleDisplay.remove();
				this.scaleDisplay = null;
			}
		}, 150);
	}

	public positionControls(): void {
		const scale = getScaleFactor(this.container);

		// With width-based scaling, offsetWidth already reflects the scaled size
		const width = this.image.offsetWidth;
		const height = this.image.offsetHeight;

		// Use getBoundingClientRect for position
		const rect = this.image.getBoundingClientRect();
		const containerRect = this.container.getBoundingClientRect();
		let left = (rect.left - containerRect.left) / scale;
		let top = (rect.top - containerRect.top) / scale;
		
		// if on mac...
		if(navigator.platform.toUpperCase().indexOf('MAC') >= 0) {
			// left = (rect.left - containerRect.left);
			// top = (rect.top - containerRect.top);
		}
		

		if(this.outline) {
			this.outline.style.left = `${left}px`;
			this.outline.style.top = `${top}px`;
			this.outline.style.width = `${width}px`;
			this.outline.style.height = `${height}px`;
			this.outline.style.display = 'initial';
		}

		this.corners[0].style.left = `${left - this.controlSize / 2}px`; // top-left
		this.corners[0].style.top = `${top - this.controlSize / 2}px`;
		this.corners[0].style.display = 'initial';
		this.corners[1].style.left = `${left + width - this.controlSize / 2}px`; // top-right
		this.corners[1].style.top = `${top - this.controlSize / 2}px`;
		this.corners[1].style.display = 'initial';
		this.corners[2].style.left = `${left - this.controlSize / 2}px`; // bottom-left
		this.corners[2].style.top = `${top + height - this.controlSize / 2}px`;
		this.corners[2].style.display = 'initial';
		this.corners[3].style.left = `${left + width - this.controlSize / 2}px`; // bottom-right
		this.corners[3].style.top = `${top + height - this.controlSize / 2}px`;
		this.corners[3].style.display = 'initial';

	}

	private startDrag(e: MouseEvent, cornerIndex: number): void {
		e.preventDefault();
		this.isDragging = true;
		this.currentCorner = cornerIndex;
		this.dragStartX = e.clientX;
		this.dragStartY = e.clientY;
		// Get initial scale from data attribute
		this.initialZoom = getImageScale(this.image);
		this.initialScale = getScaleFactor(this.container);

		// Hide selection highlight while dragging to make the image fully visible
		this.editor.classList.add('dragging-image-resize');

		// Show the scale display when grabbing a handle
		this.createScaleDisplay(this.initialZoom);

		document.addEventListener('mousemove', this.onDrag);
		document.addEventListener('mouseup', this.stopDrag);
	}

	private onDrag = (e: MouseEvent): void => {
		if(!this.isDragging) return;

		const deltaX = (e.clientX - this.dragStartX) / this.initialScale;
		const naturalWidth = this.image.naturalWidth;
		const initialWidth = naturalWidth * this.initialZoom;
		let newScale: number;
		let targetWidth: number;

		switch(this.currentCorner) {
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
		// Set the new scale by adjusting width
		setImageScale(this.image, newScale);
		this.positionControls();
		// Update the scale display overlay
		this.updateScaleDisplay(newScale);
	};

	private stopDrag = (): void => {
		this.isDragging = false;
		document.removeEventListener('mousemove', this.onDrag);
		document.removeEventListener('mouseup', this.stopDrag);

		// Restore selection highlight visibility
		this.editor.classList.remove('dragging-image-resize');

		// round to nearest 5% size
		const scale = getImageScale(this.image);
		const roundedScale = Math.round(scale * 20) / 20
		setImageScale(this.image, roundedScale);
		this.positionControls();
		// Update display with final rounded scale, then hide it when releasing the handle
		this.updateScaleDisplay(roundedScale);
		this.removeScaleDisplay();
	};

	public destroy(): void {
		if(this.removalObserver) {
			this.removalObserver.disconnect();
			this.removalObserver = null;
		}
		// Clean up scale display if it exists
		if(this.scaleDisplay) {
			this.scaleDisplay.remove();
			this.scaleDisplay = null;
		}
		this.removeControls();
	}

	public rebuildControls(): void {
		this.removeControls();
		this.addControls();
	}
}

// Call debounce to create a debounced version of the function (from Grok)
function debounce<T extends (...args: any[]) => any>(
	func: T,
	wait: number
): (...args: Parameters<T>) => void {
	let timeout: ReturnType<typeof setTimeout> | null = null;

	return (...args: Parameters<T>) => {
		if(timeout !== null) {
			clearTimeout(timeout);
		}

		timeout = setTimeout(() => {
			func(...args);
			timeout = null;
		}, wait);
	};
}

// compute the background color of an element

function getEffectiveBackgroundColor(element: HTMLElement): string {
	let currentElement: HTMLElement | null = element;

	while (currentElement) {
		const computedStyle = window.getComputedStyle(currentElement);
		const backgroundColor = computedStyle.backgroundColor;

		// Check if the background color is not transparent
		if (backgroundColor && !isTransparent(backgroundColor)) {
			return backgroundColor;
		}

		// Move up to the parent element
		currentElement = currentElement.parentElement;
	}

	// If we reach here, no non-transparent background was found, assume white
	return 'rgba(255, 255, 255, 1)';
}

function isTransparent(color: string): boolean {
	// Normalize the color string for comparison
	const normalizedColor = color.toLowerCase().trim();

	// Check for common transparent values
	if (normalizedColor === 'transparent' ||
		normalizedColor === 'rgba(0, 0, 0, 0)' ||
		normalizedColor === 'rgba(0,0,0,0)') {
		return true;
	}

	// Check for rgba values with alpha = 0
	const rgbaMatch = normalizedColor.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/);
	if (rgbaMatch) {
		const alpha = rgbaMatch[4];
		// If alpha is 0 or undefined (which means 1 for rgb), it's transparent only if alpha is 0
		return alpha !== undefined && parseFloat(alpha) === 0;
	}

	return false;
}

export function getLuminance(computed: string): number {
	// Note: color must be in rgb(r, g, b) format as returned by getComputedStyle
	// Extract RGB values
	const matches = computed.match(/rgb[a]?\((\d+),\s*(\d+),\s*(\d+)/);
	if(!matches) return 0; // Return 0 for invalid/transparent

	const r = parseInt(matches[1]);
	const g = parseInt(matches[2]);
	const b = parseInt(matches[3]);

	// Calculate luminance
	return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

// keyboard-manager.ts

export interface KeyboardStatus {
	isOpen: boolean;
	height: number;
}

/**
 * A class to detect and manage software keyboard visibility on iOS devices
 */
export class IosKeyboardManager {
	private static instance: IosKeyboardManager | null = null;
	private _status: KeyboardStatus = {isOpen: false, height: 0};
	private listeners: Array<(status: KeyboardStatus) => void> = [];
	public hasSoftwareKeyboard: boolean | null = null;
	public expectedKeyboardHeight: number = 0;
	private initialHeight: number = 0;
	private win: any;
	private visualViewport: any;

	private constructor() {
		// Safely access window
		this.win = typeof window !== 'undefined' ? window : null;
		if(!this.win) return;

		this.initialHeight = this.win.innerHeight || 0;

		// Safely access visualViewport
		this.visualViewport = this.win.visualViewport || null;

		this.setupEventListeners();
		this.updateStatus();
	}

	/**
	 * Get the singleton instance
	 */
	public static getInstance(): IosKeyboardManager {
		if(!IosKeyboardManager.instance) {
			IosKeyboardManager.instance = new IosKeyboardManager();
		}
		return IosKeyboardManager.instance;
	}

	/**
	 * Set up the necessary event listeners based on available browser APIs
	 */
	private setupEventListeners(): void {
		if(!this.win) return;

		if(this.visualViewport) {
			// Using the more modern visualViewport API
			this.visualViewport.addEventListener('resize', this.handleViewportChange);
			this.visualViewport.addEventListener('scroll', this.handleViewportChange);
		} else {
			// Fallback to window resize
			this.win.addEventListener('resize', this.handleLegacyResize);

			// Add input focus/blur event listeners as additional detection method
			this.setupInputListeners();
		}
	}

	/**
	 * Add listeners to form inputs to help detect keyboard visibility
	 */
	private setupInputListeners(): void {
		if(!this.win || !this.win.document) return;

		const inputs = this.win.document.querySelectorAll('input, textarea, [contenteditable]');

		// Convert to array to avoid TypeScript issues with NodeList
		for(const input of inputs) {
			input.addEventListener('focus', () => {
				// Short delay to ensure keyboard is fully visible
				setTimeout(() => this.updateStatus(), 300);
			});

			input.addEventListener('blur', () => {
				// Short delay to ensure keyboard is fully hidden
				setTimeout(() => this.updateStatus(), 300);
			});
		}
	}

	/**
	 * Handle viewport changes (modern API)
	 */
	private handleViewportChange = (): void => {
		this.updateStatus();
	};

	/**
	 * Handle resize events (legacy approach)
	 */
	private handleLegacyResize = (): void => {
		this.updateStatus();
	};

	/**
	 * Update the keyboard status based on viewport changes
	 */
	private updateStatus(): void {
		if(!this.win) return;

		let currentHeight: number;

		if(this.visualViewport) {
			currentHeight = this.visualViewport.height;
		} else {
			currentHeight = this.win.innerHeight || 0;
		}

		const heightDiff = this.initialHeight - currentHeight;

		// Use a threshold to determine if keyboard is open
		// This value may need adjustment based on device
		const threshold = this.initialHeight * 0.15; // 15% of screen height
		const isKeyboardOpen = heightDiff > threshold;
		if(isKeyboardOpen) {
			this.expectedKeyboardHeight = heightDiff;
		}

		const newStatus: KeyboardStatus = {
			isOpen: isKeyboardOpen,
			height: isKeyboardOpen ? heightDiff : 0
		};

		// Only update if there's a change
		if(newStatus.isOpen !== this._status.isOpen ||
			newStatus.height !== this._status.height) {
			this.hasSoftwareKeyboard = true;
			this._status = newStatus;
			this.notifyListeners();
		}
	}

	/**
	 * Get the current keyboard status
	 */
	public get status(): KeyboardStatus {
		return {...this._status};
	}

	/**
	 * Add a listener for keyboard status changes
	 */
	public addListener(callback: (status: KeyboardStatus) => void): void {
		this.listeners.push(callback);

		// Immediately notify with current status
		callback(this.status);
	}

	/**
	 * Remove a previously added listener
	 */
	public removeListener(callback: (status: KeyboardStatus) => void): void {
		this.listeners = this.listeners.filter(listener => listener !== callback);
	}

	/**
	 * Notify all listeners of status change
	 */
	private notifyListeners(): void {
		this.listeners.forEach(listener => {
			try {
				listener(this.status);
			} catch(e) {
				console.error('Error in keyboard status listener:', e);
			}
		});
	}

	/**
	 * Clean up all event listeners and references
	 */
	public destroy(): void {
		if(!this.win) return;

		if(this.visualViewport) {
			this.visualViewport.removeEventListener('resize', this.handleViewportChange);
			this.visualViewport.removeEventListener('scroll', this.handleViewportChange);
		} else {
			this.win.removeEventListener('resize', this.handleLegacyResize);
		}

		this.listeners = [];
		IosKeyboardManager.instance = null;
	}
}

// Create a safe export that works in any environment
let iosKeyboardManagerInstance: IosKeyboardManager | null = null;
try {
	iosKeyboardManagerInstance = IosKeyboardManager.getInstance();
} catch(e) {
	console.error('Failed to initialize keyboard manager:', e);
}

export const iosKeyboardManager = iosKeyboardManagerInstance;

/**
 * Helper function to check keyboard status from anywhere
 */
export function isIosKeyboardVisible(): boolean {
	return iosKeyboardManager ? iosKeyboardManager.status.isOpen : false;
}

/**
 * Helper function to get keyboard height
 */
export function getIosKeyboardHeight(): number {
	return iosKeyboardManager ? iosKeyboardManager.status.height : 0;
}


// Instance management for multiple editors
const editorInstances = new Map<string, VenusEditor>();

/**
 * Get an existing editor instance by ID (does not create)
 */
export function getEditorInstance(instanceId: string): VenusEditor | undefined {
	return editorInstances.get(instanceId);
}

/**
 * Remove an editor instance
 */
export function removeEditorInstance(instanceId: string): void {
	editorInstances.delete(instanceId);
}

/**
 * Get a specific editor instance by ID
 */
export function getEditor(instanceId: string): VenusEditor | undefined {
	return getEditorInstance(instanceId);
}

interface InstanceMethodInvocation {
	methodName: string;
	args?: any[];
}

/**
 * Call one or more methods on a specific editor instance with a single interop call.
 */
export async function callInstanceMethod(instanceId: string | null | undefined, batchCalls: InstanceMethodInvocation[] | null | undefined): Promise<any[]> {
	if(!instanceId) {
		throw new Error('instanceId is required for editor method calls');
	}

	if(!batchCalls || !Array.isArray(batchCalls)) {
		throw new Error('callInstanceMethod requires an array of method descriptors');
	}

	if(batchCalls.length === 0) {
		return [];
	}

	const results: any[] = [];
	let editor = getEditor(instanceId);

	for(const invocation of batchCalls) {
		const methodName = invocation.methodName;
		const invocationArgs = invocation.args ?? [];

		if(!editor) {
			if(methodName === 'initQuillEditor') {
				editor = new VenusEditor();
			} else {
				throw new Error(`No editor instance found for instanceId: ${instanceId} | method: ${methodName}`);
			}
		}

		const method = (editor as any)[methodName];
		if(typeof method !== 'function') {
			throw new Error(`Method ${methodName} not found on VenusEditor instance`);
		}

		const result = method.apply(editor, invocationArgs);
		if(result && typeof result.then === 'function') {
			results.push(await result);
		} else {
			results.push(result);
		}

		// Refresh reference in case the call updated the registry (e.g. init or dispose)
		editor = getEditor(instanceId);
	}

	return results;
}

function getScaleFactor(element: HTMLElement): number {
	const scaleContainer = element.closest('.attachments-and-note-section-scale-content') as HTMLElement | null;
	if(!scaleContainer) {
		return 1;
	}

	const rect = scaleContainer.getBoundingClientRect();
	const width = scaleContainer.offsetWidth;
	if(width === 0) {
		return 1;
	}

	const scale = rect.width / width;
	if(!Number.isFinite(scale) || scale <= 0) {
		return 1;
	}

	return scale;
}

// Shared MathJax typesetting for both the in-editor math blot and the MathDialog live preview.
// Legacy `\t` line-break sentinels (MarkdownParseUtilities.MathSourceNewlineChar) are migrated
// to ` \\ ` so legacy multi-line notes still render. Bare `\\` outside an environment is auto-
// wrapped in \displaylines{} because MathJax v3 does not treat bare `\\` as a line break;
// content that already uses an environment (\displaylines, \begin{...}) is passed through
// untouched to avoid nested wrapping.
function typesetMathIntoNode(node: HTMLElement, source: string): void {
	const normalized = source.replace(/\t/g, ' \\\\ ');
	const hasBackslashBreak = normalized.includes('\\\\');
	const hasEnvironment = normalized.includes('\\displaylines{') || normalized.includes('\\begin{');
	if(hasBackslashBreak && !hasEnvironment) {
		node.textContent = `\\(\\displaylines{${normalized}}\\)`;
	} else {
		node.textContent = `\\(${normalized}\\)`;
	}
	try {
		if(typeof MathJax !== 'undefined' && MathJax?.typesetPromise) {
			MathJax.typesetPromise([node]);
		}
	} catch {
		// Ignore MathJax typesetting errors during editing
	}
}

// Blazor-facing entry point used by MathDialog to render its live preview client-side,
// reusing the same MathJax typesetting path as the in-editor math blot.
export function renderMathPreview(elementId: string, source: string): void {
	if(!elementId) {
		return;
	}
	const node = document.getElementById(elementId);
	if(!node) {
		return;
	}
	typesetMathIntoNode(node, typeof source === 'string' ? source : '');
}

// Export QuillExtensions for use via JSInterop
export const quillExtensions = QuillExtensions;
