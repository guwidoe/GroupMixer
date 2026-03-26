import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BROWSER_AGENT_BOOTSTRAP_ID,
  BROWSER_AGENT_BOOTSTRAP_SPEC,
} from './browserAgentApi';

describe('browser agent bootstrap html', () => {
  it('publishes hidden bootstrap JSON in index.html for automatic agent discovery', () => {
    const html = readFileSync('index.html', 'utf8');
    const document = new DOMParser().parseFromString(html, 'text/html');
    const script = document.getElementById(BROWSER_AGENT_BOOTSTRAP_ID);

    expect(script).not.toBeNull();
    expect(script?.getAttribute('type')).toBe('application/json');
    expect(JSON.parse(script?.textContent ?? 'null')).toEqual(BROWSER_AGENT_BOOTSTRAP_SPEC);
  });
});
