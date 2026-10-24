import "server-only";
import { portalApiRequest } from "@/lib/portal-api";
import type { PhoneCountry } from "@/components/phone-field";

// The portal backend owns the list and validates numbers (backend helpers/phoneNumber.js).
// If it cannot be reached, India stays available so the form still renders.
const FALLBACK: PhoneCountry[] = [{ code: "+91", label: "India", digits: 10 }];

export async function phoneCountries(): Promise<PhoneCountry[]> {
  try {
    const rows = await portalApiRequest<PhoneCountry[]>("Phone countries", "/api/phone-countries");
    return rows?.length ? rows : FALLBACK;
  } catch {
    return FALLBACK;
  }
}
