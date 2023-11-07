export function identity<T>(value: T): T {
  return value
}

export function asyncIdentity<T>(value: T): Promise<T> {
  return Promise.resolve(value)
}

type Enumerate<
  N extends number,
  Acc extends number[] = [],
> = Acc['length'] extends N
  ? Acc[number]
  : Enumerate<N, [...Acc, Acc['length']]>

export type IntRange<F extends number, T extends number> = Exclude<
  Enumerate<T>,
  Enumerate<F>
>
