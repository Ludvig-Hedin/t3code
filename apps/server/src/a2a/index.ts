/**
 * A2A subsystem barrel export.
 *
 * Exports all services, layers, and routes for the A2A (Agent-to-Agent) protocol integration.
 */

// Services (interfaces)
export { A2aAgentCardService } from "./Services/A2aAgentCardService.ts";
export { A2aTaskService } from "./Services/A2aTaskService.ts";
export { A2aClientService } from "./Services/A2aClientService.ts";

// Layers (implementations)
export { A2aAgentCardServiceLive } from "./Layers/A2aAgentCardServiceLive.ts";
export { A2aTaskServiceLive } from "./Layers/A2aTaskServiceLive.ts";
export { A2aClientServiceLive } from "./Layers/A2aClientServiceLive.ts";

// HTTP routes
export { a2aAgentCardRoute, a2aJsonRpcRoute } from "./routes.ts";
