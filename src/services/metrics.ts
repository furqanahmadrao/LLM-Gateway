/**
 * Metrics Service
 * 
 * Prometheus-compatible metrics collection and exposure.
 * Tracks request counts, token throughput, error rates, and latencies.
 * 
 * Requirements: 16.1
 */

/**
 * Metric types for Prometheus format
 */
type MetricType = 'counter' | 'gauge' | 'histogram';

interface MetricDefinition {
  name: string;
  help: string;
  type: MetricType;
}

interface LabeledValue {
  labels: Record<string, string>;
  value: number;
}

/**
 * In-memory metrics storage
 * In production, this would be replaced with a proper metrics library like prom-client
 */
class MetricsRegistry {
  private counters: Map<string, Map<string, number>> = new Map();
  private gauges: Map<string, Map<string, number>> = new Map();
  private histogramSums: Map<string, Map<string, number>> = new Map();
  private histogramCounts: Map<string, Map<string, number>> = new Map();
  private histogramBuckets: Map<string, Map<string, Map<number, number>>> = new Map();
  
  private definitions: Map<string, MetricDefinition> = new Map();

  /**
   * Register a metric definition
   */
  register(definition: MetricDefinition): void {
    this.definitions.set(definition.name, definition);
  }

  /**
   * Increment a counter
   */
  incCounter(name: string, labels: Record<string, string> = {}, value: number = 1): void {
    const labelKey = this.labelsToKey(labels);
    if (!this.counters.has(name)) {
      this.counters.set(name, new Map());
    }
    const counter = this.counters.get(name)!;
    counter.set(labelKey, (counter.get(labelKey) || 0) + value);
  }


  /**
   * Set a gauge value
   */
  setGauge(name: string, labels: Record<string, string> = {}, value: number): void {
    const labelKey = this.labelsToKey(labels);
    if (!this.gauges.has(name)) {
      this.gauges.set(name, new Map());
    }
    this.gauges.get(name)!.set(labelKey, value);
  }

  /**
   * Observe a histogram value
   */
  observeHistogram(name: string, labels: Record<string, string> = {}, value: number, buckets: number[] = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]): void {
    const labelKey = this.labelsToKey(labels);
    
    // Initialize histogram structures
    if (!this.histogramSums.has(name)) {
      this.histogramSums.set(name, new Map());
      this.histogramCounts.set(name, new Map());
      this.histogramBuckets.set(name, new Map());
    }
    
    const sums = this.histogramSums.get(name)!;
    const counts = this.histogramCounts.get(name)!;
    const bucketMap = this.histogramBuckets.get(name)!;
    
    // Update sum and count
    sums.set(labelKey, (sums.get(labelKey) || 0) + value);
    counts.set(labelKey, (counts.get(labelKey) || 0) + 1);
    
    // Update buckets
    if (!bucketMap.has(labelKey)) {
      bucketMap.set(labelKey, new Map());
    }
    const labelBuckets = bucketMap.get(labelKey)!;
    
    for (const bucket of buckets) {
      if (value <= bucket) {
        labelBuckets.set(bucket, (labelBuckets.get(bucket) || 0) + 1);
      }
    }
    // +Inf bucket
    labelBuckets.set(Infinity, (labelBuckets.get(Infinity) || 0) + 1);
  }

  /**
   * Convert labels object to a string key
   */
  private labelsToKey(labels: Record<string, string>): string {
    const sortedKeys = Object.keys(labels).sort();
    return sortedKeys.map(k => `${k}="${labels[k]}"`).join(',');
  }

  /**
   * Parse label key back to labels object
   */
  private keyToLabels(key: string): Record<string, string> {
    if (!key) return {};
    const labels: Record<string, string> = {};
    const parts = key.split(',');
    for (const part of parts) {
      const match = part.match(/^([^=]+)="([^"]*)"$/);
      if (match) {
        labels[match[1]] = match[2];
      }
    }
    return labels;
  }

  /**
   * Format labels for Prometheus output
   */
  private formatLabels(labels: Record<string, string>): string {
    const entries = Object.entries(labels);
    if (entries.length === 0) return '';
    return '{' + entries.map(([k, v]) => `${k}="${v}"`).join(',') + '}';
  }

  /**
   * Get all counter values
   */
  getCounterValues(name: string): LabeledValue[] {
    const counter = this.counters.get(name);
    if (!counter) return [];
    return Array.from(counter.entries()).map(([key, value]) => ({
      labels: this.keyToLabels(key),
      value,
    }));
  }

  /**
   * Get all gauge values
   */
  getGaugeValues(name: string): LabeledValue[] {
    const gauge = this.gauges.get(name);
    if (!gauge) return [];
    return Array.from(gauge.entries()).map(([key, value]) => ({
      labels: this.keyToLabels(key),
      value,
    }));
  }

  /**
   * Export all metrics in Prometheus text format
   */
  export(): string {
    const lines: string[] = [];

    // Export counters
    for (const [name, values] of this.counters) {
      const def = this.definitions.get(name);
      if (def) {
        lines.push(`# HELP ${name} ${def.help}`);
        lines.push(`# TYPE ${name} counter`);
      }
      for (const [labelKey, value] of values) {
        const labels = this.keyToLabels(labelKey);
        lines.push(`${name}${this.formatLabels(labels)} ${value}`);
      }
    }

    // Export gauges
    for (const [name, values] of this.gauges) {
      const def = this.definitions.get(name);
      if (def) {
        lines.push(`# HELP ${name} ${def.help}`);
        lines.push(`# TYPE ${name} gauge`);
      }
      for (const [labelKey, value] of values) {
        const labels = this.keyToLabels(labelKey);
        lines.push(`${name}${this.formatLabels(labels)} ${value}`);
      }
    }

    // Export histograms
    for (const [name, sums] of this.histogramSums) {
      const def = this.definitions.get(name);
      if (def) {
        lines.push(`# HELP ${name} ${def.help}`);
        lines.push(`# TYPE ${name} histogram`);
      }
      
      const counts = this.histogramCounts.get(name)!;
      const bucketMap = this.histogramBuckets.get(name)!;
      
      for (const [labelKey, sum] of sums) {
        const labels = this.keyToLabels(labelKey);
        const count = counts.get(labelKey) || 0;
        const labelBuckets = bucketMap.get(labelKey);
        
        // Output buckets
        if (labelBuckets) {
          const sortedBuckets = Array.from(labelBuckets.keys()).sort((a, b) => a - b);
          let cumulative = 0;
          for (const bucket of sortedBuckets) {
            cumulative += labelBuckets.get(bucket) || 0;
            const bucketLabels = { ...labels, le: bucket === Infinity ? '+Inf' : String(bucket) };
            lines.push(`${name}_bucket${this.formatLabels(bucketLabels)} ${cumulative}`);
          }
        }
        
        lines.push(`${name}_sum${this.formatLabels(labels)} ${sum}`);
        lines.push(`${name}_count${this.formatLabels(labels)} ${count}`);
      }
    }

    return lines.join('\n') + '\n';
  }

  /**
   * Reset all metrics (useful for testing)
   */
  reset(): void {
    this.counters.clear();
    this.gauges.clear();
    this.histogramSums.clear();
    this.histogramCounts.clear();
    this.histogramBuckets.clear();
  }

  /**
   * Check if a metric is registered
   */
  hasMetric(name: string): boolean {
    return this.definitions.has(name) || 
           this.counters.has(name) || 
           this.gauges.has(name) || 
           this.histogramSums.has(name);
  }
}

// Global metrics registry instance
export const metricsRegistry = new MetricsRegistry();

// Register standard metrics
metricsRegistry.register({
  name: 'llm_gateway_request_count',
  help: 'Total number of requests processed',
  type: 'counter',
});

metricsRegistry.register({
  name: 'llm_gateway_token_throughput',
  help: 'Total tokens processed (input + output)',
  type: 'counter',
});

metricsRegistry.register({
  name: 'llm_gateway_error_rate',
  help: 'Total number of errors',
  type: 'counter',
});

metricsRegistry.register({
  name: 'llm_gateway_request_latency_seconds',
  help: 'Request latency in seconds',
  type: 'histogram',
});

metricsRegistry.register({
  name: 'llm_gateway_tokens_in',
  help: 'Total input tokens processed',
  type: 'counter',
});

metricsRegistry.register({
  name: 'llm_gateway_tokens_out',
  help: 'Total output tokens processed',
  type: 'counter',
});


/**
 * Record a completed request
 */
export function recordRequest(
  provider: string,
  model: string,
  statusCode: number,
  latencyMs: number,
  tokensIn: number = 0,
  tokensOut: number = 0
): void {
  const labels = { provider, model };
  const statusLabels = { provider, model, status: String(statusCode) };

  // Increment request count
  metricsRegistry.incCounter('llm_gateway_request_count', statusLabels);

  // Record latency
  metricsRegistry.observeHistogram(
    'llm_gateway_request_latency_seconds',
    labels,
    latencyMs / 1000
  );

  // Record token throughput
  if (tokensIn > 0) {
    metricsRegistry.incCounter('llm_gateway_tokens_in', labels, tokensIn);
    metricsRegistry.incCounter('llm_gateway_token_throughput', labels, tokensIn);
  }
  if (tokensOut > 0) {
    metricsRegistry.incCounter('llm_gateway_tokens_out', labels, tokensOut);
    metricsRegistry.incCounter('llm_gateway_token_throughput', labels, tokensOut);
  }

  // Record errors
  if (statusCode >= 400) {
    const errorLabels = { provider, model, status: String(statusCode) };
    metricsRegistry.incCounter('llm_gateway_error_rate', errorLabels);
  }
}

/**
 * Get metrics in Prometheus text format
 */
export function getMetrics(): string {
  return metricsRegistry.export();
}

/**
 * Reset all metrics (for testing)
 */
export function resetMetrics(): void {
  metricsRegistry.reset();
}

/**
 * Check if required metrics are present in the output
 */
export function hasRequiredMetrics(metricsOutput: string): {
  hasRequestCount: boolean;
  hasTokenThroughput: boolean;
  hasErrorRate: boolean;
  hasLatency: boolean;
} {
  return {
    hasRequestCount: metricsOutput.includes('llm_gateway_request_count'),
    hasTokenThroughput: metricsOutput.includes('llm_gateway_token_throughput'),
    hasErrorRate: metricsOutput.includes('llm_gateway_error_rate'),
    hasLatency: metricsOutput.includes('llm_gateway_request_latency_seconds'),
  };
}
