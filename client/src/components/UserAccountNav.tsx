import { useLocation } from "wouter";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/components/SupabaseProvider";

export function UserAccountNav() {
  const { user, isLoading, signOut } = useAuth();
  const [, setLocation] = useLocation();

  const handleLogout = async () => {
    try {
      console.log('🔄 UserAccountNav logout clicked');
      await signOut();
    } catch (error) {
      console.error("Logout failed", error);
    }
  };

  // When not authenticated or still loading
  if (isLoading || !user) {
    return (
      <Button variant="outline" onClick={() => setLocation("/login")}>
        Login
      </Button>
    );
  }

  // Get initials for avatar fallback
  const getInitials = () => {
    if (!user) return "?";
    
    const userData = user as any;
    
    if (userData.name) {
      const nameParts = userData.name.split(' ');
      if (nameParts.length > 1) {
        return `${nameParts[0][0]}${nameParts[1][0]}`.toUpperCase();
      } else {
        return nameParts[0][0].toUpperCase();
      }
    } else if (userData.username) {
      return userData.username[0].toUpperCase();
    } else {
      return "U";
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-8 w-8 rounded-full">
          <Avatar className="h-8 w-8">
            <AvatarImage src={(user as any).avatar || ""} alt={(user as any).username || "User"} />
            <AvatarFallback>{getInitials()}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{(user as any).name || (user as any).username}</p>
            <p className="text-xs leading-none text-muted-foreground">
              {(user as any).email}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => setLocation("/dashboard")}>
            Dashboard
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setLocation("/profile")}>
            Profile
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setLocation("/settings")}>
            Settings
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout}>
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}