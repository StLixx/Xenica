export class ImageBrightness {
    static async getAverageBrightness(imageUrl) {
        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = "Anonymous";
            img.onload = () => {
                resolve(this.calculateBrightnessFromElement(img));
            };
            img.onerror = () => {
                console.warn('Error loading image for brightness calculation:', imageUrl);
                resolve(0.5);
            };
            img.src = imageUrl;
        });
    }
    static calculateBrightnessFromElement(img) {
        try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                return 0.5;
            }
            const maxSize = 100;
            const scale = Math.min(maxSize / img.naturalWidth, maxSize / img.naturalHeight, 1);
            canvas.width = img.naturalWidth * scale;
            canvas.height = img.naturalHeight * scale;
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;
            let totalBrightness = 0;
            const pixelCount = data.length / 4;
            for (let i = 0; i < data.length; i += 4) {
                const brightness = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]);
                totalBrightness += brightness;
            }
            return totalBrightness / pixelCount / 255;
        }
        catch (e) {
            console.warn('Error calculating image brightness:', e);
            return 0.5;
        }
    }
    static getContrastingTextColor(brightness) {
        return brightness > 0.5 ? 'black' : 'white';
    }
}
//# sourceMappingURL=imageBrightness.js.map