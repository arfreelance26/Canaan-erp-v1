"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  closestCenter,
  pointerWithin,
  type CollisionDetection,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { cx } from "@/utils/cx";

/** The card under the pointer; with no pointer (keyboard), the nearest one. */
const underPointer: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length ? hits : closestCenter(args);
};

/**
 * A grid of cards the person can drag into their own order, like tickets on a
 * Jira or ClickUp board. The order is saved per browser under `storageKey`;
 * items that appear later go to the end, ones that disappear are dropped.
 *
 * While dragging, the cards stay where they are: a copy of the card follows
 * the hand cursor, its own slot shows a dashed outline, and the card it will
 * swap with is highlighted. Dropping swaps the two; the rest stay put.
 *
 * The whole card is the drag area (it starts after a 6px move, so clicks and
 * links inside still work). Keyboard: focus a card, Space to lift, arrows to
 * move, Space to drop, Esc to cancel.
 */
export function SortableGrid<T>({
  items,
  getId,
  storageKey,
  renderItem,
  className,
  label,
}: {
  items: T[];
  getId: (item: T) => string;
  /** localStorage key for the saved order; leave out to not remember it. */
  storageKey?: string;
  renderItem: (item: T, state: { dragging: boolean }) => ReactNode;
  className?: string;
  /** What the cards are, for screen readers ("tickets"). */
  label?: string;
}) {
  const [order, setOrder] = useSavedOrder(storageKey);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const byId = useMemo(() => new Map(items.map((it) => [getId(it), it])), [items, getId]);
  const ids = useMemo(() => {
    const known = order.filter((id) => byId.has(id));
    return [...known, ...[...byId.keys()].filter((id) => !known.includes(id))];
  }, [order, byId]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // The grabbing hand stays on wherever the pointer goes during a drag.
  useEffect(() => {
    if (!activeId) return;
    document.body.classList.add("is-dragging");
    return () => document.body.classList.remove("is-dragging");
  }, [activeId]);

  function finish() {
    setActiveId(null);
    setOverId(null);
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    finish();
    if (!over || active.id === over.id) return;
    // The two cards swap places; every other card stays where it is.
    const next = [...ids];
    const from = next.indexOf(String(active.id));
    const to = next.indexOf(String(over.id));
    [next[from], next[to]] = [next[to], next[from]];
    setOrder(next);
  }

  const target = overId && overId !== activeId ? overId : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={underPointer}
      // Re-measure every card during the drag, so cards scrolled into view
      // (the page scrolls when dragging near its edge) can be dropped on too.
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      autoScroll={{ threshold: { x: 0, y: 0.15 }, acceleration: 12 }}
      onDragStart={({ active }) => setActiveId(String(active.id))}
      onDragOver={({ over }) => setOverId(over ? String(over.id) : null)}
      onDragEnd={onDragEnd}
      onDragCancel={finish}
      accessibility={{
        screenReaderInstructions: {
          draggable: `To move one of the ${label ?? "cards"}, press Space, use the arrow keys, then Space again to drop it. Esc cancels.`,
        },
      }}
    >
      {/* No live reshuffle (cards differ in height): the target is highlighted instead. */}
      <SortableContext items={ids} strategy={() => null}>
        <div className={className}>
          {ids.map((id) => (
            <SortableCard key={id} id={id} source={id === activeId} target={id === target}>
              {renderItem(byId.get(id)!, { dragging: false })}
            </SortableCard>
          ))}
        </div>
      </SortableContext>
      <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.2, 0, 0, 1)" }}>
        {activeId && byId.has(activeId) ? (
          <div className="h-full cursor-grabbing [&_*]:cursor-grabbing">{renderItem(byId.get(activeId)!, { dragging: true })}</div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function SortableCard({ id, source, target, children }: { id: string; source: boolean; target: boolean; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, isDragging } = useSortable({ id });
  // A drag ends with a click on the card; swallow it so links don't open.
  const dragged = useRef(false);
  useEffect(() => {
    if (isDragging) dragged.current = true;
  }, [isDragging]);

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClickCapture={(e) => {
        if (!dragged.current) return;
        dragged.current = false;
        e.preventDefault();
        e.stopPropagation();
      }}
      onPointerDown={(e) => {
        dragged.current = false;
        listeners?.onPointerDown?.(e);
      }}
      className={cx(
        "relative h-full touch-manipulation rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring",
        "cursor-grab [&_*]:cursor-grab",
      )}
    >
      {/* Its own slot while it's lifted: an empty dashed outline. */}
      <div className={cx("h-full", source && "invisible")}>{children}</div>
      {source && <div aria-hidden className="absolute inset-0 rounded-xl border-2 border-dashed border-separator-border bg-fill-1" />}
      {/* Where it will land. */}
      {target && (
        <div aria-hidden className="pointer-events-none absolute inset-0 flex items-start justify-center rounded-xl border-2 border-dashed border-accent-border-strong bg-accent-surface/70">
          <span className="mt-3 rounded-full bg-accent-solid px-2.5 py-0.5 text-caption-1-medium text-on-solid shadow-sm">Drop here</span>
        </div>
      )}
    </div>
  );
}

/** The saved id order (empty until the person reorders). */
function useSavedOrder(storageKey?: string): [string[], (next: string[]) => void] {
  const [order, setOrderState] = useState<string[]>([]);
  useEffect(() => {
    if (!storageKey) return;
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
      setOrderState(Array.isArray(saved) ? saved : []);
    } catch {
      setOrderState([]);
    }
  }, [storageKey]);
  const setOrder = useCallback(
    (next: string[]) => {
      setOrderState(next);
      if (!storageKey) return;
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* private window: the order lasts until reload */
      }
    },
    [storageKey],
  );
  return [order, setOrder];
}
