type DatabaseEnvironment = Record<string, string | undefined>;

function parseBoundedInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  variableName: string,
) {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${variableName} debe ser un entero entre ${minimum} y ${maximum}`);
  }
  return parsed;
}

export function resolveDatabasePoolConfig(environment: DatabaseEnvironment = process.env) {
  return {
    max: parseBoundedInteger(environment.DATABASE_POOL_MAX, 1, 1, 10, "DATABASE_POOL_MAX"),
    idleTimeout: parseBoundedInteger(
      environment.DATABASE_IDLE_TIMEOUT_SECONDS,
      20,
      1,
      60,
      "DATABASE_IDLE_TIMEOUT_SECONDS",
    ),
    connectTimeout: parseBoundedInteger(
      environment.DATABASE_CONNECT_TIMEOUT_SECONDS,
      10,
      1,
      30,
      "DATABASE_CONNECT_TIMEOUT_SECONDS",
    ),
  };
}
