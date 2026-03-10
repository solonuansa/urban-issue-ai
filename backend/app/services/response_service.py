"""
Response Service – generates a human-readable response based on report results.
"""

RESPONSE_TEMPLATES = {
    "HIGH": (
        "Your report has been classified as a {severity}-severity {issue_type} "
        "on a main road. Based on priority scoring, this issue is categorized as "
        "HIGH and will be processed within 1–2 days."
    ),
    "MEDIUM": (
        "Your report has been classified as a {severity}-severity {issue_type}. "
        "This issue is categorized as MEDIUM priority and will be processed within 3–5 days."
    ),
    "LOW": (
        "Your report has been classified as a {severity}-severity {issue_type}. "
        "This issue is categorized as LOW priority and will be processed within 7–14 days."
    ),
}


def generate_response(issue_type: str, severity: str, priority_label: str) -> str:
    """
    Generate a dynamic response message for the citizen.

    Args:
        issue_type: "pothole" | "garbage"
        severity: "small" | "medium" | "large"
        priority_label: "LOW" | "MEDIUM" | "HIGH"

    Returns:
        A formatted response string.
    """
    template = RESPONSE_TEMPLATES.get(priority_label, RESPONSE_TEMPLATES["LOW"])
    return template.format(severity=severity, issue_type=issue_type)
