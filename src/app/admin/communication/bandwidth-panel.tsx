"use client";

import { useCallback, useEffect, useState } from "react";
import { useConfirmDialog } from "@/components/admin-confirm-dialog";
import { Loader } from "@/app/admin/email-control/loader";
import { formatIndiaDate, indiaDayKey } from "@/lib/date-time";
import s from "./communication.module.css";

type Category = "worker" | "cron" | "api" | "system";
type WindowOption = "1h" | "24h";

type ProcessUsage = {
  name: string;
  category: Category;
  runs: number;
  dbReads: number;
  dbWrites: number;
  dbOutBytes: number;
  dbInBytes: number;
  httpOutBytes: number;
  httpInBytes: number;
  externalCalls: number;
  externalBytes: number;
  totalBytes: number;
  percent: number;
  lastAt: string | null;
};

type BandwidthReport = {
  window: WindowOption;
  startedAt: string;
  uptimeSeconds: number;
  generatedAt: string;
  totals: {
    totalBytes: number;
    httpOutBytes: number;
    httpInBytes: number;
    dbOutBytes: number;
    dbInBytes: number;
    externalBytes: number;
    totalRuns: number;
    totalDbReads: number;
    totalDbWrites: number;
    totalExternalCalls: number;
  };
  processes: ProcessUsage[];
};

const CATEGORY_LABEL: Record<Category, string> = {
  worker: "Worker",
  cron: "Cron",
  api: "API",
  system: "System",
};

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatWhen(at: string | null): string {
  if (!at) return "—";
  const time = { hour: "numeric", minute: "2-digit", hour12: true } as const;
  return indiaDayKey(at) === indiaDayKey()
    ? formatIndiaDate(at, { day: undefined, month: undefined, year: undefined, ...time })
    : formatIndiaDate(at, { year: undefined, ...time });
}

export function BandwidthPanel({ active }: { active: boolean }) {
  const [windowOpt, setWindowOpt] = useState<WindowOption>("24h");
  const [category, setCategory] = useState<"all" | Category>("all");
  const [report, setReport] = useState<BandwidthReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (win: WindowOption, signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/bandwidth?window=${win}`, { cache: "no-store", signal });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not load bandwidth usage.");
      if (!signal?.aborted) setReport(payload.data as BandwidthReport);
    } catch (err) {
      if (!signal?.aborted) setError(err instanceof Error ? err.message : "Could not load bandwidth usage.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    void load(windowOpt, controller.signal);
    return () => controller.abort();
  }, [active, windowOpt, load]);

  const { confirm, dialog: confirmDialog } = useConfirmDialog();

  async function handleReset() {
    if (!(await confirm({
      title: "Reset bandwidth counters?",
      message: "Reset in-memory bandwidth counters? New consumption will be tracked from now.",
      confirmLabel: "Reset counters",
    }))) return;
    setResetting(true);
    setError(null);
    try {
      const response = await fetch("/api/bandwidth", { method: "POST", cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not reset counters.");
      setReport(payload.data as BandwidthReport);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reset counters.");
    } finally {
      setResetting(false);
    }
  }

  const rows = (report?.processes ?? []).filter(item => category === "all" || item.category === category);
  const totals = report?.totals;

  return (
    <section className={s.bwSection} aria-label="Bandwidth and process consumption">
      <div className={s.bwControls}>
        <div className={s.bwFilterGroup} role="group" aria-label="Time window">
          <button type="button" aria-pressed={windowOpt === "1h"} onClick={() => setWindowOpt("1h")}>Last 1 Hour</button>
          <button type="button" aria-pressed={windowOpt === "24h"} onClick={() => setWindowOpt("24h")}>Last 24 Hours</button>
        </div>
        <div className={s.bwFilterGroup} role="group" aria-label="Process category">
          {(["all", "worker", "cron", "api", "system"] as const).map(cat => (
            <button key={cat} type="button" aria-pressed={category === cat} onClick={() => setCategory(cat)}>
              {cat === "all" ? "All" : CATEGORY_LABEL[cat]}
            </button>
          ))}
        </div>
        <div className={s.bwActions}>
          <button type="button" className="btn-secondary" disabled={loading} onClick={() => void load(windowOpt)}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
          <button type="button" className="btn-secondary" disabled={resetting || loading} onClick={() => void handleReset()}>
            {resetting ? "Resetting…" : "Reset counters"}
          </button>
        </div>
      </div>

      {error && <p role="alert" className={s.bwError}>{error}</p>}

      {!report && loading ? (
        <Loader label="Loading bandwidth usage…" />
      ) : report && totals ? (
        <>
          <div className={s.bwStats}>
            <div className={s.bwStatCard}>
              <span className={s.bwStatLabel}>Render Outbound ({report.window})</span>
              <strong className={s.bwStatValue}>{formatBytes(totals.totalBytes)}</strong>
              <span className={s.bwStatSub}>Uptime: {formatUptime(report.uptimeSeconds)}</span>
            </div>
            <div className={s.bwStatCard}>
              <span className={s.bwStatLabel}>MongoDB Outbound (BSON)</span>
              <strong className={s.bwStatValue}>{formatBytes(totals.dbOutBytes)}</strong>
              <span className={s.bwStatSub}>{totals.totalDbReads.toLocaleString()} R · {totals.totalDbWrites.toLocaleString()} W · In: {formatBytes(totals.dbInBytes)}</span>
            </div>
            <div className={s.bwStatCard}>
              <span className={s.bwStatLabel}>HTTP Responses</span>
              <strong className={s.bwStatValue}>{formatBytes(totals.httpOutBytes)}</strong>
              <span className={s.bwStatSub}>{totals.totalRuns.toLocaleString()} runs / requests</span>
            </div>
            <div className={s.bwStatCard}>
              <span className={s.bwStatLabel}>External APIs</span>
              <strong className={s.bwStatValue}>{formatBytes(totals.externalBytes)}</strong>
              <span className={s.bwStatSub}>{totals.totalExternalCalls.toLocaleString()} outbound calls</span>
            </div>
          </div>

          <div className={s.bwTableWrap}>
            {!rows.length ? (
              <p className={s.allGood} style={{ padding: "14px 16px" }}>No process activity recorded in this window yet.</p>
            ) : (
              <table className={s.bwTable}>
                <thead>
                  <tr>
                    <th>Process / Functionality</th>
                    <th>Type</th>
                    <th className={s.bwNum}>Runs</th>
                    <th className={s.bwNum}>DB (R / W)</th>
                    <th className={s.bwNum}>HTTP / Ext</th>
                    <th className={s.bwNum}>Render Out</th>
                    <th>Share</th>
                    <th className={s.bwNum}>Last Active</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(item => (
                    <tr key={`${item.category}:${item.name}`}>
                      <td className={s.bwName}>{item.name}</td>
                      <td>{CATEGORY_LABEL[item.category]}</td>
                      <td className={s.bwNum}>{item.runs.toLocaleString()}</td>
                      <td className={s.bwNum}>
                        {item.dbReads.toLocaleString()} / {item.dbWrites.toLocaleString()}
                        <span className={s.bwSub}>Out {formatBytes(item.dbOutBytes)} · In {formatBytes(item.dbInBytes)}</span>
                      </td>
                      <td className={s.bwNum}>{formatBytes(item.httpOutBytes + item.externalBytes)}</td>
                      <td className={s.bwNum}><strong>{formatBytes(item.totalBytes)}</strong></td>
                      <td>
                        <div className={s.bwShare}>
                          <div className={s.bwBarTrack}>
                            <div
                              className={s.bwBarFill}
                              data-level={item.percent >= 40 ? "high" : item.percent >= 15 ? "warn" : "ok"}
                              style={{ width: `${Math.min(100, item.percent)}%` }}
                            />
                          </div>
                          <span className={s.bwPct}>{item.percent}%</span>
                        </div>
                      </td>
                      <td className={s.bwNum}>{formatWhen(item.lastAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <p className={s.bwFoot}>
            Measured via native MongoDB BSON command monitoring &amp; Express response hooks in memory (zero extra DB writes). Rolling 24-hour window since {formatWhen(report.startedAt)}.
          </p>
        </>
      ) : null}
      {confirmDialog}
    </section>
  );
}
