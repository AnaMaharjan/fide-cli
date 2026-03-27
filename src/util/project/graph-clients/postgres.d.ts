declare module "postgres" {
  type SqlOptions = {
    max?: number;
    prepare?: boolean;
    idle_timeout?: number;
    connect_timeout?: number;
    onnotice?: (() => void) | undefined;
  };

  type TransactionSql = {
    unsafe<T = unknown[]>(query: string): Promise<T>;
  };

  type Sql = {
    <T = unknown[]>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T>;
    unsafe<T = unknown[]>(query: string): Promise<T>;
    begin<T>(fn: (tx: TransactionSql) => Promise<T>): Promise<T>;
    end(options?: { timeout?: number }): Promise<void>;
  };

  export default function postgres(connectionString: string, options?: SqlOptions): Sql;
}
