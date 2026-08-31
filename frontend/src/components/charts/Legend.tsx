/** Two or more series always get a legend; the key mirrors the mark. */
export function Legend({
  items,
}: {
  items: { label: string; color: string; area?: boolean }[];
}) {
  return (
    <ul className="flex flex-wrap items-center gap-4">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-2 text-sm text-ink-2">
          <span
            aria-hidden
            style={{
              background: item.color,
              width: 12,
              height: item.area ? 9 : 2,
              opacity: item.area ? 0.35 : 1,
              borderRadius: item.area ? 2 : 999,
            }}
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
