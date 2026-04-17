"use client"

import * as React from "react"
import { parseDate } from "chrono-node"
import { CalendarIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

// Helper to find next Monday
function getNextMonday(): Date {
  const date = new Date()
  const day = date.getDay()
  const diff = (8 - day) % 7 || 7
  date.setDate(date.getDate() + diff)
  return date
}

function formatDate(date: Date | undefined) {
  if (!date) {
    return ""
  }

  return date.toLocaleDateString("en-US", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  })
}

export function Calendar29() {
  const defaultDate = getNextMonday()
  const [open, setOpen] = React.useState(false)
  const [value, setValue] = React.useState(formatDate(defaultDate))
  const [date, setDate] = React.useState<Date | undefined>(defaultDate)
  const [month, setMonth] = React.useState<Date | undefined>(defaultDate)

  return (
    <div className="flex flex-col gap-3">
      <Label htmlFor="date" className="px-1">
        Joining Date
      </Label>
      <div className="relative w-full max-w-md">
        <Input
          id="date"
          value={value}
          placeholder="Tomorrow or next week"
          className="bg-background pr-10"
          onChange={(e) => {
            setValue(e.target.value)
            const parsed = parseDate(e.target.value)
            if (parsed) {
              setDate(parsed)
              setMonth(parsed)
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault()
              setOpen(true)
            }
          }}
        />
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
            type="button"
            variant="ghost"
            className="absolute top-1/2 right-2 -translate-y-1/2 p-0 h-auto w-auto bg-transparent hover:bg-transparent focus-visible:ring-0 border-none shadow-none transition-none"
            >
            <CalendarIcon className="size-4" />
            <span className="sr-only">Select date</span>
            </Button>

          </PopoverTrigger>
          <PopoverContent
            className="w-auto overflow-hidden p-0 z-50"
            align="end"
            side="bottom"
            sideOffset={4}
          >
            <Calendar
              mode="single"
              selected={date}
              captionLayout="dropdown"
              month={month}
              onMonthChange={setMonth}
              onSelect={(date) => {
                setDate(date)
                setValue(formatDate(date))
                setOpen(false)
              }}
            />
          </PopoverContent>
        </Popover>
      </div>
      <div className="text-muted-foreground px-1 text-sm">
        Joining date assigned is{" "}
        <span className="font-medium">{formatDate(date)}</span>.
      </div>
    </div>
  )
}
