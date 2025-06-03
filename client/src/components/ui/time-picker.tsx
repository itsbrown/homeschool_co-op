import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface TimePickerProps {
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function TimePicker({ value, onChange, placeholder = "Select time", className }: TimePickerProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Generate hours (1-12)
  const hours = Array.from({ length: 12 }, (_, i) => (i + 1).toString().padStart(2, '0'));
  
  // Generate minutes (00, 15, 30, 45)
  const minutes = ['00', '15', '30', '45'];
  
  const periods = ['AM', 'PM'];

  // Parse current value
  const parseTime = (timeStr: string) => {
    if (!timeStr) return { hour: '', minute: '', period: '' };
    
    const [time, period] = timeStr.split(' ');
    if (!time || !period) return { hour: '', minute: '', period: '' };
    
    const [hour, minute] = time.split(':');
    return { hour, minute, period };
  };

  const { hour, minute, period } = parseTime(value || '');

  const handleTimeChange = (newHour: string, newMinute: string, newPeriod: string) => {
    if (newHour && newMinute && newPeriod) {
      const timeString = `${newHour}:${newMinute} ${newPeriod}`;
      onChange(timeString);
    }
  };

  const formatDisplayTime = () => {
    if (!value) return placeholder;
    return value;
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-full justify-start text-left font-normal",
            !value && "text-muted-foreground",
            className
          )}
        >
          <Clock className="mr-2 h-4 w-4" />
          {formatDisplayTime()}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-4" align="start">
        <div className="space-y-4">
          <div className="text-sm font-medium">Select Time</div>
          
          <div className="grid grid-cols-3 gap-3">
            {/* Hours */}
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground text-center">Hour</div>
              <div className="grid grid-cols-2 gap-1 max-h-32 overflow-y-auto">
                {hours.map((h) => (
                  <Button
                    key={h}
                    variant={hour === h ? "default" : "ghost"}
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => handleTimeChange(h, minute, period)}
                  >
                    {h}
                  </Button>
                ))}
              </div>
            </div>

            {/* Minutes */}
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground text-center">Min</div>
              <div className="space-y-1">
                {minutes.map((m) => (
                  <Button
                    key={m}
                    variant={minute === m ? "default" : "ghost"}
                    size="sm"
                    className="h-8 text-xs w-full"
                    onClick={() => handleTimeChange(hour, m, period)}
                  >
                    {m}
                  </Button>
                ))}
              </div>
            </div>

            {/* AM/PM */}
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground text-center">Period</div>
              <div className="space-y-1">
                {periods.map((p) => (
                  <Button
                    key={p}
                    variant={period === p ? "default" : "ghost"}
                    size="sm"
                    className="h-8 text-xs w-full"
                    onClick={() => handleTimeChange(hour, minute, p)}
                  >
                    {p}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-between pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                onChange('');
                setIsOpen(false);
              }}
            >
              Clear
            </Button>
            <Button
              size="sm"
              onClick={() => setIsOpen(false)}
              disabled={!hour || !minute || !period}
            >
              Done
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}