import { Point } from "/_content/Venus/js/dist/geometry.js";
import { Canvas2DApplication } from "./canvas2DGraphics.js";
var WaveType;
(function (WaveType) {
    WaveType[WaveType["Horizontal"] = 0] = "Horizontal";
    WaveType[WaveType["Circle"] = 1] = "Circle";
})(WaveType || (WaveType = {}));
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
let FRONT_ALPHA = 0.0;
let FRONT_COLOR = 0xFFFFFF;
let TRAIL_BLUR = 2;
let MAIN_BLUR = 3;
let TRAIL_WIDTH = 10;
let TRAIL_COLOR_1 = 0xd1e751;
let TRAIL_COLOR_2 = 0x4dbce9;
let TRAIL_COLOR_3 = 0x26ade4;
let TRAIL_COLOR_4 = 0x0000ff;
let TRAIL_COLOR_5 = 0x0088ff;
let colors = [TRAIL_COLOR_1, TRAIL_COLOR_2, TRAIL_COLOR_3, TRAIL_COLOR_4, TRAIL_COLOR_5];
let CIRCLE_SLICES = 4;
let CIRCLE_RADIUS = 100;
let CIRCLE_EXPAND = 0.5;
let SQUARENESS = 0.57;
let CIRCLE_DEFORM = 0.2;
let CIRCLE_TRAIL_ROTATION = -0.003;
let CIRCLE_ROTATION = 0.0015;
let CIRCLE_X_DRIFT = 0;
let CIRCLE_Y_DRIFT = 0;
let FPS = 24;
let FADE_IN_DURATION = 0;
class AniPoint {
    constructor(minX, minY, maxX, maxY) {
        this.x = 0;
        this.y = 0;
        this.dX = 0;
        this.dY = 0;
        this.vX = 0;
        this.vY = 0;
        this.minX = 0;
        this.maxX = 0;
        this.minY = 0;
        this.maxY = 0;
        this.historyX = [];
        this.historyY = [];
        this.historyIndex = 0;
        this.historyCount = 0;
        this.setBounds(minX, minY, maxX, maxY);
        this.setCurrentCenter();
    }
    setBounds(minX, minY, maxX, maxY) {
        this.minX = minX;
        this.minY = minY;
        this.maxX = maxX;
        this.maxY = maxY;
        this.setDestination();
    }
    setCurrent(x, y) {
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
    pickRandom(min, max) {
        return (max - min) * Math.random() + min;
    }
    tick(delta) {
        this.historyX[this.historyIndex] = this.x;
        this.historyY[this.historyIndex] = this.y;
        this.historyIndex = (this.historyIndex + 1) % MAX_HISTORY;
        if (this.historyCount < MAX_HISTORY) {
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
    getX(priorCount) {
        if (priorCount == 0) {
            return this.x;
        }
        if (priorCount >= this.historyCount) {
            return null;
        }
        let index = (this.historyIndex - priorCount + MAX_HISTORY) % MAX_HISTORY;
        return this.historyX[index];
    }
    getY(priorCount) {
        if (priorCount == 0) {
            return this.y;
        }
        if (priorCount >= this.historyCount) {
            return null;
        }
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
class WavePath {
    constructor() {
        this.p1 = new AniPoint(0, 0, 0, 0);
        this.p2 = new AniPoint(0, 0, 0, 0);
        this.p3 = new AniPoint(0, 0, 0, 0);
        this.p4 = new AniPoint(0, 0, 0, 0);
        this.color = 0;
        this.resetTime = 0;
    }
    resizeTo(width, height) {
        let edgeAdjust = width * 0.1;
        this.p1.setBounds(-edgeAdjust, height * 0.33, -edgeAdjust, height * 0.66);
        this.p2.setBounds(width * 0.33, 0, width * 0.33, height);
        this.p3.setBounds(width * 0.66, 0, width * 0.66, height);
        this.p4.setBounds(width + edgeAdjust, height * 0.33, width + edgeAdjust, height * 0.66);
        let cx = width * 0.5;
        let cy = height * 0.5;
        this.p1.setCurrent(cx, cy);
        this.p2.setCurrent(cx, cy);
        this.p3.setCurrent(cx, cy);
        this.p4.setCurrent(cx, cy);
    }
    getPoints(priorCount) {
        if (this.p1.getX(priorCount) == null) {
            return null;
        }
        let points = [];
        points.push(new Point(this.p1.getX(priorCount) + Math.min(0, priorCount * X_DRIFT), this.p1.getY(priorCount) + priorCount * Y_DRIFT));
        points.push(new Point(this.p2.getX(priorCount) + priorCount * X_DRIFT, this.p2.getY(priorCount) + priorCount * Y_DRIFT));
        points.push(new Point(this.p3.getX(priorCount) + priorCount * X_DRIFT, this.p3.getY(priorCount) + priorCount * Y_DRIFT));
        points.push(new Point(this.p4.getX(priorCount) + Math.max(0, priorCount * X_DRIFT), this.p4.getY(priorCount) + priorCount * Y_DRIFT));
        return points;
    }
    tick(delta) {
        this.p1.tick(delta);
        this.p2.tick(delta);
        this.p3.tick(delta);
        this.p4.tick(delta);
        this.resetTime += delta;
        if (this.resetTime > CHANGE_TIME) {
            this.resetTime = 0;
            this.p1.setDestination();
            this.p2.setDestination();
            this.p3.setDestination();
            this.p4.setDestination();
        }
    }
    getColor() {
        return this.color;
    }
    setColor(color) {
        this.color = color;
    }
    clearHistory() {
        this.p1.clearHistory();
        this.p2.clearHistory();
        this.p3.clearHistory();
        this.p4.clearHistory();
    }
}
class CircleWavePath {
    constructor() {
        this.points = [];
        this.color = 0;
        this.resetTime = 0;
        this.totalTime = 0;
        this.width = 0;
        this.height = 0;
        let radsPerSlice = (2 * Math.PI) / CIRCLE_SLICES;
        for (let num = 0; num < 4; num++) {
            let range = CIRCLE_DEFORM;
            let radStart = radsPerSlice * num;
            let radEnd = radsPerSlice * (num + 1);
            let x = Math.cos(radStart);
            let y = Math.sin(radStart);
            let p1 = new AniPoint(x - range, y - range, x + range, y + range);
            let dx = Math.cos(radStart + Math.PI / 2) * SQUARENESS;
            let dy = Math.sin(radStart + Math.PI / 2) * SQUARENESS;
            let p2 = new AniPoint(x + dx - range, y + dy - range, x + dx + range, y + dy + range);
            x = Math.cos(radEnd);
            y = Math.sin(radEnd);
            let p4 = new AniPoint(x - range, y - range, x + range, y + range);
            dx = Math.cos(radEnd - Math.PI / 2) * SQUARENESS;
            dy = Math.sin(radEnd - Math.PI / 2) * SQUARENESS;
            let p3 = new AniPoint(x + dx - range, y + dy - range, x + dx + range, y + dy + range);
            this.points.push(p1, p2, p3, p4);
        }
    }
    resizeTo(width, height) {
        this.width = width;
        this.height = height;
    }
    getPoints(priorCount) {
        if (this.points[0].getX(priorCount) == null) {
            return null;
        }
        let points = [];
        for (let repeat = 0; repeat < 2; repeat++) {
            let radius;
            let angle = this.totalTime * CIRCLE_ROTATION;
            let xDrift;
            let yDrift;
            if (repeat == 0) {
                radius = CIRCLE_RADIUS + CIRCLE_EXPAND * priorCount;
                angle += CIRCLE_TRAIL_ROTATION * priorCount;
                xDrift = CIRCLE_X_DRIFT * priorCount;
                yDrift = CIRCLE_Y_DRIFT * priorCount;
            }
            else {
                radius = CIRCLE_RADIUS - CIRCLE_EXPAND * priorCount;
                if (radius <= 4) {
                    break;
                }
                angle += -CIRCLE_TRAIL_ROTATION * priorCount;
                xDrift = -CIRCLE_X_DRIFT * priorCount;
                yDrift = -CIRCLE_Y_DRIFT * priorCount;
            }
            for (let num = 0; num < this.points.length; num++) {
                let p = new Point(this.points[num].getX(priorCount), this.points[num].getY(priorCount));
                if (num == this.points.length - 1) {
                    p = new Point(this.points[0].getX(priorCount), this.points[0].getY(priorCount));
                }
                else if (num == this.points.length - 2) {
                    let controlPoint = new Point(this.points[1].getX(priorCount), this.points[1].getY(priorCount));
                    let destPoint = new Point(this.points[0].getX(priorCount), this.points[0].getY(priorCount));
                    let dx = destPoint.x - controlPoint.x;
                    let dy = destPoint.y - controlPoint.y;
                    p = new Point(destPoint.x + dx, destPoint.y + dy);
                }
                else if (num != 0 && num % 4 == 0) {
                    p = new Point(this.points[num - 1].getX(priorCount), this.points[num - 1].getY(priorCount));
                }
                else if (num > 4 && (num - 1) % 4 == 0) {
                    let controlPoint = new Point(this.points[num - 3].getX(priorCount), this.points[num - 3].getY(priorCount));
                    let destPoint = new Point(this.points[num - 2].getX(priorCount), this.points[num - 2].getY(priorCount));
                    let dx = destPoint.x - controlPoint.x;
                    let dy = destPoint.y - controlPoint.y;
                    p = new Point(destPoint.x + dx, destPoint.y + dy);
                }
                let rX = p.x * Math.cos(angle) - p.y * Math.sin(angle);
                let rY = p.y * Math.cos(angle) + p.x * Math.sin(angle);
                points.push(new Point(rX * radius + this.width / 2 + xDrift, rY * radius + this.height / 2 + yDrift));
            }
        }
        return points;
    }
    tick(delta) {
        this.points.forEach(p => {
            p.tick(delta);
        });
        this.resetTime += delta;
        this.totalTime += delta;
        if (this.resetTime > CHANGE_TIME) {
            this.resetTime = 0;
            this.points.forEach(p => {
                p.setDestination();
            });
        }
    }
    getColor() {
        return this.color;
    }
    setColor(color) {
        this.color = color;
    }
    clearHistory() {
        this.points.forEach(p => p.clearHistory());
    }
}
class WaveBacklet {
    constructor(waveCount, waveType) {
        this.waveCount = 1;
        this.waveType = WaveType.Horizontal;
        this.paths = [];
        this.waveCount = waveCount;
        this.waveType = waveType;
    }
    reset(element) {
        this.element = element;
        if (this.paths.length == 0) {
            for (let n = 0; n < this.waveCount; n++) {
                let path;
                if (this.waveType == WaveType.Circle) {
                    path = new CircleWavePath();
                }
                else {
                    path = new WavePath();
                }
                path.setColor(colors[n % colors.length]);
                path.resizeTo(this.element.clientWidth, this.element.clientHeight);
                this.paths.push(path);
            }
        }
        else {
            this.paths.forEach((path) => {
                path.resizeTo(this.element.clientWidth, this.element.clientHeight);
            });
        }
    }
    getPaths() {
        return this.paths;
    }
    clearAllHistories() {
        this.paths.forEach(path => path.clearHistory());
    }
    primePaths() {
        let simulatedResetTime = 0;
        for (let i = 0; i < MAX_HISTORY; i++) {
            this.paths.forEach((path) => {
                path.tick(1);
                simulatedResetTime += 1;
                if (simulatedResetTime > CHANGE_TIME) {
                    simulatedResetTime = 0;
                    if ('p1' in path) {
                        path.p1.setDestination();
                        path.p2.setDestination();
                        path.p3.setDestination();
                        path.p4.setDestination();
                    }
                    if ('points' in path) {
                        path.points.forEach((p) => {
                            p.setDestination();
                        });
                    }
                }
            });
        }
    }
}
export class Backimator {
    constructor(backimatorSettings) {
        this.element = window.frameElement;
        this.app = null;
        this.graphics = null;
        this.graphics2 = null;
        this.tickerCallback = null;
        this.lastWidth = 0;
        this.lastHeight = 0;
        this.isDestroyed = false;
        WAVE_COUNT = backimatorSettings["waveCount"];
        WAVE_TYPE = backimatorSettings["waveType"];
        PACE = backimatorSettings["pace"];
        MAX_VEL = backimatorSettings["maxVelocity"];
        CHANGE_TIME = backimatorSettings["changeTime"];
        FRICTION = backimatorSettings["friction"];
        MAX_HISTORY = backimatorSettings["maxHistory"];
        HISTORY_INTERVAL = backimatorSettings["historyInterval"];
        TRAIL_ALPHA = backimatorSettings["trailAlpha"];
        X_DRIFT = backimatorSettings["xDrift"];
        Y_DRIFT = backimatorSettings["yDrift"];
        FRONT_ALPHA = backimatorSettings["frontAlpha"];
        FRONT_COLOR = backimatorSettings["frontColor"];
        TRAIL_BLUR = backimatorSettings["trailBlur"];
        MAIN_BLUR = backimatorSettings["mainBlur"];
        TRAIL_WIDTH = backimatorSettings["trailWidth"];
        TRAIL_COLOR_1 = backimatorSettings["trailColor1"];
        TRAIL_COLOR_2 = backimatorSettings["trailColor2"];
        TRAIL_COLOR_3 = backimatorSettings["trailColor3"];
        TRAIL_COLOR_4 = backimatorSettings["trailColor4"];
        TRAIL_COLOR_5 = backimatorSettings["trailColor5"];
        colors = [TRAIL_COLOR_1, TRAIL_COLOR_2, TRAIL_COLOR_3, TRAIL_COLOR_4, TRAIL_COLOR_5];
        CIRCLE_SLICES = backimatorSettings["circleSlices"];
        CIRCLE_RADIUS = backimatorSettings["circleRadius"];
        CIRCLE_EXPAND = backimatorSettings["circleExpand"];
        SQUARENESS = backimatorSettings["squareness"];
        CIRCLE_DEFORM = backimatorSettings["circleDeform"];
        CIRCLE_TRAIL_ROTATION = backimatorSettings["circleTrailRotation"];
        CIRCLE_ROTATION = backimatorSettings["circleRotation"];
        CIRCLE_X_DRIFT = backimatorSettings["circleXDrift"];
        CIRCLE_Y_DRIFT = backimatorSettings["circleYDrift"];
        FADE_IN_DURATION = backimatorSettings["fadeInDuration"] || 0;
        this.backlet = new WaveBacklet(WAVE_COUNT, WAVE_TYPE);
    }
    resizeNow() {
        if (this.resizeTimeout) {
            clearTimeout(this.resizeTimeout);
        }
        this.resizeTimeout = setTimeout(() => {
            if (this.isDestroyed || !this.app) {
                return;
            }
            let newWidth = this.element.clientWidth;
            let newHeight = this.element.clientHeight;
            this.app.renderer.resize(newWidth, newHeight);
            if (Math.abs(newWidth - this.lastWidth) < 30 && Math.abs(newHeight - this.lastHeight) < 100) {
                return;
            }
            this.lastWidth = newWidth;
            this.lastHeight = newHeight;
            this.backlet.reset(this.element);
            this.backlet.primePaths();
        }, 250);
    }
    cleanUp() {
        this.isDestroyed = true;
        if (this.resizeTimeout) {
            clearTimeout(this.resizeTimeout);
            this.resizeTimeout = null;
        }
        if (this.tickerCallback && this.app && this.app.ticker) {
            this.app.ticker.remove(this.tickerCallback);
            this.tickerCallback = null;
        }
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
            this.resizeObserver = undefined;
        }
        if (this.intersectionObserver) {
            this.intersectionObserver.disconnect();
            this.intersectionObserver = undefined;
        }
        if (this.backlet) {
            this.backlet.clearAllHistories();
        }
        if (this.graphics) {
            this.graphics = null;
        }
        if (this.graphics2) {
            this.graphics2 = null;
        }
        if (this.app) {
            if (this.app.canvas && this.element && this.element.contains(this.app.canvas)) {
                this.element.removeChild(this.app.canvas);
            }
            this.app.destroy(true);
            this.app = null;
        }
    }
    async start(element) {
        this.cleanUp();
        this.isDestroyed = false;
        this.element = element;
        this.app = new Canvas2DApplication();
        await this.app.init({ resizeTo: this.element, backgroundAlpha: 0, autoDensity: true });
        this.element.prepend(this.app.canvas);
        this.graphics = this.app.graphics;
        if (TRAIL_BLUR > 0) {
            this.app.canvas.style.filter = `blur(${TRAIL_BLUR}px)`;
        }
        this.app.canvas.style.position = "absolute";
        this.app.canvas.style.zIndex = "0";
        if (FADE_IN_DURATION > 0) {
            this.app.canvas.style.opacity = "0";
            this.app.canvas.style.transition = `opacity ${FADE_IN_DURATION}ms ease-in`;
            requestAnimationFrame(() => {
                if (this.app && this.app.canvas) {
                    this.app.canvas.style.opacity = "1";
                }
            });
        }
        this.graphics2 = null;
        this.backlet.reset(this.element);
        this.backlet.primePaths();
        this.lastWidth = this.element.clientWidth;
        this.lastHeight = this.element.clientHeight;
        this.resizeObserver = new ResizeObserver(entries => {
            if (!this.isDestroyed) {
                this.resizeNow();
            }
        });
        this.resizeObserver.observe(this.element);
        this.intersectionObserver = new IntersectionObserver(entries => {
            if (this.isDestroyed)
                return;
            entries[0].isIntersecting ? this.resume() : this.pause();
        });
        this.intersectionObserver.observe(this.element);
        this.app.ticker.maxFPS = FPS;
        this.tickerCallback = (info) => {
            if (this.isDestroyed) {
                return;
            }
            if (!this.element || this.element.clientWidth == 0 || this.element.clientHeight == 0) {
                return;
            }
            if (!this.graphics) {
                return;
            }
            this.graphics.clear();
            this.graphics.context.globalCompositeOperation = 'lighter';
            let paths = this.backlet.getPaths();
            for (let i = 0; i < MAX_HISTORY; i += HISTORY_INTERVAL) {
                let alpha = (1 - (i / MAX_HISTORY)) * TRAIL_ALPHA;
                for (let p = 0; p < paths.length; p++) {
                    let path = paths[p];
                    let points = path.getPoints(i);
                    if (!points)
                        continue;
                    this.graphics.setStrokeStyle({ width: TRAIL_WIDTH, color: path.getColor(), alpha: alpha });
                    for (let curve = 0; curve < points.length; curve += 4) {
                        this.graphics.moveTo(points[curve + 0].x, points[curve + 0].y);
                        this.graphics.bezierCurveTo(points[curve + 1].x, points[curve + 1].y, points[curve + 2].x, points[curve + 2].y, points[curve + 3].x, points[curve + 3].y);
                    }
                    this.graphics.stroke();
                }
            }
            paths.forEach((path) => path.tick(info.deltaTime));
            if (FRONT_ALPHA > 0 && this.graphics2) {
                this.graphics2.clear();
                let paths = this.backlet.getPaths();
                paths.forEach((path) => {
                    this.graphics2.setStrokeStyle({ width: 3, color: FRONT_COLOR, alpha: FRONT_ALPHA });
                    let points = path.getPoints(0);
                    if (points) {
                        for (let curve = 0; curve < points.length; curve += 4) {
                            this.graphics2.moveTo(points[curve + 0].x, points[curve + 0].y);
                            this.graphics2.bezierCurveTo(points[curve + 1].x, points[curve + 1].y, points[curve + 2].x, points[curve + 2].y, points[curve + 3].x, points[curve + 3].y);
                        }
                        this.graphics2.stroke();
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
        if (this.tickerCallback && this.app && this.app.ticker) {
            this.app.ticker.remove(this.tickerCallback);
        }
    }
    resume() {
        if (this.tickerCallback && this.app && this.app.ticker && !this.isDestroyed) {
            this.app.ticker.add(this.tickerCallback);
        }
    }
}
//# sourceMappingURL=backimator.js.map