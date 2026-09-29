"use client";

/**
 * Tells the server a reader opened this post. Runs after the page mounts, so a
 * prefetch or a crawler that never runs scripts is not counted; the server
 * decides whether the view counts at all (view-rules.ts).
 */

import { useEffect } from "react";

export function ViewBeacon({ blogId }: { blogId: string }) {
  useEffect(() => {
    fetch(`/api/blogs/${blogId}/view`, { method: "POST", keepalive: true }).catch(() => {
      // A lost view is not worth disturbing the reader.
    });
  }, [blogId]);
  return null;
}
