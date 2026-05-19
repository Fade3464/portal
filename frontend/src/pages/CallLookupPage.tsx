import { type FormEvent, useEffect, useRef, useState } from "react";
import { PhoneCall, Play, Search, SearchX, Waves } from "lucide-react";
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
  const [audioUrls, setAudioUrls] = useState<Record<string, string>>({});
  const [loadingAudioId, setLoadingAudioId] = useState<string | null>(null);
  const [audioErrors, setAudioErrors] = useState<Record<string, string>>({});
  const audioUrlsRef = useRef<Record<string, string>>({});

  const resetAudioState = () => {
    Object.values(audioUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));
    audioUrlsRef.current = {};
    setAudioUrls({});
    setAudioErrors({});
    setLoadingAudioId(null);
  };

  const handleSearch = async (event: FormEvent) => {
    event.preventDefault();

    if (!callId.trim()) {
      toast.error("Enter a call_id to search.");
      return;
    }

    try {
      setLoading(true);
      setHasSearched(false);
      resetAudioState();

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

  useEffect(() => {
    audioUrlsRef.current = audioUrls;
  }, [audioUrls]);

  useEffect(() => {
    return () => {
      Object.values(audioUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const handlePlayRecording = async (record: CallLookupRecord) => {
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

  return (
    <div className="space-y-6 p-6 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-500 md:p-8">
      <Card className="rounded-3xl border-border/45 bg-card/92 dark:border-white/8">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-3">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <PhoneCall className="h-5 w-5" />
            </div>
            <CardTitle className="text-xl">Call Lookup</CardTitle>
          </div>
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

      <Card className="rounded-3xl border-border/45 bg-card/92 dark:border-white/8">
        <CardHeader className="pb-4">
          <CardTitle className="text-xl">Results</CardTitle>
        </CardHeader>
        <CardContent>
          {!hasSearched ? (
            <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border/70 bg-background/40 text-center dark:border-white/10">
              <Search className="h-6 w-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Search by caller id</p>
            </div>
          ) : result && result.exists ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-border/70 bg-background/60 px-4 py-3 dark:border-white/10">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    <PhoneCall className="h-3.5 w-3.5" />
                    Caller_ID
                  </div>
                  <p className="mt-2 font-mono text-lg font-semibold">{result.call_id}</p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-background/60 px-4 py-3 dark:border-white/10">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    <Waves className="h-3.5 w-3.5" />
                    Records
                  </div>
                  <p className="mt-2 text-lg font-semibold">{result.count}</p>
                </div>
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
                        <TableHead className="w-[140px] text-center">Recording</TableHead>
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
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border/70 bg-background/40 text-center dark:border-white/10">
              <SearchX className="h-6 w-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No matching records</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
