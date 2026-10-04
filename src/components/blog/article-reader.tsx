"use client";

/**
 * The article read one screen at a time, in a card (the "reading card").
 *
 * The server renders the whole article, so search and readers without scripts
 * get all of it. In the browser the card is one screen tall and its text is
 * laid out in CSS columns, one card-wide column per page, like an e-book: the
 * browser fills each page to the bottom and carries a paragraph on to the next
 * page line by line, so pages are full and do not scroll. A heading stays with
 * the text it introduces, and images, code and the contents box are never cut
 * (globals.css, "Reading card"). Turning a page scrolls the card sideways by
 * one page width.
 *
 * On a computer the pages turn with round arrows on the card's sides (or ← →);
 * on a touch screen by swiping, with a hint until the reader's first swipe.
 * The arrows stay for screen readers there.
 *
 * An article with a contents list (rich-content.tsx) gets a Contents button in
 * the card's head instead of the list taking up page 1: it opens the list on
 * any page and turns to the section chosen. The list stays in the server HTML
 * for search and readers without scripts, and shows in place on a one-page
 * article, which has no page controls.
 *
 * An article longer than one page that has a featured image opens on a cover:
 * page 1 is the title area alone, its picture filling the rest of the card,
 * with a "Start reading" button, and the text begins at the top of page 2 —
 * instead of a heading and two lines squeezed under the picture. Where the
 * picture would get less than MIN_COVER_IMAGE (a small phone), page 1 is a
 * title page instead — the title area without its picture — and the picture
 * opens page 2, above the text.
 *
 * Pages follow the screen, so a phone has more of them than a laptop. The page
 * is kept in the address as #page-3 (replaced, not added to history, so Back
 * leaves the article); any other hash (#comments) is left alone.
 */

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { trackClick } from "@/components/blog/tracked-link";

const PAGE_HASH = /^#page-(\d+)$/;
/** The card never gets shorter than this, however small the window. */
const MIN_CARD = 440;
/** The least height the cover's picture may get; below it the cover is a title page. */
const MIN_COVER_IMAGE = 140;
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

/** One page's width: the reading area's full width, since the column gap equals its side padding (globals.css). */
function pageWidth(box: HTMLElement) {
  return parseFloat(getComputedStyle(box).width) || box.clientWidth || 1;
}

/** The page a point of the laid-out text is on, from its left edge on screen. */
function pageAt(box: HTMLElement, left: number) {
  const offset = left - box.getBoundingClientRect().left + box.scrollLeft;
  return Math.max(0, Math.floor((offset + 2) / pageWidth(box)));
}

/** The text at the top-left of the shown page, to find the same place again after the pages change. */
function textAtTop(box: HTMLElement): Range | null {
  const style = getComputedStyle(box);
  const rect = box.getBoundingClientRect();
  const x = rect.left + parseFloat(style.paddingLeft) + 4;
  const y = rect.top + parseFloat(style.paddingTop) + 4;
  try {
    const doc = document as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null };
    const position = doc.caretPositionFromPoint?.(x, y);
    if (position) {
      const range = document.createRange();
      range.setStart(position.offsetNode, position.offset);
      return box.contains(range.startContainer) ? range : null;
    }
    const range = document.caretRangeFromPoint?.(x, y) ?? null;
    return range && box.contains(range.startContainer) ? range : null;
  } catch {
    return null;
  }
}

export function ArticleReader({ blogId, crumb, title, children }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLDivElement>(null);
  const end = useRef<HTMLDivElement>(null);
  // How many pages the article has; null until the browser has laid it out.
  const [pages, setPages] = useState<number | null>(null);
  // Page 1 is a cover (see the top of this file).
  const [cover, setCover] = useState(false);
  const [page, setPage] = useState(0);
  const busy = useRef(false);
  // The page turn in progress: its fade-out, and which way the new page slides in.
  const turn = useRef<{ out: Animation; shift: number; still: boolean } | null>(null);
  const size = useRef({ width: 0, height: 0 });
  // The article's sections, read from the contents list rich-content.tsx wrote.
  const [sections, setSections] = useState<{ id: string; label: string }[]>([]);
  const [listOpen, setListOpen] = useState(false);
  // The section being read when the list opened: the last one starting on or before the page.
  const [currentSection, setCurrentSection] = useState(-1);
  const listButton = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLElement>(null);
  const listId = useId();

  const count = pages ?? 1;

  /** Lays the article out in pages that fit the card, keeping the reader on the text they were reading. */
  const measure = useCallback(() => {
    const box = area.current;
    const shell = root.current;
    if (!box || !shell) return;
    const header = document.querySelector<HTMLElement>(".site-header");
    const before = shell.dataset.layout === "paged" ? textAtTop(box) : null;

    // Set on the elements themselves, not through state, so the measuring below already sees them.
    const cardHeight = Math.max(MIN_CARD, window.innerHeight - (header?.offsetHeight ?? 0) - 24);
    shell.style.setProperty("--reader-h", `${cardHeight}px`);
    shell.dataset.layout = "paged";
    size.current = { width: window.innerWidth, height: window.innerHeight };

    const width = pageWidth(box);
    const style = getComputedStyle(box);
    shell.style.setProperty("--reader-room", `${box.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)}px`);
    const pagesNow = () => {
      const rects = end.current?.getClientRects();
      const last = rects?.length ? rects[rects.length - 1] : null;
      return last ? pageAt(box, last.left) + 1 : 1;
    };
    // The cover is decided on the article as it lays out without one, so it never turns a one-page article into two.
    delete shell.dataset.cover;
    let total = pagesNow();
    const picture = box.querySelector<HTMLElement>(":scope > .reader-intro .article-image");
    if (total > 1 && picture) {
      shell.dataset.cover = "picture";
      if (picture.getBoundingClientRect().height < MIN_COVER_IMAGE) shell.dataset.cover = "title";
      total = pagesNow();
    }
    // A one-page article is shown at its own height, without page controls.
    if (total < 2) shell.dataset.layout = "single";

    const kept = before?.getClientRects()[0] ?? before?.startContainer.parentElement?.getClientRects()[0];
    const next = total < 2 ? 0 : Math.min(total - 1, kept ? pageAt(box, kept.left) : 0);
    box.scrollLeft = next * width;
    setCover(shell.dataset.cover !== undefined);
    setPages(total);
    setPage(next);
  }, []);

  // Lay out once the card is in place, again when fonts or images change the
  // heights, and when the window really changes size (a phone's address bar
  // showing or hiding is not a new layout).
  useEffect(() => {
    const box = area.current;
    if (!box) return;
    // Later pages' images would never load on their own, leaving their height unknown.
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

  useEffect(() => {
    const links = area.current?.querySelectorAll<HTMLAnchorElement>(":scope > .article-body > .article-toc a[href^='#']") ?? [];
    setSections([...links].map(link => ({ id: decodeURIComponent(link.hash.slice(1)), label: link.textContent ?? "" })));
  }, []);

  // A link to #page-3 opens that page once the pages are known, and a link to
  // a heading (the table of contents, rich-content.tsx) opens the page it is on.
  useEffect(() => {
    if (!pages) return;
    const open = () => {
      const match = PAGE_HASH.exec(window.location.hash);
      if (match) return setPage(Math.max(1, Math.min(Number(match[1]), pages)) - 1);
      const id = decodeURIComponent(window.location.hash.slice(1));
      const box = area.current;
      const target = id && box ? box.querySelector(`[id="${CSS.escape(id)}"]`) : null;
      const rect = target?.getClientRects()[0];
      if (box && rect) setPage(Math.min(pages - 1, pageAt(box, rect.left)));
    };
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, [pages]);

  // Show this page: scroll the columns to it.
  useEffect(() => {
    const box = area.current;
    if (!pages || !box) return;
    box.scrollLeft = page * pageWidth(box);

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
  }, [pages, page]);

  // The browser itself can scroll the columns — Tab onto a link on another
  // page, find-in-page, a text selection dragged past the edge. The page then
  // follows whatever is showing, snapped back to a whole page.
  useEffect(() => {
    const box = area.current;
    if (!pages || pages < 2 || !box) return;
    let timer = 0;
    const scrolled = () => {
      if (busy.current) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const width = pageWidth(box);
        const shown = Math.min(pages - 1, Math.round(box.scrollLeft / width));
        if (Math.abs(box.scrollLeft - shown * width) > 1) box.scrollLeft = shown * width;
        setPage(shown);
      }, 80);
    };
    box.addEventListener("scroll", scrolled);
    return () => {
      window.clearTimeout(timer);
      box.removeEventListener("scroll", scrolled);
    };
  }, [pages]);

  // Tells the rest of the page how far the reader is (follow-topic.tsx offers notifications half-way).
  useEffect(() => {
    if (pages) window.dispatchEvent(new CustomEvent<ReaderPage>(READER_PAGE_EVENT, { detail: { page, count } }));
  }, [pages, page, count]);

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

  /** The page a section's heading is on. */
  const sectionPage = useCallback((id: string) => {
    const box = area.current;
    const rect = box?.querySelector(`[id="${CSS.escape(id)}"]`)?.getClientRects()[0];
    return box && rect ? Math.min(count - 1, pageAt(box, rect.left)) : null;
  }, [count]);

  function openSection(id: string) {
    setListOpen(false);
    const next = sectionPage(id);
    if (next === null) return;
    if (next === page) area.current?.focus({ preventScroll: true });
    else go(next);
  }

  // The open list takes focus, and closes on Escape or a click outside it.
  useEffect(() => {
    if (!listOpen) return;
    list.current?.querySelector<HTMLButtonElement>("[aria-current='true'], button")?.focus();
    const away = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!list.current?.contains(target) && !listButton.current?.contains(target)) setListOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setListOpen(false);
      listButton.current?.focus();
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", escape);
    };
  }, [listOpen]);

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

  function toggleList() {
    if (!listOpen) {
      let current = -1;
      sections.forEach((section, index) => {
        const start = sectionPage(section.id);
        if (start !== null && start <= page) current = index;
      });
      setCurrentSection(current);
    }
    setListOpen(open => !open);
  }

  const last = page === count - 1;
  return (
    <div className={`reader${pages ? " is-ready" : ""}`} ref={root}>
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
            {sections.length && count > 1 ? (
              <button
                ref={listButton}
                type="button"
                className="reader-toc-button"
                aria-label="Contents"
                aria-expanded={listOpen}
                aria-controls={listId}
                onClick={toggleList}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                  <path d="M4 6h16M4 12h16M4 18h10" />
                </svg>
                <span>Contents</span>
              </button>
            ) : null}
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
        {listOpen ? (
          <nav className="reader-toc" id={listId} aria-label="Contents" ref={list}>
            <p>Contents</p>
            <ol>
              {sections.map((section, index) => (
                <li key={section.id}>
                  <button type="button" aria-current={index === currentSection} onClick={() => openSection(section.id)}>
                    {section.label}
                  </button>
                </li>
              ))}
            </ol>
          </nav>
        ) : null}
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
          {/* Laid out last, so the page it lands on is the article's last page. */}
          <div className="reader-end" ref={end}>
            <span>End of article</span>
            <button type="button" onClick={() => root.current?.nextElementSibling?.scrollIntoView({ behavior: "smooth", block: "start" })}>
              Share &amp; comments <span aria-hidden="true">↓</span>
            </button>
          </div>
        </div>
        {cover && page === 0 && count > 1 ? (
          <button type="button" className="reader-begin" onClick={() => go(1)}>
            Start reading <span aria-hidden="true">→</span>
          </button>
        ) : null}
        {!swiped && !cover && count > 1 && page === 0 ? (
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
