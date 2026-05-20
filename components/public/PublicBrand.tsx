import React from 'react';

interface PublicBrandProps {
  title?: string;
  subtitle?: string;
  tone?: 'default' | 'inverse';
}

export const PublicBrand: React.FC<PublicBrandProps> = ({
  title = 'Philippine Statistics Authority',
  subtitle = 'Aurora Provincial Statistical Office',
  tone = 'default',
}) => {
  const isInverse = tone === 'inverse';
  return (
    <>
      <img
        src="/PSA.webp"
        alt="PSA"
        className={`w-[3.25rem] h-[3.25rem] sm:w-[3.75rem] sm:h-[3.75rem] object-contain shrink-0 ${isInverse ? 'drop-shadow-[0_8px_18px_rgba(2,6,23,0.44)]' : ''}`}
      />
      <div>
        <p className={`font-serif text-sm sm:text-base font-bold leading-tight ${isInverse ? 'text-white' : 'text-psa-navy dark:text-slate-100'}`}>{title}</p>
        <p className={`text-[11px] sm:text-xs tracking-wide uppercase ${isInverse ? 'text-slate-100/90' : 'text-[#475569] dark:text-slate-300'}`}>{subtitle}</p>
      </div>
    </>
  );
};
