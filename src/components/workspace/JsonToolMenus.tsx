import {
  ArrowLeftRight,
  ChevronDown,
  Code2,
  CodeXml,
  Database,
  FileCode,
  FileSpreadsheet,
  FileText,
  Table2,
  type LucideIcon,
} from "lucide-react";

import {
  Button,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
} from "@/components/ui";
import { useTabStore } from "@/store/useTabStore";
import { runJsonTask } from "@/workers/client";
import type { ConversionInput } from "@/workers/conversion";
import type { JsonBridgeFormat } from "@/utils/jsonConversions";
import { downloadTableExport } from "@/utils/tableExport";
import toast from "@/utils/toast";

interface FormatOption {
  format: JsonBridgeFormat;
  label: string;
  extension: string;
  /** Monaco 语言 ID */
  language: string;
  icon: LucideIcon;
}

const FORMATS: FormatOption[] = [
  {
    format: "csv",
    label: "CSV",
    extension: "csv",
    language: "csv",
    icon: Table2,
  },
  {
    format: "tsv",
    label: "TSV",
    extension: "tsv",
    language: "tsv",
    icon: Table2,
  },
  {
    format: "xml",
    label: "XML",
    extension: "xml",
    language: "xml",
    icon: CodeXml,
  },
  {
    format: "yaml",
    label: "YAML",
    extension: "yaml",
    language: "yaml",
    icon: FileText,
  },
  {
    format: "toml",
    label: "TOML",
    extension: "toml",
    language: "toml",
    icon: FileText,
  },
  {
    format: "ini",
    label: "INI",
    extension: "ini",
    language: "ini",
    icon: FileText,
  },
  // Monaco 没有 properties 语言，INI 高亮足够接近
  {
    format: "properties",
    label: "Properties",
    extension: "properties",
    language: "ini",
    icon: FileText,
  },
  {
    format: "markdown",
    label: "Markdown 表格",
    extension: "md",
    language: "markdown",
    icon: Table2,
  },
  {
    format: "sql",
    label: "SQL INSERT",
    extension: "sql",
    language: "sql",
    icon: Database,
  },
  {
    format: "pydict",
    label: "Python 字典",
    extension: "py",
    language: "python",
    icon: FileCode,
  },
];

/** quicktype 语言名 → 展示名、扩展名、Monaco 语言 ID、徽标 */
const CODE_LANGUAGES = [
  {
    lang: "python",
    label: "Python",
    extension: "py",
    language: "python",
    badge: "PY",
  },
  {
    lang: "java",
    label: "Java",
    extension: "java",
    language: "java",
    badge: "JV",
  },
  {
    lang: "csharp",
    label: "C#",
    extension: "cs",
    language: "csharp",
    badge: "C#",
  },
  { lang: "cjson", label: "C", extension: "c", language: "cpp", badge: "C" },
  {
    lang: "c++",
    label: "C++",
    extension: "cpp",
    language: "cpp",
    badge: "C++",
  },
  { lang: "go", label: "Go", extension: "go", language: "go", badge: "GO" },
  {
    lang: "rust",
    label: "Rust",
    extension: "rs",
    language: "rust",
    badge: "RS",
  },
  {
    lang: "swift",
    label: "Swift",
    extension: "swift",
    language: "swift",
    badge: "SW",
  },
  {
    lang: "kotlin",
    label: "Kotlin",
    extension: "kt",
    language: "kotlin",
    badge: "KT",
  },
  {
    lang: "scala3",
    label: "Scala",
    extension: "scala",
    language: "scala",
    badge: "SC",
  },
  {
    lang: "dart",
    label: "Dart",
    extension: "dart",
    language: "dart",
    badge: "DT",
  },
  {
    lang: "ruby",
    label: "Ruby",
    extension: "rb",
    language: "ruby",
    badge: "RB",
  },
  {
    lang: "javascript",
    label: "JavaScript",
    extension: "js",
    language: "javascript",
    badge: "JS",
  },
  {
    lang: "typescript",
    label: "TypeScript",
    extension: "ts",
    language: "typescript",
    badge: "TS",
  },
  {
    lang: "php",
    label: "PHP",
    extension: "php",
    language: "php",
    badge: "PHP",
  },
] as const;

const baseName = (title: string) => title.replace(/\.[^.]+$/, "") || "未命名";

function SectionLabel({ children }: { children: string }) {
  return (
    <div className="px-2 pb-1 pt-1.5 text-xs font-medium text-muted-foreground">
      {children}
    </div>
  );
}

/**
 * 工具栏「转换」「生成代码」两个下拉面板。
 * 结果一律在新标签页打开，不改动当前文档；任务走 action 作用域，复用工作区的进度条与取消。
 */
export function JsonToolMenus({
  tabKey,
  disabled,
  onBusyChange,
}: {
  tabKey: string;
  disabled?: boolean;
  onBusyChange: (busy: boolean) => void;
}) {
  async function run(input: ConversionInput) {
    onBusyChange(true);
    try {
      return await runJsonTask("action:" + tabKey, input);
    } catch (error) {
      if ((error as Error).name !== "AbortError")
        toast.error("转换失败", (error as Error).message);
      return null;
    } finally {
      onBusyChange(false);
    }
  }

  async function openResult(
    input: ConversionInput,
    extension: string,
    language: string,
  ) {
    const source = useTabStore.getState().getTabByKey(tabKey);
    if (!source?.content.trim()) {
      toast.warning("当前文档为空");
      return;
    }
    const result = await run({ ...input, content: source.content });
    if (result?.content === undefined) return;
    const store = useTabStore.getState();
    store.addTab(`${baseName(source.title)}.${extension}`, result.content);
    store.updateEditorSettings(useTabStore.getState().activeTabKey, {
      language,
      languageMode: "manual",
    });
  }

  async function exportExcel() {
    const content = useTabStore.getState().getTabByKey(tabKey)?.content;
    if (!content?.trim()) {
      toast.warning("当前文档为空");
      return;
    }
    const result = await run({ action: "export", content, format: "xlsx" });
    if (result?.buffer) downloadTableExport(result.buffer, "xlsx");
  }

  const formatItem = (
    option: FormatOption,
    direction: "to-json" | "from-json",
  ) => (
    <DropdownItem
      key={`${direction}-${option.format}`}
      startContent={<option.icon className="size-4 text-muted-foreground" />}
      onPress={() =>
        void openResult(
          {
            action: "bridge",
            content: "",
            format: option.format,
            mode: direction,
          },
          direction === "to-json" ? "json" : option.extension,
          direction === "to-json" ? "json" : option.language,
        )
      }
    >
      {option.label}
    </DropdownItem>
  );

  return (
    <>
      <Dropdown>
        <DropdownTrigger>
          <Button size="sm" variant="ghost" isDisabled={disabled}>
            <ArrowLeftRight />
            转换
            <ChevronDown className="size-3.5 opacity-60" />
          </Button>
        </DropdownTrigger>
        <DropdownMenu aria-label="JSON 转换" className="w-[22rem] p-1.5">
          <div className="grid grid-cols-2 gap-x-1.5">
            <div>
              <SectionLabel>转换为 JSON</SectionLabel>
              {FORMATS.map((option) => formatItem(option, "to-json"))}
            </div>
            <div className="border-l pl-1.5">
              <SectionLabel>从 JSON 转换</SectionLabel>
              {FORMATS.map((option) => formatItem(option, "from-json"))}
              <DropdownItem
                startContent={
                  <FileSpreadsheet className="size-4 text-muted-foreground" />
                }
                onPress={() => void exportExcel()}
              >
                Excel（下载 .xlsx）
              </DropdownItem>
            </div>
          </div>
        </DropdownMenu>
      </Dropdown>
      <Dropdown>
        <DropdownTrigger>
          <Button size="sm" variant="ghost" isDisabled={disabled}>
            <Code2 />
            生成代码
            <ChevronDown className="size-3.5 opacity-60" />
          </Button>
        </DropdownTrigger>
        <DropdownMenu aria-label="JSON 生成代码" className="w-[19rem] p-1.5">
          <SectionLabel>根据 JSON 生成类型定义</SectionLabel>
          <div className="grid grid-cols-2 gap-x-1">
            {CODE_LANGUAGES.map((item) => (
              <DropdownItem
                key={item.lang}
                startContent={
                  <span className="inline-flex h-5 w-8 shrink-0 items-center justify-center rounded bg-muted font-mono text-[0.625rem] font-semibold tracking-tight text-muted-foreground">
                    {item.badge}
                  </span>
                }
                onPress={() =>
                  void openResult(
                    {
                      action: "type",
                      content: "",
                      language: item.lang,
                      name: "Root",
                    },
                    item.extension,
                    item.language,
                  )
                }
              >
                {item.label}
              </DropdownItem>
            ))}
          </div>
        </DropdownMenu>
      </Dropdown>
    </>
  );
}
