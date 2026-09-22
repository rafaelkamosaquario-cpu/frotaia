/** Reporting must never silently total only the first page. Errors propagate. */
export async function readAllPages<T>(readPage: (offset: number, size: number) => Promise<T[]>, size = 500): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += size) {
    const page = await readPage(offset, size);
    rows.push(...page);
    if (page.length < size) return rows;
  }
}
