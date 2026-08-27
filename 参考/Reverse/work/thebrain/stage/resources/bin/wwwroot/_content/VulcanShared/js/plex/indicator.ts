export class IndicatorList {
    thtId: string;
    indicators: Indicator[];
    constructor(thtId: string, tags: Indicator[]) {
        this.thtId = thtId;
        this.indicators = tags;
    }
}

class Indicator {
    indicatorId: string;
    name: string;
    label?: string;
    imageAddress: string;
    // Optional CSS colors (e.g., "rgba(r,g,b,a)")
    foreColorCss?: string;
    backColorCss?: string;
    // Indicator type: "private", "note", "event", or "tag"
    indicatorType?: string;
    constructor(indicatorId: string, name: string, imageAddress: string, foreColorCss?: string, backColorCss?: string, indicatorType?: string, label?: string) {
        this.indicatorId = indicatorId;
        this.name = name;
        this.label = label;
        this.imageAddress = imageAddress;
        this.foreColorCss = foreColorCss;
        this.backColorCss = backColorCss;
        this.indicatorType = indicatorType;
    }
}
