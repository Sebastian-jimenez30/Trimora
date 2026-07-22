import { describe, it, expect, vi, beforeEach } from 'vitest'
import { batchImportProducts } from '../actions'
import { db } from '@/core/database/db'
import { revalidatePath } from 'next/cache'

describe('Inventory Module Actions - batchImportProducts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('debería retornar error si no se envían productos (array vacío)', async () => {
    const result = await batchImportProducts([])
    expect(result.success).toBe(false)
    expect(result.error).toBe('No hay productos para importar o formato inválido')
  })

  it('debería retornar error si un producto no tiene categoría válida', async () => {
    const invalidItems = [
      { name: 'Cera', category: 'INVALIDA' }
    ]
    
    const result = await batchImportProducts(invalidItems)
    expect(result.success).toBe(false)
    expect(result.error).toContain('Error validando el producto "Cera"')
  })

  it('debería insertar los productos correctamente si la validación pasa', async () => {
    const validItems = [
      { name: 'Gel', category: 'VENTA', salePrice: 15 },
      { name: 'Shampoo', category: 'CONSUMO' }
    ]

    // Ejecutamos la función
    const result = await batchImportProducts(validItems)

    // Validamos el resultado
    expect(result.success).toBe(true)

    // Validamos que se haya llamado a la base de datos con los datos correctos
    expect(db.insert).toHaveBeenCalledTimes(1)
    
    // Validamos que los datos se hayan saneado (ej. strings/numbers a strings, defaults)
    expect(db.values).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Gel',
          category: 'VENTA',
          salePrice: "15",
          organizationId: 'mock-org-id' // Viniendo del mock de Supabase
        }),
        expect.objectContaining({
          name: 'Shampoo',
          category: 'CONSUMO',
          currentStock: '0', // Valor default transformado por Zod
          organizationId: 'mock-org-id'
        })
      ])
    )

    // Validamos que Next.js revalide el path del inventario
    expect(revalidatePath).toHaveBeenCalledWith('/inventario')
  })
})
