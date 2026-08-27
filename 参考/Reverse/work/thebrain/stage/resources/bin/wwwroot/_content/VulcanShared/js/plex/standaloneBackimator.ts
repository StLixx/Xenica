import {Backimator} from "./backimator.js";

// Map of element IDs to their Backimator instances
const backimators: Map<string, Backimator> = new Map();

export const standaloneBackimator = {

    start(elementId: string, backimatorSettings: object) {
        const element = document.getElementById(elementId);
        if(!element) {
            console.warn(`standaloneBackimator: element with id '${elementId}' not found`);
            return;
        }

        // Clean up existing backimator for this element if any
        this.stop(elementId);

        const backimator = new Backimator(backimatorSettings);
        backimators.set(elementId, backimator);
        backimator.start(element);
    },

    stop(elementId: string) {
        const backimator = backimators.get(elementId);
        if(backimator) {
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
