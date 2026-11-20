# Design Specification - LinkedIn Content Automation

> **Superseded: original plan (March 2026), kept for history.** The live system is different:
> 2 posts a day (11:30 and 23:00 JST), triggered by cron-job.org, posted by GitHub Actions.
> See [`bot/README.md`](bot/README.md) (posting, schedule, controls) and
> [`generator/SPEC.md`](generator/SPEC.md) (building posts).

**Document Version:** 1.0
**Date:** March 27, 2026
**Status:** Draft - Awaiting Approval

---

## 1. Design Philosophy

**Goal:** Create carousel slides that are visually identical to your C++ Master Pro app, making every slide instantly recognizable as part of your brand.

**Principles:**
- Professional, clean layout
- App-identical visual design
- Syntax-highlighted code blocks
- Maximum readability on all devices
- Consistent branding across all content

---

## 2. Visual Design System

### 2.1 Color Palette

**From Your C++ Master Pro App:**

```
Primary Colors:
├── Blue (Primary):    #3b82f6
├── Green (Success):   #10b981
├── Orange (Warning):  #f59e0b
├── Red (Error):       #ef4444
├── Purple (Accent):   #8b5cf6
└── Teal (Info):       #14b8a6

Backgrounds:
├── White:             #ffffff
├── Light Gray:        #f3f4f6
└── Dark (code):       #1e293b

Text:
├── Primary:           #1f2937
├── Secondary:         #6b7280
└── Light:             #ffffff
```

### 2.2 Typography

```
Headers:
├── Font:  Inter, system fonts
├── H1:    32px, Bold (700)
├── H2:    24px, Bold (700)
└── H3:    20px, SemiBold (600)

Body:
├── Regular: 16px, Normal (400)
├── Small:   14px, Normal (400)
└── Line height: 1.6

Code:
├── Font: 'Fira Code', 'Courier New', monospace
├── Size: 14px
└── Weight: Regular (400)
```

### 2.3 Layout Grid

- **Slide Dimensions:** 1080×1080 pixels (LinkedIn carousel standard)
- **Outer margin:** 60px
- **Content padding:** 40px
- **Section spacing:** 24px
- **Border radius:** 12px (for cards)
- **Shadow:** 0 4px 6px rgba(0, 0, 0, 0.1)

---

## 3. Content-Type Templates

### 3.1 Theory Section (Monday) - Blue Theme

**Slides:** 8-10
**Color:** Blue (#3b82f6)
**Icon:** 📚

**Structure:**
1. **Title Slide**
   - Blue gradient header
   - Large icon (96px)
   - Topic name (32px bold)
   - Key learning points (3-4 bullets)
   - "Swipe for concepts →"

2. **Content Slides (6-8)**
   - Mini header with day/week info
   - Concept title with icon
   - Explanatory text (16px, line-height 1.6)
   - Callout boxes (light gray background)
   - Bullet points with green checkmarks

3. **Summary Slide**
   - Key takeaways (3-4 numbered points)
   - Tomorrow's preview
   - Hashtags

---

### 3.2 Edge Cases (Tuesday) - Orange Theme

**Slides:** 5-7
**Color:** Orange (#f59e0b)
**Icon:** ⚠️

**Structure:**
1. **Title Slide**
   - Orange gradient header
   - Warning icon
   - "Watch out for:" list

2. **Edge Case Slides (3-5)**
   - Problem description (red box)
   - ❌ Wrong code example (red background)
   - ✅ Correct code example (green background)

3. **Summary Slide**
   - Critical pitfalls list
   - Tomorrow's preview

---

### 3.3 Code Examples (Wednesday) - Purple Theme

**Slides:** 10-12
**Color:** Purple (#8b5cf6)
**Icon:** 💻

**Structure:**
1. **Title Slide**
   - Purple gradient header
   - Code-focused design

2. **Example Slides (8-10)**
   - Example title
   - Brief explanation
   - Code block with syntax highlighting
   - Key insight box

3. **Summary Slide**
   - Patterns covered
   - Tomorrow's preview

---

### 3.4 Practice Tasks (Thursday) - Green Theme

**Slides:** 7-9 (task + solution pairs)
**Color:** Green (#10b981)
**Icon:** ✏️

**Structure:**
1. **Title Slide**
   - Green gradient header
   - Challenge-focused

2. **Task Slides (pairs)**
   - Slide A: Task description, code template, hint
   - Slide B: Solution code, explanation, key takeaway

3. **Summary Slide**
   - Skills practiced
   - Tomorrow's preview

---

### 3.5 Interview Q&A (Friday) - Red Theme

**Slides:** 8-10 (question + answer pairs)
**Color:** Red (#ef4444)
**Icon:** 🎤

**Structure:**
1. **Title Slide**
   - Red gradient header
   - Interview preparation focus

2. **Q&A Slides (pairs)**
   - Slide A: Question, difficulty level, interview tip
   - Slide B: Structured answer, key points, bonus tip

3. **Summary Slide**
   - Questions covered
   - Pro tips
   - Next content preview

---

### 3.6 Quick Reference (Saturday) - Teal Theme

**Slides:** 3-5
**Color:** Teal (#14b8a6)
**Icon:** 📋

**Structure:**
1. **Title Slide**
   - Teal gradient header
   - Cheat sheet focus

2. **Reference Slides (1-3)**
   - Compact syntax reference
   - Comparison tables
   - Do's and don'ts

3. **Week Summary Slide**
   - Week completion celebration
   - What was learned
   - Next week preview

---

## 4. Code Syntax Highlighting

### 4.1 Color Scheme for C++

```cpp
// Comments          →  #6b7280 (gray)
#include <iostream>  // Preprocessor  →  #8b5cf6 (purple)
std::unique_ptr      // Std namespace →  #3b82f6 (blue)
int, void, class     // Keywords      →  #8b5cf6 (purple)
"Hello World"        // Strings       →  #10b981 (green)
42, 3.14             // Numbers       →  #f59e0b (orange)
MyClass              // Types/Classes →  #ef4444 (red)
```

### 4.2 Implementation

**Use Prism.js or Highlight.js** in HTML templates:

```html
<link rel="stylesheet" href="prism-cpp-theme.css">
<pre><code class="language-cpp">
#include <memory>
std::unique_ptr<int> ptr = std::make_unique<int>(42);
</code></pre>
<script src="prism.js"></script>
```

---

## 5. Template Components

### 5.1 Header Component

```
┌─────────────────────────────────────────┐
│  [Icon] C++ Weekly Learning             │
│  Week X | Day Y/6                       │
└─────────────────────────────────────────┘
```

- Background: Gradient matching content type
- Height: 100px
- Text: White, 24px bold

---

### 5.2 Content Card Component

```
┌──────────────────────────────────────┐
│  [Icon] Title                        │
│                                      │
│  Content here...                     │
│                                      │
│  • Bullet point 1                    │
│  • Bullet point 2                    │
│                                      │
└──────────────────────────────────────┘
```

- Background: White or light gray
- Border: 1px solid #e5e7eb
- Border radius: 12px
- Padding: 24px
- Shadow: Subtle

---

### 5.3 Code Block Component

```
┌──────────────────────────────────────┐
│  std::unique_ptr<int> ptr;           │
│  ptr = std::make_unique<int>(42);    │
│  // Syntax highlighted               │
└──────────────────────────────────────┘
```

- Background: #1e293b (dark)
- Text: Colored by syntax
- Font: Fira Code, 14px
- Padding: 20px
- Border radius: 8px

---

### 5.4 Footer Component

```
┌─────────────────────────────────────────┐
│                                [X/Y]    │
│  C++ Master Pro                         │
└─────────────────────────────────────────┘
```

- Height: 60px
- Background: Light gray or white
- Slide counter: Right-aligned
- Brand name: Left-aligned

---

## 6. Responsive Design

**All slides are 1080×1080**, but design principles ensure readability:

- **Minimum font size:** 14px
- **Maximum text width:** 900px
- **Adequate spacing:** 24px between elements
- **High contrast:** WCAG AA compliant

---

## 7. Brand Consistency

### 7.1 Logo Placement
- Bottom left of every slide
- Size: 120px width
- Format: PNG with transparency

### 7.2 Color Usage
- Each content type has primary color
- Accent colors used sparingly
- Consistent with app's color scheme

### 7.3 Icons
- Emoji-based icons (universally recognized)
- Consistent per content type
- 96px on title slides, 32px elsewhere

---

## 8. Caption Design

### 8.1 Format

```
[Emoji] Day X/6: [Content Type]

[2-3 sentence introduction about today's content.
Brief, engaging, informative.]

✓ Key point 1
✓ Key point 2
✓ Key point 3

[Call to action or next day preview]

#cpp #cplusplus #programming #relevantTag1 #relevantTag2
```

### 8.2 Guidelines

- **Length:** 500-1,000 characters
- **Tone:** Professional but approachable
- **Hashtags:** 5-7 relevant tags
- **Emoji:** One at start, sparingly in body
- **Line breaks:** Use for readability

---

## 9. Technical Implementation

### 9.1 HTML Template Structure

```html
<!DOCTYPE html>
<html>
<head>
    <link rel="stylesheet" href="styles.css">
    <link rel="stylesheet" href="prism.css">
</head>
<body>
    <div class="slide">
        <header class="slide-header {{theme}}">
            <!-- Header content -->
        </header>
        <main class="slide-content">
            <!-- Main content -->
        </main>
        <footer class="slide-footer">
            <!-- Footer content -->
        </footer>
    </div>
    <script src="prism.js"></script>
</body>
</html>
```

### 9.2 CSS Approach

- Use CSS Grid for layout
- CSS Variables for colors (easy theme switching)
- Flexbox for alignment
- System fonts with fallbacks

### 9.3 Image Generation

**Recommended:** html2image library

```python
from html2image import Html2Image

hti = Html2Image(size=(1080, 1080))
hti.screenshot(
    html_file='slide_template.html',
    save_as='slide_01.png'
)
```

**Alternative:** Selenium WebDriver + screenshot

---

## 10. Content Splitting Rules

### 10.1 General Rules

1. **One concept per slide**
   - Don't cram multiple ideas
   - Each slide should stand alone

2. **Code block limits**
   - Maximum 25 lines per code block
   - Split longer code across multiple slides

3. **Text density**
   - Maximum ~500 characters per slide
   - Use bullet points for scannability

4. **Maintain flow**
   - Logical progression between slides
   - Use transitions like "Next, we'll..." or "Now let's..."

### 10.2 Slide Structure

**Every carousel must have:**
1. **Title Slide** (Slide 1)
2. **Content Slides** (Slides 2-N)
3. **Summary Slide** (Final slide)

**Target Counts:**
- Theory: 8-10 total
- Edge Cases: 5-7 total
- Examples: 10-12 total
- Practice: 7-9 total (pairs)
- Q&A: 8-10 total (pairs)
- Quick Ref: 3-5 total

---

## 11. Quality Checklist

Before generating slides, verify:

- ✅ All colors match app's color palette
- ✅ Fonts are consistent and readable
- ✅ Code blocks have proper syntax highlighting
- ✅ Slide count is within target range
- ✅ Content flows logically
- ✅ No orphaned text fragments
- ✅ Brand footer on every slide
- ✅ Slide counter accurate
- ✅ Emojis and icons appropriate
- ✅ No spelling/grammar errors

---

## 12. Sample Output

### Theory Slide Example (Text-based representation)

```
┌─────────────────────────────────────────────────────┐
│  📚 C++ Weekly Learning             Week 3         │
│  Day 1/6                                           │
├─────────────────────────────────────────────────────┤
│                                                     │
│  📌 Concept: Exclusive Ownership                   │
│                                                     │
│  std::unique_ptr provides exclusive ownership      │
│  semantics, meaning only ONE pointer can own       │
│  a resource at any given time.                     │
│                                                     │
│  ┌───────────────────────────────────────────┐    │
│  │ Key Points:                                │    │
│  │                                            │    │
│  │ ✓ Only one owner at a time                │    │
│  │ ✓ Cannot be copied                        │    │
│  │ ✓ Can be moved with std::move             │    │
│  │ ✓ Automatically deletes resource          │    │
│  └───────────────────────────────────────────┘    │
│                                                     │
│  💡 Like a house key - only one person can        │
│  hold it at a time.                                │
│                                                     │
│                                            [2/10]   │
│  C++ Master Pro                                    │
└─────────────────────────────────────────────────────┘
```

---

## 13. Design Approval Process

**Before implementation:**

1. **Review this spec** - Ensure colors, fonts, layouts match your vision
2. **Create mockups** - Generate 2-3 sample slides
3. **Get your approval** - Confirm designs before coding
4. **Iterate** - Make adjustments based on feedback
5. **Finalize** - Lock design for implementation

---

## 14. Design Assets Needed

- [ ] C++ Master Pro logo (PNG, transparent background)
- [ ] Color palette confirmation from your app
- [ ] Font files (Inter, Fira Code) or CDN links
- [ ] Icon set (emojis are sufficient)
- [ ] Example slide approval

---

## 15. Accessibility Considerations

- **Color contrast:** All text meets WCAG AA (4.5:1 ratio)
- **Font size:** Minimum 14px for readability
- **Alt text:** Carousel posts include descriptive captions
- **Color-blind friendly:** Don't rely solely on color to convey information

---

**Status:** Draft - Awaiting Your Review and Approval
**Next Step:** Create HTML/CSS templates based on this spec
**Questions:** Review and provide feedback
