import { hostname } from "node:os";

import pino, {
  type DestinationStream,
  type Logger,
  type LoggerOptions,
} from "pino";

export const LOG_LEVELS = [
  "fatal",
  "error",
  "warn",
  "info",
  "debug",
  "trace",
  "silent",
] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

export interface CreateLoggerOptions {
  service: string;
  level?: LogLevel;
  environment?: string;
  destination?: DestinationStream;
}

export const LOGGER_REDACT_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  "req.headers['set-cookie']",
  "res.headers['set-cookie']",
  "headers.authorization",
  "headers.cookie",
  "headers['set-cookie']",
  "password",
  "token",
  "authToken",
  "turnstileToken",
  "verifyCode",
  "verificationCode",
  "secretId",
  "secretKey",
  "sourceCode",
  "body.code",
  "input.code",
  "req.body.code",
  "request.body.code",
  "*.password",
  "*.token",
  "*.authToken",
  "*.turnstileToken",
  "*.verifyCode",
  "*.verificationCode",
  "*.secretId",
  "*.secretKey",
  "*.sourceCode",
  "*.*.password",
  "*.*.token",
  "*.*.authToken",
  "*.*.turnstileToken",
  "*.*.verifyCode",
  "*.*.verificationCode",
  "*.*.secretId",
  "*.*.secretKey",
  "*.*.sourceCode",
] as const;

export function createLogger(options: CreateLoggerOptions): Logger {
  const loggerOptions: LoggerOptions = {
    level: options.level ?? "info",
    base: {
      service: options.service,
      pid: process.pid,
      hostname: hostname(),
      ...(options.environment === undefined
        ? {}
        : { environment: options.environment }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: [...LOGGER_REDACT_PATHS],
      censor: "[Redacted]",
    },
    serializers: {
      err: pino.stdSerializers.err,
      error: pino.stdSerializers.err,
    },
  };

  return options.destination === undefined
    ? pino(loggerOptions)
    : pino(loggerOptions, options.destination);
}

export type { Logger } from "pino";
