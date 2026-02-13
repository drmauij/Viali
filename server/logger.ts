import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";

const pinoInstance = pino({
  level: process.env.LOG_LEVEL || (isProduction ? "info" : "debug"),
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:HH:MM:ss",
            ignore: "pid,hostname",
          },
        },
      }),
});

function buildLogArgs(args: unknown[]): [Record<string, unknown>, string] {
  if (args.length === 0) return [{}, ""];

  const strings: string[] = [];
  const meta: Record<string, unknown> = {};
  let errorObj: Error | undefined;

  for (const arg of args) {
    if (arg instanceof Error) {
      errorObj = arg;
      strings.push(arg.message);
    } else if (typeof arg === "string") {
      strings.push(arg);
    } else if (typeof arg === "number" || typeof arg === "boolean") {
      strings.push(String(arg));
    } else if (arg === null || arg === undefined) {
      strings.push(String(arg));
    } else {
      try {
        strings.push(JSON.stringify(arg));
      } catch {
        strings.push(String(arg));
      }
    }
  }

  if (errorObj) {
    meta.err = errorObj;
  }

  return [meta, strings.join(" ")];
}

const logger = {
  info(...args: unknown[]) {
    const [meta, msg] = buildLogArgs(args);
    if (Object.keys(meta).length > 0) {
      pinoInstance.info(meta, msg);
    } else {
      pinoInstance.info(msg);
    }
  },
  warn(...args: unknown[]) {
    const [meta, msg] = buildLogArgs(args);
    if (Object.keys(meta).length > 0) {
      pinoInstance.warn(meta, msg);
    } else {
      pinoInstance.warn(msg);
    }
  },
  error(...args: unknown[]) {
    const [meta, msg] = buildLogArgs(args);
    if (Object.keys(meta).length > 0) {
      pinoInstance.error(meta, msg);
    } else {
      pinoInstance.error(msg);
    }
  },
  debug(...args: unknown[]) {
    const [meta, msg] = buildLogArgs(args);
    if (Object.keys(meta).length > 0) {
      pinoInstance.debug(meta, msg);
    } else {
      pinoInstance.debug(msg);
    }
  },
  fatal(...args: unknown[]) {
    const [meta, msg] = buildLogArgs(args);
    if (Object.keys(meta).length > 0) {
      pinoInstance.fatal(meta, msg);
    } else {
      pinoInstance.fatal(msg);
    }
  },
  child(bindings: Record<string, unknown>) {
    return pinoInstance.child(bindings);
  },
  pino: pinoInstance,
};

export default logger;
