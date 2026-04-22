import { ThreadId } from "@t3tools/contracts";
import { createFileRoute, retainSearchParams, useNavigate } from "@tanstack/react-router";
import { Suspense, lazy, type ReactNode, useCallback, useEffect, useRef, useState } from "react";

import ChatView from "../components/ChatView";
import { DiffWorkerPoolProvider } from "../components/DiffWorkerPoolProvider";
import {
  DiffPanelHeaderSkeleton,
  DiffPanelLoadingState,
  DiffPanelShell,
  type DiffPanelMode,
} from "../components/DiffPanelShell";
import { useComposerDraftStore } from "../composerDraftStore";
import { useFilesPanelStore } from "../filesPanelStore";
import {
  type DiffRouteSearch,
  parseDiffRouteSearch,
  stripDiffSearchParams,
} from "../diffRouteSearch";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { useStore } from "../store";
import { Sheet, SheetPopup } from "../components/ui/sheet";
import { Sidebar, SidebarInset, SidebarProvider, SidebarRail } from "~/components/ui/sidebar";
import { AppLoadingScreen } from "../components/AppLoadingScreen";

const DiffPanel = lazy(() => import("../components/DiffPanel"));
const FilesPanel = lazy(() => import("../components/FilesPanel"));
const DIFF_INLINE_LAYOUT_MEDIA_QUERY = "(max-width: 1180px)";
const DIFF_INLINE_SIDEBAR_WIDTH_STORAGE_KEY = "chat_diff_sidebar_width";
const DIFF_INLINE_DEFAULT_WIDTH = "clamp(28rem,48vw,44rem)";
const DIFF_INLINE_SIDEBAR_MIN_WIDTH = 26 * 16;
// Files panel hosts BOTH the tree and (when a file is open) the editor inside
// its horizontal split, so the default is wide enough to show both panes
// comfortably. Users can resize down to FILES_INLINE_SIDEBAR_MIN_WIDTH for a
// tree-only view.
const FILES_INLINE_SIDEBAR_WIDTH_STORAGE_KEY = "chat_files_sidebar_width";
const FILES_INLINE_DEFAULT_WIDTH = "clamp(28rem,48vw,48rem)";
// 30rem (480px) is wide enough that the horizontal split (editor + tree) stays
// legible even at the smallest resize. Anything narrower collapses the editor
// column to the point where CodeMirror starts wrapping unusably and the tree
// overlaps the breadcrumb — the sidebar primitive's clamp enforces this.
const FILES_INLINE_SIDEBAR_MIN_WIDTH = 30 * 16;
const COMPOSER_COMPACT_MIN_LEFT_CONTROLS_WIDTH_PX = 208;

const DiffPanelSheet = (props: {
  children: ReactNode;
  diffOpen: boolean;
  onCloseDiff: () => void;
}) => {
  return (
    <Sheet
      open={props.diffOpen}
      onOpenChange={(open) => {
        if (!open) {
          props.onCloseDiff();
        }
      }}
    >
      <SheetPopup
        side="right"
        showCloseButton={false}
        keepMounted
        className="w-[min(88vw,820px)] max-w-[820px] p-0"
      >
        {props.children}
      </SheetPopup>
    </Sheet>
  );
};

const DiffLoadingFallback = (props: { mode: DiffPanelMode }) => {
  return (
    <DiffPanelShell mode={props.mode} header={<DiffPanelHeaderSkeleton />}>
      <DiffPanelLoadingState label="Loading diff viewer..." />
    </DiffPanelShell>
  );
};

const LazyDiffPanel = (props: { mode: DiffPanelMode }) => {
  return (
    <DiffWorkerPoolProvider>
      <Suspense fallback={<DiffLoadingFallback mode={props.mode} />}>
        <DiffPanel mode={props.mode} />
      </Suspense>
    </DiffWorkerPoolProvider>
  );
};

const DiffPanelInlineSidebar = (props: {
  diffOpen: boolean;
  onCloseDiff: () => void;
  onOpenDiff: () => void;
  renderDiffContent: boolean;
}) => {
  const { diffOpen, onCloseDiff, onOpenDiff, renderDiffContent } = props;
  const onOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        onOpenDiff();
        return;
      }
      onCloseDiff();
    },
    [onCloseDiff, onOpenDiff],
  );
  const shouldAcceptInlineSidebarWidth = useCallback(
    ({ nextWidth, wrapper }: { nextWidth: number; wrapper: HTMLElement }) => {
      const composerForm = document.querySelector<HTMLElement>("[data-chat-composer-form='true']");
      if (!composerForm) return true;
      const composerViewport = composerForm.parentElement;
      if (!composerViewport) return true;
      const previousSidebarWidth = wrapper.style.getPropertyValue("--sidebar-width");
      wrapper.style.setProperty("--sidebar-width", `${nextWidth}px`);

      const viewportStyle = window.getComputedStyle(composerViewport);
      const viewportPaddingLeft = Number.parseFloat(viewportStyle.paddingLeft) || 0;
      const viewportPaddingRight = Number.parseFloat(viewportStyle.paddingRight) || 0;
      const viewportContentWidth = Math.max(
        0,
        composerViewport.clientWidth - viewportPaddingLeft - viewportPaddingRight,
      );
      const formRect = composerForm.getBoundingClientRect();
      const composerFooter = composerForm.querySelector<HTMLElement>(
        "[data-chat-composer-footer='true']",
      );
      const composerRightActions = composerForm.querySelector<HTMLElement>(
        "[data-chat-composer-actions='right']",
      );
      const composerRightActionsWidth = composerRightActions?.getBoundingClientRect().width ?? 0;
      const composerFooterGap = composerFooter
        ? Number.parseFloat(window.getComputedStyle(composerFooter).columnGap) ||
          Number.parseFloat(window.getComputedStyle(composerFooter).gap) ||
          0
        : 0;
      const minimumComposerWidth =
        COMPOSER_COMPACT_MIN_LEFT_CONTROLS_WIDTH_PX + composerRightActionsWidth + composerFooterGap;
      const hasComposerOverflow = composerForm.scrollWidth > composerForm.clientWidth + 0.5;
      const overflowsViewport = formRect.width > viewportContentWidth + 0.5;
      const violatesMinimumComposerWidth = composerForm.clientWidth + 0.5 < minimumComposerWidth;

      if (previousSidebarWidth.length > 0) {
        wrapper.style.setProperty("--sidebar-width", previousSidebarWidth);
      } else {
        wrapper.style.removeProperty("--sidebar-width");
      }

      return !hasComposerOverflow && !overflowsViewport && !violatesMinimumComposerWidth;
    },
    [],
  );

  return (
    <SidebarProvider
      defaultOpen={false}
      open={diffOpen}
      onOpenChange={onOpenChange}
      className="w-auto min-h-0 flex-none bg-transparent"
      style={{ "--sidebar-width": DIFF_INLINE_DEFAULT_WIDTH } as React.CSSProperties}
      data-chat-diff-inline-wrapper=""
    >
      <Sidebar
        side="right"
        collapsible="offcanvas"
        className="border-l border-border bg-card text-foreground"
        resizable={{
          minWidth: DIFF_INLINE_SIDEBAR_MIN_WIDTH,
          shouldAcceptWidth: shouldAcceptInlineSidebarWidth,
          storageKey: DIFF_INLINE_SIDEBAR_WIDTH_STORAGE_KEY,
        }}
      >
        {renderDiffContent ? <LazyDiffPanel mode="sidebar" /> : null}
        <SidebarRail />
      </Sidebar>
    </SidebarProvider>
  );
};

const FilesLoadingFallback = (props: { mode: DiffPanelMode }) => {
  return (
    <DiffPanelShell mode={props.mode} header={<DiffPanelHeaderSkeleton />}>
      <DiffPanelLoadingState label="Loading files panel..." />
    </DiffPanelShell>
  );
};

const LazyFilesPanel = (props: { mode: DiffPanelMode }) => {
  return (
    <Suspense fallback={<FilesLoadingFallback mode={props.mode} />}>
      <FilesPanel mode={props.mode} />
    </Suspense>
  );
};

/**
 * Inline sidebar host for the Files panel. Docks on the right, immediately
 * left of the Diff panel, so the layout reads as [chat][file editor][files][diff].
 *
 * Both Files and Diff can be open at once, so we reuse the same composer-aware
 * width constraint to keep the composer usable when the user has
 * three sidebars stacked.
 */
const FilesPanelInlineSidebar = (props: {
  filesOpen: boolean;
  onCloseFiles: () => void;
  onOpenFiles: () => void;
  renderFilesContent: boolean;
  diffOpen: boolean;
}) => {
  const { filesOpen, onCloseFiles, onOpenFiles, renderFilesContent, diffOpen } = props;
  // Both Files and Diff inline panels use shadcn's Sidebar primitive with
  // collapsible="offcanvas", which positions the visible container with
  // `position: fixed; right: 0`. When both are open, each panel reserves its
  // horizontal space via its `sidebar-gap` div (so the chat is pushed left by
  // files_width + diff_width), but both fixed containers collide at the
  // viewport's right edge and overlap — leaving a visible empty band between
  // the chat and the diff panel equal to the files panel's width.
  //
  // Fix: when the diff panel is also open, shift the files panel's fixed
  // container left by the diff panel's current rendered width. We observe the
  // diff wrapper's width directly so this stays correct across user resizes
  // and the clamp(…) default.
  const [diffInlineWidth, setDiffInlineWidth] = useState(0);
  const diffWrapperRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!diffOpen) {
      setDiffInlineWidth(0);
      diffWrapperRef.current = null;
      return;
    }
    const wrapper = document.querySelector<HTMLElement>("[data-chat-diff-inline-wrapper]");
    if (!wrapper) return;
    diffWrapperRef.current = wrapper;
    setDiffInlineWidth(wrapper.offsetWidth);
    const observer = new ResizeObserver(() => {
      setDiffInlineWidth(wrapper.offsetWidth);
    });
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, [diffOpen]);
  const onOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        onOpenFiles();
        return;
      }
      onCloseFiles();
    },
    [onCloseFiles, onOpenFiles],
  );
  const shouldAcceptInlineSidebarWidth = useCallback(
    ({ nextWidth, wrapper }: { nextWidth: number; wrapper: HTMLElement }) => {
      const composerForm = document.querySelector<HTMLElement>("[data-chat-composer-form='true']");
      if (!composerForm) return true;
      const composerViewport = composerForm.parentElement;
      if (!composerViewport) return true;
      const previousSidebarWidth = wrapper.style.getPropertyValue("--sidebar-width");
      wrapper.style.setProperty("--sidebar-width", `${nextWidth}px`);

      const viewportStyle = window.getComputedStyle(composerViewport);
      const viewportPaddingLeft = Number.parseFloat(viewportStyle.paddingLeft) || 0;
      const viewportPaddingRight = Number.parseFloat(viewportStyle.paddingRight) || 0;
      const viewportContentWidth = Math.max(
        0,
        composerViewport.clientWidth - viewportPaddingLeft - viewportPaddingRight,
      );
      const formRect = composerForm.getBoundingClientRect();
      const composerFooter = composerForm.querySelector<HTMLElement>(
        "[data-chat-composer-footer='true']",
      );
      const composerRightActions = composerForm.querySelector<HTMLElement>(
        "[data-chat-composer-actions='right']",
      );
      const composerRightActionsWidth = composerRightActions?.getBoundingClientRect().width ?? 0;
      const composerFooterGap = composerFooter
        ? Number.parseFloat(window.getComputedStyle(composerFooter).columnGap) ||
          Number.parseFloat(window.getComputedStyle(composerFooter).gap) ||
          0
        : 0;
      const minimumComposerWidth =
        COMPOSER_COMPACT_MIN_LEFT_CONTROLS_WIDTH_PX + composerRightActionsWidth + composerFooterGap;
      const hasComposerOverflow = composerForm.scrollWidth > composerForm.clientWidth + 0.5;
      const overflowsViewport = formRect.width > viewportContentWidth + 0.5;
      const violatesMinimumComposerWidth = composerForm.clientWidth + 0.5 < minimumComposerWidth;

      if (previousSidebarWidth.length > 0) {
        wrapper.style.setProperty("--sidebar-width", previousSidebarWidth);
      } else {
        wrapper.style.removeProperty("--sidebar-width");
      }

      return !hasComposerOverflow && !overflowsViewport && !violatesMinimumComposerWidth;
    },
    [],
  );

  return (
    <SidebarProvider
      defaultOpen={false}
      open={filesOpen}
      onOpenChange={onOpenChange}
      className="w-auto min-h-0 flex-none bg-transparent"
      style={{ "--sidebar-width": FILES_INLINE_DEFAULT_WIDTH } as React.CSSProperties}
    >
      <Sidebar
        side="right"
        collapsible="offcanvas"
        className="border-l border-border bg-card text-foreground"
        resizable={{
          minWidth: FILES_INLINE_SIDEBAR_MIN_WIDTH,
          shouldAcceptWidth: shouldAcceptInlineSidebarWidth,
          storageKey: FILES_INLINE_SIDEBAR_WIDTH_STORAGE_KEY,
        }}
        style={
          filesOpen && diffOpen && diffInlineWidth > 0
            ? ({ right: `${diffInlineWidth}px` } as React.CSSProperties)
            : undefined
        }
      >
        {renderFilesContent ? <LazyFilesPanel mode="sidebar" /> : null}
        <SidebarRail />
      </Sidebar>
    </SidebarProvider>
  );
};

const FilesPanelSheet = (props: {
  children: ReactNode;
  filesOpen: boolean;
  onCloseFiles: () => void;
}) => {
  return (
    <Sheet
      open={props.filesOpen}
      onOpenChange={(open) => {
        if (!open) {
          props.onCloseFiles();
        }
      }}
    >
      <SheetPopup
        side="right"
        showCloseButton={false}
        keepMounted
        className="w-[min(88vw,560px)] max-w-[560px] p-0"
      >
        {props.children}
      </SheetPopup>
    </Sheet>
  );
};

function ChatThreadRouteView() {
  const bootstrapComplete = useStore((store) => store.bootstrapComplete);
  const navigate = useNavigate();
  const threadId = Route.useParams({
    select: (params) => ThreadId.makeUnsafe(params.threadId),
  });
  const search = Route.useSearch();
  const threadExists = useStore((store) => store.threads.some((thread) => thread.id === threadId));
  const draftThreadExists = useComposerDraftStore((store) =>
    Object.hasOwn(store.draftThreadsByThreadId, threadId),
  );
  const routeThreadExists = threadExists || draftThreadExists;
  const diffOpen = search.diff === "1";
  const shouldUseDiffSheet = useMediaQuery(DIFF_INLINE_LAYOUT_MEDIA_QUERY);
  // Files panel open state is store-driven (not URL-driven) so it stays open
  // across thread navigation — matches VS Code where the explorer persists.
  const filesOpen = useFilesPanelStore((s) => s.open);
  const setFilesOpen = useFilesPanelStore((s) => s.setOpen);
  // TanStack Router keeps active route components mounted across param-only navigations
  // unless remountDeps are configured, so this stays warm across thread switches.
  const [hasOpenedDiff, setHasOpenedDiff] = useState(diffOpen);
  const [hasOpenedFiles, setHasOpenedFiles] = useState(filesOpen);
  const closeDiff = useCallback(() => {
    void navigate({
      to: "/$threadId",
      params: { threadId },
      search: { diff: undefined },
    });
  }, [navigate, threadId]);
  const openDiff = useCallback(() => {
    void navigate({
      to: "/$threadId",
      params: { threadId },
      search: (previous) => {
        const rest = stripDiffSearchParams(previous);
        return { ...rest, diff: "1" };
      },
    });
  }, [navigate, threadId]);

  useEffect(() => {
    if (diffOpen) {
      setHasOpenedDiff(true);
    }
  }, [diffOpen]);

  useEffect(() => {
    if (filesOpen) {
      setHasOpenedFiles(true);
    }
  }, [filesOpen]);

  const closeFiles = useCallback(() => setFilesOpen(false), [setFilesOpen]);
  const openFiles = useCallback(() => setFilesOpen(true), [setFilesOpen]);

  useEffect(() => {
    if (!bootstrapComplete) {
      return;
    }

    if (!routeThreadExists) {
      void navigate({ to: "/", replace: true });
      return;
    }
  }, [bootstrapComplete, navigate, routeThreadExists, threadId]);

  if (!bootstrapComplete || !routeThreadExists) {
    return <AppLoadingScreen />;
  }

  const shouldRenderDiffContent = diffOpen || hasOpenedDiff;
  const shouldRenderFilesContent = filesOpen || hasOpenedFiles;

  if (!shouldUseDiffSheet) {
    return (
      <>
        {/*
          Layout order (left → right):
            App sidebar → Chat → Files panel (editor + tree) → Diff panel
          The Files panel hosts its own editor internally via a horizontal split
          when a file is open, so we intentionally avoid a separate
          FileEditorInlineSidebar — two right-docked `fixed` sidebars would
          otherwise stomp each other and leave a dead gap next to the chat.
        */}
        <SidebarInset className="h-dvh  min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground">
          <ChatView threadId={threadId} />
        </SidebarInset>
        <FilesPanelInlineSidebar
          filesOpen={filesOpen}
          onCloseFiles={closeFiles}
          onOpenFiles={openFiles}
          renderFilesContent={shouldRenderFilesContent}
          diffOpen={diffOpen}
        />
        <DiffPanelInlineSidebar
          diffOpen={diffOpen}
          onCloseDiff={closeDiff}
          onOpenDiff={openDiff}
          renderDiffContent={shouldRenderDiffContent}
        />
      </>
    );
  }

  return (
    <>
      <FilesPanelSheet filesOpen={filesOpen} onCloseFiles={closeFiles}>
        {shouldRenderFilesContent ? <LazyFilesPanel mode="sheet" /> : null}
      </FilesPanelSheet>
      <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground">
        <ChatView threadId={threadId} />
      </SidebarInset>
      <DiffPanelSheet diffOpen={diffOpen} onCloseDiff={closeDiff}>
        {shouldRenderDiffContent ? <LazyDiffPanel mode="sheet" /> : null}
      </DiffPanelSheet>
    </>
  );
}

export const Route = createFileRoute("/_chat/$threadId")({
  validateSearch: (search) => parseDiffRouteSearch(search),
  search: {
    middlewares: [retainSearchParams<DiffRouteSearch>(["diff"])],
  },
  component: ChatThreadRouteView,
});
