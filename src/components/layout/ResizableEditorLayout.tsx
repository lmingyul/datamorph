import { Children, useEffect, useState, type ReactNode } from "react";
import { PanelGroup, Panel, PanelResizeHandle } from "react-resizable-panels";
import { cn } from "@/components/ui";
interface Props {
  leftPanel?: ReactNode;
  rightPanel?: ReactNode;
  children?: ReactNode;
  initialLeftWidth?: number;
  minLeftWidth?: number;
  maxLeftWidth?: number;
  className?: string;
  onResize?: (size: number) => void;
  onResizeComplete?: (size: number) => void;
  resizeHandle?: ReactNode;
  isStacked?: boolean;
  autoSaveId?: string;
}
export default function ResizableEditorLayout({
  leftPanel,
  rightPanel,
  children,
  initialLeftWidth = 50,
  minLeftWidth = 20,
  maxLeftWidth = 80,
  className,
  onResize,
  onResizeComplete,
  isStacked = false,
  autoSaveId,
}: Props) {
  const [narrow, setNarrow] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const resize = () => setNarrow(window.innerWidth < 768);
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  const panels = children
    ? Children.toArray(children)
    : [leftPanel, rightPanel].filter(Boolean);
  const vertical = isStacked || narrow;
  return (
    <PanelGroup
      direction={vertical ? "vertical" : "horizontal"}
      className={cn("h-full min-h-0 w-full", className)}
      autoSaveId={autoSaveId}
      onLayout={(sizes) => {
        onResize?.(sizes[0]);
        onResizeComplete?.(sizes[0]);
      }}
    >
      {/* id/order let the second panel mount and unmount without remounting the first.
          The upper bound lives on the second panel's minSize: changing this panel's
          maxSize in the same commit as adding a panel crashes react-resizable-panels. */}
      <Panel
        id="primary"
        order={1}
        defaultSize={initialLeftWidth}
        minSize={minLeftWidth}
      >
        <div className="h-full min-h-0 overflow-hidden">{panels[0]}</div>
      </Panel>
      {panels.length > 1 && (
        <>
          <PanelResizeHandle
            aria-label="调整输入输出区域"
            className={cn(
              "bg-border transition-colors hover:bg-primary focus-visible:bg-primary",
              vertical ? "h-1" : "w-1",
            )}
          />
          <Panel id="secondary" order={2} minSize={100 - maxLeftWidth}>
            <div className="h-full min-h-0 overflow-hidden">{panels[1]}</div>
          </Panel>
        </>
      )}
    </PanelGroup>
  );
}
