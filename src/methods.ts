export function identity<T>(value: T): T {
  return value
}

export function asyncIdentity<T>(value: T): Promise<T> {
  return Promise.resolve(value)
}
