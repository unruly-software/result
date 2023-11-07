import { AsyncResult } from './AsyncResult'
import { ResultTimeoutError } from './ResultTimeout'
import { IntRange } from './methods'

interface CalculatedRetry {
  /** The number of milliseconds to wait before retrying */
  retryInMS: number
}

type RetriesConfig<P, MaxRetries extends number> =
  | /**
   * Each time the wrapped function throws an error, this function will be
   * called to determine how long to wait before retrying.
   *
   * @example Retrying a rate limit every 1000ms up to 5 times
   * ```ts
   *  ({error, retries, args}) => {
   *   if (error instanceof RateLimitError && retries < 5) {
   *     return {retryInMS: 1000}
   *   }
   *   return null
   *  }
   * ```
   */
  ((attempt: {
      /**
       * The error that was thrown by the wrapped function
       */
      error: Error
      /**
       * The number of retries that have been attempted so far
       */
      retries: number
      /**
       * The arguments that were passed to the wrapped function
       */
      args: P
    }) => Promise<CalculatedRetry | null> | CalculatedRetry | null)
  | {
      /**
       * Initial delay in milliseconds. The first retry will be delayed by this
       * amount. Subsequent retries will be multiplied by the delayMultiplier.
       *
       * The calculation is `initialDelayMS * delayMultiplier ** retries`
       */
      initialDelayMS: number
      /**
       * Given an initial dely of 1000ms and a delay multiplier of 2, the
       * second retry will be delayed by 2000ms, the third by 4000ms, etc.
       *
       * @default 1.75
       */
      delayMultiplier?: number
      /**
       * The maximum number of retries to attempt. The wrapped function will
       * only be called up to this many times.
       */
      maxRetries: MaxRetries
      shouldRetry?: (attempt: {
        args: P
        error: Error
        retries: IntRange<0, MaxRetries>
      }) => boolean
    }

interface AsyncWrappedFunction<P extends any[], RT, F extends Error = Error> {
  (...args: P): AsyncResult<RT, F>

  withTimeout<E extends Error = ResultTimeoutError>(
    ms: number,
    error?: E,
  ): AsyncWrappedFunction<P, RT, F | E>

  withRetries<MaxRetries extends number>(
    config: RetriesConfig<P, MaxRetries>,
  ): AsyncWrappedFunction<P, RT, F>

  tap(
    mapSuccess: (success: RT) => unknown,
    mapError?: (error: F) => unknown,
  ): AsyncWrappedFunction<P, RT, F>

  tapAsync(
    mapSuccess: (success: RT) => Promise<unknown>,
    mapError?: (error: F) => Promise<unknown>,
  ): AsyncWrappedFunction<P, RT, F>

  map<X, Y extends Error = F>(
    mapSuccess: (success: RT) => X,
    mapError?: (error: F) => Y,
  ): AsyncWrappedFunction<P, X, Y>

  mapAsync<X, Y extends Error = F>(
    mapSuccess: (success: RT) => Promise<X>,
    mapError?: (error: F) => Promise<Y>,
  ): AsyncWrappedFunction<P, X, Y>

  flatMap<X, Y extends Error = F>(
    mapSuccess: (success: RT) => AsyncResult<X, Y>,
    mapError?: (error: F) => AsyncResult<X, Y>,
  ): AsyncWrappedFunction<P, X, Y>

  flatMapAsync<X, Y extends Error = F>(
    mapSuccess: (success: RT) => AsyncResult<X, Y>,
    mapError?: (error: F) => AsyncResult<X, Y>,
  ): AsyncWrappedFunction<P, X, Y>

  mapFailure<X extends Error = F>(
    mapFailure: (failed: F) => X,
  ): AsyncWrappedFunction<P, RT, X>

  mapEither<X>(map: (value: RT | F) => X): AsyncWrappedFunction<P, X, F>

  mapEitherAsync<X>(
    map: (value: RT | F) => Promise<X>,
  ): AsyncWrappedFunction<P, X, F>

  tapEither(tap: (value: RT | F) => unknown): AsyncWrappedFunction<P, RT, F>

  tapEitherAsync(
    tap: (value: RT | F) => Promise<unknown>,
  ): AsyncWrappedFunction<P, RT, F>
}

export function wrapAsyncFunction<
  FN extends (...args: any[]) => any,
  F extends Error = Error,
>(fn: FN): AsyncWrappedFunction<Parameters<FN>, Awaited<ReturnType<FN>>, F> {
  const wrapped: AsyncWrappedFunction<
    Parameters<FN>,
    Awaited<ReturnType<FN>>,
    F
  > = ((...args) => {
    return AsyncResult.invoke(fn as any, ...(args as any[])) as any
  }) as any

  wrapped.withRetries = (config) => {
    if (typeof config === 'function') {
      return wrapAsyncFunction(async (...args: Parameters<FN>) => {
        let retries = 0
        while (true) {
          try {
            return await wrapped(...args).get()
          } catch (error) {
            const calculated = await config({
              error,
              retries,
              args,
            })
            if (!calculated || calculated.retryInMS <= 0) {
              throw error
            }
            await new Promise((resolve) =>
              setTimeout(resolve, calculated.retryInMS),
            )
            retries++
          }
        }
      })
    }

    if (typeof config === 'object' && config) {
      const delayMultiplier = config.delayMultiplier ?? 1.75

      if (config.maxRetries < 1) {
        throw new Error('maxRetries must be >= 1 for retry logic to work')
      }

      return wrapAsyncFunction(async (...args: Parameters<FN>) => {
        let retries = 0
        while (true) {
          try {
            return await wrapped(...args).get()
          } catch (error) {
            if (retries >= config.maxRetries) {
              throw error
            }
            const retryInMS = config.initialDelayMS * delayMultiplier ** retries
            if (
              config.shouldRetry &&
              !(await config.shouldRetry({
                error,
                retries: retries as any,
                args,
              }))
            ) {
              throw error
            }
            await new Promise((resolve) => setTimeout(resolve, retryInMS))
            retries++
          }
        }
      })
    }

    throw new Error('Invalid retry config')
  }

  wrapped.withTimeout = (ms, error) => {
    return wrapAsyncFunction(async (...args: Parameters<FN>) => {
      return wrapped(...args)
        .withTimeout(ms, error)
        .get()
    })
  }

  wrapped.map = (mapSuccess, mapError) => {
    return wrapAsyncFunction(async (...args: Parameters<FN>) => {
      return wrapped(...args)
        .map(mapSuccess, mapError)
        .get()
    })
  }

  wrapped.mapAsync = (mapSuccess, mapError) => {
    return wrapAsyncFunction(async (...args: Parameters<FN>) => {
      return wrapped(...args)
        .mapAsync(mapSuccess, mapError)
        .get()
    })
  }

  wrapped.tap = (mapSuccess, mapError) =>
    wrapped.map(
      (v) => {
        mapSuccess(v)
        return v
      },
      (v) => {
        mapError?.(v)
        return v
      },
    )

  wrapped.tapAsync = (mapSuccess, mapError) =>
    wrapped.mapAsync(
      async (v) => {
        await mapSuccess(v)
        return v
      },
      async (v) => {
        await mapError?.(v)
        return v
      },
    ) as any

  wrapped.flatMap = ((mapSuccess, mapError) => {
    return wrapAsyncFunction(async (...args: Parameters<FN>) => {
      return wrapped(...args)
        .flatMap(mapSuccess, mapError)
        .get()
    })
  }) as any

  wrapped.flatMapAsync = ((mapSuccess, mapError) => {
    return wrapAsyncFunction(async (...args: Parameters<FN>) => {
      return wrapped(...args)
        .flatMapAsync(mapSuccess, mapError)
        .get()
    })
  }) as any

  wrapped.mapFailure = (mapFailure) => {
    return wrapAsyncFunction(async (...args: Parameters<FN>) => {
      return wrapped(...args)
        .mapFailure(mapFailure)
        .get()
    })
  }

  wrapped.mapEither = (map) => {
    return wrapAsyncFunction(async (...args: Parameters<FN>) => {
      return wrapped(...args)
        .mapEither(map)
        .get()
    })
  }

  wrapped.mapEitherAsync = (map) => {
    return wrapAsyncFunction(async (...args: Parameters<FN>) => {
      return wrapped(...args)
        .mapEitherAsync(map)
        .get()
    })
  }

  wrapped.tapEither = (tap) => {
    return wrapAsyncFunction(async (...args: Parameters<FN>) => {
      return wrapped(...args)
        .tapEither(tap)
        .get()
    })
  }

  wrapped.tapEitherAsync = (tap) => {
    return wrapAsyncFunction(async (...args: Parameters<FN>) => {
      return wrapped(...args)
        .tapEitherAsync(tap)
        .get()
    })
  }

  return wrapped
}
