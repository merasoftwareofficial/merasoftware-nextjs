"use client";

/**
 * Share buttons for one post.
 *
 * The server decides which buttons show and builds their links
 * (share-rules.ts), so this only opens them and reports the click. On a phone
 * with its own share sheet, one "Share" button opens that sheet instead of the
 * row of apps; "Copy link" stays either way. Counting never delays the share:
 * the report is sent alongside and its answer is not waited for.
 */

import { useState, useSyncExternalStore } from "react";
import type { ShareButton } from "@/lib/share-rules";
import type { SharePlatform } from "@/lib/repo/types";

type Props = {
  blogId: string;
  title: string;
  url: string;
  buttons: ShareButton[];
};

function track(blogId: string, platform: SharePlatform) {
  fetch(`/api/blogs/${blogId}/share`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ platform }),
    keepalive: true,
  }).catch(() => {
    // A lost count is not worth disturbing the reader.
  });
}

/** Clipboard API first; the textarea fallback covers older browsers. */
async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const field = document.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.appendChild(field);
    field.select();
    const copied = document.execCommand("copy");
    field.remove();
    return copied;
  }
}

/** A touch device whose browser can open the phone's own share sheet. Fixed for the page's life. */
const hasPhoneSheet = () => typeof navigator.share === "function" && window.matchMedia("(pointer: coarse)").matches;
const noSubscription = () => () => {};

export function ShareBar({ blogId, title, url, buttons }: Props) {
  // Known only in the browser; the server renders the full row of buttons.
  const phoneSheet = useSyncExternalStore(noSubscription, hasPhoneSheet, () => false);
  const [copied, setCopied] = useState(false);

  if (!buttons.length && !phoneSheet) return null;

  async function openSheet() {
    try {
      await navigator.share({ title, url });
      track(blogId, "native");
    } catch {
      // The reader closed the sheet: nothing was shared, nothing to count.
    }
  }

  async function copy() {
    if (!(await copyText(url))) return;
    track(blogId, "copy");
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  const shown = phoneSheet ? buttons.filter(button => button.platform === "copy") : buttons;

  return (
    <div className="share-bar" aria-label="Share this post">
      <span className="share-label">Share</span>
      {phoneSheet ? (
        <button className="reaction-button" type="button" onClick={openSheet}>
          Share…
        </button>
      ) : null}
      {shown.map(button =>
        button.platform === "copy" ? (
          <button key={button.platform} className="reaction-button" type="button" onClick={copy}>
            {copied ? "Copied ✓" : button.label}
          </button>
        ) : (
          <a
            key={button.platform}
            className="reaction-button"
            href={button.href}
            {...(button.platform === "email" ? {} : { target: "_blank", rel: "noopener noreferrer" })}
            onClick={() => track(blogId, button.platform)}
          >
            {button.label}
          </a>
        ),
      )}
    </div>
  );
}
