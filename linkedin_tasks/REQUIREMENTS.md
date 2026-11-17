# Requirements Specification - LinkedIn Content Automation

**Document Version:** 1.0
**Date:** March 27, 2026
**Status:** Final - Awaiting Approval
**Author:** Claude Code
**Project:** C++ Master Pro - LinkedIn Content Automation

---

## 1. Executive Summary

### 1.1 Project Goal
Develop a standalone Python automation system that posts C++ learning content from the C++ Master Pro app to LinkedIn daily with professional, app-like visual design.

### 1.2 Scope
- **In Scope:** Content extraction, slide generation, LinkedIn posting, scheduling, state management
- **Out of Scope:** Modifying existing C++ Master Pro app, creating new content, engagement automation (replies/comments)

### 1.3 Success Criteria
- System posts automatically at 9 AM daily for 88 weeks
- Visual quality matches C++ Master Pro app
- Zero manual intervention required
- All 88 topics covered systematically

---

## 2. Functional Requirements

### 2.1 Content Management

#### FR-1: Content Source
**Requirement:** System must read content from existing JSON files.

**Details:**
- **Source Location:** `../processed_data/json_output/`
- **File Format:** JSON files (chapter_1_oops.json through chapter_20_advanced_implementations.json)
- **Content Structure:** Each topic contains 6 sections:
  - `theory` - Theoretical explanations
  - `edge_cases` - Edge cases and pitfalls
  - `code_examples` - Code examples with explanations
  - `practice_tasks` - Practice problems and solutions
  - `interview_qa` - Interview questions and answers
  - `quick_reference` - Cheat sheets and tables

**Acceptance Criteria:**
- ✅ System can locate and read all JSON files
- ✅ System can parse JSON structure correctly
- ✅ System handles missing/malformed files gracefully

---

#### FR-2: Content Selection
**Requirement:** System must select correct content based on current week and day.

**Details:**
- **Schedule:** One topic per week, 6 days per week (Mon-Sat)
- **Cycle:** Theory → Edge Cases → Examples → Practice → Q&A → Quick Reference
- **Duration:** 88 topics × 1 week = 88 weeks (~20 months)

**Selection Logic:**
```
Week 1, Day 1 (Monday)    → Chapter 1, Topic 1, Theory
Week 1, Day 2 (Tuesday)   → Chapter 1, Topic 1, Edge Cases
Week 1, Day 3 (Wednesday) → Chapter 1, Topic 1, Examples
Week 1, Day 4 (Thursday)  → Chapter 1, Topic 1, Practice
Week 1, Day 5 (Friday)    → Chapter 1, Topic 1, Q&A
Week 1, Day 6 (Saturday)  → Chapter 1, Topic 1, Quick Reference

Week 2, Day 1 (Monday)    → Chapter 1, Topic 2, Theory
... (repeat for 88 weeks)
```

**Acceptance Criteria:**
- ✅ Correct topic selected based on week number
- ✅ Correct section selected based on day of week
- ✅ Sunday is always skipped (no posting)
- ✅ After Week 88, automation stops

---

#### FR-3: Content Splitting
**Requirement:** System must intelligently split long content into multiple slides.

**Details:**
- **Target:** 5-12 slides per post
- **Constraints:**
  - Theory: 8-10 slides
  - Edge Cases: 5-7 slides
  - Examples: 10-12 slides
  - Practice: 7-9 slides
  - Q&A: 8-10 slides
  - Quick Reference: 3-5 slides

**Splitting Rules:**
1. One concept/edge case/example per slide
2. Code blocks must fit on single slide (split if >25 lines)
3. Maintain logical flow between slides
4. Always include title slide and summary slide

**Acceptance Criteria:**
- ✅ Content split maintains readability
- ✅ No orphaned text fragments
- ✅ Code blocks are complete on each slide
- ✅ Slide count stays within target range

---

### 2.2 Visual Design

#### FR-4: Slide Templates
**Requirement:** System must generate slides matching C++ Master Pro app design.

**Details:**
- **Dimensions:** 1080×1080 pixels (LinkedIn carousel standard)
- **Format:** PNG images
- **Templates:** 6 unique templates (one per content type)

**Design Elements:**
- Color scheme matching app
- Typography matching app (Inter font family)
- Card-based layout
- Icons and emojis for visual interest
- Slide counters (e.g., "3/10")
- Brand footer ("C++ Master Pro")

**Acceptance Criteria:**
- ✅ Slides are visually indistinguishable from app screenshots
- ✅ All 6 templates implemented
- ✅ Consistent branding across all slides
- ✅ Professional appearance

---

#### FR-5: Code Syntax Highlighting
**Requirement:** Code blocks must have proper C++ syntax highlighting.

**Details:**
- **Colors:**
  - Keywords (`#include`, `int`, `auto`): Purple (#8b5cf6)
  - Standard library (`std::`): Blue (#3b82f6)
  - Strings: Green (#10b981)
  - Comments: Gray (#6b7280)
  - Numbers: Orange (#f59e0b)
  - Types/Classes: Red (#ef4444)

- **Font:** Fira Code or Courier New (monospace)
- **Size:** 14px
- **Background:** Dark (#1e293b)

**Acceptance Criteria:**
- ✅ All C++ keywords highlighted correctly
- ✅ Colors match specification
- ✅ Code is readable on all devices
- ✅ Syntax errors don't break highlighting

---

#### FR-6: Visual Themes
**Requirement:** Each content type must have distinct visual theme.

**Details:**

| Day | Content Type | Theme Color | Icon | Gradient |
|-----|--------------|-------------|------|----------|
| Monday | Theory | Blue (#3b82f6) | 📚 | Blue gradient |
| Tuesday | Edge Cases | Orange (#f59e0b) | ⚠️ | Orange gradient |
| Wednesday | Examples | Purple (#8b5cf6) | 💻 | Purple gradient |
| Thursday | Practice | Green (#10b981) | ✏️ | Green gradient |
| Friday | Q&A | Red (#ef4444) | 🎤 | Red gradient |
| Saturday | Quick Ref | Teal (#14b8a6) | 📋 | Teal gradient |

**Acceptance Criteria:**
- ✅ Each day has distinct color theme
- ✅ Themes are consistent across all weeks
- ✅ Colors are accessible (sufficient contrast)

---

### 2.3 LinkedIn Integration

#### FR-7: LinkedIn Authentication
**Requirement:** System must authenticate with LinkedIn API.

**Details:**
- **Method:** OAuth 2.0
- **Credentials:** Client ID, Client Secret, Access Token, Refresh Token
- **Permissions Required:**
  - `w_member_social` - Post on user's behalf
  - `r_liteprofile` - Get user profile information

**Token Management:**
- Access tokens expire (60 days)
- System must detect expiration
- System must refresh tokens automatically
- Fallback: Alert user if refresh fails

**Acceptance Criteria:**
- ✅ Successfully authenticates with LinkedIn
- ✅ Handles token expiration gracefully
- ✅ Securely stores credentials (not in code)
- ✅ Logs authentication events

---

#### FR-8: Carousel Posting
**Requirement:** System must post carousel posts (multiple images) to LinkedIn.

**Details:**
- **API Endpoint:** LinkedIn Share API v2
- **Post Type:** Carousel (image document type)
- **Images:** 5-12 images per post
- **Caption:** Text description (up to 3,000 characters)

**Post Structure:**
```json
{
  "author": "urn:li:person:USER_ID",
  "lifecycleState": "PUBLISHED",
  "specificContent": {
    "com.linkedin.ugc.ShareContent": {
      "shareCommentary": {
        "text": "Post caption here..."
      },
      "shareMediaCategory": "IMAGE",
      "media": [
        {
          "status": "READY",
          "media": "urn:li:digitalmediaAsset:IMAGE_URN_1"
        },
        ...
      ]
    }
  }
}
```

**Acceptance Criteria:**
- ✅ Successfully posts carousel to LinkedIn
- ✅ All images appear in correct order
- ✅ Caption is formatted correctly
- ✅ Hashtags are included

---

#### FR-9: Caption Generation
**Requirement:** System must generate engaging captions for posts.

**Details:**
- **Format:**
  ```
  [Emoji] Day X/6: [Content Type]

  [2-3 sentence introduction]

  ✓ Key point 1
  ✓ Key point 2
  ✓ Key point 3

  [Call to action or next day preview]

  #cpp #cplusplus #programming [+2-3 relevant tags]
  ```

- **Length:** 500-1000 characters (optimal for LinkedIn)
- **Hashtags:** 5-7 hashtags relevant to content

**Acceptance Criteria:**
- ✅ Captions are engaging and informative
- ✅ Format is consistent across all posts
- ✅ Hashtags are relevant
- ✅ Character count within limits

---

#### FR-10: Error Handling
**Requirement:** System must handle LinkedIn API errors gracefully.

**Error Scenarios:**
1. Rate limiting (too many requests)
2. Authentication failure
3. Network timeout
4. Image upload failure
5. Post creation failure

**Handling Strategy:**
- **Retry Logic:** Exponential backoff (1s, 2s, 4s, 8s, 16s)
- **Max Retries:** 5 attempts
- **Logging:** Log all errors with full context
- **Alerts:** Email/notification on persistent failures

**Acceptance Criteria:**
- ✅ System retries on temporary failures
- ✅ System stops retrying on permanent failures
- ✅ All errors are logged
- ✅ User is notified of persistent failures

---

### 2.4 State Management

#### FR-11: Progress Tracking
**Requirement:** System must track which content has been posted.

**Details:**
- **State Storage:** JSON file (`state/progress.json`)
- **State Structure:**
  ```json
  {
    "current_week": 3,
    "current_day": 2,
    "current_topic": {
      "chapter": 1,
      "topic_num": 3,
      "topic_name": "Inheritance"
    },
    "last_post_date": "2026-03-27",
    "last_post_time": "09:00:00",
    "total_posts": 14,
    "status": "active"
  }
  ```

**Acceptance Criteria:**
- ✅ State persists across restarts
- ✅ State updates after each post
- ✅ System can resume from last state
- ✅ State file is human-readable

---

#### FR-12: Duplicate Prevention
**Requirement:** System must never post the same content twice.

**Details:**
- Before posting, check:
  1. Current date vs last post date
  2. Current week/day vs state
  3. Topic already posted

- If duplicate detected:
  1. Log warning
  2. Skip post
  3. Update state to next content

**Acceptance Criteria:**
- ✅ No duplicate posts occur
- ✅ Duplicate detection is reliable
- ✅ System recovers if state is corrupted
- ✅ Manual state reset is possible

---

#### FR-13: Completion Handling
**Requirement:** System must stop after all 88 topics are posted.

**Details:**
- **Final Post:** Week 88, Day 6 (Saturday of 88th week)
- **After Completion:**
  1. Post final "Thank you" message (optional)
  2. Update state to "completed"
  3. Stop scheduling
  4. Log completion
  5. Send notification

**Acceptance Criteria:**
- ✅ System stops after Week 88, Day 6
- ✅ No errors occur when stopping
- ✅ State clearly indicates completion
- ✅ System can be manually restarted if needed

---

### 2.5 Scheduling

#### FR-14: Daily Scheduling
**Requirement:** System must post automatically at 9 AM daily.

**Details:**
- **Posting Time:** 9:00 AM (configurable)
- **Timezone:** User's local timezone (configurable)
- **Days:** Monday through Saturday
- **Skip:** Sunday (no posting)

**Scheduling Method:**
- **Option A:** Python APScheduler
- **Option B:** System cron job
- **Recommendation:** APScheduler (more flexible)

**Acceptance Criteria:**
- ✅ Posts consistently at 9 AM ±1 minute
- ✅ Skips Sundays automatically
- ✅ Handles daylight saving time changes
- ✅ Continues running after system restart

---

#### FR-15: Manual Override
**Requirement:** User must be able to manually trigger or skip posts.

**Details:**
- **Commands:**
  ```bash
  python main.py --post-now       # Post immediately
  python main.py --skip-today     # Skip today's post
  python main.py --preview        # Preview next post
  python main.py --status         # Show current status
  ```

**Acceptance Criteria:**
- ✅ Manual commands work correctly
- ✅ Manual posts update state properly
- ✅ Skip doesn't break sequence
- ✅ Preview shows accurate information

---

### 2.6 Logging & Monitoring

#### FR-16: Comprehensive Logging
**Requirement:** System must log all significant events.

**Details:**
- **Log Levels:**
  - DEBUG: Detailed technical info
  - INFO: Normal operations
  - WARNING: Recoverable issues
  - ERROR: Failures
  - CRITICAL: System-breaking issues

- **Log Events:**
  - Daily automation trigger
  - Content selection
  - Slide generation
  - LinkedIn API calls
  - Posting success/failure
  - State updates
  - Errors and exceptions

- **Log Format:**
  ```
  2026-03-27 09:00:01 [INFO] Starting daily automation...
  2026-03-27 09:00:02 [INFO] Selected: Week 3, Day 2, Chapter 1 Topic 3 Edge Cases
  2026-03-27 09:00:05 [INFO] Generated 7 slides
  2026-03-27 09:00:08 [INFO] Posted to LinkedIn successfully
  2026-03-27 09:00:09 [INFO] Updated state: Week 3, Day 3
  ```

**Acceptance Criteria:**
- ✅ All events are logged with timestamps
- ✅ Log files don't grow infinitely (rotation)
- ✅ Errors include stack traces
- ✅ Logs are searchable

---

#### FR-17: Monitoring Dashboard
**Requirement:** User must be able to monitor system status easily.

**Details:**
- **Status Information:**
  - Current week/day
  - Last post time
  - Next post time
  - Total posts made
  - Recent errors (if any)
  - System health

- **Access Method:**
  - Simple text file (`status.txt`)
  - OR: Simple web page (localhost:8080)
  - OR: CLI command (`python main.py --status`)

**Acceptance Criteria:**
- ✅ Status is always up-to-date
- ✅ Easy to check status quickly
- ✅ Shows last 5 posts
- ✅ Highlights errors if any

---

## 3. Non-Functional Requirements

### 3.1 Performance

#### NFR-1: Slide Generation Speed
**Requirement:** Generate all slides for one post in <30 seconds.

**Details:**
- 10 slides should generate in ~20-30 seconds
- HTML rendering is the bottleneck
- Use caching where possible

**Acceptance Criteria:**
- ✅ Average generation time <30s
- ✅ 95th percentile <45s
- ✅ Never exceeds 60s

---

#### NFR-2: System Resource Usage
**Requirement:** System should use minimal resources.

**Details:**
- **CPU:** <5% when idle, <50% when generating
- **Memory:** <500 MB
- **Disk:** <1 GB for logs/output (with rotation)
- **Network:** Minimal (only during posting)

**Acceptance Criteria:**
- ✅ System runs on modest hardware
- ✅ Doesn't interfere with other processes
- ✅ Doesn't consume excessive resources

---

### 3.2 Reliability

#### NFR-3: Uptime
**Requirement:** System must have 99% uptime.

**Details:**
- **Target:** Miss <4 posts per year
- **Monitoring:** Track successful vs failed posts
- **Recovery:** Automatic retry on failures

**Acceptance Criteria:**
- ✅ 99% of scheduled posts succeed
- ✅ System recovers from transient failures
- ✅ Critical failures are rare

---

#### NFR-4: Data Integrity
**Requirement:** State data must never be corrupted.

**Details:**
- Use atomic writes for state file
- Keep backup of previous state
- Validate state on every read

**Acceptance Criteria:**
- ✅ State file never corrupted
- ✅ Can recover from corrupted state
- ✅ Manual state editing is safe

---

### 3.3 Security

#### NFR-5: Credential Security
**Requirement:** API credentials must be stored securely.

**Details:**
- **Storage:** Environment variables or encrypted file
- **Never:** Hardcoded in source code
- **Never:** Committed to version control
- **Access:** Read-only by automation process

**Acceptance Criteria:**
- ✅ Credentials not in source code
- ✅ .env file is gitignored
- ✅ File permissions are restrictive (600)

---

### 3.4 Maintainability

#### NFR-6: Code Quality
**Requirement:** Code must be maintainable and well-documented.

**Details:**
- **Documentation:** Every module and function documented
- **Style:** Follow PEP 8 (Python style guide)
- **Testing:** Unit tests for core functions
- **Comments:** Complex logic explained

**Acceptance Criteria:**
- ✅ Code passes pylint with >8.0 score
- ✅ All public functions have docstrings
- ✅ Core functionality has unit tests
- ✅ README explains how to run/maintain

---

### 3.5 Usability

#### NFR-7: Easy Setup
**Requirement:** Setup process should take <30 minutes.

**Details:**
- **Steps:**
  1. Clone repository
  2. Install dependencies (`pip install -r requirements.txt`)
  3. Configure `.env` file
  4. Initialize state
  5. Run first test post

- **Documentation:** Step-by-step setup guide

**Acceptance Criteria:**
- ✅ Setup guide is clear and complete
- ✅ Average setup time <30 minutes
- ✅ Common errors are documented

---

## 4. Data Requirements

### 4.1 Input Data

#### DR-1: JSON Content Files
**Source:** `../processed_data/json_output/*.json`

**Format:**
```json
{
  "chapter": "Chapter 1: Object-Oriented Programming",
  "topics": [
    {
      "topic": "Classes vs Structs",
      "theory": {
        "content": "...",
        "subsections": [...]
      },
      "edge_cases": [...],
      "code_examples": [...],
      "practice_tasks": [...],
      "interview_qa": [...],
      "quick_reference": {...}
    }
  ]
}
```

**Requirements:**
- Files must exist and be readable
- JSON must be valid
- Structure must match schema
- Content must be UTF-8 encoded

---

### 4.2 Output Data

#### DR-2: Generated Images
**Location:** `output/week_XX/day_Y/`

**Format:**
- PNG images
- 1080×1080 pixels
- sRGB color space
- 72 DPI
- ~200-500 KB per image

**Retention:**
- Keep for 1 week after posting
- Delete older images to save space
- OR: Archive to cloud storage

---

#### DR-3: State File
**Location:** `state/progress.json`

**Format:** JSON (human-readable)

**Backup:**
- Backup before each update
- Keep last 7 backups
- Validate on every read

---

#### DR-4: Log Files
**Location:** `logs/automation.log`

**Format:** Plain text, one line per event

**Rotation:**
- Max size: 10 MB per file
- Keep 10 most recent files
- Compress older logs

---

## 5. Integration Requirements

### 5.1 LinkedIn API

#### IR-1: API Version
**Requirement:** Use LinkedIn API v2 (current stable version).

**Endpoints Used:**
- `/v2/assets` - Upload images
- `/v2/ugcPosts` - Create carousel post
- `/v2/me` - Get user profile

**Rate Limits:**
- 100 requests per day per user (posting)
- 500 requests per day per user (other operations)

**Acceptance Criteria:**
- ✅ API version is current and supported
- ✅ Stay within rate limits
- ✅ Handle API deprecations gracefully

---

### 5.2 External Dependencies

#### IR-2: Third-Party Libraries
**Requirement:** Minimize external dependencies.

**Allowed Libraries:**
- Standard library (Python 3.10+)
- Jinja2 (templating)
- html2image (image generation)
- requests (HTTP client)
- APScheduler (scheduling)

**Prohibited:**
- Unmaintained libraries
- Libraries with security vulnerabilities
- Libraries with restrictive licenses

**Acceptance Criteria:**
- ✅ All dependencies are well-maintained
- ✅ Dependency count <15
- ✅ All dependencies have permissive licenses

---

## 6. Constraints

### 6.1 Technical Constraints

1. **Platform:** Must run on Linux/macOS/Windows
2. **Python Version:** 3.10 or higher
3. **Internet:** Requires stable internet connection
4. **Disk Space:** Requires ~1 GB minimum
5. **LinkedIn Account:** Requires active LinkedIn account

### 6.2 Business Constraints

1. **Budget:** Zero budget for paid services
2. **Timeline:** 6 weeks for full implementation
3. **Resources:** Single developer
4. **Support:** No 24/7 support needed

### 6.3 Legal Constraints

1. **LinkedIn ToS:** Must comply with LinkedIn Terms of Service
2. **Automation Policy:** Must follow LinkedIn automation guidelines
3. **Content Ownership:** All content is original (owned by you)
4. **API Usage:** Must follow LinkedIn API usage policies

---

## 7. Acceptance Criteria (Overall)

The project is considered complete when:

### Core Functionality
- ✅ System posts automatically at 9 AM daily
- ✅ All 6 content types generate correctly
- ✅ Slides match app's visual design exactly
- ✅ Code syntax highlighting works
- ✅ Posts appear on LinkedIn successfully
- ✅ State tracking prevents duplicates

### Quality
- ✅ Zero manual intervention needed
- ✅ 99% uptime achieved
- ✅ Error rate <1%
- ✅ Visual quality approved by you

### Documentation
- ✅ Setup guide complete
- ✅ User guide complete
- ✅ Code documented
- ✅ Troubleshooting guide complete

### Testing
- ✅ Unit tests pass
- ✅ Integration tests pass
- ✅ 1-week dry run successful
- ✅ All edge cases handled

---

## 8. Future Enhancements (Out of Scope)

These features are **NOT** required for initial release:

1. Engagement analytics (tracking likes/comments)
2. Automated replies to comments
3. A/B testing different designs
4. Web-based dashboard
5. Mobile app
6. Multi-user support
7. Posting to other platforms (Twitter, etc.)
8. Content editing interface
9. Preview mode with approval workflow
10. Reposting old content after 88 weeks

---

## 9. Risks & Mitigation

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| LinkedIn API changes | High | Medium | Monitor API, implement adapter pattern |
| Rate limiting | Medium | Low | Respect limits, implement backoff |
| Account suspension | High | Very Low | Follow ToS strictly, avoid spam |
| System downtime | Medium | Low | Monitoring + retry logic |
| Content issues | Low | Very Low | Validate before posting |

---

## 10. Approval

**This requirements document must be approved before development begins.**

**Review Checklist:**
- [ ] Functional requirements are complete
- [ ] Non-functional requirements are realistic
- [ ] Data requirements are clear
- [ ] Integration requirements are feasible
- [ ] Constraints are documented
- [ ] Acceptance criteria are measurable
- [ ] Risks are identified

**Approved By:** _________________________
**Date:** _________________________
**Signature:** _________________________

---

**Document Status:** FINAL - Awaiting Approval
**Next Step:** Create IMPLEMENTATION_PLAN.md
**Questions?** Review with developer before approval.
