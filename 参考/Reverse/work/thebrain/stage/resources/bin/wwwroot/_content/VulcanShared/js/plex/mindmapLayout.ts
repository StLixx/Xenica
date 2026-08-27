// @ts-ignore
import {Collider, CubicCollider, LineCollider, PI, Point, Rect} from "/_content/Venus/js/dist/geometry.js"
// @ts-ignore
import {DomUtils} from "/_content/Venus/js/dist/domUtils.js"
import {ThoughtExpandDirection, ThoughtHorizontalAlignment} from "./enums.js";
import {LayoutNode} from "./layoutNode.js";
import {ThoughtRep} from "./thoughtRep.js";
import {PlexConnector} from "./plexConnector.js";
import {plexAnimator} from "./plexAnimator.js";
import {OutlineLayout} from "./outlineLayout.js";
import {Relation} from "./core.js";
import {plexCanvas, DebugRect} from "./plexCanvas.js";

export class MindmapLayout extends OutlineLayout { // avoid copy-pasting code by extending OutlineLayout

    MIN_FIELD_WIDTH = 800;
    VERTICAL_SPACING_MULTIPLIER = 2.5; // controls gap between active thought and parents/jumps
    COLUMN_PADDING_MULTIPLIER = 0.15; // controls horizontal padding between columns (as fraction of row height)
    GROUP_PADDING_MULTIPLIER = 0.3; // top/bottom padding around each sibling group, to visually separate cousins

    constructor(connector: PlexConnector) {
        super(connector);
    }

    public override getColWidth(): number {
        // Pretend the container is always at least MIN_FIELD_WIDTH wide
        const w = Math.max(this.MIN_FIELD_WIDTH, this.connector.field.getBoundingClientRect().width);
        const rh = this.connector.rowHeight;
        let multiplier = Math.min(6, Math.max(2, w / 200));
        let ret = rh * multiplier;
        return ret;
    }

    getCurvePoints(linkRelation: Relation,
                   rectA: Rect, gateA: Point, genA: number, thtAlignA: ThoughtHorizontalAlignment,
                   rectB: Rect, gateB: Point, genB: number, thtAlignB: ThoughtHorizontalAlignment,
                   isSecondaryLink: boolean): Point[] {
        let cx1 = gateA.x, cy1 = gateA.y, cx2 = gateB.x, cy2 = gateB.y;
        let x1 = gateA.x, y1 = gateA.y, x2 = gateB.x, y2 = gateB.y;

        let curveStrength = 0.7;
        // if the two thoughts are aligned, we need a minimum amount to ensure the curve sticks out
        let minControlDelta = this.connector.getRowHeightWithSpacing();
        let controlDelta = 0;

        let xSign = Math.sign(x2 - x1);
        controlDelta = Math.max(Math.floor(Math.abs(x1 - x2) * curveStrength + 0.5), minControlDelta);

        // if this is a secondary link and the thoughts are horizontally aligned, make the curve go right
        if(isSecondaryLink && Math.abs(x1 - x2) < minControlDelta * 2) {
            if(thtAlignA == ThoughtHorizontalAlignment.Right && thtAlignB == ThoughtHorizontalAlignment.Right) {
                cx1 += minControlDelta * 3;
                cx2 += minControlDelta * 3;
            }
            else {
                cx1 -= minControlDelta * 3;
                cx2 -= minControlDelta * 3;
            }
        } else {
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

    getRelations(node: LayoutNode): LayoutNode[] {
        if(!node) {
            return [];
        }
        let combinedSortedRelatedNodes: LayoutNode[] = [];
        node.parents?.forEach((one: LayoutNode) => {
            combinedSortedRelatedNodes.push(one);
        });
        node.jumps?.forEach((one: LayoutNode) => {
            combinedSortedRelatedNodes.push(one);
        });
        node.children?.forEach((one: LayoutNode) => {
            combinedSortedRelatedNodes.push(one);
        });
        return combinedSortedRelatedNodes;
    }
    
    computeAllHeights(node: LayoutNode) {
        if(!node) {
            return;
        }
        this.computeGenerations(node.id, this.getRelations(node));
    }
    
    columnRatio: number = 1.125;
    
    moveCurToNewPositions(zoneIgnored: string, isScrollEvent: boolean, lastBackgroundDragX: number, lastBackgroundDragY: number) {
        if(this.connector.node == null) {
            console.log("ERROR: this.node is null");
            return;
        }
        let point = new Point(lastBackgroundDragX, lastBackgroundDragY);
        
        plexCanvas.debugRectsClear();
        plexCanvas.gridPositionToThoughtId.clear();

        let rep: ThoughtRep | undefined = this.connector.thtReps.get(this.connector.node.id);
        if(!rep) {
            console.log("ERROR: Could not find element with id: " + this.connector.node.id + " for " + this.connector.thtReps.size + " thtReps");
            return;
        }
        let el: HTMLElement = rep.thtEl;
        let maxWid = (this.getColWidth() * 2.0 - this.connector.getRowHeightWithSpacing() * 3.0) * 1.5;

        // Adjust max active thought width if we have 2+ parents or jumps
        let parentsCount = this.connector.node.parents?.length || 0;
        let jumpsCount = this.connector.node.jumps?.length || 0;
        if (parentsCount >= 2 || jumpsCount >= 2) {
            maxWid *= 1.5;
        }

        const rowHeight = this.connector.getRowHeightWithSpacing();
        const horizontalPadding = rowHeight * 1.1;
        // Honor the user's "Column Width" setting as a minimum reserved width for the active
        // thought. Applied to maxWid (not just activeMaxWid) so the parents/jumps row and the
        // left/right children column placement also widen with the slider.
        maxWid = Math.max(maxWid, plexAnimator.minColumnWidth + horizontalPadding * 2.0);
        let activeMaxWid = maxWid - horizontalPadding * 2.0;

        // Reset leaked styles from a previous render so measurement is idempotent
        // and a prior clamp doesn't bleed into the new measureThoughtWithMaxWidth clone.
        el.style.maxHeight = "";
        el.style.overflow = "";
        const textEl = el.querySelector('.narrow-text-when-narrow') as HTMLElement | null;
        if (textEl) {
            textEl.style.display = '';
            textEl.style.overflow = '';
            textEl.style.removeProperty('-webkit-box-orient');
            textEl.style.removeProperty('-webkit-line-clamp');
        }

        // Measure active thought with balanced text wrapping
        let m = this.measureThoughtWithMaxWidth(el, 125, activeMaxWid);
        let w2 = Math.min(m.w, activeMaxWid);

        this.setupThoughtElementForMultilineLayout(el, w2, -1, point, 125, ThoughtHorizontalAlignment.Center);
        el.style.overflow = "unset"; // fix clipping issue for active thought in the middle that will never need to be clipped

        // Cap height + line-clamp with ellipsis when parents or jumps are present,
        // so the active thought doesn't overlap the parent row above or jump row
        // below. Parents/jumps are positioned with a fixed gap from the active
        // thought's actual edges below (not from its center), so any visibleH
        // resulting from this clamp is automatically respected.
        const hasParentsOrJumps = parentsCount > 0 || jumpsCount > 0;
        // m.h includes a 0.2 * rowHeight padding added in measureThoughtWithMaxWidth;
        // strip it back out to get the pure rendered content height.
        let visibleH = m.h - 0.2 * rowHeight;
        if (hasParentsOrJumps) {
            // Cap at MAX_LINES of content. Fallback for missing line-height info
            // (~0.79 * rowHeight at 125% font, observed empirically).
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

        // Use clone-measured / computed visibleH for centering instead of
        // el.offsetHeight — the live element can be mid-font-size-transition,
        // returning a stale height (same bug Harlan fixed in normalLayout
        // commit e3d6ad662 for the analogous code path there).
        let topNum = parseFloat(el.style.top);
        // move up to properly center active thought on origin
        el.style.top = (topNum - (visibleH / 2.0)) + "px";
        //
        this.resetComputedData();
        this.computeAllHeights(this.connector.node);
        this.lastY = 0;

        let combinedSortedRelatedNodes: LayoutNode[] = this.connector.node.children != null ? this.connector.node.children : [];

        // Position parents above (and jumps below) the active thought based on its
        // actual height: a fixed GAP_ROWS gap from the active thought's edge plus
        // half the visible height (since point.y is its center). For short
        // thoughts (visibleH ≈ 1 rowHeight) the gap to the related row is ~2
        // rowHeights; for tall thoughts it scales naturally with the height.
        const GAP_ROWS = 2;
        const verticalGap = visibleH / 2 + GAP_ROWS * rowHeight;

        const pjThoughtWidth = maxWid - this.COLUMN_PADDING_MULTIPLIER * this.getColWidth() - horizontalPadding;
        if(this.connector.node.parents != null && this.connector.node.parents.length > 0) {
            // Layout parent thoughts above active thought
            const parents = this.connector.node.parents;
            const numRows = Math.ceil(parents.length / 2);
            const startY = point.y - verticalGap - ((numRows - 1) * rowHeight);

            this.layoutVerticalThoughts(this.connector.node.id, parents, startY, "up", pjThoughtWidth, point.x);
            this.populateVerticalGridPositions(parents, "parent");
        }
        if(this.connector.node.jumps != null && this.connector.node.jumps.length > 0) {
            // Layout jump thoughts below active thought
            const jumps = this.connector.node.jumps;
            const startY = point.y + verticalGap;

            this.layoutVerticalThoughts(this.connector.node.id, jumps, startY, "down", pjThoughtWidth, point.x);
            this.populateVerticalGridPositions(jumps, "jump");
        }

        // all thoughts have a computed height, ready to split things in half        
        let totalChildrenHeight = this.measureHeight(combinedSortedRelatedNodes);
        // split into two roughly equal buckets of left half and right half
        let halfHeight = totalChildrenHeight / 2.0;
        
        // find index of first child that is in the right half
        let runningTotal = 0;
        let n = combinedSortedRelatedNodes.length;
        let rightIndex = 0;
        let leftIndex = 0;
        let lastOneHeight = 0;
        for(let i = 0; i < n; i++) {
            let child = combinedSortedRelatedNodes[i];
            lastOneHeight = this.measureHeightOne(child);
            runningTotal += lastOneHeight;
            rightIndex++;
            if(runningTotal >= halfHeight) {
                break;
            }
            leftIndex++;
        }
        if(n > 1 && rightIndex == n) {
            rightIndex--;
            leftIndex--;
        }
        
        let leftSideHeight = 0;
        for(let i = 0; i <= leftIndex; i++) {
            let child = combinedSortedRelatedNodes[i];
            leftSideHeight += this.measureHeightOne(child);
        }
        // NOTE: is this actually smarter logic for trying to eliminate unevenness before finalizing leftIndex and rightIndex?
        // or does this bit of code just favor the right side and make things more complicated?
        let withoutLastOne = leftSideHeight - lastOneHeight;
        if(Math.abs(withoutLastOne - halfHeight) < Math.abs(leftSideHeight - halfHeight)) {
            leftIndex--;
            rightIndex--;
            // recompute leftSideHeight
            leftSideHeight = 0;
            for(let i = 0; i <= leftIndex; i++) {
                let child = combinedSortedRelatedNodes[i];
                leftSideHeight += this.measureHeightOne(child);
            }
        }
        // END NOTE
        
        let leftChildren = combinedSortedRelatedNodes.slice(0, leftIndex + 1);
        let rightChildren = combinedSortedRelatedNodes.slice(rightIndex, n);

        // Populate gridPositionToThoughtId for direct children so drag-drop reordering works.
        // Left children = column 0, right children = column 1. The linear sort order
        // (col * rowCount + row) matches the combinedSortedRelatedNodes / Graph.Children order.
        leftChildren.forEach((child: LayoutNode, row: number) => {
            plexCanvas.gridPositionToThoughtId.set(`child-0-${row}`, child.id);
            let childRep = this.connector.thtReps.get(child.id);
            if(childRep) {
                childRep.thtEl.dataset.gridZone = "child";
                childRep.thtEl.dataset.gridColumn = "0";
                childRep.thtEl.dataset.gridRow = row.toString();
            }
        });
        rightChildren.forEach((child: LayoutNode, row: number) => {
            plexCanvas.gridPositionToThoughtId.set(`child-1-${row}`, child.id);
            let childRep = this.connector.thtReps.get(child.id);
            if(childRep) {
                childRep.thtEl.dataset.gridZone = "child";
                childRep.thtEl.dataset.gridColumn = "1";
                childRep.thtEl.dataset.gridRow = row.toString();
            }
        });

        const groupPadding = this.GROUP_PADDING_MULTIPLIER * this.connector.getRowHeightWithSpacing();
        let leftH = this.measureHeight(leftChildren) + 2 * groupPadding;
        let rightH = this.measureHeight(rightChildren) + 2 * groupPadding;
        let center: Point = this.getActiveZoneCenter();

        // origin or center
        plexCanvas.debugRectsPush(
           new DebugRect(new Rect(center.x - 2, center.y - 2, 4, 4), 0x005500, 2.0));

        const lx = point.x - maxWid / 2.0;
        const ly = point.y - leftH * 0.5;
        let lw = this.getColWidth() * -1;
        plexCanvas.debugRectsPush(
            new DebugRect(new Rect(center.x + lx, center.y + ly, lw, leftH), 0x0000ff, 3.0));

        const rx = point.x + maxWid / 2.0;
        const ry = point.y - rightH * 0.5;
        let rw = this.getColWidth();
        plexCanvas.debugRectsPush(
           new DebugRect(new Rect(center.x + rx, center.y + ry, rw, rightH), 0x0000ff, 3.0));

        this.layoutGenerationsGoingSideways("left", this.connector.node.id, leftChildren, lx, ly);
        this.layoutGenerationsGoingSideways("right", this.connector.node.id, rightChildren, rx, ry);

        this.createOrUpdateZoneDivs();
    }
    
    // use this.heightMap to get the height of each child, or the height of single entry
    measureHeight(relations: LayoutNode[]): number {
        let total = 0;
        relations.forEach((child: LayoutNode) => {
            total += this.measureHeightOne(child);
        });
        return total;
    }
    
    measureHeightOne(node: LayoutNode): number {
        if (!node) {
            return 0;
        }
        // we already know everything about this node and its relations
        let h = this.heightMap.get(node.id);
        let ah = this.actualHeightMap.get(node.id);
        if (h && !ah) {
            return h;
        }
        let relations: LayoutNode[] = node.children ?? []; // children-only after first generation (which may have parents and jumps too)
        if (relations.length == 0) {
            let h = this.heightMap.get(node.id);
            if (!h) {
                console.error("Undefined height for node '" + node.id);
                return 0;
            }
            return h;
        }
        const totalChildrenHeight =  this.measureHeight(relations);
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

    lastY: number = 0;
    computeSet: Set<string> = new Set<string>();
    heightMap: Map<string, number> = new Map<string, number>();
    actualHeightMap: Map<string, number> = new Map<string, number>();
    widthMap: Map<string, number> = new Map<string, number>();
    actualWidthMap: Map<string, number> = new Map<string, number>();
    childrenHeightMap: Map<string, number> = new Map<string, number>();

    computeThought(id: string, relationsCount: number): number {
        this.computeSet.add(id);
        let el = this.connector.thtReps.get(id)?.thtEl;
        const maxWidthLeaf = this.getMaxWidthLeaf();
        const maxWidthInner = this.getMaxWidthInner();
        let maxWidth = (relationsCount == 0) ? maxWidthLeaf : maxWidthInner;
        if(!el) {
            console.log("ERROR - computeThought: Could not find element with id: " + id);
            return this.connector.getRowHeightWithSpacing();
        }
        if (relationsCount == 0) { // is a leaf
            let m = this.measureThoughtWithMaxWidth(el, 100, maxWidth);
            this.actualWidthMap.set(id, m.w);
            const rhs = this.connector.getRowHeightWithSpacing();
            let h = Math.max(m.h, rhs);
            return h;
        }
        return 0;
    }

    computeGenerations(id: string, nodes: LayoutNode[]): number {
        let that = this;
        const maxWidthInner = this.getMaxWidthInner();
        const maxWidthLeaf = this.getMaxWidthLeaf();

        let oldY = this.lastY;
        nodes.forEach((node: LayoutNode) => {
            if(this.computeSet.has(node.id)) {
                return;
            }
            let relations = node.children ?? [];
            if(relations.length > 0) {
                let comboHeight = this.computeGenerations(node.id, relations);
                this.lastY += comboHeight;
                that.heightMap.set(id, comboHeight);
                that.widthMap.set(id, maxWidthInner);
            } else {
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

        const el = this.connector.thtReps.get(id)?.thtEl;
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

    layoutGenerationsGoingSideways(direction: "left" | "right", id: string, nodes: LayoutNode[], startX: number, startY: number): number {
        let that = this;
        const origY = startY;
        if(!nodes || nodes.length == 0) {
            return startY;
        }
        const maxWidthLeaf = this.getMaxWidthLeaf();
        const maxWidthInner = this.getMaxWidthInner();
        const signX = direction == "left" ? -1 : 1;
        const ah = this.actualHeightMap.get(id) ?? 0;
        const groupPadding = this.GROUP_PADDING_MULTIPLIER * this.connector.getRowHeightWithSpacing();
        //
        let deltaY = groupPadding;
        const paddingY = 0.2 * that.connector.getRowHeightWithSpacing();
        nodes.forEach((node: LayoutNode) => {
            let h = that.heightMap.get(node.id) ?? that.connector.getRowHeightWithSpacing();
            let rep = this.connector.thtReps.get(node.id);
            if(!rep) {
                console.log("ERROR: Could not find element with id: " + node.id);
                return -1;
            }
            rep.zone = "child";
            rep.alignment = direction == "left" ? ThoughtHorizontalAlignment.Right : ThoughtHorizontalAlignment.Left;
            rep.expandDirection = direction == "left" ? ThoughtExpandDirection.ChildLeft : ThoughtExpandDirection.Child; // this just means the Chevron points left or right
            // Store actual content width for gate calculation
            rep.actualContentWidth = this.actualWidthMap.get(node.id);
            plexAnimator.addPrimaryLink(id, node.id);
            
            let relations = node.children ?? [];
            const isLeaf = relations.length == 0;
            let newY = startY + deltaY;
            let reverseDeltaY = 0;
            if(relations.length > 0) {
                const ah2 = this.actualHeightMap.get(node.id) ?? 0;
                const paddedChildrenHeight = this.measureHeight(relations) + 2 * groupPadding;
                if(ah2 > 0 && paddedChildrenHeight > ah2) {
                    reverseDeltaY -= (ah2 - paddedChildrenHeight) * 0.5;
                }
            }
            newY += paddingY;
            let top = new Point(startX, newY + reverseDeltaY);
            let maxWid = isLeaf ? this.getMaxWidthLeaf() : this.getMaxWidthInner();
            that.layoutThought(node, maxWid, top, isLeaf, direction == "left" ? ThoughtHorizontalAlignment.Right : ThoughtHorizontalAlignment.Left, direction == "left", relations.length);
            if(relations.length > 0) {
                let recursiveShift = 0;
                const ah2 = this.actualHeightMap.get(node.id) ?? 0;
                const paddedChildrenHeight = this.measureHeight(relations) + 2 * groupPadding;
                if(ah2 > 0 && ah2 > paddedChildrenHeight) {
                    recursiveShift += (ah2 - paddedChildrenHeight) * 0.5;
                }
                deltaY += that.layoutGenerationsGoingSideways(direction, node.id, relations, startX + this.columnRatio * signX * that.getColWidth() * 1.2, startY + deltaY + recursiveShift);
            } else {
                deltaY += h;
            }
        });
        deltaY += groupPadding;

        let shiftedDouble = deltaY;
        if (ah && ah > shiftedDouble) {
            shiftedDouble = ah;
        }

        // some useful debug rectangles to help
        let center: Point = this.getActiveZoneCenter();
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
    
    NUM_LINES = 66; // TODO work with this more.
    
    setThoughtPosition_Multiline(el: HTMLElement, maxWidth: number, numberOfLines: number, point: Point, fontSizePercent: number, isYAtTop: boolean, horizAlign: ThoughtHorizontalAlignment) {
        const id = el.id.substring(4, 40);
        const w = this.widthMap.get(id) ?? -1337;
        const h = this.heightMap.get(id) ?? -1337;
        const aw = this.actualWidthMap.get(id);
        const ah = this.actualHeightMap.get(id) ?? this.heightMap.get(id);
        this.setupThoughtElementForMultilineLayout(el, w, h, new Point(point.x, point.y), fontSizePercent, horizAlign, aw, ah);
    }
    
    layoutThought(node: LayoutNode, maxWidth: number, point: Point, isLeaf: boolean, horizAlign: ThoughtHorizontalAlignment, isIconOnRight: boolean, numberOfLines: number) {
        let rep = this.connector.thtReps.get(node.id);
        if(!rep) {
            console.log("ERROR: Could not find element with id: " + node.id);
            return;
        }
        let el = rep.thtEl;
        if (isLeaf) {
            if(el && el.children && el.children.length > 0 && el.children[0].children && el.children[0].children.length > 0) {
                let childEl = el.children[0]?.children[0] as HTMLElement;
                childEl.style.flexDirection = isIconOnRight ? "row-reverse" : "row";
            }
            let h = this.heightMap.get(node.id);
            if (h) {
                const w = this.widthMap.get(node.id) ?? maxWidth;
                const ah = this.actualHeightMap.get(node.id);
                const aw = this.actualWidthMap.get(node.id);
                let n = 1;
                if (h == this.connector.getRowHeightWithSpacing()) {
                    n = 1;
                } else {
                    n = Math.ceil(h / (this.connector.getRowHeightWithSpacing()));
                }
                if (n < 2) {
                    point = new Point(point.x, point.y);
                    this.setThoughtPosition_Center(el, point, 100, true, horizAlign);
                } else {
                    point = new Point(point.x, point.y);
                    this.setThoughtPosition_Multiline(el, w, n, point, 100, true, horizAlign);
                }
            }
            el.style.opacity = "1.0";
            el.style.fontSize = "100%";
        } else {
            if(el && el.children && el.children.length > 0 && el.children[0].children && el.children[0].children.length > 0) {
                let childEl = el.children[0]?.children[0] as HTMLElement;
                childEl.style.flexDirection = isIconOnRight ? "row-reverse" : "row";
            }
            this.setThoughtPosition_Multiline(el, maxWidth, numberOfLines, point, 100, true, horizAlign);
            el.style.opacity = "1.0";
            el.style.fontSize = "100%";
        }
    }

    layoutVerticalThoughts(activeThoughtId: string, thoughts: LayoutNode[], startY: number, direction: "up" | "down", activeWidth: number, centerX: number) {
        if (!thoughts || thoughts.length === 0) {
            return;
        }

        const columnCount = thoughts.length === 1 ? 1 : 2;
        const rowHeight = this.connector.getRowHeightWithSpacing();
        const horizontalPadding = this.COLUMN_PADDING_MULTIPLIER * rowHeight;

        // Calculate column parameters
        const effectiveColumnWidth = activeWidth / 2;
        const maxWidthPerThought = effectiveColumnWidth - horizontalPadding;

        // Calculate column centers (offset from centerX)
        const leftColumnX = centerX - activeWidth / 4 - horizontalPadding / 2;
        const rightColumnX = centerX + activeWidth / 4 + horizontalPadding / 2;

        let currentY = startY;
        let currentColumn = 0; // 0 = left, 1 = right
        let leftColumnRowCount = 0;
        let rightColumnRowCount = 0;

        thoughts.forEach((node: LayoutNode, index: number) => {
            let rep = this.connector.thtReps.get(node.id);
            if (!rep) {
                console.log("ERROR: Could not find element with id: " + node.id);
                return;
            }
            let el: HTMLElement = rep.thtEl;
            if (direction == "up") {
                rep.zone = "parent";
            } else if (direction == "down") {
                rep.zone = "jump";
            }

            // Determine which column and calculate position
            let columnX: number;
            if (columnCount === 1) {
                columnX = centerX;
            } else {
                // Fill left column first, then right column
                const rowsPerColumn = Math.ceil(thoughts.length / 2);
                if (index < rowsPerColumn) {
                    // Left column
                    columnX = leftColumnX;
                    currentY = startY + leftColumnRowCount * rowHeight;
                    leftColumnRowCount++;
                } else {
                    // Right column
                    columnX = rightColumnX;
                    if (index === rowsPerColumn) {
                        // Reset Y for right column
                        currentY = startY;
                        rightColumnRowCount = 0;
                    }
                    currentY = startY + rightColumnRowCount * rowHeight;
                    rightColumnRowCount++;
                }
            }

            let pt = new Point(columnX, currentY);

            // Setup thought element
            el.style.display = "block";
            el.style.opacity = "1.0";
            el.style.fontSize = "100%";
            el.style.maxWidth = (columnCount === 1 ? activeWidth : maxWidthPerThought) + "px";

            // Position the thought
            this.setThoughtPosition_Center(el, pt, 100, false, ThoughtHorizontalAlignment.Center);

            // Add primary link to active thought
            plexAnimator.addPrimaryLink(activeThoughtId, node.id);

            // Increment Y for single column mode
            if (columnCount === 1) {
                currentY += rowHeight;
            }
        });
    }

    // Populate gridPositionToThoughtId for parent/jump thoughts using the same
    // column layout logic as layoutVerticalThoughts (1 column if 1 thought, else 2 columns filled left-first).
    private populateVerticalGridPositions(thoughts: LayoutNode[], zone: string) {
        const columnCount = thoughts.length === 1 ? 1 : 2;
        thoughts.forEach((node: LayoutNode, index: number) => {
            let col: number, row: number;
            if (columnCount === 1) {
                col = 0;
                row = index;
            } else {
                const rowsPerColumn = Math.ceil(thoughts.length / 2);
                if (index < rowsPerColumn) {
                    col = 0;
                    row = index;
                } else {
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
