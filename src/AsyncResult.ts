import { Result, Fail, Success } from './Result'

import { ResultTimeoutError } from './ResultTimeout'
import { wrapAsyncFunction } from './WrappedFunction'

type UnwrappedAsyncResult<T, E extends Error = Error> = AsyncResult<
  Awaited<T>,
  Awaited<E>
>

export class AsyncResult<T, F extends Error = Error>
  implements PromiseLike<Result<T, F>>
{
  protected constructor(protected promise: Promise<Result<T, F>>) {}

  /**
   * Wrap a function that returns a promise in an AsyncResult.
   *
   * @example
   * ```ts
   * const safeGetUser = AsyncResult.wrap(getUser)
   * const maybeUser = await safeGetUser(userId) // AsyncResult<User, Error>
   * ```
   */
  static wrap = wrapAsyncFunction

  /**
   * Invoke a function that returns a promise and wrap the result in an
   * AsyncResult.
   *
   * If the function throws synchronously or asynchronously, the error will be
   * wrapped in an AsyncResult.
   *
   * @example
   * ```ts
   * const maybeUser = await AsyncResult.invoke(getUser, userId) // AsyncResult<User, Error>
   * ```
   */
  static invoke<FN extends (...args: any[]) => Promise<any>>(
    fn: FN,
    ...args: Parameters<FN>
  ): AsyncResult<ReturnType<FN>> {
    return AsyncResult.fromPromise((async () => fn(...args))())
  }

  /**
   * Adheres to the interface PromiseLike<Result<T, F>> which allows using
   * `await` and `.then()` to allow total interop with promises.
   */
  then<TResult1 = Result<T, F>, TResult2 = never>(
    onfulfilled?:
      | ((value: Result<T, F>) => TResult1 | PromiseLike<TResult1>)
      | null,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.promise.then(onfulfilled, (err) => {
      const fail = Fail.of<F>(err)
      if (onfulfilled) {
        onfulfilled(fail as any)
      }
      return fail as any
    })
  }

  /**
   * Returns an AsyncResult that has failed. Useful for testing.
   *
   * @example
   * ```ts
   * const maybeUser = await AsyncResult.fail<User>(new Error('User not found'))
   * ```
   */
  static fail<T = unknown, F extends Error = Error>(
    error: F,
  ): AsyncResult<T, F> {
    return AsyncResult.fromPromise(Promise.reject(error))
  }

  /**
   * Returns an AsyncResult that has succeeded. Useful for testing.
   *
   * @example
   * ```ts
   * const maybeUser = await AsyncResult.success<User>({ id: 1, name: 'John' })
   * ```
   */
  static success<T, F extends Error = Error>(value: T): AsyncResult<T, F> {
    return AsyncResult.fromPromise(Promise.resolve(value))
  }

  /**
   * Returns an AsyncResult that will resolve to the given value or rejected
   * error.
   *
   * @example
   * ```ts
   * const maybeUser = await AsyncResult.of<User>(getUser(userId))
   * ```
   */
  static fromPromise<T, F extends Error = Error>(
    promise: Promise<T>,
  ): AsyncResult<T, F> {
    return new AsyncResult(
      promise
        .then((v) => (v instanceof Result ? v : Success.of(v)))
        .catch((e) => Fail.of(e)),
    ) as AsyncResult<T, F>
  }

  /**
   * Unwraps results that have somehow been wrapped in promises or are wrapping promises internally
   * promises internally
   *
   * @example
   * Types that should resolve to AsyncResult<T, Error>:
   * ```typescript
   * type Unwrappable =
   *  | Promise<Result<Promise<T>, Error>>
   *  | Promise<Result<T, Promise<Error>>>
   *  | Promise<Result<Promise<T>, Promise<Error>>>
   *  | AsyncResult<T, Error>
   *  | Result<T, Error>
   * ```
   */
  static unwrapResult<R>(
    promiseOrResult: R,
  ): Awaited<R> extends Result<infer T, infer F>
    ? UnwrappedAsyncResult<T, F>
    : never {
    return AsyncResult.invoke(async () => {
      const result = await promiseOrResult
      if (!(result instanceof Result)) {
        throw new TypeError('unwrapResult was called with a non-result type')
      }
      return result.get() as any
    }) as any
  }

  /**
   * Returns a new AsyncResult that will fail if the original AsyncResult does
   * not resolve within the given timeout.
   *
   * @param ms The timeout in milliseconds
   * @param error The error to throw if the timeout is exceeded. Defaults to
   * ResultTimeoutError
   *
   * @example
   * ```ts
   * const result = await AsyncResult
   *   .success(userId)
   *   .withTimeout(1_000)
   *   .flatMap(doSomethingWithUserId) // AsyncResult<Data, ResultTimeout>
   * ```
   *
   */
  withTimeout<E extends Error = ResultTimeoutError>(
    ms: number,
    error?: E,
  ): AsyncResult<T, F | E> {
    return AsyncResult.fromPromise(
      (async () => {
        let timeoutMarker: any
        const timeout = new Promise((_, rej) => {
          timeoutMarker = setTimeout(
            () =>
              rej(
                error ??
                  new ResultTimeoutError(
                    `Timeout of ${ms} milliseconds exceeded`,
                  ),
              ),
            ms,
          )
        })
        try {
          await Promise.race([this, timeout])
        } finally {
          clearTimeout(timeoutMarker)
        }
        return this.get()
      })(),
    )
  }

  async get(): Promise<T> {
    return (await this).get()
  }

  async getEither(): Promise<T | F> {
    return (await this).getEither()
  }

  tap(
    mapSuccess: (success: T) => unknown,
    mapError?: (error: F) => unknown,
  ): AsyncResult<T, F> {
    return new AsyncResult(
      this.then((result) => result.tap(mapSuccess, mapError)),
    )
  }

  tapAsync(
    mapSuccess: (success: T) => Promise<unknown>,
    mapError?: (error: F) => Promise<unknown>,
  ): AsyncResult<T, F> {
    return new AsyncResult(
      this.then((result) => result.tapAsync(mapSuccess, mapError)),
    )
  }

  map<X, Y extends Error = F>(
    mapSuccess: (success: T) => X,
    mapError?: (error: F) => Y,
  ): AsyncResult<X, Y> {
    return new AsyncResult(
      this.then((result) => result.map(mapSuccess, mapError)),
    )
  }

  mapAsync<X, Y extends Error = F>(
    mapSuccess: (success: T) => Promise<X>,
    mapError?: (error: F) => Promise<Y>,
  ): AsyncResult<X, Y> {
    return new AsyncResult(
      this.then((result) => result.mapAsync(mapSuccess, mapError)),
    )
  }

  flatMap<X, XF extends Error = F>(
    mapSuccess: (success: T) => Result<X>,
    mapError?: (error: F) => Result<XF>,
  ): UnwrappedAsyncResult<X, XF | F> {
    return AsyncResult.unwrapResult(
      this.then(async (result) => result.flatMap(mapSuccess, mapError)),
    )
  }

  flatMapAsync<X, XF extends Error = F>(
    mapSuccess: (success: T) => AsyncResult<X>,
    mapError?: (error: F) => AsyncResult<XF>,
  ): UnwrappedAsyncResult<X, XF | F> {
    return AsyncResult.unwrapResult(
      this.then(async (result) => result.flatMapAsync(mapSuccess, mapError)),
    )
  }

  mapFailure<X extends Error = F>(
    mapFailure: (failed: F) => X,
  ): AsyncResult<T, X> {
    return new AsyncResult(this.then((result) => result.mapFailure(mapFailure)))
  }
}
