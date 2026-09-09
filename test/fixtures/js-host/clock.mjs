// clock.mjs — the module shadow.mjs imports `performance` from, so that its
// import specifier resolves to a file that exists rather than dangling.
export const performance = { now: () => 0 };
