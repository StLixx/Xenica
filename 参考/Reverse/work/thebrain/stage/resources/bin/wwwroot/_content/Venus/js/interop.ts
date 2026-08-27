// Safe wrappers for calling .NET methods from JavaScript via Blazor's DotNetObjectReference.
//
// THE PROBLEM:
// When a Blazor component is disposed (e.g., a dialog is hidden, a sidebar is collapsed, or a
// page navigates away), its DotNetObjectReference is disposed on the .NET side. However,
// JavaScript event handlers — keyboard listeners, ResizeObservers, touch handlers, timers —
// may still hold a reference to it and attempt to call invokeMethodAsync. This produces a
// "System.ArgumentException: There is no tracked object with id '...' — it has already been
// disposed" error that surfaces as an unhandled promise rejection, crashing the WebView on
// mobile platforms (iOS/Android) with an unrecoverable error dialog.
//
// WHY BOTH try/catch AND .catch():
// invokeMethodAsync can fail in two distinct ways:
//   1. Synchronous throw — if the ref itself is null/invalid or the interop layer rejects
//      the call immediately. Caught by the try/catch block.
//   2. Asynchronous promise rejection — the call is dispatched to .NET, which discovers the
//      object is disposed and rejects the returned Promise. This is NOT caught by try/catch;
//      only a .catch() on the Promise prevents an unhandledrejection event.
// Both paths must be guarded.
//
// onDisposed CALLBACK:
// Some callers maintain collections of refs (e.g., keyboard subscriber lists) and need to
// remove dead entries when a ref turns out to be disposed. The optional onDisposed callback
// fires on either failure path, letting callers clean up without duplicating error-handling
// boilerplate.
//
// WHEN TO USE vs. direct invokeMethodAsync:
// Use safeInvoke/safeInvokeAsync for calls that happen ASYNCHRONOUSLY relative to the
// component's lifetime — event listeners, setTimeout, ResizeObserver, IntersectionObserver,
// touch/pointer handlers, debounced callbacks, etc. In these contexts the component may have
// been disposed between when the handler was registered and when it fires.
//
// Use invokeMethodAsync directly when the call is a SYNCHRONOUS response to a Blazor-initiated
// action (C# called into JS, and JS is calling back immediately). The component initiated the
// call so it can't be disposed mid-call. Using safeInvoke here would mask genuine bugs like
// wrong method names or argument mismatches.
//
// USAGE:
//   safeInvoke(dotNetRef, 'OnResized', [width, height]);
//   safeInvoke(subscriber.ref, 'HandleKeyPress', [key], () => removeSubscriber(subscriber));
//   const result = await safeInvokeAsync<string>(ref, 'GetValue', [id]);

export function safeInvoke(ref: any, methodName: string, args?: any[], onDisposed?: () => void): void {
	try {
		ref?.invokeMethodAsync(methodName, ...(args || []))
			?.catch(() => { onDisposed?.(); });
	} catch {
		onDisposed?.();
	}
}

export function safeInvokeAsync<T = any>(ref: any, methodName: string, args?: any[], onDisposed?: () => void): Promise<T | undefined> {
	try {
		return ref?.invokeMethodAsync(methodName, ...(args || []))
			?.catch(() => { onDisposed?.(); return undefined; }) ?? Promise.resolve(undefined);
	} catch {
		onDisposed?.();
		return Promise.resolve(undefined);
	}
}
