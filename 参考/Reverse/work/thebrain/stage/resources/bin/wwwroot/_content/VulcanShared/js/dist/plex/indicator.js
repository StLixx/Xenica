export class IndicatorList {
    constructor(thtId, tags) {
        this.thtId = thtId;
        this.indicators = tags;
    }
}
class Indicator {
    constructor(indicatorId, name, imageAddress, foreColorCss, backColorCss, indicatorType, label) {
        this.indicatorId = indicatorId;
        this.name = name;
        this.label = label;
        this.imageAddress = imageAddress;
        this.foreColorCss = foreColorCss;
        this.backColorCss = backColorCss;
        this.indicatorType = indicatorType;
    }
}
//# sourceMappingURL=indicator.js.map