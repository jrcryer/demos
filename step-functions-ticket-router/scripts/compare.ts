/**
 * Runs the labelled tickets in data/tickets.json through both classifiers and
 * prints accuracy, latency and cost side by side.
 *
 *   OPENAI_API_KEY=... AWS_REGION=us-east-1 npm run compare -- --runs 3
 *
 * The classifiers are called directly rather than through Lambda, so latency
 * is the model call alone. Each run alternates provider order per ticket so
 * neither side benefits from going second.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import OpenAI from 'openai';
import { classifyWithClaude, createClaudeClient } from '../src/classifiers/claude-bedrock';
import { classifyWithDecisions } from '../src/classifiers/openai-decisions';
import { DEFAULT_CLAUDE_MODEL, DEFAULT_OPENAI_MODEL } from '../src/shared/models';
import type { Provider, Route, RouteDecision, Ticket } from '../src/shared/routing';

interface LabelledTicket {
  readonly ticket: Ticket;
  readonly expected: { readonly route: Route; readonly needsHuman: boolean };
}

interface Sample {
  readonly decision: RouteDecision;
  readonly expected: LabelledTicket['expected'];
}

function argValue(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

const pct = (n: number, d: number): string => `${((100 * n) / d).toFixed(0)}%`;

async function main(): Promise<void> {
  const runs = Number(argValue('runs', '1'));
  const openaiModel = argValue('openai-model', DEFAULT_OPENAI_MODEL);
  const claudeModel = argValue('claude-model', DEFAULT_CLAUDE_MODEL);
  const tickets = JSON.parse(
    readFileSync(path.join(__dirname, '..', 'data', 'tickets.json'), 'utf8'),
  ) as LabelledTicket[];

  const openai = new OpenAI({ maxRetries: 2 });
  const claude = createClaudeClient(process.env.AWS_REGION);

  const classifiers: Record<Provider, (ticket: Ticket) => Promise<RouteDecision>> = {
    'openai-decisions': (ticket) => classifyWithDecisions(openai, ticket, openaiModel),
    'claude-bedrock': (ticket) => classifyWithClaude(claude, ticket, claudeModel),
  };
  const providers = Object.keys(classifiers) as Provider[];

  // Warm connections and credentials so the first sample isn't an outlier.
  await Promise.all(providers.map((provider) => classifiers[provider](tickets[0].ticket)));

  const samples: Record<Provider, Sample[]> = { 'openai-decisions': [], 'claude-bedrock': [] };
  for (let run = 0; run < runs; run++) {
    for (const [index, labelled] of tickets.entries()) {
      const order = (run + index) % 2 === 0 ? providers : [...providers].reverse();
      for (const provider of order) {
        const decision = await classifiers[provider](labelled.ticket);
        samples[provider].push({ decision, expected: labelled.expected });
        process.stdout.write('.');
      }
    }
  }
  process.stdout.write('\n\n');

  console.log(
    '| Provider | Model | Route accuracy | Escalation accuracy | p50 latency | p95 latency | Cost / 1k tickets |',
  );
  console.log('| --- | --- | --- | --- | --- | --- | --- |');
  for (const provider of providers) {
    const results = samples[provider];
    const latencies = results.map(({ decision }) => decision.latencyMs);
    const routeHits = results.filter(({ decision, expected }) => decision.route === expected.route);
    const humanHits = results.filter(
      ({ decision, expected }) => decision.needsHuman === expected.needsHuman,
    );
    const cost = results.reduce((sum, { decision }) => sum + decision.estimatedCostUsd, 0);
    console.log(
      `| ${provider} | ${results[0].decision.model} | ${pct(routeHits.length, results.length)} ` +
        `| ${pct(humanHits.length, results.length)} | ${percentile(latencies, 50)} ms ` +
        `| ${percentile(latencies, 95)} ms | $${((cost / results.length) * 1000).toFixed(4)} |`,
    );
  }

  console.log('\nMisrouted tickets:');
  for (const provider of providers) {
    for (const { decision, expected } of samples[provider]) {
      if (decision.route !== expected.route) {
        console.log(
          `  ${provider} ${decision.ticketId}: got ${decision.route}, expected ${expected.route}`,
        );
      }
    }
  }

  const outDir = path.join(__dirname, '..', 'results');
  mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `compare-${new Date().toISOString().replace(/:/g, '-')}.json`);
  writeFileSync(outFile, JSON.stringify(samples, null, 2));
  console.log(`\nRaw results: ${path.relative(process.cwd(), outFile)}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
