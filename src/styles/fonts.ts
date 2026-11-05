// 需与 globals.css 中 --font-ui / --font-code 的默认值保持一致
export const DEFAULT_UI_FONT =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
export const DEFAULT_CODE_FONT =
  '"SFMono-Regular", Consolas, "Liberation Mono", monospace';

export const UI_FONT_SIZE = { min: 12, max: 18, default: 13 } as const;
export const EDITOR_FONT_SIZE = { min: 12, max: 24, default: 14 } as const;

const GENERIC_FAMILIES = new Set([
  "serif",
  "sans-serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "ui-serif",
  "ui-sans-serif",
  "ui-monospace",
  "ui-rounded",
]);

/**
 * 把用户输入的字体名（可用逗号分隔多个）放在默认字体栈前面。
 * 输入的字体未安装时浏览器会自动回退到默认栈。
 */
export function toFontStack(custom: string, fallback: string): string {
  const families = custom
    .split(",")
    .map((name) => name.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean)
    .map((name) => (GENERIC_FAMILIES.has(name) ? name : `"${name}"`));

  return [...families, fallback].join(", ");
}
