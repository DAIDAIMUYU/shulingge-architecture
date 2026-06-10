import { createAppError } from "@shulingge/shared";

export const VAULT_ERRORS = {
  ABSOLUTE_PATH_NOT_ALLOWED: "VAULT_ABSOLUTE_PATH_NOT_ALLOWED",
  PATH_TRAVERSAL_DETECTED: "VAULT_PATH_TRAVERSAL_DETECTED",
  EMPTY_RELATIVE_PATH: "VAULT_EMPTY_RELATIVE_PATH",
  MANUSCRIPT_METADATA_FORBIDDEN: "VAULT_MANUSCRIPT_METADATA_FORBIDDEN",
  VAULT_ROOT_NOT_ABSOLUTE: "VAULT_ROOT_NOT_ABSOLUTE",
} as const;

export function absolutePathNotAllowed(pathValue: string) {
  return createAppError(
    VAULT_ERRORS.ABSOLUTE_PATH_NOT_ALLOWED,
    `Absolute path is not allowed: ${pathValue}`,
  );
}

export function pathTraversalDetected(pathValue: string) {
  return createAppError(
    VAULT_ERRORS.PATH_TRAVERSAL_DETECTED,
    `Path escapes the authorized vault root: ${pathValue}`,
  );
}

export function emptyRelativePath() {
  return createAppError(
    VAULT_ERRORS.EMPTY_RELATIVE_PATH,
    "Relative path must not be empty",
  );
}

export function manuscriptMetadataForbidden() {
  return createAppError(
    VAULT_ERRORS.MANUSCRIPT_METADATA_FORBIDDEN,
    "Manuscript files must contain pure body text without frontmatter metadata",
  );
}

export function vaultRootMustBeAbsolute(rootPath: string) {
  return createAppError(
    VAULT_ERRORS.VAULT_ROOT_NOT_ABSOLUTE,
    `Vault root must be an absolute path: ${rootPath}`,
  );
}
