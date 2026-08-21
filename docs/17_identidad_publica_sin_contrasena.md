# Etapa 03 — Identidad pública sin contraseña

## Resultado

La etapa incorpora un flujo aislado para que un cliente final demuestre la propiedad de su correo
o teléfono mediante Supabase Auth, sin crear una contraseña y sin recibir membresía administrativa.
La capacidad nace apagada para todas las organizaciones.

## Separación de sesiones

- La sesión administrativa conserva la cookie estándar de Supabase usada por el dashboard.
- La sesión pública usa `trimora-public-auth` como clave de almacenamiento independiente.
- Cerrar la sesión pública usa `scope: local` y no elimina la cookie administrativa.
- `requireCustomerActor()` sólo acepta la cookie pública y exige una identidad activa vinculada a
  la organización resuelta desde el `slug`.
- `requireActor()` no cambia: un cliente sin membresía sigue sin poder abrir el dashboard.

## Seguridad y datos

- `public_identity_challenges`, `customer_identities` y `public_identity_events` tienen RLS
  habilitada y forzada.
- `anon` y `authenticated` no tienen permisos directos sobre esas tablas.
- El contacto no se almacena en desafíos ni auditoría. Se persiste un HMAC SHA-256 usando la
  variable obligatoria y estable `PUBLIC_IDENTITY_HASH_SECRET`.
- El servidor limita solicitudes a tres por contacto y diez por IP cada quince minutos.
- Cada desafío vence en diez minutos, permite como máximo cinco intentos y sólo puede consumirse
  una vez.
- Las respuestas de solicitud son neutrales y no confirman si el contacto o el cliente existían.
- Los conflictos o duplicados no se fusionan automáticamente; requieren revisión administrativa.
- Las búsquedas, inserciones y sesiones siempre incluyen la organización resuelta en servidor.

## Canales

Correo está disponible mediante el proveedor SMTP configurado en Supabase Auth. La plantilla debe
incluir `{{ .Token }}` para entregar un código que pueda escribirse en la pantalla.

Teléfono permanece oculto y rechazado mientras `PUBLIC_PHONE_OTP_ENABLED` no sea `true`. Antes de
activarlo se debe configurar y probar un proveedor SMS compatible en Supabase Auth. Esta bandera es
global y no contiene secretos.

## Activación piloto

1. Publicar la migración con `npx supabase db push` y revisar que no proponga eliminaciones.
2. Crear `PUBLIC_IDENTITY_HASH_SECRET` con al menos 32 bytes aleatorios en Vercel. No debe
   reutilizarse, publicarse ni rotarse sin una migración controlada de huellas.

   ```powershell
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
   ```

3. Desplegar la aplicación manteniendo la identidad apagada.
4. En **Agenda → Configurar disponibilidad**, pulsar **Habilitar acceso piloto** para la
   organización de prueba. La acción está limitada a `ADMIN` y deja auditoría.
5. Abrir el enlace presentado por la interfaz:
   `/reservar/{slug}/acceso`.
6. Solicitar y verificar un código con un correo controlado de prueba.
7. Confirmar que el cliente quedó vinculado o creado una sola vez y que no obtuvo membresía.
8. Mantener `PUBLIC_PHONE_OTP_ENABLED=false` hasta verificar el proveedor SMS.

## Prueba de regresión

- Iniciar y cerrar sesión administrativa antes y después de verificar al cliente.
- Confirmar que el cliente público recibe redirección o rechazo al intentar abrir `/dashboard`.
- Verificar que un código incorrecto, vencido o reutilizado no crea identidades.
- Solicitar códigos repetidamente y confirmar la respuesta neutral al alcanzar el límite.
- Probar el mismo contacto en dos organizaciones piloto y confirmar aislamiento.
- Revisar Inicio, Agenda, Caja, Clientes, Inventario, Servicios y Analítica.
- Revisar que logs y respuestas no contengan correo, teléfono, OTP, tokens o cookies.

## Rollback

Pulsar **Deshabilitar acceso** en la configuración administrativa. Esto apaga
`public_identity_enabled`; las sesiones existentes dejan de resolver `requireCustomerActor()` y
las relaciones aditivas se conservan para auditoría. Si se restaura una versión anterior de la
aplicación, el esquema nuevo puede permanecer sin uso y no requiere borrar datos.
