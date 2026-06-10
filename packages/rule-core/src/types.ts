import type { HardCheck, Rule, RuleConflict, Scope } from "@shulingge/shared";

export interface ResolveRulesInput {
  rules: Rule[];
  scopeChain: Scope[];
}

export interface HardCheckInput {
  manuscript?: string;
  minWords?: number;
  maxWords?: number;
  structuredOutputText?: string;
  writeSucceeded?: boolean;
  skippedLockedCheck?: boolean;
}

export interface HardCheckViolation {
  id: string;
  level: "locked" | "hard";
  message: string;
}

export interface HardCheckResult {
  ok: boolean;
  violations: HardCheckViolation[];
}

export interface RuleConflictScanResult {
  exactDuplicates: RuleConflict[];
  nearDuplicates: RuleConflict[];
  contradictions: RuleConflict[];
}

export interface BuiltInRulePreset {
  rules: Rule[];
  hardChecks: HardCheck[];
}
