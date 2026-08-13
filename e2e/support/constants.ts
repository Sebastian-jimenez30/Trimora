export const E2E_PASSWORD = ["e2e", "local", "only", "2026"].join("-");

export const E2E_USERS = {
  admin: { email: "admin.e2e@trimora.test", name: "Admin E2E" },
  barber: { email: "barber.e2e@trimora.test", name: "Barber E2E" },
  outsider: { email: "other.e2e@trimora.test", name: "Other E2E" },
} as const;

export const E2E_IDS = {
  organization: "10000000-0000-4000-8000-000000000001",
  otherOrganization: "10000000-0000-4000-8000-000000000002",
  adminMembership: "20000000-0000-4000-8000-000000000001",
  barberMembership: "20000000-0000-4000-8000-000000000002",
  outsiderMembership: "20000000-0000-4000-8000-000000000003",
  client: "30000000-0000-4000-8000-000000000001",
  debtor: "30000000-0000-4000-8000-000000000002",
  otherClient: "30000000-0000-4000-8000-000000000003",
  service: "40000000-0000-4000-8000-000000000001",
  product: "50000000-0000-4000-8000-000000000001",
  consumable: "50000000-0000-4000-8000-000000000002",
  appointment: "60000000-0000-4000-8000-000000000001",
  completedTransaction: "70000000-0000-4000-8000-000000000001",
  debtTransaction: "70000000-0000-4000-8000-000000000002",
  completedItemService: "80000000-0000-4000-8000-000000000001",
  completedItemProduct: "80000000-0000-4000-8000-000000000002",
  debtItem: "80000000-0000-4000-8000-000000000003",
  completedPayment: "90000000-0000-4000-8000-000000000001",
  debtPayment: "90000000-0000-4000-8000-000000000002",
  inventoryMovement: "a0000000-0000-4000-8000-000000000001",
} as const;
