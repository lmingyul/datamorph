import { useEffect } from "react";
import { Minus, Plus } from "lucide-react";

import {
  useViewZoom,
  useViewZoomStore,
  zoomView,
  ZOOM_VIEW_LABEL,
  type ZoomAction,
  type ZoomView,
} from "@/store/useViewZoomStore";

const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = IS_MAC ? "⌘" : "Ctrl+";

// 按物理键位识别，非美式键盘布局也能用；key 兜底小键盘和 Shift 组合
const ACTION_BY_CODE: Record<string, ZoomAction> = {
  Equal: "in",
  NumpadAdd: "in",
  Minus: "out",
  NumpadSubtract: "out",
  Digit0: "reset",
  Numpad0: "reset",
};
const ACTION_BY_KEY: Record<string, ZoomAction> = {
  "=": "in",
  "+": "in",
  "-": "out",
  _: "out",
  "0": "reset",
};

const paneOf = (target: EventTarget | null) =>
  target instanceof Element
    ? target.closest<HTMLElement>("[data-zoom-view]")
    : null;

function zoomTarget(): ZoomView | null {
  // 弹窗打开时不缩放背后的视图
  if (document.activeElement?.closest("[role=dialog]")) return null;
  const focused = paneOf(document.activeElement)?.dataset.zoomView;
  if (focused) return focused as ZoomView;
  const views = Array.from(
    document.querySelectorAll<HTMLElement>("[data-zoom-view]"),
    (pane) => pane.dataset.zoomView as ZoomView,
  );
  const { active } = useViewZoomStore.getState();
  return active && views.includes(active) ? active : (views[0] ?? null);
}

/** ⌘/Ctrl + = - 0 缩放当前视图，替代浏览器和 uTools 的整页缩放 */
export function useViewZoomShortcuts() {
  useEffect(() => {
    const remember = (event: Event) => {
      const view = paneOf(event.target)?.dataset.zoomView;
      if (view) useViewZoomStore.getState().setActive(view as ZoomView);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = IS_MAC ? event.metaKey : event.ctrlKey;
      if (!mod || event.altKey || (IS_MAC && event.ctrlKey)) return;
      const action = ACTION_BY_CODE[event.code] ?? ACTION_BY_KEY[event.key];
      const view = action && zoomTarget();
      if (!view) return;
      event.preventDefault();
      event.stopPropagation();
      useViewZoomStore.getState().setActive(view);
      zoomView(view, action);
    };
    window.addEventListener("pointerdown", remember, true);
    window.addEventListener("focusin", remember, true);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("pointerdown", remember, true);
      window.removeEventListener("focusin", remember, true);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, []);
}

/** 状态栏缩放控件，作用于最近操作的视图；节点图自带缩放按钮，不在这里显示 */
export function ViewZoomControl({ views }: { views: ZoomView[] }) {
  const active = useViewZoomStore((s) => s.active);
  const target = active && views.includes(active) ? active : views[0];
  const zoom = useViewZoom(target);
  if (!target || target === "graph") return null;

  const label = ZOOM_VIEW_LABEL[target];
  return (
    <span className="status-zoom">
      <button
        type="button"
        aria-label={`缩小${label}视图`}
        title={`缩小（${MOD}-）`}
        onClick={() => zoomView(target, "out")}
      >
        <Minus />
      </button>
      <button
        type="button"
        className="status-zoom-value"
        title={`${label}视图缩放，点击还原（${MOD}0）`}
        onClick={() => zoomView(target, "reset")}
      >
        {views.length > 1 && `${label} `}
        {Math.round(zoom * 100)}%
      </button>
      <button
        type="button"
        aria-label={`放大${label}视图`}
        title={`放大（${MOD}+）`}
        onClick={() => zoomView(target, "in")}
      >
        <Plus />
      </button>
    </span>
  );
}
