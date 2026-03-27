#!/usr/bin/env bash
#
# Rename MD files in chapters 4-10 to use topic_ prefix
#
# Current naming: 01_name.md, 1_name.md, 2_name.md
# New naming:     topic_1.md, topic_2.md, topic_3.md
#

set -e

# Process each chapter
for chapter_dir in data/chapter_{4..10}_*/; do
    echo "Processing $chapter_dir..."

    # Counter for topic number
    topic_num=1

    # Process files in sorted order (by original filename)
    for file in $(ls -1 "$chapter_dir"*.md 2>/dev/null | sort -V); do
        # Skip if already renamed
        if [[ "$(basename "$file")" == topic_*.md ]]; then
            echo "  Skipping $(basename "$file") - already renamed"
            continue
        fi

        # Get directory and basename
        dir=$(dirname "$file")
        old_name=$(basename "$file")
        new_name="topic_${topic_num}.md"

        echo "  Renaming: $old_name → $new_name"
        git mv "$file" "${dir}/${new_name}"

        ((topic_num++))
    done

    echo "  Renamed $((topic_num-1)) files in $chapter_dir"
    echo
done

echo "✅ Renaming complete!"
echo "Next steps:"
echo "  1. Run: python3 split_md_files.py --all"
echo "  2. Run: cd processed_data/scripts && python3 markdown_to_json.py"
