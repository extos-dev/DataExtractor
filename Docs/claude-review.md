I'll read the vision docs and the schema layer first, so my understanding comes from what's actually written.

## My understanding

The product is the **reusable extraction schema**. Auto-detection is the on-ramp that tries to produce a schema with no effort. When it falls short, the user takes over in edit mode with the DOM map and point-and-click. The saved schema is the durable asset. It records where it applies (domain, page pattern, page type), which region it targets, which fields it pulls and what output format it uses. It reappears as a one-click shortcut on the next visit, and it can come from auto-detection or be built by hand.

This changes how to judge the engine. Detection accuracy matters less than how reliably a saved schema replays on later visits. A mediocre detector with a strong correction and replay loop beats an excellent detector with fragile schemas.

## Where the code stands against that

I checked this by reading and grepping the code, not by running it. The detection side is well developed, but the schema side is a stub:

- **Nothing runs a schema.** `ExtractionSchema` and `SchemaStorage` are not referenced anywhere in the engine. `SchemaField.selector` is never evaluated.
- **`targetNodeId` can't persist.** Node IDs are counters (`n1`, `n2`, …) reset on every run, so the saved ID means nothing on the next visit.
- **The stability layer isn't used.** `SelectorStabilizer` and `RegionLocatorStore` are exported but unused, and the store is an in-memory `Map`. `SchemaStorage` has its own weaker `generateSelector`: it doesn't escape ids, it relies on the first two utility classes, and it stops at depth 5.
- **Field templates are incomplete.** `news_article`, `product_listing` and `documentation` fall through to a single `content` field.
- **Matching is too loose.** `getForPage` returns schemas by page type from any domain, with no ranking.

## Suggested improvements, most useful first

1. **Add a `SchemaRunner` to core.** `run(schema, root)` returns data plus diagnostics, such as how many fields matched and what was missing. This makes the schema real and testable.
2. **Model records, not only regions.** Real use is mostly repeating things such as listings, tables, feeds and search results. The model needs a container, an item selector and fields relative to each item, with output like `{items: [{title, price, url}]}`.
3. **Store locators instead of one selector string.** Use the existing ordered `RegionLocator[]` with text signatures, persisted with the schema. Fields get fallback selectors, optional transforms (trim, regex, number/currency/date, absolute URL) and defaults. Add a schema version.
4. **Build verification and healing.** On each replay, check that the schema landed on the right thing, track per-field success and show a status of healthy, degraded or broken. When it breaks, re-run autodetect within the saved kind and propose a repaired schema for the user to accept. This is what makes "last-run status" and trustworthy reuse possible.
5. **Cut authoring effort.**
   - Let the user click one example and have the system find its siblings by repetition.
   - Pre-fill fields from signals such as JSON-LD, `<time>`, `rel=author` and headings.
   - Show live "matches 18 of 20 items" feedback per field.
   - Infer a URL pattern like `/blog/:slug` instead of asking for a regex.
6. **Turn corrections into training data.** Each manual schema or fix is a labeled example. Snapshot the page and the expected result into a regression fixture, and feed the example to `ConfidenceCalibrator.train()`, which currently has nothing to train it. This also fixes the weak five-fixture test suite.
7. **Make schemas portable.** Support export and import as validated JSON, shared packs per site, run across a list of URLs with pagination or scrolling, and output to JSON, CSV or Markdown. Sharing multiplies the value of every schema someone builds.
8. **Rank schema matching.** Use domain+path first, then domain, then page type, and show why a schema matched.
9. **Narrow the detector scope.** Vision §1 lists inputs, bars, panels, badges and chips as detector targets. Detect extractable data shapes: record lists, tables, articles, detail pages, chat and entities. Show the UI chrome as filters in the DOM map rather than as detectors. Incremental re-detection and 60fps overlays should wait until the schema loop works.
10. **Handle dynamic pages.** Single-page apps, shadow DOM, iframes, lazy loading and pagination are a large share of real pages. Shadow DOM is currently only flagged, and the vision notes earlier ideas for scroll and pagination capture. Reuse fails quietly on these pages unless they are planned for.

## How my earlier findings affect this vision

- **Arbiter:** it needs to output a region tree rather than exclusive winners. Users will want a table inside an article, and that is the case it currently drops.
- **Hidden-text leak:** it hits the LLM Snapshot tab directly.
- **Link-density cap and substring noise selectors:** they corrupt the auto-detection that seeds auto-schemas.
- **Storage:** schemas should live in `chrome.storage` only. Page `localStorage` from a content script is readable by the page, and imported schemas need validation.

## Suggested success metrics

Track time to a first working schema, the share of auto-schemas accepted unedited, and the share of schemas that still work on a later visit.

I can draft a "Schema v2" spec (types, runner API and healing flow) plus the migration from the current `ExtractionSchema`. One question first: is the primary user a non-technical person pulling data for themselves, or someone feeding the output to LLMs and automations? That decides whether to prioritize guided authoring (item 5) or portability and batch runs (item 7).
