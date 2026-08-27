// Local copy of Venus/wwwroot/js/interop.ts — see that file for full documentation.
// Duplicated here because Vulcan's tsconfig cannot resolve cross-project /_content/ imports at compile time.

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
