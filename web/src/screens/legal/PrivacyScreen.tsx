import privacyRaw from "../../assets/legal/privacy-policy.md?raw";
import { parseMarkdown } from "../../lib/parseMarkdown";

interface Props {
  _content?: string;
}

export function PrivacyScreen({ _content }: Props) {
  const content = _content ?? privacyRaw;
  return (
    <div data-testid="privacy-screen" className="max-w-2xl mx-auto px-4 py-6 prose prose-sm">
      {parseMarkdown(content)}
    </div>
  );
}
