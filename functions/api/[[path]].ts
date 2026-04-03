import workerHandler from "../../worker/src/index";
import type { Env } from "../../worker/src/types";

export const onRequest: PagesFunction<Env> = (context) => {
  return workerHandler.fetch(context.request, context.env, context);
};
