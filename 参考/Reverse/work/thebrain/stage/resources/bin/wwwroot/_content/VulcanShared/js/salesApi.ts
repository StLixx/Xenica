interface BillingInfo {
	firstName: string;
	lastName: string;
	email: string;
	address1: string;
	address2: string;
	city: string;
	state: string;
	zip: string;
	country: string;
	phone: string;
}

interface PaymentInfo {
	cardNumber: string;
	cvc: string;
	expMonth: string;
	expYear: string;
}

interface OptionalInfo {
	title: string;
	company: string;
	businessPhone: string;
	companyActivity: string;
	jobFunction: string;
	useFor: string;
	useAt: string;
	learnedFrom: string;
}

interface OrderInfo {
	billing: BillingInfo;
	payment: PaymentInfo;
	optional: OptionalInfo;
}

class SalesApi {

	//THEBRAIN_EXTERNAL_API_SERVLET = "https://thebrain-sales-api-dotnet-staging.azurewebsites.net/?";
	THEBRAIN_EXTERNAL_API_SERVLET = "https://salesapi.thebrain.com/?";

	constructor() {
		console.log("SalesApi created");
	}

	hasLicenseForVersion = async (email: string, version: number, callback: (result: {}) => void) => {
		let json = await this.smallRequesterPrep("hasLicenseForVersion", ["email", "version"], [email, version.toString()]);
		//console.log("hasLicenseForVersion json: " + json);
		callback(JSON.parse(json));
	}

	getDiscounts = async (emailInputId: string | null, productIds: number[], callback:(result: {}) => void) => {
		let email: string | null = null;
		if(emailInputId != null && emailInputId.length > 0) {
			let element = document.getElementById(emailInputId) as HTMLInputElement;
			if(element) {
				email = element.value;
			}
		}
		this.getDiscountsDirectEmail(email, productIds, callback);
	}

	getDiscountsDirectEmail = async (email: string | null, productIds: number[], callback:(result: {}) => void)=> {
		let productIdList: string = productIds.join(',');
		let json = await this.smallRequesterPrep("getDiscounts", ["e", "pids"], [email, productIdList]);
		callback(JSON.parse(json));
	}

	getCartSize = async () => {
		let json = await this.smallRequester("getCartSize", null);
		let result: any = JSON.parse(json);
		//console.log("getCartSize json: " + json);
		// @ts-ignore
		let func = window.onCartUpdated
		if(func) {
			func(Number(result.getCartSize));
		}
	}

	getCampaignId = async (callback:(result: Number) => void) => {
		let json = await this.smallRequester("getCampaignId", null);
		let result: any = JSON.parse(json);
		callback(Number(result.getCampaignId));
	}

	addToCart = async (productId: number) => {
		let data = '{"cart":[{"productId":"'+productId+'"}]}'
		await this.smallRequester('doAddToCart', data);
		this.getCartSize();
	}

	getCart = async (callback:(result: {}) => void) => {
		let json = await this.smallRequester("getCart", null);
		console.log("getCart json: " + json);
		callback(JSON.parse(json));
	}

	updateCart = async (cart: {}) => {
		let data = JSON.stringify(cart);
		await this.smallRequester('doUpdateCart', data);
		this.getCartSize();
	}

	newsletterSignup = async (email: string, firstName: string, lastName: string, newsletter: boolean, corpSol: boolean, callback:(result: {}) => void) => {
		let json = await this.smallRequesterPrep("doNewsletterSignup", ["email", "firstName", "lastName", "newsletter", "corpSol"], [email, firstName, lastName, newsletter.toString(), corpSol.toString()]);
		callback(JSON.parse(json));
	}
	
	didSignUp = async () => {
		await this.smallRequester('didSignUp', null);
	}
	
	trackCampaign = async (campaignId: number) => {
		let data = '{"campaignId":"'+campaignId+'"}'
		await this.smallRequester('doTrackCampaign', data);
	}

	setMarketingCampaignForUser = async (email: string) => {
		let data = '{"email":"'+email+'"}'
		await this.smallRequester('doSetMarketingCampaignForUser', data);
	}

	addCenturyPrefix(expYearString: string): string {
		if(expYearString.length == 4) {
			return expYearString;
		}
		// sales api is expecting a four digit number...
		// future proof beyond 2099:
		let expYearShort = Number(expYearString);
		let currentYear = new Date().getFullYear();
		let currentYearShort = currentYear % 100;
		if(currentYearShort <= expYearShort) {
			return String(expYearShort + (currentYear - currentYearShort));
		} else {
			return String(expYearShort + (currentYear + 100 - currentYearShort));
		}
	}

	purchase = async (email: string, firstName: string, lastName: string, country: string, cardNumber: string, cvc: string, expMonth: string, expYear: string, address: string, city: string, state: string, zip: string, phone: string, callback:(result: {}) => void) => {

		let expMonthStr = "" + expMonth; // force conversion to string
		let expYearStr = this.addCenturyPrefix("" + expYear); // ensure we have a 4 digit year

		cardNumber = cardNumber.replace(/\s/g, ""); // eliminate spaces

		let orderInfo: OrderInfo = {
			billing: {
				firstName: firstName,
				lastName: lastName,
				email: email,
				address1: address,
				address2: "",
				city: city,
				state: state,
				zip: zip,
				country: country,
				phone: phone
			},
			payment: {
				cardNumber: cardNumber,
				cvc: cvc,
				expMonth: expMonthStr,
				expYear: expYearStr
			},
			optional: {
				title: "",
				company: "",
				businessPhone: "",
				companyActivity: "",
				jobFunction: "",
				useFor: "",
				useAt: "",
				learnedFrom: ""
			}
		}
		let data = JSON.stringify(orderInfo);

		let json = await this.smallRequester("doPurchase", data);
		callback(JSON.parse(json));
	}

	smallRequesterPrep = async (action: string, parameterNames: string[], parameterValues: (string | null)[]) => {

		let dataParts: string[] = [];
		dataParts.push('{');
		for(let n = 0; n < parameterNames.length; n++) {
			if(n > 0) {
				dataParts.push(',');
			}
			dataParts.push('"' + parameterNames[n] + '":"' + parameterValues[n] + '"');
		}
		dataParts.push('}');
		let data = dataParts.join('');

		return await this.smallRequester(action, data);
	}

	smallRequester = async (action: string, data: string | null) => {
		let url = this.THEBRAIN_EXTERNAL_API_SERVLET;
		url += 'a=' + action + '&unq=' + Date.now();
		if(data) {
			url += '&d=' + encodeURIComponent(data)
		}
		//url += '&sid=';
		console.log("requesting: " + url);
		const response = await fetch(url, { credentials: 'include' });

		if (!response.ok) {
			throw new Error(`HTTP error when requesting ${url} - status: ${response.status}`);
		}

		return await response.text();
	}
}

const salesApi: SalesApi = new SalesApi();

// @ts-ignore
globalThis.salesApi = salesApi;

class SalesApiWrapper {
	// This class is needed to simplify calling sales api from Blazor (C#).
	// It handles the callback from the sales api and passes the result back to Blazor.

	constructor() {
		console.log("SalesApiWrapper created");
	}

	getCampaignId(): Promise<Number> {
		return new Promise((resolve, reject) => {
			salesApi.getCampaignId((result: Number) => {
				resolve(result);
			});
		});
	}
	
	trackCampaign(campaignId: number): Promise<void> {
		return new Promise((resolve, reject) => {
			salesApi.trackCampaign(campaignId);
			resolve();
		});
	}

	setMarketingCampaignForUser(email: string): Promise<void> {
		return new Promise((resolve, reject) => {
			salesApi.setMarketingCampaignForUser(email);
			resolve();
		});
	}
	
	didSignUp(): Promise<void> {
		return new Promise((resolve, reject) => {
			salesApi.didSignUp();
			resolve();
		});
	}
}

export const salesApiWrapper: SalesApiWrapper = new SalesApiWrapper();

// @ts-ignore
globalThis.SalesApiWrapper = SalesApiWrapper;

