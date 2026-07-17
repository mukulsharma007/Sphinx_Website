import { linkify } from "@/lib/linkify";

/* This exact shape is what LLM APIs expect — do not change it lightly. */
export type Message = {
  role: "user" | "assistant";
  content: string;
};

export default function ChatMessage({ message }: { message: Message }) {
  const isUser = message.role === "user";

  return (
    <div
      className={`max-w-[85%] rounded-lg px-3.5 py-2.5 text-sm leading-relaxed ${
        isUser
          ? "ml-auto bg-night text-bone"
          : "mr-auto border border-sand bg-white text-ink"
      }`}
    >
      {isUser ? message.content : linkify(message.content)}
    </div>
  );
}
