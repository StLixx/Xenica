import {plexCanvas} from "./plexCanvas.js";
import {Scrollbar} from "./scrollbar.js";
// @ts-ignore
import {Collider, CubicCollider, LineCollider, PI, Point, Rect} from "/_content/Venus/js/dist/geometry.js"
// @ts-ignore
import {DomUtils} from "/_content/Venus/js/dist/domUtils.js"
import {safeInvoke} from "../interop.js";
import {BaseLayout, syncThoughtFontStyling} from "./baseLayout.js";
import {ThoughtHorizontalAlignment} from "./enums.js";
import {Relation} from "./core.js";
import {PlexConnector} from "./plexConnector.js";
import {plexAnimator} from "./plexAnimator.js";
import {ThoughtRep} from "./thoughtRep.js";
import {LayoutNode} from "./layoutNode.js";
import {OneZoneRange} from "./zoneRanges.js";

export class NormalLayout extends BaseLayout {

    MIN_COLUMN_WIDTH = 240; // width in pixels
    COL_GAP = 8;
    ZONE_SPACING = 16; // pixels to keep between child zone and jump/sibling zones (base, before scaling)

    // Scaled zone spacing — grows with both font size and thought spacing so all zone gaps
    // stay proportional to text size and the user's vertical spacing preference.
    private getScaledZoneSpacing(): number {
        const fontScale = Math.max(plexAnimator.plexThoughtFontSize, 50) / 100;
        const spacingMult = plexAnimator.thoughtSpacing || 1.0;
        return this.ZONE_SPACING * fontScale * spacingMult;
    }
    public static SCROLLBAR_SIZE = 18;

    extraGeneration: boolean = false;
    
    thoughtFinalLocMap: Map<string, Point> = new Map<string, Point>();
    thoughtFinalLocMapPrevious: Map<string, Point> = new Map<string, Point>();
    
    constructor(connector: PlexConnector, extraGeneration: boolean) {
        super(connector);
        this.extraGeneration = extraGeneration;
        // Clean up any existing zone divs from previous instances
        this.removeZoneDivs();
    }

    // Ported from LinkRep.cs Oct 18, 2022
    getCurvePoints(linkRelation: Relation,
                           rectA: Rect, gateA: Point, genA: number, thtAlignA: ThoughtHorizontalAlignment,
                           rectB: Rect, gateB: Point, genB: number, thtAlignB: ThoughtHorizontalAlignment,
                           isSecondaryLink: boolean) {
        let cx1 = gateA.x, cy1 = gateA.y, cx2 = gateB.x, cy2 = gateB.y;
        let x1 = gateA.x, y1 = gateA.y, x2 = gateB.x, y2 = gateB.y;

        let curveStrength = 0.7;
        // if the two thoughts are aligned, we need a minimum amount to ensure the curve sticks out
        let minControlDelta = this.connector.getRowHeightWithSpacing();
        let controlDelta = 0;
        switch(linkRelation) {
            case Relation.Unknown:
                // for LinkRelation.Na, used for Mindmap style!
                // not implementing this
                break;
            case Relation.Child:
                controlDelta = Math.max(Math.floor(Math.abs(y1 - y2) * curveStrength + 0.5), minControlDelta);
                cy1 += controlDelta;
                cy2 -= controlDelta;
                // if this is a secondary link and the thoughts are horizontally aligned, make the curve go right
                if(isSecondaryLink && Math.abs(x1 - x2) < minControlDelta * 2) {
                    cx1 += minControlDelta * 2;
                    cx2 += minControlDelta * 2;
                }
                break;
            case Relation.Parent:
                controlDelta = Math.max(Math.floor(Math.abs(y1 - y2) * curveStrength + 0.5), minControlDelta);
                cy1 -= controlDelta;
                cy2 += controlDelta;
                // if this is a secondary link and the thoughts are horizontally aligned, make the curve go left
                if(isSecondaryLink && Math.abs(x1 - x2) < minControlDelta * 2) {
                    cx1 -= minControlDelta * 2;
                    cx2 -= minControlDelta * 2;
                }
                break;
            case Relation.Jump:
                controlDelta = Math.max(Math.floor(Math.abs(x1 - x2) * curveStrength + 0.5), minControlDelta);
                // the side of the jump gate is not predictable - test which side it is on before modifying
                if(x1 > rectA.getCenter().x) {
                    cx1 += controlDelta;
                } else {
                    cx1 -= controlDelta;
                }
                if(x2 > rectB.getCenter().x) {
                    cx2 += controlDelta;
                } else {
                    cx2 -= controlDelta;
                }
                // if this is a secondary link and the thoughts are vertically aligned, make the curve go upward
                if(isSecondaryLink && Math.abs(y1 - y2) < minControlDelta * 2) {
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
    
    public moveCurToNewPositions(zone: string, isScrollEvent: boolean) {
        let dryLayout = false; //true;
        //console.time("moveCurToNewPositions");
        //this.thoughtFinalLocMapPrevious = new Map<string, Point>(this.thoughtFinalLocMap);
        this.thoughtFinalLocMap.clear();
        this.connector.lastActiveDestX = undefined;
        this.connector.lastActiveDestY = undefined;
        this.connector.markOffscreenAsCur(zone);
        this.connector.lastNormalLayoutThoughtPoints = {};

        // Clear grid navigation cache for fresh layout
        if (zone === "all") {
            plexCanvas.gridPositionToThoughtId.clear();
        } else {
            // Clear cache entries for the specific zone being re-laid out
            const keysToDelete: string[] = [];
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
        plexCanvas.setScrollbarsToDraw(Object.values(this.connector.zoneScrollbars) as Scrollbar[]);
        
        this.createOrUpdateZoneDivs(false);
        
        //console.timeEnd("moveCurToNewPositions");
    }

    positionActiveThought() {
        let tht = document.getElementById("tht-" + this.connector.activeId + "-cur") as HTMLElement;
        if(tht == null) {
            this.connector.logInfo("positionActiveThought did not find active thought.");
            return;
        }
        let fieldRect: Rect = this.connector.field.getBoundingClientRect();
        let activeZoneWidth = this.getZoneRect("active", fieldRect).width;

        let maxWidth = activeZoneWidth - this.COL_GAP * 2;
        tht.style.display = "block";
        tht.style.pointerEvents = "";
        tht.classList.remove("overflow-hidden-resize");

        // Reset to a known baseline BEFORE measurement so consecutive calls (e.g. from
        // ResizeObserver firing every frame during the plex-container CSS transition)
        // produce identical m.h. webkit-line-clamp / max-height / explicit width from a
        // prior call would otherwise bleed into measureThoughtWithMaxWidth's clone via
        // cloneNode and clip the measured height.
        tht.style.width = "";
        tht.style.maxWidth = "";
        tht.style.maxHeight = "";
        tht.style.overflow = "";
        tht.style.height = "";
        const textEl = tht.querySelector('.narrow-text-when-narrow') as HTMLElement | null;
        if (textEl) {
            textEl.style.display = '';
            textEl.style.overflow = '';
            textEl.style.removeProperty('-webkit-box-orient');
            textEl.style.removeProperty('-webkit-line-clamp');
        }
        // Also reset icon padding-top / alignSelf left over from a prior call —
        // these affect the live element's flex layout (and would inflate the
        // measureThoughtWithMaxWidth clone's height for icon-dominated thoughts).
        const iconDivReset = tht.querySelector('.flex-shrink-0') as HTMLElement | null;
        if (iconDivReset) {
            iconDivReset.style.paddingTop = '';
            iconDivReset.style.alignSelf = '';
        }

        let m = this.measureThoughtWithMaxWidth(tht, 125, maxWidth);
        let singleLineHeight = this.connector.rowHeight;
        let isMultiline = m.h > singleLineHeight * 1.3;
        let w2 = Math.min(m.w, maxWidth);

        this.setupThoughtElementForMultilineLayout(tht, w2, -1, new Point(0, 0), 125, ThoughtHorizontalAlignment.Center);

        // For single-line thoughts, use maxWidth instead of width so the element
        // shrink-wraps to its content during the font-size transition animation.
        // setupThoughtElementForMultilineLayout sets an explicit width for text
        // wrapping/balancing, but single-line thoughts don't need it.
        if(!isMultiline) {
            tht.style.width = "";
            tht.style.maxWidth = maxWidth + "px";
        }

        // For top-pinned expanded layout (no children, long text), we use singleLineHeight
        // as the half-height for positioning instead of h2/2 so the top edge stays fixed
        // at the same position as the 2-line case and content only grows downward.
        let halfHeightForPositioning: number | null = null;

        // Default half-height used for vertical centering on the active-zone center.
        // When content is line-clamped below we replace this with the visible (clamped)
        // half height so the *rendered* box (not the un-clamped content) is centered.
        const h2 = m.h - 0.2 * this.connector.getRowHeightWithSpacing();
        let halfHeightForCentering = h2 / 2.0;

        if (isMultiline) {
            const hasChildren = this.connector.nodeChildrenIds && this.connector.nodeChildrenIds.size > 0;
            let maxH = singleLineHeight * 2.0;

            if (!hasChildren) {
                // No children: allow the active thought to grow toward the bottom of the Plex.
                const fieldRect: Rect = this.connector.field.getBoundingClientRect();
                const cen = this.getActiveZoneCenter();
                // childZoneRect.bottom() === bottom of Plex (accounts for past-thoughts margin
                // and CSS transition height parsing already done inside getZoneRect).
                const childZoneRect = this.getZoneRect("child", fieldRect);
                const bottomBoundary = childZoneRect.bottom() - this.getScaledZoneSpacing();
                const expandedMaxH = bottomBoundary - (cen.y - singleLineHeight);
                maxH = Math.max(singleLineHeight * 2.0, Math.min(m.h, expandedMaxH));

                if (m.h > singleLineHeight * 2.0) {
                    // Pin the top edge at the same position as the 2-line case:
                    // top = topNum - singleLineHeight (instead of topNum - h2/2).
                    halfHeightForPositioning = singleLineHeight;
                }
            }

            // Compute the visible (rendered) height deterministically from the
            // target line-height and clamp count. We DO NOT use tht.offsetHeight —
            // during the activation call the live element's styles are still
            // settling (font-size transition, line-clamp not yet rendered), so
            // offsetHeight returns a transient value that differs from the eventual
            // settled height. That mismatch caused the post-navigation mousedown
            // jump: the activation call computed top from a too-small visibleH,
            // and the first onResize call read the settled (larger) visibleH and
            // re-positioned a few px upward. Computing visibleH from CSS
            // line-height (which reflects the *target* font-size, not mid-transition
            // values) makes both calls produce identical positions.
            let visibleH = m.h; // default when not clamped
            if (m.h > maxH) {
                tht.style.overflow = "hidden";
                tht.style.maxHeight = maxH + "px";
                visibleH = maxH; // fallback if we couldn't read line-height
                // m.lineHeight is the *target* line-height in px, read from the
                // clone in measureThoughtWithMaxWidth (which has transition:unset,
                // so font-size is locked at the target). Reading from the live
                // textEl here would return a transient value because the live
                // element's font-size is mid-transition during activation, which
                // produced a 5px jump between activation and the first onResize.
                if (textEl && m.lineHeight > 0) {
                    const clampLines = Math.max(1, Math.floor(maxH / m.lineHeight));
                    textEl.style.display = '-webkit-box';
                    textEl.style.setProperty('-webkit-box-orient', 'vertical');
                    textEl.style.setProperty('-webkit-line-clamp', String(clampLines));
                    textEl.style.overflow = 'hidden';
                    visibleH = Math.min(maxH, clampLines * m.lineHeight);
                }
            }
            // else: overflow is already "unset" from setupThoughtElementForMultilineLayout

            // Center the icon within the visible height using padding-top on the
            // icon container. align-self:flex-start anchors it at the top, then
            // padding-top shifts its visual center to the midpoint of the visible
            // area. Use the computed visibleH (not offsetHeight) for the same
            // reason as above.
            const iconDiv = tht.querySelector('.flex-shrink-0') as HTMLElement;
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

        // Compute the target top directly from the active-zone center rather than
        // parseFloat'ing the top that setupThoughtElementForMultilineLayout just wrote —
        // that round-trip depends on a value the browser may not have committed yet
        // during fast resize bursts, which breaks idempotency. halfHeightForCentering
        // tracks the *visible* (rendered, post-clamp) half-height so the rendered box
        // is vertically centered on the active-zone center even when the un-clamped
        // content would have been taller.
        const activeCenter = this.getActiveZoneCenter();
        tht.style.top = (activeCenter.y - (halfHeightForPositioning ?? halfHeightForCentering)) + "px";

        // Bounce effect: scale overshoot then settle, simulating the thought jumping toward the user.
        // Uses transform: scale() via CSS @keyframes so it scales from the element's center.
        // Only bounce when this thought is newly activated, not during scroll/resize/relayout.
        const seconds = this.connector.animationTime;
        const isNewActivation = this.connector.activeId !== this.connector.lastActiveId;
        if(seconds > 0 && isNewActivation) {
            tht.style.transformOrigin = "center";
            tht.style.zIndex = "10";
            tht.style.animation = "activeThoughtBounce " + seconds + "s ease-in-out forwards";
            tht.addEventListener("animationend", () => {
                tht.style.animation = "";
                tht.style.zIndex = "5";
            }, { once: true });
        }
    }

    positionParentThoughts(isScrollEvent: boolean, dryLayout: boolean) {
        let thtElements = this.connector.getThoughtElements('.tht.cur', this.connector.nodeParentsIds);
        let maxColumnCount = thtElements.length === 1 ? 1 : 6;
        this.layoutThoughts(dryLayout, thtElements, isScrollEvent, "parent", "bottom", maxColumnCount, false, "top");
    }

    positionChildThoughts(isScrollEvent: boolean, dryLayout: boolean) {
        let thtElements = this.connector.getThoughtElements('.tht.cur', this.connector.nodeChildrenIds);
        let maxColumnCount = thtElements.length === 1 ? 1 : 8;
        this.layoutThoughts(dryLayout, thtElements, isScrollEvent, "child", "top", maxColumnCount, false, "bottom");
    }

    positionJumpThoughts(isScrollEvent: boolean, dryLayout: boolean) {
        let thtElements = this.connector.getThoughtElements('.tht.cur', this.connector.nodeJumpsIds);
        this.layoutThoughts(dryLayout, thtElements, isScrollEvent, "jump", "bottom", 1, true, "left");
    }

    positionSiblingThoughts(isScrollEvent: boolean, dryLayout: boolean) {
        let thtElements = this.connector.getThoughtElements('.tht.cur', this.connector.nodeSiblingsIds);
        this.layoutThoughts(dryLayout, thtElements, isScrollEvent, "sibling", "bottom", 1, true, "right");
    }

    public getActiveZoneCenter(): Point {
        let fieldRect: Rect = this.connector.field.getBoundingClientRect();
        let rect = this.getZoneRect("active", fieldRect);
        return rect.getCenter();
    }

    // [x0, y0, x1, y1]
    zoneToLineIndices: Record<string, number[]> = {
        "parent": [1, 0, 2, 1],
        "active": [1, 2, 2, 3],
        "sibling": [2, 0, 3, 4],
        "jump": [0, 0, 1, 4],
        "child": [0, 5, 3, 6],
    };
    
    getDragZoneRect(zone: string, fieldRect: Rect): Rect {
        let rect = this.getZoneRect(zone, fieldRect);
        if (zone === "parent") {
            rect = new Rect(rect.x, rect.y, rect.width, rect.height + plexAnimator.rowHeight * 0.5);
        } else if (zone === "jump" || zone === "siblings") {
            rect = new Rect(rect.x, rect.y, rect.width, rect.height + plexAnimator.rowHeight * 0.25);
        } else if (zone === "child") {
            rect = new Rect(rect.x, rect.y - plexAnimator.rowHeight * 0.5, rect.width, rect.height + plexAnimator.rowHeight * 0.25);
        }
        return rect;
    }

    getZoneRect(zone: string, fieldRect: Rect): Rect {
        let w = fieldRect.width;
        let h = fieldRect.height;
        
        // Special handling for CSS transitions during window resize
        // The container has a 350ms CSS transition, so during resize, getBoundingClientRect() returns
        // the transitioning dimensions, not the final dimensions. This causes layout calculations to be
        // incorrect until the transition completes.
        // To fix this, we calculate the target dimensions from the style attribute instead of using
        // the current computed values.
        const plexContainer = document.getElementById("plexContainer");
        if (plexContainer) {
            // Get the target height from the inline style (where the transition is heading)
            // Unfortunately, there's no browser API to get the destination of a CSS transition,
            // so we have to parse the style string ourselves
            const inlineStyle = plexContainer.style.height;
            
            // Handle height for both top and left positioned plex
            if (inlineStyle) {
                if (inlineStyle.includes('dvh')) {
                    // Extract dvh value and calculate target height
                    const dvhMatch = inlineStyle.match(/(\d+(?:\.\d+)?)dvh/);
                    if (dvhMatch) {
                        const dvhValue = parseFloat(dvhMatch[1]);
                        const targetHeight = (dvhValue / 100) * window.innerHeight;
                        h = targetHeight;
                    }
                } else if (inlineStyle.includes('calc')) {
                    // Handle calc() expressions like "calc(100dvh - 56px)"
                    const calcMatch = inlineStyle.match(/calc\((\d+(?:\.\d+)?)dvh\s*-\s*(\d+)px\)/);
                    if (calcMatch) {
                        const dvhValue = parseFloat(calcMatch[1]);
                        const pixelOffset = parseFloat(calcMatch[2]);
                        const targetHeight = (dvhValue / 100) * window.innerHeight - pixelOffset;
                        h = targetHeight;
                    }
                } else if (inlineStyle === '100%') {
                    // For left position with 100% height, use the parent container height
                    const parentRect = plexContainer.parentElement?.getBoundingClientRect();
                    if (parentRect) {
                        h = parentRect.height;
                    }
                }
            }
            
            // Handle width for left positioned plex
            const widthStyle = plexContainer.style.width;
            if (widthStyle && widthStyle.includes('%') && !widthStyle.includes('100%')) {
                // Extract percentage and calculate target width
                const widthMatch = widthStyle.match(/(\d+(?:\.\d+)?)%/);
                if (widthMatch) {
                    const widthPercent = parseFloat(widthMatch[1]);
                    const parentRect = plexContainer.parentElement?.getBoundingClientRect();
                    if (parentRect) {
                        const targetWidth = (widthPercent / 100) * parentRect.width;
                        w = targetWidth;
                    }
                }
            }
        }
        
        let topMargin: number = 0;
        let pinsElement = document.getElementsByClassName("pinned-thoughts-list-container")[0] as HTMLElement;
        if (pinsElement) {
            topMargin = pinsElement.clientHeight;
        }
        let bottomMargin: number = 0;
        let ptlElement = document.getElementsByClassName("past-thoughts-list-container")[0] as HTMLElement;
        if (ptlElement) {
            bottomMargin = ptlElement.clientHeight;
        }
        // Account for the UserActionBar floating above the bottom of the field
        const actionBarEl = document.getElementById("bottom-toolbar-section")?.parentElement;
        if (actionBarEl) {
            const actionBarTop = actionBarEl.getBoundingClientRect().top - fieldRect.top;
            const actionBarMargin = h - actionBarTop + 4; // 4px gap above the bar
            if (actionBarMargin > bottomMargin) {
                bottomMargin = actionBarMargin;
            }
        }
        
        // Account for selection panel on the left
        let leftMargin: number = 0;
        if (this.connector.isSelectionPanelVisible()) {
            leftMargin = this.connector.getSelectionPanelWidth() * w;
        }
        
        // Vertical center of the active thought, as a fraction of field height (0..1).
        const c = plexAnimator.normalCenterRatio;

        // Scale zone spacing by both text scale and thought spacing so all zone gaps grow
        // together with larger text and with the user's vertical spacing preference.
        const zoneSpacing = this.getScaledZoneSpacing();

        // c*h is the vertical center of the active thought. All other zone boundaries
        // are placed relative to it. Non-extraGeneration offsets are shifted by -4.25
        // from the legacy values; extraGeneration offsets are shifted by -7.35.
        let horizontalLines: number[] = [
            0.25 * zoneSpacing + topMargin, //0 = top of Plex
            c * h - (this.extraGeneration ? 4.65 : 3.25)
                           * zoneSpacing,          //1 = bottom of parent zone
            c * h - (this.extraGeneration ? 1.65 : 1.75)
                           * zoneSpacing,          //2 = top of active zone
            c * h - (this.extraGeneration ? -1.65 : -1.75)
                           * zoneSpacing,          //3 = bottom of active zone
            c * h - (this.extraGeneration ? -4.95 : -3.25)
                           * zoneSpacing,          //4 = bottom of jump and sibling zones
            c * h - (this.extraGeneration ? -6.95 : -3.25)
                           * zoneSpacing,          //5 = top of child zone
            1.00 * h - bottomMargin];             //6 = bottom of Plex

        // Adjust vertical lines to account for selection panel
        let availableWidth = w - leftMargin;
        let verticalLines: number[] = [
            leftMargin, 
            leftMargin + 0.25 * availableWidth, 
            leftMargin + 0.75 * availableWidth, 
            leftMargin + availableWidth
        ];

        // set the rectangle from the bounds of the field divided up mathematically
        let indices = this.zoneToLineIndices[zone];
        let zr: Rect = new Rect(verticalLines[indices[0]], horizontalLines[indices[1]],
            verticalLines[indices[2]] - verticalLines[indices[0]],
            horizontalLines[indices[3]] - horizontalLines[indices[1]]);

        // Extend jump and sibling zones to bottom when no children
        if (zone === "jump" || zone === "sibling") {
            const hasChildren = this.connector.nodeChildrenIds && this.connector.nodeChildrenIds.size > 0;
            if (!hasChildren) {
                // Extend zone to the bottom of the Plex (horizontalLines[6])
                const bottomOfPlex = horizontalLines[6];
                zr = new Rect(zr.x, zr.y, zr.width, bottomOfPlex - zr.y);
            }
        }

        // When there are no children, the jump and sibling zones are extended down to fill
        // the bottom-left and bottom-right where children would normally sit (above). Narrow
        // the child zone to the center column so it no longer overlaps them. Without this, a
        // sibling positioned low in the Plex has its center inside the full-width child zone,
        // so getZoneForThoughtElement (which tests child before sibling) misclassifies the
        // drag source as "child" and the drop collapses to a no-op same-zone reorder. The
        // center column mirrors the parent zone's horizontal extent.
        if (zone === "child") {
            const hasChildren = this.connector.nodeChildrenIds && this.connector.nodeChildrenIds.size > 0;
            if (!hasChildren) {
                zr = new Rect(verticalLines[1], zr.y, verticalLines[2] - verticalLines[1], zr.height);
            }
        }

        const minHeight = this.connector.getRowHeightWithSpacing() * (this.extraGeneration ? 4.2 : 2.2);
        if (zone === "parent") {
            // ensure parent rectangle has at least enough vertical space for one row,
            // aligned to the bottom of the zone rectangle
            if (zr.height < minHeight) {
                zr = new Rect(zr.x, zr.bottom() - minHeight, zr.width, minHeight);
            }
        } else if (zone === "child") {
            // ensure child rectangle has at least enough vertical space for one row,
            // aligned to the top of the zone rectangle
            if (zr.height < minHeight) {
                zr = new Rect(zr.x, zr.y, zr.width, minHeight);
            }
        }
        
        if (!this.extraGeneration) {
            const gap = this.getScaledZoneSpacing();
            if (zone === "child") {
                // child zone is shifted down to keep clear of the jump/sibling zones above
                zr.y += gap;
                zr.height -= gap;
            } else if (zone === "parent") {
                // parent zone is shifted up a bit
                zr.height -= gap;
            }
        }
        
        return zr;
    }

    createOrUpdateZoneDivs(drawZones: boolean) {
        // Zones are now created via Blazor markup, this function only positions them
        let fieldElement = document.getElementById("field");
        if (!fieldElement) {
            return;
        }

        let fieldRect: Rect = fieldElement.getBoundingClientRect();
        let zones = ["active", "parent", "child", "sibling", "jump"];

        zones.forEach(zone => {
            let zoneId = `.zone-${zone}`;
            let zoneDiv = document.querySelector(zoneId) as HTMLElement;

            // Only update position if zone div already exists (created by Blazor)
            if (zoneDiv) {
                let zoneRect = this.getDragZoneRect(zone, fieldRect);

                // Special handling for active zone - position it between parent and child zones
                if (zone === "active") {
                    const parentRect = this.getDragZoneRect("parent", fieldRect);
                    const childRect = this.getDragZoneRect("child", fieldRect);
                    const hasChildren = this.connector.nodeChildrenIds && this.connector.nodeChildrenIds.size > 0;

                    zoneRect.y = parentRect.bottom();
                    // When no children, extend the active zone div to fill the space the child zone would occupy.
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

    disappearOldMapPrevious: Map<string, string> | null = null;
    disappearOldMap: Map<string, string> | null = null;

    public prepareDisappearOld(lastNode: LayoutNode | null) {
        this.connector.logInfo("prepareDisappearOld");
        this.disappearOldMapPrevious = this.disappearOldMap;
        let parentMap = new Map<string, string>();
        this.makeMap(lastNode!, parentMap);
        this.disappearOldMap = parentMap;
        this.connector.logInfo("disOldMap size:", this.disappearOldMap.size);
    }

    disappearOld(isScrollEvent: boolean) {
        if(this.extraGeneration && this.disappearOldMap) {
            this.makeMap(this.connector.node!, this.disappearOldMap!);
        }
        let curEls = this.connector.field.querySelectorAll(".tht.cur") as NodeListOf<HTMLElement>;
        curEls.forEach((el: HTMLElement) => {
            let str = el.id.substring(4, el.id.length - 4);
            this.connector.logInfo("disappearOld . curEls . el", el.id);
        });
        const seconds = this.connector.animationTime;
        // Wrapper that skips moving the element if the destination is at or near the
        // top-left corner, which is never a valid plex position — let the thought fade
        // in-place instead. Uses <= 0 to also catch negative values from getCenter on
        // hidden/unpositioned elements.
        const safeCenterAt = (el: HTMLElement, pt: Point) => {
            if(pt.x < 1 && pt.y < 1) return;
            DomUtils.positionAt(el, pt);
        };
        let oldEls = this.connector.field.querySelectorAll(".tht.old") as NodeListOf<HTMLElement>;
        oldEls.forEach((oldEl) => {
            oldEl.style.opacity = "0";
            oldEl.style.fontSize = "0";
            // Disable interaction immediately so keyboard nav and hover don't hit fading elements
            oldEl.style.pointerEvents = "none";
            let thtIconEl = oldEl.querySelector(".tht-icon") as HTMLElement;
            if(thtIconEl) {
                thtIconEl.style.height = "100%";
                thtIconEl.style.transition = "height " + seconds + "s ease";
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

            let skip = false;
            if(this.connector.scrollDirStr != "") {
                this.connector.logInfo("SCROLL DIRECTION:", this.connector.scrollDirStr, "isScrollEvent:", isScrollEvent);
                if(this.connector.scrollDirStr === "up" || this.connector.scrollDirStr === "left") {
                    let ps = oldEl.dataset.destBefore?.split(",") || ["-1337", "-1337"];
                    //@ts-ignore
                    let x = ps[0]|0;
                    //@ts-ignore
                    let y = ps[1]|0;
                    //@ts-ignore
                    let pt = new Point(x, y);
                    safeCenterAt(oldEl, pt);
                    return;
                }
                else if(this.connector.scrollDirStr === "down" || this.connector.scrollDirStr === "right") {
                    let ps = oldEl.dataset.destAfter?.split(",") || ["-1337", "-1337"];
                    //@ts-ignore
                    let x = ps[0]|0;
                    //@ts-ignore
                    let y = ps[1]|0;
                    //@ts-ignore
                    let pt = new Point(x, y);
                    safeCenterAt(oldEl, pt);
                    return;
                }
            }
            let map = this.disappearOldMap;
            this.connector.logInfo("parentMap.size: " + (map ? map.size : "no map"));
            if(!skip && map && map.has(str)) {
                let id1 = map.get(str);
                this.connector.logInfo("id1: ", id1);
                let el1 = document.getElementById("tht-" + id1 + "-cur") as HTMLElement;
                if (id1 && this.thoughtFinalLocMap.has(id1)) {
                    this.connector.logInfo("> thoughtFinalLocMap " + str + " is following the new final location of " + id1);
                    let pt1: Point = this.thoughtFinalLocMap.get(id1)!;
                    safeCenterAt(oldEl, pt1);
                    return;
                }
                if (id1) {
                    let id11 = map.get(id1);
                    if (id11 && this.thoughtFinalLocMap.has(id11)) {
                        this.connector.logInfo("@ thoughtFinalLocMap " + str + " is following the new final location of " + id11);
                        let pt11: Point = this.thoughtFinalLocMap.get(id11)!;
                        safeCenterAt(oldEl, pt11);
                        return;
                    }
                    let el11 = document.getElementById("tht-" + id11 + "-cur") as HTMLElement;
                    if (el11) {
                        this.connector.logInfo(">> " + str + " is following the new location of " + id11);
                        let pt11: Point = DomUtils.getCenter(el11, this.connector.field);
                        safeCenterAt(oldEl, pt11);
                        return;
                    }
                }
                if (id1 && this.thoughtFinalLocMapPrevious.has(id1)) {
                    this.connector.logInfo("< thoughtFinalLocMapPrevious " + str + " is following the new final location of " + id1);
                    let pt1: Point = this.thoughtFinalLocMapPrevious.get(id1)!;
                    safeCenterAt(oldEl, pt1);
                    return;
                }
                if (el1 && id1) {
                    this.connector.logInfo("tFLMP:", this.thoughtFinalLocMapPrevious.size);
                    this.connector.logInfo(str + " is following the -cur- location of " + id1 + " and tFLMPrevious(id1) = " + this.thoughtFinalLocMapPrevious.has(id1));
                    let pt1: Point = DomUtils.getCenter(el1, this.connector.field);
                    safeCenterAt(oldEl, pt1);
                    return;
                }
                let el2 = document.getElementById("tht-" + id1 + "-old") as HTMLElement;
                if (el2) {
                    this.connector.logInfo(str + " is following the old location of " + id1);
                    let pt2: Point = DomUtils.getCenter(el2, this.connector.field);
                    safeCenterAt(oldEl, pt2);
                    return;
                }
            }
            // move them to the previous active thought
            if(this.connector.lastActiveDestX !== undefined && this.connector.lastActiveDestY !== undefined) {
                safeCenterAt(oldEl, new Point(this.connector.lastActiveDestX, this.connector.lastActiveDestY));
            } else {
                var center = this.getActiveZoneCenter();
                safeCenterAt(oldEl, center);
            }
        });
        if(isScrollEvent) {
            // hide any thoughts that didn't get laid out
            let thtElements = Array.from(this.connector.field.querySelectorAll(".tht.cur,.tht.off") as NodeListOf<HTMLElement>);
            thtElements.forEach((thtEl) => {
                let str = thtEl.id.substring(4, thtEl.id.length - 4);
                if(this.connector.thoughtIdSet.has(str)) {
                    // without this code here, all thoughts vanish when scrolling happens 
                    let isFaded = thtEl.classList.contains("related-thought");
                    // preserve fade level of related (small Normal + 1 thoughts)
                    thtEl.style.opacity = isFaded ? "0.5" : "1.0";
                    thtEl.style.pointerEvents = "";
                    return;
                }
                thtEl.style.opacity = "0";
                thtEl.style.fontSize = "0"; // make it shrink to nothing
                thtEl.style.pointerEvents = "none"; // prevent interaction with invisible thoughts
                let map = this.disappearOldMap;
                let map2 = this.disappearOldMapPrevious;
                if(map && map.has(str)) {
                    let pt: Point = map.get(str);
                    DomUtils.centerAt(thtEl, pt);
                    return;
                }
                if(map2 && map2.has(str)) {
                    let pt: Point = map2.get(str);
                    DomUtils.centerAt(thtEl, pt);
                    return;
                }
            });
        }
        this.disappearOldMapPrevious = this.disappearOldMap;
    }

    makeMap(node: LayoutNode, parentMap: Map<string, Point>) {
        if(node == null) {
            return;
        }
        let rep = this.connector.thtReps.get(node.id);
        if(!rep) {
            return;
        }
        //console.log("got a rep");
        let pt: Point = DomUtils.getCenter(rep!.thtEl, this.connector.field);
        node.children?.forEach((child: LayoutNode) => {
            parentMap.set(child.id, node.id);
            this.makeMap(child, parentMap);
        });
        // these aren't always parents! (it's a parent in the Node tree, not a child or parent in TheBrain terms)
        node.parents?.forEach((parent: LayoutNode) => {
            parentMap.set(parent.id, node.id);
            this.makeMap(parent, parentMap);
        });
        // ditto for jumps
        node.jumps?.forEach((jump: LayoutNode) => {
            parentMap.set(jump.id, node.id);
            this.makeMap(jump, parentMap);
        });
        // ditto for siblings
        node.siblings?.forEach((sibling: LayoutNode) => {
            parentMap.set(sibling.id, node.id);
            this.makeMap(sibling, parentMap);
        });

        // put in some backwards mapping
        node.children?.forEach((child: LayoutNode) => {
            let rep = this.connector.thtReps.get(child.id);
            if(!rep) {
                return;
            }
            let pt: Point = DomUtils.getCenter(rep.thtEl, this.connector.field);
            if(!parentMap.has(node.id)) {
                parentMap.set(node.id, rep.thtEl.id);
            }
        });
        // these aren't always parents! (it's a parent in the Node tree, not a child or parent in TheBrain terms)
        node.parents?.forEach((parent: LayoutNode) => {
            let rep = this.connector.thtReps.get(parent.id);
            if(!rep) {
                return;
            }
            let pt: Point = DomUtils.getCenter(rep.thtEl, this.connector.field);
            if(!parentMap.has(node.id)) {
                parentMap.set(node.id, rep.thtEl.id);
            }
        });
        // ditto for jumps
        node.jumps?.forEach((jump: LayoutNode) => {
            let rep = this.connector.thtReps.get(jump.id);
            if(!rep) {
                return;
            }
            let pt: Point = DomUtils.getCenter(rep.thtEl, this.connector.field);
            if(!parentMap.has(node.id)) {
                parentMap.set(node.id, rep.thtEl.id);
            }
        });
        // ditto for siblings
        node.siblings?.forEach((sibling: LayoutNode) => {
            let rep = this.connector.thtReps.get(sibling.id);
            if(!rep) {
                return;
            }
            let pt: Point = DomUtils.getCenter(rep.thtEl, this.connector.field);
            if(!parentMap.has(node.id)) {
                parentMap.set(node.id, rep.thtEl.id);
            }
        });
    }

    replaceOldWithCur() {
        const seconds = this.connector.animationTime;

        let oldEls = this.connector.field.querySelectorAll(".tht.old");
        
        // SETUP THOUGHTS THAT ARE GOING TO MOVE (not appearing or disappearing)
        oldEls.forEach((oldEl_) => {
            let oldEl = oldEl_ as HTMLElement;
            if(oldEl.style.display === "none") {
                return; // continue
            }
            let id = oldEl.id.substring(0, oldEl.id.length - 4);
            let newEl = document.getElementById(id + "-cur");
            if(newEl) {
                newEl.style.position = "absolute";
                let delta = 0;
                newEl.style.top = +oldEl.style.top.substring(0, oldEl.style.top.length - 2) + delta + "px";
                newEl.style.left = +oldEl.style.left.substring(0, oldEl.style.left.length - 2) + delta + "px";
                newEl.style.opacity = oldEl.style.opacity || "1";
                newEl.style.display = "block";
                oldEl.remove();
            }
        });
        
        // FIND THE DEFAULT CENTER TO APPEAR FROM
        // now anything that was not previously here should appear from the thought that is being activated
        let appearFromEl = document.getElementById("tht-" + this.connector.activeId + "-cur");
        
        let cen: Point;
        if(!appearFromEl || appearFromEl.style.display === "none") {
            // wasn't there - appear from the center instead
            cen = this.getActiveZoneCenter();
        } else {
            cen = DomUtils.getCenter(appearFromEl, this.connector.field);
        }

        // Build a map from the current node tree so second-generation thoughts
        // can appear from their source thought instead of from the active thought
        let curTreeMap: Map<string, string> | null = null;
        if(this.extraGeneration && this.connector.node) {
            curTreeMap = new Map<string, string>();
            this.makeMap(this.connector.node, curTreeMap);
        }

        let srcBefore = null, srcAfter = null;
        // we need to know the zone being scrolled, set on plexAnimator when scrollbar calls plexAnimator.scrollChanged()
        let scrolledZone = this.connector.scrolledZone;
        if(scrolledZone != "") {
            let rect = this.getZoneRect(scrolledZone, this.connector.field.getBoundingClientRect());
            if (this.connector.scrollDirStr == "left" || this.connector.scrollDirStr == "right") {
                srcBefore = new Point(rect.x - rect.width * 0.25, rect.getCenter().y);
                srcAfter = new Point(rect.right() + rect.width * 0.25, rect.getCenter().y);
            } else {
                srcBefore = new Point(rect.getCenter().x, rect.y - rect.height * 0.25);
                srcAfter = new Point(rect.getCenter().x, rect.bottom() + rect.height * 0.25);
            }
        }

        // PUT ALL NEW ELEMENTS AT THE PLACE THEY WILL APPEAR FROM
        let newEls = document.querySelectorAll(".tht.cur");
        let n = 0;
        newEls.forEach((newEl_) => {
            let newEl = newEl_ as HTMLElement;
            if(newEl.style.display === "none") {
                let pt: Point = cen;
                let str = newEl.id.substring(4, newEl.id.length - 4);

                let map = this.disappearOldMap;
                if(map && map.has(str)) {
                    let id1 = map.get(str);
                    let el1 = document.getElementById("tht-" + id1 + "-cur") as HTMLElement;
                    if(el1) {
                        this.connector.logInfo("> appear from location for " + str + " is the same as the new location of " + id1);
                        pt = DomUtils.getCenter(el1, this.connector.field);
                    }
                } else if(curTreeMap && curTreeMap.has(str)) {
                    let id1 = curTreeMap.get(str);
                    let el1 = document.getElementById("tht-" + id1 + "-cur") as HTMLElement;
                    if(el1) {
                        this.connector.logInfo(">>> appear from location for " + str + " is current-tree source " + id1);
                        pt = DomUtils.getCenter(el1, this.connector.field);
                    }
                } else {
                    let map2 = this.disappearOldMapPrevious;
                    if(map2 && map2.has(str)) {
                        let id1 = map2.get(str);
                        let el1 = document.getElementById("tht-" + id1 + "-cur") as HTMLElement;
                        if (el1) {
                            this.connector.logInfo(">> appear from location for " + str + " is the same as the new location of " + id1);
                            pt = DomUtils.getCenter(el1, this.connector.field);
                        }
                    }
                }
                if (pt.X === cen.X && pt.Y == cen.Y) {
                    this.connector.logInfo("appear from location for " + str + " is just the center / active thought");
                }
                if(this.connector.scrollDirStr != "") {
                    // Note that appear-from direction is the opposite of the scroll direction, so srcBefore = destAfter and vice versa
                    // since newEl.dataset.destBefore and newEl.dataset.destAfter do not exist yet, we compute them once
                    // above this loop
                    this.connector.logInfo("Want to appear from / SCROLL DIRECTION:", this.connector.scrollDirStr, "before:");
                    if(this.connector.scrollDirStr === "up" || this.connector.scrollDirStr === "left") {
                        pt = srcAfter;
                    } else if(this.connector.scrollDirStr === "down" || this.connector.scrollDirStr === "right") {
                        pt = srcBefore;
                    }
                }
                newEl.style.display = "block"; // TODO: THIS SHOULD NOT BE DONE FOR THOUGHTS THAT WILL NEVER SHOW AS IT MAKES IT SLOW 
                newEl.style.opacity = "0"; // this ensures that new thoughts that are appearing will animate from 0 opacity to full opacity
                newEl.style.pointerEvents = "none"; // prevent interaction until thought becomes visible
                // make thought icons appear from zero height and animate to the correct height
                let thtIconEl = newEl.querySelector(".tht-icon") as HTMLElement;
                if(thtIconEl) {
                    thtIconEl.style.height = "0"; // make it start from nothing
                    // NOTE: this is a hack to force the CSS animation height to be reset to zero as we just requested.
                    // This has been tested on Safari and Chrome
                    // DO NOT remove this hack
                    let height = window.getComputedStyle(thtIconEl).height; // this fixes the bug
                    thtIconEl.style.transition = "height "+seconds+"s ease";
                    // NOTE: keep this number 0.7 in sync with the CSS .tht-icon height in PlexControl.razor
                    thtIconEl.style.height = this.connector.rowHeight * 0.7 + "px";
                }

                DomUtils.centerAt(newEl, pt);
                this.connector.logInfo("thought "+str+" is appearing from point " + pt.x + ", " + pt.y);
                n++;
            }
        });
    }

    hideRelatedThoughts(thtId: string) {
        let jumps = this.connector.nodeJumpsOf.get(thtId)!;
        jumps = jumps ? jumps : [];
        let parents = this.connector.nodeParentsOf.get(thtId)!;
        parents = parents ? parents : [];
        let children = this.connector.nodeChildrenOf.get(thtId)!;
        children = children ? children : [];
        let allRelated = jumps.concat(parents).concat(children);
        allRelated.forEach((id: string) => {
            let tht = document.getElementById("tht-" + id + "-cur") as HTMLElement;
            tht.style.display = "none";
        });
    }

    maybeLayoutRelatedThoughts(thtId: string, pt: Point, maxWid: number, zone: string) {
        let fieldRect: Rect = this.connector.field.getBoundingClientRect();
        let rect = this.getZoneRect(zone, fieldRect);
        let isHorizontal = zone == "child" || zone == "parent";
        let destBefore;
        let destAfter;
        if (isHorizontal) {
            destBefore = new Point(rect.x - rect.width * 0.25, rect.getCenter().y);
            destAfter = new Point(rect.right() + rect.width * 0.25, rect.getCenter().y);
        } else {
            destBefore = new Point(rect.getCenter().x, rect.y - rect.height * 0.25);
            destAfter = new Point(rect.getCenter().x, rect.bottom() + rect.height * 0.25);
        }

        let jumps = this.connector.nodeJumpsOf.get(thtId)!;
        jumps = jumps ? jumps.slice(0, 2) : []; // 0, 1, or 2 jumps
        let parents: string[] = this.connector.nodeParentsOf.get(thtId)!;
        
        parents = parents ? parents.slice(0, 4 - jumps.length) : [];  // up to four jumps + parents incuded
        parents = jumps.concat(parents);
        let i = 0.0;
        let cols = Math.min(parents.length, 4);
        if(cols < 1) {
            cols = 1;
        }
        let w = maxWid / cols;
        let dy = this.connector.rowHeight;
        let ddx = (maxWid - (parents.length * w)) / 2.0;
        parents.forEach((thtId: string) => {
            let tht = document.getElementById("tht-" + thtId + "-cur") as HTMLElement;
            if (!this.connector.thtReps.has(thtId)) {
                this.connector.logInfo("no thtRep for " + thtId);
            }
            if (!tht) {
                this.connector.logInfo("*** missed tht: " + thtId);
                return;
            }
            tht.classList.add("related-thought");
            tht.classList.remove("multiline-wrap");
            tht.style.fontSize = "60%"; // weird that this is 60% and related-tht class is 50%
            tht.style.width = "";
            tht.style.maxWidth = w + "px";
            let dx = - maxWid / 2.0 + w * i + w / 2.0;
            let pt2 = new Point(pt.x + dx + ddx, pt.y - 0.59 * this.connector.rowHeight);
            this.connector.setThoughtPosition(tht, pt2, 50, true, ThoughtHorizontalAlignment.Center);
            tht.dataset.destBefore = destBefore.x + "," + destBefore.y;
            tht.dataset.destAfter = destAfter.x + "," + destAfter.y;
            this.thoughtFinalLocMap.set(thtId, pt2);
            tht.style.opacity = "0.5";
            tht.style.display = "block";
            tht.style.pointerEvents = "";  // Reset pointer-events in case element was hidden
            tht.classList.remove("overflow-hidden-resize");
            i++;
        });

        let children = this.connector.nodeChildrenOf.get(thtId)!;
        children = children ? children : [];
        i = 0;
        cols = Math.min(children.length, 4);
        let rows = Math.ceil(children.length / cols);
        if(children.length == 4) {
            cols = 2;
            rows = 2;
        }
        else if(children.length == 5 || children.length == 6) {
            cols = 3;
            rows = 2;
        }
        w = maxWid / cols;
        let row = 0;
        let col = 0;
        children.forEach((thtId: string) => {
            let tht = document.getElementById("tht-" + thtId + "-cur") as HTMLElement;
            if (!this.connector.thtReps.has(thtId)) {
                this.connector.logInfo("no thtRep for " + thtId);
            }
            if (!tht) {
                this.connector.logInfo("*** missed tht: " + thtId);
                return;
            }
            tht.classList.add("related-thought");
            tht.classList.remove("multiline-wrap");
            tht.style.fontSize = "60%"; // weird that this is 60% and related-tht class is 50%
            tht.style.width = "";
            tht.style.maxWidth = w + "px";
            let dx = - maxWid / 2.0 + w * col + w / 2.0;
            let pt2 = new Point(pt.x + dx, pt.y + 0.54 * this.connector.rowHeight * (row + 2) - 0.25 * this.connector.rowHeight);
            this.connector.setThoughtPosition(tht, pt2, 50, true, ThoughtHorizontalAlignment.Center);
            tht.dataset.destBefore = destBefore.x + "," + destBefore.y;
            tht.dataset.destAfter = destAfter.x + "," + destAfter.y;
            this.thoughtFinalLocMap.set(thtId, pt2);
            tht.style.opacity = "0.5";
            tht.style.display = "block";
            tht.style.pointerEvents = "";  // Reset pointer-events in case element was hidden
            tht.classList.remove("overflow-hidden-resize");
            i++;
            row++;
            if(row >= rows) {
                row = 0;
                col++;
            }
        });
    }

    layoutThoughts(dryLayout: boolean, thtElements: HTMLElement[], isScrollEvent: boolean, zone: string, align: "center" | "bottom" | "top", maxColumnCount: number, centerOnActive: boolean, scrollSide: "bottom" | "top" | "left" | "right") {
        if (thtElements.length === 0) {
            // Even with no DOM elements, compute zone range from viewport if the zone
            // should have thoughts. This breaks the end=0 deadlock where C# sends end=0
            // → Blazor renders 0 zone elements → layoutThoughts returns early → end stays 0.
            let one = this.connector.getOneZoneRangeForZone(zone);
            if(one.count > 0 && one.end === 0) {
                let yMultiplier = this.extraGeneration ? 2.75 : 1.0;
                let yHeight = this.connector.rowHeight * yMultiplier * (plexAnimator.thoughtSpacing || 1.0);
                if(yHeight > 0) {
                    let fieldRect: Rect = this.connector.field.getBoundingClientRect();
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

        // setup
        let fieldRect: Rect = this.connector.field.getBoundingClientRect();
        let rect = this.getZoneRect(zone, fieldRect);
        // rect now contains the location of the zone relative to the field

        // decide how many columns to use
        let columnCount = maxColumnCount;
        if (columnCount > 2) {
            // reduce the max column count if the columns are not wide enough
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

        let one: OneZoneRange = this.connector.getOneZoneRangeForZone(zone);
        let max = one.count || thtElements.length;
        // Defensive: one.count should never be less than the number of DOM elements.
        // If it is, the cache is stale (race between LayoutNode and ZoneRanges from C#).
        if(max < thtElements.length) {
            let msg = "layoutThoughts: zone: " + zone + " one.count: " + one.count + " < thtElements.length: " + thtElements.length + " — corrected max to " + thtElements.length;
            console.warn("[PLEX-FIX] " + msg);
            safeInvoke(this.connector.dotNetHelper, "LogPlexDiagnostic", [msg]);
            max = thtElements.length;
            // Fix the cached count so scrollbar calculations and subsequent
            // scrollChanged → layoutThoughts calls also see the corrected value
            this.connector.setCountForZone(zone, max);
            one = this.connector.getOneZoneRangeForZone(zone);
        }

        let needsScrollbar = maxRowCount * columnCount < max;
        if(thtElements.length < max && !needsScrollbar && one.end >= one.count && one.start == 0) {
            // No scrollbar needed, zone range says render all, yet fewer DOM elements exist
            console.warn("[PLEX-BUG] layoutThoughts: zone:", zone, "has fewer DOM elements than expected:", thtElements.length, "vs max:", max, "one:", one.toString(), "rect.height:", Math.round(rect.height), "maxRowCount:", maxRowCount, "columnCount:", columnCount);
        }
        this.connector.logInfo("ZONE: " + zone + ", maxRowCount: " + maxRowCount + ", columnCount: " + columnCount + ", max: " + max + ", needsScrollbar: " + needsScrollbar);
        if (needsScrollbar) {
            let scrollRect;
            let totalUnits;
            let displayedUnits;
            if (columnCount > 1) {
                // height changing due to scrollbar addition changed, recalculate max rows
                maxRowCount = Math.floor((rect.height - NormalLayout.SCROLLBAR_SIZE) / yHeight);
                let height = maxRowCount * yHeight;
                if (scrollSide === "top") {
                    rect.y = rect.bottom() - height;
                    rect.height = height;
                    scrollRect = new Rect(rect.x, rect.y - 2.0 * NormalLayout.SCROLLBAR_SIZE, rect.width, NormalLayout.SCROLLBAR_SIZE);
                } else {
                    rect.height = height;
                    scrollRect = new Rect(rect.x, rect.bottom(), rect.width, NormalLayout.SCROLLBAR_SIZE);
                }
                totalUnits = Math.ceil(max / maxRowCount);
                displayedUnits = columnCount;
            } else {
                let height = maxRowCount * yHeight;
                rect.y = rect.bottom() - height;
                rect.height = height;
                rect.width -= NormalLayout.SCROLLBAR_SIZE;
                if (scrollSide === "left") {
                    scrollRect = new Rect(rect.x, rect.y, NormalLayout.SCROLLBAR_SIZE, rect.height);
                    rect.x += NormalLayout.SCROLLBAR_SIZE;
                } else {
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
                    if (s < 0) { s = 0; }
                    if (s > totalUnits - displayedUnits) { s = totalUnits - displayedUnits; }
                }
                this.connector.zoneScrollbars[zone] = new Scrollbar(this.connector.field, zone, zoneRect, scrollRect, totalUnits, displayedUnits, s);
            } else {
                scrollbar.update(scrollRect, totalUnits, displayedUnits);
            }
        } else {
            this.connector.logInfo("no scrollbar needed for zone: " + zone + " -- setting scrollbar to null");
            this.connector.zoneScrollbars[zone] = null;
        }

        if (columnCount > 2) {
            // reduce the max column count if they won't be needed
            let columnCountNeededToFitAll = Math.ceil(max / maxRowCount);
            if (columnCountNeededToFitAll % 2 === 1) {
                columnCountNeededToFitAll++;
            }
            columnCount = Math.min(columnCount, columnCountNeededToFitAll);
        }

        // decide how many rows to use
        let neededRows = Math.ceil(max / columnCount);
        let rowCount = Math.min(maxRowCount, neededRows);
        this.connector.normalLayoutZoneToRows.set(zone, rowCount);
        this.connector.normalLayoutZoneToColumns.set(zone, columnCount);

        let top;
        if (align === "bottom") {
            let tht = thtElements[0];
            
            // This hack seems to work reliably to find out the new width and height of the final element
            // so we can center it. Without this hack, the current starting animation fontsize causes
            // offsetWidth and offfsetHeight to return the wrong width and height, even zero.
            // Note the measurer element lives in PlexControl, and is not invisible, it just has 0.00001 opacity.
            let reusable = document.getElementById("measurer") as HTMLElement;
            if (reusable == null) {
                return;
            }
            let htmlClone = tht.cloneNode(true) as HTMLElement;
            syncThoughtFontStyling(tht, htmlClone);
            reusable.appendChild(htmlClone);
            htmlClone.style.fontSize = "100%";
            let h = htmlClone.offsetHeight;
            reusable.removeChild(htmlClone);
            
            // need to use the animation-proof hack?
            let thtClientHeight = h;
            
            let elementHeight = thtClientHeight * yMultiplier;

            let extraSpace = yHeight - elementHeight;
            let totalHeight = yHeight * rowCount - extraSpace;
            if(zone == "parent") {
                this.connector.logInfo("totalHeight: " + totalHeight + ", extraSpace: " + extraSpace + ", elementHeight: " + elementHeight);
            }
            top = rect.bottom() - totalHeight;

            if (centerOnActive) {
                // if there is enough space to center on the active zone, do it
                let center = this.getActiveZoneCenter().y;
                if (center + totalHeight / 2 <= rect.bottom()) {
                    top = center - totalHeight / 2;
                }
                // Ensure top doesn't go above the zone boundary
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
        } else {
            top = rect.y;
        }
        let colWidth = rect.width / columnCount;

        let fullGrid = rowCount * columnCount;
        let startAt = 0;
        this.connector.logInfo("layoutThoughts ==> zone: " + zone + ", columnCount: " + columnCount + ", rowCount: " + rowCount + ", startAt: " + startAt + ", max: " + max);
        //
        let delta = 1;
        if (columnCount > 1) { delta = rowCount; }
        let s = startAt * delta;
        let e = startAt * delta + fullGrid;
        this.connector.logInfo("layoutThoughts ==> _set JS cached __ zone: " + zone + ", s: " + s + ", e: " + e + ", max: " + max);
        if(one.end == 0 || (!needsScrollbar && (one.start > 0 || one.end < max))) {
            // Update zone range when: empty (one.end == 0), or when there's no scrollbar
            // but the cached range doesn't cover all items (stale from a previous layout)
            this.connector.logInfo(":-( setting range for zone: " + zone + " to s: " + s + ", e: " + e + " (was start=" + one.start + " end=" + one.end + " needsScrollbar=" + needsScrollbar + " max=" + max + ")");
            this.connector.setZoneRangeForZone(zone, s, e);
        }

        let hasScrollbar = this.connector.zoneScrollbars[zone] ? true : false;
        this.connector.logInfo(":-) double FOR loop for zone: " + zone + ", thtElements.length: " + thtElements.length +  ", columnCount: " + columnCount + ", rowCount: " + rowCount + ", startAt: " + startAt + ", max: " + max);
        let displayedCount = 0;
        for (let column = 0; column < columnCount; column++) {
            let colX = rect.x + colWidth * column;
            for (let row = 0; row < rowCount; row++) {
                if (displayedCount >= max) {
                    this.connector.logInfo(":-) displayedCount >= max, breaking out of loop for zone: " + zone, "displayedCount: " + displayedCount + ", max: " + max);
                    break;
                }

                let tht = thtElements[displayedCount];
                if(!tht) {
                    // Break instead of continue - remaining elements won't exist either
                    break;
                }
                let id = tht.id.substring(4, 40);

                // Store grid position metadata for keyboard navigation
                tht.dataset.gridZone = zone;
                tht.dataset.gridColumn = column.toString();
                tht.dataset.gridRow = row.toString();

                // Build fast lookup cache for grid-based navigation
                const gridKey = `${zone}-${column}-${row}`;
                plexCanvas.gridPositionToThoughtId.set(gridKey, id);

                tht.style.display = "block";
                tht.style.opacity = "1";
                tht.style.fontSize = "100%";
                tht.style.pointerEvents = "";  // Reset pointer-events in case element was hidden
                tht.style.width = "";  // Clear explicit width from active thought setup
                tht.style.overflow = "";
                tht.classList.remove("related-thought", "overflow-hidden-resize", "multiline-wrap");
                let maxWid = colWidth - this.COL_GAP * 2;
                tht.style.maxWidth = maxWid + "px";
                let pt = new Point(colX + colWidth / 2, top + row * yHeight);

                // cache pt information to thoughtFinalLocMap for use in disappearOld
                this.thoughtFinalLocMap.set(id, pt);
                this.connector.logInfo("setting thought position for " + id + " to " + pt.x + ", " + pt.y);
                this.connector.setThoughtPosition(tht, pt, 100, true, ThoughtHorizontalAlignment.Center);
                //
                let isHorizontal = zone == "child" || zone == "parent";
                let destBefore;
                let destAfter;
                if (isHorizontal) {
                    destBefore = new Point(rect.x - rect.width * 0.25, rect.getCenter().y);
                    destAfter = new Point(rect.right() + rect.width * 0.25, rect.getCenter().y);
                } else {
                    destBefore = new Point(rect.getCenter().x, rect.y - rect.height * 0.25);
                    destAfter = new Point(rect.getCenter().x, rect.bottom() + rect.height * 0.25);
                }
                tht.dataset.destBefore = destBefore.x + "," + destBefore.y;
                tht.dataset.destAfter = destAfter.x + "," + destAfter.y;
                //
                if (tht.id === "tht-" + this.connector.lastActiveId + "-cur") {
                    this.connector.lastActiveDestX = pt.x;
                    this.connector.lastActiveDestY = pt.y;
                }
                displayedCount++;
                tht.classList.remove("before-scroll", "after-scroll");
                if(hasScrollbar && columnCount > 1) {
                    tht.classList.add("horiz-scroll");
                } else if (hasScrollbar && columnCount == 1) {
                    tht.classList.add("vert-scroll");
                }
                this.maybeLayoutRelatedThoughts(id, pt, maxWid, zone);
            }
        }

        // Hide overflow thoughts that didn't fit in the grid
        if(displayedCount < thtElements.length && !hasScrollbar) {
            // No scrollbar, yet some thoughts are being hidden — this shouldn't happen
            console.warn("[PLEX-BUG] layoutThoughts hiding thoughts when no scrollbar: zone:", zone, "displayed:", displayedCount, "total elements:", thtElements.length, "max:", max, "rowCount:", rowCount, "columnCount:", columnCount, "maxRowCount:", maxRowCount);
        }
        for(let i = displayedCount; i < thtElements.length; i++) {
            let tht = thtElements[i];
            if(tht) {
                tht.style.display = "none";
                tht.style.opacity = "0";
            }
        }
    }

}
