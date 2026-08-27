export class LayoutNode {
    constructor(id) {
        this.children = null;
        this.parents = null;
        this.jumps = null;
        this.siblings = null;
        this.id = id;
    }
    static fromGraph(graph) {
        let cache = new Map();
        function getOrCreate(id) {
            var _a, _b, _c, _d, _e, _f, _g, _h;
            if (cache.has(id)) {
                return cache.get(id);
            }
            let node = new LayoutNode(id);
            cache.set(id, node);
            let entry = graph.nodes[id];
            if (entry) {
                node.children = (_b = (_a = entry.children) === null || _a === void 0 ? void 0 : _a.map(getOrCreate)) !== null && _b !== void 0 ? _b : [];
                node.parents = (_d = (_c = entry.parents) === null || _c === void 0 ? void 0 : _c.map(getOrCreate)) !== null && _d !== void 0 ? _d : [];
                node.jumps = (_f = (_e = entry.jumps) === null || _e === void 0 ? void 0 : _e.map(getOrCreate)) !== null && _f !== void 0 ? _f : [];
                node.siblings = (_h = (_g = entry.siblings) === null || _g === void 0 ? void 0 : _g.map(getOrCreate)) !== null && _h !== void 0 ? _h : [];
            }
            return node;
        }
        return getOrCreate(graph.rootId);
    }
}
//# sourceMappingURL=layoutNode.js.map