import type { LvPosition } from './inspection'

export interface Measurement {
  id: string
  title: string
  customerId: string
  customerName: string
  address: string
  text: string
  positions: LvPosition[]
  positionsSourceText: string
  createdBy: string
  updatedAt: Date
}
