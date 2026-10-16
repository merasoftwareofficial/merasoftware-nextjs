/** Website time policy: persisted instants are UTC; all human dates/inputs use IST. */
export const INDIA_TIME_ZONE = "Asia/Kolkata";
export type DateValue = string | number | Date | null | undefined;
const validDate = (value: DateValue) => {
  if (value === null || value === undefined || value === "") return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
};
export function formatIndiaDate(value: DateValue, options: Intl.DateTimeFormatOptions = {}) {
  const date = validDate(value);
  return date ? new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", ...options, timeZone: INDIA_TIME_ZONE }).format(date) : "—";
}
export function formatIndiaDateTime(value: DateValue, options: Intl.DateTimeFormatOptions = {}) {
  const date = validDate(value);
  return date ? `${new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true, ...options, timeZone: INDIA_TIME_ZONE }).format(date)} IST` : "—";
}
export function indiaDayKey(value: DateValue = Date.now()) {
  const date = validDate(value);
  if (!date) return "";
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: INDIA_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const part = (name: string) => parts.find(p => p.type === name)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function toIndiaInput(value: DateValue) {
  const date = validDate(value);
  if (!date) return "";
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: INDIA_TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  return `${indiaDayKey(date)}T${parts.find(p => p.type === "hour")!.value}:${parts.find(p => p.type === "minute")!.value}`;
}
/** datetime-local is a wall clock, never parse it in the browser's own timezone. */
export function indiaInputToUtc(value: string, endOfMinute = false) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error("Enter a valid India date and time.");
  const date = validDate(`${value}:${endOfMinute ? "59.999" : "00"}+05:30`);
  if (!date || toIndiaInput(date) !== value) throw new Error("Enter a valid India date and time.");
  return date.toISOString();
}
