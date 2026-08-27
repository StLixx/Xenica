export var Relation;
(function (Relation) {
    Relation[Relation["Unknown"] = 0] = "Unknown";
    Relation[Relation["Child"] = 1] = "Child";
    Relation[Relation["Parent"] = 2] = "Parent";
    Relation[Relation["Jump"] = 3] = "Jump";
})(Relation || (Relation = {}));
export class RelationHelper {
    static getOpposite(relation) {
        if (relation === Relation.Child) {
            return Relation.Parent;
        }
        else if (relation === Relation.Parent) {
            return Relation.Child;
        }
        return relation;
    }
}
//# sourceMappingURL=core.js.map