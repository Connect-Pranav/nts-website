// One-time reset of the LinkedIn board (Nov 2026): the first drafts were carousel scripts with
// "Hook:/Slide 1:" labels. They are removed and replaced by these feed-ready drafts, which still
// wait for owner approval. Nothing is posted automatically.
export const RESET_KEY = 'liReset2';
/** Unposted LinkedIn drafts created before this moment are the old format. */
export const RESET_BEFORE = '2026-11-05T17:00:00Z';

export const FRESH_LINKEDIN = [
  {
    title: 'Claude interview prep plan',
    body: `I stopped Googling "how to prepare for a SQL interview". One prompt to Claude gave me a better plan.

Here is the exact workflow:

→ Paste the job description and ask: "Which skills will this interview test?"
→ Ask for a 5-day plan that covers only those skills: joins, indexing, query tuning.
→ Each day, ask for 3 practice questions and check your answers against its explanation.
→ On day 5, ask it to run a mock interview and grade you honestly.

The plan is not the magic. The daily practice is.

A vague goal ("get better at SQL") becomes a clear list of what to do today.

What would you ask Claude first before an interview?

#AI #Claude #InterviewPrep #SQL #CareerGrowth`,
  },
  {
    title: 'Mock SQL interview with AI',
    body: `Most people practise SQL by reading answers. Interviews test whether you can explain your answer out loud.

So try this with any AI assistant:

→ Tell it: "You are my interviewer. Ask me one SQL question at a time and wait for my answer."
→ Answer in your own words, as you would in the room.
→ Ask it to point out what was missing and what a strong answer would add.
→ Repeat with harder questions on joins, window functions and indexing.

20 minutes a day of this beats 2 hours of scrolling through solutions.

Have you tried a mock interview with AI yet? How did it go?

#SQL #AI #InterviewPrep #DataAnalytics #Careers`,
  },
  {
    title: 'Job description to prep checklist',
    body: `Every job description is a cheat sheet. Most candidates skim it once and close the tab.

Use it properly:

→ Copy the job description into Claude or ChatGPT.
→ Ask: "List the 5 skills this role will test, from most to least important."
→ For each skill, ask for one question you are likely to face and one project you could show.
→ Turn that into a one-page checklist and tick it off before the interview.

You walk in prepared for this role, not for interviews in general.

Which part of interview prep takes you the longest?

#JobSearch #AI #InterviewTips #CareerGrowth #Productivity`,
  },
];
