import { translate, type AppLocale } from "./i18n.js";

export type AutosaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

export interface EditorViewModel {
  title: string;
  chapterLabel: string;
  content: string;
  wordCount: number;
  annotationsCount: number;
  locksCount: number;
  saveStatus: AutosaveStatus;
}

export interface AutosaveController {
  update(nextContent: string): void;
  flush(): Promise<void>;
  getStatus(): AutosaveStatus;
  getDraft(): string;
}

export interface AutosaveControllerOptions {
  initialContent: string;
  save(content: string): Promise<void>;
}

function countWords(content: string): number {
  const normalized = content.trim();
  if (!normalized) {
    return 0;
  }

  const cjkPattern = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu;
  const cjkCharacters = normalized.match(cjkPattern)?.length ?? 0;
  const latinWords = normalized
    .replace(cjkPattern, " ")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean).length;

  return cjkCharacters + latinWords;
}

export function createEditorViewModel(
  locale: AppLocale,
  input: Partial<EditorViewModel> = {},
): EditorViewModel {
  const content = input.content ?? translate(locale, "editor.placeholder");

  return {
    title: input.title ?? translate(locale, "editor.title"),
    chapterLabel: input.chapterLabel ?? "demo-series / main / chapter-001",
    content,
    wordCount: input.wordCount ?? countWords(content),
    annotationsCount: input.annotationsCount ?? 0,
    locksCount: input.locksCount ?? 0,
    saveStatus: input.saveStatus ?? "idle",
  };
}

export function createAutosaveController(options: AutosaveControllerOptions): AutosaveController {
  let draft = options.initialContent;
  let status: AutosaveStatus = "idle";

  return {
    update(nextContent: string) {
      draft = nextContent;
      status = "dirty";
    },
    async flush() {
      status = "saving";
      try {
        await options.save(draft);
        status = "saved";
      } catch {
        status = "error";
        throw new Error("Autosave failed");
      }
    },
    getStatus() {
      return status;
    },
    getDraft() {
      return draft;
    },
  };
}
