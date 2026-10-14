import { createFileRoute, redirect } from '@tanstack/react-router'

// Legacy URL: /user/<slug> permanently redirects to /members/<slug>.
export const Route = createFileRoute('/user/$slug')({
  beforeLoad: ({ params, search }) => {
    throw redirect({
      to: '/members/$slug',
      params: { slug: params.slug },
      search,
      statusCode: 301,
      replace: true,
    })
  },
})
