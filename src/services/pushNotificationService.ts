import { DataService } from './dataService'

export interface PushSupportState {
  isSupported: boolean
  reason?: string
  isIos: boolean
  isStandalone: boolean
}

const applicationServerKey = import.meta.env.VITE_PUSH_VAPID_PUBLIC_KEY

const isIosDevice = (): boolean => {
  const ua = navigator.userAgent || ''
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

const isStandaloneApp = (): boolean => {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true
}

const base64ToUint8Array = (base64: string): Uint8Array<ArrayBuffer> => {
  const normalized = base64.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  const raw = atob(padded)
  const outputArray = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; ++i) {
    outputArray[i] = raw.charCodeAt(i)
  }
  return outputArray
}

class PushNotificationService {
  getSupportState(): PushSupportState {
    const ios = isIosDevice()
    const standalone = isStandaloneApp()

    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      return {
        isSupported: false,
        reason: 'Push wird von diesem Browser nicht unterstützt.',
        isIos: ios,
        isStandalone: standalone
      }
    }

    if (ios && !standalone) {
      return {
        isSupported: false,
        reason: 'Auf iPhone funktioniert Push nur aus der zum Homescreen hinzugefügten App.',
        isIos: ios,
        isStandalone: standalone
      }
    }

    if (!applicationServerKey) {
      return {
        isSupported: false,
        reason: 'VAPID Public Key fehlt (VITE_PUSH_VAPID_PUBLIC_KEY).',
        isIos: ios,
        isStandalone: standalone
      }
    }

    return {
      isSupported: true,
      isIos: ios,
      isStandalone: standalone
    }
  }

  async getCurrentSubscription(): Promise<PushSubscription | null> {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      return null
    }

    const registration = await navigator.serviceWorker.ready
    return registration.pushManager.getSubscription()
  }

  async requestAndSaveSubscription(admin: { id?: string; username?: string; name?: string }): Promise<void> {
    const supportState = this.getSupportState()
    if (!supportState.isSupported) {
      throw new Error(supportState.reason || 'Push wird nicht unterstützt.')
    }

    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
      throw new Error('Benachrichtigungs-Berechtigung wurde nicht erteilt.')
    }

    const registration = await navigator.serviceWorker.ready
    const vapidKey = base64ToUint8Array(applicationServerKey as string)

    let subscription = await registration.pushManager.getSubscription()
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidKey
      })
    }

    await DataService.saveAdminPushSubscription(subscription.toJSON(), admin)
  }

  async disableSubscription(): Promise<void> {
    const subscription = await this.getCurrentSubscription()
    if (!subscription) {
      return
    }

    await DataService.removeAdminPushSubscription(subscription.endpoint)
    await subscription.unsubscribe()
  }

  async showLocalTestNotification(): Promise<void> {
    if (!('serviceWorker' in navigator)) {
      throw new Error('Service Worker wird nicht unterstützt.')
    }

    if (Notification.permission !== 'granted') {
      throw new Error('Benachrichtigungs-Berechtigung fehlt.')
    }

    const registration = await navigator.serviceWorker.ready
    await registration.showNotification('Test-Benachrichtigung', {
      body: 'Push ist auf diesem Gerät aktiv.',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: {
        url: '/admin/dashboard'
      }
    })
  }
}

export const pushNotificationService = new PushNotificationService()
