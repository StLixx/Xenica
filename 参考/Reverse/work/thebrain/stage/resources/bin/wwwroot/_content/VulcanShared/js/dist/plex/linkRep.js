import { LinkDirection, LinkMeaning } from "./enums.js";
export class LinkRep {
    constructor(id, idA, idB, relation, color, label, thickness, direction, meaning) {
        this.color = 0;
        this.label = "";
        this.thickness = 0;
        this.direction = LinkDirection.Undefined;
        this.meaning = LinkMeaning.Undefined;
        this.hasNotes = false;
        this.attachmentCount = 0;
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
    isDirected() {
        return this.direction != LinkDirection.Undefined && (this.direction & 1) != 0;
    }
    isBackward() {
        return this.direction != LinkDirection.Undefined && (this.direction & 2) != 0;
    }
    isOneWay() {
        return this.direction != LinkDirection.Undefined && (this.direction & 4) != 0;
    }
}
//# sourceMappingURL=linkRep.js.map