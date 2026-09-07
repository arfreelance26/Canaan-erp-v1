/**
 * Run an async mapper over `items` with a bounded number of in-flight promises.
 *
 * Firing `Promise.all(items.map(fetch))` over hundreds/thousands of rows opens
 * that many simultaneous requests, each grabbing a DB connection on the backend
 * — which exhausts the connection pool and times out (QueuePool limit reached).
 * `mapLimit` caps concurrency so at most `limit` requests are ever in flight,
 * while still resolving to results in the SAME order as the input.
 *
 * @example
 *   const sheets = await mapLimit(trips, 8, (t) => api.getSheet(t.id));
 */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await mapper(items[i], i);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(workers);
  return results;
}
