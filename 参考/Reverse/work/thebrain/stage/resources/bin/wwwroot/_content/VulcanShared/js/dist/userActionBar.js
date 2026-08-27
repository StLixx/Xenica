import { safeInvoke, safeInvokeAsync } from "./interop.js";
class UserActionBar {
    constructor() {
        this.dotNetHelper = null;
        this.isReorderMode = false;
        this.longPressTimer = null;
        this.draggedButtonIndex = null;
        this.touchStartX = 0;
        this.touchStartY = 0;
        this.isDragging = false;
        this.draggedElement = null;
        this.dragOffsetX = 0;
        this.isRemoveInProgress = false;
        this.activeTouchId = null;
        this.handleTouchStart = this.handleTouchStart.bind(this);
        this.handleTouchMove = this.handleTouchMove.bind(this);
        this.handleTouchEnd = this.handleTouchEnd.bind(this);
    }
    init(dotNetHelper) {
        this.dotNetHelper = dotNetHelper;
        const toolbar = document.getElementById('bottom-toolbar-section');
        if (toolbar) {
            toolbar.addEventListener('scroll', () => {
                this.updateToolbarMask();
            });
        }
        this.updateReservedHeight();
        this.setupButtonEvents();
        this.updateToolbarMask();
    }
    setupButtonEvents() {
        const toolbar = document.getElementById('bottom-toolbar-section');
        if (!toolbar)
            return;
        const buttons = toolbar.querySelectorAll('[data-button-index]');
        buttons.forEach(button => {
            button.removeEventListener('touchstart', this.handleTouchStart);
            button.removeEventListener('touchmove', this.handleTouchMove);
            button.removeEventListener('touchend', this.handleTouchEnd);
        });
        buttons.forEach(button => {
            button.addEventListener('touchstart', this.handleTouchStart);
            button.addEventListener('touchmove', this.handleTouchMove);
            button.addEventListener('touchend', this.handleTouchEnd);
        });
        const removeButtons = toolbar.querySelectorAll('.remove-button');
        removeButtons.forEach(btn => {
            btn.addEventListener('touchstart', ((e) => {
                if (this.isRemoveInProgress) {
                    e.stopPropagation();
                    e.preventDefault();
                    return;
                }
                this.activeTouchId = e.touches[0].identifier;
                e.stopPropagation();
                e.preventDefault();
                const btnElement = btn;
                const removeIndex = btnElement.getAttribute('data-remove-index');
                if (removeIndex !== null && this.dotNetHelper) {
                    this.isRemoveInProgress = true;
                    safeInvokeAsync(this.dotNetHelper, 'RemoveButton', [parseInt(removeIndex)])
                        .then(() => {
                        setTimeout(() => {
                            this.isRemoveInProgress = false;
                            this.activeTouchId = null;
                        }, 300);
                    });
                }
            }));
            btn.addEventListener('touchend', ((e) => {
                if (this.activeTouchId !== null) {
                    for (let i = 0; i < e.changedTouches.length; i++) {
                        if (e.changedTouches[i].identifier === this.activeTouchId) {
                            this.activeTouchId = null;
                            break;
                        }
                    }
                }
                e.stopPropagation();
                e.preventDefault();
            }));
            btn.addEventListener('touchcancel', ((e) => {
                this.activeTouchId = null;
                e.stopPropagation();
                e.preventDefault();
            }));
        });
        this.setupMenuEventListeners();
    }
    setupMenuEventListeners() {
        const menuOptions = document.querySelectorAll('.menu-option');
        menuOptions.forEach(option => {
            option.addEventListener('touchstart', ((e) => {
                e.stopPropagation();
            }));
        });
    }
    handleTouchStart(e) {
        const target = e.currentTarget;
        const buttonIndex = target.getAttribute('data-button-index');
        const isPlusButton = target.getAttribute('data-plus-button') === 'true';
        if (this.isReorderMode && buttonIndex !== null) {
            this.beginDrag(target, parseInt(buttonIndex), e, !isPlusButton);
            return;
        }
        if (this.longPressTimer)
            clearTimeout(this.longPressTimer);
        this.touchStartX = e.touches[0].clientX;
        this.touchStartY = e.touches[0].clientY;
        this.longPressTimer = setTimeout(() => {
            if (!this.isReorderMode && buttonIndex !== null) {
                this.enterReorderMode();
                this.beginDrag(target, parseInt(buttonIndex), e, !isPlusButton);
            }
        }, 500);
    }
    beginDrag(el, index, e, blockClick) {
        this.draggedButtonIndex = index;
        this.draggedElement = el;
        this.touchStartX = e.touches[0].clientX;
        this.dragOffsetX = this.touchStartX - el.getBoundingClientRect().left;
        el.style.transition = 'none';
        el.style.zIndex = '999';
        if (blockClick)
            e.preventDefault();
    }
    handleTouchMove(e) {
        if (!this.isReorderMode) {
            const moveThreshold = 10;
            if (Math.abs(e.touches[0].clientX - this.touchStartX) > moveThreshold ||
                Math.abs(e.touches[0].clientY - this.touchStartY) > moveThreshold) {
                clearTimeout(this.longPressTimer);
            }
            return;
        }
        if (this.draggedButtonIndex !== null && this.dotNetHelper) {
            const currentX = e.touches[0].clientX;
            const snapThreshold = 15;
            const toolbar = document.getElementById('bottom-toolbar-section');
            if (!toolbar)
                return;
            const buttons = Array.from(toolbar.querySelectorAll('[data-button-index]'));
            let newIndex = this.draggedButtonIndex;
            buttons.forEach((button, index) => {
                const rect = button.getBoundingClientRect();
                const buttonCenter = rect.left + rect.width / 2;
                if (currentX < (buttonCenter + snapThreshold) && index < this.draggedButtonIndex) {
                    newIndex = index;
                }
                else if (currentX > (buttonCenter - snapThreshold) && index > this.draggedButtonIndex) {
                    newIndex = index;
                }
            });
            if (newIndex !== this.draggedButtonIndex) {
                safeInvoke(this.dotNetHelper, 'ReorderButtons', [this.draggedButtonIndex, newIndex]);
                this.draggedButtonIndex = newIndex;
            }
            e.preventDefault();
        }
    }
    handleTouchEnd() {
        if (this.longPressTimer)
            clearTimeout(this.longPressTimer);
        if (this.draggedElement) {
            this.draggedElement.style.transform = '';
            this.draggedElement.style.transition = '';
            this.draggedElement.style.zIndex = '';
            this.draggedElement = null;
        }
        setTimeout(() => {
            this.isDragging = false;
            this.draggedButtonIndex = null;
        }, 50);
    }
    updateToolbarMask() {
        const toolbar = document.getElementById('bottom-toolbar-section');
        if (!toolbar)
            return;
        const tolerance = 1;
        const hasOverflow = toolbar.scrollWidth > toolbar.clientWidth;
        if (!hasOverflow) {
            toolbar.style.webkitMaskImage = '';
            toolbar.style.maskImage = '';
            return;
        }
        const atLeftEdge = toolbar.scrollLeft <= 0;
        const atRightEdge = toolbar.scrollLeft + toolbar.clientWidth + tolerance >= toolbar.scrollWidth;
        const createMask = (leftOffset, rightOffset) => ({
            webkit: `-webkit-linear-gradient(to right, transparent, black ${leftOffset}, black ${rightOffset}, transparent)`,
            standard: `linear-gradient(to right, transparent, black ${leftOffset}, black ${rightOffset}, transparent)`
        });
        let mask;
        if (atLeftEdge) {
            mask = createMask('0%', 'calc(100% - 25px)');
        }
        else if (atRightEdge) {
            mask = createMask('calc(0% + 25px)', '100%');
        }
        else {
            mask = createMask('calc(0% + 25px)', 'calc(100% - 25px)');
        }
        toolbar.style.webkitMaskImage = mask.webkit;
        toolbar.style.maskImage = mask.standard;
    }
    enterReorderMode() {
        this.isReorderMode = true;
        if (this.dotNetHelper) {
            safeInvoke(this.dotNetHelper, 'OnEnteredReorderMode');
        }
        console.log('Reorder mode activated');
    }
    exitReorderMode() {
        this.isReorderMode = false;
        if (this.dotNetHelper) {
            safeInvoke(this.dotNetHelper, 'ExitReorderMode', [true]);
        }
        console.log('Reorder mode deactivated');
    }
    updateReservedHeight() {
        var _a;
        const outerEl = (_a = document.getElementById('bottom-toolbar-section')) === null || _a === void 0 ? void 0 : _a.parentElement;
        if (!outerEl)
            return;
        const reserve = window.innerHeight - outerEl.getBoundingClientRect().top + 4;
        document.documentElement.style.setProperty('--user-action-bar-reserve', reserve + 'px');
    }
    cleanup() {
        document.documentElement.style.removeProperty('--user-action-bar-reserve');
    }
}
export const userActionBar = new UserActionBar();
//# sourceMappingURL=userActionBar.js.map