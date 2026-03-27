declare module "node:sqlite" {
  export class StatementSync {
    all(...params: unknown[]): unknown[];
    run(...params: unknown[]): unknown;
  }

  export class DatabaseSync {
    constructor(path: string);
    prepare(sql: string): StatementSync;
    exec(sql: string): void;
    close(): void;
  }
}
