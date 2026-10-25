import { PatternType } from '../detection/types';
import { PageType } from '../classification/types';

export interface ExpectedRegion {
  kind: PatternType;
  required?: boolean;
  mustContainText?: string[];
  mustNotContainText?: string[];
  maxLinkDensity?: number;
  minConfidence?: number;
}

export interface ExpectedField {
  equals?: unknown;
  contains?: string | number;
  exists?: boolean;
}

export interface FixtureExpectation {
  id: string;
  pageType: PageType;
  minPageConfidence?: number;
  expectedRegions: ExpectedRegion[];
  expectedFields?: Record<string, ExpectedField>;
  forbiddenDetections?: Array<{
    kind: PatternType;
    reason: string;
  }>;
}

export interface RegionEvaluation {
  kind: PatternType;
  passed: boolean;
  found: boolean;
  failures: string[];
}

export interface FieldEvaluation {
  field: string;
  passed: boolean;
  actual?: unknown;
  expected: ExpectedField;
  failures: string[];
}

export interface FixtureEvaluation {
  fixtureId: string;
  passed: boolean;
  pageTypePassed: boolean;
  predictedPageType: PageType;
  expectedPageType: PageType;
  pageConfidence: number;
  regionEvaluations: RegionEvaluation[];
  fieldEvaluations: FieldEvaluation[];
  forbiddenViolations: string[];
  failures: string[];
}

export interface SuiteEvaluation {
  totalFixtures: number;
  passedFixtures: number;
  failedFixtures: number;
  passRate: number;
  regionPrecision: number;
  regionRecall: number;
  regionF1: number;
  fieldPrecision: number;
  fieldRecall: number;
  fieldF1: number;
  fixtureEvaluations: FixtureEvaluation[];
}