// @ts-ignore
import { Point, Rect, PI } from "/_content/Venus/js/dist/geometry.js"
import { Canvas2DApplication, Canvas2DGraphics } from "./canvas2DGraphics.js";

enum WaveType {
    Horizontal,
    Circle
}

let WAVE_COUNT = 3;
let WAVE_TYPE = WaveType.Horizontal;

let PACE = 0.00015;
let MAX_VEL = 2.5;
let CHANGE_TIME = 100;
let FRICTION = 0.99;
let MAX_HISTORY = 300;
let HISTORY_INTERVAL = 10;
let TRAIL_ALPHA = 0.03;
let X_DRIFT = 1;
let Y_DRIFT = -0.25;

// This is for debugging/development to see what the lead path animation is doing clearly
let FRONT_ALPHA = 0.0;
let FRONT_COLOR = 0xFFFFFF;

let TRAIL_BLUR = 2;
let MAIN_BLUR = 3;

let TRAIL_WIDTH = 10;

// "tech light" https://www.colourlovers.com/palette/15/tech_light
let TRAIL_COLOR_1 = 0xd1e751;
let TRAIL_COLOR_2 = 0x4dbce9;
let TRAIL_COLOR_3 = 0x26ade4;

// blues
// const TRAIL_COLOR_1 = 0x0000ff;
// const TRAIL_COLOR_2 = 0x0088ff;
// const TRAIL_COLOR_3 = 0x8800ff;

// red/purple/blue
// const TRAIL_COLOR_1 = 0xff0000;
// const TRAIL_COLOR_2 = 0xff0088;
// const TRAIL_COLOR_3 = 0x0000ff;

// yellow/red/orange
// const TRAIL_COLOR_1 = 0x888800;
// const TRAIL_COLOR_2 = 0xff0000;
// const TRAIL_COLOR_3 = 0xaa8800;

// cyan/blue
let TRAIL_COLOR_4 = 0x0000ff;
let TRAIL_COLOR_5 = 0x0088ff;

let colors = [ TRAIL_COLOR_1, TRAIL_COLOR_2, TRAIL_COLOR_3, TRAIL_COLOR_4, TRAIL_COLOR_5 ];

// settings for circle wave
let CIRCLE_SLICES = 4; // this only works when set to 4 for some reason - didn't troubleshoot
let CIRCLE_RADIUS = 100;
let CIRCLE_EXPAND = 0.5;
let SQUARENESS = 0.57;
let CIRCLE_DEFORM = 0.2; // lower number = less randomness
let CIRCLE_TRAIL_ROTATION = -0.003; // higher number results in a corkscrew effect
let CIRCLE_ROTATION = 0.0015; // everything rotates at this rate (both history and present)

// set these numbers high to make lines out of the history - this is cool combined with CIRCLE_EXPAND 0 and CIRCLE_DEFORM 0.9
let CIRCLE_X_DRIFT = 0;
let CIRCLE_Y_DRIFT = 0;

let FPS = 24;
let FADE_IN_DURATION = 0;

class AniPoint {

    x = 0;
    y = 0;
    dX = 0;
    dY = 0;
    vX = 0;
    vY = 0;
    minX = 0;
    maxX = 0;
    minY = 0;
    maxY = 0;

    // Ring buffer for history (O(1) instead of O(n) for shift)
    historyX: number[] = [];
    historyY: number[] = [];
    historyIndex = 0;   // Next write position
    historyCount = 0;   // Items in buffer (up to MAX_HISTORY)

    constructor(minX: number, minY: number, maxX: number, maxY: number) {
        this.setBounds(minX, minY, maxX, maxY);
        this.setCurrentCenter();
    }

    setBounds(minX: number, minY: number, maxX: number, maxY: number) {
        this.minX = minX;
        this.minY = minY;
        this.maxX = maxX;
        this.maxY = maxY;
        this.setDestination();
    }
    
    setCurrent(x: number, y: number) {
        this.x = x;
        this.y = y;
    }
    
    setCurrentCenter() {
        this.x = (this.minX + this.maxX) / 2;
        this.y = (this.minY + this.maxY) / 2;
    }
    
    setDestination() {
        this.dX = this.pickRandom(this.minX, this.maxX);
        this.dY = this.pickRandom(this.minY, this.maxY);
    }

    pickRandom(min: number, max: number) {
        return (max-min) * Math.random() + min;
    }

    tick(delta: number) {
        // Ring buffer write - O(1) instead of O(n) shift
        this.historyX[this.historyIndex] = this.x;
        this.historyY[this.historyIndex] = this.y;
        this.historyIndex = (this.historyIndex + 1) % MAX_HISTORY;
        if(this.historyCount < MAX_HISTORY) {
            this.historyCount++;
        }
        this.x += this.vX;
        this.y += this.vY;
        this.vX *= FRICTION;
        this.vY *= FRICTION;
        this.vX += (this.dX - this.x) * PACE;
        this.vY += (this.dY - this.y) * PACE;
        this.vX = Math.max(Math.min(MAX_VEL, this.vX), -MAX_VEL);
        this.vY = Math.max(Math.min(MAX_VEL, this.vY), -MAX_VEL);
    }

    getX(priorCount: number): number | null {
        if(priorCount == 0) {
            return this.x;
        }
        if(priorCount >= this.historyCount) {
            return null;
        }
        // Ring buffer read - calculate index going backwards from write position
        let index = (this.historyIndex - priorCount + MAX_HISTORY) % MAX_HISTORY;
        return this.historyX[index];
    }
    getY(priorCount: number): number | null {
        if(priorCount == 0) {
            return this.y;
        }
        if(priorCount >= this.historyCount) {
            return null;
        }
        // Ring buffer read - calculate index going backwards from write position
        let index = (this.historyIndex - priorCount + MAX_HISTORY) % MAX_HISTORY;
        return this.historyY[index];
    }

    clearHistory() {
        this.historyX = [];
        this.historyY = [];
        this.historyIndex = 0;
        this.historyCount = 0;
    }
}

interface Path {
    getPoints(priorCount: number): Point[] | null;
    getColor(): number;
    setColor(color: number): void;
    tick(delta: number): void;
    resizeTo(width: number, height: number) : void;
    clearHistory(): void;
}

interface Backlet {
    getPaths(): Path[];
}

class WavePath implements Path {
    p1: AniPoint = new AniPoint(0, 0, 0, 0);
    p2: AniPoint = new AniPoint(0, 0, 0, 0);
    p3: AniPoint = new AniPoint(0, 0, 0, 0);
    p4: AniPoint = new AniPoint(0, 0, 0, 0);
    
    color: number = 0;

    resetTime: number = 0;
    
    resizeTo(width: number, height: number) {
        let edgeAdjust = width * 0.1;
        this.p1.setBounds(-edgeAdjust, height*0.33, -edgeAdjust, height*0.66);
        this.p2.setBounds(width*0.33, 0, width*0.33, height);
        this.p3.setBounds(width*0.66, 0, width*0.66, height);
        this.p4.setBounds(width+edgeAdjust, height*0.33, width+edgeAdjust, height*0.66);
        let cx = width * 0.5;
        let cy = height * 0.5;
        this.p1.setCurrent(cx, cy);
        this.p2.setCurrent(cx, cy);
        this.p3.setCurrent(cx, cy);
        this.p4.setCurrent(cx, cy);
    }
    
    getPoints(priorCount: number): Point[] | null {
        if(this.p1.getX(priorCount) == null) {
            return null;
        }
        let points: Point[] = [];

        points.push(new Point(this.p1.getX(priorCount)! + Math.min(0, priorCount * X_DRIFT), this.p1.getY(priorCount)! + priorCount * Y_DRIFT));
        points.push(new Point(this.p2.getX(priorCount)! + priorCount * X_DRIFT, this.p2.getY(priorCount)! + priorCount * Y_DRIFT));
        points.push(new Point(this.p3.getX(priorCount)! + priorCount * X_DRIFT, this.p3.getY(priorCount)! + priorCount * Y_DRIFT));
        points.push(new Point(this.p4.getX(priorCount)! + Math.max(0, priorCount * X_DRIFT), this.p4.getY(priorCount)! + priorCount * Y_DRIFT));
        return points;
    }
    
    tick(delta: number) {
        this.p1.tick(delta);
        this.p2.tick(delta);
        this.p3.tick(delta);
        this.p4.tick(delta);
        this.resetTime += delta;
        if(this.resetTime > CHANGE_TIME) {
            this.resetTime = 0;
            this.p1.setDestination();
            this.p2.setDestination();
            this.p3.setDestination();
            this.p4.setDestination();
        }
    }
    
    getColor(): number {
        return this.color;
    }
    
    setColor(color: number) {
        this.color = color;
    }

    clearHistory() {
        this.p1.clearHistory();
        this.p2.clearHistory();
        this.p3.clearHistory();
        this.p4.clearHistory();
    }
}

class CircleWavePath implements Path {
    
    points: AniPoint[] = [];
    
    constructor() {
        // create 4 points per slice, to represent the bezier between the slice corners
        let radsPerSlice = (2 * Math.PI) / CIRCLE_SLICES;
        for(let num = 0; num < 4; num++) {
            let range = CIRCLE_DEFORM;
            let radStart = radsPerSlice * num;
            let radEnd = radsPerSlice * (num + 1);
            let x = Math.cos(radStart);
            let y = Math.sin(radStart);
            let p1 = new AniPoint(x-range, y-range, x+range, y+range);
            let dx = Math.cos(radStart + Math.PI / 2) * SQUARENESS;
            let dy = Math.sin(radStart + Math.PI / 2) * SQUARENESS;
            let p2 = new AniPoint(x+dx-range, y+dy-range, x+dx+range, y+dy+range);
            x = Math.cos(radEnd);
            y = Math.sin(radEnd);
            let p4 = new AniPoint(x-range, y-range, x+range, y+range);
            dx = Math.cos(radEnd - Math.PI / 2) * SQUARENESS;
            dy = Math.sin(radEnd - Math.PI / 2) * SQUARENESS;
            let p3 = new AniPoint(x+dx-range, y+dy-range, x+dx+range, y+dy+range);
            this.points.push(p1, p2, p3, p4);
        }
    }
    
    color: number = 0;

    resetTime: number = 0;
    totalTime = 0;
    
    width = 0;
    height = 0;

    resizeTo(width: number, height: number) {
        this.width = width;
        this.height = height;
    }

    getPoints(priorCount: number): Point[] | null {
        if(this.points[0].getX(priorCount) == null) {
            return null;
        }
        let points: Point[] = [];
        
        // loop twice - once for expanding and once for contracting circles
        for(let repeat = 0; repeat < 2; repeat++) {
            let radius;
            let angle = this.totalTime * CIRCLE_ROTATION;
            let xDrift;
            let yDrift;
            if(repeat == 0) {
                radius = CIRCLE_RADIUS + CIRCLE_EXPAND * priorCount;
                angle += CIRCLE_TRAIL_ROTATION * priorCount;
                xDrift = CIRCLE_X_DRIFT * priorCount;
                yDrift = CIRCLE_Y_DRIFT * priorCount;
            } else {
                radius = CIRCLE_RADIUS - CIRCLE_EXPAND * priorCount;
                if(radius <= 4) {
                    break;
                }
                angle += -CIRCLE_TRAIL_ROTATION * priorCount;
                xDrift = -CIRCLE_X_DRIFT * priorCount;
                yDrift = -CIRCLE_Y_DRIFT * priorCount;
            }
            
            for(let num = 0; num < this.points.length; num++) {
                let p = new Point(this.points[num].getX(priorCount)!, this.points[num].getY(priorCount)!);
                if(num == this.points.length - 1) {
                    // reuse the start point for the last point
                    p = new Point(this.points[0].getX(priorCount)!, this.points[0].getY(priorCount)!);
                } else if(num == this.points.length - 2) {
                    // mirror the control point of the start point
                    let controlPoint = new Point(this.points[1].getX(priorCount)!, this.points[1].getY(priorCount)!);
                    let destPoint = new Point(this.points[0].getX(priorCount)!, this.points[0].getY(priorCount)!);
                    let dx = destPoint.x - controlPoint.x;
                    let dy = destPoint.y - controlPoint.y;
                    p = new Point(destPoint.x + dx, destPoint.y + dy);
                } else if(num != 0 && num % 4 == 0) {
                    // reuse the end point of the last set
                    p = new Point(this.points[num-1].getX(priorCount)!, this.points[num-1].getY(priorCount)!);
                } else if(num > 4 && (num - 1) % 4 == 0) {
                    // mirror the control point of the last set
                    let controlPoint = new Point(this.points[num-3].getX(priorCount)!, this.points[num-3].getY(priorCount)!);
                    let destPoint = new Point(this.points[num-2].getX(priorCount)!, this.points[num-2].getY(priorCount)!);
                    let dx = destPoint.x - controlPoint.x;
                    let dy = destPoint.y - controlPoint.y;
                    p = new Point(destPoint.x + dx, destPoint.y + dy);
                }

                let rX = p.x * Math.cos(angle) - p.y * Math.sin(angle);
                let rY = p.y * Math.cos(angle) + p.x * Math.sin(angle);
                
                points.push(new Point(rX * radius + this.width/2 + xDrift, rY * radius + this.height/2 + yDrift));
            }
        }

        return points;
    }

    tick(delta: number) {
        this.points.forEach(p => {
            p.tick(delta);
        });
        this.resetTime += delta;
        this.totalTime += delta;
        if(this.resetTime > CHANGE_TIME) {
            this.resetTime = 0;
            this.points.forEach(p => {
                p.setDestination();
            });            
        }
    }

    getColor(): number {
        return this.color;
    }

    setColor(color: number) {
        this.color = color;
    }

    clearHistory() {
        this.points.forEach(p => p.clearHistory());
    }
}

class WaveBacklet implements Backlet {

    waveCount = 1;
    waveType = WaveType.Horizontal;
    
    element!: HTMLElement;
    
    paths: Path[] = [];
    
    constructor(waveCount: number, waveType: WaveType) {
        this.waveCount = waveCount;
        this.waveType = waveType;
    }
    
    reset(element: HTMLElement) {
        this.element = element;
        if(this.paths.length == 0) {
            for(let n = 0; n < this.waveCount; n++) {
                let path: Path;
                if(this.waveType == WaveType.Circle) {
                    path = new CircleWavePath();
                } else {
                    path = new WavePath();
                }
                path.setColor(colors[n % colors.length]);
                path.resizeTo(this.element.clientWidth, this.element.clientHeight);
                this.paths.push(path);
            }
        } else {
            this.paths.forEach((path) => {
                path.resizeTo(this.element.clientWidth, this.element.clientHeight);
            })
        }
    }

    getPaths(): Path[] {
        return this.paths;
    }

    clearAllHistories() {
        this.paths.forEach(path => path.clearHistory());
    }
    
    primePaths() {
        // Pre-fill history to make animation look good from the start
        let simulatedResetTime = 0;
        for(let i = 0; i < MAX_HISTORY; i++) {
            this.paths.forEach((path) => {
                path.tick(1);
                simulatedResetTime += 1;
                if(simulatedResetTime > CHANGE_TIME) {
                    simulatedResetTime = 0;
                    // Trigger destination changes for WavePath
                    if('p1' in path) {
                        (path as any).p1.setDestination();
                        (path as any).p2.setDestination();
                        (path as any).p3.setDestination();
                        (path as any).p4.setDestination();
                    }
                    // Trigger destination changes for CircleWavePath
                    if('points' in path) {
                        (path as any).points.forEach((p: AniPoint) => {
                            p.setDestination();
                        });
                    }
                }
            });
        }
    }
}

export class Backimator {

    backlet: WaveBacklet;

    element: HTMLElement = window.frameElement as HTMLElement;

    app: Canvas2DApplication | null = null;
    graphics: Canvas2DGraphics | null = null;
    graphics2: Canvas2DGraphics | null = null;
    tickerCallback: ((info: { deltaTime: number }) => void) | null = null;

    resizeObserver: ResizeObserver | undefined;
    intersectionObserver: IntersectionObserver | undefined;
    resizeTimeout: any;
    
    lastWidth = 0;
    lastHeight = 0;
    isDestroyed = false;

    constructor(backimatorSettings: object) {
        // @ts-ignore
        WAVE_COUNT = backimatorSettings["waveCount"];
        // @ts-ignore
        WAVE_TYPE = backimatorSettings["waveType"];
        
        // @ts-ignore
        PACE = backimatorSettings["pace"];
        // @ts-ignore
        MAX_VEL = backimatorSettings["maxVelocity"];
        // @ts-ignore
        CHANGE_TIME = backimatorSettings["changeTime"];
        // @ts-ignore
        FRICTION = backimatorSettings["friction"];
        // @ts-ignore
        MAX_HISTORY = backimatorSettings["maxHistory"];
        // @ts-ignore
        HISTORY_INTERVAL = backimatorSettings["historyInterval"];
        // @ts-ignore
        TRAIL_ALPHA = backimatorSettings["trailAlpha"];
        // @ts-ignore
        X_DRIFT = backimatorSettings["xDrift"];
        // @ts-ignore
        Y_DRIFT = backimatorSettings["yDrift"];

        // @ts-ignore
        FRONT_ALPHA = backimatorSettings["frontAlpha"];
        // @ts-ignore
        FRONT_COLOR = backimatorSettings["frontColor"];
        
        // @ts-ignore
        TRAIL_BLUR = backimatorSettings["trailBlur"];
        // @ts-ignore
        MAIN_BLUR = backimatorSettings["mainBlur"];
        
        // @ts-ignore
        TRAIL_WIDTH = backimatorSettings["trailWidth"];
        
        // @ts-ignore
        TRAIL_COLOR_1 = backimatorSettings["trailColor1"];
        // @ts-ignore
        TRAIL_COLOR_2 = backimatorSettings["trailColor2"];
        // @ts-ignore
        TRAIL_COLOR_3 = backimatorSettings["trailColor3"];
        // @ts-ignore
        TRAIL_COLOR_4 = backimatorSettings["trailColor4"];
        // @ts-ignore
        TRAIL_COLOR_5 = backimatorSettings["trailColor5"];
        
        // @ts-ignore
        colors = [ TRAIL_COLOR_1, TRAIL_COLOR_2, TRAIL_COLOR_3, TRAIL_COLOR_4, TRAIL_COLOR_5 ];
        
        // @ts-ignore
        CIRCLE_SLICES = backimatorSettings["circleSlices"];
        // @ts-ignore
        CIRCLE_RADIUS = backimatorSettings["circleRadius"];
        // @ts-ignore
        CIRCLE_EXPAND = backimatorSettings["circleExpand"];
        // @ts-ignore
        SQUARENESS = backimatorSettings["squareness"];
        // @ts-ignore
        CIRCLE_DEFORM = backimatorSettings["circleDeform"];
        // @ts-ignore
        CIRCLE_TRAIL_ROTATION = backimatorSettings["circleTrailRotation"];
        // @ts-ignore
        CIRCLE_ROTATION = backimatorSettings["circleRotation"];
        
        // @ts-ignore
        CIRCLE_X_DRIFT = backimatorSettings["circleXDrift"];
        // @ts-ignore
        CIRCLE_Y_DRIFT = backimatorSettings["circleYDrift"];

        // @ts-ignore
        FADE_IN_DURATION = backimatorSettings["fadeInDuration"] || 0;

        this.backlet = new WaveBacklet(WAVE_COUNT, WAVE_TYPE)
    }

    resizeNow() {
        // Clear any existing timeout
        if(this.resizeTimeout) {
            clearTimeout(this.resizeTimeout);
        }
        
        // Debounce the resize operation to 250ms
        this.resizeTimeout = setTimeout(() => {
            if(this.isDestroyed || !this.app) {
                return;
            }
            
            // Size the canvas to cover the parent element. This is necessary because the "resizeTo" option does not work unless the window size changes.
            let newWidth = this.element.clientWidth;
            let newHeight = this.element.clientHeight;
            this.app.renderer.resize(newWidth, newHeight);
            // only reset if height or width has changed by more than 100 pixels
            if(Math.abs(newWidth - this.lastWidth) < 30 && Math.abs(newHeight - this.lastHeight) < 100) {
                // height change on iOS when scrolling and width change based on scroll bar addition/removal should be ignored
                return;
            }
            this.lastWidth = newWidth;
            this.lastHeight = newHeight;
            this.backlet.reset(this.element);
            // Prime the animation after resize so it looks good immediately
            this.backlet.primePaths();
        }, 250);
    }
    
    cleanUp() {
        this.isDestroyed = true;
        
        if(this.resizeTimeout) {
            clearTimeout(this.resizeTimeout);
            this.resizeTimeout = null;
        }
        
        if(this.tickerCallback && this.app && this.app.ticker) {
            this.app.ticker.remove(this.tickerCallback);
            this.tickerCallback = null;
        }
        
        if(this.resizeObserver) {
            this.resizeObserver.disconnect();
            this.resizeObserver = undefined;
        }

        if(this.intersectionObserver) {
            this.intersectionObserver.disconnect();
            this.intersectionObserver = undefined;
        }

        if(this.backlet) {
            this.backlet.clearAllHistories();
        }
        
        if(this.graphics) {
            this.graphics = null;
        }

        if(this.graphics2) {
            this.graphics2 = null;
        }

        if(this.app) {
            if(this.app.canvas && this.element && this.element.contains(this.app.canvas)) {
                this.element.removeChild(this.app.canvas);
            }
            this.app.destroy(true);
            this.app = null;
        }
    }
    
    async start(element: HTMLElement) {
        this.cleanUp();

        this.isDestroyed = false;
        this.element = element;

        // Create the Canvas2D application
        this.app = new Canvas2DApplication();
        await this.app.init({ resizeTo: this.element, backgroundAlpha: 0, autoDensity: true });
        this.element.prepend(this.app.canvas);

        // Get the graphics context from the app
        this.graphics = this.app.graphics;

        // Apply CSS blur filter instead of PIXI.BlurFilter
        if(TRAIL_BLUR > 0) {
            this.app.canvas.style.filter = `blur(${TRAIL_BLUR}px)`;
        }

        this.app.canvas.style.position = "absolute";
        this.app.canvas.style.zIndex = "0";

        // Apply fade-in effect if configured
        if(FADE_IN_DURATION > 0) {
            this.app.canvas.style.opacity = "0";
            this.app.canvas.style.transition = `opacity ${FADE_IN_DURATION}ms ease-in`;
            // Trigger fade-in after a frame to ensure transition works
            requestAnimationFrame(() => {
                if(this.app && this.app.canvas) {
                    this.app.canvas.style.opacity = "1";
                }
            });
        }

        // Note: graphics2 with separate blur not supported in Canvas2D mode
        // The FRONT_ALPHA debug feature is disabled
        this.graphics2 = null;

        this.backlet.reset(this.element);

        // Prime the animation with history so it looks good from the start
        this.backlet.primePaths();

        // Initialize lastWidth/lastHeight so the first ResizeObserver callback
        // (which fires immediately when observe() is called) is ignored
        this.lastWidth = this.element.clientWidth;
        this.lastHeight = this.element.clientHeight;

        this.resizeObserver = new ResizeObserver(entries => {
            if(!this.isDestroyed) {
                this.resizeNow();
            }
        });
        this.resizeObserver.observe(this.element);

        // Pause animation when off-screen to save resources
        this.intersectionObserver = new IntersectionObserver(entries => {
            if(this.isDestroyed) return;
            entries[0].isIntersecting ? this.resume() : this.pause();
        });
        this.intersectionObserver.observe(this.element);

        this.app.ticker.maxFPS = FPS;

        this.tickerCallback = (info: any) => {
            
            if(this.isDestroyed) {
                return;
            }
            
            if(!this.element || this.element.clientWidth == 0 || this.element.clientHeight == 0) {
                return;
            }
            
            if(!this.graphics) {
                return;
            }
            
            this.graphics.clear();

            // Enable additive blending so overlapping curves create bright spots
            this.graphics.context.globalCompositeOperation = 'lighter';

            let paths = this.backlet.getPaths();

            // Draw all paths at the same history level together
            // Computes alpha once per history level and separates tick() from drawing
            for(let i = 0; i < MAX_HISTORY; i += HISTORY_INTERVAL) {
                let alpha = (1 - (i / MAX_HISTORY)) * TRAIL_ALPHA;
                for(let p = 0; p < paths.length; p++) {
                    let path = paths[p];
                    let points = path.getPoints(i);
                    if(!points) continue;
                    this.graphics.setStrokeStyle({width:TRAIL_WIDTH, color:path.getColor(), alpha:alpha});
                    for(let curve = 0; curve < points.length; curve += 4) {
                        this.graphics.moveTo(points[curve + 0].x, points[curve + 0].y)
                        this.graphics.bezierCurveTo(points[curve + 1].x, points[curve + 1].y, points[curve + 2].x, points[curve + 2].y, points[curve + 3].x, points[curve + 3].y);
                    }
                    this.graphics.stroke();
                }
            }

            // Tick all paths after drawing
            paths.forEach((path) => path.tick(info.deltaTime));

            if(FRONT_ALPHA > 0 && this.graphics2) {
                this.graphics2.clear();
                let paths = this.backlet.getPaths();
                paths.forEach((path) => {
                    this.graphics2!.setStrokeStyle({width:3, color:FRONT_COLOR, alpha:FRONT_ALPHA});
                    let points = path.getPoints(0);
                    if (points) {
                        for (let curve = 0; curve < points.length; curve += 4) {
                            this.graphics2!.moveTo(points[curve + 0].x, points[curve + 0].y)
                            this.graphics2!.bezierCurveTo(points[curve + 1].x, points[curve + 1].y, points[curve + 2].x, points[curve + 2].y, points[curve + 3].x, points[curve + 3].y);
                        }
                        this.graphics2!.stroke();
                    }
                });
            }

        };
        
        this.app.ticker.add(this.tickerCallback);
    }
    
    destroy() {
        this.cleanUp();
    }
    
    pause() {
        if(this.tickerCallback && this.app && this.app.ticker) {
            this.app.ticker.remove(this.tickerCallback);
        }
    }
    
    resume() {
        if(this.tickerCallback && this.app && this.app.ticker && !this.isDestroyed) {
            this.app.ticker.add(this.tickerCallback);
        }
    }

}