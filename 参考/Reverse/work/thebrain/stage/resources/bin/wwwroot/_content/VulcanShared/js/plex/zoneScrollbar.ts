import {Scrollbar} from "./scrollbar.js";

export class ZoneScrollbars {
    parent: Scrollbar | null;
    child: Scrollbar | null;
    jump: Scrollbar | null;
    sibling: Scrollbar | null;

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

    get(zone: string): Scrollbar | null {
        switch(zone) {
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

    set(zone: string, scrollbar: Scrollbar | null) {
        switch(zone) {
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
