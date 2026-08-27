import {safeInvoke} from "./interop.js";

class GestureRecognizer {
	dotNetHelper: any;
	
	startX: number = 0;
	startY: number = 0;
	startedFromEdge: boolean = false;
	swipeThreshhold: number = 100;
	edgeSize: number = 30;

	constructor() {
	}

	init(dotNetHelper: any) {
		this.dotNetHelper = dotNetHelper;
		
		this.addEventListeners();
	}
	
	private touchStartHandler = (e: TouchEvent) => { this.onTouchStart(e) };
	private touchMoveHandler = (e: TouchEvent) => { this.onTouchMove(e) };

	addEventListeners() {
        window.addEventListener("touchstart", this.touchStartHandler);
        window.addEventListener("touchmove", this.touchMoveHandler);
	}

	cleanup() {
		window.removeEventListener("touchstart", this.touchStartHandler);
		window.removeEventListener("touchmove", this.touchMoveHandler);
		this.dotNetHelper = null;
	}
	
	onTouchStart(e: TouchEvent) {
		this.startX = e.touches[0].clientX;
		this.startY = e.touches[0].clientY;
		this.startedFromEdge = this.startX < this.edgeSize || this.startX > window.innerWidth - this.edgeSize;
	}
	
	onTouchMove(e: TouchEvent) {
		const moveX = e.touches[0].clientX;
		const moveY = e.touches[0].clientY;

		if(this.startedFromEdge && Math.abs(moveX - this.startX) > this.swipeThreshhold && Math.abs(moveX - this.startX) > Math.abs(moveY - this.startY) * 2) {
			e.preventDefault();  // Prevent scrolling and other native behavior
			if(this.dotNetHelper) {
				if(moveX > this.startX) {
					safeInvoke(this.dotNetHelper, 'OnSwipeRight');
				} else {
					safeInvoke(this.dotNetHelper, 'OnSwipeLeft');
				}
			}
			this.startX = moveX;  // Reset starting point for new swipe
			this.startY = moveY;
		}
	}
	
}

export const gestureRecognizer: GestureRecognizer = new GestureRecognizer();
