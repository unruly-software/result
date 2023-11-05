import { AsyncResult } from './AsyncResult'
import { asyncIdentity, identity } from './methods'

export abstract class Result<T, F extends Error = Error> {
  /**
   * Immediately invoke an unsafe function and return a result type
   *
   * @example
   * ```ts
   * Result.invoke(JSON.parse, '{}').map(...)
   * ```
   */
  static invoke<FN extends (...args: any[]) => any>(
    throwable: FN,
    ...args: Parameters<FN>
  ): Result<ReturnType<FN>> {
    try {
      return Success.of(throwable(...args)) as any
    } catch (e) {
      return Fail.of(e) as any
    }
  }

  static invokeAsync = AsyncResult.invoke

  /**
   * Wraps a potentially unsafe function and makes it return a result type
   *
   * @example
   * ```ts
   * const safeParse = Result.wrap(JSON.parse)
   * safeParse('{}').map(...)
   * ```
   */
  static wrap<FN extends (...args: any[]) => any>(fn: FN) {
    return (
      ...args: Parameters<FN>
    ): FN extends (...args: any[]) => infer RT ? Result<RT> : never => {
      return Result.invoke(() => fn(...args)) as any
    }
  }

  static wrapAsync = AsyncResult.wrap

  /**
   * Create an AsyncResult from a pending Promise
   *
   * @example
   * ```ts
   * Result.fromPromise(fetch('https://example.com')).map(...)
   * ```
   */
  static fromPromise = AsyncResult.fromPromise

  static fromPromiseAsync = AsyncResult.fromPromise

  /**
   * Create a successful result. Useful for testing
   *
   * @example
   * ```ts
   * Result.success('foo').map(...)
   * ```
   */
  static success<T, F extends Error = Error>(value: T): Result<T, F> {
    return Success.of(value) as any
  }

  static successAsync = AsyncResult.success

  /**
   * Create a failed result. Useful for testing
   *
   * @example
   * ```ts
   * Result.fail(new Error('foo')).map(...)
   * ```
   **/
  static fail<T = unknown, F extends Error = Error>(value: F): Result<T, F> {
    return Fail.of(value) as any
  }

  static failAsync = AsyncResult.fail

  /**
   * Transform the data in a Result by applying a function to a contained
   * success value, leaving an error value untouched or optionally changing it
   * as well.
   *
   * @example
   * ```ts
   * Result.success('foo').map((value) => value.toUpperCase()) // Result<'FOO'>
   * ```
   */
  abstract map<X, Y extends Error = F>(
    mapSuccess: (success: T) => X,
    mapError?: (error: F) => Y,
  ): Result<X, Y>

  /**
   * Transform the data in a Result by applying a function to a contained
   * success value asynchronously, leaving an error value untouched or
   * optionally changing it as well.
   *
   * @example
   * ```ts
   * Result.success('userId').mapAsync(getUser) // AsyncResult<User>
   * ```
   *
   */
  abstract mapAsync<X, Y extends Error = F>(
    mapSuccess: (success: T) => Promise<X>,
    mapError?: (error: F) => Promise<Y>,
  ): AsyncResult<X, Y>

  /**
   * Returns the success value or the error value if the result is a failure.
   *
   * @example
   * ```ts
   * Result.invoke(JSON.parse, '{').getEither() // SyntaxError
   * Result.invoke(JSON.parse, '{}').getEither() // {}
   * ```
   */
  abstract getEither(): F | T

  /**
   * Checks if this result is a success. This should be checked before calling
   * `.get()`.
   *
   * Should only be used as an escape hatch for interop with legacy code.
   *
   * @example
   * ```ts
   * const result = Result.invoke(JSON.parse, '{}')
   * if (result.isSuccess()) {
   *  result.get() // {}
   * }
   */
  abstract isSuccess(): this is Success<T>

  /**
   * Checks if this result is a failure.
   *
   * Should only be used as an escape hatch for interop with legacy code.
   *
   * @example
   * ```ts
   * const result = Result.invoke(JSON.parse, '{')
   * if (result.isFail()) {
   *   result.get() // SyntaxError
   * }
   */
  abstract isFail(): this is Fail<F>

  /**
   * Transform the failure value by applying a function to it.
   *
   * @example
   * ```ts
   * Result.invoke(JSON.parse, '{')
   *   .mapFailure((error) => new ParsingError(error.message)) // Result<unknown, string>
   * ```
   **/
  mapFailure<X extends Error>(mapFailure: (failed: F) => X): Result<T, X> {
    return this.map(identity, mapFailure)
  }

  /**
   * Transform the failure value by applying a function to it asynchronously.
   *
   * @example
   * ```ts
   * Result.invoke(JSON.parse, '{')
   *  .mapFailureAsync(enrichErrorAsync) // AsyncResult<any, ParsingError>
   */
  mapFailureAsync<X extends Error>(
    mapFailure: (failed: F) => Promise<X>,
  ): AsyncResult<T, X> {
    return this.mapAsync(asyncIdentity, mapFailure)
  }

  /**
   * Access either the success or error value without changing the type.
   * This is useful for chaining together a sequence of computations where
   * you want to insert logging, validation or any other side effect.
   *
   * If these functions throw an error, the result will be a failure.
   *
   * @example
   * ```ts
   * Result.invoke(JSON.parse, '{}')
   *   .tap(console.log, console.error)
   *   .map(...)
   * ```
   */
  tap(
    tapSuccess: (success: T) => unknown,
    tapError?: (error: F) => unknown,
  ): Result<T, F> {
    return this.map(
      (value) => {
        tapSuccess(value)
        return value
      },
      (error) => {
        tapError?.(error)
        return error
      },
    )
  }

  /**
   * Access either the success or error value asynchronously without changing
   * the type. This is useful for chaining together a sequence of computations
   * where you want to insert logging, validation or any other side effect.
   *
   * If these functions throw an error, the result will be a failure.
   *
   * @example
   * ```ts
   * await Result
   *  .invoke(JSON.parse, '{}')
   *  .tapAsync(console.log, console.error)
   *  .map(...)
   *  ```
   */
  tapAsync(
    tapSuccess: (success: T) => Promise<unknown>,
    tapError?: (error: F) => Promise<unknown>,
  ): AsyncResult<T, F> {
    return this.mapAsync(
      async (value) => {
        await tapSuccess(value)
        return value
      },
      async (error) => {
        await tapError?.(error)
        return error
      },
    )
  }

  /**
   * Identical to '.map' but expects a Result to be returned from the
   * mapping function.
   *
   * @example
   * ```ts
   * const validate = Result.wrap(validator)
   * const parse = Result.wrap(JSON.parse)
   *
   * parse('{}').flatMap(validate) // Result<Parsed, Error>
   */
  flatMap<X, XF extends Error>(
    mapSuccess: (success: T) => Result<X>,
    mapError?: (error: F) => Result<XF>,
  ): Result<X, XF> {
    return this.map(mapSuccess, (err) =>
      mapError ? mapError(err).get() : err,
    ).map((s) => s.get())
  }

  /**
   * Identical to '.mapAsync' but expects a Result to be returned from the
   * mapping function.
   *
   * @example
   * ```ts
   * const parse = Result.wrapAsync(JSON.parse)
   * const getUser = parse('{}')
   *   .map(data => data.userId)
   *   .flatMapAsync(requireUserById) // AsyncResult<User, Error>
   */
  flatMapAsync<X, XF extends Error = F>(
    mapSuccess: (success: T) => AsyncResult<X>,
    mapError?: (error: F) => AsyncResult<XF>,
  ): AsyncResult<X, XF | F> {
    return this.mapAsync(
      async (result) => {
        return await mapSuccess(result).get()
      },
      async (err) => (mapError ? await mapError(err).get() : err),
    )
  }

  /**
   * Apply a function to either the success or failure value and in the process
   * recover from a failure.
   */
  mapEither<X>(map: (value: T | F) => X): Result<X, F> {
    const mapFunc = this.isFail() ? this.recover : this.map
    return mapFunc.call(this, map)
  }

  /**
   * Apply a function to either the success or failure value asynchronously
   * and in the process recover from a failure.
   */
  mapEitherAsync<X>(map: (value: T | F) => Promise<X>): AsyncResult<X> {
    const mapFunc = this.isFail() ? this.recoverAsync : this.mapAsync
    return mapFunc.call(this, map)
  }

  /**
   * Apply a function to either the success or failure value  without modifying its value
   **/
  tapEither(tap: (value: T | F) => unknown): Result<T, F> {
    return this.tap(tap, tap)
  }

  /**
   * Apply a function to either the success or failure value asynchronously
   * without modifying its value
   **/
  tapEitherAsync(tap: (value: T | F) => Promise<unknown>): AsyncResult<T, F> {
    return this.tapAsync(tap, tap)
  }

  /**
   * Attempt to recover from a failure by mapping the error value to a success
   * value. If the result is a success, the mapping function is ignored.
   *
   * If the result is a failure, the mapping function is invoked and the
   * result is returned. If the mapping function throws an error, the result
   * will be a failure.
   *
   * @example
   * ```ts
   * Result.invoke(JSON.parse, '{')
   *  .recover((error) => ({})) // Result<{}, Error>
   *
   */
  recover<R, FF extends Error = Error>(
    mapError: (err: F) => R,
  ): Result<T | R, FF> {
    if (this.isFail()) {
      return Result.invoke(() => {
        return mapError(this.getEither() as F)
      }) as any
    }
    return this.map(identity)
  }

  /**
   * Attempt to recover from a failure by mapping the error value to a success
   * value. If the result is a success, the mapping function is ignored.
   * If the result is a failure, the mapping function is invoked and the
   * result is returned. If the mapping function throws an error, the result
   * will be a failure.
   *
   * @example
   * ```ts
   * await Result.invoke(JSON.parse, '{')
   *   .recoverAsync(loadDefaultData) // AsyncResult<DefaultData, Error>
   * ```
   */
  recoverAsync<R>(mapError: (err: F) => Promise<R>): AsyncResult<T | R> {
    if (this.isFail()) {
      return AsyncResult.fromPromise(mapError(this.getEither() as F)) as any
    }
    return this.mapAsync(asyncIdentity)
  }

  /**
   * Directly access the success value. If the result is a failure, the error
   * value is thrown.
   *
   * @example
   * ```ts
   * Result.invoke(JSON.parse, '{}').get() // {}
   * Result.invoke(JSON.parse, '{').get() // throws
   * Result.invoke(JSON.parse, '{').get({}) // {}
   * ```
   */
  get(): T {
    if (this.isFail()) {
      throw this.getEither()
    } else {
      return this.getEither() as T
    }
  }
}

export class Success<T> extends Result<T, Error> {
  protected constructor(private value: T) {
    super()
  }

  static of<E>(value: E): Success<E> {
    return new Success(value)
  }

  override map<X, Y extends Error = Error>(
    mapSuccess: (success: T) => X,
  ): Result<X, Y> {
    try {
      return Result.success<X, Y>(mapSuccess(this.value))
    } catch (e) {
      return Result.fail<X, Y>(e)
    }
  }

  override mapAsync<X, Y extends Error = Error>(
    mapSuccess: (success: T) => Promise<X>,
  ): AsyncResult<X, Y> {
    return AsyncResult.fromPromise(mapSuccess(this.value))
  }

  override getEither(): T {
    return this.value
  }

  override isSuccess(): this is Success<T> {
    return true
  }

  override isFail(): this is Fail<Error> {
    return false
  }
}

export class Fail<E extends Error> extends Result<unknown, E> {
  static of<E extends Error>(value: E): Fail<E> {
    return new Fail(value)
  }

  protected constructor(private value: E) {
    super()
  }
  override map<X, Y extends Error = E>(
    _: (success: unknown) => X,
    mapError?: (error: E) => Y,
  ): Result<X, Y> {
    try {
      return mapError
        ? new Fail(mapError(this.value))
        : (new Fail(this.value) as any)
    } catch (e) {
      return new Fail(e) as any
    }
  }

  override mapAsync<X, Y extends Error = E>(
    _: (success: unknown) => Promise<X>,
    mapError?: (error: E) => Promise<Y>,
  ): AsyncResult<X, Y> {
    if (mapError) {
      return AsyncResult.unwrapResult(
        Promise.resolve(mapError(this.value)).then((err) => Fail.of(err)),
      ) as any
    } else {
      return AsyncResult.unwrapResult(Promise.resolve(this) as any) as any
    }
  }

  override getEither(): E {
    return this.value
  }

  override isSuccess(): false {
    return false
  }

  override isFail(): this is Fail<E> {
    return true
  }
}
