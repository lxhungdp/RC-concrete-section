import type { SVGProps } from 'react'

type IconProps = Pick<SVGProps<SVGSVGElement>, 'className'> & { size?: number }

/** React adaptation of Frame jscad's shared decorative action vectors. */
export function AddIcon({ className = '', size = 12 }: IconProps) {
  return <svg className={`ws-add-icon ${className}`} width={size} height={size} viewBox="0 0 12 12"
    fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" aria-hidden="true" focusable="false">
    <path d="M6 1.5v9M1.5 6h9" />
  </svg>
}

export function TransferIcon({ direction = 'import', className = '', size = 14 }: IconProps & {
  direction?: 'import' | 'export'
}) {
  return <svg className={`ws-transfer-icon ${className}`} width={size} height={size} viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true" focusable="false">
    <path d={direction === 'export' ? 'M12 15V3m-4 4 4-4 4 4' : 'M12 3v12m-4-4 4 4 4-4'} />
    <path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
  </svg>
}
