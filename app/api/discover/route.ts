import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

interface JobResult {
  title: string;
  company: string;
  location: string;
  match_score: number;
  url?: string;
  description?: string;
  type?: string;
}

export async function POST(request: NextRequest) {
  try {
    const { role, location, type } = await request.json();

    const isInternship = type && ['fall-2026-internship', 'spring-2027-internship', 'summer-internship'].includes(type);
    const locationNote = isInternship && !location
      ? 'IMPORTANT: Candidate is still in school — internships must be Remote or Miami, FL only.'
      : '';

    const query = `Search the web for real current job postings: "${role}" ${location ? `in ${location}` : ''} ${type ? `(${type})` : ''}.
${locationNote}

Candidate profile: AI automation builder, CRE tech background, Python/n8n/Claude APIs, co-founder experience, junior level graduating May 2027 from University of Miami. No preference for company size — startups and large companies both welcome.

Find 5-8 real current openings. Look beyond the obvious companies — smaller companies, newer startups, and less-known firms that are a strong match are great. Return ONLY a JSON array:
[{"title": "exact role title", "company": "company name", "location": "city, state or Remote", "match_score": 1-10, "url": "careers URL if found", "description": "what the company does + why it fits", "type": "fall-2026-internship|spring-2027-internship|summer-internship|full-time"}]`;

    let results: JobResult[] = [];

    try {
      // Try with web search beta
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response: any = await (anthropic.beta.messages as any).create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        betas: ['web-search-2025-03-05'],
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{ role: 'user', content: query }],
      });

      // Extract text from response
      let fullText = '';
      if (response && response.content && Array.isArray(response.content)) {
        for (const block of response.content) {
          if (block && block.type === 'text') {
            fullText += block.text;
          }
        }
      }

      const jsonMatch = fullText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        results = JSON.parse(jsonMatch[0]);
      }
    } catch (webSearchError) {
      console.warn('Web search failed, falling back to knowledge-based search:', webSearchError);

      // Fallback without web search
      const fallbackResponse = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        messages: [{
          role: 'user',
          content: `Suggest 5 realistic job opportunities for: "${role}" ${location ? `in ${location}` : ''} ${type ? `(${type})` : ''}.

Candidate background: AI automation, CRE tech, Python, n8n, junior level (graduating May 2027), University of Miami.

Return as JSON array only:
[{"title": "...", "company": "...", "location": "...", "match_score": 1-10, "url": "", "description": "brief role description", "type": "fall-2026-internship|spring-2027-internship|summer-internship|full-time"}]`
        }],
      });

      const text = fallbackResponse.content[0].type === 'text' ? fallbackResponse.content[0].text : '[]';
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        results = JSON.parse(jsonMatch[0]);
      }
    }

    return NextResponse.json(results);
  } catch (error) {
    console.error('POST /api/discover error:', error);
    return NextResponse.json({ error: 'Failed to discover jobs' }, { status: 500 });
  }
}
