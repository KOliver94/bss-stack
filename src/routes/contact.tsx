import { createFileRoute } from '@tanstack/react-router'
import {
  ArrowRight,
  Building2,
  Mail,
  MapPin,
  MessageCircle,
  Users,
  Video,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

const CONTACT_EMAIL = 'info@bsstudio.hu'

const MAP_EMBED_URL = `https://www.google.com/maps?q=${encodeURIComponent(
  'Budavári Schönherz Stúdió, Budapest, Irinyi József u. 42, 1117',
)}&output=embed`

interface ContactOption {
  icon: LucideIcon
  title: string
  description: string
  cta: string
  href: string
  email?: string
}

const CONTACT_OPTIONS: ContactOption[] = [
  {
    icon: Video,
    title: 'Videós felkérés',
    description:
      'Rendezvényt szervezel, és szeretnéd, hogy a BSS videót készítsen róla vagy élőben közvetítse?',
    cta: 'Felkérés leadása',
    href: 'https://felkeres.bsstudio.hu/',
  },
  {
    icon: MessageCircle,
    title: 'Általános kérdés',
    description:
      'Tanfolyam, csatlakozás, együttműködés vagy bármilyen más BSS-sel kapcsolatos kérdés esetén írj nekünk.',
    cta: 'E-mail írása',
    href: `mailto:${CONTACT_EMAIL}`,
    email: CONTACT_EMAIL,
  },
  {
    icon: Users,
    title: 'Csatlakoznál hozzánk?',
    description:
      'Érdekel a stúdió világa? Ismerd meg tanfolyamunkat, és tudd meg, hogyan lehetsz a stúdió tagja!',
    cta: 'Tanfolyam megtekintése',
    href: 'https://tanfolyam.bsstudio.hu/',
  },
]

export const Route = createFileRoute('/contact')({
  component: ContactPage,
})

function ContactPage() {
  return (
    <main className="site-width my-[4dvh]">
      <title>Kapcsolat | BSS</title>
      <h1 className="text-3xl font-bold text-(--bss-text)">Kapcsolat</h1>
      <p className="mt-2 text-lg text-(--bss-text-secondary)">
        Keress minket – miben segíthetünk?
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        {CONTACT_OPTIONS.map((option) => (
          <ContactCard key={option.title} option={option} />
        ))}
      </div>

      <section
        aria-labelledby="contact-location"
        className="card-surface mt-4 grid grid-cols-1 gap-6 p-6 shadow-[0_2px_6px_rgba(0,0,0,0.25)] lg:grid-cols-[2fr_3fr]"
      >
        <div>
          <div className="flex items-center gap-3">
            <MapPin
              aria-hidden="true"
              className="size-8 shrink-0 text-(--orange)"
            />
            <h2
              id="contact-location"
              className="text-2xl font-bold text-(--card-title)"
            >
              Hol találsz minket?
            </h2>
          </div>
          <p className="mt-2 text-(--card-text)">
            Stúdiónk a Schönherz Kollégiumban található.
          </p>
          <div className="mt-6 flex gap-3">
            <Building2
              aria-hidden="true"
              className="size-6 shrink-0 text-(--card-title)"
            />
            <address className="text-(--card-text) not-italic">
              <span className="block font-bold text-(--bss-text-secondary)">
                Budavári Schönherz Stúdió
              </span>
              1117 Budapest
              <br />
              Irinyi József utca 42.
              <br />
              Schönherz Kollégium
              <br />
              I. emelet 106.
            </address>
          </div>
        </div>
        <iframe
          src={MAP_EMBED_URL}
          title="A Budavári Schönherz Stúdió helye a térképen"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          className="aspect-video h-full min-h-64 w-full border-0"
        />
      </section>
    </main>
  )
}

function ContactCard({ option }: { option: ContactOption }) {
  const Icon = option.icon
  const external = option.href.startsWith('http')
  return (
    <article className="card-surface flex flex-col p-6 shadow-[0_2px_6px_rgba(0,0,0,0.25)]">
      <Icon aria-hidden="true" className="size-9 text-(--orange)" />
      <h2 className="mt-4 text-xl font-bold text-(--card-title)">
        {option.title}
      </h2>
      <p className="mt-2 text-(--card-text)">{option.description}</p>
      {option.email !== undefined && (
        <p className="mt-3 flex items-center gap-2 font-semibold text-(--bss-text-secondary)">
          <Mail aria-hidden="true" className="size-5 text-(--orange)" />
          {option.email}
        </p>
      )}
      {/* Pin the buttons to the card bottom so they line up across the row. */}
      <div className="mt-auto pt-6">
        <a
          href={option.href}
          {...(external
            ? { target: '_blank', rel: 'noopener noreferrer' }
            : {})}
          className="solid-btn flex items-center justify-between gap-2 bg-(--orange) px-4 py-2.5 font-bold text-white"
        >
          {option.cta}
          <ArrowRight aria-hidden="true" className="size-5" />
        </a>
      </div>
    </article>
  )
}
