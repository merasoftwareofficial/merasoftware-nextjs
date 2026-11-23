"use client";
import { useState } from "react";
import { BUSINESS_LOCATION } from "@/lib/business-location";

function CopyIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>;
}

export function ShareLocation() {
  const [message, setMessage] = useState("");
  const [showLink, setShowLink] = useState(false);
  async function share() {
    setMessage("");
    setShowLink(false);
    try {
      await navigator.clipboard.writeText(BUSINESS_LOCATION.mapsUrl);
      setMessage("Location link copied.");
    } catch {
      setShowLink(true);
      setMessage("Select and copy the location link below.");
    }
  }
  return <div className="location-share">
    <button type="button" className="location-secondary" onClick={share} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>Copy map link <CopyIcon /></button>
    <p role="status" className="location-status">{message}</p>
    {showLink ? <input aria-label="Location link" readOnly value={BUSINESS_LOCATION.mapsUrl} onFocus={event => event.currentTarget.select()} /> : null}
  </div>;
}
