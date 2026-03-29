import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronsUpDown, Loader2, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

interface Student {
  id: number;
  firstName: string;
  lastName: string;
  gradeLevel: string;
  currentLexileRange?: string | null;
  currentReadingGradeLevel?: string | null;
  currentBookList?: string | null;
}

interface StudentSearchSelectProps {
  value?: string;
  onSelect: (studentId: number | null, student?: Student) => void;
  placeholder?: string;
  disabled?: boolean;
}

export default function StudentSearchSelect({ value, onSelect, placeholder = 'Search for a student...', disabled }: StudentSearchSelectProps) {
  const [open, setOpen] = useState(false);

  const { data: students = [], isLoading } = useQuery<Student[]>({
    queryKey: ['/api/lexile/students'],
  });

  const selectedStudent = students.find(s => s.id.toString() === value);

  const handleSelect = (student: Student) => {
    onSelect(student.id, student);
    setOpen(false);
  };

  const handleClear = () => {
    onSelect(null);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between h-10 font-normal"
          disabled={disabled || isLoading}
          style={{ fontSize: '16px' }}
        >
          {isLoading ? (
            <span className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading students...
            </span>
          ) : selectedStudent ? (
            <span className="truncate">
              {selectedStudent.firstName} {selectedStudent.lastName}
              <span className="text-muted-foreground ml-1">(Grade {selectedStudent.gradeLevel})</span>
            </span>
          ) : (
            <span className="text-muted-foreground flex items-center gap-2">
              <Search className="h-4 w-4" />
              {placeholder}
            </span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Type name to search..." />
          <CommandList>
            <CommandEmpty>No student found.</CommandEmpty>
            <CommandGroup>
              {selectedStudent && (
                <CommandItem onSelect={handleClear} className="text-muted-foreground text-xs">
                  -- Clear selection --
                </CommandItem>
              )}
              {students.map(student => (
                <CommandItem
                  key={student.id}
                  value={`${student.firstName} ${student.lastName} ${student.gradeLevel}`}
                  onSelect={() => handleSelect(student)}
                  className="flex items-center gap-2"
                >
                  <Check className={cn('h-4 w-4 shrink-0', value === student.id.toString() ? 'opacity-100' : 'opacity-0')} />
                  <span className="flex-1 min-w-0">
                    <span className="font-medium">{student.firstName} {student.lastName}</span>
                    <span className="text-muted-foreground ml-2 text-xs">Grade {student.gradeLevel}</span>
                    {student.currentLexileRange && (
                      <span className="text-blue-500 ml-2 text-xs">{student.currentLexileRange}</span>
                    )}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
