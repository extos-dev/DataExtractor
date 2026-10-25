# Project Charter

## Non-negotiable rules

1. No live DOM mutation - detection works on a snapshot.
2. All detectors emit DetectionCandidate[] - never a single element with fixed confidence.
3. Every architectural decision logged in DECISIONS.md with rationale and alternatives.
4. Tests must cover at least one real-world page per page type, edge cases, and performance (<100ms for <=5000 nodes).
5. Types first - shared interfaces are source of truth.
6. Follow semver; breaking API changes documented in migration guide.

## Guiding principles

- Progressive enhancement: page-type classification first, then drill into regions.
- Human-in-the-loop: engine output is a suggestion; user can override via inspect mode.
- Performance is a feature.
