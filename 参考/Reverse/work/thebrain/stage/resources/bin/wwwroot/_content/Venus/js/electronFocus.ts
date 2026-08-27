/**
 * Electron Focus Management
 *
 * Handles focus-related issues specific to Electron on macOS:
 * 1. Right-clicking a background window doesn't focus it
 * 2. Clicking on the tab bar (main BrowserWindow) steals focus from the active tab (pooled BrowserView)
 */

class ElectronFocus {
    private electron: any = null;

    init(): void {
        try {
            this.electron = (window as any).require?.('electron');
        } catch (e) {
            // Not in Electron - nothing to do
            return;
        }

        if (!this.electron?.ipcRenderer) {
            return;
        }

        // macOS: Focus the Electron window on right-click so keyboard events flow.
        // Without this, right-clicking a background window shows the context menu
        // but keyboard events (like Alt for alternate commands) don't work.
        window.addEventListener("contextmenu", () => {
            this.electron.ipcRenderer.send('focus-window');
        });

        // Refocus the active pooled BrowserView after clicks.
        // This ensures that clicking on the tab bar (main BrowserWindow) doesn't
        // steal focus from text inputs in the active tab (pooled BrowserView).
        // Skip if the click target is a focusable element.
        window.addEventListener("mouseup", (event) => {
            const target = event.target as HTMLElement;
            if (target) {
                const tagName = target.tagName?.toLowerCase();
                // Don't refocus if clicking on a focusable element
                if (tagName === 'input' || tagName === 'textarea' ||
                    target.contentEditable === 'true' || target.isContentEditable) {
                    return;
                }
            }
            // Small delay to allow click action to complete
            setTimeout(() => {
                this.electron.ipcRenderer.send('refocus-active-view');
            }, 10);
        });
    }
}

export const electronFocus: ElectronFocus = new ElectronFocus();

// Auto-initialize when module is loaded
electronFocus.init();
