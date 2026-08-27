import { safeInvoke } from "./interop.js";
class RadialMenu {
    constructor() {
        this.radialMenuElement = null;
        this.lastQuadrant = '';
        this.deadzoneRadius = 0;
        this.isMenuActive = false;
        this.touchMoveListener = (event) => this.handleRadialMenuTouch(event);
        this.touchEndListener = () => this.handleTouchEnd();
    }
    init(dotNetHelper) {
        this.dotNetHelper = dotNetHelper;
        this.setupEventListeners();
    }
    setupEventListeners() {
        this.radialMenuElement = document.getElementById("radial-menu");
        if (!this.radialMenuElement) {
            console.error("The radial menu container was not found.");
            return;
        }
        const innerCircle = this.radialMenuElement.querySelector('.inner-circle');
        if (innerCircle) {
            const innerRect = innerCircle.getBoundingClientRect();
            this.deadzoneRadius = innerRect.width / 2;
        }
        else {
            this.deadzoneRadius = 30;
        }
    }
    activateMenu() {
        this.isMenuActive = true;
        this.radialMenuElement = document.getElementById("radial-menu");
        document.addEventListener("touchmove", this.touchMoveListener, { passive: false });
        document.addEventListener("touchend", this.touchEndListener, { passive: true });
    }
    deactivateMenu() {
        this.isMenuActive = false;
        document.removeEventListener("touchmove", this.touchMoveListener);
        document.removeEventListener("touchend", this.touchEndListener);
    }
    handleRadialMenuTouch(event) {
        if (!this.isMenuActive)
            return;
        event.preventDefault();
        if (!this.radialMenuElement) {
            console.error("Radial menu element not found.");
            return;
        }
        const rect = this.radialMenuElement.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const touch = event.touches[0];
        const touchX = touch.clientX;
        const touchY = touch.clientY;
        const deltaX = touchX - centerX;
        const deltaY = touchY - centerY;
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        if (distance < this.deadzoneRadius) {
            if (this.lastQuadrant !== '') {
                this.lastQuadrant = '';
            }
            return;
        }
        const angle = Math.atan2(deltaY, deltaX) * (180 / Math.PI);
        let quadrant = '';
        if (angle >= -45 && angle < 45) {
            quadrant = 'right';
        }
        else if (angle >= 45 && angle < 135) {
            quadrant = 'bottom';
        }
        else if (angle >= -135 && angle < -45) {
            quadrant = 'top';
        }
        else {
            quadrant = 'left';
        }
        if (quadrant !== this.lastQuadrant) {
            this.lastQuadrant = quadrant;
            switch (quadrant) {
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
    }
    handleTouchEnd() {
        this.lastQuadrant = '';
        if (this.isMenuActive) {
            safeInvoke(this.dotNetHelper, 'MenuClosedWithoutQuadrantSelected');
        }
        else {
        }
        this.deactivateMenu();
    }
}
export const radialMenu = new RadialMenu();
//# sourceMappingURL=radialMenu.js.map