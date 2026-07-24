import fs from 'fs';
import path from 'path';
import axios from 'axios';
import https from 'https';
import { fileURLToPath } from 'url';
import NodeCache from 'node-cache';
import { log } from '../config/logging.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const announcementCache = new NodeCache({ stdTTL: 900 }); // 15 minutes cache
const CACHE_KEY = 'latest_announcement';

export interface AnnouncementResponse {
  id: string;
  active: boolean;
  title: string;
  message: string;
  publishedAt?: string;
  htmlUrl?: string;
}

export function parseFrontmatter(markdownContent: string): {
  frontmatter: Record<string, any>;
  body: string;
} {
  const match = markdownContent.match(
    /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/
  );
  if (!match) {
    return { frontmatter: {}, body: markdownContent.trim() };
  }
  const yamlText = match[1]!;
  const body = match[2]!.trim();
  const frontmatter: Record<string, any> = {};

  for (const line of yamlText.split(/\r?\n/)) {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim();
      let value: any = line.slice(colonIndex + 1).trim();
      if (value === 'true') value = true;
      else if (value === 'false') value = false;
      else if (value.startsWith('"') && value.endsWith('"'))
        value = value.slice(1, -1);
      else if (value.startsWith("'") && value.endsWith("'"))
        value = value.slice(1, -1);
      frontmatter[key] = value;
    }
  }

  return { frontmatter, body };
}

function fetchDirectText(
  url: string
): Promise<{ data: string; lastModified?: string }> {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'SparkyFitness-App',
      },
      timeout: 8000,
    };
    const req = https.get(url, options, (res) => {
      if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
        res.resume();
        reject(new Error(`Direct fetch failed with status: ${res.statusCode}`));
        return;
      }
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        const lastModified = res.headers['last-modified'] || undefined;
        resolve({ data, lastModified });
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Direct fetch timed out after 8s'));
    });
  });
}

function getLocalFallbackAnnouncement(): AnnouncementResponse {
  try {
    const localPath = path.resolve(__dirname, '../../../announcement.md');
    if (fs.existsSync(localPath)) {
      const content = fs.readFileSync(localPath, 'utf8');
      const stat = fs.statSync(localPath);
      const { frontmatter, body } = parseFrontmatter(content);
      return {
        id: String(frontmatter.id || 'notice-local'),
        active: Boolean(frontmatter.active ?? false),
        title: String(frontmatter.title || 'Announcement'),
        message: body,
        publishedAt: stat.mtime.toISOString(),
      };
    }
  } catch (err) {
    log('warn', 'Failed reading local announcement.md fallback:', err);
  }
  return {
    id: 'none',
    active: false,
    title: '',
    message: '',
  };
}

async function getLatestAnnouncement(
  bypassCache = false
): Promise<AnnouncementResponse> {
  const isDev = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;

  if (!bypassCache && !isDev) {
    const cached = announcementCache.get<AnnouncementResponse>(CACHE_KEY);
    if (cached) {
      return cached;
    }
  }

  const rawUrl =
    'https://raw.githubusercontent.com/CodeWithCJ/SparkyFitness/main/announcement.md';

  let rawContent: string;
  let lastModifiedStr: string | undefined;

  try {
    const res = await axios.get(rawUrl, {
      timeout: 8000,
      headers: { 'User-Agent': 'SparkyFitness-App' },
    });
    rawContent = typeof res.data === 'string' ? res.data : String(res.data);
    lastModifiedStr = res.headers['last-modified'] || undefined;
  } catch (axiosErr) {
    log(
      'warn',
      'Failed fetching announcement via Axios, attempting direct HTTPS fallback...',
      axiosErr
    );
    try {
      const fallbackRes = await fetchDirectText(rawUrl);
      rawContent = fallbackRes.data;
      lastModifiedStr = fallbackRes.lastModified;
    } catch (fallbackError) {
      log(
        'warn',
        'GitHub announcement fetch failed, returning local file fallback:',
        fallbackError
      );
      return getLocalFallbackAnnouncement();
    }
  }

  try {
    const { frontmatter, body } = parseFrontmatter(rawContent);
    const result: AnnouncementResponse = {
      id: String(frontmatter.id || 'notice-1'),
      active: Boolean(frontmatter.active ?? false),
      title: String(frontmatter.title || 'Announcement'),
      message: body,
      publishedAt: lastModifiedStr
        ? new Date(lastModifiedStr).toISOString()
        : new Date().toISOString(),
      htmlUrl:
        'https://github.com/CodeWithCJ/SparkyFitness/blob/main/announcement.md',
    };

    announcementCache.set(CACHE_KEY, result);
    return result;
  } catch (parseError) {
    log('error', 'Failed parsing announcement frontmatter:', parseError);
    return getLocalFallbackAnnouncement();
  }
}

export default {
  getLatestAnnouncement,
  parseFrontmatter,
};
