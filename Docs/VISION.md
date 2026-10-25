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
