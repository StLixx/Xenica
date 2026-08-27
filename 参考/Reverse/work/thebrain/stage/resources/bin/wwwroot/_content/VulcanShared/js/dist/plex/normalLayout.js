import { plexCanvas } from "./plexCanvas.js";
import { Scrollbar } from "./scrollbar.js";
import { Point, Rect } from "/_content/Venus/js/dist/geometry.js";
import { DomUtils } from "/_content/Venus/js/dist/domUtils.js";
import { safeInvoke } from "../interop.js";
import { BaseLayout, syncThoughtFontStyling } from "./baseLayout.js";
import { ThoughtHorizontalAlignment } from "./enums.js";
import { Relation } from "./core.js";
import { plexAnimator } from "./plexAnimator.js";
export class NormalLayout extends BaseLayout {
    getScaledZoneSpacing() {
        const fontScale = Math.max(plexAnimator.plexThoughtFontSize, 50) / 100;
        const spacingMult = plexAnimator.thoughtSpacing || 1.0;
        return this.ZONE_SPACING * fontScale * spacingMult;
    }
    constructor(connector, extraGeneration) {
        super(connector);
        this.MIN_COLUMN_WIDTH = 240;
        this.COL_GAP = 8;
        this.ZONE_SPACING = 16;
        this.extraGeneration = false;
        this.thoughtFinalLocMap = new Map();
        this.thoughtFinalLocMapPrevious = new Map();
        this.zoneToLineIndices = {
            "parent": [1, 0, 2, 1],
            "active": [1, 2, 2, 3],
            "sibling": [2, 0, 3, 4],
            "jump": [0, 0, 1, 4],
            "child": [0, 5, 3, 6],
        };
        this.disappearOldMapPrevious = null;
        this.disappearOldMap = null;
        this.extraGeneration = extraGeneration;
        this.removeZoneDivs();
    }
    getCurvePoints(linkRelation, rectA, gateA, genA, thtAlignA, rectB, gateB, genB, thtAlignB, isSecondaryLink) {
        let cx1 = gateA.x, cy1 = gateA.y, cx2 = gateB.x, cy2 = gateB.y;
        let x1 = gateA.x, y1 = gateA.y, x2 = gateB.x, y2 = gateB.y;
        let curveStrength = 0.7;
        let minControlDelta = this.connector.getRowHeightWithSpacing();
        let controlDelta = 0;
        switch (linkRelation) {
            case Relation.Unknown:
                break;
            case Relation.Child:
                controlDelta = Math.max(Math.floor(Math.abs(y1 - y2) * curveStrength + 0.5), minControlDelta);
                cy1 += controlDelta;
                cy2 -= controlDelta;
                if (isSecondaryLink && Math.abs(x1 - x2) < minControlDelta * 2) {
                    cx1 += minControlDelta * 2;
                    cx2 += minControlDelta * 2;
                }
                break;
            case Relation.Parent:
                controlDelta = Math.max(Math.floor(Math.abs(y1 - y2) * curveStrength + 0.5), minControlDelta);
                cy1 -= controlDelta;
                cy2 += controlDelta;
                if (isSecondaryLink && Math.abs(x1 - x2) < minControlDelta * 2) {
                    cx1 -= minControlDelta * 2;
                    cx2 -= minControlDelta * 2;
                }
                break;
            case Relation.Jump:
                controlDelta = Math.max(Math.floor(Math.abs(x1 - x2) * curveStrength + 0.5), minControlDelta);
                if (x1 > rectA.getCenter().x) {
                    cx1 += controlDelta;
                }
                else {
                    cx1 -= controlDelta;
                }
                if (x2 > rectB.getCenter().x) {
                    cx2 += controlDelta;
                }
                else {
                    cx2 -= controlDelta;
                }
                if (isSecondaryLink && Math.abs(y1 - y2) < minControlDelta * 2) {
                    cy1 -= minControlDelta;
                    cy2 -= minControlDelta;
                }
                break;
        }
        let points = [];
        points[0] = new Point(x1, y1);
        points[1] = new Point(cx1, cy1);
        points[2] = new Point(cx2, cy2);
        points[3] = new Point(x2, y2);
        return points;
    }
    moveCurToNewPositions(zone, isScrollEvent) {
        let dryLayout = false;
        this.thoughtFinalLocMap.clear();
        this.connector.lastActiveDestX = undefined;
        this.connector.lastActiveDestY = undefined;
        this.connector.markOffscreenAsCur(zone);
        this.connector.lastNormalLayoutThoughtPoints = {};
        if (zone === "all") {
            plexCanvas.gridPositionToThoughtId.clear();
        }
        else {
            const keysToDelete = [];
            plexCanvas.gridPositionToThoughtId.forEach((value, key) => {
                if (key.startsWith(zone + "-")) {
                    keysToDelete.push(key);
                }
            });
            keysToDelete.forEach(key => plexCanvas.gridPositionToThoughtId.delete(key));
        }
        if (zone === "all") {
            this.positionActiveThought();
        }
        if (zone === "all" || zone === "parent") {
            this.positionParentThoughts(isScrollEvent, dryLayout);
        }
        if (zone === "all" || zone === "child") {
            this.positionChildThoughts(isScrollEvent, dryLayout);
        }
        if (zone === "all" || zone === "jump") {
            this.positionJumpThoughts(isScrollEvent, dryLayout);
        }
        if (zone === "all" || zone === "sibling") {
            this.positionSiblingThoughts(isScrollEvent, dryLayout);
        }
        plexCanvas.setScrollbarsToDraw(Object.values(this.connector.zoneScrollbars));
        this.createOrUpdateZoneDivs(false);
    }
    positionActiveThought() {
        let tht = document.getElementById("tht-" + this.connector.activeId + "-cur");
        if (tht == null) {
            this.connector.logInfo("positionActiveThought did not find active thought.");
            return;
        }
        let fieldRect = this.connector.field.getBoundingClientRect();
        let activeZoneWidth = this.getZoneRect("active", fieldRect).width;
        let maxWidth = activeZoneWidth - this.COL_GAP * 2;
        tht.style.display = "block";
        tht.style.pointerEvents = "";
        tht.classList.remove("overflow-hidden-resize");
        tht.style.width = "";
        tht.style.maxWidth = "";
        tht.style.maxHeight = "";
        tht.style.overflow = "";
        tht.style.height = "";
        const textEl = tht.querySelector('.narrow-text-when-narrow');
        if (textEl) {
            textEl.style.display = '';
            textEl.style.overflow = '';
            textEl.style.removeProperty('-webkit-box-orient');
            textEl.style.removeProperty('-webkit-line-clamp');
        }
        const iconDivReset = tht.querySelector('.flex-shrink-0');
        if (iconDivReset) {
            iconDivReset.style.paddingTop = '';
            iconDivReset.style.alignSelf = '';
        }
        let m = this.measureThoughtWithMaxWidth(tht, 125, maxWidth);
        let singleLineHeight = this.connector.rowHeight;
        let isMultiline = m.h > singleLineHeight * 1.3;
        let w2 = Math.min(m.w, maxWidth);
        this.setupThoughtElementForMultilineLayout(tht, w2, -1, new Point(0, 0), 125, ThoughtHorizontalAlignment.Center);
        if (!isMultiline) {
            tht.style.width = "";
            tht.style.maxWidth = maxWidth + "px";
        }
        let halfHeightForPositioning = null;
        const h2 = m.h - 0.2 * this.connector.getRowHeightWithSpacing();
        let halfHeightForCentering = h2 / 2.0;
        if (isMultiline) {
            const hasChildren = this.connector.nodeChildrenIds && this.connector.nodeChildrenIds.size > 0;
            let maxH = singleLineHeight * 2.0;
            if (!hasChildren) {
                const fieldRect = this.connector.field.getBoundingClientRect();
                const cen = this.getActiveZoneCenter();
                const childZoneRect = this.getZoneRect("child", fieldRect);
                const bottomBoundary = childZoneRect.bottom() - this.getScaledZoneSpacing();
                const expandedMaxH = bottomBoundary - (cen.y - singleLineHeight);
                maxH = Math.max(singleLineHeight * 2.0, Math.min(m.h, expandedMaxH));
                if (m.h > singleLineHeight * 2.0) {
                    halfHeightForPositioning = singleLineHeight;
                }
            }
            let visibleH = m.h;
            if (m.h > maxH) {
                tht.style.overflow = "hidden";
                tht.style.maxHeight = maxH + "px";
                visibleH = maxH;
                if (textEl && m.lineHeight > 0) {
                    const clampLines = Math.max(1, Math.floor(maxH / m.lineHeight));
                    textEl.style.display = '-webkit-box';
                    textEl.style.setProperty('-webkit-box-orient', 'vertical');
                    textEl.style.setProperty('-webkit-line-clamp', String(clampLines));
                    textEl.style.overflow = 'hidden';
                    visibleH = Math.min(maxH, clampLines * m.lineHeight);
                }
            }
            const iconDiv = tht.querySelector('.flex-shrink-0');
            if (iconDiv) {
                const iconH = iconDiv.offsetHeight;
                const paddingTop = Math.max(0, (visibleH - iconH) / 2);
                iconDiv.style.alignSelf = "flex-start";
                iconDiv.style.paddingTop = paddingTop + "px";
            }
            if (m.h > maxH && visibleH > 0) {
                halfHeightForCentering = visibleH / 2.0;
            }
        }
        const activeCenter = this.getActiveZoneCenter();
        tht.style.top = (activeCenter.y - (halfHeightForPositioning !== null && halfHeightForPositioning !== void 0 ? halfHeightForPositioning : halfHeightForCentering)) + "px";
        const seconds = this.connector.animationTime;
        const isNewActivation = this.connector.activeId !== this.connector.lastActiveId;
        if (seconds > 0 && isNewActivation) {
            tht.style.transformOrigin = "center";
            tht.style.zIndex = "10";
            tht.style.animation = "activeThoughtBounce " + seconds + "s ease-in-out forwards";
            tht.addEventListener("animationend", () => {
                tht.style.animation = "";
                tht.style.zIndex = "5";
            }, { once: true });
        }
    }
    positionParentThoughts(isScrollEvent, dryLayout) {
        let thtElements = this.connector.getThoughtElements('.tht.cur', this.connector.nodeParentsIds);
        let maxColumnCount = thtElements.length === 1 ? 1 : 6;
        this.layoutThoughts(dryLayout, thtElements, isScrollEvent, "parent", "bottom", maxColumnCount, false, "top");
    }
    positionChildThoughts(isScrollEvent, dryLayout) {
        let thtElements = this.connector.getThoughtElements('.tht.cur', this.connector.nodeChildrenIds);
        let maxColumnCount = thtElements.length === 1 ? 1 : 8;
        this.layoutThoughts(dryLayout, thtElements, isScrollEvent, "child", "top", maxColumnCount, false, "bottom");
    }
    positionJumpThoughts(isScrollEvent, dryLayout) {
        let thtElements = this.connector.getThoughtElements('.tht.cur', this.connector.nodeJumpsIds);
        this.layoutThoughts(dryLayout, thtElements, isScrollEvent, "jump", "bottom", 1, true, "left");
    }
    positionSiblingThoughts(isScrollEvent, dryLayout) {
        let thtElements = this.connector.getThoughtElements('.tht.cur', this.connector.nodeSiblingsIds);
        this.layoutThoughts(dryLayout, thtElements, isScrollEvent, "sibling", "bottom", 1, true, "right");
    }
    getActiveZoneCenter() {
        let fieldRect = this.connector.field.getBoundingClientRect();
        let rect = this.getZoneRect("active", fieldRect);
        return rect.getCenter();
    }
    getDragZoneRect(zone, fieldRect) {
        let rect = this.getZoneRect(zone, fieldRect);
        if (zone === "parent") {
            rect = new Rect(rect.x, rect.y, rect.width, rect.height + plexAnimator.rowHeight * 0.5);
        }
        else if (zone === "jump" || zone === "siblings") {
            rect = new Rect(rect.x, rect.y, rect.width, rect.height + plexAnimator.rowHeight * 0.25);
        }
        else if (zone === "child") {
            rect = new Rect(rect.x, rect.y - plexAnimator.rowHeight * 0.5, rect.width, rect.height + plexAnimator.rowHeight * 0.25);
        }
        return rect;
    }
    getZoneRect(zone, fieldRect) {
        var _a, _b, _c;
        let w = fieldRect.width;
        let h = fieldRect.height;
        const plexContainer = document.getElementById("plexContainer");
        if (plexContainer) {
            const inlineStyle = plexContainer.style.height;
            if (inlineStyle) {
                if (inlineStyle.includes('dvh')) {
                    const dvhMatch = inlineStyle.match(/(\d+(?:\.\d+)?)dvh/);
                    if (dvhMatch) {
                        const dvhValue = parseFloat(dvhMatch[1]);
                        const targetHeight = (dvhValue / 100) * window.innerHeight;
                        h = targetHeight;
                    }
                }
                else if (inlineStyle.includes('calc')) {
                    const calcMatch = inlineStyle.match(/calc\((\d+(?:\.\d+)?)dvh\s*-\s*(\d+)px\)/);
                    if (calcMatch) {
                        const dvhValue = parseFloat(calcMatch[1]);
                        const pixelOffset = parseFloat(calcMatch[2]);
                        const targetHeight = (dvhValue / 100) * window.innerHeight - pixelOffset;
                        h = targetHeight;
                    }
                }
                else if (inlineStyle === '100%') {
                    const parentRect = (_a = plexContainer.parentElement) === null || _a === void 0 ? void 0 : _a.getBoundingClientRect();
                    if (parentRect) {
                        h = parentRect.height;
                    }
                }
            }
            const widthStyle = plexContainer.style.width;
            if (widthStyle && widthStyle.includes('%') && !widthStyle.includes('100%')) {
                const widthMatch = widthStyle.match(/(\d+(?:\.\d+)?)%/);
                if (widthMatch) {
                    const widthPercent = parseFloat(widthMatch[1]);
                    const parentRect = (_b = plexContainer.parentElement) === null || _b === void 0 ? void 0 : _b.getBoundingClientRect();
                    if (parentRect) {
                        const targetWidth = (widthPercent / 100) * parentRect.width;
                        w = targetWidth;
                    }
                }
            }
        }
        let topMargin = 0;
        let pinsElement = document.getElementsByClassName("pinned-thoughts-list-container")[0];
        if (pinsElement) {
            topMargin = pinsElement.clientHeight;
        }
        let bottomMargin = 0;
        let ptlElement = document.getElementsByClassName("past-thoughts-list-container")[0];
        if (ptlElement) {
            bottomMargin = ptlElement.clientHeight;
        }
        const actionBarEl = (_c = document.getElementById("bottom-toolbar-section")) === null || _c === void 0 ? void 0 : _c.parentElement;
        if (actionBarEl) {
            const actionBarTop = actionBarEl.getBoundingClientRect().top - fieldRect.top;
            const actionBarMargin = h - actionBarTop + 4;
            if (actionBarMargin > bottomMargin) {
                bottomMargin = actionBarMargin;
            }
        }
        let leftMargin = 0;
        if (this.connector.isSelectionPanelVisible()) {
            leftMargin = this.connector.getSelectionPanelWidth() * w;
        }
        const c = plexAnimator.normalCenterRatio;
        const zoneSpacing = this.getScaledZoneSpacing();
        let horizontalLines = [
            0.25 * zoneSpacing + topMargin,
            c * h - (this.extraGeneration ? 4.65 : 3.25)
                * zoneSpacing,
            c * h - (this.extraGeneration ? 1.65 : 1.75)
                * zoneSpacing,
            c * h - (this.extraGeneration ? -1.65 : -1.75)
                * zoneSpacing,
            c * h - (this.extraGeneration ? -4.95 : -3.25)
                * zoneSpacing,
            c * h - (this.extraGeneration ? -6.95 : -3.25)
                * zoneSpacing,
            1.00 * h - bottomMargin
        ];
        let availableWidth = w - leftMargin;
        let verticalLines = [
            leftMargin,
            leftMargin + 0.25 * availableWidth,
            leftMargin + 0.75 * availableWidth,
            leftMargin + availableWidth
        ];
        let indices = this.zoneToLineIndices[zone];
        let zr = new Rect(verticalLines[indices[0]], horizontalLines[indices[1]], verticalLines[indices[2]] - verticalLines[indices[0]], horizontalLines[indices[3]] - horizontalLines[indices[1]]);
        if (zone === "jump" || zone === "sibling") {
            const hasChildren = this.connector.nodeChildrenIds && this.connector.nodeChildrenIds.size > 0;
            if (!hasChildren) {
                const bottomOfPlex = horizontalLines[6];
                zr = new Rect(zr.x, zr.y, zr.width, bottomOfPlex - zr.y);
            }
        }
        if (zone === "child") {
            const hasChildren = this.connector.nodeChildrenIds && this.connector.nodeChildrenIds.size > 0;
            if (!hasChildren) {
                zr = new Rect(verticalLines[1], zr.y, verticalLines[2] - verticalLines[1], zr.height);
            }
        }
        const minHeight = this.connector.getRowHeightWithSpacing() * (this.extraGeneration ? 4.2 : 2.2);
        if (zone === "parent") {
            if (zr.height < minHeight) {
                zr = new Rect(zr.x, zr.bottom() - minHeight, zr.width, minHeight);
            }
        }
        else if (zone === "child") {
            if (zr.height < minHeight) {
                zr = new Rect(zr.x, zr.y, zr.width, minHeight);
            }
        }
        if (!this.extraGeneration) {
            const gap = this.getScaledZoneSpacing();
            if (zone === "child") {
                zr.y += gap;
                zr.height -= gap;
            }
            else if (zone === "parent") {
                zr.height -= gap;
            }
        }
        return zr;
    }
    createOrUpdateZoneDivs(drawZones) {
        let fieldElement = document.getElementById("field");
        if (!fieldElement) {
            return;
        }
        let fieldRect = fieldElement.getBoundingClientRect();
        let zones = ["active", "parent", "child", "sibling", "jump"];
        zones.forEach(zone => {
            let zoneId = `.zone-${zone}`;
            let zoneDiv = document.querySelector(zoneId);
            if (zoneDiv) {
                let zoneRect = this.getDragZoneRect(zone, fieldRect);
                if (zone === "active") {
                    const parentRect = this.getDragZoneRect("parent", fieldRect);
                    const childRect = this.getDragZoneRect("child", fieldRect);
                    const hasChildren = this.connector.nodeChildrenIds && this.connector.nodeChildrenIds.size > 0;
                    zoneRect.y = parentRect.bottom();
                    zoneRect.height = (hasChildren ? childRect.y : childRect.bottom()) - parentRect.bottom();
                }
                zoneDiv.style.left = zoneRect.x + "px";
                zoneDiv.style.top = zoneRect.y + "px";
                zoneDiv.style.width = zoneRect.width + "px";
                zoneDiv.style.height = zoneRect.height + "px";
            }
        });
    }
    removeZoneDivs() {
        let zones = ["active", "parent", "child", "sibling", "jump"];
        zones.forEach(zone => {
            let zoneDiv = document.getElementById(`zone-${zone}`);
            if (zoneDiv) {
                zoneDiv.remove();
            }
        });
    }
    showZoneDivs() {
        let zones = ["active", "parent", "child", "sibling", "jump"];
        zones.forEach(zone => {
            let zoneDiv = document.getElementById(`zone-${zone}`);
            if (zoneDiv) {
                zoneDiv.style.display = "block";
            }
        });
    }
    hideZoneDivs() {
        let zones = ["active", "parent", "child", "sibling", "jump"];
        zones.forEach(zone => {
            let zoneDiv = document.getElementById(`zone-${zone}`);
            if (zoneDiv) {
                zoneDiv.style.display = "none";
            }
        });
    }
    prepareDisappearOld(lastNode) {
        this.connector.logInfo("prepareDisappearOld");
        this.disappearOldMapPrevious = this.disappearOldMap;
        let parentMap = new Map();
        this.makeMap(lastNode, parentMap);
        this.disappearOldMap = parentMap;
        this.connector.logInfo("disOldMap size:", this.disappearOldMap.size);
    }
    disappearOld(isScrollEvent) {
        if (this.extraGeneration && this.disappearOldMap) {
            this.makeMap(this.connector.node, this.disappearOldMap);
        }
        let curEls = this.connector.field.querySelectorAll(".tht.cur");
        curEls.forEach((el) => {
            let str = el.id.substring(4, el.id.length - 4);
            this.connector.logInfo("disappearOld . curEls . el", el.id);
        });
        const seconds = this.connector.animationTime;
        const safeCenterAt = (el, pt) => {
            if (pt.x < 1 && pt.y < 1)
                return;
            DomUtils.positionAt(el, pt);
        };
        let oldEls = this.connector.field.querySelectorAll(".tht.old");
        oldEls.forEach((oldEl) => {
            var _a, _b;
            oldEl.style.opacity = "0";
            oldEl.style.fontSize = "0";
            oldEl.style.pointerEvents = "none";
            let thtIconEl = oldEl.querySelector(".tht-icon");
            if (thtIconEl) {
                thtIconEl.style.height = "100%";
                thtIconEl.style.transition = "height " + seconds + "s ease";
                thtIconEl.style.height = "0px";
            }
            oldEl.querySelectorAll(".indicator-icons img").forEach((el) => {
                let hel = el;
                try {
                    const h = window.getComputedStyle(hel).height;
                    hel.style.height = h;
                }
                catch (_a) {
                    hel.style.height = "100%";
                }
                hel.style.transition = "height " + seconds + "s ease";
                hel.style.height = "0px";
            });
            let str = oldEl.id.substring(4, oldEl.id.length - 4);
            let skip = false;
            if (this.connector.scrollDirStr != "") {
                this.connector.logInfo("SCROLL DIRECTION:", this.connector.scrollDirStr, "isScrollEvent:", isScrollEvent);
                if (this.connector.scrollDirStr === "up" || this.connector.scrollDirStr === "left") {
                    let ps = ((_a = oldEl.dataset.destBefore) === null || _a === void 0 ? void 0 : _a.split(",")) || ["-1337", "-1337"];
                    let x = ps[0] | 0;
                    let y = ps[1] | 0;
                    let pt = new Point(x, y);
                    safeCenterAt(oldEl, pt);
                    return;
                }
                else if (this.connector.scrollDirStr === "down" || this.connector.scrollDirStr === "right") {
                    let ps = ((_b = oldEl.dataset.destAfter) === null || _b === void 0 ? void 0 : _b.split(",")) || ["-1337", "-1337"];
                    let x = ps[0] | 0;
                    let y = ps[1] | 0;
                    let pt = new Point(x, y);
                    safeCenterAt(oldEl, pt);
                    return;
                }
            }
            let map = this.disappearOldMap;
            this.connector.logInfo("parentMap.size: " + (map ? map.size : "no map"));
            if (!skip && map && map.has(str)) {
                let id1 = map.get(str);
                this.connector.logInfo("id1: ", id1);
                let el1 = document.getElementById("tht-" + id1 + "-cur");
                if (id1 && this.thoughtFinalLocMap.has(id1)) {
                    this.connector.logInfo("> thoughtFinalLocMap " + str + " is following the new final location of " + id1);
                    let pt1 = this.thoughtFinalLocMap.get(id1);
                    safeCenterAt(oldEl, pt1);
                    return;
                }
                if (id1) {
                    let id11 = map.get(id1);
                    if (id11 && this.thoughtFinalLocMap.has(id11)) {
                        this.connector.logInfo("@ thoughtFinalLocMap " + str + " is following the new final location of " + id11);
                        let pt11 = this.thoughtFinalLocMap.get(id11);
                        safeCenterAt(oldEl, pt11);
                        return;
                    }
                    let el11 = document.getElementById("tht-" + id11 + "-cur");
                    if (el11) {
                        this.connector.logInfo(">> " + str + " is following the new location of " + id11);
                        let pt11 = DomUtils.getCenter(el11, this.connector.field);
                        safeCenterAt(oldEl, pt11);
                        return;
                    }
                }
                if (id1 && this.thoughtFinalLocMapPrevious.has(id1)) {
                    this.connector.logInfo("< thoughtFinalLocMapPrevious " + str + " is following the new final location of " + id1);
                    let pt1 = this.thoughtFinalLocMapPrevious.get(id1);
                    safeCenterAt(oldEl, pt1);
                    return;
                }
                if (el1 && id1) {
                    this.connector.logInfo("tFLMP:", this.thoughtFinalLocMapPrevious.size);
                    this.connector.logInfo(str + " is following the -cur- location of " + id1 + " and tFLMPrevious(id1) = " + this.thoughtFinalLocMapPrevious.has(id1));
                    let pt1 = DomUtils.getCenter(el1, this.connector.field);
                    safeCenterAt(oldEl, pt1);
                    return;
                }
                let el2 = document.getElementById("tht-" + id1 + "-old");
                if (el2) {
                    this.connector.logInfo(str + " is following the old location of " + id1);
                    let pt2 = DomUtils.getCenter(el2, this.connector.field);
                    safeCenterAt(oldEl, pt2);
                    return;
                }
            }
            if (this.connector.lastActiveDestX !== undefined && this.connector.lastActiveDestY !== undefined) {
                safeCenterAt(oldEl, new Point(this.connector.lastActiveDestX, this.connector.lastActiveDestY));
            }
            else {
                var center = this.getActiveZoneCenter();
                safeCenterAt(oldEl, center);
            }
        });
        if (isScrollEvent) {
            let thtElements = Array.from(this.connector.field.querySelectorAll(".tht.cur,.tht.off"));
            thtElements.forEach((thtEl) => {
                let str = thtEl.id.substring(4, thtEl.id.length - 4);
                if (this.connector.thoughtIdSet.has(str)) {
                    let isFaded = thtEl.classList.contains("related-thought");
                    thtEl.style.opacity = isFaded ? "0.5" : "1.0";
                    thtEl.style.pointerEvents = "";
                    return;
                }
                thtEl.style.opacity = "0";
                thtEl.style.fontSize = "0";
                thtEl.style.pointerEvents = "none";
                let map = this.disappearOldMap;
                let map2 = this.disappearOldMapPrevious;
                if (map && map.has(str)) {
                    let pt = map.get(str);
                    DomUtils.centerAt(thtEl, pt);
                    return;
                }
                if (map2 && map2.has(str)) {
                    let pt = map2.get(str);
                    DomUtils.centerAt(thtEl, pt);
                    return;
                }
            });
        }
        this.disappearOldMapPrevious = this.disappearOldMap;
    }
    makeMap(node, parentMap) {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        if (node == null) {
            return;
        }
        let rep = this.connector.thtReps.get(node.id);
        if (!rep) {
            return;
        }
        let pt = DomUtils.getCenter(rep.thtEl, this.connector.field);
        (_a = node.children) === null || _a === void 0 ? void 0 : _a.forEach((child) => {
            parentMap.set(child.id, node.id);
            this.makeMap(child, parentMap);
        });
        (_b = node.parents) === null || _b === void 0 ? void 0 : _b.forEach((parent) => {
            parentMap.set(parent.id, node.id);
            this.makeMap(parent, parentMap);
        });
        (_c = node.jumps) === null || _c === void 0 ? void 0 : _c.forEach((jump) => {
            parentMap.set(jump.id, node.id);
            this.makeMap(jump, parentMap);
        });
        (_d = node.siblings) === null || _d === void 0 ? void 0 : _d.forEach((sibling) => {
            parentMap.set(sibling.id, node.id);
            this.makeMap(sibling, parentMap);
        });
        (_e = node.children) === null || _e === void 0 ? void 0 : _e.forEach((child) => {
            let rep = this.connector.thtReps.get(child.id);
            if (!rep) {
                return;
            }
            let pt = DomUtils.getCenter(rep.thtEl, this.connector.field);
            if (!parentMap.has(node.id)) {
                parentMap.set(node.id, rep.thtEl.id);
            }
        });
        (_f = node.parents) === null || _f === void 0 ? void 0 : _f.forEach((parent) => {
            let rep = this.connector.thtReps.get(parent.id);
            if (!rep) {
                return;
            }
            let pt = DomUtils.getCenter(rep.thtEl, this.connector.field);
            if (!parentMap.has(node.id)) {
                parentMap.set(node.id, rep.thtEl.id);
            }
        });
        (_g = node.jumps) === null || _g === void 0 ? void 0 : _g.forEach((jump) => {
            let rep = this.connector.thtReps.get(jump.id);
            if (!rep) {
                return;
            }
            let pt = DomUtils.getCenter(rep.thtEl, this.connector.field);
            if (!parentMap.has(node.id)) {
                parentMap.set(node.id, rep.thtEl.id);
            }
        });
        (_h = node.siblings) === null || _h === void 0 ? void 0 : _h.forEach((sibling) => {
            let rep = this.connector.thtReps.get(sibling.id);
            if (!rep) {
                return;
            }
            let pt = DomUtils.getCenter(rep.thtEl, this.connector.field);
            if (!parentMap.has(node.id)) {
                parentMap.set(node.id, rep.thtEl.id);
            }
        });
    }
    replaceOldWithCur() {
        const seconds = this.connector.animationTime;
        let oldEls = this.connector.field.querySelectorAll(".tht.old");
        oldEls.forEach((oldEl_) => {
            let oldEl = oldEl_;
            if (oldEl.style.display === "none") {
                return;
            }
            let id = oldEl.id.substring(0, oldEl.id.length - 4);
            let newEl = document.getElementById(id + "-cur");
            if (newEl) {
                newEl.style.position = "absolute";
                let delta = 0;
                newEl.style.top = +oldEl.style.top.substring(0, oldEl.style.top.length - 2) + delta + "px";
                newEl.style.left = +oldEl.style.left.substring(0, oldEl.style.left.length - 2) + delta + "px";
                newEl.style.opacity = oldEl.style.opacity || "1";
                newEl.style.display = "block";
                oldEl.remove();
            }
        });
        let appearFromEl = document.getElementById("tht-" + this.connector.activeId + "-cur");
        let cen;
        if (!appearFromEl || appearFromEl.style.display === "none") {
            cen = this.getActiveZoneCenter();
        }
        else {
            cen = DomUtils.getCenter(appearFromEl, this.connector.field);
        }
        let curTreeMap = null;
        if (this.extraGeneration && this.connector.node) {
            curTreeMap = new Map();
            this.makeMap(this.connector.node, curTreeMap);
        }
        let srcBefore = null, srcAfter = null;
        let scrolledZone = this.connector.scrolledZone;
        if (scrolledZone != "") {
            let rect = this.getZoneRect(scrolledZone, this.connector.field.getBoundingClientRect());
            if (this.connector.scrollDirStr == "left" || this.connector.scrollDirStr == "right") {
                srcBefore = new Point(rect.x - rect.width * 0.25, rect.getCenter().y);
                srcAfter = new Point(rect.right() + rect.width * 0.25, rect.getCenter().y);
            }
            else {
                srcBefore = new Point(rect.getCenter().x, rect.y - rect.height * 0.25);
                srcAfter = new Point(rect.getCenter().x, rect.bottom() + rect.height * 0.25);
            }
        }
        let newEls = document.querySelectorAll(".tht.cur");
        let n = 0;
        newEls.forEach((newEl_) => {
            let newEl = newEl_;
            if (newEl.style.display === "none") {
                let pt = cen;
                let str = newEl.id.substring(4, newEl.id.length - 4);
                let map = this.disappearOldMap;
                if (map && map.has(str)) {
                    let id1 = map.get(str);
                    let el1 = document.getElementById("tht-" + id1 + "-cur");
                    if (el1) {
                        this.connector.logInfo("> appear from location for " + str + " is the same as the new location of " + id1);
                        pt = DomUtils.getCenter(el1, this.connector.field);
                    }
                }
                else if (curTreeMap && curTreeMap.has(str)) {
                    let id1 = curTreeMap.get(str);
                    let el1 = document.getElementById("tht-" + id1 + "-cur");
                    if (el1) {
                        this.connector.logInfo(">>> appear from location for " + str + " is current-tree source " + id1);
                        pt = DomUtils.getCenter(el1, this.connector.field);
                    }
                }
                else {
                    let map2 = this.disappearOldMapPrevious;
                    if (map2 && map2.has(str)) {
                        let id1 = map2.get(str);
                        let el1 = document.getElementById("tht-" + id1 + "-cur");
                        if (el1) {
                            this.connector.logInfo(">> appear from location for " + str + " is the same as the new location of " + id1);
                            pt = DomUtils.getCenter(el1, this.connector.field);
                        }
                    }
                }
                if (pt.X === cen.X && pt.Y == cen.Y) {
                    this.connector.logInfo("appear from location for " + str + " is just the center / active thought");
                }
                if (this.connector.scrollDirStr != "") {
                    this.connector.logInfo("Want to appear from / SCROLL DIRECTION:", this.connector.scrollDirStr, "before:");
                    if (this.connector.scrollDirStr === "up" || this.connector.scrollDirStr === "left") {
                        pt = srcAfter;
                    }
                    else if (this.connector.scrollDirStr === "down" || this.connector.scrollDirStr === "right") {
                        pt = srcBefore;
                    }
                }
                newEl.style.display = "block";
                newEl.style.opacity = "0";
                newEl.style.pointerEvents = "none";
                let thtIconEl = newEl.querySelector(".tht-icon");
                if (thtIconEl) {
                    thtIconEl.style.height = "0";
                    let height = window.getComputedStyle(thtIconEl).height;
                    thtIconEl.style.transition = "height " + seconds + "s ease";
                    thtIconEl.style.height = this.connector.rowHeight * 0.7 + "px";
                }
                DomUtils.centerAt(newEl, pt);
                this.connector.logInfo("thought " + str + " is appearing from point " + pt.x + ", " + pt.y);
                n++;
            }
        });
    }
    hideRelatedThoughts(thtId) {
        let jumps = this.connector.nodeJumpsOf.get(thtId);
        jumps = jumps ? jumps : [];
        let parents = this.connector.nodeParentsOf.get(thtId);
        parents = parents ? parents : [];
        let children = this.connector.nodeChildrenOf.get(thtId);
        children = children ? children : [];
        let allRelated = jumps.concat(parents).concat(children);
        allRelated.forEach((id) => {
            let tht = document.getElementById("tht-" + id + "-cur");
            tht.style.display = "none";
        });
    }
    maybeLayoutRelatedThoughts(thtId, pt, maxWid, zone) {
        let fieldRect = this.connector.field.getBoundingClientRect();
        let rect = this.getZoneRect(zone, fieldRect);
        let isHorizontal = zone == "child" || zone == "parent";
        let destBefore;
        let destAfter;
        if (isHorizontal) {
            destBefore = new Point(rect.x - rect.width * 0.25, rect.getCenter().y);
            destAfter = new Point(rect.right() + rect.width * 0.25, rect.getCenter().y);
        }
        else {
            destBefore = new Point(rect.getCenter().x, rect.y - rect.height * 0.25);
            destAfter = new Point(rect.getCenter().x, rect.bottom() + rect.height * 0.25);
        }
        let jumps = this.connector.nodeJumpsOf.get(thtId);
        jumps = jumps ? jumps.slice(0, 2) : [];
        let parents = this.connector.nodeParentsOf.get(thtId);
        parents = parents ? parents.slice(0, 4 - jumps.length) : [];
        parents = jumps.concat(parents);
        let i = 0.0;
        let cols = Math.min(parents.length, 4);
        if (cols < 1) {
            cols = 1;
        }
        let w = maxWid / cols;
        let dy = this.connector.rowHeight;
        let ddx = (maxWid - (parents.length * w)) / 2.0;
        parents.forEach((thtId) => {
            let tht = document.getElementById("tht-" + thtId + "-cur");
            if (!this.connector.thtReps.has(thtId)) {
                this.connector.logInfo("no thtRep for " + thtId);
            }
            if (!tht) {
                this.connector.logInfo("*** missed tht: " + thtId);
                return;
            }
            tht.classList.add("related-thought");
            tht.classList.remove("multiline-wrap");
            tht.style.fontSize = "60%";
            tht.style.width = "";
            tht.style.maxWidth = w + "px";
            let dx = -maxWid / 2.0 + w * i + w / 2.0;
            let pt2 = new Point(pt.x + dx + ddx, pt.y - 0.59 * this.connector.rowHeight);
            this.connector.setThoughtPosition(tht, pt2, 50, true, ThoughtHorizontalAlignment.Center);
            tht.dataset.destBefore = destBefore.x + "," + destBefore.y;
            tht.dataset.destAfter = destAfter.x + "," + destAfter.y;
            this.thoughtFinalLocMap.set(thtId, pt2);
            tht.style.opacity = "0.5";
            tht.style.display = "block";
            tht.style.pointerEvents = "";
            tht.classList.remove("overflow-hidden-resize");
            i++;
        });
        let children = this.connector.nodeChildrenOf.get(thtId);
        children = children ? children : [];
        i = 0;
        cols = Math.min(children.length, 4);
        let rows = Math.ceil(children.length / cols);
        if (children.length == 4) {
            cols = 2;
            rows = 2;
        }
        else if (children.length == 5 || children.length == 6) {
            cols = 3;
            rows = 2;
        }
        w = maxWid / cols;
        let row = 0;
        let col = 0;
        children.forEach((thtId) => {
            let tht = document.getElementById("tht-" + thtId + "-cur");
            if (!this.connector.thtReps.has(thtId)) {
                this.connector.logInfo("no thtRep for " + thtId);
            }
            if (!tht) {
                this.connector.logInfo("*** missed tht: " + thtId);
                return;
            }
            tht.classList.add("related-thought");
            tht.classList.remove("multiline-wrap");
            tht.style.fontSize = "60%";
            tht.style.width = "";
            tht.style.maxWidth = w + "px";
            let dx = -maxWid / 2.0 + w * col + w / 2.0;
            let pt2 = new Point(pt.x + dx, pt.y + 0.54 * this.connector.rowHeight * (row + 2) - 0.25 * this.connector.rowHeight);
            this.connector.setThoughtPosition(tht, pt2, 50, true, ThoughtHorizontalAlignment.Center);
            tht.dataset.destBefore = destBefore.x + "," + destBefore.y;
            tht.dataset.destAfter = destAfter.x + "," + destAfter.y;
            this.thoughtFinalLocMap.set(thtId, pt2);
            tht.style.opacity = "0.5";
            tht.style.display = "block";
            tht.style.pointerEvents = "";
            tht.classList.remove("overflow-hidden-resize");
            i++;
            row++;
            if (row >= rows) {
                row = 0;
                col++;
            }
        });
    }
    layoutThoughts(dryLayout, thtElements, isScrollEvent, zone, align, maxColumnCount, centerOnActive, scrollSide) {
        if (thtElements.length === 0) {
            let one = this.connector.getOneZoneRangeForZone(zone);
            if (one.count > 0 && one.end === 0) {
                let yMultiplier = this.extraGeneration ? 2.75 : 1.0;
                let yHeight = this.connector.rowHeight * yMultiplier * (plexAnimator.thoughtSpacing || 1.0);
                if (yHeight > 0) {
                    let fieldRect = this.connector.field.getBoundingClientRect();
                    let rect = this.getZoneRect(zone, fieldRect);
                    let maxRowCount = Math.max(Math.floor(rect.height / yHeight), 1);
                    const minColWidth = plexAnimator.minColumnWidth || this.MIN_COLUMN_WIDTH;
                    let columnCount = maxColumnCount > 2
                        ? Math.min(maxColumnCount, Math.max(Math.floor(rect.width / minColWidth) & ~1, 2))
                        : maxColumnCount;
                    let fullGrid = maxRowCount * columnCount;
                    this.connector.setZoneRangeForZone(zone, 0, fullGrid);
                }
            }
            return;
        }
        let yMultiplier = this.extraGeneration ? 2.75 : 1.0;
        let yHeight = this.connector.rowHeight * yMultiplier * (plexAnimator.thoughtSpacing || 1.0);
        let fieldRect = this.connector.field.getBoundingClientRect();
        let rect = this.getZoneRect(zone, fieldRect);
        let columnCount = maxColumnCount;
        if (columnCount > 2) {
            const minColWidth = plexAnimator.minColumnWidth || this.MIN_COLUMN_WIDTH;
            let maxNormalSizeColumns = Math.floor(rect.width / minColWidth);
            if (maxNormalSizeColumns % 2 === 1) {
                maxNormalSizeColumns--;
            }
            if (maxNormalSizeColumns % 2 === 1) {
                maxNormalSizeColumns--;
            }
            maxNormalSizeColumns = Math.max(maxNormalSizeColumns, 2);
            columnCount = Math.min(columnCount, maxNormalSizeColumns);
        }
        let maxRowCount = Math.floor(rect.height / yHeight);
        let one = this.connector.getOneZoneRangeForZone(zone);
        let max = one.count || thtElements.length;
        if (max < thtElements.length) {
            let msg = "layoutThoughts: zone: " + zone + " one.count: " + one.count + " < thtElements.length: " + thtElements.length + " — corrected max to " + thtElements.length;
            console.warn("[PLEX-FIX] " + msg);
            safeInvoke(this.connector.dotNetHelper, "LogPlexDiagnostic", [msg]);
            max = thtElements.length;
            this.connector.setCountForZone(zone, max);
            one = this.connector.getOneZoneRangeForZone(zone);
        }
        let needsScrollbar = maxRowCount * columnCount < max;
        if (thtElements.length < max && !needsScrollbar && one.end >= one.count && one.start == 0) {
            console.warn("[PLEX-BUG] layoutThoughts: zone:", zone, "has fewer DOM elements than expected:", thtElements.length, "vs max:", max, "one:", one.toString(), "rect.height:", Math.round(rect.height), "maxRowCount:", maxRowCount, "columnCount:", columnCount);
        }
        this.connector.logInfo("ZONE: " + zone + ", maxRowCount: " + maxRowCount + ", columnCount: " + columnCount + ", max: " + max + ", needsScrollbar: " + needsScrollbar);
        if (needsScrollbar) {
            let scrollRect;
            let totalUnits;
            let displayedUnits;
            if (columnCount > 1) {
                maxRowCount = Math.floor((rect.height - NormalLayout.SCROLLBAR_SIZE) / yHeight);
                let height = maxRowCount * yHeight;
                if (scrollSide === "top") {
                    rect.y = rect.bottom() - height;
                    rect.height = height;
                    scrollRect = new Rect(rect.x, rect.y - 2.0 * NormalLayout.SCROLLBAR_SIZE, rect.width, NormalLayout.SCROLLBAR_SIZE);
                }
                else {
                    rect.height = height;
                    scrollRect = new Rect(rect.x, rect.bottom(), rect.width, NormalLayout.SCROLLBAR_SIZE);
                }
                totalUnits = Math.ceil(max / maxRowCount);
                displayedUnits = columnCount;
            }
            else {
                let height = maxRowCount * yHeight;
                rect.y = rect.bottom() - height;
                rect.height = height;
                rect.width -= NormalLayout.SCROLLBAR_SIZE;
                if (scrollSide === "left") {
                    scrollRect = new Rect(rect.x, rect.y, NormalLayout.SCROLLBAR_SIZE, rect.height);
                    rect.x += NormalLayout.SCROLLBAR_SIZE;
                }
                else {
                    scrollRect = new Rect(rect.right(), rect.y, NormalLayout.SCROLLBAR_SIZE, rect.height);
                }
                totalUnits = max;
                displayedUnits = maxRowCount;
            }
            let scrollbar = this.connector.zoneScrollbars[zone];
            let zoneRect = this.getZoneRect(zone, fieldRect);
            if (scrollbar == null) {
                this.connector.logInfo("creating new scrollbar for zone: " + zone + " -- setting startAt to 0");
                let s = 0;
                if (one.start) {
                    s = (one.start / maxRowCount) | 0;
                    if (s < 0) {
                        s = 0;
                    }
                    if (s > totalUnits - displayedUnits) {
                        s = totalUnits - displayedUnits;
                    }
                }
                this.connector.zoneScrollbars[zone] = new Scrollbar(this.connector.field, zone, zoneRect, scrollRect, totalUnits, displayedUnits, s);
            }
            else {
                scrollbar.update(scrollRect, totalUnits, displayedUnits);
            }
        }
        else {
            this.connector.logInfo("no scrollbar needed for zone: " + zone + " -- setting scrollbar to null");
            this.connector.zoneScrollbars[zone] = null;
        }
        if (columnCount > 2) {
            let columnCountNeededToFitAll = Math.ceil(max / maxRowCount);
            if (columnCountNeededToFitAll % 2 === 1) {
                columnCountNeededToFitAll++;
            }
            columnCount = Math.min(columnCount, columnCountNeededToFitAll);
        }
        let neededRows = Math.ceil(max / columnCount);
        let rowCount = Math.min(maxRowCount, neededRows);
        this.connector.normalLayoutZoneToRows.set(zone, rowCount);
        this.connector.normalLayoutZoneToColumns.set(zone, columnCount);
        let top;
        if (align === "bottom") {
            let tht = thtElements[0];
            let reusable = document.getElementById("measurer");
            if (reusable == null) {
                return;
            }
            let htmlClone = tht.cloneNode(true);
            syncThoughtFontStyling(tht, htmlClone);
            reusable.appendChild(htmlClone);
            htmlClone.style.fontSize = "100%";
            let h = htmlClone.offsetHeight;
            reusable.removeChild(htmlClone);
            let thtClientHeight = h;
            let elementHeight = thtClientHeight * yMultiplier;
            let extraSpace = yHeight - elementHeight;
            let totalHeight = yHeight * rowCount - extraSpace;
            if (zone == "parent") {
                this.connector.logInfo("totalHeight: " + totalHeight + ", extraSpace: " + extraSpace + ", elementHeight: " + elementHeight);
            }
            top = rect.bottom() - totalHeight;
            if (centerOnActive) {
                let center = this.getActiveZoneCenter().y;
                if (center + totalHeight / 2 <= rect.bottom()) {
                    top = center - totalHeight / 2;
                }
                if (top < rect.y) {
                    top = rect.y;
                }
                if (this.extraGeneration && rowCount == 2) {
                    top += yHeight * 0.23;
                }
                if (this.extraGeneration && rowCount == 1) {
                    top += yHeight * 0.26;
                }
            }
        }
        else {
            top = rect.y;
        }
        let colWidth = rect.width / columnCount;
        let fullGrid = rowCount * columnCount;
        let startAt = 0;
        this.connector.logInfo("layoutThoughts ==> zone: " + zone + ", columnCount: " + columnCount + ", rowCount: " + rowCount + ", startAt: " + startAt + ", max: " + max);
        let delta = 1;
        if (columnCount > 1) {
            delta = rowCount;
        }
        let s = startAt * delta;
        let e = startAt * delta + fullGrid;
        this.connector.logInfo("layoutThoughts ==> _set JS cached __ zone: " + zone + ", s: " + s + ", e: " + e + ", max: " + max);
        if (one.end == 0 || (!needsScrollbar && (one.start > 0 || one.end < max))) {
            this.connector.logInfo(":-( setting range for zone: " + zone + " to s: " + s + ", e: " + e + " (was start=" + one.start + " end=" + one.end + " needsScrollbar=" + needsScrollbar + " max=" + max + ")");
            this.connector.setZoneRangeForZone(zone, s, e);
        }
        let hasScrollbar = this.connector.zoneScrollbars[zone] ? true : false;
        this.connector.logInfo(":-) double FOR loop for zone: " + zone + ", thtElements.length: " + thtElements.length + ", columnCount: " + columnCount + ", rowCount: " + rowCount + ", startAt: " + startAt + ", max: " + max);
        let displayedCount = 0;
        for (let column = 0; column < columnCount; column++) {
            let colX = rect.x + colWidth * column;
            for (let row = 0; row < rowCount; row++) {
                if (displayedCount >= max) {
                    this.connector.logInfo(":-) displayedCount >= max, breaking out of loop for zone: " + zone, "displayedCount: " + displayedCount + ", max: " + max);
                    break;
                }
                let tht = thtElements[displayedCount];
                if (!tht) {
                    break;
                }
                let id = tht.id.substring(4, 40);
                tht.dataset.gridZone = zone;
                tht.dataset.gridColumn = column.toString();
                tht.dataset.gridRow = row.toString();
                const gridKey = `${zone}-${column}-${row}`;
                plexCanvas.gridPositionToThoughtId.set(gridKey, id);
                tht.style.display = "block";
                tht.style.opacity = "1";
                tht.style.fontSize = "100%";
                tht.style.pointerEvents = "";
                tht.style.width = "";
                tht.style.overflow = "";
                tht.classList.remove("related-thought", "overflow-hidden-resize", "multiline-wrap");
                let maxWid = colWidth - this.COL_GAP * 2;
                tht.style.maxWidth = maxWid + "px";
                let pt = new Point(colX + colWidth / 2, top + row * yHeight);
                this.thoughtFinalLocMap.set(id, pt);
                this.connector.logInfo("setting thought position for " + id + " to " + pt.x + ", " + pt.y);
                this.connector.setThoughtPosition(tht, pt, 100, true, ThoughtHorizontalAlignment.Center);
                let isHorizontal = zone == "child" || zone == "parent";
                let destBefore;
                let destAfter;
                if (isHorizontal) {
                    destBefore = new Point(rect.x - rect.width * 0.25, rect.getCenter().y);
                    destAfter = new Point(rect.right() + rect.width * 0.25, rect.getCenter().y);
                }
                else {
                    destBefore = new Point(rect.getCenter().x, rect.y - rect.height * 0.25);
                    destAfter = new Point(rect.getCenter().x, rect.bottom() + rect.height * 0.25);
                }
                tht.dataset.destBefore = destBefore.x + "," + destBefore.y;
                tht.dataset.destAfter = destAfter.x + "," + destAfter.y;
                if (tht.id === "tht-" + this.connector.lastActiveId + "-cur") {
                    this.connector.lastActiveDestX = pt.x;
                    this.connector.lastActiveDestY = pt.y;
                }
                displayedCount++;
                tht.classList.remove("before-scroll", "after-scroll");
                if (hasScrollbar && columnCount > 1) {
                    tht.classList.add("horiz-scroll");
                }
                else if (hasScrollbar && columnCount == 1) {
                    tht.classList.add("vert-scroll");
                }
                this.maybeLayoutRelatedThoughts(id, pt, maxWid, zone);
            }
        }
        if (displayedCount < thtElements.length && !hasScrollbar) {
            console.warn("[PLEX-BUG] layoutThoughts hiding thoughts when no scrollbar: zone:", zone, "displayed:", displayedCount, "total elements:", thtElements.length, "max:", max, "rowCount:", rowCount, "columnCount:", columnCount, "maxRowCount:", maxRowCount);
        }
        for (let i = displayedCount; i < thtElements.length; i++) {
            let tht = thtElements[i];
            if (tht) {
                tht.style.display = "none";
                tht.style.opacity = "0";
            }
        }
    }
}
NormalLayout.SCROLLBAR_SIZE = 18;
//# sourceMappingURL=normalLayout.js.map