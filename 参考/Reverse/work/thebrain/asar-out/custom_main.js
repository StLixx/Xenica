// Custom startup hook for Dekutron
// Sets the dock icon on macOS and window icon on Windows during development
const { app, BrowserWindow, Menu, nativeImage, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Track if app is quitting to suppress "Object has been destroyed" errors during shutdown
let isQuitting = false;

// ===== PROXY CONFIGURATION =====
// Store proxy credentials for the login handler (populated from config file or IPC)
global.proxyCredentials = null;

// Configure proxy from config file SYNCHRONOUSLY before anything else happens
// This function is called at module load time, before onStartup
function configureProxyFromFile() {
    try {
        // The proxy config file is written by .NET before Electron starts
        const configPath = path.join(__dirname, 'proxy-config.json');

        if (!fs.existsSync(configPath)) {
            console.log('No proxy config file found, using direct connection');
            return;
        }

        const configData = fs.readFileSync(configPath, 'utf8');
        const proxyConfig = JSON.parse(configData);

        if (!proxyConfig || !proxyConfig.useProxy) {
            console.log('Proxy disabled in config file');
            return;
        }

        // Build proxy URL
        let proxyAddress = proxyConfig.address || '';
        const proxyPort = proxyConfig.port || '';

        // Remove any existing protocol prefix for consistency
        proxyAddress = proxyAddress.replace(/^https?:\/\//i, '');

        const proxyRules = proxyPort ? `http://${proxyAddress}:${proxyPort}` : `http://${proxyAddress}`;

        // Store credentials for the login handler if authentication is required
        if (proxyConfig.requiresAuth && proxyConfig.username) {
            global.proxyCredentials = {
                username: proxyConfig.username,
                password: proxyConfig.password || ''
            };
            console.log('Proxy config loaded with authentication:', proxyRules);
        } else {
            console.log('Proxy config loaded without authentication:', proxyRules);
        }

        // Configure proxy on app ready (session isn't available until then)
        // We use commandLine switches which work before app is ready
        app.commandLine.appendSwitch('proxy-server', proxyRules);
        // Bypass list must include IPv6 localhost (::1) because Electron.NET socket uses it
        app.commandLine.appendSwitch('proxy-bypass-list', 'localhost,127.0.0.1,[::1],<local>');

        console.log('Proxy command line switches configured:', proxyRules);

    } catch (error) {
        console.error('Failed to configure proxy from file:', error);
    }
}

// Configure proxy immediately when this module loads
configureProxyFromFile();

// Enable remote debugging for Chrome DevTools access (development only)
if(!app.isPackaged) {
    app.commandLine.appendSwitch('remote-debugging-port', '9222');
}

module.exports = {
    onStartup: function(host) {
        console.log('Custom main: onStartup called - registering IPC handlers');

        // ===== PROXY AUTHENTICATION HANDLER =====
        // Register login handler EARLY (before any windows) to handle proxy auth challenges (HTTP 407)
        // This must be registered at app level to catch all proxy auth requests from any webContents
        app.on('login', (event, webContents, request, authInfo, callback) => {
            if (authInfo.isProxy && global.proxyCredentials) {
                console.log('Proxy auth challenge received, providing stored credentials');
                event.preventDefault();
                callback(global.proxyCredentials.username, global.proxyCredentials.password);
            } else if (authInfo.isProxy) {
                console.log('Proxy auth challenge received but no credentials available');
            }
        });

        // ===== END PROXY CONFIGURATION =====

        // Set app name for menus and system UI (shows "TheBrain" instead of "TheBrain 15")
        app.setName('TheBrain');

        // On Linux, app.setName() resets app.getVersion() to "0.0" (Electron drops its
        // cached app metadata when the name changes, and our package.json's version isn't
        // re-read in this launch shape — Electron is invoked as `electron main.js`, not
        // `electron .`, so the package.json next to main.js isn't bound as the app manifest).
        // The "0.0" return value crashes electron-updater's AppUpdater constructor with
        // "App version is not a valid semver version", which kills the Electron process.
        // Restore a valid semver by reading our generated package.json directly.
        // macOS/Windows don't need this because their getVersion() reads from the bundle
        // (Info.plist / version resource) which setName doesn't disturb.
        if(process.platform === 'linux') {
            try {
                const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
                if(pkg && typeof pkg.version === 'string' && /^\d+\.\d+\.\d+/.test(pkg.version)) {
                    const recoveredVersion = pkg.version;
                    app.getVersion = () => recoveredVersion;
                }
            } catch(err) {
                console.warn('Failed to restore app.getVersion after setName:', err.message);
            }
        }

        // Set Windows App User Model ID to prevent notifications showing "electron.app.TheBrain 15"
        if(process.platform === 'win32') {
            app.setAppUserModelId('com.thebrain.dekutron');
            ensureSendToBrainBoxShortcut();
        }

        // Linux: suppress the default Electron application menu (File/Edit/View/Window/Help).
        // Windows hides it implicitly via titleBarStyle:'hidden'; macOS sets a custom menu later
        // in ElectronMenuService. Linux has no implicit suppression — without this, GTK draws the
        // default Electron menu above the app's custom toolbar.
        if(process.platform === 'linux') {
            Menu.setApplicationMenu(null);
        }

        // ===== DEEP LINK PROTOCOL HANDLING =====

        // Store pending deep link for cold start scenario
        global.pendingDeepLink = null;
        global.pendingBrainBoxFiles = null;

        // Register as default protocol handler for 'brain://'
        if (process.defaultApp) {
            // Dev mode: register with full path to handle the protocol
            app.setAsDefaultProtocolClient('brain', process.execPath, [path.resolve(process.argv[1])]);
        } else {
            // Production: simple registration
            app.setAsDefaultProtocolClient('brain');
        }

        // Request single instance lock - required for Windows/Linux deep links
        const gotTheLock = app.requestSingleInstanceLock();
        if (!gotTheLock) {
            // Another instance is running - it will handle the deep link
            app.quit();
            return false;
        }

        // Handle second-instance event (Windows/Linux - app already running)
        app.on('second-instance', (event, commandLine, workingDirectory) => {
            const url = commandLine.find(arg => arg.startsWith('brain://'));
            if (url) {
                sendDeepLinkToRenderer(url);
            }
            const brainBoxFiles = extractBrainBoxFiles(commandLine);
            if (brainBoxFiles.length > 0) {
                sendBrainBoxFilesToRenderer(brainBoxFiles);
            }
            // Focus the main window
            const mainWindow = BrowserWindow.getAllWindows()[0];
            if (mainWindow) {
                if (mainWindow.isMinimized()) mainWindow.restore();
                mainWindow.focus();
            }
        });

        // Handle open-url event (macOS - both cold start and running)
        app.on('open-url', (event, url) => {
            event.preventDefault();
            if (url.startsWith('brain://')) {
                sendDeepLinkToRenderer(url);
            }
        });

        // Check for deep link in startup args (Windows/Linux cold start)
        const startupDeepLink = process.argv.find(arg => arg.startsWith('brain://'));
        if (startupDeepLink) {
            global.pendingDeepLink = startupDeepLink;
        }

        // Check for --brainbox files in startup args (Windows cold start)
        const startupBrainBoxFiles = extractBrainBoxFiles(process.argv);
        if (startupBrainBoxFiles.length > 0) {
            global.pendingBrainBoxFiles = (global.pendingBrainBoxFiles || []).concat(startupBrainBoxFiles);
        }

        // Helper function to send deep link to renderer
        // Targets focused window if available, otherwise first window
        function sendDeepLinkToRenderer(url) {
            const focusedWindow = BrowserWindow.getFocusedWindow();
            const targetWindow = focusedWindow || BrowserWindow.getAllWindows()[0];
            if (targetWindow && targetWindow.webContents) {
                targetWindow.webContents.send('deep-link-received', url);
                targetWindow.focus();
            } else {
                // Store for later if no window exists yet
                global.pendingDeepLink = url;
            }
        }

        // Create/replace the Windows "Send to → BrainBox" shortcut so it points at THIS app.
        // Mirrors the legacy client (which wrote the same BrainBox.lnk), overwriting its entry.
        function ensureSendToBrainBoxShortcut() {
            if (process.platform !== 'win32') {
                return;
            }
            try {
                const sendToDir = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'SendTo');
                const linkPath = path.join(sendToDir, 'BrainBox.lnk');
                // Packaged: process.execPath is the real Dekutron exe, so just pass our marker and
                // Windows appends the selected file(s): `TheBrain 15.exe --brainbox "<file>"`.
                // Dev (e.g. launched from Rider): process.execPath is the bare Electron binary, which
                // treats the first positional arg as the app to run. We must prepend the resolved main
                // script (the same trick the brain:// deep-link registration uses at the call above)
                // so Electron launches Dekutron instead of trying to load the dropped file itself.
                // Caveats in dev: this overwrites an installed build's shortcut on this machine, and
                // SendTo only works while the dev instance is already running (cold start has no backend).
                const args = app.isPackaged
                    ? '--brainbox'
                    : `"${path.resolve(process.argv[1])}" --brainbox`;
                shell.writeShortcutLink(linkPath, 'create', {
                    target: process.execPath,
                    args: args,
                    description: 'Send the selected item to TheBrain where it will appear in BrainBox.'
                });
            } catch (e) {
                // Never block startup on shortcut failure.
                console.error('Failed to create Send To BrainBox shortcut:', e);
            }
        }

        // Extract file paths that follow the --brainbox marker on a command line / argv array.
        function extractBrainBoxFiles(argv) {
            const idx = argv.findIndex(a => a === '--brainbox');
            if (idx === -1) {
                return [];
            }
            // Everything after the marker that isn't another flag is treated as a path.
            return argv.slice(idx + 1).filter(a => a && !a.startsWith('--'));
        }

        // Deliver brainbox files to a renderer window (focused, else first).
        function sendBrainBoxFilesToRenderer(files) {
            if (!files || files.length === 0) {
                return;
            }
            const focusedWindow = BrowserWindow.getFocusedWindow();
            const targetWindow = focusedWindow || BrowserWindow.getAllWindows()[0];
            if (targetWindow && targetWindow.webContents) {
                targetWindow.webContents.send('brainbox-files-received', files);
                if (targetWindow.isMinimized()) targetWindow.restore();
                targetWindow.focus();
            } else {
                global.pendingBrainBoxFiles = (global.pendingBrainBoxFiles || []).concat(files);
            }
        }

        // IPC handler for renderer to check for pending deep link
        ipcMain.handle('get-pending-deep-link', () => {
            const url = global.pendingDeepLink;
            global.pendingDeepLink = null;
            return url;
        });

        ipcMain.handle('get-pending-brainbox-files', () => {
            const files = global.pendingBrainBoxFiles || [];
            global.pendingBrainBoxFiles = null;
            return files;
        });

        // ===== END DEEP LINK PROTOCOL HANDLING =====

        // ===== FOCUS MANAGEMENT =====

        // IPC handler to focus the window (used when right-clicking from background on macOS)
        ipcMain.on('focus-window', (event) => {
            const webContents = event.sender;
            const win = BrowserWindow.fromWebContents(webContents);
            // Don't restore a window that's currently minimized — the user just minimized it
            // (e.g. via the Linux custom title-bar buttons) and a stale focus IPC arriving
            // afterward should not unminimize it.
            if (win && win.isMinimized()) return;
            if (win) {
                win.focus();
            }
            app.focus({ steal: true });
        });

        // IPC handler to refocus the active pooled BrowserView
        // Called after clicks on the main BrowserWindow (tab bar) to restore focus to the active tab
        ipcMain.on('refocus-active-view', (event) => {
            const webContents = event.sender;
            const win = BrowserWindow.fromWebContents(webContents);
            if (!win) return;
            // Skip refocus while the window is minimized. Without this, electronFocus.ts's
            // global mouseup-triggered refocus (sent ~10ms after the click on our minimize
            // button) would call view.webContents.focus() on the active pooled BrowserView,
            // which on Linux unminimizes the parent window — making the minimize button
            // appear to "bounce" the window straight back open.
            if (win.isMinimized()) return;

            const pooledViews = global['pooledBrowserViews'] || [];
            for (const view of pooledViews) {
                if (view &&
                    view['poolWindowId'] === win.id &&
                    !view['poolIsHidden'] &&
                    view.webContents &&
                    !view.webContents.isDestroyed()) {
                    view.webContents.focus();
                    return;
                }
            }
        });

        // Restore focus to active BrowserView when window regains focus (e.g., after Alt+Tab)
        // On macOS, this is handled by the platform-specific focusActiveWebContents() below
        // to avoid duplicate focus calls that can trigger focus cycling between windows.
        if (process.platform !== 'darwin') {
            app.on('browser-window-focus', (event, window) => {
                // Same guard as the refocus-active-view IPC: don't focus a pooled view while
                // the parent window is minimized — that would unminimize it on Linux.
                if (window.isMinimized()) return;
                const pooledViews = global['pooledBrowserViews'] || [];
                for (const view of pooledViews) {
                    if (view &&
                        view['poolWindowId'] === window.id &&
                        !view['poolIsHidden'] &&
                        view.webContents &&
                        !view.webContents.isDestroyed()) {
                        view.webContents.focus();
                        return;
                    }
                }
            });
        }

        // ===== END FOCUS MANAGEMENT =====

        // Handler to get system file icon as data URL (for drag image compositing in renderer)
        ipcMain.handle('get-file-icon', async (event, filePath) => {
            try {
                const icon = await app.getFileIcon(filePath, { size: 'normal' });
                return icon.toDataURL();
            } catch (error) {
                console.log('Could not get file icon:', error.message);
                return null;
            }
        });

        // 32x32 solid-color placeholder; a guaranteed-valid nativeImage for drags
        function createFallbackDragIcon() {
            const size = 32;
            const buffer = Buffer.alloc(size * size * 4);
            for (let i = 0; i < size * size; i++) {
                buffer[i * 4] = 100;
                buffer[i * 4 + 1] = 120;
                buffer[i * 4 + 2] = 180;
                buffer[i * 4 + 3] = 255;
            }
            return nativeImage.createFromBuffer(buffer, { width: size, height: size });
        }

        // True when an icon can't be used for a drag. Note isEmpty() alone is not
        // enough: macOS 26's broken getFileIcon 'large' returns an image that is
        // NOT isEmpty() but has a 0x0 size.
        function isUnusableIcon(icon) {
            if (!icon || icon.isEmpty()) {
                return true;
            }
            const size = icon.getSize();
            return size.width === 0 || size.height === 0;
        }

        // System file icon for drags. getFileIcon can return a zero-size image
        // instead of throwing (macOS 26 does this for size 'large'), so retry at
        // 'normal' before giving up and letting the caller's guard substitute the
        // placeholder.
        async function getSystemDragIcon(file) {
            try {
                let icon = await app.getFileIcon(file, { size: 'large' });
                if (isUnusableIcon(icon)) {
                    icon = await app.getFileIcon(file, { size: 'normal' });
                    console.log('Using system file icon (normal; large was unusable)');
                } else {
                    console.log('Using system file icon');
                }
                return icon;
            } catch (iconError) {
                console.log('Could not get file icon, using fallback:', iconError.message);
                return createFallbackDragIcon();
            }
        }

        // Simple native drag handler following official Electron docs pattern
        // https://www.electronjs.org/docs/latest/tutorial/native-file-drag-drop
        ipcMain.on('ondragstart', async (event, options) => {
            console.log('ondragstart IPC received:', JSON.stringify(options));
            try {
                const dragItem = {};

                if (options.type === 'file' && options.path) {
                    dragItem.file = options.path;
                    dragItem.title = options.title || path.basename(options.path);
                    console.log('Dragging file:', dragItem.title);
                } else if (options.type === 'folder' && options.path) {
                    dragItem.file = options.path;
                    dragItem.title = options.title || path.basename(options.path);
                    console.log('Dragging folder:', dragItem.title);
                } else if (options.type === 'url' && options.url) {
                    // Create temp shortcut file for URL drag
                    const tempDir = os.tmpdir();
                    const urlTitle = (options.title || 'Link').replace(/[<>:"/\\|?*]/g, '_');
                    if (process.platform === 'win32') {
                        const urlFile = path.join(tempDir, `${urlTitle}.url`);
                        fs.writeFileSync(urlFile, `[InternetShortcut]\nURL=${options.url}\n`);
                        dragItem.file = urlFile;
                    } else {
                        const weblocFile = path.join(tempDir, `${urlTitle}.webloc`);
                        const plist = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n<dict><key>URL</key><string>${options.url}</string></dict>\n</plist>`;
                        fs.writeFileSync(weblocFile, plist);
                        dragItem.file = weblocFile;
                    }
                    dragItem.title = urlTitle;
                    console.log('Dragging URL:', dragItem.title);
                } else {
                    console.error('Invalid drag options:', options);
                    return;
                }

                // Use custom drag image from renderer if provided, otherwise use system file icon
                if (options.iconDataUrl) {
                    // Renderer provided a custom drag image (created with browser Canvas)
                    try {
                        let icon = nativeImage.createFromDataURL(options.iconDataUrl);
                        // If logical size provided (for HiDPI), resize to intended display size
                        if (options.iconLogicalSize) {
                            icon = icon.resize({
                                width: options.iconLogicalSize.width,
                                height: options.iconLogicalSize.height,
                                quality: 'best'
                            });
                            console.log('Using custom drag image (HiDPI scaled)');
                        } else {
                            console.log('Using custom drag image from renderer');
                        }
                        dragItem.icon = icon;
                    } catch (e) {
                        console.log('Failed to use custom icon, falling back:', e.message);
                        dragItem.icon = await getSystemDragIcon(dragItem.file);
                    }
                } else {
                    // Fallback to system file icon
                    dragItem.icon = await getSystemDragIcon(dragItem.file);
                }

                // A zero-size icon makes startDrag throw a native NSException on macOS
                // ('NSDraggingItem.draggingFrame cannot be set to a zero size') that
                // terminates the app and is NOT catchable from JS - never let one through.
                if (isUnusableIcon(dragItem.icon)) {
                    console.log('Drag icon is empty or zero-size, using fallback placeholder');
                    dragItem.icon = createFallbackDragIcon();
                }

                console.log('Starting native drag:', dragItem.file);
                event.sender.startDrag(dragItem);
                console.log('Native drag completed');
            } catch (error) {
                console.error('Native drag error:', error);
            }
        });

        // Set up quit tracking to suppress shutdown errors
        // Only set isQuitting on actual app quit, NOT on individual window close
        app.on('before-quit', () => {
            isQuitting = true;
        });

        // Suppress "Object has been destroyed" errors during shutdown
        // These are expected when socket calls arrive after window destruction starts
        process.on('uncaughtException', (error) => {
            if(isQuitting && error.message && error.message.includes('Object has been destroyed')) {
                console.log('Suppressed shutdown error:', error.message);
                return; // Don't exit, let shutdown continue normally
            }
            // For other errors, log but don't crash during shutdown
            if(isQuitting) {
                console.error('Error during shutdown:', error);
                return;
            }
            // Non-shutdown errors: log and exit
            console.error('Uncaught exception:', error);
            process.exit(1);
        });

        if(process.platform === 'darwin') {
            // Set dock icon on macOS
            const iconPath = path.join(__dirname, 'icon.png');
            if(fs.existsSync(iconPath)) {
                app.whenReady().then(() => {
                    if(app.dock) {
                        console.log('Custom main: setting dock icon');
                        app.dock.setIcon(iconPath);
                    }
                });
            }

            // ===== FIX: Ensure webContents has keyboard focus when app activates =====
            // On macOS, when switching back to the app, the BrowserWindow gets focus but
            // the webContents inside BrowserViews may not. This causes keyboard events
            // (like Alt key for alternate menu commands) to not be received.
            app.on('activate', () => {
                focusActiveWebContents();
            });

            app.on('browser-window-focus', (event, window) => {
                focusActiveWebContents();
            });

            let lastFocusTime = 0;
            function focusActiveWebContents() {
                // Debounce: skip if we focused within the last 500ms to prevent rapid cycling
                const now = Date.now();
                if (now - lastFocusTime < 500) return;
                lastFocusTime = now;

                const focusedWindow = BrowserWindow.getFocusedWindow();
                if (!focusedWindow) return;

                // Find the visible (non-hidden) pooled BrowserView for this window
                const pooledViews = global['pooledBrowserViews'] || [];
                for (const view of pooledViews) {
                    if (view &&
                        view['poolWindowId'] === focusedWindow.id &&
                        !view['poolIsHidden'] &&
                        view.webContents &&
                        !view.webContents.isDestroyed()) {
                        view.webContents.focus();
                        return;
                    }
                }

                // Fallback: focus the main window's webContents if no pooled view is active
                if (focusedWindow.webContents && !focusedWindow.webContents.isDestroyed()) {
                    focusedWindow.webContents.focus();
                }
            }
        } else if(process.platform === 'win32') {
            // Set window icon on Windows using multi-size .ico for crisp rendering at all DPI levels
            const iconPath = path.join(__dirname, 'icon-win.ico');
            console.log('Custom main: using Windows icon =', iconPath);
            const icon = nativeImage.createFromPath(iconPath);

            // Set icon on any existing windows
            app.whenReady().then(() => {
                const windows = BrowserWindow.getAllWindows();
                windows.forEach(win => {
                    console.log('Custom main: setting window icon for existing window');
                    win.setIcon(icon);
                });
            });

            // Set icon on new windows as they are created
            app.on('browser-window-created', (event, win) => {
                console.log('Custom main: setting window icon for new window');
                win.setIcon(icon);
            });
        }

        // ===== SPLASH SCREEN NATIVE SHADOW (macOS) =====
        // ElectronNET.Core's main.js creates the splash screen as a transparent frameless
        // window with the native shadow left on. macOS computes that shadow's outline from
        // the window's opaque pixels — which include splash.html's CSS box-shadow halo — so
        // it draws a crisp rounded outline larger than the card and offset downward. The CSS
        // box-shadow is the intended shadow; turn the native one off. The splash is created
        // by main.js (not us), so catch it via browser-window-created and identify it by URL
        // on its first navigation.
        if (process.platform === 'darwin') {
            app.on('browser-window-created', (event, win) => {
                win.webContents.once('did-start-navigation', (navigation) => {
                    if (navigation.url && navigation.url.includes('splash.html')) {
                        win.setHasShadow(false);
                    }
                });
            });
        }

        // ===== macOS TRACKPAD SWIPE NAVIGATION =====
        // Swipe left/right to navigate forward/backward (requires System Preferences > Trackpad >
        // More Gestures > "Swipe between pages" set to include three-finger swipe)
        if (process.platform === 'darwin') {
            const attachSwipeHandler = (win) => {
                win.on('swipe', (e, direction) => {
                    if (direction === 'right') {
                        win.webContents.send('navigation-swipe', 'back');
                    } else if (direction === 'left') {
                        win.webContents.send('navigation-swipe', 'forward');
                    }
                });
            };

            // Attach to existing windows and new windows as they are created
            BrowserWindow.getAllWindows().forEach(attachSwipeHandler);
            app.on('browser-window-created', (event, win) => attachSwipeHandler(win));
        }

        // Return true to continue normal startup
        return true;
    }
};
