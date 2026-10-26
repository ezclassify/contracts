# @ezclassify/tsconfig

Shared TypeScript compiler configuration for EzClassify packages.

## Configurations

| File                           | Use for                                                     |
| ------------------------------ | ----------------------------------------------------------- |
| [`library.json`](library.json) | Published libraries (NodeNext modules, declaration emit on) |
| [`app.json`](app.json)         | Applications and bundled packages (ESNext/Bundler, no emit) |
| [`test.json`](test.json)       | Test files                                                  |

Extend in your `tsconfig.json`:

```json
{ "extends": "@ezclassify/tsconfig/library.json" }
```

## TypeScript version policy

`@ezclassify/tsconfig` declares `typescript` as a `peerDependency` at the canonical org-wide version (`5.9.3`). This is the single source of truth for the first-party root compiler baseline.

**Rules for consumers:**

- Each workspace root satisfies the peer by declaring `"typescript": "5.9.3"` in its own `devDependencies` (one pin per repo, at the root).
- Sub-packages within an npm workspace inherit the root compiler. A vendor toolchain may keep an isolated compiler when its supported version range requires it; record that exception and run the vendor build with that compiler. It must not change the first-party root pin.
- Standalone packages pin `"typescript": "5.9.3"` in their own `devDependencies`, unless the vendor-isolation rule above requires a different compiler.

The current vendor boundaries are Angular and SharePoint Framework. Angular
20.3 and 21 use TypeScript below 6; Angular 22 consumers use TypeScript 6.0.
Build each supported consumer with its host's compiler rather than forcing the
workspace compiler into that host. The Web Angular library build currently uses
5.9.3. SPFx 1.23.2 uses Node 22 and its isolated Rush compiler; it does not set the
first-party TypeScript baseline. Check the [Angular compatibility table](https://angular.dev/reference/versions)
and [SPFx compatibility table](https://learn.microsoft.com/en-us/sharepoint/dev/spfx/compatibility)
before changing either boundary.

## License

Apache-2.0. See [LICENSE](./LICENSE).
