import { vi } from 'vitest'

// Mock de la base de datos (Drizzle) de forma global
vi.mock('@/core/database/db', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([{ organizationId: 'mock-org-id' }]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockResolvedValue([{}]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockResolvedValue([{}]),
  },
}))

// Mock de Supabase auth de forma global
vi.mock('@/core/database/server', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: {
          user: {
            id: 'mock-user-id',
            user_metadata: {
              organization_id: 'mock-org-id',
            },
          },
        },
      }),
    },
  })),
}))

// Mock de Next.js cache revalidatePath
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))
