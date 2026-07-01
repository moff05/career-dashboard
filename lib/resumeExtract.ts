import { apiFetch } from './apiFetch';

const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

export interface ParsedProfile {
  name?: string; email?: string; phone?: string; linkedin?: string;
  university?: string; degree?: string; graduation_date?: string;
  gpa?: string; honors?: string; minors?: string; target_roles?: string;
}

export interface ResumeExtractResult {
  text: string;
  profile: ParsedProfile | null;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1] || '');
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Reads a resume/CV file and returns its text plus any profile fields Gemini
 * could pull out of it. Everything routes through the server.
 */
export async function extractResumeText(file: File): Promise<ResumeExtractResult> {
  const name = file.name.toLowerCase();

  const isTxt = file.type === 'text/plain' || name.endsWith('.txt');
  const isDocx = file.type === DOCX_TYPE || name.endsWith('.docx');
  const isPdf = file.type === 'application/pdf' || name.endsWith('.pdf');
  const isImage = IMAGE_TYPES.includes(file.type) || /\.(jpe?g|png|gif|webp)$/.test(name);
  if (!isTxt && !isDocx && !isPdf && !isImage) {
    throw new Error('Unsupported file type. Upload a PDF, .docx, .txt, or a photo of your resume.');
  }

  const fileBase64 = await fileToBase64(file);
  const fileType = isTxt ? 'text/plain' : isDocx ? DOCX_TYPE : isPdf ? 'application/pdf' : (file.type || 'image/jpeg');
  const body = JSON.stringify({ fileBase64, fileType, fileName: file.name });

  const res = await apiFetch('/api/profile/resume/extract', { method: 'POST', body });

  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || 'Could not read that file.');
  return { text: data.text as string, profile: (data.profile ?? null) as ParsedProfile | null };
}
