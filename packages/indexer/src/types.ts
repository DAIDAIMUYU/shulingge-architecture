export type IndexDocumentType =
  | "manuscript"
  | "chapter-metadata"
  | "character"
  | "worldbook"
  | "relation"
  | "timeline"
  | "knowledge-item"
  | "summary"
  | "run";

export interface IndexedDocument {
  id: string;
  type: IndexDocumentType;
  projectId: string;
  novelId?: string;
  path: string;
  title: string;
  content: string;
  tags: string[];
}

export interface SearchQuery {
  text?: string;
  type?: IndexDocumentType | IndexDocumentType[];
  projectId?: string;
  novelId?: string;
  tags?: string[];
  limit?: number;
  semantic?: boolean;
  semanticProvider?: "local" | "cloud";
}

export interface SearchResult extends IndexedDocument {
  score: number;
}

export interface RebuildIndexResult {
  indexedCount: number;
  indexPath: string;
  reused?: boolean;
}
