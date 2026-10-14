import { THUMBNAIL_FALLBACK_SRC } from '#/components/Thumbnail.tsx'

export default function MiniVideo({
  videoName = 'Unknown video',
  thumbnailUrl = THUMBNAIL_FALLBACK_SRC,
}: {
  videoName?: string
  thumbnailUrl?: string
}) {
  return (
    <div className="relative w-full max-w-[292px] max-h-[165px] shadow-[0px_2px_6px_0_rgba(0,0,0,0.25)] mb-2">
      <img
        alt={videoName}
        src={thumbnailUrl}
        className="block w-full h-auto max-h-[165px] object-cover"
      />
      <div
        className={
          'absolute bottom-0 left-0 right-0 flex items-center gap-2 bg-(--mini-video-bg) py-1 px-2 text-(--bss-text-secondary) min-w-0'
        }
      >
        <svg
          viewBox="0 0 100 100"
          width="1.2em"
          height="1.2em"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M50 15 L85 85 L15 85 Z"
            fill="var(--mini-video-triangle)"
            transform="rotate(90 50 50)"
          />
        </svg>
        <span
          title={videoName}
          aria-label={videoName}
          className="flex-1 min-w-0 truncate"
        >
          {videoName}
        </span>
      </div>
    </div>
  )
}
