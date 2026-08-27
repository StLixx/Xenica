class LocalFontHelper {
    constructor() {
        this._cachedFonts = null;
    }
    async getLocalFonts() {
        if (this._cachedFonts != null) {
            return this._cachedFonts;
        }
        try {
            if (typeof window.queryLocalFonts !== "function") {
                return [];
            }
            const fonts = await window.queryLocalFonts();
            const familySet = new Set();
            for (const font of fonts) {
                familySet.add(font.family);
            }
            this._cachedFonts = Array.from(familySet).sort((a, b) => a.localeCompare(b));
            return this._cachedFonts;
        }
        catch (_a) {
            return [];
        }
    }
    isLocalFontAccessSupported() {
        return typeof window.queryLocalFonts === "function";
    }
    clearCache() {
        this._cachedFonts = null;
    }
}
export const localFontHelper = new LocalFontHelper();
//# sourceMappingURL=localFontHelper.js.map