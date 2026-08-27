
class Reconnector {

    RECONNECT_SHOW_SAFETY_TIMEOUT = 30000;
    RECONNECT_MIN_DELAY_BEFORE_RETRY = 500;
    RELOAD_MIN_DELAY_BEFORE_RETRY = 3000;
    RECONNECT_MAX_RETRIES = 4;
    MAX_RELOAD_RETRIES = 3;
    AUTO_RETRY_INTERVAL = 5000;

    attemptedReload = false;
    lastReconnectAttemptTime = 0;
    lastReloadAttemptTime = 0;
    reconnectAttemptCount = 0;
    reloadCount = 0;
    autoRetryTimer: ReturnType<typeof setInterval> | null = null;

    // Close all tracked WebSocket connections before reloading.
    // This ensures the server detects the circuit disconnect immediately
    // and disposes old circuit components, preventing subscriber leaks.
    closeWebSockets() {
        try {
            // @ts-ignore
            if(window.__dekutronTrackedWebSockets) {
                // @ts-ignore
                window.__dekutronTrackedWebSockets.forEach((ws: WebSocket) => {
                    try { ws.close(); } catch(e) {}
                });
            }
        } catch(e) {}
    }

    constructor() {
        console.log("Created Reconnector");

        let reconnectUiEl = document.getElementById("components-reconnect-modal") as HTMLElement;
        // act when any user activity is detected
        reconnectUiEl.addEventListener("mousemove", (e) => { this.actIfNeeded() });
        reconnectUiEl.addEventListener("mousedown", (e) => { this.actIfNeeded() });
        reconnectUiEl.addEventListener("touchstart", (e) => { this.actIfNeeded() });
        // act when we switch to the tab/window
        window.addEventListener("focus", (e) => { this.actIfNeeded() });

        // When the page becomes visible (e.g., BrowserView activated after being off-screen),
        // immediately check for circuit errors. This is faster than waiting for the next
        // auto-retry timer tick and handles the case where a non-active tab's circuit died
        // during sleep/resume due to backgroundThrottling.
        document.addEventListener("visibilitychange", () => {
            if(!document.hidden) {
                this.actIfNeeded();
            }
        });

        // Auto-retry timer so the app recovers from sleep without waiting for user interaction.
        // This runs periodically and only takes action when a disconnection is detected.
        this.autoRetryTimer = setInterval(() => { this.actIfNeeded() }, this.AUTO_RETRY_INTERVAL);
    }

    actIfNeeded() {

        if(this.attemptedReload) {
            if(this.reloadCount >= this.MAX_RELOAD_RETRIES) {
                // Stop auto-retrying after too many reloads — wait for user interaction
                if(this.autoRetryTimer) {
                    clearInterval(this.autoRetryTimer);
                    this.autoRetryTimer = null;
                }
                console.log("max reload retries reached, waiting for user interaction");
                return;
            }
            if(Date.now() - this.lastReloadAttemptTime < this.RELOAD_MIN_DELAY_BEFORE_RETRY) {
                console.log("already reloading");
            } else {
                console.log("retrying reload (" + (this.reloadCount + 1) + "/" + this.MAX_RELOAD_RETRIES + ")");
                this.reloadCount++;
                this.lastReloadAttemptTime = Date.now();
                this.closeWebSockets();
                location.reload();
            }
            return;
        }

        let isReconnecting = document.querySelectorAll(".components-reconnect-show").length > 0;
        let isFailed = document.querySelectorAll(".components-reconnect-failed").length > 0;
        let isRejected = document.querySelectorAll(".components-reconnect-rejected").length > 0;

        // Check for circuit fatal error (blazor-error-ui visible without reconnection modal).
        // After sleep/resume, non-active tabs' circuits can die because backgroundThrottling
        // prevents the SignalR connection from being maintained. When the frozen JS engine
        // unfreezes, Blazor tries to send data on the dead connection, triggering a fatal
        // "Cannot send data" error instead of the recoverable reconnection modal.
        let errorUi = document.getElementById('blazor-error-ui');
        let hasCircuitError = errorUi && errorUi.style.display;
        if(hasCircuitError && !isReconnecting && !isFailed && !isRejected) {
            if(!this.attemptedReload) {
                console.log("Circuit error detected (blazor-error-ui visible) - reloading to recover");
                this.attemptedReload = true;
                this.reloadCount++;
                this.lastReloadAttemptTime = Date.now();
                this.closeWebSockets();
                location.reload();
            }
            return;
        }

        // No disconnection state — reset for next disconnection event
        if(!isReconnecting && !isFailed && !isRejected) {
            this.lastReconnectAttemptTime = 0;
            this.reconnectAttemptCount = 0;
            return;
        }

        if(isReconnecting) {

            // Blazor is actively reconnecting. Let it work — do NOT force a reload.
            // With long circuit retention, Blazor's built-in reconnection will succeed
            // if given time. It transitions to "failed" or "rejected" on its own.
            if(this.lastReconnectAttemptTime == 0) {
                this.lastReconnectAttemptTime = Date.now();
            }
            if(Date.now() - this.lastReconnectAttemptTime < this.RECONNECT_SHOW_SAFETY_TIMEOUT) {
                console.log("Blazor reconnecting, waiting...");
                return;
            }
            // Safety net: Blazor stuck in "show" for too long. Nudge it with
            // Blazor.reconnect() which will transition to "failed" or "rejected".
            console.log("Blazor reconnect stalled, nudging with Blazor.reconnect()");
            // @ts-ignore
            window.Blazor.reconnect();
            this.lastReconnectAttemptTime = Date.now();
            return;

        }

        if(isFailed) {

            if(Date.now() - this.lastReconnectAttemptTime < this.RECONNECT_MIN_DELAY_BEFORE_RETRY) {
                console.log("recently started reconnect attempt");
                return;
            } else {
                if(this.reconnectAttemptCount < this.RECONNECT_MAX_RETRIES) {
                    console.log("starting reconnect attempt")
                    // @ts-ignore
                    window.Blazor.reconnect();
                    this.lastReconnectAttemptTime = Date.now();
                    this.reconnectAttemptCount++;
                } else {
                    console.log("reconnect attempts: " + this.reconnectAttemptCount + " - starting reload");
                    this.reloadCount++;
                    this.lastReloadAttemptTime = Date.now();
                    this.attemptedReload = true;
                    this.closeWebSockets();
                    location.reload();
                }
                return;
            }

        }

        if(isRejected) {

            console.log("starting reload");
            this.attemptedReload = true;
            this.reloadCount++;
            this.lastReloadAttemptTime = Date.now();
            location.reload();
        }
    }
}

const reconnector = new Reconnector();
