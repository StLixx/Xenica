// Graphics Benchmark Framework
// Extensible architecture for benchmarking different rendering approaches

interface BezierCurve {
    startX: number;
    startY: number;
    cp1X: number;
    cp1Y: number;
    cp2X: number;
    cp2Y: number;
    endX: number;
    endY: number;
    color: string;
    lineWidth: number;
}

interface BenchmarkRenderer {
    name: string;
    init(canvas: HTMLCanvasElement): Promise<void>;
    render(curves: BezierCurve[]): void;
    destroy(): void;
}

// Canvas2D Renderer
class Canvas2DRenderer implements BenchmarkRenderer {
    name = "Canvas2D";
    private ctx: CanvasRenderingContext2D | null = null;
    private canvas: HTMLCanvasElement | null = null;

    async init(canvas: HTMLCanvasElement): Promise<void> {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d")!;
    }

    render(curves: BezierCurve[]): void {
        if(!this.ctx || !this.canvas) return;

        this.ctx.fillStyle = "#000000";
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Batch by style (color + lineWidth)
        const batches = new Map<string, BezierCurve[]>();
        for(const curve of curves) {
            const key = `${curve.color}-${curve.lineWidth}`;
            if(!batches.has(key)) {
                batches.set(key, []);
            }
            batches.get(key)!.push(curve);
        }

        for(const [key, batchCurves] of batches) {
            const first = batchCurves[0];
            this.ctx.strokeStyle = first.color;
            this.ctx.lineWidth = first.lineWidth;
            this.ctx.beginPath();

            for(const curve of batchCurves) {
                this.ctx.moveTo(curve.startX, curve.startY);
                this.ctx.bezierCurveTo(
                    curve.cp1X, curve.cp1Y,
                    curve.cp2X, curve.cp2Y,
                    curve.endX, curve.endY
                );
            }

            this.ctx.stroke();
        }
    }

    destroy(): void {
        this.ctx = null;
        this.canvas = null;
    }
}

// Benchmark Controller
class GraphicsBenchmark {
    private renderers: Map<string, BenchmarkRenderer> = new Map();
    private currentRenderer: BenchmarkRenderer | null = null;
    private curves: BezierCurve[] = [];
    private animationId: number = 0;
    private isRunning: boolean = false;
    private frameCount: number = 0;
    private lastFpsUpdate: number = 0;
    private currentFps: number = 0;
    private fpsElement: HTMLElement | null = null;
    private infoElement: HTMLElement | null = null;
    private canvasWidth: number = 0;
    private canvasHeight: number = 0;

    constructor() {
        this.renderers.set("canvas2d", new Canvas2DRenderer());
    }

    getAvailableRenderers(): string[] {
        return Array.from(this.renderers.keys());
    }

    async initialize(
        canvasId: string,
        rendererName: string,
        curveCount: number,
        fpsElementId: string,
        infoElementId: string
    ): Promise<boolean> {
        this.stop();

        const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
        if(!canvas) {
            console.error("Canvas not found:", canvasId);
            return false;
        }

        // Get display elements
        this.fpsElement = document.getElementById(fpsElementId);
        this.infoElement = document.getElementById(infoElementId);

        // Size canvas to container
        const container = canvas.parentElement;
        if(container) {
            canvas.width = container.clientWidth;
            canvas.height = container.clientHeight;
        }

        this.canvasWidth = canvas.width;
        this.canvasHeight = canvas.height;

        // Cleanup previous renderer
        if(this.currentRenderer) {
            this.currentRenderer.destroy();
        }

        // Get and initialize renderer
        const renderer = this.renderers.get(rendererName.toLowerCase());
        if(!renderer) {
            console.error("Renderer not found:", rendererName);
            return false;
        }

        try {
            await renderer.init(canvas);
            this.currentRenderer = renderer;

            // Update info display with renderer details
            if(this.infoElement) {
                let info = renderer.name;
                // Check if renderer has getRendererType method (PixiJS)
                if('getRendererType' in renderer && typeof (renderer as any).getRendererType === 'function') {
                    info += ` - ${(renderer as any).getRendererType()}`;
                }
                this.infoElement.textContent = info;
            }
        } catch(e) {
            console.error("Failed to initialize renderer:", e);
            return false;
        }

        // Generate curves
        this.generateCurves(curveCount);

        return true;
    }

    private generateCurves(count: number): void {
        this.curves = [];
        const minLength = Math.min(this.canvasWidth, this.canvasHeight) * 0.25;
        const maxLength = Math.min(this.canvasWidth, this.canvasHeight) * 0.50;

        for(let i = 0; i < count; i++) {
            // Determine color and line width based on distribution
            // 80% blue 1px, 10% red 1px, 10% purple 2px
            const rand = Math.random();
            let color: string;
            let lineWidth: number;

            if(rand < 0.8) {
                color = "#3399ff";  // Blue
                lineWidth = 1;
            } else if(rand < 0.9) {
                color = "#ff3333";  // Red
                lineWidth = 1;
            } else {
                color = "#9933ff";  // Purple
                lineWidth = 2;
            }

            // Generate curve with random length between 25-50% of screen
            const length = minLength + Math.random() * (maxLength - minLength);
            const angle = Math.random() * Math.PI * 2;

            // Random start position
            const startX = Math.random() * this.canvasWidth;
            const startY = Math.random() * this.canvasHeight;

            // End position based on length and angle
            const endX = startX + Math.cos(angle) * length;
            const endY = startY + Math.sin(angle) * length;

            // Control points for bezier - add some curve variation
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

    start(): void {
        if(this.isRunning || !this.currentRenderer) return;

        this.isRunning = true;
        this.frameCount = 0;
        this.lastFpsUpdate = performance.now();
        this.currentFps = 0;

        const animate = (timestamp: number) => {
            if(!this.isRunning) return;

            // Animate curves slightly
            this.animateCurves();

            // Render
            this.currentRenderer!.render(this.curves);

            // Calculate FPS
            this.frameCount++;
            const elapsed = timestamp - this.lastFpsUpdate;
            if(elapsed >= 1000) {
                this.currentFps = Math.round((this.frameCount * 1000) / elapsed);
                this.frameCount = 0;
                this.lastFpsUpdate = timestamp;

                // Update FPS display directly in DOM
                if(this.fpsElement) {
                    this.fpsElement.textContent = `FPS: ${this.currentFps}`;
                }
            }

            this.animationId = requestAnimationFrame(animate);
        };

        this.animationId = requestAnimationFrame(animate);
    }

    private animateCurves(): void {
        const time = performance.now() * 0.001;

        for(let i = 0; i < this.curves.length; i++) {
            const curve = this.curves[i];
            const offset = i * 0.1;

            // Subtle animation of control points
            const wiggle = Math.sin(time * 2 + offset) * 5;
            curve.cp1X += Math.sin(time + offset) * 0.5;
            curve.cp1Y += Math.cos(time + offset) * 0.5;
            curve.cp2X += Math.cos(time * 1.5 + offset) * 0.5;
            curve.cp2Y += Math.sin(time * 1.5 + offset) * 0.5;
        }
    }

    stop(): void {
        this.isRunning = false;
        if(this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = 0;
        }
    }

    getCurrentFps(): number {
        return this.currentFps;
    }

    destroy(): void {
        this.stop();
        if(this.currentRenderer) {
            this.currentRenderer.destroy();
            this.currentRenderer = null;
        }
        this.curves = [];
        this.fpsElement = null;
        this.infoElement = null;
    }
}

// Singleton instance for JS interop
const graphicsBenchmark = new GraphicsBenchmark();

export { graphicsBenchmark };
