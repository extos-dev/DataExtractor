import { ExtractionData, LlmContextRecord } from './types';

/**
 * Shape of the object the extension side panel and API consumers render:
 * a small, predictable envelope around the typed payload.
 */
export class LlmContextFormatter {
  format(
    kind: string,
    confidence: number,
    title: string,
    data: ExtractionData
  ): LlmContextRecord {
    return {
      type: kind,
      title,
      confidence: round(confidence),
      data,
    };
  }
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
