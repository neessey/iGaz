/** Affiche une valeur de lib/legal.ts, ou un repère « à compléter » bien visible tant qu'elle manque. */
export function Fill({ value, label }: { value: string | null; label: string }) {
  return value ? <>{value}</> : <span className="todo">[{label} à compléter]</span>;
}
