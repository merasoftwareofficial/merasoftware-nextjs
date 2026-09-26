"use client";

/**
 * Search box for the blog listing.
 *
 * The query lives in the URL rather than in component state, so a search is a
 * real page a reader can bookmark, share and go Back out of — and the results
 * are rendered on the server, which a client-only filter would lose.
 */

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export function SearchBox({ action = "/blog", placeholder = "Search articles" }: { action?: string; placeholder?: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [term, setTerm] = useState(params.get("q") ?? "");

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const next = term.trim();
    router.push(next ? `${action}?q=${encodeURIComponent(next)}` : action);
  }

  function clear() {
    setTerm("");
    router.push(action);
  }

  return (
    <form className="search-box" onSubmit={submit} role="search">
      <input
        type="search"
        value={term}
        onChange={event => setTerm(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
      />
      <button className="admin-button" type="submit">
        Search
      </button>
      {params.get("q") ? (
        <button className="admin-button secondary" type="button" onClick={clear}>
          Clear
        </button>
      ) : null}
    </form>
  );
}
