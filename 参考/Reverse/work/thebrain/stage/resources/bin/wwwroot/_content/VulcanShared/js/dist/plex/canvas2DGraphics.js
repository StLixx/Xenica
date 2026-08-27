export class Canvas2DGraphics {
    constructor(canvas) {
        this.currentStroke = null;
        this.currentFill = null;
        this.pathStarted = false;
        this.transformStack = [];
        this.svgPathCache = new Map();
        this.currentPath2D = null;
        this.canvas = canvas;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            throw new Error('Failed to get 2d context');
        }
        this.ctx = ctx;
    }
    get context() {
        return this.ctx;
    }
    clear() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.pathStarted = false;
        return this;
    }
    setStrokeStyle(style) {
        this.currentStroke = style;
        return this;
    }
    ensurePath() {
        if (!this.pathStarted) {
            this.ctx.beginPath();
            this.pathStarted = true;
        }
    }
    moveTo(x, y) {
        this.ensurePath();
        this.ctx.moveTo(x, y);
        return this;
    }
    lineTo(x, y) {
        this.ensurePath();
        this.ctx.lineTo(x, y);
        return this;
    }
    bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y) {
        this.ensurePath();
        this.ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y);
        return this;
    }
    circle(x, y, radius) {
        this.ensurePath();
        this.ctx.moveTo(x + radius, y);
        this.ctx.arc(x, y, radius, 0, Math.PI * 2);
        return this;
    }
    roundRect(x, y, width, height, radius) {
        this.ensurePath();
        if (this.ctx.roundRect) {
            this.ctx.roundRect(x, y, width, height, radius);
        }
        else {
            this.drawRoundRectPath(x, y, width, height, radius);
        }
        return this;
    }
    drawRoundRectPath(x, y, w, h, r) {
        r = Math.min(r, w / 2, h / 2);
        this.ctx.moveTo(x + r, y);
        this.ctx.lineTo(x + w - r, y);
        this.ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        this.ctx.lineTo(x + w, y + h - r);
        this.ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        this.ctx.lineTo(x + r, y + h);
        this.ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        this.ctx.lineTo(x, y + r);
        this.ctx.quadraticCurveTo(x, y, x + r, y);
        this.ctx.closePath();
    }
    stroke(style) {
        var _a, _b, _c;
        const s = style || this.currentStroke;
        if (s) {
            this.ctx.strokeStyle = this.colorToString((_a = s.color) !== null && _a !== void 0 ? _a : 0x000000, (_b = s.alpha) !== null && _b !== void 0 ? _b : 1);
            this.ctx.lineWidth = (_c = s.width) !== null && _c !== void 0 ? _c : 1;
        }
        if (this.currentPath2D) {
            this.ctx.stroke(this.currentPath2D);
            this.currentPath2D = null;
        }
        else {
            this.ctx.stroke();
        }
        this.pathStarted = false;
        return this;
    }
    fill(style) {
        var _a, _b;
        if (typeof style === 'number') {
            this.ctx.fillStyle = this.colorToString(style, 1);
        }
        else if (style) {
            this.ctx.fillStyle = this.colorToString((_a = style.color) !== null && _a !== void 0 ? _a : 0x000000, (_b = style.alpha) !== null && _b !== void 0 ? _b : 1);
        }
        if (this.currentPath2D) {
            this.ctx.fill(this.currentPath2D);
            this.currentPath2D = null;
        }
        else {
            this.ctx.fill();
        }
        this.pathStarted = false;
        return this;
    }
    scaleTransform(scale) {
        this.ctx.scale(scale, scale);
        return this;
    }
    translateTransform(x, y) {
        this.ctx.translate(x, y);
        return this;
    }
    rotateTransform(angleRadians) {
        this.ctx.rotate(angleRadians);
        return this;
    }
    resetTransform() {
        this.ctx.resetTransform();
        const dpr = window.devicePixelRatio || 1;
        this.ctx.scale(dpr, dpr);
        return this;
    }
    svg(svgOrPath) {
        let pathData = svgOrPath;
        if (svgOrPath.includes('<svg')) {
            const match = svgOrPath.match(/\bd="([^"]*)"/);
            if (match) {
                pathData = match[1];
            }
            else {
                return this;
            }
        }
        let path2d = this.svgPathCache.get(pathData);
        if (!path2d) {
            path2d = new Path2D(pathData);
            this.svgPathCache.set(pathData, path2d);
        }
        this.currentPath2D = path2d;
        return this;
    }
    colorToString(color, alpha) {
        const r = (color >> 16) & 0xFF;
        const g = (color >> 8) & 0xFF;
        const b = color & 0xFF;
        return `rgba(${r},${g},${b},${alpha})`;
    }
}
class Ticker {
    constructor() {
        this.callbacks = new Set();
        this.animationId = 0;
        this.lastTime = 0;
        this._maxFPS = 60;
        this.running = false;
        this.tick = () => {
            if (!this.running)
                return;
            const now = performance.now();
            const elapsed = now - this.lastTime;
            const minFrameTime = 1000 / this._maxFPS;
            if (elapsed >= minFrameTime) {
                const deltaTime = elapsed / (1000 / 60);
                for (const callback of this.callbacks) {
                    callback({ deltaTime });
                }
                this.lastTime = now;
            }
            this.animationId = requestAnimationFrame(this.tick);
        };
    }
    get maxFPS() {
        return this._maxFPS;
    }
    set maxFPS(value) {
        this._maxFPS = value;
    }
    add(callback) {
        this.callbacks.add(callback);
        if (!this.running && this.callbacks.size > 0) {
            this.start();
        }
    }
    remove(callback) {
        this.callbacks.delete(callback);
        if (this.callbacks.size === 0) {
            this.stop();
        }
    }
    start() {
        if (this.running)
            return;
        this.running = true;
        this.lastTime = performance.now();
        this.tick();
    }
    stop() {
        this.running = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = 0;
        }
    }
}
export class Canvas2DApplication {
    constructor() {
        this._graphics = null;
        this.options = {};
        this.resizeObserver = null;
        this.ticker = new Ticker();
        this.stage = {
            addChild: () => { }
        };
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d');
        const self = this;
        this.renderer = {
            resize: (width, height) => this.resize(width, height),
            clear: () => this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height),
            get width() { return self.canvas.width / (self.options.autoDensity ? (window.devicePixelRatio || 1) : 1); },
            get height() { return self.canvas.height / (self.options.autoDensity ? (window.devicePixelRatio || 1) : 1); }
        };
    }
    async init(options) {
        this.options = options;
        const dpr = window.devicePixelRatio || 1;
        const width = options.width || 800;
        const height = options.height || 600;
        if (options.autoDensity) {
            this.canvas.width = width * dpr;
            this.canvas.height = height * dpr;
            this.canvas.style.width = width + 'px';
            this.canvas.style.height = height + 'px';
            this.ctx.scale(dpr, dpr);
        }
        else {
            this.canvas.width = width;
            this.canvas.height = height;
        }
        if (options.resizeTo) {
            this.resizeObserver = new ResizeObserver(() => {
                if (options.resizeTo) {
                    this.resize(options.resizeTo.clientWidth, options.resizeTo.clientHeight);
                }
            });
            this.resizeObserver.observe(options.resizeTo);
            this.resize(options.resizeTo.clientWidth, options.resizeTo.clientHeight);
        }
        this._graphics = new Canvas2DGraphics(this.canvas);
    }
    resize(width, height) {
        const dpr = this.options.autoDensity ? (window.devicePixelRatio || 1) : 1;
        this.canvas.width = width * dpr;
        this.canvas.height = height * dpr;
        this.canvas.style.width = width + 'px';
        this.canvas.style.height = height + 'px';
        if (this.options.autoDensity) {
            this.ctx.scale(dpr, dpr);
        }
    }
    get view() {
        return this.canvas;
    }
    get graphics() {
        if (!this._graphics) {
            this._graphics = new Canvas2DGraphics(this.canvas);
        }
        return this._graphics;
    }
    destroy(removeView = true, options) {
        this.ticker.stop();
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
            this.resizeObserver = null;
        }
        if (removeView && this.canvas.parentElement) {
            this.canvas.parentElement.removeChild(this.canvas);
        }
    }
}
//# sourceMappingURL=canvas2DGraphics.js.map