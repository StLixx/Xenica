import { Point } from "/_content/Venus/js/dist/geometry.js";
import { ThoughtHorizontalAlignment } from "./enums.js";
export function syncThoughtFontStyling(original, clone) {
    if (!original.isConnected) {
        return;
    }
    const originals = original.querySelectorAll(".thought-control");
    const clones = clone.querySelectorAll(".thought-control");
    const count = Math.min(originals.length, clones.length);
    for (let i = 0; i < count; i++) {
        const computed = window.getComputedStyle(originals[i]);
        clones[i].style.fontStyle = computed.fontStyle;
        clones[i].style.fontWeight = computed.fontWeight;
    }
}
export class BaseLayout {
    constructor(connector) {
        this.connector = connector;
    }
    moveCurToNewPositions(zone, isScrollEvent, x = 0, y = 0) {
    }
    getActiveZoneCenter() {
    }
    getActiveThoughtPosition() {
    }
    disappearOld(isScrollEvent) {
    }
    prepareDisappearOld(lastNode) {
    }
    replaceOldWithCur() {
    }
    onWheel(event) {
    }
    getCurvePoints(linkRelation, rectA, gateA, genA, thtAlignA, rectB, gateB, genB, thtAlignB, isSecondaryLink) {
        return [];
    }
    measureThoughtWithMaxWidth(tht, fontSizePercent, maxWidth) {
        tht.style.position = "absolute";
        let id = tht.id.substring(4, 40);
        let reusable = document.getElementById("measurer");
        reusable.style.cssText = '';
        reusable.style.minWidth = (maxWidth * 2) + "px";
        reusable.style.width = (maxWidth * 2) + "px";
        reusable.style.overflow = "visible";
        void reusable.offsetHeight;
        let htmlClone = tht.cloneNode(true);
        syncThoughtFontStyling(tht, htmlClone);
        htmlClone.style.display = "inline-block";
        htmlClone.style.width = "auto";
        htmlClone.style.height = "unset";
        htmlClone.style.minWidth = "0";
        htmlClone.style.minHeight = "0";
        htmlClone.style.maxHeight = "none";
        htmlClone.style.fontSize = fontSizePercent + "%";
        htmlClone.style.transition = "unset";
        htmlClone.style.position = "static";
        htmlClone.style.left = "0px";
        htmlClone.style.top = "0px";
        htmlClone.style.transform = "none";
        htmlClone.style.fontSize = fontSizePercent + "%";
        htmlClone.style.maxHeight = "unset";
        htmlClone.style.maxWidth = maxWidth + "px";
        htmlClone.classList.add("thought-control-wrap");
        reusable.appendChild(htmlClone);
        let thoughtControlElements = htmlClone.querySelectorAll(".thought-control");
        thoughtControlElements.forEach((el2, idx) => {
            el2.style.overflow = "visible";
            el2.style.opacity = "1.0";
            el2.style.border = htmlClone.style.border;
            el2.style.position = "static";
            el2.style.left = "0px";
            el2.style.top = "0px";
            el2.style.width = "auto";
            el2.style.maxWidth = "none";
            el2.style.minWidth = "0";
            let textWrapperElements = el2.querySelectorAll(".thought-control div");
            textWrapperElements.forEach((e) => {
                e.style.whiteSpace = "normal";
                e.style.overflowWrap = "break-word";
                e.style.textWrap = "balance";
                e.style.width = "auto";
                e.style.maxWidth = "none";
                e.style.minWidth = "0";
            });
        });
        void htmlClone.offsetHeight;
        const innerThoughtControl = thoughtControlElements.length > 0 ? thoughtControlElements[0] : null;
        let w = Math.ceil(htmlClone.getBoundingClientRect().width);
        let h = htmlClone.offsetHeight;
        h += 0.2 * this.connector.getRowHeightWithSpacing();
        if (innerThoughtControl) {
            const textEl = innerThoughtControl.querySelector('.narrow-text-when-narrow');
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
                    const textElStyle = window.getComputedStyle(textEl);
                    const textElPaddingX = parseFloat(textElStyle.paddingLeft || "0") + parseFloat(textElStyle.paddingRight || "0");
                    w = Math.ceil(maxLineWidth + Math.max(0, paddingDelta) + textElPaddingX);
                }
            }
        }
        let lineHeight = 0;
        const narrowTextEl = htmlClone.querySelector('.narrow-text-when-narrow');
        const lhEl = narrowTextEl !== null && narrowTextEl !== void 0 ? narrowTextEl : (thoughtControlElements.length > 0 ? thoughtControlElements[0] : null);
        if (lhEl) {
            const lh = parseFloat(window.getComputedStyle(lhEl).lineHeight);
            if (!isNaN(lh) && lh > 0)
                lineHeight = lh;
        }
        reusable.removeChild(htmlClone);
        reusable.style.cssText = '';
        return { w, h, lineHeight };
    }
    setThoughtPosition_Center(el, point, fontSizePercent, isYAtTop, horizAlign) {
        let p = this.getActiveZoneCenter();
        let x = point.x + p.x;
        let y = point.y + p.y;
        this.connector.setThoughtPosition(el, new Point(x, y), fontSizePercent, isYAtTop, horizAlign);
    }
    setupThoughtElementForMultilineLayout(el, maxWid, maxHeight, point, fontSizePercent, horizAlign, actualWidth, elementHeight) {
        const effectiveWidth = actualWidth !== null && actualWidth !== void 0 ? actualWidth : maxWid;
        el.style.width = effectiveWidth + "px";
        el.classList.add("thought-control-wrap");
        if (maxHeight > 0) {
            el.style.maxHeight = maxHeight + "px";
        }
        el.style.maxHeight = "unset";
        if (elementHeight !== undefined) {
            const adjustment = 0.2 * this.connector.getRowHeightWithSpacing();
            el.style.height = (elementHeight - adjustment) + "px";
        }
        el.style.overflow = "unset";
        this.setThoughtPosition_Center(el, point, 125, true, horizAlign);
        el.style.opacity = "1.0";
        el.style.fontSize = fontSizePercent + "%";
        if (horizAlign == ThoughtHorizontalAlignment.Right) {
            el.style.textAlign = "right";
        }
        else {
            el.style.textAlign = "left";
        }
        el.classList.add("multiline-wrap");
        let thoughtControlElements = el.querySelectorAll(".thought-control");
        thoughtControlElements.forEach((el2) => {
            el2.style.opacity = "1.0";
        });
    }
}
//# sourceMappingURL=baseLayout.js.map