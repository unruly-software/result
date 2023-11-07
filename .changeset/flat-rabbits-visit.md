---
"@unruly-software/result": patch
---

Provides the ability to easily add complicated exponential/exact retry
logic by passing either a function or configuration object to
withRetries.

```typescript
 AsyncResult.wrap(someAPICall).withRetries({
  initialDelayMS: 1000,
  maxRetries: 2,
})
```
