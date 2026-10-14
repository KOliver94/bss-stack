import { createFileRoute, redirect } from '@tanstack/react-router'

// Legacy URL: /video/<slug> permanently redirects to /videos/<slug>.
export const Route = createFileRoute('/video/$slug')({
  beforeLoad: ({ params, search }) => {
    throw redirect({
      to: '/videos/$slug',
      params: { slug: params.slug },
      search,
      statusCode: 301,
      replace: true,
    })
  },
})
