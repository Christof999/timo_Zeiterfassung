import { collection, getDocs } from 'firebase/firestore'
import { invoiceAuthReady, invoiceDbInstance } from '../invoiceFirebase'
import type { Customer } from '../../types'

/** Postanschrift, wie sie das Rechnungsprogramm speichert. */
interface InvoiceAddress {
  street?: string
  zipCode?: string
  city?: string
}

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

/** Adresse einzeilig: „Musterweg 1, 91792 Stopfenheim“ (leere Teile entfallen). */
const formatAddressOneLine = (address?: InvoiceAddress | null): string => {
  if (!address) return ''
  const place = [text(address.zipCode), text(address.city)].filter(Boolean).join(' ')
  return [text(address.street), place].filter(Boolean).join(', ')
}

/**
 * Kunde aus dem Rechnungsprogramm in die Form der Zeiterfassung bringen.
 *
 * Die Dokument-ID bleibt erhalten: das Rechnungsprogramm findet Projekte und
 * Kleinaufträge eines Kunden über genau diese ID wieder.
 */
export const mapInvoiceCustomer = (id: string, data: Record<string, any>): Customer => {
  const address = formatAddressOneLine(data.address)
  // Ohne eigene Baustellenadresse gilt die Kundenadresse auch als Baustelle.
  const siteAddress = formatAddressOneLine(data.siteAddress) || address
  return {
    id,
    name: text(data.name),
    ...(text(data.customerNumber) ? { customerNumber: text(data.customerNumber) } : {}),
    ...(text(data.contact?.email) ? { email: text(data.contact.email) } : {}),
    ...(text(data.contact?.phone) ? { phone: text(data.contact.phone) } : {}),
    ...(address ? { address } : {}),
    ...(siteAddress ? { siteAddress } : {}),
    isActive: data.isActive !== false,
    source: 'rechnung'
  }
}

/** Kundenstamm des Rechnungsprogramms (Stammfirma), nach Name sortiert. */
export async function getInvoiceCustomers(): Promise<Customer[]> {
  if (!invoiceDbInstance) return []
  await invoiceAuthReady
  const snapshot = await getDocs(collection(invoiceDbInstance, 'customers'))
  return snapshot.docs
    .map((docSnap) => mapInvoiceCustomer(docSnap.id, docSnap.data()))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'))
}
