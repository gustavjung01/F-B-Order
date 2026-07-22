# CI trigger policy

The protected CI workflows run only on:

```yaml
on:
  push:
    branches:
      - main
  pull_request:
    branches:
      - main
```

The contract is enforced by `scripts/ci/test-main-branch-triggers.mjs` for:

- Core order contract
- Catalog boundary
- Migration CI

Production deployment remains manual-only and is not part of this automatic CI trigger policy.
