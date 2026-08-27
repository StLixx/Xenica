export class Line {
    constructor(props) {
        this.x1 = props.x1;
        this.y1 = props.y1;
        this.x2 = props.x2;
        this.y2 = props.y2;
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
            if (Line.intersectRect(this.x1, this.y1, this.x2, this.y2, nodes[i][0], nodes[i][1], nodes[i][0] + w2, nodes[i][1] + h2)) {
                indexes.push(i);
            }
        }
        return indexes;
    }
    static intersectRect(x1, y1, x2, y2, minX, minY, maxX, maxY) {
        if ((x1 <= minX && x2 <= minX) || (y1 <= minY && y2 <= minY) || (x1 >= maxX && x2 >= maxX) || (y1 >= maxY && y2 >= maxY))
            return false;
        if ((x1 >= minX && x1 <= maxX && y1 >= minY && y1 <= maxY) || (x2 >= minX && x2 <= maxX && y2 >= minY && y2 <= maxY))
            return true;
        const m = (y2 - y1) / (x2 - x1);
        let y = m * (minX - x1) + y1;
        if (y > minY && y < maxY)
            return true;
        y = m * (maxX - x1) + y1;
        if (y > minY && y < maxY)
            return true;
        let x = (minY - y1) / m + x1;
        if (x > minX && x < maxX)
            return true;
        x = (maxY - y1) / m + x1;
        if (x > minX && x < maxX)
            return true;
        return false;
    }
}
//# sourceMappingURL=Line.js.map