import { Point, Rect } from "/_content/Venus/js/dist/geometry.js";
import { ThoughtExpandDirection, ThoughtHorizontalAlignment } from "./enums.js";
import { plexAnimator } from "./plexAnimator.js";
import { OutlineLayout } from "./outlineLayout.js";
import { plexCanvas, DebugRect } from "./plexCanvas.js";
export class MindmapLayout extends OutlineLayout {
    constructor(connector) {
        super(connector);
        this.MIN_FIELD_WIDTH = 800;
        this.VERTICAL_SPACING_MULTIPLIER = 2.5;
        this.COLUMN_PADDING_MULTIPLIER = 0.15;
        this.GROUP_PADDING_MULTIPLIER = 0.3;
        this.columnRatio = 1.125;
        this.lastY = 0;
        this.computeSet = new Set();
        this.heightMap = new Map();
        this.actualHeightMap = new Map();
        this.widthMap = new Map();
        this.actualWidthMap = new Map();
        this.childrenHeightMap = new Map();
        this.NUM_LINES = 66;
    }
    getColWidth() {
        const w = Math.max(this.MIN_FIELD_WIDTH, this.connector.field.getBoundingClientRect().width);
        const rh = this.connector.rowHeight;
        let multiplier = Math.min(6, Math.max(2, w / 200));
        let ret = rh * multiplier;
        return ret;
    }
    getCurvePoints(linkRelation, rectA, gateA, genA, thtAlignA, rectB, gateB, genB, thtAlignB, isSecondaryLink) {
        let cx1 = gateA.x, cy1 = gateA.y, cx2 = gateB.x, cy2 = gateB.y;
        let x1 = gateA.x, y1 = gateA.y, x2 = gateB.x, y2 = gateB.y;
        let curveStrength = 0.7;
        let minControlDelta = this.connector.getRowHeightWithSpacing();
        let controlDelta = 0;
        let xSign = Math.sign(x2 - x1);
        controlDelta = Math.max(Math.floor(Math.abs(x1 - x2) * curveStrength + 0.5), minControlDelta);
        if (isSecondaryLink && Math.abs(x1 - x2) < minControlDelta * 2) {
            if (thtAlignA == ThoughtHorizontalAlignment.Right && thtAlignB == ThoughtHorizontalAlignment.Right) {
                cx1 += minControlDelta * 3;
                cx2 += minControlDelta * 3;
            }
            else {
                cx1 -= minControlDelta * 3;
                cx2 -= minControlDelta * 3;
            }
        }
        else {
            cx1 += xSign * controlDelta;
            cx2 -= xSign * controlDelta;
        }
        let points = [];
        points[0] = new Point(x1, y1);
        points[1] = new Point(cx1, cy1);
        points[2] = new Point(cx2, cy2);
        points[3] = new Point(x2, y2);
        return points;
    }
    getRelations(node) {
        var _a, _b, _c;
        if (!node) {
            return [];
        }
        let combinedSortedRelatedNodes = [];
        (_a = node.parents) === null || _a === void 0 ? void 0 : _a.forEach((one) => {
            combinedSortedRelatedNodes.push(one);
        });
        (_b = node.jumps) === null || _b === void 0 ? void 0 : _b.forEach((one) => {
            combinedSortedRelatedNodes.push(one);
        });
        (_c = node.children) === null || _c === void 0 ? void 0 : _c.forEach((one) => {
            combinedSortedRelatedNodes.push(one);
        });
        return combinedSortedRelatedNodes;
    }
    computeAllHeights(node) {
        if (!node) {
            return;
        }
        this.computeGenerations(node.id, this.getRelations(node));
    }
    moveCurToNewPositions(zoneIgnored, isScrollEvent, lastBackgroundDragX, lastBackgroundDragY) {
        var _a, _b;
        if (this.connector.node == null) {
            console.log("ERROR: this.node is null");
            return;
        }
        let point = new Point(lastBackgroundDragX, lastBackgroundDragY);
        plexCanvas.debugRectsClear();
        plexCanvas.gridPositionToThoughtId.clear();
        let rep = this.connector.thtReps.get(this.connector.node.id);
        if (!rep) {
            console.log("ERROR: Could not find element with id: " + this.connector.node.id + " for " + this.connector.thtReps.size + " thtReps");
            return;
        }
        let el = rep.thtEl;
        let maxWid = (this.getColWidth() * 2.0 - this.connector.getRowHeightWithSpacing() * 3.0) * 1.5;
        let parentsCount = ((_a = this.connector.node.parents) === null || _a === void 0 ? void 0 : _a.length) || 0;
        let jumpsCount = ((_b = this.connector.node.jumps) === null || _b === void 0 ? void 0 : _b.length) || 0;
        if (parentsCount >= 2 || jumpsCount >= 2) {
            maxWid *= 1.5;
        }
        const rowHeight = this.connector.getRowHeightWithSpacing();
        const horizontalPadding = rowHeight * 1.1;
        maxWid = Math.max(maxWid, plexAnimator.minColumnWidth + horizontalPadding * 2.0);
        let activeMaxWid = maxWid - horizontalPadding * 2.0;
        el.style.maxHeight = "";
        el.style.overflow = "";
        const textEl = el.querySelector('.narrow-text-when-narrow');
        if (textEl) {
            textEl.style.display = '';
            textEl.style.overflow = '';
            textEl.style.removeProperty('-webkit-box-orient');
            textEl.style.removeProperty('-webkit-line-clamp');
        }
        let m = this.measureThoughtWithMaxWidth(el, 125, activeMaxWid);
        let w2 = Math.min(m.w, activeMaxWid);
        this.setupThoughtElementForMultilineLayout(el, w2, -1, point, 125, ThoughtHorizontalAlignment.Center);
        el.style.overflow = "unset";
        const hasParentsOrJumps = parentsCount > 0 || jumpsCount > 0;
        let visibleH = m.h - 0.2 * rowHeight;
        if (hasParentsOrJumps) {
            const MAX_LINES = 8;
            const lineHeightForCap = m.lineHeight > 0 ? m.lineHeight : 0.79 * rowHeight;
            const maxH = MAX_LINES * lineHeightForCap;
            if (m.h > maxH) {
                el.style.overflow = "hidden";
                el.style.maxHeight = maxH + "px";
                visibleH = maxH;
                if (textEl && m.lineHeight > 0) {
                    textEl.style.display = '-webkit-box';
                    textEl.style.setProperty('-webkit-box-orient', 'vertical');
                    textEl.style.setProperty('-webkit-line-clamp', String(MAX_LINES));
                    textEl.style.overflow = 'hidden';
                    visibleH = MAX_LINES * m.lineHeight;
                }
            }
        }
        let topNum = parseFloat(el.style.top);
        el.style.top = (topNum - (visibleH / 2.0)) + "px";
        this.resetComputedData();
        this.computeAllHeights(this.connector.node);
        this.lastY = 0;
        let combinedSortedRelatedNodes = this.connector.node.children != null ? this.connector.node.children : [];
        const GAP_ROWS = 2;
        const verticalGap = visibleH / 2 + GAP_ROWS * rowHeight;
        const pjThoughtWidth = maxWid - this.COLUMN_PADDING_MULTIPLIER * this.getColWidth() - horizontalPadding;
        if (this.connector.node.parents != null && this.connector.node.parents.length > 0) {
            const parents = this.connector.node.parents;
            const numRows = Math.ceil(parents.length / 2);
            const startY = point.y - verticalGap - ((numRows - 1) * rowHeight);
            this.layoutVerticalThoughts(this.connector.node.id, parents, startY, "up", pjThoughtWidth, point.x);
            this.populateVerticalGridPositions(parents, "parent");
        }
        if (this.connector.node.jumps != null && this.connector.node.jumps.length > 0) {
            const jumps = this.connector.node.jumps;
            const startY = point.y + verticalGap;
            this.layoutVerticalThoughts(this.connector.node.id, jumps, startY, "down", pjThoughtWidth, point.x);
            this.populateVerticalGridPositions(jumps, "jump");
        }
        let totalChildrenHeight = this.measureHeight(combinedSortedRelatedNodes);
        let halfHeight = totalChildrenHeight / 2.0;
        let runningTotal = 0;
        let n = combinedSortedRelatedNodes.length;
        let rightIndex = 0;
        let leftIndex = 0;
        let lastOneHeight = 0;
        for (let i = 0; i < n; i++) {
            let child = combinedSortedRelatedNodes[i];
            lastOneHeight = this.measureHeightOne(child);
            runningTotal += lastOneHeight;
            rightIndex++;
            if (runningTotal >= halfHeight) {
                break;
            }
            leftIndex++;
        }
        if (n > 1 && rightIndex == n) {
            rightIndex--;
            leftIndex--;
        }
        let leftSideHeight = 0;
        for (let i = 0; i <= leftIndex; i++) {
            let child = combinedSortedRelatedNodes[i];
            leftSideHeight += this.measureHeightOne(child);
        }
        let withoutLastOne = leftSideHeight - lastOneHeight;
        if (Math.abs(withoutLastOne - halfHeight) < Math.abs(leftSideHeight - halfHeight)) {
            leftIndex--;
            rightIndex--;
            leftSideHeight = 0;
            for (let i = 0; i <= leftIndex; i++) {
                let child = combinedSortedRelatedNodes[i];
                leftSideHeight += this.measureHeightOne(child);
            }
        }
        let leftChildren = combinedSortedRelatedNodes.slice(0, leftIndex + 1);
        let rightChildren = combinedSortedRelatedNodes.slice(rightIndex, n);
        leftChildren.forEach((child, row) => {
            plexCanvas.gridPositionToThoughtId.set(`child-0-${row}`, child.id);
            let childRep = this.connector.thtReps.get(child.id);
            if (childRep) {
                childRep.thtEl.dataset.gridZone = "child";
                childRep.thtEl.dataset.gridColumn = "0";
                childRep.thtEl.dataset.gridRow = row.toString();
            }
        });
        rightChildren.forEach((child, row) => {
            plexCanvas.gridPositionToThoughtId.set(`child-1-${row}`, child.id);
            let childRep = this.connector.thtReps.get(child.id);
            if (childRep) {
                childRep.thtEl.dataset.gridZone = "child";
                childRep.thtEl.dataset.gridColumn = "1";
                childRep.thtEl.dataset.gridRow = row.toString();
            }
        });
        const groupPadding = this.GROUP_PADDING_MULTIPLIER * this.connector.getRowHeightWithSpacing();
        let leftH = this.measureHeight(leftChildren) + 2 * groupPadding;
        let rightH = this.measureHeight(rightChildren) + 2 * groupPadding;
        let center = this.getActiveZoneCenter();
        plexCanvas.debugRectsPush(new DebugRect(new Rect(center.x - 2, center.y - 2, 4, 4), 0x005500, 2.0));
        const lx = point.x - maxWid / 2.0;
        const ly = point.y - leftH * 0.5;
        let lw = this.getColWidth() * -1;
        plexCanvas.debugRectsPush(new DebugRect(new Rect(center.x + lx, center.y + ly, lw, leftH), 0x0000ff, 3.0));
        const rx = point.x + maxWid / 2.0;
        const ry = point.y - rightH * 0.5;
        let rw = this.getColWidth();
        plexCanvas.debugRectsPush(new DebugRect(new Rect(center.x + rx, center.y + ry, rw, rightH), 0x0000ff, 3.0));
        this.layoutGenerationsGoingSideways("left", this.connector.node.id, leftChildren, lx, ly);
        this.layoutGenerationsGoingSideways("right", this.connector.node.id, rightChildren, rx, ry);
        this.createOrUpdateZoneDivs();
    }
    measureHeight(relations) {
        let total = 0;
        relations.forEach((child) => {
            total += this.measureHeightOne(child);
        });
        return total;
    }
    measureHeightOne(node) {
        var _a;
        if (!node) {
            return 0;
        }
        let h = this.heightMap.get(node.id);
        let ah = this.actualHeightMap.get(node.id);
        if (h && !ah) {
            return h;
        }
        let relations = (_a = node.children) !== null && _a !== void 0 ? _a : [];
        if (relations.length == 0) {
            let h = this.heightMap.get(node.id);
            if (!h) {
                console.error("Undefined height for node '" + node.id);
                return 0;
            }
            return h;
        }
        const totalChildrenHeight = this.measureHeight(relations);
        const groupPadding = this.GROUP_PADDING_MULTIPLIER * this.connector.getRowHeightWithSpacing();
        const paddedTotal = totalChildrenHeight + 2 * groupPadding;
        if (ah && ah > paddedTotal) {
            return ah;
        }
        return paddedTotal;
    }
    resetComputedData() {
        this.lastY = 0;
        this.computeSet.clear();
        this.heightMap.clear();
        this.widthMap.clear();
        this.actualHeightMap.clear();
        this.actualWidthMap.clear();
        this.childrenHeightMap.clear();
    }
    computeThought(id, relationsCount) {
        var _a;
        this.computeSet.add(id);
        let el = (_a = this.connector.thtReps.get(id)) === null || _a === void 0 ? void 0 : _a.thtEl;
        const maxWidthLeaf = this.getMaxWidthLeaf();
        const maxWidthInner = this.getMaxWidthInner();
        let maxWidth = (relationsCount == 0) ? maxWidthLeaf : maxWidthInner;
        if (!el) {
            console.log("ERROR - computeThought: Could not find element with id: " + id);
            return this.connector.getRowHeightWithSpacing();
        }
        if (relationsCount == 0) {
            let m = this.measureThoughtWithMaxWidth(el, 100, maxWidth);
            this.actualWidthMap.set(id, m.w);
            const rhs = this.connector.getRowHeightWithSpacing();
            let h = Math.max(m.h, rhs);
            return h;
        }
        return 0;
    }
    computeGenerations(id, nodes) {
        var _a;
        let that = this;
        const maxWidthInner = this.getMaxWidthInner();
        const maxWidthLeaf = this.getMaxWidthLeaf();
        let oldY = this.lastY;
        nodes.forEach((node) => {
            var _a;
            if (this.computeSet.has(node.id)) {
                return;
            }
            let relations = (_a = node.children) !== null && _a !== void 0 ? _a : [];
            if (relations.length > 0) {
                let comboHeight = this.computeGenerations(node.id, relations);
                this.lastY += comboHeight;
                that.heightMap.set(id, comboHeight);
                that.widthMap.set(id, maxWidthInner);
            }
            else {
                let h = this.computeThought(node.id, relations.length);
                h = +(h);
                that.heightMap.set(node.id, h);
                this.lastY += h;
                that.widthMap.set(node.id, maxWidthLeaf);
            }
        });
        let childrenHeight = that.lastY - oldY;
        if (childrenHeight > 0) {
            that.childrenHeightMap.set(id, childrenHeight);
        }
        let height = childrenHeight;
        const el = (_a = this.connector.thtReps.get(id)) === null || _a === void 0 ? void 0 : _a.thtEl;
        let maxWidth = (nodes.length == 0) ? maxWidthLeaf : maxWidthInner;
        if (el) {
            let m = this.measureThoughtWithMaxWidth(el, 100, maxWidth);
            height = Math.max(m.h, height);
            that.actualHeightMap.set(id, m.h);
            that.actualWidthMap.set(id, m.w);
        }
        that.heightMap.set(id, height);
        that.widthMap.set(id, maxWidth);
        return height;
    }
    layoutGenerationsGoingSideways(direction, id, nodes, startX, startY) {
        var _a;
        let that = this;
        const origY = startY;
        if (!nodes || nodes.length == 0) {
            return startY;
        }
        const maxWidthLeaf = this.getMaxWidthLeaf();
        const maxWidthInner = this.getMaxWidthInner();
        const signX = direction == "left" ? -1 : 1;
        const ah = (_a = this.actualHeightMap.get(id)) !== null && _a !== void 0 ? _a : 0;
        const groupPadding = this.GROUP_PADDING_MULTIPLIER * this.connector.getRowHeightWithSpacing();
        let deltaY = groupPadding;
        const paddingY = 0.2 * that.connector.getRowHeightWithSpacing();
        nodes.forEach((node) => {
            var _a, _b, _c, _d;
            let h = (_a = that.heightMap.get(node.id)) !== null && _a !== void 0 ? _a : that.connector.getRowHeightWithSpacing();
            let rep = this.connector.thtReps.get(node.id);
            if (!rep) {
                console.log("ERROR: Could not find element with id: " + node.id);
                return -1;
            }
            rep.zone = "child";
            rep.alignment = direction == "left" ? ThoughtHorizontalAlignment.Right : ThoughtHorizontalAlignment.Left;
            rep.expandDirection = direction == "left" ? ThoughtExpandDirection.ChildLeft : ThoughtExpandDirection.Child;
            rep.actualContentWidth = this.actualWidthMap.get(node.id);
            plexAnimator.addPrimaryLink(id, node.id);
            let relations = (_b = node.children) !== null && _b !== void 0 ? _b : [];
            const isLeaf = relations.length == 0;
            let newY = startY + deltaY;
            let reverseDeltaY = 0;
            if (relations.length > 0) {
                const ah2 = (_c = this.actualHeightMap.get(node.id)) !== null && _c !== void 0 ? _c : 0;
                const paddedChildrenHeight = this.measureHeight(relations) + 2 * groupPadding;
                if (ah2 > 0 && paddedChildrenHeight > ah2) {
                    reverseDeltaY -= (ah2 - paddedChildrenHeight) * 0.5;
                }
            }
            newY += paddingY;
            let top = new Point(startX, newY + reverseDeltaY);
            let maxWid = isLeaf ? this.getMaxWidthLeaf() : this.getMaxWidthInner();
            that.layoutThought(node, maxWid, top, isLeaf, direction == "left" ? ThoughtHorizontalAlignment.Right : ThoughtHorizontalAlignment.Left, direction == "left", relations.length);
            if (relations.length > 0) {
                let recursiveShift = 0;
                const ah2 = (_d = this.actualHeightMap.get(node.id)) !== null && _d !== void 0 ? _d : 0;
                const paddedChildrenHeight = this.measureHeight(relations) + 2 * groupPadding;
                if (ah2 > 0 && ah2 > paddedChildrenHeight) {
                    recursiveShift += (ah2 - paddedChildrenHeight) * 0.5;
                }
                deltaY += that.layoutGenerationsGoingSideways(direction, node.id, relations, startX + this.columnRatio * signX * that.getColWidth() * 1.2, startY + deltaY + recursiveShift);
            }
            else {
                deltaY += h;
            }
        });
        deltaY += groupPadding;
        let shiftedDouble = deltaY;
        if (ah && ah > shiftedDouble) {
            shiftedDouble = ah;
        }
        let center = this.getActiveZoneCenter();
        let rx = startX + center.x;
        let ry = startY + center.y;
        let rw = this.getColWidth() * (direction == "left" ? -1.0 : 1.0);
        let rh = deltaY;
        let rect = new Rect(rx, ry, rw, rh);
        plexCanvas.debugRectsPush(new DebugRect(rect, 0xff0000, 1.0));
        return shiftedDouble;
    }
    getMaxWidthLeaf() {
        return this.getColWidth() * 2.0 - this.connector.getRowHeightWithSpacing();
    }
    getMaxWidthInner() {
        return this.getColWidth();
    }
    setThoughtPosition_Multiline(el, maxWidth, numberOfLines, point, fontSizePercent, isYAtTop, horizAlign) {
        var _a, _b, _c;
        const id = el.id.substring(4, 40);
        const w = (_a = this.widthMap.get(id)) !== null && _a !== void 0 ? _a : -1337;
        const h = (_b = this.heightMap.get(id)) !== null && _b !== void 0 ? _b : -1337;
        const aw = this.actualWidthMap.get(id);
        const ah = (_c = this.actualHeightMap.get(id)) !== null && _c !== void 0 ? _c : this.heightMap.get(id);
        this.setupThoughtElementForMultilineLayout(el, w, h, new Point(point.x, point.y), fontSizePercent, horizAlign, aw, ah);
    }
    layoutThought(node, maxWidth, point, isLeaf, horizAlign, isIconOnRight, numberOfLines) {
        var _a, _b, _c;
        let rep = this.connector.thtReps.get(node.id);
        if (!rep) {
            console.log("ERROR: Could not find element with id: " + node.id);
            return;
        }
        let el = rep.thtEl;
        if (isLeaf) {
            if (el && el.children && el.children.length > 0 && el.children[0].children && el.children[0].children.length > 0) {
                let childEl = (_a = el.children[0]) === null || _a === void 0 ? void 0 : _a.children[0];
                childEl.style.flexDirection = isIconOnRight ? "row-reverse" : "row";
            }
            let h = this.heightMap.get(node.id);
            if (h) {
                const w = (_b = this.widthMap.get(node.id)) !== null && _b !== void 0 ? _b : maxWidth;
                const ah = this.actualHeightMap.get(node.id);
                const aw = this.actualWidthMap.get(node.id);
                let n = 1;
                if (h == this.connector.getRowHeightWithSpacing()) {
                    n = 1;
                }
                else {
                    n = Math.ceil(h / (this.connector.getRowHeightWithSpacing()));
                }
                if (n < 2) {
                    point = new Point(point.x, point.y);
                    this.setThoughtPosition_Center(el, point, 100, true, horizAlign);
                }
                else {
                    point = new Point(point.x, point.y);
                    this.setThoughtPosition_Multiline(el, w, n, point, 100, true, horizAlign);
                }
            }
            el.style.opacity = "1.0";
            el.style.fontSize = "100%";
        }
        else {
            if (el && el.children && el.children.length > 0 && el.children[0].children && el.children[0].children.length > 0) {
                let childEl = (_c = el.children[0]) === null || _c === void 0 ? void 0 : _c.children[0];
                childEl.style.flexDirection = isIconOnRight ? "row-reverse" : "row";
            }
            this.setThoughtPosition_Multiline(el, maxWidth, numberOfLines, point, 100, true, horizAlign);
            el.style.opacity = "1.0";
            el.style.fontSize = "100%";
        }
    }
    layoutVerticalThoughts(activeThoughtId, thoughts, startY, direction, activeWidth, centerX) {
        if (!thoughts || thoughts.length === 0) {
            return;
        }
        const columnCount = thoughts.length === 1 ? 1 : 2;
        const rowHeight = this.connector.getRowHeightWithSpacing();
        const horizontalPadding = this.COLUMN_PADDING_MULTIPLIER * rowHeight;
        const effectiveColumnWidth = activeWidth / 2;
        const maxWidthPerThought = effectiveColumnWidth - horizontalPadding;
        const leftColumnX = centerX - activeWidth / 4 - horizontalPadding / 2;
        const rightColumnX = centerX + activeWidth / 4 + horizontalPadding / 2;
        let currentY = startY;
        let currentColumn = 0;
        let leftColumnRowCount = 0;
        let rightColumnRowCount = 0;
        thoughts.forEach((node, index) => {
            let rep = this.connector.thtReps.get(node.id);
            if (!rep) {
                console.log("ERROR: Could not find element with id: " + node.id);
                return;
            }
            let el = rep.thtEl;
            if (direction == "up") {
                rep.zone = "parent";
            }
            else if (direction == "down") {
                rep.zone = "jump";
            }
            let columnX;
            if (columnCount === 1) {
                columnX = centerX;
            }
            else {
                const rowsPerColumn = Math.ceil(thoughts.length / 2);
                if (index < rowsPerColumn) {
                    columnX = leftColumnX;
                    currentY = startY + leftColumnRowCount * rowHeight;
                    leftColumnRowCount++;
                }
                else {
                    columnX = rightColumnX;
                    if (index === rowsPerColumn) {
                        currentY = startY;
                        rightColumnRowCount = 0;
                    }
                    currentY = startY + rightColumnRowCount * rowHeight;
                    rightColumnRowCount++;
                }
            }
            let pt = new Point(columnX, currentY);
            el.style.display = "block";
            el.style.opacity = "1.0";
            el.style.fontSize = "100%";
            el.style.maxWidth = (columnCount === 1 ? activeWidth : maxWidthPerThought) + "px";
            this.setThoughtPosition_Center(el, pt, 100, false, ThoughtHorizontalAlignment.Center);
            plexAnimator.addPrimaryLink(activeThoughtId, node.id);
            if (columnCount === 1) {
                currentY += rowHeight;
            }
        });
    }
    populateVerticalGridPositions(thoughts, zone) {
        const columnCount = thoughts.length === 1 ? 1 : 2;
        thoughts.forEach((node, index) => {
            let col, row;
            if (columnCount === 1) {
                col = 0;
                row = index;
            }
            else {
                const rowsPerColumn = Math.ceil(thoughts.length / 2);
                if (index < rowsPerColumn) {
                    col = 0;
                    row = index;
                }
                else {
                    col = 1;
                    row = index - rowsPerColumn;
                }
            }
            const gridKey = `${zone}-${col}-${row}`;
            plexCanvas.gridPositionToThoughtId.set(gridKey, node.id);
            let rep = this.connector.thtReps.get(node.id);
            if (rep) {
                rep.thtEl.dataset.gridZone = zone;
                rep.thtEl.dataset.gridColumn = col.toString();
                rep.thtEl.dataset.gridRow = row.toString();
            }
        });
    }
}
//# sourceMappingURL=mindmapLayout.js.map