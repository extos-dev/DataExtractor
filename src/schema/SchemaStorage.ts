import { ExtractionSchema, SchemaField } from './types';

export class SchemaStorage {
  private static STORAGE_KEY = 'tabwize_extraction_schemas';

  static getAll(): ExtractionSchema[] {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  static async getAllAsync(): Promise<ExtractionSchema[]> {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        const result = await chrome.storage.local.get(this.STORAGE_KEY);
        return result[this.STORAGE_KEY] || [];
      }
      const data = localStorage.getItem(this.STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  static async save(schema: ExtractionSchema): Promise<void> {
    const schemas = await this.getAllAsync();
    const index = schemas.findIndex(s => s.id === schema.id);
    schema.updatedAt = Date.now();
    
    if (index >= 0) {
      schemas[index] = schema;
    } else {
      schema.createdAt = schema.createdAt || Date.now();
      schemas.push(schema);
    }

    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        await chrome.storage.local.set({ [this.STORAGE_KEY]: schemas });
      } else {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(schemas));
      }
    } catch (e) {
      console.error('Failed to save schema', e);
    }
  }

  static async delete(id: string): Promise<void> {
    const schemas = await this.getAllAsync();
    const filtered = schemas.filter(s => s.id !== id);
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        await chrome.storage.local.set({ [this.STORAGE_KEY]: filtered });
      } else {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(filtered));
      }
    } catch (e) {
      console.error('Failed to delete schema', e);
    }
  }

  static async getForPage(domain?: string, url?: string, pageType?: string): Promise<ExtractionSchema[]> {
    const schemas = await this.getAllAsync();
    const scored = schemas
      .map((schema) => {
        let score = 0;
        if (schema.domain && domain && schema.domain === domain) score += 3;
        if (schema.urlPattern && url && schema.urlPattern.length <= 256) {
          try {
            if (new RegExp(schema.urlPattern).test(url)) score += 4;
          } catch {}
        }
        if (schema.pageType && pageType && schema.pageType === pageType) score += 1;
        if (schema.source === 'manual' && (!schema.domain || schema.domain === domain)) score += 0.5;
        return { schema, score };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score);
    return scored.map((entry) => entry.schema);
  }

  static createAutoSchema(name: string, pageType: string, domain: string, region: any): ExtractionSchema {
    return {
      id: `auto_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name,
      source: 'auto',
      pageType,
      domain,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      targetSelector: region.selector,
      targetNodeId: region.nodeId,
      regionKind: region.kind,
      fields: this.getDefaultFieldsForType(pageType),
      format: 'llm-context'
    };
  }

  static createManualSchema(name: string, element: Element, pageType?: string, domain?: string): ExtractionSchema {
    const selector = this.generateSelector(element);
    return {
      id: `manual_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name,
      source: 'manual',
      pageType,
      domain,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      targetSelector: selector,
      fields: [
        { name: 'content', type: 'html', required: true }
      ],
      format: 'markdown'
    };
  }

  private static getDefaultFieldsForType(pageType: string): SchemaField[] {
    switch (pageType) {
      case 'article':
      case 'blog_index':
        return [
          { name: 'title', type: 'text' },
          { name: 'author', type: 'text' },
          { name: 'date', type: 'text' },
          { name: 'content', type: 'html' }
        ];
      case 'product_detail':
      case 'product_listing':
        return [
          { name: 'title', type: 'text' },
          { name: 'price', type: 'text' },
          { name: 'description', type: 'html' },
          { name: 'images', type: 'list' }
        ];
      case 'documentation':
      case 'news_article':
        return [
          { name: 'messages', type: 'list' }
        ];
      default:
        return [
          { name: 'content', type: 'html' }
        ];
    }
  }

  private static generateSelector(element: Element): string {
    if (element.id) return `#${element.id}`;
    const path: string[] = [];
    let current: Element | null = element;
    while (current && current.nodeType === 1 && path.length < 5) {
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
}

