import { ContextBuilder } from '../detection/DetectionContext';
import {
  DetectionCandidate,
  DetectionContext,
  DetectionOptions,
  DetectorPlugin,
} from '../detection/types';
import { RegionArbiter } from './RegionArbiter';
import { PageClassifier } from '../classification/PageClassifier';
import { ConfidenceCalibrator } from '../confidence/ConfidenceCalibrator';
import { PageClassification } from '../classification/types';
import {
  BlockSegmenterOptions,
} from '../dom/BlockSegmenter';
import {
  RegionGrouperOptions,
} from '../dom/RegionGrouper';
import { ExtractionMapper } from '../extraction/ExtractionMapper';
import { ExtractionResultItem } from '../extraction/types';

export interface CalibratedDetectionCandidate
  extends DetectionCandidate {
  calibratedConfidence: number;
}

export interface ExtractionResult {
  page: DetectionContext['page'];
  classification: PageClassification;
  candidates: CalibratedDetectionCandidate[];
  selected: CalibratedDetectionCandidate[];
  extractions: ExtractionResultItem[];
}

export class ExtractorEngine {
  private detectors: DetectorPlugin[] = [];
  private arbiter = new RegionArbiter();
  private pageClassifier = new PageClassifier();
  private calibrator = new ConfidenceCalibrator();
  private mapper = new ExtractionMapper();

  private detectionOptions: DetectionOptions = {};
  private segmenterOptions: BlockSegmenterOptions = {};
  private grouperOptions: RegionGrouperOptions = {};

  registerDetector(detector: DetectorPlugin): this {
    this.detectors.push(detector);
    return this;
  }

  /**
   * Tune the underlying normalization/segmentation/grouping layers without
   * changing the detector surface.
   */
  configure(options: {
    detection?: DetectionOptions;
    segmentation?: BlockSegmenterOptions;
    grouping?: RegionGrouperOptions;
  }): this {
    if (options.detection) this.detectionOptions = options.detection;
    if (options.segmentation) this.segmenterOptions = options.segmentation;
    if (options.grouping) this.grouperOptions = options.grouping;
    return this;
  }

  async extract(
    root: ParentNode,
    options: DetectionOptions = {}
  ): Promise<ExtractionResult> {
    const context = await new ContextBuilder(
      { ...this.detectionOptions, ...options },
      this.segmenterOptions,
      this.grouperOptions
    ).build(root);

    const rawCandidates: DetectionCandidate[] = [];

    for (const detector of this.detectors) {
      if (!this.safeApplies(detector, context)) {
        continue;
      }

      try {
        rawCandidates.push(...detector.detect(context));
      } catch (error) {
        console.warn(`Detector failed: ${detector.id}`, error);
      }
    }

    const selectedRaw = this.arbiter.select(rawCandidates, context);
    const classification = this.pageClassifier.classify(
      context,
      selectedRaw
    );

    const candidates = rawCandidates.map((candidate) => ({
      ...candidate,
      calibratedConfidence: this.calibrator.calibrate(
        candidate.score,
        candidate.detectorId
      ),
    }));

    const selected = selectedRaw.map((candidate) => ({
      ...candidate,
      calibratedConfidence: this.calibrator.calibrate(
        candidate.score,
        candidate.detectorId
      ),
    }));

    const extractions = selected
      .map((candidate) => this.mapper.map(candidate, context))
      .filter((item): item is ExtractionResultItem => item !== null);

    return {
      page: context.page,
      classification,
      candidates,
      selected,
      extractions,
    };
  }

  private safeApplies(
    detector: DetectorPlugin,
    context: DetectionContext
  ): boolean {
    try {
      return detector.applies(context);
    } catch {
      return false;
    }
  }
}
