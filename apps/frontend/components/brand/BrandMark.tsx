type BrandMarkProps = {
  className?: string;
};

export function BrandMark({ className = "h-11 w-11" }: BrandMarkProps) {
  return (
    <svg className={className} viewBox="0 0 128 128" role="img" aria-label="Bep Si F&B">
      <rect width="128" height="128" rx="32" fill="#F7F3EB" />
      <circle cx="94" cy="32" r="18" fill="#08775F" opacity="0.16" />
      <circle cx="31" cy="98" r="22" fill="#FF5A00" opacity="0.14" />
      <path d="M35 45h58l-6 58H41L35 45Z" fill="#FF5A00" />
      <path d="M48 47c0-15 8-25 17-25s17 10 17 25" fill="none" stroke="#08775F" strokeWidth="9" strokeLinecap="round" />
      <path d="M47 57h24c14 0 23 7 23 19 0 7-4 13-10 16 8 3 13 10 13 19 0 14-10 22-26 22H47V57Zm20 30h10c5 0 9-3 9-8s-4-8-9-8H67v16Zm0 32h12c6 0 10-3 10-9s-4-9-10-9H67v18Z" fill="#FFFFFF" transform="translate(-3 -11)" />
      <path d="M36 45h58" stroke="#0B1220" strokeWidth="4" strokeLinecap="round" opacity="0.1" />
    </svg>
  );
}
