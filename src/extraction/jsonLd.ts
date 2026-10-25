/**
 * Shared helpers for walking normalized JSON-LD payloads.
 */
export function walkJsonLdNodes(
  value: unknown,
  visit: (node: Record<string, unknown>) => void
): void {
  if (!value || typeof value !== 'object') return;

  if (Array.isArray(value)) {
    for (const item of value) walkJsonLdNodes(item, visit);
    return;
  }

  const record = value as Record<string, unknown>;
  visit(record);

  for (const child of Object.values(record)) {
    walkJsonLdNodes(child, visit);
  }
}

/**
 * Visit every JSON-LD node whose @type matches one of `types`
 * (case-insensitive), including @graph and nested structures.
 */
export function resolveJsonLdNodes(
  jsonLd: unknown[],
  types: string[],
  visit: (node: Record<string, unknown>) => void
): void {
  const wanted = new Set(types.map((type) => type.toLowerCase()));

  for (const item of jsonLd) {
    walkJsonLdNodes(item, (node) => {
      const rawType = node['@type'];
      const candidates = Array.isArray(rawType)
        ? rawType.map(String)
        : typeof rawType === 'string'
          ? [rawType]
          : [];

      if (candidates.some((candidate) => wanted.has(candidate.toLowerCase()))) {
        visit(node);
      }
    });
  }
}
