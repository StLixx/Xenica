import { Canvas2DApplication } from "./plex/canvas2DGraphics.js";
class BrainThemePreviewInstance {
    constructor(elementId, thoughtId) {
        this.app = null;
        this.appTop = null;
        this.element = null;
        this.thtElement = null;
        this.colors = {};
        this.straightLinks = false;
        this.elementId = elementId;
        this.thoughtId = thoughtId;
    }
    async init(colors, straightLinks) {
        this.setSettings(colors, straightLinks);
        this.element = document.getElementById(this.elementId);
        let attempts = 0;
        while (this.element == null && attempts < 50) {
            await new Promise(resolve => setTimeout(resolve, 100));
            this.element = document.getElementById(this.elementId);
            attempts++;
        }
        if (this.element == null) {
            return;
        }
        this.thtElement = document.getElementById(this.thoughtId);
        await this.start();
    }
    offsetRect(rect, offsetX, offsetY) {
        return {
            x: 0, y: 0, toJSON() {
            },
            left: rect.left + offsetX,
            top: rect.top + offsetY,
            right: rect.right + offsetX,
            bottom: rect.bottom + offsetY,
            width: rect.width,
            height: rect.height
        };
    }
    async start() {
        if (this.element == null) {
            return;
        }
        this.app = new Canvas2DApplication();
        await this.app.init({ resizeTo: this.element, backgroundAlpha: 0, autoDensity: true });
        this.element.prepend(this.app.canvas);
        let g = this.app.graphics;
        this.app.canvas.style.position = "absolute";
        this.app.canvas.style.zIndex = "0";
        this.appTop = new Canvas2DApplication();
        await this.appTop.init({ resizeTo: this.element, backgroundAlpha: 0, autoDensity: true });
        this.element.append(this.appTop.canvas);
        this.appTop.canvas.style.pointerEvents = "none";
        let gTop = this.appTop.graphics;
        this.appTop.canvas.style.position = "absolute";
        this.appTop.canvas.style.zIndex = "0";
        let pointerX = 0;
        let pointerY = 0;
        this.app.canvas.onpointermove = (event) => {
            pointerX = event.offsetX;
            pointerY = event.offsetY;
        };
        this.app.ticker.add((info) => {
            var _a, _b;
            if (this.element.clientWidth == 0) {
                this.cleanUp();
                return;
            }
            if (this.colors.length == 0) {
                return;
            }
            g.clear();
            gTop.clear();
            let thtRect = this.thtElement.getBoundingClientRect();
            let mainRect = this.element.getBoundingClientRect();
            let xCen = thtRect.left - mainRect.left + thtRect.width / 2;
            let yCen = thtRect.top - mainRect.top + thtRect.height / 2;
            let bottom = thtRect.bottom - mainRect.top;
            let top = thtRect.top - mainRect.top;
            let left = thtRect.left - mainRect.left - 2;
            let childZoneY = mainRect.height * 0.75;
            const gateOffset = 7;
            const rowHeight = 20;
            const colWidth = mainRect.width * 1.5;
            const gateSize = 3.5;
            g.circle(xCen, yCen, rowHeight * 1.1)
                .stroke({ width: 1.5, color: this.colors.thoughtActiveResizeCircle, alpha: 0.5 });
            let isHovered = this.thtElement.matches(':hover');
            for (let col = -0.5; col <= 0.5; col += 1) {
                for (let row = 0; row <= 3; row++) {
                    g.moveTo(xCen + gateOffset, bottom);
                    if (!this.straightLinks) {
                        const yDist = childZoneY + row * rowHeight - bottom;
                        const bezierOffset = yDist * 0.7;
                        g.bezierCurveTo(xCen + gateOffset, bottom + bezierOffset, xCen + col * colWidth, childZoneY + row * rowHeight - bezierOffset, xCen + col * colWidth, childZoneY + row * rowHeight);
                    }
                    else {
                        g.lineTo(xCen + col * colWidth, childZoneY + row * rowHeight);
                    }
                    let previewLinkWidth = ((_a = this.colors.linkThickness) !== null && _a !== void 0 ? _a : 150) / 100;
                    let previewLinkOpacity = ((_b = this.colors.linkOpacity) !== null && _b !== void 0 ? _b : 60) / 100;
                    g.stroke({ width: previewLinkWidth, color: isHovered ? this.colors.linkHighlighted : this.colors.linkNormal, alpha: previewLinkOpacity });
                }
            }
            gTop.circle(xCen + gateOffset, bottom, gateSize)
                .fill({ color: this.colors.gateNormal });
            gTop.circle(xCen - gateOffset, top, gateSize)
                .stroke({ width: 1, color: this.colors.gateNormal });
            gTop.circle(left, yCen, gateSize)
                .fill({ color: this.colors.gateHighlighted });
            const scrollbarSize = 18 * 0.5;
            const padding = 4;
            let visRect = new DOMRect(padding, mainRect.height - scrollbarSize - padding, mainRect.width - padding * 2, scrollbarSize);
            let thumbRect = new DOMRect(padding, mainRect.height - scrollbarSize - padding, mainRect.width / 2 - padding * 2, scrollbarSize);
            let isScrollHovered = this.element.matches(':hover') && pointerY > visRect.top;
            let scrollColor = isScrollHovered ? this.colors.gateHighlighted : this.colors.scrollBarOutline;
            g.roundRect(visRect.x, visRect.y, visRect.width, visRect.height, 9999)
                .stroke({ width: 1.5, color: scrollColor });
            g.roundRect(thumbRect.x, thumbRect.y, thumbRect.width, thumbRect.height, 9999)
                .fill({ color: scrollColor, alpha: 0.5 });
        });
    }
    setSettings(colors, straightLinks) {
        this.colors = colors;
        this.straightLinks = straightLinks;
    }
    cleanUp() {
        if (this.app) {
            this.element.removeChild(this.app.canvas);
            this.app.destroy();
            this.app = null;
            this.element.removeChild(this.appTop.canvas);
            this.appTop.destroy();
            this.appTop = null;
        }
    }
}
class BrainThemePreviewManager {
    constructor() {
        this.instances = new Map();
    }
    async init(elementId, thoughtId, colors, straightLinks) {
        this.dispose(elementId);
        const instance = new BrainThemePreviewInstance(elementId, thoughtId);
        this.instances.set(elementId, instance);
        await instance.init(colors, straightLinks);
    }
    setSettings(elementId, colors, straightLinks) {
        const instance = this.instances.get(elementId);
        if (instance) {
            instance.setSettings(colors, straightLinks);
        }
    }
    dispose(elementId) {
        const instance = this.instances.get(elementId);
        if (instance) {
            instance.cleanUp();
            this.instances.delete(elementId);
        }
    }
    async copyImageToClipboard(imageUrl) {
        try {
            const response = await fetch(imageUrl);
            if (!response.ok)
                return false;
            const blob = await response.blob();
            let pngBlob = blob;
            if (blob.type !== 'image/png') {
                const img = document.createElement('img');
                img.crossOrigin = 'anonymous';
                const loadPromise = new Promise((resolve, reject) => {
                    img.onload = () => resolve(img);
                    img.onerror = reject;
                });
                img.src = imageUrl;
                await loadPromise;
                const canvas = document.createElement('canvas');
                canvas.width = img.naturalWidth;
                canvas.height = img.naturalHeight;
                const ctx = canvas.getContext('2d');
                if (!ctx)
                    return false;
                ctx.drawImage(img, 0, 0);
                pngBlob = await new Promise((resolve, reject) => {
                    canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/png');
                });
            }
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
            return true;
        }
        catch (_a) {
            return false;
        }
    }
}
export const brainThemePreview = new BrainThemePreviewManager();
//# sourceMappingURL=brainThemePreview.js.map