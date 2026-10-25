# TabWize Data Extractor - Vision & Implementation Plan

## Core Vision

The TabWize Data Extractor is a powerful, flexible, and interactive page data extraction framework with a progressive, multi-stage autodetection approach. The goal is to move beyond simple DOM matching to intelligent page understanding with human-in-the-loop refinement.

## Progressive Auto-Detection Flow

The system follows a hierarchical detection strategy:

1. **Page-Level Classification (First Pass)**
   - Analyze the overall page structure to determine page type/structure
   - Classify as: blog/magazine/news sites, product/e-commerce pages, AI chat interfaces (ChatGPT, Gemini, Claude, etc.), documentation sites, dashboards, forums, landing pages, etc.
   - Use signals: URL patterns, JSON-LD, semantic landmarks, global structure, navigation patterns
   - This classification guides which detection algorithms to prioritize

2. **Type-Specific DOM Element Detection (Second Pass)**
   - Based on page type, run specialized detection strategies
   - **For Articles/Blogs/News (Medium, WordPress, etc.)**: Focus on article body detection - find main content area, byline/author, publish date, headings structure, exclude nav/ads/sidebars/comments
   - **For AI Chat Interfaces (ChatGPT, Gemini, Claude)**: Recognize chat structure - identify conversation history/thread, message containers (user/assistant), response areas, composer/input box, attachments, regenerate/copy buttons
   - **For Product Pages**: Detect product info (title, price, images, variants, add-to-cart), reviews, breadcrumbs
   - **For Product Listings/Grids**: Detect repeated product cards, filters, pagination
   - **For Tables**: Detect data tables (semantic and visual/div-based)

## Interactive Inspection & DOM Tree Mapping

The extension provides an interactive DOM exploration experience similar to browser DevTools Inspector:

### Side Panel Structure
The side panel should be tabbed with the following tabs:

1. **Active Tab / Page Info** - Overview of detected page type, detected regions/elements, confidence scores, extraction results
2. **DOM Tree Map** - Interactive tree view of the page DOM structure, allowing navigation and element selection (like Elements panel in DevTools)
3. **Page Snapshot for LLM** - Cleaned/sanitized page snapshot optimized for LLM consumption (markdown, structured context)
4. **Settings** - Configuration options for detection behavior, confidence thresholds, etc.

### Mode Toggle (Default vs Edit Mode)
At the top of the side panel, a toggle switches between modes:

- **Default Mode**: Clean, non-intrusive UI. No visual overlays on the page. Smooth experience focused on results.
- **Edit Mode**: Interactive inspection mode with visual feedback
  - Key DOM areas are visibly highlighted/outlined when hovered/active
  - Clicked/selected areas get clear contours/borders
  - User can click on page elements to inspect and manually select/discover areas
  - Clicking elements in the DOM Tree Map navigates/highlights corresponding elements on the page
  - Bidirectional linking between side panel tree and page elements

### Interactive Element Discovery
- **Point & Click**: User can manually point to areas they want the framework to discover/extract
- **Visual DOM Mapping**: Real-time visual representation of DOM structure in side panel
- **Element Inspection**: Click elements on page or in tree to see details (tag, classes, attributes, text, computed properties)
- **Custom Region Definition**: Allow users to manually mark regions as specific types (article, chat message, product, etc.) to train/refine detection
- **Navigation**: Tree view should allow expanding/collapsing, searching, jumping to elements on page

## Technical Requirements

### Engine Enhancements Needed
- **Progressive Detection API**: Separate page classification from element detection, allow running them as distinct steps
- **Interactive Context**: Support manual region marking, user feedback incorporation
- **DOM Tree Serialization**: Generate interactive tree representation of normalized DOM for side panel
- **Visual Overlay System**: Enhanced overlay manager for edit/inspect mode with hover states, selection states, click handlers
- **Bidirectional Communication**: Robust messaging between content script, background, and side panel for element selection/highlighting

### Extension UI Enhancements Needed
- **Tabbed Interface**: Implement proper tab switching in sidepanel.html/ts
- **Mode Toggle**: Add toggle switch UI component
- **DOM Tree Viewer**: Build/render interactive tree component with expand/collapse, selection
- **Element Highlighting**: Content script must handle hover/inspect modes, highlight elements on mouseover in edit mode
- **Click-to-Inspect**: In edit mode, clicking elements should select them and notify side panel
- **Visual Feedback**: CSS for outlines, overlays, tooltips showing element info

### Content Script Capabilities
- Enter/exit inspect/edit mode
- Highlight elements on hover
- Select elements on click (in inspect mode)
- Draw persistent outlines for selected/marked regions
- Communicate element details to side panel
- Support navigation from tree to element (scroll into view, highlight)

## Implementation Phases

### Phase 1: UI Foundation
- Redesign sidepanel.html with tabbed layout (Page Info, DOM Tree, LLM Snapshot, Settings)
- Add mode toggle (Default/Edit) at top
- Style system for tabs and toggle

### Phase 2: Interactive DOM Tree
- Serialize normalized DOM to tree structure for side panel
- Build interactive tree viewer component
- Implement expand/collapse, selection
- Add bidirectional sync (tree click -> highlight on page, page hover/click -> tree selection)

### Phase 3: Inspect/Edit Mode
- Enhance OverlayManager for inspect mode (hover highlights, selection outlines)
- Content script: listen for mode changes, implement hover/click handlers
- Add visual styles for different states (hover, selected, detected)
- Click-to-inspect functionality

### Phase 4: Progressive Detection Integration
- Expose page classification separately from full extraction
- Update side panel to show page type first, then detected elements by category
- Allow triggering type-specific detection after classification
- Support manual region marking and refinement

### Phase 5: Polish & UX
- Smooth transitions between modes
- Keyboard shortcuts
- Better element info display
- Tree search/filter
- Performance optimization for large DOMs

## Current State vs Target

**Current:** Basic detection runs on button click, overlays are rendered, results shown as JSON in side panel. Single view.

**Target:** Progressive autodetection with page-type first, interactive inspect mode, DOM tree navigation (DevTools-like), tabbed UI, visual element exploration, manual refinement capabilities.

## Clarification: Progressive Auto-Detection + Reusable Extraction Schemas

### On Page Load
1. **Page Type Detection First** - As soon as the page loads, the engine determines the site/page type (blog/magazine/news, product page, AI chat, etc.)
2. **Apply Relevant Algorithms** - Based on detected page type, apply the corresponding pattern detection algorithms automatically
3. **Display in First Tab** - The first tab shows page info: site name, page type, URL/domain, detected structure, etc.

### Extraction Schemas (Reusable Shortcuts)
The first tab displays a list of **predefined and reusable extraction schemas/shortcuts**:

- **Auto-created schemas** - When autodetection successfully identifies an article on a blog/news site, it automatically creates a reusable schema (e.g., "Article Extraction") that can be reused
- **Manually created schemas** - Users can create custom schemas for any page/region

### Manual Creation Workflow (When Autodetection Fails)
If autodetection fails to detect the article area (common on custom themes/layouts):

1. **Activate Edit/Inspect Mode** - User toggles to edit mode via the toggle at top of side panel
2. **Explore with DOM Tree Map** - User uses the DOM Tree Map tab to navigate and inspect the page structure (like DevTools Elements panel)
3. **Find & Select Desired Area** - User visually inspects, finds the article/content area on the page or in the tree, and selects it
4. **Configure & Register Schema** - In edit mode/side panel, user configures the extraction schema (e.g., name it "Article Extraction", define fields like title, author, date, body)
5. **Save as Reusable Shortcut** - Schema is saved/registered and appears in the first tab's list of extraction schemas

### Reuse on Subsequent Visits
- Next time the agent visits the same site/page pattern, the saved schema appears as a shortcut in the first tab
- User can click the shortcut to extract using that saved schema
- Schemas can be site-specific or pattern-based for reuse across similar pages

### Schema Structure
Each schema should store:
- Schema name/label
- Page type/domain/pattern it applies to
- Target selector/region definition (stable selector, node path, or DOM signature)
- Field mappings (what to extract: title, content, author, etc.)
- Extraction template/format
- Creation source (auto vs manual)

---

## Updated Vision (Oct 2026)

### 1. Rich DOM Autodetection

The detection system must be broad and deep, covering every meaningful UI surface, not only articles/products/chats/tables. Detectors and region kinds should be extended to recognize:

- **Text surfaces**: paragraphs, headings, inline text, blockquotes, code blocks, captions, labels, tooltips.
- **Tables**: semantic `<table>` and visual/div-based grids, including headers, rows, cells, footers, sortable columns, pagination.
- **Lists**: ordered/unordered lists, definition lists, nested lists, menu lists, option lists.
- **Input & entry fields**: text inputs, textareas, contenteditable, search boxes, password fields, number/date pickers, selects, checkboxes, radios, toggles, sliders.
- **Composers**: chat/message composers, rich-text editors, comment boxes, reply forms, with send/submit controls.
- **Bars & navigation**: top bars, app bars, toolbars, tab bars, breadcrumbs, sidebars, drawers, nav menus, footer bars, status bars.
- **Panels & containers**: side panels, modals, dialogs, drawers, cards, accordions, tabs/panels, split views, resizable regions.
- **Media**: images, videos, audio, galleries, carousels, avatars, icons.
- **Data display**: badges, chips, tags, progress, stats, KPIs, charts placeholders, empty states, loading skeletons.
- **Actions**: buttons, links, icon buttons, FABs, dropdown triggers, context menus.

Each detected element/region must carry stable selectors, DOM paths, roles, accessible names, and confidence, enabling reliable schema creation and reuse across visits.

### 2. Edit-Mode Visuals & Icons

Edit/inspect mode must provide smooth, clear, non-intrusive visuals that make element recognition instant:

- Color-coded outlines per element kind (text, input, table, list, nav, panel, media, action) with consistent icon badges.
- Hover highlight with a floating tooltip showing tag, role, classes, selector, confidence, and detected kind.
- Selection state with persistent contour, glow, and a small action chip (select, mark as field, copy selector).
- Lightweight animations (fade/scale) for hover/selection transitions; no layout shift.
- Icon set (SVG) for each kind, rendered both on-page overlays and in the side panel tree.
- Distinct states for detected (auto), manually marked, and excluded regions.

### 3. Interactive DOM Map (DevTools-like)

The DOM Tree tab must become a full interactive explorer comparable to browser DevTools Elements panel:

- Virtualized, lazy-rendered tree for large DOMs with expand/collapse, depth controls, and search/filter (tag, text, selector, role).
- Bidirectional sync: tree selection highlights/scrolls the page element; page hover/click updates tree selection.
- Inline element details panel: attributes, computed styles (subset), box model, text, child count, selector.
- Context actions: copy selector/XPath, reveal in page, mark region type, create schema from selection, exclude subtree.
- Breadcrumb path bar, parent traversal, and quick jump to detected regions.
- Keyboard navigation (arrows, Enter, Escape) and shortcuts for mode toggling and inspection.
- Persist expanded/collapsed state and selected node across tab switches.

### 4. Schema Creation UX

- One-click "Create schema from selection" in edit mode, pre-filled with detected kind and field mappings.
- Visual confirmation and editable field list before saving.
- Schema list in first tab with run/edit/delete/duplicate actions and last-run status.
- Auto-created schemas clearly badged; manual schemas editable.

### 5. Progressive Detection & Performance

- Page type first, then type-prioritized detectors; lazy detector loading.
- Incremental re-detection on DOM mutations (debounced) without full re-run.
- Caching of normalized DOM and regions; memory-safe for large pages.
- Smooth 60fps overlays via requestAnimationFrame and CSS transforms.

### 6. Accessibility & Polish

- Keyboard-first operation, ARIA roles, focus management, high-contrast mode.
- Reduced-motion support.
- Consistent theming (light/dark) for side panel.

This updated vision supersedes the Phase 1–5 plan above and becomes the target for implementation.

---

## Inspiration from Prior Build (`tabwize-data-extractor`)

The following proven patterns from the earlier build should be adapted (not copied) into this engine:

### Autodetection Patterns
- **Semantic landmark tree** (`pageStructure.ts`): Build a semantic tree of landmarks (header/nav/main/aside/footer) with typed nodes (record_list, table, article, headings, form, pagination, links). Noise nodes flagged for default collapse; every node maps back to a live Element for hover/select sync.
- **Entity detectors** (`entityDetectors.ts`): Surface data points (phone, email, social, address, structured/JSON-LD/OG/meta) with source attribution and confidence; precision over recall.
- **Page features & classifier** (`pageFeatures.ts`, `pageClassifier.ts`): Feature-based page typing to prioritize detectors.
- **Record mining & clustering** (`mdr.ts`, `recordClustering.ts`, `repetition.ts`): Detect repeating records/record lists and cluster them; pattern binder matches against builtin patterns.
- **Table detection** (`tableDetector.ts`, `tableResolver.ts`, `tableSelector.ts`): Semantic + visual/div tables, quality scores, selector generation.
- **DOM visibility** (`domVisibility.ts`): Visibility gating for detection.
- **Selector generation** (`selectorBuilder.ts`, `selectorGeneration.ts`): Stable selectors with healing support (`recipeHealing.ts`).
- **Dynamic capture** (`dynamicCapture.ts`, `expansion.ts`, `scrollDriver.ts`, `paginationCapture.ts`): Scroll/pagination/expansion handling for lazy content.

### Visuals & Overlays (from `contentStyles.css`)
- Kind color-coded outlines (blue detect, green selected) with outline-offset and subtle background tint.
- Floating selection panel with options and close; toast notifications (error variant).
- Toolbar/bar with nav arrows, chips, labels, meta, action buttons, column mapper panel, export menu.
- Preview highlighter for hover states (`edit-ui/previewHighlighter.ts`).
- Checkbox styling and column-mapping rows for schema field configuration.

### UI Structure
- Side panel tabs (Page Info, DOM Tree/Structure, LLM Snapshot, Settings) with collapsible sections.
- Structure panel rendering the semantic landmark tree with bidirectional element sync.
- Table tabs, quality badges, extraction progress meter, column mapping with bulk actions.

These should inform the richer DOM map, edit-mode visuals, and autodetection breadth in this repo.
