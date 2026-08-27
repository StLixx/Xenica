export function safeInvoke(ref, methodName, args, onDisposed) {
    var _a;
    try {
        (_a = ref === null || ref === void 0 ? void 0 : ref.invokeMethodAsync(methodName, ...(args || []))) === null || _a === void 0 ? void 0 : _a.catch(() => { onDisposed === null || onDisposed === void 0 ? void 0 : onDisposed(); });
    }
    catch (_b) {
        onDisposed === null || onDisposed === void 0 ? void 0 : onDisposed();
    }
}
export function safeInvokeAsync(ref, methodName, args, onDisposed) {
    var _a, _b;
    try {
        return (_b = (_a = ref === null || ref === void 0 ? void 0 : ref.invokeMethodAsync(methodName, ...(args || []))) === null || _a === void 0 ? void 0 : _a.catch(() => { onDisposed === null || onDisposed === void 0 ? void 0 : onDisposed(); return undefined; })) !== null && _b !== void 0 ? _b : Promise.resolve(undefined);
    }
    catch (_c) {
        onDisposed === null || onDisposed === void 0 ? void 0 : onDisposed();
        return Promise.resolve(undefined);
    }
}
//# sourceMappingURL=interop.js.map