"use client";
import { useState } from "react";
import { useNavigate } from "@/components/loading/navigation";
export function PortfolioSync() {
  const router = useNavigate();
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  async function sync(method: string) {
    setBusy(true);
    try {
      const response = await fetch('/api/portfolio/sync', { method, cache: 'no-store' });
      const result = await response.json(); if (!response.ok) throw new Error(result.error);
      setMessage(method === 'POST' ? 'Sync queued. The running backend worker will deliver the latest data on its next cycle.' : `${result.pending} pending · ${result.failed} retrying · Last delivery: ${result.lastDelivery ? new Date(result.lastDelivery).toLocaleString() : 'None yet'}`);
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Sync unavailable.'); }
    finally { setBusy(false); }
  }
  return <div className="portfolio-source"><button className="admin-action" type="button" disabled={busy} onClick={() => void sync('POST')}>Sync / retry now</button> <button className="admin-action" type="button" disabled={busy} onClick={() => void sync('GET')}>Check sync status</button> <button className="admin-action" type="button" onClick={() => router.refresh()}>Refresh list</button>{message ? <p role="status">{message}</p> : null}</div>;
}
