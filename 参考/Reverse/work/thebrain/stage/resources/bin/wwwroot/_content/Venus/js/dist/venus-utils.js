import "./electronFocus.js";
import { safeInvoke } from "./interop.js";
const PHONE_TOOLBAR_BOTTOM_TRANSITION_MS = 300;
class VenusUtils {
    constructor() {
        this.displayWidestIdPrefix = "";
        this.displayWidestParentId = "";
        this.displayWidestContainer = null;
        this.displayWidestCurrentElement = null;
        this.existenceDependencyManager = new ExistenceDependencyManager();
        this.toolbarDblHandlers = {};
        this.horizontalScrollHandlers = {};
        this.hintManagerInitialized = false;
        this.hoveredHintTargetId = null;
        this.visibleHintTargetId = null;
        this.pendingHintTimer = null;
        this.pendingHideTimer = null;
        this.lastHintHideTime = 0;
        this.hintElementId = 'venus-hint-bubble';
        this.hintElement = null;
        this.activeHintHideClasses = [];
        this.lastPointerPosition = null;
        this.textDecoder = typeof TextDecoder !== 'undefined' ? new TextDecoder() : null;
        this.isProgrammaticHint = false;
        this.hintRedirectCallback = null;
        this.hintRedirectHideCallback = null;
        this.HINT_POSITIONING_THRESHOLD = 80;
        this.HINT_DELAY_MS = 700;
        this.RECENT_HIDE_THRESHOLD_MS = 1000;
        this.resizeObservers = {};
        this.mutationObservers = {};
        this.appliedDynamicClasses = {};
        this._pendingPopup = null;
        this._iosSafariClickInterceptorInstalled = false;
        this.DRAWER_GESTURE = {
            ACTIVATION_PX: 15,
            HANDOFF_PX: 30,
            RESISTANCE_PX: 60,
            RESISTANCE_FACTOR: 0.3,
            GRACE_WINDOW_MS: 200,
            VELOCITY_SAMPLE_MS: 80,
            FLICK_VELOCITY: 1.6,
            TB_DRAG_DISTANCE: 220,
            TB_FLICK_MIN_DISTANCE: 60,
            LR_DRAG_DISTANCE: 130,
            LR_FLICK_MIN_DISTANCE: 40,
            CROSS_AXIS_DOMINANCE: 1.2,
            CROSS_AXIS_MIN_PX: 8,
            TAP_MAX_DISTANCE: 10,
        };
        this.drawerGestureState = 'Idle';
        this.drawerGestureStartX = 0;
        this.drawerGestureStartY = 0;
        this.drawerDragAnchorX = 0;
        this.drawerDragAnchorY = 0;
        this.drawerScrollable = null;
        this.drawerPointerSamples = [];
        this.drawerDidPreventScroll = false;
        this.drawerMaxFingerDistance = 0;
        this.drawerEdgeHandoffStartAxisDelta = null;
        this.drawerLastScrollActivityTime = 0;
        this.drawerScrollListener = null;
        this.drawerDotNetObjRef = null;
        this.handlersMap = new Map();
        this.popoverShowingCount = 0;
        this.pullUpState = 'Idle';
        this.pullUpStartX = 0;
        this.pullUpStartY = 0;
        this.pullUpTargetHeight = 0;
        this.pullUpPointerSamples = [];
        this.pullUpHandlersMap = new Map();
        this.pullUpDotNetObjRef = null;
        this.pullUpScrollable = null;
        this.pullDownState = 'Idle';
        this.pullDownStartX = 0;
        this.pullDownStartY = 0;
        this.pullDownTargetHeight = 0;
        this.pullDownPointerSamples = [];
        this.pullDownHandlersMap = new Map();
        this.pullDownDotNetObjRef = null;
        this.pullDownScrollable = null;
        this.searchDismissState = 'Idle';
        this.searchDismissStartX = 0;
        this.searchDismissStartY = 0;
        this.searchDismissTargetHeight = 0;
        this.searchDismissPointerSamples = [];
        this.searchDismissHandlersMap = new Map();
        this.searchDismissDotNetObjRef = null;
        this.searchDismissScrollable = null;
        this.keyboardSelectableGroups = [];
        this.keyboardSelectableElements = [];
        this.currentKeyboardGroupIndex = -1;
        this.currentKeyboardElementIndex = -1;
        this.keyboardNavKeyDownHandlerBound = this.keyboardNavKeyDownHandler.bind(this);
        this.keyboardNavEventListenersAttached = new Set();
        this.keyboardNavDotnetHelper = null;
        this.keyboardNavigationLockedToContainer = null;
        this.lastKeyboardSelectionTime = 0;
        this.menuKeyboardNavHandlers = new Map();
        this.venusProbeDotNetRef = null;
        this.tabBarStates = new Map();
        this.currentDragTabBarId = null;
        this.boundMouseMove = null;
        this.boundMouseUp = null;
        this.MIN_DRAG_DISTANCE = 5;
        this.observers = new Map();
        this.debounceTimeout = null;
        this.debounceDelay = 100;
        this.currentCallback = null;
        this.windowResizeListener = null;
        this.BG_DELTA_DARK = {
            bgApp: -0.09,
            surface1: -0.06,
            surface2: -0.03,
            surface3: 0,
            elevated1: 0.04,
            elevated2: 0.08,
            elevated3: 0.12,
            elevated4: 0.16,
            borderDefault: 0.10,
            borderStrong: 0.15,
            borderSubtle: 0.05,
            btnBgHover: 0.08,
            btnBgSelected: 0.04,
            scrollbarThumb: 0.20,
        };
        this.BG_DELTA_LIGHT = {
            bgApp: -0.06,
            surface1: -0.04,
            surface2: -0.02,
            surface3: 0,
            elevated1: 0.02,
            elevated2: 0.06,
            elevated3: 0.08,
            elevated4: 0.10,
            borderDefault: -0.08,
            borderStrong: -0.12,
            borderSubtle: -0.02,
            btnBgHover: -0.04,
            btnBgSelected: -0.01,
            scrollbarThumb: -0.18,
        };
        this.FG_DELTA_DARK = {
            primary: 0,
            secondary: -0.20,
            muted: -0.40,
            dim: -0.51,
            iconDefault: -0.40,
            iconHover: 0,
            iconDim: -0.51,
            scrollbarThumbHover: -0.20,
        };
        this.FG_DELTA_LIGHT = {
            primary: 0,
            secondary: 0.15,
            muted: 0.30,
            dim: 0.40,
            iconDefault: 0.30,
            iconHover: 0,
            iconDim: 0.40,
            scrollbarThumbHover: 0.15
        };
        this.DARK_BG_HEADROOM_MULTIPLIER = 2;
        this.LIGHT_BG_HEADROOM_MULTIPLIER = 0.5;
        this.ACHROMATIC_THRESHOLD = 0.001;
        this.BG_DELTAS = this.calculateBgDeltas();
        this.FG_DELTAS = this.calculateFgDeltas();
        this.overflowMaskState = new Map();
    }
    registerToolbarBackgroundDoubleClick(toolbarElementId, dotNetRef) {
        const el = document.getElementById(toolbarElementId);
        if (!el) {
            console.warn("registerToolbarBackgroundDoubleClick: element not found:", toolbarElementId);
            return;
        }
        const handler = (e) => {
            const target = e.target;
            if (!target) {
                return;
            }
            const interactiveSelector = [
                'button', '.toolbar-menu', '.toolbar-button', '.toolbar-button-mobile',
                '.btn-quiet', '.popup-window', '[role="menu"]', '[role="menuitem"]',
                '.ql-picker', '.ql-toolbar', 'input', 'select', 'textarea', 'label', 'i', 'svg', 'path',
                '[contenteditable]', '[contenteditable="true"]', '.editable', 'a', '[role="textbox"]'
            ].join(',');
            if (target.closest(interactiveSelector)) {
                return;
            }
            safeInvoke(dotNetRef, 'OnToolbarBackgroundDoubleClick');
        };
        this.toolbarDblHandlers[toolbarElementId] = handler;
        el.addEventListener('dblclick', handler);
    }
    unregisterToolbarBackgroundDoubleClick(toolbarElementId) {
        const el = document.getElementById(toolbarElementId);
        const handler = this.toolbarDblHandlers[toolbarElementId];
        if (el && handler) {
            el.removeEventListener('dblclick', handler);
        }
        delete this.toolbarDblHandlers[toolbarElementId];
    }
    preventHorizontalScroll(elementId) {
        const el = document.getElementById(elementId);
        if (!el) {
            return;
        }
        if (this.horizontalScrollHandlers[elementId]) {
            el.removeEventListener('scroll', this.horizontalScrollHandlers[elementId]);
        }
        const handler = () => {
            if (el.scrollLeft !== 0) {
                el.scrollLeft = 0;
            }
        };
        this.horizontalScrollHandlers[elementId] = handler;
        el.addEventListener('scroll', handler);
        if (el.scrollLeft !== 0) {
            el.scrollLeft = 0;
        }
    }
    removePreventHorizontalScroll(elementId) {
        const el = document.getElementById(elementId);
        const handler = this.horizontalScrollHandlers[elementId];
        if (el && handler) {
            el.removeEventListener('scroll', handler);
        }
        delete this.horizontalScrollHandlers[elementId];
    }
    initDisplayWidestOf(idPrefix, parentId) {
        this.displayWidestIdPrefix = idPrefix;
        this.displayWidestParentId = parentId;
        this.displayWidestContainer = document.getElementById(this.displayWidestParentId);
        this.displayWidestOf();
        window.addEventListener("resize", (e) => {
            this.displayWidestOf();
        });
    }
    getTimeZoneOffset() {
        return new Date().getTimezoneOffset();
    }
    displayWidestOf() {
        if (this.displayWidestContainer) {
            if (this.displayWidestCurrentElement) {
                this.displayWidestCurrentElement.style.display = "none";
            }
            let containerWidth = this.displayWidestContainer.clientWidth;
            let maxWidth = 0;
            let minWidth = Number.MAX_VALUE;
            let widestElement = null;
            let narrowestElement = null;
            for (let i = 0; true; i++) {
                let element = document.getElementById(this.displayWidestIdPrefix + i);
                if (!element) {
                    break;
                }
                element.style.display = "inline-flex";
                let width = element.clientWidth;
                element.style.display = "none";
                if (width < minWidth) {
                    minWidth = width;
                    narrowestElement = element;
                }
                if (width <= containerWidth && width > maxWidth) {
                    maxWidth = width;
                    widestElement = element;
                }
            }
            if (widestElement) {
                widestElement.style.display = "inline-flex";
                this.displayWidestCurrentElement = widestElement;
            }
            else if (narrowestElement) {
                narrowestElement.style.display = "inline-flex";
                this.displayWidestCurrentElement = narrowestElement;
            }
        }
    }
    async downloadFileFromStream(fileName, contentStreamReference) {
        const arrayBuffer = await contentStreamReference.arrayBuffer();
        const blob = new Blob([arrayBuffer]);
        const url = URL.createObjectURL(blob);
        const anchorElement = document.createElement('a');
        anchorElement.href = url;
        anchorElement.download = fileName !== null && fileName !== void 0 ? fileName : '';
        anchorElement.click();
        anchorElement.remove();
        URL.revokeObjectURL(url);
    }
    positionElementToCoverEverything(destElementId) {
        var destElement = document.getElementById(destElementId);
        if (destElement == null) {
            console.log("positionElementToCoverEverything: Unable to find `" + destElementId + "`.");
            return;
        }
        this.placeElementAnchorPoint(destElementId, AnchorPoint.TopLeft, 0, 0, 0, 0, false, false);
        destElement.style.width = "100vw";
        destElement.style.height = "100vh";
    }
    alignElementAnchorPoints(sourceElementId, destElementId, sourcePoint, destPoint, offsetX, offsetY, isRootable, useBottomSafeZone) {
        var sourceElement = document.getElementById(sourceElementId);
        if (sourceElement == null) {
            console.log("alignElementCorners: Unable to find `" + sourceElementId + "`.");
            return;
        }
        const vv = window.visualViewport;
        const destElement = document.getElementById(destElementId);
        if (vv && destElement && !destElement.dataset.vvAlignWatching) {
            destElement.dataset.vvAlignWatching = "1";
            let pendingTimeout = null;
            const reAlign = () => {
                const stillThere = document.getElementById(destElementId);
                if (!stillThere || !document.body.contains(stillThere)) {
                    return false;
                }
                stillThere.style.maxHeight = "";
                this.alignElementAnchorPoints(sourceElementId, destElementId, sourcePoint, destPoint, offsetX, offsetY, isRootable, useBottomSafeZone);
                return true;
            };
            const handler = () => {
                if (!reAlign()) {
                    vv.removeEventListener("resize", handler);
                    vv.removeEventListener("scroll", handler);
                    if (pendingTimeout != null) {
                        clearTimeout(pendingTimeout);
                        pendingTimeout = null;
                    }
                    return;
                }
                if (pendingTimeout != null) {
                    clearTimeout(pendingTimeout);
                }
                pendingTimeout = window.setTimeout(() => {
                    pendingTimeout = null;
                    reAlign();
                }, PHONE_TOOLBAR_BOTTOM_TRANSITION_MS + 50);
            };
            vv.addEventListener("resize", handler);
            vv.addEventListener("scroll", handler);
        }
        if (isRootable) {
            this.putElementUnderContentRoot(destElementId);
        }
        const sourceRect = sourceElement.getBoundingClientRect();
        let sourceX = 0, sourceY = 0;
        switch (sourcePoint) {
            case AnchorPoint.TopLeft:
                sourceX = sourceRect.left;
                sourceY = sourceRect.top;
                break;
            case AnchorPoint.TopRight:
                sourceX = sourceRect.right;
                sourceY = sourceRect.top;
                break;
            case AnchorPoint.BottomLeft:
                sourceX = sourceRect.left;
                sourceY = sourceRect.bottom;
                break;
            case AnchorPoint.BottomRight:
                sourceX = sourceRect.right;
                sourceY = sourceRect.bottom;
                break;
            case AnchorPoint.Left:
                sourceX = sourceRect.left;
                sourceY = sourceRect.top + sourceRect.height * 0.5;
                break;
            case AnchorPoint.Top:
                sourceX = sourceRect.left + sourceRect.width * 0.5;
                sourceY = sourceRect.top;
                break;
            case AnchorPoint.Right:
                sourceX = sourceRect.right;
                sourceY = sourceRect.top + sourceRect.height * 0.5;
                break;
            case AnchorPoint.Bottom:
                sourceX = sourceRect.left + sourceRect.width * 0.5;
                sourceY = sourceRect.bottom;
                break;
            case AnchorPoint.Center:
                sourceX = sourceRect.left + sourceRect.width * 0.5;
                sourceY = sourceRect.top + sourceRect.height * 0.5;
                break;
        }
        this.placeElementAnchorPoint(destElementId, destPoint, sourceX, sourceY, offsetX, offsetY, isRootable, useBottomSafeZone);
    }
    matchMenuWidthToButton(buttonElementId, menuElementId) {
        var buttonElement = document.getElementById(buttonElementId);
        var menuElement = document.getElementById(menuElementId);
        if (buttonElement == null || menuElement == null) {
            return;
        }
        const buttonRect = buttonElement.getBoundingClientRect();
        menuElement.style.width = `${buttonRect.width}px`;
    }
    alignColorPickerToButton(pickerId, buttonLabel) {
        const button = document.querySelector(`button[aria-label="${buttonLabel}"]`);
        if (!button) {
            console.log(`alignColorPickerToButton: Unable to find button with aria-label "${buttonLabel}".`);
            return;
        }
        let buttonId = button.id;
        if (!buttonId) {
            buttonId = `toolbar-button-${Math.random().toString(36).substr(2, 9)}`;
            button.id = buttonId;
        }
        this.alignElementAnchorPoints(buttonId, pickerId, AnchorPoint.BottomLeft, AnchorPoint.TopLeft, 0, 4, true, true);
    }
    putElementUnderContentRoot(destElementId) {
        var destElement = document.getElementById(destElementId);
        if (destElement == null) {
            console.log("putElementUnderContentRoot: Unable to find `" + destElementId + "`.");
            return;
        }
        let newParent = document.getElementById("content");
        if (newParent == null) {
            console.log("putElementUnderContentRoot: Unable to find `content` div.");
            return;
        }
        if (destElement.parentElement === newParent) {
            return;
        }
        destElement.remove();
        newParent.appendChild(destElement);
    }
    resetElementOffsets(destElementId) {
        var element = document.getElementById(destElementId);
        if (element == null) {
            console.log("resetELementOffsets: Unable to find `" + destElementId + "`.");
            return;
        }
        element.style.left = element.style.right = element.style.top = element.style.bottom = "";
    }
    placeElementAnchorPoint(destElementId, destPoint, sourceX, sourceY, offsetX, offsetY, isRootable, useBottomSafeZone, skipKeepOnScreen = false) {
        if (isRootable) {
            this.putElementUnderContentRoot(destElementId);
        }
        var destElement = document.getElementById(destElementId);
        if (destElement == null) {
            console.log("putElementUnderContentRoot: Unable to find `" + destElementId + "`.");
            return;
        }
        const destRect = destElement.getBoundingClientRect();
        let destX = 0;
        let destY = 0;
        switch (destPoint) {
            case AnchorPoint.TopLeft:
                destX = sourceX;
                destY = sourceY;
                break;
            case AnchorPoint.TopRight:
                destX = sourceX - destRect.width;
                destY = sourceY;
                break;
            case AnchorPoint.BottomLeft:
                destX = sourceX;
                destY = sourceY - destRect.height;
                break;
            case AnchorPoint.BottomRight:
                destX = sourceX - destRect.width;
                destY = sourceY - destRect.height;
                break;
            case AnchorPoint.Left:
                destX = sourceX;
                destY = sourceY - destRect.height * 0.5;
                break;
            case AnchorPoint.Top:
                destX = sourceX - destRect.width * 0.5;
                destY = sourceY;
                break;
            case AnchorPoint.Right:
                destX = sourceX - destRect.width;
                destY = sourceY - destRect.height * 0.5;
                break;
            case AnchorPoint.Bottom:
                destX = sourceX - destRect.width * 0.5;
                destY = sourceY - destRect.height;
                break;
            case AnchorPoint.Center:
                destX = sourceX - destRect.width * 0.5;
                destY = sourceY - destRect.height * 0.5;
                break;
        }
        destX += offsetX;
        destY += offsetY;
        const vv = window.visualViewport;
        if (vv) {
            destX += vv.offsetLeft;
            destY += vv.offsetTop;
        }
        if (isRootable) {
            destElement.style.position = 'fixed';
            destElement.style.left = `${destX}px`;
            destElement.style.top = `${destY}px`;
            if (!destElement.hasAttribute('data-skip-keep-on-screen')) {
                if (!skipKeepOnScreen) {
                    this.keepOnScreen(destElementId, useBottomSafeZone);
                }
                destElement.style.opacity = "100";
                destElement.style.visibility = "visible";
            }
        }
        else {
            let deltaX = destX - destRect.x;
            let deltaY = destY - destRect.y;
            this.moveElement(destElement, deltaX, deltaY);
        }
    }
    getNumFromPx(numPx) {
        if (!numPx) {
            return 0;
        }
        if (numPx.endsWith("px")) {
            return +numPx.substring(0, numPx.length - 2);
        }
        else if (numPx.endsWith("rem")) {
            let remSize = this.getNumFromPx(getComputedStyle(document.documentElement).fontSize);
            let rems = +numPx.substring(0, numPx.length - 3);
            return rems * remSize;
        }
        return 0;
    }
    disableShiftClick(elementId) {
        let el = document.getElementById(elementId);
        if (el != null) {
            el.addEventListener('mousedown', function (e) {
                if (e.shiftKey) {
                    e.preventDefault();
                }
            });
        }
    }
    setupDraggableElementWithHandle(elementId, handleId) {
        const draggableElement = document.getElementById(elementId);
        const gripElement = document.getElementById(handleId);
        if (!draggableElement || !gripElement) {
            return;
        }
        const startDrag = (clientX, clientY) => {
            const initialMouseX = clientX;
            const initialMouseY = clientY;
            const initialElementX = this.getNumFromPx(getComputedStyle(draggableElement).left);
            const initialElementY = this.getNumFromPx(getComputedStyle(draggableElement).top);
            draggableElement.dataset.isDragging = "true";
            const moveHandler = (moveClientX, moveClientY) => {
                const deltaX = moveClientX - initialMouseX;
                const deltaY = moveClientY - initialMouseY;
                draggableElement.style.left = `${initialElementX + deltaX}px`;
                draggableElement.style.top = `${initialElementY + deltaY}px`;
            };
            const mouseMoveHandler = (e) => {
                moveHandler(e.clientX, e.clientY);
            };
            const touchMoveHandler = (e) => {
                if (e.touches.length > 0) {
                    moveHandler(e.touches[0].clientX, e.touches[0].clientY);
                }
            };
            const endDrag = () => {
                draggableElement.dataset.isDragging = "false";
                document.removeEventListener('mousemove', mouseMoveHandler);
                document.removeEventListener('mouseup', endDrag);
                document.removeEventListener('touchmove', touchMoveHandler);
                document.removeEventListener('touchend', endDrag);
            };
            document.addEventListener('mousemove', mouseMoveHandler);
            document.addEventListener('mouseup', endDrag);
            document.addEventListener('touchmove', touchMoveHandler);
            document.addEventListener('touchend', endDrag);
        };
        gripElement.addEventListener('mousedown', (e) => {
            e.preventDefault();
            startDrag(e.clientX, e.clientY);
        });
        gripElement.addEventListener('touchstart', (e) => {
            if (e.touches.length > 0) {
                const touch = e.touches[0];
                const startX = touch.clientX;
                const startY = touch.clientY;
                const startTime = Date.now();
                let hasMoved = false;
                const touchMoveHandler = (moveEvent) => {
                    if (moveEvent.touches.length > 0) {
                        const moveTouch = moveEvent.touches[0];
                        const deltaX = Math.abs(moveTouch.clientX - startX);
                        const deltaY = Math.abs(moveTouch.clientY - startY);
                        if (deltaX > 10 || deltaY > 10) {
                            hasMoved = true;
                            e.preventDefault();
                            document.removeEventListener('touchmove', touchMoveHandler);
                            document.removeEventListener('touchend', touchEndHandler);
                            startDrag(startX, startY);
                        }
                    }
                };
                const touchEndHandler = (endEvent) => {
                    document.removeEventListener('touchmove', touchMoveHandler);
                    document.removeEventListener('touchend', touchEndHandler);
                    if (!hasMoved && (Date.now() - startTime) < 500) {
                        return;
                    }
                };
                document.addEventListener('touchmove', touchMoveHandler, { passive: true });
                document.addEventListener('touchend', touchEndHandler);
            }
        });
    }
    setupFolderUploadElement(elementId, dotNetHelper) {
        let folderUploadElement = document.getElementById(elementId);
        if (folderUploadElement != null) {
            folderUploadElement.addEventListener("change", (event) => {
                let names = [];
                let types = [];
                let sizes = [];
                let relativePaths = [];
                let lastModifiedTimes = [];
                let files = event.target.files;
                if (files != null) {
                    for (const file of Array.from(files)) {
                        names.push(file.name);
                        types.push(file.type);
                        sizes.push(file.size);
                        relativePaths.push(file.webkitRelativePath);
                        lastModifiedTimes.push(file.lastModified);
                    }
                }
                safeInvoke(dotNetHelper, "CallbackOnFolderUploadAsync", [names, types, sizes, relativePaths, lastModifiedTimes]);
            }, false);
        }
    }
    keepOnScreen(elementId, useBottomSafeZone) {
        let element = document.getElementById(elementId);
        if (!element) {
            return;
        }
        const vv = window.visualViewport;
        let bottomSafeMargin = 1;
        if (useBottomSafeZone) {
            bottomSafeMargin = vv ? 3 : 50;
        }
        let originalRect = element.getBoundingClientRect();
        let topSafeMargin = 1;
        let safeTop = (vv ? vv.offsetTop : 0) + topSafeMargin;
        let safeBottom = (vv ? vv.offsetTop + vv.height : document.documentElement.clientHeight) - bottomSafeMargin;
        let safeLeft = vv ? vv.offsetLeft : 0;
        let safeRight = (vv ? vv.offsetLeft + vv.width : document.documentElement.clientWidth) - 1;
        let safeHeight = safeBottom - safeTop;
        let xOffset = 0;
        let yOffset = 0;
        if (originalRect.right > safeRight) {
            xOffset = safeRight - originalRect.right;
        }
        if (originalRect.left < safeLeft) {
            xOffset = safeLeft - originalRect.left;
        }
        if (originalRect.height > safeHeight) {
            element.style.maxHeight = `${safeHeight}px`;
            let topOverflows = originalRect.top < safeTop;
            let bottomOverflows = originalRect.bottom > safeBottom;
            if (topOverflows && !bottomOverflows) {
                let heightLoss = originalRect.height - safeHeight;
                yOffset = heightLoss;
                let projectedTop = originalRect.top + yOffset;
                if (projectedTop < safeTop) {
                    yOffset += safeTop - projectedTop;
                }
            }
            else if (bottomOverflows && !topOverflows) {
                yOffset = 0;
            }
            else {
                yOffset = safeTop - originalRect.top;
            }
        }
        else {
            if (originalRect.bottom > safeBottom) {
                yOffset = safeBottom - originalRect.bottom;
            }
            if (originalRect.top < safeTop) {
                yOffset = safeTop - originalRect.top;
            }
        }
        this.moveElement(element, xOffset, yOffset);
    }
    clampMaxHeightToVisibleViewport(elementId, topAnchorElementId) {
        let element = document.getElementById(elementId);
        if (!element) {
            return;
        }
        element.style.maxHeight = '';
        let rect = element.getBoundingClientRect();
        const vv = window.visualViewport;
        let safeTop = vv ? vv.offsetTop : 0;
        if (topAnchorElementId) {
            let anchor = document.getElementById(topAnchorElementId);
            if (anchor) {
                let anchorBottom = anchor.getBoundingClientRect().bottom;
                if (anchorBottom > safeTop) {
                    safeTop = anchorBottom;
                }
            }
        }
        safeTop += 1;
        if (rect.top < safeTop) {
            let availableHeight = rect.bottom - safeTop;
            if (availableHeight > 0) {
                element.style.maxHeight = `${availableHeight}px`;
            }
        }
    }
    positionSubmenu(elementId, useBottomSafeZone) {
        let element = document.getElementById(elementId);
        if (!element) {
            return;
        }
        const parentWidthStr = element.getAttribute('data-parent-width');
        const parentWidth = parentWidthStr ? this.getNumFromPx(parentWidthStr) : 256;
        const parentContainer = element.parentElement;
        if (!parentContainer) {
            return;
        }
        const vv = window.visualViewport;
        let bottomSafeMargin = 1;
        if (useBottomSafeZone) {
            bottomSafeMargin = vv ? 3 : 50;
        }
        let safeHeight = document.documentElement.clientHeight - bottomSafeMargin;
        if (vv) {
            safeHeight -= vv.offsetTop;
        }
        const viewportWidth = document.documentElement.clientWidth - 1;
        const viewPortRect = new DOMRect(0, 0, viewportWidth, safeHeight);
        const parentRect = parentContainer.getBoundingClientRect();
        element.style.left = parentWidth + "px";
        element.style.right = "auto";
        const submenuRect = element.getBoundingClientRect();
        const submenuWidth = submenuRect.width;
        const spaceToRight = viewportWidth - parentRect.right;
        const spaceToLeft = parentRect.left;
        let positionRight = true;
        if (spaceToRight < submenuWidth && spaceToLeft > submenuWidth) {
            positionRight = false;
        }
        else if (spaceToRight < submenuWidth && spaceToLeft < submenuWidth) {
            positionRight = spaceToRight > spaceToLeft;
        }
        if (positionRight) {
            element.style.left = parentWidth + "px";
            element.style.right = "auto";
        }
        else {
            element.style.left = "auto";
            element.style.right = parentWidth + "px";
        }
        this.keepOnScreen(elementId, useBottomSafeZone);
    }
    moveElement(element, xOffset, yOffset) {
        let computedStyle = window.getComputedStyle(element);
        if (computedStyle.position === "static") {
            element = element.parentElement;
            computedStyle = window.getComputedStyle(element);
            if (computedStyle.position === "static") {
                throw new Error("Item cannot be moved because is its position and its parent position is static: " + element.id);
            }
        }
        if (Math.abs(xOffset) > 0.5) {
            if (element.style.right) {
                element.style.right = (this.getNumFromPx(element.style.right) - xOffset) + "px";
            }
            else {
                element.style.left = (this.getNumFromPx(element.style.left) + xOffset) + "px";
            }
        }
        if (Math.abs(yOffset) > 0.5) {
            if (element.style.bottom) {
                element.style.bottom = (this.getNumFromPx(element.style.bottom) - yOffset) + "px";
            }
            else {
                element.style.top = (this.getNumFromPx(element.style.top) + yOffset) + "px";
            }
        }
    }
    calculateHintDimensions(contentElement, options) {
        var _a;
        const textWidth = this.measureUnwrappedWidth(contentElement);
        const contentPadding = 16;
        const minBubbleWidth = 40;
        const bubbleHeight = 24;
        const requiredWidth = Math.max(textWidth + contentPadding, minBubbleWidth);
        let maxWidth = (_a = options === null || options === void 0 ? void 0 : options.maxWidth) !== null && _a !== void 0 ? _a : window.innerWidth * 0.33;
        maxWidth = Math.max(maxWidth, 100);
        const bubbleWidth = Math.min(requiredWidth, maxWidth);
        const curveRadius = 6;
        const tailBaseWidth = 16;
        const tailLength = 10;
        const strokePadding = 2;
        const totalHeight = bubbleHeight + tailLength;
        return {
            textWidth,
            bubbleWidth,
            bubbleHeight,
            totalHeight,
            curveRadius,
            tailBaseWidth,
            tailLength,
            strokePadding
        };
    }
    applyHintBubbleGeometry(bubble, dims, direction, tailPosition) {
        const { bubbleWidth, bubbleHeight, totalHeight, curveRadius, tailBaseWidth, tailLength, strokePadding } = dims;
        bubble.style.width = `${bubbleWidth + strokePadding * 2}px`;
        bubble.style.height = `${totalHeight + strokePadding * 2}px`;
        if (direction === 'up') {
            bubble.classList.remove('show-above');
        }
        else {
            bubble.classList.add('show-above');
        }
        const pathData = this.generateSpeechBubbleSVG(strokePadding, strokePadding, bubbleWidth, bubbleHeight, direction, curveRadius, tailBaseWidth, tailLength, tailPosition);
        const svgPath = bubble.querySelector('.speech-bubble-path');
        if (svgPath) {
            svgPath.setAttribute('d', pathData);
        }
        const svg = bubble.querySelector('.speech-bubble-svg');
        if (svg) {
            svg.setAttribute('viewBox', `0 0 ${bubbleWidth + strokePadding * 2} ${totalHeight + strokePadding * 2}`);
        }
    }
    processHintDecorator(contentId, elementId, showBelow, maxWidth) {
        let element = document.getElementById(elementId);
        if (element == null) {
            return;
        }
        let contentElement = element.querySelector('.speech-bubble-content');
        if (!contentElement) {
            return;
        }
        const dims = this.calculateHintDimensions(contentElement, maxWidth ? { maxWidth } : undefined);
        const direction = showBelow ? 'up' : 'down';
        element.style.width = `${dims.bubbleWidth + dims.strokePadding * 2}px`;
        element.style.height = `${dims.totalHeight + dims.strokePadding * 2}px`;
        this.putElementUnderContentRoot(elementId);
        if (showBelow) {
            element.classList.remove('show-above');
            this.alignElementAnchorPoints(contentId, elementId, AnchorPoint.Bottom, AnchorPoint.Top, 0, 0, true, false);
        }
        else {
            element.classList.add('show-above');
            this.alignElementAnchorPoints(contentId, elementId, AnchorPoint.Top, AnchorPoint.Bottom, 0, 0, true, false);
        }
        this.keepOnScreen(elementId, false);
        const targetElement = document.getElementById(contentId);
        if (!targetElement) {
            return;
        }
        const contentRect = targetElement.getBoundingClientRect();
        const bubbleRect = element.getBoundingClientRect();
        const contentCenterX = contentRect.left + contentRect.width / 2;
        const bubbleLeft = bubbleRect.left;
        const relativeX = contentCenterX - bubbleLeft - dims.strokePadding;
        const tailPosition = Math.max(dims.tailBaseWidth / 2, Math.min(dims.bubbleWidth - dims.tailBaseWidth / 2, relativeX));
        this.applyHintBubbleGeometry(element, dims, direction, tailPosition);
    }
    generateSpeechBubbleSVG(x, y, width, height, direction, curveRadius, tailBaseWidth, tailLength, tailPosition) {
        const snapToHalfPixel = (coord) => Math.floor(coord) + 0.5;
        const bubbleX = x;
        const bubbleY = y;
        const bubbleWidth = width;
        const bubbleHeight = height + tailLength;
        const maxRadius = Math.min(width, height) / 2;
        const radius = Math.min(curveRadius, maxRadius);
        const rectLeft = snapToHalfPixel(bubbleX);
        const rectRight = snapToHalfPixel(bubbleX + width);
        const minTailX = rectLeft + tailBaseWidth / 2;
        const maxTailX = rectRight - tailBaseWidth / 2;
        const clampedTailX = Math.max(minTailX, Math.min(maxTailX, bubbleX + tailPosition));
        const tailCenterX = snapToHalfPixel(clampedTailX);
        const tailLeftX = snapToHalfPixel(tailCenterX - tailBaseWidth / 2);
        const tailRightX = snapToHalfPixel(tailCenterX + tailBaseWidth / 2);
        let pathData = "";
        if (direction === "up") {
            const rectTop = snapToHalfPixel(bubbleY + tailLength);
            const rectBottom = rectTop + height;
            const tailTipY = snapToHalfPixel(bubbleY);
            pathData = `M${rectLeft + radius},${rectTop}`;
            if (tailLeftX > rectLeft + radius) {
                pathData += `L${tailLeftX},${rectTop}`;
            }
            pathData += `L${tailCenterX},${tailTipY}L${tailRightX},${rectTop}`;
            if (tailRightX < rectRight - radius) {
                pathData += `L${rectRight - radius},${rectTop}`;
            }
            pathData += `Q${rectRight},${rectTop} ${rectRight},${rectTop + radius}`;
            pathData += `L${rectRight},${rectBottom - radius}`;
            pathData += `Q${rectRight},${rectBottom} ${rectRight - radius},${rectBottom}`;
            pathData += `L${rectLeft + radius},${rectBottom}`;
            pathData += `Q${rectLeft},${rectBottom} ${rectLeft},${rectBottom - radius}`;
            pathData += `L${rectLeft},${rectTop + radius}`;
            pathData += `Q${rectLeft},${rectTop} ${rectLeft + radius},${rectTop}Z`;
        }
        else {
            const rectTop = snapToHalfPixel(bubbleY);
            const rectBottom = rectTop + height;
            const tailTipY = snapToHalfPixel(bubbleY + height + tailLength);
            pathData = `M${rectLeft + radius},${rectTop}`;
            pathData += `L${rectRight - radius},${rectTop}`;
            pathData += `Q${rectRight},${rectTop} ${rectRight},${rectTop + radius}`;
            pathData += `L${rectRight},${rectBottom - radius}`;
            pathData += `Q${rectRight},${rectBottom} ${rectRight - radius},${rectBottom}`;
            if (tailRightX < rectRight - radius) {
                pathData += `L${tailRightX},${rectBottom}`;
            }
            pathData += `L${tailCenterX},${tailTipY}L${tailLeftX},${rectBottom}`;
            if (tailLeftX > rectLeft + radius) {
                pathData += `L${rectLeft + radius},${rectBottom}`;
            }
            pathData += `Q${rectLeft},${rectBottom} ${rectLeft},${rectBottom - radius}`;
            pathData += `L${rectLeft},${rectTop + radius}`;
            pathData += `Q${rectLeft},${rectTop} ${rectLeft + radius},${rectTop}Z`;
        }
        return pathData;
    }
    measureUnwrappedWidth(element) {
        const clone = element.cloneNode(true);
        clone.style.position = 'absolute';
        clone.style.whiteSpace = 'nowrap';
        clone.style.width = 'auto';
        clone.style.maxWidth = 'none';
        clone.style.minWidth = '0';
        clone.style.left = 'auto';
        clone.style.right = 'auto';
        clone.style.visibility = 'hidden';
        clone.style.display = 'inline';
        document.body.appendChild(clone);
        const width = clone.scrollWidth;
        document.body.removeChild(clone);
        return width;
    }
    setHintRedirectMode(showCallback, hideCallback) {
        this.hintRedirectCallback = showCallback;
        this.hintRedirectHideCallback = hideCallback;
    }
    clearHintRedirectMode() {
        this.hintRedirectCallback = null;
        this.hintRedirectHideCallback = null;
    }
    setHintRedirectModeFromDotNet(dotNetRef) {
        this.setHintRedirectMode((targetId, text, x, y) => {
            safeInvoke(dotNetRef, 'OnHintRedirect', [targetId, text, x, y]);
        }, () => {
            safeInvoke(dotNetRef, 'OnHintHide');
        });
    }
    registerHintDecoratorTarget(elementId) {
        this.ensureHintDecoratorManagerInitialized();
        if (this.visibleHintTargetId === elementId) {
            this.showHintForTarget(elementId);
        }
    }
    unregisterHintDecoratorTarget(elementId) {
        if (this.hoveredHintTargetId === elementId) {
            this.hoveredHintTargetId = null;
            this.clearPendingHintTimer();
        }
        if (this.visibleHintTargetId === elementId) {
            this.hideHintElement();
        }
        this.reevaluateHintTargetFromPointer();
    }
    ensureHintDecoratorManagerInitialized() {
        if (this.hintManagerInitialized) {
            return;
        }
        this.hintManagerInitialized = true;
        document.addEventListener('pointermove', (event) => this.handleHintPointerMove(event), true);
        document.addEventListener('pointerleave', (event) => this.handleHintPointerLeave(event), true);
        document.addEventListener('pointerdown', (event) => this.handleHintPointerDown(event), true);
    }
    handleHintPointerMove(event) {
        if (event.pointerType === 'touch') {
            return;
        }
        this.lastPointerPosition = { x: event.clientX, y: event.clientY };
        const target = this.findHintTargetAtPosition(event.clientX, event.clientY);
        this.updateHoveredHintTarget(target);
    }
    handleHintPointerLeave(event) {
        if (event.pointerType === 'touch') {
            return;
        }
        this.lastPointerPosition = null;
        this.updateHoveredHintTarget(null);
    }
    handleHintPointerDown(event) {
        if (event.pointerType === 'touch') {
            return;
        }
        this.hideVisibleHintElements();
    }
    updateHoveredHintTarget(target) {
        var _a;
        const targetId = (_a = target === null || target === void 0 ? void 0 : target.id) !== null && _a !== void 0 ? _a : null;
        if (this.hoveredHintTargetId === targetId) {
            return;
        }
        this.hoveredHintTargetId = targetId;
        this.clearPendingHintTimer();
        if (targetId == null) {
            if (this.visibleHintTargetId != null) {
                this.hideHintElement();
            }
            return;
        }
        if (this.visibleHintTargetId && this.visibleHintTargetId !== targetId) {
            this.hideHintElement();
        }
        this.scheduleHintDisplay(targetId);
    }
    scheduleHintDisplay(targetId) {
        if (this.shouldShowHintImmediately()) {
            this.showHintForTarget(targetId);
            return;
        }
        this.pendingHintTimer = window.setTimeout(() => {
            this.pendingHintTimer = null;
            if (this.hoveredHintTargetId === targetId) {
                this.showHintForTarget(targetId);
            }
        }, this.HINT_DELAY_MS);
    }
    clearPendingHintTimer() {
        if (this.pendingHintTimer != null) {
            clearTimeout(this.pendingHintTimer);
            this.pendingHintTimer = null;
        }
    }
    clearPendingHideTimer() {
        if (this.pendingHideTimer != null) {
            clearTimeout(this.pendingHideTimer);
            this.pendingHideTimer = null;
        }
    }
    clearAllHintTimers() {
        this.clearPendingHintTimer();
        this.clearPendingHideTimer();
    }
    shouldShowHintImmediately() {
        if (this.visibleHintTargetId != null) {
            return true;
        }
        const timeSinceHide = Date.now() - this.lastHintHideTime;
        return timeSinceHide < this.RECENT_HIDE_THRESHOLD_MS;
    }
    showHintForTarget(targetId) {
        var _a;
        const targetElement = document.getElementById(targetId);
        if (!targetElement) {
            return;
        }
        const dataset = targetElement.dataset;
        if (dataset.hintEnabled !== 'true') {
            return;
        }
        if (this.hintRedirectCallback) {
            const rect = targetElement.getBoundingClientRect();
            const text = dataset.hintText ? this.decodeHintText(dataset.hintText) : '';
            const x = rect.left + rect.width / 2;
            const y = rect.bottom;
            this.hintRedirectCallback(targetId, text, x, y);
            this.visibleHintTargetId = targetId;
            return;
        }
        const bubble = this.getOrCreateHintElement();
        this.applyHintHideClasses(bubble, dataset.hintHideClasses);
        this.applyHintContent(bubble, (_a = dataset.hintText) !== null && _a !== void 0 ? _a : '', dataset.hintCenterText !== 'false');
        if (dataset.hintSizing) {
            bubble.setAttribute('data-sizing', dataset.hintSizing);
            if (dataset.hintDynamicTarget) {
                this.setupDynamicSizingClassesInternal(dataset.hintDynamicTarget, bubble.id);
            }
        }
        else {
            bubble.removeAttribute('data-sizing');
            this.cleanupDynamicSizingClasses(bubble.id);
        }
        this.clearPendingHideTimer();
        const preferBelow = dataset.hintForceBelow === 'true';
        const showBelow = preferBelow || (targetElement.getBoundingClientRect().top < this.HINT_POSITIONING_THRESHOLD);
        bubble.classList.remove('hidden');
        bubble.style.opacity = '0';
        this.processHintDecorator(targetId, bubble.id, showBelow);
        requestAnimationFrame(() => {
            bubble.style.opacity = '1';
        });
        this.visibleHintTargetId = targetId;
        this.isProgrammaticHint = false;
    }
    getOrCreateHintElement() {
        if (this.hintElement) {
            return this.hintElement;
        }
        const element = document.createElement('div');
        element.id = this.hintElementId;
        element.className = 'absolute transition-opacity duration-200 opacity-0 hidden pointer-events-none speech-bubble';
        element.style.zIndex = '9999';
        element.innerHTML = `
			<svg class="speech-bubble-svg drop-shadow-[0_6px_12px_rgb(var(--vapp-shadow-elevated))]" viewBox="0 0 100 42" preserveAspectRatio="none">
				<path class="speech-bubble-path" d="" />
			</svg>
			<div class="speech-bubble-content text-xs pointer-events-none"></div>
		`;
        document.body.appendChild(element);
        this.hintElement = element;
        return element;
    }
    applyHintContent(bubble, encodedText, centerText) {
        const contentElement = bubble.querySelector('.speech-bubble-content');
        if (!contentElement) {
            return;
        }
        contentElement.innerHTML = encodedText ? this.decodeHintText(encodedText) : '';
        if (centerText) {
            contentElement.classList.add('text-center');
        }
        else {
            contentElement.classList.remove('text-center');
        }
    }
    decodeHintText(encodedText) {
        try {
            const binary = atob(encodedText);
            if (this.textDecoder) {
                const bytes = new Uint8Array(binary.length);
                for (let i = 0; i < binary.length; i++) {
                    bytes[i] = binary.charCodeAt(i);
                }
                return this.textDecoder.decode(bytes);
            }
            let escaped = '';
            for (let i = 0; i < binary.length; i++) {
                const hex = binary.charCodeAt(i).toString(16).padStart(2, '0');
                escaped += `%${hex}`;
            }
            return decodeURIComponent(escaped);
        }
        catch (_a) {
            return '';
        }
    }
    applyHintHideClasses(bubble, classes) {
        this.activeHintHideClasses.forEach(cls => bubble.classList.remove(cls));
        this.activeHintHideClasses = [];
        if (!classes) {
            return;
        }
        const values = classes.split(' ').filter(value => value.length > 0);
        values.forEach(value => bubble.classList.add(value));
        this.activeHintHideClasses = values;
    }
    hideVisibleHintElements() {
        this.clearPendingHintTimer();
        this.hoveredHintTargetId = null;
        this.hideHintElement();
    }
    hideHintElement() {
        var _a;
        if (this.visibleHintTargetId == null) {
            return;
        }
        if (this.hintRedirectHideCallback) {
            this.hintRedirectHideCallback();
            this.visibleHintTargetId = null;
            this.lastHintHideTime = Date.now();
            return;
        }
        const bubble = (_a = this.hintElement) !== null && _a !== void 0 ? _a : document.getElementById(this.hintElementId);
        if (!bubble) {
            this.visibleHintTargetId = null;
            this.isProgrammaticHint = false;
            return;
        }
        bubble.style.opacity = '0';
        this.clearPendingHideTimer();
        this.pendingHideTimer = window.setTimeout(() => {
            bubble.classList.add('hidden');
            this.pendingHideTimer = null;
        }, 200);
        this.visibleHintTargetId = null;
        this.isProgrammaticHint = false;
        this.lastHintHideTime = Date.now();
        this.cleanupDynamicSizingClasses(bubble.id);
    }
    findHintTargetAtPosition(x, y) {
        var _a;
        let elements = [];
        if (document.elementsFromPoint) {
            elements = document.elementsFromPoint(x, y);
        }
        else {
            const fallback = document.elementFromPoint(x, y);
            if (fallback) {
                elements = [fallback];
            }
        }
        const bubble = (_a = this.hintElement) !== null && _a !== void 0 ? _a : document.getElementById(this.hintElementId);
        for (const element of elements) {
            if (bubble && (element === bubble || bubble.contains(element))) {
                continue;
            }
            const hintElement = this.findHintElementInTree(element);
            if (hintElement) {
                return hintElement;
            }
            if (this.isBackgroundOverlayElement(element)) {
                return null;
            }
        }
        return null;
    }
    findHintElementInTree(element) {
        let current = element;
        while (current) {
            if (current.dataset && current.dataset.hintEnabled === 'true' && this.isElementVisibleForHints(current)) {
                return current;
            }
            current = current.parentElement;
        }
        return null;
    }
    isElementVisibleForHints(element) {
        var _a;
        let current = element;
        while (current) {
            const style = window.getComputedStyle(current);
            const opacity = parseFloat((_a = style.opacity) !== null && _a !== void 0 ? _a : '1');
            if (opacity <= 0.01 || style.visibility === 'hidden' || style.display === 'none') {
                return false;
            }
            current = current.parentElement;
        }
        return true;
    }
    isBackgroundOverlayElement(element) {
        return !!(element && element.id && element.id.startsWith('backgroundOverlay_'));
    }
    reevaluateHintTargetFromPointer() {
        if (!this.lastPointerPosition) {
            return;
        }
        const target = this.findHintTargetAtPosition(this.lastPointerPosition.x, this.lastPointerPosition.y);
        this.updateHoveredHintTarget(target);
    }
    showHintAt(x, y, content, options) {
        var _a;
        this.clearAllHintTimers();
        const bubble = this.getOrCreateHintElement();
        this.applyHintHideClasses(bubble, options === null || options === void 0 ? void 0 : options.hideClasses);
        this.applyHintContentDirect(bubble, content, (_a = options === null || options === void 0 ? void 0 : options.centerText) !== null && _a !== void 0 ? _a : true);
        const contentElement = bubble.querySelector('.speech-bubble-content');
        if (!contentElement) {
            return;
        }
        let direction;
        if ((options === null || options === void 0 ? void 0 : options.direction) === 'up') {
            direction = 'up';
        }
        else if ((options === null || options === void 0 ? void 0 : options.direction) === 'down') {
            direction = 'down';
        }
        else {
            direction = y > this.HINT_POSITIONING_THRESHOLD ? 'down' : 'up';
        }
        const dims = this.calculateHintDimensions(contentElement, options);
        const tailPosition = dims.bubbleWidth / 2;
        this.applyHintBubbleGeometry(bubble, dims, direction, tailPosition);
        bubble.style.position = 'fixed';
        const bubbleWidth = dims.bubbleWidth + dims.strokePadding * 2;
        const bubbleHeight = dims.totalHeight + dims.strokePadding * 2;
        const left = x - bubbleWidth / 2;
        let top;
        if (direction === 'up') {
            top = y;
        }
        else {
            top = y - bubbleHeight;
        }
        bubble.style.left = `${left}px`;
        bubble.style.top = `${top}px`;
        bubble.style.bottom = '';
        bubble.classList.remove('hidden');
        bubble.style.opacity = '0';
        this.putElementUnderContentRoot(bubble.id);
        this.keepOnScreen(bubble.id, false);
        const finalRect = bubble.getBoundingClientRect();
        const finalLeft = finalRect.left + dims.strokePadding;
        const relativeX = x - finalLeft;
        const adjustedTailPosition = Math.max(dims.tailBaseWidth / 2, Math.min(dims.bubbleWidth - dims.tailBaseWidth / 2, relativeX));
        this.applyHintBubbleGeometry(bubble, dims, direction, adjustedTailPosition);
        requestAnimationFrame(() => {
            bubble.style.opacity = '1';
        });
        this.isProgrammaticHint = true;
        this.visibleHintTargetId = '_programmatic_';
    }
    showHintAtElement(element, content, options) {
        var _a;
        let targetElement;
        if (typeof element === 'string') {
            targetElement = document.getElementById(element);
        }
        else {
            targetElement = element;
        }
        if (!targetElement) {
            console.warn('showHintAtElement: element not found');
            return;
        }
        let targetId = targetElement.id;
        if (!targetId) {
            targetId = `_hint_temp_${Date.now()}`;
            targetElement.id = targetId;
        }
        this.clearAllHintTimers();
        const bubble = this.getOrCreateHintElement();
        this.applyHintHideClasses(bubble, options === null || options === void 0 ? void 0 : options.hideClasses);
        this.applyHintContentDirect(bubble, content, (_a = options === null || options === void 0 ? void 0 : options.centerText) !== null && _a !== void 0 ? _a : true);
        const targetRect = targetElement.getBoundingClientRect();
        let showBelow;
        if ((options === null || options === void 0 ? void 0 : options.direction) === 'up') {
            showBelow = true;
        }
        else if ((options === null || options === void 0 ? void 0 : options.direction) === 'down') {
            showBelow = false;
        }
        else {
            showBelow = targetRect.top < this.HINT_POSITIONING_THRESHOLD;
        }
        bubble.classList.remove('hidden');
        bubble.style.opacity = '0';
        this.processHintDecorator(targetId, bubble.id, showBelow, options === null || options === void 0 ? void 0 : options.maxWidth);
        requestAnimationFrame(() => {
            bubble.style.opacity = '1';
        });
        this.isProgrammaticHint = true;
        this.visibleHintTargetId = targetId;
    }
    hideHint() {
        var _a;
        this.clearAllHintTimers();
        const bubble = (_a = this.hintElement) !== null && _a !== void 0 ? _a : document.getElementById(this.hintElementId);
        if (bubble) {
            bubble.style.opacity = '0';
            bubble.classList.add('hidden');
            this.cleanupDynamicSizingClasses(bubble.id);
        }
        this.visibleHintTargetId = null;
        this.isProgrammaticHint = false;
        this.lastHintHideTime = Date.now();
    }
    applyHintContentDirect(bubble, text, centerText) {
        const contentElement = bubble.querySelector('.speech-bubble-content');
        if (!contentElement) {
            return;
        }
        const escaped = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
        contentElement.innerHTML = escaped;
        if (centerText) {
            contentElement.classList.add('text-center');
        }
        else {
            contentElement.classList.remove('text-center');
        }
    }
    removeElementFromDom(elementId) {
        let element = document.getElementById(elementId);
        if (element != null) {
            element.remove();
        }
    }
    stopMouseMovePropagation(elementId) {
        let element = document.getElementById(elementId);
        if (element == null) {
            return;
        }
        element.addEventListener('mousemove', (event) => {
            event.stopPropagation();
        });
    }
    setupDynamicSizingClasses(elementIdMap) {
        var _a;
        const pairs = (_a = elementIdMap.split(' ')) !== null && _a !== void 0 ? _a : [];
        pairs.forEach(pair => {
            var _a;
            const ids = (_a = pair.split(':')) !== null && _a !== void 0 ? _a : [];
            if (ids.length != 2) {
                console.error(`elementIdMap '${elementIdMap}' contains invalid pair '${pair}'.`);
                return;
            }
            this.setupDynamicSizingClassesInternal(ids[0], ids[1]);
        });
    }
    cleanupDynamicSizingClasses(elementId) {
        const existingResizeObserver = this.resizeObservers[elementId];
        if (existingResizeObserver != undefined) {
            existingResizeObserver.disconnect();
            delete this.resizeObservers[elementId];
        }
        const existingMutationObserver = this.mutationObservers[elementId];
        if (existingMutationObserver != undefined) {
            existingMutationObserver.disconnect();
            delete this.mutationObservers[elementId];
        }
        delete this.appliedDynamicClasses[elementId];
    }
    setupDynamicSizingClassesInternal(elementIdToGetWidthFrom, elementIdToAdjustClasses) {
        const observedElement = document.getElementById(elementIdToGetWidthFrom);
        const adjustElement = document.getElementById(elementIdToAdjustClasses);
        if (!observedElement) {
            console.info(`Element with id '${elementIdToGetWidthFrom}' not found.`);
            return;
        }
        if (!adjustElement) {
            console.info(`Element with id '${elementIdToAdjustClasses}' not found.`);
            return;
        }
        const existingResizeObserver = this.resizeObservers[elementIdToAdjustClasses];
        if (existingResizeObserver != undefined) {
            existingResizeObserver.disconnect();
        }
        const existingMutationObserver = this.mutationObservers[elementIdToAdjustClasses];
        if (existingMutationObserver != undefined) {
            existingMutationObserver.disconnect();
        }
        const resizeObserver = new ResizeObserver(entries => {
            this.adjustSizingClasses(elementIdToGetWidthFrom, elementIdToAdjustClasses);
        });
        const mutationObserver = new MutationObserver(mutations => {
            mutations.forEach(mutation => {
                if (mutation.type === 'attributes' && mutation.attributeName === 'data-sizing') {
                    this.adjustSizingClasses(elementIdToGetWidthFrom, elementIdToAdjustClasses);
                }
            });
        });
        resizeObserver.observe(observedElement);
        mutationObserver.observe(adjustElement, {
            attributes: true,
            attributeFilter: ['data-sizing']
        });
        this.resizeObservers[elementIdToAdjustClasses] = resizeObserver;
        this.mutationObservers[elementIdToAdjustClasses] = mutationObserver;
        this.appliedDynamicClasses[elementIdToAdjustClasses] = new Set();
        this.adjustSizingClasses(elementIdToGetWidthFrom, elementIdToAdjustClasses);
    }
    adjustSizingClasses(elementIdToGetWidthFrom, elementIdToAdjustClasses) {
        var _a, _b;
        const widthElement = document.getElementById(elementIdToGetWidthFrom);
        const width = widthElement ? widthElement.getBoundingClientRect().width : 0;
        const remToPixels = (rem) => rem * 16;
        const sizes = [
            { prefix: '7xl', minWidth: remToPixels(80) },
            { prefix: '6xl', minWidth: remToPixels(72) },
            { prefix: '5xl', minWidth: remToPixels(64) },
            { prefix: '4xl', minWidth: remToPixels(56) },
            { prefix: '3xl', minWidth: remToPixels(48) },
            { prefix: '2xl', minWidth: remToPixels(42) },
            { prefix: 'xl', minWidth: remToPixels(36) },
            { prefix: 'lg', minWidth: remToPixels(32) },
            { prefix: 'md', minWidth: remToPixels(28) },
            { prefix: 'sm', minWidth: remToPixels(24) },
            { prefix: 'xs', minWidth: remToPixels(20) },
        ];
        const adjustElement = document.getElementById(elementIdToAdjustClasses);
        if (!adjustElement)
            return;
        const sizeBasedClasses = (_b = (_a = adjustElement.getAttribute('data-sizing')) === null || _a === void 0 ? void 0 : _a.split(' ')) !== null && _b !== void 0 ? _b : [];
        const prefixRegex = /^(xs|sm|md|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl):/;
        const previouslyAppliedClasses = this.appliedDynamicClasses[elementIdToAdjustClasses] || new Set();
        previouslyAppliedClasses.forEach(className => {
            adjustElement.classList.remove(className);
        });
        this.appliedDynamicClasses[elementIdToAdjustClasses] = new Set();
        let selectedPrefix = '';
        for (const size of sizes) {
            const isPrefixPresentInClasses = sizeBasedClasses.some(className => className.startsWith(`${size.prefix}:`));
            if (width >= size.minWidth && isPrefixPresentInClasses) {
                selectedPrefix = size.prefix;
                break;
            }
        }
        const appliedClasses = this.appliedDynamicClasses[elementIdToAdjustClasses];
        sizeBasedClasses.forEach(className => {
            if (className) {
                if (prefixRegex.test(className)) {
                    if (className.startsWith(`${selectedPrefix}:`)) {
                        const actualClassName = className.replace(prefixRegex, '');
                        adjustElement.classList.add(actualClassName);
                        appliedClasses.add(actualClassName);
                    }
                }
                else if (selectedPrefix === '') {
                    adjustElement.classList.add(className);
                    appliedClasses.add(className);
                }
            }
        });
    }
    openInNewTab(url, tabName) {
        const aElem = document.createElement("a");
        aElem.href = url;
        aElem.target = tabName;
        document.body.append(aElem);
        aElem.click();
        aElem.remove();
    }
    navigateCurrentWindow(url) {
        window.location.href = url;
    }
    isIosSafari() {
        const ua = navigator.userAgent;
        const isIos = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        const isSafari = /Safari/.test(ua) && !/Chrome|CriOS|FxiOS|EdgiOS/.test(ua);
        return isIos && isSafari;
    }
    installIosSafariClickInterceptor() {
        if (this._iosSafariClickInterceptorInstalled || !this.isIosSafari()) {
            return;
        }
        document.addEventListener('click', (e) => {
            const target = e.target;
            if (!target) {
                return;
            }
            const popupElement = target.closest('[data-ios-popup-url]');
            if (!popupElement) {
                return;
            }
            const url = popupElement.getAttribute('data-ios-popup-url');
            if (!url || url.length === 0) {
                return;
            }
            window.open(url, '_blank');
        }, true);
        this._iosSafariClickInterceptorInstalled = true;
    }
    preOpenPopup() {
        if (this._pendingPopup && !this._pendingPopup.closed) {
            this._pendingPopup.close();
        }
        this._pendingPopup = window.open('about:blank', '_blank');
        if (!this._pendingPopup) {
            return false;
        }
        try {
            this._pendingPopup.document.write('<html><head><title>Loading...</title></head><body style="display:flex;justify-content:center;align-items:center;height:100vh;margin:0;font-family:system-ui,sans-serif;color:#666;">Loading...</body></html>');
        }
        catch (e) {
        }
        return true;
    }
    navigatePendingPopup(url) {
        if (!this._pendingPopup || this._pendingPopup.closed) {
            window.location.href = url;
            return false;
        }
        this._pendingPopup.location.href = url;
        this._pendingPopup = null;
        return true;
    }
    closePendingPopup() {
        if (this._pendingPopup && !this._pendingPopup.closed) {
            this._pendingPopup.close();
        }
        this._pendingPopup = null;
    }
    setupToolbarResizeObserver(containerElementId, dotNetHelper, callbackMethodName) {
        const containerElement = document.getElementById(containerElementId);
        if (!containerElement) {
            console.warn(`setupToolbarResizeObserver: Could not find container element "${containerElementId}".`);
            return;
        }
        const resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const width = entry.contentRect.width;
                safeInvoke(dotNetHelper, callbackMethodName, [width]);
            }
        });
        resizeObserver.observe(containerElement);
        const width = containerElement.offsetWidth;
        safeInvoke(dotNetHelper, callbackMethodName, [width]);
    }
    setupToolbarFocusGuard(containerElementId) {
        const container = document.getElementById(containerElementId);
        if (!container) {
            console.warn(`setupToolbarFocusGuard: Could not find "${containerElementId}".`);
            return;
        }
        container.addEventListener('mousedown', (e) => {
            e.preventDefault();
        });
        const scrollable = container.querySelector('.venus-toolbar-scrollable');
        if (scrollable) {
            const updateMask = () => {
                const tolerance = 1;
                const atLeftEdge = scrollable.scrollLeft <= 0;
                const atRightEdge = scrollable.scrollLeft + scrollable.clientWidth + tolerance >= scrollable.scrollWidth;
                let left, right;
                if (atLeftEdge && atRightEdge) {
                    scrollable.style.removeProperty('mask-image');
                    scrollable.style.removeProperty('-webkit-mask-image');
                    return;
                }
                else if (atLeftEdge) {
                    left = '0%';
                    right = 'calc(100% - 25px)';
                }
                else if (atRightEdge) {
                    left = 'calc(0% + 25px)';
                    right = '100%';
                }
                else {
                    left = 'calc(0% + 25px)';
                    right = 'calc(100% - 25px)';
                }
                const mask = `linear-gradient(to right, transparent, black ${left}, black ${right}, transparent)`;
                scrollable.style.webkitMaskImage = mask;
                scrollable.style.maskImage = mask;
            };
            scrollable.addEventListener('scroll', updateMask, { passive: true });
            updateMask();
        }
    }
    cleanupDrawerSlideHandler() {
        this.drawerDotNetObjRef = null;
        if (this.drawerScrollListener) {
            this.drawerScrollListener.el.removeEventListener('scroll', this.drawerScrollListener.fn);
            this.drawerScrollListener = null;
        }
        for (const [mapKey, { start, move, end, cancel }] of this.handlersMap) {
            const elementId = mapKey.split('_')[0];
            const backgroundOverlayId = mapKey.split('_').slice(2).join('_');
            [document.getElementById(elementId), document.getElementById(backgroundOverlayId)].forEach((el) => {
                if (!el)
                    return;
                el.removeEventListener('touchstart', start);
                el.removeEventListener('touchmove', move);
                el.removeEventListener('touchend', end);
                el.removeEventListener('touchcancel', cancel);
            });
        }
        this.handlersMap.clear();
    }
    setupDrawerSlideHandler(elementId, position, backgroundOverlayId, dotNetObjRef, targetContainerId = null, removeHandlers = false) {
        if (!removeHandlers) {
            this.drawerDotNetObjRef = dotNetObjRef;
        }
        const element = document.getElementById(elementId);
        const backgroundOverlay = document.getElementById(backgroundOverlayId);
        if (!element)
            return;
        const mapKey = `${elementId}_${position}_${backgroundOverlayId}`;
        if (!this.handlersMap.has(mapKey)) {
            const startFn = (e) => this.handleTouchStart(e, targetContainerId !== null && targetContainerId !== void 0 ? targetContainerId : elementId, position);
            const moveFn = (e) => this.handleTouchMove(e, targetContainerId !== null && targetContainerId !== void 0 ? targetContainerId : elementId, position);
            const endFn = (e) => this.handleTouchEnd(e, targetContainerId !== null && targetContainerId !== void 0 ? targetContainerId : elementId, position);
            const cancelFn = (e) => this.handleTouchCancel(e, targetContainerId !== null && targetContainerId !== void 0 ? targetContainerId : elementId, position);
            this.handlersMap.set(mapKey, { start: startFn, move: moveFn, end: endFn, cancel: cancelFn });
        }
        const { start, move, end, cancel } = this.handlersMap.get(mapKey);
        [element, backgroundOverlay].forEach((el) => {
            if (!el)
                return;
            el.removeEventListener('touchstart', start);
            el.removeEventListener('touchmove', move);
            el.removeEventListener('touchend', end);
            el.removeEventListener('touchcancel', cancel);
            if (!removeHandlers) {
                el.addEventListener('touchstart', start, { passive: false });
                el.addEventListener('touchmove', move, { passive: false });
                el.addEventListener('touchend', end, { passive: false });
                el.addEventListener('touchcancel', cancel, { passive: false });
            }
        });
    }
    drawerDismissalAxisDelta(dx, dy, position) {
        switch (position) {
            case DrawerPosition.Left: return -dx;
            case DrawerPosition.Right: return dx;
            case DrawerPosition.Top: return -dy;
            case DrawerPosition.Bottom: return dy;
        }
    }
    drawerCrossAxisDelta(dx, dy, position) {
        return (position === DrawerPosition.Left || position === DrawerPosition.Right) ? dy : dx;
    }
    drawerIsAtDismissalEdge(info, position) {
        const el = info.element;
        const tol = 1;
        switch (position) {
            case DrawerPosition.Bottom: return el.scrollTop <= tol;
            case DrawerPosition.Top: return (el.scrollTop + el.clientHeight) >= (el.scrollHeight - tol);
            case DrawerPosition.Right: return el.scrollLeft <= tol;
            case DrawerPosition.Left: return (el.scrollLeft + el.clientWidth) >= (el.scrollWidth - tol);
        }
    }
    drawerScrollableMatchesPullAxis(info, position) {
        if (!info)
            return false;
        const isVertical = position === DrawerPosition.Top || position === DrawerPosition.Bottom;
        return isVertical ? !info.isHorizontallyScrollable : info.isHorizontallyScrollable;
    }
    drawerPushSample(t, x, y) {
        this.drawerPointerSamples.push({ t, x, y });
        const cutoff = t - this.DRAWER_GESTURE.VELOCITY_SAMPLE_MS;
        while (this.drawerPointerSamples.length > 2 && this.drawerPointerSamples[0].t < cutoff) {
            this.drawerPointerSamples.shift();
        }
    }
    drawerVelocity(position) {
        const s = this.drawerPointerSamples;
        if (s.length < 2)
            return 0;
        const first = s[0];
        const last = s[s.length - 1];
        const dt = last.t - first.t;
        if (dt <= 0)
            return 0;
        return this.drawerDismissalAxisDelta(last.x - first.x, last.y - first.y, position) / dt;
    }
    handleTouchStart(event, elementId, position) {
        const touch = event.touches[0];
        const now = performance.now();
        this.drawerGestureState = 'Deciding';
        this.drawerGestureStartX = touch.clientX;
        this.drawerGestureStartY = touch.clientY;
        this.drawerDragAnchorX = touch.clientX;
        this.drawerDragAnchorY = touch.clientY;
        this.drawerScrollable = null;
        this.drawerDidPreventScroll = false;
        this.drawerMaxFingerDistance = 0;
        this.drawerEdgeHandoffStartAxisDelta = null;
        this.drawerPointerSamples = [];
        this.drawerPushSample(now, touch.clientX, touch.clientY);
        const element = document.getElementById(elementId);
        if (!element)
            return;
        element.style.transitionTimingFunction = 'linear';
        element.style.transitionDuration = '0ms';
        if (this.drawerScrollListener) {
            this.drawerScrollListener.el.removeEventListener('scroll', this.drawerScrollListener.fn);
            this.drawerScrollListener = null;
        }
        let currentElement = event.target;
        while (currentElement && currentElement !== document.body) {
            const style = window.getComputedStyle(currentElement);
            const overflowY = style.overflowY;
            const overflowX = style.overflowX;
            const isVerticallyScrollable = (overflowY === 'auto' || overflowY === 'scroll') && currentElement.scrollHeight > currentElement.clientHeight;
            const isHorizontallyScrollable = (overflowX === 'auto' || overflowX === 'scroll') && currentElement.scrollWidth > currentElement.clientWidth;
            if (isVerticallyScrollable || isHorizontallyScrollable) {
                this.drawerScrollable = {
                    element: currentElement,
                    scrollTopAtStart: currentElement.scrollTop,
                    scrollHeight: currentElement.scrollHeight,
                    clientHeight: currentElement.clientHeight,
                    scrollLeftAtStart: currentElement.scrollLeft,
                    scrollWidth: currentElement.scrollWidth,
                    clientWidth: currentElement.clientWidth,
                    isHorizontallyScrollable: isHorizontallyScrollable,
                };
                break;
            }
            currentElement = currentElement.parentElement;
        }
        if (this.drawerScrollable) {
            const scrollEl = this.drawerScrollable.element;
            const refreshGrace = () => { this.drawerLastScrollActivityTime = performance.now(); };
            scrollEl.addEventListener('scroll', refreshGrace, { passive: true });
            this.drawerScrollListener = { el: scrollEl, fn: refreshGrace };
        }
    }
    handleTouchMove(event, elementId, position) {
        const element = document.getElementById(elementId);
        if (!element)
            return;
        if (event.target instanceof HTMLInputElement && event.target.type === 'range') {
            return;
        }
        const touch = event.touches[0];
        const now = performance.now();
        this.drawerPushSample(now, touch.clientX, touch.clientY);
        const dxFromStart = touch.clientX - this.drawerGestureStartX;
        const dyFromStart = touch.clientY - this.drawerGestureStartY;
        this.drawerMaxFingerDistance = Math.max(this.drawerMaxFingerDistance, Math.hypot(dxFromStart, dyFromStart));
        switch (this.drawerGestureState) {
            case 'Idle':
                return;
            case 'Deciding':
                this.drawerDecide(event, touch, position);
                return;
            case 'Scrolling':
                this.drawerObserveForHandoff(event, touch, position);
                return;
            case 'DrawerDragging':
                this.drawerApplyDrag(event, element, touch, position);
                return;
        }
    }
    drawerDecide(event, touch, position) {
        const deltaX = touch.clientX - this.drawerGestureStartX;
        const deltaY = touch.clientY - this.drawerGestureStartY;
        const axisDelta = this.drawerDismissalAxisDelta(deltaX, deltaY, position);
        const crossDelta = this.drawerCrossAxisDelta(deltaX, deltaY, position);
        const G = this.DRAWER_GESTURE;
        if (Math.abs(crossDelta) > Math.abs(axisDelta) * G.CROSS_AXIS_DOMINANCE && Math.abs(crossDelta) > G.CROSS_AXIS_MIN_PX) {
            this.drawerGestureState = this.drawerScrollable ? 'Scrolling' : 'Idle';
            return;
        }
        if (axisDelta < 0) {
            this.drawerGestureState = this.drawerScrollableMatchesPullAxis(this.drawerScrollable, position) ? 'Scrolling' : 'Idle';
            return;
        }
        const scrollable = this.drawerScrollable;
        const scrollableInPullAxis = this.drawerScrollableMatchesPullAxis(scrollable, position);
        if (scrollableInPullAxis && !this.drawerIsAtDismissalEdge(scrollable, position)) {
            this.drawerGestureState = 'Scrolling';
            return;
        }
        const inGrace = (performance.now() - this.drawerLastScrollActivityTime) < G.GRACE_WINDOW_MS;
        if (inGrace) {
            this.drawerGestureState = this.drawerScrollable ? 'Scrolling' : 'Idle';
            return;
        }
        event.preventDefault();
        this.drawerDidPreventScroll = true;
        if (axisDelta < G.ACTIVATION_PX)
            return;
        this.drawerGestureState = 'DrawerDragging';
        this.drawerDragAnchorX = touch.clientX;
        this.drawerDragAnchorY = touch.clientY;
        event.preventDefault();
        this.drawerDidPreventScroll = true;
    }
    drawerObserveForHandoff(event, touch, position) {
        const scrollable = this.drawerScrollable;
        if (!scrollable)
            return;
        const inGrace = (performance.now() - this.drawerLastScrollActivityTime) < this.DRAWER_GESTURE.GRACE_WINDOW_MS;
        if (inGrace)
            return;
        const deltaX = touch.clientX - this.drawerGestureStartX;
        const deltaY = touch.clientY - this.drawerGestureStartY;
        const axisDelta = this.drawerDismissalAxisDelta(deltaX, deltaY, position);
        const atEdge = this.drawerIsAtDismissalEdge(scrollable, position);
        if (!atEdge || axisDelta <= 0) {
            this.drawerEdgeHandoffStartAxisDelta = null;
            return;
        }
        event.preventDefault();
        this.drawerDidPreventScroll = true;
        if (this.drawerEdgeHandoffStartAxisDelta === null) {
            this.drawerEdgeHandoffStartAxisDelta = axisDelta;
            return;
        }
        const pushedPastEdge = axisDelta - this.drawerEdgeHandoffStartAxisDelta;
        if (pushedPastEdge < this.DRAWER_GESTURE.HANDOFF_PX)
            return;
        this.drawerGestureState = 'DrawerDragging';
        this.drawerDragAnchorX = touch.clientX;
        this.drawerDragAnchorY = touch.clientY;
        this.drawerEdgeHandoffStartAxisDelta = null;
        event.preventDefault();
        this.drawerDidPreventScroll = true;
    }
    drawerApplyDrag(event, element, touch, position) {
        event.preventDefault();
        this.drawerDidPreventScroll = true;
        const dx = touch.clientX - this.drawerDragAnchorX;
        const dy = touch.clientY - this.drawerDragAnchorY;
        const axisOffset = this.drawerDismissalAxisDelta(dx, dy, position);
        const G = this.DRAWER_GESTURE;
        let translated;
        if (axisOffset <= 0) {
            translated = 0;
        }
        else if (axisOffset < G.RESISTANCE_PX) {
            translated = axisOffset * G.RESISTANCE_FACTOR;
        }
        else {
            translated = G.RESISTANCE_PX * G.RESISTANCE_FACTOR + (axisOffset - G.RESISTANCE_PX);
        }
        switch (position) {
            case DrawerPosition.Left:
                element.style.left = `${-translated}px`;
                break;
            case DrawerPosition.Right:
                element.style.right = `${-translated}px`;
                break;
            case DrawerPosition.Top:
                element.style.top = `${-translated}px`;
                break;
            case DrawerPosition.Bottom:
                element.style.top = `${translated}px`;
                break;
        }
    }
    handleTouchEnd(event, elementId, position) {
        var _a;
        const element = document.getElementById(elementId);
        if (!element)
            return;
        element.style.transitionTimingFunction = 'ease-out';
        element.style.transitionDuration = '300ms';
        const prevState = this.drawerGestureState;
        const endTouch = event.changedTouches[0];
        const G = this.DRAWER_GESTURE;
        let shouldClose = false;
        if (prevState === 'DrawerDragging') {
            const fingerAxis = this.drawerDismissalAxisDelta(endTouch.clientX - this.drawerDragAnchorX, endTouch.clientY - this.drawerDragAnchorY, position);
            const velocity = this.drawerVelocity(position);
            const isHorizontal = position === DrawerPosition.Left || position === DrawerPosition.Right;
            const dragDistance = isHorizontal ? G.LR_DRAG_DISTANCE : G.TB_DRAG_DISTANCE;
            const flickMin = isHorizontal ? G.LR_FLICK_MIN_DISTANCE : G.TB_FLICK_MIN_DISTANCE;
            if (fingerAxis > dragDistance) {
                shouldClose = true;
            }
            else if (velocity > G.FLICK_VELOCITY && fingerAxis > flickMin) {
                shouldClose = true;
            }
        }
        if (shouldClose) {
            this.blurFocusedEditableIn(element);
            safeInvoke(this.drawerDotNetObjRef, 'CloseDrawerWithAnimation');
            const recoverElementId = elementId;
            const recoverPosition = position;
            setTimeout(() => {
                const el = document.getElementById(recoverElementId);
                if (!el)
                    return;
                const isIntermediate = (v) => v !== '' && v !== '0' && v !== '0px' && v !== '100%' && v !== '-100%';
                if (recoverPosition === DrawerPosition.Left && isIntermediate(el.style.left))
                    el.style.left = '0';
                else if (recoverPosition === DrawerPosition.Right && isIntermediate(el.style.right))
                    el.style.right = '0';
                else if ((recoverPosition === DrawerPosition.Top || recoverPosition === DrawerPosition.Bottom) && isIntermediate(el.style.top))
                    el.style.top = '0';
            }, 400);
        }
        else {
            if (position === DrawerPosition.Left && element.style.left && element.style.left !== '0px' && element.style.left !== '0')
                element.style.left = '0';
            else if (position === DrawerPosition.Right && element.style.right && element.style.right !== '0px' && element.style.right !== '0')
                element.style.right = '0';
            else if ((position === DrawerPosition.Top || position === DrawerPosition.Bottom) && element.style.top && element.style.top !== '0px' && element.style.top !== '0')
                element.style.top = '0';
        }
        if (prevState === 'Scrolling') {
            this.drawerLastScrollActivityTime = performance.now();
        }
        if (this.drawerMaxFingerDistance < G.TAP_MAX_DISTANCE && this.drawerDidPreventScroll) {
            const clickEvent = new MouseEvent('click', {
                bubbles: true, cancelable: true, view: window,
                clientX: endTouch.clientX,
                clientY: endTouch.clientY,
                screenX: endTouch.screenX,
                screenY: endTouch.screenY,
                buttons: 0, button: 0,
                ctrlKey: event.ctrlKey, altKey: event.altKey,
                shiftKey: event.shiftKey, metaKey: event.metaKey,
            });
            (_a = endTouch.target) === null || _a === void 0 ? void 0 : _a.dispatchEvent(clickEvent);
        }
        this.drawerGestureState = 'Idle';
        this.drawerScrollable = null;
        this.drawerEdgeHandoffStartAxisDelta = null;
        this.drawerPointerSamples = [];
    }
    handleTouchCancel(_event, elementId, position) {
        const prevState = this.drawerGestureState;
        this.drawerGestureState = 'Idle';
        this.drawerScrollable = null;
        this.drawerEdgeHandoffStartAxisDelta = null;
        this.drawerPointerSamples = [];
        if (prevState === 'Scrolling') {
            this.drawerLastScrollActivityTime = performance.now();
        }
        const element = document.getElementById(elementId);
        if (!element)
            return;
        element.style.transitionTimingFunction = 'ease-out';
        element.style.transitionDuration = '300ms';
        if (position === DrawerPosition.Left && element.style.left && element.style.left !== '0px' && element.style.left !== '0')
            element.style.left = '0';
        else if (position === DrawerPosition.Right && element.style.right && element.style.right !== '0px' && element.style.right !== '0')
            element.style.right = '0';
        else if ((position === DrawerPosition.Top || position === DrawerPosition.Bottom) && element.style.top && element.style.top !== '0px' && element.style.top !== '0')
            element.style.top = '0';
    }
    blurFocusedEditableIn(container) {
        if (!container)
            return;
        const active = document.activeElement;
        if (!active || !container.contains(active))
            return;
        const tag = active.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || active.isContentEditable) {
            active.blur();
        }
    }
    slideDrawer(drawerContainerId, position, shouldShow) {
        const drawerContainer = document.getElementById(drawerContainerId);
        if (!drawerContainer)
            return;
        if (!shouldShow) {
            this.blurFocusedEditableIn(drawerContainer);
        }
        const value = shouldShow ? '0' : position === DrawerPosition.Bottom ? '100%' : '-100%';
        switch (position) {
            case DrawerPosition.Left:
                drawerContainer.style.left = value;
                break;
            case DrawerPosition.Right:
                drawerContainer.style.right = value;
                break;
            case DrawerPosition.Top:
            case DrawerPosition.Bottom:
                drawerContainer.style.top = value;
                break;
        }
    }
    pushPopoverShowing() {
        this.popoverShowingCount++;
        this.pullUpState = 'Idle';
        this.pullUpScrollable = null;
        this.pullDownState = 'Idle';
        this.pullDownScrollable = null;
    }
    popPopoverShowing() {
        if (this.popoverShowingCount > 0) {
            this.popoverShowingCount--;
        }
    }
    setupContentAreaPullUpHandler(hostId, targetId, dotNetObjRef, removeHandlers = false) {
        if (!removeHandlers) {
            this.pullUpDotNetObjRef = dotNetObjRef;
        }
        window.__plexContentRevealActive = () => this.pullUpState === 'Dragging' || this.pullDownState === 'Dragging';
        const host = document.getElementById(hostId);
        if (!host)
            return;
        const mapKey = `pullup_${hostId}_${targetId}`;
        if (!this.pullUpHandlersMap.has(mapKey)) {
            const startFn = (e) => this.handlePullUpStart(e, targetId);
            const moveFn = (e) => this.handlePullUpMove(e, targetId);
            const endFn = (e) => this.handlePullUpEnd(e, targetId);
            const cancelFn = (e) => this.handlePullUpCancel(e, targetId);
            this.pullUpHandlersMap.set(mapKey, { start: startFn, move: moveFn, end: endFn, cancel: cancelFn });
        }
        const { start, move, end, cancel } = this.pullUpHandlersMap.get(mapKey);
        host.removeEventListener('touchstart', start);
        host.removeEventListener('touchmove', move);
        host.removeEventListener('touchend', end);
        host.removeEventListener('touchcancel', cancel);
        if (!removeHandlers) {
            host.addEventListener('touchstart', start, { passive: false });
            host.addEventListener('touchmove', move, { passive: false });
            host.addEventListener('touchend', end, { passive: false });
            host.addEventListener('touchcancel', cancel, { passive: false });
        }
    }
    pullUpPushSample(t, y) {
        this.pullUpPointerSamples.push({ t, y });
        const cutoff = t - this.DRAWER_GESTURE.VELOCITY_SAMPLE_MS;
        while (this.pullUpPointerSamples.length > 2 && this.pullUpPointerSamples[0].t < cutoff) {
            this.pullUpPointerSamples.shift();
        }
    }
    pullUpVelocity() {
        const s = this.pullUpPointerSamples;
        if (s.length < 2)
            return 0;
        const first = s[0];
        const last = s[s.length - 1];
        const dt = last.t - first.t;
        if (dt <= 0)
            return 0;
        return -(last.y - first.y) / dt;
    }
    handlePullUpStart(event, targetId) {
        if (event.touches.length > 1) {
            if (this.pullUpState !== 'Dragging') {
                this.pullUpState = 'Idle';
                this.pullUpScrollable = null;
            }
            return;
        }
        const touch = event.touches[0];
        const plexScrollbarHitTest = window.__plexTouchIsOverScrollbar;
        if (typeof plexScrollbarHitTest === 'function' && plexScrollbarHitTest(touch.clientX, touch.clientY)) {
            this.pullUpState = 'Idle';
            this.pullUpScrollable = null;
            return;
        }
        if (this.popoverShowingCount > 0) {
            this.pullUpState = 'Idle';
            this.pullUpScrollable = null;
            return;
        }
        this.pullUpState = 'Deciding';
        this.pullUpStartX = touch.clientX;
        this.pullUpStartY = touch.clientY;
        this.pullUpPointerSamples = [];
        this.pullUpPushSample(performance.now(), touch.clientY);
        this.pullUpScrollable = null;
        let currentElement = event.target;
        while (currentElement && currentElement !== document.body) {
            const style = window.getComputedStyle(currentElement);
            const overflowY = style.overflowY;
            const isVerticallyScrollable = (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay')
                && currentElement.scrollHeight > currentElement.clientHeight;
            if (isVerticallyScrollable) {
                this.pullUpScrollable = { element: currentElement };
                break;
            }
            currentElement = currentElement.parentElement;
        }
        const target = document.getElementById(targetId);
        if (target) {
            this.pullUpTargetHeight = target.getBoundingClientRect().height;
            target.style.transitionTimingFunction = 'linear';
            target.style.transitionDuration = '0ms';
        }
    }
    handlePullUpMove(event, targetId) {
        if (this.pullUpState === 'Idle')
            return;
        if (this.popoverShowingCount > 0) {
            this.handlePullUpCancel(event, targetId);
            return;
        }
        const touch = event.touches[0];
        const now = performance.now();
        this.pullUpPushSample(now, touch.clientY);
        const dx = touch.clientX - this.pullUpStartX;
        const dy = touch.clientY - this.pullUpStartY;
        const upDelta = -dy;
        const G = this.DRAWER_GESTURE;
        if (this.pullUpState === 'Deciding') {
            if (Math.abs(dx) > Math.abs(dy) * G.CROSS_AXIS_DOMINANCE && Math.abs(dx) > G.CROSS_AXIS_MIN_PX) {
                this.pullUpState = 'Idle';
                return;
            }
            if (upDelta < 0) {
                this.pullUpState = 'Idle';
                return;
            }
            if (this.pullUpScrollable) {
                const el = this.pullUpScrollable.element;
                const tol = 1;
                const atBottomEdge = (el.scrollTop + el.clientHeight) >= (el.scrollHeight - tol);
                if (!atBottomEdge) {
                    this.pullUpState = 'Idle';
                    return;
                }
            }
            if (upDelta < G.ACTIVATION_PX)
                return;
            this.pullUpState = 'Dragging';
        }
        if (this.pullUpState === 'Dragging') {
            event.preventDefault();
            const target = document.getElementById(targetId);
            if (!target || this.pullUpTargetHeight <= 0)
                return;
            const ratio = Math.max(0, Math.min(1, upDelta / this.pullUpTargetHeight));
            const percent = 100 * (1 - ratio);
            target.style.transform = `translateY(${percent}%)`;
        }
    }
    handlePullUpEnd(event, targetId) {
        const prevState = this.pullUpState;
        this.pullUpState = 'Idle';
        this.pullUpScrollable = null;
        if (prevState !== 'Dragging')
            return;
        const target = document.getElementById(targetId);
        if (!target)
            return;
        target.style.transitionTimingFunction = 'ease-out';
        target.style.transitionDuration = '300ms';
        const endTouch = event.changedTouches[0];
        const upDelta = -(endTouch.clientY - this.pullUpStartY);
        const velocity = this.pullUpVelocity();
        const G = this.DRAWER_GESTURE;
        const shouldCommit = upDelta > G.TB_DRAG_DISTANCE ||
            (velocity > G.FLICK_VELOCITY && upDelta > G.TB_FLICK_MIN_DISTANCE);
        if (shouldCommit) {
            target.style.transform = 'translateY(0%)';
            safeInvoke(this.pullUpDotNetObjRef, 'RevealContentWithAnimation');
        }
        else {
            target.style.transform = 'translateY(100%)';
        }
    }
    handlePullUpCancel(_event, targetId) {
        const prevState = this.pullUpState;
        this.pullUpState = 'Idle';
        this.pullUpScrollable = null;
        if (prevState !== 'Dragging')
            return;
        const target = document.getElementById(targetId);
        if (!target)
            return;
        target.style.transitionTimingFunction = 'ease-out';
        target.style.transitionDuration = '300ms';
        target.style.transform = 'translateY(100%)';
    }
    setupSearchPullDownHandler(hostId, targetId, dotNetObjRef, removeHandlers = false) {
        if (!removeHandlers) {
            this.pullDownDotNetObjRef = dotNetObjRef;
        }
        const host = document.getElementById(hostId);
        if (!host)
            return;
        const mapKey = `pulldown_${hostId}_${targetId}`;
        if (!this.pullDownHandlersMap.has(mapKey)) {
            const startFn = (e) => this.handlePullDownStart(e, targetId);
            const moveFn = (e) => this.handlePullDownMove(e, targetId);
            const endFn = (e) => this.handlePullDownEnd(e, targetId);
            const cancelFn = (e) => this.handlePullDownCancel(e, targetId);
            this.pullDownHandlersMap.set(mapKey, { start: startFn, move: moveFn, end: endFn, cancel: cancelFn });
        }
        const { start, move, end, cancel } = this.pullDownHandlersMap.get(mapKey);
        host.removeEventListener('touchstart', start);
        host.removeEventListener('touchmove', move);
        host.removeEventListener('touchend', end);
        host.removeEventListener('touchcancel', cancel);
        if (!removeHandlers) {
            host.addEventListener('touchstart', start, { passive: false });
            host.addEventListener('touchmove', move, { passive: false });
            host.addEventListener('touchend', end, { passive: false });
            host.addEventListener('touchcancel', cancel, { passive: false });
        }
    }
    pullDownPushSample(t, y) {
        this.pullDownPointerSamples.push({ t, y });
        const cutoff = t - this.DRAWER_GESTURE.VELOCITY_SAMPLE_MS;
        while (this.pullDownPointerSamples.length > 2 && this.pullDownPointerSamples[0].t < cutoff) {
            this.pullDownPointerSamples.shift();
        }
    }
    pullDownVelocity() {
        const s = this.pullDownPointerSamples;
        if (s.length < 2)
            return 0;
        const first = s[0];
        const last = s[s.length - 1];
        const dt = last.t - first.t;
        if (dt <= 0)
            return 0;
        return (last.y - first.y) / dt;
    }
    handlePullDownStart(event, targetId) {
        if (event.touches.length > 1) {
            if (this.pullDownState !== 'Dragging') {
                this.pullDownState = 'Idle';
                this.pullDownScrollable = null;
            }
            return;
        }
        const touch = event.touches[0];
        const plexScrollbarHitTest = window.__plexTouchIsOverScrollbar;
        if (typeof plexScrollbarHitTest === 'function' && plexScrollbarHitTest(touch.clientX, touch.clientY)) {
            this.pullDownState = 'Idle';
            this.pullDownScrollable = null;
            return;
        }
        if (this.popoverShowingCount > 0) {
            this.pullDownState = 'Idle';
            this.pullDownScrollable = null;
            return;
        }
        this.pullDownState = 'Deciding';
        this.pullDownStartX = touch.clientX;
        this.pullDownStartY = touch.clientY;
        this.pullDownPointerSamples = [];
        this.pullDownPushSample(performance.now(), touch.clientY);
        this.pullDownScrollable = null;
        let currentElement = event.target;
        while (currentElement && currentElement !== document.body) {
            const style = window.getComputedStyle(currentElement);
            const overflowY = style.overflowY;
            const isVerticallyScrollable = (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay')
                && currentElement.scrollHeight > currentElement.clientHeight;
            if (isVerticallyScrollable) {
                this.pullDownScrollable = { element: currentElement };
                break;
            }
            currentElement = currentElement.parentElement;
        }
        const target = document.getElementById(targetId);
        if (target) {
            this.pullDownTargetHeight = target.getBoundingClientRect().height;
            target.style.transitionTimingFunction = 'linear';
            target.style.transitionDuration = '0ms';
        }
    }
    handlePullDownMove(event, targetId) {
        if (this.pullDownState === 'Idle')
            return;
        if (this.popoverShowingCount > 0) {
            this.handlePullDownCancel(event, targetId);
            return;
        }
        const touch = event.touches[0];
        const now = performance.now();
        this.pullDownPushSample(now, touch.clientY);
        const dx = touch.clientX - this.pullDownStartX;
        const dy = touch.clientY - this.pullDownStartY;
        const downDelta = dy;
        const G = this.DRAWER_GESTURE;
        if (this.pullDownState === 'Deciding') {
            if (Math.abs(dx) > Math.abs(dy) * G.CROSS_AXIS_DOMINANCE && Math.abs(dx) > G.CROSS_AXIS_MIN_PX) {
                this.pullDownState = 'Idle';
                return;
            }
            if (downDelta < 0) {
                this.pullDownState = 'Idle';
                return;
            }
            if (this.pullDownScrollable) {
                const el = this.pullDownScrollable.element;
                const atTopEdge = el.scrollTop <= 1;
                if (!atTopEdge) {
                    this.pullDownState = 'Idle';
                    return;
                }
            }
            if (downDelta < G.ACTIVATION_PX)
                return;
            this.pullDownState = 'Dragging';
        }
        if (this.pullDownState === 'Dragging') {
            event.preventDefault();
            const target = document.getElementById(targetId);
            if (!target || this.pullDownTargetHeight <= 0)
                return;
            const ratio = Math.max(0, Math.min(1, downDelta / this.pullDownTargetHeight));
            const percent = -100 * (1 - ratio);
            target.style.transform = `translateY(${percent}%)`;
        }
    }
    handlePullDownEnd(event, targetId) {
        const prevState = this.pullDownState;
        this.pullDownState = 'Idle';
        this.pullDownScrollable = null;
        if (prevState !== 'Dragging')
            return;
        const target = document.getElementById(targetId);
        if (!target)
            return;
        target.style.transitionTimingFunction = 'ease-out';
        target.style.transitionDuration = '300ms';
        const endTouch = event.changedTouches[0];
        const downDelta = endTouch.clientY - this.pullDownStartY;
        const velocity = this.pullDownVelocity();
        const G = this.DRAWER_GESTURE;
        const shouldCommit = downDelta > G.TB_DRAG_DISTANCE ||
            (velocity > G.FLICK_VELOCITY && downDelta > G.TB_FLICK_MIN_DISTANCE);
        if (shouldCommit) {
            target.style.transform = 'translateY(0%)';
            safeInvoke(this.pullDownDotNetObjRef, 'RevealSearchWithAnimation');
        }
        else {
            target.style.transform = 'translateY(-100%)';
        }
    }
    handlePullDownCancel(_event, targetId) {
        const prevState = this.pullDownState;
        this.pullDownState = 'Idle';
        this.pullDownScrollable = null;
        if (prevState !== 'Dragging')
            return;
        const target = document.getElementById(targetId);
        if (!target)
            return;
        target.style.transitionTimingFunction = 'ease-out';
        target.style.transitionDuration = '300ms';
        target.style.transform = 'translateY(-100%)';
    }
    setupSearchSwipeUpDismissHandler(hostId, dotNetObjRef, removeHandlers = false) {
        if (!removeHandlers) {
            this.searchDismissDotNetObjRef = dotNetObjRef;
        }
        const host = document.getElementById(hostId);
        if (!host)
            return;
        const mapKey = `searchdismiss_${hostId}`;
        if (!this.searchDismissHandlersMap.has(mapKey)) {
            const startFn = (e) => this.handleSearchDismissStart(e, hostId);
            const moveFn = (e) => this.handleSearchDismissMove(e, hostId);
            const endFn = (e) => this.handleSearchDismissEnd(e, hostId);
            const cancelFn = (e) => this.handleSearchDismissCancel(e, hostId);
            this.searchDismissHandlersMap.set(mapKey, { start: startFn, move: moveFn, end: endFn, cancel: cancelFn });
        }
        const { start, move, end, cancel } = this.searchDismissHandlersMap.get(mapKey);
        host.removeEventListener('touchstart', start);
        host.removeEventListener('touchmove', move);
        host.removeEventListener('touchend', end);
        host.removeEventListener('touchcancel', cancel);
        if (!removeHandlers) {
            host.addEventListener('touchstart', start, { passive: false });
            host.addEventListener('touchmove', move, { passive: false });
            host.addEventListener('touchend', end, { passive: false });
            host.addEventListener('touchcancel', cancel, { passive: false });
        }
    }
    searchDismissPushSample(t, y) {
        this.searchDismissPointerSamples.push({ t, y });
        const cutoff = t - this.DRAWER_GESTURE.VELOCITY_SAMPLE_MS;
        while (this.searchDismissPointerSamples.length > 2 && this.searchDismissPointerSamples[0].t < cutoff) {
            this.searchDismissPointerSamples.shift();
        }
    }
    searchDismissVelocity() {
        const s = this.searchDismissPointerSamples;
        if (s.length < 2)
            return 0;
        const first = s[0];
        const last = s[s.length - 1];
        const dt = last.t - first.t;
        if (dt <= 0)
            return 0;
        return -(last.y - first.y) / dt;
    }
    handleSearchDismissStart(event, targetId) {
        const touch = event.touches[0];
        const tgt = event.target;
        if (tgt) {
            const tag = tgt.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tgt.isContentEditable) {
                this.searchDismissState = 'Idle';
                this.searchDismissScrollable = null;
                return;
            }
        }
        this.searchDismissState = 'Deciding';
        this.searchDismissStartX = touch.clientX;
        this.searchDismissStartY = touch.clientY;
        this.searchDismissPointerSamples = [];
        this.searchDismissPushSample(performance.now(), touch.clientY);
        this.searchDismissScrollable = null;
        let currentElement = event.target;
        while (currentElement && currentElement !== document.body) {
            const style = window.getComputedStyle(currentElement);
            const overflowY = style.overflowY;
            const isVerticallyScrollable = (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay')
                && currentElement.scrollHeight > currentElement.clientHeight;
            if (isVerticallyScrollable) {
                this.searchDismissScrollable = { element: currentElement };
                break;
            }
            currentElement = currentElement.parentElement;
        }
        const target = document.getElementById(targetId);
        if (target) {
            this.searchDismissTargetHeight = target.getBoundingClientRect().height;
            target.style.transitionTimingFunction = 'linear';
            target.style.transitionDuration = '0ms';
        }
    }
    handleSearchDismissMove(event, targetId) {
        if (this.searchDismissState === 'Idle')
            return;
        const touch = event.touches[0];
        const now = performance.now();
        this.searchDismissPushSample(now, touch.clientY);
        const dx = touch.clientX - this.searchDismissStartX;
        const dy = touch.clientY - this.searchDismissStartY;
        const upDelta = -dy;
        const G = this.DRAWER_GESTURE;
        if (this.searchDismissState === 'Deciding') {
            if (Math.abs(dx) > Math.abs(dy) * G.CROSS_AXIS_DOMINANCE && Math.abs(dx) > G.CROSS_AXIS_MIN_PX) {
                this.searchDismissState = 'Idle';
                return;
            }
            if (upDelta < 0) {
                this.searchDismissState = 'Idle';
                return;
            }
            if (this.searchDismissScrollable) {
                const el = this.searchDismissScrollable.element;
                const tol = 1;
                const atBottomEdge = (el.scrollTop + el.clientHeight) >= (el.scrollHeight - tol);
                if (!atBottomEdge) {
                    this.searchDismissState = 'Idle';
                    return;
                }
            }
            if (upDelta < G.ACTIVATION_PX)
                return;
            this.searchDismissState = 'Dragging';
        }
        if (this.searchDismissState === 'Dragging') {
            event.preventDefault();
            const target = document.getElementById(targetId);
            if (!target || this.searchDismissTargetHeight <= 0)
                return;
            const ratio = Math.max(0, Math.min(1, upDelta / this.searchDismissTargetHeight));
            const percent = -100 * ratio;
            target.style.transform = `translateY(${percent}%)`;
        }
    }
    handleSearchDismissEnd(event, targetId) {
        const prevState = this.searchDismissState;
        this.searchDismissState = 'Idle';
        this.searchDismissScrollable = null;
        if (prevState !== 'Dragging')
            return;
        const target = document.getElementById(targetId);
        if (!target)
            return;
        target.style.transitionTimingFunction = 'ease-in';
        target.style.transitionDuration = '300ms';
        const endTouch = event.changedTouches[0];
        const upDelta = -(endTouch.clientY - this.searchDismissStartY);
        const velocity = this.searchDismissVelocity();
        const G = this.DRAWER_GESTURE;
        const shouldCommit = upDelta > G.TB_DRAG_DISTANCE ||
            (velocity > G.FLICK_VELOCITY && upDelta > G.TB_FLICK_MIN_DISTANCE);
        if (shouldCommit) {
            this.blurFocusedEditableIn(target);
            target.style.transform = 'translateY(-100%)';
            safeInvoke(this.searchDismissDotNetObjRef, 'DismissSearchFromGesture');
        }
        else {
            target.style.transform = 'translateY(0%)';
        }
    }
    handleSearchDismissCancel(_event, targetId) {
        const prevState = this.searchDismissState;
        this.searchDismissState = 'Idle';
        this.searchDismissScrollable = null;
        if (prevState !== 'Dragging')
            return;
        const target = document.getElementById(targetId);
        if (!target)
            return;
        target.style.transitionTimingFunction = 'ease-out';
        target.style.transitionDuration = '300ms';
        target.style.transform = 'translateY(0%)';
    }
    isKeyboardNavigationLocked() {
        return this.keyboardNavigationLockedToContainer !== null;
    }
    initKeyboardNavLockProvider() {
        window.__venusKeyboardNavLockProvider = {
            isLocked: () => this.keyboardNavigationLockedToContainer !== null
        };
    }
    addKeyboardNavEventListener(elementId, dotnetHelper = null) {
        const element = document.getElementById(elementId);
        if (!element) {
            return;
        }
        if (dotnetHelper) {
            this.keyboardNavDotnetHelper = dotnetHelper;
        }
        if (!this.keyboardNavEventListenersAttached.has(elementId)) {
            element.addEventListener('keydown', this.keyboardNavKeyDownHandlerBound);
            this.keyboardNavEventListenersAttached.add(elementId);
        }
        this.updateKeyboardSelectableElements();
    }
    updateKeyboardSelectableElements(containerId, forceUnlock = false) {
        var _a, _b;
        if (forceUnlock) {
            this.keyboardNavigationLockedToContainer = null;
        }
        if (containerId) {
            this.keyboardNavigationLockedToContainer = containerId;
        }
        const effectiveContainerId = containerId || this.keyboardNavigationLockedToContainer;
        const container = effectiveContainerId ? document.getElementById(effectiveContainerId) : document;
        if (!container) {
            this.keyboardSelectableElements = [];
            this.keyboardSelectableGroups = [];
            return;
        }
        let selectableElements = Array.from(container.querySelectorAll('[keyboard-selectable]'));
        let selectableGroups = Array.from(container.querySelectorAll('[keyboard-selectable-group]'));
        const exclusionProvider = window.__venusKeyboardNavExclusionProvider;
        if ((_a = exclusionProvider === null || exclusionProvider === void 0 ? void 0 : exclusionProvider.isSearchActive) === null || _a === void 0 ? void 0 : _a.call(exclusionProvider)) {
            const excludedSelectors = ((_b = exclusionProvider.getExcludedContainerSelectors) === null || _b === void 0 ? void 0 : _b.call(exclusionProvider)) || [];
            if (excludedSelectors.length > 0) {
                const excludedContainers = [];
                for (const selector of excludedSelectors) {
                    const excludedContainer = document.querySelector(selector);
                    if (excludedContainer) {
                        excludedContainers.push(excludedContainer);
                    }
                }
                if (excludedContainers.length > 0) {
                    selectableElements = selectableElements.filter(el => !excludedContainers.some(ec => ec.contains(el)));
                    selectableGroups = selectableGroups.filter(el => !excludedContainers.some(ec => ec.contains(el)));
                }
            }
        }
        this.keyboardSelectableElements = selectableElements;
        this.keyboardSelectableGroups = selectableGroups;
    }
    keyboardNavKeyDownHandler(event) {
        if (this.keyboardSelectableElements.length === 0)
            return;
        if (event.key === 'ArrowDown' || (event.key === 'n' && event.ctrlKey)) {
            this.handleArrowDownKeyPressed(event);
        }
        else if (event.key === 'ArrowUp' || (event.key === 'p' && event.ctrlKey)) {
            this.handleArrowUpKeyPressed(event);
        }
        else if (event.key === 'ArrowRight' && this.isHorizontalKeyboardNavEnabled()) {
            this.handleArrowDownKeyPressed(event);
        }
        else if (event.key === 'ArrowLeft' && this.isHorizontalKeyboardNavEnabled()) {
            this.handleArrowUpKeyPressed(event);
        }
        else if (event.key === 'Enter') {
            if (event.ctrlKey || event.metaKey) {
                return;
            }
            this.selectCurrentElement(event);
        }
        else if (event.key === 'Tab') {
            this.handleTabKeyPressed(event);
        }
        else if (event.key === 'PageUp') {
            this.handlePageUpKeyPressed(event);
        }
        else if (event.key === 'PageDown') {
            this.handlePageDownKeyPressed(event);
        }
    }
    isHorizontalKeyboardNavEnabled() {
        var _a;
        const id = this.keyboardNavigationLockedToContainer;
        if (!id) {
            return false;
        }
        const container = document.getElementById(id);
        return (_a = container === null || container === void 0 ? void 0 : container.hasAttribute('keyboard-selectable-button-row')) !== null && _a !== void 0 ? _a : false;
    }
    handleArrowDownKeyPressed(event) {
        if (event.shiftKey) {
            this.selectFirstElementInGroup(this.currentKeyboardGroupIndex + 1);
            event.preventDefault();
        }
        else {
            this.selectNextElement(event);
        }
    }
    handleArrowUpKeyPressed(event) {
        if (event.shiftKey) {
            this.selectFirstElementInGroup(this.currentKeyboardGroupIndex - 1);
            event.preventDefault();
        }
        else {
            this.selectPreviousElement(event);
        }
    }
    selectCurrentElement(event) {
        if (this.currentKeyboardElementIndex >= 0 && this.currentKeyboardElementIndex < this.keyboardSelectableElements.length) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            const element = this.keyboardSelectableElements[this.currentKeyboardElementIndex];
            this.lastKeyboardSelectionTime = Date.now();
            element.click();
        }
    }
    wasKeyboardSelectionJustMade() {
        if (!this.lastKeyboardSelectionTime)
            return false;
        return (Date.now() - this.lastKeyboardSelectionTime) < 100;
    }
    handleTabKeyPressed(event) {
        if (event.shiftKey) {
            if (this.keyboardNavDotnetHelper) {
                safeInvoke(this.keyboardNavDotnetHelper, "OnShiftTabKeyPressedAsync");
                event.preventDefault();
            }
        }
        else {
            if (this.keyboardNavDotnetHelper) {
                safeInvoke(this.keyboardNavDotnetHelper, "OnTabKeyPressedAsync");
                event.preventDefault();
            }
        }
    }
    handlePageUpKeyPressed(event) {
        if (event.shiftKey) {
            if (this.currentKeyboardGroupIndex >= 0 && this.currentKeyboardGroupIndex < this.keyboardSelectableGroups.length) {
                this.selectFirstElementInGroup(this.currentKeyboardGroupIndex);
                event.preventDefault();
            }
        }
        else {
            if (this.currentKeyboardGroupIndex < 0 || this.currentKeyboardGroupIndex >= this.keyboardSelectableGroups.length)
                return;
            const groupContainer = this.keyboardSelectableGroups[this.currentKeyboardGroupIndex];
            const scrollableContainer = this.getScrollableParentElement(groupContainer);
            if (!scrollableContainer)
                return;
            const groupElements = Array.from(groupContainer.querySelectorAll('[keyboard-selectable]'));
            if (groupElements.length === 0)
                return;
            const containerHeight = scrollableContainer.clientHeight;
            const oldScrollTop = scrollableContainer.scrollTop;
            scrollableContainer.scrollTop = Math.max(scrollableContainer.scrollTop - containerHeight, 0);
            const newScrollTop = scrollableContainer.scrollTop;
            if (newScrollTop === oldScrollTop) {
                this.selectFirstElementInGroup(this.currentKeyboardGroupIndex);
            }
            else {
                this.selectVisibleElementInContainer(scrollableContainer, groupElements, 'up');
            }
            event.preventDefault();
        }
    }
    handlePageDownKeyPressed(event) {
        if (event.shiftKey) {
            if (this.currentKeyboardGroupIndex >= 0 && this.currentKeyboardGroupIndex < this.keyboardSelectableGroups.length) {
                this.selectLastElementInGroup(this.currentKeyboardGroupIndex);
                event.preventDefault();
            }
        }
        else {
            if (this.currentKeyboardGroupIndex < 0 || this.currentKeyboardGroupIndex >= this.keyboardSelectableGroups.length)
                return;
            const groupContainer = this.keyboardSelectableGroups[this.currentKeyboardGroupIndex];
            const scrollableContainer = this.getScrollableParentElement(groupContainer);
            if (!scrollableContainer)
                return;
            const groupElements = Array.from(groupContainer.querySelectorAll('[keyboard-selectable]'));
            if (groupElements.length === 0)
                return;
            const containerHeight = scrollableContainer.clientHeight;
            const oldScrollTop = scrollableContainer.scrollTop;
            scrollableContainer.scrollTop = Math.min(scrollableContainer.scrollTop + containerHeight, scrollableContainer.scrollHeight - containerHeight);
            const newScrollTop = scrollableContainer.scrollTop;
            if (newScrollTop === oldScrollTop) {
                this.selectLastElementInGroup(this.currentKeyboardGroupIndex);
            }
            else {
                this.selectVisibleElementInContainer(scrollableContainer, groupElements, 'down');
            }
            event.preventDefault();
        }
    }
    clearKeyboardSelectedClassFromDom() {
        const root = this.keyboardNavigationLockedToContainer
            ? document.getElementById(this.keyboardNavigationLockedToContainer)
            : document;
        if (!root)
            return;
        root.querySelectorAll('.keyboard-selected').forEach(e => e.classList.remove('keyboard-selected'));
    }
    selectNextElement(event) {
        this.clearKeyboardSelectedClassFromDom();
        this.currentKeyboardElementIndex++;
        if (this.currentKeyboardElementIndex >= this.keyboardSelectableElements.length) {
            this.currentKeyboardElementIndex = 0;
        }
        this.currentKeyboardGroupIndex = this.keyboardSelectableGroups.findIndex(e => e.contains(this.keyboardSelectableElements[this.currentKeyboardElementIndex]));
        this.keyboardSelectableElements[this.currentKeyboardElementIndex].classList.add('keyboard-selected');
        this.keyboardSelectableElements[this.currentKeyboardElementIndex].scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
        event.preventDefault();
    }
    selectPreviousElement(event) {
        this.clearKeyboardSelectedClassFromDom();
        this.currentKeyboardElementIndex--;
        if (this.currentKeyboardElementIndex < 0) {
            this.currentKeyboardElementIndex = this.keyboardSelectableElements.length - 1;
        }
        this.currentKeyboardGroupIndex = this.keyboardSelectableGroups.findIndex(e => e.contains(this.keyboardSelectableElements[this.currentKeyboardElementIndex]));
        this.keyboardSelectableElements[this.currentKeyboardElementIndex].classList.add('keyboard-selected');
        this.keyboardSelectableElements[this.currentKeyboardElementIndex].scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
        event.preventDefault();
    }
    focusKeyboardSelectableElementByIndex(index, callerContainerId) {
        var _a;
        if (index >= 0 && index < this.keyboardSelectableElements.length) {
            this.clearKeyboardSelectedClassFromDom();
            this.currentKeyboardElementIndex = index;
            this.currentKeyboardGroupIndex = this.keyboardSelectableGroups.findIndex(e => e.contains(this.keyboardSelectableElements[this.currentKeyboardElementIndex]));
            const element = this.keyboardSelectableElements[this.currentKeyboardElementIndex];
            element.classList.add('keyboard-selected');
            if (!callerContainerId || ((_a = document.getElementById(callerContainerId)) === null || _a === void 0 ? void 0 : _a.contains(element))) {
                element.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
            }
        }
    }
    focusKeyboardSelectableElementById(id) {
        const element = this.keyboardSelectableElements.find(e => e.getAttribute('keyboard-selectable-id') === id);
        if (!element) {
            this.clearKeyboardSelectedClassFromDom();
            this.currentKeyboardElementIndex = -1;
            this.currentKeyboardGroupIndex = -1;
            return;
        }
        this.clearKeyboardSelectedClassFromDom();
        this.currentKeyboardElementIndex = this.keyboardSelectableElements.indexOf(element);
        this.currentKeyboardGroupIndex = this.keyboardSelectableGroups.findIndex(e => e.contains(this.keyboardSelectableElements[this.currentKeyboardElementIndex]));
        element.classList.add('keyboard-selected');
        element.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
    }
    selectFirstElementInGroup(groupIndex, callerContainerId) {
        var _a;
        if (groupIndex >= 0 && groupIndex < this.keyboardSelectableGroups.length) {
            const elements = Array.from(this.keyboardSelectableGroups[groupIndex].querySelectorAll('[keyboard-selectable]'));
            if (elements.length > 0) {
                this.clearKeyboardSelectedClassFromDom();
                this.currentKeyboardGroupIndex = groupIndex;
                this.currentKeyboardElementIndex = this.keyboardSelectableElements.indexOf(elements[0]);
                elements[0].classList.add('keyboard-selected');
                if (!callerContainerId || ((_a = document.getElementById(callerContainerId)) === null || _a === void 0 ? void 0 : _a.contains(elements[0]))) {
                    elements[0].scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
                }
            }
        }
    }
    selectLastElementInGroup(groupIndex) {
        if (groupIndex >= 0 && groupIndex < this.keyboardSelectableGroups.length) {
            const elements = Array.from(this.keyboardSelectableGroups[groupIndex].querySelectorAll('[keyboard-selectable]'));
            if (elements.length > 0) {
                this.clearKeyboardSelectedClassFromDom();
                this.currentKeyboardGroupIndex = groupIndex;
                this.currentKeyboardElementIndex = this.keyboardSelectableElements.indexOf(elements[elements.length - 1]);
                elements[elements.length - 1].classList.add('keyboard-selected');
                elements[elements.length - 1].scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
            }
        }
    }
    reselectCurrentKeyboardSelectableElement(scrollIntoView) {
        this.currentKeyboardGroupIndex = this.keyboardSelectableGroups.findIndex(e => e.contains(this.keyboardSelectableElements[this.currentKeyboardElementIndex]));
        this.clearKeyboardSelectedClassFromDom();
        this.keyboardSelectableElements[this.currentKeyboardElementIndex].classList.add('keyboard-selected');
        if (scrollIntoView) {
            this.keyboardSelectableElements[this.currentKeyboardElementIndex].scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
        }
    }
    resetKeyboardSelectableElements() {
        this.currentKeyboardElementIndex = -1;
        this.currentKeyboardGroupIndex = -1;
        this.clearKeyboardSelectedClassFromDom();
    }
    hasKeyboardSelection() {
        return this.currentKeyboardElementIndex >= 0 &&
            this.currentKeyboardElementIndex < this.keyboardSelectableElements.length;
    }
    getCurrentKeyboardSelectionIndex() {
        return this.currentKeyboardElementIndex;
    }
    clickCurrentKeyboardSelectableElement() {
        if (this.currentKeyboardElementIndex >= 0 && this.currentKeyboardElementIndex < this.keyboardSelectableElements.length) {
            const element = this.keyboardSelectableElements[this.currentKeyboardElementIndex];
            this.lastKeyboardSelectionTime = Date.now();
            element.click();
        }
    }
    registerTrueClickHandler(elementId, callbackMethod, dotNetHelper) {
        const element = document.getElementById(elementId);
        if (!element) {
            console.error(`Element with id '${elementId}' not found for true click handler.`);
            return;
        }
        element.addEventListener('pointerdown', (event) => {
            if (event.button !== 0) {
                return;
            }
            const clickedOnBackground = event.target === element ||
                (event.target instanceof Element &&
                    event.target.parentElement === element &&
                    !event.target.closest('[id$="Dialog"]'));
            element.dataset.pointerDownOnContainer = clickedOnBackground.toString();
        });
        element.addEventListener('pointerup', (event) => {
            if (event.button !== 0) {
                return;
            }
            const startedOnContainer = element.dataset.pointerDownOnContainer === "true";
            element.dataset.pointerDownOnContainer = "false";
            if (startedOnContainer) {
                const releasedOnBackground = event.target === element ||
                    (event.target instanceof Element &&
                        event.target.parentElement === element &&
                        !event.target.closest('[id$="Dialog"]'));
                if (releasedOnBackground) {
                    safeInvoke(dotNetHelper, callbackMethod);
                }
            }
        });
    }
    registerHoverHandler(elementId, callbackMethod, dotNetHelper) {
        const element = document.getElementById(elementId);
        if (!element) {
            console.error(`Element with id '${elementId}' not found for hover handler.`);
            return;
        }
        element.addEventListener('pointermove', (event) => {
            const hoveredOnBackground = event.target === element ||
                (event.target instanceof Element &&
                    event.target.parentElement === element &&
                    !event.target.closest('[id$="Dialog"]'));
            if (hoveredOnBackground) {
                const dialogElement = element.querySelector(':scope > div > .dialog-base');
                if (dialogElement) {
                    if (dialogElement.dataset.isDragging === "true") {
                        return;
                    }
                    const rect = dialogElement.getBoundingClientRect();
                    const bufferZone = 20;
                    const farFromLeft = event.clientX < rect.left - bufferZone;
                    const farFromRight = event.clientX > rect.right + bufferZone;
                    const farFromTop = event.clientY < rect.top - bufferZone;
                    const farFromBottom = event.clientY > rect.bottom + bufferZone;
                    if (farFromLeft || farFromRight || farFromTop || farFromBottom) {
                        safeInvoke(dotNetHelper, callbackMethod);
                    }
                }
            }
        });
    }
    setBaseFontSize(fontSize) {
        document.documentElement.style.fontSize = `${fontSize}px`;
    }
    getScrollableParentElement(el) {
        while (el && el !== document.body && el !== document.documentElement) {
            const overflowY = window.getComputedStyle(el).overflowY;
            if (overflowY === 'auto' || overflowY === 'scroll') {
                if (el.scrollHeight > el.clientHeight) {
                    return el;
                }
            }
            el = el.parentElement;
        }
        return null;
    }
    selectVisibleElementInContainer(scrollableContainer, groupElements, direction) {
        const containerRect = scrollableContainer.getBoundingClientRect();
        this.clearKeyboardSelectedClassFromDom();
        let chosenIndexInGroup = -1;
        let chosenElementTop = Infinity;
        for (let i = 0; i < groupElements.length; i++) {
            const el = groupElements[i];
            const elRect = el.getBoundingClientRect();
            const elRelativeTop = elRect.top - containerRect.top;
            const elRelativeBottom = elRect.bottom - containerRect.top;
            const isVisible = elRelativeBottom > 0 && elRelativeTop < containerRect.height;
            if (isVisible && elRelativeTop >= 0 && elRelativeTop < chosenElementTop) {
                chosenElementTop = elRelativeTop;
                chosenIndexInGroup = i;
            }
        }
        if (chosenIndexInGroup === -1) {
            chosenElementTop = Infinity;
            for (let i = 0; i < groupElements.length; i++) {
                const el = groupElements[i];
                const elRect = el.getBoundingClientRect();
                const elRelativeTop = elRect.top - containerRect.top;
                const elRelativeBottom = elRelativeTop + elRect.height;
                const isVisible = elRelativeBottom > 0 && elRelativeTop < containerRect.height;
                if (isVisible && elRelativeTop < chosenElementTop) {
                    chosenElementTop = elRelativeTop;
                    chosenIndexInGroup = i;
                }
            }
        }
        if (chosenIndexInGroup === -1) {
            chosenIndexInGroup = (direction === 'down') ? groupElements.length - 1 : 0;
        }
        const chosenElement = groupElements[chosenIndexInGroup];
        this.currentKeyboardElementIndex = this.keyboardSelectableElements.indexOf(chosenElement);
        this.currentKeyboardGroupIndex = this.keyboardSelectableGroups.findIndex(g => g.contains(chosenElement));
        chosenElement.classList.add('keyboard-selected');
        chosenElement.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
    }
    detachKeyboardNavEventListener(elementId) {
        const element = document.getElementById(elementId);
        if (!element) {
            return;
        }
        this.currentKeyboardElementIndex = -1;
        this.keyboardSelectableElements = [];
        if (this.keyboardNavEventListenersAttached.has(elementId)) {
            element.removeEventListener('keydown', this.keyboardNavKeyDownHandlerBound);
            this.keyboardNavEventListenersAttached.delete(elementId);
        }
    }
    enforceExistenceDependence(parentId, childId) {
        this.existenceDependencyManager.enforceExistenceDependence(parentId, childId);
    }
    setupMenuKeyboardNav(containerId) {
        const container = document.getElementById(containerId);
        if (!container)
            return;
        const topMenu = container.querySelector('[role="menu"]');
        if (!topMenu)
            return;
        this.cleanupMenuKeyboardNav(containerId);
        const menuStack = [topMenu];
        const getActiveMenu = () => menuStack[menuStack.length - 1];
        const getMenuItems = (menuEl) => {
            const items = [];
            menuEl.querySelectorAll('[role="menuitem"]').forEach(el => {
                if (el.closest('[role="menu"]') !== menuEl)
                    return;
                const parent = el.parentElement;
                if (parent === null || parent === void 0 ? void 0 : parent.classList.contains('pointer-events-none'))
                    return;
                if (el.offsetParent === null)
                    return;
                items.push(el);
            });
            return items;
        };
        const getFocusedItem = (menuEl) => {
            return menuEl.querySelector('[role="menuitem"].menu-keyboard-focused');
        };
        const clearFocus = (menuEl) => {
            menuEl.querySelectorAll('.menu-keyboard-focused').forEach(el => el.classList.remove('menu-keyboard-focused'));
        };
        const focusItem = (item) => {
            container.querySelectorAll('.menu-keyboard-focused').forEach(el => el.classList.remove('menu-keyboard-focused'));
            item.classList.add('menu-keyboard-focused');
            item.scrollIntoView({ block: "nearest", behavior: "instant" });
        };
        const isSubmenuItem = (item) => {
            return item.querySelector('.fa-chevron-right, .fa-chevron-down') !== null;
        };
        const openSubmenu = (item) => {
            const wrapper = item.parentElement;
            if (wrapper)
                wrapper.click();
            requestAnimationFrame(() => {
                setTimeout(() => {
                    const wrapper = item.parentElement;
                    if (!wrapper)
                        return;
                    const parentMenu = item.closest('[role="menu"]');
                    if (!parentMenu)
                        return;
                    const subContainers = parentMenu.querySelectorAll('.submenu-container [role="menu"], .submenu-container[role="menu"]');
                    let subMenu = null;
                    subContainers.forEach(el => {
                        if (el.offsetParent !== null) {
                            subMenu = el;
                        }
                    });
                    if (!subMenu) {
                        const nextEl = wrapper.nextElementSibling;
                        if (nextEl) {
                            subMenu = nextEl.querySelector('[role="menu"]');
                        }
                    }
                    if (subMenu) {
                        menuStack.push(subMenu);
                        const items = getMenuItems(subMenu);
                        if (items.length > 0) {
                            focusItem(items[0]);
                        }
                    }
                }, 50);
            });
        };
        const closeSubmenu = () => {
            if (menuStack.length <= 1)
                return false;
            const closingMenu = menuStack.pop();
            clearFocus(closingMenu);
            const parentMenu = getActiveMenu();
            const focusedParent = getFocusedItem(parentMenu);
            if (focusedParent) {
                const wrapper = focusedParent.parentElement;
                if (wrapper)
                    wrapper.click();
                requestAnimationFrame(() => {
                    setTimeout(() => {
                        const items = getMenuItems(getActiveMenu());
                        const refocused = items.find(i => i.classList.contains('menu-keyboard-focused'));
                        if (refocused) {
                            refocused.scrollIntoView({ block: "nearest", behavior: "instant" });
                        }
                    }, 50);
                });
            }
            return true;
        };
        const handler = (event) => {
            const activeMenu = getActiveMenu();
            const items = getMenuItems(activeMenu);
            if (items.length === 0)
                return;
            const currentItem = getFocusedItem(activeMenu);
            const currentIndex = currentItem ? items.indexOf(currentItem) : -1;
            if (event.key === 'ArrowDown') {
                event.preventDefault();
                event.stopPropagation();
                if (currentIndex < 0) {
                    focusItem(items[0]);
                }
                else {
                    focusItem(items[(currentIndex + 1) % items.length]);
                }
            }
            else if (event.key === 'ArrowUp') {
                event.preventDefault();
                event.stopPropagation();
                if (currentIndex < 0) {
                    focusItem(items[items.length - 1]);
                }
                else {
                    focusItem(items[(currentIndex - 1 + items.length) % items.length]);
                }
            }
            else if (event.key === 'Enter' || (event.key === ' ' && !(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement))) {
                event.preventDefault();
                event.stopPropagation();
                if (currentItem) {
                    if (isSubmenuItem(currentItem)) {
                        openSubmenu(currentItem);
                    }
                    else {
                        const wrapper = currentItem.parentElement;
                        if (wrapper)
                            wrapper.click();
                    }
                }
            }
            else if (event.key === 'ArrowRight') {
                if (currentItem && isSubmenuItem(currentItem)) {
                    event.preventDefault();
                    event.stopPropagation();
                    openSubmenu(currentItem);
                }
            }
            else if (event.key === 'ArrowLeft') {
                if (menuStack.length > 1) {
                    event.preventDefault();
                    event.stopPropagation();
                    closeSubmenu();
                }
            }
            else if (event.key === 'Escape') {
                if (menuStack.length > 1) {
                    event.preventDefault();
                    event.stopPropagation();
                    closeSubmenu();
                }
            }
        };
        container.addEventListener('keydown', handler);
        topMenu.setAttribute('tabindex', '0');
        topMenu.focus();
        this.menuKeyboardNavHandlers.set(containerId, { handler, menuStack });
    }
    cleanupMenuKeyboardNav(containerId) {
        const existing = this.menuKeyboardNavHandlers.get(containerId);
        if (existing) {
            const container = document.getElementById(containerId);
            if (container) {
                container.removeEventListener('keydown', existing.handler);
            }
            const selectedGroup = document.querySelector('[keyboard-selectable-group]:has(.keyboard-selected)');
            if (selectedGroup) {
                selectedGroup.focus();
            }
            this.menuKeyboardNavHandlers.delete(containerId);
        }
    }
    playVideoFullscreenOnStart(videoId) {
        const videoElement = document.getElementById(videoId);
        if (!videoElement)
            return;
        videoElement.addEventListener('play', () => {
            if (videoElement.requestFullscreen) {
                videoElement.requestFullscreen();
            }
            else if (videoElement.webkitRequestFullscreen) {
                videoElement.webkitRequestFullscreen();
            }
        });
    }
    registerVenusProbeDotNetHandler(dotNetReference) {
        this.venusProbeDotNetRef = dotNetReference;
    }
    requestCursorTracking() {
        if (this.venusProbeDotNetRef) {
            safeInvoke(this.venusProbeDotNetRef, 'RequestCursorTracking');
        }
    }
    releaseCursorTracking() {
        if (this.venusProbeDotNetRef) {
            safeInvoke(this.venusProbeDotNetRef, 'ReleaseCursorTracking');
        }
    }
    cursorMoved(screenX, screenY) {
        const clientX = screenX - (window.screenX || window.screenLeft || 0);
        const clientY = screenY - (window.screenY || window.screenTop || 0);
        const mouseMoveEvent = new MouseEvent('mousemove', {
            clientX: clientX,
            clientY: clientY,
            screenX: screenX,
            screenY: screenY,
            bubbles: true,
            cancelable: true
        });
        document.dispatchEvent(mouseMoveEvent);
    }
    initTabDragDrop(tabBarId, instanceId) {
        const tabBarElement = document.getElementById(tabBarId);
        if (!tabBarElement)
            return;
        this.cleanupTabDragDrop(tabBarId);
        const isVertical = tabBarId.includes('vertical');
        const state = {
            element: tabBarElement,
            dotNetRef: null,
            draggedTabId: null,
            draggedTab: null,
            ghostElement: null,
            isDragging: false,
            isOverTabBar: null,
            startingX: 0,
            startingY: 0,
            tabMidPoints: new Map(),
            isVertical: isVertical,
            mouseDownTarget: null,
            hasDragStarted: false,
            instanceId: instanceId || null
        };
        this.tabBarStates.set(tabBarId, state);
        tabBarElement.addEventListener('mousedown', this.handleTabMouseDown.bind(this));
        tabBarElement.dataset.dragdropInitialized = 'true';
        tabBarElement.dataset.tabBarId = tabBarId;
        tabBarElement.dataset.isVertical = isVertical.toString();
    }
    cleanupTabDragDrop(tabBarId, instanceId) {
        if (tabBarId) {
            const state = this.tabBarStates.get(tabBarId);
            if (!state || state.element.dataset.dragdropInitialized !== 'true')
                return;
            if (instanceId && state.instanceId && state.instanceId !== instanceId)
                return;
            state.element.removeEventListener('mousedown', this.handleTabMouseDown.bind(this));
            this.cleanupMouseDrag();
            this.tabBarStates.delete(tabBarId);
            delete state.element.dataset.dragdropInitialized;
        }
        else {
            for (const [id, state] of this.tabBarStates) {
                this.cleanupTabDragDrop(id);
            }
        }
    }
    cleanupMouseDrag() {
        if (this.boundMouseMove) {
            document.removeEventListener('mousemove', this.boundMouseMove);
            this.boundMouseMove = null;
        }
        if (this.boundMouseUp) {
            document.removeEventListener('mouseup', this.boundMouseUp);
            this.boundMouseUp = null;
        }
    }
    getCurrentDragState() {
        if (!this.currentDragTabBarId)
            return null;
        return this.tabBarStates.get(this.currentDragTabBarId) || null;
    }
    findTabBarForElement(element) {
        for (const [tabBarId, state] of this.tabBarStates) {
            if (state.element.contains(element)) {
                return tabBarId;
            }
        }
        return null;
    }
    handleTabMouseDown(event) {
        if (event.button !== 0)
            return;
        const tabElement = this.findTabElementFromEvent(event);
        if (!tabElement)
            return;
        const target = event.target;
        if (target.closest('.fa-close') || target.closest('[class*="close"]')) {
            return;
        }
        const tabBarId = this.findTabBarForElement(tabElement);
        if (!tabBarId)
            return;
        const state = this.tabBarStates.get(tabBarId);
        if (!state)
            return;
        state.mouseDownTarget = tabElement;
        state.startingX = event.clientX;
        state.startingY = event.clientY;
        state.hasDragStarted = false;
        this.currentDragTabBarId = tabBarId;
        this.boundMouseMove = this.handleTabMouseMove.bind(this);
        this.boundMouseUp = this.handleTabMouseUp.bind(this);
        document.addEventListener('mousemove', this.boundMouseMove);
        document.addEventListener('mouseup', this.boundMouseUp);
        event.preventDefault();
    }
    handleTabMouseMove(event) {
        const state = this.getCurrentDragState();
        if (!state || !state.mouseDownTarget)
            return;
        const deltaX = event.clientX - state.startingX;
        const deltaY = event.clientY - state.startingY;
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        if (!state.hasDragStarted) {
            if (distance < this.MIN_DRAG_DISTANCE) {
                return;
            }
            this.startTabDrag(state, event);
        }
        this.updateTabDrag(state, event);
    }
    handleTabMouseUp(event) {
        const state = this.getCurrentDragState();
        this.cleanupMouseDrag();
        if (!state)
            return;
        if (state.hasDragStarted) {
            this.endTabDrag(state, event);
        }
        state.mouseDownTarget = null;
        state.hasDragStarted = false;
    }
    startTabDrag(state, event) {
        const tabElement = state.mouseDownTarget;
        if (!tabElement)
            return;
        const tabId = this.getTabId(tabElement);
        if (!tabId)
            return;
        state.hasDragStarted = true;
        state.draggedTabId = tabId;
        state.draggedTab = tabElement;
        state.isDragging = true;
        state.isOverTabBar = true;
        state.tabMidPoints.clear();
        const tabs = state.element.querySelectorAll('.tab-item');
        tabs.forEach((t) => {
            const tab = t;
            const rect = tab.getBoundingClientRect();
            if (state.isVertical) {
                state.tabMidPoints.set(tab.id, rect.top + rect.height / 2);
            }
            else {
                state.tabMidPoints.set(tab.id, rect.left + rect.width / 2);
            }
            tab.style.transitionDuration = '200ms';
        });
        tabElement.classList.add('is-drag-source');
        tabElement.classList.add('dragging');
        tabElement.style.transitionDuration = '0s';
        this.createTabGhost(state, tabElement);
        document.body.classList.add('select-none');
        if (state.dotNetRef) {
            safeInvoke(state.dotNetRef, 'DragStarted', [state.draggedTabId]);
        }
    }
    createTabGhost(state, tabElement) {
        const ghost = tabElement.cloneNode(true);
        ghost.classList.remove('is-drag-source', 'dragging');
        ghost.classList.add('tab-drag-ghost');
        const rect = tabElement.getBoundingClientRect();
        ghost.style.position = 'fixed';
        ghost.style.left = `${rect.left}px`;
        ghost.style.top = `${rect.top}px`;
        ghost.style.width = `${rect.width}px`;
        ghost.style.height = `${rect.height}px`;
        ghost.style.zIndex = '10000';
        ghost.style.pointerEvents = 'none';
        ghost.style.opacity = '0.9';
        ghost.style.transition = 'opacity 0.15s ease-out';
        document.body.appendChild(ghost);
        state.ghostElement = ghost;
    }
    updateTabDrag(state, event) {
        if (!state.isDragging || !state.draggedTab || !state.ghostElement)
            return;
        const rect = state.draggedTab.getBoundingClientRect();
        const deltaX = event.clientX - state.startingX;
        const deltaY = event.clientY - state.startingY;
        if (state.isVertical) {
            state.ghostElement.style.transform = `translateY(${deltaY}px)`;
        }
        else {
            state.ghostElement.style.transform = `translateX(${deltaX}px)`;
        }
        this.checkIfOverTabBarMouse(state, event);
        this.processTabChangesForDrag(event);
    }
    checkIfOverTabBarMouse(state, event) {
        const tabBarRect = state.element.getBoundingClientRect();
        const lastIsOverTabBar = state.isOverTabBar;
        state.isOverTabBar = (event.clientX >= tabBarRect.left &&
            event.clientX <= tabBarRect.right &&
            event.clientY >= tabBarRect.top &&
            event.clientY <= tabBarRect.bottom);
        if (!state.isOverTabBar) {
            if (lastIsOverTabBar || lastIsOverTabBar === null) {
                if (state.ghostElement) {
                    state.ghostElement.style.opacity = '0';
                }
                if (state.dotNetRef) {
                    safeInvoke(state.dotNetRef, 'StartFloatingTab', [state.draggedTabId]);
                }
            }
        }
        else {
            if (!lastIsOverTabBar && lastIsOverTabBar !== null) {
                if (state.ghostElement) {
                    state.ghostElement.style.opacity = '0.9';
                }
                if (state.dotNetRef) {
                    safeInvoke(state.dotNetRef, 'StopFloatingTab', [state.draggedTabId]);
                }
            }
        }
    }
    endTabDrag(state, event) {
        if (!state.isDragging)
            return;
        const tabBarRect = state.element.getBoundingClientRect();
        const isOverTabBar = (event.clientX >= tabBarRect.left &&
            event.clientX <= tabBarRect.right &&
            event.clientY >= tabBarRect.top &&
            event.clientY <= tabBarRect.bottom);
        if (isOverTabBar && state.draggedTabId && state.draggedTab) {
            this.handleTabDrop(state, event);
        }
        if (state.ghostElement) {
            state.ghostElement.remove();
            state.ghostElement = null;
        }
        if (state.draggedTab) {
            state.draggedTab.classList.remove('is-drag-source');
            state.draggedTab.style.transform = '';
        }
        const tabs = state.element.querySelectorAll('.tab-item');
        tabs.forEach((t) => {
            const tab = t;
            tab.classList.remove('dragging');
            tab.style.transform = '';
            tab.style.transitionDuration = '0s';
            setTimeout(() => {
                tab.style.transitionDuration = '300ms';
            }, 150);
        });
        document.body.classList.remove('select-none');
        if (state.dotNetRef) {
            const wasDroppedOutside = !isOverTabBar;
            safeInvoke(state.dotNetRef, 'DragEnded', [state.draggedTabId, wasDroppedOutside]);
        }
        state.draggedTabId = null;
        state.draggedTab = null;
        state.isDragging = false;
        this.currentDragTabBarId = null;
    }
    handleTabDrop(state, event) {
        if (!state.draggedTabId || !state.draggedTab)
            return;
        const startDraggedTabMid = state.tabMidPoints.get(state.draggedTab.id);
        if (startDraggedTabMid === undefined)
            return;
        const isVertical = state.isVertical;
        const offset = isVertical
            ? startDraggedTabMid - state.startingY
            : startDraggedTabMid - state.startingX;
        const draggedTabMid = isVertical
            ? event.clientY + offset
            : event.clientX + offset;
        const tabs = state.element.querySelectorAll('.tab-item:not(.dragging)');
        let beforeTabs = [];
        let afterTabs = [];
        const startingPos = isVertical ? state.startingY : state.startingX;
        tabs.forEach((t) => {
            const tab = t;
            if (tab !== state.draggedTab) {
                const midPoint = state.tabMidPoints.get(tab.id);
                if (midPoint === undefined)
                    return;
                if (midPoint < startingPos) {
                    beforeTabs.push(tab);
                }
                else {
                    afterTabs.push(tab);
                }
            }
        });
        afterTabs = afterTabs.reverse();
        let targetTabId = null;
        let position = '';
        beforeTabs.forEach(tab => {
            if (targetTabId)
                return;
            let compPoint = state.tabMidPoints.get(tab.id);
            if (compPoint === undefined)
                return;
            const halfSize = isVertical ? tab.offsetHeight / 2 : tab.offsetWidth / 2;
            compPoint += halfSize;
            if (draggedTabMid < compPoint) {
                targetTabId = this.getTabId(tab);
                position = 'before';
                return;
            }
        });
        afterTabs.forEach(tab => {
            if (targetTabId)
                return;
            let compPoint = state.tabMidPoints.get(tab.id);
            if (compPoint === undefined)
                return;
            const halfSize = isVertical ? tab.offsetHeight / 2 : tab.offsetWidth / 2;
            compPoint -= halfSize;
            if (draggedTabMid >= compPoint) {
                targetTabId = this.getTabId(tab);
                position = 'after';
                return;
            }
        });
        if (targetTabId && position) {
            if (state.dotNetRef) {
                safeInvoke(state.dotNetRef, 'ReorderTabs', [state.draggedTabId, targetTabId, position]);
            }
        }
    }
    processTabChangesForDrag(event) {
        const state = this.getCurrentDragState();
        if (!state || !state.isDragging || !state.draggedTabId || !state.draggedTab)
            return;
        const startDraggedTabMid = state.tabMidPoints.get(state.draggedTab.id);
        if (startDraggedTabMid === undefined)
            return;
        const isVertical = state.isVertical;
        const offset = isVertical
            ? startDraggedTabMid - state.startingY
            : startDraggedTabMid - state.startingX;
        let draggedTabMid = isVertical
            ? event.clientY + offset
            : event.clientX + offset;
        if (!state.isOverTabBar) {
            draggedTabMid = 999999;
        }
        const tabs = state.element.querySelectorAll('.tab-item:not(.dragging)');
        const beforeTabs = [];
        const afterTabs = [];
        const startingPos = isVertical ? state.startingY : state.startingX;
        tabs.forEach((t) => {
            const tab = t;
            if (tab !== state.draggedTab) {
                const midPoint = state.tabMidPoints.get(tab.id);
                if (midPoint === undefined)
                    return;
                if (midPoint < startingPos) {
                    beforeTabs.push(tab);
                }
                else {
                    afterTabs.push(tab);
                }
            }
        });
        let offsetDraggedTab = 0;
        const tabSize = isVertical
            ? state.draggedTab.offsetHeight + 8
            : state.draggedTab.offsetWidth + 8;
        beforeTabs.forEach(tab => {
            let compPoint = state.tabMidPoints.get(tab.id);
            if (compPoint === undefined)
                return;
            const halfSize = isVertical ? tab.offsetHeight / 2 : tab.offsetWidth / 2;
            compPoint += halfSize;
            if (draggedTabMid < compPoint) {
                const transform = isVertical
                    ? `translateY(${tabSize}px)`
                    : `translateX(${tabSize}px)`;
                tab.style.transform = transform;
                offsetDraggedTab -= isVertical ? tab.offsetHeight : tab.offsetWidth;
            }
            else {
                tab.style.transform = '';
            }
        });
        afterTabs.forEach(tab => {
            let compPoint = state.tabMidPoints.get(tab.id);
            if (compPoint === undefined)
                return;
            const halfSize = isVertical ? tab.offsetHeight / 2 : tab.offsetWidth / 2;
            compPoint -= halfSize;
            if (draggedTabMid >= compPoint) {
                const transform = isVertical
                    ? `translateY(-${tabSize}px)`
                    : `translateX(-${tabSize}px)`;
                tab.style.transform = transform;
                offsetDraggedTab += isVertical ? tab.offsetHeight : tab.offsetWidth;
            }
            else {
                tab.style.transform = '';
            }
        });
        const draggedTransform = isVertical
            ? `translateY(${offsetDraggedTab}px)`
            : `translateX(${offsetDraggedTab}px)`;
        state.draggedTab.style.transform = draggedTransform;
    }
    registerTabDragDotNetHandler(dotNetReference, tabBarId) {
        const state = this.tabBarStates.get(tabBarId);
        if (state) {
            state.dotNetRef = dotNetReference;
        }
    }
    findTabElementFromEvent(event) {
        let target = event.target;
        while (target && !target.classList.contains('tab-item')) {
            target = target.parentElement;
            if (!target)
                return null;
        }
        return target;
    }
    getTabId(tabElement) {
        return tabElement ? tabElement.id.replace('tab-', '') : null;
    }
    clearTabTransforms(tabBarId) {
        if (tabBarId) {
            const state = this.tabBarStates.get(tabBarId);
            if (!state)
                return;
            const tabs = state.element.querySelectorAll('.tab-item');
            tabs.forEach(t => {
                const tab = t;
                tab.style.transform = ``;
            });
        }
        else {
            const state = this.getCurrentDragState();
            if (!state) {
                for (const [id, tabBarState] of this.tabBarStates) {
                    const tabs = tabBarState.element.querySelectorAll('.tab-item');
                    tabs.forEach(t => {
                        const tab = t;
                        tab.style.transform = ``;
                    });
                }
                return;
            }
            const tabs = state.element.querySelectorAll('.tab-item');
            tabs.forEach(t => {
                const tab = t;
                tab.style.transform = ``;
            });
        }
    }
    startSizeMonitoringByClass(className, callbackMethod, dotNetHelper, debounceMs = 100) {
        const elements = document.querySelectorAll(`.${className}`);
        if (elements.length === 0) {
            console.error(`No elements found with class '${className}' for size monitoring.`);
            return;
        }
        this.currentCallback = { method: callbackMethod, helper: dotNetHelper };
        this.debounceDelay = debounceMs;
        elements.forEach((element) => {
            const existingObserver = this.observers.get(element);
            if (existingObserver) {
                existingObserver.disconnect();
            }
            const observer = new ResizeObserver(() => {
                this.scheduleCallback();
            });
            observer.observe(element);
            this.observers.set(element, observer);
        });
        if (!this.windowResizeListener) {
            this.windowResizeListener = () => {
                this.scheduleCallback();
            };
            window.addEventListener('resize', this.windowResizeListener);
        }
        console.log(`Started monitoring ${elements.length} elements with class '${className}'`);
        this.scheduleCallback();
    }
    scheduleCallback() {
        if (this.debounceTimeout) {
            clearTimeout(this.debounceTimeout);
        }
        this.debounceTimeout = window.setTimeout(() => {
            this.sendBatchedCallback();
        }, this.debounceDelay);
    }
    sendBatchedCallback() {
        if (!this.currentCallback)
            return;
        const elementData = [];
        this.observers.forEach((observer, element) => {
            const htmlElement = element;
            elementData.push({
                id: htmlElement.id || '',
                className: htmlElement.className,
                left: htmlElement.offsetLeft,
                top: htmlElement.offsetTop,
                width: htmlElement.offsetWidth,
                height: htmlElement.offsetHeight
            });
        });
        if (elementData.length > 0) {
            safeInvoke(this.currentCallback.helper, this.currentCallback.method, [elementData, window.devicePixelRatio]);
        }
    }
    disposeAllSizeMonitoringObservers() {
        if (this.debounceTimeout) {
            clearTimeout(this.debounceTimeout);
            this.debounceTimeout = null;
        }
        this.observers.forEach(observer => observer.disconnect());
        this.observers.clear();
        if (this.windowResizeListener) {
            window.removeEventListener('resize', this.windowResizeListener);
            this.windowResizeListener = null;
        }
        this.currentCallback = null;
    }
    highlightSearchText(containerId, searchQuery, highlightClass = 'search-highlight') {
        const container = document.getElementById(containerId);
        if (!container) {
            return;
        }
        this.clearHighlights(containerId, highlightClass);
        const trimmedQuery = searchQuery.trim();
        if (!trimmedQuery) {
            return;
        }
        const regex = new RegExp(`\\b(${this.escapeRegExp(trimmedQuery)})`, 'gi');
        this.highlightTextNodes(container, regex, highlightClass);
    }
    clearHighlights(containerId, highlightClass = 'search-highlight') {
        const container = document.getElementById(containerId);
        if (!container) {
            return;
        }
        const highlights = container.querySelectorAll(`.${highlightClass}, .search-highlight, .settings-search-highlight`);
        const parentsToNormalize = new Set();
        highlights.forEach(highlight => {
            const parent = highlight.parentNode;
            if (parent) {
                const textNode = document.createTextNode(highlight.textContent || '');
                parent.replaceChild(textNode, highlight);
                parentsToNormalize.add(parent);
            }
        });
        const wrappers = container.querySelectorAll('.search-text-wrapper');
        wrappers.forEach(wrapper => {
            const parent = wrapper.parentNode;
            if (parent) {
                const textNode = document.createTextNode(wrapper.textContent || '');
                parent.replaceChild(textNode, wrapper);
                parentsToNormalize.add(parent);
            }
        });
        parentsToNormalize.forEach(parent => {
            if (parent.nodeType === Node.ELEMENT_NODE) {
                parent.normalize();
            }
        });
    }
    escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    highlightTextNodes(node, regex, highlightClass) {
        if (node.nodeType === Node.TEXT_NODE) {
            const textContent = node.textContent || '';
            const parent = node.parentNode;
            if (!parent)
                return;
            const isInSpan = parent.nodeType === Node.ELEMENT_NODE &&
                parent.tagName.toLowerCase() === 'span';
            if (!isInSpan && textContent.trim()) {
                const wrapperSpan = document.createElement('span');
                wrapperSpan.className = 'search-text-wrapper';
                wrapperSpan.textContent = textContent;
                parent.replaceChild(wrapperSpan, node);
                this.highlightTextNodes(wrapperSpan, regex, highlightClass);
                return;
            }
            const matches = [];
            let match;
            while ((match = regex.exec(textContent)) !== null) {
                matches.push(match);
                if (!regex.global)
                    break;
            }
            if (matches.length > 0) {
                const parent = node.parentNode;
                if (!parent)
                    return;
                matches.reverse().forEach(match => {
                    const matchStart = match.index;
                    const matchEnd = matchStart + match[0].length;
                    const range = document.createRange();
                    range.setStart(node, matchStart);
                    range.setEnd(node, matchEnd);
                    const matchedText = range.extractContents();
                    const highlightSpan = document.createElement('span');
                    highlightSpan.className = highlightClass;
                    highlightSpan.appendChild(matchedText);
                    range.insertNode(highlightSpan);
                });
            }
        }
        else if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node;
            if (!element.classList.contains(highlightClass) && !element.classList.contains('no-highlight')) {
                const childNodes = Array.from(node.childNodes);
                childNodes.forEach(child => this.highlightTextNodes(child, regex, highlightClass));
            }
        }
    }
    applyCssVarsToTag(cssText, tagId) {
        let styleTag = document.getElementById(tagId);
        if (!styleTag) {
            styleTag = document.createElement('style');
            styleTag.id = tagId;
            document.head.appendChild(styleTag);
        }
        styleTag.textContent = cssText;
    }
    removeCssVars() {
        var _a, _b;
        (_a = document.getElementById('venus-vapp')) === null || _a === void 0 ? void 0 : _a.remove();
        (_b = document.getElementById('venus-vusr')) === null || _b === void 0 ? void 0 : _b.remove();
    }
    removeAppCssVars() {
        var _a;
        (_a = document.getElementById('venus-vapp')) === null || _a === void 0 ? void 0 : _a.remove();
    }
    applyAppVenusCssVarsFromColors(bgR, bgG, bgB, fgR, fgG, fgB, accentR, accentG, accentB) {
        console.log(`[VenusUtils] applyAppVenusCssVarsFromColors called, bg=(${bgR},${bgG},${bgB}), fg=(${fgR},${fgG},${fgB}), accent=(${accentR},${accentG},${accentB})`);
        const bg = { r: bgR, g: bgG, b: bgB };
        const fg = { r: fgR, g: fgG, b: fgB };
        const accent = { r: accentR, g: accentG, b: accentB };
        const isDark = this.isDarkColor(bg);
        const vappCss = this.generateVenusCssVars(bg, fg, accent, isDark, "vapp");
        this.applyCssVarsToTag(vappCss, 'venus-vapp');
        console.log(`[VenusUtils] applyAppVenusCssVarsFromColors completed`);
    }
    applyAppVenusCssVarsFromTwoColors(bgR, bgG, bgB, fgR, fgG, fgB) {
        const bgOklch = this.rgbToOklch(bgR, bgG, bgB);
        const isDarkBg = bgOklch.l < 0.5;
        const accentL = isDarkBg ? 0.7 : 0.3;
        const accentH = bgOklch.c > this.ACHROMATIC_THRESHOLD ? bgOklch.h : 265;
        const accentC = this.findMaxChromaForLH(accentL, accentH);
        const accent = this.oklchToRgb(accentL, accentC, accentH);
        console.log(`[VenusUtils] applyAppVenusCssVarsFromTwoColors: generated accent=(${accent.r},${accent.g},${accent.b}) from L=${accentL.toFixed(3)}, C=${accentC.toFixed(3)}, H=${accentH.toFixed(1)}`);
        this.applyAppVenusCssVarsFromColors(bgR, bgG, bgB, fgR, fgG, fgB, accent.r, accent.g, accent.b);
    }
    applyUserVenusCssVarsFromColors(bgR, bgG, bgB, fgR, fgG, fgB, accentR, accentG, accentB) {
        console.log(`[VenusUtils] applyUserVenusCssVarsFromColors called, bg=(${bgR},${bgG},${bgB}), fg=(${fgR},${fgG},${fgB}), accent=(${accentR},${accentG},${accentB})`);
        const bg = { r: bgR, g: bgG, b: bgB };
        const fg = { r: fgR, g: fgG, b: fgB };
        const accent = { r: accentR, g: accentG, b: accentB };
        const isDark = this.isDarkColor(bg);
        const vusrCss = this.generateVenusCssVars(bg, fg, accent, isDark, "vusr");
        this.applyCssVarsToTag(vusrCss, 'venus-vusr');
        console.log(`[VenusUtils] applyUserVenusCssVarsFromColors completed`);
    }
    applyUserVenusCssVarsFromTwoColors(bgR, bgG, bgB, fgR, fgG, fgB) {
        const bgOklch = this.rgbToOklch(bgR, bgG, bgB);
        const fgOklch = this.rgbToOklch(fgR, fgG, fgB);
        const accentL = Math.max(0.3, Math.min(0.7, fgOklch.l));
        const accentH = bgOklch.c > this.ACHROMATIC_THRESHOLD ? bgOklch.h : 265;
        const accentC = this.findMaxChromaForLH(accentL, accentH);
        const accent = this.oklchToRgb(accentL, accentC, accentH);
        console.log(`[VenusUtils] applyUserVenusCssVarsFromTwoColors: generated accent=(${accent.r},${accent.g},${accent.b}) from L=${accentL.toFixed(3)}, C=${accentC.toFixed(3)}, H=${accentH.toFixed(1)}`);
        this.applyUserVenusCssVarsFromColors(bgR, bgG, bgB, fgR, fgG, fgB, accent.r, accent.g, accent.b);
    }
    isDarkColor(c) {
        const luminance = (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255;
        return luminance < 0.5;
    }
    generateVenusCssVars(bg, fg, accent, isDark, prefix) {
        const bgOklch = this.rgbToOklch(bg.r, bg.g, bg.b);
        const fgOklch = this.rgbToOklch(fg.r, fg.g, fg.b);
        const accentOklch = this.rgbToOklch(accent.r, accent.g, accent.b);
        const baseHue = this.extractBaseHue(bgOklch, fgOklch, accentOklch);
        const hasHue = baseHue !== null;
        const bgAdj = this.adjustBackgroundForHeadroom(bgOklch, isDark);
        const fgAdj = this.adjustForegroundForHeadroom(fgOklch, isDark);
        const bgRgb = this.oklchToRgb(bgAdj.l, hasHue ? bgAdj.c : 0, baseHue !== null && baseHue !== void 0 ? baseHue : 0);
        const bgDeltaValues = isDark ? Object.values(this.BG_DELTA_DARK) : Object.values(this.BG_DELTA_LIGHT);
        const bgDarkerRoom = bgAdj.l;
        const bgLighterRoom = 1.0 - bgAdj.l;
        const bgDarkerNeeded = -Math.min(...bgDeltaValues);
        const bgLighterNeeded = Math.max(...bgDeltaValues);
        const bgDarkerScale = bgDarkerRoom >= bgDarkerNeeded ? 1.0 : bgDarkerRoom / bgDarkerNeeded;
        const bgLighterScale = bgLighterRoom >= bgLighterNeeded ? 1.0 : bgLighterRoom / bgLighterNeeded;
        const bgHasChroma = bgAdj.c > this.ACHROMATIC_THRESHOLD;
        const deriveFromBg = (deltaL, deltaC) => {
            const scale = deltaL < 0 ? bgDarkerScale : bgLighterScale;
            let newL = bgAdj.l + deltaL * scale;
            newL = Math.max(0, Math.min(1.0, newL));
            const newC = Math.max(0, bgAdj.c + deltaC);
            return this.oklchToRgb(newL, bgHasChroma ? newC : 0, baseHue !== null && baseHue !== void 0 ? baseHue : 0);
        };
        const fgHasHue = fgOklch.c > this.ACHROMATIC_THRESHOLD;
        const fgDeltas = isDark ? this.FG_DELTAS.dark : this.FG_DELTAS.light;
        const fgDarkerRoom = fgAdj.l;
        const fgLighterRoom = 1.0 - fgAdj.l;
        const fgDarkerNeeded = -fgDeltas.min;
        const fgLighterNeeded = fgDeltas.max;
        const fgDarkerScale = fgDarkerRoom >= fgDarkerNeeded ? 1.0 : fgDarkerRoom / fgDarkerNeeded;
        const fgLighterScale = fgLighterRoom >= fgLighterNeeded ? 1.0 : fgLighterRoom / fgLighterNeeded;
        const deriveFromFg = (deltaL, deltaC, minContrastRatio = 4.5) => {
            const scale = deltaL < 0 ? fgDarkerScale : fgLighterScale;
            let newL = fgAdj.l + deltaL * scale;
            newL = Math.max(0, Math.min(1, newL));
            const newC = Math.max(0, fgAdj.c + deltaC);
            const intendedChroma = fgHasHue ? newC : 0;
            const derivedRgb = this.oklchToRgb(newL, intendedChroma, fgOklch.h);
            return this.ensureContrast(derivedRgb, bgRgb, minContrastRatio, isDark, fgOklch.h, intendedChroma);
        };
        const deriveFromAccent = (deltaL, deltaC, deltaH = 0) => {
            const newL = Math.max(0, Math.min(1, accentOklch.l + deltaL));
            const newC = Math.max(0, accentOklch.c + deltaC);
            const newH = accentOklch.h + deltaH;
            return this.oklchToRgb(newL, newC, newH);
        };
        const fixedColor = (l, c, h) => this.oklchToRgb(l, c, h);
        let surfaces, borders, text, icons, buttons, scrollbar, effects, accents, fixedAccents;
        if (isDark) {
            const bgD = this.BG_DELTA_DARK;
            const fgD = this.FG_DELTA_DARK;
            surfaces = {
                bgApp: deriveFromBg(bgD.bgApp, 0),
                surface1: deriveFromBg(bgD.surface1, 0),
                surface2: deriveFromBg(bgD.surface2, 0),
                surface3: deriveFromBg(bgD.surface3, 0),
                elevated1: deriveFromBg(bgD.elevated1, 0.005),
                elevated2: deriveFromBg(bgD.elevated2, 0.01),
                elevated3: deriveFromBg(bgD.elevated3, 0.02),
                elevated4: deriveFromBg(bgD.elevated4, 0.04)
            };
            borders = {
                default: deriveFromBg(bgD.borderDefault, 0.010),
                subtle: deriveFromBg(bgD.borderSubtle, 0.005),
                strong: deriveFromBg(bgD.borderStrong, 0.015),
                focus: deriveFromAccent(0, 0)
            };
            text = {
                primary: deriveFromFg(fgD.primary, 0),
                secondary: deriveFromFg(fgD.secondary, 0.007),
                muted: deriveFromFg(fgD.muted, 0.012),
                dim: deriveFromFg(fgD.dim, 0.017),
                onAccent: { r: 255, g: 255, b: 255 }
            };
            icons = {
                default: deriveFromFg(fgD.iconDefault, 0.012),
                hover: deriveFromFg(fgD.iconHover, 0),
                active: deriveFromAccent(0, 0),
                dim: deriveFromFg(fgD.iconDim, 0.017)
            };
            buttons = {
                bgHover: deriveFromBg(bgD.btnBgHover, 0.01),
                bgSelected: deriveFromBg(bgD.btnBgSelected, 0.005),
                bgActive: Object.assign(Object.assign({}, deriveFromAccent(0, 0)), { a: 0.25 })
            };
            scrollbar = {
                thumb: deriveFromBg(bgD.scrollbarThumb, 0.015),
                thumbHover: deriveFromFg(fgD.scrollbarThumbHover, 0.017)
            };
            effects = {
                glowAccent: Object.assign(Object.assign({}, deriveFromAccent(0, 0)), { a: 0.25 }),
                glowSecondary: Object.assign(Object.assign({}, deriveFromAccent(0.10, -0.04, -55)), { a: 0.15 }),
                shadowElevated: { r: 0, g: 0, b: 0, a: 0.40 }
            };
            accents = {
                primary: deriveFromAccent(0, 0),
                secondary: deriveFromAccent(0.10, -0.04, -55),
                decorative: deriveFromAccent(-0.13, 0.02, 45)
            };
            fixedAccents = {
                success: fixedColor(0.68, 0.150, 165),
                warning: fixedColor(0.78, 0.170, 75),
                danger: fixedColor(0.63, 0.200, 25)
            };
        }
        else {
            const bgL = this.BG_DELTA_LIGHT;
            const fgL = this.FG_DELTA_LIGHT;
            surfaces = {
                bgApp: deriveFromBg(bgL.bgApp, 0),
                surface1: deriveFromBg(bgL.surface1, 0),
                surface2: deriveFromBg(bgL.surface2, 0),
                surface3: deriveFromBg(bgL.surface3, 0),
                elevated1: deriveFromBg(bgL.elevated1, .005),
                elevated2: deriveFromBg(bgL.elevated2, .01),
                elevated3: deriveFromBg(bgL.elevated3, .015),
                elevated4: deriveFromBg(bgL.elevated4, .02)
            };
            borders = {
                default: deriveFromBg(bgL.borderDefault, 0.004),
                subtle: deriveFromBg(bgL.borderSubtle, 0.001),
                strong: deriveFromBg(bgL.borderStrong, 0.008),
                focus: deriveFromAccent(0, 0)
            };
            text = {
                primary: deriveFromFg(fgL.primary, 0),
                secondary: deriveFromFg(fgL.secondary, 0.005),
                muted: deriveFromFg(fgL.muted, 0.010),
                dim: deriveFromFg(fgL.dim, 0.005),
                onAccent: { r: 255, g: 255, b: 255 }
            };
            icons = {
                default: deriveFromFg(fgL.iconDefault, 0.010),
                hover: deriveFromFg(fgL.iconHover, 0),
                active: deriveFromAccent(0, 0),
                dim: deriveFromFg(fgL.iconDim, 0.005)
            };
            buttons = {
                bgHover: deriveFromBg(bgL.btnBgHover, 0.0),
                bgSelected: deriveFromBg(bgL.btnBgSelected, 0),
                bgActive: Object.assign(Object.assign({}, deriveFromAccent(0, 0)), { a: 0.12 })
            };
            scrollbar = {
                thumb: deriveFromBg(bgL.scrollbarThumb, 0.008),
                thumbHover: deriveFromFg(fgL.scrollbarThumbHover, 0.005)
            };
            effects = {
                glowAccent: Object.assign(Object.assign({}, deriveFromAccent(0, 0)), { a: 0.20 }),
                glowSecondary: Object.assign(Object.assign({}, deriveFromAccent(0.03, -0.06, -55)), { a: 0.12 }),
                shadowElevated: Object.assign(Object.assign({}, deriveFromBg(-bgAdj.l, 0)), { a: 0.12 })
            };
            accents = {
                primary: deriveFromAccent(0, 0),
                secondary: deriveFromAccent(0.03, -0.06, -55),
                decorative: deriveFromAccent(-0.07, 0.02, 45)
            };
            fixedAccents = {
                success: fixedColor(0.55, 0.150, 165),
                warning: fixedColor(0.65, 0.170, 75),
                danger: fixedColor(0.52, 0.200, 25)
            };
        }
        const rgb = (c) => `${c.r} ${c.g} ${c.b}`;
        const rgba = (c) => c.a !== undefined ? `${c.r} ${c.g} ${c.b} / ${Math.round(c.a * 100)}%` : rgb(c);
        return `:root {
        /* ===== ${prefix} Surfaces ===== */
        --${prefix}-bg-app: ${rgb(surfaces.bgApp)};
        --${prefix}-surface-translucent: ${rgb(surfaces.bgApp)} / 50%;
        --${prefix}-surface-1: ${rgb(surfaces.surface1)};
        --${prefix}-surface-2: ${rgb(surfaces.surface2)};
        --${prefix}-surface-3: ${rgb(surfaces.surface3)};
        --${prefix}-elevated-1: ${rgb(surfaces.elevated1)};
        --${prefix}-elevated-2: ${rgb(surfaces.elevated2)};
        --${prefix}-elevated-3: ${rgb(surfaces.elevated3)};
        --${prefix}-elevated-4: ${rgb(surfaces.elevated4)};

        /* ===== ${prefix} Borders ===== */
        --${prefix}-border-translucent: ${rgb(borders.default)} / 70%;
        --${prefix}-border-default: ${rgb(borders.default)};
        --${prefix}-border-strong: ${rgb(borders.strong)};
        --${prefix}-border-subtle: ${rgb(borders.subtle)};
        --${prefix}-border-focus: ${rgb(borders.focus)};

        /* ===== ${prefix} Text ===== */
        --${prefix}-text-primary: ${rgb(text.primary)};
        --${prefix}-text-secondary: ${rgb(text.secondary)};
        --${prefix}-text-muted: ${rgb(text.muted)};
        --${prefix}-text-dim: ${rgb(text.dim)};
        --${prefix}-text-on-accent: ${rgb(text.onAccent)};

        /* ===== ${prefix} Icons ===== */
        --${prefix}-icon-default: ${rgb(icons.default)};
        --${prefix}-icon-hover: ${rgb(icons.hover)};
        --${prefix}-icon-active: ${rgb(icons.active)};
        --${prefix}-icon-dim: ${rgb(icons.dim)};

        /* ===== ${prefix} Buttons ===== */
        --${prefix}-btn-bg-hover: ${rgb(buttons.bgHover)};
        --${prefix}-btn-bg-selected: ${rgb(buttons.bgSelected)};
        --${prefix}-btn-bg-active: ${rgba(buttons.bgActive)};

        /* ===== ${prefix} Scrollbar ===== */
        --${prefix}-scrollbar-thumb: ${rgb(scrollbar.thumb)};
        --${prefix}-scrollbar-thumb-hover: ${rgb(scrollbar.thumbHover)};

        /* ===== ${prefix} Effects ===== */
        --${prefix}-glow-accent: ${rgba(effects.glowAccent)};
        --${prefix}-glow-secondary: ${rgba(effects.glowSecondary)};
        --${prefix}-shadow-elevated: ${rgba(effects.shadowElevated)};

        /* ===== ${prefix} Accent ===== */
        --${prefix}-accent-primary: ${rgb(accents.primary)};
        --${prefix}-accent-secondary: ${rgb(accents.secondary)};
        --${prefix}-accent-decorative: ${rgb(accents.decorative)};

        /* ===== ${prefix} Fixed Accents ===== */
        --${prefix}-accent-success: ${rgb(fixedAccents.success)};
        --${prefix}-accent-warning: ${rgb(fixedAccents.warning)};
        --${prefix}-accent-danger: ${rgb(fixedAccents.danger)};
    }`;
    }
    extractBaseHue(bg, fg, accent) {
        if (bg.c > this.ACHROMATIC_THRESHOLD)
            return bg.h;
        if (fg.c > this.ACHROMATIC_THRESHOLD)
            return fg.h;
        if (accent.c > this.ACHROMATIC_THRESHOLD)
            return accent.h;
        return null;
    }
    calculateBgDeltas() {
        const darkValues = Object.values(this.BG_DELTA_DARK);
        const lightValues = Object.values(this.BG_DELTA_LIGHT);
        return {
            dark: {
                min: Math.min(...darkValues) * this.DARK_BG_HEADROOM_MULTIPLIER,
                max: Math.max(...darkValues) * this.DARK_BG_HEADROOM_MULTIPLIER
            },
            light: {
                min: Math.min(...lightValues) * this.LIGHT_BG_HEADROOM_MULTIPLIER,
                max: Math.max(...lightValues) * this.LIGHT_BG_HEADROOM_MULTIPLIER
            }
        };
    }
    calculateFgDeltas() {
        const darkValues = Object.values(this.FG_DELTA_DARK);
        const lightValues = Object.values(this.FG_DELTA_LIGHT);
        return {
            dark: {
                min: Math.min(...darkValues),
                max: Math.max(...darkValues)
            },
            light: {
                min: Math.min(...lightValues),
                max: Math.max(...lightValues)
            }
        };
    }
    adjustBackgroundForHeadroom(bg, isDark) {
        const deltas = isDark ? this.BG_DELTAS.dark : this.BG_DELTAS.light;
        const minL = -deltas.min;
        const maxL = 1.0 - deltas.max;
        if (isDark) {
            return { l: Math.max(minL, Math.min(maxL, bg.l)), c: bg.c, h: bg.h };
        }
        else {
            let adjustedL = bg.l;
            if (bg.l < minL) {
                adjustedL = bg.l + (minL - bg.l) * 0.5;
            }
            else if (bg.l > maxL) {
                adjustedL = bg.l - (bg.l - maxL) * 0.5;
            }
            return { l: adjustedL, c: bg.c, h: bg.h };
        }
    }
    adjustForegroundForHeadroom(fg, isDark) {
        const deltas = isDark ? this.FG_DELTAS.dark : this.FG_DELTAS.light;
        const minL = -deltas.min;
        const maxL = 1.0 - deltas.max;
        return { l: Math.max(minL, Math.min(maxL, fg.l)), c: fg.c, h: fg.h };
    }
    rgbToOklch(r, g, b) {
        const linearize = (c) => {
            const s = c / 255;
            return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
        };
        const lr = linearize(r);
        const lg = linearize(g);
        const lb = linearize(b);
        const l_ = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
        const m_ = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
        const s_ = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;
        const l_3 = Math.cbrt(l_);
        const m_3 = Math.cbrt(m_);
        const s_3 = Math.cbrt(s_);
        const L = 0.2104542553 * l_3 + 0.7936177850 * m_3 - 0.0040720468 * s_3;
        const a = 1.9779984951 * l_3 - 2.4285922050 * m_3 + 0.4505937099 * s_3;
        const bb = 0.0259040371 * l_3 + 0.7827717662 * m_3 - 0.8086757660 * s_3;
        const C = Math.sqrt(a * a + bb * bb);
        let H = Math.atan2(bb, a) * (180 / Math.PI);
        if (H < 0)
            H += 360;
        return { l: L, c: C, h: H };
    }
    oklchToRgb(L, C, H) {
        const hRad = H * (Math.PI / 180);
        const a = C * Math.cos(hRad);
        const b = C * Math.sin(hRad);
        const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
        const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
        const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
        const l = l_ * l_ * l_;
        const m = m_ * m_ * m_;
        const s = s_ * s_ * s_;
        const lr = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
        const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
        const lb = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
        const delinearize = (c) => {
            const clamped = Math.max(0, Math.min(1, c));
            return clamped <= 0.0031308
                ? clamped * 12.92
                : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
        };
        return {
            r: Math.round(delinearize(lr) * 255),
            g: Math.round(delinearize(lg) * 255),
            b: Math.round(delinearize(lb) * 255)
        };
    }
    findMaxChromaForLH(l, h) {
        let low = 0;
        let high = 0.4;
        const tolerance = 0.001;
        while (high - low > tolerance) {
            const mid = (low + high) / 2;
            const rgb = this.oklchToRgb(l, mid, h);
            const roundTrip = this.rgbToOklch(rgb.r, rgb.g, rgb.b);
            const chromaDiff = Math.abs(roundTrip.c - mid);
            if (chromaDiff < 0.01) {
                low = mid;
            }
            else {
                high = mid;
            }
        }
        return low;
    }
    getRelativeLuminance(r, g, b) {
        const toLinear = (c) => {
            const s = c / 255;
            return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
        };
        return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
    }
    getContrastRatio(fg, bg) {
        const l1 = this.getRelativeLuminance(fg.r, fg.g, fg.b);
        const l2 = this.getRelativeLuminance(bg.r, bg.g, bg.b);
        const lighter = Math.max(l1, l2);
        const darker = Math.min(l1, l2);
        return (lighter + 0.05) / (darker + 0.05);
    }
    ensureContrast(fg, bgRgb, minRatio, isDark, baseHue, intendedChroma) {
        const currentRatio = this.getContrastRatio(fg, bgRgb);
        if (currentRatio >= minRatio) {
            return fg;
        }
        const fgOklch = this.rgbToOklch(fg.r, fg.g, fg.b);
        let minL = isDark ? fgOklch.l : 0;
        let maxL = isDark ? 1 : fgOklch.l;
        let bestL = fgOklch.l;
        for (let i = 0; i < 10; i++) {
            const midL = (minL + maxL) / 2;
            const testRgb = this.oklchToRgb(midL, intendedChroma, baseHue !== null && baseHue !== void 0 ? baseHue : fgOklch.h);
            const testRatio = this.getContrastRatio(testRgb, bgRgb);
            if (testRatio >= minRatio) {
                bestL = midL;
                if (isDark) {
                    maxL = midL;
                }
                else {
                    minL = midL;
                }
            }
            else {
                if (isDark) {
                    minL = midL;
                }
                else {
                    maxL = midL;
                }
            }
        }
        return this.oklchToRgb(bestL, intendedChroma, baseHue !== null && baseHue !== void 0 ? baseHue : fgOklch.h);
    }
    setupToolbarOverflowMask(elementId) {
        const el = document.getElementById(elementId);
        if (!el)
            return;
        if (this.overflowMaskState.has(elementId)) {
            this.disposeToolbarOverflowMask(elementId);
        }
        const leftFade = document.getElementById(`${elementId}-fade-left`);
        const rightFade = document.getElementById(`${elementId}-fade-right`);
        const leftChevron = document.getElementById(`${elementId}-chevron-left`);
        const rightChevron = document.getElementById(`${elementId}-chevron-right`);
        const update = () => this.updateToolbarOverflowMask(el, leftFade, rightFade, leftChevron, rightChevron);
        const observer = new ResizeObserver(update);
        observer.observe(el);
        const mutationObserver = new MutationObserver(update);
        mutationObserver.observe(el, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['style', 'class'],
        });
        if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) {
            document.fonts.ready.then(update).catch(() => { });
        }
        el.addEventListener('scroll', update, { passive: true });
        const scrollStep = () => Math.max(40, Math.floor(el.clientWidth * 0.8));
        let leftClickHandler = null;
        let rightClickHandler = null;
        if (leftChevron) {
            leftClickHandler = () => el.scrollBy({ left: -scrollStep(), behavior: 'smooth' });
            leftChevron.addEventListener('click', leftClickHandler);
        }
        if (rightChevron) {
            rightClickHandler = () => el.scrollBy({ left: scrollStep(), behavior: 'smooth' });
            rightChevron.addEventListener('click', rightClickHandler);
        }
        this.overflowMaskState.set(elementId, {
            onScroll: update, observer, mutationObserver,
            leftFade, rightFade,
            leftChevron, rightChevron,
            leftClickHandler, rightClickHandler,
        });
        update();
    }
    disposeToolbarOverflowMask(elementId) {
        var _a, _b, _c, _d;
        const state = this.overflowMaskState.get(elementId);
        if (!state)
            return;
        const el = document.getElementById(elementId);
        el === null || el === void 0 ? void 0 : el.removeEventListener('scroll', state.onScroll);
        state.observer.disconnect();
        state.mutationObserver.disconnect();
        if (state.leftChevron && state.leftClickHandler) {
            state.leftChevron.removeEventListener('click', state.leftClickHandler);
        }
        if (state.rightChevron && state.rightClickHandler) {
            state.rightChevron.removeEventListener('click', state.rightClickHandler);
        }
        (_a = state.leftFade) === null || _a === void 0 ? void 0 : _a.classList.remove('visible');
        (_b = state.rightFade) === null || _b === void 0 ? void 0 : _b.classList.remove('visible');
        (_c = state.leftChevron) === null || _c === void 0 ? void 0 : _c.classList.remove('visible');
        (_d = state.rightChevron) === null || _d === void 0 ? void 0 : _d.classList.remove('visible');
        this.overflowMaskState.delete(elementId);
    }
    updateToolbarOverflowMask(el, leftFade, rightFade, leftChevron, rightChevron) {
        const tolerance = 1;
        const hasOverflow = el.scrollWidth > el.clientWidth;
        if (!hasOverflow) {
            leftFade === null || leftFade === void 0 ? void 0 : leftFade.classList.remove('visible');
            rightFade === null || rightFade === void 0 ? void 0 : rightFade.classList.remove('visible');
            leftChevron === null || leftChevron === void 0 ? void 0 : leftChevron.classList.remove('visible');
            rightChevron === null || rightChevron === void 0 ? void 0 : rightChevron.classList.remove('visible');
            return;
        }
        const atLeft = el.scrollLeft <= 0;
        const atRight = el.scrollLeft + el.clientWidth + tolerance >= el.scrollWidth;
        leftFade === null || leftFade === void 0 ? void 0 : leftFade.classList.toggle('visible', !atLeft);
        rightFade === null || rightFade === void 0 ? void 0 : rightFade.classList.toggle('visible', !atRight);
        leftChevron === null || leftChevron === void 0 ? void 0 : leftChevron.classList.toggle('visible', !atLeft);
        rightChevron === null || rightChevron === void 0 ? void 0 : rightChevron.classList.toggle('visible', !atRight);
    }
}
var AnchorPoint;
(function (AnchorPoint) {
    AnchorPoint[AnchorPoint["Center"] = 0] = "Center";
    AnchorPoint[AnchorPoint["TopLeft"] = 1] = "TopLeft";
    AnchorPoint[AnchorPoint["TopRight"] = 2] = "TopRight";
    AnchorPoint[AnchorPoint["BottomLeft"] = 3] = "BottomLeft";
    AnchorPoint[AnchorPoint["BottomRight"] = 4] = "BottomRight";
    AnchorPoint[AnchorPoint["Left"] = 5] = "Left";
    AnchorPoint[AnchorPoint["Top"] = 6] = "Top";
    AnchorPoint[AnchorPoint["Right"] = 7] = "Right";
    AnchorPoint[AnchorPoint["Bottom"] = 8] = "Bottom";
})(AnchorPoint || (AnchorPoint = {}));
var DrawerPosition;
(function (DrawerPosition) {
    DrawerPosition[DrawerPosition["Left"] = 0] = "Left";
    DrawerPosition[DrawerPosition["Right"] = 1] = "Right";
    DrawerPosition[DrawerPosition["Top"] = 2] = "Top";
    DrawerPosition[DrawerPosition["Bottom"] = 3] = "Bottom";
})(DrawerPosition || (DrawerPosition = {}));
class ExistenceDependencyManager {
    constructor() {
        this.existenceDependencies = new Map();
        this.pendingMutations = [];
        this.debounceTimerId = null;
        this.observer = new MutationObserver((mutations) => {
            this.pendingMutations.push(...mutations);
            this.scheduleDebouncedCheck();
        });
        this.observer.observe(document.body, { childList: true, subtree: true });
    }
    scheduleDebouncedCheck() {
        if (this.debounceTimerId !== null) {
            clearTimeout(this.debounceTimerId);
        }
        this.debounceTimerId = window.setTimeout(() => {
            this.runCheck();
            this.debounceTimerId = null;
        }, ExistenceDependencyManager.DEBOUNCE_INTERVAL);
    }
    runCheck() {
        const mutationsToProcess = this.pendingMutations.slice();
        this.pendingMutations = [];
        for (const mutation of mutationsToProcess) {
            for (const removedNode of Array.from(mutation.removedNodes)) {
                if (removedNode.nodeType === Node.ELEMENT_NODE) {
                    const removedEl = removedNode;
                    for (const [parentId, { parentEl, childEl }] of Array.from(this.existenceDependencies)) {
                        if (removedEl === parentEl || removedEl.contains(parentEl)) {
                            if (childEl.parentNode) {
                                childEl.remove();
                            }
                            this.existenceDependencies.delete(parentId);
                        }
                    }
                }
            }
        }
    }
    enforceExistenceDependence(parentId, childId) {
        const parentEl = document.getElementById(parentId);
        const childEl = document.getElementById(childId);
        if (!parentEl || !childEl) {
            console.warn(`enforceExistenceDependence: Could not find parent "${parentId}" or child "${childId}".`);
            return;
        }
        this.existenceDependencies.set(parentId, { parentEl, childEl });
    }
}
ExistenceDependencyManager.DEBOUNCE_INTERVAL = 50;
export const venusUtils = new VenusUtils();
venusUtils.initKeyboardNavLockProvider();
globalThis.venusUtils = venusUtils;
globalThis.tabbedPanelGetScrollInfo = (elementId) => {
    const element = document.getElementById(elementId);
    if (!element)
        return null;
    return {
        scrollLeft: element.scrollLeft,
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth
    };
};
globalThis.tabbedPanelScroll = (elementId, amount) => {
    const element = document.getElementById(elementId);
    if (!element)
        return;
    element.scrollBy({ left: amount, behavior: 'smooth' });
};
//# sourceMappingURL=venus-utils.js.map