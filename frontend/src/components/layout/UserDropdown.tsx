import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { LogOut, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCsrfToken } from "@/lib/csrf";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

export default function UserDropdown({
  collapsed,
  username,
  email,
}: {
  collapsed: boolean;
  username: string | null;
  email: string | null;
}) {
  const navigate = useNavigate();

  const handleLogout = async () => {
    const res = await fetch("/api/logout/", {
      method: "POST",
      headers: {
        "X-CSRFToken": getCsrfToken(),
      },
      credentials: "include",
    });
    if (res.ok) {
      toast.success("Logged out");
      localStorage.removeItem("empdetails_data");
      navigate("/login");
    } else {
      toast.error("Logout failed");
    }
  };

  const initials = username ? username[0].toUpperCase() : "U";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="w-full flex items-center gap-2 justify-start px-2 py-2 hover:bg-muted transition-all"
        >
          {/* Avatar */}
          <Avatar className="h-8 w-8">
            <AvatarImage src="/placeholder.jpg" alt={username || "User"} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>

          {/* Username & email (hidden in collapsed mode) */}
          {!collapsed && (
            <div className="flex flex-col text-left overflow-hidden">
              <span className="text-sm font-medium truncate max-w-[140px]">
                {username || "Loading..."}
              </span>
              <span className="text-xs text-muted-foreground truncate max-w-[140px]">
                {email || ""}
              </span>
            </div>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent className="w-56" align="start">
        <DropdownMenuLabel>My Account</DropdownMenuLabel>

        <DropdownMenuItem onClick={() => navigate("/account")}>
          <Settings className="h-4 w-4 mr-2" />
          Account
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={handleLogout}
          className="text-red-500 focus:bg-red-100 dark:focus:bg-red-900 focus:text-red-600 dark:focus:text-red-400 cursor-pointer"
        >
          <LogOut className="h-4 w-4 mr-2" />
          <span className="font-medium">Sign out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
