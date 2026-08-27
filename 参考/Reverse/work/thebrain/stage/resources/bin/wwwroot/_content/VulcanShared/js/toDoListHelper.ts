import {safeInvoke} from "./interop.js";

class ToDoListHelper {
	dotNetHelper: any;
	toDoListContainer: HTMLElement | null = null;
	eventListenerAdded: boolean = false; // Add a flag to track if the event listener is already added

	constructor() {
        
	}

	// called from Blazor
	init(dotNetHelper: any) {
		this.dotNetHelper = dotNetHelper;
		this.toDoListContainer = document.getElementById("todo-list-container");

		if(!this.toDoListContainer) {
			console.error("The to-do list container was not found.");
			return;
		}

		if(this.eventListenerAdded) {
			return;
		}

		this.toDoListContainer.addEventListener("click", (event) => this.handleContainerClick(event));
		this.eventListenerAdded = true; // Set the flag to true
	}

	// called from Blazor
	unInitialize() {
		this.eventListenerAdded = false;
	}

	handleContainerClick(event: MouseEvent) {
		const target = event.target as HTMLElement;

		if(target && (target.classList.contains("todo") || target.classList.contains("done"))) {
			event.preventDefault();
			this.handleItemClick(target);
		} else if(target && target.classList.contains("toggle-button")) {
			event.preventDefault();
			this.handleToggleClick(target);
		}
	}

	handleItemClick(item: HTMLElement) {
		let isSet;
		if(item.classList.contains("todo")) {
			item.classList.remove("todo");
			item.classList.add("done");
			isSet = true;
		} else {
			item.classList.remove("done");
			item.classList.add("todo");
			isSet = false;
		}

		// Get the parent element with class "keza-line"
		let lineElement = this.getParentElementWithClass(item, "keza-line");
		lineElement = lineElement as HTMLElement;
		let lineId = this.getLineIdFromElementId(lineElement.id);

		safeInvoke(this.dotNetHelper, "ToggledLineId", [lineId, isSet]);
	}

	handleToggleClick(button: HTMLElement) {
		const parentDiv = button.parentElement;
		let shouldBeExpanded = true;
		
		if(!parentDiv){
			return;
		}
		
		let sibling = parentDiv.nextElementSibling as HTMLElement;

		while(sibling) {
			if(sibling.tagName === "DIV") {
				break;
			}

			if(sibling.tagName === "UL") {
				shouldBeExpanded = sibling.style.display === "none";
			}

			sibling = sibling.nextElementSibling as HTMLElement;
		}

		let lineElement = button.nextElementSibling as HTMLElement;
		let lineId = this.getLineIdFromElementId(lineElement.id);
		
		safeInvoke(this.dotNetHelper, "SetExpandedState", [lineId, shouldBeExpanded]);
	}

	getLineIdFromElementId(id: string) {
		let start = id.lastIndexOf("-line-num-sm-");
		let prefixLength = 13; // Length of "-line-num-sm"

		if(start === -1) {
			start = id.lastIndexOf("-line-num-");
			prefixLength = 10; // Length of "-line-num-"
		}

		if(start === -1) {
			return undefined;
		}

		return id.substring(start + prefixLength);
	}

	getParentElementWithClass(node: Node, className: string): Element | null {
		// Keep looking at the parent until we reach either the root or the mdeElement
		// If we reach the mdeElement, return the last p, h?, li, or whatever else can be a line
		// If we never hit a TR or other line tag, that is an error
		let parent: Element | null = node.nodeType !== Node.ELEMENT_NODE ? node.parentElement : node as Element;
		while(parent != null && parent.classList) {
			if(parent.classList.contains(className)) {
				return parent;
			} else {
				if(this.toDoListContainer != null && parent.id === this.toDoListContainer.id) {
					return null;
				}
				parent = parent.parentNode as Element;
			}
		}
		return null;
	}
}

export const toDoListHelper: ToDoListHelper = new ToDoListHelper();
