import type { ComponentType } from "react";
import {
  ArchiveIcon,
  ArrowLeftIcon,
  BellIcon,
  CodeIcon,
  GitBranchIcon,
  NetworkIcon,
  PaletteIcon,
  PlugIcon,
  QrCodeIcon,
  Settings2Icon,
  UserIcon,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";

import {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "../ui/sidebar";

export type SettingsSectionPath =
  | "/settings/general"
  | "/settings/appearance"
  | "/settings/providers"
  | "/settings/git"
  | "/settings/notifications"
  | "/settings/personalization"
  | "/settings/mobile"
  | "/settings/mcp"
  | "/settings/a2a"
  | "/settings/archived";

export const SETTINGS_NAV_ITEMS: ReadonlyArray<{
  label: string;
  to: SettingsSectionPath;
  icon: ComponentType<{ className?: string }>;
}> = [
  { label: "General", to: "/settings/general", icon: Settings2Icon },
  { label: "Appearance", to: "/settings/appearance", icon: PaletteIcon },
  { label: "Providers", to: "/settings/providers", icon: CodeIcon },
  { label: "Git & Code Review", to: "/settings/git", icon: GitBranchIcon },
  { label: "Notifications", to: "/settings/notifications", icon: BellIcon },
  { label: "Personalization", to: "/settings/personalization", icon: UserIcon },
  { label: "Mobile", to: "/settings/mobile", icon: QrCodeIcon },
  { label: "MCP & Plugins", to: "/settings/mcp", icon: PlugIcon },
  { label: "A2A Agents", to: "/settings/a2a", icon: NetworkIcon },
  { label: "Archive", to: "/settings/archived", icon: ArchiveIcon },
];

export function SettingsSidebarNav({ pathname }: { pathname: string }) {
  const navigate = useNavigate();

  return (
    <>
      <SidebarContent className="overflow-x-hidden">
        <SidebarGroup className="px-2 py-3">
          <SidebarMenu>
            {SETTINGS_NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.to;
              return (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton
                    size="sm"
                    isActive={isActive}
                    className={
                      isActive
                        ? "gap-2 px-2 py-2 text-left text-xs text-foreground"
                        : "gap-2 px-2 py-2 text-left text-xs text-muted-foreground hover:text-foreground/80"
                    }
                    onClick={() => void navigate({ to: item.to, replace: true })}
                  >
                    <Icon
                      className={
                        isActive
                          ? "size-4 shrink-0 text-foreground"
                          : "size-4 shrink-0 text-muted-foreground"
                      }
                    />
                    <span className="truncate">{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarSeparator />
      <SidebarFooter className="p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="sm"
              className="gap-2 px-2 py-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={() => window.history.back()}
            >
              <ArrowLeftIcon className="size-4" />
              <span>Back</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </>
  );
}
