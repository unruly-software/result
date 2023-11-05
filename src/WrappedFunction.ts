import { AsyncResult } from './AsyncResult'
import { ResultTimeoutError } from './ResultTimeout'

interface AsyncWrappedFunction<P extends any[], RT, F extends Error = Error> {
  (...args: P): AsyncResult<RT, F>

  withTimeout<E extends Error = ResultTimeoutError>(
    ms: number,
    error?: E,
  ): AsyncWrappedFunction<P, RT, F | E>

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

  return wrapped
}
