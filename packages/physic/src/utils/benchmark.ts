/**
 * Benchmark utilities for performance testing
 */

/**
 * Benchmark result
 */
export interface BenchmarkResult {
  /** Benchmark name */
  name: string;
  /** Number of iterations */
  iterations: number;
  /** Total time in milliseconds */
  totalTime: number;
  /** Average time per iteration in milliseconds */
  averageTime: number;
  /** Operations per second */
  opsPerSecond: number;
  /** Minimum time */
  minTime: number;
  /** Maximum time */
  maxTime: number;
}

/**
 * Runs a benchmark
 * 
 * @param name - Benchmark name
 * @param fn - Function to benchmark
 * @param iterations - Number of iterations (default: 1000)
 * @param warmup - Number of warmup iterations (default: 10)
 * @returns Benchmark result
 * 
 * @example
 * ```typescript
 * const result = benchmark('vector addition', () => {
 *   v1.add(v2);
 * }, 10000);
 * console.log(result.opsPerSecond);
 * ```
 */
export function benchmark(
  name: string,
  fn: () => void,
  iterations = 1000,
  warmup = 10
): BenchmarkResult {
  // Warmup
  for (let i = 0; i < warmup; i++) {
    fn();
  }

  // Actual benchmark
  const times: number[] = [];
  const start = performance.now();

  for (let i = 0; i < iterations; i++) {
    const iterStart = performance.now();
    fn();
    const iterEnd = performance.now();
    times.push(iterEnd - iterStart);
  }

  const end = performance.now();
  const totalTime = end - start;
  const averageTime = totalTime / iterations;
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const opsPerSecond = (1000 / averageTime) * iterations;

  return {
    name,
    iterations,
    totalTime,
    averageTime,
    opsPerSecond,
    minTime,
    maxTime,
  };
}

/**
 * Compares multiple benchmarks
 * 
 * @param benchmarks - Array of benchmark functions
 * @param iterations - Number of iterations per benchmark
 * @returns Array of benchmark results
 */
export function compareBenchmarks(
  benchmarks: Array<{ name: string; fn: () => void }>,
  iterations = 1000
): BenchmarkResult[] {
  return benchmarks.map((b) => benchmark(b.name, b.fn, iterations));
}

/**
 * Formats benchmark result as string
 * 
 * @param result - Benchmark result
 * @returns Formatted string
 */
export function formatBenchmark(result: BenchmarkResult): string {
  return `${result.name}: ${result.averageTime.toFixed(3)}ms/op, ${result.opsPerSecond.toFixed(0)} ops/s`;
}

