/**
 * Pod: A tactical execution sub-swarm within a Fly Syndicate.
 * Analogous to hedge fund "pod shops" (Citadel, Millennium) and container pods.
 */
export class SyndicatePod {
  constructor({ podId, podType = 'EXECUTION', syndicateId, maxCapitalAllocation = 500 } = {}) {
    this.podId = podId;
    this.podType = podType; // 'SCOUT', 'EXECUTION', 'RISK', 'CREDIT'
    this.syndicateId = syndicateId;
    this.maxCapitalAllocation = maxCapitalAllocation;
    this.flyers = new Map(); // flyerId -> role
  }

  /**
   * Register a Flyer agent into this specialized Pod.
   */
  registerFlyer(flyerId, role = 'WORKER') {
    this.flyers.set(flyerId, {
      role,
      joinedAt: Date.now(),
      status: 'ACTIVE',
    });
    return {
      podId: this.podId,
      flyerId,
      role,
      activeMembers: this.flyers.size,
    };
  }

  /**
   * Validate that an aggregate pod action does not exceed pod-level risk limits.
   */
  validatePodExposure(proposedTotal) {
    if (proposedTotal > this.maxCapitalAllocation) {
      throw new Error(
        `[Pod Exposure Exceeded] Pod '${this.podId}' attempted to allocate ${proposedTotal}, cap is ${this.maxCapitalAllocation}`
      );
    }
    return true;
  }

  getPodSummary() {
    return {
      podId: this.podId,
      podType: this.podType,
      syndicateId: this.syndicateId,
      flyerCount: this.flyers.size,
      members: Array.from(this.flyers.keys()),
    };
  }
}
