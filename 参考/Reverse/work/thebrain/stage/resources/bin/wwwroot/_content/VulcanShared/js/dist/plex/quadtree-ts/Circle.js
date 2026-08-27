export class Circle {
    constructor(props) {
        this.x = props.x;
        this.y = props.y;
        this.r = props.r;
        this.data = props.data;
    }
    qtIndex(node) {
        const indexes = [], w2 = node.width / 2, h2 = node.height / 2, x2 = node.x + w2, y2 = node.y + h2;
        const nodes = [
            [x2, node.y],
            [node.x, node.y],
            [node.x, y2],
            [x2, y2],
        ];
        for (let i = 0; i < nodes.length; i++) {
            if (Circle.intersectRect(this.x, this.y, this.r, nodes[i][0], nodes[i][1], nodes[i][0] + w2, nodes[i][1] + h2)) {
                indexes.push(i);
            }
        }
        return indexes;
    }
    static intersectRect(x, y, r, minX, minY, maxX, maxY) {
        const deltaX = x - Math.max(minX, Math.min(x, maxX));
        const deltaY = y - Math.max(minY, Math.min(y, maxY));
        return (deltaX * deltaX + deltaY * deltaY) < (r * r);
    }
}
//# sourceMappingURL=Circle.js.map