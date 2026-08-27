import {safeInvoke, safeInvokeAsync} from "./interop.js";

class UserActionBar {
    dotNetHelper: any | null = null;
    isReorderMode: boolean = false;
    longPressTimer: any = null;
    draggedButtonIndex: number | null = null;
    touchStartX: number = 0;
    touchStartY: number = 0;
    isDragging: boolean = false;
    draggedElement: HTMLElement | null = null;
    dragOffsetX = 0;
    
    isRemoveInProgress: boolean = false;
    activeTouchId: number | null = null;
    
    constructor() {
        // Bind methods to preserve 'this' context
        this.handleTouchStart = this.handleTouchStart.bind(this);
        this.handleTouchMove = this.handleTouchMove.bind(this);
        this.handleTouchEnd = this.handleTouchEnd.bind(this);
    }
    
    // Called from Blazor
    init(dotNetHelper: any) {
        this.dotNetHelper = dotNetHelper;

        const toolbar = document.getElementById('bottom-toolbar-section');

        if(toolbar) {
            toolbar.addEventListener('scroll', () => {
                this.updateToolbarMask();
            });

            // TODO: Figure this out
            // toolbar.addEventListener('resize', () => {
            //     this.updateToolbarMask();
            // })
        }

        // Publish the reserved height so other scroll containers can add bottom padding
        this.updateReservedHeight();

        // Initial setup of event listeners
        this.setupButtonEvents();
        
        this.updateToolbarMask();
        
        
    }
    
    // Setup event listeners for buttons
    setupButtonEvents() {
        const toolbar = document.getElementById('bottom-toolbar-section');
        if (!toolbar) return;
        
        // Remove existing listeners first to avoid duplicates
        const buttons = toolbar.querySelectorAll('[data-button-index]');
        buttons.forEach(button => {
            button.removeEventListener('touchstart', this.handleTouchStart as EventListener);
            button.removeEventListener('touchmove', this.handleTouchMove as EventListener);
            button.removeEventListener('touchend', this.handleTouchEnd as EventListener);
        });
        
        // Add listeners
        buttons.forEach(button => {
            button.addEventListener('touchstart', this.handleTouchStart as EventListener);
            button.addEventListener('touchmove', this.handleTouchMove as EventListener);
            button.addEventListener('touchend', this.handleTouchEnd as EventListener);
        });
        
        // Setup remove buttons with improved touch handling
        const removeButtons = toolbar.querySelectorAll('.remove-button');
        removeButtons.forEach(btn => {
            btn.addEventListener('touchstart', ((e: TouchEvent) => {
                // If a remove operation is already in progress, ignore this touch
                if (this.isRemoveInProgress) {
                    e.stopPropagation();
                    e.preventDefault();
                    return;
                }
                
                // Store the touch identifier to track this specific touch
                this.activeTouchId = e.touches[0].identifier;
                
                e.stopPropagation();
                e.preventDefault();
                
                // Get the button index
                const btnElement = btn as HTMLElement;
                const removeIndex = btnElement.getAttribute('data-remove-index');
                
                if (removeIndex !== null && this.dotNetHelper) {
                    // Set the lock to prevent cascading deletions
                    this.isRemoveInProgress = true;
                    
                    // Call the Blazor method
                    safeInvokeAsync(this.dotNetHelper, 'RemoveButton', [parseInt(removeIndex)])
                        .then(() => {
                            // Keep the lock active for a short time after the operation completes
                            setTimeout(() => {
                                this.isRemoveInProgress = false;
                                this.activeTouchId = null;
                            }, 300); // 300ms should be enough time for the UI to update
                        });
                }
            }) as EventListener);
            
            // Add touch end handler to clear the touch ID
            btn.addEventListener('touchend', ((e: TouchEvent) => {
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
            }) as EventListener);
            
            // Also handle touch cancel
            btn.addEventListener('touchcancel', ((e: TouchEvent) => {
                this.activeTouchId = null;
                e.stopPropagation();
                e.preventDefault();
            }) as EventListener);
        });
        
        // Add listeners for popup menu options
        this.setupMenuEventListeners();
    }
    
    // Setup event listeners for the popup menu
    setupMenuEventListeners() {
        const menuOptions = document.querySelectorAll('.menu-option');
        menuOptions.forEach(option => {
            option.addEventListener('touchstart', ((e: TouchEvent) => {
                e.stopPropagation(); // Prevent propagation to parent elements
            }) as EventListener);
        });
    }
    
    // Handle touch start - detect long press
    handleTouchStart(e: TouchEvent) {
        const target = e.currentTarget as HTMLElement;
        const buttonIndex = target.getAttribute('data-button-index');
        const isPlusButton = target.getAttribute('data-plus-button') === 'true';

        /* already in reorder-mode? — start dragging right away */
        if(this.isReorderMode && buttonIndex !== null) {
            this.beginDrag(target, parseInt(buttonIndex), e, !isPlusButton);
            return;
        }

        /* start long-press timer to *enter* reorder-mode */
        if(this.longPressTimer) clearTimeout(this.longPressTimer);

        this.touchStartX = e.touches[0].clientX;
        this.touchStartY = e.touches[0].clientY;

        this.longPressTimer = setTimeout(() => {
            if(!this.isReorderMode && buttonIndex !== null) {
                this.enterReorderMode();
                this.beginDrag(target, parseInt(buttonIndex), e, !isPlusButton);
            }
        }, 500);      // 500 ms long-press
    }
    
    /** called when a finger should immediately start dragging a button */
    private beginDrag(el: HTMLElement, index: number, e: TouchEvent, blockClick: boolean) {
        this.draggedButtonIndex = index;
        this.draggedElement    = el;
        this.touchStartX       = e.touches[0].clientX;
        this.dragOffsetX       = this.touchStartX - el.getBoundingClientRect().left;

        /* visual feedback – lift the element & cancel any click if asked */
        el.style.transition = 'none';
        el.style.zIndex     = '999';
        if (blockClick) e.preventDefault();
    }
    
    // Handle touch move for dragging
    handleTouchMove(e: TouchEvent) {
        /* cancel long-press if user moved before 500 ms */
        if (!this.isReorderMode) {
            const moveThreshold = 10;
            if (Math.abs(e.touches[0].clientX - this.touchStartX) > moveThreshold ||
                Math.abs(e.touches[0].clientY - this.touchStartY) > moveThreshold) {
                clearTimeout(this.longPressTimer!);
            }
            return;
        }
        
        // Handle dragging in reorder mode
        if (this.draggedButtonIndex !== null && this.dotNetHelper) {
            const currentX = e.touches[0].clientX;
            const snapThreshold = 15;
            
            // Find the toolbar
            const toolbar = document.getElementById('bottom-toolbar-section');
            if (!toolbar) return;
            
            // Get all buttons
            const buttons = Array.from(toolbar.querySelectorAll('[data-button-index]'));
            
            // Find which position we're hovering over
            let newIndex = this.draggedButtonIndex;
            
            buttons.forEach((button, index) => {
                const rect = button.getBoundingClientRect();
                const buttonCenter = rect.left + rect.width / 2;
                
                if(currentX < (buttonCenter + snapThreshold) && index < this.draggedButtonIndex!) {
                    newIndex = index;
                } else if (currentX > (buttonCenter - snapThreshold) && index > this.draggedButtonIndex!) {
                    newIndex = index;
                }
            });
            
            // If position changed, reorder
            if (newIndex !== this.draggedButtonIndex) {
                safeInvoke(this.dotNetHelper, 'ReorderButtons', [this.draggedButtonIndex, newIndex]);
                this.draggedButtonIndex = newIndex;
            }
            
            e.preventDefault(); // Prevent scrolling
        }
    }
    
    // Handle touch end
    handleTouchEnd() {
        if(this.longPressTimer) clearTimeout(this.longPressTimer);

        /* tidy up the element we were dragging */
        if(this.draggedElement) {
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
    
	updateToolbarMask(): void {
        const toolbar = document.getElementById('bottom-toolbar-section');
		if(!toolbar) return;
		
		const tolerance: number = 1;
        
        const hasOverflow = toolbar.scrollWidth > toolbar.clientWidth;
        if(!hasOverflow) {
            toolbar.style.webkitMaskImage = '';
            toolbar.style.maskImage = '';
            return;
        }

		// Determine scroll positions.
		const atLeftEdge = toolbar.scrollLeft <= 0;
		const atRightEdge = toolbar.scrollLeft + toolbar.clientWidth + tolerance >= toolbar.scrollWidth;

		// Helper to create mask image strings.
		const createMask = (leftOffset: string, rightOffset: string) => ({
			webkit: `-webkit-linear-gradient(to right, transparent, black ${leftOffset}, black ${rightOffset}, transparent)`,
			standard: `linear-gradient(to right, transparent, black ${leftOffset}, black ${rightOffset}, transparent)`
		});

		// Choose the appropriate mask based on scroll position.
		let mask;
		if(atLeftEdge) {
			mask = createMask('0%', 'calc(100% - 25px)');
		} else if(atRightEdge) {
			mask = createMask('calc(0% + 25px)', '100%');
		} else {
			mask = createMask('calc(0% + 25px)', 'calc(100% - 25px)');
		}

		toolbar.style.webkitMaskImage = mask.webkit;
		toolbar.style.maskImage = mask.standard;
		
	}
    
    // Enter reorder mode
    enterReorderMode() {
        this.isReorderMode = true;
        if (this.dotNetHelper) {
            safeInvoke(this.dotNetHelper, 'OnEnteredReorderMode');
        }
        
        console.log('Reorder mode activated');
    }
    
    // Exit reorder mode
    exitReorderMode() {
        this.isReorderMode = false;
        if(this.dotNetHelper) {
            safeInvoke(this.dotNetHelper, 'ExitReorderMode', [true]);
        }
        console.log('Reorder mode deactivated');
    }
    
    // Set --user-action-bar-reserve CSS variable so scroll containers can add bottom padding
    updateReservedHeight() {
        const outerEl = document.getElementById('bottom-toolbar-section')?.parentElement;
        if(!outerEl) return;
        const reserve = window.innerHeight - outerEl.getBoundingClientRect().top + 4;
        document.documentElement.style.setProperty('--user-action-bar-reserve', reserve + 'px');
    }

    // Clean up event listeners when component is destroyed
    cleanup() {
        document.documentElement.style.removeProperty('--user-action-bar-reserve');
    }
}

export const userActionBar: UserActionBar = new UserActionBar();
