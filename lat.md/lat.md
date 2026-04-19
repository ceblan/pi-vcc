# pi-vcc

An algorithmic conversation compactor for Pi AI coding agent using deterministic no-LLM approach.

## When to Use

Use for deterministic, reproducible compaction with no LLM dependency, preserving searchable conversation history with lower token costs.

## When NOT to Use

Avoid for semantic summarization requiring LLM understanding.

## Installation

Install the npm package and add to Pi extensions configuration.

```bash
npm install @sting8k/pi-vcc
```

```json
{ "extensions": ["@sting8k/pi-vcc"] }
```

## Usage

Use the `/pi-vcc` slash command to compact the current conversation.

## Key Features

Core features include message normalization, noise filtering, section building, brief transcript generation, BM25 search, and extraction of goals/files/preferences/commits.

## Architecture Pipeline

The detailed pipeline: normalize → filter → build-sections → format → merge.

## API Reference

Core modules cover normalize, filter, build-sections, format, summarize. Extraction modules handle goals, files, preferences, commits. Integration happens via hooks, commands, and tools.

- [[architecture]] — Architecture details and pipeline stages
- [[core]] — Core compaction modules  
- [[extract]] — Extraction modules
- [[hooks-commands-tools]] — Hook, command, and tool registration
- [[journals]] — Session journals
- [[tests]] — Test suite documentation