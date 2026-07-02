import MDEditor from '@uiw/react-md-editor';

interface Props {
  content?: string | null;
}

export function MarkdownContent({ content }: Props) {
  if (!content) return null;
  const hasMarkdown = /```|^#{1,6}\s|^\*\s|^\-\s|\*\*|__|\[.*\]\(.*\)|^\d+\.\s/m.test(content);
  if (!hasMarkdown) {
    return <p className="text-xs text-surface-400 whitespace-pre-wrap leading-relaxed">{content}</p>;
  }
  return (
    <div data-color-mode="dark" className="md-preview-compact">
      <MDEditor.Markdown
        source={content}
        style={{ backgroundColor: 'transparent', color: '#a8a29e', fontSize: '12px', lineHeight: '1.6' }}
      />
    </div>
  );
}
