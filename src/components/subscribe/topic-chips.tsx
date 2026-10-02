"use client";

export type Topic = { _id: string; name: string };

/** The blog categories plus Offers as tick-chips; shared by the subscribe box and the preference page. */
export function TopicChips({
  topics,
  chosen,
  offers,
  onChange,
}: {
  topics: Topic[];
  chosen: string[];
  offers: boolean;
  onChange: (chosen: string[], offers: boolean) => void;
}) {
  const toggle = (id: string) => onChange(chosen.includes(id) ? chosen.filter(item => item !== id) : [...chosen, id], offers);
  return (
    <fieldset className="topic-chips">
      <legend>Topics you want</legend>
      {topics.map(topic => (
        <label key={topic._id} className={chosen.includes(topic._id) ? "on" : undefined}>
          <input type="checkbox" checked={chosen.includes(topic._id)} onChange={() => toggle(topic._id)} />
          {topic.name}
        </label>
      ))}
      <label className={offers ? "on" : undefined}>
        <input type="checkbox" checked={offers} onChange={() => onChange(chosen, !offers)} />
        Offers
      </label>
    </fieldset>
  );
}
