import { describe, expect, expectTypeOf, it } from 'vitest'
import { AsyncResult, Fail, Result, ResultTimeoutError } from '../src'
import { identity } from '../src/methods'

const value = 'Value'
const error = new Error('Error')

interface TestCase<T, Y> {
  setup: () => Result<T> | AsyncResult<T>
  transform: (result: Result<T> | AsyncResult<T>) => Result<Y> | AsyncResult<Y>
  assert: (value: any) => any
}

const testBoth = <T, Y>(name: string, test: TestCase<T, Y>) => {
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
  })
}

testBoth('map', {
  setup: () => Result.success(value),
  transform: (result) => result.map(() => 'Other value'),
  assert: (value) => expect(value).toEqual('Other value'),
})

testBoth('map(failure)', {
  setup: () => Result.fail(error),
  transform: (result) => result.mapFailure(() => new Error('Other error')),
  assert: (value) => expect((value as Error).message).toEqual('Other error'),
})

testBoth('wrap(sync method failure)', {
  setup: () => Result.wrap(JSON.parse)('}'),
  transform: (result) => result,
  assert: (value) => expect(value.message).matches(/Unexpected token/),
})

testBoth('wrap(async method failure)', {
  setup: () => Result.wrapAsync(JSON.parse)('}'),
  transform: (result) => result,
  assert: (value) => expect(value.message).matches(/Unexpected token/),
})

// testBoth('invoke(async)', {
//   setup: () => AsyncResult.invoke(JSON.parse, '}'),
//   transform: (result) => result,
//   assert: (value) => expect(value.message).matches(/Unexpected token/),
// })

// testBoth('invoke(async)', {
//   setup: () => AsyncResult.invoke(JSON.parse, '{"value": "value"}'),
//   transform: (result) => result,
//   assert: (value) => expect(value.value).toEqual('value'),
// })

testBoth('tap(async)', {
  setup: () => AsyncResult.success(value),
  transform: (result) =>
    result.tap(
      () => {},
      () => {},
    ),
  assert: (value) => expect(value).toEqual('Value'),
})

testBoth('tapAsync(async)', {
  setup: () => AsyncResult.success(value),
  transform: (result) =>
    result.tapAsync(
      async () => null,
      async () => null,
    ),
  assert: (value) => expect(value).toEqual('Value'),
})

testBoth('flatMapAsync', {
  setup: () => AsyncResult.success(value),
  transform: (result) =>
    result.flatMapAsync(() => AsyncResult.success('Other value')),
  assert: (value) => expect(value).toEqual('Other value'),
})

testBoth('flatMap', {
  setup: () => AsyncResult.success(value),
  transform: (result) => result.flatMap(() => Result.success('Other value')),
  assert: (value) => expect(value).toEqual('Other value'),
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
  // it('unwraps a promised result', async function () {
  //   const success = await AsyncResult.unwrapResult(
  //     Promise.resolve(Result.success(value)),
  //   ).map((i) => i)
  //   const fail = await AsyncResult.unwrapResult(
  //     Promise.resolve(Result.fail(error)),
  //   ).mapFailure((e) => e)

  //   expect(success.getEither()).toEqual(value)
  //   expect(success.isSuccess()).toBeTruthy()

  //   expect(fail.isFail()).toBeTruthy()
  //   expect(fail.getEither()).toEqual(error)
  // })

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
      .withTimeout(1, err)
      .getEither()

    expect(result).toEqual(err)
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
    const result = AsyncResult.unwrapResult(null)

    expectTypeOf<typeof result>().toBeNever()

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
