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

// ✅ helper: format status nicely
function formatStatusLabel(status: string) {
  const clean = String(status || "").trim()
  if (!clean) return ""

  return clean
    .replaceAll("_", " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}

const headerBtnClass =
  "group inline-flex items-center gap-1 font-inherit text-inherit leading-inherit p-0 m-0 bg-transparent border-0 outline-none shadow-none"

// ✅ helper: format any label nicely (Post/Project)
function formatLabel(text: string) {
  const clean = String(text || "").trim()
  if (!clean) return ""
  return clean
    .replaceAll("_", " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}

/** ✅ shared: icon that changes when active + hover behavior
 *  - If inactive: icon is hidden until hover
 *  - If active: icon is always visible (and "plus" variant)
 */
function HeaderFunnelIcon({ active }: { active: boolean }) {
  const Icon = active ? FunnelPlus : Funnel

  return (
    <Icon
      className={cn(
        "h-3.5 w-3.5 transition-opacity",
        active
          ? "opacity-100 text-black dark:text-white"
          : "opacity-0 group-hover:opacity-100 text-muted-foreground"
      )}
    />
  )
}

/* =========================================================
   ✅ DATE FILTER HELPERS (Timezone safe)
========================================================= */

function formatLocalYMD(date: Date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

function parseYMDToLocalDate(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

function toYMD(value: any) {
  if (!value) return ""

  // already YYYY-MM-DD
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return value.trim()
  }

  // ISO string
  if (typeof value === "string") {
    const d = new Date(value)
    if (!isNaN(d.getTime())) return formatLocalYMD(d)
  }

  // Date object
  if (value instanceof Date && !isNaN(value.getTime())) {
    return formatLocalYMD(value)
  }

  return ""
}

/** ✅ Multi-date picker filter (ShadCN Calendar) */
function MultiDateHeaderFilter({
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
        className={cn(headerBtnClass)}
      >
        <span>{label}</span>

        {/* icon on RIGHT */}
        <span className="ml-1">
          <HeaderFunnelIcon active={isActive} />
        </span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[380px] rounded-2xl p-4">
          <DialogHeader className="pb-2">
            <DialogTitle className="text-sm font-semibold">
              Filter {label}
            </DialogTitle>
          </DialogHeader>

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

          {/* Selected list */}
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

          {/* Clear button */}
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
function StatusHeaderFilter({
  table,
  column,
}: {
  table: Table<EmpDetailsType>
  column: Column<EmpDetailsType, any>
}) {
  const [open, setOpen] = useState(false)

  const currentValue = (column.getFilterValue() as string[]) ?? []
  const isActive = currentValue.length > 0

  const statusOptionsRaw: string[] = Array.isArray(
    (table.options.meta as any)?.statusOptions
  )
    ? ((table.options.meta as any)?.statusOptions as string[])
    : []

  const statusOptions = useMemo(() => {
    const unique = Array.from(
      new Set(
        statusOptionsRaw
          .map((s) => String(s || "").trim().toLowerCase())
          .filter(Boolean)
      )
    )

    unique.sort((a, b) => {
      if (a === "staged") return -1
      if (b === "staged") return 1
      return a.localeCompare(b)
    })

    return unique
  }, [statusOptionsRaw])

  const toggleStatus = (status: string) => {
    const normalized = String(status || "").trim().toLowerCase()
    if (!normalized) return

    const exists = currentValue.includes(normalized)

    const updated = exists
      ? currentValue.filter((s) => s !== normalized)
      : [...currentValue, normalized]

    column.setFilterValue(updated.length ? updated : undefined)
    table.setPageIndex(0)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(headerBtnClass)}
      >
        <span>Status</span>

        {/* icon on RIGHT */}
        <span className="ml-1">
          <HeaderFunnelIcon active={isActive} />
        </span>
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
                    <span className="text-sm">{formatStatusLabel(status)}</span>
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
function PostHeaderFilter({
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
    const normalized = String(post || "").trim()
    if (!normalized) return

    const exists = currentValue.includes(normalized)

    const updated = exists
      ? currentValue.filter((p) => p !== normalized)
      : [...currentValue, normalized]

    column.setFilterValue(updated.length ? updated : undefined)
    table.setPageIndex(0)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(headerBtnClass)}
      >
        <span>Post</span>

        {/* icon on RIGHT */}
        <span className="ml-1">
          <HeaderFunnelIcon active={isActive} />
        </span>
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
                    <span className="text-sm">{formatLabel(post)}</span>
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
function ProjectHeaderFilter({
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
    const normalized = String(project || "").trim()
    if (!normalized) return

    const exists = currentValue.includes(normalized)

    const updated = exists
      ? currentValue.filter((p) => p !== normalized)
      : [...currentValue, normalized]

    column.setFilterValue(updated.length ? updated : undefined)
    table.setPageIndex(0)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(headerBtnClass)}
      >
        <span>Project</span>

        {/* icon on RIGHT */}
        <span className="ml-1">
          <HeaderFunnelIcon active={isActive} />
        </span>
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
                    <span className="text-sm">{formatLabel(project)}</span>
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

export function EmpDetailsColumnDefs(
  onInterviewClick: (entry: EmpDetailsType) => void
): ColumnDef<EmpDetailsType>[] {
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
                "bg-popover text-popover-foreground opacity-0 pointer-events-none",
                "group-hover:opacity-100 group-hover:translate-y-0 transition-all translate-y-1",
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

    // ✅ Post Filter
    {
      accessorKey: "post_applied_for",
      header: (ctx: HeaderContext<EmpDetailsType, any>) => (
        <div className="text-center">
          <PostHeaderFilter table={ctx.table} column={ctx.column} />
        </div>
      ),
      filterFn: (row, id, value) => {
        const selected = (value as string[] | undefined) ?? []
        if (!selected.length) return true
        const rowValue = String(row.getValue(id) ?? "").trim().toLowerCase()
        return selected.map((s) => String(s).toLowerCase()).includes(rowValue)
      },
      cell: ({ row }) => (
        <div className="text-center">{row.getValue("post_applied_for")}</div>
      ),
    },

    // ✅ Interview Date Filter (created_at)
    {
      accessorKey: "created_at",
      header: (ctx: HeaderContext<EmpDetailsType, any>) => (
        <div className="text-center">
          <MultiDateHeaderFilter
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

    // ✅ Joining Date Filter
    {
      accessorKey: "joining_date",
      header: (ctx: HeaderContext<EmpDetailsType, any>) => (
        <div className="text-center">
          <MultiDateHeaderFilter
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

    // ✅ Project Filter
    {
      accessorKey: "project_applied_for",
      header: (ctx: HeaderContext<EmpDetailsType, any>) => (
        <div className="text-center">
          <ProjectHeaderFilter table={ctx.table} column={ctx.column} />
        </div>
      ),
      filterFn: (row, id, value) => {
        const selected = (value as string[] | undefined) ?? []
        if (!selected.length) return true
        const rowValue = String(row.getValue(id) ?? "").trim().toLowerCase()
        return selected.map((s) => String(s).toLowerCase()).includes(rowValue)
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

    // ✅ Status Filter
    {
      accessorKey: "status",
      header: (ctx: HeaderContext<EmpDetailsType, any>) => (
        <div className="text-center">
          <StatusHeaderFilter table={ctx.table} column={ctx.column} />
        </div>
      ),
      filterFn: (row, id, value) => {
        const selected = (value as string[] | undefined) ?? []
        if (!selected.length) return true
        const rowValue = String(row.getValue(id) ?? "").trim().toLowerCase()
        return selected.map((s) => String(s).toLowerCase()).includes(rowValue)
      },
      cell: ({ row }) => {
        const status = (row.getValue("status") as string) ?? ""
        const normalized = String(status || "").toLowerCase()

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
        }

        const cls = badgeStyles[normalized] ?? "bg-muted text-muted-foreground"

        return (
          <div className="text-center">
            <span
              className={cn("text-xs rounded-full px-3 py-1 font-medium", cls)}
            >
              {formatStatusLabel(status)}
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
        const isStaged = entry.status === "staged"

        return (
          <div className="text-center">
            <Button
              size="sm"
              className={cn(
                "rounded transition",
                isStaged
                  ? "bg-black text-white hover:opacity-80"
                  : "bg-muted text-muted-foreground cursor-not-allowed opacity-50"
              )}
              onClick={() => isStaged && onInterviewClick(entry)}
              disabled={!isStaged}
            >
              Interview
            </Button>
          </div>
        )
      },
    },
  ]
}
