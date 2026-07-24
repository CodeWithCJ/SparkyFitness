import { describe, expect, test } from 'vitest';
import announcementService, {
  parseFrontmatter,
} from '../services/announcementService.js';

describe('announcementService', () => {
  test('should parse YAML frontmatter and markdown body correctly', () => {
    const md = `---
id: notice-test-123
active: true
title: Maintenance Alert
---

### System Update

We will be upgrading servers on **August 1st**.
`;

    const parsed = parseFrontmatter(md);
    expect(parsed.frontmatter.id).toBe('notice-test-123');
    expect(parsed.frontmatter.active).toBe(true);
    expect(parsed.frontmatter.title).toBe('Maintenance Alert');
    expect(parsed.body).toContain('### System Update');
    expect(parsed.body).toContain('August 1st');
  });

  test('should return local fallback announcement when offline or fetching', async () => {
    const result = await announcementService.getLatestAnnouncement();
    expect(result).toBeDefined();
    expect(typeof result.id).toBe('string');
    expect(typeof result.active).toBe('boolean');
    expect(typeof result.message).toBe('string');
  });
});
