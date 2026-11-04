// Site configuration. Edit here; no secrets belong in this file (it ships to the browser).
export const SITE = {
  name: 'NIKHILs TECH STUDIO',
  positioning: "India's Practice Gym for the AI Era",
  tagline: 'Learn. Practice. Simulate. Grow.',
  mission: 'Turn free content into practice, practice into proof, and proof into careers.',
  /**
   * Optional fixed YouTube video ID for "Watch Intro" (the part after v= in a YouTube link).
   * Leave empty to play the channel's latest upload (fetched by the Worker with YOUTUBE_API_KEY).
   * If neither is available, the button opens the YouTube channel.
   */
  introVideoId: '',
  social: {
    youtube: 'https://www.youtube.com/@NikhilsTechStudio',
    instagram: 'https://www.instagram.com/nikhil_techstudio/',
    linkedin: 'https://www.linkedin.com/in/nikhil-kumar-3782a9444',
  },
};

export const NAV = [
  { label: 'Home', href: '/' },
  { label: 'About', href: '/about' },
  { label: 'AI Lab', href: '/lab' },
  { label: 'Academy', href: '/academy' },
  { label: 'Insights', href: '/insights' },
  { label: 'Media Hub', href: '/media' },
];
