// @ts-ignore
import {Collider, CubicCollider, LineCollider, PI, Point, Rect} from "/_content/Venus/js/dist/geometry.js"
import {LayoutNode} from "./layoutNode.js";
import {Scrollbar} from "./scrollbar.js";
import {ThoughtHorizontalAlignment} from "./enums.js";
import {ThoughtRep} from "./thoughtRep.js"; 
import {OneZoneRange} from "./zoneRanges.js";

export interface PlexConnector {
    dotNetHelper: any;
    zoneScrollbars: { [key: string]: Scrollbar | null};

    nodeChildrenIds: Set<string>;
    nodeParentsIds: Set<string>;
    nodeJumpsIds: Set<string>;
    nodeSiblingsIds: Set<string>;

    nodeParentsOf: Map<string, string[]>;
    nodeChildrenOf: Map<string, string[]>;
    nodeJumpsOf: Map<string, string[]>;
    
    parentZoneRangesCache: Map<string, OneZoneRange>;
    childrenZoneRangesCache: Map<string, OneZoneRange>;
    jumpsZoneRangesCache: Map<string, OneZoneRange>;
    siblingZoneRangesCache: Map<string, OneZoneRange>;
    setZoneRangeForZone(zone: string, start: number, end: number): void;
    setCountForZone(zone: string, count: number): void;

    getOneZoneRangeForZone(zone: string): OneZoneRange;
    
    lastSiblingScrollDirection: number;
    lastParentScrollDirection: number;
    lastChildScrollDirection: number;
    lastJumpScrollDirection: number;
    
    scrollDirStr: string; // scroll direction string, e.g. "up", "down", "left", "right"
    scrolledZone: string; // scroll zone, e.g. "parent", "child", "jump", "sibling"
    
    normalLayoutZoneToRows: Map<string, number>;
    normalLayoutZoneToColumns: Map<string, number>;

    lastActiveDestX: number | undefined;
    lastActiveDestY: number | undefined;
    lastActiveId: string | undefined;

    lastNormalLayoutThoughtPoints: { [key: string]: Point};
    
    field: HTMLElement;

    markElementAsOffscreen(thtEl: HTMLElement, destPoint: Point | null, isScrollEvent: boolean): void;
    setThoughtDisappearPosition(thtEl: HTMLElement, destPoint: Point | null): void;
    markOffscreenAsCur(zone: string): void;
    setThoughtPosition(point: Point, el: HTMLElement, fontSizePercent :number, isYAtTop: boolean, horizAlign: ThoughtHorizontalAlignment): void;
    backgroundDragged(deltaPoint: Point, hasDragExceededClickDistance: boolean): void;

    logInfo(...args: any[]): void;
    
    thoughtIdSet: Set<string>;

    activeId: string | undefined;
    node: LayoutNode | null;
    thtReps: Map<string, ThoughtRep>;
    rowHeight: number;
    getRowHeightWithSpacing(): number;
    animationTime: number;

    getThoughtElements(selectorString: string, set: Set<string>): HTMLElement[];
    
    isSelectionPanelVisible(): boolean;
    getSelectionPanelWidth(): number;
}
