import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ArrowRight,
  Building2,
  Globe,
  Link2,
  Loader2,
  MapPin,
  Search,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { GlobalCompanyItem } from '../../types';
import { apiFetch, safeReadJson } from '../../utils/authClient';
import { truncateIndustry20 } from '../../utils/emailFormulas';
import { CompanyLogoAvatar } from '../directory/CompanyLogoAvatar';

interface QuickSearchApiResponse {
  query: string;
  effectiveQuery?: string;
  detectedLinkDomain?: string | null;
  isSocialCompanyLink?: boolean;
  totalMatches: number;
  companies: GlobalCompanyItem[];
  elapsedMs?: number;
}

interface TopBarQuickSearchProps {
  onSelectCompany: (company: GlobalCompanyItem) => void;
  onShowMore: (query: string) => void;
  onDirectDomainLookup: (domain: string) => void;
}

const DOMAIN_OR_URL_PATTERN =
  /^(?:https?:\/\/)?(?:www\.)?([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+)(?:[/?#].*)?$/i;

function detectLocalLinkOrDomain(input: string): string | null {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed || trimmed.includes(' ')) return null;
  const match = trimmed.match(DOMAIN_OR_URL_PATTERN);
  return match ? match[1] : null;
}

function HighlightMatch({
  text,
  query,
}: {
  text: string;
  query: string;
}) {
  const cleanQuery = query
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split(/[/?#]/)[0];
  if (!cleanQuery || !text) return <>{text}</>;

  const lower = text.toLowerCase();
  const idx = lower.indexOf(cleanQuery);
  if (idx === -1) {
    const firstToken = cleanQuery
      .split(/[\s.-]+/)
      .find((tok) => tok.length >= 2 && lower.includes(tok));
    if (!firstToken) return <>{text}</>;
    const tokIdx = lower.indexOf(firstToken);
    return (
      <>
        {text.slice(0, tokIdx)}
        <mark className="bg-lemon-300/65 dark:bg-lemon-400/25 text-petrol-950 dark:text-lemon-200 rounded-[3px] px-0.5 font-semibold">
          {text.slice(tokIdx, tokIdx + firstToken.length)}
        </mark>
        {text.slice(tokIdx + firstToken.length)}
      </>
    );
  }

  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-lemon-300/65 dark:bg-lemon-400/25 text-petrol-950 dark:text-lemon-200 rounded-[3px] px-0.5 font-semibold">
        {text.slice(idx, idx + cleanQuery.length)}
      </mark>
      {text.slice(idx + cleanQuery.length)}
    </>
  );
}

export const TopBarQuickSearch: React.FC<TopBarQuickSearchProps> = ({
  onSelectCompany,
  onShowMore,
  onDirectDomainLookup,
}) => {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<GlobalCompanyItem[]>([]);
  const [totalMatches, setTotalMatches] = useState(0);
  const [effectiveQuery, setEffectiveQuery] = useState('');
  const [detectedLinkDomain, setDetectedLinkDomain] = useState<string | null>(
    null
  );
  const [isSocialCompanyLink, setIsSocialCompanyLink] = useState(false);
  const [hasSearchedQuery, setHasSearchedQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState<number>(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const cacheRef = useRef<
    Map<
      string,
      {
        companies: GlobalCompanyItem[];
        totalMatches: number;
        effectiveQuery: string;
        detectedLinkDomain: string | null;
        isSocialCompanyLink: boolean;
      }
    >
  >(new Map());

  const trimmedQuery = query.trim();
  const localDetectedLink = useMemo(
    () => detectLocalLinkOrDomain(trimmedQuery),
    [trimmedQuery]
  );

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
        setActiveIndex(-1);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  // Global "/" or Cmd/Ctrl+K shortcut to focus Quick Search
  useEffect(() => {
    const handleGlobalKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isEditable =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
        setIsOpen(true);
        return;
      }

      if (!isEditable && e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
      }
    };
    window.addEventListener('keydown', handleGlobalKey);
    return () => window.removeEventListener('keydown', handleGlobalKey);
  }, []);

  // Authenticated debounced auto-suggest fetch (same auth headers & company search engine as Company Name Filter)
  useEffect(() => {
    if (!trimmedQuery) {
      abortRef.current?.abort();
      setResults([]);
      setTotalMatches(0);
      setEffectiveQuery('');
      setDetectedLinkDomain(null);
      setIsSocialCompanyLink(false);
      setHasSearchedQuery('');
      setIsLoading(false);
      setActiveIndex(-1);
      return;
    }

    const cacheKey = trimmedQuery.toLowerCase();
    const cached = cacheRef.current.get(cacheKey);
    if (cached) {
      setResults(cached.companies);
      setTotalMatches(cached.totalMatches);
      setEffectiveQuery(cached.effectiveQuery);
      setDetectedLinkDomain(cached.detectedLinkDomain);
      setIsSocialCompanyLink(cached.isSocialCompanyLink);
      setHasSearchedQuery(trimmedQuery);
      setIsLoading(false);
      setActiveIndex(-1);
      return;
    }

    setIsLoading(true);
    const timer = window.setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await apiFetch(
          `/api/quick-company-search?q=${encodeURIComponent(trimmedQuery)}&limit=4`,
          { signal: controller.signal }
        );
        if (!res.ok) {
          throw new Error(`Quick search failed (${res.status})`);
        }
        const data = await safeReadJson<QuickSearchApiResponse>(
          res,
          'Quick search temporarily unavailable.'
        );
        if (controller.signal.aborted) return;

        const companies = Array.isArray(data.companies)
          ? data.companies.slice(0, 4)
          : [];
        const total = Number(data.totalMatches || companies.length);
        const effQ = data.effectiveQuery || trimmedQuery;
        const linkDom = data.detectedLinkDomain || null;
        const socialLink = Boolean(data.isSocialCompanyLink);

        if (cacheRef.current.size > 150) {
          const oldest = cacheRef.current.keys().next().value;
          if (oldest) cacheRef.current.delete(oldest);
        }
        cacheRef.current.set(cacheKey, {
          companies,
          totalMatches: total,
          effectiveQuery: effQ,
          detectedLinkDomain: linkDom,
          isSocialCompanyLink: socialLink,
        });

        setResults(companies);
        setTotalMatches(total);
        setEffectiveQuery(effQ);
        setDetectedLinkDomain(linkDom);
        setIsSocialCompanyLink(socialLink);
        setHasSearchedQuery(trimmedQuery);
        setActiveIndex(-1);
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return;
        setResults([]);
        setTotalMatches(0);
        setEffectiveQuery(trimmedQuery);
        setDetectedLinkDomain(localDetectedLink);
        setIsSocialCompanyLink(false);
        setHasSearchedQuery(trimmedQuery);
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }, 120);

    return () => {
      window.clearTimeout(timer);
    };
  }, [trimmedQuery, localDetectedLink]);

  const handlePickCompany = useCallback(
    (company: GlobalCompanyItem) => {
      setIsOpen(false);
      setActiveIndex(-1);
      inputRef.current?.blur();
      if (company.id.startsWith('direct-link:') && company.domain) {
        onDirectDomainLookup(company.domain);
        return;
      }
      onSelectCompany(company);
    },
    [onDirectDomainLookup, onSelectCompany]
  );

  const handleTriggerShowMore = useCallback(() => {
    const queryForFilter = (effectiveQuery || trimmedQuery).trim();
    if (!queryForFilter) return;
    setIsOpen(false);
    setActiveIndex(-1);
    inputRef.current?.blur();
    onShowMore(queryForFilter);
  }, [effectiveQuery, onShowMore, trimmedQuery]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      setActiveIndex(-1);
      inputRef.current?.blur();
      return;
    }

    if (!isOpen && trimmedQuery) {
      setIsOpen(true);
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (results.length === 0) return;
      setActiveIndex((prev) => (prev + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (results.length === 0) return;
      setActiveIndex((prev) => (prev <= 0 ? results.length - 1 : prev - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && results[activeIndex]) {
        handlePickCompany(results[activeIndex]);
      } else if (results.length === 1) {
        handlePickCompany(results[0]);
      } else if (trimmedQuery) {
        handleTriggerShowMore();
      }
    }
  };

  const activeLinkLabel =
    hasSearchedQuery === trimmedQuery ? detectedLinkDomain : localDetectedLink;
  const showDropdown = isOpen && trimmedQuery.length > 0;

  return (
    <div
      ref={containerRef}
      className="hidden md:block relative w-full max-w-[240px] lg:max-w-[280px] mx-2"
    >
      {/* Compact Half-Width Quick Search Input */}
      <div className="relative flex items-center rounded-xl bg-petrol-800/95 hover:bg-petrol-800 focus-within:bg-petrol-900 border border-petrol-500/70 focus-within:border-lemon-400 focus-within:ring-2 focus-within:ring-lemon-400/25 transition-all duration-150">
        <div className="pl-2.5 pr-1.5 flex items-center pointer-events-none shrink-0">
          {isLoading ? (
            <Loader2 className="h-3.5 w-3.5 text-lemon-300 animate-spin" />
          ) : activeLinkLabel ? (
            <Link2 className="h-3.5 w-3.5 text-lemon-300" />
          ) : (
            <Search className="h-3.5 w-3.5 text-lemon-300" />
          )}
        </div>

        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onFocus={() => {
            if (trimmedQuery) setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Search company or link..."
          aria-label="Quick search company by name, domain, or website link"
          aria-expanded={showDropdown}
          aria-autocomplete="list"
          autoComplete="off"
          spellCheck={false}
          className="w-full min-w-0 bg-transparent py-1.5 sm:py-2 pr-1.5 text-xs sm:text-[13px] text-bone-50 placeholder:text-bone-200/60 focus:outline-none"
        />

        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setResults([]);
              setTotalMatches(0);
              setEffectiveQuery('');
              setDetectedLinkDomain(null);
              setIsOpen(false);
              inputRef.current?.focus();
            }}
            aria-label="Clear quick search"
            className="mr-1 p-1 rounded-lg text-bone-200/75 hover:text-bone-50 hover:bg-petrol-700/80 transition-colors cursor-pointer shrink-0"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : (
          <div className="hidden lg:flex items-center pr-2 pointer-events-none shrink-0">
            <kbd className="px-1.5 py-0.5 rounded bg-petrol-900/90 border border-petrol-600/80 font-mono text-[10px] font-semibold text-bone-200/80">
              ⌘K
            </kbd>
          </div>
        )}
      </div>

      {/* Creative 2x2 Floating Grid Dropdown (4 Matches + Show More) */}
      <AnimatePresence>
        {showDropdown && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.99 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            role="region"
            aria-label="Matching companies"
            className="fixed inset-x-3 top-[64px] sm:absolute sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:top-full sm:mt-2.5 sm:w-[580px] lg:w-[620px] max-w-[calc(100vw-24px)] rounded-2xl bg-bone-50 dark:bg-petrol-900 border border-bone-300 dark:border-petrol-700 shadow-2xl shadow-petrol-950/30 overflow-hidden z-50"
          >
            {/* Dropdown Header Strip */}
            <div className="px-4 py-2.5 bg-bone-100/90 dark:bg-petrol-950/75 border-b border-bone-300/80 dark:border-petrol-800 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                {activeLinkLabel || isSocialCompanyLink ? (
                  <Link2 className="h-3.5 w-3.5 text-petrol-700 dark:text-lemon-300 shrink-0" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5 text-petrol-700 dark:text-lemon-300 shrink-0" />
                )}
                <span className="text-xs font-semibold text-petrol-900 dark:text-bone-50 truncate">
                  {activeLinkLabel
                    ? `Link Detected · ${activeLinkLabel}`
                    : isSocialCompanyLink && effectiveQuery
                    ? `Company Link · ${effectiveQuery}`
                    : 'Quick Match'}
                </span>
                <span className="text-petrol-400 dark:text-petrol-600">·</span>
                <span className="text-xs font-mono tabular-nums text-petrol-600 dark:text-bone-200/80 truncate">
                  {isLoading
                    ? 'Searching...'
                    : `${totalMatches.toLocaleString()} ${
                        totalMatches === 1 ? 'company' : 'companies'
                      }`}
                </span>
              </div>

              <span className="hidden sm:inline text-[10px] font-mono uppercase tracking-wider text-petrol-500 dark:text-bone-200/60 shrink-0">
                Name · Domain · Link
              </span>
            </div>

            {/* Body: Loading Skeleton / 2x2 Results Grid / Empty State */}
            <div className="p-3">
              {isLoading && results.length === 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {[0, 1, 2, 3].map((idx) => (
                    <div
                      key={idx}
                      className="rounded-xl p-3 border border-bone-300/70 dark:border-petrol-800 bg-white/80 dark:bg-petrol-950/60 animate-pulse space-y-2.5"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-lg bg-bone-200 dark:bg-petrol-800 shrink-0" />
                        <div className="flex-1 space-y-1.5">
                          <div className="h-3.5 w-2/3 rounded bg-bone-200 dark:bg-petrol-800" />
                          <div className="h-3 w-1/2 rounded bg-bone-200 dark:bg-petrol-800" />
                        </div>
                      </div>
                      <div className="h-3 w-4/5 rounded bg-bone-200/80 dark:bg-petrol-800/80" />
                    </div>
                  ))}
                </div>
              ) : results.length > 0 ? (
                <div
                  className={`grid grid-cols-1 ${
                    results.length === 1 ? 'sm:grid-cols-1' : 'sm:grid-cols-2'
                  } gap-2.5`}
                >
                  {results.slice(0, 4).map((comp, index) => {
                    const isHighlighted = index === activeIndex;
                    const isExactLinkHit =
                      Boolean(activeLinkLabel) &&
                      Boolean(comp.domain) &&
                      comp.domain?.toLowerCase() === activeLinkLabel?.toLowerCase();
                    const compactIndustry = comp.industry
                      ? truncateIndustry20(comp.industry)
                      : '';
                    const locationLabel =
                      comp.location &&
                      comp.location !== 'Global' &&
                      comp.location !== 'Direct Link Match'
                        ? comp.location
                        : '';

                    return (
                      <button
                        key={comp.id || `${comp.slug}-${index}`}
                        type="button"
                        onMouseEnter={() => setActiveIndex(index)}
                        onClick={() => handlePickCompany(comp)}
                        className={`group relative text-left rounded-xl p-3 border transition-all duration-150 cursor-pointer overflow-hidden flex flex-col justify-between gap-2.5 ${
                          isHighlighted || isExactLinkHit
                            ? 'bg-white dark:bg-petrol-800/90 border-petrol-600 dark:border-lemon-400 shadow-md shadow-petrol-900/10'
                            : 'bg-white/95 dark:bg-petrol-950/75 border-bone-300/90 dark:border-petrol-800 hover:border-petrol-600 dark:hover:border-lemon-400/80 hover:shadow-sm'
                        }`}
                      >
                        {/* Signature Lemon Accent Rail */}
                        <span
                          aria-hidden="true"
                          className={`absolute inset-y-0 left-0 w-1 transition-colors duration-150 ${
                            isHighlighted || isExactLinkHit
                              ? 'bg-lemon-400'
                              : 'bg-transparent group-hover:bg-lemon-400'
                          }`}
                        />

                        <div className="flex items-start gap-2.5 min-w-0 pl-1">
                          <CompanyLogoAvatar
                            name={comp.name}
                            logoUrl={comp.logoUrl}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-1.5">
                              <div className="text-sm font-bold text-petrol-900 dark:text-bone-50 truncate leading-snug">
                                <HighlightMatch
                                  text={comp.name}
                                  query={effectiveQuery || trimmedQuery}
                                />
                              </div>
                              {isExactLinkHit && (
                                <span className="text-[10px] font-mono font-bold uppercase tracking-wide text-petrol-700 dark:text-lemon-300 shrink-0">
                                  Exact
                                </span>
                              )}
                            </div>
                            <div className="mt-0.5 flex items-center gap-1 text-xs font-mono text-petrol-600 dark:text-lemon-300 truncate">
                              <Globe className="h-3 w-3 shrink-0 opacity-75" />
                              <span className="truncate">
                                <HighlightMatch
                                  text={comp.domain || '—'}
                                  query={effectiveQuery || trimmedQuery}
                                />
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="pl-1 flex items-center justify-between gap-2 pt-1.5 border-t border-bone-200/80 dark:border-petrol-800/80">
                          <div className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-bone-200/75 truncate min-w-0">
                            {locationLabel ? (
                              <span className="inline-flex items-center gap-0.5 truncate">
                                <MapPin className="h-3 w-3 shrink-0 text-petrol-500 dark:text-bone-200/60" />
                                <span className="truncate">{locationLabel}</span>
                              </span>
                            ) : compactIndustry ? (
                              <span className="inline-flex items-center gap-0.5 truncate">
                                <Building2 className="h-3 w-3 shrink-0 text-petrol-500 dark:text-bone-200/60" />
                                <span className="truncate">{compactIndustry}</span>
                              </span>
                            ) : (
                              <span className="truncate">Worldwide Directory</span>
                            )}
                            {comp.employeeRange && (
                              <>
                                <span className="text-bone-300 dark:text-petrol-600 shrink-0">
                                  ·
                                </span>
                                <span className="font-mono tabular-nums shrink-0">
                                  {comp.employeeRange}
                                </span>
                              </>
                            )}
                          </div>

                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-petrol-700 dark:text-lemon-300 group-hover:translate-x-0.5 transition-transform shrink-0">
                            <Users className="h-3 w-3" />
                            <span>Emails</span>
                            <ArrowRight className="h-3 w-3" />
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="py-5 px-4 text-center space-y-2">
                  <p className="text-sm font-semibold text-petrol-900 dark:text-bone-50">
                    No matching companies found for &ldquo;{hasSearchedQuery || trimmedQuery}&rdquo;
                  </p>
                  <p className="text-xs text-slate-600 dark:text-bone-200/70">
                    Try a shorter company name, paste a website link, or click Show More to run the full directory filter.
                  </p>
                </div>
              )}
            </div>

            {/* Footer with Show More Button */}
            <div className="px-3.5 py-2.5 bg-bone-100/95 dark:bg-petrol-950/90 border-t border-bone-300/80 dark:border-petrol-800 flex flex-wrap items-center justify-between gap-2.5">
              <div className="text-xs text-slate-600 dark:text-bone-200/75 font-mono tabular-nums">
                {results.length > 0
                  ? `Showing ${Math.min(4, results.length)} of ${totalMatches.toLocaleString()} matching`
                  : `Filter directory for "${effectiveQuery || trimmedQuery}"`}
              </div>

              <button
                type="button"
                onClick={handleTriggerShowMore}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold bg-lemon-400 hover:bg-lemon-300 text-petrol-950 shadow-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span>Show More</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
