import { NextRequest, NextResponse } from 'next/server';
import { getUserId, isSystemUser } from '@/lib/user';
import { logUsage } from '@/lib/usage';
import { getModel, geminiUsage, GEMINI_MODEL } from '@/lib/gemini';


const VALID_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;
type ImageMediaType = typeof VALID_IMAGE_TYPES[number];

function detectSource(url: string): string {
  if (!url?.trim()) return 'Pasted';
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes('linkedin')) return 'LinkedIn';
    if (host.includes('greenhouse')) return 'Greenhouse';
    if (host.includes('lever')) return 'Lever';
    if (host.includes('workday') || host.includes('myworkdayjobs')) return 'Workday';
    if (host.includes('indeed')) return 'Indeed';
    if (host.includes('handshake')) return 'Handshake';
    if (host.includes('glassdoor')) return 'Glassdoor';
    if (host.includes('smartrecruiters')) return 'SmartRecruiters';
    if (host.includes('icims')) return 'iCIMS';
  } catch { /* ignore */ }
  return 'company site';
}

async function fetchWithJina(url: string): Promise<string> {
  const res = await fetch(`https://r.jina.ai/${url}`, {
    headers: { 'Accept': 'text/plain', 'X-No-Cache': 'true' },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Jina ${res.status}`);
  return (await res.text()).trim().slice(0, 18000);
}

async function fetchAndStrip(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    signal: AbortSignal.timeout(12000),
  });
  const html = await res.text();
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#\d+;/g, ' ').replace(/\s{2,}/g, ' ')
    .trim().slice(0, 12000);
}

export async function POST(request: NextRequest) {
  try {
    const userId = getUserId(request);
    if (isSystemUser(userId)) return NextResponse.json({ error: 'Not available' }, { status: 403 });
    const body = await request.json();
    const { url, extraText, imageBase64, imageMediaType, extraLink } = body as {
      url?: string;
      extraText?: string;
      imageBase64?: string;
      imageMediaType?: string;
      extraLink?: string;
    };

    if (!url?.trim() && !extraText?.trim()) {
      return NextResponse.json({ error: 'Paste a job posting link or the job description text.' }, { status: 400 });
    }

    const cleanUrl = url?.trim() || null;
    const source = detectSource(url || '');
    const contextParts: string[] = [];
    const warnings: string[] = [];

    // 1. Fetch the main URL (if given) — try Jina reader first (handles JS-rendered pages), fallback to plain fetch
    if (url?.trim()) {
      try {
        let text = '';
        try {
          text = await fetchWithJina(url);
        } catch {
          text = await fetchAndStrip(url);
        }
        if (text) contextParts.push(`[PAGE: ${url}]\n${text}`);
        else warnings.push('Page loaded but had no readable content.');
      } catch {
        warnings.push('Could not fetch the page — it may require login or block automated access.');
      }
    }

    // 2. User-provided extra text (paste, recruiter message, JD copy-paste, etc.)
    if (extraText?.trim()) {
      contextParts.push(`[USER-PROVIDED CONTEXT]\n${extraText.trim()}`);
    }

    // 3. Screenshot via vision
    if (imageBase64 && imageMediaType && VALID_IMAGE_TYPES.includes(imageMediaType as ImageMediaType)) {
      try {
        const { client } = getModel();
        const visionRes = await client.chat.completions.create({
          model: GEMINI_MODEL,
          messages: [{
            role: 'user' as const,
            content: [
              { type: 'image_url', image_url: { url: `data:${imageMediaType};base64,${imageBase64}` } },
              { type: 'text', text: 'Extract all text visible in this job posting screenshot. Preserve structure (titles, bullet points). Return only the extracted text, no commentary.' },
            ],
          }],
        });
        await logUsage(userId, 'job_import', GEMINI_MODEL, geminiUsage(visionRes.usage));
        const imageText = visionRes.choices[0]?.message?.content || '';
        if (imageText) contextParts.push(`[FROM SCREENSHOT]\n${imageText}`);
      } catch {
        warnings.push('Could not process the screenshot.');
      }
    }

    // 4. Extra link — attempt to fetch it too
    if (extraLink?.trim()) {
      try {
        const linkText = await fetchAndStrip(extraLink.trim());
        if (linkText) contextParts.push(`[ADDITIONAL LINK: ${extraLink}]\n${linkText.slice(0, 4000)}`);
      } catch { /* silently skip */ }
    }

    const blank = { company: '', title: '', location: '', type: '', deadline: '', posting_date: '', salary_range: '', description: '' };

    if (contextParts.length === 0) {
      const warning = warnings.join(' ') || 'No content could be extracted. Fill in the fields manually.';
      return NextResponse.json({ ...blank, url: cleanUrl, source, warning });
    }

    const combinedContext = contextParts.join('\n\n---\n\n').slice(0, 18000);

    const { client } = getModel();
    const response = await client.chat.completions.create({
      model: GEMINI_MODEL,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [{
        role: 'user' as const,
        content: `Extract job posting details from these combined sources. Only extract what is explicitly present — do not infer or invent. Leave fields as empty string if not found.

${combinedContext}

Return ONLY valid JSON, no other text:
{
  "company": "",
  "title": "",
  "location": "",
  "type": "",
  "deadline": "",
  "posting_date": "",
  "salary_range": "",
  "description": ""
}

Rules:
- company: the hiring company name (not the job board)
- title: exact job title as written
- location: city/state or "Remote" — empty if not stated
- type: one of "fall-2026-internship" | "spring-2027-internship" | "summer-internship" | "full-time" | "" — infer from context
- deadline: YYYY-MM-DD application deadline — empty if not found
- posting_date: YYYY-MM-DD date the job was posted — empty if not found
- salary_range: compensation as written — empty if not found
- description: the FULL job description including all responsibilities, requirements, and qualifications — copy the actual text, do not summarize. Empty if insufficient info.`,
      }],
    });
    await logUsage(userId, 'job_import', GEMINI_MODEL, geminiUsage(response.usage));

    const rawText = response.choices[0]?.message?.content || '{}';
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const extracted = JSON.parse(jsonMatch[0]);
      const missing = Object.entries(extracted)
        .filter(([k, v]) => !v && k !== 'description')
        .map(([k]) => k);
      const warning = [
        ...warnings,
        missing.length > 0 ? `Not found: ${missing.join(', ')}. Fill in manually.` : '',
      ].filter(Boolean).join(' ');
      return NextResponse.json({ ...extracted, url: cleanUrl, source, warning });
    }

    return NextResponse.json({ ...blank, url: cleanUrl, source, warning: 'Could not parse content. Fill in manually.' });
  } catch (error) {
    console.error('POST /api/jobs/import error:', error);
    return NextResponse.json({ error: 'Import failed' }, { status: 500 });
  }
}
