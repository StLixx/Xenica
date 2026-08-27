class BrainPage {
    
    constructor() {
        
    }
    
    init(dotNetHelper, toolbarContainerId, plexContainerId, contentAreaContainerId) {

        this.dotNetHelper = dotNetHelper;

        document.addEventListener('fullscreenchange', function () {
            if(!document.fullscreenElement) {
                dotNetHelper.invokeMethodAsync('HandleFullscreenExited');
            }
        });

        document.addEventListener('keydown', function (e) {
            // In presentation mode (no search input), typing alphanumeric keys opens the thought selector
            if(!document.getElementById('searchInputControl')
                && !e.ctrlKey && !e.altKey && !e.metaKey
                && e.key.length === 1 && e.key !== ' ') {
                const activeEl = document.activeElement;
                // Don't intercept if focus is in an editable element (except plexContainer)
                if(activeEl && activeEl.id !== 'plexContainer' && (
                    activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' ||
                    activeEl.contentEditable === 'true')) {
                    return;
                }
                dotNetHelper.invokeMethodAsync('HandlePresentationModeKeyPress', e.key);
                e.preventDefault();
            }
        });

        document.addEventListener('click', function (e) {
            const toolbar = document.getElementById(toolbarContainerId);
            const plex = document.getElementById(plexContainerId);
            const propertiesDisplay = document.getElementById('thought-properties-display');
            const notesSection = document.getElementById('attachments-and-note-section');
            const contentArea = document.getElementById(contentAreaContainerId);

            if(toolbar && toolbar.contains(e.target)) {
                dotNetHelper.invokeMethodAsync('HandleAreaFocus', toolbarContainerId);
            } else if (plex && plex.contains(e.target)) {
                dotNetHelper.invokeMethodAsync('HandleAreaFocus', plexContainerId);
                // In presentation mode the search input is hidden, so focus the plex container
                // directly in JS to avoid the .NET roundtrip delay losing focus
                if(!document.getElementById('searchInputControl')) {
                    plex.focus();
                }
            } else if (propertiesDisplay && propertiesDisplay.contains(e.target)) {
                dotNetHelper.invokeMethodAsync('HandleAreaFocus', 'thought-properties-display');
            } else if (notesSection && notesSection.contains(e.target)) {
                dotNetHelper.invokeMethodAsync('HandleAreaFocus', 'attachments-and-note-section');
            } else if (contentArea && contentArea.contains(e.target)) {
                dotNetHelper.invokeMethodAsync('HandleAreaFocus', contentAreaContainerId);
            }

        });
    }

    ensureContentAreaFitsKeyboard(newPercent) {
        if(!this.dotNetHelper) return;
        this.dotNetHelper.invokeMethodAsync('EnsureContentAreaFitsKeyboardAsync', newPercent);
    }

    maximizeContentArea() {
        if(!this.dotNetHelper) return;
        this.dotNetHelper.invokeMethodAsync('MaximizeContentAreaAsync');
    }
}

window.brainPage = new BrainPage();

class ThoughtSelectFeedback {
    
    dotNetHelper;
    selectedControl;
    
    constructor() {
        console.log("Created ThoughtSelectFeedback");
    }
    
    // called from blazor
    init(dotNetHelper) {
        this.dotNetHelper = dotNetHelper;
    }

    // called from blazor
    selectComplete() {
        if(this.selectedControl != null) {
            this.selectedControl.classList.remove("pending-action")
            this.selectedControl = null;
        }
    }

    // called from blazor
    pokeThought(element, thtId) {
        
        // TODO: This is the primary way to activate a thought when the plex is hidden but it seems that the
        // plex does not call this and instead goes straight to the server. This is a problem because it means
        // if the server does not respond there is no way to tell that the click was successful.
        
        if(this.selectedControl != null) {
            this.selectedControl.classList.remove("pending-action");
            this.selectedControl = null;
        }
        if(element === null) {
            element = document.getElementById("tht-" + thtId + "-cur");
        }
        if(element !== null) {
            this.selectedControl = element;
            this.selectedControl.classList.add("pending-action");
        }
        this.dotNetHelper.invokeMethodAsync("PokeThought", thtId);
    }
}

window.thoughtSelectFeedback = new ThoughtSelectFeedback();

window.initVideoFunctions = function() {
    // Create global functions to manipulate video
    window.playVideo = function(videoElement) {
        videoElement.play();
    }
}
window.startGlobalDropPrevention = function() {
    // Remove any existing listeners to prevent duplicates
    if (document._globalDragOverHandler) {
        document.removeEventListener('dragover', document._globalDragOverHandler);
    }
    if (document._globalDropHandler) {
        document.removeEventListener('drop', document._globalDropHandler);
    }

    // Create and store the global dragover handler
    document._globalDragOverHandler = function(e) {
        const target = e.target;
        const supportsClosest = target && typeof target.closest === 'function';
        const isInDropZone = supportsClosest ? target.closest('.drop-zone-enabled') : null;

        if(!isInDropZone) {
            e.preventDefault();
        }
    };

    // Create and store the global drop handler
    document._globalDropHandler = function(e) {
        // Check if we're over a drop zone (any element with drop-zone-enabled class)
        const target = e.target;
        const supportsClosest = target && typeof target.closest === 'function';
        const isInDropZone = supportsClosest ? target.closest('.drop-zone-enabled') : null;

        if(!isInDropZone) {
            e.preventDefault();
            e.stopPropagation();
            console.log('Prevented unhandled drop outside designated zones');
        }
    };

    // Attach the global event listeners
    document.addEventListener('dragover', document._globalDragOverHandler);
    document.addEventListener('drop', document._globalDropHandler);

    console.log('Global drop prevention initialized');
};

// Release notes export functionality (debug only)
window.setupReleaseNotesExport = function(dotNetRef) {
    document.addEventListener('click', async function(e) {
        const btn = e.target.closest('.rn-export-btn');
        if (!btn) return;

        e.preventDefault();
        e.stopPropagation();

        const version = btn.getAttribute('data-version');
        const mode = btn.getAttribute('data-mode') || 'dark';
        const isForumMode = mode === 'forum';
        const isDarkMode = mode === 'dark';
        if (!version || !dotNetRef) return;

        // Store original icon class for restoration
        const icon = btn.querySelector('i');
        const originalIconClass = icon ? icon.className : '';

        try {
            const html = isForumMode
                ? await dotNetRef.invokeMethodAsync('GetVersionHtmlForForum', version)
                : await dotNetRef.invokeMethodAsync('GetVersionHtml', version, isDarkMode);
            if (html) {
                await navigator.clipboard.writeText(html);
                btn.classList.add('copied');
                if (icon) {
                    icon.className = 'fa-solid fa-check';
                    setTimeout(function() {
                        icon.className = originalIconClass;
                        btn.classList.remove('copied');
                    }, 2000);
                }
            }
        } catch (err) {
            console.error('Release notes export failed:', err);
        }
    });
};

