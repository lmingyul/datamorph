import { useToolState } from "@/components/workspace/ToolContext";
import { VirtualRows } from "@/components/ui/virtual-rows";
import React, {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { Icon } from "@/components/ui/icon";
import { isLosslessNumber } from "lossless-json";
import { parseJson } from "@/utils/json";
import toast from "@/utils/toast";

import JsonPathBar from "@/components/jsonTable/JsonPathBar.tsx";
import ColumnFilterPopover from "@/components/jsonTable/ColumnFilterPopover.tsx";

// 添加动画相关的CSS样式
const animationStyles = {
  expandable: {
    overflow: "hidden",
    transition: "max-height 0.3s ease-in-out, opacity 0.3s ease-in-out",
    maxHeight: "0px",
    opacity: 0,
  },
  expanded: {
    maxHeight: "none", // 移除高度限制，让内容完全展开
    opacity: 1,
  },
};

// 添加动画持续时间常量（与transition时间匹配）
const ANIMATION_DURATION = 200; // 300ms

interface JsonTableProps {
  data: any;
  onPathChange?: (path: string) => void;
  /** 单元格编辑后的新根值；不传则表格只读 */
  onEdit?: (next: any) => void;
  expandedPaths: Set<string>;
  onToggleExpand: (path: string) => void;
  hideEmpty?: boolean;
  hideNull?: boolean;
  /** 列筛选条件：key -> 允许的值列表 */
  columnFilters?: Record<string, string[]>;
  /** 全局搜索词（用于 renderObjectTable / renderArrayTable） */
  globalFilter?: string;
  /** 列筛选变化回调 */
  onColumnFilterChange?: (
    columnKey: string,
    selectedValues: Set<string>,
  ) => void;
}

/** 将任意 JSON 值转为显示文本（用于筛选匹配） */
function toDisplayString(value: any): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (isLosslessNumber(value)) return value.toString();
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  return String(value);
}

type Segment = string | number;
type EditKind = "key" | "value" | "column";
interface EditTarget {
  kind: EditKind;
  /** value：值本身的位置；key / column：键所在对象 / 对象数组的位置 */
  segments: Segment[];
  key?: string;
  initial: string;
  original: unknown;
  width: number;
}
type EditSpec = Omit<EditTarget, "initial" | "width"> & { id: string };

function setIn(node: any, segments: Segment[], update: (v: any) => any): any {
  if (segments.length === 0) return update(node);
  const [head, ...rest] = segments;
  if (Array.isArray(node)) {
    const copy = node.slice();
    copy[head as number] = setIn(node[head as number], rest, update);
    return copy;
  }
  return { ...node, [head]: setIn(node?.[head], rest, update) };
}

const renameKey = (obj: Record<string, unknown>, from: string, to: string) =>
  Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k === from ? to : k, v]),
  );

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" &&
  v !== null &&
  !Array.isArray(v) &&
  !isLosslessNumber(v);

/** 原值是字符串时保持字符串；其余类型按 JSON 解析，解析不了才当字符串 */
function parseCellInput(text: string, original: unknown): unknown {
  if (typeof original === "string") return text;
  try {
    return parseJson(text);
  } catch {
    return text;
  }
}

/** 按编辑目标生成新的根值；键名冲突时抛错，由调用方提示 */
function applyEdit(root: any, target: EditTarget, text: string): any {
  if (target.kind === "value")
    return setIn(root, target.segments, () =>
      parseCellInput(text, target.original),
    );
  const from = target.key!;
  if (!text) throw new Error("键名不能为空");
  if (target.kind === "key")
    return setIn(root, target.segments, (obj) => {
      if (text in obj) throw new Error(`键名「${text}」已存在`);
      return renameKey(obj, from, text);
    });
  return setIn(root, target.segments, (rows: unknown[]) => {
    if (rows.some((row) => isPlainObject(row) && text in row))
      throw new Error(`列名「${text}」已存在`);
    return rows.map((row) =>
      isPlainObject(row) && from in row ? renameKey(row, from, text) : row,
    );
  });
}

function CellEditor({
  target,
  onDraft,
  onDone,
}: {
  target: EditTarget;
  onDraft: (text: string) => void;
  onDone: (text: string | null) => void;
}) {
  const [draft, setDraft] = useState(target.initial);
  const finished = useRef(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const finish = (text: string | null) => {
    if (finished.current) return;
    finished.current = true;
    onDone(text);
  };
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, [draft]);
  useEffect(() => {
    area.current?.focus();
    area.current?.select();
  }, []);

  return (
    <textarea
      ref={area}
      aria-label={target.kind === "value" ? "编辑值" : "编辑键名"}
      className="block resize-none rounded-sm bg-background px-1 font-[inherit] text-sm leading-6 text-foreground outline-none"
      rows={1}
      spellCheck={false}
      style={{ width: target.width }}
      value={draft}
      onBlur={() => finish(draft)}
      onChange={(e) => {
        setDraft(e.target.value);
        onDraft(e.target.value);
      }}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        // 中文输入法选词时的回车不能当成提交
        if (e.nativeEvent.isComposing) return;
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          finish(draft);
        } else if (e.key === "Escape") {
          e.preventDefault();
          finish(null);
        }
      }}
    />
  );
}

const LIVE_SYNC_DELAY = 120;

/** 悬浮或编辑中的单元格：主题色加粗边框 */
const CELL_HIGHLIGHT =
  "data-hover:outline-2 data-hover:-outline-offset-1 data-hover:outline-primary data-editing:outline-2 data-editing:-outline-offset-1 data-editing:outline-primary";

const JsonTable: React.FC<JsonTableProps> = ({
  data,
  onPathChange,
  onEdit,
  expandedPaths,
  onToggleExpand,
  hideEmpty = false,
  hideNull = false,
  columnFilters,
  globalFilter,
  onColumnFilterChange,
}) => {
  const [currentPath, setCurrentPath] = useToolState<string>(
    "table:currentPath",
    "root",
  );
  const [selectedPath, setSelectedPath] = useToolState<string | null>(
    "table:selectedPath",
    null,
  );
  const lastAutoExpandedDataRef = useRef<any>(null);
  const [editing, setEditing] = useState<(EditTarget & { id: string }) | null>(
    null,
  );
  const hovered = useRef<HTMLElement | null>(null);
  const live = useRef<{ base: any; pushed: string; timer: number } | null>(
    null,
  );
  useEffect(() => () => window.clearTimeout(live.current?.timer), []);

  const beginEdit = (cell: HTMLElement, spec: EditSpec) => {
    if (!onEdit || editing?.id === spec.id) return;
    const initial =
      spec.kind !== "value"
        ? spec.key!
        : spec.original === undefined
          ? ""
          : typeof spec.original === "string"
            ? spec.original
            : toDisplayString(spec.original);
    // 编辑框沿用单元格原宽度，避免点进去时整列跳动
    const width = Math.max(cell.getBoundingClientRect().width - 16, 96);
    live.current = { base: data, pushed: initial, timer: 0 };
    setEditing({ ...spec, initial, width });
  };

  // 值编辑边输入边同步到文本视图：始终基于开始编辑时的数据重放，短防抖避免大文档每键全量序列化。
  // 键名/列名改动会让行重新挂载，仍在回车或失焦时一次性提交
  const pushDraft = (text: string) => {
    const session = live.current;
    if (!session || !onEdit || editing?.kind !== "value") return;
    const target = editing;
    window.clearTimeout(session.timer);
    session.timer = window.setTimeout(() => {
      if (live.current !== session || session.pushed === text) return;
      session.pushed = text;
      onEdit(applyEdit(session.base, target, text));
    }, LIVE_SYNC_DELAY);
  };

  const finishEdit = (text: string | null) => {
    const target = editing;
    const session = live.current;
    live.current = null;
    setEditing(null);
    if (!target || !session || !onEdit) return;
    window.clearTimeout(session.timer);
    const changed = session.pushed !== target.initial;
    if (text === null || text === target.initial) {
      // 取消或改回原值：撤销已经同步出去的中间结果
      if (changed) onEdit(session.base);
      return;
    }
    if (text === session.pushed) return;
    try {
      onEdit(applyEdit(session.base, target, text));
    } catch (error) {
      if (changed) onEdit(session.base);
      toast.error("修改失败", (error as Error).message);
    }
  };

  const cellProps = (path: string, spec?: EditSpec) => ({
    "data-cell": "",
    "data-editing": spec && editing?.id === spec.id ? "" : undefined,
    tabIndex: spec && onEdit ? 0 : undefined,
    onClick: (e: React.MouseEvent<HTMLElement>) => {
      handleElementClick(path, e);
      // 列筛选按钮及其弹层（Portal 里的事件也会冒泡到这里）不触发编辑
      const target = e.target as HTMLElement;
      const onControl =
        !e.currentTarget.contains(target) || !!target.closest("button");
      if (spec && !onControl) beginEdit(e.currentTarget, spec);
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => {
      if (spec && e.target === e.currentTarget && e.key === "Enter") {
        e.preventDefault();
        beginEdit(e.currentTarget, spec);
      }
    },
  });

  const cellEditor = (spec: EditSpec) =>
    editing?.id === spec.id ? (
      <CellEditor target={editing} onDone={finishEdit} onDraft={pushDraft} />
    ) : null;

  // 嵌套表格的单元格也在父单元格里，用事件委托只给最内层单元格标记悬浮。
  // 键盘聚焦复用同一处理，Tab 到单元格时也有高亮
  const handleMouseOver = (e: React.SyntheticEvent) => {
    const cell = (e.target as HTMLElement).closest<HTMLElement>("[data-cell]");
    if (cell === hovered.current) return;
    hovered.current?.removeAttribute("data-hover");
    cell?.setAttribute("data-hover", "");
    hovered.current = cell;
  };
  const handleMouseLeave = () => {
    hovered.current?.removeAttribute("data-hover");
    hovered.current = null;
  };

  // 新增：存储每个节点的内容可见性状态的Map
  const [visibleContents, setVisibleContents] = useState<Map<string, boolean>>(
    new Map(),
  );

  // 判断是否是对象数组 兼容 LosslessNumber
  const isObjectArray = (data: any[]): boolean => {
    return (
      data.length > 0 &&
      data.every(
        (item) =>
          typeof item === "object" && item !== null && !isLosslessNumber(item),
      )
    );
  };

  // 获取所有对象字段的集合
  const getAllObjectKeys = (objects: object[]): string[] => {
    const keysSet = new Set<string>();

    objects.forEach((obj) => {
      if (obj && typeof obj === "object") {
        Object.keys(obj).forEach((key) => keysSet.add(key));
      }
    });

    return Array.from(keysSet);
  };

  // 预计算对象数组表格的去重值（用于列筛选 Popover）
  const { allKeys, columnUniqueValues } = useMemo(() => {
    if (!Array.isArray(data) || !isObjectArray(data)) {
      return { allKeys: [], columnUniqueValues: {} };
    }
    const keys = getAllObjectKeys(data);
    const uniqueValues: Record<string, string[]> = {};

    keys.forEach((key) => {
      const values = new Set<string>();

      data.forEach((item: any) => values.add(toDisplayString(item[key])));
      uniqueValues[key] = Array.from(values).sort();
    });

    return { allKeys: keys, columnUniqueValues: uniqueValues };
  }, [data]);

  // 根据列筛选条件过滤后的数据
  const filteredData = useMemo(() => {
    if (!Array.isArray(data) || !isObjectArray(data)) return data;
    if (!columnFilters || Object.keys(columnFilters).length === 0) return data;

    return data.filter((item: any) => {
      return Object.entries(columnFilters).every(([key, allowedValues]) => {
        if (!allowedValues || allowedValues.length === 0) return true;
        const cellValue = toDisplayString(item[key]);

        return allowedValues.includes(cellValue);
      });
    });
  }, [data, columnFilters]);

  // 添加自动展开单个子元素的函数
  const collectSingleChildPaths = (
    value: any,
    path: string = "root",
    paths: Set<string> = new Set(),
  ): Set<string> => {
    if (typeof value !== "object" || value === null) {
      return paths;
    }

    if (Array.isArray(value)) {
      if (value.length === 1) {
        paths.add(path);
        collectSingleChildPaths(value[0], `${path}[0]`, paths);
      } else {
        // 遍历数组中的所有元素
        value.forEach((item, index) => {
          if (typeof item === "object" && item !== null) {
            collectSingleChildPaths(item, `${path}[${index}]`, paths);
          }
        });
      }
    } else {
      const keys = Object.keys(value);

      if (keys.length === 1) {
        paths.add(path);
        collectSingleChildPaths(value[keys[0]], `${path}.${keys[0]}`, paths);
      } else {
        // 遍历对象中的所有属性
        keys.forEach((key) => {
          if (typeof value[key] === "object" && value[key] !== null) {
            collectSingleChildPaths(value[key], `${path}.${key}`, paths);
          }
        });
      }
    }

    return paths;
  };

  // 检查路径是否是选定路径的子路径
  const isPathSelected = (path: string): boolean => {
    if (!selectedPath) return false;

    // 完全匹配
    if (path === selectedPath) return true;

    // 检查是否是子路径
    if (
      path.startsWith(selectedPath + ".") ||
      path.startsWith(selectedPath + "[")
    ) {
      return true;
    }

    return false;
  };

  // 处理元素点击
  const handleElementClick = (path: string, event: React.SyntheticEvent) => {
    event.stopPropagation();
    setSelectedPath(path);
    setCurrentPath(path);
    onPathChange && onPathChange(path);
    scrollToElement(path);
  };

  // 使用useCallback包装自动展开逻辑，防止不必要的重复执行
  const autoExpandSingleChildren = useCallback(() => {
    // 如果数据没有变化，则不重复执行
    if (lastAutoExpandedDataRef.current === data) {
      return;
    }

    const pathsToExpand = collectSingleChildPaths(data);

    pathsToExpand.forEach((path) => {
      if (!expandedPaths.has(path)) {
        onToggleExpand(path);
      }
    });

    // 记录已经自动展开过的数据
    lastAutoExpandedDataRef.current = data;
  }, [data, expandedPaths, onToggleExpand]);

  // 初始化时和数据变化时执行自动展开
  useEffect(() => {
    autoExpandSingleChildren();
  }, [data, autoExpandSingleChildren]); // 只在数据变化时触发

  // 修改滚动到元素的函数
  const scrollToElement = (path: string) => {
    const element = document.getElementById(`json-path-${path}`);

    if (element) {
      const container = element.closest(".overflow-auto");

      if (container) {
        const elementRect = element.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();

        // 添加滚动偏移量，使滚动位置稍微小一点
        const offset = 40; // 偏移量，可以根据需要调整

        // 计算水平和垂直方向的滚动位置
        const scrollLeft =
          elementRect.left - containerRect.left + container.scrollLeft - offset;
        const scrollTop =
          elementRect.top - containerRect.top + container.scrollTop - offset;

        // 平滑滚动到目标位置
        container.scrollTo({
          left: Math.max(0, scrollLeft),
          top: Math.max(0, scrollTop),
          behavior: "smooth",
        });
      } else {
        // 使用scrollIntoView时添加margin
        element.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  };

  // 监听展开路径变化
  useEffect(() => {
    if (currentPath) {
      scrollToElement(currentPath);
    }
  }, [currentPath]);

  // 判断值是否为可展开的对象或数组
  const isExpandable = (value: any): boolean => {
    return (
      typeof value === "object" && value !== null && !isLosslessNumber(value)
    );
  };

  // 根据数据类型渲染相应的嵌套表格
  const renderNestedContent = (
    value: any,
    valuePath: string,
    segments: Segment[],
  ) => {
    // 如果不是数组，直接渲染对象表格
    if (!Array.isArray(value)) {
      return renderObjectTable(value, valuePath, segments);
    }

    // 如果是对象数组，渲染对象数组表格
    if (isObjectArray(value)) {
      return renderObjectsArrayTable(value, valuePath, true, segments);
    }

    // 否则渲染普通数组表格
    return renderArrayTable(value, valuePath, true, segments);
  };

  const valueSpec = (
    path: string,
    segments: Segment[],
    value: unknown,
  ): EditSpec | undefined =>
    isExpandable(value)
      ? undefined
      : { id: `value:${path}`, kind: "value", segments, original: value };

  // 渲染单元格内容
  const renderCell = (value: any, path: string) => {
    if (value === null) return <span className="text-gray-500">null</span>;
    if (value === undefined)
      return <span className="text-gray-500">undefined</span>;

    if (isExpandable(value)) {
      const isExpanded = expandedPaths.has(path);
      const icon = isExpanded ? "tabler:chevron-down" : "tabler:chevron-right";

      return (
        <button
          className="flex items-center cursor-pointer hover:text-primary bg-transparent border-0 p-0 pt-1"
          id={`json-path-${path}`}
          onClick={(e) => {
            onToggleExpand(path);
            handleElementClick(path, e);
          }}
        >
          <Icon
            className="mr-1"
            icon={icon}
            style={{
              transition: "transform 0.2s ease",
              transform: isExpanded ? "rotate(0deg)" : "rotate(-90deg)",
            }}
            width={16}
          />
          <span className="whitespace-nowrap">
            {Array.isArray(value) ? (
              <>
                Array[ <span className="text-indigo-600">{value.length}</span> ]
              </>
            ) : (
              <>
                Object{"{"}{" "}
                <span className="text-indigo-600">
                  {Object.keys(value).length}
                </span>{" "}
                {"}"}
              </>
            )}
          </span>
        </button>
      );
    }

    // 点击由外层单元格统一处理（选中 + 进入编辑）
    return (
      <span>
        {isLosslessNumber(value) ? (
          <span className="text-blue-600">{value.toString()}</span>
        ) : typeof value === "string" ? (
          <span
            className="text-green-600"
            style={
              value.length > 30
                ? {
                    maxWidth: "300px",
                    display: "inline-block",
                    overflowWrap: "break-word",
                    wordBreak: "normal",
                  }
                : undefined
            }
          >
            {value}
          </span>
        ) : typeof value === "number" || isLosslessNumber(value) ? (
          <span className="text-blue-600">{String(value)}</span>
        ) : typeof value === "boolean" ? (
          <span className="text-purple-600">{String(value)}</span>
        ) : (
          <span>{String(value)}</span>
        )}
      </span>
    );
  };

  // 监听expandedPaths的变化，更新内容可见性
  useEffect(() => {
    const newVisibleContents = new Map(visibleContents);

    // 处理新展开的路径
    expandedPaths.forEach((path) => {
      if (!visibleContents.has(path)) {
        newVisibleContents.set(path, true);
      }
    });

    // 处理被收起的路径
    visibleContents.forEach((_, path) => {
      if (!expandedPaths.has(path)) {
        // 不立即移除，等待动画完成后再处理
        setTimeout(() => {
          setVisibleContents((prev) => {
            const updated = new Map(prev);

            updated.delete(path);

            return updated;
          });
        }, ANIMATION_DURATION);
      }
    });

    setVisibleContents(newVisibleContents);
  }, [expandedPaths]);

  // 渲染对象表格
  const renderObjectTable = (
    data: object,
    path: string,
    segments: Segment[],
  ) => {
    let entries = Object.entries(data);

    // 全局搜索过滤
    if (globalFilter) {
      const searchLower = globalFilter.toLowerCase();

      entries = entries.filter(([key, value]) => {
        return (
          key.toLowerCase().includes(searchLower) ||
          toDisplayString(value).toLowerCase().includes(searchLower)
        );
      });
    }

    return (
      <div className="mb-1 overflow-x-auto inline-block">
        <table className="border-collapse w-auto">
          <VirtualRows items={entries}>
            {([key, value]) => {
              if ((hideEmpty && value === "") || (hideNull && value === null)) {
                return null;
              }
              const valuePath = path ? `${path}.${key}` : key;
              const isSelected = isPathSelected(valuePath);
              const isExpanded =
                isExpandable(value) && expandedPaths.has(valuePath);
              const shouldRenderContent = visibleContents.has(valuePath);
              const valueSegments = [...segments, key];
              const keyEdit: EditSpec = {
                id: `key:${valuePath}`,
                kind: "key",
                segments,
                key,
                original: key,
              };
              const valueEdit = valueSpec(valuePath, valueSegments, value);

              return (
                <tr
                  key={key}
                  className={`${isSelected ? "!bg-border/60" : ""} hover:bg-muted`}
                >
                  <td
                    className={`px-2 text-sm font-medium border border-input cursor-text ${CELL_HIGHLIGHT}`}
                    {...cellProps(valuePath, keyEdit)}
                  >
                    {cellEditor(keyEdit) ?? key}
                  </td>
                  <td
                    className={`px-2 text-sm border border-input ${valueEdit ? "cursor-text" : "cursor-pointer"} ${CELL_HIGHLIGHT}`}
                    style={{ minWidth: "30px" }}
                    {...cellProps(valuePath, valueEdit)}
                  >
                    {(valueEdit && cellEditor(valueEdit)) ??
                      renderCell(value, valuePath)}
                    {isExpandable(value) && (
                      <div
                        className="mt-1"
                        style={{
                          ...animationStyles.expandable,
                          ...(isExpanded ? animationStyles.expanded : {}),
                        }}
                      >
                        {shouldRenderContent &&
                          renderNestedContent(value, valuePath, valueSegments)}
                      </div>
                    )}
                  </td>
                </tr>
              );
            }}
          </VirtualRows>
        </table>
      </div>
    );
  };

  const renderArrayTable = (
    data: any[],
    path: string,
    isNested: boolean,
    segments: Segment[],
  ) => {
    // 全局搜索过滤
    let filteredItems = data.map((item, index) => ({ item, index }));

    if (globalFilter) {
      const searchLower = globalFilter.toLowerCase();

      filteredItems = filteredItems.filter(({ item, index }) => {
        return (
          String(index).includes(searchLower) ||
          toDisplayString(item).toLowerCase().includes(searchLower)
        );
      });
    }

    return (
      <div
        className={`${isNested ? "border-0" : "border border-input rounded"} mb-1 overflow-x-auto inline-block`}
      >
        <table className="border-collapse w-auto">
          <VirtualRows items={filteredItems}>
            {({ item, index: originalIndex }) => {
              if ((hideEmpty && item === "") || (hideNull && item === null)) {
                return null;
              }

              const itemPath = `${path}[${originalIndex}]`;
              const isSelected = isPathSelected(itemPath);
              const isExpanded =
                isExpandable(item) && expandedPaths.has(itemPath);
              const shouldRenderContent = visibleContents.has(itemPath);
              const itemSegments = [...segments, originalIndex];
              const valueEdit = valueSpec(itemPath, itemSegments, item);

              return (
                <tr
                  key={originalIndex}
                  className={`${isSelected ? "!bg-border/60" : ""} hover:bg-muted`}
                >
                  <td
                    className="px-2 text-sm border border-input cursor-pointer"
                    onClick={(e) => handleElementClick(itemPath, e)}
                  >
                    {originalIndex}
                  </td>
                  <td
                    className={`px-2 text-sm border border-input ${valueEdit ? "cursor-text" : "cursor-pointer"} ${CELL_HIGHLIGHT}`}
                    style={{ minWidth: "30px" }}
                    {...cellProps(itemPath, valueEdit)}
                  >
                    {(valueEdit && cellEditor(valueEdit)) ??
                      renderCell(item, itemPath)}
                    {isExpandable(item) && (
                      <div
                        className="mt-1"
                        style={{
                          ...animationStyles.expandable,
                          ...(isExpanded ? animationStyles.expanded : {}),
                        }}
                      >
                        {shouldRenderContent &&
                          renderNestedContent(item, itemPath, itemSegments)}
                      </div>
                    )}
                  </td>
                </tr>
              );
            }}
          </VirtualRows>
        </table>
      </div>
    );
  };

  const renderObjectsArrayTable = (
    data: any[],
    path: string,
    isNested: boolean,
    segments: Segment[],
  ) => {
    const keys = isNested ? getAllObjectKeys(data) : allKeys;
    const renderData = isNested ? data : (filteredData as any[]);
    // 嵌套表格也计算去重值
    const uniqueValues = isNested
      ? (() => {
          const uv: Record<string, string[]> = {};

          keys.forEach((key) => {
            const values = new Set<string>();

            data.forEach((item: any) => values.add(toDisplayString(item[key])));
            uv[key] = Array.from(values).sort();
          });

          return uv;
        })()
      : columnUniqueValues;

    if (keys.length === 0) {
      return renderArrayTable(data, path, isNested, segments);
    }

    return (
      <div
        className={`${isNested ? "border-0" : "border border-gray-400 rounded"} mb-1 overflow-x-auto inline-block`}
      >
        <table className="border-collapse w-auto">
          <thead>
            <tr className="bg-muted">
              <th
                className={`${isPathSelected(path) ? "!bg-border/60" : ""} px-2 text-left text-sm font-medium text-muted-foreground border border-input cursor-pointer`}
                onClick={(e) => handleElementClick(path, e)}
              >
                #
              </th>
              {keys.map((key) => {
                // 检查此表头对应的路径是否应该高亮
                const headerPath = `${path}.${key}`;
                const isHeaderSelected = isPathSelected(headerPath);
                // 检查该列是否有活跃筛选
                const hasFilter =
                  columnFilters &&
                  columnFilters[key] &&
                  columnFilters[key].length < (uniqueValues[key]?.length || 0);
                // 改列名会同时改这一列所有行里的同名键
                const columnEdit: EditSpec = {
                  id: `column:${headerPath}`,
                  kind: "column",
                  segments,
                  key,
                  original: key,
                };
                const columnEditor = cellEditor(columnEdit);

                return (
                  <th
                    key={key}
                    className={`${isHeaderSelected ? "!bg-border/60" : ""} px-2 text-left text-sm font-medium text-muted-foreground border border-input cursor-text ${CELL_HIGHLIGHT}`}
                    {...cellProps(headerPath, columnEdit)}
                  >
                    {columnEditor ?? (
                      <div className="flex items-center gap-1">
                        <span>{key}</span>
                        {!isNested &&
                          onColumnFilterChange &&
                          uniqueValues[key] && (
                            <ColumnFilterPopover
                              allValues={uniqueValues[key]}
                              columnKey={key}
                              isActive={!!hasFilter}
                              selectedValues={
                                columnFilters?.[key]
                                  ? new Set(columnFilters[key])
                                  : new Set(uniqueValues[key])
                              }
                              onFilterChange={onColumnFilterChange}
                            />
                          )}
                      </div>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <VirtualRows items={renderData}>
            {(item: any, index: number) => {
              if ((hideEmpty && item === "") || (hideNull && item === null)) {
                return null;
              }

              // 筛选后映射回原索引
              const originalIndex = Array.isArray(data)
                ? data.indexOf(item)
                : index;
              const itemPath = `${path}[${originalIndex}]`;
              const isSelected = isPathSelected(itemPath);

              return (
                <tr
                  key={originalIndex}
                  className={`${isSelected ? "!bg-border/60" : ""} hover:bg-muted`}
                >
                  <td
                    className="px-2 text-sm border border-input cursor-pointer"
                    onClick={(e) => handleElementClick(itemPath, e)}
                  >
                    {originalIndex}
                  </td>
                  {keys.map((key) => {
                    const value = item[key];
                    const cellPath = `${itemPath}.${key}`;
                    const isCellSelected = isPathSelected(cellPath);
                    const isExpanded =
                      isExpandable(value) && expandedPaths.has(cellPath);
                    const shouldRenderContent = visibleContents.has(cellPath);
                    const cellSegments = [...segments, originalIndex, key];
                    const valueEdit = valueSpec(cellPath, cellSegments, value);

                    if (
                      (hideEmpty && value === "") ||
                      (hideNull && value === null)
                    ) {
                      return (
                        <td
                          key={key}
                          className={`${isPathSelected(cellPath) ? "!bg-border/60" : ""} px-2 text-sm border border-input cursor-pointer`}
                          style={{ minWidth: "30px" }}
                          onClick={(e) => handleElementClick(cellPath, e)}
                        >
                          -
                        </td>
                      );
                    }

                    return (
                      <td
                        key={key}
                        className={`${isCellSelected ? "!bg-border/60" : ""} px-2 text-sm border border-input ${valueEdit ? "cursor-text" : "cursor-pointer"} ${CELL_HIGHLIGHT}`}
                        style={{ minWidth: "30px" }}
                        {...cellProps(cellPath, valueEdit)}
                      >
                        {(valueEdit && cellEditor(valueEdit)) ??
                          renderCell(value, cellPath)}
                        {isExpandable(value) && (
                          <div
                            className="mt-1"
                            style={{
                              ...animationStyles.expandable,
                              ...(isExpanded ? animationStyles.expanded : {}),
                            }}
                          >
                            {shouldRenderContent &&
                              renderNestedContent(
                                value,
                                cellPath,
                                cellSegments,
                              )}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            }}
          </VirtualRows>
        </table>
      </div>
    );
  };

  // 渲染根表格
  const renderRootTable = () => {
    if (data === undefined)
      return <div className="text-center py-2">没有数据</div>;

    if (Array.isArray(data)) {
      if (isObjectArray(data)) {
        // 如果数组中的所有元素都是对象，则使用对象数组表格渲染
        return renderObjectsArrayTable(data, "root", false, []);
      } else {
        // 否则使用普通数组表格渲染
        return renderArrayTable(data, "root", false, []);
      }
    } else if (typeof data === "object") {
      return renderObjectTable(data, "root", []);
    } else {
      return (
        <div
          className={`p-2 border border-input rounded ${isPathSelected("root") ? "bg-input" : ""}`}
          role="button"
          tabIndex={0}
          onClick={(e) => handleElementClick("root", e)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              handleElementClick("root", e);
            }
          }}
        >
          {renderCell(data, "root")}
        </div>
      );
    }
  };

  return (
    <div className="h-full flex flex-col">
      <JsonPathBar currentPath={currentPath} />
      <div
        data-table-scroll
        className="flex-auto min-h-0 overflow-auto p-2"
        onMouseLeave={handleMouseLeave}
        onFocus={handleMouseOver}
        onMouseOver={handleMouseOver}
      >
        {renderRootTable()}
      </div>
    </div>
  );
};

export default JsonTable;
