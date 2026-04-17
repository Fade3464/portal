import { useEffect, useMemo, useState } from "react";
import { CalendarIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type DateTimePickerProps = {
  id: string;
  label: string;
  value: string;
  onChange: (nextValue: string) => void;
  placeholder?: string;
  timezoneLabel?: string;
};

function formatButtonLabel(value: string, placeholder: string) {
  if (!value) {
    return placeholder;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function toDatetimeLocalValue(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function buildDate(value: string) {
  return value ? new Date(value) : undefined;
}

function getHour12(date: Date) {
  const hours = date.getHours();
  const normalized = hours % 12 || 12;
  return `${normalized}`.padStart(2, "0");
}

function getMinute(date: Date) {
  return `${date.getMinutes()}`.padStart(2, "0");
}

function getMeridiem(date: Date) {
  return date.getHours() >= 12 ? "PM" : "AM";
}

export function DateTimePicker({
  id,
  label,
  value,
  onChange,
  placeholder = "Select date and time",
  timezoneLabel = "All times are in your local timezone",
}: DateTimePickerProps) {
  const [open, setOpen] = useState(false);

  const selectedDate = useMemo(() => buildDate(value), [value]);
  const selectedHour = selectedDate ? getHour12(selectedDate) : "12";
  const selectedMinute = selectedDate ? getMinute(selectedDate) : "00";
  const selectedMeridiem = selectedDate ? getMeridiem(selectedDate) : "AM";

  useEffect(() => {
    if (value && Number.isNaN(new Date(value).getTime())) {
      onChange("");
    }
  }, [onChange, value]);

  const setDatePart = (nextDate: Date | undefined) => {
    if (!nextDate) {
      onChange("");
      return;
    }

    const baseDate = selectedDate ? new Date(selectedDate) : new Date();
    baseDate.setFullYear(nextDate.getFullYear(), nextDate.getMonth(), nextDate.getDate());
    onChange(toDatetimeLocalValue(baseDate));
  };

  const setTimePart = (next: {
    hour?: string;
    minute?: string;
    meridiem?: string;
  }) => {
    const baseDate = selectedDate ? new Date(selectedDate) : new Date();
    const hour12 = Number(next.hour ?? getHour12(baseDate));
    const minute = Number(next.minute ?? getMinute(baseDate));
    const meridiem = next.meridiem ?? getMeridiem(baseDate);

    let hour24 = hour12 % 12;
    if (meridiem === "PM") {
      hour24 += 12;
    }

    baseDate.setHours(hour24, minute, 0, 0);
    onChange(toDatetimeLocalValue(baseDate));
  };

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            className={cn(
              "h-12 w-full justify-between rounded-xl border-border bg-background px-4 text-left font-normal",
              !value && "text-muted-foreground"
            )}
          >
            <span>{formatButtonLabel(value, placeholder)}</span>
            <CalendarIcon className="h-4 w-4 opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <div className="border-b px-4 py-3 text-xs uppercase tracking-[0.2em] text-muted-foreground">
            {timezoneLabel}
          </div>
          <div className="md:flex">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={setDatePart}
              captionLayout="dropdown"
              className="p-4"
            />
            <div className="grid grid-cols-3 gap-3 border-t p-4 md:min-w-[220px] md:border-t-0 md:border-l">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Hour</Label>
                <Select
                  value={selectedHour}
                  onValueChange={(nextHour) => setTimePart({ hour: nextHour })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 12 }, (_, index) => {
                      const hour = `${index + 1}`.padStart(2, "0");
                      return (
                        <SelectItem key={hour} value={hour}>
                          {hour}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Minute</Label>
                <Select
                  value={selectedMinute}
                  onValueChange={(nextMinute) => setTimePart({ minute: nextMinute })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 12 }, (_, index) => {
                      const minute = `${index * 5}`.padStart(2, "0");
                      return (
                        <SelectItem key={minute} value={minute}>
                          {minute}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Period</Label>
                <Select
                  value={selectedMeridiem}
                  onValueChange={(nextMeridiem) =>
                    setTimePart({ meridiem: nextMeridiem })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AM">AM</SelectItem>
                    <SelectItem value="PM">PM</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <div className="flex justify-between border-t p-4">
            <Button type="button" variant="ghost" onClick={() => onChange("")}>
              Clear
            </Button>
            <Button type="button" onClick={() => setOpen(false)}>
              Done
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
