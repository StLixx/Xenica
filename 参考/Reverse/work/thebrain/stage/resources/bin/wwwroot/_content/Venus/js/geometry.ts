export class Point {
    x: number;
    y: number;

    constructor(x: number, y: number) {
        this.x = x;
        this.y = y;
    }

    add(o: Point): Point {
        return new Point(this.x + o.x, this.y + o.y);
    }

    subtract(o: Point): Point {
        return new Point(this.x - o.x, this.y - o.y);
    }

    multiply(n: number): Point {
        return new Point(this.x * n, this.y * n);
    }
    
    divide(n: number): Point {
        return new Point(this.x / n || 0, this.y / n || 0); // Avoid divide by zero errors..
    }
    
    magnitude(): number {
        return Math.sqrt(this.x*this.x + this.y*this.y);
    }
    
    normalise(): Point {
        return this.divide(this.magnitude());
    }
    
    moveToward(dest: Point, progress: number): Point {
        if(progress >= 1) {
            return dest;
        }
        let d = dest.subtract(this).multiply(progress);
        return this.add(d);
    }
}


export class Rect {
    x: number;
    y: number;
    width: number;
    height: number;

    constructor(x: number, y: number, width: number, height: number) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
    }

    getCenter() {
        return new Point(this.x + this.width /2, this.y + this.height/2);
    }

    bottom() {
        return this.y + this.height;
    }

    right() {
        return this.x + this.width;
    }

    contains(point: Point) {
        return this.x <= point.x && this.right() >= point.x && this.y <= point.y && this.bottom() >= point.y;
    }
	
	static fromElement(el: HTMLElement) {
		let rect = el.getBoundingClientRect();
		return new Rect(rect.x, rect.y, rect.width, rect.height);
	}

    calcDistance(other: Rect): number {
        // if rects overlap each other in the x axis, return the distance between top and bottom
        if(this.right() >= other.x && other.right() >= this.x) {
            if(this.getCenter().y > other.getCenter().y) {
                // we are below
                return Math.max(0, this.y - other.bottom());
            } else {
                // we are above
                return Math.max(0, other.y - this.bottom());
            }
        }
        // if rects overlap each other in the y axis, return the distance between left and right
        if(this.bottom() >= other.y && other.bottom() >= this.y) {
            if(this.getCenter().x > other.getCenter().x) {
                // we are right
                return Math.max(0, this.x - other.right());
            } else {
                // we are left
                return Math.max(0, other.x - this.right());
            }
        }
        // return the distance between the closest corners
        let x1: number;
        let x2: number;
        if(this.getCenter().x > other.getCenter().x) {
            x1 = this.x;
            x2 = other.right();
        } else {
            x1 = other.x;
            x2 = other.right();
        }
        let y1: number;
        let y2: number;
        if(this.getCenter().y > other.getCenter().y) {
            y1 = this.y;
            y2 = other.bottom();
        } else {
            y1 = other.y;
            y2 = other.bottom();
        }
        let p1 = new Point(x1, y1);
        let p2 = new Point(x2, y2);
        return p1.subtract(p2).magnitude();
    }

    static from(domRect: DOMRect) {
        return new Rect(domRect.x, domRect.y, domRect.width, domRect.height);
    }
}

export interface Collider {
    collide(pt: Point): boolean;
}

// Ported from C#: TheBrain.Graphics.Collider.cs
export class CubicCollider implements Collider {
    MARGIN = 4;
    public constructor(p: Point[]) {
        let x0 = Math.min(p[0].x, p[1].x, p[2].x, p[3].x);
        let x1 = Math.max(p[0].x, p[1].x, p[2].x, p[3].x);
        let y0 = Math.min(p[0].y, p[1].y, p[2].y, p[3].y);
        let y1 = Math.max(p[0].y, p[1].y, p[2].y, p[3].y);
        this.cacheR = new Rect(x0 - this.MARGIN, y0 - this.MARGIN, x1-x0 + this.MARGIN*2, y1-y0 + this.MARGIN*2);
        this.segPts = this.getCurveLineSegments(p);
    }

    // bezier line approximation using info from http://www.antigrain.com/research/adaptive_bezier/index.html
    getCurveLineSegments(points: Point[]): Point[] {
        let dx1, dy1, dx2, dy2, dx3, dy3;
        dx1 = points[1].x - points[0].x;
        dy1 = points[1].y - points[0].y;
        dx2 = points[2].x - points[1].x;
        dy2 = points[2].y - points[1].y;
        dx3 = points[3].x - points[2].x;
        dy3 = points[3].y - points[2].y;
    
        let len = Math.sqrt(dx1 * dx1 + dy1 * dy1) +
            Math.sqrt(dx2 * dx2 + dy2 * dy2) +
            Math.sqrt(dx3 * dx3 + dy3 * dy3);
    
        // the more steps used, the more accurate the lines, however this also makes it slower
        let numSteps = Math.floor(len * 0.035); // (len * 0.25);
        if(numSteps < 4) {
            numSteps = 4;
        }
    
        let inc = 1.0/numSteps;
        let result: Point[] = []; 
        result.push(points[0]);
        for(let i = 1; i <= numSteps-1; i++) {
            result.push(CubicCollider.getCubicValueAt(points, inc*i));
        }
        result.push(points[3]);
        return result;
    }

    public static getCubicValueAt(pts: Point[], t: number): Point {
        // Tried to optimize this using a lookup table but it is faster to do the math every time instead. HMH. July 12, 2018.
        // B(t) = (1-t)^3 p0 + 3(1-t)^2 t p1 + 3(1-t)t^p2 + t^3 p3
        let omt = 1.0 - t;
        let a = omt * omt * omt;
        let b = 3.0 * omt * omt * t;
        let c = 3.0 * omt * t * t;
        let d = t * t * t;
        return new Point((a * pts[0].x + b * pts[1].x + c * pts[2].x + d * pts[3].x),
            (a * pts[0].y + b * pts[1].y + c * pts[2].y + d * pts[3].y));
    }

    segPts: Point[];
    cacheR: Rect;

    public collide(pt: Point): boolean {
        if(!this.cacheR.contains(pt)) {
            return false;
        }
        for(let i = 0; i < this.segPts.length-1; i++) {
            let a = this.segPts[i];
            let b = this.segPts[i+1];
            if(LineCollider.findLine(a.x, a.y, b.x, b.y, pt.x, pt.y, 3.0)) {
                return true;
            }
        }
        return false;
    }
}

export class LineCollider implements Collider {
    from: Point;
    to: Point;
    thickness: number;
    mnx: number;
    mxx: number;
    mny: number;
    mxy: number;
    public constructor (from: Point, to: Point, thickness: number) {
        this.from = from;
        this.to = to;
        this.mxx = Math.max(from.x, to.x) + thickness;
        this.mnx = Math.min(from.x, to.x) - thickness;
        this.mxy = Math.max(from.y, to.y) + thickness;
        this.mny = Math.min(from.y, to.y) - thickness;
        this.thickness = thickness;
    }
    findLineWrap(x1: number, y1: number, x2: number, y2: number, px: number, py: number, distance: number): boolean {
        // check conservative bounding box
        if (px < this.mnx || px > this.mxx || py < this.mny || py > this.mxy) {
            return false;
        }
        return LineCollider.findLine(x1, y1, x2, y2, px, py, distance);
    }
    static findLine(x1: number, y1: number, x2: number, y2: number, px: number, py: number, distance: number): boolean {
        let a, b, c;
        let len = Math.sqrt((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1));
        if(x2 - x1 > 0.01 || x2 - x1 < -0.01) {
            a = (y2 - y1) / (x2 - x1);
            b = -1.0;
            c = (a * x1) - y1;
        }
        else {
            a = 1.0;
            b = 0.0;
            c = x1;
        }
        let distFromLine = ((a * px + b * py - c) / Math.sqrt(a * a + b * b));
        if(Math.abs(distFromLine) <= distance) {
            let len2 = Math.sqrt((px - x1) * (px - x1) + (py - y1) * (py - y1));
            let len3 = Math.sqrt((px - x2) * (px - x2) + (py - y2) * (py - y2));
            if(len2 > len || len3 > len) {
                return false;
            }
            return true;
        }
        return false;
    }
    public collide(pt: Point): boolean {
        return this.findLineWrap(this.from.x, this.from.y, this.to.x, this.to.y, pt.x, pt.y, this.thickness);
    }
}

export const PI = 3.14159265359;