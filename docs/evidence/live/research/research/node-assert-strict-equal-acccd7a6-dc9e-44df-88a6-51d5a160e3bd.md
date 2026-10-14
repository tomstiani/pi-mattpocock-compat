# Node.js `assert.strictEqual`: findings

## Conclusion and scope

`assert.strictEqual(actual, expected[, message])` tests equality **as determined by `Object.is()`**, not exactly by JavaScript `===` and not by deep structural comparison. Node's API history records the change from Strict Equality to `Object.is()` in **v10.0.0**; the method itself was added in v0.1.21. These findings therefore describe the documented modern semantics, not pre-v10 behavior. [Node: strictEqual](https://nodejs.org/api/assert.html#assertstrictequalactual-expected-message)

The unversioned Node documentation was fetched successfully for this investigation. It is a moving documentation target; its message-parameter history includes v26.0.0 changes. Equality semantics and message API availability should be distinguished when supporting older releases. [Node: strictEqual history](https://nodejs.org/api/assert.html#assertstrictequalactual-expected-message)

## Evidence: owning specifications

Node owns the assertion contract and explicitly delegates comparison to `Object.is()`. ECMAScript owns the underlying language semantics: `Object.is(value1, value2)` returns `SameValue(value1, value2)`. `SameValue` rejects different types, uses `Number::sameValue` for Numbers, and otherwise uses `SameValueNonNumber`. [Node](https://nodejs.org/api/assert.html#assertstrictequalactual-expected-message), [ECMAScript: Object.is](https://tc39.es/ecma262/multipage/fundamental-objects.html#sec-object.is), [ECMAScript: SameValue](https://tc39.es/ecma262/multipage/abstract-operations.html#sec-samevalue)

- **No coercion:** values with different ECMAScript types are unequal. Thus Number `1`, String `'1'`, and BigInt `1n` are not interchangeable; likewise `null` and `undefined` are distinct. [SameValue](https://tc39.es/ecma262/multipage/abstract-operations.html#sec-samevalue)
- **Numbers:** two NaNs compare equal; positive and negative zero compare unequal; otherwise the same Number value compares equal. [Number::sameValue](https://tc39.es/ecma262/multipage/ecmascript-data-types-and-values.html#sec-numeric-types-number-sameValue)
- **Strings:** equality requires the same length and the same code units in the same positions—not merely visually similar text. **Booleans:** the same boolean value compares equal. **Null/undefined:** each compares equal to itself. **BigInts:** equal mathematical integer values compare equal. [SameValueNonNumber](https://tc39.es/ecma262/multipage/abstract-operations.html#sec-samevaluenonnumber), [BigInt::equal](https://tc39.es/ecma262/multipage/ecmascript-data-types-and-values.html#sec-numeric-types-bigint-equal)
- **Objects and Symbols:** comparison is by identity, not matching properties or descriptions. Consequently a shared object reference passes, while independently created objects fail regardless of matching content. This applies to arrays, functions, boxed primitives, dates, maps, sets, buffers, and other object values. [SameValueNonNumber](https://tc39.es/ecma262/multipage/abstract-operations.html#sec-samevaluenonnumber)

## Derived edge-case examples (inference, not executed tests)

Each outcome below follows from Node's `Object.is()` contract plus the linked owning algorithm; “passes” means equality is satisfied, while “fails” means the comparison is unequal. [Node contract](https://nodejs.org/api/assert.html#assertstrictequalactual-expected-message)

| Arguments to `strictEqual` | Outcome | Owning rule |
| --- | --- | --- |
| `1, 1`; `Infinity, Infinity` | Pass | [Number::sameValue](https://tc39.es/ecma262/multipage/ecmascript-data-types-and-values.html#sec-numeric-types-number-sameValue) |
| `NaN, NaN` | Pass | [Number::sameValue](https://tc39.es/ecma262/multipage/ecmascript-data-types-and-values.html#sec-numeric-types-number-sameValue) |
| `0, -0` | Fail | [Number::sameValue](https://tc39.es/ecma262/multipage/ecmascript-data-types-and-values.html#sec-numeric-types-number-sameValue) |
| `-0, -0`; `0, 0` | Pass | [Number::sameValue](https://tc39.es/ecma262/multipage/ecmascript-data-types-and-values.html#sec-numeric-types-number-sameValue) |
| `1, '1'`; `1, 1n`; `false, 0`; `null, undefined` | Fail | [SameValue](https://tc39.es/ecma262/multipage/abstract-operations.html#sec-samevalue) |
| `null, null`; `undefined, undefined`; `true, true`; `1n, 1n` | Pass | [SameValueNonNumber](https://tc39.es/ecma262/multipage/abstract-operations.html#sec-samevaluenonnumber) |
| `'hello', 'hello'` | Pass | [SameValueNonNumber](https://tc39.es/ecma262/multipage/abstract-operations.html#sec-samevaluenonnumber) |
| `'\u00e9', 'e\u0301'` (different Unicode representations) | Fail | [SameValueNonNumber: code-unit comparison](https://tc39.es/ecma262/multipage/abstract-operations.html#sec-samevaluenonnumber) |
| `{}, {}`; `[1], [1]`; `new Number(1), new Number(1)` | Fail | [SameValueNonNumber: identity](https://tc39.es/ecma262/multipage/abstract-operations.html#sec-samevaluenonnumber) |
| `new Number(1), 1` | Fail | [SameValue: different types](https://tc39.es/ecma262/multipage/abstract-operations.html#sec-samevalue) |
| `obj, obj` (the same object); `sym, sym` (the same symbol) | Pass | [SameValueNonNumber: identity](https://tc39.es/ecma262/multipage/abstract-operations.html#sec-samevaluenonnumber) |
| `Symbol('x'), Symbol('x')` | Fail: each construction creates a new Symbol | [Symbol constructor](https://tc39.es/ecma262/multipage/fundamental-objects.html#sec-symbol-description), [SameValueNonNumber](https://tc39.es/ecma262/multipage/abstract-operations.html#sec-samevaluenonnumber) |

## Avoiding nearby-API confusion

`===` uses `IsStrictlyEqual`: it treats NaN as unequal to itself and treats signed zeros as equal. These are the two numeric differences from `Object.is()`/SameValue. SameValueZero instead treats NaNs as equal **and** signed zeros as equal; it is not the comparison selected by `strictEqual`. [IsStrictlyEqual](https://tc39.es/ecma262/multipage/abstract-operations.html#sec-isstrictlyequal), [Number::equal](https://tc39.es/ecma262/multipage/ecmascript-data-types-and-values.html#sec-numeric-types-number-equal), [SameValueZero](https://tc39.es/ecma262/multipage/abstract-operations.html#sec-samevaluezero)

Use `assert.deepStrictEqual` when recursive object-content comparison is intended; that is a separate API with additional documented rules. In strict assertion mode, `assert.equal` aliases `assert.strictEqual`; importing ordinary `node:assert` does not make its explicitly named `strictEqual` loose. [Node: deepStrictEqual](https://nodejs.org/api/assert.html#assertdeepstrictequalactual-expected-message), [Node: equal](https://nodejs.org/api/assert.html#assertequalactual-expected-message), [Node: strict assertion mode](https://nodejs.org/api/assert.html#strict-assertion-mode)

On unequal values, `strictEqual` normally throws an `AssertionError`; an omitted message gets a default message, and an Error supplied as the message is thrown instead. This is an assertion API, not a boolean-returning equality predicate. [Node: strictEqual](https://nodejs.org/api/assert.html#assertstrictequalactual-expected-message)

## Validation, uncertainty, and residual risks

Primary Node documentation and ECMAScript specification pages were successfully retrieved. This is documentation/specification research, not a local execution or source-code audit: no Node commands or runtime tests were available/run. Example outcomes are explicitly deductions from the documented algorithms. The report is complete for the requested equality semantics; version-specific message APIs and older Node versions require their corresponding versioned documentation. No dependency installation or repository code changes were needed.
