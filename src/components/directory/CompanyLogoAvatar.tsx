import React, { useMemo, useState } from 'react';

interface CompanyLogoAvatarProps {
  name: string;
  logoUrl: string | null;
}

export const CompanyLogoAvatar: React.FC<CompanyLogoAvatarProps> = ({
  name,
  logoUrl,
}) => {
  const [imgError, setImgError] = useState(false);

  const initials = useMemo(() => {
    const words = name
      .replace(/[^a-zA-Z0-9\s]/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (words.length === 0) return 'CO';
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return `${words[0][0]}${words[1][0]}`.toUpperCase();
  }, [name]);

  if (logoUrl && !imgError) {
    return (
      <div className="h-8 w-8 rounded-lg border border-slate-200/90 dark:border-slate-800 bg-white flex items-center justify-center overflow-hidden shrink-0">
        <img
          src={logoUrl}
          alt={`${name} logo`}
          referrerPolicy="no-referrer"
          loading="lazy"
          onError={() => setImgError(true)}
          className="h-6 w-6 object-contain"
        />
      </div>
    );
  }

  return (
    <div
      aria-hidden="true"
      className="h-8 w-8 rounded-lg border border-slate-200/90 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-display text-xs font-bold text-slate-700 dark:text-slate-200 shrink-0"
    >
      {initials}
    </div>
  );
};
