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

type ParsedDateTime = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

function parseDateTimeValue(value: string): ParsedDateTime | null {
  if (!value) {
    return null;
  }

  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) {
    return null;
  }

  const [, year, month, day, hour, minute] = match;
  return {
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
  };
}

function formatButtonLabel(value: string, placeholder: string) {
  const parsed = parseDateTimeValue(value);
  if (!parsed) {
    return placeholder;
  }

  const dateLabel = `${String(parsed.month).padStart(2, "0")}/${String(parsed.day).padStart(2, "0")}/${parsed.year}`;
  const hour12 = parsed.hour % 12 || 12;
  const meridiem = parsed.hour >= 12 ? "PM" : "AM";
  const timeLabel = `${String(hour12).padStart(2, "0")}:${String(parsed.minute).padStart(2, "0")} ${meridiem}`;

  return `${dateLabel}, ${timeLabel}`;
}

function toDatetimeLocalValue(parts: ParsedDateTime) {
  const year = String(parts.year).padStart(4, "0");
  const month = String(parts.month).padStart(2, "0");
  const day = String(parts.day).padStart(2, "0");
  const hours = String(parts.hour).padStart(2, "0");
  const minutes = String(parts.minute).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function buildDate(value: string) {
  const parsed = parseDateTimeValue(value);
  if (!parsed) {
    return undefined;
  }

  return new Date(parsed.year, parsed.month - 1, parsed.day, 12, 0, 0, 0);
}

function getHour12(parts: ParsedDateTime) {
  const hours = parts.hour;
  const normalized = hours % 12 || 12;
  return `${normalized}`.padStart(2, "0");
}

function getMinute(parts: ParsedDateTime) {
  return `${parts.minute}`.padStart(2, "0");
}

function getMeridiem(parts: ParsedDateTime) {
  return parts.hour >= 12 ? "PM" : "AM";
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

  const selectedParts = useMemo(() => parseDateTimeValue(value), [value]);
  const selectedDate = useMemo(() => buildDate(value), [value]);
  const selectedHour = selectedParts ? getHour12(selectedParts) : "12";
  const selectedMinute = selectedParts ? getMinute(selectedParts) : "00";
  const selectedMeridiem = selectedParts ? getMeridiem(selectedParts) : "AM";

  useEffect(() => {
    if (value && !parseDateTimeValue(value)) {
      onChange("");
    }
  }, [onChange, value]);

  const setDatePart = (nextDate: Date | undefined) => {
    if (!nextDate) {
      onChange("");
      return;
    }

    const nextValue = toDatetimeLocalValue({
      year: nextDate.getFullYear(),
      month: nextDate.getMonth() + 1,
      day: nextDate.getDate(),
      hour: selectedParts?.hour ?? 0,
      minute: selectedParts?.minute ?? 0,
    });
    onChange(nextValue);
  };

  const setTimePart = (next: {
    hour?: string;
    minute?: string;
    meridiem?: string;
  }) => {
    const baseParts = selectedParts ?? {
      year: new Date().getFullYear(),
      month: new Date().getMonth() + 1,
      day: new Date().getDate(),
      hour: 0,
      minute: 0,
    };
    const hour12 = Number(next.hour ?? getHour12(baseParts));
    const minute = Number(next.minute ?? getMinute(baseParts));
    const meridiem = next.meridiem ?? getMeridiem(baseParts);

    let hour24 = hour12 % 12;
    if (meridiem === "PM") {
      hour24 += 12;
    }

    onChange(
      toDatetimeLocalValue({
        ...baseParts,
        hour: hour24,
        minute,
      })
    );
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
