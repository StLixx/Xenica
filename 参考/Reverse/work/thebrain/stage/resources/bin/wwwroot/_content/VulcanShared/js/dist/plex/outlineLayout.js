import { Point, Rect } from "/_content/Venus/js/dist/geometry.js";
import { DomUtils } from "/_content/Venus/js/dist/domUtils.js";
import { ThoughtExpandDirection, ThoughtHorizontalAlignment } from "./enums.js";
import { BaseLayout } from "./baseLayout.js";
import { plexAnimator } from "./plexAnimator.js";
import { Relation } from "./core.js";
import { plexCanvas } from "./plexCanvas.js";
export class OutlineLayout extends BaseLayout {
    constructor(connector) {
        super(connector);
        this.disappearOldMap = null;
    }
    xor(a, b) {
        return (a || b) && !(a && b);
    }
    getCurvePoints(linkRelation, rectA, gateA, genA, thtAlignA, rectB, gateB, genB, thtAlignB, isSecondaryLink) {
        let cx1 = gateA.x, cy1 = gateA.y, cx2 = gateB.x, cy2 = gateB.y;
        let x1 = gateA.x, y1 = gateA.y, x2 = gateB.x, y2 = gateB.y;
        let curveStrength = 0.7;
        let minControlDelta = rectA.height;
        let isAParentOfB = this.xor(linkRelation === Relation.Parent, genA > genB);
        let xSign = Math.sign(x2 - x1);
        let ySign = Math.sign(y2 - y1);
        let controlDeltaX = Math.max(Math.floor(Math.abs(x1 - x2) * curveStrength + 0.5), minControlDelta);
        let controlDeltaY = Math.max(Math.floor(Math.abs(y1 - y2) * curveStrength + 0.5), minControlDelta);
        if (!isSecondaryLink) {
            if (isAParentOfB) {
                if (genA < genB) {
                    cy1 -= ySign * controlDeltaY;
                    cx2 -= xSign * controlDeltaX;
                }
                else {
                    cx1 += xSign * controlDeltaX;
                    cy2 -= ySign * controlDeltaY;
                }
            }
            else {
                if (genA < genB) {
                    cy1 += ySign * controlDeltaY;
                    cx2 -= xSign * controlDeltaX;
                }
                else {
                    cx1 += xSign * controlDeltaX;
                    cy2 += ySign * controlDeltaY;
                }
            }
        }
        if (isSecondaryLink && Math.abs(x1 - x2) < minControlDelta * 2) {
            if (x1 < 0) {
                cx1 += minControlDelta * 3;
                cx2 += minControlDelta * 3;
            }
            else {
                cx1 -= minControlDelta * 3;
                cx2 -= minControlDelta * 3;
            }
        }
        else if (isSecondaryLink) {
            cx1 += xSign * controlDeltaX;
            cx2 -= xSign * controlDeltaX;
        }
        let points = [];
        points[0] = new Point(x1, y1);
        points[1] = new Point(cx1, cy1);
        points[2] = new Point(cx2, cy2);
        points[3] = new Point(x2, y2);
        return points;
    }
    moveCurToNewPositions(zoneIgnored, isScrollEvent, lastBackgroundDragX, lastBackgroundDragY) {
        if (this.connector.node == null) {
            console.log("ERROR: this.node is null");
            return;
        }
        let point = new Point(lastBackgroundDragX, lastBackgroundDragY);
        plexCanvas.gridPositionToThoughtId.clear();
        plexCanvas.outlineGroupOf.clear();
        let rep = this.connector.thtReps.get(this.connector.node.id);
        if (!rep) {
            console.log("ERROR: Could not find element with id: " + this.connector.node.id);
            return;
        }
        let el = rep.thtEl;
        this.setThoughtPosition_Center(el, point, 125, false, ThoughtHorizontalAlignment.Center);
        el.style.opacity = "1.0";
        el.style.fontSize = "125%";
        const spacing = plexAnimator.thoughtSpacing || 1.0;
        this.layoutDownRight(1, this.connector.node, new Point(point.x + this.getColWidth(), point.y + this.connector.rowHeight * spacing));
        this.layoutUpLeft(1, this.connector.node, new Point(point.x - this.getColWidth(), point.y - this.connector.rowHeight * 1.5 * spacing));
        this.layoutDownLeft(1, this.connector.node, new Point(point.x - this.getColWidth(), point.y + this.connector.rowHeight * spacing));
        this.createOrUpdateZoneDivs();
    }
    createOrUpdateZoneDivs() {
        let fieldElement = document.getElementById("field");
        if (!fieldElement) {
            return;
        }
        let fieldRect = fieldElement.getBoundingClientRect();
        const hiddenZones = ["parent", "jump", "sibling", "active"];
        const fullZone = "child";
        let childZoneDiv = document.querySelector(`.zone-${fullZone}`);
        if (childZoneDiv) {
            childZoneDiv.style.left = "0px";
            childZoneDiv.style.top = "0px";
            childZoneDiv.style.width = fieldRect.width + "px";
            childZoneDiv.style.height = fieldRect.height + "px";
        }
        hiddenZones.forEach(zone => {
            let zoneDiv = document.querySelector(`.zone-${zone}`);
            if (zoneDiv) {
                zoneDiv.style.left = "0px";
                zoneDiv.style.top = "0px";
                zoneDiv.style.width = "0px";
                zoneDiv.style.height = "0px";
            }
        });
    }
    disappearOld(ignoredIsScrollEvent) {
        let oldEls = this.connector.field.querySelectorAll(".tht.old");
        let seconds = this.connector.animationTime;
        oldEls.forEach((oldEl) => {
            oldEl.style.opacity = "0";
            oldEl.style.fontSize = "0";
            let thtIconEl = oldEl.querySelector(".tht-icon");
            if (thtIconEl) {
                let seconds = this.connector.animationTime;
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
            let map = this.disappearOldMap;
            if (map && map.has(str)) {
                let pt = map.get(str);
                DomUtils.centerAt(oldEl, pt);
            }
        });
    }
    prepareDisappearOld(lastNode) {
        let parentMap = new Map();
        this.makeMap(lastNode, parentMap);
        this.disappearOldMap = parentMap;
    }
    makeMap(node, parentMap) {
        var _a, _b;
        if (node == null) {
            return;
        }
        let rep = this.connector.thtReps.get(node.id);
        if (!rep) {
            return;
        }
        let pt = DomUtils.getCenter(rep.thtEl, this.connector.field);
        (_a = node.children) === null || _a === void 0 ? void 0 : _a.forEach((child) => {
            parentMap.set(child.id, pt);
            this.makeMap(child, parentMap);
        });
        (_b = node.parents) === null || _b === void 0 ? void 0 : _b.forEach((parent) => {
            parentMap.set(parent.id, pt);
            this.makeMap(parent, parentMap);
        });
    }
    replaceOldWithCur() {
        let generationMap = new Map();
        this.makeMap(this.connector.node, generationMap);
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
                newEl.style.top = oldEl.style.top;
                newEl.style.left = oldEl.style.left;
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
        let newEls = document.querySelectorAll(".tht.cur");
        let n = 0;
        let seconds = this.connector.animationTime;
        newEls.forEach((newEl_) => {
            let newEl = newEl_;
            if (newEl.style.display === "none") {
                let pt = cen;
                let str = newEl.id.substring(4, newEl.id.length - 4);
                if (generationMap.has(str)) {
                    pt = generationMap.get(str);
                }
                newEl.style.display = "block";
                newEl.style.opacity = "0";
                let thtIconEl = newEl.querySelector(".tht-icon");
                if (thtIconEl) {
                    thtIconEl.style.height = "0";
                    let height = window.getComputedStyle(thtIconEl).height;
                    thtIconEl.style.transition = "height " + seconds + "s ease";
                    thtIconEl.style.height = this.connector.rowHeight * 0.7 + "px";
                }
                DomUtils.centerAt(newEl, pt);
                n++;
            }
        });
    }
    onWheel(event) {
        let deltaPoint = new Point(-event.deltaX, -event.deltaY);
        this.connector.backgroundDragged(deltaPoint, true);
    }
    getActiveZoneCenter() {
        let fieldRect = this.connector.field.getBoundingClientRect();
        let leftMargin = 0;
        if (this.connector.isSelectionPanelVisible()) {
            leftMargin = this.connector.getSelectionPanelWidth() * fieldRect.width;
        }
        let availableWidth = fieldRect.width - leftMargin;
        return new Point(leftMargin + availableWidth * 0.5, fieldRect.height * 0.4);
    }
    getActiveThoughtPosition() {
        let tht = document.getElementById("tht-" + this.connector.activeId + "-cur");
        if (tht == null) {
            return null;
        }
        let rect = Rect.fromElement(tht);
        let center = rect.getCenter();
        let fieldRect = this.connector.field.getBoundingClientRect();
        return new Point(center.x, center.y - fieldRect.top);
    }
    getColWidth() {
        const w = this.connector.field.getBoundingClientRect().width;
        const rh = this.connector.rowHeight;
        let multiplier = Math.min(6, Math.max(2, w / 200));
        let ret = rh * multiplier;
        return ret;
    }
    layoutDownLeft(gen, node, point) {
        let y = point.y;
        let x = point.x - this.getColWidth();
        const spacing = plexAnimator.thoughtSpacing || 1.0;
        node.jumps.forEach((jump, index) => {
            let rep = this.connector.thtReps.get(jump.id);
            if (!rep) {
                console.log("ERROR: Could not find element with id: " + jump.id);
                return;
            }
            rep.alignment = ThoughtHorizontalAlignment.Right;
            rep.expandDirection = ThoughtExpandDirection.Undefined;
            rep.generation = gen;
            plexAnimator.addPrimaryLink(node.id, jump.id);
            plexCanvas.outlineGroupOf.set(jump.id, { parentId: node.id, relationType: "jump" });
            plexCanvas.gridPositionToThoughtId.set(`${node.id}-jump-${index}`, jump.id);
            let el = rep.thtEl;
            this.setThoughtPosition_Center(el, new Point(point.x, y), 100, true, ThoughtHorizontalAlignment.Right);
            el.style.opacity = "1.0";
            el.style.fontSize = "100%";
            this.setChildOfElementToRowReverse(el);
            y += this.connector.rowHeight * spacing;
        });
        return y - point.y;
    }
    layoutDownRight(gen, node, point) {
        let y = point.y;
        let x = point.x + this.getColWidth();
        const spacing = plexAnimator.thoughtSpacing || 1.0;
        node.children.forEach((child, index) => {
            var _a;
            let rep = this.connector.thtReps.get(child.id);
            if (!rep) {
                console.log("ERROR: Could not find element with id: " + child.id);
                return;
            }
            rep.alignment = ThoughtHorizontalAlignment.Left;
            rep.expandDirection = ThoughtExpandDirection.Child;
            rep.generation = gen;
            plexAnimator.addPrimaryLink(node.id, child.id);
            plexCanvas.outlineGroupOf.set(child.id, { parentId: node.id, relationType: "child" });
            plexCanvas.gridPositionToThoughtId.set(`${node.id}-child-${index}`, child.id);
            let el = rep.thtEl;
            this.setThoughtPosition_Center(el, new Point(point.x, y), 100, true, ThoughtHorizontalAlignment.Left);
            el.style.opacity = "1.0";
            el.style.fontSize = "100%";
            y += this.connector.rowHeight * spacing;
            if (((_a = child.children) !== null && _a !== void 0 ? _a : []).length > 0) {
                let dy = this.layoutDownRight(gen + 1, child, new Point(x, y));
                y += dy;
            }
        });
        return y - point.y;
    }
    setChildOfElementToRowReverse(el) {
        var _a;
        if (el && el.children && el.children.length > 0 && el.children[0].children && el.children[0].children.length > 0) {
            let childEl = (_a = el.children[0]) === null || _a === void 0 ? void 0 : _a.children[0];
            if (childEl) {
                childEl.style.flexDirection = "row-reverse";
            }
        }
    }
    layoutUpLeft(gen, node, point) {
        var _a, _b;
        let y = point.y;
        let x = point.x - this.getColWidth();
        const spacing = plexAnimator.thoughtSpacing || 1.0;
        const parentCount = (_b = (_a = node.parents) === null || _a === void 0 ? void 0 : _a.length) !== null && _b !== void 0 ? _b : 0;
        node.parents.forEach((parent, index) => {
            var _a;
            let rep = this.connector.thtReps.get(parent.id);
            if (!rep) {
                console.log("ERROR: Could not find element with id: " + parent.id);
                return;
            }
            rep.alignment = ThoughtHorizontalAlignment.Right;
            rep.expandDirection = ThoughtExpandDirection.Parent;
            rep.generation = gen;
            plexAnimator.addPrimaryLink(node.id, parent.id);
            plexCanvas.outlineGroupOf.set(parent.id, { parentId: node.id, relationType: "parent" });
            plexCanvas.gridPositionToThoughtId.set(`${node.id}-parent-${parentCount - 1 - index}`, parent.id);
            let el = rep.thtEl;
            this.setThoughtPosition_Center(el, new Point(point.x, y), 100, false, ThoughtHorizontalAlignment.Right);
            el.style.opacity = "1.0";
            el.style.fontSize = "100%";
            this.setChildOfElementToRowReverse(el);
            y -= this.connector.rowHeight * spacing;
            if (((_a = parent.parents) !== null && _a !== void 0 ? _a : []).length > 0) {
                let dy = this.layoutUpLeft(gen + 1, parent, new Point(x, y));
                y += dy;
            }
        });
        return y - point.y;
    }
}
//# sourceMappingURL=outlineLayout.js.map