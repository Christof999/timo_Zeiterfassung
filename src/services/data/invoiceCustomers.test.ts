import { describe, it, expect, vi } from 'vitest'

// Die Firebase-Verbindung wird für die reine Umwandlung nicht gebraucht.
vi.mock('../invoiceFirebase', () => ({
  invoiceDbInstance: null,
  invoiceAuthReady: Promise.resolve()
}))

import { getInvoiceCustomers, mapInvoiceCustomer } from './invoiceCustomers'

describe('mapInvoiceCustomer', () => {
  it('übernimmt ID, Name, Kontakt und Adressen', () => {
    const customer = mapInvoiceCustomer('abc123', {
      name: ' Augustinum Roth ',
      customerNumber: 'K-042',
      contact: { email: 'info@example.org', phone: '09171 1234' },
      address: { street: 'Musterweg 1', zipCode: '91154', city: 'Roth', country: 'Deutschland' },
      siteAddress: { street: 'Baustraße 5', zipCode: '91154', city: 'Roth', country: '' },
      isActive: true
    })
    expect(customer).toEqual({
      id: 'abc123',
      name: 'Augustinum Roth',
      customerNumber: 'K-042',
      email: 'info@example.org',
      phone: '09171 1234',
      address: 'Musterweg 1, 91154 Roth',
      siteAddress: 'Baustraße 5, 91154 Roth',
      isActive: true,
      source: 'rechnung'
    })
  })

  it('nimmt ohne Baustellenadresse die Kundenadresse als Baustelle', () => {
    const customer = mapInvoiceCustomer('x', {
      name: 'Muster',
      address: { street: 'Musterweg 1', zipCode: '91154', city: 'Roth' }
    })
    expect(customer.siteAddress).toBe('Musterweg 1, 91154 Roth')
  })

  it('übernimmt Zahlungsziel und Skontovereinbarung aus dem Rechnungsprogramm', () => {
    const customer = mapInvoiceCustomer('x', {
      name: 'Muster', paymentTerms: 30, cashDiscount: { percentage: 2.5, days: 10 }
    })
    expect(customer.paymentTerms).toBe(30)
    expect(customer.cashDiscount).toEqual({ percentage: 2.5, days: 10 })
  })

  it('übernimmt auch sofortige Fälligkeit und den Wechsel zurück auf netto', () => {
    const customer = mapInvoiceCustomer('x', {
      name: 'Muster', paymentTerms: 0, cashDiscount: null
    })
    expect(customer.paymentTerms).toBe(0)
    expect(customer.cashDiscount).toBeUndefined()
  })

  it.each([
    { paymentTerms: -1, cashDiscount: { percentage: 101, days: 10 } },
    { paymentTerms: '30', cashDiscount: { percentage: '2', days: 10 } },
    { paymentTerms: 2.5, cashDiscount: { percentage: 2, days: 0 } },
    { paymentTerms: Infinity, cashDiscount: { percentage: 2, days: 1.5 } },
  ])('übernimmt keine ungültigen Zahlungskonditionen: %j', (data) => {
    const customer = mapInvoiceCustomer('x', { name: 'Muster', ...data })
    expect(customer.paymentTerms).toBeUndefined()
    expect(customer.cashDiscount).toBeUndefined()
  })

  it('kommt mit lückenhaften Datensätzen zurecht', () => {
    expect(mapInvoiceCustomer('x', { name: 'Muster', isActive: false })).toEqual({
      id: 'x',
      name: 'Muster',
      isActive: false,
      source: 'rechnung'
    })
  })
})

describe('getInvoiceCustomers', () => {
  it('liefert ohne eingerichtete Verbindung eine leere Liste', async () => {
    expect(await getInvoiceCustomers()).toEqual([])
  })
})
