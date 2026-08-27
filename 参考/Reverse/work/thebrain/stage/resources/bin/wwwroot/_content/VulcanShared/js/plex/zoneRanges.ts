export class OneZoneRange {
    start: number;
    end: number;
    count: number;
    constructor(start: number, end: number, count: number) {
        this.start = start;
        this.end = end;
        this.count = count;
    }
    
    toString(): string {
        return `Start: ${this.start}, End: ${this.end}, Count: ${this.count}`;
    }
}

export class ZoneRanges {
    parentStart: number;
    parentEnd: number;
    parentCount: number;
    childStart: number;
    childEnd: number;
    childCount: number;
    siblingStart: number;
    siblingEnd: number;
    siblingCount: number;
    jumpStart: number;
    jumpEnd: number;
    jumpCount: number;
    
    // for absolute sanity check, so we don't slice the ranges of the wrong thought
    activeThoughtId: string;
    
    constructor(
        activeThoughtId: string,
        parentStart: number, parentEnd: number, parentCount: number,
        childStart: number, childEnd: number, childCount: number,
        siblingStart: number, siblingEnd: number, siblingCount: number,
        jumpStart: number, jumpEnd: number, jumpCount: number
    ) {
        this.activeThoughtId = activeThoughtId;
        this.parentStart = parentStart;
        this.parentEnd = parentEnd;
        this.parentCount = parentCount;
        this.childStart = childStart;
        this.childEnd = childEnd;
        this.childCount = childCount;
        this.siblingStart = siblingStart;
        this.siblingEnd = siblingEnd;
        this.siblingCount = siblingCount;
        this.jumpStart = jumpStart;
        this.jumpEnd = jumpEnd;
        this.jumpCount = jumpCount;
    }
    
    static stringToHashCode(str: string, start = 0): number {
        let hash = start, i, chr;
        if (str.length === 0) {
            return hash;
        }
        for (i = 0; i < str.length; i++) {
            chr = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + chr;
            hash |= 0; // Convert to 32bit integer
        }
        return hash;
    }
    
    static stringArrayToHashCode(arr: string[]): number {
        let st = new Set(arr);
        arr = Array.from(st);
        arr.sort();
        let hash = 0;
        for (let i = 0; i < arr.length; i++) {
            hash = ZoneRanges.stringToHashCode(arr[i], hash);
        }
        return hash;
    }
    
    // Because of a gap in TypeScript's type system (it checks the object has the matching fields
    // at compile time, but cannot guarantee the object has the correct ZoneRanges prototype,
    // at run time), then we need to use a static method to create an instance so we can call
    // member methods on it.
    static fromObject(otherObject: any): ZoneRanges {
        let that = new ZoneRanges(
            otherObject.activeThoughtId,
            otherObject.parentStart,
            otherObject.parentEnd,
            otherObject.parentCount,
            otherObject.childStart,
            otherObject.childEnd,
            otherObject.childCount,
            otherObject.siblingStart,
            otherObject.siblingEnd,
            otherObject.siblingCount,
            otherObject.jumpStart,
            otherObject.jumpEnd,
            otherObject.jumpCount
        );
        return that;
    }
    
    equals(other: ZoneRanges): boolean {
        //this.logInfo("this :", this.toString(), "\nother:", other.toString());
        return this.activeThoughtId === other.activeThoughtId &&
            this.parentStart === other.parentStart &&
            this.parentEnd === other.parentEnd &&
            this.parentCount === other.parentCount &&
            this.childStart === other.childStart &&
            this.childEnd === other.childEnd &&
            this.childCount === other.childCount &&
            this.siblingStart === other.siblingStart &&
            this.siblingEnd === other.siblingEnd &&
            this.siblingCount === other.siblingCount &&
            this.jumpStart === other.jumpStart &&
            this.jumpEnd === other.jumpEnd &&
            this.jumpCount === other.jumpCount;
    }

    toString(): string {
        let that = this;
        return `ActiveThoughtId: ${that.activeThoughtId}, Parent: [${that.parentStart}, ${that.parentEnd}, #: ${that.parentCount}], Child: [${that.childStart}, ${that.childEnd}, #: ${this.childCount}], Sibling: [${that.siblingStart}, ${that.siblingEnd}, #:${that.siblingCount}], Jump: [${that.jumpStart}, ${that.jumpEnd}, #${that.jumpCount}]`;
    }

}
