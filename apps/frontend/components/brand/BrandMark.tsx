type BrandMarkProps = {
  className?: string;
};

export function BrandMark({ className: _className = "" }: BrandMarkProps) {
  return (
    <img
      src="/brand/logo.webp"
      alt="Bep Si F&B"
      className="h-[54px] w-auto max-w-[160px] shrink-0 object-contain"
      draggable={false}
    />
  );
}
