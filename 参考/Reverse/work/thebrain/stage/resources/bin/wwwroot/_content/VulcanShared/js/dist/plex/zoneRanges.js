export class OneZoneRange {
    constructor(start, end, count) {
        this.start = start;
        this.end = end;
        this.count = count;
    }
    toString() {
        return `Start: ${this.start}, End: ${this.end}, Count: ${this.count}`;
    }
}
export class ZoneRanges {
    constructor(activeThoughtId, parentStart, parentEnd, parentCount, childStart, childEnd, childCount, siblingStart, siblingEnd, siblingCount, jumpStart, jumpEnd, jumpCount) {
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
    static stringToHashCode(str, start = 0) {
        let hash = start, i, chr;
        if (str.length === 0) {
            return hash;
        }
        for (i = 0; i < str.length; i++) {
            chr = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + chr;
            hash |= 0;
        }
        return hash;
    }
    static stringArrayToHashCode(arr) {
        let st = new Set(arr);
        arr = Array.from(st);
        arr.sort();
        let hash = 0;
        for (let i = 0; i < arr.length; i++) {
            hash = ZoneRanges.stringToHashCode(arr[i], hash);
        }
        return hash;
    }
    static fromObject(otherObject) {
        let that = new ZoneRanges(otherObject.activeThoughtId, otherObject.parentStart, otherObject.parentEnd, otherObject.parentCount, otherObject.childStart, otherObject.childEnd, otherObject.childCount, otherObject.siblingStart, otherObject.siblingEnd, otherObject.siblingCount, otherObject.jumpStart, otherObject.jumpEnd, otherObject.jumpCount);
        return that;
    }
    equals(other) {
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
    toString() {
        let that = this;
        return `ActiveThoughtId: ${that.activeThoughtId}, Parent: [${that.parentStart}, ${that.parentEnd}, #: ${that.parentCount}], Child: [${that.childStart}, ${that.childEnd}, #: ${this.childCount}], Sibling: [${that.siblingStart}, ${that.siblingEnd}, #:${that.siblingCount}], Jump: [${that.jumpStart}, ${that.jumpEnd}, #${that.jumpCount}]`;
    }
}
//# sourceMappingURL=zoneRanges.js.map