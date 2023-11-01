# @unruly-software/result

<p>
  <a href="https://www.npmjs.com/package/@unruly-software/result">
    <img src="https://img.shields.io/npm/v/%40unruly-software%2Fresult" alt="npm package">
  </a>
</p>


## Getting started

### Installation

```shell
yarn add @unruly-software/result

pnpm i @unruly-software/result

npm i @unruly-software/result
```

### Usage


Until full documentation is written most methods have hoverable documentation
written in JSDoc comments.

```typescript
import { Result } from '@unruly-software/result'

Result.invokeAsync(getUser, userId) // AsyncResult<User, Error>
Result.wrapAsync(getUser) // (string) => AsyncResult<User, Error>
```


## Why?

Result is an elegant sync/async error wrapper similar to the [Either
Monad](https://www.scala-lang.org/api/2.12.7/scala/util/Either.html) but
intended for practical use in most Typescript codebases.

### Encode error types for methods

Errors can be explicitly typed allowing consumers of your module to know
exactly what can go wrong when they use your code.

In the following example it's clear that we may want to explicitly handle the
`NotFound` error thrown by `find` and if we hit a rate limit we may want to
retry after some amount of time has passed.

```typescript
interface UserRepo {
    all(): AsyncResult<User[], RateLimitError>
    find(userId: string): AsyncResult<User, NotFound | RateLimitError>
}
```


### Simplify error handling

Error handling can quickly become complex when writing to
interfaces such as the classic Express request/response
handler.

Here is a slightly complex handler:
```typescript

const getUserPosts = async (req, res) => {
    let user: User
    try {
        user = await authorize(req)
    } catch(e) {
        console.error(e)
        res.status(500).send('Something went wrong')
        return;
    }

    let posts: Post[]
    try {
        posts = await getPostsForUser(user)
    } catch(e) {
        console.error(e)
        res.status(500).send('Something went wrong')
        return;
    }

    res.send(200).json({ posts })
}
```

We can use the Result.invokeAsync method to wrap errors as part of our normal
flow instead.


```typescript
const getUserPosts = async (req, res) => {
  await Result.invokeAsync(authorize, req)
    .mapAsync(getPostsForUser)
    .tap(
        (posts) => res.send(200).json({ posts }),
        (error) => {
            console.error(error)
            res.send(500).send('Something went wrong') 
        }
    )
}
```

### Map between async and sync code seamlessly

The most unique aspect of this library is its first class treatment of async
errors. The types `Result<T, E>` and `AsyncResult<T, E>` can be converted to on
the fly using helper methods.

Since `AsyncResult` is a `Thenable` it works anywhere promises do and we can
simply `await` the result for it to run to completion.

```typescript
const getUserAsync = Result.wrapAsync(getUser)

getUser(userId) // AsyncResult<User>

// Awaiting the result converts it to normal result
const userResult = await getUser(userId) // Result<User>


const posts = userResult.mapAsync(loadPostsForUser) // AsyncResult<Post[]>

// We can explicitly unwrap the result causing it to throw
await posts.get() // Post[]

// We could also safely return an error or the value
await posts.getEither() // Post[] | Error

// We can call .map() to synchronously transform the value
await posts.map(post => p.name) // AsyncResult<string>

const awaited = await posts // Result<Post[]>

// Calling .mapAsync() turns the result back into an AsyncResult allowing
further chaining.
awaited.mapAsync(getAuthorForPosts) // AsyncResult<Author[]>
```

