import type { SelectQuery } from "./filters";
import { mapDataError, type PostgrestErrorLike } from "./map-error";

export interface QueryResult {
  data: unknown;
  error: PostgrestErrorLike | null;
}

export interface QueryChain extends PromiseLike<QueryResult> {
  eq(column: string, value: string): QueryChain;
  gte(column: string, value: string): QueryChain;
  lt(column: string, value: string): QueryChain;
  in(column: string, values: string[]): QueryChain;
  or(expression: string): QueryChain;
  order(column: string, options: { ascending: boolean }): QueryChain;
  limit(count: number): QueryChain;
  single(): PromiseLike<QueryResult>;
}

export interface QueryClient {
  from(table: string): {
    select(columns: string): QueryChain;
  };
}

export async function executeQuery(client: QueryClient, query: SelectQuery): Promise<unknown> {
  try {
    let chain = client.from(query.table).select(query.columns);
    for (const filter of query.filters) {
      switch (filter.op) {
        case "eq":
          chain = chain.eq(filter.column, filter.value);
          break;
        case "gte":
          chain = chain.gte(filter.column, filter.value);
          break;
        case "lt":
          chain = chain.lt(filter.column, filter.value);
          break;
        case "in":
          chain = chain.in(filter.column, filter.values);
          break;
        case "or":
          chain = chain.or(filter.expression);
          break;
        default: {
          const unexpected: never = filter;
          throw new Error(`Unknown filter ${JSON.stringify(unexpected)}`);
        }
      }
    }
    if (query.order) chain = chain.order(query.order.column, { ascending: query.order.ascending });
    if (query.limit !== undefined) chain = chain.limit(query.limit);
    const result = query.single ? await chain.single() : await chain;
    if (result.error) throw result.error;
    return result.data;
  } catch (error) {
    throw mapDataError(error);
  }
}
