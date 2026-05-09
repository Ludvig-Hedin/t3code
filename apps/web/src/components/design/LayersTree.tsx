/**
 * LayersTree — renders the reported DOM as a nested tree. Click to select,
 * drag within a parent to reorder. Cross-parent moves are rejected by the
 * server in this phase.
 */
import { useMemo } from "react";

import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronRightIcon, GripVerticalIcon } from "lucide-react";

import type { DesignNode } from "~/design/bridge";

export interface LayersTreeProps {
  readonly nodes: readonly DesignNode[];
  readonly selectedOid: string | null;
  readonly onSelect: (oid: string | null) => void;
  readonly onHover: (oid: string | null) => void;
  readonly onReorder: (oid: string, beforeOid: string | null) => void;
}

interface TreeNode {
  readonly node: DesignNode;
  readonly children: TreeNode[];
  readonly depth: number;
}

function buildTree(nodes: readonly DesignNode[]): TreeNode[] {
  const byParent = new Map<string | null, DesignNode[]>();
  for (const n of nodes) {
    const bucket = byParent.get(n.parentOid) ?? [];
    bucket.push(n);
    byParent.set(n.parentOid, bucket);
  }
  const build = (parentOid: string | null, depth: number): TreeNode[] => {
    const kids = byParent.get(parentOid) ?? [];
    return kids.map((n) => ({
      node: n,
      depth,
      children: build(n.oid, depth + 1),
    }));
  };
  return build(null, 0);
}

export function LayersTree({ nodes, selectedOid, onSelect, onHover, onReorder }: LayersTreeProps) {
  const tree = useMemo(() => buildTree(nodes), [nodes]);
  const rootSortableIds = useMemo(() => tree.map((tn) => tn.node.oid), [tree]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  if (tree.length === 0) {
    return (
      <div className="flex flex-col gap-1 p-3 text-[11px] text-muted-foreground/70">
        <span className="font-medium text-foreground/80">No elements yet</span>
        <span className="text-muted-foreground/60">
          They'll appear here once the preview loads.
        </span>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={(event: DragEndEvent) => {
        const activeId = String(event.active.id);
        const overId = event.over ? String(event.over.id) : null;
        if (!overId || activeId === overId) return;
        // Same-parent reorder only — the dnd-kit sortable context below is
        // constructed per-parent, so `over` will always be a valid sibling.
        onReorder(activeId, overId);
      }}
    >
      <SortableContext items={rootSortableIds} strategy={verticalListSortingStrategy}>
        <ul className="flex flex-col py-1 text-[11px]">
          {tree.map((tn) => (
            <TreeLevel
              key={tn.node.oid}
              nodes={tn.children}
              self={tn}
              selectedOid={selectedOid}
              onSelect={onSelect}
              onHover={onHover}
              onReorder={onReorder}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

interface TreeLevelProps {
  readonly self: TreeNode;
  readonly nodes: readonly TreeNode[];
  readonly selectedOid: string | null;
  readonly onSelect: (oid: string | null) => void;
  readonly onHover: (oid: string | null) => void;
  readonly onReorder: (oid: string, beforeOid: string | null) => void;
}

function TreeLevel({ self, nodes, selectedOid, onSelect, onHover, onReorder }: TreeLevelProps) {
  const siblingIds = useMemo(() => nodes.map((n) => n.node.oid), [nodes]);
  return (
    <>
      <TreeRow node={self} selectedOid={selectedOid} onSelect={onSelect} onHover={onHover} />

      {nodes.length > 0 && (
        <SortableContext items={siblingIds} strategy={verticalListSortingStrategy}>
          {nodes.map((child) => (
            <TreeLevel
              key={child.node.oid}
              self={child}
              nodes={child.children}
              selectedOid={selectedOid}
              onSelect={onSelect}
              onHover={onHover}
              onReorder={onReorder}
            />
          ))}
        </SortableContext>
      )}
    </>
  );
}

interface TreeRowProps {
  readonly node: TreeNode;
  readonly selectedOid: string | null;
  readonly onSelect: (oid: string | null) => void;
  readonly onHover: (oid: string | null) => void;
}

function TreeRow({ node, selectedOid, onSelect, onHover }: TreeRowProps) {
  const sortable = useSortable({ id: node.node.oid });
  const isSelected = selectedOid === node.node.oid;

  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
    paddingLeft: `${node.depth * 12 + 8}px`,
  };

  const hasChildren = node.children.length > 0;
  const classPreview = node.node.className
    ? node.node.className.split(/\s+/).filter(Boolean).slice(0, 2).join(" ")
    : null;

  return (
    <li
      ref={sortable.setNodeRef}
      style={style}
      className={`group flex cursor-pointer items-center gap-1 rounded-sm py-0.5 pr-2 ${
        isSelected ? "bg-primary/15 text-foreground ring-1 ring-primary/30" : "hover:bg-muted/60"
      } ${sortable.isDragging ? "opacity-50" : ""}`}
      onMouseEnter={() => onHover(node.node.oid)}
      onMouseLeave={() => onHover(null)}
      onClick={() => {
        // Click-again to deselect — matches Figma/Framer layers-panel behavior.
        if (isSelected) onSelect(null);
        else onSelect(node.node.oid);
      }}
      aria-selected={isSelected}
      title={node.node.className ?? undefined}
    >
      {hasChildren ? (
        <ChevronRightIcon
          className={`size-3 shrink-0 rotate-90 ${isSelected ? "text-primary" : "text-muted-foreground/60"}`}
        />
      ) : (
        <span className="size-3 shrink-0" />
      )}
      <span
        className={`shrink-0 truncate font-mono ${
          isSelected ? "text-primary" : "text-foreground/90"
        }`}
      >
        {node.node.tag}
      </span>
      {classPreview && (
        <span className="shrink truncate font-mono text-muted-foreground/50">
          .{classPreview.replace(/\s+/g, ".")}
        </span>
      )}
      {node.node.textPreview && (
        <span className="ml-1 min-w-0 truncate text-muted-foreground/70">
          {node.node.textPreview}
        </span>
      )}
      <button
        type="button"
        {...sortable.attributes}
        {...sortable.listeners}
        className="ml-auto hidden size-4 shrink-0 items-center justify-center text-muted-foreground/50 hover:text-foreground group-hover:flex"
        aria-label="Drag to reorder within parent"
        title="Drag to reorder"
        onClick={(e) => e.stopPropagation()}
      >
        <GripVerticalIcon className="size-3" />
      </button>
    </li>
  );
}
