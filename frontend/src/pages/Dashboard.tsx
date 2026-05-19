import { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Funnel,
  FunnelPlus,
  Play,
  X,
} from "lucide-react";
import {
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type DialerOption = {
  id: number;
  dialer_name: string;
};

type CallLogRecord = {
  call_uuid: string;
  call_id: number;
  dialer_id: number;
  dialer_name: string;
  status: string;
  state: string | null;
  flow: string;
  batch: number;
  duration: number;
  call_recording_link: string | null;
  created_at: string;
};

type DashboardFilters = {
  dialer_id: number | null;
  dialer_name: string;
  table_statuses?: string[];
  date_from: string | null;
  date_to: string | null;
};

type DashboardTableResponse = {
  status_code: number;
  dialers: DialerOption[];
  filters: DashboardFilters;
  results: {
    records: CallLogRecord[];
    pagination: {
      page: number;
      page_size: number;
      total_pages: number;
      total_records: number;
    };
  };
};

type ChartPoint = Record<string, string | number>;

type BuiltStatusChart = {
  bucket_label: string;
  statuses: string[];
  series: ChartPoint[];
};

type DashboardAnalyticsResponse = {
  status_code: number;
  filters: DashboardFilters;
  results: {
    total_count: number;
    status_chart: BuiltStatusChart;
    stats_summary: {
      total_calls: number;
      avg_duration: number;
      total_duration: number;
      status_counts: Array<{
        status: string;
        count: number;
        percentage: number;
      }>;
    };
    status_matrix: {
      statuses: string[];
      rows: Array<{
        dialer_id: number;
        dialer_name: string;
        total_calls: number;
        status_percentages: Record<
          string,
          {
            count: number;
            percentage: number;
          }
        >;
      }>;
    };
    flow_breakdown: Array<{
      dialer_id: number;
      dialer_name: string;
      total_count: number;
      flows: Array<{
        flow: string;
        total_count: number;
        batches: Array<{
          batch: number;
          count: number;
        }>;
      }>;
    }>;
  };
};

type DateRangeDraft = {
  from: string;
  to: string;
};

type DashboardPersistedState = {
  dialers: DialerOption[];
  records: CallLogRecord[];
  pagination: {
    page: number;
    page_size: number;
    total_pages: number;
    total_records: number;
  };
  totalCount: number;
  statusChart: BuiltStatusChart;
  statsSummary: DashboardAnalyticsResponse["results"]["stats_summary"];
  flowBreakdown: DashboardAnalyticsResponse["results"]["flow_breakdown"];
  statusMatrix: DashboardAnalyticsResponse["results"]["status_matrix"];
  selectedDialer: string;
  tableSelectedStatuses: string[];
  currentPage: number;
  pageSize: string;
  autoRefresh: boolean;
  appliedDateRange: DateRangeDraft;
  draftDateRange: DateRangeDraft;
};

const DASHBOARD_STORAGE_KEY = "dashboard-page-state-v1";

function readDashboardPersistedState(): DashboardPersistedState | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawValue = window.sessionStorage.getItem(DASHBOARD_STORAGE_KEY);
    if (!rawValue) {
      return null;
    }

    return JSON.parse(rawValue) as DashboardPersistedState;
  } catch {
    return null;
  }
}

const DASHBOARD_TIMEZONE = "America/New_York";

function getTimeZoneParts(
  date: Date,
  timeZone: string
): Record<"year" | "month" | "day" | "hour" | "minute" | "second", number> {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const lookup = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");

  return {
    year: lookup("year"),
    month: lookup("month"),
    day: lookup("day"),
    hour: lookup("hour"),
    minute: lookup("minute"),
    second: lookup("second"),
  };
}

function getTimeZoneOffsetMs(date: Date, timeZone: string) {
  const parts = getTimeZoneParts(date, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );

  return asUtc - date.getTime();
}

function zonedDateTimeStringToUtcIso(value: string, timeZone: string) {
  if (!value) {
    return null;
  }

  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/
  );
  if (!match) {
    return null;
  }

  const [, year, month, day, hour, minute] = match;
  let utcGuess = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    0
  );

  const offset = getTimeZoneOffsetMs(new Date(utcGuess), timeZone);
  utcGuess -= offset;

  return new Date(utcGuess).toISOString();
}

function toIsoOrNull(value: string) {
  if (!value) {
    return null;
  }

  return zonedDateTimeStringToUtcIso(value, DASHBOARD_TIMEZONE);
}

function formatDateRangeLabel(dateFrom: string | null, dateTo: string | null) {
  if (!dateFrom && !dateTo) {
    return "Any time";
  }

  const formatter = new Intl.DateTimeFormat(undefined, {
    timeZone: DASHBOARD_TIMEZONE,
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const fromLabel = dateFrom ? formatter.format(new Date(dateFrom)) : "Start";
  const toLabel = dateTo ? formatter.format(new Date(dateTo)) : "Now";
  return `${fromLabel} - ${toLabel}`;
}

function getTodayRangeDraft(): DateRangeDraft {
  const now = new Date();
  const parts = getTimeZoneParts(now, DASHBOARD_TIMEZONE);
  const dayStamp = `${parts.year}-${`${parts.month}`.padStart(2, "0")}-${`${parts.day}`.padStart(2, "0")}`;

  return {
    from: `${dayStamp}T00:00`,
    to: `${dayStamp}T23:59`,
  };
}


const BASE_STATUS_COLORS = [
  "#0f766e",
  "#2563eb",
  "#dc2626",
  "#7c3aed",
  "#ea580c",
  "#059669",
  "#c026d3",
  "#0891b2",
  "#65a30d",
  "#d97706",
  "#be123c",
  "#4338ca",
];

const FIXED_STATUS_COLORS: Record<string, string> = {
  dnc: "#dc2626",
  live: "#16a34a",
  raxfer: "#166534",
};

function getStatusColor(statusOrIndex: string | number, index?: number) {
  if (typeof statusOrIndex === "string") {
    const fixedColor = FIXED_STATUS_COLORS[statusOrIndex.trim().toLowerCase()];
    if (fixedColor) {
      return fixedColor;
    }
  }

  const paletteIndex =
    typeof statusOrIndex === "number" ? statusOrIndex : (index ?? 0);

  if (paletteIndex < BASE_STATUS_COLORS.length) {
    return BASE_STATUS_COLORS[paletteIndex];
  }

  const generatedIndex = paletteIndex - BASE_STATUS_COLORS.length;
  const hue = (generatedIndex * 47 + 23) % 360;
  const saturation = 62 + (generatedIndex % 3) * 6;
  const lightness = 44 + (generatedIndex % 4) * 5;

  return `hsl(${hue} ${saturation}% ${lightness}%)`;
}

function getStatusTextColor(status: string, index: number) {
  const fixedColor = FIXED_STATUS_COLORS[status.trim().toLowerCase()];
  if (fixedColor) {
    return "#f8fafc";
  }

  if (index < BASE_STATUS_COLORS.length) {
    const darkTextIndexes = new Set([1, 4, 7, 10]);
    return darkTextIndexes.has(index % 12) ? "#1f2937" : "#f8fafc";
  }
  return "#f8fafc";
}

function prettifyStatusLabel(status: string) {
  if (!status) {
    return "Unknown";
  }

  return status
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDurationValue(seconds: number) {
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }

  if (seconds < 3600) {
    return `${(seconds / 60).toFixed(1)}m`;
  }

  return `${(seconds / 3600).toFixed(1)}h`;
}

function getStatusCardStyle(color: string) {
  return {
    background: `linear-gradient(180deg, color-mix(in srgb, ${color} 92%, white 8%) 0%, color-mix(in srgb, ${color} 84%, black 16%) 100%)`,
    borderColor: `color-mix(in srgb, ${color} 72%, transparent)`,
    boxShadow: `inset 0 1px 0 color-mix(in srgb, ${color} 40%, white 60%), 0 10px 26px -18px ${color}`,
  };
}

function getLiveStatusCardStyle(color: string) {
  return {
    ...getStatusCardStyle(color),
    boxShadow: `inset 0 1px 0 color-mix(in srgb, ${color} 44%, white 56%), 0 14px 30px -18px ${color}, 0 0 0 1px color-mix(in srgb, ${color} 30%, transparent)`,
  };
}

function getAnimatedLiveStatusCardStyle(color: string) {
  return {
    ...getLiveStatusCardStyle(color),
    animation: "liveTileGlow 4.2s ease-in-out infinite",
  } as const;
}

function getStatusPillStyle(color: string) {
  return {
    backgroundColor: `color-mix(in srgb, ${color} 10%, var(--background))`,
    borderColor: `color-mix(in srgb, ${color} 30%, transparent)`,
    color,
  };
}

function formatSimplifiedTimestamp(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: DASHBOARD_TIMEZONE,
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatCsvTimestamp(value: string) {
  const parts = getTimeZoneParts(new Date(value), DASHBOARD_TIMEZONE);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")} ${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}:${String(parts.second).padStart(2, "0")}`;
}

function escapeCsvValue(value: string | number) {
  const text = String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

export default function Dashboard() {
  const persistedDashboardStateRef = useRef<DashboardPersistedState | null>(
    readDashboardPersistedState()
  );
  const persistedState = persistedDashboardStateRef.current;

  const [isTableLoading, setIsTableLoading] = useState(!persistedState);
  const [isAnalyticsLoading, setIsAnalyticsLoading] = useState(!persistedState);
  const [isTableRefreshing, setIsTableRefreshing] = useState(false);
  const [isAnalyticsRefreshing, setIsAnalyticsRefreshing] = useState(false);
  const hasLoadedTableRef = useRef(Boolean(persistedState));
  const hasLoadedAnalyticsRef = useRef(Boolean(persistedState));
  const [isDateDialogOpen, setIsDateDialogOpen] = useState(false);
  const [dialers, setDialers] = useState<DialerOption[]>(persistedState?.dialers ?? []);
  const [records, setRecords] = useState<CallLogRecord[]>(persistedState?.records ?? []);
  const [pagination, setPagination] = useState({
    page: persistedState?.pagination.page ?? 1,
    page_size: persistedState?.pagination.page_size ?? 10,
    total_pages: persistedState?.pagination.total_pages ?? 1,
    total_records: persistedState?.pagination.total_records ?? 0,
  });
  const [totalCount, setTotalCount] = useState(persistedState?.totalCount ?? 0);
  const [statusChart, setStatusChart] = useState<BuiltStatusChart>(
    persistedState?.statusChart ?? {
      bucket_label: "Time",
      statuses: [],
      series: [],
    }
  );
  const [statsSummary, setStatsSummary] = useState<DashboardAnalyticsResponse["results"]["stats_summary"]>({
    total_calls: persistedState?.statsSummary?.total_calls ?? 0,
    avg_duration: persistedState?.statsSummary?.avg_duration ?? 0,
    total_duration: persistedState?.statsSummary?.total_duration ?? 0,
    status_counts: persistedState?.statsSummary?.status_counts ?? [],
  });
  const [flowBreakdown, setFlowBreakdown] = useState<DashboardAnalyticsResponse["results"]["flow_breakdown"]>(
    persistedState?.flowBreakdown ?? []
  );
  const [statusMatrix, setStatusMatrix] = useState<DashboardAnalyticsResponse["results"]["status_matrix"]>({
    statuses: persistedState?.statusMatrix?.statuses ?? [],
    rows: persistedState?.statusMatrix?.rows ?? [],
  });
  const [selectedDialer, setSelectedDialer] = useState(persistedState?.selectedDialer ?? "all");
  const [tableSelectedStatuses, setTableSelectedStatuses] = useState<string[]>(
    persistedState?.tableSelectedStatuses ?? []
  );
  const [audioUrls, setAudioUrls] = useState<Record<string, string>>({});
  const [loadingAudioId, setLoadingAudioId] = useState<string | null>(null);
  const [audioErrors, setAudioErrors] = useState<Record<string, string>>({});
  const [currentPage, setCurrentPage] = useState(persistedState?.currentPage ?? 1);
  const [pageSize, setPageSize] = useState(persistedState?.pageSize ?? "10");
  const [autoRefresh, setAutoRefresh] = useState(persistedState?.autoRefresh ?? false);
  const [appliedDateRange, setAppliedDateRange] = useState<DateRangeDraft>(
    persistedState?.appliedDateRange ?? getTodayRangeDraft()
  );
  const [draftDateRange, setDraftDateRange] = useState<DateRangeDraft>(
    persistedState?.draftDateRange ?? getTodayRangeDraft()
  );
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [selectedExportStatuses, setSelectedExportStatuses] = useState<string[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioUrlsRef = useRef<Record<string, string>>({});
  const callLogsSectionRef = useRef<HTMLDivElement | null>(null);
  const scrollToLogsOnFilterRef = useRef(false);
  const stickyControlsRef = useRef<HTMLDivElement | null>(null);
  const [controlsJoined, setControlsJoined] = useState(false);
  const isLoading = isTableLoading || isAnalyticsLoading;
  const isRefreshing = isTableRefreshing || isAnalyticsRefreshing;

  const dateLabel = useMemo(
    () =>
      formatDateRangeLabel(
        toIsoOrNull(appliedDateRange.from),
        toIsoOrNull(appliedDateRange.to)
      ),
    [appliedDateRange]
  );

  const latestRecord = records[0];

  const buildDashboardParams = ({
    includeTableStatuses = false,
    statuses = tableSelectedStatuses,
    page = currentPage,
    size = pageSize,
    includePagination = false,
  }: {
    includeTableStatuses?: boolean;
    statuses?: string[];
    page?: number;
    size?: string;
    includePagination?: boolean;
  } = {}) => {
    const params = new URLSearchParams();
    if (selectedDialer !== "all") {
      params.set("dialer_id", selectedDialer);
    }
    if (includeTableStatuses) {
      for (const status of statuses) {
        params.append("table_status", status);
      }
    }
    if (includePagination) {
      params.set("page", String(page));
      params.set("page_size", size);
    }
    if (appliedDateRange.from) {
      params.set("date_from", toIsoOrNull(appliedDateRange.from) ?? "");
    }
    if (appliedDateRange.to) {
      params.set("date_to", toIsoOrNull(appliedDateRange.to) ?? "");
    }
    return params;
  };

  useEffect(() => {
    let active = true;
    let refreshTimer: number | null = null;

    async function loadDashboardTable({ silent = false } = {}) {
      if (silent || hasLoadedTableRef.current) {
        setIsTableRefreshing(true);
      } else {
        setIsTableLoading(true);
      }
      setError(null);

      try {
        const query = buildDashboardParams({
          includeTableStatuses: true,
          includePagination: true,
        }).toString();
        const res = await fetch(
          `/api/dashboard/filters/${query ? `?${query}` : ""}`,
          {
            credentials: "include",
          }
        );
        const data: DashboardTableResponse & { error?: string } = await res.json();

        if (!active) {
          return;
        }

        if (!res.ok) {
          throw new Error(data.error || "Failed to load dashboard table.");
        }

        setDialers(data.dialers);
        setRecords(data.results.records);
        setPagination(data.results.pagination);
        hasLoadedTableRef.current = true;
      } catch (fetchError) {
        if (!active) {
          return;
        }

        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "Failed to load dashboard table."
        );
      } finally {
        if (active) {
          setIsTableLoading(false);
          setIsTableRefreshing(false);
        }
      }
    }

    loadDashboardTable();

    if (autoRefresh) {
      refreshTimer = window.setInterval(() => {
        void loadDashboardTable({ silent: true });
      }, 5000);
    }

    return () => {
      active = false;
      if (refreshTimer) {
        window.clearInterval(refreshTimer);
      }
    };
  }, [selectedDialer, appliedDateRange, autoRefresh, currentPage, pageSize, tableSelectedStatuses]);

  useEffect(() => {
    let active = true;
    let refreshTimer: number | null = null;

    async function loadDashboardAnalytics({ silent = false } = {}) {
      if (silent || hasLoadedAnalyticsRef.current) {
        setIsAnalyticsRefreshing(true);
      } else {
        setIsAnalyticsLoading(true);
      }
      setError(null);

      try {
        const query = buildDashboardParams().toString();
        const res = await fetch(
          `/api/dashboard/analytics/${query ? `?${query}` : ""}`,
          {
            credentials: "include",
          }
        );
        const data: DashboardAnalyticsResponse & { error?: string } = await res.json();

        if (!active) {
          return;
        }

        if (!res.ok) {
          throw new Error(data.error || "Failed to load dashboard analytics.");
        }

        setTotalCount(data.results.total_count);
        setStatusChart(data.results.status_chart);
        setStatsSummary(data.results.stats_summary);
        setStatusMatrix(data.results.status_matrix);
        setFlowBreakdown(data.results.flow_breakdown);
        hasLoadedAnalyticsRef.current = true;
      } catch (fetchError) {
        if (!active) {
          return;
        }

        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "Failed to load dashboard analytics."
        );
      } finally {
        if (active) {
          setIsAnalyticsLoading(false);
          setIsAnalyticsRefreshing(false);
        }
      }
    }

    loadDashboardAnalytics();

    if (autoRefresh) {
      refreshTimer = window.setInterval(() => {
        void loadDashboardAnalytics({ silent: true });
      }, 20000);
    }

    return () => {
      active = false;
      if (refreshTimer) {
        window.clearInterval(refreshTimer);
      }
    };
  }, [selectedDialer, appliedDateRange, autoRefresh]);

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedDialer, appliedDateRange, pageSize, tableSelectedStatuses]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const nextState: DashboardPersistedState = {
      dialers,
      records,
      pagination,
      totalCount,
      statusChart,
      statsSummary,
      flowBreakdown,
      statusMatrix,
      selectedDialer,
      tableSelectedStatuses,
      currentPage,
      pageSize,
      autoRefresh,
      appliedDateRange,
      draftDateRange,
    };

    window.sessionStorage.setItem(
      DASHBOARD_STORAGE_KEY,
      JSON.stringify(nextState)
    );
  }, [
    dialers,
    records,
    pagination,
    totalCount,
    statusChart,
    statsSummary,
    flowBreakdown,
    statusMatrix,
    selectedDialer,
    tableSelectedStatuses,
    currentPage,
    pageSize,
    autoRefresh,
    appliedDateRange,
    draftDateRange,
  ]);

  const selectedDialerLabel =
    selectedDialer === "all"
      ? "All"
      : dialers.find((dialer) => String(dialer.id) === selectedDialer)?.dialer_name ??
        "Selected dialer";
  const recordsRangeStart =
  pagination.total_records === 0
    ? 0
    : (pagination.page - 1) * pagination.page_size + 1;

const recordsRangeEnd =
  pagination.total_records === 0
    ? 0
    : Math.min(pagination.page * pagination.page_size, pagination.total_records);

  const chartConfig = useMemo<ChartConfig>(() => {
    return statusChart.statuses.reduce<ChartConfig>((config, status, index) => {
      config[status] = {
        label: prettifyStatusLabel(status),
        color: getStatusColor(status, index),
      };
      return config;
    }, {});
  }, [statusChart.statuses]);

  const chartTitle = "Status Trends";
  const availableStatuses = statsSummary.status_counts.map((item) => item.status);
  const hasActiveStatusFilter = tableSelectedStatuses.length > 0;
  const StatusFilterIcon = hasActiveStatusFilter ? FunnelPlus : Funnel;

  const toggleStatusFilter = (status: string, checked: boolean) => {
    setTableSelectedStatuses((current) => {
      if (checked) {
        return current.includes(status) ? current : [...current, status];
      }

      return current.filter((value) => value !== status);
    });
  };

  const handleStatusTileClick = (status: string) => {
    scrollToLogsOnFilterRef.current = true;
    setTableSelectedStatuses([status]);
    setCurrentPage(1);
  };

  const toggleExportStatus = (status: string, checked: boolean) => {
    setSelectedExportStatuses((current) => {
      if (checked) {
        return current.includes(status) ? current : [...current, status];
      }

      return current.filter((value) => value !== status);
    });
  };

  const handleOpenExportDialog = () => {
    setSelectedExportStatuses(
      tableSelectedStatuses.length > 0 ? tableSelectedStatuses : availableStatuses
    );
    setIsExportDialogOpen(true);
  };

  const handleDownloadCsv = async () => {
    if (selectedExportStatuses.length === 0) {
      toast.error("Select at least one status to export.");
      return;
    }

    const buildParams = (page: number, exportPageSize: number) => {
      const params = new URLSearchParams();
      if (selectedDialer !== "all") {
        params.set("dialer_id", selectedDialer);
      }
      for (const status of selectedExportStatuses) {
        params.append("table_status", status);
      }
      params.set("page", String(page));
      params.set("page_size", String(exportPageSize));
      if (appliedDateRange.from) {
        params.set("date_from", toIsoOrNull(appliedDateRange.from) ?? "");
      }
      if (appliedDateRange.to) {
        params.set("date_to", toIsoOrNull(appliedDateRange.to) ?? "");
      }

      return params;
    };

    const fetchExportPage = async (page: number, exportPageSize: number) => {
      const params = buildParams(page, exportPageSize);
      const res = await fetch(`/api/dashboard/filters/?${params.toString()}`, {
        credentials: "include",
      });
      const data: DashboardTableResponse & { error?: string } = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to export call logs.");
      }

      return data;
    };

    try {
      setIsExporting(true);

      const exportPageSize = 100;
      const firstPage = await fetchExportPage(1, exportPageSize);
      const totalPages = firstPage.results.pagination.total_pages;
      const allRecords = [...firstPage.results.records];

      if (totalPages > 1) {
        const remainingPages = Array.from(
          { length: totalPages - 1 },
          (_, index) => index + 2
        );

        for (let index = 0; index < remainingPages.length; index += 4) {
          const pageBatch = remainingPages.slice(index, index + 4);
          const batchResults = await Promise.all(
            pageBatch.map((page) => fetchExportPage(page, exportPageSize))
          );

          batchResults.forEach((pageData) => {
            allRecords.push(...pageData.results.records);
          });
        }
      }

      const csvRows = [
        ["timestamp", "call_id", "status", "Duration"].join(","),
        ...allRecords.map((record) =>
          [
            escapeCsvValue(formatCsvTimestamp(record.created_at)),
            escapeCsvValue(record.call_id),
            escapeCsvValue(prettifyStatusLabel(record.status)),
            escapeCsvValue(formatDurationValue(record.duration)),
          ].join(",")
        ),
      ];

      const csvBlob = new Blob([csvRows.join("\n")], {
        type: "text/csv;charset=utf-8;",
      });
      const downloadUrl = URL.createObjectURL(csvBlob);
      const link = document.createElement("a");
      const fromLabel = appliedDateRange.from
        ? appliedDateRange.from.slice(0, 10)
        : "all-time";
      const toLabel = appliedDateRange.to
        ? appliedDateRange.to.slice(0, 10)
        : "all-time";

      link.href = downloadUrl;
      link.download = `call-logs-${fromLabel}-to-${toLabel}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(downloadUrl);

      toast.success(`Downloaded ${allRecords.length} call log records.`);
      setIsExportDialogOpen(false);
    } catch (downloadError) {
      toast.error(
        downloadError instanceof Error
          ? downloadError.message
          : "Failed to export call logs."
      );
    } finally {
      setIsExporting(false);
    }
  };

  useEffect(() => {
    audioUrlsRef.current = audioUrls;
  }, [audioUrls]);

  const handlePlayRecording = async (record: CallLogRecord) => {
    if (!record.call_recording_link) {
      setAudioErrors((current) => ({
        ...current,
        [record.call_uuid]: "Recording unavailable.",
      }));
      return;
    }

    if (audioUrls[record.call_uuid]) {
      return;
    }

    setLoadingAudioId(record.call_uuid);
    setAudioErrors((current) => {
      const next = { ...current };
      delete next[record.call_uuid];
      return next;
    });

    try {
      const response = await fetch(record.call_recording_link, {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to load recording.");
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);

      setAudioUrls((current) => {
        if (current[record.call_uuid]) {
          URL.revokeObjectURL(audioUrl);
          return current;
        }

        return {
          ...current,
          [record.call_uuid]: audioUrl,
        };
      });
    } catch (error) {
      setAudioErrors((current) => ({
        ...current,
        [record.call_uuid]:
          error instanceof Error ? error.message : "Failed to load recording.",
      }));
    } finally {
      setLoadingAudioId((current) =>
        current === record.call_uuid ? null : current
      );
    }
  };

  useEffect(() => {
    return () => {
      Object.values(audioUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  useEffect(() => {
    if (!scrollToLogsOnFilterRef.current || isLoading || isRefreshing) {
      return;
    }

    const logsSection = callLogsSectionRef.current;
    if (!logsSection) {
      return;
    }

    scrollToLogsOnFilterRef.current = false;
    logsSection.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, [records, isLoading, isRefreshing]);

  useEffect(() => {
    const controlsEl = stickyControlsRef.current;
    if (!controlsEl) {
      return;
    }

    const headerOffset = 56;

    let scrollParent: HTMLElement | Window = window;
    let currentParent = controlsEl.parentElement;

    while (currentParent) {
      const computedStyle = window.getComputedStyle(currentParent);
      if (/(auto|scroll)/.test(computedStyle.overflowY)) {
        scrollParent = currentParent;
        break;
      }
      currentParent = currentParent.parentElement;
    }

    const updateJoinedState = () => {
      const containerTop =
        controlsEl.getBoundingClientRect().top -
        (scrollParent instanceof Window
          ? 0
          : scrollParent.getBoundingClientRect().top);

      setControlsJoined(containerTop <= headerOffset);
    };

    updateJoinedState();
    scrollParent.addEventListener("scroll", updateJoinedState, { passive: true });

    return () => {
      scrollParent.removeEventListener("scroll", updateJoinedState);
    };
  }, []);

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top_left,rgba(15,118,110,0.08),transparent_28%),radial-gradient(circle_at_top_right,rgba(37,99,235,0.08),transparent_26%)] px-4 py-6 text-foreground sm:px-6 sm:py-8">
      <style>
        {`
          @keyframes liveTileGlow {
            0%, 100% {
              transform: translateY(0);
              filter: brightness(1);
            }
            50% {
              transform: translateY(-1px);
              filter: brightness(1.06);
            }
          }
        `}
      </style>
      <div className="mx-auto max-w-7xl space-y-6 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-500">
        <div className="sticky top-0 z-20" ref={stickyControlsRef}>
          <div
            className={cn(
              "pointer-events-none absolute inset-x-0 top-0 h-6 rounded-t-[1.4rem] bg-background/85 backdrop-blur-3xl transition-opacity duration-300 supports-[backdrop-filter]:bg-background/70",
              controlsJoined ? "opacity-100" : "opacity-0"
            )}
          />
          <div
            className={cn(
              "border border-border/45 bg-background/75 p-3 shadow-sm backdrop-blur-3xl backdrop-saturate-150 transition-all duration-300 ease-out supports-[backdrop-filter]:bg-background/60 dark:border-white/8",
              controlsJoined
                ? "rounded-t-none border-t-transparent bg-background/80 shadow-md supports-[backdrop-filter]:bg-background/65"
                : "rounded-2xl"
            )}
          >
            <div className="grid gap-3 md:grid-cols-[1.1fr_0.9fr_auto]">
              <button
                type="button"
                onClick={() => {
                  setDraftDateRange(appliedDateRange);
                  setIsDateDialogOpen(true);
                }}
                className="group flex min-h-14 items-center justify-between rounded-xl border border-border/45 bg-background/75 px-4 py-3 text-left backdrop-blur-xl transition-colors duration-200 hover:border-primary/50 hover:bg-accent/40 dark:border-white/8"
              >
                <div className="space-y-1">
                  <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                    Date Range
                  </p>
                  <p className="text-sm font-medium text-foreground">{dateLabel}</p>
                </div>
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary transition-transform group-hover:scale-105">
                  <CalendarDays className="h-4 w-4" />
                </div>
              </button>

              <div className="space-y-1">
                <Label htmlFor="sticky-dialer-select" className="px-1 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                  Dialer
                </Label>
                <Select value={selectedDialer} onValueChange={setSelectedDialer}>
                  <SelectTrigger
                    id="sticky-dialer-select"
                    className="h-14 rounded-xl border-border/45 bg-background/75 px-4 text-left backdrop-blur-xl dark:border-white/8"
                  >
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All active dialers</SelectItem>
                    {dialers.map((dialer) => (
                      <SelectItem key={dialer.id} value={String(dialer.id)}>
                        {dialer.dialer_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-end">
                <div className="flex h-14 min-w-[170px] items-center gap-3 rounded-xl border border-border/45 bg-background/75 px-4 backdrop-blur-xl dark:border-white/8">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">Auto refresh</p>
                    <p className="text-xs text-muted-foreground">5 seconds</p>
                  </div>
                  <Switch
                    checked={autoRefresh}
                    onCheckedChange={setAutoRefresh}
                    aria-label="Toggle auto refresh every 5 seconds"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <Card className="border-border/45 bg-card/94 dark:border-white/8">
          <CardHeader className="space-y-2">
            <CardTitle className="text-lg">Scope</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <Card className="border-border/40 bg-background/72 shadow-none dark:border-white/8">
                <CardContent className="flex min-h-28 flex-col justify-center gap-1 p-5">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    Active Scope
                  </p>
                  {isLoading ? (
                    <>
                      <Skeleton className="h-6 w-36" />
                      <Skeleton className="h-4 w-40" />
                    </>
                  ) : (
                    <>
                      <p className="text-lg font-semibold">{selectedDialerLabel}</p>
                      <p className="text-sm text-muted-foreground">{dateLabel}</p>
                    </>
                  )}
                </CardContent>
              </Card>
              <Card className="border-border/40 bg-background/72 shadow-none dark:border-white/8">
                <CardContent className="flex min-h-28 flex-col justify-center gap-1 p-5">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    Calls
                  </p>
                  {isLoading ? (
                    <>
                      <Skeleton className="h-8 w-20" />
                      <Skeleton className="h-4 w-28" />
                    </>
                  ) : (
                    <>
                      <p className="text-3xl font-semibold">{totalCount}</p>
                      <p className="text-sm text-muted-foreground">Current scope</p>
                    </>
                  )}
                </CardContent>
              </Card>
              <Card className="border-border/40 bg-background/72 shadow-none dark:border-white/8">
                <CardContent className="flex min-h-28 flex-col justify-center gap-1 p-5">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    Latest Match
                  </p>
                  {isLoading ? (
                    <>
                      <Skeleton className="h-6 w-32" />
                      <Skeleton className="h-4 w-44" />
                    </>
                  ) : (
                    <>
                      <p className="text-lg font-semibold">
                        {latestRecord?.dialer_name ?? "No records yet"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {latestRecord
                          ? new Date(latestRecord.created_at).toLocaleString()
                          : "No recent records"}
                      </p>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>

            {error && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/95 shadow-sm dark:border-white/10">
          <CardHeader className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-lg">{chartTitle}</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4 rounded-xl border border-border/60 bg-background/60 p-4 dark:border-white/10">
                <Skeleton className="h-4 w-44" />
                <Skeleton className="h-[260px] w-full rounded-xl" />
              </div>
            ) : statusChart.series.length > 0 && statusChart.statuses.length > 0 ? (
              <ChartContainer
                config={chartConfig}
                className="h-[320px] w-full rounded-xl border border-border/60 bg-background/60 p-4 dark:border-white/10"
              >
                <LineChart
                  data={statusChart.series}
                  margin={{ top: 12, right: 12, left: 0, bottom: 0 }}
                >
                  <CartesianGrid vertical={false} strokeDasharray="4 4" />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    minTickGap={24}
                  />
                  <YAxis
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={false}
                    width={36}
                  />
                  <ChartTooltip
                    cursor={{ strokeDasharray: "4 4" }}
                    content={
                      <ChartTooltipContent
                        indicator="line"
                        labelFormatter={(label) => `${statusChart.bucket_label}: ${label}`}
                        formatter={(value, name, item) => {
                          const numericValue = Number(value ?? 0);
                          const percentage =
                            totalCount > 0 ? (numericValue / totalCount) * 100 : 0;
                          const lineColor = item.color;

                          return [
                            <div className="flex items-center gap-2">
                              <span
                                className="font-mono tabular-nums"
                                style={{ color: lineColor }}
                              >
                                {numericValue.toLocaleString()}
                              </span>
                              <span
                                className="text-muted-foreground"
                                style={{ color: lineColor }}
                              >
                                ({percentage.toFixed(1)}%)
                              </span>
                            </div>,
                            <span style={{ color: lineColor }}>
                              {prettifyStatusLabel(String(name))}
                            </span>,
                          ];
                        }}
                      />
                    }
                  />
                  <ChartLegend content={<ChartLegendContent />} />
                  {statusChart.statuses.map((status, index) => (
                    <Line
                      key={status}
                      type="monotone"
                      dataKey={status}
                      stroke={`var(--color-${status})`}
                      strokeWidth={2.5}
                      dot={false}
                      activeDot={{ r: 5, strokeWidth: 0 }}
                      animationDuration={700 + index * 120}
                      animationEasing="ease-out"
                    />
                  ))}
                </LineChart>
              </ChartContainer>
            ) : (
              <div className="flex h-[320px] items-center justify-center rounded-xl border border-dashed border-border/70 bg-background/60 text-sm text-muted-foreground dark:border-white/10">
                No status trend data is available for the current filter.
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/95 shadow-sm dark:border-white/10">
          <CardContent className="pt-6">
            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-12 w-36 rounded-lg" />
                <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
                  {Array.from({ length: 10 }).map((_, index) => (
                    <Skeleton key={index} className="h-28 rounded-xl" />
                  ))}
                </div>
              </div>
            ) : (
                <Collapsible defaultOpen className="space-y-4">
                  <CollapsibleTrigger className="group flex w-full items-center justify-between rounded-xl border border-border/70 bg-background/65 px-4 py-3 text-left transition-colors duration-200 hover:bg-accent/30 dark:border-white/10">
                    <div className="flex items-center gap-3">
                      <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-300 ease-out group-data-[state=open]:rotate-180" />
                      <span className="text-lg font-semibold">Stats</span>
                    </div>
                  </CollapsibleTrigger>
                <CollapsibleContent className="space-y-3">
                  <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
                    <div className="rounded-xl border border-border/70 bg-background/70 px-5 py-4 dark:border-white/10">
                      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                        Total Calls
                      </p>
                      <p className="mt-3 text-4xl font-semibold tracking-tight">
                        {statsSummary.total_calls.toLocaleString()}
                      </p>
                    </div>
                    <div className="rounded-xl border border-border/70 bg-background/70 px-5 py-4 dark:border-white/10">
                      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                        Avg Duration
                      </p>
                      <p className="mt-3 text-4xl font-semibold tracking-tight">
                        {formatDurationValue(statsSummary.avg_duration)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-border/70 bg-background/70 px-5 py-4 dark:border-white/10">
                      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                        Total Duration
                      </p>
                      <p className="mt-3 text-4xl font-semibold tracking-tight">
                        {formatDurationValue(statsSummary.total_duration)}
                      </p>
                    </div>
                    {statsSummary.status_counts.map((statusItem, index) => {
                      const statusColor = getStatusColor(statusItem.status, index);
                      const tileTextColor = getStatusTextColor(statusItem.status, index);

                      return (
                        <div
                          key={statusItem.status}
                          className="relative rounded-xl border px-5 py-4 text-left transition-transform duration-200 hover:-translate-y-0.5"
                          style={
                            statusItem.status.trim().toLowerCase() === "live"
                              ? getAnimatedLiveStatusCardStyle(statusColor)
                              : getStatusCardStyle(statusColor)
                          }
                        >
                          <button
                            type="button"
                            onClick={() => handleStatusTileClick(statusItem.status)}
                            className="block w-full text-left"
                            aria-label={`Filter table by ${prettifyStatusLabel(statusItem.status)}`}
                          >
                          <div className="flex items-center gap-2">
                            <p
                              className="text-xs uppercase tracking-[0.16em]"
                              style={{ color: tileTextColor, opacity: 0.92 }}
                            >
                              {prettifyStatusLabel(statusItem.status)}
                            </p>
                          </div>
                          <p
                            className="mt-3 text-4xl font-semibold tracking-tight"
                            style={{ color: tileTextColor }}
                          >
                            {statusItem.count.toLocaleString()}
                          </p>
                          <p
                            className="mt-2 text-sm"
                            style={{ color: tileTextColor, opacity: 0.84 }}
                          >
                            {statusItem.percentage.toFixed(2)}%
                          </p>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/95 shadow-sm dark:border-white/10">
          <CardHeader className="space-y-2">
            <CardTitle className="text-lg">Dialer Flow Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-14 w-full rounded-xl" />
                <Skeleton className="h-14 w-full rounded-xl" />
                <Skeleton className="h-40 w-full rounded-xl" />
              </div>
            ) : flowBreakdown.length > 0 ? (
              <div className="space-y-3">
                {flowBreakdown.map((dialer) => (
                  <Collapsible
                    key={dialer.dialer_id}
                    className="rounded-xl border border-border/70 bg-background/70 dark:border-white/10"
                  >
                    <CollapsibleTrigger className="group flex w-full items-center justify-between px-4 py-3 text-left transition-colors duration-200 hover:bg-accent/30">
                      <div>
                        <p className="font-medium">{dialer.dialer_name}</p>
                      </div>
                      <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-300 ease-out group-data-[state=open]:rotate-180" />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-3 border-t px-4 py-4">
                      {dialer.flows.map((flowItem) => {
                        const donutChartConfig = flowItem.batches.reduce<ChartConfig>(
                          (config, batchItem, index) => {
                            const key = `batch_${batchItem.batch}`;
                            config[key] = {
                              label: `Batch ${batchItem.batch}`,
                              color: getStatusColor(index),
                            };
                            return config;
                          },
                          {}
                        );

                        const donutData = flowItem.batches.map((batchItem) => ({
                          key: `batch_${batchItem.batch}`,
                          name: `Batch ${batchItem.batch}`,
                          value: batchItem.count,
                          percentage:
                            flowItem.total_count > 0
                              ? (batchItem.count / flowItem.total_count) * 100
                              : 0,
                          fill: donutChartConfig[`batch_${batchItem.batch}`]?.color,
                        }));

                        return (
                          <Collapsible
                            key={`${dialer.dialer_id}-${flowItem.flow}`}
                            className="rounded-xl border border-border/60 bg-card/70 dark:border-white/10"
                          >
                            <CollapsibleTrigger className="group flex w-full items-center justify-between px-4 py-3 text-left transition-colors duration-200 hover:bg-accent/30">
                              <div>
                                <p className="font-medium">{prettifyStatusLabel(flowItem.flow)}</p>
                              </div>
                              <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-300 ease-out group-data-[state=open]:rotate-180" />
                            </CollapsibleTrigger>
                            <CollapsibleContent className="border-t px-4 py-4">
                              {donutData.length > 0 ? (
                                <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
                                  <ChartContainer
                                    config={donutChartConfig}
                                    className="h-[240px] w-full rounded-xl border border-border/60 bg-background/70 p-4 dark:border-white/10"
                                  >
                                    <PieChart>
                                      <ChartTooltip
                                        content={
                                          <ChartTooltipContent
                                            nameKey="key"
                                            formatter={(value, name, item) => {
                                              const sliceColor = item.payload.fill;
                                              const percentage = Number(
                                                item.payload.percentage ?? 0
                                              );

                                              return [
                                                <div className="flex items-center gap-2">
                                                  <span
                                                    className="font-mono tabular-nums"
                                                    style={{ color: sliceColor }}
                                                  >
                                                    {Number(value).toLocaleString()}
                                                  </span>
                                                  <span
                                                    className="text-muted-foreground"
                                                    style={{ color: sliceColor }}
                                                  >
                                                    ({percentage.toFixed(1)}%)
                                                  </span>
                                                </div>,
                                                <span style={{ color: sliceColor }}>
                                                  {String(name)}
                                                </span>,
                                              ];
                                            }}
                                          />
                                        }
                                      />
                                      <Pie
                                        data={donutData}
                                        dataKey="value"
                                        nameKey="name"
                                        innerRadius={54}
                                        outerRadius={86}
                                        paddingAngle={3}
                                        strokeWidth={0}
                                        animationDuration={700}
                                      >
                                        {donutData.map((entry) => (
                                          <Cell key={entry.key} fill={entry.fill} />
                                        ))}
                                      </Pie>
                                      <ChartLegend content={<ChartLegendContent nameKey="key" />} />
                                    </PieChart>
                                  </ChartContainer>

                                  <div className="grid gap-3 content-start">
                                    {donutData.map((entry) => (
                                      <div
                                        key={entry.key}
                                        className="flex items-center justify-between rounded-xl border border-border/60 bg-background/60 px-4 py-3 dark:border-white/10"
                                      >
                                        <div className="flex items-center gap-3">
                                          <span
                                            className="h-3 w-3 rounded-full"
                                            style={{ backgroundColor: entry.fill }}
                                          />
                                          <span className="font-medium">{entry.name}</span>
                                        </div>
                                        <div className="text-right">
                                          <p className="font-mono tabular-nums">
                                            {entry.value.toLocaleString()}
                                          </p>
                                          <p className="text-xs text-muted-foreground">
                                            {entry.percentage.toFixed(1)}%
                                          </p>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ) : (
                                <div className="rounded-xl border border-dashed border-border/60 bg-background/60 px-4 py-6 text-sm text-muted-foreground dark:border-white/10">
                                  No batch data is available for this flow.
                                </div>
                              )}
                            </CollapsibleContent>
                          </Collapsible>
                        );
                      })}
                    </CollapsibleContent>
                  </Collapsible>
                ))}
              </div>
            ) : (
              <div className="flex h-[220px] items-center justify-center rounded-xl border border-dashed border-border/70 bg-background/60 text-sm text-muted-foreground dark:border-white/10">
                No dialer flow data is available for the current filter.
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/95 shadow-sm dark:border-white/10">
          <CardContent className="pt-6">
            <Collapsible className="space-y-4">
              <CollapsibleTrigger className="group flex w-full items-center justify-between rounded-xl border border-border/70 bg-background/65 px-4 py-3 text-left transition-colors duration-200 hover:bg-accent/30 dark:border-white/10">
                <div className="flex items-center gap-3">
                  <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-300 ease-out group-data-[state=open]:rotate-180" />
                  <span className="text-lg font-semibold">Status Data</span>
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                {isLoading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-11 w-full rounded-xl" />
                    <Skeleton className="h-[220px] w-full rounded-xl" />
                  </div>
                ) : statusMatrix.rows.length > 0 ? (
                  <div className="overflow-hidden rounded-xl border border-border/70 bg-background/60 dark:border-white/10">
                    <div className="overflow-auto overscroll-contain">
                      <Table className="min-w-[820px]">
                        <TableHeader className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85">
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="min-w-[240px]">Client Dialer Name</TableHead>
                            <TableHead className="min-w-[120px]">Total Calls</TableHead>
                            {statusMatrix.statuses.map((status, index) => (
                            <TableHead key={status} className="min-w-[110px] text-center">
                                <span style={{ color: getStatusColor(status, index) }}>
                                  {prettifyStatusLabel(status)}
                                </span>
                              </TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {statusMatrix.rows.map((row) => (
                            <TableRow key={row.dialer_id}>
                              <TableCell className="font-medium">{row.dialer_name}</TableCell>
                              <TableCell className="font-mono tabular-nums">
                                {row.total_calls.toLocaleString()}
                              </TableCell>
                              {statusMatrix.statuses.map((status, index) => {
                                const statusValue = row.status_percentages[status] ?? {
                                  count: 0,
                                  percentage: 0,
                                };

                                return (
                                  <TableCell key={`${row.dialer_id}-${status}`} className="text-center">
                                    <div className="space-y-1">
                                      <p
                                        className="font-mono tabular-nums text-sm font-semibold"
                                        style={{ color: getStatusColor(status, index) }}
                                      >
                                        {statusValue.percentage.toFixed(1)}%
                                      </p>
                                      <p className="text-xs text-muted-foreground">
                                        {statusValue.count.toLocaleString()}
                                      </p>
                                    </div>
                                  </TableCell>
                                );
                              })}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                ) : (
                  <div className="flex h-[220px] items-center justify-center rounded-xl border border-dashed border-border/70 bg-background/60 text-sm text-muted-foreground dark:border-white/10">
                    No status data is available for the current filter.
                  </div>
                )}
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        </Card>

        <div ref={callLogsSectionRef}>
        <Card className="border-border/70 bg-card/95 shadow-sm dark:border-white/10">
          <CardHeader className="space-y-2">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <CardTitle className="text-lg">Call Logs</CardTitle>
              <div className="flex items-center gap-3">
                <div className="text-sm text-muted-foreground">
                  {recordsRangeStart}-{recordsRangeEnd} of {pagination.total_records}
                </div>
                <TooltipProvider delayDuration={120}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={handleOpenExportDialog}
                        className="h-9 w-9 rounded-lg border-border/70 bg-background/80 dark:border-white/10"
                        aria-label="Download call logs"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Download</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-11 w-full rounded-xl" />
                <Skeleton className="h-[320px] w-full rounded-xl" />
              </div>
            ) : records.length > 0 ? (
              <>
                <div className="overflow-hidden rounded-xl border border-border/70 bg-background/60 dark:border-white/10">
                  <div className="max-h-[440px] overflow-auto overscroll-contain">
                    <Table>
                      <TableHeader className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85">
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="w-[80px]">Sr #</TableHead>
                          <TableHead className="min-w-[130px]">Caller_ID</TableHead>
                          <TableHead>Call timestamp</TableHead>
                          <TableHead className="group/status-header">
                            <div className="flex items-center gap-2">
                              <span>Status</span>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className={`h-7 w-7 shrink-0 rounded-md transition-opacity ${
                                      hasActiveStatusFilter
                                        ? "opacity-100"
                                        : "opacity-0 group-hover/status-header:opacity-100"
                                    }`}
                                    aria-label="Filter status column"
                                  >
                                    <StatusFilterIcon className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start" className="w-56">
                                  <DropdownMenuLabel>Filter Status</DropdownMenuLabel>
                                  {hasActiveStatusFilter && (
                                    <>
                                      <DropdownMenuSeparator />
                                      <button
                                        type="button"
                                        onClick={() => setTableSelectedStatuses([])}
                                        className="flex w-full items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                                      >
                                        <X className="h-4 w-4" />
                                        Clear filter
                                      </button>
                                    </>
                                  )}
                                  <DropdownMenuSeparator />
                                  {availableStatuses.length > 0 ? (
                                    availableStatuses.map((status) => (
                                      <DropdownMenuCheckboxItem
                                        key={status}
                                        checked={tableSelectedStatuses.includes(status)}
                                        onCheckedChange={(checked) =>
                                          toggleStatusFilter(status, checked === true)
                                        }
                                        onSelect={(event) => event.preventDefault()}
                                      >
                                        {prettifyStatusLabel(status)}
                                      </DropdownMenuCheckboxItem>
                                    ))
                                  ) : (
                                    <div className="px-2 py-2 text-sm text-muted-foreground">
                                      No status values
                                    </div>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </TableHead>
                          <TableHead>Duration</TableHead>
                          <TableHead className="w-[120px] text-center">Recording</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {records.map((record, index) => {
                          const statusColor = getStatusColor(
                            record.status,
                            availableStatuses.indexOf(record.status)
                          );

                          return (
                          <TableRow key={record.call_uuid}>
                            <TableCell className="font-mono tabular-nums text-muted-foreground">
                              {(pagination.page - 1) * pagination.page_size + index + 1}
                            </TableCell>
                            <TableCell className="font-mono tabular-nums">
                              {record.call_id}
                            </TableCell>
                            <TableCell className="font-medium">
                              {formatSimplifiedTimestamp(record.created_at)}
                            </TableCell>
                            <TableCell>
                              <div className="inline-flex items-center gap-2">
                                {record.status.trim().toLowerCase() === "live" ? (
                                  <span className="relative flex h-2.5 w-2.5 shrink-0">
                                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500/70" />
                                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                                  </span>
                                ) : null}
                                <span
                                  className="inline-flex rounded-full border px-3 py-1 text-xs font-medium"
                                  style={getStatusPillStyle(statusColor)}
                                >
                                  {prettifyStatusLabel(record.status)}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="font-mono tabular-nums">
                              {formatDurationValue(record.duration)}
                            </TableCell>
                            <TableCell className="text-center">
                              {record.status.trim().toLowerCase() === "live" ? (
                                <span className="text-xs text-muted-foreground">
                                  Recording available soon
                                </span>
                              ) : audioUrls[record.call_uuid] ? (
                                <audio
                                  className="h-9 w-full min-w-[220px]"
                                  controls
                                  preload="none"
                                  src={audioUrls[record.call_uuid]}
                                />
                              ) : (
                                <div className="flex flex-col items-center gap-1">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    onClick={() => void handlePlayRecording(record)}
                                    disabled={loadingAudioId === record.call_uuid}
                                    className="h-9 w-9 rounded-full border-border/70 bg-background/80 dark:border-white/10"
                                    aria-label={`Play recording for call ${record.call_id}`}
                                  >
                                    <Play className="h-4 w-4" />
                                  </Button>
                                  {loadingAudioId === record.call_uuid && (
                                    <span className="text-[11px] text-muted-foreground">
                                      Loading...
                                    </span>
                                  )}
                                  {audioErrors[record.call_uuid] && (
                                    <span className="text-[11px] text-destructive">
                                      {audioErrors[record.call_uuid]}
                                    </span>
                                  )}
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        )})}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <p className="text-sm text-muted-foreground">
                    Page {pagination.page} of {pagination.total_pages}
                  </p>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="page-size" className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                        Rows
                      </Label>
                      <Select value={pageSize} onValueChange={setPageSize}>
                        <SelectTrigger
                          id="page-size"
                          className="h-9 w-[86px] rounded-lg border-border bg-background dark:border-white/10"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="10">10</SelectItem>
                          <SelectItem value="25">25</SelectItem>
                          <SelectItem value="50">50</SelectItem>
                          <SelectItem value="100">100</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                      disabled={pagination.page <= 1}
                      className="gap-1 dark:border-white/10"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setCurrentPage((page) =>
                          Math.min(pagination.total_pages, page + 1)
                        )
                      }
                      disabled={pagination.page >= pagination.total_pages}
                      className="gap-1 dark:border-white/10"
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex h-[260px] items-center justify-center rounded-xl border border-dashed border-border/70 bg-background/60 text-sm text-muted-foreground dark:border-white/10">
                No call logs are available for the current filter.
              </div>
            )}
          </CardContent>
        </Card>
        </div>
      </div>

      <Dialog open={isDateDialogOpen} onOpenChange={setIsDateDialogOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Date Range</DialogTitle>
            <DialogDescription>Select the window for this dashboard.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2 md:grid-cols-2">
            <DateTimePicker
              id="date-from"
              label="From"
              value={draftDateRange.from}
              onChange={(nextValue) =>
                setDraftDateRange((current) => ({
                  ...current,
                  from: nextValue,
                }))
              }
              placeholder="Pick a start date"
              timezoneLabel="All times are in America/New_York"
            />
            <DateTimePicker
              id="date-to"
              label="To"
              value={draftDateRange.to}
              onChange={(nextValue) =>
                setDraftDateRange((current) => ({
                  ...current,
                  to: nextValue,
                }))
              }
              placeholder="Pick an end date"
              timezoneLabel="All times are in America/New_York"
            />
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setDraftDateRange({ from: "", to: "" });
                setAppliedDateRange({ from: "", to: "" });
                setIsDateDialogOpen(false);
              }}
            >
              Clear
            </Button>
            <Button
              type="button"
              onClick={() => {
                setAppliedDateRange(draftDateRange);
                setIsDateDialogOpen(false);
              }}
            >
              Apply Filter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isExportDialogOpen} onOpenChange={setIsExportDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Download Call Logs</DialogTitle>
            <DialogDescription>
              Choose the statuses to include. The export uses the current date range and dialer filters.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                {selectedDialer === "all" ? "All active dialers" : selectedDialerLabel} • {dateLabel}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setSelectedExportStatuses(availableStatuses)}
                disabled={availableStatuses.length === 0}
              >
                Select all
              </Button>
            </div>

            <div className="grid max-h-[320px] gap-3 overflow-y-auto rounded-xl border border-border/70 bg-background/50 p-4 dark:border-white/10 sm:grid-cols-2">
              {availableStatuses.length > 0 ? (
                availableStatuses.map((status) => (
                  <label
                    key={status}
                    className="flex items-center gap-3 rounded-lg border border-border/60 bg-background/80 px-3 py-2 text-sm transition-colors hover:bg-accent/30 dark:border-white/10"
                  >
                    <Checkbox
                      checked={selectedExportStatuses.includes(status)}
                      onCheckedChange={(checked) =>
                        toggleExportStatus(status, checked === true)
                      }
                    />
                    <span>{prettifyStatusLabel(status)}</span>
                  </label>
                ))
              ) : (
                <div className="sm:col-span-2 text-sm text-muted-foreground">
                  No statuses are available to export for the current filter.
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsExportDialogOpen(false)}
              disabled={isExporting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handleDownloadCsv()}
              disabled={isExporting || selectedExportStatuses.length === 0}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              {isExporting ? "Preparing CSV..." : "Download CSV"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
