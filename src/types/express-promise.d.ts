declare module "express-serve-static-core" {
  interface Response {
    /** installed by src/middleware/promise.ts */
    promise: (p: unknown) => void;
  }
}

export {};
