type BrandMarkProps = {
  className?: string;
};

export function BrandMark({ className = "h-11 w-11" }: BrandMarkProps) {
  return (
    <img
      src="/icons/icon.svg"
      alt="Bep Si F&B"
      className={className}
      draggable={false}
    />
  );
}
