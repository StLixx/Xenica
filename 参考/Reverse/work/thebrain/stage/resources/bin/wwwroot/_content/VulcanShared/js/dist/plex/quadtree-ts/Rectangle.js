export class Rectangle {
    constructor(props) {
        this.x = props.x;
        this.y = props.y;
        this.width = props.width;
        this.height = props.height;
        this.data = props.data;
    }
    qtIndex(node) {
        const indexes = [], boundsCenterX = node.x + (node.width / 2), boundsCenterY = node.y + (node.height / 2);
        const startIsNorth = this.y < boundsCenterY, startIsWest = this.x < boundsCenterX, endIsEast = this.x + this.width > boundsCenterX, endIsSouth = this.y + this.height > boundsCenterY;
        if (startIsNorth && endIsEast) {
            indexes.push(0);
        }
        if (startIsWest && startIsNorth) {
            indexes.push(1);
        }
        if (startIsWest && endIsSouth) {
            indexes.push(2);
        }
        if (endIsEast && endIsSouth) {
            indexes.push(3);
        }
        return indexes;
    }
}
//# sourceMappingURL=Rectangle.js.map