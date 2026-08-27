// @ts-ignore
import { Point, Rect } from "/_content/Venus/js/dist/geometry.js"
import { plexAnimator } from "./plexAnimator.js";
import { NormalLayout } from "./normalLayout.js";

class ScrollState {
    isHovered: boolean = false;
    isDragging: boolean = false;
    isPaging: boolean = false;
    isDraggingScrollBarThumb: boolean = false;
}

export class Scrollbar {
    parentElement: HTMLElement;

    zone: string;
    rect: Rect;
    totalUnits: number;
    displayedUnits: number;
    startAt: number;

    isHorizontal: boolean;
    visRect: Rect;
    thumbRect: Rect;
    zoneRect: Rect;

    pagingDirection: 1 | -1 = 1;
    dragOffsetFromStart = 0;
    updateStartAt: number;
    updateTime: number;
    isUpdatePending = false;

    static stateByZone: { [zone: string]: ScrollState } = {
        "sibling": new ScrollState(),
        "child": new ScrollState(),
        "parent": new ScrollState(),
        "jump": new ScrollState()
    };

    static resetZoneStates() {
        for(let zone in Scrollbar.stateByZone) {
            Scrollbar.stateByZone[zone] = new ScrollState();
        }
    }

    constructor(parentElement: HTMLElement, zone: string, zoneRect: Rect, rect: Rect, totalUnits: number, displayedUnits: number, startAt: number) {
        this.parentElement = parentElement;
        this.zone = zone;
        this.rect = rect;
        this.totalUnits = totalUnits;
        this.displayedUnits = displayedUnits;
        this.startAt = startAt;
        this.updateStartAt = this.startAt;
        this.updateTime = Date.now();

        this.isHorizontal = false;
        this.visRect = new Rect(0, 0,0, 0);
        this.thumbRect = new Rect(0, 0,0, 0);
        this.updateVisRect();

        this.zoneRect = zoneRect;
    }

    updateVisRect() {
        this.isHorizontal = this.rect.width > this.rect.height;
        this.visRect = new Rect(this.rect.x, this.rect.y, this.rect.width, this.rect.height);
        if(this.isHorizontal) {
            this.visRect.x += NormalLayout.SCROLLBAR_SIZE / 2;
            this.visRect.width -= NormalLayout.SCROLLBAR_SIZE;
            this.visRect.y += NormalLayout.SCROLLBAR_SIZE * 0.25;
            this.visRect.height -= NormalLayout.SCROLLBAR_SIZE * 0.5;
        } else {
            this.visRect.y += NormalLayout.SCROLLBAR_SIZE / 2;
            this.visRect.height -= NormalLayout.SCROLLBAR_SIZE;
            this.visRect.x += NormalLayout.SCROLLBAR_SIZE * 0.25;
            this.visRect.width -= NormalLayout.SCROLLBAR_SIZE * 0.5;
        }
        this.updateThumbRect();
    }

    update(rect: Rect, totalUnits: number, displayUnits: number) {
        this.rect = rect;
        this.totalUnits = totalUnits;
        this.displayedUnits = displayUnits;
        this.updateStartAt = this.startAt;
        this.updateTime = Date.now();
        this.keepWithinLimits();
        this.updateVisRect();
    }

    isPointWithinScrollbar(point: Point): boolean {
        return this.rect.contains(point);
    }

    pointerDownTime: number = 0;
    onPointerDown(event: PointerEvent) {
        let point = new Point(event.clientX - this.parentElement.getBoundingClientRect().left,
            event.clientY - this.parentElement.getBoundingClientRect().top);
        if(this.thumbRect.contains(point)) {
            Scrollbar.stateByZone[this.zone].isDraggingScrollBarThumb = true;
        }
        else if(this.rect.contains(point)) {
            if(event.pointerId) {
                this.parentElement.setPointerCapture(event.pointerId);
                event.preventDefault();
            }
            if(this.isHorizontal) {
                if(point.x > this.thumbRect.right()) {
                    this.scrollByPage(1);
                    Scrollbar.stateByZone[this.zone].isPaging = true;
                    this.pagingDirection = 1;
                } else if(point.x < this.thumbRect.x) {
                    this.scrollByPage(-1);
                    Scrollbar.stateByZone[this.zone].isPaging = true;
                    this.pagingDirection = -1;
                } else {
                    // on thumb
                    Scrollbar.stateByZone[this.zone].isDragging = true;
                    this.dragOffsetFromStart = this.thumbRect.x - point.x;
                }
            } else {
                if(point.y > this.thumbRect.bottom()) {
                    this.scrollByPage(1);
                    Scrollbar.stateByZone[this.zone].isPaging = true;
                    this.pagingDirection = 1;
                } else if(point.y  < this.thumbRect.y) {
                    this.scrollByPage(-1);
                    Scrollbar.stateByZone[this.zone].isPaging = true;
                    this.pagingDirection = -1;
                } else {
                    // on thumb
                    Scrollbar.stateByZone[this.zone].isDragging = true;
                    this.dragOffsetFromStart = this.thumbRect.y - point.y;
                }
            }
        }
        this.pointerDownTime = Date.now();
        if(Scrollbar.stateByZone[this.zone].isPaging) {
            setTimeout(() => { this.pagingHandler() }, plexAnimator.PAGING_REPEAT_TIME * 1000);
        }
        if(Scrollbar.stateByZone[this.zone].isDragging) {
            setTimeout(() => { this.draggingHandler() }, plexAnimator.MIN_TIME_BETWEEN_SCROLL * 1000);
        }
    }

    pagingHandler() {
        plexAnimator.logInfo("PAGING HANDLER - isPaging:", Scrollbar.stateByZone[this.zone].isPaging, "pagingDirection:", this.pagingDirection);
        if(Scrollbar.stateByZone[this.zone].isPaging) {
            let millisecondsSinceEpoch = Date.now();
            let delta = millisecondsSinceEpoch - this.lastMsSinceEpoch;
            this.lastMsSinceEpoch = millisecondsSinceEpoch;
            if(delta > plexAnimator.PAGING_MIN * 1000) {
                this.scrollByPage(this.pagingDirection);
            }
            setTimeout(() => { this.pagingHandler() }, plexAnimator.PAGING_REPEAT_TIME * 1000);
        }
    }

    // we get new scrollbar objects, so we can't use the isPaging or isDragging flags
    
    draggingHandler() {
        if(Scrollbar.stateByZone[this.zone].isDragging) {
            let dirStr = this.showDirection(Math.sign(this.startAt - this.updateStartAt) > 0 ? 1 : -1);
            if(this.startAt !== this.updateStartAt) {
                let millisecondsSinceEpoch = Date.now();
                let delta = millisecondsSinceEpoch - this.lastMsSinceEpoch;
                this.lastMsSinceEpoch = millisecondsSinceEpoch;
                if(delta > plexAnimator.MIN_TIME_BETWEEN_SCROLL * 1000) {
                    plexAnimator.scrollChanged(this.zone, dirStr);
                }
            }
            setTimeout(() => { this.draggingHandler() }, plexAnimator.MIN_TIME_BETWEEN_SCROLL * 1000);
        }
    }
    
    showDirection(direction: 1 | -1): string {
        let s: string = "";
        if(direction == 1 && (this.zone == "sibling" || this.zone == "jump")) {
            s = "up";
        } else if(direction == -1 && (this.zone == "sibling" || this.zone == "jump")) {
            s = "down";
        } else if(direction == 1 && (this.zone == "child" || this.zone == "parent")) {
            s = "left";
        } else if(direction == -1 && (this.zone == "child" || this.zone == "parent")) {
            s = "right";
        }
        return s;
    }

    scrollByPage(delta: 1 | -1) {
        this.startAt += Math.max(this.displayedUnits - 1, 1) * delta;
        this.startAt = this.startAt | 0; // ensure it's an integer
        let dirStr = this.showDirection(delta);
        this.keepWithinLimits();
        this.updateThumbRect();
        plexAnimator.scrollChanged(this.zone, dirStr);
    }

    keepWithinLimits() {
        this.startAt = Math.min(Math.max(0, this.startAt), this.totalUnits - this.displayedUnits);
    }
    
    lastMsSinceEpoch: number = 0;
    onPointerMove(point: Point) {
        if(Scrollbar.stateByZone[this.zone].isDraggingScrollBarThumb) {
            let targetOffset;
            if(this.isHorizontal) {
                targetOffset =  point.x - this.visRect.x;
            } else {
                targetOffset = point.y - this.visRect.y;
            }
            let was = this.startAt;
            let absolutePageNum;
            if(this.isHorizontal) {
                absolutePageNum = targetOffset / this.getDistPerUnit();
            } else {
                absolutePageNum = targetOffset / this.getDistPerUnit();
            }
            absolutePageNum = Math.round(absolutePageNum) | 0; // ensure it's an integer
            absolutePageNum = Math.max(0, Math.min(absolutePageNum, this.totalUnits));
            this.startAt = absolutePageNum;
            this.keepWithinLimits();
            if (this.startAt != was) {
                plexAnimator.scrollChangedTo(this.zone, this.startAt);
            }
        }
        if(Scrollbar.stateByZone[this.zone].isDragging) {
            let targetOffset;
            if(this.isHorizontal) {
                let targetStart = point.x + this.dragOffsetFromStart;
                targetOffset = targetStart - this.visRect.x;
            } else {
                let targetStart = point.y + this.dragOffsetFromStart;
                targetOffset = targetStart - this.visRect.y;
            }
            let was = this.startAt;
            this.startAt = targetOffset/this.getDistPerUnit();
            this.startAt = Math.round(this.startAt) | 0; // ensure it's an integer
            var dirStr = this.showDirection(Math.sign(this.startAt - was) > 0 ? 1 : -1);
            this.keepWithinLimits();
            this.updateThumbRect();
            let millisecondsSinceEpoch = Date.now();
            let delta = millisecondsSinceEpoch - this.lastMsSinceEpoch;
            this.lastMsSinceEpoch = millisecondsSinceEpoch;
            if(delta < plexAnimator.MIN_TIME_BETWEEN_SCROLL * 1000) {
                plexAnimator.logInfo("skipping relayout because last relayout was too recent");
                // simple debouncing for the win?
                return;
            }
            if(this.updateStartAt != this.startAt) {
                plexAnimator.scrollChanged(this.zone, dirStr);
            }
        }
    }

    onPointerLeave(event: PointerEvent) {
        event.preventDefault();
        if(!Scrollbar.stateByZone[this.zone].isDragging) {
            Scrollbar.stateByZone[this.zone].isHovered = false;
            plexAnimator.scrollChanged(this.zone, "unknown"); // TODO possibly get a real direction string
        }
    }

    onPointerUp(event: PointerEvent) {
        event.preventDefault();
        if(Scrollbar.stateByZone[this.zone].isDragging) {
            Scrollbar.stateByZone[this.zone].isDragging = false;
            if(event.pointerId) {
                this.parentElement.releasePointerCapture(event.pointerId);
            }
            this.keepWithinLimits();
            this.updateThumbRect();
            let dirStr = "unknown"; // TODO possibly get a real direction string
            plexAnimator.scrollChanged(this.zone, dirStr);
        }
        Scrollbar.stateByZone[this.zone].isDraggingScrollBarThumb = false;
        Scrollbar.stateByZone[this.zone].isPaging = false;
        Scrollbar.stateByZone[this.zone].isDragging = false;
        // Reset hover too. On touch devices no pointermove fires after release to clear
        // this via plexCanvas.onPointerMove, and pointerleave is unreliable post-touchend
        // on iOS — leaving isHovered stuck keeps isScrollbarInteracting() true, which
        // makes plex classify the next touch as a scrollbar press (touch_isDown=false,
        // long-press timer skipped). For mouse users the very next pointermove restores
        // hover correctly based on actual cursor position.
        Scrollbar.stateByZone[this.zone].isHovered = false;
    }

    scrollByOne(delta: 1 | -1) {
        this.startAt += delta;
        this.startAt = this.startAt | 0; // ensure it's an integer
        let dirStr = this.showDirection(delta);
        this.keepWithinLimits();
        this.updateThumbRect();
        plexAnimator.scrollChanged(this.zone, dirStr);
    }

    onWheel(event: WheelEvent) {
        let cRect = this.zoneRect;
        let rect = new Rect(cRect.x, cRect.y, cRect.width, cRect.height);
        if(rect.contains(new Point(event.clientX, event.clientY))) {
            if(Math.abs(event.deltaX) >  Math.abs(event.deltaY)) {
                this.scrollByOne(event.deltaX < 1 ? -1 : 1)
            } else {
                this.scrollByOne(event.deltaY < 1 ? -1 : 1)
            }
            event.preventDefault();
        }
    }

    getDistPerUnit(): number {
        let length;
        if(this.isHorizontal) {
            length = this.visRect.width;
        } else {
            length = this.visRect.height;
        }
        let size = this.displayedUnits / this.totalUnits;
        size = Math.max(size * length, NormalLayout.SCROLLBAR_SIZE);
        return (length - size) / (this.totalUnits - this.displayedUnits);
    }

    updateThumbRect() {
        let distPerUnit = this.getDistPerUnit();
        let offset = distPerUnit * this.startAt;
        let size = this.displayedUnits * distPerUnit;
        size = Math.max(size, NormalLayout.SCROLLBAR_SIZE);
        if(this.isHorizontal) {
            this.thumbRect = new Rect(this.visRect.x + offset, this.visRect.y, size, this.visRect.height);
        } else {
            this.thumbRect = new Rect(this.visRect.x, this.visRect.y + offset, this.visRect.width, size);
        }
    }
}
