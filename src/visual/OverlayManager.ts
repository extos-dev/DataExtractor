import { ExtractionResultItem } from '../extraction/types';

export interface OverlayOptions {
  onNodeSelect?: (item: ExtractionResultItem) => void;
}

export type OverlayMode = 'default' | 'inspect' | 'edit';

const KIND_COLOR: Record<string, string> = {
  article: '#8b5cf6',
  product: '#f59e0b',
  product_listing: '#f97316',
  ai_chat: '#06b6d4',
  table: '#10b981',
  list: '#6366f1',
  input: '#ec4899',
  composer: '#14b8a6',
  bar: '#64748b',
  panel: '#a855f7',
  action: '#ef4444',
  text: '#94a3b8',
  navigation: '#0ea5e9',
  breadcrumb: '#84cc16',
  form: '#f43f5e',
  media: '#22c55e',
  generic: '#9ca3af',
};

export interface InspectOptions {
  onElementHover?: (element: Element | null, info: any) => void;
  onElementSelect?: (element: Element, info: any) => void;
}

const HOST_ID = 'tabwize-overlay-host';

export class OverlayManager {
  private shadowHost: HTMLElement | null = null;
  private shadowRoot: ShadowRoot | null = null;
  private activeMenu: HTMLElement | null = null;
  private inspectOptions: InspectOptions = {};
  
  // Inspect mode state
  private hoverBox: HTMLElement | null = null;
  private selectedBox: HTMLElement | null = null;
  private currentHoveredElement: Element | null = null;
  
  // Event handlers bound to instance
  private boundMouseMove: ((e: MouseEvent) => void) | null = null;
  private boundClick: ((e: MouseEvent) => void) | null = null;
  private boundScroll: (() => void) | null = null;

  constructor() {
    this.initShadowDOM();
  }

  private initShadowDOM() {
    if (document.getElementById(HOST_ID)) return;

    this.shadowHost = document.createElement('div');
    this.shadowHost.id = HOST_ID;
    this.shadowHost.style.position = 'absolute';
    this.shadowHost.style.top = '0';
    this.shadowHost.style.left = '0';
    this.shadowHost.style.width = '100%';
    this.shadowHost.style.height = '100%';
    this.shadowHost.style.pointerEvents = 'none';
    this.shadowHost.style.zIndex = '2147483647';

    this.shadowRoot = this.shadowHost.attachShadow({ mode: 'open' });
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

  public setMode(mode: OverlayMode, options: InspectOptions = {}) {
    this.inspectOptions = options;
    
    if (mode === 'inspect' || mode === 'edit') {
      this.enableInspectMode();
    } else {
      this.disableInspectMode();
    }
  }

  private enableInspectMode() {
    this.disableInspectMode();
    
    this.boundMouseMove = (e: MouseEvent) => {
      this.handleInspectMouseMove(e);
    };
    this.boundClick = (e: MouseEvent) => {
      this.handleInspectClick(e);
    };
    this.boundScroll = () => {
      this.updateInspectOverlays();
    };
    
    document.addEventListener('mousemove', this.boundMouseMove, true);
    document.addEventListener('click', this.boundClick, true);
    window.addEventListener('scroll', this.boundScroll, true);
    window.addEventListener('resize', this.boundScroll);
  }

  private disableInspectMode() {
    if (this.boundMouseMove) {
      document.removeEventListener('mousemove', this.boundMouseMove, true);
      this.boundMouseMove = null;
    }
    if (this.boundClick) {
      document.removeEventListener('click', this.boundClick, true);
      this.boundClick = null;
    }
    if (this.boundScroll) {
      window.removeEventListener('scroll', this.boundScroll, true);
      window.removeEventListener('resize', this.boundScroll);
      this.boundScroll = null;
    }
    
    this.removeHoverBox();
    this.removeSelectedBox();
    this.currentHoveredElement = null;
  }

  private handleInspectMouseMove(e: MouseEvent) {
    // Don't interfere with overlays
    if ((e.target as HTMLElement)?.closest(`#${HOST_ID}`)) {
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
    
    // Skip our overlay host
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

  private handleInspectClick(e: MouseEvent) {
    if ((e.target as HTMLElement)?.closest(`#${HOST_ID}`)) {
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

  private showHoverBox(element: Element) {
    this.removeHoverBox();
    const container = this.shadowRoot?.querySelector('#overlay-container');
    if (!container) return;
    
    const rect = element.getBoundingClientRect();
    this.hoverBox = document.createElement('div');
    this.hoverBox.className = 'inspect-hover';
    this.hoverBox.style.top = `${rect.top + window.scrollY}px`;
    this.hoverBox.style.left = `${rect.left + window.scrollX}px`;
    this.hoverBox.style.width = `${rect.width}px`;
    this.hoverBox.style.height = `${rect.height}px`;
    
    const label = document.createElement('div');
    label.className = 'inspect-label';
    label.textContent = `${element.tagName.toLowerCase()}${element.id ? '#' + element.id : ''}${element.className && typeof element.className === 'string' ? '.' + element.className.trim().split(/\s+/)[0] : ''}`;
    this.hoverBox.appendChild(label);
    
    container.appendChild(this.hoverBox);
  }

  private updateHoverBoxPosition(element: Element) {
    if (!this.hoverBox) return;
    const rect = element.getBoundingClientRect();
    this.hoverBox.style.top = `${rect.top + window.scrollY}px`;
    this.hoverBox.style.left = `${rect.left + window.scrollX}px`;
    this.hoverBox.style.width = `${rect.width}px`;
    this.hoverBox.style.height = `${rect.height}px`;
  }

  private removeHoverBox() {
    if (this.hoverBox) {
      this.hoverBox.remove();
      this.hoverBox = null;
    }
  }

  private showSelectedBox(element: Element) {
    this.removeSelectedBox();
    const container = this.shadowRoot?.querySelector('#overlay-container');
    if (!container) return;
    
    const rect = element.getBoundingClientRect();
    this.selectedBox = document.createElement('div');
    this.selectedBox.className = 'inspect-selected';
    this.selectedBox.style.top = `${rect.top + window.scrollY}px`;
    this.selectedBox.style.left = `${rect.left + window.scrollX}px`;
    this.selectedBox.style.width = `${rect.width}px`;
    this.selectedBox.style.height = `${rect.height}px`;
    
    const label = document.createElement('div');
    label.className = 'inspect-label selected';
    label.textContent = `SELECTED: ${element.tagName.toLowerCase()}`;
    this.selectedBox.appendChild(label);
    
    container.appendChild(this.selectedBox);
  }

  private removeSelectedBox() {
    if (this.selectedBox) {
      this.selectedBox.remove();
      this.selectedBox = null;
    }
  }

  private updateInspectOverlays() {
    if (this.currentHoveredElement && this.hoverBox) {
      this.updateHoverBoxPosition(this.currentHoveredElement);
    }
  }

  private getElementInfo(element: Element) {
    return {
      tagName: element.tagName.toLowerCase(),
      id: element.id,
      className: typeof element.className === 'string' ? element.className : '',
      textContent: (element.textContent || '').trim().substring(0, 100),
      attributes: Array.from(element.attributes).map(attr => ({
        name: attr.name,
        value: attr.value
      })),
      selector: this.generateSelector(element)
    };
  }

  private generateSelector(element: Element): string {
    if (element.id) return `#${element.id}`;
    const path: string[] = [];
    let current: Element | null = element;
    while (current && current.nodeType === 1 && path.length < 6) {
      let selector = current.tagName.toLowerCase();
      if (current.className && typeof current.className === 'string') {
        const classes = current.className.trim().split(/\s+/).filter(c => c && !c.match(/^[0-9]/));
        if (classes.length > 0) {
          selector += '.' + classes.slice(0, 2).join('.');
        }
      }
      path.unshift(selector);
      current = current.parentElement;
    }
    return path.join(' > ');
  }

  public highlightElement(selector: string) {
    try {
      const element = document.querySelector(selector);
      if (element) {
        this.showSelectedBox(element);
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    } catch (e) {
      console.error('Failed to highlight element', e);
    }
  }

  public clearSelection() {
    this.removeSelectedBox();
  }

  public render(items: ExtractionResultItem[], options: OverlayOptions = {}) {
    this.clear();
    const container = this.shadowRoot?.querySelector('#overlay-container');
    if (!container) return;

    items.forEach((item) => {
      if (!item.element) return;
      const rect = item.element.getBoundingClientRect();

      const color = KIND_COLOR[item.kind] ?? '#3b82f6';
      const box = document.createElement('div');
      box.className = 'highlight-box';
      box.style.borderColor = color;
      box.style.background = color + '14';
      box.style.top = `${rect.top + window.scrollY}px`;
      box.style.left = `${rect.left + window.scrollX}px`;
      box.style.width = `${rect.width}px`;
      box.style.height = `${rect.height}px`;

      const badge = document.createElement('div');
      badge.className = 'badge';
      badge.style.background = color;
      badge.textContent = `${item.kind} · ${item.llmContext.title || ''}`.trim();
      box.appendChild(badge);

      box.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showContextMenu(e.clientX, e.clientY, item);
        if (options.onNodeSelect) options.onNodeSelect(item);
      });

      container.appendChild(box);
    });
  }

  private showContextMenu(x: number, y: number, node: ExtractionResultItem) {
    this.closeContextMenu();
    const container = this.shadowRoot?.querySelector('#overlay-container');
    if (!container) return;

    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.top = `${y}px`;
    menu.style.left = `${x}px`;

    menu.innerHTML = `
      <button class="menu-item" id="copy-md">📋 Copy LLM Markdown</button>
      <button class="menu-item" id="copy-json">📦 Copy JSON Data</button>
    `;

    menu.querySelector('#copy-md')?.addEventListener('click', () => {
      navigator.clipboard.writeText(node.markdown);
      this.closeContextMenu();
    });

    menu.querySelector('#copy-json')?.addEventListener('click', () => {
      navigator.clipboard.writeText(JSON.stringify(node.llmContext, null, 2));
      this.closeContextMenu();
    });

    container.appendChild(menu);
    this.activeMenu = menu;
  }

  public closeContextMenu() {
    if (this.activeMenu) {
      this.activeMenu.remove();
      this.activeMenu = null;
    }
  }

  public clear() {
    const container = this.shadowRoot?.querySelector('#overlay-container');
    if (container) container.innerHTML = '';
    this.closeContextMenu();
  }

  public destroy() {
    this.disableInspectMode();
    if (this.shadowHost && this.shadowHost.parentNode) {
      this.shadowHost.parentNode.removeChild(this.shadowHost);
    }
  }
}
