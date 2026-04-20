import type { ElementType } from "react";
import { useEffect, useState } from "react";
import { LayoutDashboard, PanelLeftDashed, Search, Settings } from "lucide-react";
import { NavLink } from "react-router-dom";

import UserDropdown from "./UserDropdown";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

type MenuItem = {
  label: string;
  icon: ElementType;
  href: string;
};

type MenuGroup = {
  title: string;
  items: MenuItem[];
};

const menuGroups: MenuGroup[] = [
  {
    title: "General",
    items: [
      { label: "Dashboard", icon: LayoutDashboard, href: "/dashboard" },
      { label: "Call Lookup", icon: Search, href: "/call-lookup" },
    ],
  },
  {
    title: "Settings",
    items: [{ label: "Account", icon: Settings, href: "/account" }],
  },
];

type SidebarProps = {
  collapsed: boolean;
  setCollapsed: (value: boolean) => void;
  username: string | null;
  email: string | null;
};

export default function Sidebar({
  collapsed,
  setCollapsed,
  username,
  email,
}: SidebarProps) {
  const [openStates, setOpenStates] = useState<boolean[]>(
    menuGroups.map(() => true)
  );

  useEffect(() => {
    setOpenStates(menuGroups.map(() => true));
  }, []);

  const handleToggle = (index: number, isOpen: boolean) => {
    setOpenStates((current) => {
      const next = [...current];
      next[index] = isOpen;
      return next;
    });
  };

  return (
    <aside
      className={cn(
        "fixed top-0 left-0 z-40 h-screen overflow-hidden border-r bg-background text-foreground transition-[width] duration-300 ease-in-out will-change-[width]",
        collapsed ? "w-[80px]" : "w-[260px]"
      )}
    >
      <div className="flex h-14 items-center justify-between px-4">
        <div
          className={cn(
            "overflow-hidden transition-[max-width,opacity] duration-300 ease-in-out",
            collapsed ? "max-w-0 opacity-0" : "max-w-[160px] opacity-100"
          )}
        >
          <span className="block whitespace-nowrap text-lg font-semibold">
            Client Portal
          </span>
        </div>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed(!collapsed)}
          className="flex h-10 w-10 shrink-0 items-center justify-center transition-colors duration-200 hover:bg-muted"
        >
          <PanelLeftDashed
            className={cn(
              "h-5 w-5 transition-transform duration-300 ease-in-out",
              collapsed ? "rotate-180" : "rotate-0"
            )}
          />
        </Button>
      </div>

      <nav className="px-3 pt-4 pb-16">
        {menuGroups.map((group, idx) => (
          <Collapsible
            key={group.title}
            open={openStates[idx]}
            onOpenChange={(isOpen) => handleToggle(idx, isOpen)}
          >
            <div
              className={cn(
                "overflow-hidden transition-[max-height,opacity,margin] duration-200 ease-in-out",
                collapsed ? "mb-0 max-h-0 opacity-0" : "mb-1 max-h-8 opacity-100"
              )}
            >
              <CollapsibleTrigger className="w-full px-2 py-1 text-left text-xs font-semibold text-muted-foreground">
                {group.title}
              </CollapsibleTrigger>
            </div>

            <CollapsibleContent>
              {group.items.map((item) => (
                <NavLink
                  key={item.label}
                  to={item.href}
                  className={({ isActive }) =>
                    cn(
                      "group relative flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-[background-color,color,padding] duration-200",
                      collapsed && "justify-center",
                      isActive
                        ? "bg-muted font-semibold text-primary"
                        : "hover:bg-muted"
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <item.icon
                        className={cn(
                          "h-4 w-4 shrink-0",
                          isActive
                            ? "text-primary"
                            : "text-foreground group-hover:text-primary"
                        )}
                      />

                      <span
                        className={cn(
                          "overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-200 ease-in-out",
                          collapsed ? "max-w-0 opacity-0" : "max-w-[140px] opacity-100"
                        )}
                      >
                        {item.label}
                      </span>

                      {collapsed && (
                        <span
                          className={cn(
                            "pointer-events-none absolute left-full ml-2 rounded-md bg-popover px-2 py-1 text-xs font-medium text-popover-foreground opacity-0 shadow-md transition-all translate-x-[-10px] group-hover:translate-x-0 group-hover:opacity-100"
                          )}
                        >
                          {item.label}
                        </span>
                      )}
                    </>
                  )}
                </NavLink>
              ))}
            </CollapsibleContent>
            <div className="h-3" />
          </Collapsible>
        ))}
      </nav>

      <div className="absolute bottom-0 left-0 w-full border-t border-border bg-background p-4">
        <UserDropdown collapsed={collapsed} username={username} email={email} />
      </div>
    </aside>
  );
}
