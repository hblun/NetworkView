import { state } from "../state/manager.js";

export const getSpatialLogicEvidencePart = () => {
  if (!state.spatialQuery?.active) {
    return null;
  }
  const count = Array.isArray(state.spatialQuery?.serviceIds)
    ? state.spatialQuery.serviceIds.length
    : 0;
  const label = count === 1 ? "service" : "services";
  return `Spatial filter: <strong class=\"font-semibold\">${count} ${label}</strong>`;
};
