class ElectronFocus {
    constructor() {
        this.electron = null;
    }
    init() {
        var _a, _b, _c;
        try {
            this.electron = (_b = (_a = window).require) === null || _b === void 0 ? void 0 : _b.call(_a, 'electron');
        }
        catch (e) {
            return;
        }
        if (!((_c = this.electron) === null || _c === void 0 ? void 0 : _c.ipcRenderer)) {
            return;
        }
        window.addEventListener("contextmenu", () => {
            this.electron.ipcRenderer.send('focus-window');
        });
        window.addEventListener("mouseup", (event) => {
            var _a;
            const target = event.target;
            if (target) {
                const tagName = (_a = target.tagName) === null || _a === void 0 ? void 0 : _a.toLowerCase();
                if (tagName === 'input' || tagName === 'textarea' ||
                    target.contentEditable === 'true' || target.isContentEditable) {
                    return;
                }
            }
            setTimeout(() => {
                this.electron.ipcRenderer.send('refocus-active-view');
            }, 10);
        });
    }
}
export const electronFocus = new ElectronFocus();
electronFocus.init();
//# sourceMappingURL=electronFocus.js.map