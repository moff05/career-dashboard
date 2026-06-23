import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import mammoth from 'mammoth';
import { extractText } from 'unpdf';
import { getUserId, getApiKey } from '@/lib/user';
import { logUsage } from '@/lib/usage';

const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;
type ImageType = typeof IMAGE_TYPES[number];

interface ParsedProfile {
  name?: string; email?: string; phone?: string; linkedin?: string;
  university?: string; degree?: string; graduation_date?: string;
  gpa?: string; honors?: string; minors?: string; target_roles?: string;
}

// unpdf's fast text extraction has no concept of line breaks — it just joins every
// text fragment with a space, so a real resume comes back as one giant run-on
// paragraph. Detect that and ask Haiku to restore line breaks/structure only —
// still a plain text completion, much cheaper than the document-vision path.
function looksFlattened(text: string): boolean {
  const lines = text.split('\n').filter(l => l.trim()).length;
  return text.length > 400 && lines <= 3;
}

async function restoreFormatting(anthropic: Anthropic, text: string, userId: string): Promise<string> {
  try {
    const res = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: Math.max(2000, Math.ceil(text.length / 2)),
      messages: [{
        role: 'user',
        content: `This resume text was extracted from a PDF and lost its line breaks — it's one run-on paragraph. Restore line breaks between sections, jobs, and bullet points (use "-" for bullets). Do not change, summarize, paraphrase, reorder, or omit any wording — fix spacing and structure only.

${text}

Return ONLY the reformatted text, no commentary.`,
      }],
    });
    await logUsage(userId, 'resume_extract', 'claude-haiku-4-5-20251001', res.usage);
    const out = res.content[0].type === 'text' ? res.content[0].text.trim() : '';
    return out || text;
  } catch {
    return text;
  }
}

// Best-effort — only extracts what's explicitly present, never invents values.
async function extractProfileFields(anthropic: Anthropic, text: string, userId: string): Promise<ParsedProfile | null> {
  try {
    const res = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages: [{
        role: 'user',
        content: `Extract fields from the resume text below.

For name, email, phone, linkedin, university, degree, graduation_date, gpa, honors, minors: only extract what is explicitly present — leave as an empty string if not found. Do not invent or infer these.

For target_roles: this one is different — resumes don't usually state career goals, so infer 3-5 realistic entry-level/internship job titles this person could plausibly target, based on their major, experience, and skills. Comma-separated. Leave empty only if there's truly nothing to go on.

${text.slice(0, 8000)}

Return ONLY valid JSON, no other text:
{"name":"","email":"","phone":"","linkedin":"","university":"","degree":"","graduation_date":"","gpa":"","honors":"","minors":"","target_roles":""}`,
      }],
    });
    await logUsage(userId, 'resume_extract', 'claude-haiku-4-5-20251001', res.usage);
    const raw = res.content[0].type === 'text' ? res.content[0].text : '{}';
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as ParsedProfile;
    const hasAny = Object.values(parsed).some(v => typeof v === 'string' && v.trim());
    return hasAny ? parsed : null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const { fileBase64, fileType, fileName } = await request.json() as {
      fileBase64: string; fileType: string; fileName?: string;
    };
    if (!fileBase64) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

    const name = (fileName || '').toLowerCase();
    const buffer = Buffer.from(fileBase64, 'base64');
    const userId = getUserId(request);
    const apiKey = getApiKey(request);
    const anthropic = apiKey ? new Anthropic({ apiKey }) : null;

    let text = '';

    if (fileType === DOCX_TYPE || name.endsWith('.docx')) {
      const { value } = await mammoth.extractRawText({ buffer });
      text = value.trim();
    } else if (fileType === 'application/msword' || name.endsWith('.doc')) {
      return NextResponse.json({ error: 'Legacy .doc files aren\'t supported — please re-save as .docx or PDF, or paste the text directly.' }, { status: 415 });
    } else if (fileType === 'application/pdf' || name.endsWith('.pdf')) {
      // Fast path: pull the text layer directly out of the PDF — instant, no API call.
      try {
        const { text: fastText } = await extractText(new Uint8Array(buffer), { mergePages: true });
        text = fastText.trim();
      } catch { /* fall through to the slower Claude path below */ }

      // Little/no text means it's a scanned or image-only PDF — fall back to Claude.
      if (text.length < 80) {
        if (!anthropic) return NextResponse.json({ error: 'API key required to read scanned PDFs' }, { status: 401 });
        const res = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 4000,
          messages: [{
            role: 'user',
            content: [
              { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: fileBase64 } },
              { type: 'text', text: 'Extract this resume as clean plain text. Preserve section structure (education, experience, skills, etc.) and bullet points using "-" prefixes. Return only the extracted text, no commentary.' },
            ],
          }],
        });
        await logUsage(userId, 'resume_extract', 'claude-haiku-4-5-20251001', res.usage);
        text = res.content[0].type === 'text' ? res.content[0].text.trim() : '';
      }
    } else if (IMAGE_TYPES.includes(fileType as ImageType) || /\.(jpe?g|png|gif|webp)$/.test(name)) {
      if (!anthropic) return NextResponse.json({ error: 'API key required to read a photo of your resume' }, { status: 401 });
      const mediaType = (IMAGE_TYPES.includes(fileType as ImageType) ? fileType : 'image/jpeg') as ImageType;
      const res = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: fileBase64 } },
            { type: 'text', text: 'Extract all text from this resume/CV photo or scan as clean plain text. Preserve section structure and bullet points using "-" prefixes. Return only the extracted text, no commentary.' },
          ],
        }],
      });
      await logUsage(userId, 'resume_extract', 'claude-haiku-4-5-20251001', res.usage);
      text = res.content[0].type === 'text' ? res.content[0].text.trim() : '';
    } else {
      return NextResponse.json({ error: 'Unsupported file type. Upload a PDF, .docx, .txt, or a photo of your resume.' }, { status: 415 });
    }

    if (!text) return NextResponse.json({ error: 'Could not find any text in that file.' }, { status: 422 });

    // Run concurrently — field extraction doesn't need the reformatted version.
    const [formattedText, profile] = await Promise.all([
      anthropic && looksFlattened(text) ? restoreFormatting(anthropic, text, userId) : Promise.resolve(text),
      anthropic ? extractProfileFields(anthropic, text, userId) : Promise.resolve(null),
    ]);
    return NextResponse.json({ text: formattedText, profile });
  } catch (error) {
    console.error('POST /api/profile/resume/extract error:', error);
    return NextResponse.json({ error: 'Could not read that file.' }, { status: 500 });
  }
}
