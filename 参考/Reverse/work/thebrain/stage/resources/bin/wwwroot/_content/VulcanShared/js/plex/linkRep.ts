import {Relation} from "./core.js";
import {LinkDirection, LinkMeaning} from "./enums.js";

export class LinkRep {
    id: string;
    idA: string;
    idB: string;
    relation: Relation;
    color: number = 0;
    label: string = "";
    thickness: number = 0;
    direction: LinkDirection = LinkDirection.Undefined;
    meaning: LinkMeaning = LinkMeaning.Undefined;
    hasNotes: boolean = false;
    attachmentCount: number = 0;
    constructor(id: string, idA: string, idB: string, relation: Relation, color: number, label: string, thickness: number, direction: number, meaning: number) {
        this.id = id;
        this.idA = idA;
        this.idB = idB;
        this.relation = relation;
        this.color = color;
        this.label = label;
        this.thickness = thickness;
        this.direction = direction;
        this.meaning = meaning;
    }

    isDirected(): boolean {
        return this.direction != LinkDirection.Undefined && (this.direction & 1) != 0;
    }
    isBackward(): boolean {
        return this.direction != LinkDirection.Undefined && (this.direction & 2) != 0;
    }
    isOneWay(): boolean {
        return this.direction != LinkDirection.Undefined && (this.direction & 4) != 0;
    }
}
