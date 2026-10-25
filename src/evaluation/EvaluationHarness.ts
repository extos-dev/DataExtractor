import { ExtractorEngine, ExtractionResult } from '../engine/ExtractionEngine';
import { createCoreDetectors } from '../engine/registerCoreDetectors';
import {
  FixtureEvaluation,
  SuiteEvaluation,
  FixtureExpectation,
  RegionEvaluation,
  FieldEvaluation,
} from './types';
import { PageType } from '../classification/types';

/**
 * Runs the doc-architecture pipeline (normalize → segment → group →
 * detect → arbitrate → classify → extract) over fixture pages and scores
 * the result against fixture expectations.
 */
export class EvaluationHarness {
  private readonly engine: ExtractorEngine;

  constructor(engine?: ExtractorEngine) {
    this.engine = engine ?? this.createDefaultEngine();
  }

  private createDefaultEngine(): ExtractorEngine {
    const engine = new ExtractorEngine();
    for (const detector of createCoreDetectors()) {
      engine.registerDetector(detector);
    }
    return engine;
  }

  async evaluate(
    expected: FixtureExpectation,
    root: ParentNode
  ): Promise<FixtureEvaluation> {
    const result = await this.engine.extract(root);
    return this.score(expected, result);
  }

  /** Pure scoring half, usable with any precomputed ExtractionResult. */
  score(expected: FixtureExpectation, result: ExtractionResult): FixtureEvaluation {
    const failures: string[] = [];

    const regionEvaluations = expected.expectedRegions.map((expectation) =>
      this.evaluateRegion(expectation, result, failures)
    );

    const fieldEvaluations = Object.entries(expected.expectedFields ?? {}).map(
      ([fieldPath, fieldExpectation]) =>
        this.evaluateField(fieldPath, fieldExpectation, result, failures)
    );

    const forbiddenViolations: string[] = [];
    for (const forbidden of expected.forbiddenDetections ?? []) {
      const present = result.selected.some(
        (candidate) => candidate.kind === forbidden.kind
      );
      if (present) {
        const message = `forbidden detection "${forbidden.kind}": ${forbidden.reason}`;
        forbiddenViolations.push(message);
        failures.push(message);
      }
    }

    const pageConfidence = result.classification.confidence;
    const minPage = expected.minPageConfidence ?? 0;
    const pageTypePassed =
      result.classification.pageType === expected.pageType &&
      pageConfidence >= minPage;

    if (result.classification.pageType !== expected.pageType) {
      failures.push(
        `pageType: expected ${expected.pageType}, got ${result.classification.pageType} (confidence ${pageConfidence})`
      );
    } else if (pageConfidence < minPage) {
      failures.push(
        `pageConfidence: expected >= ${minPage}, got ${pageConfidence}`
      );
    }

    return {
      fixtureId: expected.id,
      passed: failures.length === 0,
      pageTypePassed,
      predictedPageType: result.classification.pageType as PageType,
      expectedPageType: expected.pageType,
      pageConfidence,
      regionEvaluations,
      fieldEvaluations,
      forbiddenViolations,
      failures,
    };
  }

  private evaluateRegion(
    expectation: FixtureExpectation['expectedRegions'][number],
    result: ExtractionResult,
    failures: string[]
  ): RegionEvaluation {
    const checkFailures: string[] = [];

    const matches = result.selected.filter(
      (candidate) => candidate.kind === expectation.kind
    );

    const found = matches.length > 0;

    if (!found) {
      checkFailures.push(`no detection of kind "${expectation.kind}"`);
      this.pushRegionFailure(failures, expectation.kind, checkFailures);

      return {
        kind: expectation.kind,
        passed: !expectation.required,
        found: false,
        failures: expectation.required ? checkFailures : [],
      };
    }

    for (const match of matches) {
      const text = (match.element.textContent ?? '').replace(/\s+/g, ' ');
      const lowerText = text.toLowerCase();

      for (const needle of expectation.mustContainText ?? []) {
        if (!lowerText.includes(needle.toLowerCase())) {
          checkFailures.push(`region text missing "${needle}"`);
        }
      }

      for (const needle of expectation.mustNotContainText ?? []) {
        if (lowerText.includes(needle.toLowerCase())) {
          checkFailures.push(`region text contains forbidden "${needle}"`);
        }
      }

      if (expectation.maxLinkDensity !== undefined) {
        const density = linkDensityOf(match.element);
        if (density > expectation.maxLinkDensity) {
          checkFailures.push(
            `linkDensity ${density.toFixed(3)} > ${expectation.maxLinkDensity}`
          );
        }
      }

      if (expectation.minConfidence !== undefined) {
        const confidence = match.calibratedConfidence ?? match.confidence;
        if (confidence < expectation.minConfidence) {
          checkFailures.push(
            `confidence ${confidence.toFixed(3)} < ${expectation.minConfidence}`
          );
        }
      }

      if (checkFailures.length === 0) break;
    }

    if (checkFailures.length > 0) {
      this.pushRegionFailure(failures, expectation.kind, checkFailures);
    }

    return {
      kind: expectation.kind,
      passed: checkFailures.length === 0,
      found: true,
      failures: checkFailures,
    };
  }

  private evaluateField(
    fieldPath: string,
    expectation: { equals?: unknown; contains?: string | number; exists?: boolean },
    result: ExtractionResult,
    failures: string[]
  ): FieldEvaluation {
    const actual = this.resolveField(fieldPath, result);

    const checkFailures: string[] = [];

    if (expectation.exists === true && actual === undefined) {
      checkFailures.push('field missing but expected to exist');
    }

    if (expectation.equals !== undefined && actual !== expectation.equals) {
      checkFailures.push(`expected ${JSON.stringify(expectation.equals)}, got ${JSON.stringify(actual)}`);
    }

    if (expectation.contains !== undefined) {
      const actualString = String(actual ?? '');
      if (!actualString.includes(String(expectation.contains))) {
        checkFailures.push(
          `expected text to contain "${expectation.contains}", got "${actualString}"`
        );
      }
    }

    if (checkFailures.length > 0) {
      failures.push(`field ${fieldPath}: ${checkFailures.join('; ')}`);
    }

    return {
      field: fieldPath,
      passed: checkFailures.length === 0,
      actual,
      expected: expectation,
      failures: checkFailures,
    };
  }

  /**
   * Field values come from detector field candidates first, then from the
   * typed extraction payload (article.title, product.price, ...).
   */
  private resolveField(
    fieldPath: string,
    result: ExtractionResult
  ): unknown {
    for (const candidate of result.selected) {
      const field = candidate.fields[fieldPath];
      if (field !== undefined) return field.value;
    }

    const [scope, key] = fieldPath.split('.');
    if (!key) return undefined;

    for (const extraction of result.extractions) {
      if (extraction.kind === scope) {
        const value = (extraction.data as unknown as Record<string, unknown>)[key];
        if (value !== undefined && typeof value !== 'object') return value;
      }
    }

    return undefined;
  }

  private pushRegionFailure(
    failures: string[],
    kind: string,
    checkFailures: string[]
  ): void {
    for (const failure of checkFailures) {
      failures.push(`region ${kind}: ${failure}`);
    }
  }
}

/** Suite-level precision/recall/F1 over fixture evaluations. */
export function evaluateSuite(
  evaluations: FixtureEvaluation[]
): SuiteEvaluation {
  const totalFixtures = evaluations.length;

  let passedFixtures = 0;
  let expectedRegions = 0;
  let correctRegions = 0;
  let predictedRegions = 0;
  let expectedFields = 0;
  let correctFields = 0;
  let predictedFields = 0;

  for (const evaluation of evaluations) {
    if (evaluation.passed) passedFixtures += 1;

    for (const region of evaluation.regionEvaluations) {
      if (region.passed && region.found) {
        correctRegions += 1;
        predictedRegions += 1;
        expectedRegions += 1;
      } else if (region.passed) {
        expectedRegions += 1;
      } else if (region.found) {
        predictedRegions += 1;
      }
    }

    for (const field of evaluation.fieldEvaluations) {
      if (field.passed) {
        correctFields += 1;
        predictedFields += 1;
        expectedFields += 1;
      } else if (field.actual !== undefined) {
        predictedFields += 1;
        expectedFields += 1;
      }
    }
  }

  const regionPrecision = safeDivision(correctRegions, predictedRegions);
  const regionRecall = safeDivision(correctRegions, expectedRegions);
  const fieldPrecision = safeDivision(correctFields, predictedFields);
  const fieldRecall = safeDivision(correctFields, expectedFields);

  return {
    totalFixtures,
    passedFixtures,
    failedFixtures: totalFixtures - passedFixtures,
    passRate: safeDivision(passedFixtures, totalFixtures),
    regionPrecision,
    regionRecall,
    regionF1: f1(regionPrecision, regionRecall),
    fieldPrecision,
    fieldRecall,
    fieldF1: f1(fieldPrecision, fieldRecall),
    fixtureEvaluations: evaluations,
  };
}

function safeDivision(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return numerator / denominator;
}

function f1(precision: number, recall: number): number {
  if (precision + recall === 0) return 0;
  return (2 * precision * recall) / (precision + recall);
}

function linkDensityOf(element: Element): number {
  const total = element.textContent?.replace(/\s+/g, '').length ?? 0;
  if (total === 0) return 0;

  let linkText = 0;
  for (const anchor of Array.from(element.querySelectorAll('a'))) {
    linkText += anchor.textContent?.replace(/\s+/g, '').length ?? 0;
  }

  return linkText / total;
}
