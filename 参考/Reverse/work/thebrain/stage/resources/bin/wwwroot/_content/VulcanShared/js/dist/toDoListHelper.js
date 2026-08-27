import { safeInvoke } from "./interop.js";
class ToDoListHelper {
    constructor() {
        this.toDoListContainer = null;
        this.eventListenerAdded = false;
    }
    init(dotNetHelper) {
        this.dotNetHelper = dotNetHelper;
        this.toDoListContainer = document.getElementById("todo-list-container");
        if (!this.toDoListContainer) {
            console.error("The to-do list container was not found.");
            return;
        }
        if (this.eventListenerAdded) {
            return;
        }
        this.toDoListContainer.addEventListener("click", (event) => this.handleContainerClick(event));
        this.eventListenerAdded = true;
    }
    unInitialize() {
        this.eventListenerAdded = false;
    }
    handleContainerClick(event) {
        const target = event.target;
        if (target && (target.classList.contains("todo") || target.classList.contains("done"))) {
            event.preventDefault();
            this.handleItemClick(target);
        }
        else if (target && target.classList.contains("toggle-button")) {
            event.preventDefault();
            this.handleToggleClick(target);
        }
    }
    handleItemClick(item) {
        let isSet;
        if (item.classList.contains("todo")) {
            item.classList.remove("todo");
            item.classList.add("done");
            isSet = true;
        }
        else {
            item.classList.remove("done");
            item.classList.add("todo");
            isSet = false;
        }
        let lineElement = this.getParentElementWithClass(item, "keza-line");
        lineElement = lineElement;
        let lineId = this.getLineIdFromElementId(lineElement.id);
        safeInvoke(this.dotNetHelper, "ToggledLineId", [lineId, isSet]);
    }
    handleToggleClick(button) {
        const parentDiv = button.parentElement;
        let shouldBeExpanded = true;
        if (!parentDiv) {
            return;
        }
        let sibling = parentDiv.nextElementSibling;
        while (sibling) {
            if (sibling.tagName === "DIV") {
                break;
            }
            if (sibling.tagName === "UL") {
                shouldBeExpanded = sibling.style.display === "none";
            }
            sibling = sibling.nextElementSibling;
        }
        let lineElement = button.nextElementSibling;
        let lineId = this.getLineIdFromElementId(lineElement.id);
        safeInvoke(this.dotNetHelper, "SetExpandedState", [lineId, shouldBeExpanded]);
    }
    getLineIdFromElementId(id) {
        let start = id.lastIndexOf("-line-num-sm-");
        let prefixLength = 13;
        if (start === -1) {
            start = id.lastIndexOf("-line-num-");
            prefixLength = 10;
        }
        if (start === -1) {
            return undefined;
        }
        return id.substring(start + prefixLength);
    }
    getParentElementWithClass(node, className) {
        let parent = node.nodeType !== Node.ELEMENT_NODE ? node.parentElement : node;
        while (parent != null && parent.classList) {
            if (parent.classList.contains(className)) {
                return parent;
            }
            else {
                if (this.toDoListContainer != null && parent.id === this.toDoListContainer.id) {
                    return null;
                }
                parent = parent.parentNode;
            }
        }
        return null;
    }
}
export const toDoListHelper = new ToDoListHelper();
//# sourceMappingURL=toDoListHelper.js.map