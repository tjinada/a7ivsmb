/** The amber aperture mark used on the client page and the OG card. */
export function BrandMark({ size = 18 }: { size?: number }) {
  return (
    <span
      aria-hidden
      className="relative inline-block flex-none rounded-full border-2 border-primary-500"
      style={{ width: size, height: size }}
    >
      <span className="absolute rounded-full bg-primary-500" style={{ inset: Math.round(size * 0.22) }} />
    </span>
  );
}
