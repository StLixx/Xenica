export class Quadtree {
    constructor(props, level = 0) {
        this.bounds = {
            x: props.x || 0,
            y: props.y || 0,
            width: props.width,
            height: props.height,
        };
        this.maxObjects = (typeof props.maxObjects === 'number') ? props.maxObjects : 10;
        this.maxLevels = (typeof props.maxLevels === 'number') ? props.maxLevels : 4;
        this.level = level;
        this.objects = [];
        this.nodes = [];
    }
    getIndex(obj) {
        return obj.qtIndex(this.bounds);
    }
    split() {
        const level = this.level + 1, width = this.bounds.width / 2, height = this.bounds.height / 2, x = this.bounds.x, y = this.bounds.y;
        const coords = [
            { x: x + width, y: y },
            { x: x, y: y },
            { x: x, y: y + height },
            { x: x + width, y: y + height },
        ];
        for (let i = 0; i < 4; i++) {
            this.nodes[i] = new Quadtree({
                x: coords[i].x,
                y: coords[i].y,
                width,
                height,
                maxObjects: this.maxObjects,
                maxLevels: this.maxLevels,
            }, level);
        }
    }
    insert(obj) {
        if (this.nodes.length) {
            const indexes = this.getIndex(obj);
            for (let i = 0; i < indexes.length; i++) {
                this.nodes[indexes[i]].insert(obj);
            }
            return;
        }
        this.objects.push(obj);
        if (this.objects.length > this.maxObjects && this.level < this.maxLevels) {
            if (!this.nodes.length) {
                this.split();
            }
            for (let i = 0; i < this.objects.length; i++) {
                const indexes = this.getIndex(this.objects[i]);
                for (let k = 0; k < indexes.length; k++) {
                    this.nodes[indexes[k]].insert(this.objects[i]);
                }
            }
            this.objects = [];
        }
    }
    retrieve(obj) {
        const indexes = this.getIndex(obj);
        let returnObjects = this.objects;
        if (this.nodes.length) {
            for (let i = 0; i < indexes.length; i++) {
                returnObjects = returnObjects.concat(this.nodes[indexes[i]].retrieve(obj));
            }
        }
        returnObjects = returnObjects.filter(function (item, index) {
            return returnObjects.indexOf(item) >= index;
        });
        return returnObjects;
    }
    clear() {
        this.objects = [];
        for (let i = 0; i < this.nodes.length; i++) {
            if (this.nodes.length) {
                this.nodes[i].clear();
            }
        }
        this.nodes = [];
    }
}
//# sourceMappingURL=Quadtree.js.map