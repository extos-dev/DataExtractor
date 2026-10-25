import { BaseDetectorPlugin } from '../DetectorPlugin';
import {
  DetectionCandidate,
  DetectionContext,
  Evidence,
  PatternType,
} from '../types';
import { FieldCandidate } from '../types';
import { RegionCandidate } from '../../dom/regionTypes';

interface TableSignals {
  rowCount: number;
  columnCount: number;
  headerCount: number;
  hasConsistentColumns: boolean;
  isSemanticTable: boolean;
  isAriaGrid: boolean;
  isVisualTable: boolean;
}

export class TableDetector extends BaseDetectorPlugin {
  readonly id = 'core.table';
  readonly kinds: PatternType[] = ['table'];
  readonly version = '2.0.0';

  applies(context: DetectionContext): boolean {
    return (
      context.getRegion('data_table').length > 0 ||
      context.getBlocks('table').length > 0
    );
  }

  detect(context: DetectionContext): DetectionCandidate[] {
    const candidates: DetectionCandidate[] = [];

    const tableRegions = context.getRegion('data_table');
    const tableBlocks = context.getBlocks('table');

    for (const region of tableRegions) {
      const signals = this.extractSignals(region.element);
      const candidate = this.buildCandidate(
        context,
        region.element,
        signals,
        region
      );

      if (candidate) {
        candidates.push(candidate);
      }
    }

    for (const block of tableBlocks) {
      const alreadyCovered = candidates.some(
        (candidate) =>
          candidate.element.contains(block.element) ||
          block.element.contains(candidate.element)
      );

      if (alreadyCovered) {
        continue;
      }

      const signals = this.extractSignals(block.element);
      const candidate = this.buildCandidate(
        context,
        block.element,
        signals
      );

      if (candidate) {
        candidates.push(candidate);
      }
    }

    return this.rankAndLimit(candidates, context);
  }

  private buildCandidate(
    context: DetectionContext,
    element: Element,
    signals: TableSignals,
    region?: RegionCandidate
  ): DetectionCandidate | null {
    if (signals.rowCount < 2 || signals.columnCount < 2) {
      return null;
    }

    const evidence: Evidence[] = [];
    let score = 0.35;

    if (signals.isSemanticTable) {
      score += 0.3;
      evidence.push({
        signal: 'semantic_table',
        weight: 0.3,
        value: true,
        explanation: 'Element is a semantic <table>.',
      });
    }

    if (signals.isAriaGrid) {
      score += 0.25;
      evidence.push({
        signal: 'aria_grid',
        weight: 0.25,
        value: true,
        explanation: 'Element uses table or grid ARIA semantics.',
      });
    }

    if (signals.isVisualTable) {
      score += 0.18;
      evidence.push({
        signal: 'visual_table',
        weight: 0.18,
        value: true,
        explanation: 'Repeated rows and consistent columns resemble a table.',
      });
    }

    if (signals.headerCount > 0) {
      score += 0.1;
      evidence.push({
        signal: 'header_row',
        weight: 0.1,
        value: signals.headerCount,
        explanation: 'Table header cells were found.',
      });
    }

    if (signals.hasConsistentColumns) {
      score += 0.12;
      evidence.push({
        signal: 'consistent_columns',
        weight: 0.12,
        value: signals.columnCount,
        explanation: 'Rows contain a consistent number of cells.',
      });
    }

    score += Math.min(0.1, signals.rowCount * 0.005);

    if (score < context.options.minConfidence) {
      return null;
    }

    const fields: Record<string, FieldCandidate> = {
      rowCount: {
        value: signals.rowCount,
        confidence: 0.95,
        source: 'dom-pattern',
      },
      columnCount: {
        value: signals.columnCount,
        confidence: signals.hasConsistentColumns ? 0.9 : 0.6,
        source: 'dom-pattern',
      },
    };

    return this.candidate({
      context,
      detectorId: this.id,
      kind: 'table',
      region,
      element,
      score,
      evidence,
      fields,
      metadata: { ...signals },
    });
  }

  private extractSignals(element: Element): TableSignals {
    const isSemanticTable = element.tagName.toLowerCase() === 'table';

    const role = element.getAttribute('role')?.toLowerCase();
    const isAriaGrid = role === 'table' || role === 'grid';

    const semanticRows = Array.from(element.querySelectorAll(':scope tr'));

    const ariaRows = Array.from(
      element.querySelectorAll(':scope [role=row]')
    );

    const rows = semanticRows.length > 0 ? semanticRows : ariaRows;

    const rowCellCounts = rows.map((row) =>
      row.querySelectorAll(
        ':scope > td, :scope > th, :scope > [role=cell], :scope > [role=gridcell]'
      ).length
    );

    const columnCount =
      rowCellCounts.length > 0 ? Math.max(...rowCellCounts) : 0;

    const hasConsistentColumns =
      rowCellCounts.length > 1 &&
      rowCellCounts.every((count) => count === columnCount);

    const headerCount = element.querySelectorAll(
      ':scope th, :scope [role=columnheader]'
    ).length;

    const isVisualTable = this.detectVisualTable(element);

    return {
      rowCount: rows.length,
      columnCount,
      headerCount,
      hasConsistentColumns,
      isSemanticTable,
      isAriaGrid,
      isVisualTable,
    };
  }

  private detectVisualTable(element: Element): boolean {
    const children = Array.from(element.children);

    if (children.length < 3) {
      return false;
    }

    const childCounts = children.map((child) => child.children.length);

    const dominantCount = Math.max(...childCounts);

    const consistent = childCounts.filter(
      (count) => count === dominantCount
    ).length;

    return dominantCount >= 2 && consistent / children.length >= 0.7;
  }
}
