import { useState } from "react";

import {
  ChoiceCard,
  ControlSlot,
  GroupLabel,
  SectionCard,
  SectionHeader,
  SettingRow,
} from "../settingPrimitives";

import { Input, Slider } from "@/components/ui";
import {
  useSettingsStore,
  type ChatStyle,
  type ColorTheme,
} from "@/store/useSettingsStore";
import { EDITOR_FONT_SIZE, UI_FONT_SIZE } from "@/styles/fonts";
import toast from "@/utils/toast";

interface FontSizeControlProps {
  label: string;
  value: number;
  range: { min: number; max: number };
  onChange: (value: number) => void;
}

/** 滑块拖动调节，数字框可直接输入；输入过程中的越界值（如键入 16 时的 1）不生效，失焦后回显实际值。 */
function FontSizeControl({ label, value, range, onChange }: FontSizeControlProps) {
  const [draft, setDraft] = useState(String(value));
  const [synced, setSynced] = useState(value);

  if (synced !== value) {
    setSynced(value);
    setDraft(String(value));
  }

  const handleDraftChange = (text: string) => {
    setDraft(text);
    const size = Number(text);

    if (Number.isInteger(size) && size >= range.min && size <= range.max) {
      onChange(size);
    }
  };

  return (
    <ControlSlot className="sm:min-w-[260px]" align="stretch">
      <Slider
        aria-label={label}
        className="min-w-[120px] flex-1 sm:w-36"
        maxValue={range.max}
        minValue={range.min}
        step={1}
        value={value}
        onChange={(size) => onChange(size as number)}
      />
      <Input
        aria-label={`${label}（px）`}
        className="w-[76px] flex-none"
        classNames={{ input: "tabular-nums" }}
        endContent={<span className="text-xs text-muted-foreground">px</span>}
        inputMode="numeric"
        max={range.max}
        min={range.min}
        step={1}
        type="number"
        value={draft}
        onBlur={() => setDraft(String(value))}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        onValueChange={handleDraftChange}
      />
    </ControlSlot>
  );
}

interface FontFamilyInputProps {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}

function FontFamilyInput({
  label,
  placeholder,
  value,
  onChange,
}: FontFamilyInputProps) {
  return (
    <ControlSlot className="sm:min-w-[260px]" align="stretch">
      <Input
        isClearable
        aria-label={label}
        className="min-w-[180px] flex-1 sm:w-[260px]"
        placeholder={placeholder}
        spellCheck={false}
        value={value}
        onClear={() => onChange("")}
        onValueChange={onChange}
      />
    </ControlSlot>
  );
}

const FONT_FAMILY_HINT = "填写已安装的字体名，多个用逗号分隔；留空使用系统默认";

interface PalettePreview {
  background: string;
  surface: string;
  border: string;
  primary: string;
  key: string;
  string: string;
}

// 预览色取自 globals.css 中对应配色的变量，改配色时一并更新
const THEME_OPTIONS: Array<{
  value: ColorTheme;
  label: string;
  desc: string;
  light: PalettePreview;
  dark: PalettePreview;
}> = [
  {
    value: "slate",
    label: "冷灰靛蓝",
    desc: "冷静克制的蓝调",
    light: {
      background: "#ffffff",
      surface: "#f9f9fb",
      border: "#e0e1e6",
      primary: "#3e63dd",
      key: "#3a5bc7",
      string: "#18794e",
    },
    dark: {
      background: "#111113",
      surface: "#0e0e10",
      border: "#2e3135",
      primary: "#8fa5f5",
      key: "#9eb1ff",
      string: "#8fd8b0",
    },
  },
  {
    value: "warm",
    label: "暖纸青墨",
    desc: "米白纸感配青绿",
    light: {
      background: "#ffffff",
      surface: "#f9f8f5",
      border: "#e6e3dc",
      primary: "#0e6e66",
      key: "#0e6e66",
      string: "#4a7a22",
    },
    dark: {
      background: "#171614",
      surface: "#121110",
      border: "#33302b",
      primary: "#6ccbb9",
      key: "#79cdbd",
      string: "#b9d68f",
    },
  },
  {
    value: "mono",
    label: "墨黑单色",
    desc: "黑白为主，只给代码上色",
    light: {
      background: "#ffffff",
      surface: "#f9f9fa",
      border: "#e6e6e9",
      primary: "#1a1a1d",
      key: "#2650b8",
      string: "#17784a",
    },
    dark: {
      background: "#111112",
      surface: "#0d0d0e",
      border: "#2c2c30",
      primary: "#ededef",
      key: "#8db4ff",
      string: "#7fd19f",
    },
  },
];

function PaletteHalf({ colors }: { colors: PalettePreview }) {
  return (
    <div className="flex flex-1" style={{ background: colors.background }}>
      <div
        className="flex w-4 flex-col items-center pt-2"
        style={{
          background: colors.surface,
          borderRight: `1px solid ${colors.border}`,
        }}
      >
        <div
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: colors.primary }}
        />
      </div>
      <div className="flex flex-1 flex-col justify-center gap-1.5 px-2">
        <div className="flex gap-1">
          <div
            className="h-1.5 w-5 rounded-full"
            style={{ background: colors.key }}
          />
          <div
            className="h-1.5 w-7 rounded-full"
            style={{ background: colors.string }}
          />
        </div>
        <div className="flex gap-1 pl-2">
          <div
            className="h-1.5 w-4 rounded-full"
            style={{ background: colors.key }}
          />
          <div
            className="h-1.5 w-5 rounded-full"
            style={{ background: colors.string }}
          />
        </div>
        <div
          className="h-1.5 w-8 rounded-full"
          style={{ background: colors.primary }}
        />
      </div>
    </div>
  );
}

/**
 * 外观设置（Apple 系统风）：主题配色、聊天样式用选择卡片；界面/编辑器的字号和字体单独调节。
 */
export function AppearanceSettings() {
  const chatStyle = useSettingsStore((s) => s.chatStyle);
  const setChatStyle = useSettingsStore((s) => s.setChatStyle);
  const colorTheme = useSettingsStore((s) => s.colorTheme);
  const setColorTheme = useSettingsStore((s) => s.setColorTheme);
  const uiFontSize = useSettingsStore((s) => s.uiFontSize);
  const setUiFontSize = useSettingsStore((s) => s.setUiFontSize);
  const editorFontSize = useSettingsStore((s) => s.editorFontSize);
  const setEditorFontSize = useSettingsStore((s) => s.setEditorFontSize);
  const uiFontFamily = useSettingsStore((s) => s.uiFontFamily);
  const setUiFontFamily = useSettingsStore((s) => s.setUiFontFamily);
  const codeFontFamily = useSettingsStore((s) => s.codeFontFamily);
  const setCodeFontFamily = useSettingsStore((s) => s.setCodeFontFamily);

  const handleStyleChange = (style: ChatStyle) => {
    setChatStyle(style);
    toast.success("聊天窗口样式已更改");
  };

  return (
    <div className="h-full">
      <SectionHeader
        description="自定义应用的外观和显示方式"
        title="外观设置"
      />

      <GroupLabel>主题配色</GroupLabel>
      <SectionCard>
        <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-3 sm:p-4">
          {THEME_OPTIONS.map((opt) => (
            <ChoiceCard
              key={opt.value}
              selected={colorTheme === opt.value}
              onSelect={() => setColorTheme(opt.value)}
            >
              <div className="mb-2.5 flex h-[68px] overflow-hidden rounded-md border border-border/70">
                <PaletteHalf colors={opt.light} />
                <PaletteHalf colors={opt.dark} />
              </div>
              <p className="text-[0.78125rem] font-semibold text-foreground">
                {opt.label}
              </p>
              <p className="mt-0.5 text-[0.6875rem] text-muted-foreground">
                {opt.desc}
              </p>
            </ChoiceCard>
          ))}
        </div>
      </SectionCard>

      <GroupLabel>聊天窗口样式</GroupLabel>
      <SectionCard>
        <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 sm:p-4">
          <ChoiceCard
            selected={chatStyle === "bubble"}
            onSelect={() => handleStyleChange("bubble")}
          >
            <div className="mb-2.5 flex h-[68px] items-center rounded-md bg-secondary p-2.5">
              <div className="flex w-full flex-col gap-1.5">
                <div className="h-2 w-full rounded-full bg-primary/40" />
                <div className="ml-auto h-2 w-3/5 rounded-full bg-input" />
                <div className="h-2 w-[90%] rounded-full bg-primary/40" />
              </div>
            </div>
            <p className="text-[0.78125rem] font-semibold text-foreground">
              气泡模式
            </p>
            <p className="mt-0.5 text-[0.6875rem] text-muted-foreground">
              左右分列的对话气泡
            </p>
          </ChoiceCard>

          <ChoiceCard
            selected={chatStyle === "document"}
            onSelect={() => handleStyleChange("document")}
          >
            <div className="mb-2.5 flex h-[68px] items-center rounded-md bg-secondary p-2.5">
              <div className="flex w-full flex-col gap-1.5">
                <div className="h-1.5 w-full rounded-sm bg-primary/40" />
                <div className="h-1.5 w-full rounded-sm bg-input" />
                <div className="h-1.5 w-3/4 rounded-sm bg-primary/40" />
                <div className="h-1.5 w-full rounded-sm bg-input" />
              </div>
            </div>
            <p className="text-[0.78125rem] font-semibold text-foreground">
              文档模式
            </p>
            <p className="mt-0.5 text-[0.6875rem] text-muted-foreground">
              上下排列的文档流
            </p>
          </ChoiceCard>
        </div>
      </SectionCard>

      <GroupLabel>界面字体</GroupLabel>
      <SectionCard divided>
        <SettingRow
          description={`菜单、按钮、设置页等文字，${UI_FONT_SIZE.min}–${UI_FONT_SIZE.max}px，默认 ${UI_FONT_SIZE.default}px`}
          icon="lucide:ruler"
          title="字号"
          tone="info"
        >
          <FontSizeControl
            label="界面字号"
            range={UI_FONT_SIZE}
            value={uiFontSize}
            onChange={setUiFontSize}
          />
        </SettingRow>
        <SettingRow
          description={FONT_FAMILY_HINT}
          icon="lucide:text-font"
          title="字体"
          tone="info"
        >
          <FontFamilyInput
            label="界面字体"
            placeholder="例如 PingFang SC, Inter"
            value={uiFontFamily}
            onChange={setUiFontFamily}
          />
        </SettingRow>
      </SectionCard>

      <GroupLabel>编辑器字体</GroupLabel>
      <SectionCard divided>
        <SettingRow
          description={`代码编辑器与对比视图，${EDITOR_FONT_SIZE.min}–${EDITOR_FONT_SIZE.max}px，默认 ${EDITOR_FONT_SIZE.default}px`}
          icon="lucide:ruler"
          title="字号"
          tone="violet"
        >
          <FontSizeControl
            label="编辑器字号"
            range={EDITOR_FONT_SIZE}
            value={editorFontSize}
            onChange={setEditorFontSize}
          />
        </SettingRow>
        <SettingRow
          description={`${FONT_FAMILY_HINT}，建议等宽字体`}
          icon="lucide:file-code"
          title="字体"
          tone="violet"
        >
          <FontFamilyInput
            label="编辑器字体"
            placeholder="例如 JetBrains Mono, Fira Code"
            value={codeFontFamily}
            onChange={setCodeFontFamily}
          />
        </SettingRow>
        <div className="px-3 py-3 sm:px-4">
          <pre
            aria-label="编辑器字体预览"
            className="overflow-x-auto rounded-md border border-border/70 bg-muted/60 px-3 py-2.5 font-mono leading-relaxed text-foreground"
            style={{ fontSize: editorFontSize }}
          >
            <span className="text-[var(--editor-key)]">"name"</span>
            {": "}
            <span className="text-[var(--editor-string)]">"Datamorph"</span>
            {", "}
            <span className="text-[var(--editor-key)]">"il1|O0"</span>
            {": "}
            <span className="text-[var(--editor-keyword)]">true</span>
          </pre>
        </div>
      </SectionCard>
    </div>
  );
}
