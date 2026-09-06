/** Bounds waiting, without retrying an operation whose remote result may be unknown. */
export async function withTimeout<T>(
  operation: Promise<T>,
  milliseconds = 30_000,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Home Assistant operation timed out.")),
          milliseconds,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
