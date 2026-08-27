export class ZoneScrollbars {
    constructor() {
        this.parent = null;
        this.child = null;
        this.jump = null;
        this.sibling = null;
    }
    reset() {
        this.parent = null;
        this.child = null;
        this.jump = null;
        this.sibling = null;
    }
    get(zone) {
        switch (zone) {
            case "parent":
                return this.parent;
            case "child":
                return this.child;
            case "jump":
                return this.jump;
            case "sibling":
                return this.sibling;
        }
        return null;
    }
    set(zone, scrollbar) {
        switch (zone) {
            case "parent":
                this.parent = scrollbar;
                break;
            case "child":
                this.child = scrollbar;
                break;
            case "jump":
                this.jump = scrollbar;
                break;
            case "sibling":
                this.sibling = scrollbar;
                break;
        }
    }
}
//# sourceMappingURL=zoneScrollbar.js.map