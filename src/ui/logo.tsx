import Image from 'next/image';

/**
 * Brand logo.
 *
 * Both files are official renders exported from the Design System file
 * (2GMJPgnnenGnr1zBN2yH5h): the Persian horizontal lockup `14:2` and the master
 * symbol `4:21`. They are used as delivered — never redrawn, recoloured,
 * stretched or cropped. Aspect ratio is preserved by giving both dimensions.
 */
export function Logo({ variant = 'lockup', height = 28 }: { variant?: 'lockup' | 'symbol'; height?: number }) {
  if (variant === 'symbol') {
    const width = Math.round((height * 144) / 162);
    return (
      <Image src="/brand/logo-symbol.png" alt="همزیست" width={width} height={height} priority />
    );
  }
  const width = Math.round((height * 334) / 72);
  return <Image src="/brand/logo-fa-horizontal.png" alt="همزیست" width={width} height={height} priority />;
}
