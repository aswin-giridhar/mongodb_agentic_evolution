/**
 * Utility functions for data generation
 */

import { createHash } from 'crypto';
import { readFile, writeFile } from 'fs/promises';
import { ServiceSpec, PersonSpec, TribalRule } from '../types.js';

/**
 * Generate a consistent ID from content hash
 */
export function generateId(content: string, prefix: string = ''): string {
  const hash = createHash('sha256').update(content).digest('hex').substring(0, 12);
  return prefix ? `${prefix}:${hash}` : hash;
}

/**
 * Generate timestamp relative to now (in milliseconds)
 */
export function relativeTime(weeksAgo: number, timeAnchor: Date = new Date()): number {
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  return timeAnchor.getTime() - (weeksAgo * msPerWeek);
}

/**
 * Generate random timestamp within a range
 */
export function randomTimestamp(start: number, end: number): number {
  return start + Math.random() * (end - start);
}

/**
 * Parse seed-spec.json
 */
export async function loadSeedSpec(path: string = './seed-data/seed-spec.json') {
  const content = await readFile(path, 'utf-8');
  return JSON.parse(content);
}

/**
 * Save generated data to file
 */
export async function saveData(data: unknown, filename: string) {
  const dir = './seed-data';
  await writeFile(`${dir}/${filename}`, JSON.stringify(data, null, 2));
  console.log(`✅ Generated ${filename}`);
}

/**
 * Extract entity references from content using keyword matching
 */
export function extractRefs(
  content: string,
  services: ServiceSpec[],
  people: PersonSpec[]
): string[] {
  const refs: string[] = [];
  const lowerContent = content.toLowerCase();

  // Check service references
  for (const service of services) {
    const keywords = [
      service.id,
      service.name,
      ...service.hot_files.map(f => f.split('/').pop() || '')
    ];
    for (const keyword of keywords) {
      if (lowerContent.includes(keyword.toLowerCase())) {
        refs.push(`services.${service.id}`);
        break;
      }
    }
  }

  // Check people references
  for (const person of people) {
    const keywords = [person.id, person.name, person.handle];
    for (const keyword of keywords) {
      if (lowerContent.includes(keyword.toLowerCase())) {
        refs.push(`people.${person.id}`);
        break;
      }
    }
  }

  return [...new Set(refs)]; // Deduplicate
}

/**
 * Format timestamp for Slack messages
 */
export function slackTimestamp(ms: number): string {
  const sec = Math.floor(ms / 1000);
  return `${sec}.${Math.floor(Math.random() * 999999)}`;
}

/**
 * Generate Jira-style ticket key
 */
export function jiraKey(project: string, number: number): string {
  return `${project}-${number}`;
}

/**
 * Chunk array into smaller arrays
 */
export function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Random item from array
 */
export function randomItem<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

/**
 * Random items from array (unique)
 */
export function randomItems<T>(array: T[], count: number): T[] {
  const shuffled = [...array].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, array.length));
}

/**
 * Format duration in human-readable form
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d`;
  if (hours > 0) return `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

/**
 * Generate a realistic file path for a service
 */
export function generateFilePath(service: string, fileName: string): string {
  const serviceDir = service === 'redis' ? 'lib' : `services/${service}`;
  const ext = fileName.endsWith('.ts') ? '' : '.ts';
  return `${serviceDir}/src/${fileName}${ext}`;
}
