declare module "hash-wasm" {
  export interface Argon2Options {
    password: string;
    salt: Uint8Array;
    parallelism: number;
    iterations: number;
    memorySize: number;
    hashLength: number;
    outputType: "binary";
  }

  export function argon2id(options: Argon2Options): Promise<Uint8Array>;
}
