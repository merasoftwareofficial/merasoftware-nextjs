# Section visual ownership

- `src/lib/visual-slots.ts` owns stable IDs, page/section connections, dynamic entry mapping, frame defaults/recommendations and legacy layout defaults.
- `src/lib/visual-config.ts` resolves saved configs and provides the only legacy-data adapter. Existing `sectionVisuals[id]` always wins. Inactive IDs stay in storage but are not editable or rendered.
- `src/lib/section-visuals.ts` loads media for registry-selected page slots. All public section visuals use `SectionVisual`; all visual controls use `VisualsEditor` / `VisualFrameEditor`.
- `src/lib/visual-save.ts` validates visual writes and section ownership. Standalone, About/Services and Homepage routes keep their auth and transaction boundaries. JSON writes merge synchronously; Mongo merges literal dotted visual IDs atomically.
- `sectionVisuals[id]` is the canonical editable configuration. Existing external image URLs are supported without uploading or copying assets. Preview captions/destinations remain attached to their visual.

## Compatibility and migration

Legacy fields are read only by the shared adapter when no canonical config exists. Old fields and inactive configs are retained as archived data, not exposed as parallel editing paths. The old homepage image API returns 410; Homepage Work images come from Portfolio. Blog/Portfolio domain media keep their own ownership.

Run against the intended configured data driver:

```powershell
node --conditions=react-server --import tsx scripts/migrate-visual-ssot.ts
node --conditions=react-server --import tsx scripts/migrate-visual-ssot.ts --apply
```

Dry-run lists slot IDs only. Apply backs up settings under ignored `work1/visual-ssot-data-*`, then inserts missing canonical configs. Both drivers preserve existing canonical values, including concurrent edits; repeating migration is safe. The adapter keeps unmigrated installations compatible without public-page fallback branches.

`legacyLayout` preserves existing external-image proportions until an explicit frame/crop edit. Existing saved frame/crop configs are never reset by migration. Page CSS supplies column layout and theme; registered visual ratios/padding and explicit frame/crop geometry belong to the shared system.

## Verification

`npm run test:content` covers registry connections, defaults, legacy resolution, schema validation, migration precedence/idempotence and JSON/Mongo atomic writes. `npm run test:content:browser` runs actual editor/page/route source with isolated local auth/navigation fixtures, covering external URLs/captions/links, Homepage shared controls, image/video crop, desktop/mobile dimensions, mouse/touch dragging, reset actions, save/reload and ownership checks. Follow with TypeScript, changed-file lint and a production build.
