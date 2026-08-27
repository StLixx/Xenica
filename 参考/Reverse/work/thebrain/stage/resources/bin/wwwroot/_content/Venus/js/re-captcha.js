function render_recaptcha(dotNetObj, selector, sitekey) {
	if(grecaptcha === undefined || grecaptcha.render === undefined) {
		// wait for grecaptcha to be ready before attempting to render
		setTimeout(() => {
			render_recaptcha(dotNetObj, selector, sitekey);
		}, 250);
		return;
	}
    return grecaptcha.render(selector, {
        'sitekey': sitekey,
        'callback': (response) => { dotNetObj.invokeMethodAsync('CallbackOnReCaptchaSuccess', response); },
        'expired-callback': () => { dotNetObj.invokeMethodAsync('CallbackOnReCaptchaExpired'); }
    });  
};

function getResponse(widgetId) {
    return grecaptcha.getResponse(widgetId);
}
