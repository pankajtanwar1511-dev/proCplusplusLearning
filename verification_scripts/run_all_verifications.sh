#!/bin/bash
# Master Verification Script - Run All 4 Verification Checks
#
# This script runs all verification checks to ensure content integrity
# after any markdown or JSON changes.
#
# Usage: ./run_all_verifications.sh
#        ./run_all_verifications.sh --verbose    (show full output)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERBOSE=false

if [[ "$1" == "--verbose" ]]; then
    VERBOSE=true
fi

echo "======================================================================================================"
echo "C++ PRO LEARNING PLATFORM - COMPREHENSIVE VERIFICATION"
echo "======================================================================================================"
echo ""
echo "Running 4-Point Verification System..."
echo ""

TOTAL_CHECKS=4
PASSED_CHECKS=0
FAILED_CHECKS=0

# Function to run a check and capture results
run_check() {
    local check_num=$1
    local check_name=$2
    local script_name=$3
    local success_pattern=$4

    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "CHECK #$check_num: $check_name"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    # Run the script and capture output
    output=$(python3 "$SCRIPT_DIR/$script_name" 2>&1)
    exit_code=$?

    # Check if verification passed
    if echo "$output" | grep -q "$success_pattern"; then
        echo "✅ PASSED"
        PASSED_CHECKS=$((PASSED_CHECKS + 1))

        # Show summary line
        if [[ "$VERBOSE" == "true" ]]; then
            echo "$output"
        else
            # Extract and show just the summary
            echo "$output" | grep -A 5 "SUMMARY" | tail -6
        fi
    else
        echo "❌ FAILED"
        FAILED_CHECKS=$((FAILED_CHECKS + 1))

        # Always show full output for failures
        echo "$output"
    fi

    echo ""
}

# Run all 4 checks
run_check 1 "Section Completeness" "verify_section_completeness.py" "Topics with all 6 sections: 88/88"
run_check 2 "Count Accuracy" "verify_counts.py" "ALL COUNTS MATCH PERFECTLY"
run_check 3 "Random Sampling" "verify_random_sampling.py" "ALL SAMPLED TOPICS HAVE PERFECT CONTENT MATCH"
run_check 4 "Critical Content Preservation" "verify_critical_content.py" "ALL CRITICAL CONTENT PRESERVED"

# Final summary
echo "======================================================================================================"
echo "FINAL RESULTS"
echo "======================================================================================================"
echo ""
echo "Total Checks:  $TOTAL_CHECKS"
echo "Passed:        $PASSED_CHECKS ✅"
echo "Failed:        $FAILED_CHECKS $([ $FAILED_CHECKS -gt 0 ] && echo '❌' || echo '')"
echo ""

if [[ $FAILED_CHECKS -eq 0 ]]; then
    echo "🎉 ALL VERIFICATIONS PASSED - CONTENT IS 100% VERIFIED!"
    echo ""
    echo "Safe to:"
    echo "  • Commit changes"
    echo "  • Deploy to production"
    echo "  • Generate new JSON"
    echo ""
    exit 0
else
    echo "⚠️  SOME VERIFICATIONS FAILED - PLEASE FIX ISSUES BEFORE COMMITTING"
    echo ""
    echo "Action required:"
    echo "  • Review failed checks above"
    echo "  • Fix markdown formatting issues"
    echo "  • Re-run: ./run_all_verifications.sh"
    echo ""
    exit 1
fi
