import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronDown } from "lucide-react";
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
  created_at: string;
};

type DashboardResponse = {
  status_code: number;
  dialers: DialerOption[];
  filters: {
    dialer_id: number | null;
    dialer_name: string;
    date_from: string | null;
    date_to: string | null;
  };
  results: {
    total_count: number;
    records: CallLogRecord[];
    chart_records: Array<{
      created_at: string;
      status: string;
    }>;
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

type ChartPoint = Record<string, string | number>;

type BuiltStatusChart = {
  bucketLabel: string;
  statuses: string[];
  series: ChartPoint[];
};

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

  for (let index = 0; index < 2; index += 1) {
    const offset = getTimeZoneOffsetMs(new Date(utcGuess), timeZone);
    utcGuess -= offset;
  }

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

function prettifyBucketLabel(date: Date, intervalMs: number) {
  if (intervalMs < 60 * 60 * 1000) {
    return new Intl.DateTimeFormat(undefined, {
      timeZone: DASHBOARD_TIMEZONE,
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }

  if (intervalMs < 24 * 60 * 60 * 1000) {
    return new Intl.DateTimeFormat(undefined, {
      timeZone: DASHBOARD_TIMEZONE,
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }

  if (intervalMs < 28 * 24 * 60 * 60 * 1000) {
    return new Intl.DateTimeFormat(undefined, {
      timeZone: DASHBOARD_TIMEZONE,
      month: "short",
      day: "2-digit",
    }).format(date);
  }

  return new Intl.DateTimeFormat(undefined, {
    timeZone: DASHBOARD_TIMEZONE,
    month: "short",
    year: "numeric",
  }).format(date);
}

function chooseSmartBucketSize(timestamps: number[]) {
  if (timestamps.length <= 1) {
    return 60 * 60 * 1000;
  }

  const sorted = [...timestamps].sort((a, b) => a - b);
  const minTime = sorted[0];
  const maxTime = sorted[sorted.length - 1];
  const span = Math.max(maxTime - minTime, 1);
  const targetBucketCount = Math.min(12, Math.max(5, Math.ceil(Math.sqrt(sorted.length) * 1.8)));
  const desiredBucketSize = span / targetBucketCount;

  const candidates = [
    5 * 60 * 1000,
    10 * 60 * 1000,
    15 * 60 * 1000,
    30 * 60 * 1000,
    60 * 60 * 1000,
    2 * 60 * 60 * 1000,
    4 * 60 * 60 * 1000,
    6 * 60 * 60 * 1000,
    12 * 60 * 60 * 1000,
    24 * 60 * 60 * 1000,
    2 * 24 * 60 * 60 * 1000,
    3 * 24 * 60 * 60 * 1000,
    7 * 24 * 60 * 60 * 1000,
    14 * 24 * 60 * 60 * 1000,
    30 * 24 * 60 * 60 * 1000,
  ];

  return candidates.find((candidate) => candidate >= desiredBucketSize) ?? candidates[candidates.length - 1];
}

function buildStatusChart(records: DashboardResponse["results"]["chart_records"]): BuiltStatusChart {
  if (records.length === 0) {
    return {
      bucketLabel: "Time",
      statuses: [],
      series: [],
    };
  }

  const timestamps = records.map((record) => new Date(record.created_at).getTime());
  const minTimestamp = Math.min(...timestamps);
  const bucketSize = chooseSmartBucketSize(timestamps);
  const statusTotals = new Map<string, number>();
  const buckets = new Map<number, ChartPoint>();

  for (const record of records) {
    const timestamp = new Date(record.created_at).getTime();
    const status = record.status || "unknown";
    const bucketStart =
      minTimestamp + Math.floor((timestamp - minTimestamp) / bucketSize) * bucketSize;

    statusTotals.set(status, (statusTotals.get(status) ?? 0) + 1);

    if (!buckets.has(bucketStart)) {
      const bucketDate = new Date(bucketStart);
      buckets.set(bucketStart, {
        bucket: bucketStart,
        label: prettifyBucketLabel(bucketDate, bucketSize),
      });
    }

    const currentBucket = buckets.get(bucketStart)!;
    currentBucket[status] = Number(currentBucket[status] ?? 0) + 1;
  }

  const statuses = [...statusTotals.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([status]) => status);

  const series = [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, bucket]) => {
      const row = { ...bucket };
      for (const status of statuses) {
        row[status] = Number(row[status] ?? 0);
      }
      return row;
    });

  return {
    bucketLabel:
      bucketSize < 24 * 60 * 60 * 1000
        ? "Time"
        : bucketSize < 28 * 24 * 60 * 60 * 1000
          ? "Date"
          : "Period",
    statuses,
    series,
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

function getStatusColor(index: number) {
  if (index < BASE_STATUS_COLORS.length) {
    return BASE_STATUS_COLORS[index];
  }

  const generatedIndex = index - BASE_STATUS_COLORS.length;
  const hue = (generatedIndex * 47 + 23) % 360;
  const saturation = 62 + (generatedIndex % 3) * 6;
  const lightness = 44 + (generatedIndex % 4) * 5;

  return `hsl(${hue} ${saturation}% ${lightness}%)`;
}

function prettifyStatusLabel(status: string) {
  if (!status) {
    return "Unknown";
  }

  return status
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function Dashboard() {
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isDateDialogOpen, setIsDateDialogOpen] = useState(false);
  const [dialers, setDialers] = useState<DialerOption[]>([]);
  const [records, setRecords] = useState<CallLogRecord[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [chartRecords, setChartRecords] = useState<DashboardResponse["results"]["chart_records"]>([]);
  const [flowBreakdown, setFlowBreakdown] = useState<DashboardResponse["results"]["flow_breakdown"]>([]);
  const [selectedDialer, setSelectedDialer] = useState("all");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [appliedDateRange, setAppliedDateRange] = useState<DateRangeDraft>(() => getTodayRangeDraft());
  const [draftDateRange, setDraftDateRange] = useState<DateRangeDraft>(() => getTodayRangeDraft());
  const [error, setError] = useState<string | null>(null);

  const dateLabel = useMemo(
    () =>
      formatDateRangeLabel(
        toIsoOrNull(appliedDateRange.from),
        toIsoOrNull(appliedDateRange.to)
      ),
    [appliedDateRange]
  );

  const latestRecord = records[0];

  useEffect(() => {
    let active = true;
    let refreshTimer: number | null = null;

    async function loadDashboardFilters({ silent = false } = {}) {
      if (silent) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      try {
        const params = new URLSearchParams();
        if (selectedDialer !== "all") {
          params.set("dialer_id", selectedDialer);
        }
        if (appliedDateRange.from) {
          params.set("date_from", toIsoOrNull(appliedDateRange.from) ?? "");
        }
        if (appliedDateRange.to) {
          params.set("date_to", toIsoOrNull(appliedDateRange.to) ?? "");
        }

        const query = params.toString();
        const res = await fetch(
          `/api/dashboard/filters/${query ? `?${query}` : ""}`,
          {
            credentials: "include",
          }
        );
        const data: DashboardResponse & { error?: string } = await res.json();

        if (!active) {
          return;
        }

        if (!res.ok) {
          throw new Error(data.error || "Failed to load dashboard filters.");
        }

        setDialers(data.dialers);
        setRecords(data.results.records);
        setTotalCount(data.results.total_count);
        setChartRecords(data.results.chart_records);
        setFlowBreakdown(data.results.flow_breakdown);
      } catch (fetchError) {
        if (!active) {
          return;
        }

        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "Failed to load dashboard filters."
        );
      } finally {
        if (active) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    }

    loadDashboardFilters();

    if (autoRefresh) {
      refreshTimer = window.setInterval(() => {
        void loadDashboardFilters({ silent: true });
      }, 5000);
    }

    return () => {
      active = false;
      if (refreshTimer) {
        window.clearInterval(refreshTimer);
      }
    };
  }, [selectedDialer, appliedDateRange, autoRefresh]);

  const selectedDialerLabel =
    selectedDialer === "all"
      ? "All"
      : dialers.find((dialer) => String(dialer.id) === selectedDialer)?.dialer_name ??
        "Selected dialer";

  const statusChart = useMemo(() => buildStatusChart(chartRecords), [chartRecords]);

  const chartConfig = useMemo<ChartConfig>(() => {
    return statusChart.statuses.reduce<ChartConfig>((config, status, index) => {
      config[status] = {
        label: prettifyStatusLabel(status),
        color: getStatusColor(index),
      };
      return config;
    }, {});
  }, [statusChart.statuses]);

  const chartTitle = "Status Trends";

  return (
    <div className="min-h-full bg-background px-6 py-8 text-foreground">
      <div className="mx-auto max-w-6xl space-y-6">
        <Card className="border-border/70 bg-card/95 shadow-sm">
          <CardHeader className="space-y-2">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="space-y-1">
                <CardTitle className="text-xl">Filters</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Refine the dashboard scope.
                </p>
              </div>
              <div className="flex items-center gap-3 rounded-xl border border-border bg-background/70 px-4 py-3">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">Auto refresh</p>
                  <p className="text-xs text-muted-foreground">Every 5s</p>
                </div>
                <Switch
                  checked={autoRefresh}
                  onCheckedChange={setAutoRefresh}
                  aria-label="Toggle auto refresh every 5 seconds"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-[1.1fr_0.9fr]">
              <button
                type="button"
                onClick={() => {
                  setDraftDateRange(appliedDateRange);
                  setIsDateDialogOpen(true);
                }}
                className="group flex min-h-16 items-center justify-between rounded-xl border border-border bg-background px-4 py-3 text-left transition-colors hover:border-primary/50 hover:bg-accent/30"
              >
                <div className="space-y-1">
                  <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                    Date Range
                  </p>
                  <p className="text-sm font-medium text-foreground">{dateLabel}</p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary transition-transform group-hover:scale-105">
                  <CalendarDays className="h-4 w-4" />
                </div>
              </button>

              <div className="space-y-2">
                <Label htmlFor="dialer-select" className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  Dialer
                </Label>
                <Select value={selectedDialer} onValueChange={setSelectedDialer}>
                  <SelectTrigger
                    id="dialer-select"
                    className="h-16 rounded-xl border-border bg-background px-4 text-left"
                  >
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {dialers.map((dialer) => (
                      <SelectItem key={dialer.id} value={String(dialer.id)}>
                        {dialer.dialer_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <Card className="border-dashed">
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
              <Card className="border-dashed">
                <CardContent className="flex min-h-28 flex-col justify-center gap-1 p-5">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    Matching Records
                  </p>
                  {isLoading ? (
                    <>
                      <Skeleton className="h-8 w-20" />
                      <Skeleton className="h-4 w-28" />
                    </>
                  ) : (
                    <>
                      <p className="text-3xl font-semibold">{totalCount}</p>
                      <p className="text-sm text-muted-foreground">Filtered records</p>
                    </>
                  )}
                </CardContent>
              </Card>
              <Card className="border-dashed">
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

        <Card className="border-border/70 bg-card/95 shadow-sm">
          <CardHeader className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-xl">{chartTitle}</CardTitle>
              {isRefreshing && !isLoading && (
                <div className="text-xs text-muted-foreground">Refreshing...</div>
              )}
            </div>
            <p className="text-sm text-muted-foreground">Counts by status across the current scope.</p>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4 rounded-xl border border-border/60 bg-background/60 p-4">
                <Skeleton className="h-4 w-44" />
                <Skeleton className="h-[260px] w-full rounded-xl" />
              </div>
            ) : statusChart.series.length > 0 && statusChart.statuses.length > 0 ? (
              <ChartContainer
                config={chartConfig}
                className="h-[320px] w-full rounded-xl border border-border/60 bg-background/60 p-4"
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
                        labelFormatter={(label) => `${statusChart.bucketLabel}: ${label}`}
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
              <div className="flex h-[320px] items-center justify-center rounded-xl border border-dashed border-border/70 bg-background/60 text-sm text-muted-foreground">
                No status trend data is available for the current filter.
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/95 shadow-sm">
          <CardHeader className="space-y-2">
            <CardTitle className="text-xl">Dialer Flow Breakdown</CardTitle>
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
                    className="rounded-xl border border-border/70 bg-background/70"
                  >
                    <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-accent/30">
                      <div>
                        <p className="font-medium">{dialer.dialer_name}</p>
                      </div>
                      <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform data-[state=open]:rotate-180" />
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
                            className="rounded-xl border border-border/60 bg-card/70"
                          >
                            <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-accent/30">
                              <div>
                                <p className="font-medium">{prettifyStatusLabel(flowItem.flow)}</p>
                              </div>
                              <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform data-[state=open]:rotate-180" />
                            </CollapsibleTrigger>
                            <CollapsibleContent className="border-t px-4 py-4">
                              {donutData.length > 0 ? (
                                <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
                                  <ChartContainer
                                    config={donutChartConfig}
                                    className="h-[240px] w-full rounded-xl border border-border/60 bg-background/70 p-4"
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
                                        className="flex items-center justify-between rounded-xl border border-border/60 bg-background/60 px-4 py-3"
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
                                <div className="rounded-xl border border-dashed border-border/60 bg-background/60 px-4 py-6 text-sm text-muted-foreground">
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
              <div className="flex h-[220px] items-center justify-center rounded-xl border border-dashed border-border/70 bg-background/60 text-sm text-muted-foreground">
                No dialer flow data is available for the current filter.
              </div>
            )}
          </CardContent>
        </Card>
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
    </div>
  );
}
