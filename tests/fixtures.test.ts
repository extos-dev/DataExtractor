import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Window } from 'happy-dom';

import { EvaluationHarness, evaluateSuite } from '../src/evaluation/EvaluationHarness';
import { FixtureExpectation } from '../src/evaluation/types';

const FIXTURES_ROOT = join(__dirname, 'fixtures');

function listFixtureDirs(): string[] {
  const groups = readdirSync(FIXTURES_ROOT).filter((name) =>
    statSync(join(FIXTURES_ROOT, name)).isDirectory()
  );
  const dirs: string[] = [];
  for (const group of groups) {
    for (const name of readdirSync(join(FIXTURES_ROOT, group))) {
      const dir = join(FIXTURES_ROOT, group, name);
      if (statSync(dir).isDirectory()) dirs.push(join(group, name));
    }
  }
  return dirs.sort();
}

const harness = new EvaluationHarness();

async function runFixture(fixtureDir: string) {
  const pageHtml = readFileSync(join(FIXTURES_ROOT, fixtureDir, 'page.html'), 'utf8');
  const expected = JSON.parse(
    readFileSync(join(FIXTURES_ROOT, fixtureDir, 'expected.json'), 'utf8')
  ) as FixtureExpectation;

  const window = new Window({ url: 'http://localhost/' });
  const document = window.document;
  document.body.innerHTML = pageHtml;

  return harness.evaluate(expected, window.document.body as HTMLElement);
}

const fixtureDirs = listFixtureDirs();

describe('fixture evaluation suite', () => {
  it('discovers fixtures', () => {
    expect(fixtureDirs.length).toBeGreaterThanOrEqual(5);
  });

  for (const fixtureDir of fixtureDirs) {
    it(`fixture ${fixtureDir} passes`, async () => {
      const evaluation = await runFixture(fixtureDir);
      if (!evaluation.passed) {
        console.error(`[${fixtureDir}] failures:\n  ` + evaluation.failures.join('\n  '));
        console.error(
          `[${fixtureDir}] predicted:`,
          evaluation.predictedPageType,
          evaluation.pageConfidence
        );
      }
      expect(evaluation.failures).toEqual([]);
    });
  }

  it('whole suite reaches a perfect pass rate', async () => {
    const evaluations = await Promise.all(fixtureDirs.map(runFixture));
    const suite = evaluateSuite(evaluations);
    expect(suite.passRate).toBe(1);
    expect(suite.regionF1).toBe(1);
    expect(suite.fieldF1).toBe(1);
  });
});
