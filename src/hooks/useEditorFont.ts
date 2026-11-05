import { useSettingsStore } from "@/store/useSettingsStore";
import { DEFAULT_CODE_FONT, toFontStack } from "@/styles/fonts";

/** Monaco 编辑器的字号和字体，跟随外观设置 */
export function useEditorFont() {
  const fontSize = useSettingsStore((s) => s.editorFontSize);
  const codeFontFamily = useSettingsStore((s) => s.codeFontFamily);

  return {
    fontSize,
    fontFamily: toFontStack(codeFontFamily, DEFAULT_CODE_FONT),
  };
}

/** 只读预览类编辑器保持小字号，只跟随代码字体 */
export function getEditorFontFamily(): string {
  return toFontStack(
    useSettingsStore.getState().codeFontFamily,
    DEFAULT_CODE_FONT,
  );
}
