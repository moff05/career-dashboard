import { NextRequest, NextResponse } from 'next/server';
import mammoth from 'mammoth';
import { extractText } from 'unpdf';
import { getUserId, isSystemUser } from '@/lib/user';
import { logUsage } from '@/lib/usage';
import { getModel, geminiUsage, GEMINI_MODEL } from '@/lib/gemini';

const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;
type ImageType = typeof IMAGE_TYPES[number];

interface ParsedProfile {
  name?: string; email?: string; phone?: string; linkedin?: string;
  university?: string; degree?: string; graduation_date?: string;
  gpa?: string; honors?: string; minors?: string; target_roles?: string;
}

// Fast, non-AI text extraction (mammoth, unpdf) has no concept of document
// layout — unpdf in particular just joins every text fragment with a space,
// so a real resume often comes back as one giant run-on paragraph; mammoth
// and raw .txt can come back with column-order or spacing artifacts instead.
// Always worth a cheap cleanup pass when the text didn't already go
// through vision extraction (which preserves structure as part of the call).
async function restoreFormatting(text: string, userId: string): Promise<string> {
  try {
    const { client } = getModel();
    const res = await client.chat.completions.create({
      model: GEMINI_MODEL,
      messages: [{
        role: 'user' as const,
        content: `This resume text was machine-extracted and may have lost its line breaks or picked up spacing/ordering artifacts from the original layout. Restore clean line breaks between sections, jobs, and bullet points (use "-" for bullets). If the text already looks well-structured, return it unchanged. Do not change, summarize, paraphrase, reorder, or omit any wording — fix spacing and structure only.

${text}

Return ONLY the reformatted text, no commentary.`,
      }],
    });
    await logUsage(userId, 'resume_extract', GEMINI_MODEL, geminiUsage(res.usage));
    const out = (res.choices[0]?.message?.content || '').trim();
    return out || text;
  } catch {
    return text;
  }
}

// Best-effort — only extracts what's explicitly present, never invents values.
async function extractProfileFields(text: string, userId: string): Promise<ParsedProfile | null> {
  try {
    const { client } = getModel();
    const res = await client.chat.completions.create({
      model: GEMINI_MODEL,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [{
        role: 'user' as const,
        content: `Extract fields from the resume text below.

For name, email, phone, linkedin, university, degree, graduation_date, gpa, honors, minors: only extract what is explicitly present — leave as an empty string if not found. Do not invent or infer these.

For target_roles: this one is different — resumes don't usually state career goals, so infer 3-5 realistic entry-level/internship job titles this person could plausibly target, based on their major, experience, and skills. Comma-separated. Leave empty only if there's truly nothing to go on.

${text.slice(0, 8000)}

Return ONLY valid JSON, no other text:
{"name":"","email":"","phone":"","linkedin":"","university":"","degree":"","graduation_date":"","gpa":"","honors":"","minors":"","target_roles":""}`,
      }],
    });
    await logUsage(userId, 'resume_extract', GEMINI_MODEL, geminiUsage(res.usage));
    const raw = res.choices[0]?.message?.content || '{}';
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
    if (isSystemUser(userId)) return NextResponse.json({ error: 'Not available' }, { status: 403 });

    let text = '';
    // Vision extraction (PDF-scan fallback, photos) already gets an explicit
    // "preserve structure" instruction as part of the single extraction call.
    // The fast, non-AI paths (mammoth, unpdf, raw .txt) don't — that's the
    // text most likely to come back as a structurally messy wall of text,
    // so it's worth a cleanup pass to restore structure.
    let usedVision = false;

    if (fileType === 'text/plain' || name.endsWith('.txt')) {
      text = buffer.toString('utf-8').trim();
    } else if (fileType === DOCX_TYPE || name.endsWith('.docx')) {
      const { value } = await mammoth.extractRawText({ buffer });
      text = value.trim();
    } else if (fileType === 'application/msword' || name.endsWith('.doc')) {
      return NextResponse.json({ error: 'Legacy .doc files aren\'t supported — please re-save as .docx or PDF, or paste the text directly.' }, { status: 415 });
    } else if (fileType === 'application/pdf' || name.endsWith('.pdf')) {
      // Fast path: pull the text layer directly out of the PDF — instant, no API call.
      try {
        const { text: fastText } = await extractText(new Uint8Array(buffer), { mergePages: true });
        text = fastText.trim();
      } catch { /* fall through to the slower vision path below */ }

      // Little/no text means it's a scanned or image-only PDF — fall back to vision.
      if (text.length < 80) {
        const { client } = getModel();
        const res = await client.chat.completions.create({
          model: GEMINI_MODEL,
          messages: [{
            role: 'user' as const,
            content: [
              { type: 'image_url', image_url: { url: `data:application/pdf;base64,${fileBase64}` } },
              { type: 'text', text: 'Extract this resume as clean plain text. Preserve section structure (education, experience, skills, etc.) and bullet points using "-" prefixes. Return only the extracted text, no commentary.' },
            ],
          }],
        });
        await logUsage(userId, 'resume_extract', GEMINI_MODEL, geminiUsage(res.usage));
        text = (res.choices[0]?.message?.content || '').trim();
        usedVision = true;
      }
    } else if (IMAGE_TYPES.includes(fileType as ImageType) || /\.(jpe?g|png|gif|webp)$/.test(name)) {
      const mediaType = (IMAGE_TYPES.includes(fileType as ImageType) ? fileType : 'image/jpeg') as ImageType;
      const { client } = getModel();
      const res = await client.chat.completions.create({
        model: GEMINI_MODEL,
        messages: [{
          role: 'user' as const,
          content: [
            { type: 'image_url', image_url: { url: `data:${mediaType};base64,${fileBase64}` } },
            { type: 'text', text: 'Extract all text from this resume/CV photo or scan as clean plain text. Preserve section structure and bullet points using "-" prefixes. Return only the extracted text, no commentary.' },
          ],
        }],
      });
      await logUsage(userId, 'resume_extract', GEMINI_MODEL, geminiUsage(res.usage));
      text = (res.choices[0]?.message?.content || '').trim();
      usedVision = true;
    } else {
      return NextResponse.json({ error: 'Unsupported file type. Upload a PDF, .docx, .txt, or a photo of your resume.' }, { status: 415 });
    }

    if (!text) return NextResponse.json({ error: 'Could not find any text in that file.' }, { status: 422 });

    // Run concurrently — field extraction doesn't need the reformatted version.
    const [formattedText, profile] = await Promise.all([
      !usedVision ? restoreFormatting(text, userId) : Promise.resolve(text),
      extractProfileFields(text, userId),
    ]);
    return NextResponse.json({ text: formattedText, profile });
  } catch (error) {
    console.error('POST /api/profile/resume/extract error:', error);
    return NextResponse.json({ error: 'Could not read that file.' }, { status: 500 });
  }
}
