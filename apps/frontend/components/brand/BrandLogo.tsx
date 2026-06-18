type BrandLogoProps = {
  className?: string;
};

export function BrandLogo({ className = "h-14 w-auto" }: BrandLogoProps) {
  return (
    <img
      src="/brand/logo.svg"
      alt="Bếp Sỉ F&B - Nguồn hàng cho quán"
      className={className}
      draggable={false}
    />
  );
}
