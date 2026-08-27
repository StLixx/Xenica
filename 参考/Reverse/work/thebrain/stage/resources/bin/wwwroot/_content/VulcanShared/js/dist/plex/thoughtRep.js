import { Relation } from "./core.js";
import { GateStatus, ThoughtExpandDirection, ThoughtHorizontalAlignment } from "./enums.js";
export class ThoughtRep {
    constructor(thtEl) {
        this.alignment = ThoughtHorizontalAlignment.Center;
        this.expandDirection = ThoughtExpandDirection.Undefined;
        this.childGate = GateStatus.Empty;
        this.parentGate = GateStatus.Empty;
        this.jumpGate = GateStatus.Empty;
        this.generation = -1;
        this.isListRep = false;
        this.zone = null;
        this.actualContentWidth = undefined;
        this.chevronAngle = NaN;
        this.chevronTargetAngle = 0;
        this.thtEl = thtEl;
        this.id = thtEl.id.substring(4, 40);
    }
    setGateStatusWithoutOverridingMore(gate, status) {
        switch (gate) {
            case Relation.Child:
                if (this.childGate == GateStatus.More) {
                    return;
                }
                this.childGate = status;
                break;
            case Relation.Parent:
                if (this.parentGate == GateStatus.More) {
                    return;
                }
                this.parentGate = status;
                break;
            case Relation.Jump:
                if (this.jumpGate == GateStatus.More) {
                    return;
                }
                this.jumpGate = status;
                break;
        }
    }
}
//# sourceMappingURL=thoughtRep.js.map