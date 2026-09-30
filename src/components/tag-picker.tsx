"use client";

import { useId, useState } from "react";
import { topicSlug } from "@/lib/topic-slug";

/**
 * Tags as removable chips, with the tags already in use offered as you type
 * (lib/tag-options.ts, most-used first). A new tag is still allowed: type it
 * and press Enter or a comma.
 *
 * `value` stays the comma-separated string the blog form saves, so the post
 * API is unchanged.
 */
export function TagPicker({ value, onChange, suggestions }: { value: string; onChange: (value: string) => void; suggestions: { name: string; uses: number }[] }) {
  const listId = useId();
  const [text, setText] = useState("");
  const tags = value.split(",").map(tag => tag.trim()).filter(Boolean);
  const chosen = new Set(tags.map(topicSlug));
  const offered = suggestions.filter(tag => !chosen.has(topicSlug(tag.name)));

  const add = (raw: string) => {
    const name = raw.trim().replace(/\s+/g, " ");
    setText("");
    if (!name || chosen.has(topicSlug(name))) return;
    // An existing tag keeps its usual spelling, so "SEO" and "seo" stay one topic.
    const known = suggestions.find(tag => topicSlug(tag.name) === topicSlug(name));
    onChange([...tags, known?.name ?? name].join(", "));
  };

  return (
    <div className="admin-field tag-picker">
      <label htmlFor={`${listId}-input`}>
        <span>Tags</span>
      </label>
      {tags.length ? (
        <ul className="tag-chips">
          {tags.map(tag => (
            <li key={tag}>
              {tag}
              <button type="button" aria-label={`Remove tag ${tag}`} onClick={() => onChange(tags.filter(item => item !== tag).join(", "))}>
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <input
        id={`${listId}-input`}
        list={listId}
        value={text}
        placeholder="Type to find a tag, Enter to add"
        onChange={event => {
          const next = event.target.value;
          // Picking from the list is not typing (no InputEvent, or a replacement);
          // add it straight away. Typing "SEO" on the way to "SEO basics" is not a pick.
          const native = event.nativeEvent;
          const picked = !(native instanceof InputEvent) || native.inputType === "insertReplacementText";
          if (picked && offered.some(tag => tag.name === next)) return add(next);
          if (next.endsWith(",")) return add(next.slice(0, -1));
          setText(next);
        }}
        onKeyDown={event => {
          if (event.key === "Enter") {
            event.preventDefault();
            add(text);
          }
        }}
        onBlur={() => add(text)}
      />
      <datalist id={listId}>
        {offered.map(tag => (
          <option key={tag.name} value={tag.name}>
            {`${tag.uses} post${tag.uses === 1 ? "" : "s"}`}
          </option>
        ))}
      </datalist>
      <small>Reuse an existing tag where one fits: a topic page opens to Google once two posts share it.</small>
    </div>
  );
}
