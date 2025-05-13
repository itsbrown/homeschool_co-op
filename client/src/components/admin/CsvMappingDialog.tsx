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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Map CSV Columns to Class Fields</DialogTitle>
          <DialogDescription>
            Select which CSV column corresponds to each class field. Required fields are marked with an asterisk (*).
          </DialogDescription>
        </DialogHeader>
        
        {classFields.map((field) => (
          <div key={field.key} className="flex items-start justify-between py-2 gap-4">
            <div className="text-right w-1/3">
              <Label htmlFor={`field-${field.key}`} className="font-medium">
                {field.label} {field.required && <span className="text-red-500">*</span>}
              </Label>
              <p className="text-xs text-muted-foreground mt-1">{field.description}</p>
            </div>
            <div className="w-2/3">
              <Select
                value={mapping[field.key]}
                onValueChange={(value) => handleChange(field.key, value)}
              >
                <SelectTrigger id={`field-${field.key}`} className="w-full">
                  <SelectValue placeholder="Select column" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">-- Do not map --</SelectItem>
                  {columns.map((column) => (
                    <SelectItem key={column.name} value={column.name}>
                      {column.name} {column.sample && `(sample: ${column.sample.substring(0, 30)}${column.sample.length > 30 ? '...' : ''})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        ))}
        
        {sampleData.length > 0 && (
          <div className="mt-4">
            <h3 className="font-medium mb-2">Preview (first 3 rows)</h3>
            <div className="border rounded-md overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {columns.map((col) => (
                      <TableHead key={col.name}>{col.name}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sampleData.slice(0, 3).map((row, idx) => (
                    <TableRow key={idx}>
                      {columns.map((col) => (
                        <TableCell key={col.name} className="truncate max-w-[150px]">
                          {row[col.name]}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit}>Confirm Mapping</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}