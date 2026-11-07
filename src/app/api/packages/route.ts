import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api";
import { requireSameOrigin } from "@/lib/portfolio/integration-auth";
import { readSalesCatalogue, requireSalesAdmin, salesBackend } from "@/lib/sales-catalogue-server";
import { settingsRepo } from "@/lib/repo";
import { offerSchema, resolvedOffers, type Offer } from "@/lib/offers";
import { busyPackageMessage, offerOutOfSync, offerRunning, packageOfferProblem, runningOfferForPackage, syncOfferWithPackage, type PackageSource } from "@/lib/offer-packages";
import { packageDesignSchema } from "@/lib/package-design";
import { createPackageOffer, saveOfferRecord } from "@/lib/offer-save-server";
export async function GET() {
  try { return NextResponse.json(await readSalesCatalogue(true), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return errorResponse(error); }
}
// The offer part of a package form save (src/docs/package-offers.md): a new offer has no link yet (it is
// made from its name), an existing one names its link.
// The offer itself is checked by offerSchema once its package values are applied (below).
const offerPart = z.object({ creating: z.boolean(), offer: z.record(z.string(), z.unknown()) }).strict();
// Publishing from a working copy (api/packages/drafts): the copy is removed once published, only if nobody saved
// a newer one. An offer still marked draft is not published; it stays in the copy (keepOffer) with the package.
const draftPart = z.object({ version: z.number().int().min(0), keepOffer: z.record(z.string(), z.unknown()).optional() }).strict();
const draftsPath = "sales-packages/drafts";

// The one package form: a package, optionally with its offer. A package owns its offer's struck prices,
// included work, terms and page design (lib/offer-packages.ts, lib/package-design.ts). Everything is
// checked first; then the package is saved in the portal and, after it, the offer on the website.
export async function PATCH(request: Request) {
  try {
    requireSameOrigin(request);
    await requireSalesAdmin();
    const body = await request.json();
    const item = body?.item as PackageSource & { design?: unknown; offerExtraPrice: number } | undefined;
    if (!item || (typeof item.id !== "string" && item.id !== undefined)) return NextResponse.json(await salesBackend(true, body));
    if (item.design !== undefined) {
      const design = packageDesignSchema.safeParse(item.design);
      if (!design.success) return NextResponse.json({ error: `Page design: ${design.error.issues[0]?.message ?? "check the fields"}` }, { status: 400 });
      item.design = design.data;
    }
    const part = body.offer === undefined ? null : offerPart.safeParse(body.offer);
    if (part && !part.success) return NextResponse.json({ error: `Offer: ${part.error.issues[0]?.message ?? "check the fields"}` }, { status: 400 });
    const draftInput = body.draft === undefined ? null : draftPart.safeParse(body.draft);
    if (draftInput && !draftInput.success) return NextResponse.json({ error: "Reload the package and try again." }, { status: 400 });
    const draft = draftInput?.success ? draftInput.data : null;
    // The extra scope charge belonged to older shared offers; an offer made here must show the price paid.
    if (part) item.offerExtraPrice = 0;
    const offers = resolvedOffers((await settingsRepo.get()).offers);
    const catalogue = body.creating && !draft ? undefined : await readSalesCatalogue(true);
    const previous = body.creating ? undefined : catalogue!.packages.find(row => row.id === item.id);
    if (!body.creating && !previous) return NextResponse.json({ error: "Package not found. Refresh and try again." }, { status: 404 });
    // Publishing an older copy would overwrite a newer draft someone else saved.
    if (draft && (catalogue!.drafts ?? []).find(row => row.packageId === item.id)?.version !== (draft.version || undefined)) return NextResponse.json({ error: "Someone else saved this draft meanwhile. Reload the package to see their changes." }, { status: 409 });
    const now = Date.now();
    // Check the offer against the package as it will be saved, before anything is written.
    let offerInput: Offer | null = null;
    if (part?.success) {
      const raw = part.data.offer as Partial<Offer>;
      const draft = { ...raw, packageId: part.data.creating ? (item.id || "new-package") : raw.packageId, slug: part.data.creating ? "new-offer" : raw.slug } as Offer;
      if (!part.data.creating && !offers.some(row => row.slug === draft.slug && row.packageId === item.id)) return NextResponse.json({ error: "This offer is not on this package." }, { status: 400 });
      const problem = packageOfferProblem(draft, { ...item, id: draft.packageId!, status: item.status });
      if (problem) return NextResponse.json({ error: problem }, { status: 400 });
      const synced = syncOfferWithPackage(draft, { ...item, id: draft.packageId! });
      const checked = offerSchema.safeParse(synced);
      if (!checked.success) return NextResponse.json({ error: `Offer: ${checked.error.issues[0]?.message ?? "check the fields"}` }, { status: 400 });
      if (offerRunning(synced, now) && item.id) {
        const busy = runningOfferForPackage({ id: item.id, offerSlug: previous?.offerSlug ?? "" }, offers, now, part.data.creating ? undefined : draft.slug);
        if (busy) return NextResponse.json({ error: busyPackageMessage(item, busy) }, { status: 409 });
      }
      offerInput = checked.data;
    }
    const running = item.id ? runningOfferForPackage({ id: item.id, offerSlug: previous?.offerSlug ?? "" }, offers, now) : undefined;
    // Ending (or editing) the running offer in this same save is checked with the offer that is being saved.
    const endingRunning = running && offerInput && !part!.data.creating && offerInput.slug === running.slug && !offerRunning(offerInput, now);
    if (running && !endingRunning) {
      if (running.packageId && previous?.offerSlug !== running.slug) return NextResponse.json({ error: `The running offer "${running.title}" is not linked to this package yet. Save the package again to link it.` }, { status: 409 });
      if (item.status === "archived" || item.offerSlug !== running.slug) return NextResponse.json({ error: `${busyPackageMessage(item, running)} A package with a running offer cannot be archived, moved to another category or linked to another offer.` }, { status: 409 });
      const problem = running.packageId ? packageOfferProblem(offerInput && offerInput.slug === running.slug ? { ...running, ...offerInput } : running, item) : null;
      if (problem) return NextResponse.json({ error: `This change does not fit the running offer "${running.title}": ${problem}` }, { status: 400 });
    }
    // A package offer is linked only from its own package form.
    const target = item.offerSlug ? offers.find(offer => offer.slug === item.offerSlug) : undefined;
    if (target?.packageId && target.packageId !== item.id) return NextResponse.json({ error: `"${target.title}" is the offer of another package. Create a new offer for this package instead.` }, { status: 400 });
    const saved = await salesBackend(true, { item, creating: !!body.creating }) as PackageSource;
    // Drafts follow their package too, so they open with current values; one that no longer fits (e.g. its
    // offer price is now above the package price) keeps its values until it is edited.
    const failed: string[] = [];
    for (const offer of offers.filter(row => row.packageId === saved.id && row.slug !== offerInput?.slug && offerOutOfSync(row, saved))) {
      if (packageOfferProblem(offer, saved)) { failed.push(offer.title); continue; }
      try { await settingsRepo.saveOffer(syncOfferWithPackage(offer, saved), false); }
      catch { failed.push(offer.title); }
    }
    let offerResult: Awaited<ReturnType<typeof saveOfferRecord>> | null = null;
    if (offerInput && part?.success) {
      offerResult = part.data.creating
        ? await createPackageOffer({ ...offerInput, packageId: saved.id, slug: undefined } as Omit<Offer, "slug">)
        : await saveOfferRecord({ ...offerInput, packageId: saved.id }, false);
    }
    // The working copy: kept as it was when the offer was not saved, so nothing typed is lost.
    let savedDraft: unknown = null;
    let draftError = "";
    if (draft && !(offerResult && !offerResult.ok)) {
      try {
        if (draft.keepOffer) savedDraft = await salesBackend(true, { action: "save", packageId: saved.id, version: draft.version, data: { item: saved, offer: draft.keepOffer } }, draftsPath);
        else if (draft.version > 0) await salesBackend(true, { action: "delete", packageId: saved.id, version: draft.version }, draftsPath);
      } catch (error) { draftError = error instanceof Error ? error.message : "The draft could not be updated."; }
    }
    // An ended offer leaves the copy too, so it is never published again from there.
    if (offerResult?.ok && offerResult.offer.status === "archived") {
      try { await salesBackend(true, { action: "clearOffer", packageId: saved.id, offerSlug: offerResult.offer.slug }, draftsPath); }
      catch (error) { draftError = error instanceof Error ? error.message : "The draft could not be updated."; }
    }
    return NextResponse.json({
      package: saved,
      draft: savedDraft,
      ...(draftError ? { draftError } : {}),
      offer: offerResult?.ok ? offerResult.offer : null,
      ...(offerResult && !offerResult.ok ? { offerError: offerResult.error } : {}),
      ...(offerResult?.ok && offerResult.linkError ? { linkError: offerResult.linkError } : {}),
      ...(failed.length ? { unsynced: failed } : {}),
    });
  }
  catch (error) { return errorResponse(error); }
}
