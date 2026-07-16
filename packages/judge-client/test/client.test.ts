import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import { GoJudgeClient } from "../src/index.js";
import WebSocket, { type ClientOptions } from "ws";

test("compiles source and returns the cached executable id", async () => {
  let requestBody: Record<string, unknown> | undefined;
  const client = new GoJudgeClient({
    baseUrl: "http://judge.test",
    fetch: async (_url, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return Response.json([
        {
          status: "Accepted",
          exitStatus: 0,
          time: 1,
          memory: 2,
          runTime: 3,
          files: { stderr: "" },
          fileIds: { player: "binary-id" },
        },
      ]);
    },
  });

  const result = await client.compileCpp("int main() { return 0; }");
  assert.equal(result.executableFileId, "binary-id");
  assert.ok(Array.isArray(requestBody?.cmd));
});

test("passes the cached executable to the sandbox run", async () => {
  const client = new GoJudgeClient({
    baseUrl: "http://judge.test/",
    fetch: async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as {
        cmd: Array<{ copyIn: { player: { fileId: string } } }>;
      };
      assert.equal(body.cmd[0]?.copyIn.player.fileId, "binary-id");
      return Response.json([
        {
          status: "Accepted",
          time: 10,
          memory: 20,
          runTime: 30,
          files: { stdout: "7 7\n", stderr: "" },
        },
      ]);
    },
  });

  const result = await client.runExecutable("binary-id", "{}\n");
  assert.equal(result.files?.stdout, "7 7\n");
});

test("runs a controlled interactive turn over the stream websocket", async () => {
  let execution: Record<string, unknown> | undefined;
  let control: Record<string, unknown> | undefined;
  let input = "";
  let connectionUrl = "";
  let connectionOptions: ClientOptions | undefined;
  const socket = new FakeWebSocket((frame) => {
    switch (frame[0]) {
      case 1:
        execution = JSON.parse(frame.subarray(1).toString()) as Record<
          string,
          unknown
        >;
        break;
      case 5: {
        control = JSON.parse(frame.subarray(1).toString()) as Record<
          string,
          unknown
        >;
        const turn = control.beginTurn as { turnId: number };
        socket.receive(
          binaryJson(5, {
            requestId: "request-id",
            index: 0,
            turnId: turn.turnId,
            type: "turnCompleted",
            moveCpu: 12,
            totalCpu: 34,
            wallTime: 56,
            output: "7 8\n",
          }),
        );
        break;
      }
      case 3:
        input = frame.subarray(2).toString();
        break;
      case 4:
        socket.receive(
          binaryJson(1, {
            requestId: "request-id",
            results: [
              {
                status: "Signalled",
                time: 34,
                memory: 1024,
                runTime: 56,
                files: { stderr: "" },
              },
            ],
          }),
        );
        break;
    }
  });

  const client = new GoJudgeClient({
    baseUrl: "http://judge.test",
    authToken: "secret",
    webSocketFactory(url, options) {
      connectionUrl = url;
      connectionOptions = options;
      return socket as unknown as WebSocket;
    },
  });
  const session = await client.startInteractive("binary-id", {
    moveCpuLimitNs: 100_000_000,
    totalCpuLimitNs: 5_000_000_000,
    wallLimitNs: 1_000_000_000,
    maxOutputBytes: 64,
    memoryLimitBytes: 256 * 1024 * 1024,
    stackLimitBytes: 128 * 1024 * 1024,
    processLimit: 8,
  });
  const turn = await session.playTurn("1\n15 15\n1\n7 7\n");
  const final = await session.finish();

  assert.equal(turn.output, "7 8\n");
  assert.equal(final.memory, 1024);
  assert.equal(connectionUrl, "ws://judge.test/stream");
  assert.deepEqual(connectionOptions?.headers, {
    authorization: "Bearer secret",
  });
  assert.equal(input, "1\n15 15\n1\n7 7\n");
  assert.equal(
    (control?.beginTurn as { moveCpuLimit: number }).moveCpuLimit,
    100_000_000,
  );
  const command = (execution?.cmd as Array<Record<string, unknown>>)[0]!;
  assert.deepEqual(command.copyIn, { player: { fileId: "binary-id" } });
  assert.equal(command.clockLimit, 300_000_000_000);
});

function binaryJson(type: number, value: unknown): Buffer {
  return Buffer.concat([
    Buffer.from([type]),
    Buffer.from(JSON.stringify(value)),
  ]);
}

class FakeWebSocket extends EventEmitter {
  readyState = WebSocket.CONNECTING;

  constructor(private readonly onSend: (frame: Buffer) => void) {
    super();
    queueMicrotask(() => {
      this.readyState = WebSocket.OPEN;
      this.emit("open");
    });
  }

  send(data: ArrayBuffer | ArrayBufferView): void {
    this.onSend(Buffer.from(data as Uint8Array));
  }

  receive(data: Buffer): void {
    queueMicrotask(() => this.emit("message", data, true));
  }

  close(): void {
    this.readyState = WebSocket.CLOSED;
    queueMicrotask(() => this.emit("close"));
  }
}
