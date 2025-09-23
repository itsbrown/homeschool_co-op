import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { TimePicker } from "@/components/ui/time-picker";
import { Trash2, Plus } from "lucide-react";
import { ClassVariant } from "@shared/schema";

interface ClassVariantsProps {
  variants: ClassVariant[];
  onChange: (variants: ClassVariant[]) => void;
}

const DAYS_OF_WEEK = [
  "Monday",
  "Tuesday", 
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday"
];

export function ClassVariants({ variants, onChange }: ClassVariantsProps) {
  const addVariant = () => {
    const newVariant: ClassVariant = {
      id: `variant-${Date.now()}`,
      name: variants.length === 0 ? "Main Session" : `Session ${variants.length + 1}`,
      startTime: "9:00 AM",
      endTime: "12:00 PM",
      days: ["Monday", "Wednesday"],
    };
    onChange([...variants, newVariant]);
  };

  const removeVariant = (variantId: string) => {
    if (variants.length > 1) {
      onChange(variants.filter(v => v.id !== variantId));
    }
  };

  const updateVariant = (variantId: string, updates: Partial<ClassVariant>) => {
    onChange(variants.map(v => 
      v.id === variantId ? { ...v, ...updates } : v
    ));
  };

  const toggleDay = (variantId: string, day: string) => {
    const variant = variants.find(v => v.id === variantId);
    if (!variant) return;

    const updatedDays = variant.days.includes(day)
      ? variant.days.filter(d => d !== day)
      : [...variant.days, day];
    
    updateVariant(variantId, { days: updatedDays });
  };

  // Add first variant if none exist
  if (variants.length === 0) {
    addVariant();
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Class Time Options</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addVariant}
          className="flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          Add Option
        </Button>
      </div>
      
      <div className="space-y-4">
        {variants.map((variant, index) => (
          <Card key={variant.id} className="relative">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center justify-between">
                <span>Option {index + 1}</span>
                {variants.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeVariant(variant.id)}
                    className="text-red-500 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor={`variant-name-${variant.id}`} className="text-sm">
                  Option Name
                </Label>
                <Input
                  id={`variant-name-${variant.id}`}
                  value={variant.name}
                  onChange={(e) => updateVariant(variant.id, { name: e.target.value })}
                  placeholder="e.g., Morning Session, Afternoon Session"
                  className="mt-1"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm">Start Time</Label>
                  <TimePicker
                    value={variant.startTime}
                    onChange={(time) => updateVariant(variant.id, { startTime: time })}
                    placeholder="Select start time"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-sm">End Time</Label>
                  <TimePicker
                    value={variant.endTime}
                    onChange={(time) => updateVariant(variant.id, { endTime: time })}
                    placeholder="Select end time"
                    className="mt-1"
                  />
                </div>
              </div>

              <div>
                <Label className="text-sm">Days of the Week</Label>
                <div className="grid grid-cols-3 gap-2 mt-2">
                  {DAYS_OF_WEEK.map((day) => (
                    <div key={day} className="flex items-center space-x-2">
                      <Checkbox
                        id={`${variant.id}-${day}`}
                        checked={variant.days.includes(day)}
                        onCheckedChange={() => toggleDay(variant.id, day)}
                      />
                      <Label
                        htmlFor={`${variant.id}-${day}`}
                        className="text-sm cursor-pointer"
                      >
                        {day.slice(0, 3)}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {variants.length > 1 && (
        <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
          <strong>Preview:</strong> {variants.map((v, i) => `${v.name} (${v.startTime}-${v.endTime})`).join(" OR ")}
        </div>
      )}
    </div>
  );
}