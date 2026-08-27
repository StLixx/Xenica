import { Backimator } from "./backimator.js";
const backimators = new Map();
export const standaloneBackimator = {
    start(elementId, backimatorSettings) {
        const element = document.getElementById(elementId);
        if (!element) {
            console.warn(`standaloneBackimator: element with id '${elementId}' not found`);
            return;
        }
        this.stop(elementId);
        const backimator = new Backimator(backimatorSettings);
        backimators.set(elementId, backimator);
        backimator.start(element);
    },
    stop(elementId) {
        const backimator = backimators.get(elementId);
        if (backimator) {
            backimator.cleanUp();
            backimators.delete(elementId);
        }
    },
    stopAll() {
        backimators.forEach((backimator) => {
            backimator.cleanUp();
        });
        backimators.clear();
    }
};
//# sourceMappingURL=standaloneBackimator.js.map