import { describe, expect, test } from "bun:test"
import { glob } from "node:fs/promises"
import { metrics, replayFile } from "../bin/replay"

describe("trace replay corpus", () => {
  test("meets initial precision and recall gates", async () => {
    const files: string[] = []
    for await (const file of glob("fixtures/traces/*.json")) files.push(file)
    const results = await Promise.all(files.map(replayFile))
    const summary = metrics(results)
    expect(summary.precision).toBeGreaterThanOrEqual(0.9)
    expect(summary.recall).toBeGreaterThanOrEqual(0.7)
    expect(summary.duplicates).toBe(0)
  })
})
