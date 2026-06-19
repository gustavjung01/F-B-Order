type BrandLogoProps = {
  className?: string;
};

export function BrandLogo({ className = "h-14 w-auto" }: BrandLogoProps) {
  return (
    <img
      src="/brand/logo.webp"
      alt="Bep Si F&B"
      className={className}
      draggable={false}
    />
  );
}
