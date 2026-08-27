// Handle addition of "dark" class to top level element.
// Needs to happen in the head tag to avoid flashing the wrong style at load.This means that we cannot rely on getting data from the
// server side.Therefore, we store the theme setting in localStorage for access here.

// Get window ID from URL for Electron multi-window support
window.dekutronWindowId = (() => {
	try {
		const params = new URLSearchParams(window.location.search);
		const windowId = params.get('windowId');
		return windowId ? parseInt(windowId, 10) : null;
	} catch {
		return null;
	}
})();

// Get the storage key for theme (window-scoped for Electron, global otherwise)
window.getThemeStorageKey = () => {
	const windowId = window.dekutronWindowId;
	return windowId && windowId > 0 ? `theme_window_${windowId}` : 'theme';
};

// Configure MathJax before it loads.
// Load all-packages so every TeX extension (mhchem, enclose, etc.) is available
// immediately. Without this, autoload/require fail to wire dynamically loaded
// extensions into the TeX input when using typesetPromise().
// Physics is deliberately excluded from all-packages by MathJax because it
// redefines \sin, \cos, etc. Users can opt in with \require{physics}.
window.MathJax = {
	loader: {
		load: ['[tex]/all-packages']
	},
	tex: {
		packages: {'[+]': ['all-packages']}
	},
	chtml: {
		fontURL: '_content/Venus/lib/mathjax/output/chtml/fonts/woff-v2',
		matchFontHeight: false
	},
	startup: {
		typeset: false
	}
};

window.updateTheme = () => {
	const storageKey = window.getThemeStorageKey();
	const themeValue = localStorage.getItem(storageKey);

	if (themeValue === '"Dark"' || (!themeValue && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
		document.documentElement.classList.add('dark');
	} else {
		document.documentElement.classList.remove('dark');
	}
};

window.updateTheme();

// watch for changes to OS color scheme (light / dark)
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function(e) {
	// call the Venus way of checking system light / dark and set it properly
	window.updateTheme();
});

window.venusProbeGetIsDark = () => {
    return document.documentElement.classList.contains("dark");
};

// Retry a failed <img> load a few times before giving up. A bare <img> treats the first
// failed load as terminal: the browser paints its broken-image glyph and never re-requests,
// which loses startup races where the source becomes available a moment later (e.g. a brain
// thumbnail whose file isn't on disk yet, or a gravatar that fails on an early network hiccup).
// Attach via the literal HTML attribute  onerror="window.venusImgRetry(this)"  so it is wired
// at parse time, independent of the Blazor circuit (a Blazor @onerror can miss failures that
// happen before the circuit connects). Optional data-* attributes:
//   data-retry-max       max attempts before giving up (default 5)
//   data-retry-fallback  src to swap in once retries are exhausted
window.venusImgRetry = (img) => {
	if(!img) {
		return;
	}
	const max = parseInt(img.dataset.retryMax || "5", 10);
	const raw = img.getAttribute("src") || "";
	// Strip our own cache-bust param to recover the real source. Recomputed every call so the
	// counter resets cleanly if Blazor swaps in a genuinely new src (e.g. an icon update).
	const base = raw.replace(/[?&]_imgretry=\d+$/, "");

	if(img.dataset.retryBase !== base) {
		img.dataset.retryBase = base;
		img.dataset.retryCount = "0";
	}

	const count = parseInt(img.dataset.retryCount || "0", 10);
	if(count >= max) {
		const fallback = img.dataset.retryFallback;
		if(fallback && raw !== fallback) {
			img.src = fallback;
		}
		return;
	}

	const next = count + 1;
	img.dataset.retryCount = next.toString();
	// Backoff (150, 300, 600, 1200, 2400ms... capped at 3000) to give the source time to appear.
	const delay = Math.min(150 * Math.pow(2, count), 3000);
	window.setTimeout(() => {
		// The cache-bust param forces a real re-request instead of reusing the cached failure.
		const sep = base.includes("?") ? "&" : "?";
		img.src = `${base}${sep}_imgretry=${next}`;
	}, delay);
};

window.venusProbeGetInfoForVenusSession = () => {
	return navigator.userAgent + "\n" + navigator.platform + "\n" + new Date().getTimezoneOffset() + "\n" + (navigator.maxTouchPoints ? navigator.maxTouchPoints : 0);
}

window.copyTextToClipboard = (text) => {
	if(navigator.clipboard && navigator.clipboard.writeText) {
		return navigator.clipboard.writeText(text).then(
			() => true,
			(err) => {
				console.error('Failed to copy text using navigator.clipboard: ', err);
				return false;
			}
		);
	} else {
		return false;
	}
}

window.venusProbeStartResizeListener = (dotNetHelper) => {
	window.addEventListener('resize', () => {
		dotNetHelper.invokeMethodAsync('OnResize', window.innerWidth, window.innerHeight, window.devicePixelRatio);
	});
	dotNetHelper.invokeMethodAsync('OnResize', window.innerWidth, window.innerHeight, window.devicePixelRatio);

	// Push soft-keyboard visibility into VenusSession. Source events are dispatched by the
	// iOS visualViewport tracker and the Android native handler defined later in this file.
	window.addEventListener('keyboardheightchange', (e) => {
		const height = e.detail && e.detail.height;
		dotNetHelper.invokeMethodAsync('OnSoftKeyboardVisibilityChanged', height > 0);
	});
}

// from https://github.com/conficient/BlazorDynamicScriptLoad
// via https://stackoverflow.com/questions/66471037/how-to-integrate-google-recaptcha-v2-for-blazor-webassembly-with-an-asp-net-core
// loadScript: returns a promise that completes when the script loads
window.loadScript = function(scriptPath, scriptAsync, scriptDefer) {
	// check list - if already loaded we can ignore
	if(loadState.hasOwnProperty(scriptPath)) {
		console.log(scriptPath + " already in state " + loadState[scriptPath]);
		// return 'empty' promise
		return new this.Promise(function(resolve, reject) {
			resolve();
		});
	}

	return new Promise(function(resolve, reject) {
		// create JS library script element
		var script = document.createElement("script");

		script.src = scriptPath;
		script.async = scriptAsync == true;
		script.defer = scriptDefer == true;

		script.src = scriptPath;
		script.type = "text/javascript";

		console.log("loading " + scriptPath);

		// flag as loading/loaded
		loadState[scriptPath] = "loading";

		// if the script returns okay, return resolve
		script.onload = function () {
			console.log(scriptPath + " load success");
			loadState[scriptPath] = "success";
			resolve(scriptPath);
		};

		// if it fails, return reject
		script.onerror = function () {
			console.log(scriptPath + " load fail");
			loadState[scriptPath] = "fail";
			reject(scriptPath);
		}

		// scripts will load at end of body
		document["body"].appendChild(script);
	});
}
loadState = {}; // status of scripts
window.isScriptLoaded = (script) => {
	var isLoaded = loadState[script] === "success";
	console.log("isLoaded: " + script + " = " + isLoaded);
	return isLoaded;
}

// On iPad and iPhone, 100vh measures the height from the top of the page to underneath the
// Safari chrome, so we cannot get the bottom of our UI to line up with the bottom of the
// screen unless we use JavaScript to set a CSS property that tells us this information.
// In our CSS we can then elect to use this:     height: calc(100.0 * var(--vh, 1vh));
//                         in place of this:     height: 100vh;
// We never change the size of any elements explicitly using JavaScript because that becomes
// very icky very quickly.
window.lastVh = -1;
window.updateVH = () => {
	// First we get the viewport height and we multiple it by 1% to get a value for a vh unit
	let vh = window.innerHeight * 0.01;
	let scale = window.visualViewport.scale;
	vh *= scale; // make it so pinch-to-zoom doesn't cause the bottom to be cut off
	// Then we set the value in the --vh custom property to the root of the document
	if(vh === window.lastVh) {
		return;
	}
	window.lastVh = vh;
	document.documentElement.style.setProperty('--vh', `${vh}px`);
};
window.ongoingTouchIds = new Set();
window.needVhUpdate = false;
window.ontouchstart = (evt) => {
	for (let i = 0; i < evt.changedTouches.length; i++) {
		window.ongoingTouchIds.add(evt.changedTouches[i].identifier);
	}
};
let MS_BOUNCE_TIME = 540;
let MS_BOUNCE_TIME_BIGGER = MS_BOUNCE_TIME + 150;
window.lastTimeAfterRelease = Date.now();
window.ontouchend = (evt) => {
	for (let i = 0; i < evt.changedTouches.length; i++) {
		window.ongoingTouchIds.delete(evt.changedTouches[i].identifier);
	}
	if(window.needVhUpdate && window.ongoingTouchIds.size == 0) {
		window.lastTimeAfterRelease = Date.now();
		setTimeout(() => {
			window.updateVH();
		}, MS_BOUNCE_TIME_BIGGER);
		window.needVhUpdate = false;
	}
};
window.vhOnResized = () => {
	if(window.ongoingTouchIds.size == 0) {
		let delta = Date.now() - window.lastTimeAfterRelease;
		if(delta >= MS_BOUNCE_TIME) {
			window.updateVH();
		}
	} else {
		window.needVhUpdate = true;
	}
};
window.updateVH();
window.onresize = window.vhOnResized;

// iOS keyboard height tracking for MAUI WKWebView.
// When the keyboard appears on iOS, visualViewport.height shrinks while window.innerHeight
// stays the same. We expose the difference as --keyboard-height so CSS can shrink containers.
(function() {
	var vv = window.visualViewport;
	if (!vv) return;

	var initialHeight = vv.height;
	var lastKbHeight = 0;

	function updateKeyboardHeight() {
		var kbHeight = Math.max(0, Math.round(initialHeight - vv.height));

		// Threshold to avoid false positives from minor viewport adjustments
		if (kbHeight < 50) {
			kbHeight = 0;
		}

		if (kbHeight !== lastKbHeight) {
			var previousHeight = lastKbHeight;
			lastKbHeight = kbHeight;
			document.documentElement.style.setProperty('--keyboard-height', kbHeight + 'px');
			if (kbHeight > 0) {
				document.documentElement.dataset.keyboardVisible = '';
			} else {
				delete document.documentElement.dataset.keyboardVisible;
			}
			// Mirror the Android native keyboardheightchange event so JS can react to
			// keyboard appearance/height changes uniformly across platforms (no polling).
			window.dispatchEvent(new CustomEvent('keyboardheightchange', {
				detail: { height: kbHeight, previousHeight: previousHeight }
			}));
		}
	}

	vv.addEventListener('resize', function() {
		updateKeyboardHeight();
	});

	// Recalculate initialHeight on orientation change / actual viewport resize
	// (when no keyboard is showing, i.e. kbHeight was 0 before the resize)
	window.addEventListener('resize', function() {
		if (lastKbHeight === 0) {
			initialHeight = vv.height;
		}
	});

	// Catch timing edge cases where resize fires before keyboard animation completes
	document.addEventListener('focusin', function() {
		setTimeout(updateKeyboardHeight, 300);
	});
	document.addEventListener('focusout', function() {
		setTimeout(updateKeyboardHeight, 300);
	});

	document.documentElement.style.setProperty('--keyboard-height', '0px');
})();

// Android keyboard visibility tracking.
// On Android, the native handler dispatches 'keyboardheightchange' window events and sets
// --keyboard-height directly. Mirror the data-keyboard-visible attribute here so CSS can
// react to keyboard presence (used by the phone editor toolbar).
window.addEventListener('keyboardheightchange', function(e) {
	var height = e.detail && e.detail.height;
	if (height > 0) {
		document.documentElement.dataset.keyboardVisible = '';
	} else {
		delete document.documentElement.dataset.keyboardVisible;
	}
});
