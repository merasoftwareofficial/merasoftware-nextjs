"use client";

/**
 * The site's only Link: next/link plus the page-loading bar.
 *
 * Use it exactly like next/link. While a click is navigating, it reports to
 * src/components/loading/navigation.tsx, which draws the bar. ESLint blocks
 * next/link everywhere else so no link can skip the bar.
 */

import NextLink, { useLinkStatus } from "next/link";
import type { ComponentProps } from "react";
import { usePendingSignal } from "@/components/loading/navigation";

/** Renders nothing: reading the link's status must not add an element to its layout. */
function PendingSignal() {
  const { pending } = useLinkStatus();
  usePendingSignal(pending);
  return null;
}

export default function Link({ children, ...props }: ComponentProps<typeof NextLink>) {
  return (
    <NextLink {...props}>
      {children}
      <PendingSignal />
    </NextLink>
  );
}
