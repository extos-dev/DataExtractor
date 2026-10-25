import {
  AiChatData,
  ArticleData,
  ExtractionData,
  ListData,
  ProductData,
  TableData,
} from './types';

/**
 * Render typed extraction payloads as LLM-friendly markdown. Sections are
 * emitted in a stable order so downstream consumers can rely on layout.
 */
export class MarkdownFormatter {
  format(kind: string, data: ExtractionData, title: string): string {
    switch (kind) {
      case 'article':
        return this.article(data as ArticleData);
      case 'product':
        return this.product(data as ProductData);
      case 'ai_chat':
        return this.aiChat(data as AiChatData, title);
      case 'table':
        return this.table(data as TableData);
      case 'product_listing':
      case 'list':
        return this.list(data as ListData, title);
      default:
        return `# ${title}\n\n${JSON.stringify(data, null, 2)}`;
    }
  }

  private article(data: ArticleData): string {
    const parts: string[] = [];

    if (data.title) parts.push(`# ${data.title}`);

    const meta = [data.author, data.date].filter(Boolean).join(' · ');
    if (meta) parts.push(`_${meta}_`);

    if (data.description) parts.push(`> ${data.description}`);

    const body: string[] = [];
    for (const heading of data.headings) {
      body.push(`${'#'.repeat(Math.min(6, heading.level))} ${heading.text}`);
    }
    for (const paragraph of data.paragraphs) {
      body.push(paragraph);
    }
    if (body.length > 0) parts.push(body.join('\n\n'));

    if (data.images.length > 0) {
      parts.push(
        data.images.map((src) => `![image](${src})`).join('\n\n')
      );
    }

    return parts.join('\n\n');
  }

  private product(data: ProductData): string {
    const parts: string[] = [];

    parts.push(`# ${data.title ?? 'Product'}`);

    if (data.price) {
      const price = data.currency ? `${data.currency} ${data.price}` : data.price;
      parts.push(`**Price:** ${price}`);
    }
    if (data.availability) parts.push(`**Availability:** ${data.availability}`);
    if (data.brand) parts.push(`**Brand:** ${data.brand}`);
    if (data.sku) parts.push(`**SKU:** ${data.sku}`);

    if (data.rating !== undefined) {
      const reviews = data.reviewCount ? ` (${data.reviewCount} reviews)` : '';
      parts.push(`**Rating:** ${data.rating}${reviews}`);
    }

    if (data.description) parts.push(data.description);

    if (data.images.length > 0) {
      parts.push(
        data.images.map((src) => `![product image](${src})`).join('\n\n')
      );
    }

    return parts.join('\n\n');
  }

  private aiChat(data: AiChatData, fallbackTitle: string): string {
    const header = `# ${data.title ?? fallbackTitle}`;
    const body = data.messages
      .map((message) => `**${message.role}:** ${message.text}`)
      .join('\n\n');

    return `${header}\n\n${body}`;
  }

  private table(data: TableData): string {
    const headers = data.headers.length > 0 ? data.headers : this.inferHeaders(data);

    const lines: string[] = [];
    if (data.caption) lines.push(`**${data.caption}**`, '');

    lines.push(`| ${headers.join(' | ')} |`);
    lines.push(`| ${headers.map(() => '---').join(' | ')} |`);

    for (const row of data.rows) {
      lines.push(`| ${row.join(' | ')} |`);
    }

    return lines.join('\n');
  }

  private list(data: ListData, fallbackTitle: string): string {
    const marker = (index: number): string =>
      data.ordered ? `${index + 1}.` : '-';

    const body = data.items.map((item, index) => `${marker(index)} ${item}`);
    return `# ${fallbackTitle}\n\n${body.join('\n')}`;
  }

  private inferHeaders(data: TableData): string[] {
    const width = Math.max(...data.rows.map((row) => row.length), 1);
    return Array.from({ length: width }, (_, index) => `Column ${index + 1}`);
  }
}
