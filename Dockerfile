# Etapa 1: Instalar dependencias
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copiar archivos de dependencias
COPY package.json package-lock.json* ./
# Instalar dependencias usando clean install (o npm install si no hay lockfile limpio)
RUN npm ci

# Etapa 2: Compilar el proyecto
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Deshabilitar telemetría de Next.js durante la construcción (opcional)
ENV NEXT_TELEMETRY_DISABLED 1

# Construir la aplicación
RUN npm run build

# Etapa 3: Entorno de producción (Runner)
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV production
# Deshabilitar telemetría de Next.js en tiempo de ejecución
ENV NEXT_TELEMETRY_DISABLED 1

# Crear usuario y grupo no root para mayor seguridad
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copiar la carpeta public para archivos estáticos
COPY --from=builder /app/public ./public

# Configurar los permisos correctos para prerender cache
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Aprovechar el modo "standalone" de Next.js (configurado en next.config.mjs)
# Esto reduce drásticamente el tamaño final de la imagen ya que solo incluye
# los archivos estrictamente necesarios de node_modules.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT 3000
# set hostname to localhost
ENV HOSTNAME "0.0.0.0"

# server.js es generado por Next.js usando output: 'standalone'
CMD ["node", "server.js"]
