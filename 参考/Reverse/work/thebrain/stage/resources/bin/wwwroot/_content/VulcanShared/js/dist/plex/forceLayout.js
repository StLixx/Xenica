import { Relation, RelationHelper } from "./core.js";
import { Point, Rect, PI } from "/_content/Venus/js/dist/geometry.js";
import { Quadtree } from './quadtree-ts/Quadtree.js';
import { Rectangle } from './quadtree-ts/Rectangle.js';
import { Circle } from './quadtree-ts/Circle.js';
class Node {
    constructor(id, colWidth, rowHeight) {
        this.pt = new Point(0, 0);
        this.vel = new Point(0, 0);
        this.acc = new Point(0, 0);
        this.isAnchoredPermanently = false;
        this.isAnchoredTemporarily = false;
        this.mass = 1;
        this.droneLinksCount = 0;
        this.nonDroneLinksCount = 0;
        this.links = [];
        this.id = id;
        this.colWidth = colWidth;
        this.rowHeight = rowHeight;
    }
    isAnchored() {
        return this.isAnchoredPermanently || this.isAnchoredTemporarily;
    }
    addLink(id, rel, properties) {
        this.links.push(id + "|" + rel + "|" + properties);
    }
    getLinksSignature(nodeMap) {
        return this.links.sort().join("-");
    }
    calculateNodeData(nodeMap) {
        this.droneLinksCount = this.countDroneLinks(nodeMap);
        this.nonDroneLinksCount = this.links.length - this.droneLinksCount;
        this.mass = ForceLayout.massBase + this.nonDroneLinksCount * ForceLayout.massLinkMultiplier;
    }
    reset() {
        this.links = [];
    }
    addDrone(node) {
        if (!this.droneNodes) {
            this.droneNodes = [];
        }
        this.droneNodes.push(node);
    }
    removeDrone(node) {
        if (!this.droneNodes) {
            return;
        }
        const index = this.droneNodes.indexOf(node, 0);
        if (index > -1) {
            this.droneNodes.splice(index, 1);
        }
        if (this.droneNodes.length == 0) {
            this.droneNodes = undefined;
        }
    }
    applyForce(f) {
        this.acc = this.acc.add(f.divide(this.mass));
    }
    resetPilotData() {
        this.pilotNode = undefined;
        this.droneNodes = undefined;
    }
    assignPilot(pilot) {
        if (this.pilotNode != undefined) {
            this.pilotNode.removeDrone(this);
        }
        this.pilotNode = pilot;
        if (pilot != undefined) {
            pilot.addDrone(this);
        }
    }
    isDrone() {
        return this.pilotNode != undefined;
    }
    isPilot() {
        return this.droneNodes != undefined;
    }
    isPartOfCluster() {
        return this.isDrone() || this.isPilot();
    }
    getPilot() {
        if (this.isPilot()) {
            return this;
        }
        console.assert(this.pilotNode != undefined);
        return this.pilotNode;
    }
    freeDrones() {
        if (this.droneNodes == undefined) {
            return;
        }
        let newPilot;
        this.droneNodes.forEach((oNode) => {
            if (!newPilot) {
                newPilot = oNode;
                newPilot.pt.x = this.pt.x;
                newPilot.pt.y = this.pt.y;
                newPilot.pilotNode = undefined;
            }
            else {
                oNode.pilotNode = newPilot;
                newPilot.addDrone(oNode);
            }
        });
        this.droneNodes = undefined;
    }
    getDroneCount() {
        console.assert(this.droneNodes != undefined);
        return this.droneNodes.length + 1;
    }
    getDroneNum(drone) {
        console.assert(this.droneNodes != undefined);
        if (drone == this) {
            return 0;
        }
        return this.droneNodes.indexOf(drone) + 1;
    }
    updateOutputPoint(displayDamping) {
        let point = this.getPointAccountingForClusters();
        if (!this.outputPt) {
            this.outputPt = point;
        }
        else {
            this.outputPt = this.outputPt.moveToward(point, displayDamping);
        }
    }
    getDisplayPoint() {
        return this.outputPt;
    }
    getPointAccountingForClusters() {
        if (!this.isPartOfCluster()) {
            return this.pt;
        }
        let pilot = this.getPilot();
        let droneCount = pilot.getDroneCount();
        let droneNum = pilot.getDroneNum(this);
        let maxRowCount = Math.ceil(Math.sqrt(droneCount)) * 2;
        let colCount = Math.ceil(droneCount / maxRowCount);
        if (colCount === 1 && droneCount >= 4) {
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
    getRect(isForDisplay) {
        if (!this.isPartOfCluster()) {
            let pt = isForDisplay ? this.outputPt : this.pt;
            return new Rect(pt.x - this.colWidth * 0.5 - ForceLayout.NORMAL_X_PADDING, pt.y - this.rowHeight * 0.45 - ForceLayout.NORMAL_Y_PADDING, this.colWidth + ForceLayout.NORMAL_X_PADDING * 2, this.rowHeight + ForceLayout.NORMAL_Y_PADDING * 2);
        }
        let pilot = this.getPilot();
        let pt = isForDisplay ? pilot.outputPt : pilot.pt;
        let droneCount = pilot.getDroneCount();
        let maxRowCount = Math.ceil(Math.sqrt(droneCount)) * 2;
        let colCount = Math.ceil(droneCount / maxRowCount);
        if (colCount === 1 && droneCount >= 4) {
            colCount++;
        }
        let rowCount = Math.ceil(droneCount / colCount);
        return new Rect(pt.x - this.colWidth * 0.5 - ForceLayout.CLUSTER_X_PADDING, pt.y - this.rowHeight * 0.45 - ForceLayout.CLUSTER_Y_PADDING, this.colWidth * colCount + ForceLayout.CLUSTER_X_PADDING * 2, this.rowHeight * rowCount + ForceLayout.CLUSTER_Y_PADDING * 2);
    }
    countDroneLinks(nodeMap) {
        let count = 0;
        this.links.forEach((linkInfo) => {
            let nodeId = linkInfo.substring(0, 36);
            let node = nodeMap[nodeId];
            if (node && node.isDrone()) {
                count++;
            }
        });
        return count;
    }
}
class Edge {
    constructor(id, node1, node2, rel) {
        this.id = id;
        this.node1 = node1;
        this.node2 = node2;
        this.rel = rel;
    }
}
export class ForceLayout {
    constructor(getInitialNodePointCallback, colWidth, rowHeight) {
        this.nodes = {};
        this.edges = {};
        this.previousNodes = {};
        this.rect = new Rect(0, 0, 0, 0);
        this.useUndirectedLayout = false;
        this.speedMultiplier = 100;
        this.repulsionStrength = 4;
        this.repulsionMinDistance = 10;
        this.repulsionMaxRange = 800;
        this.repulsionDistanceDivisor = 5000;
        this.maxDistanceFactor = (this.repulsionMinDistance + this.repulsionMaxRange) / this.repulsionDistanceDivisor;
        this.repulsionAdjustment = this.repulsionStrength / (this.maxDistanceFactor * this.maxDistanceFactor);
        this.springStrength = 500;
        this.edgeLength = 360;
        this.edgeLengthDroneCountFactor = 50;
        this.edgeLengthLiveCountFactor = 20;
        this.rotationalForce = 0.75;
        this.activeNodeRotationForceModifier = 1.5;
        this.centeringForce = 0.05;
        this.gatherNodesForce = 800;
        this.maxSpeed = 5000;
        this.initialDamping = 0.95;
        this.ellapsedTime = 0;
        this.dampingTimeFactor = 0.25;
        this.timeUntilFixingActiveThought = 0.05;
        this.displayDamping = 0.001;
        this.displayDampingWhilePressed = 0.003;
        this.lastLiveNodeCount = 0;
        this.isBackgroundDragged = false;
        this.isGatherNodesEnabled = true;
        this.colWidth = colWidth;
        this.rowHeight = rowHeight;
        this.damping = this.initialDamping;
        this.getInitialNodePointCallback = getInitialNodePointCallback;
    }
    setRowHeight(rowHeight) {
        this.rowHeight = rowHeight;
    }
    setIsGatherNodesEnabled(val) {
        this.isGatherNodesEnabled = val;
        this.restartForcesIfNeeded();
    }
    setArea(rect) {
        this.rect = rect;
    }
    setData(id, links) {
        if (this.activeId != id) {
            this.activeId = id;
            this.isBackgroundDragged = false;
        }
        this.previousNodes = this.nodes;
        this.clearIsAnchoredTemporarily();
        this.nodes = {};
        this.edges = {};
        this.ensureNodeExists(this.activeId);
        this.addData(links);
    }
    addData(links) {
        links.forEach((l) => {
            this.updateNodes(l.id, l.idA, l.idB, l.relation, l.properties);
        });
        this.determinePilotNodes();
        this.updateCalculatedNodeData();
    }
    nodeIsAnchored(id) {
        if (id in this.nodes) {
            let node = this.nodes[id];
            if (node.isDrone()) {
                return node.getPilot().isAnchoredPermanently;
            }
            else {
                return node.isAnchoredPermanently;
            }
        }
        return false;
    }
    toggleNodeIsAnchored(id) {
        if (id in this.nodes) {
            let node = this.nodes[id];
            if (node.isDrone()) {
                this.nodes[id].getPilot().isAnchoredPermanently = !this.nodes[id].getPilot().isAnchoredPermanently;
            }
            else {
                this.nodes[id].isAnchoredPermanently = !this.nodes[id].isAnchoredPermanently;
            }
            this.restartForcesIfNeeded();
        }
    }
    determinePilotNodes() {
        this.eachNode((node) => {
            node.resetPilotData();
        });
        let signatures = {};
        this.eachNode((node) => {
            let curSig = node.getLinksSignature(this.nodes);
            if (curSig in signatures) {
                node.assignPilot(signatures[curSig]);
            }
            else {
                signatures[curSig] = node;
            }
        });
        this.ellapsedTime = 0;
    }
    updateCalculatedNodeData() {
        this.eachNode((node) => {
            node.calculateNodeData(this.nodes);
        });
    }
    getInitialNodePoint(id) {
        let fallbackPt = this.rect.getCenter();
        if (this.getInitialNodePointCallback) {
            let pt = this.getInitialNodePointCallback(id);
            if (pt) {
                return pt;
            }
            if (this.activeId) {
                let activeNode;
                if (this.activeId in this.nodes) {
                    activeNode = this.nodes[this.activeId];
                }
                else if (this.activeId in this.previousNodes) {
                    activeNode = this.previousNodes[this.activeId];
                }
                if (activeNode === null || activeNode === void 0 ? void 0 : activeNode.outputPt) {
                    fallbackPt = activeNode.outputPt;
                }
            }
        }
        let angle = Math.random() * PI * 2;
        fallbackPt.x += Math.cos(angle) * this.edgeLength * 0.3;
        fallbackPt.y += Math.sin(angle) * this.edgeLength * 0.1;
        return fallbackPt;
    }
    ensureNodeExists(nodeId) {
        if (!(nodeId in this.nodes)) {
            if (nodeId in this.previousNodes) {
                this.nodes[nodeId] = this.previousNodes[nodeId];
                this.nodes[nodeId].reset();
            }
            else {
                this.nodes[nodeId] = new Node(nodeId, this.colWidth, this.rowHeight);
                this.nodes[nodeId].pt = this.getInitialNodePoint(nodeId);
            }
        }
    }
    updateNodes(linkId, idA, idB, relation, properties) {
        this.ensureNodeExists(idA);
        this.ensureNodeExists(idB);
        this.nodes[idA].addLink(idB, relation, properties);
        this.nodes[idB].addLink(idA, RelationHelper.getOpposite(relation), properties);
        this.edges[linkId] = new Edge(linkId, this.nodes[idA], this.nodes[idB], relation);
    }
    applyCoulombsLawUsingQuadtree() {
        let quadtree = new Quadtree({
            width: this.rect.width,
            height: this.rect.height,
            maxObjects: 10,
            maxLevels: 4,
        });
        let count = 0;
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
                let id = result.data;
                if (processedNodes.has(id)) {
                    return;
                }
                if (id in this.nodes) {
                    let node2 = this.nodes[id];
                    if (node1.isAnchored() && node2.isAnchored()) {
                        return;
                    }
                    let distance = node1.getRect(false).calcDistance(node2.getRect(false));
                    let distanceFactor = (distance + this.repulsionMinDistance) / this.repulsionDistanceDivisor;
                    let force = Math.max(this.repulsionStrength / (distanceFactor * distanceFactor) - this.repulsionAdjustment, 0);
                    let d = node1.pt.subtract(node2.pt);
                    let direction = d.normalise();
                    if (node1.isAnchored()) {
                        node2.applyForce(direction.multiply(-force * 2));
                    }
                    else if (node2.isAnchored()) {
                        node1.applyForce(direction.multiply(force * 2));
                    }
                    else {
                        node1.applyForce(direction.multiply(force));
                        node2.applyForce(direction.multiply(-force));
                    }
                }
            });
        });
    }
    applyHookesLaw() {
        this.eachLiveEdge((edge) => {
            let d = edge.node2.pt.subtract(edge.node1.pt);
            let length = this.edgeLength;
            let displacement = (length + this.getExtraLength(edge.node1, edge.node2)) - d.magnitude();
            let direction = d.normalise();
            let d1 = direction.multiply(this.springStrength * displacement * -0.5);
            let d2 = direction.multiply(this.springStrength * displacement * 0.5);
            edge.node1.applyForce(d1);
            edge.node2.applyForce(d2);
        });
    }
    getBadFastSquareRoot(num) {
        for (let n = 1; true; n++) {
            if ((n + 1) * (n + 1) > num) {
                return n;
            }
        }
    }
    getExtraLength(node1, node2) {
        let extraLength = 0;
        extraLength += this.getBadFastSquareRoot(node1.droneLinksCount + node2.droneLinksCount) * this.edgeLengthDroneCountFactor;
        extraLength += (node1.nonDroneLinksCount + node2.nonDroneLinksCount - 2) * this.edgeLengthLiveCountFactor;
        return extraLength;
    }
    applyRotationalForces() {
        this.eachLiveEdge((edge) => {
            if (edge.rel == Relation.Unknown || edge.node1.isAnchored() && edge.node2.isAnchored()) {
                return;
            }
            let d = edge.node2.pt.subtract(edge.node1.pt);
            let angle = Math.atan2(d.y, d.x);
            let idealAngle = 0;
            switch (edge.rel) {
                case Relation.Child:
                    if (edge.node1.id == this.activeId || edge.node2.id == this.activeId) {
                        idealAngle = PI * 0.65;
                    }
                    else {
                        idealAngle = PI * 0.35;
                    }
                    break;
                case Relation.Parent:
                    if (edge.node1.id == this.activeId || edge.node2.id == this.activeId) {
                        idealAngle = PI * -0.35;
                    }
                    else {
                        idealAngle = PI * -0.65;
                    }
                    break;
                case Relation.Jump:
                    if (edge.node1.id == this.activeId) {
                        idealAngle = PI;
                    }
                    else if (edge.node2.id == this.activeId) {
                        idealAngle = 0;
                    }
                    else {
                        if (angle > -PI / 2 && angle < PI / 2) {
                            idealAngle = 0;
                        }
                        else {
                            idealAngle = PI;
                        }
                    }
                    break;
            }
            if (Math.abs(idealAngle - angle) > PI) {
                if (idealAngle < angle) {
                    idealAngle += PI * 2;
                }
                else {
                    idealAngle -= PI * 2;
                }
            }
            let targetAngle = idealAngle;
            let percentageFromIdeal = Math.abs(idealAngle - angle) * 100 / PI;
            if (percentageFromIdeal > 50) {
                let deltaAngle = idealAngle - angle;
                if (deltaAngle < 0) {
                    targetAngle = angle - PI / 2;
                }
                else {
                    targetAngle = angle + PI / 2;
                }
            }
            let cen = edge.node1.pt.add(edge.node2.pt).divide(2);
            let dist = (this.edgeLength + this.getExtraLength(edge.node1, edge.node2)) / 2;
            let node1TargetPt = cen.add(new Point(Math.cos(targetAngle + PI) * dist, Math.sin(targetAngle + PI) * dist));
            let node2TargetPt = cen.add(new Point(Math.cos(targetAngle) * dist, Math.sin(targetAngle * dist)));
            let node1Dir = edge.node1.pt.subtract(node1TargetPt).multiply(-1);
            let node2Dir = edge.node2.pt.subtract(node2TargetPt).multiply(-1);
            let sumDir = node1Dir.add(node2Dir);
            node1Dir = node1Dir.subtract(sumDir.divide(2));
            node2Dir = node2Dir.subtract(sumDir.divide(2));
            let mod = (percentageFromIdeal + 50) * 0.2;
            let forceFactor = this.rotationalForce * mod * mod;
            if (edge.node1.id == this.activeId || edge.node2.id == this.activeId) {
                forceFactor *= this.activeNodeRotationForceModifier;
            }
            if (edge.node1.isAnchored()) {
                edge.node2.applyForce(node2Dir.multiply(forceFactor * 2));
            }
            else if (edge.node2.isAnchored()) {
                edge.node1.applyForce(node1Dir.multiply(forceFactor * 2));
            }
            else {
                edge.node1.applyForce(node1Dir.multiply(forceFactor));
                edge.node2.applyForce(node2Dir.multiply(forceFactor));
            }
        });
    }
    getExtents() {
        let minX = 0;
        let minY = 0;
        let maxX = 0;
        let maxY = 0;
        let first = true;
        this.eachLiveNode((node) => {
            let rect = node.getRect(false);
            if (first) {
                minX = rect.x;
                maxX = rect.right();
                minY = rect.y;
                maxY = rect.bottom();
                first = false;
            }
            else {
                minX = Math.min(rect.x, minX);
                minY = Math.min(rect.y, minY);
                maxX = Math.max(rect.right(), maxX);
                maxY = Math.max(rect.bottom(), maxY);
            }
        });
        return new Rect(minX, minY, maxX - minX, maxY - minY);
    }
    gatherNodesToward(pt) {
        let gatherForceModifier = this.getBadFastSquareRoot(this.lastLiveNodeCount * this.lastLiveNodeCount * 0.3);
        let gatherForce = Math.min(100, this.gatherNodesForce / gatherForceModifier);
        this.eachLiveNode((node) => {
            let direction = node.getRect(false).getCenter().subtract(pt).multiply(-1.0);
            node.applyForce(direction.multiply(gatherForce));
        });
    }
    eachLiveNode(fn) {
        this.lastLiveNodeCount = 0;
        this.eachNode((node) => {
            if (!node.isDrone()) {
                fn(node);
                this.lastLiveNodeCount++;
            }
        });
    }
    eachLiveEdge(fn) {
        this.eachEdge((edge) => {
            if (!edge.node1.isDrone() && !edge.node2.isDrone()) {
                fn(edge);
            }
        });
    }
    eachNode(fn) {
        Object.values(this.nodes).forEach((node) => {
            fn(node);
        });
    }
    eachEdge(fn) {
        Object.values(this.edges).forEach((edge) => {
            fn(edge);
        });
    }
    getActiveNode() {
        if (!this.activeId) {
            return null;
        }
        let activeNode = this.nodes[this.activeId];
        return activeNode;
    }
    tick(delta) {
        this.ellapsedTime += delta;
        let x = Math.max(0, 1 - this.ellapsedTime * this.dampingTimeFactor);
        this.damping = this.initialDamping * x;
        if (this.ellapsedTime > this.timeUntilFixingActiveThought) {
            let activeNode = this.getActiveNode();
            if (activeNode) {
                activeNode.isAnchoredTemporarily = true;
            }
        }
        let start = Date.now();
        for (let n = 0; n < this.speedMultiplier; n++) {
            this.processTick(delta);
            let elapsed = Date.now() - start;
            if (elapsed > 20) {
                return;
            }
        }
    }
    processTick(delta) {
        this.applyCoulombsLawUsingQuadtree();
        if (this.useUndirectedLayout) {
            this.applyHookesLaw();
        }
        else {
            this.applyRotationalForces();
        }
        let extentsRect = this.getExtents();
        let extentsCen = extentsRect.getCenter();
        if (!this.pressedNodeId && !this.isBackgroundDragged) {
            let rectCen = this.rect.getCenter();
            let direction = extentsCen.subtract(rectCen).multiply(-1.0);
            this.eachLiveNode((node) => {
                node.pt = node.pt.add(direction.multiply(this.centeringForce));
            });
        }
        if (this.isGatherNodesEnabled && this.ellapsedTime > this.timeUntilFixingActiveThought) {
            let activeNode = this.getActiveNode();
            if (activeNode) {
                this.gatherNodesToward(activeNode.pt);
            }
        }
        this.eachLiveNode((node) => {
            node.vel = node.vel.add(node.acc.multiply(delta)).multiply(this.damping);
            if (node.vel.magnitude() > this.maxSpeed) {
                node.vel = node.vel.normalise().multiply(this.maxSpeed);
            }
            node.acc = new Point(0, 0);
        });
        this.eachLiveNode((node) => {
            if (node.isAnchored()) {
                return;
            }
            node.pt = node.pt.add(node.vel.multiply(delta));
        });
        let nodesToMoveFaster = this.getNodesConnectedToPressedNodes();
        this.eachNode((node) => {
            node.updateOutputPoint(nodesToMoveFaster.has(node.id) ? this.displayDampingWhilePressed : this.displayDamping);
        });
    }
    getNodesConnectedToPressedNodes() {
        let set = new Set();
        if (!this.pressedNodeId) {
            return set;
        }
        set.add(this.pressedNodeId);
        let pressedNode = this.nodes[this.pressedNodeId];
        if (pressedNode) {
            pressedNode.links.forEach((linkInfo) => {
                let nodeId = linkInfo.substring(0, 36);
                set.add(nodeId);
            });
        }
        return set;
    }
    getNodePoint(id) {
        let node = this.nodes[id];
        if (node) {
            return node.getDisplayPoint();
        }
        else {
            return undefined;
        }
    }
    nodeDragged(id, newCen, hasDragExceededClickDistance) {
        let node = this.nodes[id];
        if (node) {
            node.pt = newCen;
            node.outputPt = newCen;
            if (hasDragExceededClickDistance) {
                node.isAnchoredPermanently = true;
                if (node.isDrone()) {
                    node.assignPilot(undefined);
                }
                else {
                    node.freeDrones();
                }
            }
            this.restartForcesIfNeeded();
        }
    }
    restartForcesIfNeeded() {
        this.ellapsedTime = Math.min(this.ellapsedTime, 2);
    }
    nodePressed(id) {
        this.pressedNodeId = id;
    }
    nodeReleased(id) {
        this.pressedNodeId = undefined;
    }
    reset() {
        this.previousNodes = {};
        this.nodes = {};
        this.edges = {};
        this.isBackgroundDragged = false;
    }
    backgroundDragged(deltaPoint, hasDragExceededClickDistance) {
        this.isBackgroundDragged = this.isBackgroundDragged || hasDragExceededClickDistance;
        this.eachNode((node) => {
            node.pt = node.pt.add(deltaPoint);
            if (node.outputPt) {
                node.outputPt = node.outputPt.add(deltaPoint);
            }
        });
    }
    isDrone(nodeId) {
        let node = this.nodes[nodeId];
        return node === null || node === void 0 ? void 0 : node.isDrone();
    }
    isPilot(nodeId) {
        let node = this.nodes[nodeId];
        return node === null || node === void 0 ? void 0 : node.isPilot();
    }
    getPilot(nodeId) {
        let node = this.nodes[nodeId];
        return node === null || node === void 0 ? void 0 : node.getPilot();
    }
    getNodeRect(nodeId) {
        let node = this.nodes[nodeId];
        return node === null || node === void 0 ? void 0 : node.getRect(true);
    }
    clearIsAnchoredTemporarily() {
        Object.values(this.nodes).forEach((node) => {
            node.isAnchoredTemporarily = false;
        });
    }
}
ForceLayout.NORMAL_X_PADDING = 10;
ForceLayout.NORMAL_Y_PADDING = 5;
ForceLayout.CLUSTER_X_PADDING = 20;
ForceLayout.CLUSTER_Y_PADDING = 10;
ForceLayout.massBase = 0;
ForceLayout.massLinkMultiplier = 1;
export class LinkData {
    constructor(id, idA, idB, relation, properties) {
        this.id = id;
        this.idA = idA;
        this.idB = idB;
        this.relation = relation;
        this.properties = properties;
    }
}
//# sourceMappingURL=forceLayout.js.map