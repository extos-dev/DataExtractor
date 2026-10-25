import { AiChatData, ChatMessage } from './types';

export class AiChatExtractor {
  extract(context: {
    element: Element;
    document?: Document;
    jsonLd: unknown[];
    hasJsonLdType: (type: string) => boolean;
  }): { data: AiChatData } | null {
    const element = context.element;
    const messages = this.readMessages(element);

    if (messages.length === 0) return null;

    const title =
      context.document?.title?.trim() ||
      element
        .querySelector('h1, h2, [class*="title" i]')
        ?.textContent?.replace(/\s+/g, ' ')
        .trim() ||
      'Chat conversation';

    return { data: { title, messages } };
  }

  private readMessages(element: Element): ChatMessage[] {
    const explicit = Array.from(
      element.querySelectorAll('[data-message-role], [data-role]')
    );

    if (explicit.length > 0) {
      return explicit.map(this.readExplicitMessage).filter(Boolean) as ChatMessage[];
    }

    // Fallback: class-based user/assistant detection or top-level message
    // blocks without role attributes.
    const classed = Array.from(
      element.querySelectorAll('[class*="message" i]')
    );

    if (classed.length > 0) {
      return classed.map(this.readClassMessage).filter(Boolean) as ChatMessage[];
    }

    return Array.from(element.children)
      .map((child) => child.textContent?.replace(/\s+/g, ' ').trim())
      .filter((text): text is string => Boolean(text && text.length > 1))
      .map((text) => ({ role: 'unknown' as const, text }));
  }

  private readExplicitMessage = (el: Element): ChatMessage | null => {
    const rawRole =
      el.getAttribute('data-message-role') ?? el.getAttribute('data-role') ?? '';

    const role = this.normalizeRole(rawRole) ?? this.normalizeRole(
      el.className.toLowerCase()
    );

    const text = el.textContent?.replace(/\s+/g, ' ').trim();
    if (!text) return null;

    return { role: role ?? 'unknown', text };
  };

  private readClassMessage = (el: Element): ChatMessage | null => {
    const className = el.className.toLowerCase();
    let role: ChatMessage['role'] | undefined;

    if (/user|human/.test(className)) role = 'user';
    if (/assistant|bot|ai|model/.test(className)) role = 'assistant';

    const text = el.textContent?.replace(/\s+/g, ' ').trim();
    if (!text) return null;

    return { role: role ?? 'unknown', text };
  };

  private normalizeRole(role: string): ChatMessage['role'] | undefined {
    const normalized = role.toLowerCase();

    if (normalized === 'user' || normalized === 'human') return 'user';
    if (normalized === 'assistant' || normalized === 'bot' || normalized === 'ai') {
      return 'assistant';
    }
    if (normalized === 'system') return 'system';
    return undefined;
  }
}
