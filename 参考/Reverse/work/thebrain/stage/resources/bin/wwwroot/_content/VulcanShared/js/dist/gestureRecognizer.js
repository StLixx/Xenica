import { safeInvoke } from "./interop.js";
class GestureRecognizer {
    constructor() {
        this.startX = 0;
        this.startY = 0;
        this.startedFromEdge = false;
        this.swipeThreshhold = 100;
        this.edgeSize = 30;
        this.touchStartHandler = (e) => { this.onTouchStart(e); };
        this.touchMoveHandler = (e) => { this.onTouchMove(e); };
    }
    init(dotNetHelper) {
        this.dotNetHelper = dotNetHelper;
        this.addEventListeners();
    }
    addEventListeners() {
        window.addEventListener("touchstart", this.touchStartHandler);
        window.addEventListener("touchmove", this.touchMoveHandler);
    }
    cleanup() {
        window.removeEventListener("touchstart", this.touchStartHandler);
        window.removeEventListener("touchmove", this.touchMoveHandler);
        this.dotNetHelper = null;
    }
    onTouchStart(e) {
        this.startX = e.touches[0].clientX;
        this.startY = e.touches[0].clientY;
        this.startedFromEdge = this.startX < this.edgeSize || this.startX > window.innerWidth - this.edgeSize;
    }
    onTouchMove(e) {
        const moveX = e.touches[0].clientX;
        const moveY = e.touches[0].clientY;
        if (this.startedFromEdge && Math.abs(moveX - this.startX) > this.swipeThreshhold && Math.abs(moveX - this.startX) > Math.abs(moveY - this.startY) * 2) {
            e.preventDefault();
            if (this.dotNetHelper) {
                if (moveX > this.startX) {
                    safeInvoke(this.dotNetHelper, 'OnSwipeRight');
                }
                else {
                    safeInvoke(this.dotNetHelper, 'OnSwipeLeft');
                }
            }
            this.startX = moveX;
            this.startY = moveY;
        }
    }
}
export const gestureRecognizer = new GestureRecognizer();
//# sourceMappingURL=gestureRecognizer.js.map