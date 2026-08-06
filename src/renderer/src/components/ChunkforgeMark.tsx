import type { JSX } from 'react'

interface ChunkforgeMarkProps {
  size?: number
  className?: string
}

// Isometric voxel "chunk" with a forge spark cut into the top face — reads as
// both a piece of Minecraft world and a mark being struck on an anvil.
export function ChunkforgeMark({ size = 28, className }: ChunkforgeMarkProps): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M24 3 L44 14.5 V33.5 L24 45 L4 33.5 V14.5 Z" fill="#1B1B1F" />
      <path d="M24 3 L44 14.5 L24 26 L4 14.5 Z" fill="#F2A87C" />
      <path d="M24 26 L44 14.5 V33.5 L24 45 Z" fill="#CF4718" />
      <path d="M24 26 L4 14.5 V33.5 L24 45 Z" fill="#E8793A" />
      <path
        d="M27 9 L18 21 L23 21 L20 30 L31 17 L25.5 17 Z"
        fill="#FCE3D2"
        stroke="#1B1B1F"
        strokeWidth="0.75"
        strokeLinejoin="round"
      />
    </svg>
  )
}
