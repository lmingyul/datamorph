import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useTheme } from "next-themes";
import JSON5 from "json5";
import {
  JSONCrack,
  type JSONCrackRef,
  type LayoutDirection,
  type NodeData,
} from "jsoncrack-react";
import "jsoncrack-react/style.css";
import "./jsonGraph.css";
import {
  ChevronsDownUp,
  ChevronsUpDown,
  Crosshair,
  Maximize,
  MoveDown,
  MoveRight,
  X,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
} from "lucide-react";

import { Button, Tooltip } from "@/components/ui";
import { useToolState } from "@/components/workspace/ToolContext";
import clipboard from "@/utils/clipboard";
import { registerZoomHandler } from "@/store/useViewZoomStore";

// jsoncrack 通过这些 CSS 变量着色，这里接到当前配色的编辑器 token 上，切换主题自动生效
const CANVAS_STYLE = {
  "--bg-color": "var(--surface)",
  "--line-color-1": "color-mix(in srgb, var(--border) 45%, transparent)",
  "--line-color-2": "color-mix(in srgb, var(--border) 20%, transparent)",
  "--edge-stroke": "var(--input)",
  "--node-fill": "var(--card)",
  "--node-stroke": "var(--input)",
  "--interactive-normal": "var(--muted-foreground)",
  "--node-text": "var(--foreground)",
  "--node-key": "var(--editor-key)",
  "--node-value": "var(--editor-string)",
  "--node-integer": "var(--warning)",
  "--node-null": "var(--editor-comment)",
  "--node-bool-true": "var(--success)",
  "--node-bool-false": "var(--destructive)",
  "--node-child-count": "var(--muted-foreground)",
  "--node-divider": "var(--border)",
} as CSSProperties;

const MAX_NODES = 1500;

type Path = (string | number)[];

interface Selection {
  path: Path;
  value: unknown;
}

function parseDocument(text: string): { value?: unknown; error?: true } {
  try {
    return { value: JSON.parse(text) };
  } catch {
    try {
      return { value: JSON5.parse(text) };
    } catch {
      return { error: true };
    }
  }
}

function valueAt(root: unknown, path: Path): unknown {
  return path.reduce<unknown>(
    (node, segment) =>
      node && typeof node === "object"
        ? (node as Record<string | number, unknown>)[segment]
        : undefined,
    root,
  );
}

function formatPath(path: Path): string {
  return path.reduce<string>((result, segment) => {
    if (typeof segment === "number") return `${result}[${segment}]`;
    return /^[A-Za-z_$][\w$]*$/.test(segment)
      ? `${result}.${segment}`
      : `${result}[${JSON.stringify(segment)}]`;
  }, "$");
}

function ToolButton({
  label,
  icon: Icon,
  onPress,
}: {
  label: string;
  icon: LucideIcon;
  onPress: () => void;
}) {
  return (
    <Tooltip content={label}>
      <Button
        isIconOnly
        aria-label={label}
        className="size-7"
        variant="ghost"
        onPress={onPress}
      >
        <Icon />
      </Button>
    </Tooltip>
  );
}

/** 参考 jsoncrack.com 的节点图视图，只读；点击节点查看路径和内容。 */
export default function JsonGraphView({
  data,
  onEdit,
}: {
  data: string;
  onEdit: () => void;
}) {
  const graph = useRef<JSONCrackRef>(null);
  const { resolvedTheme } = useTheme();
  const [direction, setDirection] = useToolState<LayoutDirection>(
    "graph:direction",
    "RIGHT",
  );
  const [selection, setSelection] = useState<Selection | null>(null);
  const deferred = useDeferredValue(data);
  // 节点图是画布缩放：快捷键直接驱动画布，⌘0 等同「适应窗口」
  useEffect(
    () =>
      registerZoomHandler("graph", (action) => {
        if (action === "in") graph.current?.zoomIn();
        else if (action === "out") graph.current?.zoomOut();
        else graph.current?.centerView();
      }),
    [],
  );
  const parsed = useMemo(() => parseDocument(deferred), [deferred]);
  // 统一转成标准 JSON：jsoncrack 只认 JSON（含注释），JSON5 的单引号、无引号键等需先转换
  const json = useMemo(
    () => (parsed.error ? "" : JSON.stringify(parsed.value)),
    [parsed],
  );

  if (!deferred.trim())
    return (
      <GraphMessage title="暂无内容" detail="输入 JSON 后即可查看节点图" />
    );

  if (parsed.error)
    return (
      <GraphMessage
        title="内容不是有效的 JSON"
        detail="修正错误后会自动生成节点图"
        action={
          <Button size="sm" onPress={onEdit}>
            回到编辑
          </Button>
        }
      />
    );

  const selectNode = (node: NodeData) => {
    const path = (node.path ?? []) as Path;
    setSelection({ path, value: valueAt(parsed.value, path) });
  };

  return (
    <div className="json-graph relative h-full overflow-hidden">
      {/* 切换方向时重新挂载：组件只在首次布局后自动适应窗口 */}
      <JSONCrack
        key={direction}
        ref={graph}
        json={json}
        layoutDirection={direction}
        maxRenderableNodes={MAX_NODES}
        renderNodeLimitExceeded={(count) => (
          <GraphMessage
            title={`节点过多（${count.toLocaleString()} 个）`}
            detail={`节点图最多展示 ${MAX_NODES.toLocaleString()} 个节点，大数据请使用表格或树形视图`}
          />
        )}
        showControls={false}
        style={CANVAS_STYLE}
        theme={resolvedTheme === "dark" ? "dark" : "light"}
        trackpadZoom
        onNodeClick={selectNode}
      />

      <div className="absolute right-3 top-3 z-10 flex items-center gap-0.5 rounded-md border bg-background/95 p-0.5 shadow-xs">
        <ToolButton
          icon={direction === "RIGHT" ? MoveDown : MoveRight}
          label={direction === "RIGHT" ? "改为纵向布局" : "改为横向布局"}
          onPress={() => setDirection(direction === "RIGHT" ? "DOWN" : "RIGHT")}
        />
        <ToolButton
          icon={ChevronsDownUp}
          label="折叠全部"
          onPress={() => graph.current?.collapseAll()}
        />
        <ToolButton
          icon={ChevronsUpDown}
          label="展开全部"
          onPress={() => graph.current?.expandAll()}
        />
        <div className="mx-0.5 h-4 w-px bg-border" />
        <ToolButton
          icon={ZoomOut}
          label="缩小（⌘/Ctrl -）"
          onPress={() => graph.current?.zoomOut()}
        />
        <ToolButton
          icon={ZoomIn}
          label="放大（⌘/Ctrl +）"
          onPress={() => graph.current?.zoomIn()}
        />
        <ToolButton
          icon={Maximize}
          label="适应窗口（⌘/Ctrl 0）"
          onPress={() => graph.current?.centerView()}
        />
        <ToolButton
          icon={Crosshair}
          label="定位根节点"
          onPress={() => graph.current?.focusFirstNode()}
        />
      </div>

      {selection && (
        <NodeDetail selection={selection} onClose={() => setSelection(null)} />
      )}
    </div>
  );
}

function NodeDetail({
  selection,
  onClose,
}: {
  selection: Selection;
  onClose: () => void;
}) {
  const path = formatPath(selection.path);
  const value = JSON.stringify(selection.value, null, 2) ?? "undefined";

  return (
    <div className="absolute bottom-3 left-3 z-10 flex max-h-[60%] w-[min(420px,calc(100%-1.5rem))] flex-col rounded-lg border bg-popover shadow-md">
      <div className="flex items-start gap-2 border-b px-3 py-2">
        <code className="min-w-0 flex-1 break-all pt-1 font-mono text-xs text-[var(--editor-key)]">
          {path}
        </code>
        <Button
          isIconOnly
          aria-label="关闭"
          className="size-6"
          variant="ghost"
          onPress={onClose}
        >
          <X />
        </Button>
      </div>
      <pre className="min-h-0 flex-1 overflow-auto px-3 py-2 font-mono text-xs leading-relaxed text-foreground">
        {value}
      </pre>
      <div className="flex justify-end gap-2 border-t px-3 py-2">
        <Button
          size="sm"
          onPress={() => void clipboard.copy(path, "已复制路径")}
        >
          复制路径
        </Button>
        <Button
          size="sm"
          onPress={() => void clipboard.copy(value, "已复制内容")}
        >
          复制内容
        </Button>
      </div>
    </div>
  );
}

function GraphMessage({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-2 bg-[var(--surface)] p-6 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground">{detail}</p>
      {action}
    </div>
  );
}
