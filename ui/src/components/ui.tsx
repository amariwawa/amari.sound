import type { ReactNode } from 'react';

/** `// label` section heading in code-comment style. */
export const Label = ({ children, right }: { children: ReactNode; right?: ReactNode }) => (
  <div className="mb-1.5 flex items-baseline justify-between text-[10px] lowercase tracking-[0.08em]">
    <span className="text-white/45">
      <span className="text-white/20">// </span>
      {children}
    </span>
    {right}
  </div>
);

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  disabled,
  render = (v) => String(v),
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
  render?: (v: T) => ReactNode;
}) {
  return (
    <div
      className={`grid gap-px overflow-hidden rounded-[4px] border border-white/[0.09] bg-white/[0.06] ${disabled ? 'opacity-40' : ''}`}
      style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}
    >
      {options.map((o) => {
        const on = o === value;
        return (
          <button
            key={String(o)}
            disabled={disabled}
            onClick={() => onChange(o)}
            className={`h-[26px] text-[12px] transition-colors disabled:cursor-not-allowed ${
              on
                ? 'bg-white text-black font-semibold shadow-[0_0_14px_rgba(255,255,255,0.35)]'
                : 'bg-ash-900 text-white/50 hover:bg-ash-700 hover:text-white'
            }`}
          >
            {render(o)}
          </button>
        );
      })}
    </div>
  );
}
