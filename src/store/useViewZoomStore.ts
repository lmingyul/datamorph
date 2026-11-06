import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ZoomView = "editor" | "tree" | "table" | "graph" | "diff";
export type ZoomAction = "in" | "out" | "reset";

export const ZOOM_VIEW_LABEL: Record<ZoomView, string> = {
  editor: "编辑",
  tree: "树形",
  table: "表格",
  graph: "节点图",
  diff: "对比",
};

/** 与浏览器缩放档位一致 */
const ZOOM_STEPS = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];

interface ViewZoomState {
  zoom: Partial<Record<ZoomView, number>>;
  /** 最近一次点击或聚焦的视图，快捷键和状态栏缩放作用于它 */
  active: ZoomView | null;
  setActive: (view: ZoomView) => void;
  apply: (view: ZoomView, action: ZoomAction) => void;
}

function step(current: number, action: ZoomAction): number {
  if (action === "reset") return 1;
  const larger = ZOOM_STEPS.filter((s) => s > current + 0.001);
  const smaller = ZOOM_STEPS.filter((s) => s < current - 0.001);
  return action === "in"
    ? (larger[0] ?? ZOOM_STEPS[ZOOM_STEPS.length - 1])
    : (smaller[smaller.length - 1] ?? ZOOM_STEPS[0]);
}

export const useViewZoomStore = create<ViewZoomState>()(
  persist(
    (set) => ({
      zoom: {},
      active: null,
      setActive: (view) => set({ active: view }),
      apply: (view, action) =>
        set((state) => ({
          zoom: { ...state.zoom, [view]: step(state.zoom[view] ?? 1, action) },
        })),
    }),
    {
      name: "datamorph:view-zoom",
      partialize: (state) => ({ zoom: state.zoom }),
    },
  ),
);

/** 视图当前缩放比例，未传视图（工具页等）恒为 1 */
export const useViewZoom = (view?: ZoomView) =>
  useViewZoomStore((s) => (view ? (s.zoom[view] ?? 1) : 1));

// 节点图等自带画布缩放的视图注册自己的处理函数，不走字号缩放
const handlers = new Map<ZoomView, (action: ZoomAction) => void>();

export function registerZoomHandler(
  view: ZoomView,
  handler: (action: ZoomAction) => void,
) {
  handlers.set(view, handler);
  return () => {
    if (handlers.get(view) === handler) handlers.delete(view);
  };
}

export function zoomView(view: ZoomView, action: ZoomAction) {
  const handler = handlers.get(view);
  if (handler) handler(action);
  else useViewZoomStore.getState().apply(view, action);
}
