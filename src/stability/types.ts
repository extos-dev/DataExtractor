export type LocatorStrategy =
  | 'data-attribute'
  | 'aria'
  | 'semantic'
  | 'structural'
  | 'text-signature'
  | 'css-path'
  | 'xpath';

export interface ResolvedLocator {
  strategy: LocatorStrategy;
  /** Selector / expression usable with querySelector (evaluated). */
  expression: string;

  /** For xpath/text-signature strategies evaluated in code. */
  kind: 'css' | 'xpath' | 'text';

  /** Match score 0..1, higher = more confident relocation. */
  score: number;

  /** Text snippets used to verify the relocation landed correctly. */
  signatures: string[];
}

export interface RegionLocator {
  regionId: string;
  kind: string;
  locators: ResolvedLocator[];
  stats: {
    hits: number;
    misses: number;
    reliability: number;
  };
}
