// Mock accounting only for provider-behavior unit tests; real budget tests use SQLite CAS.
export const budgetFixture = () => ({
  reserveAiBudget: async (id) => ({ id, period: "2026-11" }),
  finishAiBudget: async () => {},
});
