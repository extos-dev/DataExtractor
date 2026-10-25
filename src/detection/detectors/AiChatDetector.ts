import { BaseDetectorPlugin } from '../DetectorPlugin';
import {
  DetectionCandidate,
  DetectionContext,
  Evidence,
  PatternType,
} from '../types';

export class AiChatDetector extends BaseDetectorPlugin {
  readonly id = 'core.ai_chat';
  readonly kinds: PatternType[] = ['ai_chat'];
  readonly version = '1.0.0';

  applies(context: DetectionContext): boolean {
    return context.getRegion('ai_chat').length > 0;
  }

  detect(context: DetectionContext): DetectionCandidate[] {
    const candidates: DetectionCandidate[] = [];

    for (const region of context.getRegion('ai_chat')) {
      const evidence: Evidence[] = [];
      let score = region.score;

      const messageCount = Number(region.metadata.messageCount ?? 0);
      const hasUser = Boolean(region.metadata.hasUser);
      const hasAssistant = Boolean(region.metadata.hasAssistant);

      evidence.push({
        signal: 'chat_messages',
        weight: 0.35,
        value: messageCount,
        explanation: 'Detected repeated chat-message-like blocks.',
      });

      if (hasUser && hasAssistant) {
        score += 0.25;
        evidence.push({
          signal: 'alternating_roles',
          weight: 0.25,
          value: { hasUser, hasAssistant },
          explanation: 'Both user and assistant roles were inferred.',
        });
      }

      if (this.hasComposer(context, region)) {
        score += 0.18;
        evidence.push({
          signal: 'composer',
          weight: 0.18,
          value: true,
          explanation: 'Input/composer controls found near the conversation.',
        });
      }

      if (/\/(chat|conversation|assistant|copilot)/i.test(context.page.pathname)) {
        score += 0.08;
        evidence.push({
          signal: 'url_pattern',
          weight: 0.08,
          value: context.page.pathname,
          explanation: 'URL path resembles a chat application route.',
        });
      }

      if (score < context.options.minConfidence) {
        continue;
      }

      candidates.push(
        this.candidate({
          context,
          detectorId: this.id,
          kind: 'ai_chat',
          region,
          element: region.element,
          score,
          evidence,
          metadata: {
            messageCount,
            hasUser,
            hasAssistant,
          },
        })
      );
    }

    return this.rankAndLimit(candidates, context);
  }

  private hasComposer(
    _context: DetectionContext,
    region: { element: Element }
  ): boolean {
    const root =
      region.element.closest('body') ?? region.element.ownerDocument.body;

    const composer = root.querySelector(
      [
        'form textarea',
        '[contenteditable="true"]',
        '[role="textbox"]',
        'textarea[placeholder]',
        'input[type="text"][placeholder]',
      ].join(', ')
    );

    const sendControl = root.querySelector(
      [
        'button[type="submit"]',
        '[aria-label*="send" i]',
        '[data-testid*="send" i]',
        '[class*="send" i]',
      ].join(', ')
    );

    return Boolean(composer && sendControl);
  }
}
