export { ExtractorEngine } from './engine/ExtractionEngine';
export type { ExtractionResult } from './engine/ExtractionEngine';
export { registerCoreDetectors, createCoreDetectors } from './engine/registerCoreDetectors';
export { RegionArbiter } from './engine/RegionArbiter';

export { ContextBuilder, DEFAULT_DETECTION_OPTIONS } from './detection/DetectionContext';
export { BaseDetectorPlugin } from './detection/DetectorPlugin';
export type {
  DetectionCandidate,
  DetectionContext,
  DetectionOptions,
  DetectorPlugin,
  Evidence,
  FieldCandidate,
  PageMetadata,
  PatternType,
} from './detection/types';

export { PageClassifier } from './classification/PageClassifier';
export type { PageType, PageClassification } from './classification/types';

export { ConfidenceCalibrator } from './confidence/ConfidenceCalibrator';

export { DomNormalizer } from './dom/DomNormalizer';
export { DomPruner } from './dom/DomPruner';
export { BlockSegmenter } from './dom/BlockSegmenter';
export { RegionGrouper } from './dom/RegionGrouper';
export type { ExtractionResultItem, ExtractionData, LlmContextRecord } from './extraction/types';
export { ExtractionMapper } from './extraction/ExtractionMapper';
export { MarkdownFormatter } from './extraction/MarkdownFormatter';
export { LlmContextFormatter } from './extraction/LlmContextFormatter';

export { EvaluationHarness, evaluateSuite } from './evaluation/EvaluationHarness';

export { OverlayManager } from './visual/OverlayManager';

export { SelectorStabilizer } from './stability/SelectorStabilizer';
export { RegionLocatorStore } from './stability/RegionLocatorStore';
