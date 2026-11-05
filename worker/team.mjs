// NTS COMMAND agent roster. Only the agents NIKHILs TECH STUDIO actually needs today.
// The 31 + 6 roles in the plan were merged by real workload: a 3-person, content-led studio needs
// content, social, growth/analytics, lead replies, comment management and deployments. Strategy,
// planning and coordination are the NTS MASTER BRAIN's own job (it is the orchestrator, not an agent).
// Each agent lists the tools it may use; the Brain can only delegate a tool to an agent that owns it.

export const DEPARTMENTS = {
  content: 'Content & Social',
  growth: 'Growth & Intelligence',
  leads: 'Lead Operations',
  community: 'Community',
  engineering: 'Engineering',
};

export const AGENTS = [
  {
    id: 'ops_maya_docs',
    name: 'LinkedIn Content Writer',
    code: 'MAYA',
    dept: 'content',
    covers: ['LinkedIn Content Strategist', 'LinkedIn Writer', 'Content Repurposing'],
    job: 'Feed-ready LinkedIn posts in first person as the owner of the connected LinkedIn account, following the NTS LinkedIn bible from the company blueprint, written exactly as they will be posted (no Hook:/Slide:/CTA: labels, no markdown): one strong hook line, practical value, one CTA. Turns one idea into a week of posts and plans the LinkedIn calendar.',
    tools: ['nts_create_linkedin_post', 'nts_run_agent', 'nts_search_memory'],
    approval: ['publishing'],
  },
  {
    id: 'ops_lakshmi_growth',
    name: 'Social Media Manager',
    code: 'LAKSHMI',
    dept: 'content',
    covers: ['Campaign', 'Creative Director', 'Social Publishing'],
    job: 'Instagram Reels and YouTube Shorts scripts (hook, value, CTA), captions, hashtags, YouTube titles/descriptions/tags, X (Twitter) posts and short threads, content calendar and visual briefs (with image generation).',
    tools: ['nts_run_content_cycle', 'nts_generate_image', 'nts_run_agent', 'nts_search_memory'],
    approval: ['publishing'],
  },
  {
    id: 'ops_soma_analytics',
    name: 'Growth & Analytics',
    code: 'SOMA',
    dept: 'growth',
    covers: ['Growth Manager', 'SEO', 'Analytics', 'Research', 'Competitor Intelligence'],
    job: 'YouTube and channel analytics, what is working and what to post next, SEO keywords, growth experiments and market research. Uses only real numbers; says what to measure when data is missing.',
    tools: ['nts_get_social_analytics', 'nts_get_instagram_analytics', 'nts_run_agent', 'nts_search_memory'],
    approval: [],
  },
  {
    id: 'ops_lead_response',
    name: 'Lead Response',
    code: 'SETU',
    dept: 'leads',
    covers: ['Lead Generation', 'Lead Qualification', 'Lead Response', 'Follow-up', 'CRM Operations'],
    job: 'Finds people asking about SQL, data careers and AI tools (legitimate public sources), scores intent, keeps the CRM stages and drafts short, genuinely helpful replies. Never sends anything itself.',
    tools: ['nts_get_leads', 'nts_scan_leads', 'nts_draft_lead_reply', 'nts_update_lead', 'nts_run_agent'],
    approval: ['external_message'],
  },
  {
    id: 'ops_community',
    name: 'Community Manager',
    code: 'SAKHI',
    dept: 'community',
    covers: ['Social Listening', 'Engagement Intelligence', 'YouTube Community Manager', 'Instagram Community Manager', 'Auto Reply', 'Reputation Manager'],
    job: 'Reads YouTube (and Instagram when connected) comments, detects intent, language and sentiment, drafts warm Hindi/Hinglish/English replies and escalates complaints, legal, personal-data or harassment cases to the owner.',
    tools: ['nts_get_youtube_comments', 'nts_analyze_comments', 'nts_run_agent'],
    approval: ['external_message'],
  },
  {
    id: 'ops_devops',
    name: 'DevOps',
    code: 'VISHWA',
    dept: 'engineering',
    covers: ['DevOps & Deployment', 'QA & Testing'],
    job: 'Reads GitHub commits and workflow runs, runs the test workflow, checks the live site health and reports deployments. Production changes go live only through main and only with owner approval.',
    tools: ['nts_get_deployment_status', 'nts_run_tests', 'nts_check_site_health'],
    approval: ['production_deploy'],
  },
];

export const agentById = (id) => AGENTS.find((a) => a.id === id) || null;
