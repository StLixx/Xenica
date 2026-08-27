import { safeInvoke } from "./interop.js";
const instances = new Map();
const DRAG_START_THRESHOLD = 6;
const FLIP_DURATION_MS = 200;
function findRoot(instanceId) {
    return document.querySelector(`[data-tree-list-instance="${instanceId}"]`);
}
function findRow(target) {
    if (!(target instanceof HTMLElement))
        return null;
    return target.closest('[data-tree-row]');
}
function getSubtreeEl(rowEl) {
    const children = rowEl.querySelector(':scope > .tree-list-children');
    return children;
}
function setup(instanceId, dotNetRef) {
    if (instances.has(instanceId))
        return;
    let draggingRow = null;
    let draggingParent = null;
    let originalNextSibling = null;
    let dragGroup = null;
    let dragParentId = null;
    let draggedRowId = null;
    let oldIndex = -1;
    let placeholder = null;
    let ghost = null;
    let hiddenSubtree = null;
    let hiddenSubtreePrevDisplay = '';
    let isPointerDown = false;
    let isDragging = false;
    let startX = 0, startY = 0;
    let startRect = null;
    let cancelNextClick = false;
    const getSiblings = () => {
        const root = findRoot(instanceId);
        if (!root || !dragGroup)
            return [];
        const all = Array.from(root.querySelectorAll(`[data-tree-row][data-tree-drag-group="${dragGroup}"]`));
        const parent = draggingParent !== null && draggingParent !== void 0 ? draggingParent : (draggingRow ? draggingRow.parentElement : null);
        if (!parent)
            return all;
        return all.filter(r => r.parentElement === parent);
    };
    const ensurePlaceholder = (width, height) => {
        if (!placeholder) {
            placeholder = document.createElement('div');
            placeholder.className = 'tree-list-drag-placeholder';
        }
        placeholder.style.width = `${width}px`;
        placeholder.style.height = `${height}px`;
        placeholder.style.marginBottom = window.getComputedStyle(draggingRow).marginBottom;
        return placeholder;
    };
    const computeInsertion = (centerY) => {
        const sibs = getSiblings().filter(s => s !== draggingRow);
        for (let i = 0; i < sibs.length; i++) {
            const r = sibs[i].getBoundingClientRect();
            const mid = r.top + r.height / 2;
            if (centerY < mid) {
                return { beforeEl: sibs[i], index: i };
            }
        }
        if (sibs.length > 0) {
            return { beforeEl: sibs[sibs.length - 1].nextElementSibling, index: sibs.length };
        }
        return { beforeEl: null, index: sibs.length };
    };
    const positionPlaceholder = (centerY) => {
        if (!placeholder)
            return false;
        const parent = draggingParent;
        if (!parent)
            return false;
        const ins = computeInsertion(centerY);
        if (ins.beforeEl) {
            if (placeholder.previousElementSibling !== ins.beforeEl.previousElementSibling || placeholder.nextElementSibling !== ins.beforeEl) {
                parent.insertBefore(placeholder, ins.beforeEl);
                return true;
            }
        }
        else {
            if (parent.lastElementChild !== placeholder) {
                parent.appendChild(placeholder);
                return true;
            }
        }
        return false;
    };
    const flipSiblings = (action) => {
        const sibs = getSiblings();
        const firstRects = new Map();
        for (const s of sibs)
            firstRects.set(s, s.getBoundingClientRect());
        const changed = action();
        if (!changed)
            return;
        for (const s of sibs) {
            s.style.transition = 'none';
            s.style.transform = '';
        }
        for (const s of sibs) {
            if (!s.parentElement)
                continue;
            const first = firstRects.get(s);
            if (!first)
                continue;
            const last = s.getBoundingClientRect();
            const dy = first.top - last.top;
            if (Math.abs(dy) < 1)
                continue;
            s.style.transform = `translateY(${dy}px)`;
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
    const getEffectiveBackground = (el) => {
        let cur = el;
        while (cur) {
            const bg = window.getComputedStyle(cur).backgroundColor;
            if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
                return bg;
            }
            cur = cur.parentElement;
        }
        return '';
    };
    const createGhost = (fromEl, rect) => {
        const clone = fromEl.cloneNode(true);
        clone.classList.add('tree-list-drag-ghost');
        clone.style.left = `${rect.left}px`;
        clone.style.top = `${rect.top}px`;
        clone.style.width = `${rect.width}px`;
        clone.style.height = `${rect.height}px`;
        clone.style.transition = 'none';
        clone.style.transform = 'scale(1.02)';
        const bg = getEffectiveBackground(fromEl);
        if (bg) {
            clone.style.backgroundColor = bg;
        }
        clone.removeAttribute('data-tree-row');
        clone.removeAttribute('data-tree-draggable');
        clone.removeAttribute('data-tree-drag-group');
        document.body.appendChild(clone);
        return clone;
    };
    const restoreRow = (atOriginal) => {
        if (!draggingRow || !draggingParent)
            return;
        if (atOriginal) {
            if (originalNextSibling && originalNextSibling.parentNode === draggingParent) {
                draggingParent.insertBefore(draggingRow, originalNextSibling);
            }
            else if (originalNextSibling === null) {
                draggingParent.appendChild(draggingRow);
            }
            else {
                if (placeholder && placeholder.parentElement === draggingParent) {
                    draggingParent.insertBefore(draggingRow, placeholder);
                }
                else {
                    draggingParent.appendChild(draggingRow);
                }
            }
        }
        else {
            if (placeholder && placeholder.parentElement === draggingParent) {
                draggingParent.insertBefore(draggingRow, placeholder);
            }
            else {
                draggingParent.appendChild(draggingRow);
            }
        }
    };
    const cleanup = () => {
        if (ghost && ghost.parentElement)
            ghost.parentElement.removeChild(ghost);
        ghost = null;
        if (placeholder && placeholder.parentElement)
            placeholder.parentElement.removeChild(placeholder);
        placeholder = null;
        if (hiddenSubtree) {
            hiddenSubtree.style.display = hiddenSubtreePrevDisplay;
            hiddenSubtree = null;
            hiddenSubtreePrevDisplay = '';
        }
    };
    const captureOldIndex = (row) => {
        const sibs = getSiblings();
        return sibs.indexOf(row);
    };
    const startDrag = () => {
        if (!draggingRow)
            return;
        draggingParent = draggingRow.parentElement;
        originalNextSibling = draggingRow.nextSibling;
        oldIndex = captureOldIndex(draggingRow);
        const subtree = getSubtreeEl(draggingRow);
        if (subtree) {
            hiddenSubtree = subtree;
            hiddenSubtreePrevDisplay = subtree.style.display;
            subtree.style.display = 'none';
        }
        startRect = draggingRow.getBoundingClientRect();
        ghost = createGhost(draggingRow, startRect);
        const ph = ensurePlaceholder(startRect.width, startRect.height);
        if (draggingParent) {
            draggingParent.insertBefore(ph, draggingRow);
            draggingParent.removeChild(draggingRow);
        }
        cancelNextClick = true;
        document.addEventListener('click', suppressNextClick, true);
        document.addEventListener('keydown', onKeyDown, true);
    };
    const updateGhost = (clientX, clientY) => {
        if (!ghost || !startRect)
            return;
        const dx = clientX - startX;
        const dy = clientY - startY;
        ghost.style.left = `${startRect.left + dx}px`;
        ghost.style.top = `${startRect.top + dy}px`;
        const centerY = startRect.top + dy + startRect.height / 2;
        flipSiblings(() => positionPlaceholder(centerY));
    };
    const finalizeAndNotify = () => {
        if (!draggingRow || !draggingParent)
            return;
        restoreRow(false);
        if (placeholder && placeholder.parentElement)
            placeholder.parentElement.removeChild(placeholder);
        placeholder = null;
        const sibs = getSiblings();
        const newIndex = sibs.indexOf(draggingRow);
        const orderedIds = sibs.map(s => s.getAttribute('data-tree-row-id') || '');
        if (newIndex === oldIndex || newIndex < 0)
            return;
        const payload = {
            groupId: dragGroup !== null && dragGroup !== void 0 ? dragGroup : '',
            parentId: dragParentId !== null && dragParentId !== void 0 ? dragParentId : '',
            draggedId: draggedRowId !== null && draggedRowId !== void 0 ? draggedRowId : '',
            oldIndex,
            newIndex,
            orderedIds
        };
        safeInvoke(dotNetRef, 'OnReorderFromJs', [payload]);
    };
    const endDrag = (commit) => {
        if (!isPointerDown)
            return;
        document.removeEventListener('keydown', onKeyDown, true);
        if (isDragging) {
            if (commit) {
                flipSiblings(() => {
                    finalizeAndNotify();
                    return true;
                });
            }
            else {
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
    const suppressNextClick = (e) => {
        if (cancelNextClick) {
            e.preventDefault();
            e.stopPropagation();
            cancelNextClick = false;
            document.removeEventListener('click', suppressNextClick, true);
        }
    };
    const onKeyDown = (e) => {
        if (e.key === 'Escape' && isDragging) {
            e.preventDefault();
            e.stopPropagation();
            endDrag(false);
        }
    };
    const pointFromEvent = (ev) => ('touches' in ev ? ev.touches[0] : ev);
    const onPointerDown = (ev) => {
        if (isPointerDown)
            return;
        const root = findRoot(instanceId);
        if (!root)
            return;
        const target = ev.target;
        if (!target || !root.contains(target))
            return;
        const row = findRow(target);
        if (!row)
            return;
        if (row.getAttribute('data-tree-draggable') !== '1')
            return;
        if (target.closest('button'))
            return;
        const group = row.getAttribute('data-tree-drag-group');
        if (group) {
            const groupRows = Array.from(root.querySelectorAll(`[data-tree-row][data-tree-drag-group="${group}"]`))
                .filter(el => el.parentElement === row.parentElement);
            if (groupRows.length <= 1)
                return;
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
    const onPointerMove = (ev) => {
        if (!isPointerDown)
            return;
        const point = pointFromEvent(ev);
        const dx = point.clientX - startX;
        const dy = point.clientY - startY;
        if (!isDragging) {
            if (Math.abs(dy) > DRAG_START_THRESHOLD && Math.abs(dy) > Math.abs(dx)) {
                isDragging = true;
                startDrag();
                if ('preventDefault' in ev) {
                    try {
                        ev.preventDefault();
                    }
                    catch (_) { }
                }
            }
            else {
                return;
            }
        }
        updateGhost(point.clientX, point.clientY);
        if ('preventDefault' in ev) {
            try {
                ev.preventDefault();
            }
            catch (_) { }
        }
    };
    const onPointerUp = () => endDrag(true);
    const onPointerCancel = () => endDrag(false);
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('mousemove', onPointerMove);
    document.addEventListener('mouseup', onPointerUp);
    document.addEventListener('touchstart', onPointerDown, { passive: true });
    document.addEventListener('touchmove', onPointerMove, { passive: false });
    document.addEventListener('touchend', onPointerUp, { passive: true });
    document.addEventListener('touchcancel', onPointerCancel, { passive: true });
    const teardown = () => {
        document.removeEventListener('mousedown', onPointerDown);
        document.removeEventListener('mousemove', onPointerMove);
        document.removeEventListener('mouseup', onPointerUp);
        document.removeEventListener('touchstart', onPointerDown);
        document.removeEventListener('touchmove', onPointerMove);
        document.removeEventListener('touchend', onPointerUp);
        document.removeEventListener('touchcancel', onPointerCancel);
        document.removeEventListener('click', suppressNextClick, true);
        document.removeEventListener('keydown', onKeyDown, true);
        if (isPointerDown)
            endDrag(false);
    };
    instances.set(instanceId, { instanceId, teardown });
}
function dispose(instanceId) {
    const inst = instances.get(instanceId);
    if (!inst)
        return;
    inst.teardown();
    instances.delete(instanceId);
}
export const TreeListDragDropModule = {
    setup,
    dispose
};
//# sourceMappingURL=treeListDragDrop.js.map