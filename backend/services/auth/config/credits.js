/**
 * What one run of each agent costs.
 *
 * Kept in one place so the cost cannot drift between the service that charges
 * and any UI that displays the price. Adding an agent here automatically makes
 * it a valid value for the deduct-credits endpoint.
 */
export const AGENT_COSTS = {
  chat: 1,
  search: 5,
  coding: 10,
  pdf: 10,
  ppt: 10,
  image: 10,
  vision: 10,
  pdfRag: 10,
};

export const DEFAULT_AGENT_COST = 1;

export const costForAgent = (agent) => AGENT_COSTS[agent] ?? DEFAULT_AGENT_COST;
