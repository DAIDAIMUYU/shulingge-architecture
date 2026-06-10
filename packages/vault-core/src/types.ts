export interface InitializeVaultOptions {
  rootPath: string;
}

export interface InitializeVaultResult {
  rootPath: string;
  createdDirectories: string[];
}

export interface WriteJsonOptions {
  spaces?: number;
}

export interface WriteManuscriptOptions {
  createParents?: boolean;
}

export interface SnapshotOptions {
  sourcePath: string;
  snapshotDir: string;
  label?: string;
}

export interface SnapshotResult {
  snapshotPath: string;
}

export interface DeletePathOptions {
  path: string;
  trashDir?: string;
  recycle?: (targetPath: string) => Promise<void>;
  now?: Date;
}

export interface DeletePathResult {
  deletedPath: string;
  method: "system-recycle-bin" | "vault-trash";
  trashPath?: string;
}
