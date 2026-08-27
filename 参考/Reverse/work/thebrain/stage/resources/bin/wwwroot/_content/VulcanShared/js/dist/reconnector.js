"use strict";
class Reconnector {
    closeWebSockets() {
        try {
            if (window.__dekutronTrackedWebSockets) {
                window.__dekutronTrackedWebSockets.forEach((ws) => {
                    try {
                        ws.close();
                    }
                    catch (e) { }
                });
            }
        }
        catch (e) { }
    }
    constructor() {
        this.RECONNECT_SHOW_SAFETY_TIMEOUT = 30000;
        this.RECONNECT_MIN_DELAY_BEFORE_RETRY = 500;
        this.RELOAD_MIN_DELAY_BEFORE_RETRY = 3000;
        this.RECONNECT_MAX_RETRIES = 4;
        this.MAX_RELOAD_RETRIES = 3;
        this.AUTO_RETRY_INTERVAL = 5000;
        this.attemptedReload = false;
        this.lastReconnectAttemptTime = 0;
        this.lastReloadAttemptTime = 0;
        this.reconnectAttemptCount = 0;
        this.reloadCount = 0;
        this.autoRetryTimer = null;
        console.log("Created Reconnector");
        let reconnectUiEl = document.getElementById("components-reconnect-modal");
        reconnectUiEl.addEventListener("mousemove", (e) => { this.actIfNeeded(); });
        reconnectUiEl.addEventListener("mousedown", (e) => { this.actIfNeeded(); });
        reconnectUiEl.addEventListener("touchstart", (e) => { this.actIfNeeded(); });
        window.addEventListener("focus", (e) => { this.actIfNeeded(); });
        document.addEventListener("visibilitychange", () => {
            if (!document.hidden) {
                this.actIfNeeded();
            }
        });
        this.autoRetryTimer = setInterval(() => { this.actIfNeeded(); }, this.AUTO_RETRY_INTERVAL);
    }
    actIfNeeded() {
        if (this.attemptedReload) {
            if (this.reloadCount >= this.MAX_RELOAD_RETRIES) {
                if (this.autoRetryTimer) {
                    clearInterval(this.autoRetryTimer);
                    this.autoRetryTimer = null;
                }
                console.log("max reload retries reached, waiting for user interaction");
                return;
            }
            if (Date.now() - this.lastReloadAttemptTime < this.RELOAD_MIN_DELAY_BEFORE_RETRY) {
                console.log("already reloading");
            }
            else {
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
        let errorUi = document.getElementById('blazor-error-ui');
        let hasCircuitError = errorUi && errorUi.style.display;
        if (hasCircuitError && !isReconnecting && !isFailed && !isRejected) {
            if (!this.attemptedReload) {
                console.log("Circuit error detected (blazor-error-ui visible) - reloading to recover");
                this.attemptedReload = true;
                this.reloadCount++;
                this.lastReloadAttemptTime = Date.now();
                this.closeWebSockets();
                location.reload();
            }
            return;
        }
        if (!isReconnecting && !isFailed && !isRejected) {
            this.lastReconnectAttemptTime = 0;
            this.reconnectAttemptCount = 0;
            return;
        }
        if (isReconnecting) {
            if (this.lastReconnectAttemptTime == 0) {
                this.lastReconnectAttemptTime = Date.now();
            }
            if (Date.now() - this.lastReconnectAttemptTime < this.RECONNECT_SHOW_SAFETY_TIMEOUT) {
                console.log("Blazor reconnecting, waiting...");
                return;
            }
            console.log("Blazor reconnect stalled, nudging with Blazor.reconnect()");
            window.Blazor.reconnect();
            this.lastReconnectAttemptTime = Date.now();
            return;
        }
        if (isFailed) {
            if (Date.now() - this.lastReconnectAttemptTime < this.RECONNECT_MIN_DELAY_BEFORE_RETRY) {
                console.log("recently started reconnect attempt");
                return;
            }
            else {
                if (this.reconnectAttemptCount < this.RECONNECT_MAX_RETRIES) {
                    console.log("starting reconnect attempt");
                    window.Blazor.reconnect();
                    this.lastReconnectAttemptTime = Date.now();
                    this.reconnectAttemptCount++;
                }
                else {
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
        if (isRejected) {
            console.log("starting reload");
            this.attemptedReload = true;
            this.reloadCount++;
            this.lastReloadAttemptTime = Date.now();
            location.reload();
        }
    }
}
const reconnector = new Reconnector();
//# sourceMappingURL=reconnector.js.map