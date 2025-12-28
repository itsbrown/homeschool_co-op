import { useState } from "react";
import { Button } from "@/components/ui/button";
import { UserAutocomplete, type UserResult } from "@/components/ui/user-autocomplete";
import { UserSelectModal } from "@/components/ui/user-select-modal";
import { Badge } from "@/components/ui/badge";
import { Users, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface UserLookupProps {
  value: UserResult[];
  onChange: (users: UserResult[]) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  multiSelect?: boolean;
  roleFilter?: string;
  modalTitle?: string;
}

export function UserLookup({
  value,
  onChange,
  placeholder = "Search for a user...",
  className,
  disabled = false,
  multiSelect = true,
  roleFilter,
  modalTitle = "Select Users",
}: UserLookupProps) {
  const [modalOpen, setModalOpen] = useState(false);

  const handleAutocompleteSelect = (user: UserResult) => {
    if (multiSelect) {
      if (!value.find((u) => u.id === user.id)) {
        onChange([...value, user]);
      }
    } else {
      onChange([user]);
    }
  };

  const handleModalConfirm = (users: UserResult[]) => {
    onChange(users);
  };

  const removeUser = (userId: number) => {
    onChange(value.filter((u) => u.id !== userId));
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case "parent":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300";
      case "educator":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300";
      case "schoolAdmin":
        return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300";
      case "admin":
      case "superAdmin":
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300";
    }
  };

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex gap-2">
        <UserAutocomplete
          onSelect={handleAutocompleteSelect}
          placeholder={placeholder}
          disabled={disabled}
          roleFilter={roleFilter}
          excludeIds={value.map((u) => u.id)}
          className="flex-1"
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => setModalOpen(true)}
          disabled={disabled}
          data-testid="user-lookup-browse-btn"
        >
          <Users className="h-4 w-4 mr-2" />
          Browse
        </Button>
      </div>

      {value.length > 0 && (
        <div className="flex flex-wrap gap-2" data-testid="user-lookup-selected">
          {value.map((user) => (
            <div
              key={user.id}
              className="flex items-center gap-2 rounded-full bg-secondary px-3 py-1.5"
            >
              <span className="text-sm font-medium">{user.name}</span>
              <Badge className={cn("text-xs", getRoleBadgeColor(user.role))}>
                {user.role}
              </Badge>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => removeUser(user.id)}
                  className="ml-1 hover:text-destructive"
                  data-testid={`user-lookup-remove-${user.id}`}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <UserSelectModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        onConfirm={handleModalConfirm}
        title={modalTitle}
        initialSelected={value}
        excludeIds={[]}
        multiSelect={multiSelect}
      />
    </div>
  );
}

export type { UserResult };
