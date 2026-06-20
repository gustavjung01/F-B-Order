type BrandMarkProps = {
  className?: string;
};

export function BrandMark({ className = "h-[54px] w-auto max-w-[170px] shrink-0" }: BrandMarkProps) {
  return (
    <img
      src="/brand/logo.png"
      alt="Bep Si F&B"
      className={`${className} object-contain mix-blend-multiply`}
      draggable={false}
    />
  );
}
