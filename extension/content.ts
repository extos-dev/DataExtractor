import { ExtractorEngine } from '../src/engine/ExtractionEngine';
import { registerCoreDetectors } from '../src/engine/registerCoreDetectors';
import { OverlayManager } from '../src/visual/OverlayManager';
import { ExtractionResultItem } from '../src/extraction/types';
import { SchemaStorage } from '../src/schema/SchemaStorage';
import { ContextBuilder } from '../src/detection/DetectionContext';

const engine = new ExtractorEngine();
registerCoreDetectors(engine);

const overlays = new OverlayManager();

// Store current page info and schemas
let currentPageInfo: any = null;
let currentSchemas: any[] = [];
let lastDetection: any = null;

// Auto-detect page type on load
async function autoDetectOnLoad() {
  try {
    const contextBuilder = new ContextBuilder();
    const context = await contextBuilder.build(document.body as HTMLElement);
    
    currentPageInfo = {
      url: window.location.href,
      domain: window.location.hostname,
      title: document.title,
      pageType: context.classifier?.classify(context, []).pageType || 'unknown',
      classification: null
    };
    
    // Run full classification
    const { PageClassifier } = await import('../src/classification/PageClassifier');
    const classifier = new PageClassifier();
    const classification = classifier.classify(context, []);
    currentPageInfo.classification = classification;
    currentPageInfo.pageType = classification.pageType;
    
    // Get schemas for this page
    currentSchemas = await SchemaStorage.getForPage(currentPageInfo.domain, currentPageInfo.url, currentPageInfo.pageType);
    
    // Auto-create schema if article detected successfully
    if (classification.pageType === 'article' || classification.pageType === 'news_article') {
      const articleRegions = context.getRegion('article');
      if (articleRegions.length > 0) {
        // Check if we already have an auto schema for this domain
        const hasAutoSchema = currentSchemas.some(s => s.source === 'auto' && s.domain === currentPageInfo.domain);
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
    
    // Run full detection to render overlays and capture result for DOM map
    try {
      const det = await engine.extract(document.body as HTMLElement);
      lastDetection = det;
      overlays.render(det.extractions, {
        onNodeSelect: (item: any) => {
          chrome.runtime.sendMessage({ action: 'NODE_SELECTED_IN_PAGE', payload: item }).catch(() => {});
        },
      });
    } catch (e) {
      console.error('Detection failed', e);
    }

    // Notify side panel
    chrome.runtime.sendMessage({
      action: 'PAGE_INFO_UPDATED',
      payload: {
        pageInfo: currentPageInfo,
        schemas: currentSchemas
      }
    }).catch(() => {});
  } catch (e) {
    console.error('Auto-detect failed', e);
  }
}

// Run auto-detect after a short delay
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(autoDetectOnLoad, 2000);
  setTimeout(autoDetectOnLoad, 4000);
  });
} else {
  setTimeout(autoDetectOnLoad, 2000);
  setTimeout(autoDetectOnLoad, 4000);
}

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === 'RUN_DETECTION') {
    engine
      .extract(document.body as HTMLElement)
      .then((result) => {
        const items = result.extractions;

        overlays.render(items, {
          onNodeSelect: (item: ExtractionResultItem) => {
            chrome.runtime.sendMessage({
              action: 'NODE_SELECTED_IN_PAGE',
              payload: item,
            }).catch(() => {});
          },
        });

        const serializable = items.map((item) => ({
          kind: item.kind,
          nodeId: item.nodeId,
          confidence: item.confidence,
          markdown: item.markdown,
          llmContext: item.llmContext,
        }));

        lastDetection = result;
        sendResponse({ success: true, nodes: serializable, result });
      })
      .catch((error) => {
        sendResponse({ success: false, error: String(error) });
      });

    return true;
  }

  if (request.action === 'CLEAR_OVERLAYS') {
    overlays.clear();
    sendResponse({ success: true });
    return true;
  }

  if (request.action === 'SET_MODE') {
    const mode = request.mode || 'default';
    if (mode === 'inspect' || mode === 'edit') {
      if (lastDetection) overlays.render(lastDetection.extractions, { onNodeSelect: (item:any) => { chrome.runtime.sendMessage({ action: 'NODE_SELECTED_IN_PAGE', payload: item }).catch(()=>{}); } });
      overlays.setMode('inspect', {
        onElementHover: (element, info) => {
          chrome.runtime.sendMessage({
            action: 'ELEMENT_HOVER',
            payload: { element: info }
          }).catch(() => {});
        },
        onElementSelect: (element, info) => {
          chrome.runtime.sendMessage({
            action: 'ELEMENT_SELECTED',
            payload: { element: info }
          }).catch(() => {});
        }
      });
    } else {
      overlays.setMode('default');
    }
    sendResponse({ success: true });
    return true;
  }

  if (request.action === 'GET_PAGE_INFO') {
    sendResponse({ 
      success: true, 
      pageInfo: currentPageInfo,
      schemas: currentSchemas
    });
    return true;
  }

  if (request.action === 'GET_DOM_TREE') {
    try {
      const tree = serializeDomTree(document.body, 0, lastDetection);
      sendResponse({ success: true, tree });
    } catch (e) {
      sendResponse({ success: false, error: String(e) });
    }
    return true;
  }

  if (request.action === 'HIGHLIGHT_ELEMENT') {
    if (request.selector) {
      overlays.highlightElement(request.selector);
    }
    sendResponse({ success: true });
    return true;
  }

  if (request.action === 'CREATE_SCHEMA') {
    const schema = SchemaStorage.createManualSchema(
      request.name || 'Custom Schema',
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
        action: 'SCHEMAS_UPDATED',
        payload: { schemas: currentSchemas }
      }).catch(() => {});
    });
    sendResponse({ success: true, schema });
    return true;
  }

  if (request.action === 'EXTRACT_WITH_SCHEMA') {
    // Extract using saved schema
    const schema = currentSchemas.find(s => s.id === request.schemaId);
    if (schema && schema.targetSelector) {
      try {
        const element = document.querySelector(schema.targetSelector);
        if (element) {
          // Simple extraction
          const result = {
            schemaId: schema.id,
            name: schema.name,
            content: element.innerHTML,
            text: element.textContent,
            markdown: convertToMarkdown(element)
          };
          sendResponse({ success: true, result });
        } else {
          sendResponse({ success: false, error: 'Element not found' });
        }
      } catch (e) {
        sendResponse({ success: false, error: String(e) });
      }
    } else {
      sendResponse({ success: false, error: 'Schema not found' });
    }
    return true;
  }

  return true;
});

function findKind(el: Element, detection: any): string | undefined {
  if (!detection) return undefined;
  const items = [...(detection.selected || []), ...(detection.candidates || [])];
  for (const c of items) {
    if (c.element === el) return c.kind;
  }
  return undefined;
}

function serializeDomTree(root: Element, depth = 0, detection: any = null): any {
  if (depth > 6) return null;
  const info = {
    tagName: root.tagName.toLowerCase(),
    id: root.id || undefined,
    className: typeof root.className === 'string' && root.className.trim() ? root.className.trim() : undefined,
    textContent: (root.textContent || '').trim().substring(0, 60),
    selector: generateSimpleSelector(root),
    kind: findKind(root, detection),
    children: [] as any[]
  };
  
  // Only include element children, limit count
  const children = Array.from(root.children).slice(0, 50);
  for (const child of children) {
    if (child.tagName === 'SCRIPT' || child.tagName === 'STYLE') continue;
    const childTree = serializeDomTree(child, depth + 1, detection);
    if (childTree) {
      info.children.push(childTree);
    }
  }
  
  return info;
}

function generateSimpleSelector(element: Element): string {
  if (element.id) return `#${element.id}`;
  let selector = element.tagName.toLowerCase();
  if (element.className && typeof element.className === 'string') {
    const classes = element.className.trim().split(/\s+/).filter(c => c && !c.match(/^[0-9]/));
    if (classes.length > 0) {
      selector += '.' + classes[0];
    }
  }
  return selector;
}

function convertToMarkdown(element: Element): string {
  // Simple conversion
  return element.textContent || '';
}
