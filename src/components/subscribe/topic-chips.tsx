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
  const all = offers && topics.every(topic => chosen.includes(topic._id));
  return (
    <fieldset className="topic-chips">
      <legend>
        Choose your topics
        <button className="topic-all" type="button" onClick={() => (all ? onChange([], false) : onChange(topics.map(topic => topic._id), true))}>
          {all ? "Clear all" : "Select all"}
        </button>
      </legend>
      {topics.map(topic => (
        <label key={topic._id} className={chosen.includes(topic._id) ? "on" : undefined}>
          <input type="checkbox" checked={chosen.includes(topic._id)} onChange={() => toggle(topic._id)} />
          {topic.name}
        </label>
      ))}
      <label className={offers ? "topic-offers on" : "topic-offers"}>
        <input type="checkbox" checked={offers} onChange={() => onChange(chosen, !offers)} />
        <span>
          <b>Offers &amp; discounts</b>
          <small>Occasional deals on our services</small>
        </span>
      </label>
    </fieldset>
  );
}
