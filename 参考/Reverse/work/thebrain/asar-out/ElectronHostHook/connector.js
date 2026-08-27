// @ts-nocheck
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Connector = void 0;
// Note: Socket type is provided at runtime by ElectronNET main process
class Connector {
    constructor(socket, app) {
        this.socket = socket;
        this.app = app;
    }
    on(key, javaScriptCode) {
        this.socket.on(key, (...args) => {
            const id = args.pop();
            const safeEmit = (eventName, ...emitArgs) => {
                try {
                    if (this.socket && this.socket.connected !== false) {
                        this.socket.emit(eventName, ...emitArgs);
                    }
                }
                catch (e) {
                    // Ignore errors during shutdown (e.g., "Object has been destroyed")
                }
            };
            try {
                javaScriptCode(...args, (data) => {
                    if (data) {
                        safeEmit(`${key}Complete${id}`, data);
                    }
                });
            }
            catch (error) {
                safeEmit(`${key}Error${id}`, `Host Hook Exception`, error);
            }
        });
    }
}
exports.Connector = Connector;
