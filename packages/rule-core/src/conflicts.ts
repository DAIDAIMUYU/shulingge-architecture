import type { Rule, RuleConflict } from "@shulingge/shared";

import type { RuleConflictScanResult } from "./types.js";

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}\s]+/gu, " ").replace(/\s+/g, " ").trim();
}

function toCompact(value: string): string {
  return normalizeText(value).replace(/\s+/g, "");
}

function similarity(left: string, right: string): number {
  const leftNormalized = toCompact(left);
  const rightNormalized = toCompact(right);
  if (!leftNormalized || !rightNormalized) {
    return 0;
  }
  if (leftNormalized === rightNormalized) {
    return 1;
  }

  const toBigrams = (value: string): string[] => {
    if (value.length < 2) {
      return [value];
    }
    const grams: string[] = [];
    for (let index = 0; index < value.length - 1; index += 1) {
      grams.push(value.slice(index, index + 2));
    }
    return grams;
  };

  const leftSet = new Set(toBigrams(leftNormalized));
  const rightSet = new Set(toBigrams(rightNormalized));
  const intersection = [...leftSet].filter((token) => rightSet.has(token)).length;
  return (2 * intersection) / (leftSet.size + rightSet.size);
}

function createConflict(ruleA: Rule, ruleB: Rule, kind: RuleConflict["kind"]): RuleConflict {
  return {
    ruleA: ruleA.id,
    ruleB: ruleB.id,
    kind,
  };
}

function polarity(value: string): "allow" | "deny" | "neutral" {
  const normalized = normalizeText(value);
  if (/(禁止|不得|不准|不可|不能|avoid|forbid|forbidden|must not|do not|never)/i.test(normalized)) {
    return "deny";
  }
  if (/(允许|可以|应当|必须|需要|should|must|allow|allowed|require|required)/i.test(normalized)) {
    return "allow";
  }
  return "neutral";
}

function subjectTokens(value: string): Set<string> {
  const normalized = normalizeText(value);
  const asciiWords = normalized.match(/[a-z0-9-]{2,}/g) ?? [];
  const cjkChars = normalized.match(/[\p{Script=Han}]/gu) ?? [];
  return new Set([...asciiWords, ...cjkChars]);
}

function shareEnoughSubject(left: string, right: string): boolean {
  const leftTokens = subjectTokens(left);
  const rightTokens = subjectTokens(right);
  const overlap = [...leftTokens].filter((token) => rightTokens.has(token));
  return overlap.length >= 1;
}

export function scanRuleConflicts(rules: Rule[]): RuleConflictScanResult {
  const exactDuplicates: RuleConflict[] = [];
  const nearDuplicates: RuleConflict[] = [];
  const contradictions: RuleConflict[] = [];

  for (let index = 0; index < rules.length; index += 1) {
    for (let cursor = index + 1; cursor < rules.length; cursor += 1) {
      const left = rules[index];
      const right = rules[cursor];
      const leftText = `${left.title} ${left.source}`;
      const rightText = `${right.title} ${right.source}`;

      if (toCompact(leftText) === toCompact(rightText)) {
        exactDuplicates.push(createConflict(left, right, "duplicate"));
        continue;
      }

      const score = similarity(leftText, rightText);
      if (score >= 0.55) {
        nearDuplicates.push(createConflict(left, right, "near-duplicate"));
      }

      const leftPolarity = polarity(leftText);
      const rightPolarity = polarity(rightText);
      if (
        leftPolarity !== "neutral" &&
        rightPolarity !== "neutral" &&
        leftPolarity !== rightPolarity &&
        shareEnoughSubject(leftText, rightText)
      ) {
        contradictions.push(createConflict(left, right, "conflict"));
      }
    }
  }

  return { exactDuplicates, nearDuplicates, contradictions };
}
