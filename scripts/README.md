# Politica de scripts

Los ejecutores mantenidos y autorizados para automatizacion viven en `scripts/ci`. Los procedimientos
controlados de despliegue, respaldo y verificacion viven en `scripts/release` y solo pueden operar
mediante el workflow y las autorizaciones documentadas. Los archivos historicos ubicados directamente
en `scripts/` estan inventariados en `ci/legacy-scripts.json` y se consideran exclusivamente manuales:

- no pueden importarse desde `src`;
- no pueden ser invocados por `package.json` ni por workflows;
- no forman parte de migraciones, despliegues o recuperaciones oficiales;
- antes de una ejecucion manual deben revisarse contra el esquema y el entorno vigente;
- cualquier reemplazo debe implementarse como migracion versionada o ejecutor de CI reproducible.

La prueba `legacy-scripts.test.mjs` bloquea referencias nuevas desde codigo productivo o
automatizacion. Esto aisla la deuda historica sin borrar herramientas que aun puedan servir como
evidencia para una migracion controlada.
