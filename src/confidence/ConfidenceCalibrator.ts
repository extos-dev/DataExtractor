export interface CalibrationExample {
  rawScore: number;
  correct: boolean;
  detectorId?: string;
  pageType?: string;
}

export interface CalibrationModel {
  version: string;
  detectorId?: string;
  thresholds: number[];
  precision: number[];
  trainedAt: string;
  exampleCount: number;
}

export class ConfidenceCalibrator {
  private models = new Map<string, CalibrationModel>();

  train(
    examples: CalibrationExample[],
    options: {
      detectorId?: string;
      bucketCount?: number;
    } = {}
  ): CalibrationModel {
    if (examples.length === 0) {
      throw new Error('Cannot calibrate with zero examples.');
    }

    const bucketCount = options.bucketCount ?? 10;
    const thresholds: number[] = [];
    const precision: number[] = [];

    for (let index = 0; index < bucketCount; index++) {
      const lower = index / bucketCount;
      const upper = (index + 1) / bucketCount;

      const bucket = examples.filter(
        (example) =>
          example.rawScore >= lower &&
          (index === bucketCount - 1
            ? example.rawScore <= 1
            : example.rawScore < upper)
      );

      thresholds.push(upper);

      if (bucket.length === 0) {
        precision.push(this.globalPrecision(examples));
        continue;
      }

      const correct = bucket.filter((example) => example.correct).length;
      precision.push(correct / bucket.length);
    }

    const model: CalibrationModel = {
      version: '1.0.0',
      detectorId: options.detectorId,
      thresholds,
      precision,
      trainedAt: new Date().toISOString(),
      exampleCount: examples.length,
    };

    const key = options.detectorId ?? 'global';
    this.models.set(key, model);

    return model;
  }

  calibrate(rawScore: number, detectorId?: string): number {
    const model =
      (detectorId ? this.models.get(detectorId) : undefined) ??
      this.models.get('global');

    if (!model) {
      return clamp(rawScore * 0.85);
    }

    const bucketIndex = model.thresholds.findIndex(
      (threshold) => rawScore <= threshold
    );

    const safeIndex =
      bucketIndex === -1 ? model.precision.length - 1 : bucketIndex;

    return clamp(model.precision[safeIndex]);
  }

  private globalPrecision(examples: CalibrationExample[]): number {
    const correct = examples.filter((example) => example.correct).length;
    return correct / examples.length;
  }
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}
