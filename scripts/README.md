# Política de scripts

Solo se conservan ejecutores reproducibles y mantenidos:

- `scripts/ci`: selección y ejecución de pruebas del pipeline;
- `scripts/release`: respaldo, preflight y verificación del despliegue coordinado.

No deben agregarse scripts manuales o de un solo uso en la raíz de `scripts/`. Los cambios de base de
datos pertenecen a `supabase/migrations`; cualquier automatización nueva debe tener contrato,
documentación, uso repetible y cobertura dentro de `scripts/ci` o `scripts/release`.
