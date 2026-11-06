import React from "react";
import { Icon } from "@/components/ui/icon";

const JsonPathBar: React.FC<{ currentPath: string }> = ({ currentPath }) => (
  <div className="flex h-8 shrink-0 items-center gap-1 border-b border-border bg-muted px-2 text-sm text-muted-foreground">
    <Icon icon="solar:folder-path-duotone" width={16} />
    <span className="truncate">{currentPath}</span>
  </div>
);

export default JsonPathBar;
