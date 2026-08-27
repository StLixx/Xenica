class Canvas2DRenderer {
    constructor() {
        this.name = "Canvas2D";
        this.ctx = null;
        this.canvas = null;
    }
    async init(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");
    }
    render(curves) {
        if (!this.ctx || !this.canvas)
            return;
        this.ctx.fillStyle = "#000000";
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        const batches = new Map();
        for (const curve of curves) {
            const key = `${curve.color}-${curve.lineWidth}`;
            if (!batches.has(key)) {
                batches.set(key, []);
            }
            batches.get(key).push(curve);
        }
        for (const [key, batchCurves] of batches) {
            const first = batchCurves[0];
            this.ctx.strokeStyle = first.color;
            this.ctx.lineWidth = first.lineWidth;
            this.ctx.beginPath();
            for (const curve of batchCurves) {
                this.ctx.moveTo(curve.startX, curve.startY);
                this.ctx.bezierCurveTo(curve.cp1X, curve.cp1Y, curve.cp2X, curve.cp2Y, curve.endX, curve.endY);
            }
            this.ctx.stroke();
        }
    }
    destroy() {
        this.ctx = null;
        this.canvas = null;
    }
}
class GraphicsBenchmark {
    constructor() {
        this.renderers = new Map();
        this.currentRenderer = null;
        this.curves = [];
        this.animationId = 0;
        this.isRunning = false;
        this.frameCount = 0;
        this.lastFpsUpdate = 0;
        this.currentFps = 0;
        this.fpsElement = null;
        this.infoElement = null;
        this.canvasWidth = 0;
        this.canvasHeight = 0;
        this.renderers.set("canvas2d", new Canvas2DRenderer());
    }
    getAvailableRenderers() {
        return Array.from(this.renderers.keys());
    }
    async initialize(canvasId, rendererName, curveCount, fpsElementId, infoElementId) {
        this.stop();
        const canvas = document.getElementById(canvasId);
        if (!canvas) {
            console.error("Canvas not found:", canvasId);
            return false;
        }
        this.fpsElement = document.getElementById(fpsElementId);
        this.infoElement = document.getElementById(infoElementId);
        const container = canvas.parentElement;
        if (container) {
            canvas.width = container.clientWidth;
            canvas.height = container.clientHeight;
        }
        this.canvasWidth = canvas.width;
        this.canvasHeight = canvas.height;
        if (this.currentRenderer) {
            this.currentRenderer.destroy();
        }
        const renderer = this.renderers.get(rendererName.toLowerCase());
        if (!renderer) {
            console.error("Renderer not found:", rendererName);
            return false;
        }
        try {
            await renderer.init(canvas);
            this.currentRenderer = renderer;
            if (this.infoElement) {
                let info = renderer.name;
                if ('getRendererType' in renderer && typeof renderer.getRendererType === 'function') {
                    info += ` - ${renderer.getRendererType()}`;
                }
                this.infoElement.textContent = info;
            }
        }
        catch (e) {
            console.error("Failed to initialize renderer:", e);
            return false;
        }
        this.generateCurves(curveCount);
        return true;
    }
    generateCurves(count) {
        this.curves = [];
        const minLength = Math.min(this.canvasWidth, this.canvasHeight) * 0.25;
        const maxLength = Math.min(this.canvasWidth, this.canvasHeight) * 0.50;
        for (let i = 0; i < count; i++) {
            const rand = Math.random();
            let color;
            let lineWidth;
            if (rand < 0.8) {
                color = "#3399ff";
                lineWidth = 1;
            }
            else if (rand < 0.9) {
                color = "#ff3333";
                lineWidth = 1;
            }
            else {
                color = "#9933ff";
                lineWidth = 2;
            }
            const length = minLength + Math.random() * (maxLength - minLength);
            const angle = Math.random() * Math.PI * 2;
            const startX = Math.random() * this.canvasWidth;
            const startY = Math.random() * this.canvasHeight;
            const endX = startX + Math.cos(angle) * length;
            const endY = startY + Math.sin(angle) * length;
            const midX = (startX + endX) / 2;
            const midY = (startY + endY) / 2;
            const perpAngle = angle + Math.PI / 2;
            const curveAmount = (Math.random() - 0.5) * length * 0.5;
            const cp1X = midX + Math.cos(perpAngle) * curveAmount * 0.5 + (Math.random() - 0.5) * length * 0.3;
            const cp1Y = midY + Math.sin(perpAngle) * curveAmount * 0.5 + (Math.random() - 0.5) * length * 0.3;
            const cp2X = midX + Math.cos(perpAngle) * curveAmount * 0.5 + (Math.random() - 0.5) * length * 0.3;
            const cp2Y = midY + Math.sin(perpAngle) * curveAmount * 0.5 + (Math.random() - 0.5) * length * 0.3;
            this.curves.push({
                startX, startY,
                cp1X, cp1Y,
                cp2X, cp2Y,
                endX, endY,
                color,
                lineWidth
            });
        }
    }
    start() {
        if (this.isRunning || !this.currentRenderer)
            return;
        this.isRunning = true;
        this.frameCount = 0;
        this.lastFpsUpdate = performance.now();
        this.currentFps = 0;
        const animate = (timestamp) => {
            if (!this.isRunning)
                return;
            this.animateCurves();
            this.currentRenderer.render(this.curves);
            this.frameCount++;
            const elapsed = timestamp - this.lastFpsUpdate;
            if (elapsed >= 1000) {
                this.currentFps = Math.round((this.frameCount * 1000) / elapsed);
                this.frameCount = 0;
                this.lastFpsUpdate = timestamp;
                if (this.fpsElement) {
                    this.fpsElement.textContent = `FPS: ${this.currentFps}`;
                }
            }
            this.animationId = requestAnimationFrame(animate);
        };
        this.animationId = requestAnimationFrame(animate);
    }
    animateCurves() {
        const time = performance.now() * 0.001;
        for (let i = 0; i < this.curves.length; i++) {
            const curve = this.curves[i];
            const offset = i * 0.1;
            const wiggle = Math.sin(time * 2 + offset) * 5;
            curve.cp1X += Math.sin(time + offset) * 0.5;
            curve.cp1Y += Math.cos(time + offset) * 0.5;
            curve.cp2X += Math.cos(time * 1.5 + offset) * 0.5;
            curve.cp2Y += Math.sin(time * 1.5 + offset) * 0.5;
        }
    }
    stop() {
        this.isRunning = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = 0;
        }
    }
    getCurrentFps() {
        return this.currentFps;
    }
    destroy() {
        this.stop();
        if (this.currentRenderer) {
            this.currentRenderer.destroy();
            this.currentRenderer = null;
        }
        this.curves = [];
        this.fpsElement = null;
        this.infoElement = null;
    }
}
const graphicsBenchmark = new GraphicsBenchmark();
export { graphicsBenchmark };
//# sourceMappingURL=graphicsBenchmark.js.map