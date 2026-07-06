#!/usr/bin/env bash
#
# manage.sh — single entry point for the C++ Pro Learning Platform.
#
# This is a thin dispatcher: every command delegates to an existing worker
# script (markdown_to_json.py, run_all_verifications.sh, START_APP.sh, ...).
# Nothing is duplicated here, and each worker stays independently runnable.
#
# Usage:
#   ./manage.sh check [N]            build (C++) + verify — the standard workflow
#   ./manage.sh build [N]            regenerate C++ JSON (all chapters, or chapter N)
#   ./manage.sh build:ros2 [N]       regenerate ROS2 JSON (all, or chapter N)
#   ./manage.sh verify [--verbose]   run the 4-point verification suite
#   ./manage.sh app <start|stop|restart|kill>
#   ./manage.sh deploy               run the deployment setup
#   ./manage.sh help
#
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPTS="$ROOT/processed_data/scripts"
VERIFY="$ROOT/verification_scripts"
APP="$ROOT/app"

usage() {
    # Print the header comment block (everything after the shebang up to the
    # first non-comment line), stripping the leading "# ".
    awk 'NR==1 {next} /^#/ {sub(/^# ?/, ""); print; next} {exit}' "${BASH_SOURCE[0]}"
}

build() {            # build [N]
    cd "$SCRIPTS"
    if [ "$#" -gt 0 ]; then python3 markdown_to_json.py --chapter "$1"
    else                    python3 markdown_to_json.py; fi
}

build_ros2() {       # build:ros2 [N]
    cd "$SCRIPTS"
    if [ "$#" -gt 0 ]; then python3 markdown_to_json_ros2.py --chapter "$1"
    else                    python3 markdown_to_json_ros2.py; fi
}

verify() {           # verify [--verbose]
    cd "$VERIFY"
    ./run_all_verifications.sh "$@"
}

check() {            # check [N] — mandatory workflow: regenerate then verify
    build "$@" && verify
}

app() {              # app start|stop|restart|kill
    cd "$APP"
    case "${1:-}" in
        start)   ./START_APP.sh ;;
        stop)    ./STOP_APP.sh ;;
        restart) ./STOP_APP.sh || true; ./START_APP.sh ;;
        kill)    ./KILL_ALL.sh ;;
        *) echo "usage: ./manage.sh app <start|stop|restart|kill>"; exit 1 ;;
    esac
}

deploy() { cd "$ROOT"; ./DEPLOY.sh "$@"; }

cmd="${1:-help}"; shift || true
case "$cmd" in
    build)          build "$@" ;;
    build:ros2)     build_ros2 "$@" ;;
    verify)         verify "$@" ;;
    check)          check "$@" ;;
    app)            app "$@" ;;
    deploy)         deploy "$@" ;;
    help|-h|--help) usage ;;
    *) echo "Unknown command: $cmd"; echo; usage; exit 1 ;;
esac
