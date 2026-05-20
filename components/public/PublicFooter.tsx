import React from 'react';
import { ChevronRight } from 'lucide-react';
import type { LandingConfig } from '../../LandingConfigContext';

interface PublicFooterProps {
  footer: LandingConfig['footer'];
  rightCaption: string;
  leadText: string;
}

export const PublicFooter: React.FC<PublicFooterProps> = ({ footer, rightCaption, leadText }) => {
  return (
    <footer id="contact" className="bg-white dark:bg-black border-t border-psa-line dark:border-zinc-800 px-4 sm:px-8 public-footer-y">
      <div className="public-container grid grid-cols-1 md:grid-cols-4 gap-8">
        <div>
          <div className="flex items-center gap-3">
            <img src="/PSA.webp" alt="PSA Logo" className="w-14 h-14 object-contain" />
            <div>
              <p className="font-serif text-lg text-psa-navy font-bold">PSA Aurora</p>
              <p className="text-xs text-slate-600 dark:text-slate-300 uppercase tracking-[0.12em]">Provincial Statistics Office</p>
            </div>
          </div>
          <p className="mt-4 text-sm text-slate-700 dark:text-slate-300 max-w-xs">{leadText}</p>
        </div>

        <div>
          <h4 className="text-sm font-bold uppercase tracking-[0.14em] text-psa-navy mb-3">Related Links</h4>
          <ul className="space-y-2.5">
            {footer.relatedLinks.map((link) => (
              <li key={link.label}>
                <a href={link.url} className="text-sm text-slate-700 dark:text-slate-300 hover:text-psa-blue dark:hover:text-blue-300 inline-flex items-center gap-1.5">
                  {link.label} <ChevronRight className="w-3.5 h-3.5" />
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className="text-sm font-bold uppercase tracking-[0.14em] text-psa-navy mb-3">About PSO Aurora</h4>
          <ul className="space-y-2.5">
            {footer.aboutLinks.map((link) => (
              <li key={link.label}>
                <a href={link.url} className="text-sm text-slate-700 dark:text-slate-300 hover:text-psa-blue dark:hover:text-blue-300 inline-flex items-center gap-1.5">
                  {link.label} <ChevronRight className="w-3.5 h-3.5" />
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className="text-sm font-bold uppercase tracking-[0.14em] text-psa-navy mb-3">Contact Information</h4>
          <ul className="space-y-2.5">
            {footer.contactInfo.map((item) => (
              <li key={item.label} className="text-sm">
                <span className="font-semibold text-slate-800 dark:text-slate-100">{item.label}: </span>
                <span className="text-slate-700 dark:text-slate-300">{item.value}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="public-container mt-8 pt-5 border-t border-psa-line dark:border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
        <p>{footer.copyright}</p>
        <p className="inline-flex items-center gap-2">
          <span className="w-8 h-0.5 bg-psa-blue" /> {rightCaption} <span className="w-8 h-0.5 bg-psa-red" />
        </p>
      </div>
    </footer>
  );
};
