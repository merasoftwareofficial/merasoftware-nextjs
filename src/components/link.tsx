"use client";

/**
 * The site's only Link: next/link plus the page-loading bar.
 *
 * Use it like next/link. The click itself starts the bar (see onNavigateClick
 * in src/components/loading/navigation.tsx), so it works even when the link is
 * gone a moment later, as in a menu that closes on click. `href` is a string so
 * every link can be checked; ESLint blocks next/link everywhere else so no link
 * can skip the bar.
 */

import NextLink from "next/link";
import type { ComponentProps } from "react";
import { onNavigateClick } from "@/components/loading/navigation";

type LinkProps = Omit<ComponentProps<typeof NextLink>, "href"> & { href: string };

export default function Link({ href, onClick, ...props }: LinkProps) {
  return (
    <NextLink
      {...props}
      href={href}
      onClick={event => {
        onClick?.(event);
        onNavigateClick(event, href);
      }}
    />
  );
}
