/**
 * Run once to create tables and seed initial data.
 * Local:      npx tsx scripts/migrate.ts
 * Production: npx tsx scripts/migrate.ts  (with TURSO_DATABASE_URL + TURSO_AUTH_TOKEN set)
 */
import { readFileSync } from 'fs';

// Load .env.local manually (tsx doesn't auto-load it)
try {
  const env = readFileSync('.env.local', 'utf-8');
  for (const line of env.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (key && !process.env[key]) process.env[key] = val;
  }
} catch { /* no .env.local, use existing env */ }

import { createClient } from '@libsql/client';

const db = createClient({
  url: process.env.TURSO_DATABASE_URL || 'file:./data/career.db',
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function migrate() {
  console.log('Running migration...');
  console.log('DB URL:', process.env.TURSO_DATABASE_URL || 'file:./data/career.db');

  // Create tables
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS profile (
      id INTEGER PRIMARY KEY,
      name TEXT, email TEXT, phone TEXT, linkedin TEXT,
      university TEXT, degree TEXT, graduation_date TEXT,
      gpa TEXT, honors TEXT, minors TEXT,
      target_roles TEXT, target_cities TEXT,
      notes TEXT, resume_text TEXT
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company TEXT NOT NULL, title TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT DEFAULT 'saved',
      match_score INTEGER,
      posting_date TEXT, deadline TEXT, url TEXT,
      description TEXT, salary_range TEXT, location TEXT,
      source TEXT, notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role TEXT NOT NULL, content TEXT NOT NULL,
      session_id TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      category TEXT NOT NULL,
      source TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS timeline_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL, description TEXT,
      date TEXT NOT NULL, type TEXT NOT NULL,
      done INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS resume (
      id INTEGER PRIMARY KEY,
      raw_text TEXT,
      parsed_at TEXT
    );
  `);
  console.log('Tables created.');

  // Seed profile (only if empty)
  const profileCheck = await db.execute('SELECT id FROM profile WHERE id = 1');
  if (profileCheck.rows.length === 0) {
    await db.execute({
      sql: `INSERT INTO profile (id, name, email, phone, linkedin, university, degree, graduation_date, gpa, honors, minors, target_roles, target_cities, notes)
            VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        'Nicholas Moffett',
        'nicmoffett5@gmail.com',
        '(470) 421-5955',
        'www.linkedin.com/in/nicholas-moffett',
        'University of Miami Herbert Business School, Coral Gables, FL',
        'Bachelor of Science in Business Administration in Business Technology',
        'Expected May 2027',
        '3.71 / 4.00',
        "President's Scholar; President's Honor Roll (1x); Provost's Honor Roll (3x); Dean's List (4x); National Hispanic Recognition Scholar",
        'Mathematics, Computer Science',
        'PropTech Analyst, AI Product Manager, Business Technology Analyst, Real Estate Technology Associate, Solutions Engineer, AI Automation Specialist, Technology Consulting Analyst',
        'San Francisco, New York City, Atlanta, Dallas-Fort Worth, Miami; International (open): Sydney, London, Dubai',
        'College junior graduating May 2027. Currently interning at Goldenrod Companies (CRE tech). Interested in the intersection of AI automation and real estate/finance.',
      ],
    });
    console.log('Profile seeded.');
  } else {
    console.log('Profile already exists, skipping.');
  }

  // Seed timeline (only if empty)
  const timelineCheck = await db.execute('SELECT COUNT(*) as count FROM timeline_events');
  const timelineCount = Number((timelineCheck.rows[0] as unknown as { count: number }).count);
  if (timelineCount === 0) {
    const events = [
      ['Fall 2026 Applications Open', 'Start applying for fall 2026 internships — most open Aug/Sep', '2026-08-01', 'milestone'],
      ['Fall 2026 Application Deadline', 'Most fall internship deadlines close around here', '2026-10-15', 'deadline'],
      ['Full-Time Recruiting Season Begins', 'New grad full-time roles start posting and interviewing', '2026-08-15', 'milestone'],
      ['Target: Offer In Hand', 'Goal: have at least one strong offer secured', '2026-11-01', 'goal'],
      ['Spring 2027 Applications Open', 'Spring internship cycle begins', '2026-11-15', 'milestone'],
      ['Spring 2027 Internship Deadline', 'Most spring 2027 internship deadlines', '2027-02-15', 'deadline'],
      ['Graduation', 'University of Miami — BS Business Technology', '2027-05-15', 'milestone'],
    ];
    for (const [title, description, date, type] of events) {
      await db.execute({
        sql: 'INSERT INTO timeline_events (title, description, date, type) VALUES (?, ?, ?, ?)',
        args: [title, description, date, type],
      });
    }
    console.log('Timeline seeded.');
  } else {
    console.log('Timeline already has data, skipping.');
  }

  // Seed resume text (only if empty)
  const resumeCheck = await db.execute('SELECT id FROM resume WHERE id = 1');
  if (resumeCheck.rows.length === 0) {
    const resumeText = `Nicholas Moffett
Phone: (470) 421-5955 | Email: nicmoffett5@gmail.com | LinkedIn: www.linkedin.com/in/nicholas-moffett

EDUCATION
University of Miami Herbert Business School, Coral Gables, FL
Bachelor of Science in Business Administration in Business Technology
Expected May 2027 | GPA: 3.71 / 4.00
Minors: Mathematics, Computer Science
Honors: President's Scholar; President's Honor Roll (1x); Provost's Honor Roll (3x); Dean's List (4x); National Hispanic Recognition Scholar

WORK & LEADERSHIP EXPERIENCE

Goldenrod Companies — Real Estate Technology & Investment Intern (January 2025–Present, Omaha, NE)
- Developed AI-powered workflows to automate multifamily and commercial rent roll analysis
- Built automation pipelines using n8n, OpenAI APIs, and Claude
- Engineered prompt systems to extract and structure submarket comps, property data, and lease information

N&S Digital LLC — Co-Founder (April 2025–Present, Coral Gables, FL)
- Built and launched multiple SaaS tools focused on AI automation and productivity
- Developed StackingPlanner.com — converts manual CRE stacking plans into automated visual layouts
- AI-powered education and productivity tools used by 100+ users

SK Commercial Realty — Intern (July–August 2025, Atlanta, GA)
- Built web app automating CRE stacking plans, replacing manual Excel workflows
- Created Excel financial model (cap rate, LTV, amortization, leasing commissions)

Eduply — Generative AI Prompt Engineer (May 2024–May 2025, Atlanta, GA)
- Designed AI tools using ChatBotKit and Zapier
- Chatbots adopted by Atlanta Public Schools, Georgia Tech, and other institutions

YMCA Camp High Harbour — Program Director, Watersports (Summer 2021–2025, Acworth, GA)
- Directed daily operations and safety for 200+ campers and 80+ staff

SKILLS
Technical: Claude, Excel, Python, Java, n8n, ChatBotKit, Zapier, PowerPoint
Certifications: Microsoft Office Specialist: Excel Associate (Office 2019); Intermediate Python (DataCamp); AWS Academy Graduate - Cloud Foundations
Activities: AI Business Association (Co-Founder & VP); Alpha Kappa Psi (Treasurer); REM Consulting (Strategist); Beta Theta Pi (Philanthropy Committee); UMiami Club Wrestling (VP & Treasurer)`;

    await db.execute({
      sql: "INSERT INTO resume (id, raw_text, parsed_at) VALUES (1, ?, datetime('now'))",
      args: [resumeText],
    });
    console.log('Resume seeded.');
  } else {
    console.log('Resume already exists, skipping.');
  }

  console.log('Migration complete.');
  process.exit(0);
}

migrate().catch(err => { console.error('Migration failed:', err); process.exit(1); });
