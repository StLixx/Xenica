export class ImageBrightness {
	/**
	 * Calculates the average brightness of an image using canvas.
	 * Returns a value between 0 (dark) and 1 (bright).
	 * @param imageUrl The URL of the image to analyze
	 * @returns Promise resolving to brightness value (0-1)
	 */
	public static async getAverageBrightness(imageUrl: string): Promise<number> {
		return new Promise((resolve) => {
			const img = new Image();
			img.crossOrigin = "Anonymous";

			img.onload = () => {
				resolve(this.calculateBrightnessFromElement(img));
			};

			img.onerror = () => {
				console.warn('Error loading image for brightness calculation:', imageUrl);
				resolve(0.5); // Default to middle brightness on error
			};

			img.src = imageUrl;
		});
	}

	/**
	 * Calculates brightness from an already-loaded image element.
	 */
	private static calculateBrightnessFromElement(img: HTMLImageElement): number {
		try {
			const canvas = document.createElement('canvas');
			const ctx = canvas.getContext('2d');
			if(!ctx) {
				return 0.5; // Default to middle brightness on error
			}

			// Scale down for performance - we don't need full resolution for brightness
			const maxSize = 100;
			const scale = Math.min(maxSize / img.naturalWidth, maxSize / img.naturalHeight, 1);
			canvas.width = img.naturalWidth * scale;
			canvas.height = img.naturalHeight * scale;

			ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

			const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
			const data = imageData.data;
			let totalBrightness = 0;
			const pixelCount = data.length / 4;

			for(let i = 0; i < data.length; i += 4) {
				// Perceived brightness formula (ITU-R BT.709)
				const brightness = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]);
				totalBrightness += brightness;
			}

			return totalBrightness / pixelCount / 255; // Normalize to 0-1 range
		} catch(e) {
			console.warn('Error calculating image brightness:', e);
			return 0.5; // Default to middle brightness on error
		}
	}

	/**
	 * Determines if text should be white or black based on background brightness.
	 * @param brightness The brightness value (0-1)
	 * @returns 'white' for dark backgrounds, 'black' for light backgrounds
	 */
	public static getContrastingTextColor(brightness: number): string {
		return brightness > 0.5 ? 'black' : 'white';
	}
}
