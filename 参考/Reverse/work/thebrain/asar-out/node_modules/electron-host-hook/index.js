// @ts-nocheck
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HookService = void 0;
const connector_1 = require("./connector");
class HookService extends connector_1.Connector {
    constructor(socket, app) {
        super(socket, app);
    }
    onHostReady() {
        // Native Electron window event forwarding to C#
        const { app, BrowserWindow, Menu, clipboard } = require('electron');
        const socket = this.socket;
        // ========== Native Context Menu Helper ==========
        // Provides native Copy/Cut/Paste context menus for editable fields and selectable text.
        // This ensures users get expected OS-native context menus even when Blazor's custom
        // ContextPopover components would otherwise intercept the right-click.
        const attachNativeContextMenu = (webContents, menuStrings = {}) => {
            webContents.on('context-menu', (event, params) => {
                const menuItems = [];
                // Editable field actions (input, textarea, contenteditable)
                if (params.isEditable) {
                    // Spell check suggestions
                    if (params.misspelledWord && params.dictionarySuggestions.length > 0) {
                        for (const suggestion of params.dictionarySuggestions) {
                            menuItems.push({
                                label: suggestion,
                                click: () => webContents.replaceMisspelling(suggestion)
                            });
                        }
                        menuItems.push({ type: 'separator' });
                    }
                    menuItems.push({
                        label: menuStrings.cut || 'Cut',
                        role: 'cut',
                        enabled: params.selectionText.length > 0
                    });
                    menuItems.push({
                        label: menuStrings.copy || 'Copy',
                        role: 'copy',
                        enabled: params.selectionText.length > 0
                    });
                    menuItems.push({
                        label: menuStrings.paste || 'Paste',
                        role: 'paste'
                    });
                    menuItems.push({ type: 'separator' });
                    menuItems.push({
                        label: menuStrings.selectAll || 'Select All',
                        role: 'selectAll'
                    });
                }
                // Non-editable but has selected text (e.g., release notes, read-only content)
                else if (params.selectionText && params.selectionText.length > 0) {
                    menuItems.push({
                        label: menuStrings.copy || 'Copy',
                        role: 'copy'
                    });
                    menuItems.push({ type: 'separator' });
                    menuItems.push({
                        label: menuStrings.selectAll || 'Select All',
                        role: 'selectAll'
                    });
                }
                // No selection and not editable - let Blazor handle it (don't show native menu)
                else {
                    return;
                }
                if (menuItems.length > 0) {
                    const menu = Menu.buildFromTemplate(menuItems);
                    menu.popup();
                }
            });
        };
        // Queue for window events (polled by C#)
        const windowEventQueue = [];
        global['windowEventQueue'] = windowEventQueue;
        const queueWindowEvent = (eventName, windowId, data) => {
            windowEventQueue.push({ event: eventName, windowId, data });
        };
        // Listen for new windows to attach event handlers
        app.on('browser-window-created', (event, window) => {
            const winId = window.id;
            // Reset zoom to 100% on startup in case it was previously changed
            window.webContents.setZoomFactor(1.0);
            window.webContents.once('did-finish-load', () => {
                window.webContents.setZoomFactor(1.0);
            });
            // Attach native context menu for editable fields and selectable text
            // This provides Copy/Cut/Paste menus for the main window (toolbar, dialogs, etc.)
            attachNativeContextMenu(window.webContents);
            // Recover from failed page loads (e.g., chrome-error after sleep/wake)
            attachDidFailLoadHandler(window.webContents);
            window.on('maximize', () => {
                queueWindowEvent('maximize', winId);
            });
            window.on('unmaximize', () => {
                queueWindowEvent('unmaximize', winId);
            });
            window.on('minimize', () => {
                queueWindowEvent('minimize', winId);
            });
            window.on('restore', () => {
                queueWindowEvent('restore', winId);
            });
            window.on('focus', () => {
                queueWindowEvent('focus', winId);
            });
            window.on('blur', () => {
                queueWindowEvent('blur', winId);
            });
            window.on('enter-full-screen', () => {
                queueWindowEvent('enter-full-screen', winId);
            });
            window.on('leave-full-screen', () => {
                queueWindowEvent('leave-full-screen', winId);
            });
        });
        // Poll and return queued window events
        this.on('window-pollEvents', (args, done) => {
            const events = [...windowEventQueue];
            windowEventQueue.length = 0; // Clear the queue
            done({ success: true, events });
        });
        // Queue for WebEmbed navigation events (polled by C#)
        const webembedNavEventQueue = [];
        global['webembedNavEventQueue'] = webembedNavEventQueue;
        // Poll and return queued WebEmbed navigation events
        this.on('webembed-pollNavigationEvents', (args, done) => {
            const events = [...webembedNavEventQueue];
            webembedNavEventQueue.length = 0; // Clear the queue
            done({ success: true, events });
        });
        // Helper to find a BrowserView by ID (for WebEmbed views)
        const findBrowserView = (browserViewId) => {
            const browserViews = global['browserViews'] || [];
            for (let i = 0; i < browserViews.length; i++) {
                if (browserViews[i]['webembedViewId'] === browserViewId) {
                    return browserViews[i];
                }
            }
            return null;
        };
        const attachHistoryClearer = (webContents) => {
            if (!webContents || webContents['__dekuHistoryClearAttached']) {
                return;
            }
            webContents['__dekuHistoryClearAttached'] = true;
            webContents['__dekuHistoryCleared'] = false;
            webContents['__dekuHistorySawLoading'] = false;
            const isLoadingPath = (url) => {
                try {
                    const path = new URL(url).pathname;
                    return path === '/' || path.startsWith('/loading');
                }
                catch {
                    return false;
                }
            };
            const maybeClearHistory = () => {
                if (webContents['__dekuHistoryCleared']) {
                    return;
                }
                const url = webContents.getURL();
                if (isLoadingPath(url)) {
                    webContents['__dekuHistorySawLoading'] = true;
                    return;
                }
                if (webContents['__dekuHistorySawLoading'] || !webContents['__dekuHistoryCleared']) {
                    webContents['__dekuHistoryCleared'] = true;
                    webContents.clearHistory();
                }
            };
            webContents.on('did-navigate', () => maybeClearHistory());
            webContents.on('did-navigate-in-page', () => maybeClearHistory());
            webContents.on('did-finish-load', () => maybeClearHistory());
        };
        // ========== did-fail-load Recovery ==========
        // Safety net: if a Blazor page load fails with a network error (e.g., server busy
        // during sleep/wake reconnection), retry loading the last known good URL.
        // This recovers pages that end up at chrome-error://chromewebdata/.
        const DID_FAIL_LOAD_MAX_RETRIES = 3;
        const DID_FAIL_LOAD_RETRY_DELAY_MS = 2000;
        const attachDidFailLoadHandler = (webContents) => {
            let failLoadRetryCount = 0;
            let failLoadRetryTimer = null;
            let lastGoodUrl = '';
            webContents.on('did-finish-load', () => {
                try {
                    const url = webContents.getURL();
                    if (url && !url.startsWith('chrome-error:') && url !== 'about:blank') {
                        lastGoodUrl = url;
                        failLoadRetryCount = 0;
                    }
                }
                catch (e) { }
            });
            webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
                if (!isMainFrame)
                    return;
                if (errorCode === -3)
                    return; // ERR_ABORTED is intentional navigation cancellation
                if (failLoadRetryCount >= DID_FAIL_LOAD_MAX_RETRIES) {
                    console.error(`[did-fail-load] Max retries (${DID_FAIL_LOAD_MAX_RETRIES}) reached. errorCode=${errorCode} url=${validatedURL}`);
                    return;
                }
                const retryUrl = lastGoodUrl;
                if (!retryUrl || retryUrl.startsWith('chrome-error:') || retryUrl === 'about:blank') {
                    console.error(`[did-fail-load] No valid URL to retry. errorCode=${errorCode} url=${validatedURL}`);
                    return;
                }
                failLoadRetryCount++;
                const delay = DID_FAIL_LOAD_RETRY_DELAY_MS * failLoadRetryCount;
                console.log(`[did-fail-load] Load failed (errorCode=${errorCode}, ${errorDescription}), retrying ${failLoadRetryCount}/${DID_FAIL_LOAD_MAX_RETRIES} in ${delay}ms: ${retryUrl}`);
                if (failLoadRetryTimer)
                    clearTimeout(failLoadRetryTimer);
                failLoadRetryTimer = setTimeout(() => {
                    failLoadRetryTimer = null;
                    if (!webContents.isDestroyed()) {
                        webContents.loadURL(retryUrl);
                    }
                }, delay);
            });
        };
        // ========== WebEmbed BrowserView Handlers ==========
        // These handlers manage BrowserViews for embedded web content (URL attachments).
        // Uses addBrowserView to allow coexistence with pooled BrowserViews.
        // Create a WebEmbed BrowserView
        this.on('webembed-createBrowserView', async (args, done) => {
            const { BrowserWindow, BrowserView } = require('electron');
            try {
                const params = Array.isArray(args) ? args : [args];
                const optionsJson = params[0] || '{}';
                const options = JSON.parse(optionsJson);
                const url = options.url;
                const viewId = options.viewId;
                const windowId = options.windowId;
                // Get the target window
                const targetWindow = windowId
                    ? BrowserWindow.fromId(windowId)
                    : BrowserWindow.getAllWindows()[0];
                if (!targetWindow) {
                    done({ success: false, error: 'Window not found' });
                    return;
                }
                // Create new BrowserView with security settings
                const view = new BrowserView({
                    webPreferences: {
                        nodeIntegration: false,
                        contextIsolation: true,
                        sandbox: true
                    }
                });
                // Track view in global array
                const browserViews = global['browserViews'] = global['browserViews'] || [];
                view['webembedViewId'] = viewId;
                view['webembedWindowId'] = targetWindow.id;
                view['webembedParentTabId'] = options.parentTabId || null;
                browserViews.push(view);
                // Store localized menu strings on the view
                const menuStrings = options.menuStrings || {};
                // Add to window using addBrowserView (not setBrowserView!)
                // This allows coexistence with pooled BrowserViews
                targetWindow.addBrowserView(view);
                // Start hidden off-screen
                view.setBounds({ x: -10000, y: -10000, width: 1, height: 1 });
                // When the host OS is in dark mode, Chromium paints its UA canvas dark
                // for pages with no background set on html/body (e.g. librera.mobi),
                // making dark page text unreadable. Override the canvas fallback to white
                // via CDP so the fix applies only to pixels the page itself leaves bare —
                // pages with their own (including dark) backgrounds paint over it
                // untouched. Chromium resets the override per navigation, so re-send on
                // every did-finish-load.
                view.webContents.on('did-finish-load', () => {
                    try {
                        if (!view.webContents['__dekuCanvasOverrideAttached']) {
                            view.webContents.debugger.attach('1.3');
                            view.webContents['__dekuCanvasOverrideAttached'] = true;
                        }
                        view.webContents.debugger
                            .sendCommand('Emulation.setDefaultBackgroundColorOverride', {
                            color: { r: 255, g: 255, b: 255, a: 1 }
                        })
                            .catch(() => { });
                    }
                    catch (e) {
                        // debugger.attach throws if another session is already attached
                        // (e.g. user opened DevTools). Accept the dark canvas in that case
                        // — they're debugging, so default behaviour is fine.
                    }
                });
                // Setup context menu for right-click
                view.webContents.on('context-menu', (event, params) => {
                    const { Menu, shell, clipboard } = require('electron');
                    const menuItems = [];
                    // Text selection actions
                    if (params.selectionText) {
                        menuItems.push({
                            label: menuStrings.copy || 'Copy',
                            role: 'copy'
                        });
                        menuItems.push({ type: 'separator' });
                    }
                    // Link actions
                    if (params.linkURL) {
                        menuItems.push({
                            label: menuStrings.openLinkInBrowser || 'Open Link in Browser',
                            click: () => shell.openExternal(params.linkURL)
                        });
                        menuItems.push({
                            label: menuStrings.copyLinkAddress || 'Copy Link Address',
                            click: () => clipboard.writeText(params.linkURL)
                        });
                        menuItems.push({ type: 'separator' });
                    }
                    // Image actions
                    if (params.mediaType === 'image' && params.srcURL) {
                        menuItems.push({
                            label: menuStrings.openImageInBrowser || 'Open Image in Browser',
                            click: () => shell.openExternal(params.srcURL)
                        });
                        menuItems.push({
                            label: menuStrings.copyImageAddress || 'Copy Image Address',
                            click: () => clipboard.writeText(params.srcURL)
                        });
                        menuItems.push({ type: 'separator' });
                    }
                    // Editable field actions
                    if (params.isEditable) {
                        menuItems.push({ label: menuStrings.cut || 'Cut', role: 'cut' });
                        menuItems.push({ label: menuStrings.copy || 'Copy', role: 'copy' });
                        menuItems.push({ label: menuStrings.paste || 'Paste', role: 'paste' });
                        menuItems.push({ type: 'separator' });
                    }
                    // Navigation actions
                    menuItems.push({
                        label: menuStrings.back || 'Back',
                        enabled: view.webContents.canGoBack(),
                        click: () => view.webContents.goBack()
                    });
                    menuItems.push({
                        label: menuStrings.forward || 'Forward',
                        enabled: view.webContents.canGoForward(),
                        click: () => view.webContents.goForward()
                    });
                    menuItems.push({
                        label: menuStrings.reload || 'Reload',
                        click: () => view.webContents.reload()
                    });
                    menuItems.push({ type: 'separator' });
                    menuItems.push({
                        label: menuStrings.openInBrowser || 'Open in Browser',
                        click: () => shell.openExternal(view.webContents.getURL())
                    });
                    if (menuItems.length > 0) {
                        const menu = Menu.buildFromTemplate(menuItems);
                        menu.popup();
                    }
                });
                // Listen for navigation events to update the URL bar
                const navQueue = global['webembedNavEventQueue'] || [];
                view.webContents.on('did-navigate', (event, url) => {
                    navQueue.push({ viewId, url });
                });
                view.webContents.on('did-navigate-in-page', (event, url) => {
                    navQueue.push({ viewId, url });
                });
                // Handle HTML5 fullscreen (e.g., YouTube video fullscreen button).
                // When content requests fullscreen, expand the BrowserView to fill the entire window.
                view.webContents.on('enter-html-full-screen', () => {
                    try {
                        const winId = view['webembedWindowId'];
                        const parentWin = winId ? BrowserWindow.fromId(winId) : null;
                        if (parentWin) {
                            view['__preFullscreenBounds'] = view.getBounds();
                            view['__isHtmlFullscreen'] = true;
                            const [w, h] = parentWin.getContentSize();
                            view.setBounds({ x: 0, y: 0, width: w, height: h });
                            // Track window resizes while in fullscreen so the BrowserView
                            // stays full-size (e.g., window transitioning to OS fullscreen)
                            const resizeHandler = () => {
                                if (view['__isHtmlFullscreen'] && !view.webContents.isDestroyed()) {
                                    const [rw, rh] = parentWin.getContentSize();
                                    view.setBounds({ x: 0, y: 0, width: rw, height: rh });
                                }
                            };
                            view['__fullscreenResizeHandler'] = resizeHandler;
                            parentWin.on('resize', resizeHandler);
                        }
                    }
                    catch (e) {
                        // Ignore errors
                    }
                });
                view.webContents.on('leave-html-full-screen', () => {
                    try {
                        // Remove the resize listener
                        const resizeHandler = view['__fullscreenResizeHandler'];
                        if (resizeHandler) {
                            const winId = view['webembedWindowId'];
                            const parentWin = winId ? BrowserWindow.fromId(winId) : null;
                            if (parentWin) {
                                parentWin.removeListener('resize', resizeHandler);
                            }
                            delete view['__fullscreenResizeHandler'];
                        }
                        view['__isHtmlFullscreen'] = false;
                        // Restore to the most recent bounds requested while in fullscreen,
                        // or the bounds from before entering fullscreen
                        const bounds = view['__pendingBounds'] || view['__preFullscreenBounds'];
                        if (bounds) {
                            view.setBounds(bounds);
                        }
                        delete view['__preFullscreenBounds'];
                        delete view['__pendingBounds'];
                    }
                    catch (e) {
                        // Ignore errors
                    }
                });
                // Load the URL (don't await - loadURL can take >1s and would timeout the IPC call)
                view.webContents.loadURL(url);
                done({ success: true, viewId: viewId });
            }
            catch (error) {
                done({ success: false, error: error.message || 'Failed to create WebEmbed BrowserView' });
            }
        });
        // Set bounds for a WebEmbed BrowserView
        this.on('webembed-setBounds', (args, done) => {
            try {
                const params = Array.isArray(args) ? args : [args];
                const optionsJson = params[0] || '{}';
                const options = JSON.parse(optionsJson);
                const viewId = options.viewId;
                const x = options.x || 0;
                const y = options.y || 0;
                const width = options.width || 800;
                const height = options.height || 600;
                const view = findBrowserView(viewId);
                if (!view) {
                    done({ success: false, error: 'WebEmbed BrowserView not found' });
                    return;
                }
                // Hide the view if content area has zero dimensions (e.g., nav maximized)
                if (width <= 0 || height <= 0) {
                    view.setBounds({ x: -10000, y: -10000, width: 1, height: 1 });
                    done({ success: true });
                    return;
                }
                // Add toolbar height offset to position correctly below toolbar
                // Uses same global as pool views, defaults to 48 if not set
                const toolbarHeight = global['poolToolbarHeight'] ?? 48;
                const resolvedBounds = { x, y: y + toolbarHeight, width, height };
                // If the view is in HTML fullscreen (e.g., YouTube video),
                // save bounds for restoration but don't apply them now
                if (view['__isHtmlFullscreen']) {
                    view['__pendingBounds'] = resolvedBounds;
                    done({ success: true });
                    return;
                }
                view.setBounds(resolvedBounds);
                done({ success: true });
            }
            catch (error) {
                done({ success: false, error: error.message || 'Failed to set bounds' });
            }
        });
        // Navigate a WebEmbed BrowserView to a new URL
        this.on('webembed-navigate', async (args, done) => {
            try {
                const params = Array.isArray(args) ? args : [args];
                const optionsJson = params[0] || '{}';
                const options = JSON.parse(optionsJson);
                const viewId = options.viewId;
                const url = options.url;
                const view = findBrowserView(viewId);
                if (!view) {
                    done({ success: false, error: 'WebEmbed BrowserView not found' });
                    return;
                }
                await view.webContents.loadURL(url);
                done({ success: true });
            }
            catch (error) {
                done({ success: false, error: error.message || 'Failed to navigate' });
            }
        });
        // Reload a WebEmbed BrowserView
        this.on('webembed-reload', (args, done) => {
            try {
                const params = Array.isArray(args) ? args : [args];
                const optionsJson = params[0] || '{}';
                const options = JSON.parse(optionsJson);
                const viewId = options.viewId;
                const view = findBrowserView(viewId);
                if (!view) {
                    done({ success: false, error: 'WebEmbed BrowserView not found' });
                    return;
                }
                view.webContents.reload();
                done({ success: true });
            }
            catch (error) {
                done({ success: false, error: error.message || 'Failed to reload' });
            }
        });
        // Destroy a WebEmbed BrowserView
        this.on('webembed-destroyBrowserView', (args, done) => {
            const { BrowserWindow } = require('electron');
            try {
                const params = Array.isArray(args) ? args : [args];
                const optionsJson = params[0] || '{}';
                const options = JSON.parse(optionsJson);
                const viewId = options.viewId;
                const browserViews = global['browserViews'] || [];
                const viewIndex = browserViews.findIndex(v => v['webembedViewId'] === viewId);
                if (viewIndex === -1) {
                    done({ success: false, error: 'WebEmbed BrowserView not found' });
                    return;
                }
                const view = browserViews[viewIndex];
                const windowId = view['webembedWindowId'];
                const window = windowId ? BrowserWindow.fromId(windowId) : null;
                // Clean up fullscreen resize listener if active
                const resizeHandler = view['__fullscreenResizeHandler'];
                if (resizeHandler && window) {
                    window.removeListener('resize', resizeHandler);
                }
                // Remove from window if it still exists
                if (window) {
                    window.removeBrowserView(view);
                }
                // Destroy webContents to free Chromium renderer process
                if (view.webContents && !view.webContents.isDestroyed()) {
                    view.webContents.destroy();
                }
                // Remove from tracking array
                browserViews.splice(viewIndex, 1);
                done({ success: true });
            }
            catch (error) {
                done({ success: false, error: error.message || 'Failed to destroy WebEmbed BrowserView' });
            }
        });
        // Destroy all WebEmbed BrowserViews for a given parent tab
        this.on('webembed-destroyAllForParentTab', (args, done) => {
            const { BrowserWindow } = require('electron');
            try {
                const params = Array.isArray(args) ? args : [args];
                const optionsJson = params[0] || '{}';
                const options = JSON.parse(optionsJson);
                const parentTabId = options.parentTabId;
                if (!parentTabId) {
                    done({ success: true, destroyedCount: 0 });
                    return;
                }
                const browserViews = global['browserViews'] || [];
                const viewsToDestroy = [];
                // Find all views with matching parentTabId
                for (let i = browserViews.length - 1; i >= 0; i--) {
                    const view = browserViews[i];
                    if (view && view['webembedParentTabId'] === parentTabId) {
                        viewsToDestroy.push({ view, index: i });
                    }
                }
                // Destroy each matching view
                for (const { view, index } of viewsToDestroy) {
                    const windowId = view['webembedWindowId'];
                    const window = windowId ? BrowserWindow.fromId(windowId) : null;
                    // Clean up fullscreen resize listener if active
                    const resizeHandler = view['__fullscreenResizeHandler'];
                    if (resizeHandler && window) {
                        window.removeListener('resize', resizeHandler);
                    }
                    // Remove from window if it still exists
                    if (window) {
                        window.removeBrowserView(view);
                    }
                    // Destroy webContents to free Chromium renderer process
                    if (view.webContents && !view.webContents.isDestroyed()) {
                        view.webContents.destroy();
                    }
                    // Remove from tracking array
                    browserViews.splice(index, 1);
                }
                done({ success: true, destroyedCount: viewsToDestroy.length });
            }
            catch (error) {
                done({ success: false, error: error.message || 'Failed to destroy WebEmbed views for parent tab' });
            }
        });
        // ========== End WebEmbed BrowserView Handlers ==========
        // Screenshot capture
        this.on('browserView-capturePage', async (argsOrId, done) => {
            const browserViewId = Array.isArray(argsOrId) ? argsOrId[0] : argsOrId;
            try {
                const view = findBrowserView(browserViewId);
                if (view && view.webContents) {
                    const image = await view.webContents.capturePage();
                    const base64 = image.toPNG().toString('base64');
                    done({ success: true, base64: base64 });
                }
                else {
                    done({ success: false, error: 'BrowserView not found' });
                }
            }
            catch (error) {
                done({ success: false, error: error.message || 'Unknown error' });
            }
        });
        // Navigation: go back
        this.on('browserView-goBack', (argsOrId, done) => {
            const browserViewId = Array.isArray(argsOrId) ? argsOrId[0] : argsOrId;
            try {
                const view = findBrowserView(browserViewId);
                if (view && view.webContents) {
                    view.webContents.goBack();
                    done({ success: true });
                }
                else {
                    done({ success: false, error: 'BrowserView not found' });
                }
            }
            catch (error) {
                done({ success: false, error: error.message || 'Unknown error' });
            }
        });
        // Navigation: go forward
        this.on('browserView-goForward', (argsOrId, done) => {
            const browserViewId = Array.isArray(argsOrId) ? argsOrId[0] : argsOrId;
            try {
                const view = findBrowserView(browserViewId);
                if (view && view.webContents) {
                    view.webContents.goForward();
                    done({ success: true });
                }
                else {
                    done({ success: false, error: 'BrowserView not found' });
                }
            }
            catch (error) {
                done({ success: false, error: error.message || 'Unknown error' });
            }
        });
        // Navigation state: canGoBack/canGoForward
        this.on('browserView-getNavigationState', (argsOrId, done) => {
            const browserViewId = Array.isArray(argsOrId) ? argsOrId[0] : argsOrId;
            try {
                const view = findBrowserView(browserViewId);
                if (view && view.webContents) {
                    done({
                        success: true,
                        canGoBack: view.webContents.canGoBack(),
                        canGoForward: view.webContents.canGoForward()
                    });
                }
                else {
                    done({ success: false, error: 'BrowserView not found' });
                }
            }
            catch (error) {
                done({ success: false, error: error.message || 'Unknown error' });
            }
        });
        // Get current URL
        this.on('browserView-getUrl', (argsOrId, done) => {
            const browserViewId = Array.isArray(argsOrId) ? argsOrId[0] : argsOrId;
            try {
                const view = findBrowserView(browserViewId);
                if (view && view.webContents) {
                    done({
                        success: true,
                        url: view.webContents.getURL()
                    });
                }
                else {
                    done({ success: false, error: 'BrowserView not found' });
                }
            }
            catch (error) {
                done({ success: false, error: error.message || 'Unknown error' });
            }
        });
        // PDF Export - renders HTML in hidden window and exports to PDF
        this.on('pdf-export', async (args, done) => {
            const { BrowserWindow } = require('electron');
            let hiddenWindow = null;
            try {
                // Parse arguments: [htmlContent, optionsJson]
                const params = Array.isArray(args) ? args : [args];
                const htmlContent = params[0] || '';
                const optionsJson = params[1] || '{}';
                // Parse options from JSON
                let options = {};
                try {
                    options = JSON.parse(optionsJson);
                }
                catch (e) {
                    // Use defaults if parsing fails
                }
                const pageSize = options.pageSize || 'A4';
                const landscape = options.landscape === true;
                const marginTop = parseFloat(options.marginTop) || 1.0;
                const marginRight = parseFloat(options.marginRight) || 1.0;
                const marginBottom = parseFloat(options.marginBottom) || 1.0;
                const marginLeft = parseFloat(options.marginLeft) || 1.0;
                const scale = parseFloat(options.scale) || 1.0;
                const printBackground = options.printBackground !== false;
                // Create hidden window for PDF rendering
                hiddenWindow = new BrowserWindow({
                    show: false,
                    width: 800,
                    height: 600,
                    webPreferences: {
                        nodeIntegration: false,
                        contextIsolation: true
                    }
                });
                // Load blank page first, then set HTML content
                await hiddenWindow.loadURL('about:blank');
                // Set HTML content directly using executeJavaScript
                await hiddenWindow.webContents.executeJavaScript(`
                    document.open();
                    document.write(${JSON.stringify(htmlContent)});
                    document.close();
                `);
                // Wait for content to render
                await new Promise(resolve => setTimeout(resolve, 500));
                // Map page size string to Electron's expected format
                const pageSizeMap = {
                    'A4': 'A4',
                    'LETTER': 'Letter',
                    'LEGAL': 'Legal',
                    'A3': 'A3',
                    'A5': 'A5',
                    'TABLOID': 'Tabloid'
                };
                const electronPageSize = pageSizeMap[pageSize.toUpperCase()] || 'A4';
                // Generate PDF with margins specified in inches
                const pdfOptions = {
                    pageSize: electronPageSize,
                    printBackground: printBackground,
                    landscape: landscape,
                    margins: {
                        top: marginTop,
                        bottom: marginBottom,
                        left: marginLeft,
                        right: marginRight
                    },
                    scale: scale
                };
                const pdfBuffer = await hiddenWindow.webContents.printToPDF(pdfOptions);
                const base64Pdf = pdfBuffer.toString('base64');
                done({ success: true, pdfBase64: base64Pdf });
            }
            catch (error) {
                done({ success: false, error: error.message || 'PDF export failed' });
            }
            finally {
                if (hiddenWindow) {
                    hiddenWindow.destroy();
                }
            }
        });
        // Print Notes - renders HTML in hidden window and prints
        this.on('print-notes', async (args, done) => {
            const { BrowserWindow } = require('electron');
            let hiddenWindow = null;
            try {
                // Parse arguments: [htmlContent, optionsJson]
                const params = Array.isArray(args) ? args : [args];
                const htmlContent = params[0] || '';
                const optionsJson = params[1] || '{}';
                // Parse options from JSON
                let options = {};
                try {
                    options = JSON.parse(optionsJson);
                }
                catch (e) {
                    // Use defaults if parsing fails
                }
                const printerName = options.printerName || '';
                const pageSize = options.pageSize || 'Letter';
                const landscape = options.landscape === true;
                const marginTop = parseFloat(options.marginTop) || 1.0;
                const marginRight = parseFloat(options.marginRight) || 1.0;
                const marginBottom = parseFloat(options.marginBottom) || 1.0;
                const marginLeft = parseFloat(options.marginLeft) || 1.0;
                const scale = parseFloat(options.scale) || 1.0;
                const printBackground = options.printBackground !== false;
                const color = options.color !== false;
                const copies = parseInt(options.copies) || 1;
                // Create hidden window for print rendering
                hiddenWindow = new BrowserWindow({
                    show: false,
                    width: 800,
                    height: 600,
                    webPreferences: {
                        nodeIntegration: false,
                        contextIsolation: true
                    }
                });
                // Load blank page first, then set HTML content
                await hiddenWindow.loadURL('about:blank');
                // Set HTML content directly using executeJavaScript
                await hiddenWindow.webContents.executeJavaScript(`
                    document.open();
                    document.write(${JSON.stringify(htmlContent)});
                    document.close();
                `);
                // Wait for content to render
                await new Promise(resolve => setTimeout(resolve, 500));
                // Map page size string to Electron's expected format
                const pageSizeMap = {
                    'A4': 'A4',
                    'LETTER': 'Letter',
                    'LEGAL': 'Legal',
                    'A3': 'A3',
                    'A5': 'A5',
                    'TABLOID': 'Tabloid'
                };
                const electronPageSize = pageSizeMap[pageSize.toUpperCase()] || 'Letter';
                // Build print options
                // Note: scaleFactor is 1-100 (percentage), margins are in pixels (72 per inch)
                const printOptions = {
                    silent: false, // Show system print dialog
                    printBackground: printBackground,
                    color: color,
                    landscape: landscape,
                    scaleFactor: Math.round(scale * 100), // Convert decimal to percentage (1.0 -> 100)
                    copies: copies,
                    margins: {
                        marginType: 'custom',
                        top: Math.round(marginTop * 72), // Convert inches to pixels
                        bottom: Math.round(marginBottom * 72),
                        left: Math.round(marginLeft * 72),
                        right: Math.round(marginRight * 72)
                    },
                    pageSize: electronPageSize
                };
                // Set printer if specified
                if (printerName) {
                    printOptions.deviceName = printerName;
                    printOptions.silent = true; // Silent print when printer is pre-selected
                }
                // Print the content - use callback style for compatibility
                const success = await new Promise((resolve) => {
                    hiddenWindow.webContents.print(printOptions, (success, failureReason) => {
                        if (!success && failureReason) {
                            console.error('Print failed:', failureReason);
                        }
                        resolve(success);
                    });
                });
                done({ success: success });
            }
            catch (error) {
                done({ success: false, error: error.message || 'Print failed' });
            }
            finally {
                if (hiddenWindow) {
                    hiddenWindow.destroy();
                }
            }
        });
        // Update TitleBarOverlay - dynamically changes title bar colors and height
        // Supports optional windowId parameter for multi-window support
        this.on('window-setTitleBarOverlay', (args, done) => {
            const { BrowserWindow } = require('electron');
            try {
                const params = Array.isArray(args) ? args : [args];
                const optionsJson = params[0] || '{}';
                let options = {};
                try {
                    options = JSON.parse(optionsJson);
                }
                catch (e) {
                    // Use defaults if parsing fails
                }
                // Get window by ID if provided, otherwise fall back to first window
                let win;
                if (options.windowId) {
                    win = BrowserWindow.fromId(options.windowId);
                }
                if (!win) {
                    const windows = BrowserWindow.getAllWindows();
                    win = windows.length > 0 ? windows[0] : null;
                }
                if (win) {
                    win.setTitleBarOverlay({
                        color: options.color || '#2b2b2b',
                        symbolColor: options.symbolColor || '#ffffff',
                        height: options.height || 47
                    });
                    done({ success: true });
                }
                else {
                    done({ success: false, error: 'No window found' });
                }
            }
            catch (error) {
                done({ success: false, error: error.message || 'Unknown error' });
            }
        });
        // Update window button position (macOS traffic lights) - dynamically changes position
        // Supports optional windowId parameter for multi-window support
        this.on('window-setWindowButtonPosition', (args, done) => {
            const { BrowserWindow } = require('electron');
            try {
                const params = Array.isArray(args) ? args : [args];
                const optionsJson = params[0] || '{}';
                let options = {};
                try {
                    options = JSON.parse(optionsJson);
                }
                catch (e) {
                    // Use defaults if parsing fails
                }
                // Get window by ID if provided, otherwise fall back to first window
                let win;
                if (options.windowId) {
                    win = BrowserWindow.fromId(options.windowId);
                }
                if (!win) {
                    const windows = BrowserWindow.getAllWindows();
                    win = windows.length > 0 ? windows[0] : null;
                }
                if (win) {
                    const position = {
                        x: options.x || 8,
                        y: options.y || 16
                    };
                    win.setWindowButtonPosition(position);
                    done({ success: true });
                }
                else {
                    done({ success: false, error: 'No window found' });
                }
            }
            catch (error) {
                done({ success: false, error: error.message || 'Unknown error' });
            }
        });
        // Get window normal bounds (pre-maximized size) - not exposed by Electron.NET
        // Supports optional windowId parameter for multi-window support
        this.on('window-getNormalBounds', (args, done) => {
            const { BrowserWindow } = require('electron');
            try {
                // Parse args - can be { windowId: number } or null/undefined
                const params = args || {};
                const windowId = params.windowId;
                let win;
                if (windowId) {
                    // Get specific window by ID
                    win = BrowserWindow.fromId(windowId);
                }
                else {
                    // Fallback: get focused window or first window
                    win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
                }
                if (win) {
                    const normalBounds = win.getNormalBounds();
                    done({
                        success: true,
                        x: normalBounds.x,
                        y: normalBounds.y,
                        width: normalBounds.width,
                        height: normalBounds.height
                    });
                }
                else {
                    done({ success: false, error: 'No window found' });
                }
            }
            catch (error) {
                done({ success: false, error: error.message || 'Unknown error' });
            }
        });
        // ========== Cursor Position ==========
        // Get current cursor screen position
        this.on('cursor-getPosition', (args, done) => {
            const { screen } = require('electron');
            try {
                const pos = screen.getCursorScreenPoint();
                done({ success: true, x: pos.x, y: pos.y });
            }
            catch (error) {
                done({ success: false, error: error.message || 'Unknown error' });
            }
        });
        // ========== Drag Feedback Window ==========
        // Small floating window that shows brain icon when dragging a tab outside the tab bar
        let dragFeedbackWindow = null;
        let dragFeedbackAnimationId = null;
        let dragFeedbackTimeoutId = null;
        const DRAG_FEEDBACK_MAX_DURATION_MS = 10000; // 10 second safety timeout
        // Helper to clean up all drag feedback resources
        const cleanupDragFeedback = () => {
            if (dragFeedbackAnimationId) {
                clearTimeout(dragFeedbackAnimationId);
                dragFeedbackAnimationId = null;
            }
            if (dragFeedbackTimeoutId) {
                clearTimeout(dragFeedbackTimeoutId);
                dragFeedbackTimeoutId = null;
            }
            if (dragFeedbackWindow && !dragFeedbackWindow.isDestroyed()) {
                dragFeedbackWindow.destroy();
            }
            dragFeedbackWindow = null;
        };
        // Start drag feedback - creates window with image and starts cursor tracking
        this.on('dragFeedback-start', async (args, done) => {
            const { BrowserWindow, screen } = require('electron');
            const params = Array.isArray(args) ? args : [args];
            const imagePath = params[0] || '';
            const backgroundColor = params[1] || '#282828';
            if (!imagePath) {
                done({ success: false, error: 'No image path provided' });
                return;
            }
            try {
                // Clean up any existing drag feedback before starting new one
                cleanupDragFeedback();
                dragFeedbackWindow = new BrowserWindow({
                    width: 120,
                    height: 120,
                    show: false,
                    frame: false,
                    transparent: true,
                    alwaysOnTop: true,
                    skipTaskbar: true,
                    hasShadow: false,
                    resizable: false,
                    focusable: false,
                    webPreferences: {
                        nodeIntegration: false,
                        contextIsolation: true
                    }
                });
                // Load HTML with the brain icon
                const html = `<!DOCTYPE html>
<html>
<head>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { background: transparent !important; overflow: hidden; }
        .container {
            width: 96px;
            height: 96px;
            padding: 8px;
            border-radius: 12px;
            overflow: hidden;
            background: ${backgroundColor};
            box-shadow: 0 4px 8px rgba(0,0,0,0.4);
        }
        img {
            width: 100%;
            height: 100%;
            border-radius: 8px;
            object-fit: cover;
        }
    </style>
</head>
<body style="padding: 8px">
    <div class="container">
        <img src="${imagePath}" />
    </div>
</body>
</html>`;
                await dragFeedbackWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
                // Small delay to ensure content is rendered
                await new Promise(resolve => setTimeout(resolve, 50));
                // Position at cursor and show
                const cursorPos = screen.getCursorScreenPoint();
                dragFeedbackWindow.setPosition(cursorPos.x + 15, cursorPos.y + 15, false);
                dragFeedbackWindow.showInactive();
                // Start cursor tracking loop
                const trackCursor = () => {
                    if (!dragFeedbackWindow || dragFeedbackWindow.isDestroyed() || !dragFeedbackWindow.isVisible()) {
                        return;
                    }
                    const pos = screen.getCursorScreenPoint();
                    dragFeedbackWindow.setPosition(pos.x + 15, pos.y + 15, false);
                    dragFeedbackAnimationId = setTimeout(trackCursor, 16);
                };
                trackCursor();
                // Safety timeout - auto-cleanup if drag feedback gets stuck
                dragFeedbackTimeoutId = setTimeout(() => {
                    console.warn('Drag feedback safety timeout triggered - cleaning up stuck window');
                    cleanupDragFeedback();
                }, DRAG_FEEDBACK_MAX_DURATION_MS);
                done({ success: true });
            }
            catch (error) {
                done({ success: false, error: error.message || 'Unknown error' });
            }
        });
        // Stop drag feedback - destroys window and stops cursor tracking
        this.on('dragFeedback-stop', (args, done) => {
            try {
                cleanupDragFeedback();
                done({ success: true });
            }
            catch (error) {
                done({ success: false, error: error.message || 'Unknown error' });
            }
        });
        // ========== Cross-Window Tab Dragging ==========
        // Get window at screen coordinates (for detecting drop targets)
        this.on('window-getWindowAtPoint', (args, done) => {
            const { BrowserWindow } = require('electron');
            const params = Array.isArray(args) ? args : [args];
            const x = params[0];
            const y = params[1];
            console.log(`[HostHook] window-getWindowAtPoint: x=${x}, y=${y}`);
            try {
                const allWindows = BrowserWindow.getAllWindows();
                console.log(`[HostHook] window-getWindowAtPoint: ${allWindows.length} windows found`);
                // Check windows - getAllWindows returns in arbitrary order
                // but for our purposes any overlapping window works
                for (const win of allWindows) {
                    if (win.isDestroyed() || !win.isVisible())
                        continue;
                    // Skip the drag feedback window
                    if (win === dragFeedbackWindow)
                        continue;
                    const bounds = win.getBounds();
                    console.log(`[HostHook] window-getWindowAtPoint: Checking window ${win.id} at (${bounds.x}, ${bounds.y}, ${bounds.width}, ${bounds.height})`);
                    if (x >= bounds.x && x < bounds.x + bounds.width &&
                        y >= bounds.y && y < bounds.y + bounds.height) {
                        console.log(`[HostHook] window-getWindowAtPoint: Found window ${win.id}`);
                        done({ success: true, windowId: win.id, bounds: bounds });
                        return;
                    }
                }
                console.log(`[HostHook] window-getWindowAtPoint: No window found at coordinates`);
                done({ success: true, windowId: null, bounds: null });
            }
            catch (error) {
                console.log(`[HostHook] window-getWindowAtPoint: Error - ${error.message}`);
                done({ success: false, error: error.message || 'Unknown error' });
            }
        });
        // Highlight or unhighlight a window's tab bar (for drop target feedback)
        this.on('window-highlightTabBar', (args, done) => {
            const { BrowserWindow } = require('electron');
            const params = Array.isArray(args) ? args : [args];
            const windowId = params[0];
            const highlight = params[1];
            console.log(`[HostHook] window-highlightTabBar: windowId=${windowId}, highlight=${highlight}`);
            try {
                const win = BrowserWindow.fromId(windowId);
                if (!win || win.isDestroyed()) {
                    console.log(`[HostHook] window-highlightTabBar: Window ${windowId} not found`);
                    done({ success: false, error: 'Window not found' });
                    return;
                }
                const script = highlight
                    ? `document.querySelector('.brain-tab-bar').style.setProperty('background-color', 'rgb(var(--vapp-accent-primary))', 'important');`
                    : `document.querySelector('.brain-tab-bar').style.removeProperty('background-color');`;
                console.log(`[HostHook] window-highlightTabBar: Executing script on window ${windowId}`);
                win.webContents.executeJavaScript(script).catch((err) => {
                    console.log(`[HostHook] window-highlightTabBar: Script error - ${err.message}`);
                });
                done({ success: true });
            }
            catch (error) {
                console.log(`[HostHook] window-highlightTabBar: Error - ${error.message}`);
                done({ success: false, error: error.message || 'Unknown error' });
            }
        });
        // ============================================
        // Lightweight Window Handlers
        // ============================================
        // Lightweight windows are minimal UI windows (modals, dialogs, drag previews)
        // that skip all tab/pool infrastructure and render a single component.
        // Destroy a lightweight window and its webContents to free the Chromium renderer process
        this.on('lightweight-destroyWindow', (args, done) => {
            const { BrowserWindow } = require('electron');
            const params = Array.isArray(args) ? args : [args];
            const windowId = params[0];
            try {
                const win = BrowserWindow.fromId(windowId);
                if (!win) {
                    done({ success: false, error: `Window ${windowId} not found` });
                    return;
                }
                if (win.isDestroyed()) {
                    done({ success: true }); // Already destroyed
                    return;
                }
                // Destroy webContents first to ensure Chromium renderer process is freed
                if (win.webContents && !win.webContents.isDestroyed()) {
                    win.webContents.destroy();
                }
                // Then destroy the window itself
                win.destroy();
                console.log(`[lightweight-destroyWindow] Destroyed window ${windowId}`);
                done({ success: true });
            }
            catch (error) {
                console.error(`[lightweight-destroyWindow] Error destroying window ${windowId}:`, error);
                done({ success: false, error: error.message || 'Failed to destroy lightweight window' });
            }
        });
        // ============================================
        // BrowserView Pool Management Handlers
        // ============================================
        // Architecture: Toolbar renders in BrowserWindow, pool BrowserViews render below at y=toolbarHeight
        // Set toolbar height - pool views should position below this
        this.on('pool-setToolbarHeight', (args, done) => {
            try {
                const params = Array.isArray(args) ? args : [args];
                const options = JSON.parse(params[0] || '{}');
                global['poolToolbarHeight'] = options.height ?? 48;
                // Immediately update bounds for all visible pool views
                const pooledViews = global['pooledBrowserViews'] || [];
                const windowsToUpdate = new Set();
                for (const view of pooledViews) {
                    if (view && !view['poolIsHidden']) {
                        windowsToUpdate.add(view['poolWindowId']);
                    }
                }
                for (const windowId of windowsToUpdate) {
                    updatePooledViewBoundsForWindow(windowId);
                }
                done({ success: true });
            }
            catch (error) {
                done({ success: false, error: error.message || 'Failed to set toolbar height' });
            }
        });
        // Helper to find pooled BrowserView by slotId
        const findPooledView = (viewId) => {
            const pooledViews = global['pooledBrowserViews'] || [];
            return pooledViews.find(v => v && v['poolViewId'] === viewId);
        };
        // Track resize handlers per window for cleanup
        global['poolResizeHandlers'] = global['poolResizeHandlers'] || new Map();
        global['poolResizeDebounceTimers'] = global['poolResizeDebounceTimers'] || new Map();
        const RESIZE_DEBOUNCE_MS = 150;
        // Helper to update all visible pooled views when window resizes
        const updatePooledViewBoundsForWindow = (windowId) => {
            const { BrowserWindow } = require('electron');
            const win = BrowserWindow.fromId(windowId);
            if (!win)
                return;
            const contentBounds = win.getContentBounds();
            const toolbarHeight = global['poolToolbarHeight'] ?? 48;
            const pooledViews = global['pooledBrowserViews'] || [];
            for (const view of pooledViews) {
                if (view && view['poolWindowId'] === windowId && !view['poolIsHidden']) {
                    view.setBounds({
                        x: 0,
                        y: toolbarHeight,
                        width: contentBounds.width,
                        height: contentBounds.height - toolbarHeight
                    });
                }
            }
        };
        // Debounced version - only update after resizing has stopped
        const debouncedUpdatePooledViewBounds = (windowId) => {
            const timers = global['poolResizeDebounceTimers'];
            if (timers.has(windowId)) {
                clearTimeout(timers.get(windowId));
            }
            timers.set(windowId, setTimeout(() => {
                timers.delete(windowId);
                updatePooledViewBoundsForWindow(windowId);
            }, RESIZE_DEBOUNCE_MS));
        };
        // Create a new pooled BrowserView for a tab
        // Accepts windowId to target specific window for multi-window support
        this.on('pool-createBrowserView', async (args, done) => {
            const { BrowserWindow, BrowserView } = require('electron');
            try {
                const params = Array.isArray(args) ? args : [args];
                const optionsJson = params[0] || '{}';
                const options = JSON.parse(optionsJson);
                const url = options.url || 'about:blank';
                const slotId = options.slotId || 0;
                const windowId = options.windowId;
                // Get target window by ID or fallback to first window
                const targetWindow = windowId
                    ? BrowserWindow.fromId(windowId)
                    : BrowserWindow.getAllWindows()[0];
                if (!targetWindow) {
                    done({ success: false, error: 'Window not found' });
                    return;
                }
                // Create new BrowserView for trusted Blazor content
                const view = new BrowserView({
                    webPreferences: {
                        nodeIntegration: true,
                        contextIsolation: false,
                        sandbox: false,
                        backgroundThrottling: true
                    }
                });
                // Track view ID and owning window
                const pooledViews = global['pooledBrowserViews'] = global['pooledBrowserViews'] || [];
                const viewId = pooledViews.length;
                view['poolViewId'] = viewId;
                view['poolSlotId'] = slotId;
                view['poolWindowId'] = targetWindow.id;
                pooledViews.push(view);
                // Add to window (initially hidden off-screen)
                targetWindow.addBrowserView(view);
                view.setBounds({ x: -10000, y: -10000, width: 1, height: 1 });
                view['poolIsHidden'] = true;
                attachHistoryClearer(view.webContents);
                // Attach resize handler if not already attached for this window
                const resizeHandlers = global['poolResizeHandlers'];
                if (!resizeHandlers.has(targetWindow.id)) {
                    const handler = () => debouncedUpdatePooledViewBounds(targetWindow.id);
                    targetWindow.on('resize', handler);
                    resizeHandlers.set(targetWindow.id, handler);
                }
                // Attach native context menu for editable fields and selectable text
                // This provides Copy/Cut/Paste menus for tab content (thought name/label, notes, etc.)
                attachNativeContextMenu(view.webContents);
                // Recover from failed page loads (e.g., chrome-error after sleep/wake)
                attachDidFailLoadHandler(view.webContents);
                // Reset zoom to 100% in case it was previously changed
                view.webContents.setZoomFactor(1.0);
                // Start loading the URL (don't await - circuit establishes asynchronously)
                view.webContents.loadURL(url);
                done({ success: true, viewId: viewId });
            }
            catch (error) {
                done({ success: false, error: error.message || 'Failed to create BrowserView' });
            }
        });
        // Show/activate a pooled BrowserView
        this.on('pool-showBrowserView', (args, done) => {
            const { BrowserWindow } = require('electron');
            try {
                const params = Array.isArray(args) ? args : [args];
                const optionsJson = params[0] || '{}';
                const options = JSON.parse(optionsJson);
                const viewId = options.viewId;
                const view = findPooledView(viewId);
                if (!view) {
                    done({ success: false, error: 'BrowserView not found' });
                    return;
                }
                // Get current window bounds to ensure correct size after resize
                const windowId = view['poolWindowId'];
                const win = BrowserWindow.fromId(windowId);
                if (!win) {
                    done({ success: false, error: 'Window not found' });
                    return;
                }
                // Mark as visible immediately
                view['poolIsHidden'] = false;
                // Focus the webContents only if parent window is focused.
                // On macOS, webContents.focus() can bring the parent window to the foreground,
                // which steals focus from other windows and can cause an infinite focus loop
                // when circuits reconnect in background windows.
                if (view.webContents && !view.webContents.isDestroyed() && win.isFocused()) {
                    view.webContents.focus();
                }
                // Return success immediately so C# doesn't wait for resize
                done({ success: true });
                // Resize asynchronously to avoid blocking the IPC response
                setImmediate(() => {
                    const contentBounds = win.getContentBounds();
                    const toolbarHeight = global['poolToolbarHeight'] ?? 48;
                    // Calculate bounds below toolbar using current window size
                    view.setBounds({
                        x: 0,
                        y: toolbarHeight,
                        width: contentBounds.width,
                        height: contentBounds.height - toolbarHeight
                    });
                });
                // Check if the circuit is in a fatal error state and needs recovery.
                // After sleep/resume, non-active tabs' circuits can die because
                // backgroundThrottling prevents the SignalR connection from being
                // maintained. When the frozen JS unfreezes, Blazor tries to send
                // data on the dead connection, triggering a fatal error (blazor-error-ui)
                // instead of the recoverable reconnection modal.
                // Auto-recover by navigating to the replaceTab recovery URL.
                if (view.webContents && !view.webContents.isDestroyed()) {
                    view.webContents.executeJavaScript(`
                        (function() {
                            var errorUi = document.getElementById('blazor-error-ui');
                            if(errorUi && errorUi.style.display) {
                                console.log('[pool-show] Circuit error detected on tab activation - auto-recovering');
                                if(window.dekutronPoolView && window.dekutronWindowId && window.dekutronSlotId) {
                                    window.location.href = '/loading?poolView=true&windowId=' +
                                        window.dekutronWindowId + '&slotId=' + window.dekutronSlotId + '&replaceTab=true';
                                } else {
                                    location.reload();
                                }
                                return true;
                            }
                            return false;
                        })();
                    `).catch(() => { });
                }
            }
            catch (error) {
                done({ success: false, error: error.message || 'Failed to show BrowserView' });
            }
        });
        // Hide a pooled BrowserView (move off-screen)
        this.on('pool-hideBrowserView', (args, done) => {
            try {
                const params = Array.isArray(args) ? args : [args];
                const optionsJson = params[0] || '{}';
                const options = JSON.parse(optionsJson);
                const viewId = options.viewId;
                const view = findPooledView(viewId);
                if (!view) {
                    done({ success: false, error: 'BrowserView not found' });
                    return;
                }
                // Move off-screen to hide
                view.setBounds({ x: -10000, y: -10000, width: 1, height: 1 });
                view['poolIsHidden'] = true;
                done({ success: true });
            }
            catch (error) {
                done({ success: false, error: error.message || 'Failed to hide BrowserView' });
            }
        });
        // Transfer a pooled BrowserView between windows (for cross-window tab drag)
        this.on('pool-transferBrowserView', (args, done) => {
            const { BrowserWindow } = require('electron');
            try {
                const params = Array.isArray(args) ? args : [args];
                const options = JSON.parse(params[0] || '{}');
                const viewId = options.viewId;
                const sourceWindowId = options.sourceWindowId;
                const targetWindowId = options.targetWindowId;
                const view = findPooledView(viewId);
                if (!view) {
                    done({ success: false, error: 'BrowserView not found' });
                    return;
                }
                const sourceWindow = BrowserWindow.fromId(sourceWindowId);
                const targetWindow = BrowserWindow.fromId(targetWindowId);
                if (!sourceWindow || !targetWindow) {
                    done({ success: false, error: 'Source or target window not found' });
                    return;
                }
                // Remove from source window
                sourceWindow.removeBrowserView(view);
                // Update tracked window ID
                view['poolWindowId'] = targetWindowId;
                // Add to target window (initially hidden)
                targetWindow.addBrowserView(view);
                view.setBounds({ x: -10000, y: -10000, width: 1, height: 1 });
                view['poolIsHidden'] = true;
                console.log(`[pool-transferBrowserView] Transferred view ${viewId} from window ${sourceWindowId} to window ${targetWindowId}`);
                done({ success: true });
            }
            catch (error) {
                done({ success: false, error: error.message || 'Failed to transfer BrowserView' });
            }
        });
        // Navigate a pooled BrowserView to new URL (circuit recreation)
        this.on('pool-navigateBrowserView', async (args, done) => {
            try {
                const params = Array.isArray(args) ? args : [args];
                const optionsJson = params[0] || '{}';
                const options = JSON.parse(optionsJson);
                const viewId = options.viewId;
                const url = options.url;
                const view = findPooledView(viewId);
                if (!view) {
                    done({ success: false, error: 'BrowserView not found' });
                    return;
                }
                // Close all WebSocket connections to sever the Blazor SignalR circuit.
                // Without this, loadURL alone doesn't close established WebSockets,
                // so the server doesn't detect the disconnect and old circuit components
                // leak event subscribers on the singleton CircuitMessageBus.
                try {
                    view.webContents.executeJavaScript('try { window.__dekutronTrackedWebSockets?.forEach(ws => ws.close()); } catch(e) {}');
                }
                catch (e) { }
                await new Promise(resolve => setTimeout(resolve, 100));
                // Now load the new page with a fresh circuit
                view.webContents.loadURL(url);
                done({ success: true });
            }
            catch (error) {
                done({ success: false, error: error.message || 'Failed to navigate BrowserView' });
            }
        });
        // Destroy a pooled BrowserView
        // Uses tracked owning window ID for multi-window support
        this.on('pool-destroyBrowserView', (args, done) => {
            const { BrowserWindow } = require('electron');
            try {
                const params = Array.isArray(args) ? args : [args];
                const optionsJson = params[0] || '{}';
                const options = JSON.parse(optionsJson);
                const viewId = options.viewId;
                const pooledViews = global['pooledBrowserViews'] || [];
                const viewIndex = pooledViews.findIndex(v => v && v['poolViewId'] === viewId);
                if (viewIndex === -1) {
                    done({ success: false, error: 'BrowserView not found' });
                    return;
                }
                const view = pooledViews[viewIndex];
                // Remove from owning window (tracked on view during creation)
                const owningWindowId = view['poolWindowId'];
                const owningWindow = owningWindowId
                    ? BrowserWindow.fromId(owningWindowId)
                    : BrowserWindow.getAllWindows()[0];
                if (owningWindow) {
                    owningWindow.removeBrowserView(view);
                }
                // Navigate to about:blank to let blazor.server.js teardown the SignalR
                // connection cleanly before destroying the webContents
                const destroyView = () => {
                    if (view.webContents && !view.webContents.isDestroyed()) {
                        view.webContents.destroy();
                    }
                };
                if (view.webContents && !view.webContents.isDestroyed()) {
                    view.webContents.loadURL('about:blank').catch(() => { });
                    setTimeout(destroyView, 500);
                }
                else {
                    destroyView();
                }
                // Remove from tracking (set to null to preserve indices)
                pooledViews[viewIndex] = null;
                // If no more pooled views for this window, remove resize handler
                const remainingViews = pooledViews.filter(v => v && v['poolWindowId'] === owningWindowId);
                if (remainingViews.length === 0) {
                    const resizeHandlers = global['poolResizeHandlers'];
                    const handler = resizeHandlers.get(owningWindowId);
                    if (handler && owningWindow) {
                        owningWindow.removeListener('resize', handler);
                        resizeHandlers.delete(owningWindowId);
                    }
                }
                done({ success: true });
            }
            catch (error) {
                done({ success: false, error: error.message || 'Failed to destroy BrowserView' });
            }
        });
        // Destroy all BrowserViews for a specific window (called on window close)
        this.on('pool-destroyAllViewsForWindow', (args, done) => {
            const { BrowserWindow } = require('electron');
            try {
                const params = Array.isArray(args) ? args : [args];
                const options = JSON.parse(params[0] || '{}');
                const windowId = options.windowId;
                if (!windowId) {
                    done({ success: false, error: 'windowId is required' });
                    return;
                }
                let destroyedPooledCount = 0;
                let destroyedWebembedCount = 0;
                // Destroy pooled views for this window
                const pooledViews = global['pooledBrowserViews'] || [];
                for (let i = 0; i < pooledViews.length; i++) {
                    const view = pooledViews[i];
                    if (view && view['poolWindowId'] === windowId) {
                        // Navigate to about:blank to let blazor.server.js teardown cleanly
                        if (view.webContents && !view.webContents.isDestroyed()) {
                            view.webContents.loadURL('about:blank').catch(() => { });
                            const wc = view.webContents;
                            setTimeout(() => {
                                if (wc && !wc.isDestroyed())
                                    wc.destroy();
                            }, 500);
                        }
                        pooledViews[i] = null;
                        destroyedPooledCount++;
                    }
                }
                // Destroy WebEmbed views for this window
                const browserViews = global['browserViews'] || [];
                for (let i = browserViews.length - 1; i >= 0; i--) {
                    const view = browserViews[i];
                    if (view && view['webembedWindowId'] === windowId) {
                        // Destroy webContents to free Chromium renderer process
                        if (view.webContents && !view.webContents.isDestroyed()) {
                            view.webContents.destroy();
                        }
                        browserViews.splice(i, 1);
                        destroyedWebembedCount++;
                    }
                }
                // Clean up resize handler for this window
                const resizeHandlers = global['poolResizeHandlers'];
                if (resizeHandlers && resizeHandlers.has(windowId)) {
                    const win = BrowserWindow.fromId(windowId);
                    const handler = resizeHandlers.get(windowId);
                    if (handler && win && !win.isDestroyed()) {
                        win.removeListener('resize', handler);
                    }
                    resizeHandlers.delete(windowId);
                }
                console.log(`[pool-destroyAllViewsForWindow] Destroyed ${destroyedPooledCount} pooled views and ${destroyedWebembedCount} WebEmbed views for window ${windowId}`);
                done({ success: true, destroyedPooledCount, destroyedWebembedCount });
            }
            catch (error) {
                done({ success: false, error: error.message || 'Failed to destroy views for window' });
            }
        });
        // ========== AutoUpdater Handlers ==========
        // Set the feed URL for auto-updater based on distribution channel
        this.on('autoupdate-setFeedURL', (args, done) => {
            try {
                const { autoUpdater } = require('electron-updater');
                const params = Array.isArray(args) ? args : [args];
                const optionsJson = params[0] || '{}';
                const options = JSON.parse(optionsJson);
                const feedUrl = options.url;
                if (!feedUrl) {
                    done({ success: false, error: 'No feed URL provided' });
                    return;
                }
                // Allow update checks in dev (unpacked) mode
                autoUpdater.forceDevUpdateConfig = true;
                // Log version info for debugging
                const { app } = require('electron');
                console.log(`[autoupdate-setFeedURL] app.getVersion(): ${app.getVersion()}`);
                console.log(`[autoupdate-setFeedURL] app.getAppPath(): ${app.getAppPath()}`);
                console.log(`[autoupdate-setFeedURL] autoUpdater.currentVersion: ${autoUpdater.currentVersion}`);
                console.log(`[autoupdate-setFeedURL] app.isPackaged: ${app.isPackaged}`);
                // Set the feed URL for electron-updater
                autoUpdater.setFeedURL({
                    provider: 'generic',
                    url: feedUrl
                });
                console.log(`[autoupdate-setFeedURL] Feed URL set to: ${feedUrl}`);
                console.log(`[autoupdate-setFeedURL] autoUpdater.currentVersion after setFeedURL: ${autoUpdater.currentVersion}`);
                done({ success: true });
            }
            catch (error) {
                console.error(`[autoupdate-setFeedURL] Error: ${error.message}`);
                done({ success: false, error: error.message || 'Failed to set feed URL' });
            }
        });
        // ========== DevTools Handlers ==========
        // Open DevTools for main BrowserWindow (tab bar)
        this.on('devtools-openMainWindow', (args, done) => {
            const { BrowserWindow } = require('electron');
            try {
                const params = Array.isArray(args) ? args : [args];
                const optionsJson = params[0] || '{}';
                const options = JSON.parse(optionsJson);
                let win;
                if (options.windowId) {
                    win = BrowserWindow.fromId(options.windowId);
                }
                if (!win) {
                    win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
                }
                if (win && win.webContents) {
                    win.webContents.openDevTools();
                    done({ success: true });
                }
                else {
                    done({ success: false, error: 'No window found' });
                }
            }
            catch (error) {
                done({ success: false, error: error.message || 'Unknown error' });
            }
        });
        // Open DevTools for a specific BrowserView (tab content)
        this.on('devtools-openBrowserView', (args, done) => {
            try {
                const params = Array.isArray(args) ? args : [args];
                const optionsJson = params[0] || '{}';
                const options = JSON.parse(optionsJson);
                const viewId = options.viewId;
                const view = findPooledView(viewId);
                if (view && view.webContents) {
                    view.webContents.openDevTools();
                    done({ success: true });
                }
                else {
                    done({ success: false, error: 'BrowserView not found' });
                }
            }
            catch (error) {
                done({ success: false, error: error.message || 'Unknown error' });
            }
        });
        // ========== Native clipboard handlers (Linux only — Win/Mac use P/Invoke) ==========
        // ElectronNativeClipboard (.cs) calls these via HostHook so Linux can use Chromium's
        // persistent clipboard connection instead of spawning xclip/wl-paste subprocesses
        // (which caused the "Unknown" task bar flicker on Wayland and forced an apt dep).
        //
        // CRITICAL: handler names MUST be prefixed with `dekutron-` to avoid colliding with
        // Electron.NET's built-in handlers in app.asar/api/clipboard.js which listen on the
        // bare `clipboard-readText` / `clipboard-writeText` / `clipboard-availableFormats` /
        // `clipboard-readImage` / `clipboard-writeImage` / `clipboard-clear` event names.
        // When BOTH listeners receive a HostHook-shaped emit, Electron.NET's handler
        // crashes the renderer with `TypeError: Error processing argument at index 0` at
        // api/clipboard.js:11:30 because it expects (text, type) but receives the HostHook
        // protocol's (args, callId) shape. Don't shorten these names back.
        const { nativeImage } = require('electron');
        this.on('dekutron-clipboard-availableFormats', (args, done) => {
            try {
                const formats = clipboard.availableFormats('clipboard');
                done({ success: true, formats: formats });
            }
            catch (error) {
                done({ success: false, error: error.message || 'Unknown error' });
            }
        });
        this.on('dekutron-clipboard-readText', (args, done) => {
            try {
                const text = clipboard.readText('clipboard');
                done({ success: true, text: text || '' });
            }
            catch (error) {
                done({ success: false, error: error.message || 'Unknown error' });
            }
        });
        this.on('dekutron-clipboard-writeText', (args, done) => {
            try {
                const text = Array.isArray(args) ? args[0] : args;
                clipboard.writeText(text || '', 'clipboard');
                done({ success: true });
            }
            catch (error) {
                done({ success: false, error: error.message || 'Unknown error' });
            }
        });
        this.on('dekutron-clipboard-readImage', (args, done) => {
            try {
                const img = clipboard.readImage('clipboard');
                if (!img || img.isEmpty()) {
                    done({ success: true, base64: null });
                    return;
                }
                const png = img.toPNG();
                done({ success: true, base64: png.toString('base64') });
            }
            catch (error) {
                done({ success: false, error: error.message || 'Unknown error' });
            }
        });
        this.on('dekutron-clipboard-writeImage', (args, done) => {
            try {
                const params = Array.isArray(args) ? args : [args];
                const base64 = params[0];
                if (!base64) {
                    done({ success: false, error: 'no image bytes provided' });
                    return;
                }
                const buffer = Buffer.from(base64, 'base64');
                const img = nativeImage.createFromBuffer(buffer);
                clipboard.writeImage(img, 'clipboard');
                done({ success: true });
            }
            catch (error) {
                done({ success: false, error: error.message || 'Unknown error' });
            }
        });
        this.on('dekutron-clipboard-readBuffer', (args, done) => {
            try {
                const params = Array.isArray(args) ? args : [args];
                const format = params[0];
                if (!format) {
                    done({ success: false, error: 'format required' });
                    return;
                }
                const buf = clipboard.readBuffer(format);
                if (!buf || buf.length === 0) {
                    done({ success: true, base64: null });
                    return;
                }
                done({ success: true, base64: buf.toString('base64') });
            }
            catch (error) {
                done({ success: false, error: error.message || 'Unknown error' });
            }
        });
        this.on('dekutron-clipboard-writeBuffer', (args, done) => {
            try {
                const params = Array.isArray(args) ? args : [args];
                const format = params[0];
                const base64 = params[1];
                if (!format) {
                    done({ success: false, error: 'format required' });
                    return;
                }
                const buffer = base64 ? Buffer.from(base64, 'base64') : Buffer.alloc(0);
                clipboard.writeBuffer(format, buffer, 'clipboard');
                done({ success: true });
            }
            catch (error) {
                done({ success: false, error: error.message || 'Unknown error' });
            }
        });
        // Multi-format write. CRITICAL ordering: write the custom buffer FIRST, then
        // text+html via clipboard.write(). On Linux Wayland, each clipboard.write*
        // call creates a new wl_data_source that wipes prior formats — the LAST call
        // wins. We prioritize text+html surviving (so external apps like VS Code see
        // the thought name as text) over the custom binary format (which only the
        // internal Paste Thought command needs). Internal Paste Thought is degraded
        // on Linux but external paste — the dominant use case — works correctly.
        this.on('dekutron-clipboard-writeAllFormats', (args, done) => {
            try {
                const params = Array.isArray(args) ? args : [args];
                const text = params[0] || '';
                const html = params[1] || '';
                const customFormat = params[2] || '';
                const customDataBase64 = params[3] || '';
                if (customFormat && customDataBase64) {
                    const buf = Buffer.from(customDataBase64, 'base64');
                    clipboard.writeBuffer(customFormat, buf, 'clipboard');
                }
                const data = {};
                if (text)
                    data.text = text;
                if (html)
                    data.html = html;
                if (Object.keys(data).length > 0) {
                    clipboard.write(data, 'clipboard');
                }
                done({ success: true });
            }
            catch (error) {
                done({ success: false, error: error.message || 'Unknown error' });
            }
        });
        this.on('dekutron-clipboard-clear', (args, done) => {
            try {
                clipboard.clear('clipboard');
                done({ success: true });
            }
            catch (error) {
                done({ success: false, error: error.message || 'Unknown error' });
            }
        });
    }
}
exports.HookService = HookService;
