"use client";

/**
 * A link from one post to another that reports the click for the admin panel
 * (api/blogs/[id]/click). The report is sent with keepalive and never awaited,
 * so the page changes exactly as fast as with a plain link.
 */

import type { ReactNode } from "react";
import Link from "@/components/link";
import type { ClickPlacement } from "@/lib/repo/types";

/** Reports one click on an article; never awaited, never in the reader's way. */
export function trackClick(blogId: string, placement: ClickPlacement, target: string) {
  fetch(`/api/blogs/${blogId}/click`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ placement, target }),
    keepalive: true,
  }).catch(() => {
    // A lost count is not worth disturbing the reader.
  });
}

type Props = {
  /** The post the reader is on. */
  from: string;
  /** The post the link opens. */
  to: string;
  placement: ClickPlacement;
  href: string;
  className?: string;
  children: ReactNode;
};

export function TrackedLink({ from, to, placement, href, className, children }: Props) {
  return (
    <Link
      className={className}
      href={href}
      onClick={() => trackClick(from, placement, to)}
    >
      {children}
    </Link>
  );
}
