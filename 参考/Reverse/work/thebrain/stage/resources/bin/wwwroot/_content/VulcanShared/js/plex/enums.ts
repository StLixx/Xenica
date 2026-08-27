// TODO remove this and just use PlexLayout below
export enum LayoutType {
    Undefined = 0,
    Normal = 1,
    NormalPlusOne = 2,
    Outline = 3,
    Mindmap = 4,
    Force = 5,
}

export enum GateStatus {
    Empty,
    Full,
    More, //highlighted
}

export enum ThoughtControl {
    Undefined,
    Expand,
    Collapse,
    Anchor,
    Chevron,
}

export enum ThoughtHorizontalAlignment {
    Center,
    Left,
    Right,
}

export enum ThoughtExpandDirection {
    Undefined,
    Parent,
    Child,
    ChildLeft,
    Jump,
}

// duplicate of TheBrain.Core.Model.PlexLayout. Must keep this updated to match.
export enum PlexLayout {
    Undefined = 0,
    Normal = 1,
    NormalPlusOne = 2,
    Outline = 3,
    Mindmap = 4,
    Force = 5,
}

export enum LinkDirection {
    Undefined = -1,
    // Inherited = 8, // 1xxx, 1 means Inherited - this value was never interpreted properly but may be in the database - all "8"s in the DB should be changed to -1
    OneWay = 4,     // x1xx, 1 means One-Way Link;
    DirectionBA = 2,  // xx1x, 0 means A -> B, 1 means B->A, isBackward
    IsDirected = 1, // xxx1, 1 means Is-Directed; xxx0 means Not-Directed
}

// Copied from CoreEnum.cs
export enum LinkMeaning {
    Undefined = 0,
    Normal = 1,
    InstanceOf = 2, // Type (A) to Normal Thought (B)
    TypeOf = 3, // Super Type (A) to Type (B)
    HasEvent = 4,
    HasTag = 5, // Tag (A) to Normal or Type Thought (B)
    System = 6,
    SubTagOf = 7, // Super Tag (A) to Tag (B)
}

export enum PlexObjectType {
    Nothing,
    Background,
    Scrollbar,
    Thought,
    ThoughtIcon,
    ThoughtGate,
    Link,
    ThoughtDecorator,
    ThoughtControl,
}
