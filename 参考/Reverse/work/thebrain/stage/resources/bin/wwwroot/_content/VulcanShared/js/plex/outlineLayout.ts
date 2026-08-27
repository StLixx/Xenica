// @ts-ignore
import {Collider, CubicCollider, LineCollider, PI, Point, Rect} from "/_content/Venus/js/dist/geometry.js"
// @ts-ignore
import {DomUtils} from "/_content/Venus/js/dist/domUtils.js"
import {ThoughtExpandDirection, ThoughtHorizontalAlignment} from "./enums.js";
import {LayoutNode} from "./layoutNode.js";
import {BaseLayout} from "./baseLayout.js";
import {ThoughtRep} from "./thoughtRep.js";
import {PlexConnector} from "./plexConnector.js";
import {plexAnimator} from "./plexAnimator.js";
import {LinkRep} from "./linkRep.js";
import {Relation} from "./core.js";
import {plexCanvas} from "./plexCanvas.js";

export class OutlineLayout extends BaseLayout {
    
    constructor(connector: PlexConnector) {
        super(connector);
    }

    xor(a: boolean, b: boolean): boolean {
        return (a || b) && !(a && b);
    }

    getCurvePoints(linkRelation: Relation,
                   rectA: Rect, gateA: Point, genA: number, thtAlignA: ThoughtHorizontalAlignment,
                   rectB: Rect, gateB: Point, genB: number, thtAlignB: ThoughtHorizontalAlignment,
                   isSecondaryLink: boolean): Point[] {
        let cx1 = gateA.x, cy1 = gateA.y, cx2 = gateB.x, cy2 = gateB.y;
        let x1 = gateA.x, y1 = gateA.y, x2 = gateB.x, y2 = gateB.y;

        let curveStrength = 0.7;
        // if the two thoughts are aligned, we need a minimum amount to ensure the curve sticks out
        let minControlDelta = rectA.height;

        let isAParentOfB = this.xor(linkRelation === Relation.Parent, genA > genB); // in case link direction is backwards, right?

        let xSign = Math.sign(x2 - x1);
        let ySign = Math.sign(y2 - y1);
        let controlDeltaX = Math.max(Math.floor(Math.abs(x1 - x2) * curveStrength + 0.5), minControlDelta);
        let controlDeltaY = Math.max(Math.floor(Math.abs(y1 - y2) * curveStrength + 0.5), minControlDelta);

        // children and jumps sort of match, parents are backwards which control point is affected
        if(!isSecondaryLink) {
            if (isAParentOfB) {
                if (genA < genB) {
                    cy1 -= ySign * controlDeltaY;
                    cx2 -= xSign * controlDeltaX;
                } else {
                    cx1 += xSign * controlDeltaX;
                    cy2 -= ySign * controlDeltaY;
                }
            } else {
                if (genA < genB) {
                    cy1 += ySign * controlDeltaY;
                    cx2 -= xSign * controlDeltaX;
                } else {
                    cx1 += xSign * controlDeltaX;
                    cy2 += ySign * controlDeltaY;
                }
            }
        }

        // if this is a secondary link and the thoughts are horizontally aligned, make the curve sideways
        if(isSecondaryLink && Math.abs(x1 - x2) < minControlDelta * 2) {
            if(x1 < 0) {
                cx1 += minControlDelta * 3;
                cx2 += minControlDelta * 3;
            }
            else {
                cx1 -= minControlDelta * 3;
                cx2 -= minControlDelta * 3;
            }
        } else if(isSecondaryLink) {
            // make nicely curved links that crisscross the screen
            cx1 += xSign * controlDeltaX;
            cx2 -= xSign * controlDeltaX;
        }
        // TODO fix secondary jump links too
        let points = [];
        points[0] = new Point(x1, y1);
        points[1] = new Point(cx1, cy1);
        points[2] = new Point(cx2, cy2);
        points[3] = new Point(x2, y2);
        return points;
    }

    moveCurToNewPositions(zoneIgnored: string, isScrollEvent: boolean, lastBackgroundDragX: number, lastBackgroundDragY: number) {
        if(this.connector.node == null) {
            console.log("ERROR: this.node is null");
            return;
        }
        let point = new Point(lastBackgroundDragX, lastBackgroundDragY);

        plexCanvas.gridPositionToThoughtId.clear();
        plexCanvas.outlineGroupOf.clear();

        let rep: ThoughtRep | undefined = this.connector.thtReps.get(this.connector.node.id);
        if(!rep) {
            console.log("ERROR: Could not find element with id: " + this.connector.node.id);
            return;
        }
        let el: HTMLElement = rep.thtEl;
        this.setThoughtPosition_Center(el, point, 125, false, ThoughtHorizontalAlignment.Center);
        el.style.opacity = "1.0";
        el.style.fontSize = "125%";
        const spacing = plexAnimator.thoughtSpacing || 1.0;
        this.layoutDownRight(1, this.connector.node, new Point(point.x + this.getColWidth(), point.y + this.connector.rowHeight * spacing));
        this.layoutUpLeft(1, this.connector.node, new Point(point.x - this.getColWidth(), point.y - this.connector.rowHeight * 1.5 * spacing));
        this.layoutDownLeft(1, this.connector.node, new Point(point.x - this.getColWidth(), point.y + this.connector.rowHeight * spacing));

        this.createOrUpdateZoneDivs();
    }

    // In Outline/MindMap layouts, the entire plex area is the child zone.
    // Position the child zone div to cover the full plex area and hide the others.
    createOrUpdateZoneDivs() {
        let fieldElement = document.getElementById("field");
        if(!fieldElement) {
            return;
        }

        let fieldRect: Rect = fieldElement.getBoundingClientRect();
        const hiddenZones = ["parent", "jump", "sibling", "active"];
        const fullZone = "child";

        // Position child zone to cover the entire plex area
        let childZoneDiv = document.querySelector(`.zone-${fullZone}`) as HTMLElement;
        if(childZoneDiv) {
            childZoneDiv.style.left = "0px";
            childZoneDiv.style.top = "0px";
            childZoneDiv.style.width = fieldRect.width + "px";
            childZoneDiv.style.height = fieldRect.height + "px";
        }

        // Hide other zone divs so they don't interfere
        hiddenZones.forEach(zone => {
            let zoneDiv = document.querySelector(`.zone-${zone}`) as HTMLElement;
            if(zoneDiv) {
                zoneDiv.style.left = "0px";
                zoneDiv.style.top = "0px";
                zoneDiv.style.width = "0px";
                zoneDiv.style.height = "0px";
            }
        });
    }

    disappearOld(ignoredIsScrollEvent: boolean) {
        let oldEls = this.connector.field.querySelectorAll(".tht.old") as NodeListOf<HTMLElement>;
        let seconds = this.connector.animationTime;
        oldEls.forEach((oldEl) => {
            oldEl.style.opacity = "0";
            oldEl.style.fontSize = "0";
            let thtIconEl = oldEl.querySelector(".tht-icon") as HTMLElement;
            if(thtIconEl) {
                let seconds = this.connector.animationTime;
                thtIconEl.style.transition = "height " + seconds + "s ease"; //, opacity " + seconds + "s ease";
                thtIconEl.style.height = "0px"; // make it shrink to nothing
            }
            oldEl.querySelectorAll(".indicator-icons img").forEach((el) => {
                let hel = el as HTMLElement;
                // Use the current computed height as the animation start for consistency across environments
                try {
                    const h = window.getComputedStyle(hel).height;
                    hel.style.height = h;
                } catch { hel.style.height = "100%"; }
                hel.style.transition = "height " + seconds + "s ease";
                hel.style.height = "0px"; // make it shrink to nothing
            });
            let str = oldEl.id.substring(4, oldEl.id.length - 4);
            let map = this.disappearOldMap;
            if(map && map.has(str)) {
                let pt: Point = map.get(str);
                DomUtils.centerAt(oldEl, pt);
            }
        });
    }

    disappearOldMap: Map<string, Point> | null = null;

    public prepareDisappearOld(lastNode: LayoutNode | null) {
        let parentMap = new Map<string, Point>();
        this.makeMap(lastNode!, parentMap);
        this.disappearOldMap = parentMap;
    }

    makeMap(node: LayoutNode, parentMap: Map<string, Point>) {
        if(node == null) {
            return;
        }
        let rep = this.connector.thtReps.get(node.id);
        if(!rep) {
            return;
        }
        let pt: Point = DomUtils.getCenter(rep!.thtEl, this.connector.field);
        node.children?.forEach((child: LayoutNode) => {
            parentMap.set(child.id, pt);
            this.makeMap(child, parentMap);
        });
        // these aren't always parents! (it's a parent in the Node tree, not a child or parent in TheBrain terms)
        node.parents?.forEach((parent: LayoutNode) => {
            parentMap.set(parent.id, pt);
            this.makeMap(parent, parentMap);
        });
    }

    replaceOldWithCur() {
        let generationMap = new Map<string, HTMLElement>();
        this.makeMap(this.connector.node!, generationMap);
        
        let oldEls = this.connector.field.querySelectorAll(".tht.old");
        oldEls.forEach((oldEl_) => {
            let oldEl = oldEl_ as HTMLElement;
            if(oldEl.style.display === "none") {
                return; // continue
            }
            let id = oldEl.id.substring(0, oldEl.id.length - 4);
            let newEl = document.getElementById(id + "-cur");
            if(newEl) {
                newEl.style.position = "absolute";
                newEl.style.top = oldEl.style.top;
                newEl.style.left = oldEl.style.left;
                newEl.style.display = "block";
                oldEl.remove();
            }
        });

        // now anything that was not previously here should appear from the thought that is being activated
        let appearFromEl = document.getElementById("tht-" + this.connector.activeId + "-cur");
        let cen: Point;
        if(!appearFromEl || appearFromEl.style.display === "none") {
            // wasn't there - appear from the center instead
            cen = this.getActiveZoneCenter();
        } else {
            cen = DomUtils.getCenter(appearFromEl, this.connector.field);
        }
        
        // put all new elements at the place they will appear from
        let newEls = document.querySelectorAll(".tht.cur");
        let n = 0;
        let seconds = this.connector.animationTime;
        newEls.forEach((newEl_) => {
            let newEl = newEl_ as HTMLElement;
            if(newEl.style.display === "none") {
                // APPEAR FROM PARENT?
                let pt = cen;
                let str = newEl.id.substring(4, newEl.id.length - 4);
                if(generationMap.has(str)) {
                    pt = generationMap.get(str);
                }
                newEl.style.display = "block"; // TODO: THIS SHOULD NOT BE DONE FOR THOUGHTS THAT WILL NEVER SHOW AS IT MAKES IT SLOW
                newEl.style.opacity = "0"; // this ensures that new thoughts that are appearing will animate from 0 opacity to full opacity
                // make thought icons appear from zero height and animate to the correct height
                let thtIconEl = newEl.querySelector(".tht-icon") as HTMLElement;
                if(thtIconEl) {
                    thtIconEl.style.height = "0"; // make thought icon disappear start from nothing
                    // NOTE: this is a hack to force the CSS animation height to be reset to zero as we just requested.
                    // This has been tested on Safari and Chrome
                    // DO NOT remove this hack
                    let height = window.getComputedStyle(thtIconEl).height; // this fixes the bug
                    thtIconEl.style.transition = "height "+seconds+"s ease";
                    // NOTE: keep this number 0.7 in sync with the CSS .tht-icon height in PlexControl.razor
                    thtIconEl.style.height = this.connector.rowHeight * 0.7 + "px";
                }
                DomUtils.centerAt(newEl, pt);
                n++;
            }
        });
    }

    public onWheel(event: WheelEvent) {
        let deltaPoint: Point = new Point(-event.deltaX, -event.deltaY);
        this.connector.backgroundDragged(deltaPoint, true);
    }

    public getActiveZoneCenter(): Point {
        let fieldRect: Rect = this.connector.field.getBoundingClientRect();
        let leftMargin: number = 0;
        if (this.connector.isSelectionPanelVisible()) {
            leftMargin = this.connector.getSelectionPanelWidth() * fieldRect.width;
        }
        let availableWidth = fieldRect.width - leftMargin;
        return new Point(leftMargin + availableWidth * 0.5, fieldRect.height * 0.4);
    }

    public getActiveThoughtPosition(): Point | null {
        let tht = document.getElementById("tht-" + this.connector.activeId + "-cur") as HTMLElement;
        if(tht == null) {
            return null;
        }
        let rect = Rect.fromElement(tht);
        let center = rect.getCenter();
        let fieldRect: Rect = this.connector.field.getBoundingClientRect();
        return new Point(center.x, center.y - fieldRect.top);
    }

    public getColWidth(): number {
        // As the screen width gets narrower (such as a phone in portrait mode), columns are extra narrow. Wider screens have much wider columns. It's very non-linear. 
        const w = this.connector.field.getBoundingClientRect().width;
        const rh = this.connector.rowHeight;
        let multiplier = Math.min(6, Math.max(2, w/200));
        let ret = rh * multiplier;
        return ret;
    }

    layoutDownLeft(gen: number, node: any, point: Point) {
        let y = point.y;
        let x = point.x - this.getColWidth();
        const spacing = plexAnimator.thoughtSpacing || 1.0;
        node.jumps.forEach((jump: LayoutNode, index: number) => {
            let rep = this.connector.thtReps.get(jump.id);
            if(!rep) {
                console.log("ERROR: Could not find element with id: " + jump.id);
                return;
            }
            rep.alignment = ThoughtHorizontalAlignment.Right;
            rep.expandDirection = ThoughtExpandDirection.Undefined;
            rep.generation = gen;
            plexAnimator.addPrimaryLink(node.id, jump.id);
            plexCanvas.outlineGroupOf.set(jump.id, {parentId: node.id, relationType: "jump"});
            plexCanvas.gridPositionToThoughtId.set(`${node.id}-jump-${index}`, jump.id);
            let el = rep.thtEl;
            this.setThoughtPosition_Center(el, new Point(point.x, y), 100, true, ThoughtHorizontalAlignment.Right);
            el.style.opacity = "1.0";
            el.style.fontSize = "100%";
            this.setChildOfElementToRowReverse(el);
            y += this.connector.rowHeight * spacing;
        });
        return y - point.y
    }

    layoutDownRight(gen: number, node: any, point: Point) {
        let y = point.y;
        let x = point.x + this.getColWidth();
        const spacing = plexAnimator.thoughtSpacing || 1.0;
        node.children.forEach((child: LayoutNode, index: number) => {
            let rep = this.connector.thtReps.get(child.id);
            if(!rep) {
                console.log("ERROR: Could not find element with id: " + child.id);
                return;
            }
            rep.alignment = ThoughtHorizontalAlignment.Left;
            rep.expandDirection = ThoughtExpandDirection.Child;
            rep.generation = gen;
            plexAnimator.addPrimaryLink(node.id, child.id);
            plexCanvas.outlineGroupOf.set(child.id, {parentId: node.id, relationType: "child"});
            plexCanvas.gridPositionToThoughtId.set(`${node.id}-child-${index}`, child.id);
            let el = rep.thtEl;
            this.setThoughtPosition_Center(el, new Point(point.x, y), 100, true, ThoughtHorizontalAlignment.Left);
            el.style.opacity = "1.0";
            el.style.fontSize = "100%";
            y += this.connector.rowHeight * spacing;
            if ((child.children ?? []).length > 0) {
                let dy = this.layoutDownRight(gen + 1, child, new Point(x, y));
                y += dy;
            }
        });
        return y - point.y
    }
    
    setChildOfElementToRowReverse(el :HTMLElement) {
        if(el && el.children && el.children.length > 0 && el.children[0].children && el.children[0].children.length > 0) {
            let childEl = el.children[0]?.children[0] as HTMLElement;
            if (childEl) {
                childEl.style.flexDirection = "row-reverse";
            }
        }
    }

    layoutUpLeft(gen: number, node: any, point: Point) {
        let y = point.y;
        let x = point.x - this.getColWidth();
        const spacing = plexAnimator.thoughtSpacing || 1.0;
        const parentCount = node.parents?.length ?? 0;
        node.parents.forEach((parent: LayoutNode, index: number) => {
            let rep = this.connector.thtReps.get(parent.id);
            if(!rep) {
                console.log("ERROR: Could not find element with id: " + parent.id);
                return;
            }
            rep.alignment = ThoughtHorizontalAlignment.Right;
            rep.expandDirection = ThoughtExpandDirection.Parent;
            rep.generation = gen;
            plexAnimator.addPrimaryLink(node.id, parent.id);
            plexCanvas.outlineGroupOf.set(parent.id, {parentId: node.id, relationType: "parent"});
            // Reverse grid index so it matches visual top-to-bottom order
            // (layoutUpLeft places index 0 at the bottom, last at the top)
            plexCanvas.gridPositionToThoughtId.set(`${node.id}-parent-${parentCount - 1 - index}`, parent.id);
            let el = rep.thtEl;
            this.setThoughtPosition_Center(el, new Point(point.x, y), 100, false, ThoughtHorizontalAlignment.Right);
            el.style.opacity = "1.0";
            el.style.fontSize = "100%";
            this.setChildOfElementToRowReverse(el);
            y -= this.connector.rowHeight * spacing;
            if ((parent.parents ?? []).length > 0) {
                let dy = this.layoutUpLeft(gen + 1, parent, new Point(x, y));
                y += dy;
            }
        });
        return y - point.y
    }

}
