import { getDb } from './db';

const FALLBACK_RESUME = `Nicholas Moffett
Phone: (470) 421-5955 | Email: nicmoffett5@gmail.com | LinkedIn: www.linkedin.com/in/nicholas-moffett

EDUCATION
University of Miami Herbert Business School, Coral Gables, FL
Bachelor of Science in Business Administration in Business Technology
Expected May 2027 | GPA: 3.71 / 4.00
Minors: Mathematics, Computer Science
Honors: President's Scholar; President's Honor Roll (1x); Provost's Honor Roll (3x); Dean's List (4x); National Hispanic Recognition Scholar

EXPERIENCE

Goldenrod Companies — Real Estate Technology & Investment Intern (Jan 2025–Present, Omaha, NE)
- Developed AI-powered workflows to automate multifamily and commercial rent roll analysis
- Built automation pipelines using n8n, OpenAI APIs, and Claude
- Engineered prompt systems to extract submarket comps, property data, lease information

N&S Digital LLC — Co-Founder (April 2025–Present, Coral Gables, FL)
- Built and launched multiple SaaS tools focused on AI automation and productivity
- Developed StackingPlanner.com — converts manual CRE stacking plans into automated visual layouts
- AI-powered tools used by 100+ users

SK Commercial Realty — Intern (July–August 2025, Atlanta, GA)
- Built web app automating CRE stacking plans, replacing manual Excel workflows
- Created Excel financial model (cap rate, LTV, amortization, leasing commissions)

Eduply — Generative AI Prompt Engineer (May 2024–May 2025, Atlanta, GA)
- Designed AI tools using ChatBotKit and Zapier
- Chatbots adopted by Atlanta Public Schools, Georgia Tech, and other institutions

YMCA Camp High Harbour — Program Director, Watersports (Summer 2021–2025, Acworth, GA)
- Directed daily operations and safety for 200+ campers and 80+ staff

SKILLS
Claude, Excel, Python, Java, n8n, ChatBotKit, Zapier, PowerPoint
Certifications: Microsoft Office Specialist Excel; Intermediate Python (DataCamp); AWS Cloud Foundations
Activities: AI Business Association (Co-Founder & VP); Alpha Kappa Psi (Treasurer); REM Consulting (Strategist)`;

export async function getResumeText(): Promise<string> {
  const db = getDb();

  const existing = (await db.execute('SELECT raw_text FROM resume WHERE id = 1')).rows[0] as unknown as { raw_text: string } | undefined;
  if (existing?.raw_text) return existing.raw_text;

  // Seed fallback and return it
  await db.execute({
    sql: "INSERT OR REPLACE INTO resume (id, raw_text, parsed_at) VALUES (1, ?, datetime('now'))",
    args: [FALLBACK_RESUME],
  });
  return FALLBACK_RESUME;
}
