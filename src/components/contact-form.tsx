"use client";

import { useRef, useState } from "react";
import { PhoneField, type PhoneCountry, type PhoneValue } from "@/components/phone-field";
import s from "./contact-form.module.css";

const PROJECT_OPTIONS = [
  "Website Development",
  "Mobile App",
  "Business Software / CRM",
  "SEO & Online Visibility",
  "Social Media & Marketing",
  "Other",
];

export function ContactForm({ countries }: { countries: PhoneCountry[] }) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [project, setProject] = useState(PROJECT_OPTIONS[0]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState<PhoneValue>({ countryCode: countries[0]?.code || "+91", phone: "" });
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/contact-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project,
          name: name.trim(),
          email: email.trim(),
          countryCode: phone.countryCode,
          phone: phone.phone.trim(),
          message: message.trim(),
          website,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setError(data?.error || "Could not submit your request. Please try again.");
        return;
      }
      setName("");
      setEmail("");
      setPhone({ countryCode: countries[0]?.code || "+91", phone: "" });
      setMessage("");
      dialogRef.current?.showModal();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <form className={s.card} onSubmit={onSubmit}>
        <div className={s.row}>
          <label className={s.field}>
            <span>Your name</span>
            <input
              className={s.control}
              type="text"
              required
              maxLength={100}
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Enter your full name"
            />
          </label>

          <label className={s.field}>
            <span>Email address</span>
            <input
              className={s.control}
              type="email"
              required
              maxLength={160}
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@company.com"
            />
          </label>
        </div>

        <label className={s.field}>
          <span>What do you need?</span>
          <select className={s.control} value={project} onChange={e => setProject(e.target.value)}>
            {PROJECT_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        </label>

        <PhoneField className={s.field} countries={countries} value={phone} onChange={setPhone} />

        <label className={s.field}>
          <span>Project details (optional)</span>
          <textarea
            className={`${s.control} ${s.textarea}`}
            rows={3}
            maxLength={1000}
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="Briefly tell us about your requirement"
          />
        </label>

        <div className="subscribe-trap" aria-hidden="true">
          <label>Website<input tabIndex={-1} autoComplete="off" value={website} onChange={e => setWebsite(e.target.value)} /></label>
        </div>

        {error ? <p role="alert" className={s.error}>{error}</p> : null}

        <button type="submit" className={`button button-dark ${s.submit}`} disabled={busy}>
          {busy ? "Submitting…" : "Submit request"} <span>→</span>
        </button>
      </form>

      <dialog
        ref={dialogRef}
        className={s.dialog}
        aria-labelledby="contact-submitted-title"
        onClick={e => { if (e.target === e.currentTarget) dialogRef.current?.close(); }}
      >
        <h2 id="contact-submitted-title">Request submitted</h2>
        <p>Your request has been submitted. Our team will contact you soon.</p>
        <button type="button" className={`button button-dark ${s.dialogBtn}`} onClick={() => dialogRef.current?.close()}>
          OK <span>✓</span>
        </button>
      </dialog>
    </>
  );
}
