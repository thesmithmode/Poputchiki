import termsRaw from "../../assets/legal/terms-of-service.md?raw";
import { parseMarkdown } from "../../lib/parseMarkdown";

interface Props {
  _content?: string;
}

export function TermsScreen({ _content }: Props) {
  const content = _content ?? termsRaw;
  return (
    <div data-testid="terms-screen" className="max-w-2xl mx-auto px-4 py-6 prose prose-sm">
      {parseMarkdown(content)}
    </div>
  );
}
