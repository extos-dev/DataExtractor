# TabWize Data Extractor — Master Project Specification v1.0

Status: build-ready. Supersedes the "Phase 1–5" plan in `VISION.md` and the Clixad scaffold. `VISION.md` stays as the product narrative; this document is the engineering contract.
Date: 2026-10-25.

---

## 0. How to read this document

- §1–2 say what we are building and why. §3 records what the audit of the existing code and both reviews concluded.
- §4–8 are the technical specification: architecture, engine, schema, extension, dynamic pages.
- §9–11 are storage/security, testing, and the build roadmap with acceptance criteria.
- §12 seeds `DECISIONS.md` and `CHARTER.md`. §13 lists risks and the few open questions.
- Requirement keywords: **MUST** = launch-blocking, **SHOULD** = expected but can slip one release, **MAY** = optional.
- Each requirement has an ID (e.g. `ENG-03`) so tasks and tests can reference it.

---

## 1. Product definition

### 1.1 One-line product
A Chrome extension (backed by a reusable TypeScript engine) that **turns any web page region into a reusable, self-healing extraction schema** — automatically when it can, by point-and-click when it can't — and outputs clean JSON / Markdown / LLM context.

### 1.2 The core insight (from the audit)
**The saved schema is the product. Detection is the on-ramp.** A mediocre detector with a strong correction → save → replay → heal loop beats an excellent detector with fragile schemas. Therefore:
- Success is measured by *schemas that still work on a later visit*, not by detection F1 alone.
- Engineering order is: trustworthy engine contracts → schema runner → extension authoring loop → polish.

### 1.3 Primary users (decision, flagged in §13)
1. **Primary — "LLM/automation feeder":** builders who want clean, structured, token-efficient page data for LLMs, agents and scripts (indie hackers, agent developers).
2. **Secondary — "data puller":** non-technical users extracting lists/tables for themselves (CSV/JSON).
Guided authoring (§6.5) serves both; portability and batch runs (§5.9) are weighted toward the primary user.

### 1.4 Principles
1. **Schema-first.** Every successful extraction can become a schema in one click.
2. **Progressive.** Classify the page → run type-prioritized detectors → let the human correct.
3. **Never mutate the live page** (no DOM edits besides our own isolated overlay host).
4. **Evidence over selectors.** Detectors emit scored candidates with evidence; no fixed confidences.
5. **Honest confidence.** Uncalibrated scores are labeled as such.
6. **Fail loudly, heal gently.** Every run returns diagnostics; broken schemas are detected and repairs are *proposed*, never silently applied.
7. **Local-first and private.** No page data leaves the device in v1.

### 1.5 Non-goals for v1.0
- Cloud sync, accounts, hosted scraping, scheduled crawling.
- Headless/server runtime for the extension (the core library works under Node + happy-dom/Playwright but is not a supported product surface in v1).
- Detecting every UI widget (inputs, bars, panels) as extraction targets (see §4.4 tiering).
- Firefox/Safari builds.
- Bypassing logins, paywalls or bot protection.

### 1.6 Success metrics (instrument locally, review in beta)
| Metric | Launch target |
|---|---|
| Time from install to first working schema (median) | ≤ 3 min |
| Auto-created schemas accepted without edits | ≥ 60% on fixture corpus; track in beta |
| Schemas that still run "healthy" on a later visit (7-day) | ≥ 85% |
| Broken schemas repaired by a healing proposal accepted by user | ≥ 50% |
| Detection p95 latency, ≤5k elements | ≤ 150 ms |
| Fixture corpus pass rate | ≥ 90% (see §10) |

---

## 2. Product surface (what the user sees)

### 2.1 Side panel (four tabs, persistent header)
Header: site favicon + hostname, **Mode toggle** (Default ⇄ Edit), health pill of the currently matched schema.

1. **Page** — page type with probability distribution (override dropdown), detected regions grouped by kind with confidence, **Schemas for this page** (ranked, with "why matched", last-run status, Run / Edit / Duplicate / Delete), and a "Create schema" action.
2. **DOM Map** — DevTools-like tree (§6.4).
3. **LLM Snapshot** — cleaned page/region output as Markdown or JSON, token estimate, copy/download.
4. **Settings** — detection thresholds, output defaults, shortcuts, import/export schemas, privacy.

### 2.2 Modes
- **Default mode:** no overlays on the page; results only.
- **Edit mode:** hover/selection overlays, click-to-inspect, bidirectional sync with DOM Map, authoring tools.

### 2.3 Core user flows
1. **Auto path:** page loads → classify → detect → panel shows page type + regions + (if a saved schema matches) a one-click "Run" shortcut. "Save as schema" turns a detected region into a schema.
2. **Manual path (detection failed):** toggle Edit → pick area via page click or DOM Map → "Create schema from selection" → example-driven authoring (§6.5) → live match feedback → save.
3. **Replay:** revisit a matching page → ranked schema shortcut → Run → data + health status.
4. **Heal:** run reports *degraded/broken* → "Propose repair" → diff preview → accept/reject.
5. **Share:** export schema/pack as JSON; import with validation (§5.8).

---

## 3. Audit conclusions (inputs to this spec)

### 3.1 What exists and is kept
The `src/` engine is a coherent pipeline: `DomPruner → DomNormalizer → BlockSegmenter → RegionGrouper → ContextBuilder → Detectors → RegionArbiter → PageClassifier → ConfidenceCalibrator → ExtractionMapper → Markdown/LLM formatters`, plus `EvaluationHarness`, `OverlayManager`, `SelectorStabilizer`/`RegionLocatorStore`, and a schema stub (`ExtractionSchema`, `SchemaStorage`). The architecture (scored candidates, evidence, context object, plugin contract) is **kept**. It is refactored, not rewritten.

### 3.2 Reviews: what was adopted and rejected
| Source | Adopted | Rejected |
|---|---|---|
| Clixad review | Resolve library-vs-extension identity (monorepo); engine before UI; populate DECISIONS/CHARTER; performance budget; real-browser integration tests; typed message protocol; page-type *distribution*; schema storage abstraction | Its replacement scaffold: `Math.random` node IDs, O(n²) `features.find`, a normalizer that still holds clones, Playwright test that runs `DOMParser` in Node, a rewrite that discards working code |
| Claude review | Schema is the product; `SchemaRunner`; records model; locator sets + fallbacks + transforms; verification/healing; authoring by example; corrections → fixtures/calibration; portability; ranked matching; narrow detector scope; dynamic pages; `chrome.storage` only | — |

### 3.3 Defects found in the current code (fix list — Phase 0/1)
| ID | Defect | Location | Fix (spec §) |
|---|---|---|---|
| D-01 | **Elements are detached clones.** Pruner clones the DOM; every candidate/overlay/schema refers to clone nodes, so `getBoundingClientRect()` is always 0 and computed style is meaningless. | `DomPruner`, `DomNormalizer`, `OverlayManager` | Live, non-mutating snapshot (§4.2) |
| D-02 | **Hidden text leaks.** Hidden nodes are only tagged `data-tx-pruned`; their text still enters word counts, markdown and LLM output. | `DomPruner` | Exclude hidden subtrees during traversal (§4.2) |
| D-03 | **Substring noise selectors delete real content** (`[class*="consent"]`, `sponsor`, `advert`, `[role=presentation]`, `aria-hidden` wrappers). | `DomPruner` | Replace deletion with boilerplate scoring (§4.4) |
| D-04 | **`product` regions are never produced.** `RegionGrouper` has no product grouper; `ProductDetector` only works via a JSON-LD fallback anchored to `main`/`body`. | `RegionGrouper`, `ProductDetector` | Product-detail grouper (§4.4) |
| D-05 | **Regex typo** `/\/(blog\|news\|…)\/i/i` makes the URL signal never fire. | `ArticleDetector` | Fix; centralize URL rules (§4.6) |
| D-06 | **Arbiter drops nested regions and ranks by raw score.** Table-in-article is lost; inflated surface scores can beat content. | `RegionArbiter`, `SurfaceDetector` | Region tree arbitration (§4.5) |
| D-07 | **Text truncated to 500 chars before stats**, then `linkText` (untruncated) is divided by truncated text → wrong link density, word counts capped. | `DomNormalizer` | Compute on full text; store preview separately (§4.2) |
| D-08 | `aggregateChildFeatures` takes `max(self, sum(children))` over values that are already subtree totals — a no-op that misleads. | `DomNormalizer` | Remove |
| D-09 | One article region emitted **per paragraph anchor** (duplicates). | `RegionGrouper.groupArticles` | Group once per container (§4.4) |
| D-10 | Unweighted mean link density; hard cap 0.55 rejects legitimate link-rich prose. | `RegionGrouper` | Text-weighted density, soft penalty (§4.4) |
| D-11 | `SurfaceDetector` lifts weak scores to ≥0.4 and uses `as any`. | `SurfaceDetector` | Demote UI chrome to Tier 3 (§4.4) |
| D-12 | Calibrator never trained; fallback `×0.85` is reported as "calibrated". | `ConfidenceCalibrator` | `calibrated:false` flag; train from corpus (§4.7) |
| D-13 | `SchemaStorage` uses page `localStorage` from content-script context, weak selector generator, loose `getForPage`, persists counter `nodeId`s. | `schema/*` | Schema v2 + background-only storage (§5, §9) |
| D-14 | Stability layer unused; `RegionLocatorStore` is an in-memory Map; three duplicate selector generators exist. | `stability/*`, `schema/*`, `visual/*` | One locator module used by everything (§5.4) |
| D-15 | Tests: 5 synthetic fixtures; fixtures built with a separate happy-dom `Window` (instanceof mismatches); "perfect score" gate is brittle; no layout. | `tests/*` | Corpus + Playwright (§10) |
| D-16 | `ProductGridDetector` fallback uses `:root > …` selectors inside element scope; card counting is heuristic-only. | `ProductGridDetector` | Use repetition mining (§4.4) |
| D-17 | `PageClassifier` sums unbounded scores into one label; `table→dashboard`, `form→landing_page` mappings are weak. | `PageClassifier` | Probability distribution (§4.6) |
| D-18 | Shadow DOM is only flagged, and `cloneNode` loses shadow roots. | `DomPruner` | Open shadow traversal (§7) |

> The extension sources (`extension/background.ts`, `content.ts`, `sidepanel.ts`) were not in the reviewed material. This spec treats the extension as **to be rebuilt** against §6. Reuse whatever fits; do not let existing code constrain the contracts.

---

## 4. Engine specification (`@tabwize/core`)

### 4.1 Pipeline
```
Live DOM ──► Snapshot (read-only, live refs)
          ──► Block segmentation (+ repetition mining)
          ──► Region grouping
          ──► Detectors (scored candidates + evidence)
          ──► Arbitration (region TREE)
          ──► Page classification (probability distribution)
          ──► Typed extraction (ExtractionMapper)
          ──► Formatters (JSON / Markdown / LLM context)
```
Each stage is a pure function over the previous stage's output (plus options). No stage mutates the page.

### 4.2 Snapshot layer (replaces `DomPruner` + `DomNormalizer`) — fixes D-01, D-02, D-07, D-08, D-18
- **ENG-01 MUST** Traverse the **live** document; never clone the whole page. `SnapNode.element` is the live element.
- **ENG-02 MUST** Skip, during traversal (not by deletion): `script`, `style`, `noscript`, `template`, hidden subtrees (`hidden`, `display:none`, `visibility:hidden`, `opacity:0`, zero-size with `overflow:hidden`, `inert`). `aria-hidden="true"` marks a node `a11yHidden` but does not exclude it unless also visually hidden.
- **ENG-03 MUST** Keep `script[type="application/ld+json"]`, `meta` (OG/Twitter/description) and `link[rel=canonical]` as page metadata; never as content text.
- **ENG-04 MUST** Compute `textLength`, `wordCount`, `linkTextLength`, `linkDensity` from **full** subtree text (own visible text, excluding skipped subtrees). Store `textPreview` (≤ 300 chars) separately.
- **ENG-05 MUST** Features are computed bottom-up in **one pass** (O(n)); no per-node `querySelectorAll`.
- **ENG-06 MUST** Open shadow roots are traversed as part of the tree (`SnapNode.shadowHost: true`). Same-origin iframes are separate scopes (§7). Closed shadow roots and cross-origin iframes are reported in `stats.opaqueBoundaries`.
- **ENG-07 MUST** Node IDs are per-run counters (`n1…`). They are **never persisted**. Persistence uses locators (§5.4).
- **ENG-08 SHOULD** Geometry (`getBoundingClientRect`) is read lazily and batched (one layout read pass) only for nodes that become blocks/regions.
- **ENG-09 MUST** Hard caps: 25 000 nodes, depth 80, per-node text cap 20 000 chars. Exceeding caps sets `stats.truncated=true` (never throws).
- **ENG-10 MUST** Time-slice: if a run would exceed 50 ms of continuous main-thread time, yield (`scheduler.yield()` / `MessageChannel` fallback) between phases.

```ts
interface SnapNode {
  id: string;                       // per-run only
  parentId?: string;
  element: Element;                 // LIVE reference
  tag: string; role?: string; elId?: string; classes: string[];
  depth: number; childIds: string[];
  visibility: 'visible' | 'a11yHidden' | 'hidden';
  stats: {
    textLength: number; wordCount: number; punctuation: number;
    linkTextLength: number; linkCount: number; linkDensity: number;
    imageCount: number; inputCount: number; buttonCount: number;
    headingCount: number; paragraphCount: number; tableCount: number; listCount: number;
  };
  textPreview: string;
  semantic: { landmark?: 'main'|'nav'|'header'|'footer'|'aside'|'article'|'form'|'search';
              jsonLdTypes: string[]; microdataType?: string; ariaLabel?: string };
  shadowHost?: boolean;
  rect?: { x: number; y: number; width: number; height: number };   // lazy
}
interface Snapshot {
  root: string; nodes: Map<string, SnapNode>;
  page: PageMetadata; jsonLd: unknown[];
  stats: { nodeCount: number; skipped: number; hidden: number; truncated: boolean;
           opaqueBoundaries: number; durationMs: number };
}
```

### 4.3 Segmentation and repetition mining (`BlockSegmenter`)
- **ENG-11 MUST** Block kinds (Tier 1/2 only): `paragraph, heading, list, table, record_group, chat_message, form, media, navigation, breadcrumb, pagination, code`.
- **ENG-12 MUST** `record_group` replaces `card_grid`: a parent whose children cluster into one dominant **structural fingerprint** (tag shape, normalized class tokens with digits/hashes stripped, field-presence vector: image/link/heading/price/date, size buckets). Dominant-cluster ratio ≥ 0.6 and ≥ 3 items. Output includes `itemNodeIds` (real IDs, not synthetic strings) and the field-presence vector.
- **ENG-13 MUST** Chat role inference is evidence-ranked (explicit `data-*` role → ARIA → class tokens → alternating pattern + alignment), never raw `outerHTML` regex.
- **ENG-14 MUST** Tier-3 UI chrome (`input, composer, bar, panel, action`) is **not** produced by the segmenter in v1. The composer check lives inside `AiChatDetector` as evidence; chrome kinds appear only as DOM Map badges computed on demand (§6.4).

### 4.4 Region grouping and detectors — fixes D-03, D-04, D-09, D-10, D-11, D-16
**Tiers**
- **Tier 1 (extractable data; produce schemas):** `article`, `product` (detail), `record_list` (listings, feeds, search results; replaces `product_listing`/`blog_index` as generic form with a `flavor` field), `table`, `ai_chat`, `entities` (emails, phones, social links, addresses, JSON-LD/OG).
- **Tier 2 (context/filters):** `navigation`, `breadcrumb`, `pagination`, `form`, `media`, `list` (generic), `sidebar`, `comments`, `boilerplate`.
- **Tier 3 (chrome, DOM-map only):** `input`, `composer`, `bar`, `panel`, `action`.

**Requirements**
- **ENG-20 MUST** Group **once per container**: pick the lowest common ancestor that contains the prose cluster; no per-paragraph duplicates.
- **ENG-21 MUST** Link density is text-weighted over member blocks; it is a *soft penalty*, never a hard rejection.
- **ENG-22 MUST** Add the `product` grouper: price signal (JSON-LD offer, `itemprop=price`, currency regex) + title (h1/itemprop name) + media + commerce action within one container; JSON-LD `Product` is a strong prior validated against the DOM region (it must not anchor to `body`).
- **ENG-23 MUST** Replace noise *deletion* with a `boilerplate` classifier (score by landmark, class/id tokens matched as **whole tokens** like `cookie-banner`, position, link density, repetition across the page). Boilerplate regions are excluded from content stats and flagged, not removed from the snapshot.
- **ENG-24 MUST** Every detector implements:

```ts
interface DetectorPlugin {
  id: string; version: string; kinds: RegionKindT1T2[];
  applies(ctx: DetectionContext): boolean;          // cheap prefilter
  detect(ctx: DetectionContext): Candidate[];       // never throws; budgeted
}
interface Candidate {
  detectorId: string; kind: RegionKind; regionId?: string;
  nodeId: string; element: Element;                 // live
  score: number;                                    // raw 0..1, ranking only
  evidence: Evidence[];                             // signal, weight, value, explanation
  fields: Record<string, FieldCandidate>;           // prefilled field hints (json-ld/dom)
  metadata: Record<string, unknown>;
}
```
- **ENG-25 MUST** No detector invents a score floor. Below `minConfidence` → no candidate.
- **ENG-26 SHOULD** Ship user-defined rule detectors (JSON rules compiled to `DetectorPlugin`) in v1.1; the interface is v1-ready.

### 4.5 Arbitration — region tree (fixes D-06)
- **ENG-30 MUST** Output a **tree**, not a flat winner list:
```ts
interface RegionNode {
  id: string; kind: RegionKind; candidate: Candidate; confidence: Confidence;
  children: RegionNode[];
}
```
- **ENG-31 MUST** Conflict rule:
  1. **Primary content kinds** (`article`, `product`, `record_list`, `ai_chat`) compete for the same area; winner by `score`, tie-break by specificity (`product > record_list ≈ ai_chat > article`). Losers become `alternatives[]` on the winner (visible in UI as "also looks like…").
  2. **Containment-compatible kinds** may nest: `article ⊃ {table, list, media, code, comments?}`; `record_list ⊃ {item}`; `product ⊃ {media, table(spec), record_list(reviews)}`.
  3. Same-kind overlaps: non-max suppression by IoU of DOM containment (keep the tighter container with higher score).
  4. `boilerplate` never wins against content; it labels and excludes.
- **ENG-32 MUST** Tier-2/3 kinds never block Tier-1 kinds.

### 4.6 Page classification (fixes D-17)
- **ENG-40 MUST** Output a **distribution**:
```ts
interface PageClassification {
  top: PageType; confidence: number;               // confidence = p(top)
  probabilities: Record<PageType, number>;         // softmax-normalized
  evidence: PageEvidence[];
  primaryRegionId?: string;
}
type PageType = 'article' | 'blog_index' | 'news_article' | 'product_detail' | 'product_listing'
  | 'search_results' | 'ai_chat' | 'documentation' | 'dashboard' | 'forum_thread'
  | 'login' | 'landing_page' | 'unknown';
```
- **ENG-41 MUST** Inputs: arbitrated primary regions, JSON-LD types, OG type, URL rules (one central table of regexes), landmark structure. Replace weak mappings (`table→dashboard`, `form→landing_page`) with rules requiring corroboration (e.g. table-dominant + app-shell landmarks).
- **ENG-42 MUST** The UI shows the top type plus a dropdown to override; the override is stored on the schema (`scope.pageTypes`).
- **ENG-43 SHOULD** Page type biases detector order/thresholds (type-prioritized pass), implementing the VISION "progressive" flow: classify first with a cheap feature pass (URL, JSON-LD, landmark counts, repetition ratio), then run prioritized detectors.

### 4.7 Confidence
- **ENG-50 MUST** `Confidence = { raw: number; calibrated: number | null; isCalibrated: boolean }`. When no trained model exists, `calibrated = null`; UI shows raw as "score" (not "%").
- **ENG-51 MUST** Provide `ConfidenceCalibrator.train()` input from the corpus harness (`rawScore`, `correct`) and from accepted/rejected user corrections (§5.7). Ship a trained per-detector model in v1 (isotonic or 10-bucket as implemented).

### 4.8 Typed extraction and formatters
- **ENG-60 MUST** Extractors produce typed data with **provenance**: each field records `source: 'json-ld'|'microdata'|'dom'|'schema'` and `locatorUsed`.
- **ENG-61 MUST** Markdown/LLM formatters never include skipped/hidden text; headings keep order; tables render as Markdown tables; LLM context supports a token budget (`maxTokens`, estimator `chars/4`) with deterministic truncation and a `[truncated]` marker.
- **ENG-62 MUST** `ExtractionMapper` dispatches by `RegionKind` explicitly (remove the nested ternary); `record_list` extractor returns `{ items: Record<string, unknown>[] }` with inferred fields.

### 4.9 Performance budget (hard gates in CI, §10)
| Page size | p95 total (snapshot → extractions) |
|---|---|
| ≤ 1 000 elements | ≤ 40 ms |
| ≤ 5 000 elements | ≤ 150 ms |
| ≤ 25 000 elements | ≤ 700 ms, time-sliced, UI never blocked > 50 ms |
Memory: snapshot ≤ 60 MB at 25k nodes. Incremental re-detection (§7) must cost ≤ 20% of a full run for a 5% subtree change.

---

## 5. Schema v2 specification (the product core)

### 5.1 Concepts
- **Schema:** where it applies (`scope`), what it targets (`target`), what it extracts (`fields`), and how it outputs (`output`), plus health history.
- **Single vs records:** `mode: 'single'` extracts one object from one region (article, product); `mode: 'records'` extracts an array from repeated items (listings, tables, feeds, chat messages).
- **Locator set:** an ordered list of strategies to relocate an element, strongest first, with verification signatures.

### 5.2 Types
```ts
type SchemaMode = 'single' | 'records';
type SchemaSource = 'auto' | 'manual' | 'imported' | 'healed';

interface ExtractionSchema {
  schemaVersion: 2;
  id: string;                         // uuid v4
  name: string; description?: string;
  source: SchemaSource;
  revision: number;                   // ++ on every save
  createdAt: number; updatedAt: number;

  scope: SchemaScope;
  target: SchemaTarget;
  fields: SchemaField[];              // relative to region (single) or item (records)
  output: OutputSpec;
  health: HealthRecord;
  tags?: string[];
}

interface SchemaScope {
  origins: string[];                  // exact origins, e.g. "https://example.com"; no wildcards in v1
  pathPatterns: string[];             // "/blog/:slug", "/products", "/p/:id/*"
  pageTypes?: PageType[];             // soft hint
  requiresQuery?: Record<string,string|true>; // optional URL query constraints
}

interface SchemaTarget {
  mode: SchemaMode;
  kind: RegionKind;                   // article | product | record_list | table | ai_chat | custom
  region: LocatorSet;                 // the container
  item?: ItemSpec;                    // required when mode = 'records'
  pagination?: PaginationSpec;
}

interface ItemSpec {
  locators: LocatorSet;               // relative to region; matches ALL items
  minItems?: number;                  // for health
  fingerprint: string;                // structural fingerprint of exemplar item
}

interface LocatorSet {
  locators: Locator[];                // ordered, strongest first
  signatures: { text: string[]; structure: string };  // verification
}
type Locator =
  | { strategy: 'data-attr'; selector: string }
  | { strategy: 'id'; selector: string }
  | { strategy: 'aria'; selector: string }
  | { strategy: 'semantic'; selector: string }       // tag + stable classes
  | { strategy: 'structural'; selector: string }     // parent anchors + position
  | { strategy: 'text'; text: string; tag?: string }
  | { strategy: 'css-path'; selector: string };

interface SchemaField {
  name: string;                       // snake_case identifier
  label?: string;
  locators: FieldLocator[];           // relative; first match wins, fallbacks follow
  extract: 'text' | 'html' | 'markdown' | 'attr' | 'href' | 'src' | 'count' | 'exists';
  attr?: string;
  multiple?: boolean;                 // array of values
  transforms?: Transform[];
  required?: boolean;
  defaultValue?: unknown;
  hint?: 'title'|'author'|'date'|'price'|'url'|'image'|'description'|'rating'; // for inference/validation
}
interface FieldLocator { selector: string; fromJsonLd?: string /* e.g. "offers.price" */ }

type Transform =
  | { op: 'trim' } | { op: 'collapseWhitespace' } | { op: 'lowercase' } | { op: 'uppercase' }
  | { op: 'regex'; pattern: string; group?: number; flags?: string }   // pattern length ≤ 256, safe-regex checked
  | { op: 'toNumber'; locale?: string } | { op: 'toCurrency' }          // {amount, currency}
  | { op: 'toDate'; formats?: string[] }                                 // ISO 8601 out
  | { op: 'absoluteUrl' } | { op: 'split'; sep: string } | { op: 'join'; sep: string }
  | { op: 'stripPrefix'; value: string };

interface OutputSpec { format: 'json' | 'markdown' | 'llm-context' | 'csv'; template?: string; maxTokens?: number }

interface HealthRecord {
  status: 'unknown' | 'healthy' | 'degraded' | 'broken';
  lastRunAt?: number; lastUrl?: string;
  runs: number; successes: number;
  recent: RunSummary[];               // ring buffer of last 10
}
```
- **SCH-01 MUST** All schemas are validated with a runtime validator (zod) on load, save and import. Unknown `schemaVersion` → migration or rejection with a message.
- **SCH-02 MUST** `migrateV1toV2()` converts the stub `ExtractionSchema` (single selector + `fields[type]`) into v2 best-effort (single `css-path` locator, `mode:'single'`), marked `source:'imported'`.

### 5.3 Matching and ranking (fixes loose `getForPage`)
- **SCH-10 MUST** A schema matches a URL iff `origin ∈ scope.origins` **and** a path pattern matches. No cross-domain matching by page type in v1.
- **SCH-11 MUST** Rank: (1) exact path-pattern specificity (fewest wildcards/segments), (2) page-type agreement with current classification, (3) health (`healthy > unknown > degraded > broken`), (4) recency.
- **SCH-12 MUST** The UI shows *why matched* ("origin + /blog/:slug").
- **SCH-13 SHOULD** URL pattern inference from the current URL and optional sibling URLs (e.g. `/blog/my-post` → `/blog/:slug`); users never type regex.

### 5.4 Locators — one shared module (fixes D-14)
`@tabwize/core/locator` is the **only** place selectors are generated or resolved; Overlay, DOM Map, schema authoring and stability all use it.

- **LOC-01 MUST** `buildLocatorSet(element, ctx)` returns ordered locators by stability:
  1. `data-*` test/semantic attributes (`data-testid`, `data-test`, `data-qa`, `data-component`…); excluded: framework/hash attributes.
  2. `id` (only if stable: not matching `/\d{4,}|[a-f0-9]{8,}/`, unique in document).
  3. ARIA `role` + accessible name.
  4. Semantic tag + stable classes (filter hashed/CSS-in-JS classes via pattern list: `css-`, `sc-`, `jsx-`, `_` + hash, `[A-Za-z]+_[A-Za-z0-9]{5,}__` module hashes, trailing random).
  5. Structural: nearest stable ancestor anchor + child path with `:nth-of-type`.
  6. Text signature (first ≤ 120 normalized chars + tag).
  7. Absolute CSS path (last resort).
- **LOC-02 MUST** All CSS escaping via `CSS.escape` (fallback polyfill in Node).
- **LOC-03 MUST** Each locator is **verified at build time**: it must resolve to exactly the element (or exactly the item set for `item` locators). Unverifiable locators are dropped.
- **LOC-04 MUST** `resolveLocatorSet(set, root)` tries locators in order; a hit is accepted only if signatures verify (text similarity ≥ 0.6 on `signatures.text` **or** structural fingerprint equality ≥ 0.8). Returns `{ element|elements, locatorUsed, confidence, attempts[] }`.
- **LOC-05 MUST** Text-locator search is scoped (candidates of the same tag/landmark), indexed once per run, never a full `body *` scan.

### 5.5 The Runner (`SchemaRunner`)
```ts
interface RunOptions { root?: ParentNode; limit?: number; includeDiagnostics?: boolean; signal?: AbortSignal }
interface RunResult {
  ok: boolean;
  status: 'healthy' | 'degraded' | 'broken';
  data: unknown;                       // object (single) or { items: [...] } (records)
  diagnostics: {
    regionResolved: boolean; regionLocatorUsed?: string; regionConfidence: number;
    itemCount?: number; itemsExpectedMin?: number;
    fields: Array<{ name: string; matched: number; total: number; rate: number; locatorUsed?: string; required: boolean }>;
    warnings: string[]; durationMs: number;
  };
  provenance: { schemaId: string; revision: number; url: string; at: number };
}
run(schema: ExtractionSchema, opts?: RunOptions): RunResult
```
- **RUN-01 MUST** Runner is deterministic and side-effect-free apart from reading the page. It does not store anything; the caller (background) records health.
- **RUN-02 MUST** Health rule: `broken` if region unresolved, or records `itemCount < minItems`, or any required field rate < 0.5; `degraded` if region resolved by a fallback locator, or any required field rate in [0.5, 0.9), or any optional field rate < 0.5 that was previously ≥ 0.9; else `healthy`.
- **RUN-03 MUST** Each transform failure sets the field to `defaultValue ?? null` and adds a warning; it never throws.
- **RUN-04 MUST** Output validation: `toNumber/toDate/toCurrency` produce typed values or `null`.
- **RUN-05 SHOULD** `run` supports `AbortSignal` and yields cooperatively for ≥ 500 items.

### 5.6 Healing (fixes "last-run status" / trust)
- **HEAL-01 MUST** Triggered when a run is `degraded` or `broken` (auto-offer; user-confirmed).
- **HEAL-02 MUST** Procedure:
  1. Re-run autodetect restricted to `target.kind`.
  2. Rank candidate regions by similarity to the stored `signatures` (text + structure + item fingerprint).
  3. Re-derive field locators inside the new region by (a) existing relative selectors, (b) matching **field exemplar values** stored from the last healthy run (`HealthRecord.recent[0].sample`), (c) `hint`-based inference.
  4. Dry-run the repaired schema; compute diagnostics.
- **HEAL-03 MUST** Present a **diff** (locator changes, field rate before/after, sample output) and require explicit accept; accepted → new `revision`, `source:'healed'`, old revision kept in history (last 5).
- **HEAL-04 MUST NOT** silently apply repairs.

### 5.7 Corrections as training data
- **LEARN-01 MUST** On *save* of any manual schema or accepted heal, capture a **regression fixture** locally: sanitized HTML snapshot (inline styles preserved, scripts stripped, text optionally redacted), URL, expected output. Stored in IndexedDB (cap 50 MB, LRU); exportable as a fixture folder for `tests/fixtures/`.
- **LEARN-02 SHOULD** Feed accepted/rejected auto-detections into `ConfidenceCalibrator.train()` (local, per-detector), shipped in "Developer → Export calibration data".
- **LEARN-03 MAY** Opt-in anonymous metrics (counts only) after v1.0.

### 5.8 Portability
- **PORT-01 MUST** Export: single schema or "pack" (`{ packVersion:1, schemas:[…], meta }`) as JSON; import validates (SCH-01), shows a preview (scope, targets, transforms), rejects `regex` transforms failing the safety check, and never executes code.
- **PORT-02 MUST** Outputs: JSON, CSV (records), Markdown, LLM context.
- **PORT-03 SHOULD** "Run on list": run one schema across a list of URLs (open each in a background tab sequentially with rate limit and `maxConcurrency=1` default), collect results into one dataset; stop on `broken`.
- **PORT-04 SHOULD** Pagination/scroll capture for records (§7.3).

### 5.9 Authoring by example (cuts effort — primary UX investment)
See §6.5; the runner contract above is what authoring produces and previews against.

---

## 6. Extension specification (`@tabwize/extension`, Manifest V3)

### 6.1 Architecture and contexts
```
Side panel (UI, stateless)  ⇄  Background service worker (router + storage + health)  ⇄  Content script (engine host, page access)
```
- **EXT-01 MUST** The **content script** hosts the engine (needs the live DOM), the overlay, and the inspect handlers. Heavy work is time-sliced (ENG-10).
- **EXT-02 MUST** The **background** is the only writer to `chrome.storage.local` (+ IndexedDB for fixtures); it owns schema CRUD, matching, health updates, tab↔panel routing. It keeps **no long-lived in-memory state** that cannot be rebuilt from storage (MV3 worker may die).
- **EXT-03 MUST** The **side panel** is a view: it renders a `PanelState` snapshot and sends intents. On open/reopen it requests a fresh snapshot (`PANEL_HELLO`); no reliance on listeners surviving.
- **EXT-04 MUST** Permissions: `sidePanel`, `storage`, `activeTab`, `scripting`; content script injected on demand (`chrome.scripting.executeScript`) via user action or a matched-schema badge; broad `host_permissions` are **optional** and requested per-origin when the user saves a schema for it (needed to auto-show shortcuts).
- **EXT-05 MUST** CSP-safe: no `eval`, no remote code; bundles via esbuild/Vite.

### 6.2 Message protocol (typed, one source of truth: `packages/extension/src/protocol.ts`)
```ts
type Envelope<T extends string, P> = { v: 1; id: string; replyTo?: string; tabId: number; type: T; payload: P };

// Panel → Content (via background)
type PanelToContent =
  | Envelope<'ANALYZE', { force?: boolean }>
  | Envelope<'SET_MODE', { mode: 'default' | 'edit' }>
  | Envelope<'REVEAL', { ref: ElementRef }>                 // scroll+highlight
  | Envelope<'SELECT', { ref: ElementRef }>
  | Envelope<'TREE_CHILDREN', { ref: ElementRef | 'root'; offset: number; limit: number }>
  | Envelope<'TREE_SEARCH', { query: string; kinds?: string[]; limit: number }>
  | Envelope<'PREVIEW_SCHEMA', { schema: ExtractionSchema }>        // dry-run, live match feedback
  | Envelope<'RUN_SCHEMA', { schemaId: string }>
  | Envelope<'INFER_SIBLINGS', { ref: ElementRef }>
  | Envelope<'PROPOSE_HEAL', { schemaId: string }>;

// Content → Panel (via background)
type ContentToPanel =
  | Envelope<'ANALYSIS', { classification: PageClassification; regions: RegionSummary[]; stats: Stats }>
  | Envelope<'HOVER', { info: ElementInfo | null }>
  | Envelope<'SELECTED', { info: ElementInfo; kindHint?: RegionKind }>
  | Envelope<'TREE_NODES', { parent: ElementRef | 'root'; nodes: TreeNodeDTO[]; hasMore: boolean }>
  | Envelope<'PREVIEW_RESULT', { result: RunResult }>
  | Envelope<'RUN_RESULT', { result: RunResult }>
  | Envelope<'HEAL_PROPOSAL', { proposal: HealProposal }>
  | Envelope<'PAGE_MUTATED', { affected: ElementRef[] }>
  | Envelope<'ERROR', { code: string; message: string }>;

// Panel → Background
type PanelToBackground =
  | Envelope<'PANEL_HELLO', {}> | Envelope<'SCHEMA_LIST', { url: string }>
  | Envelope<'SCHEMA_SAVE', { schema: ExtractionSchema }> | Envelope<'SCHEMA_DELETE', { id: string }>
  | Envelope<'SCHEMA_EXPORT', { ids: string[] }> | Envelope<'SCHEMA_IMPORT', { json: string }>
  | Envelope<'HEALTH_RECORD', { schemaId: string; run: RunSummary }>;
```
- **MSG-01 MUST** Every request gets exactly one reply or `ERROR` within 10 s; timeouts surface a retry affordance.
- **MSG-02 MUST** `ElementRef` is **not** a DOM reference: `{ runId, nodeId, locatorHint }`. The content script keeps a `Map<nodeId, WeakRef<Element>>` per run; stale refs trigger re-resolution via `locatorHint` or an `ERROR{code:'STALE_REF'}`.
- **MSG-03 MUST** Messages carry plain, structured-clone-safe JSON only; payload size cap 1 MB (larger results are paged/streamed by id).
- **MSG-04 MUST** Hover events are throttled to one per animation frame; selection events are immediate.
- **MSG-05 MUST** Mode and selection survive panel close/open and tab switch (kept in background per `tabId`, cleared on navigation).

### 6.3 Overlay system (`OverlayManager` v2)
- **OV-01 MUST** Single closed-by-default shadow-root host (`position:fixed; inset:0; pointer-events:none; z-index:2147483647`) created lazily, removed on mode exit/navigation; idempotent (no duplicates).
- **OV-02 MUST** Boxes are positioned from live rects with `transform: translate()` (no layout thrash); updates batched in `requestAnimationFrame`; scroll/resize/ResizeObserver tracking; 60 fps target; `prefers-reduced-motion` disables transitions.
- **OV-03 MUST** Color + icon per kind (single palette module shared with the panel):

| Kind | Color | Icon |
|---|---|---|
| article/text | violet | ¶ |
| product | amber | tag |
| record_list | orange | grid |
| table | emerald | table |
| ai_chat | cyan | chat |
| list | indigo | list |
| navigation/bar | slate/sky | menu |
| form/input/composer | rose/pink/teal | field |
| media | green | image |
| action | red | pointer |
- **OV-04 MUST** States: `detected` (auto, solid thin outline + tint), `hover` (dashed + tooltip: tag#id.class, role, kind, confidence, selector), `selected` (thick contour + glow + action chip: *Create schema*, *Mark field*, *Copy selector*, *Exclude*), `marked` (manual), `excluded` (striped).
- **OV-05 MUST** Inspect interception uses capture-phase listeners and ignores the overlay host; clicking never triggers page navigation in Edit mode (`preventDefault` + `stopPropagation` on the intercepted click only).
- **OV-06 MUST** Overlay never changes page layout (no layout shift, no style injection into page DOM).
- **OV-07 SHOULD** Keyboard-only inspect (arrow keys move to parent/child/sibling; Enter selects; Esc exits).

### 6.4 DOM Map (DevTools-like)
- **MAP-01 MUST** Tree served lazily from the content script via `TREE_CHILDREN` pages (default 200 children/page); the panel virtualizes rows (windowing) — never serializes the full DOM.
- **MAP-02 MUST** Row shows: tag, id/class summary, kind badge(s) from detection (+ Tier-3 chrome badges computed on the fly), text preview, child count, boilerplate dimming.
- **MAP-03 MUST** Bidirectional sync: tree select ⇒ `REVEAL`+`SELECT` on page; page hover/click ⇒ tree auto-expands to and highlights the node (ancestors loaded on demand by path).
- **MAP-04 MUST** Details pane: attributes, selected computed-style subset (display, position, size, color, font), box model, text, child count, generated locator set with verification status.
- **MAP-05 MUST** Search/filter: tag, text, role, selector, detected kind; results navigable with Enter/Shift+Enter; limit 500 hits.
- **MAP-06 MUST** Context actions: copy CSS/XPath, reveal, mark region kind, **create schema from selection**, exclude subtree, expand-all (depth-capped), breadcrumb path bar with parent jump.
- **MAP-07 MUST** Keyboard navigation (↑↓←→ expand/collapse, Enter select, `/` search, Esc clear), ARIA tree roles, persisted expanded/selected state per tab.
- **MAP-08 SHOULD** Shadow roots and same-origin iframes appear as labeled boundary nodes.

### 6.5 Schema authoring flow (guided, example-driven)
1. **Select the target.** User picks (page click or DOM Map) or accepts an auto-detected region. Panel shows kind guess (editable) and `single` vs `records` suggestion (records if repetition mining finds ≥ 3 sibling items).
2. **Infer siblings (records).** `INFER_SIBLINGS(ref)`: given one exemplar item, compute its structural fingerprint and select all siblings sharing it; the user can add/remove items (click toggles). Live badge: "18 items matched".
3. **Prefill fields.** From signals, in order: JSON-LD properties, `<time datetime>`, `rel=author`/`itemprop`, first heading, first `<a>`/`<img>`, price regex, `<p>` text. User renames, deletes, adds (point at an element inside the exemplar), chooses extract type and transforms from a list (no regex typing unless "advanced").
4. **Live feedback.** `PREVIEW_SCHEMA` after every change: per-field "matches 18/20 items", sample row table, warnings (e.g. "`price` empty on 2 items"), health status preview.
5. **Scope.** URL pattern inferred (SCH-13) and editable with chips (`/blog/` + `:slug`); page types prefilled from classification.
6. **Save.** Name suggested from page/domain+kind. Save ⇒ background writes schema, capture fixture (LEARN-01), request optional host permission if needed.
- **UX-01 MUST** Median authoring (target → save) ≤ 5 interactions for a standard article or product page.
- **UX-02 MUST** Auto schemas are badged `Auto`; manual `Custom`; healed `Healed`.
- **UX-03 MUST** Schema list actions: Run, Edit, Duplicate, Delete (confirm), Export; shows last-run status (health pill + relative time).

### 6.6 Panel details
- Page tab regions list is grouped by Tier 1 first; Tier 2 collapsed; boilerplate hidden by default with a toggle.
- LLM Snapshot tab: choose scope (Page / selected region / schema output), format (Markdown / JSON / CSV / LLM context), token estimate, copy / download.
- Settings: min confidence slider, Tier-2 visibility, default output, shortcuts, reduced motion override, theme (light/dark/system), data (export/import, clear fixtures, reset).
- **A11Y-01 MUST** Keyboard-only operable; visible focus; ARIA roles; WCAG AA contrast incl. dark mode; respects `prefers-reduced-motion`.
- **Shortcuts (configurable):** `Alt+Shift+E` toggle Edit mode, `Alt+Shift+R` run best schema, `Alt+Shift+S` create schema from selection.

---

## 7. Dynamic pages and resilience

### 7.1 Incremental re-detection
- **DYN-01 MUST** A single `MutationObserver` (subtree, childList, attributes filtered to `class/style/hidden/aria-*`, characterData for chat) in the content script, active only while the panel is open or a schema is pinned.
- **DYN-02 MUST** Mutations are coalesced (250 ms debounce, 1 s max wait) into affected ancestor roots; re-snapshot **only those subtrees** and re-run region grouping on them; unaffected regions keep identity.
- **DYN-03 MUST** Emit `PAGE_MUTATED`; panel shows a non-intrusive "Page changed — refresh" chip unless auto-refresh is enabled.
- **DYN-04 MUST** SPA navigation: detect `history.pushState/replaceState`, `popstate`, `navigation` API events, and URL change → reset run state, re-match schemas, clear per-page overlays.

### 7.2 Specific cases
- **Streaming chat:** `ChatTracker` observes the last assistant message for growth; extraction waits for 800 ms of text quiescence (or "stop generating" control disappearance) before marking complete; partial results flagged `streaming:true`.
- **Virtualized lists:** runner collects items currently in DOM; `RunResult.warnings` notes `virtualized:true` when item count is bounded by viewport heuristics (items recycled on scroll); scroll-capture (7.3) accumulates by item key.
- **Lazy images:** use `currentSrc`, `data-src`, `srcset` best candidate.
- **Shadow DOM / iframes:** traversal per ENG-06; schemas may include a `scopePath` of boundary hops; closed/cross-origin boundaries produce explicit warnings, never silent misses.

### 7.3 Pagination & scroll capture (records) — SHOULD in 1.0, MUST by 1.1
- `PaginationSpec = { type: 'next-button' | 'infinite-scroll' | 'url-param'; selector?: string; maxPages: number; delayMs: number; stopWhen?: 'no-new-items' | 'selector-missing' }`.
- Dedupe items by key (hash of declared key fields, else normalized item text).
- Always user-initiated, rate-limited, abortable; progress shown in panel.

---

## 8. Packaging, repository and tooling

### 8.1 Decision: pnpm monorepo, library-first
```
tabwize/
├─ packages/
│  ├─ core/                  # @tabwize/data-extractor-core (publishable later)
│  │  ├─ src/
│  │  │  ├─ snapshot/        # Snapshot, SnapNode, traversal, metadata
│  │  │  ├─ segment/         # BlockSegmenter, repetition mining
│  │  │  ├─ region/          # RegionGrouper, boilerplate
│  │  │  ├─ detection/       # DetectionContext, detectors/*
│  │  │  ├─ arbitration/     # RegionArbiter (tree)
│  │  │  ├─ classification/  # PageClassifier
│  │  │  ├─ confidence/      # Calibrator
│  │  │  ├─ extraction/      # extractors, ExtractionMapper
│  │  │  ├─ output/          # Markdown, LlmContext, Csv
│  │  │  ├─ locator/         # buildLocatorSet, resolveLocatorSet, escape
│  │  │  ├─ schema/          # types, zod validators, migrate, matcher, runner, healer, transforms
│  │  │  ├─ evaluation/      # harness + metrics
│  │  │  └─ index.ts
│  │  ├─ tests/ (unit, fixtures, perf)
│  │  └─ package.json, vite.config.ts, tsconfig.json
│  └─ extension/             # private
│     ├─ src/ background/, content/, panel/, shared/ (protocol.ts, palette.ts)
│     ├─ public/manifest.json, icons/
│     ├─ e2e/ (Playwright)
│     └─ package.json, vite|esbuild config
├─ fixtures/                 # shared corpus (HTML + expected.json), see §10
├─ docs/ (VISION.md, SPEC.md=this file, DECISIONS.md, CHARTER.md)
├─ pnpm-workspace.yaml, package.json, tsconfig.base.json, eslint.config.js, .github/workflows/ci.yml
```
Rules: `extension` depends on `core`; `core` has **zero** `chrome.*` or extension imports; the `core` public API is `src/index.ts` only.

### 8.2 Tooling
- TypeScript 5.x `strict` + `noUncheckedIndexedAccess`; ESLint + `@typescript-eslint` (no-explicit-any as error in `core`); Prettier.
- Build: `core` via Vite library mode (ESM + CJS + d.ts); `extension` via esbuild multi-entry (background, content, panel) — keep the existing esbuild path, no migration churn. The `prebuild: rm -rf dist` becomes `rimraf` (cross-platform).
- Tests: Vitest (+ happy-dom for pure logic only), Playwright (Chromium, `--load-extension`) for integration and e2e.
- Deps (minimal): `zod`, `idb` (IndexedDB helper), `safe-regex2`, a small date lib (`date-fns` parse subset) — each justified in `DECISIONS.md`.
- CI (GitHub Actions): typecheck → lint → unit → build → corpus evaluation (fail under gates) → perf bench → Playwright e2e (headed via xvfb). Artifacts: evaluation report, extension zip.
- Versioning: semver; `schemaVersion` independent of package version; changelog + migration notes.

### 8.3 Manifest (MV3) outline
`manifest_version:3`, `side_panel.default_path`, `background.service_worker` (module), `action`, `permissions:[sidePanel,storage,activeTab,scripting]`, `optional_host_permissions:["https://*/*","http://*/*"]`, `commands` for shortcuts, `minimum_chrome_version:114`, CSP default.

---

## 9. Storage, privacy and security

- **SEC-01 MUST** Schemas live in `chrome.storage.local` (background only). Content scripts/pages never read or write `localStorage` for schemas (page-readable).
- **SEC-02 MUST** Fixtures in IndexedDB (extension origin). Page text stored in fixtures is user-initiated at save time, with an on/off setting and a "redact text" option.
- **SEC-03 MUST** Zero network calls from the extension in v1 (verified by test: no `fetch`/XHR/WebSocket in built bundles; CSP `connect-src 'none'`).
- **SEC-04 MUST** Imports are untrusted: validated, size-capped (5 MB), regexes safety-checked (length ≤ 256, `safe-regex2`, execution time cap 5 ms per transform call on ≤ 100 KB input), locator selectors validated by `querySelector` in try/catch with a selector complexity cap.
- **SEC-05 MUST** No `eval`/`new Function`; no `innerHTML` with page-derived strings in the overlay/panel (use `textContent` or sanitized templates).
- **SEC-06 MUST** Overlay host isolates its CSS in a shadow root; the extension never leaks identifiers into page JS (no `window.*` globals; communicate via `chrome.runtime` only).
- **SEC-07 MUST** Clipboard access only on explicit user action.
- **SEC-08 SHOULD** "Private pages" guard: do not auto-run or store fixtures on URLs matching user-defined sensitive patterns (e.g. banking); default off for `chrome://`, Web Store, `file://` unless allowed.
- **Data model summary:** `schemas: ExtractionSchema[]`, `settings`, `healthIndex` (derived), `fixtures` (IDB), `installId` none (no telemetry in 1.0).

---

## 10. Testing and evaluation

### 10.1 Corpus (fixes D-15)
- **TEST-01 MUST** ≥ 40 real-world page snapshots (single-file HTML captured via SingleFile or `outerHTML` + inlined critical CSS, license-safe or self-authored) across: blog/news (WordPress, Medium-like, Ghost, custom), docs, product detail (Shopify, WooCommerce, custom), listings (collection, search results, feed), tables (semantic + div-grid), AI chat (generic ChatGPT/Claude/Gemini-like synthetic replicas), forum thread, landing, login, dashboard. At least 10 are "hard": hashed class names, deep nesting, hidden content, cookie banners, lazy images.
- Each fixture: `page.html`, `expected.json` (page type, expected regions with `mustContain/mustNotContain`, field expectations, forbidden detections, nested expectations, schema expectations for records).
- **TEST-02 MUST** Generated variants per fixture: renamed classes, extra wrappers, whitespace/ordering changes, injected banner/modal/ad, hidden duplicate text. Stability = pass rate across variants ≥ 90%.
- **TEST-03 MUST** Rendering fixtures requiring layout (visibility, rects, overlays) run in **Playwright**; happy-dom is only for pure-logic unit tests.

### 10.2 Metrics and gates (CI-enforced)
| Metric | Gate (v1.0) |
|---|---|
| Fixture pass rate | ≥ 90% |
| Region precision / recall / F1 | ≥ 0.90 / 0.88 / 0.89 |
| Field F1 | ≥ 0.88 |
| Boundary accuracy (IoU vs labeled region, DOM-node based) | ≥ 0.85 mean |
| Page-type top-1 accuracy | ≥ 0.92 |
| Variant stability | ≥ 90% |
| Schema replay on variants (healthy) | ≥ 85% |
| Hidden-text leak (must-not-contain violations) | 0 |
| Perf budgets (§4.9) | all pass |
| Heal proposal success on broken variants | ≥ 50% |

### 10.3 Test layers
- **Unit:** snapshot features (incl. density correctness D-07), segmentation, repetition mining, locators (build + verify + resolve), transforms, matcher ranking, runner health rules, migration, validators, arbitration tree rules (table-in-article), classifier distribution.
- **Property tests (fast-check):** locator round-trip (build → mutate irrelevant attributes → resolve); runner never throws; transforms total functions.
- **Integration (Playwright):** load extension, open fixtures via local server, run analyze, assert panel + overlays, create schema via simulated clicks, reload variant, replay, heal.
- **Perf:** synthetic 1k/5k/25k-node pages; record p50/p95; compare to budget and previous main (regression > 15% fails).
- **Security:** import fuzzing (malformed JSON, ReDoS regexes, giant selectors); bundle scan for network APIs.

### 10.4 Definition of Done (any task)
Typed contracts updated · unit tests · corpus unaffected or improved · docs/DECISIONS updated if a decision was made · no new `any` in core · perf budget intact.

---

## 11. Roadmap and build order (launch plan)

Estimates are focused solo-developer days; adjust ±30%. Do phases in order; each ends with a demoable, tested increment.

### Phase 0 — Foundations (3–4 days)
1. Create monorepo layout (§8.1), move `src/` → `packages/core/src/` preserving history; `tsconfig.base.json`, ESLint/Prettier, CI skeleton.
2. Seed `DECISIONS.md`, `CHARTER.md` (§12). Add the 18 defects (§3.3) as issues.
3. Quick wins that need no redesign: D-05 regex, D-08 removal, D-11 score floor removal, D-12 `isCalibrated` flag, centralize palette and URL-rule tables.
4. Corpus v0: 12 fixtures + Playwright harness running the *current* engine to establish a **baseline report**.
**Accept:** CI green; baseline metrics recorded in `docs/baseline.md`.

### Phase 1 — Engine hardening (8–10 days)
1. Snapshot layer (ENG-01…10): live non-mutating traversal, correct stats, shadow DOM, caps, time-slicing. Remove `DomPruner`/clone path. (D-01, D-02, D-07, D-08, D-18)
2. Repetition mining + `record_group`; boilerplate classifier replacing noise deletion. (D-03, D-16)
3. Region grouping per container, product grouper, soft link density. (D-04, D-09, D-10)
4. Arbitration tree with nesting/alternatives. (D-06)
5. Classifier distribution + central URL rules; calibrator wiring and first trained model from corpus. (D-12, D-17)
6. Tier-3 demotion (remove `SurfaceDetector` from arbitration; DOM-map badges only). (D-11)
7. Corpus to 40 fixtures + variants generator; perf benchmark harness.
**Accept:** gates §10.2 for detection/page-type/hidden-leak/perf; nested table-in-article test passes.

### Phase 2 — Schema core (8–10 days)
1. `locator` module (LOC-01…05) + property tests; remove other selector generators (D-14).
2. Schema v2 types + zod validators + migration (SCH-01/02).
3. Matcher/ranking (SCH-10…13), transforms library, safe-regex.
4. `SchemaRunner` + health rules (RUN-01…05); records model; CSV output.
5. Auto-schema generation from arbitrated regions (field prefill from extractors/JSON-LD/hints).
6. Healer (HEAL-01…04) as a pure core function + tests on variant corpus.
7. Portability import/export validation (PORT-01/02).
**Accept:** replay ≥ 85% healthy on variants; heal success ≥ 50%; fuzz tests pass. *Core is feature-complete here.*

### Phase 3 — Extension shell (6–8 days)
1. MV3 scaffold, esbuild entries, manifest, commands, optional host permissions.
2. Protocol (`protocol.ts`), background router, per-tab session state, storage service (schemas, settings), IDB fixtures.
3. Content host: analyze on demand/after load, engine run, `ANALYSIS`; SPA navigation handling (DYN-04).
4. Side panel: header + Page tab (page type + distribution, regions, schema list with ranking, Run → `RUN_RESULT`), LLM Snapshot tab, Settings tab (basic).
5. Health recording on run; schema shortcut badge.
**Accept:** e2e: open fixture → page type correct → auto schema saved → reload variant → one-click replay shows healthy.

### Phase 4 — Edit mode, DOM Map, authoring (10–12 days)
1. Overlay v2 (OV-01…07) + palette/icons; inspect interception.
2. DOM Map (MAP-01…08) with lazy tree, virtualization, search, details, actions, sync.
3. Authoring flow (§6.5): sibling inference, field prefill, live preview, URL pattern inference, save + fixture capture.
4. Heal flow UI (diff + accept).
5. A11y pass, keyboard shortcuts, dark mode, reduced motion.
**Accept:** UX-01 (≤ 5 interactions) validated by scripted e2e + 3 manual runs; a11y audit (axe) no serious violations.

### Phase 5 — Dynamic pages, portability, polish (6–8 days)
1. Incremental re-detection (DYN-01…03), streaming chat tracker, virtualized-list warnings.
2. Pagination/scroll capture (7.3) for records; "Run on list" (PORT-03) if time allows.
3. Export/import UI, pack sharing; settings completeness; error/empty states; onboarding (3-step first-run).
4. Performance tuning to budgets at 25k nodes; memory checks.
**Accept:** all §10.2 gates; 25k-node page stays responsive (no long task > 50 ms in trace).

### Phase 6 — Beta and launch (5–7 days + beta window)
1. Security review (§9), bundle scan, permission minimization, privacy policy page.
2. Store assets: screenshots, 90 s demo (auto path, manual path, heal), listing copy, support/issue template.
3. Private beta (15–30 users): instrument local metrics export (opt-in manual share) for §1.6; fix top issues.
4. Release 1.0: Chrome Web Store submission; tag `core` 1.0 (npm publish optional).
**Launch gate (all must hold):** §10.2 gates pass on `main` · 0 open P0/P1 bugs · SEC checklist signed · first-run onboarding verified on a clean profile · manual smoke on 10 real sites (2 each: blog, product, listing, table, chat).

### Parallel / post-1.0 backlog (ordered)
1. User-defined rule detectors (ENG-26). 2. Cross-device sync (`chrome.storage.sync` pack). 3. Schema marketplace/packs. 4. Scheduled/background runs. 5. Node/CLI runner. 6. Firefox build. 7. Optional on-device LLM assist for field naming.

---

## 12. Seed documents

### 12.1 `DECISIONS.md` (initial entries)
```markdown
# Decisions Log

## 2026-10-25 — Schema is the product; detection is the on-ramp
Why: reuse across visits is the value. Metrics are replay health, not detection F1 alone.
Rejected: detection-first roadmap (builds UI on an unproven loop).

## 2026-10-25 — Keep and refactor the existing engine; reject the Clixad rewrite
Why: pipeline/contracts are sound; defects D-01…D-18 are local. The rewrite scaffold reintroduces clones, random IDs and O(n²) lookups.

## 2026-10-25 — pnpm monorepo: core (library) + extension (consumer)
Why: resolves library-vs-extension identity; core stays chrome-free and testable.
Trade-off: slightly more tooling. Alternative: single package — rejected (forces UI code on library users).

## 2026-10-25 — Live, non-mutating snapshot instead of DOM cloning
Why: clones break geometry/computed style/overlay/selectors (D-01) and cost memory. We never mutate, so we never need to clone.

## 2026-10-25 — Exclude hidden content during traversal; boilerplate is scored, not deleted
Why: fixes hidden-text leaks (D-02) and substring-selector false positives (D-03).

## 2026-10-25 — Region tree arbitration with alternatives
Why: tables inside articles, items inside listings, reviews inside products must coexist (D-06).

## 2026-10-25 — Detector scope tiers (data / context / chrome)
Why: only data shapes create schemas; UI chrome becomes DOM-map badges. Reduces false positives and surface area.

## 2026-10-25 — Background-only storage in chrome.storage.local; zod-validated import
Why: page-readable localStorage is unsafe; imported schemas are untrusted (D-13).

## 2026-10-25 — Typed message protocol with ElementRef (no DOM refs over the wire)
Why: MV3 worker lifecycle, stale refs, testability.

## 2026-10-25 — Healing proposes, user accepts
Why: silent repair would corrupt trust and data.

## 2026-10-25 — Primary persona: LLM/automation feeder (flagged; revisit after beta)
Why: aligns with token-efficient output, JSON/Markdown, portability.

## 2026-10-25 — Playwright for layout-dependent tests; happy-dom for logic only
Why: happy-dom has no layout; fixtures need real visibility/rects.

## 2026-10-25 — esbuild for extension, Vite for core library
Why: both already in repo and working; no migration cost.
```

### 12.2 `CHARTER.md`
```markdown
# Project Charter

## Non-negotiable rules
1. Never mutate the live page DOM (except our isolated overlay host).
2. Detectors emit scored candidates with evidence; no fixed confidences or score floors.
3. Node IDs are per-run; persistence uses locator sets only.
4. All selector generation/resolution goes through `core/locator`.
5. Uncalibrated confidence is labeled as such.
6. Every schema run returns diagnostics; healing is proposed, never silent.
7. The extension makes no network requests in v1.0.
8. Imports are untrusted; validate everything.
9. `core` has zero chrome.* imports; its public API is `src/index.ts`.
10. Every non-trivial decision is logged in DECISIONS.md with alternatives.

## Quality gates
Corpus gates (SPEC §10.2) and perf budgets (SPEC §4.9) are CI-blocking.

## Guiding principles
Schema-first · Progressive detection · Human-in-the-loop · Local-first · Performance is a feature.
```

---

## 13. Risks and open questions

### 13.1 Risks
| Risk | Impact | Mitigation |
|---|---|---|
| Real-world DOM diversity beats heuristics | Auto-schemas poor | Authoring-by-example is first-class; corrections feed fixtures/calibration; corpus expansion is continuous |
| MV3 service-worker lifecycle bugs | Lost state | Rebuildable state, idempotent messages, per-tab session in storage |
| Hashed/obfuscated classes (CSS-in-JS) | Brittle locators | Prefer data/ARIA/semantic/text; structure + signatures; healing |
| Large/virtualized pages | Slow or partial extraction | Caps, time-slicing, incremental updates, warnings (not silence) |
| Chrome Web Store review (broad permissions) | Launch delay | Optional host permissions, `activeTab`, clear privacy policy, no network |
| Scope creep (UI chrome detectors, sync, marketplace) | Late launch | Tiering, non-goals, backlog |
| Legal/ToS of scraped sites | Reputation | Local-only, user-initiated, rate-limited, no bypass; terms/guidance in onboarding |

### 13.2 Open questions (defaults chosen; confirm before Phase 3)
1. **Primary user** — spec assumes LLM/automation feeder (§1.3). If non-technical data pullers lead, raise priority of PORT-03/CSV and simplify transforms UI.
2. **Extension sources** — not reviewed; confirm whether any should be salvaged.
3. **Product name/branding** — spec uses "TabWize Data Extractor".
4. **Sync** — deferred past 1.0; confirm.
5. **Telemetry** — none in 1.0; confirm that beta metrics are collected by manual export only.

---

## 14. Glossary
**Snapshot** read-only, live-referenced model of the page · **Block** smallest meaningful content unit · **Region** grouped blocks forming a semantic area · **Candidate** detector output with score + evidence · **Arbitration** conflict resolution into a region tree · **Schema** reusable extraction definition · **Locator set** ordered relocation strategies + verification signatures · **Record group/item** repeated structure and its members · **Health** runtime verdict of a schema replay · **Healing** proposed repair of a broken schema · **Fixture** HTML snapshot + expectations used for regression and calibration · **ElementRef** wire-safe reference to a page element.
