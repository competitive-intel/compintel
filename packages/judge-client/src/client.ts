import {
  judgeResponseSchema,
  judgeStreamResponseSchema,
  judgeTurnResultSchema,
  type CompileResult,
  type InteractiveJudgeSession,
  type InteractiveRunOptions,
  type JudgeClient,
  type JudgeResult,
  type JudgeTurnResult,
} from "./types.js";
import WebSocket, { type ClientOptions, type RawData } from "ws";

const NANOSECOND = 1_000_000_000;

export interface GoJudgeClientOptions {
  baseUrl: string;
  authToken?: string;
  fetch?: typeof globalThis.fetch;
  webSocketFactory?: (url: string, options: ClientOptions) => WebSocket;
  requestTimeoutMs?: number;
}

export class JudgeTransportError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "JudgeTransportError";
  }
}

export class JudgePlayerOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JudgePlayerOutputError";
  }
}

export class GoJudgeClient implements JudgeClient {
  readonly #baseUrl: string;
  readonly #authToken: string | undefined;
  readonly #fetch: typeof globalThis.fetch;
  readonly #webSocketFactory: (
    url: string,
    options: ClientOptions,
  ) => WebSocket;
  readonly #requestTimeoutMs: number;

  constructor(options: GoJudgeClientOptions) {
    this.#baseUrl = options.baseUrl.replace(/\/$/u, "");
    this.#authToken = options.authToken;
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#webSocketFactory =
      options.webSocketFactory ??
      ((url, webSocketOptions) => new WebSocket(url, webSocketOptions));
    this.#requestTimeoutMs = options.requestTimeoutMs ?? 15_000;
  }

  async compileCpp(sourceCode: string): Promise<CompileResult> {
    const result = await this.#run({
      requestId: crypto.randomUUID(),
      cmd: [
        {
          args: [
            "/usr/bin/g++",
            "-std=c++20",
            "-O2",
            "-pipe",
            "player.cc",
            "-o",
            "player",
          ],
          env: ["PATH=/usr/bin:/bin", "LANG=C"],
          files: [
            { content: "" },
            { name: "stdout", max: 64 * 1024 },
            { name: "stderr", max: 256 * 1024 },
          ],
          cpuLimit: 10 * NANOSECOND,
          clockLimit: 20 * NANOSECOND,
          memoryLimit: 512 * 1024 * 1024,
          stackLimit: 256 * 1024 * 1024,
          procLimit: 64,
          copyIn: { "player.cc": { content: sourceCode } },
          copyOutCached: ["player"],
          copyOutMax: 256 * 1024,
        },
      ],
    });

    return {
      result,
      executableFileId: result.fileIds?.player ?? null,
    };
  }

  async runExecutable(
    executableFileId: string,
    stdin: string,
  ): Promise<JudgeResult> {
    return this.#run({
      requestId: crypto.randomUUID(),
      cmd: [
        {
          args: ["./player"],
          env: ["PATH=/usr/bin:/bin", "LANG=C"],
          files: [
            { content: stdin },
            { name: "stdout", max: 4 * 1024 },
            { name: "stderr", max: 64 * 1024 },
          ],
          cpuLimit: 1 * NANOSECOND,
          clockLimit: 3 * NANOSECOND,
          memoryLimit: 256 * 1024 * 1024,
          stackLimit: 128 * 1024 * 1024,
          procLimit: 8,
          copyIn: { player: { fileId: executableFileId } },
          copyOutMax: 64 * 1024,
        },
      ],
    });
  }

  async startInteractive(
    executableFileId: string,
    options: InteractiveRunOptions,
  ): Promise<InteractiveJudgeSession> {
    const requestId = crypto.randomUUID();
    const socket = this.#webSocketFactory(this.#streamUrl(), {
      ...(this.#authToken === undefined
        ? {}
        : { headers: { authorization: `Bearer ${this.#authToken}` } }),
    });
    await waitForSocketOpen(socket, this.#requestTimeoutMs);

    const session = new WebSocketJudgeSession(
      socket,
      requestId,
      options,
      this.#requestTimeoutMs,
    );
    session.start(executableFileId);
    return session;
  }

  async deleteFile(fileId: string): Promise<void> {
    const response = await this.#request(
      `${this.#baseUrl}/file/${encodeURIComponent(fileId)}`,
      { method: "DELETE" },
    );
    if (!response.ok && response.status !== 404) {
      throw new JudgeTransportError(
        `go-judge file deletion failed with HTTP ${response.status}`,
      );
    }
  }

  async #run(body: unknown): Promise<JudgeResult> {
    const response = await this.#request(`${this.#baseUrl}/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new JudgeTransportError(
        `go-judge request failed with HTTP ${response.status}`,
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      throw new JudgeTransportError("go-judge returned invalid JSON", {
        cause: error,
      });
    }

    const parsed = judgeResponseSchema.safeParse(payload);
    if (!parsed.success) {
      throw new JudgeTransportError("go-judge returned an invalid response", {
        cause: parsed.error,
      });
    }
    return parsed.data[0]!;
  }

  async #request(url: string, init: RequestInit): Promise<Response> {
    const headers = new Headers(init.headers);
    if (this.#authToken !== undefined) {
      headers.set("authorization", `Bearer ${this.#authToken}`);
    }

    try {
      return await this.#fetch(url, {
        ...init,
        headers,
        signal: AbortSignal.timeout(this.#requestTimeoutMs),
      });
    } catch (error) {
      throw new JudgeTransportError("unable to reach go-judge", {
        cause: error,
      });
    }
  }

  #streamUrl(): string {
    const url = new URL(this.#baseUrl);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.pathname = `${url.pathname.replace(/\/$/u, "")}/stream`;
    url.search = "";
    url.hash = "";
    return url.toString();
  }
}

class WebSocketJudgeSession implements InteractiveJudgeSession {
  readonly #encoder = new TextEncoder();
  readonly #decoder = new TextDecoder();
  readonly #finalResult: Promise<JudgeResult>;
  #resolveFinal!: (result: JudgeResult) => void;
  #rejectFinal!: (error: Error) => void;
  #turnId = 0;
  #pendingTurn:
    | {
        turnId: number;
        resolve: (result: JudgeTurnResult) => void;
        reject: (error: Error) => void;
        timeout: ReturnType<typeof setTimeout>;
      }
    | undefined;
  #finished = false;
  #aborted = false;

  constructor(
    private readonly socket: WebSocket,
    private readonly requestId: string,
    private readonly options: InteractiveRunOptions,
    private readonly requestTimeoutMs: number,
  ) {
    this.#finalResult = new Promise((resolve, reject) => {
      this.#resolveFinal = resolve;
      this.#rejectFinal = reject;
    });
    socket.on("message", (data, isBinary) => this.#onMessage(data, isBinary));
    socket.on("error", () => {
      this.#fail(new JudgeTransportError("go-judge stream failed"));
    });
    socket.on("close", () => {
      if (!this.#finished) {
        this.#fail(
          new JudgeTransportError(
            "go-judge stream closed before returning a result",
          ),
        );
      }
    });
  }

  start(executableFileId: string): void {
    this.#sendJson(1, {
      requestId: this.requestId,
      cmd: [
        {
          args: ["./player"],
          env: ["PATH=/usr/bin:/bin", "LANG=C"],
          files: [
            { streamIn: true },
            { streamOut: true },
            { name: "stderr", max: 64 * 1024 },
          ],
          cpuLimit: this.options.totalCpuLimitNs,
          clockLimit: 300 * NANOSECOND,
          memoryLimit: this.options.memoryLimitBytes,
          stackLimit: this.options.stackLimitBytes,
          procLimit: this.options.processLimit,
          copyIn: { player: { fileId: executableFileId } },
          copyOutMax: 64 * 1024,
        },
      ],
    });
  }

  async playTurn(stdin: string): Promise<JudgeTurnResult> {
    if (this.#finished) {
      throw new JudgeTransportError("interactive session has finished");
    }
    if (this.#aborted) {
      throw new JudgePlayerOutputError("interactive session was aborted");
    }
    if (this.#pendingTurn !== undefined) {
      throw new JudgeTransportError("an interactive turn is already active");
    }

    const turnId = ++this.#turnId;
    const result = new Promise<JudgeTurnResult>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.#fail(new JudgeTransportError("go-judge turn response timed out"));
      }, this.requestTimeoutMs);
      this.#pendingTurn = { turnId, resolve, reject, timeout };
    });

    this.#sendJson(5, {
      index: 0,
      beginTurn: {
        turnId,
        moveCpuLimit: this.options.moveCpuLimitNs,
        totalCpuLimit: this.options.totalCpuLimitNs,
        wallLimit: this.options.wallLimitNs,
        outputFd: 1,
        delimiter: "\n",
        maxOutput: this.options.maxOutputBytes,
      },
    });
    this.#sendInput(stdin);
    return result;
  }

  async finish(): Promise<JudgeResult> {
    if (!this.#finished && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(Uint8Array.of(4));
    }
    try {
      return await promiseWithTimeout(
        this.#finalResult,
        this.requestTimeoutMs,
        "go-judge final stream response timed out",
      );
    } finally {
      if (this.socket.readyState < WebSocket.CLOSING) {
        this.socket.close(1000, "evaluation complete");
      }
    }
  }

  #onMessage(data: RawData, isBinary: boolean): void {
    try {
      if (!isBinary) {
        throw new JudgeTransportError(
          "go-judge returned a non-binary stream frame",
        );
      }
      this.#handleFrame(rawDataBytes(data));
    } catch (error) {
      this.#fail(
        error instanceof Error
          ? error
          : new JudgeTransportError("invalid go-judge stream frame"),
      );
    }
  }

  #handleFrame(frame: Uint8Array): void {
    const type = frame[0];
    if (type === undefined) {
      throw new JudgeTransportError("go-judge returned an empty stream frame");
    }
    const payload = this.#decoder.decode(frame.subarray(1));

    if (type === 5) {
      const parsed = judgeTurnResultSchema.safeParse(JSON.parse(payload));
      if (!parsed.success) {
        throw new JudgeTransportError(
          "go-judge returned an invalid turn event",
          {
            cause: parsed.error,
          },
        );
      }
      const pending = this.#pendingTurn;
      if (pending === undefined || parsed.data.turnId !== pending.turnId) {
        throw new JudgeTransportError(
          "go-judge returned an unexpected turn event",
        );
      }
      clearTimeout(pending.timeout);
      this.#pendingTurn = undefined;
      pending.resolve(parsed.data);
      return;
    }

    if (type === 1) {
      const parsed = judgeStreamResponseSchema.safeParse(JSON.parse(payload));
      if (!parsed.success) {
        throw new JudgeTransportError(
          "go-judge returned an invalid final stream response",
          { cause: parsed.error },
        );
      }
      if (parsed.data.error !== undefined) {
        throw new JudgeTransportError(
          `go-judge stream execution failed: ${parsed.data.error}`,
        );
      }
      this.#finished = true;
      this.#resolveFinal(parsed.data.results[0]!);
      return;
    }

    if (type === 2) {
      this.#abortTurn(
        new JudgePlayerOutputError(
          "player wrote output outside an active controlled turn",
        ),
      );
      return;
    }
    throw new JudgeTransportError(
      `unknown go-judge stream frame type: ${type}`,
    );
  }

  #sendJson(type: number, value: unknown): void {
    const payload = this.#encoder.encode(JSON.stringify(value));
    const frame = new Uint8Array(payload.length + 1);
    frame[0] = type;
    frame.set(payload, 1);
    this.socket.send(frame);
  }

  #sendInput(input: string): void {
    const payload = this.#encoder.encode(input);
    const frame = new Uint8Array(payload.length + 2);
    frame[0] = 3;
    frame[1] = 0;
    frame.set(payload, 2);
    this.socket.send(frame);
  }

  #fail(error: Error): void {
    const pending = this.#pendingTurn;
    if (pending !== undefined) {
      clearTimeout(pending.timeout);
      this.#pendingTurn = undefined;
      pending.reject(error);
    }
    if (!this.#finished) {
      this.#finished = true;
      this.#rejectFinal(error);
    }
    if (this.socket.readyState < WebSocket.CLOSING) {
      this.socket.close();
    }
  }

  #abortTurn(error: JudgePlayerOutputError): void {
    this.#aborted = true;
    const pending = this.#pendingTurn;
    if (pending !== undefined) {
      clearTimeout(pending.timeout);
      this.#pendingTurn = undefined;
      pending.reject(error);
    }
    if (this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(Uint8Array.of(4));
    }
  }
}

function waitForSocketOpen(
  socket: WebSocket,
  timeoutMs: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      socket.close();
      reject(new JudgeTransportError("go-judge stream connection timed out"));
    }, timeoutMs);
    const cleanup = (): void => {
      clearTimeout(timeout);
      socket.off("open", onOpen);
      socket.off("error", onError);
    };
    const onOpen = (): void => {
      cleanup();
      resolve();
    };
    const onError = (): void => {
      cleanup();
      reject(new JudgeTransportError("unable to connect to go-judge stream"));
    };
    socket.once("open", onOpen);
    socket.once("error", onError);
  });
}

function rawDataBytes(data: RawData): Uint8Array {
  if (Array.isArray(data)) {
    return Buffer.concat(data);
  }
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}

async function promiseWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new JudgeTransportError(message)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  }
}
