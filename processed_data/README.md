# Processed Data - JSON Output & Conversion Scripts

This directory contains the complete JSON learning content and the parsers that generate it from markdown files.

## 📁 Directory Structure

```
processed_data/
├── README.md                      # This file
├── json_output/                   # C++ learning content (20 chapters, 88 topics)
│   ├── master_index.json         # Complete C++ catalog index
│   ├── chapter_1_oops.json
│   ├── chapter_2_mamory_management.json
│   └── ... (20 chapter files)
├── json_output_ros2/              # ROS2 learning content (6 chapters, 31 topics)
│   ├── master_index.json         # Complete ROS2 catalog index
│   ├── chapter_1_fundamentals.json
│   └── ... (6 chapter files)
└── scripts/                       # Conversion tools
    ├── markdown_to_json.py       # C++ content parser
    └── markdown_to_json_ros2.py  # ROS2 content parser
```

## 📊 Content Statistics

### C++ Catalog (`json_output/`)
- **Chapters**: 20 (OOP through Advanced Implementations)
- **Topics**: 88
- **Source**: `data/` directory (markdown files)
- **Size**: ~7.3 MB

### ROS2 Catalog (`json_output_ros2/`)
- **Chapters**: 6 (Fundamentals through Advanced Production)
- **Topics**: 31
- **Source**: `data_ros2/` directory (markdown files)
- **Size**: ~2.0 MB

## 🗂️ JSON Structure

Both catalogs use the same structure:

```json
{
  "chapter_name": "chapter_1_oops",
  "chapter_number": 1,
  "topic_count": 7,
  "topics": [
    {
      "topic": "Topic Title",
      "filename": "topic_1.md",
      "theory": { "subsections": [...], "full_text": "..." },
      "edge_cases": [...],
      "code_examples": [...],
      "interview_qa": [...],
      "practice_tasks": [...],
      "quick_reference": { "content": "...", "tables": [...] }
    }
  ]
}
```

Each topic contains:
- **Theory**: Structured learning content with subsections
- **Edge Cases**: Tricky scenarios with code examples
- **Code Examples**: Practical demonstrations
- **Interview Q&A**: Common interview questions with answers
- **Practice Tasks**: Hands-on exercises
- **Quick Reference**: Summary tables and answer keys

## 🚀 Using the JSON Data

### Load C++ Content
```python
import json

# Load master index
with open('processed_data/json_output/master_index.json', 'r') as f:
    cpp_catalog = json.load(f)

print(f"C++ Chapters: {cpp_catalog['statistics']['total_chapters']}")
print(f"C++ Topics: {cpp_catalog['statistics']['total_topics']}")
```

### Load ROS2 Content
```python
# Load ROS2 master index
with open('processed_data/json_output_ros2/master_index.json', 'r') as f:
    ros2_catalog = json.load(f)

print(f"ROS2 Chapters: {ros2_catalog['statistics']['total_chapters']}")
```

### Search Specific Content
```python
# Find all beginner-level questions
for chapter in cpp_catalog['chapters']:
    for topic in chapter['topics']:
        for qa in topic['interview_qa']:
            if 'beginner' in qa['difficulty']:
                print(f"Q: {qa['question']}")
```

## 🔄 Regenerating JSON from Markdown

### C++ Content
```bash
cd /home/pankaj/cplusplus/proCplusplus/processed_data/scripts

# Process all chapters
python3 markdown_to_json.py

# Process specific chapter
python3 markdown_to_json.py --chapter 1
```

### ROS2 Content
```bash
# Process all ROS2 chapters
python3 markdown_to_json_ros2.py

# Process specific chapter
python3 markdown_to_json_ros2.py --chapter 3
```

## 🎯 Backend Integration

The Flask backend (`app/backend/app_v3.py`) serves both catalogs:

```python
# Dual catalog system
cpp_index_path = 'processed_data/json_output/master_index.json'
ros2_index_path = 'processed_data/json_output_ros2/master_index.json'
```

Users can switch between C++ and ROS2 content in the web interface.

## 📝 Markdown Format Requirements

Both parsers accept flexible markdown formats. Required sections per topic:

1. **THEORY_SECTION** - Core concepts
2. **EDGE_CASES** - Tricky scenarios
3. **CODE_EXAMPLES** - Practical demonstrations
4. **INTERVIEW_QA** - Q&A with difficulty tags
5. **PRACTICE_TASKS** - Hands-on exercises
6. **QUICK_REFERENCE** - Summary tables

**Accepted patterns:**
- Section headers: `### SECTION_NAME:` or `### SECTION_NAME`
- Interview QA: `#### Q1: Question?` or `#### Q1` (question in body)
- Edge cases: `#### Edge Case N: Title`
- Code examples: `#### Example N: Title`

For complete format details, see:
- Parser documentation: Headers in `scripts/markdown_to_json.py` and `scripts/markdown_to_json_ros2.py`
- Format requirements: `../verification_scripts/README.md` (lines 236-307)

## ✅ Content Verification

The 4-point verification system ensures 100% content integrity:

```bash
cd /home/pankaj/cplusplus/proCplusplus/verification_scripts
./run_all_verifications.sh
```

**Verification checks:**
1. **Section Completeness** - All 6 required sections present (88/88 topics)
2. **Count Accuracy** - MD headers match JSON counts (264/264 matches)
3. **Random Sampling** - Deep content verification (10/10 samples)
4. **Critical Content** - C++ patterns preserved (43/43 patterns)

## 🛠️ Parser Details

### `markdown_to_json.py` - C++ Parser
- **Input**: `data/chapter_*/` markdown files
- **Output**: `json_output/` JSON files
- **Features**: Flexible format support, pattern warnings, UTF-8 encoding
- **Usage**: See header documentation in file

### `markdown_to_json_ros2.py` - ROS2 Parser
- **Input**: `data_ros2/chapter_*/` markdown files
- **Output**: `json_output_ros2/` JSON files
- **Features**: Handles both `##` and `###` section headers
- **Usage**: See header documentation in file

Both parsers generate:
- Individual chapter JSON files
- Master index with complete catalog
- Statistics and metadata

## 🔧 Troubleshooting

### JSON parsing errors
```bash
# Validate JSON structure
python3 -m json.tool json_output/chapter_1_oops.json
```

### Missing content after regeneration
1. Check markdown format matches requirements
2. Run verification: `../verification_scripts/run_all_verifications.sh`
3. Check parser output for warnings

### Encoding issues
- All files use UTF-8 encoding
- Always use `encoding='utf-8'` when reading files

## 📈 Application Features

The JSON data supports:

**Learning Modes:**
- **Study Mode**: Theory + Code Examples + Edge Cases
- **Quiz Mode**: Interview Q&A filtered by difficulty
- **Practice Mode**: Hands-on coding exercises
- **Review Mode**: Quick Reference summaries

**Filtering:**
- By difficulty: beginner, intermediate, advanced, expert
- By concept tags: memory, inheritance, polymorphism, etc.
- By chapter/topic
- By catalog (C++ or ROS2)

**Progress Tracking:**
- Mark topics as completed
- Track quiz performance
- Identify weak areas
- Recommend next topics

## 📚 Additional Documentation

- **Verification System**: `../verification_scripts/README.md`
- **Parser Scripts**: Headers in `scripts/markdown_to_json.py` and `scripts/markdown_to_json_ros2.py`
- **Project Overview**: `../README.md` (root)
- **Development Guide**: `../DEVELOPMENT_GUIDE.md` (root)

---

**Last Updated**: March 26, 2026
**Content Version**: 2.0 (Dual catalog system)
**Total Content**: 119 topics across 26 chapters (C++ + ROS2)
