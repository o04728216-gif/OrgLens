import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Search, X } from 'lucide-react';
import type { SidebarFiltersState } from '../../types';
import { CONTINENTS_CATALOG } from '../../utils/geographyAndRevenue';
import { SidebarAccordionCard } from './SidebarAccordionCard';
import { countEnteredTerms, type AccordionSectionId } from './sidebarConstants';

interface LocationsFilterGroupProps {
  filters: SidebarFiltersState;
  sectionCounts: Record<AccordionSectionId, number>;
  sidebarSearch: string;
  isSectionOpen: (id: AccordionSectionId) => boolean;
  onToggleSection: (id: AccordionSectionId) => void;
  onChangeFilters: (
    updater: (prev: SidebarFiltersState) => SidebarFiltersState
  ) => void;
  onActivateCompanyDirectory: () => void;
}

export const LocationsFilterGroup: React.FC<LocationsFilterGroupProps> = ({
  filters,
  sectionCounts,
  sidebarSearch,
  isSectionOpen,
  onToggleSection,
  onChangeFilters,
  onActivateCompanyDirectory,
}) => {
  const [locationTreeSearch, setLocationTreeSearch] = useState('');
  const [expandedContinents, setExpandedContinents] = useState<
    Record<string, boolean>
  >({
    'north-america': false,
    europe: false,
    asia: false,
    'south-america': false,
    africa: false,
    oceania: false,
    antarctica: false,
  });

  const effectiveLocationSearch = (locationTreeSearch || sidebarSearch)
    .trim()
    .toLowerCase();

  const filteredContinentsTree = useMemo(() => {
    const q = effectiveLocationSearch;
    if (!q) return CONTINENTS_CATALOG;

    return CONTINENTS_CATALOG.map((continent) => {
      const continentMatches = continent.name.toLowerCase().includes(q);
      const matchingCountries = continentMatches
        ? continent.countries
        : continent.countries.filter(
            (c) =>
              c.name.toLowerCase().includes(q) ||
              (c.aliases && c.aliases.some((a) => a.toLowerCase().includes(q)))
          );
      return {
        ...continent,
        countries: matchingCountries,
      };
    }).filter((c) => c.countries.length > 0);
  }, [effectiveLocationSearch]);

  const qSidebar = sidebarSearch.trim().toLowerCase();
  const visible =
    !qSidebar ||
    'locations continents countries north america europe asia south america africa oceania antarctica city state'.includes(
      qSidebar
    ) ||
    filteredContinentsTree.length > 0;

  if (!visible) return null;

  const toggleContinentDropdown = (continentId: string) => {
    setExpandedContinents((prev) => ({
      ...prev,
      [continentId]: !prev[continentId],
    }));
  };

  const handleToggleContinentCheckbox = (continentName: string) => {
    onChangeFilters((prev) => {
      const isSelected = prev.selectedContinents.includes(continentName);
      return {
        ...prev,
        selectedContinents: isSelected
          ? prev.selectedContinents.filter((c) => c !== continentName)
          : [...prev.selectedContinents, continentName],
      };
    });
    onActivateCompanyDirectory();
  };

  const handleToggleCountryCheckbox = (countryName: string) => {
    onChangeFilters((prev) => {
      const isSelected = prev.selectedCountries.includes(countryName);
      return {
        ...prev,
        selectedCountries: isSelected
          ? prev.selectedCountries.filter((c) => c !== countryName)
          : [...prev.selectedCountries, countryName],
      };
    });
    onActivateCompanyDirectory();
  };

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-bold tracking-tight text-slate-900 dark:text-white px-0.5">
        Locations
      </h3>

      <SidebarAccordionCard
        id="locations"
        label="Continents & Countries"
        selectedCount={sectionCounts.locations}
        totalOptions={CONTINENTS_CATALOG.reduce(
          (sum, c) => sum + c.countries.length,
          0
        )}
        opened={isSectionOpen('locations')}
        onToggle={onToggleSection}
      >
        <div className="px-3.5 pb-3.5 pt-2.5 space-y-2.5 border-t border-slate-200/60 dark:border-slate-800/60">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={locationTreeSearch}
              onChange={(e) => setLocationTreeSearch(e.target.value)}
              placeholder="Search continent or country..."
              aria-label="Search continent or country"
              className="w-full pl-8 pr-7 py-1.5 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
            />
            {locationTreeSearch && (
              <button
                type="button"
                onClick={() => setLocationTreeSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {(filters.selectedContinents.length > 0 ||
            filters.selectedCountries.length > 0) && (
            <div className="flex flex-wrap gap-1.5">
              {filters.selectedContinents.map((cont) => (
                <button
                  key={`cont-${cont}`}
                  type="button"
                  onClick={() => handleToggleContinentCheckbox(cont)}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-sky-500/15 text-sky-800 dark:text-sky-200 border border-sky-500/30 hover:bg-sky-500/25 transition-colors cursor-pointer"
                >
                  <span>{cont}</span>
                  <X className="h-3 w-3 shrink-0" />
                </button>
              ))}
              {filters.selectedCountries.map((ctry) => (
                <button
                  key={`ctry-${ctry}`}
                  type="button"
                  onClick={() => handleToggleCountryCheckbox(ctry)}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-sky-500/15 text-sky-800 dark:text-sky-200 border border-sky-500/30 hover:bg-sky-500/25 transition-colors cursor-pointer"
                >
                  <span>{ctry}</span>
                  <X className="h-3 w-3 shrink-0" />
                </button>
              ))}
            </div>
          )}

          <div className="max-h-64 overflow-y-auto overscroll-contain rounded-lg border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-1.5 space-y-1">
            {filteredContinentsTree.map((continent) => {
              const isExpanded =
                Boolean(effectiveLocationSearch) ||
                Boolean(expandedContinents[continent.id]);
              const continentChecked = filters.selectedContinents.includes(
                continent.name
              );
              const checkedCountriesCount = continentChecked
                ? continent.countries.length
                : continent.countries.filter((c) =>
                    filters.selectedCountries.includes(c.name)
                  ).length;

              return (
                <div key={continent.id} className="rounded-md">
                  <div className="flex items-center justify-between gap-1.5 px-1.5 py-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800/70 transition-colors">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <button
                        type="button"
                        onClick={() => toggleContinentDropdown(continent.id)}
                        aria-label={`${
                          isExpanded ? 'Collapse' : 'Expand'
                        } ${continent.name} countries`}
                        className="p-0.5 rounded text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white cursor-pointer shrink-0"
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5" />
                        )}
                      </button>

                      <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-100 cursor-pointer truncate">
                        <input
                          type="checkbox"
                          checked={continentChecked}
                          onChange={() =>
                            handleToggleContinentCheckbox(continent.name)
                          }
                          className="h-3.5 w-3.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500 shrink-0"
                        />
                        <span className="truncate">{continent.name}</span>
                      </label>
                    </div>

                    <button
                      type="button"
                      onClick={() => toggleContinentDropdown(continent.id)}
                      className={`font-mono tabular-nums text-[11px] cursor-pointer shrink-0 ${
                        checkedCountriesCount > 0
                          ? 'font-semibold text-sky-600 dark:text-sky-400'
                          : 'text-slate-400 dark:text-slate-500 hover:text-sky-600 dark:hover:text-sky-400'
                      }`}
                    >
                      {checkedCountriesCount > 0
                        ? `${checkedCountriesCount}/${continent.countries.length}`
                        : continent.countries.length}
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="pl-6 pr-2 py-1 space-y-1 border-l border-slate-200/80 dark:border-slate-800 ml-3 my-0.5">
                      {continent.countries.map((country) => {
                        const cChecked =
                          continentChecked ||
                          filters.selectedCountries.includes(country.name);
                        return (
                          <label
                            key={country.name}
                            className="flex items-center gap-2 py-0.5 text-xs text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={cChecked}
                              onChange={() => {
                                if (continentChecked) {
                                  onChangeFilters((prev) => ({
                                    ...prev,
                                    selectedContinents:
                                      prev.selectedContinents.filter(
                                        (c) => c !== continent.name
                                      ),
                                    selectedCountries: Array.from(
                                      new Set([
                                        ...prev.selectedCountries,
                                        ...continent.countries
                                          .map((ct) => ct.name)
                                          .filter((n) => n !== country.name),
                                      ])
                                    ),
                                  }));
                                  onActivateCompanyDirectory();
                                } else {
                                  handleToggleCountryCheckbox(country.name);
                                }
                              }}
                              className="h-3.5 w-3.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500 shrink-0"
                            />
                            <span className="truncate">{country.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Specific City or State
              </label>
              {countEnteredTerms(filters.locationQuery) > 0 && (
                <span className="font-mono tabular-nums text-[11px] font-semibold text-sky-600 dark:text-sky-400">
                  {countEnteredTerms(filters.locationQuery)}
                </span>
              )}
            </div>
            <input
              type="text"
              value={filters.locationQuery}
              onChange={(e) => {
                onChangeFilters((prev) => ({
                  ...prev,
                  locationQuery: e.target.value,
                }));
                if (e.target.value.trim()) {
                  onActivateCompanyDirectory();
                }
              }}
              placeholder="e.g., Austin, London, Lagos, Tokyo..."
              className="w-full px-3 py-1.5 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
            />
          </div>
        </div>
      </SidebarAccordionCard>
    </div>
  );
};
