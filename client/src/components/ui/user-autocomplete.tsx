import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, User, X } from "lucide-react";
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

interface UserAutocompleteProps {
  onSelect: (user: UserResult) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  roleFilter?: string;
  excludeIds?: number[];
}

export function UserAutocomplete({
  onSelect,
  placeholder = "Search by name or email...",
  className,
  disabled = false,
  roleFilter,
  excludeIds = [],
}: UserAutocompleteProps) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const debouncedQuery = useDebounce(query, 300);

  const { data, isLoading } = useQuery({
    queryKey: ["/api/user-search/search", { query: debouncedQuery, role: roleFilter }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debouncedQuery) params.set("query", debouncedQuery);
      if (roleFilter) params.set("role", roleFilter);
      params.set("limit", "10");

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
    enabled: debouncedQuery.length >= 1,
  });

  const users: UserResult[] = (data?.users || []).filter(
    (u: UserResult) => !excludeIds.includes(u.id)
  );

  useEffect(() => {
    setSelectedIndex(0);
  }, [users]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || users.length === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, users.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (users[selectedIndex]) {
          handleSelect(users[selectedIndex]);
        }
        break;
      case "Escape":
        setIsOpen(false);
        break;
    }
  };

  const handleSelect = (user: UserResult) => {
    onSelect(user);
    setQuery("");
    setIsOpen(false);
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

  return (
    <div className={cn("relative", className)}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => query.length >= 1 && setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="pl-9 pr-9"
          disabled={disabled}
          data-testid="user-autocomplete-input"
        />
        {isLoading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        )}
        {query && !isLoading && (
          <button
            onClick={() => {
              setQuery("");
              setIsOpen(false);
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            data-testid="user-autocomplete-clear"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {isOpen && query.length >= 1 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg max-h-64 overflow-auto"
          data-testid="user-autocomplete-dropdown"
        >
          {isLoading ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              Searching...
            </div>
          ) : users.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No users found
            </div>
          ) : (
            <ul className="py-1">
              {users.map((user, index) => (
                <li
                  key={user.id}
                  onClick={() => handleSelect(user)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 cursor-pointer",
                    index === selectedIndex
                      ? "bg-accent"
                      : "hover:bg-accent/50"
                  )}
                  data-testid={`user-autocomplete-option-${user.id}`}
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                    <User className="h-4 w-4 text-muted-foreground" />
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
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

export type { UserResult };
