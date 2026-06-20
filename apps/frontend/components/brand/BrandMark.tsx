type BrandMarkProps = {
  className?: string;
};

export function BrandMark({ className = "h-[54px] w-auto max-w-[160px]" }: BrandMarkProps) {
  return (
    <img
      src="/brand/logo-transparent.svg"
      alt="Bep Si F&B"
      className={`${className} shrink-0 object-contain`}
      draggable={false}
    />
  );
}
