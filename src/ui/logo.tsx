import { LOCKUP_FA, SYMBOL } from '../brand/assets.ts';

/**
 * Brand logo — DS *Logo*: the delivered SVGs in `public/brand/logo/`, never
 * redrawn, recoloured or stretched. Only the height is set (`.hz-logo` sizes:
 * header 36, mobile 30, ops 26, symbol 32); a custom `height` is honoured for
 * places outside the shells.
 */
export type LogoSize = 'header' | 'mobile' | 'responsive' | 'ops' | 'symbol';

const SIZE_CLASS: Record<LogoSize, string> = {
  header: 'hz-logo',
  mobile: 'hz-logo hz-logo--mobile',
  responsive: 'hz-logo hz-logo--responsive',
  ops: 'hz-logo hz-logo--ops',
  symbol: 'hz-logo hz-logo--symbol',
};

export function Logo({
  variant = 'lockup',
  size,
  height,
  className = '',
}: {
  variant?: 'lockup' | 'symbol';
  size?: LogoSize;
  height?: number;
  className?: string;
}) {
  const asset = variant === 'symbol' ? SYMBOL : LOCKUP_FA;
  const resolved = size ?? (variant === 'symbol' ? 'symbol' : 'mobile');
  const style = height === undefined ? undefined : { height, width: 'auto' };
  return (
    <span className={[SIZE_CLASS[resolved], className].join(' ')}>
      <img src={asset.path} alt="همزیست" width={asset.width} height={asset.height} style={style} />
    </span>
  );
}
