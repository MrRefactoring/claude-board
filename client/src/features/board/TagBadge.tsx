import { Hash } from 'lucide-react';
import { getTagColor } from '@/lib/constants';

type TagSize = 'xs' | 'sm';

interface TagBadgeProps {
  tag: string;
  size?: TagSize;
  onClick?: () => void;
  className?: string;
}

export default function TagBadge({ tag, size = 'sm', onClick, className = '' }: TagBadgeProps) {
  const color = getTagColor(tag);
  const isPlan = tag.startsWith('plan:');
  const sizeClass = size === 'xs' ? 'text-[8px] px-1 py-0' : 'text-[9px] px-1.5 py-0.5';

  return (
    <span
      onClick={onClick}
      className={`inline-flex items-center gap-0.5 rounded font-medium ${sizeClass} ${color} ${onClick ? 'cursor-pointer hover:brightness-125' : ''} ${className}`}
    >
      {isPlan ? <Hash size={size === 'xs' ? 7 : 8} /> : null}
      {tag}
    </span>
  );
}

export function parseTags(tagsField?: string | string[] | null): string[] {
  if (!tagsField) return [];
  if (Array.isArray(tagsField)) return tagsField;
  try {
    return JSON.parse(tagsField);
  } catch {
    return [];
  }
}

interface TagListProps {
  tags?: string | string[] | null;
  max?: number;
  size?: TagSize;
  onTagClick?: (tag: string) => void;
}

export function TagList({ tags, max = 3, size = 'sm', onTagClick }: TagListProps) {
  const parsed = parseTags(tags);
  if (parsed.length === 0) return null;
  const shown = parsed.slice(0, max);
  const extra = parsed.length - max;
  return (
    <span className="inline-flex items-center gap-0.5 flex-wrap">
      {shown.map((tag) => (
        <TagBadge key={tag} tag={tag} size={size} onClick={onTagClick ? () => onTagClick(tag) : undefined} />
      ))}
      {extra > 0 && <span className="text-[8px] text-surface-600">+{extra}</span>}
    </span>
  );
}
