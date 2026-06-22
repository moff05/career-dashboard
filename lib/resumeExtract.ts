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
 * Reads a resume/CV file and returns its text plus any profile fields Claude
 * could pull out of it. .txt is decoded client-side; .pdf/.docx/images go
 * through the server. `apiKeyOverride` lets callers mid-setup pass the key
 * before it's saved to localStorage.
 */
export async function extractResumeText(file: File, apiKeyOverride?: string): Promise<ResumeExtractResult> {
  const name = file.name.toLowerCase();

  if (file.type === 'text/plain' || name.endsWith('.txt')) {
    return { text: (await file.text()).trim(), profile: null };
  }

  const isDocx = file.type === DOCX_TYPE || name.endsWith('.docx');
  const isPdf = file.type === 'application/pdf' || name.endsWith('.pdf');
  const isImage = IMAGE_TYPES.includes(file.type) || /\.(jpe?g|png|gif|webp)$/.test(name);
  if (!isDocx && !isPdf && !isImage) {
    throw new Error('Unsupported file type. Upload a PDF, .docx, .txt, or a photo of your resume.');
  }

  const fileBase64 = await fileToBase64(file);
  const fileType = isDocx ? DOCX_TYPE : isPdf ? 'application/pdf' : (file.type || 'image/jpeg');
  const body = JSON.stringify({ fileBase64, fileType, fileName: file.name });

  const res = apiKeyOverride
    ? await fetch('/api/profile/resume/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKeyOverride },
        body,
      })
    : await apiFetch('/api/profile/resume/extract', { method: 'POST', body });

  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || 'Could not read that file.');
  return { text: data.text as string, profile: (data.profile ?? null) as ParsedProfile | null };
}
