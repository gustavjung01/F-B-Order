declare module "pg" {
  export type QueryResultRow = Record<string, unknown>;

  export type QueryResult<Row extends QueryResultRow = QueryResultRow> = {
    rows: Row[];
    rowCount: number | null;
  };

  export type PoolConfig = {
    connectionString?: string;
    ssl?: boolean | { rejectUnauthorized?: boolean };
    max?: number;
  };

  export interface PoolClient {
    query<Row extends QueryResultRow = QueryResultRow>(
      text: string,
      values?: readonly unknown[],
    ): Promise<QueryResult<Row>>;
    release(): void;
  }

  export class Pool {
    constructor(config?: PoolConfig);

    query<Row extends QueryResultRow = QueryResultRow>(
      text: string,
      values?: readonly unknown[],
    ): Promise<QueryResult<Row>>;

    connect(): Promise<PoolClient>;
    end(): Promise<void>;
  }

  const pg: {
    Pool: typeof Pool;
  };

  export default pg;
}
