import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface CsvColumn {
  name: string;
  sample: string;
}

interface MappingField {
  key: string;
  label: string;
  required: boolean;
  description: string;
}

interface CsvMappingDialogProps {
  isOpen: boolean;
  columns: CsvColumn[];
  sampleData: any[];
  onClose: () => void;
  onConfirm: (mapping: Record<string, string>) => void;
}

export function CsvMappingDialog({ isOpen, columns, sampleData, onClose, onConfirm }: CsvMappingDialogProps) {
  // Define database fields
  const classFields: MappingField[] = [
    { key: "title", label: "Class Title", required: true, description: "The name of the class" },
    { key: "category", label: "Category", required: false, description: "The category of the class (e.g., 'academic', 'arts', etc.)" },
    { key: "description", label: "Description", required: true, description: "Detailed description of the class" },
    { key: "price", label: "Price", required: true, description: "The price of the class" },
    { key: "startDate", label: "Start Date", required: false, description: "When the class starts" },
    { key: "endDate", label: "End Date", required: false, description: "When the class ends" },
    { key: "gradeLevels", label: "Grade Levels", required: false, description: "Grade levels for this class" },
    { key: "sessionDays", label: "Session Days", required: false, description: "Days when sessions occur" },
    { key: "instructorName", label: "Instructor", required: false, description: "Name of the instructor" },
  ];

  // Initialize mapping with smart default suggestions
  const [mapping, setMapping] = useState<Record<string, string>>(() => {
    const initialMapping: Record<string, string> = {};
    
    classFields.forEach(field => {
      // Try to find matching column by name similarity
      const match = columns.find(col => 
        col.name.toLowerCase().includes(field.key.toLowerCase()) ||
        field.label.toLowerCase().includes(col.name.toLowerCase())
      );
      
      initialMapping[field.key] = match ? match.name : "__none__";
    });
    
    return initialMapping;
  });

  const handleChange = (field: string, value: string) => {
    setMapping(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSubmit = () => {
    // Check required fields
    const missingRequired = classFields
      .filter(field => field.required && (mapping[field.key] === "__none__" || !mapping[field.key]))
      .map(field => field.label);

    if (missingRequired.length > 0) {
      alert(`Please map these required fields: ${missingRequired.join(", ")}`);
      return;
    }

    onConfirm(mapping);
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Map CSV Columns to Class Fields</DialogTitle>
          <DialogDescription>
            Select which CSV column corresponds to each class field. Required fields are marked with an asterisk (*).
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="grid gap-4">
            {classFields.map((field) => (
              <div key={field.key} className="grid grid-cols-5 items-center gap-4">
                <div className="col-span-2">
                  <Label className="text-right">
                    {field.label} {field.required && <span className="text-red-500">*</span>}
                    <p className="text-xs text-muted-foreground">{field.description}</p>
                  </Label>
                </div>
                <div className="col-span-3">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        className="w-full justify-between"
                      >
                        {mapping[field.key] === "__none__" 
                          ? "-- Do not map --" 
                          : mapping[field.key] || "Select column"}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-full p-0">
                      <Command>
                        <CommandInput placeholder="Search columns..." />
                        <CommandEmpty>No column found.</CommandEmpty>
                        <CommandGroup>
                          <ScrollArea className="h-[200px]">
                            <CommandItem
                              value="__none__"
                              onSelect={() => handleChange(field.key, "__none__")}
                              className={cn(
                                "flex items-center gap-2",
                                mapping[field.key] === "__none__" ? "bg-accent" : ""
                              )}
                            >
                              <Check
                                className={cn(
                                  "h-4 w-4",
                                  mapping[field.key] === "__none__" ? "opacity-100" : "opacity-0"
                                )}
                              />
                              -- Do not map --
                            </CommandItem>
                            {columns.map((column) => (
                              <CommandItem
                                key={column.name}
                                value={column.name}
                                onSelect={() => handleChange(field.key, column.name)}
                                className={cn(
                                  "flex items-center gap-2",
                                  mapping[field.key] === column.name ? "bg-accent" : ""
                                )}
                              >
                                <Check
                                  className={cn(
                                    "h-4 w-4",
                                    mapping[field.key] === column.name ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                <div>
                                  <div>{column.name}</div>
                                  {column.sample && (
                                    <div className="text-xs text-muted-foreground">
                                      Sample: {column.sample.substring(0, 20)}
                                      {column.sample.length > 20 ? "..." : ""}
                                    </div>
                                  )}
                                </div>
                              </CommandItem>
                            ))}
                          </ScrollArea>
                        </CommandGroup>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            ))}
          </div>
          
          {sampleData.length > 0 && (
            <Card className="mt-6">
              <CardContent className="p-4">
                <h3 className="font-medium mb-2">Preview (first 3 rows)</h3>
                <div className="border rounded-md overflow-auto max-h-[200px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {columns.map((col) => (
                          <TableHead key={col.name} className="px-2 py-1 text-xs font-medium">
                            {col.name}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sampleData.slice(0, 3).map((row, idx) => (
                        <TableRow key={idx}>
                          {columns.map((col) => (
                            <TableCell 
                              key={col.name} 
                              className="px-2 py-1 text-xs truncate max-w-[150px]"
                            >
                              {row[col.name]}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit}>
            Confirm Mapping
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}