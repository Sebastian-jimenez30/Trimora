export function getErrorMessage(error: unknown, fallback = "Ocurrió un error inesperado") {
  return error instanceof Error ? error.message : fallback;
}
