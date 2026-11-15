"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatIndiaDateTime } from "@/lib/date-time";
import styles from "../email-control/email-control.module.css";
import { Loader } from "../email-control/loader";
import { originLabel, type ActionRuleRecord, type RuleOrigin } from "./action-rule-form";
import c from "./actions-panel.module.css";
import s from "./communication.module.css";

type ScheduledRun = {
  _id: string;
  action: string;
  actionLabel?: string;
  ruleName?: string;
  origin?: RuleOrigin;
  rule?: ActionRuleRecord | null;
  audience?: "customer" | "admin";
  dueAt: string;
  channel: "whatsapp" | "email" | "both";
  subject: string;
  text: string;
  customer?: { name: string; email: string; phone: string };
};

export function ActionScheduledPanel({ onBack, onEditRule }: { onBack: () => void; onEditRule?: (rule: ActionRuleRecord) => void }) {
  const [runs, setRuns] = useState<ScheduledRun[] | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/auto-reply/action-rules/runs", { signal, cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || result.message || "Could not load scheduled reminders.");
      if (!signal?.aborted) {
        setRuns(Array.isArray(result.data) ? result.data : []);
        setError("");
      }
    } catch (failure) {
      if (!signal?.aborted) setError(failure instanceof Error ? failure.message : "Could not load scheduled reminders.");
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  async function cancelRun(id: string) {
    setCancellingId(id);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/auto-reply/action-rules/runs/${id}/cancel`, {
        method: "POST",
        cache: "no-store",
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || result.message || "Could not cancel reminder.");
      setRuns(current => (current ? current.filter(r => r._id !== id) : current));
      setNotice("Scheduled reminder cancelled.");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not cancel reminder.");
    } finally {
      setCancellingId(null);
    }
  }

  const filtered = useMemo(() => {
    const list = runs || [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(r =>
      `${r.ruleName || ""} ${r.actionLabel || ""} ${r.customer?.name || ""} ${r.customer?.email || ""} ${r.customer?.phone || ""} ${r.text}`
        .toLowerCase()
        .includes(q),
    );
  }, [runs, query]);

  return (
    <section aria-label="Scheduled reminders" className={s.workSection}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <button type="button" className={s.link} onClick={onBack}>← Back to Actions</button>
        <button type="button" onClick={() => void load()}>Refresh</button>
      </div>

      <div className={s.workToolbar}>
        <h3>Scheduled reminders</h3>
      </div>
      <p className={styles.muted}>Upcoming action-based reminders waiting to go. Paid or completed records are also re-checked automatically right before sending.</p>

      {error && <p className={styles.error} role="alert">{error}</p>}
      {notice && <p role="status" className={c.notice}>{notice}</p>}

      {!runs ? !error && <Loader label="Loading scheduled reminders…" /> : (
        <>
          <div className={c.toolbar}>
            <input className={c.search} type="search" aria-label="Filter scheduled reminders"
              placeholder="Find by customer, rule or message…" value={query} onChange={e => setQuery(e.target.value)} />
            <span className={c.count}>Showing {filtered.length} of {runs.length} scheduled</span>
          </div>

          {!filtered.length ? <p>No scheduled reminders right now.</p> : (
            <div className={c.tableWrap}>
              <table className={c.table} aria-label="Scheduled reminders table">
                <thead>
                  <tr>
                    <th scope="col">Due at</th>
                    <th scope="col">Rule / Action</th>
                    <th scope="col">To</th>
                    <th scope="col">Channel</th>
                    <th scope="col">Message</th>
                    <th scope="col" className={c.right}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(run => {
                    const who = run.audience === "admin"
                      ? `Admin / Team (re: ${run.customer?.name || "Customer"})`
                      : `${run.customer?.name || "Customer"}${run.customer?.phone ? ` · ${run.customer.phone}` : run.customer?.email ? ` · ${run.customer.email}` : ""}`;
                    return (
                      <tr key={run._id} className={c.row}>
                        <td className={c.mono}>{formatIndiaDateTime(run.dueAt)}</td>
                        <td>
                          <div className={c.name}>{run.actionLabel || run.action} <span className={c.count}>· {originLabel(run.origin || run.rule?.origin)}</span></div>
                          <div className={c.when}>{run.ruleName}</div>
                        </td>
                        <td>{who}</td>
                        <td className={c.mono}>{run.channel}</td>
                        <td className={c.description}>
                          {run.subject && <div><strong>{run.subject}</strong></div>}
                          <div>{run.text}</div>
                        </td>
                        <td className={c.right}>
                          <div style={{ display: "inline-flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                            {run.rule && onEditRule && (
                              <button type="button" className={c.manage} onClick={() => onEditRule(run.rule!)}>
                                Edit rule
                              </button>
                            )}
                            <button type="button" className={c.manage} disabled={cancellingId === run._id} onClick={() => void cancelRun(run._id)}>
                              {cancellingId === run._id ? "Cancelling…" : "Cancel"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
