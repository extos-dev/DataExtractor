export type VisibilityState = 'visible' | 'hidden' | 'removed' | 'offscreen';

export interface DomFeatures {
  tag: string;
  id?: string;
  classes: string[];
  role?: string;

  text: string;
  textLength: number;
  wordCount: number;

  linkText: string;
  linkTextLength: number;
  linkCount: number;
  linkDensity: number;

  imageCount: number;
  inputCount: number;
  buttonCount: number;
  tableCount: number;
  listCount: number;
  headingCount: number;
  paragraphCount: number;

  hasJsonLd: boolean;
  jsonLdTypes: string[];

  depth: number;
  childElementCount: number;

  rect?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };

  visibility: VisibilityState;
}

export interface NormalizedDomNode {
  nodeId: string;
  parentId?: string;
  element: Element;
  features: DomFeatures;
  children: NormalizedDomNode[];
}

export interface NormalizationResult {
  root: NormalizedDomNode;
  nodeById: Map<string, NormalizedDomNode>;
  jsonLd: unknown[];
  stats: {
    totalElements: number;
    prunedElements: number;
    hiddenElements: number;
    jsonLdBlocks: number;
  };
}

export interface DomPrunerOptions {
  removeScripts?: boolean;
  removeStyles?: boolean;
  removeHidden?: boolean;
  removeIframes?: boolean;
  removeSvg?: boolean;
  removeNoScript?: boolean;
  removeTemplate?: boolean;
  removeCommonNoise?: boolean;
  preserveShadowDom?: boolean;
  maxDepth?: number;
}

export const DEFAULT_PRUNER_OPTIONS: Required<DomPrunerOptions> = {
  removeScripts: true,
  removeStyles: true,
  removeHidden: true,
  removeIframes: false,
  removeSvg: false,
  removeNoScript: true,
  removeTemplate: true,
  removeCommonNoise: true,
  preserveShadowDom: true,
  maxDepth: 80,
};

export interface DomNormalizerOptions extends DomPrunerOptions {
  includeGeometry?: boolean;
  textPreviewLength?: number;
}

export const DEFAULT_NORMALIZER_OPTIONS: Required<DomNormalizerOptions> = {
  ...DEFAULT_PRUNER_OPTIONS,
  includeGeometry: true,
  textPreviewLength: 500,
};