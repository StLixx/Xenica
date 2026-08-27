// @ts-ignore
import {Collider, CubicCollider, LineCollider, PI, Point, Rect} from "/_content/Venus/js/dist/geometry.js"
import {PlexConnector} from "./plexConnector.js";
import {LayoutNode} from "./layoutNode.js";
import {Relation} from "./core.js";
import {ThoughtHorizontalAlignment} from "./enums.js"; 
import {plexAnimator} from "./plexAnimator.js";

// Sync the font-style and font-weight of every .thought-control descendant from
// `original` onto its index-paired counterpart in `clone`, so that the cloned
// element used for measurement reflects the styling the user will actually see.
// Italic and bold are width-affecting; without this resync, clone-based width
// measurements can be too narrow and cause the rendered text to wrap.
export function syncThoughtFontStyling(original: HTMLElement, clone: HTMLElement): void {
    if(!original.isConnected) {
        // Computed style on detached nodes returns empty strings; skip rather
        // than clobber the clone's existing inline style with empties.
        return;
    }
    const originals = original.querySelectorAll(".thought-control") as NodeListOf<HTMLElement>;
    const clones = clone.querySelectorAll(".thought-control") as NodeListOf<HTMLElement>;
    const count = Math.min(originals.length, clones.length);
    for(let i = 0; i < count; i++) {
        const computed = window.getComputedStyle(originals[i]);
        clones[i].style.fontStyle = computed.fontStyle;
        clones[i].style.fontWeight = computed.fontWeight;
    }
}

export class BaseLayout {

    protected connector: PlexConnector;

    constructor(connector: PlexConnector) {
        this.connector = connector;
    }

    public moveCurToNewPositions(zone: string, isScrollEvent: boolean, x: number = 0, y: number = 0) {
    }

    public getActiveZoneCenter(): Point {
    }

    public getActiveThoughtPosition(): Point | null {
    }

    public disappearOld(isScrollEvent: boolean) {
    }

    public prepareDisappearOld(lastNode: LayoutNode | null) {
    }

    public replaceOldWithCur() {
    }

    public onWheel(event: WheelEvent) {
    }

    getCurvePoints(linkRelation: Relation,
                   rectA: Rect, gateA: Point, genA: number, thtAlignA: ThoughtHorizontalAlignment,
                   rectB: Rect, gateB: Point, genB: number, thtAlignB: ThoughtHorizontalAlignment,
                   isSecondaryLink: boolean): Point[] {
        return [];
    }
    
    measureThoughtWithMaxWidth(tht: HTMLElement, fontSizePercent: number, maxWidth: number): { w: number, h: number, lineHeight: number } {
        tht.style.position = "absolute";
        let id = tht.id.substring(4, 40);
        // This hack seems to work reliably to find out the new width and height of the final element
        // so we can center it. Without this hack, the current starting animation fontsize causes
        // offsetWidth and offsetHeight to return the wrong width and height, even zero.
        // Note the measurer element lives in PlexControl, and is not invisible, it just has zero opacity.
        let reusable = document.getElementById("measurer") as HTMLElement;
        reusable.style.cssText = ''; // Clear any accumulated styles
        // Ensure the measurer has enough space and isn't constrained by parent containers
        reusable.style.minWidth = (maxWidth * 2) + "px";
        reusable.style.width = (maxWidth * 2) + "px";
        reusable.style.overflow = "visible";
        void reusable.offsetHeight; // Force reflow on measurer itself
        let htmlClone = tht.cloneNode(true) as HTMLElement;
        syncThoughtFontStyling(tht, htmlClone);
        // AGGRESSIVELY CLEAR all size constraints on clone
        htmlClone.style.display = "inline-block";
        htmlClone.style.width = "auto";
        htmlClone.style.height = "unset";
        htmlClone.style.minWidth = "0";
        htmlClone.style.minHeight = "0";
        htmlClone.style.maxHeight = "none";
        htmlClone.style.fontSize = fontSizePercent + "%";
        htmlClone.style.transition = "unset";
        // Clear any positioning that might constrain layout
        htmlClone.style.position = "static";
        htmlClone.style.left = "0px";
        htmlClone.style.top = "0px";
        htmlClone.style.transform = "none";
        //
        htmlClone.style.fontSize = fontSizePercent + "%";
        htmlClone.style.maxHeight = "unset";
        htmlClone.style.maxWidth = maxWidth + "px";
        htmlClone.classList.add("thought-control-wrap");
        reusable.appendChild(htmlClone);
        
        let thoughtControlElements = htmlClone.querySelectorAll(".thought-control") as NodeListOf<HTMLElement>;
        thoughtControlElements.forEach((el2, idx) => {
            el2.style.overflow = "visible";
            el2.style.opacity = "1.0";
            el2.style.border = htmlClone.style.border;
            // Clear any positioning or width constraints that might have been copied from the original
            el2.style.position = "static";
            el2.style.left = "0px";
            el2.style.top = "0px";
            el2.style.width = "auto";
            el2.style.maxWidth = "none";
            el2.style.minWidth = "0";
            // get the great-grandchild of newElement, which wraps the text
            let textWrapperElements = el2.querySelectorAll(".thought-control div") as NodeListOf<HTMLElement>;
            textWrapperElements.forEach((e) => {
                e.style.whiteSpace = "normal";
                e.style.overflowWrap = "break-word";
                e.style.textWrap = "balance";
                // Clear any width constraints on text wrappers too
                e.style.width = "auto";
                e.style.maxWidth = "none";
                e.style.minWidth = "0";
            });
        });
        void htmlClone.offsetHeight; // Force reflow by reading a layout property
        // Measure the wrapper width (inline-block shrinks to content)
        const innerThoughtControl = thoughtControlElements.length > 0 ? thoughtControlElements[0] : null;
        let w = Math.ceil(htmlClone.getBoundingClientRect().width);
        let h = htmlClone.offsetHeight;
        h += 0.2 * this.connector.getRowHeightWithSpacing();
        // Shrink width to fit the actual balanced line widths
        // Use clone wrapper width for paddingDelta so wrapper-to-inner gap is included
        if (innerThoughtControl) {
            const textEl = innerThoughtControl.querySelector('.narrow-text-when-narrow') as HTMLElement;
            if (textEl) {
                const range = document.createRange();
                range.selectNodeContents(textEl);
                const rects = range.getClientRects();
                let maxLineWidth = 0;
                for (let i = 0; i < rects.length; i++) {
                    maxLineWidth = Math.max(maxLineWidth, rects[i].width);
                }
                if (maxLineWidth > 0) {
                    const paddingDelta = htmlClone.getBoundingClientRect().width - textEl.getBoundingClientRect().width;
                    // textEl's own horizontal padding (e.g. padding-inline-end: 0.15em for italic
                    // overhang) is INSIDE textEl.width, so paddingDelta misses it. Range.getClientRects
                    // returns rects of the text content, which also exclude that padding. Without
                    // adding it back, the rendered textEl ends up with that much less content space
                    // than the measurement assumed, causing italic text to wrap an extra line.
                    const textElStyle = window.getComputedStyle(textEl);
                    const textElPaddingX = parseFloat(textElStyle.paddingLeft || "0") + parseFloat(textElStyle.paddingRight || "0");
                    w = Math.ceil(maxLineWidth + Math.max(0, paddingDelta) + textElPaddingX);
                }
            }
        }
        // Read the clone's target line-height before destroying it. The clone has
        // `transition: "unset"`, so its font-size is locked at the target value
        // (fontSizePercent) with no in-flight transition — the resolved line-height
        // (px) reflects the *settled* render state, even when the live element is
        // still animating font-size toward its target.
        let lineHeight = 0;
        const narrowTextEl = htmlClone.querySelector('.narrow-text-when-narrow') as HTMLElement | null;
        const lhEl = narrowTextEl ?? (thoughtControlElements.length > 0 ? thoughtControlElements[0] : null);
        if (lhEl) {
            const lh = parseFloat(window.getComputedStyle(lhEl).lineHeight);
            if (!isNaN(lh) && lh > 0) lineHeight = lh;
        }
        reusable.removeChild(htmlClone);
        //
        reusable.style.cssText = '';
        //
        return {w, h, lineHeight};
    }
    
    setThoughtPosition_Center(el: HTMLElement, point: Point, fontSizePercent: number, isYAtTop: boolean, horizAlign: ThoughtHorizontalAlignment) {
        let p = this.getActiveZoneCenter();
        let x = point.x + p.x;
        let y = point.y + p.y;
        this.connector.setThoughtPosition(el, new Point(x, y), fontSizePercent, isYAtTop, horizAlign);
    }
    
    setupThoughtElementForMultilineLayout(el: HTMLElement, maxWid: number, maxHeight: number, point: Point, fontSizePercent: number, horizAlign: ThoughtHorizontalAlignment, actualWidth?: number, elementHeight?: number) {
        const effectiveWidth = actualWidth ?? maxWid;

        // Set width on the outer wrapper to constrain it
        el.style.width = effectiveWidth + "px";

        el.classList.add("thought-control-wrap");
        if (maxHeight > 0) {
            el.style.maxHeight = maxHeight + "px";
        }
        el.style.maxHeight = "unset";

        // Set height if provided by the caller
        if (elementHeight !== undefined) {
            const adjustment = 0.2 * this.connector.getRowHeightWithSpacing();
            el.style.height = (elementHeight - adjustment) + "px";
        }

        el.style.overflow = "unset"; // fix icon clipping issue for thought in the middle that will never need to be clipped...

        this.setThoughtPosition_Center(el, point, 125, true, horizAlign);

        el.style.opacity = "1.0";
        el.style.fontSize = fontSizePercent + "%";
        if (horizAlign == ThoughtHorizontalAlignment.Right) {
            el.style.textAlign = "right";
        } else {
            el.style.textAlign = "left";
        }
        // Use CSS class for multiline wrapping instead of inline styles so that
        // removing the class cleanly reverts to .tht's white-space: nowrap
        el.classList.add("multiline-wrap");
        let thoughtControlElements = el.querySelectorAll(".thought-control") as NodeListOf<HTMLElement>;
        thoughtControlElements.forEach((el2) => {
            el2.style.opacity = "1.0";
        });
    }
    
}
