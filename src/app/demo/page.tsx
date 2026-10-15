import DemoChat from "@/components/chat/DemoChat";

export const metadata = {
  title: "Try the document demo",
  description: "Upload your documents and ask Sphinx questions about their contents.",
};

export default function DemoPage() {
  return <DemoChat />;
}
