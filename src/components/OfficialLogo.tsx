export function OfficialLogo({
  className = "",
  decorative = false,
}: {
  className?: string;
  decorative?: boolean;
}) {
  return (
    <img
      src={`${import.meta.env.BASE_URL}brand/mark.svg`}
      alt={decorative ? "" : "Logo oficial cbsHUB"}
      aria-hidden={decorative || undefined}
      draggable={false}
      className={`object-contain shrink-0 ${className}`}
      style={{ width: 20, height: 20 }}
    />
  );
}
