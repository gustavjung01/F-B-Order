type BrandLogoProps = {
  className?: string;
};

export function BrandLogo({ className = "h-14 w-auto" }: BrandLogoProps) {
  return (
    <img
      src="/brand/logo.png"
      alt="Bep Si F&B"
      className={`${className} object-contain mix-blend-multiply`}
      draggable={false}
    />
  );
}
