import { Target, Flag, FileText, CheckCircle2, Link2, ArrowRight } from 'lucide-react';
import type { PhaseTableData, ParsedPhaseDescription } from '@/features/roadmap/types';

function parseTableRow(line: string): string[] {
  let l = line.trim();
  if (l.startsWith('|')) l = l.slice(1);
  if (l.endsWith('|')) l = l.slice(0, -1);
  return l.split('|').map((s) => s.trim());
}

function isTableSeparator(line: string): boolean {
  const l = line.trim();
  if (!l.includes('|') || !l.includes('-')) return false;
  // e.g. "|---|---|" or "| :--- | ---: |"
  return /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?$/.test(l);
}

// Parse ROADMAP.md phase description into structured fields.
// Handles: **Goal**, **Depends on**, **Requirements**, **Success Criteria**, **Plans**,
// **Execution Order**, and markdown tables anywhere in the description.
function parsePhaseDescription(raw: string | null | undefined): ParsedPhaseDescription {
  const result: ParsedPhaseDescription = {
    goal: '',
    dependsOn: '',
    requirements: [],
    successCriteria: [],
    plans: [],
    executionOrder: '',
    tables: [],
    other: [],
  };
  if (!raw) return result;

  const splitCsv = (v: string): string[] =>
    v
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

  const lines = raw.split('\n');
  let i = 0;
  let section: string | null = null;

  while (i < lines.length) {
    const rawLine = lines[i] ?? '';
    const line = rawLine.trim();
    if (!line) {
      i++;
      continue;
    }

    // Markdown table: header row | separator | body rows
    if (line.startsWith('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1] ?? '')) {
      const headers = parseTableRow(line);
      const rows = [];
      i += 2;
      while (i < lines.length) {
        const rowLine = lines[i];
        if (!rowLine || !rowLine.trim().startsWith('|') || isTableSeparator(rowLine)) break;
        rows.push(parseTableRow(rowLine));
        i++;
      }
      result.tables.push({ headers, rows });
      continue;
    }

    // **Label** (optional parens): value
    const m = line.match(/^\*\*([^*]+)\*\*(?:\s*\([^)]*\))?\s*:?\s*(.*)$/);
    if (m) {
      const label = (m[1] ?? '').toLowerCase().trim();
      const value = (m[2] ?? '').trim();
      if (label === 'goal') {
        result.goal = value;
        section = 'goal';
      } else if (label === 'depends on' || label === 'dependencies' || label === 'depends') {
        result.dependsOn = value;
        section = 'dependsOn';
      } else if (label === 'requirements' || label === 'required') {
        result.requirements = splitCsv(value);
        section = 'requirements';
      } else if (label === 'success criteria' || label === 'acceptance criteria') {
        if (value) result.successCriteria.push(value);
        section = 'successCriteria';
      } else if (label === 'plans' || label === 'plan') {
        result.plans = splitCsv(value);
        section = 'plans';
      } else if (label === 'execution order' || label === 'execution') {
        result.executionOrder = value;
        section = 'executionOrder';
      } else {
        section = 'other';
        result.other.push(line);
      }
      i++;
      continue;
    }

    // Numbered list (1. ...) — success criteria items
    const numbered = line.match(/^\d+\.\s+(.+)$/);
    if (numbered?.[1] && section === 'successCriteria') {
      result.successCriteria.push(numbered[1].trim());
      i++;
      continue;
    }

    // Bullet list
    const bullet = line.match(/^[-*]\s+(.+)$/);
    if (bullet?.[1] && section === 'successCriteria') {
      result.successCriteria.push(bullet[1].trim());
      i++;
      continue;
    }

    // Continuation — append to current section
    if (section === 'goal') {
      result.goal = (result.goal + ' ' + line).trim();
    } else if (section === 'dependsOn') {
      result.dependsOn = (result.dependsOn + ' ' + line).trim();
    } else if (section === 'executionOrder') {
      result.executionOrder = (result.executionOrder + ' ' + line).trim();
    } else {
      result.other.push(line);
    }
    i++;
  }

  return result;
}

function PhaseTable({ table }: { table: PhaseTableData }) {
  if (!table.headers.length) return null;
  return (
    <div className="overflow-x-auto rounded-lg border border-surface-700/40">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="bg-surface-800/60">
            {table.headers.map((h, i) => (
              <th
                key={i}
                className="px-2.5 py-1.5 text-left font-semibold text-surface-300 border-b border-surface-700/40"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, ri) => (
            <tr key={ri} className="odd:bg-surface-900/40 even:bg-surface-800/20">
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  className={`px-2.5 py-1.5 text-surface-400 border-b border-surface-700/20 ${ci === 0 ? 'text-surface-300 font-medium' : ''}`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PhaseDescription({ description }: { description?: string }) {
  if (!description) return null;
  const p = parsePhaseDescription(description);
  const hasStructured =
    p.goal ||
    p.dependsOn ||
    p.requirements.length ||
    p.successCriteria.length ||
    p.plans.length ||
    p.executionOrder ||
    p.tables.length;

  if (!hasStructured) {
    return <p className="text-xs text-surface-500 mt-2 pl-7 whitespace-pre-wrap">{description}</p>;
  }

  return (
    <div className="pl-7 mt-2 space-y-2.5">
      {p.goal && (
        <div className="flex items-start gap-2">
          <Target size={12} className="text-claude mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <div className="text-[9px] font-semibold text-claude uppercase tracking-wider mb-0.5">Goal</div>
            <p className="text-xs text-surface-300 leading-relaxed">{p.goal}</p>
          </div>
        </div>
      )}

      {p.dependsOn && (
        <div className="flex items-start gap-2">
          <Link2 size={12} className="text-surface-500 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <div className="text-[9px] font-semibold text-surface-500 uppercase tracking-wider mb-0.5">Depends on</div>
            <p className="text-xs text-surface-400">{p.dependsOn}</p>
          </div>
        </div>
      )}

      {p.requirements.length > 0 && (
        <div className="flex items-start gap-2">
          <Flag size={12} className="text-blue-400 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <div className="text-[9px] font-semibold text-blue-400 uppercase tracking-wider mb-1">
              Requirements ({p.requirements.length})
            </div>
            <div className="flex flex-wrap gap-1">
              {p.requirements.map((r, i) => (
                <span
                  key={i}
                  className="text-[10px] px-1.5 py-0.5 bg-blue-500/10 text-blue-300 border border-blue-500/20 rounded font-mono"
                >
                  {r}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {p.successCriteria.length > 0 && (
        <div className="flex items-start gap-2">
          <CheckCircle2 size={12} className="text-emerald-400 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <div className="text-[9px] font-semibold text-emerald-400 uppercase tracking-wider mb-1">
              Success Criteria ({p.successCriteria.length})
            </div>
            <ol className="space-y-1">
              {p.successCriteria.map((c, i) => (
                <li key={i} className="text-xs text-surface-400 flex gap-2 leading-relaxed">
                  <span className="text-surface-600 font-mono flex-shrink-0 select-none">{i + 1}.</span>
                  <span>{c}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}

      {p.plans.length > 0 && (
        <div className="flex items-start gap-2">
          <FileText size={12} className="text-surface-500 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <div className="text-[9px] font-semibold text-surface-500 uppercase tracking-wider mb-1">
              Plans ({p.plans.length})
            </div>
            <div className="flex flex-wrap gap-1">
              {p.plans.map((pl, i) => (
                <span
                  key={i}
                  className="text-[10px] px-1.5 py-0.5 bg-surface-800 text-surface-300 border border-surface-700/50 rounded font-mono"
                >
                  {pl}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {(p.executionOrder || p.tables.length > 0) && (
        <div className="flex items-start gap-2">
          <ArrowRight size={12} className="text-violet-400 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0 space-y-2">
            <div className="text-[9px] font-semibold text-violet-400 uppercase tracking-wider">Execution Order</div>
            {p.executionOrder && <p className="text-xs text-surface-400 leading-relaxed">{p.executionOrder}</p>}
            {p.tables.map((t, i) => (
              <PhaseTable key={i} table={t} />
            ))}
          </div>
        </div>
      )}

      {p.other.length > 0 && (
        <p className="text-[11px] text-surface-500 whitespace-pre-wrap leading-relaxed">{p.other.join('\n')}</p>
      )}
    </div>
  );
}
