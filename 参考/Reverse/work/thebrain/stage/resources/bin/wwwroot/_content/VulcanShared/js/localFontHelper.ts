class LocalFontHelper {

	private _cachedFonts: string[] | null = null;

	async getLocalFonts(): Promise<string[]> {
		if(this._cachedFonts != null) {
			return this._cachedFonts;
		}

		try {
			// @ts-ignore — queryLocalFonts is not yet in all TS lib typings
			if(typeof window.queryLocalFonts !== "function") {
				return [];
			}
			// @ts-ignore
			const fonts: FontData[] = await window.queryLocalFonts();
			const familySet = new Set<string>();
			for(const font of fonts) {
				familySet.add(font.family);
			}
			this._cachedFonts = Array.from(familySet).sort((a, b) => a.localeCompare(b));
			return this._cachedFonts;
		} catch {
			// User denied permission or API unavailable
			return [];
		}
	}

	isLocalFontAccessSupported(): boolean {
		// @ts-ignore
		return typeof window.queryLocalFonts === "function";
	}

	clearCache(): void {
		this._cachedFonts = null;
	}
}

export const localFontHelper: LocalFontHelper = new LocalFontHelper();
