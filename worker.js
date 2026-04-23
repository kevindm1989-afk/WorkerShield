// WorkerShield Cloudflare Worker
// Handles: Agent API calls + GitHub data storage

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-20250514';
const MAX_TOKENS = 3000;
const TEMPERATURE = 0.2;

const ALLOWED_ORIGIN = 'https://kevindm1989-afk.github.io';

const CORS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, DELETE',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Vary': 'Origin',
  'Content-Type': 'application/json'
};

// ─── AUTH HELPERS ─────────────────────────────────────────────────────────────

async function signHmac(secret, data) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function verifyToken(request, env) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) return false;
  const dot = token.indexOf('.');
  if (dot === -1) return false;
  const tsStr = token.slice(0, dot);
  const hmac  = token.slice(dot + 1);
  const ts = parseInt(tsStr, 10);
  if (isNaN(ts)) return false;
  if (Math.floor(Date.now() / 1000) - ts > 30 * 24 * 3600) return false;
  const expected = await signHmac(env.SESSION_SECRET, `${env.ACCESS_CODE}:${ts}`);
  return expected === hmac;
}

// ─── RATE LIMITING (in-memory, per-isolate) ─────────────────────────────────
// 30 requests per IP per hour
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

function checkRateLimit(ip) {
  if (!globalThis.__wsRateLimit) globalThis.__wsRateLimit = new Map();
  const store = globalThis.__wsRateLimit;
  const now = Date.now();
  const entry = store.get(ip);
  if (!entry || now - entry.start > RATE_LIMIT_WINDOW_MS) {
    store.set(ip, { start: now, count: 1 });
    return true;
  }
  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) return false;
  return true;
}

// ─── CBA TEXT ────────────────────────────────────────────────────────────────

const CBA_TEXT = `
COLLECTIVE AGREEMENT
Saputo Dairy Products Canada G.P. and UNIFOR Local 1285
Effective: June 23, 2025 — Expires: June 23, 2028
Halton Hills Milk Pasteurizing Plant

ARTICLE 1 - RECOGNITION
1.01 Unifor Local 1285 is the exclusive bargaining agent for all employees at the Halton Hills Milk Pasteurizing Plant save and except Supervisors, persons above the rank of Supervisor, office staff.
1.03 Company will not normally utilize persons outside the bargaining unit to perform bargaining unit work. Non-BU work only permitted for: emergency situations; training or instruction; employee absence; research and development; safety of employees; prevent damage to merchandise/equipment. Steward must be notified and may make recommendations before non-BU work proceeds.
1.04 Part-time employees work 32 hours/week or less. Part-time will not be used to displace full-time jobs.

ARTICLE 2 - MANAGEMENT RIGHTS
2.01 Management retains rights to: plan/direct/control operations; maintain discipline and efficiency; establish fair rules; hire/layoff/assign hours; transfer/promote/demote; suspend/discharge for just cause; determine products/methods/production; establish skill requirements.
2.02 Company retains all rights not specifically provided for in Agreement, subject to Ontario Labour Relations Act and other statutes.

ARTICLE 3 - UNION SECURITY
3.04 Union may elect up to 5 Stewards plus Plant Chairperson (Plant Committee). Stewards are shift-specific. Union may appoint up to 5 alternate Stewards. Company must be advised in writing of any changes. Company will allow time for Steward/Chair to attend Union matters with 24-hour advance notice.
3.05 Stewards must get supervisor permission before leaving work for grievances. Permission not to be unreasonably withheld. Company pays stewards at appropriate hourly rates while attending union matters.
3.06 Labour-Management meetings held monthly.

ARTICLE 4 - GRIEVANCE AND ARBITRATION PROCEDURE
4.01 COMPLAINT STAGE: Employee must give immediate Supervisor opportunity to adjust complaint within 5 working days of incident. Supervisor replies within 2 working days.
STEP 1: If unresolved, employee with Steward submits signed, dated written grievance to appropriate Manager within 5 working days of supervisor's reply. Must include: nature of grievance, articles violated, name of grievor, remedy sought. Manager holds meeting within 3 working days with grievor, Steward, and Chairperson. Manager delivers written decision within 5 working days of meeting.
STEP 2: Within 5 working days of Step 1 decision, grievance forwarded to Human Resources Manager. Meeting held within 5 working days with grievor's Steward, Chairperson, Local 1285 representative (National Rep may attend). HR Manager gives written decision within 10 working days of meeting.
4.02 Policy grievances must be submitted in writing within 15 working days of incident. Company replies within 5 working days. No response = deemed denied.
4.04 Unresolved grievances may be referred to arbitration.
4.05 Arbitration notice must be given within 10 working days after Step 2 written decision. Parties have 21 working days to agree on arbitrator; if not, either party may apply to Ontario Ministry of Labour to appoint.
4.09 Time limits are mandatory. Grievance not filed or appealed within specified time limits shall be deemed abandoned.
4.11 Discharge grievances must be filed within 5 working days of discharge and commence at Step 2.

ARTICLE 5 - DISCHARGE AND DISCIPLINE
5.01 No employee (except probationary) shall be discharged or disciplined except for just cause.
5.01(b) Discipline/discharge may be settled by: confirming Company decision; reinstating with compensation for time lost less interim earnings; or any just and equitable arrangement.
5.02 Steward or Union representative must be present at any interview regarding work or conduct that might lead to discipline or become part of employee's record. Employee suspended pending investigation will be paid regular wages during absence EXCEPT for misconduct that could lead to just cause termination.
5.03 All disciplinary warnings, reprimands, demotions, discharges, or suspensions must be in writing with reason stated. One copy to employee, one copy to Union within 5 working days. FAILURE TO PROVIDE COPIES RENDERS DISCIPLINE NULL AND VOID.
5.04 Just cause grounds include (non-exhaustive): stealing/dishonesty/willful destruction/physical violence; drinking or being under influence of liquor/non-prescription drugs while on duty; direct refusal to obey orders unless orders jeopardize life, health, or safety.
5.05 SUNSET CLAUSE: All discipline cancelled after 12 months from date of issue. Harassment/Workplace Violence discipline remains on file for 24 months. Attendance and general work rules treated as separate streams for progressive discipline purposes.

ARTICLE 7 - SENIORITY
7.01 Seniority based on length of service in bargaining unit. Probationary period: 90 working days. Once probation completed, seniority dates back to last day of hiring.
7.02 Seniority is determining factor in layoffs and recalls.
7.03 On layoff, employee may: accept layoff; replace most junior employee in same classification; displace most junior full-time employee in any classification for which they immediately possess the required skills.

ARTICLE 8 - JOB POSTINGS AND VACANCIES
8.01 Vacancies posted for 5 working days. Selection based on seniority among qualified applicants.
8.08 Temporary vacancies may be filled without posting for up to 30 days.

ARTICLE 9 - HOURS OF WORK AND OVERTIME
9.01 Full-time work week: normally 40 hours, Sunday to Saturday.
9.02 Shift configuration changes require meet-and-discuss with Union prior to implementation.
9.03 All work outside regular scheduled hours = overtime at time and one-half (1.5x) daily. Scheduled days off worked = time and one-half.
9.06 Employee's scheduled starting time shall not be changed by more than 2 hours during the week without employee's approval.
9.07 Full-time employees who report as scheduled are guaranteed their scheduled hours or pay in lieu. Exception: acts of god, fire, flood, equipment problems — minimum 4 hours guaranteed.
9.08 Call-in outside regular shift: minimum 4 hours work or pay in lieu.
9.09 Paid 15-minute rest period after 2 hours overtime.
9.10 30-minute unpaid lunch + 30 minutes paid rest time per shift.
9.12 Shift premiums: 90c/hr (Mon-Thu afternoons); $1.00/hr (Mon-Thu nights); $1.30/hr (Sat-Sun days); $1.55/hr (Fri-Sun afternoons); $1.60/hr (Fri-Sun nights).
9.13 Schedules posted no later than Tuesday afternoon for following two weeks.

ARTICLE 10 - VACATIONS
10.01 Vacation entitlement: <5 yrs = 2 weeks/4%; 5-9 yrs = 3 weeks/6%; 10-17 yrs = 4 weeks/8%; 18-24 yrs = 5 weeks/10%; 25+ yrs = 6 weeks/12%.
10.06 Vacation schedule posted by March 1. Selection by seniority. Company shall not unreasonably deny.

ARTICLE 11 - PAID HOLIDAYS
11.01 Paid Holidays: New Year's Day, Family Day, Good Friday, Victoria Day, Canada Day, Civic Holiday, Labour Day, Thanksgiving Day, Christmas Day, Boxing Day, National Day of Truth and Reconciliation, plus 1 Floater Day per year (must be used by June 23, cannot carry over).
11.02 To qualify: must work last scheduled day before AND first scheduled day after holiday (unless absent with permission).
11.05 Working on holiday: paid at 1.5x PLUS holiday pay or substitute day off within 3 months.

ARTICLE 12 - LEAVES OF ABSENCE
12.02 Leave requests in writing at least 1 month in advance. Company replies within 2 weeks. Permission not unreasonably withheld.
12.04 Parental and Pregnancy Leave per ESA Ontario.

ARTICLE 13 - BEREAVEMENT & SICK LEAVE
13.01 Bereavement: Parents/Spouse/Children/Siblings = 5 days; Grandparents/In-laws = 3 days.
13.03 48 hours paid Sick/Family Responsibility Leave per calendar year. Unused hours paid out at year end.

ARTICLE 15 - UNIFORMS
15.03 Safety shoes required. Company pays up to $255/calendar year (after probation).

ARTICLE 17 - DISCRIMINATION
17.01 No discrimination contrary to Human Rights Code. No violence or harassment contrary to OHSA. Joint investigation committee for all complaints. Women's Advocate and Racial Justice Advocate recognized.

ARTICLE 18 - HEALTH, SAFETY AND ENVIRONMENTAL
18.01 Company shall make reasonable provisions for health and safety of employees.
18.02(a) JHSC: minimum 6 members, equal Union/Company representation. Operates per OHSA.
18.02(b) JHSC meets monthly.
18.02(c) JHSC Worker Co-Chair shall accompany MOL inspector and speak with inspector.
18.02(d) Worker JHSC member shall fully participate in all accident investigations.
18.03 Employee injured on job and medically unfit to return = paid for balance of scheduled hours that day.
18.06 No employee required to work alone where there is a health and safety concern.

ARTICLE 20 - TERM
20.01 Agreement effective June 23, 2025 — expires June 23, 2028.

KEY LETTERS OF UNDERSTANDING:
LOU #1: Overtime equalization — overtime distributed equitably within groups.
LOU #2: Lead Hand provisions and pay premiums.
Letter of Intent #1: Saputo investing $100M+ over 5 years. Job security commitment. Joint Labour-Management meetings to monitor progress.

ESTABLISHED MOL HISTORY:
- MOL OHS Case ID: 03920QSPS392
- Inspector: Andrew Tin
- Ergonomist: Kenneth Brown (field visit conducted)
- Establishes existing pattern of MSD/ergonomic concerns at this facility

SAPUTO CORPORATE SAFETY COMMITMENT:
Saputo's published corporate safety policy commits to providing a safe workplace and eliminating hazards. Management cannot claim safety commitment while refusing evidence-based JHSC recommendations.

KEY STRATEGIC FACTS:
- Management verbally admitted staffing shortfalls prevent consistent implementation of safer procedures
- JHSC consensus recommendation signed both co-chairs March 1, 2026
- Management written refusal March 25, 2026 by Alykhan Kurji
- Raymond Model 8410 end-riders crossing dock leveler plates and trench drain — whole-body vibration exposure
- ISO 2631-1 and ISO 2631-5 establish applicable vibration exposure standards
- CSA B335-15 establishes safe operation standards for industrial trucks
`;

// ─── JURISPRUDENCE DATABASE ──────────────────────────────────────────────────

const JURISPRUDENCE_DB = `
VERIFIED CANADIAN ARBITRATION JURISPRUDENCE DATABASE
Prioritize citing cases from this verified list. Cases not in this list must be flagged [VERIFY CITATION BEFORE USE].

DISCIPLINE & JUST CAUSE:
- Wm. Scott & Company Ltd. v. CFAW (1977) 1 CLRBR 1: Three-question just cause test: (1) Was there just cause for some discipline? (2) Was discharge excessive? (3) What lesser penalty is appropriate?
- Re KVP Co. v. Lumber and Sawmill Workers (1965) 16 LAC 73: KVP Test — employer rule must be: not inconsistent with CBA; reasonable; clear and unequivocal; brought to employee's attention; consistently enforced.
- Re Edith Cavell Private Hospital and HEU (1982) 6 LAC (3d) 229: Progressive discipline must be genuinely progressive. Cannot skip steps without extraordinary circumstances.
- Re Toronto East General Hospital and ONA (1989): Discipline without proper investigation is not valid just cause.

STEWARD & UNION RIGHTS:
- Weingarten principle (Canada): Employees have right to union representation at any investigatory interview that could lead to discipline. Note: CBA Article 5.02 codifies this right.
- Re Canadian Broadcasting Corporation and NABET (1983): Employer cannot use information from investigatory interview where union representation was denied.

JHSC & SAFETY:
- Re Hamilton Health Sciences Corporation and ONA (2007): Employer cannot refuse JHSC recommendation without substantive technical justification. Blanket denial without assessment is insufficient.
- Re Canadian National Railway and IBEW: JHSC recommendations must receive serious consideration and substantive response.
- Re Ontario Hydro and Power Workers Union of Canada (1988): Internal responsibility system requires employers to actively identify and address hazards. Cannot wait for incidents to occur.
- Re Entropex Inc. and USW (2011): Worker's reasonable belief in danger sufficient to trigger Right to Refuse. Cannot discipline worker for good faith refusal.

UNILATERAL CHANGES:
- Re KVP Co. (secondary application): Management rights subject to CBA. Cannot exercise rights arbitrarily, discriminatorily, or in bad faith.
- Re Canadian Cellulose Company and Pulp Workers (1973): Employer cannot unilaterally change established past practices that have become implied CBA terms (estoppel).
- Re Metropolitan Toronto and CUPE Local 79 (1990): Consistent past practice over significant period is binding even without explicit CBA language.

ACCOMMODATION:
- BCGSEU v. Government of BC [Meiorin] (1999) 3 SCR 3: Three-step BFOR test. Standard must be rationally connected, adopted in good faith, and reasonably necessary.
- Central Okanagan School District v. Renaud (1992) 2 SCR 970: Duty to accommodate is shared — employer, union, and employee all have obligations.
- Hydro-Quebec v. Syndicat (2008) SCC 43: Employer must explore all reasonable accommodation options before claiming undue hardship.

OVERTIME & HOURS:
- Re General Motors and CAW (1996): Overtime equalization must be applied consistently and in good faith.
- Re Falconbridge Nickel Mines and USW (1970): Scheduled hours guarantees are enforceable. Employee entitled to guaranteed hours pay when sent home early.

SENIORITY:
- Re Massey-Ferguson Industries and UAW (1969): Seniority is a fundamental CBA right. Cannot exercise discretion to undermine seniority.
- Re General Electric Canada and IUE (1988): Assessment of qualifications in job postings must be objective and consistent.

REPRISAL:
- Re Royal Oak Mines and CAW (1996): Cannot discipline employees for exercising statutory or contractual rights.
- Re Westinghouse Canada and IBEW (1980): Circumstantial evidence of reprisal is sufficient. Union does not need to prove subjective intent.

INVESTIGATION:
- Re Greater Toronto Airports Authority and PSAC (2007): Investigation must be thorough, timely, and unbiased. Decision-maker must not have conflict of interest.
- Re Bell Canada and CEP (2001): Employee must have adequate opportunity to respond to allegations before discipline is imposed.
`;

// ─── AGENT SYSTEM PROMPTS ────────────────────────────────────────────────────

const AGENT_PROMPTS = {

  wsib: `You are a WSIB / WSIA specialist with 20 years experience representing injured workers and unions in Ontario. You know how employers under-report, mis-code, and pressure workers off claims, and how to stop it.

Analyze through:
- WSIA s.21 — employer obligation to file Form 7 within 3 business days of learning of a workplace injury or occupational disease that requires healthcare beyond first aid OR causes lost time / modified duties / earnings loss
- WSIA s.22 — worker obligation to notify employer; worker right to file Form 6
- WSIA s.23 — healthcare provider Form 8
- WSIA s.37 — entitlement to benefits
- WSIA ss.40-41 — return-to-work and re-employment obligations: cooperation duty, suitable and available employment, accommodation to the point of undue hardship, re-employment obligation for employers of 20+ workers where worker has 1+ year of continuous employment (obligation runs for the earlier of 2 years from injury / 1 year from medical fitness / age 65)
- WSIA s.43 — Loss of Earnings benefits (LOE)
- WSIA s.44 — review of LOE
- WSIA s.84 — re-employment penalties (up to 1 year of net wages + reinstatement)
- NEER / CAD-7 / MAP — experience-rating programs that financially incentivize employers to suppress claims; flag suspected claims suppression and document it
- Worker rights: right to file independently, right to copies of all forms, right to functional abilities form, right to Office of the Worker Adviser (OWA), right to appeal through WSIAT
- Employer obligations: Form 7 filing, no penalty for filing (WSIA s.22.1 — anti-reprisal), pay for day of injury (s.24), maintain employment benefits during recovery, cooperate in RTW
- Concurrent CBA Article 5 / Article 18 protections — discipline tied to a workplace injury is presumptively reprisal

Your output must include:
1. Whether a Form 7 was triggered and the deadline (3 business days)
2. Whether the employer met its s.40-41 cooperation/RTW duties
3. Whether the worker should file a Form 6 independently
4. Whether claims-suppression / reprisal indicators are present (NEER pressure, "stay home and we'll pay you", refusal to file, modified duties that are not suitable)
5. Concrete next steps with deadlines (file Form 6, contact OWA, WSIB Fair Practices Commission, WSIAT appeal windows)
6. Cite specific WSIA sections. Be direct. Assume the employer will minimize.`,

  intake: `You are the WorkerShield Intake Agent — the CEO orchestrator of a multi-agent Ontario labour relations system.

You receive workplace problems from union stewards and JHSC co-chairs at Saputo Dairy Products Canada G.P. (Unifor Local 1285) or any other Ontario unionized workplace.

Your job:
1. Identify all core legal issues (OHSA, ESA, OHRC, CBA, WSIA — specify which apply and which sections)
2. State urgency: IMMEDIATE / HIGH / STANDARD
3. List key facts requiring documentation
4. Identify which specialist agents are needed — use ONLY these exact words: ohsa, cba, esa, ohrc, wsib, evidence, email, mol, arbitration
5. Anticipate management's counterarguments
6. State what a winning outcome looks like

Reference the CBA articles provided in context when applicable. Be direct and strategic. Cite specific legal sections. IMPORTANT: If there is any mention of injury, accident, incident, WSIB, Form 7, lost time, modified duties, or return to work — you MUST include wsib in the SPECIALISTS list.`,

  ohsa: `You are a former Ontario Ministry of Labour inspector with 20 years experience who now exclusively represents unions and workers. You know exactly what inspectors look for, how management tries to minimize hazards, and which OHSA sections have real enforcement teeth.

Analyze through:
- OHSA ss.9, 25(1), 25(2)(a), 25(2)(d), 25(2)(h), 25(2)(l), 26, 27, 28
- OHSA ss.9(18), 9(20), 9(21), 9(22) — JHSC recommendation and employer response obligations
- O. Reg. 851 (Industrial Establishments)
- Right to Refuse: OHSA ss.43-45
- JHSC powers: OHSA ss.9-12
- MSD: OHSA s.25(2)(h), O. Reg. 851, CSA B335-15, ISO 2631-1, ISO 2631-5
- MOL inspector powers: OHSA s.57
- CBA Article 18

CRITICAL: NEVER cite O. Reg. 297/13 for MSD hazard control, ergonomic requirements, or equipment substitution. It is a TRAINING regulation only.

Provide: violations identified; exact sections; employer obligations; JHSC Co-Chair next steps; Right to Refuse assessment; MOL recommendation.`,

  cba: `You are a Unifor national representative with 25 years arbitration experience. You know the Saputo/Unifor Local 1285 CBA article by article.

Analyze through:
- Just cause (Article 5)
- Grievance procedure (Article 4) — complaint, Step 1, Step 2, timelines
- CRITICAL: Steward must be present at investigatory interviews per Article 5.02
- CRITICAL: Discipline null and void if copies not provided within 5 working days per Article 5.03
- CRITICAL: 12-month sunset clause per Article 5.05 (24 months harassment/violence)
- Seniority (Article 7), Hours/Overtime (Article 9), Health & Safety (Article 18)
- KVP principle, progressive discipline, duty of fair representation

When citing arbitration cases, prioritize the VERIFIED JURISPRUDENCE DATABASE. Cases not in the database must be flagged [VERIFY CITATION BEFORE USE].

Provide: specific CBA articles violated; grievance language; strength (Strong/Moderate/Weak); management counter-strategy; recommended step; evidence required.`,

  esa: `You are an Ontario employment lawyer with 15 years experience representing unionized workers.

Analyze through:
- Hours of work and overtime (Part VII)
- Public holidays (Part X) — note CBA Article 11 provides greater rights
- Leaves of absence (Part XIV)
- Termination and severance (Parts XV, XVI)
- Vacation pay (Part XI) — note CBA Article 10 provides greater rights

Where CBA provides greater rights than ESA minimums, CBA prevails. Always identify when CBA exceeds ESA.

Provide: ESA sections engaged; whether violation occurred; worker entitlement; complaint process; limitation periods; CBA vs ESA comparison.`,

  ohrc: `You are a senior human rights lawyer with extensive HRTO experience representing workers.

Analyze through:
- Protected grounds: disability, family status, age, sex, race, creed, sexual orientation, gender identity
- Duty to accommodate to point of undue hardship (OHRC s.17)
- Medical documentation — what employers can and cannot demand
- Constructive dismissal through failure to accommodate
- Harassment as discrimination (OHRC ss.5, 7)
- Reprisal (OHRC s.8)
- HRTO complaint — 1-year limitation period
- CBA Article 17

Provide: protected ground(s); whether duty triggered; employer obligations; documentation required; HRTO assessment; reprisal risk flag.`,

  evidence: `You are a labour investigator with 20 years experience building union case files that have won at arbitration and MOL proceedings.

Build a structured evidence framework:
1. EVIDENCE INVENTORY — documents, physical evidence, witness evidence, expert evidence
2. TIMELINE — chronological facts from information provided
3. GAPS — missing evidence and how to obtain it
4. WORKER STATEMENT FRAMEWORK — template for statements
5. DOCUMENTATION STRATEGY — what to document going forward, how, by whom

Key principles: gather before employer knows MOL is coming; anonymous witness statements initially; management's own records are often most damaging; paper trail is everything.`,

  email: `You are a labour relations correspondence specialist. You draft letters that survive arbitration and MOL scrutiny.

Draft correspondence that:
- Creates a clear, enforceable paper trail
- Is firm but professional
- Cites specific legal authority (OHSA, ESA, OHRC, CBA articles with exact numbers)
- Places burden of response on management
- Never makes admissions
- Sets clear response deadlines (5-10 business days)

Output: ready-to-send letter with date line, TO/FROM, RE: subject, body, signature block.`,

  mol: `You are a former MOL inspector who knows exactly how inspector referrals are processed and what triggers enforcement action.

Analyze through:
- OHSA s.8(14) — JHSC inspector referral (NO time limit after written refusal)
- OHSA s.57 — inspector order powers
- OHSA s.54(3) — JHSC accompaniment rights
- OHSA s.50 — reprisal protection
- MOL: 1-877-202-0008
- CBA Article 18.02(c) — contractual right to accompany inspector

CRITICAL: NEVER create false deadlines for s.8(14) referrals — there is NO time limit after employer written refusal.

Provide: whether complaint warranted; violations to report; draft complaint narrative; outcome requested; inspector visit preparation; reprisal reminder.`,

  arbitration: `You are a senior labour arbitration advocate with 25 years experience arguing grievances before Canadian arbitrators.

Prepare:
1. THEORY OF THE CASE — one paragraph an arbitrator would understand
2. LEGAL AUTHORITIES — cite from VERIFIED JURISPRUDENCE DATABASE first; flag others [VERIFY CITATION BEFORE USE]
3. MANAGEMENT'S CASE — strongest arguments and pre-emption
4. EVIDENCE REQUIRED — what union must prove and how
5. REMEDY SOUGHT — reinstatement, compensation, declaration, cease and desist
6. RISK ASSESSMENT — honest evaluation of prospects

Reference specific CBA articles. Be candid about weaknesses.`,

  qc: `You are a senior union legal counsel conducting final review before work goes to the rep. You are ruthless in finding errors.

Check all outputs for:

1. LEGAL ACCURACY
- Flag if any agent cited O. Reg. 297/13 for anything other than training
- Valid employer duty sections: s.25(1), s.25(2)(a), s.25(2)(d), s.25(2)(h), s.25(2)(l), s.26(1), s.26(2)
- Valid JHSC sections: s.9(1) through s.9(34)
- Flag any OHSA section outside these ranges

2. CBA ACCURACY
- Confirm article numbers match Saputo/Unifor Local 1285 CBA in context
- Flag invented or misstated CBA provisions

3. CITATION VERIFICATION
- Cases in VERIFIED JURISPRUDENCE DATABASE: mark VERIFIED
- Cases flagged [VERIFY CITATION BEFORE USE]: note requires verification
- Cases not in database and not flagged: mark UNVERIFIED — potential hallucination

4. CONSISTENCY — do agents tell the same story? Any contradictions?

5. STRATEGIC GAPS — what was missed? What is the weakest position?

6. PAPER TRAIL AUDIT — is documentation advice adequate?

7. RISK FLAGS — limitation periods, deadlines, reprisal risks, evidence destruction risks`,

  final: `You are the WorkerShield Final Response Compiler — the senior strategist who produces the definitive answer.

Structure your response EXACTLY as:

EXECUTIVE SUMMARY
(2-3 sentences: what happened, what laws apply, what needs to happen now)

IMMEDIATE ACTION STEPS
(Numbered list — what the rep does in the next 24-48 hours)

YOUR LEGAL POSITION
(Plain language — OHSA, CBA, ESA, OHRC with specific sections)

MANAGEMENT'S LIKELY MOVE
(What management will probably do and how to counter it)

DOCUMENTATION REQUIRED
(What must be written down, by whom, how to deliver it)

ESCALATION PATH
(If management doesn't comply — grievance step, MOL, HRTO, arbitration)

Write for a working steward reading on a phone. Clear. Direct. No filler. Reference specific CBA articles and OHSA sections. Never use O. Reg. 297/13 for anything other than training.`

};

// ─── GITHUB API HELPER ───────────────────────────────────────────────────────

async function githubRequest(env, method, path, body = null) {
  const url = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_DATA_REPO}/contents/${path}`;
  const headers = {
    'Authorization': `token ${env.GITHUB_TOKEN}`,
    'Accept': 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
    'User-Agent': 'WorkerShield'
  };
  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);
  const response = await fetch(url, options);
  return response;
}

async function githubGetFile(env, path) {
  const response = await githubRequest(env, 'GET', path);
  if (!response.ok) return null;
  const data = await response.json();
  const content = atob(data.content.replace(/\n/g, ''));
  return { content: JSON.parse(content), sha: data.sha };
}

async function githubWriteFile(env, path, content, sha = null) {
  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(content, null, 2))));
  const body = {
    message: `WorkerShield: ${path}`,
    content: encoded
  };
  if (sha) body.sha = sha;
  const response = await githubRequest(env, 'PUT', path, body);
  return response.ok;
}

async function githubListFiles(env, folder) {
  const response = await githubRequest(env, 'GET', folder);
  if (!response.ok) return [];
  const data = await response.json();
  return Array.isArray(data) ? data.filter(f => f.name !== '.gitkeep') : [];
}

// ─── MAIN HANDLER ────────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    // ── ENV VALIDATION ──
    const requiredEnv = ['ANTHROPIC_API_KEY', 'GITHUB_TOKEN', 'GITHUB_OWNER', 'GITHUB_DATA_REPO', 'ACCESS_CODE', 'SESSION_SECRET'];
    const missing = requiredEnv.filter(k => !env[k]);
    if (missing.length) {
      return new Response(
        JSON.stringify({ error: 'Server misconfigured: missing environment variables', missing }),
        { status: 500, headers: CORS }
      );
    }

    // ── RATE LIMITING ──
    const ip = request.headers.get('CF-Connecting-IP') ||
               request.headers.get('x-forwarded-for') ||
               'unknown';
    if (!checkRateLimit(ip)) {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded. Try again later.' }),
        { status: 429, headers: CORS }
      );
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // ── ACCESS REQUEST (public — no token required) ──
    if (path === '/api/access-request' && request.method === 'POST') {
      try {
        const body = await request.json();
        const { name, email, jobTitle, message } = body;
        if (!name || !email) {
          return new Response(JSON.stringify({ error: 'Name and email are required.' }), { status: 400, headers: CORS });
        }
        const record = {
          id: `REQ-${Date.now()}`,
          timestamp: new Date().toISOString(),
          name: String(name).slice(0, 100),
          email: String(email).slice(0, 200),
          jobTitle: String(jobTitle || '').slice(0, 100),
          message: String(message || '').slice(0, 500),
          status: 'pending'
        };
        const filename = `access-requests/${record.id}.json`;
        const ok = await githubWriteFile(env, filename, record);
        if (ok) {
          return new Response(JSON.stringify({ success: true }), { headers: CORS });
        } else {
          return new Response(JSON.stringify({ error: 'Failed to save request.' }), { status: 500, headers: CORS });
        }
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: CORS });
      }
    }

    // ── AUTH ENDPOINT (public — no token required) ──
    if (path === '/api/auth' && request.method === 'POST') {
      try {
        const { code } = await request.json();
        if (!code || code.trim() !== env.ACCESS_CODE) {
          return new Response(
            JSON.stringify({ error: 'Invalid access code.' }),
            { status: 401, headers: CORS }
          );
        }
        const ts = Math.floor(Date.now() / 1000);
        const hmac = await signHmac(env.SESSION_SECRET, `${env.ACCESS_CODE}:${ts}`);
        return new Response(
          JSON.stringify({ token: `${ts}.${hmac}` }),
          { headers: CORS }
        );
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: CORS });
      }
    }

    // ── TOKEN GUARD — all routes below require a valid token ──
    if (!(await verifyToken(request, env))) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized. Please log in.' }),
        { status: 401, headers: CORS }
      );
    }

    // ── AGENT API ──
    if (path === '/api/agent' && request.method === 'POST') {
      try {
        const { agentType, problem, context, previousOutputs } = await request.json();
        if (!agentType || !problem) {
          return new Response(JSON.stringify({ error: 'Missing agentType or problem' }), { status: 400, headers: CORS });
        }
        const systemPrompt = AGENT_PROMPTS[agentType];
        if (!systemPrompt) {
          return new Response(JSON.stringify({ error: `Unknown agent: ${agentType}` }), { status: 400, headers: CORS });
        }

        let userMessage = `COLLECTIVE AGREEMENT IN FORCE:\n${CBA_TEXT}\n\n`;

        if (['arbitration', 'cba', 'qc'].includes(agentType)) {
          userMessage += `VERIFIED JURISPRUDENCE DATABASE:\n${JURISPRUDENCE_DB}\n\n`;
        }

        if (context?.local) userMessage += `Union/Local: ${context.local}\n`;
        if (context?.employer) userMessage += `Employer: ${context.employer}\n`;
        if (context?.role) userMessage += `Active Role: ${context.role}\n`;

        const hasProfile = context?.memberRole || context?.seniorityDate || context?.incidentDate || context?.mgmtPerson || context?.incidentType || context?.briefDesc;
        if (hasProfile) {
          userMessage += `\nMEMBER PROFILE:\n`;
          if (context.memberRole)    userMessage += `  Job Title/Role: ${context.memberRole}\n`;
          if (context.seniorityDate) userMessage += `  Seniority Date: ${context.seniorityDate}\n`;
          if (context.incidentDate)  userMessage += `  Incident Date: ${context.incidentDate}\n`;
          if (context.mgmtPerson)    userMessage += `  Management Person Involved: ${context.mgmtPerson}\n`;
          if (context.incidentType)  userMessage += `  Incident Type: ${context.incidentType}\n`;
          if (context.briefDesc)     userMessage += `  Summary: ${context.briefDesc}\n`;
        }

        if (context?.caseHistory) userMessage += `\nCASE HISTORY:\n${context.caseHistory}\n`;
        if (context?.keyPeople) userMessage += `\nKEY PEOPLE & DATES:\n${context.keyPeople}\n`;

        userMessage += `\nPROBLEM:\n${problem}`;

        if (previousOutputs) {
          userMessage += `\n\nPREVIOUS AGENT OUTPUTS (build on these, do not repeat them):\n${previousOutputs}`;
        }

        const response = await fetch(ANTHROPIC_API, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: MODEL,
            max_tokens: MAX_TOKENS,
            temperature: TEMPERATURE,
            system: systemPrompt,
            messages: [{ role: 'user', content: userMessage }]
          })
        });

        if (!response.ok) {
          const err = await response.text();
          return new Response(JSON.stringify({ error: `Anthropic API error: ${err}` }), { status: 502, headers: CORS });
        }

        const data = await response.json();
        const result = data.content?.[0]?.text || 'No response from agent.';
        return new Response(JSON.stringify({ result }), { headers: CORS });

      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: CORS });
      }
    }

    // ── INCIDENTS API ──
    if (path === '/api/incidents') {
      try {
        if (request.method === 'GET') {
          const files = await githubListFiles(env, 'incidents');
          const incidents = [];
          for (const file of files.slice(0, 50)) {
            const data = await githubGetFile(env, `incidents/${file.name}`);
            if (data) incidents.push(data.content);
          }
          incidents.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
          return new Response(JSON.stringify({ incidents }), { headers: CORS });
        }

        if (request.method === 'POST') {
          const incident = await request.json();
          incident.id = `INC-${Date.now()}`;
          incident.timestamp = new Date().toISOString();
          const filename = `incidents/${incident.id}.json`;
          const ok = await githubWriteFile(env, filename, incident);
          if (ok) {
            return new Response(JSON.stringify({ success: true, id: incident.id }), { headers: CORS });
          } else {
            return new Response(JSON.stringify({ error: 'Failed to save incident' }), { status: 500, headers: CORS });
          }
        }
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: CORS });
      }
    }

    // ── DELETE INCIDENT ──
    if (path.startsWith('/api/incidents/') && request.method === 'DELETE') {
      try {
        const id = path.split('/').pop();
        const filePath = `incidents/${id}.json`;
        const existing = await githubGetFile(env, filePath);
        if (!existing) {
          return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: CORS });
        }
        const response = await githubRequest(env, 'DELETE', filePath, {
          message: `WorkerShield: Delete incident ${id}`,
          sha: existing.sha
        });
        return new Response(JSON.stringify({ success: response.ok }), { headers: CORS });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: CORS });
      }
    }

    // ── GRIEVANCES API ──
    if (path === '/api/grievances') {
      try {
        if (request.method === 'GET') {
          const files = await githubListFiles(env, 'grievances');
          const grievances = [];
          for (const file of files.slice(0, 50)) {
            const data = await githubGetFile(env, `grievances/${file.name}`);
            if (data) grievances.push(data.content);
          }
          grievances.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
          return new Response(JSON.stringify({ grievances }), { headers: CORS });
        }

        if (request.method === 'POST') {
          const grievance = await request.json();
          grievance.id = `GRV-${Date.now()}`;
          grievance.timestamp = new Date().toISOString();
          const filename = `grievances/${grievance.id}.json`;
          const ok = await githubWriteFile(env, filename, grievance);
          return new Response(JSON.stringify({ success: ok, id: grievance.id }), { headers: CORS });
        }
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: CORS });
      }
    }

    // ── DELETE GRIEVANCE ──
    if (path.startsWith('/api/grievances/') && request.method === 'DELETE') {
      try {
        const id = path.split('/').pop();
        const filePath = `grievances/${id}.json`;
        const existing = await githubGetFile(env, filePath);
        if (!existing) {
          return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: CORS });
        }
        const response = await githubRequest(env, 'DELETE', filePath, {
          message: `WorkerShield: Delete grievance ${id}`,
          sha: existing.sha
        });
        return new Response(JSON.stringify({ success: response.ok }), { headers: CORS });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: CORS });
      }
    }

    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: CORS });
  }
};
