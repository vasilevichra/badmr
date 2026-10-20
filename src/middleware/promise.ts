import type { NextFunction, Request, RequestHandler, Response } from "express";

const handleResponse = (res: Response, data: unknown) => res.status(200).send(data);
const handleError = (res: Response, err: unknown = {}) =>
  res.status((err as { status?: number }).status || 500).send({ error: (err as Error).message });

export default (): RequestHandler => (req: Request, res: Response, next: NextFunction) => {
  res.promise = (p: unknown) => {
    let promiseToResolve: Promise<unknown>;
    const thenable = p as { then?: unknown; catch?: unknown };
    if (typeof thenable?.then === "function" && typeof thenable?.catch === "function") {
      promiseToResolve = p as Promise<unknown>;
    } else if (typeof p === "function") {
      promiseToResolve = Promise.resolve().then(() => (p as () => unknown)());
    } else {
      promiseToResolve = Promise.resolve(p);
    }

    return promiseToResolve.then((data) => handleResponse(res, data)).catch((e) => handleError(res, e));
  };

  return next();
};
