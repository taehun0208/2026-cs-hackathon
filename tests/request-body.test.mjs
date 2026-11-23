import test from "node:test";
import assert from "node:assert/strict";
import { readBody } from "../lib/server.ts";

const encoder = new TextEncoder();
function streamed(chunks, headers = {}) {
  let pulled = 0,
    cancelled = false;
  const body = new ReadableStream(
    {
      pull(controller) {
        if (pulled === chunks.length) return controller.close();
        controller.enqueue(chunks[pulled++]);
      },
      cancel() {
        cancelled = true;
      },
    },
    { highWaterMark: 0 },
  );
  return {
    req: new Request("https://lab.example/api/state", {
      method: "POST",
      body,
      duplex: "half",
      headers,
    }),
    counts: () => ({ pulled, cancelled }),
  };
}

test("oversize streamed JSON is cancelled before consuming the remaining body even with missing or understated length", async () => {
  for (const headers of [{}, { "Content-Length": "1" }]) {
    const fixture = streamed(
      [encoder.encode('"' + "a".repeat(17)), encoder.encode('tail"')],
      headers,
    );
    await assert.rejects(readBody(fixture.req, 16));
    assert.deepEqual(fixture.counts(), { pulled: 1, cancelled: true });
  }
});

test("declared oversize bytes are rejected without reading the stream", async () => {
  const fixture = streamed([encoder.encode('"ok"')], {
    "Content-Length": "1000000",
  });
  await assert.rejects(readBody(fixture.req, 16));
  assert.deepEqual(fixture.counts(), { pulled: 0, cancelled: true });
});

test("Unicode split across UTF-8 chunks keeps the existing character limit", async () => {
  const value = '"한글😀"',
    bytes = encoder.encode(value),
    fixture = streamed(Array.from(bytes, (byte) => new Uint8Array([byte])));
  assert.equal(await readBody(fixture.req, value.length), "한글😀");
  const short = streamed([bytes]);
  await assert.rejects(readBody(short.req, value.length - 1));
  await assert.rejects(readBody(new Request("https://lab.example")));
});

test("malformed JSON and byte-heavy invalid UTF-8 cannot skip the limit", async () => {
  await assert.rejects(readBody(streamed([encoder.encode('{"a":')]).req, 32));
  const fixture = streamed([
    new Uint8Array(65).fill(0xff),
    encoder.encode("end"),
  ]);
  await assert.rejects(readBody(fixture.req, 16));
  assert.deepEqual(fixture.counts(), { pulled: 1, cancelled: true });
});
