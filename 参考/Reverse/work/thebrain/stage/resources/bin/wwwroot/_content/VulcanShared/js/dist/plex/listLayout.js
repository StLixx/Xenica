import { ThoughtHorizontalAlignment } from "./enums.js";
import { ThoughtRep } from "./thoughtRep.js";
export class ListLayout {
    constructor(containerSelector, alignment = ThoughtHorizontalAlignment.Center) {
        this.reps = new Map();
        this.containerSelector = containerSelector;
        this.alignment = alignment;
    }
    sync() {
        const container = document.querySelector(this.containerSelector);
        if (!container) {
            this.reps.clear();
            return;
        }
        const elements = container.querySelectorAll('[id^="tht-"]');
        const next = new Map();
        elements.forEach(el => {
            const id = el.id.substring(4, 40);
            if (id && id.length > 0) {
                const rep = new ThoughtRep(el);
                rep.isListRep = true;
                rep.alignment = this.alignment;
                next.set(rep.id, rep);
            }
        });
        this.reps = next;
    }
    getRep(id) {
        return this.reps.get(id);
    }
}
//# sourceMappingURL=listLayout.js.map