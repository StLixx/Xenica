import {safeInvoke} from "./interop.js";

class RadialMenu {
	private dotNetHelper: any;
	private radialMenuElement: HTMLElement | null = null;
	private lastQuadrant: string = '';
	private deadzoneRadius: number = 0; // in pixels
	private isMenuActive: boolean = false;
	
	private touchMoveListener = (event: TouchEvent) => this.handleRadialMenuTouch(event);
	private touchEndListener = () => this.handleTouchEnd();

	constructor() {
	}

	// Called from Blazor
	init(dotNetHelper: any) {
		this.dotNetHelper = dotNetHelper;
		this.setupEventListeners();
	}

	private setupEventListeners() {
		this.radialMenuElement = document.getElementById("radial-menu");

		if(!this.radialMenuElement) {
			console.error("The radial menu container was not found.");
			return;
		}

		// Calculate Deadzone Radius
		const innerCircle = this.radialMenuElement.querySelector('.inner-circle') as HTMLElement;
		if(innerCircle) {
			const innerRect = innerCircle.getBoundingClientRect();
			this.deadzoneRadius = innerRect.width / 2;
		} else {
			this.deadzoneRadius = 30; // Default value
		}
	}

	public activateMenu() {
		this.isMenuActive = true;
		// Update radialMenuElement in case it has changed
		this.radialMenuElement = document.getElementById("radial-menu");

		// Set up touchmove and touchend event listeners on the document
		document.addEventListener("touchmove", this.touchMoveListener, { passive: false });
		document.addEventListener("touchend", this.touchEndListener, { passive: true });
	}

	public deactivateMenu() {
		this.isMenuActive = false;

		document.removeEventListener("touchmove", this.touchMoveListener);
		document.removeEventListener("touchend", this.touchEndListener);
	}

	private handleRadialMenuTouch(event: TouchEvent) {
		if(!this.isMenuActive) return;

		event.preventDefault();

		if(!this.radialMenuElement) {
			console.error("Radial menu element not found.");
			return;
		}

		// Get the center position of the radial menu
		const rect = this.radialMenuElement.getBoundingClientRect();
		const centerX = rect.left + rect.width / 2;
		const centerY = rect.top + rect.height / 2;

		// Get the touch point
		const touch = event.touches[0];
		const touchX = touch.clientX;
		const touchY = touch.clientY;

		// Calculate delta
		const deltaX = touchX - centerX;
		const deltaY = touchY - centerY;

		// Calculate Distance from Center
		const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

		// Check if the touch point is within the deadzone
		if(distance < this.deadzoneRadius) {
			if(this.lastQuadrant !== '') {
				// User moved back into deadzone, reset lastQuadrant
				this.lastQuadrant = '';
				// console.log('Within deadzone, no quadrant selected');
			}
			return; // Do not process quadrant selection
		}

		// Calculate angle in degrees
		const angle = Math.atan2(deltaY, deltaX) * (180 / Math.PI);

		// Determine quadrant
		let quadrant: string = '';

		if(angle >= -45 && angle < 45) {
			quadrant = 'right';
		} else if(angle >= 45 && angle < 135) {
			quadrant = 'bottom';
		} else if(angle >= -135 && angle < -45) {
			quadrant = 'top';
		} else {
			quadrant = 'left';
		}

		if(quadrant !== this.lastQuadrant) {
			this.lastQuadrant = quadrant;
			switch(quadrant) {
				case 'top':
					safeInvoke(this.dotNetHelper, 'TopQuadrantSelected');
					break;
				case 'bottom':
					safeInvoke(this.dotNetHelper, 'BottomQuadrantActivated');
					break;
				case 'left':
					safeInvoke(this.dotNetHelper, 'LeftQuadrantActivated');
					break;
				case 'right':
					safeInvoke(this.dotNetHelper, 'RightQuadrantActivated');
					break;
			}
		}

		// console.log(`Quadrant: ${quadrant} (Angle: ${angle}, Distance: ${distance})`);
	}

	private handleTouchEnd() {
		this.lastQuadrant = '';
		if(this.isMenuActive){
			// User has lifted their finger while in the deadzone - no quadrant selected. Show the regular thought context menu.
			// console.log(`handleTouchEnd - Menu is still active, showing regular context menu...`)
			safeInvoke(this.dotNetHelper, 'MenuClosedWithoutQuadrantSelected');
		} else {
			// console.log(`handleTouchEnd - Menu has already been dismissed by selecting a quadrant... do nothing.`)
		}
		this.deactivateMenu();
	}
}

export const radialMenu: RadialMenu = new RadialMenu();
