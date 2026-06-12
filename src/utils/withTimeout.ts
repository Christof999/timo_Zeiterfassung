export class TimeoutError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TimeoutError'
  }
}

/** Bricht ab, wenn die Promise länger als ms dauert (verhindert endloses „Speichere…“). */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message = 'Zeitüberschreitung'
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new TimeoutError(message))
    }, ms)

    promise
      .then((value) => {
        window.clearTimeout(timer)
        resolve(value)
      })
      .catch((err) => {
        window.clearTimeout(timer)
        reject(err)
      })
  })
}
