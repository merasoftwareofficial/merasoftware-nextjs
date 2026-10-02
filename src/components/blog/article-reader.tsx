"use client";

/**
 * The article read one screen at a time, in a card (the "reading card").
 *
 * The server renders the whole article, so search and readers without scripts
 * get all of it. In the browser the card is one screen tall: its blocks (the
 * title area, then each paragraph, heading, list or image of the body) are
 * measured and grouped into pages that fit, and only the current page shows.
 * A page never breaks inside a block, and a heading moves on with the text it
 * introduces. A block taller than the card scrolls inside it.
 *
 * On a computer the pages turn with round arrows on the card's sides (or ← →);
 * on a touch screen by swiping, with a hint until the reader's first swipe.
 * The arrows stay for screen readers there.
 *
 * Pages follow the screen, so a phone has more of them than a laptop. The page
 * is kept in the address as #page-3 (replaced, not added to history, so Back
 * leaves the article); any other hash (#comments) is left alone.
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { trackClick } from "@/components/blog/tracked-link";

const PAGE_HASH = /^#page-(\d+)$/;
/** The card never gets shorter than this, however small the window. */
const MIN_CARD = 440;
/** Blocks hidden because they belong to another page. */
const OFF = "reader-off";
/** The first block of the shown page, which loses its top margin. */
const START = "reader-start";
/** Remembers, per browser, that the reader has swiped once, so the hint stops. */
const SWIPED_KEY = "reader-swiped";

/** True once this browser has swiped a page; true too when storage is blocked, so no hint nags. */
function readSwiped() {
  try {
    return window.localStorage.getItem(SWIPED_KEY) === "1";
  } catch {
    return true;
  }
}
const noSubscription = () => () => {};

/** Sent on window whenever the shown page changes; `page` counts from 0. */
export const READER_PAGE_EVENT = "reader:page";
export type ReaderPage = { page: number; count: number };

type Props = {
  blogId: string;
  /** Shown above page 1, e.g. "SEO · 7 min read". */
  crumb: string;
  /** Shown above every later page. */
  title: string;
  children: ReactNode;
};

export function ArticleReader({ blogId, crumb, title, children }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLDivElement>(null);
  // pageOf[i] is the page block i is on; null until the browser has measured.
  const [pageOf, setPageOf] = useState<number[] | null>(null);
  const [page, setPage] = useState(0);
  const busy = useRef(false);
  // The page turn in progress: its fade-out, and which way the new page slides in.
  const turn = useRef<{ out: Animation; shift: number; still: boolean } | null>(null);
  const size = useRef({ width: 0, height: 0 });

  const count = pageOf ? pageOf[pageOf.length - 1] + 1 : 1;

  /** The intro, then every top-level block of the article body. */
  const blocks = useCallback((): HTMLElement[] => {
    const box = area.current;
    if (!box) return [];
    const intro = box.querySelector<HTMLElement>(":scope > .reader-intro");
    const body = box.querySelector<HTMLElement>(":scope > .article-body");
    const end = box.querySelector<HTMLElement>(":scope > .reader-end");
    return [...(intro ? [intro] : []), ...(body ? ([...body.children] as HTMLElement[]) : []), ...(end ? [end] : [])];
  }, []);

  /** Groups the blocks into pages that fit the card, keeping the reader near the block they were on. */
  const measure = useCallback(() => {
    const box = area.current;
    const header = document.querySelector<HTMLElement>(".site-header");
    if (!box) return;
    // Set on the element itself, not through state, so the measuring below already sees it.
    const cardHeight = Math.max(MIN_CARD, window.innerHeight - (header?.offsetHeight ?? 0) - 24);
    root.current?.style.setProperty("--reader-h", `${cardHeight}px`);
    size.current = { width: window.innerWidth, height: window.innerHeight };

    const list = blocks();
    const anchor = list.findIndex(block => block.classList.contains(START));
    list.forEach(block => block.classList.remove(OFF, START));

    const style = getComputedStyle(box);
    const room = box.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    const tops = list.map(block => block.offsetTop - parseFloat(getComputedStyle(block).marginTop));
    const bottoms = list.map(block => block.offsetTop + block.offsetHeight + parseFloat(getComputedStyle(block).marginBottom));
    const isHeading = (index: number) => /^H[2-4]$/.test(list[index]?.tagName ?? "");

    const result: number[] = [];
    let start = 0;
    let current = 0;
    list.forEach((_, index) => {
      if (index > start && bottoms[index] - tops[start] > room) {
        // A heading at the end of a page goes with the text after it.
        const cut = isHeading(index - 1) && index - 1 > start ? index - 1 : index;
        current++;
        for (let moved = cut; moved < index; moved++) result[moved] = current;
        start = cut;
      }
      result[index] = current;
    });

    setPageOf(result);
    if (anchor >= 0 && result[anchor] !== undefined) setPage(result[anchor]);
  }, [blocks]);

  // Measure once the card is in place, again when fonts or images change the
  // heights, and when the window really changes size (a phone's address bar
  // showing or hiding is not a new layout).
  useEffect(() => {
    const box = area.current;
    if (!box) return;
    // Hidden pages' images would never load on their own, leaving their height unknown.
    const images = [...box.querySelectorAll("img")];
    images.forEach(image => (image.loading = "eager"));

    let timer = 0;
    const again = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(measure, 120);
    };
    const resized = () => {
      const { width, height: tall } = size.current;
      if (window.innerWidth !== width || Math.abs(window.innerHeight - tall) > 120) again();
    };

    measure();
    images.forEach(image => image.addEventListener("load", again));
    document.fonts?.ready.then(again);
    window.addEventListener("resize", resized);
    return () => {
      window.clearTimeout(timer);
      images.forEach(image => image.removeEventListener("load", again));
      window.removeEventListener("resize", resized);
    };
  }, [measure]);

  // A link to #page-3 opens that page once the pages are known, and a link to
  // a heading (the table of contents, rich-content.tsx) opens the page it is on.
  useEffect(() => {
    if (!pageOf) return;
    const open = () => {
      const match = PAGE_HASH.exec(window.location.hash);
      if (match) return setPage(Math.min(Number(match[1]), count) - 1);
      const id = decodeURIComponent(window.location.hash.slice(1));
      const target = id ? area.current?.querySelector(`[id="${CSS.escape(id)}"]`) : null;
      if (!target) return;
      const index = blocks().findIndex(block => block.contains(target));
      if (index >= 0 && pageOf[index] !== undefined) setPage(pageOf[index]);
    };
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, [pageOf, count, blocks]);

  // Show only this page's blocks.
  useEffect(() => {
    if (!pageOf) return;
    const list = blocks();
    const first = pageOf.indexOf(page);
    list.forEach((block, index) => {
      block.classList.toggle(OFF, pageOf[index] !== page);
      block.classList.toggle(START, index === first);
    });
    const box = area.current;
    if (!box) return;
    box.scrollTop = 0;

    // A page turn slides the new page in only now that it is the one showing.
    const pending = turn.current;
    if (!pending) return;
    turn.current = null;
    pending.out.cancel();
    box
      .animate(
        pending.still
          ? [{ opacity: 0 }, { opacity: 1 }]
          : [{ opacity: 0, transform: `translateX(${pending.shift * 8}%)` }, { opacity: 1, transform: "none" }],
        { duration: pending.still ? 160 : 300, easing: "cubic-bezier(.2,.7,.2,1)" },
      )
      .finished.finally(() => {
        busy.current = false;
        // A screen reader starts reading the new page, not the button.
        box.focus({ preventScroll: true });
      });
  }, [pageOf, page, blocks]);

  // Tells the rest of the page how far the reader is (follow-topic.tsx offers notifications half-way).
  useEffect(() => {
    if (pageOf) window.dispatchEvent(new CustomEvent<ReaderPage>(READER_PAGE_EVENT, { detail: { page, count } }));
  }, [pageOf, page, count]);

  const go = useCallback(
    (next: number) => {
      const box = area.current;
      if (!box || busy.current || next === page || next < 0 || next >= count) return;
      const forward = next > page;
      const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const shift = forward ? 1 : -1;

      try {
        window.history.replaceState(null, "", next === 0 ? window.location.pathname + window.location.search : `#page-${next + 1}`);
      } catch {
        // The address is a convenience; the page turn does not depend on it.
      }
      if (forward) trackClick(blogId, "next-page", String(next + 1));

      // The card is brought back to the top of the screen if it was scrolled away.
      const top = root.current?.getBoundingClientRect().top ?? 0;
      if (top < 0 || top > window.innerHeight / 3) {
        window.scrollTo({ top: window.scrollY + top - 12, behavior: still ? "auto" : "smooth" });
      }

      busy.current = true;
      const out = box.animate(
        still ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 1, transform: "none" }, { opacity: 0, transform: `translateX(${-shift * 6}%)` }],
        { duration: still ? 120 : 170, easing: "ease-in", fill: "forwards" },
      );
      out.finished.then(() => {
        turn.current = { out, shift, still };
        setPage(next);
      });
    },
    [blogId, count, page],
  );

  // ← and → turn pages while the card is on screen and nothing is being typed.
  useEffect(() => {
    if (count < 2) return;
    const keys = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable]")) return;
      const box = root.current?.getBoundingClientRect();
      if (!box || box.bottom < 80 || box.top > window.innerHeight - 80) return;
      event.preventDefault();
      go(page + (event.key === "ArrowRight" ? 1 : -1));
    };
    window.addEventListener("keydown", keys);
    return () => window.removeEventListener("keydown", keys);
  }, [count, go, page]);

  // Swipe left or right on a touch screen.
  const swipe = useRef<{ x: number; y: number } | null>(null);
  // Shown only on touch screens (CSS), until this browser's first swipe.
  const swipedBefore = useSyncExternalStore(noSubscription, readSwiped, () => true);
  const [swipedNow, setSwipedNow] = useState(false);
  const swiped = swipedBefore || swipedNow;
  function swipedOnce() {
    setSwipedNow(true);
    try {
      window.localStorage.setItem(SWIPED_KEY, "1");
    } catch {
      // Without storage the hint simply shows again on the next article.
    }
  }

  const arrow = (path: string) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={path} />
    </svg>
  );

  const single = pageOf !== null && count < 2;
  const last = page === count - 1;
  return (
    <div className={`reader${single ? " is-single" : ""}${pageOf ? " is-ready" : ""}`} ref={root}>
      <button type="button" className="reader-arrow reader-prev" aria-label="Previous page" hidden={page === 0} onClick={() => go(page - 1)}>
        {arrow("M15 5l-7 7 7 7")}
      </button>
      <div className="reader-card">
        <div className="reader-progress" aria-hidden="true">
          <i style={{ width: `${((page + 1) / count) * 100}%` }} />
        </div>
        <div className="reader-head">
          <span className="reader-crumb">{page === 0 ? crumb : title}</span>
          <span className="reader-right">
            <span className="reader-dots" hidden={count > 14}>
              {Array.from({ length: count }, (_, index) => (
                <button key={index} type="button" aria-label={`Page ${index + 1}`} aria-current={index === page} onClick={() => go(index)} />
              ))}
            </span>
            <span className="reader-pageno" aria-live="polite">
              PAGE {page + 1} <em>/ {count}</em>
            </span>
          </span>
        </div>
        <div
          className="reader-area"
          ref={area}
          tabIndex={-1}
          onPointerDown={event => {
            if (event.pointerType !== "mouse") swipe.current = { x: event.clientX, y: event.clientY };
          }}
          onPointerUp={event => {
            const from = swipe.current;
            swipe.current = null;
            if (!from) return;
            const dx = event.clientX - from.x;
            const dy = event.clientY - from.y;
            if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
              swipedOnce();
              go(page + (dx < 0 ? 1 : -1));
            }
          }}
          onPointerCancel={() => (swipe.current = null)}
        >
          {children}
          {/* Measured as the last block, so it always ends the last page. */}
          <div className="reader-end">
            <span>End of article</span>
            <button type="button" onClick={() => root.current?.nextElementSibling?.scrollIntoView({ behavior: "smooth", block: "start" })}>
              Share &amp; comments <span aria-hidden="true">↓</span>
            </button>
          </div>
        </div>
        {!swiped && count > 1 && page === 0 ? (
          <div className="reader-swipe" aria-hidden="true">
            <b>←</b> Swipe for next page <b>→</b>
          </div>
        ) : null}
      </div>
      <button type="button" className="reader-arrow reader-next" aria-label="Next page" hidden={last} onClick={() => go(page + 1)}>
        {arrow("M9 5l7 7-7 7")}
      </button>
    </div>
  );
}
