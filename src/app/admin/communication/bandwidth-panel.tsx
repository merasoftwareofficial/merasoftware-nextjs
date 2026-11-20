"use client";

import { useCallback, useEffect, useState } from "react";
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
  dbBytes: number;
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
    dbBytes: number;
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
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
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

  async function handleReset() {
    if (!window.confirm("Reset in-memory bandwidth counters? New consumption will be tracked from now.")) return;
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
    <section aria-label="Bandwidth and process consumption" style={{ display: "grid", gap: "1rem" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center", justifyContent: "space-between" }}>
        <div className={s.subNav} role="group" aria-label="Time window" style={{ margin: 0 }}>
          <button type="button" aria-pressed={windowOpt === "1h"} onClick={() => setWindowOpt("1h")}>Last 1 Hour</button>
          <button type="button" aria-pressed={windowOpt === "24h"} onClick={() => setWindowOpt("24h")}>Last 24 Hours</button>
        </div>
        <div className={s.subNav} role="group" aria-label="Process category" style={{ margin: 0 }}>
          {(["all", "worker", "cron", "api", "system"] as const).map(cat => (
            <button key={cat} type="button" aria-pressed={category === cat} onClick={() => setCategory(cat)}>
              {cat === "all" ? "All" : CATEGORY_LABEL[cat]}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button type="button" className="btn-secondary" disabled={loading} onClick={() => void load(windowOpt)}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
          <button type="button" className="btn-secondary" disabled={resetting || loading} onClick={() => void handleReset()}>
            {resetting ? "Resetting…" : "Reset counters"}
          </button>
        </div>
      </div>

      {error && <p role="alert" style={{ color: "#b91c1c", margin: 0 }}>{error}</p>}

      {!report && loading ? (
        <Loader label="Loading bandwidth usage…" />
      ) : report && totals ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "0.75rem" }}>
            <div className={s.card} style={{ padding: "0.9rem" }}>
              <div style={{ fontSize: "0.8rem", opacity: 0.72 }}>Total Consumption ({report.window})</div>
              <strong style={{ fontSize: "1.35rem", display: "block", marginTop: "0.2rem" }}>{formatBytes(totals.totalBytes)}</strong>
              <div style={{ fontSize: "0.75rem", opacity: 0.7, marginTop: "0.2rem" }}>Uptime: {formatUptime(report.uptimeSeconds)}</div>
            </div>
            <div className={s.card} style={{ padding: "0.9rem" }}>
              <div style={{ fontSize: "0.8rem", opacity: 0.72 }}>MongoDB Traffic</div>
              <strong style={{ fontSize: "1.25rem", display: "block", marginTop: "0.2rem" }}>{formatBytes(totals.dbBytes)}</strong>
              <div style={{ fontSize: "0.75rem", opacity: 0.7, marginTop: "0.2rem" }}>{totals.totalDbReads.toLocaleString()} reads · {totals.totalDbWrites.toLocaleString()} writes</div>
            </div>
            <div className={s.card} style={{ padding: "0.9rem" }}>
              <div style={{ fontSize: "0.8rem", opacity: 0.72 }}>HTTP Outbound</div>
              <strong style={{ fontSize: "1.25rem", display: "block", marginTop: "0.2rem" }}>{formatBytes(totals.httpOutBytes)}</strong>
              <div style={{ fontSize: "0.75rem", opacity: 0.7, marginTop: "0.2rem" }}>{totals.totalRuns.toLocaleString()} total runs / requests</div>
            </div>
            <div className={s.card} style={{ padding: "0.9rem" }}>
              <div style={{ fontSize: "0.8rem", opacity: 0.72 }}>External APIs</div>
              <strong style={{ fontSize: "1.25rem", display: "block", marginTop: "0.2rem" }}>{formatBytes(totals.externalBytes)}</strong>
              <div style={{ fontSize: "0.75rem", opacity: 0.7, marginTop: "0.2rem" }}>{totals.totalExternalCalls.toLocaleString()} outbound calls</div>
            </div>
          </div>

          <div className={s.card} style={{ padding: "0.75rem", overflowX: "auto" }}>
            {!rows.length ? (
              <p className={s.allGood} style={{ margin: "0.5rem 0" }}>No process activity recorded in this window yet.</p>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border, #e2e8f0)" }}>
                    <th style={{ padding: "0.55rem 0.5rem" }}>Process / Functionality</th>
                    <th style={{ padding: "0.55rem 0.5rem" }}>Type</th>
                    <th style={{ padding: "0.55rem 0.5rem", textAlign: "right" }}>Runs</th>
                    <th style={{ padding: "0.55rem 0.5rem", textAlign: "right" }}>DB (R / W)</th>
                    <th style={{ padding: "0.55rem 0.5rem", textAlign: "right" }}>HTTP / Ext</th>
                    <th style={{ padding: "0.55rem 0.5rem", textAlign: "right" }}>Total</th>
                    <th style={{ padding: "0.55rem 0.5rem", minWidth: "110px" }}>Share</th>
                    <th style={{ padding: "0.55rem 0.5rem", textAlign: "right" }}>Last Active</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(item => (
                    <tr key={`${item.category}:${item.name}`} style={{ borderBottom: "1px solid var(--border, #f1f5f9)" }}>
                      <td style={{ padding: "0.55rem 0.5rem", fontWeight: 500, wordBreak: "break-word" }}>{item.name}</td>
                      <td style={{ padding: "0.55rem 0.5rem", opacity: 0.8 }}>{CATEGORY_LABEL[item.category]}</td>
                      <td style={{ padding: "0.55rem 0.5rem", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{item.runs.toLocaleString()}</td>
                      <td style={{ padding: "0.55rem 0.5rem", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {item.dbReads.toLocaleString()} / {item.dbWrites.toLocaleString()}
                        <div style={{ fontSize: "0.72rem", opacity: 0.7 }}>{formatBytes(item.dbBytes)}</div>
                      </td>
                      <td style={{ padding: "0.55rem 0.5rem", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {formatBytes(item.httpOutBytes + item.externalBytes)}
                      </td>
                      <td style={{ padding: "0.55rem 0.5rem", textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                        {formatBytes(item.totalBytes)}
                      </td>
                      <td style={{ padding: "0.55rem 0.5rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                          <div style={{ flex: 1, height: "6px", borderRadius: "999px", background: "var(--surface-2, #e2e8f0)", overflow: "hidden" }}>
                            <div style={{ width: `${Math.min(100, item.percent)}%`, height: "100%", background: item.percent >= 40 ? "#dc2626" : item.percent >= 15 ? "#d97706" : "#2563eb" }} />
                          </div>
                          <span style={{ fontSize: "0.75rem", minWidth: "38px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{item.percent}%</span>
                        </div>
                      </td>
                      <td style={{ padding: "0.55rem 0.5rem", textAlign: "right", opacity: 0.8, whiteSpace: "nowrap" }}>{formatWhen(item.lastAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <p style={{ fontSize: "0.78rem", opacity: 0.72, margin: 0 }}>
            Tracked in-memory across API routes, crons, and workers (zero extra DB writes). Rolling 24-hour window since {formatWhen(report.startedAt)}.
          </p>
        </>
      ) : null}
    </section>
  );
}
