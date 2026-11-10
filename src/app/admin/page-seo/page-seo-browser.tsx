"use client";

import { useState } from "react";
import Link from "@/components/link";
import { STATUS_LABEL, type PageStatus } from "./page-seo-groups";

export type PageCardItem = { key: string; name: string; path: string; status: PageStatus; group: string };

/** One group's pages as cards, with a search box. Each card opens the page's editor. */
export function PageSeoBrowser({ items, group }: { items: PageCardItem[]; group: string }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const visible = q ? items.filter(item => item.name.toLowerCase().includes(q) || item.path.toLowerCase().includes(q)) : items;

  return (
    <section aria-label={`${group} pages`}>
      <div className="seo-toolbar">
        <input
          className="seo-search"
          type="search"
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder={`Search in ${group}`}
          aria-label={`Search in ${group}`}
        />
        <span className="seo-count">{visible.length} of {items.length} pages</span>
      </div>

      {visible.length ? (
        <div className="seo-cards">
          {visible.map(item => (
            <Link key={item.key} href={`/admin/page-seo?page=${encodeURIComponent(item.key)}`} className="seo-card">
              <span className={`seo-status seo-status-${item.status}`}>{STATUS_LABEL[item.status]}</span>
              <strong>{item.name}</strong>
              <span className="seo-path">{item.path}</span>
            </Link>
          ))}
        </div>
      ) : (
        <p className="admin-empty">No page matches “{query}”.</p>
      )}
    </section>
  );
}
