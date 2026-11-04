// Public website content, taken from the NTS Company Blueprint Book (Edition 1, October 2026).
// Internal-only material (pricing hypotheses, revenue targets, finance, risks, legal) is intentionally NOT published.

export const FOUNDER = {
  name: 'Nikhil Kumar',
  role: 'Founder, NIKHILs TECH STUDIO',
  photo: '/img/founder.webp',
  linkedin: 'https://www.linkedin.com/in/nikhil-kumar-3782a9444',
  note: [
    'Every year, lakhs of young Indians finish college with a degree but without the skills interviews actually test. Many more are already working and can feel AI changing their jobs faster than anyone is teaching them.',
    'NIKHILs TECH STUDIO started as videos. It is becoming something bigger: a place where people don’t just watch. They learn, practise, simulate and grow. SQL first, then the AI tools every job now needs, then the support to actually get hired.',
    'If you are reading this as a learner, partner or early supporter, thank you. Numbers and plans will change the moment real learners teach us something better.',
  ],
  pullQuote: 'Let’s build India’s practice gym for the AI era, together.',
};

export const FOUNDATION = {
  vision: 'Every Indian learner job-ready for the AI era.',
  mission: 'Turn free content into practice, practice into proof, and proof into careers.',
  positioning: 'Not another course platform. A practice gym for SQL, data and AI tools, taught in Hindi-English.',
  bigIdea: 'An AI-era career skills company: content brings the audience, community keeps them, products create the value.',
  thesis:
    'Learn it from our videos, practise it in our tools, prove it in interviews. Millions of Indian freshers and early-career professionals need SQL, data and AI-tool skills to get hired or promoted. Courses are crowded. Practice, feedback and visible proof are not.',
  northStar: {
    name: 'Weekly Active Practisers',
    text: 'People who complete at least one practice session a week. Views are vanity; practice is value.',
  },
  voice: 'Skill sikho, practice karo, job pakdo.',
};

export const VALUES = [
  { title: 'Practice over theory', text: 'Every lesson ends with something to do.' },
  { title: 'Proof over promises', text: 'Scores, streaks and certificates people can show.' },
  { title: 'Simple and affordable', text: 'Indian pricing, Hindi-English, zero jargon.' },
  { title: 'Build in public', text: 'We share the journey as we build it.' },
];

export const WHY_US = [
  { title: 'Practice over lectures', text: 'Others teach. We make people do something every day.' },
  { title: 'Visible proof', text: 'Scores, streaks and certificates recruiters and colleges can see.' },
  { title: 'Language and price', text: 'Hindi-English teaching at Indian prices, unlike global platforms.' },
  { title: 'Content that connects', text: 'Our videos teach the exact challenges inside our products.' },
];

export const AUDIENCES = [
  { title: 'Students & freshers', who: 'B.Tech, BCA, B.Com and MBA students, 20 to 24, across Tier 1, 2 and 3 cities.', need: 'Practical skills that clear SQL and analyst interviews.' },
  { title: 'Career switchers', who: '1 to 5 years in sales, ops, support, BPO or finance.', need: 'A clear path into analyst roles.' },
  { title: 'Working professionals', who: '2 to 10 years of experience, aiming for promotion.', need: 'Excel, SQL and AI at work, without long courses.' },
  { title: 'Institutions', who: 'Colleges, institutes and corporate L&D teams.', need: 'Better placement rates and upskilling outcomes.' },
];

export const JOURNEY = ['Discover a 60-second Reel', 'Watch the full video', 'Join the community', 'Practise free', 'Go Pro', 'Get hired and share proof'];

export const TEAM = [
  { name: 'Nikhil', owns: 'Vision, product, teaching voice, finance' },
  { name: 'Monish', owns: 'Videos, brand look, product UI' },
  { name: 'Pranav', owns: 'Go-to-market, sales, operations, community' },
];

export const UNITS = [
  { title: 'NTS Media', text: 'YouTube, Reels, LinkedIn and a newsletter. Free lessons for everyone.' },
  { title: 'NTS Practice & AI Academy', text: 'SQL Sprint, Interview Simulator and AI tool tracks.' },
  { title: 'NTS Careers', text: 'AI Resume Writer, LinkedIn Optimizer and the Job Hunter site.' },
  { title: 'NTS for Business', text: 'College and company seats, workshops and custom AI agents.' },
];

export const SQL_SPRINT = {
  title: 'SQL Sprint',
  promise: 'Interview-ready SQL in 30 days, 20 minutes a day.',
  status: 'Free beta for the waitlist from December 2026',
  path: [
    { stage: 'Basics', days: 'Days 1–7', note: 'Free' },
    { stage: 'Aggregation', days: 'Days 8–14' },
    { stage: 'Joins', days: 'Days 15–21' },
    { stage: 'Advanced', days: 'Days 22–27' },
    { stage: 'Capstone', days: 'Days 28–30', note: 'Certificate' },
  ],
  features: [
    'In-browser SQL editor, nothing to install',
    'Three real datasets: e-commerce, sales team, HR',
    'Instant auto-check against the expected output',
    'Hints that link to the YouTube solution video',
    'Streaks, points and a weekly leaderboard',
    'Shareable certificate with a unique ID',
  ],
};

export const INTERVIEW_SIM = {
  title: 'Interview Simulator',
  promise: 'Practise the real interview before the real interview.',
  flow: ['Choose a role', 'Choose a round', 'Timed questions', 'Type or speak your answer', 'AI feedback and score', 'Fix gaps in SQL Sprint'],
  roles: ['Data Analyst', 'Business Analyst', 'MIS Executive', 'Operations Analyst'],
  rounds: ['SQL', 'Excel', 'Case / guesstimate', 'HR / behavioural', 'AI tools'],
  features: [
    { title: 'Question bank', text: '300 questions: 150 technical, 75 case, 75 HR.' },
    { title: 'Mock rounds', text: 'Timed, 20 to 30 minutes each.' },
    { title: 'AI feedback', text: 'Correctness, structure and communication, scored out of 10.' },
    { title: 'Fix-it links', text: 'Weak areas mapped back to SQL Sprint days.' },
  ],
};

export const AI_TRACKS = [
  { title: 'Claude Mastery', teach: 'Projects, long documents, writing, analysis, coding help, Claude Code basics.', task: 'Summarise a 50-page report, build a sales email sequence, analyse a CSV.', length: '10 days' },
  { title: 'ChatGPT for Work', teach: 'Prompting, custom GPTs, data analysis, images, voice.', task: 'Make a custom GPT for your team, clean data, outline a presentation.', length: '10 days' },
  { title: 'Gemini & Google Workspace', teach: 'Gemini in Gmail, Docs, Sheets and NotebookLM.', task: 'Draft emails, summarise meetings, build a research notebook.', length: '7 days' },
  { title: 'Grok & Perplexity', teach: 'Real-time research, news, fact-checking, citations.', task: 'A competitor research brief and a market news digest.', length: '5 days' },
  { title: 'Microsoft Copilot', teach: 'Copilot in Excel, Word, PowerPoint and Outlook.', task: 'Excel analysis and an auto-built deck from a document.', length: '7 days' },
  { title: 'AI for Your Role', teach: 'Role packs for sales, marketing, HR, ops, finance, analysts and teachers.', task: 'Ten ready workflows per role.', length: '7 days each' },
  { title: 'Build Your Own AI Agent', teach: 'No-code agents, automations and API basics.', task: 'A WhatsApp FAQ bot and a lead-capture agent.', length: '14 days' },
];

export const AI_EXTRAS = [
  { title: 'Prompt Library', text: '500+ tested prompts by role and tool, searchable and copy-ready.' },
  { title: 'AI Tool Directory', text: 'Honest reviews of 100+ AI tools with clear “use it for / skip it for” verdicts.' },
  { title: 'AI-Ready certificate', text: '“NTS AI-Ready Professional” after three tracks, a proof badge for LinkedIn.' },
];

export const CAREER_AI = [
  { title: 'AI Resume Writer', text: 'An ATS-friendly resume from a short chat, scored against the job description and tailored per job.' },
  { title: 'LinkedIn Optimizer', text: 'Rewrites headline, About and experience, with a keyword score for recruiter search and a 30-day posting plan.' },
  { title: 'Cover Letter & Outreach AI', text: 'Personalised cover letters, cold emails and referral requests in Hindi-English or formal English.' },
  { title: 'Career Readiness Score', text: 'SQL, interview and resume scores combined into one job-readiness percentage, tracked weekly.' },
];

export const JOB_HUNTER = {
  title: 'Job Hunter',
  promise: 'A personal job-search command centre: find, apply, track and prepare in one place.',
  steps: ['Build profile', 'AI resume + ATS score', 'Daily job matches', 'Tailor and apply', 'Track the pipeline', 'Mock interview, then offer'],
  features: [
    { title: 'Smart job feed', text: 'Daily matched analyst, data, ops and AI roles, filtered by skills and city.' },
    { title: 'Match score', text: 'How well your resume fits each job, and what to fix.' },
    { title: 'One-click tailoring', text: 'A tailored resume and cover letter for each application.' },
    { title: 'Application tracker', text: 'Saved, applied, interview, offer, with reminders.' },
    { title: 'Referral finder', text: 'Suggests people to message and drafts the request.' },
    { title: 'Interview prep', text: 'Opens the Interview Simulator for that company and role.' },
  ],
};

export const AGENTS_FOR_BUSINESS = [
  { title: 'Sales Lead Agent', who: 'B2B sellers, real estate, ed-tech', text: 'Qualifies leads from forms and ads, replies in minutes, books calls, updates the CRM.' },
  { title: 'Customer Support Agent', who: 'D2C brands, institutes, clinics', text: 'Answers FAQs around the clock on website and WhatsApp, hands over to a human when needed.' },
  { title: 'WhatsApp Order Agent', who: 'Restaurants, kirana, local stores', text: 'Takes orders, shares menus and price lists, confirms payment links.' },
  { title: 'HR Screening Agent', who: 'Startups, recruiters, colleges', text: 'Screens resumes against job needs, schedules interviews, sends updates.' },
  { title: 'Content & Social Agent', who: 'Creators, small brands', text: 'Turns one video into posts, captions, scripts and a weekly calendar.' },
  { title: 'MIS / Report Agent', who: 'Sales and ops teams', text: 'Pulls data from sheets, builds daily and weekly reports, alerts on misses.' },
  { title: 'Study Buddy Agent', who: 'Colleges, coaching institutes', text: 'Answers student doubts from course material and quizzes them.' },
  { title: 'Personal Productivity Agent', who: 'Professionals, founders', text: 'Inbox and calendar summaries, follow-up reminders, meeting notes.' },
];

export const AGENT_DELIVERY = ['Discover the need', 'Design the workflow', 'Build the agent', 'Test with real data', 'Deploy on WhatsApp or web', 'Monitor and improve'];

export const LAB_LATER = [
  { title: 'Communication Coach', text: 'Speaking drills, recorded answers and AI feedback on clarity.' },
  { title: 'Excel & Power BI Sprint', text: 'The same 30-day format for formulas, pivots and dashboards.' },
  { title: 'NTS for Colleges', text: 'Admin panel, batch progress and placement reports.' },
];

export const INSTITUTIONS = [
  { title: 'Colleges & placement cells', offer: 'A free workshop and a readiness report for your students.' },
  { title: 'Corporate teams', offer: 'Live SQL and AI-tools workshops, and team seats with progress tracking.' },
  { title: 'Student clubs & communities', offer: 'Co-hosted contests and challenges.' },
  { title: 'Creators', offer: 'Collaborations and an affiliate programme.' },
  { title: 'Hiring companies', offer: 'Pre-screened top scorers from our practice tracks.' },
  { title: 'AI & ed-tech tools', offer: 'Honest tutorials for our audience.' },
];

export const CONTENT_PILLARS = [
  { title: 'SQL', text: 'Zero to interview.' },
  { title: 'AI tools', text: 'Claude, Grok and ChatGPT for real jobs.' },
  { title: 'Careers', text: 'Interview prep and advice.' },
  { title: 'Behind NTS', text: 'Building in public.' },
];

export const WEEKLY_CONTENT = [
  { format: 'Long tutorials (8–15 min)', count: '3 a week', channel: 'YouTube' },
  { format: 'Shorts and Reels', count: '7 a week', channel: 'Instagram, YouTube Shorts' },
  { format: 'Daily SQL challenge', count: 'Every day', channel: 'Community, LinkedIn' },
  { format: 'Success story', count: 'Weekly', channel: 'LinkedIn, YouTube' },
  { format: 'Newsletter', count: 'Weekly', channel: 'Email' },
];

export const COMMUNITY = [
  'Daily challenge at 9 pm, solution the next morning.',
  'Weekly 30-minute live doubt session and a monthly SQL contest.',
  'Top members become NTS Champions.',
];
