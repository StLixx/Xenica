import {Relation} from "./core.js";
import {GateStatus, ThoughtExpandDirection, ThoughtHorizontalAlignment} from "./enums.js";

export class ThoughtRep {
    thtEl: HTMLElement;
    id: string;
    alignment: ThoughtHorizontalAlignment = ThoughtHorizontalAlignment.Center;
    expandDirection: ThoughtExpandDirection = ThoughtExpandDirection.Undefined;
    childGate: GateStatus = GateStatus.Empty;
    parentGate: GateStatus = GateStatus.Empty;
    jumpGate: GateStatus = GateStatus.Empty;
    generation: number = -1;
    isListRep: boolean = false;
    zone: "parent" | "jump" | "child" | "sibling" | null = null;
    actualContentWidth: number | undefined = undefined; // Store actual content width for gate calculation
    chevronAngle: number = NaN; // current display angle in degrees (NaN = uninitialized)
    chevronTargetAngle: number = 0; // target angle to animate toward

    constructor(thtEl: HTMLElement) {
        this.thtEl = thtEl;
        this.id = thtEl.id.substring(4, 40);
    }

    setGateStatusWithoutOverridingMore(gate: Relation, status: GateStatus) {
        switch(gate) {
            case Relation.Child:
                if(this.childGate == GateStatus.More) {
                    return;
                }
                this.childGate = status;
                break;
            case Relation.Parent:
                if(this.parentGate == GateStatus.More) {
                    return;
                }
                this.parentGate = status;
                break;
            case Relation.Jump:
                if(this.jumpGate == GateStatus.More) {
                    return;
                }
                this.jumpGate = status;
                break;
        }
    }
}
