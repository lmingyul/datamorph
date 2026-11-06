import { jsonPathLanguage } from "@/utils/jsonPathLanguage";
import { useTabStore } from "@/store/useTabStore";
import { useViewZoom, type ZoomView } from "@/store/useViewZoomStore";
import { useEffect, useRef, useImperativeHandle } from "react";
import { useTheme } from "next-themes";
import {
  createJSONEditor,
  isTextContent,
  isJSONContent,
  Mode,
  type JsonEditor,
  type Content,
  type JSONEditorSelection,
  type MenuItem,
  type RenderMenuContext,
} from "vanilla-jsoneditor-cn";
import {
  parse as parseLossless,
  stringify as stringifyLossless,
} from "lossless-json";
import "vanilla-jsoneditor-cn/themes/jse-theme-dark.css";
import "@/styles/vanilla.css";
export interface VanillaJsonEditorRef {
  updateEditorContentAndMode: (mode: Mode, content: Content) => void;
}
export interface VanillaJsonEditorProps {
  ref?: React.Ref<VanillaJsonEditorRef>;
  tabKey: string;
  height?: number | string;
  content?: Content;
  mode?: Mode;
  onUpdateValue?: (value: Content) => void;
  onChangeMode?: (mode: Mode) => void;
  onMount?: () => void;
  /** 工作区视图的缩放档位，未传时不缩放 */
  zoomView?: ZoomView;
}
const parser = { parse: parseLossless, stringify: stringifyLossless };
export default function VanillaJsonEditor({
  ref,
  tabKey,
  content,
  mode = Mode.tree,
  height = "100%",
  onUpdateValue,
  onChangeMode,
  onMount,
  zoomView,
}: VanillaJsonEditorProps) {
  const zoom = useViewZoom(zoomView);
  const container = useRef<HTMLDivElement>(null);
  const instance = useRef<JsonEditor | null>(null);
  const callback = useRef(onUpdateValue);
  callback.current = onUpdateValue;
  const modeCallback = useRef(onChangeMode);
  modeCallback.current = onChangeMode;
  const last = useRef(content);
  const { resolvedTheme } = useTheme();
  useImperativeHandle(
    ref,
    () => ({
      updateEditorContentAndMode: (nextMode, next) => {
        instance.current?.update(next);
        instance.current?.updateProps({ mode: nextMode });
      },
    }),
    [],
  );
  useEffect(() => {
    if (!container.current) return;
    const target = container.current;
    const saved = useTabStore.getState().getTabByKey(tabKey)?.toolState[
      "tree:view"
    ] as
      | { expanded: string[]; scroll: number; selection?: JSONEditorSelection }
      | undefined;
    let selection = saved?.selection;
    const editor = createJSONEditor({
      target: container.current,
      props: {
        content: content || { text: "" },
        mode,
        parser,
        validationParser: parser,
        queryLanguages: [jsonPathLanguage],
        queryLanguageId: "jsonpath",
        indentation:
          useTabStore.getState().getTabByKey(tabKey)?.editorSettings
            .indentSize || 2,
        selection,
        onSelect: (next: JSONEditorSelection | undefined) => {
          selection = next;
        },
        onChange: (value: Content) => {
          // Transform can emit { json, text: undefined }; strip the inactive
          // representation so consumers do not mistake it for text content.
          const next = isTextContent(value)
            ? { text: value.text }
            : isJSONContent(value)
              ? { json: value.json }
              : null;
          if (!next) return;
          last.current = next;
          callback.current?.(next);
        },
        onChangeMode: (value: Mode) => modeCallback.current?.(value),
        // 编辑器和表格在外层已有入口，树形里不再放模式切换。文本模式保留切换按钮：
        // 无效 JSON 点「手动修复」会进入文本模式，没有按钮就回不到树形。
        onRenderMenu: (
          items: MenuItem[],
          { mode: current }: RenderMenuContext,
        ) => {
          if (current !== Mode.tree) return items;
          const rest = items.filter(
            (item) =>
              !(
                item.type === "button" &&
                item.className?.includes("jse-group-button")
              ),
          );
          return rest[0]?.type === "separator" ? rest.slice(1) : rest;
        },
      },
    });
    instance.current = editor;
    const frame = requestAnimationFrame(() => {
      if (saved) {
        const expanded = new Set(saved.expanded);
        editor.expand(
          [],
          (path) =>
            expanded.has(
              "/" +
                path
                  .map((part) =>
                    String(part).replace(/~/g, "~0").replace(/\//g, "~1"),
                  )
                  .join("/"),
            ) ||
            (path.length === 0 && expanded.has("")),
        );
        if (!expanded.has("")) editor.collapse([]);
        const scroll = target.querySelector(
          "[data-jsoneditor-scrollable-contents]",
        );
        if (scroll) scroll.scrollTop = saved.scroll;
      }
    });
    onMount?.();
    return () => {
      cancelAnimationFrame(frame);
      const expanded = Array.from(
        target.querySelectorAll(".jse-json-node.jse-expanded[data-path]"),
      ).map((node) => decodeURIComponent(node.getAttribute("data-path") || ""));
      const scroll =
        target.querySelector("[data-jsoneditor-scrollable-contents]")
          ?.scrollTop || 0;
      useTabStore
        .getState()
        .setToolState(tabKey, "tree:view", { expanded, scroll, selection });
      instance.current = null;
      void editor.destroy();
    };
  }, []);
  useEffect(() => {
    if (content && content !== last.current) {
      last.current = content;
      instance.current?.update(content);
    }
  }, [content]);
  return (
    <div
      ref={container}
      className={`vanilla-json-editor h-full ${resolvedTheme === "dark" ? "jse-theme-dark" : ""}`}
      // 只缩放内容区字号，顶部/侧边菜单用 --jse-font-size-main-menu，保持原大小
      style={
        {
          height,
          "--jse-font-size": `calc(0.8125rem * ${zoom})`,
          "--jse-font-size-mono": `calc(var(--editor-font-size) * ${zoom})`,
        } as React.CSSProperties
      }
    />
  );
}
