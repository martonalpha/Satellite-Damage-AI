// Stub for Next.js-generated RouteContext global — used by the test compiler
// (tsconfig.test.json) which runs outside the Next.js build pipeline.
// The real definition lives in .next/types/routes.d.ts and is stricter.
declare global {
  interface RouteContext<_Route extends string = string> {
    params: Promise<Record<string, string>>;
  }
}

export {};
