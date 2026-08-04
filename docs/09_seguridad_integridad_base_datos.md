# Seguridad e integridad de base de datos

- **Etapa:** 03
- **Rama:** `architecture/03-database-security`
- **Estado:** implementada; pendiente de pipeline y aceptación del propietario

## 1. Objetivo y límites

Esta etapa incorpora una segunda barrera de seguridad en PostgreSQL. No reemplaza la autorización
central de la etapa 02: la complementa.

```text
Navegador / Data API
  -> rol anon o authenticated
  -> privilegios SQL mínimos
  -> RLS por usuario, organización y rol

Servidor Trimora / Drizzle
  -> DATABASE_URL
  -> rol postgres.<project-ref> del pooler
  -> BYPASSRLS
  -> requireActor() y filtros tenant obligatorios
```

La inspección local de la URL, leyendo únicamente su nombre de usuario y sin mostrar contraseña,
confirmó que `DATABASE_URL` usa actualmente el rol administrativo `postgres.<project-ref>`. Ese rol
omite RLS. Por esta razón:

- el navegador nunca recibe `DATABASE_URL`, `SUPABASE_SECRET_KEY` ni el cliente Drizzle;
- toda consulta Drizzle continúa detrás de módulos `server-only` y de `requireActor()`;
- RLS protege las consultas realizadas como `anon` o `authenticated` mediante el Data API;
- `SUPABASE_SECRET_KEY` y `service_role` siguen reservados para operaciones administrativas del
  servidor y también omiten RLS;
- cambiar el usuario de `DATABASE_URL` requiere crear y desplegar primero un rol de aplicación con
  permisos explícitos; no debe hacerse sustituyendo credenciales a ciegas.

## 2. Matriz de acceso del Data API

- **Organización:** los miembros leen la propia y ADMIN también puede editarla.
- **Miembros:** todos leen los de su organización; ADMIN puede crear, editar y eliminar.
- **Invitaciones:** únicamente ADMIN tiene CRUD dentro de su organización.
- **Servicios y consumibles:** todos los miembros leen; únicamente ADMIN tiene CRUD.
- **Productos:** todos los miembros tienen CRUD operativo dentro de su organización.
- **Clientes y citas:** todos los miembros tienen CRUD dentro de su organización.
- **Transacciones e ítems:** todos los miembros tienen CRUD dentro de su organización.
- **Abonos:** todos los miembros pueden leer y crear dentro de su organización.
- **Movimientos de inventario:** todos los miembros pueden leer y crear.
- **Resúmenes diarios:** todos leen; ADMIN puede crear y editar.
- **Auditoría:** los miembros leen y crean registros únicamente como sí mismos.
- **Chat web:** cada miembro lee, crea y elimina únicamente su propio historial.
- **Administradores de plataforma:** no existe acceso mediante el Data API.
- **anon:** no recibe privilegios sobre ninguno de los recursos anteriores.

Todas las políticas `UPDATE` contienen `USING` y `WITH CHECK`: se valida tanto la fila visible antes
del cambio como la organización y permisos de la fila resultante.

## 3. Decisiones de implementación

### 3.1 Funciones privadas de RLS

Las consultas de membresía viven en el esquema no expuesto `private`. Son `SECURITY DEFINER`, fijan
un `search_path` vacío, comparan siempre contra `auth.uid()` y solo conceden `EXECUTE` a
`authenticated`. Esto evita recursión al proteger `organization_members` y mantiene indexadas las
búsquedas de tenant y rol.

Las funciones de triggers no se exponen ni se pueden invocar directamente desde roles del Data API.

### 3.2 Integridad multiempresa

Las relaciones compuestas impiden mezclar organización con cliente, colaborador, servicio o
producto de otro tenant. Dos triggers completan las relaciones polimórficas:

- un consumible debe pertenecer a la misma organización que el servicio;
- un ítem de venta debe pertenecer a la misma organización que su transacción.

La migración consolida membresías duplicadas conservando la más antigua y reasigna primero las citas
y transacciones que referencien duplicados. Después crea la unicidad `(organization_id, user_id)`.
También conserva una sola invitación pendiente por correo y organización, combina cantidades de
consumibles repetidos y conserva el resumen diario más reciente antes de crear sus índices únicos.

### 3.3 Invariantes

PostgreSQL rechaza, incluso mediante SQL directo:

- roles, categorías, estados, tipos y métodos de pago desconocidos;
- duraciones no positivas y periodos de cita invertidos;
- dinero negativo, abonos nulos o mayores que el total y créditos sin cliente;
- abonos acumulados que superen el total de su transacción;
- cantidades no positivas, stock negativo o aritmética de movimiento incoherente;
- movimientos cuyo stock final no coincida con el stock persistido del producto;
- consumibles, citas, ventas e ítems asociados a otro tenant;
- chats vacíos o con roles no soportados;
- membresías, consumibles y resúmenes diarios duplicados.

El stock y sus movimientos usan `numeric(12,4)` y la aplicación conserva valores decimales sin
redondearlos. Así, un consumo fraccionario queda trazado con la misma precisión que se persiste en el
producto.

Las restricciones añadidas sobre tablas con datos históricos se crean `NOT VALID`: protegen toda
fila nueva o modificada sin bloquear el despliegue por datos heredados. Antes de validarlas sobre
producción debe ejecutarse una auditoría de filas existentes y, después de corregir cualquier
hallazgo, `ALTER TABLE ... VALIDATE CONSTRAINT ...`. La base vacía del CI sí queda completamente
cubierta por pruebas de escritura inválida.

## 4. Cadena reproducible de migraciones

La migración `0001_analytics_indexes.sql` ahora declara `transaction_payments` antes de crear sus
índices. `0004_database_security.sql` reconcilia las tablas y columnas que existían en la aplicación
pero no en el historial, y después aplica restricciones, índices, privilegios y RLS.

`src/core/database/schema.sql` queda deliberadamente sin DDL: contenía un prototipo MVP incompatible
con el modelo multiempresa. Las únicas fuentes canónicas son las migraciones y el esquema tipado de
Drizzle.

El pipeline de base de datos, activado únicamente cuando el selector marca el componente `database`,
ejecuta:

```bash
supabase start
supabase db reset --local
supabase test db
```

La versión del CLI queda fijada en `2.101.0` y la pila local en PostgreSQL 17 para evitar cambios
silenciosos del entorno de validación.

## 5. Cobertura pgTAP

Las pruebas usan transacciones con `ROLLBACK` y datos aislados:

- `01_security_shape.test.sql`: RLS, FORCE RLS, ACL, políticas de UPDATE, funciones privadas y roles
  que omiten o respetan RLS;
- `02_tenant_rls.test.sql`: dos organizaciones, ADMIN y BARBER, lectura y CRUD positivos, intentos
  cruzados, recursos hijos, invitaciones y chat por usuario;
- `03_integrity.test.sql`: restricciones financieras, agenda, inventario, unicidad y relaciones
  cruzadas mediante SQL directo.

## 6. Validación manual después del pipeline

1. Confirmar que el job **Migraciones, RLS e integridad PostgreSQL** termina correctamente.
2. Revisar que `supabase db reset --local` aplica `0000` a `0004` sin depender de datos o tablas
   preexistentes.
3. Confirmar que las tres suites pgTAP terminan con `Result: PASS`.
4. Iniciar sesión con un ADMIN y comprobar servicios, equipo, inventario, agenda, clientes y Caja.
5. Iniciar sesión con un BARBER y comprobar que puede consultar servicios, pero no administrar el
   catálogo ni ver invitaciones.
6. Con dos organizaciones de prueba, intentar usar desde una acción el identificador de cliente,
   producto, cita o transacción de la otra; debe rechazarse o afectar cero filas.
7. Registrar una venta de un servicio con consumible decimal y confirmar que el stock y el
   movimiento conservan la misma precisión.
8. No aplicar `supabase db push` ni migraciones a producción durante esta rama apilada. La auditoría
   y validación de restricciones históricas se realiza antes de la entrega final.

## 7. Verificación previa al despliegue final

Consultar el rol real de cada conexión sin registrar credenciales:

```sql
SELECT current_user,
       rolbypassrls,
       rolsuper
FROM pg_roles
WHERE rolname = current_user;
```

Auditar restricciones pendientes:

```sql
SELECT conrelid::regclass AS table_name,
       conname,
       pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE connamespace = 'public'::regnamespace
  AND NOT convalidated
ORDER BY conrelid::regclass::text, conname;
```

La entrega final debe registrar el resultado de estas consultas en el entorno de staging sin incluir
la URL, contraseña, JWT ni claves de servicio.
