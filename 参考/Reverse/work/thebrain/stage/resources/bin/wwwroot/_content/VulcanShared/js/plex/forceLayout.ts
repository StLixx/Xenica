import { Relation, RelationHelper } from "./core.js"
// @ts-ignore
import { Point, Rect, Collider, LineCollider, CubicCollider, PI } from "/_content/Venus/js/dist/geometry.js"
import { Quadtree } from './quadtree-ts/Quadtree.js';
import { Rectangle } from './quadtree-ts/Rectangle.js';
import { Circle } from './quadtree-ts/Circle.js';

class Node {
    id: string;
    
    // location for purposes of calculating physics 
    pt: Point = new Point(0, 0);
    
    // separate location of where the node was last shown - for display damping
    outputPt: Point | undefined;
    
    vel: Point = new Point(0, 0);
    acc: Point = new Point(0, 0);
    isAnchoredPermanently = false;
    isAnchoredTemporarily = false;
    mass: number = 1;
    
    droneLinksCount = 0;
    nonDroneLinksCount = 0;
    
    colWidth: number;
    rowHeight: number;
    
    // if pilotNode is set, this node is a drone that will be ignored in calculations and get its position set based on the pilotNode
    private pilotNode: Node | undefined;
    private droneNodes: Node[] | undefined;

    links: string[] = [];

    constructor(id: string, colWidth: number, rowHeight: number) {
        this.id = id;
        this.colWidth = colWidth;
        this.rowHeight = rowHeight;
    }

    isAnchored(): boolean {
        return this.isAnchoredPermanently || this.isAnchoredTemporarily;
    }

    addLink(id: string, rel: Relation, properties: string) {
        this.links.push(id+"|"+rel+"|"+properties);
    }
    
    getLinksSignature(nodeMap: { [key: string]: Node }): string {
        return this.links.sort().join("-");
    }

    calculateNodeData(nodeMap: { [key: string]: Node }) {
        // this is called whenever the number of links is changed - calculate stuff that can be saved so it doesn't need to be recalculated over and over
        this.droneLinksCount = this.countDroneLinks(nodeMap);
        this.nonDroneLinksCount = this.links.length - this.droneLinksCount;
        this.mass = ForceLayout.massBase + this.nonDroneLinksCount * ForceLayout.massLinkMultiplier;
    }

    reset() {
        this.links = [];
    }
    
    addDrone(node: Node) {
        if(!this.droneNodes) {
            this.droneNodes = [];
        }
        this.droneNodes.push(node);
    }
    
    removeDrone(node: Node) {
        if(!this.droneNodes) {
            return;
        }
        const index = this.droneNodes.indexOf(node, 0);
        if(index > -1) {
            this.droneNodes.splice(index, 1);
        }
        if(this.droneNodes.length == 0) {
            this.droneNodes = undefined;
        }
    }
    
    applyForce(f: Point) {
        this.acc = this.acc.add(f.divide(this.mass));
    }

    resetPilotData() {
        this.pilotNode = undefined;
        this.droneNodes = undefined;
    }

    assignPilot(pilot: Node | undefined) {
        if(this.pilotNode != undefined) {
            this.pilotNode.removeDrone(this);
        }
        this.pilotNode = pilot;
        if(pilot != undefined) {
            pilot.addDrone(this);
        }
    }

    isDrone(): boolean {
        return this.pilotNode != undefined;
    }
    
    isPilot(): boolean {
        return this.droneNodes != undefined;
    }
    
    isPartOfCluster(): boolean {
        return this.isDrone() || this.isPilot();
    }

    getPilot(): Node {
        if(this.isPilot()) {
            return this;
        }
        console.assert(this.pilotNode != undefined)
        return this.pilotNode!;
    }

    freeDrones() {
        if(this.droneNodes == undefined) {
            return;
        }
        // other nodes are drones of this pilot, assign them a new pilot
        // do not call assignPilot because that change the array as we are iterating over it
        let newPilot: Node | undefined;
        this.droneNodes.forEach((oNode) => {
            if(!newPilot) {
                newPilot = oNode;
                newPilot.pt.x = this.pt.x;
                newPilot.pt.y = this.pt.y;
                newPilot.pilotNode = undefined;
            } else {
                oNode.pilotNode = newPilot;
                newPilot.addDrone(oNode);
            }
        });
        this.droneNodes = undefined;
    }
    
    getDroneCount() {
        console.assert(this.droneNodes != undefined);
        return this.droneNodes!.length + 1;
    }
    
    getDroneNum(drone: Node) {
        console.assert(this.droneNodes != undefined);
        if(drone == this) {
            return 0;
        }
        return this.droneNodes!.indexOf(drone) + 1;
    }
    
    updateOutputPoint(displayDamping: number) {
        let point = this.getPointAccountingForClusters();
        if(!this.outputPt) {
            this.outputPt = point;
        } else {
            this.outputPt = this.outputPt.moveToward(point, displayDamping); 
        }
    }
    
    getDisplayPoint(): Point {
        return this.outputPt!;
    }

    getPointAccountingForClusters(): Point {
        if(!this.isPartOfCluster()) {
            return this.pt;
        }
        let pilot = this.getPilot();
        let droneCount = pilot.getDroneCount();
        let droneNum = pilot.getDroneNum(this);
        
        let maxRowCount = Math.ceil(Math.sqrt(droneCount)) * 2;
        let colCount = Math.ceil(droneCount / maxRowCount);
        if(colCount === 1 && droneCount >= 4) {
            // special rule to avoid single columns of more than 3
            colCount++;
        }
        let rowCount = Math.ceil(droneCount / colCount);
        
        let col = Math.floor(droneNum / rowCount);
        let row = droneNum % rowCount;
        let result = new Point(pilot.pt.x, pilot.pt.y);
        result.x += col * this.colWidth;
        result.y += row * this.rowHeight;
        return result;
    }

    getRect(isForDisplay: boolean): Rect {
        if(!this.isPartOfCluster()) {
            let pt = isForDisplay ? this.outputPt! : this.pt;
            return new Rect(pt.x - this.colWidth * 0.5 - ForceLayout.NORMAL_X_PADDING, pt.y - this.rowHeight * 0.45 - ForceLayout.NORMAL_Y_PADDING, this.colWidth + ForceLayout.NORMAL_X_PADDING * 2, this.rowHeight + ForceLayout.NORMAL_Y_PADDING * 2);
        }
        let pilot = this.getPilot();
        let pt = isForDisplay ? pilot.outputPt! : pilot.pt;
        let droneCount = pilot.getDroneCount();

        let maxRowCount = Math.ceil(Math.sqrt(droneCount)) * 2;
        let colCount = Math.ceil(droneCount / maxRowCount);
        if(colCount === 1 && droneCount >= 4) {
            // special rule to avoid single columns of more than 3
            colCount++;
        }
        let rowCount = Math.ceil(droneCount / colCount);
        return new Rect(pt.x - this.colWidth * 0.5 - ForceLayout.CLUSTER_X_PADDING, pt.y - this.rowHeight * 0.45 - ForceLayout.CLUSTER_Y_PADDING, this.colWidth * colCount + ForceLayout.CLUSTER_X_PADDING * 2, this.rowHeight * rowCount + ForceLayout.CLUSTER_Y_PADDING * 2);
    }
    
    private countDroneLinks(nodeMap: { [key: string]: Node }): number {
        let count = 0;
        this.links.forEach((linkInfo) => {
            let nodeId = linkInfo.substring(0, 36);
            let node = nodeMap[nodeId];
            if(node && node.isDrone()) {
                count++;
            }
        })
        return count;
    }
}

class Edge {
    id: string;
    node1: Node;
    node2: Node;
    
    rel: Relation;
    
    //length = 200;
    
    constructor(id: string, node1: Node, node2: Node, rel: Relation) {
        this.id = id;
        this.node1 = node1;
        this.node2 = node2;
        this.rel = rel;
    }
}

export class ForceLayout {

    nodes: { [key: string]: Node } = {};
    edges: { [key: string]: Edge } = {};

    activeId: string | undefined;
    pressedNodeId: string | undefined;
    
    previousNodes: { [key: string]: Node } = {};

    rect: Rect = new Rect(0, 0, 0, 0);

    useUndirectedLayout = false;

    speedMultiplier = 100; // number of physics ticks/frames to process per actual animation frame
    
    repulsionStrength = 4;
    repulsionMinDistance = 10;
    repulsionMaxRange = 800;
    repulsionDistanceDivisor = 5000; // higher number makes distances less effective at lowering repulsion

    static NORMAL_X_PADDING = 10;
    static NORMAL_Y_PADDING = 5;
    static CLUSTER_X_PADDING = 20;
    static CLUSTER_Y_PADDING = 10;
    
    // repulsionAdjustment is used to ensure that at the max distance the repulsion force will be zero
    // this is so the use of the quadtree does not result in an abrupt change of forces
    maxDistanceFactor = (this.repulsionMinDistance + this.repulsionMaxRange) / this.repulsionDistanceDivisor;
    repulsionAdjustment = this.repulsionStrength / (this.maxDistanceFactor * this.maxDistanceFactor);
    
    springStrength = 500;
    edgeLength = 360;
    edgeLengthDroneCountFactor = 50; // specifies how much longer should edges get per the square root of the drone links on the nodes involved
    edgeLengthLiveCountFactor = 20; // specifies how much longer should edges get per additional link on the non-drone nodes involved
    rotationalForce = 0.75;
    activeNodeRotationForceModifier = 1.5;
    centeringForce = 0.05;
    gatherNodesForce = 800;
    maxSpeed = 5000;
    static massBase = 0;
    static massLinkMultiplier = 1; // lower number makes all forces stronger
    
    // damping is applied to velocity each tick - this is essentially friction 
    initialDamping = 0.95;
    // damping increases over time
    ellapsedTime = 0;
    dampingTimeFactor = 0.25; // higher number make damping take longer to decrease
    
    // Once this amount of time has passed, the active thought will be fixed in place
    // and gathering of thoughts toward a central point will start. These must both
    // happen at the same time because gethering toward a central point without fixing
    // anything results in everything flying off in one direction. Should not start
    // immediately because forces settle into a stable layout faster if nothing is fixed
    timeUntilFixingActiveThought = 0.05;

    // display damping is used to allow the model to get ahead of the display so
    // what may have been a circuitous route appears more direct - this enables
    // the physics to be more intense while keeping the display calm
    displayDamping = 0.001;
    // make nodes move faster when connected to something that is being dragged
    displayDampingWhilePressed = 0.003;

    damping: number;
    
    colWidth: number;
    rowHeight: number;

    lastLiveNodeCount: number = 0;

    getInitialNodePointCallback: ((id: string) => Point | undefined) | undefined;

    isBackgroundDragged: boolean = false;

    private isGatherNodesEnabled: boolean = true;
    
    constructor(getInitialNodePointCallback: ((id: string) => Point| undefined) | undefined, colWidth: number, rowHeight: number) {
        this.colWidth = colWidth;
        this.rowHeight = rowHeight;
        this.damping = this.initialDamping;
        this.getInitialNodePointCallback = getInitialNodePointCallback;
    }
    
    public setRowHeight(rowHeight: number) {
        this.rowHeight = rowHeight;
    }

    public setIsGatherNodesEnabled(val: boolean) {
        this.isGatherNodesEnabled = val;
        this.restartForcesIfNeeded();
    }
    
    public setArea(rect: Rect) {
        this.rect = rect;
    }
    
    public setData(id: string | undefined, links: LinkData[]) {
        if(this.activeId != id) {
            this.activeId = id;
            this.isBackgroundDragged = false;
        }
        this.previousNodes = this.nodes;
        this.clearIsAnchoredTemporarily();
        this.nodes = {};
        this.edges = {};
        this.ensureNodeExists(this.activeId!);
        this.addData(links);
    }
    
    public addData(links: LinkData[]) {
        links.forEach((l) => {
            this.updateNodes(l.id, l.idA, l.idB, l.relation, l.properties);
        })
        this.determinePilotNodes();
        this.updateCalculatedNodeData();
    }
    
    public nodeIsAnchored(id: string): boolean {
        if(id in this.nodes) {
            let node = this.nodes[id];
            if(node.isDrone()) {
                return node.getPilot().isAnchoredPermanently;
            } else {
                return node.isAnchoredPermanently;
            }
        }
        return false;
    }
    
    public toggleNodeIsAnchored(id: string) {
        if(id in this.nodes) {
            let node = this.nodes[id];
            if(node.isDrone()) {
                this.nodes[id].getPilot().isAnchoredPermanently = !this.nodes[id].getPilot().isAnchoredPermanently;
            } else {
                this.nodes[id].isAnchoredPermanently = !this.nodes[id].isAnchoredPermanently;
            }
            this.restartForcesIfNeeded();
        }
    }
    
    determinePilotNodes() {
        // pilot nodes are the first node that shares a common set of links with other nodes
        // those other nodes are ignored in the forces calculation and are placed at the location of the pilot node
        
        // clear all pilot node data
        this.eachNode((node) => {
            node.resetPilotData();
        });

        // generate signatures and flag drone nodes
        let signatures: { [key: string]: Node } = {};
        this.eachNode((node) => {
            let curSig = node.getLinksSignature(this.nodes);
            if(curSig in signatures) {
                node.assignPilot(signatures[curSig])
            } else {
                signatures[curSig] = node;
            }
        });
        
        this.ellapsedTime = 0;
    }

    private updateCalculatedNodeData() {
        this.eachNode((node) => {
            node.calculateNodeData(this.nodes);
        });
    }

    getInitialNodePoint(id: string): Point {
        let fallbackPt = this.rect.getCenter();
        if(this.getInitialNodePointCallback) {
            let pt = this.getInitialNodePointCallback(id);
            if(pt) {
                return pt;
            }
            if(this.activeId) {
                // pick a random location from a circle around the active node
                let activeNode: Node | undefined;
                if(this.activeId in this.nodes) {
                    activeNode = this.nodes[this.activeId];
                } else if(this.activeId in this.previousNodes) {
                    activeNode = this.previousNodes[this.activeId];
                }
                if(activeNode?.outputPt) {
                    fallbackPt = activeNode.outputPt;
                }
            }
        }
        let angle = Math.random() * PI * 2;
        fallbackPt.x += Math.cos(angle) * this.edgeLength * 0.3;
        fallbackPt.y += Math.sin(angle) * this.edgeLength * 0.1;
        return fallbackPt;
    }
    
    ensureNodeExists(nodeId: string) {
        if(!(nodeId in this.nodes)) {
            if(nodeId in this.previousNodes) {
                this.nodes[nodeId] = this.previousNodes[nodeId];
                this.nodes[nodeId].reset();
            } else {
                this.nodes[nodeId] = new Node(nodeId, this.colWidth, this.rowHeight);
                this.nodes[nodeId].pt = this.getInitialNodePoint(nodeId);
            }
        }
    }
    
    public updateNodes(linkId: string, idA: string, idB: string, relation: Relation, properties: string) {
        this.ensureNodeExists(idA);
        this.ensureNodeExists(idB);
        
        // create the link signature so we can group nodes with the same set of links as one unit
        this.nodes[idA].addLink(idB, relation, properties);
        this.nodes[idB].addLink(idA, RelationHelper.getOpposite(relation), properties);
        
        this.edges[linkId] = new Edge(linkId, this.nodes[idA], this.nodes[idB], relation);
    }

    applyCoulombsLawUsingQuadtree() {
        
        // to avoid running calculations of nodes.length^2, utilize a Quadtree
        
        let quadtree = new Quadtree({
            width: this.rect.width,
            height: this.rect.height,
            maxObjects: 10,
            maxLevels: 4,
        });

        let count = 0;

        // populate with all nodes
        this.eachLiveNode((node) => {
            let rect = node.getRect(false);
            quadtree.insert(new Rectangle({
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height,
                data: node.id,
            }));
            count++;
        });
        
        let processedNodes = new Set();
        
        // repulse nodes away from each other
        this.eachLiveNode((node1) => {
            let rect = node1.getRect(false);
            let cen = rect.getCenter();
            let radius = Math.max(rect.width, rect.height) + this.repulsionMaxRange;
            let quadResults = quadtree.retrieve(new Circle({
                x: cen.x,
                y: cen.y,
                r: radius,
            }));
            processedNodes.add(node1.id);
            quadResults.forEach((result) => {
                let id = (result as Rectangle<string>).data as string;
                if(processedNodes.has(id)) {
                    // do not compare to itself nor to any node that we already went through
                    return;
                }
                if(id in this.nodes) {
                    let node2 = this.nodes[id];
                    
                    if(node1.isAnchored() && node2.isAnchored()) {
                        return;
                    }
                    
                    let distance = node1.getRect(false).calcDistance(node2.getRect(false));
                    let distanceFactor = (distance + this.repulsionMinDistance) / this.repulsionDistanceDivisor;
                    let force = Math.max(this.repulsionStrength / (distanceFactor * distanceFactor) - this.repulsionAdjustment, 0);

                    let d = node1.pt.subtract(node2.pt);
                    let direction = d.normalise();

                    // apply force to each end point - double on one side if the other side is fixed
                    if(node1.isAnchored()) {
                        node2.applyForce(direction.multiply(-force * 2));
                    } else if(node2.isAnchored()) {
                        node1.applyForce(direction.multiply(force * 2));
                    } else {
                        node1.applyForce(direction.multiply(force));
                        node2.applyForce(direction.multiply(-force));
                    }
                }
            });
        });

    }
    
    applyHookesLaw() {
        // Based on math from https://github.com/dhotson/springy/tree/9654b64f85f7f35220eaafee80894d33a00ef5ac
        // move nodes a specified distance away from each other
        // the amount of force is proportional to the amount of the distance from the ideal distance
        this.eachLiveEdge((edge) => {
            let d = edge.node2.pt.subtract(edge.node1.pt); // the direction of the spring
            let length = this.edgeLength; // edge.length
            
            let displacement = (length + this.getExtraLength(edge.node1, edge.node2)) - d.magnitude();
            let direction = d.normalise();

            // apply force to each end point
            let d1 = direction.multiply(this.springStrength * displacement * -0.5);
            let d2 = direction.multiply(this.springStrength * displacement * 0.5);
            edge.node1.applyForce(d1);
            edge.node2.applyForce(d2);
        });
    }
    
    getBadFastSquareRoot(num: number): number {
        for(let n = 1; true; n++) {
            if((n+1) * (n+1) > num) {
                return n;
            }
        }
    }
    
    getExtraLength(node1: Node, node2: Node): number {
        // adjust length depending on how many edges the nodes have
        let extraLength = 0;
        extraLength += this.getBadFastSquareRoot(node1.droneLinksCount + node2.droneLinksCount) * this.edgeLengthDroneCountFactor;
        extraLength += (node1.nonDroneLinksCount + node2.nonDroneLinksCount - 2) * this.edgeLengthLiveCountFactor;
        return extraLength;
    }

    applyRotationalForces() {
        
        // rotate the two nodes about the center of the link attempting to align with the ideal angle
        // the amount of force is proportional to the amount of the distance from the ideal angle
        this.eachLiveEdge((edge) => {
            if(edge.rel == Relation.Unknown || edge.node1.isAnchored() && edge.node2.isAnchored()) {
                return;
            }

            let d = edge.node2.pt.subtract(edge.node1.pt); // the current direction
            let angle = Math.atan2(d.y, d.x);
            
            // pick the ideal angle in radians based on the relationship type
            let idealAngle = 0;
            switch(edge.rel) {
                case Relation.Child:
                    if(edge.node1.id == this.activeId || edge.node2.id == this.activeId) {
                        // bias active thought to the left
                        idealAngle = PI * 0.65;
                    } else {
                        // bias sibling thoughts to the right
                        idealAngle = PI * 0.35;
                    }
                    break;
                case Relation.Parent:
                    if(edge.node1.id == this.activeId || edge.node2.id == this.activeId) {
                        idealAngle = PI * -0.35;
                    } else {
                        // preference to the left side instead of directly above
                        idealAngle = PI * -0.65;
                    }
                    break;
                case Relation.Jump:
                    // jump
                    if(edge.node1.id == this.activeId) {
                        idealAngle = PI;
                    } else if(edge.node2.id == this.activeId) {
                        idealAngle = 0;
                    } else {
                        // prefer whichever side we are already one
                        if(angle > -PI / 2 && angle < PI / 2) {
                            idealAngle = 0;
                        } else {
                            idealAngle = PI;
                        }
                    }
                    break;
            }
            if(Math.abs(idealAngle - angle) > PI) {
                // avoid wrapping around the long way
                if(idealAngle < angle) {
                    idealAngle += PI * 2;
                } else {
                    idealAngle -= PI * 2;
                }
            }

            let targetAngle = idealAngle;
            let percentageFromIdeal = Math.abs(idealAngle - angle) * 100 / PI;
            if(percentageFromIdeal > 50) {
                // do not rotate more than 90 degrees at a time - this is to avoid passing nodes directly through each other
                let deltaAngle = idealAngle - angle;
                if(deltaAngle < 0) {
                    targetAngle = angle - PI / 2;
                } else {
                    targetAngle = angle + PI / 2;
                }
            }

            // find the center between the nodes, then rotate around that point to determine target points for each node
            let cen = edge.node1.pt.add(edge.node2.pt).divide(2);
            let dist = (this.edgeLength + this.getExtraLength(edge.node1, edge.node2)) / 2;
            let node1TargetPt = cen.add(new Point(Math.cos(targetAngle+PI) * dist, Math.sin(targetAngle+PI) * dist));
            let node2TargetPt = cen.add(new Point(Math.cos(targetAngle) * dist, Math.sin(targetAngle * dist)));

            let node1Dir = edge.node1.pt.subtract(node1TargetPt).multiply(-1);
            let node2Dir = edge.node2.pt.subtract(node2TargetPt).multiply(-1);
            
            // total x values and total y values must add up to zero or we will be pushing the graph
            let sumDir = node1Dir.add(node2Dir);
            node1Dir = node1Dir.subtract(sumDir.divide(2));
            node2Dir = node2Dir.subtract(sumDir.divide(2));

            let mod = (percentageFromIdeal + 50) * 0.2;
            let forceFactor = this.rotationalForce * mod * mod;
            if(edge.node1.id == this.activeId || edge.node2.id == this.activeId) {
                forceFactor *= this.activeNodeRotationForceModifier;
            }
            if(edge.node1.isAnchored()) {
                edge.node2.applyForce(node2Dir.multiply(forceFactor * 2));
            } else if(edge.node2.isAnchored()) {
                edge.node1.applyForce(node1Dir.multiply(forceFactor * 2));
                
            } else {
                edge.node1.applyForce(node1Dir.multiply(forceFactor));
                edge.node2.applyForce(node2Dir.multiply(forceFactor));
            }
        });
    }
    
    getExtents(): Rect {
        // find extents of all nodes
        let minX: number = 0;
        let minY: number = 0;
        let maxX: number = 0;
        let maxY: number = 0;
        let first = true;
        this.eachLiveNode((node) => {
            let rect = node.getRect(false);
            if(first) {
                minX = rect.x;
                maxX = rect.right();
                minY = rect.y;
                maxY = rect.bottom();
                first = false;
            } else {
                minX = Math.min(rect.x, minX);
                minY = Math.min(rect.y, minY);
                maxX = Math.max(rect.right(), maxX);
                maxY = Math.max(rect.bottom(), maxY);
            }
        });
        return new Rect(minX, minY, maxX - minX, maxY - minY);
    }
    
    gatherNodesToward(pt: Point) {
        // as the number of live nodes increases, the gather force decreases
        let gatherForceModifier = this.getBadFastSquareRoot(this.lastLiveNodeCount * this.lastLiveNodeCount * 0.3);
        let gatherForce = Math.min(100, this.gatherNodesForce / gatherForceModifier);
        this.eachLiveNode((node) => {
            let direction = node.getRect(false).getCenter().subtract(pt).multiply(-1.0);
            node.applyForce(direction.multiply(gatherForce));
        });
    }
    
    eachLiveNode(fn: (node: Node) => void) {
        this.lastLiveNodeCount = 0;
        this.eachNode((node) => {
            if(!node.isDrone()) {
                fn(node);
                this.lastLiveNodeCount++;
            }
        });
    }
    
    eachLiveEdge(fn: (edge: Edge) => void) {
        this.eachEdge((edge) => {
           if(!edge.node1.isDrone() && !edge.node2.isDrone()) {
               fn(edge);
           } 
        });
    }

    eachNode(fn: (node: Node) => void) {
        Object.values(this.nodes).forEach((node) => {
            fn(node);
        });
    }
    
    eachEdge(fn: (edge: Edge) => void) {
        Object.values(this.edges).forEach((edge) => {
            fn(edge);
        });
    }
    
    getActiveNode(): Node | null {
        if(!this.activeId) {
            return null;
        }
        let activeNode = this.nodes[this.activeId];
        return activeNode;
    }
    
    public tick(delta: number) {
        
        // increase damping over time so graph can move quickly at first and will always settle to a fixed position
        this.ellapsedTime += delta;
        let x = Math.max(0, 1 - this.ellapsedTime * this.dampingTimeFactor);
        this.damping = this.initialDamping * x;

        if(this.ellapsedTime > this.timeUntilFixingActiveThought) {
            // fix the active node in place so if user drags another node it has some effect (other than making everything else move to follow it)
            let activeNode = this.getActiveNode();
            if(activeNode) {
                activeNode.isAnchoredTemporarily = true;
            }
        }

        let start = Date.now();
        for(let n = 0; n < this.speedMultiplier; n++) {
            this.processTick(delta);
            let elapsed = Date.now() - start;
            if(elapsed > 20) {
                // console.log("ForceLayout stopped to render after " + n + " rounds");
                return;
            }
        }
    }

    private processTick(delta: number) {

        // Calculate forces

        // repulsion
        this.applyCoulombsLawUsingQuadtree();
        
        // attraction
        // to use an undirected layout, call applyHookesLaw instead of applyRotationalForces
        if(this.useUndirectedLayout) {
            this.applyHookesLaw();
        } else {
            this.applyRotationalForces();
        }
        
        let extentsRect = this.getExtents();
        let extentsCen = extentsRect.getCenter();
        if(!this.pressedNodeId && !this.isBackgroundDragged) {
            // pull everything by the same amount toward the center
            let rectCen = this.rect.getCenter();
            let direction = extentsCen.subtract(rectCen).multiply(-1.0);
            this.eachLiveNode((node) => {
                node.pt = node.pt.add(direction.multiply(this.centeringForce));
            });
        }
        if(this.isGatherNodesEnabled && this.ellapsedTime > this.timeUntilFixingActiveThought) {
            let activeNode = this.getActiveNode();
            if(activeNode) {
                this.gatherNodesToward(activeNode.pt);
            }
        }

        // Update velocities
        this.eachLiveNode((node) => {
            node.vel = node.vel.add(node.acc.multiply(delta)).multiply(this.damping);
            if(node.vel.magnitude() > this.maxSpeed) {
                node.vel = node.vel.normalise().multiply(this.maxSpeed);
            }
            node.acc = new Point(0, 0);
        });
        
        // Update positions
        this.eachLiveNode((node) => {
            if(node.isAnchored()) {
                return;
            }
            node.pt = node.pt.add(node.vel.multiply(delta))
        });
        
        let nodesToMoveFaster = this.getNodesConnectedToPressedNodes();
        
        // Set output position (apply display damping)
        this.eachNode((node) => {
            node.updateOutputPoint(nodesToMoveFaster.has(node.id) ? this.displayDampingWhilePressed : this.displayDamping);
        })
    }
    
    getNodesConnectedToPressedNodes(): Set<string> {
        let set = new Set<string>();
        if(!this.pressedNodeId) {
            return set;
        }
        set.add(this.pressedNodeId);
        let pressedNode = this.nodes[this.pressedNodeId];
        if(pressedNode) {
            // check if a connected node is being dragged
            pressedNode.links.forEach((linkInfo) => {
                let nodeId = linkInfo.substring(0, 36);
                set.add(nodeId);
            });
        }
        return set;
    }

    public getNodePoint(id: string): Point | undefined {
        let node = this.nodes[id];
        if(node) {
            return node.getDisplayPoint();
        } else {
            return undefined;
        }
    }

    public nodeDragged(id: string, newCen: Point, hasDragExceededClickDistance: boolean) {
        let node = this.nodes[id];
        if(node) {
            node.pt = newCen;
            node.outputPt = newCen;
            if(hasDragExceededClickDistance) {
                node.isAnchoredPermanently = true;
                if(node.isDrone()) {
                    node.assignPilot(undefined);
                } else {
                    node.freeDrones();
                }
            }
            this.restartForcesIfNeeded();
        }
    }
    
    restartForcesIfNeeded() {
        this.ellapsedTime = Math.min(this.ellapsedTime, 2);
    }

    public nodePressed(id: string) {
        this.pressedNodeId = id;
    }

    public nodeReleased(id: string) {
        this.pressedNodeId = undefined;
    }
    
    reset() {
        // call this to make sure that animation does not assume we are already in the last viewed force layout
        this.previousNodes = {};
        this.nodes = {};
        this.edges = {};
        this.isBackgroundDragged = false;
    }

    public backgroundDragged(deltaPoint: Point, hasDragExceededClickDistance: boolean) {
        this.isBackgroundDragged = this.isBackgroundDragged || hasDragExceededClickDistance;
        this.eachNode((node) => {
            node.pt = node.pt.add(deltaPoint);
            if(node.outputPt) {
                node.outputPt = node.outputPt.add(deltaPoint)
            }
        });
    }

    public isDrone(nodeId: string): boolean {
        let node = this.nodes[nodeId];
        return node?.isDrone();
    }
    
    public isPilot(nodeId: string): boolean {
        let node = this.nodes[nodeId];
        return node?.isPilot();
    }

    public getPilot(nodeId: string): Node | undefined {
        let node = this.nodes[nodeId];
        return node?.getPilot();
    }

    public getNodeRect(nodeId: string): Rect {
        let node = this.nodes[nodeId];
        return node?.getRect(true);
    }

    private clearIsAnchoredTemporarily() {
        Object.values(this.nodes).forEach((node) => {
            node.isAnchoredTemporarily = false;
        });
    }
}

export class LinkData {
    id: string;
    idA: string;
    idB: string;
    relation: Relation;
    properties: string;
    constructor(id: string, idA: string, idB: string, relation: Relation, properties: string) {
        this.id = id;
        this.idA = idA;
        this.idB = idB;
        this.relation = relation;
        this.properties = properties;
    }
}
