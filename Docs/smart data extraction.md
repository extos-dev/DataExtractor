<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" style="height:64px;margin-right:32px"/>

# the objective is building an smart data extraction engine by leveraging advanced dom parsing and pattern detection techenics, the tool is aimed to be powefull flexible and extensible, the actual detection system is primitive, te objective is a way better Dom element auto-detection and pattern recognition for example detecting page pattern like ai chat site, products site, articles/news/blog site ect, it should recognize area like blog article , tables, lists, navigation area, ect

Your current engine is a useful detector registry, but it needs to move from **selector-first detection** to a **DOM feature + scoring + region arbitration** architecture. The existing `ArticleDetector` and `TableDetector` use narrow selectors such as `article`, `main`, `[role=main]`, and `table`, with fixed confidence values and little deduplication; that is exactly why it will fail on modern React/Next.js, AI chat, and heavily styled commerce pages.[^1_1]

## Core design shift

Build the engine as a pipeline:

```text
DOM snapshot
  → normalization / pruning
  → block segmentation
  → feature extraction
  → candidate scoring
  → region arbitration
  → page-type inference
  → typed extraction
  → confidence + evidence output
```

This mirrors proven content-extraction approaches: score small content blocks, propagate evidence to ancestor containers, penalize link-heavy boilerplate, then choose the best candidate subtree. Mozilla Readability uses this broad strategy for article extraction, including text length, punctuation, tag/class signals, link density, and ancestor score propagation.[^1_2][^1_3][^1_4]

The important change: **do not ask “does this match `.article`?”** Ask “how much evidence does this subtree have for being an article, product grid, chat transcript, table, navigation, etc.?”

## Architecture

```text
src/
  engine/
    ExtractionEngine.ts
    DetectionContext.ts
    RegionArbiter.ts
    PageClassifier.ts
    Confidence.ts
  dom/
    DomNormalizer.ts
    DomPruner.ts
    BlockSegmenter.ts
    DomFeatures.ts
    VisualFeatures.ts
    SemanticFeatures.ts
    SelectorStabilizer.ts
  detection/
    DetectorPlugin.ts
    detectors/
      ArticleDetector.ts
      ProductDetector.ts
      ProductGridDetector.ts
      AiChatDetector.ts
      TableDetector.ts
      ListDetector.ts
      NavigationDetector.ts
      FormDetector.ts
      CommentDetector.ts
      SidebarDetector.ts
      PaginationDetector.ts
      BreadcrumbDetector.ts
  extraction/
    extractors/
      ArticleExtractor.ts
      ProductExtractor.ts
      ChatExtractor.ts
      TableExtractor.ts
      ListExtractor.ts
    SchemaMapper.ts
  learning/
    SiteProfileStore.ts
    FeedbackStore.ts
    RuleCompiler.ts
  output/
    MarkdownFormatter.ts
    JsonFormatter.ts
    LlmContextFormatter.ts
```

Keep your current `DetectorPlugin` interface, but make detectors return **scored candidates**, not final extraction nodes. Your current engine immediately merges detector output and assigns hard-coded confidence such as `0.92` for articles and `0.96` for tables.[^1_1]

## 1. Normalize and prune the DOM

Before detection, create a normalized view of the page.

- Clone or virtually traverse the DOM; do not mutate the live page.
- Remove `script`, `style`, `noscript`, `template`, hidden nodes, and obvious ad/analytics containers.
- Resolve ARIA roles, semantic landmarks, microdata, JSON-LD, Open Graph, and RDFa into a page metadata layer.
- Preserve stable references: CSS path, XPath, generated stable ID, bounding rect, and text signature.
- Detect Shadow DOM and iframe boundaries as extraction scopes.

This layer should output a `DomNodeFeature` tree rather than working directly with raw `HTMLElement`s.

```ts
interface DomNodeFeature {
  nodeId: string;
  element: Element;
  parent?: string;
  children: string[];
  tag: string;
  role?: string;
  aria?: Record<string, string>;
  classes: string[];
  id?: string;
  text: string;
  textLength: number;
  wordCount: number;
  linkTextLength: number;
  linkDensity: number;
  punctuationCount: number;
  hasHeading: boolean;
  headingLevel?: number;
  semanticSignals: SemanticSignals;
  visual: VisualFeatures;
  childStats: ChildStats;
}
```


## 2. Segment the page into blocks

Do not score every element. First identify candidate **blocks**:

- Paragraphs: `p`, long text nodes, rich-text containers
- Headings: `h1`–`h6`, `[role=heading]`
- Lists: `ul`, `ol`, `dl`, repeated sibling structures
- Tables: `table`, ARIA grids, CSS-grid-like repeated card rows
- Cards: repeated sibling containers with similar structure
- Chat turns: alternating role/message containers
- Forms: `form`, fieldsets, input clusters
- Landmarks: `header`, `nav`, `main`, `aside`, `footer`
- Media blocks: `figure`, `img`, `video`, galleries

Then create **regions** by grouping adjacent/similar blocks:

```text
article-region
product-region
product-grid-region
chat-transcript-region
data-table-region
navigation-region
sidebar-region
comment-region
form-region
```

A product grid, for example, is not one element with class `products`; it is usually a parent containing 8–60 structurally similar children, each with an image, title, price, and link.

## 3. Extract strong signals

Use multiple independent evidence channels.


| Signal family | Examples | Useful for |
| :-- | :-- | :-- |
| Semantic HTML | `article`, `main`, `nav`, `aside`, `table`, `figure`, `time` | Articles, navigation, tables |
| ARIA | `role=main`, `role=grid`, `role=list`, `role=dialog` | Accessible/modern apps |
| Structured data | JSON-LD `Product`, `Article`, `BreadcrumbList`, `FAQPage` | High-confidence typed extraction |
| Text statistics | word count, sentence count, commas, link density | Article vs boilerplate |
| Repetition | sibling count, structural similarity, field consistency | Product grids, feeds, listings |
| Visual geometry | bounding boxes, column layout, z-index, visibility | Sidebars, navigation, overlays |
| URL/text patterns | `/product/`, `/blog/`, `/news/`, currency, dates | Page-type inference |
| Interaction hints | inputs, buttons, placeholders, send icons | Forms, chat, search |
| DOM dynamics | mutation patterns, virtualized lists, streaming text | AI chat and infinite feeds |

Link density is especially valuable: navigation and footer regions tend to be link-heavy, while article bodies tend to have more prose and fewer links. Content-extraction research commonly uses hyperlink density and word density to distinguish main content from boilerplate.[^1_5][^1_6]

## 4. Replace fixed confidence with scoring

Each detector should emit candidates with a **score and evidence breakdown**:

```ts
interface DetectionCandidate {
  detector: string;
  kind: PatternType;
  nodeId: string;
  score: number;              // 0..1
  confidence: number;         // calibrated
  evidence: Evidence[];
  boundary: 'node' | 'subtree' | 'siblings';
  fields: Partial<Record<string, FieldCandidate>>;
}

interface Evidence {
  signal: string;
  weight: number;
  value: unknown;
  explanation: string;
}
```

Example article scoring:

```ts
score =
  0.22 * proseDensity +
  0.16 * headingStructure +
  0.14 * semanticArticleSignal +
  0.12 * jsonLdArticleSignal +
  0.10 * paragraphCount +
  0.08 * lowLinkDensity +
  0.08 * readingTimeSignal +
  0.06 * bylineDateSignal -
  0.20 * navigationLikeness -
  0.15 * commerceLikeness -
  0.10 * boilerplateLikeness
```

Use a two-stage score:

1. **Raw detector score** — how article-like/product-like/chat-like the region is.
2. **Calibrated confidence** — how likely the final classification is correct, learned from a labeled evaluation set.

Never expose raw heuristic scores as user-facing confidence until you have calibration data.

## 5. Arbitrate overlapping detections

Your current engine runs every detector independently and concatenates results. That will produce overlapping detections: an article may contain tables, lists, images, and comments; a product page may contain a product grid, reviews, breadcrumbs, and related products.[^1_1]

Add a `RegionArbiter`:

- Detect containment: if region A contains region B, decide whether B is a **child region** or competing detection.
- Resolve conflicts by specificity: `product` beats generic `list`; `article` beats generic `text`.
- Preserve nested structure: an article can contain a table, but the table should not become a competing “main content” candidate.
- Merge sibling candidates when they share structure and visual alignment.
- Reject tiny or duplicate regions using text hashes and DOM signatures.

Output should be hierarchical:

```ts
interface ExtractionRegion {
  id: string;
  kind: PatternType;
  confidence: number;
  selector: StableSelector;
  children: ExtractionRegion[];
  data?: unknown;
  evidence: Evidence[];
}
```


## 6. Add page-type classification

Page-type detection should be separate from element detection.

```ts
type PageType =
  | 'article'
  | 'blog_index'
  | 'news_article'
  | 'product_detail'
  | 'product_listing'
  | 'search_results'
  | 'ai_chat'
  | 'documentation'
  | 'dashboard'
  | 'login'
  | 'landing_page'
  | 'forum_thread'
  | 'unknown';
```

Classify using aggregate page evidence:

```text
AI chat:
- message-like repeated blocks
- user/assistant role hints
- input/composer near bottom
- streaming text containers
- low traditional navigation density

Product detail:
- JSON-LD Product
- price + availability + title + images
- add-to-cart controls
- breadcrumbs
- variant selectors

Product listing:
- repeated product cards
- price recurrence
- pagination
- category/filter sidebar

Article:
- long prose region
- headline + byline/date
- paragraphs and headings
- JSON-LD Article/NewsArticle

Navigation:
- high link density
- repeated horizontal/vertical menu items
- header/footer placement
```

The page classifier should not replace region detection; it should **bias** it. For example, on a product page, a repeated card list should preferentially be interpreted as a product grid rather than a generic list.

## 7. Make detectors extensible

Your current plugin contract is:

```ts
detect(root: HTMLElement): ExtractedDataNode[]
```

Change it to:

```ts
interface DetectorPlugin {
  id: string;
  kinds: PatternType[];
  version: string;

  // Cheap prefilter
  applies(ctx: DetectionContext): boolean;

  // Produce scored candidates
  detect(ctx: DetectionContext): DetectionCandidate[];

  // Optional: extract after arbitration selects this candidate
  extract?(
    candidate: DetectionCandidate,
    ctx: DetectionContext
  ): Promise<ExtractedRegionData>;
}
```

This gives you three extension points:

- **Built-in detectors**: article, product, chat, table, list, navigation.
- **Site-specific plugins**: rules for Shopify, Amazon, WordPress, Reddit, Notion, etc.
- **User-defined rules**: JSON/YAML selectors plus field mappings, compiled into detector plugins.

Example custom rule:

```json
{
  "id": "shopify-product",
  "kind": "product",
  "match": {
    "jsonLd": { "@type": "Product" },
    "or": [
      { "selector": "[itemprop=offers]" },
      { "textPattern": "\\$\\d+(\\.\\d{2})?" }
    ]
  },
  "fields": {
    "title": { "selector": "h1" },
    "price": { "selector": "[itemprop=price], .price" },
    "availability": { "selector": "[itemprop=availability]" }
  }
}
```


## 8. Use structured data as a strong prior

JSON-LD should be a first-class signal, not merely another DOM heuristic.

- `Article`, `NewsArticle`, `BlogPosting` → article prior
- `Product`, `Offer`, `AggregateRating` → product prior
- `BreadcrumbList` → breadcrumb region
- `FAQPage` → FAQ region
- `ItemList` → listing/grid prior
- `WebSite`, `Organization` → site metadata

But do not blindly trust it. Use it to raise or lower detector scores, then validate that the referenced DOM region actually contains the expected content.

## 9. Detection recipes

### Article / blog

Strong signals:

- Long prose block with multiple paragraphs
- `article`, `main`, `[role=main]`
- `h1` followed by paragraphs
- author, published date, reading time
- JSON-LD `Article` / `BlogPosting`
- low link density in the main body
- headings distributed through the content

Output:

```ts
{
  kind: 'article',
  data: {
    title,
    author,
    publishedAt,
    updatedAt,
    readingTimeMinutes,
    bodyMarkdown,
    headings,
    images,
    links,
    references
  }
}
```


### Product detail

Strong signals:

- JSON-LD `Product`
- price and currency
- availability
- primary image/gallery
- variant selectors
- add-to-cart button
- description region
- reviews/ratings

Output:

```ts
{
  kind: 'product',
  data: {
    title,
    brand,
    price,
    currency,
    availability,
    rating,
    reviewCount,
    images,
    variants,
    description,
    breadcrumbs,
    sku
  }
}
```


### Product grid / listing

Strong signals:

- Parent with many structurally similar children
- Each child has image + title + price/link
- Pagination or infinite scroll controls
- Filter sidebar
- JSON-LD `ItemList`

Use structural fingerprinting:

```ts
interface StructuralFingerprint {
  childTagPattern: string;
  classTokenPattern: string;
  fieldPresence: string[];
  textDensityRange: [number, number];
  imageCountRange: [number, number];
}
```

Group children whose fingerprints are similar, then extract a repeated-item schema.

### AI chat

Strong signals:

- Repeated message containers
- Alternating roles: user/assistant, human/AI, question/answer
- Composer input near bottom
- Send button, microphone, attachment controls
- Streaming or incrementally appended text
- Copy/regenerate buttons
- Conversation sidebar

Do not rely on `data-message-role`; support multiple strategies:

- ARIA roles and labels
- Common class/name patterns
- Avatar + text-block alternation
- DOM mutation stream analysis
- Visual alignment: user messages often right-aligned, assistant messages left-aligned

Output:

```ts
{
  kind: 'ai_chat',
  data: {
    messages: [
      { role: 'user', text, timestamp?, attachments? },
      { role: 'assistant', text, model?, citations? }
    ],
    composer: {
      placeholder,
      hasAttachments,
      hasVoiceInput
    }
  }
}
```


### Tables

Strong signals:

- `table`, `[role=grid]`, `[role=table]`
- Consistent cell count per row
- Header row detection
- Repeating cell structure
- Sort/filter controls

Also detect **visual tables** built from divs:

- Repeated rows with aligned columns
- Similar child counts
- Grid/flex layout
- Consistent column text types

Output normalized rows:

```ts
{
  kind: 'table',
  data: {
    headers: string[],
    rows: Record<string, string | number | null>[],
    hasHeader: boolean,
    rowCount: number,
    columnCount: number
  }
}
```


### Navigation / boilerplate

Strong signals:

- High link density
- Repeated short link labels
- Header/footer placement
- `nav`, `header`, `footer`, `aside`
- Low unique text relative to link count

Classify as:

```ts
type BoilerplateKind =
  | 'primary_navigation'
  | 'footer_navigation'
  | 'breadcrumb'
  | 'sidebar'
  | 'pagination'
  | 'legal'
  | 'promo'
  | 'cookie_banner';
```

This is essential: boilerplate classification improves every other detector by letting them exclude noise.

## 10. Stable selectors and re-extraction

For a browser extension, detection is only half the problem. You need selectors that survive navigation and minor DOM changes.

Generate multiple locator strategies:

```ts
interface StableSelector {
  primary: string;
  fallbacks: string[];
  strategy: 'semantic' | 'structural' | 'visual' | 'text' | 'custom-rule';
  robustness: number;
}
```

Priority:

1. Stable `data-*` attribute
2. ARIA role + accessible name
3. Semantic tag + structural position
4. Text signature
5. CSS path
6. XPath
7. Visual fingerprint

For repeated items, store a **container selector + item selector + field selectors**, not one giant CSS path.

## 11. Evaluation set is non-negotiable

Build a fixture corpus before expanding detectors.

```text
tests/fixtures/
  article/wordpress-1.html
  article/medium-1.html
  article/news-site-1.html
  product/shopify-1.html
  product/amazon-1.html
  product-grid/shopify-collection-1.html
  ai-chat/chatgpt-like-1.html
  ai-chat/claude-like-1.html
  table/docs-table-1.html
  table/dashboard-table-1.html
  navigation/header-footer-1.html
```

Each fixture needs expected output:

```json
{
  "pageType": "article",
  "expectedRegions": [
    {
      "kind": "article",
      "mustContain": ["headline text", "body paragraph"],
      "mustNotContain": ["cookie banner", "footer links"]
    },
    {
      "kind": "table",
      "mustContainRows": 4
    }
  ]
}
```

Track:

- Region precision: did it detect the right region?
- Boundary precision: did it include too much or too little?
- Field F1: title, price, author, message role, etc.
- Selector stability across DOM variants
- Runtime and memory on large pages


## 12. Implementation sequence

### Phase 1: Foundation

1. Add `DomNormalizer`, `DomPruner`, and `BlockSegmenter`.
2. Replace direct `HTMLElement` detector input with `DetectionContext`.
3. Add feature extraction: text, links, headings, semantics, geometry, repetition.
4. Change `DetectorPlugin.detect()` to return scored candidates.
5. Add `RegionArbiter` to resolve containment and overlap.

### Phase 2: Core detectors

6. Rebuild `ArticleDetector` using prose/heading/link-density scoring.
7. Rebuild `TableDetector` with header inference and visual-table support.
8. Add `ListDetector` and `NavigationDetector`.
9. Add boilerplate classification.
10. Add page-type classifier.

### Phase 3: High-value verticals

11. Add `ProductDetector`.
12. Add `ProductGridDetector`.
13. Add `AiChatDetector`.
14. Add `FormDetector`, `CommentDetector`, `BreadcrumbDetector`, and `PaginationDetector`.

### Phase 4: Extensibility

15. Add custom rule schema and rule compiler.
16. Add site-profile storage.
17. Add user correction/feedback flow.
18. Add selector stability testing.
19. Add fixture-based benchmark suite.

## Immediate refactor

The first concrete code change should be to stop returning final nodes from detectors. Your `ExtractorEngine` currently registers detectors and simply concatenates their `ExtractedDataNode[]` results.[^1_1]

Replace that with:

```ts
export class ExtractorEngine {
  async extract(root: HTMLElement, options?: ExtractionOptions) {
    const context = await DetectionContext.create(root, options);

    const candidates = this.detectors
      .filter((detector) => detector.applies(context))
      .flatMap((detector) => detector.detect(context));

    const regions = this.arbiter.resolve(candidates, context);
    const pageType = this.pageClassifier.classify(regions, context);

    return this.extractRegions(regions, pageType, context);
  }
}
```

That single architectural change lets you add sophisticated article, product, chat, table, and navigation detection without rewriting the extension UI or output layer.

The target is not “more selectors.” It is a **multi-signal DOM understanding engine**: normalize the page, segment it into meaningful blocks, score competing interpretations, arbitrate overlaps, infer page intent, and only then extract typed data.

<span style="display:none">[^1_10][^1_11][^1_12][^1_13][^1_14][^1_15][^1_16][^1_7][^1_8][^1_9]</span>

<div align="center">⁂</div>

[^1_1]: DtataExtractor.md

[^1_2]: https://github.com/mozilla/readability/blob/main/Readability.js

[^1_3]: https://github.com/mozilla/readability/blob/3ff9a166fb27928f222c4c0722e730eda412658a/Readability.js

[^1_4]: https://webcrawlerapi.com/blog/mozilla-readability-algorithm-readabilityjs

[^1_5]: https://www.scitepress.org/Papers/2023/121620/121620.pdf

[^1_6]: https://www.ccs.neu.edu/home/vip/teach/IRcourse/6_ML/other_notes/Boilerplate%20Detection%20using%20Shallow%20Text%20Features.pdf

[^1_7]: https://pub.dev/documentation/html_readability/latest/

[^1_8]: https://pypi.org/project/trafilatura/0.1.1/

[^1_9]: https://pypi.org/project/trafilatura/0.2.0/

[^1_10]: https://pypi.org/project/trafilatura/0.1.0/

[^1_11]: https://arxiv.org/html/1801.02607v3

[^1_12]: https://github.com/mozilla/readability/blob/8e8ec27cd2013940bc6f3cc609de10e35a1d9d86/Readability.js

[^1_13]: https://deepwiki.com/mozilla/readability/2-core-content-extraction-system

[^1_14]: https://deepwiki.com/mozilla/readability/5-content-extraction-process

[^1_15]: https://openapps.pro/packages/mozilla-readability

[^1_16]: https://docs.rs/readabilityrs/latest/readabilityrs/


---

# Show me the DomNormalizer and DomPruner code

Below is an implementation-ready starting point for `DomNormalizer` and `DomPruner`. They operate on a cloned DOM so the live page is never mutated, produce a lightweight feature tree for downstream scoring, and remove obvious noise before block segmentation.

## Types

```ts
// src/dom/types.ts

export type VisibilityState = 'visible' | 'hidden' | 'removed' | 'offscreen';

export interface DomFeatures {
  tag: string;
  id?: string;
  classes: string[];
  role?: string;

  text: string;
  textLength: number;
  wordCount: number;

  linkText: string;
  linkTextLength: number;
  linkCount: number;
  linkDensity: number;

  imageCount: number;
  inputCount: number;
  buttonCount: number;
  tableCount: number;
  listCount: number;
  headingCount: number;
  paragraphCount: number;

  hasJsonLd: boolean;
  jsonLdTypes: string[];

  depth: number;
  childElementCount: number;

  rect?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };

  visibility: VisibilityState;
}

export interface NormalizedDomNode {
  nodeId: string;
  parentId?: string;
  element: Element;
  features: DomFeatures;
  children: NormalizedDomNode[];
}

export interface NormalizationResult {
  root: NormalizedDomNode;
  nodeById: Map<string, NormalizedDomNode>;
  jsonLd: unknown[];
  stats: {
    totalElements: number;
    prunedElements: number;
    hiddenElements: number;
    jsonLdBlocks: number;
  };
}

export interface DomPrunerOptions {
  removeScripts?: boolean;
  removeStyles?: boolean;
  removeHidden?: boolean;
  removeIframes?: boolean;
  removeSvg?: boolean;
  removeNoScript?: boolean;
  removeTemplate?: boolean;
  removeCommonNoise?: boolean;
  preserveShadowDom?: boolean;
  maxDepth?: number;
}

export const DEFAULT_PRUNER_OPTIONS: Required<DomPrunerOptions> = {
  removeScripts: true,
  removeStyles: true,
  removeHidden: true,
  removeIframes: false,
  removeSvg: false,
  removeNoScript: true,
  removeTemplate: true,
  removeCommonNoise: true,
  preserveShadowDom: true,
  maxDepth: 80,
};
```


## DomPruner

The pruner works on a **clone**, marks noise as removed, and returns a cleaned root. It does not delete nodes from the original page.

```ts
// src/dom/DomPruner.ts

import {
  DEFAULT_PRUNER_OPTIONS,
  DomPrunerOptions,
} from './types';

const NOISE_SELECTORS = [
  '[aria-hidden="true"]',
  '[role="presentation"]',
  '[data-testid*="cookie"] i',
  '[class*="cookie-banner" i]',
  '[class*="cookie-consent" i]',
  '[class*="gdpr" i]',
  '[class*="consent" i]',
  '[id*="cookie-banner" i]',
  '[id*="cookie-consent" i]',
  '[class*="advertisement" i]',
  '[class*="advert" i]',
  '[class*="adsbygoogle" i]',
  '[class*="sponsor" i]',
  '[class*="newsletter-popup" i]',
  '[class*="modal-overlay" i]',
  '[class*="paywall" i]',
];

const SCRIPT_LIKE_TAGS = new Set([
  'SCRIPT',
  'NOSCRIPT',
  'TEMPLATE',
]);

const STYLE_LIKE_TAGS = new Set([
  'STYLE',
  'LINK',
]);

export class DomPruner {
  private readonly options: Required<DomPrunerOptions>;

  constructor(options: DomPrunerOptions = {}) {
    this.options = {
      ...DEFAULT_PRUNER_OPTIONS,
      ...options,
    };
  }

  prune(sourceRoot: ParentNode): {
    root: Element | DocumentFragment;
    stats: {
      prunedElements: number;
      hiddenElements: number;
    };
  } {
    const root = this.cloneRoot(sourceRoot);
    const stats = {
      prunedElements: 0,
      hiddenElements: 0,
    };

    this.pruneNode(root as Element, stats, 0);

    if (this.options.removeCommonNoise) {
      this.removeMatching(root as Element, NOISE_SELECTORS, stats);
    }

    return {
      root: root as Element,
      stats,
    };
  }

  private cloneRoot(sourceRoot: ParentNode): ParentNode {
    if (sourceRoot instanceof Document) {
      return sourceRoot.documentElement.cloneNode(true);
    }

    if (sourceRoot instanceof DocumentFragment) {
      return sourceRoot.cloneNode(true);
    }

    return (sourceRoot as Element).cloneNode(true);
  }

  private pruneNode(
    node: Element,
    stats: { prunedElements: number; hiddenElements: number },
    depth: number
  ): void {
    if (depth > this.options.maxDepth) {
      node.remove();
      stats.prunedElements++;
      return;
    }

    if (this.shouldRemoveTag(node)) {
      node.remove();
      stats.prunedElements++;
      return;
    }

    if (this.options.removeHidden && this.isHidden(node)) {
      stats.hiddenElements++;

      // Keep the node in the tree, but mark it for downstream exclusion.
      node.setAttribute('data-tx-pruned', 'hidden');
    }

    if (
      this.options.removeIframes &&
      this.matchesTag(node, ['IFRAME'])
    ) {
      node.remove();
      stats.prunedElements++;
      return;
    }

    if (
      this.options.removeSvg &&
      this.matchesTag(node, ['SVG'])
    ) {
      node.remove();
      stats.prunedElements++;
      return;
    }

    if (this.options.preserveShadowDom) {
      this.preserveShadowRoots(node);
    }

    for (const child of Array.from(node.children)) {
      this.pruneNode(child, stats, depth + 1);
    }
  }

  private shouldRemoveTag(node: Element): boolean {
    const tag = node.tagName.toUpperCase();

    if (this.options.removeScripts && SCRIPT_LIKE_TAGS.has(tag)) {
      return true;
    }

    if (this.options.removeStyles && STYLE_LIKE_TAGS.has(tag)) {
      return true;
    }

    if (this.options.removeNoScript && tag === 'NOSCRIPT') {
      return true;
    }

    if (this.options.removeTemplate && tag === 'TEMPLATE') {
      return true;
    }

    return false;
  }

  private isHidden(element: Element): boolean {
    if (element.hasAttribute('hidden')) {
      return true;
    }

    const ariaHidden = element.getAttribute('aria-hidden');
    if (ariaHidden === 'true') {
      return true;
    }

    const inlineStyle = element.getAttribute('style') ?? '';
    if (/display\s*:\s*none/i.test(inlineStyle)) {
      return true;
    }

    if (/visibility\s*:\s*hidden/i.test(inlineStyle)) {
      return true;
    }

    if (element instanceof HTMLElement) {
      if (element.hidden) {
        return true;
      }

      const computed = this.safeComputedStyle(element);

      if (computed) {
        if (computed.display === 'none') {
          return true;
        }

        if (computed.visibility === 'hidden') {
          return true;
        }

        if (Number(computed.opacity) === 0) {
          return true;
        }
      }
    }

    return false;
  }

  private preserveShadowRoots(element: Element): void {
    const shadowRoot = (element as HTMLElement & {
      shadowRoot?: ShadowRoot | null;
    }).shadowRoot;

    if (!shadowRoot) {
      return;
    }

    // A cloned element does not retain an attached ShadowRoot.
    // For now, expose its presence so the normalizer can treat it as a boundary.
    element.setAttribute('data-tx-has-shadow-root', 'true');
  }

  private removeMatching(
    root: Element,
    selectors: string[],
    stats: { prunedElements: number; hiddenElements: number }
  ): void {
    for (const selector of selectors) {
      let elements: Element[];

      try {
        elements = Array.from(root.querySelectorAll(selector));
      } catch {
        continue;
      }

      for (const element of elements) {
        element.remove();
        stats.prunedElements++;
      }
    }
  }

  private matchesTag(element: Element, tags: string[]): boolean {
    return tags.includes(element.tagName.toUpperCase());
  }

  private safeComputedStyle(element: HTMLElement): CSSStyleDeclaration | null {
    try {
      return window.getComputedStyle(element);
    } catch {
      return null;
    }
  }
}
```

One important caveat: `cloneNode(true)` does **not** clone an open Shadow Root. If Shadow DOM support matters, the normalizer should receive the original element as well, or the extension should serialize shadow content separately before normalization.

## DomNormalizer

The normalizer builds the feature tree used by detectors. It computes text/link statistics, semantic hints, JSON-LD, geometry where available, and stable node IDs.

```ts
// src/dom/DomNormalizer.ts

import {
  DomFeatures,
  NormalizationResult,
  NormalizedDomNode,
} from './types';
import { DomPruner } from './DomPruner';
import { DomPrunerOptions } from './types';

const CONTENT_TAGS = new Set([
  'P',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'LI',
  'BLOCKQUOTE',
  'PRE',
  'TD',
  'FIGCAPTION',
]);

const HEADING_TAGS = new Set([
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
]);

const NOISE_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'NOSCRIPT',
  'TEMPLATE',
]);

export interface DomNormalizerOptions extends DomPrunerOptions {
  includeGeometry?: boolean;
  textPreviewLength?: number;
}

export const DEFAULT_NORMALIZER_OPTIONS: Required<DomNormalizerOptions> = {
  removeScripts: true,
  removeStyles: true,
  removeHidden: true,
  removeIframes: false,
  removeSvg: false,
  removeNoScript: true,
  removeTemplate: true,
  removeCommonNoise: true,
  preserveShadowDom: true,
  maxDepth: 80,
  includeGeometry: true,
  textPreviewLength: 500,
};

export class DomNormalizer {
  private readonly pruner: DomPruner;
  private readonly options: Required<DomNormalizerOptions>;

  private nodeIdCounter = 0;
  private nodeById = new Map<string, NormalizedDomNode>();

  constructor(options: DomNormalizerOptions = {}) {
    this.options = {
      ...DEFAULT_NORMALIZER_OPTIONS,
      ...options,
    };

    this.pruner = new DomPruner(this.options);
  }

  normalize(source: ParentNode): NormalizationResult {
    this.nodeIdCounter = 0;
    this.nodeById = new Map();

    const { root, stats } = this.pruner.prune(source);
    const rootElement = root as Element;

    const jsonLd = this.extractJsonLd(rootElement);
    const normalizedRoot = this.buildNode(
      rootElement,
      undefined,
      0
    );

    return {
      root: normalizedRoot,
      nodeById: this.nodeById,
      jsonLd,
      stats: {
        totalElements: this.nodeById.size,
        prunedElements: stats.prunedElements,
        hiddenElements: stats.hiddenElements,
        jsonLdBlocks: jsonLd.length,
      },
    };
  }

  private buildNode(
    element: Element,
    parentId: string | undefined,
    depth: number
  ): NormalizedDomNode {
    const nodeId = this.createNodeId(element);
    const features = this.extractFeatures(element, depth);

    const node: NormalizedDomNode = {
      nodeId,
      parentId,
      element,
      features,
      children: [],
    };

    this.nodeById.set(nodeId, node);

    for (const child of Array.from(element.children)) {
      if (NOISE_TAGS.has(child.tagName.toUpperCase())) {
        continue;
      }

      node.children.push(
        this.buildNode(child, nodeId, depth + 1)
      );
    }

    this.aggregateChildFeatures(node);

    return node;
  }

  private extractFeatures(
    element: Element,
    depth: number
  ): DomFeatures {
    const text = this.cleanText(
      element.textContent ?? ''
    ).slice(0, this.options.textPreviewLength);

    const links = Array.from(element.querySelectorAll('a[href]'));
    const linkText = links
      .map((link) => link.textContent ?? '')
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    const textLength = text.length;
    const linkTextLength = linkText.length;

    const rect =
      this.options.includeGeometry && element instanceof HTMLElement
        ? this.safeRect(element)
        : undefined;

    return {
      tag: element.tagName.toLowerCase(),
      id: element.id || undefined,
      classes: Array.from(element.classList),
      role: element.getAttribute('role') ?? undefined,

      text,
      textLength,
      wordCount: this.countWords(text),

      linkText,
      linkTextLength,
      linkCount: links.length,
      linkDensity:
        textLength > 0
          ? Math.min(1, linkTextLength / textLength)
          : 0,

      imageCount: element.querySelectorAll('img, picture, [role=img]').length,
      inputCount: element.querySelectorAll('input, textarea, select').length,
      buttonCount: element.querySelectorAll(
        'button, [role=button], [type=submit]'
      ).length,
      tableCount: element.querySelectorAll(
        'table, [role=table], [role=grid]'
      ).length,
      listCount: element.querySelectorAll(
        'ul, ol, dl, [role=list]'
      ).length,
      headingCount: element.querySelectorAll(
        'h1, h2, h3, h4, h5, h6, [role=heading]'
      ).length,
      paragraphCount: element.querySelectorAll('p').length,

      hasJsonLd: this.hasJsonLd(element),
      jsonLdTypes: this.extractLocalJsonLdTypes(element),

      depth,
      childElementCount: element.children.length,

      rect,

      visibility: this.getVisibility(element),
    };
  }

  private aggregateChildFeatures(node: NormalizedDomNode): void {
    let linkCount = 0;
    let imageCount = 0;
    let inputCount = 0;
    let buttonCount = 0;
    let tableCount = 0;
    let listCount = 0;
    let headingCount = 0;
    let paragraphCount = 0;

    for (const child of node.children) {
      linkCount += child.features.linkCount;
      imageCount += child.features.imageCount;
      inputCount += child.features.inputCount;
      buttonCount += child.features.buttonCount;
      tableCount += child.features.tableCount;
      listCount += child.features.listCount;
      headingCount += child.features.headingCount;
      paragraphCount += child.features.paragraphCount;
    }

    node.features.linkCount = Math.max(
      node.features.linkCount,
      linkCount
    );
    node.features.imageCount = Math.max(
      node.features.imageCount,
      imageCount
    );
    node.features.inputCount = Math.max(
      node.features.inputCount,
      inputCount
    );
    node.features.buttonCount = Math.max(
      node.features.buttonCount,
      buttonCount
    );
    node.features.tableCount = Math.max(
      node.features.tableCount,
      tableCount
    );
    node.features.listCount = Math.max(
      node.features.listCount,
      listCount
    );
    node.features.headingCount = Math.max(
      node.features.headingCount,
      headingCount
    );
    node.features.paragraphCount = Math.max(
      node.features.paragraphCount,
      paragraphCount
    );
  }

  private extractJsonLd(root: Element): unknown[] {
    const results: unknown[] = [];

    const scripts = Array.from(
      root.querySelectorAll('script[type="application/ld+json"]')
    );

    for (const script of scripts) {
      try {
        const parsed = JSON.parse(script.textContent ?? '');

        if (Array.isArray(parsed)) {
          results.push(...parsed);
        } else {
          results.push(parsed);
        }
      } catch {
        // Ignore malformed JSON-LD.
      }
    }

    return results;
  }

  private hasJsonLd(element: Element): boolean {
    return element.querySelector(
      'script[type="application/ld+json"]'
    ) !== null;
  }

  private extractLocalJsonLdTypes(element: Element): string[] {
    const scripts = Array.from(
      element.querySelectorAll('script[type="application/ld+json"]')
    );

    const types: string[] = [];

    for (const script of scripts) {
      try {
        const parsed = JSON.parse(script.textContent ?? '');
        this.collectJsonLdTypes(parsed, types);
      } catch {
        // Ignore malformed JSON-LD.
      }
    }

    return Array.from(new Set(types));
  }

  private collectJsonLdTypes(value: unknown, output: string[]): void {
    if (!value || typeof value !== 'object') {
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        this.collectJsonLdTypes(item, output);
      }
      return;
    }

    const record = value as Record<string, unknown>;
    const type = record['@type'];

    if (typeof type === 'string') {
      output.push(type);
    } else if (Array.isArray(type)) {
      for (const item of type) {
        if (typeof item === 'string') {
          output.push(item);
        }
      }
    }

    for (const child of Object.values(record)) {
      this.collectJsonLdTypes(child, output);
    }
  }

  private getVisibility(element: Element): DomFeatures['visibility'] {
    if (element.hasAttribute('data-tx-pruned')) {
      return 'hidden';
    }

    if (element instanceof HTMLElement) {
      const computed = this.safeComputedStyle(element);

      if (computed?.display === 'none') {
        return 'hidden';
      }

      if (computed?.visibility === 'hidden') {
        return 'hidden';
      }
    }

    return 'visible';
  }

  private safeRect(element: HTMLElement) {
    try {
      const rect = element.getBoundingClientRect();

      return {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      };
    } catch {
      return undefined;
    }
  }

  private safeComputedStyle(element: HTMLElement) {
    try {
      return window.getComputedStyle(element);
    } catch {
      return null;
    }
  }

  private createNodeId(element: Element): string {
    this.nodeIdCounter++;
    return `n${this.nodeIdCounter}`;
  }

  private countWords(text: string): number {
    if (!text) {
      return 0;
    }

    return text
      .trim()
      .split(/\s+/)
      .filter(Boolean).length;
  }

  private cleanText(text: string): string {
    return text
      .replace(/\s+/g, ' ')
      .trim();
  }
}
```


## Usage

```ts
import { DomNormalizer } from './dom/DomNormalizer';

const normalizer = new DomNormalizer({
  removeHidden: true,
  removeCommonNoise: true,
  includeGeometry: true,
});

const result = normalizer.normalize(document);

console.log(result.stats);
console.log(result.root.features);
console.log(result.jsonLd);
```


## What this enables next

With this normalized tree, your `ArticleDetector` no longer needs to begin with `root.querySelectorAll('article, main, [role=main]')`. It can instead scan `result.root` for subtrees with high `paragraphCount`, meaningful `wordCount`, low `linkDensity`, heading structure, and optional JSON-LD `Article` signals.

The next component should be `BlockSegmenter`: it consumes `NormalizedDomNode`, identifies paragraph/list/table/card/chat blocks, and emits candidate regions for scoring.

---

# ok proceed next

Next is the `BlockSegmenter`. It consumes the normalized DOM tree, identifies meaningful content blocks and repeated structures, then emits scored candidate regions for the future detector/scoring layer.

## Block types

```ts
// src/dom/blockTypes.ts

export type BlockKind =
  | 'paragraph'
  | 'heading'
  | 'list'
  | 'table'
  | 'card_grid'
  | 'chat_message'
  | 'form'
  | 'media'
  | 'navigation'
  | 'breadcrumb'
  | 'generic';

export interface BlockCandidate {
  blockId: string;
  kind: BlockKind;
  nodeId: string;
  element: Element;

  score: number;
  confidence: number;

  text: string;
  wordCount: number;
  linkDensity: number;

  childCount: number;
  itemNodeIds: string[];

  metadata: Record<string, unknown>;
}

export interface SegmentationResult {
  blocks: BlockCandidate[];
  blocksByNodeId: Map<string, BlockCandidate[]>;
  stats: {
    totalBlocks: number;
    byKind: Record<BlockKind, number>;
  };
}
```


## BlockSegmenter

```ts
// src/dom/BlockSegmenter.ts

import {
  NormalizedDomNode,
  NormalizationResult,
} from './types';
import {
  BlockCandidate,
  BlockKind,
  SegmentationResult,
} from './blockTypes';

const HEADING_TAGS = new Set(['H1', 'H2', 'H3', 'H4', 'H5', 'H6']);

const LIST_TAGS = new Set(['UL', 'OL', 'DL']);

const TABLE_TAGS = new Set(['TABLE']);

const MEDIA_TAGS = new Set(['FIGURE', 'PICTURE', 'VIDEO', 'AUDIO']);

const NAV_TAGS = new Set(['NAV', 'HEADER', 'FOOTER']);

const FORM_TAGS = new Set(['FORM']);

const CHAT_ROLE_PATTERNS = [
  /data-message-role/i,
  /data-role/i,
  /message-role/i,
  /chat-message/i,
  /conversation-turn/i,
  /role=["']?(user|assistant|ai|human|bot)/i,
];

const CARD_CLASS_PATTERNS = [
  /card/i,
  /product/i,
  /listing/i,
  /result/i,
  /item/i,
  /tile/i,
  /post/i,
  /entry/i,
];

export interface BlockSegmenterOptions {
  minParagraphWords?: number;
  minListItems?: number;
  minTableRows?: number;
  minCardGridItems?: number;
  maxBlocks?: number;
}

export const DEFAULT_BLOCK_SEGMENTER_OPTIONS: Required<BlockSegmenterOptions> = {
  minParagraphWords: 8,
  minListItems: 2,
  minTableRows: 2,
  minCardGridItems: 3,
  maxBlocks: 800,
};

export class BlockSegmenter {
  private readonly options: Required<BlockSegmenterOptions>;

  private blockIdCounter = 0;
  private blocks: BlockCandidate[] = [];

  constructor(options: BlockSegmenterOptions = {}) {
    this.options = {
      ...DEFAULT_BLOCK_SEGMENTER_OPTIONS,
      ...options,
    };
  }

  segment(normalized: NormalizationResult): SegmentationResult {
    this.blockIdCounter = 0;
    this.blocks = [];

    this.walk(normalized.root, 0);

    const byKind = {} as Record<BlockKind, number>;

    for (const block of this.blocks) {
      byKind[block.kind] = (byKind[block.kind] ?? 0) + 1;
    }

    const blocksByNodeId = new Map<string, BlockCandidate[]>();

    for (const block of this.blocks) {
      const existing = blocksByNodeId.get(block.nodeId) ?? [];
      existing.push(block);
      blocksByNodeId.set(block.nodeId, existing);
    }

    return {
      blocks: this.blocks,
      blocksByNodeId,
      stats: {
        totalBlocks: this.blocks.length,
        byKind,
      },
    };
  }

  private walk(node: NormalizedDomNode, depth: number): void {
    if (this.blocks.length >= this.options.maxBlocks) {
      return;
    }

    if (node.features.visibility !== 'hidden') {
      const block = this.classify(node);

      if (block) {
        this.blocks.push(block);
      }
    }

    for (const child of node.children) {
      this.walk(child, depth + 1);
    }
  }

  private classify(node: NormalizedDomNode): BlockCandidate | null {
    const element = node.element;
    const tag = element.tagName.toUpperCase();
    const role = node.features.role?.toLowerCase();

    if (HEADING_TAGS.has(tag) || role === 'heading') {
      return this.createBlock(node, 'heading', {
        level: this.getHeadingLevel(element),
        text: node.features.text,
      });
    }

    if (TABLE_TAGS.has(tag) || role === 'table' || role === 'grid') {
      return this.classifyTable(node);
    }

    if (LIST_TAGS.has(tag) || role === 'list') {
      return this.classifyList(node);
    }

    if (FORM_TAGS.has(tag) || role === 'form') {
      return this.createBlock(node, 'form', {
        inputCount: node.features.inputCount,
        buttonCount: node.features.buttonCount,
      });
    }

    if (MEDIA_TAGS.has(tag)) {
      return this.createBlock(node, 'media', {
        imageCount: node.features.imageCount,
      });
    }

    if (NAV_TAGS.has(tag) || role === 'navigation') {
      return this.classifyNavigation(node);
    }

    if (this.looksLikeChatMessage(node)) {
      return this.classifyChatMessage(node);
    }

    if (tag === 'P' || role === 'paragraph') {
      return this.classifyParagraph(node);
    }

    const cardGrid = this.classifyCardGrid(node);

    if (cardGrid) {
      return cardGrid;
    }

    if (this.looksLikeBreadcrumb(node)) {
      return this.createBlock(node, 'breadcrumb', {
        linkCount: node.features.linkCount,
      });
    }

    return null;
  }

  private classifyParagraph(
    node: NormalizedDomNode
  ): BlockCandidate | null {
    const words = node.features.wordCount;

    if (words < this.options.minParagraphWords) {
      return null;
    }

    const proseScore = this.scoreProse(node);

    if (proseScore < 0.35) {
      return null;
    }

    return this.createBlock(node, 'paragraph', {
      wordCount: words,
      linkDensity: node.features.linkDensity,
      proseScore,
    }, proseScore);
  }

  private classifyList(node: NormalizedDomNode): BlockCandidate | null {
    const items = Array.from(
      node.element.querySelectorAll(':scope > li, :scope > [role=listitem]')
    );

    if (items.length < this.options.minListItems) {
      return null;
    }

    const itemNodeIds = items.map((_, index) => `${node.nodeId}:list-item:${index}`);

    const score =
      0.45 +
      Math.min(0.25, items.length * 0.02) +
      (node.features.linkDensity > 0.5 ? -0.1 : 0.05);

    return this.createBlock(
      node,
      'list',
      {
        itemCount: items.length,
        ordered: node.element.tagName === 'OL',
        linkDensity: node.features.linkDensity,
      },
      clamp(score)
    );
  }

  private classifyTable(node: NormalizedDomNode): BlockCandidate | null {
    const rows = Array.from(
      node.element.querySelectorAll(':scope tr, :scope [role=row]')
    );

    if (rows.length < this.options.minTableRows) {
      return null;
    }

    const headerCount = node.element.querySelectorAll(
      ':scope th, :scope [role=columnheader]'
    ).length;

    const score =
      0.65 +
      Math.min(0.2, rows.length * 0.01) +
      (headerCount > 0 ? 0.1 : 0);

    return this.createBlock(
      node,
      'table',
      {
        rowCount: rows.length,
        headerCount,
        hasHeader: headerCount > 0,
      },
      clamp(score)
    );
  }

  private classifyCardGrid(
    node: NormalizedDomNode
  ): BlockCandidate | null {
    const children = Array.from(node.element.children);

    if (children.length < this.options.minCardGridItems) {
      return null;
    }

    const fingerprints = children.map((child) =>
      this.createStructuralFingerprint(child)
    );

    const similarity = this.calculateFingerprintSimilarity(fingerprints);

    if (similarity < 0.55) {
      return null;
    }

    const cardish = children.filter((child) =>
      CARD_CLASS_PATTERNS.some((pattern) =>
        pattern.test(child.className)
      )
    ).length;

    const hasImages = node.features.imageCount >= children.length * 0.5;
    const hasLinks = node.features.linkCount >= children.length * 0.5;

    let score = similarity * 0.55;

    if (cardish / children.length > 0.5) {
      score += 0.15;
    }

    if (hasImages) {
      score += 0.12;
    }

    if (hasLinks) {
      score += 0.08;
    }

    if (score < 0.45) {
      return null;
    }

    const itemNodeIds = children.map((_, index) => `${node.nodeId}:card:${index}`);

    return this.createBlock(
      node,
      'card_grid',
      {
        itemCount: children.length,
        structuralSimilarity: similarity,
        cardishRatio: cardish / children.length,
        hasImages,
        hasLinks,
      },
      clamp(score)
    );
  }

  private classifyChatMessage(
    node: NormalizedDomNode
  ): BlockCandidate | null {
    const role = this.inferChatRole(node.element);
    const text = node.features.text;

    if (!text || text.length < 2) {
      return null;
    }

    const score = role ? 0.82 : 0.55;

    return this.createBlock(
      node,
      'chat_message',
      {
        inferredRole: role,
        textLength: text.length,
      },
      clamp(score)
    );
  }

  private classifyNavigation(
    node: NormalizedDomNode
  ): BlockCandidate | null {
    const linkDensity = node.features.linkDensity;
    const linkCount = node.features.linkCount;

    if (linkCount < 2) {
      return null;
    }

    const score = clamp(
      0.45 +
      linkDensity * 0.35 +
      Math.min(0.15, linkCount * 0.01)
    );

    return this.createBlock(
      node,
      'navigation',
      {
        linkCount,
        linkDensity,
      },
      score
    );
  }

  private looksLikeChatMessage(node: NormalizedDomNode): boolean {
    const element = node.element;
    const outer = element.outerHTML.slice(0, 2000);

    return CHAT_ROLE_PATTERNS.some((pattern) => pattern.test(outer));
  }

  private looksLikeBreadcrumb(node: NormalizedDomNode): boolean {
    const element = node.element;
    const classAndId = `${element.id} ${element.className}`.toLowerCase();

    const nameSignal =
      /breadcrumb|breadcrumbs|trail/.test(classAndId) ||
      element.getAttribute('aria-label')?.toLowerCase().includes('breadcrumb');

    const structuralSignal =
      node.features.linkCount >= 2 &&
      node.features.wordCount < 80 &&
      node.features.linkDensity > 0.5;

    return Boolean(nameSignal || structuralSignal);
  }

  private inferChatRole(element: Element): string | null {
    const explicit =
      element.getAttribute('data-message-role') ??
      element.getAttribute('data-role') ??
      element.getAttribute('role');

    if (explicit) {
      const normalized = explicit.toLowerCase();

      if (['user', 'human'].includes(normalized)) {
        return 'user';
      }

      if (['assistant', 'ai', 'bot', 'model'].includes(normalized)) {
        return 'assistant';
      }
    }

    const classAndId = `${element.id} ${element.className}`.toLowerCase();

    if (/user|human|question/.test(classAndId)) {
      return 'user';
    }

    if (/assistant|bot|ai|answer|model/.test(classAndId)) {
      return 'assistant';
    }

    return null;
  }

  private createStructuralFingerprint(element: Element): string {
    const children = Array.from(element.children);

    const childTags = children
      .map((child) => child.tagName.toLowerCase())
      .join('>');

    const classTokens = Array.from(element.classList)
      .map((token) => token.replace(/\d+/g, '#'))
      .sort()
      .slice(0, 6)
      .join('|');

    const imageCount = element.querySelectorAll('img').length;
    const linkCount = element.querySelectorAll('a').length;
    const textLength = (element.textContent ?? '').trim().length;

    return [
      element.tagName,
      childTags,
      classTokens,
      `img:${bucket(imageCount)}`,
      `link:${bucket(linkCount)}`,
      `text:${bucket(textLength)}`,
    ].join('::');
  }

  private calculateFingerprintSimilarity(
    fingerprints: string[]
  ): number {
    if (fingerprints.length < 2) {
      return 0;
    }

    const counts = new Map<string, number>();

    for (const fingerprint of fingerprints) {
      counts.set(fingerprint, (counts.get(fingerprint) ?? 0) + 1);
    }

    const dominant = Math.max(...counts.values());

    return dominant / fingerprints.length;
  }

  private scoreProse(node: NormalizedDomNode): number {
    const wordScore = clamp(node.features.wordCount / 80);
    const linkPenalty = 1 - node.features.linkDensity;
    const punctuationBonus = /[.,;:!?]/.test(node.features.text) ? 0.1 : 0;

    return clamp(
      wordScore * 0.65 +
      linkPenalty * 0.25 +
      punctuationBonus
    );
  }

  private getHeadingLevel(element: Element): number {
    const tag = element.tagName.toUpperCase();

    if (HEADING_TAGS.has(tag)) {
      return Number(tag.slice(1));
    }

    const ariaLevel = element.getAttribute('aria-level');

    return ariaLevel ? Number(ariaLevel) : 1;
  }

  private createBlock(
    node: NormalizedDomNode,
    kind: BlockKind,
    metadata: Record<string, unknown> = {},
    score = 0.5
  ): BlockCandidate {
    this.blockIdCounter++;

    return {
      blockId: `b${this.blockIdCounter}`,
      kind,
      nodeId: node.nodeId,
      element: node.element,
      score: clamp(score),
      confidence: clamp(score),
      text: node.features.text,
      wordCount: node.features.wordCount,
      linkDensity: node.features.linkDensity,
      childCount: node.features.childElementCount,
      itemNodeIds: [],
      metadata,
    };
  }
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function bucket(value: number): string {
  if (value === 0) return '0';
  if (value <= 2) return '1-2';
  if (value <= 5) return '3-5';
  if (value <= 20) return '6-20';
  return '20+';
}
```


## Usage

```ts
import { DomNormalizer } from './dom/DomNormalizer';
import { BlockSegmenter } from './dom/BlockSegmenter';

const normalizer = new DomNormalizer();
const normalized = normalizer.normalize(document);

const segmenter = new BlockSegmenter({
  minParagraphWords: 10,
  minCardGridItems: 4,
});

const segmentation = segmenter.segment(normalized);

console.log(segmentation.stats);
console.log(segmentation.blocks);
```


## What it detects

| Block kind | Primary evidence |
| :-- | :-- |
| `paragraph` | Enough words, low link density, punctuation |
| `heading` | `h1`–`h6`, `role=heading` |
| `list` | `ul`, `ol`, `dl`, repeated list items |
| `table` | `table`, ARIA table/grid, repeated rows |
| `card_grid` | Many structurally similar siblings, images/links, card-like naming |
| `chat_message` | Role attributes, chat class patterns, user/assistant hints |
| `form` | `form`, inputs, submit controls |
| `media` | `figure`, `picture`, `video`, `audio` |
| `navigation` | High link density, `nav`/`header`/`footer` |
| `breadcrumb` | Breadcrumb naming or link-heavy short trail |

## Important design decision

The segmenter intentionally does **not** decide “this is an article” or “this is a product grid.” It only says:

- “This is a prose block.”
- “This is a table-like structure.”
- “This parent has 24 similar children and looks like a card grid.”
- “This message has an inferred `assistant` role.”

The next layer, `RegionGrouper`, should merge adjacent blocks into larger semantic regions:

```text
paragraph + heading + paragraph + paragraph
  → article_region candidate

card_grid + pagination + filters
  → product_listing_region candidate

chat_message + chat_message + composer
  → ai_chat_region candidate
```

After that, `DetectorPlugin`s score those regions using page-level evidence such as JSON-LD, URL patterns, semantic tags, and visual layout.

---

# ok proceed next

Next is the `RegionGrouper`. It takes the block candidates produced by `BlockSegmenter` and merges related blocks into larger semantic regions, such as `article`, `product_listing`, `ai_chat`, `data_table`, and `navigation`.

## Region types

```ts
// src/dom/regionTypes.ts

import { BlockCandidate, BlockKind } from './blockTypes';

export type RegionKind =
  | 'article'
  | 'blog_index'
  | 'product'
  | 'product_listing'
  | 'ai_chat'
  | 'data_table'
  | 'list'
  | 'navigation'
  | 'breadcrumb'
  | 'form'
  | 'media'
  | 'generic';

export interface RegionCandidate {
  regionId: string;
  kind: RegionKind;
  nodeId: string;
  element: Element;

  score: number;
  confidence: number;

  blockIds: string[];
  blockKinds: BlockKind[];

  text: string;
  wordCount: number;
  linkDensity: number;

  metadata: Record<string, unknown>;
}

export interface RegionGroupingResult {
  regions: RegionCandidate[];
  regionsByNodeId: Map<string, RegionCandidate[]>;
  stats: {
    totalRegions: number;
    byKind: Record<RegionKind, number>;
  };
}
```


## RegionGrouper

```ts
// src/dom/RegionGrouper.ts

import {
  BlockCandidate,
  BlockKind,
} from './blockTypes';
import {
  RegionCandidate,
  RegionGroupingResult,
  RegionKind,
} from './regionTypes';

export interface RegionGrouperOptions {
  minArticleWords?: number;
  minArticleParagraphs?: number;
  minChatMessages?: number;
  minListingItems?: number;
  maxRegions?: number;
}

export const DEFAULT_REGION_GROUPER_OPTIONS: Required<RegionGrouperOptions> = {
  minArticleWords: 120,
  minArticleParagraphs: 3,
  minChatMessages: 2,
  minListingItems: 3,
  maxRegions: 200,
};

export class RegionGrouper {
  private readonly options: Required<RegionGrouperOptions>;

  private regionIdCounter = 0;
  private regions: RegionCandidate[] = [];

  constructor(options: RegionGrouperOptions = {}) {
    this.options = {
      ...DEFAULT_REGION_GROUPER_OPTIONS,
      ...options,
    };
  }

  group(blocks: BlockCandidate[]): RegionGroupingResult {
    this.regionIdCounter = 0;
    this.regions = [];

    const blocksByNodeId = new Map<string, BlockCandidate[]>();

    for (const block of blocks) {
      const list = blocksByNodeId.get(block.nodeId) ?? [];
      list.push(block);
      blocksByNodeId.set(block.nodeId, list);
    }

    this.groupArticles(blocks);
    this.groupAiChat(blocks);
    this.groupProductListings(blocks);
    this.groupTables(blocks);
    this.groupLists(blocks);
    this.groupNavigation(blocks);
    this.groupBreadcrumbs(blocks);
    this.groupForms(blocks);
    this.groupMedia(blocks);

    const byKind = {} as Record<RegionKind, number>;

    for (const region of this.regions) {
      byKind[region.kind] = (byKind[region.kind] ?? 0) + 1;
    }

    const regionsByNodeId = new Map<string, RegionCandidate[]>();

    for (const region of this.regions) {
      const existing = regionsByNodeId.get(region.nodeId) ?? [];
      existing.push(region);
      regionsByNodeId.set(region.nodeId, existing);
    }

    return {
      regions: this.regions,
      regionsByNodeId,
      stats: {
        totalRegions: this.regions.length,
        byKind,
      },
    };
  }

  private groupArticles(blocks: BlockCandidate[]): void {
    const paragraphs = blocks.filter(
      (block) => block.kind === 'paragraph'
    );

    for (const paragraph of paragraphs) {
      const nearby = this.findNearbyBlocks(
        paragraph,
        blocks,
        ['paragraph', 'heading', 'media', 'list']
      );

      const proseBlocks = nearby.filter(
        (block) => block.kind === 'paragraph'
      );

      const headingBlocks = nearby.filter(
        (block) => block.kind === 'heading'
      );

      const wordCount = nearby.reduce(
        (total, block) => total + block.wordCount,
        0
      );

      const avgLinkDensity =
        nearby.length > 0
          ? nearby.reduce(
              (total, block) => total + block.linkDensity,
              0
            ) / nearby.length
          : 1;

      if (
        proseBlocks.length < this.options.minArticleParagraphs ||
        wordCount < this.options.minArticleWords ||
        avgLinkDensity > 0.55
      ) {
        continue;
      }

      const score =
        0.42 +
        Math.min(0.25, proseBlocks.length * 0.03) +
        Math.min(0.18, wordCount / 1500) +
        (headingBlocks.length > 0 ? 0.1 : 0) -
        avgLinkDensity * 0.2;

      this.addRegion({
        kind: 'article',
        anchor: paragraph,
        blocks: nearby,
        score,
        metadata: {
          paragraphCount: proseBlocks.length,
          headingCount: headingBlocks.length,
          wordCount,
          averageLinkDensity: avgLinkDensity,
        },
      });
    }
  }

  private groupAiChat(blocks: BlockCandidate[]): void {
    const messages = blocks.filter(
      (block) => block.kind === 'chat_message'
    );

    if (messages.length < this.options.minChatMessages) {
      return;
    }

    const groups = this.groupByAncestor(messages, 4);

    for (const group of groups) {
      if (group.length < this.options.minChatMessages) {
        continue;
      }

      const roles = group.map(
        (block) =>
          (block.metadata.inferredRole as string | null) ?? 'unknown'
      );

      const hasUser = roles.includes('user');
      const hasAssistant = roles.includes('assistant');

      const score =
        0.5 +
        Math.min(0.25, group.length * 0.04) +
        (hasUser && hasAssistant ? 0.25 : 0);

      if (score < 0.55) {
        continue;
      }

      this.addRegion({
        kind: 'ai_chat',
        anchor: group[0],
        blocks: group,
        score,
        metadata: {
          messageCount: group.length,
          hasUser,
          hasAssistant,
          roles,
        },
      });
    }
  }

  private groupProductListings(blocks: BlockCandidate[]): void {
    const grids = blocks.filter(
      (block) => block.kind === 'card_grid'
    );

    for (const grid of grids) {
      const itemCount = Number(grid.metadata.itemCount ?? 0);

      if (itemCount < this.options.minListingItems) {
        continue;
      }

      const nearby = this.findNearbyBlocks(
        grid,
        blocks,
        ['card_grid', 'navigation', 'form', 'breadcrumb']
      );

      const hasPagination = nearby.some(
        (block) =>
          block.kind === 'navigation' &&
          /next|page|pagination|older|newer/i.test(block.text)
      );

      const hasFilters = nearby.some(
        (block) =>
          block.kind === 'form' &&
          /filter|sort|category|price/i.test(block.text)
      );

      const similarity = Number(
        grid.metadata.structuralSimilarity ?? 0
      );

      const score =
        0.45 +
        similarity * 0.25 +
        Math.min(0.15, itemCount * 0.01) +
        (hasPagination ? 0.08 : 0) +
        (hasFilters ? 0.07 : 0);

      this.addRegion({
        kind: 'product_listing',
        anchor: grid,
        blocks: [grid, ...nearby],
        score,
        metadata: {
          itemCount,
          structuralSimilarity: similarity,
          hasPagination,
          hasFilters,
        },
      });
    }
  }

  private groupTables(blocks: BlockCandidate[]): void {
    const tables = blocks.filter(
      (block) => block.kind === 'table'
    );

    for (const table of tables) {
      this.addRegion({
        kind: 'data_table',
        anchor: table,
        blocks: [table],
        score: table.score,
        metadata: {
          ...table.metadata,
        },
      });
    }
  }

  private groupLists(blocks: BlockCandidate[]): void {
    const lists = blocks.filter(
      (block) => block.kind === 'list'
    );

    for (const list of lists) {
      this.addRegion({
        kind: 'list',
        anchor: list,
        blocks: [list],
        score: list.score * 0.8,
        metadata: {
          ...list.metadata,
        },
      });
    }
  }

  private groupNavigation(blocks: BlockCandidate[]): void {
    const navBlocks = blocks.filter(
      (block) => block.kind === 'navigation'
    );

    for (const nav of navBlocks) {
      this.addRegion({
        kind: 'navigation',
        anchor: nav,
        blocks: [nav],
        score: nav.score,
        metadata: {
          ...nav.metadata,
        },
      });
    }
  }

  private groupBreadcrumbs(blocks: BlockCandidate[]): void {
    const breadcrumbs = blocks.filter(
      (block) => block.kind === 'breadcrumb'
    );

    for (const breadcrumb of breadcrumbs) {
      this.addRegion({
        kind: 'breadcrumb',
        anchor: breadcrumb,
        blocks: [breadcrumb],
        score: breadcrumb.score,
        metadata: {
          ...breadcrumb.metadata,
        },
      });
    }
  }

  private groupForms(blocks: BlockCandidate[]): void {
    const forms = blocks.filter(
      (block) => block.kind === 'form'
    );

    for (const form of forms) {
      this.addRegion({
        kind: 'form',
        anchor: form,
        blocks: [form],
        score: form.score,
        metadata: {
          ...form.metadata,
        },
      });
    }
  }

  private groupMedia(blocks: BlockCandidate[]): void {
    const media = blocks.filter(
      (block) => block.kind === 'media'
    );

    for (const item of media) {
      this.addRegion({
        kind: 'media',
        anchor: item,
        blocks: [item],
        score: item.score,
        metadata: {
          ...item.metadata,
        },
      });
    }
  }

  private findNearbyBlocks(
    anchor: BlockCandidate,
    blocks: BlockCandidate[],
    kinds: BlockKind[]
  ): BlockCandidate[] {
    const anchorNode = anchor.element;
    const anchorParent = anchorNode.parentElement;

    if (!anchorParent) {
      return [anchor];
    }

    return blocks.filter((block) => {
      if (block.blockId === anchor.blockId) {
        return true;
      }

      if (!kinds.includes(block.kind)) {
        return false;
      }

      return this.areDomRelated(
        anchorNode,
        block.element,
        4
      );
    });
  }

  private groupByAncestor(
    blocks: BlockCandidate[],
    maxDepth: number
  ): BlockCandidate[][] {
    const groups = new Map<string, BlockCandidate[]>();

    for (const block of blocks) {
      const key = this.getAncestorKey(block.element, maxDepth);
      const group = groups.get(key) ?? [];
      group.push(block);
      groups.set(key, group);
    }

    return Array.from(groups.values());
  }

  private getAncestorKey(
    element: Element,
    maxDepth: number
  ): string {
    let current: Element | null = element;
    const parts: string[] = [];

    for (let depth = 0; depth < maxDepth && current; depth++) {
      parts.unshift(current.tagName.toLowerCase());
      current = current.parentElement;
    }

    return parts.join('>');
  }

  private areDomRelated(
    a: Element,
    b: Element,
    maxDepth: number
  ): boolean {
    let current: Element | null = a;

    for (let depth = 0; depth < maxDepth && current; depth++) {
      if (current.contains(b)) {
        return true;
      }

      current = current.parentElement;
    }

    current = b;

    for (let depth = 0; depth < maxDepth && current; depth++) {
      if (current.contains(a)) {
        return true;
      }

      current = current.parentElement;
    }

    return false;
  }

  private addRegion(input: {
    kind: RegionKind;
    anchor: BlockCandidate;
    blocks: BlockCandidate[];
    score: number;
    metadata?: Record<string, unknown>;
  }): void {
    if (this.regions.length >= this.options.maxRegions) {
      return;
    }

    const uniqueBlocks = this.deduplicateBlocks(input.blocks);

    if (uniqueBlocks.length === 0) {
      return;
    }

    this.regionIdCounter++;

    const text = uniqueBlocks
      .map((block) => block.text)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    const wordCount = uniqueBlocks.reduce(
      (total, block) => total + block.wordCount,
      0
    );

    const linkDensity =
      uniqueBlocks.length > 0
        ? uniqueBlocks.reduce(
            (total, block) => total + block.linkDensity,
            0
          ) / uniqueBlocks.length
        : 0;

    this.regions.push({
      regionId: `r${this.regionIdCounter}`,
      kind: input.kind,
      nodeId: input.anchor.nodeId,
      element: input.anchor.element,
      score: clamp(input.score),
      confidence: clamp(input.score),
      blockIds: uniqueBlocks.map((block) => block.blockId),
      blockKinds: uniqueBlocks.map((block) => block.kind),
      text: text.slice(0, 1000),
      wordCount,
      linkDensity,
      metadata: {
        anchorBlockId: input.anchor.blockId,
        blockCount: uniqueBlocks.length,
        ...input.metadata,
      },
    });
  }

  private deduplicateBlocks(
    blocks: BlockCandidate[]
  ): BlockCandidate[] {
    const seen = new Set<string>();

    return blocks.filter((block) => {
      if (seen.has(block.blockId)) {
        return false;
      }

      seen.add(block.blockId);
      return true;
    });
  }
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}
```


## Usage

```ts
import { DomNormalizer } from './dom/DomNormalizer';
import { BlockSegmenter } from './dom/BlockSegmenter';
import { RegionGrouper } from './dom/RegionGrouper';

const normalized = new DomNormalizer().normalize(document);

const blocks = new BlockSegmenter({
  minParagraphWords: 10,
  minCardGridItems: 4,
}).segment(normalized);

const regions = new RegionGrouper({
  minArticleWords: 120,
  minArticleParagraphs: 3,
  minChatMessages: 2,
  minListingItems: 3,
}).group(blocks.blocks);

console.log(regions.stats);
console.log(regions.regions);
```


## What it produces

| Region | Built from | Example |
| :-- | :-- | :-- |
| `article` | Multiple prose blocks, headings, media, lists | Blog post or news article |
| `ai_chat` | Multiple chat messages, ideally user + assistant roles | ChatGPT/Claude conversation |
| `product_listing` | Card grid plus pagination/filters | Shopify collection, search results |
| `data_table` | Table-like block | Pricing table, dashboard table |
| `list` | List block | TOC, feature list, link list |
| `navigation` | Link-dense nav block | Header/footer navigation |
| `breadcrumb` | Short link trail | `Home / Blog / Article` |
| `form` | Input cluster | Search, login, filters |
| `media` | Figure/video/image block | Article image or gallery |

## Next component

The next layer should be `DetectionContext` plus the new `DetectorPlugin` contract. It will combine:

```text
normalized DOM
+ blocks
+ regions
+ JSON-LD
+ URL metadata
+ page metadata
```

Then detectors such as `ArticleDetector`, `ProductDetector`, `AiChatDetector`, and `TableDetector` can score regions using all available evidence instead of scanning raw selectors.

---

# ok next

Next is the `DetectionContext` and the new `DetectorPlugin` contract. This is the layer that connects normalization, segmentation, region grouping, JSON-LD, URL metadata, and detector scoring into one pipeline.

## Context types

```ts
// src/detection/types.ts

import {
  NormalizationResult,
  NormalizedDomNode,
} from '../dom/types';
import {
  BlockCandidate,
  SegmentationResult,
} from '../dom/blockTypes';
import {
  RegionCandidate,
  RegionGroupingResult,
  RegionKind,
} from '../dom/regionTypes';

export type PatternType =
  | 'article'
  | 'blog_index'
  | 'product'
  | 'product_listing'
  | 'ai_chat'
  | 'table'
  | 'list'
  | 'navigation'
  | 'breadcrumb'
  | 'form'
  | 'media'
  | 'generic';

export interface PageMetadata {
  url: string;
  hostname: string;
  pathname: string;
  title?: string;
  description?: string;
  lang?: string;
  canonicalUrl?: string;
  openGraph?: Record<string, string>;
  jsonLd: unknown[];
  jsonLdTypes: string[];
}

export interface DetectionContext {
  sourceRoot: ParentNode;
  normalized: NormalizationResult;
  blocks: SegmentationResult;
  regions: RegionGroupingResult;
  page: PageMetadata;
  options: DetectionOptions;

  getRegion(kind: RegionKind): RegionCandidate[];
  getBlocks(kind: BlockCandidate['kind']): BlockCandidate[];
  getNode(nodeId: string): NormalizedDomNode | undefined;
  hasJsonLdType(type: string): boolean;
}

export interface DetectionOptions {
  includeHidden?: boolean;
  includeNavigation?: boolean;
  includeBoilerplate?: boolean;
  minConfidence?: number;
  maxCandidatesPerDetector?: number;
}

export interface Evidence {
  signal: string;
  weight: number;
  value: unknown;
  explanation: string;
}

export interface FieldCandidate {
  value: unknown;
  confidence: number;
  source: 'json-ld' | 'semantic-html' | 'dom-pattern' | 'visual' | 'user-rule';
  selector?: string;
  evidence?: Evidence[];
}

export interface DetectionCandidate {
  detectorId: string;
  kind: PatternType;
  regionId?: string;
  nodeId: string;
  element: Element;

  score: number;
  confidence: number;

  evidence: Evidence[];
  fields: Record<string, FieldCandidate>;
  metadata: Record<string, unknown>;
}

export interface DetectorPlugin {
  id: string;
  kinds: PatternType[];
  version: string;

  applies(context: DetectionContext): boolean;
  detect(context: DetectionContext): DetectionCandidate[];
}
```


## DetectionContext

```ts
// src/detection/DetectionContext.ts

import { DomNormalizer } from '../dom/DomNormalizer';
import { BlockSegmenter } from '../dom/BlockSegmenter';
import { RegionGrouper } from '../dom/RegionGrouper';

import {
  DetectionContext,
  DetectionOptions,
  PageMetadata,
} from './types';

import {
  BlockCandidate,
} from '../dom/blockTypes';
import {
  RegionCandidate,
  RegionKind,
} from '../dom/regionTypes';
import {
  NormalizedDomNode,
} from '../dom/types';

export const DEFAULT_DETECTION_OPTIONS: Required<DetectionOptions> = {
  includeHidden: false,
  includeNavigation: true,
  includeBoilerplate: true,
  minConfidence: 0.35,
  maxCandidatesPerDetector: 50,
};

export class ContextBuilder {
  private readonly options: Required<DetectionOptions>;

  private readonly normalizer: DomNormalizer;
  private readonly segmenter: BlockSegmenter;
  private readonly grouper: RegionGrouper;

  constructor(
    options: DetectionOptions = {},
    segmenterOptions = {},
    grouperOptions = {}
  ) {
    this.options = {
      ...DEFAULT_DETECTION_OPTIONS,
      ...options,
    };

    this.normalizer = new DomNormalizer({
      removeHidden: !this.options.includeHidden,
    });

    this.segmenter = new BlockSegmenter(segmenterOptions);
    this.grouper = new RegionGrouper(grouperOptions);
  }

  async build(sourceRoot: ParentNode): Promise<DetectionContext> {
    const normalized = this.normalizer.normalize(sourceRoot);
    const blocks = this.segmenter.segment(normalized);
    const regions = this.grouper.group(blocks.blocks);

    const page = await this.extractPageMetadata(sourceRoot, normalized);

    return {
      sourceRoot,
      normalized,
      blocks,
      regions,
      page,
      options: this.options,

      getRegion: (kind: RegionKind) =>
        regions.regions.filter((region) => region.kind === kind),

      getBlocks: (kind: BlockCandidate['kind']) =>
        blocks.blocks.filter((block) => block.kind === kind),

      getNode: (nodeId: string) =>
        normalized.nodeById.get(nodeId),

      hasJsonLdType: (type: string) =>
        page.jsonLdTypes.some(
          (candidate) =>
            candidate.toLowerCase() === type.toLowerCase()
        ),
    };
  }

  private async extractPageMetadata(
    sourceRoot: ParentNode,
    normalized: ReturnType<DomNormalizer['normalize']>
  ): Promise<PageMetadata> {
    const doc =
      sourceRoot instanceof Document
        ? sourceRoot
        : sourceRoot.ownerDocument;

    const location =
      typeof window !== 'undefined' ? window.location : undefined;

    const url = location?.href ?? '';
    const hostname = location?.hostname ?? '';
    const pathname = location?.pathname ?? '';

    const meta = (name: string): string | undefined => {
      if (!doc) return undefined;

      return (
        doc.querySelector(`meta[name="${name}"]`)?.getAttribute('content') ??
        doc.querySelector(`meta[property="${name}"]`)?.getAttribute('content') ??
        undefined
      );
    };

    const openGraph: Record<string, string> = {};

    if (doc) {
      for (const element of Array.from(
        doc.querySelectorAll('meta[property^="og:"]')
      )) {
        const property = element.getAttribute('property');
        const content = element.getAttribute('content');

        if (property && content) {
          openGraph[property] = content;
        }
      }
    }

    return {
      url,
      hostname,
      pathname,
      title: doc?.title ?? undefined,
      description: meta('description'),
      lang:
        doc?.documentElement.getAttribute('lang') ?? undefined,
      canonicalUrl:
        doc
          ?.querySelector('link[rel="canonical"]')
          ?.getAttribute('href') ?? undefined,
      openGraph,
      jsonLd: normalized.jsonLd,
      jsonLdTypes: this.collectJsonLdTypes(normalized.jsonLd),
    };
  }

  private collectJsonLdTypes(jsonLd: unknown[]): string[] {
    const types: string[] = [];

    for (const item of jsonLd) {
      this.walkJsonLd(item, types);
    }

    return Array.from(new Set(types));
  }

  private walkJsonLd(value: unknown, output: string[]): void {
    if (!value || typeof value !== 'object') {
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        this.walkJsonLd(item, output);
      }
      return;
    }

    const record = value as Record<string, unknown>;
    const type = record['@type'];

    if (typeof type === 'string') {
      output.push(type);
    } else if (Array.isArray(type)) {
      for (const item of type) {
        if (typeof item === 'string') {
          output.push(item);
        }
      }
    }

    for (const child of Object.values(record)) {
      this.walkJsonLd(child, output);
    }
  }
}
```


## New DetectorPlugin contract

Your existing detector interface returns final `ExtractedDataNode[]` immediately:

```ts
detect(root: HTMLElement): ExtractedDataNode[]
```

Replace it with a two-phase contract:

```ts
// src/detection/DetectorPlugin.ts

import {
  DetectionCandidate,
  DetectionContext,
  DetectorPlugin,
} from './types';

export abstract class BaseDetectorPlugin implements DetectorPlugin {
  abstract readonly id: string;
  abstract readonly kinds: PatternType[];
  abstract readonly version: string;

  applies(context: DetectionContext): boolean {
    return true;
  }

  abstract detect(context: DetectionContext): DetectionCandidate[];

  protected candidate(input: {
    context: DetectionContext;
    detectorId: string;
    kind: PatternType;
    region?: RegionCandidate;
    element: Element;
    score: number;
    evidence: Evidence[];
    fields?: Record<string, FieldCandidate>;
    metadata?: Record<string, unknown>;
  }): DetectionCandidate {
    const max =
      input.context.options.maxCandidatesPerDetector;

    if (
      input.context.options.minConfidence &&
      input.score < input.context.options.minConfidence
    ) {
      throw new Error('Candidate below minimum confidence');
    }

    return {
      detectorId: input.detectorId,
      kind: input.kind,
      regionId: input.region?.regionId,
      nodeId: input.region?.nodeId ?? '',
      element: input.element,
      score: clamp(input.score),
      confidence: clamp(input.score),
      evidence: input.evidence,
      fields: input.fields ?? {},
      metadata: input.metadata ?? {},
    };
  }
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}
```

In practice, filter low-score candidates inside `detect()` rather than throwing. The base helper is mainly for consistent candidate construction.

## Example: ArticleDetector

This replaces your selector-only article detector with evidence-based scoring.

```ts
// src/detection/detectors/ArticleDetector.ts

import {
  BaseDetectorPlugin,
} from '../DetectorPlugin';
import {
  DetectionCandidate,
  DetectionContext,
  Evidence,
  PatternType,
} from '../types';
import { RegionCandidate } from '../../dom/regionTypes';

export class ArticleDetector extends BaseDetectorPlugin {
  readonly id = 'core.article';
  readonly kinds: PatternType[] = ['article'];
  readonly version = '2.0.0';

  applies(context: DetectionContext): boolean {
    return context.getRegion('article').length > 0;
  }

  detect(context: DetectionContext): DetectionCandidate[] {
    const regions = context.getRegion('article');
    const candidates: DetectionCandidate[] = [];

    for (const region of regions) {
      const evidence: Evidence[] = [];
      let score = region.score;

      evidence.push({
        signal: 'prose_region',
        weight: 0.4,
        value: region.score,
        explanation: 'Region contains multiple prose-like blocks.',
      });

      if (context.hasJsonLdType('Article')) {
        score += 0.22;
        evidence.push({
          signal: 'json_ld_article',
          weight: 0.22,
          value: 'Article',
          explanation: 'Page contains Article structured data.',
        });
      }

      if (context.hasJsonLdType('BlogPosting')) {
        score += 0.2;
        evidence.push({
          signal: 'json_ld_blog_posting',
          weight: 0.2,
          value: 'BlogPosting',
          explanation: 'Page contains BlogPosting structured data.',
        });
      }

      if (context.hasJsonLdType('NewsArticle')) {
        score += 0.22;
        evidence.push({
          signal: 'json_ld_news_article',
          weight: 0.22,
          value: 'NewsArticle',
          explanation: 'Page contains NewsArticle structured data.',
        });
      }

      if (this.hasSemanticArticle(context, region)) {
        score += 0.12;
        evidence.push({
          signal: 'semantic_article',
          weight: 0.12,
          value: true,
          explanation: 'Semantic article/main landmark supports this region.',
        });
      }

      if (this.hasDateOrAuthor(context, region)) {
        score += 0.08;
        evidence.push({
          signal: 'byline_or_date',
          weight: 0.08,
          value: true,
          explanation: 'Date, time, or author metadata found near region.',
        });
      }

      if (/\/(blog|news|article|post|insights)\//i.test(context.page.pathname)) {
        score += 0.06;
        evidence.push({
          signal: 'url_pattern',
          weight: 0.06,
          value: context.page.pathname,
          explanation: 'URL path resembles an article route.',
        });
      }

      if (region.linkDensity > 0.5) {
        score -= 0.18;
        evidence.push({
          signal: 'high_link_density',
          weight: -0.18,
          value: region.linkDensity,
          explanation: 'Region is too link-dense for article body content.',
        });
      }

      if (score < context.options.minConfidence) {
        continue;
      }

      candidates.push(
        this.candidate({
          context,
          detectorId: this.id,
          kind: 'article',
          region,
          element: region.element,
          score,
          evidence,
          metadata: {
            wordCount: region.wordCount,
            blockCount: region.metadata.blockCount,
          },
        })
      );
    }

    return candidates
      .sort((a, b) => b.score - a.score)
      .slice(0, context.options.maxCandidatesPerDetector);
  }

  private hasSemanticArticle(
    context: DetectionContext,
    region: RegionCandidate
  ): boolean {
    const node = context.getNode(region.nodeId);

    if (!node) {
      return false;
    }

    let current: NormalizedDomNode | undefined = node;

    for (let depth = 0; depth < 5 && current; depth++) {
      const tag = current.features.tag;
      const role = current.features.role;

      if (
        tag === 'article' ||
        role === 'article' ||
        tag === 'main' ||
        role === 'main'
      ) {
        return true;
      }

      current = current.parentId
        ? context.getNode(current.parentId)
        : undefined;
    }

    return false;
  }

  private hasDateOrAuthor(
    context: DetectionContext,
    region: RegionCandidate
  ): boolean {
    const element = region.element;

    const date = element.querySelector(
      'time, [datetime], [itemprop=datePublished], [itemprop=dateModified]'
    );

    const author = element.querySelector(
      '[rel=author], [itemprop=author], .author, .byline, [data-author]'
    );

    return Boolean(date || author);
  }
}
```


## Example: AiChatDetector

```ts
// src/detection/detectors/AiChatDetector.ts

import { BaseDetectorPlugin } from '../DetectorPlugin';
import {
  DetectionCandidate,
  DetectionContext,
  Evidence,
  PatternType,
} from '../types';

export class AiChatDetector extends BaseDetectorPlugin {
  readonly id = 'core.ai_chat';
  readonly kinds: PatternType[] = ['ai_chat'];
  readonly version = '1.0.0';

  applies(context: DetectionContext): boolean {
    return context.getRegion('ai_chat').length > 0;
  }

  detect(context: DetectionContext): DetectionCandidate[] {
    const candidates: DetectionCandidate[] = [];

    for (const region of context.getRegion('ai_chat')) {
      const evidence: Evidence[] = [];
      let score = region.score;

      const messageCount = Number(region.metadata.messageCount ?? 0);
      const hasUser = Boolean(region.metadata.hasUser);
      const hasAssistant = Boolean(region.metadata.hasAssistant);

      evidence.push({
        signal: 'chat_messages',
        weight: 0.35,
        value: messageCount,
        explanation: 'Detected repeated chat-message-like blocks.',
      });

      if (hasUser && hasAssistant) {
        score += 0.25;
        evidence.push({
          signal: 'alternating_roles',
          weight: 0.25,
          value: { hasUser, hasAssistant },
          explanation: 'Both user and assistant roles were inferred.',
        });
      }

      if (this.hasComposer(context, region)) {
        score += 0.18;
        evidence.push({
          signal: 'composer',
          weight: 0.18,
          value: true,
          explanation: 'Input/composer controls found near the conversation.',
        });
      }

      if (/\/chat|\/conversation|\/assistant|\/copilot/i.test(context.page.pathname)) {
        score += 0.08;
        evidence.push({
          signal: 'url_pattern',
          weight: 0.08,
          value: context.page.pathname,
          explanation: 'URL path resembles a chat application route.',
        });
      }

      if (score < context.options.minConfidence) {
        continue;
      }

      candidates.push(
        this.candidate({
          context,
          detectorId: this.id,
          kind: 'ai_chat',
          region,
          element: region.element,
          score,
          evidence,
          metadata: {
            messageCount,
            hasUser,
            hasAssistant,
          },
        })
      );
    }

    return candidates
      .sort((a, b) => b.score - a.score)
      .slice(0, context.options.maxCandidatesPerDetector);
  }

  private hasComposer(
    context: DetectionContext,
    region: RegionCandidate
  ): boolean {
    const root =
      region.element.closest('body') ?? region.element.ownerDocument.body;

    const composer = root.querySelector(
      [
        'form textarea',
        '[contenteditable="true"]',
        '[role="textbox"]',
        'textarea[placeholder]',
        'input[type="text"][placeholder]',
      ].join(', ')
    );

    const sendControl = root.querySelector(
      [
        'button[type="submit"]',
        '[aria-label*="send" i]',
        '[data-testid*="send" i]',
        '[class*="send" i]',
      ].join(', ')
    );

    return Boolean(composer && sendControl);
  }
}
```


## Updated ExtractorEngine

```ts
// src/engine/ExtractionEngine.ts

import { ContextBuilder } from '../detection/DetectionContext';
import {
  DetectionCandidate,
  DetectionContext,
  DetectionOptions,
  DetectorPlugin,
} from '../detection/types';
import { RegionArbiter } from './RegionArbiter';

export interface ExtractionResult {
  page: DetectionContext['page'];
  candidates: DetectionCandidate[];
  selected: DetectionCandidate[];
}

export class ExtractorEngine {
  private detectors: DetectorPlugin[] = [];
  private arbiter = new RegionArbiter();

  registerDetector(detector: DetectorPlugin): this {
    this.detectors.push(detector);
    return this;
  }

  async extract(
    root: ParentNode,
    options: DetectionOptions = {}
  ): Promise<ExtractionResult> {
    const context = await new ContextBuilder(options).build(root);

    const applicable = this.detectors.filter((detector) => {
      try {
        return detector.applies(context);
      } catch {
        return false;
      }
    });

    const candidates: DetectionCandidate[] = [];

    for (const detector of applicable) {
      try {
        candidates.push(...detector.detect(context));
      } catch (error) {
        console.warn(`Detector failed: ${detector.id}`, error);
      }
    }

    const selected = this.arbiter.select(candidates, context);

    return {
      page: context.page,
      candidates,
      selected,
    };
  }
}
```


## RegionArbiter

This is the minimum viable arbiter. It removes duplicate/overlapping candidates and prefers more specific, higher-scoring detections.

```ts
// src/engine/RegionArbiter.ts

import {
  DetectionCandidate,
  DetectionContext,
  PatternType,
} from '../detection/types';

const SPECIFICITY: Record<PatternType, number> = {
  product: 0.95,
  product_listing: 0.9,
  ai_chat: 0.9,
  article: 0.85,
  table: 0.8,
  form: 0.7,
  breadcrumb: 0.65,
  media: 0.6,
  list: 0.55,
  navigation: 0.5,
  blog_index: 0.5,
  generic: 0.1,
};

export class RegionArbiter {
  select(
    candidates: DetectionCandidate[],
    context: DetectionContext
  ): DetectionCandidate[] {
    const sorted = [...candidates].sort((a, b) => {
      const specificityDelta =
        SPECIFICITY[b.kind] - SPECIFICITY[a.kind];

      if (Math.abs(specificityDelta) > 0.001) {
        return specificityDelta;
      }

      return b.score - a.score;
    });

    const selected: DetectionCandidate[] = [];

    for (const candidate of sorted) {
      const conflicts = selected.some((existing) =>
        this.overlaps(existing.element, candidate.element)
      );

      if (conflicts) {
        continue;
      }

      selected.push(candidate);
    }

    return selected;
  }

  private overlaps(a: Element, b: Element): boolean {
    return (
      a === b ||
      a.contains(b) ||
      b.contains(a)
    );
  }
}
```


## What changed

Your old engine did this:

```text
run ArticleDetector → nodes
run TableDetector → nodes
concatenate results
```

The new engine does this:

```text
normalize DOM
→ segment blocks
→ group regions
→ build detection context
→ run applicable detectors
→ collect scored candidates
→ arbitrate overlaps
→ return selected detections
```

This prevents an article’s embedded table from becoming a competing top-level result, and prevents a product grid from being misread as a generic list.

## Next component

The next logical component is a `ConfidenceCalibrator` and a `PageClassifier`.

- `PageClassifier` infers the overall page type from selected candidates, URL, JSON-LD, and region distribution.
- `ConfidenceCalibrator` converts raw heuristic scores into calibrated confidence using labeled fixtures.
- After that, rebuild `TableDetector`, `ProductDetector`, and `ListDetector` against the new contract.

---

# next

Next are `PageClassifier` and `ConfidenceCalibrator`. The classifier infers the page’s dominant intent from selected detections, URL, JSON-LD, and region evidence; the calibrator turns raw heuristic scores into more trustworthy confidence values.

## Page classifier types

```ts
// src/classification/types.ts

import { PatternType } from '../detection/types';

export type PageType =
  | 'article'
  | 'blog_index'
  | 'news_article'
  | 'product_detail'
  | 'product_listing'
  | 'search_results'
  | 'ai_chat'
  | 'documentation'
  | 'dashboard'
  | 'login'
  | 'landing_page'
  | 'forum_thread'
  | 'unknown';

export interface PageClassification {
  pageType: PageType;
  confidence: number;
  scores: Record<PageType, number>;
  evidence: PageEvidence[];
  primaryDetection?: PatternType;
}

export interface PageEvidence {
  signal: string;
  weight: number;
  value: unknown;
  explanation: string;
}
```


## PageClassifier

```ts
// src/classification/PageClassifier.ts

import {
  DetectionCandidate,
  DetectionContext,
  PatternType,
} from '../detection/types';
import {
  PageClassification,
  PageEvidence,
  PageType,
} from './types';

export interface PageClassifierOptions {
  minConfidence?: number;
}

export const DEFAULT_PAGE_CLASSIFIER_OPTIONS: Required<PageClassifierOptions> = {
  minConfidence: 0.35,
};

const DETECTION_TO_PAGE: Partial<Record<PatternType, PageType>> = {
  article: 'article',
  product: 'product_detail',
  product_listing: 'product_listing',
  ai_chat: 'ai_chat',
  table: 'dashboard',
  form: 'landing_page',
};

const STRONG_JSONLD_TYPES: Record<string, PageType> = {
  article: 'article',
  blogposting: 'article',
  newsarticle: 'news_article',
  product: 'product_detail',
  itemlist: 'product_listing',
  searchresultspage: 'search_results',
  faqpage: 'landing_page',
  webpage: 'unknown',
};

export class PageClassifier {
  private readonly options: Required<PageClassifierOptions>;

  constructor(options: PageClassifierOptions = {}) {
    this.options = {
      ...DEFAULT_PAGE_CLASSIFIER_OPTIONS,
      ...options,
    };
  }

  classify(
    context: DetectionContext,
    candidates: DetectionCandidate[]
  ): PageClassification {
    const scores = this.createEmptyScores();
    const evidence: PageEvidence[] = [];

    this.scoreFromDetections(candidates, scores, evidence);
    this.scoreFromJsonLd(context, scores, evidence);
    this.scoreFromUrl(context, scores, evidence);
    this.scoreFromPageStructure(context, scores, evidence);

    const ranked = this.rank(scores);

    const pageType = ranked[0]?.pageType ?? 'unknown';
    const confidence = ranked[0]?.score ?? 0;

    return {
      pageType:
        confidence >= this.options.minConfidence
          ? pageType
          : 'unknown',
      confidence: clamp(confidence),
      scores,
      evidence,
      primaryDetection: this.getPrimaryDetection(candidates),
    };
  }

  private scoreFromDetections(
    candidates: DetectionCandidate[],
    scores: Record<PageType, number>,
    evidence: PageEvidence[]
  ): void {
    for (const candidate of candidates) {
      const pageType = DETECTION_TO_PAGE[candidate.kind];

      if (!pageType) {
        continue;
      }

      const weight = candidate.score * 0.55;

      scores[pageType] += weight;

      evidence.push({
        signal: 'detection_candidate',
        weight,
        value: {
          detector: candidate.detectorId,
          kind: candidate.kind,
          score: candidate.score,
        },
        explanation: `A ${candidate.kind} detection supports a ${pageType} page.`,
      });
    }
  }

  private scoreFromJsonLd(
    context: DetectionContext,
    scores: Record<PageType, number>,
    evidence: PageEvidence[]
  ): void {
    for (const type of context.page.jsonLdTypes) {
      const normalized = type.toLowerCase();
      const pageType = STRONG_JSONLD_TYPES[normalized];

      if (!pageType || pageType === 'unknown') {
        continue;
      }

      const weight = 0.3;

      scores[pageType] += weight;

      evidence.push({
        signal: 'json_ld_type',
        weight,
        value: type,
        explanation: `JSON-LD type ${type} supports a ${pageType} page.`,
      });
    }
  }

  private scoreFromUrl(
    context: DetectionContext,
    scores: Record<PageType, number>,
    evidence: PageEvidence[]
  ): void {
    const path = context.page.pathname.toLowerCase();

    const rules: Array<{
      pattern: RegExp;
      pageType: PageType;
      weight: number;
    }> = [
      { pattern: /\/(blog|news|article|posts|insights)\//, pageType: 'article', weight: 0.12 },
      { pattern: /\/(product|p|item|shop)\//, pageType: 'product_detail', weight: 0.14 },
      { pattern: /\/(collection|category|products|shop|search)/, pageType: 'product_listing', weight: 0.1 },
      { pattern: /\/(chat|conversation|assistant|copilot)/, pageType: 'ai_chat', weight: 0.15 },
      { pattern: /\/(docs|documentation|guide|reference)/, pageType: 'documentation', weight: 0.12 },
      { pattern: /\/(login|signin|sign-in|auth)/, pageType: 'login', weight: 0.2 },
      { pattern: /\/(forum|thread|topic|discussion)/, pageType: 'forum_thread', weight: 0.14 },
    ];

    for (const rule of rules) {
      if (rule.pattern.test(path)) {
        scores[rule.pageType] += rule.weight;

        evidence.push({
          signal: 'url_pattern',
          weight: rule.weight,
          value: path,
          explanation: `URL path matches a ${rule.pageType} pattern.`,
        });
      }
    }
  }

  private scoreFromPageStructure(
    context: DetectionContext,
    scores: Record<PageType, number>,
    evidence: PageEvidence[]
  ): void {
    const articleRegions = context.getRegion('article');
    const chatRegions = context.getRegion('ai_chat');
    const listingRegions = context.getRegion('product_listing');
    const tableRegions = context.getRegion('data_table');
    const navigationRegions = context.getRegion('navigation');

    if (articleRegions.length > 0) {
      const wordCount = articleRegions.reduce(
        (total, region) => total + region.wordCount,
        0
      );

      if (wordCount > 300) {
        const weight = 0.12;
        scores.article += weight;

        evidence.push({
          signal: 'long_prose_region',
          weight,
          value: wordCount,
          explanation: 'Page contains a substantial article-like prose region.',
        });
      }
    }

    if (chatRegions.length > 0) {
      const weight = 0.15;
      scores.ai_chat += weight;

      evidence.push({
        signal: 'chat_region',
        weight,
        value: chatRegions.length,
        explanation: 'Page contains a chat-conversation region.',
      });
    }

    if (listingRegions.length > 0) {
      const weight = 0.15;
      scores.product_listing += weight;

      evidence.push({
        signal: 'product_listing_region',
        weight,
        value: listingRegions.length,
        explanation: 'Page contains a repeated product/listing grid.',
      });
    }

    if (tableRegions.length > 0) {
      const weight = 0.08;
      scores.dashboard += weight;

      evidence.push({
        signal: 'table_region',
        weight,
        value: tableRegions.length,
        explanation: 'Page contains one or more table-like regions.',
      });
    }

    if (navigationRegions.length >= 2) {
      const weight = 0.05;
      scores.landing_page += weight;

      evidence.push({
        signal: 'multiple_navigation_regions',
        weight,
        value: navigationRegions.length,
        explanation: 'Multiple navigation regions suggest a marketing or landing page.',
      });
    }
  }

  private rank(
    scores: Record<PageType, number>
  ): Array<{ pageType: PageType; score: number }> {
    return Object.entries(scores)
      .map(([pageType, score]) => ({
        pageType: pageType as PageType,
        score: clamp(score),
      }))
      .sort((a, b) => b.score - a.score);
  }

  private getPrimaryDetection(
    candidates: DetectionCandidate[]
  ): PatternType | undefined {
    if (candidates.length === 0) {
      return undefined;
    }

    return [...candidates].sort(
      (a, b) => b.score - a.score
    )[0].kind;
  }

  private createEmptyScores(): Record<PageType, number> {
    return {
      article: 0,
      blog_index: 0,
      news_article: 0,
      product_detail: 0,
      product_listing: 0,
      search_results: 0,
      ai_chat: 0,
      documentation: 0,
      dashboard: 0,
      login: 0,
      landing_page: 0,
      forum_thread: 0,
      unknown: 0.05,
    };
  }
}
```


## ConfidenceCalibrator

Raw detector scores are useful for ranking, but they are not true probabilities. This calibrator maps them to calibrated confidence using a labeled fixture set.

```ts
// src/confidence/ConfidenceCalibrator.ts

export interface CalibrationExample {
  rawScore: number;
  correct: boolean;
  detectorId?: string;
  pageType?: string;
}

export interface CalibrationModel {
  version: string;
  detectorId?: string;
  thresholds: number[];
  precision: number[];
  trainedAt: string;
  exampleCount: number;
}

export class ConfidenceCalibrator {
  private models = new Map<string, CalibrationModel>();

  train(
    examples: CalibrationExample[],
    options: {
      detectorId?: string;
      bucketCount?: number;
    } = {}
  ): CalibrationModel {
    if (examples.length === 0) {
      throw new Error('Cannot calibrate with zero examples.');
    }

    const bucketCount = options.bucketCount ?? 10;
    const thresholds: number[] = [];
    const precision: number[] = [];

    for (let index = 0; index < bucketCount; index++) {
      const lower = index / bucketCount;
      const upper = (index + 1) / bucketCount;

      const bucket = examples.filter(
        (example) =>
          example.rawScore >= lower &&
          (index === bucketCount - 1
            ? example.rawScore <= 1
            : example.rawScore < upper)
      );

      thresholds.push(upper);

      if (bucket.length === 0) {
        // Conservative fallback: use the global precision.
        precision.push(this.globalPrecision(examples));
        continue;
      }

      const correct = bucket.filter(
        (example) => example.correct
      ).length;

      precision.push(correct / bucket.length);
    }

    const model: CalibrationModel = {
      version: '1.0.0',
      detectorId: options.detectorId,
      thresholds,
      precision,
      trainedAt: new Date().toISOString(),
      exampleCount: examples.length,
    };

    const key = options.detectorId ?? 'global';
    this.models.set(key, model);

    return model;
  }

  calibrate(
    rawScore: number,
    detectorId?: string
  ): number {
    const model =
      (detectorId ? this.models.get(detectorId) : undefined) ??
      this.models.get('global');

    if (!model) {
      // Without training data, apply a conservative monotonic mapping.
      return clamp(rawScore * 0.85);
    }

    const bucketIndex = model.thresholds.findIndex(
      (threshold) => rawScore <= threshold
    );

    const safeIndex =
      bucketIndex === -1
        ? model.precision.length - 1
        : bucketIndex;

    return clamp(model.precision[safeIndex]);
  }

  private globalPrecision(examples: CalibrationExample[]): number {
    const correct = examples.filter(
      (example) => example.correct
    ).length;

    return correct / examples.length;
  }
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}
```


## Integrate into the engine

Update `ExtractorEngine.extract()` so classification and calibration happen after candidate selection:

```ts
// src/engine/ExtractionEngine.ts

import { ContextBuilder } from '../detection/DetectionContext';
import {
  DetectionCandidate,
  DetectionContext,
  DetectionOptions,
  DetectorPlugin,
} from '../detection/types';
import { RegionArbiter } from './RegionArbiter';
import { PageClassifier } from '../classification/PageClassifier';
import { ConfidenceCalibrator } from '../confidence/ConfidenceCalibrator';
import { PageClassification } from '../classification/types';

export interface CalibratedDetectionCandidate
  extends DetectionCandidate {
  calibratedConfidence: number;
}

export interface ExtractionResult {
  page: DetectionContext['page'];
  classification: PageClassification;
  candidates: CalibratedDetectionCandidate[];
  selected: CalibratedDetectionCandidate[];
}

export class ExtractorEngine {
  private detectors: DetectorPlugin[] = [];
  private arbiter = new RegionArbiter();
  private pageClassifier = new PageClassifier();
  private calibrator = new ConfidenceCalibrator();

  registerDetector(detector: DetectorPlugin): this {
    this.detectors.push(detector);
    return this;
  }

  async extract(
    root: ParentNode,
    options: DetectionOptions = {}
  ): Promise<ExtractionResult> {
    const context = await new ContextBuilder(options).build(root);

    const rawCandidates: DetectionCandidate[] = [];

    for (const detector of this.detectors) {
      if (!this.safeApplies(detector, context)) {
        continue;
      }

      try {
        rawCandidates.push(...detector.detect(context));
      } catch (error) {
        console.warn(`Detector failed: ${detector.id}`, error);
      }
    }

    const selectedRaw = this.arbiter.select(rawCandidates, context);
    const classification = this.pageClassifier.classify(
      context,
      selectedRaw
    );

    const candidates = rawCandidates.map((candidate) => ({
      ...candidate,
      calibratedConfidence: this.calibrator.calibrate(
        candidate.score,
        candidate.detectorId
      ),
    }));

    const selected = selectedRaw.map((candidate) => ({
      ...candidate,
      calibratedConfidence: this.calibrator.calibrate(
        candidate.score,
        candidate.detectorId
      ),
    }));

    return {
      page: context.page,
      classification,
      candidates,
      selected,
    };
  }

  private safeApplies(
    detector: DetectorPlugin,
    context: DetectionContext
  ): boolean {
    try {
      return detector.applies(context);
    } catch {
      return false;
    }
  }
}
```


## Example output

```ts
{
  page: {
    url: 'https://example.com/blog/how-to-build-agents',
    hostname: 'example.com',
    pathname: '/blog/how-to-build-agents',
    jsonLdTypes: ['BlogPosting']
  },
  classification: {
    pageType: 'article',
    confidence: 0.86,
    primaryDetection: 'article',
    evidence: [
      { signal: 'json_ld_type', value: 'BlogPosting' },
      { signal: 'long_prose_region', value: 1450 },
      { signal: 'url_pattern', value: '/blog/how-to-build-agents' }
    ]
  },
  selected: [
    {
      kind: 'article',
      score: 0.91,
      calibratedConfidence: 0.87
    }
  ]
}
```


## Next component

The next implementation step is to rebuild the remaining core detectors against this contract:

1. `TableDetector` — semantic tables, ARIA grids, and visual/div-based tables.
2. `ProductDetector` — product detail extraction using JSON-LD, price/availability, variants, and cart controls.
3. `ListDetector` — generic lists, TOCs, feature lists, and link lists.
4. `NavigationDetector` — header/footer/sidebar navigation and boilerplate classification.

After those, the system will have a complete detection-to-classification pipeline and can move to typed field extraction and Markdown/JSON output.

---

# next

Next: rebuild `TableDetector`, `ProductDetector`, `ListDetector`, and `NavigationDetector` against the new scored-candidate contract. These detectors consume `DetectionContext` and emit evidence-backed candidates rather than immediately returning final extraction nodes.

## TableDetector

Detects semantic tables, ARIA grids, and repeated div-based visual tables.

```ts
// src/detection/detectors/TableDetector.ts

import { BaseDetectorPlugin } from '../DetectorPlugin';
import {
  DetectionCandidate,
  DetectionContext,
  Evidence,
  PatternType,
} from '../types';

interface TableSignals {
  rowCount: number;
  columnCount: number;
  headerCount: number;
  hasConsistentColumns: boolean;
  isSemanticTable: boolean;
  isAriaGrid: boolean;
  isVisualTable: boolean;
}

export class TableDetector extends BaseDetectorPlugin {
  readonly id = 'core.table';
  readonly kinds: PatternType[] = ['table'];
  readonly version = '2.0.0';

  applies(context: DetectionContext): boolean {
    return (
      context.getRegion('data_table').length > 0 ||
      context.getBlocks('table').length > 0
    );
  }

  detect(context: DetectionContext): DetectionCandidate[] {
    const candidates: DetectionCandidate[] = [];

    const tableRegions = context.getRegion('data_table');
    const tableBlocks = context.getBlocks('table');

    for (const region of tableRegions) {
      const signals = this.extractSignals(region.element);
      const candidate = this.buildCandidate(
        context,
        region.element,
        signals,
        region.regionId,
        region.nodeId
      );

      if (candidate) {
        candidates.push(candidate);
      }
    }

    for (const block of tableBlocks) {
      const alreadyCovered = candidates.some((candidate) =>
        candidate.element.contains(block.element) ||
        block.element.contains(candidate.element)
      );

      if (alreadyCovered) {
        continue;
      }

      const signals = this.extractSignals(block.element);
      const candidate = this.buildCandidate(
        context,
        block.element,
        signals,
        undefined,
        block.nodeId
      );

      if (candidate) {
        candidates.push(candidate);
      }
    }

    return this.rankAndLimit(candidates, context);
  }

  private buildCandidate(
    context: DetectionContext,
    element: Element,
    signals: TableSignals,
    regionId?: string,
    nodeId?: string
  ): DetectionCandidate | null {
    if (signals.rowCount < 2 || signals.columnCount < 2) {
      return null;
    }

    const evidence: Evidence[] = [];
    let score = 0.35;

    if (signals.isSemanticTable) {
      score += 0.3;
      evidence.push({
        signal: 'semantic_table',
        weight: 0.3,
        value: true,
        explanation: 'Element is a semantic <table>.',
      });
    }

    if (signals.isAriaGrid) {
      score += 0.25;
      evidence.push({
        signal: 'aria_grid',
        weight: 0.25,
        value: true,
        explanation: 'Element uses table or grid ARIA semantics.',
      });
    }

    if (signals.isVisualTable) {
      score += 0.18;
      evidence.push({
        signal: 'visual_table',
        weight: 0.18,
        value: true,
        explanation: 'Repeated rows and consistent columns resemble a table.',
      });
    }

    if (signals.headerCount > 0) {
      score += 0.1;
      evidence.push({
        signal: 'header_row',
        weight: 0.1,
        value: signals.headerCount,
        explanation: 'Table header cells were found.',
      });
    }

    if (signals.hasConsistentColumns) {
      score += 0.12;
      evidence.push({
        signal: 'consistent_columns',
        weight: 0.12,
        value: signals.columnCount,
        explanation: 'Rows contain a consistent number of cells.',
      });
    }

    score += Math.min(0.1, signals.rowCount * 0.005);

    if (score < context.options.minConfidence) {
      return null;
    }

    return this.candidate({
      context,
      detectorId: this.id,
      kind: 'table',
      element,
      score,
      evidence,
      metadata: {
        ...signals,
      },
      fields: {
        rowCount: {
          value: signals.rowCount,
          confidence: 0.95,
          source: 'dom-pattern',
        },
        columnCount: {
          value: signals.columnCount,
          confidence: signals.hasConsistentColumns ? 0.9 : 0.6,
          source: 'dom-pattern',
        },
      },
    });
  }

  private extractSignals(element: Element): TableSignals {
    const isSemanticTable =
      element.tagName.toLowerCase() === 'table';

    const role = element.getAttribute('role')?.toLowerCase();
    const isAriaGrid = role === 'table' || role === 'grid';

    const semanticRows = Array.from(
      element.querySelectorAll(':scope tr')
    );

    const ariaRows = Array.from(
      element.querySelectorAll(':scope [role=row]')
    );

    const rows = semanticRows.length > 0 ? semanticRows : ariaRows;

    const rowCellCounts = rows.map((row) =>
      row.querySelectorAll(':scope > td, :scope > th, :scope > [role=cell], :scope > [role=gridcell]').length
    );

    const columnCount =
      rowCellCounts.length > 0 ? Math.max(...rowCellCounts) : 0;

    const hasConsistentColumns =
      rowCellCounts.length > 1 &&
      rowCellCounts.every((count) => count === columnCount);

    const headerCount = element.querySelectorAll(
      ':scope th, :scope [role=columnheader]'
    ).length;

    const isVisualTable = this.detectVisualTable(element);

    return {
      rowCount: rows.length,
      columnCount,
      headerCount,
      hasConsistentColumns,
      isSemanticTable,
      isAriaGrid,
      isVisualTable,
    };
  }

  private detectVisualTable(element: Element): boolean {
    const children = Array.from(element.children);

    if (children.length < 3) {
      return false;
    }

    const childCounts = children.map(
      (child) => child.children.length
    );

    const dominantCount = Math.max(
      ...childCounts
    );

    const consistent = childCounts.filter(
      (count) => count === dominantCount
    ).length;

    return (
      dominantCount >= 2 &&
      consistent / children.length >= 0.7
    );
  }

  private rankAndLimit(
    candidates: DetectionCandidate[],
    context: DetectionContext
  ): DetectionCandidate[] {
    return candidates
      .sort((a, b) => b.score - a.score)
      .slice(0, context.options.maxCandidatesPerDetector);
  }
}
```


## ProductDetector

Uses JSON-LD as a strong prior, then validates product-like DOM evidence.

```ts
// src/detection/detectors/ProductDetector.ts

import { BaseDetectorPlugin } from '../DetectorPlugin';
import {
  DetectionCandidate,
  DetectionContext,
  Evidence,
  FieldCandidate,
  PatternType,
} from '../types';

export class ProductDetector extends BaseDetectorPlugin {
  readonly id = 'core.product';
  readonly kinds: PatternType[] = ['product'];
  readonly version = '1.0.0';

  applies(context: DetectionContext): boolean {
    return (
      context.hasJsonLdType('Product') ||
      context.getRegion('product').length > 0 ||
      this.hasCommerceUrl(context)
    );
  }

  detect(context: DetectionContext): DetectionCandidate[] {
    const candidates: DetectionCandidate[] = [];

    const roots = this.getProductRoots(context);

    for (const root of roots) {
      const evidence: Evidence[] = [];
      const fields: Record<string, FieldCandidate> = {};

      let score = 0.2;

      const jsonLdProduct = this.findJsonLdProduct(context);

      if (jsonLdProduct) {
        score += 0.32;

        evidence.push({
          signal: 'json_ld_product',
          weight: 0.32,
          value: jsonLdProduct,
          explanation: 'Product structured data was found.',
        });

        this.addField(fields, 'title', jsonLdProduct.name, 'json-ld', 0.95);
        this.addField(fields, 'description', jsonLdProduct.description, 'json-ld', 0.9);
        this.addField(fields, 'sku', jsonLdProduct.sku, 'json-ld', 0.9);
        this.addField(fields, 'brand', this.getBrand(jsonLdProduct), 'json-ld', 0.9);
      }

      const price = this.extractPrice(root);

      if (price) {
        score += 0.18;

        evidence.push({
          signal: 'price',
          weight: 0.18,
          value: price,
          explanation: 'A price-like value was found.',
        });

        this.addField(fields, 'price', price.value, 'dom-pattern', 0.85);
        this.addField(fields, 'currency', price.currency, 'dom-pattern', 0.75);
      }

      const availability = this.extractAvailability(root);

      if (availability) {
        score += 0.08;

        evidence.push({
          signal: 'availability',
          weight: 0.08,
          value: availability,
          explanation: 'Availability information was found.',
        });

        this.addField(fields, 'availability', availability, 'dom-pattern', 0.8);
      }

      const addToCart = this.findAddToCart(root);

      if (addToCart) {
        score += 0.14;

        evidence.push({
          signal: 'add_to_cart',
          weight: 0.14,
          value: addToCart,
          explanation: 'An add-to-cart or buy control was found.',
        });
      }

      const images = Array.from(
        root.querySelectorAll('img, picture img')
      );

      if (images.length > 0) {
        score += 0.06;

        evidence.push({
          signal: 'product_images',
          weight: 0.06,
          value: images.length,
          explanation: 'Product images were found.',
        });

        this.addField(
          fields,
          'images',
          images.map((image) => image.getAttribute('src')).filter(Boolean),
          'dom-pattern',
          0.8
        );
      }

      const variants = this.extractVariants(root);

      if (variants.length > 0) {
        score += 0.07;

        evidence.push({
          signal: 'variants',
          weight: 0.07,
          value: variants.length,
          explanation: 'Variant selectors or options were found.',
        });

        this.addField(fields, 'variants', variants, 'dom-pattern', 0.75);
      }

      if (score < context.options.minConfidence) {
        continue;
      }

      candidates.push(
        this.candidate({
          context,
          detectorId: this.id,
          kind: 'product',
          element: root,
          score,
          evidence,
          fields,
          metadata: {
            hasJsonLd: Boolean(jsonLdProduct),
            imageCount: images.length,
            variantCount: variants.length,
          },
        })
      );
    }

    return candidates
      .sort((a, b) => b.score - a.score)
      .slice(0, context.options.maxCandidatesPerDetector);
  }

  private getProductRoots(context: DetectionContext): Element[] {
    const source =
      context.sourceRoot instanceof Document
        ? context.sourceRoot.documentElement
        : (context.sourceRoot as Element);

    const semantic = Array.from(
      source.querySelectorAll(
        '[itemtype*="schema.org/Product"], [data-product], article, main, [role=main]'
      )
    );

    if (semantic.length > 0) {
      return semantic;
    }

    return [source];
  }

  private findJsonLdProduct(
    context: DetectionContext
  ): Record<string, unknown> | null {
    const stack = [...context.page.jsonLd];

    while (stack.length > 0) {
      const item = stack.pop();

      if (!item || typeof item !== 'object') {
        continue;
      }

      if (Array.isArray(item)) {
        stack.push(...item);
        continue;
      }

      const record = item as Record<string, unknown>;
      const type = record['@type'];

      const types = Array.isArray(type)
        ? type.map(String)
        : typeof type === 'string'
          ? [type]
          : [];

      if (types.some((value) => value.toLowerCase() === 'product')) {
        return record;
      }

      for (const child of Object.values(record)) {
        if (child && typeof child === 'object') {
          stack.push(child);
        }
      }
    }

    return null;
  }

  private extractPrice(
    root: Element
  ): { value: string; currency?: string } | null {
    const microdata = root.querySelector(
      '[itemprop=price], [itemtype*="schema.org/Offer"] [itemprop=price]'
    );

    if (microdata) {
      const value =
        microdata.getAttribute('content') ??
        microdata.textContent?.trim();

      if (value) {
        return {
          value,
          currency:
            root.querySelector('[itemprop=priceCurrency]')
              ?.getAttribute('content') ?? undefined,
        };
      }
    }

    const text = root.textContent ?? '';
    const match = text.match(
      /(?:USD|EUR|GBP|MAD|\$|€|£|د\.م\.|DH)\s?(\d+(?:[.,]\d{2})?)/i
    );

    if (!match) {
      return null;
    }

    const currencySymbol = match[^7_0].replace(match[^7_1], '').trim();

    return {
      value: match[^7_1],
      currency: this.normalizeCurrency(currencySymbol),
    };
  }

  private extractAvailability(root: Element): string | null {
    const availability = root.querySelector(
      '[itemprop=availability], [data-availability]'
    );

    const value =
      availability?.getAttribute('content') ??
      availability?.getAttribute('data-availability') ??
      availability?.textContent;

    if (value) {
      return value.trim();
    }

    const text = root.textContent?.toLowerCase() ?? '';

    if (/out of stock|sold out/.test(text)) {
      return 'OutOfStock';
    }

    if (/in stock|add to cart|buy now/.test(text)) {
      return 'InStock';
    }

    return null;
  }

  private findAddToCart(root: Element): string | null {
    const button = Array.from(
      root.querySelectorAll(
        'button, a[role=button], [role=button], input[type=submit]'
      )
    ).find((element) => {
      const text = (
        element.textContent ??
        element.getAttribute('aria-label') ??
        ''
      ).toLowerCase();

      return /add to cart|add to bag|buy now|purchase|acheter/.test(text);
    });

    return button?.textContent?.trim() ?? null;
  }

  private extractVariants(root: Element): string[] {
    return Array.from(
      root.querySelectorAll(
        'select option, [data-variant], [class*="variant" i] button, [class*="swatch" i]'
      )
    )
      .map((element) => element.textContent?.trim())
      .filter((value): value is string => Boolean(value));
  }

  private getBrand(product: Record<string, unknown>): unknown {
    const brand = product.brand;

    if (typeof brand === 'string') {
      return brand;
    }

    if (brand && typeof brand === 'object') {
      return (brand as Record<string, unknown>).name;
    }

    return undefined;
  }

  private normalizeCurrency(symbol: string): string {
    const normalized = symbol.toUpperCase();

    if (normalized.includes('$')) return 'USD';
    if (normalized.includes('€')) return 'EUR';
    if (normalized.includes('£')) return 'GBP';
    if (normalized.includes('MAD') || normalized.includes('DH')) return 'MAD';

    return normalized || 'UNKNOWN';
  }

  private hasCommerceUrl(context: DetectionContext): boolean {
    return /\/(product|p|item|shop)\//i.test(context.page.pathname);
  }

  private addField(
    fields: Record<string, FieldCandidate>,
    name: string,
    value: unknown,
    source: FieldCandidate['source'],
    confidence: number
  ): void {
    if (value === undefined || value === null || value === '') {
      return;
    }

    fields[name] = {
      value,
      confidence,
      source,
    };
  }
}
```


## ListDetector

```ts
// src/detection/detectors/ListDetector.ts

import { BaseDetectorPlugin } from '../DetectorPlugin';
import {
  DetectionCandidate,
  DetectionContext,
  Evidence,
  PatternType,
} from '../types';

export class ListDetector extends BaseDetectorPlugin {
  readonly id = 'core.list';
  readonly kinds: PatternType[] = ['list'];
  readonly version = '2.0.0';

  applies(context: DetectionContext): boolean {
    return context.getRegion('list').length > 0;
  }

  detect(context: DetectionContext): DetectionCandidate[] {
    const candidates: DetectionCandidate[] = [];

    for (const region of context.getRegion('list')) {
      const element = region.element;
      const items = Array.from(
        element.querySelectorAll(':scope > li, :scope > [role=listitem]')
      );

      if (items.length < 2) {
        continue;
      }

      const evidence: Evidence[] = [];
      let score = region.score * 0.8;

      evidence.push({
        signal: 'list_items',
        weight: 0.35,
        value: items.length,
        explanation: 'Repeated list items were detected.',
      });

      const isOrdered = element.tagName.toLowerCase() === 'ol';

      if (isOrdered) {
        score += 0.05;
        evidence.push({
          signal: 'ordered_list',
          weight: 0.05,
          value: true,
          explanation: 'Element is an ordered list.',
        });
      }

      const linkDensity = region.linkDensity;

      if (linkDensity > 0.6) {
        score += 0.05;
        evidence.push({
          signal: 'link_list',
          weight: 0.05,
          value: linkDensity,
          explanation: 'List appears to be navigation- or link-oriented.',
        });
      } else {
        score += 0.08;
        evidence.push({
          signal: 'content_list',
          weight: 0.08,
          value: linkDensity,
          explanation: 'List contains substantive non-link content.',
        });
      }

      if (score < context.options.minConfidence) {
        continue;
      }

      candidates.push(
        this.candidate({
          context,
          detectorId: this.id,
          kind: 'list',
          region,
          element,
          score,
          evidence,
          metadata: {
            itemCount: items.length,
            ordered: isOrdered,
            linkDensity,
          },
        })
      );
    }

    return candidates
      .sort((a, b) => b.score - a.score)
      .slice(0, context.options.maxCandidatesPerDetector);
  }
}
```


## NavigationDetector

```ts
// src/detection/detectors/NavigationDetector.ts

import { BaseDetectorPlugin } from '../DetectorPlugin';
import {
  DetectionCandidate,
  DetectionContext,
  Evidence,
  PatternType,
} from '../types';

export type NavigationSubtype =
  | 'primary_navigation'
  | 'footer_navigation'
  | 'sidebar_navigation'
  | 'pagination'
  | 'unknown';

export class NavigationDetector extends BaseDetectorPlugin {
  readonly id = 'core.navigation';
  readonly kinds: PatternType[] = ['navigation'];
  readonly version = '2.0.0';

  applies(context: DetectionContext): boolean {
    return (
      context.options.includeNavigation &&
      context.getRegion('navigation').length > 0
    );
  }

  detect(context: DetectionContext): DetectionCandidate[] {
    const candidates: DetectionCandidate[] = [];

    for (const region of context.getRegion('navigation')) {
      const element = region.element;
      const subtype = this.inferSubtype(element);

      const evidence: Evidence[] = [];
      let score = region.score;

      evidence.push({
        signal: 'link_density',
        weight: 0.35,
        value: region.linkDensity,
        explanation: 'Region has high link density.',
      });

      if (subtype !== 'unknown') {
        score += 0.18;

        evidence.push({
          signal: 'navigation_location',
          weight: 0.18,
          value: subtype,
          explanation: `Region resembles ${subtype}.`,
        });
      }

      if (this.hasNavigationSemantics(element)) {
        score += 0.15;

        evidence.push({
          signal: 'navigation_semantics',
          weight: 0.15,
          value: true,
          explanation: 'Element uses nav/header/footer semantics.',
        });
      }

      if (this.looksLikePagination(element)) {
        subtype === 'unknown' && (subtype = 'pagination');

        score += 0.12;

        evidence.push({
          signal: 'pagination',
          weight: 0.12,
          value: true,
          explanation: 'Pagination-like controls were found.',
        });
      }

      if (score < context.options.minConfidence) {
        continue;
      }

      candidates.push(
        this.candidate({
          context,
          detectorId: this.id,
          kind: 'navigation',
          region,
          element,
          score,
          evidence,
          metadata: {
            subtype,
            linkCount: region.metadata.linkCount,
            linkDensity: region.linkDensity,
          },
        })
      );
    }

    return candidates
      .sort((a, b) => b.score - a.score)
      .slice(0, context.options.maxCandidatesPerDetector);
  }

  private inferSubtype(element: Element): NavigationSubtype {
    const tag = element.tagName.toLowerCase();
    const classAndId = `${element.id} ${element.className}`.toLowerCase();

    if (tag === 'footer' || /footer/.test(classAndId)) {
      return 'footer_navigation';
    }

    if (tag === 'aside' || /sidebar|side-nav|secondary-nav/.test(classAndId)) {
      return 'sidebar_navigation';
    }

    if (tag === 'header' || /header|top-nav|main-nav/.test(classAndId)) {
      return 'primary_navigation';
    }

    return 'unknown';
  }

  private hasNavigationSemantics(element: Element): boolean {
    const tag = element.tagName.toLowerCase();
    const role = element.getAttribute('role')?.toLowerCase();

    return (
      ['nav', 'header', 'footer', 'aside'].includes(tag) ||
      role === 'navigation' ||
      role === 'banner' ||
      role === 'contentinfo'
    );
  }

  private looksLikePagination(element: Element): boolean {
    const text = element.textContent?.toLowerCase() ?? '';

    return (
      /next|previous|prev|page \d+|older|newer/.test(text) ||
      Boolean(
        element.querySelector(
          '[rel=next], [rel=prev], [aria-label*="next" i], [aria-label*="previous" i]'
        )
      )
    );
  }
}
```


## Register the detectors

```ts
// src/engine/registerCoreDetectors.ts

import { ExtractorEngine } from './ExtractionEngine';
import { ArticleDetector } from '../detection/detectors/ArticleDetector';
import { AiChatDetector } from '../detection/detectors/AiChatDetector';
import { TableDetector } from '../detection/detectors/TableDetector';
import { ProductDetector } from '../detection/detectors/ProductDetector';
import { ListDetector } from '../detection/detectors/ListDetector';
import { NavigationDetector } from '../detection/detectors/NavigationDetector';

export function createExtractorEngine(): ExtractorEngine {
  return new ExtractorEngine()
    .registerDetector(new ArticleDetector())
    .registerDetector(new AiChatDetector())
    .registerDetector(new TableDetector())
    .registerDetector(new ProductDetector())
    .registerDetector(new ListDetector())
    .registerDetector(new NavigationDetector());
}
```


## Usage

```ts
import { createExtractorEngine } from './engine/registerCoreDetectors';

const engine = createExtractorEngine();

const result = await engine.extract(document, {
  includeNavigation: true,
  includeBoilerplate: true,
  minConfidence: 0.45,
});

console.log(result.classification.pageType);
console.log(result.classification.confidence);

for (const detection of result.selected) {
  console.log(detection.kind, detection.calibratedConfidence);
  console.log(detection.evidence);
}
```


## Next component

The next layer should be **typed extraction and output**:

1. `ExtractionMapper` — converts selected candidates into typed records.
2. `ArticleExtractor` — title, author, dates, body Markdown, headings, links, images.
3. `ProductExtractor` — normalized product schema.
4. `ChatExtractor` — ordered messages, roles, timestamps, attachments.
5. `TableExtractor` — headers, rows, cell typing, Markdown and JSON output.
6. `LlmContextFormatter` — compact, token-efficient context for LLM prompts.

<div align="center">⁂</div>

[^7_1]: DtataExtractor.md


---

# next

Next is the **typed extraction and output layer**. It converts arbitrated detections into stable, typed records, then renders them as JSON, Markdown, and compact LLM context.

## Extraction output types

```ts
// src/extraction/types.ts

import { PatternType } from '../detection/types';

export interface ExtractionMeta {
  extractionId: string;
  detectedKind: PatternType;
  confidence: number;
  url?: string;
  extractedAt: string;
  evidenceCount: number;
}

export interface ArticleExtraction {
  kind: 'article';
  title?: string;
  author?: string;
  publishedAt?: string;
  updatedAt?: string;
  readingTimeMinutes?: number;
  bodyMarkdown: string;
  headings: Array<{
    level: number;
    text: string;
  }>;
  images: string[];
  links: Array<{
    text: string;
    href: string;
  }>;
}

export interface ProductExtraction {
  kind: 'product';
  title?: string;
  brand?: string;
  price?: string;
  currency?: string;
  availability?: string;
  description?: string;
  sku?: string;
  images: string[];
  variants: unknown[];
  rating?: number;
  reviewCount?: number;
}

export interface ChatMessageExtraction {
  role: 'user' | 'assistant' | 'system' | 'unknown';
  text: string;
  timestamp?: string;
  attachments?: string[];
}

export interface AiChatExtraction {
  kind: 'ai_chat';
  title?: string;
  messages: ChatMessageExtraction[];
  composer?: {
    placeholder?: string;
    hasAttachments: boolean;
    hasVoiceInput: boolean;
  };
}

export interface TableExtraction {
  kind: 'table';
  headers: string[];
  rows: Array<Record<string, string | number | null>>;
  rowCount: number;
  columnCount: number;
  hasHeader: boolean;
}

export interface ListExtraction {
  kind: 'list';
  ordered: boolean;
  items: string[];
}

export type TypedExtraction =
  | ArticleExtraction
  | ProductExtraction
  | AiChatExtraction
  | TableExtraction
  | ListExtraction;

export interface ExtractionResultItem {
  meta: ExtractionMeta;
  data: TypedExtraction;
  markdown: string;
  llmContext: string;
}
```


## ExtractionMapper

```ts
// src/extraction/ExtractionMapper.ts

import {
  CalibratedDetectionCandidate,
} from '../engine/ExtractionEngine';
import { DetectionContext } from '../detection/types';
import {
  ExtractionResultItem,
  TypedExtraction,
} from './types';
import { ArticleExtractor } from './extractors/ArticleExtractor';
import { ProductExtractor } from './extractors/ProductExtractor';
import { AiChatExtractor } from './extractors/AiChatExtractor';
import { TableExtractor } from './extractors/TableExtractor';
import { ListExtractor } from './extractors/ListExtractor';
import { MarkdownFormatter } from '../output/MarkdownFormatter';
import { LlmContextFormatter } from '../output/LlmContextFormatter';

export class ExtractionMapper {
  private articleExtractor = new ArticleExtractor();
  private productExtractor = new ProductExtractor();
  private chatExtractor = new AiChatExtractor();
  private tableExtractor = new TableExtractor();
  private listExtractor = new ListExtractor();

  private markdownFormatter = new MarkdownFormatter();
  private llmFormatter = new LlmContextFormatter();

  map(
    candidate: CalibratedDetectionCandidate,
    context: DetectionContext
  ): ExtractionResultItem | null {
    const data = this.extractTypedData(candidate, context);

    if (!data) {
      return null;
    }

    const markdown = this.markdownFormatter.format(data);
    const llmContext = this.llmFormatter.format(data, {
      maxChars: 12000,
    });

    return {
      meta: {
        extractionId: `${candidate.detectorId}:${candidate.nodeId}`,
        detectedKind: candidate.kind,
        confidence: candidate.calibratedConfidence,
        url: context.page.url,
        extractedAt: new Date().toISOString(),
        evidenceCount: candidate.evidence.length,
      },
      data,
      markdown,
      llmContext,
    };
  }

  private extractTypedData(
    candidate: CalibratedDetectionCandidate,
    context: DetectionContext
  ): TypedExtraction | null {
    switch (candidate.kind) {
      case 'article':
        return this.articleExtractor.extract(candidate, context);

      case 'product':
        return this.productExtractor.extract(candidate, context);

      case 'ai_chat':
        return this.chatExtractor.extract(candidate, context);

      case 'table':
        return this.tableExtractor.extract(candidate, context);

      case 'list':
        return this.listExtractor.extract(candidate, context);

      default:
        return null;
    }
  }
}
```


## ArticleExtractor

```ts
// src/extraction/extractors/ArticleExtractor.ts

import {
  CalibratedDetectionCandidate,
} from '../../engine/ExtractionEngine';
import { DetectionContext } from '../../detection/types';
import { ArticleExtraction } from '../types';

export class ArticleExtractor {
  extract(
    candidate: CalibratedDetectionCandidate,
    context: DetectionContext
  ): ArticleExtraction {
    const element = candidate.element;
    const jsonLd = this.findArticleJsonLd(context);

    const title =
      this.text(jsonLd?.headline) ??
      this.text(element.querySelector('h1')) ??
      context.page.title;

    const author =
      this.text(jsonLd?.author?.name) ??
      this.text(
        element.querySelector(
          '[rel=author], [itemprop=author], .author, .byline, [data-author]'
        )
      );

    const publishedAt =
      this.text(jsonLd?.datePublished) ??
      element.querySelector('time[datetime]')?.getAttribute('datetime') ??
      undefined;

    const updatedAt =
      this.text(jsonLd?.dateModified) ??
      element.querySelector('[itemprop=dateModified]')
        ?.getAttribute('content') ??
      undefined;

    const body = this.extractBody(element);
    const headings = this.extractHeadings(element);
    const images = this.extractImages(element);
    const links = this.extractLinks(element);

    return {
      kind: 'article',
      title: title ?? undefined,
      author: author ?? undefined,
      publishedAt: publishedAt ?? undefined,
      updatedAt: updatedAt ?? undefined,
      readingTimeMinutes: this.estimateReadingTime(body),
      bodyMarkdown: body,
      headings,
      images,
      links,
    };
  }

  private extractBody(element: Element): string {
    const clone = element.cloneNode(true) as Element;

    clone
      .querySelectorAll(
        'script, style, noscript, nav, aside, footer, form, iframe, svg'
      )
      .forEach((noise) => noise.remove());

    return this.toMarkdown(clone);
  }

  private extractHeadings(element: Element) {
    return Array.from(
      element.querySelectorAll('h1, h2, h3, h4, h5, h6')
    ).map((heading) => ({
      level: Number(heading.tagName.slice(1)),
      text: this.clean(heading.textContent),
    }));
  }

  private extractImages(element: Element): string[] {
    return Array.from(element.querySelectorAll('img'))
      .map((image) =>
        image.getAttribute('src') ??
        image.getAttribute('data-src') ??
        undefined
      )
      .filter((value): value is string => Boolean(value));
  }

  private extractLinks(element: Element) {
    return Array.from(element.querySelectorAll('a[href]'))
      .map((link) => ({
        text: this.clean(link.textContent),
        href: link.getAttribute('href') ?? '',
      }))
      .filter((link) => link.href.length > 0);
  }

  private findArticleJsonLd(
    context: DetectionContext
  ): Record<string, unknown> | null {
    const accepted = new Set([
      'article',
      'blogposting',
      'newsarticle',
    ]);

    const stack = [...context.page.jsonLd];

    while (stack.length > 0) {
      const item = stack.pop();

      if (!item || typeof item !== 'object') {
        continue;
      }

      if (Array.isArray(item)) {
        stack.push(...item);
        continue;
      }

      const record = item as Record<string, unknown>;
      const type = record['@type'];

      const types = Array.isArray(type)
        ? type.map(String)
        : typeof type === 'string'
          ? [type]
          : [];

      if (types.some((value) => accepted.has(value.toLowerCase()))) {
        return record;
      }

      for (const child of Object.values(record)) {
        if (child && typeof child === 'object') {
          stack.push(child);
        }
      }
    }

    return null;
  }

  private toMarkdown(element: Element): string {
    const blocks: string[] = [];

    for (const child of Array.from(element.children)) {
      const tag = child.tagName.toLowerCase();

      if (tag === 'h1') {
        blocks.push(`# ${this.clean(child.textContent)}`);
      } else if (tag === 'h2') {
        blocks.push(`## ${this.clean(child.textContent)}`);
      } else if (tag === 'h3') {
        blocks.push(`### ${this.clean(child.textContent)}`);
      } else if (tag === 'h4') {
        blocks.push(`#### ${this.clean(child.textContent)}`);
      } else if (tag === 'h5') {
        blocks.push(`##### ${this.clean(child.textContent)}`);
      } else if (tag === 'h6') {
        blocks.push(`###### ${this.clean(child.textContent)}`);
      } else if (tag === 'p') {
        blocks.push(this.clean(child.textContent));
      } else if (tag === 'ul' || tag === 'ol') {
        const items = Array.from(child.querySelectorAll(':scope > li'))
          .map((item, index) =>
            tag === 'ol'
              ? `${index + 1}. ${this.clean(item.textContent)}`
              : `- ${this.clean(item.textContent)}`
          );

        blocks.push(items.join('\n'));
      } else if (tag === 'blockquote') {
        blocks.push(
          this.clean(child.textContent)
            .split('\n')
            .map((line) => `> ${line}`)
            .join('\n')
        );
      } else if (tag === 'pre') {
        blocks.push(
          `\`\`\`\n${child.textContent?.trim() ?? ''}\n\`\`\``
        );
      } else if (tag === 'img') {
        const src = child.getAttribute('src');
        const alt = child.getAttribute('alt') ?? '';

        if (src) {
          blocks.push(`![${alt}](${src})`);
        }
      } else {
        const nested = this.toMarkdown(child);

        if (nested.trim()) {
          blocks.push(nested);
        }
      }
    }

    return blocks
      .filter(Boolean)
      .join('\n\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private estimateReadingTime(markdown: string): number {
    const words = markdown
      .trim()
      .split(/\s+/)
      .filter(Boolean).length;

    return Math.max(1, Math.round(words / 220));
  }

  private text(value: unknown): string | undefined {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }

    if (value && typeof value === 'object') {
      const name = (value as Record<string, unknown>).name;

      if (typeof name === 'string') {
        return name.trim();
      }
    }

    return undefined;
  }

  private clean(text: string | null | undefined): string {
    return (text ?? '')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
```


## AiChatExtractor

```ts
// src/extraction/extractors/AiChatExtractor.ts

import {
  CalibratedDetectionCandidate,
} from '../../engine/ExtractionEngine';
import { DetectionContext } from '../../detection/types';
import {
  AiChatExtraction,
  ChatMessageExtraction,
} from '../types';

export class AiChatExtractor {
  extract(
    candidate: CalibratedDetectionCandidate,
    context: DetectionContext
  ): AiChatExtraction {
    const root = candidate.element;

    const messageElements = Array.from(
      root.querySelectorAll(
        [
          '[data-message-role]',
          '[data-role]',
          '[class*="message" i]',
          '[class*="chat-item" i]',
          '[class*="conversation-turn" i]',
        ].join(', ')
      )
    );

    const messages = messageElements
      .map((element) => this.extractMessage(element))
      .filter((message) => message.text.length > 0);

    return {
      kind: 'ai_chat',
      title: context.page.title,
      messages,
      composer: this.extractComposer(root),
    };
  }

  private extractMessage(element: Element): ChatMessageExtraction {
    return {
      role: this.inferRole(element),
      text: this.clean(element.textContent),
      timestamp:
        element.querySelector('time')?.getAttribute('datetime') ?? undefined,
      attachments: Array.from(
        element.querySelectorAll('img, a[href], video, audio')
      )
        .map((media) =>
          media.getAttribute('src') ?? media.getAttribute('href')
        )
        .filter((value): value is string => Boolean(value)),
    };
  }

  private inferRole(
    element: Element
  ): ChatMessageExtraction['role'] {
    const explicit = (
      element.getAttribute('data-message-role') ??
      element.getAttribute('data-role') ??
      ''
    ).toLowerCase();

    if (['user', 'human'].includes(explicit)) {
      return 'user';
    }

    if (['assistant', 'ai', 'bot', 'model'].includes(explicit)) {
      return 'assistant';
    }

    if (['system'].includes(explicit)) {
      return 'system';
    }

    const signature = `${element.id} ${element.className}`.toLowerCase();

    if (/user|human|question/.test(signature)) {
      return 'user';
    }

    if (/assistant|bot|ai|answer|model/.test(signature)) {
      return 'assistant';
    }

    return 'unknown';
  }

  private extractComposer(root: Element) {
    const composer = root.querySelector(
      [
        'form textarea',
        '[contenteditable="true"]',
        '[role="textbox"]',
        'textarea[placeholder]',
      ].join(', ')
    );

    return {
      placeholder:
        composer?.getAttribute('placeholder') ??
        composer?.getAttribute('aria-label') ??
        undefined,
      hasAttachments: Boolean(
        root.querySelector(
          '[aria-label*="attach" i], [data-testid*="attach" i], input[type=file]'
        )
      ),
      hasVoiceInput: Boolean(
        root.querySelector(
          '[aria-label*="voice" i], [aria-label*="microphone" i], [data-testid*="voice" i]'
        )
      ),
    };
  }

  private clean(text: string | null | undefined): string {
    return (text ?? '')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
```


## TableExtractor

```ts
// src/extraction/extractors/TableExtractor.ts

import {
  CalibratedDetectionCandidate,
} from '../../engine/ExtractionEngine';
import { DetectionContext } from '../../detection/types';
import { TableExtraction } from '../types';

export class TableExtractor {
  extract(
    candidate: CalibratedDetectionCandidate,
    context: DetectionContext
  ): TableExtraction {
    const element = candidate.element;

    const semanticRows = Array.from(
      element.querySelectorAll(':scope tr')
    );

    const ariaRows = Array.from(
      element.querySelectorAll(':scope [role=row]')
    );

    const rows = semanticRows.length > 0 ? semanticRows : ariaRows;

    const headerRow = this.findHeaderRow(element, rows);
    const headers = this.extractHeaders(headerRow);

    const dataRows = headerRow
      ? rows.filter((row) => row !== headerRow)
      : rows;

    const normalizedRows = dataRows.map((row) => {
      const cells = Array.from(
        row.querySelectorAll(
          ':scope > td, :scope > th, :scope > [role=cell], :scope > [role=gridcell]'
        )
      );

      const record: Record<string, string | number | null> = {};

      cells.forEach((cell, index) => {
        const key =
          headers[index] ?? `column_${index + 1}`;

        record[key] = this.parseCell(cell.textContent);
      });

      return record;
    });

    return {
      kind: 'table',
      headers,
      rows: normalizedRows,
      rowCount: normalizedRows.length,
      columnCount: headers.length || this.inferColumnCount(rows),
      hasHeader: headers.length > 0,
    };
  }

  private findHeaderRow(
    element: Element,
    rows: Element[]
  ): Element | null {
    const explicitHeader = rows.find((row) =>
      row.querySelector(':scope > th, :scope > [role=columnheader]')
    );

    if (explicitHeader) {
      return explicitHeader;
    }

    const theadRow = element.querySelector('thead tr');

    return theadRow ?? null;
  }

  private extractHeaders(headerRow: Element | null): string[] {
    if (!headerRow) {
      return [];
    }

    return Array.from(
      headerRow.querySelectorAll(
        ':scope > th, :scope > td, :scope > [role=columnheader], :scope > [role=cell]'
      )
    ).map((cell, index) => {
      const text = this.clean(cell.textContent);

      return text || `column_${index + 1}`;
    });
  }

  private inferColumnCount(rows: Element[]): number {
    if (rows.length === 0) {
      return 0;
    }

    return Math.max(
      ...rows.map(
        (row) =>
          row.querySelectorAll(
            ':scope > td, :scope > th, :scope > [role=cell], :scope > [role=gridcell]'
          ).length
      )
    );
  }

  private parseCell(text: string | null | undefined) {
    const value = this.clean(text);

    if (!value) {
      return null;
    }

    if (/^-?\d+(\.\d+)?$/.test(value)) {
      return Number(value);
    }

    return value;
  }

  private clean(text: string | null | undefined): string {
    return (text ?? '')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
```


## ProductExtractor

```ts
// src/extraction/extractors/ProductExtractor.ts

import {
  CalibratedDetectionCandidate,
} from '../../engine/ExtractionEngine';
import { DetectionContext } from '../../detection/types';
import { ProductExtraction } from '../types';

export class ProductExtractor {
  extract(
    candidate: CalibratedDetectionCandidate,
    context: DetectionContext
  ): ProductExtraction {
    const element = candidate.element;
    const jsonLd = this.findProductJsonLd(context);

    const field = (name: string) =>
      candidate.fields[name]?.value;

    return {
      kind: 'product',
      title:
        this.text(jsonLd?.name) ??
        this.text(field('title')) ??
        this.text(element.querySelector('h1')),
      brand:
        this.text(jsonLd?.brand?.name) ??
        this.text(field('brand')),
      price:
        this.text(jsonLd?.offers?.price) ??
        this.text(field('price')),
      currency:
        this.text(jsonLd?.offers?.priceCurrency) ??
        this.text(field('currency')),
      availability:
        this.text(jsonLd?.offers?.availability) ??
        this.text(field('availability')),
      description:
        this.text(jsonLd?.description) ??
        this.text(field('description')),
      sku:
        this.text(jsonLd?.sku) ??
        this.text(field('sku')),
      images: this.extractImages(element, jsonLd),
      variants:
        (field('variants') as unknown[] | undefined) ?? [],
      rating: this.extractRating(jsonLd),
      reviewCount: this.extractReviewCount(jsonLd),
    };
  }

  private findProductJsonLd(
    context: DetectionContext
  ): Record<string, unknown> | null {
    const stack = [...context.page.jsonLd];

    while (stack.length > 0) {
      const item = stack.pop();

      if (!item || typeof item !== 'object') {
        continue;
      }

      if (Array.isArray(item)) {
        stack.push(...item);
        continue;
      }

      const record = item as Record<string, unknown>;
      const type = record['@type'];

      const types = Array.isArray(type)
        ? type.map(String)
        : typeof type === 'string'
          ? [type]
          : [];

      if (types.some((value) => value.toLowerCase() === 'product')) {
        return record;
      }

      for (const child of Object.values(record)) {
        if (child && typeof child === 'object') {
          stack.push(child);
        }
      }
    }

    return null;
  }

  private extractImages(
    element: Element,
    jsonLd: Record<string, unknown> | null
  ): string[] {
    const jsonLdImages = jsonLd?.image;

    const fromJsonLd = Array.isArray(jsonLdImages)
      ? jsonLdImages.filter(
          (value): value is string => typeof value === 'string'
        )
      : typeof jsonLdImages === 'string'
        ? [jsonLdImages]
        : [];

    const fromDom = Array.from(element.querySelectorAll('img'))
      .map((image) =>
        image.getAttribute('src') ??
        image.getAttribute('data-src')
      )
      .filter((value): value is string => Boolean(value));

    return Array.from(new Set([...fromJsonLd, ...fromDom]));
  }

  private extractRating(
    jsonLd: Record<string, unknown> | null
  ): number | undefined {
    const rating = jsonLd?.aggregateRating as
      | Record<string, unknown>
      | undefined;

    const value = rating?.ratingValue;

    return typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : undefined;
  }

  private extractReviewCount(
    jsonLd: Record<string, unknown> | null
  ): number | undefined {
    const rating = jsonLd?.aggregateRating as
      | Record<string, unknown>
      | undefined;

    const value = rating?.reviewCount ?? rating?.ratingCount;

    return typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : undefined;
  }

  private text(value: unknown): string | undefined {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }

    if (value && typeof value === 'object') {
      const nested = value as Record<string, unknown>;

      if (typeof nested.name === 'string') {
        return nested.name.trim();
      }
    }

    return undefined;
  }
}
```


## ListExtractor

```ts
// src/extraction/extractors/ListExtractor.ts

import {
  CalibratedDetectionCandidate,
} from '../../engine/ExtractionEngine';
import { DetectionContext } from '../../detection/types';
import { ListExtraction } from '../types';

export class ListExtractor {
  extract(
    candidate: CalibratedDetectionCandidate,
    context: DetectionContext
  ): ListExtraction {
    const element = candidate.element;

    const items = Array.from(
      element.querySelectorAll(':scope > li, :scope > [role=listitem]')
    ).map((item) => this.clean(item.textContent));

    return {
      kind: 'list',
      ordered: element.tagName.toLowerCase() === 'ol',
      items: items.filter(Boolean),
    };
  }

  private clean(text: string | null | undefined): string {
    return (text ?? '')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
```


## MarkdownFormatter

```ts
// src/output/MarkdownFormatter.ts

import { TypedExtraction } from '../extraction/types';

export class MarkdownFormatter {
  format(data: TypedExtraction): string {
    switch (data.kind) {
      case 'article':
        return this.formatArticle(data);

      case 'product':
        return this.formatProduct(data);

      case 'ai_chat':
        return this.formatChat(data);

      case 'table':
        return this.formatTable(data);

      case 'list':
        return this.formatList(data);

      default:
        return '';
    }
  }

  private formatArticle(data: Extract<typeof data, { kind: 'article' }>) {
    const parts: string[] = [];

    if (data.title) {
      parts.push(`# ${data.title}`);
    }

    const byline = [
      data.author,
      data.publishedAt,
      data.readingTimeMinutes
        ? `${data.readingTimeMinutes} min read`
        : undefined,
    ]
      .filter(Boolean)
      .join(' · ');

    if (byline) {
      parts.push(`_${byline}_`);
    }

    if (data.bodyMarkdown) {
      parts.push(data.bodyMarkdown);
    }

    return parts.join('\n\n');
  }

  private formatProduct(data: Extract<typeof data, { kind: 'product' }>) {
    const parts: string[] = [];

    if (data.title) {
      parts.push(`# ${data.title}`);
    }

    if (data.brand) {
      parts.push(`**Brand:** ${data.brand}`);
    }

    if (data.price) {
      parts.push(
        `**Price:** ${data.price}${data.currency ? ` ${data.currency}` : ''}`
      );
    }

    if (data.availability) {
      parts.push(`**Availability:** ${data.availability}`);
    }

    if (data.description) {
      parts.push(data.description);
    }

    if (data.images.length > 0) {
      parts.push(
        data.images.map((image) => `![product image](${image})`).join('\n')
      );
    }

    return parts.join('\n\n');
  }

  private formatChat(data: Extract<typeof data, { kind: 'ai_chat' }>) {
    const parts: string[] = [];

    if (data.title) {
      parts.push(`# ${data.title}`);
    }

    for (const message of data.messages) {
      const role =
        message.role === 'unknown'
          ? 'Message'
          : message.role.charAt(0).toUpperCase() +
            message.role.slice(1);

      parts.push(`## ${role}\n\n${message.text}`);
    }

    return parts.join('\n\n');
  }

  private formatTable(data: Extract<typeof data, { kind: 'table' }>) {
    if (data.rows.length === 0) {
      return '';
    }

    const headers = data.headers.length > 0
      ? data.headers
      : Object.keys(data.rows[0]);

    const headerRow = `| ${headers.join(' | ')} |`;
    const divider = `| ${headers.map(() => '---').join(' | ')} |`;

    const rows = data.rows.map((row) =>
      `| ${headers
        .map((header) => String(row[header] ?? ''))
        .join(' | ')} |`
    );

    return [headerRow, divider, ...rows].join('\n');
  }

  private formatList(data: Extract<typeof data, { kind: 'list' }>) {
    return data.items
      .map((item, index) =>
        data.ordered ? `${index + 1}. ${item}` : `- ${item}`
      )
      .join('\n');
  }
}
```


## LlmContextFormatter

```ts
// src/output/LlmContextFormatter.ts

import { TypedExtraction } from '../extraction/types';

export interface LlmContextOptions {
  maxChars?: number;
  includeMetadata?: boolean;
}

export class LlmContextFormatter {
  format(
    data: TypedExtraction,
    options: LlmContextOptions = {}
  ): string {
    const maxChars = options.maxChars ?? 10000;

    const markdown = this.toLlmMarkdown(data, options);

    if (markdown.length <= maxChars) {
      return markdown;
    }

    return this.truncate(markdown, maxChars);
  }

  private toLlmMarkdown(
    data: TypedExtraction,
    options: LlmContextOptions
  ): string {
    switch (data.kind) {
      case 'article':
        return [
          '<document type="article">',
          data.title ? `<title>${data.title}</title>` : '',
          data.author ? `<author>${data.author}</author>` : '',
          data.publishedAt
            ? `<published>${data.publishedAt}</published>`
            : '',
          '<body>',
          data.bodyMarkdown,
          '</body>',
          '</document>',
        ]
          .filter(Boolean)
          .join('\n');

      case 'product':
        return [
          '<document type="product">',
          data.title ? `<title>${data.title}</title>` : '',
          data.brand ? `<brand>${data.brand}</brand>` : '',
          data.price ? `<price>${data.price} ${data.currency ?? ''}</price>` : '',
          data.availability
            ? `<availability>${data.availability}</availability>`
            : '',
          data.description
            ? `<description>${data.description}</description>`
            : '',
          '</document>',
        ]
          .filter(Boolean)
          .join('\n');

      case 'ai_chat':
        return [
          '<document type="ai_chat">',
          ...data.messages.map((message) =>
            `<message role="${message.role}">\n${message.text}\n</message>`
          ),
          '</document>',
        ].join('\n');

      case 'table':
        return [
          '<document type="table">',
          `columns: ${data.headers.join(', ')}`,
          `rows: ${data.rowCount}`,
          '</document>',
        ].join('\n');

      case 'list':
        return [
          '<document type="list">',
          ...data.items.map((item) => `- ${item}`),
          '</document>',
        ].join('\n');

      default:
        return '';
    }
  }

  private truncate(text: string, maxChars: number): string {
    if (text.length <= maxChars) {
      return text;
    }

    return `${text.slice(0, maxChars)}\n\n[truncated]`;
  }
}
```


## Wire into the engine

Add this to `ExtractorEngine.extract()` after `selected` is computed:

```ts
const mapper = new ExtractionMapper();

const extractions = selected
  .map((candidate) => mapper.map(candidate, context))
  .filter((item): item is ExtractionResultItem => item !== null);

return {
  page: context.page,
  classification,
  candidates,
  selected,
  extractions,
};
```

And extend the result type:

```ts
export interface ExtractionResult {
  page: DetectionContext['page'];
  classification: PageClassification;
  candidates: CalibratedDetectionCandidate[];
  selected: CalibratedDetectionCandidate[];
  extractions: ExtractionResultItem[];
}
```


## What you now have

The pipeline is now complete end-to-end:

```text
DOM
→ normalize/prune
→ segment blocks
→ group regions
→ detect candidates
→ arbitrate overlaps
→ classify page
→ calibrate confidence
→ extract typed data
→ render Markdown / JSON / LLM context
```

The next high-leverage step is a **fixture-based evaluation harness**: HTML snapshots for articles, product pages, product grids, AI chats, tables, and navigation-heavy pages, plus expected regions/fields. That will let you measure boundary accuracy, field F1, selector stability, and regression safety before adding more detectors.

---

# next

Next is the **evaluation harness**. It turns the engine from “seems to work” into a measurable system: fixture pages, expected regions/fields, precision/recall/F1, boundary accuracy, and regression checks.

## Fixture schema

Store one HTML snapshot plus one expected-output JSON file per case.

```text
tests/fixtures/
  article/wordpress-basic/
    page.html
    expected.json
  product/shopify-basic/
    page.html
    expected.json
  product-grid/shopify-collection/
    page.html
    expected.json
  ai-chat/generic-chat/
    page.html
    expected.json
  table/docs-table/
    page.html
    expected.json
  navigation/header-footer/
    page.html
    expected.json
```

```json
// tests/fixtures/article/wordpress-basic/expected.json
{
  "id": "article/wordpress-basic",
  "pageType": "article",
  "minPageConfidence": 0.6,
  "expectedRegions": [
    {
      "kind": "article",
      "required": true,
      "mustContainText": [
        "How to build reliable browser agents",
        "The extraction engine should normalize the DOM"
      ],
      "mustNotContainText": [
        "Cookie preferences",
        "Subscribe to our newsletter"
      ],
      "maxLinkDensity": 0.45
    }
  ],
  "expectedFields": {
    "article.title": {
      "equals": "How to build reliable browser agents"
    },
    "article.author": {
      "contains": "Jane Doe"
    }
  },
  "forbiddenDetections": [
    {
      "kind": "product",
      "reason": "Article fixture should not be classified as commerce"
    }
  ]
}
```


## Evaluation types

```ts
// src/evaluation/types.ts

import { PatternType } from '../detection/types';
import { PageType } from '../classification/types';

export interface ExpectedRegion {
  kind: PatternType;
  required?: boolean;
  mustContainText?: string[];
  mustNotContainText?: string[];
  maxLinkDensity?: number;
  minConfidence?: number;
}

export interface ExpectedField {
  equals?: unknown;
  contains?: string | number;
  exists?: boolean;
}

export interface FixtureExpectation {
  id: string;
  pageType: PageType;
  minPageConfidence?: number;
  expectedRegions: ExpectedRegion[];
  expectedFields?: Record<string, ExpectedField>;
  forbiddenDetections?: Array<{
    kind: PatternType;
    reason: string;
  }>;
}

export interface RegionEvaluation {
  kind: PatternType;
  passed: boolean;
  found: boolean;
  failures: string[];
}

export interface FieldEvaluation {
  field: string;
  passed: boolean;
  actual?: unknown;
  expected: ExpectedField;
  failures: string[];
}

export interface FixtureEvaluation {
  fixtureId: string;
  passed: boolean;
  pageTypePassed: boolean;
  predictedPageType: PageType;
  expectedPageType: PageType;
  pageConfidence: number;
  regionEvaluations: RegionEvaluation[];
  fieldEvaluations: FieldEvaluation[];
  forbiddenViolations: string[];
  failures: string[];
}

export interface SuiteEvaluation {
  totalFixtures: number;
  passedFixtures: number;
  failedFixtures: number;
  passRate: number;
  regionPrecision: number;
  regionRecall: number;
  regionF1: number;
  fieldPrecision: number;
  fieldRecall: number;
  fieldF1: number;
  fixtureEvaluations: FixtureEvaluation[];
}
```


## EvaluationHarness

```ts
// src/evaluation/EvaluationHarness.ts

import { ExtractorEngine } from '../engine/ExtractionEngine';
import {
  ExtractionResultItem,
} from '../extraction/types';
import {
  FixtureEvaluation,
  FixtureExpectation,
  RegionEvaluation,
  FieldEvaluation,
  SuiteEvaluation,
} from './types';
import { PatternType } from '../detection/types';
import { PageType } from '../classification/types';

export interface FixtureInput {
  expectation: FixtureExpectation;
  html: string;
  url?: string;
}

export class EvaluationHarness {
  constructor(private engine: ExtractorEngine) {}

  async evaluateSuite(
    fixtures: FixtureInput[]
  ): Promise<SuiteEvaluation> {
    const evaluations: FixtureEvaluation[] = [];

    for (const fixture of fixtures) {
      evaluations.push(await this.evaluateFixture(fixture));
    }

    return this.summarize(evaluations);
  }

  async evaluateFixture(
    fixture: FixtureInput
  ): Promise<FixtureEvaluation> {
    const dom = this.createDom(fixture.html, fixture.url);

    const result = await this.engine.extract(dom, {
      includeNavigation: true,
      includeBoilerplate: true,
      minConfidence: 0.3,
    });

    const regionEvaluations = fixture.expectation.expectedRegions.map(
      (expected) =>
        this.evaluateRegion(expected, result.extractions)
    );

    const fieldEvaluations = Object.entries(
      fixture.expectation.expectedFields ?? {}
    ).map(([field, expected]) =>
      this.evaluateField(field, expected, result.extractions)
    );

    const forbiddenViolations = this.evaluateForbiddenDetections(
      fixture.expectation,
      result.extractions
    );

    const pageTypePassed =
      result.classification.pageType === fixture.expectation.pageType;

    const pageConfidencePassed =
      fixture.expectation.minPageConfidence === undefined ||
      result.classification.confidence >=
        fixture.expectation.minPageConfidence;

    const failures: string[] = [];

    if (!pageTypePassed) {
      failures.push(
        `Expected page type "${fixture.expectation.pageType}", got "${result.classification.pageType}".`
      );
    }

    if (!pageConfidencePassed) {
      failures.push(
        `Page confidence ${result.classification.confidence} is below required ${fixture.expectation.minPageConfidence}.`
      );
    }

    for (const region of regionEvaluations) {
      failures.push(...region.failures);
    }

    for (const field of fieldEvaluations) {
      failures.push(...field.failures);
    }

    failures.push(...forbiddenViolations);

    return {
      fixtureId: fixture.expectation.id,
      passed: failures.length === 0,
      pageTypePassed,
      predictedPageType: result.classification.pageType,
      expectedPageType: fixture.expectation.pageType,
      pageConfidence: result.classification.confidence,
      regionEvaluations,
      fieldEvaluations,
      forbiddenViolations,
      failures,
    };
  }

  private evaluateRegion(
    expected: FixtureExpectation['expectedRegions'][number],
    extractions: ExtractionResultItem[]
  ): RegionEvaluation {
    const failures: string[] = [];

    const matches = extractions.filter(
      (extraction) => extraction.meta.detectedKind === expected.kind
    );

    if (matches.length === 0) {
      if (expected.required !== false) {
        failures.push(`Required region "${expected.kind}" was not detected.`);
      }

      return {
        kind: expected.kind,
        passed: expected.required === false,
        found: false,
        failures,
      };
    }

    const passing = matches.find((extraction) => {
      const markdown = extraction.markdown.toLowerCase();
      const dataText = JSON.stringify(extraction.data).toLowerCase();

      const containsAll = (expected.mustContainText ?? []).every(
        (text) =>
          markdown.includes(text.toLowerCase()) ||
          dataText.includes(text.toLowerCase())
      );

      const containsNone = (expected.mustNotContainText ?? []).every(
        (text) =>
          !markdown.includes(text.toLowerCase()) &&
          !dataText.includes(text.toLowerCase())
      );

      const linkDensityOk =
        expected.maxLinkDensity === undefined ||
        this.getLinkDensity(extraction) <= expected.maxLinkDensity;

      const confidenceOk =
        expected.minConfidence === undefined ||
        extraction.meta.confidence >= expected.minConfidence;

      return (
        containsAll &&
        containsNone &&
        linkDensityOk &&
        confidenceOk
      );
    });

    if (!passing) {
      failures.push(
        `Detected "${expected.kind}" region did not satisfy expectations.`
      );
    }

    return {
      kind: expected.kind,
      passed: Boolean(passing),
      found: true,
      failures,
    };
  }

  private evaluateField(
    field: string,
    expected: FixtureExpectation['expectedFields'][string],
    extractions: ExtractionResultItem[]
  ): FieldEvaluation {
    const [kind, fieldName] = field.split('.') as [
      PatternType,
      string
    ];

    const extraction = extractions.find(
      (item) => item.meta.detectedKind === kind
    );

    const actual = extraction
      ? (extraction.data as Record<string, unknown>)[fieldName]
      : undefined;

    const failures: string[] = [];

    if (expected.exists === true && (actual === undefined || actual === null)) {
      failures.push(`Field "${field}" should exist.`);
    }

    if (expected.equals !== undefined && actual !== expected.equals) {
      failures.push(
        `Field "${field}" expected ${JSON.stringify(expected.equals)}, got ${JSON.stringify(actual)}.`
      );
    }

    if (
      typeof expected.contains === 'string' &&
      !String(actual ?? '')
        .toLowerCase()
        .includes(expected.contains.toLowerCase())
    ) {
      failures.push(
        `Field "${field}" should contain "${expected.contains}", got "${String(actual ?? '')}".`
      );
    }

    return {
      field,
      passed: failures.length === 0,
      actual,
      expected,
      failures,
    };
  }

  private evaluateForbiddenDetections(
    expectation: FixtureExpectation,
    extractions: ExtractionResultItem[]
  ): string[] {
    const violations: string[] = [];

    for (const forbidden of expectation.forbiddenDetections ?? []) {
      const found = extractions.some(
        (extraction) =>
          extraction.meta.detectedKind === forbidden.kind
      );

      if (found) {
        violations.push(
          `Forbidden detection "${forbidden.kind}" was found: ${forbidden.reason}.`
        );
      }
    }

    return violations;
  }

  private getLinkDensity(extraction: ExtractionResultItem): number {
    const markdown = extraction.markdown;

    const links = (markdown.match(/\]\(/g) ?? []).length;
    const words = markdown
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .split(/\s+/)
      .filter(Boolean).length;

    if (words === 0) {
      return 1;
    }

    return Math.min(1, links / words);
  }

  private createDom(html: string, url?: string): Document {
    const dom = new DOMParser().parseFromString(html, 'text/html');

    if (url) {
      Object.defineProperty(dom, 'URL', {
        value: url,
        configurable: true,
      });
    }

    return dom;
  }

  private summarize(
    evaluations: FixtureEvaluation[]
  ): SuiteEvaluation {
    const passedFixtures = evaluations.filter(
      (evaluation) => evaluation.passed
    ).length;

    const expectedRegions = evaluations.flatMap(
      (evaluation) => evaluation.regionEvaluations
    );

    const truePositives = expectedRegions.filter(
      (region) => region.passed
    ).length;

    const falseNegatives = expectedRegions.filter(
      (region) => !region.found
    ).length;

    const falsePositives = expectedRegions.filter(
      (region) => region.found && !region.passed
    ).length;

    const regionPrecision = safeDivide(
      truePositives,
      truePositives + falsePositives
    );

    const regionRecall = safeDivide(
      truePositives,
      truePositives + falseNegatives
    );

    const expectedFields = evaluations.flatMap(
      (evaluation) => evaluation.fieldEvaluations
    );

    const fieldTruePositives = expectedFields.filter(
      (field) => field.passed
    ).length;

    const fieldFalseNegatives = expectedFields.filter(
      (field) => field.actual === undefined || field.actual === null
    ).length;

    const fieldFalsePositives = expectedFields.filter(
      (field) =>
        field.actual !== undefined &&
        field.actual !== null &&
        !field.passed
    ).length;

    const fieldPrecision = safeDivide(
      fieldTruePositives,
      fieldTruePositives + fieldFalsePositives
    );

    const fieldRecall = safeDivide(
      fieldTruePositives,
      fieldTruePositives + fieldFalseNegatives
    );

    return {
      totalFixtures: evaluations.length,
      passedFixtures,
      failedFixtures: evaluations.length - passedFixtures,
      passRate: safeDivide(passedFixtures, evaluations.length),
      regionPrecision,
      regionRecall,
      regionF1: safeF1(regionPrecision, regionRecall),
      fieldPrecision,
      fieldRecall,
      fieldF1: safeF1(fieldPrecision, fieldRecall),
      fixtureEvaluations: evaluations,
    };
  }
}

function safeDivide(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

function safeF1(precision: number, recall: number): number {
  if (precision + recall === 0) {
    return 0;
  }

  return (2 * precision * recall) / (precision + recall);
}
```


## Vitest runner

```ts
// tests/evaluation/extraction.evaluation.test.ts

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { createExtractorEngine } from '../../src/engine/registerCoreDetectors';
import { EvaluationHarness } from '../../src/evaluation/EvaluationHarness';
import {
  FixtureExpectation,
} from '../../src/evaluation/types';

const FIXTURE_ROOT = join(__dirname, '../fixtures');

function loadFixtures(): Array<{
  id: string;
  html: string;
  expectation: FixtureExpectation;
}> {
  const fixtures: Array<{
    id: string;
    html: string;
    expectation: FixtureExpectation;
  }> = [];

  for (const category of readdirSync(FIXTURE_ROOT)) {
    const categoryPath = join(FIXTURE_ROOT, category);

    if (!statSync(categoryPath).isDirectory()) {
      continue;
    }

    for (const name of readdirSync(categoryPath)) {
      const fixturePath = join(categoryPath, name);

      if (!statSync(fixturePath).isDirectory()) {
        continue;
      }

      const htmlPath = join(fixturePath, 'page.html');
      const expectedPath = join(fixturePath, 'expected.json');

      const html = readFileSync(htmlPath, 'utf8');
      const expectation = JSON.parse(
        readFileSync(expectedPath, 'utf8')
      ) as FixtureExpectation;

      fixtures.push({
        id: expectation.id,
        html,
        expectation,
      });
    }
  }

  return fixtures;
}

describe('DOM extraction evaluation suite', () => {
  const engine = createExtractorEngine();
  const harness = new EvaluationHarness(engine);
  const fixtures = loadFixtures();

  it('has fixtures', () => {
    expect(fixtures.length).toBeGreaterThan(0);
  });

  it('meets the minimum quality gate', async () => {
    const suite = await harness.evaluateSuite(
      fixtures.map((fixture) => ({
        html: fixture.html,
        expectation: fixture.expectation,
        url: `https://example.com/${fixture.id}`,
      }))
    );

    console.log('Evaluation summary:', {
      passRate: suite.passRate,
      regionPrecision: suite.regionPrecision,
      regionRecall: suite.regionRecall,
      regionF1: suite.regionF1,
      fieldPrecision: suite.fieldPrecision,
      fieldRecall: suite.fieldRecall,
      fieldF1: suite.fieldF1,
    });

    expect(suite.passRate).toBeGreaterThanOrEqual(0.8);
    expect(suite.regionF1).toBeGreaterThanOrEqual(0.75);
    expect(suite.fieldF1).toBeGreaterThanOrEqual(0.7);
  });

  it.each(fixtures)('passes fixture: $id', async (fixture) => {
    const evaluation = await harness.evaluateFixture({
      html: fixture.html,
      expectation: fixture.expectation,
      url: `https://example.com/${fixture.id}`,
    });

    if (!evaluation.passed) {
      console.error(evaluation.failures);
    }

    expect(evaluation.passed).toBe(true);
  });
});
```


## Example fixture

```html
<!-- tests/fixtures/article/wordpress-basic/page.html -->
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>How to build reliable browser agents</title>
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        "headline": "How to build reliable browser agents",
        "author": { "@type": "Person", "name": "Jane Doe" },
        "datePublished": "2026-10-20"
      }
    </script>
  </head>
  <body>
    <header>
      <nav>
        <a href="/">Home</a>
        <a href="/blog">Blog</a>
        <a href="/pricing">Pricing</a>
      </nav>
    </header>

    <main>
      <article>
        <h1>How to build reliable browser agents</h1>
        <p class="byline">By Jane Doe · October 20, 2026</p>

        <p>
          The extraction engine should normalize the DOM before attempting to
          identify page regions. This reduces noise and improves accuracy.
        </p>

        <h2>Why normalization matters</h2>
        <p>
          Modern web applications contain scripts, hidden containers, cookie
          banners, and dynamic widgets. A robust extractor should remove or
          flag these before scoring content.
        </p>

        <figure>
          <img src="/images/architecture.png" alt="Architecture diagram" />
          <figcaption>High-level extraction architecture</figcaption>
        </figure>
      </article>
    </main>

    <footer>
      <a href="/privacy">Privacy</a>
      <a href="/terms">Terms</a>
    </footer>
  </body>
</html>
```


## Quality gates

Start with these minimum thresholds:


| Metric | Initial gate | Production target |
| :-- | --: | --: |
| Fixture pass rate | 80% | 95% |
| Region precision | 80% | 92% |
| Region recall | 75% | 90% |
| Region F1 | 75% | 90% |
| Field precision | 75% | 90% |
| Field recall | 70% | 88% |
| Field F1 | 70% | 88% |

## What to measure next

After the basic suite works, add these specialized evaluations:

- **Boundary accuracy:** compare the detected region’s DOM range with a manually labeled range.
- **Selector stability:** render each fixture twice with altered class names, whitespace, and wrapper elements, then verify that extraction still succeeds.
- **Noise resistance:** inject cookie banners, modals, ads, and newsletter forms into fixtures.
- **Dynamic-page simulation:** append chat messages or product cards after initial load and verify incremental extraction.
- **Performance:** measure normalization, segmentation, detection, and extraction time on 1 MB+ DOM snapshots.

The next component after this is a **selector stability layer**: stable locator generation, fallback resolution, and re-identification of a previously selected region after DOM changes.

---

# next

Next is the **selector stability layer**. It generates resilient locators for detected regions and re-finds them after DOM changes, navigation, re-renders, or minor class/hash changes.

## Locator types

```ts
// src/stability/types.ts

export type LocatorStrategy =
  | 'data-attribute'
  | 'aria'
  | 'semantic'
  | 'structural'
  | 'text-signature'
  | 'css-path'
  | 'xpath';

export interface StableLocator {
  strategy: LocatorStrategy;
  selector: string;
  robustness: number;
  description: string;
}

export interface StableRegionLocator {
  regionId: string;
  kind: string;
  primary: StableLocator;
  fallbacks: StableLocator[];
  textSignature: string;
  structuralSignature: string;
}

export interface RelocationResult {
  found: boolean;
  element?: Element;
  locator?: StableLocator;
  confidence: number;
  attempts: Array<{
    locator: StableLocator;
    matched: boolean;
    confidence: number;
  }>;
}
```


## SelectorStabilizer

```ts
// src/stability/SelectorStabilizer.ts

import {
  StableLocator,
  StableRegionLocator,
} from './types';

const UNSTABLE_CLASS_PATTERN = /(?:^|[-_])(css|sc|jsx|hash|generated|random|v[0-9]+)[-_]?[a-z0-9]{6,}$/i;

export class SelectorStabilizer {
  createLocator(
    element: Element,
    regionId: string,
    kind: string
  ): StableRegionLocator {
    const candidates = [
      this.createDataAttributeLocator(element),
      this.createAriaLocator(element),
      this.createSemanticLocator(element),
      this.createStructuralLocator(element),
      this.createTextSignatureLocator(element),
      this.createCssPathLocator(element),
      this.createXPathLocator(element),
    ].filter(
      (locator): locator is StableLocator => locator !== null
    );

    const sorted = candidates.sort(
      (a, b) => b.robustness - a.robustness
    );

    const primary = sorted[0];
    const fallbacks = sorted.slice(1);

    return {
      regionId,
      kind,
      primary,
      fallbacks,
      textSignature: this.createTextSignature(element),
      structuralSignature: this.createStructuralSignature(element),
    };
  }

  relocate(
    locator: StableRegionLocator,
    root: ParentNode
  ): RelocationResult {
    const attempts: RelocationResult['attempts'] = [];

    const orderedLocators = [
      locator.primary,
      ...locator.fallbacks,
    ];

    for (const candidate of orderedLocators) {
      const element = this.query(root, candidate);

      const matched = Boolean(element);

      const confidence = matched
        ? this.scoreRelocation(candidate, element!, locator)
        : 0;

      attempts.push({
        locator: candidate,
        matched,
        confidence,
      });

      if (matched && confidence >= 0.55) {
        return {
          found: true,
          element: element!,
          locator: candidate,
          confidence,
          attempts,
        };
      }
    }

    const textMatch = this.relocateByTextSignature(
      root,
      locator.textSignature
    );

    attempts.push({
      locator: {
        strategy: 'text-signature',
        selector: locator.textSignature,
        robustness: 0.45,
        description: 'Text signature fallback',
      },
      matched: Boolean(textMatch),
      confidence: textMatch ? 0.5 : 0,
    });

    if (textMatch) {
      return {
        found: true,
        element: textMatch,
        locator: {
          strategy: 'text-signature',
          selector: locator.textSignature,
          robustness: 0.45,
          description: 'Text signature fallback',
        },
        confidence: 0.5,
        attempts,
      };
    }

    return {
      found: false,
      confidence: 0,
      attempts,
    };
  }

  private query(
    root: ParentNode,
    locator: StableLocator
  ): Element | null {
    try {
      if (locator.strategy === 'xpath') {
        return this.queryXPath(root, locator.selector);
      }

      if (root instanceof Document) {
        return root.querySelector(locator.selector);
      }

      return (root as Element).querySelector(locator.selector);
    } catch {
      return null;
    }
  }

  private queryXPath(
    root: ParentNode,
    expression: string
  ): Element | null {
    const doc =
      root instanceof Document
        ? root
        : root.ownerDocument;

    if (!doc) {
      return null;
    }

    const result = doc.evaluate(
      expression,
      root,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null
    );

    return result.singleNodeValue as Element | null;
  }

  private createDataAttributeLocator(
    element: Element
  ): StableLocator | null {
    const attributes = Array.from(element.attributes);

    const stableAttribute = attributes.find((attribute) => {
      const name = attribute.name.toLowerCase();

      return (
        name.startsWith('data-') &&
        !/react|next|styled|emotion|vue|test|cid|id/.test(name) &&
        attribute.value.length > 0 &&
        attribute.value.length < 100
      );
    });

    if (!stableAttribute) {
      return null;
    }

    return {
      strategy: 'data-attribute',
      selector: `[${stableAttribute.name}="${this.escapeSelectorValue(
        stableAttribute.value
      )}"]`,
      robustness: 0.95,
      description: `Stable data attribute: ${stableAttribute.name}`,
    };
  }

  private createAriaLocator(
    element: Element
  ): StableLocator | null {
    const role = element.getAttribute('role');
    const label =
      element.getAttribute('aria-label') ??
      element.getAttribute('aria-labelledby');

    if (role && label) {
      return {
        strategy: 'aria',
        selector: `[role="${role}"][aria-label="${this.escapeSelectorValue(
          label
        )}"]`,
        robustness: 0.88,
        description: 'ARIA role and accessible name',
      };
    }

    if (role) {
      return {
        strategy: 'aria',
        selector: `[role="${role}"]`,
        robustness: 0.65,
        description: `ARIA role: ${role}`,
      };
    }

    return null;
  }

  private createSemanticLocator(
    element: Element
  ): StableLocator | null {
    const tag = element.tagName.toLowerCase();

    const semanticTags = new Set([
      'article',
      'main',
      'nav',
      'header',
      'footer',
      'aside',
      'table',
      'form',
      'figure',
    ]);

    if (!semanticTags.has(tag)) {
      return null;
    }

    const stableClasses = this.getStableClasses(element);

    const selector = stableClasses.length
      ? `${tag}.${stableClasses
          .slice(0, 2)
          .map((token) => this.escapeSelectorValue(token))
          .join('.')}`
      : tag;

    return {
      strategy: 'semantic',
      selector,
      robustness: stableClasses.length ? 0.78 : 0.6,
      description: `Semantic ${tag} locator`,
    };
  }

  private createStructuralLocator(
    element: Element
  ): StableLocator | null {
    const parent = element.parentElement;

    if (!parent) {
      return null;
    }

    const index = Array.from(parent.children).indexOf(element) + 1;

    const parentStableClasses = this.getStableClasses(parent);

    if (parentStableClasses.length === 0) {
      return null;
    }

    const selector = `.${parentStableClasses
      .slice(0, 2)
      .map((token) => this.escapeSelectorValue(token))
      .join('.')} > ${element.tagName.toLowerCase()}:nth-child(${index})`;

    return {
      strategy: 'structural',
      selector,
      robustness: 0.55,
      description: 'Parent class plus child position',
    };
  }

  private createTextSignatureLocator(
    element: Element
  ): StableLocator | null {
    const text = this.normalizeText(element.textContent);

    if (text.length < 20) {
      return null;
    }

    return {
      strategy: 'text-signature',
      selector: text.slice(0, 120),
      robustness: 0.45,
      description: 'Normalized text signature',
    };
  }

  private createCssPathLocator(element: Element): StableLocator {
    const path: string[] = [];
    let current: Element | null = element;
    let depth = 0;

    while (current && depth < 6) {
      const tag = current.tagName.toLowerCase();

      const stableClasses = this.getStableClasses(current);

      const classPart = stableClasses.length
        ? `.${stableClasses
            .slice(0, 2)
            .map((token) => this.escapeSelectorValue(token))
            .join('.')}`
        : '';

      const parent = current.parentElement;

      if (parent) {
        const index =
          Array.from(parent.children).indexOf(current) + 1;

        path.unshift(`${tag}${classPart}:nth-child(${index})`);
      } else {
        path.unshift(`${tag}${classPart}`);
      }

      current = parent;
      depth++;
    }

    return {
      strategy: 'css-path',
      selector: path.join(' > '),
      robustness: 0.35,
      description: 'Positional CSS path',
    };
  }

  private createXPathLocator(element: Element): StableLocator {
    const parts: string[] = [];
    let current: Element | null = element;
    let depth = 0;

    while (current && current.tagName.toLowerCase() !== 'html' && depth < 8) {
      const parent = current.parentElement;

      if (!parent) {
        break;
      }

      const siblings = Array.from(parent.children).filter(
        (child) => child.tagName === current!.tagName
      );

      const index = siblings.indexOf(current) + 1;

      parts.unshift(
        siblings.length > 1
          ? `${current.tagName.toLowerCase()}[${index}]`
          : current.tagName.toLowerCase()
      );

      current = parent;
      depth++;
    }

    return {
      strategy: 'xpath',
      selector: `//${parts.join('/')}`,
      robustness: 0.25,
      description: 'Positional XPath',
    };
  }

  private getStableClasses(element: Element): string[] {
    return Array.from(element.classList).filter((token) => {
      if (!token || token.length < 3) {
        return false;
      }

      if (UNSTABLE_CLASS_PATTERN.test(token)) {
        return false;
      }

      return true;
    });
  }

  private createTextSignature(element: Element): string {
    return this.normalizeText(element.textContent).slice(0, 240);
  }

  private createStructuralSignature(element: Element): string {
    const tags = Array.from(element.children)
      .map((child) => child.tagName.toLowerCase())
      .join('>');

    const classes = this.getStableClasses(element)
      .slice(0, 5)
      .join('|');

    return `${element.tagName.toLowerCase()}::${tags}::${classes}`;
  }

  private relocateByTextSignature(
    root: ParentNode,
    signature: string
  ): Element | null {
    if (!signature) {
      return null;
    }

    const doc =
      root instanceof Document
        ? root
        : root.ownerDocument;

    if (!doc) {
      return null;
    }

    const candidates = Array.from(
      doc.querySelectorAll('article, main, section, div, table, form')
    );

    const normalizedSignature = this.normalizeText(signature);

    let best: Element | null = null;
    let bestScore = 0;

    for (const candidate of candidates) {
      const text = this.normalizeText(candidate.textContent);

      if (!text) {
        continue;
      }

      const score = this.similarity(
        normalizedSignature.slice(0, 240),
        text.slice(0, 240)
      );

      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    }

    return bestScore >= 0.72 ? best : null;
  }

  private similarity(a: string, b: string): number {
    if (!a || !b) {
      return 0;
    }

    const tokensA = new Set(a.split(/\s+/));
    const tokensB = new Set(b.split(/\s+/));

    const intersection = Array.from(tokensA).filter((token) =>
      tokensB.has(token)
    ).length;

    const union = new Set([...tokensA, ...tokensB]).size;

    return union === 0 ? 0 : intersection / union;
  }

  private normalizeText(text: string | null | undefined): string {
    return (text ?? '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private escapeSelectorValue(value: string): string {
    return value.replace(/(["\\])/g, '\\$1');
  }
}
```


## RegionLocatorStore

Use this in the extension to persist locators per site/page pattern and relocate them later.

```ts
// src/stability/RegionLocatorStore.ts

import { StableRegionLocator } from './types';

export interface StoredLocatorRecord {
  key: string;
  locator: StableRegionLocator;
  updatedAt: string;
  hitCount: number;
  missCount: number;
}

export class RegionLocatorStore {
  private records = new Map<string, StoredLocatorRecord>();

  constructor(initial: StoredLocatorRecord[] = []) {
    for (const record of initial) {
      this.records.set(record.key, record);
    }
  }

  save(
    key: string,
    locator: StableRegionLocator
  ): StoredLocatorRecord {
    const existing = this.records.get(key);

    const record: StoredLocatorRecord = {
      key,
      locator,
      updatedAt: new Date().toISOString(),
      hitCount: existing?.hitCount ?? 0,
      missCount: existing?.missCount ?? 0,
    };

    this.records.set(key, record);

    return record;
  }

  get(key: string): StoredLocatorRecord | undefined {
    return this.records.get(key);
  }

  recordHit(key: string): void {
    const record = this.records.get(key);

    if (record) {
      record.hitCount++;
      record.updatedAt = new Date().toISOString();
    }
  }

  recordMiss(key: string): void {
    const record = this.records.get(key);

    if (record) {
      record.missCount++;
      record.updatedAt = new Date().toISOString();
    }
  }

  getReliability(key: string): number {
    const record = this.records.get(key);

    if (!record) {
      return 0;
    }

    const total = record.hitCount + record.missCount;

    if (total === 0) {
      return 0.5;
    }

    return record.hitCount / total;
  }

  list(): StoredLocatorRecord[] {
    return Array.from(this.records.values());
  }
}
```


## Integration with extraction

After detection, create and store a locator:

```ts
// src/engine/attachStableLocators.ts

import { CalibratedDetectionCandidate } from './ExtractionEngine';
import { DetectionContext } from '../detection/types';
import { SelectorStabilizer } from '../stability/SelectorStabilizer';
import { RegionLocatorStore } from '../stability/RegionLocatorStore';
import { StableRegionLocator } from '../stability/types';

export interface LocatedCandidate {
  candidate: CalibratedDetectionCandidate;
  locator: StableRegionLocator;
}

export function attachStableLocators(
  candidates: CalibratedDetectionCandidate[],
  context: DetectionContext,
  store: RegionLocatorStore
): LocatedCandidate[] {
  const stabilizer = new SelectorStabilizer();

  return candidates.map((candidate) => {
    const key = `${context.page.hostname}:${candidate.kind}:${candidate.nodeId}`;

    const locator = stabilizer.createLocator(
      candidate.element,
      candidate.nodeId,
      candidate.kind
    );

    store.save(key, locator);

    return {
      candidate,
      locator,
    };
  });
}
```

Then relocate on a later DOM snapshot:

```ts
// src/engine/relocateRegions.ts

import { DetectionContext } from '../detection/types';
import { RegionLocatorStore } from '../stability/RegionLocatorStore';
import { SelectorStabilizer } from '../stability/SelectorStabilizer';
import { RelocationResult } from '../stability/types';

export function relocateRegions(
  context: DetectionContext,
  store: RegionLocatorStore
): Record<string, RelocationResult> {
  const stabilizer = new SelectorStabilizer();
  const results: Record<string, RelocationResult> = {};

  for (const record of store.list()) {
    const relocation = stabilizer.relocate(
      record.locator,
      context.sourceRoot
    );

    results[record.key] = relocation;

    if (relocation.found) {
      store.recordHit(record.key);
    } else {
      store.recordMiss(record.key);
    }
  }

  return results;
}
```


## Locator priority

| Strategy | Robustness | Best for |
| :-- | --: | :-- |
| Stable `data-*` | 0.95 | Framework apps with explicit test/semantic attributes |
| ARIA role + name | 0.88 | Accessible, modern UI |
| Semantic tag + stable classes | 0.78 | Articles, nav, tables, forms |
| Structural parent + position | 0.55 | Repeated cards and lists |
| Text signature | 0.45 | Recovery after class/DOM changes |
| CSS path | 0.35 | Last-resort exact relocation |
| XPath | 0.25 | Debugging and fallback only |

## Next component

The next layer should be **incremental extraction for dynamic pages**:

1. `DomMutationObserver` — watches added/removed/updated nodes.
2. `IncrementalExtractor` — re-normalizes only changed subtrees.
3. `RegionChangeResolver` — determines whether a mutation creates, extends, replaces, or destroys a region.
4. `StreamingChatTracker` — handles AI chat messages that arrive progressively.
5. `VirtualListTracker` — handles product grids and feeds that recycle DOM nodes during scroll.

That will make the extractor practical for live browser pages rather than only static HTML snapshots.

