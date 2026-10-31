"use client";
import { useState } from "react";
import { BUSINESS_LOCATION } from "@/lib/business-location";

export function ShareLocation() {
  const [message, setMessage] = useState("");
  const [showLink, setShowLink] = useState(false);
  async function share() {
    setMessage("");
    setShowLink(false);
    if (navigator.share) {
      try {
        await navigator.share({ title: BUSINESS_LOCATION.name, text: BUSINESS_LOCATION.name, url: BUSINESS_LOCATION.mapsUrl });
        return;
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(BUSINESS_LOCATION.mapsUrl);
      setMessage("Location link copied.");
    } catch {
      setShowLink(true);
      setMessage("Select and copy the location link below.");
    }
  }
  return <div className="location-share">
    <button type="button" className="location-secondary" onClick={share}>Share location ↗</button>
    <p role="status" className="location-status">{message}</p>
    {showLink ? <input aria-label="Location link" readOnly value={BUSINESS_LOCATION.mapsUrl} onFocus={event => event.currentTarget.select()} /> : null}
  </div>;
}
