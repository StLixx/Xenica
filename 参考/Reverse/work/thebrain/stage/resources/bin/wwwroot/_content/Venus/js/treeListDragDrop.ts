// Drag-to-reorder for the Venus TreeList component.
//
// Modeled on plexAccessory.ts setupListDragDrop: document-level pointer/touch
// listeners, 6px activation threshold, FLIP animation between sibling positions,
// floating ghost cloned from the dragged row, and a placeholder div that tracks
// the insertion point.
//
// Differences from the plex version:
//  - Siblings are not "direct children of one container" — instead, a sibling
//    group is identified by data-tree-drag-group on the row, scoped to a single
//    TreeList instance via data-tree-list-instance. Drops are only valid within
//    the dragged row's group.
//  - On drag start, the dragged row's expanded subtree (its immediately-following
//    .tree-list-children sibling) is hidden so the ghost is compact and FLIP
//    measurements are clean. Restored at endDrag.
//  - Esc cancels the drag.
//
// Each TreeList instance owns its own setup; per-instance idempotency keeps the
// listeners from doubling if Blazor re-renders.

import { safeInvoke } from "./interop.js";

interface DragInstance {
    instanceId: string;
    teardown: () => void;
}

const instances: Map<string, DragInstance> = new Map();

const DRAG_START_THRESHOLD = 6;
const FLIP_DURATION_MS = 200;

function findRoot(instanceId: string): HTMLElement | null {
    return document.querySelector(`[data-tree-list-instance="${instanceId}"]`) as HTMLElement | null;
}

function findRow(target: EventTarget | null): HTMLElement | null {
    if(!(target instanceof HTMLElement)) return null;
    return target.closest('[data-tree-row]') as HTMLElement | null;
}

function getSubtreeEl(rowEl: HTMLElement): HTMLElement | null {
    // The expanded subtree (if any) is rendered by Blazor as the immediately-following
    // .tree-list-children sibling inside the same .tree-node wrapper. TreeListNode.razor
    // emits <div class="tree-node">{row}{children?}</div>, so we walk our way to the
    // children div by inspecting the row's children.
    const children = rowEl.querySelector(':scope > .tree-list-children') as HTMLElement | null;
    return children;
}

function setup(instanceId: string, dotNetRef: any) {
    if(instances.has(instanceId)) return;

    let draggingRow: HTMLElement | null = null;
    let draggingParent: HTMLElement | null = null;
    let originalNextSibling: Node | null = null;
    let dragGroup: string | null = null;
    let dragParentId: string | null = null;
    let draggedRowId: string | null = null;
    let oldIndex = -1;

    let placeholder: HTMLElement | null = null;
    let ghost: HTMLElement | null = null;
    let hiddenSubtree: HTMLElement | null = null;
    let hiddenSubtreePrevDisplay = '';

    let isPointerDown = false;
    let isDragging = false;
    let startX = 0, startY = 0;
    let startRect: DOMRect | null = null;
    let cancelNextClick = false;

    const getSiblings = (): HTMLElement[] => {
        const root = findRoot(instanceId);
        if(!root || !dragGroup) return [];
        // All rows in the same group across the whole TreeList instance.
        const all = Array.from(root.querySelectorAll(`[data-tree-row][data-tree-drag-group="${dragGroup}"]`)) as HTMLElement[];
        // Filter by the dragging row's parent container. Once isDragging the row is
        // detached from the DOM, so we use the cached draggingParent instead.
        const parent = draggingParent ?? (draggingRow ? draggingRow.parentElement : null);
        if(!parent) return all;
        return all.filter(r => r.parentElement === parent);
    };

    const ensurePlaceholder = (width: number, height: number): HTMLElement => {
        if(!placeholder) {
            placeholder = document.createElement('div');
            placeholder.className = 'tree-list-drag-placeholder';
        }
        placeholder.style.width = `${width}px`;
        placeholder.style.height = `${height}px`;
        placeholder.style.marginBottom = window.getComputedStyle(draggingRow!).marginBottom;
        return placeholder;
    };

    const computeInsertion = (centerY: number) => {
        const sibs = getSiblings().filter(s => s !== draggingRow);
        for(let i = 0; i < sibs.length; i++) {
            const r = sibs[i].getBoundingClientRect();
            const mid = r.top + r.height / 2;
            if(centerY < mid) {
                return { beforeEl: sibs[i], index: i };
            }
        }
        // Insert at end of the draggable group: anchor before whatever DOM element follows
        // the last in-group sibling (e.g. a non-draggable "Parents" / "Jumps" pseudo-row).
        // Without this, appending to parent would place the placeholder past those rows.
        if(sibs.length > 0) {
            return { beforeEl: sibs[sibs.length - 1].nextElementSibling as HTMLElement | null, index: sibs.length };
        }
        return { beforeEl: null as HTMLElement | null, index: sibs.length };
    };

    const positionPlaceholder = (centerY: number): boolean => {
        if(!placeholder) return false;
        const parent = draggingParent;
        if(!parent) return false;
        const ins = computeInsertion(centerY);
        if(ins.beforeEl) {
            if(placeholder.previousElementSibling !== ins.beforeEl.previousElementSibling || placeholder.nextElementSibling !== ins.beforeEl) {
                parent.insertBefore(placeholder, ins.beforeEl);
                return true;
            }
        } else {
            if(parent.lastElementChild !== placeholder) {
                parent.appendChild(placeholder);
                return true;
            }
        }
        return false;
    };

    const flipSiblings = (action: () => boolean) => {
        const sibs = getSiblings();
        const firstRects = new Map<HTMLElement, DOMRect>();
        for(const s of sibs) firstRects.set(s, s.getBoundingClientRect());

        const changed = action();
        if(!changed) return;

        for(const s of sibs) {
            s.style.transition = 'none';
            s.style.transform = '';
        }
        for(const s of sibs) {
            if(!s.parentElement) continue;
            const first = firstRects.get(s);
            if(!first) continue;
            const last = s.getBoundingClientRect();
            const dy = first.top - last.top;
            if(Math.abs(dy) < 1) continue;
            s.style.transform = `translateY(${dy}px)`;
            // Force reflow so the browser registers the starting transform before we transition off it.
            void s.offsetHeight;
            s.style.transition = `transform ${FLIP_DURATION_MS}ms ease`;
            s.style.transform = '';
            const onEnd = () => {
                s.style.transition = '';
                s.style.transform = '';
                s.removeEventListener('transitionend', onEnd);
            };
            s.addEventListener('transitionend', onEnd);
            setTimeout(onEnd, FLIP_DURATION_MS + 50);
        }
    };

    const getEffectiveBackground = (el: HTMLElement): string => {
        // Walk up until we find an ancestor with a non-transparent background. The
        // .tree-node wrappers and their inner row divs typically have transparent
        // backgrounds — they sit on the page's content background. Without an opaque
        // background on the ghost, other rows' text bleeds through during drag.
        let cur: HTMLElement | null = el;
        while(cur) {
            const bg = window.getComputedStyle(cur).backgroundColor;
            if(bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
                return bg;
            }
            cur = cur.parentElement;
        }
        return '';
    };

    const createGhost = (fromEl: HTMLElement, rect: DOMRect): HTMLElement => {
        const clone = fromEl.cloneNode(true) as HTMLElement;
        clone.classList.add('tree-list-drag-ghost');
        clone.style.left = `${rect.left}px`;
        clone.style.top = `${rect.top}px`;
        clone.style.width = `${rect.width}px`;
        clone.style.height = `${rect.height}px`;
        clone.style.transition = 'none';
        clone.style.transform = 'scale(1.02)';
        const bg = getEffectiveBackground(fromEl);
        if(bg) {
            clone.style.backgroundColor = bg;
        }
        // The clone retains data-tree-* attributes — strip drag-related ones so it's never a drop target.
        clone.removeAttribute('data-tree-row');
        clone.removeAttribute('data-tree-draggable');
        clone.removeAttribute('data-tree-drag-group');
        document.body.appendChild(clone);
        return clone;
    };

    const restoreRow = (atOriginal: boolean) => {
        // Reinsert the dragged row before the placeholder (commit) or at its original
        // position relative to the parent's children (cancel). If neither is possible
        // because the parent was unmounted, just drop the row.
        if(!draggingRow || !draggingParent) return;
        if(atOriginal) {
            if(originalNextSibling && originalNextSibling.parentNode === draggingParent) {
                draggingParent.insertBefore(draggingRow, originalNextSibling);
            } else if(originalNextSibling === null) {
                draggingParent.appendChild(draggingRow);
            } else {
                // Original next-sibling no longer in tree — fall back to placeholder slot.
                if(placeholder && placeholder.parentElement === draggingParent) {
                    draggingParent.insertBefore(draggingRow, placeholder);
                } else {
                    draggingParent.appendChild(draggingRow);
                }
            }
        } else {
            if(placeholder && placeholder.parentElement === draggingParent) {
                draggingParent.insertBefore(draggingRow, placeholder);
            } else {
                draggingParent.appendChild(draggingRow);
            }
        }
    };

    const cleanup = () => {
        if(ghost && ghost.parentElement) ghost.parentElement.removeChild(ghost);
        ghost = null;
        if(placeholder && placeholder.parentElement) placeholder.parentElement.removeChild(placeholder);
        placeholder = null;
        if(hiddenSubtree) {
            hiddenSubtree.style.display = hiddenSubtreePrevDisplay;
            hiddenSubtree = null;
            hiddenSubtreePrevDisplay = '';
        }
    };

    const captureOldIndex = (row: HTMLElement): number => {
        const sibs = getSiblings();
        return sibs.indexOf(row);
    };

    const startDrag = () => {
        if(!draggingRow) return;

        draggingParent = draggingRow.parentElement;
        originalNextSibling = draggingRow.nextSibling;
        oldIndex = captureOldIndex(draggingRow);

        // Hide the dragged row's expanded subtree first — the .tree-node wrapper's
        // bounding rect collapses to just the row body once the children container
        // is display:none, so we measure AFTER hiding.
        const subtree = getSubtreeEl(draggingRow);
        if(subtree) {
            hiddenSubtree = subtree;
            hiddenSubtreePrevDisplay = subtree.style.display;
            subtree.style.display = 'none';
        }

        // Re-measure with the subtree hidden so the placeholder and ghost are the
        // size of just the row body.
        startRect = draggingRow.getBoundingClientRect();

        // Build the ghost from the row before we detach it.
        ghost = createGhost(draggingRow, startRect);

        // Replace the dragged row with the placeholder. The row is kept in JS state
        // and reinserted on drop. This mirrors plexAccessory.setupListDragDrop, and
        // ensures the layout has exactly one row-sized slot at the drop point —
        // not the dragged row plus a placeholder.
        const ph = ensurePlaceholder(startRect.width, startRect.height);
        if(draggingParent) {
            draggingParent.insertBefore(ph, draggingRow);
            draggingParent.removeChild(draggingRow);
        }

        cancelNextClick = true;
        document.addEventListener('click', suppressNextClick, true);
        document.addEventListener('keydown', onKeyDown, true);
    };

    const updateGhost = (clientX: number, clientY: number) => {
        if(!ghost || !startRect) return;
        const dx = clientX - startX;
        const dy = clientY - startY;
        ghost.style.left = `${startRect.left + dx}px`;
        ghost.style.top = `${startRect.top + dy}px`;
        const centerY = startRect.top + dy + startRect.height / 2;
        flipSiblings(() => positionPlaceholder(centerY));
    };

    const finalizeAndNotify = () => {
        if(!draggingRow || !draggingParent) return;
        // Move the dragged row into the placeholder slot before reading the final order.
        restoreRow(false);
        if(placeholder && placeholder.parentElement) placeholder.parentElement.removeChild(placeholder);
        placeholder = null;

        const sibs = getSiblings();
        const newIndex = sibs.indexOf(draggingRow);
        const orderedIds = sibs.map(s => s.getAttribute('data-tree-row-id') || '');

        if(newIndex === oldIndex || newIndex < 0) return;

        const payload = {
            groupId: dragGroup ?? '',
            parentId: dragParentId ?? '',
            draggedId: draggedRowId ?? '',
            oldIndex,
            newIndex,
            orderedIds
        };
        safeInvoke(dotNetRef, 'OnReorderFromJs', [payload]);
    };

    const endDrag = (commit: boolean) => {
        if(!isPointerDown) return;
        document.removeEventListener('keydown', onKeyDown, true);

        if(isDragging) {
            if(commit) {
                // Run finalize inside a FLIP so the row settles smoothly into its new slot.
                flipSiblings(() => {
                    finalizeAndNotify();
                    return true;
                });
            } else {
                // Cancel: put the dragged row back exactly where it started.
                flipSiblings(() => {
                    restoreRow(true);
                    return true;
                });
            }
            cleanup();
        }
        isPointerDown = false;
        isDragging = false;
        draggingRow = null;
        draggingParent = null;
        originalNextSibling = null;
        startRect = null;
        dragGroup = null;
        dragParentId = null;
        draggedRowId = null;
        oldIndex = -1;
    };

    const suppressNextClick = (e: MouseEvent) => {
        if(cancelNextClick) {
            e.preventDefault();
            e.stopPropagation();
            cancelNextClick = false;
            document.removeEventListener('click', suppressNextClick, true);
        }
    };

    const onKeyDown = (e: KeyboardEvent) => {
        if(e.key === 'Escape' && isDragging) {
            e.preventDefault();
            e.stopPropagation();
            endDrag(false);
        }
    };

    const pointFromEvent = (ev: MouseEvent | TouchEvent) =>
        ('touches' in ev ? ev.touches[0] : ev as MouseEvent);

    const onPointerDown = (ev: MouseEvent | TouchEvent) => {
        if(isPointerDown) return;
        const root = findRoot(instanceId);
        if(!root) return;
        const target = ev.target as HTMLElement | null;
        if(!target || !root.contains(target)) return;
        const row = findRow(target);
        if(!row) return;
        if(row.getAttribute('data-tree-draggable') !== '1') return;
        // Don't capture pointerdown on the chevron button — it has its own click handler
        // and we don't want a 6px drift to swallow the toggle.
        if(target.closest('button')) return;

        // No-op drags scramble the visual (the placeholder has nowhere to go among in-group
        // siblings, so it gets appended past any trailing non-group rows like the
        // "^ N parents" pseudo-row, which then appear to move). Refuse the drag entirely
        // when the group has fewer than two members.
        const group = row.getAttribute('data-tree-drag-group');
        if(group) {
            const groupRows = Array.from(root.querySelectorAll(`[data-tree-row][data-tree-drag-group="${group}"]`))
                .filter(el => (el as HTMLElement).parentElement === row.parentElement);
            if(groupRows.length <= 1) return;
        }

        const point = pointFromEvent(ev);
        isPointerDown = true;
        draggingRow = row;
        dragGroup = group;
        dragParentId = row.getAttribute('data-tree-drag-parent');
        draggedRowId = row.getAttribute('data-tree-row-id');
        startX = point.clientX;
        startY = point.clientY;
        startRect = row.getBoundingClientRect();
    };

    const onPointerMove = (ev: MouseEvent | TouchEvent) => {
        if(!isPointerDown) return;
        const point = pointFromEvent(ev);
        const dx = point.clientX - startX;
        const dy = point.clientY - startY;

        if(!isDragging) {
            if(Math.abs(dy) > DRAG_START_THRESHOLD && Math.abs(dy) > Math.abs(dx)) {
                isDragging = true;
                startDrag();
                if('preventDefault' in ev) { try { (ev as Event).preventDefault(); } catch(_) {} }
            } else {
                return;
            }
        }
        updateGhost(point.clientX, point.clientY);
        if('preventDefault' in ev) { try { (ev as Event).preventDefault(); } catch(_) {} }
    };

    const onPointerUp = () => endDrag(true);
    const onPointerCancel = () => endDrag(false);

    document.addEventListener('mousedown', onPointerDown as EventListener);
    document.addEventListener('mousemove', onPointerMove as EventListener);
    document.addEventListener('mouseup', onPointerUp as EventListener);
    document.addEventListener('touchstart', onPointerDown as EventListener, { passive: true } as any);
    document.addEventListener('touchmove', onPointerMove as EventListener, { passive: false } as any);
    document.addEventListener('touchend', onPointerUp as EventListener, { passive: true } as any);
    document.addEventListener('touchcancel', onPointerCancel as EventListener, { passive: true } as any);

    const teardown = () => {
        document.removeEventListener('mousedown', onPointerDown as EventListener);
        document.removeEventListener('mousemove', onPointerMove as EventListener);
        document.removeEventListener('mouseup', onPointerUp as EventListener);
        document.removeEventListener('touchstart', onPointerDown as EventListener);
        document.removeEventListener('touchmove', onPointerMove as EventListener);
        document.removeEventListener('touchend', onPointerUp as EventListener);
        document.removeEventListener('touchcancel', onPointerCancel as EventListener);
        document.removeEventListener('click', suppressNextClick, true);
        document.removeEventListener('keydown', onKeyDown, true);
        if(isPointerDown) endDrag(false);
    };

    instances.set(instanceId, { instanceId, teardown });
}

function dispose(instanceId: string) {
    const inst = instances.get(instanceId);
    if(!inst) return;
    inst.teardown();
    instances.delete(instanceId);
}

export const TreeListDragDropModule = {
    setup,
    dispose
};
