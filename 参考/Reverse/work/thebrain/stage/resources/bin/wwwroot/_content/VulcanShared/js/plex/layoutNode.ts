
export class LayoutNode {
    id: string;
    children: LayoutNode[] | null = null;
    parents: LayoutNode[] | null = null;
    jumps: LayoutNode[] | null = null;
    siblings: LayoutNode[] | null = null;

    constructor(id: string) {
        this.id = id;
    }

    static fromGraph(graph: { rootId: string, nodes: { [id: string]: { children: string[], parents: string[], jumps: string[], siblings: string[] } } }): LayoutNode {
        let cache = new Map<string, LayoutNode>();

        function getOrCreate(id: string): LayoutNode {
            if(cache.has(id)) {
                return cache.get(id)!;
            }
            let node = new LayoutNode(id);
            cache.set(id, node);

            let entry = graph.nodes[id];
            if(entry) {
                node.children = entry.children?.map(getOrCreate) ?? [];
                node.parents = entry.parents?.map(getOrCreate) ?? [];
                node.jumps = entry.jumps?.map(getOrCreate) ?? [];
                node.siblings = entry.siblings?.map(getOrCreate) ?? [];
            }
            return node;
        }

        return getOrCreate(graph.rootId);
    }
}
