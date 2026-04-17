// components/ui/columns-empdetails-hr.tsx

import type {
  ColumnDef,
  Column,
  Table,
  HeaderContext,
} from "@tanstack/react-table"
import type { EmpDetailsType } from "@/lib/types"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { useMemo, useState } from "react"

// ✅ ShadCN checkbox + modal
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

// ✅ Funnel icons
import { Funnel, FunnelPlus } from "lucide-react"

// ✅ ShadCN Calendar (Date Picker)
import { Calendar } from "@/components/ui/calendar"

interface HRColumnProps {
  onInterviewClick: (entry: EmpDetailsType) => void
}

/** ✅ shared: header filter icon behavior
 * - inactive: Funnel (hidden until hover)
 * - active: FunnelPlus (always visible + black)
 */
function HeaderFunnelIconHR({ active }: { active: boolean }) {
  const Icon = active ? FunnelPlus : Funnel

  return (
    <Icon
      className={cn(
        "h-3 w-3 transition-opacity",
        active
          ? "opacity-100 text-black dark:text-white"
          : "opacity-0 group-hover:opacity-100 text-muted-foreground"
      )}
    />
  )
}

/** ✅ shared: button style that DOES NOT change header height */
const headerFilterBtnClass =
  "group inline-flex items-center justify-center gap-1 bg-transparent p-0 m-0 border-0 shadow-none outline-none focus:outline-none focus:ring-0 font-inherit text-inherit leading-inherit"

/** ✅ Timezone-safe local YYYY-MM-DD */
function formatLocalYMD(date: Date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

/** ✅ Parse YYYY-MM-DD to local Date (no UTC shifting) */
function parseYMDToLocalDate(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

/** ✅ Convert row value to YYYY-MM-DD (supports YYYY-MM-DD + ISO) */
function toYMD(value: any) {
  if (!value) return ""

  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return value.trim()
  }

  if (typeof value === "string") {
    const d = new Date(value)
    if (!isNaN(d.getTime())) return formatLocalYMD(d)
  }

  if (value instanceof Date && !isNaN(value.getTime())) {
    return formatLocalYMD(value)
  }

  return ""
}

/** ✅ Multi-date picker filter (ShadCN Calendar) for date columns */
function MultiDateHeaderFilterHR({
  table,
  column,
  label,
}: {
  table: Table<EmpDetailsType>
  column: Column<EmpDetailsType, any>
  label: string
}) {
  const [open, setOpen] = useState(false)

  const currentValue = (column.getFilterValue() as string[]) ?? []
  const isActive = currentValue.length > 0

  const selectedDates = useMemo(() => {
    return currentValue
      .map((ymd) => parseYMDToLocalDate(ymd))
      .filter((d) => !isNaN(d.getTime()))
  }, [currentValue])

  const toggleDate = (date: Date | undefined) => {
    if (!date) return

    const ymd = formatLocalYMD(date)

    const exists = currentValue.includes(ymd)
    const updated = exists
      ? currentValue.filter((x) => x !== ymd)
      : [...currentValue, ymd]

    column.setFilterValue(updated.length ? updated : undefined)
    table.setPageIndex(0)
  }

  const clearFilter = () => {
    column.setFilterValue(undefined)
    table.setPageIndex(0)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(headerFilterBtnClass)}
      >
        <span>{label}</span>
        <HeaderFunnelIconHR active={isActive} />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[360px] rounded-2xl p-4">
          <DialogHeader className="pb-2">
            <DialogTitle className="text-sm font-semibold">
              Filter {label}
            </DialogTitle>
          </DialogHeader>

          {/* ✅ ShadCN Calendar */}
          <div className="rounded-xl border p-2">
            <Calendar
              mode="single"
              selected={undefined}
              onSelect={(date) => toggleDate(date)}
              modifiers={{
                selectedMulti: selectedDates,
              }}
              modifiersClassNames={{
                selectedMulti:
                  "bg-black text-white hover:bg-black/90 dark:bg-white dark:text-black",
              }}
            />
          </div>

          {/* ✅ Selected dates preview */}
          <div className="mt-3">
            <div className="text-xs text-muted-foreground mb-2">
              Selected dates:
            </div>

            {currentValue.length === 0 ? (
              <div className="text-sm text-muted-foreground">None</div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {currentValue
                  .slice()
                  .sort((a, b) => a.localeCompare(b))
                  .map((ymd) => (
                    <span
                      key={ymd}
                      className="text-xs px-2 py-1 rounded-full bg-muted"
                    >
                      {ymd}
                    </span>
                  ))}
              </div>
            )}
          </div>

          {/* ✅ Clear filter */}
          <div className="mt-4 flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={clearFilter}
              disabled={!isActive}
              className="rounded-xl"
            >
              Clear Filter
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** ✅ Small modal filter for Status column (dynamic statuses from DataTable meta) */
function StatusHeaderFilterHR({
  table,
  column,
}: {
  table: Table<EmpDetailsType>
  column: Column<EmpDetailsType, any>
}) {
  const [open, setOpen] = useState(false)

  const currentValue = (column.getFilterValue() as string[]) ?? []
  const isActive = currentValue.length > 0

  // ✅ safe read from meta
  const statusOptionsRaw: string[] = Array.isArray(
    (table.options.meta as any)?.statusOptions
  )
    ? ((table.options.meta as any)?.statusOptions as string[])
    : []

  const statusOptions = useMemo(() => {
    return Array.from(
      new Set(statusOptionsRaw.map((s) => String(s || "").trim()).filter(Boolean))
    )
  }, [statusOptionsRaw])

  const toggleStatus = (status: string) => {
    const exists = currentValue.includes(status)

    const updated = exists
      ? currentValue.filter((s) => s !== status)
      : [...currentValue, status]

    column.setFilterValue(updated.length ? updated : undefined)
    table.setPageIndex(0)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(headerFilterBtnClass)}
      >
        <span>Status</span>
        <HeaderFunnelIconHR active={isActive} />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[320px] rounded-2xl p-4">
          <DialogHeader className="pb-2">
            <DialogTitle className="text-sm font-semibold">
              Filter Status
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-2">
            {statusOptions.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-4">
                No statuses found
              </div>
            ) : (
              statusOptions.map((status) => {
                const checked = currentValue.includes(status)

                return (
                  <div
                    key={status}
                    className="flex items-center gap-3 rounded-lg border px-3 py-2 hover:bg-muted/40 transition"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggleStatus(status)}
                    />
                    <span className="text-sm capitalize">{status}</span>
                  </div>
                )
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** ✅ Small modal filter for Post column (dynamic posts from DataTable meta) */
function PostHeaderFilterHR({
  table,
  column,
}: {
  table: Table<EmpDetailsType>
  column: Column<EmpDetailsType, any>
}) {
  const [open, setOpen] = useState(false)

  const currentValue = (column.getFilterValue() as string[]) ?? []
  const isActive = currentValue.length > 0

  const postOptionsRaw: string[] = Array.isArray(
    (table.options.meta as any)?.postOptions
  )
    ? ((table.options.meta as any)?.postOptions as string[])
    : []

  const postOptions = useMemo(() => {
    return Array.from(
      new Set(postOptionsRaw.map((p) => String(p || "").trim()).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b))
  }, [postOptionsRaw])

  const togglePost = (post: string) => {
    const exists = currentValue.includes(post)

    const updated = exists
      ? currentValue.filter((p) => p !== post)
      : [...currentValue, post]

    column.setFilterValue(updated.length ? updated : undefined)
    table.setPageIndex(0)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(headerFilterBtnClass)}
      >
        <span>Post</span>
        <HeaderFunnelIconHR active={isActive} />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[320px] rounded-2xl p-4">
          <DialogHeader className="pb-2">
            <DialogTitle className="text-sm font-semibold">
              Filter Post
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-2">
            {postOptions.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-4">
                No posts found
              </div>
            ) : (
              postOptions.map((post) => {
                const checked = currentValue.includes(post)

                return (
                  <div
                    key={post}
                    className="flex items-center gap-3 rounded-lg border px-3 py-2 hover:bg-muted/40 transition"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => togglePost(post)}
                    />
                    <span className="text-sm">{post}</span>
                  </div>
                )
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** ✅ Small modal filter for Project column (dynamic projects from DataTable meta) */
function ProjectHeaderFilterHR({
  table,
  column,
}: {
  table: Table<EmpDetailsType>
  column: Column<EmpDetailsType, any>
}) {
  const [open, setOpen] = useState(false)

  const currentValue = (column.getFilterValue() as string[]) ?? []
  const isActive = currentValue.length > 0

  const projectOptionsRaw: string[] = Array.isArray(
    (table.options.meta as any)?.projectOptions
  )
    ? ((table.options.meta as any)?.projectOptions as string[])
    : []

  const projectOptions = useMemo(() => {
    return Array.from(
      new Set(
        projectOptionsRaw.map((p) => String(p || "").trim()).filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b))
  }, [projectOptionsRaw])

  const toggleProject = (project: string) => {
    const exists = currentValue.includes(project)

    const updated = exists
      ? currentValue.filter((p) => p !== project)
      : [...currentValue, project]

    column.setFilterValue(updated.length ? updated : undefined)
    table.setPageIndex(0)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(headerFilterBtnClass)}
      >
        <span>Project</span>
        <HeaderFunnelIconHR active={isActive} />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[320px] rounded-2xl p-4">
          <DialogHeader className="pb-2">
            <DialogTitle className="text-sm font-semibold">
              Filter Project
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-2">
            {projectOptions.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-4">
                No projects found
              </div>
            ) : (
              projectOptions.map((project) => {
                const checked = currentValue.includes(project)

                return (
                  <div
                    key={project}
                    className="flex items-center gap-3 rounded-lg border px-3 py-2 hover:bg-muted/40 transition"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggleProject(project)}
                    />
                    <span className="text-sm">{project}</span>
                  </div>
                )
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function EmpDetailsColumnDefsHR({
  onInterviewClick,
}: HRColumnProps): ColumnDef<EmpDetailsType>[] {
  return [
    {
      accessorKey: "name",
      header: () => <div className="text-center">Name</div>,
      cell: ({ row }) => {
        const fullName = row.getValue("name") as string
        const displayName =
          fullName?.length > 15 ? fullName.slice(0, 15) + "..." : fullName

        return (
          <div className="relative group text-center w-full overflow-visible">
            <span className="truncate block max-w-[160px] mx-auto">
              {displayName}
            </span>

            <span
              className={cn(
                "absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-xs font-medium rounded-md shadow-md z-50",
                "bg-popover text-popover-foreground",
                "opacity-0 translate-y-1 pointer-events-none",
                "group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-200",
                "whitespace-nowrap"
              )}
            >
              {fullName}
            </span>
          </div>
        )
      },
    },

    {
      accessorKey: "cnic",
      header: () => <div className="text-center">CNIC</div>,
      cell: ({ row }) => (
        <div className="text-center">{row.getValue("cnic")}</div>
      ),
    },
    {
      accessorKey: "contact_number",
      header: () => <div className="text-center">Contact Number</div>,
      cell: ({ row }) => (
        <div className="text-center">{row.getValue("contact_number")}</div>
      ),
    },

    {
      accessorKey: "post_applied_for",
      header: (ctx: HeaderContext<EmpDetailsType, any>) => (
        <div className="text-center">
          <PostHeaderFilterHR table={ctx.table} column={ctx.column} />
        </div>
      ),
      filterFn: (row, id, value) => {
        const selected = (value as string[] | undefined) ?? []
        if (!selected.length) return true

        const rowValue = String(row.getValue(id) ?? "").toLowerCase()
        return selected.map((s) => s.toLowerCase()).includes(rowValue)
      },
      cell: ({ row }) => (
        <div className="text-center">{row.getValue("post_applied_for")}</div>
      ),
    },

    // ✅ Interview Date filter (created_at)
    {
      accessorKey: "created_at",
      header: (ctx: HeaderContext<EmpDetailsType, any>) => (
        <div className="text-center">
          <MultiDateHeaderFilterHR
            table={ctx.table}
            column={ctx.column}
            label="Interview Date"
          />
        </div>
      ),
      filterFn: (row, id, value) => {
        const selected = (value as string[] | undefined) ?? []
        if (!selected.length) return true

        const rowYMD = toYMD(row.getValue(id))
        return selected.includes(rowYMD)
      },
      cell: ({ row }) => (
        <div className="text-center">{row.getValue("created_at")}</div>
      ),
    },

    // ✅ Joining Date filter
    {
      accessorKey: "joining_date",
      header: (ctx: HeaderContext<EmpDetailsType, any>) => (
        <div className="text-center">
          <MultiDateHeaderFilterHR
            table={ctx.table}
            column={ctx.column}
            label="Joining Date"
          />
        </div>
      ),
      filterFn: (row, id, value) => {
        const selected = (value as string[] | undefined) ?? []
        if (!selected.length) return true

        const rowYMD = toYMD(row.getValue(id))
        return selected.includes(rowYMD)
      },
      cell: ({ row }) => (
        <div className="text-center">{row.getValue("joining_date")}</div>
      ),
    },

    {
      accessorKey: "salary",
      header: () => <div className="text-center">Salary</div>,
      cell: ({ row }) => (
        <div className="text-center">{row.getValue("salary")}</div>
      ),
    },

    {
      accessorKey: "punctuality",
      header: () => <div className="text-center">Punctuality</div>,
      cell: ({ row }) => (
        <div className="text-center">{row.getValue("punctuality")}</div>
      ),
    },

    {
      accessorKey: "project_applied_for",
      header: (ctx: HeaderContext<EmpDetailsType, any>) => (
        <div className="text-center">
          <ProjectHeaderFilterHR table={ctx.table} column={ctx.column} />
        </div>
      ),
      filterFn: (row, id, value) => {
        const selected = (value as string[] | undefined) ?? []
        if (!selected.length) return true

        const rowValue = String(row.getValue(id) ?? "").toLowerCase()
        return selected.map((s) => s.toLowerCase()).includes(rowValue)
      },
      cell: ({ row }) => (
        <div className="text-center">{row.getValue("project_applied_for")}</div>
      ),
    },

    {
      accessorKey: "references",
      header: () => <div className="text-center">References</div>,
      cell: ({ row }) => (
        <div className="text-center">{row.getValue("references")}</div>
      ),
    },

    {
      accessorKey: "status",
      header: (ctx: HeaderContext<EmpDetailsType, any>) => (
        <div className="text-center">
          <StatusHeaderFilterHR table={ctx.table} column={ctx.column} />
        </div>
      ),

      filterFn: (row, id, value) => {
        const selected = (value as string[] | undefined) ?? []
        if (!selected.length) return true

        const rowValue = String(row.getValue(id) ?? "").toLowerCase()
        return selected.map((s) => s.toLowerCase()).includes(rowValue)
      },

      cell: ({ row }) => {
        const entry = row.original
        let status = entry.status

        if (status === "proceeded" && entry.proceeded_for_final_interview) {
          status = "final_interview_scheduled"
        }

        const badgeStyles: Record<string, string> = {
          appointed:
            "bg-green-100 text-green-800 dark:bg-green-300 dark:text-green-950",
          in_training:
            "bg-sky-100 text-sky-800 dark:bg-sky-300 dark:text-sky-950",
          hold:
            "bg-yellow-100 text-yellow-800 dark:bg-yellow-300 dark:text-yellow-950",
          staged:
            "bg-orange-100 text-orange-800 dark:bg-orange-300 dark:text-orange-950",
          rejected:
            "bg-red-100 text-red-800 dark:bg-red-300 dark:text-red-950",
          proceeded:
            "bg-purple-100 text-purple-800 dark:bg-purple-300 dark:text-purple-950",
          final_interview_scheduled:
            "bg-cyan-100 text-cyan-800 dark:bg-cyan-300 dark:text-cyan-950",
        }

        const cls =
          badgeStyles[String(status).toLowerCase()] ??
          "bg-muted text-muted-foreground"

        return (
          <div className="text-center">
            <span
              className={cn("text-xs rounded-full px-3 py-1 font-medium", cls)}
            >
              {status}
            </span>
          </div>
        )
      },
    },

    {
      id: "actions",
      header: () => <div className="text-center">Actions</div>,
      cell: ({ row }) => {
        const entry = row.original
        const isProceeded =
          entry.status === "proceeded" && !entry.proceeded_for_final_interview

        return (
          <div className="text-center !overflow-visible !relative">
            <Button
              size="sm"
              className={cn(
                "rounded transition shadow-sm",
                isProceeded
                  ? "bg-black text-white hover:opacity-80"
                  : "bg-muted text-muted-foreground cursor-not-allowed opacity-50"
              )}
            onClick={() => isProceeded && onInterviewClick(entry)}
              disabled={!isProceeded}
            >
              Interview
            </Button>
          </div>
        )
      },
    },
  ]
}
