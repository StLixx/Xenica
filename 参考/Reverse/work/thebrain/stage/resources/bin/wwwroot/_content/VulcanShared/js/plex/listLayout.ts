import {ThoughtHorizontalAlignment} from "./enums.js";
import {ThoughtRep} from "./thoughtRep.js";

export class ListLayout {
    containerSelector: string;
    alignment: ThoughtHorizontalAlignment;
    reps: Map<string, ThoughtRep> = new Map<string, ThoughtRep>();

    constructor(containerSelector: string, alignment: ThoughtHorizontalAlignment = ThoughtHorizontalAlignment.Center) {
        this.containerSelector = containerSelector;
        this.alignment = alignment;
    }

    sync() {
        const container = document.querySelector(this.containerSelector) as HTMLElement | null;
        if(!container) {
            this.reps.clear();
            return;
        }

        // Find all thought elements by id prefix 'tht-'
        const elements = container.querySelectorAll('[id^="tht-"]') as NodeListOf<HTMLElement>;
        const next = new Map<string, ThoughtRep>();
        elements.forEach(el => {
            const id = el.id.substring(4, 40);
            if(id && id.length > 0) {
                const rep = new ThoughtRep(el);
                rep.isListRep = true;
                rep.alignment = this.alignment;
                next.set(rep.id, rep);
            }
        });
        this.reps = next;
    }

    getRep(id: string): ThoughtRep | undefined {
        return this.reps.get(id);
    }
}
