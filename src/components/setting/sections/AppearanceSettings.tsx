import {
  ChoiceCard,
  GroupLabel,
  SectionCard,
  SectionHeader,
} from "../settingPrimitives";

import {
  useSettingsStore,
  type ChatStyle,
  type ColorTheme,
  type FontSize,
} from "@/store/useSettingsStore";
import toast from "@/utils/toast";

const FONT_OPTIONS: Array<{
  value: FontSize;
  label: string;
  desc: string;
  previewSize: string;
}> = [
  { value: "small", label: "小号", desc: "紧凑省空间", previewSize: "13px" },
  { value: "medium", label: "标准", desc: "平衡阅读", previewSize: "16px" },
  { value: "large", label: "大号", desc: "清晰易见", previewSize: "19px" },
];

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
 * 外观设置（Apple 系统风）：主题配色、聊天样式、字体大小，均用可视化选择卡片。
 */
export function AppearanceSettings() {
  const chatStyle = useSettingsStore((s) => s.chatStyle);
  const setChatStyle = useSettingsStore((s) => s.setChatStyle);
  const fontSize = useSettingsStore((s) => s.fontSize);
  const setFontSize = useSettingsStore((s) => s.setFontSize);
  const colorTheme = useSettingsStore((s) => s.colorTheme);
  const setColorTheme = useSettingsStore((s) => s.setColorTheme);

  const handleStyleChange = (style: ChatStyle) => {
    setChatStyle(style);
    toast.success("聊天窗口样式已更改");
  };

  const handleFontSizeChange = (size: FontSize) => {
    setFontSize(size);
    toast.success("字体大小已更改");
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
              <p className="text-[12.5px] font-semibold text-foreground">
                {opt.label}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
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
            <p className="text-[12.5px] font-semibold text-foreground">
              气泡模式
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
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
            <p className="text-[12.5px] font-semibold text-foreground">
              文档模式
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              上下排列的文档流
            </p>
          </ChoiceCard>
        </div>
      </SectionCard>

      <GroupLabel>字体大小</GroupLabel>
      <SectionCard>
        <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-3 sm:p-4">
          {FONT_OPTIONS.map((opt) => (
            <ChoiceCard
              key={opt.value}
              selected={fontSize === opt.value}
              onSelect={() => handleFontSizeChange(opt.value)}
            >
              <div
                className="mb-2 font-semibold text-foreground"
                style={{ fontSize: opt.previewSize }}
              >
                Aa 示例
              </div>
              <p className="text-[12px] font-semibold text-foreground">
                {opt.label}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {opt.desc}
              </p>
            </ChoiceCard>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
