import { useEffect, useRef, useState } from "react";
import { ClipboardPaste, Database, Link, Upload } from "lucide-react";

import {
  Button,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Tab,
  Tabs,
  Textarea,
} from "@/components/ui";
import { DATA_FILE_ACCEPT } from "@/utils/dataFormats";
import { JsonSample } from "@/utils/jsonSample";
import toast from "@/utils/toast";

type Source = "paste" | "file" | "url" | "sample";

const SAMPLE_PREVIEW = JsonSample.split("\n").slice(0, 14).join("\n");

function parseHttpUrl(text: string): URL | null {
  try {
    return new URL(text.trim());
  } catch {
    return null;
  }
}

function TabTitle({
  icon: Icon,
  label,
}: {
  icon: typeof Upload;
  label: string;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <Icon className="size-3.5" />
      {label}
    </span>
  );
}

/** 导入数据到当前文档：粘贴、上传文件、URL、示例数据。替换前的内容会进入历史记录。 */
export function ImportDialog({
  isOpen,
  onClose,
  onImport,
}: {
  isOpen: boolean;
  onClose: () => void;
  onImport: (content: string) => void;
}) {
  const [source, setSource] = useState<Source>("paste");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const request = useRef<AbortController | null>(null);

  useEffect(() => () => request.current?.abort(), []);

  const close = () => {
    request.current?.abort();
    setBusy(false);
    setDragging(false);
    onClose();
  };

  const finish = (content: string) => {
    onImport(content);
    setText("");
    setUrl("");
    close();
    toast.success("已导入，原内容可在历史中恢复");
  };

  const importFile = async (file?: File) => {
    if (!file) return;
    try {
      finish(await file.text());
    } catch (error) {
      toast.error("无法读取文件", String(error));
    }
  };

  const importUrl = async () => {
    const target = parseHttpUrl(url);
    if (!target || !["http:", "https:"].includes(target.protocol)) {
      toast.error("地址无效", "请输入完整的 HTTP 或 HTTPS 地址");
      return;
    }
    setBusy(true);
    try {
      request.current?.abort();
      const controller = new AbortController();
      request.current = controller;
      const response = await fetch(target, { signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      finish(await response.text());
    } catch (error) {
      const { name, message } = error as Error;
      if (name === "AbortError") return;
      // fetch 遇到网络错误或 CORS 拒绝时只抛 TypeError("Failed to fetch")，浏览器不暴露具体原因
      toast.error(
        "导入失败",
        name === "TypeError"
          ? "无法访问该地址：网络不通，或目标服务不允许跨域访问"
          : message,
      );
    } finally {
      setBusy(false);
    }
  };

  const primary = {
    paste: {
      label: "导入",
      disabled: !text.trim(),
      run: () => finish(text),
    },
    file: {
      label: "选择文件",
      disabled: false,
      run: () => fileInput.current?.click(),
    },
    url: {
      label: "导入",
      disabled: !url.trim() || busy,
      run: () => void importUrl(),
    },
    sample: {
      label: "载入示例",
      disabled: false,
      run: () => finish(JsonSample),
    },
  }[source];

  return (
    <Modal isOpen={isOpen} size="2xl" onClose={close}>
      {/* 弹窗经 portal 渲染，但 React 事件仍沿组件树冒泡到工作区的拖放处理（会新建标签），在这里截住 */}
      <ModalContent
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        <ModalHeader>
          导入数据
          <p className="mt-1 text-xs font-normal text-muted-foreground">
            导入的内容会替换当前文档，原内容保留在历史记录中
          </p>
        </ModalHeader>
        <ModalBody className="px-0 pb-0">
          <Tabs
            aria-label="导入方式"
            classNames={{ tabList: "border-b px-4", tab: "py-2.5" }}
            selectedKey={source}
            onSelectionChange={(key) => setSource(key as Source)}
          >
            <Tab
              key="paste"
              title={<TabTitle icon={ClipboardPaste} label="粘贴数据" />}
            >
              <div className="px-5 py-4">
                <Textarea
                  aria-label="粘贴数据"
                  className="font-mono"
                  minRows={12}
                  placeholder="在这里粘贴 JSON、YAML、XML 等数据，⌘/Ctrl + Enter 导入"
                  spellCheck={false}
                  value={text}
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      (e.metaKey || e.ctrlKey) &&
                      text.trim()
                    )
                      finish(text);
                  }}
                  onValueChange={setText}
                />
              </div>
            </Tab>
            <Tab key="file" title={<TabTitle icon={Upload} label="上传文件" />}>
              <div className="px-5 py-4">
                <input
                  ref={fileInput}
                  accept={DATA_FILE_ACCEPT}
                  className="hidden"
                  type="file"
                  onChange={(e) => {
                    void importFile(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
                <div
                  className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-12 text-center transition-colors ${dragging ? "border-primary bg-accent" : "border-border"}`}
                  onDragLeave={() => setDragging(false)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setDragging(true);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setDragging(false);
                    void importFile(e.dataTransfer.files[0]);
                  }}
                >
                  <Upload className="size-7 text-muted-foreground" />
                  <p className="text-sm font-medium">将文件拖放到这里</p>
                  <p className="text-xs text-muted-foreground">
                    或点击浏览文件
                  </p>
                  <Button
                    className="mt-1"
                    size="sm"
                    onPress={() => fileInput.current?.click()}
                  >
                    选择文件
                  </Button>
                </div>
                <p className="mt-3 text-center text-xs text-muted-foreground">
                  支持 JSON、JSON5、YAML、XML、TOML、CSV 等文本文件
                </p>
              </div>
            </Tab>
            <Tab key="url" title={<TabTitle icon={Link} label="从 URL 导入" />}>
              <div className="space-y-2 px-5 py-4">
                <Input
                  aria-label="URL 地址"
                  placeholder="https://example.com/data.json"
                  spellCheck={false}
                  value={url}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && url.trim() && !busy)
                      void importUrl();
                  }}
                  onValueChange={setUrl}
                />
                <p className="text-xs text-muted-foreground">
                  直接从浏览器请求该地址，目标服务需要允许跨域访问（CORS）
                </p>
              </div>
            </Tab>
            <Tab
              key="sample"
              title={<TabTitle icon={Database} label="示例数据" />}
            >
              <div className="px-5 py-4">
                <pre className="max-h-72 overflow-auto rounded-md border bg-muted/60 px-3 py-2.5 font-mono text-xs leading-relaxed text-muted-foreground">
                  {SAMPLE_PREVIEW}
                  {"\n…"}
                </pre>
              </div>
            </Tab>
          </Tabs>
        </ModalBody>
        <ModalFooter className="border-t">
          <Button variant="ghost" onPress={close}>
            取消
          </Button>
          <Button
            color="primary"
            isDisabled={primary.disabled}
            isLoading={busy && source === "url"}
            startContent={
              source === "file" ? <Upload className="size-4" /> : undefined
            }
            onPress={primary.run}
          >
            {primary.label}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
