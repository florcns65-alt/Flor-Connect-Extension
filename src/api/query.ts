import type { SelectQuery } from "./filters";
import { mapDataError, type PostgrestErrorLike } from "./map-error";

export interface QueryResult {
  data: unknown;
  error: PostgrestErrorLike | null;
  count?: number | null;
}

export interface QueryChain extends PromiseLike<QueryResult> {
  eq(column: string, value: string): QueryChain;
  gte(column: string, value: string): QueryChain;
  lt(column: string, value: string): QueryChain;
  in(column: string, values: string[]): QueryChain;
  or(expression: string): QueryChain;
  order(column: string, options: { ascending: boolean; nullsFirst?: boolean }): QueryChain;
  limit(count: number): QueryChain;
  range(from: number, to: number): QueryChain;
  single(): PromiseLike<QueryResult>;
}

export interface QueryClient {
  from(table: string): {
    select(columns: string, options?: { count?: "exact"; head?: boolean }): QueryChain;
  };
}

export interface QueryOutcome {
  data: unknown;
  count: number | null;
}

export async function executeQuery(client: QueryClient, query: SelectQuery): Promise<QueryOutcome> {
  try {
    let chain = client.from(query.table).select(query.columns, query.count ? { count: query.count } : undefined);
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
    const orders = query.orders ?? (query.order ? [query.order] : []);
    for (const item of orders) {
      chain = chain.order(item.column, { ascending: item.ascending, nullsFirst: item.nullsFirst });
    }
    if (query.limit !== undefined) chain = chain.limit(query.limit);
    if (query.range) chain = chain.range(query.range.from, query.range.to);
    const result = query.single ? await chain.single() : await chain;
    if (result.error) throw result.error;
    return { data: result.data, count: typeof result.count === "number" ? result.count : null };
  } catch (error) {
    throw mapDataError(error);
  }
}
