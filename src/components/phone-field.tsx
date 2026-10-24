"use client";

export type PhoneCountry = { code: string; label: string; digits: number };
export type PhoneValue = { countryCode: string; phone: string };

/** Country code + mobile number. The portal backend validates and stores it as +<code><number>. */
export function PhoneField({ countries, value, onChange, className }: { countries: PhoneCountry[]; value: PhoneValue; onChange: (value: PhoneValue) => void; className?: string }) {
  const selected = countries.find(row => row.code === value.countryCode) ?? countries[0];
  return (
    <label className={className}>
      <span>Mobile number</span>
      <span className="phone-field-row">
        <select aria-label="Country code" value={selected.code} onChange={event => onChange({ countryCode: event.target.value, phone: value.phone })}>
          {countries.map(row => <option key={row.code} value={row.code}>{row.label} ({row.code})</option>)}
        </select>
        <input
          type="tel"
          inputMode="numeric"
          aria-label="Mobile number"
          value={value.phone}
          onChange={event => onChange({ countryCode: selected.code, phone: event.target.value.replace(/[^\d\s-]/g, "") })}
          placeholder={`${selected.digits}-digit number`}
          required
          autoComplete="tel-national"
        />
      </span>
    </label>
  );
}
