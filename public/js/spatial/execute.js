export const applySpatialLogic = async (compiled, { setMatchSet } = {}) => {
  if (!compiled) {
    if (setMatchSet) {
      setMatchSet(null);
    }
    return { count: 0, serviceIds: [] };
  }

  let ids = [];
  if (Array.isArray(compiled.serviceIds)) {
    ids = compiled.serviceIds;
  } else if (Array.isArray(compiled.matches)) {
    ids = compiled.matches;
  } else if (compiled.matchSet instanceof Set) {
    ids = Array.from(compiled.matchSet);
  }

  const unique = Array.from(new Set(ids.map((value) => String(value))));
  if (setMatchSet) {
    setMatchSet(new Set(unique));
  }
  return { count: unique.length, serviceIds: unique };
};
