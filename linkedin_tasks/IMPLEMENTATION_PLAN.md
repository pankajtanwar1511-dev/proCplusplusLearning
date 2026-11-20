# Implementation Plan - LinkedIn Content Automation

> **Superseded: original plan (March 2026), kept for history.** The live system is different:
> 2 posts a day (11:30 and 23:00 JST), triggered by cron-job.org, posted by GitHub Actions.
> See [`bot/README.md`](bot/README.md) (posting, schedule, controls) and
> [`generator/SPEC.md`](generator/SPEC.md) (building posts).

**Document Version:** 1.0
**Date:** March 27, 2026
**Timeline:** 6 weeks
**Status:** Ready for Execution

---

## Overview

This document outlines the step-by-step plan to build the LinkedIn content automation system.

**Total Duration:** 6 weeks
**Development Hours:** ~120 hours
**End Result:** Fully automated LinkedIn posting system

---

## Phase Breakdown

```
Week 1-2:  Phase 1 - Documentation & Design        ✅ 80% Complete
Week 2-3:  Phase 2 - Templates & Prototyping       ⏳ Next
Week 3-4:  Phase 3 - Core Development              ⏳ Pending
Week 4-5:  Phase 4 - LinkedIn Integration          ⏳ Pending
Week 5-6:  Phase 5 - Testing & Deployment          ⏳ Pending
```

---

## Phase 1: Documentation & Design (Weeks 1-2)

### Status: 80% Complete

### Objectives
- Define clear requirements
- Design visual system
- Plan implementation approach
- Get stakeholder approval

### Tasks

#### Week 1
- [x] Initial requirements gathering
- [x] Content analysis (character counts, structure)
- [x] Content strategy decision
- [x] Create formal REQUIREMENTS.md
- [x] Create DESIGN.md
- [x] Create README.md
- [ ] Create IMPLEMENTATION_PLAN.md (this document)

#### Week 2
- [ ] Stakeholder review of all documentation
- [ ] Revise based on feedback
- [ ] Final approval of requirements
- [ ] Final approval of design
- [ ] Set up development environment

### Deliverables
- ✅ REQUIREMENTS.md - Complete requirements specification
- ✅ DESIGN.md - Visual design and technical specs
- ✅ README.md - Project overview and guide
- 🔄 IMPLEMENTATION_PLAN.md - Development roadmap
- ⏳ Approved documentation set

### Time Estimate
- Documentation: 20 hours (Complete)
- Review cycles: 4 hours (Pending)
- **Total: 24 hours**

---

## Phase 2: Templates & Prototyping (Weeks 2-3)

### Objectives
- Create HTML/CSS slide templates
- Generate sample slides for one complete week
- Get visual approval before full implementation

### Tasks

#### Week 2 (Continued)
- [ ] Set up project structure
  ```
  linkedin_automation/
  ├── templates/
  ├── src/
  ├── output/
  ├── logs/
  └── state/
  ```
- [ ] Install dependencies (`pip install -r requirements.txt`)
- [ ] Create base HTML template
- [ ] Create CSS stylesheet (app-matching styles)
- [ ] Integrate Prism.js for syntax highlighting

#### Week 3
- [ ] Create 6 content-type templates:
  - [ ] theory_template.html
  - [ ] edge_cases_template.html
  - [ ] examples_template.html
  - [ ] practice_template.html
  - [ ] interview_template.html
  - [ ] quick_reference_template.html

- [ ] Test image generation (HTML → PNG)
- [ ] Generate sample slides for Topic 1:
  - [ ] Monday: Theory (8-10 slides)
  - [ ] Tuesday: Edge Cases (5-7 slides)
  - [ ] Wednesday: Examples (10-12 slides)
  - [ ] Thursday: Practice (7-9 slides)
  - [ ] Friday: Q&A (8-10 slides)
  - [ ] Saturday: Quick Ref (3-5 slides)

- [ ] Create sample captions for each post
- [ ] Present to stakeholder for approval

### Deliverables
- 6 HTML slide templates
- Shared CSS stylesheet
- 40+ sample slide images (one complete week)
- Sample captions
- **Stakeholder approval on visual design**

### Time Estimate
- Template creation: 20 hours
- Sample generation: 10 hours
- Refinement based on feedback: 10 hours
- **Total: 40 hours**

### Acceptance Criteria
- ✅ Slides match app design visually
- ✅ Code syntax highlighting works correctly
- ✅ All 6 content types represented
- ✅ Stakeholder approves visual quality

---

## Phase 3: Core Development (Weeks 3-4)

### Objectives
- Build content processing system
- Implement slide generation automation
- Create state management

### Tasks

#### Week 3 (Continued)
- [ ] **Module 1: Content Selector** (`src/content/selector.py`)
  - [ ] Read current state (week, day)
  - [ ] Calculate which topic/section to post
  - [ ] Handle week/day progression
  - [ ] Implement completion logic
  - [ ] Unit tests

- [ ] **Module 2: Content Parser** (`src/content/parser.py`)
  - [ ] Load JSON files
  - [ ] Extract correct section (theory, edge_cases, etc.)
  - [ ] Parse subsections
  - [ ] Handle missing data gracefully
  - [ ] Unit tests

#### Week 4
- [ ] **Module 3: Content Splitter** (`src/content/splitter.py`)
  - [ ] Analyze content length
  - [ ] Split into logical slide chunks
  - [ ] Respect slide count targets
  - [ ] Handle code block splitting
  - [ ] Unit tests

- [ ] **Module 4: Slide Generator** (`src/generation/slide_generator.py`)
  - [ ] Render HTML from templates
  - [ ] Inject content into templates
  - [ ] Convert HTML → PNG
  - [ ] Handle errors gracefully
  - [ ] Unit tests

- [ ] **Module 5: Caption Generator** (`src/generation/caption_generator.py`)
  - [ ] Generate engaging captions
  - [ ] Format with bullets and hashtags
  - [ ] Stay within character limits
  - [ ] Unit tests

- [ ] **Module 6: State Manager** (`src/state/manager.py`)
  - [ ] Read/write state JSON
  - [ ] Update state after posting
  - [ ] Prevent duplicates
  - [ ] Handle state corruption
  - [ ] Backup mechanism
  - [ ] Unit tests

### Deliverables
- 6 core Python modules
- Unit tests (80%+ coverage)
- Working content processing pipeline
- State management system

### Time Estimate
- Content modules: 15 hours
- Slide generation: 10 hours
- State management: 5 hours
- Unit tests: 10 hours
- **Total: 40 hours**

### Acceptance Criteria
- ✅ Can select correct content based on week/day
- ✅ Can parse any of 88 topics
- ✅ Can split content intelligently
- ✅ Can generate slides matching templates
- ✅ State tracking works reliably
- ✅ Unit tests pass

---

## Phase 4: LinkedIn Integration (Weeks 4-5)

### Objectives
- Integrate LinkedIn API
- Implement carousel posting
- Add scheduling system

### Tasks

#### Week 4 (Continued)
- [ ] **LinkedIn API Setup**
  - [ ] Create LinkedIn Developer account
  - [ ] Register application
  - [ ] Get Client ID, Client Secret
  - [ ] Implement OAuth 2.0 flow
  - [ ] Store credentials securely (.env)

- [ ] **Module 7: LinkedIn Auth** (`src/linkedin/auth.py`)
  - [ ] OAuth token management
  - [ ] Token refresh logic
  - [ ] Error handling
  - [ ] Unit tests (mocked)

#### Week 5
- [ ] **Module 8: LinkedIn Poster** (`src/linkedin/poster.py`)
  - [ ] Upload images to LinkedIn
  - [ ] Create carousel post
  - [ ] Add caption
  - [ ] Handle API errors
  - [ ] Retry logic with exponential backoff
  - [ ] Rate limiting
  - [ ] Unit tests (mocked)

- [ ] **Module 9: Scheduler** (`src/scheduler/scheduler.py`)
  - [ ] Daily scheduling (APScheduler)
  - [ ] Run at 9 AM (configurable)
  - [ ] Skip Sundays
  - [ ] Handle timezone
  - [ ] Unit tests

- [ ] **Module 10: Main Orchestrator** (`main.py`)
  - [ ] Coordinate all modules
  - [ ] Command-line interface
  - [ ] Error handling
  - [ ] Logging
  - [ ] Manual commands (--post-now, --skip, --preview, --status)

- [ ] **Configuration System** (`config.py`)
  - [ ] Load from .env
  - [ ] Validate configuration
  - [ ] Default values

### Deliverables
- LinkedIn API integration
- OAuth authentication
- Carousel posting functionality
- Daily scheduler
- Main automation script
- CLI interface

### Time Estimate
- LinkedIn setup: 3 hours
- Auth module: 5 hours
- Posting module: 8 hours
- Scheduler: 4 hours
- Main script & CLI: 5 hours
- **Total: 25 hours**

### Acceptance Criteria
- ✅ Can authenticate with LinkedIn
- ✅ Can upload images
- ✅ Can create carousel posts
- ✅ Can post at scheduled time
- ✅ Manual commands work
- ✅ Errors are handled gracefully

---

## Phase 5: Testing & Deployment (Weeks 5-6)

### Objectives
- Comprehensive testing
- Bug fixes
- Documentation
- Production deployment

### Tasks

#### Week 5 (Continued)
- [ ] **Integration Testing**
  - [ ] End-to-end test: Generate slides from JSON
  - [ ] End-to-end test: Post to LinkedIn (test account)
  - [ ] Test all 6 content types
  - [ ] Test state progression
  - [ ] Test error scenarios

- [ ] **Edge Case Testing**
  - [ ] Missing JSON files
  - [ ] Malformed content
  - [ ] LinkedIn API failures
  - [ ] Network timeouts
  - [ ] State file corruption
  - [ ] System restart during process

#### Week 6
- [ ] **Bug Fixes**
  - [ ] Fix any issues found during testing
  - [ ] Optimize performance
  - [ ] Refine visual output

- [ ] **Documentation**
  - [ ] Setup guide (SETUP.md)
  - [ ] User guide (USER_GUIDE.md)
  - [ ] API documentation (code docstrings)
  - [ ] Troubleshooting guide
  - [ ] Update README with final instructions

- [ ] **Production Deployment**
  - [ ] Set up production environment
  - [ ] Configure LinkedIn API credentials
  - [ ] Initialize state (Week 1, Day 1)
  - [ ] Test manual post
  - [ ] Enable scheduler
  - [ ] Monitor first few posts

- [ ] **Monitoring Setup**
  - [ ] Log rotation configuration
  - [ ] Error notification setup (optional)
  - [ ] Status dashboard (optional)

### Deliverables
- Fully tested system
- All bugs fixed
- Complete documentation
- Deployed automation
- Monitoring in place

### Time Estimate
- Testing: 8 hours
- Bug fixes: 5 hours
- Documentation: 5 hours
- Deployment: 2 hours
- **Total: 20 hours**

### Acceptance Criteria
- ✅ All integration tests pass
- ✅ System handles errors gracefully
- ✅ Documentation is complete
- ✅ First week of posts successful
- ✅ System runs without intervention

---

## Development Environment Setup

### Prerequisites
```bash
# System requirements
Python 3.10+
pip
git

# LinkedIn requirements
LinkedIn Developer Account
API credentials (to be obtained in Phase 4)
```

### Initial Setup
```bash
# 1. Navigate to project directory
cd /home/pankaj/cplusplus/proCplusplus/linkedin_automation

# 2. Create virtual environment
python3 -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows

# 3. Install dependencies
pip install -r requirements.txt

# 4. Create .env file
cp .env.example .env
# Edit .env with your credentials

# 5. Initialize state
python main.py --init

# 6. Test with sample
python main.py --preview
```

### Dependencies (requirements.txt)
```txt
jinja2>=3.1.0
html2image>=2.0.0
selenium>=4.0.0
pillow>=10.0.0
requests>=2.31.0
requests-oauthlib>=1.3.0
apscheduler>=3.10.0
pytz>=2023.3
python-dotenv>=1.0.0
pytest>=7.4.0
```

---

## Code Structure

### Planned Directory Layout
```
linkedin_automation/
│
├── README.md
├── REQUIREMENTS.md
├── DESIGN.md
├── IMPLEMENTATION_PLAN.md
├── requirements.txt
├── .env.example
├── .gitignore
│
├── main.py                    # Entry point
├── config.py                  # Configuration
│
├── templates/                 # HTML templates
│   ├── theory_template.html
│   ├── edge_cases_template.html
│   ├── examples_template.html
│   ├── practice_template.html
│   ├── interview_template.html
│   ├── quick_reference_template.html
│   ├── styles.css
│   └── prism.css             # Syntax highlighting
│
├── src/                      # Source code
│   ├── __init__.py
│   │
│   ├── content/              # Content processing
│   │   ├── __init__.py
│   │   ├── selector.py       # Select topic/section
│   │   ├── parser.py         # Parse JSON
│   │   └── splitter.py       # Split into slides
│   │
│   ├── generation/           # Slide generation
│   │   ├── __init__.py
│   │   ├── slide_generator.py    # HTML → PNG
│   │   ├── caption_generator.py  # Generate captions
│   │   └── carousel_builder.py   # Combine slides
│   │
│   ├── linkedin/             # LinkedIn integration
│   │   ├── __init__.py
│   │   ├── auth.py           # OAuth
│   │   ├── poster.py         # Post to LinkedIn
│   │   └── api_client.py     # API wrapper
│   │
│   ├── state/                # State management
│   │   ├── __init__.py
│   │   └── manager.py        # Read/write state
│   │
│   └── scheduler/            # Scheduling
│       ├── __init__.py
│       └── scheduler.py      # Daily automation
│
├── output/                   # Generated images
│   └── .gitkeep
│
├── logs/                     # Application logs
│   └── .gitkeep
│
├── state/                    # State files
│   ├── progress.json
│   └── .gitkeep
│
└── tests/                    # Unit tests
    ├── __init__.py
    ├── test_selector.py
    ├── test_parser.py
    ├── test_splitter.py
    ├── test_slide_generator.py
    ├── test_state_manager.py
    └── [more test files...]
```

---

## Testing Strategy

### Unit Tests
- Every module has corresponding test file
- Mocked external dependencies (LinkedIn API, file system)
- Target: 80%+ code coverage

### Integration Tests
- End-to-end flow: JSON → Slides → LinkedIn
- State progression tests
- Error scenario tests

### Manual Tests
- Visual inspection of generated slides
- Test posting to LinkedIn (test account first)
- Monitor logs for errors

---

## Risk Mitigation

| Risk | Mitigation Strategy |
|------|---------------------|
| LinkedIn API changes | Monitor API, use versioned endpoints, implement adapter pattern |
| Image generation failures | Fallback to alternative library, comprehensive error handling |
| State corruption | Automatic backups, validation on read, manual recovery process |
| Rate limiting | Respect limits, implement exponential backoff, monitor usage |
| System downtime | Retry logic, email alerts, manual recovery instructions |

---

## Success Metrics

### Technical Metrics
- **Uptime:** 99% (miss <4 posts per year)
- **Error rate:** <1%
- **Generation time:** <30 seconds per post
- **Resource usage:** <500 MB RAM

### Quality Metrics
- **Visual quality:** Matches app design (stakeholder approved)
- **Content accuracy:** No content errors
- **Code quality:** 80%+ test coverage, passes linting

### Business Metrics
- **Automation:** Zero manual intervention after Week 1
- **Completion:** All 88 topics posted over 88 weeks
- **Engagement:** Track views, likes, comments (Phase 6+)

---

## Post-Launch Plan

### Week 1 After Launch
- Monitor every post closely
- Fix any issues immediately
- Gather initial feedback

### Weeks 2-4
- Monitor weekly
- Track engagement metrics
- Minor adjustments as needed

### Month 2+
- Monitor bi-weekly
- Review engagement trends
- Plan Phase 6 enhancements (if desired)

---

## Phase 6: Future Enhancements (Optional)

**NOT part of initial 6-week plan. Can be added later:**

- Analytics dashboard
- Engagement tracking (likes, comments, shares)
- A/B testing different designs
- Web-based preview/approval interface
- Automated comment responses
- Multi-platform support (Twitter, etc.)
- Content editing interface

---

## Communication Plan

### Weekly Check-ins
- Status update every Friday
- Show progress (slides, code, tests)
- Discuss blockers
- Plan next week

### Major Milestones
- **End of Phase 2:** Show sample slides for approval
- **End of Phase 3:** Demo content processing pipeline
- **End of Phase 4:** Demo first LinkedIn post (test account)
- **End of Phase 5:** Launch announcement

---

## Approval & Sign-off

**This implementation plan must be reviewed and approved before starting Phase 2.**

**Review Checklist:**
- [ ] Timeline is realistic (6 weeks)
- [ ] Phases are clearly defined
- [ ] Deliverables are specific
- [ ] Risks are identified
- [ ] Resource requirements are clear
- [ ] Success criteria are measurable

**Approved By:** _________________________
**Date:** _________________________

---

**Status:** Ready for execution pending documentation approval
**Next Step:** Complete Phase 1, then start Phase 2 (templates)
**Questions:** Review with stakeholder before beginning development
