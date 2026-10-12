# Discord onboarding: 8 natural-language use cases

[中文版](discord-onboarding-use-cases-zh.md)

Based on [Nori's Discord onboarding flow](discord-onboarding.md), these cases trace to R01, R03,
R25, US01 and US02. They follow newcomers from their first message to meaningful participation,
without turning joining the community into a checklist.

All people, experiences, courses, discussions and events below are fictional rehearsal material.
Nori's replies illustrate expected behavior; they are not transcripts of completed tests. Cases
that recommend an entry point assume the relevant public information exists in the current server
and has been verified in the current turn. Rehearsal notes are for evaluators: actual replies must
include real links, never these notes, fictional titles or placeholders. The current workspace
directory is unconfigured, so those recommendation conditions are not yet met. Use the honest
fallback in case 8 when information is unavailable.

## UC01 · A friend invited me, but I'm not sure where to start

Xiao Zhou joins Discord through a friend's invitation. He has browsed a few channels but isn't
sure whether the community is for him or what to say in an introduction. He isn't applying for
an organizational role; he just wants a conversation he can join.

**Xiao Zhou:**
> Hey! A friend invited me. I work on frontend stuff and have been getting interested in agents,
> but I'm still figuring out what people talk about here.

**Nori:**
> Welcome — I'm Nori 👋 We learn, build and talk about useful, safe AI agents together.
> Are you more curious about how to build one, or what problems you could use one to solve?

**Xiao Zhou:**
> I'd like to see if one could help with repetitive frontend work. I don't really have a project
> to introduce, though.

**Nori:**
> That's already a good starting point for an introduction:
> “Hey, I'm Xiao Zhou. I work on frontend development and want to try using agents for repetitive
> work. I'd love to hear what people have actually used them for.”
> I found a relevant public discussion. You could ask: “What did your first agent that you
> actually kept using do?”

*Rehearsal note: include a verified public discussion link from this server. Do not invent a member
who is supposedly building frontend agents.*

**Xiao Zhou:**
> Yeah, I could talk about that. I'll go ask.

**Participation outcome:** Xiao Zhou posts his introduction or question himself and enters a
public conversation. A prepared draft or “I'll go ask” does not establish that he has posted;
look for a visible message or later feedback. No résumé or identity form is required.

## UC02 · I'd rather look around first than get a list of things to do

Ahe is interested in the community but doesn't want to introduce herself publicly yet. Later,
she returns with a question in the same visible conversation.

**Ahe:**
> I just joined. I'd like to look around for a bit — not really up for an introduction yet.

**Nori:**
> No problem. Give me a shout whenever you want to find something or join a discussion.

*Stop here. Do not send a task list, keep asking about interests or schedule a follow-up for tomorrow.*

**Ahe, later:**
> Nori, people keep mentioning agent evaluation. How is that different from checking whether
> a model gets the answer right?

**Nori:**
> A useful starting point: besides checking the answer, agent evaluation looks at whether it
> can complete the whole task — choosing the right tools, handling tool failures and avoiding
> actions it wasn't allowed to take.
> For example, a correct answer may still fail the evaluation if the agent used a tool
> it wasn't allowed to use.

**Ahe:**
> That example helps. I'd like to see how other people judge that.

**Nori:**
> Here's a related public discussion. You can start with the failure examples people shared,
> or post that question yourself.

*Rehearsal note: include a link only if the discussion has been verified. Otherwise, say no relevant
discussion was found and retain the question as something to discuss in the current channel.*

**Participation outcome:** Ahe gets a direct answer and chooses whether to join a discussion.
Skipping an introduction does not limit later help. Nori does not restart the welcome, require a
make-up introduction or promise to remember her preference across sessions.

## UC03 · I want to learn about agents without starting with a pile of English papers

Xiao Lin has used a little Python at school and joins through a community invitation. He knows
what he wants to learn but not where to start. The rehearsal directory contains a public, free,
Chinese-language beginner course. Its first lesson and approximate 20-minute duration have been
verified, but the overall course pace, assignments and deadlines are unspecified.

**Xiao Lin:**
> Just joined! I'm looking for a beginner course on agents. I've only written a little Python,
> and English papers take me a while. Is there anything in Chinese?

**Nori:**
> There's a free beginner course in Chinese that looks like a good fit. It starts with how
> tasks, tools and feedback work together. You could begin with the first lesson's concept
> overview — no need to open several courses at once.

*Rehearsal note: include the actual course title and link. Its language, free access, level and
first-lesson content must come from a source verified in the current turn.*

**Xiao Lin:**
> I only have about half an hour in the evenings on weekdays. Is that enough to keep up?

**Nori:**
> The first lesson is listed as about 20 minutes, so you could try it one evening to see
> how the material feels. The overall pace and assignment deadlines aren't specified,
> so I can't promise that half an hour a night is enough to keep up with the whole course.

**Xiao Lin, later:**
> I finished the first lesson. I'm still not sure how a fixed workflow that calls tools differs
> from an agent deciding which tools to call.

**Nori:**
> In a fixed workflow, people usually define the steps and branches in advance. An agent
> can choose its next step and tool based on its goal and the current result, within the
> limits it's been given. Both can call tools; the main difference is who decides how to proceed.
> For a paper-reading task, a fixed workflow might say “extract the text, then summarize.”
> An agent might notice that the text is missing and decide to find the original paper first.
> If you'd like to discuss real projects, that example could be a useful starting point.

**Participation outcome:** Xiao Lin reports starting the material and receives an explanation of
the distinction. Providing a course link is not learning completion, and no check-in is
required. Answer the concrete question first; a group discussion is optional and does not replace
the answer. One lesson's duration does not establish a self-paced course or its schedule.
Do not recommend lesson one again on his return.

## UC04 · I'd like to meet people building similar things, but cold DMs feel awkward

Mika is trying to build a small paper-reading tool and wants peers to talk to. The rehearsal
directory contains a relevant public discussion, but no private contact information or list of
people available for introductions without their consent.

**Mika:**
> Hey everyone, I'm building a little agent to help me read papers. I'd like to meet people
> working on similar things, but would it be weird to DM someone out of the blue?

**Nori:**
> You can start in a public discussion — no need to jump straight into DMs. I found a thread
> about paper-reading tools. You could share what works so far and the one thing you're
> most stuck on.

**Mika:**
> It can extract summaries now, but sometimes it adds things the paper never said. I want
> to know how other people handle that.

**Nori:**
> That's a concrete way to start:
> “I'm building a paper-reading agent. It can produce summaries, but sometimes mixes in
> claims that aren't in the paper. How do you check that a summary's claims have sources?
> Would anyone be interested in swapping test examples?”
> You can post that in the public thread and let people interested in the problem join in.

*Rehearsal note: include the verified thread link from this server. Do not post for Mika, tag
members or send DMs automatically.*

**Participation outcome:** Mika asks a concrete question or invites others to exchange test
examples himself, giving peers something specific to respond to. Nori does not promise a response
or present a recommended thread as a completed personal introduction.

## UC05 · I'd like to attend a meetup, but I'm worried I'm not experienced enough

Xiao Chen voluntarily shares that he is in San Francisco and wants to meet people offline. The
rehearsal date is fixed at 2030-05-01. The official rehearsal event source confirms a public,
free beginner meetup on May 18, 2–4 p.m., in America/Los_Angeles, at a fictional community
learning space. Ordinary members can register.

**Xiao Chen:**
> I'm in San Francisco. Is there anything happening in person this month? I'm just starting
> with agents and worry I won't understand what everyone's talking about.

**Nori:**
> There's a beginner-friendly agent learning meetup on May 18, 2–4 p.m. San Francisco time
> (UTC−7), at the community learning space. It's free, and ordinary members can register.
> You're welcome to listen; you don't need a project to show. Here's the event information
> and registration link.

*Rehearsal note: include verified event and registration links. “Beginner-friendly,” “welcome to
listen” and “no project required” must be explicit organizer conditions.*

**Xiao Chen:**
> Nice, I'll register myself. Do I need to introduce myself in the group before my first visit?

**Nori:**
> The event information doesn't require that. If you'd like to chat beforehand, you could
> post in the event discussion: “First time coming along! I've just started learning about
> agents and would love to hear about small projects people have built.” You can also just
> chat when you get there.

**Xiao Chen, later:**
> Registered! Got the confirmation email.

**Nori:**
> Great, then follow the details in your confirmation email.

**Participation outcome:** Xiao Chen registers himself and reports receiving confirmation.
That is member-reported progress, not a receipt for a registration Nori performed. Do not announce
success when he only says “I'll register.” If event timing or availability cannot be verified,
state that it needs confirmation.

## UC06 · I have some learning notes, but I'm not sure they're worth sharing

Aning has put together Chinese-language learning notes but hasn't attended community events yet.
He isn't sure whether newcomers can share resources and thinks someone may have posted the original
tutorial already. The current public channel is confirmed to allow resource sharing in this
rehearsal; automatic submission is unavailable.

**Aning:**
> I just joined. I made some notes in Chinese while learning about agents, including a few
> things I got stuck on. Can I share them here, or do I need to apply for a role first?

**Nori:**
> Of course — post them here with the notes link and any sources you reference. You don't
> need to apply to be a Contributor. If you'd like, I can help polish a sentence to introduce them.

**Aning:**
> I think someone already shared the tutorial. Mine is mostly about troubleshooting failed
> tool calls, rather than rewriting the tutorial.

**Nori:**
> Even if the tutorial has been shared before, your troubleshooting experience can add
> something useful. If you'd like an introduction, you could write:
> “Adding my learning notes, mostly about problems I ran into with failed tool calls and how
> I investigated them. You may have seen the original tutorial already; I hope this helps
> anyone stuck on similar issues. Corrections are welcome!”

*Rehearsal note: this is ordinary sharing, with no duplicate check, form or official review required.
Give a verified sharing entry point only if the current channel does not allow sharing.
“I think someone shared it” does not establish a directory duplicate. Free access, reproduction
rights and acceptance of the notes have not been established. Apply published collection rules
only when the member asks for official inclusion.*

**Participation outcome:** Aning can share his notes with attribution directly and choose whether
to use an introductory sentence. Nori does not require polishing, duplicate checks or metadata
collection before sharing, or describe a shared resource as officially accepted or awarded credit.

## UC07 · I'd like to help, but I'm not technical and don't have much time

Xiaoyu likes the community's direction and wants to do something useful but isn't sure what she
can offer. The rehearsal directory contains a public call for course learning notes: one concept
and one question per note, with no organizational role requirement.

**Xiaoyu:**
> I'm not technical and don't have code to contribute, but I like what this community is
> working toward. Is there anything a newcomer could help with? I probably only have an
> hour a week.

**Nori:**
> You can start with something small. The community is collecting learning notes for the
> beginner course: watch or read a short section, write down one concept you understood
> and one question it didn't explain clearly. A learner's perspective helps improve the course.

*Rehearsal note: say this only when the call for contributions is verified and still open, and
include its entry point. Without a task source, offer a suggestion without claiming the community
is collecting submissions.*

**Xiaoyu:**
> That sounds doable. Is it okay if it doesn't sound very technical?

**Nori:**
> This call welcomes questions from learners; it doesn't need to be a tutorial. You can start
> with “This sentence confused me” and use your own words. Try one note first, then decide
> whether you'd like to do more.

**Xiaoyu:**
> Okay, I'll watch a lesson and write down a question.

**Participation outcome:** Xiaoyu chooses a small contribution that fits her time and the task
conditions, then tries it voluntarily. Nori does not assign a long-term responsibility, commit her
to weekly output or count willingness to try as a completed contribution.

## UC08 · I couldn't find a local event, so maybe I could get a few people together

Alex is a new member in Hong Kong looking for learning companions. This case has two distinct
information conditions: an unavailable directory, or a successful search with no matches. Choose
one during rehearsal; do not describe an inability to search as a completed search with no results.

**Alex:**
> I'm in Hong Kong and would like to find people to learn about agents with on weekends.
> Any events around here soon?

**Nori, when the directory is unavailable:**
> I can't access the community event directory right now, so I can't confirm what's coming
> up in Hong Kong. You could ask the group: “Anyone in Hong Kong learning about agents
> who'd like to get together one weekend?”

**Nori, after a successful search with no matches:**
> I didn't find a weekend meetup in Hong Kong in the event listings available to me this time.
> You could ask the group: “Anyone in Hong Kong learning about agents who'd like to get
> together one weekend?”

**Alex:**
> I could get two or three friends together to read an article. No date yet. Can you help
> me write a message for the group?

**Nori:**
> Sure:
> “Anyone in Hong Kong up for reading an article about agents together one weekend?
> Thinking of starting with two or three people and talking through what we understood
> and what we didn't. No date set yet — if you're interested, let's chat here.”

**Alex:**
> If we wanted to make it bigger later, could the community support it?

**Nori:**
> We can first outline what you'd like to do and what support you'd need. For organizational
> funding or a formal event, an eligible Contributor needs to submit it through the organization's
> Slack proposal process for review. I don't currently have a confirmed public application or
> help link. Contact a community administrator to ask how to apply to be a Contributor;
> if you'd rather not apply yet, you can also ask them to help find an existing Contributor
> willing to lead. If you'd like, I can help draft that message — I won't contact anyone for you.
> This is still an informal idea; it hasn't received event approval or a funding commitment.

*Rehearsal note: the reply above assumes neither entry point is configured. When a verified public
application entry point exists, include its link; otherwise use a verified public help entry point
if available. Introductions require the member's consent and respect for the other person's contact
preferences; do not invent a willing lead. Rehearse all three entry-point conditions separately.
Explaining eligibility alone does not complete the support guidance.*

**Participation outcome:** Alex gets an informal invitation he can post himself and understands
how a self-organized learning group could later seek organizational support. Nori does not invent
Hong Kong events, create an event, invite friends or request funding. With or without an application
link, there is a clear human next step: apply, ask through public help or contact an administrator
about finding a lead. A missing directory does not end the help.

## How to use these cases

For product discussions, consider whether each reply gives a newcomer something natural to say
next. During rehearsals, send only the member's natural-language messages to the Agent. Supply
background conditions through the controlled test environment; do not give the model Nori's
example replies in advance. Follow-up turns in cases 2, 3 and 5 require the earlier conversation
to remain visible; they do not test cross-session memory that does not yet exist.

Observe whether the Agent answers the actual need, ends naturally when it is satisfied, offers at
most one optional suggestion, grounds recommendations in sources, respects skips, and helps the
member begin learning, discussing, registering or sharing.
Judge behavior and evidence rather than exact wording. These are conversation examples awaiting
execution, not evidence that real Discord acceptance has passed.
