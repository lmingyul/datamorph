import { useLayoutEffect } from "react";

import { refreshEditorTheme } from "@/components/monacoEditor/editorTheme";
import {
  COLOR_THEME_STORAGE_KEY,
  useSettingsStore,
} from "@/store/useSettingsStore";

/** 把设置里的主题配色同步到 <html data-palette>，并刷新 Monaco 主题。 */
export function ColorThemeManager() {
  const colorTheme = useSettingsStore((s) => s.colorTheme);

  // layout effect 在首帧绘制前执行，启动时不会先闪一下默认配色
  useLayoutEffect(() => {
    document.documentElement.dataset.palette = colorTheme;
    localStorage.setItem(COLOR_THEME_STORAGE_KEY, colorTheme);
    refreshEditorTheme();
  }, [colorTheme]);

  return null;
}
