"use client";

/**
 * Deletes one of the author's own drafts. The API decides who may delete
 * (canDelete in blog-rules.ts); this only asks for confirmation first.
 */

import { useNavigate, useTask } from "@/components/loading/navigation";
import { useState } from "react";

export function DeleteDraft({ id }: { id: string }) {
  const router = useNavigate();
  const { busy, track } = useTask();
  const [error, setError] = useState("");

  async function remove() {
    if (!window.confirm("Delete this draft permanently?")) return;
    await track(async () => {
      setError("");
      const response = await fetch(`/api/blogs/${id}`, { method: "DELETE" });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error ?? "Could not delete this draft.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <>
      <button className="my-post-delete" type="button" disabled={busy} onClick={remove}>
        {busy ? "Deleting…" : "Delete draft"}
      </button>
      {error ? <span className="form-error">{error}</span> : null}
    </>
  );
}
