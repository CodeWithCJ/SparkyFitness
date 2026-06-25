# Phase 6 — Opt-in Data Enrichment (RxNorm / openFDA / DailyMed)

> **Status:** ☐ not started
> **Depends on:** Phase 1 · **Unblocks:** richer Cabinet/Drug-info
> **Resume here:** _(update as you go)_

## Goal
Add "wow" autocomplete, drug-info sheets, barcode lookup, and best-effort interaction checks —
all **opt-in**, sending only a drug name or NDC to public US-gov APIs. **No PHI ever leaves the box.**

## User stories
- As a user, I enable "online drug lookups" in Settings (off by default) and get name autocomplete.
- I open a drug-info sheet (uses, dosage, warnings) for a med.
- I scan an NDC barcode to identify/add a med.
- I see a best-effort interaction warning with a clear "not medical advice" disclaimer.

## Functional spec
- Settings toggle gating all of this; endpoints 403 when off.
- **RxNorm** autocomplete + normalize; store `rxnorm_rxcui`.
- **openFDA / DailyMed** drug-info sheet on med detail.
- **NDC barcode scan** → DailyMed/RxNorm resolve (web camera; finicky GS1 DataMatrix — mobile-preferred).
- **Interaction check** via openFDA label text or bundled **DDInter** dataset (NLM interaction API is discontinued). Prominent disclaimer.
- **Resource center** = curated static links.
- Cache lookups server-side to be polite to public APIs.

## Data needs
`rxnorm_rxcui` / `ndc` on `medications`; a small interaction dataset (if bundling DDInter); a
lookup cache table; the enrichment setting flag.

## UI components
- New: DrugSearchAutocomplete, DrugInfoSheet, BarcodeScanner, InteractionBanner, ResourceCenter, EnrichmentSettings.

## Acceptance criteria
- [ ] With setting off, no external calls happen (verify endpoints 403 + UI hides).
- [ ] Autocomplete returns RxNorm matches; RxCUI stored.
- [ ] Drug-info sheet renders openFDA/DailyMed sections.
- [ ] Barcode scan resolves a known NDC.
- [ ] Interaction check returns a result + disclaimer; clearly informational.
- [ ] Only drug name/NDC is sent externally (verify in logs/network).
- [ ] `pnpm run validate` + tests pass.

## Privacy notes
User-facing copy from [`../../01-feasibility-selfhosted.md`](../../01-feasibility-selfhosted.md). Never send identity, doses, schedule, or symptoms externally.

## Resume-here notes
_(breadcrumb)_
