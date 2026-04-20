import { FormEvent, useState } from "react";
import { Search, SearchX } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SpinnerCustom } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type CallLookupRecord = {
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

type CallLookupResponse = {
  status_code: number;
  call_id: number;
  exists: boolean;
  count: number;
  records: CallLookupRecord[];
  error?: string;
};

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDuration(seconds: number) {
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

export default function CallLookupPage() {
  const [callId, setCallId] = useState("");
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [result, setResult] = useState<CallLookupResponse | null>(null);

  const handleSearch = async (event: FormEvent) => {
    event.preventDefault();

    if (!callId.trim()) {
      toast.error("Enter a call_id to search.");
      return;
    }

    try {
      setLoading(true);
      setHasSearched(false);

      const params = new URLSearchParams({
        call_id: callId.trim(),
      });

      const res = await fetch(`/api/call-logs/search/?${params.toString()}`, {
        credentials: "include",
      });
      const data: CallLookupResponse = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to search call records.");
      }

      setResult(data);
      setHasSearched(true);
    } catch (error) {
      setResult(null);
      setHasSearched(true);
      toast.error(
        error instanceof Error ? error.message : "Failed to search call records."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 p-6 md:p-8">
      <Card className="rounded-3xl border-border/70 bg-card/90 shadow-sm dark:border-white/10">
        <CardHeader className="pb-4">
          <CardTitle className="text-xl">Call Lookup</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={handleSearch}
            className="flex flex-col gap-4 md:flex-row md:items-end"
          >
            <div className="flex-1 space-y-2">
              <Label htmlFor="call-id">Caller_ID</Label>
              <Input
                id="call-id"
                inputMode="numeric"
                maxLength={10}
                value={callId}
                onChange={(event) => setCallId(event.target.value.replace(/\D/g, ""))}
                placeholder="Enter 10-digit caller id"
              />
            </div>

            <Button type="submit" className="min-w-[140px]" disabled={loading}>
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <SpinnerCustom />
                  Searching
                </span>
              ) : (
                <span className="inline-flex items-center gap-2">
                  <Search className="h-4 w-4" />
                  Search
                </span>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="rounded-3xl border-border/70 bg-card/90 shadow-sm dark:border-white/10">
        <CardHeader className="pb-4">
          <CardTitle className="text-xl">Results</CardTitle>
        </CardHeader>
        <CardContent>
          {!hasSearched ? (
            <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border/70 bg-background/40 text-center dark:border-white/10">
              <Search className="h-6 w-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Search a caller id to check whether it exists in your dialers.
              </p>
            </div>
          ) : result && result.exists ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-border/70 bg-background/60 px-4 py-3 text-sm dark:border-white/10">
                Found <span className="font-semibold">{result.count}</span>{" "}
                record{result.count === 1 ? "" : "s"} for{" "}
                <span className="font-semibold">{result.call_id}</span>
              </div>

              <div className="overflow-hidden rounded-2xl border border-border/70 dark:border-white/10">
                <div className="max-h-[520px] overflow-auto">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85">
                      <TableRow>
                        <TableHead>Caller_ID</TableHead>
                        <TableHead>Timestamp</TableHead>
                        <TableHead>Dialer</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Duration</TableHead>
                        <TableHead>Flow</TableHead>
                        <TableHead>Batch</TableHead>
                        <TableHead>State</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.records.map((record) => (
                        <TableRow key={record.call_uuid}>
                          <TableCell className="font-mono">{record.call_id}</TableCell>
                          <TableCell>{formatTimestamp(record.created_at)}</TableCell>
                          <TableCell>{record.dialer_name}</TableCell>
                          <TableCell>{record.status}</TableCell>
                          <TableCell>{formatDuration(record.duration)}</TableCell>
                          <TableCell>{record.flow}</TableCell>
                          <TableCell>{record.batch}</TableCell>
                          <TableCell>{record.state || "-"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border/70 bg-background/40 text-center dark:border-white/10">
              <SearchX className="h-6 w-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No records were found for that caller id in your dialers.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
