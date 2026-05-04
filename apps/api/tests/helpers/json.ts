// biome-ignore lint/suspicious/noExplicitAny: generic test JSON helper
export async function readJson<T = any>(res: Response): Promise<T> {
  return (await res.json()) as T;
}
