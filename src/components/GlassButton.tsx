import type { ReactNode } from 'react';
import { ArrowRight } from '@phosphor-icons/react';
import { onLinkClick } from '../lib/router';
import './GlassButton.css';

type Common = { variant?: 'primary' | 'secondary'; size?: 'md' | 'sm'; arrow?: boolean; icon?: ReactNode; children: ReactNode; className?: string };
type AsLink = Common & { href: string; external?: boolean; onClick?: never; type?: never };
type AsButton = Common & { href?: never; external?: never; onClick: () => void; type?: 'button' | 'submit' };

/** One button system for the site: primary = emerald→mint gradient pill, secondary = glass pill. */
export function GlassButton(props: AsLink | AsButton) {
  const { variant = 'primary', size = 'md', arrow = false, icon, children, className = '' } = props;
  const cls = `gbtn gbtn--${variant} gbtn--${size} ${className}`.trim();
  const inner = (
    <>
      {icon && <span className="gbtn__icon" aria-hidden="true">{icon}</span>}
      <span>{children}</span>
      {arrow && <ArrowRight className="gbtn__arrow" size={18} weight="bold" aria-hidden="true" />}
    </>
  );
  if ('href' in props && props.href) {
    return props.external ? (
      <a className={cls} href={props.href} target="_blank" rel="noopener noreferrer">
        {inner}
      </a>
    ) : (
      <a className={cls} href={props.href} onClick={onLinkClick}>
        {inner}
      </a>
    );
  }
  return (
    <button className={cls} type={props.type ?? 'button'} onClick={props.onClick}>
      {inner}
    </button>
  );
}
