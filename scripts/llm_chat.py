import os
import sys
import json
from typing import List, Dict

try:
    from openai import OpenAI
except Exception as exc:  # pragma: no cover
    print(json.dumps({"error": f"openai package missing: {exc}"}))
    sys.exit(0)


def build_prompt(messages: List[Dict[str, str]]) -> str:
    user_messages = [m.get("content", "") for m in messages if m.get("role") == "user"]
    if not user_messages:
        return "You are a helpful assistant for the Sphinx website. Answer the user's question briefly."
    latest = user_messages[-1]
    return (
        "You are a helpful assistant for the Sphinx website. "
        f"Answer the user's latest question clearly and briefly.\n\nUser: {latest}"
    )


def main() -> None:
    raw = sys.stdin.read().strip()
    if not raw:
        print(json.dumps({"reply": "I didn't receive a message."}))
        return

    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        print(json.dumps({"reply": "I couldn't read that request."}))
        return

    messages = payload.get("messages", [])
    if not isinstance(messages, list):
        print(json.dumps({"reply": "Invalid message format."}))
        return

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        print(json.dumps({"reply": "OpenAI API key is not configured."}))
        return

    client = OpenAI(api_key=api_key)
    try:
        response = client.responses.create(
            model="gpt-4.1-mini",
            input=build_prompt(messages),
            temperature=0.3,
        )
        reply = response.output_text.strip() if getattr(response, "output_text", "") else "I couldn't generate a response."
    except Exception as exc:
        reply = f"I hit a snag reaching the LLM: {exc}"

    print(json.dumps({"reply": reply}))


if __name__ == "__main__":
    main()
