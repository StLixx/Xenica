export var LayoutType;
(function (LayoutType) {
    LayoutType[LayoutType["Undefined"] = 0] = "Undefined";
    LayoutType[LayoutType["Normal"] = 1] = "Normal";
    LayoutType[LayoutType["NormalPlusOne"] = 2] = "NormalPlusOne";
    LayoutType[LayoutType["Outline"] = 3] = "Outline";
    LayoutType[LayoutType["Mindmap"] = 4] = "Mindmap";
    LayoutType[LayoutType["Force"] = 5] = "Force";
})(LayoutType || (LayoutType = {}));
export var GateStatus;
(function (GateStatus) {
    GateStatus[GateStatus["Empty"] = 0] = "Empty";
    GateStatus[GateStatus["Full"] = 1] = "Full";
    GateStatus[GateStatus["More"] = 2] = "More";
})(GateStatus || (GateStatus = {}));
export var ThoughtControl;
(function (ThoughtControl) {
    ThoughtControl[ThoughtControl["Undefined"] = 0] = "Undefined";
    ThoughtControl[ThoughtControl["Expand"] = 1] = "Expand";
    ThoughtControl[ThoughtControl["Collapse"] = 2] = "Collapse";
    ThoughtControl[ThoughtControl["Anchor"] = 3] = "Anchor";
    ThoughtControl[ThoughtControl["Chevron"] = 4] = "Chevron";
})(ThoughtControl || (ThoughtControl = {}));
export var ThoughtHorizontalAlignment;
(function (ThoughtHorizontalAlignment) {
    ThoughtHorizontalAlignment[ThoughtHorizontalAlignment["Center"] = 0] = "Center";
    ThoughtHorizontalAlignment[ThoughtHorizontalAlignment["Left"] = 1] = "Left";
    ThoughtHorizontalAlignment[ThoughtHorizontalAlignment["Right"] = 2] = "Right";
})(ThoughtHorizontalAlignment || (ThoughtHorizontalAlignment = {}));
export var ThoughtExpandDirection;
(function (ThoughtExpandDirection) {
    ThoughtExpandDirection[ThoughtExpandDirection["Undefined"] = 0] = "Undefined";
    ThoughtExpandDirection[ThoughtExpandDirection["Parent"] = 1] = "Parent";
    ThoughtExpandDirection[ThoughtExpandDirection["Child"] = 2] = "Child";
    ThoughtExpandDirection[ThoughtExpandDirection["ChildLeft"] = 3] = "ChildLeft";
    ThoughtExpandDirection[ThoughtExpandDirection["Jump"] = 4] = "Jump";
})(ThoughtExpandDirection || (ThoughtExpandDirection = {}));
export var PlexLayout;
(function (PlexLayout) {
    PlexLayout[PlexLayout["Undefined"] = 0] = "Undefined";
    PlexLayout[PlexLayout["Normal"] = 1] = "Normal";
    PlexLayout[PlexLayout["NormalPlusOne"] = 2] = "NormalPlusOne";
    PlexLayout[PlexLayout["Outline"] = 3] = "Outline";
    PlexLayout[PlexLayout["Mindmap"] = 4] = "Mindmap";
    PlexLayout[PlexLayout["Force"] = 5] = "Force";
})(PlexLayout || (PlexLayout = {}));
export var LinkDirection;
(function (LinkDirection) {
    LinkDirection[LinkDirection["Undefined"] = -1] = "Undefined";
    LinkDirection[LinkDirection["OneWay"] = 4] = "OneWay";
    LinkDirection[LinkDirection["DirectionBA"] = 2] = "DirectionBA";
    LinkDirection[LinkDirection["IsDirected"] = 1] = "IsDirected";
})(LinkDirection || (LinkDirection = {}));
export var LinkMeaning;
(function (LinkMeaning) {
    LinkMeaning[LinkMeaning["Undefined"] = 0] = "Undefined";
    LinkMeaning[LinkMeaning["Normal"] = 1] = "Normal";
    LinkMeaning[LinkMeaning["InstanceOf"] = 2] = "InstanceOf";
    LinkMeaning[LinkMeaning["TypeOf"] = 3] = "TypeOf";
    LinkMeaning[LinkMeaning["HasEvent"] = 4] = "HasEvent";
    LinkMeaning[LinkMeaning["HasTag"] = 5] = "HasTag";
    LinkMeaning[LinkMeaning["System"] = 6] = "System";
    LinkMeaning[LinkMeaning["SubTagOf"] = 7] = "SubTagOf";
})(LinkMeaning || (LinkMeaning = {}));
export var PlexObjectType;
(function (PlexObjectType) {
    PlexObjectType[PlexObjectType["Nothing"] = 0] = "Nothing";
    PlexObjectType[PlexObjectType["Background"] = 1] = "Background";
    PlexObjectType[PlexObjectType["Scrollbar"] = 2] = "Scrollbar";
    PlexObjectType[PlexObjectType["Thought"] = 3] = "Thought";
    PlexObjectType[PlexObjectType["ThoughtIcon"] = 4] = "ThoughtIcon";
    PlexObjectType[PlexObjectType["ThoughtGate"] = 5] = "ThoughtGate";
    PlexObjectType[PlexObjectType["Link"] = 6] = "Link";
    PlexObjectType[PlexObjectType["ThoughtDecorator"] = 7] = "ThoughtDecorator";
    PlexObjectType[PlexObjectType["ThoughtControl"] = 8] = "ThoughtControl";
})(PlexObjectType || (PlexObjectType = {}));
//# sourceMappingURL=enums.js.map