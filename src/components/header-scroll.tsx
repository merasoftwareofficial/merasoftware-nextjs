"use client";

import { useEffect, useRef } from "react";

/** Scroll distance that counts as a direction change, so a trackpad's small jitters do nothing. */
const STEP = 6;

/**
 * The site header's scroll behaviour (globals.css, "Sticky header"). Renders
 * nothing visible: it only sets two attributes on the surrounding <header>,
 * so the page never re-renders while scrolling.
 *
 * - At the top the header scrolls away with the page, black as always.
 * - Once it is out of view, `data-scrolled` makes it sticky in its light glass
 *   style, and `data-hidden` keeps it above the screen while scrolling down.
 * - Scrolling up slides it in; back at the very top it is the black header again.
 * - It never hides while the phone menu, the account menu or a focused link is in it.
 *
 * It also publishes the header's height for anything that must stay clear of it:
 * --header-height (always) and --header-offset (the part covering the screen now).
 */
export function HeaderScroll() {
  const marker = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const header = marker.current?.closest("header");
    if (!header) return;
    const root = document.documentElement;

    let lastY = window.scrollY;
    let scrolled = false;
    let hidden = false;
    let frame = 0;

    const inUse = () => header.contains(document.activeElement) || !!header.querySelector('[aria-expanded="true"]');

    const update = () => {
      frame = 0;
      const y = Math.max(0, window.scrollY);
      const height = header.offsetHeight;
      const delta = y - lastY;

      // Sticky from the moment the header has scrolled out of view until the very top.
      const nextScrolled = scrolled ? y > 0 : y > height;
      let nextHidden = hidden;
      if (!nextScrolled || inUse()) nextHidden = false;
      else if (!scrolled) nextHidden = true; // just left the top: stay out of view until the reader scrolls up
      else if (delta > STEP) nextHidden = true;
      else if (delta < -STEP) nextHidden = false;
      if (Math.abs(delta) > STEP || nextScrolled !== scrolled) lastY = y;

      if (nextScrolled !== scrolled) {
        // Entering the sticky state happens off screen: no slide-out animation for it.
        header.style.transition = "none";
        header.toggleAttribute("data-scrolled", nextScrolled);
        header.toggleAttribute("data-hidden", nextHidden);
        void header.offsetHeight;
        header.style.transition = "";
      } else if (nextHidden !== hidden) {
        header.toggleAttribute("data-hidden", nextHidden);
      }
      scrolled = nextScrolled;
      hidden = nextHidden;

      const covering = scrolled ? (hidden ? 0 : height) : Math.max(0, height - y);
      root.style.setProperty("--header-height", `${height}px`);
      root.style.setProperty("--header-offset", `${covering}px`);
    };

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      cancelAnimationFrame(frame);
      header.removeAttribute("data-scrolled");
      header.removeAttribute("data-hidden");
    };
  }, []);

  return <span ref={marker} hidden />;
}
