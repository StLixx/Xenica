// see https://learn.microsoft.com/en-us/aspnet/core/blazor/fundamentals/startup?view=aspnetcore-7.0#javascript-initializers
// for Javascript initializers

export function afterServerStarted(blazor) {
	console.log("Registering longpress handler for longpress.js");
	blazor.registerCustomEventType('longpress', {
		createEventArgs: event => {
            return {
                bubbles: event.bubbles,
                cancelable: event.cancelable,
                screenX: event.detail.screenX,
                screenY: event.detail.screenY,
                clientX: event.detail.clientX,
                clientY: event.detail.clientY,
                offsetX: event.detail.offsetX,
                offsetY: event.detail.offsetY,
                pageX: event.detail.pageX,
                pageY: event.detail.pageY,
                sourceElement: event.srcElement.localName,
                targetElement: event.target.localName,
                timeStamp: event.timeStamp,
                type: event.type,
			};
		}
	});
}
