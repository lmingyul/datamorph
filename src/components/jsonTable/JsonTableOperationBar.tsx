import { useState } from "react";
import {
  Check,
  ChevronsDownUp,
  ChevronsUpDown,
  Copy,
  Eye,
  FileSpreadsheet,
  FileText,
  Filter,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";

import {
  Button,
  cn,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
  Tooltip,
} from "@/components/ui";
import toast from "@/utils/toast";

interface JsonTableOperationBarProps {
  onCopy: (type?: "default" | "node" | "path") => boolean;
  onExpand: () => void;
  onCollapse: () => void;
  onCustomView: (key: "hideEmpty" | "hideNull" | "showAll") => void;
  onClear?: () => boolean;
  onExport?: (format: "csv" | "xlsx") => void;
  onFilterToggle?: () => void;
  isFilterActive?: boolean;
}

const VIEW_OPTIONS = [
  { key: "hideEmpty", text: "隐藏空值" },
  { key: "hideNull", text: "隐藏 null 值" },
  { key: "showAll", text: "显示所有值" },
] as const;

function ToolButton({
  icon: IconComponent,
  label,
  active,
  onPress,
}: {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  onPress?: () => void;
}) {
  return (
    <Tooltip content={label} placement="left">
      <Button
        isIconOnly
        aria-label={label}
        className={cn(
          "size-7 min-w-0 rounded-md text-muted-foreground hover:bg-accent hover:text-primary active:scale-95",
          active && "bg-accent text-primary",
        )}
        variant="light"
        onPress={onPress}
      >
        <IconComponent className="size-[17px]" />
      </Button>
    </Tooltip>
  );
}

const Separator = () => <div className="my-1 h-px w-[18px] bg-border" />;

/** 表格视图右侧的竖排工具条，布局与树形视图一致 */
export default function JsonTableOperationBar({
  onCopy,
  onExpand,
  onCollapse,
  onCustomView,
  onClear,
  onExport,
  onFilterToggle,
  isFilterActive = false,
}: JsonTableOperationBarProps) {
  const [flash, setFlash] = useState<"copy" | "clear" | null>(null);
  const [copyFailed, setCopyFailed] = useState(false);

  const feedback = (key: "copy" | "clear", ok: boolean) => {
    setCopyFailed(!ok);
    setFlash(key);
    setTimeout(() => setFlash(null), 1000);
  };
  const statusIcon = (key: "copy" | "clear", icon: LucideIcon) =>
    flash === key ? (copyFailed ? X : Check) : icon;

  return (
    <div className="flex w-10 shrink-0 flex-col items-center gap-0.5 overflow-y-auto border-l border-border bg-muted py-1.5">
      <ToolButton icon={ChevronsUpDown} label="展开全部" onPress={onExpand} />
      <ToolButton icon={ChevronsDownUp} label="折叠全部" onPress={onCollapse} />
      <Separator />
      {onFilterToggle && (
        <ToolButton
          active={isFilterActive}
          icon={Filter}
          label={isFilterActive ? "关闭搜索筛选" : "搜索筛选"}
          onPress={onFilterToggle}
        />
      )}
      <Dropdown>
        <Tooltip content="视图选项" placement="left">
          <DropdownTrigger>
            <Button
              isIconOnly
              aria-label="视图选项"
              className="size-7 min-w-0 rounded-md text-muted-foreground hover:bg-accent hover:text-primary active:scale-95"
              variant="light"
            >
              <Eye className="size-[17px]" />
            </Button>
          </DropdownTrigger>
        </Tooltip>
        <DropdownMenu aria-label="视图选项">
          {VIEW_OPTIONS.map((option) => (
            <DropdownItem
              key={option.key}
              onPress={() => {
                onCustomView(option.key);
                toast.success(option.text);
              }}
            >
              {option.text}
            </DropdownItem>
          ))}
        </DropdownMenu>
      </Dropdown>
      <Separator />
      <ToolButton
        icon={statusIcon("copy", Copy)}
        label="复制内容"
        onPress={() => feedback("copy", onCopy())}
      />
      {onExport && (
        <>
          <ToolButton
            icon={FileText}
            label="导出 CSV（选中节点，未选时导出全部）"
            onPress={() => onExport("csv")}
          />
          <ToolButton
            icon={FileSpreadsheet}
            label="导出 Excel（选中节点，未选时导出全部）"
            onPress={() => onExport("xlsx")}
          />
        </>
      )}
      {onClear && (
        <>
          <Separator />
          <ToolButton
            icon={statusIcon("clear", Trash2)}
            label="清空内容"
            onPress={() => feedback("clear", onClear())}
          />
        </>
      )}
    </div>
  );
}
