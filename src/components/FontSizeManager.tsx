import { useLayoutEffect } from "react";

import {
  FONT_SETTINGS_STORAGE_KEY,
  useSettingsStore,
} from "@/store/useSettingsStore";
import {
  DEFAULT_CODE_FONT,
  DEFAULT_UI_FONT,
  UI_FONT_SIZE,
  toFontStack,
} from "@/styles/fonts";

// 界面文字用 rem，默认字号 13px 对应根字号 16px
const ROOT_PX_PER_UI_PX = 16 / UI_FONT_SIZE.default;

/** 把字号和自定义字体同步到 <html>；Monaco 通过 useEditorFont 单独读取。 */
export function FontSizeManager() {
  const uiFontSize = useSettingsStore((s) => s.uiFontSize);
  const editorFontSize = useSettingsStore((s) => s.editorFontSize);
  const uiFontFamily = useSettingsStore((s) => s.uiFontFamily);
  const codeFontFamily = useSettingsStore((s) => s.codeFontFamily);

  useLayoutEffect(() => {
    const root = document.documentElement.style;

    root.fontSize = `${uiFontSize * ROOT_PX_PER_UI_PX}px`;
    root.setProperty("--editor-font-size", `${editorFontSize}px`);
    root.setProperty("--font-ui", toFontStack(uiFontFamily, DEFAULT_UI_FONT));
    root.setProperty(
      "--font-code",
      toFontStack(codeFontFamily, DEFAULT_CODE_FONT),
    );
    localStorage.setItem(
      FONT_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        uiFontSize,
        editorFontSize,
        uiFontFamily,
        codeFontFamily,
      }),
    );
  }, [uiFontSize, editorFontSize, uiFontFamily, codeFontFamily]);

  return null;
}
