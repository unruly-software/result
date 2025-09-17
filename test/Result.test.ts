import {describe, expect, expectTypeOf, it, vi} from 'vitest'
import {AsyncResult, Fail, Result, ResultTimeoutError} from '../src'
import {identity} from '../src/methods'

const value = 'Value'
const error = new Error('Error')

interface TestCase<T, Y> {
  setup: () => Result<T> | AsyncResult<T>
  transform: (result: Result<T> | AsyncResult<T>) => Result<Y> | AsyncResult<Y>
  assert: (value: any) => any
}

const testAll = <T, Y>(name: string, test: TestCase<T, Y>) => {
  describe(name, () => {
    it('it should work given AsyncResult', async () => {
      const setup = test.setup().mapAsync(async (v) => v) as any
      const value = await test
        .transform(setup.mapAsync(async (v: any) => v))
        .getEither()
      await test.assert(value)
    })

    it('it should work given Result', async () => {
      await test.assert(await test.transform(await test.setup()).getEither())
    })

    it('should work given a wrapped async function', async () => {
      const wrapped: any = AsyncResult.wrap(async () => {
        return test.setup().get()
      })
      // @ts-expect-error
      const transformed = await test.transform(wrapped)().getEither()
      test.assert(transformed)
    })
  })
}

testAll('map', {
  setup: () => Result.success(value),
  transform: (result) => result.map(() => 'Other value'),
  assert: (value) => expect(value).toEqual('Other value'),
})

testAll('map(failure)', {
  setup: () => Result.fail(error),
  transform: (result) => result.mapFailure(() => new Error('Other error')),
  assert: (value) => expect((value as Error).message).toEqual('Other error'),
})

testAll('wrap(sync method failure)', {
  setup: () => Result.wrap(JSON.parse)('}'),
  transform: (result) => result,
  assert: (value) => expect(value.message).matches(/Unexpected token/),
})

testAll('wrap(async method failure)', {
  setup: () => Result.wrapAsync(JSON.parse)('}'),
  transform: (result) => result,
  assert: (value) => expect(value.message).matches(/Unexpected token/),
})

testAll('tap(async)', {
  setup: () => AsyncResult.success(value),
  transform: (result) =>
    result.tap(
      () => {},
      () => {},
    ),
  assert: (value) => expect(value).toEqual('Value'),
})

testAll('tapAsync(async)', {
  setup: () => AsyncResult.success(value),
  transform: (result) =>
    result.tapAsync(
      async () => null,
      async () => null,
    ),
  assert: (value) => expect(value).toEqual('Value'),
})

testAll('flatMapAsync', {
  setup: () => AsyncResult.success(value),
  transform: (result) =>
    result.flatMapAsync(() => AsyncResult.success('Other value')),
  assert: (value) => expect(value).toEqual('Other value'),
})

testAll('flatMap', {
  setup: () => AsyncResult.success(value),
  transform: (result) => result.flatMap(() => Result.success('Other value')),
  assert: (value) => expect(value).toEqual('Other value'),
})

testAll('mapEither', {
  setup: () => Result.success(value),
  transform: (result) => result.mapEither(() => 'Other value'),
  assert: (value) => expect(value).toEqual('Other value'),
})

testAll('mapEither(failure)', {
  setup: () => Result.fail(error),
  transform: (result) => result.mapEither(() => 'Other value'),
  assert: (value) => expect(value).toEqual('Other value'),
})

testAll('tapEither', {
  setup: () => Result.success(value),
  transform: (result) => result.tapEither(() => 'Other value'),
  assert: (passed) => expect(passed).toEqual(value),
})

testAll('tapEither(failure)', {
  setup: () => Result.fail(error),
  transform: (result) => result.tapEither(() => 'Other value'),
  assert: (passed) => expect(passed).toEqual(error),
})

testAll('tapEitherAsync', {
  setup: () => Result.success(value),
  transform: (result) => result.tapEitherAsync(async () => 'Other value'),
  assert: (passed) => expect(passed).toEqual(value),
})

testAll('tapEitherAsync(failure)', {
  setup: () => Result.fail(error),
  transform: (result) => result.tapEitherAsync(async () => 'Other value'),
  assert: (passed) => expect(passed).toEqual(error),
})

describe('Result', () => {
  const aResult = 'a-result'
  it('Should unwrap a promise', async function () {
    const promise = Promise.resolve(aResult)
    expect(
      await Result.fromPromise<string, Error>(promise).getEither(),
    ).toEqual(aResult)
  })

  it('Should catch a rejected promise', async function () {
    const promise = Promise.reject(aResult)
    expect(
      await Result.fromPromise<string, Error>(promise).getEither(),
    ).toEqual(aResult)
  })

  it('Should catch a rejected promise that is transformed', async function () {
    const promise = Promise.reject(error)
    expect(Fail.of(error).getEither()).toEqual(error)
    expect(
      await Result.fromPromise<string, Error>(promise).getEither(),
    ).toEqual(error)
  })

  it('Should map a result', async function () {
    const promise = Promise.reject(aResult)
    expect(
      await Result.fromPromise<string, Error>(promise)
        .map(
          () => 'result',
          (original) => {
            expect(original).toEqual(aResult)
            return new Error()
          },
        )
        .getEither(),
    ).toBeInstanceOf(Error)
  })
})

describe(AsyncResult.name, function () {
  it('is thenable', async () => {
    const result = await AsyncResult.success(null).then((syncResult) =>
      syncResult.map(() => 'value'),
    )
    expect(result.getEither()).toEqual('value')

    const failResult = await AsyncResult.fromPromise(
      Promise.reject(error),
    ).then((syncResult) => syncResult.map(() => 'value'))
    expect(failResult.getEither()).toEqual(error)
  })

  it('captures maps thrown values as errors', async function () {
    const result = await AsyncResult.fromPromise(Promise.resolve(error)).map(
      (v) => {
        throw v
      },
    )
    expect(result.isFail()).toBeTruthy()
  })

  it('captures maps thrown values as errors', async function () {
    const result = await AsyncResult.fromPromise(Promise.resolve(error)).map(
      (v) => {
        throw v
      },
    )
    expect(result.isFail()).toBeTruthy()
  })

  it('is perfectly content to fail with an undefined value', async function () {
    const result = await AsyncResult.fromPromise(Promise.reject(error))
      .map((v) => {
        throw v
      })
      .map(
        (i) => i,
        () => {
          return undefined!
        },
      )
    expect(result.isFail()).toBeTruthy()
    expect(result.getEither()).toEqual(undefined)
  })

  it('maps through promises', async function () {
    const result = await Result.fail(error).mapAsync(
      async (v) => v,
      async (e) => e,
    )

    expect(result.getEither()).toEqual(error)
    expect(result.isFail()).toBeTruthy()
  })

  it('maps through promises', async function () {
    const result = await AsyncResult.fromPromise(
      Promise.reject(error),
    ).mapAsync(
      async (v) => v,
      async (e) => e,
    )

    expect(result.getEither()).toEqual(error)
    expect(result.isFail()).toBeTruthy()
  })
})

describe('Timeouts', () => {
  const timeout = (ms: number): Promise<'Success'> =>
    new Promise((res) => setTimeout(() => res('Success'), ms))

  it('Timesout', async () => {
    const result = await AsyncResult.fromPromise(timeout(1000))
      .withTimeout(100)
      .getEither()

    expect(result).toBeInstanceOf(ResultTimeoutError)
  })

  it('Does not timeout', async () => {
    const result = await AsyncResult.fromPromise(timeout(10))
      .withTimeout(20)
      .getEither()

    expect(result).toEqual('Success')
  })

  it('Throws a custom error', async () => {
    const err = new Error('This one')
    const result = await AsyncResult.fromPromise(timeout(100))
      .withTimeout(1, {error: err})
      .getEither()

    expect(result).toEqual(err)
  })

  it('calls abort on timeout', async () => {
    const abortController = new AbortController()
    const abortSpy = vi.spyOn(abortController, 'abort')

    const err = new Error('This one')
    const result = await AsyncResult.fromPromise(timeout(100))
      .withTimeout(1, {error: err, abort: abortController})
      .getEither()

    expect(result).toEqual(err)
    expect(abortSpy).toHaveBeenCalledWith(err)
  })
})

describe('unwrapResult', () => {
  it('should fix results wrapped to heck in promises', async () => {
    const messyResult = Promise.resolve(Result.success(Promise.resolve(value)))
    const result = AsyncResult.unwrapResult(messyResult)
    expectTypeOf<typeof result>().toEqualTypeOf<AsyncResult<string>>()

    expect(
      await result.tap((value) => expect(value).toEqual(value)).getEither(),
    ).toEqual(value)
  })

  it('should fix results wrapped to heck in promises', async () => {
    const messyResult = Promise.resolve(Result.fail(error))
    const result = AsyncResult.unwrapResult(messyResult)
    expectTypeOf<typeof result>().toEqualTypeOf<AsyncResult<unknown>>()

    expect(
      await result
        .tap(identity, (value) => expect(value).toEqual(error))
        .getEither(),
    ).toEqual(error)
  })

  it('should fix results wrapped to heck in promises', async () => {
    const messyResult = Promise.resolve(AsyncResult.success(value))

    const result = AsyncResult.unwrapResult(messyResult)
    expectTypeOf<typeof result>().toEqualTypeOf<AsyncResult<string>>()

    expect(
      await result.tap((value) => expect(value).toEqual(value)).getEither(),
    ).toEqual(value)
  })

  it('should fail correctly if given a non-result type', async () => {
    const result = AsyncResult.unwrapResult<null>(null)

    // expectTypeOf<typeof result>().toBeNever()

    const awaited: Result<any> = await (result as any).tap(
      identity,
      (value: any) => expect(value).toBeInstanceOf(TypeError),
    )

    expect(awaited.isSuccess()).toBeFalsy()
    expect(awaited.getEither()).toBeInstanceOf(TypeError)
    expect(awaited.getEither().message).toMatchInlineSnapshot(
      '"unwrapResult was called with a non-result type"',
    )
  })
})

it('should wrap an async function', async () => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const wrapped = AsyncResult.wrap(async (__: number) => value)
  expectTypeOf(wrapped).toEqualTypeOf<(v: number) => AsyncResult<string>>()

  expectTypeOf(wrapped.withTimeout(100)).toEqualTypeOf<
    (v: number) => AsyncResult<string>
  >()

  expectTypeOf(wrapped.map(() => 'MAPPED' as const)).toEqualTypeOf<
    (v: number) => AsyncResult<'MAPPED'>
  >()

  expectTypeOf(
    wrapped.mapAsync(async () => 'ASYNC_MAPPED' as const),
  ).toEqualTypeOf<(v: number) => AsyncResult<'ASYNC_MAPPED'>>()

  expectTypeOf(wrapped.mapAsync(async () => 'MAPPED' as const)).toEqualTypeOf<
    (v: number) => AsyncResult<'MAPPED'>
  >()

  expectTypeOf(wrapped.mapFailure(() => error)).toEqualTypeOf<
    (v: number) => AsyncResult<string>
  >()

  const mapped = wrapped.map(() => 'MAPPED')

  expect(await mapped(1).get()).toEqual('MAPPED')

  const unwrapped = wrapped.unwrap()

  expectTypeOf(unwrapped).toEqualTypeOf<(v: number) => Promise<string>>()
  expect(await unwrapped(1)).toEqual(value)
})

it('should wrap an async function that fails', async () => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const wrapped = AsyncResult.wrap(async (__: number) => {
    throw error
  })

  await expect(wrapped(1).get()).rejects.toThrowError(error)

  await expect(() => wrapped.unwrap()(1)).rejects.toEqual(error)
})

const errorThrower = <T>(times: number, error: Error, result: T) => {
  return async () => {
    if (times-- > 0) {
      throw error
    }
    return result
  }
}

describe('withRetries', () => {
  it('should throw the error if it continues to reject after max retries', async () => {
    const seenRetries: number[] = []

    const wrapped = AsyncResult.wrap(
      errorThrower(10, error, value),
    ).withRetries({
      initialDelayMS: 1,
      maxRetries: 2,
      shouldRetry: ({retries}) => {
        expectTypeOf(retries).toEqualTypeOf<0 | 1>()
        expectTypeOf(retries).not.toEqualTypeOf<0 | 1 | 2>()
        seenRetries.push(retries)
        return true
      },
    })

    await expect(wrapped().get()).rejects.toEqual(error)
    expect(seenRetries).toEqual([0, 1])
  })

  it('should resolve if the error is resolved after a retry', async () => {
    const seenRetries: number[] = []

    const wrapped = AsyncResult.wrap(errorThrower(1, error, value)).withRetries(
      {
        initialDelayMS: 1,
        maxRetries: 2,
        shouldRetry: ({retries}) => {
          expectTypeOf(retries).toEqualTypeOf<0 | 1>()
          expectTypeOf(retries).not.toEqualTypeOf<0 | 1 | 2>()
          seenRetries.push(retries)
          return true
        },
      },
    )

    await expect(wrapped().get()).resolves.toEqual(value)
    expect(seenRetries).toEqual([0])
  })

  it('should allow calculated retries', async () => {
    const seenRetries: number[] = []

    const wrapped = AsyncResult.wrap(errorThrower(1, error, value)).withRetries(
      ({retries}) => {
        seenRetries.push(retries)
        return retries < 2 ? {retryInMS: 1} : null
      },
    )

    await expect(wrapped().get()).resolves.toEqual(value)
    expect(seenRetries).toEqual([0])
  })

  it('should allow calculated retries that fail', async () => {
    const seenRetries: number[] = []

    const wrapped = AsyncResult.wrap(
      errorThrower(100, error, value),
    ).withRetries(({retries}) => {
      seenRetries.push(retries)
      return retries < 2 ? {retryInMS: 1} : null
    })

    await expect(wrapped().get()).rejects.toEqual(error)
    expect(seenRetries).toEqual([0, 1, 2])
  })
})

describe('types', () => {
  it.skip('should pass type tests', () => {
    /** .invoke/.invokeAsync */
    expectTypeOf(AsyncResult.invoke(async () => 'value')).toEqualTypeOf<AsyncResult<string>>()
    expectTypeOf(Result.invokeAsync(async () => 'value')).toEqualTypeOf<AsyncResult<string>>()
    expectTypeOf(Result.invoke(async () => 'value')).toEqualTypeOf<Result<Promise<string>>>()

    // @ts-expect-error Should not allow initializing a result without a promise
    AsyncResult.invoke(() => 'value')

    // @ts-expect-error Should not allow initializing a result without a promise
    Result.invokeAsync(() => 'value')

    /** Fail */
    expectTypeOf(AsyncResult.fail<string, TypeError>(new TypeError('hi'))).toEqualTypeOf<AsyncResult<string>>()
    expectTypeOf(Result.fail<string, TypeError>(new TypeError('hi'))).toEqualTypeOf<Result<string, TypeError>>()

    /** Success */
    expectTypeOf(AsyncResult.success('value')).toEqualTypeOf<AsyncResult<string>>()
    expectTypeOf(Result.success('value')).toEqualTypeOf<Result<string>>()

    /** fromPromise */
    expectTypeOf(AsyncResult.fromPromise(Promise.resolve('value'))).toEqualTypeOf<AsyncResult<string>>()
    expectTypeOf(Result.fromPromise(Promise.resolve('value'))).toEqualTypeOf<AsyncResult<string>>()


    /** unwrapResult */
    type Unwrappable<T> =
      | Promise<Result<Promise<T>, Error>>
      | Promise<Result<T, Error>>
      | Promise<Result<Promise<T>, Error>>
      | AsyncResult<T, Error>
      | Result<T, Error>

    const unwrappable: Unwrappable<'correct'> = null!
    expectTypeOf(AsyncResult.unwrapResult(unwrappable)).toEqualTypeOf<AsyncResult<'correct'>>()

    expectTypeOf(AsyncResult.unwrapResult(Promise.resolve(Result.success('value')))).toEqualTypeOf<AsyncResult<string>>()
    expectTypeOf(AsyncResult.unwrapResult(Promise.resolve(Result.fail<string, TypeError>(new TypeError('hi'))))).toEqualTypeOf<AsyncResult<string>>()

    /** withTimeout */
    expectTypeOf(AsyncResult.success('value').withTimeout(100)).toEqualTypeOf<AsyncResult<string>>()

    /** get */
    expectTypeOf(AsyncResult.success('value').get()).toEqualTypeOf<Promise<string>>()
    expectTypeOf(Result.success('value').get()).toEqualTypeOf<string>()

    /** getEither */
    expectTypeOf(AsyncResult.success('value').getEither()).toEqualTypeOf<Promise<string | Error>>()
    expectTypeOf(Result.success('value').getEither()).toEqualTypeOf<string | Error>()

    /** tap */
    expectTypeOf(AsyncResult.success('value').tap(console.log)).toEqualTypeOf<AsyncResult<string>>()
    expectTypeOf(Result.success('value').tap(console.log)).toEqualTypeOf<Result<string>>()

    /** tapAsync */
    expectTypeOf(AsyncResult.success('value').tapAsync(async () => null)).toEqualTypeOf<AsyncResult<string>>()
    expectTypeOf(Result.success('value').tapAsync(async () => null)).toEqualTypeOf<AsyncResult<string>>()

    /** map */
    expectTypeOf(AsyncResult.success('value').map((v) => v.length)).toEqualTypeOf<AsyncResult<number>>()
    expectTypeOf(Result.success('value').map((v) => v.length)).toEqualTypeOf<Result<number>>()

    /** mapAsync */
    expectTypeOf(AsyncResult.success('value').mapAsync(async (v) => v.length)).toEqualTypeOf<AsyncResult<number>>()
    expectTypeOf(Result.success('value').mapAsync(async (v) => v.length)).toEqualTypeOf<AsyncResult<number>>()

    /** flatMap */
    expectTypeOf(AsyncResult.success('value').flatMap((v) => Result.success(v.length))).toEqualTypeOf<AsyncResult<number>>()
    expectTypeOf(Result.success('value').flatMap((v) => Result.success(v.length))).toEqualTypeOf<Result<number>>()

    /** flatMapAsync */
    expectTypeOf(AsyncResult.success('value').flatMapAsync((v) => AsyncResult.success(v.length))).toEqualTypeOf<AsyncResult<number>>()
    expectTypeOf(Result.success('value').flatMapAsync((v) => AsyncResult.success(v.length))).toEqualTypeOf<AsyncResult<number>>()

    /** mapFailure */
    expectTypeOf(AsyncResult.success('value').mapFailure((e) => new TypeError(e.message))).toEqualTypeOf<AsyncResult<string, TypeError>>()
    expectTypeOf(Result.success('value').mapFailure((e) => new TypeError(e.message))).toEqualTypeOf<Result<string, TypeError>>()


    /** mapEither */
    expectTypeOf(AsyncResult.success('value').mapEither((v) => 1)).toEqualTypeOf<AsyncResult<number>>()
    expectTypeOf(Result.success('value').mapEither((v) => 1)).toEqualTypeOf<Result<number>>()

    /** mapEitherAsync */
    expectTypeOf(AsyncResult.success('value').mapEitherAsync(async (v) => 1)).toEqualTypeOf<AsyncResult<number>>()
    expectTypeOf(Result.success('value').mapEitherAsync(async (v) => 1)).toEqualTypeOf<AsyncResult<number>>()

    /** tapEither */
    expectTypeOf(AsyncResult.success('value').tapEither((v) => null)).toEqualTypeOf<AsyncResult<string>>()
    expectTypeOf(Result.success('value').tapEither((v) => null)).toEqualTypeOf<Result<string>>()

    /** tapEitherAsync */
    expectTypeOf(AsyncResult.success('value').tapEitherAsync(async (v) => null)).toEqualTypeOf<AsyncResult<string>>()
    expectTypeOf(Result.success('value').tapEitherAsync(async (v) => null)).toEqualTypeOf<AsyncResult<string>>()

    const wrapped = AsyncResult.wrap(async (input: string) => input.length)

    expectTypeOf(wrapped).toEqualTypeOf<(input: string) => AsyncResult<number>>()
    expectTypeOf(wrapped.withTimeout(100)).toEqualTypeOf<(input: string) => AsyncResult<number>>()
    expectTypeOf(wrapped.map((v) => v.toString())).toEqualTypeOf<(input: string) => AsyncResult<string>>()
    expectTypeOf(wrapped.mapAsync(async (v) => v.toString())).toEqualTypeOf<(input: string) => AsyncResult<string>>()


    expectTypeOf(wrapped.flatMapAsync((v) => AsyncResult.success(v.toString()))).toEqualTypeOf<(input: string) => AsyncResult<string>>()
    expectTypeOf(wrapped.mapFailure((e) => new TypeError(e.message))).toEqualTypeOf<(input: string) => AsyncResult<number, TypeError>>()
    expectTypeOf(wrapped.mapEither((v) => v.toString())).toEqualTypeOf<(input: string) => AsyncResult<string>>()
    expectTypeOf(wrapped.mapEitherAsync(async (v) => v.toString())).toEqualTypeOf<(input: string) => AsyncResult<string>>()
    expectTypeOf(wrapped.tapEither((v) => null)).toEqualTypeOf<(input: string) => AsyncResult<number>>()
    expectTypeOf(wrapped.tapEitherAsync(async (v) => null)).toEqualTypeOf<(input: string) => AsyncResult<number>>()
  })
})
