/**
 * Canvas2DGraphics - A PIXI.Graphics-compatible wrapper for Canvas 2D API
 * Provides method chaining similar to PIXI.Graphics to minimize migration effort.
 */

interface StrokeStyle {
    width?: number;
    color?: number;
    alpha?: number;
}

interface FillStyle {
    color?: number;
    alpha?: number;
}

export class Canvas2DGraphics {
    private ctx: CanvasRenderingContext2D;
    private canvas: HTMLCanvasElement;
    private currentStroke: StrokeStyle | null = null;
    private currentFill: FillStyle | null = null;
    private pathStarted: boolean = false;

    // For SVG transform operations
    private transformStack: DOMMatrix[] = [];

    // Pre-parsed SVG paths cache
    private svgPathCache: Map<string, Path2D> = new Map();

    // Current Path2D for SVG operations
    private currentPath2D: Path2D | null = null;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        const ctx = canvas.getContext('2d');
        if(!ctx) {
            throw new Error('Failed to get 2d context');
        }
        this.ctx = ctx;
    }

    get context(): CanvasRenderingContext2D {
        return this.ctx;
    }

    /**
     * Clear the entire canvas
     */
    clear(): this {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.pathStarted = false;
        return this;
    }

    /**
     * Set stroke style for subsequent strokes (PIXI pattern)
     */
    setStrokeStyle(style: StrokeStyle): this {
        this.currentStroke = style;
        return this;
    }

    /**
     * Begin a new path or continue current path
     */
    private ensurePath(): void {
        if(!this.pathStarted) {
            this.ctx.beginPath();
            this.pathStarted = true;
        }
    }

    /**
     * Move to a point
     */
    moveTo(x: number, y: number): this {
        this.ensurePath();
        this.ctx.moveTo(x, y);
        return this;
    }

    /**
     * Draw a line to a point
     */
    lineTo(x: number, y: number): this {
        this.ensurePath();
        this.ctx.lineTo(x, y);
        return this;
    }

    /**
     * Draw a cubic bezier curve
     */
    bezierCurveTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number): this {
        this.ensurePath();
        this.ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y);
        return this;
    }

    /**
     * Draw a circle
     */
    circle(x: number, y: number, radius: number): this {
        this.ensurePath();
        this.ctx.moveTo(x + radius, y);
        this.ctx.arc(x, y, radius, 0, Math.PI * 2);
        return this;
    }

    /**
     * Draw a rounded rectangle
     */
    roundRect(x: number, y: number, width: number, height: number, radius: number): this {
        this.ensurePath();
        // Use native roundRect if available, otherwise fallback
        if(this.ctx.roundRect) {
            this.ctx.roundRect(x, y, width, height, radius);
        } else {
            // Fallback for older browsers
            this.drawRoundRectPath(x, y, width, height, radius);
        }
        return this;
    }

    private drawRoundRectPath(x: number, y: number, w: number, h: number, r: number): void {
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

    /**
     * Apply stroke to current path
     * Can be called with style object or uses previously set style
     */
    stroke(style?: StrokeStyle): this {
        const s = style || this.currentStroke;
        if(s) {
            this.ctx.strokeStyle = this.colorToString(s.color ?? 0x000000, s.alpha ?? 1);
            this.ctx.lineWidth = s.width ?? 1;
        }
        if(this.currentPath2D) {
            this.ctx.stroke(this.currentPath2D);
            this.currentPath2D = null;
        } else {
            this.ctx.stroke();
        }
        this.pathStarted = false;
        return this;
    }

    /**
     * Fill current path
     * Can be called with color directly or style object
     */
    fill(style?: FillStyle | number): this {
        if(typeof style === 'number') {
            this.ctx.fillStyle = this.colorToString(style, 1);
        } else if(style) {
            this.ctx.fillStyle = this.colorToString(style.color ?? 0x000000, style.alpha ?? 1);
        }
        if(this.currentPath2D) {
            this.ctx.fill(this.currentPath2D);
            this.currentPath2D = null;
        } else {
            this.ctx.fill();
        }
        this.pathStarted = false;
        return this;
    }

    /**
     * Apply scale transformation
     */
    scaleTransform(scale: number): this {
        this.ctx.scale(scale, scale);
        return this;
    }

    /**
     * Apply translation transformation
     */
    translateTransform(x: number, y: number): this {
        this.ctx.translate(x, y);
        return this;
    }

    /**
     * Apply rotation transformation
     */
    rotateTransform(angleRadians: number): this {
        this.ctx.rotate(angleRadians);
        return this;
    }

    /**
     * Reset all transformations
     */
    resetTransform(): this {
        this.ctx.resetTransform();
        // Re-apply device pixel ratio scaling
        const dpr = window.devicePixelRatio || 1;
        this.ctx.scale(dpr, dpr);
        return this;
    }

    /**
     * Draw an SVG path - accepts either a path data string (d attribute) or full SVG markup
     */
    svg(svgOrPath: string): this {
        let pathData = svgOrPath;

        // If it's a full SVG element, extract the path d attribute
        if(svgOrPath.includes('<svg')) {
            const match = svgOrPath.match(/\bd="([^"]*)"/);
            if(match) {
                pathData = match[1];
            } else {
                return this; // No path found
            }
        }

        let path2d = this.svgPathCache.get(pathData);
        if(!path2d) {
            path2d = new Path2D(pathData);
            this.svgPathCache.set(pathData, path2d);
        }

        // Store the path for subsequent fill/stroke calls
        this.currentPath2D = path2d;
        return this;
    }

    /**
     * Convert numeric color to CSS string
     */
    private colorToString(color: number, alpha: number): string {
        const r = (color >> 16) & 0xFF;
        const g = (color >> 8) & 0xFF;
        const b = color & 0xFF;
        return `rgba(${r},${g},${b},${alpha})`;
    }
}

/**
 * Canvas2DApplication - A PIXI.Application-compatible wrapper
 * Manages canvas creation, sizing, and animation loop
 */

interface ApplicationOptions {
    width?: number;
    height?: number;
    backgroundAlpha?: number;
    backgroundColor?: number;
    autoDensity?: boolean;
    resizeTo?: HTMLElement;
}

interface TickerCallback {
    (info: { deltaTime: number }): void;
}

class Ticker {
    private callbacks: Set<TickerCallback> = new Set();
    private animationId: number = 0;
    private lastTime: number = 0;
    private _maxFPS: number = 60;
    private running: boolean = false;

    get maxFPS(): number {
        return this._maxFPS;
    }

    set maxFPS(value: number) {
        this._maxFPS = value;
    }

    add(callback: TickerCallback): void {
        this.callbacks.add(callback);
        if(!this.running && this.callbacks.size > 0) {
            this.start();
        }
    }

    remove(callback: TickerCallback): void {
        this.callbacks.delete(callback);
        if(this.callbacks.size === 0) {
            this.stop();
        }
    }

    start(): void {
        if(this.running) return;
        this.running = true;
        this.lastTime = performance.now();
        this.tick();
    }

    stop(): void {
        this.running = false;
        if(this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = 0;
        }
    }

    private tick = (): void => {
        if(!this.running) return;

        const now = performance.now();
        const elapsed = now - this.lastTime;
        const minFrameTime = 1000 / this._maxFPS;

        if(elapsed >= minFrameTime) {
            // deltaTime in PIXI is 1 = 1/60th of a second
            const deltaTime = elapsed / (1000 / 60);

            for(const callback of this.callbacks) {
                callback({ deltaTime });
            }

            this.lastTime = now;
        }

        this.animationId = requestAnimationFrame(this.tick);
    }
}

export class Canvas2DApplication {
    canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private _graphics: Canvas2DGraphics | null = null;
    private options: ApplicationOptions = {};
    private resizeObserver: ResizeObserver | null = null;

    ticker: Ticker = new Ticker();
    stage: { addChild: (g: Canvas2DGraphics) => void } = {
        addChild: () => {} // No-op, graphics draws directly
    };
    renderer: {
        resize: (width: number, height: number) => void;
        clear: () => void;
        width: number;
        height: number;
    };

    constructor() {
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d')!;

        const self = this;
        this.renderer = {
            resize: (width: number, height: number) => this.resize(width, height),
            clear: () => this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height),
            get width() { return self.canvas.width / (self.options.autoDensity ? (window.devicePixelRatio || 1) : 1); },
            get height() { return self.canvas.height / (self.options.autoDensity ? (window.devicePixelRatio || 1) : 1); }
        };
    }

    async init(options: ApplicationOptions): Promise<void> {
        this.options = options;

        const dpr = window.devicePixelRatio || 1;
        const width = options.width || 800;
        const height = options.height || 600;

        if(options.autoDensity) {
            this.canvas.width = width * dpr;
            this.canvas.height = height * dpr;
            this.canvas.style.width = width + 'px';
            this.canvas.style.height = height + 'px';
            this.ctx.scale(dpr, dpr);
        } else {
            this.canvas.width = width;
            this.canvas.height = height;
        }

        // Handle resizeTo option
        if(options.resizeTo) {
            this.resizeObserver = new ResizeObserver(() => {
                if(options.resizeTo) {
                    this.resize(options.resizeTo.clientWidth, options.resizeTo.clientHeight);
                }
            });
            this.resizeObserver.observe(options.resizeTo);
            this.resize(options.resizeTo.clientWidth, options.resizeTo.clientHeight);
        }

        this._graphics = new Canvas2DGraphics(this.canvas);
    }

    resize(width: number, height: number): void {
        const dpr = this.options.autoDensity ? (window.devicePixelRatio || 1) : 1;

        this.canvas.width = width * dpr;
        this.canvas.height = height * dpr;
        this.canvas.style.width = width + 'px';
        this.canvas.style.height = height + 'px';

        if(this.options.autoDensity) {
            this.ctx.scale(dpr, dpr);
        }
    }

    get view(): HTMLCanvasElement {
        return this.canvas;
    }

    get graphics(): Canvas2DGraphics {
        if(!this._graphics) {
            this._graphics = new Canvas2DGraphics(this.canvas);
        }
        return this._graphics;
    }

    destroy(removeView: boolean = true, options?: { children?: boolean; texture?: boolean; baseTexture?: boolean }): void {
        this.ticker.stop();

        if(this.resizeObserver) {
            this.resizeObserver.disconnect();
            this.resizeObserver = null;
        }

        if(removeView && this.canvas.parentElement) {
            this.canvas.parentElement.removeChild(this.canvas);
        }
    }
}
