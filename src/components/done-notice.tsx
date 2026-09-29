"use client";

/**
 * The "Published" / "Scheduled" note the blog list shows after the editor form
 * sends the user back. The note arrives in the URL (?done=…&post=…), so the
 * query is cleared once shown — otherwise a refresh or a shared link would
 * announce the same publish again.
 */

import Link from "@/components/link";
import { useEffect } from "react";

export function DoneNotice({ message, href }: { message: string; href?: string }) {
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete("done");
    url.searchParams.delete("post");
    window.history.replaceState(window.history.state, "", url);
  }, []);

  return (
    <p className="form-message">
      {message}
      {href ? (
        <>
          {" "}
          <Link className="text-link" href={href} target="_blank">
            View post <span>↗</span>
          </Link>
        </>
      ) : null}
    </p>
  );
}
