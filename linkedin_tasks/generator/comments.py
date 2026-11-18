"""Generic first comment for each post (no per-post bonus questions to maintain).

The answer always lives in the carousel, so the comment only points to it and
invites a reply. A few wordings rotate (picked by post id) so the series does
not repeat the identical comment every day.
"""
import zlib

TEMPLATES = {
    "code_puzzle": [
        "👉 Swipe right for the answer and the fix. Did your reasoning match? Drop your answer below 👇",
        "The answer is on page 3 ➜ Comment your answer first, then compare.",
        "Swipe ➜ for the answer and the common wrong answer. Got it on the first try? Reply below 👇",
    ],
    "concept": [
        "👉 Pick A, B, C or D below, then swipe right to check your answer.",
        "Comment your letter first 👇 then swipe ➜ to see the answer and why the other options are wrong.",
        "Which option did you pick? Reply with the letter, then swipe right for the answer ➜",
    ],
    "theory": [
        "📌 Save this for your next C++ interview. Which myth did you believe? Comment the slide number 👇",
        "Which slide was new to you? Comment the number 👇 and save the post for your interview prep.",
        "The myth busters are near the end ➜ Which one did you believe before reading? Reply below 👇",
    ],
}


def first_comment(post):
    options = TEMPLATES.get(post["type"], TEMPLATES["concept"])
    return options[zlib.crc32(post["id"].encode()) % len(options)]
