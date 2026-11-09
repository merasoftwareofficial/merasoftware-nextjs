import { permanentRedirect } from "next/navigation";

// "/offer" and "/offers" open the same offers page (app/offers/page.tsx). An offer's own page stays at
// /offer/<slug> (app/offer/[slug]).
export default function Page() { permanentRedirect("/offers"); }
