import { ExtractionSchema, SchemaField } from './types';

export interface FieldResult {
  name: string;
  value: unknown;
  matched: boolean;
}

export interface SchemaRunResult {
  schemaId: string;
  name: string;
  targetFound: boolean;
  target?: Element;
  fields: FieldResult[];
  data: Record<string, unknown>;
  diagnostics: {
    fieldsMatched: number;
    fieldsTotal: number;
    missing: string[];
  };
}

export class SchemaRunner {
  static run(schema: ExtractionSchema, root: ParentNode): SchemaRunResult {
    const target = schema.targetSelector
      ? (root.querySelector(schema.targetSelector) as Element | null)
      : (root instanceof Element ? root : (root as Document).body);

    const fields: FieldResult[] = [];
    const data: Record<string, unknown> = {};
    const missing: string[] = [];

    if (target) {
      for (const field of schema.fields) {
        const result = this.extractField(field, target);
        fields.push(result);
        if (result.matched) {
          data[field.name] = result.value;
        } else {
          missing.push(field.name);
        }
      }
    } else {
      for (const field of schema.fields) {
        fields.push({ name: field.name, value: null, matched: false });
        missing.push(field.name);
      }
    }

    const matched = fields.filter((f) => f.matched).length;
    return {
      schemaId: schema.id,
      name: schema.name,
      targetFound: Boolean(target),
      target: target ?? undefined,
      fields,
      data,
      diagnostics: {
        fieldsMatched: matched,
        fieldsTotal: fields.length,
        missing,
      },
    };
  }

  private static extractField(field: SchemaField, target: Element): FieldResult {
    const selector = field.selector;
    const els: Element[] = selector
      ? Array.from(target.querySelectorAll(selector))
      : [target];

    if (els.length === 0) {
      return { name: field.name, value: null, matched: false };
    }

    const values = els.map((el) => this.read(el, field));
    const value = field.type === 'list' ? values : values[0];

    return { name: field.name, value, matched: true };
  }

  private static read(el: Element, field: SchemaField): unknown {
    switch (field.type) {
      case 'text':
        return (el.textContent ?? '').trim();
      case 'html':
        return el.innerHTML;
      case 'markdown':
        return (el.textContent ?? '').trim();
      case 'attribute':
        return field.attribute ? el.getAttribute(field.attribute) : null;
      case 'list':
        return (el.textContent ?? '').trim();
      default:
        return (el.textContent ?? '').trim();
    }
  }
}
