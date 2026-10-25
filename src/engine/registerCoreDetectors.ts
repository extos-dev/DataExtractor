import { DetectorPlugin } from '../detection/types';
import { ArticleDetector } from '../detection/detectors/ArticleDetector';
import { AiChatDetector } from '../detection/detectors/AiChatDetector';
import { TableDetector } from '../detection/detectors/TableDetector';
import { ContextDetector } from '../detection/detectors/ContextDetector';
import { ProductDetector } from '../detection/detectors/ProductDetector';
import { ProductGridDetector } from '../detection/detectors/ProductGridDetector';

/**
 * Core detector set registered in priority order. Custom detectors can be
 * appended via ExtractorEngine.registerDetector().
 */
export function createCoreDetectors(): DetectorPlugin[] {
  return [
    new ProductDetector(),
    new ProductGridDetector(),
    new ArticleDetector(),
    new AiChatDetector(),
    new TableDetector(),
    new ContextDetector(),
  ];
}

/**
 * The built-in ExtractorEngine registers these so engine.extract() works
 * out of the box, while still accepting additional plugins.
 */
export function registerCoreDetectors(engine: {
  registerDetector: (detector: DetectorPlugin) => unknown;
}): void {
  for (const detector of createCoreDetectors()) {
    engine.registerDetector(detector);
  }
}
