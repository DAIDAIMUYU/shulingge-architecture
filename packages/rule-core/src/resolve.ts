import type { OverridePolicy, Rule, Scope } from "@shulingge/shared";

import type { ResolveRulesInput } from "./types.js";

const SCOPE_PRIORITY: Record<Scope, number> = {
  system: 0,
  global: 1,
  vault: 2,
  project: 3,
  novel: 4,
  volume: 5,
  chapter: 6,
  task: 7,
  agent: 8,
};

function canonicalKey(rule: Rule): string {
  return `${rule.id}::${rule.title.toLowerCase()}::${rule.level}`;
}

function compareRulePriority(left: Rule, right: Rule, scopeOrder: Map<Scope, number>): number {
  const leftScope = scopeOrder.get(left.scope) ?? SCOPE_PRIORITY[left.scope] ?? -1;
  const rightScope = scopeOrder.get(right.scope) ?? SCOPE_PRIORITY[right.scope] ?? -1;

  if (leftScope !== rightScope) {
    return rightScope - leftScope;
  }

  return (right.priority ?? 0) - (left.priority ?? 0);
}

function canOverride(policy: OverridePolicy | undefined): boolean {
  return policy !== "locked" && policy !== "no-override";
}

export function resolveEffectiveRules(input: ResolveRulesInput): Rule[] {
  const scopeOrder = new Map(input.scopeChain.map((scope, index) => [scope, index]));
  const enabledRules = input.rules.filter((rule) => rule.enabled);
  const lockedRules = enabledRules.filter((rule) => rule.level === "locked");
  const nonLockedRules = enabledRules.filter((rule) => rule.level !== "locked");
  const grouped = new Map<string, Rule[]>();

  for (const rule of nonLockedRules) {
    const key = canonicalKey(rule);
    const bucket = grouped.get(key) ?? [];
    bucket.push(rule);
    grouped.set(key, bucket);
  }

  const resolved = [...lockedRules];

  for (const bucket of grouped.values()) {
    bucket.sort((left, right) => compareRulePriority(left, right, scopeOrder));
    const winner = bucket[0];
    resolved.push(winner);

    if (!canOverride(winner.overridePolicy)) {
      continue;
    }

    for (const candidate of bucket.slice(1)) {
      if (candidate.overridePolicy === "append-only" && candidate.id !== winner.id) {
        resolved.push(candidate);
      }
    }
  }

  return resolved.sort((left, right) => compareRulePriority(left, right, scopeOrder));
}
