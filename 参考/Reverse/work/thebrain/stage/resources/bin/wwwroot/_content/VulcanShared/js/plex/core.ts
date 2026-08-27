export enum Relation {
    Unknown = 0,
    Child = 1,
    Parent = 2,
    Jump = 3,
}

export class RelationHelper {
    static getOpposite(relation: Relation): Relation {
        if(relation === Relation.Child) {
            return Relation.Parent;
        } else if(relation === Relation.Parent) {
            return Relation.Child;
        }
        return relation;
    }
}
