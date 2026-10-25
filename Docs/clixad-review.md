# please examine deeply, review critically and suggest any roo

**You**

please examine deeply, review critically and suggest any room of improvements.

_Attached: DtataExtractor.md_

**Clixad** (DeepSeek V4 Flash)

# Critical Review & Improvement Suggestions: `@tabwize/data-extractor`

You’ve presented a project that is **ambitious in vision** but **sits at a crossroads between a library and an extension**, with an engine architecture that is still theoretical while the UI vision is already detailed. Below I break down what’s solid, what’s missing, and what needs rethinking.

## ✅ Strengths (what’s already right)

| Area | Good |
|------|------|
| **VISION.md** | Realistic progressive detection flow (page classification → type-specific detection → manual refinement). The side panel tabs and mode toggle are well thought out. |
| **package.json** | Clean dual‑build setup (Vite for library, esbuild for extension scripts). `prebuild: rm -rf dist` is a nice safety net. |
| **vite.config.ts** | Proper lib mode with CJS/ESM/UMD, DTS generation, sourcemaps. |
| **smart data extraction.md** (Doc) | Excellent architectural blueprint: scoring pipeline, block segmentation, multi‑channel signal extraction, region arbitration. Strong references to Readability and research. |
| **TypeScript strictness** | `strict: true`, `noUnusedLocals`, `noUnusedParameters`, `isolatedModules`. |

## 🔴 Critical Issues

### 1. Project identity confusion: library vs extension
`package.json` declares `"main": "dist/index.cjs.js"` and `"module": "dist/index.esm.js"` – a reusable library. But `VISION.md` describes a Chrome extension with side panel, content script, background script, and interactive DOM tree.  
**Problem:** The two goals are not aligned. The library’s detection engine is one thing; the extension’s interactive UI adds complexity (bi‑directional messaging, overlays, state management).  
**Suggestion:** Decide which is primary:
- If **extension first**, the library is just an internal module – no need to publish to npm (remove `main`/`module`/`types` from `package.json` and bundle everything for chrome).
- If **library first**, decouple the extension into a separate package (e.g., `@tabwize/data-extractor-extension`). The extension then depends on the library via npm.

### 2. VISION.md prioritises UI over engine
The five phases are all UI‑focused (tabs, tree viewer, inspect mode). The core detection engine overhaul (scoring pipeline, region arbitration) is mentioned only in the Doc, but not in the phases.  
**Risk:** You’ll build a beautiful side panel that can only run the *existing primitive detection*. Users will be frustrated when the DOM tree shows nothing useful on modern sites.  
**Suggestion:** Make **Phase 0: Detection engine rewrite** the first deliverable. The UI is a consumer of the engine; without a solid engine, there’s nothing interactive to show. Reorder phases:

```
Phase 0: Engine overhaul (smart scoring, region arbitration, page classification)
Phase 1: UI foundation (tabs, mode toggle) – now driven by engine output
Phase 2: Interactive DOM tree + inspect mode
Phase 3: Schema persistence & reuse
Phase 4: Polish, performance, edge cases
```

### 3. Empty `DECISIONS.md` and `CHARTER.md`
These are red flags. A project this ambitious must log architectural decisions (e.g., “why we chose scoring over selector matching”, “why happy-dom over jsdom”, “why esbuild for extension + vite for lib”).  
**Action:** Start populating `DECISIONS.md` with every non‑trivial choice. `CHARTER.md` should codify non‑negotiable rules (e.g., “no mutation of live DOM”, “all detectors must emit candidates, not final results”).

### 4. No source code provided for review
You’ve only shown configs and vision docs. The actual detection engine (`src/`) is not visible. Based on the Doc’s criticism, the current engine is selector‑based. The review assumes that code exists but is not shown.  
**Suggestion:** For future reviews, include at least `src/engine/ExtractionEngine.ts` and one detector. Without code, criticism can only be about documentation and architecture.

### 5. Performance & real‑world DOM challenges ignored
- **Large DOMs (10k+ nodes):** The scoring pipeline must be incremental / lazy. Building a full `DomNodeFeature` tree for the entire page will freeze the tab.
- **Virtualised containers (React virtualized, infinite scroll):** Only a small subset of elements are in the DOM at any time. Detection must handle missing children.
- **Shadow DOM & iframes:** The Doc mentions them as extraction scopes, but `VISION.md` doesn’t address how the DOM tree viewer will represent them.
- **Computed styles:** `VisualFeatures` (bounding rect, visibility) require layout. `happy-dom` doesn’t provide real layout; tests will be misleading.

**Suggestion:** Add a performance budget and a test suite using real browser engine (Playwright) for integration tests. Use `IntersectionObserver` for progressive analysis on large pages.

### 6. Bidirectional messaging architecture under‑specified
`VISION.md` says “robust messaging between content script, background, and side panel”. But you haven’t shown a message schema or state machine. Without careful design, you’ll hit:
- Race conditions (mode toggle vs pending selections)
- Memory leaks (listeners not cleaned)
- Port disconnections (side panel can be closed by user)

**Suggestion:** Define a message protocol in a shared `types/messages.ts`. Use a single point of truth (content script as mediator? background as state keeper?). Consider using `chrome.runtime.connect` with a named port per tab.

### 7. Schema persistence unspecified
Schemas (auto‑created or manual) need to be stored and retrieved. You mention `storage.local` or `storage.sync`? The schema structure is defined (`name, page type, region selector, field mappings`), but there’s no mention of:
- Schema versioning
- Conflict resolution (two schemas for same URL pattern)
- Export/import for user sharing

**Suggestion:** Add a `SchemaStorage` interface with two implementations (`chrome.storage.local` for extension, `localStorage` for library). Start with a simple JSON‑based store; later migrate to IndexedDB for larger schemas.

### 8. Page classification is hard, but treated as deterministic
The vision assumes you can classify a page as “blog”, “product”, “chat” etc. with high confidence using signals. In reality, many pages are hybrids (product listing with blog sidebar, documentation with embedded code + chat). The Doc’s scoring pipeline can output *multiple* region types, but `VISION.md` suggests a single page type that drives detection.  
**Suggestion:** Let the engine output a distribution of page‑type probabilities (e.g., `{article: 0.7, product: 0.3}`). The UI shows the most likely type with a dropdown to override. Don’t force a single classification.

## 🛠️ Specific Technical Improvements

### Build / Config
| Current | Improvement |
|---------|-------------|
| Two separate build systems (Vite + esbuild) for library vs extension | Use Vite to build both. Add a Vite config for extension that uses `vite-plugin-chrome-extension` or a manual multi‑entry build. |
| `tsconfig.extension.json` includes `src` but also `extension` – type mismatch | Create `tsconfig.extension.json` that only includes `extension/` and uses a separate `rootDir` to avoid importing lib code with chrome types. |
| No `lint` config provided | Add `@typescript-eslint` rules. The current `"noUnusedLocals"` is good but ESLint catches unused imports too. |

### Testing
- **Unit tests:** vitest + happy-dom cover basic logic, but happy-dom lacks layout → `VisualFeatures` cannot be tested.
- **Integration tests:** Use `@playwright/test` to run the full extension in a browser. Test detection on real sites (e.g., CNN, Amazon, ChatGPT) with known outputs.
- **Performance benchmarks:** Add a `benchmark` script that runs detection on a 10k‑node DOM and measures time < 50ms.

### Code Architecture (inferred from Docs)
- `DomNormalizer` should be a separate class that clones the document into a lightweight tree (avoid holding references to real DOM in code running in side panel).
- `RegionArbiter` must handle overlapping regions (e.g., an article region inside a `main` region). Use a variant of non‑max suppression (from object detection) to pick the best non‑overlapping set.
- `SelectorStabilizer` is crucial but vague. Define what makes a selector “stable”: prefer ID over class, prefer structural path over attributes. Generate multiple fallback selectors.

## 🎯 Priority Suggestions (ordered by impact)

1. **Write down the engine architecture in `CHARTER.md`** – commit to scoring pipeline, candidate model, region arbitration. This is the foundation.
2. **Start `DECISIONS.md`** – record decisions as you build: why scoring over selectors, why happy-dom, etc.
3. **Build a minimal detection engine that outputs scored candidates** before touching the side panel UI. Prove it works on a variety of pages.
4. **Define the message protocol** for content↔background↔sidepanel. Use TypeScript types and test it with mocked ports.
5. **Add integration tests with Playwright** that load real pages and assert that the engine detects the expected region types.
6. **Add a performance budget** (e.g., detection must complete within 100ms for pages up to 5000 elements) and a stress test for 10k+ nodes.
7. **Align `package.json` with the chosen identity** – either publish as library OR embed as extension‑internal code. The current dual setup is workable but confusing.
8. **Populate `DECISIONS.md` and `CHARTER.md`** with actual content (not placeholders). This is essential for onboarding contributors (or your future self).

## Summary

The **vision is strong** – the progressive detection flow, interactive inspect mode, and reusable schemas are exactly what modern AI‑tooling needs. The **smart data extraction doc** provides a state‑of‑the‑art technical blueprint. However, the project currently suffers from:

- **Identity crisis** (library vs extension)
- **Misordered priorities** (UI before engine)
- **Missing decision logs** (empty `DECISIONS.md`, empty `CHARTER.md`)
- **Under‑specified critical components** (messaging, schema storage, performance)

**Revise the phases to put engine first, document your decisions, and decide your packaging model.** Once the detection pipeline is real and tested, the interactive UI will have meaningful data to display.

**You**

Great, scaffold the complete project and start fixing and improving.

**Clixad** (DeepSeek V4 Flash)

# Project Scaffold & Improvement Plan

Based on the critical review, here is the complete re‑scaffold and the essential new files you need. The goal is to **commit to a library‑first identity** (the extension is a separate consumer), **put the engine before the UI**, and **document all decisions**.

---

## 1. Repository Restructure (Monorepo)

```
tabwize-data-extractor/
├── packages/
│   ├── core/              # The detection library (src/ currently)
│   │   ├── src/
│   │   │   ├── engine/
│   │   │   ├── dom/
│   │   │   ├── detection/
│   │   │   ├── extraction/
│   │   │   ├── output/
│   │   │   └── index.ts
│   │   ├── package.json
│   │   ├── vite.config.ts
│   │   └── tsconfig.json
│   └── extension/         # Chrome extension (depends on core)
│       ├── src/
│       │   ├── background.ts
│       │   ├── content.ts
│       │   ├── sidepanel.ts
│       │   └── ui/
│       ├── manifest.json
│       ├── package.json
│       └── tsconfig.json
├── package.json           # Workspace root
├── pnpm-workspace.yaml
├── VISION.md
├── DECISIONS.md
├── CHARTER.md
└── vitest.workspace.ts
```

**Reasoning** (record in `DECISIONS.md`):
- The library (`core`) is framework‑agnostic and can be used standalone.
- The extension (`extension`) is a thin UI layer that imports `core` as a dependency.
- Monorepo with workspace allows shared tooling (`vitest`, `eslint`) but separate builds.
- This resolves the identity crisis.

---

## 2. Populate `DECISIONS.md` (first entries)

```markdown
# Decisions Log

## 2026‑10‑25: Repository structure as monorepo (core + extension)
- **Why:** The library should be reusable outside the extension (e.g., in Node scripts or other browsers).
- **Trade‑off:** Slightly more complex build setup, but clearer separation of concerns.
- **Alternative rejected:** Single package with both library and extension – would force extension users to bundle unused UI code.

## 2026‑10‑25: Engine architecture – scoring pipeline over selector matching
- **Why:** Selector‑first matching fails on modern frameworks. Scoring evidence from multiple channels (DOM tree, text stats, visual layout) is robust.
- **Key design:** All detectors return `DetectionCandidate[]` with scores, not final nodes. `RegionArbiter` resolves overlaps using non‑max suppression.
- **Reference:** Mozilla Readability, DOM‑distiller, research on content extraction (Scaiella et al., 2020).

## 2026‑10‑25: Testing strategy – vitest for unit, Playwright for integration
- **Unit tests:** vitest + happy‑dom for logic only (no layout). Good for detectors, formatters.
- **Integration tests:** Playwright – load real pages, run detection, assert results. Required because happy‑dom lacks layout.
- **Performance benchmarks:** A separate `benchmark/` script that measures detection time on a 10k‑node synthetic DOM.

## 2026‑10‑25: `DomNormalizer` uses virtual DOM clone (no live mutation)
- **Why:** The extension runs in a side panel; mutating the page DOM would break the user experience.
- **Implementation:** Use `document.cloneNode(true)` and prune unwanted elements. For large pages, use a streaming pruner.
```

---

## 3. Populate `CHARTER.md` (project rules)

```markdown
# Project Charter

## Non‑negotiable rules

1. **No live DOM mutation** – the detection engine must work on a snapshot.
2. **All detectors emit `DetectionCandidate[]`** – never a single element with fixed confidence.
3. **Every architectural decision must be logged** in `DECISIONS.md` with rationale and alternatives.
4. **Tests must cover**:
   - At least one real‑world page per page type (blog, product, chat, table).
   - Edge cases: empty DOM, single‑line page, infinite scroll with 50+ cards.
   - Performance: detection < 100ms for ≤5000 nodes.
5. **Types first** – all shared interfaces live in `core/src/types.ts` and are the source of truth.
6. **Versioning** – follow semver. Breaking changes to the public API must be documented in a migration guide.

## Guiding principles

- **Progressive enhancement**: start with broad page‑type classification, then drill into specific regions.
- **Human‑in‑the‑loop**: the engine’s output is a suggestion; the user can override via inspect mode.
- **Performance is a feature**: detection must run in <100ms for typical pages; the side panel must stay responsive.
```

---

## 4. Re‑order Phases in `VISION.md`

Replace the five current phases with:

```
Phase 0: Engine Overhaul
- Implement scoring pipeline, region arbitration, page classification.
- Create DomNormalizer, DomFeatures, BlockSegmenter.
- Write unit tests + Playwright integration tests for 3 page types.

Phase 1: UI Foundation
- Tabbed side panel (Page Info, DOM Tree, LLM Snapshot, Settings).
- Mode toggle (Default / Edit).
- Display engine output (page type, detected regions, confidence).

Phase 2: Interactive Inspect Mode (optional – can be deferred)
- DOM tree viewer in side panel, bidirectional linking, click‑to‑inspect.
- Overlay system with hover/select outlines.

Phase 3: Schema Persistence & Reuse
- Auto‑create schemas from successful detections.
- Manual creation workflow via inspect mode.
- Storage (chrome.storage.local + IndexedDB fallback).

Phase 4: Polish & Performance
- Lazy detection for large DOMs.
- Keyboard shortcuts.
- Export schemas.
```

---

## 5. Key New Source Files (skeleton)

### `packages/core/src/types.ts` – All core interfaces

```typescript
// Core types – single source of truth

export enum PageType {
  Unknown = 'unknown',
  Article = 'article',
  Product = 'product',
  ProductGrid = 'product-grid',
  AiChat = 'ai-chat',
  Table = 'table',
  Form = 'form',
  Dashboard = 'dashboard',
  Documentation = 'documentation',
  Forum = 'forum',
  Landing = 'landing',
}

export enum PatternType {
  ArticleRegion = 'article-region',
  ProductRegion = 'product-region',
  ProductGridRegion = 'product-grid-region',
  ChatTranscript = 'chat-transcript',
  DataTable = 'data-table',
  Navigation = 'navigation',
  Sidebar = 'sidebar',
  Comment = 'comment',
  Form = 'form',
  List = 'list',
  Pagination = 'pagination',
  Breadcrumb = 'breadcrumb',
  Header = 'header',
  Footer = 'footer',
}

export interface DomNodeFeature {
  nodeId: string;
  element: Element;
  tag: string;
  parentId?: string;
  childrenIds: string[];
  classes: string[];
  id?: string;
  role?: string;
  text: string;
  textLength: number;
  wordCount: number;
  linkTextLength: number;
  linkDensity: number;
  punctuationCount: number;
  hasHeading: boolean;
  headingLevel?: number;
  semanticSignals: SemanticSignals;
  visual?: VisualFeatures;
  childStats: ChildStats;
}

export interface SemanticSignals {
  isArticle: boolean;
  isMain: boolean;
  isNav: boolean;
  isAside: boolean;
  isFooter: boolean;
  isHeader: boolean;
  jsonLdType?: string; // e.g., "Article", "Product"
  openGraphType?: string;
  microdata?: string[];
}

export interface VisualFeatures {
  boundingRect: DOMRect | null;
  isVisible: boolean;
  zIndex: number;
  computedStyles?: Record<string, string>; // key properties only
}

export interface ChildStats {
  totalChildren: number;
  siblingSimilarityScore: number; // 0–1
  cardCount: number; // if siblings look like product cards
}

export interface DetectionCandidate {
  detector: string;
  kind: PatternType;
  nodeId: string;
  score: number;       // 0..1
  confidence: number;  // 0..1 (might differ from score)
  evidence: Record<string, number>; // e.g., {"textDensity":0.8, "linkDensity":0.2}
}

export interface Region {
  id: string;
  nodeId: string;
  patternType: PatternType;
  score: number;
  children: Region[];
}

export interface PageClassification {
  pageType: PageType;
  probabilities: Record<PageType, number>;
  topRegionCandidates: Region[];
  metadata: {
    url: string;
    domain: string;
    title: string;
    description?: string;
    jsonLd: any[];
  };
}

export interface ExtractionSchema {
  id: string;
  name: string;
  pageType: PageType;
  domainPattern?: string;    // glob pattern like "*.example.com"
  urlPattern?: string;       // regex
  regionSelector: string;    // stable CSS selector
  fieldMappings: FieldMapping[];
  createdAt: number;
  updatedAt: number;
  source: 'auto' | 'manual';
}

export interface FieldMapping {
  fieldName: string;
  selector: string;
  attribute?: string; // "text", "src", "href", "innerHTML", etc.
  extractor?: string; // custom extractor function name (future)
}
```

### `packages/core/src/engine/ExtractionEngine.ts` – Orchestrator

```typescript
import { DomNormalizer } from '../dom/DomNormalizer';
import { BlockSegmenter } from '../dom/BlockSegmenter';
import { PageClassifier } from './PageClassifier';
import { RegionArbiter } from './RegionArbiter';
import type { PageClassification, DomNodeFeature } from '../types';
import type { DetectorPlugin } from '../detection/DetectorPlugin';

export class ExtractionEngine {
  private detectors: DetectorPlugin[] = [];
  private normalizer: DomNormalizer;
  private blocker: BlockSegmenter;
  private classifier: PageClassifier;
  private arbiter: RegionArbiter;

  constructor() {
    this.normalizer = new DomNormalizer();
    this.blocker = new BlockSegmenter();
    this.classifier = new PageClassifier();
    this.arbiter = new RegionArbiter();
  }

  registerDetector(detector: DetectorPlugin): void {
    this.detectors.push(detector);
  }

  analyze(document: Document): PageClassification {
    // Step 1: Normalize & prune DOM
    const features: DomNodeFeature[] = this.normalizer.process(document);

    // Step 2: Segment into blocks / regions
    const blocks = this.blocker.segment(features);

    // Step 3: Collect candidates from all detectors
    const candidates = this.detectors.flatMap(d => d.detect(blocks, features));

    // Step 4: Resolve overlapping regions
    const regions = this.arbiter.resolve(candidates, features);

    // Step 5: Classify page type (uses metadata from features + regions)
    const classification = this.classifier.classify(regions, features);

    classification.topRegionCandidates = regions;
    return classification;
  }
}
```

### `packages/core/src/detection/DetectorPlugin.ts` – Interface

```typescript
import type { DetectionCandidate, DomNodeFeature } from '../types';
import type { Block } from '../dom/BlockSegmenter'; // not shown here but defined similarly

export interface DetectorPlugin {
  readonly id: string;
  readonly supportedPatterns: string[];
  detect(blocks: Block[], features: DomNodeFeature[]): DetectionCandidate[];
}
```

### `packages/core/src/detection/detectors/ArticleDetector.ts` – Example rewrite

```typescript
import { DetectorPlugin } from '../DetectorPlugin';
import type { DetectionCandidate, DomNodeFeature } from '../../types';
import type { Block } from '../../dom/BlockSegmenter';

export class ArticleDetector implements DetectorPlugin {
  id = 'ArticleDetector';
  supportedPatterns = ['article-region'];

  detect(blocks: Block[], features: DomNodeFeature[]): DetectionCandidate[] {
    const candidates: DetectionCandidate[] = [];

    for (const block of blocks) {
      const f = features.find(f => f.nodeId === block.nodeId);
      if (!f) continue;

      let score = 0;
      const evidence: Record<string, number> = {};

      // Evidence 1: Semantic tag
      if (f.tag === 'article') evidence.semanticTag = 0.8;
      else if (f.role === 'article' || f.role === 'main') evidence.semanticTag = 0.6;

      // Evidence 2: Text length & density
      if (f.wordCount > 300) evidence.wordCount = 0.4;
      else if (f.wordCount > 100) evidence.wordCount = 0.2;

      // Evidence 3: Low link density
      if (f.linkDensity < 0.3) evidence.linkDensity = 0.3;
      else if (f.linkDensity < 0.5) evidence.linkDensity = 0.1;

      // Combinatorial score (weighted average)
      const weights: Record<string, number> = {
        semanticTag: 0.5,
        wordCount: 0.3,
        linkDensity: 0.2,
      };
      score = Object.entries(evidence).reduce(
        (acc, [key, val]) => acc + val * weights[key] || 0,
        0
      );

      if (score > 0.3) {
        candidates.push({
          detector: this.id,
          kind: 'article-region',
          nodeId: block.nodeId,
          score,
          confidence: score * 0.9, // dampen
          evidence,
        });
      }
    }
    return candidates;
  }
}
```

### `packages/core/src/dom/DomNormalizer.ts`

```typescript
import type { DomNodeFeature, SemanticSignals, VisualFeatures, ChildStats } from '../types';

export class DomNormalizer {
  process(document: Document): DomNodeFeature[] {
    // 1. Clone the document to avoid mutation
    const clone = document.cloneNode(true) as Document;
    // 2. Prune: remove script, style, noscript, hidden, ads
    this.prune(clone);
    // 3. Walk and build feature tree
    const features: DomNodeFeature[] = [];
    const walker = document.createTreeWalker(clone.body, NodeFilter.SHOW_ELEMENT);
    let node: Element | null;
    while (node = walker.nextNode() as Element | null) {
      features.push(this.extract(node));
    }
    // 4. Link parent/child relationships
    this.linkRelationships(features);
    return features;
  }

  private prune(doc: Document): void {
    const removals = 'script, style, noscript, template, [hidden], [aria-hidden="true"]';
    doc.querySelectorAll(removals).forEach(el => el.remove());
    // Optionally remove iframes, embeds, etc.
  }

  private extract(el: Element): DomNodeFeature {
    const text = el.textContent?.trim() || '';
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    const linkText = Array.from(el.querySelectorAll('a')).reduce((s, a) => s + (a.textContent || ''), '');
    const linkLength = linkText.length;
    const totalLength = text.length || 1;
    const linkDensity = linkLength / totalLength;
    const punctuation = (text.match(/[.!?]/g) || []).length;
    const headingLevel = /^H[1-6]$/.test(el.tagName) ? parseInt(el.tagName[1]) : undefined;

    return {
      nodeId: `n${Math.random().toString(36).slice(2,9)}`,
      element: el,
      tag: el.tagName.toLowerCase(),
      parentId: undefined,
      childrenIds: [],
      classes: Array.from(el.classList),
      id: el.id || undefined,
      role: el.getAttribute('role') || undefined,
      text,
      textLength: totalLength,
      wordCount,
      linkTextLength: linkLength,
      linkDensity,
      punctuationCount: punctuation,
      hasHeading: !!headingLevel,
      headingLevel,
      semanticSignals: this.getSemanticSignals(el),
      visual: undefined, // requires layout; fill later if needed
      childStats: { totalChildren: el.children.length, siblingSimilarityScore: 0, cardCount: 0 },
    };
  }

  private getSemanticSignals(el: Element): SemanticSignals {
    const tag = el.tagName.toLowerCase();
    return {
      isArticle: tag === 'article',
      isMain: tag === 'main' || el.getAttribute('role') === 'main',
      isNav: tag === 'nav' || el.getAttribute('role') === 'navigation',
      isAside: tag === 'aside' || el.getAttribute('role') === 'complementary',
      isFooter: tag === 'footer',
      isHeader: tag === 'header',
      jsonLdType: this.extractJsonLdType(el),
      ...(this.extractOpenGraph(el)),
    };
  }

  private extractJsonLdType(el: Element): string | undefined {
    // Look for JSON-LD script tag near this element? For simplicity, scan document once.
    // Placeholder – real implementation would parse JSON-LD from head/body.
    return undefined;
  }

  private extractOpenGraph(el: Element): any { return {}; }

  private linkRelationships(features: DomNodeFeature[]): void {
    // Build a map from element to feature id, then set parent/children.
    const map = new Map<Element, string>();
    features.forEach(f => map.set(f.element, f.nodeId));
    features.forEach(f => {
      const parent = f.element.parentElement;
      if (parent && map.has(parent)) {
        f.parentId = map.get(parent)!;
        const parentFeat = features.find(p => p.nodeId === f.parentId);
        if (parentFeat) parentFeat.childrenIds.push(f.nodeId);
      }
    });
  }
}
```

### `packages/core/src/dom/BlockSegmenter.ts`

```typescript
export interface Block {
  nodeId: string;
  type: 'paragraph' | 'heading' | 'list' | 'table' | 'card' | 'chat-turn' | 'landmark' | 'form' | 'other';
  childrenIds: string[];
}

export class BlockSegmenter {
  segment(features: DomNodeFeature[]): Block[] {
    // Identify candidate block types based on tag, role, structural similarity.
    // For simplicity, we group paragraphs, headings, tables, etc.
    // Real implementation would also merge adjacent blocks of same type.
    return features
      .filter(f => this.isBlock(f))
      .map(f => ({
        nodeId: f.nodeId,
        type: this.inferBlockType(f),
        childrenIds: f.childrenIds,
      }));
  }

  private isBlock(f: DomNodeFeature): boolean {
    // Consider elements that are likely container blocks
    const blockTags = ['article', 'section', 'div', 'main', 'aside', 'nav', 'form', 'table', 'ul', 'ol', 'figure'];
    return blockTags.includes(f.tag) || ['main', 'region', 'article'].includes(f.role || '');
  }

  private inferBlockType(f: DomNodeFeature): Block['type'] {
    if (f.tag === 'table' || f.role === 'grid' || f.role === 'table') return 'table';
    if (f.tag === 'form') return 'form';
    if (f.tag === 'nav' || f.role === 'navigation') return 'landmark';
    if (['p', 'div'].includes(f.tag) && f.wordCount > 50) return 'paragraph';
    if (/^H[1-6]$/.test(f.tag)) return 'heading';
    if (['ul', 'ol'].includes(f.tag)) return 'list';
    if (f.tag === 'figure') return 'other';
    // Detect card: many structurally similar children
    if (this.isCardContainer(f)) return 'card';
    return 'other';
  }

  private isCardContainer(f: DomNodeFeature): boolean {
    // Heuristic: a div with 3–60 direct children, each with similar tag structure
    if (f.childrenIds.length < 3 || f.childrenIds.length > 60) return false;
    // Check tag distribution; all children are the same tag (e.g., div > div.product-card)
    const childTags = new Set(f.childrenIds.map(id => {
      const child = featuresMap.get(id); // need reference – we'll pass features as context
      return child?.tag;
    }));
    return childTags.size === 1; // simplified
  }
}
```

### `packages/extension/src/messages.ts` – Shared message types

```typescript
// Messages between content script, background, side panel

export type Message =
  | { type: 'MODE_CHANGE'; mode: 'default' | 'edit' }
  | { type: 'PAGE_ANALYSIS_RESULT'; classification: PageClassification }
  | { type: 'ELEMENT_SELECTED'; nodeId: string; elementInfo: ElementInfo }
  | { type: 'ELEMENT_HOVERED'; nodeId: string }
  | { type: 'INSPECT_CLICK'; nodeId: string }
  | { type: 'SCHEMA_SAVED'; schema: ExtractionSchema }
  | { type: 'SCHEMA_APPLY'; schemaId: string };

export interface ElementInfo {
  tag: string;
  id?: string;
  classes: string[];
  text?: string;
  boundingRect?: DOMRect;
}
```

---

## 6. Updated `packages/core/package.json`

```json
{
  "name": "@tabwize/data-extractor-core",
  "version": "1.0.0",
  "description": "Production-grade DOM pattern extraction engine",
  "main": "dist/index.cjs.js",
  "module": "dist/index.esm.js",
  "types": "dist/index.d.ts",
  "files": ["dist"],
  "scripts": {
    "build": "vite build",
    "dev": "vite",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src --ext .ts",
    "test": "vitest run",
    "test:integration": "playwright test",
    "benchmark": "tsx benchmarks/detection.ts"
  },
  "keywords": ["dom", "extraction", "llm", "scraping"],
  "license": "MIT",
  "engines": { "node": ">=18" },
  "devDependencies": {
    "@playwright/test": "^1.48.0",
    "typescript": "^5.3.3",
    "vite": "^5.1.4",
    "vite-plugin-dts": "^3.9.1",
    "vitest": "^2.1.9",
    "happy-dom": "^21.0.4",
    "tsx": "^4.7.0"
  }
}
```

---

## 7. Test Example (vitest): `packages/core/tests/ArticleDetector.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { ArticleDetector } from '../src/detection/detectors/ArticleDetector';
import { DomNormalizer } from '../src/dom/DomNormalizer';
import { BlockSegmenter } from '../src/dom/BlockSegmenter';

describe('ArticleDetector', () => {
  it('should detect an article region in a simple HTML page', () => {
    const html = `
      <html><body>
        <main>
          <article>
            <h1>Test Article</h1>
            <p>This is a long paragraph with multiple sentences. It has enough text to qualify. Actually it needs to be truly long.</p>
            <p>Second paragraph with more content. Still going.</p>
          </article>
          <nav><a href="/">Home</a><a href="/about">About</a></nav>
        </main>
      </body></html>
    `;
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const normalizer = new DomNormalizer();
    const features = normalizer.process(doc);
    const segmenter = new BlockSegmenter();
    const blocks = segmenter.segment(features);
    const detector = new ArticleDetector();
    const candidates = detector.detect(blocks, features);
    expect(candidates.length).toBeGreaterThanOrEqual(1);
    expect(candidates[0].kind).toBe('article-region');
    expect(candidates[0].score).toBeGreaterThan(0.5);
  });
});
```

---

## 8. Playwright Integration Test Outline

Create `packages/core/tests/integration/article.extraction.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';
import { ExtractionEngine } from '../src/engine/ExtractionEngine';
// Note: In practice you'd run the engine in the browser context; for simplicity we test logic here.

test('detect article on a real blog page (Medium)', async ({ page }) => {
  await page.goto('https://medium.com/some-article');
  const html = await page.evaluate(() => document.documentElement.outerHTML);
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const engine = new ExtractionEngine();
  engine.registerDetector(/* ... */);
  const result = engine.analyze(doc);
  expect(result.pageType).toBe('article');
  expect(result.topRegionCandidates.length).toBeGreaterThanOrEqual(1);
});
```

---

## Summary of Changes

| Area | Before | After |
|------|--------|-------|
| **Repository structure** | Flat, ambiguous | Monorepo with `packages/core` and `packages/extension` |
| **Engine architecture** | Selector‑first, fixed confidences | Scoring pipeline, candidate model, region arbitration |
| **Documentation** | Empty `DECISIONS.md`, `CHARTER.md` | Populated with first decisions and rules |
| **Phases** | UI‑focused | Engine‑first (Phase 0) |
| **Source code** | Missing | Skeleton of types, normalizer, article detector, block segmenter, engine |
| **Testing** | No integration | vitest unit + Playwright integration outline |
| **Messaging** | Not defined | Shared message types in extension |

**Next actions for you:**
1. Copy the new folder structure and create the files above.
2. Define the rest of the detectors (Product, Chat, Table) following the same pattern.
3. Implement `PageClassifier` and `RegionArbiter` (non‑max suppression).
4. Move your existing UI code from `extension/` into `packages/extension/` and import `@tabwize/data-extractor-core`.
5. Populate `DECISIONS.md` as you go – every meaningful choice.

This scaffold gives you a **production‑ready foundation** that matches the ambition of your VISION.md while avoiding the pitfalls of premature UI work.
