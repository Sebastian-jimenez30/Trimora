# Fronteras de servidor y autorización

## Propósito

Esta arquitectura evita que el navegador decida la identidad, organización, rol, precios o
pertenencia de un recurso. Un Client Component puede solicitar una operación, pero la decisión
y la mutación se ejecutan en el servidor con datos persistidos.

## Flujo obligatorio

```text
Client Component
      |
      v
Server Action / Route Handler        <- valida la entrada externa con Zod
      |
      v
requireActor() / requirePlatformAdmin()
      |
      +-- Supabase Auth: identidad autenticada
      +-- PostgreSQL: membresía, organización, rol o concesión global
      |
      v
Caso de uso y consultas server-only  <- valida pertenencia de cada recurso
      |
      v
PostgreSQL / servicios privados
      |
      v
DTO explícito y mínimo hacia la interfaz
```

`user_metadata` puede seguir guardando datos de presentación, como nombre y avatar. Nunca se
usa para autorizar una operación ni para escoger la organización.

## Estructura de referencia

- `domain/`: roles, invariantes y esquemas que no dependen de la interfaz;
- `application/`: políticas y casos de uso;
- `server/`: acceso privado, DAL e integraciones; debe importar `server-only`;
- `interface/`: DTOs que pueden cruzar hacia la interfaz;
- `actions.ts` o Route Handlers: adaptadores de entrada, no fuentes de confianza.

La estructura se aplica de forma inmediata a autenticación y a todo código nuevo. Los módulos
existentes conservan sus rutas públicas para no romper la UI, pero sus acciones resuelven el actor
en servidor y sus contratos de entrada viven en `domain/` cuando se refactoriza el caso de uso.

## Identidad de organización

`requireActor()` realiza estas comprobaciones:

1. obtiene el usuario con `supabase.auth.getUser()`;
2. busca una membresía persistida en `organization_members`;
3. valida que el rol sea uno de `ADMIN`, `BARBER` o `RECEPTIONIST`;
4. comprueba la política de roles solicitada;
5. devuelve un `ActorDto` inmutable con campos limitados.

Cuando una operación recibe un identificador, la consulta debe incluir simultáneamente el ID y
`actor.organizationId`. Las relaciones sin `organization_id` solo se consultan a través de un
padre previamente validado para la organización.

## Superadministración

El acceso global se concede mediante `platform_admins`; no depende de un correo codificado ni de
metadatos editables. Cada concesión tiene responsable, razón, fecha de creación y posible fecha de
revocación. La migración `0003_platform_admins.sql` conserva el administrador heredado si esa
cuenta existe al aplicarla.

Una concesión posterior debe hacerse mediante una migración o un procedimiento administrativo
controlado y dejar siempre `granted_by` y `reason`. La revocación es lógica:

```sql
update platform_admins
set revoked_at = now()
where user_id = '<uuid-del-usuario>' and revoked_at is null;
```

No se debe borrar la fila porque forma parte de la trazabilidad.

## Datos privados

Los módulos de base de datos, cliente administrativo de Supabase, correo, IA y herramientas de
integración están marcados con `server-only`. Si uno de ellos se importa desde un Client Component,
Next.js debe detener el build. Las páginas de servidor entregan a la UI solo los campos requeridos;
por ejemplo, equipo no serializa el objeto completo de Supabase Auth.

## Matriz inicial de permisos

| Operación                                   |        ADMIN         | RECEPTIONIST | BARBER |
| ------------------------------------------- | :------------------: | :----------: | :----: |
| Operación diaria de agenda, clientes y caja |          Sí          |      Sí      |   Sí   |
| Configuración de servicios y consumibles    |          Sí          |      No      |   No   |
| Invitaciones, roles y bajas de equipo       |          Sí          |      No      |   No   |
| Administración global de organizaciones     | Con concesión global |      No      |   No   |

Esta matriz expresa el comportamiento actual. Ampliarla requiere una política en
`src/core/auth/application`, pruebas de la matriz y una decisión de arquitectura.

## Reglas para cambios futuros

- No aceptar `organizationId`, rol, precio, total o propietario desde el navegador como dato fiable.
- No usar `getSession()` para autorizar en servidor; usar usuario verificado y datos persistidos.
- Validar FormData, JSON, params y search params antes de consultar PostgreSQL.
- Aplicar la organización en `SELECT`, `UPDATE` y `DELETE`, no filtrar después en memoria.
- Reconstruir precio, nombre y total de una venta desde el catálogo del servidor.
- No devolver objetos completos de Auth, excepciones SQL, secretos ni registros innecesarios.
- Probar sesión ausente, rol incorrecto, ID de otra organización y entrada inválida.

## Prueba manual de aceptación de la etapa 02

1. Iniciar sesión como `ADMIN` y comprobar Inicio, Agenda, Caja, Clientes, Inventario, Servicios,
   Equipo y Analítica.
2. Crear y editar una cita con cliente, colaborador y servicio de la misma organización.
3. En Caja, registrar una venta y confirmar que el total usa los precios actuales del catálogo.
4. Intentar alterar en DevTools el precio o nombre enviado por la UI; el movimiento debe conservar
   los valores del servidor.
5. Intentar llamar una Server Action con un UUID de otra organización; no debe mutar ninguna fila.
6. Entrar como `BARBER` o `RECEPTIONIST`: Servicios, Equipo y acciones administrativas deben ser
   rechazadas aunque se invoque la acción directamente.
7. Abrir `/superadmin` sin una concesión activa en `platform_admins`; debe denegar el acceso.
8. Aceptar una invitación con el correo correcto y comprobar que crea una sola membresía. Repetir
   el enlace no debe duplicarla.
9. Subir avatar JPG, PNG o WebP menor de 5 MB; un archivo de otro tipo o mayor debe rechazarse.
10. Confirmar en la PR que el selector identifica `auth-access` y ejecuta sus consumidores.
