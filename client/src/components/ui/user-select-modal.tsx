import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Search, User, Users, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface UserResult {
  id: number;
  email: string;
  name: string;
  firstName?: string;
  lastName?: string;
  role: string;
  schoolId?: number;
  phone?: string;
  avatar?: string;
}

interface UserSelectModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (users: UserResult[]) => void;
  title?: string;
  initialSelected?: UserResult[];
  excludeIds?: number[];
  multiSelect?: boolean;
}

const PAGE_SIZE = 15;

export function UserSelectModal({
  open,
  onOpenChange,
  onConfirm,
  title = "Select Users",
  initialSelected = [],
  excludeIds = [],
  multiSelect = true,
}: UserSelectModalProps) {
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("");
  const [selected, setSelected] = useState<Map<number, UserResult>>(new Map());
  const [page, setPage] = useState(0);

  useEffect(() => {
    if (open) {
      const map = new Map<number, UserResult>();
      initialSelected.forEach((u) => map.set(u.id, u));
      setSelected(map);
      setQuery("");
      setRoleFilter("");
      setPage(0);
    }
  }, [open, initialSelected]);

  const { data: rolesData } = useQuery<{ success: boolean; roles: { value: string; label: string }[] }>({
    queryKey: ["/api/user-search/roles"],
    enabled: open,
  });

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["/api/user-search/search", { query, role: roleFilter, limit: PAGE_SIZE, offset: page * PAGE_SIZE }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (query) params.set("query", query);
      if (roleFilter) params.set("role", roleFilter);
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(page * PAGE_SIZE));

      const token = localStorage.getItem('supabase_token');
      const activeRole = localStorage.getItem('activeRole');
      const res = await fetch(`/api/user-search/search?${params}`, {
        credentials: "include",
        headers: {
          ...(token && { Authorization: `Bearer ${token}` }),
          ...(activeRole && { 'X-Active-Role': activeRole }),
        },
      });
      if (!res.ok) throw new Error("Failed to search users");
      return res.json();
    },
    enabled: open,
  });

  const users: UserResult[] = (data?.users || []).filter(
    (u: UserResult) => !excludeIds.includes(u.id)
  );
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const toggleUser = (user: UserResult) => {
    setSelected((prev) => {
      const newMap = new Map(prev);
      if (newMap.has(user.id)) {
        newMap.delete(user.id);
      } else {
        if (!multiSelect) {
          newMap.clear();
        }
        newMap.set(user.id, user);
      }
      return newMap;
    });
  };

  const selectAll = () => {
    setSelected((prev) => {
      const newMap = new Map(prev);
      users.forEach((u) => newMap.set(u.id, u));
      return newMap;
    });
  };

  const clearAll = () => {
    setSelected(new Map());
  };

  const handleConfirm = () => {
    onConfirm(Array.from(selected.values()));
    onOpenChange(false);
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case "parent":
        return "bg-blue-100 text-blue-800";
      case "educator":
        return "bg-green-100 text-green-800";
      case "schoolAdmin":
        return "bg-purple-100 text-purple-800";
      case "admin":
      case "superAdmin":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const roles = rolesData?.roles || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="flex gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
              placeholder="Search by name or email..."
              className="pl-9"
              data-testid="user-modal-search"
            />
          </div>
          <Select
            value={roleFilter}
            onValueChange={(value) => {
              setRoleFilter(value === "all" ? "" : value);
              setPage(0);
            }}
          >
            <SelectTrigger className="w-40" data-testid="user-modal-role-filter">
              <SelectValue placeholder="All roles" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              {roles.map((role: { value: string; label: string }) => (
                <SelectItem key={role.value} value={role.value}>
                  {role.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {multiSelect && (
          <div className="flex items-center justify-between mb-2 text-sm">
            <span className="text-muted-foreground">
              {selected.size} selected
            </span>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={selectAll}
                disabled={users.length === 0}
                data-testid="user-modal-select-all"
              >
                Select Page
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAll}
                disabled={selected.size === 0}
                data-testid="user-modal-clear"
              >
                Clear
              </Button>
            </div>
          </div>
        )}

        <ScrollArea className="flex-1 min-h-0 border rounded-md">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : users.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Users className="h-12 w-12 mb-2 opacity-50" />
              <p>No users found</p>
            </div>
          ) : (
            <div className="divide-y">
              {users.map((user) => (
                <div
                  key={user.id}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-accent/50",
                    selected.has(user.id) && "bg-accent"
                  )}
                  onClick={() => toggleUser(user)}
                  data-testid={`user-modal-row-${user.id}`}
                >
                  {multiSelect && (
                    <Checkbox
                      checked={selected.has(user.id)}
                      onCheckedChange={() => toggleUser(user)}
                      data-testid={`user-modal-checkbox-${user.id}`}
                    />
                  )}
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted shrink-0">
                    <User className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{user.name}</div>
                    <div className="text-sm text-muted-foreground truncate">
                      {user.email}
                    </div>
                  </div>
                  <Badge className={cn("shrink-0", getRoleBadgeColor(user.role))}>
                    {user.role}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-2 text-sm">
            <span className="text-muted-foreground">
              Showing {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
            </span>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0 || isFetching}
                data-testid="user-modal-prev-page"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1 || isFetching}
                data-testid="user-modal-next-page"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="user-modal-cancel">
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={selected.size === 0}
            data-testid="user-modal-confirm"
          >
            {multiSelect ? `Select ${selected.size} User${selected.size !== 1 ? "s" : ""}` : "Select"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type { UserResult };
