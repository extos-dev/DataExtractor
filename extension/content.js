var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/classification/PageClassifier.ts
var PageClassifier_exports = {};
__export(PageClassifier_exports, {
  DEFAULT_PAGE_CLASSIFIER_OPTIONS: () => DEFAULT_PAGE_CLASSIFIER_OPTIONS,
  PageClassifier: () => PageClassifier
});
function clamp3(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}
var DEFAULT_PAGE_CLASSIFIER_OPTIONS, DETECTION_TO_PAGE, STRONG_JSONLD_TYPES, PageClassifier;
var init_PageClassifier = __esm({
  "src/classification/PageClassifier.ts"() {
    "use strict";
    DEFAULT_PAGE_CLASSIFIER_OPTIONS = {
      minConfidence: 0.35
    };
    DETECTION_TO_PAGE = {
      article: "article",
      product: "product_detail",
      product_listing: "product_listing",
      ai_chat: "ai_chat",
      table: "dashboard",
      form: "landing_page"
    };
    STRONG_JSONLD_TYPES = {
      article: "article",
      blogposting: "article",
      newsarticle: "news_article",
      product: "product_detail",
      itemlist: "product_listing",
      searchresultspage: "search_results",
      faqpage: "landing_page",
      webpage: "unknown"
    };
    PageClassifier = class {
      options;
      constructor(options = {}) {
        this.options = { ...DEFAULT_PAGE_CLASSIFIER_OPTIONS, ...options };
      }
      classify(context, candidates) {
        const scores = this.createEmptyScores();
        const evidence = [];
        this.scoreFromDetections(candidates, scores, evidence);
        this.scoreFromJsonLd(context, scores, evidence);
        this.scoreFromUrl(context, scores, evidence);
        this.scoreFromPageStructure(context, scores, evidence);
        const ranked = this.rank(scores);
        const pageType = ranked[0]?.pageType ?? "unknown";
        const confidence = ranked[0]?.score ?? 0;
        return {
          pageType: confidence >= this.options.minConfidence ? pageType : "unknown",
          confidence: clamp3(confidence),
          scores,
          evidence,
          primaryDetection: this.getPrimaryDetection(candidates)
        };
      }
      scoreFromDetections(candidates, scores, evidence) {
        for (const candidate of candidates) {
          const pageType = DETECTION_TO_PAGE[candidate.kind];
          if (!pageType) {
            continue;
          }
          const weight = candidate.score * 0.55;
          scores[pageType] += weight;
          evidence.push({
            signal: "detection_candidate",
            weight,
            value: {
              detector: candidate.detectorId,
              kind: candidate.kind,
              score: candidate.score
            },
            explanation: `A ${candidate.kind} detection supports a ${pageType} page.`
          });
        }
      }
      scoreFromJsonLd(context, scores, evidence) {
        for (const type of context.page.jsonLdTypes) {
          const normalized = type.toLowerCase();
          const pageType = STRONG_JSONLD_TYPES[normalized];
          if (!pageType || pageType === "unknown") {
            continue;
          }
          const weight = 0.3;
          scores[pageType] += weight;
          evidence.push({
            signal: "json_ld_type",
            weight,
            value: type,
            explanation: `JSON-LD type ${type} supports a ${pageType} page.`
          });
        }
      }
      scoreFromUrl(context, scores, evidence) {
        const path = context.page.pathname.toLowerCase();
        const rules = [
          { pattern: /\/(blog|news|article|posts|insights)\//, pageType: "article", weight: 0.12 },
          { pattern: /\/(product|p|item|shop)\//, pageType: "product_detail", weight: 0.14 },
          { pattern: /\/(collection|category|products|shop|search)/, pageType: "product_listing", weight: 0.1 },
          { pattern: /\/(chat|conversation|assistant|copilot)/, pageType: "ai_chat", weight: 0.15 },
          { pattern: /\/(docs|documentation|guide|reference)/, pageType: "documentation", weight: 0.12 },
          { pattern: /\/(login|signin|sign-in|auth)/, pageType: "login", weight: 0.2 },
          { pattern: /\/(forum|thread|topic|discussion)/, pageType: "forum_thread", weight: 0.14 }
        ];
        for (const rule of rules) {
          if (rule.pattern.test(path)) {
            scores[rule.pageType] += rule.weight;
            evidence.push({
              signal: "url_pattern",
              weight: rule.weight,
              value: path,
              explanation: `URL path matches a ${rule.pageType} pattern.`
            });
          }
        }
      }
      scoreFromPageStructure(context, scores, evidence) {
        const articleRegions = context.getRegion("article");
        const chatRegions = context.getRegion("ai_chat");
        const listingRegions = context.getRegion("product_listing");
        const tableRegions = context.getRegion("data_table");
        const navigationRegions = context.getRegion("navigation");
        if (articleRegions.length > 0) {
          const wordCount = articleRegions.reduce(
            (total, region) => total + region.wordCount,
            0
          );
          if (wordCount > 300) {
            const weight = 0.12;
            scores.article += weight;
            evidence.push({
              signal: "long_prose_region",
              weight,
              value: wordCount,
              explanation: "Page contains a substantial article-like prose region."
            });
          }
        }
        if (chatRegions.length > 0) {
          const weight = 0.15;
          scores.ai_chat += weight;
          evidence.push({
            signal: "chat_region",
            weight,
            value: chatRegions.length,
            explanation: "Page contains a chat-conversation region."
          });
        }
        if (listingRegions.length > 0) {
          const weight = 0.15;
          scores.product_listing += weight;
          evidence.push({
            signal: "product_listing_region",
            weight,
            value: listingRegions.length,
            explanation: "Page contains a repeated product/listing grid."
          });
        }
        if (tableRegions.length > 0) {
          const weight = 0.08;
          scores.dashboard += weight;
          evidence.push({
            signal: "table_region",
            weight,
            value: tableRegions.length,
            explanation: "Page contains one or more table-like regions."
          });
        }
        if (navigationRegions.length >= 2) {
          const weight = 0.05;
          scores.landing_page += weight;
          evidence.push({
            signal: "multiple_navigation_regions",
            weight,
            value: navigationRegions.length,
            explanation: "Multiple navigation regions suggest a marketing or landing page."
          });
        }
      }
      rank(scores) {
        return Object.entries(scores).map(([pageType, score]) => ({
          pageType,
          score: clamp3(score)
        })).sort((a, b) => b.score - a.score);
      }
      getPrimaryDetection(candidates) {
        if (candidates.length === 0) {
          return void 0;
        }
        return [...candidates].sort((a, b) => b.score - a.score)[0].kind;
      }
      createEmptyScores() {
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
          unknown: 0.05
        };
      }
    };
  }
});

// src/dom/types.ts
var DEFAULT_PRUNER_OPTIONS = {
  removeScripts: true,
  removeStyles: true,
  removeHidden: true,
  removeIframes: false,
  removeSvg: false,
  removeNoScript: true,
  removeTemplate: true,
  removeCommonNoise: true,
  preserveShadowDom: true,
  maxDepth: 80
};
var DEFAULT_NORMALIZER_OPTIONS = {
  ...DEFAULT_PRUNER_OPTIONS,
  includeGeometry: true,
  textPreviewLength: 500
};

// src/dom/DomPruner.ts
var NOISE_SELECTORS = [
  '[aria-hidden="true"]',
  '[role="presentation"]',
  '[data-testid*="cookie" i]',
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
  '[class*="paywall" i]'
];
var SCRIPT_LIKE_TAGS = /* @__PURE__ */ new Set(["SCRIPT", "NOSCRIPT", "TEMPLATE"]);
var STYLE_LIKE_TAGS = /* @__PURE__ */ new Set(["STYLE", "LINK"]);
var DomPruner = class {
  options;
  constructor(options = {}) {
    this.options = { ...DEFAULT_PRUNER_OPTIONS, ...options };
  }
  prune(sourceRoot) {
    const root = this.cloneRoot(sourceRoot);
    const stats = { prunedElements: 0, hiddenElements: 0 };
    this.pruneNode(root, stats, 0);
    if (this.options.removeCommonNoise) {
      this.removeMatching(root, NOISE_SELECTORS, stats);
    }
    return { root, stats };
  }
  cloneRoot(sourceRoot) {
    if (sourceRoot instanceof Document) {
      return sourceRoot.documentElement.cloneNode(true);
    }
    if (sourceRoot instanceof DocumentFragment) {
      return sourceRoot.cloneNode(true);
    }
    return sourceRoot.cloneNode(true);
  }
  pruneNode(node, stats, depth) {
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
      node.setAttribute("data-tx-pruned", "hidden");
    }
    if (this.options.removeIframes && this.matchesTag(node, ["IFRAME"])) {
      node.remove();
      stats.prunedElements++;
      return;
    }
    if (this.options.removeSvg && this.matchesTag(node, ["SVG"])) {
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
  shouldRemoveTag(node) {
    const tag = node.tagName.toUpperCase();
    if (this.options.removeScripts && SCRIPT_LIKE_TAGS.has(tag)) {
      if (tag === "SCRIPT" && node.getAttribute("type") === "application/ld+json") {
        return false;
      }
      return true;
    }
    if (this.options.removeStyles && STYLE_LIKE_TAGS.has(tag)) return true;
    if (this.options.removeNoScript && tag === "NOSCRIPT") return true;
    if (this.options.removeTemplate && tag === "TEMPLATE") return true;
    return false;
  }
  isHidden(element) {
    if (element.hasAttribute("hidden")) return true;
    if (element.getAttribute("aria-hidden") === "true") return true;
    const inlineStyle = element.getAttribute("style") ?? "";
    if (/display\s*:\s*none/i.test(inlineStyle)) return true;
    if (/visibility\s*:\s*hidden/i.test(inlineStyle)) return true;
    if (element instanceof HTMLElement) {
      if (element.hidden) return true;
      if (element.isConnected) {
        const computed = this.safeComputedStyle(element);
        if (computed) {
          if (computed.display === "none") return true;
          if (computed.visibility === "hidden") return true;
          if (Number(computed.opacity) === 0) return true;
        }
      }
    }
    return false;
  }
  preserveShadowRoots(element) {
    const shadowRoot = element.shadowRoot;
    if (!shadowRoot) return;
    element.setAttribute("data-tx-has-shadow-root", "true");
  }
  removeMatching(root, selectors, stats) {
    for (const selector of selectors) {
      let elements;
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
  matchesTag(element, tags) {
    return tags.includes(element.tagName.toUpperCase());
  }
  safeComputedStyle(element) {
    try {
      return window.getComputedStyle(element);
    } catch {
      return null;
    }
  }
};

// src/dom/DomNormalizer.ts
var NOISE_TAGS = /* @__PURE__ */ new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE"]);
var DomNormalizer = class {
  pruner;
  options;
  nodeIdCounter = 0;
  nodeById = /* @__PURE__ */ new Map();
  constructor(options = {}) {
    this.options = { ...DEFAULT_NORMALIZER_OPTIONS, ...options };
    this.pruner = new DomPruner(this.options);
  }
  normalize(source) {
    this.nodeIdCounter = 0;
    this.nodeById = /* @__PURE__ */ new Map();
    const { root, stats } = this.pruner.prune(source);
    const rootElement = root;
    const jsonLd = this.extractJsonLd(rootElement);
    const normalizedRoot = this.buildNode(rootElement, void 0, 0);
    return {
      root: normalizedRoot,
      nodeById: this.nodeById,
      jsonLd,
      stats: {
        totalElements: this.nodeById.size,
        prunedElements: stats.prunedElements,
        hiddenElements: stats.hiddenElements,
        jsonLdBlocks: jsonLd.length
      }
    };
  }
  buildNode(element, parentId, depth) {
    const nodeId = this.createNodeId();
    const features = this.extractFeatures(element, depth);
    const node = { nodeId, parentId, element, features, children: [] };
    this.nodeById.set(nodeId, node);
    for (const child of Array.from(element.children)) {
      if (NOISE_TAGS.has(child.tagName.toUpperCase())) continue;
      node.children.push(this.buildNode(child, nodeId, depth + 1));
    }
    this.aggregateChildFeatures(node);
    return node;
  }
  extractFeatures(element, depth) {
    const text = this.cleanText(element.textContent ?? "").slice(0, this.options.textPreviewLength);
    const links = Array.from(element.querySelectorAll("a[href]"));
    const linkText = links.map((link) => link.textContent ?? "").join(" ").replace(/\s+/g, " ").trim();
    const textLength = text.length;
    const linkTextLength = linkText.length;
    const rect = this.options.includeGeometry && element instanceof HTMLElement ? this.safeRect(element) : void 0;
    return {
      tag: element.tagName.toLowerCase(),
      id: element.id || void 0,
      classes: Array.from(element.classList),
      role: element.getAttribute("role") ?? void 0,
      text,
      textLength,
      wordCount: this.countWords(text),
      linkText,
      linkTextLength,
      linkCount: links.length,
      linkDensity: textLength > 0 ? Math.min(1, linkTextLength / textLength) : 0,
      imageCount: element.querySelectorAll("img, picture, [role=img]").length,
      inputCount: element.querySelectorAll("input, textarea, select").length,
      buttonCount: element.querySelectorAll("button, [role=button], [type=submit]").length,
      tableCount: element.querySelectorAll("table, [role=table], [role=grid]").length,
      listCount: element.querySelectorAll("ul, ol, dl, [role=list]").length,
      headingCount: element.querySelectorAll("h1, h2, h3, h4, h5, h6, [role=heading]").length,
      paragraphCount: element.querySelectorAll("p").length,
      hasJsonLd: this.hasJsonLd(element),
      jsonLdTypes: this.extractLocalJsonLdTypes(element),
      depth,
      childElementCount: element.children.length,
      rect,
      visibility: this.getVisibility(element)
    };
  }
  aggregateChildFeatures(node) {
    let linkCount = 0, imageCount = 0, inputCount = 0, buttonCount = 0;
    let tableCount = 0, listCount = 0, headingCount = 0, paragraphCount = 0;
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
    node.features.linkCount = Math.max(node.features.linkCount, linkCount);
    node.features.imageCount = Math.max(node.features.imageCount, imageCount);
    node.features.inputCount = Math.max(node.features.inputCount, inputCount);
    node.features.buttonCount = Math.max(node.features.buttonCount, buttonCount);
    node.features.tableCount = Math.max(node.features.tableCount, tableCount);
    node.features.listCount = Math.max(node.features.listCount, listCount);
    node.features.headingCount = Math.max(node.features.headingCount, headingCount);
    node.features.paragraphCount = Math.max(node.features.paragraphCount, paragraphCount);
  }
  extractJsonLd(root) {
    const results = [];
    const scripts = Array.from(root.querySelectorAll('script[type="application/ld+json"]'));
    for (const script of scripts) {
      try {
        const parsed = JSON.parse(script.textContent ?? "");
        if (Array.isArray(parsed)) results.push(...parsed);
        else results.push(parsed);
      } catch {
      }
    }
    return results;
  }
  hasJsonLd(element) {
    return element.querySelector('script[type="application/ld+json"]') !== null;
  }
  extractLocalJsonLdTypes(element) {
    const scripts = Array.from(element.querySelectorAll('script[type="application/ld+json"]'));
    const types = [];
    for (const script of scripts) {
      try {
        const parsed = JSON.parse(script.textContent ?? "");
        this.collectJsonLdTypes(parsed, types);
      } catch {
      }
    }
    return Array.from(new Set(types));
  }
  collectJsonLdTypes(value, output) {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (const item of value) this.collectJsonLdTypes(item, output);
      return;
    }
    const record = value;
    const type = record["@type"];
    if (typeof type === "string") output.push(type);
    else if (Array.isArray(type)) {
      for (const item of type) if (typeof item === "string") output.push(item);
    }
    for (const child of Object.values(record)) this.collectJsonLdTypes(child, output);
  }
  getVisibility(element) {
    if (element.hasAttribute("data-tx-pruned")) return "hidden";
    if (element instanceof HTMLElement) {
      if (element.isConnected) {
        const computed = this.safeComputedStyle(element);
        if (computed?.display === "none") return "hidden";
        if (computed?.visibility === "hidden") return "hidden";
      }
    }
    return "visible";
  }
  safeRect(element) {
    try {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    } catch {
      return void 0;
    }
  }
  safeComputedStyle(element) {
    try {
      return window.getComputedStyle(element);
    } catch {
      return null;
    }
  }
  createNodeId() {
    return `n${++this.nodeIdCounter}`;
  }
  countWords(text) {
    if (!text) return 0;
    return text.trim().split(/\s+/).filter(Boolean).length;
  }
  cleanText(text) {
    return text.replace(/\s+/g, " ").trim();
  }
};

// src/dom/BlockSegmenter.ts
var HEADING_TAGS = /* @__PURE__ */ new Set(["H1", "H2", "H3", "H4", "H5", "H6"]);
var LIST_TAGS = /* @__PURE__ */ new Set(["UL", "OL", "DL"]);
var TABLE_TAGS = /* @__PURE__ */ new Set(["TABLE"]);
var MEDIA_TAGS = /* @__PURE__ */ new Set(["FIGURE", "PICTURE", "VIDEO", "AUDIO"]);
var NAV_TAGS = /* @__PURE__ */ new Set(["NAV", "HEADER", "FOOTER"]);
var FORM_TAGS = /* @__PURE__ */ new Set(["FORM"]);
var INPUT_TAGS = /* @__PURE__ */ new Set(["INPUT", "TEXTAREA", "SELECT"]);
var BUTTON_TAGS = /* @__PURE__ */ new Set(["BUTTON"]);
var BAR_TAGS = /* @__PURE__ */ new Set(["HEADER", "FOOTER", "NAV", "ASIDE"]);
var CHAT_ROLE_PATTERNS = [
  /data-message-role/i,
  /data-role/i,
  /message-role/i,
  /chat-message/i,
  /conversation-turn/i,
  /role=["']?(user|assistant|ai|human|bot)/i
];
var CARD_CLASS_PATTERNS = [
  /card/i,
  /product/i,
  /listing/i,
  /result/i,
  /item/i,
  /tile/i,
  /post/i,
  /entry/i
];
var DEFAULT_BLOCK_SEGMENTER_OPTIONS = {
  minParagraphWords: 8,
  minListItems: 2,
  minTableRows: 2,
  minCardGridItems: 3,
  maxBlocks: 800
};
var BlockSegmenter = class {
  options;
  blockIdCounter = 0;
  blocks = [];
  constructor(options = {}) {
    this.options = { ...DEFAULT_BLOCK_SEGMENTER_OPTIONS, ...options };
  }
  segment(normalized) {
    this.blockIdCounter = 0;
    this.blocks = [];
    this.walk(normalized.root, 0);
    const byKind = {};
    for (const block of this.blocks) {
      byKind[block.kind] = (byKind[block.kind] ?? 0) + 1;
    }
    const blocksByNodeId = /* @__PURE__ */ new Map();
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
        byKind
      }
    };
  }
  walk(node, depth) {
    if (this.blocks.length >= this.options.maxBlocks) {
      return;
    }
    if (node.features.visibility !== "hidden") {
      const block = this.classify(node);
      if (block) {
        this.blocks.push(block);
      }
    }
    for (const child of node.children) {
      this.walk(child, depth + 1);
    }
  }
  classify(node) {
    const element = node.element;
    const tag = element.tagName.toUpperCase();
    const role = node.features.role?.toLowerCase();
    if (HEADING_TAGS.has(tag) || role === "heading") {
      return this.createBlock(node, "heading", {
        level: this.getHeadingLevel(element),
        text: node.features.text
      });
    }
    if (TABLE_TAGS.has(tag) || role === "table" || role === "grid") {
      return this.classifyTable(node);
    }
    if (LIST_TAGS.has(tag) || role === "list") {
      return this.classifyList(node);
    }
    if (FORM_TAGS.has(tag) || role === "form") {
      return this.createBlock(node, "form", {
        inputCount: node.features.inputCount,
        buttonCount: node.features.buttonCount
      });
    }
    if (INPUT_TAGS.has(tag) || role === "textbox" || role === "searchbox" || role === "combobox") {
      return this.classifyInput(node);
    }
    if (BUTTON_TAGS.has(tag) || role === "button") {
      return this.createBlock(node, "action", {
        text: node.features.text
      });
    }
    if (tag === "TEXTAREA" || role === "textbox") {
      const composer = this.classifyComposer(node);
      if (composer) return composer;
    }
    if (BAR_TAGS.has(tag) || role === "banner" || role === "toolbar" || role === "navigation" || role === "complementary" || role === "contentinfo") {
      return this.classifyBar(node);
    }
    if (MEDIA_TAGS.has(tag)) {
      return this.createBlock(node, "media", {
        imageCount: node.features.imageCount
      });
    }
    if (NAV_TAGS.has(tag) || role === "navigation") {
      return this.classifyNavigation(node);
    }
    if (this.looksLikeChatMessage(node)) {
      return this.classifyChatMessage(node);
    }
    if (tag === "P" || role === "paragraph") {
      return this.classifyParagraph(node);
    }
    const cardGrid = this.classifyCardGrid(node);
    if (cardGrid) {
      return cardGrid;
    }
    const recordGroup = this.classifyRecordGroup(node);
    if (recordGroup) {
      return recordGroup;
    }
    if (this.looksLikeBreadcrumb(node)) {
      return this.createBlock(node, "breadcrumb", {
        linkCount: node.features.linkCount
      });
    }
    return null;
  }
  classifyParagraph(node) {
    const words = node.features.wordCount;
    if (words < this.options.minParagraphWords) {
      return null;
    }
    const proseScore = this.scoreProse(node);
    if (proseScore < 0.35) {
      return null;
    }
    return this.createBlock(
      node,
      "paragraph",
      {
        wordCount: words,
        linkDensity: node.features.linkDensity,
        proseScore
      },
      proseScore
    );
  }
  classifyList(node) {
    const items = Array.from(
      node.element.querySelectorAll(":scope > li, :scope > [role=listitem]")
    );
    if (items.length < this.options.minListItems) {
      return null;
    }
    const score = 0.45 + Math.min(0.25, items.length * 0.02) + (node.features.linkDensity > 0.5 ? -0.1 : 0.05);
    return this.createBlock(
      node,
      "list",
      {
        itemCount: items.length,
        ordered: node.element.tagName === "OL",
        linkDensity: node.features.linkDensity
      },
      clamp(score)
    );
  }
  classifyTable(node) {
    const rows = Array.from(
      node.element.querySelectorAll(":scope tr, :scope [role=row]")
    );
    if (rows.length < this.options.minTableRows) {
      return null;
    }
    const headerCount = node.element.querySelectorAll(
      ":scope th, :scope [role=columnheader]"
    ).length;
    const score = 0.65 + Math.min(0.2, rows.length * 0.01) + (headerCount > 0 ? 0.1 : 0);
    return this.createBlock(
      node,
      "table",
      {
        rowCount: rows.length,
        headerCount,
        hasHeader: headerCount > 0
      },
      clamp(score)
    );
  }
  classifyCardGrid(node) {
    const children = Array.from(node.element.children);
    if (children.length < this.options.minCardGridItems) {
      return null;
    }
    const fingerprints = children.map(
      (child) => this.createStructuralFingerprint(child)
    );
    const similarity = this.calculateFingerprintSimilarity(fingerprints);
    if (similarity < 0.55) {
      return null;
    }
    const cardish = children.filter(
      (child) => CARD_CLASS_PATTERNS.some((pattern) => pattern.test(child.className))
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
    return this.createBlock(
      node,
      "card_grid",
      {
        itemCount: children.length,
        structuralSimilarity: similarity,
        cardishRatio: cardish / children.length,
        hasImages,
        hasLinks
      },
      clamp(score)
    );
  }
  classifyChatMessage(node) {
    const role = this.inferChatRole(node.element);
    const text = node.features.text;
    if (!text || text.length < 2) {
      return null;
    }
    const score = role ? 0.82 : 0.55;
    return this.createBlock(
      node,
      "chat_message",
      {
        inferredRole: role,
        textLength: text.length
      },
      clamp(score)
    );
  }
  classifyNavigation(node) {
    const linkDensity = node.features.linkDensity;
    const linkCount = node.features.linkCount;
    if (linkCount < 2) {
      return null;
    }
    const score = clamp(
      0.45 + linkDensity * 0.35 + Math.min(0.15, linkCount * 0.01)
    );
    return this.createBlock(
      node,
      "navigation",
      {
        linkCount,
        linkDensity
      },
      score
    );
  }
  looksLikeChatMessage(node) {
    const element = node.element;
    const outer = element.outerHTML.slice(0, 2e3);
    return CHAT_ROLE_PATTERNS.some((pattern) => pattern.test(outer));
  }
  looksLikeBreadcrumb(node) {
    const element = node.element;
    const classAndId = `${element.id} ${element.className}`.toLowerCase();
    const nameSignal = /breadcrumb|breadcrumbs|trail/.test(classAndId) || element.getAttribute("aria-label")?.toLowerCase().includes("breadcrumb");
    const structuralSignal = node.features.linkCount >= 2 && node.features.wordCount < 80 && node.features.linkDensity > 0.5;
    return Boolean(nameSignal || structuralSignal);
  }
  inferChatRole(element) {
    const explicit = element.getAttribute("data-message-role") ?? element.getAttribute("data-role") ?? element.getAttribute("role");
    if (explicit) {
      const normalized = explicit.toLowerCase();
      if (["user", "human"].includes(normalized)) {
        return "user";
      }
      if (["assistant", "ai", "bot", "model"].includes(normalized)) {
        return "assistant";
      }
    }
    const classAndId = `${element.id} ${element.className}`.toLowerCase();
    if (/user|human|question/.test(classAndId)) {
      return "user";
    }
    if (/assistant|bot|ai|answer|model/.test(classAndId)) {
      return "assistant";
    }
    return null;
  }
  classifyRecordGroup(node) {
    const children = Array.from(node.element.children);
    if (children.length < 3) return null;
    const fingerprints = children.map((child) => this.createStructuralFingerprint(child));
    const counts = /* @__PURE__ */ new Map();
    for (const fp of fingerprints) counts.set(fp, (counts.get(fp) ?? 0) + 1);
    const dominant = Math.max(...counts.values());
    const ratio = dominant / children.length;
    if (ratio < 0.6) return null;
    const hasImages = node.features.imageCount >= children.length * 0.4;
    const hasLinks = node.features.linkCount >= children.length * 0.4;
    let score = 0.5 + ratio * 0.3;
    if (hasImages) score += 0.08;
    if (hasLinks) score += 0.07;
    return this.createBlock(
      node,
      "record_group",
      {
        itemCount: children.length,
        dominantRatio: ratio,
        hasImages,
        hasLinks,
        fingerprint: [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]
      },
      clamp(score)
    );
  }
  createStructuralFingerprint(element) {
    const children = Array.from(element.children);
    const childTags = children.map((child) => child.tagName.toLowerCase()).join(">");
    const classTokens = Array.from(element.classList).map((token) => token.replace(/\d+/g, "#")).sort().slice(0, 6).join("|");
    const imageCount = element.querySelectorAll("img").length;
    const linkCount = element.querySelectorAll("a").length;
    const textLength = (element.textContent ?? "").trim().length;
    return [
      element.tagName,
      childTags,
      classTokens,
      `img:${bucket(imageCount)}`,
      `link:${bucket(linkCount)}`,
      `text:${bucket(textLength)}`
    ].join("::");
  }
  calculateFingerprintSimilarity(fingerprints) {
    if (fingerprints.length < 2) {
      return 0;
    }
    const counts = /* @__PURE__ */ new Map();
    for (const fingerprint of fingerprints) {
      counts.set(fingerprint, (counts.get(fingerprint) ?? 0) + 1);
    }
    const dominant = Math.max(...counts.values());
    return dominant / fingerprints.length;
  }
  scoreProse(node) {
    const wordScore = clamp(node.features.wordCount / 80);
    const linkPenalty = 1 - node.features.linkDensity;
    const punctuationBonus = /[.,;:!?]/.test(node.features.text) ? 0.1 : 0;
    return clamp(wordScore * 0.65 + linkPenalty * 0.25 + punctuationBonus);
  }
  getHeadingLevel(element) {
    const tag = element.tagName.toUpperCase();
    if (HEADING_TAGS.has(tag)) {
      return Number(tag.slice(1));
    }
    const ariaLevel = element.getAttribute("aria-level");
    return ariaLevel ? Number(ariaLevel) : 1;
  }
  classifyInput(node) {
    const text = node.features.text ?? "";
    const score = 0.7;
    return this.createBlock(
      node,
      "input",
      {
        inputType: node.element.type ?? "text",
        placeholder: node.element.placeholder ?? "",
        textLength: text.length
      },
      clamp(score)
    );
  }
  classifyComposer(node) {
    const root = node.element.closest("body") ?? node.element.ownerDocument.body;
    const hasSend = Boolean(
      root?.querySelector('[aria-label*="send" i], button[type="submit"], [data-testid*="send" i]')
    );
    const score = hasSend ? 0.82 : 0.55;
    return this.createBlock(
      node,
      "composer",
      {
        hasSendControl: hasSend,
        textLength: (node.features.text ?? "").length
      },
      clamp(score)
    );
  }
  classifyBar(node) {
    const linkCount = node.features.linkCount ?? 0;
    const buttonCount = node.features.buttonCount ?? 0;
    const score = clamp(0.5 + Math.min(0.2, linkCount * 0.02) + Math.min(0.15, buttonCount * 0.03));
    return this.createBlock(
      node,
      "bar",
      {
        linkCount,
        buttonCount
      },
      score
    );
  }
  createBlock(node, kind, metadata = {}, score = 0.5) {
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
      metadata
    };
  }
};
function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}
function bucket(value) {
  if (value === 0) return "0";
  if (value <= 2) return "1-2";
  if (value <= 5) return "3-5";
  if (value <= 20) return "6-20";
  return "20+";
}

// src/dom/RegionGrouper.ts
var DEFAULT_REGION_GROUPER_OPTIONS = {
  minArticleWords: 40,
  minArticleParagraphs: 2,
  minChatMessages: 2,
  minListingItems: 3,
  maxRegions: 200
};
var RegionGrouper = class {
  options;
  regionIdCounter = 0;
  regions = [];
  nodeById;
  constructor(options = {}) {
    this.options = { ...DEFAULT_REGION_GROUPER_OPTIONS, ...options };
  }
  group(blocks, nodeById) {
    this.regionIdCounter = 0;
    this.regions = [];
    this.nodeById = nodeById;
    this.groupArticles(blocks);
    this.groupAiChat(blocks);
    this.groupProductListings(blocks);
    this.groupRecordLists(blocks);
    this.groupTables(blocks);
    this.groupLists(blocks);
    this.groupNavigation(blocks);
    this.groupBreadcrumbs(blocks);
    this.groupForms(blocks);
    this.groupMedia(blocks);
    this.groupInputs(blocks);
    this.groupComposers(blocks);
    this.groupBars(blocks);
    this.groupActions(blocks);
    const byKind = {};
    for (const region of this.regions) {
      byKind[region.kind] = (byKind[region.kind] ?? 0) + 1;
    }
    const regionsByNodeId = /* @__PURE__ */ new Map();
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
        byKind
      }
    };
  }
  groupArticles(blocks) {
    const paragraphs = blocks.filter((block) => block.kind === "paragraph");
    for (const paragraph of paragraphs) {
      const nearby = this.findNearbyBlocks(paragraph, blocks, [
        "paragraph",
        "heading",
        "media",
        "list"
      ]);
      const proseBlocks = nearby.filter((block) => block.kind === "paragraph");
      const headingBlocks = nearby.filter((block) => block.kind === "heading");
      const wordCount = nearby.reduce(
        (total, block) => total + block.wordCount,
        0
      );
      const avgLinkDensity = nearby.length > 0 ? nearby.reduce((total, block) => total + block.linkDensity, 0) / nearby.length : 1;
      if (proseBlocks.length < this.options.minArticleParagraphs || wordCount < this.options.minArticleWords || avgLinkDensity > 0.55) {
        continue;
      }
      const score = 0.42 + Math.min(0.25, proseBlocks.length * 0.03) + Math.min(0.18, wordCount / 1500) + (headingBlocks.length > 0 ? 0.1 : 0) - avgLinkDensity * 0.2;
      this.addRegion({
        kind: "article",
        anchor: paragraph,
        blocks: nearby,
        score,
        metadata: {
          paragraphCount: proseBlocks.length,
          headingCount: headingBlocks.length,
          wordCount,
          averageLinkDensity: avgLinkDensity
        }
      });
    }
  }
  groupAiChat(blocks) {
    const messages = blocks.filter((block) => block.kind === "chat_message");
    if (messages.length < this.options.minChatMessages) {
      return;
    }
    const groups = this.groupByAncestor(messages, 4);
    for (const group of groups) {
      if (group.length < this.options.minChatMessages) {
        continue;
      }
      const roles = group.map(
        (block) => block.metadata.inferredRole ?? "unknown"
      );
      const hasUser = roles.includes("user");
      const hasAssistant = roles.includes("assistant");
      const score = 0.5 + Math.min(0.25, group.length * 0.04) + (hasUser && hasAssistant ? 0.25 : 0);
      if (score < 0.55) {
        continue;
      }
      this.addRegion({
        kind: "ai_chat",
        anchor: group[0],
        blocks: group,
        score,
        metadata: {
          messageCount: group.length,
          hasUser,
          hasAssistant,
          roles
        }
      });
    }
  }
  groupProductListings(blocks) {
    const grids = blocks.filter((block) => block.kind === "card_grid");
    for (const grid of grids) {
      const itemCount = Number(grid.metadata.itemCount ?? 0);
      if (itemCount < this.options.minListingItems) {
        continue;
      }
      const nearby = this.findNearbyBlocks(grid, blocks, [
        "card_grid",
        "navigation",
        "form",
        "breadcrumb"
      ]);
      const hasPagination = nearby.some(
        (block) => block.kind === "navigation" && /next|page|pagination|older|newer/i.test(block.text)
      );
      const hasFilters = nearby.some(
        (block) => block.kind === "form" && /filter|sort|category|price/i.test(block.text)
      );
      const similarity = Number(grid.metadata.structuralSimilarity ?? 0);
      const score = 0.45 + similarity * 0.25 + Math.min(0.15, itemCount * 0.01) + (hasPagination ? 0.08 : 0) + (hasFilters ? 0.07 : 0);
      this.addRegion({
        kind: "product_listing",
        anchor: grid,
        blocks: [grid, ...nearby],
        score,
        metadata: {
          itemCount,
          structuralSimilarity: similarity,
          hasPagination,
          hasFilters
        }
      });
    }
  }
  groupTables(blocks) {
    for (const table of blocks.filter((block) => block.kind === "table")) {
      this.addRegion({
        kind: "data_table",
        anchor: table,
        blocks: [table],
        score: table.score,
        metadata: { ...table.metadata }
      });
    }
  }
  groupLists(blocks) {
    for (const list of blocks.filter((block) => block.kind === "list")) {
      this.addRegion({
        kind: "list",
        anchor: list,
        blocks: [list],
        score: list.score * 0.8,
        metadata: { ...list.metadata }
      });
    }
  }
  groupNavigation(blocks) {
    for (const nav of blocks.filter((block) => block.kind === "navigation")) {
      this.addRegion({
        kind: "navigation",
        anchor: nav,
        blocks: [nav],
        score: nav.score,
        metadata: { ...nav.metadata }
      });
    }
  }
  groupBreadcrumbs(blocks) {
    for (const breadcrumb of blocks.filter(
      (block) => block.kind === "breadcrumb"
    )) {
      this.addRegion({
        kind: "breadcrumb",
        anchor: breadcrumb,
        blocks: [breadcrumb],
        score: breadcrumb.score,
        metadata: { ...breadcrumb.metadata }
      });
    }
  }
  groupForms(blocks) {
    for (const form of blocks.filter((block) => block.kind === "form")) {
      this.addRegion({
        kind: "form",
        anchor: form,
        blocks: [form],
        score: form.score,
        metadata: { ...form.metadata }
      });
    }
  }
  groupMedia(blocks) {
    for (const item of blocks.filter((block) => block.kind === "media")) {
      this.addRegion({
        kind: "media",
        anchor: item,
        blocks: [item],
        score: item.score,
        metadata: { ...item.metadata }
      });
    }
  }
  groupInputs(blocks) {
    for (const input of blocks.filter((block) => block.kind === "input")) {
      this.addRegion({
        kind: "input",
        anchor: input,
        blocks: [input],
        score: input.score,
        metadata: { ...input.metadata }
      });
    }
  }
  groupComposers(blocks) {
    for (const composer of blocks.filter((block) => block.kind === "composer")) {
      this.addRegion({
        kind: "composer",
        anchor: composer,
        blocks: [composer],
        score: composer.score,
        metadata: { ...composer.metadata }
      });
    }
  }
  groupBars(blocks) {
    for (const bar of blocks.filter((block) => block.kind === "bar")) {
      this.addRegion({
        kind: "bar",
        anchor: bar,
        blocks: [bar],
        score: bar.score,
        metadata: { ...bar.metadata }
      });
    }
  }
  groupActions(blocks) {
    for (const action of blocks.filter((block) => block.kind === "action")) {
      this.addRegion({
        kind: "action",
        anchor: action,
        blocks: [action],
        score: action.score,
        metadata: { ...action.metadata }
      });
    }
  }
  groupRecordLists(blocks) {
    for (const rg of blocks.filter((block) => block.kind === "record_group")) {
      this.addRegion({
        kind: "record_list",
        anchor: rg,
        blocks: [rg],
        score: rg.score,
        metadata: { ...rg.metadata }
      });
    }
  }
  findNearbyBlocks(anchor, blocks, kinds) {
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
      return this.areDomRelated(anchorNode, block.element, 4);
    });
  }
  groupByAncestor(blocks, maxDepth) {
    const groups = /* @__PURE__ */ new Map();
    for (const block of blocks) {
      const key = this.getAncestorKey(block.element, maxDepth);
      const group = groups.get(key) ?? [];
      group.push(block);
      groups.set(key, group);
    }
    return Array.from(groups.values());
  }
  getAncestorKey(element, maxDepth) {
    let current = element;
    const parts = [];
    for (let depth = 0; depth < maxDepth && current; depth++) {
      parts.unshift(current.tagName.toLowerCase());
      current = current.parentElement;
    }
    return parts.join(">");
  }
  areDomRelated(a, b, maxDepth) {
    let current = a;
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
  addRegion(input) {
    if (this.regions.length >= this.options.maxRegions) {
      return;
    }
    const uniqueBlocks = this.deduplicateBlocks(input.blocks);
    if (uniqueBlocks.length === 0) {
      return;
    }
    this.regionIdCounter++;
    const text = uniqueBlocks.map((block) => block.text).join(" ").replace(/\s+/g, " ").trim();
    const wordCount = uniqueBlocks.reduce(
      (total, block) => total + block.wordCount,
      0
    );
    const linkDensity = uniqueBlocks.length > 0 ? uniqueBlocks.reduce((total, block) => total + block.linkDensity, 0) / uniqueBlocks.length : 0;
    const anchorNode = this.findCommonAncestor(uniqueBlocks) ?? this.getNode(input.anchor.nodeId);
    this.regions.push({
      regionId: `r${this.regionIdCounter}`,
      kind: input.kind,
      nodeId: anchorNode?.nodeId ?? input.anchor.nodeId,
      element: anchorNode?.element ?? input.anchor.element,
      score: clamp2(input.score),
      confidence: clamp2(input.score),
      blockIds: uniqueBlocks.map((block) => block.blockId),
      blockKinds: uniqueBlocks.map((block) => block.kind),
      text: text.slice(0, 1e3),
      wordCount,
      linkDensity,
      metadata: {
        anchorBlockId: input.anchor.blockId,
        blockCount: uniqueBlocks.length,
        ...input.metadata
      }
    });
  }
  /**
   * Anchor the region to the lowest normalized node that contains every
   * member block, so downstream extraction sees the full region, not just
   * the first block that triggered the grouping.
   */
  findCommonAncestor(blocks) {
    if (!this.nodeById || blocks.length === 0) {
      return null;
    }
    const nodeById = this.nodeById;
    const chains = blocks.map((block) => {
      const node = nodeById?.get(block.nodeId);
      if (!node) return [];
      const chain = [node.nodeId];
      let parent = node.parentId ? nodeById.get(node.parentId) : void 0;
      while (parent) {
        chain.unshift(parent.nodeId);
        const next = parent.parentId ? nodeById.get(parent.parentId) : void 0;
        parent = next;
      }
      return chain;
    });
    if (chains.some((chain) => chain.length === 0)) {
      return null;
    }
    const shortest = Math.min(...chains.map((chain) => chain.length));
    let commonId;
    for (let index = 0; index < shortest; index++) {
      const value = chains[0][index];
      if (chains.every((chain) => chain[index] === value)) {
        commonId = value;
      } else {
        break;
      }
    }
    if (!commonId) {
      return null;
    }
    return this.nodeById.get(commonId) ?? null;
  }
  getNode(nodeId) {
    if (!this.nodeById) return void 0;
    return this.nodeById.get(nodeId);
  }
  deduplicateBlocks(blocks) {
    const seen = /* @__PURE__ */ new Set();
    return blocks.filter((block) => {
      if (seen.has(block.blockId)) {
        return false;
      }
      seen.add(block.blockId);
      return true;
    });
  }
};
function clamp2(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

// src/detection/DetectionContext.ts
var DEFAULT_DETECTION_OPTIONS = {
  includeHidden: false,
  includeNavigation: true,
  includeBoilerplate: true,
  minConfidence: 0.3,
  maxCandidatesPerDetector: 50
};
var ContextBuilder = class {
  options;
  normalizer;
  segmenter;
  grouper;
  constructor(options = {}, segmenterOptions = {}, grouperOptions = {}) {
    this.options = {
      ...DEFAULT_DETECTION_OPTIONS,
      ...options
    };
    this.normalizer = new DomNormalizer({
      removeHidden: !this.options.includeHidden
    });
    this.segmenter = new BlockSegmenter(segmenterOptions);
    this.grouper = new RegionGrouper(grouperOptions);
  }
  async build(sourceRoot) {
    const normalized = this.normalizer.normalize(sourceRoot);
    const blocks = this.segmenter.segment(normalized);
    const regions = this.grouper.group(blocks.blocks, normalized.nodeById);
    const page = await this.extractPageMetadata(sourceRoot, normalized);
    return {
      sourceRoot,
      normalized,
      blocks,
      regions,
      page,
      options: this.options,
      getRegion: (kind) => regions.regions.filter((region) => region.kind === kind),
      getBlocks: (kind) => blocks.blocks.filter((block) => block.kind === kind),
      getNode: (nodeId) => normalized.nodeById.get(nodeId),
      hasJsonLdType: (type) => page.jsonLdTypes.some(
        (candidate) => candidate.toLowerCase() === type.toLowerCase()
      )
    };
  }
  async extractPageMetadata(sourceRoot, normalized) {
    const doc = sourceRoot instanceof Document ? sourceRoot : sourceRoot.ownerDocument;
    const location2 = typeof window !== "undefined" ? window.location : void 0;
    const url = location2?.href ?? "";
    const hostname = location2?.hostname ?? "";
    const pathname = location2?.pathname ?? "";
    const meta = (name) => {
      if (!doc) return void 0;
      return doc.querySelector(`meta[name="${name}"]`)?.getAttribute("content") ?? doc.querySelector(`meta[property="${name}"]`)?.getAttribute("content") ?? void 0;
    };
    const openGraph = {};
    if (doc) {
      for (const element of Array.from(
        doc.querySelectorAll('meta[property^="og:"]')
      )) {
        const property = element.getAttribute("property");
        const content = element.getAttribute("content");
        if (property && content) {
          openGraph[property] = content;
        }
      }
    }
    return {
      url,
      hostname,
      pathname,
      title: doc?.title ?? void 0,
      description: meta("description"),
      lang: doc?.documentElement.getAttribute("lang") ?? void 0,
      canonicalUrl: doc?.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? void 0,
      openGraph,
      jsonLd: normalized.jsonLd,
      jsonLdTypes: this.collectJsonLdTypes(normalized.jsonLd)
    };
  }
  collectJsonLdTypes(jsonLd) {
    const types = [];
    for (const item of jsonLd) {
      this.walkJsonLd(item, types);
    }
    return Array.from(new Set(types));
  }
  walkJsonLd(value, output) {
    if (!value || typeof value !== "object") {
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        this.walkJsonLd(item, output);
      }
      return;
    }
    const record = value;
    const type = record["@type"];
    if (typeof type === "string") {
      output.push(type);
    } else if (Array.isArray(type)) {
      for (const item of type) {
        if (typeof item === "string") output.push(item);
      }
    }
    for (const child of Object.values(record)) {
      this.walkJsonLd(child, output);
    }
  }
};

// src/engine/RegionArbiter.ts
var SPECIFICITY = {
  product: 0.95,
  product_listing: 0.9,
  record_list: 0.88,
  ai_chat: 0.9,
  article: 0.85,
  table: 0.8,
  form: 0.7,
  breadcrumb: 0.65,
  media: 0.6,
  list: 0.55,
  blog_index: 0.5,
  navigation: 0.5,
  generic: 0.1,
  input: 0.6,
  composer: 0.75,
  bar: 0.45,
  panel: 0.5,
  action: 0.4,
  text: 0.35
};
var RegionArbiter = class {
  select(candidates, _context) {
    const sorted = [...candidates].sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      const specificityDelta = SPECIFICITY[b.kind] - SPECIFICITY[a.kind];
      if (Math.abs(specificityDelta) > 1e-3) {
        return specificityDelta;
      }
      return 0;
    });
    const selected = [];
    for (const candidate of sorted) {
      const conflicts = selected.some(
        (existing) => this.overlaps(existing.element, candidate.element)
      );
      if (conflicts) {
        continue;
      }
      selected.push(candidate);
    }
    return selected;
  }
  overlaps(a, b) {
    return a === b || a.contains(b) || b.contains(a);
  }
};

// src/engine/ExtractionEngine.ts
init_PageClassifier();

// src/confidence/ConfidenceCalibrator.ts
var ConfidenceCalibrator = class {
  models = /* @__PURE__ */ new Map();
  train(examples, options = {}) {
    if (examples.length === 0) {
      throw new Error("Cannot calibrate with zero examples.");
    }
    const bucketCount = options.bucketCount ?? 10;
    const thresholds = [];
    const precision = [];
    for (let index = 0; index < bucketCount; index++) {
      const lower = index / bucketCount;
      const upper = (index + 1) / bucketCount;
      const bucket2 = examples.filter(
        (example) => example.rawScore >= lower && (index === bucketCount - 1 ? example.rawScore <= 1 : example.rawScore < upper)
      );
      thresholds.push(upper);
      if (bucket2.length === 0) {
        precision.push(this.globalPrecision(examples));
        continue;
      }
      const correct = bucket2.filter((example) => example.correct).length;
      precision.push(correct / bucket2.length);
    }
    const model = {
      version: "1.0.0",
      detectorId: options.detectorId,
      thresholds,
      precision,
      trainedAt: (/* @__PURE__ */ new Date()).toISOString(),
      exampleCount: examples.length
    };
    const key = options.detectorId ?? "global";
    this.models.set(key, model);
    return model;
  }
  calibrate(rawScore, detectorId) {
    const model = (detectorId ? this.models.get(detectorId) : void 0) ?? this.models.get("global");
    if (!model) {
      return clamp4(rawScore * 0.85);
    }
    const bucketIndex = model.thresholds.findIndex(
      (threshold) => rawScore <= threshold
    );
    const safeIndex = bucketIndex === -1 ? model.precision.length - 1 : bucketIndex;
    return clamp4(model.precision[safeIndex]);
  }
  globalPrecision(examples) {
    const correct = examples.filter((example) => example.correct).length;
    return correct / examples.length;
  }
};
function clamp4(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

// src/extraction/jsonLd.ts
function walkJsonLdNodes(value, visit) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) walkJsonLdNodes(item, visit);
    return;
  }
  const record = value;
  visit(record);
  for (const child of Object.values(record)) {
    walkJsonLdNodes(child, visit);
  }
}
function resolveJsonLdNodes(jsonLd, types, visit) {
  const wanted = new Set(types.map((type) => type.toLowerCase()));
  for (const item of jsonLd) {
    walkJsonLdNodes(item, (node) => {
      const rawType = node["@type"];
      const candidates = Array.isArray(rawType) ? rawType.map(String) : typeof rawType === "string" ? [rawType] : [];
      if (candidates.some((candidate) => wanted.has(candidate.toLowerCase()))) {
        visit(node);
      }
    });
  }
}

// src/extraction/ArticleExtractor.ts
var ArticleExtractor = class {
  extract(context) {
    const structured = this.fromJsonLd(context.jsonLd);
    const dom = this.fromDom(context.element, context.document);
    const data = {
      title: structured.title ?? dom.title,
      author: structured.author ?? dom.author,
      date: structured.date ?? dom.date,
      description: structured.description ?? dom.description,
      paragraphs: dom.paragraphs,
      headings: dom.headings,
      images: dom.images
    };
    const hasMinimum = Boolean(data.title) || dom.paragraphs.length > 0 || structured.title !== void 0;
    if (!hasMinimum) return null;
    return { data };
  }
  fromJsonLd(jsonLd) {
    const out = {};
    const articleTypes = [
      "article",
      "blogposting",
      "newsarticle",
      "techarticle"
    ];
    resolveJsonLdNodes(jsonLd, articleTypes, (node) => {
      if (typeof node.name === "string") out.title ||= node.name;
      if (typeof node.headline === "string") out.title ||= node.headline;
      if (typeof node.description === "string") out.description ||= node.description;
      if (typeof node.datePublished === "string") out.date ||= node.datePublished;
      const author = node.author;
      if (typeof author === "string") {
        out.author ||= author;
      } else if (author && typeof author === "object") {
        const name = author.name;
        if (typeof name === "string") out.author ||= name;
      }
    });
    return out;
  }
  fromDom(element, document2) {
    const paragraphs = [];
    for (const p of element.querySelectorAll(":scope p, :scope > * > p")) {
      const text = p.textContent?.replace(/\s+/g, " ").trim() ?? "";
      if (text.length > 0) paragraphs.push(text);
    }
    const headings = [];
    for (const h of element.querySelectorAll(":scope h1, :scope h2, :scope h3, :scope h4, :scope h5, :scope h6")) {
      const text = h.textContent?.replace(/\s+/g, " ").trim() ?? "";
      const level = Number(h.tagName.slice(1));
      if (text && !Number.isNaN(level)) headings.push({ level, text });
    }
    const images = [];
    for (const img of element.querySelectorAll(":scope img, :scope > * > img")) {
      const src = img.getAttribute("src") ?? img.getAttribute("data-src");
      if (src && !images.includes(src)) images.push(src);
    }
    const meta = (name) => {
      if (!document2) return void 0;
      return document2.querySelector(`meta[property="${name}"]`)?.getAttribute("content") ?? void 0;
    };
    return {
      title: element.querySelector("h1")?.textContent?.replace(/\s+/g, " ").trim() ?? void 0,
      author: element.querySelector(".byline, .author, [itemprop=author], [rel=author]")?.textContent?.replace(/\s+/g, " ").replace(/^By\s+/i, "").trim() ?? void 0,
      date: element.querySelector("time[datetime]")?.getAttribute("datetime") ?? void 0,
      description: meta("og:description") ?? meta("description") ?? void 0,
      paragraphs,
      headings,
      images
    };
  }
};

// src/extraction/ProductExtractor.ts
function collectImages(element, limit = 5) {
  const images = [];
  const seed = element.querySelectorAll(
    'img, [class*="image" i img], [class*="photo" i] img, [itemprop=image]'
  );
  for (const img of Array.from(seed)) {
    const src = img.getAttribute("src") ?? img.getAttribute("data-src") ?? img.getAttribute("data-lazy-src");
    if (!src || src.startsWith("data:")) continue;
    if (!images.includes(src)) images.push(src);
    if (images.length >= limit) break;
  }
  return images;
}
function ratingNumber(value) {
  const num = typeof value === "string" ? Number(value) : value;
  return typeof num === "number" && Number.isFinite(num) ? num : void 0;
}
var ProductExtractor = class {
  extract(context) {
    const structured = {};
    resolveJsonLdNodes(context.jsonLd, ["product"], (node) => {
      if (typeof node.name === "string") structured.title ||= node.name;
      if (typeof node.description === "string") structured.description ||= node.description;
      if (typeof node.sku === "string") structured.sku ||= node.sku;
      const brand = node.brand;
      if (typeof brand === "string") structured.brand ||= brand;
      if (brand && typeof brand === "object") {
        const name = brand.name;
        if (typeof name === "string") structured.brand ||= name;
      }
      if (node.image) {
        const image = Array.isArray(node.image) ? node.image[0] : node.image;
        if (typeof image === "string" && !structured.images) {
          structured.images = [image];
        }
      }
      const rating = node.aggregateRating;
      if (rating && typeof rating === "object") {
        structured.rating ||= ratingNumber(rating.ratingValue);
        structured.reviewCount ||= ratingNumber(rating.reviewCount);
      }
      const offers = Array.isArray(node.offers) ? node.offers[0] : node.offers;
      if (offers && typeof offers === "object") {
        const offer = offers;
        if (offer.price !== void 0) {
          structured.price ||= String(offer.price);
        }
        if (typeof offer.priceCurrency === "string") {
          structured.currency ||= offer.priceCurrency;
        }
        if (typeof offer.availability === "string") {
          structured.availability ||= offer.availability.split("/").pop();
        }
      }
    });
    const element = context.element;
    const dom = {};
    const titleEl = element.querySelector("h1, [itemprop=name], .product-title");
    if (titleEl) {
      dom.title ||= titleEl.textContent?.replace(/\s+/g, " ").trim() || void 0;
    }
    if (!structured.price) {
      const priceEl = element.querySelector("[itemprop=price], .price, .product-price");
      const priceText = priceEl?.textContent?.replace(/\s+/g, " ").trim();
      if (priceText) dom.price ||= priceText;
    }
    if (!structured.availability) {
      const availabilityEl = element.querySelector(".availability, [itemprop=availability]");
      const text = availabilityEl?.textContent?.replace(/\s+/g, "").trim();
      if (text) {
        dom.availability ||= text.includes("InStock") || /in stock/i.test(text) ? "InStock" : text;
      }
    }
    if (!structured.description) {
      const descEl = element.querySelector('[class*="description" i]');
      const text = descEl?.textContent?.replace(/\s+/g, " ").trim();
      if (text) dom.description ||= text;
    }
    if (!structured.images || structured.images.length === 0) {
      structured.images = collectImages(element);
    }
    const data = {
      title: structured.title ?? dom.title,
      price: structured.price ?? dom.price,
      currency: structured.currency,
      availability: structured.availability ?? dom.availability,
      sku: structured.sku,
      brand: structured.brand,
      description: structured.description ?? dom.description,
      images: structured.images,
      rating: structured.rating,
      reviewCount: structured.reviewCount
    };
    if (!data.title && !data.price) return null;
    return { data };
  }
};

// src/extraction/AiChatExtractor.ts
var AiChatExtractor = class {
  extract(context) {
    const element = context.element;
    const messages = this.readMessages(element);
    if (messages.length === 0) return null;
    const title = context.document?.title?.trim() || element.querySelector('h1, h2, [class*="title" i]')?.textContent?.replace(/\s+/g, " ").trim() || "Chat conversation";
    return { data: { title, messages } };
  }
  readMessages(element) {
    const explicit = Array.from(
      element.querySelectorAll("[data-message-role], [data-role]")
    );
    if (explicit.length > 0) {
      return explicit.map(this.readExplicitMessage).filter(Boolean);
    }
    const classed = Array.from(
      element.querySelectorAll('[class*="message" i]')
    );
    if (classed.length > 0) {
      return classed.map(this.readClassMessage).filter(Boolean);
    }
    return Array.from(element.children).map((child) => child.textContent?.replace(/\s+/g, " ").trim()).filter((text) => Boolean(text && text.length > 1)).map((text) => ({ role: "unknown", text }));
  }
  readExplicitMessage = (el) => {
    const rawRole = el.getAttribute("data-message-role") ?? el.getAttribute("data-role") ?? "";
    const role = this.normalizeRole(rawRole) ?? this.normalizeRole(
      el.className.toLowerCase()
    );
    const text = el.textContent?.replace(/\s+/g, " ").trim();
    if (!text) return null;
    return { role: role ?? "unknown", text };
  };
  readClassMessage = (el) => {
    const className = el.className.toLowerCase();
    let role;
    if (/user|human/.test(className)) role = "user";
    if (/assistant|bot|ai|model/.test(className)) role = "assistant";
    const text = el.textContent?.replace(/\s+/g, " ").trim();
    if (!text) return null;
    return { role: role ?? "unknown", text };
  };
  normalizeRole(role) {
    const normalized = role.toLowerCase();
    if (normalized === "user" || normalized === "human") return "user";
    if (normalized === "assistant" || normalized === "bot" || normalized === "ai") {
      return "assistant";
    }
    if (normalized === "system") return "system";
    return void 0;
  }
};

// src/extraction/TableExtractor.ts
var CELL_SELECTOR = "td, th, [role=cell], [role=gridcell]";
var ROW_SELECTOR = "tr, [role=row]";
var HEADER_SELECTOR = "th, [role=columnheader]";
var TableExtractor = class {
  extract(context) {
    const element = context.element;
    const semantic = this.fromSemantic(element);
    if (semantic) return { data: semantic };
    const aria = this.fromAriaRoles(element);
    if (aria) return { data: aria };
    const visual = this.fromVisualRepeat(element);
    if (visual) return { data: visual };
    return null;
  }
  fromSemantic(element) {
    if (element.tagName.toLowerCase() !== "table") return null;
    const caption = element.querySelector("caption")?.textContent?.replace(/\s+/g, " ").trim() || void 0;
    const headers = Array.from(element.querySelectorAll("th")).map(
      (h) => h.textContent?.replace(/\s+/g, " ").trim() ?? ""
    );
    const rows = Array.from(element.querySelectorAll("tbody tr, tr")).map((tr) => Array.from(tr.querySelectorAll("td, th")).map(tdToText)).filter((cells) => cells.length > 0);
    return this.validate({ caption, headers, rows });
  }
  fromAriaRoles(element) {
    if (element.getAttribute("role")?.toLowerCase() !== "grid") return null;
    const headers = Array.from(element.querySelectorAll(HEADER_SELECTOR)).map(
      (h) => h.textContent?.replace(/\s+/g, " ").trim() ?? ""
    );
    const rows = Array.from(element.querySelectorAll(ROW_SELECTOR)).map((row) => Array.from(row.querySelectorAll(CELL_SELECTOR)).map(tdToText)).filter((cells) => cells.length > 0);
    return this.validate({ headers, rows });
  }
  fromVisualRepeat(element) {
    const groups = [":scope > div", ":scope > ul > li", ":scope > table"];
    for (const groupSelector of groups) {
      const groups2 = Array.from(element.querySelectorAll(groupSelector));
      if (groups2.length < 3) continue;
      const childCounts = groups2.map((g) => g.children.length);
      const mode = Math.max(...childCounts);
      const consistent = childCounts.filter((count) => count === mode).length / groups2.length;
      if (mode < 2 || consistent < 0.7) continue;
      const rows = groups2.map(
        (group) => Array.from(group.children).map(tdToText)
      );
      return this.validate({ headers: [], rows });
    }
    return null;
  }
  validate(data) {
    const { rows } = data;
    const columnCounts = rows.map((row) => row.length);
    const columns = columnCounts[0] ?? 0;
    if (rows.length < 2 || columns < 2) return null;
    const consistent = columnCounts.filter((count) => count === columns).length;
    if (consistent / rows.length < 0.7) return null;
    return { ...data, headers: data.headers, rows };
  }
};
function tdToText(cell) {
  return cell.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

// src/extraction/ListExtractor.ts
function isItemLike(item) {
  return item.querySelector("a, h1, h2, h3, h4, img, button") !== null;
}
var ListExtractor = class {
  extract(context) {
    const element = context.element;
    const semantic = this.fromSemanticList(element);
    if (semantic) return { data: semantic };
    const cards = this.fromCardGrid(element);
    if (cards) return { data: cards };
    return null;
  }
  fromSemanticList(element) {
    let list = null;
    if (element.tagName.toLowerCase() === "ul" || element.tagName.toLowerCase() === "ol") {
      list = element;
    } else {
      list = element.querySelector("ul, ol");
    }
    if (!list) return null;
    const items = Array.from(list.children).filter((li) => li.tagName.toLowerCase() === "li" || isItemLike(li)).map((li) => li.textContent?.replace(/\s+/g, " ").trim() ?? "").filter((text) => text.length > 0);
    if (items.length < 2) return null;
    const images = Array.from(list.querySelectorAll("img")).map((img) => img.getAttribute("src") ?? img.getAttribute("data-src") ?? "").filter((src) => src.length > 0 && !src.startsWith("data:"));
    return {
      ordered: list.tagName.toLowerCase() === "ol",
      items,
      itemImages: images
    };
  }
  fromCardGrid(element) {
    const grid = element.classList.contains("grid") || element.querySelector('[class*="grid" i], [class*="list" i]');
    if (!grid) return null;
    const gridElement = grid instanceof Element ? grid : element;
    const items = Array.from(gridElement.children).filter(isItemLike);
    if (items.length < 2) return null;
    return {
      ordered: false,
      items: items.map(
        (item) => item.textContent?.replace(/\s+/g, " ").trim() ?? ""
      ),
      itemImages: Array.from(gridElement.querySelectorAll("img")).map((img) => img.getAttribute("src") ?? "").filter(Boolean)
    };
  }
};

// src/extraction/MarkdownFormatter.ts
var MarkdownFormatter = class {
  format(kind, data, title) {
    switch (kind) {
      case "article":
        return this.article(data);
      case "product":
        return this.product(data);
      case "ai_chat":
        return this.aiChat(data, title);
      case "table":
        return this.table(data);
      case "product_listing":
      case "list":
        return this.list(data, title);
      default:
        return `# ${title}

${JSON.stringify(data, null, 2)}`;
    }
  }
  article(data) {
    const parts = [];
    if (data.title) parts.push(`# ${data.title}`);
    const meta = [data.author, data.date].filter(Boolean).join(" \xB7 ");
    if (meta) parts.push(`_${meta}_`);
    if (data.description) parts.push(`> ${data.description}`);
    const body = [];
    for (const heading of data.headings) {
      body.push(`${"#".repeat(Math.min(6, heading.level))} ${heading.text}`);
    }
    for (const paragraph of data.paragraphs) {
      body.push(paragraph);
    }
    if (body.length > 0) parts.push(body.join("\n\n"));
    if (data.images.length > 0) {
      parts.push(
        data.images.map((src) => `![image](${src})`).join("\n\n")
      );
    }
    return parts.join("\n\n");
  }
  product(data) {
    const parts = [];
    parts.push(`# ${data.title ?? "Product"}`);
    if (data.price) {
      const price = data.currency ? `${data.currency} ${data.price}` : data.price;
      parts.push(`**Price:** ${price}`);
    }
    if (data.availability) parts.push(`**Availability:** ${data.availability}`);
    if (data.brand) parts.push(`**Brand:** ${data.brand}`);
    if (data.sku) parts.push(`**SKU:** ${data.sku}`);
    if (data.rating !== void 0) {
      const reviews = data.reviewCount ? ` (${data.reviewCount} reviews)` : "";
      parts.push(`**Rating:** ${data.rating}${reviews}`);
    }
    if (data.description) parts.push(data.description);
    if (data.images.length > 0) {
      parts.push(
        data.images.map((src) => `![product image](${src})`).join("\n\n")
      );
    }
    return parts.join("\n\n");
  }
  aiChat(data, fallbackTitle) {
    const header = `# ${data.title ?? fallbackTitle}`;
    const body = data.messages.map((message) => `**${message.role}:** ${message.text}`).join("\n\n");
    return `${header}

${body}`;
  }
  table(data) {
    const headers = data.headers.length > 0 ? data.headers : this.inferHeaders(data);
    const lines = [];
    if (data.caption) lines.push(`**${data.caption}**`, "");
    lines.push(`| ${headers.join(" | ")} |`);
    lines.push(`| ${headers.map(() => "---").join(" | ")} |`);
    for (const row of data.rows) {
      lines.push(`| ${row.join(" | ")} |`);
    }
    return lines.join("\n");
  }
  list(data, fallbackTitle) {
    const marker = (index) => data.ordered ? `${index + 1}.` : "-";
    const body = data.items.map((item, index) => `${marker(index)} ${item}`);
    return `# ${fallbackTitle}

${body.join("\n")}`;
  }
  inferHeaders(data) {
    const width = Math.max(...data.rows.map((row) => row.length), 1);
    return Array.from({ length: width }, (_, index) => `Column ${index + 1}`);
  }
};

// src/extraction/LlmContextFormatter.ts
var LlmContextFormatter = class {
  format(kind, confidence, title, data) {
    return {
      type: kind,
      title,
      confidence: round(confidence),
      data
    };
  }
};
function round(value) {
  return Math.round(value * 1e3) / 1e3;
}

// src/extraction/ExtractionMapper.ts
var PRODUCT_KINDS = /* @__PURE__ */ new Set(["product", "product_listing"]);
var ExtractionMapper = class {
  article = new ArticleExtractor();
  product = new ProductExtractor();
  chat = new AiChatExtractor();
  table = new TableExtractor();
  list = new ListExtractor();
  markdown = new MarkdownFormatter();
  llmContext = new LlmContextFormatter();
  map(candidate, context) {
    const mappingContext = this.buildMappingContext(candidate, context);
    const extracted = this.extractFor(candidate.kind, mappingContext);
    if (!extracted) return null;
    const title = this.deriveTitle(extracted.data, candidate, context);
    const item = {
      kind: candidate.kind,
      detectorId: candidate.detectorId,
      nodeId: candidate.nodeId,
      confidence: candidate.confidence,
      element: candidate.element,
      data: extracted.data,
      markdown: this.markdown.format(candidate.kind, extracted.data, title),
      llmContext: this.llmContext.format(
        candidate.kind,
        candidate.confidence,
        title,
        extracted.data
      )
    };
    return item;
  }
  extractFor(kind, mappingContext) {
    switch (kind) {
      case "article":
      case "blog_index":
        return this.article.extract(mappingContext);
      case "product":
      case "product_listing":
        return PRODUCT_KINDS.has(kind) ? kind === "product" ? this.product.extract(mappingContext) : this.list.extract(mappingContext) : null;
      case "ai_chat":
        return this.chat.extract(mappingContext);
      case "table":
        return this.table.extract(mappingContext);
      case "list":
        return this.list.extract(mappingContext);
      default:
        return null;
    }
  }
  buildMappingContext(candidate, context) {
    const doc = candidate.element.ownerDocument ?? (context.sourceRoot instanceof Document ? context.sourceRoot : void 0);
    return {
      element: candidate.element,
      document: doc ?? void 0,
      jsonLd: context.normalized.jsonLd,
      hasJsonLdType: (type) => context.hasJsonLdType(type)
    };
  }
  deriveTitle(data, candidate, context) {
    const record = data;
    const fallbacks = [
      record.title,
      record.name,
      record.caption,
      candidate.element.querySelector('h1, h2, [class*="title" i]')?.textContent?.replace(/\s+/g, " ").trim(),
      context.page.title,
      candidate.kind.replace(/_/g, " ")
    ];
    for (const fallback of fallbacks) {
      if (typeof fallback === "string" && fallback.trim().length > 0) {
        return fallback.trim();
      }
    }
    return candidate.kind;
  }
};

// src/engine/ExtractionEngine.ts
var ExtractorEngine = class {
  detectors = [];
  arbiter = new RegionArbiter();
  pageClassifier = new PageClassifier();
  calibrator = new ConfidenceCalibrator();
  mapper = new ExtractionMapper();
  detectionOptions = {};
  segmenterOptions = {};
  grouperOptions = {};
  registerDetector(detector) {
    this.detectors.push(detector);
    return this;
  }
  /**
   * Tune the underlying normalization/segmentation/grouping layers without
   * changing the detector surface.
   */
  configure(options) {
    if (options.detection) this.detectionOptions = options.detection;
    if (options.segmentation) this.segmenterOptions = options.segmentation;
    if (options.grouping) this.grouperOptions = options.grouping;
    return this;
  }
  async extract(root, options = {}) {
    const context = await new ContextBuilder(
      { ...this.detectionOptions, ...options },
      this.segmenterOptions,
      this.grouperOptions
    ).build(root);
    const rawCandidates = [];
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
      )
    }));
    const selected = selectedRaw.map((candidate) => ({
      ...candidate,
      calibratedConfidence: this.calibrator.calibrate(
        candidate.score,
        candidate.detectorId
      )
    }));
    const extractions = selected.map((candidate) => this.mapper.map(candidate, context)).filter((item) => item !== null);
    return {
      page: context.page,
      classification,
      candidates,
      selected,
      extractions
    };
  }
  safeApplies(detector, context) {
    try {
      return detector.applies(context);
    } catch {
      return false;
    }
  }
};

// src/detection/DetectorPlugin.ts
var BaseDetectorPlugin = class {
  applies(_context) {
    return true;
  }
  candidate(input) {
    return {
      detectorId: input.detectorId,
      kind: input.kind,
      regionId: input.region?.regionId,
      nodeId: input.region?.nodeId ?? "",
      element: input.element,
      score: clamp5(input.score),
      confidence: clamp5(input.score),
      evidence: input.evidence,
      fields: input.fields ?? {},
      metadata: input.metadata ?? {}
    };
  }
  rankAndLimit(candidates, context) {
    return candidates.sort((a, b) => b.score - a.score).slice(0, context.options.maxCandidatesPerDetector);
  }
};
function clamp5(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

// src/detection/detectors/ArticleDetector.ts
var ArticleDetector = class extends BaseDetectorPlugin {
  id = "core.article";
  kinds = ["article"];
  version = "2.0.0";
  applies(context) {
    return context.getRegion("article").length > 0;
  }
  detect(context) {
    const regions = context.getRegion("article");
    const candidates = [];
    for (const region of regions) {
      const evidence = [];
      let score = region.score;
      evidence.push({
        signal: "prose_region",
        weight: 0.4,
        value: region.score,
        explanation: "Region contains multiple prose-like blocks."
      });
      if (context.hasJsonLdType("Article")) {
        score += 0.22;
        evidence.push({
          signal: "json_ld_article",
          weight: 0.22,
          value: "Article",
          explanation: "Page contains Article structured data."
        });
      }
      if (context.hasJsonLdType("BlogPosting")) {
        score += 0.2;
        evidence.push({
          signal: "json_ld_blog_posting",
          weight: 0.2,
          value: "BlogPosting",
          explanation: "Page contains BlogPosting structured data."
        });
      }
      if (context.hasJsonLdType("NewsArticle")) {
        score += 0.22;
        evidence.push({
          signal: "json_ld_news_article",
          weight: 0.22,
          value: "NewsArticle",
          explanation: "Page contains NewsArticle structured data."
        });
      }
      if (this.hasSemanticArticle(context, region)) {
        score += 0.12;
        evidence.push({
          signal: "semantic_article",
          weight: 0.12,
          value: true,
          explanation: "Semantic article/main landmark supports this region."
        });
      }
      if (this.hasDateOrAuthor(context, region)) {
        score += 0.08;
        evidence.push({
          signal: "byline_or_date",
          weight: 0.08,
          value: true,
          explanation: "Date, time, or author metadata found near region."
        });
      }
      if (/\/(blog|news|article|post|insights)\/i/i.test(context.page.pathname)) {
        score += 0.06;
        evidence.push({
          signal: "url_pattern",
          weight: 0.06,
          value: context.page.pathname,
          explanation: "URL path resembles an article route."
        });
      }
      if (region.linkDensity > 0.5) {
        score -= 0.18;
        evidence.push({
          signal: "high_link_density",
          weight: -0.18,
          value: region.linkDensity,
          explanation: "Region is too link-dense for article body content."
        });
      }
      if (score < context.options.minConfidence) {
        continue;
      }
      candidates.push(
        this.candidate({
          context,
          detectorId: this.id,
          kind: "article",
          region,
          element: region.element,
          score,
          evidence,
          metadata: {
            wordCount: region.wordCount,
            blockCount: region.metadata.blockCount
          }
        })
      );
    }
    return this.rankAndLimit(candidates, context);
  }
  hasSemanticArticle(context, region) {
    const node = context.getNode(region.nodeId);
    if (!node) {
      return false;
    }
    let current = node;
    for (let depth = 0; depth < 5 && current; depth++) {
      const tag = current.features.tag;
      const role = current.features.role;
      if (tag === "article" || role === "article" || tag === "main" || role === "main") {
        return true;
      }
      current = current.parentId ? context.getNode(current.parentId) : void 0;
    }
    return false;
  }
  hasDateOrAuthor(_context, region) {
    const element = region.element;
    const date = element.querySelector(
      "time, [datetime], [itemprop=datePublished], [itemprop=dateModified]"
    );
    const author = element.querySelector(
      "[rel=author], [itemprop=author], .author, .byline, [data-author]"
    );
    return Boolean(date || author);
  }
};

// src/detection/detectors/AiChatDetector.ts
var AiChatDetector = class extends BaseDetectorPlugin {
  id = "core.ai_chat";
  kinds = ["ai_chat"];
  version = "1.0.0";
  applies(context) {
    return context.getRegion("ai_chat").length > 0;
  }
  detect(context) {
    const candidates = [];
    for (const region of context.getRegion("ai_chat")) {
      const evidence = [];
      let score = region.score;
      const messageCount = Number(region.metadata.messageCount ?? 0);
      const hasUser = Boolean(region.metadata.hasUser);
      const hasAssistant = Boolean(region.metadata.hasAssistant);
      evidence.push({
        signal: "chat_messages",
        weight: 0.35,
        value: messageCount,
        explanation: "Detected repeated chat-message-like blocks."
      });
      if (hasUser && hasAssistant) {
        score += 0.25;
        evidence.push({
          signal: "alternating_roles",
          weight: 0.25,
          value: { hasUser, hasAssistant },
          explanation: "Both user and assistant roles were inferred."
        });
      }
      if (this.hasComposer(context, region)) {
        score += 0.18;
        evidence.push({
          signal: "composer",
          weight: 0.18,
          value: true,
          explanation: "Input/composer controls found near the conversation."
        });
      }
      if (/\/(chat|conversation|assistant|copilot)/i.test(context.page.pathname)) {
        score += 0.08;
        evidence.push({
          signal: "url_pattern",
          weight: 0.08,
          value: context.page.pathname,
          explanation: "URL path resembles a chat application route."
        });
      }
      if (score < context.options.minConfidence) {
        continue;
      }
      candidates.push(
        this.candidate({
          context,
          detectorId: this.id,
          kind: "ai_chat",
          region,
          element: region.element,
          score,
          evidence,
          metadata: {
            messageCount,
            hasUser,
            hasAssistant
          }
        })
      );
    }
    return this.rankAndLimit(candidates, context);
  }
  hasComposer(_context, region) {
    const root = region.element.closest("body") ?? region.element.ownerDocument.body;
    const composer = root.querySelector(
      [
        "form textarea",
        '[contenteditable="true"]',
        '[role="textbox"]',
        "textarea[placeholder]",
        'input[type="text"][placeholder]'
      ].join(", ")
    );
    const sendControl = root.querySelector(
      [
        'button[type="submit"]',
        '[aria-label*="send" i]',
        '[data-testid*="send" i]',
        '[class*="send" i]'
      ].join(", ")
    );
    return Boolean(composer && sendControl);
  }
};

// src/detection/detectors/TableDetector.ts
var TableDetector = class extends BaseDetectorPlugin {
  id = "core.table";
  kinds = ["table"];
  version = "2.0.0";
  applies(context) {
    return context.getRegion("data_table").length > 0 || context.getBlocks("table").length > 0;
  }
  detect(context) {
    const candidates = [];
    const tableRegions = context.getRegion("data_table");
    const tableBlocks = context.getBlocks("table");
    for (const region of tableRegions) {
      const signals = this.extractSignals(region.element);
      const candidate = this.buildCandidate(
        context,
        region.element,
        signals,
        region
      );
      if (candidate) {
        candidates.push(candidate);
      }
    }
    for (const block of tableBlocks) {
      const alreadyCovered = candidates.some(
        (candidate2) => candidate2.element.contains(block.element) || block.element.contains(candidate2.element)
      );
      if (alreadyCovered) {
        continue;
      }
      const signals = this.extractSignals(block.element);
      const candidate = this.buildCandidate(
        context,
        block.element,
        signals
      );
      if (candidate) {
        candidates.push(candidate);
      }
    }
    return this.rankAndLimit(candidates, context);
  }
  buildCandidate(context, element, signals, region) {
    if (signals.rowCount < 2 || signals.columnCount < 2) {
      return null;
    }
    const evidence = [];
    let score = 0.35;
    if (signals.isSemanticTable) {
      score += 0.3;
      evidence.push({
        signal: "semantic_table",
        weight: 0.3,
        value: true,
        explanation: "Element is a semantic <table>."
      });
    }
    if (signals.isAriaGrid) {
      score += 0.25;
      evidence.push({
        signal: "aria_grid",
        weight: 0.25,
        value: true,
        explanation: "Element uses table or grid ARIA semantics."
      });
    }
    if (signals.isVisualTable) {
      score += 0.18;
      evidence.push({
        signal: "visual_table",
        weight: 0.18,
        value: true,
        explanation: "Repeated rows and consistent columns resemble a table."
      });
    }
    if (signals.headerCount > 0) {
      score += 0.1;
      evidence.push({
        signal: "header_row",
        weight: 0.1,
        value: signals.headerCount,
        explanation: "Table header cells were found."
      });
    }
    if (signals.hasConsistentColumns) {
      score += 0.12;
      evidence.push({
        signal: "consistent_columns",
        weight: 0.12,
        value: signals.columnCount,
        explanation: "Rows contain a consistent number of cells."
      });
    }
    score += Math.min(0.1, signals.rowCount * 5e-3);
    if (score < context.options.minConfidence) {
      return null;
    }
    const fields = {
      rowCount: {
        value: signals.rowCount,
        confidence: 0.95,
        source: "dom-pattern"
      },
      columnCount: {
        value: signals.columnCount,
        confidence: signals.hasConsistentColumns ? 0.9 : 0.6,
        source: "dom-pattern"
      }
    };
    return this.candidate({
      context,
      detectorId: this.id,
      kind: "table",
      region,
      element,
      score,
      evidence,
      fields,
      metadata: { ...signals }
    });
  }
  extractSignals(element) {
    const isSemanticTable = element.tagName.toLowerCase() === "table";
    const role = element.getAttribute("role")?.toLowerCase();
    const isAriaGrid = role === "table" || role === "grid";
    const semanticRows = Array.from(element.querySelectorAll(":scope tr"));
    const ariaRows = Array.from(
      element.querySelectorAll(":scope [role=row]")
    );
    const rows = semanticRows.length > 0 ? semanticRows : ariaRows;
    const rowCellCounts = rows.map(
      (row) => row.querySelectorAll(
        ":scope > td, :scope > th, :scope > [role=cell], :scope > [role=gridcell]"
      ).length
    );
    const columnCount = rowCellCounts.length > 0 ? Math.max(...rowCellCounts) : 0;
    const hasConsistentColumns = rowCellCounts.length > 1 && rowCellCounts.every((count) => count === columnCount);
    const headerCount = element.querySelectorAll(
      ":scope th, :scope [role=columnheader]"
    ).length;
    const isVisualTable = this.detectVisualTable(element);
    return {
      rowCount: rows.length,
      columnCount,
      headerCount,
      hasConsistentColumns,
      isSemanticTable,
      isAriaGrid,
      isVisualTable
    };
  }
  detectVisualTable(element) {
    const children = Array.from(element.children);
    if (children.length < 3) {
      return false;
    }
    const childCounts = children.map((child) => child.children.length);
    const dominantCount = Math.max(...childCounts);
    const consistent = childCounts.filter(
      (count) => count === dominantCount
    ).length;
    return dominantCount >= 2 && consistent / children.length >= 0.7;
  }
};

// src/detection/detectors/ContextDetector.ts
var KINDS = [
  "list",
  "navigation",
  "breadcrumb",
  "form",
  "media",
  "text"
];
var ContextDetector = class extends BaseDetectorPlugin {
  id = "core.context";
  kinds = KINDS;
  version = "1.0.0";
  applies(context) {
    return KINDS.some(
      (kind) => context.getRegion(kind).length > 0 || context.getBlocks(kind).length > 0
    );
  }
  detect(context) {
    const candidates = [];
    for (const kind of KINDS) {
      const regions = context.getRegion(kind);
      for (const region of regions) {
        const candidate = this.buildCandidate(context, kind, region);
        if (candidate) candidates.push(candidate);
      }
    }
    return this.rankAndLimit(candidates, context);
  }
  buildCandidate(context, kind, region) {
    const evidence = [
      {
        signal: "context_region",
        weight: 0.35,
        value: kind,
        explanation: `Detected ${kind} context region.`
      }
    ];
    let score = region.score || 0.5;
    if (score < context.options.minConfidence) {
      score = Math.max(context.options.minConfidence, 0.4);
    }
    return this.candidate({
      context,
      detectorId: this.id,
      kind,
      region,
      element: region.element,
      score,
      evidence,
      fields: {},
      metadata: { surface: kind, ...region.metadata }
    });
  }
};

// src/detection/detectors/ProductDetector.ts
function walkJsonLd(value, visit) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) walkJsonLd(item, visit);
    return;
  }
  const record = value;
  visit(record);
  for (const item of Object.values(record)) walkJsonLd(item, visit);
}
function resolveProductJsonLd(context) {
  const fields = {};
  let found = false;
  for (const item of context.normalized.jsonLd) {
    walkJsonLd(item, (node) => {
      const type = node["@type"];
      const types = Array.isArray(type) ? type.map(String) : [String(type ?? "")];
      if (!types.some((t) => t.toLowerCase() === "product")) return;
      found = true;
      if (typeof node.name === "string") fields.title ||= node.name;
      if (typeof node.sku === "string") fields.sku ||= node.sku;
      const brand = node.brand;
      if (typeof brand === "string") fields.brand ||= brand;
      if (brand && typeof brand === "object" && typeof brand.name === "string") {
        fields.brand ||= brand.name;
      }
      const offers = Array.isArray(node.offers) ? node.offers[0] : node.offers;
      if (offers && typeof offers === "object") {
        const offer = offers;
        if (typeof offer.price === "string" || typeof offer.price === "number") {
          fields.price ||= String(offer.price);
        }
        if (typeof offer.priceCurrency === "string") fields.currency ||= offer.priceCurrency;
        if (typeof offer.availability === "string") {
          fields.availability ||= offer.availability.split("/").pop() ?? offer.availability;
        }
      }
    });
  }
  return { fields, found };
}
function collectProductDomFields(element) {
  const domText = (selector) => {
    const match = element.querySelector(selector);
    if (!match) return void 0;
    const text = match.textContent?.replace(/\s+/g, " ").trim();
    return text && text.length > 0 ? text : void 0;
  };
  const fields = {};
  fields.title ||= domText("h1") ?? domText("[itemprop=name]") ?? domText(".product-title") ?? domText(".product__title");
  const priceText = domText("[itemprop=price]") ?? domText(".price") ?? domText(".product-price") ?? domText(".product__price");
  if (priceText) fields.price ||= priceText;
  const availabilityText = domText("[itemprop=availability]") ?? domText(".availability") ?? domText(".product-availability");
  if (availabilityText) {
    fields.availability ||= availabilityText.includes("In Stock") ? "InStock" : availabilityText;
  }
  return fields;
}
var ProductDetector = class extends BaseDetectorPlugin {
  id = "core.product";
  kinds = ["product"];
  version = "2.0.0";
  applies(context) {
    return context.getRegion("product").length > 0 || context.hasJsonLdType("product");
  }
  detect(context) {
    const candidates = [];
    for (const region of context.getRegion("product")) {
      const candidate = this.buildCandidate(context, region);
      if (candidate) candidates.push(candidate);
    }
    if (candidates.length === 0 && context.hasJsonLdType("product")) {
      const { fields } = resolveProductJsonLd(context);
      const title = fields.title;
      const anchor = title ? context.normalized.root.element.querySelector("main article, main, body") : void 0;
      if (anchor) {
        const evidence = [
          {
            signal: "jsonld_product",
            weight: 0.4,
            value: true,
            explanation: "JSON-LD Product markup was found on the page."
          }
        ];
        candidates.push(
          this.candidate({
            context,
            detectorId: this.id,
            kind: "product",
            element: anchor,
            score: 0.6,
            evidence,
            fields: this.toFieldCandidates(fields, "json-ld"),
            metadata: { anchoredFrom: "jsonld" }
          })
        );
      }
    }
    return this.rankAndLimit(candidates, context);
  }
  buildCandidate(context, region) {
    const evidence = [];
    let score = region.score;
    evidence.push({
      signal: "region_score",
      weight: region.score,
      value: region.score,
      explanation: "RegionGrouper scored this region as a product."
    });
    const jsonLd = resolveProductJsonLd(context);
    if (jsonLd.found) {
      score += 0.25;
      evidence.push({
        signal: "jsonld_product",
        weight: 0.25,
        value: true,
        explanation: "JSON-LD Product markup confirms the region."
      });
    }
    const domFields = collectProductDomFields(region.element);
    const hasPrice = Boolean(jsonLd.fields.price ?? domFields.price);
    const hasAddToCart = region.element.querySelector(
      'button, a, [class*="cart" i], [class*="checkout" i]'
    ) !== null;
    if (hasPrice) {
      score += 0.12;
      evidence.push({
        signal: "price_present",
        weight: 0.12,
        value: jsonLd.fields.price ?? domFields.price,
        explanation: "A price value was found."
      });
    }
    if (hasAddToCart) {
      score += 0.08;
      evidence.push({
        signal: "commerce_actions",
        weight: 0.08,
        value: true,
        explanation: "Add-to-cart / checkout affordance found."
      });
    }
    if (score < context.options.minConfidence) {
      return null;
    }
    const jsonldTyped = this.toFieldCandidates(jsonLd.fields, "json-ld");
    const domTyped = this.toFieldCandidates(domFields, "semantic-html");
    const fields = { ...domTyped };
    for (const [key, value] of Object.entries(jsonldTyped)) {
      fields[key] = value;
    }
    return this.candidate({
      context,
      detectorId: this.id,
      kind: "product",
      region,
      element: region.element,
      score,
      evidence,
      fields,
      metadata: { ...region.metadata }
    });
  }
  toFieldCandidates(fields, source) {
    const output = {};
    for (const [key, value] of Object.entries(fields)) {
      if (value === void 0) continue;
      output[`product.${snake(key)}`] = {
        value,
        confidence: source === "json-ld" ? 0.95 : 0.7,
        source
      };
    }
    return output;
  }
};
function snake(value) {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

// src/detection/detectors/ProductGridDetector.ts
var CARD_SELECTORS = [
  '[class*="product-card" i]',
  '[class*="product-item" i]',
  '[class*="productCard" i]',
  'li[class*="product" i]',
  'article[class*="product" i]'
];
function pricePattern(text) {
  return /(?:[$€£¥]|USD|EUR|GBP)\s*\d+(?:[.,]\d{2})?|\d+(?:[.,]\d{2})?\s*(?:USD|EUR|GBP)\b/i.test(
    text
  );
}
var ProductGridDetector = class extends BaseDetectorPlugin {
  id = "core.product_grid";
  kinds = ["product_listing"];
  version = "2.0.0";
  applies(context) {
    return context.getRegion("product_listing").length > 0 || context.getBlocks("card_grid").length > 0;
  }
  detect(context) {
    const candidates = [];
    for (const region of context.getRegion("product_listing")) {
      const candidate = this.buildCandidate(context, region.element);
      if (candidate) {
        candidate.regionId = region.regionId;
        candidate.metadata = { ...region.metadata, ...candidate.metadata };
        candidates.push(candidate);
      }
    }
    for (const block of context.getBlocks("card_grid")) {
      const alreadyCovered = candidates.some(
        (candidate2) => candidate2.element.contains(block.element) || block.element.contains(candidate2.element)
      );
      if (alreadyCovered) continue;
      const candidate = this.buildCandidate(context, block.element);
      if (candidate) candidates.push(candidate);
    }
    return this.rankAndLimit(candidates, context);
  }
  buildCandidate(context, element) {
    const cards = this.findCards(element);
    if (cards < 2) return null;
    const evidence = [
      {
        signal: "product_card_cluster",
        weight: cards,
        value: cards,
        explanation: `${cards} similar product-like cards were found.`
      }
    ];
    let score = 0.4 + Math.min(0.2, cards * 0.02);
    const features = this.sampleCardFeatures(element);
    const featureRatio = features.filter(Boolean).length / features.length;
    if (featureRatio >= 0.5) {
      score += 0.2;
      evidence.push({
        signal: "card_commerce_features",
        weight: 0.2,
        value: featureRatio,
        explanation: "Sampled cards contain titles and prices or commerce actions."
      });
    }
    if (context.hasJsonLdType("itemlist")) {
      score += 0.15;
      evidence.push({
        signal: "jsonld_itemlist",
        weight: 0.15,
        value: true,
        explanation: "JSON-LD ItemList markup supports a listing page."
      });
    }
    if (element.querySelector('nav[class*="pagination" i], a[href*="page="]')) {
      score += 0.08;
      evidence.push({
        signal: "pagination",
        weight: 0.08,
        value: true,
        explanation: "Pagination controls indicate a listing page."
      });
    }
    if (score < context.options.minConfidence) {
      return null;
    }
    return this.candidate({
      context,
      detectorId: this.id,
      kind: "product_listing",
      element,
      score,
      evidence,
      metadata: { cardCount: cards }
    });
  }
  findCards(element) {
    let found = 0;
    for (const selector of CARD_SELECTORS) {
      const matches = element.querySelectorAll(selector).length;
      if (matches > found) found = matches;
    }
    if (found >= 2) return found;
    const grid = element.querySelector(
      [":root > * > * > *", ":root > * > *", ":root > *"].join(", ")
    );
    if (!grid) return found;
    const siblings = Array.from(grid.parentElement?.children ?? []);
    if (siblings.length >= 3) {
      const tags = new Set(siblings.map((sibling) => sibling.tagName.toLowerCase()));
      if (tags.size <= 2) return siblings.length;
    }
    return found;
  }
  sampleCardFeatures(element) {
    const cards = Array.from(
      element.querySelectorAll(CARD_SELECTORS.join(", "))
    ).slice(0, 5);
    const sample = cards.length > 0 ? cards : Array.from(element.children).slice(0, 5);
    return sample.map((card) => {
      const text = card.textContent ?? "";
      const hasTitle = card.querySelector("h1,h2,h3,h4,a") !== null;
      const hasPrice = pricePattern(text);
      return hasTitle && hasPrice;
    });
  }
};

// src/engine/registerCoreDetectors.ts
function createCoreDetectors() {
  return [
    new ProductDetector(),
    new ProductGridDetector(),
    new ArticleDetector(),
    new AiChatDetector(),
    new TableDetector(),
    new ContextDetector()
  ];
}
function registerCoreDetectors(engine2) {
  for (const detector of createCoreDetectors()) {
    engine2.registerDetector(detector);
  }
}

// src/visual/OverlayManager.ts
var KIND_COLOR = {
  article: "#8b5cf6",
  product: "#f59e0b",
  product_listing: "#f97316",
  ai_chat: "#06b6d4",
  table: "#10b981",
  list: "#6366f1",
  input: "#ec4899",
  composer: "#14b8a6",
  bar: "#64748b",
  panel: "#a855f7",
  action: "#ef4444",
  text: "#94a3b8",
  navigation: "#0ea5e9",
  breadcrumb: "#84cc16",
  form: "#f43f5e",
  media: "#22c55e",
  generic: "#9ca3af"
};
var HOST_ID = "tabwize-overlay-host";
var OverlayManager = class {
  shadowHost = null;
  shadowRoot = null;
  activeMenu = null;
  inspectOptions = {};
  // Inspect mode state
  hoverBox = null;
  selectedBox = null;
  currentHoveredElement = null;
  // Event handlers bound to instance
  boundMouseMove = null;
  boundClick = null;
  boundScroll = null;
  constructor() {
    this.initShadowDOM();
  }
  initShadowDOM() {
    if (document.getElementById(HOST_ID)) return;
    this.shadowHost = document.createElement("div");
    this.shadowHost.id = HOST_ID;
    this.shadowHost.style.position = "absolute";
    this.shadowHost.style.top = "0";
    this.shadowHost.style.left = "0";
    this.shadowHost.style.width = "100%";
    this.shadowHost.style.height = "100%";
    this.shadowHost.style.pointerEvents = "none";
    this.shadowHost.style.zIndex = "2147483647";
    this.shadowRoot = this.shadowHost.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = `
      <style>
        .highlight-box {
          position: absolute;
          border: 2px solid #3b82f6;
          background: rgba(59, 130, 246, 0.08);
          border-radius: 6px;
          pointer-events: auto;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .highlight-box:hover {
          background: rgba(59, 130, 246, 0.18);
          border-color: #2563eb;
        }
        .badge {
          position: absolute;
          top: -12px;
          left: 10px;
          background: #2563eb;
          color: white;
          font-family: system-ui, -apple-system, sans-serif;
          font-size: 11px;
          font-weight: 600;
          padding: 2px 8px;
          border-radius: 12px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.15);
        }
        .context-menu {
          position: fixed;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1);
          padding: 6px;
          width: 220px;
          font-family: system-ui, -apple-system, sans-serif;
          pointer-events: auto;
        }
        .menu-item {
          width: 100%;
          text-align: left;
          padding: 6px 10px;
          font-size: 12px;
          color: #334155;
          border: none;
          background: transparent;
          cursor: pointer;
          border-radius: 4px;
        }
        .menu-item:hover {
          background: #f1f5f9;
          color: #2563eb;
        }
        .inspect-hover {
          position: absolute;
          border: 2px dashed #f59e0b;
          background: rgba(245, 158, 11, 0.1);
          pointer-events: none;
          transition: all 0.05s ease;
          border-radius: 4px;
        }
        .inspect-selected {
          position: absolute;
          border: 2px solid #10b981;
          background: rgba(16, 185, 129, 0.12);
          pointer-events: none;
          border-radius: 4px;
          box-shadow: 0 0 0 1px rgba(16, 185, 129, 0.3);
        }
        .inspect-label {
          position: absolute;
          top: -20px;
          left: 0;
          background: #f59e0b;
          color: white;
          font-family: system-ui, -apple-system, sans-serif;
          font-size: 10px;
          font-weight: 600;
          padding: 1px 6px;
          border-radius: 4px;
          white-space: nowrap;
        }
        .inspect-label.selected {
          background: #10b981;
        }
      </style>
      <div id="overlay-container"></div>
    `;
    document.body.appendChild(this.shadowHost);
  }
  setMode(mode, options = {}) {
    this.inspectOptions = options;
    if (mode === "inspect" || mode === "edit") {
      this.enableInspectMode();
    } else {
      this.disableInspectMode();
    }
  }
  enableInspectMode() {
    this.disableInspectMode();
    this.boundMouseMove = (e) => {
      this.handleInspectMouseMove(e);
    };
    this.boundClick = (e) => {
      this.handleInspectClick(e);
    };
    this.boundScroll = () => {
      this.updateInspectOverlays();
    };
    document.addEventListener("mousemove", this.boundMouseMove, true);
    document.addEventListener("click", this.boundClick, true);
    window.addEventListener("scroll", this.boundScroll, true);
    window.addEventListener("resize", this.boundScroll);
  }
  disableInspectMode() {
    if (this.boundMouseMove) {
      document.removeEventListener("mousemove", this.boundMouseMove, true);
      this.boundMouseMove = null;
    }
    if (this.boundClick) {
      document.removeEventListener("click", this.boundClick, true);
      this.boundClick = null;
    }
    if (this.boundScroll) {
      window.removeEventListener("scroll", this.boundScroll, true);
      window.removeEventListener("resize", this.boundScroll);
      this.boundScroll = null;
    }
    this.removeHoverBox();
    this.removeSelectedBox();
    this.currentHoveredElement = null;
  }
  handleInspectMouseMove(e) {
    if (e.target?.closest(`#${HOST_ID}`)) {
      this.removeHoverBox();
      return;
    }
    const element = document.elementFromPoint(e.clientX, e.clientY);
    if (!element || element === document.body || element === document.documentElement) {
      this.removeHoverBox();
      this.currentHoveredElement = null;
      if (this.inspectOptions.onElementHover) {
        this.inspectOptions.onElementHover(null, null);
      }
      return;
    }
    if (element.closest(`#${HOST_ID}`)) {
      this.removeHoverBox();
      return;
    }
    if (element !== this.currentHoveredElement) {
      this.currentHoveredElement = element;
      this.showHoverBox(element);
      if (this.inspectOptions.onElementHover) {
        this.inspectOptions.onElementHover(element, this.getElementInfo(element));
      }
    } else {
      this.updateHoverBoxPosition(element);
    }
  }
  handleInspectClick(e) {
    if (e.target?.closest(`#${HOST_ID}`)) {
      return;
    }
    const element = document.elementFromPoint(e.clientX, e.clientY);
    if (!element || element === document.body || element === document.documentElement) {
      return;
    }
    if (element.closest(`#${HOST_ID}`)) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    this.showSelectedBox(element);
    if (this.inspectOptions.onElementSelect) {
      this.inspectOptions.onElementSelect(element, this.getElementInfo(element));
    }
  }
  showHoverBox(element) {
    this.removeHoverBox();
    const container = this.shadowRoot?.querySelector("#overlay-container");
    if (!container) return;
    const rect = element.getBoundingClientRect();
    this.hoverBox = document.createElement("div");
    this.hoverBox.className = "inspect-hover";
    this.hoverBox.style.top = `${rect.top + window.scrollY}px`;
    this.hoverBox.style.left = `${rect.left + window.scrollX}px`;
    this.hoverBox.style.width = `${rect.width}px`;
    this.hoverBox.style.height = `${rect.height}px`;
    const label = document.createElement("div");
    label.className = "inspect-label";
    label.textContent = `${element.tagName.toLowerCase()}${element.id ? "#" + element.id : ""}${element.className && typeof element.className === "string" ? "." + element.className.trim().split(/\s+/)[0] : ""}`;
    this.hoverBox.appendChild(label);
    container.appendChild(this.hoverBox);
  }
  updateHoverBoxPosition(element) {
    if (!this.hoverBox) return;
    const rect = element.getBoundingClientRect();
    this.hoverBox.style.top = `${rect.top + window.scrollY}px`;
    this.hoverBox.style.left = `${rect.left + window.scrollX}px`;
    this.hoverBox.style.width = `${rect.width}px`;
    this.hoverBox.style.height = `${rect.height}px`;
  }
  removeHoverBox() {
    if (this.hoverBox) {
      this.hoverBox.remove();
      this.hoverBox = null;
    }
  }
  showSelectedBox(element) {
    this.removeSelectedBox();
    const container = this.shadowRoot?.querySelector("#overlay-container");
    if (!container) return;
    const rect = element.getBoundingClientRect();
    this.selectedBox = document.createElement("div");
    this.selectedBox.className = "inspect-selected";
    this.selectedBox.style.top = `${rect.top + window.scrollY}px`;
    this.selectedBox.style.left = `${rect.left + window.scrollX}px`;
    this.selectedBox.style.width = `${rect.width}px`;
    this.selectedBox.style.height = `${rect.height}px`;
    const label = document.createElement("div");
    label.className = "inspect-label selected";
    label.textContent = `SELECTED: ${element.tagName.toLowerCase()}`;
    this.selectedBox.appendChild(label);
    container.appendChild(this.selectedBox);
  }
  removeSelectedBox() {
    if (this.selectedBox) {
      this.selectedBox.remove();
      this.selectedBox = null;
    }
  }
  updateInspectOverlays() {
    if (this.currentHoveredElement && this.hoverBox) {
      this.updateHoverBoxPosition(this.currentHoveredElement);
    }
  }
  getElementInfo(element) {
    return {
      tagName: element.tagName.toLowerCase(),
      id: element.id,
      className: typeof element.className === "string" ? element.className : "",
      textContent: (element.textContent || "").trim().substring(0, 100),
      attributes: Array.from(element.attributes).map((attr) => ({
        name: attr.name,
        value: attr.value
      })),
      selector: this.generateSelector(element)
    };
  }
  generateSelector(element) {
    if (element.id) return `#${element.id}`;
    const path = [];
    let current = element;
    while (current && current.nodeType === 1 && path.length < 6) {
      let selector = current.tagName.toLowerCase();
      if (current.className && typeof current.className === "string") {
        const classes = current.className.trim().split(/\s+/).filter((c) => c && !c.match(/^[0-9]/));
        if (classes.length > 0) {
          selector += "." + classes.slice(0, 2).join(".");
        }
      }
      path.unshift(selector);
      current = current.parentElement;
    }
    return path.join(" > ");
  }
  highlightElement(selector) {
    try {
      const element = document.querySelector(selector);
      if (element) {
        this.showSelectedBox(element);
        element.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    } catch (e) {
      console.error("Failed to highlight element", e);
    }
  }
  clearSelection() {
    this.removeSelectedBox();
  }
  render(items, options = {}) {
    this.clear();
    const container = this.shadowRoot?.querySelector("#overlay-container");
    if (!container) return;
    items.forEach((item) => {
      if (!item.element) return;
      const rect = item.element.getBoundingClientRect();
      const color = KIND_COLOR[item.kind] ?? "#3b82f6";
      const box = document.createElement("div");
      box.className = "highlight-box";
      box.style.borderColor = color;
      box.style.background = color + "14";
      box.style.top = `${rect.top + window.scrollY}px`;
      box.style.left = `${rect.left + window.scrollX}px`;
      box.style.width = `${rect.width}px`;
      box.style.height = `${rect.height}px`;
      const badge = document.createElement("div");
      badge.className = "badge";
      badge.style.background = color;
      badge.textContent = `${item.kind} \xB7 ${item.llmContext.title || ""}`.trim();
      box.appendChild(badge);
      const toolbar = document.createElement("div");
      toolbar.style.position = "absolute";
      toolbar.style.top = "-34px";
      toolbar.style.left = "0px";
      toolbar.style.display = "flex";
      toolbar.style.alignItems = "center";
      toolbar.style.gap = "10px";
      toolbar.style.maxWidth = "100%";
      toolbar.style.padding = "6px 10px";
      toolbar.style.background = "#ffffff";
      toolbar.style.color = "#0f172a";
      toolbar.style.fontSize = "13px";
      toolbar.style.fontWeight = "600";
      toolbar.style.border = "1px solid #e2e8f0";
      toolbar.style.borderRadius = "10px 10px 0 0";
      toolbar.style.boxShadow = "0 4px 12px rgba(15,23,42,0.08)";
      toolbar.style.fontFamily = "system-ui, -apple-system, sans-serif";
      toolbar.innerHTML = `<span style="display:inline-flex;align-items:center;justify-content:center;min-width:26px;height:22px;padding:0 6px;border-radius:6px;background:${color};color:#fff;font-size:11px;font-weight:700;">T1</span><span style="font-weight:600;white-space:nowrap;">${item.kind}</span><span style="color:#64748b;font-size:12px;white-space:nowrap;">detected</span>`;
      box.appendChild(toolbar);
      box.addEventListener("click", (e) => {
        e.stopPropagation();
        this.showContextMenu(e.clientX, e.clientY, item);
        if (options.onNodeSelect) options.onNodeSelect(item);
      });
      container.appendChild(box);
    });
  }
  showContextMenu(x, y, node) {
    this.closeContextMenu();
    const container = this.shadowRoot?.querySelector("#overlay-container");
    if (!container) return;
    const menu = document.createElement("div");
    menu.className = "context-menu";
    menu.style.top = `${y}px`;
    menu.style.left = `${x}px`;
    menu.innerHTML = `
      <button class="menu-item" id="copy-md">\u{1F4CB} Copy LLM Markdown</button>
      <button class="menu-item" id="copy-json">\u{1F4E6} Copy JSON Data</button>
    `;
    menu.querySelector("#copy-md")?.addEventListener("click", () => {
      navigator.clipboard.writeText(node.markdown);
      this.closeContextMenu();
    });
    menu.querySelector("#copy-json")?.addEventListener("click", () => {
      navigator.clipboard.writeText(JSON.stringify(node.llmContext, null, 2));
      this.closeContextMenu();
    });
    container.appendChild(menu);
    this.activeMenu = menu;
  }
  closeContextMenu() {
    if (this.activeMenu) {
      this.activeMenu.remove();
      this.activeMenu = null;
    }
  }
  clear() {
    const container = this.shadowRoot?.querySelector("#overlay-container");
    if (container) container.innerHTML = "";
    this.closeContextMenu();
  }
  destroy() {
    this.disableInspectMode();
    if (this.shadowHost && this.shadowHost.parentNode) {
      this.shadowHost.parentNode.removeChild(this.shadowHost);
    }
  }
};

// src/schema/SchemaStorage.ts
var SchemaStorage = class {
  static STORAGE_KEY = "tabwize_extraction_schemas";
  static getAll() {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }
  static async getAllAsync() {
    try {
      if (typeof chrome !== "undefined" && chrome.storage?.local) {
        const result = await chrome.storage.local.get(this.STORAGE_KEY);
        return result[this.STORAGE_KEY] || [];
      }
      const data = localStorage.getItem(this.STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }
  static async save(schema) {
    const schemas = await this.getAllAsync();
    const index = schemas.findIndex((s) => s.id === schema.id);
    schema.updatedAt = Date.now();
    if (index >= 0) {
      schemas[index] = schema;
    } else {
      schema.createdAt = schema.createdAt || Date.now();
      schemas.push(schema);
    }
    try {
      if (typeof chrome !== "undefined" && chrome.storage?.local) {
        await chrome.storage.local.set({ [this.STORAGE_KEY]: schemas });
      } else {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(schemas));
      }
    } catch (e) {
      console.error("Failed to save schema", e);
    }
  }
  static async delete(id) {
    const schemas = await this.getAllAsync();
    const filtered = schemas.filter((s) => s.id !== id);
    try {
      if (typeof chrome !== "undefined" && chrome.storage?.local) {
        await chrome.storage.local.set({ [this.STORAGE_KEY]: filtered });
      } else {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(filtered));
      }
    } catch (e) {
      console.error("Failed to delete schema", e);
    }
  }
  static async getForPage(domain, url, pageType) {
    const schemas = await this.getAllAsync();
    const scored = schemas.map((schema) => {
      let score = 0;
      if (schema.domain && domain && schema.domain === domain) score += 3;
      if (schema.urlPattern && url && schema.urlPattern.length <= 256) {
        try {
          if (new RegExp(schema.urlPattern).test(url)) score += 4;
        } catch {
        }
      }
      if (schema.pageType && pageType && schema.pageType === pageType) score += 1;
      if (schema.source === "manual" && (!schema.domain || schema.domain === domain)) score += 0.5;
      return { schema, score };
    }).filter((entry) => entry.score > 0).sort((a, b) => b.score - a.score);
    return scored.map((entry) => entry.schema);
  }
  static createAutoSchema(name, pageType, domain, region) {
    return {
      id: `auto_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name,
      source: "auto",
      pageType,
      domain,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      targetSelector: region.selector,
      targetNodeId: region.nodeId,
      regionKind: region.kind,
      fields: this.getDefaultFieldsForType(pageType),
      format: "llm-context"
    };
  }
  static createManualSchema(name, element, pageType, domain) {
    const selector = this.generateSelector(element);
    return {
      id: `manual_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name,
      source: "manual",
      pageType,
      domain,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      targetSelector: selector,
      fields: [
        { name: "content", type: "html", required: true }
      ],
      format: "markdown"
    };
  }
  static getDefaultFieldsForType(pageType) {
    switch (pageType) {
      case "article":
      case "blog_index":
        return [
          { name: "title", type: "text" },
          { name: "author", type: "text" },
          { name: "date", type: "text" },
          { name: "content", type: "html" }
        ];
      case "product_detail":
      case "product_listing":
        return [
          { name: "title", type: "text" },
          { name: "price", type: "text" },
          { name: "description", type: "html" },
          { name: "images", type: "list" }
        ];
      case "documentation":
      case "news_article":
        return [
          { name: "messages", type: "list" }
        ];
      default:
        return [
          { name: "content", type: "html" }
        ];
    }
  }
  static generateSelector(element) {
    if (element.id) return `#${element.id}`;
    const path = [];
    let current = element;
    while (current && current.nodeType === 1 && path.length < 5) {
      let selector = current.tagName.toLowerCase();
      if (current.className && typeof current.className === "string") {
        const classes = current.className.trim().split(/\s+/).filter((c) => c && !c.match(/^[0-9]/));
        if (classes.length > 0) {
          selector += "." + classes.slice(0, 2).join(".");
        }
      }
      path.unshift(selector);
      current = current.parentElement;
    }
    return path.join(" > ");
  }
};

// extension/content.ts
console.log("CONTENT SCRIPT LOADED", location.href);
var engine = new ExtractorEngine();
registerCoreDetectors(engine);
var overlays = new OverlayManager();
var currentPageInfo = null;
var currentSchemas = [];
var lastDetection = null;
async function autoDetectOnLoad() {
  try {
    const contextBuilder = new ContextBuilder();
    const context = await contextBuilder.build(document.body);
    currentPageInfo = {
      url: window.location.href,
      domain: window.location.hostname,
      title: document.title,
      pageType: context.classifier?.classify(context, []).pageType || "unknown",
      classification: null
    };
    const { PageClassifier: PageClassifier2 } = await Promise.resolve().then(() => (init_PageClassifier(), PageClassifier_exports));
    const classifier = new PageClassifier2();
    const classification = classifier.classify(context, []);
    currentPageInfo.classification = classification;
    currentPageInfo.pageType = classification.pageType;
    currentSchemas = await SchemaStorage.getForPage(currentPageInfo.domain, currentPageInfo.url, currentPageInfo.pageType);
    if (classification.pageType === "article" || classification.pageType === "news_article") {
      const articleRegions = context.getRegion("article");
      if (articleRegions.length > 0) {
        const hasAutoSchema = currentSchemas.some((s) => s.source === "auto" && s.domain === currentPageInfo.domain);
        if (!hasAutoSchema) {
          const schema = SchemaStorage.createAutoSchema(
            `Article - ${currentPageInfo.domain}`,
            currentPageInfo.pageType,
            currentPageInfo.domain,
            articleRegions[0]
          );
          await SchemaStorage.save(schema);
          currentSchemas.push(schema);
        }
      }
    }
    try {
      const det = await engine.extract(document.body);
      lastDetection = det;
      overlays.render(det.extractions, {
        onNodeSelect: (item) => {
          chrome.runtime.sendMessage({ action: "NODE_SELECTED_IN_PAGE", payload: item }).catch(() => {
          });
        }
      });
      const __h = document.getElementById("tabwize-overlay-host");
      if (__h) __h.textContent = "OVERLAYS:" + (det.extractions?.length || 0);
      overlays.setMode("inspect", {
        onElementHover: (element, info) => {
          chrome.runtime.sendMessage({ action: "ELEMENT_HOVER", payload: { element: info } }).catch(() => {
          });
        },
        onElementSelect: (element, info) => {
          chrome.runtime.sendMessage({ action: "ELEMENT_SELECTED", payload: { element: info } }).catch(() => {
          });
        }
      });
    } catch (e) {
      console.error("Detection failed", e);
    }
    chrome.runtime.sendMessage({
      action: "PAGE_INFO_UPDATED",
      payload: {
        pageInfo: currentPageInfo,
        schemas: currentSchemas
      }
    }).catch(() => {
    });
  } catch (e) {
    console.error("Auto-detect failed", e);
  }
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    setTimeout(autoDetectOnLoad, 3e3);
    setTimeout(autoDetectOnLoad, 6e3);
  });
} else {
  setTimeout(autoDetectOnLoad, 3e3);
  setTimeout(autoDetectOnLoad, 6e3);
}
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === "RUN_DETECTION") {
    engine.extract(document.body).then((result) => {
      const items = result.extractions;
      overlays.render(items, {
        onNodeSelect: (item) => {
          chrome.runtime.sendMessage({
            action: "NODE_SELECTED_IN_PAGE",
            payload: item
          }).catch(() => {
          });
        }
      });
      const serializable = items.map((item) => ({
        kind: item.kind,
        nodeId: item.nodeId,
        confidence: item.confidence,
        markdown: item.markdown,
        llmContext: item.llmContext
      }));
      lastDetection = result;
      const __h2 = document.getElementById("tabwize-overlay-host");
      if (__h2) __h2.textContent = "OVERLAYS:" + (result.extractions?.length || 0);
      sendResponse({ success: true, nodes: serializable, result });
    }).catch((error) => {
      sendResponse({ success: false, error: String(error) });
    });
    return true;
  }
  if (request.action === "CLEAR_OVERLAYS") {
    overlays.clear();
    sendResponse({ success: true });
    return true;
  }
  if (request.action === "SET_MODE") {
    console.log("SET_MODE received", request.mode);
    const mode = request.mode || "default";
    if (mode === "inspect" || mode === "edit") {
      if (lastDetection) overlays.render(lastDetection.extractions, { onNodeSelect: (item) => {
        chrome.runtime.sendMessage({ action: "NODE_SELECTED_IN_PAGE", payload: item }).catch(() => {
        });
      } });
      console.log("enabling inspect mode");
      overlays.setMode("inspect", {
        onElementHover: (element, info) => {
          chrome.runtime.sendMessage({
            action: "ELEMENT_HOVER",
            payload: { element: info }
          }).catch(() => {
          });
        },
        onElementSelect: (element, info) => {
          chrome.runtime.sendMessage({
            action: "ELEMENT_SELECTED",
            payload: { element: info }
          }).catch(() => {
          });
        }
      });
    } else {
      overlays.setMode("default");
    }
    sendResponse({ success: true });
    return true;
  }
  if (request.action === "GET_PAGE_INFO") {
    sendResponse({
      success: true,
      pageInfo: currentPageInfo,
      schemas: currentSchemas
    });
    return true;
  }
  if (request.action === "GET_DOM_TREE") {
    try {
      const tree = serializeDomTree(document.body, 0, lastDetection);
      sendResponse({ success: true, tree });
    } catch (e) {
      sendResponse({ success: false, error: String(e) });
    }
    return true;
  }
  if (request.action === "HIGHLIGHT_ELEMENT") {
    if (request.selector) {
      overlays.highlightElement(request.selector);
    }
    sendResponse({ success: true });
    return true;
  }
  if (request.action === "CREATE_SCHEMA") {
    const schema = SchemaStorage.createManualSchema(
      request.name || "Custom Schema",
      request.element ? document.querySelector(request.element) || document.body : document.body,
      currentPageInfo?.pageType,
      currentPageInfo?.domain
    );
    if (request.element) {
      schema.targetSelector = request.element;
    }
    SchemaStorage.save(schema).then(() => {
      currentSchemas.push(schema);
      chrome.runtime.sendMessage({
        action: "SCHEMAS_UPDATED",
        payload: { schemas: currentSchemas }
      }).catch(() => {
      });
    });
    sendResponse({ success: true, schema });
    return true;
  }
  if (request.action === "EXTRACT_WITH_SCHEMA") {
    const schema = currentSchemas.find((s) => s.id === request.schemaId);
    if (schema && schema.targetSelector) {
      try {
        const element = document.querySelector(schema.targetSelector);
        if (element) {
          const result = {
            schemaId: schema.id,
            name: schema.name,
            content: element.innerHTML,
            text: element.textContent,
            markdown: convertToMarkdown(element)
          };
          sendResponse({ success: true, result });
        } else {
          sendResponse({ success: false, error: "Element not found" });
        }
      } catch (e) {
        sendResponse({ success: false, error: String(e) });
      }
    } else {
      sendResponse({ success: false, error: "Schema not found" });
    }
    return true;
  }
  return true;
});
function findKind(el, detection) {
  if (!detection) return void 0;
  const items = [...detection.selected || [], ...detection.candidates || []];
  for (const c of items) {
    if (c.element === el) return c.kind;
  }
  return void 0;
}
function serializeDomTree(root, depth = 0, detection = null) {
  if (depth > 6) return null;
  const cand = (detection?.selected || detection?.candidates || []).find((c) => c.element === root);
  const info = {
    tagName: root.tagName.toLowerCase(),
    id: root.id || void 0,
    className: typeof root.className === "string" && root.className.trim() ? root.className.trim() : void 0,
    textContent: (root.textContent || "").trim().substring(0, 60),
    selector: generateSimpleSelector(root),
    kind: findKind(root, detection),
    score: cand ? Math.round((cand.score || 0) * 100) : void 0,
    children: []
  };
  const children = Array.from(root.children).slice(0, 50);
  for (const child of children) {
    if (child.tagName === "SCRIPT" || child.tagName === "STYLE") continue;
    const childTree = serializeDomTree(child, depth + 1, detection);
    if (childTree) {
      info.children.push(childTree);
    }
  }
  return info;
}
function generateSimpleSelector(element) {
  if (element.id) return `#${element.id}`;
  let selector = element.tagName.toLowerCase();
  if (element.className && typeof element.className === "string") {
    const classes = element.className.trim().split(/\s+/).filter((c) => c && !c.match(/^[0-9]/));
    if (classes.length > 0) {
      selector += "." + classes[0];
    }
  }
  return selector;
}
function convertToMarkdown(element) {
  return element.textContent || "";
}
