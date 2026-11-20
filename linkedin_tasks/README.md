# LinkedIn Content Automation Project

> **Superseded: original plan (March 2026), kept for history.** The live system is different:
> 2 posts a day (11:30 and 23:00 JST), triggered by cron-job.org with GitHub Actions as backup.
> See [`bot/README.md`](bot/README.md) (posting, schedule, controls) and
> [`generator/SPEC.md`](generator/SPEC.md) (building posts).

**Automate daily posting of C++ learning content to LinkedIn with professional carousel slides.**

---

## 📋 Quick Overview

| Aspect | Details |
|--------|---------|
| **Project Type** | Standalone Python automation |
| **Purpose** | Post C++ learning content to LinkedIn daily |
| **Format** | Carousel posts (5-12 slides per post) |
| **Schedule** | 6 days/week (Mon-Sat), one topic per week |
| **Duration** | 88 weeks (~20 months) |
| **Status** | 📝 **Documentation Phase** |

---

## 🎯 What This Project Does

1. **Reads** C++ learning content from existing JSON files (your app's data)
2. **Generates** beautiful carousel slides matching your app's design
3. **Posts** to LinkedIn automatically at 9 AM daily
4. **Tracks** progress to ensure no duplicates
5. **Runs** for 88 weeks covering all 88 topics

### Weekly Cycle
```
Week 1: Topic 1 (e.g., "Classes vs Structs")
├── Monday    → Theory (8-10 slides)
├── Tuesday   → Edge Cases (5-7 slides)
├── Wednesday → Code Examples (10-12 slides)
├── Thursday  → Practice Tasks (7-9 slides)
├── Friday    → Interview Q&A (8-10 slides)
├── Saturday  → Quick Reference (3-5 slides)
└── Sunday    → REST (no post)

Week 2: Topic 2 (next topic)
... repeat for 88 weeks
```

---

## 📂 Project Structure

```
linkedin_automation/          # ⭐ The automation project
├── README.md                # This file
├── REQUIREMENTS.md          # Detailed functional requirements
├── DESIGN.md                # Visual design & technical specifications
├── IMPLEMENTATION_PLAN.md   # Development roadmap
│
├── src/                     # Source code (to be created)
├── templates/               # HTML slide templates (to be created)
├── output/                  # Generated images (to be created)
├── logs/                    # System logs (to be created)
└── state/                   # Progress tracking (to be created)
```

---

## 📖 Documentation

### Essential Documents

1. **[REQUIREMENTS.md](REQUIREMENTS.md)** - Complete requirements specification
   - Functional requirements (FR-1 through FR-17)
   - Non-functional requirements (performance, security, etc.)
   - Data requirements
   - Acceptance criteria

2. **[DESIGN.md](DESIGN.md)** - Design specifications
   - Visual design system (colors, typography, layouts)
   - 6 slide template designs (one per content type)
   - Code syntax highlighting specs
   - Technical implementation approach

3. **[IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md)** - Development roadmap
   - Phase-by-phase breakdown
   - Week-by-week tasks
   - Milestones and deliverables

### How to Read These Documents

**Start here (README)** → Overview and quick reference
↓
**REQUIREMENTS.md** → Understand what we're building
↓
**DESIGN.md** → See how it will look and work
↓
**IMPLEMENTATION_PLAN.md** → Learn the build process

---

## 🚀 Current Status

### Phase 1: Documentation ✅ In Progress

**Completed:**
- ✅ Initial requirements gathering
- ✅ Content strategy decision (Carousel approach)
- ✅ Formal requirements document created
- 🔄 Design document (in progress)
- ⏳ Implementation plan (pending)

**Next Steps:**
1. Complete DESIGN.md
2. Complete IMPLEMENTATION_PLAN.md
3. Get your approval on all documentation
4. Start Phase 2: Template creation

### Overall Progress

```
Phase 1: Documentation        ████████░░ 80% (Week 1-2)
Phase 2: Design & Prototyping ░░░░░░░░░░  0% (Week 2-3)
Phase 3: Core Development     ░░░░░░░░░░  0% (Week 3-4)
Phase 4: LinkedIn Integration ░░░░░░░░░░  0% (Week 4-5)
Phase 5: Testing & Launch     ░░░░░░░░░░  0% (Week 5-6)
```

**Timeline:** 6 weeks total development time

---

## 🎨 Design Highlights

### Visual Themes by Day

| Day | Content Type | Color | Icon | Slides |
|-----|--------------|-------|------|--------|
| Mon | Theory | 🔵 Blue | 📚 | 8-10 |
| Tue | Edge Cases | 🟠 Orange | ⚠️ | 5-7 |
| Wed | Code Examples | 🟣 Purple | 💻 | 10-12 |
| Thu | Practice | 🟢 Green | ✏️ | 7-9 |
| Fri | Interview Q&A | 🔴 Red | 🎤 | 8-10 |
| Sat | Quick Reference | 🔵 Teal | 📋 | 3-5 |

**All designs match your C++ Master Pro app's look and feel.**

---

## 🛠️ Technology Stack

- **Language:** Python 3.10+
- **Templating:** Jinja2
- **Image Generation:** html2image or Selenium
- **LinkedIn API:** requests + OAuth 2.0
- **Scheduling:** APScheduler
- **Storage:** JSON files

**No external services or paid APIs required.**

---

## 📋 Key Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Content Format | Carousel (5-12 slides) | Shows 90% of content vs 10% for single image |
| Schedule | One topic/week | More sustainable than daily topic changes |
| Platform | Standalone Python app | Clean separation from main app |
| Visual Design | App-identical | Brand recognition, proven design |
| Deployment | Self-hosted automation | Zero recurring costs |

---

## 📊 Expected Results

### Per Week (6 posts)
- **Total reach:** 3,000-12,000 views
- **Engagement:** 5-10% (150-1,200 interactions)
- **Profile visits:** 20-50
- **Follower growth:** ~50-100/month

### Over 88 Weeks
- **Total posts:** 528 (6 per week)
- **Total slides:** ~4,000 images
- **Expected reach:** 250K-1M views
- **Projected growth:** 4,000-8,000 followers

---

## ⚙️ System Requirements

### To Run This Automation:

**Software:**
- Python 3.10 or higher
- pip (Python package manager)
- LinkedIn Developer Account (free)

**Resources:**
- ~500 MB RAM
- ~1 GB disk space
- Stable internet connection

**Setup Time:** ~30 minutes

---

## 🔐 What You'll Need

**Before development completes, you'll need:**

1. **LinkedIn Developer Account**
   - Create app at developers.linkedin.com
   - Get API credentials (Client ID, Client Secret)
   - Generate OAuth tokens

2. **Configuration**
   - Set posting time (default: 9 AM)
   - Set timezone
   - Point to your JSON data files

3. **Initial Setup**
   - Install Python dependencies
   - Configure `.env` file
   - Run first test post

**Detailed setup guide will be provided in Phase 5.**

---

## 🎯 Success Criteria

The project is successful when:

- ✅ Posts automatically at 9 AM daily without your intervention
- ✅ Slides look identical to your app (professional quality)
- ✅ All 88 topics are covered systematically
- ✅ Zero duplicates or missed posts
- ✅ System runs reliably for 88 weeks

---

## 📞 Questions?

**For technical details:** See [REQUIREMENTS.md](REQUIREMENTS.md)
**For design specs:** See [DESIGN.md](DESIGN.md)
**For development plan:** See [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md)

---

## 🗓️ Timeline

```
Week 1-2:  Documentation & Design Approval
Week 2-3:  HTML Templates & Sample Slides
Week 3-4:  Core Automation System
Week 4-5:  LinkedIn Integration & Testing
Week 5-6:  Final Testing & Launch
─────────────────────────────────────────
Week 6+:   🚀 Live Automation (88 weeks)
```

---

## 📝 Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | March 27, 2026 | Initial documentation structure |

---

**Status:** Documentation phase - awaiting approval to proceed
**Last Updated:** March 27, 2026
**Next Milestone:** Complete design and implementation plan documents
