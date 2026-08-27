import { Point, Rect } from "/_content/Venus/js/dist/geometry.js";
import { DomUtils } from "/_content/Venus/js/dist/domUtils.js";
import { safeInvoke } from "../interop.js";
import { PlexAccessory } from "./plexAccessory.js";
import { ListLayout } from "./listLayout.js";
import { Backimator } from "./backimator.js";
import { ForceLayout, LinkData } from "./forceLayout.js";
import { plexCanvas } from "./plexCanvas.js";
import { ThoughtRep } from "./thoughtRep.js";
import { LinkRep } from "./linkRep.js";
import { Scrollbar } from "./scrollbar.js";
import { GateStatus, LayoutType, ThoughtExpandDirection, ThoughtHorizontalAlignment } from "./enums.js";
import { LayoutNode } from "./layoutNode.js";
import { syncThoughtFontStyling } from "./baseLayout.js";
import { NormalLayout } from "./normalLayout.js";
import { OutlineLayout } from "./outlineLayout.js";
import { MindmapLayout } from "./mindmapLayout.js";
import { OneZoneRange, ZoneRanges } from "./zoneRanges.js";
import { Relation } from "./core.js";
export class PlexAnimator {
    get plexAccessory() {
        if (!this._plexAccessory) {
            this._plexAccessory = new PlexAccessory();
        }
        return this._plexAccessory;
    }
    constructor() {
        this._wallpaperOverlay = null;
        this._wallpaperCrossfadeId = 0;
        this.focusedId = "";
        this.focusedUsingKeyboardNav = false;
        this.isTouchDevice = false;
        this.isPhone = false;
        this.lastActivateClickTime = 0;
        this.lastBackgroundDragX = 0;
        this.lastBackgroundDragY = 0;
        this.NORMAL_CENTER_DEFAULT = 0.45;
        this.NORMAL_CENTER_DEFAULT_PHONE = 0.35;
        this.normalCenterRatio = this.NORMAL_CENTER_DEFAULT;
        this.NORMAL_CENTER_MIN = 0.20;
        this.NORMAL_CENTER_MAX = 0.70;
        this.thtReps = new Map();
        this.thtRepsOld = new Map();
        this.thtRepsNew = new Map();
        this.linkReps = new Map();
        this.linkRepsOld = new Map();
        this.linkRepsNew = new Map();
        this.linksInUse = new Set();
        this.colors = {};
        this.pendingHighlightIds = new Set();
        this.isReadOnly = false;
        this.zoneScrollbars = {};
        this.scrollRangesUpdateTimer = 0;
        this.requestExtraLinksResizeTimer = 0;
        this.outlineLayout = new OutlineLayout(this);
        this.mindmapLayout = new MindmapLayout(this);
        this.normalLayout = new NormalLayout(this, false);
        this.normalPlusOneLayout = new NormalLayout(this, true);
        this.currentLayout = this.normalLayout;
        this.layout = LayoutType.Undefined;
        this.isStraightLinksEnabled = false;
        this.isBackimatorEnabled = false;
        this.thoughtIdSet = new Set();
        this.animationTime = 0.75;
        this.rowHeight = 0;
        this.initialRowHeight = 0;
        this.SCROLL_ANIMATION_TIME = 0.15;
        this.ICON_FADE_ANIMATION_TIME = 0.25;
        this.ICON_ZOOM_ANIMATION_TIME = 0.25;
        this.TAG_LABEL_MAX_WIDTH = '100px';
        this.ICON_ZOOM_DELAY_TIME = 0.25;
        this.MIN_TIME_BETWEEN_SCROLL = 0.3;
        this.PAGING_REPEAT_TIME = 0.2;
        this.PAGING_MIN = 0.05;
        this.COL_WIDTH = 200;
        this.minColumnWidth = 240;
        this.thoughtSpacing = 1.0;
        this.GATE_SIZE = 3.5;
        this.GATE_OFFSET = 10;
        this.FORCE_LAYOUT_INTERACTION_DELAY = 0.3;
        this.FORCE_LAYOUT_LINK_LABELS_DELAY = 0.1;
        this.CONTROL_OFFSET = 30;
        this.CONTROL_SIZE = 15;
        this.LARGE_ICON_SIZE = 2048;
        this.tagTextVisibilityMode = 'always';
        this.tagIconVisibilityMode = 'always';
        this.tagScalePercent = 100;
        this.SM_BREAKPOINT_WIDTH = 640;
        this.forceLayout = new ForceLayout((id) => {
            return this.getInitialNodePointForForceLayout(id);
        }, this.COL_WIDTH, this.rowHeight);
        this.lastNormalLayoutThoughtPoints = {};
        this.pinnedListLayout = undefined;
        this.pastListLayout = undefined;
        this.selectedListLayout = undefined;
        this.initGeneration = 0;
        this.node = null;
        this.nodeChildrenIds = new Set();
        this.nodeParentsIds = new Set();
        this.nodeJumpsIds = new Set();
        this.nodeSiblingsIds = new Set();
        this.nodeParentsOf = new Map();
        this.nodeChildrenOf = new Map();
        this.nodeJumpsOf = new Map();
        this.primaryLinks = new Set();
        this.plexThoughtFontSize = -1337;
        this.lastGeometrySignature = "";
        this.parentZoneRangesCache = new Map();
        this.childrenZoneRangesCache = new Map();
        this.jumpsZoneRangesCache = new Map();
        this.siblingZoneRangesCache = new Map();
        this.lastSiblingScrollDirection = 0;
        this.lastParentScrollDirection = 0;
        this.lastChildScrollDirection = 0;
        this.lastJumpScrollDirection = 0;
        this.lastRangesWerePerfectMatch = false;
        this.zrCachedOld = null;
        this.lastOrderedJobId = 0;
        this.isSwappingThoughtElements = false;
        this._swappingStartId = 0;
        this.gateHighlightElements = [];
        this.gateHighlightRafId = 0;
        this.dragHintElements = [];
        this.dragHintRafId = 0;
        this.isBackgroundDragged = false;
        this.normalLayoutZoneToRows = new Map();
        this.normalLayoutZoneToColumns = new Map();
        this.scrollDirStr = "";
        this.scrolledZone = "";
        this.thoughtIdSet = new Set();
        window.addEventListener("resize", (e) => { this.onResize(); });
    }
    setTagTextVisibility(mode) {
        const m = (mode || '').toLowerCase();
        if (m === 'donotshow' || m === 'icons') {
            this.tagTextVisibilityMode = 'icons';
        }
        else if (m === 'showonhover' || m === 'hover') {
            this.tagTextVisibilityMode = 'hover';
        }
        else if (m === 'alwaysshow' || m === 'always') {
            this.tagTextVisibilityMode = 'always';
        }
    }
    setTagIconVisibility(mode) {
        const m = (mode || '').toLowerCase();
        if (m === 'donotshow' || m === 'never') {
            this.tagIconVisibilityMode = 'never';
        }
        else if (m === 'showonhover' || m === 'hover') {
            this.tagIconVisibilityMode = 'hover';
        }
        else if (m === 'alwaysshow' || m === 'always') {
            this.tagIconVisibilityMode = 'always';
        }
    }
    setTagScale(percent) {
        const p = Number(percent);
        if (!isFinite(p) || p <= 0) {
            return;
        }
        this.tagScalePercent = p;
    }
    onResize() {
        var _a, _b, _c;
        const plexContainer = document.getElementById("plexContainer");
        if (!plexContainer || plexContainer.classList.contains("plex-none")) {
            return;
        }
        plexCanvas.queueResize();
        if (!this.field) {
            return;
        }
        try {
            (_a = this.pinnedListLayout) === null || _a === void 0 ? void 0 : _a.sync();
            (_b = this.pastListLayout) === null || _b === void 0 ? void 0 : _b.sync();
            (_c = this.selectedListLayout) === null || _c === void 0 ? void 0 : _c.sync();
            if (this.layout == LayoutType.Force) {
                let fieldRect = this.field.getBoundingClientRect();
                this.forceLayout.setArea(new Rect(0, 0, fieldRect.width, fieldRect.height));
            }
            else {
                this.setThoughtElementTransitionTimes(0);
                this.initThoughtReps();
                this.ensureRowHeight();
                this.moveWrapper();
                this.clampPanToViewport();
                if (this.requestExtraLinksResizeTimer != 0) {
                    clearTimeout(this.requestExtraLinksResizeTimer);
                }
                this.requestExtraLinksResizeTimer = setTimeout(() => {
                    this.requestExtraLinksResizeTimer = 0;
                    this.requestExtraLinks();
                }, 250);
                this.disappearOld();
                this.hideOffscreen();
                let thtElements = this.field.querySelectorAll(".tht.off");
                thtElements.forEach((thtEl_) => {
                    let thtEl = thtEl_;
                    thtEl.remove();
                });
                let curElements = this.field.querySelectorAll(".tht.cur");
                curElements.forEach((thtEl) => {
                    let thtId = thtEl.id.substring(4, thtEl.id.length - 4);
                    if (!this.thoughtIdSet.has(thtId)) {
                        let isChildNoScroll = this.nodeChildrenIds.has(thtId) && !this.zoneScrollbars["child"];
                        let isParentNoScroll = this.nodeParentsIds.has(thtId) && !this.zoneScrollbars["parent"];
                        let isJumpNoScroll = this.nodeJumpsIds.has(thtId) && !this.zoneScrollbars["jump"];
                        let isSiblingNoScroll = this.nodeSiblingsIds.has(thtId) && !this.zoneScrollbars["sibling"];
                        if (isChildNoScroll || isParentNoScroll || isJumpNoScroll || isSiblingNoScroll) {
                            console.warn("[PLEX-BUG] onResize hiding a thought that should be visible (no scrollbar)!", thtId, "thoughtIdSet size:", this.thoughtIdSet.size);
                        }
                        thtEl.style.display = "none";
                        thtEl.style.pointerEvents = "none";
                        thtEl.classList.add("overflow-hidden-resize");
                    }
                });
                const currentSignature = this.getGeometrySignature();
                if (this.lastGeometrySignature !== "" && currentSignature !== this.lastGeometrySignature) {
                    this.clearZoneCaches();
                    safeInvoke(this.dotNetHelper, "InvalidateZoneRangesAndRefresh");
                }
                this.lastGeometrySignature = currentSignature;
                plexCanvas.clearLinkColliders();
            }
        }
        catch (e) {
        }
    }
    moveWrapper() {
        this.thoughtIdSet.clear();
        this.currentLayout.moveCurToNewPositions("all", false, this.lastBackgroundDragX, this.lastBackgroundDragY);
    }
    initPastThoughtsList() {
        this.plexAccessory.initPastThoughtsList();
        if (!this.pastListLayout) {
            this.pastListLayout = new ListLayout('.past-thoughts-list');
        }
        this.pastListLayout.sync();
        plexCanvas.setupListScrollListeners();
    }
    initPinnedThoughtsList() {
        var _a;
        this.plexAccessory.initPinnedThoughtsList(this.dotNetHelper, (_a = this.colors.thoughtHighlightOutline) !== null && _a !== void 0 ? _a : 0xffffff, this.GATE_SIZE, this.rowHeight);
        if (!this.pinnedListLayout) {
            this.pinnedListLayout = new ListLayout('.pinned-thoughts-list');
        }
        this.pinnedListLayout.sync();
        plexCanvas.setupListScrollListeners();
    }
    initSelectedThoughtsList() {
        var _a;
        if (!this.selectedListLayout) {
            this.selectedListLayout = new ListLayout('.selected-thoughts-list', ThoughtHorizontalAlignment.Left);
        }
        this.selectedListLayout.sync();
        plexCanvas.setupListScrollListeners();
        this.plexAccessory.dotNetHelper = this.dotNetHelper;
        this.plexAccessory.setupListDragDrop('.selected-thoughts-list', 'y', 'ReorderSelectedThoughts', (_a = this.colors.thoughtHighlightOutline) !== null && _a !== void 0 ? _a : 0xffffff, this.GATE_SIZE, this.rowHeight, 'left');
    }
    syncAccessoryLists() {
        var _a, _b, _c;
        (_a = this.pinnedListLayout) === null || _a === void 0 ? void 0 : _a.sync();
        (_b = this.pastListLayout) === null || _b === void 0 ? void 0 : _b.sync();
        (_c = this.selectedListLayout) === null || _c === void 0 ? void 0 : _c.sync();
    }
    resetPastThoughtsListScroll() {
        const container = document.querySelector('.past-thoughts-list');
        if (container) {
            container.scrollLeft = 0;
        }
        this.plexAccessory.ptlScrollAmount = 0;
    }
    shrinkSelectedThoughtsListItemWidths() {
        plexCanvas.shrinkAccessoryListItemWidths('.selected-thoughts-list');
    }
    requestExtraLinksForIds(thtIds) {
        if (!this.activeId)
            return;
        safeInvoke(this.dotNetHelper, "RequestExtraLinks", [this.activeId, thtIds.join(",")]);
    }
    getAnyThoughtRepById(id) {
        var _a, _b, _c;
        let rep = this.thtReps.get(id);
        if (rep)
            return rep;
        rep = (_a = this.pinnedListLayout) === null || _a === void 0 ? void 0 : _a.getRep(id);
        if (rep)
            return rep;
        rep = (_b = this.pastListLayout) === null || _b === void 0 ? void 0 : _b.getRep(id);
        if (rep)
            return rep;
        rep = (_c = this.selectedListLayout) === null || _c === void 0 ? void 0 : _c.getRep(id);
        return rep;
    }
    getAllListReps() {
        const arr = [];
        if (this.pinnedListLayout) {
            this.pinnedListLayout.reps.forEach(r => arr.push(r));
        }
        if (this.pastListLayout) {
            this.pastListLayout.reps.forEach(r => arr.push(r));
        }
        if (this.selectedListLayout) {
            this.selectedListLayout.reps.forEach(r => arr.push(r));
        }
        return arr;
    }
    startLinkingFromQuadrant(linkRelation, currTouchPoint, thoughtId) {
        plexCanvas.startLinkingFromQuadrant(linkRelation, currTouchPoint, thoughtId);
    }
    async init(dotNetHelper, backimatorSettings, isStraightLinksEnabled) {
        const generation = ++this.initGeneration;
        this.isStraightLinksEnabled = isStraightLinksEnabled;
        this.dotNetHelper = dotNetHelper;
        this.plexAccessory.dotNetHelper = dotNetHelper;
        this.deck = document.getElementById("deck");
        if (!this.deck) {
            throw new Error("Plex deck element with id 'deck' not found. DOM may not be ready yet.");
        }
        this.field = document.getElementById("field");
        if (!this.field) {
            throw new Error("Plex field element with id 'field' not found. DOM may not be ready yet.");
        }
        this.expandDeck = document.getElementById("expand-deck");
        this.backimator = new Backimator(backimatorSettings);
        if (this.isBackimatorEnabled) {
            this.backimator.start(this.field);
        }
        await plexCanvas.init(this.field);
        const plexContainer = document.getElementById("plexContainer");
        if (plexContainer && !this.resizeObserver) {
            let resizeRafId = null;
            this.resizeObserver = new ResizeObserver(() => {
                if (resizeRafId !== null)
                    return;
                resizeRafId = requestAnimationFrame(() => {
                    resizeRafId = null;
                    this.onResize();
                });
            });
            this.resizeObserver.observe(plexContainer);
        }
        return generation;
    }
    setIsStraightLinksEnabled(isStraightLinksEnabled) {
        this.isStraightLinksEnabled = isStraightLinksEnabled;
        plexCanvas.clearLinkColliders();
    }
    setIsTouchDevice(isTouchDevice) {
        this.isTouchDevice = isTouchDevice;
    }
    setIsPhone(isPhone) {
        if (isPhone && this.normalCenterRatio === this.NORMAL_CENTER_DEFAULT) {
            this.normalCenterRatio = this.NORMAL_CENTER_DEFAULT_PHONE;
        }
        this.isPhone = isPhone;
    }
    setIsBackimatorEnabled(isBackimatorEnabled) {
        if (this.isBackimatorEnabled == isBackimatorEnabled) {
            return;
        }
        this.isBackimatorEnabled = isBackimatorEnabled;
        if (isBackimatorEnabled) {
            this.backimator.start(this.field);
        }
        else {
            this.backimator.cleanUp();
        }
    }
    setIsSearchUIShowing(isSearchUIShowing) {
        plexCanvas.setIsSearchUIShowing(isSearchUIShowing);
    }
    setIsDialogShowing(isDialogShowing) {
        plexCanvas.setIsDialogShowing(isDialogShowing);
    }
    endDragLinkPreview() {
        plexCanvas.endDragLinkPreview();
    }
    setMinColumnWidth(widthPx) {
        const clamped = Math.max(10, Math.min(600, Math.floor(widthPx)));
        if (this.minColumnWidth !== clamped) {
            this.minColumnWidth = clamped;
            this.onResize();
        }
    }
    setThoughtSpacing(percent) {
        const clampedPercent = Math.max(50, Math.min(200, Math.floor(percent)));
        const mult = clampedPercent / 100.0;
        if (Math.abs(this.thoughtSpacing - mult) > 0.001) {
            this.thoughtSpacing = mult;
            this.onResize();
        }
    }
    setListOverlayExpandsVertically(expandVertically) {
        plexCanvas.setListOverlayExpansionMode(expandVertically);
    }
    reinitializeBackimator(backimatorSettings) {
        this.backimator.cleanUp();
        this.backimator = new Backimator(backimatorSettings);
        if (this.isBackimatorEnabled) {
            this.backimator.start(this.field);
        }
    }
    setIsForceLayoutGatherEnabled(isForceLayoutGatherEnabled) {
        this.forceLayout.setIsGatherNodesEnabled(isForceLayoutGatherEnabled);
    }
    addLinkReps(links) {
        this.linkRepsOld = this.linkRepsNew;
        this.linkRepsNew = new Map();
        links.forEach((l) => {
            let linkRep = new LinkRep(l.id, l.idA, l.idB, l.relation, l.color, l.label, l.thickness, l.direction, l.meaning);
            this.linkRepsNew.set(linkRep.id, linkRep);
        });
        this.linkReps.clear();
        for (const linkRep of this.linkRepsOld.values()) {
            this.linkReps.set(linkRep.id, linkRep);
        }
        for (const linkRep of this.linkRepsNew.values()) {
            this.linkReps.set(linkRep.id, linkRep);
        }
        this.logInfo("addLinkReps -- linkRepsNew:", this.linkRepsNew.size, " linkRepsOld:", this.linkRepsOld.size, " linkReps:", this.linkReps.size);
    }
    removeLinks(linkIds) {
        if (!linkIds || linkIds.length == 0) {
            return;
        }
        let removedAny = false;
        linkIds.forEach((id) => {
            if (this.linkReps.delete(id)) {
                removedAny = true;
            }
            this.linkRepsNew.delete(id);
            this.linkRepsOld.delete(id);
            this.linksInUse.delete(id);
        });
        if (removedAny) {
            plexCanvas.animateBriefly();
        }
    }
    ensureRowHeight() {
        let rowHeight = this.initialRowHeight;
        if (window.innerWidth < this.SM_BREAKPOINT_WIDTH) {
            rowHeight *= 0.8;
        }
        this.rowHeight = rowHeight;
    }
    setSelectedThoughtIds(ids) {
        plexCanvas.selectedThoughtsChanging(true);
        plexCanvas.selectedThoughtIds = ids;
        plexCanvas.selectedThoughtsChanging(false);
        if (this.field) {
            this.onResize();
        }
    }
    setSelectedLinkIds(ids) {
        plexCanvas.setSelectedLinkIds(ids);
    }
    cleanUp(generation) {
        if (generation != this.initGeneration) {
            return;
        }
        this.thtReps = new Map();
        this.thtRepsOld = new Map();
        this.thtRepsNew = new Map();
        this.linkReps = new Map();
        this.linkRepsNew = new Map();
        this.linkRepsOld = new Map();
        this.linksInUse = new Set();
        this.thoughtIdSet = new Set();
        this.focusedId = "";
        this.activeId = undefined;
        this.lastActiveId = undefined;
        this.lastActiveDestX = undefined;
        this.lastActiveDestY = undefined;
        for (const key in this.zoneScrollbars) {
            if (this.zoneScrollbars[key]) {
                this.zoneScrollbars[key] = null;
            }
        }
        console.warn("PlexAnimator cleaning up...");
        if (this.scrollRangesUpdateTimer != 0) {
            clearTimeout(this.scrollRangesUpdateTimer);
            this.scrollRangesUpdateTimer = 0;
        }
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
            this.resizeObserver = undefined;
        }
        plexCanvas.cleanUp();
        this.dotNetHelper = null;
    }
    isSelectionPanelVisible() {
        if (window.innerWidth < this.SM_BREAKPOINT_WIDTH) {
            return false;
        }
        return plexCanvas.selectedThoughtIds && plexCanvas.selectedThoughtIds.length > 0;
    }
    getSelectionPanelWidth() {
        if (!this.isSelectionPanelVisible() || !this.field) {
            return 0;
        }
        const remInPixels = 16;
        const minWidthInPixels = 10 * remInPixels;
        const maxWidthInPixels = 25 * remInPixels;
        const fieldRect = this.field.getBoundingClientRect();
        const fieldWidth = fieldRect.width;
        const twentyFivePercent = fieldWidth * 0.25;
        const actualWidth = Math.min(Math.max(twentyFivePercent, minWidthInPixels), maxWidthInPixels);
        return actualWidth / fieldWidth;
    }
    addPrimaryLink(thtIdA, thtIdB) {
        this.primaryLinks.add(thtIdA + "==>" + thtIdB);
        this.primaryLinks.add(thtIdB + "==>" + thtIdA);
    }
    isPrimaryLink(thtIdA, thtIdB) {
        if (!this.primaryLinks || this.primaryLinks.size == 0) {
            return true;
        }
        return this.primaryLinks.has(thtIdA + "==>" + thtIdB);
    }
    relateThoughts(nodeList) {
        nodeList.forEach((node) => {
            var _a, _b, _c;
            let thtId = node.id;
            (_a = node.children) === null || _a === void 0 ? void 0 : _a.forEach((child) => {
                let childThtId = child.id;
                if (this.nodeChildrenOf.get(thtId) == null) {
                    this.nodeChildrenOf.set(thtId, []);
                }
                this.nodeChildrenOf.get(thtId).push(childThtId);
            });
            (_b = node.parents) === null || _b === void 0 ? void 0 : _b.forEach((parent) => {
                let parentThtId = parent.id;
                if (this.nodeParentsOf.get(thtId) == null) {
                    this.nodeParentsOf.set(thtId, []);
                }
                this.nodeParentsOf.get(thtId).push(parentThtId);
            });
            (_c = node.jumps) === null || _c === void 0 ? void 0 : _c.forEach((jump) => {
                let jumpThtId = jump.id;
                if (this.nodeJumpsOf.get(thtId) == null) {
                    this.nodeJumpsOf.set(thtId, []);
                }
                this.nodeJumpsOf.get(thtId).push(jumpThtId);
            });
        });
    }
    setSecondGenerationRelatedNodes() {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        this.nodeParentsOf.clear();
        this.nodeChildrenOf.clear();
        this.nodeJumpsOf.clear();
        if ((_a = this.node) === null || _a === void 0 ? void 0 : _a.siblings) {
            this.relateThoughts((_b = this.node) === null || _b === void 0 ? void 0 : _b.siblings);
        }
        if ((_c = this.node) === null || _c === void 0 ? void 0 : _c.children) {
            this.relateThoughts((_d = this.node) === null || _d === void 0 ? void 0 : _d.children);
        }
        if ((_e = this.node) === null || _e === void 0 ? void 0 : _e.parents) {
            this.relateThoughts((_f = this.node) === null || _f === void 0 ? void 0 : _f.parents);
        }
        if ((_g = this.node) === null || _g === void 0 ? void 0 : _g.jumps) {
            this.relateThoughts((_h = this.node) === null || _h === void 0 ? void 0 : _h.jumps);
        }
    }
    debugMe(str) {
        this.logInfo("===");
        this.logInfo(str);
        let thtElements = this.field.querySelectorAll(".tht");
        let total = thtElements.length;
        let cur = Array.from(this.filterNodeList(thtElements, (thtEl) => thtEl.classList.contains("cur"))).length;
        let old = Array.from(this.filterNodeList(thtElements, (thtEl) => thtEl.classList.contains("old"))).length;
        this.logInfo("total: ", total, " cur: ", cur, " old: ", old);
    }
    logInfo(...args) {
        return;
        let args2 = ["plexAnimator.logInfo - "].concat(args);
        console.info(...args2);
    }
    getGeometrySignature() {
        var _a, _b, _c;
        const fieldRect = (_a = this.field) === null || _a === void 0 ? void 0 : _a.getBoundingClientRect();
        const w = Math.round((_b = fieldRect === null || fieldRect === void 0 ? void 0 : fieldRect.width) !== null && _b !== void 0 ? _b : 0);
        const h = Math.round((_c = fieldRect === null || fieldRect === void 0 ? void 0 : fieldRect.height) !== null && _c !== void 0 ? _c : 0);
        const sel = this.isSelectionPanelVisible() ? 1 : 0;
        return `${w}_${h}_${this.plexThoughtFontSize}_${sel}`;
    }
    siblingCacheKey(node) {
        var _a;
        return (((_a = node === null || node === void 0 ? void 0 : node.parents) === null || _a === void 0 ? void 0 : _a.map((n) => n.id)) || []).sort().join(",");
    }
    zoneRangesFromLayoutNode(node, activeId) {
        let siblingKey = this.siblingCacheKey(node);
        this.logInfo("zoneRanges currently cached? -- siblingKey: ", siblingKey, " activeId: ", activeId);
        let siblingRange = this.siblingZoneRangesCache.get(siblingKey) || new OneZoneRange(0, 0, 0);
        let childrenRange = this.childrenZoneRangesCache.get(activeId) || new OneZoneRange(0, 0, 0);
        let parentRange = this.parentZoneRangesCache.get(activeId) || new OneZoneRange(0, 0, 0);
        let jumpsRange = this.jumpsZoneRangesCache.get(activeId) || new OneZoneRange(0, 0, 0);
        let ret = new ZoneRanges(activeId, parentRange.start | 0, parentRange.end | 0, parentRange.count | 0, childrenRange.start | 0, childrenRange.end | 0, childrenRange.count | 0, siblingRange.start | 0, siblingRange.end | 0, siblingRange.count | 0, jumpsRange.start | 0, jumpsRange.end | 0, jumpsRange.count | 0);
        this.logInfo("  CACHED is this:", ret.toString());
        return ret;
    }
    clamp(value, min, max) {
        if (value < min) {
            return min;
        }
        else if (value > max) {
            return max;
        }
        return value;
    }
    getOneZoneRangeForZone(zone) {
        let one;
        let id = this.activeId || "";
        if (zone == "parent") {
            one = this.parentZoneRangesCache.get(id) || new OneZoneRange(0, 0, 0);
        }
        else if (zone == "child") {
            one = this.childrenZoneRangesCache.get(id) || new OneZoneRange(0, 0, 0);
        }
        else if (zone == "jump") {
            one = this.jumpsZoneRangesCache.get(id) || new OneZoneRange(0, 0, 0);
        }
        else if (zone == "sibling") {
            one = this.siblingZoneRangesCache.get(this.siblingCacheKey(this.node)) || new OneZoneRange(0, 0, 0);
        }
        else {
            throw new Error("Unknown zone for setZoneRangeForZone: " + zone);
        }
        return one;
    }
    setCountForZone(zone, count) {
        let one = this.getOneZoneRangeForZone(zone);
        this.setOneZoneRangeForZone(zone, new OneZoneRange(one.start, one.end, count));
    }
    setZoneRangeForZone(zone, start, end) {
        let span = end - start;
        this.logInfo("sZR4Z: zone: " + zone + ", span: " + span);
        let one = this.getOneZoneRangeForZone(zone);
        this.setOneZoneRangeForZone(zone, new OneZoneRange(start, Math.min(end, one.count), one.count));
    }
    setOneZoneRangeForZone(zone, oneZoneRange) {
        let id = this.activeId || "";
        let siblingKey = this.siblingCacheKey(this.node);
        this.logInfo("SET ONE - zone:", zone, "siblingKey: ", siblingKey, " activeId: ", id);
        if (zone == "parent") {
            this.parentZoneRangesCache.set(id, oneZoneRange);
            this.logInfo("set zone range for parent:", oneZoneRange);
        }
        else if (zone == "child") {
            this.childrenZoneRangesCache.set(id, oneZoneRange);
            this.logInfo("set zone range for child:", oneZoneRange);
        }
        else if (zone == "jump") {
            this.jumpsZoneRangesCache.set(id, oneZoneRange);
            this.logInfo("set zone range for jump:", oneZoneRange);
        }
        else if (zone == "sibling") {
            this.siblingZoneRangesCache.set(siblingKey, oneZoneRange);
            this.logInfo("set zone range for sibling:", oneZoneRange);
        }
        else {
            throw new Error("Unknown zone for setZoneRangesForZone: " + zone);
        }
    }
    clearZoneCaches() {
        this.zrCachedOld = null;
        this.jumpsZoneRangesCache = new Map();
        this.parentZoneRangesCache = new Map();
        this.siblingZoneRangesCache = new Map();
        this.childrenZoneRangesCache = new Map();
        this.zoneScrollbars = {};
        Scrollbar.resetZoneStates();
    }
    start(orderedJobId, graph, isScrollEvent, zoneRanges, activeId, focusedId, itemFocusedUsingKeyboardNav, links, layout, animationTime, colors, isReadOnly, rowHeight, fontSize) {
        var _a, _b, _c, _d;
        if (this.lastActivateClickTime > 0) {
            const elapsed = performance.now() - this.lastActivateClickTime;
            if (elapsed > 1000) {
                console.warn(`[PERF] Slow click-to-start: ${elapsed.toFixed(0)}ms`);
            }
            this.lastActivateClickTime = 0;
        }
        this.logInfo("-=-=-\nSTART called with activeId:", activeId);
        if (orderedJobId == 0) {
            this.logInfo("orderedJobId is 0, to clearZoneCaches");
            this.clearZoneCaches();
        }
        if (orderedJobId && this.lastOrderedJobId > orderedJobId) {
            this.logInfo("BAILING because of an out of order Start job request:", this.lastOrderedJobId, " > ", orderedJobId);
            return;
        }
        if (orderedJobId) {
            this.lastOrderedJobId = orderedJobId;
        }
        if (isScrollEvent) {
            animationTime *= 0.333;
        }
        this._swappingStartId++;
        const mySwappingId = this._swappingStartId;
        this.isSwappingThoughtElements = true;
        requestAnimationFrame(() => {
            if (this._swappingStartId === mySwappingId) {
                this.isSwappingThoughtElements = false;
            }
        });
        this.plexThoughtFontSize = fontSize;
        if (this.activeId != activeId) {
            this.zoneScrollbars = {};
            Scrollbar.resetZoneStates();
        }
        this.lastActiveId = this.activeId;
        this.activeId = activeId;
        this.focusedId = focusedId;
        this.focusedUsingKeyboardNav = itemFocusedUsingKeyboardNav;
        this.primaryLinks = new Set();
        let lastNode = this.node;
        this.currentLayout.prepareDisappearOld(lastNode);
        if (layout == LayoutType.Normal) {
            this.currentLayout = this.normalLayout;
        }
        else if (layout == LayoutType.NormalPlusOne) {
            this.currentLayout = this.normalPlusOneLayout;
        }
        else if (layout == LayoutType.Outline) {
            this.currentLayout = this.outlineLayout;
        }
        else if (layout == LayoutType.Mindmap) {
            this.currentLayout = this.mindmapLayout;
        }
        let node = LayoutNode.fromGraph(graph);
        this.node = node;
        this.nodeChildrenIds = new Set(((_a = node.children) !== null && _a !== void 0 ? _a : []).map((n) => n.id));
        this.nodeParentsIds = new Set(((_b = node.parents) !== null && _b !== void 0 ? _b : []).map((n) => n.id));
        this.nodeJumpsIds = new Set(((_c = node.jumps) !== null && _c !== void 0 ? _c : []).map((n) => n.id));
        this.nodeSiblingsIds = new Set(((_d = node.siblings) !== null && _d !== void 0 ? _d : []).map((n) => n.id));
        if (layout == LayoutType.Normal || layout == LayoutType.NormalPlusOne) {
            let zr = ZoneRanges.fromObject(zoneRanges);
            this.logInfo('JS Zone Ranges:', zr.toString());
            let zrCached = this.zoneRangesFromLayoutNode(node, activeId);
            this.zrCachedOld = zrCached;
            this.lastRangesWerePerfectMatch = zr.equals(zrCached);
            if (!this.lastRangesWerePerfectMatch) {
                this.logInfo("------------------------------- Not a perfect match");
            }
            this.setCountForZone("parent", zr.parentCount);
            this.setCountForZone("child", zr.childCount);
            this.setCountForZone("jump", zr.jumpCount);
            this.setCountForZone("sibling", zr.siblingCount);
            const zones = [
                { name: "jump", count: zr.jumpCount, size: this.nodeJumpsIds.size },
                { name: "child", count: zr.childCount, size: this.nodeChildrenIds.size },
                { name: "parent", count: zr.parentCount, size: this.nodeParentsIds.size },
                { name: "sibling", count: zr.siblingCount, size: this.nodeSiblingsIds.size },
            ];
            for (const z of zones) {
                if (z.count < z.size) {
                    let msg = z.name + "Count mismatch: C# sent " + z.count + " but LayoutNode has " + z.size + ". zr: " + zr.toString();
                    console.error("[PLEX-DIAG] " + msg);
                    safeInvoke(this.dotNetHelper, "LogPlexDiagnostic", [msg]);
                }
            }
        }
        else {
            this.lastRangesWerePerfectMatch = true;
        }
        this.setSecondGenerationRelatedNodes();
        let thoughtCount = 1 + this.nodeChildrenIds.size + this.nodeParentsIds.size + this.nodeJumpsIds.size + this.nodeSiblingsIds.size;
        this.logInfo("start - Thought count: " + thoughtCount);
        let numberOfDivsOnDeck = this.deck.querySelectorAll(".tht").length;
        this.logInfo("start - Number of divs on deck: " + numberOfDivsOnDeck);
        this.linksInUse.clear();
        let linkIds = [];
        links.forEach(l => {
            this.linksInUse.add(l.id);
            linkIds.push(l.id);
        });
        this.addLinkReps(links);
        this.layout = layout;
        this.animationTime = animationTime;
        this.colors = colors;
        this.isReadOnly = isReadOnly;
        this.initialRowHeight = rowHeight;
        this.ensureRowHeight();
        this.forceLayout.setRowHeight(this.rowHeight);
        this.debugMe("before removeOld");
        this.removeOld();
        this.debugMe("before marCurAndOffscreenAsOld");
        this.markCurAndOffscreenAsOld();
        this.debugMe("before cloneNewAndMarkAsCur");
        this.cloneNewAndMarkAsCur(this.deck);
        this.debugMe("before replaceOldWithCur");
        this.currentLayout.replaceOldWithCur();
        if (this.layout == LayoutType.Force) {
            this.setThoughtElementTransitionTimes(0);
        }
        else {
            this.setThoughtElementTransitionTimes(this.animationTime);
        }
        plexCanvas.suppressHoverForAnimation(this.animationTime);
        this.initThoughtReps();
        this.processPendingHighlights();
        if (this.layout == LayoutType.Outline || this.layout == LayoutType.Mindmap) {
            plexCanvas.setScrollbarsToDraw([]);
        }
        if (this.layout == LayoutType.Force) {
            this.initForceLayout();
            plexCanvas.setScrollbarsToDraw([]);
        }
        else {
            this.moveWrapper();
            this.forceLayout.reset();
        }
        this.requestExtraLinks();
        this.markNonLayoutCurAsOld();
        this.disappearOld();
        if (this.lastRangesWerePerfectMatch && zoneRanges &&
            (this.layout == LayoutType.Normal || this.layout == LayoutType.NormalPlusOne)) {
            let zrAfterLayout = this.zoneRangesFromLayoutNode(this.node, this.activeId || "");
            if (!ZoneRanges.fromObject(zoneRanges).equals(zrAfterLayout)) {
                this.lastRangesWerePerfectMatch = false;
            }
        }
        this.scrollDirStr = "";
        this.lastActiveId = this.activeId;
        if (this.scrollRangesUpdateTimer != 0) {
            clearTimeout(this.scrollRangesUpdateTimer);
            this.scrollRangesUpdateTimer = 0;
        }
        const capturedNode = this.node;
        const capturedActiveId = this.activeId;
        this.scrollRangesUpdateTimer = setTimeout(() => {
            if (this.activeId === capturedActiveId && this.node === capturedNode) {
                this.maybeTellServerToRelayout(false);
            }
            this.removeOld();
            this.hideOffscreen();
            if (this.layout == LayoutType.Force) {
                this.lastNormalLayoutThoughtPoints = {};
            }
        }, this.animationTime * 1000);
    }
    processPendingHighlights() {
        if (this.pendingHighlightIds.size === 0)
            return;
        const found = [];
        for (const id of this.pendingHighlightIds) {
            if (this.thtReps.has(id)) {
                found.push(id);
            }
        }
        for (const id of found) {
            this.pendingHighlightIds.delete(id);
            console.info("processPendingHighlights: highlighting", id);
            this.showNewThoughtHighlight(id);
        }
    }
    highlightNewThoughts(thoughtIds) {
        console.info("plexAnimator.highlightNewThoughts: queuing", thoughtIds);
        for (const id of thoughtIds) {
            this.pendingHighlightIds.add(id);
        }
    }
    showNewThoughtHighlight(thoughtId) {
        var _a;
        const thtRep = this.thtReps.get(thoughtId);
        if (!thtRep) {
            console.warn("showNewThoughtHighlight: no thtRep found for", thoughtId, "available keys:", Array.from(this.thtReps.keys()));
            return;
        }
        console.info("showNewThoughtHighlight: found thtRep for", thoughtId);
        let thtEl = thtRep.thtEl;
        const rect = thtEl.getBoundingClientRect();
        const fieldRect = this.field.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0)
            return;
        if (rect.right < fieldRect.left || rect.left > fieldRect.right ||
            rect.bottom < fieldRect.top || rect.top > fieldRect.bottom)
            return;
        const initialSize = (Math.max(rect.width, rect.height) + 60) * 1.5;
        const colorNum = (_a = this.colors.thoughtHighlightOutline) !== null && _a !== void 0 ? _a : 0xffffff;
        const r = (colorNum & 0xFF0000) >>> 16;
        const g = (colorNum & 0xFF00) >>> 8;
        const b = colorNum & 0xFF;
        const highlight = document.createElement("div");
        highlight.style.position = "absolute";
        highlight.style.pointerEvents = "none";
        highlight.style.zIndex = "20";
        highlight.style.borderRadius = "50%";
        highlight.style.border = `6px solid rgb(${r},${g},${b})`;
        highlight.style.boxSizing = "border-box";
        highlight.style.width = initialSize + "px";
        highlight.style.height = initialSize + "px";
        highlight.style.animation = "newThoughtHighlightShrink 1.5s linear forwards";
        this.field.appendChild(highlight);
        const field = this.field;
        let alive = true;
        const updatePosition = () => {
            if (!alive || !highlight.parentNode)
                return;
            if (!thtEl.isConnected) {
                const replacement = document.getElementById("tht-" + thoughtId + "-cur");
                if (replacement) {
                    thtEl = replacement;
                }
                else {
                    alive = false;
                    highlight.remove();
                    return;
                }
            }
            const r2 = thtEl.getBoundingClientRect();
            const fr = field.getBoundingClientRect();
            const cx = (r2.left + r2.width / 2) - fr.left;
            const cy = (r2.top + r2.height / 2) - fr.top;
            highlight.style.left = (cx - initialSize / 2) + "px";
            highlight.style.top = (cy - initialSize / 2) + "px";
            requestAnimationFrame(updatePosition);
        };
        updatePosition();
        highlight.addEventListener("animationend", () => { alive = false; highlight.remove(); });
        setTimeout(() => { alive = false; if (highlight.parentNode)
            highlight.remove(); }, 2200);
    }
    showGateHighlights(thoughtId, relations) {
        this.removeGateHighlights();
        if (!this.node || !this.field)
            return;
        const targetId = (thoughtId && thoughtId.length > 0) ? thoughtId : this.node.id;
        const thtRep = this.thtReps.get(targetId);
        if (!thtRep)
            return;
        const targetRelations = (relations && relations.length > 0)
            ? relations
            : [Relation.Parent, Relation.Child, Relation.Jump];
        for (const rel of targetRelations) {
            const ring = document.createElement('div');
            ring.style.position = 'absolute';
            ring.style.pointerEvents = 'none';
            ring.style.zIndex = '20';
            ring.style.width = '28px';
            ring.style.height = '28px';
            ring.style.borderRadius = '50%';
            ring.style.border = '2px solid rgba(59, 130, 246, 0.8)';
            ring.style.boxShadow = '0 0 8px 2px rgba(59, 130, 246, 0.3)';
            ring.style.animation = 'gateHighlightPulse 2s ease-in-out infinite';
            ring.dataset.gateRelation = rel.toString();
            this.field.appendChild(ring);
            this.gateHighlightElements.push(ring);
        }
        const updatePositions = () => {
            if (this.gateHighlightElements.length === 0)
                return;
            const currentThtRep = this.thtReps.get(targetId);
            if (!currentThtRep) {
                this.removeGateHighlights();
                return;
            }
            for (const ring of this.gateHighlightElements) {
                const rel = parseInt(ring.dataset.gateRelation);
                const pos = plexCanvas.getGateLocationFromThoughtRep(currentThtRep, rel);
                ring.style.left = (pos.x - 14) + 'px';
                ring.style.top = (pos.y - 14) + 'px';
            }
            this.gateHighlightRafId = requestAnimationFrame(updatePositions);
        };
        updatePositions();
    }
    removeGateHighlights() {
        if (this.gateHighlightRafId) {
            cancelAnimationFrame(this.gateHighlightRafId);
            this.gateHighlightRafId = 0;
        }
        for (const el of this.gateHighlightElements) {
            el.remove();
        }
        this.gateHighlightElements = [];
    }
    showDragHint(sourceThoughtId, sourceRelation, targetThoughtId, arcBelow = false) {
        this.removeDragHint();
        if (!this.field)
            return;
        const srcRep = this.thtReps.get(sourceThoughtId);
        const tgtRep = this.thtReps.get(targetThoughtId);
        if (!srcRep || !tgtRep)
            return;
        const srcRing = document.createElement('div');
        srcRing.style.position = 'absolute';
        srcRing.style.pointerEvents = 'none';
        srcRing.style.zIndex = '20';
        srcRing.style.width = '28px';
        srcRing.style.height = '28px';
        srcRing.style.borderRadius = '50%';
        srcRing.style.border = '2px solid rgba(59, 130, 246, 0.8)';
        srcRing.style.boxShadow = '0 0 8px 2px rgba(59, 130, 246, 0.3)';
        srcRing.style.animation = 'gateHighlightPulse 2s ease-in-out infinite';
        this.field.appendChild(srcRing);
        this.dragHintElements.push(srcRing);
        const tgtGlow = document.createElement('div');
        tgtGlow.style.position = 'absolute';
        tgtGlow.style.pointerEvents = 'none';
        tgtGlow.style.zIndex = '19';
        tgtGlow.style.borderRadius = '12px';
        tgtGlow.style.border = '2px solid rgba(59, 130, 246, 0.7)';
        tgtGlow.style.boxShadow = '0 0 12px 4px rgba(59, 130, 246, 0.25)';
        tgtGlow.style.animation = 'dragHintTargetPulse 2s ease-in-out infinite';
        this.field.appendChild(tgtGlow);
        this.dragHintElements.push(tgtGlow);
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.style.position = 'absolute';
        svg.style.left = '0';
        svg.style.top = '0';
        svg.style.width = '100%';
        svg.style.height = '100%';
        svg.style.pointerEvents = 'none';
        svg.style.zIndex = '18';
        svg.style.overflow = 'visible';
        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
        marker.setAttribute('id', 'dragHintArrow');
        marker.setAttribute('markerWidth', '10');
        marker.setAttribute('markerHeight', '8');
        marker.setAttribute('refX', '9');
        marker.setAttribute('refY', '4');
        marker.setAttribute('orient', 'auto');
        const arrowPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        arrowPath.setAttribute('d', 'M0,0 L10,4 L0,8 L2,4 Z');
        arrowPath.setAttribute('fill', 'rgba(59, 130, 246, 0.6)');
        marker.appendChild(arrowPath);
        defs.appendChild(marker);
        svg.appendChild(defs);
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', 'rgba(59, 130, 246, 0.5)');
        path.setAttribute('stroke-width', '2');
        path.setAttribute('stroke-dasharray', '8 6');
        path.setAttribute('marker-end', 'url(#dragHintArrow)');
        path.style.animation = 'dragHintDash 1s linear infinite';
        svg.appendChild(path);
        this.field.appendChild(svg);
        this.dragHintElements.push(svg);
        const field = this.field;
        const rel = sourceRelation;
        const updatePositions = () => {
            if (this.dragHintElements.length === 0)
                return;
            const currentSrc = this.thtReps.get(sourceThoughtId);
            const currentTgt = this.thtReps.get(targetThoughtId);
            if (!currentSrc || !currentTgt) {
                this.removeDragHint();
                return;
            }
            const srcPos = plexCanvas.getGateLocationFromThoughtRep(currentSrc, rel);
            srcRing.style.left = (srcPos.x - 14) + 'px';
            srcRing.style.top = (srcPos.y - 14) + 'px';
            const tgtEl = currentTgt.thtEl;
            const tgtRect = tgtEl.getBoundingClientRect();
            const fieldRect = field.getBoundingClientRect();
            const tgtLeft = tgtRect.left - fieldRect.left;
            const tgtTop = tgtRect.top - fieldRect.top;
            const pad = 8;
            tgtGlow.style.left = (tgtLeft - pad) + 'px';
            tgtGlow.style.top = (tgtTop - pad) + 'px';
            tgtGlow.style.width = (tgtRect.width + pad * 2) + 'px';
            tgtGlow.style.height = (tgtRect.height + pad * 2) + 'px';
            const tgtCx = tgtLeft + tgtRect.width / 2;
            const tgtCy = tgtTop + tgtRect.height / 2;
            const edgeMargin = pad + 4;
            const adx = Math.abs(srcPos.x - tgtCx);
            const ady = Math.abs(srcPos.y - tgtCy);
            const aspectX = adx / (tgtRect.width / 2 + edgeMargin || 1);
            const aspectY = ady / (tgtRect.height / 2 + edgeMargin || 1);
            let endX, endY;
            if (aspectX > aspectY) {
                endX = srcPos.x < tgtCx ? tgtLeft - edgeMargin : tgtLeft + tgtRect.width + edgeMargin;
                endY = tgtCy;
            }
            else {
                endX = tgtCx;
                endY = srcPos.y < tgtCy ? tgtTop - edgeMargin : tgtTop + tgtRect.height + edgeMargin;
            }
            const midX = (srcPos.x + endX) / 2;
            const midY = (srcPos.y + endY) / 2;
            const dx = endX - srcPos.x;
            const dy = endY - srcPos.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const curvature = Math.min(dist * 0.3, 60);
            const sign = arcBelow ? -1 : 1;
            const cpX = midX + (dy / dist) * curvature * sign;
            const cpY = midY - (dx / dist) * curvature * sign;
            path.setAttribute('d', `M${srcPos.x},${srcPos.y} Q${cpX},${cpY} ${endX},${endY}`);
            this.dragHintRafId = requestAnimationFrame(updatePositions);
        };
        updatePositions();
    }
    removeDragHint() {
        if (this.dragHintRafId) {
            cancelAnimationFrame(this.dragHintRafId);
            this.dragHintRafId = 0;
        }
        for (const el of this.dragHintElements) {
            el.remove();
        }
        this.dragHintElements = [];
    }
    highlightThoughts(thoughtIds) {
        this.removeDragHint();
        if (!this.field || !thoughtIds || thoughtIds.length === 0)
            return;
        const glowMap = new Map();
        const field = this.field;
        const ids = [...thoughtIds];
        const createGlow = (id) => {
            const glow = document.createElement('div');
            glow.style.position = 'absolute';
            glow.style.pointerEvents = 'none';
            glow.style.zIndex = '19';
            glow.style.borderRadius = '12px';
            glow.style.border = '2px solid rgba(59, 130, 246, 0.7)';
            glow.style.boxShadow = '0 0 12px 4px rgba(59, 130, 246, 0.25)';
            glow.style.animation = 'dragHintTargetPulse 2s ease-in-out infinite';
            field.appendChild(glow);
            this.dragHintElements.push(glow);
            return glow;
        };
        const updatePositions = () => {
            const fieldRect = field.getBoundingClientRect();
            for (const id of ids) {
                const rep = this.thtReps.get(id);
                if (!rep)
                    continue;
                let glow = glowMap.get(id);
                if (!glow) {
                    glow = createGlow(id);
                    glowMap.set(id, glow);
                }
                const rect = rep.thtEl.getBoundingClientRect();
                const pad = 8;
                glow.style.left = (rect.left - fieldRect.left - pad) + 'px';
                glow.style.top = (rect.top - fieldRect.top - pad) + 'px';
                glow.style.width = (rect.width + pad * 2) + 'px';
                glow.style.height = (rect.height + pad * 2) + 'px';
            }
            this.dragHintRafId = requestAnimationFrame(updatePositions);
        };
        updatePositions();
    }
    showGateDragArrow(thoughtId, relation, offsetX, offsetY) {
        var _a;
        this.removeDragHint();
        if (!this.field)
            return;
        const targetId = (thoughtId && thoughtId.length > 0) ? thoughtId : (_a = this.node) === null || _a === void 0 ? void 0 : _a.id;
        if (!targetId)
            return;
        const srcRep = this.thtReps.get(targetId);
        if (!srcRep)
            return;
        const srcRing = document.createElement('div');
        srcRing.style.position = 'absolute';
        srcRing.style.pointerEvents = 'none';
        srcRing.style.zIndex = '20';
        srcRing.style.width = '28px';
        srcRing.style.height = '28px';
        srcRing.style.borderRadius = '50%';
        srcRing.style.border = '2px solid rgba(59, 130, 246, 0.8)';
        srcRing.style.boxShadow = '0 0 8px 2px rgba(59, 130, 246, 0.3)';
        srcRing.style.animation = 'gateHighlightPulse 2s ease-in-out infinite';
        this.field.appendChild(srcRing);
        this.dragHintElements.push(srcRing);
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.style.position = 'absolute';
        svg.style.left = '0';
        svg.style.top = '0';
        svg.style.width = '100%';
        svg.style.height = '100%';
        svg.style.pointerEvents = 'none';
        svg.style.zIndex = '18';
        svg.style.overflow = 'visible';
        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
        marker.setAttribute('id', 'gateDragArrow');
        marker.setAttribute('markerWidth', '10');
        marker.setAttribute('markerHeight', '8');
        marker.setAttribute('refX', '9');
        marker.setAttribute('refY', '4');
        marker.setAttribute('orient', 'auto');
        const arrowPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        arrowPath.setAttribute('d', 'M0,0 L10,4 L0,8 L2,4 Z');
        arrowPath.setAttribute('fill', 'rgba(59, 130, 246, 0.6)');
        marker.appendChild(arrowPath);
        defs.appendChild(marker);
        svg.appendChild(defs);
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', 'rgba(59, 130, 246, 0.5)');
        path.setAttribute('stroke-width', '2');
        path.setAttribute('stroke-dasharray', '8 6');
        path.setAttribute('marker-end', 'url(#gateDragArrow)');
        path.style.animation = 'dragHintDash 1s linear infinite';
        svg.appendChild(path);
        this.field.appendChild(svg);
        this.dragHintElements.push(svg);
        const rel = relation;
        const updatePositions = () => {
            if (this.dragHintElements.length === 0)
                return;
            const currentSrc = this.thtReps.get(targetId);
            if (!currentSrc) {
                this.removeDragHint();
                return;
            }
            const srcPos = plexCanvas.getGateLocationFromThoughtRep(currentSrc, rel);
            srcRing.style.left = (srcPos.x - 14) + 'px';
            srcRing.style.top = (srcPos.y - 14) + 'px';
            const endX = srcPos.x + offsetX;
            const endY = srcPos.y + offsetY;
            const cpX = srcPos.x + offsetX * 0.3 + 20;
            const cpY = srcPos.y + offsetY * 0.5;
            path.setAttribute('d', `M${srcPos.x},${srcPos.y} Q${cpX},${cpY} ${endX},${endY}`);
            this.dragHintRafId = requestAnimationFrame(updatePositions);
        };
        updatePositions();
    }
    maybeTellServerToRelayout(isScrollEvent) {
        let millisecondsSinceEpoch = Date.now();
        this.logInfo("*** maybeTellServerToRelayout - current time in milliseconds since epoch: ", millisecondsSinceEpoch);
        if (!this.lastRangesWerePerfectMatch && this.node != null) {
            let zr = this.zoneRangesFromLayoutNode(this.node, this.activeId || "<BOGUS>");
            this.logInfo("calling C# SetNormalViewZoneRangesAndRelayout");
            safeInvoke(this.dotNetHelper, "SetNormalViewZoneRangesAndRelayout", [zr, isScrollEvent, millisecondsSinceEpoch]);
        }
        else {
            this.logInfo("lastRangesWerePerfectMatch, no need to call C# SetNormalViewZoneRangesAndRelayout");
        }
    }
    showExpandResults(expandedId, links) {
        if (this.layout != LayoutType.Force) {
            return;
        }
        console.time("Received extra thoughts");
        this.addLinkReps(links);
        this.removeOld();
        this.cloneNewAndMarkAsCur(this.expandDeck);
        this.normalLayout.replaceOldWithCur();
        console.timeEnd("Received extra thoughts");
        this.initThoughtReps();
        this.initForceLayout();
        this.requestExtraLinks();
        this.disappearOld();
        setTimeout(() => {
            this.removeOld();
            this.hideOffscreen();
        }, this.animationTime * 1000);
    }
    getVisibleLinksToThought(thtId) {
        let result = [];
        this.linkReps.forEach((linkRep) => {
            if ((linkRep.idA === thtId && this.thtReps.has(linkRep.idB)) || (linkRep.idB === thtId && this.thtReps.has(linkRep.idA))) {
                result.push((linkRep));
            }
        });
        return result;
    }
    canExpand(thtRep) {
        if (thtRep.expandDirection === ThoughtExpandDirection.Parent) {
            return thtRep.parentGate === GateStatus.More;
        }
        else if (thtRep.expandDirection === ThoughtExpandDirection.Child || thtRep.expandDirection === ThoughtExpandDirection.ChildLeft) {
            return thtRep.childGate === GateStatus.More;
        }
        return thtRep.childGate === GateStatus.More || thtRep.parentGate === GateStatus.More || thtRep.jumpGate === GateStatus.More;
    }
    canCollapse(thtRep) {
        return this.getThoughtIdsToHideOnCollapse(thtRep.id, 0).length > 0;
    }
    getThoughtIdsToHideOnCollapse(thtId, generation) {
        let result = [];
        let linksToTht = this.getVisibleLinksToThought(thtId);
        let linkCount = linksToTht.length;
        if (generation >= 1 && linkCount > 1) {
            return result;
        }
        if (linkCount === 1 && thtId !== this.activeId) {
            result.push(thtId);
            return result;
        }
        linksToTht.forEach((link) => {
            let otherThtId = link.idA == thtId ? link.idB : link.idA;
            let addThese = this.getThoughtIdsToHideOnCollapse(otherThtId, generation + 1);
            if (addThese !== null) {
                result = result.concat(addThese);
            }
        });
        return result;
    }
    removeThoughtRep(id) {
        if (this.thtReps.has(id)) {
            let thtRep = this.thtReps.get(id);
            thtRep.thtEl.remove();
            this.thtReps.delete(id);
        }
    }
    getThoughtElementId(thtId) {
        if (!thtId) {
            return null;
        }
        let thoughtRep = this.thtReps.get(thtId);
        if (!thoughtRep) {
            let normalizedId = thtId.toLowerCase();
            thoughtRep = this.thtReps.get(normalizedId);
            if (!thoughtRep) {
                for (let rep of this.thtReps.values()) {
                    if (rep.id.toLowerCase() === normalizedId) {
                        thoughtRep = rep;
                        break;
                    }
                }
            }
        }
        if (!thoughtRep) {
            return null;
        }
        return thoughtRep.thtEl.id;
    }
    collapseThought(collapseId) {
        if (this.layout != LayoutType.Force) {
            throw new Error("Attempt to collapse when not in force layout");
        }
        let idsToCollapse = this.getThoughtIdsToHideOnCollapse(collapseId, 0);
        if (idsToCollapse.length == 0) {
            return;
        }
        idsToCollapse.forEach((id) => {
            this.removeThoughtRep(id);
        });
        this.initThoughtReps();
        this.initForceLayout();
        this.requestExtraLinks();
        this.disappearOld();
    }
    removeOld() {
        let thtElements = this.field.querySelectorAll(".tht.old");
        thtElements.forEach((thtEl) => {
            let thtId = thtEl.id.substring(4, 40);
            this.thtReps.delete(thtId);
            thtEl.remove();
        });
        let thtElements2 = this.field.querySelectorAll(".tht.cur");
        thtElements2.forEach((thtEl) => {
            let thtId = thtEl.id.substring(4, 40);
            if (!this.thtReps.has(thtId)) {
                this.thtReps.set(thtId, new ThoughtRep(thtEl));
            }
        });
    }
    markCurAndOffscreenAsOld() {
        let thtElements = this.field.querySelectorAll(".tht.cur, .tht.off");
        thtElements.forEach((thtEl) => {
            this.markElementAsOld(thtEl);
        });
    }
    doesThoughtHaveZone(thtEl, zone) {
        if (zone === "all") {
            return true;
        }
        if (zone == "child") {
            return this.nodeChildrenIds.has(thtEl.id.substring(4, 40));
        }
        if (zone == "parent") {
            return this.nodeParentsIds.has(thtEl.id.substring(4, 40));
        }
        if (zone == "jump") {
            return this.nodeJumpsIds.has(thtEl.id.substring(4, 40));
        }
        if (zone == "sibling") {
            return this.nodeSiblingsIds.has(thtEl.id.substring(4, 40));
        }
        return false;
    }
    markOffscreenAsCur(zone) {
        let thtElements = this.field.querySelectorAll(".tht.off");
        let that = this;
        thtElements.forEach((thtEl) => {
            if (!that.doesThoughtHaveZone(thtEl, zone)) {
                return;
            }
            this.markElementAsCur(thtEl);
        });
    }
    markElementAsOld(thtEl) {
        thtEl.classList.remove("cur", "off");
        thtEl.classList.add("old");
        thtEl.style.pointerEvents = "none";
        thtEl.id = thtEl.id.substring(0, thtEl.id.length - 4) + "-old";
    }
    markElementAsOffscreen(thtEl, destPoint, isScrollEvent) {
        thtEl.classList.remove("cur", "off");
        thtEl.classList.add("off");
        thtEl.id = thtEl.id.substring(0, thtEl.id.length - 4) + "-off";
        if (destPoint != null) {
            thtEl.style.opacity = "0";
            thtEl.style.fontSize = "0";
            let thtIconEl = thtEl.querySelector(".tht-icon");
            if (thtIconEl) {
                thtIconEl.style.height = "0px";
            }
            thtEl.style.left = destPoint.x - (thtEl.clientWidth * 0.5) + "px";
            thtEl.style.top = destPoint.y - (thtEl.clientHeight * 0.5) + "px";
        }
    }
    setThoughtDisappearPosition(thtEl, destPoint) {
        if (destPoint != null) {
            thtEl.style.opacity = "0";
            thtEl.style.fontSize = "0";
            let thtIconEl = thtEl.querySelector(".tht-icon");
            if (thtIconEl) {
                thtIconEl.style.height = "0px";
            }
            thtEl.style.left = destPoint.x - (thtEl.clientWidth * 0.5) + "px";
            thtEl.style.top = destPoint.y - (thtEl.clientHeight * 0.5) + "px";
        }
    }
    markElementAsCur(thtEl) {
        thtEl.classList.remove("off", "old");
        thtEl.classList.add("cur");
        thtEl.id = thtEl.id.substring(0, thtEl.id.length - 4) + "-cur";
    }
    cloneNewAndMarkAsCur(container) {
        let thtElements = container.querySelectorAll(".tht");
        thtElements.forEach((thtEl) => {
            let thtId = thtEl.id.substring(4);
            let newThtElement = thtEl.cloneNode(true);
            if (this.thtReps.has(thtId)) {
                let existingEl = this.thtReps.get(thtId).thtEl;
                this.markElementAsOld(existingEl);
                newThtElement.style.display = existingEl.style.display;
                newThtElement.style.fontSize = existingEl.style.fontSize;
            }
            else {
                newThtElement.style.display = "none";
            }
            newThtElement.classList.add("cur");
            newThtElement.classList.add("drop-zone-enabled");
            newThtElement.id = thtEl.id + "-cur";
            newThtElement.style.zIndex = "5";
            this.field.appendChild(newThtElement);
            if (plexCanvas.selectedThoughtIds.includes(thtId)) {
                newThtElement.classList.add("thought-selected");
            }
        });
    }
    backgroundDragEnded() {
        this.forceInvalidateLayout();
    }
    backgroundDragged(deltaPoint, hasDragExceededClickDistance) {
        if (!hasDragExceededClickDistance) {
            return;
        }
        this.isBackgroundDragged = this.isBackgroundDragged || hasDragExceededClickDistance;
        this.setThoughtElementTransitionTimes(0);
        if (this.layout == LayoutType.Normal || this.layout == LayoutType.NormalPlusOne) {
            const fieldRect = this.field.getBoundingClientRect();
            if (fieldRect.height > 0) {
                const deltaRatio = deltaPoint.y / fieldRect.height;
                this.normalCenterRatio = Math.max(this.NORMAL_CENTER_MIN, Math.min(this.NORMAL_CENTER_MAX, this.normalCenterRatio + deltaRatio));
                this.thoughtIdSet.clear();
                this.currentLayout.moveCurToNewPositions("all", false);
            }
            return;
        }
        let thtElements = this.field.querySelectorAll(".tht");
        let clamped = this.clampPanDelta(deltaPoint.x, deltaPoint.y, thtElements);
        let dx = Math.round(clamped.x);
        let dy = Math.round(clamped.y);
        if (dx === 0 && dy === 0)
            return;
        this.lastBackgroundDragX += clamped.x;
        this.lastBackgroundDragY += clamped.y;
        thtElements.forEach((thtEl) => {
            thtEl.style.left = (parseInt(thtEl.style.left) + dx) + "px";
            thtEl.style.top = (parseInt(thtEl.style.top) + dy) + "px";
        });
    }
    getThoughtsBoundingBox(thtElements) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        let count = 0;
        thtElements.forEach((el) => {
            if (el.style.display === "none")
                return;
            let left = parseInt(el.style.left);
            let top = parseInt(el.style.top);
            if (isNaN(left) || isNaN(top))
                return;
            count++;
            minX = Math.min(minX, left);
            minY = Math.min(minY, top);
            maxX = Math.max(maxX, left + el.offsetWidth);
            maxY = Math.max(maxY, top + el.offsetHeight);
        });
        return count > 0 ? { minX, minY, maxX, maxY } : null;
    }
    clampPanDelta(dx, dy, thtElements) {
        const bbox = this.getThoughtsBoundingBox(thtElements);
        if (!bbox)
            return new Point(dx, dy);
        const fieldRect = this.field.getBoundingClientRect();
        const margin = PlexAnimator.PAN_EDGE_MARGIN;
        if (bbox.maxY + dy < margin)
            dy = margin - bbox.maxY;
        if (bbox.minY + dy > fieldRect.height - margin)
            dy = fieldRect.height - margin - bbox.minY;
        if (bbox.maxX + dx < margin)
            dx = margin - bbox.maxX;
        if (bbox.minX + dx > fieldRect.width - margin)
            dx = fieldRect.width - margin - bbox.minX;
        return new Point(dx, dy);
    }
    clampPanToViewport() {
        if (this.layout != LayoutType.Outline && this.layout != LayoutType.Mindmap && this.layout != LayoutType.Force)
            return;
        let thtElements = this.field.querySelectorAll(".tht");
        let clamped = this.clampPanDelta(0, 0, thtElements);
        let dx = Math.round(clamped.x);
        let dy = Math.round(clamped.y);
        if (dx === 0 && dy === 0)
            return;
        this.lastBackgroundDragX += clamped.x;
        this.lastBackgroundDragY += clamped.y;
        thtElements.forEach((thtEl) => {
            thtEl.style.left = (parseInt(thtEl.style.left) + dx) + "px";
            thtEl.style.top = (parseInt(thtEl.style.top) + dy) + "px";
        });
    }
    setThoughtElementTransitionTimes(seconds) {
        let thtElements = this.field.querySelectorAll(".tht");
        let lastActiveId = this.lastActiveId || "";
        thtElements.forEach((thtEl_) => {
            let thtEl = thtEl_;
            let id = thtEl.id.substring(4, 40);
            if (this.layout == LayoutType.Mindmap && id === lastActiveId) {
                thtEl.style.transition = "opacity " + seconds + "s ease, left " + seconds + "s ease, top " + seconds + "s ease, color " + seconds + "s ease";
            }
            else {
                thtEl.style.transition = "font-size " + seconds + "s ease, opacity " + seconds + "s ease, left " + seconds + "s ease, top " + seconds + "s ease, color " + seconds + "s ease";
            }
        });
        this.enablePlexFocusReticleAnimation(seconds > 0);
        plexCanvas.startAnimations(seconds);
    }
    enablePlexFocusReticleAnimation(enable) {
        let plexFocusCircle = document.getElementById("plex-focus-circle");
        if (plexFocusCircle) {
            let time = !enable ? 0 : (0.1);
            plexFocusCircle.style.transition = "left " + time + "s ease-out, top " + time + "s ease-out";
        }
    }
    *filterNodeList(nodeList, func) {
        for (let i = 0; i < nodeList.length; i++) {
            if (func(nodeList[i])) {
                yield nodeList[i];
            }
        }
    }
    getThoughtElements(selectorString, set) {
        let thtElementsList = this.field.querySelectorAll(selectorString);
        return Array.from(this.filterNodeList(thtElementsList, (thtEl) => set.has(thtEl.id.substring(4, 40))));
    }
    accountForThoughtAndRelations(thtEl) {
        var _a, _b, _c;
        let id = thtEl.id.substring(4, 40);
        this.thoughtIdSet.add(id);
        ((_a = this.nodeParentsOf.get(id)) !== null && _a !== void 0 ? _a : []).forEach((relationId) => {
            this.thoughtIdSet.add(relationId);
        });
        ((_b = this.nodeJumpsOf.get(id)) !== null && _b !== void 0 ? _b : []).forEach((relationId) => {
            this.thoughtIdSet.add(relationId);
        });
        ((_c = this.nodeChildrenOf.get(id)) !== null && _c !== void 0 ? _c : []).forEach((relationId) => {
            this.thoughtIdSet.add(relationId);
        });
    }
    accountForOtherZones(zone) {
        this.thoughtIdSet.add(this.activeId);
        if (zone !== "parent") {
            this.getThoughtElements('.tht.cur', this.nodeParentsIds).forEach((thtEl) => {
                this.accountForThoughtAndRelations(thtEl);
            });
        }
        if (zone !== "child") {
            this.getThoughtElements('.tht.cur', this.nodeChildrenIds).forEach((thtEl) => {
                this.accountForThoughtAndRelations(thtEl);
            });
        }
        if (zone !== "jump") {
            this.getThoughtElements('.tht.cur', this.nodeJumpsIds).forEach((thtEl) => {
                this.accountForThoughtAndRelations(thtEl);
            });
        }
        if (zone !== "sibling") {
            this.getThoughtElements('.tht.cur', this.nodeSiblingsIds).forEach((thtEl) => {
                this.accountForThoughtAndRelations(thtEl);
            });
        }
    }
    scrollChanged(zone, scrollDirStr) {
        var _a;
        this.scrollDirStr = scrollDirStr;
        this.scrolledZone = zone;
        this.showOffscreen(zone);
        this.setThoughtElementTransitionTimes(this.SCROLL_ANIMATION_TIME);
        if (this.layout == LayoutType.Normal) {
            this.normalLayout.moveCurToNewPositions(zone, true);
        }
        else if (this.layout == LayoutType.NormalPlusOne) {
            this.normalPlusOneLayout.moveCurToNewPositions(zone, true);
        }
        plexCanvas.applyPendingFocus();
        this.lastRangesWerePerfectMatch = false;
        let id = this.activeId || "<BOGUS>";
        let zrCached = this.zoneRangesFromLayoutNode(this.node || new LayoutNode(id), id);
        let myBool = false;
        let delta = 1;
        let c = this.normalLayoutZoneToColumns.get(zone) || 1;
        let r = this.normalLayoutZoneToRows.get(zone) || 1;
        if (c > 1) {
            delta = r;
        }
        let start = (((_a = this.zoneScrollbars[zone]) === null || _a === void 0 ? void 0 : _a.startAt) || 0) * delta;
        let end = start + r * c;
        this.setZoneRangeForZone(zone, start, end);
        let zr = this.zoneRangesFromLayoutNode(this.node || new LayoutNode(id), id);
        this.lastRangesWerePerfectMatch = zr.equals(zrCached);
        this.maybeTellServerToRelayout(true);
        this.accountForOtherZones(zone);
        this.requestExtraLinks();
        this.disappearOld(true);
        setTimeout(() => {
            this.hideOffscreen();
        }, this.SCROLL_ANIMATION_TIME * 1000);
    }
    forceInvalidateLayout() {
        this.setThoughtElementTransitionTimes(10);
        ["jump", "parent", "child", "sibling"].forEach((zone) => {
            var _a;
            if (this.layout == LayoutType.Normal) {
                this.normalLayout.moveCurToNewPositions(zone, true);
            }
            else if (this.layout == LayoutType.NormalPlusOne) {
                this.normalPlusOneLayout.moveCurToNewPositions(zone, true);
            }
            this.lastRangesWerePerfectMatch = false;
            let myBool = false;
            let delta = 1;
            let c = this.normalLayoutZoneToColumns.get(zone) || 1;
            let r = this.normalLayoutZoneToRows.get(zone) || 1;
            if (c > 1) {
                delta = r;
            }
            let start = (((_a = this.zoneScrollbars[zone]) === null || _a === void 0 ? void 0 : _a.startAt) || 0) * delta;
            let end = start + r * c;
            this.setZoneRangeForZone(zone, start, end);
        });
        this.lastRangesWerePerfectMatch = false;
        this.maybeTellServerToRelayout(true);
        this.requestExtraLinks();
        this.disappearOld(true);
        setTimeout(() => {
            this.hideOffscreen();
        }, 10);
    }
    scrollChangedTo(zone, pageNum) {
        var _a;
        this.scrolledZone = zone;
        this.showOffscreen(zone);
        this.setThoughtElementTransitionTimes(this.SCROLL_ANIMATION_TIME);
        if (this.layout == LayoutType.Normal) {
            this.normalLayout.moveCurToNewPositions(zone, true);
        }
        else if (this.layout == LayoutType.NormalPlusOne) {
            this.normalPlusOneLayout.moveCurToNewPositions(zone, true);
        }
        plexCanvas.applyPendingFocus();
        this.lastRangesWerePerfectMatch = false;
        let id = this.activeId || "<BOGUS>";
        let zrCached = this.zoneRangesFromLayoutNode(this.node || new LayoutNode(id), id);
        let myBool = false;
        let c = this.normalLayoutZoneToColumns.get(zone) || 1;
        let r = this.normalLayoutZoneToRows.get(zone) || 1;
        let start = 0;
        if (this.zoneScrollbars[zone]) {
            if ((_a = this.zoneScrollbars[zone]) === null || _a === void 0 ? void 0 : _a.isHorizontal) {
                start = pageNum * r;
            }
            else {
                start = pageNum;
            }
        }
        let end = start + r * c;
        this.setZoneRangeForZone(zone, start, end);
        let zr = this.zoneRangesFromLayoutNode(this.node || new LayoutNode(id), id);
        this.lastRangesWerePerfectMatch = zr.equals(zrCached);
        this.maybeTellServerToRelayout(true);
        this.accountForOtherZones(zone);
        this.requestExtraLinks();
        this.disappearOld(true);
        setTimeout(() => {
            this.hideOffscreen();
        }, this.SCROLL_ANIMATION_TIME * 1000);
    }
    hideOffscreen() {
        let thtElements = this.field.querySelectorAll(".tht.off");
        thtElements.forEach((thtEl_) => {
            let thtEl = thtEl_;
            thtEl.style.display = "none";
        });
    }
    markNonLayoutCurAsOld() {
        let curElements = this.field.querySelectorAll(".tht.cur");
        curElements.forEach((thtEl_) => {
            let thtEl = thtEl_;
            let id = thtEl.id.substring(4, 40);
            if (!this.thoughtIdSet.has(id)) {
                let isChildNoScroll = this.nodeChildrenIds.has(id) && !this.zoneScrollbars["child"];
                let isParentNoScroll = this.nodeParentsIds.has(id) && !this.zoneScrollbars["parent"];
                let isJumpNoScroll = this.nodeJumpsIds.has(id) && !this.zoneScrollbars["jump"];
                let isSiblingNoScroll = this.nodeSiblingsIds.has(id) && !this.zoneScrollbars["sibling"];
                if (isChildNoScroll || isParentNoScroll || isJumpNoScroll || isSiblingNoScroll) {
                    console.warn("[PLEX-BUG] markNonLayoutCurAsOld: hiding a thought that should be visible (no scrollbar in its zone)!", id, "child:", isChildNoScroll, "parent:", isParentNoScroll, "jump:", isJumpNoScroll, "sibling:", isSiblingNoScroll, "thoughtIdSet size:", this.thoughtIdSet.size);
                }
                this.markElementAsOld(thtEl);
            }
        });
    }
    showOffscreen(zone) {
        let thtElements = this.field.querySelectorAll(".tht.off");
        let that = this;
        thtElements.forEach((thtEl_) => {
            let thtEl = thtEl_;
            if (!that.doesThoughtHaveZone(thtEl, zone)) {
                return;
            }
            thtEl.style.display = "block";
        });
    }
    enablePresentationMode() {
        let elem = document.documentElement;
        if (elem.requestFullscreen) {
            elem.requestFullscreen();
        }
        else if (elem.webkitRequestFullscreen) {
            elem.webkitRequestFullscreen();
        }
        else if (elem.msRequestFullscreen) {
            elem.msRequestFullscreen();
        }
    }
    initForceLayout() {
        let fieldRect = this.field.getBoundingClientRect();
        this.forceLayout.setArea(new Rect(0, 0, fieldRect.width, fieldRect.height));
        let filteredLinks = Array.from(this.linkReps.values()).filter((l) => this.thtReps.has(l.idA) && this.thtReps.has(l.idB));
        this.thtReps.forEach((thtRep) => {
            thtRep.thtEl.style.opacity = "1";
            thtRep.thtEl.style.maxWidth = this.COL_WIDTH + "px";
        });
        this.forceLayout.setData(this.activeId, this.getLinkData(filteredLinks));
        this.positionForceLayout();
    }
    getLinkData(links) {
        let data = [];
        links.forEach((link) => {
            let properties = link.color + ":" + link.direction + ":" + link.thickness;
            let ld = new LinkData(link.id, link.idA, link.idB, link.relation, properties);
            data.push(ld);
        });
        return data;
    }
    positionForceLayout() {
        this.thtReps.forEach((thtRep) => {
            if (plexCanvas.hoveredThoughtId != thtRep.id) {
                let point = this.forceLayout.getNodePoint(thtRep.id);
                if (point) {
                    DomUtils.centerAt(thtRep.thtEl, point);
                    thtRep.thtEl.style.opacity = "1";
                    thtRep.thtEl.style.fontSize = "100%";
                }
            }
        });
    }
    tick(delta) {
        if (this.layout == LayoutType.Force) {
            this.forceLayout.tick(delta / 200);
            this.positionForceLayout();
        }
    }
    disappearOld(isScrollEvent = false) {
        this.currentLayout.disappearOld(isScrollEvent);
    }
    initThoughtReps() {
        this.thtRepsOld = this.thtRepsNew;
        this.thtRepsNew = new Map();
        let thtElements = Array.from(this.field.querySelectorAll(".tht.cur,.tht.off"));
        thtElements.forEach((thtEl) => {
            let thtRep = new ThoughtRep(thtEl);
            this.thtRepsNew.set(thtRep.id, thtRep);
            thtEl.style.display = "block";
            thtEl.style.opacity = "0";
            thtEl.style.pointerEvents = "";
        });
        this.thtReps.clear();
        for (const thtRep of this.thtRepsOld.values()) {
            this.thtReps.set(thtRep.id, thtRep);
        }
        for (const thtRep of this.thtRepsNew.values()) {
            const oldRep = this.thtRepsOld.get(thtRep.id);
            if (oldRep && !isNaN(oldRep.chevronAngle)) {
                thtRep.chevronAngle = oldRep.chevronAngle;
            }
            this.thtReps.set(thtRep.id, thtRep);
        }
        this.logInfo("initThoughtAndLinkReps -- thtRepsNew:", this.thtRepsNew.size, " thtRepsOld:", this.thtRepsOld.size, " thtReps:", this.thtReps.size);
    }
    requestExtraLinks() {
        if (!this.activeId) {
            return;
        }
        let thtElements = Array.from(this.field.querySelectorAll(".tht.cur"));
        let thtIds = [];
        thtElements.forEach((t) => {
            thtIds.push(t.id.substring(4, 40));
        });
        safeInvoke(this.dotNetHelper, "RequestExtraLinks", [this.activeId, thtIds.join(",")]);
    }
    showExtraLinks(rowHeightPixels, thtId, links, tagLists) {
        if (thtId != this.activeId) {
            return;
        }
        plexCanvas.animateBriefly();
        let linkIds = [];
        links.forEach((l) => {
            let linkRep = new LinkRep(l.id, l.idA, l.idB, l.relation, l.color, l.label, l.thickness, l.direction, l.meaning);
            this.linkRepsNew.set(linkRep.id, linkRep);
            this.linkReps.set(linkRep.id, linkRep);
            linkIds.push(l.id);
        });
        this.showTags(tagLists, rowHeightPixels);
        if (this.layout == LayoutType.Force) {
            let filteredLinks = links.filter((l) => this.thtReps.has(l.idA) && this.thtReps.has(l.idB));
            this.forceLayout.addData(this.getLinkData(filteredLinks));
        }
        if (linkIds.length > 0) {
            safeInvoke(this.dotNetHelper, "RequestLinkMetadata", [linkIds.join(",")]);
        }
    }
    showLinkMetadata(linkMetadataList) {
        if (linkMetadataList.length === 0) {
            return;
        }
        linkMetadataList.forEach((metadata) => {
            let linkRep = this.linkReps.get(metadata.linkId);
            if (linkRep) {
                linkRep.hasNotes = metadata.hasNotes;
                linkRep.attachmentCount = metadata.attachmentCount;
            }
        });
        plexCanvas.clearLinkColliders();
        plexCanvas.animateBriefly();
    }
    showTags(indicatorLists, rowHeightPixels) {
        indicatorLists.forEach((indicatorList) => {
            let thtRep = this.thtReps.get(indicatorList.thtId);
            if (thtRep) {
                let indicatorParent = thtRep.thtEl.querySelector(".indicator-icons");
                const compactGap = this.tagTextVisibilityMode === 'hover' || this.tagIconVisibilityMode === 'hover';
                indicatorParent.style.gap = compactGap ? '0px' : '1px';
                const opacity = parseFloat(getComputedStyle(thtRep.thtEl).opacity);
                let needToAnimate = opacity < 0.5;
                if (indicatorParent.children.length) {
                    needToAnimate = false;
                }
                indicatorParent.replaceChildren();
                indicatorParent.style.top = `calc(100% - ${rowHeightPixels * 0.2}px)`;
                if (thtRep.alignment === ThoughtHorizontalAlignment.Right) {
                    indicatorParent.style.right = `calc(0% + ${rowHeightPixels * 1.1}px)`;
                    indicatorParent.style.flexDirection = "row-reverse";
                }
                else if (thtRep.alignment === ThoughtHorizontalAlignment.Left) {
                    indicatorParent.style.left = `calc(0% + ${rowHeightPixels * 1.1}px)`;
                }
                else {
                    indicatorParent.style.left = `calc(50% + ${rowHeightPixels * 0.8}px)`;
                }
                indicatorList.indicators.forEach((indicator) => {
                    const isTagIndicator = indicator.indicatorId !== indicatorList.thtId;
                    const iconMode = isTagIndicator ? this.tagIconVisibilityMode : 'always';
                    const shouldCreateIcon = iconMode !== 'never';
                    const indicatorSizeFactor = this.tagScalePercent / 100;
                    const targetSizePx = 0.45 * rowHeightPixels * indicatorSizeFactor;
                    let iconElement = null;
                    if (shouldCreateIcon) {
                        iconElement = document.createElement("img");
                        iconElement.src = indicator.imageAddress;
                        iconElement.classList.add("indicator-icon");
                        iconElement.dataset["indicatorId"] = indicator.indicatorId;
                        iconElement.dataset["thoughtId"] = indicatorList.thtId;
                        if (indicator.indicatorType) {
                            iconElement.dataset["indicatorType"] = indicator.indicatorType;
                        }
                        try {
                            iconElement.style.setProperty("height", targetSizePx + "px", "important");
                            iconElement.style.setProperty("max-width", targetSizePx + "px", "important");
                            iconElement.style.setProperty("width", "auto", "important");
                        }
                        catch (_a) { }
                        if (isTagIndicator) {
                            iconElement.dataset["iconVisibility"] = iconMode;
                            if (iconMode === 'hover') {
                                iconElement.style.display = 'none';
                            }
                        }
                    }
                    let indicatorElement = null;
                    const shouldShowLabel = isTagIndicator && this.tagTextVisibilityMode !== 'icons';
                    if (shouldShowLabel) {
                        const indicatorEntry = document.createElement("span");
                        indicatorEntry.classList.add("indicator-with-label");
                        indicatorEntry.style.display = "inline-flex";
                        indicatorEntry.style.alignItems = "flex-start";
                        indicatorEntry.style.flexShrink = "0";
                        if (iconElement) {
                            indicatorEntry.appendChild(iconElement);
                        }
                        const indicatorLabel = document.createElement("span");
                        indicatorLabel.classList.add("indicator-label");
                        const displayText = indicator.label || indicator.name;
                        indicatorLabel.textContent = displayText;
                        indicatorLabel.style.maxWidth = this.TAG_LABEL_MAX_WIDTH;
                        indicatorLabel.style.whiteSpace = 'normal';
                        indicatorLabel.style.flexShrink = '0';
                        indicatorLabel.dataset["indicatorName"] = indicator.name;
                        indicatorLabel.dataset["originalText"] = displayText;
                        const thoughtControl = thtRep.thtEl.querySelector(".thought-control");
                        const defaultBgColor = thoughtControl ? window.getComputedStyle(thoughtControl).backgroundColor : '';
                        const defaultFgColor = thoughtControl ? window.getComputedStyle(thoughtControl).color : '';
                        const bgColor = indicator.backColorCss || defaultBgColor;
                        const fgColor = indicator.foreColorCss || defaultFgColor;
                        if (fgColor) {
                            indicatorEntry.dataset["foreColorCss"] = fgColor;
                        }
                        if (indicator.backColorCss) {
                            indicatorEntry.dataset["backColorCss"] = indicator.backColorCss;
                        }
                        else if (defaultBgColor) {
                            indicatorEntry.dataset["backColorCss"] = defaultBgColor;
                        }
                        indicatorEntry.dataset["indicatorName"] = indicator.name;
                        if (this.tagTextVisibilityMode === 'always') {
                            if (fgColor) {
                                indicatorEntry.style.color = fgColor;
                            }
                            if (bgColor) {
                                indicatorEntry.style.backgroundColor = bgColor;
                            }
                        }
                        const labelFontSizePx = Math.max(8, rowHeightPixels * (10 / 28) * indicatorSizeFactor);
                        try {
                            indicatorEntry.style.setProperty("font-size", labelFontSizePx + "px", "important");
                        }
                        catch (_b) { }
                        if (this.tagTextVisibilityMode === 'hover') {
                            indicatorLabel.style.display = 'none';
                            indicatorEntry.style.padding = '0';
                        }
                        indicatorEntry.appendChild(indicatorLabel);
                        indicatorElement = indicatorEntry;
                    }
                    else if (iconElement) {
                        indicatorElement = iconElement;
                    }
                    if (!indicatorElement) {
                        return;
                    }
                    indicatorParent.appendChild(indicatorElement);
                    if (needToAnimate && iconElement) {
                        iconElement.style.setProperty("height", "0px", "important");
                        let height = window.getComputedStyle(iconElement).height;
                        iconElement.style.transition = `height ${this.animationTime}s ease, transform ${this.ICON_ZOOM_ANIMATION_TIME}s ease`;
                        iconElement.style.setProperty("height", targetSizePx + "px", "important");
                    }
                });
            }
        });
    }
    setThoughtPosition(tht, point, fontSizePercent, isYAtTop = false, horizAlign = ThoughtHorizontalAlignment.Center) {
        tht.style.position = "absolute";
        let id = tht.id.substring(4, 40);
        let reusable = document.getElementById("measurer");
        let htmlClone = tht.cloneNode(true);
        syncThoughtFontStyling(tht, htmlClone);
        htmlClone.style.fontSize = fontSizePercent + "%";
        const hasInlineMaxWidth = tht.style.maxWidth !== "";
        if (!hasInlineMaxWidth) {
            reusable.style.width = this.field.offsetWidth + "px";
            reusable.style.minWidth = this.field.offsetWidth + "px";
        }
        reusable.appendChild(htmlClone);
        let w = htmlClone.offsetWidth;
        let h = htmlClone.offsetHeight;
        reusable.removeChild(htmlClone);
        if (!hasInlineMaxWidth) {
            reusable.style.width = "";
            reusable.style.minWidth = "";
        }
        let dx = -w / 2;
        if (horizAlign === ThoughtHorizontalAlignment.Right) {
            dx = -w;
        }
        else if (horizAlign === ThoughtHorizontalAlignment.Left) {
            dx = 0;
        }
        let x = (point.x + dx);
        let y = isYAtTop ? point.y : point.y - h / 2;
        tht.style.left = x + "px";
        tht.style.top = y + "px";
        this.thoughtIdSet.add(id);
        this.lastNormalLayoutThoughtPoints[id] = point;
    }
    getRowHeightWithSpacing() {
        const spacing = this.thoughtSpacing || 1.0;
        return this.rowHeight * spacing;
    }
    getInitialNodePointForForceLayout(id) {
        if (id in this.lastNormalLayoutThoughtPoints) {
            return this.lastNormalLayoutThoughtPoints[id];
        }
        return undefined;
    }
    getThoughtScreenCenter(id) {
        let rep = this.getAnyThoughtRepById(id);
        if (!rep)
            return null;
        let rect = rep.thtEl.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }
    getThoughtIconScreenCenter(id) {
        let rep = this.getAnyThoughtRepById(id);
        if (!rep)
            return null;
        let iconEl = rep.thtEl.querySelector(".tht-icon");
        if (iconEl) {
            let iconRect = iconEl.getBoundingClientRect();
            let thtRect = rep.thtEl.getBoundingClientRect();
            return { x: iconRect.left + iconRect.width / 2, y: thtRect.top + thtRect.height / 2 };
        }
        let rect = rep.thtEl.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }
    crossfadeWallpaper(newCssValue, durationMs) {
        if (!this.field) {
            return;
        }
        const myId = ++this._wallpaperCrossfadeId;
        if (this._wallpaperOverlay) {
            this._wallpaperOverlay.remove();
            this._wallpaperOverlay = null;
        }
        const computed = getComputedStyle(this.field);
        const overlay = document.createElement("div");
        overlay.style.position = "absolute";
        overlay.style.inset = "0";
        overlay.style.zIndex = "1";
        overlay.style.pointerEvents = "none";
        overlay.style.backgroundImage = computed.backgroundImage;
        overlay.style.backgroundSize = computed.backgroundSize;
        overlay.style.backgroundPositionX = computed.backgroundPositionX;
        overlay.style.backgroundPositionY = computed.backgroundPositionY;
        overlay.style.opacity = "1";
        overlay.style.transition = `opacity ${durationMs}ms ease-in-out`;
        this.field.prepend(overlay);
        this._wallpaperOverlay = overlay;
        const urlMatch = newCssValue.match(/url\(([^)]+)\)/);
        const imageUrl = urlMatch ? urlMatch[1].replace(/['"]/g, "") : null;
        const fadeOut = () => {
            if (myId !== this._wallpaperCrossfadeId) {
                return;
            }
            requestAnimationFrame(() => {
                overlay.style.opacity = "0";
            });
            overlay.addEventListener("transitionend", () => {
                if (this._wallpaperOverlay === overlay) {
                    this._wallpaperOverlay = null;
                }
                overlay.remove();
            }, { once: true });
            setTimeout(() => {
                if (overlay.parentNode) {
                    overlay.remove();
                    if (this._wallpaperOverlay === overlay) {
                        this._wallpaperOverlay = null;
                    }
                }
            }, durationMs + 200);
        };
        if (imageUrl) {
            const img = new Image();
            img.onload = () => { fadeOut(); };
            img.onerror = () => { fadeOut(); };
            img.src = imageUrl;
            setTimeout(() => {
                if (myId === this._wallpaperCrossfadeId && overlay.style.opacity === "1") {
                    fadeOut();
                }
            }, 5000);
        }
        else {
            setTimeout(() => { fadeOut(); }, 50);
        }
    }
}
PlexAnimator.PAN_EDGE_MARGIN = 100;
export const plexAnimator = new PlexAnimator();
//# sourceMappingURL=plexAnimator.js.map