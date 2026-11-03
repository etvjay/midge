/** Raised whenever the Roost refuses to proceed. Always fail closed: no partial results. */
export class RoostAggregationError extends Error {
  constructor(message) {
    super(`[ROOST REJECT] ${message}`);
    this.name = 'RoostAggregationError';
  }
}
