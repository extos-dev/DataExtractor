import { TableData } from './types';

const CELL_SELECTOR = 'td, th, [role=cell], [role=gridcell]';
const ROW_SELECTOR = 'tr, [role=row]';
const HEADER_SELECTOR = 'th, [role=columnheader]';

export class TableExtractor {
  extract(context: {
    element: Element;
    document?: Document;
    jsonLd: unknown[];
    hasJsonLdType: (type: string) => boolean;
  }): { data: TableData } | null {
    const element = context.element;

    const semantic = this.fromSemantic(element);
    if (semantic) return { data: semantic };

    const aria = this.fromAriaRoles(element);
    if (aria) return { data: aria };

    const visual = this.fromVisualRepeat(element);
    if (visual) return { data: visual };

    return null;
  }

  private fromSemantic(element: Element): TableData | null {
    if (element.tagName.toLowerCase() !== 'table') return null;

    const caption =
      element.querySelector('caption')?.textContent?.replace(/\s+/g, ' ').trim() ||
      undefined;

    const headers = Array.from(element.querySelectorAll('th')).map(
      (h) => h.textContent?.replace(/\s+/g, ' ').trim() ?? ''
    );

    const rows = Array.from(element.querySelectorAll('tbody tr, tr'))
      .map((tr) => Array.from(tr.querySelectorAll('td, th')).map(tdToText))
      .filter((cells) => cells.length > 0);

    return this.validate({ caption, headers, rows });
  }

  private fromAriaRoles(element: Element): TableData | null {
    if (element.getAttribute('role')?.toLowerCase() !== 'grid') return null;

    const headers = Array.from(element.querySelectorAll(HEADER_SELECTOR)).map(
      (h) => h.textContent?.replace(/\s+/g, ' ').trim() ?? ''
    );

    const rows = Array.from(element.querySelectorAll(ROW_SELECTOR))
      .map((row) => Array.from(row.querySelectorAll(CELL_SELECTOR)).map(tdToText))
      .filter((cells) => cells.length > 0);

    return this.validate({ headers, rows });
  }

  private fromVisualRepeat(element: Element): TableData | null {
    const groups = [':scope > div', ':scope > ul > li', ':scope > table'];

    for (const groupSelector of groups) {
      const groups = Array.from(element.querySelectorAll(groupSelector));
      if (groups.length < 3) continue;

      const childCounts = groups.map((g) => g.children.length);
      const mode = Math.max(...childCounts);
      const consistent =
        childCounts.filter((count) => count === mode).length / groups.length;

      if (mode < 2 || consistent < 0.7) continue;

      const rows = groups.map((group) =>
        Array.from(group.children).map(tdToText)
      );

      return this.validate({ headers: [], rows });
    }

    return null;
  }

  private validate(data: TableData): TableData | null {
    const { rows } = data;

    const columnCounts = rows.map((row) => row.length);
    const columns = columnCounts[0] ?? 0;

    if (rows.length < 2 || columns < 2) return null;

    const consistent = columnCounts.filter((count) => count === columns).length;
    if (consistent / rows.length < 0.7) return null;

    return { ...data, headers: data.headers, rows };
  }
}

function tdToText(cell: Element): string {
  return cell.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}
