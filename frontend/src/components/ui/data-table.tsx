import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getFilteredRowModel,
  useReactTable,
} from "@tanstack/react-table";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { Button } from "./button";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ChevronsLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  Check,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  meta?: Record<string, any>;

  loading?: boolean;
  skeletonRows?: number;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  meta,
  loading = false,
  skeletonRows = 8,
}: DataTableProps<TData, TValue>) {
  const [columnFilters, setColumnFilters] = useState<any[]>([]);

  const ACTIONS_COL_WIDTH = 120;
  const STATUS_COL_WIDTH = 140;

  // ✅ Helper: apply filters manually to raw data (excluding one filter id)
  const getFilteredDataExcluding = useMemo(() => {
    return (excludeId: string) => {
      const activeFilters = (columnFilters || []).filter(
        (f) => f?.id && f.id !== excludeId
      );

      if (!activeFilters.length) return data;

      return (data || []).filter((row: any) => {
        return activeFilters.every((f) => {
          const rowValue = String(row?.[f.id] ?? "").toLowerCase();

          const selectedValues = Array.isArray(f.value)
            ? f.value.map((x: any) => String(x).toLowerCase())
            : [];

          if (!selectedValues.length) return true;

          return selectedValues.includes(rowValue);
        });
      });
    };
  }, [columnFilters, data]);

  // ✅ Dynamic options (faceted: ignore itself, respect others)
  const statusOptions = useMemo(() => {
    const rows = getFilteredDataExcluding("status");
    return Array.from(
      new Set(
        rows.map((r: any) => String(r?.status ?? "").trim()).filter(Boolean)
      )
    ).sort();
  }, [getFilteredDataExcluding]);

  const postOptions = useMemo(() => {
    const rows = getFilteredDataExcluding("post_applied_for");
    return Array.from(
      new Set(
        rows
          .map((r: any) => String(r?.post_applied_for ?? "").trim())
          .filter(Boolean)
      )
    ).sort();
  }, [getFilteredDataExcluding]);

  const projectOptions = useMemo(() => {
    const rows = getFilteredDataExcluding("project_applied_for");
    return Array.from(
      new Set(
        rows
          .map((r: any) => String(r?.project_applied_for ?? "").trim())
          .filter(Boolean)
      )
    ).sort();
  }, [getFilteredDataExcluding]);

  const table = useReactTable({
    data,
    columns,

    state: {
      columnFilters,
    },
    onColumnFiltersChange: setColumnFilters,

    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),

    initialState: {
      pagination: {
        pageIndex: 0,
        pageSize: 10,
      },
    },

    meta: {
      ...(meta || {}),
      statusOptions,
      postOptions,
      projectOptions,
    },
  });

  const currentPage = table.getState().pagination.pageIndex;
  const totalPages = table.getPageCount();

  // ✅ PROFESSIONAL PAGINATION (1 2 3 ... 10 style)
  const renderPageButtons = () => {
    const pageButtons: React.ReactNode[] = [];
    const current = currentPage; // 0-based
    const total = totalPages;

    if (total <= 1) return null;

    const createButton = (pageIndex: number) => (
      <Button
        key={pageIndex}
        variant={current === pageIndex ? "default" : "outline"}
        size="icon"
        className="w-8 h-8 text-sm"
        onClick={() => table.setPageIndex(pageIndex)}
      >
        {pageIndex + 1}
      </Button>
    );

    const createDots = (key: string) => (
      <span key={key} className="px-2 text-muted-foreground select-none">
        ...
      </span>
    );

    const lastPage = total - 1;

    pageButtons.push(createButton(0));

    const windowStart = Math.max(1, current - 1);
    const windowEnd = Math.min(lastPage - 1, current + 1);

    if (windowStart > 1) pageButtons.push(createDots("dots-left"));

    for (let i = windowStart; i <= windowEnd; i++) {
      pageButtons.push(createButton(i));
    }

    if (windowEnd < lastPage - 1) pageButtons.push(createDots("dots-right"));

    pageButtons.push(createButton(lastPage));

    return pageButtons;
  };

  return (
    <div className="space-y-4 max-w-6xl mx-auto">
      <div className="overflow-x-auto rounded-lg border border-border shadow-sm">
        <table className="min-w-full table-auto border-separate border-spacing-0 border-r border-border">
          <thead className="bg-background text-foreground border-b border-border">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b border-border">
                {headerGroup.headers.map((header, i) => {
                  const columnId = header.column.id;
                  const isActions = columnId === "actions";
                  const isStatus = columnId === "status";

                  return (
                    <th
                      key={header.id}
                      style={
                        isActions
                          ? {
                              position: "sticky",
                              right: 0,
                              minWidth: ACTIONS_COL_WIDTH,
                              backgroundColor: "hsl(var(--background))",
                              zIndex: 30,
                            }
                          : isStatus
                          ? {
                              position: "sticky",
                              right: ACTIONS_COL_WIDTH,
                              minWidth: STATUS_COL_WIDTH,
                              backgroundColor: "hsl(var(--background))",
                              zIndex: 20,
                            }
                          : undefined
                      }
                      className={cn(
                        "px-6 py-3 font-semibold text-nowrap text-foreground",
                        i === 0 ? "border-r border-border" : "",
                        (isStatus || isActions) && "border-l border-border"
                      )}
                    >
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>

          <tbody className="divide-y divide-border">
            {loading ? (
              Array.from({ length: skeletonRows }).map((_, rowIndex) => (
                <tr key={rowIndex} className="hover:bg-muted/40 transition">
                  {table.getAllLeafColumns().map((col) => {
                    const columnId = col.id;
                    const isActions = columnId === "actions";
                    const isStatus = columnId === "status";

                    return (
                      <td
                        key={`${rowIndex}-${col.id}`}
                        style={
                          isActions
                            ? {
                                position: "sticky",
                                right: 0,
                                minWidth: ACTIONS_COL_WIDTH,
                                backgroundColor: "hsl(var(--background))",
                                zIndex: 30,
                              }
                            : isStatus
                            ? {
                                position: "sticky",
                                right: ACTIONS_COL_WIDTH,
                                minWidth: STATUS_COL_WIDTH,
                                backgroundColor: "hsl(var(--background))",
                                zIndex: 20,
                              }
                            : undefined
                        }
                        className={cn(
                          "px-6 py-3 max-w-[160px] whitespace-nowrap",
                          rowIndex === 0 && "border-r border-border",
                          (isStatus || isActions) && "border-l border-border"
                        )}
                      >
                        <Skeleton className="h-4 w-full rounded-md" />
                      </td>
                    );
                  })}
                </tr>
              ))
            ) : table.getRowModel().rows.length === 0 ? (
              <tr>
                <td
                  colSpan={table.getAllLeafColumns().length}
                  className="text-center py-10 text-sm text-muted-foreground"
                >
                  No records found.
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="hover:bg-muted/70 transition">
                  {row.getVisibleCells().map((cell, i) => {
                    const columnId = cell.column.id;
                    const isActions = columnId === "actions";
                    const isStatus = columnId === "status";

                    return (
                      <td
                        key={cell.id}
                        style={
                          isActions
                            ? {
                                position: "sticky",
                                right: 0,
                                minWidth: ACTIONS_COL_WIDTH,
                                backgroundColor: "hsl(var(--background))",
                                zIndex: 30,
                              }
                            : isStatus
                            ? {
                                position: "sticky",
                                right: ACTIONS_COL_WIDTH,
                                minWidth: STATUS_COL_WIDTH,
                                backgroundColor: "hsl(var(--background))",
                                zIndex: 20,
                              }
                            : undefined
                        }
                        className={cn(
                          "px-6 py-3 max-w-[160px] whitespace-nowrap",
                          columnId !== "actions" &&
                            "relative group overflow-visible",
                          i === 0 && "border-r border-border",
                          (isStatus || isActions) && "border-l border-border"
                        )}
                      >
                        {columnId !== "actions" ? (
                          <>
                            <span className="block truncate">
                              {flexRender(
                                cell.column.columnDef.cell,
                                cell.getContext()
                              )}
                            </span>

                            <span
                              className={cn(
                                "absolute bottom-full left-1/2 -translate-x-1/2 mb-1",
                                "max-w-xs px-2 py-1 text-xs font-medium rounded-md shadow-md z-50",
                                "bg-popover text-popover-foreground opacity-0 pointer-events-none",
                                "group-hover:opacity-100 group-hover:translate-y-0 transition-all translate-y-1"
                              )}
                            >
                              {String(cell.getValue() ?? "")}
                            </span>
                          </>
                        ) : (
                          flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {!loading && (
        <div className="flex justify-between items-center text-sm">
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-[60px] justify-between"
                >
                  {table.getState().pagination.pageSize}
                </Button>
              </DropdownMenuTrigger>

              <DropdownMenuContent align="start" className="w-[60px]">
                {[5, 10, 25].map((size) => (
                  <DropdownMenuItem
                    key={size}
                    onSelect={() => {
                      table.setPageSize(size);
                      table.setPageIndex(0);
                    }}
                    className="flex items-center justify-between"
                  >
                    {size}
                    {table.getState().pagination.pageSize === size && (
                      <Check className="ml-2 h-4 w-4 text-primary" />
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <span className="text-muted-foreground">Rows per page</span>
          </div>

          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="outline"
              className="w-8 h-8"
              disabled={!table.getCanPreviousPage()}
              onClick={() => table.setPageIndex(0)}
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>

            <Button
              size="icon"
              variant="outline"
              className="w-8 h-8"
              disabled={!table.getCanPreviousPage()}
              onClick={() => table.previousPage()}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            {renderPageButtons()}

            <Button
              size="icon"
              variant="outline"
              className="w-8 h-8"
              disabled={!table.getCanNextPage()}
              onClick={() => table.nextPage()}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>

            <Button
              size="icon"
              variant="outline"
              className="w-8 h-8"
              disabled={!table.getCanNextPage()}
              onClick={() => table.setPageIndex(totalPages - 1)}
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
