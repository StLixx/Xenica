class SalesApi {
    constructor() {
        this.THEBRAIN_EXTERNAL_API_SERVLET = "https://salesapi.thebrain.com/?";
        this.hasLicenseForVersion = async (email, version, callback) => {
            let json = await this.smallRequesterPrep("hasLicenseForVersion", ["email", "version"], [email, version.toString()]);
            callback(JSON.parse(json));
        };
        this.getDiscounts = async (emailInputId, productIds, callback) => {
            let email = null;
            if (emailInputId != null && emailInputId.length > 0) {
                let element = document.getElementById(emailInputId);
                if (element) {
                    email = element.value;
                }
            }
            this.getDiscountsDirectEmail(email, productIds, callback);
        };
        this.getDiscountsDirectEmail = async (email, productIds, callback) => {
            let productIdList = productIds.join(',');
            let json = await this.smallRequesterPrep("getDiscounts", ["e", "pids"], [email, productIdList]);
            callback(JSON.parse(json));
        };
        this.getCartSize = async () => {
            let json = await this.smallRequester("getCartSize", null);
            let result = JSON.parse(json);
            let func = window.onCartUpdated;
            if (func) {
                func(Number(result.getCartSize));
            }
        };
        this.getCampaignId = async (callback) => {
            let json = await this.smallRequester("getCampaignId", null);
            let result = JSON.parse(json);
            callback(Number(result.getCampaignId));
        };
        this.addToCart = async (productId) => {
            let data = '{"cart":[{"productId":"' + productId + '"}]}';
            await this.smallRequester('doAddToCart', data);
            this.getCartSize();
        };
        this.getCart = async (callback) => {
            let json = await this.smallRequester("getCart", null);
            console.log("getCart json: " + json);
            callback(JSON.parse(json));
        };
        this.updateCart = async (cart) => {
            let data = JSON.stringify(cart);
            await this.smallRequester('doUpdateCart', data);
            this.getCartSize();
        };
        this.newsletterSignup = async (email, firstName, lastName, newsletter, corpSol, callback) => {
            let json = await this.smallRequesterPrep("doNewsletterSignup", ["email", "firstName", "lastName", "newsletter", "corpSol"], [email, firstName, lastName, newsletter.toString(), corpSol.toString()]);
            callback(JSON.parse(json));
        };
        this.didSignUp = async () => {
            await this.smallRequester('didSignUp', null);
        };
        this.trackCampaign = async (campaignId) => {
            let data = '{"campaignId":"' + campaignId + '"}';
            await this.smallRequester('doTrackCampaign', data);
        };
        this.setMarketingCampaignForUser = async (email) => {
            let data = '{"email":"' + email + '"}';
            await this.smallRequester('doSetMarketingCampaignForUser', data);
        };
        this.purchase = async (email, firstName, lastName, country, cardNumber, cvc, expMonth, expYear, address, city, state, zip, phone, callback) => {
            let expMonthStr = "" + expMonth;
            let expYearStr = this.addCenturyPrefix("" + expYear);
            cardNumber = cardNumber.replace(/\s/g, "");
            let orderInfo = {
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
            };
            let data = JSON.stringify(orderInfo);
            let json = await this.smallRequester("doPurchase", data);
            callback(JSON.parse(json));
        };
        this.smallRequesterPrep = async (action, parameterNames, parameterValues) => {
            let dataParts = [];
            dataParts.push('{');
            for (let n = 0; n < parameterNames.length; n++) {
                if (n > 0) {
                    dataParts.push(',');
                }
                dataParts.push('"' + parameterNames[n] + '":"' + parameterValues[n] + '"');
            }
            dataParts.push('}');
            let data = dataParts.join('');
            return await this.smallRequester(action, data);
        };
        this.smallRequester = async (action, data) => {
            let url = this.THEBRAIN_EXTERNAL_API_SERVLET;
            url += 'a=' + action + '&unq=' + Date.now();
            if (data) {
                url += '&d=' + encodeURIComponent(data);
            }
            console.log("requesting: " + url);
            const response = await fetch(url, { credentials: 'include' });
            if (!response.ok) {
                throw new Error(`HTTP error when requesting ${url} - status: ${response.status}`);
            }
            return await response.text();
        };
        console.log("SalesApi created");
    }
    addCenturyPrefix(expYearString) {
        if (expYearString.length == 4) {
            return expYearString;
        }
        let expYearShort = Number(expYearString);
        let currentYear = new Date().getFullYear();
        let currentYearShort = currentYear % 100;
        if (currentYearShort <= expYearShort) {
            return String(expYearShort + (currentYear - currentYearShort));
        }
        else {
            return String(expYearShort + (currentYear + 100 - currentYearShort));
        }
    }
}
const salesApi = new SalesApi();
globalThis.salesApi = salesApi;
class SalesApiWrapper {
    constructor() {
        console.log("SalesApiWrapper created");
    }
    getCampaignId() {
        return new Promise((resolve, reject) => {
            salesApi.getCampaignId((result) => {
                resolve(result);
            });
        });
    }
    trackCampaign(campaignId) {
        return new Promise((resolve, reject) => {
            salesApi.trackCampaign(campaignId);
            resolve();
        });
    }
    setMarketingCampaignForUser(email) {
        return new Promise((resolve, reject) => {
            salesApi.setMarketingCampaignForUser(email);
            resolve();
        });
    }
    didSignUp() {
        return new Promise((resolve, reject) => {
            salesApi.didSignUp();
            resolve();
        });
    }
}
export const salesApiWrapper = new SalesApiWrapper();
globalThis.SalesApiWrapper = SalesApiWrapper;
//# sourceMappingURL=salesApi.js.map