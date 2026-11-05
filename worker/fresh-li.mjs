// One-time reset of the LinkedIn board (Nov 2026). The first drafts were carousel scripts with
// "Hook:/Slide 1:" labels, and the next set did not follow the Company Blueprint. Both are removed
// and replaced by these drafts written to the NTS LinkedIn bible (worker/linkedin-bible.mjs).
// They still wait for owner approval. Nothing is posted automatically.
export const RESET_KEY = 'liReset3';
/** Unposted LinkedIn drafts created before this moment are the old format. */
export const RESET_BEFORE = '2026-11-05T17:00:00Z';
/** Marker of the drafts added by the previous reset, which are replaced too. */
export const OLD_RESET_BRAIN = 'reset';

export const FRESH_LINKEDIN = [
  {
    title: "Daily SQL challenge: GROUP BY + HAVING",
    body: `Aaj ka SQL challenge. 2 minute lagenge, try karo 👇

Table: orders
order_id | customer | city | amount
1 | Asha | Pune | 1200
2 | Ravi | Delhi | 800
3 | Asha | Pune | 600
4 | Meera | Pune | 1500
5 | Ravi | Delhi | 400

Question: har city ka total sales nikalo, sirf un cities ka jahan total 2,000 se zyada hai.

Hint: GROUP BY + HAVING. Analyst interviews mein ye pattern baar baar aata hai.

Apni query comments mein daalo. Solution kal subah share karunga.

#SQL #DataAnalytics #InterviewPrep #NIKHILsTECHSTUDIO`,
  },
  {
    title: "Claude as your mock interviewer",
    body: `Claude se interview plan banwana easy hai. Asli fayda tab hai jab wo tumhara interviewer ban jaaye.

Ye try karo, sirf 20 minute mein:

→ Job description paste karo aur pucho: "Is role ke liye 5 sabse zaroori skills kaun si hain?"
→ Phir bolo: "Mera SQL interview lo. Ek baar mein ek sawaal, mere jawab ka wait karo."
→ Har jawab ke baad pucho: "Kya missing tha? Strong answer kaisa hota?"
→ Jo galat hua, wahi kal phir practice karo.

Videos dekhne se skill nahi aati. Practice aur feedback se aati hai.

NTS mein hum isi idea pe kaam kar rahe hain: learn it from videos, practise it in tools, prove it in interviews.

Tumne AI ke saath mock interview try kiya hai? Comments mein batao kaisa raha.

#AI #Claude #InterviewPrep #CareerGrowth #NIKHILsTECHSTUDIO`,
  },
  {
    title: "Building NTS: a practice gym, not a course",
    body: `Hum 3 log ek simple idea pe kaam kar rahe hain: India ko ek aur course nahi, ek practice gym chahiye.

Freshers aur career switchers videos dekh lete hain, phir interview mein SQL query likhte waqt atak jaate hain. Gap knowledge ka nahi, practice ka hai.

Isliye NIKHILs TECH STUDIO pe:

→ 30 Nov tak 100 videos: SQL, Claude aur Grok, Hindi-English mein.
→ Har SQL video ek daily challenge banega.
→ SQL Sprint: 30 din, roz 20 minute, browser mein practice, streak aur certificate ke saath.

SQL Sprint ka free beta December mein waitlist walon ke liye khulega.

Early access chahiye? Comments mein "SPRINT" likho, waitlist link bhej dunga.

#BuildingInPublic #SQL #CareerGrowth #EdTech #NIKHILsTECHSTUDIO`,
  },
];
