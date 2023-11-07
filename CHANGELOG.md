# @unruly-software/result

## 1.0.1

### Patch Changes

- fdb6c23: Provides the ability to easily add complicated exponential/exact retry
  logic by passing either a function or configuration object to
  withRetries.

  ```typescript
  AsyncResult.wrap(someAPICall).withRetries({
    initialDelayMS: 1000,
    maxRetries: 2,
  });
  ```

## 1.0.0

### Major Changes

- 8ea6d83: Improve `AsyncResult.wrap()` by allowing timeouts and modifications to be chained to the returned AsyncResult

### Patch Changes

- f535b00: Adds the `mapEither`, `mapEitherAsync`, `tapEither`, and `tapEitherAsync` methods which simplify logging and error recovery when the state of a result doesn't matter.

## 0.0.2

### Patch Changes

- 9fc7441: Add ESLint and Prettier
