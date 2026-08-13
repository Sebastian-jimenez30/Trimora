# E2E, accesibilidad y seguridad en CI

**Etapa:** 07

**Rama:** `architecture/07-e2e-security-ci`

**Estado:** completada y aceptada por el propietario con pipeline en verde.

## 1. Resultado de la etapa

Trimora dispone de recorridos Playwright contra el build de producción, una base local reconstruida
desde migraciones y datos E2E deterministas. El CI selecciona recorridos por componente en los PR y
reserva la matriz completa de navegadores para `main`, ejecuciones nocturnas, disparos manuales y la
consolidación final.

La etapa también incorpora:

- auditoría Axe sobre rutas críticas, con bloqueo ante impactos `serious` o `critical`;
- CodeQL con consultas `security-extended` para JavaScript y TypeScript;
- revisión de dependencias nuevas, bloqueando vulnerabilidades altas o críticas;
- auditoría completa de dependencias de producción, incluida deuda histórica;
- detección de secretos sobre el historial Git;
- trazas, capturas, videos y reporte HTML de Playwright únicamente cuando falla un job.
- acciones base de checkout, Node, caché y artefactos sobre generaciones con runtime Node 24.

## 2. Arquitectura de ejecución

```text
cambio en PR
  └── detector de impacto
      ├── componentes directos
      ├── consumidores transitivos
      └── recorridos E2E asociados
          └── Chromium + base Supabase efímera

main / nocturno / manual / consolidación
  └── suite completa
      ├── Chromium
      ├── Firefox
      └── WebKit
```

Cada job E2E realiza, en este orden:

1. instala las dependencias reproducibles y el navegador de su matriz;
2. inicia Supabase local;
3. reconstruye la base con todas las migraciones;
4. expone únicamente las credenciales efímeras del entorno local;
5. compila la aplicación en modo producción y levanta el servidor standalone generado, copiando
   previamente los recursos `public` y `.next/static` que ese artefacto no incluye por defecto;
6. siembra tres usuarios de prueba, dos organizaciones y el catálogo financiero necesario;
7. inicia sesión por la interfaz y guarda estados de autenticación efímeros;
8. ejecuta los recorridos elegidos;
9. si falla, publica evidencia diagnóstica durante 14 días.

Los estados de autenticación, reportes y resultados locales están ignorados por Git. Las credenciales
de los usuarios E2E son constantes de prueba y sólo operan sobre la instancia efímera recién creada.

## 3. Matriz componente-recorrido

| Componente            | Recorridos directos                                          |
| --------------------- | ------------------------------------------------------------ |
| `auth-access`         | sesión; roles y aislamiento multiempresa                     |
| `clients`             | cliente; agenda; venta; cartera; trazabilidad; aislamiento   |
| `agenda-appointments` | agenda; venta desde el flujo operativo                       |
| `pos-finance`         | venta; cartera; historial, recibo y analítica                |
| `inventory-services`  | venta combinada; descuento de inventario                     |
| `analytics`           | historial, recibo y analítica                                |
| `shared-ui`           | accesibilidad de rutas críticas                              |
| `database`            | todos los recorridos de negocio                              |
| `tooling`             | todos los recorridos, incluida accesibilidad                 |
| `ai-integrations`     | sin recorrido directo; conserva los dependientes transitivos |

El resumen de `Detectar impacto` publica los componentes, recorridos y navegadores seleccionados.
Los cambios compartidos, de tooling o no clasificados mantienen el fallback de suite completa.

## 4. Recorridos versionados

| Etiqueta             | Evidencia funcional                                                      |
| -------------------- | ------------------------------------------------------------------------ |
| `@auth-session`      | redirección anónima, acceso y persistencia de sesión                     |
| `@clients`           | creación real de un cliente                                              |
| `@agenda`            | creación y edición de una cita con minuto exacto                         |
| `@pos-sales`         | cobro conjunto de servicio y producto                                    |
| `@inventory`         | reducción posterior del stock vendido                                    |
| `@receivables`       | deuda agrupada, abono parcial y pago completo                            |
| `@history-analytics` | detalle del movimiento, recibo con ítems y tablero analítico             |
| `@roles-tenancy`     | ausencia de datos ajenos y rechazo de una ruta administrativa al barbero |
| `@accessibility`     | Axe en acceso, inicio, clientes, agenda, caja y analítica                |

La venta y la comprobación de inventario forman un solo recorrido: toma el stock inicial, vende y exige
exactamente una unidad menos. Cada navegador de consolidación recibe su propia base reconstruida, por
lo que no comparte estado con otros jobs. Los recorridos mutables que no pueden repetirse sin cambiar
su precondición desactivan reintentos; los recorridos de lectura conservan la evidencia de reintento.

## 5. Controles de seguridad

### 5.1 CodeQL

Analiza JavaScript y TypeScript con la suite ampliada. Los resultados se publican en Code Scanning.
En repositorios privados esta capacidad depende de que el plan de GitHub incluya GitHub Code Security.

### 5.2 Dependencias

La revisión de cambios se ejecuta en PR y falla si una dependencia incorporada o actualizada introduce
una vulnerabilidad `high` o `critical`, una vez que el repositorio expone Dependency Graph y define la
variable `DEPENDENCY_REVIEW_ENABLED=true`. Mientras esa capacidad administrativa no esté habilitada,
el job permanece visible y publica una advertencia en vez de bloquear todos los PR por falta del
servicio. Un segundo job ejecuta `npm audit --omit=dev` sobre el árbol de producción completo y siempre
es bloqueante, por lo que también detecta deuda histórica alta o crítica aunque no forme parte del diff.

### 5.3 Secretos

Gitleaks inspecciona el historial disponible. Si el repositorio pertenece a una organización, puede ser
necesario configurar `GITLEAKS_LICENSE` según la licencia del proveedor. Además debe activarse en GitHub
la protección nativa de secretos y, cuando esté disponible, Push Protection; esa decisión modifica la
postura del repositorio y requiere autorización humana.

## 6. Configuración manual obligatoria en GitHub

El código no cambia silenciosamente reglas administrativas del repositorio. Después de que los nuevos
jobs hayan ejecutado al menos una vez, el propietario debe crear o actualizar la ruleset de `main`:

1. habilitar Dependency Graph en `Settings > Security > Advanced Security` y crear la variable de
   repositorio `DEPENDENCY_REVIEW_ENABLED=true`;
2. exigir PR antes de integrar y al menos una aprobación;
3. invalidar aprobaciones cuando haya commits nuevos;
4. exigir que la rama esté actualizada;
5. bloquear force-push y eliminación de `main`;
6. exigir resolución de conversaciones;
7. marcar como obligatorios los checks estables:
   - `Calidad de archivos modificados`;
   - `Build de producción`;
   - `Migraciones, RLS e integridad PostgreSQL` cuando GitHub permita checks condicionales o mediante
     un futuro job agregador no omitido;
   - `E2E · chromium`;
   - `Dependencias nuevas`;
   - `Auditoría de dependencias de producción`;
   - `CodeQL JavaScript y TypeScript`;
   - `Secretos versionados`;
8. activar Secret Scanning y Push Protection;
9. impedir bypass general, dejando sólo responsables explícitos de emergencia.

Un check condicional omitido puede complicar las reglas obligatorias. Antes de marcarlo como requerido,
se debe comprobar en la interfaz de GitHub que produce un estado aceptable para cambios documentales.
Los workflows también escuchan `merge_group`, de modo que una futura cola de integración no omita los
checks exigidos por la ruleset.

## 7. Cómo validar esta etapa

### 7.1 Pipeline automático

En el PR de esta etapa, al cambiar tooling, el detector debe elegir todos los componentes y recorridos.
El resultado esperado es:

- formato, lint, TypeScript, componentes, cobertura, base de datos y build en verde;
- `E2E · chromium` en verde sobre una base reconstruida;
- la auditoría completa sin hallazgos altos o críticos y `Dependencias nuevas` en verde; antes de
  habilitar Dependency Graph este último mostrará una advertencia explícita;
- resumen con el mapa componente-recorrido;
- ningún artefacto E2E cuando todo pasa.

Después, ejecutar manualmente el workflow `CI` con `full_suite=true`. Deben aparecer y pasar los jobs E2E
de Chromium, Firefox y WebKit. Si uno falla, descargar el artefacto de ese navegador y revisar primero
`playwright-report`, luego la traza, captura o video del intento fallido.

### 7.2 Revisión funcional opcional

Sobre un entorno desechable equivalente al CI:

1. iniciar sesión como administrador;
2. crear un cliente;
3. crear y editar una cita usando minutos no redondos;
4. vender un servicio y un producto juntos;
5. confirmar el descuento del inventario;
6. registrar un abono parcial y luego pagar el saldo del cliente;
7. abrir el detalle, el recibo y analítica;
8. confirmar que un barbero no accede a Equipo ni observa otro tenant.

## 8. Criterio de cierre

La etapa sólo queda aceptada cuando:

- el pipeline del commit vigente está verde;
- la consolidación manual pasa en los tres navegadores;
- no hay violaciones Axe serias o críticas;
- CodeQL, dependencias y secretos no dejan hallazgos altos o críticos abiertos, y Dependency Review
  está habilitado para evaluar el diff de cada PR;
- el propietario confirma los recorridos funcionales;
- el propietario decide y aplica las protecciones administrativas de GitHub.

Hasta entonces la rama permanece apilada, no se fusiona y cualquier corrección se publica mediante
`commit --amend` y `push --force-with-lease`.
