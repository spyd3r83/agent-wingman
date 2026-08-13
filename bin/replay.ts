#!/usr/bin/env bun
import { readFile } from "node:fs/promises"
import { basename } from "node:path"
import { loadConfig } from "../src/config"
import { WingmanEngine } from "../src/engine"
import type { RawTraceEvent, ReplayResult } from "../src/types"

interface TraceFile {
  label: string
  expectedFire: boolean
  events: RawTraceEvent[]
}

export async function replayFile(file: string): Promise<ReplayResult> {
  const trace = JSON.parse(await readFile(file, "utf8")) as TraceFile
  const engine = new WingmanEngine({ ...loadConfig(), minRelevantActions: 1 })
  let interventions = 0
  for (const event of trace.events) if (engine.observe(event)) interventions += 1
  const fired = interventions > 0
  return {
    file: basename(file),
    expected: trace.expectedFire,
    fired,
    interventions,
    falsePositive: fired && !trace.expectedFire,
    falseNegative: !fired && trace.expectedFire,
  }
}

export function metrics(results: ReplayResult[]) {
  const truePositives = results.filter((item) => item.expected && item.fired).length
  const falsePositives = results.filter((item) => item.falsePositive).length
  const falseNegatives = results.filter((item) => item.falseNegative).length
  const duplicates = results.reduce((sum, item) => sum + Math.max(0, item.interventions - 1), 0)
  const precision = truePositives / Math.max(1, truePositives + falsePositives)
  const recall = truePositives / Math.max(1, truePositives + falseNegatives)
  return { truePositives, falsePositives, falseNegatives, precision, recall, duplicates }
}

if (import.meta.main) {
  const files = process.argv.slice(2)
  if (files.length === 0) throw new Error("Usage: agent-wingman-replay <trace.json...>")
  const results = await Promise.all(files.map(replayFile))
  const summary = metrics(results)
  console.log(JSON.stringify({ results, summary }, null, 2))
  if (summary.precision < 0.9 || summary.recall < 0.7 || summary.duplicates > 0) process.exit(1)
}
